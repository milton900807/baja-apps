#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""An answer to a question about a table, from what is on the canvas.

"how many kegs does this create"

A QUESTION IS NOT AN OPERATION. The command card matches a sentence to something the app can
do, and a question asks for nothing to be done: it was answered "Nothing here does that".
This is the other kind of reply. The caller sends the table the question was asked from and
the other tables on the canvas, cell by cell, and gets back an answer with its working.

THE STRATEGY, IN ORDER. The first that applies is the answer:

  read       the answer is already a cell on the canvas (a total, a capacity, a result
             somebody built). Quote it and say which cell.
  calculated the numbers needed are on the canvas but nobody has combined them. Give the
             arithmetic on those numbers and the cells they came from.
  estimate   a number that is needed is NOT on the canvas (how much malt goes in a keg).
             Answer with a stated outside figure, and list every such figure as an
             assumption. Never slip one in unmarked.
  describe   the question is about what the table is or holds, not a number. Say it.
  cannot     nothing on the canvas bears on it and no honest estimate is possible. Say what
             would have to be there.

THE CALLER CHECKS WHAT COMES BACK. Every cell cited is looked up again on the canvas and its
value replaced by the one really there; a cell that does not exist is dropped. The arithmetic
is redone from "calc", which is why it must be plain numbers and + - * / ( ) only.

param(1): the question, in the user's words
param(2): JSON {"asked": name, "tables": [{"name", "columns", "rows", "cells": [{"at", "row", "column", "value", "formula"?, "tags"?}]}]}
param(3): model id (default "claude-sonnet-4-5")

Resolves {"status":"OK","answer":{...}} or {"status":"ERROR","error":...}
"""
from __future__ import annotations
import json
import re
from typing import Any, Dict

from ion import works
from claude_chat import Claude as OpenAI

SYS = ("You answer questions about the tables on a spreadsheet canvas, from the cells you "
       "are given. You return only valid JSON.")

INSTRUCTIONS = """Return JSON:
{"kind": "read" | "calculated" | "estimate" | "describe" | "cannot",
 "answer": "<the answer, in one to three plain sentences>",
 "calc": "<arithmetic on plain numbers, e.g. (500+50)/3.9, or empty>",
 "result": <the number calc comes to, or null>,
 "unit": "<kegs, dollars, lbs ... or empty>",
 "from": [{"table": "<name>", "at": "<the cell's at, copied exactly>", "value": "<its value>", "why": "<what it is, a few words>"}],
 "assumed": ["<each figure used that is NOT on the canvas, with its value and unit>"],
 "missing": "<what would have to be on the canvas to answer properly, or empty>",
 "next": "<one request the app could carry out to put this answer on the canvas, or empty>"}

"asked" names the table the question is about; "this", "it", "the table" mean that one. The
other tables are there because the answer often lives in them. Each cell has "at" (its
address), "row" and "column" (the names of its row and column), its "value", and where it
has one its "formula" and "tags".

Work through these in order and stop at the first that applies:

1. READ. Look for a cell that already IS the answer, in ANY table: a row or column whose
   name matches what is asked (a total, a capacity, a count, a result). If there is one,
   kind is "read", the answer quotes its value, and "from" cites that cell. A cell showing
   NaN, an error or nothing is not an answer: say so and go on to 2.

2. CALCULATED. If no cell is the answer but the numbers it needs are on the canvas, work it
   out. kind is "calculated". Put the arithmetic in "calc" using ONLY plain numbers and
   + - * / ( ), no names, no units, no functions; put what it comes to in "result"; cite
   in "from" every cell a number came from. Strip units from values yourself ("500 lbs" is
   500) and say the unit in "unit".

3. ESTIMATE. If a number that is needed is not on the canvas, you may use a well known
   outside figure ONLY if you list it in "assumed" with its value, and say in the answer
   that it is an estimate resting on that figure. kind is "estimate". Still give "calc"
   and "result", and cite the cells that were on the canvas. In "missing" say which row
   would make it exact.

4. DESCRIBE. If the question asks what the table is, holds or means, answer in words from
   the cells. kind is "describe". Cite the cells you lean on, a few at most.

5. CANNOT. If none of these is honest, kind is "cannot", "answer" says plainly that the
   canvas does not hold it, and "missing" says what would have to be there.

Rules for all of them:
- Never invent a cell. "at" and "table" are copied from what you were given.
- Never state a number that is neither a cited cell, nor in "assumed", nor the result of "calc".
- Names, not addresses, in the answer text: "Pale Malt", not [1:1][0:0].
- "next" is a request in the user's own kind of words that would BUILD the answer on the
  canvas as formulas, for example "make a new table that works out how many kegs these
  ingredients make". Leave it empty when the answer was read from a cell that is already there.

The canvas:
%s
"""


def ask(model: str, question: str, canvas: Dict[str, Any]) -> Dict[str, Any]:
    client = OpenAI()
    prompt = (INSTRUCTIONS % json.dumps(canvas, ensure_ascii=False, indent=1)) \
        + "\n\nQuestion:\n" + json.dumps({"question": question}, ensure_ascii=False)
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": SYS},
                  {"role": "user", "content": prompt}],
    )
    return json.loads(r.choices[0].message.content)


KINDS = ("read", "calculated", "estimate", "describe", "cannot")
CALC = re.compile(r"^[0-9\s.+\-*/()]*$")


def _text(v: Any, n: int) -> str:
    return " ".join(str(v).split())[:n] if isinstance(v, (str, int, float)) and not isinstance(v, bool) else ""


def _clean(out: Any) -> Dict[str, Any]:
    if not isinstance(out, dict):
        return {"status": "ERROR", "error": "the model did not return an object"}
    kind = str(out.get("kind") or "").strip().lower()
    answer = _text(out.get("answer"), 1200)
    if kind not in KINDS or not answer:
        return {"status": "ERROR", "error": "the model returned no answer"}
    calc = _text(out.get("calc"), 300)
    if not CALC.match(calc):
        calc = ""                         # anything but plain arithmetic is not redone, so not shown
    result = out.get("result")
    if isinstance(result, bool) or not isinstance(result, (int, float)):
        result = None
    cited = []
    for c in (out.get("from") if isinstance(out.get("from"), list) else [])[:12]:
        if not isinstance(c, dict):
            continue
        table, at = _text(c.get("table"), 120), _text(c.get("at"), 40)
        if table and at:
            cited.append({"table": table, "at": at, "value": _text(c.get("value"), 120), "why": _text(c.get("why"), 120)})
    assumed = [s for s in (_text(a, 200) for a in (out.get("assumed") if isinstance(out.get("assumed"), list) else [])[:8]) if s]
    return {"status": "OK", "answer": {
        "kind": kind, "answer": answer, "calc": calc, "result": result, "unit": _text(out.get("unit"), 40),
        "from": cited, "assumed": assumed, "missing": _text(out.get("missing"), 400), "next": _text(out.get("next"), 300)}}


def _main() -> int:
    try:
        question = str(works.param(1) or "").strip()
        raw = works.param(2)
        try:
            canvas = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except Exception:
            canvas = {}
        if not question:
            works.resolve({"status": "ERROR", "error": "no question was asked"})
            return 0
        if not isinstance(canvas, dict) or not canvas.get("tables"):
            works.resolve({"status": "ERROR", "error": "no tables were sent"})
            return 0
        model = str(works.param(3) or "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
        works.resolve(_clean(ask(model, question[:2000], canvas)))
    except Exception as e:  # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(e)})
    return 0


_main()
