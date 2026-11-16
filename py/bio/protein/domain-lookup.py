#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Describe one CDD domain or functional site when the hit table carries no description.

CDD's hit rows give a name, an accession, a span and an E-value, and nothing about
what the domain DOES. A panel that can only repeat the accession is a dead end on a
bar the user has just clicked, so this asks a model.

WHAT COMES BACK IS NOT CDD DATA, and the caller is required to label it as such. The
sibling of py/bio/protein/motif-lookup.py and built with the same guard: a model asked
about a domain it does not know will decompose the name into plausible prose --
"STKc_ACVR1_ALK1" reads as a serine/threonine kinase catalytic domain whether or not
the model has ever seen that family -- so:

  * it is told that "unknown" is a correct answer and a guess is not,
  * confidence comes back with every answer and is passed through,
  * a claim to know the domain at low confidence is treated as not knowing it,
  * source is always "model", never "cdd".

param(1): the domain or site name, e.g. "STKc_ACVR1_ALK1" or "active site"
param(2): the CDD accession when there is one, e.g. "cd14066" (optional, context)
param(3): the protein or gene it was found in (optional, context)
param(4): "domain" or "site" (optional; default "domain")
param(5): model id (optional; default "claude-haiku-4-5")

Resolves JSON:
    { "status": "OK", "name": str, "known": bool, "blurb": str, "role": str,
      "confidence": "high"|"medium"|"low", "source": "model" }
    { "status": "ERROR", "error": str }
"""
from __future__ import annotations
import json
import re
from typing import Any, Dict

from ion import works
from claude_chat import Claude as OpenAI

SYS = "You answer questions about protein domains and functional sites. Only output valid JSON."

INSTRUCTIONS = """
You are given the NAME of a hit from NCBI's Conserved Domain Database, sometimes with its
accession and the protein it was found in.

Describe what this domain or site IS and what it DOES: two or three sentences, about the
FAMILY rather than about this particular protein.

If you do not recognise it, set "known" to false and leave "blurb" empty. DO NOT infer a
description from the shape of the name. CDD names are built from abbreviations and family
labels, and a description reconstructed from those parts reads exactly like a real one and
is worth nothing. Answering "unknown" is correct and useful here; a plausible invention is
not. This matters most for the names that look most readable.

Return ONLY this JSON:
{
  "known": true or false,
  "blurb": "<two or three sentences, or an empty string when known is false>",
  "role": "<what it does in one short phrase, or an empty string>",
  "confidence": "high" or "medium" or "low"
}

"high" means a family you actually know. If you are reconstructing it from the name, that
is "low" and "known" should be false.
"""

NAME_OK = re.compile(r"^[A-Za-z0-9_.:+()\-/ ]{1,120}$")


def ask(model: str, name: str, acc: str, protein: str, kind: str) -> Dict[str, Any]:
    client = OpenAI()
    ctx: Dict[str, Any] = {"kind": kind, "name": name}
    if acc:
        ctx["accession"] = acc
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


def _clean(out: Dict[str, Any], name: str) -> Dict[str, Any]:
    known = bool(out.get("known"))
    blurb = str(out.get("blurb") or "").strip()
    role = str(out.get("role") or "").strip()
    conf = str(out.get("confidence") or "low").strip().lower()
    if conf not in ("high", "medium", "low"):
        conf = "low"
    # Saying no and then writing a description is a contradiction; the admission is the
    # part to keep. Claiming yes at low confidence is the same thing in other words.
    if not known or conf == "low":
        known, blurb, role = False, "", ""
    return {"status": "OK", "name": name, "known": known, "blurb": blurb,
            "role": role, "confidence": conf, "source": "model"}


def _main() -> None:
    name = str(works.param(1) or "").strip()
    if not name or not NAME_OK.match(name):
        works.resolve({"status": "ERROR", "error": "param(1) must be a domain or site name"})
        return
    acc = str(works.param(2) or "").strip()
    protein = str(works.param(3) or "").strip()
    kind = str(works.param(4) or "domain").strip().lower()
    if kind not in ("domain", "site"):
        kind = "domain"
    model = works.param(5) or "claude-haiku-4-5"
    try:
        works.msg("Looking up " + name + "…")
        works.resolve(_clean(ask(model, name, acc, protein, kind), name))
    except Exception as e:
        works.resolve({"status": "ERROR", "error": str(e)})


if __name__ == "__main__":
    _main()
