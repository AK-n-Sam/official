"""Automation machinery.

  emit(event)  ->  rules registered for that event  (Trigger -> Condition -> Action -> Result)
               ->  every outcome is written to the automation log
  enqueue(job) ->  persistent queue; a worker claims jobs atomically, retries with backoff, and marks
                   jobs that keep failing as "needs attention"
  scheduler    ->  turns schedules into jobs keyed by time slot, so a restart or a second worker can
                   never run the same slot twice

Rules and jobs never raise into the business action that triggered them.
"""
import asyncio
import logging
import os
import socket
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db, now_iso
from integrations.secrets import redact

log = logging.getLogger("automation")
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:4]}"
JOB_TIMEOUT_S = 180
LOCK_MINUTES = 5

RULES = defaultdict(list)   # event type -> [(name, setting, fn)]
HANDLERS = {}               # job type -> async fn(job) -> result dict
SCHEDULES = []              # (name, slot_fn, job_type)

DEFAULT_SETTINGS = {
    "overdue_followups": True,       # an overdue invoice gets a follow-up task for the person who made the sale
    "close_followups": True,         # ...which closes itself when the invoice is paid or cancelled
    "recurring_auto_send": False,    # repeat invoices are prepared as drafts for approval unless this is on
    "weekly_summary": True,
    "ai_assist": True,               # AI suggestions (bank categories) and AI-written summaries
}


def utcnow():
    return datetime.now(timezone.utc)


class Defer(Exception):
    """Try this job again later (e.g. no AI provider available right now) without counting it as broken."""

    def __init__(self, reason, seconds=900):
        super().__init__(reason)
        self.seconds = seconds


# ---------------- registration ----------------
def rule(event_type, name, setting=None):
    def wrap(fn):
        RULES[event_type].append((name, setting, fn))
        return fn
    return wrap


def job_handler(job_type):
    def wrap(fn):
        HANDLERS[job_type] = fn
        return fn
    return wrap


def schedule(name, slot_fn, job_type):
    SCHEDULES.append((name, slot_fn, job_type))


def every(minutes):
    return lambda now: f"{now:%Y-%m-%dT%H}:{(now.minute // minutes) * minutes:02d}"


def daily(now):
    return f"{now:%Y-%m-%d}"


def weekly(now):
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"


# ---------------- settings & log ----------------
async def org_settings(org_id):
    doc = await db.automation_settings.find_one({"org_id": org_id}, {"_id": 0}) or {}
    return {**DEFAULT_SETTINGS, **(doc.get("settings") or {})}


async def record(org_id, name, status, message, trigger="", ref=None, detail=""):
    """One line in the automation log: what happened, why, and how it ended."""
    try:
        await db.automation_log.insert_one({"id": uuid.uuid4().hex, "org_id": org_id, "rule": name, "trigger": trigger, "status": status,
                                            "message": redact(message)[:500], "detail": redact(detail)[:1000], "ref": ref or {},
                                            "at": now_iso(), "at_dt": utcnow()})
    except Exception:
        log.exception("automation log write failed")


async def claim_once(org_id, key, ref=None):
    """True the first time a side effect with this key is claimed; False on every repeat (retries, double events)."""
    try:
        await db.automation_effects.insert_one({"org_id": org_id, "key": key, "ref": ref or {}, "at": now_iso()})
        return True
    except DuplicateKeyError:
        return False


async def release_once(org_id, key):
    """Undo a claim when the action itself failed, so a retry can do it properly."""
    await db.automation_effects.delete_one({"org_id": org_id, "key": key})


# ---------------- events ----------------
async def emit(org_id, event_type, data=None, actor=""):
    """Record a business event and run the rules that react to it. Never raises."""
    event = {"id": uuid.uuid4().hex, "org_id": org_id, "type": event_type, "data": data or {}, "actor": actor, "at": now_iso(), "at_dt": utcnow()}
    try:
        await db.events.insert_one(dict(event))
    except Exception:
        log.exception("event write failed")
    if not RULES.get(event_type):
        return
    try:
        settings = await org_settings(org_id)
    except Exception:
        settings = DEFAULT_SETTINGS
    for name, setting, fn in RULES[event_type]:
        if setting and not settings.get(setting, True):
            continue
        try:
            outcome = await fn(org_id, event, settings)
            if outcome:
                message, ref = outcome if isinstance(outcome, tuple) else (outcome, None)
                await record(org_id, name, "done", message, event_type, ref)
        except Exception as e:
            log.exception("rule %s failed", name)
            await record(org_id, name, "failed", "An automatic step didn't complete. It will be retried by the next check.", event_type, detail=str(e))


# ---------------- job queue ----------------
async def enqueue(job_type, org_id="", payload=None, dedupe_key=None, delay_s=0, max_attempts=5, label=""):
    doc = {"id": uuid.uuid4().hex, "type": job_type, "org_id": org_id, "payload": payload or {}, "label": label or job_type,
           "status": "queued", "attempts": 0, "max_attempts": max_attempts, "run_after": utcnow() + timedelta(seconds=delay_s),
           "created_at": now_iso(), "updated_at": now_iso(), "error": "", "result": {}}
    if dedupe_key:
        doc["dedupe_key"] = dedupe_key
        res = await db.jobs.update_one({"dedupe_key": dedupe_key}, {"$setOnInsert": doc}, upsert=True)
        if not res.upserted_id:
            return await db.jobs.find_one({"dedupe_key": dedupe_key}, {"_id": 0})
    else:
        await db.jobs.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def claim():
    """Atomically take the next due job, including ones whose worker died mid-run (lock expired)."""
    at = utcnow()
    return await db.jobs.find_one_and_update(
        {"$or": [{"status": "queued", "run_after": {"$lte": at}}, {"status": "running", "locked_until": {"$lt": at}}]},
        {"$set": {"status": "running", "locked_until": at + timedelta(minutes=LOCK_MINUTES), "locked_by": WORKER_ID,
                  "started_at": now_iso(), "updated_at": now_iso()}, "$inc": {"attempts": 1}},
        sort=[("run_after", 1)], projection={"_id": 0}, return_document=ReturnDocument.AFTER)


async def run_job(job):
    handler = HANDLERS.get(job["type"])
    if not handler:
        await db.jobs.update_one({"id": job["id"]}, {"$set": {"status": "failed", "error": f"No handler for {job['type']}", "updated_at": now_iso()}})
        return
    try:
        result = await asyncio.wait_for(handler(job), timeout=JOB_TIMEOUT_S)
        await db.jobs.update_one({"id": job["id"]}, {"$set": {"status": "done", "result": result or {}, "error": "", "finished_at": now_iso(), "updated_at": now_iso()}})
    except Defer as d:
        final = job["attempts"] >= job["max_attempts"]
        await db.jobs.update_one({"id": job["id"]}, {"$set": {
            "status": "skipped" if final else "queued", "error": redact(str(d)), "updated_at": now_iso(),
            "run_after": utcnow() + timedelta(seconds=d.seconds)}})
    except Exception as e:
        attempts = job["attempts"]
        final = attempts >= job["max_attempts"]
        wait = min(60 * 2 ** (attempts - 1), 3600)
        log.warning("job %s (%s) attempt %s failed: %s", job["id"], job["type"], attempts, redact(e))
        await db.jobs.update_one({"id": job["id"]}, {"$set": {
            "status": "failed" if final else "queued", "error": redact(f"{type(e).__name__}: {e}"), "updated_at": now_iso(),
            "run_after": utcnow() + timedelta(seconds=wait)}})
        if final and job.get("org_id"):
            await record(job["org_id"], job.get("label") or job["type"], "needs_attention",
                         f"“{job.get('label') or job['type']}” failed {attempts} times and stopped. You can retry it from Settings > Automation.",
                         "job", detail=str(e))


async def retry_job(job_id, org_id=None):
    q = {"id": job_id, "status": {"$in": ["failed", "skipped"]}}
    if org_id is not None:
        q["org_id"] = org_id
    res = await db.jobs.update_one(q, {"$set": {"status": "queued", "attempts": 0, "run_after": utcnow(), "error": "", "updated_at": now_iso()}})
    return res.modified_count == 1


# ---------------- loops ----------------
async def worker_loop(stop):
    while not stop.is_set():
        try:
            job = await claim()
            if job:
                await run_job(job)
                continue
        except Exception:
            log.exception("worker error")
        try:
            await asyncio.wait_for(stop.wait(), timeout=2)
        except asyncio.TimeoutError:
            pass


async def schedule_tick():
    at = utcnow()
    for name, slot_fn, job_type in SCHEDULES:
        await enqueue(job_type, payload={"slot": slot_fn(at)}, dedupe_key=f"sched:{name}:{slot_fn(at)}", label=name, max_attempts=3)


async def scheduler_loop(stop):
    while not stop.is_set():
        try:
            await schedule_tick()
        except Exception:
            log.exception("scheduler error")
        try:
            await asyncio.wait_for(stop.wait(), timeout=30)
        except asyncio.TimeoutError:
            pass


class Runner:
    def __init__(self):
        self.stop = asyncio.Event()
        self.tasks = []

    def start(self):
        if os.environ.get("AUTOMATION_DISABLED") == "1":
            return
        self.tasks = [asyncio.create_task(worker_loop(self.stop)), asyncio.create_task(scheduler_loop(self.stop))]

    async def shutdown(self):
        self.stop.set()
        for t in self.tasks:
            try:
                await asyncio.wait_for(t, timeout=5)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                t.cancel()


runner = Runner()


async def ensure_indexes():
    await db.events.create_index([("org_id", 1), ("at", -1)])
    await db.events.create_index("at_dt", expireAfterSeconds=180 * 86400)
    await db.automation_log.create_index([("org_id", 1), ("at", -1)])
    await db.automation_log.create_index("at_dt", expireAfterSeconds=180 * 86400)
    await db.automation_effects.create_index([("org_id", 1), ("key", 1)], unique=True)
    await db.jobs.create_index("dedupe_key", unique=True, partialFilterExpression={"dedupe_key": {"$type": "string"}})
    await db.jobs.create_index([("status", 1), ("run_after", 1)])
    await db.jobs.create_index([("org_id", 1), ("created_at", -1)])
    await db.api_calls.create_index("at", expireAfterSeconds=30 * 86400)
    await db.api_calls.create_index([("provider", 1), ("at", -1)])
    await db.ai_cache.create_index("expires_at", expireAfterSeconds=0)
    await db.summaries.create_index([("org_id", 1), ("period", 1)], unique=True)
