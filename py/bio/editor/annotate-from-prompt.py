"""
A SENTENCE ABOUT A GENE, TURNED INTO REGIONS TO DRAW ON ITS TRACK.

param(1): what the user typed, e.g.
          "DNM1 carries a regulated alternative 5' splice site that routes its own
           transcript to nonsense-mediated decay"
param(2): JSON context about the track, sent by the client:
          {gene, transcript, chr, strand, start, end, length, exons: n, introns: n,
           has_cds, has_5utr, has_3utr, annotations: [names], exon_table: [{i, start, end, len}]}
param(3): optional extra instructions.

Returns JSON: {"regions": [...], "note": "...", "model": "..."} or {"error": "..."}.

THE MODEL NAMES THE FEATURE; THE CLIENT DOES THE ARITHMETIC. A language model must not be
the thing that picks a coordinate: it will produce a plausible number for a gene it half
remembers, and a plausible number drawn on a track is indistinguishable from a measured
one. So every region comes back ANCHORED to something the track itself can resolve -- an
exon by its ordinal, an intron, the CDS, a UTR, a named annotation -- and the client turns
that into coordinates with baja/bio/track-regions.js, which already knows about strand and
ordinals. A raw coordinate range is allowed only when the user's own sentence gave one.

EVERY REGION CARRIES ITS OWN CONFIDENCE AND ITS REASON, because the difference between
"this exon is documented as a poison exon in this gene" and "a gene like this usually has
one around here" is the whole difference between a result and a guess, and once it is a
shape on a track nobody can tell them apart any more.
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

MAX_REGIONS = 8

REGION_FORMS = (
    '{"region":"exon","index":N}            one exon, counted along the transcript (1 = first)\n'
    '{"region":"intron","index":N}          one intron, same counting\n'
    '{"region":"cds"}                       the coding sequence\n'
    '{"region":"five_prime_utr"}            the 5′ UTR\n'
    '{"region":"three_prime_utr"}           the 3′ UTR\n'
    '{"region":"transcript"}                the whole transcript\n'
    '{"region":"annotation","name":"..."}   a feature already drawn on the track, by its name\n'
    '{"region":"coordinates","start":A,"end":B}  ONLY when the user gave the numbers\n'
)

SYSTEM = (
    "You turn a sentence about a gene into REGIONS TO DRAW on a transcript track in a "
    "genome editor.\n\n"
    "YOU DO NOT PICK COORDINATES. Anchor every region to something the track can resolve "
    "itself, using exactly one of these forms:\n"
    + REGION_FORMS +
    "\nThe client resolves the anchor against the real track, so an ordinal you get right "
    "is drawn in the right place even on a minus-strand gene; a coordinate you invent is a "
    "fabrication drawn as a measurement. Use the coordinates form ONLY when the user's own "
    "words contain the numbers.\n\n"
    "NARROWING. A feature smaller than its anchor takes a \"part\": \"start\" (the first "
    "bases of the anchor, along the transcript), \"end\" (the last), or \"whole\" (the "
    "default), with \"span\" giving how many bases for start/end. A 5′ splice site is "
    "the END of an exon (part \"end\", span 8); a 3′ splice site is the START of the "
    "next exon; a branch point sits in the END of an intron.\n\n"
    "WHAT TO RETURN:\n"
    '{"regions":[{"label":"short name for the shape, under 40 characters",'
    '"kind":"splice_site|poison_exon|binding_site|domain|element|variant_hotspot|other",'
    '"anchor":{...one of the forms above...},"part":"whole|start|end","span":N,'
    '"why":"one sentence: what this is and what makes you say it is here",'
    '"confidence":"high|medium|low"}],"note":"anything the user should know, including what '
    'you could not place"}\n\n'
    "CONFIDENCE IS NOT POLITENESS. high: this exact feature in this exact gene is "
    "documented and you can say where. medium: documented for the gene but you are inferring "
    "which exon or intron it sits in. low: you are reasoning from what genes like this "
    "usually have. If you are at low for everything, it is better to return no regions and "
    "say so in the note than to decorate a track with guesses.\n\n"
    "AT MOST %d regions. If the sentence names a feature this transcript cannot carry -- a "
    "3′ UTR element on a track with no annotated UTR -- say so in the note and return "
    "nothing for it. Never invent an exon number larger than the track has.\n"
    "Return JSON only." % MAX_REGIONS
)


def parse_json_blob(txt):
    if not txt:
        return None
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def ask(text, ctx, extra=""):
    if not requests:
        return None, "the server cannot make outbound requests"
    if not ANTHROPIC_API_KEY:
        return None, "no API key is configured on this host"

    exon_table = ctx.get("exon_table") or []
    rows = "\n".join(
        "  exon %s: %s nt" % (e.get("i"), e.get("len"))
        for e in exon_table[:60]
    )
    user = (
        "Gene: %s\nTranscript: %s\nChromosome: %s   strand: %s\n"
        "Track extent: %s-%s (%s nt)\n"
        "Exons: %s   introns: %s   coding sequence: %s   5′ UTR: %s   3′ UTR: %s\n"
        "%s\n"
        "Features already drawn on this track: %s\n\n"
        "What the user wrote:\n%s\n"
        % (ctx.get("gene") or "?", ctx.get("transcript") or "?", ctx.get("chr") or "?",
           ctx.get("strand") or "?", ctx.get("start"), ctx.get("end"), ctx.get("length"),
           ctx.get("exons"), ctx.get("introns"),
           "yes" if ctx.get("has_cds") else "no",
           "yes" if ctx.get("has_5utr") else "no",
           "yes" if ctx.get("has_3utr") else "no",
           rows,
           ", ".join((ctx.get("annotations") or [])[:30]) or "none",
           text)
    )
    if extra:
        user += "\nAdditional instructions from the user:\n%s\n" % extra

    try:
        try:
            import claude_usage as _cu
            _cu.bump("annotate-from-prompt")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 2000, "system": SYSTEM,
                  "messages": [{"role": "user", "content": user}]},
            timeout=120,
        )
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        if data.get("stop_reason") == "refusal":
            return None, "the model declined this request"
        txt = "".join(b.get("text", "") for b in (data.get("content") or [])
                      if b.get("type") == "text")
        parsed = parse_json_blob(txt)
        if parsed is None:
            return None, "could not read the answer: %s" % (txt[:200] or "empty")
        return parsed, None
    except Exception as e:
        return None, str(e)


def clean(parsed, ctx):
    """What survives: regions with a label and an anchor this track could carry.

    The checks here are the ones that can be made WITHOUT the sequence: an exon ordinal
    past the end of the track is a fabrication whatever else is true of it, and letting it
    through only moves the failure to the client, where it arrives as a missing shape with
    no explanation.
    """
    out = []
    dropped = []
    n_exons = int(ctx.get("exons") or 0)
    n_introns = int(ctx.get("introns") or 0)
    for r in (parsed.get("regions") or [])[:MAX_REGIONS]:
        if not isinstance(r, dict):
            continue
        label = str(r.get("label") or "").strip()[:60]
        anchor = r.get("anchor") if isinstance(r.get("anchor"), dict) else None
        if not label or not anchor:
            dropped.append("a region arrived without a label or an anchor")
            continue
        what = str(anchor.get("region") or "").strip().lower()
        if what in ("exon", "intron"):
            try:
                i = int(anchor.get("index"))
            except Exception:
                dropped.append("%s: no %s number given" % (label, what))
                continue
            top = n_exons if what == "exon" else n_introns
            if i < 1 or (top and i > top):
                dropped.append("%s: this transcript has %d %ss, so there is no %s %d"
                               % (label, top, what, what, i))
                continue
            anchor["index"] = i
        elif what in ("five_prime_utr", "three_prime_utr"):
            key = "has_5utr" if what == "five_prime_utr" else "has_3utr"
            if not ctx.get(key):
                dropped.append("%s: this transcript has no annotated %s"
                               % (label, "5′ UTR" if key == "has_5utr" else "3′ UTR"))
                continue
        elif what == "cds":
            if not ctx.get("has_cds"):
                dropped.append("%s: this transcript has no annotated coding region" % label)
                continue
        elif what in ("transcript", "annotation", "coordinates"):
            pass
        else:
            dropped.append("%s: %s is not a region this editor can resolve" % (label, what or "?"))
            continue

        part = str(r.get("part") or "whole").strip().lower()
        if part not in ("whole", "start", "end"):
            part = "whole"
        try:
            span = int(r.get("span") or 0)
        except Exception:
            span = 0
        conf = str(r.get("confidence") or "").strip().lower()
        if conf not in ("high", "medium", "low"):
            conf = "low"
        out.append({
            "label": label,
            "kind": str(r.get("kind") or "other").strip().lower()[:30],
            "anchor": anchor,
            "part": part,
            "span": max(0, min(span, 100000)),
            "why": str(r.get("why") or "").strip()[:400],
            "confidence": conf,
        })
    return out, dropped


text = str(works.param(1) or "").strip()
try:
    ctx = json.loads(str(works.param(2) or "{}")) or {}
except Exception:
    ctx = {}
extra = str(works.param(3) or "").strip()

if not text:
    works.result(json.dumps({"error": "nothing was described"}))
else:
    works.msg("Reading the description against %s…" % (ctx.get("gene") or "this track"))
    parsed, err = ask(text, ctx, extra)
    if err:
        works.result(json.dumps({"error": err}))
    else:
        regions, dropped = clean(parsed, ctx)
        note = str(parsed.get("note") or "").strip()
        if dropped:
            note = (note + "  " if note else "") + " ".join(dropped)
        works.msg("%d region(s) to place." % len(regions))
        works.result(json.dumps({
            "regions": regions,
            "note": note,
            "model": ANTHROPIC_MODEL,
            "asked": text,
        }))
