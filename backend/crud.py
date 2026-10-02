from typing import Dict, Any, List
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Body

from database import db, now_iso


def can_manage_team(user: dict) -> bool:
    """Team management (invite/remove/reassign) is allowed for owners and admins."""
    return user.get("role") in ("owner", "admin")


def sees_all_records(user: dict) -> bool:
    """Data visibility: owners always see everything. Admins see everything only when
    the workspace owner enabled 'admins_see_all'. Members only see their own records."""
    role = user.get("role")
    if role == "owner":
        return True
    if role == "admin":
        return bool(user.get("admins_see_all", False))
    return False


def is_privileged(user: dict) -> bool:
    """Kept for team-management gating (owner/admin)."""
    return can_manage_team(user)


def member_filter(user: dict) -> dict:
    """Members (and scope-limited admins) only see records they created."""
    return {} if sees_all_records(user) else {"created_by": user["id"]}


def make_crud(collection: str, CreateModel, search_fields: List[str], filter_fields: List[str] = None, member_scoped: bool = False):
    from auth import get_current_user

    router = APIRouter()
    filter_fields = filter_fields or []

    def _base(user):
        q = {"org_id": user["active_org_id"]}
        if member_scoped:
            q.update(member_filter(user))
        return q

    @router.get("")
    async def list_items(request: Request, user: dict = Depends(get_current_user)):
        query: Dict[str, Any] = _base(user)
        params = request.query_params
        search = params.get("search")
        if search and search_fields:
            query["$or"] = [{f: {"$regex": search, "$options": "i"}} for f in search_fields]
        for f in filter_fields:
            v = params.get(f)
            if v not in (None, "", "all"):
                query[f] = v
        return await db[collection].find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)

    @router.post("")
    async def create_item(payload: CreateModel, user: dict = Depends(get_current_user)):  # type: ignore
        doc = payload.model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["org_id"] = user["active_org_id"]
        doc["created_by"] = user["id"]
        doc["created_at"] = now_iso()
        doc["updated_at"] = now_iso()
        await db[collection].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/{item_id}")
    async def get_item(item_id: str, user: dict = Depends(get_current_user)):
        doc = await db[collection].find_one({"id": item_id, **_base(user)}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        return doc

    @router.put("/{item_id}")
    async def update_item(item_id: str, payload: Dict[str, Any] = Body(...), user: dict = Depends(get_current_user)):
        for k in ("id", "org_id", "_id", "created_at", "created_by"):
            payload.pop(k, None)
        payload["updated_at"] = now_iso()
        res = await db[collection].update_one({"id": item_id, **_base(user)}, {"$set": payload})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return await db[collection].find_one({"id": item_id, **_base(user)}, {"_id": 0})

    @router.delete("/{item_id}")
    async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
        res = await db[collection].delete_one({"id": item_id, **_base(user)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"success": True}

    return router
