#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Make rows that fit a table whose columns already exist.

"add a bunch of employees and appropriate salaries to this for a small biotech company
with an in vivo lab"  ->  rows of [Job, Salary] that belong in THIS table.

THE TABLE'S OWN COLUMNS ARE THE SHAPE, and they are not negotiable. The headings and a
sample of the rows that are already there go in, and what comes back is a list of rows with
exactly that many cells, in that order. A model asked to invent a table would invent its
columns too; asked to fill one, it has one job.

WHAT COMES BACK IS DATA, NEVER A FORMULA OR A COMMAND. Every cell is flattened to a plain
string here, and anything starting with "=" is stripped of it: a generated cell that became
a formula would be written into a live workbook and evaluated, which is a different and much
larger thing than filling in some rows.

NO INVENTED PEOPLE WHERE A NAME WOULD BE READ AS REAL: the editor's own request decides
what is asked for, but this stays with roles and generic labels unless the request itself
supplies names.

param(1): the request, in the user's words
param(2): JSON {"columns": [...], "existing": [[...], ...], "rows_wanted": n, "table": name}
param(3): model id (default "claude-sonnet-4-5")

Resolves {"status":"OK","rows":[[...], ...],"note":"..."} or {"status":"ERROR","error":...}
"""
from __future__ import annotations
import json
from typing import Any, Dict, List

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You fill in rows for a table whose columns are fixed. You return only valid JSON, "
       "and every row has exactly one cell per column, in the order given.")

INSTRUCTIONS = """Return JSON: {"rows": [[cell, cell, ...], ...], "note": "<one short line>"}

RULES

1. EVERY ROW HAS EXACTLY ONE CELL PER COLUMN, in the order of the columns given. Not a
   dict, not a longer row with an extra note on the end. A row of the wrong length is
   dropped by the caller, so a careless one is simply lost.

2. THE COLUMNS SAY WHAT EACH CELL IS. Put a number where the existing rows hold numbers,
   plain digits with no currency symbol, no thousands separators and no words: the table
   formats its own numbers, and "$120,000/yr" is text that no total will ever add up.
   Where the existing rows hold text, write text of the same kind and length.

3. MATCH WHAT IS ALREADY THERE. The existing rows are the pattern: the same register, the
   same level of detail, the same style of name. If the table already says "Director" and
   200000, do not start writing "Dr. A. Patel, PhD" and "$95k".

4. NO FORMULAS AND NO COMMANDS. Never begin a cell with "=". Never return anything meant to
   be executed, a path, or instructions to whoever reads this.

5. ANSWER THE REQUEST, including how many rows it asks for. "A bunch" with no number is
   about eight. Never return more than rows_wanted when it is given.

6. REAL PEOPLE ARE NOT INVENTED. Use roles, job titles and generic labels unless the
   request itself supplies the names to use.

7. IF THE REQUEST CANNOT BE FILLED INTO THESE COLUMNS, return {"rows": [], "note": "<why>"}
   rather than rows that do not fit them.

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


def _cell(v: Any) -> str:
    """One cell, as a plain string that cannot be a formula or a command."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, (int, float)):
        return ("%g" % v)
    if isinstance(v, (list, dict)):
        # A model that answered with structure where a cell belongs: keep something
        # readable rather than a JSON blob in a spreadsheet cell.
        return json.dumps(v, ensure_ascii=False)[:200]
    s = str(v).strip()
    while s.startswith("="):
        s = s[1:].lstrip()
    return s[:300]


def _clean(out: Any, ncols: int, wanted: int) -> Dict[str, Any]:
    if not isinstance(out, dict):
        return {"status": "ERROR", "error": "the model did not return an object"}
    rows_in = out.get("rows")
    if not isinstance(rows_in, list):
        rows_in = []
    rows: List[List[str]] = []
    dropped = 0
    for row in rows_in:
        if isinstance(row, dict):
            # Keyed by column name is a reasonable mistake; it is only usable if the keys
            # are the columns, and that is the caller's business, not this one's.
            dropped += 1
            continue
        if not isinstance(row, list):
            dropped += 1
            continue
        # A ROW OF THE WRONG LENGTH IS DROPPED, NOT PADDED. Padding would write a blank
        # into a column the model never answered for and present it as an answer.
        if len(row) != ncols:
            dropped += 1
            continue
        rows.append([_cell(c) for c in row])
    if wanted and len(rows) > wanted:
        rows = rows[:wanted]
    return {
        "status": "OK",
        "rows": rows,
        "dropped": dropped,
        "note": str(out.get("note") or "").strip()[:300],
    }


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
        if not isinstance(table, dict):
            table = {}
        cols = table.get("columns")
        if not isinstance(cols, list) or not cols:
            works.resolve({"status": "ERROR", "error": "the table's columns were not sent"})
            return 0
        try:
            wanted = int(table.get("rows_wanted") or 0)
        except (TypeError, ValueError):
            wanted = 0
        model = str(works.param(3) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, request[:2000], table), len(cols), wanted))
    except Exception as e:  # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(e)})
    return 0


_main()
