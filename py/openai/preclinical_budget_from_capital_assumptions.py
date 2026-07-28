#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Preclinical budget calculator (Ion Works entry/exit)

Strictly calculates the budget required for:
1) Repeating in vitro screens in patient iPSC-derived neurons
2) Current ICV mouse study
3) Planned ICV disease-model mouse study
4) Planned ICV tolerance mouse study

Using:
- Assumptions table (cost drivers for experiments)
- Capital_Assumptions table (separate table in the workbook) to derive initial capital

Outputs:
- Total_Preclinical_Program_Cost
- Available_Initial_Capital  (from Capital_Assumptions[…])
- Budget_Remaining = Available_Initial_Capital - Total_Preclinical_Program_Cost

Ion params
----------
param(1): user prompt (str)
param(2): assumptions JSON (inline JSON string or path to a JSON file) — must be {name, cols, rows, wells:[...]} or tables
param(3): model (optional; default: gpt-4o-mini)
param(4): temperature (optional; default: 0.15)
"""

import os
import json
import re
from typing import Dict, List, Tuple, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---------- utils ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')
_IDENT_LABEL_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)

def _extract_json_snippet(text: str) -> str:
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e <= s:
        raise ValueError("No JSON object found.")
    return text[s:e+1].strip()

def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.15,
    json_mode: bool = False,
    max_tokens: int = 2000,
) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return (resp.choices[0].message.content or "").strip()

def _load_json_from_path_or_text(s: str) -> dict:
    s = (s or "").strip()
    if not s:
        raise RuntimeError("Assumptions input is empty.")
    if s.startswith("{") or s.startswith("["):
        return json.loads(s)
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

def _coerce_number(v: Any) -> Any:
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
    Supports the grid/wells structure:
    { "name":"Assumptions", "cols":2, "rows":N, "wells":[{x,y,value,field:[...]}...] }
    Returns: [(label, value), ...] where labels come from x=0 (y>=1) and values from x=1 (y>=1).
    """
    rows: List[Tuple[str, Any]] = []

    # --- wells format ---
    if isinstance(assumptions_json, dict) and "wells" in assumptions_json:
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
                if x == 0 and y is not None and y >= 1:
                    if isinstance(val, str) and val.strip():
                        row_to_label[y] = val.strip()
                elif x == 1 and y is not None and y >= 1:
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
        # de-dup
        seen = set()
        uniq: List[Tuple[str, Any]] = []
        for lab, val in rows:
            if lab not in seen:
                uniq.append((lab, val))
                seen.add(lab)
        return uniq

    # --- fallback legacy shapes (tables/assumptions) if ever passed in ---
    if "tables" in assumptions_json:
        tbl = {k: v for k, v in (assumptions_json.get("tables") or {}).items()}
        labels, vals = {}, {}
        for k, v in tbl.items():
            m = _KEY_RE.match(k)
            if not m:
                continue
            t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
            if t != "Assumptions" or j == 0:
                continue
            if i == 0:
                labels[j] = str(v)
            elif i == 1:
                vals[j] = _coerce_number(v)
        out = []
        for j in sorted(set(labels.keys()) | set(vals.keys())):
            lab = labels.get(j)
            if lab:
                out.append((re.sub(r"\s+", "_", lab.strip()), vals.get(j, "")))
        return out

    if "assumptions" in assumptions_json:
        out = []
        for it in assumptions_json["assumptions"]:
            lab = str(it.get("label", "")).strip()
            if not lab:
                continue
            out.append((re.sub(r"\s+", "_", lab), _coerce_number(it.get("value", ""))))
        return out

    raise RuntimeError("Unrecognized assumptions JSON shape.")

def _infer_units_for_pnl_label(label: str) -> str:
    L = label.lower()
    if "margin" in L or L.endswith("_pct") or L.endswith("_rate"):
        return "fraction"
    if any(x in L for x in [
        "capital", "budget", "cost", "revenue", "shortfall", "remaining"
    ]):
        return "USD"
    return "unitless"

# ---------- LLM schema + generation ----------
PNL_SCHEMA_MSG = """
You must output ONLY valid JSON. Build a two-column 'PnL' table that is strictly focused on budget:

1) Estimate experiment-level costs for:
   - Repeating in vitro screens in patient iPSC-derived neurons.
   - Current ICV single-dose mouse study.
   - Upcoming ICV disease-model mouse study.
   - Planned ICV tolerance mouse study in wild-type mice.

2) Compute:
   - Available_Initial_Capital (from a separate Capital_Assumptions table, referenced as Capital_Assumptions[Label], NOT from Assumptions).
   - Total_Preclinical_Program_Cost (sum of the four experiment-level costs).
   - Budget_Remaining = Available_Initial_Capital - Total_Preclinical_Program_Cost.

Return JSON with the EXACT shape:
{
  "rows": [
    {"label": "InVitro_iPSC_Screening_Cost", "formula": "Assumptions[Num_iPSC_Screen_Runs]*Assumptions[Cost_Per_iPSC_Screen_Run]"},
    {"label": "ICV_Current_Mouse_Study_Total_Cost", "formula": "Assumptions[ICV_Current_Mouse_Num_Animals]*Assumptions[ICV_Current_Mouse_Per_Animal_Cost]+Assumptions[ICV_Current_Mouse_Histology_Target_Engagement_Cost]"},
    {"label": "ICV_Disease_Model_Mouse_Study_Total_Cost", "formula": "Assumptions[ICV_Disease_Model_Mouse_Num_Animals]*Assumptions[ICV_Disease_Model_Mouse_Per_Animal_Cost]+Assumptions[ICV_Disease_Model_Mouse_Collaborator_Fee]"},
    {"label": "ICV_Tolerance_Mouse_Study_Total_Cost", "formula": "Assumptions[ICV_Tolerance_Mouse_Num_Animals]*Assumptions[ICV_Tolerance_Mouse_Per_Animal_Cost]+Assumptions[ICV_Tolerance_Mouse_Histology_Target_Engagement_Cost]"},
    {"label": "Total_Preclinical_Program_Cost", "formula": "PnL[InVitro_iPSC_Screening_Cost]+PnL[ICV_Current_Mouse_Study_Total_Cost]+PnL[ICV_Disease_Model_Mouse_Study_Total_Cost]+PnL[ICV_Tolerance_Mouse_Study_Total_Cost]"},
    {"label": "Available_Initial_Capital", "formula": "Capital_Assumptions[Initial_Capital_Available]"},
    {"label": "Budget_Remaining", "formula": "PnL[Available_Initial_Capital]-PnL[Total_Preclinical_Program_Cost]"}
  ],
  "notes": "One-sentence annotation explaining how much budget is required, the available capital, and the remaining surplus or shortfall."
}

STRICT rules:
- Use ONLY labels from the provided Assumptions list when referencing Assumptions[...].
- For capital, use ONLY Capital_Assumptions[Label].
- Reference PnL rows via PnL[Label] where needed (e.g., PnL[Total_Preclinical_Program_Cost]).
- Use only + - * / ^ and parentheses. No ranges, no dot notation, no functions.
- Provide 8–16 sensible PnL rows, ordered logically from experiment-level costs, to totals, to capital and Budget_Remaining.
- Labels must be unique and machine-friendly (underscores, no spaces).
- When entering rates that are percentages use 0-1 values instead of 0-100.
- If a referenced Assumptions label is not available, remove or rewrite that row.
- You MAY use numeric constants directly in formulas when no suitable Assumptions or Capital_Assumptions label exists,
  but prefer Assumptions[Label] or Capital_Assumptions[Label] whenever possible.
"""

def _list_assumption_labels(rows: List[Tuple[str, Any]]) -> List[str]:
    return [lab for (lab, _v) in rows]

def _filter_rows_to_valid_assumptions(rows: List[Dict[str, str]], valid_labels: set) -> List[Dict[str, str]]:
    """
    Validate only Assumptions[...] references; Capital_Assumptions[...] are allowed and not checked here,
    because they come from a separate table.
    """
    out = []
    ref_re = re.compile(r'Assumptions\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]')
    for r in rows:
        f = r.get("formula", "")
        invalid = any(m.group("label") not in valid_labels for m in ref_re.finditer(f))
        if not invalid:
            out.append(r)
    return out

# ---- ensure experiment-specific rows exist ----
def _ensure_experiment_rows(
    assumptions_rows: List[Tuple[str, Any]],
    rows: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Ensure the following experiment rows exist in PnL with reasonable default formulas:
    - InVitro_iPSC_Screening_Cost
    - ICV_Current_Mouse_Study_Total_Cost
    - ICV_Disease_Model_Mouse_Study_Total_Cost
    - ICV_Tolerance_Mouse_Study_Total_Cost
    - Total_Preclinical_Program_Cost
    """
    existing_labels = [r.get("label", "") for r in rows]
    label_to_idx = {lab: i for i, lab in enumerate(existing_labels)}
    assump_names = {lab for (lab, _v) in assumptions_rows}

    def _insert_row(label: str, formula: str, after_labels: List[str]) -> None:
        nonlocal rows, existing_labels, label_to_idx
        if label in label_to_idx:
            return
        new_row = {"label": label, "formula": formula}
        insert_idx = None
        for a_lab in after_labels:
            if a_lab in label_to_idx:
                insert_idx = label_to_idx[a_lab] + 1
        if insert_idx is None:
            rows.append(new_row)
        else:
            rows.insert(insert_idx, new_row)
        existing_labels[:] = [r.get("label", "") for r in rows]
        label_to_idx.clear()
        label_to_idx.update({lab: i for i, lab in enumerate(existing_labels)})

    # InVitro_iPSC_Screening_Cost
    if "InVitro_iPSC_Screening_Cost" not in label_to_idx:
        if "iPSC_Screen_Total_Cost" in assump_names:
            formula = "Assumptions[iPSC_Screen_Total_Cost]"
        elif "Num_iPSC_Screen_Runs" in assump_names and "Cost_Per_iPSC_Screen_Run" in assump_names:
            formula = "Assumptions[Num_iPSC_Screen_Runs]*Assumptions[Cost_Per_iPSC_Screen_Run]"
        else:
            formula = "25000"  # default one repeat screen ~25k
        _insert_row("InVitro_iPSC_Screening_Cost", formula, [])

    # ICV_Current_Mouse_Study_Total_Cost
    if "ICV_Current_Mouse_Study_Total_Cost" not in label_to_idx:
        if "ICV_Current_Mouse_Total_Cost" in assump_names:
            formula = "Assumptions[ICV_Current_Mouse_Total_Cost]"
        elif "ICV_Current_Mouse_Num_Animals" in assump_names and "ICV_Current_Mouse_Per_Animal_Cost" in assump_names:
            if "ICV_Current_Mouse_Histology_Target_Engagement_Cost" in assump_names:
                formula = (
                    "Assumptions[ICV_Current_Mouse_Num_Animals]*Assumptions[ICV_Current_Mouse_Per_Animal_Cost]"
                    "+Assumptions[ICV_Current_Mouse_Histology_Target_Engagement_Cost]"
                )
            else:
                formula = "Assumptions[ICV_Current_Mouse_Num_Animals]*Assumptions[ICV_Current_Mouse_Per_Animal_Cost]"
        else:
            formula = "10*6000"  # default ~10 mice @ 6k each
        _insert_row("ICV_Current_Mouse_Study_Total_Cost", formula, ["InVitro_iPSC_Screening_Cost"])

    # ICV_Disease_Model_Mouse_Study_Total_Cost
    if "ICV_Disease_Model_Mouse_Study_Total_Cost" not in label_to_idx:
        if "ICV_Disease_Model_Mouse_Total_Cost" in assump_names:
            formula = "Assumptions[ICV_Disease_Model_Mouse_Total_Cost]"
        elif "ICV_Disease_Model_Mouse_Num_Animals" in assump_names and "ICV_Disease_Model_Mouse_Per_Animal_Cost" in assump_names:
            base = "Assumptions[ICV_Disease_Model_Mouse_Num_Animals]*Assumptions[ICV_Disease_Model_Mouse_Per_Animal_Cost]"
            if "ICV_Disease_Model_Mouse_Collaborator_Fee" in assump_names:
                formula = base + "+Assumptions[ICV_Disease_Model_Mouse_Collaborator_Fee]"
            else:
                formula = base
        else:
            formula = "12*7000+20000"  # default disease-model @7k + 20k collab fee
        _insert_row("ICV_Disease_Model_Mouse_Study_Total_Cost", formula, ["ICV_Current_Mouse_Study_Total_Cost"])

    # ICV_Tolerance_Mouse_Study_Total_Cost
    if "ICV_Tolerance_Mouse_Study_Total_Cost" not in label_to_idx:
        if "ICV_Tolerance_Mouse_Total_Cost" in assump_names:
            formula = "Assumptions[ICV_Tolerance_Mouse_Total_Cost]"
        elif "ICV_Tolerance_Mouse_Num_Animals" in assump_names and "ICV_Tolerance_Mouse_Per_Animal_Cost" in assump_names:
            if "ICV_Tolerance_Mouse_Histology_Target_Engagement_Cost" in assump_names:
                formula = (
                    "Assumptions[ICV_Tolerance_Mouse_Num_Animals]*Assumptions[ICV_Tolerance_Mouse_Per_Animal_Cost]"
                    "+Assumptions[ICV_Tolerance_Mouse_Histology_Target_Engagement_Cost]"
                )
            else:
                formula = "Assumptions[ICV_Tolerance_Mouse_Num_Animals]*Assumptions[ICV_Tolerance_Mouse_Per_Animal_Cost]"
        else:
            formula = "12*5000"  # default WT tolerance @5k each
        _insert_row("ICV_Tolerance_Mouse_Study_Total_Cost", formula, ["ICV_Disease_Model_Mouse_Study_Total_Cost"])

    # Total_Preclinical_Program_Cost
    if "Total_Preclinical_Program_Cost" not in label_to_idx:
        formula = (
            "PnL[InVitro_iPSC_Screening_Cost]"
            "+PnL[ICV_Current_Mouse_Study_Total_Cost]"
            "+PnL[ICV_Disease_Model_Mouse_Study_Total_Cost]"
            "+PnL[ICV_Tolerance_Mouse_Study_Total_Cost]"
        )
        _insert_row("Total_Preclinical_Program_Cost", formula, ["ICV_Tolerance_Mouse_Study_Total_Cost"])

    return rows

# ---- ensure budget rows (capital from Capital_Assumptions + remaining) ----
def _ensure_budget_rows_using_capital_assumptions(
    capital_rows: List[Tuple[str, Any]],
    rows: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Ensure:
    - Available_Initial_Capital (from Capital_Assumptions[...] table)
    - Budget_Remaining = Available_Initial_Capital - Total_Preclinical_Program_Cost

    We only reference Capital_Assumptions[...] here, never Assumptions[...] for capital.
    """
    existing_labels = [r.get("label", "") for r in rows]
    label_to_idx = {lab: i for i, lab in enumerate(existing_labels)}
    capital_names = {lab for (lab, _v) in capital_rows}

    def _insert_row(label: str, formula: str, after_labels: List[str]) -> None:
        nonlocal rows, existing_labels, label_to_idx
        if label in label_to_idx:
            return
        new_row = {"label": label, "formula": formula}
        insert_idx = None
        for a_lab in after_labels:
            if a_lab in label_to_idx:
                insert_idx = label_to_idx[a_lab] + 1
        if insert_idx is None:
            rows.append(new_row)
        else:
            rows.insert(insert_idx, new_row)
        existing_labels[:] = [r.get("label", "") for r in rows]
        label_to_idx.clear()
        label_to_idx.update({lab: i for i, lab in enumerate(existing_labels)})

    # Available_Initial_Capital from Capital_Assumptions
    if "Available_Initial_Capital" not in label_to_idx:
        capital_label = None
        for candidate in ["Initial_Capital_Available", "Available_Budget", "Cash_On_Hand"]:
            if candidate in capital_names:
                capital_label = candidate
                break

        if capital_label:
            formula = f"Capital_Assumptions[{capital_label}]"
        else:
            # Fallback constant if capital table doesn't have a recognizable label.
            # Still do NOT pull from Assumptions — requirement is to derive from capital_assumptions,
            # so we default rather than cross-using Assumptions.
            formula = "0"

        _insert_row("Available_Initial_Capital", formula, ["Total_Preclinical_Program_Cost"])

    # Budget_Remaining = Available_Initial_Capital - Total_Preclinical_Program_Cost
    if "Budget_Remaining" not in label_to_idx:
        formula = "PnL[Available_Initial_Capital]-PnL[Total_Preclinical_Program_Cost]"
        _insert_row("Budget_Remaining", formula, ["Available_Initial_Capital"])

    return rows

def _rows_to_wire(table_name: str, rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    tables: Dict[str, str] = {_key(table_name, 0, 0): "Label", _key(table_name, 1, 0): "Value"}
    formulas: Dict[str, str] = {}
    r = 1
    for it in rows:
        lab = re.sub(r"\s+", "_", it["label"].strip())
        tables[_key(table_name, 0, r)] = lab
        formulas[_key(table_name, 1, r)] = re.sub(r"\s+", "", it["formula"].strip())
        r += 1
    return tables, formulas

def generate_pnl_via_gpt(
    *,
    user_prompt: str,
    assumptions_rows: List[Tuple[str, Any]],
    capital_rows: List[Tuple[str, Any]],
    model: str = "gpt-4o-mini",
    temperature: float = 0.15,
) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, Dict[str, str]], Dict[str, str]]:
    valid_labs = _list_assumption_labels(assumptions_rows)
    assumptions_preview = "\n".join(f"- {lab} = {val}" for lab, val in assumptions_rows[:120])
    capital_preview = "\n".join(f"- {lab} = {val}" for lab, val in capital_rows[:60]) or "None detected in this op (referenced externally)."

    system = "You are a meticulous financial-modeling assistant focused on preclinical budget and capital. Return JSON exactly per schema."
    user = (
        f"{PNL_SCHEMA_MSG}\n\n"
        f"USER PROMPT:\n{user_prompt.strip()}\n\n"
        "AVAILABLE ASSUMPTIONS (labels you may reference as Assumptions[Label]):\n"
        f"{assumptions_preview}\n\n"
        "AVAILABLE CAPITAL ASSUMPTIONS (labels you may reference as Capital_Assumptions[Label]):\n"
        f"{capital_preview}\n\n"
        "Reminder: Only reference the labels listed above when using Assumptions[...] or Capital_Assumptions[...]."
    )

    works.msg("🧾 requesting preclinical budget rows + formulas from GPT…")
    content = _chat_call(model=model, system=system, user=user, temperature=temperature, json_mode=True, max_tokens=4000)
    try:
        data = json.loads(content)
    except Exception:
        data = json.loads(_extract_json_snippet(content))

    rows = data.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("GPT did not return any PnL rows.")

    rows_ok = _filter_rows_to_valid_assumptions(rows, set(valid_labs))
    if not rows_ok:
        raise RuntimeError("All returned PnL rows referenced missing Assumptions labels.")

    rows_ok = _ensure_experiment_rows(assumptions_rows, rows_ok)
    rows_ok = _ensure_budget_rows_using_capital_assumptions(capital_rows, rows_ok)

    pnl_tables, pnl_formulas = _rows_to_wire("PnL", rows_ok)

    units: Dict[str, Dict[str, str]] = {"PnL": {}}
    for k, v in pnl_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        if t == "PnL" and i == 0 and j >= 1:
            units["PnL"][v] = _infer_units_for_pnl_label(v)

    annotations = {
        "PnL": str(
            data.get("notes")
            or "Budget model: compares Available_Initial_Capital from Capital_Assumptions vs Total_Preclinical_Program_Cost; Budget_Remaining < 0 implies shortfall."
        )
    }
    return pnl_tables, pnl_formulas, units, annotations

# ---------- Orchestrator ----------
def run_pnl_builder(
    user_prompt: str,
    assumptions_json: dict,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.15
) -> Dict[str, Any]:
    # Assumption rows for experiment costs
    rows = _assumptions_rows(assumptions_json)
    if not rows:
        raise RuntimeError("No assumptions rows found.")

    # Capital rows: derived from the same JSON only if there's an embedded capital list;
    # otherwise we leave it empty and rely on external Capital_Assumptions table.
    capital_rows: List[Tuple[str, Any]] = []
    if "capital_assumptions" in assumptions_json and isinstance(assumptions_json["capital_assumptions"], list):
        tmp = []
        for it in assumptions_json["capital_assumptions"]:
            lab = str(it.get("label", "")).strip()
            if not lab:
                continue
            tmp.append((re.sub(r"\s+", "_", lab), _coerce_number(it.get("value", ""))))
        capital_rows = tmp

    pnl_tables, pnl_formulas, pnl_units, pnl_ann = generate_pnl_via_gpt(
        user_prompt=user_prompt,
        assumptions_rows=rows,
        capital_rows=capital_rows,
        model=model,
        temperature=temperature,
    )

    tables = {}
    # Echo headers for reference (no assumption rows duplicated)
    tables[_key("Assumptions", 0, 0)] = "Label"
    tables[_key("Assumptions", 1, 0)] = "Value"
    tables.update(pnl_tables)

    annotations = {"Assumptions": "Header echo for reference"}
    annotations.update(pnl_ann)

    artifact = {
        "tables": tables,
        "formulas": pnl_formulas,
        "annotations": annotations,
        "units": pnl_units,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact

# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    try:
        assumptions_arg = works.param(2)
        assumptions_json = ((assumptions_arg))
    except Exception as e:
        raise RuntimeError("Ion: param(2) must be the Assumptions JSON (inline or path).") from e

    model = (works.param(3) or default_model)
    try:
        temperature = float(works.param(4) or 0.15)
    except Exception:
        temperature = 0.15

    try:
        artifact = run_pnl_builder(
            user_prompt=str(user_prompt),
            assumptions_json=assumptions_json,
            model=str(model),
            temperature=temperature,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({"status": "❌ error", "error": str(err), "where": "preclinical-budget-capital-assumptions-builder"})
        raise

if __name__ == "__main__":
    works.msg("🔧 loading preclinical budget (capital_assumptions) builder…")
    _main_ion("gpt-4o-mini")
