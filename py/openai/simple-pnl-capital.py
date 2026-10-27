#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple P&L with capital -- the short version of "P&L With Capital" (Financial models).

The full builder chains six model calls (assumptions, capital assumptions, P&L, ten-year
view, capital required, waterfall cells) and lays out a dozen or more tables. This one makes
ONE call, for numbers only, and builds four small tables in code, so every formula is known
to resolve:

  Simple_Assumptions   inputs: revenue streams (units and price), growth, cost of goods,
                       operating costs, opening cash
  Simple_PnL           first-year profit and loss, every line a formula on the inputs
  Simple_Five_Year     revenue, costs, profit, cumulative profit and cash, years 1 to 5
  Simple_Capital       one-time capital items, working capital, contingency, the total
                       capital required and the amount still to raise

param(1): the user's description of the business.

Returns the artifact baja/draw/data-model-to-tables-gpt builds from: tables and formulas keyed
by cell, annotations and units.

Formula rules, the same as project-budget.py: every reference is Table[Row,Value] into a
two-column Label|Value table; labels carry no digits (the table builder reads "2_P" as "2*_P");
only + - * / and parentheses, so growth is written as repeated multiplication rather than
a power. The wide five-year table is never referenced by other tables.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Tuple

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

MODEL = "claude-haiku-4-5"   # the fast model: a short list of numbers
YEARS = 5
LABEL_COL, VALUE_COL = "Label", "Value"
A, P, F, C = "Simple_Assumptions", "Simple_PnL", "Simple_Five_Year", "Simple_Capital"


def _key(table: str, col: int, row: int) -> str:
    return f"{table}[{col}:{col}][{row}:{row}]"


def _ref(table: str, label: str) -> str:
    return f"{table}[{label},{VALUE_COL}]"


def _label(s: str, maxlen: int = 32) -> str:
    """Words joined by single underscores; letters only (see the module note on digits)."""
    s = re.sub(r"['’]", "", str(s or ""))
    s = re.sub(r"\d+", " ", s)
    s = re.sub(r"[^A-Za-z_ ]+", " ", s)
    s = re.sub(r"\s+", "_", s.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    if len(s) > maxlen:
        cut = s[:maxlen]
        s = (cut[:cut.rfind("_")] if "_" in cut else cut).strip("_")
    if not s or not re.match(r"[A-Za-z]", s):
        s = "Item" + ("_" + s if s else "")
    return s


def _unique(taken: set, lab: str) -> str:
    out, n = lab, 0
    while out in taken:
        out = f"{lab}_{chr(ord('B') + (n % 25))}"   # a letter suffix, never a digit
        n += 1
    taken.add(out)
    return out


def _fraction(v: Any, default: float) -> float:
    """A rate as a fraction: 12 or "12%" means 0.12; anything unreadable is the default."""
    try:
        x = float(str(v).strip().rstrip("%"))
    except Exception:
        return default
    if x > 1.0:
        x = x / 100.0
    return max(-0.99, min(x, 10.0))


def _num(v: Any, default: float = 0.0) -> float:
    try:
        x = float(v)
        return x if x == x else default   # NaN
    except Exception:
        return default


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "business_name": {"type": "string"},
        "start_year": {"type": "integer"},
        "revenue_streams": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"label": {"type": "string"}, "units_first_year": {"type": "number"},
                           "price": {"type": "number"}, "note": {"type": "string"}},
            "required": ["label", "units_first_year", "price", "note"]}},
        "revenue_growth": {"type": "number"},
        "cost_of_goods_pct": {"type": "number"},
        "operating_costs": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"label": {"type": "string"}, "amount_first_year": {"type": "number"}, "note": {"type": "string"}},
            "required": ["label", "amount_first_year", "note"]}},
        "cost_growth": {"type": "number"},
        "capital_items": {"type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"label": {"type": "string"}, "amount": {"type": "number"}, "note": {"type": "string"}},
            "required": ["label", "amount", "note"]}},
        "opening_cash": {"type": "number"},
        "months_of_operating_cash": {"type": "integer"},
        "contingency_pct": {"type": "number"},
        "summary": {"type": "string"},
    },
    "required": ["business_name", "start_year", "revenue_streams", "revenue_growth", "cost_of_goods_pct",
                 "operating_costs", "cost_growth", "capital_items", "opening_cash",
                 "months_of_operating_cash", "contingency_pct", "summary"],
}


def plan(prompt: str) -> Dict[str, Any]:
    """One model call: the numbers only. Structure and formulas are built in code below."""
    from claude_chat import Claude as OpenAI   # Claude replaces OpenAI, as in the other builders
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    client = OpenAI(api_key=os.getenv("ANTHROPIC_API_KEY", ""), timeout=60, max_retries=1)
    if works is not None:
        try: works.msg("Asking Claude for the key numbers (usually 5-15 s)...")
        except Exception: pass
    r = client.responses.create(
        model=MODEL,
        instructions=(
            "You estimate the key numbers for a SIMPLE profit and loss and capital model of the business described. "
            "Return only JSON matching the schema. All money in USD. Give 1 to 4 revenue streams, each with the units "
            "sold in the first year and the price per unit (for a subscription, units are subscriber-years and price is "
            "the yearly fee). revenue_growth and cost_growth are yearly rates as fractions (0.15 means 15%). "
            "cost_of_goods_pct is the direct cost as a fraction of revenue. Give 3 to 8 operating costs as FIRST-YEAR "
            "totals (staff, rent, marketing, R&D, admin and the like). Give 2 to 6 one-time capital items (equipment, "
            "build-out, software, licences, launch). opening_cash is cash the business already has (0 if none). "
            "months_of_operating_cash is the working-capital cushion, usually 3 to 12. contingency_pct is a fraction, "
            "usually 0.1 to 0.2. Use realistic figures for the business described; keep labels short (2 to 4 words). "
            f"start_year defaults to {datetime.now().year + 1} unless the text says otherwise."
        ),
        input=prompt,
        text={"format": {"type": "json_schema", "name": "simple_pnl_capital", "schema": SCHEMA, "strict": True}},
    )
    return json.loads(r.output_text)


def _growth_factor(rate_ref: str, years_after_first: int) -> str:
    """(1+g)*(1+g)*... -- n factors, or nothing for the first year."""
    return "*".join([f"(1+{rate_ref})"] * years_after_first)


def build_from_plan(p: Dict[str, Any]) -> Dict[str, Any]:
    tables: Dict[str, Any] = {}
    formulas: Dict[str, str] = {}
    ann: Dict[str, str] = {}
    units: Dict[str, Dict[str, str]] = {A: {}, P: {}, F: {}, C: {}}
    taken: set = set()

    name = str(p.get("business_name") or "Business").strip()[:60] or "Business"
    start_year = int(_num(p.get("start_year"), datetime.now().year + 1))

    streams = [(_unique(taken, _label(s.get("label"))), max(0.0, _num(s.get("units_first_year"))), max(0.0, _num(s.get("price"))))
               for s in (p.get("revenue_streams") or []) if s.get("label")][:4]
    if not streams:
        streams = [(_unique(taken, "Sales"), 0.0, 0.0)]
    costs = [(_unique(taken, _label(c.get("label"))), max(0.0, _num(c.get("amount_first_year"))))
             for c in (p.get("operating_costs") or []) if c.get("label")][:8]
    if not costs:
        costs = [(_unique(taken, "Operating_Costs"), 0.0)]
    capital = [(_unique(taken, _label(c.get("label"))), max(0.0, _num(c.get("amount"))))
               for c in (p.get("capital_items") or []) if c.get("label")][:6]
    if not capital:
        capital = [(_unique(taken, "Equipment"), 0.0)]

    g_rev = _fraction(p.get("revenue_growth"), 0.10)
    g_cost = _fraction(p.get("cost_growth"), 0.03)
    cogs = max(0.0, min(_fraction(p.get("cost_of_goods_pct"), 0.30), 1.0))
    months = int(max(0, min(_num(p.get("months_of_operating_cash"), 6), 36)))
    contingency = max(0.0, min(_fraction(p.get("contingency_pct"), 0.10), 1.0))

    def put(table: str, rows: List[Tuple[str, Any, str]]) -> None:
        """Rows of (label, value-or-formula, unit). A string starting with '=' is a formula."""
        tables[_key(table, 0, 0)] = LABEL_COL
        tables[_key(table, 1, 0)] = VALUE_COL
        for r, (lab, v, unit) in enumerate(rows, start=1):
            tables[_key(table, 0, r)] = lab
            if isinstance(v, str) and v.startswith("="):
                formulas[_key(table, 1, r)] = v[1:]
            else:
                tables[_key(table, 1, r)] = v
            if unit:
                units[table][lab] = unit

    # ---- 1. assumptions: every input in one place ----
    rows_a: List[Tuple[str, Any, str]] = [
        ("Business", name, ""),
        ("First_Year", start_year, "year"),
    ]
    for lab, qty, price in streams:
        rows_a.append((f"{lab}_Units", qty, "units/year"))
        rows_a.append((f"{lab}_Price", price, "USD/unit"))
    rows_a += [
        ("Revenue_Growth", g_rev, "fraction/year"),
        ("Cost_Of_Goods_Pct", cogs, "fraction of revenue"),
    ]
    for lab, amt in costs:
        rows_a.append((lab, amt, "USD/year"))
    rows_a += [
        ("Cost_Growth", g_cost, "fraction/year"),
        ("Opening_Cash", max(0.0, _num(p.get("opening_cash"))), "USD"),
    ]
    put(A, rows_a)
    ann[A] = "Inputs. Edit any value; the P&L, the five-year view and the capital table follow."

    # ---- 2. first-year P&L ----
    rev_rows = [(lab, f"={_ref(A, lab + '_Units')}*{_ref(A, lab + '_Price')}", "USD") for lab, _, _ in streams]
    cost_rows = [(f"{lab}_Cost", f"={_ref(A, lab)}", "USD") for lab, _ in costs]
    rows_p: List[Tuple[str, Any, str]] = []
    rows_p += rev_rows
    rows_p.append(("Total_Revenue", "=" + "+".join(_ref(P, lab) for lab, _, _ in rev_rows), "USD"))
    rows_p.append(("Cost_Of_Goods", f"={_ref(P, 'Total_Revenue')}*{_ref(A, 'Cost_Of_Goods_Pct')}", "USD"))
    rows_p.append(("Gross_Profit", f"={_ref(P, 'Total_Revenue')}-{_ref(P, 'Cost_Of_Goods')}", "USD"))
    rows_p += cost_rows
    rows_p.append(("Total_Operating_Costs", "=" + "+".join(_ref(P, lab) for lab, _, _ in cost_rows), "USD"))
    rows_p.append(("Operating_Profit", f"={_ref(P, 'Gross_Profit')}-{_ref(P, 'Total_Operating_Costs')}", "USD"))
    rows_p.append(("Operating_Margin", f"={_ref(P, 'Operating_Profit')}/{_ref(P, 'Total_Revenue')}", "fraction"))
    put(P, rows_p)
    ann[P] = "First-year profit and loss, built from the assumptions."

    # ---- 3. capital required ----
    rows_c: List[Tuple[str, Any, str]] = [(lab, amt, "USD") for lab, amt in capital]
    rows_c += [
        ("Capital_Items_Total", "=" + "+".join(_ref(C, lab) for lab, _ in capital), "USD"),
        ("Months_Of_Operating_Cash", months, "months"),
        ("Working_Capital", f"=({_ref(P, 'Cost_Of_Goods')}+{_ref(P, 'Total_Operating_Costs')})/12*{_ref(C, 'Months_Of_Operating_Cash')}", "USD"),
        ("Contingency_Pct", contingency, "fraction"),
        ("Contingency", f"=({_ref(C, 'Capital_Items_Total')}+{_ref(C, 'Working_Capital')})*{_ref(C, 'Contingency_Pct')}", "USD"),
        ("Total_Capital_Required", f"={_ref(C, 'Capital_Items_Total')}+{_ref(C, 'Working_Capital')}+{_ref(C, 'Contingency')}", "USD"),
        ("Opening_Cash", f"={_ref(A, 'Opening_Cash')}", "USD"),
        ("Capital_To_Raise", f"={_ref(C, 'Total_Capital_Required')}-{_ref(C, 'Opening_Cash')}", "USD"),
    ]
    put(C, rows_c)
    ann[C] = ("One-time capital items (edit them here), a working-capital cushion of N months of first-year costs, "
              "and a contingency. Capital_To_Raise is what is needed beyond the opening cash; negative means covered.")

    # ---- 4. five-year view (wide: one column per year; nothing references it) ----
    rev1, cogs_pct = _ref(P, "Total_Revenue"), _ref(A, "Cost_Of_Goods_Pct")
    opx1 = _ref(P, "Total_Operating_Costs")
    g_r, g_c = _ref(A, "Revenue_Growth"), _ref(A, "Cost_Growth")

    def revenue(y: int) -> str:
        f = _growth_factor(g_r, y - 1)
        return f"{rev1}*{f}" if f else rev1

    def opex(y: int) -> str:
        f = _growth_factor(g_c, y - 1)
        return f"{opx1}*{f}" if f else opx1

    def profit(y: int) -> str:
        return f"({revenue(y)})*(1-{cogs_pct})-({opex(y)})"

    rows_f = ["Revenue", "Cost_Of_Goods", "Gross_Profit", "Operating_Costs", "Operating_Profit",
              "Cumulative_Profit", "Cash_At_Year_End"]
    tables[_key(F, 0, 0)] = LABEL_COL
    for y in range(1, YEARS + 1):
        tables[_key(F, y, 0)] = f"Year {y} ({start_year + y - 1})"
    for r, lab in enumerate(rows_f, start=1):
        tables[_key(F, 0, r)] = lab
        units[F][lab] = "USD"
    for y in range(1, YEARS + 1):
        cum = "+".join(f"({profit(k)})" for k in range(1, y + 1))
        cells = {
            "Revenue": revenue(y),
            "Cost_Of_Goods": f"({revenue(y)})*{cogs_pct}",
            "Gross_Profit": f"({revenue(y)})*(1-{cogs_pct})",
            "Operating_Costs": opex(y),
            "Operating_Profit": profit(y),
            "Cumulative_Profit": cum,
            # Funded with the total capital required, less what the capital items consumed,
            # plus every year's profit so far. Negative means the capital estimate is short.
            "Cash_At_Year_End": f"{_ref(C, 'Total_Capital_Required')}-{_ref(C, 'Capital_Items_Total')}+{cum}",
        }
        for r, lab in enumerate(rows_f, start=1):
            formulas[_key(F, y, r)] = cells[lab]
    ann[F] = ("Five years from the first-year P&L, growing revenue and operating costs at their rates. Cash starts "
              "from the total capital required less the capital items; a negative balance means more capital is needed.")

    return {
        "tables": tables,
        "formulas": formulas,
        "annotations": ann,
        "units": units,
        "diagnostics": "NO_ISSUES_DETECTED",
        "summary": str(p.get("summary") or ""),
        "business": {"name": name, "first_year": start_year},
    }


def build(prompt: str) -> Dict[str, Any]:
    p = plan(prompt)
    if works is not None:
        try: works.msg("Laying out the assumptions, P&L, five-year view and capital tables...")
        except Exception: pass
    return build_from_plan(p)


def _main() -> int:
    if works is not None:
        try:
            works.msg("Planning a simple P&L with capital...")
            works.resolve(build(str(works.param(1) or "")))
        except Exception as e:
            works.resolve({"status": "error", "error": str(e), "where": "simple-pnl-capital"})
        return 0
    import sys
    print(json.dumps(build(sys.argv[1] if len(sys.argv) > 1 else "A small rare-disease therapeutics company"), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
