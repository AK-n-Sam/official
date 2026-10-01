"""Bank feeds.

Transactions arrive in two ways:
  * Import a statement (CSV / OFX / QFX) downloaded from any bank's online banking: free, no sign-up.
  * Connect a bank through Plaid: live, once PLAID_CLIENT_ID / PLAID_SECRET are set on the server.
Then each transaction is confirmed as what it was (an invoice payment, a bill paid, a new expense)
in one click, using suggestions matched against the books. Nothing changes the books without the
user confirming, and every confirmation can be undone.
"""
import base64
import csv
import hashlib
import io
import os
import re
import uuid
from datetime import date, datetime
from typing import List, Literal, Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from auth import get_current_user
from crud import can_manage_team, member_filter, all_of
from database import db, now_iso

router = APIRouter(prefix="/api/bank", tags=["bank"])

UNPAID = ("sent", "pending", "partially_paid", "overdue")


def _srv():
    # server.py imports this module; reach back for the shared invoice/payment helpers at call time.
    import server
    return server


# ---------------- access ----------------
async def bank_user(user: dict = Depends(get_current_user)):
    if not can_manage_team(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can see the bank")
    return user


# ---------------- Plaid ----------------
PLAID_HOSTS = {"sandbox": "https://sandbox.plaid.com", "production": "https://production.plaid.com"}


def plaid_config():
    env = (os.environ.get("PLAID_ENV") or "sandbox").strip().lower()
    return {
        "client_id": os.environ.get("PLAID_CLIENT_ID", "").strip(),
        "secret": os.environ.get("PLAID_SECRET", "").strip(),
        "env": env,
        "base": (os.environ.get("PLAID_BASE_URL") or PLAID_HOSTS.get(env, PLAID_HOSTS["sandbox"])).rstrip("/"),
        "countries": [c.strip().upper() for c in (os.environ.get("PLAID_COUNTRY_CODES") or "US,CA").split(",") if c.strip()],
    }


def plaid_configured() -> bool:
    cfg = plaid_config()
    return bool(cfg["client_id"] and cfg["secret"])


async def plaid_call(path: str, body: dict) -> dict:
    cfg = plaid_config()
    if not plaid_configured():
        raise HTTPException(status_code=400, detail="Live bank connections aren't set up on this server yet. Import a statement instead, or add Plaid keys.")
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            r = await http.post(f"{cfg['base']}{path}", json={"client_id": cfg["client_id"], "secret": cfg["secret"], **body})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Couldn't reach the bank connection service. Try again in a moment.")
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.status_code != 200:
        if data.get("error_code") == "ITEM_LOGIN_REQUIRED":
            raise HTTPException(status_code=400, detail="Your bank needs you to sign in again. Remove the account and connect it again.")
        raise HTTPException(status_code=400, detail=data.get("display_message") or data.get("error_message") or "The bank connection service rejected the request.")
    return data


def _fernet() -> Fernet:
    key = hashlib.sha256(("nexusos-bank-tokens:" + os.environ["JWT_SECRET"]).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def seal(text: str) -> str:
    """Bank access tokens are stored encrypted and never sent to the browser."""
    return _fernet().encrypt(text.encode()).decode()


def unseal(text: str) -> str:
    return _fernet().decrypt(text.encode()).decode()


# ---------------- statement parsing ----------------
DATE_FORMATS_DMY = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y", "%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y",
                    "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%b-%y", "%d %b %y", "%b %d, %Y", "%B %d, %Y", "%Y/%m/%d", "%Y%m%d"]
DATE_FORMATS_MDY = ["%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y",
                    "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%b-%y", "%d %b %y", "%b %d, %Y", "%B %d, %Y", "%Y/%m/%d", "%Y%m%d"]

KEYS = {
    "date": ["transaction date", "txn date", "posting date", "posted date", "booking date", "value date", "date"],
    "description": ["description", "narration", "narrative", "details", "transaction details", "particulars", "payee", "merchant", "name", "memo", "reference", "remarks"],
    "amount": ["amount", "transaction amount", "amount (gbp)", "amount (usd)", "amount (eur)", "amount (inr)", "value"],
    "money_in": ["credit", "credits", "deposit", "deposits", "paid in", "money in", "credit amount", "deposit amt", "deposit amt."],
    "money_out": ["debit", "debits", "withdrawal", "withdrawals", "paid out", "money out", "debit amount", "withdrawal amt", "withdrawal amt."],
    "sign": ["type", "dr/cr", "cr/dr", "debit/credit", "transaction type"],
}


def _clean(h):
    return re.sub(r"\s+", " ", (h or "").strip().lower().replace("﻿", ""))


def _find(headers, kind, taken=()):
    cleaned = [_clean(h) for h in headers]
    for key in KEYS[kind]:  # exact names first, in order of preference
        for i, h in enumerate(cleaned):
            if h == key and headers[i] not in taken:
                return headers[i]
    for key in KEYS[kind]:
        for i, h in enumerate(cleaned):
            # "Value Date" must not be mistaken for an amount, nor "Closing Balance" for anything.
            if key in h and headers[i] not in taken and "balance" not in h and (kind == "date" or "date" not in h):
                return headers[i]
    return ""


def parse_amount(text) -> Optional[float]:
    s = (text or "").strip()
    if not s:
        return None
    negative = (s.startswith("(") and s.endswith(")")) or s.startswith("-") or s.endswith("-") or bool(re.search(r"\bdr\b", s, re.I))
    credit = bool(re.search(r"\bcr\b", s, re.I))
    t = re.sub(r"[^\d.,]", "", s)
    if re.search(r",\d{1,2}$", t):  # European style: 1.234,56
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", "")
    if not re.search(r"\d", t):
        return None
    try:
        value = float(t)
    except ValueError:
        return None
    return -value if negative and not credit else value


def detect_date_format(values, prefer_dmy=True):
    values = [v.strip() for v in values if v and v.strip()][:200]
    if not values:
        return ""
    for fmt in (DATE_FORMATS_DMY if prefer_dmy else DATE_FORMATS_MDY):
        try:
            for v in values:
                datetime.strptime(v[:30], fmt)
            return fmt
        except ValueError:
            continue
    return ""


def parse_date(text, fmt) -> str:
    try:
        return datetime.strptime((text or "").strip()[:30], fmt).date().isoformat()
    except ValueError:
        return ""


def _rows(text):
    sample = text[:5000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    return [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]


def detect_csv(text, prefer_dmy=True):
    """Find the header row (banks often put account details above it) and the columns that matter."""
    rows = _rows(text)
    if not rows:
        raise HTTPException(status_code=400, detail="That file is empty.")
    header_idx = 0
    for i, r in enumerate(rows[:20]):
        cleaned = [_clean(c) for c in r]
        has_date = any("date" in c for c in cleaned)
        has_money = any(any(k in c for k in ("amount", "debit", "credit", "paid", "withdrawal", "deposit", "money", "value")) for c in cleaned)
        if has_date and has_money:
            header_idx = i
            break
    headers = [h.strip() for h in rows[header_idx]]
    body = rows[header_idx + 1:]
    mapping = {"date": _find(headers, "date")}
    mapping["money_in"] = _find(headers, "money_in")
    mapping["money_out"] = _find(headers, "money_out", (mapping["money_in"],))
    mapping["amount"] = "" if (mapping["money_in"] and mapping["money_out"]) else _find(headers, "amount", (mapping["date"],))
    mapping["description"] = _find(headers, "description", (mapping["date"], mapping["amount"], mapping["money_in"], mapping["money_out"]))
    sign = _find(headers, "sign", tuple(mapping.values()))
    if sign:
        idx = headers.index(sign)
        vals = {(_clean(r[idx]) if idx < len(r) else "") for r in body[:50]} - {""}
        mapping["sign"] = sign if vals and vals <= {"dr", "cr", "debit", "credit", "d", "c"} else ""
    else:
        mapping["sign"] = ""
    if mapping["date"]:
        idx = headers.index(mapping["date"])
        mapping["date_format"] = detect_date_format([r[idx] for r in body if idx < len(r)], prefer_dmy)
    else:
        mapping["date_format"] = ""
    return headers, body, mapping


def rows_from_csv(headers, body, mapping):
    col = {k: (headers.index(v) if v in headers else -1) for k, v in mapping.items() if k != "date_format"}
    get = lambda r, k: (r[col[k]] if col.get(k, -1) >= 0 and col[k] < len(r) else "")
    out, skipped = [], 0
    for r in body:
        d = parse_date(get(r, "date"), mapping.get("date_format") or "%Y-%m-%d")
        if col.get("money_in", -1) >= 0 or col.get("money_out", -1) >= 0:
            inc, outg = parse_amount(get(r, "money_in")), parse_amount(get(r, "money_out"))
            amount = (abs(inc) if inc else 0.0) - (abs(outg) if outg else 0.0) if (inc or outg) else None
        else:
            amount = parse_amount(get(r, "amount"))
            if amount is not None and col.get("sign", -1) >= 0:
                amount = -abs(amount) if _clean(get(r, "sign")) in ("dr", "debit", "d") else abs(amount)
        desc = re.sub(r"\s+", " ", get(r, "description")).strip()
        if not d or amount is None or abs(amount) < 0.005:
            skipped += 1
            continue
        out.append({"date": d, "description": desc[:300] or "(no description)", "amount": round(amount, 2)})
    return out, skipped


def rows_from_ofx(text):
    out = []
    for block in re.findall(r"<STMTTRN>(.*?)(?=</STMTTRN>|<STMTTRN>|</BANKTRANLIST>)", text, re.S | re.I):
        tag = lambda name: (re.search(rf"<{name}>([^<\r\n]*)", block, re.I) or [None, ""])[1].strip()
        raw_date, amount = tag("DTPOSTED")[:8], parse_amount(tag("TRNAMT"))
        name, memo = tag("NAME"), tag("MEMO")
        try:
            d = datetime.strptime(raw_date, "%Y%m%d").date().isoformat()
        except ValueError:
            continue
        if amount is None:
            continue
        desc = name if not memo or memo == name else f"{name} {memo}".strip()
        out.append({"date": d, "description": (desc or "(no description)")[:300], "amount": round(amount, 2), "fitid": tag("FITID")})
    if not out:
        raise HTTPException(status_code=400, detail="No transactions were found in that OFX file.")
    return out


def is_ofx(filename, text):
    return filename.lower().endswith((".ofx", ".qfx")) or "<OFX>" in text[:2000].upper()


# ---------------- matching ----------------
STOP = {"limited", "ltd", "inc", "llc", "corp", "corporation", "company", "group", "the", "and", "services", "trading", "payment",
        "transfer", "from", "card", "bank", "online", "direct", "debit", "credit", "with"}


def _norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _tokens(name):
    return [w for w in _norm(name).split() if len(w) >= 4 and w not in STOP]


def _mentions(desc_norm, name):
    words = set(desc_norm.split())
    return any(t in words for t in _tokens(name))


TRANSFER_RE = re.compile(r"\b(transfer|tfr|trf|xfer|savings|own account|between accounts|to a ?c|from a ?c|sweep)\b")


def _transfer(desc_norm):
    return {"action": "ignore", "confidence": "medium", "label": "Looks like a transfer between your own accounts",
            "reason": "ignore it, unless it really was a sale or a cost"}


def _balance(inv):
    return round(float(inv.get("total", 0)) - float(inv.get("amount_paid", 0) or 0), 2)


async def match_context(user):
    org_id = user["active_org_id"]
    mf = member_filter(user)
    invoices = [i for i in await db.invoices.find(all_of({"org_id": org_id, "status": {"$in": list(UNPAID)}}, mf),
                                                  {"_id": 0, "items": 0}).to_list(5000) if _balance(i) > 0]
    pending = await db.expenses.find(all_of({"org_id": org_id, "status": "pending"}, mf), {"_id": 0}).to_list(2000)
    recent = await db.expenses.find(all_of({"org_id": org_id, "status": "paid", "bank_txn_id": {"$in": [None, ""]}}, mf),
                                    {"_id": 0}).sort("date", -1).to_list(2000)
    suppliers = await db.suppliers.find({"org_id": org_id}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    vendor_category = {}
    async for e in db.expenses.find({"org_id": org_id}, {"_id": 0, "vendor": 1, "category": 1}).sort("date", 1):
        if e.get("vendor"):
            vendor_category[e["vendor"].lower()] = e["category"]  # most recent wins
    return {"invoices": invoices, "pending": pending, "recent": recent, "suppliers": suppliers, "vendor_category": vendor_category}


def suggest(txn, ctx):
    """The most likely meaning of a bank transaction, with a confidence and a plain reason."""
    desc = _norm(txn["description"])
    amount = txn["amount"]
    if amount > 0:
        best = None
        for inv in ctx["invoices"]:
            bal = _balance(inv)
            if amount > bal + 0.01:
                continue
            score, why = 0, []
            digits = re.sub(r"\D", "", inv["invoice_number"])
            if _norm(inv["invoice_number"]) in desc or (len(digits) >= 3 and digits in desc.split()):
                score += 60
                why.append(f"mentions {inv['invoice_number']}")
            if abs(bal - amount) < 0.01:
                score += 40
                why.append("same amount as the balance")
            if _mentions(desc, inv.get("customer_name", "")):
                score += 30
                why.append(f"from {inv.get('customer_name')}")
            # Ties go to the invoice that has been waiting longest.
            due = inv.get("due_date") or inv.get("issue_date") or ""
            if score >= 30 and (not best or score > best[0] or (score == best[0] and due < best[3])):
                best = (score, inv, why, due)
        if not best:
            return _transfer(desc) if TRANSFER_RE.search(desc) else None
        score, inv, why, _ = best
        partial = amount < _balance(inv) - 0.01
        return {"action": "invoice_payment", "invoice_id": inv["id"], "confidence": "high" if score >= 70 else "medium",
                "label": f"{'Part payment' if partial else 'Payment'} for {inv['invoice_number']} · {inv.get('customer_name', '')}", "reason": ", ".join(why)}

    spent = -amount
    best = None
    for e in ctx["pending"]:
        if abs(e["amount"] - spent) < 0.01:
            score = 50 + (30 if _mentions(desc, e.get("vendor") or e["category"]) else 0)
            if not best or score > best[0]:
                best = (score, {"action": "expense_paid", "expense_id": e["id"], "label": f"Pays the unpaid bill: {e.get('vendor') or e['category']}",
                                "reason": "same amount as an unpaid bill"})
    txn_day = date.fromisoformat(txn["date"])
    for e in ctx["recent"]:
        try:
            near = abs((date.fromisoformat(e["date"][:10]) - txn_day).days) <= 5
        except ValueError:
            near = False
        if near and abs(e["amount"] - spent) < 0.01:
            score = 60 + (30 if _mentions(desc, e.get("vendor") or e["category"]) else 0)
            if not best or score > best[0]:
                best = (score, {"action": "link_expense", "expense_id": e["id"], "label": f"Already recorded: {e['category']}{' · ' + e['vendor'] if e.get('vendor') else ''}",
                                "reason": "same amount, recorded within a few days"})
    if best:
        score, s = best
        return {**s, "confidence": "high" if score >= 70 else "medium"}
    if TRANSFER_RE.search(desc):
        return _transfer(desc)
    supplier = next((s for s in ctx["suppliers"] if _mentions(desc, s["name"])), None)
    vendor = supplier["name"] if supplier else next((v for v in ctx["vendor_category"] if _mentions(desc, v)), "")
    category = ctx["vendor_category"].get(vendor.lower(), "") if vendor else ""
    if vendor and category:
        return {"action": "create_expense", "vendor": vendor.title() if not supplier else vendor, "supplier_id": supplier["id"] if supplier else "",
                "category": category, "confidence": "medium", "label": f"New expense: {category} · {vendor}", "reason": f"you've paid {vendor} before"}
    guess = " ".join(w.capitalize() for w in _norm(txn["description"]).split()[:3])
    name = supplier["name"] if supplier else (vendor.title() if vendor else (txn.get("ai_vendor") or guess))
    if txn.get("ai_category"):
        # Filled in by the background categoriser. Never "high": a person confirms new expenses.
        how = "suggested by AI from the description" if txn.get("ai_source") == "ai" else "suggested from the description"
        return {"action": "create_expense", "vendor": name, "supplier_id": supplier["id"] if supplier else "", "category": txn["ai_category"],
                "confidence": "medium", "label": f"New expense: {txn['ai_category']}" + (f" · {name}" if name else ""), "reason": how}
    return {"action": "create_expense", "vendor": name, "supplier_id": supplier["id"] if supplier else "",
            "category": "", "confidence": "low", "label": "New expense", "reason": "choose a category"}


# ---------------- models ----------------
class _B(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class Mapping(_B):
    date: str = ""
    description: str = ""
    amount: str = ""
    money_in: str = ""
    money_out: str = ""
    sign: str = ""
    date_format: str = ""


class ImportInput(_B):
    filename: str = Field(default="statement.csv", max_length=200)
    content: str = Field(min_length=1, max_length=3_000_000)
    account_id: Optional[str] = ""
    account_name: Optional[str] = Field(default="", max_length=120)
    mapping: Optional[Mapping] = None


class ExchangeInput(_B):
    public_token: str = Field(min_length=5)
    institution_name: Optional[str] = Field(default="", max_length=120)


class MatchInput(_B):
    action: Literal["invoice_payment", "expense_paid", "link_expense", "create_expense", "ignore"]
    invoice_id: Optional[str] = ""
    expense_id: Optional[str] = ""
    category: Optional[str] = Field(default="", max_length=120)
    vendor: Optional[str] = Field(default="", max_length=200)
    supplier_id: Optional[str] = ""


class BulkInput(_B):
    ids: List[str] = Field(default_factory=list, max_length=500)


# ---------------- helpers ----------------
def _public_account(a):
    return {k: a.get(k) for k in ("id", "name", "mask", "institution", "source", "currency", "balance", "last_synced_at", "created_at", "error")}


async def _store(org_id, account, rows, user_id, source):
    """Insert new transactions; anything already imported (same external id) is skipped."""
    existing = {t["external_id"] async for t in db.bank_transactions.find({"org_id": org_id, "account_id": account["id"]}, {"_id": 0, "external_id": 1})}
    seen, new = {}, []
    for r in rows:
        if r.get("fitid"):
            ext = f"fit:{r['fitid']}"
        else:
            base = f"{r['date']}|{r['amount']:.2f}|{_norm(r['description'])}"
            seen[base] = seen.get(base, 0) + 1  # identical lines on the same day are real, separate payments
            ext = "h:" + hashlib.sha1(f"{base}|{seen[base]}".encode()).hexdigest()
        if ext in existing:
            continue
        existing.add(ext)
        new.append({"id": str(uuid.uuid4()), "org_id": org_id, "account_id": account["id"], "external_id": ext, "date": r["date"],
                    "description": r["description"], "amount": r["amount"], "status": "unmatched", "match": None, "source": source,
                    "created_by": user_id, "created_at": now_iso()})
    if new:
        await db.bank_transactions.insert_many(new)
    return len(new), len(rows) - len(new)


async def _get_txn(user, txn_id):
    t = await db.bank_transactions.find_one({"id": txn_id, "org_id": user["active_org_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    return t


async def apply_match(user, t, m: MatchInput):
    """Turn a bank line into what it was in the books. Returns the stored match description."""
    srv = _srv()
    org_id = user["active_org_id"]
    if t["status"] != "unmatched":
        raise HTTPException(status_code=409, detail="This transaction has already been dealt with. Undo it first to change it.")
    if m.action == "ignore":
        return "ignored", {"type": "ignore", "label": "Ignored (not business income or a cost)"}
    if m.action == "invoice_payment":
        if t["amount"] <= 0:
            raise HTTPException(status_code=400, detail="Only money coming in can pay an invoice.")
        invoice = await srv._get_invoice(user, m.invoice_id)
        bal = _balance(invoice)
        if invoice["status"] not in UNPAID or bal <= 0:
            raise HTTPException(status_code=400, detail=f"{invoice['invoice_number']} has nothing left to pay.")
        if t["amount"] > bal + 0.01:
            raise HTTPException(status_code=400, detail=f"This deposit ({t['amount']:,.2f}) is more than {invoice['invoice_number']}'s balance ({bal:,.2f}). Pick another invoice.")
        await srv._apply_payment(user, invoice, t["amount"], "bank_transfer", t["date"], f"From bank: {t['description'][:80]}")
        payment = await db.payments.find_one({"org_id": org_id, "invoice_id": invoice["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        await db.payments.update_one({"id": payment["id"]}, {"$set": {"bank_txn_id": t["id"]}})
        return "matched", {"type": "invoice_payment", "invoice_id": invoice["id"], "payment_id": payment["id"],
                           "label": f"Payment for {invoice['invoice_number']} · {invoice.get('customer_name', '')}"}
    if t["amount"] >= 0:
        raise HTTPException(status_code=400, detail="Only money going out can be an expense.")
    spent = round(-t["amount"], 2)
    if m.action in ("expense_paid", "link_expense"):
        e = await db.expenses.find_one(all_of({"id": m.expense_id, "org_id": org_id}, member_filter(user)), {"_id": 0})
        if not e:
            raise HTTPException(status_code=404, detail="Expense not found")
        if e.get("bank_txn_id"):
            raise HTTPException(status_code=409, detail="That expense is already linked to another bank transaction.")
        updates = {"bank_txn_id": t["id"], "updated_at": now_iso()}
        if m.action == "expense_paid":
            updates.update({"status": "paid", "payment_method": "bank_transfer"})
        await db.expenses.update_one({"id": e["id"], "org_id": org_id}, {"$set": updates})
        verb = "Paid" if m.action == "expense_paid" else "Matches"
        return "matched", {"type": m.action, "expense_id": e["id"], "previous_status": e.get("status"),
                           "label": f"{verb}: {e['category']}{' · ' + e['vendor'] if e.get('vendor') else ''}"}
    # create_expense
    if not m.category:
        raise HTTPException(status_code=422, detail="Choose a category for this expense")
    vendor = m.vendor
    if m.supplier_id:
        sup = await db.suppliers.find_one({"id": m.supplier_id, "org_id": org_id}, {"_id": 0, "name": 1})
        if not sup:
            raise HTTPException(status_code=400, detail="The selected supplier no longer exists")
        vendor = sup["name"]
    expense = {"id": str(uuid.uuid4()), "org_id": org_id, "category": m.category, "vendor": vendor or "", "supplier_id": m.supplier_id or "",
               "description": f"From bank: {t['description']}"[:2000], "amount": spent, "date": t["date"], "status": "paid",
               "payment_method": "bank_transfer", "bank_txn_id": t["id"], "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso()}
    await db.expenses.insert_one(expense)
    return "matched", {"type": "create_expense", "expense_id": expense["id"], "label": f"Expense: {m.category}{' · ' + vendor if vendor else ''}"}


# ---------------- endpoints ----------------
@router.get("/status")
async def bank_status(user: dict = Depends(bank_user)):
    org_id = user["active_org_id"]
    accounts = await db.bank_accounts.find({"org_id": org_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    cfg = plaid_config()
    return {
        "plaid": {"configured": plaid_configured(), "env": cfg["env"], "countries": cfg["countries"]},
        "accounts": [_public_account(a) for a in accounts],
        "review_count": await db.bank_transactions.count_documents({"org_id": org_id, "status": "unmatched"}),
    }


@router.post("/import/preview")
async def import_preview(payload: ImportInput, user: dict = Depends(bank_user)):
    """Read a statement without saving it: detected columns and the first rows as they'll be imported."""
    org = await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0, "currency": 1})
    if is_ofx(payload.filename, payload.content):
        rows = rows_from_ofx(payload.content)
        return {"format": "ofx", "columns": [], "mapping": None, "rows": rows[:8], "count": len(rows), "skipped": 0}
    headers, body, mapping = detect_csv(payload.content, prefer_dmy=(org or {}).get("currency") != "USD")
    if payload.mapping:
        mapping = {**mapping, **{k: v for k, v in payload.mapping.model_dump().items()}}
    problems = []
    if not mapping["date"]:
        problems.append("Couldn't find the date column")
    elif not mapping["date_format"]:
        problems.append("Couldn't read the dates")
    if not (mapping["amount"] or mapping["money_in"] or mapping["money_out"]):
        problems.append("Couldn't find the amount column")
    rows, skipped = rows_from_csv(headers, body, mapping) if not problems else ([], len(body))
    if not problems and not rows:
        problems.append("No transactions could be read with these columns")
    return {"format": "csv", "columns": headers, "mapping": mapping, "rows": rows[:8], "count": len(rows), "skipped": skipped, "problems": problems}


@router.post("/import")
async def import_statement(payload: ImportInput, user: dict = Depends(bank_user)):
    org_id = user["active_org_id"]
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "currency": 1})
    if is_ofx(payload.filename, payload.content):
        rows = rows_from_ofx(payload.content)
    else:
        headers, body, mapping = detect_csv(payload.content, prefer_dmy=(org or {}).get("currency") != "USD")
        if payload.mapping:
            mapping = {**mapping, **payload.mapping.model_dump()}
        rows, _ = rows_from_csv(headers, body, mapping)
    if not rows:
        raise HTTPException(status_code=400, detail="No transactions could be read from that file. Check the columns in the preview.")
    if payload.account_id:
        account = await db.bank_accounts.find_one({"id": payload.account_id, "org_id": org_id}, {"_id": 0})
        if not account:
            raise HTTPException(status_code=404, detail="Bank account not found")
    else:
        account = {"id": str(uuid.uuid4()), "org_id": org_id, "name": payload.account_name or "Bank account", "mask": "", "institution": "",
                   "source": "import", "currency": (org or {}).get("currency") or "USD", "balance": None, "created_at": now_iso(),
                   "last_synced_at": now_iso(), "created_by": user["id"]}
        await db.bank_accounts.insert_one(account)
        account.pop("_id", None)
    added, duplicates = await _store(org_id, account, rows, user["id"], "import")
    await db.bank_accounts.update_one({"id": account["id"]}, {"$set": {"last_synced_at": now_iso()}})
    if added:
        await _srv().emit_event(org_id, "bank_imported", {"count": added, "source": "file"}, user["id"])
    return {"account": _public_account(account), "imported": added, "duplicates": duplicates,
            "first_date": min(r["date"] for r in rows), "last_date": max(r["date"] for r in rows)}


@router.post("/plaid/link-token")
async def plaid_link_token(user: dict = Depends(bank_user)):
    cfg = plaid_config()
    data = await plaid_call("/link/token/create", {
        "client_name": "NexusOS", "language": "en", "country_codes": cfg["countries"], "products": ["transactions"],
        "user": {"client_user_id": user["id"]}, "transactions": {"days_requested": 90},
    })
    return {"link_token": data["link_token"], "env": cfg["env"]}


async def _sync_item(item):
    """Pull new, changed and removed transactions for one connected bank since the last sync."""
    try:
        token = unseal(item["access_token_enc"])
    except (InvalidToken, KeyError):
        await db.bank_accounts.update_many({"item_id": item["item_id"], "org_id": item["org_id"]}, {"$set": {"error": "Reconnect this bank"}})
        return 0, 0
    accounts = {a["plaid_account_id"]: a async for a in db.bank_accounts.find({"org_id": item["org_id"], "item_id": item["item_id"]}, {"_id": 0})}
    cursor, added, removed = item.get("cursor") or "", 0, 0
    for _ in range(25):
        body = {"access_token": token, "count": 250, **({"cursor": cursor} if cursor else {})}
        data = await plaid_call("/transactions/sync", body)
        rows_by_account = {}
        for tx in data.get("added", []) + data.get("modified", []):
            acct = accounts.get(tx.get("account_id"))
            if not acct or tx.get("pending"):
                continue
            rows_by_account.setdefault(acct["id"], (acct, []))[1].append({
                "date": tx["date"], "description": (tx.get("merchant_name") or tx.get("name") or "(no description)")[:300],
                # Plaid reports money out as positive; the books use money in as positive.
                "amount": round(-float(tx["amount"]), 2), "fitid": tx["transaction_id"]})
        for acct, rows in rows_by_account.values():
            n, _ = await _store(item["org_id"], acct, rows, item.get("created_by", ""), "plaid")
            added += n
        gone = [f"fit:{r['transaction_id']}" for r in data.get("removed", [])]
        if gone:
            res = await db.bank_transactions.delete_many({"org_id": item["org_id"], "external_id": {"$in": gone}, "status": "unmatched"})
            removed += res.deleted_count
        cursor = data.get("next_cursor") or cursor
        if not data.get("has_more"):
            break
    try:
        balances = await plaid_call("/accounts/get", {"access_token": token})
        for a in balances.get("accounts", []):
            if a["account_id"] in accounts:
                bal = (a.get("balances") or {}).get("current")
                await db.bank_accounts.update_one({"id": accounts[a["account_id"]]["id"]}, {"$set": {"balance": bal, "error": ""}})
    except HTTPException:
        pass
    await db.bank_items.update_one({"item_id": item["item_id"], "org_id": item["org_id"]}, {"$set": {"cursor": cursor, "last_synced_at": now_iso()}})
    await db.bank_accounts.update_many({"item_id": item["item_id"], "org_id": item["org_id"]}, {"$set": {"last_synced_at": now_iso()}})
    return added, removed


@router.post("/plaid/exchange")
async def plaid_exchange(payload: ExchangeInput, user: dict = Depends(bank_user)):
    org_id = user["active_org_id"]
    data = await plaid_call("/item/public_token/exchange", {"public_token": payload.public_token})
    token, item_id = data["access_token"], data["item_id"]
    item = {"org_id": org_id, "item_id": item_id, "access_token_enc": seal(token), "institution": payload.institution_name or "",
            "cursor": "", "created_by": user["id"], "created_at": now_iso()}
    await db.bank_items.update_one({"org_id": org_id, "item_id": item_id}, {"$set": item}, upsert=True)
    accounts = await plaid_call("/accounts/get", {"access_token": token})
    created = []
    for a in accounts.get("accounts", []):
        if a.get("type") not in ("depository", "credit"):
            continue
        doc = {"id": str(uuid.uuid4()), "org_id": org_id, "item_id": item_id, "plaid_account_id": a["account_id"],
               "name": a.get("name") or a.get("official_name") or "Account", "mask": a.get("mask") or "", "institution": payload.institution_name or "",
               "source": "plaid", "currency": (a.get("balances") or {}).get("iso_currency_code") or "", "balance": (a.get("balances") or {}).get("current"),
               "created_at": now_iso(), "last_synced_at": "", "created_by": user["id"], "error": ""}
        existing = await db.bank_accounts.find_one({"org_id": org_id, "plaid_account_id": a["account_id"]}, {"_id": 0, "id": 1})
        if not existing:
            await db.bank_accounts.insert_one(doc)
            doc.pop("_id", None)
            created.append(_public_account(doc))
    added, _ = await _sync_item(await db.bank_items.find_one({"org_id": org_id, "item_id": item_id}, {"_id": 0}))
    if added:
        await _srv().emit_event(org_id, "bank_imported", {"count": added, "source": "plaid"}, user["id"])
    return {"accounts": created, "imported": added}


@router.post("/sync")
async def sync_all(user: dict = Depends(bank_user)):
    added = removed = 0
    async for item in db.bank_items.find({"org_id": user["active_org_id"]}, {"_id": 0}):
        a, r = await _sync_item(item)
        added, removed = added + a, removed + r
    if added:
        await _srv().emit_event(user["active_org_id"], "bank_imported", {"count": added, "source": "plaid"}, user["id"])
    return {"imported": added, "removed": removed}


@router.delete("/accounts/{account_id}")
async def remove_account(account_id: str, user: dict = Depends(bank_user)):
    """Stop following an account. Payments and expenses already confirmed from it stay in the books."""
    org_id = user["active_org_id"]
    account = await db.bank_accounts.find_one({"id": account_id, "org_id": org_id}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Bank account not found")
    await db.bank_accounts.delete_one({"id": account_id, "org_id": org_id})
    await db.bank_transactions.delete_many({"org_id": org_id, "account_id": account_id, "status": "unmatched"})
    if account.get("item_id") and not await db.bank_accounts.count_documents({"org_id": org_id, "item_id": account["item_id"]}):
        item = await db.bank_items.find_one({"org_id": org_id, "item_id": account["item_id"]}, {"_id": 0})
        if item:
            try:
                await plaid_call("/item/remove", {"access_token": unseal(item["access_token_enc"])})
            except (HTTPException, InvalidToken):
                pass  # disconnect locally even if the bank side can't be reached
            await db.bank_items.delete_one({"org_id": org_id, "item_id": account["item_id"]})
    return {"success": True}


@router.get("/transactions")
async def list_transactions(status: str = "review", user: dict = Depends(bank_user)):
    org_id = user["active_org_id"]
    q = {"org_id": org_id, "status": {"review": "unmatched", "matched": "matched", "ignored": "ignored"}.get(status, "unmatched")}
    txns = await db.bank_transactions.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(1000)
    accounts = {a["id"]: a["name"] async for a in db.bank_accounts.find({"org_id": org_id}, {"_id": 0, "id": 1, "name": 1})}
    ctx = await match_context(user) if q["status"] == "unmatched" else None
    for t in txns:
        t["account_name"] = accounts.get(t["account_id"], "")
        if ctx:
            t["suggestion"] = suggest(t, ctx)
    counts = {k: await db.bank_transactions.count_documents({"org_id": org_id, "status": v})
              for k, v in (("review", "unmatched"), ("matched", "matched"), ("ignored", "ignored"))}
    return {"transactions": txns, "counts": counts}


@router.post("/transactions/{txn_id}/match")
async def match_transaction(txn_id: str, payload: MatchInput, user: dict = Depends(bank_user)):
    t = await _get_txn(user, txn_id)
    status, match = await apply_match(user, t, payload)
    await db.bank_transactions.update_one({"id": txn_id, "org_id": user["active_org_id"], "status": "unmatched"},
                                          {"$set": {"status": status, "match": match, "matched_by": user["id"], "matched_at": now_iso()}})
    return {**t, "status": status, "match": match}


@router.post("/transactions/confirm")
async def confirm_suggestions(payload: BulkInput, user: dict = Depends(bank_user)):
    """Confirm the high-confidence suggestions for the given transactions (or all of them)."""
    org_id = user["active_org_id"]
    q = {"org_id": org_id, "status": "unmatched", **({"id": {"$in": payload.ids}} if payload.ids else {})}
    done = 0
    for t in await db.bank_transactions.find(q, {"_id": 0}).sort("date", 1).to_list(500):
        s = suggest(t, await match_context(user))  # fresh context: earlier confirmations change balances
        if not s or s["confidence"] != "high":
            continue
        try:
            status, match = await apply_match(user, t, MatchInput(**{k: v for k, v in s.items() if k in MatchInput.model_fields}))
        except HTTPException:
            continue
        await db.bank_transactions.update_one({"id": t["id"], "org_id": org_id}, {"$set": {"status": status, "match": match, "matched_by": user["id"], "matched_at": now_iso()}})
        done += 1
    return {"confirmed": done}


@router.post("/transactions/{txn_id}/undo")
async def undo_transaction(txn_id: str, user: dict = Depends(bank_user)):
    """Put a transaction back to "to review", reversing whatever confirming it did to the books."""
    org_id = user["active_org_id"]
    t = await _get_txn(user, txn_id)
    m = t.get("match") or {}
    if t["status"] == "unmatched":
        return t
    if m.get("type") == "invoice_payment" and m.get("payment_id"):
        payment = await db.payments.find_one({"id": m["payment_id"], "org_id": org_id}, {"_id": 0})
        if payment:
            await _srv()._remove_payment(org_id, payment)
    elif m.get("type") == "create_expense":
        await db.expenses.delete_one({"id": m.get("expense_id"), "org_id": org_id, "bank_txn_id": txn_id})
    elif m.get("type") in ("expense_paid", "link_expense"):
        updates = {"bank_txn_id": "", "updated_at": now_iso()}
        if m["type"] == "expense_paid":
            updates["status"] = m.get("previous_status") or "pending"
        await db.expenses.update_one({"id": m.get("expense_id"), "org_id": org_id}, {"$set": updates})
    await db.bank_transactions.update_one({"id": txn_id, "org_id": org_id}, {"$set": {"status": "unmatched", "match": None}})
    return {**t, "status": "unmatched", "match": None}


async def review_summary(user):
    """For Today: how many bank lines are waiting, and how much money they move."""
    if not can_manage_team(user):
        return None
    rows = await db.bank_transactions.find({"org_id": user["active_org_id"], "status": "unmatched"}, {"_id": 0, "amount": 1}).to_list(5000)
    if not rows:
        return None
    return {"count": len(rows), "money_in": round(sum(r["amount"] for r in rows if r["amount"] > 0), 2),
            "money_out": round(-sum(r["amount"] for r in rows if r["amount"] < 0), 2)}


async def ensure_indexes():
    await db.bank_transactions.create_index([("org_id", 1), ("account_id", 1), ("external_id", 1)], unique=True)
    await db.bank_transactions.create_index([("org_id", 1), ("status", 1), ("date", -1)])
    await db.bank_accounts.create_index([("org_id", 1)])
    await db.bank_items.create_index([("org_id", 1), ("item_id", 1)], unique=True)

