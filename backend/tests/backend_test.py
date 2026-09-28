"""Backend integration tests for NexusOS SME Business Management Platform."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://workflow-hub-963.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "aniruddh.samarth@gmail.com"
ADMIN_PASSWORD = "Admin@12345"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_user(admin_token):
    return admin_token["user"]


# ---------- Health ----------
def test_root():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self, admin_token):
        assert admin_token["user"]["email"] == ADMIN_EMAIL
        assert len(admin_token["user"]["org_ids"]) == 3
        assert admin_token["user"]["active_org_id"] in admin_token["user"]["org_ids"]

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code in (400, 401)

    def test_me(self, admin_client):
        r = admin_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code in (401, 403)

    def test_register_and_seed(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "password": "Passw0rd!"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "token" in data
        assert len(data["user"]["org_ids"]) >= 1


# ---------- Dashboard ----------
class TestDashboard:
    def test_stats(self, admin_client):
        r = admin_client.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_sales", "outstanding", "total_expenses", "profit", "customer_count",
                  "product_count", "invoice_count", "employee_count", "sales_trend",
                  "recent_invoices", "recent_transactions", "tasks_attention"]:
            assert k in d, f"missing {k}"
        assert isinstance(d["sales_trend"], list) and len(d["sales_trend"]) == 6

    def test_notifications(self, admin_client):
        r = admin_client.get(f"{API}/notifications")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Organizations / Multi-tenant ----------
class TestOrganizations:
    def test_list_and_current(self, admin_client):
        r = admin_client.get(f"{API}/organizations")
        assert r.status_code == 200
        orgs = r.json()
        assert len(orgs) == 3
        r2 = admin_client.get(f"{API}/organizations/current")
        assert r2.status_code == 200
        assert r2.json()["id"] in [o["id"] for o in orgs]

    def test_switch_and_isolation(self, admin_client, admin_user):
        orgs = admin_client.get(f"{API}/organizations").json()
        org_a, org_b = orgs[0]["id"], orgs[1]["id"]

        admin_client.post(f"{API}/organizations/switch", json={"org_id": org_a})
        cust_a = admin_client.get(f"{API}/customers").json()

        admin_client.post(f"{API}/organizations/switch", json={"org_id": org_b})
        cust_b = admin_client.get(f"{API}/customers").json()

        # Restore original
        admin_client.post(f"{API}/organizations/switch", json={"org_id": admin_user["active_org_id"]})

        ids_a = {c["id"] for c in cust_a}
        ids_b = {c["id"] for c in cust_b}
        assert ids_a and ids_b
        assert ids_a.isdisjoint(ids_b), "Multi-tenant isolation broken"

    def test_switch_unauthorized(self, admin_client):
        r = admin_client.post(f"{API}/organizations/switch", json={"org_id": "nonexistent-org"})
        assert r.status_code == 403


# ---------- Customer CRUD ----------
class TestCustomers:
    def test_full_crud(self, admin_client):
        # CREATE
        payload = {"name": "TEST_Customer", "email": "test@t.com", "company": "TestCo", "status": "active"}
        r = admin_client.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        cid = created["id"]
        assert created["name"] == "TEST_Customer"
        assert "org_id" in created

        # GET
        r = admin_client.get(f"{API}/customers/{cid}")
        assert r.status_code == 200
        assert r.json()["email"] == "test@t.com"

        # UPDATE
        r = admin_client.put(f"{API}/customers/{cid}", json={"company": "UpdatedCo"})
        assert r.status_code == 200
        assert r.json()["company"] == "UpdatedCo"

        # LIST + SEARCH
        r = admin_client.get(f"{API}/customers", params={"search": "TEST_Customer"})
        assert r.status_code == 200
        assert any(c["id"] == cid for c in r.json())

        # FILTER
        r = admin_client.get(f"{API}/customers", params={"status": "active"})
        assert r.status_code == 200

        # DELETE
        r = admin_client.delete(f"{API}/customers/{cid}")
        assert r.status_code == 200
        r = admin_client.get(f"{API}/customers/{cid}")
        assert r.status_code == 404

    def test_validation_missing_name(self, admin_client):
        r = admin_client.post(f"{API}/customers", json={"email": "x@y.com"})
        assert r.status_code == 422


# ---------- Products CRUD ----------
class TestProducts:
    def test_crud(self, admin_client):
        r = admin_client.post(f"{API}/products", json={
            "name": "TEST_Prod", "sku": "TESTSKU", "price": 10, "cost": 5,
            "stock_quantity": 20, "reorder_level": 5, "status": "active"
        })
        assert r.status_code == 200
        pid = r.json()["id"]

        r = admin_client.put(f"{API}/products/{pid}", json={"price": 15})
        assert r.status_code == 200 and r.json()["price"] == 15

        r = admin_client.delete(f"{API}/products/{pid}")
        assert r.status_code == 200


# ---------- Expenses CRUD ----------
class TestExpenses:
    def test_crud(self, admin_client):
        r = admin_client.post(f"{API}/expenses", json={
            "category": "TEST_Office", "vendor": "TestVendor", "amount": 100,
            "date": "2026-01-15", "status": "paid"
        })
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        assert r.json()["amount"] == 100

        r = admin_client.delete(f"{API}/expenses/{eid}")
        assert r.status_code == 200


# ---------- Invoices ----------
class TestInvoices:
    def test_create_pay_delete(self, admin_client):
        customers = admin_client.get(f"{API}/customers").json()
        assert customers, "No seeded customers"
        cust = customers[0]

        payload = {
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "issue_date": "2026-01-15",
            "due_date": "2026-02-15",
            "status": "pending",
            "items": [{"description": "TEST item", "quantity": 2, "unit_price": 50}],
            "tax_rate": 0.1,
        }
        r = admin_client.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["subtotal"] == 100
        assert inv["tax_amount"] == 10.0
        assert inv["total"] == 110.0
        assert inv["invoice_number"].startswith(("INV", "ACM", "NRL", "APX"))

        # Pay
        r = admin_client.post(f"{API}/invoices/{inv['id']}/pay", json={"amount": 110.0, "method": "bank_transfer"})
        assert r.status_code == 200
        assert r.json()["status"] == "paid"

        # Filter by status
        r = admin_client.get(f"{API}/invoices", params={"status": "paid"})
        assert r.status_code == 200
        assert any(i["id"] == inv["id"] for i in r.json())

        # Delete
        r = admin_client.delete(f"{API}/invoices/{inv['id']}")
        assert r.status_code == 200


# ---------- Stock Movements ----------
class TestStockMovements:
    def test_movement_updates_stock(self, admin_client):
        products = admin_client.get(f"{API}/products").json()
        assert products
        p = products[0]
        starting = p["stock_quantity"]

        r = admin_client.post(f"{API}/stock-movements", json={
            "product_id": p["id"], "type": "in", "quantity": 5, "reason": "TEST restock"
        })
        assert r.status_code == 200, r.text
        assert r.json()["new_stock"] == starting + 5

        r = admin_client.post(f"{API}/stock-movements", json={
            "product_id": p["id"], "type": "out", "quantity": 5, "reason": "TEST out"
        })
        assert r.status_code == 200
        assert r.json()["new_stock"] == starting


# ---------- Tasks ----------
class TestTasks:
    def test_create_move(self, admin_client):
        r = admin_client.post(f"{API}/tasks", json={
            "title": "TEST_Task", "priority": "high", "status": "todo", "due_date": "2026-02-01"
        })
        assert r.status_code == 200
        tid = r.json()["id"]

        r = admin_client.put(f"{API}/tasks/{tid}", json={"status": "in_progress"})
        assert r.status_code == 200 and r.json()["status"] == "in_progress"

        admin_client.delete(f"{API}/tasks/{tid}")


# ---------- Settings ----------
class TestSettings:
    def test_update_preferences(self, admin_client):
        r = admin_client.put(f"{API}/settings/preferences", json={"currency": "EUR"})
        assert r.status_code == 200
        assert r.json()["preferences"]["currency"] == "EUR"
        # restore
        admin_client.put(f"{API}/settings/preferences", json={"currency": "USD"})

    def test_update_profile(self, admin_client):
        r = admin_client.put(f"{API}/settings/profile", json={"phone": "+1-555-0000"})
        assert r.status_code == 200
        assert r.json()["phone"] == "+1-555-0000"

    def test_update_organization(self, admin_client):
        r = admin_client.put(f"{API}/settings/organization", json={"invoice_tax_rate": 0.08})
        assert r.status_code == 200
        assert r.json()["invoice_tax_rate"] == 0.08
