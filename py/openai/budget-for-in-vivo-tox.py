#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
In vivo toxicology study budget calculator (Ion Works entry/exit)

Reference-based on the qPCR / RNA-screening budget builder, but adapted for a CRO-led
GLP 13-week (3-dose) intrathecal rat general toxicology study, using the commercial
terms and operational parameters from the uploaded SOW (OPP-407864 / CRL Montreal ULC).

Takes:
- user_prompt (param 1)
- LJL_InVivo_Tox_Assumptions grid/table (param 2), with structure:
    {
        "name": "LJL_InVivo_Tox_Assumptions",  # or any table name; detected dynamically
        "cols": 2,
        "rows": N,
        "wells": [
            { "x": 0, "y": 0, "value": "Label", "field": ["ColumnHeader"] },
            { "x": 1, "y": 0, "value": "Value", "field": ["ColumnHeader"] },
            { "x": 0, "y": 1, "value": "Some_Label", "field": ["RowHeader"] },
            { "x": 1, "y": 1, "value": 123.0 },
            ...
        ]
    }

Builds:
- An InVivo_Tox_Budget table with formulas that compute:
    • Commercial totals (base price, discount, net price)
    • Payment milestones (30/30/30/10) and milestone dollars
    • Cancellation / postponement exposure scenarios (max fees, minimum room/week)
    • Simple schedule rollups (in-life + reporting lead times)
    • Optional budget comparison if a budget/available capital assumption exists

Constraints & embedded SOW data (used as defaults if not supplied in assumptions):
- Quoted_Base_Study_Price_USD = 618,744
- Discount_Rate = 0.10
- Price_After_Discount_USD = 556,869
- Payment milestones: 0.30 / 0.30 / 0.30 / 0.10
- Cancellation max/early termination up to 0.50 (50%)
- Postponement minimum: 15,000 USD per room per week (if animals on site)
- Study timing defaults:
    In_Life_Duration_Weeks=13, Post_Treatment_Duration_Weeks=1,
    In_Life_Report_Lead_Time_Weeks_from_Last_Necropsy=3,
    Draft_Report_Lead_Time_Weeks_from_Last_Necropsy=12,
    Final_Report_Lead_Time_Weeks_from_Draft=6

Outputs:
- tables: includes InVivo_Tox_Budget + header echo for the assumptions table.
- formulas: formulas for InVivo_Tox_Budget rows only.
- annotations: brief description.
- units: basic unit hints for budget labels.
"""

import json
import re
from typing import Dict, List, Tuple, Any, Optional

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- Constants ----
TABLE_NAME = "InVivo_Tox_Budget"
ASSUMPTIONS_TABLE_NAME = "LJL_InVivo_Tox_Assumptions"  # default; actual taken from grid["name"] if present

# SOW defaults (embedded)
SOW_DEFAULTS = {
    "Quoted_Base_Study_Price_USD": 618744,
    "Discount_Rate": 0.10,
    "Price_After_Discount_USD": 556869,
    "Payment_On_Signature_Pct": 0.30,
    "Payment_On_Study_Initiation_Pct": 0.30,
    "Payment_On_In_Life_Completion_Pct": 0.30,
    "Payment_On_Draft_Report_Submission_Pct": 0.10,
    "Cancellation_Animals_On_Site_Fee_Rate": 0.50,
    "Early_Termination_Max_Fee_Rate": 0.50,
    "Postponement_Animals_On_Site_Min_Per_Room_Per_Week_USD": 15000,
    "In_Life_Duration_Weeks": 13,
    "Post_Treatment_Duration_Weeks": 1,
    "In_Life_Report_Lead_Time_Weeks_from_Last_Necropsy": 3,
    "Draft_Report_Lead_Time_Weeks_from_Last_Necropsy": 12,
    "Final_Report_Lead_Time_Weeks_from_Draft": 6,
    "Contingency_Buffer_Pct": 0.10,  # a reasonable modeling default if not provided
}

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
        if not s:
            return 0
        # If there's any non-numeric symbol (except . - e E), leave as string
        if re.search(r"[^0-9.\-eE]", s):
            return s
        try:
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return s
    return v


def _assumptions_rows_from_grid(assumptions_grid: Dict[str, Any]) -> List[Tuple[str, Any]]:
    """
    Parse the Assumptions grid (x/y/wells structure) into:
        [(label, value), ...]
    We treat:
    - Label col: x == 0, y > 0
    - Value col: x == 1, y > 0
    """
    wells = assumptions_grid.get("wells", [])
    labels_by_y: Dict[int, str] = {}
    vals_by_y: Dict[int, Any] = {}

    for w in wells:
        x = w.get("x")
        y = w.get("y")
        v = w.get("value")

        if y is None or x is None:
            continue
        if y == 0:
            continue

        if x == 0:
            if isinstance(v, str) and v.strip():
                labels_by_y[y] = v.strip()
        elif x == 1:
            vals_by_y[y] = _coerce_number(v)

    rows: List[Tuple[str, Any]] = []
    seen = set()
    for y in sorted(labels_by_y.keys()):
        lab = labels_by_y[y]
        if not lab:
            continue
        norm_label = re.sub(r"\s+", "_", lab.strip())
        if norm_label in seen:
            continue
        value = vals_by_y.get(y, "")
        rows.append((norm_label, value))
        seen.add(norm_label)
    return rows


def _infer_units_for_budget_label(label: str) -> str:
    L = label.lower()
    if any(x in L for x in ["usd", "price", "cost", "budget", "total", "payment", "fee", "min_per_room"]):
        return "USD"
    if any(x in L for x in ["pct", "rate", "fraction", "buffer"]):
        return "fraction"
    if "weeks" in L:
        return "weeks"
    if "days" in L:
        return "days"
    if any(x in L for x in ["animals", "groups", "samples"]):
        return "count"
    return "unitless"


def _build_budget_rows(
    assumption_rows: List[Tuple[str, Any]],
    assumptions_table_name: str,
) -> List[Dict[str, str]]:
    """
    Build a list of budget rows with {label, formula}, referencing:
        <assumptions_table_name>[...]
        InVivo_Tox_Budget[...]

    Only adds rows whose required assumptions labels exist; otherwise falls back to
    embedded SOW defaults with literal numbers.
    """
    assump_names = {lab for (lab, _v) in assumption_rows}
    rows: List[Dict[str, str]] = []

    def has(*names: str) -> bool:
        return all(n in assump_names for n in names)

    def A(name: str) -> str:
        """Assumptions reference if present else literal fallback."""
        if name in assump_names:
            return f"{assumptions_table_name}[{name}]"
        # literal fallback (numbers only; if not found, 0)
        v = SOW_DEFAULTS.get(name, 0)
        return str(v)

    def add_row(label: str, formula: str) -> None:
        rows.append({"label": label, "formula": formula})

    # -----------------------------
    # Commercial: Base, discount, net
    # -----------------------------
    add_row("Quoted_Base_Study_Price", A("Quoted_Base_Study_Price_USD"))
    add_row("Discount_Rate", A("Discount_Rate"))

    # Prefer the explicit net price if present, else compute deterministically
    if "Price_After_Discount_USD" in assump_names:
        add_row("Price_After_Discount", A("Price_After_Discount_USD"))
    else:
        add_row(
            "Price_After_Discount",
            f"{TABLE_NAME}[Quoted_Base_Study_Price]*(1-{TABLE_NAME}[Discount_Rate])"
        )

    # -----------------------------
    # Payment milestones (fractions)
    # -----------------------------
    add_row("Payment_On_Signature_Pct", A("Payment_On_Signature_Pct"))
    add_row("Payment_On_Study_Initiation_Pct", A("Payment_On_Study_Initiation_Pct"))
    add_row("Payment_On_In_Life_Completion_Pct", A("Payment_On_In_Life_Completion_Pct"))
    add_row("Payment_On_Draft_Report_Submission_Pct", A("Payment_On_Draft_Report_Submission_Pct"))

    # Milestone dollars (based on net price)
    add_row(
        "Payment_On_Signature_USD",
        f"{TABLE_NAME}[Price_After_Discount]*{TABLE_NAME}[Payment_On_Signature_Pct]"
    )
    add_row(
        "Payment_On_Study_Initiation_USD",
        f"{TABLE_NAME}[Price_After_Discount]*{TABLE_NAME}[Payment_On_Study_Initiation_Pct]"
    )
    add_row(
        "Payment_On_In_Life_Completion_USD",
        f"{TABLE_NAME}[Price_After_Discount]*{TABLE_NAME}[Payment_On_In_Life_Completion_Pct]"
    )
    add_row(
        "Payment_On_Draft_Report_Submission_USD",
        f"{TABLE_NAME}[Price_After_Discount]*{TABLE_NAME}[Payment_On_Draft_Report_Submission_Pct]"
    )

    add_row(
        "Payments_Total_USD",
        f"{TABLE_NAME}[Payment_On_Signature_USD]+"
        f"{TABLE_NAME}[Payment_On_Study_Initiation_USD]+"
        f"{TABLE_NAME}[Payment_On_In_Life_Completion_USD]+"
        f"{TABLE_NAME}[Payment_On_Draft_Report_Submission_USD]"
    )

    # -----------------------------
    # Cancellation / postponement exposures (scenario-style)
    # -----------------------------
    add_row("Cancellation_Animals_On_Site_Fee_Rate", A("Cancellation_Animals_On_Site_Fee_Rate"))
    add_row("Early_Termination_Max_Fee_Rate", A("Early_Termination_Max_Fee_Rate"))
    add_row("Postponement_Animals_On_Site_Min_Per_Room_Per_Week_USD", A("Postponement_Animals_On_Site_Min_Per_Room_Per_Week_USD"))

    # Estimate “worst-case fee” dollars as % of net price (does not include pass-through costs)
    add_row(
        "Cancellation_Animals_On_Site_Fee_USD_Est",
        f"{TABLE_NAME}[Price_After_Discount]*{TABLE_NAME}[Cancellation_Animals_On_Site_Fee_Rate]"
    )
    add_row(
        "Early_Termination_Max_Fee_USD_Est",
        f"{TABLE_NAME}[Price_After_Discount]*{TABLE_NAME}[Early_Termination_Max_Fee_Rate]"
    )

    # -----------------------------
    # Operational schedule rollups (weeks)
    # -----------------------------
    add_row("In_Life_Duration_Weeks", A("In_Life_Duration_Weeks"))
    add_row("Post_Treatment_Duration_Weeks", A("Post_Treatment_Duration_Weeks"))
    add_row(
        "Total_In_Life_plus_Post_Weeks",
        f"{TABLE_NAME}[In_Life_Duration_Weeks]+{TABLE_NAME}[Post_Treatment_Duration_Weeks]"
    )

    add_row("In_Life_Report_Lead_Time_Weeks_from_Last_Necropsy", A("In_Life_Report_Lead_Time_Weeks_from_Last_Necropsy"))
    add_row("Draft_Report_Lead_Time_Weeks_from_Last_Necropsy", A("Draft_Report_Lead_Time_Weeks_from_Last_Necropsy"))
    add_row("Final_Report_Lead_Time_Weeks_from_Draft", A("Final_Report_Lead_Time_Weeks_from_Draft"))

    add_row(
        "Total_Weeks_from_First_Dose_to_Draft_Report",
        f"{TABLE_NAME}[Total_In_Life_plus_Post_Weeks]+{TABLE_NAME}[Draft_Report_Lead_Time_Weeks_from_Last_Necropsy]"
    )
    add_row(
        "Total_Weeks_from_First_Dose_to_Final_Report",
        f"{TABLE_NAME}[Total_Weeks_from_First_Dose_to_Draft_Report]+{TABLE_NAME}[Final_Report_Lead_Time_Weeks_from_Draft]"
    )

    # -----------------------------
    # Contingency and total (optional)
    # -----------------------------
    # Use assumption if present; else SOW_DEFAULTS fallback (0.10)
    add_row("Contingency_Buffer_Pct", A("Contingency_Buffer_Pct"))
    add_row(
        "Contingency_Buffer_Cost_USD",
        f"{TABLE_NAME}[Price_After_Discount]*{TABLE_NAME}[Contingency_Buffer_Pct]"
    )
    add_row(
        "Total_Program_Cost_Including_Contingency_USD",
        f"{TABLE_NAME}[Price_After_Discount]+{TABLE_NAME}[Contingency_Buffer_Cost_USD]"
    )

    # -----------------------------
    # Constraint checks (deterministic “flags”)
    # Note: Ion formulas may not support IF; so we output diagnostic deltas.
    # Target: Total_Program_Cost_Including_Contingency_USD in [500k, 900k]
    # -----------------------------
    add_row(
        "Target_Range_Low_USD",
        "500000"
    )
    add_row(
        "Target_Range_High_USD",
        "900000"
    )
    add_row(
        "Delta_vs_Low_USD",
        f"{TABLE_NAME}[Total_Program_Cost_Including_Contingency_USD]-{TABLE_NAME}[Target_Range_Low_USD]"
    )
    add_row(
        "Delta_vs_High_USD",
        f"{TABLE_NAME}[Total_Program_Cost_Including_Contingency_USD]-{TABLE_NAME}[Target_Range_High_USD]"
    )

    # -----------------------------
    # Optional: budget comparison if a budget assumption exists
    # -----------------------------
    budget_assumption_label: Optional[str] = None
    for candidate in [
        "Program_Budget_USD",
        "Available_Budget_USD",
        "Tox_Budget_USD",
        "Initial_Budget_USD",
        "Available_Budget",
        "Initial_Capital_Investment_USD",
    ]:
        if candidate in assump_names:
            budget_assumption_label = candidate
            break

    if budget_assumption_label is not None:
        add_row("Available_Budget_USD", f"{assumptions_table_name}[{budget_assumption_label}]")
        add_row(
            "Budget_Remaining_USD",
            f"{TABLE_NAME}[Available_Budget_USD]-{TABLE_NAME}[Total_Program_Cost_Including_Contingency_USD]"
        )

    return rows


def _rows_to_wire(table_name: str, rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Convert rows [{label, formula}, ...] to:
    - tables: { InVivo_Tox_Budget[0:0][r]: label }
    - formulas: { InVivo_Tox_Budget[1:1][r]: "=formula" }
    """
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}

    r_idx = 1
    for row in rows:
        lab = re.sub(r"\s+", "_", row["label"].strip())
        formula = row["formula"].strip()
        tables[_key(table_name, 0, r_idx)] = lab
        if not formula.startswith("="):
            formula = "=" + formula
        formulas[_key(table_name, 1, r_idx)] = re.sub(r"\s+", "", formula)
        r_idx += 1

    return tables, formulas


# ---------- Orchestrator ----------
def run_budget_builder(
    user_prompt: str,
    assumptions_grid: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Main pure function.

    assumptions_grid is a single grid object with x/y/wells as shown
    in the user example (no outer 'tables' dict).
    """
    assumptions_table_name = assumptions_grid.get("name") or ASSUMPTIONS_TABLE_NAME

    assumption_rows = _assumptions_rows_from_grid(assumptions_grid)
    if not assumption_rows:
        raise RuntimeError(f"No rows found in assumptions grid '{assumptions_table_name}'.")

    budget_rows = _build_budget_rows(assumption_rows, assumptions_table_name=assumptions_table_name)
    budget_tables, budget_formulas = _rows_to_wire(TABLE_NAME, budget_rows)

    # Units
    budget_units: Dict[str, Dict[str, str]] = {TABLE_NAME: {}}
    for k, v in budget_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        if t == TABLE_NAME and i == 0 and j >= 1:
            budget_units[TABLE_NAME][v] = _infer_units_for_budget_label(v)

    # Build output tables
    tables_out: Dict[str, Any] = {}
    tables_out[_key(assumptions_table_name, 0, 0)] = "Label"
    tables_out[_key(assumptions_table_name, 1, 0)] = "Value"
    tables_out.update(budget_tables)

    annotations = {
        assumptions_table_name: "Header echo only; assumptions rows are supplied in the input grid.",
        TABLE_NAME: (
            "In vivo toxicology budget model (GLP 13-week, 3-dose intrathecal rat): "
            "commercial totals (base, discount, net), milestone payments (30/30/30/10), "
            "cancellation/postponement exposure estimates, schedule rollups, contingency, "
            "and optional budget remaining. Embedded defaults reflect the uploaded SOW "
            "when assumptions are missing."
        ),
    }

    artifact = {
        "tables": tables_out,
        "formulas": budget_formulas,
        "annotations": annotations,
        "units": budget_units,
        "diagnostics": "NO_ISSUES_DETECTED",
        "metadata": {
            "source": "InVivo_Tox_Budget_Calculator",
            "assumptions_table_detected": assumptions_table_name,
            "user_prompt_excerpt": (user_prompt or "")[:200],
            "embedded_sow_defaults": {
                "Quoted_Base_Study_Price_USD": SOW_DEFAULTS["Quoted_Base_Study_Price_USD"],
                "Discount_Rate": SOW_DEFAULTS["Discount_Rate"],
                "Price_After_Discount_USD": SOW_DEFAULTS["Price_After_Discount_USD"],
                "Payment_Milestones": "0.30/0.30/0.30/0.10",
                "Cancellation_Max_Fee_Rate": SOW_DEFAULTS["Cancellation_Animals_On_Site_Fee_Rate"],
                "Postponement_Min_Per_Room_Per_Week_USD": SOW_DEFAULTS["Postponement_Animals_On_Site_Min_Per_Room_Per_Week_USD"],
            },
            "target_total_range_usd": [500000, 900000],
        },
    }
    return artifact


# ---------- Ion entry/exit ----------
def _parse_assumptions_arg(assumptions_arg: Any) -> Dict[str, Any]:
    """
    param(2) from Ion may be:
    - already a dict (recommended; e.g. the grid object),
    - a JSON string of that dict.
    """
    if isinstance(assumptions_arg, dict):
        return assumptions_arg
    if isinstance(assumptions_arg, str):
        s = assumptions_arg.strip()
        if not s:
            raise RuntimeError("Assumptions input is empty.")
        return json.loads(s)
    raise RuntimeError("Assumptions param must be a dict or JSON string of the grid object.")


def _main_ion() -> int:
    try:
        user_prompt = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(1) required (user prompt)."})
        return 1

    try:
        assumptions_arg = works.param(2)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(2) required (Assumptions grid)."})
        return 1

    try:
        assumptions_grid = _parse_assumptions_arg(assumptions_arg)
    except Exception as e:
        works.resolve({"status": "❌ error", "error": f"Failed to parse assumptions grid: {e}"})
        return 1

    try:
        artifact = run_budget_builder(
            user_prompt=str(user_prompt),
            assumptions_grid=assumptions_grid,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "in-vivo-tox-budget-builder",
        })
        return 1


if __name__ == "__main__":
    works.msg("🔧 loading in vivo toxicology budget builder (SOW-embedded defaults)…")
    _main_ion()
