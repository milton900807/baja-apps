#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Turn a sentence about compounds into a filter the editor can evaluate.

"select the ones that are self-complementary", "drop anything under 40% GC",
"keep only the gapmers with a Tm over 55" -- the fields to express those already
exist on every designed compound, and the dialog that sets them by hand already
exists. What is missing is the translation, which is all this does.

THE MODEL DOES NOT JUDGE ANY COMPOUND. It never sees the compounds. It fills a
fixed set of fields from the sentence, and the editor then evaluates those fields
itself, deterministically, with the same code the hand-set dialog uses. That
matters for three reasons:

  * it is checkable -- the filter comes back in words and the count is shown
    before anything is selected or removed;
  * it cannot drift -- a model asked to decide per compound would give different
    answers to the same design on two runs;
  * it cannot invent -- "self-complementary" means the note the scorer wrote,
    not the model's opinion of the sequence.

Anything the sentence asks for that these fields cannot express goes into
`unsupported` and is reported. That list is the honest part of the answer: asked
for "the ones that fold badly in cytoplasm", the right reply is that this filter
cannot say, not a filter that looks close.

param(1): the sentence
param(2): JSON context {"spans": {...}, "counts": {...}} (optional) -- what the
          set actually spans, so a relative request like "the low scoring ones"
          lands on this design's numbers rather than on an invented threshold
param(3): model id (optional; default "claude-haiku-4-5")

Resolves JSON:
    { "status": "OK", "filter": {...}, "action": "select"|"remove",
      "explain": str, "unsupported": [str, ...], "source": "model" }
    { "status": "ERROR", "error": str }
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

SYS = "You translate requests about oligonucleotide compounds into a fixed filter. Only output valid JSON."

FAULT_KEYS = {
    "gc": "the scorer flagged GC outside its preferred range",
    "tm": "the scorer flagged Tm outside its preferred range",
    "cpg": "contains a CpG motif",
    "grun": "contains a long G run",
    "pal": "palindromic: the whole strand reads as its own reverse complement, so it dimerises end to end",
    "selfc": "self-complementary: a stretch of the strand pairs with another part of itself or with a second copy, a hairpin or dimer liability",
    "rep": "repetitive sequence",
}

INSTRUCTIONS = """
Translate the request into the filter below. You are NOT judging any compound and you
will not be shown any; you are only deciding which fields the request sets.

Fields, all optional. Leave a field out or null when the request does not constrain it.

  band          one of "red", "amber", "notred", "green".
                "red" = flagged by the scorer. "amber" = red or orange. "notred" =
                everything except flagged. "green" = the best-scoring band only.
  faults        a list from: %s
                A compound matches if it carries ANY of the ones listed.
  score_min, score_max    numbers
  gc_min, gc_max          percent, 0-100
  tm_min, tm_max          degrees C
  len_min, len_max        nucleotides
  modality      one of "gapmer", "steric", "sirna"
  allele_only   true when the request asks for allele-selective compounds
  name_contains a substring of the compound name

Also return:

  action        "select" when the request is about picking compounds out, "remove"
                when it is about deleting or dropping them. If the request does not
                say, use "select": selecting is reversible and removing is the one
                that destroys work.
  explain       one short sentence, in plain words, saying what the filter asks for.
                Describe the FILTER, not the request.
  unsupported   a list of anything the request asked for that these fields cannot
                express. Be strict about this. Off-target counts, secondary structure
                predictions, binding to a named protein, position in the transcript,
                tissue, delivery, anything about the target rather than the compound:
                none of these are fields here. Put them in this list rather than
                approximating them with a field that is not the same thing. An empty
                list means the whole request was expressible.

Return ONLY this JSON, with the fields that apply:
{ "band": ..., "faults": [...], "score_min": ..., "score_max": ..., "gc_min": ...,
  "gc_max": ..., "tm_min": ..., "tm_max": ..., "len_min": ..., "len_max": ...,
  "modality": ..., "allele_only": ..., "name_contains": ...,
  "action": "select" or "remove", "explain": "...", "unsupported": [...] }

Rules:
- A request naming a fault ("self-complementary", "repetitive", "has a CpG") sets
  `faults`, NOT a score range. The scorer's note is the fact; the score is a summary of
  several of them and does not say which.
- A relative request ("the worst ones", "low scoring") should use the numbers in the
  context when there are any, so the threshold belongs to this design. Say in `explain`
  what number you chose.
- Never return a filter with no fields set at all. If the request sets nothing, return
  the empty filter and put the reason in `unsupported`: a filter that matches everything
  would select or remove the whole track.
""" % (", ".join('"%s" (%s)' % (k, v) for k, v in FAULT_KEYS.items()))

NUMERIC = ("score_min", "score_max", "gc_min", "gc_max",
           "tm_min", "tm_max", "len_min", "len_max")
BANDS = ("red", "amber", "notred", "green")
MODALITIES = ("gapmer", "steric", "sirna")


def ask(model: str, prompt: str, context: Any) -> Dict[str, Any]:
    client = OpenAI()
    payload: Dict[str, Any] = {"request": prompt}
    if context:
        payload["context"] = context
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYS},
            {"role": "user", "content": INSTRUCTIONS + "\n\n" + json.dumps(payload, ensure_ascii=False)},
        ],
    )
    return json.loads(r.choices[0].message.content)


def _clean(out: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only what the editor can evaluate.

    Whatever the model returns, only these keys with these shapes reach the filter. A
    stray field would be ignored silently by the matcher, which is the quiet kind of
    wrong: the user reads a filter that mentions something the selection did not use.
    """
    spec: Dict[str, Any] = {}

    band = str(out.get("band") or "").strip().lower()
    if band in BANDS:
        spec["band"] = band

    faults: List[str] = []
    raw = out.get("faults")
    if isinstance(raw, list):
        for k in raw:
            k = str(k or "").strip().lower()
            if k in FAULT_KEYS and k not in faults:
                faults.append(k)
    if faults:
        spec["faults"] = faults

    for k in NUMERIC:
        v = out.get(k)
        if v is None or v == "":
            continue
        try:
            spec[k] = float(v)
        except (TypeError, ValueError):
            continue

    mod = str(out.get("modality") or "").strip().lower()
    if mod in MODALITIES:
        spec["modality"] = mod

    if out.get("allele_only") is True:
        spec["allele_only"] = True

    name = str(out.get("name_contains") or "").strip()
    if name:
        spec["name_contains"] = name[:120]

    action = str(out.get("action") or "select").strip().lower()
    if action not in ("select", "remove"):
        action = "select"

    unsupported = []
    raw_u = out.get("unsupported")
    if isinstance(raw_u, list):
        unsupported = [str(x).strip() for x in raw_u if str(x or "").strip()][:8]
    elif isinstance(raw_u, str) and raw_u.strip():
        unsupported = [raw_u.strip()]

    # A filter with nothing in it matches every compound. Selecting the whole track is
    # merely useless; REMOVING it is not, so an empty filter never carries that action.
    if not spec:
        action = "select"
        if not unsupported:
            unsupported = ["nothing in the request matched a field this filter has"]

    return {
        "status": "OK",
        "filter": spec,
        "action": action,
        "explain": str(out.get("explain") or "").strip()[:400],
        "unsupported": unsupported,
        "source": "model",
    }


def _main() -> int:
    try:
        prompt = str(works.param(1) or "").strip()
        if not prompt:
            works.resolve({"status": "ERROR", "error": "no request given"})
            return 0
        ctx_raw = works.param(2)
        context: Any = None
        if ctx_raw:
            try:
                context = json.loads(ctx_raw) if isinstance(ctx_raw, str) else ctx_raw
            except Exception:
                context = None
        model = str(works.param(3) or "claude-haiku-4-5").strip() or "claude-haiku-4-5"
        works.resolve(_clean(ask(model, prompt[:2000], context)))
    except Exception as exc:                     # noqa: BLE001 - report, never die silently
        import traceback
        traceback.print_exc()
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
