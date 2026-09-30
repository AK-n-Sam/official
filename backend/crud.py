from typing import Dict, Any, List
import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Body
from pydantic import ValidationError

from database import db, now_iso

# Fields a client may never set directly on any record.
PROTECTED_FIELDS = ("id", "org_id", "_id", "created_at", "created_by", "updated_at")


def text_match(value: str) -> dict:
    """Case-insensitive 'contains' match on user input. The input is escaped, so characters like
    '(' or '.*' are searched literally instead of being run as a (possibly very slow) regex."""
    return {"$regex": re.escape(value.strip()[:100]), "$options": "i"}


def all_of(*parts: dict) -> dict:
    """AND together query fragments. Fragments may each carry their own "$or", which a plain
    dict merge would silently overwrite."""
    parts = [p for p in parts if p]
    if not parts:
        return {}
    if len(parts) == 1:
        return parts[0]
    return {"$and": parts}


def validation_error(e: ValidationError):
    return HTTPException(status_code=422, detail=e.errors(include_url=False, include_context=False))


def validated_update(Model, existing: dict, payload: dict) -> dict:
    """Validate a partial update against the create model, so edits obey the same rules
    (types, required fields) as creation. Only fields the model knows are kept."""
    for k in PROTECTED_FIELDS:
        payload.pop(k, None)
    known = {k: v for k, v in payload.items() if k in Model.model_fields}
    merged = {k: existing.get(k) for k in Model.model_fields if existing.get(k) is not None}
    merged.update(known)
    try:
        clean = Model(**merged).model_dump()
    except ValidationError as e:
        raise validation_error(e)
    return {k: clean[k] for k in known}


def can_manage_team(user: dict) -> bool:
    """Owners and admins manage the team, workspace settings and shared reference data.
    `role` is the user's role in the *active* workspace (resolved in get_current_user)."""
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


def member_filter(user: dict, shared_with: tuple = ()) -> dict:
    """Members (and scope-limited admins) only see records they created, plus records that
    name them in one of `shared_with` (e.g. a task's assignee_id or a lead's owner_id)."""
    if sees_all_records(user):
        return {}
    ors = [{"created_by": user["id"]}] + [{f: user["id"]} for f in shared_with]
    return ors[0] if len(ors) == 1 else {"$or": ors}


def make_crud(collection: str, CreateModel, search_fields: List[str], filter_fields: List[str] = None,
              member_scoped: bool = False, shared_with: tuple = (), label: str = "Record",
              manager_only_writes: bool = False, manager_only_delete: bool = False,
              private_fields: List[str] = None, before_delete=None, validate=None, date_field: str = None):
    """Generic org-scoped CRUD router.

    - member_scoped: members (and scope-limited admins) only see records they created or that
      name them in a `shared_with` field.
    - manager_only_writes / manager_only_delete: data only owners/admins may change or remove.
    - private_fields: hidden from members (e.g. salaries).
    - validate(doc, user): async; may fill in derived fields on `doc` (e.g. a linked record's name)
      and raises HTTPException to reject the create/update.
    - before_delete(doc, user): async; raises HTTPException to block deleting a record still in use.
    - date_field: lets the list be narrowed with ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD.
    """
    from auth import get_current_user

    router = APIRouter()
    filter_fields = filter_fields or []
    private_fields = private_fields or []
    fields = list(CreateModel.model_fields)

    def _base(user):
        scope = member_filter(user, shared_with) if member_scoped else {}
        return all_of({"org_id": user["active_org_id"]}, scope)

    def _hidden(user):
        return [] if can_manage_team(user) else private_fields

    def _projection(user):
        return {"_id": 0, **{f: 0 for f in _hidden(user)}}

    def _require_manager(user, action):
        if not can_manage_team(user):
            raise HTTPException(status_code=403, detail=f"Only owners and admins can {action} {label.lower()}s")

    @router.get("")
    async def list_items(request: Request, user: dict = Depends(get_current_user)):
        params = request.query_params
        parts = [_base(user)]
        search = (params.get("search") or "").strip()
        if search and search_fields:
            parts.append({"$or": [{f: text_match(search)} for f in search_fields]})
        for f in filter_fields:
            v = params.get(f)
            if v not in (None, "", "all"):
                parts.append({f: str(v)})
        if date_field and (params.get("date_from") or params.get("date_to")):
            rng = {}
            if params.get("date_from"):
                rng["$gte"] = str(params["date_from"])[:10]
            if params.get("date_to"):
                rng["$lte"] = str(params["date_to"])[:10]
            parts.append({date_field: rng})
        return await db[collection].find(all_of(*parts), _projection(user)).sort("created_at", -1).to_list(2000)

    @router.post("")
    async def create_item(payload: CreateModel, user: dict = Depends(get_current_user)):  # type: ignore
        if manager_only_writes:
            _require_manager(user, "add")
        doc = payload.model_dump()
        if validate:
            await validate(doc, user)
        doc.update({"id": str(uuid.uuid4()), "org_id": user["active_org_id"], "created_by": user["id"],
                    "created_at": now_iso(), "updated_at": now_iso()})
        await db[collection].insert_one(doc)
        doc.pop("_id", None)
        for f in _hidden(user):
            doc.pop(f, None)
        return doc

    @router.get("/{item_id}")
    async def get_item(item_id: str, user: dict = Depends(get_current_user)):
        doc = await db[collection].find_one(all_of({"id": item_id}, _base(user)), _projection(user))
        if not doc:
            raise HTTPException(status_code=404, detail=f"{label} not found")
        return doc

    @router.put("/{item_id}")
    async def update_item(item_id: str, payload: Dict[str, Any] = Body(...), user: dict = Depends(get_current_user)):
        if manager_only_writes:
            _require_manager(user, "edit")
        existing = await db[collection].find_one(all_of({"id": item_id}, _base(user)), {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail=f"{label} not found")
        # Members never see private fields, so they must not be able to overwrite them either.
        for f in _hidden(user):
            payload.pop(f, None)
        updates = validated_update(CreateModel, existing, payload)
        if validate:
            merged = {**existing, **updates}
            await validate(merged, user)
            updates.update({k: merged[k] for k in fields if k in merged and merged[k] != existing.get(k)})
        updates["updated_at"] = now_iso()
        await db[collection].update_one({"id": item_id, "org_id": user["active_org_id"]}, {"$set": updates})
        return await db[collection].find_one({"id": item_id, "org_id": user["active_org_id"]}, _projection(user))

    @router.delete("/{item_id}")
    async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
        if manager_only_writes or manager_only_delete:
            _require_manager(user, "delete")
        doc = await db[collection].find_one(all_of({"id": item_id}, _base(user)), {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"{label} not found")
        if before_delete:
            await before_delete(doc, user)
        await db[collection].delete_one({"id": item_id, "org_id": user["active_org_id"]})
        return {"success": True}

    return router
