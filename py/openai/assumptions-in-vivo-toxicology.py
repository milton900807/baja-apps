#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
In vivo toxicology cancellation / postponement risk model
(Ion Works entry/exit)

Derived directly from Charles River SOW OPP-407864 (01-Dec-2025).

Purpose
-------
Quantify financial exposure under:
- Postponement (by notice window)
- Cancellation (by notice window)
- Animals on-site scenarios
- Early termination after study initiation

This model is deterministic and SOW-backed — no GPT calls.

Inputs
------
param(1): user_prompt (context only)
param(2): Assumptions grid (optional overrides)

Assumptions grid structure (same Ion grid format):
{
  "name": "LJL_InVivo_Tox_Risk_Assumptions",
  "cols": 2,
  "rows": N,
  "wells": [
    { "x": 0, "y": 1, "value": "Study_Price_USD" },
    { "x": 1, "y": 1, "value": 556869 }
  ]
}

If assumptions are missing, SOW defaults are used.

Outputs
-------
- InVivo_Tox_Risk table:
    • Cancellation / postponement fee estimates
    • Worst-case exposure scenarios
    • Animals-on-site minimum exposure
- Units
- Annotations
"""

import json
import re
from typing import Dict, Any, List, Tuple
from ion import works  # type: ignore

TABLE_NAME = "InVivo_Tox_Risk"
ASSUMPTIONS_TABLE_NAME = "LJL_InVivo_Tox_Risk_Assumptions"

# -------- SOW-backed defaults (authoritative) --------
SOW = {
    "Study_Price_USD": 556869,

    # Postponement – animal studies
    "Postpone_Animals_On_Site_Pct": 0.10,
    "Postpone_1_14_Days_Pct": 0.10,
    "Postpone_15_56_Days_Pct": 0.05,
    "Postpone_GT_56_Days_Pct": 0.00,
    "Postpone_Min_Per_Room_Per_Week_USD": 15000,

    # Cancellation – animal studies
    "Cancel_Animals_On_Site_Pct": 0.50,
    "Cancel_1_7_Days_Pct": 0.30,
    "Cancel_8_14_Days_Pct": 0.20,
    "Cancel_15_56_Days_Pct": 0.10,
    "Cancel_57_120_Days_Pct": 0.05,
    "Cancel_GT_120_Days_Pct": 0.00,

    # Early termination
    "Early_Termination_Max_Pct": 0.50,
}

_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')


def _key(t: str, i: int, j: int) -> str:
    return f"{t}[{i}:{i}][{j}:{j}]"


def _parse_assumptions(grid: Dict[str, Any]) -> Dict[str, Any]:
    vals = {}
    for w in grid.get("wells", []):
        if w.get("x") == 0 and w.get("y", 0) > 0:
            label = str(w.get("value")).strip()
        elif w.get("x") == 1 and w.get("y", 0) > 0:
            vals[label] = w.get("value")
    return vals


def _A(name: str, assump: Dict[str, Any]) -> str:
    if name in assump:
        return f"{ASSUMPTIONS_TABLE_NAME}[{name}]"
    return str(SOW.get(name, 0))


def _build_rows(assump: Dict[str, Any]) -> List[Dict[str, str]]:
    r = []

    def add(label, formula):
        r.append({"label": label, "formula": formula})

    add("Study_Price_USD", _A("Study_Price_USD", assump))

    # ---- Postponement scenarios ----
    add("Postpone_Animals_On_Site_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Postpone_Animals_On_Site_Pct', assump)}")

    add("Postpone_1_14_Days_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Postpone_1_14_Days_Pct', assump)}")

    add("Postpone_15_56_Days_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Postpone_15_56_Days_Pct', assump)}")

    # ---- Cancellation scenarios ----
    add("Cancel_Animals_On_Site_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Cancel_Animals_On_Site_Pct', assump)}")

    add("Cancel_1_7_Days_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Cancel_1_7_Days_Pct', assump)}")

    add("Cancel_8_14_Days_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Cancel_8_14_Days_Pct', assump)}")

    add("Cancel_15_56_Days_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Cancel_15_56_Days_Pct', assump)}")

    # ---- Early termination ----
    add("Early_Termination_Max_Fee_USD",
        f"{TABLE_NAME}[Study_Price_USD]*{_A('Early_Termination_Max_Pct', assump)}")

    # ---- Worst-case envelope ----
    add(
        "Worst_Case_Financial_Exposure_USD",
        f"MAX("
        f"{TABLE_NAME}[Cancel_Animals_On_Site_Fee_USD],"
        f"{TABLE_NAME}[Early_Termination_Max_Fee_USD]"
        f")"
    )

    return r


def _rows_to_wire(rows):
    tables = {
        _key(TABLE_NAME, 0, 0): "Label",
        _key(TABLE_NAME, 1, 0): "Value",
    }
    formulas = {}
    i = 1
    for r in rows:
        tables[_key(TABLE_NAME, 0, i)] = r["label"]
        formulas[_key(TABLE_NAME, 1, i)] = "=" + r["formula"]
        i += 1
    return tables, formulas


def run(user_prompt: str, assumptions_grid: Dict[str, Any]) -> Dict[str, Any]:
    assump = _parse_assumptions(assumptions_grid)
    rows = _build_rows(assump)
    tables, formulas = _rows_to_wire(rows)

    units = {TABLE_NAME: {}}
    for k, v in tables.items():
        m = _KEY_RE.match(k)
        if m and m.group(1) == TABLE_NAME and int(m.group(2)) == 0:
            units[TABLE_NAME][v] = "USD"

    return {
        "tables": tables,
        "formulas": formulas,
        "units": units,
        "annotations": {
            TABLE_NAME: (
                "Cancellation, postponement, and early termination exposure model "
                "derived directly from CRL SOW OPP-407864 animal study terms."
            )
        },
        "metadata": {
            "source": "InVivo_Tox_Cancellation_Risk_Model",
            "sow": "OPP-407864",
            "user_prompt_excerpt": user_prompt[:200],
        }
    }


def _main():
    user_prompt = works.param(1)
    assumptions = works.param(2) if works.param_count() > 1 else {"wells": []}
    if isinstance(assumptions, str):
        assumptions = json.loads(assumptions)
    works.resolve(run(user_prompt, assumptions))


if __name__ == "__main__":
    works.msg("⚠️ loading in vivo tox cancellation risk model…")
    _main()
