#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Values for the cells that are selected, from one sentence.

"typical monthly cost for each of these"  with a column of empty cells selected, each beside
its label  ->  one value per cell.

THE CELLS ARE NAMED, AND ONLY THOSE ARE ANSWERED FOR. The caller sends each selected cell
with an id, the label at the start of its row, the heading over its column and what it holds
now. One value comes back per id. Nothing is said about any other cell, and the caller
writes nothing it did not ask for.

VALUES, NOT FORMULAS. A value beginning "=" has it taken off here and again by the caller:
the formula service is a different request (the same prompt, started with "="), which checks
what it writes against the tables on the canvas. A generated formula written from here would
skip all of that.

NO INVENTED PRECISION, AND NO FILLING FOR THE SAKE OF IT. A typical figure is given as a
round one. A cell the request says nothing sensible about is left out of the answer, which
leaves it as it is, and the note says so.

param(1): what the cells should hold, in the user's words
param(2): JSON {"table", "headings": [...], "cells": [{"id","row","column","label","heading","now"}]}
param(3): model id (default "claude-sonnet-4-5")

Resolves {"status":"OK","values":{id: value},"note":"..."} or {"status":"ERROR","error":...}
"""
from __future__ import annotations
import json
from typing import Any, Dict

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You fill in spreadsheet cells from a short request. You return only valid JSON.")

INSTRUCTIONS = """Return JSON: {"values": {"<id>": "<value>", ...}, "note": "<one short line>"}

1. "cells" lists the cells to fill. Each has an "id", the "label" at the start of its row,
   the "heading" over its column, and "now" (what it holds, often nothing). Answer for those
   ids and no others.

2. Each value is what belongs in THAT cell, read from its own label and heading: the row
   says what the thing is, the column says which fact about it is wanted.

3. NUMBERS ARE PLAIN: no currency sign, no thousands separators, no units, no words. 2500,
   not "$2,500" and not "2500 per month". The column already says what the number is.
   Typical or default figures are round figures: 2500, not 2487.

4. Text is short: a few words, the way a cell would hold it.

5. NEVER A FORMULA. No value begins with "=".

6. If the request says one value for all of them ("set these to 0", "all of them TBD"),
   give every id that value.

7. A cell you cannot sensibly answer for is LEFT OUT of "values". Do not write "N/A",
   "unknown" or a guess to fill the gap. Say in the note what was left out and why.

The cells:
%s
"""


def ask(model: str, request: str, table: Dict[str, Any]) -> Dict[str, Any]:
    client = OpenAI()
    prompt = (INSTRUCTIONS % json.dumps(table, ensure_ascii=False, indent=1)) \
        + "\n\nRequest:\n" + json.dumps({"request": request}, ensure_ascii=False)
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYS},
                  {"role": "user", "content": prompt}],
    )
    return json.loads(r.choices[0].message.content)


def _value(v: Any) -> str:
    """One cell's value as a plain string that cannot be a formula."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    s = str(v).strip()
    while s.startswith("="):
        s = s[1:].lstrip()
    return s[:300]


def _clean(out: Any, ids: set) -> Dict[str, Any]:
    if not isinstance(out, dict):
        return {"status": "ERROR", "error": "the model did not return an object"}
    vals = out.get("values")
    if not isinstance(vals, dict):
        return {"status": "ERROR", "error": "the model returned no values"}
    kept = {}
    for k, v in vals.items():
        k = str(k)
        if k not in ids:
            continue                      # an id that was not asked about
        s = _value(v)
        if s != "":
            kept[k] = s
    return {"status": "OK", "values": kept, "note": str(out.get("note") or "").strip()[:300]}


def _main() -> int:
    try:
        request = str(works.param(1) or "").strip()
        if not request:
            works.resolve({"status": "ERROR", "error": "nothing was asked for"})
            return 0
        raw = works.param(2)
        try:
            table = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except Exception:
            table = {}
        cells = table.get("cells") if isinstance(table, dict) else None
        if not isinstance(cells, list) or not cells:
            works.resolve({"status": "ERROR", "error": "no cells were sent"})
            return 0
        ids = {str(c.get("id")) for c in cells if isinstance(c, dict) and c.get("id") is not None}
        model = str(works.param(3) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, request[:2000], table), ids))
    except Exception as e:  # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(e)})
    return 0


_main()
