"""Per-key health and the rules for choosing, resting and retiring keys.

States:  healthy · cooldown (rate limited / transient errors) · quota_exhausted (until it should reset)
         · quarantined (rejected credentials; not retried until re-checked)
Only fingerprints and masks are stored; the key itself never leaves the process environment.
"""
from datetime import datetime, timedelta, timezone

from integrations.secrets import keys_for, fingerprint, mask

# Failure classes reported by provider adapters.
RATE_LIMITED, QUOTA, AUTH, TRANSIENT, BAD_REQUEST = "rate_limited", "quota_exhausted", "auth_error", "transient", "bad_request"
MODEL = "model_unavailable"  # this model can't be used (retired, restricted, overloaded upstream); the key is fine


def now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat() if dt else ""


class MongoStore:
    """Key state in MongoDB, so health survives restarts and is shared by every worker."""

    def __init__(self):
        from database import db
        self.coll = db.api_key_state

    async def get(self, provider, key_id):
        return await self.coll.find_one({"provider": provider, "key_id": key_id}, {"_id": 0})

    async def put(self, provider, key_id, fields):
        await self.coll.update_one({"provider": provider, "key_id": key_id}, {"$set": fields}, upsert=True)

    async def all(self):
        return await self.coll.find({}, {"_id": 0}).to_list(500)


class MemoryStore:
    """Same interface, in memory (tests)."""

    def __init__(self):
        self.rows = {}

    async def get(self, provider, key_id):
        return self.rows.get((provider, key_id))

    async def put(self, provider, key_id, fields):
        self.rows.setdefault((provider, key_id), {"provider": provider, "key_id": key_id}).update(fields)

    async def all(self):
        return list(self.rows.values())


_store = None


def store():
    global _store
    if _store is None:
        _store = MongoStore()
    return _store


def use_store(s):
    global _store
    _store = s


def _parse(ts):
    try:
        return datetime.fromisoformat(ts) if ts else None
    except ValueError:
        return None


async def state_of(provider, key):
    kid = fingerprint(key)
    row = await store().get(provider, kid) or {}
    return {"provider": provider, "key_id": kid, "masked": mask(key), "status": "healthy", "consecutive_failures": 0,
            "failures": 0, "successes": 0, "requests": 0, "latency_ms_total": 0, **row}


def available(state, at=None):
    """Can this key be tried right now?"""
    at = at or now()
    if state["status"] == "quarantined":
        return False
    until = _parse(state.get("cooldown_until"))
    return not until or until <= at


async def candidates(provider):
    """Usable keys for a provider: healthiest first, then least recently used (spreads load)."""
    rows = []
    for key in keys_for(provider):
        st = await state_of(provider, key)
        if available(st):
            rows.append((st.get("consecutive_failures", 0), st.get("last_used_at", ""), key, st))
    rows.sort(key=lambda r: (r[0], r[1]))
    return [(r[2], r[3]) for r in rows]


def _next_utc_midnight(at):
    return (at + timedelta(days=1)).replace(hour=0, minute=5, second=0, microsecond=0)


async def record_success(provider, key, latency_ms):
    st = await state_of(provider, key)
    await store().put(provider, st["key_id"], {
        "masked": st["masked"], "status": "healthy", "consecutive_failures": 0, "cooldown_until": "",
        "last_success_at": iso(now()), "last_used_at": iso(now()), "requests": st["requests"] + 1,
        "successes": st["successes"] + 1, "latency_ms_total": st["latency_ms_total"] + int(latency_ms)})


async def record_failure(provider, key, kind, message="", retry_after=None):
    """Rest or retire a key according to what went wrong. Repeated failures rest it for longer."""
    st = await state_of(provider, key)
    at = now()
    n = st.get("consecutive_failures", 0) + 1
    fields = {"masked": st["masked"], "consecutive_failures": n, "failures": st["failures"] + 1, "requests": st["requests"] + 1,
              "last_failure_at": iso(at), "last_error_class": kind, "last_error": message[:300], "last_used_at": iso(at)}
    if kind == RATE_LIMITED:
        wait = retry_after if retry_after else min(30 * 2 ** (n - 1), 900)  # 30s, 60s, 2m ... capped at 15m
        fields.update({"status": "cooldown", "cooldown_until": iso(at + timedelta(seconds=wait))})
    elif kind == QUOTA:
        # Provider quotas usually reset daily; try again then (or after 6h if that's sooner and it has never reset).
        until = min(_next_utc_midnight(at), at + timedelta(hours=6)) if n == 1 else _next_utc_midnight(at)
        fields.update({"status": "quota_exhausted", "cooldown_until": iso(until)})
    elif kind == AUTH:
        fields.update({"status": "quarantined", "cooldown_until": ""})
    elif kind == TRANSIENT:
        wait = min(15 * 2 ** (n - 1), 600) if n >= 2 else 0  # one blip is tolerated; repeated ones back off
        fields.update({"status": "cooldown" if wait else st.get("status", "healthy"), "cooldown_until": iso(at + timedelta(seconds=wait)) if wait else ""})
    await store().put(provider, st["key_id"], fields)
    return fields


async def release(provider, key):
    """Bring a quarantined or resting key back (after a successful health check, or by an administrator)."""
    st = await state_of(provider, key)
    await store().put(provider, st["key_id"], {"masked": st["masked"], "status": "healthy", "cooldown_until": "", "consecutive_failures": 0})


async def provider_status(provider):
    """One word for a provider, from its keys: healthy, degraded, rate_limited, quota_exhausted, auth_error, unavailable, not_configured."""
    keys = keys_for(provider)
    if not keys:
        return "not_configured"
    states = [await state_of(provider, k) for k in keys]
    usable = [s for s in states if available(s)]
    if usable:
        return "healthy" if all(s["status"] == "healthy" and not s.get("consecutive_failures") for s in states) else "degraded"
    kinds = {s["status"] for s in states}
    if kinds == {"quarantined"}:
        return "auth_error"
    if "quota_exhausted" in kinds:
        return "quota_exhausted"
    if "cooldown" in kinds and states[0].get("last_error_class") == RATE_LIMITED:
        return "rate_limited"
    return "unavailable"
