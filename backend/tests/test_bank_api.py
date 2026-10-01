"""Bank feed API: statement import, suggested matches, confirm / undo, permissions, Today, and the
Plaid flow (only when the server is configured with Plaid credentials, e.g. a local Plaid stand-in
given by MOCK_PLAID_URL). Runs as a throwaway admin; everything is removed afterwards."""
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
MOCK_PLAID = os.environ.get("MOCK_PLAID_URL", "").rstrip("/")
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
        return lambda path, **kw: getattr(requests, method)(f"{API}{path}", headers=self.h, timeout=60, **kw)


@pytest.fixture(scope="module")
def ctx():
    owner = Client(_login(OWNER_EMAIL, OWNER_PASSWORD))
    email = f"tbankadmin{TAG}@example.com"
    inv = owner.post("/team/invite", json={"name": f"TB Admin {TAG}", "email": email, "role": "admin"}).json()
    admin = Client(_login(email, inv["temp_password"]))
    me = admin.get("/auth/me").json()
    cust = admin.post("/customers", json={"name": f"TB Globex {TAG}"}).json()
    sale = admin.post("/actions/sale", json={"customer_id": cust["id"], "payment": "unpaid", "tax_rate": 0,
                                             "items": [{"description": f"TB work {TAG}", "quantity": 1, "unit_price": 777.77}]}).json()["invoice"]
    bill = admin.post("/expenses", json={"category": f"TB Rent {TAG}", "vendor": f"Landlord{TAG}", "amount": 1234.5,
                                         "date": TODAY.isoformat(), "status": "pending"}).json()
    data = {"owner": owner, "admin": admin, "me": me, "cust": cust, "invoice": sale, "bill": bill}
    yield data
    for a in admin.get("/bank/status").json().get("accounts", []):
        admin.delete(f"/bank/accounts/{a['id']}")
    full = admin.get(f"/invoices/{sale['id']}").json()
    for p in full.get("payments", []):
        admin.delete(f"/payments/{p['id']}")
    admin.delete(f"/invoices/{sale['id']}")
    for e in admin.get("/expenses", params={"search": TAG}).json():
        admin.delete(f"/expenses/{e['id']}")
    admin.delete(f"/customers/{cust['id']}")
    owner.delete(f"/team/{me['id']}")


def statement(ctx):
    d1, d2, d3 = ((TODAY - timedelta(days=n)).strftime("%d/%m/%Y") for n in (3, 2, 1))
    num = ctx["invoice"]["invoice_number"]
    return ("Account:,Business Current\n\nDate,Description,Paid out,Paid in,Balance\n"
            f"{d1},FASTER PAYMENT TB GLOBEX {TAG} {num},,777.77,5000\n"
            f"{d2},STANDING ORDER LANDLORD{TAG},1234.50,,3765.50\n"
            f"{d3},TB COFFEE {TAG},4.20,,3761.30\n"
            f"{d3},TB COFFEE {TAG},4.20,,3757.10\n")


def test_members_cannot_see_the_bank(ctx):
    email = f"tbankmember{TAG}@example.com"
    inv = ctx["owner"].post("/team/invite", json={"name": "TB Member", "email": email, "role": "member"}).json()
    member = Client(_login(email, inv["temp_password"]))
    try:
        assert member.get("/bank/status").status_code == 403
        assert member.post("/bank/import", json={"content": "x"}).status_code == 403
    finally:
        mid = member.get("/auth/me").json()["id"]
        ctx["owner"].delete(f"/team/{mid}")


def test_preview_detects_columns(ctx):
    r = ctx["admin"].post("/bank/import/preview", json={"filename": "statement.csv", "content": statement(ctx)})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["mapping"]["money_in"] == "Paid in" and p["mapping"]["money_out"] == "Paid out" and p["count"] == 4 and not p["problems"]
    bad = ctx["admin"].post("/bank/import/preview", json={"filename": "x.csv", "content": "foo,bar\n1,2\n"}).json()
    assert bad["problems"]


def test_import_dedupes_and_suggests(ctx):
    admin = ctx["admin"]
    r = admin.post("/bank/import", json={"filename": "statement.csv", "content": statement(ctx), "account_name": f"TB Current {TAG}"})
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 4  # two identical coffees on one day are both kept
    ctx["account"] = r.json()["account"]
    again = admin.post("/bank/import", json={"filename": "statement.csv", "content": statement(ctx), "account_id": ctx["account"]["id"]}).json()
    assert again["imported"] == 0 and again["duplicates"] == 4

    txns = {t["description"]: t for t in admin.get("/bank/transactions").json()["transactions"] if TAG in t["description"]}
    deposit = next(t for d, t in txns.items() if "GLOBEX" in d)
    rent = next(t for d, t in txns.items() if "LANDLORD" in d)
    assert deposit["suggestion"]["action"] == "invoice_payment" and deposit["suggestion"]["invoice_id"] == ctx["invoice"]["id"]
    assert deposit["suggestion"]["confidence"] == "high"
    assert rent["suggestion"] == {**rent["suggestion"], "action": "expense_paid", "expense_id": ctx["bill"]["id"], "confidence": "high"}
    ctx["deposit"], ctx["rent"] = deposit, rent

    today = ctx["admin"].get("/today").json()
    item = next((i for i in today["items"] if i["key"] == "bank_review:all"), None)
    assert item and item["context"]["count"] >= 4


def test_confirm_and_undo_invoice_payment(ctx):
    admin = ctx["admin"]
    t = ctx["deposit"]
    r = admin.post(f"/bank/transactions/{t['id']}/match", json={"action": "invoice_payment", "invoice_id": ctx["invoice"]["id"]})
    assert r.status_code == 200, r.text
    inv = admin.get(f"/invoices/{ctx['invoice']['id']}").json()
    assert inv["status"] == "paid" and inv["payments"][0]["date"] == t["date"] and inv["payments"][0]["method"] == "bank_transfer"
    assert admin.post(f"/bank/transactions/{t['id']}/match", json={"action": "ignore"}).status_code == 409  # already handled
    assert admin.post(f"/bank/transactions/{t['id']}/undo").json()["status"] == "unmatched"
    inv = admin.get(f"/invoices/{ctx['invoice']['id']}").json()
    assert inv["amount_paid"] == 0 and not inv["payments"]


def test_create_expense_needs_category_and_can_be_undone(ctx):
    admin = ctx["admin"]
    coffee = next(t for t in admin.get("/bank/transactions").json()["transactions"] if "COFFEE" in t["description"] and TAG in t["description"])
    assert admin.post(f"/bank/transactions/{coffee['id']}/match", json={"action": "create_expense"}).status_code == 422
    r = admin.post(f"/bank/transactions/{coffee['id']}/match", json={"action": "create_expense", "category": f"TB Meals {TAG}", "vendor": "Coffee"})
    assert r.status_code == 200
    exp = admin.get("/expenses", params={"search": f"TB Meals {TAG}"}).json()
    assert len(exp) == 1 and exp[0]["amount"] == 4.2 and exp[0]["status"] == "paid"
    admin.post(f"/bank/transactions/{coffee['id']}/undo")
    assert admin.get("/expenses", params={"search": f"TB Meals {TAG}"}).json() == []
    assert admin.post(f"/bank/transactions/{coffee['id']}/match", json={"action": "ignore"}).json()["status"] == "ignored"
    assert any(t["id"] == coffee["id"] for t in admin.get("/bank/transactions", params={"status": "ignored"}).json()["transactions"])


def test_bulk_confirm_takes_only_confident_matches(ctx):
    admin = ctx["admin"]
    r = admin.post("/bank/transactions/confirm", json={"ids": [ctx["deposit"]["id"], ctx["rent"]["id"]]})
    assert r.json()["confirmed"] == 2
    assert admin.get(f"/invoices/{ctx['invoice']['id']}").json()["status"] == "paid"
    bill = admin.get(f"/expenses/{ctx['bill']['id']}").json()
    assert bill["status"] == "paid"
    # Removing the payment from the invoice side puts the bank line back up for review.
    pay = admin.get(f"/invoices/{ctx['invoice']['id']}").json()["payments"][0]
    admin.delete(f"/payments/{pay['id']}")
    back = admin.get("/bank/transactions").json()["transactions"]
    assert any(t["id"] == ctx["deposit"]["id"] for t in back)
    admin.post(f"/bank/transactions/{ctx['rent']['id']}/undo")
    assert admin.get(f"/expenses/{ctx['bill']['id']}").json()["status"] == "pending"


@pytest.mark.skipif(not MOCK_PLAID, reason="needs a Plaid endpoint (MOCK_PLAID_URL)")
def test_plaid_connect_sync_and_remove(ctx):
    admin = ctx["admin"]
    status = admin.get("/bank/status").json()
    assert status["plaid"]["configured"] is True
    assert admin.post("/bank/plaid/link-token").json()["link_token"].startswith("link-")
    assert admin.post("/bank/plaid/exchange", json={"public_token": "public-sandbox-bad"}).status_code == 400
    initech = admin.post("/customers", json={"name": "Initech LLC TB"}).json()
    inv = admin.post("/actions/sale", json={"customer_id": initech["id"], "payment": "unpaid", "tax_rate": 0,
                                            "items": [{"description": f"TB plaid {TAG}", "quantity": 1, "unit_price": 480}]}).json()["invoice"]
    try:
        r = admin.post("/bank/plaid/exchange", json={"public_token": "public-sandbox-good", "institution_name": "First Platypus Bank"})
        assert r.status_code == 200, r.text
        assert [a["name"] for a in r.json()["accounts"]] == ["Business Checking"]  # investment accounts are not followed
        assert r.json()["imported"] == 2  # pending and investment-account lines skipped
        lines = {t["external_id"]: t for t in admin.get("/bank/transactions").json()["transactions"] if t["external_id"].startswith("fit:t")}
        assert lines["fit:t1"]["amount"] == 480.0 and lines["fit:t2"]["amount"] == -89.99  # Plaid's signs flipped to money-in positive
        assert lines["fit:t1"]["suggestion"]["invoice_id"] == inv["id"]
        acct = next(a for a in admin.get("/bank/status").json()["accounts"] if a["source"] == "plaid")
        assert acct["balance"] == 12500.5 and acct["mask"] == "0000"
        requests.post(f"{MOCK_PLAID}/_test/later", timeout=10)
        s = admin.post("/bank/sync").json()
        assert s == {"imported": 1, "removed": 1}
        assert admin.delete(f"/bank/accounts/{acct['id']}").status_code == 200
        state = requests.get(f"{MOCK_PLAID}/_test/state", timeout=10).json()
        assert "access-sandbox-mock-secret" in state["removed"]  # disconnected at the bank side too
    finally:
        admin.delete(f"/invoices/{inv['id']}")
        admin.delete(f"/customers/{initech['id']}")
