"""What the platform does by itself.

Event rules (run the moment something happens)
  payment received in full / invoice cancelled or deleted -> close the collection follow-up for it
  stock falls to its reorder level                         -> note it (Today offers the reorder)
  bank lines imported or synced                            -> sort them into categories in the background

Scheduled jobs (each time slot runs once, however many workers or restarts)
  every 15 min  overdue check           invoices past due become overdue in every workspace
  hourly        repeating invoices/bills  issue (or prepare for approval) what is due
  daily         collections follow-up   invoices long overdue get a follow-up task for their owner
  daily         clean-up                old finished jobs and expired snoozes are removed
  every 30 min  integration health      every AI key is checked with a free call; recovered keys return
  every 6 h     bank sync               connected banks pull new transactions
  weekly        business summary        a short written summary with next steps (AI, or a standard one)
"""
import calendar
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone

from database import db, now_iso
from automation.core import rule, job_handler, schedule, every, daily, weekly, record, claim_once, release_once, \
    enqueue, org_settings, Defer
from integrations import generate_text, AIUnavailable
from integrations.secrets import keys_for

log = logging.getLogger("automation")


def _srv():
    import server  # the API module owns the business helpers; imported lazily to avoid a cycle
    return server


def today():
    return datetime.now(timezone.utc).date().isoformat()


def weekly_period():
    return weekly(datetime.now(timezone.utc))


def every_hours(n):
    return lambda now: f"{now:%Y-%m-%d}T{(now.hour // n) * n:02d}"


async def _org(org_id):
    return await db.organizations.find_one({"id": org_id}, {"_id": 0}) or {"id": org_id, "currency": "USD"}


async def _orgs():
    return [o["id"] async for o in db.organizations.find({}, {"_id": 0, "id": 1})]


# ======================= event rules =======================
async def close_followups(org_id, invoice_id, why):
    res = await db.tasks.update_many(
        {"org_id": org_id, "automation.invoice_id": invoice_id, "status": {"$nin": ["done", "completed"]}},
        {"$set": {"status": "done", "completed_at": now_iso(), "updated_at": now_iso(), "automation.closed_because": why}})
    return res.modified_count


@rule("payment_received", "Close follow-up when paid", setting="close_followups")
async def _paid(org_id, event, settings):
    d = event["data"]
    if not d.get("paid_in_full"):
        return None
    n = await close_followups(org_id, d["invoice_id"], "paid")
    return (f"{d.get('invoice_number', 'Invoice')} was paid, so its follow-up task was closed", {"invoice_id": d["invoice_id"]}) if n else None


@rule("invoice_cancelled", "Close follow-up when cancelled", setting="close_followups")
async def _cancelled(org_id, event, settings):
    n = await close_followups(org_id, event["data"]["invoice_id"], "cancelled")
    return f"{event['data'].get('invoice_number', 'Invoice')} was cancelled, so its follow-up task was closed" if n else None


@rule("invoice_deleted", "Close follow-up when deleted", setting="close_followups")
async def _deleted(org_id, event, settings):
    n = await close_followups(org_id, event["data"]["invoice_id"], "deleted")
    return f"{event['data'].get('invoice_number', 'Invoice')} was deleted, so its follow-up task was closed" if n else None


@rule("inventory_low", "Low stock alert")
async def _low(org_id, event, settings):
    d = event["data"]
    left = d["stock"]
    return (f"{d['name']} is {'out of stock' if left <= 0 else f'down to {left}'} (reorder at {d['reorder_level']}). "
            "It's on Today with a suggested reorder.", {"product_id": d["product_id"]})


@rule("bank_imported", "Sort new bank lines")
async def _bank_imported(org_id, event, settings):
    if not event["data"].get("count"):
        return None
    await enqueue("bank_categorise", org_id, {}, dedupe_key=f"bankcat:{org_id}:{event['id']}", label="Sort bank transactions")
    return None  # the job records its own result


# ======================= overdue + collections =======================
@job_handler("overdue_scan")
async def overdue_scan(job):
    flipped = 0
    for org_id in [job["org_id"]] if job.get("org_id") else await _orgs():
        flipped += await _srv().refresh_overdue(org_id)
    return {"newly_overdue": flipped}


@job_handler("collections_followup")
async def collections_followup(job):
    """Invoices that stay unpaid long after their due date get one follow-up task for the person who made the sale."""
    made = 0
    srv = _srv()
    for org_id in [job["org_id"]] if job.get("org_id") else await _orgs():
        settings = await org_settings(org_id)
        if not settings.get("overdue_followups", True):
            continue
        org = await _org(org_id)
        after = int(settings.get("followup_after_days") or 14)
        cutoff = (date.fromisoformat(today()) - timedelta(days=after)).isoformat()
        async for inv in db.invoices.find({"org_id": org_id, "status": {"$in": ["overdue", "partially_paid"]}, "due_date": {"$gt": "", "$lte": cutoff}},
                                          {"_id": 0, "items": 0}):
            balance = srv.balance_of(inv)
            if balance <= 0:
                continue
            key = f"followup:{inv['id']}:{inv['due_date']}"
            if not await claim_once(org_id, key, {"invoice_id": inv["id"]}):
                continue
            try:
                owner = await db.users.find_one({"id": inv.get("created_by")}, {"_id": 0, "id": 1, "name": 1, "org_ids": 1})
                if not owner or org_id not in (owner.get("org_ids") or []):  # seller left: give it to the workspace owner
                    owner = await db.users.find_one({"id": org.get("owner_user_id")}, {"_id": 0, "id": 1, "name": 1}) or {"id": "", "name": ""}
                late = (date.fromisoformat(today()) - date.fromisoformat(inv["due_date"][:10])).days
                reminders = inv.get("reminders") or []
                chased = f"Reminded {len(reminders)} time{'s' if len(reminders) != 1 else ''}, last on {srv.nice_date(reminders[-1]['at'])}." if reminders else "No reminder has been sent yet."
                await db.tasks.insert_one({
                    "id": str(uuid.uuid4()), "org_id": org_id, "title": f"Call {inv.get('customer_name', 'the customer')} about {inv['invoice_number']}",
                    "description": f"{srv.money_in(org, balance)} is {late} days overdue. {chased} This task closes itself when the invoice is paid.",
                    "assignee": owner.get("name", ""), "assignee_id": owner.get("id", ""), "priority": "high", "status": "todo", "due_date": today(),
                    "customer_id": inv.get("customer_id", ""), "customer_name": inv.get("customer_name", ""), "reference": inv["invoice_number"],
                    "automation": {"rule": "collections_followup", "invoice_id": inv["id"]},
                    "created_by": owner.get("id", "") or inv.get("created_by", ""), "created_at": now_iso(), "updated_at": now_iso()})
            except Exception:
                await release_once(org_id, key)
                raise
            made += 1
            await record(org_id, "Collections follow-up", "done",
                         f"{inv['invoice_number']} is {late} days overdue, so a follow-up task went to {owner.get('name') or 'the owner'}",
                         "schedule", {"invoice_id": inv["id"]})
    return {"tasks_created": made}


# ======================= repeating invoices & bills =======================
FREQUENCIES = {"weekly": (0, 7), "monthly": (1, 0), "quarterly": (3, 0), "yearly": (12, 0)}


def next_date(current: str, frequency: str, anchor_day: int) -> str:
    """The next occurrence. Monthly schedules keep their day of the month (31st -> 28th/30th -> 31st)."""
    d = date.fromisoformat(current)
    months, days = FREQUENCIES[frequency]
    if days:
        return (d + timedelta(days=days)).isoformat()
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(anchor_day or d.day, calendar.monthrange(y, m)[1])).isoformat()


async def _issue_recurring_invoice(rec, period, approval_id=""):
    """Issue the invoice for one period. Safe to call twice: the second call finds the first invoice."""
    org_id = rec["org_id"]
    existing = await db.invoices.find_one({"org_id": org_id, "recurring_id": rec["id"], "recurring_period": period}, {"_id": 0})
    if existing:
        return existing
    customer = await db.customers.find_one({"id": rec["template"]["customer_id"], "org_id": org_id}, {"_id": 0, "id": 1, "name": 1})
    if not customer:
        await db.recurring.update_one({"id": rec["id"]}, {"$set": {"active": False, "paused_reason": "The customer was deleted", "updated_at": now_iso()}})
        raise RuntimeError("The customer on this repeating invoice no longer exists, so it was paused")
    t = rec["template"]
    due = (date.fromisoformat(period) + timedelta(days=int(t.get("due_days") or 0))).isoformat()
    srv = _srv()
    doc = await srv._issue_invoice({"id": rec["created_by"], "active_org_id": org_id}, customer,
                                   {"items": t["items"], "tax_rate": t.get("tax_rate", 0), "issue_date": period, "due_date": due, "notes": t.get("notes", "")}, "sent")
    await db.invoices.update_one({"id": doc["id"]}, {"$set": {"recurring_id": rec["id"], "recurring_period": period, "source_approval_id": approval_id}})
    doc.update({"recurring_id": rec["id"], "recurring_period": period})
    return doc


async def _make_recurring_expense(rec, period):
    org_id = rec["org_id"]
    t = rec["template"]
    if await db.expenses.find_one({"org_id": org_id, "recurring_id": rec["id"], "recurring_period": period}, {"_id": 0, "id": 1}):
        return
    await db.expenses.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "category": t["category"], "vendor": t.get("vendor", ""), "supplier_id": t.get("supplier_id", ""),
        "description": t.get("description", ""), "amount": t["amount"], "date": period, "status": "pending",
        "payment_method": t.get("payment_method") or "bank_transfer", "recurring_id": rec["id"], "recurring_period": period,
        "created_by": rec["created_by"], "created_at": now_iso(), "updated_at": now_iso()})


async def run_recurring(org_id=None, limit_periods=6):
    """Generate everything that has come due. Each (schedule, period) happens at most once."""
    srv = _srv()
    q = {"active": True, "next_date": {"$lte": today()}}
    if org_id:
        q["org_id"] = org_id
    out = {"invoices": 0, "approvals": 0, "bills": 0}
    async for rec in db.recurring.find(q, {"_id": 0}):
        org = await _org(rec["org_id"])
        for _ in range(limit_periods):
            period = rec["next_date"]
            if period > today() or (rec.get("end_date") and period > rec["end_date"]):
                break
            key = f"recur:{rec['id']}:{period}"
            if await claim_once(rec["org_id"], key, {"recurring_id": rec["id"]}):
                try:
                    if rec["kind"] == "expense":
                        await _make_recurring_expense(rec, period)
                        out["bills"] += 1
                        await record(rec["org_id"], "Repeating bill", "done",
                                     f"Added the {rec['frequency']} {rec['template']['category']} bill ({srv.money_in(org, rec['template']['amount'])}), ready to pay",
                                     "schedule", {"recurring_id": rec["id"]})
                    elif rec.get("auto_send"):
                        inv = await _issue_recurring_invoice(rec, period)
                        out["invoices"] += 1
                        await record(rec["org_id"], "Repeating invoice", "done",
                                     f"Issued {inv['invoice_number']} to {inv['customer_name']} for {srv.money_in(org, inv['total'])} ({rec['frequency']})",
                                     "schedule", {"invoice_id": inv["id"], "recurring_id": rec["id"]})
                    else:
                        await create_approval(rec["org_id"], "issue_recurring_invoice",
                                              f"Send {rec['template']['customer_name']} their {rec['frequency']} invoice",
                                              f"{srv.money_in(org, rec['template']['total'])} · for {srv.nice_date(period)}",
                                              {"recurring_id": rec["id"], "period": period}, amount=rec["template"]["total"],
                                              dedupe=key)
                        out["approvals"] += 1
                except Exception as e:
                    await release_once(rec["org_id"], key)
                    await record(rec["org_id"], "Repeating " + ("bill" if rec["kind"] == "expense" else "invoice"), "needs_attention",
                                 str(e) if isinstance(e, RuntimeError) else "A repeating item couldn't be created. It will be tried again within the hour.",
                                 "schedule", {"recurring_id": rec["id"]}, detail=repr(e))
                    break
            nxt = next_date(period, rec["frequency"], rec.get("anchor_day") or 0)
            await db.recurring.update_one({"id": rec["id"], "next_date": period},
                                          {"$set": {"next_date": nxt, "last_run": period, "updated_at": now_iso()}, "$inc": {"count": 1}})
            rec["next_date"] = nxt
    return out


@job_handler("recurring_run")
async def recurring_job(job):
    return await run_recurring(job.get("org_id") or None)


# ======================= approvals =======================
EXECUTORS = {}


def executor(kind):
    def wrap(fn):
        EXECUTORS[kind] = fn
        return fn
    return wrap


async def create_approval(org_id, kind, title, detail, payload, amount=0.0, dedupe=None, requested_by="automation"):
    doc = {"id": uuid.uuid4().hex, "org_id": org_id, "kind": kind, "title": title, "detail": detail, "payload": payload, "amount": round(amount or 0, 2),
           "status": "pending", "requested_by": requested_by, "created_at": now_iso(), "updated_at": now_iso(), "result": {}, "error": ""}
    if dedupe:
        doc["dedupe_key"] = dedupe
        await db.approvals.update_one({"dedupe_key": dedupe}, {"$setOnInsert": doc}, upsert=True)
    else:
        await db.approvals.insert_one(dict(doc))
    await record(org_id, "Waiting for approval", "waiting", f"{title} ({detail})", "approval", {"approval_id": doc["id"]})
    return doc


async def decide(org_id, approval_id, approve: bool, user):
    """Approve (and run) or skip a prepared action. Only one decision ever wins, so a double click can't run it twice."""
    claimed = await db.approvals.find_one_and_update(
        {"id": approval_id, "org_id": org_id, "status": {"$in": ["pending", "failed"]}},
        {"$set": {"status": "running" if approve else "rejected", "decided_by": user["id"], "decided_by_name": user.get("name", ""),
                  "decided_at": now_iso(), "updated_at": now_iso()}},
        projection={"_id": 0})
    if not claimed:
        return None
    if not approve:
        await record(org_id, "Approval", "skipped", f"{user.get('name', 'Someone')} skipped: {claimed['title']}", "approval", {"approval_id": approval_id})
        return {**claimed, "status": "rejected"}
    try:
        result = await EXECUTORS[claimed["kind"]](org_id, claimed)
    except Exception as e:
        msg = str(e) if isinstance(e, RuntimeError) else "It couldn't be completed. Nothing was changed; you can try again."
        await db.approvals.update_one({"id": approval_id}, {"$set": {"status": "failed", "error": msg, "updated_at": now_iso()}})
        await record(org_id, "Approval", "needs_attention", f"{claimed['title']}: {msg}", "approval", {"approval_id": approval_id}, detail=repr(e))
        return {**claimed, "status": "failed", "error": msg}
    await db.approvals.update_one({"id": approval_id}, {"$set": {"status": "done", "result": result, "error": "", "updated_at": now_iso()}})
    await record(org_id, "Approval", "done", f"{user.get('name', 'Someone')} approved: {claimed['title']}. {result.get('message', '')}".strip(),
                 "approval", {"approval_id": approval_id, **{k: v for k, v in result.items() if k.endswith("_id")}})
    return {**claimed, "status": "done", "result": result}


@executor("issue_recurring_invoice")
async def _exec_recurring(org_id, approval):
    rec = await db.recurring.find_one({"id": approval["payload"]["recurring_id"], "org_id": org_id}, {"_id": 0})
    if not rec:
        raise RuntimeError("This repeating invoice was deleted")
    inv = await _issue_recurring_invoice(rec, approval["payload"]["period"], approval["id"])
    org = await _org(org_id)
    return {"invoice_id": inv["id"], "invoice_number": inv["invoice_number"],
            "message": f"{inv['invoice_number']} was issued for {_srv().money_in(org, inv['total'])}."}


# ======================= bank categorisation =======================
KEYWORD_CATEGORIES = [
    (r"\b(rent|lease|landlord)\b", "Rent"),
    (r"\b(electric|power|energy|water|gas bill|utility|utilities|sewer)\b", "Utilities"),
    (r"\b(comcast|verizon|at&t|vodafone|t-mobile|internet|broadband|phone|mobile|telecom)\b", "Phone & internet"),
    (r"\b(aws|amazon web services|google cloud|azure|github|slack|zoom|microsoft|adobe|dropbox|notion|atlassian|shopify|software|saas|subscription)\b", "Software"),
    (r"\b(uber|lyft|taxi|airline|airways|delta|united|ryanair|easyjet|hotel|airbnb|train|rail|parking|toll)\b", "Travel"),
    (r"\b(shell|bp|chevron|exxon|esso|fuel|petrol|gasoline)\b", "Fuel"),
    (r"\b(restaurant|cafe|coffee|starbucks|mcdonald|pizza|deli|lunch|dinner|meal)\b", "Meals"),
    (r"\b(insurance|insurer|policy)\b", "Insurance"),
    (r"\b(payroll|salary|salaries|wages|gusto|adp)\b", "Payroll"),
    (r"\b(irs|hmrc|tax|vat|gst)\b", "Taxes"),
    (r"\b(bank fee|service charge|monthly fee|overdraft|interest charge|wire fee)\b", "Bank fees"),
    (r"\b(staples|office depot|stationery|printer|ink|office supplies)\b", "Office supplies"),
    (r"\b(facebook ads|google ads|meta ads|advertising|marketing|mailchimp|linkedin)\b", "Marketing"),
    (r"\b(accountant|lawyer|legal|consulting|bookkeep)\b", "Professional services"),
]


def keyword_category(description):
    d = (description or "").lower()
    for pattern, category in KEYWORD_CATEGORIES:
        if re.search(pattern, d):
            return category
    return ""


@job_handler("bank_categorise")
async def bank_categorise(job):
    """Give uncategorised money-out lines a likely category: free keyword rules first, then AI for the rest.
    Only descriptions are sent to the AI provider (no amounts, accounts or names of people)."""
    org_id = job["org_id"]
    settings = await org_settings(org_id)
    rows = await db.bank_transactions.find({"org_id": org_id, "status": "unmatched", "amount": {"$lt": 0}, "ai_category": {"$exists": False}},
                                           {"_id": 0, "id": 1, "description": 1}).to_list(200)
    if not rows:
        return {"categorised": 0}
    known = sorted({c for c in await db.expenses.distinct("category", {"org_id": org_id}) if c})[:60]
    by_rules, unknown = 0, []
    for r in rows:
        cat = keyword_category(r["description"])
        if cat:
            await db.bank_transactions.update_one({"id": r["id"]}, {"$set": {"ai_category": cat, "ai_source": "rules"}})
            by_rules += 1
        else:
            unknown.append(r)
    by_ai = 0
    for start in range(0, len(unknown) if settings.get("ai_assist", True) else 0, 40):
        batch = unknown[start:start + 40]
        # Long digit runs (card and account numbers, references) are removed before anything leaves the server.
        lines = "\n".join(f"{i + 1}. {re.sub(r'[0-9]{6,}', '#', r['description'])[:120]}" for i, r in enumerate(batch))
        prompt = ("Categorise each bank payment description for a small business's expense records.\n"
                  f"Prefer one of these existing categories when it fits: {', '.join(known) or '(none yet)'}.\n"
                  "Otherwise use a short common category such as Rent, Utilities, Software, Travel, Meals, Office supplies, "
                  "Marketing, Insurance, Bank fees, Professional services, Stock purchases, Fuel, Taxes, Payroll.\n"
                  "Also give the merchant/vendor name, cleaned up. If you can't tell, use an empty category.\n"
                  'Answer only with JSON: {"items": [{"n": 1, "category": "...", "vendor": "..."}]}\n\n' + lines)
        try:
            res = await generate_text(prompt, purpose="bank_categorise", org_id=org_id, max_tokens=1500, json_mode=True, cache_hours=24 * 7)
            items = res.json().get("items", [])
        except AIUnavailable as e:
            left = len(unknown) - start
            await record(org_id, "Sort bank transactions", "deferred",
                         f"Sorted {by_rules + by_ai} automatically; AI help is unavailable right now, so {left} more will be tried again later.",
                         "job", detail="; ".join(e.reasons))
            raise Defer("AI unavailable", seconds=1800)
        except (ValueError, AttributeError):
            continue  # unusable answer: leave these for the next run
        placed = set()
        for it in items if isinstance(items, list) else []:
            try:
                r = batch[int(it.get("n")) - 1]
            except (TypeError, ValueError, IndexError, AttributeError):
                continue
            cat = str(it.get("category") or "").strip()[:60]
            if cat:
                await db.bank_transactions.update_one({"id": r["id"]}, {"$set": {"ai_category": cat, "ai_vendor": str(it.get("vendor") or "").strip()[:80], "ai_source": "ai"}})
                placed.add(r["id"])
                by_ai += 1
        # The AI looked and couldn't tell: don't send these again; a person picks the category.
        rest = [r["id"] for r in batch if r["id"] not in placed]
        if rest:
            await db.bank_transactions.update_many({"id": {"$in": rest}}, {"$set": {"ai_category": "", "ai_source": "none"}})
    if by_rules or by_ai:
        await record(org_id, "Sort bank transactions", "done",
                     f"Suggested categories for {by_rules + by_ai} bank transaction{'s' if by_rules + by_ai != 1 else ''}"
                     + (f" ({by_ai} with AI help)" if by_ai else ""), "job")
    return {"categorised": by_rules + by_ai, "by_ai": by_ai, "by_rules": by_rules}


# ======================= weekly summary =======================
async def business_numbers(org_id):
    srv = _srv()
    t = date.fromisoformat(today())
    start, prev = (t - timedelta(days=7)).isoformat(), (t - timedelta(days=14)).isoformat()
    org = await _org(org_id)

    async def total(coll, field, q):
        return round(sum([float(x.get(field) or 0) async for x in db[coll].find(q, {"_id": 0, field: 1})]), 2)
    billed = {"org_id": org_id, "status": {"$nin": ["draft", "cancelled"]}}
    numbers = {
        "currency": org.get("currency") or "USD",
        "sales": await total("invoices", "total", {**billed, "issue_date": {"$gte": start}}),
        "sales_prev": await total("invoices", "total", {**billed, "issue_date": {"$gte": prev, "$lt": start}}),
        "invoices_issued": await db.invoices.count_documents({**billed, "issue_date": {"$gte": start}}),
        "money_in": await total("payments", "amount", {"org_id": org_id, "date": {"$gte": start}}),
        "money_in_prev": await total("payments", "amount", {"org_id": org_id, "date": {"$gte": prev, "$lt": start}}),
        "spent": await total("expenses", "amount", {"org_id": org_id, "date": {"$gte": start}}),
        "new_customers": await db.customers.count_documents({"org_id": org_id, "created_at": {"$gte": start}}),
    }
    overdue = await db.invoices.find({"org_id": org_id, "status": {"$in": ["overdue", "partially_paid"]}, "due_date": {"$gt": "", "$lt": today()}},
                                     {"_id": 0, "customer_name": 1, "total": 1, "amount_paid": 1, "due_date": 1, "invoice_number": 1}).to_list(2000)
    numbers["overdue"] = round(sum(srv.balance_of(i) for i in overdue), 2)
    numbers["overdue_count"] = len(overdue)
    worst = sorted(overdue, key=lambda i: -srv.balance_of(i))[:3]
    numbers["top_overdue"] = [{"customer": i.get("customer_name", ""), "amount": srv.balance_of(i), "invoice": i["invoice_number"],
                               "days": (t - date.fromisoformat(i["due_date"][:10])).days} for i in worst]
    low = await db.products.find({"org_id": org_id, "status": {"$ne": "inactive"}, "$expr": {"$lte": ["$stock_quantity", "$reorder_level"]}},
                                 {"_id": 0, "name": 1, "stock_quantity": 1}).to_list(50)
    numbers["low_stock"] = [p["name"] for p in low][:5]
    numbers["low_stock_count"] = len(low)
    numbers["bank_to_review"] = await db.bank_transactions.count_documents({"org_id": org_id, "status": "unmatched"})
    numbers["pending_approvals"] = await db.approvals.count_documents({"org_id": org_id, "status": "pending"})
    return org, numbers


def next_steps(org, n):
    """Concrete next actions from the numbers, most valuable first."""
    srv = _srv()
    steps = []
    for o in n["top_overdue"][:2]:
        steps.append(f"Chase {o['customer']} for {srv.money_in(org, o['amount'])} ({o['invoice']}, {o['days']} days late)")
    if n["pending_approvals"]:
        steps.append(f"Approve {n['pending_approvals']} prepared invoice{'s' if n['pending_approvals'] != 1 else ''} on Today")
    if n["low_stock_count"]:
        steps.append(f"Reorder {', '.join(n['low_stock'][:3])}" + (f" and {n['low_stock_count'] - 3} more" if n["low_stock_count"] > 3 else ""))
    if n["bank_to_review"]:
        steps.append(f"Confirm {n['bank_to_review']} bank transaction{'s' if n['bank_to_review'] != 1 else ''}")
    return steps[:4]


def standard_summary(org, n):
    srv = _srv()

    def trend(cur, prev):
        if not prev:
            return ""
        pct = round(100 * (cur - prev) / prev)
        return f" ({'up' if pct >= 0 else 'down'} {abs(pct)}% on the week before)" if pct else " (same as the week before)"
    parts = [f"You billed {srv.money_in(org, n['sales'])} across {n['invoices_issued']} invoice{'s' if n['invoices_issued'] != 1 else ''}{trend(n['sales'], n['sales_prev'])}",
             f"and received {srv.money_in(org, n['money_in'])}{trend(n['money_in'], n['money_in_prev'])}."]
    text = " ".join(parts)
    if n["spent"]:
        text += f" Spending was {srv.money_in(org, n['spent'])}."
    if n["overdue"]:
        text += f" {srv.money_in(org, n['overdue'])} is overdue across {n['overdue_count']} invoice{'s' if n['overdue_count'] != 1 else ''}."
    else:
        text += " Nothing is overdue."
    if n["new_customers"]:
        text += f" {n['new_customers']} new customer{'s' if n['new_customers'] != 1 else ''} joined."
    headline = "Overdue money needs attention" if n["overdue"] > max(n["money_in"], 1) else ("A good week for cash" if n["money_in"] >= n["money_in_prev"] and n["money_in"] else "Your week in numbers")
    return headline, text


async def build_summary(org_id, period, requested_by=""):
    settings = await org_settings(org_id)
    org, n = await business_numbers(org_id)
    steps = next_steps(org, n)
    headline, text = standard_summary(org, n)
    source, provider, note = "standard", "", ""
    quiet = not any(n[k] for k in ("sales", "money_in", "spent", "overdue", "new_customers", "low_stock_count", "bank_to_review"))
    if quiet:
        headline, text = "A quiet week", "Nothing was billed, paid or spent in the last 7 days, and nothing is overdue."
    if settings.get("ai_assist", True) and not quiet:
        prompt = ("You write the weekly summary for a small-business owner. Use plain, friendly English, no jargon, no hype, "
                  "and never invent numbers: use only the figures given. Amounts are in " + n["currency"] + ".\n"
                  'Answer only with JSON: {"headline": "<= 8 words", "summary": "2-3 sentences", "next_steps": ["up to 3 short imperative actions"]}\n\n'
                  f"Figures for the last 7 days: {n}\nSuggested next steps (keep their facts): {steps}")
        try:
            res = await generate_text(prompt, purpose="weekly_summary", org_id=org_id, max_tokens=500, json_mode=True)
            data = res.json()
            if data.get("summary") and data.get("headline"):
                headline, text = str(data["headline"])[:120], str(data["summary"])[:1200]
                steps = [str(s)[:200] for s in (data.get("next_steps") or steps)][:4]
                source, provider = "ai", res.provider
        except AIUnavailable as e:
            note = "Written with the standard template because AI help was unavailable."
            log.info("summary fallback for %s: %s", org_id, e.reasons)
        except (ValueError, AttributeError):
            note = "Written with the standard template because the AI answer couldn't be used."
    doc = {"org_id": org_id, "period": period, "headline": headline, "text": text, "next_steps": steps, "numbers": n,
           "source": source, "provider": provider, "note": note, "requested_by": requested_by, "created_at": now_iso()}
    await db.summaries.replace_one({"org_id": org_id, "period": period}, doc, upsert=True)
    await record(org_id, "Weekly summary", "done", f"Wrote this week's summary ({'with AI help' if source == 'ai' else 'standard template'})", "schedule")
    return doc


@job_handler("weekly_summary")
async def weekly_summary(job):
    """Fan out: one summary job per workspace that wants it, so one failure doesn't stop the others."""
    n = 0
    for org_id in await _orgs():
        if (await org_settings(org_id)).get("weekly_summary", True):
            await enqueue("summary_org", org_id, {"period": job["payload"]["slot"]}, dedupe_key=f"summary:{org_id}:{job['payload']['slot']}",
                          label="Weekly summary", max_attempts=3)
            n += 1
    return {"workspaces": n}


@job_handler("summary_org")
async def summary_org(job):
    doc = await build_summary(job["org_id"], job["payload"]["period"], job["payload"].get("requested_by", ""))
    return {"source": doc["source"], "period": doc["period"]}


# ======================= upkeep =======================
@job_handler("ai_health_check")
async def ai_health(job):
    from integrations.client import health_check
    if not any(keys_for(p) for p in ("openai", "gemini", "openrouter")):
        return {"checked": 0}
    report = await health_check()
    return {"checked": len(report), "ok": sum(1 for r in report if r["ok"]),
            "problems": [f"{r['provider']} {r['key']}: {r['kind']}" for r in report if not r["ok"]]}


@job_handler("bank_sync")
async def bank_sync(job):
    import bank
    if not bank.plaid_configured():
        return {"skipped": "Plaid not configured"}
    added = failed = 0
    async for item in db.bank_items.find({}, {"_id": 0}):
        try:
            a, _ = await bank._sync_item(item)
            added += a
            if a:
                await _srv().emit_event(item["org_id"], "bank_imported", {"count": a, "source": "plaid"})
        except Exception as e:
            failed += 1
            await db.bank_accounts.update_many({"item_id": item["item_id"], "org_id": item["org_id"]},
                                               {"$set": {"error": "The last automatic sync failed; it will try again in a few hours"}})
            await record(item["org_id"], "Bank sync", "needs_attention", "A connected bank couldn't be synced. It will be retried automatically.",
                         "schedule", detail=repr(e))
    return {"imported": added, "failed": failed}


@job_handler("cleanup")
async def cleanup(job):
    now = datetime.now(timezone.utc)
    old = (now - timedelta(days=14)).isoformat()
    very_old = (now - timedelta(days=60)).isoformat()
    a = await db.jobs.delete_many({"status": {"$in": ["done", "skipped"]}, "updated_at": {"$lt": old}})
    b = await db.jobs.delete_many({"status": "failed", "updated_at": {"$lt": very_old}})
    c = await db.snoozes.delete_many({"until": {"$lt": now.isoformat()}})
    d = await db.approvals.delete_many({"status": {"$in": ["done", "rejected"]}, "updated_at": {"$lt": very_old}})
    return {"jobs": a.deleted_count + b.deleted_count, "snoozes": c.deleted_count, "approvals": d.deleted_count}


schedule("Overdue check", every(15), "overdue_scan")
schedule("Repeating invoices and bills", every(60), "recurring_run")
schedule("Collections follow-up", daily, "collections_followup")
schedule("Clean-up", daily, "cleanup")
schedule("Integration health check", every(30), "ai_health_check")
schedule("Bank sync", every_hours(6), "bank_sync")
schedule("Weekly summary", weekly, "weekly_summary")
