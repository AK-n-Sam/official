"""Automation logic that needs no database: schedule maths, time slots, keyword categories, redaction."""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("AUTOMATION_DISABLED", "1")
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from automation import rules, core  # noqa: E402
from integrations import secrets  # noqa: E402


def test_monthly_keeps_its_day_through_short_months():
    d, seen = "2026-01-31", []
    for _ in range(4):
        d = rules.next_date(d, "monthly", 31)
        seen.append(d)
    assert seen == ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]


def test_other_frequencies():
    assert rules.next_date("2026-12-28", "weekly", 28) == "2027-01-04"
    assert rules.next_date("2026-11-30", "quarterly", 30) == "2027-02-28"
    assert rules.next_date("2028-02-29", "yearly", 29) == "2029-02-28"


def test_time_slots_are_stable_within_a_window_and_change_across_it():
    a = datetime(2026, 10, 1, 9, 14, tzinfo=timezone.utc)
    b = datetime(2026, 10, 1, 9, 1, tzinfo=timezone.utc)
    c = datetime(2026, 10, 1, 9, 16, tzinfo=timezone.utc)
    q = core.every(15)
    assert q(a) == q(b) != q(c)
    assert core.daily(a) == "2026-10-01" and core.weekly(a) == "2026-W40"
    six = rules.every_hours(6)
    assert six(a) == six(datetime(2026, 10, 1, 6, 0, tzinfo=timezone.utc)) != six(datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc))


def test_keyword_categories():
    assert rules.keyword_category("AMAZON WEB SERVICES AWS.AMAZON.CO") == "Software"
    assert rules.keyword_category("Uber *Trip help.uber.com") == "Travel"
    assert rules.keyword_category("CITY WATER & SEWER") == "Utilities"
    assert rules.keyword_category("Monthly fee") == "Bank fees"
    assert rules.keyword_category("ACME WIDGETS LTD 4471") == ""


def test_redaction_removes_configured_and_unknown_secrets(monkeypatch):
    key = "sk-proj-THISISASECRETVALUE1234567890abcdef"
    monkeypatch.setenv("OPENAI_API_KEYS", key)
    out = secrets.redact(f"Incorrect API key provided: {key}. Also Bearer abcdefghijklmnopqrstuvwxyz123 and AIzaSyA1234567890abcdefghijklmnop")
    assert key not in out and "abcdefghijklmnopqrstuvwxyz123" not in out and "AIzaSyA1234567890abcdefghijklmnop" not in out
    assert secrets.mask(key) == "sk-p…cdef"
    assert len(secrets.fingerprint(key)) == 12 and key not in secrets.fingerprint(key)


def test_real_keys_are_never_in_tracked_files():
    """Each configured key must exist only in the git-ignored .env, never in any source file."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    keys = [k for p in secrets.POOL_ENV for k in secrets.keys_for(p)]
    if not keys:
        return
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", ".venv", "build", "__pycache__")]
        for f in files:
            if f == ".env" or not f.endswith((".py", ".js", ".jsx", ".json", ".md", ".example", ".txt", ".html", ".yml", ".yaml", ".ini")):
                continue
            text = open(os.path.join(base, f), encoding="utf-8", errors="ignore").read()
            assert not any(k in text for k in keys), f"API key found in {os.path.join(base, f)}"
