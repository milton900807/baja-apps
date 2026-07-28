#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
CMC OPERATING ASSUMPTIONS-ONLY BUILDER (Ion Works entry/exit),
gene therapy–specific, generalized & prompt-driven, with expanded CMC detail.

What it does
------------
• Builds a domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT
  (no hardcoded library of products).
• Assumes the user is planning late-stage clinical / commercial CMC for a gene therapy
  (vector DS + DP), including:
      - upstream + downstream vector DS,
      - formulation + fill-finish DP,
      - analytics/QC, stability, comparability, and release,
      - CMC bottlenecks (plasmids, cell banks, QC capacity, cold chain, etc.).
• Calls GPT to infer detailed OPERATING + FINANCIAL + TIMELINE + CMC BOTTLENECK
  assumptions using:
      - a universal CMC operating scaffold
      - a gene therapy–specific scaffold (vector DS + DP)
      - CMC rate- and cost-limiting bottleneck scaffolds
      - a CMC / CDMO Statement-of-Work / Manufacturing Agreement structural pattern
• Explicitly instructs GPT to parse and reflect ALL salient details in the USER PROMPT:
      - modality, serotype, indication, phase, route of administration,
      - doses/patient, total vector genomes requested, packaging, shipping, QC tests requested,
      - DS/DP sites (internal vs CDMO), regions, timelines implied in the prompt text.
• Returns ONLY a single two-column 'CMC_Assumptions' table:
      CMC_Assumptions[0:0][0:0] = "Label"
      CMC_Assumptions[1:1][0:0] = "Value"
      CMC_Assumptions[0:0][r:r] = <label>
      CMC_Assumptions[1:1][r:r] = <value>
• No formulas, just tables (+ minimal annotations/units for completeness).
• Uses Ion Works for entry (msg) and exit (resolve).

Ion params
----------
param(1) = user prompt (required)
param(2) = model (optional; default "gpt-4o-mini")
param(3) = temperature (optional; default 0.2)
param(4) = use_case hint (optional; free-text hint, e.g.:
           "phase 3 CMC for AAV8 intrathecal",
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
    # Product / modality
    "Modality",                        # e.g., "AAV", "Lentiviral", "Non_viral"
    "Vector_Type",                     # AAV, LV, etc.
    "Serotype_or_Capsid",              # e.g., "AAV9", "AAV2", "Proprietary_Capsid_X"
    "Transgene_Name",                  # short identifier
    "Indication",                      # clinical indication
    "Clinical_Phase",                  # e.g., "Phase_1_2", "Phase_3", "Commercial"

    # Route & regimen
    "Route_of_Administration",         # e.g., "IV", "Intrathecal", "Subretinal"
    "Regimen_Type",                    # "Single_Dose", "Repeat_Dosing"
    "Number_of_Doses_per_Patient",
    "Dose_Interval_Weeks",

    # Dosing & presentation
    "Dosing_Unit",                     # e.g., "vg_kg", "vg_eye", "vg_patient"
    "Dose_Per_Patient_vg_kg",          # or equivalent; keep name stable even if non-kg dosing
    "Units_per_Patient",               # filled vials/syringes per patient
    "Container_Type",                  # "Vial", "PFS", "Bag"
    "Fill_Volume_per_Unit_mL",
    "Units_per_Kit",

    # Demand
    "Patients_Per_Year_Launch",
    "Patients_Per_Year_Peak",

    # Process / DS properties
    "Vector_Yield_vg_per_Batch",
    "Vector_Concentration_vg_per_mL",
    "Process_Type",                    # suspension_HEK293_transient, stable_line, etc.
    "Bioreactor_Scale_L_per_Batch",

    # Sites
    "DS_Site",                         # DS = vector DS site
    "DP_Site",                         # DP = fill-finish site
    "Is_CDMO",                         # 0–1 flag
    "Target_Market_Regions",           # e.g., "US_EU"
]


# ---------- Universal CMC operating scaffold ----------
# Intentionally OPERATING + FINANCIAL: capacity, utilization, unit costs, overhead.
UNIVERSAL_CMC_OPERATING_SCAFFOLD = [
    "Currency",
    "Period_Unit",                        # e.g., "month"
    "Duration_Periods",                   # e.g., 18 months for pre-launch, or similar
    "Manufacturing_FTEs",
    "QA_QC_FTEs",
    "Engineering_FTEs",
    "Regulatory_CMC_FTEs",
    "Hours_per_FTE_per_Week",
    "Average_Hourly_Rate_USD",           # average hourly rate per FTE
    "Average_Utilization_Rate",          # 0–1
    "Annual_Batches",
    "Annual_Volume_Units",
    "Variable_Cost_per_Batch_USD",
    "Fixed_Mfg_Overhead_per_Period_USD",
]

# ---------- CMC bottlenecks: plasmids, cell banks, QC, stability, fill-finish ----------
CMC_RATE_LIMITING_SCAFFOLD = [
    # Plasmids / raw materials
    "Plasmid_Batches_per_Vector",
    "Plasmid_Supply_Lead_Time_Weeks",
    "Plasmid_Batch_Cost_USD",
    "Critical_Raw_Material_Lead_Time_Weeks",

    # Cell banks
    "Master_Cell_Bank_Lead_Time_Weeks",
    "Working_Cell_Bank_Lead_Time_Weeks",

    # QC analytics capacity
    "Release_Testing_Cycle_Time_Weeks",
    "Sterility_Test_Duration_Days",
    "QC_Assay_Panel_Cost_per_Batch_USD",
    "Max_Concurrent_Batches_In_Testing",
    "Max_DS_Lots_In_Storage",

    # Stability
    "Stability_Study_Cost_per_Year_USD",
    "Stability_Sample_Commitment_Per_Batch_Units",
    "Registration_Stability_Duration_Months",

    # Fill-finish capacity
    "Fill_Finish_Line_Max_Units_per_Day",
    "Changeover_Time_Days",
    "Minimum_Batch_Size_Units",
]

# ---------- Analytics/QC detail scaffold ----------
ANALYTICS_QC_DETAIL_SCAFFOLD = [
    "Potency_Assay_Type",                       # e.g., "Cell_Based", "qPCR", "ddPCR"
    "Potency_Assay_Turnaround_Days",
    "Identity_Method",                          # e.g., "Sequencing", "Restriction_Digest"
    "Capsid_Titer_Method",                      # "ELISA", "AEX_HPLC"
    "Empty_Full_Method",                        # "AUC", "AEX_HPLC"
    "Residual_DNA_Method",
    "Residual_Protein_Method",
    "Endotoxin_Method",
    "Endotoxin_Spec_EU_per_mL",
    "Vector_Genome_Release_Spec_vg_per_mL",
    "Sterility_Method",                         # e.g., "Compendial_14_day", "Rapid"
]

# ---------- Supply chain / cold chain scaffold ----------
SUPPLY_CHAIN_SCAFFOLD = [
    "Storage_Temperature_C",                    # e.g., -80, -65_to_-45, 2_to_8
    "Shipping_Temperature_Range_C",             # text description
    "Max_Time_Out_of_Storage_Hours",
    "Uses_Single_Use_Bags",                     # 0–1
    "Shipping_Packaging_Type",                  # e.g., "Dry_Ice", "LN2_Dewar"
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
    # Universal CMC ops
    "Currency": "USD",
    "Period_Unit": "month",
    "Duration_Periods": "18",
    "Manufacturing_FTEs": "8",
    "QA_QC_FTEs": "4",
    "Engineering_FTEs": "2",
    "Regulatory_CMC_FTEs": "2",
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

    # Gene therapy defaults
    "Modality": "AAV",
    "Vector_Type": "AAV",
    "Serotype_or_Capsid": "AAV9",
    "Transgene_Name": "GENE_X",
    "Indication": "Rare_Disease_X",
    "Clinical_Phase": "Phase_3",

    "Route_of_Administration": "IV",
    "Regimen_Type": "Single_Dose",
    "Number_of_Doses_per_Patient": "1",
    "Dose_Interval_Weeks": "0",

    "Dosing_Unit": "vg_kg",
    "Dose_Per_Patient_vg_kg": "1e14",
    "Units_per_Patient": "2",
    "Container_Type": "Vial",
    "Fill_Volume_per_Unit_mL": "2",
    "Units_per_Kit": "1",

    "Patients_Per_Year_Launch": "50",
    "Patients_Per_Year_Peak": "200",

    "Vector_Yield_vg_per_Batch": "5e16",
    "Vector_Concentration_vg_per_mL": "1e13",
    "Process_Type": "Suspension_HEK293_Transient",
    "Bioreactor_Scale_L_per_Batch": "2000",

    "DS_Site": "CDMO_Vector_Site",
    "DP_Site": "CDMO_Fill_Finish_Site",
    "Is_CDMO": "1",
    "Target_Market_Regions": "US_EU",

    # CMC / bottleneck defaults (illustrative)
    "Plasmid_Batches_per_Vector": "3",
    "Plasmid_Supply_Lead_Time_Weeks": "12",
    "Plasmid_Batch_Cost_USD": "200000",
    "Critical_Raw_Material_Lead_Time_Weeks": "10",

    "Master_Cell_Bank_Lead_Time_Weeks": "16",
    "Working_Cell_Bank_Lead_Time_Weeks": "8",

    "Release_Testing_Cycle_Time_Weeks": "6",
    "Sterility_Test_Duration_Days": "14",
    "QC_Assay_Panel_Cost_per_Batch_USD": "150000",
    "Max_Concurrent_Batches_In_Testing": "5",
    "Max_DS_Lots_In_Storage": "10",

    "Stability_Study_Cost_per_Year_USD": "250000",
    "Stability_Sample_Commitment_Per_Batch_Units": "50",
    "Registration_Stability_Duration_Months": "24",

    "Fill_Finish_Line_Max_Units_per_Day": "5000",
    "Changeover_Time_Days": "2",
    "Minimum_Batch_Size_Units": "500",

    # Analytics/QC detail defaults
    "Potency_Assay_Type": "Cell_Based",
    "Potency_Assay_Turnaround_Days": "14",
    "Identity_Method": "Sequencing",
    "Capsid_Titer_Method": "ELISA",
    "Empty_Full_Method": "AEX_HPLC",
    "Residual_DNA_Method": "qPCR",
    "Residual_Protein_Method": "ELISA",
    "Endotoxin_Method": "LAL",
    "Endotoxin_Spec_EU_per_mL": "5",
    "Vector_Genome_Release_Spec_vg_per_mL": "5e12",
    "Sterility_Method": "Compendial_14_day",

    # Supply chain / cold chain defaults
    "Storage_Temperature_C": "-80",
    "Shipping_Temperature_Range_C": "-90_to_-60",
    "Max_Time_Out_of_Storage_Hours": "4",
    "Uses_Single_Use_Bags": "0",
    "Shipping_Packaging_Type": "Dry_Ice",
}

CMC_MFG_PATTERN = """
You are modeling the FULL CMC AND manufacturing program for a
GENE THERAPY product based on a vector (typically viral, e.g., AAV or LV).

The program normally includes:
  - Vector Drug Substance (DS): upstream + downstream + bulk drug substance release
  - Drug Product (DP): formulation, filtration, fill-finish, DP release
  - CMC elements: process characterization, comparability, stability, analytics/QC
  - Rate- and cost-limiting steps such as plasmid supply, cell banks, analytics, stability,
    fill-finish capacity, and release testing.

You MUST parse the USER SCENARIO carefully and, whenever possible, translate
explicit user statements into structured CMC assumptions. Examples:
  - If the user specifies "three AAV8 vectors", create labels such as:
      Number_of_Vectors, Serotype_or_Capsid, Vectors_Requested_Total_vg, etc.
  - If they specify "1×10^15 vg each", use that for total vg demand assumptions.
  - If they mention "residual solvent and detergent analysis", include explicit QC labels
    for these tests in the analytics/QC section.
  - If they mention "complete QC release testing", include a composite
    QC_Assay_Panel_Cost_per_Batch_USD and relevant assay type labels.

Typical sections you are implicitly modeling:

1) PRODUCT & FACILITY
   - Product_Name, Modality (AAV, LV, non_viral)
   - Vector_Type, Serotype_or_Capsid, Transgene_Name, Indication, Clinical_Phase
   - Route_of_Administration, Regimen_Type, Number_of_Doses_per_Patient, Dose_Interval_Weeks
   - Dosing_Unit (vg_kg, vg_eye, vg_patient)
   - DS_Site, DP_Site, Is_CDMO (0–1)
   - Facility_Class (e.g., Grade B/A suites, ISO classifications)
   - Fill_Finish_Line_Type (vials, prefilled_syringes, cartridges)
   - Target_Market_Regions (e.g., US, EU, ROW)

2) PROCESS & SCALE (VECTOR DS AND DP)
   - Process_Type (e.g., suspension_HEK293_transient, stable_producer_cell_line,
     adherent_HEK, LV_producer_cells, non_viral_plasmid_only)
   - Bioreactor_Scale_L_per_Batch
   - Vector_Yield_vg_per_Batch
   - Vector_Concentration_vg_per_mL
   - Fill_Volume_per_Unit_mL
   - Units_per_Patient, Units_per_Kit
   - Batches_per_Year_Planned, Max_Batches_per_Year
   - Yield_Loss_Fraction (0–1) including fills, filtration, holds
   - Changeover_Time_Days, Cleaning_Method (CIP/SIP, manual, single_use)

3) DEMAND & SUPPLY STRATEGY
   - Launch_Year, Peak_Year
   - Patients_Per_Year_Launch, Patients_Per_Year_Peak
   - Dose_Per_Patient_vg_kg (or equivalent)
   - Launch_Year_Demand_Units, Peak_Year_Demand_Units (units = vials/syringes)
   - Safety_Stock_Months, Minimum_Batch_Size_Units
   - Clinical_Supply_Required_Units (if applicable)
   - DS_DP_Supply_Strategy (e.g., "make_to_stock", "make_to_order", "hybrid")
   - Bridging_from_Clinical_to_Commercial (yes/no, high level)

4) CMC BOTTLENECKS (RATE- AND COST-LIMITING)
   - Plasmid_Batches_per_Vector, Plasmid_Supply_Lead_Time_Weeks, Plasmid_Batch_Cost_USD
   - Critical_Raw_Material_Lead_Time_Weeks
   - Master_Cell_Bank_Lead_Time_Weeks, Working_Cell_Bank_Lead_Time_Weeks
   - Release_Testing_Cycle_Time_Weeks, Sterility_Test_Duration_Days
   - QC_Assay_Panel_Cost_per_Batch_USD
   - Stability_Study_Cost_per_Year_USD, Stability_Sample_Commitment_Per_Batch_Units,
     Registration_Stability_Duration_Months
   - Fill_Finish_Line_Max_Units_per_Day
   - Max_Concurrent_Batches_In_Testing, Max_DS_Lots_In_Storage

5) ANALYTICS / QC DETAIL
   - Potency_Assay_Type, Potency_Assay_Turnaround_Days
   - Identity_Method
   - Capsid_Titer_Method, Empty_Full_Method
   - Residual_DNA_Method, Residual_Protein_Method
   - Endotoxin_Method, Endotoxin_Spec_EU_per_mL
   - Vector_Genome_Release_Spec_vg_per_mL
   - Sterility_Method
   - Any explicit tests mentioned by the user (e.g., "residual solvent and detergent")

6) SUPPLY CHAIN & COLD CHAIN
   - Storage_Temperature_C
   - Shipping_Temperature_Range_C
   - Max_Time_Out_of_Storage_Hours
   - Uses_Single_Use_Bags
   - Shipping_Packaging_Type

7) TIMELINES & MILESTONES
   - Tech_Transfer_Start_Quarter, PPQ_Start_Quarter
   - PPQ_Batches, PPQ_Duration_Weeks
   - Validation_Report_Lead_Time_Weeks
   - First_Commercial_Batch_Quarter
   - Shelf_Life_Months, Retest_Period_Months (for DS at frozen storage)
   - QA_Release_Time_Weeks_per_Batch
   - Regulatory_Submission_Quarter, Approval_Quarter

8) FINANCIALS (BUDGET INPUTS)
   - Tech_Transfer_Fee_USD
   - PPQ_Batch_Cost_USD
   - Commercial_Batch_Cost_USD
   - Annual_Facility_Fee_USD
   - CDMO_Setup_Fee_USD
   - CDMO_Minimum_Annual_Spend_USD
   - QA_QC_Cost_per_Batch_USD
   - Stability_Study_Cost_per_Year_USD
   - Vector_Analytics_Panel_Cost_per_Batch_USD (if applicable)

9) PAYMENT TERMS & RISK
   - Payment_On_Contract_Signature_Pct
   - Payment_On_Tech_Transfer_Completion_Pct
   - Payment_On_PPQ_Completion_Pct
   - Payment_On_Commercial_Batch_Release_Pct
   - Cancellation_Fee_Rate (0–1)
   - Rush_Order_Premium_Rate (0–1)
   - Contingency_Buffer_Pct (0–1) for budget and schedule slippage
"""


TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for CMC OPERATING assumptions for a
GENE THERAPY program (vector DS, DP, or both), potentially at a CDMO/CMO.

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
- Cover the ENTIRE CMC LIFECYCLE, not just manufacturing:
  * Upstream & downstream DS manufacturing.
  * DP formulation & fill-finish.
  * Analytics/QC (release panel, compendial tests, sterility, potency, identity, safety).
  * Stability program (registration and ongoing).
  * Comparability & process characterization at late stage.
- Focus on OPERATIONS, FINANCIALS, TIMELINES, and RATE-/COST-LIMITING STEPS:
  * demand and supply strategy (patients/year, doses/patient, units/year),
  * capacity and throughput (batches/year, vector yield per batch, units per batch),
  * headcount and overhead (Manufacturing_FTEs, QA_QC_FTEs, Engineering_FTEs, Regulatory_CMC_FTEs),
  * CMC bottlenecks (plasmid supply, cell banks, analytics capacity, stability sample burn, fill-finish),
  * unit economics (variable cost per batch, QA/QC per batch, facility fees),
  * key milestones and timelines (tech transfer, PPQ, validation, first commercial batch).
- You MUST derive prompt-specific labels whenever the user gives concrete detail.
  Examples:
    - If the user specifies a serotype (e.g., AAV8) or vector count, include that explicitly.
    - If they specify total vg (e.g., 1×10^15 vg), include total vg / batch or per vector.
    - If they mention specific QC tests (e.g., residual solvent/detergent), ensure they appear
      in 'must_include' for Analytics/QC.
- Example modules (you MAY rename them):
  * Demand_and_Supply,
  * Vector_DS_Manufacturing,
  * DP_Formulation_and_Fill_Finish,
  * Plasmids_and_Cell_Banks,
  * Analytics_QC_and_Release,
  * Stability_and_Staging,
  * Supply_Chain_and_Cold_Chain,
  * Timelines_and_Milestones,
  * Financials_and_Terms.
- 'must_include' labels must be unique within each module and machine-friendly
  (snake_case or Title_Case).
- Encourage labels that mirror a CMC / manufacturing agreement structure:
  product & facility, process & scale (DS & DP), CMC bottlenecks, timelines,
  financial terms, risk/contingency.
- Do NOT include formulas or commentary in labels; these are just label names.
"""


def build_taxonomy(
    user_prompt: str,
    *,
    model: str,
    temperature: float,
    use_case_hint: Optional[str]
) -> Dict[str, Any]:
    system = "You are a domain taxonomy builder for CMC OPERATING assumptions and capacity planning. You output valid JSON."
    hint = f"\nHint use_case: {use_case_hint}\n" if (use_case_hint or "").strip() else ""
    user = f"""{TAXONOMY_INSTRUCTIONS}

User scenario:
{user_prompt.strip()}

{hint}
"""
    works.msg("🧭 inferring CMC operating taxonomy from prompt…")
    txt = _chat_call(model=model, system=system, user=user, temperature=temperature, json_mode=True, max_tokens=2000)
    try:
        data = json.loads(txt)
    except Exception:
        data = json.loads(_extract_json_snippet(txt))
    data.setdefault("use_case", "cmc_operations")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data


ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column 'CMC_Assumptions' table for an OPERATING, BUDGET,
and TIMELINE model covering the FULL CMC + GENE THERAPY manufacturing program
(vector DS, DP, and CMC bottlenecks).

CRITICAL: You MUST read the user scenario carefully and:
  - Extract all explicit numerical or categorical details (serotype, dose, vector genomes,
    number of vectors, requested quantity, QC tests, sites, phase, etc.).
  - Reflect those details as first-class labels and values in the output assumptions.
  - If information is missing, fill with realistic defaults consistent with a reasonable
    late-stage gene therapy program, but do NOT contradict explicit user statements.

CONTEXT (prompt-derived):
- use_case: {use_case}
- modules: {modules_json}
- global_must_include: {global_must_include}

UNIVERSAL_CMC_OPERATING_SCAFFOLD (always include; fill sensible defaults if user didn't specify):
{universal_scaffold}

GENE_THERAPY_SCAFFOLD (layered on top of universal scaffold; gene therapy–specific):
{gene_therapy_scaffold}

CMC_RATE_LIMITING_SCAFFOLD (rate- and cost-limiting CMC bottlenecks):
{cmc_rate_limiting_scaffold}

ANALYTICS_QC_DETAIL_SCAFFOLD (assay-level detail):
{analytics_qc_scaffold}

SUPPLY_CHAIN_SCAFFOLD (cold-chain & logistics):
{sup_chain_scaffold}

CMC_MFG_PATTERN (structure of a typical FULL CMC + GENE THERAPY / CDMO agreement):
{cmc_mfg_pattern}

Return STRICT JSON with this EXACT schema:
{{
  "assumptions": [
    {{"label": "Currency", "value": "USD"}},
    {{"label": "Period_Unit", "value": "month"}}
  ]
}}

Rules:
- 'assumptions' is a list of objects with 'label' (string) and 'value' (string or number).
- Include 20–40 rows TOTAL, derived from:
    * the user prompt (highest priority: prompt-specific details),
    * the universal CMC operating scaffold,
    * the gene therapy scaffold,
    * the CMC rate-limiting scaffold,
    * the analytics/QC detail scaffold,
    * the supply chain scaffold,
    * and the CMC_MFG_PATTERN.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.

Prioritize three buckets of OPERATING inputs:

1) PROMPT-SPECIFIC CMC DETAILS
   - Any explicit numbers or constraints in the user scenario
     (e.g., "three AAV8 vectors", "1×10^15 vg each", "residual solvent and detergent analysis").
   - Translate these to clear labels such as:
       Number_of_Vectors,
       Serotype_or_Capsid,
       Total_Vg_Requested_per_Vector,
       Residual_Solvent_Test_Required,
       Residual_Detergent_Test_Required,
       etc.

2) UNIVERSAL CMC OPERATIONS + CMC BOTTLENECKS
   - Manufacturing_FTEs, QA_QC_FTEs, Engineering_FTEs, Regulatory_CMC_FTEs
   - Hours_per_FTE_per_Week, Average_Hourly_Rate_USD, Average_Utilization_Rate (0–1)
   - Annual_Batches, Annual_Volume_Units
   - Vector_Yield_vg_per_Batch, Vector_Concentration_vg_per_mL
   - Plasmid_Batches_per_Vector, Plasmid_Supply_Lead_Time_Weeks, Plasmid_Batch_Cost_USD
   - Release_Testing_Cycle_Time_Weeks, Sterility_Test_Duration_Days
   - QC_Assay_Panel_Cost_per_Batch_USD
   - Fill_Finish_Line_Max_Units_per_Day, Changeover_Time_Days
   - Stability_Study_Cost_per_Year_USD, Storage_Temperature_C, Shipping_Temperature_Range_C

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
    system = "You are a careful CMC OPERATIONS modeling assistant. You STRICTLY follow output schemas."

    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        use_case=taxonomy.get("use_case", "cmc_operations"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_CMC_OPERATING_SCAFFOLD, ensure_ascii=False, indent=2),
        gene_therapy_scaffold=json.dumps(GENE_THERAPY_SCAFFOLD, ensure_ascii=False, indent=2),
        cmc_rate_limiting_scaffold=json.dumps(CMC_RATE_LIMITING_SCAFFOLD, ensure_ascii=False, indent=2),
        analytics_qc_scaffold=json.dumps(ANALYTICS_QC_DETAIL_SCAFFOLD, ensure_ascii=False, indent=2),
        sup_chain_scaffold=json.dumps(SUPPLY_CHAIN_SCAFFOLD, ensure_ascii=False, indent=2),
        cmc_mfg_pattern=CMC_MFG_PATTERN.strip(),
        user_prompt=user_prompt.strip() if user_prompt else ""
    )

    works.msg("🔒 requesting JSON CMC operating assumptions from GPT…")
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

    # Backfill all scaffolds + timelines if missing
    all_scaffold_labels = (
        UNIVERSAL_CMC_OPERATING_SCAFFOLD
        + GENE_THERAPY_SCAFFOLD
        + CMC_RATE_LIMITING_SCAFFOLD
        + ANALYTICS_QC_DETAIL_SCAFFOLD
        + SUPPLY_CHAIN_SCAFFOLD
        + TIMELINE_MILESTONE_SCAFFOLD
    )

    for req in all_scaffold_labels:
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

    # Hard cap on number of assumptions (expanded)
    MAX_ASSUMPTIONS = 40

    # Always prioritize prompt-specific + scaffold + timeline/milestone labels
    preferred_order = [
        _sanitize_label(lab)
        for lab in all_scaffold_labels
    ]

    by_label = {row["label"]: row["value"] for row in out}
    final_rows: List[Dict[str, str]] = []
    used = set()

    # 1) Add scaffold labels first (universal + gene therapy + bottlenecks + analytics + supply chain + milestones)
    for lab in preferred_order:
        if lab in by_label and len(final_rows) < MAX_ASSUMPTIONS:
            final_rows.append({"label": lab, "value": by_label[lab]})
            used.add(lab)

    # 2) Fill remaining slots with any other CMC labels, including prompt-specific ones
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
        elif "vector_yield_vg_per_batch" in l:
            units[table_name][lab] = "vg/batch"
        elif "vector_concentration_vg_per_ml" in l:
            units[table_name][lab] = "vg/mL"
        elif "dose_per_patient_vg_kg" in l:
            units[table_name][lab] = "vg/kg"
        elif "temperature_c" in l:
            units[table_name][lab] = "°C"
        elif "time_out_of_storage" in l:
            units[table_name][lab] = "hours"
        else:
            units[table_name][lab] = "unitless"
    return units


# ---------- Orchestrator ----------
def run_cmc_assumptions_only(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    use_case_hint: Optional[str] = None
) -> Dict[str, Any]:
    works.msg("🧠 CMC operating assumptions pipeline starting…")
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
        works.msg("⚠️ LLM returned no rows; emitting header-only CMC_Assumptions table.")
    tables = to_two_col_table("CMC_Assumptions", rows)

    raw_formulas: Dict[str, str] = {}
    formulas = _scrub_all_formulas(raw_formulas)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": formulas,
        "annotations": {
            "CMC_Assumptions": (
                "CMC operating, financial, timeline, and bottleneck defaults inferred from user prompt via GPT "
                f"(two-column table). use_case={taxonomy.get('use_case','cmc_operations')}"
            )
        },
        "units": infer_units("CMC_Assumptions", rows) if rows else {"CMC_Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_CMC_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "cmc_operations"),
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
        artifact = run_cmc_assumptions_only(
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
            "where": "cmc-assumptions-only",
        })
        return 1


# bootstrap
if __name__ == "__main__":
    works.msg("🔧 loading FULL CMC + gene-therapy operating assumptions-only builder (prompt-driven, expanded)…")
    _main_ion("gpt-4o-mini")
