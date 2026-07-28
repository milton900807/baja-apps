#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
GMP OPERATING ASSUMPTIONS-ONLY BUILDER (Ion Works entry/exit), generalized & prompt-driven.

What it does
------------
• Builds a domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT
  (no hardcoded library of products).
• Assumes the user is planning GMP (or late-stage clinical / commercial) manufacturing and
  biases assumptions accordingly (internal site or CDMO).
• Calls GPT to infer sensible default OPERATING + FINANCIAL + TIMELINE assumptions using:
      - a universal GMP operating scaffold
      - a GMP / CDMO Statement-of-Work / Manufacturing Agreement structural pattern
• Returns ONLY a single two-column 'GMP_Assumptions' table:
      GMP_Assumptions[0:0][0:0] = "Label"
      GMP_Assumptions[1:1][0:0] = "Value"
      GMP_Assumptions[0:0][r:r] = <label>
      GMP_Assumptions[1:1][r:r] = <value>
• No formulas, just tables (+ minimal annotations/units for completeness).
• Uses Ion Works for entry (msg) and exit (resolve).

Ion params
----------
param(1) = user prompt (required)
param(2) = model (optional; default "gpt-4o-mini")
param(3) = temperature (optional; default 0.2)
param(4) = use_case hint (optional; free-text hint, e.g.,
           "phase 3 DP fill-finish with CDMO",
           "DS + DP commercial launch in EU/US",
           "clinical supply only, vials", etc.)
"""

import os
import json
import re
from typing import Dict, List, Tuple, Optional, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---------- helpers ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')


def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"


def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


def _sanitize_label(label: str) -> str:
    s = re.sub(r"\s+", "_", label.strip())
    s = re.sub(r"[^A-Za-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s or not re.match(r"^[A-Za-z_]", s):
        s = f"A_{s}" if s else "A_Label"
    return s[:64]


def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
    json_mode: bool = False,
    max_tokens: int = 3000
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


def _extract_json_snippet(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return text[start:end+1].strip()


def _normalize_value_for_label(label: str, value: Any) -> str:
    """
    Ensure that if a label exists, it always has a defined non-empty value.
    Priority:
      1) Use the provided value if it's non-empty.
      2) Otherwise use DEFAULTS[label] if defined.
      3) Otherwise fall back to "0".
    """
    if value is None:
        default = DEFAULTS.get(label)
        return str(default) if default is not None else "0"

    if isinstance(value, str):
        if not value.strip():
            default = DEFAULTS.get(label)
            return str(default) if default is not None else "0"
        return value

    return str(value)


# ---------- formula scrubbers (placeholder, in case you later add formulas) ----------

def _scrub_formula(formula: str) -> str:
    """
    Scrub insignificant operations from a single formula string, if formulas are ever added.
    Currently:
      - Remove a leading '0+' immediately after '=': '=0+...' -> '=...'
      - Replace any '1^0' with '1'
    """
    if not isinstance(formula, str):
        return formula
    s = formula.strip()
    if not s:
        return s

    if s.startswith("="):
        s = re.sub(r"^=0\+", "=", s)

    s = s.replace("1^0", "1")

    return s


def _scrub_all_formulas(formulas: Dict[str, str]) -> Dict[str, str]:
    if not isinstance(formulas, dict):
        return formulas
    return {k: _scrub_formula(v) for k, v in formulas.items()}



# ---------- Gene therapy–specific scaffold ----------
# These are gene therapy–specific operating inputs layered on top of the universal scaffold.
GENE_THERAPY_SCAFFOLD = [
    "Modality",                        # e.g., "AAV", "Lentiviral", "Non_viral"
    "Vector_Type",                     # AAV, LV, etc.
    "Serotype_or_Capsid",              # e.g., "AAV9", "AAV2", "Proprietary_Capsid_X"
    "Transgene_Name",                  # short identifier
    "Indication",                      # clinical indication

    "Dosing_Unit",                     # e.g., "vg_kg", "vg_eye", "vg_patient"
    "Dose_Per_Patient_vg_kg",          # or equivalent; keep name stable even if non-kg dosing
    "Units_per_Patient",               # filled vials/syringes per patient

    "Patients_Per_Year_Launch",
    "Patients_Per_Year_Peak",

    "Vector_Yield_vg_per_Batch",
    "Vector_Concentration_vg_per_mL",
    "Fill_Volume_per_Unit_mL",

    "DS_Site",                         # DS = vector DS site
    "DP_Site",                         # DP = fill-finish site
    "Is_CDMO",                         # 0–1 flag
]



# ---------- Universal GMP operating scaffold ----------
# Intentionally OPERATING + FINANCIAL: capacity, utilization, unit costs, overhead.
UNIVERSAL_SCAFFOLD = [
    "Currency",
    "Period_Unit",                        # e.g., "month"
    "Duration_Periods",                   # e.g., 18 months for pre-launch, or similar
    "Manufacturing_FTEs",
    "QA_QC_FTEs",
    "Engineering_FTEs",
    "Hours_per_FTE_per_Week",
    "Average_Hourly_Rate_USD",           # NEW: average hourly rate per FTE
    "Average_Utilization_Rate",          # 0–1
    "Annual_Batches",
    "Annual_Volume_Units",
    "Variable_Cost_per_Batch_USD",
    "Fixed_Mfg_Overhead_per_Period_USD",
]

# ---------- Timelines & Milestones scaffold ----------
TIMELINE_MILESTONE_SCAFFOLD = [
    "Tech_Transfer_Start_Quarter",
    "PPQ_Start_Quarter",
    "PPQ_Batches",
    "PPQ_Duration_Weeks",
    "Validation_Report_Lead_Time_Weeks",
    "First_Commercial_Batch_Quarter",
    "Regulatory_Submission_Quarter",
    "Approval_Quarter",
    "QA_Release_Time_Weeks_per_Batch",
    "Shelf_Life_Months",
    "Safety_Stock_Months",
]

DEFAULTS: Dict[str, str] = {
    "Currency": "USD",
    "Period_Unit": "month",
    "Duration_Periods": "18",
    "Manufacturing_FTEs": "8",
    "QA_QC_FTEs": "4",
    "Engineering_FTEs": "2",
    "Hours_per_FTE_per_Week": "40",
    "Average_Hourly_Rate_USD": "125",   # example blended rate
    "Average_Utilization_Rate": "0.7",
    "Annual_Batches": "24",
    "Annual_Volume_Units": "100000",
    "Variable_Cost_per_Batch_USD": "50000",
    "Fixed_Mfg_Overhead_per_Period_USD": "200000",

    # Timelines & milestones defaults (can be overridden by the LLM or user)
    "Tech_Transfer_Start_Quarter": "2026Q1",
    "PPQ_Start_Quarter": "2026Q3",
    "PPQ_Batches": "3",
    "PPQ_Duration_Weeks": "12",
    "Validation_Report_Lead_Time_Weeks": "8",
    "First_Commercial_Batch_Quarter": "2027Q1",
    "Regulatory_Submission_Quarter": "2026Q4",
    "Approval_Quarter": "2027Q3",
    "QA_Release_Time_Weeks_per_Batch": "4",
    "Shelf_Life_Months": "24",
    "Safety_Stock_Months": "3",
    
    
    
}

# ---------- GMP / CDMO structural scaffold ----------
GMP_MFG_PATTERN = """
You are modeling a GMP (or late-stage clinical) manufacturing program for a drug
substance (DS), drug product (DP), or both. Manufacturing may be at:
  - an internal GMP site, and/or
  - a CDMO/CMO via a technical / quality agreement and manufacturing SOW.

Use a GMP / Manufacturing Agreement structure as your mental template.
Typical sections include:

1) PRODUCT & FACILITY
   - Product_Name, Dosage_Form (e.g., vial, prefilled_syringe, tablet)
   - Strength (e.g., mg_per_mL, mg_per_tablet)
   - DS_Site, DP_Site, Is_CDMO (0–1)
   - Facility_Class (e.g., Grade C, ISO 7), Fill_Finish_Line_Type
   - Target_Market_Regions (e.g., US, EU, ROW)

2) PROCESS & SCALE
   - Process_Type (e.g., fed_batch, perfusion, small_molecule_synthesis)
   - Scale_per_Batch (e.g., L for DS, units_per_batch for DP)
   - Batches_per_Year_Planned, Max_Batches_per_Year
   - Yield_per_Batch_Units, Yield_Loss_Fraction (0–1)
   - Changeover_Time_Days, Cleaning_Method (CIP/SIP, manual, outsourced)

3) DEMAND & SUPPLY STRATEGY
   - Launch_Year, Peak_Year
   - Launch_Year_Demand_Units, Peak_Year_Demand_Units
   - Safety_Stock_Months, Minimum_Batch_Size_Units
   - Clinical_Supply_Required_Units (if applicable)
   - DS_DP_Supply_Strategy (e.g., "make_to_stock", "make_to_order", "hybrid")

4) TIMELINES & MILESTONES
   - Tech_Transfer_Start_Quarter, PPQ_Start_Quarter
   - PPQ_Batches, PPQ_Duration_Weeks
   - Validation_Report_Lead_Time_Weeks
   - First_Commercial_Batch_Quarter
   - Shelf_Life_Months, Retest_Period_Months (for DS)
   - QA_Release_Time_Weeks_per_Batch
   - Regulatory_Submission_Quarter, Approval_Quarter

5) FINANCIALS (BUDGET INPUTS)
   - Tech_Transfer_Fee_USD
   - PPQ_Batch_Cost_USD
   - Commercial_Batch_Cost_USD
   - Annual_Facility_Fee_USD
   - CDMO_Setup_Fee_USD
   - CDMO_Minimum_Annual_Spend_USD
   - QA_QC_Cost_per_Batch_USD
   - Stability_Study_Cost_per_Year_USD

6) PAYMENT TERMS & RISK
   - Payment_On_Contract_Signature_Pct
   - Payment_On_Tech_Transfer_Completion_Pct
   - Payment_On_PPQ_Completion_Pct
   - Payment_On_Commercial_Batch_Release_Pct
   - Cancellation_Fee_Rate (0–1)
   - Rush_Order_Premium_Rate (0–1)
   - Contingency_Buffer_Pct (0–1) for budget and schedule slippage
"""

# ---------- Phase 1: Build taxonomy from prompt ----------
TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for GMP OPERATING assumptions for a manufacturing
program (DS, DP, or both), potentially at a CDMO/CMO.

Return STRICT JSON with this EXACT schema:
{
  "use_case": "short_machine_friendly_key",
  "rationale": "one-sentence reason",
  "modules": [
    {
      "name": "short_module_name",
      "description": "what this module covers",
      "must_include": ["Label_1", "Label_2", "..."],
      "label_hints": "brief hints for units/shape, optional"
    }
  ],
  "global_must_include": ["Label_A", "Label_B", "..."]
}

Rules:
- Focus on OPERATIONS, FINANCIALS, and TIMELINES relevant to:
  * demand and supply strategy (units/year, launch/peak demand),
  * capacity and throughput (batches/year, scale per batch, yields),
  * headcount and overhead (Manufacturing_FTEs, QA_QC_FTEs, Engineering_FTEs),
  * labor cost structure (Average_Hourly_Rate_USD, utilization),
  * unit economics (variable cost per batch, QA/QC per batch, facility fees),
  * key milestones and timelines (tech transfer, PPQ, validation, first commercial batch).
- Example modules: Demand_and_Supply, DS_Manufacturing, DP_Fill_Finish,
  Quality_and_Release, Timelines_and_Milestones, Financials_and_Terms.
- 'must_include' labels must be unique within each module and machine-friendly
  (snake_case or Title_Case).
- Encourage labels that mirror a GMP / manufacturing agreement structure:
  product & facility, process & scale, timelines, financial terms, risk/contingency.
- Do NOT include formulas or commentary in labels; these are just label names.
"""


def build_taxonomy(
    user_prompt: str,
    *,
    model: str,
    temperature: float,
    use_case_hint: Optional[str]
) -> Dict[str, Any]:
    system = "You are a domain taxonomy builder for GMP OPERATING assumptions and capacity planning. You output valid JSON."
    hint = f"\nHint use_case: {use_case_hint}\n" if (use_case_hint or "").strip() else ""
    user = f"""{TAXONOMY_INSTRUCTIONS}

User scenario:
{user_prompt.strip()}

{hint}
"""
    works.msg("🧭 inferring GMP operating taxonomy from prompt…")
    txt = _chat_call(model=model, system=system, user=user, temperature=temperature, json_mode=True, max_tokens=2000)
    try:
        data = json.loads(txt)
    except Exception:
        data = json.loads(_extract_json_snippet(txt))
    data.setdefault("use_case", "gmp_operations")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data


# ---------- Phase 2: Generate assumptions using taxonomy + scaffold ----------
ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column 'GMP_Assumptions' table for an OPERATING, BUDGET,
and TIMELINE model for a GMP manufacturing program (DS, DP, or both).

CONTEXT (prompt-derived):
- use_case: {use_case}
- modules: {modules_json}
- global_must_include: {global_must_include}

UNIVERSAL_GMP_OPERATING_SCAFFOLD (always include; fill sensible defaults if user didn't specify):
{universal_scaffold}

GMP_MFG_PATTERN (structure of a typical GMP manufacturing / CDMO agreement):
{gmp_mfg_pattern}

Return STRICT JSON with this EXACT schema:
{{
  "assumptions": [
    {{"label": "Currency", "value": "USD"}},
    {{"label": "Period_Unit", "value": "month"}}
  ]
}}

Rules:
- 'assumptions' is a list of objects with 'label' (string) and 'value' (string or number).
- Include 12–20 rows TOTAL, derived from:
    * the user prompt,
    * the universal GMP operating scaffold, and
    * the GMP_MFG_PATTERN.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.

Prioritize three buckets of OPERATING inputs:

1) UNIVERSAL GMP OPERATIONS (always present)
   - Manufacturing_FTEs, QA_QC_FTEs, Engineering_FTEs
   - Hours_per_FTE_per_Week
   - Average_Hourly_Rate_USD
   - Average_Utilization_Rate (0–1)
   - Annual_Batches, Annual_Volume_Units
   - Variable_Cost_per_Batch_USD, Fixed_Mfg_Overhead_per_Period_USD

2) GMP TIMELINES & CAPACITY (for timeline modeling)
   - Tech_Transfer_Start_Quarter, PPQ_Start_Quarter, PPQ_Batches
   - PPQ_Duration_Weeks, Validation_Report_Lead_Time_Weeks
   - First_Commercial_Batch_Quarter
   - QA_Release_Time_Weeks_per_Batch
   - Shelf_Life_Months, Safety_Stock_Months

3) FINANCIALS & TERMS (for budget modeling)
   - Tech_Transfer_Fee_USD
   - PPQ_Batch_Cost_USD
   - Commercial_Batch_Cost_USD
   - Annual_Facility_Fee_USD
   - CDMO_Minimum_Annual_Spend_USD
   - QA_QC_Cost_per_Batch_USD
   - Payment_On_Contract_Signature_Pct
   - Payment_On_Tech_Transfer_Completion_Pct
   - Payment_On_PPQ_Completion_Pct
   - Contingency_Buffer_Pct
   - Cancellation_Fee_Rate, Rush_Order_Premium_Rate

Additional rules:
- ALL rates (utilization, cancellation, rush premium, contingency, payment percentages)
  must be 0–1 fractions (not 0–100). If the user implies “%" convert to fraction.
- No discount_rate, tax_rate, NPV, or other corporate finance metrics.
- No other tables, no formulas, no commentary. Valid JSON only.

User scenario (for reference):
{user_prompt}
"""


def generate_assumptions_from_taxonomy(
    *,
    user_prompt: str,
    taxonomy: Dict[str, Any],
    model: str,
    temperature: float
) -> List[Dict[str, str]]:
    system = "You are a careful GMP OPERATIONS modeling assistant. You STRICTLY follow output schemas."

    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        use_case=taxonomy.get("use_case", "gmp_operations"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_SCAFFOLD, ensure_ascii=False, indent=2),
        gmp_mfg_pattern=GMP_MFG_PATTERN.strip(),
        user_prompt=user_prompt.strip() if user_prompt else ""
    )

    works.msg("🔒 requesting JSON GMP operating assumptions from GPT…")
    content = _chat_call(
        model=model,
        system=system,
        user=instruction,
        temperature=temperature,
        json_mode=True,
        max_tokens=3500,
    )

    try:
        data = json.loads(content)
    except Exception:
        data = json.loads(_extract_json_snippet(content))

    items = (data.get("assumptions") or [])
    out: List[Dict[str, str]] = []
    seen = set()

    for it in items:
        raw_label = str(it.get("label", "")).strip()
        if not raw_label:
            continue
        label = _sanitize_label(raw_label)
        if label in seen:
            continue
        value = it.get("value", "")

        # Normalize percent-like strings to fractions if needed
        if isinstance(value, str) and value.strip().endswith("%"):
            try:
                pct = float(value.strip().rstrip("%"))
                value = pct / 100.0
            except Exception:
                pass

        out.append({"label": label, "value": str(value)})
        seen.add(label)

    # Backfill universal GMP operating scaffold + timelines if missing
    for req in (UNIVERSAL_SCAFFOLD + TIMELINE_MILESTONE_SCAFFOLD):
        lab = _sanitize_label(req)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, DEFAULTS.get(lab, "0"))
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # Ensure essential defaults exist
    for k, v in DEFAULTS.items():
        lab = _sanitize_label(k)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, v)
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # Hard cap on number of assumptions
    # (doc text says 12–20; we allow up to 20)
    MAX_ASSUMPTIONS = 20

    # Always prioritize universal ops + timeline/milestone labels
    preferred_order = [
        _sanitize_label(lab)
        for lab in (UNIVERSAL_SCAFFOLD + TIMELINE_MILESTONE_SCAFFOLD)
    ]

    by_label = {row["label"]: row["value"] for row in out}
    final_rows: List[Dict[str, str]] = []
    used = set()

    # 1) Add scaffold labels first (ops + milestones)
    for lab in preferred_order:
        if lab in by_label and len(final_rows) < MAX_ASSUMPTIONS:
            final_rows.append({"label": lab, "value": by_label[lab]})
            used.add(lab)

    # 2) Fill remaining slots with any other GMP / financial / timeline labels
    if len(final_rows) < MAX_ASSUMPTIONS:
        for row in out:
            lab = row["label"]
            if lab in used:
                continue
            final_rows.append(row)
            used.add(lab)
            if len(final_rows) >= MAX_ASSUMPTIONS:
                break

    return final_rows


# ---------- Build tables wire format ----------
def to_two_col_table(table_name: str, rows: List[Dict[str, str]]) -> Dict[str, str]:
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    r = 1
    for kv in rows:
        tables[_key(table_name, 0, r)] = kv["label"]
        tables[_key(table_name, 1, r)] = kv["value"]
        r += 1
    return tables


def infer_units(table_name: str, rows: List[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    units: Dict[str, Dict[str, str]] = {table_name: {}}
    for kv in rows:
        lab = kv["label"]
        lv = str(kv["value"]).lower()
        l = lab.lower()
        if "currency" in l:
            units[table_name][lab] = "unitless"
        elif "period_unit" in l:
            units[table_name][lab] = "unitless"
        elif "duration_periods" in l:
            units[table_name][lab] = "periods"
        elif l.endswith("_fte") or "fte" in l:
            units[table_name][lab] = "FTE"
        elif "hours_per_fte" in l:
            units[table_name][lab] = "hours/week"
        elif "average_hourly_rate" in l:
            units[table_name][lab] = "USD/hour"
        elif any(k in l for k in ["utilization", "uptime", "rate", "fraction", "buffer_pct"]):
            units[table_name][lab] = "fraction"
        elif "annual_batches" in l:
            units[table_name][lab] = "batches/year"
        elif "annual_volume_units" in l:
            units[table_name][lab] = "units/year"
        elif "cost_per_batch" in l:
            units[table_name][lab] = "USD/batch"
        elif l.endswith("_usd_per_period") or "overhead_per_period" in l:
            units[table_name][lab] = "USD/period"
        elif l.endswith("_usd"):
            units[table_name][lab] = "USD"
        elif any(ch.isdigit() for ch in lv) and "%" in lv:
            units[table_name][lab] = "fraction"
        elif l.endswith("_months"):
            units[table_name][lab] = "months"
        elif l.endswith("_weeks") or "_duration_weeks" in l:
            units[table_name][lab] = "weeks"
        else:
            units[table_name][lab] = "unitless"
    return units


# ---------- Orchestrator ----------
def run_gmp_assumptions_only(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    use_case_hint: Optional[str] = None
) -> Dict[str, Any]:
    works.msg("🧠 GMP operating assumptions pipeline starting…")
    taxonomy = build_taxonomy(
        user_prompt=user_prompt,
        model=model,
        temperature=temperature,
        use_case_hint=use_case_hint,
    )
    rows = generate_assumptions_from_taxonomy(
        user_prompt=user_prompt,
        taxonomy=taxonomy,
        model=model,
        temperature=temperature
    )

    if not rows:
        works.msg("⚠️ LLM returned no rows; emitting header-only GMP_Assumptions table.")
    tables = to_two_col_table("GMP_Assumptions", rows)

    raw_formulas: Dict[str, str] = {}
    formulas = _scrub_all_formulas(raw_formulas)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": formulas,
        "annotations": {
            "GMP_Assumptions": (
                "GMP operating, financial, and timeline defaults inferred from user prompt via GPT "
                f"(two-column table). use_case={taxonomy.get('use_case','gmp_operations')}"
            )
        },
        "units": infer_units("GMP_Assumptions", rows) if rows else {"GMP_Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_GMP_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "gmp_operations"),
            "modules": taxonomy.get("modules", []),
            "global_must_include": taxonomy.get("global_must_include", []),
            "rows": len(rows)
        }
    }
    return artifact


# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(1)  # required
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(1) required (user prompt)."})
        return 1

    model = works.param(2) or default_model
    try:
        temperature = float(works.param(3) or 0.2)
    except Exception:
        temperature = 0.2

    use_case_hint = works.param(4) or None  # free-text hint; optional

    try:
        artifact = run_gmp_assumptions_only(
            user_prompt=str(user_prompt),
            model=str(model),
            temperature=temperature,
            use_case_hint=str(use_case_hint) if use_case_hint is not None else None
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "gmp-assumptions-only",
        })
        return 1


# bootstrap
if __name__ == "__main__":
    works.msg("🔧 loading GMP operating assumptions-only builder (generalized, prompt-driven)…")
    _main_ion("gpt-4o-mini")
