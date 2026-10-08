import os
import socket
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME", "official_db")

is_production = os.environ.get("NODE_ENV") == "production" or os.environ.get("RENDER") is not None

def _is_mongo_reachable(url_str: str) -> bool:
    if not url_str:
        return False
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url_str)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 27017
        s = socket.create_connection((host, port), timeout=0.5)
        s.close()
        return True
    except Exception:
        return False

if not mongo_url:
    if is_production:
        raise RuntimeError("MONGO_URL environment variable is required in production environments.")
    mongo_url = "mongodb://localhost:27017"

if is_production or _is_mongo_reachable(mongo_url):
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
else:
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()
    db = client[db_name]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
