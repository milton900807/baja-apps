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
import re
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
        # WHAT IT COST, beside how often it ran. An action is not a unit of anything: a
        # paragraph read and a genome-wide screen are both one. This table holds the tokens
        # the model actually billed and what they came to, per user, day, feature and model.
        # Money is kept as WHOLE MICRO-DOLLARS -- adding fractions of a cent a few hundred
        # thousand times is exactly where floating point stops being harmless.
        con.execute(
            "CREATE TABLE IF NOT EXISTS spend ("
            "email TEXT NOT NULL, day TEXT NOT NULL, feature TEXT NOT NULL, model TEXT NOT NULL, "
            "calls INTEGER NOT NULL DEFAULT 0, "
            "in_tok INTEGER NOT NULL DEFAULT 0, out_tok INTEGER NOT NULL DEFAULT 0, "
            "cache_w INTEGER NOT NULL DEFAULT 0, cache_r INTEGER NOT NULL DEFAULT 0, "
            "micro_usd INTEGER NOT NULL DEFAULT 0, "
            "PRIMARY KEY(email, day, feature, model))"
        )
        con.execute("CREATE INDEX IF NOT EXISTS spend_by_day ON spend(email, day)")
    except Exception:
        con.close()
        return None
    return con


# ---------------------------------------------------------------- what a credit is
# ONE CREDIT IS ONE US CENT of model usage. A credit is worth stating in the unit it is
# actually spent in, so that "42 credits" can be checked against a bill rather than taken on
# trust. Everything below counts in micro-dollars and divides at the edge.
MICRO_USD_PER_CREDIT = 10000

# US dollars per MILLION tokens, input and output. Anthropic's published list prices.
# A model this does not know is charged at DEFAULT_PRICE and flagged in the report rather
# than counted as free -- a silent zero is the one answer that is certainly wrong. Override
# the whole table without a deploy by setting CLAUDE_PRICES_JSON to {"model": [in, out]}.
PRICES = {
    "claude-opus-5": (15.0, 75.0),
    "claude-opus-4-5": (15.0, 75.0),
    "claude-opus-4-1": (15.0, 75.0),
    "claude-opus-4": (15.0, 75.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-sonnet-4": (3.0, 15.0),
    "claude-fable-5-1": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-3-5-haiku": (0.8, 4.0),
}
DEFAULT_PRICE = (3.0, 15.0)

# Cached input is not priced like fresh input: writing to the cache costs more than reading
# from it costs less. Both are multiples of the model's own input price.
CACHE_WRITE_MULTIPLIER = 1.25
CACHE_READ_MULTIPLIER = 0.10


def _prices():
    raw = os.environ.get("CLAUDE_PRICES_JSON") or ""
    if not raw:
        return PRICES
    try:
        import json as _json
        over = _json.loads(raw)
        table = dict(PRICES)
        for k, v in (over or {}).items():
            table[str(k).strip().lower()] = (float(v[0]), float(v[1]))
        return table
    except Exception:
        return PRICES


def price_of(model):
    """(input, output) dollars per million tokens, and whether the model was recognised."""
    m = ("" + (model or "")).strip().lower()
    table = _prices()
    if m in table:
        return table[m][0], table[m][1], True
    # "claude-haiku-4-5-20251001" is the same model as "claude-haiku-4-5": a dated release
    # should not fall to the default price just for carrying its date.
    for k in sorted(table, key=len, reverse=True):
        if m.startswith(k):
            return table[k][0], table[k][1], True
    return DEFAULT_PRICE[0], DEFAULT_PRICE[1], False


def cost_micro_usd(model, in_tok=0, out_tok=0, cache_w=0, cache_r=0):
    """What one call came to, in whole micro-dollars, rounded up so nothing bills as free."""
    pin, pout, _known = price_of(model)
    try:
        usd = (float(in_tok or 0) * pin
               + float(cache_w or 0) * pin * CACHE_WRITE_MULTIPLIER
               + float(cache_r or 0) * pin * CACHE_READ_MULTIPLIER
               + float(out_tok or 0) * pout) / 1000000.0
    except Exception:
        return 0
    micro = int(usd * 1000000.0 + 0.999)
    return max(0, micro)


def credits_of(micro_usd):
    """Micro-dollars as credits, to two places -- a short call is worth a fraction of one."""
    try:
        return round(int(micro_usd or 0) / float(MICRO_USD_PER_CREDIT), 2)
    except Exception:
        return 0.0


def normalize_email(e):
    return ("" + (e or "")).strip().lower()


def caller_email(explicit=None):
    """The user this request belongs to: an explicit value, else the env identity.

    SENDER_USER_EMAIL FIRST, and it matters. SENDER_USER_ID is whichever form the route that
    set it chose -- baja-server encrypts the x-user-id header on one path and decrypts it on
    another -- so metering keyed on it recorded one person under two different strings, and
    the report, which asks by address, matched neither. SENDER_USER_EMAIL is the address,
    always, whatever arrived. The old variable is still read so a tool running against an
    older server keeps counting; a ciphertext is simply refused rather than stored as if it
    were a user, because a row nobody can look up is worse than no row."""
    e = normalize_email(explicit or os.environ.get("SENDER_USER_EMAIL") or "")
    if e:
        return e
    fallback = normalize_email(explicit or os.environ.get("SENDER_USER_ID")
                               or os.environ.get("USER_EMAIL") or "")
    if fallback and "@" not in fallback and re.match(r"^[0-9a-f]{32,}$", fallback):
        return ""          # an encrypted identity: not something the report can ask for
    return fallback


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


def record(feature="claude", model="", input_tokens=0, output_tokens=0,
           cache_write_tokens=0, cache_read_tokens=0, email=None, day=None):
    """Record what ONE answered Claude call cost the caller. Returns micro-dollars, 0 if it
    could not be recorded. Never raises -- metering must not be able to break a request."""
    try:
        em = caller_email(email)
        if not em:
            return 0
        it = max(0, int(input_tokens or 0))
        ot = max(0, int(output_tokens or 0))
        cw = max(0, int(cache_write_tokens or 0))
        cr = max(0, int(cache_read_tokens or 0))
        if not (it or ot or cw or cr):
            return 0
        micro = cost_micro_usd(model, it, ot, cw, cr)
        con = _conn()
        if not con:
            return 0
        d = day or _today()
        f = normalize_email(feature)[:64] or "claude"
        m = ("" + (model or "unknown")).strip().lower()[:64] or "unknown"
        with con:
            con.execute(
                "INSERT INTO spend(email, day, feature, model, calls, in_tok, out_tok, "
                "cache_w, cache_r, micro_usd) VALUES(?,?,?,?,1,?,?,?,?,?) "
                "ON CONFLICT(email, day, feature, model) DO UPDATE SET "
                "calls = calls + 1, in_tok = in_tok + ?, out_tok = out_tok + ?, "
                "cache_w = cache_w + ?, cache_r = cache_r + ?, micro_usd = micro_usd + ?",
                (em, d, f, m, it, ot, cw, cr, micro, it, ot, cw, cr, micro),
            )
        con.close()
        return micro
    except Exception:
        return 0


_SEEN_RESPONSES = set()


def record_response(data, model=None, feature=None, email=None):
    """Record one Anthropic Messages response. Returns micro-dollars, 0 if nothing was
    recorded. The response id is remembered for the life of the process, so the same answer
    cannot be counted twice when both the adapter and the HTTP meter see it."""
    try:
        if not isinstance(data, dict):
            return 0
        u = data.get("usage") or {}
        if not isinstance(u, dict):
            return 0
        rid = str(data.get("id") or "")
        if rid:
            if rid in _SEEN_RESPONSES:
                return 0
            _SEEN_RESPONSES.add(rid)
            if len(_SEEN_RESPONSES) > 4096:
                _SEEN_RESPONSES.clear()
                _SEEN_RESPONSES.add(rid)
        return record(
            feature=feature or _script_feature(),
            model=model or data.get("model") or "",
            input_tokens=u.get("input_tokens") or 0,
            output_tokens=u.get("output_tokens") or 0,
            cache_write_tokens=u.get("cache_creation_input_tokens") or 0,
            cache_read_tokens=u.get("cache_read_input_tokens") or 0,
            email=email,
        )
    except Exception:
        return 0


def _script_feature():
    """The running tool's own name -- the same label bump() is called with by hand. A name
    that is not one (a REPL is argv[0] "-", a dash reads as a missing row in the report) is
    called what it is instead."""
    try:
        import sys
        name = os.path.splitext(os.path.basename(sys.argv[0] or ""))[0]
        return name if re.match(r"^[A-Za-z0-9][A-Za-z0-9._-]*$", name or "") else "claude"
    except Exception:
        return "claude"


def install_http_meter():
    """Count what every Anthropic call costs, wherever it is made from.

    Most of the python tools do not go through the adapter -- they post to the Messages API
    themselves, two dozen of them -- so metering them one file at a time would mean two dozen
    edits and a standing invitation to forget the next one. This wraps requests.post instead
    and notices the answers that came from Anthropic. It changes nothing about the request or
    the response; it reads the usage block on the way past and writes it down. Installed once
    per process from ion.works, so every spawned tool has it. Never raises."""
    try:
        import requests  # noqa
    except Exception:
        return False
    try:
        if getattr(requests, "__baja_usage_metered", False):
            return True

        def _wrap(fn, bound):
            def inner(*a, **kw):
                r = fn(*a, **kw)
                try:
                    # A STREAMED RESPONSE IS NOT READ HERE. r.json() would pull the whole
                    # body down to look at it, and the caller would then be handed a stream
                    # with nothing left in it. A streaming call goes unmetered rather than
                    # broken; the adapter meters its own.
                    if kw.get("stream"):
                        return r
                    url = ""
                    for cand in (a[1] if bound and len(a) > 1 else (a[0] if a else None),
                                 kw.get("url")):
                        if isinstance(cand, str) and cand:
                            url = cand
                            break
                    if "api.anthropic.com" not in url or getattr(r, "status_code", 0) != 200:
                        return r
                    ctype = ""
                    try:
                        ctype = str((r.headers or {}).get("content-type") or "")
                    except Exception:
                        ctype = ""
                    if "json" not in ctype.lower():
                        return r
                    record_response(r.json())
                except Exception:
                    pass
                return r
            return inner

        requests.post = _wrap(requests.post, False)
        try:
            requests.Session.post = _wrap(requests.Session.post, True)
        except Exception:
            pass
        requests.__baja_usage_metered = True
        return True
    except Exception:
        return False


def _sum_micro(con, email, where, args):
    try:
        cur = con.execute("SELECT COALESCE(SUM(micro_usd),0) FROM spend WHERE email=? " + where,
                          tuple([email] + list(args)))
        return int(cur.fetchone()[0] or 0)
    except Exception:
        return 0


def spend_report(email, days=30):
    """What the user has spent: credits today, this month and in all, with the same split by
    feature and by model, and a day-by-day strip. Shapes match report() so one call can
    carry both."""
    out = {"email": normalize_email(email), "today": _today(),
           "credits_today": 0.0, "credits_month": 0.0, "credits_total": 0.0,
           "usd_today": 0.0, "usd_month": 0.0, "usd_total": 0.0,
           "tokens_today": 0, "tokens_total": 0,
           "by_feature": [], "by_model": [], "daily_credits": [], "unpriced_models": []}
    try:
        if not out["email"]:
            return out
        con = _conn()
        if not con:
            return out
        em = out["email"]
        d0 = _today()
        month = d0[:7]
        micro_today = _sum_micro(con, em, "AND day=?", [d0])
        micro_month = _sum_micro(con, em, "AND day LIKE ?", [month + "%"])
        micro_total = _sum_micro(con, em, "", [])
        out["credits_today"] = credits_of(micro_today)
        out["credits_month"] = credits_of(micro_month)
        out["credits_total"] = credits_of(micro_total)
        out["usd_today"] = round(micro_today / 1000000.0, 4)
        out["usd_month"] = round(micro_month / 1000000.0, 4)
        out["usd_total"] = round(micro_total / 1000000.0, 4)
        try:
            cur = con.execute("SELECT COALESCE(SUM(in_tok+out_tok+cache_w+cache_r),0) "
                              "FROM spend WHERE email=? AND day=?", (em, d0))
            out["tokens_today"] = int(cur.fetchone()[0] or 0)
            cur = con.execute("SELECT COALESCE(SUM(in_tok+out_tok+cache_w+cache_r),0) "
                              "FROM spend WHERE email=?", (em,))
            out["tokens_total"] = int(cur.fetchone()[0] or 0)
        except Exception:
            pass
        # BY FEATURE, over the whole month rather than the day: a report that is empty until
        # someone has used the application this morning says nothing about what they spend.
        for f, calls, micro, tok in con.execute(
                "SELECT feature, SUM(calls), SUM(micro_usd), SUM(in_tok+out_tok+cache_w+cache_r) "
                "FROM spend WHERE email=? AND day LIKE ? GROUP BY feature "
                "ORDER BY SUM(micro_usd) DESC LIMIT 20", (em, month + "%")):
            out["by_feature"].append({"feature": f, "calls": int(calls or 0),
                                      "credits": credits_of(micro), "tokens": int(tok or 0)})
        for m, calls, micro in con.execute(
                "SELECT model, SUM(calls), SUM(micro_usd) FROM spend WHERE email=? AND day LIKE ? "
                "GROUP BY model ORDER BY SUM(micro_usd) DESC LIMIT 12", (em, month + "%")):
            known = price_of(m)[2]
            out["by_model"].append({"model": m, "calls": int(calls or 0),
                                    "credits": credits_of(micro), "priced": bool(known)})
            if not known and m not in out["unpriced_models"]:
                out["unpriced_models"].append(m)
        try:
            days = max(1, min(366, int(days)))
        except Exception:
            days = 30
        start = (datetime.date.today() - datetime.timedelta(days=days - 1)).isoformat()
        rows = {}
        for day, micro in con.execute(
                "SELECT day, SUM(micro_usd) FROM spend WHERE email=? AND day>=? GROUP BY day",
                (em, start)):
            rows[day] = int(micro or 0)
        for i in range(days):
            dd = (datetime.date.today() - datetime.timedelta(days=days - 1 - i)).isoformat()
            out["daily_credits"].append({"day": dd, "credits": credits_of(rows.get(dd, 0))})
        con.close()
    except Exception:
        pass
    return out


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
