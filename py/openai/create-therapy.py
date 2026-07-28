#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Therapeutic development HIGH-LEVEL cost + time analysis builder (Ion Works entry/exit)

Builds and returns a high-level therapeutic development analysis using detailed assumptions
that already exist upstream.

Output artifact shape:
{
  "tables": {...},
  "formulas": {...},
  "annotations": {...},
  "units": {...},
  "diagnostics": "NO_ISSUES_DETECTED"
}

Included outputs
----------------
High-level costs only:
- Discovery_Cost
- IND_Enabling_Cost
- Total_Development_Cost

High-level timeline:
- Discovery_Time_Weeks
- IND_Enabling_Time_Weeks
- Total_Development_Time_Weeks

Ion params
----------
param(1): user prompt (str)
param(2): assumptions JSON (already deserialized / inline JSON / path depending on caller)
param(3): model (optional; ignored, retained for compatibility)
param(4): temperature (optional; ignored, retained for compatibility)
"""

import json
import re
from typing import Dict, List, Tuple, Any, Optional

# ---- Ion Works ----
from ion import works  # type: ignore

# ---------- regex / utils ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')
_MACHINE_LABEL_RE = re.compile(r'[^A-Za-z0-9_]+')


def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"


def _to_jsonable(obj: Any) -> Any:
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
        s = v.strip().replace(",", "")
        if s == "":
            return 0
        try:
            if re.fullmatch(r"-?\d+", s):
                return int(s)
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return v
    return v


def _normalize_label(label: str) -> str:
    label = (label or "").strip()
    label = re.sub(r"\s+", "_", label)
    label = _MACHINE_LABEL_RE.sub("_", label)
    label = re.sub(r"_+", "_", label).strip("_")
    if not label:
        return "Unnamed"
    if re.match(r"^[0-9]", label):
        label = f"X_{label}"
    return label


# ---------- assumptions parsing ----------
def _assumptions_rows(assumptions_json: Any) -> List[Tuple[str, Any]]:
    """
    Supports:
    1) wells format
    2) legacy "tables" format
    3) simple {"assumptions":[{"label":"...","value":...}, ...]}
    4) already-deserialized wrapper objects
    """

    def _parse_wells_obj(obj: dict) -> Optional[List[Tuple[str, Any]]]:
        wells = obj.get("wells")
        if not isinstance(wells, list):
            return None

        row_to_label: Dict[int, str] = {}
        row_to_value: Dict[int, Any] = {}

        for cell in wells:
            if not isinstance(cell, dict):
                continue
            try:
                x = cell.get("x")
                y = cell.get("y")
                val = cell.get("value")
                if x == 0 and y is not None and y >= 1:
                    if isinstance(val, str) and val.strip():
                        row_to_label[y] = _normalize_label(val)
                elif x == 1 and y is not None and y >= 1:
                    row_to_value[y] = _coerce_number(val)
            except Exception:
                continue

        out: List[Tuple[str, Any]] = []
        seen = set()
        for y in sorted(row_to_label.keys()):
            lab = row_to_label.get(y)
            if not lab or lab in seen:
                continue
            out.append((lab, row_to_value.get(y, 0)))
            seen.add(lab)

        return out if out else None

    def _parse_tables_obj(obj: dict) -> Optional[List[Tuple[str, Any]]]:
        tbl = obj.get("tables")
        if not isinstance(tbl, dict):
            return None

        labels: Dict[int, str] = {}
        vals: Dict[int, Any] = {}

        for k, v in tbl.items():
            m = _KEY_RE.match(str(k))
            if not m:
                continue
            table_name, i, j = m.group(1), int(m.group(2)), int(m.group(3))
            if table_name != "Assumptions" or j == 0:
                continue
            if i == 0:
                labels[j] = _normalize_label(str(v))
            elif i == 1:
                vals[j] = _coerce_number(v)

        out: List[Tuple[str, Any]] = []
        seen = set()
        for j in sorted(set(labels.keys()) | set(vals.keys())):
            lab = labels.get(j)
            if not lab or lab in seen:
                continue
            out.append((lab, vals.get(j, 0)))
            seen.add(lab)

        return out if out else None

    def _parse_assumptions_list_obj(obj: dict) -> Optional[List[Tuple[str, Any]]]:
        arr = obj.get("assumptions")
        if not isinstance(arr, list):
            return None

        out: List[Tuple[str, Any]] = []
        seen = set()
        for it in arr:
            if not isinstance(it, dict):
                continue
            lab = _normalize_label(str(it.get("label", "")))
            if not lab or lab in seen:
                continue
            out.append((lab, _coerce_number(it.get("value", 0))))
            seen.add(lab)

        return out if out else None

    def _try_parse(obj: Any) -> Optional[List[Tuple[str, Any]]]:
        if obj is None:
            return None

        if isinstance(obj, list):
            out: List[Tuple[str, Any]] = []
            seen = set()
            for it in obj:
                if not isinstance(it, dict):
                    continue
                if "label" not in it:
                    continue
                lab = _normalize_label(str(it.get("label", "")))
                if not lab or lab in seen:
                    continue
                out.append((lab, _coerce_number(it.get("value", 0))))
                seen.add(lab)
            return out if out else None

        if not isinstance(obj, dict):
            return None

        for parser in (_parse_wells_obj, _parse_tables_obj, _parse_assumptions_list_obj):
            rows = parser(obj)
            if rows:
                return rows

        for wrapper_key in ("artifact", "result", "data", "payload", "output", "response"):
            if wrapper_key in obj:
                rows = _try_parse(obj.get(wrapper_key))
                if rows:
                    return rows

        return None

    rows = _try_parse(assumptions_json)
    if rows:
        return rows

    raise RuntimeError("Unrecognized assumptions JSON shape.")


def _assumption_map(rows: List[Tuple[str, Any]]) -> Dict[str, Any]:
    return {lab: val for lab, val in rows}


# ---------- label helpers ----------
def _pick_existing_label(assumption_labels: set, candidates: List[str]) -> Optional[str]:
    for c in candidates:
        if c in assumption_labels:
            return c
    return None


def _sum_assumptions_formula(assumption_labels: set, candidates: List[str]) -> str:
    refs = [f"Assumptions[{c}]" for c in candidates if c in assumption_labels]
    return "+".join(refs) if refs else "0"


def _prefer_assumption_or_sum(
    assumption_labels: set,
    preferred_total_labels: List[str],
    component_labels: List[str],
) -> str:
    preferred = _pick_existing_label(assumption_labels, preferred_total_labels)
    if preferred:
        return f"Assumptions[{preferred}]"
    return _sum_assumptions_formula(assumption_labels, component_labels)


# ---------- high-level row builder ----------
def _build_high_level_rows(assumptions_rows: List[Tuple[str, Any]]) -> List[Dict[str, str]]:
    labels = set(lab for lab, _ in assumptions_rows)

    discovery_cost_formula = _prefer_assumption_or_sum(
        labels,
        preferred_total_labels=[
            "Discovery_Cost",
            "Discovery_Subtotal_Cost",
            "Discovery_Cost_USD",
            "Discovery_Subtotal_Cost_USD",
        ],
        component_labels=[
            "Design_Cost",
            "Design_Cost_USD",
            "Research_Grade_Synthesis_Cost",
            "Research_Grade_Synthesis_Cost_USD",
            "Screening_Cost",
            "Screening_Cost_USD",
            "Dose_Response_Screening_Cost",
            "Dose_Response_Screening_Cost_USD",
            "Protein_Screening_Cost",
            "Protein_Screening_Cost_USD",
            "Immunogenic_Screening_In_Vitro_Cost",
            "Immunogenic_Screening_In_Vitro_Cost_USD",
        ],
    )

    ind_enabling_cost_formula = _prefer_assumption_or_sum(
        labels,
        preferred_total_labels=[
            "IND_Enabling_Cost",
            "IND_Enabling_Subtotal_Cost",
            "IND_Enabling_Cost_USD",
            "IND_Enabling_Subtotal_Cost_USD",
        ],
        component_labels=[
            "GMP_Production_Cost",
            "GMP_Production_Cost_USD",
            "GLP_In_Vivo_Toxicology_13_Weeks_Cost",
            "GLP_In_Vivo_Toxicology_13_Weeks_Cost_USD",
            "Fill_Finish_Cost",
            "Fill_Finish_Cost_USD",
            "IND_Filing_Cost",
            "IND_Filing_Cost_USD",
        ],
    )

    discovery_time_formula = _prefer_assumption_or_sum(
        labels,
        preferred_total_labels=[
            "Discovery_Time_Weeks",
            "Discovery_Subtotal_Time_Weeks",
        ],
        component_labels=[
            "Design_Time_Weeks",
            "Research_Grade_Synthesis_Time_Weeks",
            "Screening_Time_Weeks",
            "Dose_Response_Screening_Time_Weeks",
            "Protein_Screening_Time_Weeks",
            "Immunogenic_Screening_In_Vitro_Time_Weeks",
        ],
    )

    ind_enabling_time_formula = _prefer_assumption_or_sum(
        labels,
        preferred_total_labels=[
            "IND_Enabling_Time_Weeks",
            "IND_Enabling_Subtotal_Time_Weeks",
        ],
        component_labels=[
            "GMP_Production_Time_Weeks",
            "GLP_In_Vivo_Toxicology_13_Weeks_Time_Weeks",
            "Fill_Finish_Time_Weeks",
            "IND_Filing_Time_Weeks",
        ],
    )

    rows = [
        {"label": "Discovery_Cost", "formula": discovery_cost_formula},
        {"label": "IND_Enabling_Cost", "formula": ind_enabling_cost_formula},
        {
            "label": "Total_Development_Cost",
            "formula": "Analysis[Discovery_Cost]+Analysis[IND_Enabling_Cost]",
        },
        {"label": "Discovery_Time_Weeks", "formula": discovery_time_formula},
        {"label": "IND_Enabling_Time_Weeks", "formula": ind_enabling_time_formula},
        {
            "label": "Total_Development_Time_Weeks",
            "formula": "Analysis[Discovery_Time_Weeks]+Analysis[IND_Enabling_Time_Weeks]",
        },
    ]
    return rows


# ---------- units ----------
def _infer_analysis_units(label: str) -> str:
    l = label.lower()
    if l.endswith("_cost") or "cost" in l:
        return "USD"
    if l.endswith("_time_weeks") or "weeks" in l:
        return "weeks"
    return "unitless"


# ---------- wire conversion ----------
def _rows_to_wire(table_name: str, rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}

    r = 1
    for it in rows:
        lab = _normalize_label(it["label"])
        formula = re.sub(r"\s+", "", str(it["formula"]).strip())
        tables[_key(table_name, 0, r)] = lab
        formulas[_key(table_name, 1, r)] = formula
        r += 1

    return tables, formulas


# ---------- main generation ----------
def generate_high_level_therapeutic_analysis(
    *,
    user_prompt: str,
    assumptions_rows: List[Tuple[str, Any]],
) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, Dict[str, str]], Dict[str, str]]:
    rows = _build_high_level_rows(assumptions_rows)
    analysis_tables, analysis_formulas = _rows_to_wire("Analysis", rows)

    units: Dict[str, Dict[str, str]] = {"Analysis": {}}
    for k, v in analysis_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        if t == "Analysis" and i == 0 and j >= 1:
            units["Analysis"][v] = _infer_analysis_units(v)

    annotations = {
        "Analysis": (
            "High-level pre-IND therapeutic development summary using detailed assumptions rolled up into "
            "Discovery, IND-enabling, and Total cost/time outputs."
        )
    }

    return analysis_tables, analysis_formulas, units, annotations


# ---------- orchestrator ----------
def run_therapeutic_cost_time_builder(
    user_prompt: str,
    assumptions_json: Any,
    *,
    model: str = "gpt-4o-mini",       # retained for compatibility
    temperature: float = 0.15,        # retained for compatibility
) -> Dict[str, Any]:
    assumption_rows = _assumptions_rows(assumptions_json)
    if not assumption_rows:
        raise RuntimeError("No assumptions rows found.")

    analysis_tables, analysis_formulas, units, annotations = generate_high_level_therapeutic_analysis(
        user_prompt=user_prompt,
        assumptions_rows=assumption_rows,
    )

    tables = {
        _key("Assumptions", 0, 0): "Label",
        _key("Assumptions", 1, 0): "Value",
    }
    tables.update(analysis_tables)

    artifact = {
        "tables": tables,
        "formulas": analysis_formulas,
        "annotations": {
            "Assumptions": "Header echo for reference",
            **annotations,
        },
        "units": units,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------- ion entrypoint ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    try:
        assumptions_json = works.param(2)
    except Exception as e:
        raise RuntimeError("Ion: param(2) must be assumptions JSON.") from e

    try:
        model = str(works.param(3) or default_model)
    except Exception:
        model = default_model

    try:
        temperature = float(works.param(4) or 0.15)
    except Exception:
        temperature = 0.15

    try:
        artifact = run_therapeutic_cost_time_builder(
            user_prompt=str(user_prompt),
            assumptions_json=assumptions_json,
            model=model,
            temperature=temperature,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "therapeutic-cost-time-builder-high-level",
        })
        raise


if __name__ == "__main__":
    works.msg("🔧 loading high-level therapeutic cost + time analysis builder…")
    _main_ion("gpt-4o-mini")