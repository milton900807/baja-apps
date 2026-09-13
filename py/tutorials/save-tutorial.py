"""Save a recorded script as a tutorial, with keywords derived from what it does.

  let r = await exec('/py/tutorials/save-tutorial.py', em, JSON.stringify({
      name: 'Find the losses in a tumor VCF',
      description: 'Upload, calculate the loss matrix, pick the genes',
      script: '<the recorded JSON array>',
      screen: 'karyotype',              // where it was recorded
      route: '/app/free/karyotype',     // and at what route
      visibility: 'everyone'            // or 'me'
  }))

The keywords are NOT asked for. They come out of the script itself -- the label on every
button that was pressed, whatever was typed into a field, the transcripts that were loaded
-- because a description written by the work is the one description that cannot drift from
it. Topics are the same words matched against the application's own vocabulary, so a
recording that visits the loss matrix is findable by someone searching for the loss matrix
whatever the buttons were called on the day it was made.

Identity comes from SENDER_USER_ID (the /py bridge sets it from the signed-in user), with
param(1).email as a fallback for callers that pass it.

Resolves:
    { ok, id, name, keywords, topics, n_steps, duration_ms, error }
"""
import json
import os

from ion import works

out = {"ok": False, "id": "", "name": "", "keywords": "[]", "topics": "[]",
       "n_steps": 0, "duration_ms": 0, "error": None}

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
    name = str(req.get("name") or "").strip()
    script = req.get("script")
    if not name:
        out["error"] = "a tutorial needs a name"
    elif not script:
        out["error"] = "there is no recorded script to save"
    else:
        works.msg("Reading the operations in %s…" % name)
        r = tutorial_store.save(
            name=name,
            script=script,
            email=email,
            description=req.get("description") or "",
            screen=req.get("screen") or "",
            route=req.get("route") or "",
            visibility=req.get("visibility") or "everyone")
        if r.get("error"):
            out["error"] = r["error"]
        else:
            out["ok"] = True
            out["id"] = r["id"]
            out["name"] = r["name"]
            out["keywords"] = json.dumps(r["keywords"])
            out["topics"] = json.dumps(r["topics"])
            out["n_steps"] = r["n_steps"]
            out["duration_ms"] = r["duration_ms"]
            works.msg("Saved %s: %d step(s), %d keyword(s)" % (r["name"], r["n_steps"], len(r["keywords"])))

works.resolve(out)
