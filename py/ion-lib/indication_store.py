"""
The Indication-market prompt store.

Every prompt typed into Analytics > Build > Indication market is recorded here, in a
structured form, together with the research it led to. A later prompt that asks the same
question is answered from the stored research instead of being researched again (a run costs
about a dollar and two to three minutes). Whether two prompts ask the same question is NOT
decided here: that is a judgement ("HD, siRNA, US" and "Huntington's disease with an siRNA,
United States" are one question; "Huntington's disease" alone is another) and
py/analytics/indication-market.py puts it to the model. This module only keeps the records and
finds the earlier runs worth showing it.

A small SQLite file in BIG_DATA (`$BIGDATA/indication_market.sqlite`), the way claude_usage.py
keeps its counts. Three tables:

  runs      one row per piece of RESEARCH: the prompt as typed, its structured form
            (indications, aliases, target, modality, region, population), the options it ran
            with, and the research itself (findings, the sources the search returned, run info).
            The tables on the canvas are rebuilt from `findings` each time, so a stored run picks
            up any later improvement to the table builder.
  prompts   one row per PROMPT SUBMITTED, whether it was researched or answered from a stored
            run: who, when, the structured form, the decision (new | reused | forced_new |
            error), the run it ended on and the model's one-sentence reason.
  run_keys  the search index: normalised words and aliases -> run, used to pick candidates.

Everything is best-effort and NEVER raises: the store must never be the reason a user's
research fails. With no BIGDATA (a developer's machine) it is simply off, unless
INDICATION_STORE_PATH names a file.

Command line, for a look at what is in it:
    python indication_store.py --stats
    python indication_store.py --recent 20
"""
import datetime
import json
import os
import re
import sqlite3
import sys

# A stored run older than this is never offered for reuse: epidemiology moves slowly, prices,
# pipelines and competitors do not.
MAX_AGE_DAYS = int(os.environ.get("INDICATION_CACHE_MAX_AGE_DAYS") or 180)

# Words that say nothing about WHICH disease a prompt is about.
_STOP = set("""a an and are as at be by for from in into is it of on or the to with without
disease diseases disorder disorders syndrome syndromes condition conditions patient patients
population populations market markets size sizing indication indications therapy therapies
therapeutic treatment treatments drug drugs against targeting target using use via new
united states usa us eu europe global worldwide adult adults pediatric paediatric""".split())


def _db_path():
    p = os.environ.get("INDICATION_STORE_PATH") or ""
    if p:
        return p
    bd = os.environ.get("BIGDATA") or ""
    if not bd:
        return None
    return os.path.join(bd, "indication_market.sqlite")


def _conn():
    p = _db_path()
    if not p:
        return None
    try:
        con = sqlite3.connect(p, timeout=15)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA busy_timeout=5000")
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                prompt TEXT NOT NULL,
                prompt_norm TEXT NOT NULL,
                region TEXT NOT NULL DEFAULT '',
                max_expansions INTEGER NOT NULL DEFAULT 0,
                max_searches INTEGER NOT NULL DEFAULT 0,
                structured TEXT NOT NULL DEFAULT '{}',
                model TEXT NOT NULL DEFAULT '',
                searched INTEGER NOT NULL DEFAULT 0,
                searches INTEGER NOT NULL DEFAULT 0,
                seconds REAL NOT NULL DEFAULT 0,
                findings TEXT NOT NULL,
                found TEXT NOT NULL DEFAULT '[]',
                info TEXT NOT NULL DEFAULT '{}',
                hits INTEGER NOT NULL DEFAULT 0,
                last_hit_at TEXT
            );
            CREATE INDEX IF NOT EXISTS runs_norm ON runs(prompt_norm);
            CREATE INDEX IF NOT EXISTS runs_created ON runs(created_at);
            CREATE TABLE IF NOT EXISTS prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                prompt TEXT NOT NULL,
                prompt_norm TEXT NOT NULL,
                region TEXT NOT NULL DEFAULT '',
                options TEXT NOT NULL DEFAULT '{}',
                structured TEXT NOT NULL DEFAULT '{}',
                decision TEXT NOT NULL,
                run_id INTEGER,
                reason TEXT NOT NULL DEFAULT '',
                judge_model TEXT NOT NULL DEFAULT '',
                judge_ms INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS prompts_created ON prompts(created_at);
            CREATE INDEX IF NOT EXISTS prompts_email ON prompts(email);
            CREATE TABLE IF NOT EXISTS run_keys (
                key TEXT NOT NULL,
                run_id INTEGER NOT NULL,
                PRIMARY KEY (key, run_id)
            );
            """
        )
        return con
    except Exception:
        return None


def enabled():
    return _db_path() is not None


def now_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def caller_email():
    return ("" + (os.environ.get("SENDER_USER_ID") or "")).strip().lower()


# ---------------------------------------------------------------- normalising and keys

def normalize_prompt(text):
    """The prompt with case, punctuation and spacing taken out: two prompts that differ only
    in those are the same text. Nothing cleverer than that happens here."""
    t = ("" + (text or "")).lower()
    t = re.sub(r"[‘’']", "", t)             # huntington's -> huntingtons
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return " ".join(t.split())


def tokens(text):
    """The words of a text that could identify a disease, a target or a modality."""
    out = []
    for w in normalize_prompt(text).split():
        if w in _STOP or w.isdigit():
            continue
        if len(w) < 2:
            continue
        out.append(w)
    return out


def keys_for(prompt, structured):
    """Everything a later prompt might share with this run: its own words, and the names and
    ALIASES the model gave for its indications, target and modality (whole phrases and their
    words), so that "HD" finds a run whose prompt said "Huntington's disease"."""
    keys = set(tokens(prompt))
    s = structured if isinstance(structured, dict) else {}
    phrases = []
    for field in ("indications", "aliases"):
        v = s.get(field)
        if isinstance(v, list):
            phrases.extend([x for x in v if isinstance(x, str)])
    for field in ("target", "modality"):
        v = s.get(field)
        if isinstance(v, str) and v.strip():
            phrases.append(v)
    for ph in phrases:
        n = normalize_prompt(ph)
        if n:
            keys.add(n)
        keys.update(tokens(ph))
    return sorted(k for k in keys if k)[:200]


# ---------------------------------------------------------------- writing

def save_run(prompt, region, max_expansions, max_searches, structured, findings, found, info):
    """Store a finished piece of research. Returns its id, or None."""
    con = _conn()
    if con is None:
        return None
    try:
        info = info if isinstance(info, dict) else {}
        cur = con.execute(
            "INSERT INTO runs (created_at, email, prompt, prompt_norm, region, max_expansions, "
            "max_searches, structured, model, searched, searches, seconds, findings, found, info) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (now_iso(), caller_email(), "" + (prompt or ""), normalize_prompt(prompt),
             "" + (region or ""), int(max_expansions or 0), int(max_searches or 0),
             json.dumps(structured or {}, ensure_ascii=False),
             "" + str(info.get("model") or ""), 1 if info.get("searched") else 0,
             int(info.get("searches") or 0), float(info.get("seconds") or 0),
             json.dumps(findings, ensure_ascii=False, default=str), json.dumps(found or [], ensure_ascii=False, default=str),
             json.dumps(info, ensure_ascii=False, default=str)))
        run_id = cur.lastrowid
        con.executemany("INSERT OR IGNORE INTO run_keys (key, run_id) VALUES (?,?)",
                        [(k, run_id) for k in keys_for(prompt, structured)])
        con.commit()
        return run_id
    except Exception:
        return None
    finally:
        try:
            con.close()
        except Exception:
            pass


def log_prompt(prompt, region, options, structured, decision, run_id=None, reason="",
               judge_model="", judge_ms=0):
    """Record one submitted prompt and what became of it. Returns its id, or None."""
    con = _conn()
    if con is None:
        return None
    try:
        cur = con.execute(
            "INSERT INTO prompts (created_at, email, prompt, prompt_norm, region, options, structured, "
            "decision, run_id, reason, judge_model, judge_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (now_iso(), caller_email(), "" + (prompt or ""), normalize_prompt(prompt), "" + (region or ""),
             json.dumps(options or {}, ensure_ascii=False), json.dumps(structured or {}, ensure_ascii=False),
             "" + (decision or ""), run_id, ("" + (reason or ""))[:600], "" + (judge_model or ""),
             int(judge_ms or 0)))
        con.commit()
        return cur.lastrowid
    except Exception:
        return None
    finally:
        try:
            con.close()
        except Exception:
            pass


def touch_hit(run_id):
    con = _conn()
    if con is None:
        return
    try:
        con.execute("UPDATE runs SET hits = hits + 1, last_hit_at = ? WHERE id = ?", (now_iso(), run_id))
        con.commit()
    except Exception:
        pass
    finally:
        try:
            con.close()
        except Exception:
            pass


# ---------------------------------------------------------------- reading

def _age_days(created_at):
    try:
        t = datetime.datetime.strptime(("" + created_at).rstrip("Z"), "%Y-%m-%dT%H:%M:%S")
        return max(0, (datetime.datetime.utcnow() - t).days)
    except Exception:
        return 10 ** 6


def _summary(row):
    try:
        s = json.loads(row["structured"] or "{}")
    except Exception:
        s = {}
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "age_days": _age_days(row["created_at"]),
        "prompt": row["prompt"],
        "region": row["region"],
        "max_expansions": row["max_expansions"],
        "structured": s if isinstance(s, dict) else {},
        "same_user": bool(row["email"]) and row["email"] == caller_email(),
    }


def candidates(prompt, max_expansions=0, limit=12):
    """The earlier runs worth putting to the model for this prompt: those sharing the most words
    or aliases with it, then the most recent ones (so an abbreviation with no shared word can
    still be recognised). Only runs that searched the web, are young enough, and looked for at
    least as many expansion indications as this request wants."""
    con = _conn()
    if con is None:
        return []
    try:
        oldest = (datetime.datetime.utcnow() - datetime.timedelta(days=MAX_AGE_DAYS)).replace(microsecond=0).isoformat() + "Z"
        usable = "searched = 1 AND created_at >= ? AND max_expansions >= ?"
        args = (oldest, int(max_expansions or 0))
        picked, seen = [], set()

        ks = set(tokens(prompt))
        n = normalize_prompt(prompt)
        if n:
            ks.add(n)
        if ks:
            ks = sorted(ks)[:80]
            q = ("SELECT r.*, COUNT(*) AS overlap FROM run_keys k JOIN runs r ON r.id = k.run_id "
                 "WHERE k.key IN (%s) AND %s GROUP BY r.id ORDER BY overlap DESC, r.created_at DESC LIMIT ?"
                 % (",".join("?" * len(ks)), usable))
            for row in con.execute(q, tuple(ks) + args + (limit,)):
                if row["id"] not in seen:
                    seen.add(row["id"])
                    picked.append(_summary(row))
        if len(picked) < limit:
            q = "SELECT * FROM runs WHERE %s ORDER BY created_at DESC LIMIT ?" % usable
            for row in con.execute(q, args + (limit,)):
                if row["id"] not in seen and len(picked) < limit:
                    seen.add(row["id"])
                    picked.append(_summary(row))
        return picked
    except Exception:
        return []
    finally:
        try:
            con.close()
        except Exception:
            pass


def update_findings(run_id, findings):
    """Replace a stored run's research in place.

    For topping up a run that predates a field the canvas now draws -- the history, which
    older runs have no key for at all. The run keeps its id, its date and its hit count:
    it is the same piece of research, with something added that was never asked for when
    it was made. Returns True when the row was written.
    """
    con = _conn()
    if con is None:
        return False
    try:
        con.execute("UPDATE runs SET findings = ? WHERE id = ?",
                    (json.dumps(findings, ensure_ascii=False, default=str), int(run_id)))
        con.commit()
        return True
    except Exception:
        return False
    finally:
        try:
            con.close()
        except Exception:
            pass


def get_run(run_id):
    """A stored run with its research decoded, or None."""
    con = _conn()
    if con is None:
        return None
    try:
        row = con.execute("SELECT * FROM runs WHERE id = ?", (int(run_id),)).fetchone()
        if row is None:
            return None
        out = _summary(row)
        out["findings"] = json.loads(row["findings"])
        out["found"] = json.loads(row["found"] or "[]")
        out["info"] = json.loads(row["info"] or "{}")
        return out
    except Exception:
        return None
    finally:
        try:
            con.close()
        except Exception:
            pass


def stats():
    con = _conn()
    if con is None:
        return {"enabled": False}
    try:
        one = lambda q: con.execute(q).fetchone()[0]
        by = {r[0]: r[1] for r in con.execute("SELECT decision, COUNT(*) FROM prompts GROUP BY decision")}
        return {"enabled": True, "path": _db_path(), "runs": one("SELECT COUNT(*) FROM runs"),
                "prompts": one("SELECT COUNT(*) FROM prompts"), "by_decision": by,
                "reuse_hits": one("SELECT COALESCE(SUM(hits),0) FROM runs")}
    except Exception as ex:
        return {"enabled": True, "error": str(ex)}
    finally:
        try:
            con.close()
        except Exception:
            pass


def recent(n=20):
    con = _conn()
    if con is None:
        return []
    try:
        return [dict(r) for r in con.execute(
            "SELECT id, created_at, email, prompt, region, decision, run_id, reason FROM prompts "
            "ORDER BY id DESC LIMIT ?", (int(n),))]
    except Exception:
        return []
    finally:
        try:
            con.close()
        except Exception:
            pass


if __name__ == "__main__":
    if "--recent" in sys.argv:
        i = sys.argv.index("--recent")
        k = int(sys.argv[i + 1]) if len(sys.argv) > i + 1 else 20
        print(json.dumps(recent(k), indent=2, ensure_ascii=False))
    else:
        print(json.dumps(stats(), indent=2, ensure_ascii=False))
