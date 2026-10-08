import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Body

from database import db, now_iso
from models import RegisterInput, LoginInput
from seed import create_user_workspaces

JWT_ALGORITHM = "HS256"

router = APIRouter(prefix="/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    jwt_secret = os.environ.get("JWT_SECRET")
    if not jwt_secret:
        if os.environ.get("VERCEL") or os.environ.get("NODE_ENV") == "production":
            raise RuntimeError("JWT_SECRET environment variable is required in production.")
        return "dev-jwt-secret-do-not-use-in-production-123456789"
    return jwt_secret


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def _extract_token(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return request.cookies.get("access_token") or request.cookies.get("session_token")


def _public_user(user: dict) -> dict:
    user = dict(user)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


async def ensure_admin_seeded():
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        return

    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        active_org_id, org_ids = await create_user_workspaces(user_id, "Administrator", admin_email)
        await db.users.insert_one({
            "id": user_id, "name": "Administrator", "email": admin_email,
            "password_hash": hash_password(admin_password), "picture": "", "phone": "",
            "job_title": "Owner", "provider": "password", "role": "owner",
            "org_ids": org_ids, "active_org_id": active_org_id,
            "preferences": {"currency": "USD", "timezone": "America/New_York", "date_format": "MMM d, yyyy", "email_notifications": True},
            "created_at": now_iso(), "updated_at": now_iso(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = None
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") == "access":
            user_id = payload["sub"]
    except jwt.PyJWTError:
        user_id = None

    if user_id is None:
        sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if sess:
            expires_at = sess.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at and expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Session expired")
            user_id = sess["user_id"]

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        await ensure_admin_seeded()
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    pub = _public_user(user)
    org = await db.organizations.find_one({"id": pub.get("active_org_id")}, {"_id": 0, "admins_see_all": 1})
    pub["admins_see_all"] = bool(org and org.get("admins_see_all", False))
    return pub


async def _build_user(name, email, password_hash=None, picture="", provider="password", organization_name=None):
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    active_org_id, org_ids = await create_user_workspaces(user_id, name, email)
    if organization_name and organization_name.strip():
        await db.organizations.update_one({"id": active_org_id}, {"$set": {"name": organization_name.strip()}})
    doc = {
        "id": user_id,
        "name": name,
        "email": email.lower(),
        "password_hash": password_hash,
        "picture": picture,
        "phone": "",
        "job_title": "Owner",
        "provider": provider,
        "role": "owner",
        "org_ids": org_ids,
        "active_org_id": active_org_id,
        "preferences": {
            "currency": "USD",
            "timezone": "America/New_York",
            "date_format": "MMM d, yyyy",
            "email_notifications": True,
        },
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return doc


@router.post("/register")
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = await _build_user(payload.name.strip(), email, hash_password(payload.password), organization_name=payload.organization_name)
    token = create_access_token(user["id"], email)
    is_secure = os.environ.get("VERCEL") is not None or os.environ.get("NODE_ENV") == "production"
    response.set_cookie("access_token", token, httponly=True, secure=is_secure, samesite="lax", max_age=604800, path="/")
    active_org = await db.organizations.find_one({"id": user["active_org_id"]}, {"_id": 0})
    return {"token": token, "user": _public_user(user), "active_org": active_org}


@router.post("/login")
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        await ensure_admin_seeded()
        user = await db.users.find_one({"email": email})

    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if payload.workspace_id and payload.workspace_id in user.get("org_ids", []):
        await db.users.update_one({"id": user["id"]}, {"$set": {"active_org_id": payload.workspace_id}})
        user["active_org_id"] = payload.workspace_id

    token = create_access_token(user["id"], email)
    is_secure = os.environ.get("VERCEL") is not None or os.environ.get("NODE_ENV") == "production"
    response.set_cookie("access_token", token, httponly=True, secure=is_secure, samesite="lax", max_age=604800, path="/")
    active_org = await db.organizations.find_one({"id": user.get("active_org_id")}, {"_id": 0})
    return {"token": token, "user": _public_user(user), "active_org": active_org}


@router.post("/google/session")
async def google_session():
    raise HTTPException(
        status_code=400,
        detail="Google authentication via Emergent has been removed. Please log in using email and password or configure an independent OAuth provider."
    )


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = _extract_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"success": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/request-access")
async def request_access(payload: dict = Body(...)):
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    role = (payload.get("role") or "member").lower()
    organization_name = (payload.get("organization_name") or "").strip()
    reason = (payload.get("reason") or "").strip()

    if not name or not email:
        raise HTTPException(status_code=400, detail="Full name and email address are required")

    req_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": email,
        "requested_role": role,
        "organization_name": organization_name,
        "reason": reason,
        "status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.access_requests.insert_one(req_doc)

    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "org_id": "system",
        "user_id": "public",
        "user_name": name,
        "user_email": email,
        "event_type": "access_requested",
        "category": "security",
        "target_id": req_doc["id"],
        "target_name": f"Access Request: {role}",
        "details": f"{name} ({email}) requested {role} access for organization '{organization_name or 'Default Workspace'}'",
        "created_at": now_iso()
    })

    req_doc.pop("_id", None)
    return {
        "success": True,
        "message": f"Access request submitted successfully for {name} ({email}). An administrator will review your application.",
        "request": req_doc
    }


@router.post("/demo-login")
async def demo_login(payload: dict = Body(...), response: Response = None):
    demo_mode = os.environ.get("REACT_APP_DEMO_MODE", "").lower() in ("true", "1")
    is_dev = os.environ.get("VERCEL") is None and os.environ.get("NODE_ENV") != "production"
    if not demo_mode and not is_dev:
        raise HTTPException(status_code=403, detail="Demo login is disabled in production.")

    requested_role = (payload.get("role") or "owner").lower()
    await ensure_admin_seeded()

    admin_email = os.environ.get("ADMIN_EMAIL", "demo@six6fix.com").lower().strip()

    if requested_role in ("admin", "enterprise_owner", "owner"):
        user = await db.users.find_one({"email": admin_email})
        if not user:
            user = await _build_user("Demo Admin", admin_email, hash_password("DemoPassword123!"))
        if user and requested_role == "admin" and user.get("role") != "admin":
            await db.users.update_one({"id": user["id"]}, {"$set": {"role": "admin"}})
            user["role"] = "admin"
        elif user and requested_role in ("enterprise_owner", "owner") and user.get("role") != "owner":
            await db.users.update_one({"id": user["id"]}, {"$set": {"role": "owner"}})
            user["role"] = "owner"
    else:  # member
        email = "member@six6fix.com"
        user = await db.users.find_one({"email": email})
        if not user:
            admin_user = await db.users.find_one({"email": admin_email})
            active_org_id = admin_user.get("active_org_id") if admin_user else "org_default"
            uid = f"user_{uuid.uuid4().hex[:12]}"
            user = {
                "id": uid, "name": "Team Member Demo", "email": email,
                "password_hash": hash_password("MemberDemo123!"), "picture": "", "phone": "+1 555-0199",
                "job_title": "Operations Specialist", "provider": "password", "role": "member",
                "org_ids": [active_org_id], "active_org_id": active_org_id,
                "preferences": {"currency": "USD", "timezone": "America/New_York", "date_format": "MMM d, yyyy", "email_notifications": True},
                "created_at": now_iso(), "updated_at": now_iso()
            }
            await db.users.insert_one(user)

    token = create_access_token(user["id"], user["email"])
    if response:
        is_secure = os.environ.get("VERCEL") is not None or os.environ.get("NODE_ENV") == "production"
        response.set_cookie("access_token", token, httponly=True, secure=is_secure, samesite="lax", max_age=604800, path="/")
    active_org = await db.organizations.find_one({"id": user.get("active_org_id")}, {"_id": 0})
    return {"token": token, "user": _public_user(user), "active_org": active_org}
