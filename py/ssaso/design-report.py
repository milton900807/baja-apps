"""Narrative design report for the compounds on a track.

    let r = await exec('py/ssaso/design-report.py', em, JSON.stringify(payload))
    // r.report_md   markdown
    // r.error       set when the model could not be reached

The CLIENT gathers the facts and this only writes them up. Nothing here reads the
track, re-scores a compound or re-runs an off-target search: the report must describe
the design that is actually on screen, and a second source of truth for any of it
would eventually disagree with the first.

The payload carries five things, which are the five the report has to cover:
    target      the transcript being designed against
    layers      the data and ML models on the track, separated
    compounds   sequence, position, score, chemistry
    offtargets  per compound, as already attached by the screen
    design      modality, algorithm, parameters

Params (after the EngineMonitor at param(0)):
    param(1) : the payload, as a JSON string
"""
import os
import json

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Sonnet rather than Haiku: this is a written document a user will read and act on,
# not a one-line lookup, and the difference shows in how well it holds five sections
# of heterogeneous facts together.
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_REPORT_MODEL") or "claude-sonnet-4-5"

SYSTEM = (
    "You write short technical reports on antisense oligonucleotide designs for the "
    "scientist who ran the design. Be specific and quantitative. Use only the facts in "
    "the payload: never invent a sequence, a score, an off-target gene, a chemistry or a "
    "citation, and never estimate a number that is not given. Where something is absent "
    "from the payload, say plainly that it was not run or not recorded rather than "
    "leaving a gap the reader will fill in optimistically. Do not add caveats about being "
    "an AI. Markdown, with '##' section headings, no title heading."
)

INSTRUCTIONS = """Write the report with exactly these sections:

## Target
The transcript, gene and species being designed against; its length, and the region the
design actually ran over if that was a selection rather than the whole track.

## Models and layers in use
The data layers and the ML model layers on this track, and what each one contributes to
the design. Separate MEASURED data (RNA-seq coverage, ClinVar variants, CLIP binding)
from PREDICTED model output (splice-site scores, cis-regulatory windows, PSI, intron
retention). If a splice-switching design was run, say which model windows it was aimed
at and in which direction. If there are no model layers, say so and note that the design
is sequence-and-rules only.

## The compounds
How many, their length range, where they sit, and the score range. Name the two or three
best by sequence and position and say what distinguishes them. If a compound is flagged
red, give the reason recorded for it.

## Chemistry
The modification and backbone actually applied, per compound where they differ. State
what that chemistry does and does not do: a fully modified steric-blocking oligo
recruits no RNase H, a gapmer does. Flag any compound whose chemistry is not uniform.

## Off-targets
What was screened and what was found, per compound. Give the gene symbols where recorded
and the edit distances they were found at. IF NO SCREEN HAS BEEN RUN, say exactly that
and do not present the absence of hits as a clean result.

## What to check next
Three to five concrete next steps that follow from the data above, not generic advice.
"""


def _fmt(payload):
    """The payload as compact JSON. The model reads this directly."""
    return json.dumps(payload, separators=(",", ":"), default=str)


raw = works.param(1) or "{}"
try:
    payload = json.loads(raw) if isinstance(raw, str) else raw
except Exception:
    payload = {}

report = ""
err = None

if not isinstance(payload, dict) or not payload:
    err = "no design payload"
elif not ANTHROPIC_API_KEY:
    err = "the report service is not configured on this server"
elif requests is None:
    err = "python requests is unavailable on the server"
else:
    n = len((payload.get("compounds") or []))
    works.msg("Writing the report for %d compound%s…" % (n, "" if n == 1 else "s"))
    try:
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 3000,
                # Low but not zero: this is reporting, where wording can vary and the
                # numbers must not.
                "temperature": 0.2,
                "system": SYSTEM,
                "messages": [{
                    "role": "user",
                    "content": INSTRUCTIONS + "\n\nDESIGN PAYLOAD (JSON):\n" + _fmt(payload),
                }],
            },
            timeout=120,
        )
        if r.status_code == 200:
            data = r.json()
            parts = data.get("content") or []
            report = "".join(
                p.get("text", "") for p in parts
                if isinstance(p, dict) and p.get("type") == "text"
            ).strip()
            if not report:
                err = "the model returned no text"
        else:
            err = "report service %s: %s" % (r.status_code, r.text[:300])
    except Exception as e:
        err = str(e)

works.resolve({
    "report_md": report,
    "error": err,
    "compounds": len((payload.get("compounds") or [])) if isinstance(payload, dict) else 0,
})
