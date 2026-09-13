"""Saved tutorials for where the caller is standing, best first.

  let r = await exec('/py/tutorials/find-tutorials.py', em, JSON.stringify({
      screen: 'karyotype',                 // what is on screen now
      route: '/app/free/karyotype',
      context: 'loss matrix TP53 BRCA1',   // words describing the current state
      query: '',                           // or what the user typed
      limit: 40
  }))

  // one tutorial, WITH its script, ready to play:
  let r = await exec('/py/tutorials/find-tutorials.py', em, JSON.stringify({ id: 'a1b2c3…', play: true }))

  // and to delete one of your own:
  let r = await exec('/py/tutorials/find-tutorials.py', em, JSON.stringify({ id: '…', remove: true }))

Context RANKS, it does not filter: a tutorial recorded on another screen is still a
tutorial someone may want, and a list that silently hides things teaches people it is
empty. Every row carries `why` -- the terms that earned its place -- so the order can be
read rather than trusted.

Resolves:
    { ok, tutorials, n, error }            tutorials: JSON array of rows
    { ok, tutorial, error }                when an id was given (row includes `script`)
"""
import json
import os

from ion import works

out = {"ok": False, "tutorials": "[]", "tutorial": "", "n": 0, "error": None}

try:
    import tutorial_store
except Exception as e:
    tutorial_store = None
    out["error"] = "the tutorial store is unavailable (%s)" % e

raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}

email = (os.environ.get("SENDER_USER_ID") or "").strip() or str(req.get("email") or "").strip()

if tutorial_store:
    tid = str(req.get("id") or "").strip()
    if tid and req.get("remove"):
        r = tutorial_store.remove(tid, email)
        if r.get("error"):
            out["error"] = r["error"]
        else:
            out["ok"] = True
            works.msg("Removed that tutorial")
    elif tid:
        row = tutorial_store.get(tid, email, count_play=bool(req.get("play")))
        if not row:
            out["error"] = "that tutorial is not here any more"
        else:
            out["ok"] = True
            out["tutorial"] = json.dumps(row)
    else:
        works.msg("Looking for tutorials about this…")
        rows = tutorial_store.find(
            email=email,
            screen=req.get("screen") or "",
            route=req.get("route") or "",
            context=req.get("context") or "",
            query=req.get("query") or "",
            limit=req.get("limit") or 40,
            mine_only=bool(req.get("mine_only")))
        out["ok"] = True
        out["tutorials"] = json.dumps(rows)
        out["n"] = len(rows)
        works.msg("%d tutorial(s)" % len(rows))

works.resolve(out)
