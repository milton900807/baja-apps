#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Cumulative Growth Analysis (10 years) — per-metric year tables (derived from other tables).

- Param(1): JSON array-of-tables OR jfile:URI OR path OR raw JSON OR list containing those
- Output: appends multiple 2-col tables, each named by metric, with labels = "YYYY":
    Base year tables (taken from input if present; else synthesized from Assumptions):
      Revenue, COGS, Operating_Expenses, Depreciation
    Derived year tables:
      Gross_Profit, EBITDA, EBIT, Taxes, Net_Income, Burn_Rate
    Margins (non-cumulative):
      Gross_Margin, EBITDA_Margin, Net_Margin
    YoY growth (non-cumulative):
      YoY_Revenue_Growth, YoY_EBITDA_Growth, YoY_Net_Income_Growth
    Cumulative (monotonic over the period):
      Cumulative_Revenue, Cumulative_EBITDA, Cumulative_Net_Income, Cumulative_Burn_Rate
    Summary_10y:
      Total_10y_* (base/derived totals), CAGR_10y_Revenue, CAGR_10y_EBITDA, CAGR_10y_Net_Income
"""

from __future__ import annotations
import json, os, math
from typing import Any, Dict, List, Iterable, Tuple, Optional
from urllib.parse import unquote

# ---------------- Ion integration ----------------
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:  # pragma: no cover
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None:
            print(json.dumps(obj, ensure_ascii=False, indent=2))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore
    _HAS_ION = False


# ---------------- Utilities to read param(1) robustly ----------------
def _read_param(idx: int) -> Any:
    try:
        return works.param(idx)
    except Exception:
        return None

def _pick_candidate_from_sequence(seq: Iterable[Any]) -> Any:
    flat: List[Any] = []
    for it in seq:
        if isinstance(it, (list, tuple)):
            flat.extend(it)
        else:
            flat.append(it)
    for cand in reversed(flat):
        if cand not in (None, "", [], {}):
            return cand
    return None

def _load_input_payload(p: Any) -> Any:
    """
    Accepts dict/list -> return; list/tuple -> choose last non-empty; bytes -> decode;
    str -> raw JSON, jfile:, filesystem path, or JSON text.
    """
    if isinstance(p, (dict, list)):
        return p
    if isinstance(p, (tuple, list)):
        cand = _pick_candidate_from_sequence(p)
        if cand is None:
            raise RuntimeError("param(1) sequence had no usable element.")
        return _load_input_payload(cand)
    if isinstance(p, (bytes, bytearray)):
        p = p.decode("utf-8", errors="ignore")
    if not isinstance(p, str):
        raise RuntimeError(f"Unsupported param(1) type: {type(p).__name__}")

    s = unquote((p or "").strip())
    if not s:
        raise RuntimeError("Empty param(1). Provide JSON text or a path to a JSON file.")

    if s.startswith("jfile:"):
        path = s[len("jfile:"):].strip()
        if not path:
            raise RuntimeError("jfile: URI missing a path.")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    if s[0] in "[{":
        return json.loads(s)

    if os.path.exists(s):
        with open(s, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        return json.loads(s)
    except Exception as e:
        raise RuntimeError(
            "Could not interpret param(1) as JSON text or path. "
            f"Received string (len={len(s)}): {s[:120]}..."
        ) from e


# ---------------- Table helpers ----------------
def _wells_to_map(table: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a 2-col table (Label/Value) into a dict: { label -> value }.
    Assumes x=0 is label, x=1 is value; rows start at y>=1.
    """
    wells = (table or {}).get("wells", [])
    by_xy: Dict[Tuple[int, int], Any] = {(w["x"], w["y"]): w for w in wells if isinstance(w, dict)}
    out: Dict[str, Any] = {}
    max_y = max((w.get("y", 0) for w in wells if isinstance(w, dict)), default=0)
    for y in range(1, max_y + 1):
        lw = by_xy.get((0, y))
        vw = by_xy.get((1, y))
        if not lw or not vw: continue
        label = str(lw.get("value", "")).strip()
        val = vw.get("value", None)
        if label: out[label] = val
    return out

def _find_table(input_array: List[Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    for t in input_array:
        if t.get("name") == name:
            return t
    return None

def _num(x: Any, default: float = 0.0) -> float:
    if x is None: return default
    if isinstance(x, (int, float)): return float(x)
    s = str(x).replace(",", "").strip()
    try: return float(s)
    except Exception: return default

def _mk_year_table(name: str, years: List[int], values: List[Any]) -> Dict[str, Any]:
    wells = [
        {"x": 0, "y": 0, "value": name, "field": ["ColumnHeader"]},
        {"x": 1, "y": 0, "value": "Value", "field": ["ColumnHeader"]},
    ]
    y = 1
    for label, v in zip(years, values):
        wells.append({"x": 0, "y": y, "value": f"{label}", "field": ["RowHeader", name]})
        wells.append({"x": 1, "y": y, "value": (round(v, 6) if isinstance(v, (int, float)) and not isinstance(v, bool) else v), "field": [f"{label}"]})
        y += 1
    return {"name": name, "cols": 2, "rows": y, "wells": wells}

def _mk_two_col_table(name: str, rows: List[Tuple[str, Any]]) -> Dict[str, Any]:
    wells = [
        {"x": 0, "y": 0, "value": name, "field": ["ColumnHeader"]},
        {"x": 1, "y": 0, "value": "Value", "field": ["ColumnHeader"]},
    ]
    y = 1
    for label, value in rows:
        wells.append({"x": 0, "y": y, "value": label, "field": ["RowHeader", name]})
        wells.append({"x": 1, "y": y, "value": value if not isinstance(value, (int, float)) else round(value, 6), "field": [label]})
        y += 1
    return {"name": name, "cols": 2, "rows": y, "wells": wells}


# ---------------- Core math helpers ----------------
def _safe_div(n: float, d: float) -> float:
    return 0.0 if d == 0 else (n / d)

def _cagr(start: float, end: float, years: int) -> Optional[float]:
    if years <= 0 or start <= 0 or end <= 0:
        return None
    try:
        return (end / start) ** (1.0 / years) - 1.0
    except Exception:
        return None

def _cumsum(vals: List[float]) -> List[float]:
    acc = 0.0
    out = []
    for v in vals:
        acc += v
        out.append(acc)
    return out


# ---------------- Extract per-year series from input tables ----------------
def _extract_year_series(table: Dict[str, Any]) -> Tuple[List[int], List[float]]:
    """
    From a 2-col year table (labels 'YYYY'), return (years, values).
    Non-numeric values become 0. Preserves the input year ordering.
    """
    m = _wells_to_map(table)
    # Keep only keys that look like years
    kv = []
    for k, v in m.items():
        try:
            y = int(str(k).strip())
            kv.append((y, _num(v, 0.0)))
        except Exception:
            continue
    kv.sort(key=lambda t: t[0])
    years = [y for y, _ in kv]
    values = [val for _, val in kv]
    return years, values


# ---------------- Fallback synth from Assumptions (only if base tables missing) ----------------
def _synth_base_from_assumptions(input_array: List[Dict[str, Any]]) -> Tuple[List[int], Dict[str, List[float]]]:
    """Returns (years, base_series) for Revenue/COGS/Operating_Expenses/Depreciation."""
    assumptions_tbl = _find_table(input_array, "Assumptions")
    a = _wells_to_map(assumptions_tbl) if assumptions_tbl else {}

    start_year         = int(_num(a.get("Start_Year", 2024), 2024))
    price_per_unit     = _num(a.get("Price_Per_Unit", 0))
    unit_cost          = _num(a.get("Unit_Cost", 0))
    monthly_units_y1   = _num(a.get("Monthly_Units_Year_1", 0))
    sales_ramp_months  = max(1, int(_num(a.get("Sales_Ramp_Months", 12))))
    headcount_y1       = int(_num(a.get("Headcount_Year_1", 0)))
    avg_salary         = _num(a.get("Avg_Salary", 0))
    benefits_load      = _num(a.get("Benefits_Load", 0))
    rent_per_month     = _num(a.get("Rent_Per_Month", 0))
    marketing_per_month= _num(a.get("Marketing_Per_Month", 0))
    rd_per_month       = _num(a.get("R&D_Per_Month", a.get("RD_Per_Month", 0)))
    ga_per_month       = _num(a.get("G&A_Per_Month", a.get("GA_Per_Month", 0)))
    dep_years          = max(1, int(_num(a.get("Depreciation_Years", 5))))
    capex_year1        = _num(a.get("Capex_Year_1", 0))

    monthly_depr = capex_year1 / (dep_years * 12.0) if capex_year1 > 0 else 0.0

    months_total = 10 * 12
    salary_monthly = (headcount_y1 * avg_salary / 12.0) * (1.0 + benefits_load)
    fixed_opex_monthly = rent_per_month + marketing_per_month + rd_per_month + ga_per_month + salary_monthly

    revenue_m = []
    cogs_m = []
    opex_m = []
    depr_m = []

    for m in range(1, months_total + 1):
        ramp = (0.5 + 0.5 * (m / float(sales_ramp_months))) if m <= sales_ramp_months else 1.0
        units = monthly_units_y1 * ramp
        revenue_m.append(price_per_unit * units)
        cogs_m.append(unit_cost * units)
        opex_m.append(fixed_opex_monthly)
        depr_m.append(monthly_depr)

    # Aggregate by year (12 months each)
    def agg_yearly(xs: List[float]) -> List[float]:
        out = []
        for i in range(10):
            s = sum(xs[i*12:(i+1)*12])
            out.append(s)
        return out

    years = [start_year + i for i in range(10)]
    base = {
        "Revenue": agg_yearly(revenue_m),
        "COGS": agg_yearly(cogs_m),
        "Operating_Expenses": agg_yearly(opex_m),
        "Depreciation": agg_yearly(depr_m),
    }
    return years, base


# ---------------- Build analysis with cumulative outputs ----------------
def _build_year_tables_cumulative(input_array: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Pull tax rate (used to compute Taxes/Net_Income) from Assumptions if present
    assumptions_tbl = _find_table(input_array, "Assumptions")
    assumptions = _wells_to_map(assumptions_tbl) if assumptions_tbl else {}
    tax_rate = max(0.0, min(1.0, _num(assumptions.get("Tax_Rate", 0.21))))

    # Try to read base series from existing per-year tables
    base_names = ["Revenue", "COGS", "Operating_Expenses", "Depreciation"]
    series: Dict[str, List[float]] = {}
    years_union: Optional[List[int]] = None

    for nm in base_names:
        t = _find_table(input_array, nm)
        if t:
            yrs, vals = _extract_year_series(t)
            if yrs and vals:
                series[nm] = vals
                if years_union is None:
                    years_union = yrs
                else:
                    # Align: take intersection in original order of years_union
                    years_union = [y for y in years_union if y in set(yrs)]

    # If missing any base series, synthesize all from assumptions to guarantee consistency
    if len(series) < len(base_names):
        synth_years, synth_base = _synth_base_from_assumptions(input_array)
        years_union = synth_years
        series = synth_base

    # Normalize: ensure all base series have the same length/order as years_union
    assert years_union is not None and len(years_union) > 0, "No years available to build tables."
    Y = len(years_union)
    for nm in base_names:
        arr = series.get(nm, None)
        if arr is None or len(arr) != Y:
            # pad/truncate as needed
            fixed = [0.0]*Y
            if arr:
                for i in range(min(Y, len(arr))):
                    fixed[i] = arr[i]
            series[nm] = fixed

    # Derived base relationships
    gp = [series["Revenue"][i] - series["COGS"][i] for i in range(Y)]
    ebitda = [gp[i] - series["Operating_Expenses"][i] for i in range(Y)]
    ebit = [ebitda[i] - series["Depreciation"][i] for i in range(Y)]
    taxes = [max(0.0, ebit[i]) * tax_rate for i in range(Y)]
    net_income = [ebit[i] - taxes[i] for i in range(Y)]
    burn_rate = [max(0.0, -ebitda[i]) for i in range(Y)]

    # Margins (non-cumulative)
    gross_margin  = [_safe_div(gp[i], series["Revenue"][i]) for i in range(Y)]
    ebitda_margin = [_safe_div(ebitda[i], series["Revenue"][i]) for i in range(Y)]
    net_margin    = [_safe_div(net_income[i], series["Revenue"][i]) for i in range(Y)]

    # YoY (non-cumulative; first year = 0.0)
    def yoy(vals: List[float]) -> List[float]:
        out = [0.0]
        for i in range(1, len(vals)):
            prev = vals[i-1]
            out.append(_safe_div(vals[i] - prev, prev) if prev != 0 else 0.0)
        return out

    yoy_rev   = yoy(series["Revenue"])
    yoy_ebitda= yoy(ebitda)
    yoy_ni    = yoy(net_income)

    # Cumulative over the period (monotonic)
    cum_revenue    = _cumsum(series["Revenue"])
    cum_ebitda     = _cumsum(ebitda)
    cum_net_income = _cumsum(net_income)
    cum_burn_rate  = _cumsum(burn_rate)

    # Build output tables (per metric, labels = year text)
    tables: List[Dict[str, Any]] = []
    yrs = years_union

    # Optionally (re)emit base tables normalized to our aligned year set
    tables.append(_mk_year_table("Revenue", yrs, series["Revenue"]))
    tables.append(_mk_year_table("COGS", yrs, series["COGS"]))
    tables.append(_mk_year_table("Operating_Expenses", yrs, series["Operating_Expenses"]))
    tables.append(_mk_year_table("Depreciation", yrs, series["Depreciation"]))

    # Derived annual tables (functions of base tables)
    tables.append(_mk_year_table("Gross_Profit", yrs, gp))
    tables.append(_mk_year_table("EBITDA", yrs, ebitda))
    tables.append(_mk_year_table("EBIT", yrs, ebit))
    tables.append(_mk_year_table("Taxes", yrs, taxes))
    tables.append(_mk_year_table("Net_Income", yrs, net_income))
    tables.append(_mk_year_table("Burn_Rate", yrs, burn_rate))

    # Margins & YoY (non-cumulative)
    tables.append(_mk_year_table("Gross_Margin", yrs, gross_margin))
    tables.append(_mk_year_table("EBITDA_Margin", yrs, ebitda_margin))
    tables.append(_mk_year_table("Net_Margin", yrs, net_margin))
    tables.append(_mk_year_table("YoY_Revenue_Growth", yrs, yoy_rev))
    tables.append(_mk_year_table("YoY_EBITDA_Growth", yrs, yoy_ebitda))
    tables.append(_mk_year_table("YoY_Net_Income_Growth", yrs, yoy_ni))

    # Cumulative (monotonic across time)
    tables.append(_mk_year_table("Cumulative_Revenue", yrs, cum_revenue))
    tables.append(_mk_year_table("Cumulative_EBITDA", yrs, cum_ebitda))
    tables.append(_mk_year_table("Cumulative_Net_Income", yrs, cum_net_income))
    tables.append(_mk_year_table("Cumulative_Burn_Rate", yrs, cum_burn_rate))

    # Summary: totals & CAGRs (derived from base series)
    totals_rows: List[Tuple[str, Any]] = []
    total_metrics = {
        "Revenue": sum(series["Revenue"]),
        "COGS": sum(series["COGS"]),
        "Gross_Profit": sum(gp),
        "Operating_Expenses": sum(series["Operating_Expenses"]),
        "EBITDA": sum(ebitda),
        "Depreciation": sum(series["Depreciation"]),
        "EBIT": sum(ebit),
        "Taxes": sum(taxes),
        "Net_Income": sum(net_income),
        "Burn_Rate": sum(burn_rate),
    }
    for k, v in total_metrics.items():
        totals_rows.append((f"Total_10y_{k}", v))

    # CAGRs across the time span (years-1 steps)
    steps = max(1, len(yrs) - 1)
    cagr_rev = _cagr(series["Revenue"][0], series["Revenue"][-1], steps)
    cagr_eb  = _cagr(ebitda[0], ebitda[-1], steps)
    cagr_ni  = _cagr(net_income[0], net_income[-1], steps)
    totals_rows.append(("CAGR_10y_Revenue", None if cagr_rev is None else cagr_rev))
    totals_rows.append(("CAGR_10y_EBITDA", None if cagr_eb is None else cagr_eb))
    totals_rows.append(("CAGR_10y_Net_Income", None if cagr_ni is None else cagr_ni))

    tables.append(_mk_two_col_table("Summary_10y", totals_rows))
    return tables


# ---------------- Ion main ----------------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    p1 = _read_param(1)
    if p1 in (None, "", [], {}):
        raise RuntimeError("Ion: param(1) required: JSON text, dict/list, jfile:URI, or a path to a JSON file.")

    works.msg("Cumulative Growth (10y, derived from tables) starting…")

    try:
        input_array = _load_input_payload(p1)
    except Exception as e:
        raise RuntimeError(f"Failed to load input from param(1): {e}") from e

    if not isinstance(input_array, list):
        raise RuntimeError("Input must be a JSON array (list) of tables.")

    # Build metric tables (cumulative derived from other tables)
    metric_tables = _build_year_tables_cumulative(input_array)
    output_array = list(input_array) + metric_tables

    works.msg(f"Built {len(metric_tables)} tables; resolving JSON.")
    works.resolve(output_array)
    return 0


if __name__ == "__main__":
    _main_ion("gpt-4o-mini")
