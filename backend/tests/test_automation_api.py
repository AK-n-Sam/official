"""Automation through the API: events, collection follow-ups, repeating invoices and bills with approval,
background jobs, bank categorisation, the weekly summary, and integration health (no secrets exposed).

Runs as a throwaway admin invited by the owner; everything created is removed afterwards.
"""
import os
import time
import uuid
from datetime import date, timedelta

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"
OWNER_EMAIL = os.environ["ADMIN_EMAIL"]
OWNER_PASSWORD = os.environ["ADMIN_PASSWORD"]
TAG = uuid.uuid4().hex[:6]
TODAY = date.today()
ENV = dotenv_values(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


class Client:
    def __init__(self, token):
        self.h = {"Authorization": f"Bearer {token}"}

    def __getattr__(self, method):
        return lambda path, **kw: getattr(requests, method)(f"{API}{path}", headers=self.h, timeout=60, **kw)


@pytest.fixture(scope="module")
def owner():
    return Client(_login(OWNER_EMAIL, OWNER_PASSWORD))


def _invite(owner, role):
    email = f"tauto{role}{TAG}@example.com"
    r = owner.post("/team/invite", json={"name": f"Auto {role} {TAG}", "email": email, "role": role})
    assert r.status_code == 200, r.text
    c = Client(_login(email, r.json()["temp_password"]))
    c.me = c.get("/auth/me").json()
    return c


@pytest.fixture(scope="module")
def admin(owner):
    c = _invite(owner, "admin")
    c.cleanup = {"recurring": [], "accounts": [], "products": []}
    yield c
    for r in c.cleanup["recurring"]:
        c.delete(f"/automation/recurring/{r}")
    for a in c.cleanup["accounts"]:
        c.delete(f"/bank/accounts/{a}")
    for inv in c.get("/invoices", params={"search": TAG}).json():
        full = c.get(f"/invoices/{inv['id']}").json()
        for p in full.get("payments", []):
            c.delete(f"/payments/{p['id']}")
        c.delete(f"/invoices/{inv['id']}")
    for e in c.get("/expenses", params={"search": TAG}).json():
        c.delete(f"/expenses/{e['id']}")
    for t in c.get("/tasks", params={"search": TAG}).json():
        c.delete(f"/tasks/{t['id']}")
    for cu in c.get("/customers", params={"search": TAG}).json():
        c.delete(f"/customers/{cu['id']}")
    for pid in c.cleanup["products"]:
        c.delete(f"/products/{pid}")
    owner.delete(f"/team/{c.me['id']}")


@pytest.fixture(scope="module")
def member(owner):
    c = _invite(owner, "member")
    yield c
    owner.delete(f"/team/{c.me['id']}")


@pytest.fixture(scope="module")
def customer(admin):
    r = admin.post("/customers", json={"name": f"Auto Customer {TAG}", "email": f"autocust{TAG}@example.com"})
    assert r.status_code == 200, r.text
    return r.json()


def _invoice(admin, customer, issue, due, status="sent", price=100.0):
    r = admin.post("/invoices", json={"customer_id": customer["id"], "issue_date": issue.isoformat(), "due_date": due.isoformat(), "status": status,
                                      "tax_rate": 0, "items": [{"description": f"Service {TAG}", "quantity": 1, "unit_price": price}]})
    assert r.status_code == 200, r.text
    return r.json()


def run_job(client, what, timeout=60):
    r = client.post(f"/automation/run/{what}")
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/automation/jobs/{job_id}").json()
        if job["status"] in ("done", "failed", "skipped"):
            return job
        time.sleep(1)
    raise AssertionError(f"job {what} still {job['status']} after {timeout}s")


def wait_for(fn, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        v = fn()
        if v:
            return v
        time.sleep(1)
    return fn()


# ---------------- access ----------------
def test_members_cannot_manage_automation(member):
    for path in ("/automation/settings", "/automation/log", "/automation/jobs", "/automation/approvals", "/automation/recurring", "/automation/integrations"):
        assert member.get(path).status_code == 403, path
    assert member.post("/automation/run/recurring").status_code == 403


def test_settings_roundtrip(admin):
    s = admin.get("/automation/settings").json()
    assert set(s["settings"]) >= {"overdue_followups", "close_followups", "weekly_summary", "ai_assist", "followup_after_days"}
    before = s["settings"]["followup_after_days"]
    r = admin.put("/automation/settings", json={"followup_after_days": 21})
    assert r.status_code == 200 and r.json()["settings"]["followup_after_days"] == 21
    admin.put("/automation/settings", json={"followup_after_days": before})
    assert admin.put("/automation/settings", json={"followup_after_days": 0}).status_code == 422
    assert admin.put("/automation/settings", json={"unknown": True}).status_code == 422


# ---------------- events + overdue ----------------
def test_overdue_event_fires_once_and_follow_up_closes_when_paid(admin, customer):
    inv = _invoice(admin, customer, TODAY - timedelta(days=40), TODAY - timedelta(days=20))
    for _ in range(3):  # several refreshes; the transition happens once
        admin.get("/invoices")
    assert admin.get(f"/invoices/{inv['id']}").json()["status"] == "overdue"
    events = [e for e in admin.get("/automation/events", params={"limit": 300}).json() if e["data"].get("invoice_id") == inv["id"]]
    kinds = [e["type"] for e in events]
    assert kinds.count("invoice_overdue") == 1 and "invoice_created" in kinds

    job = run_job(admin, "collections")
    assert job["status"] == "done", job
    tasks = [t for t in admin.get("/tasks", params={"search": inv["invoice_number"]}).json() if (t.get("automation") or {}).get("invoice_id") == inv["id"]]
    assert len(tasks) == 1 and tasks[0]["status"] == "todo" and tasks[0]["assignee_id"] == admin.me["id"]
    assert run_job(admin, "collections")["status"] == "done"  # a second run doesn't add another
    assert len([t for t in admin.get("/tasks", params={"search": inv["invoice_number"]}).json() if (t.get("automation") or {}).get("invoice_id") == inv["id"]]) == 1

    # Today shows one item for it, with the follow-up attached, not two.
    today = admin.get("/today").json()
    item = next(i for i in today["items"] if i["key"] == f"overdue_invoice:{inv['id']}")
    assert item["context"]["followup_task_id"] == tasks[0]["id"]
    assert not any(i["key"] == f"task:{tasks[0]['id']}" for i in today["items"])

    assert admin.post(f"/invoices/{inv['id']}/pay", json={"amount": 100, "method": "cash", "date": TODAY.isoformat()}).status_code == 200
    assert admin.get(f"/tasks/{tasks[0]['id']}").json()["status"] == "done"
    log = admin.get("/automation/log").json()
    assert any(inv["invoice_number"] in l["message"] and "follow-up task was closed" in l["message"] for l in log)


def test_low_stock_logged_once_per_crossing(admin, customer):
    p = admin.post("/products", json={"name": f"Auto Lamp {TAG}", "price": 20, "cost": 8, "stock_quantity": 5, "reorder_level": 3}).json()
    admin.cleanup["products"].append(p["id"])
    sale = {"customer_id": customer["id"], "payment": "paid", "method": "cash", "items": [{"product_id": p["id"], "description": "Lamp", "quantity": 2, "unit_price": 20}]}
    assert admin.post("/actions/sale", json=sale).status_code == 200  # 5 -> 3: crosses the reorder level
    assert admin.post("/actions/sale", json={**sale, "items": [{**sale["items"][0], "quantity": 1}]}).status_code == 200  # 3 -> 2: already low
    hits = [l for l in admin.get("/automation/log").json() if l["rule"] == "Low stock alert" and p["name"] in l["message"]]
    assert len(hits) == 1 and "down to 3" in hits[0]["message"]


# ---------------- repeating invoices + approvals ----------------
def test_repeating_invoice_waits_for_approval_then_issues_once(admin, customer):
    src = _invoice(admin, customer, TODAY, TODAY + timedelta(days=14), price=250)
    r = admin.post("/automation/recurring", json={"source_type": "invoice", "source_id": src["id"], "frequency": "monthly", "start_date": TODAY.isoformat()})
    assert r.status_code == 200, r.text
    rec = r.json()
    admin.cleanup["recurring"].append(rec["id"])
    assert rec["template"]["due_days"] == 14 and rec["auto_send"] is False
    assert admin.post("/automation/recurring", json={"source_type": "invoice", "source_id": src["id"]}).status_code == 409

    assert run_job(admin, "recurring")["status"] == "done"
    approvals = [a for a in admin.get("/automation/approvals").json() if a["payload"].get("recurring_id") == rec["id"]]
    assert len(approvals) == 1 and approvals[0]["status"] == "pending" and approvals[0]["amount"] == 250
    assert run_job(admin, "recurring")["status"] == "done"  # same period: nothing new
    assert len([a for a in admin.get("/automation/approvals").json() if a["payload"].get("recurring_id") == rec["id"]]) == 1
    assert any(i["kind"] == "approval" and i["context"]["approval_id"] == approvals[0]["id"] for i in admin.get("/today").json()["items"])

    done = admin.post(f"/automation/approvals/{approvals[0]['id']}/approve")
    assert done.status_code == 200, done.text
    new_id = done.json()["result"]["invoice_id"]
    new = admin.get(f"/invoices/{new_id}").json()
    assert new["total"] == 250 and new["status"] == "sent" and new["due_date"] == (TODAY + timedelta(days=14)).isoformat()
    assert admin.post(f"/automation/approvals/{approvals[0]['id']}/approve").status_code == 409  # a double click can't issue twice
    assert len([i for i in admin.get("/invoices", params={"customer_id": customer["id"]}).json() if i.get("recurring_id") == rec["id"]]) == 1
    nxt = next(x for x in admin.get("/automation/recurring").json() if x["id"] == rec["id"])
    assert nxt["next_date"] > TODAY.isoformat() and nxt["count"] == 1


def test_skipping_an_approval_issues_nothing(admin, customer):
    src = _invoice(admin, customer, TODAY, TODAY + timedelta(days=7), price=40)
    rec = admin.post("/automation/recurring", json={"source_type": "invoice", "source_id": src["id"], "frequency": "weekly", "start_date": TODAY.isoformat()}).json()
    admin.cleanup["recurring"].append(rec["id"])
    run_job(admin, "recurring")
    a = next(a for a in admin.get("/automation/approvals").json() if a["payload"].get("recurring_id") == rec["id"])
    assert admin.post(f"/automation/approvals/{a['id']}/reject").json()["status"] == "rejected"
    assert not [i for i in admin.get("/invoices", params={"customer_id": customer["id"]}).json() if i.get("recurring_id") == rec["id"]]


def test_auto_send_invoice_and_repeating_bill(admin, customer):
    src = _invoice(admin, customer, TODAY, TODAY + timedelta(days=30), price=75)
    rec = admin.post("/automation/recurring", json={"source_type": "invoice", "source_id": src["id"], "frequency": "quarterly",
                                                    "start_date": TODAY.isoformat(), "auto_send": True}).json()
    admin.cleanup["recurring"].append(rec["id"])
    exp = admin.post("/expenses", json={"category": "Rent", "vendor": f"Landlord {TAG}", "amount": 900, "date": TODAY.isoformat(), "status": "paid"}).json()
    bill = admin.post("/automation/recurring", json={"source_type": "expense", "source_id": exp["id"], "frequency": "monthly", "start_date": TODAY.isoformat()}).json()
    admin.cleanup["recurring"].append(bill["id"])
    run_job(admin, "recurring")
    run_job(admin, "recurring")
    issued = [i for i in admin.get("/invoices", params={"customer_id": customer["id"]}).json() if i.get("recurring_id") == rec["id"]]
    assert len(issued) == 1 and issued[0]["total"] == 75
    bills = [e for e in admin.get("/expenses", params={"search": TAG}).json() if e.get("recurring_id") == bill["id"]]
    assert len(bills) == 1 and bills[0]["status"] == "pending" and bills[0]["amount"] == 900


def test_repeat_validation(admin, customer):
    src = _invoice(admin, customer, TODAY, TODAY)
    past = (TODAY - timedelta(days=3)).isoformat()
    assert admin.post("/automation/recurring", json={"source_type": "invoice", "source_id": src["id"], "start_date": past}).status_code == 422
    assert admin.post("/automation/recurring", json={"source_type": "invoice", "source_id": "nope"}).status_code == 404
    assert admin.post("/automation/recurring", json={"source_type": "invoice", "source_id": src["id"], "frequency": "daily"}).status_code == 422


# ---------------- bank categorisation ----------------
def test_imported_bank_lines_get_categories_in_the_background(admin):
    ref = uuid.uuid4().hex[:8]  # not TAG: a test vendor named "... TAG" would match these lines by name first
    csv = ("Date,Description,Amount\n"
           f"{TODAY.isoformat()},AMAZON WEB SERVICES {ref},-49.00\n"
           f"{TODAY.isoformat()},UBER TRIP {ref},-18.50\n")
    r = admin.post("/bank/import", json={"filename": "s.csv", "content": csv, "account_name": f"Auto Bank {TAG}"})
    assert r.status_code == 200, r.text
    admin.cleanup["accounts"].append(r.json()["account"]["id"])

    def categorised():
        txns = [t for t in admin.get("/bank/transactions").json()["transactions"] if ref in t["description"]]
        return txns if txns and all(t["suggestion"].get("category") for t in txns) else None
    txns = wait_for(categorised, 40)
    assert txns, "categories were not filled in"
    by = {t["description"].split()[0]: t["suggestion"] for t in txns}
    assert by["AMAZON"]["category"] == "Software" and by["UBER"]["category"] == "Travel"
    assert all(s["confidence"] == "medium" for s in by.values())  # suggestions only; a person confirms
    assert admin.post("/bank/transactions/confirm", json={"ids": [t["id"] for t in txns]}).json()["confirmed"] == 0


# ---------------- jobs, summary ----------------
def test_jobs_are_listed_in_plain_words(admin):
    data = admin.get("/automation/jobs").json()
    assert set(data["counts"]) == {"queued", "running", "done", "failed", "skipped"}
    done = next(j for j in data["jobs"] if j["status"] == "done")
    assert done["state"] == "Done"
    assert admin.post(f"/automation/jobs/{done['id']}/retry").status_code == 400


def test_weekly_summary_is_written_on_request(admin):
    job = run_job(admin, "summary", timeout=120)
    assert job["status"] == "done", job
    s = admin.get("/automation/summary").json()
    assert s["headline"] and s["text"] and isinstance(s["next_steps"], list) and s["source"] in ("ai", "standard")
    assert "sales" in s["numbers"] and "overdue" in s["numbers"]


# ---------------- integrations: status words, never secrets ----------------
def _keys():
    return [k.strip() for v in ("OPENAI_API_KEYS", "GEMINI_API_KEYS", "OPENROUTER_API_KEYS") for k in (ENV.get(v) or "").split(",") if k.strip()]


def test_workspace_admin_sees_status_words_only(admin):
    r = admin.get("/automation/integrations")
    assert r.status_code == 200
    data = r.json()
    assert data["ai"]["label"] and "pool" not in data["ai"] and data["platform_admin"] is False
    assert not any(k in r.text for k in _keys())
    assert admin.put("/automation/integrations/ai", json={"enabled": True}).status_code == 403
    assert admin.post("/automation/integrations/check").status_code == 403


def test_platform_admin_sees_masked_pool_without_secrets(owner):
    r = owner.get("/automation/integrations")
    assert r.status_code == 200
    data = r.json()
    assert data["platform_admin"] is True and "pool" in data["ai"]
    keys = [k for p in data["ai"]["pool"]["providers"] for k in p["keys"]]
    assert all("…" in k["masked"] and len(k["key_id"]) == 12 for k in keys)
    assert not any(k in r.text for k in _keys())
    assert owner.put("/automation/integrations/ai", json={"provider_order": ["gemini", "nope"]}).status_code == 422
