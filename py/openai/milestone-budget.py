#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Milestone budget -- the simplest project model: no monthly costs, just milestones, each with
the amount it takes to deliver. The timeline shows, at every milestone, the budget required
by that date: the chronological accumulation of the milestone amounts.

param(1): the user's description of the project.

Returns the artifact data-model-to-tables-gpt builds from (tables, formulas, annotations,
units) plus `milestones` and `window` for the timeline. Two tables:
  Milestone_Budgets   Label/Value inputs: Project_Name, Start_Date, End_Date, <milestone>_Budget
  Project_Milestones  Label | Date | Day | Comment | Budget | Required_To_Date (+ a Total row)
Every timeline point carries its table and row label (point.table, point.row), so the
workbench keeps the row's date and the point's date in step and re-accumulates the
Required_To_Date column when a milestone moves.
"""
from __future__ import annotations

import json
import os
import random
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

from claude_chat import Claude as OpenAI  # Claude replaces OpenAI

MODEL = "claude-haiku-4-5"


def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"


def _label(s: str, maxlen: int = 40) -> str:
    s = re.sub(r"['’]", "", str(s or ""))
    s = re.sub(r"\d+", " ", s)                 # no digits: the table builder's implied multiplication
    s = re.sub(r"[^A-Za-z_ ]+", " ", s)
    s = re.sub(r"\s+", "_", s.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    if len(s) > maxlen:
        cut = s[:maxlen]
        s = cut[:cut.rfind("_")] if "_" in cut else cut
        s = s.strip("_")
    if not s or not re.match(r"[A-Za-z_]", s):
        s = "X_" + s
    return s


def _unique(taken: set, lab: str) -> str:
    base, out, n = lab, lab, 0
    while out in taken:
        out = f"{base}_{chr(ord('B') + (n % 25))}"
        n += 1
    taken.add(out)
    return out


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "project_name": {"type": "string"},
        "start_date": {"type": "string"},
        "milestones": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                       "properties": {"name": {"type": "string"}, "date": {"type": "string"},
                                      "comment": {"type": "string"}, "budget": {"type": "number"}},
                       "required": ["name", "date", "comment", "budget"]}},
        "summary": {"type": "string"},
    },
    "required": ["project_name", "start_date", "milestones", "summary"],
}


def plan(prompt: str) -> Dict[str, Any]:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    client = OpenAI(api_key=os.getenv("ANTHROPIC_API_KEY", ""), timeout=60, max_retries=1)
    today = datetime.now().strftime("%Y-%m-%d")
    if works is not None:
        try: works.msg("Asking Claude for the milestones and their budgets (usually 5-15 s)...")
        except Exception: pass
    r = client.responses.create(
        model=MODEL,
        instructions=(
            "You lay out a PROJECT as milestones. Return only JSON matching the schema. Give 5 to 12 dated "
            "milestones in chronological order (kickoff, design, purchases, builds, hires, deliveries, reviews, "
            "launch, completion), each with a one-sentence comment on what it delivers and budget: the amount in "
            "USD it takes to deliver THAT milestone (its own cost, not a running total; 0 if it costs nothing). "
            f"Dates are YYYY-MM-DD; if the text gives no start, start next month after {today}."
        ),
        input=prompt,
        text={"format": {"type": "json_schema", "name": "milestone_budget", "schema": SCHEMA, "strict": True}},
    )
    return json.loads(r.output_text)


def _date(s: str, fallback: datetime) -> datetime:
    try:
        return datetime.fromisoformat(str(s)[:10])
    except Exception:
        return fallback


def build(prompt: str) -> Dict[str, Any]:
    p = plan(prompt)
    if works is not None:
        try: works.msg("Laying out the milestones and the budget required by date...")
        except Exception: pass
    name = _label(p.get("project_name") or "Project")
    start = _date(p.get("start_date"), datetime.now().replace(day=1) + timedelta(days=32))

    B, M = "Milestone_Budgets", "Project_Milestones"
    tables: Dict[str, Any] = {}
    formulas: Dict[str, str] = {}
    ann: Dict[str, str] = {}
    units: Dict[str, Dict[str, str]] = {B: {}, M: {}}

    taken: set = set()
    ms: List[Dict[str, Any]] = []
    for m in (p.get("milestones") or []):
        nm = str(m.get("name") or "Milestone")
        ms.append({"lab": _unique(taken, _label(nm)), "name": nm, "date": _date(m.get("date"), start),
                   "comment": str(m.get("comment") or ""), "budget": float(m.get("budget") or 0)})
    if not ms:
        ms.append({"lab": "Kickoff", "name": "Kickoff", "date": start, "comment": "Project starts.", "budget": 0.0})
    ms.sort(key=lambda x: x["date"])
    end = ms[-1]["date"]

    # ---- inputs: the project and each milestone's budget ----
    tables[_key(B, 0, 0)] = "Label"; tables[_key(B, 1, 0)] = "Value"
    rows_b = [("Project_Name", name.replace("_", " "), ""), ("Start_Date", start.strftime("%Y-%m-%d"), ""),
              ("End_Date", end.strftime("%Y-%m-%d"), "")]
    for m in ms:
        rows_b.append((f"{m['lab']}_Budget", m["budget"], "USD"))
    for r, (lab, val, unit) in enumerate(rows_b, start=1):
        tables[_key(B, 0, r)] = lab
        tables[_key(B, 1, r)] = val
        if unit:
            units[B][lab] = unit
    ann[B] = "Inputs: the amount each milestone takes. Edit any budget and the required-by-date column follows."

    # ---- milestones: date, comment, budget, and the budget required by that date ----
    cols = ["Label", "Date", "Day", "Comment", "Budget", "Required_To_Date"]
    for c, h in enumerate(cols):
        tables[_key(M, c, 0)] = h
    refs: List[str] = []
    r = 1
    for m in ms:
        ref = f"{B}[{m['lab']}_Budget]"
        refs.append(ref)
        tables[_key(M, 0, r)] = m["lab"]
        tables[_key(M, 1, r)] = m["date"].strftime("%Y-%m-%d")
        tables[_key(M, 2, r)] = m["date"].strftime("%a")
        tables[_key(M, 3, r)] = m["comment"]
        formulas[_key(M, 4, r)] = ref
        formulas[_key(M, 5, r)] = "+".join(refs)        # everything due on or before this milestone
        r += 1
    tables[_key(M, 0, r)] = "Total"
    tables[_key(M, 1, r)] = end.strftime("%Y-%m-%d")
    tables[_key(M, 2, r)] = end.strftime("%a")
    tables[_key(M, 3, r)] = "All milestones."
    formulas[_key(M, 4, r)] = "+".join(refs)
    formulas[_key(M, 5, r)] = "+".join(refs)
    units[M]["Budget"] = "USD"; units[M]["Required_To_Date"] = "USD"
    ann[M] = "Each milestone with its own budget, and the budget required by its date: the milestone amounts accumulated in date order."

    # ---- timeline ----
    dmin, dmax = ms[0]["date"], ms[-1]["date"]
    points = []
    for m in ms:
        hrs = (m["date"] - dmin).total_seconds() / 3600.0
        points.append({"x": hrs, "y": round(random.uniform(0.35, 0.65), 3), "type": "milestone",
                       "name": m["name"], "color": "#0a2540", "date": m["date"].isoformat(),
                       "table": M, "row": m["lab"]})

    return {
        "tables": tables, "formulas": formulas, "annotations": ann, "units": units,
        "diagnostics": "NO_ISSUES_DETECTED",
        "project": {"name": name, "start": start.isoformat(), "end": end.isoformat(), "summary": p.get("summary", "")},
        "milestones": points,
        "window": {"start": dmin.isoformat(), "end": dmax.isoformat()},
    }


def _main() -> int:
    if works is not None:
        try:
            works.msg("Planning the milestone budget...")
            works.resolve(build(str(works.param(1) or "")))
        except Exception as e:
            works.resolve({"status": "error", "error": str(e), "where": "milestone-budget"})
        return 0
    import sys
    print(json.dumps(build(sys.argv[1] if len(sys.argv) > 1 else "A school robotics club build-out over one year"), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
