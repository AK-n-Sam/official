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
    TaskCreate, InvoiceCreate, StockMovementCreate, PaymentInput,
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
api.include_router(make_crud("customers", CustomerCreate, ["name", "email", "company", "city"], ["status"]), prefix="/customers", tags=["customers"])
api.include_router(make_crud("suppliers", SupplierCreate, ["name", "contact_name", "email", "category"], ["status"]), prefix="/suppliers", tags=["suppliers"])
api.include_router(make_crud("products", ProductCreate, ["name", "sku", "category"], ["status", "category"]), prefix="/products", tags=["products"])
api.include_router(make_crud("expenses", ExpenseCreate, ["category", "vendor", "description"], ["status", "category"]), prefix="/expenses", tags=["expenses"])
api.include_router(make_crud("employees", EmployeeCreate, ["name", "email", "job_title", "department"], ["status", "department"]), prefix="/employees", tags=["employees"])
api.include_router(make_crud("tasks", TaskCreate, ["title", "assignee", "description"], ["status", "priority"]), prefix="/tasks", tags=["tasks"])


# ---------------- Invoices (custom) ----------------
inv = APIRouter(prefix="/invoices", tags=["invoices"])


def _compute_invoice(payload: dict):
    subtotal = 0.0
    items = []
    for it in payload.get("items", []):
        qty = float(it.get("quantity", 1))
        price = float(it.get("unit_price", 0))
        total = round(qty * price, 2)
        subtotal += total
        items.append({**it, "quantity": qty, "unit_price": price, "total": total})
    tax_rate = float(payload.get("tax_rate", 0) or 0)
    tax_amount = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax_amount, 2)
    return items, round(subtotal, 2), tax_amount, total


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
    doc = {
        "id": str(uuid.uuid4()), "org_id": user["active_org_id"],
        "invoice_number": f"{org.get('invoice_prefix', 'INV')}-{1001 + count}",
        "customer_id": data["customer_id"], "customer_name": data["customer_name"],
        "issue_date": data["issue_date"], "due_date": data["due_date"], "status": data["status"],
        "items": items, "subtotal": subtotal, "tax_rate": data["tax_rate"], "tax_amount": tax_amount,
        "total": total, "amount_paid": total if data["status"] == "paid" else 0.0,
        "notes": data.get("notes", ""), "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.invoices.insert_one(doc)
    if doc["status"] == "paid":
        await _record_payment(user["active_org_id"], doc, total, "bank_transfer", data["issue_date"])
    doc.pop("_id", None)
    return doc


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


async def _record_payment(org_id, invoice, amount, method, date):
    await db.payments.insert_one({
        "id": str(uuid.uuid4()), "org_id": org_id, "invoice_id": invoice["id"],
        "invoice_number": invoice["invoice_number"], "customer_id": invoice.get("customer_id", ""),
        "customer_name": invoice.get("customer_name", ""), "amount": float(amount),
        "method": method, "date": date or now_iso()[:10], "created_at": now_iso(),
    })


@inv.post("/{invoice_id}/pay")
async def pay_invoice(invoice_id: str, payload: PaymentInput, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id, "org_id": user["active_org_id"]}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    new_paid = round(invoice.get("amount_paid", 0) + payload.amount, 2)
    status = "paid" if new_paid >= invoice["total"] else invoice["status"]
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"amount_paid": new_paid, "status": status, "updated_at": now_iso()}})
    await _record_payment(user["active_org_id"], invoice, payload.amount, payload.method, payload.date)
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


api.include_router(inv)


# ---------------- Payments (read) ----------------
@api.get("/payments", tags=["payments"])
async def list_payments(user: dict = Depends(get_current_user)):
    return await db.payments.find({"org_id": user["active_org_id"]}, {"_id": 0}).sort("created_at", -1).to_list(2000)


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
    outstanding = round(sum(i["total"] - i.get("amount_paid", 0) for i in invoices if i["status"] in ("pending", "overdue")), 2)
    total_expenses = round(sum(e["amount"] for e in expenses), 2)
    profit = round(total_sales - total_expenses, 2)
    customer_count = await db.customers.count_documents({"org_id": org_id})
    product_count = len(products)
    supplier_count = await db.suppliers.count_documents({"org_id": org_id})
    employee_count = await db.employees.count_documents({"org_id": org_id})
    outstanding_count = sum(1 for i in invoices if i["status"] in ("pending", "overdue"))
    low_stock = [p for p in products if p["stock_quantity"] <= p["reorder_level"]]

    recent_invoices = sorted(invoices, key=lambda x: x.get("created_at", ""), reverse=True)[:5]
    txns = [{"type": "income", "label": f"Payment · {p.get('customer_name', '')}", "amount": p["amount"], "date": p["date"], "ref": p.get("invoice_number", "")} for p in payments]
    txns += [{"type": "expense", "label": f"Expense · {e['category']}", "amount": e["amount"], "date": e["date"], "ref": e.get("vendor", "")} for e in expenses]
    recent_transactions = sorted(txns, key=lambda x: x.get("date", ""), reverse=True)[:8]

    def _attention(t):
        return t["status"] != "done" and (t["priority"] == "high" or t.get("due_date", "") <= now_iso()[:10])
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

    return {
        "total_sales": total_sales, "outstanding": outstanding, "outstanding_count": outstanding_count,
        "total_expenses": total_expenses, "profit": profit, "customer_count": customer_count,
        "product_count": product_count, "supplier_count": supplier_count, "employee_count": employee_count,
        "invoice_count": len(invoices), "low_stock_count": len(low_stock),
        "recent_invoices": recent_invoices, "recent_transactions": recent_transactions,
        "tasks_attention": tasks_attention, "sales_trend": sales_trend, "expense_breakdown": expense_breakdown,
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
    for coll in ["customers", "suppliers", "products", "expenses", "employees", "tasks", "invoices", "payments", "stock_movements"]:
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
