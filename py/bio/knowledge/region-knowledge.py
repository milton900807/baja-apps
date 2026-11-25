"""What the literature says is IN this stretch of a gene, as features that can be checked.

A selection on a track is a range. This asks what is known to be in that range -- a cryptic
exon, a branch point, an RBP site, a regulatory element, a recurrent variant -- and returns
each one with the SEQUENCE the publication gives for it, so the client can find that
sequence in the actual selection and draw the feature where it really is.

WHY THE SEQUENCE IS NOT SENT. The obvious design hands the model the selected sequence and
asks it to point inside it. That destroys the only check there is: a model given the
sequence can copy any substring of it into its answer, and every feature then "verifies"
against the selection no matter where its claim came from. Withholding it means the anchor
has to come from the publication, and a match is then evidence that the client's stretch and
the paper's feature are the same piece of DNA.

Coordinates are asked for but never trusted: they ride along as `stated_start` so the client
can show how far the source was out from where the sequence turned out to be.

Params (after the EngineMonitor):
    param(1) : JSON object describing the selection -- gene, species, assembly, strand,
               genomic {chr,start,end}, c, annotations, introns. NO sequence.
    param(2) : maximum features to return (default 12)

Resolves:
    { features: [...], notes, searched, queries, model, error }
"""
import json
import os
import re
import time

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5"

KINDS = {"cryptic exon", "pseudo-exon", "splice site", "branch point", "polypyrimidine tract",
         "regulatory element", "rbp site", "mirna site", "variant", "repeat", "other"}

SYSTEM = (
    "You are reading the literature about ONE stretch of ONE gene and reporting what is "
    "published to be inside it.\n"
    "\n"
    "Return JSON only: {\"features\":[...],\"notes\":\"...\"}. Each feature is\n"
    "  label         a few words, what it would be called on a track\n"
    "  kind          one of: " + ", ".join(sorted(KINDS)) + "\n"
    "  what          one or two sentences: what it is and why it matters here\n"
    "  anchor        THE DNA SEQUENCE of the feature as the publication gives it, 12 to 400\n"
    "                bases, plus strand of the assembly where you can tell. This is the only\n"
    "                way the feature can be placed, so a feature without one is useless.\n"
    "  stated_start  the genomic start you believe it has, if you have one\n"
    "  evidence      {title, url, year, authors} of the publication it comes from\n"
    "\n"
    "RULES THAT MATTER MORE THAN COVERAGE:\n"
    "1. You are NOT given the sequence of the region. Do not pretend to read it. The anchor\n"
    "   must come from a publication or a database record, not from inference.\n"
    "2. Every feature needs a real citation you have seen in this search. No citation, no\n"
    "   feature. Do not cite a paper you have not retrieved.\n"
    "3. If you do not know the sequence of a feature, LEAVE IT OUT rather than inventing\n"
    "   one. A short honest list is the useful answer; the client checks every anchor\n"
    "   against the real sequence and reports what it could not find, so a guess becomes a\n"
    "   visible failure, not a quiet one.\n"
    "4. Only features INSIDE the given range. Say in notes if the famous feature of this\n"
    "   gene is outside it.\n"
    "5. Nothing is a finding about the person's data. These are published claims about a\n"
    "   locus.\n"
    "If the region has nothing published in it, return an empty features list and say so in "
    "notes. That is a result, not a failure."
)


def _text_of(blocks):
    return "".join(b.get("text", "") for b in (blocks or []) if b.get("type") == "text")


def _last_json(text):
    fenced = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    for c in list(reversed(fenced)) + ([re.search(r"\{.*\}", text, re.S).group(0)]
                                       if re.search(r"\{.*\}", text, re.S) else []):
        try:
            return json.loads(c)
        except Exception:
            continue
    return None


def _post(body, timeout=240):
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
        json=body, timeout=timeout,
    )
    if r.status_code != 200:
        raise RuntimeError("anthropic %s: %s" % (r.status_code, r.text[:300]))
    return r.json()


out = {"features": [], "notes": "", "searched": False, "queries": [], "error": ""}

raw = works.param(1)
try:
    ctx = json.loads(raw) if isinstance(raw, str) else (raw or {})
except Exception:
    ctx = {}
try:
    want = int(works.param(2)) if works.param(2) else 12
except Exception:
    want = 12
want = max(1, min(want, 25))

if not isinstance(ctx, dict) or not ctx.get("gene"):
    out["error"] = "no region was described"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "ANTHROPIC_API_KEY is not set on the server"
else:
    g = ctx.get("genomic") or {}
    where = "%s:%s-%s" % (g.get("chr") or "?", g.get("start"), g.get("end"))
    ask = [
        "Gene: %s (%s)" % (ctx.get("gene"), ctx.get("species") or "species not stated"),
        "Assembly: %s" % (ctx.get("assembly") or "not stated"),
        "Transcript: %s" % (ctx.get("transcript") or "not stated"),
        "Strand: %s" % (ctx.get("strand") or "?"),
        "Region: %s  (%s bases)" % (where, g.get("length")),
    ]
    if ctx.get("c"):
        ask.append("In c. coordinates: %s to %s" % (ctx["c"].get("from"), ctx["c"].get("to")))
    if ctx.get("introns"):
        ask.append("Introns in this range: " + ", ".join(
            "intron %s (%s bases, %s of it selected)" % (i.get("number"), i.get("length"), i.get("covered"))
            for i in ctx["introns"][:8]))
    if ctx.get("annotations"):
        ask.append("Annotated here: " + ", ".join(
            "%s%s" % (a.get("type"), (" " + str(a.get("index"))) if a.get("index") is not None else "")
            for a in ctx["annotations"][:20]))
    ask.append("")
    ask.append("At most %d features. Today: %s." % (want, time.strftime("%Y-%m-%d")))

    body = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 8000,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": "\n".join(ask)}],
        "tools": [{"type": "web_search_20260209", "name": "web_search", "max_uses": 8}],
    }

    works.msg("Reading the literature on %s %s…" % (ctx.get("gene"), where))
    try:
        try:
            import claude_usage as _cu
            _cu.bump("region-knowledge")
        except Exception:
            pass
        try:
            msg = _post(body)
            out["searched"] = True
        except RuntimeError as ex:
            # Web search is switched on per organisation. Without it this still answers from
            # what the model knows, and SAYS it did, because an uncited claim about a locus
            # and a cited one are not the same thing.
            if re.search(r"web[_ ]search", str(ex), re.I):
                body.pop("tools", None)
                works.msg("Web search is not enabled here; answering without it")
                msg = _post(body)
            else:
                raise

        blocks = list(msg.get("content") or [])
        resumes = 0
        while msg.get("stop_reason") == "pause_turn" and resumes < 4:
            resumes += 1
            body["messages"] = body["messages"] + [{"role": "assistant", "content": msg.get("content") or []}]
            msg = _post(body)
            blocks.extend(msg.get("content") or [])

        out["queries"] = [b.get("input", {}).get("query", "")
                          for b in blocks if b.get("type") == "server_tool_use"]
        out["model"] = msg.get("model") or ANTHROPIC_MODEL
        parsed = _last_json(_text_of(blocks))
        if not isinstance(parsed, dict):
            out["error"] = "could not read the reply"
        else:
            out["notes"] = str(parsed.get("notes") or "")[:2000]
            kept = []
            for f in (parsed.get("features") or [])[:want]:
                if not isinstance(f, dict):
                    continue
                anchor = re.sub(r"[^ACGTNacgtn]", "", str(f.get("anchor") or "")).upper()
                # A feature with no usable anchor cannot be placed, and placing it anywhere
                # else is the thing this whole design exists to prevent. It is dropped here
                # rather than sent on to be dropped there.
                if len(anchor) < 12 or len(anchor) > 400:
                    continue
                ev = f.get("evidence") if isinstance(f.get("evidence"), dict) else {}
                kind = str(f.get("kind") or "other").strip().lower()
                kept.append({
                    "label": str(f.get("label") or "unnamed")[:80],
                    "kind": kind if kind in KINDS else "other",
                    "what": str(f.get("what") or "")[:600],
                    "anchor": anchor,
                    "stated_start": f.get("stated_start") if isinstance(f.get("stated_start"), (int, float)) else None,
                    "evidence": {
                        "title": str(ev.get("title") or "")[:300],
                        "url": str(ev.get("url") or "")[:500],
                        "year": ev.get("year"),
                        "authors": str(ev.get("authors") or "")[:200],
                    },
                })
            out["features"] = kept
    except Exception as ex:
        out["error"] = str(ex)[:400]

works.resolve(out)
