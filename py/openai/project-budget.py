#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Project budget builder -- the P&L With Capital flow for a PROJECT: no revenue, ongoing
donations, grants or other income, expenses by category, a reserve, and milestones.

param(1): the user's description of the project.

Returns the artifact data-model-to-tables-gpt builds from (tables keyed by cell, formulas
keyed by cell, annotations, units) plus `milestones` and `window` for the timeline. The last
table, Project_Quarterly, is the budget required at quarterly intervals with a project total.
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
                       "properties": {"name": {"type": "string"}, "date": {"type": "string"},
                                      "comment": {"type": "string"}, "budget": {"type": "number"}},
                       "required": ["name", "date", "comment", "budget"]}},
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
            "categories with realistic amounts for the project described. ALSO give 2 to 8 ONE-TIME project costs "
            "(equipment, set-up, permits and licences, launch, training, close-out and the like), each a single amount "
            "with the date it falls due inside the project; these are separate from the monthly categories. And 5 to 10 "
            "dated milestones (kickoff, hires, deliverables, reviews, completion) spread across the project, each with a "
            "one-sentence comment on what it means for the project and budget: the amount in USD it takes to deliver THAT "
            "milestone itself (a deliverable, an event, a purchase tied to it; 0 when it costs nothing beyond the monthly "
            "categories and one-time costs). "
            f"Dates are YYYY-MM-DD; if the text gives no start, start next month after {today}. Duration in months."
        ),
        input=prompt,
        text={"format": {"type": "json_schema", "name": "project_budget", "schema": SCHEMA, "strict": True}},
    )
    return json.loads(r.output_text)


def _add_months(d: datetime, n: int) -> datetime:
    """Calendar months, not 30.44-day steps: a quarter that starts on the 1st ends on a 1st."""
    y = d.year + (d.month - 1 + n) // 12
    m = (d.month - 1 + n) % 12 + 1
    last = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return d.replace(year=y, month=m, day=min(d.day, last))


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
    end = _add_months(start, months)

    A, I, E, O, B = "Project_Assumptions", "Project_Income", "Project_Expenses", "Project_One_Time_Costs", "Project_Budget"
    tables: Dict[str, Any] = {}
    formulas: Dict[str, str] = {}
    ann: Dict[str, str] = {}
    units: Dict[str, Dict[str, str]] = {A: {}, I: {}, E: {}, O: {}, B: {}}

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
    # A one-time cost falls due inside the project: a date the model put before the
    # kickoff or after the end is pulled to the nearest edge.
    clamp = lambda d: min(max(d, start), end)
    one = [(_unique(taken, _label(x["label"])), float(x["amount"]), clamp(_date(x.get("date"), start))) for x in (p.get("one_off_costs") or []) if x.get("label")]
    for lab, amt, note in inc:
        rows_a.append((f"{lab}_Per_Month", amt, "USD/month"))
    for lab, amt, note in exp:
        rows_a.append((f"{lab}_Per_Month", amt, "USD/month"))
    for lab, amt, d in one:
        rows_a.append((f"{lab}_One_Off", amt, "USD"))
    # The plan's milestones, each with its own budget (an input, <label>_Budget), in date
    # order: they accumulate into Required_To_Date and count in the expenses.
    plan_ms: List[Dict[str, Any]] = []
    for m in (p.get("milestones") or []):
        nm = str(m.get("name") or "Milestone")
        plan_ms.append({"name": nm, "lab": _unique(taken, _label(nm)), "date": clamp(_date(m.get("date"), start)),
                        "comment": str(m.get("comment") or ""), "budget": float(m.get("budget") or 0)})
    plan_ms.sort(key=lambda x: x["date"])
    ms_lab = {m["name"]: m["lab"] for m in plan_ms}
    for m in plan_ms:
        rows_a.append((f"{m['lab']}_Budget", m["budget"], "USD"))
    ms_refs_all = [f"{A}[{m['lab']}_Budget]" for m in plan_ms]
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
    tables[_key(E, 0, r)] = "Monthly_Expenses_Over_Project"
    formulas[_key(E, 1, r)] = f"{E}[Total_Expenses_Per_Month]*{A}[Duration_Months]"
    r += 1
    tables[_key(E, 0, r)] = "One_Time_Costs_Total"
    formulas[_key(E, 1, r)] = f"{O}[Total_One_Time_Costs]"
    r += 1
    tables[_key(E, 0, r)] = "Milestone_Budgets_Total"
    formulas[_key(E, 1, r)] = "+".join(ms_refs_all) if ms_refs_all else "0"
    r += 1
    tables[_key(E, 0, r)] = "Total_Expenses_Over_Project"
    formulas[_key(E, 1, r)] = f"{E}[Monthly_Expenses_Over_Project]+{E}[One_Time_Costs_Total]+{E}[Milestone_Budgets_Total]"
    ann[E] = "Monthly costs by category; the one-time costs and the milestone budgets come from their own tables."

    # ---- one-time costs: each item with its amount and the date it falls due ----
    # Their own table, so they read as what they are: the equipment, set-up, launch and
    # close-out costs paid once, on a date, on top of the monthly categories. The amounts
    # are inputs in the Assumptions (edit them there); the dates sit beside them here.
    tables[_key(O, 0, 0)] = "Label"; tables[_key(O, 1, 0)] = "Value"
    r = 1
    one_labels = []
    for lab, amt, d in one:
        tables[_key(O, 0, r)] = lab
        formulas[_key(O, 1, r)] = f"{A}[{lab}_One_Off]"
        one_labels.append(f"{O}[{lab}]")
        units[O][lab] = "USD"
        r += 1
        tables[_key(O, 0, r)] = f"{lab}_Due"
        tables[_key(O, 1, r)] = d.strftime("%Y-%m-%d")
        r += 1
    tables[_key(O, 0, r)] = "Total_One_Time_Costs"
    formulas[_key(O, 1, r)] = "+".join(one_labels) if one_labels else "0"
    units[O]["Total_One_Time_Costs"] = "USD"
    ann[O] = "One-time project costs: paid once, on the date shown, in addition to the monthly expenses."

    # ---- budget: the P&L of a project ----
    rows_b = [
        ("Total_Income_Per_Month", f"{I}[Total_Income_Per_Month]"),
        ("Total_Expenses_Per_Month", f"{E}[Total_Expenses_Per_Month]"),
        ("Net_Per_Month", f"{B}[Total_Income_Per_Month]-{B}[Total_Expenses_Per_Month]"),
        ("Total_Income_Over_Project", f"{I}[Total_Income_Over_Project]"),
        ("Monthly_Expenses_Over_Project", f"{E}[Monthly_Expenses_Over_Project]"),
        ("Total_One_Time_Costs", f"{O}[Total_One_Time_Costs]"),
        ("Total_Milestone_Budgets", f"{E}[Milestone_Budgets_Total]"),
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

    # ---- quarterly: the budget required at quarterly intervals, and cumulatively ----
    # One column per quarter of the project (a short last quarter keeps its real month
    # count) plus a project total. Every cell is a formula back to the assumptions, so a
    # changed cost or a re-dated one-off flows through: label references read column 1
    # of a two-column table, so the running totals are expressed straight from the inputs
    # rather than from the quarter before.
    Q = "Project_Quarterly"
    units[Q] = {}
    nq = (months + 2) // 3
    quarters: List[Tuple[str, datetime, datetime, int]] = []
    for qi in range(nq):
        q_start = _add_months(start, qi * 3)
        q_months = min(3, months - qi * 3)
        q_end = _add_months(start, qi * 3 + q_months)
        quarters.append((f"Q{qi + 1}", q_start, q_end, q_months))

    def one_offs_between(a: datetime, b: datetime) -> List[str]:
        # dated on or after a, before b (the project's final quarter closes on its end)
        return [f"{A}[{lab}_One_Off]" for lab, amt, d in one if a <= d < b or (b >= end and d >= a)]

    def ms_between(a: datetime, b: datetime) -> List[str]:
        return [f"{A}[{m['lab']}_Budget]" for m in plan_ms if a <= m["date"] < b or (b >= end and m["date"] >= a)]

    inc_pm = f"{I}[Total_Income_Per_Month]"
    exp_pm = f"{E}[Total_Expenses_Per_Month]"
    tables[_key(Q, 0, 0)] = "Label"
    for c, (qlab, q_start, q_end, q_months) in enumerate(quarters, start=1):
        tables[_key(Q, c, 0)] = f"{qlab} {q_start.strftime('%b %Y')}"
    total_c = len(quarters) + 1
    tables[_key(Q, total_c, 0)] = "Project Total"

    def q_rows(c: int, q_start: datetime, q_end: datetime, q_months: int, so_far: int) -> Dict[str, Any]:
        ones = one_offs_between(q_start, q_end)
        ones_so_far = one_offs_between(start, q_end)
        one_q = "+".join(ones) if ones else "0"
        one_cum = "+".join(ones_so_far) if ones_so_far else "0"
        msq = ms_between(q_start, q_end)
        ms_cum = ms_between(start, q_end)
        ms_q = "+".join(msq) if msq else "0"
        ms_c = "+".join(ms_cum) if ms_cum else "0"
        return {
            "Period_Start": q_start.strftime("%Y-%m-%d"),
            "Period_End": q_end.strftime("%Y-%m-%d"),
            "Months": q_months,
            "Income": f"{inc_pm}*{q_months}",
            "Expenses": f"{exp_pm}*{q_months}",
            "One_Time_Costs": one_q,
            "Milestone_Budgets": ms_q,
            "Budget_Required": f"{exp_pm}*{q_months}+{one_q}+{ms_q}",
            "Cumulative_Budget_Required": f"{exp_pm}*{so_far}+{one_cum}+{ms_c}",
            "Net": f"{inc_pm}*{q_months}-({exp_pm}*{q_months}+{one_q}+{ms_q})",
            "Reserve_At_Quarter_End": f"{A}[Opening_Reserve]+{inc_pm}*{so_far}-({exp_pm}*{so_far}+{one_cum}+{ms_c})",
        }

    row_order = ["Period_Start", "Period_End", "Months", "Income", "Expenses", "One_Time_Costs", "Milestone_Budgets",
                 "Budget_Required", "Cumulative_Budget_Required", "Net", "Reserve_At_Quarter_End"]
    for r, lab in enumerate(row_order, start=1):
        tables[_key(Q, 0, r)] = lab
        units[Q][lab] = "months" if lab == "Months" else ("" if lab.startswith("Period") else "USD")
    so_far = 0
    for c, (qlab, q_start, q_end, q_months) in enumerate(quarters, start=1):
        so_far += q_months
        vals = q_rows(c, q_start, q_end, q_months, so_far)
        for r, lab in enumerate(row_order, start=1):
            v = vals[lab]
            if isinstance(v, str) and lab not in ("Period_Start", "Period_End"):
                formulas[_key(Q, c, r)] = v
            else:
                tables[_key(Q, c, r)] = v
    all_ones = "+".join(f"{A}[{lab}_One_Off]" for lab, amt, d in one) or "0"
    totals = {
        "Period_Start": start.strftime("%Y-%m-%d"),
        "Period_End": end.strftime("%Y-%m-%d"),
        "Months": f"{A}[Duration_Months]",
        "Income": f"{I}[Total_Income_Over_Project]",
        "Expenses": f"{exp_pm}*{A}[Duration_Months]",
        "One_Time_Costs": all_ones,
        "Milestone_Budgets": f"{E}[Milestone_Budgets_Total]",
        "Budget_Required": f"{E}[Total_Expenses_Over_Project]",
        "Cumulative_Budget_Required": f"{E}[Total_Expenses_Over_Project]",
        "Net": f"{B}[Net_Over_Project]",
        "Reserve_At_Quarter_End": f"{B}[Reserve_At_End]",
    }
    for r, lab in enumerate(row_order, start=1):
        v = totals[lab]
        if lab in ("Period_Start", "Period_End"):
            tables[_key(Q, total_c, r)] = v
        else:
            formulas[_key(Q, total_c, r)] = v
    ann[Q] = ("The budget required at quarterly intervals: each quarter's costs and one-offs, the running total "
              "required to that point, and the reserve left after the income of the period.")

    # ---- timeline: milestones, funding events and one-off costs on one axis ----
    ms: List[Dict[str, Any]] = []
    for m in (p.get("milestones") or []):
        d = _date(m.get("date"), start)
        ms.append({"name": str(m.get("name") or "Milestone"), "date": d, "color": "#0a2540"})
    for lab, amt, d in one:
        # the name only: the amount lives in the One-Time Costs table, not on the label
        ms.append({"name": lab.replace('_', ' '), "date": d, "color": "#FD5E53"})
    ms.append({"name": "Kickoff", "date": start, "color": "#1aa3bd"})
    ms.append({"name": "Project end", "date": end, "color": "#1aa3bd"})
    ms.sort(key=lambda x: x["date"])
    dmin, dmax = ms[0]["date"], ms[-1]["date"]
    points = []
    for m in ms:
        hrs = (m["date"] - dmin).total_seconds() / 3600.0
        points.append({"x": hrs, "y": round(random.uniform(0.35, 0.65), 3), "type": "milestone",
                       "name": m["name"], "color": m["color"], "date": m["date"].isoformat()})

    # ---- milestones table: every dated point, its comment, its budget, and what is required ----
    # One row per point on the timeline (kickoff, the plan's milestones, one-time costs
    # falling due, project end): date and weekday, comment, the milestone's own Budget (an
    # input in the Assumptions), and Required_To_Date: monthly expenses for the months
    # elapsed, plus the one-time costs due by then, plus the budgets of every milestone
    # dated up to and including this one, accumulated in date order. Each row's label is
    # stamped on its timeline point (point.row) so the two stay in step on the workbench.
    M = "Project_Milestones"
    units[M] = {}
    by_name = {m["name"]: m for m in plan_ms}
    cols = ["Label", "Date", "Day", "Comment", "Budget", "Required_To_Date"]
    for c, h in enumerate(cols):
        tables[_key(M, c, 0)] = h
    one_by_lab = {lab: (amt, d) for lab, amt, d in one}
    r = 1
    accumulated: List[str] = []
    for pt_, m in zip(points, ms):
        src = by_name.get(m["name"])
        is_one = src is None and any(m["name"].startswith(lab.replace('_', ' ')) for lab in one_by_lab)
        if src is not None:
            lab = src["lab"]
        else:
            # a one-time cost's row is "<cost>_Due": the plain label is the cost itself
            lab = _unique(taken, _label(m["name"]) + ("_Due" if is_one else ""))
        pt_["row"] = lab
        pt_["table"] = M
        d = m["date"]
        months_elapsed = max(0.0, (d - start).days / 30.44)
        due = [f"{A}[{l}_One_Off]" for l, (a_, dd) in one_by_lab.items() if dd <= d]
        if src is not None:
            accumulated.append(f"{A}[{lab}_Budget]")
            comment = src["comment"]
        elif is_one:
            comment = "One-time cost falls due."
        elif m["name"] == "Kickoff":
            comment = "Project starts."
        else:
            comment = "Project ends."
        required = f"{E}[Total_Expenses_Per_Month]*{months_elapsed:.2f}" + ("+" + "+".join(due) if due else "") \
            + ("+" + "+".join(accumulated) if accumulated else "")
        tables[_key(M, 0, r)] = lab
        tables[_key(M, 1, r)] = d.strftime("%Y-%m-%d")
        tables[_key(M, 2, r)] = d.strftime("%a")
        tables[_key(M, 3, r)] = comment
        if src is not None:
            formulas[_key(M, 4, r)] = f"{A}[{lab}_Budget]"
        else:
            tables[_key(M, 4, r)] = ""
        formulas[_key(M, 5, r)] = required
        r += 1
    units[M]["Budget"] = "USD"; units[M]["Required_To_Date"] = "USD"
    ann[M] = ("Every dated point of the timeline with its comment and its own budget (edit it in the Assumptions), and "
              "the budget required by that date: monthly expenses so far, one-time costs due, and the milestone budgets "
              "accumulated in date order.")

    return {
        "tables": tables,
        "formulas": formulas,
        "annotations": ann,
        "units": units,
        "diagnostics": "NO_ISSUES_DETECTED",
        "project": {"name": name, "start": start.isoformat(), "end": end.isoformat(), "months": months, "quarters": len(quarters), "summary": p.get("summary", "")},
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
