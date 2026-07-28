#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Operating assumptions-only builder (Ion Works entry/exit), generalized & prompt-driven,
with CRO (Contract Research Organization) lead-identification context.

What it does
------------
• Builds a domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT (no hardcoded library).
• Assumes the user is using a CRO for lead identification / preclinical studies and biases assumptions accordingly.
• Calls GPT to infer sensible default OPERATING assumptions using that taxonomy PLUS:
      - a universal operating scaffold
      - a CRO SOW (Statement of Work) structural pattern
• Returns ONLY a single two-column 'Assumptions' table:
      Assumptions[0:0][0:0] = "Label"
      Assumptions[1:1][0:0] = "Value"
      Assumptions[0:0][r:r] = <label>
      Assumptions[1:1][r:r] = <value>
• No formulas, just tables (+ minimal annotations/units for completeness).
• Uses Ion Works for entry (msg) and exit (resolve).

Ion params
----------
param(1) = user prompt (required)
param(2) = model (optional; default "gpt-4o-mini")
param(3) = temperature (optional; default 0.2)
param(4) = use_case hint (optional; free-text hint, e.g., "lead identification with CRO",
           "preclinical tox with Charles River", etc.)
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
    # Empty or None → use default or "0"
    if value is None:
        default = DEFAULTS.get(label)
        return str(default) if default is not None else "0"

    if isinstance(value, str):
        if not value.strip():
            default = DEFAULTS.get(label)
            return str(default) if default is not None else "0"
        return value

    # Numbers / other types: just stringify
    return str(value)


# ---------- formula scrubbers (for insignificant operations) ----------

def _scrub_formula(formula: str) -> str:
    """
    Scrub insignificant operations from a single formula string.

    Examples:
      =0+(PnL[Net_Income]*(1^0)+PnL[Net_Income]*(1^1))
      -> =(PnL[Net_Income]*1+PnL[Net_Income]*(1^1))

    Current rules:
      - Remove a leading '0+' immediately after '=': '=0+...' -> '=...'
      - Replace any '1^0' with '1' (neutral power operation).
    """
    if not isinstance(formula, str):
        return formula
    s = formula.strip()
    if not s:
        return s

    # Only operate on formulas that look like spreadsheet formulas (start with '=')
    if s.startswith("="):
        # Remove '=0+' at the very start
        s = re.sub(r"^=0\+", "=", s)

    # Replace '1^0' with '1'
    s = s.replace("1^0", "1")

    return s


def _scrub_all_formulas(formulas: Dict[str, str]) -> Dict[str, str]:
    """
    Apply _scrub_formula to all formulas in the dict.
    """
    if not isinstance(formulas, dict):
        return formulas
    return {k: _scrub_formula(v) for k, v in formulas.items()}


# ---------- Universal operating scaffold (10 params) ----------
# These are intentionally OPERATING assumptions: headcount, capacity, utilization, unit costs.
UNIVERSAL_SCAFFOLD = [
    "Currency",
    "Period_Unit",                  # e.g., "month", "week"
    "Duration_Periods",             # e.g., 12 months, 52 weeks
    "FTE_Total",
    "FTE_Operations",
    "FTE_Scientific",               # or technical / production staff
    "Hours_per_FTE_per_Week",
    "Average_Utilization_Rate",     # 0–1
    "Capacity_Units_per_Period",
    "Variable_Cost_per_Unit",
]

DEFAULTS: Dict[str, str] = {
    "Currency": "USD",
    "Period_Unit": "month",
    "Duration_Periods": "12",
    "FTE_Total": "5",
    "FTE_Operations": "3",
    "FTE_Scientific": "2",
    "Hours_per_FTE_per_Week": "40",
    "Average_Utilization_Rate": "0.75",
    "Capacity_Units_per_Period": "1000",
    "Variable_Cost_per_Unit": "10",
}

# ---------- CRO / SOW structural scaffold ----------
# High-level structure distilled from a GLP toxicology / lead-ID SOW with a CRO
# (study design, pricing, payment milestones, cancellations, experimental design, reporting, archiving).
CRO_SOW_PATTERN = """
You are modeling a drug discovery / lead-identification program that is
outsourced to a Contract Research Organization (CRO).

Use a CRO Statement of Work (SOW) structure as your mental template.
Typical sections include:

1) COMMERCIAL / CONTRACT
   - CRO_Name, CRO_Facility
   - Study_Title, Study_Type, GLP_Compliance
   - Study_Price_USD
   - Payment milestones (e.g., Payment_On_Signature_Pct,
     Payment_On_Study_Initiation_Pct, Payment_On_In_Life_Completion_Pct,
     Payment_On_Draft_Report_Pct)
   - Cancellation_Fee_Rate_By_Notice_Window,
     Postponement_Fee_Rate, Animal_Cost_Pass_Through

2) STUDY DESIGN / TEST SYSTEM
   - Species, Strain, Sex, Number_of_Animals, Animals_Per_Group
   - Route_of_Administration, Dose_Levels, Treatment_Duration_Days,
     Post_Treatment_Duration_Days
   - Main vs Recovery vs Satellite groups
   - Bioanalytical_Sample_Count, Key_Tissues_Collected

3) OPERATIONS / TIMELINES
   - Project_Start_Quarter, Study_Duration_Weeks
   - Target_Study_Start_Quarter, Animal_Arrival_Lead_Time_Days
   - Draft_Report_Weeks_After_Last_Necropsy,
     Final_Report_Weeks_After_Last_Necropsy
   - Archive_Duration_Years

4) RISK / CHANGE ORDERS
   - Assumed_Protocol_Amendment_Rate
   - Expected_Repeat_Analysis_Rate
   - Contingency_Buffer_Pct (for scope creep / repeat analyses)

For lead identification, extend the same pattern to:
   - Compounds_Screened, Primary_Assay_Type,
     Cost_per_Compound_Screened_USD
   - Hit_Rate_Primary_Screen (0–1),
     Hits_Taken_Into_Secondary_Screens
   - Secondary_Assay_Cost_per_Compound_USD,
     In_Vivo_Studies_Per_Lead
"""

# ---------- Phase 1: Build taxonomy from prompt ----------
TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for OPERATING assumptions for a drug discovery
/ lead-identification program that is at least partly outsourced to a
Contract Research Organization (CRO).

Return STRICT JSON with this EXACT schema:
{
  "use_case": "short_machine_friendly_key",
  "rationale": "one-sentence reason",
  "modules": [
    {
      "name": "short_module_name",
      "description": "what this module covers",
      "must_include": ["Label_1", "Label_2", "..."],    // 5–15 labels this module must have
      "label_hints": "brief hints for units/shape, optional"
    }
  ],
  "global_must_include": ["Label_A", "Label_B", "..."]   // 10–25 labels across modules
}

Rules:
- Focus on OPERATIONS and STUDY DESIGN for a CRO engagement:
  * demand / throughput for assays (compounds screened, hits, leads),
  * CRO capacity and timelines (slots per quarter, animals per study),
  * utilization (screens/week, animal room usage),
  * headcount by function at the Sponsor (FTE_Scientific, FTE_Operations),
  * unit economics (cost per compound / per assay / per study),
  * study-level commercial terms (price, payment milestones, cancellation risk).
- Modules should be concise (e.g., Demand, Screening_Capacity, In_Vivo_Studies,
  CRO_Contract_Commercials, Sponsor_Headcount, Bioanalytics, Reporting_And_Archiving).
- 'must_include' labels must be unique within each module and machine-friendly
  (snake_case or Title_Case).
- Encourage labels that mirror a CRO SOW structure (study design, test system,
  in-life procedures, sample collection, reporting timelines, archiving) and
  lead-identification operations (compounds screened, hit rates, in vivo follow-up).
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
    works.msg("🧭 inferring operating taxonomy from prompt…")
    txt = _chat_call(model=model, system=system, user=user, temperature=temperature, json_mode=True, max_tokens=2000)
    try:
        data = json.loads(txt)
    except Exception:
        data = json.loads(_extract_json_snippet(txt))
    # Basic sanity
    data.setdefault("use_case", "general_operations")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data


# ---------- Phase 2: Generate assumptions using taxonomy + scaffold ----------
ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column 'Assumptions' table for an OPERATING model
for a lead-identification / preclinical study program outsourced to a CRO
(capacity / throughput / study design / commercial terms).

CONTEXT (prompt-derived):
- use_case: {use_case}
- modules: {modules_json}
- global_must_include: {global_must_include}

UNIVERSAL_OPERATING_SCAFFOLD (always include; fill sensible defaults if user didn't specify):
{universal_scaffold}

CRO_SOW_PATTERN (structure of a typical CRO Statement of Work):
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
- Include 10–18 rows TOTAL, derived from:
    * the user prompt,
    * the universal operating scaffold, and
    * the CRO_SOW_PATTERN.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.

Prioritize three buckets of OPERATING inputs:

1) UNIVERSAL OPERATIONS (always present)
   - FTEs by function (FTE_Operations, FTE_Scientific, FTE_Support)
   - Hours_per_FTE_per_Week
   - Average_Utilization_Rate (0–1)
   - Capacity_Units_per_Period (e.g., compounds_screened_per_month)
   - Variable_Cost_per_Unit

2) CRO STUDY DESIGN & THROUGHPUT
   - CRO_Name, CRO_Facility, Study_Type, GLP_Compliance
   - Species, Strain, Animals_Per_Group, Number_of_Animals,
     Treatment_Duration_Days, Post_Treatment_Duration_Days
   - Compounds_Screened, Hit_Rate_Primary_Screen, Hits_Taken_Into_Secondary_Screens
   - In_Vivo_Studies_Per_Lead or similar capacity-type labels

3) CRO COMMERCIAL TERMS & RISK
   - Study_Price_USD or Total_CRO_Fees_USD
   - Payment_On_Signature_Pct, Payment_On_Study_Initiation_Pct,
     Payment_On_In_Life_Completion_Pct, Payment_On_Draft_Report_Pct
   - Cancellation_Fee_Rate (0–1),
     Postponement_Fee_Rate (0–1),
     Contingency_Buffer_Pct (0–1)

Additional rules:
- ALL rates (utilization, hit rates, failure rates, cancellation/postponement,
  buffer percentages, etc.) must be 0–1 fractions (not 0–100).
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
    system = "You are a careful OPERATIONS modeling assistant. You STRICTLY follow output schemas."

    # Compose instruction with taxonomy + operating scaffold + CRO SOW pattern
    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        use_case=taxonomy.get("use_case", "general_operations"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_SCAFFOLD, ensure_ascii=False, indent=2),
        cro_sow_pattern=CRO_SOW_PATTERN.strip(),
        user_prompt=user_prompt.strip() if user_prompt else ""
    )

    works.msg("🔒 requesting JSON operating assumptions from GPT…")
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
        # Normalize percent strings to fractions if needed
        if isinstance(value, str) and value.strip().endswith("%"):
            try:
                pct = float(value.strip().rstrip("%"))
                value = pct / 100.0
            except Exception:
                pass
        out.append({"label": label, "value": str(value)})
        seen.add(label)

    # Backfill universal operating scaffold if missing
    for req in UNIVERSAL_SCAFFOLD:
        lab = _sanitize_label(req)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, DEFAULTS.get(lab, "0"))
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # Ensure truly essential defaults exist (here same set as scaffold)
    for k, v in DEFAULTS.items():
        lab = _sanitize_label(k)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, v)
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # --- Enforce a hard cap on number of assumptions (tiny clamp) ---
    # Allow universal scaffold + several CRO-specific assumptions.
    MAX_ASSUMPTIONS = 16

    # Prefer scaffold labels first (purely operating)
    preferred_order = [_sanitize_label(lab) for lab in UNIVERSAL_SCAFFOLD]

    # Map label -> value for reordering
    by_label = {row["label"]: row["value"] for row in out}

    final_rows: List[Dict[str, str]] = []
    used = set()

    # 1) Add scaffold labels in order, if present
    for lab in preferred_order:
        if lab in by_label and len(final_rows) < MAX_ASSUMPTIONS:
            final_rows.append({"label": lab, "value": by_label[lab]})
            used.add(lab)

    # 2) Fill remaining slots with any other OPERATING labels (taxonomy-derived)
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
        elif "fte" in l:
            units[table_name][lab] = "FTE"
        elif "hours_per_fte" in l:
            units[table_name][lab] = "hours/week"
        elif any(k in l for k in ["utilization", "uptime", "rate", "failure"]):
            units[table_name][lab] = "fraction"
        elif "capacity_units_per_period" in l:
            units[table_name][lab] = "units/period"
        elif l.endswith("_per_unit") or l.endswith("_usd_per_unit"):
            units[table_name][lab] = "USD/unit"
        elif l.endswith("_usd_per_period"):
            units[table_name][lab] = "USD/period"
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
    works.msg("🧠 CRO lead-ID / operating assumptions pipeline starting…")
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
    tables = to_two_col_table("Assumptions", rows)

    # This op is "assumptions-only", so we currently emit no formulas.
    # But any future formulas added here will be scrubbed for insignificant ops.
    raw_formulas: Dict[str, str] = {}
    formulas = _scrub_all_formulas(raw_formulas)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": formulas,
        "annotations": {
            "Assumptions": (
                "Operating defaults inferred from user prompt via GPT (two-column table). "
                f"use_case={taxonomy.get('use_case','general_operations')}"
            )
        },
        "units": infer_units("Assumptions", rows) if rows else {"Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "general_operations"),
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
            "where": "assumptions-only",
        })
        return 1


# bootstrap
if __name__ == "__main__":
    works.msg("🔧 loading CRO lead-ID operating assumptions-only builder (generalized, prompt-driven)…")
    _main_ion("gpt-4o-mini")
