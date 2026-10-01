"""Key-pool failover scenarios A–G against a scripted fake of the provider APIs (no network, no cost)."""
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
K1, K2 = "sk-test-key-one-aaaaaaaaaaaaaaaaaaaa", "sk-test-key-two-bbbbbbbbbbbbbbbbbbbb"
G1 = "AQ.gemini-test-key-cccccccccccccccccccccc"

from integrations import providers, keypool, client  # noqa: E402

CALLS = []      # (provider, key) for every generate request
MODELS = []     # model asked for, per generate request
MODEL_DOWN = set()  # models that answer 404 (retired)
SCRIPT = {}     # key -> list of behaviours, consumed in order; default "ok"
TELEMETRY = []


def reply(provider, text="Hello from the fake"):
    if provider == "gemini":
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}], "usageMetadata": {"totalTokenCount": 7}})
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}], "usage": {"total_tokens": 7}})


def handler(request: httpx.Request):
    url = str(request.url)
    provider = "gemini" if "generativelanguage" in url else "openai"
    key = request.headers.get("x-goog-api-key") or request.headers.get("authorization", "").replace("Bearer ", "")
    if request.method == "GET":  # health-check probe
        return httpx.Response(200, json={"data": []})
    CALLS.append((provider, key))
    model = url.split("/models/")[1].split(":")[0] if provider == "gemini" else json.loads(request.content)["model"]
    MODELS.append(model)
    if model in MODEL_DOWN:
        return httpx.Response(404, json={"error": {"message": f"This model models/{model} is no longer available to new users."}})
    todo = SCRIPT.get(key) or ["ok"]
    what = todo.pop(0) if len(todo) > 1 else todo[0]
    if what == "ok":
        return reply(provider)
    if what == "rate":
        return httpx.Response(429, headers={"retry-after": "20"}, json={"error": {"message": "Rate limit reached for requests", "code": "rate_limit_exceeded"}})
    if what == "rate_no_hint":
        return httpx.Response(429, json={"error": {"message": "Rate limit reached", "code": "rate_limit_exceeded"}})
    if what == "quota":
        return httpx.Response(429, json={"error": {"message": "You exceeded your current quota", "code": "insufficient_quota"}})
    if what == "auth":
        return httpx.Response(401, json={"error": {"message": f"Incorrect API key provided: {key}", "code": "invalid_api_key"}})
    if what == "down":
        return httpx.Response(503, json={"error": {"message": "The server is overloaded"}})
    if what == "timeout":
        raise httpx.ReadTimeout("timed out", request=request)
    if what == "bad":
        return httpx.Response(400, json={"error": {"message": "This model's maximum context length is exceeded"}})
    raise AssertionError(what)


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEYS", f"{K1},{K2}")
    monkeypatch.setenv("GEMINI_API_KEYS", G1)
    monkeypatch.setenv("OPENROUTER_API_KEYS", "")
    providers.TRANSPORT = httpx.MockTransport(handler)
    keypool.use_store(keypool.MemoryStore())
    cfg = {"provider_order": ["openai", "gemini", "openrouter"], "deadline_s": 60}  # explicit order for the scenarios

    async def load():
        return cfg
    client.hooks.load_config = load
    client.forget_config()
    TELEMETRY.clear()

    async def tel(row):
        TELEMETRY.append(row)
    client.hooks.telemetry = tel
    cache = {}

    async def cget(d):
        return cache.get(d)

    async def cput(d, row):
        cache[d] = row
    client.hooks.cache_get, client.hooks.cache_put = cget, cput
    CALLS.clear()
    SCRIPT.clear()
    MODELS.clear()
    MODEL_DOWN.clear()
    providers._working_model.clear()
    real_sleep = asyncio.sleep
    monkeypatch.setattr(client.asyncio, "sleep", lambda s: real_sleep(0))
    yield
    providers.TRANSPORT = None


def run(coro):
    return asyncio.run(coro)


def gen(**kw):
    return run(client.generate_text("Say hello", purpose="test", **kw))


def state(key, provider="openai"):
    return run(keypool.state_of(provider, key))


def test_a_healthy_key_is_used():
    r = gen()
    assert r.provider == "openai" and r.text == "Hello from the fake" and r.key == keypool.mask(K1)
    assert CALLS == [("openai", K1)]


def test_b_rate_limited_key_rests_and_the_next_key_answers():
    SCRIPT[K1] = ["rate", "ok"]
    r = gen()
    assert r.key == keypool.mask(K2)
    st = state(K1)
    assert st["status"] == "cooldown"
    until = datetime.fromisoformat(st["cooldown_until"])
    assert timedelta(seconds=15) < until - datetime.now(timezone.utc) <= timedelta(seconds=20)  # Retry-After honoured
    CALLS.clear()
    gen()
    assert CALLS == [("openai", K2)]  # the resting key isn't tried again during its cooldown


def test_c_quota_exhausted_key_is_parked_until_reset_then_returns():
    SCRIPT[K1] = ["quota", "ok"]
    assert gen().key == keypool.mask(K2)
    st = state(K1)
    assert st["status"] == "quota_exhausted"
    until = datetime.fromisoformat(st["cooldown_until"])
    assert datetime.now(timezone.utc) < until <= datetime.now(timezone.utc) + timedelta(hours=24, minutes=6)
    # Time passes: the reset time is reached, so the key is offered again (healthiest/least-recent ordering).
    run(keypool.store().put("openai", st["key_id"], {"cooldown_until": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}))
    assert any(k == K1 for k, _ in run(keypool.candidates("openai")))


def test_d_invalid_key_is_quarantined_and_not_retried():
    SCRIPT[K1] = ["auth"]
    assert gen().key == keypool.mask(K2)
    assert state(K1)["status"] == "quarantined"
    for _ in range(3):
        gen()
    assert sum(1 for p, k in CALLS if k == K1) == 1  # hit once, never again
    # The secret never reaches stored errors or telemetry.
    assert K1 not in state(K1).get("last_error", "") and all(K1 not in json.dumps(t, default=str) for t in TELEMETRY)
    # While the key is still refused, a health check keeps it set aside...
    run(client.health_check())
    assert state(K1)["status"] == "quarantined"
    # ...and once it's fixed (e.g. re-enabled in the provider's console), the next check brings it back.
    SCRIPT[K1] = ["ok"]
    run(client.health_check())
    assert state(K1)["status"] == "healthy"


def test_health_check_spots_a_valid_key_without_credit():
    """A model list answers even when the account has no credit; only a real request tells."""
    SCRIPT[K1] = ["quota"]
    report = run(client.health_check())
    assert state(K1)["status"] == "quota_exhausted"
    assert next(r for r in report if r["key"] == keypool.mask(K1))["ok"] is False
    assert state(K2)["status"] == "healthy" and state(K2)["successes"] == 1
    CALLS.clear()
    run(client.health_check())
    assert ("openai", K2) not in CALLS  # a key that has answered before isn't charged for every check


def test_e_provider_down_switches_to_the_next_provider():
    SCRIPT[K1] = ["down"]
    SCRIPT[K2] = ["down"]
    r = gen()
    assert r.provider == "gemini" and r.key == keypool.mask(G1)
    # each OpenAI key got one quick retry before the switch
    assert [c for c in CALLS if c[0] == "openai"] == [("openai", K1), ("openai", K1), ("openai", K2), ("openai", K2)]


def test_f_everything_failing_raises_a_clear_unavailable_error():
    for k in (K1, K2, G1):
        SCRIPT[k] = ["quota"]
    with pytest.raises(client.AIUnavailable) as err:
        gen()
    assert len(err.value.reasons) == 3 and all("quota_exhausted" in r for r in err.value.reasons)
    CALLS.clear()
    with pytest.raises(client.AIUnavailable):
        gen()
    assert CALLS == []  # nothing is hammered while every key is parked


def test_g_timeout_is_retried_once_without_duplicating():
    SCRIPT[K1] = ["timeout", "ok"]
    r = gen()
    assert r.key == keypool.mask(K1) and CALLS == [("openai", K1), ("openai", K1)]
    assert state(K1)["status"] == "healthy"  # a single blip doesn't rest the key
    assert [t["ok"] for t in TELEMETRY] == [False, True]


def test_rejected_request_skips_provider_without_blaming_the_key():
    SCRIPT[K1] = ["bad"]
    r = gen()
    assert r.provider == "gemini"
    assert state(K1)["status"] == "healthy" and state(K1).get("consecutive_failures", 0) == 0


def test_repeated_failures_rest_a_key_for_longer(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEYS", K1)  # one OpenAI key; Gemini answers meanwhile
    SCRIPT[K1] = ["rate_no_hint"]
    waits = []
    for _ in range(3):
        assert gen().provider == "gemini"
        st = state(K1)
        until = datetime.fromisoformat(st["cooldown_until"])
        waits.append(round((until - datetime.fromisoformat(st["last_failure_at"])).total_seconds()))
        run(keypool.store().put("openai", st["key_id"], {"cooldown_until": ""}))  # let it be tried again
    assert waits == [30, 60, 120]  # backs off further each time instead of hammering


def test_identical_requests_are_answered_from_cache():
    gen(cache_hours=24)
    CALLS.clear()
    r = gen(cache_hours=24)
    assert r.cached and CALLS == []


def test_status_words():
    SCRIPT[K1] = ["rate"]
    SCRIPT[K2] = ["rate"]
    SCRIPT[G1] = ["auth"]
    with pytest.raises(client.AIUnavailable):
        gen()
    assert run(keypool.provider_status("openai")) == "rate_limited"
    assert run(keypool.provider_status("gemini")) == "auth_error"
    assert run(keypool.provider_status("openrouter")) == "not_configured"


def test_retired_model_falls_through_to_the_next_model_on_the_same_key():
    first, second = providers.DEFAULTS["openai"]["models"][:2]
    MODEL_DOWN.add(first)
    r = gen()
    assert r.provider == "openai" and r.key == keypool.mask(K1) and r.model == second
    assert state(K1)["status"] == "healthy" and state(K1).get("consecutive_failures", 0) == 0  # the key isn't blamed
    MODELS.clear()
    gen()
    assert MODELS == [second]  # the working model is remembered


def test_every_model_unavailable_moves_on_to_the_next_provider():
    MODEL_DOWN.update(providers.DEFAULTS["openai"]["models"])
    r = gen()
    assert r.provider == "gemini"
    assert sum(1 for p, k in CALLS if k == K2) == 0  # a model problem isn't retried on every key
    assert state(K1)["status"] == "healthy"


def _resp(status, body, headers=None):
    return httpx.Response(status, json=body, headers=headers or {})


def test_real_provider_messages_are_classified_correctly():
    c = providers._classify
    # OpenRouter: a model restricted to some apps answers 403. The key is fine.
    assert c("openrouter", _resp(403, {"error": {"message": "thinkingmachines/inkling-small:free is only available on agentic harnesses."}})).kind == "model_unavailable"
    assert c("openrouter", _resp(429, {"error": {"message": "Provider returned error"}})).kind == "model_unavailable"
    assert c("openrouter", _resp(429, {"error": {"message": "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day"}})).kind == "quota_exhausted"
    assert c("openrouter", _resp(429, {"error": {"message": "Rate limit exceeded: free-models-per-min."}})).kind == "rate_limited"
    # OpenAI
    assert c("openai", _resp(429, {"error": {"message": "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/."}})).kind == "quota_exhausted"
    assert c("openai", _resp(429, {"error": {"message": "Rate limit reached for gpt-4.1-mini in organization org-x on requests per min (RPM): Limit 3. Please try again in 20s.", "code": "rate_limit_exceeded"}},
                             {"retry-after": "20"})).kind == "rate_limited"
    assert c("openai", _resp(401, {"error": {"message": "Incorrect API key provided: sk-abc...xyz", "code": "invalid_api_key"}})).kind == "auth_error"
    assert c("openai", _resp(404, {"error": {"message": "The model `gpt-9` does not exist or you do not have access to it."}})).kind == "model_unavailable"
    # Gemini words its per-minute limit like a quota problem; it must only rest the key for the delay given.
    per_min = c("gemini", _resp(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "You exceeded your current quota, please check your plan and billing details.",
                                                "details": [{"violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}, {"retryDelay": "27s"}]}}))
    assert per_min.kind == "rate_limited" and per_min.retry_after == 27
    per_day = c("gemini", _resp(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "You exceeded your current quota, please check your plan and billing details.",
                                                "details": [{"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}, {"retryDelay": "40s"}]}}))
    assert per_day.kind == "quota_exhausted"
    assert c("gemini", _resp(400, {"error": {"message": "API key not valid. Please pass a valid API key.", "details": [{"reason": "API_KEY_INVALID"}]}})).kind == "auth_error"
    assert c("gemini", _resp(404, {"error": {"message": "This model models/gemini-2.5-flash is no longer available to new users."}})).kind == "model_unavailable"
    assert c("gemini", _resp(503, {"error": {"message": "The model is overloaded. Please try again later."}})).kind == "transient"
