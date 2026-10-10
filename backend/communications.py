import os
import uuid
import json
import httpx
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Body, Query
from pydantic import BaseModel, EmailStr

from database import db, now_iso
from auth import get_current_user

router = APIRouter(prefix="/communications", tags=["communications"])
webhook_router = APIRouter(prefix="/webhooks", tags=["webhooks"])

def get_provider_config():
    app_base = os.getenv("APP_URL") or "http://localhost:3000"
    return {
        "gmail": {
            "client_id": os.getenv("GMAIL_CLIENT_ID", ""),
            "client_secret": os.getenv("GMAIL_CLIENT_SECRET", ""),
            "redirect_uri": os.getenv("GMAIL_REDIRECT_URI", f"{app_base}/settings?tab=integrations&callback=gmail"),
            "configured": bool(os.getenv("GMAIL_CLIENT_ID") and os.getenv("GMAIL_CLIENT_SECRET")),
        },
        "outlook": {
            "client_id": os.getenv("MICROSOFT_CLIENT_ID", ""),
            "client_secret": os.getenv("MICROSOFT_CLIENT_SECRET", ""),
            "redirect_uri": os.getenv("MICROSOFT_REDIRECT_URI", f"{app_base}/settings?tab=integrations&callback=outlook"),
            "configured": bool(os.getenv("MICROSOFT_CLIENT_ID") and os.getenv("MICROSOFT_CLIENT_SECRET")),
        },
        "whatsapp": {
            "access_token": os.getenv("WHATSAPP_ACCESS_TOKEN", ""),
            "phone_number_id": os.getenv("WHATSAPP_PHONE_NUMBER_ID", ""),
            "business_account_id": os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", ""),
            "verify_token": os.getenv("WHATSAPP_VERIFY_TOKEN", "six6fix_whatsapp_verify_token_2026"),
            "configured": bool(os.getenv("WHATSAPP_ACCESS_TOKEN") and os.getenv("WHATSAPP_PHONE_NUMBER_ID")),
        }
    }


# ---------------- Customer Matching Engine ----------------
async def match_customer_for_communication(org_id: str, email: str = "", phone: str = ""):
    """Matches an incoming email address or phone number to an existing Customer or Lead record."""
    if email:
        clean_email = email.lower().strip()
        customer = await db.customers.find_one({"org_id": org_id, "email": clean_email}, {"_id": 0})
        if customer:
            return {"type": "customer", "record": customer}
        lead = await db.leads.find_one({"org_id": org_id, "email": clean_email}, {"_id": 0})
        if lead:
            return {"type": "lead", "record": lead}
    if phone:
        clean_phone = "".join(filter(str.isdigit, phone))
        if len(clean_phone) >= 7:
            customer = await db.customers.find_one({"org_id": org_id, "phone": {"$regex": clean_phone[-10:]}}, {"_id": 0})
            if customer:
                return {"type": "customer", "record": customer}
            lead = await db.leads.find_one({"org_id": org_id, "phone": {"$regex": clean_phone[-10:]}}, {"_id": 0})
            if lead:
                return {"type": "lead", "record": lead}
    return None


# ---------------- Provider Adapters ----------------
class GmailAdapter:
    @staticmethod
    def get_auth_url(redirect_uri: str) -> str:
        config = get_provider_config()["gmail"]
        params = {
            "client_id": config["client_id"],
            "redirect_uri": redirect_uri or config["redirect_uri"],
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
            "access_type": "offline",
            "prompt": "consent",
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    @staticmethod
    async def exchange_code(code: str, redirect_uri: str):
        config = get_provider_config()["gmail"]
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": config["client_id"],
                    "client_secret": config["client_secret"],
                    "redirect_uri": redirect_uri or config["redirect_uri"],
                    "grant_type": "authorization_code",
                }
            )
            return res.json()

    @staticmethod
    async def send_email(access_token: str, to: str, subject: str, body: str):
        """Sends an email using Google Gmail API v1."""
        if not access_token:
            return {"success": False, "error": "Gmail access token missing."}
        import base64
        message_str = f"To: {to}\r\nSubject: {subject}\r\n\r\n{body}"
        raw = base64.urlsafe_b64encode(message_str.encode("utf-8")).decode("utf-8")
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"raw": raw}
            )
            return res.json()


class OutlookAdapter:
    @staticmethod
    def get_auth_url(redirect_uri: str) -> str:
        config = get_provider_config()["outlook"]
        params = {
            "client_id": config["client_id"],
            "redirect_uri": redirect_uri or config["redirect_uri"],
            "response_type": "code",
            "scope": "offline_access Mail.Send Mail.Read User.Read",
            "response_mode": "query"
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{query}"

    @staticmethod
    async def send_email(access_token: str, to: str, subject: str, body: str):
        """Sends an email using Microsoft Graph API."""
        if not access_token:
            return {"success": False, "error": "Outlook access token missing."}
        payload = {
            "message": {
                "subject": subject,
                "body": {"contentType": "Text", "content": body},
                "toRecipients": [{"emailAddress": {"address": to}}]
            }
        }
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://graph.microsoft.com/v1.0/me/sendMail",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json=payload
            )
            return {"status_code": res.status_code}


class WhatsAppAdapter:
    @staticmethod
    async def send_message(to_phone: str, text: str, template_name: str = None):
        """Sends a message using Meta WhatsApp Business Cloud API."""
        config = get_provider_config()["whatsapp"]
        if not config["configured"]:
            return {"success": False, "error": "WhatsApp Cloud API credentials not configured."}

        phone_number_id = config["phone_number_id"]
        access_token = config["access_token"]
        url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

        if template_name:
            payload = {
                "messaging_product": "whatsapp",
                "to": to_phone,
                "type": "template",
                "template": {"name": template_name, "language": {"code": "en_US"}}
            }
        else:
            payload = {
                "messaging_product": "whatsapp",
                "to": to_phone,
                "type": "text",
                "text": {"body": text}
            }

        async with httpx.AsyncClient() as client:
            res = await client.post(url, headers=headers, json=payload)
            return res.json()


# ---------------- API Endpoints: Integration Accounts ----------------
@router.get("/accounts", tags=["communications"])
async def list_connected_accounts(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    accounts = await db.connected_accounts.find({"org_id": org_id}, {"_id": 0, "access_token": 0, "refresh_token": 0}).to_list(100)
    config = get_provider_config()
    
    return {
        "accounts": accounts,
        "providers_config": {
            "gmail": {"configured": config["gmail"]["configured"], "redirect_uri": config["gmail"]["redirect_uri"]},
            "outlook": {"configured": config["outlook"]["configured"], "redirect_uri": config["outlook"]["redirect_uri"]},
            "whatsapp": {"configured": config["whatsapp"]["configured"]}
        }
    }


@router.post("/accounts/connect-url", tags=["communications"])
async def get_connect_url(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    provider = payload.get("provider", "").lower()
    redirect_uri = payload.get("redirect_uri", "")
    
    if provider == "gmail":
        url = GmailAdapter.get_auth_url(redirect_uri)
    elif provider == "outlook":
        url = OutlookAdapter.get_auth_url(redirect_uri)
    else:
        raise HTTPException(status_code=400, detail="Invalid provider")
        
    return {"url": url}


@router.get("/connect/{provider}", tags=["communications"])
async def connect_provider_redirect(provider: str, redirect_uri: Optional[str] = None):
    p = provider.lower()
    if p == "gmail":
        url = GmailAdapter.get_auth_url(redirect_uri or "")
    elif p == "outlook":
        url = OutlookAdapter.get_auth_url(redirect_uri or "")
    else:
        raise HTTPException(status_code=400, detail="Invalid provider")
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=url)


@router.post("/accounts/{account_id}/disconnect", tags=["communications"])
async def disconnect_account(account_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    res = await db.connected_accounts.delete_one({"id": account_id, "org_id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Connected account not found")
    return {"success": True, "message": "Channel disconnected safely."}


# ---------------- API Endpoints: Conversations & Messages ----------------
@router.get("/conversations", tags=["communications"])
async def list_conversations(
    channel: Optional[str] = None,
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    assigned_user_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    org_id = user["active_org_id"]
    query = {"org_id": org_id}
    if channel: query["channel"] = channel
    if status: query["status"] = status
    if customer_id: query["customer_id"] = customer_id
    if assigned_user_id: query["assigned_user_id"] = assigned_user_id

    conversations = await db.conversations.find(query, {"_id": 0}).sort("last_message_at", -1).to_list(200)
    return {"conversations": conversations, "total": len(conversations)}


@router.get("/conversations/{conversation_id}", tags=["communications"])
async def get_conversation_detail(conversation_id: str, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    conv = await db.conversations.find_one({"id": conversation_id, "org_id": org_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = await db.communication_messages.find({"conversation_id": conversation_id, "org_id": org_id}, {"_id": 0}).sort("timestamp", 1).to_list(500)
    notes = await db.communication_notes.find({"conversation_id": conversation_id, "org_id": org_id}, {"_id": 0}).sort("created_at", 1).to_list(100)

    # Fetch context customer details if linked
    customer = None
    if conv.get("customer_id"):
        customer = await db.customers.find_one({"id": conv["customer_id"], "org_id": org_id}, {"_id": 0})

    return {
        "conversation": conv,
        "messages": messages,
        "notes": notes,
        "customer": customer
    }


class SendMessagePayload(BaseModel):
    channel: str  # "email" or "whatsapp"
    recipient: str  # email or phone number
    subject: Optional[str] = ""
    body: str


@router.post("/conversations/{conversation_id}/messages", tags=["communications"])
async def send_outbound_message(conversation_id: str, payload: SendMessagePayload, user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    conv = await db.conversations.find_one({"id": conversation_id, "org_id": org_id}, {"_id": 0})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    channel = payload.channel.lower()
    msg_id = str(uuid.uuid4())
    
    # Send via active provider adapter
    if channel == "email":
        account = await db.connected_accounts.find_one({"org_id": org_id, "provider": {"$in": ["gmail", "outlook"]}}, {"_id": 0})
        token = account.get("access_token", "") if account else ""
        if account and account.get("provider") == "gmail":
            await GmailAdapter.send_email(token, payload.recipient, payload.subject, payload.body)
        elif account and account.get("provider") == "outlook":
            await OutlookAdapter.send_email(token, payload.recipient, payload.subject, payload.body)
    elif channel == "whatsapp":
        await WhatsAppAdapter.send_message(payload.recipient, payload.body)

    # Store message in DB
    msg_doc = {
        "id": msg_id,
        "org_id": org_id,
        "conversation_id": conversation_id,
        "channel": channel,
        "direction": "outbound",
        "sender": user.get("email") or user.get("name") or "Six6Fix System",
        "recipients": [payload.recipient],
        "subject": payload.subject,
        "body": payload.body,
        "status": "sent",
        "timestamp": now_iso(),
        "created_at": now_iso()
    }
    await db.communication_messages.insert_one(msg_doc)

    # Update conversation last message timestamp
    await db.conversations.update_one(
        {"id": conversation_id, "org_id": org_id},
        {"$set": {"last_message_at": now_iso(), "status": "waiting_reply", "updated_at": now_iso()}}
    )

    msg_doc.pop("_id", None)
    return {"success": True, "message": msg_doc}


@router.post("/conversations/{conversation_id}/notes", tags=["communications"])
async def add_internal_note(conversation_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    note_text = payload.get("note", "").strip()
    if not note_text:
        raise HTTPException(status_code=400, detail="Note content required")

    note_doc = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "conversation_id": conversation_id,
        "author_id": user["id"],
        "author_name": user.get("name", "Team Member"),
        "note": note_text,
        "created_at": now_iso()
    }
    await db.communication_notes.insert_one(note_doc)
    note_doc.pop("_id", None)
    return {"success": True, "note": note_doc}


@router.post("/conversations/{conversation_id}/assign", tags=["communications"])
async def assign_conversation(conversation_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    assigned_user_id = payload.get("assigned_user_id", "")
    await db.conversations.update_one(
        {"id": conversation_id, "org_id": org_id},
        {"$set": {"assigned_user_id": assigned_user_id, "updated_at": now_iso()}}
    )
    return {"success": True, "assigned_user_id": assigned_user_id}


@router.post("/conversations/{conversation_id}/status", tags=["communications"])
async def update_conversation_status(conversation_id: str, payload: dict = Body(...), user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    status = payload.get("status", "open")
    await db.conversations.update_one(
        {"id": conversation_id, "org_id": org_id},
        {"$set": {"status": status, "updated_at": now_iso()}}
    )
    return {"success": True, "status": status}


@router.post("/sync", tags=["communications"])
async def manual_sync_channels(user: dict = Depends(get_current_user)):
    org_id = user["active_org_id"]
    accounts = await db.connected_accounts.find({"org_id": org_id}, {"_id": 0}).to_list(50)
    for acc in accounts:
        await db.connected_accounts.update_one(
            {"id": acc["id"], "org_id": org_id},
            {"$set": {"last_sync_at": now_iso(), "status": "active"}}
        )
    return {"success": True, "synced_accounts_count": len(accounts), "synced_at": now_iso()}


# ---------------- Webhook Verification & Events ----------------
@webhook_router.get("/whatsapp", tags=["webhooks"])
async def verify_whatsapp_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")
    verify_token = get_provider_config()["whatsapp"]["verify_token"]

    if mode == "subscribe" and token == verify_token:
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@webhook_router.post("/whatsapp", tags=["webhooks"])
async def handle_whatsapp_webhook(payload: dict = Body(...)):
    """Inbound Meta WhatsApp Webhook Message & Event Processing."""
    try:
        entries = payload.get("entry", [])
        for entry in entries:
            changes = entry.get("changes", [])
            for change in changes:
                value = change.get("value", {})
                messages = value.get("messages", [])
                for msg in messages:
                    sender_phone = msg.get("from", "")
                    body = msg.get("text", {}).get("body", "")
                    msg_id = msg.get("id", str(uuid.uuid4()))
                    
                    # Store inbound event safely
                    event_doc = {
                        "id": str(uuid.uuid4()),
                        "provider": "whatsapp",
                        "provider_event_id": msg_id,
                        "sender_phone": sender_phone,
                        "body": body,
                        "received_at": now_iso()
                    }
                    await db.provider_events.insert_one(event_doc)
    except Exception as e:
        print(f"[WhatsApp Webhook Error]: {e}")
    return {"status": "success"}
