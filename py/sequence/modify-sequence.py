#!/usr/bin/env python3
"""Change a stretch of sequence, described in words.

The user selects a span on a track and says what they want done to it -- "delete the ATG",
"insert a stop codon after the third codon", "change the GC-rich stretch to GC-poor",
"make this a Kozak sequence" -- and this returns the replacement for that span.

WHAT COMES BACK IS CHECKED, NOT TRUSTED. The reply has to be a sequence and nothing else:
bases only, no commentary, no ellipsis standing in for a middle nobody wrote out. Anything
that is not ACGTN is refused rather than cleaned up, because a "sequence" that needed
cleaning is one nobody should be putting on a track. A reply identical to what was sent is
reported as no change rather than applied as one.

The caller decides what to do with it; nothing here touches a track.

Params (after the EngineMonitor):
    param(1) : the sequence to modify (the selected span)
    param(2) : what to do to it, in the user's words
    param(3) : optional JSON context {gene, track, strand, chr, start, end, left, right}
               left/right are the flanking bases, so a change that depends on what it sits
               between can be made correctly. They are CONTEXT ONLY and are never returned.

Resolves:
    { ok, sequence, original, changed, length_before, length_after, note, error }
"""
import json
import os
import re

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5"

MAX_IN = 20000          # a span longer than this is not a thing to describe a change to
MAX_OUT_FACTOR = 4      # a reply several times the input is a runaway, not an edit

SYSTEM = (
    "You edit DNA sequence. You are given one stretch of sequence and an instruction "
    "describing how to change it, and you reply with the REPLACEMENT for that stretch.\n"
    "\n"
    "Reply with ONLY a JSON object:\n"
    '{ "sequence": "ACGT...", "note": "one short sentence saying what you changed" }\n'
    "\n"
    "Rules:\n"
    "- sequence is the WHOLE replacement span, written out in full, in the same orientation "
    "as the input. Never abbreviate it, never use an ellipsis, never write a run as a count.\n"
    "- Use A, C, G, T and N only.\n"
    "- Change only what the instruction asks for. Every other base stays exactly as it was, "
    "in the same order.\n"
    "- The replacement may be longer or shorter than the input when the instruction calls "
    "for an insertion or a deletion.\n"
    "- Flanking sequence, when given, is context for making the edit correctly. Do not "
    "include it in the reply.\n"
    "- If the instruction cannot be carried out on this sequence, reply with "
    '{ "sequence": "", "note": "why not" } rather than guessing at what was meant.'
)


def parse_json_blob(txt):
    t = ("" + (txt or "")).strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except Exception:
        pass
    a, b = t.find("{"), t.rfind("}")
    if a >= 0 and b > a:
        try:
            return json.loads(t[a:b + 1])
        except Exception:
            return None
    return None


seq_in = re.sub(r"[^A-Za-z]", "", str(works.param(1) or "")).upper().replace("U", "T")
ask = str(works.param(2) or "").strip()
try:
    ctx = json.loads(str(works.param(3) or "{}")) or {}
except Exception:
    ctx = {}

out = {"ok": False, "sequence": "", "original": seq_in, "changed": False,
       "length_before": len(seq_in), "length_after": 0, "note": "", "error": None}

if not seq_in:
    out["error"] = "no sequence was selected"
elif not re.match(r"^[ACGTN]+$", seq_in):
    out["error"] = "the selected span is not plain sequence"
elif len(seq_in) > MAX_IN:
    out["error"] = ("the selection is %d nt; choose %d or fewer to modify"
                    % (len(seq_in), MAX_IN))
elif not ask:
    out["error"] = "no modification was described"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "the sequence service is not configured on this server"
else:
    try:
        try:
            import claude_usage as _cu
            _cu.bump("modify-sequence")
        except Exception:
            pass
        bits = []
        if ctx.get("gene") or ctx.get("track"):
            bits.append("Gene / track: %s" % (ctx.get("gene") or ctx.get("track")))
        if ctx.get("chr") is not None and ctx.get("start") is not None:
            bits.append("Location: %s:%s-%s" % (ctx.get("chr"), ctx.get("start"), ctx.get("end")))
        if ctx.get("strand") is not None:
            bits.append("Strand: %s" % ctx.get("strand"))
        left = re.sub(r"[^ACGTN]", "", str(ctx.get("left") or "").upper())[-60:]
        right = re.sub(r"[^ACGTN]", "", str(ctx.get("right") or "").upper())[:60]
        if left:
            bits.append("The 60 bases BEFORE the selection (context only, do not return):\n" + left)
        if right:
            bits.append("The 60 bases AFTER the selection (context only, do not return):\n" + right)
        user = ("\n".join(bits) + ("\n\n" if bits else "")
                + "The selected sequence to modify (%d nt):\n%s\n\n"
                  "The modification to make:\n%s" % (len(seq_in), seq_in, ask))
        works.msg("Working out the change…")
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL,
                  "max_tokens": min(32000, 800 + len(seq_in) * 2),
                  "system": SYSTEM,
                  "messages": [{"role": "user", "content": user}]},
            timeout=300,
        )
        if r.status_code != 200:
            out["error"] = "the sequence service refused: %s" % r.text[:200]
        else:
            data = r.json()
            body = "".join(b.get("text", "") for b in (data.get("content") or [])
                           if b.get("type") == "text")
            got = parse_json_blob(body)
            if not isinstance(got, dict):
                out["error"] = "the reply could not be read"
            else:
                note = str(got.get("note") or "").strip()
                raw = str(got.get("sequence") or "")
                cand = raw.strip().upper().replace("U", "T")
                cand = re.sub(r"\s+", "", cand)
                if not cand:
                    out["error"] = note or "that modification could not be made to this sequence"
                elif not re.match(r"^[ACGTN]+$", cand):
                    # Refused rather than stripped: a reply carrying anything but bases was
                    # not a sequence, and editing it into one guesses at what was meant.
                    bad = sorted(set(re.sub(r"[ACGTN]", "", cand)))[:6]
                    out["error"] = ("the reply was not plain sequence (found %s)"
                                    % ", ".join("'%s'" % c for c in bad))
                elif len(cand) > max(200, len(seq_in) * MAX_OUT_FACTOR):
                    out["error"] = ("the reply was %d nt for a %d nt selection, which is not an edit"
                                    % (len(cand), len(seq_in)))
                else:
                    out["ok"] = True
                    out["sequence"] = cand
                    out["length_after"] = len(cand)
                    out["changed"] = (cand != seq_in)
                    out["note"] = note or ("%d nt in, %d nt out" % (len(seq_in), len(cand)))
                    works.msg("%d nt → %d nt" % (len(seq_in), len(cand)))
    except Exception as e:
        out["error"] = str(e)

works.resolve(out)
