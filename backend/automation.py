import uuid
from datetime import datetime, timezone, timedelta
from database import db, now_iso

DEFAULT_AUTOMATIONS = [
    {
        "id": "rule_overdue_task",
        "name": "Overdue Invoice Follow-Up Task",
        "description": "When an invoice is overdue for 7 days, create a follow-up task for the assigned team member.",
        "trigger": "invoice_overdue",
        "condition": {"overdue_days": 7},
        "action": "create_task",
        "category": "Invoicing & Collection",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_low_stock_task",
        "name": "Low Stock Reorder Alert",
        "description": "When product stock drops below reorder level, automatically create a purchase reorder task.",
        "trigger": "stock_low",
        "condition": {"stock_lte": "reorder_level"},
        "action": "create_task",
        "category": "Inventory Management",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_stale_lead_followup",
        "name": "Stale Lead Follow-Up Alert",
        "description": "When a lead has not been updated or contacted for 7 days, create a follow-up reminder task.",
        "trigger": "lead_inactive",
        "condition": {"inactive_days": 7},
        "action": "create_task",
        "category": "Sales & CRM",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_large_discount_approval",
        "name": "Large Discount Approval Sign-Off",
        "description": "When an invoice discount exceeds 15% (or ₹5,000), require manager sign-off.",
        "trigger": "discount_high",
        "condition": {"discount_pct": 15},
        "action": "request_approval",
        "category": "Financial Governance",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_overdue_task_escalation",
        "name": "Overdue Task Manager Escalation",
        "description": "When a high-priority task is overdue by 3 days, escalate notice to workspace manager.",
        "trigger": "task_overdue",
        "condition": {"overdue_days": 3},
        "action": "notify_manager",
        "category": "Team Operations",
        "enabled": True,
        "is_recommended": True,
    },
]


async def ensure_default_automations(org_id: str):
    """Seed standard business automation rules if none exist for workspace."""
    count = await db.automations.count_documents({"org_id": org_id})
    if count == 0:
        for tpl in DEFAULT_AUTOMATIONS:
            doc = {**tpl, "id": f"auto_{uuid.uuid4().hex[:10]}", "rule_key": tpl["id"], "org_id": org_id, "created_at": now_iso(), "updated_at": now_iso()}
            await db.automations.insert_one(doc)


async def run_business_brain(org_id: str, user_id: str = "system"):
    """Evaluate business intelligence rules across workspace records and execute consequences."""
    await ensure_default_automations(org_id)
    rules = await db.automations.find({"org_id": org_id, "enabled": True}, {"_id": 0}).to_list(100)
    rule_keys = {r.get("rule_key"): r for r in rules}

    executed_events = []
    now_str = now_iso()[:10]
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()[:10]

    # Rule 1: Overdue Invoice Follow-Up Task
    if "rule_overdue_task" in rule_keys:
        overdue_invoices = await db.invoices.find({
            "org_id": org_id,
            "status": "overdue",
            "due_date": {"$lte": seven_days_ago}
        }, {"_id": 0}).to_list(100)

        for inv in overdue_invoices:
            existing = await db.tasks.find_one({
                "org_id": org_id,
                "reference": f"Invoice Follow-up #{inv['id']}",
                "status": {"$ne": "completed"}
            })
            if not existing:
                task_doc = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "title": f"Follow up on overdue Invoice #{inv.get('invoice_number', 'INV')}",
                    "description": f"Automated Task: Customer {inv.get('customer_name')} has an overdue balance of ₹{inv.get('total', 0):,.2f} since {inv.get('due_date')}.",
                    "assignee": inv.get("salesperson") or "Account Representative",
                    "priority": "high",
                    "status": "todo",
                    "due_date": now_str,
                    "customer_id": inv.get("customer_id", ""),
                    "customer_name": inv.get("customer_name", ""),
                    "reference": f"Invoice Follow-up #{inv['id']}",
                    "created_by": "system",
                    "created_at": now_iso(),
                    "updated_at": now_iso()
                }
                await db.tasks.insert_one(task_doc)
                log_entry = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "rule_name": "Overdue Invoice Follow-Up Task",
                    "reason": f"Invoice {inv.get('invoice_number')} for {inv.get('customer_name')} became 7+ days overdue.",
                    "action_taken": f"Created high-priority task for {inv.get('customer_name')}.",
                    "executed_at": now_iso()
                }
                await db.automation_logs.insert_one(log_entry)
                executed_events.append(log_entry)

    # Rule 2: Stale Lead Follow-Up Alert
    if "rule_stale_lead_followup" in rule_keys:
        stale_leads = await db.leads.find({
            "org_id": org_id,
            "stage": {"$in": ["lead", "qualified", "proposal"]},
            "updated_at": {"$lte": seven_days_ago}
        }, {"_id": 0}).to_list(100)

        for lead in stale_leads:
            existing = await db.tasks.find_one({
                "org_id": org_id,
                "reference": f"Stale Lead #{lead['id']}",
                "status": {"$ne": "completed"}
            })
            if not existing:
                task_doc = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "title": f"Re-engage stale deal: {lead.get('name')}",
                    "description": f"Automated Alert: Deal '{lead.get('name')}' ({lead.get('company', 'Prospect')}) has been inactive for 7+ days. Potential deal value: ₹{lead.get('value', 0):,.2f}.",
                    "assignee": lead.get("owner") or "Sales Lead",
                    "priority": "medium",
                    "status": "todo",
                    "due_date": now_str,
                    "reference": f"Stale Lead #{lead['id']}",
                    "created_by": "system",
                    "created_at": now_iso(),
                    "updated_at": now_iso()
                }
                await db.tasks.insert_one(task_doc)
                log_entry = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "rule_name": "Stale Lead Follow-Up Alert",
                    "reason": f"Lead '{lead.get('name')}' inactive since {lead.get('updated_at', '')[:10]}.",
                    "action_taken": f"Created re-engagement task for {lead.get('owner', 'Sales team')}.",
                    "executed_at": now_iso()
                }
                await db.automation_logs.insert_one(log_entry)
                executed_events.append(log_entry)

    return executed_events
