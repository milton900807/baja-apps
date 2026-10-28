"""
Claude-usage metering (per user, per day).

A tiny, dependency-free framework for counting how many times a user runs a Claude-powered
search. Any python tool that calls the Anthropic API records one use with a single line:

    try:
        import claude_usage
        claude_usage.bump("extract-entities")   # feature label (free-form)
    except Exception:
        pass

The caller's identity comes from SENDER_USER_ID (set by baja-server's /py exec bridge from the
signed-in user's x-user-id), so no email needs to be passed in. Counts live in a small SQLite DB
in BIG_DATA (`$BIGDATA/claude_usage.sqlite`), keyed by (email, day, feature). All calls are
best-effort and NEVER raise — metering must never break a user's request.

Read a user's counts with claude_usage.count(email[, day]) or claude_usage.report(email[, days]),
or via the /py tool `py/usage/claude-usage-report.py` (accessible by email address).

This module lives in py/ion-lib (already on the spawned scripts' PYTHONPATH), so `import
claude_usage` works from any tool without extra setup.
"""
import datetime
import os
import sqlite3


def _db_path():
    bd = os.environ.get("BIGDATA") or ""
    if not bd:
        return None
    return os.path.join(bd, "claude_usage.sqlite")


def _conn():
    p = _db_path()
    if not p:
        return None
    con = sqlite3.connect(p, timeout=15)
    try:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA busy_timeout=5000")
        con.execute(
            "CREATE TABLE IF NOT EXISTS usage ("
            "email TEXT NOT NULL, day TEXT NOT NULL, feature TEXT NOT NULL, "
            "n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(email, day, feature))"
        )
    except Exception:
        con.close()
        return None
    return con


def normalize_email(e):
    return ("" + (e or "")).strip().lower()


def caller_email(explicit=None):
    """The user this request belongs to: an explicit value, else the env identity."""
    return normalize_email(explicit or os.environ.get("SENDER_USER_ID")
                           or os.environ.get("USER_EMAIL") or "")


def _today():
    return datetime.date.today().isoformat()


def bump(feature="claude", email=None, day=None):
    """Record ONE Claude search for the caller today. Returns True if counted. Never raises."""
    try:
        em = caller_email(email)
        if not em:
            return False
        con = _conn()
        if not con:
            return False
        d = day or _today()
        f = normalize_email(feature)[:64] or "claude"
        with con:
            con.execute(
                "INSERT INTO usage(email, day, feature, n) VALUES(?,?,?,1) "
                "ON CONFLICT(email, day, feature) DO UPDATE SET n = n + 1",
                (em, d, f),
            )
        con.close()
        return True
    except Exception:
        return False


def count(email, day=None):
    """Total Claude searches for `email` on `day` (default today)."""
    try:
        em = normalize_email(email)
        if not em:
            return 0
        con = _conn()
        if not con:
            return 0
        d = day or _today()
        cur = con.execute("SELECT COALESCE(SUM(n),0) FROM usage WHERE email=? AND day=?", (em, d))
        v = cur.fetchone()[0] or 0
        con.close()
        return int(v)
    except Exception:
        return 0


def report(email, days=7):
    """{email, today, total_today, by_feature_today:{...}, daily:[{day,count}...]} for `email`."""
    out = {"email": normalize_email(email), "today": _today(),
           "total_today": 0, "by_feature_today": {}, "daily": []}
    try:
        if not out["email"]:
            return out
        con = _conn()
        if not con:
            return out
        d0 = _today()
        for f, n in con.execute(
                "SELECT feature, SUM(n) FROM usage WHERE email=? AND day=? GROUP BY feature",
                (out["email"], d0)):
            out["by_feature_today"][f] = int(n or 0)
            out["total_today"] += int(n or 0)
        try:
            days = max(1, min(366, int(days)))
        except Exception:
            days = 7
        start = (datetime.date.today() - datetime.timedelta(days=days - 1)).isoformat()
        rows = {}
        for day, n in con.execute(
                "SELECT day, SUM(n) FROM usage WHERE email=? AND day>=? GROUP BY day",
                (out["email"], start)):
            rows[day] = int(n or 0)
        for i in range(days):
            dd = (datetime.date.today() - datetime.timedelta(days=days - 1 - i)).isoformat()
            out["daily"].append({"day": dd, "count": rows.get(dd, 0)})
        con.close()
    except Exception:
        pass
    return out
