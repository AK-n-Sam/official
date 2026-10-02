"""Unit and integration test suite for the Deep Feature Enhancements."""
import pytest
from fastapi.testclient import TestClient
from server import app, _derive_customer_insights, _compute_invoice, _invoice_status, log_audit_event

client = TestClient(app)

def test_root_endpoint():
    res = client.get("/api/")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_app_startup_and_routes():
    res = client.get("/openapi.json")
    assert res.status_code == 200
    paths = res.json().get("paths", {})
    assert "/api/collaboration/comments" in paths
    assert "/api/team/workload" in paths
    assert "/api/my-work" in paths
    assert "/api/invoices/auto-pay-customer" in paths
    assert "/api/search" in paths
    assert "/api/executive/overview" in paths
    assert "/api/admin/overview" in paths

def test_customer_insights_derivation():
    c = {"name": "Test Acme Corp", "credit_limit": 5000.0}
    
    # VIP Customer test
    t_vip = {"total_sales": 60000.0, "outstanding": 0.0, "invoice_count": 6, "overdue_count": 0, "last_order_date": "2026-09-15"}
    insights_vip = _derive_customer_insights(c, t_vip)
    assert insights_vip["tier"] == "VIP"
    assert insights_vip["buying_cadence"] == "Regular buyer"
    assert len(insights_vip["risk_alerts"]) == 0
    
    # Credit limit exceeded test
    t_limit = {"total_sales": 10000.0, "outstanding": 7000.0, "invoice_count": 3, "overdue_count": 0, "last_order_date": "2026-09-01"}
    insights_limit = _derive_customer_insights(c, t_limit)
    assert any("Credit limit exceeded" in alert for alert in insights_limit["risk_alerts"])

    # At-Risk Customer test
    t_risk = {"total_sales": 5000.0, "outstanding": 2000.0, "invoice_count": 2, "overdue_count": 1, "last_order_date": "2026-08-01"}
    insights_risk = _derive_customer_insights(c, t_risk)
    assert insights_risk["tier"] == "At-Risk"
    assert "overdue" in insights_risk["risk_alerts"][0].lower()
    
    # New Customer test
    t_new = {"total_sales": 0.0, "outstanding": 0.0, "invoice_count": 0, "overdue_count": 0, "last_order_date": ""}
    insights_new = _derive_customer_insights(c, t_new)
    assert insights_new["tier"] == "New"
    assert insights_new["buying_cadence"] == "Prospect"

def test_invoice_calculation_and_status():
    payload = {
        "items": [
            {"quantity": 2, "unit_price": 1500, "discount": 100},
            {"quantity": 1, "unit_price": 500, "discount": 0}
        ],
        "tax_rate": 0.10
    }
    items, subtotal, tax_amount, total = _compute_invoice(payload)
    assert subtotal == 3400.0
    assert tax_amount == 340.0
    assert total == 3740.0

    assert _invoice_status(total, 3740.0, "") == "paid"
    assert _invoice_status(total, 1000.0, "") == "partially_paid"
    assert _invoice_status(total, 0.0, "draft") == "draft"

@pytest.mark.anyio
async def test_audit_event_logging():
    user = {"id": "test_user_1", "name": "Tester", "email": "test@example.com"}
    log = await log_audit_event("test_org", user, "payment_recorded", "financial", "inv_123", "INV-1001", "Paid $500")
    assert log["org_id"] == "test_org"
    assert log["action"] == "payment_recorded"
    assert log["category"] == "financial"
    assert log["actor_name"] == "Tester"
