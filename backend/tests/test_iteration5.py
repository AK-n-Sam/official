"""Iteration 5 tests: role-based scoping (member_scoped CRUD) + /api/my-work."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://workflow-hub-963.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_EMAIL = "aniruddh.samarth@gmail.com"
OWNER_PASSWORD = "Admin@12345"


@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def member(owner):
    """Invite a fresh member and return an authed session + info; cleaned up after tests."""
    uniq = uuid.uuid4().hex[:8]
    email = f"TEST_iter5_{uniq}@example.com"
    r = owner.post(f"{API}/team/invite", json={"name": f"TEST Iter5 {uniq}", "email": email, "role": "member"})
    assert r.status_code == 200, r.text
    body = r.json()
    temp = body["temp_password"]
    team = owner.get(f"{API}/team").json()
    mid = [m for m in team if m["email"] == email.lower()][0]["id"]

    s = requests.Session()
    lr = s.post(f"{API}/auth/login", json={"email": email, "password": temp}, timeout=15)
    assert lr.status_code == 200, lr.text
    s.headers.update({"Authorization": f"Bearer {lr.json()['token']}", "Content-Type": "application/json"})

    yield {"session": s, "email": email, "id": mid}

    # Cleanup
    try:
        owner.delete(f"{API}/team/{mid}")
    except Exception:
        pass


class TestOwnerFullVisibility:
    def test_owner_sees_customers(self, owner):
        r = owner.get(f"{API}/customers")
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1

    def test_owner_dashboard_ok(self, owner):
        r = owner.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        # Should have some metrics keys
        assert isinstance(r.json(), dict)


class TestMemberScoping:
    def test_member_customers_empty_initially(self, member):
        r = member["session"].get(f"{API}/customers")
        assert r.status_code == 200
        assert r.json() == [], f"member should not see owner's customers, got {len(r.json())}"

    def test_member_invoices_empty(self, member):
        r = member["session"].get(f"{API}/invoices")
        assert r.status_code == 200
        assert r.json() == []

    def test_member_expenses_empty(self, member):
        r = member["session"].get(f"{API}/expenses")
        assert r.status_code == 200
        assert r.json() == []

    def test_member_tasks_empty(self, member):
        r = member["session"].get(f"{API}/tasks")
        assert r.status_code == 200
        assert r.json() == []

    def test_member_leads_empty(self, member):
        r = member["session"].get(f"{API}/leads")
        assert r.status_code == 200
        assert r.json() == []

    def test_member_creates_customer_visible_to_self(self, member, owner):
        payload = {"name": f"TEST_MemberCust_{uuid.uuid4().hex[:6]}", "email": "tm@example.com"}
        c = member["session"].post(f"{API}/customers", json=payload)
        assert c.status_code in (200, 201), c.text
        created = c.json()
        assert created["name"] == payload["name"]
        # Member now sees exactly 1
        lst = member["session"].get(f"{API}/customers").json()
        assert len(lst) == 1
        assert lst[0]["id"] == created["id"]
        # Owner still sees this + all others
        owner_lst = owner.get(f"{API}/customers").json()
        assert any(x["id"] == created["id"] for x in owner_lst)
        assert len(owner_lst) > 1

    def test_products_are_shared(self, member, owner):
        m = member["session"].get(f"{API}/products").json()
        o = owner.get(f"{API}/products").json()
        assert len(m) == len(o) and len(o) > 0

    def test_suppliers_are_shared(self, member, owner):
        m = member["session"].get(f"{API}/suppliers").json()
        o = owner.get(f"{API}/suppliers").json()
        assert len(m) == len(o) and len(o) > 0


class TestPrivilegeGating:
    def test_member_cannot_invite(self, member):
        r = member["session"].post(f"{API}/team/invite", json={"name": "X", "email": f"x_{uuid.uuid4().hex[:6]}@x.com", "role": "member"})
        assert r.status_code == 403


class TestMyWork:
    def test_owner_my_work(self, owner):
        r = owner.get(f"{API}/my-work")
        assert r.status_code == 200, r.text
        data = r.json()
        # Expect tasks/leads/activity keys
        assert "tasks" in data or "open_tasks" in data
        assert "leads" in data or "open_leads" in data or "active_leads" in data
        assert "activity" in data or "recent_activity" in data

    def test_member_my_work_scoped(self, member):
        r = member["session"].get(f"{API}/my-work")
        assert r.status_code == 200, r.text
        data = r.json()
        # For fresh member, tasks/leads should be empty lists
        tasks = data.get("tasks") or data.get("open_tasks") or []
        leads = data.get("leads") or data.get("open_leads") or data.get("active_leads") or []
        assert isinstance(tasks, list) and len(tasks) == 0
        assert isinstance(leads, list) and len(leads) == 0
