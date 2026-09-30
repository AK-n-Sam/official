"""Iteration 6 tests: People Picker (assignee_id/owner_id), Reassign Work, Admin Scope (admins_see_all).

Owner-based end-to-end integration tests using seeded owner + freshly invited members.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

OWNER_EMAIL = "aniruddh.samarth@gmail.com"
OWNER_PASSWORD = "Admin@12345"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER_EMAIL, OWNER_PASSWORD)


@pytest.fixture(scope="module")
def owner_user(owner_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(owner_token), timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def team(owner_token):
    r = requests.get(f"{BASE_URL}/api/team", headers=_h(owner_token), timeout=30)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def invited_member(owner_token):
    """Invite a temp member and return {id, email, password, name}. Cleanup at teardown."""
    email = f"test_iter6_{uuid.uuid4().hex[:8]}@example.com"
    name = "Iter6 Member"
    r = requests.post(
        f"{BASE_URL}/api/team/invite",
        headers=_h(owner_token),
        json={"name": name, "email": email, "role": "member"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "temp_password" in data
    # Fetch id from /api/team
    team = requests.get(f"{BASE_URL}/api/team", headers=_h(owner_token)).json()
    m = next((x for x in team if x["email"] == email), None)
    assert m, "invited member not found in /team"
    yield {"id": m["id"], "email": email, "password": data["temp_password"], "name": name}
    # cleanup
    requests.delete(f"{BASE_URL}/api/team/{m['id']}", headers=_h(owner_token))


# ---------------- People Picker ----------------
class TestPeoplePicker:
    def test_task_with_assignee_id_persists_and_shows_in_member_mywork(self, owner_token, invited_member):
        payload = {
            "title": f"TEST_task_{uuid.uuid4().hex[:6]}",
            "status": "pending",
            "priority": "medium",
            "assignee_id": invited_member["id"],
        }
        r = requests.post(f"{BASE_URL}/api/tasks", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        task = r.json()
        assert task["assignee_id"] == invited_member["id"]
        # assignee name should be resolved by frontend, but backend should at least persist assignee_id
        # Verify via GET
        got = requests.get(f"{BASE_URL}/api/tasks/{task['id']}", headers=_h(owner_token)).json()
        assert got["assignee_id"] == invited_member["id"]

        # login as member, /my-work should include this task
        mtok = _login(invited_member["email"], invited_member["password"])
        mywork = requests.get(f"{BASE_URL}/api/my-work", headers=_h(mtok)).json()
        titles = [t["title"] for t in mywork.get("tasks", [])]
        assert task["title"] in titles, f"member's my-work missing assigned task: {titles}"
        # cleanup
        requests.delete(f"{BASE_URL}/api/tasks/{task['id']}", headers=_h(owner_token))

    def test_lead_with_owner_id_persists_and_shows_in_member_mywork(self, owner_token, invited_member):
        title = f"TEST_lead_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": title,
            "title": title,
            "stage": "qualified",
            "value": 100,
            "owner_id": invited_member["id"],
        }
        r = requests.post(f"{BASE_URL}/api/leads", headers=_h(owner_token), json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        lead = r.json()
        assert lead["owner_id"] == invited_member["id"]

        mtok = _login(invited_member["email"], invited_member["password"])
        mywork = requests.get(f"{BASE_URL}/api/my-work", headers=_h(mtok)).json()
        titles = [t.get("title") or t.get("name") for t in mywork.get("leads", [])]
        assert title in titles
        requests.delete(f"{BASE_URL}/api/leads/{lead['id']}", headers=_h(owner_token))


# ---------------- Reassign Work ----------------
class TestReassign:
    def test_reassign_moves_created_and_assigned(self, owner_token, invited_member, owner_user):
        # As member: create a customer (so created_by=member)
        mtok = _login(invited_member["email"], invited_member["password"])
        cr = requests.post(
            f"{BASE_URL}/api/customers",
            headers=_h(mtok),
            json={"name": f"TEST_cust_{uuid.uuid4().hex[:5]}", "email": f"x_{uuid.uuid4().hex[:6]}@y.com"},
            timeout=30,
        )
        assert cr.status_code in (200, 201), cr.text
        cid = cr.json()["id"]

        # As owner: create a task assigned to member
        tr = requests.post(
            f"{BASE_URL}/api/tasks",
            headers=_h(owner_token),
            json={"title": f"TEST_rt_{uuid.uuid4().hex[:5]}", "status": "pending", "priority": "low", "assignee_id": invited_member["id"]},
        )
        assert tr.status_code in (200, 201)
        tid = tr.json()["id"]

        # Reassign from member -> owner
        rr = requests.post(
            f"{BASE_URL}/api/team/{invited_member['id']}/reassign",
            headers=_h(owner_token),
            json={"to_member_id": owner_user["id"]},
            timeout=30,
        )
        assert rr.status_code == 200, rr.text
        body = rr.json()
        assert body["success"] is True
        assert body["total"] >= 1
        # counts include customers, tasks
        assert body["counts"].get("customers", 0) >= 1

        # Verify: task now assigned to owner
        task = requests.get(f"{BASE_URL}/api/tasks/{tid}", headers=_h(owner_token)).json()
        assert task["assignee_id"] == owner_user["id"]

        # Member should still be in workspace (list_team) but with 0 owned records
        team = requests.get(f"{BASE_URL}/api/team", headers=_h(owner_token)).json()
        assert any(m["id"] == invited_member["id"] for m in team)

        # Member's list of customers should now be empty (they had 1, now reassigned)
        mtok2 = _login(invited_member["email"], invited_member["password"])
        mcusts = requests.get(f"{BASE_URL}/api/customers", headers=_h(mtok2)).json()
        assert not any(c["id"] == cid for c in mcusts), "reassigned customer still visible to member"

        # cleanup
        requests.delete(f"{BASE_URL}/api/customers/{cid}", headers=_h(owner_token))
        requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=_h(owner_token))

    def test_reassign_self_returns_400(self, owner_token, invited_member):
        r = requests.post(
            f"{BASE_URL}/api/team/{invited_member['id']}/reassign",
            headers=_h(owner_token),
            json={"to_member_id": invited_member["id"]},
        )
        assert r.status_code == 400

    def test_member_cannot_reassign(self, owner_token, invited_member, owner_user):
        mtok = _login(invited_member["email"], invited_member["password"])
        r = requests.post(
            f"{BASE_URL}/api/team/{invited_member['id']}/reassign",
            headers=_h(mtok),
            json={"to_member_id": owner_user["id"]},
        )
        assert r.status_code == 403


# ---------------- Admin Scope Toggle ----------------
class TestAdminScope:
    def test_toggle_admins_see_all_persists(self, owner_token):
        # Set true
        r = requests.put(
            f"{BASE_URL}/api/settings/organization",
            headers=_h(owner_token),
            json={"admins_see_all": True},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("admins_see_all") is True
        # Verify via GET
        cur = requests.get(f"{BASE_URL}/api/organizations/current", headers=_h(owner_token)).json()
        assert cur.get("admins_see_all") is True

        # Set false
        r = requests.put(
            f"{BASE_URL}/api/settings/organization",
            headers=_h(owner_token),
            json={"admins_see_all": False},
        )
        assert r.status_code == 200
        assert r.json().get("admins_see_all") is False
        # restore true (default in most seed flows) — leave as False is fine, but restore true to avoid side-effects
        requests.put(
            f"{BASE_URL}/api/settings/organization",
            headers=_h(owner_token),
            json={"admins_see_all": True},
        )
