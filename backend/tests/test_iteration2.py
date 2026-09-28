"""Iteration 2 backend tests: leads, customer detail/history, invoice detail/status/payments,
dashboard extended KPIs, employees, tasks, realistic end-to-end workflow."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://workflow-hub-963.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "aniruddh.samarth@gmail.com"
ADMIN_PASSWORD = "Admin@12345"


@pytest.fixture(scope="module")
def client():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ---------------- Leads ----------------
class TestLeads:
    def test_crud_and_convert(self, client):
        payload = {"name": "TEST_Lead", "company": "TestCo", "email": "lead@t.com",
                   "phone": "", "stage": "lead", "value": 500, "owner": "Admin", "notes": "hot"}
        r = client.post(f"{API}/leads", json=payload)
        assert r.status_code == 200, r.text
        lead = r.json()
        lid = lead["id"]
        assert lead["stage"] == "lead"

        # Move stage
        r = client.put(f"{API}/leads/{lid}", json={"stage": "qualified"})
        assert r.status_code == 200 and r.json()["stage"] == "qualified"

        # Convert -> creates customer, lead becomes won
        r = client.post(f"{API}/leads/{lid}/convert")
        assert r.status_code == 200, r.text
        cust = r.json()
        assert cust["name"] == "TEST_Lead"
        cid = cust["id"]

        r = client.get(f"{API}/leads/{lid}")
        assert r.status_code == 200
        assert r.json()["stage"] == "won"

        # Cleanup
        client.delete(f"{API}/customers/{cid}")
        client.delete(f"{API}/leads/{lid}")

    def test_convert_not_found(self, client):
        r = client.post(f"{API}/leads/nonexistent/convert")
        assert r.status_code == 404


# ---------------- Customer Detail / history / list totals ----------------
class TestCustomersExtended:
    def test_list_has_totals(self, client):
        customers = client.get(f"{API}/customers").json()
        assert customers, "seeded customers required"
        c0 = customers[0]
        assert "total_sales" in c0 and "outstanding" in c0

    def test_history(self, client):
        customers = client.get(f"{API}/customers").json()
        cid = customers[0]["id"]
        r = client.get(f"{API}/customers/{cid}/history")
        assert r.status_code == 200
        h = r.json()
        for k in ("customer", "invoices", "payments", "tasks", "total_sales", "outstanding", "total_paid"):
            assert k in h, f"missing {k}"


# ---------------- Dashboard extended KPIs ----------------
class TestDashboardExtended:
    def test_new_kpis(self, client):
        r = client.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("amount_collected", "overdue_count", "overdue_amount", "new_customers",
                  "open_tasks", "sales_by_category", "invoice_status_breakdown"):
            assert k in d, f"missing {k}"
        assert isinstance(d["sales_by_category"], list)
        assert isinstance(d["invoice_status_breakdown"], list)


# ---------------- Invoice status transitions ----------------
class TestInvoiceStatuses:
    def test_status_transitions(self, client):
        customers = client.get(f"{API}/customers").json()
        cust = customers[0]
        r = client.post(f"{API}/invoices", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "issue_date": "2026-01-10", "due_date": "2026-02-10", "status": "draft",
            "items": [{"description": "svc", "quantity": 1, "unit_price": 100}],
            "tax_rate": 0.1,
        })
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["status"] == "draft"
        assert inv["total"] == 110.0

        # draft -> sent
        r = client.post(f"{API}/invoices/{inv['id']}/status", json={"status": "sent"})
        assert r.status_code == 200 and r.json()["status"] == "sent"

        # sent -> overdue
        r = client.post(f"{API}/invoices/{inv['id']}/status", json={"status": "overdue"})
        assert r.status_code == 200 and r.json()["status"] == "overdue"

        # invalid
        r = client.post(f"{API}/invoices/{inv['id']}/status", json={"status": "bogus"})
        assert r.status_code == 400

        # Mark paid via status endpoint
        r = client.post(f"{API}/invoices/{inv['id']}/status", json={"status": "paid"})
        assert r.status_code == 200 and r.json()["status"] == "paid"

        # Detail endpoint returns payments+balance
        r = client.get(f"{API}/invoices/{inv['id']}")
        assert r.status_code == 200
        det = r.json()
        assert "payments" in det and "balance" in det
        assert det["balance"] == 0.0
        assert len(det["payments"]) >= 1

        client.delete(f"{API}/invoices/{inv['id']}")


# ---------------- Realistic end-to-end workflow (CRITICAL) ----------------
class TestRealisticWorkflow:
    def test_full_flow(self, client):
        # 1. Create customer
        r = client.post(f"{API}/customers", json={"name": "TEST_Flow_Cust", "email": "flow@t.com", "status": "active"})
        assert r.status_code == 200
        cust = r.json()

        # 2. Create product with stock 50
        sku = f"FLOWSKU-{uuid.uuid4().hex[:6]}"
        r = client.post(f"{API}/products", json={
            "name": "TEST_Flow_Product", "sku": sku, "price": 100, "cost": 40,
            "stock_quantity": 50, "reorder_level": 5, "status": "active",
            "tax_rate": 0.1, "supplier_name": "TestSupp"
        })
        assert r.status_code == 200, r.text
        prod = r.json()
        assert prod["stock_quantity"] == 50

        # 3. Create invoice qty=10 with 10% discount, status=sent (deducts inventory)
        line = {"product_id": prod["id"], "description": prod["name"], "quantity": 10,
                "unit_price": 100, "discount": 10}  # 10% discount => 1000 - 100 = 900
        r = client.post(f"{API}/invoices", json={
            "customer_id": cust["id"], "customer_name": cust["name"],
            "issue_date": "2026-01-15", "due_date": "2026-02-15", "status": "sent",
            "items": [line], "tax_rate": 0.1,
        })
        assert r.status_code == 200, r.text
        inv = r.json()
        # Verify subtotal/tax/total. Accept either discount-as-percent or discount-as-amount.
        assert inv["subtotal"] in (900.0, 990.0), f"unexpected subtotal {inv['subtotal']}"
        expected_total = round(inv["subtotal"] * 1.10, 2)
        assert abs(inv["total"] - expected_total) < 0.01

        # 4. Verify inventory reduced by 10
        r = client.get(f"{API}/products/{prod['id']}")
        assert r.status_code == 200
        assert r.json()["stock_quantity"] == 40, f"expected 40 got {r.json()['stock_quantity']}"

        # 5. Record partial payment (half of total)
        partial = round(inv["total"] / 2, 2)
        r = client.post(f"{API}/payments", json={
            "invoice_id": inv["id"], "amount": partial, "method": "bank_transfer",
            "date": "2026-01-16", "notes": "partial"
        })
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["invoice"]["status"] == "partially_paid"
        assert abs(result["balance"] - (inv["total"] - partial)) < 0.01

        # 6. Mark paid via /status
        r = client.post(f"{API}/invoices/{inv['id']}/status", json={"status": "paid"})
        assert r.status_code == 200
        paid = r.json()
        assert paid["status"] == "paid"
        assert abs(paid["amount_paid"] - paid["total"]) < 0.01

        # 7. Customer detail history: outstanding=0, total_sales = paid total
        r = client.get(f"{API}/customers/{cust['id']}/history")
        assert r.status_code == 200
        h = r.json()
        assert h["outstanding"] == 0.0
        assert abs(h["total_sales"] - paid["total"]) < 0.01
        assert len(h["invoices"]) >= 1
        assert len(h["payments"]) >= 2

        # 8. Dashboard reflects
        r = client.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        assert r.json()["amount_collected"] >= paid["total"]

        # Cleanup
        client.delete(f"{API}/invoices/{inv['id']}")
        client.delete(f"{API}/products/{prod['id']}")
        client.delete(f"{API}/customers/{cust['id']}")


# ---------------- Payments error cases ----------------
class TestPaymentsErrors:
    def test_invalid_invoice(self, client):
        r = client.post(f"{API}/payments", json={"invoice_id": "nope", "amount": 10, "method": "cash", "date": "2026-01-15"})
        assert r.status_code == 404

    def test_zero_amount(self, client):
        # need a real invoice id
        invs = client.get(f"{API}/invoices").json()
        assert invs
        r = client.post(f"{API}/payments", json={"invoice_id": invs[0]["id"], "amount": 0, "method": "cash", "date": "2026-01-15"})
        assert r.status_code == 400


# ---------------- Employees ----------------
class TestEmployees:
    def test_crud(self, client):
        r = client.post(f"{API}/employees", json={
            "name": "TEST_Emp", "email": f"emp_{uuid.uuid4().hex[:6]}@t.com",
            "job_title": "QA", "department": "Eng", "status": "active", "notes": "n/a"
        })
        assert r.status_code == 200, r.text
        eid = r.json()["id"]

        r = client.get(f"{API}/employees/{eid}")
        assert r.status_code == 200 and r.json()["job_title"] == "QA"

        client.delete(f"{API}/employees/{eid}")


# ---------------- Tasks with customer link ----------------
class TestTasksLinked:
    def test_create_with_customer(self, client):
        customers = client.get(f"{API}/customers").json()
        cid = customers[0]["id"]
        r = client.post(f"{API}/tasks", json={
            "title": "TEST_LinkedTask", "priority": "high", "status": "todo",
            "due_date": "2026-02-01", "customer_id": cid, "customer_name": customers[0]["name"]
        })
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        assert r.json().get("customer_id") == cid
        client.delete(f"{API}/tasks/{tid}")
