#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Project budget builder -- the P&L With Capital flow for a PROJECT: no revenue, ongoing
donations, grants or other income, expenses by category, a reserve, and milestones.

param(1): the user's description of the project.

Returns the artifact data-model-to-tables-gpt builds from (tables keyed by cell, formulas
keyed by cell, annotations, units) plus `milestones` and `window` for the timeline.
"""
from __future__ import annotations

import json
import os
import random
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

from claude_chat import Claude as OpenAI  # Claude replaces OpenAI

MODEL = "claude-haiku-4-5"   # the fast model, always: this is a short structured plan


def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"


def _label(s: str, maxlen: int = 40) -> str:
    """A machine-friendly label: words joined by single underscores, no leading or
    trailing underscore, cut at a word boundary. A cut that left a trailing underscore
    produced "Name__Per_Month" and a reference the formula engine could not resolve."""
    s = re.sub(r"['\u2019]", "", str(s or ""))          # Children's -> Childrens, not Children_s
    # No digits: the table builder rewrites "2_P" as "2*_P" (implied multiplication) even
    # inside a bracketed reference, which breaks the link between the row and its formula.
    s = re.sub(r"\d+", " ", s)
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


def _unique(labels_taken: set, lab: str) -> str:
    """Two sources or categories reduced to the same label would collide as table rows."""
    base, out, n = lab, lab, 0
    while out in labels_taken:
        out = f"{base}_{chr(ord('B') + (n % 25))}"   # a LETTER suffix, never a digit
        n += 1
    labels_taken.add(out)
    return out


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "project_name": {"type": "string"},
        "start_date": {"type": "string"},
        "duration_months": {"type": "integer"},
        "opening_reserve": {"type": "number"},
        "income": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                   "properties": {"label": {"type": "string"}, "monthly_amount": {"type": "number"}, "note": {"type": "string"}},
                   "required": ["label", "monthly_amount", "note"]}},
        "expenses": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                     "properties": {"label": {"type": "string"}, "monthly_amount": {"type": "number"}, "note": {"type": "string"}},
                     "required": ["label", "monthly_amount", "note"]}},
        "one_off_costs": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                          "properties": {"label": {"type": "string"}, "amount": {"type": "number"}, "date": {"type": "string"}},
                          "required": ["label", "amount", "date"]}},
        "milestones": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                       "properties": {"name": {"type": "string"}, "date": {"type": "string"}},
                       "required": ["name", "date"]}},
        "summary": {"type": "string"},
    },
    "required": ["project_name", "start_date", "duration_months", "opening_reserve", "income", "expenses", "one_off_costs", "milestones", "summary"],
}


def plan(prompt: str) -> Dict[str, Any]:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    # A stalled request must not cost two minutes: 60 s, one retry (the client's defaults
    # are 120 s and two retries), and the fast model, whatever the environment says.
    client = OpenAI(api_key=os.getenv("ANTHROPIC_API_KEY", ""), timeout=60, max_retries=1)
    today = datetime.now().strftime("%Y-%m-%d")
    if works is not None:
        try: works.msg("Asking Claude to plan the budget (usually 5-20 s)...")
        except Exception: pass
    r = client.responses.create(
        model=MODEL,
        instructions=(
            "You plan the budget of a PROJECT that earns no revenue: it is funded by ongoing donations, grants, "
            "membership dues, sponsorship or other income, and spends on staff, materials, facilities, travel, "
            "outreach and the like. Return only JSON matching the schema. Amounts are per month in USD unless the "
            "text says otherwise; convert yearly figures to monthly. Give 2 to 5 income sources and 4 to 10 expense "
            "categories with realistic amounts for the project described; a few one-off costs with dates; and 5 to 10 "
            "dated milestones (kickoff, hires, deliverables, reviews, completion) spread across the project. "
            f"Dates are YYYY-MM-DD; if the text gives no start, start next month after {today}. Duration in months."
        ),
        input=prompt,
        text={"format": {"type": "json_schema", "name": "project_budget", "schema": SCHEMA, "strict": True}},
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
        try: works.msg("Laying out the assumptions, income, expenses and budget tables...")
        except Exception: pass
    name = _label(p.get("project_name") or "Project")
    start = _date(p.get("start_date"), datetime.now().replace(day=1) + timedelta(days=32))
    months = max(1, int(p.get("duration_months") or 12))
    end = start + timedelta(days=int(months * 30.44))

    A, I, E, B = "Project_Assumptions", "Project_Income", "Project_Expenses", "Project_Budget"
    tables: Dict[str, Any] = {}
    formulas: Dict[str, str] = {}
    ann: Dict[str, str] = {}
    units: Dict[str, Dict[str, str]] = {A: {}, I: {}, E: {}, B: {}}

    # ---- assumptions: the inputs (values the user edits) ----
    rows_a: List[Tuple[str, Any, str]] = [
        ("Project_Name", name.replace("_", " "), ""),
        ("Start_Date", start.strftime("%Y-%m-%d"), ""),
        ("Duration_Months", months, "months"),
        ("Opening_Reserve", float(p.get("opening_reserve") or 0), "USD"),
    ]
    taken: set = set()
    inc = [(_unique(taken, _label(x["label"])), float(x["monthly_amount"]), x.get("note", "")) for x in (p.get("income") or []) if x.get("label")]
    exp = [(_unique(taken, _label(x["label"])), float(x["monthly_amount"]), x.get("note", "")) for x in (p.get("expenses") or []) if x.get("label")]
    one = [(_unique(taken, _label(x["label"])), float(x["amount"]), _date(x.get("date"), start)) for x in (p.get("one_off_costs") or []) if x.get("label")]
    for lab, amt, note in inc:
        rows_a.append((f"{lab}_Per_Month", amt, "USD/month"))
    for lab, amt, note in exp:
        rows_a.append((f"{lab}_Per_Month", amt, "USD/month"))
    for lab, amt, d in one:
        rows_a.append((f"{lab}_One_Off", amt, "USD"))
    tables[_key(A, 0, 0)] = "Label"; tables[_key(A, 1, 0)] = "Value"
    for r, (lab, val, unit) in enumerate(rows_a, start=1):
        tables[_key(A, 0, r)] = lab
        tables[_key(A, 1, r)] = val
        if unit:
            units[A][lab] = unit
    ann[A] = "Inputs: edit any value and the budget below recalculates."

    # ---- income: one row per source, monthly and over the project ----
    tables[_key(I, 0, 0)] = "Label"; tables[_key(I, 1, 0)] = "Value"
    r = 1
    inc_labels = []
    for lab, amt, note in inc:
        tables[_key(I, 0, r)] = f"{lab}_Per_Month"
        formulas[_key(I, 1, r)] = f"{A}[{lab}_Per_Month]"
        inc_labels.append(f"{I}[{lab}_Per_Month]")
        r += 1
    tables[_key(I, 0, r)] = "Total_Income_Per_Month"
    formulas[_key(I, 1, r)] = "+".join(inc_labels) if inc_labels else "0"
    r += 1
    tables[_key(I, 0, r)] = "Total_Income_Over_Project"
    formulas[_key(I, 1, r)] = f"{I}[Total_Income_Per_Month]*{A}[Duration_Months]"
    ann[I] = "No revenue: the project is carried by donations, grants and other income."

    # ---- expenses: one row per category, one-offs, totals ----
    tables[_key(E, 0, 0)] = "Label"; tables[_key(E, 1, 0)] = "Value"
    r = 1
    exp_labels = []
    for lab, amt, note in exp:
        tables[_key(E, 0, r)] = f"{lab}_Per_Month"
        formulas[_key(E, 1, r)] = f"{A}[{lab}_Per_Month]"
        exp_labels.append(f"{E}[{lab}_Per_Month]")
        r += 1
    tables[_key(E, 0, r)] = "Total_Expenses_Per_Month"
    formulas[_key(E, 1, r)] = "+".join(exp_labels) if exp_labels else "0"
    r += 1
    one_labels = []
    for lab, amt, d in one:
        tables[_key(E, 0, r)] = f"{lab}_One_Off"
        formulas[_key(E, 1, r)] = f"{A}[{lab}_One_Off]"
        one_labels.append(f"{E}[{lab}_One_Off]")
        r += 1
    tables[_key(E, 0, r)] = "One_Off_Costs_Total"
    formulas[_key(E, 1, r)] = "+".join(one_labels) if one_labels else "0"
    r += 1
    tables[_key(E, 0, r)] = "Total_Expenses_Over_Project"
    formulas[_key(E, 1, r)] = f"{E}[Total_Expenses_Per_Month]*{A}[Duration_Months]+{E}[One_Off_Costs_Total]"
    ann[E] = "Monthly costs by category, plus one-off costs."

    # ---- budget: the P&L of a project ----
    rows_b = [
        ("Total_Income_Per_Month", f"{I}[Total_Income_Per_Month]"),
        ("Total_Expenses_Per_Month", f"{E}[Total_Expenses_Per_Month]"),
        ("Net_Per_Month", f"{B}[Total_Income_Per_Month]-{B}[Total_Expenses_Per_Month]"),
        ("Total_Income_Over_Project", f"{I}[Total_Income_Over_Project]"),
        ("Total_Expenses_Over_Project", f"{E}[Total_Expenses_Over_Project]"),
        ("Net_Over_Project", f"{B}[Total_Income_Over_Project]-{B}[Total_Expenses_Over_Project]"),
        ("Reserve_At_End", f"{A}[Opening_Reserve]+{B}[Net_Over_Project]"),
        ("Funding_Gap", f"{B}[Total_Expenses_Over_Project]-{B}[Total_Income_Over_Project]-{A}[Opening_Reserve]"),
        ("Months_Of_Runway", f"({A}[Opening_Reserve]+{B}[Total_Income_Per_Month]*{A}[Duration_Months])/{B}[Total_Expenses_Per_Month]"),
        ("Income_Covers_Costs_Pct", f"{B}[Total_Income_Per_Month]/{B}[Total_Expenses_Per_Month]"),
    ]
    tables[_key(B, 0, 0)] = "Label"; tables[_key(B, 1, 0)] = "Value"
    for r, (lab, f) in enumerate(rows_b, start=1):
        tables[_key(B, 0, r)] = lab
        formulas[_key(B, 1, r)] = f
        units[B][lab] = "fraction" if lab.endswith("_Pct") else ("months" if "Months" in lab else "USD")
    ann[B] = "The project's bottom line: what it costs, what carries it, and what is left (a positive Funding_Gap must still be raised)."

    # ---- timeline: milestones, funding events and one-off costs on one axis ----
    ms: List[Dict[str, Any]] = []
    for m in (p.get("milestones") or []):
        d = _date(m.get("date"), start)
        ms.append({"name": str(m.get("name") or "Milestone"), "date": d, "color": "#0a2540"})
    for lab, amt, d in one:
        ms.append({"name": f"{lab.replace('_', ' ')} (${amt:,.0f})", "date": d, "color": "#FD5E53"})
    ms.append({"name": "Kickoff", "date": start, "color": "#1aa3bd"})
    ms.append({"name": "Project end", "date": end, "color": "#1aa3bd"})
    ms.sort(key=lambda x: x["date"])
    dmin, dmax = ms[0]["date"], ms[-1]["date"]
    points = []
    for m in ms:
        hrs = (m["date"] - dmin).total_seconds() / 3600.0
        points.append({"x": hrs, "y": round(random.uniform(0.35, 0.65), 3), "type": "milestone",
                       "name": m["name"], "color": m["color"], "date": m["date"].isoformat()})

    return {
        "tables": tables,
        "formulas": formulas,
        "annotations": ann,
        "units": units,
        "diagnostics": "NO_ISSUES_DETECTED",
        "project": {"name": name, "start": start.isoformat(), "end": end.isoformat(), "months": months, "summary": p.get("summary", "")},
        "milestones": points,
        "window": {"start": dmin.isoformat(), "end": dmax.isoformat()},
    }


def _main() -> int:
    if works is not None:
        try:
            works.msg("Planning the project budget...")
            works.resolve(build(str(works.param(1) or "")))
        except Exception as e:
            works.resolve({"status": "error", "error": str(e), "where": "project-budget"})
        return 0
    import sys
    print(json.dumps(build(sys.argv[1] if len(sys.argv) > 1 else "A two-year community food bank project"), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
