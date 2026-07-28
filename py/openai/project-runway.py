#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
# ... (unchanged module docstring and imports)

import os
import json
import re
import datetime
from typing import Dict, List, Tuple, Any, Union



# =edate(Assumptions[Start_Date],1)



# ---- Ion Works ----
from ion import works  # type: ignore

# ---------- helpers ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)

def _coerce_number(v: Any) -> Any:
    if isinstance(v, (int, float)):
        return v
    if v is None:
        return 0
    if isinstance(v, str):
        s = v.strip()
        try:
            if re.fullmatch(r"-?\d+", s):
                return int(s)
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return s
    return v

def _parse_date(s: str) -> datetime.date:
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y-%m", "%Y/%m", "%Y.%m"):
        try:
            dt = datetime.datetime.strptime(s, fmt)
            if fmt in ("%Y-%m", "%Y/%m", "%Y.%m"):
                return datetime.date(dt.year, dt.month, 1)
            return dt.date()
        except Exception:
            continue
    return datetime.date.today()

def _month_add(d: datetime.date, k: int) -> datetime.date:
    y = d.year + (d.month - 1 + k) // 12
    m = (d.month - 1 + k) % 12 + 1
    day = min(d.day, [31,
                      29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m-1])
    return datetime.date(y, m, day)

def _label_for_month(d: datetime.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"

def _load_json_from_path_or_text(s: Union[str, dict, list]) -> Any:
    if isinstance(s, (dict, list)):
        return s
    s = (s or "").strip()
    if not s:
        raise RuntimeError("Assumptions input is empty.")
    if s[0] in "[{":
        return json.loads(s)
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

def _select_assumptions_node(obj: Any) -> dict:
    if isinstance(obj, list):
        for it in obj:
            if isinstance(it, dict) and it.get("name") == "Assumptions" and isinstance(it.get("wells"), list):
                return it
        for it in obj:
            if isinstance(it, dict) and isinstance(it.get("wells"), list):
                return it
        raise RuntimeError("No item with 'wells' found in the provided list.")
    if isinstance(obj, dict):
        if isinstance(obj.get("wells"), list):
            return obj
        raise RuntimeError("Dict provided does not have 'wells'.")
    raise RuntimeError("Unsupported assumptions JSON type.")

def _assumptions_rows(assumptions_obj: Any) -> List[Tuple[str, Any]]:
    node = _select_assumptions_node(assumptions_obj)
    wells = node.get("wells") or []
    if not isinstance(wells, list):
        raise RuntimeError("'wells' must be a list.")

    row_to_label: Dict[int, str] = {}
    row_to_value: Dict[int, Any] = {}

    for cell in wells:
        try:
            x = cell.get("x")
            y = cell.get("y")
            val = cell.get("value")
            if x == 0 and y is not None and y >= 1:
                if isinstance(val, str) and val.strip():
                    row_to_label[y] = val.strip()
            elif x == 1 and y is not None and y >= 1:
                row_to_value[y] = _coerce_number(val)
        except Exception:
            continue

    rows: List[Tuple[str, Any]] = []
    for y in sorted(row_to_label.keys()):
        lab = row_to_label.get(y)
        if not lab:
            continue
        value = row_to_value.get(y, "")
        rows.append((re.sub(r"\s+", "_", lab.strip()), value))

    seen = set()
    uniq: List[Tuple[str, Any]] = []
    for lab, val in rows:
        if lab not in seen:
            uniq.append((lab, val))
            seen.add(lab)
    return uniq

def _assumption_positions(assumptions_obj: Any) -> Dict[str, int]:
    """
    Map normalized label -> row index y (for value column x=1) in Assumptions.
    """
    node = _select_assumptions_node(assumptions_obj)
    wells = node.get("wells") or []
    label_row: Dict[int, str] = {}
    value_rows: set[int] = set()

    for c in wells:
        x = c.get("x")
        y = c.get("y")
        v = c.get("value")
        if y is None or y < 1:
            continue
        if x == 0 and isinstance(v, str) and v.strip():
            lab = re.sub(r"\s+", "_", v.strip())
            label_row[y] = lab
        elif x == 1:
            value_rows.add(y)

    out: Dict[str, int] = {}
    for y, lab in label_row.items():
        if y in value_rows:
            out[lab.lower()] = y
    return out

def _to_map(rows: List[Tuple[str, Any]]) -> Dict[str, Any]:
    return {k.lower(): v for k, v in rows}

def _get(map_: Dict[str, Any], key: str, default: Any = 0):
    return map_.get(key.lower(), default)

# ---------- core monthly engine (values for diagnostics only) ----------
def _build_monthly_spend_vector(amap: Dict[str, Any], months: int, hours_per_fte: float) -> List[float]:
    spend = [0.0] * months

    total_budget_labels = [
        "Paid_Media_Budget_USD",
        "Content_Budget_USD",
        "Events_Budget_USD",
        "Communications_Budget_USD",
        "Technology_Tools_Budget_USD",
        "External_Services_Budget_USD",
    ]
    for lab in total_budget_labels:
        v = float(_get(amap, lab, 0) or 0)
        if months > 0 and v:
            per_m = v / months
            for i in range(months):
                spend[i] += per_m

    per_month_labels = [
        "Software_Subscriptions_Per_Month_USD",
        "Analytics_Tools_Cost_Per_Month_USD",
        "Data_Storage_Cost_Per_Month_USD",
    ]
    for lab in per_month_labels:
        v = float(_get(amap, lab, 0) or 0)
        if v:
            for i in range(months):
                spend[i] += v

    fte_labels = [
        "Project_Manager_Full_Time_Equivalent",
        "Marketing_Manager_Full_Time_Equivalent",
        "Designer_Full_Time_Equivalent",
    ]
    avg_rate = float(_get(amap, "Average_Hourly_Rate_USD", 0) or 0)
    total_fte = sum(float(_get(amap, lab, 0) or 0) for lab in fte_labels)
    contractor_hours_pm = float(_get(amap, "Contractor_Hours_Per_Month", 0) or 0)

    monthly_payroll = total_fte * hours_per_fte * avg_rate + contractor_hours_pm * avg_rate
    if monthly_payroll:
        for i in range(months):
            spend[i] += monthly_payroll

    capex = float(_get(amap, "Capital_Expenditure_USD", 0) or 0)
    if months > 0 and capex:
        spend[0] += capex

    contingency_pct = float(_get(amap, "Contingency_Percentage", 0) or 0)
    if contingency_pct:
        for i in range(months):
            spend[i] *= (1.0 + contingency_pct)

    growth = float(_get(amap, "Annual_Growth_Rate", 0) or 0)
    if growth:
        monthly_factor = (1.0 + growth) ** (1.0 / 12.0)
        for i in range(1, months):
            spend[i] = spend[i-1] * monthly_factor

    return spend

# ---------- NEW: formula table builder ----------
def _build_tables_formulas(
    assumptions_any: Any,
    start_date: datetime.date,
    months: int,
    *,
    hours_per_fte_per_month: float
) -> tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    """
    Returns: (budget_tbl, cash_tbl, formulas)
    - budget_tbl / cash_tbl carry headers + month labels; numeric 'Value' cells left blank
    - formulas maps table cell keys -> formula strings ("= ...")
    """
    # Base tables (headers/labels)
    budget_tbl: Dict[str, str] = {
        _key("Monthly_Budget", 0, 0): "Label",
        _key("Monthly_Budget", 1, 0): "Value",
    }
    cash_tbl: Dict[str, str] = {
        _key("Cash_On_Hand", 0, 0): "Label",
        _key("Cash_On_Hand", 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}

    # Build references to Assumptions cells
    pos = _assumption_positions(assumptions_any)

    def ref(label: str) -> str:
        y = pos.get(label.lower())
        if y is None:
            return "0"
        return _key("Assumptions", 1, y)

    # Lists of labels
    total_budget_labels = [
        "Paid_Media_Budget_USD",
        "Content_Budget_USD",
        "Events_Budget_USD",
        "Communications_Budget_USD",
        "Technology_Tools_Budget_USD",
        "External_Services_Budget_USD",
    ]
    per_month_labels = [
        "Software_Subscriptions_Per_Month_USD",
        "Analytics_Tools_Cost_Per_Month_USD",
        "Data_Storage_Cost_Per_Month_USD",
    ]
    fte_labels = [
        "Project_Manager_Full_Time_Equivalent",
        "Marketing_Manager_Full_Time_Equivalent",
        "Designer_Full_Time_Equivalent",
    ]

    # Components (as formula fragments)
    dur = ref("Duration_Months")
    total_spread = "(" + " + ".join(ref(l) for l in total_budget_labels) + f") / {dur}"
    per_month_sum = "(" + " + ".join(ref(l) for l in per_month_labels) + ")" if per_month_labels else "0"
    total_fte_sum = "(" + " + ".join(ref(l) for l in fte_labels) + ")" if fte_labels else "0"
    avg_rate = ref("Average_Hourly_Rate_USD")
    contractor_hours = ref("Contractor_Hours_Per_Month")
    payroll = f"(({total_fte_sum} * {hours_per_fte_per_month}) * {avg_rate} + {contractor_hours} * {avg_rate})"
    capex = ref("Capital_Expenditure_USD")
    contingency = ref("Contingency_Percentage")
    growth = ref("Annual_Growth_Rate")
    opening_cash = f"({ref('Opening_Cash_USD')} + {ref('Starting_Cash_USD')})"  # one may be 0

    base_no_growth = f"(({total_spread}) + {per_month_sum} + {payroll})"
    with_contingency = f"({base_no_growth} * (1 + {contingency}))"

        # Monthly_Budget formulas
    for i in range(months):
        # Column headers: use formula for date labels
        lab_key = _key("Monthly_Budget", 0, i+1)
        budget_tbl[lab_key] = ""  # value supplied via formula
        formulas[lab_key] = f"= edate({ref('Start_Date')}, {i})"

        # Value header remains
        budget_tbl[_key("Monthly_Budget", 1, i+1)] = ""  # value supplied via formula

        if i == 0:
            # Month 1 includes CAPEX; no growth multiplier on month 1 base
            expr = f"{with_contingency} + {capex}"
        else:
            # Geometric growth applied iteratively off the previous month’s value
            prev_key = _key("Monthly_Budget", 1, i)  # previous row same column
            expr = f"{prev_key} * ((1 + {growth}) ^ (1/12))"

        formulas[_key("Monthly_Budget", 1, i+1)] = f"= {expr}"

    # Cash_On_Hand formulas: iterative subtraction from opening cash
    for i in range(months):
        # Column headers: use formula for date labels
        lab_key = _key("Cash_On_Hand", 0, i+1)
        cash_tbl[lab_key] = ""  # value supplied via formula
        formulas[lab_key] = f"= edate({ref('Start_Date')}, {i})"

        cash_tbl[_key("Cash_On_Hand", 1, i+1)] = ""

        mb_key = _key("Monthly_Budget", 1, i+1)
        if i == 0:
            expr = f"{opening_cash} - {mb_key}"
        else:
            prev_cash = _key("Cash_On_Hand", 1, i)
            expr = f"{prev_cash} - {mb_key}"

        formulas[_key("Cash_On_Hand", 1, i+1)] = f"= {expr}"


    return budget_tbl, cash_tbl, formulas

# ---------- Orchestrator ----------
def run_monthly_budget_builder(assumptions_any: Any, *, hours_per_fte_per_month: float = 160.0) -> Dict[str, Any]:
    rows = _assumptions_rows(assumptions_any)
    amap = _to_map(rows)

    start_date_raw = _get(amap, "Start_Date", "")
    if isinstance(start_date_raw, str) and start_date_raw.strip():
        start_date = _parse_date(start_date_raw)
    else:
        start_date = datetime.date.today()

    months_val = _get(amap, "Duration_Months", 0)
    try:
        months = int(float(months_val or 0))
    except Exception:
        months = 0
    if months <= 0:
        raise RuntimeError("Duration_Months must be a positive integer.")

    # Opening cash for diagnostics (formulas use both fields and let missing be 0)
    opening_cash = 0.0
    for k in ("Opening_Cash_USD", "Starting_Cash_USD"):
        v = _get(amap, k, None)
        if isinstance(v, (int, float)):
            opening_cash = float(v)
            break

    # 1) Values (for diagnostics only)
    monthly_spend = _build_monthly_spend_vector(amap, months, hours_per_fte_per_month)

    # 2) Tables + formulas (for output)
    budget_tbl, cash_tbl, formulas = _build_tables_formulas(
        assumptions_any,
        start_date,
        months,
        hours_per_fte_per_month=hours_per_fte_per_month,
    )

    units = {
        "Monthly_Budget": {"Value": "USD/month"},
        "Cash_On_Hand": {"Value": "USD"},
    }
    annotations = {
        "Monthly_Budget": "Formula-based: even spread of total budgets, per-month costs, staffing, contingency; month 1 adds capital expenditure; growth compounded monthly from prior month.",
        "Cash_On_Hand": "Formula-based: iterative subtraction of Monthly_Budget from opening cash/starting cash.",
    }

    artifact = {
        "tables": {**budget_tbl, **cash_tbl},
        "formulas": formulas,
        "annotations": annotations,
        "units": units,
        "diagnostics": {
            "start_date": start_date.isoformat(),
            "months": months,
            "opening_cash_usd": opening_cash,
            "total_spend_usd": round(sum(monthly_spend), 2),
            "average_monthly_spend_usd": round(sum(monthly_spend) / months, 2) if months else 0.0,
        },
    }
    return artifact

# ---------- Ion entry/exit ----------
def _main_ion() -> int:
    works.msg("📅 Loading Monthly Budget & Cash-on-Hand builder…")

    try:
        _ = works.param(1)  # user prompt (optional)
    except Exception:
        _ = ""

    try:
        raw_assumptions = works.param(2)
        assumptions_any = (raw_assumptions)
    except Exception as e:
        works.resolve({"status": "❌ error", "error": f"Failed to load assumptions: {e}"})
        return 1

    try:
        hp = works.param(3)
        hours_per_fte = float(hp) if hp is not None else 160.0
    except Exception:
        hours_per_fte = 160.0

    try:
        artifact = run_monthly_budget_builder(assumptions_any, hours_per_fte_per_month=hours_per_fte)
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({"status": "❌ error", "error": str(err), "where": "monthly-budget-builder"})
        return 1

if __name__ == "__main__":
    _main_ion()
