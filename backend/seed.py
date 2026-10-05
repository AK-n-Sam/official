import uuid
from database import db, now_iso


def _id():
    return str(uuid.uuid4())


async def create_user_workspaces(user_id: str, user_name: str, user_email: str, organization_name: str = None):
    """Create a fresh clean workspace for a user with zero sample/demo data, return (active_org_id, org_ids)."""
    org_id = _id()
    name = organization_name or f"{user_name}'s Workspace"
    await db.organizations.insert_one({
        "id": org_id,
        "owner_user_id": user_id,
        "name": name,
        "industry": "General Business",
        "email": user_email,
        "phone": "",
        "website": "",
        "address": "",
        "city": "",
        "country": "",
        "currency": "USD",
        "timezone": "America/New_York",
        "tax_id": "",
        "invoice_prefix": "INV",
        "invoice_tax_rate": 0.0,
        "invoice_due_days": 30,
        "invoice_notes": "Thank you for your business.",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    return org_id, [org_id]
