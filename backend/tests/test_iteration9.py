"""Iteration 9 tests: business-rule integrity, per-workspace roles, scoping and the new report/dashboard data.

Runs against a live backend (REACT_APP_BACKEND_URL). The owner invites a throwaway admin and the checks run
as that admin: other suites switch the owner's active workspace while they run, and an invited admin's
workspace never moves. Records are removed afterwards through the API.
"""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

OWNER_EMAIL = os.environ.get("ADMIN_EMAIL", "aniruddh.samarth@gmail.com")
OWNER_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
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
def owner():
    return Client(_login(OWNER_EMAIL, OWNER_PASSWORD))


@pytest.fixture(scope="module")
def admin(owner):
    email = f"t9admin{TAG}@example.com"
    invite = owner.post("/team/invite", json={"name": f"T9 Admin {TAG}", "email": email, "role": "admin"})
    assert invite.status_code == 200, invite.text
    client = Client(_login(email, invite.json()["temp_password"]))
    me = client.get("/auth/me").json()
    assert me["role"] == "admin"
    yield client
    owner.delete(f"/team/{me['id']}")


@pytest.fixture(scope="module")
def data(admin):
    owner = admin
    """A customer, supplier and stocked product; removed at teardown."""
    cust = owner.post("/customers", json={"name": f"T9 Cust {TAG}", "email": f"t9{TAG}@example.com"}).json()
    sup = owner.post("/suppliers", json={"name": f"T9 Supplier {TAG}"}).json()
    prod = owner.post("/products", json={"name": f"T9 Widget {TAG}", "sku": f"T9-{TAG}", "price": 10, "cost": 4,
                                         "stock_quantity": 5, "reorder_level": 2, "supplier_id": sup["id"]}).json()
    d = {"cust": cust, "sup": sup, "prod": prod, "invoices": []}
    yield d
    for inv_id in d["invoices"]:
        inv = owner.get(f"/invoices/{inv_id}").json()
        for p in inv.get("payments", []):
            owner.delete(f"/payments/{p['id']}")
        owner.delete(f"/invoices/{inv_id}")
    for t in owner.get("/tasks", params={"search": TAG}).json():
        owner.delete(f"/tasks/{t['id']}")
    owner.delete(f"/products/{prod['id']}")
    owner.delete(f"/suppliers/{sup['id']}")
    owner.delete(f"/customers/{cust['id']}")


def _stock(owner, prod):
    return owner.get(f"/products/{prod['id']}").json()["stock_quantity"]


def _invoice(owner, data, qty=3, status="sent"):
    item = {"product_id": data["prod"]["id"], "description": data["prod"]["name"], "quantity": qty, "unit_price": 10}
    r = owner.post("/invoices", json={"customer_id": data["cust"]["id"], "issue_date": TODAY.isoformat(),
                                      "due_date": (TODAY + timedelta(days=14)).isoformat(), "status": status, "items": [item]})
    assert r.status_code == 200, r.text
    data["invoices"].append(r.json()["id"])
    return r.json()


def test_me_has_workspace_role_and_currency(owner):
    me = owner.get("/auth/me").json()
    assert me["role"] == "owner"
    assert me["org_currency"] in ("USD", "EUR", "GBP", "INR")
    assert "password_hash" not in me and "org_roles" not in me


def test_search_input_is_not_a_regex(admin):
    assert admin.get("/search", params={"q": "(a+)+$"}).status_code == 200
    assert admin.get("/customers", params={"search": ".*"}).json() == []


def test_validation_and_duplicates(admin, data):
    assert admin.post("/customers", json={"name": " "}).status_code == 422
    assert admin.post("/customers", json={"name": "x", "email": "nope"}).status_code == 422
    assert admin.post("/customers", json={"name": "Dup", "email": data["cust"]["email"].upper()}).status_code == 409
    assert admin.post("/products", json={"name": "Dup", "sku": data["prod"]["sku"].lower()}).status_code == 409
    assert admin.post("/expenses", json={"category": "x", "amount": 0, "date": TODAY.isoformat()}).status_code == 422
    bad_dates = {"customer_id": data["cust"]["id"], "issue_date": TODAY.isoformat(), "due_date": (TODAY - timedelta(days=1)).isoformat(),
                 "items": [{"description": "a", "quantity": 1, "unit_price": 5}]}
    assert admin.post("/invoices", json=bad_dates).status_code == 422
    assert data["prod"]["supplier_name"] == data["sup"]["name"]


def test_stock_out_cannot_exceed_stock(admin):
    # Its own product: other suites running in parallel adjust stock on the newest product in the list.
    prod = admin.post("/products", json={"name": f"T9 Bolt {TAG}", "stock_quantity": 2}).json()
    try:
        r = admin.post("/stock-movements", json={"product_id": prod["id"], "type": "out", "quantity": _stock(admin, prod) + 1_000_000})
        assert r.status_code == 400, r.text
    finally:
        admin.delete(f"/products/{prod['id']}")


def test_invoice_payment_and_stock_lifecycle(admin, data):
    start = _stock(admin, data["prod"])
    inv = _invoice(admin, data, qty=3)
    assert _stock(admin, data["prod"]) == start - 3
    assert admin.post("/payments", json={"invoice_id": inv["id"], "amount": inv["total"] + 1}).status_code == 400
    r = admin.post("/payments", json={"invoice_id": inv["id"], "amount": 10})
    assert r.json()["invoice"]["status"] == "partially_paid"
    assert admin.post(f"/invoices/{inv['id']}/status", json={"status": "cancelled"}).status_code == 400
    assert admin.delete(f"/invoices/{inv['id']}").status_code == 409
    pay = admin.get(f"/invoices/{inv['id']}").json()["payments"][0]
    assert admin.delete(f"/payments/{pay['id']}").json()["invoice"]["status"] == "sent"
    assert admin.post(f"/invoices/{inv['id']}/status", json={"status": "cancelled"}).status_code == 200
    assert _stock(admin, data["prod"]) == start
    assert admin.post(f"/invoices/{inv['id']}/status", json={"status": "paid"}).status_code == 400


def test_oversold_invoice_returns_only_what_it_took(admin, data):
    start = _stock(admin, data["prod"])
    inv = _invoice(admin, data, qty=start + 4)
    assert inv["stock_warnings"]
    assert _stock(admin, data["prod"]) == 0
    assert admin.delete(f"/invoices/{inv['id']}").status_code == 200
    data["invoices"].remove(inv["id"])
    assert _stock(admin, data["prod"]) == start


def test_referential_integrity_on_delete(admin, data):
    _invoice(admin, data, qty=1, status="draft")
    assert admin.delete(f"/customers/{data['cust']['id']}").status_code == 409
    assert admin.delete(f"/products/{data['prod']['id']}").status_code == 409
    assert admin.delete(f"/suppliers/{data['sup']['id']}").status_code == 409


def test_dashboard_and_reports(admin):
    d = admin.get("/dashboard/stats").json()
    assert {"period", "actions", "receivables_aging", "top_debtors"} <= set(d)
    assert len({m["month"] for m in d["sales_trend"]}) == 6
    r = admin.get("/reports/summary", params={"from": (TODAY - timedelta(days=365)).isoformat(), "to": TODAY.isoformat()})
    assert r.status_code == 200 and "net_profit" in r.json()
    assert admin.get("/reports/summary", params={"from": TODAY.isoformat(), "to": (TODAY - timedelta(days=1)).isoformat()}).status_code == 400


def test_member_permissions_and_assigned_tasks(admin, owner, data):
    email = f"t9member{TAG}@example.com"
    invite = admin.post("/team/invite", json={"name": f"T9 Member {TAG}", "email": email, "role": "member"}).json()
    member = Client(_login(email, invite["temp_password"]))
    me = member.get("/auth/me").json()
    try:
        assert me["role"] == "member" and me["must_change_password"] is True
        assert member.put("/settings/organization", json={"name": "Hijacked"}).status_code == 403
        assert all("salary" not in e for e in member.get("/employees").json())
        assert member.post("/employees", json={"name": "Nope"}).status_code == 403
        assert member.delete(f"/products/{data['prod']['id']}").status_code == 403
        assert not any(r["type"] == "customer" for r in member.get("/search", params={"q": data["cust"]["name"]}).json())

        task = admin.post("/tasks", json={"title": f"T9 task {TAG}", "assignee_id": me["id"], "customer_id": data["cust"]["id"]}).json()
        assert task["assignee"] == f"T9 Member {TAG}" and task["customer_name"] == data["cust"]["name"]
        assert any(t["id"] == task["id"] for t in member.get("/tasks").json())
        assert member.put(f"/tasks/{task['id']}", json={"status": "completed"}).json()["status"] == "completed"

        r = member.post("/auth/change-password", json={"current_password": invite["temp_password"], "new_password": "T9-NewPass-123"})
        assert r.status_code == 200
        assert member.get("/auth/me").status_code == 401  # old session signed out
    finally:
        owner.delete(f"/team/{me['id']}")  # only the owner removes members
