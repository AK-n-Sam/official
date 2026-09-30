"""Iteration 3 tests: /api/search (global search) and /api/activity (business feed)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://workflow-hub-963.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "aniruddh.samarth@gmail.com"
ADMIN_PASSWORD = "Admin@12345"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


# ---------- Global Search ----------
class TestGlobalSearch:
    def test_empty_query_returns_empty_list(self, client):
        r = client.get(f"{API}/search", params={"q": ""})
        assert r.status_code == 200
        assert r.json() == []

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{API}/search", params={"q": "abc"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_search_by_customer_name(self, client):
        # get a real customer name from active workspace
        cust = client.get(f"{API}/customers").json()
        assert cust, "expected seeded customers"
        target = cust[0]
        # search using first word of name
        needle = target["name"].split()[0]
        r = client.get(f"{API}/search", params={"q": needle})
        assert r.status_code == 200
        results = r.json()
        assert isinstance(results, list) and len(results) > 0
        # every result must have required fields
        for it in results:
            assert set(["type", "id", "title", "subtitle", "link"]).issubset(it.keys())
            assert it["type"] in ("customer", "invoice", "product", "expense", "employee", "task", "lead", "supplier")
        # find our customer
        cust_hits = [x for x in results if x["type"] == "customer" and x["id"] == target["id"]]
        assert cust_hits, f"customer {target['name']} not found in search"
        assert cust_hits[0]["link"] == f"/customers/{target['id']}"

    def test_search_by_invoice_prefix(self, client):
        inv = client.get(f"{API}/invoices").json()
        assert inv
        prefix = inv[0]["invoice_number"][:3]
        r = client.get(f"{API}/search", params={"q": prefix})
        assert r.status_code == 200
        results = r.json()
        inv_hits = [x for x in results if x["type"] == "invoice"]
        assert inv_hits, f"expected invoice results for prefix {prefix}"
        for h in inv_hits:
            assert h["link"].startswith("/invoices/")

    def test_search_gibberish_returns_empty(self, client):
        r = client.get(f"{API}/search", params={"q": "zzqxwvunexistentxyz123"})
        assert r.status_code == 200
        assert r.json() == []

    def test_search_isolated_by_org(self, client):
        orgs = client.get(f"{API}/organizations").json()
        assert len(orgs) >= 2
        active = client.get(f"{API}/organizations/current").json()["id"]
        other = next(o["id"] for o in orgs if o["id"] != active)
        # get a customer name only in "other" org
        client.post(f"{API}/organizations/switch", json={"org_id": other})
        other_cust = client.get(f"{API}/customers").json()
        assert other_cust
        needle = other_cust[0]["name"].split()[0]
        other_id = other_cust[0]["id"]
        # switch back and search
        client.post(f"{API}/organizations/switch", json={"org_id": active})
        r = client.get(f"{API}/search", params={"q": needle})
        assert r.status_code == 200
        hits = [x for x in r.json() if x["type"] == "customer" and x["id"] == other_id]
        assert not hits, "cross-org search leak: found other org's customer id"


# ---------- Activity Feed ----------
class TestActivityFeed:
    def test_returns_list(self, client):
        r = client.get(f"{API}/activity")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, "expected some seeded activity events"
        assert len(data) <= 20

    def test_event_shape_and_types(self, client):
        events = client.get(f"{API}/activity").json()
        allowed = {"customer", "invoice", "payment", "expense", "stock", "task"}
        for e in events:
            assert set(["type", "title", "description", "date", "link"]).issubset(e.keys())
            assert e["type"] in allowed

    def test_sorted_desc_by_date(self, client):
        events = client.get(f"{API}/activity").json()
        dates = [e.get("date", "") for e in events]
        assert dates == sorted(dates, reverse=True), "activity feed not sorted desc by date"

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{API}/activity", timeout=10)
        assert r.status_code in (401, 403)

    def test_new_invoice_appears_in_feed(self, client):
        customers = client.get(f"{API}/customers").json()
        assert customers
        c = customers[0]
        payload = {
            "customer_id": c["id"], "customer_name": c["name"],
            "issue_date": "2026-01-15", "due_date": "2026-02-15",
            "status": "pending",
            "items": [{"description": "TEST iter3 activity", "quantity": 1, "unit_price": 42}],
            "tax_rate": 0,
        }
        r = client.post(f"{API}/invoices", json=payload)
        assert r.status_code == 200, r.text
        inv = r.json()
        try:
            events = client.get(f"{API}/activity").json()
            inv_events = [e for e in events if e["type"] == "invoice" and inv["invoice_number"] in e["description"]]
            assert inv_events, "new invoice not surfaced in activity feed"
            assert inv_events[0]["link"] == f"/invoices/{inv['id']}"
        finally:
            client.delete(f"{API}/invoices/{inv['id']}")
