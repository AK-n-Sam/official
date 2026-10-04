import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from database import db, now_iso

DEFAULT_PREFERENCES = {
    "language_mode": "simple",  # simple | standard | advanced
    "priority_mode": "balanced",  # deadline | customer | revenue | urgency | balanced
    "start_page": "/dashboard",  # /dashboard | /my-work | /executive | /sales | /invoices | /customers | /automations | last_page
    "density": "comfortable",  # comfortable | compact | focus
    "theme": "dark",
    "work_hours": {
        "start": "09:00",
        "end": "18:00",
        "working_days": [1, 2, 3, 4, 5],
        "quiet_hours_enabled": True
    },
    "business_goals": ["reduce_overdue", "increase_revenue", "reorder_inventory"],
    "pinned_quick_actions": ["create_invoice", "add_customer", "record_payment", "create_task"],
    "dashboard_widgets": ["kpi_summary", "needs_attention", "recent_activity", "automation_suggestions"],
    "column_preferences": {},
    "saved_filters": {},
    "notifications_config": {
        "mute_informational": False,
        "critical_alert_email": True,
        "overdue_reminder_frequency": "daily"
    }
}

LAYMAN_TERMS = {
    "simple": {
        "accounts_receivable": "Money customers still owe you",
        "accounts_payable": "Money you owe suppliers",
        "stale_leads": "People who may need a follow-up",
        "revenue": "Money coming in",
        "expenses": "Money going out",
        "action_queue": "Needs your attention today",
        "margin": "Profit margin after costs",
        "reorder_level": "Low stock warning point",
    },
    "standard": {
        "accounts_receivable": "Outstanding customer balance",
        "accounts_payable": "Vendor bills unpaid",
        "stale_leads": "Inactive leads (>7 days)",
        "revenue": "Total sales revenue",
        "expenses": "Total operating expenses",
        "action_queue": "Action items & alerts",
        "margin": "Gross margin %",
        "reorder_level": "Reorder threshold",
    },
    "advanced": {
        "accounts_receivable": "Accounts Receivable (AR)",
        "accounts_payable": "Accounts Payable (AP)",
        "stale_leads": "Pipeline Lead Aging",
        "revenue": "Revenue Inflow",
        "expenses": "Operational Expenditure (OpEx)",
        "action_queue": "Exception Queue",
        "margin": "EBITDA Gross Margin",
        "reorder_level": "Safety Stock Trigger",
    }
}


async def get_or_create_personalization(user_id: str, org_id: str) -> dict:
    """Retrieve or initialize complete user personalization profile."""
    doc = await db.user_personalization.find_one({"user_id": user_id, "org_id": org_id}, {"_id": 0})
    if not doc:
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "org_id": org_id,
            "preferences": DEFAULT_PREFERENCES,
            "favorites": [],
            "recent_history": [],
            "usage_frequency": {
                "create_invoice": 5,
                "add_customer": 4,
                "record_payment": 3,
                "create_task": 3
            },
            "last_page": "/dashboard",
            "created_at": now_iso(),
            "updated_at": now_iso()
        }
        await db.user_personalization.insert_one(doc)
        doc.pop("_id", None)
    return doc


async def update_personalization_prefs(user_id: str, org_id: str, new_prefs: dict) -> dict:
    current = await get_or_create_personalization(user_id, org_id)
    prefs = current.get("preferences", DEFAULT_PREFERENCES)
    for k, v in new_prefs.items():
        if v is not None:
            if isinstance(v, dict) and isinstance(prefs.get(k), dict):
                prefs[k].update(v)
            else:
                prefs[k] = v
    await db.user_personalization.update_one(
        {"user_id": user_id, "org_id": org_id},
        {"$set": {"preferences": prefs, "updated_at": now_iso()}}
    )
    return await get_or_create_personalization(user_id, org_id)


async def toggle_user_favorite(user_id: str, org_id: str, fav_item: dict) -> dict:
    """Add or remove an item from user's favorites."""
    current = await get_or_create_personalization(user_id, org_id)
    favorites = current.get("favorites", [])
    
    existing_idx = next((i for i, f in enumerate(favorites) if f.get("type") == fav_item.get("type") and f.get("id") == fav_item.get("id")), -1)
    
    if existing_idx >= 0:
        favorites.pop(existing_idx)
        is_fav = False
    else:
        favorites.insert(0, {
            "id": fav_item.get("id"),
            "type": fav_item.get("type"),
            "title": fav_item.get("title", "Item"),
            "subtitle": fav_item.get("subtitle", ""),
            "link": fav_item.get("link", "/dashboard"),
            "added_at": now_iso()
        })
        is_fav = True
        
    await db.user_personalization.update_one(
        {"user_id": user_id, "org_id": org_id},
        {"$set": {"favorites": favorites, "updated_at": now_iso()}}
    )
    return {"favorites": favorites, "is_favorite": is_fav}


async def log_user_recent_context(user_id: str, org_id: str, item: dict):
    """Record a recently visited page or record context."""
    if not item.get("link"):
        return
    current = await get_or_create_personalization(user_id, org_id)
    history = current.get("recent_history", [])
    
    # Remove duplicate if present
    history = [h for h in history if h.get("link") != item.get("link")]
    history.insert(0, {
        "title": item.get("title", "Page"),
        "type": item.get("type", "page"),
        "link": item.get("link"),
        "visited_at": now_iso()
    })
    history = history[:20]  # Keep top 20 recent
    
    last_page = item.get("link") if item.get("type") == "page" else current.get("last_page", "/dashboard")
    
    await db.user_personalization.update_one(
        {"user_id": user_id, "org_id": org_id},
        {"$set": {"recent_history": history, "last_page": last_page, "updated_at": now_iso()}}
    )


async def compute_personalized_today_queue(user: dict, org_id: str) -> dict:
    """Build the personalized 'Your Day' & 'Start Here' agenda based on role, priority mode, and working hours."""
    user_id = user["id"]
    user_role = (user.get("role") or "member").toLowerCase()
    
    p_doc = await get_or_create_personalization(user_id, org_id)
    prefs = p_doc.get("preferences", DEFAULT_PREFERENCES)
    priority_mode = prefs.get("priority_mode", "balanced")
    lang_mode = prefs.get("language_mode", "simple")
    terms = LAYMAN_TERMS.get(lang_mode, LAYMAN_TERMS["simple"])

    # Fetch active items across models
    tasks = await db.tasks.find({"org_id": org_id, "status": {"$ne": "completed"}}, {"_id": 0}).to_list(200)
    invoices = await db.invoices.find({"org_id": org_id, "status": "overdue"}, {"_id": 0}).to_list(100)
    leads = await db.leads.find({"org_id": org_id, "stage": {"$in": ["lead", "qualified"]}}, {"_id": 0}).to_list(100)
    approvals = await db.approvals.find({"org_id": org_id, "status": "pending"}, {"_id": 0}).to_list(50)

    # Filter assigned tasks
    my_tasks = [t for t in tasks if t.get("assignee_id") == user_id or t.get("assignee") == user.get("name")]
    
    # Priority sorting based on priority_mode
    def score_task(t):
        score = 0
        if t.get("priority") == "high": score += 30
        if t.get("due_date") and t.get("due_date") <= now_iso()[:10]: score += 40
        if priority_mode == "revenue" and t.get("customer_name"): score += 25
        if priority_mode == "deadline" and t.get("due_date"): score += 35
        return score

    sorted_my_tasks = sorted(my_tasks, key=score_task, reverse=True)

    # Build "Start Here" #1 top recommendation
    start_here = None
    if sorted_my_tasks:
        top_t = sorted_my_tasks[0]
        start_here = {
            "title": f"Complete task: {top_t.get('title')}",
            "reason": f"High priority task due on {top_t.get('due_date', 'today')}.",
            "action_label": "Mark Done",
            "action_type": "complete_task",
            "target_id": top_t["id"],
            "link": "/tasks"
        }
    elif invoices and user_role in ["owner", "admin", "finance"]:
        inv = invoices[0]
        start_here = {
            "title": f"Follow up on overdue {terms['accounts_receivable']}: Invoice #{inv.get('invoice_number')}",
            "reason": f"Customer {inv.get('customer_name')} has ₹{inv.get('total', 0):,.2f} overdue.",
            "action_label": "Send Reminder",
            "action_type": "remind_invoice",
            "target_id": inv["id"],
            "link": f"/invoices/{inv['id']}"
        }
    elif approvals and user_role in ["owner", "admin", "manager"]:
        appr = approvals[0]
        start_here = {
            "title": f"Approve request: {appr.get('title')}",
            "reason": f"Requested by {appr.get('requester_name', 'Teammate')} for ₹{appr.get('amount', 0):,.2f}.",
            "action_label": "Review & Approve",
            "action_type": "decide_approval",
            "target_id": appr["id"],
            "link": "/my-work"
        }

    # Recommended next actions tailored to role
    recommendations = []
    if user_role in ["owner", "admin", "finance"] and len(invoices) > 0:
        recommendations.append({
            "action": f"Review {len(invoices)} overdue customer invoices",
            "why": f"{terms['accounts_receivable']} is currently delayed.",
            "link": "/invoices?status=overdue",
            "button": "View Overdue Invoices"
        })
    if user_role in ["owner", "admin", "sales"] and len(leads) > 0:
        recommendations.append({
            "action": f"Re-engage {len(leads)} active sales deals",
            "why": "Consistent follow-ups improve sales conversion rate.",
            "link": "/leads",
            "button": "Open Sales Pipeline"
        })

    return {
        "start_here": start_here,
        "my_tasks_count": len(my_tasks),
        "my_overdue_tasks_count": len([t for t in my_tasks if t.get("due_date") and t.get("due_date") < now_iso()[:10]]),
        "pending_approvals_count": len(approvals),
        "today_tasks": sorted_my_tasks[:5],
        "recommendations": recommendations,
        "terms": terms,
        "language_mode": lang_mode,
        "priority_mode": priority_mode,
    }
