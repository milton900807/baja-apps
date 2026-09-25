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
import json
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


# ---------------------------------------------------------------- the free allowance
# WHAT A NON-SUBSCRIBER GETS BEFORE BEING ASKED TO PAY: ten dollars of model usage, which
# is a thousand credits. Not per month -- a trial is a trial, and an allowance that refills
# is a plan. A subscriber is never metered against it, and neither is a caller the server
# could not identify: refusing work over an identity we do not have is the one failure mode
# worse than letting a stranger through.
FREE_CREDIT_LIMIT = 1000.0          # credits; 1000 credits = $10.00

FREE_LIMIT_MESSAGE = (
    "You have used the $10 of AI credits that come with the free plan. "
    "Subscribe to keep going — everything you have made stays where it is."
)


def free_credit_limit():
    try:
        v = float(os.environ.get("FREE_CREDIT_LIMIT") or FREE_CREDIT_LIMIT)
        return v if v > 0 else FREE_CREDIT_LIMIT
    except Exception:
        return FREE_CREDIT_LIMIT


def _subscribed(email):
    try:
        from ion import works as _w
        return bool(_w.has_active_subscription(email))
    except Exception:
        # A subscription check that cannot run must not turn a paying user away.
        return True


def allowance(email=None):
    """Where this user stands against the free allowance.

    {email, subscribed, used, limit, remaining, blocked}. `blocked` is the only field a
    caller has to act on, and it is False for a subscriber, for an unidentified caller, and
    whenever anything at all goes wrong -- the meter is not a gate it can fail closed on."""
    em = caller_email(email)
    out = {"email": em, "subscribed": False, "used": 0.0,
           "limit": free_credit_limit(), "remaining": free_credit_limit(), "blocked": False}
    if not em:
        return out
    try:
        if _subscribed(em):
            out["subscribed"] = True
            return out
        con = _conn()
        if not con:
            return out
        micro = con.execute("SELECT COALESCE(SUM(micro_usd),0) FROM spend WHERE email=?",
                            (em,)).fetchone()[0] or 0
        con.close()
        used = credits_of(micro)
        out["used"] = used
        out["remaining"] = round(max(0.0, out["limit"] - used), 2)
        out["blocked"] = used >= out["limit"]
    except Exception:
        out["blocked"] = False
    return out


def _gate_path():
    bd = os.environ.get("BIGDATA") or ""
    return os.path.join(bd, "credit-gate.json") if bd else None


def publish_gate():
    """Write what the SERVER needs to refuse a call before it spawns anything.

    The /py route answers the moment it has started a script -- the output is streamed to a
    file and polled -- so a 402 has to be decided before the spawn, and node has no way to
    read this sqlite. So the three facts it needs are published beside it as plain JSON:
    what each user has spent, what the allowance is, and WHICH SCRIPTS SPEND IT.

    That last one maintains itself. Every spend row is labelled with the script that made the
    call, so the set of Claude-powered tools is not a list anybody has to keep up to date --
    it is the set of scripts that have ever billed a token. A tool nobody has run yet is not
    gated, which is the right way round: it has not cost anyone anything.

    Best-effort and never raises; a missing file means the server lets everything through."""
    path = _gate_path()
    if not path:
        return False
    try:
        con = _conn()
        if not con:
            return False
        balances = {}
        for em, micro in con.execute("SELECT email, SUM(micro_usd) FROM spend GROUP BY email"):
            if em:
                balances[em] = credits_of(micro)
        scripts = sorted({str(f).split(":", 1)[0] for (f,) in
                          con.execute("SELECT DISTINCT feature FROM spend") if f})
        con.close()
        body = {"limit": free_credit_limit(), "balances": balances,
                "ai_scripts": scripts, "written": datetime.datetime.now().isoformat(timespec="seconds")}
        tmp = path + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(body, fh)
        os.replace(tmp, path)          # so a reader never sees half a file
        return True
    except Exception:
        return False


class FreeLimitReached(Exception):
    """Raised in place of a Claude request once the free allowance is spent."""
    def __init__(self, info=None):
        Exception.__init__(self, FREE_LIMIT_MESSAGE)
        self.info = info or {}
        self.free_limit = True


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
        # Keep the server's copy in step. It is a small file and this is the only place the
        # numbers in it change.
        try:
            publish_gate()
        except Exception:
            pass
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

        def _anthropic_url(a, kw, bound):
            try:
                for cand in (a[1] if bound and len(a) > 1 else (a[0] if a else None), kw.get("url")):
                    if isinstance(cand, str) and cand and "api.anthropic.com" in cand:
                        return True
            except Exception:
                pass
            return False

        def _wrap(fn, bound):
            def inner(*a, **kw):
                # THE GATE SITS WHERE THE METER SITS, and for the same reason: two dozen tools
                # post to the Messages API themselves, and a check written into each of them
                # is a check somebody forgets. Refused BEFORE the request goes out, so a user
                # who is out of credits is never charged for the call that tells them so.
                if _anthropic_url(a, kw, bound):
                    try:
                        st = allowance()
                    except Exception:
                        st = None
                    if st and st.get("blocked"):
                        raise FreeLimitReached(st)
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


def _rates(con):
    """What a call of each feature has COST, on average, from every measured call there is.

    Measured rows are the only evidence available about what an unmeasured call was worth, and
    one user's handful of them is a poor sample -- so the averages are taken across everybody.
    Returns ({feature: micro_usd_per_call}, overall_micro_usd_per_call)."""
    per, overall = {}, 0
    try:
        tot_micro = tot_calls = 0
        for f, calls, micro in con.execute(
                "SELECT feature, SUM(calls), SUM(micro_usd) FROM spend GROUP BY feature"):
            calls = int(calls or 0)
            micro = int(micro or 0)
            tot_calls += calls
            tot_micro += micro
            if calls > 0:
                per[f] = micro / float(calls)
        if tot_calls > 0:
            overall = tot_micro / float(tot_calls)
    except Exception:
        pass
    return per, overall


def estimate_unmeasured(con, email, per_feature_rate, overall_rate):
    """What the actions that were never priced would have cost.

    THE METER COUNTED BEFORE IT PRICED. Actions have been recorded per user, day and feature
    since August; the tokens and the money have only been recorded since the spend table
    existed. So a user's history is a pile of actions with no cost attached, and reporting
    their spend as the measured part alone makes months of real work read as nothing.

    This prices those actions at what the SAME FEATURE has since been measured to cost, per
    call. It is an estimate and the report says so; it is not mixed into the measured figure.
    Returns (micro_usd, actions_priced, [{feature, actions, micro_usd, own_rate}...],
    micro_usd_priced_at_the_overall_average)."""
    out, total, priced = [], 0, 0
    weak = [0]              # the part of the estimate priced at the overall average
    try:
        measured = {}
        for day, feat, calls in con.execute(
                "SELECT day, feature, SUM(calls) FROM spend WHERE email=? GROUP BY day, feature",
                (email,)):
            measured[(day, feat)] = int(calls or 0)
        by_feature = {}
        for day, feat, n in con.execute(
                "SELECT day, feature, SUM(n) FROM usage WHERE email=? GROUP BY day, feature",
                (email,)):
            n = int(n or 0)
            # An action that was measured is not estimated as well. A failed request counts as
            # an action and never reaches the model, so the remainder can only be an upper
            # bound on what is genuinely unpriced -- which is the right direction for it to err.
            left = n - measured.get((day, feat), 0)
            if left <= 0:
                continue
            # THE TWO TABLES DO NOT ALWAYS SPELL A FEATURE THE SAME WAY. A script that meters
            # its own passes by hand bumps a label like "prompt-to-transcript:species", while
            # the spend row it produces is named after the script -- so an exact match misses
            # and most of a history ends up priced at the overall average. The part before the
            # colon is the script, and its rate is the right one for its passes.
            own = per_feature_rate.get(feat)
            if not own and ":" in feat:
                own = per_feature_rate.get(feat.split(":", 1)[0])
            rate = own if own else overall_rate
            if not rate:
                continue
            micro = int(left * rate)
            total += micro
            priced += left
            # A FEATURE NOBODY HAS MEASURED gets the overall average, which is the average of
            # whatever HAS been measured -- and that mix is dominated by the expensive tools.
            # It is the only number available, and the part of the estimate resting on it is
            # tracked so the report can say how much of itself to take on trust.
            if not own:
                weak[0] += micro
            b = by_feature.setdefault(feat, {"feature": feat, "actions": 0, "micro_usd": 0, "own_rate": bool(own)})
            b["actions"] += left
            b["micro_usd"] += micro
        out = sorted(by_feature.values(), key=lambda r: -r["micro_usd"])[:20]
    except Exception:
        pass
    return total, priced, out, weak[0]


def spend_report(email, days=30):
    """What the user has spent: credits today, this month and in all, with the same split by
    feature and by model, and a day-by-day strip. Shapes match report() so one call can
    carry both."""
    out = {"email": normalize_email(email), "today": _today(),
           "credits_today": 0.0, "credits_month": 0.0, "credits_total": 0.0,
           "usd_today": 0.0, "usd_month": 0.0, "usd_total": 0.0,
           "tokens_today": 0, "tokens_total": 0,
           "by_feature": [], "by_model": [], "daily_credits": [], "unpriced_models": [],
           # What the actions recorded before the meter priced anything would have cost, at
           # what the same features have since been measured to cost per call. Kept apart from
           # the measured figures on purpose -- see estimate_unmeasured.
           "credits_estimated": 0.0, "usd_estimated": 0.0,
           "actions_estimated": 0, "estimated_by_feature": [],
           "credits_with_estimate": 0.0, "credits_estimated_weak": 0.0, "estimate_basis": "",
           # Where this user stands against the free allowance (see allowance()).
           "free_limit": 0.0, "free_used": 0.0, "free_remaining": 0.0,
           "subscribed": False, "blocked": False}
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
        # ---- and what the unpriced history would have cost --------------------------------
        try:
            per, overall = _rates(con)
            est_micro, est_actions, est_by, est_weak = estimate_unmeasured(con, em, per, overall)
            out["credits_estimated"] = credits_of(est_micro)
            out["usd_estimated"] = round(est_micro / 1000000.0, 4)
            out["actions_estimated"] = est_actions
            out["estimated_by_feature"] = [
                {"feature": r["feature"], "actions": r["actions"], "credits": credits_of(r["micro_usd"]),
                 "own_rate": bool(r.get("own_rate"))}
                for r in est_by]
            out["credits_estimated_weak"] = credits_of(est_weak)
            out["credits_with_estimate"] = credits_of(micro_total + est_micro)
            if est_actions:
                out["estimate_basis"] = ("priced at what the same features have since been "
                                         "measured to cost per call")
            # The day the meter started pricing: everything before it can only be estimated.
            try:
                first = con.execute("SELECT MIN(day) FROM spend").fetchone()[0]
                if first:
                    out["priced_since"] = first
            except Exception:
                pass
        except Exception:
            pass
        con.close()
        try:
            a = allowance(em)
            out["free_limit"] = a.get("limit") or 0.0
            out["free_used"] = a.get("used") or 0.0
            out["free_remaining"] = a.get("remaining") or 0.0
            out["subscribed"] = bool(a.get("subscribed"))
            out["blocked"] = bool(a.get("blocked"))
        except Exception:
            pass
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
