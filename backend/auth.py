import os
import time
import uuid
import bcrypt
import jwt
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response
import httpx

from database import db, now_iso
from models import RegisterInput, LoginInput, GoogleSessionInput, ChangePasswordInput
from seed import create_user_workspaces

JWT_ALGORITHM = "HS256"
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, version: int = 0) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        # Bumped on password change, which signs out every other session.
        "ver": version,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def _set_auth_cookie(response: Response, name: str, token: str):
    # Lax keeps the cookie off cross-site POSTs (CSRF) while still working for normal navigation.
    response.set_cookie(name, token, httponly=True, secure=True, samesite="lax", max_age=604800, path="/")


# ---- Login throttling: 5 failed attempts per email + IP within 15 minutes ----
_FAILED_LOGINS = defaultdict(deque)
_MAX_FAILED = 5
_WINDOW_SECONDS = 15 * 60


def _throttle_key(request: Request, email: str) -> str:
    host = request.client.host if request.client else "?"
    return f"{email}|{host}"


def _check_throttle(key: str):
    attempts = _FAILED_LOGINS[key]
    cutoff = time.monotonic() - _WINDOW_SECONDS
    while attempts and attempts[0] < cutoff:
        attempts.popleft()
    if len(attempts) >= _MAX_FAILED:
        wait = int((attempts[0] + _WINDOW_SECONDS - time.monotonic()) / 60) + 1
        raise HTTPException(status_code=429, detail=f"Too many failed sign-in attempts. Try again in {wait} minute{'s' if wait != 1 else ''}.")


def workspace_role(user: dict, org: dict) -> str:
    """A user's role in one workspace: its owner, else what they were invited as. Users invited
    before per-workspace roles existed fall back to their old global role (never 'owner')."""
    if not org:
        return "member"
    if org.get("owner_user_id") == user.get("id"):
        return "owner"
    role = (user.get("org_roles") or {}).get(org["id"])
    if role in ("admin", "member"):
        return role
    return user.get("role") if user.get("role") in ("admin", "member") else "member"


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


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_id = None
    token_version = None
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") == "access":
            user_id = payload["sub"]
            token_version = payload.get("ver", 0)
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
        raise HTTPException(status_code=401, detail="User not found")
    if token_version is not None and token_version != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Your session has ended. Please sign in again.")
    pub = _public_user(user)
    org_ids = pub.get("org_ids", [])
    if org_ids and pub.get("active_org_id") not in org_ids:
        # The active workspace was removed from this user: fall back to one they still belong to.
        pub["active_org_id"] = org_ids[0]
        await db.users.update_one({"id": user_id}, {"$set": {"active_org_id": org_ids[0]}})
    org = None
    if pub.get("active_org_id"):
        org = await db.organizations.find_one(
            {"id": pub["active_org_id"]},
            {"_id": 0, "id": 1, "name": 1, "currency": 1, "owner_user_id": 1, "admins_see_all": 1})
    if not org:
        raise HTTPException(status_code=403, detail="You no longer have access to a workspace. Ask an owner to invite you again.")
    # `role` is always the role in the *active* workspace, so every permission check is per-workspace.
    pub["role"] = workspace_role(user, org)
    pub["admins_see_all"] = bool(org.get("admins_see_all", False))
    pub["org_name"] = org.get("name", "")
    pub["org_currency"] = org.get("currency") or "USD"
    pub.pop("org_roles", None)
    pub.pop("token_version", None)
    return pub


async def _build_user(name, email, password_hash=None, picture="", provider="password"):
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    active_org_id, org_ids = await create_user_workspaces(user_id, name, email)
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
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = await _build_user(payload.name, email, hash_password(payload.password))
    token = create_access_token(user["id"], email)
    _set_auth_cookie(response, "access_token", token)
    return {"token": token, "user": _public_user(user)}


@router.post("/login")
async def login(payload: LoginInput, request: Request, response: Response):
    email = payload.email.lower()
    key = _throttle_key(request, email)
    _check_throttle(key)
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        _FAILED_LOGINS[key].append(time.monotonic())
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _FAILED_LOGINS.pop(key, None)
    token = create_access_token(user["id"], email, user.get("token_version", 0))
    _set_auth_cookie(response, "access_token", token)
    return {"token": token, "user": _public_user(user)}


@router.post("/change-password")
async def change_password(payload: ChangePasswordInput, request: Request, response: Response):
    user = await get_current_user(request)
    stored = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 1, "token_version": 1})
    if stored.get("password_hash") and not verify_password(payload.current_password, stored["password_hash"]):
        raise HTTPException(status_code=400, detail="Your current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="Choose a password different from your current one")
    version = stored.get("token_version", 0) + 1
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "password_hash": hash_password(payload.new_password), "token_version": version,
        "must_change_password": False, "updated_at": now_iso()}})
    # Sign out every other session, and hand this one a fresh token.
    await db.user_sessions.delete_many({"user_id": user["id"]})
    token = create_access_token(user["id"], user["email"], version)
    _set_auth_cookie(response, "access_token", token)
    return {"token": token}


@router.post("/google/session")
async def google_session(payload: GoogleSessionInput, response: Response):
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"id": {"$exists": True}, "email": email})
    if not user:
        user = await _build_user(data.get("name", email), email, None, data.get("picture", ""), "google")
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user["id"],
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": now_iso(),
    })
    _set_auth_cookie(response, "session_token", session_token)
    return {"token": session_token, "user": _public_user(user)}


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
