#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""A note for each row of a table: what the row is, and what its formula does.

"add a notes column that describes the formula on each row"

THE CALLER HAS ALREADY READ THE FORMULAS. For every row sent here, each formula comes with
what it reads spelled out: the table, the names of the rows and columns the reference lands
on, and the values there now. So the note is written from what the formula actually reads
on the canvas, and never from a guess at what "assumptions[1:1][31:31]" might be.

ONE NOTE PER ROW THAT WAS SENT, KEYED BY ITS ROW NUMBER. A note for a row that was not sent
is dropped by the caller. A row with nothing worth saying is left out, which leaves its cell
empty; an empty cell is better than "This row contains a value".

PLAIN WORDS, NO SYNTAX. The reader can see the formula by clicking the cell. The note is for
what the formula MEANS: names, not addresses; "divided by twelve", not "/12". It never
begins with "=", which would make the note a formula.

param(1): what the notes should say, in the user's words
param(2): JSON {"table", "headings", "rows": [{"row", "label", "tags", "cells": [...]}], "other_tables": [...]}
param(3): model id (default "claude-sonnet-4-5")

Resolves {"status":"OK","notes":{row: text}} or {"status":"ERROR","error":...}
"""
from __future__ import annotations
import json
from typing import Any, Dict

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You write short notes explaining the rows of a spreadsheet table and the formulas "
       "in them. You return only valid JSON.")

INSTRUCTIONS = """Return JSON: {"notes": {"<row>": "<note>", ...}}

1. "rows" lists the rows to write about. Each has its "row" number, its "label" (what the
   row is called), its "tags", and its "cells": for each, the column "heading", the "value"
   showing now, and, where the cell holds one, its "formula" with "reads".

2. "reads" is what the formula takes in: for each reference, the table it reads, the
   "names" of what it lands on (row labels and column headings) and the "values" there.
   WRITE FROM THIS. Say what the formula reads by NAME and what it does with it, in plain
   words:  "Annual insurance from assumptions, divided by twelve to give a monthly figure."
   Never quote the formula, an address like [1:1][31:31], or a tag in brackets.

3. A row with a formula: one or two sentences on what it works out and from what. If two
   cells in the row hold formulas, cover both briefly. Mention what it comes to now only
   if that adds something.

4. A row with no formula is an input: say what it is and that it is a figure entered
   directly (an assumption), and where "used_by" is given, what depends on it.

5. A reference marked "unresolved" could not be found on the canvas. Say plainly that the
   formula reads something that is not there, naming it. That is the most useful note the
   row can have.

6. Short: at most about 220 characters. No lists, no line breaks, no leading "=".

7. Write a note for a row only if there is something to say. An empty or purely
   decorative row is left out of "notes".

8. Follow the request below where it asks for a particular emphasis or tone.

The table:
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


def _note(v: Any) -> str:
    """One note: one line of text that cannot be a formula."""
    if not isinstance(v, str):
        return ""
    s = " ".join(v.split())
    while s.startswith("="):
        s = s[1:].lstrip()
    return s[:400]


def _clean(out: Any, rows: set) -> Dict[str, Any]:
    if not isinstance(out, dict):
        return {"status": "ERROR", "error": "the model did not return an object"}
    notes = out.get("notes")
    if not isinstance(notes, dict):
        return {"status": "ERROR", "error": "the model returned no notes"}
    kept = {}
    for k, v in notes.items():
        k = str(k)
        if k not in rows:
            continue                      # a row that was not asked about
        s = _note(v)
        if s:
            kept[k] = s
    return {"status": "OK", "notes": kept}


def _main() -> int:
    try:
        request = str(works.param(1) or "").strip() or "describe the formula on each row"
        raw = works.param(2)
        try:
            table = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except Exception:
            table = {}
        rows = table.get("rows") if isinstance(table, dict) else None
        if not isinstance(rows, list) or not rows:
            works.resolve({"status": "ERROR", "error": "no rows were sent"})
            return 0
        ids = {str(r.get("row")) for r in rows if isinstance(r, dict) and r.get("row") is not None}
        model = str(works.param(3) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, request[:2000], table), ids))
    except Exception as e:  # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(e)})
    return 0


_main()
