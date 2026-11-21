#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One formula for one cell, from words or from a formula that did not work.

"=sum the cells above"  in the cell under a column of costs  ->  =sum(flight_cost[1:1][1:9])

A CELL HOLDING WORDS AFTER AN "=" IS A DESCRIPTION OF A FORMULA, and so is a formula with a
bracket missing or a table's name misspelt. The cell's text, why it is red, and what is
around it go in; one formula in the engine's own form comes back.

THIS ONLY PROPOSES. The caller checks every table and cell the formula names against the
canvas, allows only the functions it lists, and runs the formula once before writing it. A
formula it rejects comes back here once under "rejected", with the reason, for a second try.
Nothing here is trusted, so nothing here needs to pretend to be certain: when the words do
not say enough to write a formula, the answer is an empty formula and a note saying why.

param(1): what the formula should work out, in the user's words (or the broken formula)
param(2): JSON context: the cell, what it holds, why it is red, its table, other tables
param(3): model id (default "claude-sonnet-4-5")

Resolves {"status":"OK","formula":"=...","note":"..."} or {"status":"ERROR","error":...}
"""
from __future__ import annotations
import json
from typing import Any, Dict

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You write one spreadsheet formula for one cell, in a specific formula language. "
       "You return only valid JSON.")

INSTRUCTIONS = """Return JSON: {"formula": "=...", "note": "<one short line>"}

THE FORMULA LANGUAGE

1. A CELL is Table[c:c][r:r], with the column first and the row second, both counted from 0.
   A BLOCK is Table[c0:c1][r0:r1], both ends included. The table name is written exactly as
   given, and both brackets always have a colon in them: flight_cost[1:1][3:3], never
   flight_cost[1][3], never B4.

2. FUNCTIONS, and only these: sum(block)  average(block)  min(block)  max(block)  abs(x)
   sqrt(x). Arithmetic is + - * / ^ with round brackets. Nothing else exists: no IF, no
   SUMIF, no VLOOKUP, no text functions, no named ranges, no A1 references.

3. A HEADING IS NOT A NUMBER. A block handed to sum, average, min or max must hold numbers
   only, so it starts under the heading row and stops before any label or empty stretch
   that is not part of the figures.

4. NEVER READ THE CELL THE FORMULA IS GOING INTO. "the cells above" means the run of
   numbers directly above it in the same column, from under the heading down to the row
   just above the cell.

WHAT TO DO

5. "in_the_cell_now" is what the user typed. If it is words ("=sum the cells above",
   "=fuel plus crew salaries"), write the formula those words describe, using "this_table"
   and "other_tables" to find the cells: match the words to headings and to the labels at
   the start of rows.

6. If it is a formula that failed, repair it and change as little as possible: close the
   bracket, correct the table's name to one that exists, bring a row or column back inside
   the table. "why_it_is_red" and "suggested_by_the_app" say what was wrong when known.

7. If "rejected" is present, your last answer was refused for the reason given. Do not send
   it again.

8. IF THE WORDS DO NOT SAY ENOUGH TO WRITE A FORMULA, or they need something this language
   does not have, return {"formula": "", "note": "<what is missing>"}. An empty answer is
   better than a guess that reads the wrong cells.

Context:
%s
"""


def ask(model: str, request: str, context: Dict[str, Any]) -> Dict[str, Any]:
    client = OpenAI()
    prompt = (INSTRUCTIONS % json.dumps(context, ensure_ascii=False, indent=1)) \
        + "\n\nRequest:\n" + json.dumps({"request": request}, ensure_ascii=False)
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYS},
                  {"role": "user", "content": prompt}],
    )
    return json.loads(r.choices[0].message.content)


def _clean(out: Any) -> Dict[str, Any]:
    """One line of formula text and a note. The caller decides whether it is any good."""
    if not isinstance(out, dict):
        return {"status": "ERROR", "error": "the model did not return an object"}
    f = out.get("formula")
    f = f.strip() if isinstance(f, str) else ""
    # One line, one formula: anything after a line break is not part of it.
    f = f.splitlines()[0].strip() if f else ""
    if f and not f.startswith("="):
        f = "=" + f
    if len(f) > 300:
        f = ""
    return {"status": "OK", "formula": f, "note": str(out.get("note") or "").strip()[:300]}


def _main() -> int:
    try:
        request = str(works.param(1) or "").strip()
        if not request:
            works.resolve({"status": "ERROR", "error": "nothing was asked for"})
            return 0
        raw = works.param(2)
        try:
            context = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except Exception:
            context = {}
        if not isinstance(context, dict) or not context.get("cell"):
            works.resolve({"status": "ERROR", "error": "the cell was not sent"})
            return 0
        model = str(works.param(3) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, request[:1000], context)))
    except Exception as e:  # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(e)})
    return 0


_main()
