#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Answer a question about a LIST OF VARIANTS THE EDITOR SENT.

"are any of these snps pathogenic", "which of these hit a splice site",
"any of these in a known hotspot".

This is the one place in the editor where the model is asked to JUDGE records
rather than translate a sentence, so the shape of the answer is pinned down hard:

  - IT ANSWERS ABOUT THE RECORDS IT WAS GIVEN AND NOTHING ELSE. The caller sends
    the variants that are on screen; there is no lookup, no database, no way to
    bring in a variant that is not in the list.
  - EVERY VERDICT IS INDEXED, NOT NAMED. A verdict refers to a variant by its
    position in the list the caller sent. A name invented on the way back cannot
    select the wrong variant, because names are not how anything is matched.
  - A VERDICT IS ONE OF SIX WORDS. Free prose goes in `why`, where it is read as
    a reason and not parsed as a call.
  - THE RECORD'S OWN CALL IS NOT OVERWRITTEN. Where a variant already carries a
    clinical significance, the caller shows that and shows this separately, side
    by side, and a disagreement between them is visible rather than resolved.

That last one is the point. A model told "classify these" will happily restate the
clinsig field back as its own conclusion, which turns a ClinVar assertion into an
opinion with no provenance, and will just as happily contradict it with the same
confidence. Neither is acceptable in a tool someone designs therapeutics in. So the
prompt is told what the record says and told to say when it disagrees and why.

param(1): the question
param(2): JSON list of variant records: [{i, name, gene, change, pos, consequence,
          clinsig, condition, source, type}]
param(3): model id (default "claude-sonnet-4-5": this one reasons about the
          records rather than filling a schema, so it is not the cheap tier)

Resolves {"status":"OK", "answer":…, "caveat":…, "verdicts":[…], "matches":[…]}
or {"status":"ERROR","error":…}.
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You answer questions about a specific list of genetic variants supplied to you. "
       "You never introduce variants that are not in the list. Only output valid JSON.")

VERDICTS = ("pathogenic", "likely_pathogenic", "uncertain",
            "likely_benign", "benign", "unknown")
CONF = ("high", "medium", "low")

MAX_VARIANTS = 300

INSTRUCTIONS = """
You are given a question and a numbered list of variants currently on screen in a
genome editor. Answer the question ABOUT THOSE VARIANTS ONLY.

For each variant that is relevant to the question, return an entry:

  i           its number from the list. Required. Never a name.
  verdict     one of: pathogenic, likely_pathogenic, uncertain, likely_benign,
              benign, unknown. Use "unknown" when you do not know this variant and
              cannot reason about it from the gene and the change: that is a real
              and useful answer, and guessing is not.
  confidence  high, medium or low. "high" only for a variant or a specific residue
              change you actually recognise, or where the consequence makes the
              call near-certain (a nonsense or frameshift variant early in a gene
              whose loss-of-function mechanism is established).
  why         ONE short clause. What the call rests on: a recognised recurrent
              allele, the consequence, the gene's mechanism, a domain. If a `clinsig`
              was supplied for this variant and you agree, say you agree with it. If
              you disagree with it, say so plainly and say why; do not quietly
              restate it as your own finding and do not quietly contradict it.

Then:

  matches     the list of `i` values that answer the question AFFIRMATIVELY, so the
              editor can select them. For "are any of these pathogenic" that is the
              pathogenic and likely_pathogenic ones. Only numbers from the list.
              Empty if none do: say so, do not pad it.
  answer      one or two sentences answering the question as asked. Lead with the
              count. If the answer rests mostly on clinsig fields that were already
              in the records, say that, because the user can see those and should
              know you are not adding to them.
  caveat      one short sentence naming the main thing that would make this answer
              wrong, or "" if there is nothing worth saying. Do not write a general
              disclaimer about AI; the interface already carries one.

Rules:
- Do not rank, score or design anything. Do not suggest ASOs.
- Variants whose `clinsig` already answers the question still get an entry, with
  the verdict that field states and a `why` that says it came from the record.
- If the question is not about these variants at all, return an empty verdicts list,
  empty matches, and say so in `answer`.

Return ONLY:
{"answer": "...", "caveat": "...", "matches": [0, 3],
 "verdicts": [{"i": 0, "verdict": "...", "confidence": "...", "why": "..."}]}
"""


def ask(model: str, question: str, variants: List[Dict[str, Any]]) -> Dict[str, Any]:
    client = OpenAI()
    payload = {"question": question, "variants": variants}
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


def _clean(out: Dict[str, Any], n: int) -> Dict[str, Any]:
    """Nothing addresses a variant the caller did not send.

    `n` is how many variants went out. An index outside 0..n-1 is dropped rather than
    clamped: clamping would silently move a verdict onto a different variant, which is
    the one failure mode here that would be invisible on screen and wrong.
    """
    seen = set()
    verdicts: List[Dict[str, Any]] = []
    raw = out.get("verdicts")
    if isinstance(raw, list):
        for v in raw:
            if not isinstance(v, dict):
                continue
            try:
                i = int(v.get("i"))
            except (TypeError, ValueError):
                continue
            if i < 0 or i >= n or i in seen:
                continue
            verdict = str(v.get("verdict") or "").strip().lower().replace(" ", "_")
            if verdict not in VERDICTS:
                verdict = "unknown"
            conf = str(v.get("confidence") or "").strip().lower()
            if conf not in CONF:
                conf = "low"
            seen.add(i)
            verdicts.append({
                "i": i,
                "verdict": verdict,
                "confidence": conf,
                "why": str(v.get("why") or "").strip()[:300],
            })

    matches: List[int] = []
    rm = out.get("matches")
    if isinstance(rm, list):
        for x in rm:
            try:
                i = int(x)
            except (TypeError, ValueError):
                continue
            if 0 <= i < n and i not in matches:
                matches.append(i)

    return {
        "status": "OK",
        "answer": str(out.get("answer") or "").strip()[:1200],
        "caveat": str(out.get("caveat") or "").strip()[:400],
        "verdicts": verdicts,
        "matches": matches,
    }


def _main() -> int:
    try:
        question = str(works.param(1) or "").strip()
        if not question:
            works.resolve({"status": "ERROR", "error": "no question"})
            return 0
        raw = works.param(2)
        variants = json.loads(raw) if isinstance(raw, str) else (raw or [])
        if not isinstance(variants, list) or not variants:
            works.resolve({"status": "ERROR", "error": "no variants were sent"})
            return 0
        variants = variants[:MAX_VARIANTS]
        model = str(works.param(3) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, question[:2000], variants), len(variants)))
    except Exception as exc:                     # noqa: BLE001
        import traceback
        traceback.print_exc()
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
