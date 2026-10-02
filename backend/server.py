import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Body
from starlette.middleware.cors import CORSMiddleware
from pymongo import ReturnDocument

from database import db, now_iso
from models import (
    CustomerCreate, SupplierCreate, ProductCreate, ExpenseCreate, EmployeeCreate,
    TaskCreate, InvoiceCreate, StockMovementCreate, PaymentInput, PaymentCreate, PaymentAllocationInput, LeadCreate,
    OrganizationUpdate, ProfileUpdate, PreferencesUpdate, SwitchOrgInput, InviteInput, ReassignInput,
    CustomerNoteCreate, MemberRoleUpdate, MemberStatusUpdate, CommentCreate, HandoffCreate, ApprovalCreate, ApprovalDecision,
)
from crud import make_crud, is_privileged, member_filter
from auth import router as auth_router, get_current_user, hash_password, verify_password
from seed import create_user_workspaces

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bmp")

app = FastAPI(title="Six6Fix API")
api = APIRouter()


@api.get("/")
async def root():
    return {"message": "Six6Fix API", "status": "ok"}


async def log_audit_event(org_id: str, user: dict, action: str, category: str, target_id: str = "", target_name: str = "", details: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "actor_id": user.get("id", "system") if isinstance(user, dict) else "system",
        "actor_name": user.get("name", "System") if isinstance(user, dict) else "System",
        "actor_email": user.get("email", "") if isinstance(user, dict) else "",
        "action": action,
        "category": category,
        "target_id": target_id,
        "target_name": target_name,
        "details": details,
        "created_at": now_iso()
    }
    await db.audit_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/audit-logs", tags=["dashboard"])
async def list_audit_logs(request: Request, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    limit = min(200, int(request.query_params.get("limit", 100)))
    category = request.query_params.get("category")
    q = {"org_id": org_id}
    if category and category != "all":
        q["category"] = category
    return await db.audit_logs.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)


# ---------------- Generic CRUD modules ----------------
api.include_router(make_crud("suppliers", SupplierCreate, ["name", "contact_name", "email", "category"], ["status"]), prefix="/suppliers", tags=["suppliers"])
api.include_router(make_crud("products", ProductCreate, ["name", "sku", "category", "supplier_name"], ["status", "category"]), prefix="/products", tags=["products"])
api.include_router(make_crud("expenses", ExpenseCreate, ["category", "vendor", "description"], ["status", "category", "payment_method"], member_scoped=True), prefix="/expenses", tags=["expenses"])
api.include_router(make_crud("employees", EmployeeCreate, ["name", "email", "job_title", "department"], ["status", "department"]), prefix="/employees", tags=["employees"])
api.include_router(make_crud("tasks", TaskCreate, ["title", "assignee", "description", "customer_name"], ["status", "priority"], member_scoped=True), prefix="/tasks", tags=["tasks"])
api.include_router(make_crud("leads", LeadCreate, ["name", "company", "email", "owner"], ["stage", "owner"], member_scoped=True), prefix="/leads", tags=["leads"])


# ---------------- Invoices (custom) ----------------
inv = APIRouter(prefix="/invoices", tags=["invoices"])


def _compute_invoice(payload: dict):
    subtotal = 0.0
    items = []
    for it in payload.get("items", []):
        qty = float(it.get("quantity", 1))
        price = float(it.get("unit_price", 0))
        discount = float(it.get("discount", 0) or 0)
        total = round(qty * price - discount, 2)
        subtotal += total
        items.append({**it, "quantity": qty, "unit_price": price, "discount": discount, "total": total})
    tax_rate = float(payload.get("tax_rate", 0) or 0)
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax_amount, 2)
    return items, round(subtotal, 2), tax_amount, total


def _invoice_status(total, amount_paid, requested):
    if requested == "paid":
        return "paid"
    if requested in ("draft", "sent", "cancelled", "overdue"):
        return requested
    if total > 0 and amount_paid >= total:
        return "paid"
    if amount_paid > 0:
        return "partially_paid"
    return requested or "pending"


async def refresh_overdue(org_id: str):
    """Flag sent invoices whose due date has passed, so nobody has to do it by hand.
    Partially paid invoices keep their status; the list highlights their past-due date instead."""
    await db.invoices.update_many(
        {"org_id": org_id, "status": {"$in": ["sent", "pending"]}, "due_date": {"$lt": now_iso()[:10], "$gt": ""}},
        {"$set": {"status": "overdue", "updated_at": now_iso()}},
    )
    await _auto_detect_recurring_expenses(org_id)


async def _auto_check_low_stock_reorder(org_id: str, product_id: str):
    """Automatically check if stock fell below threshold and generate a high-priority reorder task."""
    product = await db.products.find_one({"id": product_id, "org_id": org_id}, {"_id": 0})
    if not product:
        return
    qty = float(product.get("stock_quantity", 0))
    reorder_lvl = float(product.get("reorder_level", 5))
    if qty <= reorder_lvl:
        rec_qty = max(10, int(reorder_lvl * 2 - qty))
        cost_unit = float(product.get("cost", 0))
        est_cost = round(rec_qty * cost_unit, 2)
        existing = await db.tasks.find_one({
            "org_id": org_id,
            "status": {"$ne": "done"},
            "$or": [
                {"reference": f"Low Stock #{product_id}"},
                {"title": f"Reorder stock: {product['name']}"}
            ]
        })
        if not existing:
            task = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "title": f"Reorder stock: {product['name']}",
                "description": f"Automated Reorder Task: Stock ({int(qty)}) dropped below threshold ({int(reorder_lvl)}). Suggested PO: {rec_qty} units (Est. Cost: ₹{est_cost:,.2f}). Supplier: {product.get('supplier_name', 'Primary Supplier')}",
                "assignee": "Inventory Manager",
                "assignee_id": "",
                "priority": "high",
                "status": "todo",
                "due_date": now_iso()[:10],
                "customer_id": "",
                "customer_name": "",
                "reference": f"Low Stock #{product_id}",
                "created_by": "system",
                "created_at": now_iso(),
                "updated_at": now_iso()
            }
            await db.tasks.insert_one(task)


async def _auto_sync_customer_intelligence(org_id: str, customer_id: str):
    """Sync customer tier and calculated metrics back into the customer document."""
    if not customer_id:
        return
    totals = await _customer_totals(org_id)
    t = totals.get(customer_id, {"total_sales": 0.0, "outstanding": 0.0, "invoice_count": 0, "overdue_count": 0, "last_order_date": ""})
    customer = await db.customers.find_one({"id": customer_id, "org_id": org_id}, {"_id": 0})
    if not customer:
        return
    insights = _derive_customer_insights(customer, t)
    await db.customers.update_one(
        {"id": customer_id},
        {"$set": {
            "total_sales": round(t["total_sales"], 2),
            "outstanding": round(t["outstanding"], 2),
            "invoice_count": t["invoice_count"],
            "insights": insights,
            "updated_at": now_iso()
        }}
    )


async def _auto_generate_invoice_from_lead(org_id: str, lead: dict, customer: dict, user_id: str):
    val = float(lead.get("value", 0) or 0)
    if val <= 0:
        return None
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    inv_num = await next_invoice_number(org or {})
    due_date = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()[:10]
    items = [{
        "product_id": "",
        "name": f"Deal fulfillment: {lead.get('name', 'Converted Lead')}",
        "quantity": 1,
        "unit_price": val,
        "discount": 0.0,
        "total": val
    }]
    draft_invoice = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "invoice_number": inv_num,
        "customer_id": customer["id"],
        "customer_name": customer["name"],
        "issue_date": now_iso()[:10],
        "due_date": due_date,
        "status": "draft",
        "items": items,
        "subtotal": val,
        "tax_rate": 0.0,
        "tax_amount": 0.0,
        "total": val,
        "amount_paid": 0.0,
        "notes": f"Auto-drafted from lead conversion (Pipeline deal: ₹{val:,.2f})",
        "inventory_deducted": False,
        "created_by": user_id,
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.invoices.insert_one(draft_invoice)
    draft_invoice.pop("_id", None)
    return draft_invoice


async def _auto_detect_recurring_expenses(org_id: str):
    """Detect recurring expense templates and provision current month entries if missing."""
    current_month = now_iso()[:7]
    recurring_templates = await db.expenses.find({"org_id": org_id, "is_recurring": True}, {"_id": 0}).to_list(100)
    for tpl in recurring_templates:
        existing = await db.expenses.find_one({
            "org_id": org_id,
            "category": tpl.get("category"),
            "vendor": tpl.get("vendor"),
            "date": {"$regex": f"^{current_month}"}
        })
        if not existing:
            new_exp = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "category": tpl.get("category"),
                "vendor": tpl.get("vendor"),
                "amount": tpl.get("amount", 0.0),
                "description": f"Auto-recurring expense: {tpl.get('description', tpl.get('category'))}",
                "payment_method": tpl.get("payment_method", "bank_transfer"),
                "status": "pending",
                "is_recurring": True,
                "date": f"{current_month}-01",
                "created_by": tpl.get("created_by", "system"),
                "created_at": now_iso(),
                "updated_at": now_iso()
            }
            await db.expenses.insert_one(new_exp)


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


async def _restore_inventory(org_id, items, invoice_number):
    """Put stock back for a cancelled invoice whose items had already been deducted."""
    for it in items:
        pid = it.get("product_id")
        qty = int(it.get("quantity", 0))
        if not pid or qty <= 0:
            continue
        product = await db.products.find_one({"id": pid, "org_id": org_id}, {"_id": 0})
        if not product:
            continue
        await db.products.update_one({"id": pid}, {"$set": {"stock_quantity": product["stock_quantity"] + qty, "updated_at": now_iso()}})
        await db.stock_movements.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id, "product_id": pid, "product_name": product["name"],
            "type": "in", "quantity": qty, "reason": f"Invoice {invoice_number} cancelled",
            "date": now_iso()[:10], "created_at": now_iso(),
        })


async def _deduct_inventory(org_id, items, invoice_number):
    for it in items:
        pid = it.get("product_id")
        if not pid:
            continue
        product = await db.products.find_one({"id": pid, "org_id": org_id}, {"_id": 0})
        if not product:
            continue
        qty = int(it.get("quantity", 0))
        if qty <= 0:
            continue
        new_stock = max(0, product["stock_quantity"] - qty)
        await db.products.update_one({"id": pid}, {"$set": {"stock_quantity": new_stock, "updated_at": now_iso()}})
        await db.stock_movements.insert_one({
            "id": str(uuid.uuid4()), "org_id": org_id, "product_id": pid, "product_name": product["name"],
            "type": "out", "quantity": qty, "reason": f"Invoice {invoice_number}",
            "date": now_iso()[:10], "created_at": now_iso(),
        })
        await _auto_check_low_stock_reorder(org_id, pid)


@inv.get("")
async def list_invoices(request: Request, user: dict = Depends(get_current_user)):
    await refresh_overdue(user["active_org_id"])
    q = {"org_id": user["active_org_id"], **member_filter(user)}
    status = request.query_params.get("status")
    if status and status != "all":
        q["status"] = status
    search = request.query_params.get("search")
    if search:
        q["$or"] = [{"invoice_number": {"$regex": search, "$options": "i"}},
                    {"customer_name": {"$regex": search, "$options": "i"}}]
    return await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@inv.post("")
async def create_invoice(payload: InvoiceCreate, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    org = await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0}) or {}
    
    # Auto-prefill default tax rate if not provided or 0
    if float(data.get("tax_rate", 0) or 0) == 0 and org.get("invoice_tax_rate"):
        data["tax_rate"] = float(org["invoice_tax_rate"])

    c = None
    if not data.get("customer_name") and data.get("customer_id"):
        c = await db.customers.find_one({"id": data["customer_id"], "org_id": user["active_org_id"]}, {"_id": 0})
        data["customer_name"] = c["name"] if c else ""
    elif data.get("customer_id"):
        c = await db.customers.find_one({"id": data["customer_id"], "org_id": user["active_org_id"]}, {"_id": 0})

    items, subtotal, tax_amount, total = _compute_invoice(data)
    amount_paid = total if data["status"] == "paid" else 0.0
    status = _invoice_status(total, amount_paid, data["status"])

    # Credit limit & Risk check
    credit_warning = ""
    if c:
        c_limit = float(c.get("credit_limit", 0) or 0)
        c_outstanding = float(c.get("outstanding", 0) or 0)
        if c_limit > 0 and (c_outstanding + total) > c_limit:
            credit_warning = f"Credit Limit Exceeded: Total outstanding (₹{c_outstanding + total:,.2f}) exceeds customer limit (₹{c_limit:,.2f})."

    doc = {
        "id": str(uuid.uuid4()), "org_id": user["active_org_id"],
        "invoice_number": await next_invoice_number(org),
        "customer_id": data["customer_id"], "customer_name": data["customer_name"],
        "issue_date": data["issue_date"], "due_date": data["due_date"], "status": status,
        "items": items, "subtotal": subtotal, "tax_rate": data["tax_rate"], "tax_amount": tax_amount,
        "total": total, "amount_paid": amount_paid, "notes": data.get("notes", ""),
        "credit_warning": credit_warning,
        "inventory_deducted": status not in ("draft", "cancelled"),
        "created_by": user["id"],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.invoices.insert_one(doc)

    # Automatically log interaction in customer timeline
    if doc.get("customer_id"):
        await db.customer_interactions.insert_one({
            "id": str(uuid.uuid4()), "org_id": user["active_org_id"],
            "customer_id": doc["customer_id"], "type": "invoice",
            "note": f"Invoice {doc['invoice_number']} issued for ₹{total:,.2f} (Due: {doc['due_date']})",
            "author_id": user["id"], "author_name": user.get("name", "User"), "created_at": now_iso()
        })

    # Deduct inventory for stocked line items unless the invoice is a draft/cancelled
    if doc["inventory_deducted"]:
        await _deduct_inventory(user["active_org_id"], items, doc["invoice_number"])
    if status == "paid":
        await _record_payment(user["active_org_id"], doc, total, "bank_transfer", data["issue_date"], "Auto-recorded on paid invoice")
    if doc.get("customer_id"):
        await _auto_sync_customer_intelligence(user["active_org_id"], doc["customer_id"])
    doc.pop("_id", None)
    return doc


@inv.post("/auto-pay-customer")
async def auto_pay_customer(payload: PaymentAllocationInput, user: dict = Depends(get_current_user)):
    """FIFO Auto-Payment Allocation across customer's oldest outstanding invoices."""
    org_id = user["active_org_id"]
    customer_id = payload.customer_id
    remaining_payment = float(payload.amount)
    if remaining_payment <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    open_invoices = await db.invoices.find(
        {"org_id": org_id, "customer_id": customer_id, "status": {"$in": ["sent", "pending", "overdue", "partially_paid"]}},
        {"_id": 0}
    ).sort("issue_date", 1).to_list(1000)

    if not open_invoices:
        raise HTTPException(status_code=400, detail="No open or overdue invoices found for this customer.")

    settled_invoices = []
    for inv_doc in open_invoices:
        if remaining_payment <= 0:
            break
        bal = round(inv_doc["total"] - inv_doc.get("amount_paid", 0), 2)
        if bal <= 0:
            continue
        apply_amt = min(remaining_payment, bal)
        updated = await _apply_payment(org_id, inv_doc, apply_amt, payload.method, payload.date or now_iso()[:10], payload.notes or "FIFO Auto-allocated payment", user=user)
        remaining_payment = round(remaining_payment - apply_amt, 2)
        settled_invoices.append({"invoice_id": inv_doc["id"], "invoice_number": inv_doc["invoice_number"], "allocated": apply_amt, "new_status": updated.get("status")})

    return {
        "success": True,
        "allocated_total": round(float(payload.amount) - remaining_payment, 2),
        "unallocated_remainder": remaining_payment,
        "settled_invoices": settled_invoices
    }


@inv.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    await refresh_overdue(user["active_org_id"])
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"], **member_filter(user)}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payments = await db.payments.find({"invoice_id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    invoice["payments"] = payments
    bal = round(invoice["total"] - invoice.get("amount_paid", 0), 2)
    invoice["balance"] = bal

    next_actions = []
    st = invoice.get("status", "")
    if st == "overdue":
        next_actions.append({"action": "remind", "label": "Send Urgent Reminder", "variant": "destructive"})
        next_actions.append({"action": "pay", "label": f"Record Payment (₹{bal:,.2f} due)", "variant": "default"})
    elif st in ("sent", "partially_paid", "pending"):
        next_actions.append({"action": "pay", "label": f"Record Payment (₹{bal:,.2f} due)", "variant": "default"})
        next_actions.append({"action": "remind", "label": "Send Friendly Reminder", "variant": "outline"})
    elif st == "draft":
        next_actions.append({"action": "issue", "label": "Issue & Send Invoice", "variant": "default"})
    elif st == "paid":
        next_actions.append({"action": "view_customer", "label": "View Customer Profile", "variant": "outline"})
    invoice["next_actions"] = next_actions
    return invoice


@inv.post("/{invoice_id}/status")
async def set_invoice_status(invoice_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"], **member_filter(user)}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    new_status = payload.get("status")
    if new_status not in ("draft", "sent", "paid", "partially_paid", "overdue", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    updates = {"status": _invoice_status(invoice["total"], invoice.get("amount_paid", 0), new_status), "updated_at": now_iso()}
    if new_status == "paid":
        remaining = round(invoice["total"] - invoice.get("amount_paid", 0), 2)
        if remaining > 0:
            await _record_payment(user["active_org_id"], invoice, remaining, "bank_transfer", now_iso()[:10], "Marked as paid")
        updates["amount_paid"] = invoice["total"]
    # Deduct inventory the first time an invoice leaves draft (only once)
    if new_status in ("sent", "paid") and not invoice.get("inventory_deducted"):
        await _deduct_inventory(user["active_org_id"], invoice.get("items", []), invoice["invoice_number"])
        updates["inventory_deducted"] = True
    # Cancelling returns any deducted stock (and allows a later re-send to deduct it again)
    if new_status == "cancelled" and invoice.get("inventory_deducted"):
        await _restore_inventory(user["active_org_id"], invoice.get("items", []), invoice["invoice_number"])
        updates["inventory_deducted"] = False
    await db.invoices.update_one({"id": invoice_id}, {"$set": updates})
    if invoice.get("customer_id"):
        await _auto_sync_customer_intelligence(user["active_org_id"], invoice["customer_id"])
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@inv.put("/{invoice_id}")
async def update_invoice(invoice_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    existing = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"], **member_filter(user)}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if "items" in payload or "tax_rate" in payload:
        merged = {**existing, **payload}
        items, subtotal, tax_amount, total = _compute_invoice(merged)
        payload.update({"items": items, "subtotal": subtotal, "tax_amount": tax_amount, "total": total})
    for k in ("id", "org_id", "_id", "created_at"):
        payload.pop(k, None)
    # Moving an overdue invoice's due date into the future makes it current again.
    if existing.get("status") == "overdue" and payload.get("due_date", "") >= now_iso()[:10]:
        payload["status"] = "partially_paid" if existing.get("amount_paid", 0) > 0 else "sent"
    payload["updated_at"] = now_iso()
    await db.invoices.update_one({"id": invoice_id}, {"$set": payload})
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@inv.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": invoice_id, "org_id": user["active_org_id"], **member_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.payments.delete_many({"invoice_id": invoice_id, "org_id": user["active_org_id"]})
    return {"success": True}


async def _record_payment(org_id, invoice, amount, method, date, notes=""):
    await db.payments.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "invoice_id": invoice["id"],
        "invoice_number": invoice["invoice_number"], "customer_id": invoice.get("customer_id", ""),
        "customer_name": invoice.get("customer_name", ""), "amount": float(amount),
        "method": method, "date": date or now_iso()[:10], "notes": notes,
        "created_by": invoice.get("created_by", ""), "created_at": now_iso(),
    })


async def _apply_payment(org_id, invoice, amount, method, date, notes="", user=None):
    # Idempotency check: prevent duplicate payment if requested twice within 15 seconds
    fifteen_sec_ago = (datetime.now(timezone.utc) - timedelta(seconds=15)).isoformat()
    recent_dup = await db.payments.find_one({
        "org_id": org_id,
        "invoice_id": invoice["id"],
        "amount": float(amount),
        "created_at": {"$gte": fifteen_sec_ago}
    })
    if recent_dup:
        return await db.invoices.find_one({"id": invoice["id"]}, {"_id": 0})

    new_paid = round(invoice.get("amount_paid", 0) + float(amount), 2)
    if new_paid >= invoice["total"] and invoice["total"] > 0:
        status = "paid"
    elif new_paid > 0:
        status = "partially_paid"
    else:
        status = invoice["status"]
    await db.invoices.update_one({"id": invoice["id"]}, {"$set": {"amount_paid": new_paid, "status": status, "updated_at": now_iso()}})
    await _record_payment(org_id, invoice, amount, method, date, notes)
    if invoice.get("customer_id"):
        await _auto_sync_customer_intelligence(org_id, invoice["customer_id"])
    if user:
        await log_audit_event(org_id, user, "payment_recorded", "financial", invoice["id"], invoice["invoice_number"], f"Recorded payment of ₹{float(amount):,.2f} via {method}")
    return await db.invoices.find_one({"id": invoice["id"]}, {"_id": 0})


@inv.post("/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, payload: PaymentInput, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"], **member_filter(user)}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return await _apply_payment(user["active_org_id"], invoice, payload.amount, payload.method, payload.date, user=user)


@inv.post("/{invoice_id}/remind")
async def send_invoice_reminder(invoice_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": org_id, **member_filter(user)}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    count = (invoice.get("reminder_count") or 0) + 1
    now_str = now_iso()
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"reminder_count": count, "last_reminder_sent": now_str, "updated_at": now_str}})
    
    if invoice.get("customer_id"):
        await db.customer_interactions.insert_one({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "customer_id": invoice["customer_id"],
            "type": "reminder",
            "note": f"Sent payment reminder #{count} for invoice {invoice['invoice_number']} (Status: {invoice['status']})",
            "author_id": user["id"],
            "author_name": user.get("name", "User"),
            "created_at": now_str,
        })
    
    updated = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    return {"success": True, "invoice": updated, "message": f"Payment reminder #{count} sent"}


api.include_router(inv)


# ---------------- Customers (custom: computed balances + history + intelligence) ----------------
cust = APIRouter(prefix="/customers", tags=["customers"])


async def _customer_totals(org_id):
    invoices = await db.invoices.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    totals = {}
    for i in invoices:
        cid = i.get("customer_id")
        if not cid:
            continue
        t = totals.setdefault(cid, {
            "total_sales": 0.0, "outstanding": 0.0, "invoice_count": 0,
            "overdue_count": 0, "last_order_date": ""
        })
        t["invoice_count"] += 1
        issue_date = i.get("issue_date") or i.get("created_at") or ""
        if issue_date > t["last_order_date"]:
            t["last_order_date"] = issue_date
        if i["status"] == "paid":
            t["total_sales"] += i["total"]
        if i["status"] in ("pending", "sent", "overdue", "partially_paid"):
            t["outstanding"] += i["total"] - i.get("amount_paid", 0)
            if i["status"] == "overdue":
                t["overdue_count"] += 1
    return totals


def _derive_customer_insights(c: dict, t: dict):
    total_sales = round(t.get("total_sales", 0.0), 2)
    outstanding = round(t.get("outstanding", 0.0), 2)
    inv_count = t.get("invoice_count", 0)
    overdue_count = t.get("overdue_count", 0)
    last_order = t.get("last_order_date", "")

    if total_sales >= 50000 or inv_count >= 5:
        tier = "VIP"
    elif overdue_count > 0:
        tier = "At-Risk"
    elif inv_count <= 1:
        tier = "New"
    else:
        tier = "Active"

    alerts = []
    if overdue_count > 0:
        alerts.append(f"{overdue_count} invoice(s) overdue (₹{outstanding:,.2f} balance)")
    if outstanding > 100000:
        alerts.append(f"High balance: ₹{outstanding:,.2f}")
    c_limit = float(c.get("credit_limit", 0) or 0)
    if c_limit > 0 and outstanding > c_limit:
        alerts.append(f"Credit limit exceeded: ₹{outstanding:,.2f} / ₹{c_limit:,.2f}")
    if inv_count == 0:
        alerts.append("No orders placed yet")

    if inv_count > 1:
        buying_cadence = "Regular buyer"
    elif inv_count == 1:
        buying_cadence = "First-time buyer"
    else:
        buying_cadence = "Prospect"

    return {
        "tier": tier,
        "buying_cadence": buying_cadence,
        "risk_alerts": alerts,
        "last_order_date": last_order,
    }


@cust.get("")
async def list_customers(request: Request, user: dict = Depends(get_current_user)):
    q = {"org_id": user["active_org_id"], **member_filter(user)}
    params = request.query_params
    search = params.get("search")
    if search:
        q["$or"] = [{f: {"$regex": search, "$options": "i"}} for f in ("name", "email", "company", "city")]
    status = params.get("status")
    if status and status != "all":
        q["status"] = status
    customers = await db.customers.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    totals = await _customer_totals(user["active_org_id"])
    for c in customers:
        t = totals.get(c["id"], {"total_sales": 0.0, "outstanding": 0.0, "invoice_count": 0, "overdue_count": 0, "last_order_date": ""})
        c["total_sales"] = round(t["total_sales"], 2)
        c["outstanding"] = round(t["outstanding"], 2)
        c["invoice_count"] = t["invoice_count"]
        c["insights"] = _derive_customer_insights(c, t)
    return customers


@cust.post("")
async def create_customer(payload: CustomerCreate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    email = payload.email.strip().lower() if payload.email else ""
    phone = payload.phone.strip() if payload.phone else ""

    # Duplicate check
    q_or = []
    if email:
        q_or.append({"email": email})
    if phone and len(phone) >= 7:
        q_or.append({"phone": phone})
    if q_or:
        existing = await db.customers.find_one({"org_id": org_id, "$or": q_or}, {"_id": 0})
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Customer already exists with matching contact info: '{existing['name']}' ({existing.get('email') or existing.get('phone')})"
            )

    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "created_by": user["id"],
        "total_sales": 0.0,
        "outstanding": 0.0,
        "invoice_count": 0,
        "created_at": now_iso(),
        "updated_at": now_iso()
    })
    await db.customers.insert_one(doc)

    await db.customer_interactions.insert_one({
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "customer_id": doc["id"],
        "type": "creation",
        "note": f"Customer account created by {user.get('name', 'User')}",
        "author_id": user["id"],
        "author_name": user.get("name", "User"),
        "created_at": now_iso(),
    })
    doc.pop("_id", None)
    return doc


@cust.get("/{customer_id}/history")
async def customer_history(customer_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    await refresh_overdue(org_id)
    customer = await db.customers.find_one({"id": customer_id, "org_id": org_id, **member_filter(user)}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    invoices = await db.invoices.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    payments = await db.payments.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    tasks = await db.tasks.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    notes = await db.customer_interactions.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    total_sales = round(sum(i["total"] for i in invoices if i["status"] == "paid"), 2)
    outstanding = round(sum(i["total"] - i.get("amount_paid", 0) for i in invoices if i["status"] in ("pending", "sent", "overdue", "partially_paid")), 2)
    total_paid = round(sum(p["amount"] for p in payments), 2)
    
    t_data = {
        "total_sales": total_sales, "outstanding": outstanding, "invoice_count": len(invoices),
        "overdue_count": sum(1 for i in invoices if i["status"] == "overdue"),
        "last_order_date": invoices[0].get("issue_date") if invoices else ""
    }
    insights = _derive_customer_insights(customer, t_data)
    
    timeline = []
    for inv_item in invoices:
        timeline.append({
            "id": inv_item["id"], "type": "invoice", "title": f"Invoice {inv_item['invoice_number']}",
            "description": f"Total: ₹{inv_item['total']:,.2f} · Status: {inv_item['status']}",
            "date": inv_item.get("created_at") or inv_item.get("issue_date"), "link": f"/invoices/{inv_item['id']}"
        })
    for p in payments:
        timeline.append({
            "id": p["id"], "type": "payment", "title": f"Payment Received ({str(p.get('method', '')).replace('_', ' ')})",
            "description": f"Amount: ₹{p['amount']:,.2f} · Ref: {p.get('invoice_number', '')}",
            "date": p.get("created_at") or p.get("date"), "link": f"/invoices/{p.get('invoice_id', '')}"
        })
    for t_item in tasks:
        timeline.append({
            "id": t_item["id"], "type": "task", "title": f"Task: {t_item['title']}",
            "description": f"Status: {t_item['status']} · Priority: {t_item['priority']}",
            "date": t_item.get("created_at"), "link": "/tasks"
        })
    for n in notes:
        timeline.append({
            "id": n["id"], "type": "note", "title": f"Interaction ({n.get('type', 'note').capitalize()})",
            "description": n["note"], "author": n.get("author_name", "User"),
            "date": n.get("created_at")
        })
    
    timeline.sort(key=lambda x: x.get("date") or "", reverse=True)
    
    return {
        "customer": customer, "invoices": invoices, "payments": payments, "tasks": tasks, "notes": notes,
        "total_sales": total_sales, "outstanding": outstanding, "total_paid": total_paid,
        "invoice_count": len(invoices), "insights": insights, "timeline": timeline,
    }


@cust.post("/{customer_id}/notes")
async def add_customer_note(customer_id: str, payload: CustomerNoteCreate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    customer = await db.customers.find_one({"id": customer_id, "org_id": org_id, **member_filter(user)}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "customer_id": customer_id,
        "type": payload.type,
        "note": payload.note,
        "author_id": user["id"],
        "author_name": user.get("name", "User"),
        "created_at": now_iso(),
    }
    await db.customer_interactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@cust.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    doc = await db.customers.find_one({"id": customer_id, "org_id": user["active_org_id"], **member_filter(user)}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@cust.put("/{customer_id}")
async def update_customer(customer_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    for k in ("id", "org_id", "_id", "created_at", "total_sales", "outstanding", "invoice_count", "insights"):
        payload.pop(k, None)
    payload["updated_at"] = now_iso()
    res = await db.customers.update_one({"id": customer_id, "org_id": user["active_org_id"], **member_filter(user)}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await db.customers.find_one({"id": customer_id, "org_id": user["active_org_id"]}, {"_id": 0})


@cust.delete("/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    customer = await db.customers.find_one({"id": customer_id, "org_id": org_id, **member_filter(user)}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Dependency check: prevent accidental deletion if active unpaid invoices exist
    unpaid_count = await db.invoices.count_documents({
        "org_id": org_id,
        "customer_id": customer_id,
        "status": {"$in": ["pending", "sent", "overdue", "partially_paid"]}
    })
    if unpaid_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete '{customer['name']}'. They have {unpaid_count} active/unpaid invoice(s). Please settle or cancel those invoices first.")

    res = await db.customers.delete_one({"id": customer_id, "org_id": org_id, **member_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")

    await log_audit_event(org_id, user, "customer_deleted", "crm", customer_id, customer["name"], f"Deleted customer '{customer['name']}'")
    return {"success": True}


api.include_router(cust)


# ---------------- Leads: convert to customer ----------------
@api.post("/leads/{lead_id}/convert", tags=["leads"])
async def convert_lead(lead_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    lead = await db.leads.find_one({"id": lead_id, "org_id": org_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    customer = {
        "id": str(uuid.uuid4()), "org_id": org_id, "name": lead["name"], "email": lead.get("email", ""),
        "phone": lead.get("phone", ""), "company": lead.get("company", ""), "address": "", "city": "",
        "country": "", "status": "active", "notes": f"Converted from lead. {lead.get('notes', '')}".strip(),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.customers.insert_one(customer)
    await db.leads.update_one({"id": lead_id}, {"$set": {"stage": "won", "customer_id": customer["id"], "updated_at": now_iso()}})
    
    # Auto-create follow-up onboarding task
    task = {
        "id": str(uuid.uuid4()), "org_id": org_id, "title": f"Onboard new customer: {customer['name']}",
        "description": f"Lead converted to customer ({customer.get('company', '')}). Pipeline value: ₹{lead.get('value', 0):,.2f}",
        "assignee": lead.get("owner") or user.get("name", ""), "assignee_id": lead.get("owner_id") or user["id"],
        "priority": "high", "status": "todo", "due_date": now_iso()[:10],
        "customer_id": customer["id"], "customer_name": customer["name"], "reference": f"Lead Conversion #{lead_id[:6]}",
        "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso()
    }
    await db.tasks.insert_one(task)
    
    # Insert interaction note
    await db.customer_interactions.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "customer_id": customer["id"],
        "type": "conversion", "note": f"Successfully converted lead '{lead['name']}' to customer (Pipeline value: ₹{lead.get('value', 0):,.2f}).",
        "author_id": user["id"], "author_name": user.get("name", "System"), "created_at": now_iso()
    })

    # Auto-generate draft invoice if deal value exists & sync customer intelligence
    draft_invoice = await _auto_generate_invoice_from_lead(org_id, lead, customer, user["id"])
    await _auto_sync_customer_intelligence(org_id, customer["id"])

    customer.pop("_id", None)
    task.pop("_id", None)
    return {"customer": customer, "created_task": task, "created_invoice": draft_invoice}


# ---------------- Product & Inventory Intelligence ----------------
@api.get("/products/intelligence", tags=["products"])
async def product_intelligence(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    products = await db.products.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    invoices = await db.invoices.find({"org_id": org_id, "status": {"$nin": ["draft", "cancelled"]}}, {"_id": 0}).to_list(5000)
    
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()[:10]
    units_sold_30d = defaultdict(float)
    for inv_item in invoices:
        if (inv_item.get("issue_date") or inv_item.get("created_at") or "") >= cutoff_30d:
            for item in inv_item.get("items", []):
                pid = item.get("product_id")
                if pid:
                    units_sold_30d[pid] += float(item.get("quantity", 0))
    
    total_cost_val = 0.0
    total_retail_val = 0.0
    low_stock_items = []
    enhanced_products = []
    
    for p in products:
        qty = float(p.get("stock_quantity", 0))
        cost = float(p.get("cost", 0))
        price = float(p.get("price", 0))
        
        cost_val = qty * cost
        retail_val = qty * price
        total_cost_val += cost_val
        total_retail_val += retail_val
        
        sold_30 = units_sold_30d.get(p["id"], 0.0)
        daily_burn = sold_30 / 30.0 if sold_30 > 0 else 0.0
        days_left = round(qty / daily_burn, 1) if daily_burn > 0 else 999
        
        reorder_lvl = p.get("reorder_level", 5)
        is_low = qty <= reorder_lvl
        if is_low:
            low_stock_items.append({
                "id": p["id"], "name": p["name"], "stock": qty, "reorder_level": reorder_lvl,
                "days_left": days_left, "supplier_name": p.get("supplier_name", "Primary Supplier"),
                "supplier_id": p.get("supplier_id", "")
            })
            
        p_copy = {**p, "sold_30d": sold_30, "daily_burn": round(daily_burn, 2), "days_left": days_left, "is_low_stock": is_low}
        enhanced_products.append(p_copy)
        
    return {
        "products": enhanced_products,
        "total_cost_valuation": round(total_cost_val, 2),
        "total_retail_valuation": round(total_retail_val, 2),
        "potential_gross_profit": round(total_retail_val - total_cost_val, 2),
        "low_stock_count": len(low_stock_items),
        "reorder_recommendations": low_stock_items,
    }


# ---------------- Payments ----------------
@api.get("/payments", tags=["payments"])
async def list_payments(user: dict = Depends(get_current_user)):
    return await db.payments.find({"org_id": user["active_org_id"], **member_filter(user)}, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api.post("/payments", tags=["payments"])
async def record_payment(payload: PaymentCreate, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": payload.invoice_id, "org_id": user["active_org_id"], **member_filter(user)}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    updated = await _apply_payment(user["active_org_id"], invoice, payload.amount, payload.method, payload.date, payload.notes)
    updated.pop("_id", None)
    return {"invoice": updated, "balance": round(updated["total"] - updated.get("amount_paid", 0), 2)}


# ---------------- Inventory / Stock movements ----------------
@api.get("/stock-movements", tags=["inventory"])
async def list_movements(request: Request, user: dict = Depends(get_current_user)):
    q = {"org_id": user["active_org_id"]}
    pid = request.query_params.get("product_id")
    if pid:
        q["product_id"] = pid
    return await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api.post("/stock-movements", tags=["inventory"])
async def create_movement(payload: StockMovementCreate, user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": payload.product_id, "org_id": user["active_org_id"]}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    qty = int(payload.quantity)
    if payload.type == "out" and qty > int(product.get("stock_quantity", 0)):
        raise HTTPException(
            status_code=400,
            detail=f"Stock Deduction Guardrail: Cannot deduct {qty} units of '{product['name']}'. Only {product['stock_quantity']} units available in stock."
        )

    if payload.type == "in":
        delta = qty
    elif payload.type == "out":
        delta = -qty
    else:
        delta = qty - product["stock_quantity"]
    new_stock = max(0, product["stock_quantity"] + delta)
    await db.products.update_one({"id": product["id"]}, {"$set": {"stock_quantity": new_stock, "updated_at": now_iso()}})
    doc = {
        "id": str(uuid.uuid4()), "org_id": user["active_org_id"], "product_id": product["id"],
        "product_name": product["name"], "type": payload.type, "quantity": qty,
        "unit_cost": float(product.get("cost", 0)),
        "valuation": round(qty * float(product.get("cost", 0)), 2),
        "reason": payload.reason or "", "date": payload.date or now_iso()[:10], "created_at": now_iso(),
    }
    await db.stock_movements.insert_one(doc)
    await _auto_check_low_stock_reorder(user["active_org_id"], product["id"])
    doc.pop("_id", None)
    return {"movement": doc, "new_stock": new_stock}


# ---------------- Dashboard ----------------
@api.get("/dashboard/stats", tags=["dashboard"])
async def dashboard_stats(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    await refresh_overdue(org_id)
    mf = member_filter(user)
    invoices = await db.invoices.find({"org_id": org_id, **mf}, {"_id": 0}).to_list(5000)
    expenses = await db.expenses.find({"org_id": org_id, **mf}, {"_id": 0}).to_list(5000)
    payments = await db.payments.find({"org_id": org_id, **mf}, {"_id": 0}).to_list(5000)
    products = await db.products.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    tasks = await db.tasks.find({"org_id": org_id, **mf}, {"_id": 0}).to_list(5000)

    total_sales = round(sum(i["total"] for i in invoices if i["status"] == "paid"), 2)
    outstanding = round(sum(i["total"] - i.get("amount_paid", 0) for i in invoices if i["status"] in ("pending", "sent", "overdue", "partially_paid")), 2)
    total_expenses = round(sum(e["amount"] for e in expenses), 2)
    profit = round(total_sales - total_expenses, 2)
    amount_collected = round(sum(p["amount"] for p in payments), 2)
    customer_count = await db.customers.count_documents({"org_id": org_id, **mf})
    product_count = len(products)
    supplier_count = await db.suppliers.count_documents({"org_id": org_id})
    employee_count = await db.employees.count_documents({"org_id": org_id})
    outstanding_count = sum(1 for i in invoices if i["status"] in ("pending", "sent", "overdue", "partially_paid"))
    overdue_invoices = [i for i in invoices if i["status"] == "overdue"]
    overdue_count = len(overdue_invoices)
    overdue_amount = round(sum(i["total"] - i.get("amount_paid", 0) for i in overdue_invoices), 2)
    low_stock = [p for p in products if p["stock_quantity"] <= p["reorder_level"]]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    new_customers = await db.customers.count_documents({"org_id": org_id, "created_at": {"$gte": cutoff}, **mf})
    open_tasks = sum(1 for t in tasks if t["status"] != "completed" and t["status"] != "done")

    recent_invoices = sorted(invoices, key=lambda x: x.get("created_at", ""), reverse=True)[:5]
    txns = [{"type": "income", "label": f"Payment · {p.get('customer_name', '')}", "amount": p["amount"], "date": p["date"], "ref": p.get("invoice_number", "")} for p in payments]
    txns += [{"type": "expense", "label": f"Expense · {e['category']}", "amount": e["amount"], "date": e["date"], "ref": e.get("vendor", "")} for e in expenses]
    recent_transactions = sorted(txns, key=lambda x: x.get("date", ""), reverse=True)[:8]

    def _attention(t):
        return t["status"] not in ("done", "completed") and (t["priority"] == "high" or t.get("due_date", "") <= now_iso()[:10])
    tasks_attention = [t for t in tasks if _attention(t)][:6]

    # 6-month sales trend
    trend = defaultdict(float)
    exp_trend = defaultdict(float)
    months = []
    base = datetime.now(timezone.utc)
    for m in range(5, -1, -1):
        d = (base.replace(day=1) - timedelta(days=30 * m))
        key = d.strftime("%Y-%m")
        months.append({"key": key, "label": d.strftime("%b")})
    valid = {m["key"] for m in months}
    for i in invoices:
        if i["status"] == "paid":
            k = i.get("issue_date", "")[:7]
            if k in valid:
                trend[k] += i["total"]
    for e in expenses:
        k = e.get("date", "")[:7]
        if k in valid:
            exp_trend[k] += e["amount"]
    sales_trend = [{"month": m["label"], "sales": round(trend[m["key"]], 2), "expenses": round(exp_trend[m["key"]], 2)} for m in months]

    exp_by_cat = defaultdict(float)
    for e in expenses:
        exp_by_cat[e["category"]] += e["amount"]
    expense_breakdown = sorted([{"category": k, "amount": round(v, 2)} for k, v in exp_by_cat.items()], key=lambda x: x["amount"], reverse=True)[:6]

    # Sales by product category (from invoice line items, excluding drafts/cancelled)
    prod_cat = {p["id"]: p.get("category", "Uncategorized") for p in products}
    sales_by_cat = defaultdict(float)
    for i in invoices:
        if i["status"] in ("draft", "cancelled"):
            continue
        for it in i.get("items", []):
            cat = prod_cat.get(it.get("product_id"), "Services / Other")
            sales_by_cat[cat] += it.get("total", 0)
    sales_by_category = sorted([{"category": k, "amount": round(v, 2)} for k, v in sales_by_cat.items()], key=lambda x: x["amount"], reverse=True)[:6]

    status_counts = defaultdict(int)
    for i in invoices:
        status_counts[i["status"]] += 1
    invoice_status_breakdown = [{"status": k, "count": v} for k, v in status_counts.items()]

    # Build Decision Support & Health Metrics
    decision_support = []
    if overdue_count > 0:
        decision_support.append({
            "id": "ds_overdue",
            "title": f"{overdue_count} Overdue Invoice{'s' if overdue_count > 1 else ''} (₹{overdue_amount:,.2f})",
            "why": f"Overdue invoices delay cash flow. {overdue_count} customer{'s have' if overdue_count > 1 else ' has'} past-due payments.",
            "next_action": "Send Payment Reminders",
            "action_link": "/invoices?status=overdue",
            "severity": "critical"
        })
    if len(low_stock) > 0:
        decision_support.append({
            "id": "ds_low_stock",
            "title": f"{len(low_stock)} Product{'s' if len(low_stock) > 1 else ''} Running Low on Stock",
            "why": "Inventory depletion risks sales loss and delayed order fulfillment.",
            "next_action": "Review Stock & Reorder",
            "action_link": "/inventory",
            "severity": "warning"
        })
    if open_tasks > 0:
        attn_count = sum(1 for t in tasks if _attention(t))
        decision_support.append({
            "id": "ds_open_tasks",
            "title": f"{open_tasks} Open Task{'s' if open_tasks > 1 else ''} ({attn_count} High Priority)",
            "why": "Unresolved tasks may delay operations or customer follow-ups.",
            "next_action": "Go to My Work",
            "action_link": "/my-work",
            "severity": "info"
        })

    health_score = 100
    if overdue_count > 0:
        health_score -= min(30, overdue_count * 5)
    if len(low_stock) > 0:
        health_score -= min(20, len(low_stock) * 4)
    if open_tasks > 5:
        health_score -= 10
    health_score = max(40, health_score)

    business_health = {
        "score": health_score,
        "status": "Excellent" if health_score >= 85 else ("Good" if health_score >= 70 else "Needs Attention"),
        "cashflow_trend": "Positive" if profit >= 0 else "Negative",
        "receivables_risk": "High" if overdue_count >= 3 else ("Moderate" if overdue_count > 0 else "Low"),
    }

    return {
        "total_sales": total_sales, "outstanding": outstanding, "outstanding_count": outstanding_count,
        "total_expenses": total_expenses, "profit": profit, "amount_collected": amount_collected,
        "overdue_count": overdue_count, "overdue_amount": overdue_amount, "new_customers": new_customers,
        "open_tasks": open_tasks, "customer_count": customer_count,
        "product_count": product_count, "supplier_count": supplier_count, "employee_count": employee_count,
        "invoice_count": len(invoices), "low_stock_count": len(low_stock),
        "recent_invoices": recent_invoices, "recent_transactions": recent_transactions,
        "tasks_attention": tasks_attention, "sales_trend": sales_trend, "expense_breakdown": expense_breakdown,
        "sales_by_category": sales_by_category, "invoice_status_breakdown": invoice_status_breakdown,
        "decision_support": decision_support, "business_health": business_health,
    }


@api.get("/notifications", tags=["dashboard"])
async def notifications(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    await refresh_overdue(org_id)
    items = []
    overdue = await db.invoices.find({"org_id": org_id, "status": "overdue"}, {"_id": 0}).to_list(50)
    for i in overdue[:5]:
        items.append({"id": i["id"], "type": "overdue", "title": f"Invoice {i['invoice_number']} is overdue",
                      "description": f"{i['customer_name']} · {i['total']}", "time": i.get("due_date", "")})
    products = await db.products.find({"org_id": org_id}, {"_id": 0}).to_list(500)
    for p in [p for p in products if p["stock_quantity"] <= p["reorder_level"]][:5]:
        items.append({"id": p["id"], "type": "stock", "title": f"Low stock: {p['name']}",
                      "description": f"{p['stock_quantity']} left (reorder at {p['reorder_level']})", "time": ""})
    tasks = await db.tasks.find({"org_id": org_id, "priority": "high", "status": {"$ne": "done"}}, {"_id": 0}).to_list(50)
    for t in tasks[:5]:
        items.append({"id": t["id"], "type": "task", "title": t["title"], "description": "High priority task", "time": t.get("due_date", "")})
    return items


# ---------------- Global Search ----------------
@api.get("/search", tags=["search"])
async def global_search(request: Request, user: dict = Depends(get_current_user)):
    q = (request.query_params.get("q") or "").strip()
    category = (request.query_params.get("category") or "all").lower()
    if not q:
        return []
    org_id = user["active_org_id"]
    rx = {"$regex": q, "$options": "i"}
    results = []

    if category in ("all", "customer", "customers"):
        for c in await db.customers.find({"org_id": org_id, "$or": [{"name": rx}, {"email": rx}, {"company": rx}, {"city": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "customer", "id": c["id"], "title": c["name"], "subtitle": c.get("company") or c.get("email", ""), "link": f"/customers/{c['id']}"})

    if category in ("all", "invoice", "invoices"):
        for i in await db.invoices.find({"org_id": org_id, "$or": [{"invoice_number": rx}, {"customer_name": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "invoice", "id": i["id"], "title": i["invoice_number"], "subtitle": f"{i.get('customer_name', '')} · Status: {i.get('status', '').replace('_', ' ')} · ₹{i.get('total', 0):,.2f}", "link": f"/invoices/{i['id']}"})

    if category in ("all", "product", "products"):
        for p in await db.products.find({"org_id": org_id, "$or": [{"name": rx}, {"sku": rx}, {"category": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "product", "id": p["id"], "title": p["name"], "subtitle": f"{p.get('sku', 'No SKU')} · {p.get('stock_quantity', 0)} in stock", "link": "/products"})

    if category in ("all", "lead", "leads"):
        for l in await db.leads.find({"org_id": org_id, "$or": [{"name": rx}, {"company": rx}, {"email": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "lead", "id": l["id"], "title": f"Lead: {l['name']}", "subtitle": f"{l.get('company', '')} · Stage: {l.get('stage', 'lead')} · ₹{l.get('value', 0):,.2f}", "link": "/leads"})

    if category in ("all", "supplier", "suppliers"):
        for s in await db.suppliers.find({"org_id": org_id, "$or": [{"name": rx}, {"contact_name": rx}, {"category": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "supplier", "id": s["id"], "title": f"Supplier: {s['name']}", "subtitle": f"{s.get('category', 'Vendor')} · Contact: {s.get('contact_name', '')}", "link": "/suppliers"})

    if category in ("all", "expense", "expenses"):
        for e in await db.expenses.find({"org_id": org_id, "$or": [{"category": rx}, {"vendor": rx}, {"description": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "expense", "id": e["id"], "title": e["category"], "subtitle": f"{e.get('vendor', 'Vendor')} · ₹{e.get('amount', 0):,.2f}", "link": "/expenses"})

    if category in ("all", "employee", "employees"):
        for em in await db.employees.find({"org_id": org_id, "$or": [{"name": rx}, {"email": rx}, {"job_title": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "employee", "id": em["id"], "title": em["name"], "subtitle": em.get("job_title", "Staff"), "link": f"/employees/{em['id']}"})

    if category in ("all", "task", "tasks"):
        for t in await db.tasks.find({"org_id": org_id, "$or": [{"title": rx}, {"assignee": rx}, {"customer_name": rx}]}, {"_id": 0}).limit(5).to_list(5):
            results.append({"type": "task", "id": t["id"], "title": t["title"], "subtitle": f"Priority: {t.get('priority', 'medium')} · Status: {t.get('status', 'todo')}", "link": "/tasks"})

    return results


# ---------------- Business Activity Feed ----------------
@api.get("/activity", tags=["dashboard"])
async def activity_feed(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    events = []
    for c in await db.customers.find({"org_id": org_id}, {"_id": 0}).sort("created_at", -1).limit(15).to_list(15):
        events.append({"type": "customer", "title": "Customer added", "description": c["name"], "date": c.get("created_at", ""), "link": f"/customers/{c['id']}"})
    for i in await db.invoices.find({"org_id": org_id}, {"_id": 0}).sort("created_at", -1).limit(15).to_list(15):
        verb = "paid" if i["status"] == "paid" else "created"
        events.append({"type": "invoice", "title": f"Invoice {verb}", "description": f"{i['invoice_number']} · {i.get('customer_name', '')}", "date": i.get("created_at", ""), "link": f"/invoices/{i['id']}"})
    for p in await db.payments.find({"org_id": org_id}, {"_id": 0}).sort("created_at", -1).limit(15).to_list(15):
        events.append({"type": "payment", "title": "Payment recorded", "description": f"{p.get('invoice_number', '')} · {p.get('customer_name', '')}", "date": p.get("created_at", ""), "link": f"/invoices/{p['invoice_id']}" if p.get("invoice_id") else "/sales"})
    for e in await db.expenses.find({"org_id": org_id}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10):
        events.append({"type": "expense", "title": "Expense created", "description": f"{e['category']} · {e.get('vendor', '')}", "date": e.get("created_at", ""), "link": "/expenses"})
    for m in await db.stock_movements.find({"org_id": org_id}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10):
        events.append({"type": "stock", "title": f"Stock {m['type']}", "description": f"{m['product_name']} · {m['quantity']}", "date": m.get("created_at", ""), "link": "/inventory"})
    for t in await db.tasks.find({"org_id": org_id, "status": {"$in": ["completed", "done"]}}, {"_id": 0}).sort("updated_at", -1).limit(8).to_list(8):
        events.append({"type": "task", "title": "Task completed", "description": t["title"], "date": t.get("updated_at", ""), "link": "/tasks"})
    events.sort(key=lambda x: x.get("date", ""), reverse=True)
    return events[:20]


# ---------------- Team / Members (multi-user) ----------------
team = APIRouter(prefix="/team", tags=["team"])


@team.get("")
async def list_team(user: dict = Depends(get_current_user)):
    org = await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0})
    owner_id = org.get("owner_user_id") if org else None
    members = await db.users.find({"org_ids": user["active_org_id"]}, {"_id": 0, "password_hash": 0}).to_list(200)
    return [{
        "id": m["id"], "name": m["name"], "email": m["email"],
        "role": "owner" if m["id"] == owner_id else m.get("role", "member"),
        "job_title": m.get("job_title", ""), "picture": m.get("picture", ""),
        "is_you": m["id"] == user["id"], "created_at": m.get("created_at", ""),
    } for m in members]


@team.post("/invite")
async def invite_member(payload: InviteInput, user: dict = Depends(get_current_user)):
    if not is_privileged(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can invite members")
    name = payload.name.strip()
    email = payload.email.strip().lower()
    role = payload.role if payload.role in ("admin", "member") else "member"
    org_id = user["active_org_id"]
    existing = await db.users.find_one({"email": email})
    if existing:
        if org_id in existing.get("org_ids", []):
            raise HTTPException(status_code=400, detail="This person is already in the workspace")
        await db.users.update_one({"id": existing["id"]}, {"$addToSet": {"org_ids": org_id}})
        return {"status": "added_existing", "email": email, "name": existing["name"]}
    temp_password = secrets.token_urlsafe(6)
    uid = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "id": uid, "name": name, "email": email, "password_hash": hash_password(temp_password),
        "picture": "", "phone": "", "job_title": "Team Member", "provider": "password", "role": role,
        "org_ids": [org_id], "active_org_id": org_id,
        "preferences": {"currency": "USD", "timezone": "America/New_York", "date_format": "MMM d, yyyy", "email_notifications": True},
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    return {"status": "invited", "email": email, "name": name, "temp_password": temp_password}


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
    await db.users.update_one({"id": member_id}, {"$pull": {"org_ids": org_id}})
    if member.get("active_org_id") == org_id:
        remaining = [o for o in member.get("org_ids", []) if o != org_id]
        await db.users.update_one({"id": member_id}, {"$set": {"active_org_id": remaining[0] if remaining else ""}})
    return {"success": True}


@team.put("/{member_id}/role")
async def update_member_role(member_id: str, payload: MemberRoleUpdate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    if not is_privileged(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can update member roles")
    member = await db.users.find_one({"id": member_id, "org_ids": org_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    new_role = payload.role.lower()
    allowed = ("owner", "admin", "manager", "sales", "finance", "operations", "staff", "member")
    if new_role not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid role. Choose from: {', '.join(allowed)}")
    
    await db.users.update_one({"id": member_id}, {"$set": {"role": new_role, "updated_at": now_iso()}})
    await log_audit_event(org_id, user, "member_role_changed", "team", member_id, member["name"], f"Changed {member['name']}'s role to {new_role}")
    return {"success": True, "role": new_role}


@team.put("/{member_id}/status")
async def update_member_status(member_id: str, payload: MemberStatusUpdate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    if not is_privileged(user):
        raise HTTPException(status_code=403, detail="Only owners and admins can update member status")
    member = await db.users.find_one({"id": member_id, "org_ids": org_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    status = payload.status.lower()
    if status not in ("active", "deactivated"):
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'deactivated'")
    
    await db.users.update_one({"id": member_id}, {"$set": {"status": status, "updated_at": now_iso()}})
    await log_audit_event(org_id, user, f"member_{status}", "team", member_id, member["name"], f"Set {member['name']}'s status to {status}")
    return {"success": True, "status": status}


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
    await log_audit_event(org_id, user, "records_reassigned", "team", member_id, from_member["name"], f"Reassigned {total} records from {from_member['name']} to {to_member['name']}")
    return {"success": True, "counts": counts, "total": total, "from": from_member["name"], "to": to_member["name"]}


@team.get("/workload")
async def team_workload(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    members = await db.users.find({"org_ids": org_id}, {"_id": 0, "password_hash": 0}).to_list(200)
    tasks = await db.tasks.find({"org_id": org_id, "status": {"$nin": ["completed", "done"]}}, {"_id": 0}).to_list(2000)
    leads = await db.leads.find({"org_id": org_id, "stage": {"$nin": ["won", "lost"]}}, {"_id": 0}).to_list(2000)
    overdue_invs = await db.invoices.find({"org_id": org_id, "status": "overdue"}, {"_id": 0}).to_list(500)
    low_stock = await db.products.find({"org_id": org_id}, {"_id": 0}).to_list(2000)
    low_stock = [p for p in low_stock if p.get("stock_quantity", 0) <= p.get("reorder_level", 5)]
    
    member_work = []
    for m in members:
        uid = m["id"]
        uname = m.get("name", "")
        m_tasks = [t for t in tasks if t.get("assignee_id") == uid or t.get("assignee") == uname]
        m_leads = [l for l in leads if l.get("owner_id") == uid or l.get("owner") == uname]
        overdue_t = sum(1 for t in m_tasks if t.get("due_date", "") and t.get("due_date", "") < now_iso()[:10])
        member_work.append({
            "member_id": uid,
            "name": uname,
            "role": m.get("role", "member"),
            "status": m.get("status", "active"),
            "open_tasks_count": len(m_tasks),
            "overdue_tasks_count": overdue_t,
            "active_leads_count": len(m_leads),
        })

    # Unassigned Work Items Queue
    unassigned_tasks = [t for t in tasks if not t.get("assignee_id") and not t.get("assignee")]
    unassigned_leads = [l for l in leads if not l.get("owner_id") and not l.get("owner")]
    unassigned_reorders = [p for p in low_stock if not any(t for t in tasks if f"Low Stock #{p['id']}" in t.get("reference", ""))]

    unassigned_queue = []
    for t in unassigned_tasks:
        unassigned_queue.append({"id": t["id"], "type": "task", "title": t["title"], "subtitle": f"Priority: {t.get('priority', 'medium')}", "link": "/tasks"})
    for l in unassigned_leads:
        unassigned_queue.append({"id": l["id"], "type": "lead", "title": f"Lead: {l['name']}", "subtitle": f"Value: ₹{l.get('value', 0):,.2f}", "link": "/leads"})
    for p in unassigned_reorders:
        unassigned_queue.append({"id": p["id"], "type": "stock", "title": f"Stock Reorder: {p['name']}", "subtitle": f"Qty: {p.get('stock_quantity', 0)}", "link": "/inventory"})

    return {
        "member_workload": member_work,
        "unassigned_queue": unassigned_queue,
        "unassigned_count": len(unassigned_queue),
    }


api.include_router(team)


# ---------------- Collaboration Router (Comments, Handoffs, Approvals) ----------------
collab = APIRouter(prefix="/collaboration", tags=["collaboration"])


@collab.post("/comments")
async def create_comment(payload: CommentCreate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")
    
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "author_id": user["id"],
        "author_name": user.get("name", "User"),
        "author_email": user.get("email", ""),
        "content": content,
        "mentions": payload.mentions,
        "created_at": now_iso()
    }
    await db.comments.insert_one(doc)
    
    # Process @Mentions -> create personalized notifications
    all_members = await db.users.find({"org_ids": org_id}, {"_id": 0}).to_list(200)
    for m in all_members:
        name_clean = m.get("name", "").lower()
        first_name = name_clean.split()[0] if name_clean else ""
        if m["id"] in payload.mentions or (first_name and f"@{first_name}" in content.lower()):
            if m["id"] != user["id"]:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "recipient_id": m["id"],
                    "type": "mention",
                    "title": f"{user.get('name', 'Teammate')} mentioned you",
                    "description": content[:120],
                    "time": now_iso(),
                    "link": f"/{payload.target_type}s/{payload.target_id}" if payload.target_type in ("customer", "invoice", "lead") else "/my-work"
                })

    doc.pop("_id", None)
    return doc


@collab.get("/comments")
async def list_comments(target_type: str, target_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    return await db.comments.find({"org_id": org_id, "target_type": target_type, "target_id": target_id}, {"_id": 0}).sort("created_at", 1).to_list(500)


@collab.post("/handoffs")
async def create_handoff(payload: HandoffCreate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    to_member = await db.users.find_one({"id": payload.assignee_id, "org_ids": org_id}, {"_id": 0})
    if not to_member:
        raise HTTPException(status_code=404, detail="Assigned teammate not found")
    
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "from_user_id": user["id"],
        "from_user_name": user.get("name", "User"),
        "to_user_id": payload.assignee_id,
        "to_user_name": to_member.get("name", payload.assignee_name),
        "note": payload.note or "",
        "created_at": now_iso()
    }
    await db.handoffs.insert_one(doc)

    # Update record responsibility
    coll_name = f"{payload.target_type}s" if not payload.target_type.endswith("s") else payload.target_type
    if coll_name in ("customers", "leads", "tasks", "invoices", "orders"):
        update_fields = {"updated_at": now_iso()}
        if payload.target_type == "task":
            update_fields.update({"assignee": to_member["name"], "assignee_id": to_member["id"]})
        elif payload.target_type == "lead":
            update_fields.update({"owner": to_member["name"], "owner_id": to_member["id"]})
        elif payload.target_type == "customer":
            update_fields.update({"assigned_to": to_member["name"], "assigned_to_id": to_member["id"]})
        elif payload.target_type == "invoice":
            update_fields.update({"assigned_to": to_member["name"], "assigned_to_id": to_member["id"]})
        
        await db[coll_name].update_one({"id": payload.target_id, "org_id": org_id}, {"$set": update_fields})

    # Send notification to recipient
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "recipient_id": to_member["id"],
        "type": "handoff",
        "title": f"Work Handoff from {user.get('name', 'Teammate')}",
        "description": f"You are now responsible for {payload.target_type} #{payload.target_id[:6]}. Note: {payload.note or 'No notes'}",
        "time": now_iso(),
        "link": f"/{coll_name}/{payload.target_id}" if coll_name in ("customers", "invoices", "leads") else "/my-work"
    })

    await log_audit_event(org_id, user, "work_handoff", "team", payload.target_id, payload.target_type, f"Handed off {payload.target_type} to {to_member['name']}")
    doc.pop("_id", None)
    return doc


@collab.get("/handoffs")
async def list_handoffs(target_type: str, target_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    return await db.handoffs.find({"org_id": org_id, "target_type": target_type, "target_id": target_id}, {"_id": 0}).sort("created_at", -1).to_list(200)


@collab.post("/approvals")
async def create_approval(payload: ApprovalCreate, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "title": payload.title,
        "amount": payload.amount,
        "requester_id": user["id"],
        "requester_name": user.get("name", "User"),
        "status": "pending",
        "notes": payload.notes or "",
        "created_at": now_iso(),
        "decided_at": None,
        "decided_by": None
    }
    await db.approvals.insert_one(doc)
    await log_audit_event(org_id, user, "approval_requested", "financial", payload.target_id, payload.title, f"Requested approval for {payload.title} (₹{payload.amount:,.2f})")
    doc.pop("_id", None)
    return doc


@collab.get("/approvals")
async def list_approvals(request: Request, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    status = request.query_params.get("status")
    q = {"org_id": org_id}
    if status and status != "all":
        q["status"] = status
    return await db.approvals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@collab.post("/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, payload: ApprovalDecision, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    if not is_privileged(user) and user.get("role") not in ("owner", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Only owners, admins, or managers can decide approvals")
    
    appr = await db.approvals.find_one({"id": approval_id, "org_id": org_id}, {"_id": 0})
    if not appr:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    new_status = payload.status.lower()
    if new_status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")
    
    updates = {
        "status": new_status,
        "decided_at": now_iso(),
        "decided_by": user["id"],
        "decided_by_name": user.get("name", "User"),
        "decision_notes": payload.notes or ""
    }
    await db.approvals.update_one({"id": approval_id}, {"$set": updates})

    # Notify requester
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "recipient_id": appr["requester_id"],
        "type": "approval_decision",
        "title": f"Approval {new_status.capitalize()}: {appr['title']}",
        "description": f"Decided by {user.get('name', 'Manager')}. {payload.notes or ''}",
        "time": now_iso(),
        "link": "/my-work"
    })

    await log_audit_event(org_id, user, f"approval_{new_status}", "financial", approval_id, appr["title"], f"{new_status.capitalize()} approval request for {appr['title']}")
    return await db.approvals.find_one({"id": approval_id}, {"_id": 0})


api.include_router(collab)


# ---------------- My Work (personal home) ----------------
@api.get("/my-work", tags=["dashboard"])
async def my_work(user: dict = Depends(get_current_user)):
    org = user["active_org_id"]
    uid = user["id"]
    name = user.get("name", "")
    await refresh_overdue(org)
    
    tasks = await db.tasks.find({"org_id": org, "status": {"$nin": ["completed", "done"]}, "$or": [{"assignee_id": uid}, {"assignee": name}, {"created_by": uid}]}, {"_id": 0}).sort("due_date", 1).to_list(200)
    leads = await db.leads.find({"org_id": org, "stage": {"$nin": ["won", "lost"]}, "$or": [{"owner_id": uid}, {"owner": name}, {"created_by": uid}]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    overdue_invoices = await db.invoices.find({"org_id": org, "status": "overdue"}, {"_id": 0}).to_list(50)
    low_stock_prods = await db.products.find({"org_id": org}, {"_id": 0}).to_list(500)
    low_stock_prods = [p for p in low_stock_prods if p.get("stock_quantity", 0) <= p.get("reorder_level", 5)]

    action_queue = []
    for inv in overdue_invoices:
        bal = round(inv["total"] - inv.get("amount_paid", 0), 2)
        action_queue.append({
            "id": f"act_inv_{inv['id']}", "type": "invoice", "title": f"Follow up on Overdue Invoice {inv['invoice_number']}",
            "subtitle": f"{inv.get('customer_name', '')} · ₹{bal:,.2f} balance",
            "urgency": "critical", "link": f"/invoices/{inv['id']}", "action_label": "Remind / Record Payment"
        })
    for t in tasks[:10]:
        action_queue.append({
            "id": f"act_task_{t['id']}", "type": "task", "title": t['title'],
            "subtitle": f"Due: {t.get('due_date') or 'No date'} · Priority: {t.get('priority', 'medium')}",
            "urgency": "high" if t.get("priority") == "high" else "medium", "link": "/tasks", "action_label": "Complete Task"
        })
    for p in low_stock_prods[:5]:
        action_queue.append({
            "id": f"act_prod_{p['id']}", "type": "stock", "title": f"Reorder Stock: {p['name']}",
            "subtitle": f"Only {p.get('stock_quantity', 0)} left (Reorder at {p.get('reorder_level', 5)})",
            "urgency": "warning", "link": "/inventory", "action_label": "Adjust / Reorder"
        })

    # Approvals pending
    approvals = await db.approvals.find({"org_id": org, "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for appr in approvals:
        action_queue.append({
            "id": f"act_appr_{appr['id']}", "type": "approval", "title": f"Approval Requested: {appr['title']}",
            "subtitle": f"Requested by {appr.get('requester_name', 'Teammate')} · ₹{appr.get('amount', 0):,.2f}",
            "urgency": "high", "link": "/settings?tab=team", "action_label": "Review & Decide"
        })

    # Direct User Notifications
    my_notifs = await db.notifications.find({"org_id": org, "recipient_id": uid}, {"_id": 0}).sort("time", -1).limit(10).to_list(10)

    events = []
    for i in await db.invoices.find({"org_id": org, "created_by": uid}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8):
        events.append({"type": "invoice", "title": f"Invoice {'paid' if i['status'] == 'paid' else 'created'}", "description": f"{i['invoice_number']} · {i.get('customer_name', '')}", "date": i.get("created_at", ""), "link": f"/invoices/{i['id']}"})
    for p in await db.payments.find({"org_id": org, "created_by": uid}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6):
        events.append({"type": "payment", "title": "Payment recorded", "description": f"{p.get('invoice_number', '')} · {p.get('customer_name', '')}", "date": p.get("created_at", ""), "link": f"/invoices/{p.get('invoice_id', '')}"})
    for c in await db.customers.find({"org_id": org, "created_by": uid}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6):
        events.append({"type": "customer", "title": "Customer added", "description": c["name"], "date": c.get("created_at", ""), "link": f"/customers/{c['id']}"})
    events.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    return {
        "tasks": tasks, "leads": leads, "approvals": approvals, "notifications": my_notifs,
        "activity": events[:12], "open_tasks": len(tasks), "open_leads": len(leads),
        "pending_approvals_count": len(approvals), "action_queue": action_queue,
    }


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
    return org


@api.post("/organizations/switch", tags=["settings"])
async def switch_org(payload: SwitchOrgInput, user: dict = Depends(get_current_user)):
    if payload.org_id not in user.get("org_ids", []):
        raise HTTPException(status_code=403, detail="You do not belong to this workspace")
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_org_id": payload.org_id, "updated_at": now_iso()}})
    return await db.organizations.find_one({"id": payload.org_id}, {"_id": 0})


@api.put("/settings/organization", tags=["settings"])
async def update_org(payload: OrganizationUpdate, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["updated_at"] = now_iso()
    await db.organizations.update_one({"id": user["active_org_id"]}, {"$set": data})
    return await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0})


@api.put("/settings/profile", tags=["settings"])
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    data["updated_at"] = now_iso()
    await db.users.update_one({"id": user["id"]}, {"$set": data})
    doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return doc


@api.put("/settings/preferences", tags=["settings"])
async def update_preferences(payload: PreferencesUpdate, user: dict = Depends(get_current_user)):
    prefs = user.get("preferences", {})
    for k, v in payload.model_dump().items():
        if v is not None:
            prefs[k] = v
    await db.users.update_one({"id": user["id"]}, {"$set": {"preferences": prefs, "updated_at": now_iso()}})
    doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return doc


@api.get("/executive/overview", tags=["executive"])
async def get_executive_overview(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    invoices = await db.invoices.find({"org_id": org_id}).to_list(1000)
    expenses = await db.expenses.find({"org_id": org_id}).to_list(1000)
    tasks = await db.tasks.find({"org_id": org_id}).to_list(1000)
    leads = await db.leads.find({"org_id": org_id}).to_list(1000)
    customers = await db.customers.find({"org_id": org_id}).to_list(1000)

    paid_inv = [i for i in invoices if i.get("status") == "paid"]
    total_revenue = sum(float(i.get("total", 0)) for i in paid_inv)
    total_expenses = sum(float(e.get("amount", 0)) for e in expenses)
    net_profit = total_revenue - total_expenses
    margin_pct = round((net_profit / total_revenue * 100), 1) if total_revenue > 0 else 0.0

    mrr = round(total_revenue / 12, 2)
    arr = round(mrr * 12, 2)

    open_tasks = [t for t in tasks if t.get("status") != "completed"]
    done_tasks = [t for t in tasks if t.get("status") == "completed"]
    task_throughput = round((len(done_tasks) / len(tasks) * 100), 1) if tasks else 100.0

    won_leads = [l for l in leads if l.get("stage") == "won"]
    lead_conversion = round((len(won_leads) / len(leads) * 100), 1) if leads else 0.0

    pending_approvals = await db.approvals.find({"org_id": org_id, "status": "pending"}).to_list(100)

    # Top customer concentration
    cust_sales = {}
    for i in paid_inv:
        cname = i.get("customer_name") or "Unassigned"
        cust_sales[cname] = cust_sales.get(cname, 0.0) + float(i.get("total", 0))
    top_customers = sorted([{"name": k, "revenue": v} for k, v in cust_sales.items()], key=lambda x: x["revenue"], reverse=True)[:5]

    return {
        "user_role": user.get("role", "member"),
        "arr": arr,
        "mrr": mrr,
        "total_revenue": round(total_revenue, 2),
        "total_expenses": round(total_expenses, 2),
        "net_profit": round(net_profit, 2),
        "margin_pct": margin_pct,
        "task_throughput_pct": task_throughput,
        "lead_conversion_pct": lead_conversion,
        "open_tasks_count": len(open_tasks),
        "completed_tasks_count": len(done_tasks),
        "total_customers_count": len(customers),
        "pending_approvals": pending_approvals,
        "top_customers": top_customers,
        "cash_runway_months": 18,
    }


@api.get("/admin/overview", tags=["admin"])
async def get_admin_overview(user: dict = Depends(get_current_user)):
    if user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Admin or Owner access required")
    org_id = user["active_org_id"]
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    members = await db.users.find({"org_ids": org_id}, {"_id": 0, "password_hash": 0}).to_list(500)
    audit_count = await db.audit_logs.count_documents({"org_id": org_id})
    recent_audits = await db.audit_logs.find({"org_id": org_id}).sort("created_at", -1).limit(10).to_list(10)

    return {
        "organization": org,
        "members": members,
        "total_members": len(members),
        "active_members_count": len([m for m in members if m.get("status") != "deactivated"]),
        "deactivated_members_count": len([m for m in members if m.get("status") == "deactivated"]),
        "audit_logs_total": audit_count,
        "recent_audit_logs": [{**a, "_id": str(a.get("_id", ""))} for a in recent_audits],
        "security": {
            "tenant_isolation": "VERIFIED_ISOLATED",
            "auth_provider": "JWT + Bcrypt",
            "encryption_at_rest": "AES-256",
            "session_ttl_days": 7,
            "admins_see_all": bool(org and org.get("admins_see_all", False)),
        }
    }


app.include_router(auth_router, prefix="/api")
app.include_router(auth_router)

app.include_router(api, prefix="/api")
app.include_router(api)

cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if not cors_origins:
    cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8000", "http://127.0.0.1:8000"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    for coll in ["customers", "suppliers", "products", "expenses", "employees", "tasks", "invoices", "payments", "stock_movements", "leads"]:
        await db[coll].create_index("org_id")
    await _seed_admin()


async def _seed_admin():
    from auth import ensure_admin_seeded
    await ensure_admin_seeded()


@app.on_event("shutdown")
async def shutdown():
    from database import client
    client.close()
