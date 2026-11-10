#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Describe one ELM motif class when the catalogue has no description for it.

The ELM tables shipped with this host carry a description for most classes and
nothing at all for some, and a panel that can only say "No description in the ELM
catalogue." is a dead end on a bar the user has just gone to the trouble of
clicking. This asks a model instead.

WHAT COMES BACK IS NOT CATALOGUE DATA, and the caller is required to label it as
such. A motif class is an identifier like LIG_SH2_CRK or MOD_GSK3_1; a model asked
about one it does not know will happily decompose the name into plausible prose,
which would read exactly like a real description and be worth nothing. So:

  * The model is told to answer "unknown" rather than guess, and that is a normal
    answer, not a failure.
  * confidence comes back with every answer and is passed through untouched.
  * source is always "model", never "elm", so no caller can mistake one for the
    other by reading the record.

param(1): the ELM class identifier, e.g. "LIG_SH2_CRK"
param(2): the matched peptide (optional, context only)
param(3): the gene or protein the match sits in (optional, context only)
param(4): model id (optional; default "claude-haiku-4-5")

Resolves JSON:
    { "status": "OK", "elm": str, "known": bool, "blurb": str,
      "binds": str, "confidence": "high"|"medium"|"low", "source": "model" }
    { "status": "ERROR", "error": str }
"""
from __future__ import annotations
import json
import re
from typing import Any, Dict

from ion import works
from claude_chat import Claude as OpenAI

SYS = "You answer questions about short linear motifs in proteins. Only output valid JSON."

INSTRUCTIONS = """
You are given the identifier of a motif class from the ELM (Eukaryotic Linear Motif)
catalogue, and sometimes the peptide that matched it and the protein it sits in.

Describe the CLASS, not the particular match: what kind of site it is, what recognises
it, and what it is for. Two or three sentences.

If you do not recognise the identifier, set "known" to false and leave "blurb" empty.
DO NOT infer a description from the shape of the name. These identifiers are composed of
a type prefix (LIG, MOD, DOC, TRG, CLV, DEG) and an abbreviation, and guessing from those
parts produces text that reads like a real description and is not one. Answering
"unknown" is a correct and useful answer here; a plausible invention is not.

Return ONLY this JSON:
{
  "known": true or false,
  "blurb": "<two or three sentences, or an empty string when known is false>",
  "binds": "<the domain, enzyme or complex that recognises it, or an empty string>",
  "confidence": "high" or "medium" or "low"
}

Rules:
- "high" means you are describing a class you actually know. If you are reconstructing it
  from the name, that is "low" and "known" should be false.
- No markup, no citations, no hedging phrases inside the blurb itself; the confidence
  field carries the hedge.
- The prefix meanings, for your own reading of the identifier only: LIG a binding site,
  MOD a post-translational modification site, DOC a docking site, TRG a targeting or
  trafficking signal, CLV a protease cleavage site, DEG a degradation signal.
"""

ELM_ID = re.compile(r"^[A-Za-z0-9_.-]{2,64}$")


def ask(model: str, elm: str, peptide: str, protein: str) -> Dict[str, Any]:
    client = OpenAI()
    ctx = {"elm_class": elm}
    if peptide:
        ctx["matched_peptide"] = peptide
    if protein:
        ctx["found_in"] = protein
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYS},
            {"role": "user", "content": INSTRUCTIONS + "\n\n" + json.dumps(ctx, ensure_ascii=False)},
        ],
    )
    return json.loads(r.choices[0].message.content)


def _clean(out: Dict[str, Any], elm: str) -> Dict[str, Any]:
    known = bool(out.get("known"))
    blurb = str(out.get("blurb") or "").strip()
    binds = str(out.get("binds") or "").strip()
    conf = str(out.get("confidence") or "low").strip().lower()
    if conf not in ("high", "medium", "low"):
        conf = "low"
    # A model that says it does not know and then writes a description has contradicted
    # itself; the admission is the part to keep.
    if not known:
        blurb, binds = "", ""
    # Low confidence on a class it claims to know is the same situation wearing a
    # different hat, and the same answer applies.
    if known and conf == "low":
        known, blurb, binds = False, "", ""
    return {"status": "OK", "elm": elm, "known": known, "blurb": blurb,
            "binds": binds, "confidence": conf, "source": "model"}


def _main() -> None:
    elm = str(works.param(1) or "").strip()
    if not elm or not ELM_ID.match(elm):
        works.resolve({"status": "ERROR", "error": "param(1) must be an ELM class identifier"})
        return
    peptide = str(works.param(2) or "").strip()
    protein = str(works.param(3) or "").strip()
    model = works.param(4) or "claude-haiku-4-5"
    try:
        works.msg("Looking up " + elm + "…")
        works.resolve(_clean(ask(model, elm, peptide, protein), elm))
    except Exception as e:
        works.resolve({"status": "ERROR", "error": str(e)})


if __name__ == "__main__":
    _main()
