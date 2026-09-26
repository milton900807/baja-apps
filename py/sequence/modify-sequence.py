#!/usr/bin/env python3
"""Change a stretch of sequence, described in words.

The user selects a span on a track and says what they want done to it -- "delete the ATG",
"insert a stop codon after the third codon", "change the GC-rich stretch to GC-poor",
"make this a Kozak sequence" -- and this returns the replacement for that span.

ONLY WHAT WAS DESCRIBED CHANGES, and that is a property of the contract rather than a hope
about the answer. The reply is not a rewritten sequence, it is a list of SPANS to replace --
start, end, and what they become. Everything outside those spans is copied from the original,
so it is the same string it was.

Asking for the sequence back does not survive contact: asked to swap five bases for five, a
reply came back one base shorter; asked to delete the first ten, thirteen went. Neither is
detectable when the whole span is the answer, and both are impossible when it is not.

What is still checked: every span has to be inside the selection, spans may not overlap, a
replacement has to be bases or empty, and the result may not run away in length.

The caller decides what to do with it; nothing here touches a track.

Params (after the EngineMonitor):
    param(1) : the sequence to modify (the selected span)
    param(2) : what to do to it, in the user's words
    param(3) : optional JSON context {gene, track, strand, chr, start, end, left, right}
               left/right are the flanking bases, so a change that depends on what it sits
               between can be made correctly. They are CONTEXT ONLY and are never returned.

Resolves:
    { ok, sequence, original, changed, length_before, length_after, note, error,
      edits: [{start, end, was, replacement, why, delta}], edit_count }
  start/end are 1-based inclusive positions in the sequence that was sent.
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
    "describing how to change it. You reply with the positions to replace rather than with a "
    "rewritten sequence, so that anything you do not list is left as it was.\n"
    "Reply with ONLY a JSON object:\n"
    "{ \"edits\": [ { \"start\": 1, \"end\": 5, \"replacement\": \"GGGGG\" } ],\n"
    "  \"note\": \"one short sentence saying what you changed\" }\n"
    "start and end are 1-based inclusive positions in the sequence you were given. "
    "replacement is what those bases become, written with A, C, G, T or N, or \"\" to remove "
    "them; it need not be the same length as the span. To add bases without removing any, "
    "replace one base with itself followed by the addition. Edits must not overlap. If the "
    "instruction cannot be applied to this sequence, reply with "
    "{ \"edits\": [], \"note\": \"why not\" }."
)

# KEPT SHORT ON PURPOSE. A longer version of this prompt -- the same contract, but drilled
# through with worked examples and emphatic capitals -- was REFUSED by the service two times
# in three, where the plain wording above answered three in three and then six in six. The
# instruction did not change; the way it was written did. If this needs extending, measure the
# refusal rate before and after, because the failure looks like a parsing bug from the inside:
# stop_reason "refusal" arrives with no content blocks at all, so `body` is simply empty.

MAX_EDITS = 200


def apply_edits(seq, edits):
    """Apply the named edits and copy everything else VERBATIM.

    This is the whole point of asking for edits rather than for a rewritten sequence. When
    the reply is the sequence, a base can go missing anywhere in it and nothing can tell --
    measured: asked to swap five bases for five, a reply came back one base shorter, and
    asked to delete ten, thirteen went. Here the parts nobody named are the SAME STRING they
    were; only the named spans are built from the reply, so a miscount can move what was
    asked for but cannot touch what was not.

    Returns (sequence, applied, error). Positions are 1-based inclusive."""
    clean = []
    for e in (edits or [])[:MAX_EDITS]:
        if not isinstance(e, dict):
            return None, None, "an edit was not an object"
        try:
            a = int(e.get("start"))
            b = int(e.get("end"))
        except Exception:
            return None, None, "an edit had no position"
        rep = str(e.get("replacement") or "").strip().upper().replace("U", "T")
        rep = re.sub(r"\s+", "", rep)
        if rep and not re.match(r"^[ACGTN]+$", rep):
            bad = sorted(set(re.sub(r"[ACGTN]", "", rep)))[:6]
            return None, None, ("a replacement was not plain sequence (found %s)"
                                % ", ".join("'%s'" % c for c in bad))
        if not (1 <= a <= b <= len(seq)):
            return None, None, ("an edit names %d-%d, which is outside the %d nt selection"
                                % (a, b, len(seq)))
        clean.append({"start": a, "end": b, "replacement": rep,
                      "was": seq[a - 1:b], "why": str(e.get("why") or "")})
    if not clean:
        return None, None, None                      # nothing to do; the caller reads `note`
    clean.sort(key=lambda e: (e["start"], e["end"]))
    for i in range(1, len(clean)):
        if clean[i]["start"] <= clean[i - 1]["end"]:
            return None, None, ("two edits overlap (%d-%d and %d-%d)"
                                % (clean[i - 1]["start"], clean[i - 1]["end"],
                                   clean[i]["start"], clean[i]["end"]))
    # Right to left, so an earlier edit's positions are still the ones that were named.
    out = seq
    for e in reversed(clean):
        out = out[:e["start"] - 1] + e["replacement"] + out[e["end"]:]
    return out, clean, None


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
       "length_before": len(seq_in), "length_after": 0, "note": "", "error": None,
       # The spans that changed, each with what was there and what replaced it. The caller
       # shows these: a change nobody can see the extent of is a change nobody can check.
       "edits": "[]", "edit_count": 0}

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
                  # ROOM TO THINK AS WELL AS TO ANSWER. The answer is now a short list of
                  # spans rather than the whole sequence, so the budget is dominated by the
                  # reasoning that precedes it -- and at 800 + 2n a 62 nt selection got 924
                  # tokens for both, which truncated the JSON and came back as "the reply
                  # could not be read" perhaps half the time. The floor is what matters here;
                  # the per-base term only covers quoting long spans back.
                  "max_tokens": min(32000, 6000 + len(seq_in) * 2),
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
            stop = str(data.get("stop_reason") or "")
            got = parse_json_blob(body)
            if not body and stop == "refusal":
                # The service declined; there is nothing to parse and saying "could not be
                # read" would send someone looking for a bug in the reader.
                out["error"] = ("the sequence service declined this request \u2014 "
                                "try describing the change differently")
            elif not body:
                out["error"] = ("the sequence service returned nothing"
                                + (" (%s)" % stop if stop else ""))
            elif not isinstance(got, dict):
                out["error"] = "the reply could not be read"
            else:
                note = str(got.get("note") or "").strip()
                cand, applied, err = apply_edits(seq_in, got.get("edits"))
                if err:
                    out["error"] = err
                elif cand is None:
                    out["error"] = note or "that modification could not be made to this sequence"
                elif len(cand) > max(200, len(seq_in) * MAX_OUT_FACTOR):
                    out["error"] = ("the edits would make a %d nt selection %d nt, which is not an edit"
                                    % (len(seq_in), len(cand)))
                else:
                    # Everything outside the named spans is the same string it was: true by
                    # construction in apply_edits, which copies it rather than rebuilding it.
                    out["ok"] = True
                    out["sequence"] = cand
                    out["length_after"] = len(cand)
                    out["changed"] = (cand != seq_in)
                    out["edits"] = json.dumps([
                        {"start": e["start"], "end": e["end"], "was": e["was"],
                         "replacement": e["replacement"], "why": e["why"],
                         "delta": len(e["replacement"]) - len(e["was"])}
                        for e in applied])
                    out["edit_count"] = len(applied)
                    out["note"] = note or ("%d edit%s" % (len(applied), "" if len(applied) == 1 else "s"))
                    works.msg("%d edit(s): %d nt \u2192 %d nt"
                              % (len(applied), len(seq_in), len(cand)))
    except Exception as e:
        out["error"] = str(e)

works.resolve(out)
