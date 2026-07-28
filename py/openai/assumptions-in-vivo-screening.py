#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import math
import os
import json
import re
from typing import Dict, List, Tuple, Optional, Any

"""
Rodent toxicology OPERATING assumptions-only builder (Ion Works entry/exit),
generalized & prompt-driven, for CRO-led rodent tox studies.

What it does
------------
• Builds a domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT (no hardcoded library).
• Assumes the user is running rodent toxicology at / with a CRO and biases assumptions accordingly.
• Calls GPT to infer sensible default OPERATING assumptions using that taxonomy PLUS:
      - a universal operating scaffold (FTEs, capacity, utilization, unit costs)
      - a rodent toxicology–specific scaffold
      - a study design / procedure cost scaffold (per-animal and per-group costs)
      - a CRO rodent tox SOW (Statement of Work) structural pattern
• Applies deterministic logic for complex procedures:
      - If the prompt and/or route of administration implies neuro-targeted
        procedures such as ICV / intracerebroventricular, IT / intrathecal,
        or other CNS-targeted administration, the script:
            • Sets Complex_Procedure_Flag = 1
            • Sets Complex_Procedure_Cost_Multiplier = 2.0
            • Multiplies relevant procedure costs per animal by 2×
              (e.g., Dose_Admin_Cost_per_Animal_USD, Surgery_Cost_per_Animal_USD)
      - If not neuro-targeted, Complex_Procedure_Flag = 0, multiplier = 1.0
• Returns ONLY a single two-column 'Rodent_Tox_Assumptions' table:
      Rodent_Tox_Assumptions[0:0][0:0] = "Label"
      Rodent_Tox_Assumptions[1:1][0:0] = "Value"
      Rodent_Tox_Assumptions[0:0][r:r] = <label>
      Rodent_Tox_Assumptions[1:1][r:r] = <value>
• No formulas, just tables (+ minimal annotations/units for completeness).
• Uses Ion Works for entry (msg) and exit (resolve).

Ion params
----------
param(1) = user prompt (required)
param(2) = model (optional; default "gpt-4o-mini")
param(3) = temperature (optional; default 0.2)
param(4) = use_case hint (optional; free-text hint, e.g.,
           "28-day rat tox with IV dosing",
           "mouse PK/PD with ICV administration", etc.)
"""

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---- Table name constant ----
TABLE_NAME = "Rodent_Tox_Assumptions"

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


# ---------- formula scrubbers (placeholder) ----------

def _scrub_formula(formula: str) -> str:
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


# ---------- Universal operating scaffold ----------
UNIVERSAL_SCAFFOLD = [
    "Currency",
    "Period_Unit",                  # e.g., "month", "week"
    "Duration_Periods",             # e.g., 12 months, 52 weeks
    "FTE_Total",
    "FTE_Operations",
    "FTE_Scientific",               # or study director / pathologist / bioanalytical
    "Hours_per_FTE_per_Week",
    "Average_Utilization_Rate",     # 0–1
    "Capacity_Units_per_Period",    # animals or studies per period
    "Variable_Cost_per_Unit",       # generic per-animal or per-study cost
]

# ---------- Rodent toxicology–specific scaffold ----------
RODENT_TOX_SCAFFOLD = [
    "Species",                              # "rat", "mouse"
    "Strain",                               # "Sprague-Dawley", "C57BL/6"
    "Number_of_Animals_Total",
    "Number_of_Animals_per_Group",
    "Number_of_Dose_Groups",
    "Number_of_Sexes",                      # 1 or 2
    "Route_of_Administration",              # PO, IV, SC, IP, ICV, IT, etc.
    "Study_Type",                           # "acute", "7-day", "28-day", "90-day"
    "Study_Duration_Days",
    "GLP_Flag",                             # 0/1
    "Satellite_Groups_Flag",
    "TK_Sampling_Flag",
    "Necropsy_and_Histopathology_Flag",
    "Core_Procedure_Cost_per_Animal_USD",   # generic per-animal cost
    "Dose_Admin_Cost_per_Animal_USD",       # injection / gavage cost
    "Surgery_Cost_per_Animal_USD",          # for catheter / ICV cannula, etc.
    "Clinical_Pathology_Cost_per_Animal_USD",
    "Bioanalytical_Sample_Cost_per_Sample_USD",
]

# ---------- Study design & procedure cost scaffold ----------
STUDY_WORKFLOW_SCAFFOLD = [
    "Acclimation_Period_Days",
    "Dosing_Days",
    "Recovery_Period_Days",
    "Number_of_TK_Samples_per_Animal",
    "Number_of_Clinical_Pathology_Panels",
    "Number_of_Organ_Systems_for_Histopathology",
    "Pathology_Readout_Cost_per_Animal_USD",
    "TK_Analysis_Cost_per_Sample_USD",
    "Reporting_and_QA_Cost_per_Study_USD",
    "Study_Director_Time_Allocation_FTE",
    "QA_Reviewer_Time_Allocation_FTE",

    # cost/risk/commercial knobs
    "Payment_On_Signature_Pct",
    "Payment_On_Study_Start_Pct",
    "Payment_On_Dosing_Complete_Pct",
    "Payment_On_Final_Report_Pct",
    "Cancellation_Fee_Rate",
    "Postponement_Fee_Rate",
    "Contingency_Buffer_Pct",
]

DEFAULTS: Dict[str, str] = {
    # Universal ops
    "Currency": "USD",
    "Period_Unit": "month",
    "Duration_Periods": "12",
    "FTE_Total": "4",
    "FTE_Operations": "1",
    "FTE_Scientific": "3",
    "Hours_per_FTE_per_Week": "40",
    "Average_Utilization_Rate": "0.75",
    "Capacity_Units_per_Period": "200",
    "Variable_Cost_per_Unit": "500",

    # Rodent tox defaults
    "Species": "rat",
    "Strain": "Sprague_Dawley",
    "Number_of_Animals_Total": "80",
    "Number_of_Animals_per_Group": "10",
    "Number_of_Dose_Groups": "4",
    "Number_of_Sexes": "2",
    "Route_of_Administration": "IV",
    "Study_Type": "28_day_repeat_dose",
    "Study_Duration_Days": "28",
    "GLP_Flag": "1",
    "Satellite_Groups_Flag": "0",
    "TK_Sampling_Flag": "1",
    "Necropsy_and_Histopathology_Flag": "1",
    "Core_Procedure_Cost_per_Animal_USD": "800",
    "Dose_Admin_Cost_per_Animal_USD": "100",
    "Surgery_Cost_per_Animal_USD": "200",
    "Clinical_Pathology_Cost_per_Animal_USD": "150",
    "Bioanalytical_Sample_Cost_per_Sample_USD": "120",

    # Study workflow defaults
    "Acclimation_Period_Days": "7",
    "Dosing_Days": "28",
    "Recovery_Period_Days": "14",
    "Number_of_TK_Samples_per_Animal": "6",
    "Number_of_Clinical_Pathology_Panels": "3",
    "Number_of_Organ_Systems_for_Histopathology": "15",
    "Pathology_Readout_Cost_per_Animal_USD": "250",
    "TK_Analysis_Cost_per_Sample_USD": "150",
    "Reporting_and_QA_Cost_per_Study_USD": "20000",
    "Study_Director_Time_Allocation_FTE": "0.2",
    "QA_Reviewer_Time_Allocation_FTE": "0.1",

    "Payment_On_Signature_Pct": "0.2",
    "Payment_On_Study_Start_Pct": "0.3",
    "Payment_On_Dosing_Complete_Pct": "0.3",
    "Payment_On_Final_Report_Pct": "0.2",
    "Cancellation_Fee_Rate": "0.25",
    "Postponement_Fee_Rate": "0.15",
    "Contingency_Buffer_Pct": "0.1",
}

# ---------- CRO / rodent tox SOW structural scaffold ----------
CRO_SOW_PATTERN = """
You are modeling a rodent toxicology study outsourced to a CRO.
The CRO runs GLP or non-GLP studies in rats or mice with various routes
of administration (e.g., PO, IV, SC, IP, ICV, IT), possibly including
complex neuro-targeted procedures such as intracerebroventricular (ICV)
or intrathecal (IT) dosing.

Use a CRO toxicology Statement of Work (SOW) as your mental template.
Typical sections include:

1) COMMERCIAL / CONTRACT
   - CRO_Name, CRO_Facility
   - Program_Title, Study_Type, Species, Strain
   - Study_Scope_Description (e.g., "28-day GLP rat tox, IV dosing")
   - Core_Procedure_Cost_per_Animal_USD
   - Dose_Admin_Cost_per_Animal_USD
   - Surgery_Cost_per_Animal_USD
   - Clinical_Pathology_Cost_per_Animal_USD
   - Bioanalytical_Sample_Cost_per_Sample_USD
   - Pathology_Readout_Cost_per_Animal_USD
   - TK_Analysis_Cost_per_Sample_USD
   - Reporting_and_QA_Cost_per_Study_USD
   - Payment_On_Signature_Pct,
     Payment_On_Study_Start_Pct,
     Payment_On_Dosing_Complete_Pct,
     Payment_On_Final_Report_Pct
   - Cancellation_Fee_Rate, Postponement_Fee_Rate, Contingency_Buffer_Pct

2) STUDY DESIGN
   - Species, Strain
   - Number_of_Dose_Groups, Number_of_Animals_per_Group, Number_of_Sexes
   - Route_of_Administration
   - Study_Duration_Days, Acclimation_Period_Days, Recovery_Period_Days
   - Satellite_Groups_Flag, TK_Sampling_Flag
   - Number_of_TK_Samples_per_Animal
   - Number_of_Clinical_Pathology_Panels

3) PROCEDURES & COMPLEXITY
   - Core procedures (handling, dosing, clinical observations)
   - Complex procedures (e.g., catheter placement, ICV cannula, IT injection)
   - Surgery_Cost_per_Animal_USD
   - Complex_Procedure_Flag (0/1)
   - Complex_Procedure_Cost_Multiplier (≥1)

4) CLINICAL PATHOLOGY / TK / BIOANALYTICS
   - Blood draws, timing, analytes
   - Clinical_Pathology_Cost_per_Animal_USD
   - Bioanalytical_Sample_Cost_per_Sample_USD
   - TK_Analysis_Cost_per_Sample_USD

5) NECROPSY & HISTOPATHOLOGY
   - Necropsy_and_Histopathology_Flag
   - Number_of_Organ_Systems_for_Histopathology
   - Pathology_Readout_Cost_per_Animal_USD

6) OPERATIONS / TIMELINES
   - Project_Start_Quarter (optional)
   - Study_Duration_Days (dosing + recovery)
   - Expected_Study_Setup_Duration_Weeks
   - Expected_Reporting_Duration_Weeks
   - Data_Delivery_Weeks_from_Study_Start
   - Final_Report_Weeks_from_Study_Start

7) RISK / CHANGE ORDERS
   - Assumed_Protocol_Amendment_Rate
   - Expected_Repeat_Procedures_Rate
   - Contingency_Buffer_Pct

Key rate- and cost-limiting steps:
   - Complex surgery / neuro-targeted procedures (ICV, IT)
   - Histopathology and pathology readout
   - TK / bioanalytical analysis and reporting
"""

# ---------- Taxonomy builder ----------

TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for OPERATING assumptions for a rodent
toxicology study (rat or mouse) that is at least partly outsourced to a
Contract Research Organization (CRO).

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
- Focus on OPERATIONS and STUDY DESIGN for CRO rodent tox:
  * Species, Strain, Number_of_Animals_per_Group, Number_of_Dose_Groups, Study_Type.
  * Route_of_Administration (e.g., IV, PO, SC, IP, ICV, IT).
  * Per-animal procedure costs (Core_Procedure_Cost_per_Animal_USD,
    Dose_Admin_Cost_per_Animal_USD, Surgery_Cost_per_Animal_USD).
  * Clinical pathology and bioanalytics:
    Clinical_Pathology_Cost_per_Animal_USD,
    Bioanalytical_Sample_Cost_per_Sample_USD,
    TK_Analysis_Cost_per_Sample_USD.
  * Histopathology and necropsy:
    Necropsy_and_Histopathology_Flag,
    Number_of_Organ_Systems_for_Histopathology,
    Pathology_Readout_Cost_per_Animal_USD.
  * Sponsor FTEs (FTE_Scientific, FTE_Operations) and high-level throughput.
  * CRO commercial terms (payment milestones, cancellation/postponement fees, contingency).

- Include labels that allow modeling of COMPLEX NEURO-TARGETED PROCEDURES:
  * Complex_Procedure_Flag (0/1)
  * Complex_Procedure_Cost_Multiplier (>=1)
  * Route_of_Administration (must be present)
  * Surgery_Cost_per_Animal_USD or similar

- Example modules (you MAY rename them):
  Study_Design,
  Procedures_and_Routes,
  Clinical_Pathology_and_TK,
  Histopathology_and_Reporting,
  CRO_Commercial_Terms,
  Sponsor_Headcount_and_Ops.

- 'must_include' labels must be unique within each module and machine-friendly
  (snake_case or Title_Case).
- Encourage labels that mirror a CRO rodent tox SOW structure and highlight
  rate- and cost-limiting steps (complex surgery, histopathology, TK analysis).
- Do NOT include formulas or commentary in labels; these are just label names.
"""


def build_taxonomy(
    user_prompt: str,
    *,
    model: str,
    temperature: float,
    use_case_hint: Optional[str]
) -> Dict[str, Any]:
    system = "You are a domain taxonomy builder for OPERATING assumptions and capacity planning. You output valid JSON."
    hint = f"\nHint use_case: {use_case_hint}\n" if (use_case_hint or "").strip() else ""
    user = f"""{TAXONOMY_INSTRUCTIONS}

User scenario:
{user_prompt.strip()}

{hint}
"""
    works.msg("🧭 inferring rodent tox operating taxonomy from prompt…")
    txt = _chat_call(model=model, system=system, user=user,
                     temperature=temperature, json_mode=True, max_tokens=2000)
    try:
        data = json.loads(txt)
    except Exception:
        data = json.loads(_extract_json_snippet(txt))
    data.setdefault("use_case", "rodent_toxicology")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data


# ---------- Assumption generation ----------

ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column '{table_name}' table for an OPERATING model
for a rodent toxicology study outsourced to a CRO
(acute or repeat-dose rat/mouse tox, with possible TK, histopathology, and complex procedures).

CONTEXT (prompt-derived):
- use_case: {use_case}
- modules: {modules_json}
- global_must_include: {global_must_include}

UNIVERSAL_OPERATING_SCAFFOLD (always include; fill sensible defaults if user didn't specify):
{universal_scaffold}

RODENT_TOX_SCAFFOLD (domain-specific knobs for rodent toxicology at a CRO):
{rodent_tox_scaffold}

STUDY_WORKFLOW_SCAFFOLD (major study design parameters and per-animal / per-study costs):
{study_workflow_scaffold}

CRO_SOW_PATTERN (structure of a typical CRO rodent toxicology Statement of Work):
{cro_sow_pattern}

Return STRICT JSON with this EXACT schema:
{{
  "assumptions": [
    {{"label": "Currency", "value": "USD"}},
    {{"label": "Period_Unit", "value": "month"}}
  ]
}}

Rules:
- 'assumptions' is a list of objects with 'label' (string) and 'value' (string or number).
- Include 22–32 rows TOTAL, derived from:
    * the user prompt,
    * the universal operating scaffold,
    * the RODENT_TOX_SCAFFOLD,
    * the STUDY_WORKFLOW_SCAFFOLD, and
    * the CRO_SOW_PATTERN.

- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.

Prioritize three buckets of OPERATING inputs:

1) UNIVERSAL OPERATIONS (always present)
   - FTEs by function (FTE_Operations, FTE_Scientific)
   - Hours_per_FTE_per_Week
   - Average_Utilization_Rate (0–1)
   - Capacity_Units_per_Period (e.g., animals_per_month, studies_per_year)
   - Variable_Cost_per_Unit

2) STUDY DESIGN & PROCEDURES
   - Species, Strain
   - Number_of_Dose_Groups, Number_of_Animals_per_Group, Number_of_Sexes
   - Study_Type, Study_Duration_Days
   - Route_of_Administration (PO, IV, SC, IP, ICV, IT, etc.)
   - Core_Procedure_Cost_per_Animal_USD
   - Dose_Admin_Cost_per_Animal_USD
   - Surgery_Cost_per_Animal_USD
   - Clinical_Pathology_Cost_per_Animal_USD
   - Satellite_Groups_Flag, TK_Sampling_Flag
   - Number_of_TK_Samples_per_Animal
   - Pathology_Readout_Cost_per_Animal_USD
   - Bioanalytical_Sample_Cost_per_Sample_USD
   - TK_Analysis_Cost_per_Sample_USD
   - Reporting_and_QA_Cost_per_Study_USD

   Also include:
   - Acclimation_Period_Days, Dosing_Days, Recovery_Period_Days
   - Number_of_Organ_Systems_for_Histopathology

3) CRO COMMERCIAL TERMS & RISK
   - Payment_On_Signature_Pct
   - Payment_On_Study_Start_Pct
   - Payment_On_Dosing_Complete_Pct
   - Payment_On_Final_Report_Pct
   - Cancellation_Fee_Rate (0–1),
     Postponement_Fee_Rate (0–1),
     Contingency_Buffer_Pct (0–1)

Additional rules:
- ALL rates (utilization, payment percentages, cancellation/postponement,
  buffer percentages) must be 0–1 fractions (not 0–100).
- You MAY include additional labels from the taxonomy if they are clearly relevant to
  rodent toxicology and CRO operations, but keep the total within 22–32 rows.
- Include Complex_Procedure_Flag and Complex_Procedure_Cost_Multiplier
  if relevant to the user scenario. However, do NOT try to compute the multiplier;
  the calling code will enforce neuro-target cost logic.
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
    system = "You are a careful OPERATIONS modeling assistant for rodent toxicology. You STRICTLY follow output schemas."

    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        table_name=TABLE_NAME,
        use_case=taxonomy.get("use_case", "rodent_toxicology"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_SCAFFOLD, ensure_ascii=False, indent=2),
        rodent_tox_scaffold=json.dumps(RODENT_TOX_SCAFFOLD, ensure_ascii=False, indent=2),
        study_workflow_scaffold=json.dumps(STUDY_WORKFLOW_SCAFFOLD, ensure_ascii=False, indent=2),
        cro_sow_pattern=CRO_SOW_PATTERN.strip(),
        user_prompt=user_prompt.strip() if user_prompt else ""
    )

    works.msg("🔒 requesting JSON operating assumptions from GPT (rodent tox)…")
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

    # Backfill scaffold labels if missing
    for req in (UNIVERSAL_SCAFFOLD + RODENT_TOX_SCAFFOLD + STUDY_WORKFLOW_SCAFFOLD):
        lab = _sanitize_label(req)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, DEFAULTS.get(req, "0"))
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # Ensure essential defaults exist
    for k, v in DEFAULTS.items():
        lab = _sanitize_label(k)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, v)
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # enforce neuro / complex procedure logic
    out = _apply_complex_procedure_logic(out, user_prompt=user_prompt)

    # cap number of assumptions
    MAX_ASSUMPTIONS = 30
    preferred_order = [
        _sanitize_label(lab)
        for lab in (UNIVERSAL_SCAFFOLD + RODENT_TOX_SCAFFOLD + STUDY_WORKFLOW_SCAFFOLD)
    ]
    by_label = {row["label"]: row["value"] for row in out}
    final_rows: List[Dict[str, str]] = []
    used = set()

    for lab in preferred_order:
        if lab in by_label and len(final_rows) < MAX_ASSUMPTIONS:
            final_rows.append({"label": lab, "value": by_label[lab]})
            used.add(lab)

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


# ---------- Complex procedure logic (ICV / IT) ----------

def _apply_complex_procedure_logic(rows: List[Dict[str, str]], user_prompt: str) -> List[Dict[str, str]]:
    """
    Detect complex neuro-targeted procedures (e.g., ICV, IT) from:
      - Route_of_Administration label (if present)
      - Free text user_prompt

    If complex:
      - Complex_Procedure_Flag = 1
      - Complex_Procedure_Cost_Multiplier = 2.0
      - Multiply:
          * Dose_Admin_Cost_per_Animal_USD
          * Surgery_Cost_per_Animal_USD
        by the multiplier (2×)
    Else:
      - Complex_Procedure_Flag = 0
      - Complex_Procedure_Cost_Multiplier = 1.0
    """
    label_to_idx: Dict[str, int] = {r["label"]: i for i, r in enumerate(rows)}

    def get_val(label: str) -> Optional[str]:
        idx = label_to_idx.get(label)
        if idx is None:
            return None
        return str(rows[idx]["value"])

    def set_val(label: str, value: float) -> None:
        if float(value).is_integer():
            s = str(int(value))
        else:
            s = str(value)
        if label in label_to_idx:
            rows[label_to_idx[label]]["value"] = s
        else:
            rows.append({"label": label, "value": s})
            label_to_idx[label] = len(rows) - 1

    prompt_l = (user_prompt or "").lower()
    route_raw = (get_val("Route_of_Administration") or "").lower()

    neuro_keywords = [
        "icv", "intracerebroventricular",
        "it ", " it,", " it.", "intrathecal",
        "intra-cerebroventricular",
        "ventricular_injection",
        "cns", "brain_injection", "spinal", "intracisternal"
    ]

    is_complex = False
    for k in neuro_keywords:
        if k in prompt_l or k in route_raw:
            is_complex = True
            break

    multiplier = 2.0 if is_complex else 1.0
    flag = 1 if is_complex else 0

    # mark the flags
    set_val("Complex_Procedure_Flag", float(flag))
    set_val("Complex_Procedure_Cost_Multiplier", multiplier)

    # list of per-animal procedure costs to scale
    cost_labels = [
        "Dose_Admin_Cost_per_Animal_USD",
        "Surgery_Cost_per_Animal_USD",
    ]

    if is_complex:
        for lab in cost_labels:
            val_str = get_val(lab)
            if val_str is None:
                continue
            try:
                val = float(val_str)
            except Exception:
                continue
            new_val = val * multiplier
            set_val(lab, new_val)

    return rows


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
        elif "duration_days" in l or l.endswith("_days"):
            units[table_name][lab] = "days"
        elif l.endswith("_duration_weeks") or "duration_weeks" in l:
            units[table_name][lab] = "weeks"
        elif "fte" in l:
            units[table_name][lab] = "FTE"
        elif "hours_per_fte" in l:
            units[table_name][lab] = "hours/week"
        elif any(k in l for k in ["utilization", "rate", "buffer_pct"]):
            units[table_name][lab] = "fraction"
        elif "capacity_units_per_period" in l:
            units[table_name][lab] = "units/period"
        elif l.endswith("_per_animal_usd"):
            units[table_name][lab] = "USD/animal"
        elif l.endswith("_per_sample_usd"):
            units[table_name][lab] = "USD/sample"
        elif l.endswith("_per_study_usd"):
            units[table_name][lab] = "USD/study"
        elif l.endswith("_usd"):
            units[table_name][lab] = "USD"
        elif any(ch.isdigit() for ch in lv) and "%" in lv:
            units[table_name][lab] = "fraction"
        else:
            units[table_name][lab] = "unitless"
    return units


# ---------- Orchestrator ----------

def run_assumptions_only(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    use_case_hint: Optional[str] = None
) -> Dict[str, Any]:
    works.msg("🧠 CRO rodent tox operating assumptions pipeline starting…")
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
        works.msg("⚠️ LLM returned no rows; emitting header-only table.")
    tables = to_two_col_table(TABLE_NAME, rows)

    raw_formulas: Dict[str, str] = {}
    formulas = _scrub_all_formulas(raw_formulas)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": formulas,
        "annotations": {
            TABLE_NAME: (
                "Operating defaults for rodent toxicology studies with a CRO, "
                "including study design parameters, per-animal procedure costs, "
                "TK and histopathology knobs, payment terms, and a complex "
                "procedure (e.g., ICV/IT) multiplier that doubles key "
                "per-animal costs if neuro-targeted routes are detected "
                "from the user prompt or Route_of_Administration. "
                f"use_case={taxonomy.get('use_case','rodent_toxicology')}"
            )
        },
        "units": infer_units(TABLE_NAME, rows) if rows else {TABLE_NAME: {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "rodent_toxicology"),
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
        artifact = run_assumptions_only(
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
            "where": "rodent-tox-assumptions-only",
        })
        return 1


# bootstrap
if __name__ == "__main__":
    works.msg(
        "🔧 loading CRO rodent toxicology operating assumptions-only builder "
        "(generalized, prompt-driven, with complex neuro-target procedure "
        "logic that doubles key per-animal procedure costs when ICV/IT routes "
        "are implied)…"
    )
    _main_ion("gpt-4o-mini")
