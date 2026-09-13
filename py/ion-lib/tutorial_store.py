"""Saved tutorials: a recorded script, what it does, and where it belongs.

A recording made by manchester/recorder.js is a JSON array of command objects -- the
clicks, the typing, the canvas gestures, the loads. Played back it reproduces a piece of
work exactly, which makes it the cheapest tutorial anyone can write: do the thing once,
name it, and it teaches itself. What was missing was somewhere to PUT it. A script that
lives in a text file the recorder downloaded is a script nobody else will ever run.

So it goes in a database here, next to the Claude-usage counts, with the two things that
make it findable again:

  KEYWORDS, derived from the operations the script performs rather than typed by whoever
  saved it. Every DOM command carries the label or the visible text of what was pressed
  ("Analyze", "Loss matrix", "Upload a VCF"), every domset carries what was typed into a
  field (a gene symbol, a disease), and every load carries a transcript or a symbol. That
  is a description of the work, written by the work.

  A CONTEXT, which is the screen it was recorded on and the route it was recorded at, so
  the tutorials offered to someone in the genome viewer are the ones about the genome
  viewer. The alternative -- one flat list -- is a list nobody reads twice.

Storage is SQLite in BIGDATA (`$BIGDATA/tutorials.sqlite`), the same place and the same
dependency-free approach as py/ion-lib/claude_usage.py. This module lives in py/ion-lib,
already on the spawned scripts' PYTHONPATH, so `import tutorial_store` works from any
tool.

  tutorial_store.save(...)            -> the stored row, keywords and all
  tutorial_store.find(...)            -> ranked rows for a context, without their scripts
  tutorial_store.get(tutorial_id)     -> one row WITH its script, ready to play
  tutorial_store.remove(id, email)    -> delete, but only the caller's own
  tutorial_store.keywords_for(script) -> the derivation on its own, for a preview
"""
import datetime
import hashlib
import json
import os
import re
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS tutorials (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    owner       TEXT,
    created     TEXT,
    updated     TEXT,
    screen      TEXT,
    route       TEXT,
    keywords    TEXT,
    topics      TEXT,
    n_steps     INTEGER,
    duration_ms INTEGER,
    visibility  TEXT,
    plays       INTEGER DEFAULT 0,
    script      TEXT
)
"""

# WORDS THAT SAY NOTHING ABOUT WHAT WAS DONE. Half of what a button's text carries is
# chrome -- "close", "ok", "back" -- and a tutorial whose keywords are "click close back"
# is a tutorial that matches everything and describes nothing.
STOP = set("""
a an and are as at be been but by can cannot did do does for from get got had has have
he her his how i if in into is it its me my no not of on one or our out over so
such than that the their them then there these they this those to too under up us use
used using was we were what when where which while who why will with you your
ok okay yes cancel close back next previous done here there now new open opened opening
click clicked press pressed button buttons menu item items panel window screen view show
shows shown page top bottom left right side row column list select selected selection
step steps first second third last more less all any some none other others
""".split())

# THE APPLICATION'S OWN VOCABULARY. A keyword is whatever the buttons happened to say; a
# TOPIC is one of the things this application is actually for, and it is what makes a
# tutorial findable by someone who does not know what the button was called. Each entry is
# the topic and the words that imply it -- matched against the keywords, not the raw text,
# so a topic is only claimed when the operation really involved it.
TOPICS = [
    ("loss of heterozygosity", ("heterozygosity", "loh", "tract", "tracts")),
    ("synthetic lethality", ("lethality", "lethal", "baja-3", "baja3", "dependency", "depmap")),
    ("allele-selective targets", ("allele-selective", "allele", "selective", "discriminating")),
    ("paralog partners", ("paralog", "paralogs", "partner", "partners")),
    ("loss matrix", ("matrix", "losses", "lof", "loss")),
    ("copy number", ("copy", "cn", "ploidy", "cyclops", "dosage")),
    ("upload", ("upload", "uploaded", "vcf", "bgzipped", "file", "files")),
    ("genome viewer", ("karyotype", "chromosome", "chromosomes", "genome", "band", "bands")),
    ("oligo editor", ("oligo", "editor", "transcript", "transcripts", "exon", "exons")),
    ("siRNA design", ("sirna", "sirnas", "duplex", "guide", "antisense")),
    ("ASO design", ("aso", "asos", "gapmer", "gapmers")),
    ("primer design", ("primer", "primers", "amplicon", "pcr", "qpcr")),
    ("variants", ("variant", "variants", "mutation", "mutations", "clinvar", "pathogenic")),
    ("disease search", ("disease", "diseases", "phenotype", "syndrome", "cancer", "carcinoma", "tumor")),
    ("patents", ("patent", "patents", "filing", "granted")),
    ("saving and sharing", ("save", "saved", "share", "shared", "download", "export", "csv", "pdf")),
    ("bookmarks", ("bookmark", "bookmarks")),
    ("annotations", ("annotation", "annotations", "gene", "genes", "symbol")),
]

MAX_KEYWORDS = 28
MAX_SCRIPT_CHARS = 4_000_000     # a long recording is large; a runaway paste is not a tutorial


def _db_path():
    bd = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA") or ""
    if not bd:
        bd = os.path.expanduser("~/baja-bd")
    return os.path.join(bd, "tutorials.sqlite")


def _conn():
    p = _db_path()
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
    except Exception:
        pass
    con = sqlite3.connect(p, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=5000")
    con.execute(SCHEMA)
    # Added after the first release; a column that already exists raises and is ignored.
    for ddl in ("ALTER TABLE tutorials ADD COLUMN plays INTEGER DEFAULT 0",
                "ALTER TABLE tutorials ADD COLUMN topics TEXT"):
        try:
            con.execute(ddl)
        except Exception:
            pass
    con.commit()
    return con


def _now():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _words(text):
    """Lower-case word-ish tokens, keeping the hyphens and digits that carry meaning.

    Gene symbols (TP53, BRCA1), transcript ids (ENST00000357033) and the application's own
    hyphenated names (BAJA-3, allele-selective) all have to survive this, so it is not a
    plain [a-z]+ split.
    """
    out = []
    for w in re.findall(r"[A-Za-z0-9][A-Za-z0-9_\-\.]*", str(text or "")):
        w = w.strip("-._").lower()
        if len(w) < 2 or len(w) > 40:
            continue
        if w in STOP:
            continue
        if w.isdigit():
            continue
        out.append(w)
    return out


def _command_words(c):
    """Everything in ONE command that says what the user was doing.

    The recorder's locators are the interesting part: `v` is the label or the visible text
    of whatever was clicked, which is the application describing itself. A canvas gesture
    (`event`) carries coordinates and nothing else, and contributes no words at all -- as
    it should, because "the user dragged" is true of every recording ever made.
    """
    if not isinstance(c, dict):
        return []
    cmd = str(c.get("cmd") or "").lower()
    words = []
    loc = c.get("locator")
    if isinstance(loc, dict):
        words += _words(loc.get("v"))
    if cmd in ("domset", "set", "type"):
        words += _words(c.get("value"))
    elif cmd in ("load", "add", "transcript", "gene"):
        words += _words(c.get("value"))
    elif cmd == "menuclick":
        words += _words(c.get("menu")) + _words(c.get("label"))
    elif cmd in ("message", "msg", "say"):
        words += _words(c.get("text") or c.get("value"))
    elif cmd == "exec":
        # The module path names the feature better than any label on the way to it.
        mod = str(c.get("module") or c.get("value") or "")
        words += _words(re.sub(r"[/\\]", " ", mod).replace(".js", " ").replace(".py", " "))
    elif cmd in ("variants", "clinvar"):
        words += ["variants"] + _words(c.get("value") or c.get("significance"))
    elif cmd in ("sequence", "seq"):
        words += ["sequence"] + _words(c.get("name"))
    return words


def parse_script(script):
    """The script as a list of command dicts, whatever form it arrived in."""
    if isinstance(script, list):
        return [c for c in script if isinstance(c, dict)]
    try:
        data = json.loads(str(script or "[]"))
    except Exception:
        return []
    if isinstance(data, list):
        return [c for c in data if isinstance(c, dict)]
    return []


def keywords_for(script):
    """Derive (keywords, topics, n_steps, duration_ms) from a recorded script.

    Keywords are ordered by how often the operation happened and then by when it first
    happened, so the words at the front are what the tutorial is mostly about rather than
    what it touched once on the way past.
    """
    cmds = parse_script(script)
    seen = {}
    order = {}
    steps = 0
    duration = 0
    for i, c in enumerate(cmds):
        cmd = str(c.get("cmd") or "").lower()
        if cmd == "wait":
            try:
                duration += int(float(c.get("ms") or 0))
            except Exception:
                pass
            continue
        if cmd in ("setstate", "state"):
            continue
        steps += 1
        for w in _command_words(c):
            seen[w] = seen.get(w, 0) + 1
            order.setdefault(w, i)
    words = sorted(seen.keys(), key=lambda w: (-seen[w], order[w]))[:MAX_KEYWORDS]
    wset = set(words)
    topics = [name for name, terms in TOPICS if wset.intersection(terms)]
    return words, topics, steps, duration


def _row(r, with_script=False):
    d = {
        "id": r["id"], "name": r["name"], "description": r["description"] or "",
        "owner": r["owner"] or "", "created": r["created"] or "", "updated": r["updated"] or "",
        "screen": r["screen"] or "", "route": r["route"] or "",
        "keywords": (r["keywords"] or "").split(),
        "topics": [t for t in (r["topics"] or "").split("|") if t],
        "n_steps": r["n_steps"] or 0, "duration_ms": r["duration_ms"] or 0,
        "visibility": r["visibility"] or "everyone", "plays": r["plays"] or 0,
    }
    if with_script:
        d["script"] = r["script"] or "[]"
    return d


def save(name, script, email="", description="", screen="", route="", visibility="everyone"):
    """Store one recording. Returns the stored row (without the script), or an error dict."""
    name = str(name or "").strip()
    if not name:
        return {"error": "a tutorial needs a name"}
    cmds = parse_script(script)
    if not cmds:
        return {"error": "that script has no commands in it"}
    text = script if isinstance(script, str) else json.dumps(script)
    if len(text) > MAX_SCRIPT_CHARS:
        return {"error": "that script is too large to store (%d characters)" % len(text)}
    words, topics, steps, duration = keywords_for(cmds)
    now = _now()
    tid = hashlib.sha1(("%s|%s|%s" % (name, email, now)).encode("utf-8")).hexdigest()[:16]
    vis = "me" if str(visibility or "").strip().lower() in ("me", "private", "own") else "everyone"
    con = _conn()
    try:
        con.execute(
            "INSERT INTO tutorials (id,name,description,owner,created,updated,screen,route,"
            "keywords,topics,n_steps,duration_ms,visibility,plays,script) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)",
            (tid, name, str(description or "").strip(), str(email or "").strip().lower(), now, now,
             str(screen or "").strip().lower(), str(route or "").strip(),
             " ".join(words), "|".join(topics), steps, duration, vis, text))
        con.commit()
        r = con.execute("SELECT * FROM tutorials WHERE id=?", (tid,)).fetchone()
        return _row(r)
    finally:
        try:
            con.close()
        except Exception:
            pass


def find(email="", screen="", route="", context="", query="", limit=40, mine_only=False):
    """Tutorials for where the caller is, best first.

    Nothing is filtered OUT by context -- a tutorial recorded elsewhere is still a tutorial
    someone may want -- it is ranked by it, and every row says which terms matched so the
    ranking can be read rather than trusted. A list that silently hides things teaches
    people it is empty.
    """
    try:
        limit = max(1, min(200, int(limit or 40)))
    except Exception:
        limit = 40
    email = str(email or "").strip().lower()
    screen = str(screen or "").strip().lower()
    ctx = set(_words(context)) | set(_words(query))
    qwords = set(_words(query))
    con = _conn()
    try:
        rows = con.execute("SELECT * FROM tutorials ORDER BY updated DESC").fetchall()
    finally:
        try:
            con.close()
        except Exception:
            pass
    out = []
    for r in rows:
        owner = (r["owner"] or "").lower()
        vis = r["visibility"] or "everyone"
        if vis == "me" and owner != email:
            continue
        if mine_only and owner != email:
            continue
        d = _row(r)
        score = 0.0
        why = []
        if screen and d["screen"] == screen:
            score += 6
            why.append("this screen")
        if route and d["route"] and (d["route"] == route or route.startswith(d["route"])):
            score += 3
            why.append("this view")
        kw = set(d["keywords"])
        hits = sorted(kw.intersection(ctx))
        if hits:
            score += 2 * len(hits)
            why += hits[:6]
        tpl = set(_words(" ".join(d["topics"])))
        thits = sorted(tpl.intersection(ctx))
        if thits:
            score += 1.5 * len(thits)
        if qwords:
            # A search term that appears in the NAME is a stronger signal than one that
            # happens to appear among the operations.
            nm = set(_words(d["name"] + " " + d["description"]))
            nhits = qwords.intersection(nm)
            if nhits:
                score += 4 * len(nhits)
                why += sorted(nhits)[:4]
            if not nhits and not kw.intersection(qwords):
                # Searching means asking for a subset; a row matching nothing is not it.
                continue
        if owner and owner == email:
            score += 0.5
            d["mine"] = True
        d["score"] = round(score, 2)
        d["why"] = why[:8]
        out.append(d)
    # Best first; ties broken by the most recently updated, which is the one most likely
    # to still match the application as it stands today.
    out.sort(key=lambda x: (-x["score"], x["updated"]), reverse=False)
    out.sort(key=lambda x: -x["score"])
    return out[:limit]


def get(tutorial_id, email="", count_play=False):
    """One tutorial WITH its script. Records a play when asked, so use tells the ranking."""
    tid = str(tutorial_id or "").strip()
    if not tid:
        return None
    con = _conn()
    try:
        r = con.execute("SELECT * FROM tutorials WHERE id=?", (tid,)).fetchone()
        if not r:
            return None
        if (r["visibility"] or "everyone") == "me" and (r["owner"] or "").lower() != str(email or "").strip().lower():
            return None
        if count_play:
            try:
                con.execute("UPDATE tutorials SET plays=COALESCE(plays,0)+1 WHERE id=?", (tid,))
                con.commit()
            except Exception:
                pass
        return _row(r, with_script=True)
    finally:
        try:
            con.close()
        except Exception:
            pass


def remove(tutorial_id, email=""):
    """Delete one -- only the caller's own, and only ever the one named."""
    tid = str(tutorial_id or "").strip()
    email = str(email or "").strip().lower()
    if not tid:
        return {"error": "no tutorial was named"}
    con = _conn()
    try:
        r = con.execute("SELECT owner FROM tutorials WHERE id=?", (tid,)).fetchone()
        if not r:
            return {"error": "there is no tutorial with that id"}
        if (r["owner"] or "").lower() != email:
            return {"error": "that tutorial belongs to someone else"}
        con.execute("DELETE FROM tutorials WHERE id=?", (tid,))
        con.commit()
        return {"ok": True, "id": tid}
    finally:
        try:
            con.close()
        except Exception:
            pass
