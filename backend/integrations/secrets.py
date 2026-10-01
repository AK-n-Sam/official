"""Provider credentials: read from environment variables only, identified by a fingerprint, shown
masked, and scrubbed from any text that might be logged or stored."""
import hashlib
import os
import re

# Comma-separated key pools, one variable per provider.
POOL_ENV = {"openai": "OPENAI_API_KEYS", "gemini": "GEMINI_API_KEYS", "openrouter": "OPENROUTER_API_KEYS"}


def keys_for(provider: str) -> list:
    raw = os.environ.get(POOL_ENV.get(provider, ""), "")
    seen, out = set(), []
    for k in (x.strip() for x in raw.split(",")):
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


def fingerprint(key: str) -> str:
    """Stable id for a key that reveals nothing about it."""
    return hashlib.sha256(key.encode()).hexdigest()[:12]


def mask(key: str) -> str:
    return f"{key[:4]}…{key[-4:]}" if len(key) > 12 else "…"


# Shapes of common provider secrets, in case one arrives in an error message we didn't expect.
_PATTERNS = [re.compile(p) for p in (r"sk-[A-Za-z0-9_\-]{16,}", r"AIza[0-9A-Za-z_\-]{20,}", r"AQ\.[A-Za-z0-9_\-]{20,}",
                                    r"(?i)bearer\s+[A-Za-z0-9._\-]{16,}", r"key=[A-Za-z0-9._\-]{16,}")]


def redact(text) -> str:
    """Remove every configured secret (and anything shaped like one) from text."""
    s = str(text or "")
    for provider in POOL_ENV:
        for k in keys_for(provider):
            s = s.replace(k, mask(k))
    for extra in ("PLAID_SECRET", "JWT_SECRET", "ADMIN_PASSWORD"):
        v = os.environ.get(extra, "")
        if len(v) >= 6:
            s = s.replace(v, "[secret]")
    for p in _PATTERNS:
        s = p.sub(lambda m: m.group(0)[:6] + "…[redacted]", s)
    return s[:2000]
