"""Provider adapters. Each turns a provider's API into: text out, or a ProviderError whose `kind` says
what went wrong (rate limited, quota, bad credentials, temporary, or a request the provider rejects)."""
import os
import re
import time

import httpx

from integrations.keypool import RATE_LIMITED, QUOTA, AUTH, TRANSIENT, BAD_REQUEST, MODEL
from integrations.secrets import redact

TRANSPORT = None  # tests swap in an httpx.MockTransport

# Models are tried in order; a model that is retired or restricted for this account is skipped and the
# first one that answers is remembered. Small, inexpensive models: the work is short text.
DEFAULTS = {
    "openai": {"base": "https://api.openai.com", "models": ["gpt-4.1-mini", "gpt-5-mini", "gpt-4o-mini"], "label": "OpenAI"},
    "gemini": {"base": "https://generativelanguage.googleapis.com", "models": ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
               "label": "Google Gemini"},
    # A free-tier key can only use free models; "openrouter/free" routes to whichever free model is available.
    "openrouter": {"base": "https://openrouter.ai", "models": ["openrouter/free", "nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free"],
                   "label": "OpenRouter"},
}
PROVIDERS = list(DEFAULTS)
_working_model = {}  # provider -> the last model that answered


class ProviderError(Exception):
    def __init__(self, kind, message, status=None, retry_after=None):
        super().__init__(message)
        self.kind, self.message, self.status, self.retry_after = kind, redact(message), status, retry_after


def base_url(provider):
    return (os.environ.get(f"{provider.upper()}_BASE_URL") or DEFAULTS[provider]["base"]).rstrip("/")


def models_for(provider, override=None):
    """Models to try, in order: an administrator's choice, the environment's, the last one that worked, then the defaults."""
    order = [override, os.environ.get(f"{provider.upper()}_MODEL"), _working_model.get(provider)] + DEFAULTS[provider]["models"]
    return list(dict.fromkeys(m for m in order if m))


def model_for(provider, override=None):
    return models_for(provider, override)[0]


def remember_model(provider, model):
    _working_model[provider] = model


def _retry_after(resp):
    try:
        v = resp.headers.get("retry-after")
        return min(int(float(v)), 3600) if v else None
    except ValueError:
        return None


def _message(resp):
    try:
        data = resp.json()
    except ValueError:
        return resp.text[:300]
    err = data.get("error", data) if isinstance(data, dict) else data
    if isinstance(err, dict):
        return str(err.get("message") or err.get("status") or err)[:500]
    return str(err)[:500]


KEY_WORDS = ("api key", "api_key", "invalid key", "incorrect key", "unauthorized", "unauthenticated", "credential", "expired", "revoked",
             "suspended", "permission denied")
MODEL_WORDS = ("no longer available", "not available", "does not exist", "only available", "not supported", "deprecated",
               "decommissioned", "no endpoints", "model not found", "unknown model")


def _classify(provider, resp):
    """Map an HTTP error from a provider to a failure class. Getting this right matters: a key is only
    quarantined when the error is really about the key, never because one model is retired or restricted."""
    s, msg = resp.status_code, _message(resp)
    low = msg.lower()
    body = resp.text.lower()
    about_key = s == 401 or "api_key_invalid" in body or any(w in low for w in KEY_WORDS)
    if about_key:
        return ProviderError(AUTH, msg, s)
    if s == 404 or any(w in low for w in MODEL_WORDS):
        return ProviderError(MODEL, msg, s)
    if provider == "openrouter" and s in (429, 502, 503) and "provider returned error" in low:
        return ProviderError(MODEL, msg, s)  # the free model's upstream is busy; another model may answer
    flat = re.sub(r"[\s_\-]", "", body)
    out_of_credit = s == 402 or any(w in flat for w in ("insufficientquota", "insufficientcredits", "nocreditsremaining", "creditbalance"))
    if out_of_credit or (s == 403 and "billing" in low):
        return ProviderError(QUOTA, msg, s)
    if s == 403:
        return ProviderError(AUTH, msg, s)
    if s == 429:
        retry = _retry_after(resp)
        m = re.search(r'"retrydelay":\s*"(\d+)', body)
        retry = retry or (int(m.group(1)) if m else None)
        # Per-minute limits pass in seconds; Gemini words them like a quota problem, so check them first.
        if "perminute" in flat or "persecond" in flat or ("perday" not in flat and retry):
            return ProviderError(RATE_LIMITED, msg, s, retry)
        if "perday" in flat or "daily" in low or "billing" in low or "exceeded your current quota" in low:
            return ProviderError(QUOTA, msg, s)
        return ProviderError(RATE_LIMITED, msg, s, retry)
    if s >= 500 or s in (408, 409, 425):
        return ProviderError(TRANSIENT, msg, s)
    return ProviderError(BAD_REQUEST, msg, s)


async def _post(url, headers, payload, timeout):
    try:
        async with httpx.AsyncClient(timeout=timeout, transport=TRANSPORT) as http:
            return await http.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        raise ProviderError(TRANSIENT, "The provider took too long to answer")
    except httpx.HTTPError as e:
        raise ProviderError(TRANSIENT, f"Network problem reaching the provider ({type(e).__name__})")


async def generate(provider, key, prompt, system="", max_tokens=400, json_mode=False, timeout=30, model=None):
    """Returns (text, tokens, model). Raises ProviderError."""
    model = model_for(provider, model)
    if provider in ("openai", "openrouter"):
        url = f"{base_url(provider)}/v1/chat/completions" if provider == "openai" else f"{base_url(provider)}/api/v1/chat/completions"
        headers = {"Authorization": f"Bearer {key}"}
        if provider == "openrouter":
            headers.update({"HTTP-Referer": "https://nexusos.local", "X-Title": "NexusOS"})
        # Free OpenRouter models are often reasoning models that think before answering; give them room (they cost nothing).
        limit = max(max_tokens, 1500) if provider == "openrouter" else max_tokens
        payload = {"model": model, "messages": ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}],
                   "max_completion_tokens" if provider == "openai" else "max_tokens": limit}
        if json_mode and provider == "openai":  # many free OpenRouter models reject it; the prompt asks for JSON anyway
            payload["response_format"] = {"type": "json_object"}
        resp = await _post(url, headers, payload, timeout)
        if resp.status_code != 200:
            raise _classify(provider, resp)
        data = resp.json()
        if data.get("error"):
            raise ProviderError(TRANSIENT, str(data["error"].get("message", "provider error")))
        choices = data.get("choices") or []
        text = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
        if not text.strip():
            raise ProviderError(MODEL, "The model returned an empty answer")
        return text.strip(), int((data.get("usage") or {}).get("total_tokens") or 0), model
    if provider == "gemini":
        url = f"{base_url(provider)}/v1beta/models/{model}:generateContent"
        payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                   "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.3, **({"responseMimeType": "application/json"} if json_mode else {})}}
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        resp = await _post(url, {"x-goog-api-key": key}, payload, timeout)
        if resp.status_code != 200:
            raise _classify(provider, resp)
        data = resp.json()
        parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        text = "".join(p.get("text", "") for p in parts)
        if not text.strip():
            raise ProviderError(MODEL, "The model returned an empty answer")
        return text.strip(), int((data.get("usageMetadata") or {}).get("totalTokenCount") or 0), model
    raise ProviderError(BAD_REQUEST, f"Unknown provider {provider}")


async def probe(provider, key, timeout=15):
    """A free, read-only call that tells whether a key is accepted. Returns latency in ms, or raises."""
    started = time.monotonic()
    urls = {"openai": (f"{base_url('openai')}/v1/models", {"Authorization": f"Bearer {key}"}),
            "gemini": (f"{base_url('gemini')}/v1beta/models?pageSize=1", {"x-goog-api-key": key}),
            "openrouter": (f"{base_url('openrouter')}/api/v1/key", {"Authorization": f"Bearer {key}"})}
    url, headers = urls[provider]
    try:
        async with httpx.AsyncClient(timeout=timeout, transport=TRANSPORT) as http:
            resp = await http.get(url, headers=headers)
    except httpx.TimeoutException:
        raise ProviderError(TRANSIENT, "Health check timed out")
    except httpx.HTTPError as e:
        raise ProviderError(TRANSIENT, f"Network problem ({type(e).__name__})")
    if resp.status_code != 200:
        raise _classify(provider, resp)
    if provider == "openrouter":
        info = (resp.json() or {}).get("data") or {}
        if info.get("limit_remaining") is not None and float(info["limit_remaining"]) <= 0:
            raise ProviderError(QUOTA, "No credit left on this OpenRouter key")
    return int((time.monotonic() - started) * 1000)
