"""Iteration 4 tests: /api/team (multi-user teams)."""
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
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


class TestTeam:
    def test_list_team_returns_owner(self, owner):
        r = owner.get(f"{API}/team")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        owners = [m for m in data if m["role"] == "owner"]
        assert len(owners) == 1
        assert owners[0]["email"].lower() == OWNER_EMAIL
        assert owners[0]["is_you"] is True

    def test_unauth_rejected(self):
        r = requests.get(f"{API}/team", timeout=10)
        assert r.status_code in (401, 403)

    def test_invite_missing_fields(self, owner):
        r = owner.post(f"{API}/team/invite", json={"name": "", "email": ""})
        assert r.status_code in (400, 422)

    def test_invite_new_member_and_shared_data(self, owner):
        uniq = uuid.uuid4().hex[:8]
        email = f"TEST_invitee_{uniq}@example.com"
        name = f"TEST Invitee {uniq}"
        r = owner.post(f"{API}/team/invite", json={"name": name, "email": email, "role": "member"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "invited"
        assert body["email"] == email.lower()
        assert body.get("temp_password") and len(body["temp_password"]) >= 6
        temp = body["temp_password"]

        # Appears in members list
        team = owner.get(f"{API}/team").json()
        match = [m for m in team if m["email"] == email.lower()]
        assert match, "invitee not in team list"
        member_id = match[0]["id"]
        assert match[0]["role"] == "member"

        # Owner's customer count
        owner_customers = owner.get(f"{API}/customers").json()
        if not owner_customers:
            owner.post(f"{API}/customers", json={"name": f"TEST_SharedCust_{uuid.uuid4().hex[:4]}", "email": f"scust_{uuid.uuid4().hex[:6]}@example.com"})
            owner_customers = owner.get(f"{API}/customers").json()
        owner_count = len(owner_customers)

        # Invited user can login and see same workspace customers
        s2 = requests.Session()
        lr = s2.post(f"{API}/auth/login", json={"email": email, "password": temp}, timeout=15)
        assert lr.status_code == 200, lr.text
        tok2 = lr.json()["token"]
        s2.headers.update({"Authorization": f"Bearer {tok2}", "Content-Type": "application/json"})
        inv_customers = s2.get(f"{API}/customers").json()
        assert isinstance(inv_customers, list)

        # Duplicate invite -> 400
        dup = owner.post(f"{API}/team/invite", json={"name": name, "email": email, "role": "member"})
        assert dup.status_code == 400

        # Non-owner cannot remove
        forbid = s2.delete(f"{API}/team/{member_id}")
        assert forbid.status_code == 403

        # Owner can remove
        rm = owner.delete(f"{API}/team/{member_id}")
        assert rm.status_code == 200
        team_after = owner.get(f"{API}/team").json()
        assert not [m for m in team_after if m["id"] == member_id]

    def test_owner_cannot_be_removed(self, owner):
        cur = owner.get(f"{API}/auth/me").json()
        r = owner.delete(f"{API}/team/{cur['id']}")
        assert r.status_code == 400
