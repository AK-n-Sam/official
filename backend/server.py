import os
import re
import uuid
import secrets
import logging
from urllib.parse import quote
from datetime import datetime, timezone, timedelta, date
from collections import defaultdict

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Body
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from pymongo import ReturnDocument

from database import db, now_iso
from models import (
    CustomerCreate, SupplierCreate, ProductCreate, ExpenseCreate, EmployeeCreate,
    TaskCreate, InvoiceCreate, InvoiceUpdate, StockMovementCreate, PaymentInput, PaymentCreate, LeadCreate,
    OrganizationUpdate, ProfileUpdate, PreferencesUpdate, SwitchOrgInput, InviteInput, ReassignInput, RoleUpdateInput,
)
from crud import (
    make_crud, is_privileged, can_manage_team, member_filter, all_of, text_match, validated_update, validation_error,
)
from auth import router as auth_router, get_current_user, hash_password, verify_password, workspace_role
from seed import create_user_workspaces

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bmp")

app = FastAPI(title="SME Business Management Platform")
api = APIRouter(prefix="/api")

# Invoice statuses that still expect money in ("pending" is the legacy spelling of "sent").
UNPAID = ("sent", "pending", "partially_paid", "overdue")
# Invoices that never count as revenue.
NOT_BILLED = ("draft", "cancelled")
TASK_SCOPE = ("assignee_id",)
LEAD_SCOPE = ("owner_id",)


def today_str() -> str:
    return now_iso()[:10]


def days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).date().isoformat()


def money(v) -> str:
    return f"{float(v or 0):,.2f}"


def balance_of(inv: dict) -> float:
    return round(float(inv.get("total", 0)) - float(inv.get("amount_paid", 0) or 0), 2)


@api.get("/")
async def root():
    return {"message": "SME Business Management Platform API", "status": "ok"}


# ---------------- Business-rule hooks for the generic CRUD modules ----------------
async def _validate_product(doc, user):
    org_id = user["active_org_id"]
    sku = (doc.get("sku") or "").strip()
    if sku:
        dup = await db.products.find_one(
            {"org_id": org_id, "sku": {"$regex": f"^{re.escape(sku)}$", "$options": "i"}, "id": {"$ne": doc.get("id", "")}},
            {"_id": 0, "name": 1})
        if dup:
            raise HTTPException(status_code=409, detail=f"SKU {sku} is already used by {dup['name']}")
    if doc.get("supplier_id"):
        sup = await db.suppliers.find_one({"id": doc["supplier_id"], "org_id": org_id}, {"_id": 0, "name": 1})
        if not sup:
            raise HTTPException(status_code=400, detail="The selected supplier no longer exists")
        doc["supplier_name"] = sup["name"]


async def _validate_expense(doc, user):
    if doc.get("supplier_id"):
        sup = await db.suppliers.find_one({"id": doc["supplier_id"], "org_id": user["active_org_id"]}, {"_id": 0, "name": 1})
        if not sup:
            raise HTTPException(status_code=400, detail="The selected supplier no longer exists")
        doc["vendor"] = sup["name"]


async def _member_name(org_id, member_id, what):
    member = await db.users.find_one({"id": member_id, "org_ids": org_id}, {"_id": 0, "name": 1})
    if not member:
        raise HTTPException(status_code=400, detail=f"The selected {what} isn't a member of this workspace")
    return member["name"]


async def _validate_task(doc, user):
    org_id = user["active_org_id"]
    if doc.get("customer_id"):
        c = await db.customers.find_one({"id": doc["customer_id"], "org_id": org_id}, {"_id": 0, "name": 1})
        if not c:
            raise HTTPException(status_code=400, detail="The selected customer no longer exists")
        doc["customer_name"] = c["name"]
    if doc.get("assignee_id"):
        doc["assignee"] = await _member_name(org_id, doc["assignee_id"], "assignee")


async def _validate_lead(doc, user):
    if doc.get("owner_id"):
        doc["owner"] = await _member_name(user["active_org_id"], doc["owner_id"], "owner")


async def _supplier_in_use(doc, user):
    n = await db.products.count_documents({"org_id": user["active_org_id"], "supplier_id": doc["id"]})
    if n:
        raise HTTPException(status_code=409, detail=f"{doc['name']} supplies {n} product{'s' if n != 1 else ''}. "
                                                   "Change their supplier first, or mark this supplier inactive instead.")


async def _product_in_use(doc, user):
    n = await db.invoices.count_documents({"org_id": user["active_org_id"], "items.product_id": doc["id"]})
    if n:
        raise HTTPException(status_code=409, detail=f"{doc['name']} appears on {n} invoice{'s' if n != 1 else ''}. "
                                                   "Mark it inactive instead so your invoice history stays accurate.")


api.include_router(make_crud("suppliers", SupplierCreate, ["name", "contact_name", "email", "category"], ["status", "category"],
                             label="Supplier", manager_only_delete=True, before_delete=_supplier_in_use), prefix="/suppliers", tags=["suppliers"])
api.include_router(make_crud("products", ProductCreate, ["name", "sku", "category", "supplier_name"], ["status", "category", "supplier_id"],
                             label="Product", manager_only_delete=True, validate=_validate_product, before_delete=_product_in_use),
                   prefix="/products", tags=["products"])
api.include_router(make_crud("expenses", ExpenseCreate, ["category", "vendor", "description"], ["status", "category", "payment_method", "supplier_id"],
                             member_scoped=True, label="Expense", validate=_validate_expense, date_field="date"), prefix="/expenses", tags=["expenses"])
api.include_router(make_crud("employees", EmployeeCreate, ["name", "email", "job_title", "department"], ["status", "department"],
                             label="Employee", manager_only_writes=True, private_fields=["salary"]), prefix="/employees", tags=["employees"])
api.include_router(make_crud("tasks", TaskCreate, ["title", "assignee", "description", "customer_name"], ["status", "priority", "customer_id", "assignee_id"],
                             member_scoped=True, shared_with=TASK_SCOPE, label="Task", validate=_validate_task), prefix="/tasks", tags=["tasks"])
api.include_router(make_crud("leads", LeadCreate, ["name", "company", "email", "owner"], ["stage", "owner", "owner_id"],
                             member_scoped=True, shared_with=LEAD_SCOPE, label="Lead", validate=_validate_lead), prefix="/leads", tags=["leads"])


# ---------------- Invoices (custom) ----------------
inv = APIRouter(prefix="/invoices", tags=["invoices"])


def _compute_invoice(items_in, tax_rate):
    subtotal = 0.0
    items = []
    for it in items_in:
        qty = float(it.get("quantity", 1))
        price = float(it.get("unit_price", 0))
        discount = float(it.get("discount", 0) or 0)
        total = round(qty * price - discount, 2)
        subtotal += total
        items.append({**it, "quantity": qty, "unit_price": price, "discount": discount, "total": total})
    tax_rate = float(tax_rate or 0)
    tax_amount = round(subtotal * tax_rate, 2)
    return items, round(subtotal, 2), tax_amount, round(subtotal + tax_amount, 2)


def _payment_status(total: float, paid: float, current: str) -> str:
    """Status that follows from how much has been paid."""
    if total > 0 and paid >= total - 0.005:
        return "paid"
    if paid > 0.005:
        return "partially_paid"
    if current in ("draft", "sent", "pending", "overdue"):
        return "sent" if current == "pending" else current
    return "sent"


async def refresh_overdue(org_id: str):
    """Flag sent invoices whose due date has passed, so nobody has to do it by hand.
    Partially paid invoices keep their status; the list highlights their past-due date instead."""
    await db.invoices.update_many(
        {"org_id": org_id, "status": {"$in": ["sent", "pending"]}, "due_date": {"$lt": today_str(), "$gt": ""}},
        {"$set": {"status": "overdue", "updated_at": now_iso()}},
    )


async def next_invoice_number(org: dict) -> str:
    """Allocate the next number from a per-workspace counter, so numbers are never reused after a delete."""
    if "invoice_seq" not in org:
        highest = 1000
        async for i in db.invoices.find({"org_id": org["id"]}, {"_id": 0, "invoice_number": 1}):
            tail = str(i.get("invoice_number", "")).rsplit("-", 1)[-1]
            if tail.isdigit():
                highest = max(highest, int(tail))
        await db.organizations.update_one({"id": org["id"], "invoice_seq": {"$exists": False}}, {"$set": {"invoice_seq": highest}})
    updated = await db.organizations.find_one_and_update(
        {"id": org["id"]}, {"$inc": {"invoice_seq": 1}}, return_document=ReturnDocument.AFTER
    )
    return f"{org.get('invoice_prefix') or 'INV'}-{updated['invoice_seq']}"


def _stock_quantities(items) -> dict:
    """Units per product on an invoice (stock is counted in whole units)."""
    qty = defaultdict(int)
    for it in items or []:
        pid = it.get("product_id")
        q = int(float(it.get("quantity", 0) or 0))
        if pid and q > 0:
            qty[pid] += q
    return qty


async def _move_stock(org_id, deltas: dict, reason: str, user_id: str = ""):
    """Apply per-product stock changes (negative = goods out) and log each movement.
    Stock never goes below zero, so an invoice can take less than it asks for. Returns
    (warnings, applied): readable warnings for shortfalls, and the change actually made per product."""
    warnings, applied = [], {}
    for pid, delta in deltas.items():
        if not delta:
            continue
        product = await db.products.find_one_and_update(
            {"id": pid, "org_id": org_id}, {"$inc": {"stock_quantity": delta}, "$set": {"updated_at": now_iso()}},
            projection={"_id": 0, "name": 1, "stock_quantity": 1, "unit": 1}, return_document=ReturnDocument.AFTER)
        if not product:
            continue
        actual = delta
        if product["stock_quantity"] < 0:
            short = -product["stock_quantity"]
            actual = delta + short
            warnings.append(f"{product['name']}: {short} {product.get('unit') or 'unit'}(s) more than you had in stock")
            await db.products.update_one({"id": pid, "org_id": org_id, "stock_quantity": {"$lt": 0}}, {"$set": {"stock_quantity": 0}})
        applied[pid] = actual
        if actual:
            await db.stock_movements.insert_one({
                "id": str(uuid.uuid4()), "org_id": org_id, "product_id": pid, "product_name": product["name"],
                "type": "in" if actual > 0 else "out", "quantity": abs(actual), "reason": reason,
                "date": today_str(), "created_by": user_id, "created_at": now_iso(),
            })
    return warnings, applied


def _deducted_map(invoice) -> dict:
    """Units this invoice actually took off the shelf. Invoices from before this was recorded
    fall back to their line quantities."""
    if invoice.get("stock_deducted") is not None:
        return {pid: int(n) for pid, n in invoice["stock_deducted"].items() if n}
    return dict(_stock_quantities(invoice.get("items")))


async def _deduct_inventory(org_id, items, invoice_number, user_id=""):
    """Take an invoice's goods off the shelf. Returns (warnings, units actually taken per product)."""
    warnings, applied = await _move_stock(org_id, {p: -q for p, q in _stock_quantities(items).items()}, f"Invoice {invoice_number}", user_id)
    return warnings, {pid: -d for pid, d in applied.items() if d}


async def _restore_inventory(org_id, invoice, reason, user_id=""):
    """Put back exactly what the invoice took, no more."""
    await _move_stock(org_id, _deducted_map(invoice), reason, user_id)


async def _clean_items(org_id, items):
    """Keep product links only for products that exist in this workspace."""
    ids = {it.get("product_id") for it in items if it.get("product_id")}
    known = set()
    if ids:
        async for p in db.products.find({"org_id": org_id, "id": {"$in": list(ids)}}, {"_id": 0, "id": 1}):
            known.add(p["id"])
    return [{**it, "product_id": it.get("product_id") if it.get("product_id") in known else ""} for it in items]


async def _find_customer(user, customer_id):
    customer = await db.customers.find_one(all_of({"id": customer_id, "org_id": user["active_org_id"]}, member_filter(user)),
                                           {"_id": 0, "id": 1, "name": 1})
    if not customer:
        raise HTTPException(status_code=400, detail="The selected customer no longer exists")
    return customer


async def _get_invoice(user, invoice_id):
    invoice = await db.invoices.find_one(all_of({"id": invoice_id, "org_id": user["active_org_id"]}, member_filter(user)), {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@inv.get("")
async def list_invoices(request: Request, user: dict = Depends(get_current_user)):
    await refresh_overdue(user["active_org_id"])
    params = request.query_params
    parts = [{"org_id": user["active_org_id"]}, member_filter(user)]
    status = params.get("status")
    if status and status != "all":
        parts.append({"status": str(status)})
    if params.get("customer_id"):
        parts.append({"customer_id": str(params["customer_id"])})
    search = (params.get("search") or "").strip()
    if search:
        parts.append({"$or": [{"invoice_number": text_match(search)}, {"customer_name": text_match(search)}]})
    return await db.invoices.find(all_of(*parts), {"_id": 0}).sort("created_at", -1).to_list(2000)


@inv.post("")
async def create_invoice(payload: InvoiceCreate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    data = payload.model_dump()
    customer = await _find_customer(user, data["customer_id"])
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    items = await _clean_items(org_id, data["items"])
    items, subtotal, tax_amount, total = _compute_invoice(items, data["tax_rate"])
    status = "sent" if data["status"] == "pending" else data["status"]
    doc = {
        "id": str(uuid.uuid4()), "org_id": org_id,
        "invoice_number": await next_invoice_number(org),
        "customer_id": customer["id"], "customer_name": customer["name"],
        "issue_date": data["issue_date"], "due_date": data["due_date"], "status": status,
        "items": items, "subtotal": subtotal, "tax_rate": data["tax_rate"], "tax_amount": tax_amount,
        "total": total, "amount_paid": 0.0, "notes": data.get("notes", ""),
        "inventory_deducted": status != "draft",
        "created_by": user["id"],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    warnings = []
    # Stock leaves the shelf once the invoice is issued (anything but a draft).
    if doc["inventory_deducted"]:
        warnings, deducted = await _deduct_inventory(org_id, items, doc["invoice_number"], user["id"])
        doc["stock_deducted"] = deducted
        await db.invoices.update_one({"id": doc["id"]}, {"$set": {"stock_deducted": deducted}})
    if status == "paid" and total > 0:
        doc["amount_paid"] = total
        await db.invoices.update_one({"id": doc["id"]}, {"$set": {"amount_paid": total}})
        await _record_payment(org_id, doc, total, "bank_transfer", data["issue_date"], "Recorded when the invoice was created as paid", user["id"])
    doc["stock_warnings"] = warnings
    return doc


@inv.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    await refresh_overdue(user["active_org_id"])
    invoice = await _get_invoice(user, invoice_id)
    invoice["payments"] = await db.payments.find({"invoice_id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    invoice["balance"] = balance_of(invoice)
    return invoice


@inv.post("/{invoice_id}/status")
async def set_invoice_status(invoice_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    invoice = await _get_invoice(user, invoice_id)
    new_status = payload.get("status")
    if new_status not in ("draft", "sent", "paid", "overdue", "cancelled"):
        raise HTTPException(status_code=400, detail="Choose draft, sent, paid, overdue or cancelled")
    current = invoice["status"]
    paid = float(invoice.get("amount_paid", 0) or 0)
    balance = balance_of(invoice)
    number = invoice["invoice_number"]
    if current == "cancelled" and new_status not in ("draft", "sent"):
        raise HTTPException(status_code=400, detail="This invoice is cancelled. Reopen it as a draft or sent invoice first.")
    if new_status == "cancelled" and paid > 0:
        raise HTTPException(status_code=400, detail=f"{number} has {money(paid)} in payments, so it can't be cancelled. "
                                                   "Remove the payments first if they were recorded by mistake.")
    if new_status == "draft" and paid > 0:
        raise HTTPException(status_code=400, detail="An invoice with payments can't go back to draft.")
    if new_status == "overdue" and balance <= 0:
        raise HTTPException(status_code=400, detail=f"{number} is already paid in full.")

    updates = {"updated_at": now_iso()}
    warnings = []
    if new_status == "paid":
        if balance > 0:
            await _record_payment(org_id, invoice, balance, "bank_transfer", today_str(), "Marked as paid", user["id"])
        updates.update({"amount_paid": invoice["total"], "status": "paid"})
    elif new_status == "sent":
        status = _payment_status(invoice["total"], paid, "sent")
        if status == "sent" and invoice.get("due_date") and invoice["due_date"] < today_str():
            status = "overdue"
        updates["status"] = status
    else:
        updates["status"] = new_status

    # Stock leaves the shelf when an invoice is issued, and comes back when it is cancelled or returned to draft.
    issued = updates["status"] not in ("draft", "cancelled")
    if issued and not invoice.get("inventory_deducted"):
        warnings, deducted = await _deduct_inventory(org_id, invoice.get("items", []), number, user["id"])
        updates.update({"inventory_deducted": True, "stock_deducted": deducted})
    elif not issued and invoice.get("inventory_deducted"):
        verb = "cancelled" if updates["status"] == "cancelled" else "moved back to draft"
        await _restore_inventory(org_id, invoice, f"Invoice {number} {verb}", user["id"])
        updates.update({"inventory_deducted": False, "stock_deducted": {}})
    await db.invoices.update_one({"id": invoice_id, "org_id": org_id}, {"$set": updates})
    doc = await db.invoices.find_one({"id": invoice_id, "org_id": org_id}, {"_id": 0})
    doc["stock_warnings"] = warnings
    return doc


@inv.put("/{invoice_id}")
async def update_invoice(invoice_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    existing = await _get_invoice(user, invoice_id)
    try:
        upd = InvoiceUpdate(**payload).model_dump(exclude_none=True)
    except ValidationError as e:
        raise validation_error(e)
    upd.pop("customer_name", None)  # always taken from the customer record
    if existing["status"] == "cancelled" and any(k in upd for k in ("items", "tax_rate", "customer_id")):
        raise HTTPException(status_code=400, detail="Reopen this cancelled invoice before changing its items or customer.")

    changes = {}
    if upd.get("customer_id") and upd["customer_id"] != existing.get("customer_id"):
        customer = await _find_customer(user, upd["customer_id"])
        changes.update({"customer_id": customer["id"], "customer_name": customer["name"]})
    issue = upd.get("issue_date", existing.get("issue_date", ""))
    due = upd.get("due_date", existing.get("due_date", ""))
    if issue and due and due < issue:
        raise HTTPException(status_code=422, detail="The due date can't be before the issue date")
    for k in ("issue_date", "due_date", "notes"):
        if k in upd:
            changes[k] = upd[k]

    paid = float(existing.get("amount_paid", 0) or 0)
    total = existing["total"]
    warnings = []
    if "items" in upd or "tax_rate" in upd:
        raw_items = await _clean_items(org_id, upd.get("items", existing.get("items", [])))
        items, subtotal, tax_amount, total = _compute_invoice(raw_items, upd.get("tax_rate", existing.get("tax_rate", 0)))
        if total + 0.005 < paid:
            raise HTTPException(status_code=400, detail=f"The new total ({money(total)}) is less than the {money(paid)} already paid. "
                                                       "Remove a payment first.")
        changes.update({"items": items, "subtotal": subtotal, "tax_amount": tax_amount, "total": total,
                        "tax_rate": upd.get("tax_rate", existing.get("tax_rate", 0))})
        # Issued invoices already took stock off the shelf: apply only the difference.
        if existing.get("inventory_deducted") and "items" in upd:
            old, new = _deducted_map(existing), _stock_quantities(items)
            deltas = {pid: old.get(pid, 0) - new.get(pid, 0) for pid in set(old) | set(new)}
            warnings, applied = await _move_stock(org_id, deltas, f"Invoice {existing['invoice_number']} edited", user["id"])
            deducted = {pid: old.get(pid, 0) - applied.get(pid, 0) for pid in set(old) | set(applied)}
            changes["stock_deducted"] = {pid: n for pid, n in deducted.items() if n > 0}

    status = existing["status"]
    if status not in ("draft", "cancelled"):
        status = _payment_status(total, paid, status)
        if status == "overdue" and due >= today_str():
            status = "sent"
    changes["status"] = status
    changes["updated_at"] = now_iso()
    await db.invoices.update_one({"id": invoice_id, "org_id": org_id}, {"$set": changes})
    await refresh_overdue(org_id)
    doc = await db.invoices.find_one({"id": invoice_id, "org_id": org_id}, {"_id": 0})
    doc["stock_warnings"] = warnings
    return doc


@inv.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    invoice = await _get_invoice(user, invoice_id)
    if float(invoice.get("amount_paid", 0) or 0) > 0:
        raise HTTPException(status_code=409, detail=f"{invoice['invoice_number']} has payments recorded, and deleting it would erase them. "
                                                   "Remove the payments first if they were recorded by mistake.")
    if invoice.get("inventory_deducted"):
        await _restore_inventory(org_id, invoice, f"Invoice {invoice['invoice_number']} deleted", user["id"])
    await db.invoices.delete_one({"id": invoice_id, "org_id": org_id})
    await db.payments.delete_many({"invoice_id": invoice_id, "org_id": org_id})
    return {"success": True}


async def _record_payment(org_id, invoice, amount, method, date_, notes="", recorded_by=""):
    await db.payments.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "invoice_id": invoice["id"],
        "invoice_number": invoice["invoice_number"], "customer_id": invoice.get("customer_id", ""),
        "customer_name": invoice.get("customer_name", ""), "amount": round(float(amount), 2),
        "method": method, "date": date_ or today_str(), "notes": notes or "",
        # Payments follow their invoice's owner, so members see payments on their own invoices.
        "created_by": invoice.get("created_by", ""), "recorded_by": recorded_by, "created_at": now_iso(),
    })


async def _apply_payment(user, invoice, amount, method, date_, notes=""):
    org_id = user["active_org_id"]
    amount = round(float(amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Enter a payment amount greater than zero")
    if invoice["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="This invoice is cancelled. Reopen it before recording a payment.")
    balance = balance_of(invoice)
    if balance <= 0:
        raise HTTPException(status_code=400, detail=f"{invoice['invoice_number']} is already paid in full.")
    if amount > balance + 0.005:
        raise HTTPException(status_code=400, detail=f"That's more than the balance due ({money(balance)}).")
    # Atomic guard: two payments submitted at once can never push the invoice past its total.
    updated = await db.invoices.find_one_and_update(
        {"id": invoice["id"], "org_id": org_id,
         "$expr": {"$lte": [{"$add": [{"$ifNull": ["$amount_paid", 0]}, amount]}, {"$add": ["$total", 0.005]}]}},
        {"$inc": {"amount_paid": amount}, "$set": {"updated_at": now_iso()}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not updated:
        raise HTTPException(status_code=409, detail="This invoice's balance just changed. Refresh and try again.")
    paid = round(updated["amount_paid"], 2)
    updates = {"amount_paid": paid, "status": _payment_status(updated["total"], paid, updated["status"])}
    # A payment on a draft means it was issued after all: take the stock off the shelf now.
    if not updated.get("inventory_deducted"):
        _, deducted = await _deduct_inventory(org_id, updated.get("items", []), updated["invoice_number"], user["id"])
        updates.update({"inventory_deducted": True, "stock_deducted": deducted})
    await db.invoices.update_one({"id": invoice["id"], "org_id": org_id}, {"$set": updates})
    await _record_payment(org_id, updated, amount, method, date_, notes, user["id"])
    return await db.invoices.find_one({"id": invoice["id"], "org_id": org_id}, {"_id": 0})


@inv.post("/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, payload: PaymentInput, user: dict = Depends(get_current_user)):
    invoice = await _get_invoice(user, invoice_id)
    return await _apply_payment(user, invoice, payload.amount, payload.method, payload.date)


api.include_router(inv)


# ---------------- Customers (custom: computed balances + history) ----------------
cust = APIRouter(prefix="/customers", tags=["customers"])


async def _customer_totals(org_id, customer_ids=None):
    """Billed sales, open balance and invoice count per customer, computed in the database."""
    match = {"org_id": org_id, "customer_id": {"$nin": ["", None]}}
    if customer_ids is not None:
        match["customer_id"] = {"$in": list(customer_ids)}
    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": "$customer_id",
            "invoice_count": {"$sum": 1},
            "total_sales": {"$sum": {"$cond": [{"$in": ["$status", list(NOT_BILLED)]}, 0, "$total"]}},
            "outstanding": {"$sum": {"$cond": [{"$in": ["$status", list(UNPAID)]},
                                               {"$subtract": ["$total", {"$ifNull": ["$amount_paid", 0]}]}, 0]}},
            "last_invoice_date": {"$max": "$issue_date"},
        }},
    ]
    return {r["_id"]: r async for r in db.invoices.aggregate(pipeline)}


async def _check_duplicate_customer(org_id, email, exclude_id=""):
    if not email:
        return
    dup = await db.customers.find_one({"org_id": org_id, "email": email, "id": {"$ne": exclude_id}}, {"_id": 0, "name": 1})
    if dup:
        raise HTTPException(status_code=409, detail=f"{dup['name']} already uses {email}. Open that customer instead of adding a duplicate.")


@cust.get("")
async def list_customers(request: Request, user: dict = Depends(get_current_user)):
    params = request.query_params
    parts = [{"org_id": user["active_org_id"]}, member_filter(user)]
    search = (params.get("search") or "").strip()
    if search:
        parts.append({"$or": [{f: text_match(search)} for f in ("name", "email", "company", "city")]})
    status = params.get("status")
    if status and status != "all":
        parts.append({"status": str(status)})
    customers = await db.customers.find(all_of(*parts), {"_id": 0}).sort("created_at", -1).to_list(2000)
    totals = await _customer_totals(user["active_org_id"])
    for c in customers:
        t = totals.get(c["id"], {})
        c["total_sales"] = round(t.get("total_sales", 0.0), 2)
        c["outstanding"] = round(t.get("outstanding", 0.0), 2)
        c["invoice_count"] = t.get("invoice_count", 0)
        c["last_invoice_date"] = t.get("last_invoice_date", "")
    return customers


@cust.post("")
async def create_customer(payload: CustomerCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    await _check_duplicate_customer(user["active_org_id"], doc["email"])
    doc.update({"id": str(uuid.uuid4()), "org_id": user["active_org_id"], "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso()})
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@cust.get("/{customer_id}/history")
async def customer_history(customer_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    await refresh_overdue(org_id)
    customer = await db.customers.find_one(all_of({"id": customer_id, "org_id": org_id}, member_filter(user)), {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    invoices = await db.invoices.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    payments = await db.payments.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    tasks = await db.tasks.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    lead = await db.leads.find_one({"org_id": org_id, "customer_id": customer_id}, {"_id": 0, "id": 1, "company": 1, "source": 1, "value": 1})
    unpaid = [i for i in invoices if i["status"] in UNPAID]
    return {
        "customer": customer, "invoices": invoices, "payments": payments, "tasks": tasks, "lead": lead,
        "total_sales": round(sum(i["total"] for i in invoices if i["status"] not in NOT_BILLED), 2),
        "outstanding": round(sum(balance_of(i) for i in unpaid), 2),
        "overdue": round(sum(balance_of(i) for i in unpaid if i.get("due_date", "") and i["due_date"] < today_str()), 2),
        "total_paid": round(sum(p["amount"] for p in payments), 2),
        "invoice_count": len(invoices),
    }


@cust.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    doc = await db.customers.find_one(all_of({"id": customer_id, "org_id": user["active_org_id"]}, member_filter(user)), {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Customer not found")
    return doc


@cust.put("/{customer_id}")
async def update_customer(customer_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    existing = await db.customers.find_one(all_of({"id": customer_id, "org_id": org_id}, member_filter(user)), {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    updates = validated_update(CustomerCreate, existing, payload)
    if "email" in updates:
        await _check_duplicate_customer(org_id, updates["email"], customer_id)
    updates["updated_at"] = now_iso()
    await db.customers.update_one({"id": customer_id, "org_id": org_id}, {"$set": updates})
    if updates.get("name") and updates["name"] != existing["name"]:
        await db.tasks.update_many({"org_id": org_id, "customer_id": customer_id}, {"$set": {"customer_name": updates["name"]}})
    return await db.customers.find_one({"id": customer_id, "org_id": org_id}, {"_id": 0})


@cust.delete("/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    customer = await db.customers.find_one(all_of({"id": customer_id, "org_id": org_id}, member_filter(user)), {"_id": 0, "name": 1})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    n = await db.invoices.count_documents({"org_id": org_id, "customer_id": customer_id})
    if n:
        raise HTTPException(status_code=409, detail=f"{customer['name']} has {n} invoice{'s' if n != 1 else ''}. "
                                                   "Mark the customer inactive instead so your records stay complete.")
    await db.customers.delete_one({"id": customer_id, "org_id": org_id})
    await db.tasks.update_many({"org_id": org_id, "customer_id": customer_id}, {"$set": {"customer_id": ""}})
    await db.leads.update_many({"org_id": org_id, "customer_id": customer_id}, {"$set": {"customer_id": ""}})
    return {"success": True}


api.include_router(cust)


# ---------------- Leads: convert to customer ----------------
@api.post("/leads/{lead_id}/convert", tags=["leads"])
async def convert_lead(lead_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    lead = await db.leads.find_one(all_of({"id": lead_id, "org_id": org_id}, member_filter(user, LEAD_SCOPE)), {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Already converted: hand back the existing customer instead of creating a second one.
    if lead.get("customer_id"):
        existing = await db.customers.find_one({"id": lead["customer_id"], "org_id": org_id}, {"_id": 0})
        if existing:
            return {**existing, "already_existed": True}
    email = (lead.get("email") or "").strip().lower()
    customer = await db.customers.find_one({"org_id": org_id, "email": email}, {"_id": 0}) if email else None
    already = customer is not None
    if not customer:
        customer = {
            "id": str(uuid.uuid4()), "org_id": org_id, "name": lead["name"], "email": email,
            "phone": lead.get("phone", ""), "company": lead.get("company", ""), "address": "", "city": "",
            "country": "", "status": "active", "notes": f"Converted from lead. {lead.get('notes', '')}".strip(),
            "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso(),
        }
        await db.customers.insert_one(customer)
        customer.pop("_id", None)
    await db.leads.update_one({"id": lead_id, "org_id": org_id}, {"$set": {"stage": "won", "customer_id": customer["id"], "updated_at": now_iso()}})
    return {**customer, "already_existed": already}


# ---------------- Payments ----------------
@api.get("/payments", tags=["payments"])
async def list_payments(request: Request, user: dict = Depends(get_current_user)):
    params = request.query_params
    parts = [{"org_id": user["active_org_id"]}, member_filter(user)]
    if params.get("date_from") or params.get("date_to"):
        rng = {}
        if params.get("date_from"):
            rng["$gte"] = str(params["date_from"])[:10]
        if params.get("date_to"):
            rng["$lte"] = str(params["date_to"])[:10]
        parts.append({"date": rng})
    return await db.payments.find(all_of(*parts), {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(2000)


@api.post("/payments", tags=["payments"])
async def record_payment(payload: PaymentCreate, user: dict = Depends(get_current_user)):
    invoice = await _get_invoice(user, payload.invoice_id)
    updated = await _apply_payment(user, invoice, payload.amount, payload.method, payload.date, payload.notes)
    return {"invoice": updated, "balance": balance_of(updated)}


@api.delete("/payments/{payment_id}", tags=["payments"])
async def delete_payment(payment_id: str, user: dict = Depends(get_current_user)):
    """Undo a payment that was recorded by mistake (owners/admins). The invoice balance reopens."""
    if not can_manage_team(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can remove payments")
    org_id = user["active_org_id"]
    payment = await db.payments.find_one({"id": payment_id, "org_id": org_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    invoice = await db.invoices.find_one_and_update(
        {"id": payment["invoice_id"], "org_id": org_id},
        {"$inc": {"amount_paid": -payment["amount"]}, "$set": {"updated_at": now_iso()}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    await db.payments.delete_one({"id": payment_id, "org_id": org_id})
    if invoice:
        paid = max(0.0, round(invoice.get("amount_paid", 0), 2))
        status = _payment_status(invoice["total"], paid, "sent" if invoice["status"] in ("paid", "partially_paid") else invoice["status"])
        await db.invoices.update_one({"id": invoice["id"], "org_id": org_id}, {"$set": {"amount_paid": paid, "status": status}})
        await refresh_overdue(org_id)
        invoice = await db.invoices.find_one({"id": invoice["id"], "org_id": org_id}, {"_id": 0})
    return {"success": True, "invoice": invoice}


# ---------------- Inventory / Stock movements ----------------
@api.get("/stock-movements", tags=["inventory"])
async def list_movements(request: Request, user: dict = Depends(get_current_user)):
    q = {"org_id": user["active_org_id"]}
    pid = request.query_params.get("product_id")
    if pid:
        q["product_id"] = str(pid)
    return await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/stock-movements", tags=["inventory"])
async def create_movement(payload: StockMovementCreate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    product = await db.products.find_one({"id": payload.product_id, "org_id": org_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    qty = int(payload.quantity)
    if payload.type == "out":
        updated = await db.products.find_one_and_update(
            {"id": product["id"], "org_id": org_id, "stock_quantity": {"$gte": qty}},
            {"$inc": {"stock_quantity": -qty}, "$set": {"updated_at": now_iso()}},
            projection={"_id": 0, "stock_quantity": 1}, return_document=ReturnDocument.AFTER)
        if not updated:
            raise HTTPException(status_code=400, detail=f"Only {product['stock_quantity']} {product.get('unit') or 'unit'}(s) of {product['name']} in stock.")
    elif payload.type == "in":
        updated = await db.products.find_one_and_update(
            {"id": product["id"], "org_id": org_id}, {"$inc": {"stock_quantity": qty}, "$set": {"updated_at": now_iso()}},
            projection={"_id": 0, "stock_quantity": 1}, return_document=ReturnDocument.AFTER)
    else:
        updated = await db.products.find_one_and_update(
            {"id": product["id"], "org_id": org_id}, {"$set": {"stock_quantity": qty, "updated_at": now_iso()}},
            projection={"_id": 0, "stock_quantity": 1}, return_document=ReturnDocument.AFTER)
    doc = {
        "id": str(uuid.uuid4()), "org_id": org_id, "product_id": product["id"],
        "product_name": product["name"], "type": payload.type, "quantity": qty,
        "previous_quantity": product["stock_quantity"],
        "reason": payload.reason or "", "date": payload.date or today_str(),
        "created_by": user["id"], "created_at": now_iso(),
    }
    await db.stock_movements.insert_one(doc)
    doc.pop("_id", None)
    return {"movement": doc, "new_stock": updated["stock_quantity"]}


# ---------------- Dashboard ----------------
def _month_buckets(n=6, end: date = None):
    """The last `n` calendar months (oldest first) as (YYYY-MM, label)."""
    end = end or datetime.now(timezone.utc).date()
    y, m = end.year, end.month
    out = []
    for back in range(n - 1, -1, -1):
        mm, yy = m - back, y
        while mm <= 0:
            mm += 12
            yy -= 1
        label = date(yy, mm, 1).strftime("%b") if n <= 12 else date(yy, mm, 1).strftime("%b %y")
        out.append((f"{yy:04d}-{mm:02d}", label))
    return out


def _pct_change(cur, prev):
    if not prev:
        return None
    return round((cur - prev) / abs(prev) * 100, 1)


def _aging(unpaid_invoices, today):
    buckets = {"current": 0.0, "d1_30": 0.0, "d31_60": 0.0, "d61_90": 0.0, "d90_plus": 0.0}
    for i in unpaid_invoices:
        bal = balance_of(i)
        if bal <= 0:
            continue
        due = i.get("due_date") or today
        try:
            late = (date.fromisoformat(today) - date.fromisoformat(due[:10])).days
        except ValueError:
            late = 0
        key = "current" if late <= 0 else "d1_30" if late <= 30 else "d31_60" if late <= 60 else "d61_90" if late <= 90 else "d90_plus"
        buckets[key] += bal
    return {k: round(v, 2) for k, v in buckets.items()}


def _top_debtors(unpaid_invoices, limit=5):
    by_customer = {}
    for i in unpaid_invoices:
        bal = balance_of(i)
        if bal <= 0:
            continue
        c = by_customer.setdefault(i.get("customer_id") or i.get("customer_name"), {
            "customer_id": i.get("customer_id", ""), "customer_name": i.get("customer_name", ""),
            "amount": 0.0, "invoices": 0, "oldest_due": i.get("due_date", "")})
        c["amount"] += bal
        c["invoices"] += 1
        if i.get("due_date") and (not c["oldest_due"] or i["due_date"] < c["oldest_due"]):
            c["oldest_due"] = i["due_date"]
    ranked = sorted(by_customer.values(), key=lambda x: x["amount"], reverse=True)[:limit]
    for r in ranked:
        r["amount"] = round(r["amount"], 2)
    return ranked


@api.get("/dashboard/stats", tags=["dashboard"])
async def dashboard_stats(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    await refresh_overdue(org_id)
    mf = member_filter(user)
    base = {"org_id": org_id}
    invoices = await db.invoices.find(all_of(base, mf), {"_id": 0, "items.description": 0}).to_list(10000)
    expenses = await db.expenses.find(all_of(base, mf), {"_id": 0, "description": 0}).to_list(10000)
    payments = await db.payments.find(all_of(base, mf), {"_id": 0, "notes": 0}).to_list(10000)
    products = await db.products.find(base, {"_id": 0, "id": 1, "name": 1, "category": 1, "stock_quantity": 1, "reorder_level": 1, "status": 1}).to_list(5000)
    tasks = await db.tasks.find(all_of(base, member_filter(user, TASK_SCOPE)), {"_id": 0, "description": 0}).to_list(5000)
    leads = await db.leads.find(all_of(base, member_filter(user, LEAD_SCOPE)), {"_id": 0, "notes": 0}).to_list(5000)
    today = today_str()
    d30, d60 = days_ago(30), days_ago(60)
    week_ahead = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()

    billed = [i for i in invoices if i["status"] not in NOT_BILLED]
    unpaid = [i for i in invoices if i["status"] in UNPAID and balance_of(i) > 0]
    overdue = [i for i in unpaid if i["status"] == "overdue" or (i.get("due_date") and i["due_date"] < today)]
    overdue_ids = {i["id"] for i in overdue}
    due_soon = [i for i in unpaid if i["id"] not in overdue_ids and i.get("due_date") and today <= i["due_date"] <= week_ahead]
    drafts = [i for i in invoices if i["status"] == "draft"]

    def in_window(v, start, end):
        return bool(v) and start < v[:10] <= end

    revenue_30 = sum(i["total"] for i in billed if in_window(i.get("issue_date"), d30, today))
    revenue_prev = sum(i["total"] for i in billed if in_window(i.get("issue_date"), d60, d30))
    collected_30 = sum(p["amount"] for p in payments if in_window(p.get("date"), d30, today))
    collected_prev = sum(p["amount"] for p in payments if in_window(p.get("date"), d60, d30))
    expenses_30 = sum(e["amount"] for e in expenses if in_window(e.get("date"), d30, today))
    expenses_prev = sum(e["amount"] for e in expenses if in_window(e.get("date"), d60, d30))
    paid_out_30 = sum(e["amount"] for e in expenses if e.get("status") == "paid" and in_window(e.get("date"), d30, today))

    total_sales = round(sum(i["total"] for i in billed), 2)
    total_expenses = round(sum(e["amount"] for e in expenses), 2)
    outstanding = round(sum(balance_of(i) for i in unpaid), 2)
    overdue_amount = round(sum(balance_of(i) for i in overdue), 2)
    low_stock = [p for p in products if p.get("status", "active") == "active" and p["stock_quantity"] <= p["reorder_level"]]
    is_open_task = lambda t: t["status"] not in ("done", "completed")
    open_tasks = [t for t in tasks if is_open_task(t)]
    overdue_tasks = [t for t in open_tasks if t.get("due_date") and t["due_date"] < today]
    unpaid_expenses = [e for e in expenses if e.get("status") == "pending"]
    open_leads = [l for l in leads if l.get("stage") not in ("won", "lost")]
    won_unconverted = [l for l in leads if l.get("stage") == "won" and not l.get("customer_id")]

    # 6-month trend (calendar months)
    months = _month_buckets(6)
    trend, exp_trend, cash_trend = defaultdict(float), defaultdict(float), defaultdict(float)
    for i in billed:
        trend[i.get("issue_date", "")[:7]] += i["total"]
    for e in expenses:
        exp_trend[e.get("date", "")[:7]] += e["amount"]
    for p in payments:
        cash_trend[p.get("date", "")[:7]] += p["amount"]
    sales_trend = [{"month": label, "sales": round(trend[k], 2), "expenses": round(exp_trend[k], 2), "collected": round(cash_trend[k], 2)}
                   for k, label in months]

    exp_by_cat = defaultdict(float)
    for e in expenses:
        exp_by_cat[e["category"]] += e["amount"]
    expense_breakdown = sorted([{"category": k, "amount": round(v, 2)} for k, v in exp_by_cat.items()], key=lambda x: x["amount"], reverse=True)[:6]

    prod_cat = {p["id"]: p.get("category") or "Uncategorized" for p in products}
    sales_by_cat = defaultdict(float)
    for i in billed:
        for it in i.get("items", []):
            sales_by_cat[prod_cat.get(it.get("product_id"), "Services / Other")] += it.get("total", 0)
    sales_by_category = sorted([{"category": k, "amount": round(v, 2)} for k, v in sales_by_cat.items()], key=lambda x: x["amount"], reverse=True)[:6]

    status_counts = defaultdict(int)
    for i in invoices:
        status_counts["sent" if i["status"] == "pending" else i["status"]] += 1

    # What needs doing, most urgent first. The frontend words and links each item.
    actions = []
    if overdue:
        actions.append({"id": "overdue_invoices", "severity": "high", "count": len(overdue), "amount": overdue_amount})
    if overdue_tasks:
        actions.append({"id": "overdue_tasks", "severity": "high", "count": len(overdue_tasks)})
    if low_stock:
        actions.append({"id": "low_stock", "severity": "medium", "count": len(low_stock), "names": [p["name"] for p in low_stock[:3]]})
    if due_soon:
        actions.append({"id": "due_soon", "severity": "medium", "count": len(due_soon), "amount": round(sum(balance_of(i) for i in due_soon), 2)})
    if drafts:
        actions.append({"id": "drafts", "severity": "low", "count": len(drafts), "amount": round(sum(i["total"] for i in drafts), 2)})
    if unpaid_expenses:
        actions.append({"id": "unpaid_expenses", "severity": "low", "count": len(unpaid_expenses), "amount": round(sum(e["amount"] for e in unpaid_expenses), 2)})
    if won_unconverted:
        actions.append({"id": "won_unconverted", "severity": "low", "count": len(won_unconverted)})

    def _attention(t):
        return is_open_task(t) and (t.get("priority") == "high" or (t.get("due_date") and t["due_date"] <= today))
    tasks_attention = sorted([t for t in tasks if _attention(t)], key=lambda t: t.get("due_date") or "9999")[:6]

    return {
        # all-time
        "total_sales": total_sales, "total_expenses": total_expenses, "profit": round(total_sales - total_expenses, 2),
        "amount_collected": round(sum(p["amount"] for p in payments), 2),
        "outstanding": outstanding, "outstanding_count": len(unpaid),
        "overdue_count": len(overdue), "overdue_amount": overdue_amount,
        # last 30 days vs the 30 before
        "period": {
            "revenue": round(revenue_30, 2), "revenue_change": _pct_change(revenue_30, revenue_prev),
            "collected": round(collected_30, 2), "collected_change": _pct_change(collected_30, collected_prev),
            "expenses": round(expenses_30, 2), "expenses_change": _pct_change(expenses_30, expenses_prev),
            "profit": round(revenue_30 - expenses_30, 2),
            "profit_change": _pct_change(revenue_30 - expenses_30, revenue_prev - expenses_prev),
            "net_cash": round(collected_30 - paid_out_30, 2),
        },
        "receivables_aging": _aging(unpaid, today),
        "top_debtors": _top_debtors(unpaid),
        "actions": actions,
        "pipeline": {"open_count": len(open_leads), "open_value": round(sum(l.get("value", 0) for l in open_leads), 2)},
        "new_customers": await db.customers.count_documents(all_of(base, mf, {"created_at": {"$gte": days_ago(30)}})),
        "open_tasks": len(open_tasks), "overdue_task_count": len(overdue_tasks),
        "customer_count": await db.customers.count_documents(all_of(base, mf)),
        "product_count": len(products),
        "supplier_count": await db.suppliers.count_documents({**base, "status": {"$ne": "inactive"}}),
        "employee_count": await db.employees.count_documents({**base, "status": {"$ne": "inactive"}}),
        "invoice_count": len(invoices), "low_stock_count": len(low_stock),
        "recent_invoices": sorted(invoices, key=lambda x: x.get("created_at", ""), reverse=True)[:5],
        "recent_transactions": sorted(
            [{"type": "income", "label": f"Payment · {p.get('customer_name', '')}", "amount": p["amount"], "date": p["date"],
              "ref": p.get("invoice_number", ""), "link": f"/invoices/{p['invoice_id']}" if p.get("invoice_id") else ""} for p in payments]
            + [{"type": "expense", "label": f"Expense · {e['category']}", "amount": e["amount"], "date": e["date"],
                "ref": e.get("vendor", ""), "link": ""} for e in expenses],
            key=lambda x: x.get("date", ""), reverse=True)[:8],
        "tasks_attention": tasks_attention, "sales_trend": sales_trend, "expense_breakdown": expense_breakdown,
        "sales_by_category": sales_by_category,
        "invoice_status_breakdown": [{"status": k, "count": v} for k, v in status_counts.items()],
    }


# ---------------- Reports (date range) ----------------
def _parse_day(v, fallback):
    try:
        return date.fromisoformat(str(v)[:10]).isoformat() if v else fallback
    except ValueError:
        raise HTTPException(status_code=400, detail="Use dates in YYYY-MM-DD format")


@api.get("/reports/summary", tags=["reports"])
async def report_summary(request: Request, user: dict = Depends(get_current_user)):
    """Profit & loss style summary for a date range (by invoice issue date, payment date and expense date)."""
    org_id = user["active_org_id"]
    await refresh_overdue(org_id)
    now = datetime.now(timezone.utc).date()
    start = _parse_day(request.query_params.get("from"), date(now.year, 1, 1).isoformat())
    end = _parse_day(request.query_params.get("to"), now.isoformat())
    if end < start:
        raise HTTPException(status_code=400, detail="The end date must be after the start date")
    mf = member_filter(user)
    base = {"org_id": org_id}
    invoices = await db.invoices.find(all_of(base, mf, {"issue_date": {"$gte": start, "$lte": end}, "status": {"$nin": list(NOT_BILLED)}}), {"_id": 0}).to_list(20000)
    payments = await db.payments.find(all_of(base, mf, {"date": {"$gte": start, "$lte": end}}), {"_id": 0}).to_list(20000)
    expenses = await db.expenses.find(all_of(base, mf, {"date": {"$gte": start, "$lte": end}}), {"_id": 0}).to_list(20000)
    products = {p["id"]: p for p in await db.products.find(base, {"_id": 0, "id": 1, "name": 1, "category": 1, "cost": 1}).to_list(5000)}
    open_invoices = await db.invoices.find(all_of(base, mf, {"status": {"$in": list(UNPAID)}}), {"_id": 0, "items": 0}).to_list(20000)

    revenue = sum(i["subtotal"] for i in invoices)
    tax = sum(i.get("tax_amount", 0) for i in invoices)
    cogs = 0.0
    by_product = defaultdict(lambda: {"name": "", "units": 0.0, "revenue": 0.0})
    by_category = defaultdict(float)
    for i in invoices:
        for it in i.get("items", []):
            p = products.get(it.get("product_id"))
            key = it.get("product_id") or f"custom:{it.get('description', '')}"
            row = by_product[key]
            row["name"] = p["name"] if p else it.get("description", "Custom item")
            row["units"] += it.get("quantity", 0)
            row["revenue"] += it.get("total", 0)
            by_category[(p.get("category") if p else None) or "Services / Other"] += it.get("total", 0)
            if p:
                cogs += float(p.get("cost", 0) or 0) * float(it.get("quantity", 0) or 0)
    by_customer = defaultdict(lambda: {"customer_id": "", "name": "", "revenue": 0.0, "invoices": 0})
    for i in invoices:
        row = by_customer[i.get("customer_id") or i.get("customer_name")]
        row.update({"customer_id": i.get("customer_id", ""), "name": i.get("customer_name", "")})
        row["revenue"] += i["subtotal"]
        row["invoices"] += 1
    exp_by_cat = defaultdict(float)
    for e in expenses:
        exp_by_cat[e["category"]] += e["amount"]
    total_expenses = sum(e["amount"] for e in expenses)

    # Monthly series across the range (max 24 months shown)
    s, e_ = date.fromisoformat(start), date.fromisoformat(end)
    n_months = min(24, (e_.year - s.year) * 12 + e_.month - s.month + 1)
    months = _month_buckets(n_months, e_)
    rev_m, exp_m, cash_m = defaultdict(float), defaultdict(float), defaultdict(float)
    for i in invoices:
        rev_m[i["issue_date"][:7]] += i["subtotal"]
    for e in expenses:
        exp_m[e["date"][:7]] += e["amount"]
    for p in payments:
        cash_m[p["date"][:7]] += p["amount"]

    r2 = lambda v: round(v, 2)
    return {
        "from": start, "to": end,
        "revenue": r2(revenue), "tax_collected": r2(tax), "invoiced_total": r2(revenue + tax),
        "cost_of_goods": r2(cogs), "gross_profit": r2(revenue - cogs),
        "expenses": r2(total_expenses), "net_profit": r2(revenue - cogs - total_expenses),
        "collected": r2(sum(p["amount"] for p in payments)),
        "expenses_paid": r2(sum(e["amount"] for e in expenses if e.get("status") == "paid")),
        "expenses_pending": r2(sum(e["amount"] for e in expenses if e.get("status") == "pending")),
        "invoice_count": len(invoices), "payment_count": len(payments), "expense_count": len(expenses),
        "monthly": [{"month": label, "revenue": r2(rev_m[k]), "expenses": r2(exp_m[k]), "collected": r2(cash_m[k])} for k, label in months],
        "expense_by_category": sorted([{"category": k, "amount": r2(v)} for k, v in exp_by_cat.items()], key=lambda x: x["amount"], reverse=True),
        "sales_by_category": sorted([{"category": k, "amount": r2(v)} for k, v in by_category.items()], key=lambda x: x["amount"], reverse=True),
        "top_customers": sorted([{**v, "revenue": r2(v["revenue"])} for v in by_customer.values()], key=lambda x: x["revenue"], reverse=True)[:8],
        "top_products": sorted([{**v, "revenue": r2(v["revenue"])} for v in by_product.values()], key=lambda x: x["revenue"], reverse=True)[:8],
        "receivables_aging": _aging(open_invoices, today_str()),
    }


@api.get("/notifications", tags=["dashboard"])
async def notifications(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    await refresh_overdue(org_id)
    today = today_str()
    items = []
    overdue = await db.invoices.find(all_of({"org_id": org_id, "status": "overdue"}, member_filter(user)), {"_id": 0, "items": 0}).sort("due_date", 1).to_list(50)
    for i in overdue[:5]:
        items.append({"id": i["id"], "type": "overdue", "title": f"Invoice {i['invoice_number']} is overdue",
                      "description": i.get("customer_name", ""), "amount": balance_of(i), "time": i.get("due_date", "")})
    low = await db.products.find({"org_id": org_id, "status": {"$ne": "inactive"}, "$expr": {"$lte": ["$stock_quantity", "$reorder_level"]}},
                                 {"_id": 0, "id": 1, "name": 1, "stock_quantity": 1, "reorder_level": 1}).to_list(50)
    for p in low[:5]:
        items.append({"id": p["id"], "type": "stock", "title": f"Low stock: {p['name']}",
                      "description": f"{p['stock_quantity']} left (reorder at {p['reorder_level']})", "time": ""})
    tasks = await db.tasks.find(all_of({"org_id": org_id, "status": {"$nin": ["done", "completed"]},
                                        "$or": [{"priority": "high"}, {"due_date": {"$gt": "", "$lte": today}}]},
                                       member_filter(user, TASK_SCOPE)), {"_id": 0}).sort("due_date", 1).to_list(50)
    for t in tasks[:5]:
        late = t.get("due_date") and t["due_date"] < today
        items.append({"id": t["id"], "type": "task", "title": t["title"],
                      "description": "Overdue task" if late else ("Due today" if t.get("due_date") == today else "High priority task"),
                      "time": t.get("due_date", "")})
    return items


# ---------------- Global Search ----------------
@api.get("/search", tags=["search"])
async def global_search(request: Request, user: dict = Depends(get_current_user)):
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return []
    org_id = user["active_org_id"]
    rx = text_match(q)
    mine = member_filter(user)
    base = {"org_id": org_id}
    results = []

    async def find(coll, fields, scope=None):
        query = all_of(base, scope or {}, {"$or": [{f: rx} for f in fields]})
        return await db[coll].find(query, {"_id": 0}).limit(5).to_list(5)

    for c in await find("customers", ["name", "email", "company"], mine):
        results.append({"type": "customer", "id": c["id"], "title": c["name"], "subtitle": c.get("company") or c.get("email", ""), "link": f"/customers/{c['id']}"})
    for i in await find("invoices", ["invoice_number", "customer_name"], mine):
        results.append({"type": "invoice", "id": i["id"], "title": i["invoice_number"], "subtitle": f"{i.get('customer_name', '')} · {i.get('status', '').replace('_', ' ')}", "link": f"/invoices/{i['id']}"})
    for l in await find("leads", ["name", "company", "email"], member_filter(user, LEAD_SCOPE)):
        results.append({"type": "lead", "id": l["id"], "title": l.get("company") or l["name"], "subtitle": f"{l['name']} · {l.get('stage', '')}", "link": f"/leads?q={quote(l.get('company') or l['name'])}"})
    for p in await find("products", ["name", "sku", "category"]):
        results.append({"type": "product", "id": p["id"], "title": p["name"], "subtitle": f"{p.get('sku', '')} · {p.get('stock_quantity', 0)} in stock", "link": f"/products?q={quote(p['name'])}"})
    for s in await find("suppliers", ["name", "contact_name", "email"]):
        results.append({"type": "supplier", "id": s["id"], "title": s["name"], "subtitle": s.get("contact_name") or s.get("email", ""), "link": f"/suppliers?q={quote(s['name'])}"})
    for e in await find("expenses", ["category", "vendor", "description"], mine):
        results.append({"type": "expense", "id": e["id"], "title": e["category"], "subtitle": f"{e.get('vendor', '')} · {e.get('date', '')}", "link": f"/expenses?q={quote(e['category'])}"})
    for em in await find("employees", ["name", "email", "job_title"]):
        results.append({"type": "employee", "id": em["id"], "title": em["name"], "subtitle": em.get("job_title", ""), "link": f"/employees/{em['id']}"})
    for t in await find("tasks", ["title", "assignee", "customer_name"], member_filter(user, TASK_SCOPE)):
        results.append({"type": "task", "id": t["id"], "title": t["title"], "subtitle": f"{t.get('status', '').replace('_', ' ')} · {t.get('assignee') or 'Unassigned'}", "link": f"/tasks?q={quote(t['title'])}"})
    return results


# ---------------- Business Activity Feed ----------------
@api.get("/activity", tags=["dashboard"])
async def activity_feed(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    mine = member_filter(user)
    base = {"org_id": org_id}
    events = []
    for c in await db.customers.find(all_of(base, mine), {"_id": 0}).sort("created_at", -1).limit(15).to_list(15):
        events.append({"type": "customer", "title": "Customer added", "description": c["name"], "date": c.get("created_at", ""), "link": f"/customers/{c['id']}"})
    for i in await db.invoices.find(all_of(base, mine), {"_id": 0, "items": 0}).sort("created_at", -1).limit(15).to_list(15):
        events.append({"type": "invoice", "title": "Invoice created", "description": f"{i['invoice_number']} · {i.get('customer_name', '')}", "date": i.get("created_at", ""), "link": f"/invoices/{i['id']}"})
    for p in await db.payments.find(all_of(base, mine), {"_id": 0}).sort("created_at", -1).limit(15).to_list(15):
        events.append({"type": "payment", "title": "Payment recorded", "description": f"{p.get('invoice_number', '')} · {p.get('customer_name', '')}", "amount": p.get("amount", 0), "date": p.get("created_at", ""), "link": f"/invoices/{p['invoice_id']}" if p.get("invoice_id") else "/sales"})
    for e in await db.expenses.find(all_of(base, mine), {"_id": 0}).sort("created_at", -1).limit(10).to_list(10):
        events.append({"type": "expense", "title": "Expense added", "description": f"{e['category']} · {e.get('vendor', '')}", "amount": e.get("amount", 0), "date": e.get("created_at", ""), "link": f"/expenses?q={quote(e['category'])}"})
    for m in await db.stock_movements.find(base, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10):
        verb = {"in": "Stock in", "out": "Stock out"}.get(m["type"], "Stock count")
        events.append({"type": "stock", "title": verb, "description": f"{m['product_name']} · {m['quantity']}", "date": m.get("created_at", ""), "link": "/inventory"})
    for t in await db.tasks.find(all_of(base, member_filter(user, TASK_SCOPE), {"status": {"$in": ["completed", "done"]}}), {"_id": 0}).sort("updated_at", -1).limit(8).to_list(8):
        events.append({"type": "task", "title": "Task completed", "description": t["title"], "date": t.get("updated_at", ""), "link": f"/tasks?q={quote(t['title'])}"})
    events.sort(key=lambda x: x.get("date", ""), reverse=True)
    return events[:20]


# ---------------- Team / Members (multi-user) ----------------
team = APIRouter(prefix="/team", tags=["team"])


@team.get("")
async def list_team(user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0})
    members = await db.users.find({"org_ids": user["active_org_id"]}, {"_id": 0, "password_hash": 0}).to_list(200)
    rank = {"owner": 0, "admin": 1, "member": 2}
    rows = [{
        "id": m["id"], "name": m["name"], "email": m["email"],
        "role": workspace_role(m, org),
        "job_title": m.get("job_title", ""), "picture": m.get("picture", ""),
        "is_you": m["id"] == user["id"], "created_at": m.get("created_at", ""),
    } for m in members]
    return sorted(rows, key=lambda r: (rank.get(r["role"], 3), r["name"].lower()))


@team.post("/invite")
async def invite_member(payload: InviteInput, user: dict = Depends(get_current_user)):
    if not is_privileged(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can invite members")
    if payload.role == "admin" and user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the workspace owner can add admins")
    name = payload.name.strip()
    email = payload.email.strip().lower()
    org_id = user["active_org_id"]
    existing = await db.users.find_one({"email": email})
    if existing:
        if org_id in existing.get("org_ids", []):
            raise HTTPException(status_code=400, detail="This person is already in the workspace")
        await db.users.update_one({"id": existing["id"]}, {"$addToSet": {"org_ids": org_id}, "$set": {f"org_roles.{org_id}": payload.role}})
        return {"status": "added_existing", "email": email, "name": existing["name"]}
    temp_password = secrets.token_urlsafe(9)
    uid = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "id": uid, "name": name, "email": email, "password_hash": hash_password(temp_password),
        "picture": "", "phone": "", "job_title": "Team Member", "provider": "password", "role": payload.role,
        "org_ids": [org_id], "org_roles": {org_id: payload.role}, "active_org_id": org_id,
        "must_change_password": True,
        "preferences": {"currency": "USD", "timezone": "America/New_York", "date_format": "MMM d, yyyy", "email_notifications": True},
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    return {"status": "invited", "email": email, "name": name, "temp_password": temp_password}


@team.put("/{member_id}/role")
async def change_member_role(member_id: str, payload: RoleUpdateInput, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the workspace owner can change roles")
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if member_id == org.get("owner_user_id"):
        raise HTTPException(status_code=400, detail="The owner's role can't be changed")
    member = await db.users.find_one({"id": member_id, "org_ids": org_id}, {"_id": 0, "name": 1})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.users.update_one({"id": member_id}, {"$set": {f"org_roles.{org_id}": payload.role, "updated_at": now_iso()}})
    return {"success": True, "name": member["name"], "role": payload.role}


@team.delete("/{member_id}")
async def remove_member(member_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    if not org or org.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Only the workspace owner can remove members")
    if member_id == org.get("owner_user_id"):
        raise HTTPException(status_code=400, detail="The owner cannot be removed")
    member = await db.users.find_one({"id": member_id, "org_ids": org_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.users.update_one({"id": member_id}, {"$pull": {"org_ids": org_id}, "$unset": {f"org_roles.{org_id}": ""}})
    if member.get("active_org_id") == org_id:
        remaining = [o for o in member.get("org_ids", []) if o != org_id]
        await db.users.update_one({"id": member_id}, {"$set": {"active_org_id": remaining[0] if remaining else ""}})
    # Their open assignments would otherwise point at someone who can no longer see them.
    await db.tasks.update_many({"org_id": org_id, "assignee_id": member_id}, {"$set": {"assignee_id": "", "assignee": ""}})
    return {"success": True}


REASSIGN_COLLECTIONS = ["customers", "invoices", "expenses", "tasks", "leads", "payments"]


@team.post("/{member_id}/reassign")
async def reassign_member(member_id: str, payload: ReassignInput, user: dict = Depends(get_current_user)):
    if not is_privileged(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can reassign records")
    org_id = user["active_org_id"]
    to_id = payload.to_member_id
    if member_id == to_id:
        raise HTTPException(status_code=400, detail="Choose a different teammate to reassign to")
    from_member = await db.users.find_one({"id": member_id, "org_ids": org_id}, {"_id": 0})
    to_member = await db.users.find_one({"id": to_id, "org_ids": org_id}, {"_id": 0})
    if not from_member or not to_member:
        raise HTTPException(status_code=404, detail="Member not found in this workspace")
    counts = {}
    total = 0
    for coll in REASSIGN_COLLECTIONS:
        res = await db[coll].update_many({"org_id": org_id, "created_by": member_id}, {"$set": {"created_by": to_id, "updated_at": now_iso()}})
        counts[coll] = res.modified_count
        total += res.modified_count
    await db.tasks.update_many({"org_id": org_id, "assignee_id": member_id}, {"$set": {"assignee_id": to_id, "assignee": to_member["name"], "updated_at": now_iso()}})
    await db.leads.update_many({"org_id": org_id, "owner_id": member_id}, {"$set": {"owner_id": to_id, "owner": to_member["name"], "updated_at": now_iso()}})
    return {"success": True, "counts": counts, "total": total, "from": from_member["name"], "to": to_member["name"]}


api.include_router(team)


# ---------------- My Work (personal home) ----------------
@api.get("/my-work", tags=["dashboard"])
async def my_work(user: dict = Depends(get_current_user)):
    org = user["active_org_id"]
    uid = user["id"]
    name = user.get("name", "")
    tasks = await db.tasks.find({"org_id": org, "status": {"$nin": ["completed", "done"]}, "$or": [{"assignee_id": uid}, {"assignee": name}, {"created_by": uid}]}, {"_id": 0}).sort("due_date", 1).to_list(200)
    leads = await db.leads.find({"org_id": org, "stage": {"$nin": ["won", "lost"]}, "$or": [{"owner_id": uid}, {"owner": name}, {"created_by": uid}]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Tasks without a due date sort last, not first.
    tasks.sort(key=lambda t: t.get("due_date") or "9999")
    events = []
    for i in await db.invoices.find({"org_id": org, "created_by": uid}, {"_id": 0, "items": 0}).sort("created_at", -1).limit(8).to_list(8):
        events.append({"type": "invoice", "title": "Invoice created", "description": f"{i['invoice_number']} · {i.get('customer_name', '')}", "date": i.get("created_at", ""), "link": f"/invoices/{i['id']}"})
    for p in await db.payments.find({"org_id": org, "$or": [{"recorded_by": uid}, {"created_by": uid, "recorded_by": {"$exists": False}}]}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6):
        events.append({"type": "payment", "title": "Payment recorded", "description": f"{p.get('invoice_number', '')} · {p.get('customer_name', '')}", "date": p.get("created_at", ""), "link": f"/invoices/{p.get('invoice_id', '')}"})
    for c in await db.customers.find({"org_id": org, "created_by": uid}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6):
        events.append({"type": "customer", "title": "Customer added", "description": c["name"], "date": c.get("created_at", ""), "link": f"/customers/{c['id']}"})
    events.sort(key=lambda x: x.get("date", ""), reverse=True)
    return {"tasks": tasks, "leads": leads, "activity": events[:12], "open_tasks": len(tasks), "open_leads": len(leads)}


# ---------------- Settings / Organizations ----------------
@api.get("/organizations", tags=["settings"])
async def list_orgs(user: dict = Depends(get_current_user)):
    orgs = await db.organizations.find({"id": {"$in": user.get("org_ids", [])}}, {"_id": 0}).to_list(50)
    order = {oid: idx for idx, oid in enumerate(user.get("org_ids", []))}
    orgs.sort(key=lambda o: order.get(o["id"], 999))
    return orgs


@api.get("/organizations/current", tags=["settings"])
async def current_org(user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org["your_role"] = user["role"]
    return org


@api.post("/organizations/switch", tags=["settings"])
async def switch_org(payload: SwitchOrgInput, user: dict = Depends(get_current_user)):
    if payload.org_id not in user.get("org_ids", []):
        raise HTTPException(status_code=403, detail="You do not belong to this workspace")
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_org_id": payload.org_id, "updated_at": now_iso()}})
    return await db.organizations.find_one({"id": payload.org_id}, {"_id": 0})


@api.put("/settings/organization", tags=["settings"])
async def update_org(payload: OrganizationUpdate, user: dict = Depends(get_current_user)):
    if not can_manage_team(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can change business settings")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "admins_see_all" in data and user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the workspace owner can change what admins can see")
    if "invoice_prefix" in data:
        data["invoice_prefix"] = data["invoice_prefix"].upper()
    data["updated_at"] = now_iso()
    await db.organizations.update_one({"id": user["active_org_id"]}, {"$set": data})
    return await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0})


@api.put("/settings/profile", tags=["settings"])
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["updated_at"] = now_iso()
    await db.users.update_one({"id": user["id"]}, {"$set": data})
    if data.get("name") and data["name"] != user.get("name"):
        # Keep assignment labels in sync with the new name.
        await db.tasks.update_many({"assignee_id": user["id"]}, {"$set": {"assignee": data["name"]}})
        await db.leads.update_many({"owner_id": user["id"]}, {"$set": {"owner": data["name"]}})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0, "org_roles": 0, "token_version": 0})


@api.put("/settings/preferences", tags=["settings"])
async def update_preferences(payload: PreferencesUpdate, user: dict = Depends(get_current_user)):
    prefs = user.get("preferences", {})
    for k, v in payload.model_dump().items():
        if v is not None:
            prefs[k] = v
    await db.users.update_one({"id": user["id"]}, {"$set": {"preferences": prefs, "updated_at": now_iso()}})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0, "org_roles": 0, "token_version": 0})


app.include_router(auth_router)
app.include_router(api)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    # Log the details for us; show the user something they can act on.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again in a moment."})


_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    # Credentials (cookies) are only allowed for explicitly listed origins, never for "*".
    allow_credentials=bool(_origins) and "*" not in _origins,
    allow_origins=_origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("org_ids")
    await db.organizations.create_index("id", unique=True)
    await db.user_sessions.create_index("session_token")
    for coll in ["customers", "suppliers", "products", "expenses", "employees", "tasks", "invoices", "payments", "stock_movements", "leads"]:
        await db[coll].create_index("org_id")
        await db[coll].create_index([("org_id", 1), ("id", 1)])
        await db[coll].create_index([("org_id", 1), ("created_at", -1)])
    await db.invoices.create_index([("org_id", 1), ("status", 1)])
    await db.invoices.create_index([("org_id", 1), ("customer_id", 1)])
    await db.invoices.create_index([("org_id", 1), ("items.product_id", 1)])
    await db.payments.create_index([("org_id", 1), ("invoice_id", 1)])
    await db.stock_movements.create_index([("org_id", 1), ("product_id", 1)])
    await db.customers.create_index([("org_id", 1), ("email", 1)])
    await db.products.create_index([("org_id", 1), ("supplier_id", 1)])


async def _migrate_workspace_roles():
    """Roles used to be one global field per user, so someone who owned their own workspace kept
    'owner' powers in every workspace they were added to. Record an explicit role per workspace."""
    async for u in db.users.find({"org_ids.0": {"$exists": True}}, {"_id": 0, "id": 1, "org_ids": 1, "org_roles": 1, "role": 1}):
        roles = dict(u.get("org_roles") or {})
        changed = False
        for org_id in u.get("org_ids", []):
            if org_id in roles:
                continue
            org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "owner_user_id": 1})
            if org and org.get("owner_user_id") != u["id"]:
                roles[org_id] = u.get("role") if u.get("role") in ("admin", "member") else "member"
                changed = True
        if changed:
            await db.users.update_one({"id": u["id"]}, {"$set": {"org_roles": roles}})


@app.on_event("startup")
async def startup():
    await _ensure_indexes()
    await _migrate_workspace_roles()
    await _seed_admin()


async def _seed_admin():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        active_org_id, org_ids = await create_user_workspaces(user_id, "Aniruddh Samarth", admin_email)
        await db.users.insert_one({
            "id": user_id, "name": "Aniruddh Samarth", "email": admin_email,
            "password_hash": hash_password(admin_password), "picture": "", "phone": "",
            "job_title": "Owner", "provider": "password", "role": "owner",
            "org_ids": org_ids, "active_org_id": active_org_id,
            "preferences": {"currency": "USD", "timezone": "America/New_York", "date_format": "MMM d, yyyy", "email_notifications": True},
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        logger.info("Seeded admin user %s with %d workspaces", admin_email, len(org_ids))
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown():
    from database import client
    client.close()
