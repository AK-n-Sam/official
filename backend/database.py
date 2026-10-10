import os
import socket
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

demo_mode = os.environ.get("DEMO_MODE", "true").lower() not in ("false", "0", "no", "off")
mongo_url_env = os.environ.get("MONGO_URL")

if not demo_mode and not mongo_url_env:
    raise RuntimeError("MONGO_URL environment variable must be set in production mode (DEMO_MODE=false)")

mongo_url = mongo_url_env or "mongodb://localhost:27017"
db_name = os.environ.get("DB_NAME", "official_db")


def _is_mongo_reachable(host="127.0.0.1", port=27017, timeout=1.0):
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        s.close()
        return True
    except Exception:
        return False


if "localhost" not in mongo_url and "127.0.0.1" not in mongo_url:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
elif _is_mongo_reachable():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
elif not demo_mode:
    raise RuntimeError(f"Could not connect to MongoDB at {mongo_url} in production mode (DEMO_MODE=false)")
else:
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()
    db = client[db_name]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
