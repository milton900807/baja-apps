#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Combined RNA-screen + animal toxicology budget calculator (Ion Works entry/exit)

Purpose
-------
A *simple* financial model that:

- Estimates total cost for RNA-targeting screens.
- Estimates total cost for toxicology screening in animals.
- Combines them into a single Total_Program_Cost.
- Compares that against Available_Initial_Capital.
- Computes Budget_Remaining = Available_Initial_Capital - Total_Program_Cost.

Strictness
----------
- Will NOT return results unless:
    * RNA_Screen_Program_Cost can be derived from Assumptions.
    * Animal_Tox_Program_Cost can be derived from Assumptions.
    * Available_Initial_Capital can be derived from Assumptions.
- Additionally, for EVERY formula in the PnL table:
    * Every PnL[Label] reference must point to another PnL row that has
      a non-empty formula.
    * Every Assumptions[Label] reference must point to an Assumptions
      label whose value is not null/empty.
- Any violation raises a RuntimeError and no partial artifact is returned.

Ion params
----------
param(1): user prompt (str)  [not used for computation, just for annotation/context]
param(2): assumptions JSON (already-parsed dict in Ion) — must be {name, cols, rows, wells:[...]}
param(3): model (optional; ignored here but kept for interface compatibility)
param(4): temperature (optional; ignored)

Assumptions
-----------
Assumptions are taken from an Ion-style wells grid:

{ "name": "Assumptions", "cols": 2, "rows": N,
  "wells": [
      {"x":0,"y":1,"value":"Some Label"},  # labels col
      {"x":1,"y":1,"value":123},           # values col
      ...
  ]
}

Labels are normalized by replacing spaces with underscores.

RNA-screen cost logic (STRICT):
- Prefer explicit assumption:
    RNA_Screen_Program_Cost
- Else, if both Cost_Per_RNA_Screen and Num_RNA_Screens exist:
    RNA_Screen_Program_Cost = Cost_Per_RNA_Screen * Num_RNA_Screens
- Else, if Num_RNA_Screens_Duplicate / Num_RNA_Screens_Triplicate are present:
    RNA_Screen_Program_Cost =
        8959.72 * Num_RNA_Screens_Duplicate +
        12418.47 * Num_RNA_Screens_Triplicate
- Else:
    RAISE an error (do not return results).

Animal tox cost logic (STRICT):
- Prefer explicit assumption:
    Animal_Tox_Program_Cost
- Else, if Num_Tox_Animals and Cost_Per_Tox_Animal exist (+ optional Fixed_Tox_Study_Cost):
    Animal_Tox_Program_Cost =
        Num_Tox_Animals * Cost_Per_Tox_Animal
        + Fixed_Tox_Study_Cost (if present)
- Else, if preclinical-style totals exist, sum any of:
    ICV_Current_Mouse_Study_Total_Cost
    ICV_Disease_Model_Mouse_Study_Total_Cost
    ICV_Tolerance_Mouse_Study_Total_Cost
- Else:
    RAISE an error.

Capital logic (STRICT):
- Available_Initial_Capital =
    Assumptions[Available_Initial_Capital], else
    Assumptions[Initial_Capital_Available], else
    Assumptions[Available_Budget], else
    Assumptions[Cash_On_Hand], else
    RAISE an error.

Budget_Remaining:
- Budget_Remaining = Available_Initial_Capital - Total_Program_Cost
"""

import json
import re
from typing import Dict, List, Tuple, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---------- utils ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')


def _key(table: str, i: int, j: int) -> str:
    """Build a table key of the form Table[i:i][j:j]."""
    return f"{table}[{i}:{i}][{j}:{j}]"


def _to_jsonable(obj):
    """Ensure the result is JSON-serializable for Ion."""
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


def _coerce_number(v: Any) -> Any:
    """Coerce values from wells into int/float when possible."""
    if isinstance(v, (int, float)):
        return v
    if v is None:
        return 0
    if isinstance(v, str):
        s = v.strip()
        try:
            if s.isdigit():
                return int(s)
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return s
    return v


def _assumptions_rows(assumptions_json: dict) -> List[Tuple[str, Any]]:
    """
    Parse the grid/wells structure:

    { "name":"Assumptions", "cols":2, "rows":N,
      "wells":[{"x":0,"y":1,"value":"Label1"}, {"x":1,"y":1,"value":123}, ...]
    }

    Returns: [(normalized_label, value), ...]
      - labels from x=0 (y>=1)
      - values from x=1 (y>=1)
    """
    rows: List[Tuple[str, Any]] = []

    if not isinstance(assumptions_json, dict):
        raise RuntimeError("Assumptions JSON must be an object/dict.")

    if "wells" not in assumptions_json:
        raise RuntimeError("Assumptions JSON is missing 'wells' field.")

    wells = assumptions_json.get("wells") or []
    if not isinstance(wells, list):
        raise RuntimeError("Assumptions 'wells' must be a list.")

    row_to_label: Dict[int, str] = {}
    row_to_value: Dict[int, Any] = {}

    for cell in wells:
        try:
            x = cell.get("x")
            y = cell.get("y")
            val = cell.get("value")
            if y is None or y < 1:
                continue
            if x == 0:
                if isinstance(val, str) and val.strip():
                    row_to_label[y] = val.strip()
            elif x == 1:
                row_to_value[y] = _coerce_number(val)
        except Exception:
            continue

    for y in sorted(row_to_label.keys()):
        label = row_to_label.get(y)
        if not label:
            continue
        value = row_to_value.get(y, "")
        norm_label = re.sub(r"\s+", "_", label.strip())
        rows.append((norm_label, value))

    # de-dup by first occurrence
    seen = set()
    uniq: List[Tuple[str, Any]] = []
    for lab, val in rows:
        if lab not in seen:
            uniq.append((lab, val))
            seen.add(lab)
    return uniq


def _infer_units_for_pnl_label(label: str) -> str:
    """Heuristic units for PnL labels."""
    L = label.lower()
    if "margin" in L or L.endswith("_pct") or L.endswith("_rate"):
        return "fraction"
    if any(
        x in L
        for x in [
            "capital",
            "budget",
            "cost",
            "revenue",
            "shortfall",
            "remaining",
            "program_cost",
            "screen_cost",
            "tox",
        ]
    ):
        return "USD"
    if "num_" in L or L.startswith("count_"):
        return "count"
    return "unitless"


# ---------- PnL row builder ----------

def _build_pnl_rows(
    assumptions_rows: List[Tuple[str, Any]],
) -> List[Dict[str, str]]:
    """
    Build a *simple* PnL for:
      - RNA_Screen_Program_Cost
      - Animal_Tox_Program_Cost
      - Total_Program_Cost
      - Available_Initial_Capital
      - Budget_Remaining

    STRICT: if we cannot derive any of the key driver rows from the
    Assumptions table, we raise an error instead of returning partial results.
    """
    assump_names = {lab for (lab, _v) in assumptions_rows}

    rows: List[Dict[str, str]] = []

    # --- RNA_Screen_Program_Cost ---
    # 1) Direct assumption
    if "RNA_Screen_Program_Cost" in assump_names:
        rna_formula = "Assumptions[RNA_Screen_Program_Cost]"
    # 2) Cost_Per_RNA_Screen * Num_RNA_Screens
    elif (
        "Cost_Per_RNA_Screen" in assump_names
        and "Num_RNA_Screens" in assump_names
    ):
        rna_formula = (
            "Assumptions[Cost_Per_RNA_Screen]*Assumptions[Num_RNA_Screens]"
        )
    # 3) Duplicate/triplicate breakdown using known 80-ASO totals
    elif (
        "Num_RNA_Screens_Duplicate" in assump_names
        or "Num_RNA_Screens_Triplicate" in assump_names
    ):
        dup_term = (
            "8959.72*Assumptions[Num_RNA_Screens_Duplicate]"
            if "Num_RNA_Screens_Duplicate" in assump_names
            else "0"
        )
        trip_term = (
            "12418.47*Assumptions[Num_RNA_Screens_Triplicate]"
            if "Num_RNA_Screens_Triplicate" in assump_names
            else "0"
        )
        if dup_term != "0" and trip_term != "0":
            rna_formula = dup_term + "+" + trip_term
        elif dup_term != "0":
            rna_formula = dup_term
        elif trip_term != "0":
            rna_formula = trip_term
        else:
            # both terms zero => no usable counts
            raise RuntimeError(
                "Cannot derive RNA_Screen_Program_Cost: "
                "Num_RNA_Screens_Duplicate / Num_RNA_Screens_Triplicate missing or zero."
            )
    else:
        # STRICT: do NOT silently default to a constant
        raise RuntimeError(
            "Cannot derive RNA_Screen_Program_Cost: "
            "provide either RNA_Screen_Program_Cost, or "
            "Cost_Per_RNA_Screen & Num_RNA_Screens, or "
            "Num_RNA_Screens_Duplicate / Num_RNA_Screens_Triplicate."
        )

    rows.append(
        {
            "label": "RNA_Screen_Program_Cost",
            "formula": rna_formula,
        }
    )

    # --- Animal_Tox_Program_Cost ---
    # 1) Direct assumption
    if "Animal_Tox_Program_Cost" in assump_names:
        tox_formula = "Assumptions[Animal_Tox_Program_Cost]"
    else:
        base_terms = []

        # 2) Per-animal structure: Num_Tox_Animals * Cost_Per_Tox_Animal
        if (
            "Num_Tox_Animals" in assump_names
            and "Cost_Per_Tox_Animal" in assump_names
        ):
            base_terms.append(
                "Assumptions[Num_Tox_Animals]*Assumptions[Cost_Per_Tox_Animal]"
            )

        # Optional fixed overhead
        if "Fixed_Tox_Study_Cost" in assump_names:
            base_terms.append("Assumptions[Fixed_Tox_Study_Cost]")

        # 3) Preclinical-style totals if present
        preclinical_terms = []
        if "ICV_Current_Mouse_Study_Total_Cost" in assump_names:
            preclinical_terms.append(
                "Assumptions[ICV_Current_Mouse_Study_Total_Cost]"
            )
        if "ICV_Disease_Model_Mouse_Study_Total_Cost" in assump_names:
            preclinical_terms.append(
                "Assumptions[ICV_Disease_Model_Mouse_Study_Total_Cost]"
            )
        if "ICV_Tolerance_Mouse_Study_Total_Cost" in assump_names:
            preclinical_terms.append(
                "Assumptions[ICV_Tolerance_Mouse_Study_Total_Cost]"
            )

        all_terms = base_terms + preclinical_terms

        if all_terms:
            tox_formula = "+".join(all_terms)
        else:
            # STRICT: do not return results if tox cost can't be derived
            raise RuntimeError(
                "Cannot derive Animal_Tox_Program_Cost: "
                "provide Animal_Tox_Program_Cost, or "
                "Num_Tox_Animals & Cost_Per_Tox_Animal (± Fixed_Tox_Study_Cost), "
                "or preclinical total cost labels."
            )

    rows.append(
        {
            "label": "Animal_Tox_Program_Cost",
            "formula": tox_formula,
        }
    )

    # --- Total_Program_Cost ---
    rows.append(
        {
            "label": "Total_Program_Cost",
            "formula": "PnL[RNA_Screen_Program_Cost]+PnL[Animal_Tox_Program_Cost]",
        }
    )

    # --- Available_Initial_Capital (STRICT) ---
    if "Available_Initial_Capital" in assump_names:
        cap_formula = "Assumptions[Available_Initial_Capital]"
    elif "Initial_Capital_Available" in assump_names:
        cap_formula = "Assumptions[Initial_Capital_Available]"
    elif "Available_Budget" in assump_names:
        cap_formula = "Assumptions[Available_Budget]"
    elif "Cash_On_Hand" in assump_names:
        cap_formula = "Assumptions[Cash_On_Hand]"
    else:
        raise RuntimeError(
            "Cannot derive Available_Initial_Capital: "
            "provide one of Available_Initial_Capital, Initial_Capital_Available, "
            "Available_Budget, or Cash_On_Hand."
        )

    rows.append(
        {
            "label": "Available_Initial_Capital",
            "formula": cap_formula,
        }
    )

    # --- Budget_Remaining ---
    rows.append(
        {
            "label": "Budget_Remaining",
            "formula": "PnL[Available_Initial_Capital]-PnL[Total_Program_Cost]",
        }
    )

    return rows


# ---------- Reference validation ----------

def _validate_references(
    pnl_rows: List[Dict[str, str]],
    assumptions_rows: List[Tuple[str, Any]],
) -> None:
    """
    Enforce that any formula that references a table + value has that table/value:

    - For every formula:
        * PnL[Label] must refer to an existing PnL row whose formula is non-empty.
        * Assumptions[Label] must refer to an existing Assumptions row whose value
          is not null/empty.

    If any violation is found, raise RuntimeError.
    """
    # Build maps
    assump_map: Dict[str, Any] = {lab: val for (lab, val) in assumptions_rows}
    pnl_map: Dict[str, str] = {
        (row.get("label") or "").strip(): (row.get("formula") or "").strip()
        for row in pnl_rows
        if (row.get("label") or "").strip()
    }

    re_assump = re.compile(r'Assumptions\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]')
    re_pnl = re.compile(r'PnL\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]')

    for row in pnl_rows:
        row_label = (row.get("label") or "").strip()
        if not row_label:
            raise RuntimeError("Found PnL row with empty label.")

        formula = (row.get("formula") or "").strip()
        if not formula:
            raise RuntimeError(
                f"PnL row '{row_label}' has an empty formula; all PnL formulas must be non-empty."
            )

        # Validate Assumptions[...] references
        for m in re_assump.finditer(formula):
            lab = m.group("label")
            if lab not in assump_map:
                raise RuntimeError(
                    f"Formula for PnL[{row_label}] references Assumptions[{lab}], "
                    "which does not exist in the Assumptions table."
                )
            val = assump_map[lab]
            if val is None or (isinstance(val, str) and val.strip() == ""):
                raise RuntimeError(
                    f"Formula for PnL[{row_label}] references Assumptions[{lab}], "
                    "but its value is null/empty. Supply a non-empty value."
                )

        # Validate PnL[...] references
        for m in re_pnl.finditer(formula):
            lab = m.group("label")
            if lab not in pnl_map:
                raise RuntimeError(
                    f"Formula for PnL[{row_label}] references PnL[{lab}], "
                    "which does not exist as a PnL row."
                )
            other_formula = (pnl_map[lab] or "").strip()
            if not other_formula:
                raise RuntimeError(
                    f"Formula for PnL[{row_label}] references PnL[{lab}], "
                    "but that row has an empty formula."
                )


def _rows_to_wire(
    table_name: str,
    rows: List[Dict[str, str]],
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Convert rows of {"label":..., "formula":...} into:
      tables:   { key -> label }
      formulas: { key -> formula }

    where key is table_name[i:i][j:j] with:
      - i=0 for label column
      - i=1 for value/formula column
    """
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}
    r = 1
    for it in rows:
        lab = re.sub(r"\s+", "_", it["label"].strip())
        formula = re.sub(r"\s+", "", it["formula"].strip())
        tables[_key(table_name, 0, r)] = lab
        formulas[_key(table_name, 1, r)] = formula
        r += 1
    return tables, formulas


# ---------- Orchestrator ----------

def run_pnl_builder(
    user_prompt: str,
    assumptions_json: dict,
) -> Dict[str, Any]:
    """
    Top-level orchestrator used by Ion:
      - Parse assumptions
      - Build simple RNA+tox PnL
      - Validate all PnL & Assumptions references
      - Return artifact with tables, formulas, units, annotations

    If any of the key driver values cannot be derived from Assumptions,
    or any formula references a missing/null value, a RuntimeError is raised
    (no partial, guessed PnL).
    """
    rows = _assumptions_rows(assumptions_json)
    if not rows:
        raise RuntimeError("No assumptions rows found.")

    pnl_rows = _build_pnl_rows(rows)

    # NEW: validate that every referenced table/value exists & is non-null
    _validate_references(pnl_rows, rows)

    pnl_tables, pnl_formulas = _rows_to_wire("PnL", pnl_rows)

    # units
    units: Dict[str, Dict[str, str]] = {"PnL": {}}
    for k, v in pnl_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        # label column, row >= 1
        if t == "PnL" and i == 0 and j >= 1:
            units["PnL"][v] = _infer_units_for_pnl_label(v)

    # annotations
    annotations: Dict[str, str] = {
        "Assumptions": "Header echo for reference",
        "PnL": (
            "Combined RNA-screen + animal tox budget: "
            "Total_Program_Cost = RNA_Screen_Program_Cost + Animal_Tox_Program_Cost; "
            "Budget_Remaining < 0 implies a shortfall vs Available_Initial_Capital. "
            "Model fails fast if required assumptions or referenced values are missing/null."
        ),
    }

    # top-level tables (include Assumptions header echo)
    tables: Dict[str, str] = {}
    tables[_key("Assumptions", 0, 0)] = "Label"
    tables[_key("Assumptions", 1, 0)] = "Value"
    tables.update(pnl_tables)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": pnl_formulas,
        "annotations": annotations,
        "units": units,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------- Ion entry/exit ----------

def _main_ion() -> int:
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    try:
        assumptions_arg = works.param(2)
        # In your environment, param(2) is already a parsed JSON dict
        assumptions_json = assumptions_arg
    except Exception as e:
        raise RuntimeError(
            "Ion: param(2) must be the Assumptions JSON object."
        ) from e

    # param(3) and param(4) kept for interface compatibility but ignored
    try:
        _ = works.param(3)
    except Exception:
        pass
    try:
        _ = works.param(4)
    except Exception:
        pass

    try:
        artifact = run_pnl_builder(
            user_prompt=str(user_prompt),
            assumptions_json=assumptions_json,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve(
            {
                "status": "❌ error",
                "error": str(err),
                "where": "combined-rna-tox-budget-builder",
            }
        )
        raise


if __name__ == "__main__":
    works.msg("🔧 loading combined RNA + tox budget builder…")
    _main_ion()
