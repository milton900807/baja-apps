#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
CMC Budget builder (Ion Works entry/exit) – Pattern B (fully decomposed CMC budget
for gene therapy with CRO/CDMO) + modality-specific CMC_Special_Ops table.

What this does
--------------
• STILL fully decomposed CMC Budget (no CRO_Manufacturing_Costs_USD roll-up).
• Adds a SECOND table: CMC_Special_Ops
    - Gene-therapy / modality-specific and additional CMC operations inferred from user_prompt.
    - Examples for AAV / LV / gene therapy:
        * Vector-specific analytics:
            - Capsid_Titer_Analytics_Costs_USD
            - Empty_Full_Ratio_Analytics_Costs_USD
            - Vector_Genome_Titer_Analytics_Costs_USD
            - Residual_Host_Cell_DNA_Analytics_Costs_USD
            - Residual_Protein_Analytics_Costs_USD
        * Advanced characterization / comparability:
            - Biodistribution_Study_Costs_USD
            - Shedding_Study_Costs_USD
            - NAb_Panel_Assay_Costs_USD
            - Vector_Structure_Characterization_Costs_USD
        * If the prompt describes mRNA / long RNA / ASO as part of the program,
          include appropriate techniques (electrophoresis, LC-MS, etc.).
    - Quantified per modality (cost per program, per batch, or per run as implied).
• Both tables are returned in Ion wire format:
    - tables["CMC_Budget[...][...]"], tables["CMC_Special_Ops[...][...]"]
    - formulas in corresponding entries.

Ion params:
-----------
param(1): user prompt (str) – describes gene therapy / vector CMC work with a CRO/CDMO.
param(2): CMC_Assumptions JSON (dict: grid/wells) – usually from the CMC assumptions builder.
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
_BUDGET_REF_RE = re.compile(r'CMC_Budget\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]')


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


# ---------- number + CMC assumptions handling ----------

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


def _parse_cmc_assumptions(cmc_json: dict) -> List[Tuple[str, Any]]:
    """
    Parse the grid/wells structure for CMC_Assumptions:

    { "name":"CMC_Assumptions", "cols":2, "rows":N,
      "wells":[{"x":0,"y":1,"value":"Label1"}, {"x":1,"y":1,"value":123}, ...]
    }

    Returns: [(normalized_label, value), ...]
      - labels from x=0 (y>=1)
      - values from x=1 (y>=1)
    """
    wells = cmc_json.get("wells", [])
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
    """Heuristic units for CMC / cost rows."""
    L = label.lower()
    if any(
        k in L
        for k in [
            "cost", "fee", "budget", "cmc", "batch", "stability",
            "analytics", "validation", "development", "synthesis",
            "purification", "aliquot", "electrophoresis", "ms", "msms",
            "vector", "capsid", "biodistribution", "shedding"
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
    {"label": "Vector_DS_GMP_Batch_Costs_USD", "value": 225500},
    {"label": "Vector_DP_Fill_Finish_Batch_Costs_USD", "value": 120000},
    {"label": "Standard_Release_Analytics_CMC_Costs_USD", "value": 33500},
    {"label": "CMC_Stability_Study_Costs_USD", "value": 95825},
    {"label": "Potency_Method_Validation_Costs_USD", "value": 28750},
    {"label": "Impurity_Profile_Characterization_Costs_USD", "value": 24700},
    {"label": "Capsid_Analytics_Setup_Costs_USD", "value": 19350},
    {"label": "CMC_Support_for_IND_IMPD_Costs_USD", "value": 38200},
    {"label": "Batch_Record_Setup_Costs_USD", "value": 20800},
    {"label": "Executed_Batch_Record_Copies_Costs_USD", "value": 5200},
    {"label": "Client_Batch_Record_Review_Costs_USD", "value": 13650},
    {"label": "Aliquotation_Costs_USD", "value": 235},
    {
      "label": "Total_Budget_USD",
      "formula": "CMC_Budget[Familiarization_Run_Costs_USD]+CMC_Budget[Vector_DS_GMP_Batch_Costs_USD]+CMC_Budget[Vector_DP_Fill_Finish_Batch_Costs_USD]+CMC_Budget[Standard_Release_Analytics_CMC_Costs_USD]+CMC_Budget[CMC_Stability_Study_Costs_USD]+CMC_Budget[Potency_Method_Validation_Costs_USD]+CMC_Budget[Impurity_Profile_Characterization_Costs_USD]+CMC_Budget[Capsid_Analytics_Setup_Costs_USD]+CMC_Budget[CMC_Support_for_IND_IMPD_Costs_USD]+CMC_Budget[Batch_Record_Setup_Costs_USD]+CMC_Budget[Executed_Batch_Record_Copies_Costs_USD]+CMC_Budget[Client_Batch_Record_Review_Costs_USD]+CMC_Budget[Aliquotation_Costs_USD]"
    }
  ],
  "special_ops_rows": [
    {"label": "Capsid_Titer_Analytics_Costs_USD", "value": 50000},
    {"label": "Empty_Full_Ratio_Analytics_Costs_USD", "value": 30000},
    {"label": "Vector_Genome_Titer_Analytics_Costs_USD", "value": 40000}
  ]
}

STRICT RULES:
-------------
1) Do NOT output 'CRO_Manufacturing_Costs_USD' anywhere.
   • The budget is fully decomposed into line items (CMC and analytics detail),
     not a single aggregated CRO manufacturing cost line.

2) budget_rows:
   • MUST contain only decomposed CMC costs for a gene therapy program with a CRO/CDMO, e.g.:
     - Familiarization_Run_Costs_USD
     - Vector_DS_GMP_Batch_Costs_USD
     - Vector_DP_Fill_Finish_Batch_Costs_USD
     - Plasmid_Supply_Costs_USD
     - Upstream_Process_Development_Costs_USD
     - Downstream_Process_Development_Costs_USD
     - Standard_Release_Analytics_CMC_Costs_USD
     - Limited_Release_Analytics_CMC_Costs_USD
     - CMC_Stability_Study_Costs_USD
     - Limited_CMC_Stability_Study_Costs_USD
     - Potency_Method_Development_Costs_USD
     - Potency_Method_Validation_Costs_USD
     - Capsid_Analytics_Setup_Costs_USD
     - Empty_Full_Ratio_Method_Development_Costs_USD
     - Impurity_Profile_Characterization_Costs_USD
     - Vector_Identity_Confirmation_Costs_USD
     - CMC_Support_for_IND_IMPD_Costs_USD
     - Batch_Record_Setup_Costs_USD
     - Executed_Batch_Record_Copies_Costs_USD
     - Client_Batch_Record_Review_Costs_USD
     - Aliquotation_Costs_USD
     - Technology_Transfer_Costs_USD
   • Values are numeric 'value' or 'formula'.
   • Total_Budget_USD MUST exist and MUST be a formula summing ALL other CMC_Budget rows.

3) special_ops_rows (CMC_Special_Ops):
   • Represents modality-specific and "special" CMC operations for gene therapy,
     typically contracted to a CRO/CDMO, e.g.:
       - Capsid_Titer_Analytics_Costs_USD
       - Empty_Full_Ratio_Analytics_Costs_USD
       - Vector_Genome_Titer_Analytics_Costs_USD
       - Biodistribution_Study_Costs_USD
       - Shedding_Study_Costs_USD
       - NAb_Panel_Assay_Costs_USD
       - Advanced_Structural_Characterization_Costs_USD
   • You MUST infer which special ops are most relevant from the user prompt:
       - If the prompt emphasizes AAV vectors / capsid engineering:
           focus on capsid titer, empty/full, vector genome titer, capsid structure.
       - If it emphasizes safety/toxicology or late-stage registration:
           add biodistribution, shedding, NAb panel, or confirmatory potency work.
       - If the prompt also clearly includes mRNA / long RNA / ASO, you MAY include
         appropriate special ops such as:
           * LC_MS_Characterization_Costs_USD
           * HRMS_Confirmation_Costs_USD
           * Electrophoresis_Characterization_Costs_USD
   • Each row has:
       { "label": "<Operation>_Costs_USD", "value": <numeric> }
     (formula is optional; value is preferred).
   • Keep 2–8 rows here, focusing on the most important special operations in the CRO scope.
   • You MAY add a "Total_Special_Ops_Costs_USD" row if it helps, but it is not required
     (the caller may compute a total later).

4) Formulas:
   • You may use formulas in budget_rows; special_ops_rows should usually use numeric values.
   • If you use formulas, restrict references to CMC_Budget[...] and/or CMC_Assumptions[...].
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
    Ensure Total_Budget_USD exists and sums ALL other CMC_Budget rows.
    """
    labels = [r["label"] for r in rows]
    total_label = "Total_Budget_USD"

    other_labels = [lab for lab in labels if lab != total_label]
    formula = "+".join(f"CMC_Budget[{lab}]" for lab in other_labels) if other_labels else "0"

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
    cmc_rows: List[Tuple[str, Any]],
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Tuple[
    Dict[str, str], Dict[str, str],     # CMC_Budget tables, CMC_Budget formulas
    Dict[str, str], Dict[str, str],     # CMC_Special_Ops tables, CMC_Special_Ops formulas
    Dict[str, Dict[str, str]],          # units
    Dict[str, str],                     # annotations
]:
    system = (
        "You are a CMC budgeting engine for GENE THERAPY programs working with "
        "contract research and manufacturing organizations (CRO/CDMO). "
        "Produce ONLY fully decomposed CMC line-item budgets and a second "
        "modality-specific operations table (special_ops_rows). "
        "Infer gene therapy modality (AAV, LV, etc.) and stage (e.g., IND/IMPD, "
        "commercial) from the prompt, and choose appropriate CMC and analytical techniques. "
        "Do NOT output CRO_Manufacturing_Costs_USD. Follow the schema exactly."
    )

    # Preview of CMC assumptions (context only; not enforced by schema)
    cmc_preview = "\n".join(f"- {lab} = {val}" for lab, val in cmc_rows[:40])

    user = (
        SCHEMA
        + "\n\nUSER PROMPT (gene therapy CMC + CRO/CDMO project description):\n"
        + user_prompt.strip()
        + "\n\nCMC ASSUMPTIONS PREVIEW (for context only):\n"
        + cmc_preview
    )

    works.msg("📊 requesting CMC_Budget + gene-therapy CMC_Special_Ops rows from GPT…")
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
    budget_tables, budget_formulas = _wire_table("CMC_Budget", budget_rows)
    special_tables, special_formulas = _wire_table("CMC_Special_Ops", special_rows)

    # Units
    units: Dict[str, Dict[str, str]] = {"CMC_Budget": {}, "CMC_Special_Ops": {}}
    for r in budget_rows:
        units["CMC_Budget"][r["label"]] = _infer_units(r["label"])
    for r in special_rows:
        units["CMC_Special_Ops"][r["label"]] = _infer_units(r["label"])

    annotations = {
        "CMC_Budget": (
            "Fully decomposed CMC budget (Pattern B, no CRO_Manufacturing_Costs_USD) "
            "for gene therapy program with a CRO/CDMO."
        ),
        "CMC_Special_Ops": (
            "Gene-therapy and modality-specific CMC operations (e.g., capsid analytics, "
            "biodistribution, shedding, NAb panel) inferred from user_prompt."
        ),
    }

    return budget_tables, budget_formulas, special_tables, special_formulas, units, annotations


# ---------- Orchestrator ----------

def run_budget_builder(
    user_prompt: str,
    cmc_assumptions_json: dict,
    *,
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Dict[str, Any]:
    """
    Top-level orchestrator used by Ion:
      - Parse CMC_Assumptions
      - Generate CMC_Budget + CMC_Special_Ops via GPT
      - Return artifact with tables, formulas, units, annotations
    """
    cmc_rows = _parse_cmc_assumptions(cmc_assumptions_json)

    (
        budget_tables,
        budget_formulas,
        special_tables,
        special_formulas,
        units,
        annotations,
    ) = generate_budget_and_special_ops(
        user_prompt=user_prompt,
        cmc_rows=cmc_rows,
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
        cmc_assumptions_json = works.param(2)
    except Exception:
        works.resolve(
            {"status": "❌ error", "error": "Ion: param(2) must be the CMC_Assumptions JSON (inline or path)."}
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
            cmc_assumptions_json=cmc_assumptions_json,
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
                "where": "cmc-budget-builder",
            }
        )
        return 1


if __name__ == "__main__":
    works.msg(
        "🔧 loading CMC Budget Builder – Pattern B with gene-therapy-specific CMC_Special_Ops table (CRO/CDMO)…"
    )
    _main(DEFAULT_MODEL)
