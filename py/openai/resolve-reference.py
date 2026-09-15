#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Resolve a formula's missing references (Ion works).

A table formula such as
    IF(PnL[Net_Income]>0,10,Capital_Assumptions[Initial_Capital_Investment]/ABSPnL[Net_Income])
names something the model does not have. The JavaScript side has already tried the cheap
repairs (case, near-miss spelling, a function name run into a table name). What is left is
asked here: is the reference a rewrite of something that exists, or an input the model is
missing that should be created with a sensible default?

param(1): JSON  { "formula": str,
                  "missing": [ {"table": str, "key": str}, ... ],
                  "tables":  [ {"name": str, "labels": [str, ...]}, ... ] }
param(2): model id (optional; default "claude-haiku-4-5")

Resolves JSON:
    { "status": "OK", "formula": str, "tables": { "Table[Row_Label]": number, ... }, "notes": [str] }
The "tables" map is in the shape baja/draw/data-model-to-tables-gpt.js accepts, so the caller
can hand it straight to the model builder: a row is added to an existing table, or a new
two-column Label/Value table is created.
"""
from __future__ import annotations
import json
from typing import Any, Dict

from ion import works
from claude_chat import Claude as OpenAI  # Claude (fastest model) replaces OpenAI

SYS = "You repair spreadsheet-style formulas for a financial model. Only output valid JSON."

INSTRUCTIONS = """
A formula references something the model does not have. Tables are referenced as
Table[Row_Label]; functions are written FUNCTION(...).

For each missing reference decide which it is:
  (a) a typo, a case mismatch, or a function name run into a table name — e.g. ABSPnL[Net_Income]
      means ABS(PnL[Net_Income]) — then REWRITE the formula so it uses what exists; or
  (b) an input the model genuinely lacks — then CREATE it: put the row in the existing table it
      clearly belongs to, otherwise in a new table named for what it holds, with a sensible
      numeric default and a short note explaining the choice.

Return ONLY this JSON:
{
  "formula": "<the corrected formula, or the original when only inputs were created>",
  "tables": { "Table[Row_Label]": <number>, ... },
  "notes": ["one short sentence per decision"]
}

Rules:
- Keep every reference that already exists exactly as written; never rename existing tables.
- Labels are machine-friendly: letters, digits and underscores only.
- Values are plain numbers (no units, no commas).
- Prefer a rewrite over creating an input when the typed name is within a letter or two of
  something that exists.
"""


def ask(model: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = OpenAI()
    r = client.chat.completions.create(
        model=model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYS},
            {"role": "user", "content": INSTRUCTIONS + "\n\nModel:\n" + json.dumps(payload, ensure_ascii=False)},
        ],
    )
    return json.loads(r.choices[0].message.content)


def _clean(out: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    formula = out.get("formula")
    if not isinstance(formula, str) or not formula.strip():
        formula = payload.get("formula", "")
    tables_in = out.get("tables") or {}
    tables: Dict[str, Any] = {}
    if isinstance(tables_in, dict):
        for k, v in tables_in.items():
            key = str(k).strip()
            if "[" not in key or not key.endswith("]"):
                continue
            try:
                num = float(v)
                if num.is_integer():
                    num = int(num)
            except Exception:
                continue
            tables[key] = num
    notes = out.get("notes") or []
    if not isinstance(notes, list):
        notes = [str(notes)]
    return {"status": "OK", "formula": formula.strip(), "tables": tables, "notes": [str(n) for n in notes]}


def _main() -> None:
    raw = works.param(1)
    try:
        payload = raw if isinstance(raw, dict) else json.loads(raw)
    except Exception as e:
        works.resolve({"status": "ERROR", "error": "param(1) must be JSON: " + str(e)})
        return
    model = works.param(2) or "claude-haiku-4-5"
    try:
        works.msg("Resolving a missing reference with Claude…")
        works.resolve(_clean(ask(model, payload), payload))
    except Exception as e:
        works.resolve({"status": "ERROR", "error": str(e)})


if __name__ == "__main__":
    _main()
