"""Automation endpoints: settings, the log, background jobs, approvals, repeating invoices and bills,
the weekly summary, and integration health.

Workspace owners and admins manage their own workspace's automation. The AI key pool is shared by the
whole installation, so its details and controls are for the platform administrator only (ADMIN_EMAIL);
everyone else sees one plain status word per integration.
"""
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth import get_current_user
from crud import can_manage_team
from database import db, now_iso
from automation import core, rules
from integrations import client as ai_client
from integrations.providers import PROVIDERS

router = APIRouter(prefix="/api/automation", tags=["automation"])

SETTING_LABELS = {
    "overdue_followups": "Create a follow-up task when an invoice stays unpaid",
    "close_followups": "Close follow-up tasks when the invoice is paid or cancelled",
    "weekly_summary": "Write a weekly summary with next steps",
    "ai_assist": "Use AI to suggest bank categories and write summaries",
}


async def manager(user: dict = Depends(get_current_user)):
    if not can_manage_team(user):
        raise HTTPException(status_code=403, detail="Only the workspace owner or an admin can manage automation")
    return user


def is_platform_admin(user):
    admin = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    return bool(admin) and (user.get("email") or "").lower() == admin


async def platform_admin(user: dict = Depends(get_current_user)):
    if not is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Only the platform administrator can change AI providers")
    return user


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------------- settings ----------------
class SettingsInput(_M):
    overdue_followups: Optional[bool] = None
    close_followups: Optional[bool] = None
    weekly_summary: Optional[bool] = None
    ai_assist: Optional[bool] = None
    followup_after_days: Optional[int] = Field(default=None, ge=1, le=120)


@router.get("/settings")
async def get_settings(user: dict = Depends(manager)):
    s = await core.org_settings(user["active_org_id"])
    s.setdefault("followup_after_days", 14)
    return {"settings": s, "labels": SETTING_LABELS}


@router.put("/settings")
async def put_settings(payload: SettingsInput, user: dict = Depends(manager)):
    changes = {f"settings.{k}": v for k, v in payload.model_dump(exclude_none=True).items()}
    if changes:
        await db.automation_settings.update_one({"org_id": user["active_org_id"]}, {"$set": {**changes, "updated_at": now_iso()}}, upsert=True)
        await core.record(user["active_org_id"], "Settings", "done", f"{user.get('name', 'Someone')} changed automation settings", "user")
    return await get_settings(user)


# ---------------- log, events, jobs ----------------
@router.get("/log")
async def get_log(status: str = "", limit: int = 100, user: dict = Depends(manager)):
    q = {"org_id": user["active_org_id"]}
    if status:
        q["status"] = status
    rows = await db.automation_log.find(q, {"_id": 0, "at_dt": 0, "detail": 0}).sort("at", -1).to_list(min(max(limit, 1), 500))
    return rows


@router.get("/events")
async def get_events(limit: int = 100, user: dict = Depends(manager)):
    return await db.events.find({"org_id": user["active_org_id"]}, {"_id": 0, "at_dt": 0}).sort("at", -1).to_list(min(max(limit, 1), 500))


PUBLIC_JOB = {"_id": 0, "id": 1, "type": 1, "label": 1, "status": 1, "attempts": 1, "max_attempts": 1, "created_at": 1, "updated_at": 1,
              "finished_at": 1, "error": 1, "result": 1, "org_id": 1}


@router.get("/jobs")
async def list_jobs(status: str = "", user: dict = Depends(manager)):
    scope = {"$in": [user["active_org_id"], ""]} if is_platform_admin(user) else user["active_org_id"]
    q = {"org_id": scope}
    if status:
        q["status"] = status
    rows = await db.jobs.find(q, PUBLIC_JOB).sort("created_at", -1).to_list(200)
    counts = {s: await db.jobs.count_documents({"org_id": scope, "status": s}) for s in ("queued", "running", "done", "failed", "skipped")}
    return {"jobs": [_public_job(j) for j in rows], "counts": counts}


def _public_job(j):
    # Shown to people as: Queued, Processing, Done, Needs attention
    word = {"queued": "Queued", "running": "Processing", "done": "Done", "failed": "Needs attention", "skipped": "Skipped"}.get(j["status"], j["status"])
    return {**j, "state": word}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id, "org_id": user["active_org_id"]}, PUBLIC_JOB)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _public_job(job)


@router.post("/jobs/{job_id}/retry")
async def retry(job_id: str, user: dict = Depends(manager)):
    scope = None if is_platform_admin(user) else user["active_org_id"]
    if not await core.retry_job(job_id, scope):
        raise HTTPException(status_code=400, detail="Only failed or skipped jobs can be retried")
    return {"success": True}


RUNNABLE = {"recurring": ("recurring_run", "Repeating invoices and bills"), "summary": ("summary_org", "Weekly summary"),
            "bank_categorise": ("bank_categorise", "Sort bank transactions"), "overdue": ("overdue_scan", "Overdue check"),
            "collections": ("collections_followup", "Collections follow-up")}


@router.post("/run/{what}")
async def run_now(what: str, user: dict = Depends(manager)):
    """Start a workspace job now instead of waiting for its schedule. Returns the job to follow its progress."""
    if what not in RUNNABLE:
        raise HTTPException(status_code=404, detail="Unknown job")
    job_type, label = RUNNABLE[what]
    org_id = user["active_org_id"]
    payload = {}
    if job_type == "summary_org":
        payload = {"period": rules.weekly_period(), "requested_by": user["id"]}
    # Repeated clicks join the run that's already waiting or in progress instead of stacking up.
    busy = await db.jobs.find_one({"org_id": org_id, "type": job_type, "status": {"$in": ["queued", "running"]}}, PUBLIC_JOB)
    if busy:
        return _public_job(busy)
    job = await core.enqueue(job_type, org_id, payload, label=label, max_attempts=3)
    return _public_job({k: job.get(k) for k in PUBLIC_JOB if k != "_id"})


# ---------------- approvals ----------------
@router.get("/approvals")
async def list_approvals(status: str = "pending", user: dict = Depends(manager)):
    q = {"org_id": user["active_org_id"]}
    if status != "all":
        q["status"] = {"$in": ["pending", "failed"]} if status == "pending" else status
    return await db.approvals.find(q, {"_id": 0, "dedupe_key": 0}).sort("created_at", -1).to_list(200)


@router.post("/approvals/{approval_id}/approve")
async def approve(approval_id: str, user: dict = Depends(manager)):
    res = await rules.decide(user["active_org_id"], approval_id, True, user)
    if res is None:
        raise HTTPException(status_code=409, detail="This was already handled")
    if res["status"] == "failed":
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.post("/approvals/{approval_id}/reject")
async def reject(approval_id: str, user: dict = Depends(manager)):
    res = await rules.decide(user["active_org_id"], approval_id, False, user)
    if res is None:
        raise HTTPException(status_code=409, detail="This was already handled")
    return res


# ---------------- repeating invoices and bills ----------------
Frequency = Literal["weekly", "monthly", "quarterly", "yearly"]


def _check_date(v):
    if v:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError("Use a date like 2026-05-31")
    return v


class RecurringInput(_M):
    source_type: Literal["invoice", "expense"]
    source_id: str = Field(min_length=1, max_length=64)
    frequency: Frequency = "monthly"
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    auto_send: bool = False

    @field_validator("start_date", "end_date")
    @classmethod
    def check_dates(cls, v):
        return _check_date(v)


class RecurringUpdate(_M):
    frequency: Optional[Frequency] = None
    next_date: Optional[str] = None
    end_date: Optional[str] = None
    auto_send: Optional[bool] = None
    active: Optional[bool] = None

    @field_validator("next_date", "end_date")
    @classmethod
    def check_dates(cls, v):
        return _check_date(v)


def _default_start(issue: str, frequency: str) -> str:
    """The first repeat after the original, moved forward until it's today or later."""
    d = issue
    t = rules.today()
    anchor = date.fromisoformat(issue).day
    d = rules.next_date(d, frequency, anchor)
    while d < t:
        d = rules.next_date(d, frequency, anchor)
    return d


@router.get("/recurring")
async def list_recurring(user: dict = Depends(manager)):
    return await db.recurring.find({"org_id": user["active_org_id"]}, {"_id": 0}).sort("next_date", 1).to_list(500)


@router.post("/recurring")
async def create_recurring(payload: RecurringInput, user: dict = Depends(manager)):
    org_id = user["active_org_id"]
    if payload.source_type == "invoice":
        src = await db.invoices.find_one({"id": payload.source_id, "org_id": org_id}, {"_id": 0})
        if not src:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if src.get("status") == "cancelled":
            raise HTTPException(status_code=400, detail="A cancelled invoice can't be repeated")
        due_days = 0
        if src.get("due_date") and src.get("issue_date"):
            due_days = max(0, (date.fromisoformat(src["due_date"][:10]) - date.fromisoformat(src["issue_date"][:10])).days)
        template = {"customer_id": src["customer_id"], "customer_name": src.get("customer_name", ""),
                    "items": [{k: it.get(k) for k in ("product_id", "description", "quantity", "unit_price", "discount")} for it in src.get("items", [])],
                    "tax_rate": src.get("tax_rate", 0), "notes": src.get("notes", ""), "due_days": due_days, "total": src["total"]}
        label = f"{src.get('customer_name', '')} · {src['invoice_number']}"
        issue = src.get("issue_date") or rules.today()
    else:
        src = await db.expenses.find_one({"id": payload.source_id, "org_id": org_id}, {"_id": 0})
        if not src:
            raise HTTPException(status_code=404, detail="Expense not found")
        template = {k: src.get(k) for k in ("category", "vendor", "supplier_id", "description", "amount", "payment_method")}
        label = f"{src.get('vendor') or src['category']}"
        issue = src.get("date") or rules.today()
    if await db.recurring.find_one({"org_id": org_id, "source_id": payload.source_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail="This already repeats. Change or resume it in Settings > Automation.")
    start = payload.start_date or _default_start(issue[:10], payload.frequency)
    if start < rules.today():
        raise HTTPException(status_code=422, detail="Choose a start date of today or later")
    if payload.end_date and payload.end_date < start:
        raise HTTPException(status_code=422, detail="The end date can't be before the start date")
    doc = {"id": str(uuid.uuid4()), "org_id": org_id, "kind": payload.source_type, "source_id": payload.source_id, "label": label,
           "template": template, "frequency": payload.frequency, "next_date": start, "anchor_day": date.fromisoformat(start).day,
           "end_date": payload.end_date or "", "auto_send": payload.auto_send if payload.source_type == "invoice" else False,
           "active": True, "count": 0, "created_by": src.get("created_by") or user["id"], "set_up_by": user["id"],
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.recurring.insert_one(dict(doc))
    await core.record(org_id, "Repeating " + ("invoice" if payload.source_type == "invoice" else "bill"), "done",
                      f"{user.get('name', 'Someone')} set {label} to repeat {payload.frequency}, starting {start}", "user", {"recurring_id": doc["id"]})
    return doc


@router.put("/recurring/{rec_id}")
async def update_recurring(rec_id: str, payload: RecurringUpdate, user: dict = Depends(manager)):
    org_id = user["active_org_id"]
    rec = await db.recurring.find_one({"id": rec_id, "org_id": org_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Repeating item not found")
    changes = payload.model_dump(exclude_none=True)
    if "next_date" in changes:
        if changes["next_date"] < rules.today():
            raise HTTPException(status_code=422, detail="Choose a date of today or later")
        changes["anchor_day"] = date.fromisoformat(changes["next_date"]).day
    if changes.get("active") and not rec.get("active"):
        changes["paused_reason"] = ""
        if rec["next_date"] < rules.today() and "next_date" not in changes:
            # Resuming doesn't back-fill the periods skipped while paused.
            nd = rec["next_date"]
            while nd < rules.today():
                nd = rules.next_date(nd, changes.get("frequency", rec["frequency"]), rec.get("anchor_day") or 0)
            changes["next_date"] = nd
    if rec["kind"] == "expense":
        changes.pop("auto_send", None)
    changes["updated_at"] = now_iso()
    await db.recurring.update_one({"id": rec_id, "org_id": org_id}, {"$set": changes})
    return await db.recurring.find_one({"id": rec_id, "org_id": org_id}, {"_id": 0})


@router.delete("/recurring/{rec_id}")
async def delete_recurring(rec_id: str, user: dict = Depends(manager)):
    """Stop repeating. Invoices and bills already created stay; any waiting approval for it is withdrawn."""
    org_id = user["active_org_id"]
    res = await db.recurring.delete_one({"id": rec_id, "org_id": org_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Repeating item not found")
    await db.approvals.update_many({"org_id": org_id, "status": {"$in": ["pending", "failed"]}, "payload.recurring_id": rec_id},
                                   {"$set": {"status": "rejected", "error": "The repeating invoice was removed", "updated_at": now_iso()}})
    return {"success": True}


# ---------------- weekly summary ----------------
@router.get("/summary")
async def latest_summary(user: dict = Depends(manager)):
    doc = await db.summaries.find_one({"org_id": user["active_org_id"]}, {"_id": 0}, sort=[("created_at", -1)])
    return doc or {}


# ---------------- integrations ----------------
STATUS_WORDS = {"healthy": "Healthy", "degraded": "Degraded", "rate_limited": "Rate limited", "quota_exhausted": "Quota exhausted",
                "auth_error": "Authentication error", "unavailable": "Unavailable", "not_configured": "Not set up", "off": "Switched off"}


def _ai_overall(providers):
    """One word for AI help as a whole: it works as long as any provider can answer."""
    configured = [p for p in providers if p["status"] != "not_configured" and p["enabled"]]
    if not configured:
        return "not_configured"
    if any(p["status"] == "healthy" for p in configured):
        return "healthy" if all(p["status"] == "healthy" for p in configured) else "degraded"
    if any(p["status"] == "degraded" for p in configured):
        return "degraded"
    return configured[0]["status"]


async def _usage(hours):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    out = {}
    async for r in db.api_calls.aggregate([
        {"$match": {"at": {"$gte": since}}},
        {"$group": {"_id": {"provider": "$provider", "kind": "$kind"}, "n": {"$sum": 1}, "ms": {"$avg": "$latency_ms"},
                    "tokens": {"$sum": {"$ifNull": ["$tokens", 0]}}, "switched": {"$sum": {"$cond": [{"$eq": ["$switched", True]}, 1, 0]}}}}]):
        p = out.setdefault(r["_id"]["provider"], {"requests": 0, "ok": 0, "failed": {}, "tokens": 0, "avg_latency_ms": None, "after_failover": 0})
        p["requests"] += r["n"]
        if r["_id"]["kind"] == "ok":
            p["ok"] += r["n"]
            p["tokens"] += r["tokens"]
            p["avg_latency_ms"] = round(r["ms"] or 0)
            p["after_failover"] += r["switched"]
        else:
            p["failed"][r["_id"]["kind"]] = r["n"]
    return out


@router.get("/integrations")
async def integrations(user: dict = Depends(manager)):
    import bank
    org_id = user["active_org_id"]
    pool = await ai_client.pool_overview()
    overall = "off" if not pool["enabled"] else _ai_overall(pool["providers"])
    ai = {"status": overall, "label": STATUS_WORDS.get(overall, overall),
          "providers": [{"label": p["label"], "status": p["status"], "status_label": STATUS_WORDS.get(p["status"], p["status"])}
                        for p in pool["providers"] if p["keys"]]}
    accounts = await db.bank_accounts.find({"org_id": org_id}, {"_id": 0, "id": 1, "name": 1, "source": 1, "last_synced_at": 1, "error": 1, "institution": 1}).to_list(50)
    bank_status = "not_configured" if not accounts else ("degraded" if any(a.get("error") for a in accounts) else "healthy")
    out = {"ai": ai,
           "bank": {"status": bank_status, "label": STATUS_WORDS.get(bank_status), "plaid_configured": bank.plaid_configured(), "accounts": accounts},
           "email": {"status": "not_configured", "label": "Not set up", "note": "Reminders are written for you and sent from your own email app."},
           "platform_admin": is_platform_admin(user)}
    if is_platform_admin(user):
        out["ai"]["pool"] = pool
        out["ai"]["usage_24h"] = await _usage(24)
        out["ai"]["usage_7d"] = await _usage(24 * 7)
        last = await db.jobs.find_one({"type": "ai_health_check", "status": "done"}, {"_id": 0, "finished_at": 1, "result": 1}, sort=[("finished_at", -1)])
        out["ai"]["last_check"] = last or {}
    return out


@router.post("/integrations/check")
async def check_now(user: dict = Depends(platform_admin)):
    report = await ai_client.health_check()
    return {"report": report, "pool": await ai_client.pool_overview()}


class AIConfigInput(_M):
    enabled: Optional[bool] = None
    provider_order: Optional[List[Literal["openai", "gemini", "openrouter"]]] = None
    disabled: Optional[List[Literal["openai", "gemini", "openrouter"]]] = None
    models: Optional[dict] = None

    @field_validator("models")
    @classmethod
    def check_models(cls, v):
        if v is None:
            return v
        clean = {}
        for k, m in v.items():
            if k not in PROVIDERS or not isinstance(m, str) or len(m) > 100:
                raise ValueError("Unknown provider or model name too long")
            if m.strip():
                clean[k] = m.strip()
        return clean


@router.put("/integrations/ai")
async def set_ai_config(payload: AIConfigInput, user: dict = Depends(platform_admin)):
    changes = payload.model_dump(exclude_none=True)
    if "provider_order" in changes:
        order = list(dict.fromkeys(changes["provider_order"]))
        changes["provider_order"] = order + [p for p in PROVIDERS if p not in order]
    if changes:
        await db.system_config.update_one({"_id": "ai"}, {"$set": changes}, upsert=True)
        ai_client.forget_config()
    return (await ai_client.pool_overview())


@router.post("/integrations/keys/{provider}/{key_id}/release")
async def release_key(provider: str, key_id: str, user: dict = Depends(platform_admin)):
    """Put a quarantined or resting key back into rotation (e.g. after fixing billing)."""
    from integrations.keypool import release
    from integrations.secrets import keys_for, fingerprint
    key = next((k for k in keys_for(provider) if fingerprint(k) == key_id), None)
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    await release(provider, key)
    return await ai_client.pool_overview()
