#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Assumptions-only builder for a virtual therapeutics R&D org (Ion Works entry/exit).

What it does
------------
• Builds an R&D domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT,
  specifically for a therapeutics company that has NO internal wet lab and executes work via CROs.
• Calls GPT to infer sensible default R&D assumptions using that taxonomy PLUS a universal time/budget scaffold.
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
param(4) = use_case hint (optional; free-text hint, e.g., "preclinical oncology program via CROs")
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

# ---------- Universal time & budget scaffold ----------
UNIVERSAL_SCAFFOLD = [
    # Time
    "Start_Date", "Start_Year", "Start_Month", "Duration_Months", "Months_in_Year",
    "Phase_1_Name", "Phase_1_Months", "Phase_2_Name", "Phase_2_Months",
    # Budget frame (R&D-focused; no physical buildout/equipment)
    "Currency", "Capex_USD", "Opex_USD", "Contingency_Rate", "Tax_Rate", "Discount_Rate",
    # Payroll baseline (internal staff only; no internal lab)
    "Fringe_Rate", "FTE",
    # Growth / portfolio baseline
    "Annual_Growth_Rate"
]

DEFAULTS: Dict[str, str] = {
    "Currency": "USD",
    "Start_Date": "2025-01-01",
    "Start_Year": "2025",
    "Start_Month": "1",
    "Duration_Months": "12",
    "Months_in_Year": "12",
    "Phase_1_Name": "Phase_1",
    "Phase_1_Months": "6",
    "Phase_2_Name": "Phase_2",
    "Phase_2_Months": "6",
    "Capex_USD": "0",
    "Opex_USD": "0",
    "Contingency_Rate": "0.10",
    "Tax_Rate": "0.21",
    "Discount_Rate": "0.10",
    "Fringe_Rate": "0.25",
    "FTE": "1",
    "Annual_Growth_Rate": "0.10",
}

# ---------- Phase 1: Build taxonomy from prompt (CRO-based therapeutics R&D) ----------
TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for assumptions for a THERAPEUTICS R&D organization that:
- Has NO internal wet lab.
- Executes almost all experimental work via CONTRACT RESEARCH ORGANIZATIONS (CROs) and CDMOs.
- May run discovery, preclinical, CMC, clinical, and regulatory activities through external partners.

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

Rules (specific to virtual therapeutics R&D via CROs):
- Focus on therapeutic R&D use cases: target analysis and functional review, target validation,
  model generation, screening for drug candidate compounds, validation of drug candidates,
  in vitro toxicology, in vivo toxicology, GMP synthesis, GLP toxicology, and IND-related
  regulatory consulting (e.g., IND meeting consultants for FDA), plus downstream clinical and CMC.
- Choose concise module names like: Portfolio, Target_and_Biology, Preclinical, CMC, Clinical,
  Regulatory, QA_QC, CRO_Oversight, GxP_Quality, IP_Legal, Tools_And_Platforms, G_A (for G&A).

- 'must_include' labels must be unique within each module and machine-friendly (snake_case or Title_Case).

- Emphasize CRO- and vendor-based COSTS for the following R&D phases (examples, not exhaustive):
  • Target analysis and functional review
      - Target_analysis_CRO_cost_USD
      - Target_functional_review_CRO_cost_USD
  • Target validation
      - Target_validation_CRO_cost_USD
  • Model generation (cell/animal models; all via CROs)
      - Model_generation_CRO_cost_USD
  • Screening for drug candidate compounds
      - Screening_campaign_CRO_cost_USD
      - Hits_screened_count
  • Validation of drug candidates (hit-to-lead / lead optimization)
      - Candidate_validation_CRO_cost_USD
      - Lead_optimization_CRO_cost_USD
  • In vitro and in vivo toxicology
      - In_vitro_toxicology_CRO_cost_USD
      - In_vivo_toxicology_CRO_cost_USD
  • GMP synthesis (via CDMO)
      - GMP_synthesis_CRO_cost_USD
      - GMP_DS_batch_cost_USD
      - GMP_DP_batch_cost_USD
  • GLP toxicology
      - GLP_toxicology_package_cost_USD
  • IND-related regulatory consulting and meetings
      - IND_meeting_consulting_fees_USD
      - IND_preparation_consulting_fees_USD

- Also include headcount by internal function (clinical_ops_FTE, CMC_lead_FTE, regulatory_affairs_FTE, etc.) for a virtual org.

- Explicitly avoid INTERNAL LAB and PHYSICAL BUILDOUT/EQUIPMENT line items, including but not limited to:
  - lab_buildout_capex, office_buildout_USD, facility_renovation_cost, lab_equipment_capex,
    equipment_purchase_USD, server_hardware_capex, furniture_and_fixture_capex.
  Any such spend should either be:
    (a) excluded, or
    (b) represented as service/vendor fees (e.g., fully hosted SaaS, “per month” platform fees) instead of equipment/buildout.

- Prefer price/volume, headcount by function, CRO rate cards, clinical per-patient costs, site count, number_of_studies,
  overhead (legal, IP, insurance, cloud, tools), tax_rate, discount_rate, depreciation_years if applicable,
  growth rates, and capex/opex buckets — but NEVER as buildout/equipment.

- Always incorporate timeline fields (start_date, start_year, duration_months, phase names/durations) to align with R&D phases.

- Keep 'global_must_include' distinct from module lists (no duplicates). Use it for cross-cutting essentials like:
  Currency, Tax_Rate, Discount_Rate, Annual_Growth_Rate, Contingency_Rate, Months_in_Year, Portfolio_Size, etc.

- DO NOT include formulas or commentary in labels; these are just label names.
"""

def build_taxonomy(user_prompt: str, *, model: str, temperature: float, use_case_hint: Optional[str]) -> Dict[str, Any]:
    system = (
        "You are a domain taxonomy builder for R&D and financial/operational assumptions in a "
        "VIRTUAL THERAPEUTICS COMPANY that outsources to CROs and CDMOs, with NO internal lab and "
        "NO buildout/equipment line items. You output valid JSON."
    )
    hint = f"\nHint use_case: {use_case_hint}\n" if (use_case_hint or "").strip() else ""
    user = f"""{TAXONOMY_INSTRUCTIONS}

User scenario (virtual therapeutics R&D via CROs):
{user_prompt.strip()}

{hint}
"""
    works.msg("🧭 inferring CRO-based therapeutics R&D taxonomy from prompt…")
    txt = _chat_call(model=model, system=system, user=user, temperature=temperature, json_mode=True, max_tokens=2000)
    try:
        data = json.loads(txt)
    except Exception:
        data = json.loads(_extract_json_snippet(txt))
    # Basic sanity
    data.setdefault("use_case", "therapeutics_RnD_via_CROs")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data

# ---------- Phase 2: Generate assumptions using taxonomy + scaffold ----------
ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column 'Assumptions' table for a THERAPEUTICS R&D model where:
- The company has NO internal wet lab.
- All experimental work (discovery, preclinical, CMC, and clinical) is executed via CROs/CDMOs.
- Internal team is primarily program leadership, clinical/CMC/reg affairs, and G&A.
- There are NO buildout or equipment cost line items (no lab buildout, office buildout, hardware, or equipment CAPEX).

CONTEXT (prompt-derived):
- use_case: {use_case}
- modules: {modules_json}
- global_must_include: {global_must_include}

UNIVERSAL_SCAFFOLD (always include; fill sensible defaults if user didn't specify):
{universal_scaffold}

Return STRICT JSON with this EXACT schema:
{{
  "assumptions": [
    {{"label": "Currency", "value": "USD"}},
    {{"label": "Start_Year", "value": "2025"}}
  ]
}}

Rules (specific to virtual therapeutics R&D via CROs, with NO buildout/equipment):
- 'assumptions' is a list of objects with 'label' (string) and 'value' (string or number).
- Include 20–50 rows derived from the user prompt + modules/global_must_include + universal scaffold.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.

R&D focus – you MUST prioritize CRO/vendor COST assumptions for these phases:
- Target analysis and functional review:
    - e.g., Target_analysis_CRO_cost_USD, Target_functional_review_CRO_cost_USD
- Target validation:
    - e.g., Target_validation_CRO_cost_USD
- Model generation:
    - e.g., Model_generation_CRO_cost_USD
- Screening for drug candidate compounds:
    - e.g., Screening_campaign_CRO_cost_USD, Hits_screened_count
- Validation of drug candidates (hit-to-lead / lead optimization):
    - e.g., Candidate_validation_CRO_cost_USD, Lead_optimization_CRO_cost_USD
- In vitro toxicology:
    - e.g., In_vitro_toxicology_CRO_cost_USD
- In vivo toxicology:
    - e.g., In_vivo_toxicology_CRO_cost_USD
- GMP synthesis via CDMO:
    - e.g., GMP_synthesis_CRO_cost_USD, GMP_DS_batch_cost_USD, GMP_DP_batch_cost_USD
- GLP toxicology:
    - e.g., GLP_toxicology_package_cost_USD
- IND-related FDA consulting and meetings:
    - e.g., IND_meeting_consulting_fees_USD, IND_preparation_consulting_fees_USD   
- FTE: 
    - Must have FTE
- Average_Salary
    - Must have Average_Salary
Additionally:
- Portfolio and program-level assumptions (number_of_programs, lead_indication, modality, etc.).
- Clinical: sites_count, patients_per_site, cost_per_patient, per_site_startup_fee, monitoring_cost_per_visit,
  data_management_cost_per_patient, CRO_PM_monthly_fee, safety_reporting_cost.
- Regulatory and QA: regulatory_consulting_fees, submission_prep_cost, QA_audit_cost_per_site.
- Internal staff: FTE counts by function (clinical_ops_FTE, CMC_FTE, regulatory_FTE, QA_FTE, finance_FTE, CEO_FTE),
  and fully loaded cost per FTE where appropriate.
- Overhead (no lab or office buildout, no hardware purchase):
  - OK: corporate_rent_USD_per_year, cloud_tools_USD_per_year, insurance_USD_per_year,
    IP_legal_USD_per_year, board_and_investor_relations_USD_per_year, hosted_platform_fee_USD_per_year.

Forbidden categories:
- EXPLICITLY AVOID the following categories entirely:
  - Any line item that represents BUILDOUT (e.g., lab_buildout_USD, office_buildout_USD, facility_renovation_cost).
  - Any line item that represents EQUIPMENT or HARDWARE purchases (e.g., lab_equipment_capex, equipment_purchase_USD,
    server_hardware_capex, manufacturing_equipment_cost).
  If the scenario implies such spend, either:
    (a) omit it, or
    (b) model it as recurring service/vendor/SaaS fees rather than equipment/buildout CAPEX.

Financial scaffold:
- You MUST include 'Annual_Growth_Rate' with a sensible default in 0–1 range (e.g., 0.10).
- ALL rates (Tax_Rate, Fringe_Rate, Indirect_Cost_Rate, Discount_Rate, Contingency_Rate, etc.) must be 0–1 fractions (not 0–100).
- Currency values should generally be in USD unless the user clearly indicates otherwise.
- Capex_USD must NOT be described as or broken down into buildout/equipment; it should be 0 or only used for non-physical,
  intangible or one-time non-equipment vendor costs if required.
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
    system = (
        "You are a careful financial modeling assistant for a VIRTUAL THERAPEUTICS COMPANY. "
        "The company has NO internal lab, NO buildout costs, and NO equipment purchases; "
        "all experiments run via CROs and CDMOs. "
        "You STRICTLY follow output schemas and avoid internal lab, buildout, and equipment cost lines."
    )

    # Compose instruction with taxonomy + scaffold
    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        use_case=taxonomy.get("use_case", "therapeutics_RnD_via_CROs"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_SCAFFOLD, ensure_ascii=False, indent=2),
        user_prompt=user_prompt.strip() if user_prompt else ""
    )

    works.msg("🔒 requesting CRO-based R&D JSON assumptions from GPT (no buildout/equipment)…")
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

    # ---- Build a comprehensive required_labels set ----
    required_labels: set[str] = set()

    # Universal scaffold & explicit defaults
    for name in UNIVERSAL_SCAFFOLD:
        required_labels.add(_sanitize_label(name))
    for name in DEFAULTS.keys():
        required_labels.add(_sanitize_label(name))

    # Taxonomy global_must_include
    for lbl in taxonomy.get("global_must_include", []):
        required_labels.add(_sanitize_label(lbl))

    # Taxonomy module-level must_include labels
    for mod in taxonomy.get("modules", []):
        for lbl in mod.get("must_include", []):
            required_labels.add(_sanitize_label(lbl))

    out: List[Dict[str, str]] = []
    seen: set[str] = set()

    for it in items:
        raw_label = str(it.get("label", "")).strip()
        if not raw_label:
            continue
        label = _sanitize_label(raw_label)
        if label in seen:
            continue

        value = it.get("value", None)

        # Ensure every label has a non-empty value
        if value is None or (isinstance(value, str) and not value.strip()):
            # Prefer explicit DEFAULTS if available, otherwise "0"
            value = DEFAULTS.get(label, "0")

        # Normalize percent-like strings to fractions if needed
        if isinstance(value, str) and value.strip().endswith("%"):
            try:
                pct = float(value.strip().rstrip("%"))
                value = pct / 100.0
            except Exception:
                # If parsing fails, keep original string
                pass

        out.append({"label": label, "value": str(value)})
        seen.add(label)

    # Backfill any required labels not returned by the model
    for lab in required_labels:
        if lab not in seen:
            default_val = DEFAULTS.get(lab, "0")
            out.append({"label": lab, "value": default_val})
            seen.add(lab)

    # Optional: belt-and-suspenders filter to drop any leaked buildout/equipment labels
    filtered_out: List[Dict[str, str]] = []
    forbidden_substrings = ["buildout", "equipment", "hardware"]
    for kv in out:
        l = kv["label"].lower()
        if any(fs in l for fs in forbidden_substrings):
            continue
        filtered_out.append(kv)

    return filtered_out

# ---------- NEW: validation – no empty values allowed ----------
def _validate_no_empty_assumptions(rows: List[Dict[str, str]]) -> None:
    """
    Ensure there are NO empty labels or empty values in the Assumptions table.
    Raises RuntimeError if any violation is found.
    """
    for kv in rows:
        lab = str(kv.get("label", "")).strip()
        if not lab:
            raise RuntimeError("Assumptions row has an empty label; all labels must be non-empty.")
        val = kv.get("value", None)
        if val is None:
            raise RuntimeError(f"Assumptions[{lab}] has a null value; all values must be non-empty.")
        if isinstance(val, str) and not val.strip():
            raise RuntimeError(f"Assumptions[{lab}] has an empty string value; all values must be non-empty.")

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
        elif any(k in l for k in ["start_year", "year"]):
            units[table_name][lab] = "year"
        elif any(k in l for k in ["month", "months"]):
            units[table_name][lab] = "months"
        elif any(k in l for k in ["tax", "rate", "discount", "fringe", "indirect_cost", "contingency"]):
            units[table_name][lab] = "fraction"
        elif "per_unit" in l or l.endswith("_usd_per_unit"):
            units[table_name][lab] = "USD/unit"
        elif l.endswith("_usd_per_year"):
            units[table_name][lab] = "USD/year"
        elif l.endswith("_usd_per_month"):
            units[table_name][lab] = "USD/month"
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
    works.msg("🧠 CRO-based therapeutics R&D assumptions-only pipeline starting (no buildout/equipment)…")
    taxonomy = build_taxonomy(user_prompt, model=model, temperature=temperature, use_case_hint=use_case_hint)
    rows = generate_assumptions_from_taxonomy(
        user_prompt=user_prompt,
        taxonomy=taxonomy,
        model=model,
        temperature=temperature
    )

    # Hard guard: do NOT permit any empty values in the assumptions table
    _validate_no_empty_assumptions(rows)

    if not rows:
        works.msg("⚠️ LLM returned no rows; emitting header-only table.")
    tables = to_two_col_table("Assumptions", rows)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": {},
        "annotations": {
            "Assumptions": (
                "Defaults inferred from user prompt via GPT (two-column table) for a virtual therapeutics R&D org "
                "that runs experiments via CROs/CDMOs, with explicit CRO-phase costs and NO buildout or equipment costs. "
                f"use_case={taxonomy.get('use_case','therapeutics_RnD_via_CROs')}"
            )
        },
        "units": infer_units("Assumptions", rows) if rows else {"Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "therapeutics_RnD_via_CROs"),
            "modules": taxonomy.get("modules", []),
            "global_must_include": taxonomy.get("global_must_include", []),
            "rows": len(rows)
        }
    }
    return artifact

# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        # param(1) = user prompt
        user_prompt = works.param(1)  # required
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(1) required (user prompt)."})
        return 1

    # param(2) = model
    model = works.param(2) or default_model

    # param(3) = temperature
    try:
        temperature = float(works.param(3) or 0.2)
    except Exception:
        temperature = 0.2

    # param(4) = use_case_hint
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
    works.msg("🔧 loading CRO-based therapeutics R&D assumptions-only builder (explicit CRO phases, no buildout/equipment)…")
    _main_ion("gpt-4o-mini")
