#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Turn a sentence typed in the editor into ONE action the editor already knows how to do.

"select all snps", "remove the pathogenic ones", "drop every red compound",
"clear the selection", "zoom to what I selected".

THE MODEL CHOOSES FROM A CLOSED LIST AND FILLS ITS PARAMETERS. It does not emit
code, it does not name a function, and it never decides what any individual
variant or compound is. The editor matches the records itself, with the engines
it already uses for the search box and the compound filter, and nothing is
destroyed without a count shown first.

That split is what makes this safe to put in a toolbar. A model that could say
"run this" would be a remote shell on someone's work; a model that can only say
"the verb is remove_variants and the query is pathogenic" can be checked, counted
and refused before anything happens.

Actions, and what each takes:

    select_variants         query   search terms, the same language as the editor's
                                    variant search: words, wildcards (* ?), and
                                    -word to exclude. Empty query means every variant.
    remove_variants         query   same, DESTRUCTIVE
    clear_variant_selection
    select_compounds        filter  the compound filter object (band / faults /
                                    score / gc / tm / length / modality / name)
    remove_compounds        filter  same, DESTRUCTIVE
    clear_compound_selection
    zoom_selection
    fit
    ask_variants            query   optional terms NARROWING which visible variants the
                                    question is about; empty means all of them. The
                                    question itself is passed through untouched and
                                    answered by py/bio/editor/variant-question.py, which
                                    is the only place a model judges records here.

param(1): the sentence
param(2): optional JSON context about what is open, so a relative phrase lands
          on this screen rather than on an invented one
param(3): model id (default "claude-haiku-4-5")

Resolves {"status":"OK", "action":…, "query":…, "filter":…, "explain":…,
          "unsupported":[…]} or {"status":"ERROR","error":…}.
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

SYS = "You map a request about a genome editor onto one action from a fixed list. Only output valid JSON."

ACTIONS = {
    "select_variants": "select variants (SNPs and indels) matching a search query",
    "remove_variants": "DELETE variants matching a search query from the tracks",
    "clear_variant_selection": "deselect all variants",
    "select_compounds": "select compounds (ASOs, siRNAs) matching a filter",
    "remove_compounds": "DELETE compounds matching a filter from the tracks",
    "clear_compound_selection": "deselect all compounds",
    "zoom_selection": "frame whatever is currently selected",
    "fit": "frame the whole track",
    "ask_variants": "ANSWER A QUESTION about the variants currently on screen",
}

FAULTS = ["gc", "tm", "cpg", "grun", "pal", "selfc", "rep"]

INSTRUCTIONS = """
Choose exactly one action and fill only the field it takes.

Actions:
%s

`query`, for the two variant actions. The editor's own search language:
  - a bare word matches a SUBSTRING of any field (name, gene, clinical significance,
    condition, consequence, source, alleles)
  - * and ? are wildcards matched against the WHOLE field ("patho*")
  - -word excludes
  - several terms are ANDed
  - an EMPTY query means every variant, which is what "all snps" means
  Write the query in the terms the records use: clinical calls are words like
  pathogenic, benign, uncertain; a variant class is snp or indel.

`filter`, for the two compound actions. Any of:
  band          "red" (flagged), "amber" (red or orange), "notred", "green"
  faults        any of: %s
  score_min score_max gc_min gc_max tm_min tm_max len_min len_max   numbers
  modality      "gapmer", "steric", "sirna"
  allele_only   true
  name_contains text

Also return:
  explain       one short sentence describing the ACTION, in plain words.
  unsupported   anything asked for that no action above covers. Be strict. Editing a
                sequence, designing, running a model, exporting, changing colours,
                loading data, anything about a file: none of these are actions here.
                List them rather than choosing the nearest action, because the nearest
                action will be run.

`query`, for ask_variants: the same search language, used ONLY to narrow which of the
visible variants the question covers ("of the TP53 ones, are any pathogenic" -> "TP53").
An empty query, which is the usual case, means every variant on screen.

Choosing between a QUESTION and an ACTION, which is the distinction that matters most:
  - A request to CHANGE WHAT IS SELECTED OR PRESENT is an action. "select the pathogenic
    variants", "remove the benign ones".
  - A request to KNOW SOMETHING is ask_variants. "are any of these pathogenic", "which of
    these are in a hotspot", "is anything here a splice variant", "what are these".
  - A question phrased as a request for a list is still a question: "show me which of these
    are pathogenic" wants to be told, not to have its selection replaced.
  - When the sentence asks to be told AND to act ("find the pathogenic ones and select
    them"), choose ask_variants. The answer it gives offers the selection as a button, so
    the user gets both, in that order, and sees what was found before it is applied.

Rules:
- "all" means an empty query or an empty filter, NOT an invented one.
- Prefer the SELECT form when the sentence is ambiguous about whether to delete.
  Selecting is reversible and deleting is the one that destroys work.
- If the request matches no action at all, return action "none" and say why in
  unsupported. Never pick an action to have picked one.

Return ONLY:
{"action": "...", "query": "...", "filter": {...}, "explain": "...", "unsupported": [...]}
""" % ("\n".join("  %-26s %s" % (k, v) for k, v in ACTIONS.items()), ", ".join(FAULTS))

NUMERIC = ("score_min", "score_max", "gc_min", "gc_max",
           "tm_min", "tm_max", "len_min", "len_max")
BANDS = ("red", "amber", "notred", "green")
MODALITIES = ("gapmer", "steric", "sirna")
DESTRUCTIVE = ("remove_variants", "remove_compounds")


def ask(model: str, prompt: str, context: Any) -> Dict[str, Any]:
    client = OpenAI()
    payload: Dict[str, Any] = {"request": prompt}
    if context:
        payload["open_now"] = context
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
    """Only a known action with known parameters gets through.

    Whatever the model returns, the editor sees one of the listed verbs or nothing. A
    stray field would be ignored downstream, which is the quiet kind of wrong: the user
    reads an explanation mentioning something the action did not use.
    """
    action = str(out.get("action") or "").strip()
    if action not in ACTIONS:
        action = "none"

    query = str(out.get("query") or "").strip()[:300]

    spec: Dict[str, Any] = {}
    raw = out.get("filter")
    if isinstance(raw, dict):
        band = str(raw.get("band") or "").strip().lower()
        if band in BANDS:
            spec["band"] = band
        faults = []
        if isinstance(raw.get("faults"), list):
            for k in raw["faults"]:
                k = str(k or "").strip().lower()
                if k in FAULTS and k not in faults:
                    faults.append(k)
        if faults:
            spec["faults"] = faults
        for k in NUMERIC:
            v = raw.get(k)
            if v is None or v == "":
                continue
            try:
                spec[k] = float(v)
            except (TypeError, ValueError):
                continue
        mod = str(raw.get("modality") or "").strip().lower()
        if mod in MODALITIES:
            spec["modality"] = mod
        if raw.get("allele_only") is True:
            spec["allele_only"] = True
        nm = str(raw.get("name_contains") or "").strip()
        if nm:
            spec["name_contains"] = nm[:120]

    unsupported: List[str] = []
    ru = out.get("unsupported")
    if isinstance(ru, list):
        unsupported = [str(x).strip() for x in ru if str(x or "").strip()][:8]
    elif isinstance(ru, str) and ru.strip():
        unsupported = [ru.strip()]

    if action == "none" and not unsupported:
        unsupported = ["nothing in the request matches an action this can take"]

    return {
        "status": "OK",
        "action": action,
        "query": query,
        "filter": spec,
        "destructive": action in DESTRUCTIVE,
        "explain": str(out.get("explain") or "").strip()[:400],
        "unsupported": unsupported,
    }


def _main() -> int:
    try:
        prompt = str(works.param(1) or "").strip()
        if not prompt:
            works.resolve({"status": "ERROR", "error": "nothing typed"})
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
