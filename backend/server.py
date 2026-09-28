import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Body
from starlette.middleware.cors import CORSMiddleware

from database import db, now_iso
from models import (
    CustomerCreate, SupplierCreate, ProductCreate, ExpenseCreate, EmployeeCreate,
    TaskCreate, InvoiceCreate, StockMovementCreate, PaymentInput, PaymentCreate, LeadCreate,
    OrganizationUpdate, ProfileUpdate, PreferencesUpdate, SwitchOrgInput,
)
from crud import make_crud
from auth import router as auth_router, get_current_user, hash_password, verify_password
from seed import create_user_workspaces

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bmp")

app = FastAPI(title="SME Business Management Platform")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "SME Business Management Platform API", "status": "ok"}


# ---------------- Generic CRUD modules ----------------
api.include_router(make_crud("suppliers", SupplierCreate, ["name", "contact_name", "email", "category"], ["status"]), prefix="/suppliers", tags=["suppliers"])
api.include_router(make_crud("products", ProductCreate, ["name", "sku", "category", "supplier_name"], ["status", "category"]), prefix="/products", tags=["products"])
api.include_router(make_crud("expenses", ExpenseCreate, ["category", "vendor", "description"], ["status", "category", "payment_method"]), prefix="/expenses", tags=["expenses"])
api.include_router(make_crud("employees", EmployeeCreate, ["name", "email", "job_title", "department"], ["status", "department"]), prefix="/employees", tags=["employees"])
api.include_router(make_crud("tasks", TaskCreate, ["title", "assignee", "description", "customer_name"], ["status", "priority"]), prefix="/tasks", tags=["tasks"])
api.include_router(make_crud("leads", LeadCreate, ["name", "company", "email", "owner"], ["stage", "owner"]), prefix="/leads", tags=["leads"])


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


@inv.get("")
async def list_invoices(request: Request, user: dict = Depends(get_current_user)):
    q = {"org_id": user["active_org_id"]}
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
    org = await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0})
    if not data.get("customer_name") and data.get("customer_id"):
        c = await db.customers.find_one({"id": data["customer_id"], "org_id": user["active_org_id"]}, {"_id": 0})
        data["customer_name"] = c["name"] if c else ""
    count = await db.invoices.count_documents({"org_id": user["active_org_id"]})
    items, subtotal, tax_amount, total = _compute_invoice(data)
    amount_paid = total if data["status"] == "paid" else 0.0
    status = _invoice_status(total, amount_paid, data["status"])
    doc = {
        "id": str(uuid.uuid4()), "org_id": user["active_org_id"],
        "invoice_number": f"{org.get('invoice_prefix', 'INV')}-{1001 + count}",
        "customer_id": data["customer_id"], "customer_name": data["customer_name"],
        "issue_date": data["issue_date"], "due_date": data["due_date"], "status": status,
        "items": items, "subtotal": subtotal, "tax_rate": data["tax_rate"], "tax_amount": tax_amount,
        "total": total, "amount_paid": amount_paid, "notes": data.get("notes", ""),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.invoices.insert_one(doc)
    # Deduct inventory for stocked line items unless the invoice is a draft/cancelled
    if status not in ("draft", "cancelled"):
        await _deduct_inventory(user["active_org_id"], items, doc["invoice_number"])
    if status == "paid":
        await _record_payment(user["active_org_id"], doc, total, "bank_transfer", data["issue_date"], "Auto-recorded on paid invoice")
    doc.pop("_id", None)
    return doc


@inv.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payments = await db.payments.find({"invoice_id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    invoice["payments"] = payments
    invoice["balance"] = round(invoice["total"] - invoice.get("amount_paid", 0), 2)
    return invoice


@inv.post("/{invoice_id}/status")
async def set_invoice_status(invoice_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0})
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
    # Deduct inventory the first time a draft is sent
    if invoice["status"] == "draft" and new_status in ("sent", "paid"):
        await _deduct_inventory(user["active_org_id"], invoice.get("items", []), invoice["invoice_number"])
    await db.invoices.update_one({"id": invoice_id}, {"$set": updates})
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@inv.put("/{invoice_id}")
async def update_invoice(invoice_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    existing = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if "items" in payload or "tax_rate" in payload:
        merged = {**existing, **payload}
        items, subtotal, tax_amount, total = _compute_invoice(merged)
        payload.update({"items": items, "subtotal": subtotal, "tax_amount": tax_amount, "total": total})
    for k in ("id", "org_id", "_id", "created_at"):
        payload.pop(k, None)
    payload["updated_at"] = now_iso()
    await db.invoices.update_one({"id": invoice_id}, {"$set": payload})
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@inv.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    res = await db.invoices.delete_one({"id": invoice_id, "org_id": user["active_org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.payments.delete_many({"invoice_id": invoice_id, "org_id": user["active_org_id"]})
    return {"success": True}


async def _record_payment(org_id, invoice, amount, method, date, notes=""):
    await db.payments.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "invoice_id": invoice["id"],
        "invoice_number": invoice["invoice_number"], "customer_id": invoice.get("customer_id", ""),
        "customer_name": invoice.get("customer_name", ""), "amount": float(amount),
        "method": method, "date": date or now_iso()[:10], "notes": notes, "created_at": now_iso(),
    })


async def _apply_payment(org_id, invoice, amount, method, date, notes=""):
    new_paid = round(invoice.get("amount_paid", 0) + float(amount), 2)
    if new_paid >= invoice["total"] and invoice["total"] > 0:
        status = "paid"
    elif new_paid > 0:
        status = "partially_paid"
    else:
        status = invoice["status"]
    await db.invoices.update_one({"id": invoice["id"]}, {"$set": {"amount_paid": new_paid, "status": status, "updated_at": now_iso()}})
    await _record_payment(org_id, invoice, amount, method, date, notes)
    return await db.invoices.find_one({"id": invoice["id"]}, {"_id": 0})


@inv.post("/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, payload: PaymentInput, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return await _apply_payment(user["active_org_id"], invoice, payload.amount, payload.method, payload.date)


api.include_router(inv)


# ---------------- Customers (custom: computed balances + history) ----------------
cust = APIRouter(prefix="/customers", tags=["customers"])


async def _customer_totals(org_id):
    invoices = await db.invoices.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    totals = {}
    for i in invoices:
        cid = i.get("customer_id")
        if not cid:
            continue
        t = totals.setdefault(cid, {"total_sales": 0.0, "outstanding": 0.0, "invoice_count": 0})
        t["invoice_count"] += 1
        if i["status"] == "paid":
            t["total_sales"] += i["total"]
        if i["status"] in ("pending", "sent", "overdue", "partially_paid"):
            t["outstanding"] += i["total"] - i.get("amount_paid", 0)
    return totals


@cust.get("")
async def list_customers(request: Request, user: dict = Depends(get_current_user)):
    q = {"org_id": user["active_org_id"]}
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
        t = totals.get(c["id"], {"total_sales": 0.0, "outstanding": 0.0, "invoice_count": 0})
        c["total_sales"] = round(t["total_sales"], 2)
        c["outstanding"] = round(t["outstanding"], 2)
        c["invoice_count"] = t["invoice_count"]
    return customers


@cust.post("")
async def create_customer(payload: CustomerCreate, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc.update({"id": str(uuid.uuid4()), "org_id": user["active_org_id"], "created_at": now_iso(), "updated_at": now_iso()})
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@cust.get("/{customer_id}/history")
async def customer_history(customer_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    customer = await db.customers.find_one({"id": customer_id, "org_id": org_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    invoices = await db.invoices.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    payments = await db.payments.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    tasks = await db.tasks.find({"org_id": org_id, "customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    total_sales = round(sum(i["total"] for i in invoices if i["status"] == "paid"), 2)
    outstanding = round(sum(i["total"] - i.get("amount_paid", 0) for i in invoices if i["status"] in ("pending", "sent", "overdue", "partially_paid")), 2)
    total_paid = round(sum(p["amount"] for p in payments), 2)
    return {
        "customer": customer, "invoices": invoices, "payments": payments, "tasks": tasks,
        "total_sales": total_sales, "outstanding": outstanding, "total_paid": total_paid,
        "invoice_count": len(invoices),
    }


@cust.get("/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    doc = await db.customers.find_one({"id": customer_id, "org_id": user["active_org_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@cust.put("/{customer_id}")
async def update_customer(customer_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    for k in ("id", "org_id", "_id", "created_at", "total_sales", "outstanding", "invoice_count"):
        payload.pop(k, None)
    payload["updated_at"] = now_iso()
    res = await db.customers.update_one({"id": customer_id, "org_id": user["active_org_id"]}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await db.customers.find_one({"id": customer_id, "org_id": user["active_org_id"]}, {"_id": 0})


@cust.delete("/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    res = await db.customers.delete_one({"id": customer_id, "org_id": user["active_org_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
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
    customer.pop("_id", None)
    return customer


# ---------------- Payments ----------------
@api.get("/payments", tags=["payments"])
async def list_payments(user: dict = Depends(get_current_user)):
    return await db.payments.find({"org_id": user["active_org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api.post("/payments", tags=["payments"])
async def record_payment(payload: PaymentCreate, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": payload.invoice_id, "org_id": user["active_org_id"]}, {"_id": 0})
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
        "reason": payload.reason or "", "date": payload.date or now_iso()[:10], "created_at": now_iso(),
    }
    await db.stock_movements.insert_one(doc)
    doc.pop("_id", None)
    return {"movement": doc, "new_stock": new_stock}


# ---------------- Dashboard ----------------
@api.get("/dashboard/stats", tags=["dashboard"])
async def dashboard_stats(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    invoices = await db.invoices.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    expenses = await db.expenses.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    payments = await db.payments.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    products = await db.products.find({"org_id": org_id}, {"_id": 0}).to_list(5000)
    tasks = await db.tasks.find({"org_id": org_id}, {"_id": 0}).to_list(5000)

    total_sales = round(sum(i["total"] for i in invoices if i["status"] == "paid"), 2)
    outstanding = round(sum(i["total"] - i.get("amount_paid", 0) for i in invoices if i["status"] in ("pending", "sent", "overdue", "partially_paid")), 2)
    total_expenses = round(sum(e["amount"] for e in expenses), 2)
    profit = round(total_sales - total_expenses, 2)
    amount_collected = round(sum(p["amount"] for p in payments), 2)
    customer_count = await db.customers.count_documents({"org_id": org_id})
    product_count = len(products)
    supplier_count = await db.suppliers.count_documents({"org_id": org_id})
    employee_count = await db.employees.count_documents({"org_id": org_id})
    outstanding_count = sum(1 for i in invoices if i["status"] in ("pending", "sent", "overdue", "partially_paid"))
    overdue_invoices = [i for i in invoices if i["status"] == "overdue"]
    overdue_count = len(overdue_invoices)
    overdue_amount = round(sum(i["total"] - i.get("amount_paid", 0) for i in overdue_invoices), 2)
    low_stock = [p for p in products if p["stock_quantity"] <= p["reorder_level"]]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    new_customers = await db.customers.count_documents({"org_id": org_id, "created_at": {"$gte": cutoff}})
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
    }


@api.get("/notifications", tags=["dashboard"])
async def notifications(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
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


app.include_router(auth_router)
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
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
