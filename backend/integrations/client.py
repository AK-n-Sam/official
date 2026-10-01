"""generate_text(): the one way the app asks an AI provider for text.

For each provider in the configured order, take its healthiest key and call it:
  * success                -> record it, cache the answer (when asked to), return
  * temporary error        -> retry the same key once after a short pause (generation is read-only, so
                              retrying cannot duplicate a business operation), then rest the key
  * rate limited           -> rest the key (Retry-After honoured) and move to the next key
  * quota exhausted        -> park the key until its quota should reset; next key
  * rejected credentials   -> quarantine the key; next key
  * model unavailable      -> same key, next model (retired, restricted or overloaded models don't blame the key)
  * request rejected       -> skip to the next provider (no key is blamed)
If every key of every provider is unavailable, raise AIUnavailable so the caller can fall back or defer.
"""
import asyncio
import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from integrations import providers
from integrations.keypool import candidates, record_success, record_failure, release, state_of, provider_status, available, \
    BAD_REQUEST, TRANSIENT, MODEL
from integrations.secrets import keys_for, redact

# Cheapest dependable first: Gemini Flash-Lite, then OpenRouter's free models, then OpenAI. The administrator can reorder.
DEFAULT_CONFIG = {"_id": "ai", "enabled": True, "provider_order": ["gemini", "openrouter", "openai"], "disabled": [], "models": {},
                  "timeout_s": 30, "deadline_s": 90}


class AIUnavailable(Exception):
    """No provider could answer right now. `reasons` lists what each one said (secrets removed)."""

    def __init__(self, message, reasons=None):
        super().__init__(message)
        self.reasons = reasons or []


class AIRequestError(Exception):
    pass


@dataclass
class AIResult:
    text: str
    provider: str
    model: str
    key: str  # masked
    cached: bool = False
    latency_ms: int = 0
    attempts: list = field(default_factory=list)

    def json(self):
        """Parse a JSON answer, tolerating code fences around it."""
        t = self.text.strip()
        if t.startswith("```"):
            t = t.strip("`")
            t = t[t.find("{"):] if "{" in t else t
        start, end = t.find("{"), t.rfind("}")
        return json.loads(t[start:end + 1] if start >= 0 else t)


# ---- pluggable persistence (MongoDB in the app, in-memory in tests) ----
class _Hooks:
    load_config = None
    telemetry = None
    cache_get = None
    cache_put = None


hooks = _Hooks()
_config_cache = {"at": 0, "value": None}


async def get_config(fresh=False):
    if hooks.load_config is None:
        from database import db

        async def _load():
            return await db.system_config.find_one({"_id": "ai"}) or {}
        hooks.load_config = _load
    if fresh or not _config_cache["value"] or time.monotonic() - _config_cache["at"] > 15:
        stored = await hooks.load_config() or {}
        _config_cache.update({"at": time.monotonic(), "value": {**DEFAULT_CONFIG, **{k: v for k, v in stored.items() if v is not None}}})
    return _config_cache["value"]


def forget_config():
    _config_cache.update({"at": 0, "value": None})


async def _telemetry(row):
    if hooks.telemetry is None:
        from database import db

        async def _write(r):
            await db.api_calls.insert_one({**r, "at": datetime.now(timezone.utc)})
        hooks.telemetry = _write
    try:
        await hooks.telemetry(row)
    except Exception:  # telemetry must never break a request
        pass


async def _cache_get(digest):
    if hooks.cache_get is None:
        from database import db

        async def _get(d):
            row = await db.ai_cache.find_one({"_id": d})
            return row if row and row["expires_at"].replace(tzinfo=timezone.utc) > datetime.now(timezone.utc) else None
        hooks.cache_get = _get
    try:
        return await hooks.cache_get(digest)
    except Exception:
        return None


async def _cache_put(digest, result, hours):
    if hooks.cache_put is None:
        from database import db

        async def _put(d, row):
            await db.ai_cache.replace_one({"_id": d}, {"_id": d, **row}, upsert=True)
        hooks.cache_put = _put
    try:
        await hooks.cache_put(digest, {"text": result.text, "provider": result.provider, "model": result.model,
                                       "expires_at": datetime.now(timezone.utc) + timedelta(hours=hours)})
    except Exception:
        pass


async def generate_text(prompt, *, system="", purpose="general", org_id="", max_tokens=400, json_mode=False, cache_hours=0):
    cfg = await get_config()
    if not cfg.get("enabled", True):
        raise AIUnavailable("AI assistance is switched off")
    digest = hashlib.sha256(json.dumps([purpose, system, prompt, max_tokens, json_mode]).encode()).hexdigest()
    if cache_hours:
        hit = await _cache_get(digest)
        if hit:
            return AIResult(hit["text"], hit["provider"], hit["model"], "", cached=True)

    order = [p for p in cfg["provider_order"] if p in providers.PROVIDERS and p not in cfg.get("disabled", []) and keys_for(p)]
    if not order:
        raise AIUnavailable("No AI provider is configured")
    request_id = uuid.uuid4().hex[:12]
    deadline = time.monotonic() + cfg.get("deadline_s", 90)
    attempts, reasons = [], []

    for provider in order:
        keys = await candidates(provider)
        if not keys:
            reasons.append(f"{provider}: {await provider_status(provider)}")
            continue
        skip_provider = False
        for key, st in keys:
            models = providers.models_for(provider, (cfg.get("models") or {}).get(provider))
            mi, attempt = 0, 1
            while True:
                if mi >= len(models):
                    reasons.append(f"{provider}: none of its models is available")
                    skip_provider = True  # a model problem affects every key alike
                    break
                if time.monotonic() > deadline:
                    raise AIUnavailable("AI providers are too slow right now", reasons + ["deadline reached"])
                started = time.monotonic()
                try:
                    text, tokens, model = await providers.generate(provider, key, prompt, system, max_tokens, json_mode,
                                                                   cfg.get("timeout_s", 30), models[mi])
                except providers.ProviderError as e:
                    ms = int((time.monotonic() - started) * 1000)
                    attempts.append({"provider": provider, "key": st["masked"], "model": models[mi], "result": e.kind})
                    await _telemetry({"request_id": request_id, "provider": provider, "key_id": st["key_id"], "masked": st["masked"],
                                      "purpose": purpose, "org_id": org_id, "ok": False, "kind": e.kind, "status": e.status, "model": models[mi],
                                      "latency_ms": ms, "attempt": len(attempts), "error": redact(e.message)})
                    if e.kind == MODEL:
                        mi, attempt = mi + 1, 1
                        continue  # same key, next model
                    if e.kind == BAD_REQUEST:
                        reasons.append(f"{provider}: rejected the request ({e.message[:120]})")
                        skip_provider = True
                        break
                    if e.kind == TRANSIENT and attempt == 1:
                        await asyncio.sleep(0.5)
                        attempt = 2
                        continue  # one quick retry on the same key
                    await record_failure(provider, key, e.kind, e.message, e.retry_after)
                    reasons.append(f"{provider} {st['masked']}: {e.kind}")
                    break  # next key
                ms = int((time.monotonic() - started) * 1000)
                providers.remember_model(provider, model)
                await record_success(provider, key, ms)
                attempts.append({"provider": provider, "key": st["masked"], "result": "ok"})
                await _telemetry({"request_id": request_id, "provider": provider, "key_id": st["key_id"], "masked": st["masked"],
                                  "purpose": purpose, "org_id": org_id, "ok": True, "kind": "ok", "latency_ms": ms, "tokens": tokens,
                                  "attempt": len(attempts), "model": model, "switched": len(attempts) > 1})
                result = AIResult(text, provider, model, st["masked"], latency_ms=ms, attempts=attempts)
                if cache_hours:
                    await _cache_put(digest, result, cache_hours)
                return result
            if skip_provider:
                break
    raise AIUnavailable("No AI provider could answer right now", reasons)


async def _tiny_generation(provider, key, cfg):
    """A ~5-token request: the only way to know a key can really answer (a model list passes even with no credit).
    Returns latency in ms or raises the last ProviderError; model problems move on to the next model."""
    last = None
    for model in providers.models_for(provider, (cfg.get("models") or {}).get(provider)):
        started = time.monotonic()
        try:
            await providers.generate(provider, key, "Reply with OK.", max_tokens=5, timeout=cfg.get("timeout_s", 30), model=model)
            providers.remember_model(provider, model)
            return int((time.monotonic() - started) * 1000)
        except providers.ProviderError as e:
            last = e
            if e.kind != MODEL:
                raise
    raise last


async def health_check():
    """Check every key. A free read-only call first; then, for keys that have never answered or whose quota
    wait is over, one tiny real request, so a valid key on an account without credit shows as "quota used up"
    instead of "healthy". Keys that answer come back into use; the others are rested or quarantined."""
    cfg = await get_config()
    report = []
    for provider in providers.PROVIDERS:
        for key in keys_for(provider):
            st = await state_of(provider, key)
            try:
                ms = await providers.probe(provider, key)
                needs_proof = not st.get("successes") or (st["status"] == "quota_exhausted" and available(st))
                if needs_proof:
                    ms = await _tiny_generation(provider, key, cfg)
                    await record_success(provider, key, ms)
            except providers.ProviderError as e:
                if e.kind not in (BAD_REQUEST, MODEL):
                    await record_failure(provider, key, e.kind, e.message, e.retry_after)
                report.append({"provider": provider, "key": st["masked"], "ok": False, "kind": e.kind})
                continue
            # A working key comes back, except one parked for quota that wasn't re-proven above.
            if st["status"] == "quarantined" or (st["status"] != "quota_exhausted" and not available(st)) or st.get("consecutive_failures"):
                await release(provider, key)
            report.append({"provider": provider, "key": st["masked"], "ok": True, "latency_ms": ms})
    return report


async def pool_overview():
    """Everything an administrator needs about providers and keys, with no secret in it."""
    cfg = await get_config()
    out = []
    for provider in providers.PROVIDERS:
        keys = []
        for k in keys_for(provider):
            st = await state_of(provider, k)
            req = st.get("requests", 0)
            keys.append({"key_id": st["key_id"], "masked": st["masked"], "status": st["status"], "available": available(st),
                         "requests": req, "success_rate": round(100 * st.get("successes", 0) / req) if req else None,
                         "avg_latency_ms": round(st.get("latency_ms_total", 0) / st["successes"]) if st.get("successes") else None,
                         "last_success_at": st.get("last_success_at", ""), "last_failure_at": st.get("last_failure_at", ""),
                         "last_error_class": st.get("last_error_class", ""), "last_error": st.get("last_error", ""),
                         "cooldown_until": st.get("cooldown_until", ""), "consecutive_failures": st.get("consecutive_failures", 0)})
        out.append({"provider": provider, "label": providers.DEFAULTS[provider]["label"], "status": await provider_status(provider),
                    "enabled": provider not in cfg.get("disabled", []), "model": (cfg.get("models") or {}).get(provider) or providers.model_for(provider),
                    "position": cfg["provider_order"].index(provider) if provider in cfg["provider_order"] else 99, "keys": keys})
    out.sort(key=lambda p: p["position"])
    return {"enabled": cfg.get("enabled", True), "providers": out}
