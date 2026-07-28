#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Budget builder (Ion Works entry/exit) – Pattern B (fully decomposed GMP budget)
+ modality-specific GMP_Special_Ops table.

Changes vs previous Pattern B:
------------------------------
• STILL fully decomposed GMP Budget (no CRO_Manufacturing_Costs_USD).
• Adds a SECOND table: GMP_Special_Ops
    - Modality-specific and additional operations inferred from user_prompt.
    - Examples:
        * mRNA / long RNAs / long nucleotides:
            - Electrophoresis_Characterization_Costs_USD
            - Capillary_Electrophoresis_Costs_USD
            - AUC_Characterization_Costs_USD
        * ASOs / short oligos:
            - LC_MS_Characterization_Costs_USD
            - HRMS_Confirmation_Costs_USD
            - MSMS_Sequencing_Costs_USD
    - Quantified per modality (cost per program, per batch, or per run as implied).
• Both tables are returned in Ion wire format:
    - tables["GMP_Budget[...][...]"], tables["GMP_Special_Ops[...][...]"]
    - formulas in corresponding entries.

Ion params:
-----------
param(1): user prompt (str)
param(2): GMP_Assumptions JSON (dict: grid/wells)
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

# ---------- config ----------
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0.15
MAX_TOKENS = 4000

# ---------- regex helpers ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')
_BUDGET_REF_RE = re.compile(r'GMP_Budget\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]')


# ---------- basic helpers ----------

def _key(table: str, i: int, j: int) -> str:
    """Build a table key of the form Table[i:i][j:j]."""
    return f"{table}[{i}:{i}][{j}:{j}]"


def _normalize_label(s: str) -> str:
    """Normalize a label into machine-friendly snake_case style."""
    return re.sub(r"\s+", "_", s.strip())


def _safe_json(obj: Any) -> Any:
    """Ensure the result is JSON-serializable for Ion."""
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


# ---------- number + GMP assumptions handling ----------

def _coerce_number(v: Any) -> Any:
    """Coerce values from wells into int/float when possible."""
    if isinstance(v, (int, float)):
        return v
    if v is None:
        return 0
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return 0
        try:
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return s
    return v


def _parse_gmp_assumptions(gmp_json: dict) -> List[Tuple[str, Any]]:
    """
    Parse the grid/wells structure for GMP_Assumptions:

    { "name":"GMP_Assumptions", "cols":2, "rows":N,
      "wells":[{"x":0,"y":1,"value":"Label1"}, {"x":1,"y":1,"value":123}, ...]
    }

    Returns: [(normalized_label, value), ...]
      - labels from x=0 (y>=1)
      - values from x=1 (y>=1)
    """
    wells = gmp_json.get("wells", [])
    rows: Dict[int, Dict[str, Any]] = {}
    for w in wells:
        x, y, val = w.get("x"), w.get("y"), w.get("value")
        if y is None or y < 1:
            continue
        if x == 0:
            rows.setdefault(y, {})["label"] = _normalize_label(str(val))
        elif x == 1:
            rows.setdefault(y, {})["value"] = _coerce_number(val)

    out: List[Tuple[str, Any]] = []
    for y in sorted(rows.keys()):
        lab = rows[y].get("label")
        val = rows[y].get("value", "")
        if lab:
            out.append((lab, val))
    return out


# ---------- units inference ----------

def _infer_units(label: str) -> str:
    """Heuristic units for cost rows."""
    L = label.lower()
    if any(
        k in L
        for k in [
            "cost", "fee", "budget", "cmc", "batch", "stability",
            "analytics", "validation", "development", "synthesis",
            "purification", "aliquot", "electrophoresis", "ms", "msms"
        ]
    ):
        return "USD"
    return "unitless"


# ---------- LLM schema + prompting ----------

SCHEMA = r"""
You must output ONLY valid JSON with this EXACT top-level shape:

{
  "budget_rows": [
    {"label": "Familiarization_Run_Costs_USD", "value": 27500},
    {"label": "GMP_Batch_Option1_Costs_USD", "value": 225500},
    {"label": "Dedicated_HPLC_Resin_Option1_Costs_USD", "value": 19350},
    {"label": "Standard_Release_Analytics_GMP_Costs_USD", "value": 33500},
    {"label": "GMP_Stability_Study_Costs_USD", "value": 95825},
    {"label": "HPLC_Method_Validation_Costs_USD", "value": 28750},
    {"label": "Solution_and_Mobile_Phase_Stability_Costs_USD", "value": 7600},
    {"label": "Forced_Degradation_Study_Costs_USD", "value": 24700},
    {"label": "Extinction_Coefficient_Determination_Costs_USD", "value": 7400},
    {"label": "MSMS_Sequencing_Feasibility_Costs_USD", "value": 30810},
    {"label": "CMC_Support_for_IND_IMPD_Costs_USD", "value": 38200},
    {"label": "Batch_Record_Setup_Costs_USD", "value": 20800},
    {"label": "Executed_Batch_Record_Copies_Costs_USD", "value": 5200},
    {"label": "Client_Batch_Record_Review_Costs_USD", "value": 13650},
    {"label": "Aliquotation_Costs_USD", "value": 235},
    {
      "label": "Total_Budget_USD",
      "formula": "GMP_Budget[Familiarization_Run_Costs_USD]+GMP_Budget[GMP_Batch_Option1_Costs_USD]+GMP_Budget[Dedicated_HPLC_Resin_Option1_Costs_USD]+GMP_Budget[Standard_Release_Analytics_GMP_Costs_USD]+GMP_Budget[GMP_Stability_Study_Costs_USD]+GMP_Budget[HPLC_Method_Validation_Costs_USD]+GMP_Budget[Solution_and_Mobile_Phase_Stability_Costs_USD]+GMP_Budget[Forced_Degradation_Study_Costs_USD]+GMP_Budget[Extinction_Coefficient_Determination_Costs_USD]+GMP_Budget[MSMS_Sequencing_Feasibility_Costs_USD]+GMP_Budget[CMC_Support_for_IND_IMPD_Costs_USD]+GMP_Budget[Batch_Record_Setup_Costs_USD]+GMP_Budget[Executed_Batch_Record_Copies_Costs_USD]+GMP_Budget[Client_Batch_Record_Review_Costs_USD]+GMP_Budget[Aliquotation_Costs_USD]"
    }
  ],
  "special_ops_rows": [
    {"label": "Mass_Spec_Characterization_Costs_USD", "value": 50000},
    {"label": "MSMS_Sequencing_Costs_USD", "value": 30000},
    {"label": "Electrophoresis_Characterization_Costs_USD", "value": 40000}
  ]
}

STRICT RULES:
-------------
1) Do NOT output 'CRO_Manufacturing_Costs_USD' anywhere.
   • The budget is fully decomposed into line items.

2) budget_rows:
   • MUST contain only decomposed GMP costs:
     - Familiarization_Run_Costs_USD
     - GMP_Batch_Option1_Costs_USD / GMP_Batch_Option2_Costs_USD
     - Dedicated_HPLC_Resin_Option1_Costs_USD / Dedicated_HPLC_Resin_Option2_Costs_USD
     - Standard_Release_Analytics_GMP_Costs_USD / Limited_Release_Analytics_GMP_Costs_USD
     - GMP_Stability_Study_Costs_USD / Limited_GMP_Stability_Study_Costs_USD
     - HPLC_Method_Validation_Costs_USD
     - Solution_and_Mobile_Phase_Stability_Costs_USD
     - Forced_Degradation_Study_Costs_USD
     - Extinction_Coefficient_Determination_Costs_USD
     - MSMS_Sequencing_Feasibility_Costs_USD
     - MSMS_Sequencing_and_SOP_Costs_USD
     - CMC_Support_for_IND_IMPD_Costs_USD
     - Batch_Record_Setup_Costs_USD
     - Executed_Batch_Record_Copies_Costs_USD
     - Client_Batch_Record_Review_Costs_USD
     - Aliquotation_Costs_USD
     - Impurity_Marker_Synthesis_Costs_USD
     - HPLC_Method_Development_Costs_USD
     - HPLC_Non_GMP_Method_Qualification_Costs_USD
     - Method_Specific_SOP_Costs_USD
   • Values are numeric 'value' or 'formula'.
   • Total_Budget_USD MUST exist and MUST be a formula summing ALL other GMP_Budget rows.

3) special_ops_rows:
   • Represents modality-specific and "special" analytical or process operations.
   • MUST be driven by modality inferred from the user prompt:
     - If the prompt describes ASOs / short oligonucleotides:
         * include mass-spec-based operations, such as:
             - Mass_Spec_Characterization_Costs_USD
             - LC_MS_Characterization_Costs_USD
             - HRMS_Confirmation_Costs_USD
             - MSMS_Sequencing_Costs_USD
     - If the prompt describes mRNA, long RNA, or long nucleotides:
         * include electrophoresis or similar size/structure analytics, such as:
             - Electrophoresis_Characterization_Costs_USD
             - Capillary_Electrophoresis_Costs_USD
             - Gel_Electrophoresis_Costs_USD
             - AUC_Characterization_Costs_USD
             - SEC_MALS_Characterization_Costs_USD
     - If both modalities are present (e.g., ASO + mRNA), include a mix of relevant techniques.
   • Each row has:
       { "label": "<Technique>_Costs_USD", "value": <numeric> }
     (formula is optional; value is preferred).
   • Keep 2–8 rows here, focusing on the most important special operations.
   • You MAY add a "Total_Special_Ops_Costs_USD" row if it helps, but it is not required
     (the caller may compute a total later).

4) Formulas:
   • You may use formulas in budget_rows; special_ops_rows should usually use numeric values.
   • If you use formulas, restrict references to GMP_Budget[...] and/or GMP_Assumptions[...].
   • Use only + - * / ^ and parentheses. No functions, no ranges.

5) No commentary fields:
   • No "notes" per row. Only 'label', 'value', and/or 'formula'.
"""


# ---------- OpenAI chat wrapper ----------

def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = MAX_TOKENS,
) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


# ---------- helpers for rows → formulas ----------

def _ensure_formulas(rows: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """
    Ensure EVERY row has a 'formula' field.
    Numeric constants become constant formulas.
    """
    out: List[Dict[str, str]] = []
    for r in rows:
        label = _normalize_label(str(r.get("label", "")))
        if not label:
            continue
        val = r.get("value")
        formula = (r.get("formula") or "").strip()

        if formula:
            f = formula.strip()
        else:
            if isinstance(val, (int, float)):
                f = str(val)
            elif isinstance(val, str):
                s = val.strip()
                if not s:
                    f = "0"
                else:
                    try:
                        fnum = float(s)
                        f = str(int(fnum) if fnum.is_integer() else fnum)
                    except Exception:
                        f = s
            else:
                f = "0"

        out.append({"label": label, "formula": f})
    return out


def _ensure_total_budget_row(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Ensure Total_Budget_USD exists and sums ALL other GMP_Budget rows.
    """
    labels = [r["label"] for r in rows]
    total_label = "Total_Budget_USD"

    other_labels = [lab for lab in labels if lab != total_label]
    formula = "+".join(f"GMP_Budget[{lab}]" for lab in other_labels) if other_labels else "0"

    out: List[Dict[str, str]] = []
    found = False
    for r in rows:
        if r["label"] == total_label:
            out.append({"label": total_label, "formula": formula})
            found = True
        else:
            out.append(r)
    if not found:
        out.append({"label": total_label, "formula": formula})
    return out


def _wire_table(table_name: str, rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Convert rows of {"label":..., "formula":...} into:
      tables:   { key -> label }
      formulas: { key -> formula }
    for the specified table_name.
    """
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}
    y = 1
    for r in rows:
        lab = _normalize_label(r["label"])
        f = re.sub(r"\s+", "", r["formula"])
        tables[_key(table_name, 0, y)] = lab
        formulas[_key(table_name, 1, y)] = f
        y += 1
    return tables, formulas


# ---------- Budget + Special_Ops generation ----------

def generate_budget_and_special_ops(
    *,
    user_prompt: str,
    gmp_rows: List[Tuple[str, Any]],
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Tuple[
    Dict[str, str], Dict[str, str],     # GMP_Budget tables, GMP_Budget formulas
    Dict[str, str], Dict[str, str],     # GMP_Special_Ops tables, GMP_Special_Ops formulas
    Dict[str, Dict[str, str]],          # units
    Dict[str, str],                     # annotations
]:
    system = (
        "You are a GMP budgeting engine. Produce ONLY fully decomposed GMP line-item budgets and "
        "a second modality-specific operations table (special_ops_rows). "
        "Infer modality (ASO, short oligo, mRNA, long RNA, etc.) from the prompt and choose "
        "appropriate special analytical/processing techniques (mass spec vs electrophoresis, etc.). "
        "Do NOT output CRO_Manufacturing_Costs_USD. Follow the schema exactly."
    )

    # Optionally include a short preview of GMP assumptions (but we do not enforce them here)
    gmp_preview = "\n".join(f"- {lab} = {val}" for lab, val in gmp_rows[:40])

    user = (
        SCHEMA
        + "\n\nUSER PROMPT (project description):\n"
        + user_prompt.strip()
        + "\n\nGMP ASSUMPTIONS PREVIEW (for context only):\n"
        + gmp_preview
    )

    works.msg("📊 requesting GMP_Budget + modality-specific GMP_Special_Ops rows from GPT…")
    content = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        max_tokens=MAX_TOKENS,
    )

    data = json.loads(content)

    budget_rows_raw = data.get("budget_rows") or []
    special_rows_raw = data.get("special_ops_rows") or []

    if not isinstance(budget_rows_raw, list) or not budget_rows_raw:
        raise RuntimeError("GPT did not return any budget_rows.")
    if not isinstance(special_rows_raw, list):
        special_rows_raw = []

    # Normalize to formulas
    budget_rows = _ensure_formulas(budget_rows_raw)
    budget_rows = _ensure_total_budget_row(budget_rows)

    special_rows = _ensure_formulas(special_rows_raw)

    # Wire tables
    budget_tables, budget_formulas = _wire_table("GMP_Budget", budget_rows)
    special_tables, special_formulas = _wire_table("GMP_Special_Ops", special_rows)

    # Units
    units: Dict[str, Dict[str, str]] = {"GMP_Budget": {}, "GMP_Special_Ops": {}}
    for r in budget_rows:
        units["GMP_Budget"][r["label"]] = _infer_units(r["label"])
    for r in special_rows:
        units["GMP_Special_Ops"][r["label"]] = _infer_units(r["label"])

    annotations = {
        "GMP_Budget": "Fully decomposed GMP budget (Pattern B, no CRO_Manufacturing_Costs_USD).",
        "GMP_Special_Ops": "Modality-specific and additional operations (e.g., mass spec vs electrophoresis) inferred from user_prompt.",
    }

    return budget_tables, budget_formulas, special_tables, special_formulas, units, annotations


# ---------- Orchestrator ----------

def run_budget_builder(
    user_prompt: str,
    gmp_assumptions_json: dict,
    *,
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Dict[str, Any]:
    """
    Top-level orchestrator used by Ion:
      - Parse GMP_Assumptions
      - Generate GMP_Budget + GMP_Special_Ops via GPT
      - Return artifact with tables, formulas, units, annotations
    """
    gmp_rows = _parse_gmp_assumptions(gmp_assumptions_json)

    (
        budget_tables,
        budget_formulas,
        special_tables,
        special_formulas,
        units,
        annotations,
    ) = generate_budget_and_special_ops(
        user_prompt=user_prompt,
        gmp_rows=gmp_rows,
        model=model,
        temperature=temperature,
    )

    # Merge all tables and formulas into single artifact
    tables: Dict[str, str] = {}
    tables.update(budget_tables)
    tables.update(special_tables)

    formulas: Dict[str, str] = {}
    formulas.update(budget_formulas)
    formulas.update(special_formulas)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": formulas,
        "units": units,
        "annotations": annotations,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------- Ion entry/exit ----------

def _main(default_model: str = DEFAULT_MODEL) -> int:
    try:
        user_prompt = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(1) required (user prompt)."})
        return 1

    try:
        gmp_assumptions_json = works.param(2)
    except Exception:
        works.resolve(
            {"status": "❌ error", "error": "Ion: param(2) must be the GMP_Assumptions JSON (inline or path)."}
        )
        return 1

    try:
        model = works.param(3) or default_model
    except Exception:
        model = default_model

    try:
        temperature = float(works.param(4) or DEFAULT_TEMPERATURE)
    except Exception:
        temperature = DEFAULT_TEMPERATURE

    try:
        artifact = run_budget_builder(
            user_prompt=str(user_prompt),
            gmp_assumptions_json=gmp_assumptions_json,
            model=str(model),
            temperature=temperature,
        )
        works.resolve(_safe_json(artifact))
        return 0
    except Exception as err:
        works.resolve(
            {
                "status": "❌ error",
                "error": str(err),
                "where": "gmp-budget-builder",
            }
        )
        return 1


if __name__ == "__main__":
    works.msg(
        "🔧 loading GMP Budget Builder – Pattern B with modality-specific GMP_Special_Ops table…"
    )
    _main(DEFAULT_MODEL)
