import uuid
from datetime import datetime, timezone, timedelta
from database import db, now_iso

DEFAULT_AUTOMATIONS = [
    {
        "id": "rule_overdue_task",
        "name": "Overdue Invoice Follow-Up Task",
        "description": "When an invoice is overdue for 7+ days, automatically create a collection follow-up task and flag customer risk.",
        "trigger": "invoice_overdue",
        "condition": {"overdue_days": 7},
        "action": "create_task",
        "category": "Invoicing & Collection",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_low_stock_task",
        "name": "Low Stock Reorder Alert & Task",
        "description": "When product stock drops below reorder level, automatically create a purchase reorder task for inventory.",
        "trigger": "stock_low",
        "condition": {"stock_lte": "reorder_level"},
        "action": "create_task",
        "category": "Inventory Management",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_stale_lead_followup",
        "name": "Stale Lead Re-Engagement Alert",
        "description": "When a lead has not been contacted for 7+ days, automatically generate a sales re-engagement task.",
        "trigger": "lead_inactive",
        "condition": {"inactive_days": 7},
        "action": "create_task",
        "category": "Sales & CRM",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_overdue_task_escalation",
        "name": "Overdue Task Manager Escalation",
        "description": "When a high-priority task is overdue, escalate notice to workspace manager with capacity recommendations.",
        "trigger": "task_overdue",
        "condition": {"overdue_days": 1},
        "action": "notify_manager",
        "category": "Team Operations",
        "enabled": True,
        "is_recommended": True,
    },
    {
        "id": "rule_high_expense_approval",
        "name": "High Expense Approval Routing",
        "description": "When an expense exceeds ₹50,000, automatically route to manager approval queue and flag priority.",
        "trigger": "expense_high",
        "condition": {"min_amount": 50000},
        "action": "request_approval",
        "category": "Financial Governance",
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

    # Also ensure autopilot settings exist
    settings = await db.autopilot_settings.find_one({"org_id": org_id})
    if not settings:
        await db.autopilot_settings.insert_one({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "enabled": True,
            "mode": "full_autopilot",
            "last_run_at": now_iso(),
            "auto_actions_count": 0,
            "created_at": now_iso(),
            "updated_at": now_iso()
        })


async def get_autopilot_status(org_id: str):
    await ensure_default_automations(org_id)
    settings = await db.autopilot_settings.find_one({"org_id": org_id}, {"_id": 0}) or {
        "enabled": True, "mode": "full_autopilot", "last_run_at": now_iso(), "auto_actions_count": 0
    }
    rules = await db.automations.find({"org_id": org_id}, {"_id": 0}).to_list(100)
    active_rules_count = len([r for r in rules if r.get("enabled")])
    recent_logs = await db.automation_logs.find({"org_id": org_id}, {"_id": 0}).sort("executed_at", -1).limit(10).to_list(10)
    
    # Calculate summary counts for Today
    today_str = now_iso()[:10]
    today_logs = await db.automation_logs.find({
        "org_id": org_id,
        "executed_at": {"$regex": f"^{today_str}"}
    }, {"_id": 0}).to_list(100)

    return {
        "enabled": settings.get("enabled", True),
        "mode": settings.get("mode", "full_autopilot"),
        "last_run_at": settings.get("last_run_at", now_iso()),
        "total_rules": len(rules),
        "active_rules_count": active_rules_count,
        "today_actions_count": len(today_logs),
        "recent_logs": recent_logs,
        "rules": rules,
        "summary": {
            "headline": f"Business Autopilot is ACTIVE. {len(today_logs)} automated actions executed today.",
            "description": "Six6Fix continuous business engine is monitoring invoices, stock levels, lead activity, and overdue task escalations.",
            "recommendation": "All high-priority exceptions are mapped into your Business Command Center queue."
        }
    }


async def toggle_autopilot(org_id: str, enabled: bool, mode: str = "full_autopilot"):
    await ensure_default_automations(org_id)
    await db.autopilot_settings.update_one(
        {"org_id": org_id},
        {"$set": {"enabled": enabled, "mode": mode, "updated_at": now_iso()}},
        upsert=True
    )
    return {"success": True, "enabled": enabled, "mode": mode}


async def get_autopilot_history(org_id: str, limit: int = 50):
    logs = await db.automation_logs.find({"org_id": org_id}, {"_id": 0}).sort("executed_at", -1).limit(limit).to_list(limit)
    return logs


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
                    "rule_key": "rule_overdue_task",
                    "rule_name": "Overdue Invoice Follow-Up Task",
                    "reason": f"Invoice #{inv.get('invoice_number')} for {inv.get('customer_name')} is 7+ days overdue.",
                    "action_taken": f"Created collection task for {inv.get('customer_name')}.",
                    "result": f"Task assigned to {task_doc['assignee']} with high priority.",
                    "executed_at": now_iso()
                }
                await db.automation_logs.insert_one(log_entry)
                executed_events.append(log_entry)

    # Rule 2: Low Stock Reorder Alert & Task
    if "rule_low_stock_task" in rule_keys:
        low_stock_products = await db.products.find({
            "org_id": org_id
        }, {"_id": 0}).to_list(200)

        for prod in low_stock_products:
            stock = prod.get("stock", 0)
            reorder = prod.get("reorder_level", prod.get("min_stock", 10))
            if stock <= reorder:
                existing = await db.tasks.find_one({
                    "org_id": org_id,
                    "reference": f"Low Stock Reorder #{prod['id']}",
                    "status": {"$ne": "completed"}
                })
                if not existing:
                    task_doc = {
                        "id": str(uuid.uuid4()),
                        "org_id": org_id,
                        "title": f"Reorder Product: {prod.get('name')}",
                        "description": f"Automated Alert: Stock level for '{prod.get('name')}' is {stock} units (reorder threshold is {reorder}). Supplier: {prod.get('supplier_name', 'Default Supplier')}.",
                        "assignee": "Inventory Manager",
                        "priority": "high",
                        "status": "todo",
                        "due_date": now_str,
                        "reference": f"Low Stock Reorder #{prod['id']}",
                        "created_by": "system",
                        "created_at": now_iso(),
                        "updated_at": now_iso()
                    }
                    await db.tasks.insert_one(task_doc)
                    log_entry = {
                        "id": str(uuid.uuid4()),
                        "org_id": org_id,
                        "rule_key": "rule_low_stock_task",
                        "rule_name": "Low Stock Reorder Alert & Task",
                        "reason": f"Product '{prod.get('name')}' stock dropped to {stock} (threshold: {reorder}).",
                        "action_taken": f"Created inventory reorder task.",
                        "result": f"Task created for Inventory Manager to issue purchase order.",
                        "executed_at": now_iso()
                    }
                    await db.automation_logs.insert_one(log_entry)
                    executed_events.append(log_entry)

    # Rule 3: Stale Lead Follow-Up Alert
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
                    "rule_key": "rule_stale_lead_followup",
                    "rule_name": "Stale Lead Re-Engagement Alert",
                    "reason": f"Lead '{lead.get('name')}' inactive since {lead.get('updated_at', '')[:10]}.",
                    "action_taken": f"Created sales re-engagement task.",
                    "result": f"Task assigned to {lead.get('owner', 'Sales Lead')}.",
                    "executed_at": now_iso()
                }
                await db.automation_logs.insert_one(log_entry)
                executed_events.append(log_entry)

    # Rule 4: Overdue Task Manager Escalation
    if "rule_overdue_task_escalation" in rule_keys:
        overdue_tasks = await db.tasks.find({
            "org_id": org_id,
            "status": {"$ne": "completed"},
            "priority": {"$in": ["high", "urgent"]},
            "due_date": {"$lt": now_str}
        }, {"_id": 0}).to_list(100)

        for task in overdue_tasks:
            if not task.get("escalated"):
                await db.tasks.update_one({"id": task["id"], "org_id": org_id}, {"$set": {"escalated": True, "updated_at": now_iso()}})
                log_entry = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "rule_key": "rule_overdue_task_escalation",
                    "rule_name": "Overdue Task Manager Escalation",
                    "reason": f"High priority task '{task.get('title')}' is overdue (due {task.get('due_date')}).",
                    "action_taken": f"Escalated to workspace manager.",
                    "result": "Marked task as escalated with priority alert.",
                    "executed_at": now_iso()
                }
                await db.automation_logs.insert_one(log_entry)
                executed_events.append(log_entry)

    # Update Autopilot settings run time
    await db.autopilot_settings.update_one(
        {"org_id": org_id},
        {
            "$set": {"last_run_at": now_iso(), "updated_at": now_iso()},
            "$inc": {"auto_actions_count": len(executed_events)}
        },
        upsert=True
    )

    return executed_events
