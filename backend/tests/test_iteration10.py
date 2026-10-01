"""Iteration 10 tests: one-step business actions (sale, get paid, buy stock), the Today queue,
reminders, snoozing and customer notes.

Runs as a throwaway admin invited by the owner (other suites switch the owner's active workspace
mid-run); everything created is removed through the API afterwards.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"
OWNER_EMAIL = os.environ["ADMIN_EMAIL"]
OWNER_PASSWORD = os.environ["ADMIN_PASSWORD"]
TAG = uuid.uuid4().hex[:6]
TODAY = date.today()


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


class Client:
    def __init__(self, token):
        self.h = {"Authorization": f"Bearer {token}"}

    def __getattr__(self, method):
        return lambda path, **kw: getattr(requests, method)(f"{API}{path}", headers=self.h, timeout=30, **kw)


@pytest.fixture(scope="module")
def admin():
    owner = Client(_login(OWNER_EMAIL, OWNER_PASSWORD))
    email = f"t10admin{TAG}@example.com"
    invite = owner.post("/team/invite", json={"name": f"T10 Admin {TAG}", "email": email, "role": "admin"})
    assert invite.status_code == 200, invite.text
    client = Client(_login(email, invite.json()["temp_password"]))
    client.me = client.get("/auth/me").json()
    created = {"customers": [], "products": [], "suppliers": [], "tasks": []}
    client.created = created
    yield client
    for inv in client.get("/invoices", params={"search": TAG}).json():
        full = client.get(f"/invoices/{inv['id']}").json()
        for p in full.get("payments", []):
            client.delete(f"/payments/{p['id']}")
        client.delete(f"/invoices/{inv['id']}")
    for e in client.get("/expenses", params={"search": TAG}).json():
        client.delete(f"/expenses/{e['id']}")
    for t in client.get("/tasks", params={"search": TAG}).json():
        client.delete(f"/tasks/{t['id']}")
    for c in client.get("/customers", params={"search": TAG}).json():
        client.delete(f"/customers/{c['id']}")
    for pid in created["products"]:
        client.delete(f"/products/{pid}")
    for sid in created["suppliers"]:
        client.delete(f"/suppliers/{sid}")
    owner.delete(f"/team/{client.me['id']}")


@pytest.fixture(scope="module")
def stock(admin):
    sup = admin.post("/suppliers", json={"name": f"T10 Supply {TAG}"}).json()
    prod = admin.post("/products", json={"name": f"T10 Mug {TAG}", "price": 12, "cost": 5, "stock_quantity": 10,
                                         "reorder_level": 3, "supplier_id": sup["id"]}).json()
    admin.created["suppliers"].append(sup["id"])
    admin.created["products"].append(prod["id"])
    return {"sup": sup, "prod": prod}


def _stock_of(admin, prod):
    return admin.get(f"/products/{prod['id']}").json()["stock_quantity"]


def test_sale_to_new_customer_paid_now(admin, stock):
    r = admin.post("/actions/sale", json={
        "new_customer": {"name": f"Walk-in {TAG}"}, "payment": "paid", "method": "cash", "tax_rate": 0,
        "items": [{"product_id": stock["prod"]["id"], "description": stock["prod"]["name"], "quantity": 2, "unit_price": 12}]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["customer_created"] is True
    assert d["invoice"]["status"] == "paid" and d["invoice"]["total"] == 24 and d["invoice"]["balance"] == 0
    assert _stock_of(admin, stock["prod"]) == 8
    pay = admin.get(f"/invoices/{d['invoice']['id']}").json()["payments"]
    assert len(pay) == 1 and pay[0]["method"] == "cash"


def test_sale_reuses_existing_customer_by_name(admin, stock):
    item = {"description": f"Gift wrap {TAG}", "quantity": 1, "unit_price": 3}
    r = admin.post("/actions/sale", json={"new_customer": {"name": f"walk-IN {TAG}"}, "payment": "unpaid", "items": [item]})
    assert r.status_code == 200, r.text
    assert r.json()["customer_created"] is False
    assert r.json()["invoice"]["status"] == "sent"
    customers = admin.get("/customers", params={"search": f"Walk-in {TAG}"}).json()
    assert len(customers) == 1


def test_sale_part_paid_and_validation(admin, stock):
    item = {"product_id": stock["prod"]["id"], "description": "Mug", "quantity": 1, "unit_price": 100}
    cust = admin.post("/customers", json={"name": f"T10 Part {TAG}"}).json()
    bad = admin.post("/actions/sale", json={"customer_id": cust["id"], "payment": "partial", "amount_paid": 500, "tax_rate": 0, "items": [item]})
    assert bad.status_code == 400
    assert admin.post("/actions/sale", json={"payment": "paid", "items": [item]}).status_code == 422  # no customer
    r = admin.post("/actions/sale", json={"customer_id": cust["id"], "payment": "partial", "amount_paid": 40, "tax_rate": 0, "items": [item]})
    assert r.status_code == 200 and r.json()["invoice"]["status"] == "partially_paid" and r.json()["invoice"]["balance"] == 60


def test_draft_sale_does_not_touch_stock(admin, stock):
    before = _stock_of(admin, stock["prod"])
    r = admin.post("/actions/sale", json={"new_customer": {"name": f"T10 Draft {TAG}"}, "payment": "draft",
                                          "items": [{"product_id": stock["prod"]["id"], "description": "Mug", "quantity": 3, "unit_price": 12}]})
    assert r.status_code == 200 and r.json()["invoice"]["status"] == "draft"
    assert _stock_of(admin, stock["prod"]) == before


def test_get_paid_spreads_over_oldest_invoices(admin):
    cust = admin.post("/customers", json={"name": f"T10 Lump {TAG}"}).json()
    ids = []
    for days_ago, amount in ((20, 100), (10, 50), (2, 30)):
        issue = (TODAY - timedelta(days=days_ago)).isoformat()
        r = admin.post("/actions/sale", json={"customer_id": cust["id"], "payment": "unpaid", "tax_rate": 0, "issue_date": issue, "due_date": issue,
                                              "items": [{"description": f"Service {TAG}", "quantity": 1, "unit_price": amount}]})
        ids.append(r.json()["invoice"]["id"])
    assert admin.post(f"/customers/{cust['id']}/payments", json={"amount": 500}).status_code == 400  # more than owed
    r = admin.post(f"/customers/{cust['id']}/payments", json={"amount": 120, "method": "bank_transfer"})
    assert r.status_code == 200, r.text
    alloc = {a["invoice_id"]: a for a in r.json()["allocations"]}
    assert alloc[ids[0]]["applied"] == 100 and alloc[ids[0]]["status"] == "paid"
    assert alloc[ids[1]]["applied"] == 20 and alloc[ids[1]]["status"] == "partially_paid"
    assert ids[2] not in alloc
    assert r.json()["outstanding"] == 60


def test_buy_stock_adds_stock_and_records_expense(admin, stock):
    before = _stock_of(admin, stock["prod"])
    r = admin.post("/actions/purchase", json={"items": [{"product_id": stock["prod"]["id"], "quantity": 20, "unit_cost": 6}], "paid": False})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total"] == 120 and d["supplier_name"] == stock["sup"]["name"]
    assert d["expense"]["status"] == "pending" and d["expense"]["category"] == "Stock purchases" and d["expense"]["vendor"] == stock["sup"]["name"]
    assert _stock_of(admin, stock["prod"]) == before + 20
    assert admin.get(f"/products/{stock['prod']['id']}").json()["cost"] == 6  # last cost remembered
    admin.delete(f"/expenses/{d['expense']['id']}")
    bad = admin.post("/actions/purchase", json={"items": [{"product_id": "nope", "quantity": 1, "unit_cost": 1}]})
    assert bad.status_code == 400


def test_today_lists_overdue_and_can_be_resolved(admin):
    cust = admin.post("/customers", json={"name": f"T10 Late {TAG}", "email": f"late{TAG}@example.com"}).json()
    issue = (TODAY - timedelta(days=40)).isoformat()
    due = (TODAY - timedelta(days=10)).isoformat()
    inv = admin.post("/actions/sale", json={"customer_id": cust["id"], "payment": "unpaid", "tax_rate": 0, "issue_date": issue, "due_date": due,
                                            "items": [{"description": f"Consulting {TAG}", "quantity": 1, "unit_price": 250}]}).json()["invoice"]
    key = f"overdue_invoice:{inv['id']}"
    today = admin.get("/today").json()
    item = next((i for i in today["items"] if i["key"] == key), None)
    assert item and item["severity"] == "high" and item["context"]["days_late"] == 10 and item["amount"] == 250

    msg = admin.get(f"/invoices/{inv['id']}/reminder").json()
    assert msg["to"] == f"late{TAG}@example.com" and "10 days ago" in msg["body"] and inv["invoice_number"] in msg["subject"]
    assert admin.post(f"/invoices/{inv['id']}/remind").json()["reminder_count"] == 1
    assert not any(i["key"] == key for i in admin.get("/today").json()["items"])  # chased: off the list for 3 days
    history = admin.get(f"/customers/{cust['id']}/history").json()
    assert len(history["reminders"]) == 1

    admin.delete(f"/today/snooze/{key}")
    assert any(i["key"] == key for i in admin.get("/today").json()["items"])  # undo brings it back
    assert admin.post("/today/snooze", json={"key": key, "days": 1}).status_code == 200
    assert not any(i["key"] == key for i in admin.get("/today").json()["items"])


def test_today_lists_my_due_tasks_and_low_stock(admin, stock):
    task = admin.post("/tasks", json={"title": f"T10 call back {TAG}", "assignee_id": admin.me["id"], "due_date": (TODAY - timedelta(days=1)).isoformat()}).json()
    low = admin.post("/products", json={"name": f"T10 Rare {TAG}", "stock_quantity": 0, "reorder_level": 2, "cost": 4}).json()
    admin.created["products"].append(low["id"])
    items = {i["key"]: i for i in admin.get("/today").json()["items"]}
    assert items[f"task:{task['id']}"]["severity"] == "high"
    low_item = items[f"low_stock:{low['id']}"]
    assert low_item["severity"] == "high" and low_item["context"]["suggested_qty"] == 4


def test_customer_notes(admin):
    cust = admin.post("/customers", json={"name": f"T10 Notes {TAG}"}).json()
    note = admin.post(f"/customers/{cust['id']}/notes", json={"text": "Called, will pay Friday"}).json()
    assert admin.post(f"/customers/{cust['id']}/notes", json={"text": "  "}).status_code == 422
    assert admin.get(f"/customers/{cust['id']}/history").json()["notes"][0]["text"] == "Called, will pay Friday"
    assert admin.delete(f"/customers/{cust['id']}/notes/{note['id']}").status_code == 200
