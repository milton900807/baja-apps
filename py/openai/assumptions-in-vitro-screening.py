#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import math

"""
Operating assumptions-only builder (Ion Works entry/exit), generalized & prompt-driven,
for CRO-led in vitro RNA-target screening (design → synthesis → screens → sequencing).

What it does
------------
• Builds a domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT (no hardcoded library).
• Assumes the user is running in vitro RNA-target screening at / with a CRO and biases assumptions accordingly.
• Calls GPT to infer sensible default OPERATING assumptions using that taxonomy PLUS:
      - a universal operating scaffold (FTEs, capacity, utilization, unit costs)
      - an RNA-target screening–specific scaffold
      - a qPCR / screening workflow scaffold (plate layout + per-step cost/plate,
        including primer–probe design & validation)
      - a CRO RNA-screening SOW (Statement of Work) structural pattern
• Applies deterministic timing logic:
      - Base screen duration ≈ 4 weeks.
      - If cell line implies neurons/muscle (requiring culturing), add +4 weeks.
      - Up-regulation assay design/synthesis is ~2× as long as downregulation,
        but total design time is always ≤ 1 week.
      - Cell culture setup time:
            • Off-the-shelf lines → 0 weeks
            • CRISPR-edited / specific mutation lines → ~4 weeks
            • iPSC differentiation → ~12 weeks
• Enforces cost constraints:
      - Primary_Screen_Cost_per_Compound_USD is never > 55 USD.
      - Dose_Response_Cost_per_Compound_USD is always ¾ of primary cost.
• Returns ONLY a single two-column 'InVitro_Screen_Assumptions' table:
      InVitro_Screen_Assumptions[0:0][0:0] = "Label"
      InVitro_Screen_Assumptions[1:1][0:0] = "Value"
      InVitro_Screen_Assumptions[0:0][r:r] = <label>
      InVitro_Screen_Assumptions[1:1][r:r] = <value>
• No formulas, just tables (+ minimal annotations/units for completeness).
• Uses Ion Works for entry (msg) and exit (resolve).

Ion params
----------
param(1) = user prompt (required)
param(2) = model (optional; default "gpt-4o-mini")
param(3) = temperature (optional; default 0.2)
param(4) = use_case hint (optional; free-text hint, e.g.,
           "in vitro RNA-target screen with CRO",
           "AAV-delivered antisense screening in neuronal cells", etc.)
"""

import os
import json
import re
from typing import Dict, List, Tuple, Optional, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---- Table name constant ----
TABLE_NAME = "InVitro_Screen_Assumptions"

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


# ---------- formula scrubbers (for insignificant operations) ----------

def _scrub_formula(formula: str) -> str:
    """
    Scrub insignificant operations from a single formula string.

    Current rules:
      - Remove a leading '0+' immediately after '=': '=0+...' -> '=...'
      - Replace any '1^0' with '1' (neutral power operation).
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
    """
    Apply _scrub_formula to all formulas in the dict.
    """
    if not isinstance(formulas, dict):
        return formulas
    return {k: _scrub_formula(v) for k, v in formulas.items()}


# ---------- Universal operating scaffold (10 params) ----------
UNIVERSAL_SCAFFOLD = [
    "Currency",
    "Period_Unit",                  # e.g., "month", "week"
    "Duration_Periods",             # e.g., 12 months, 52 weeks
    "FTE_Total",
    "FTE_Operations",
    "FTE_Scientific",               # or technical / production staff
    "Hours_per_FTE_per_Week",
    "Average_Utilization_Rate",     # 0–1
    "Capacity_Units_per_Period",    # generic throughput descriptor
    "Variable_Cost_per_Unit",
]

# ---------- RNA-target screening–specific scaffold ----------
RNA_SCREENING_SCAFFOLD = [
    "Screening_Modality",                         # e.g., "antisense", "siRNA", "shRNA", "CRISPRi"
    "Screening_Target_Type",                      # e.g., "RNA", "lncRNA", "splice_isoform"
    "Number_of_Screening_Compounds",              # e.g., 10–1000
    "Compounds_Per_96_Well_Plate",                # usually 96 minus controls
    "Research_Grade_Synthesis_Cost_per_96_Well_Plate_USD",
    "Design_Cost_per_Program_USD",
    "Primary_Screen_Cost_per_Compound_USD",
    "Dose_Response_Cost_per_Compound_USD",
    "Cell_Line_Type",                             # e.g., "HEK293", "iPSC-derived_neuron", "myotube"
    "Neuron_or_Muscle_Cell_Cost_Multiplier",      # cost multiplier vs baseline cells
    "Cell_Culture_Cost_per_Assay_Plate_USD",
    "Short_Read_Sequencing_Costs_per_Sample_USD",
    "Long_Read_Sequencing_Costs_per_Sample_USD",
    "Baseline_Sequencing_Depth_Million_Reads",
    "Number_of_Cell_Lines_Sequenced",
    "Number_of_Targets_Sequenced",
]

# ---------- qPCR / screening workflow scaffold ----------
# Includes primer–probe assay design & validation costs.
QPCR_WORKFLOW_SCAFFOLD = [
    # Plate / layout parameters
    "Plates_per_Screen",
    "Wells_per_Plate",
    "Technical_Replicates_per_Condition",
    "Biological_Replicates_per_Condition",
    "Controls_per_Plate",

    # Primer–probe design & validation
    "qPCR_Primer_Probe_Assay_Design_Cost_per_Target_USD",
    "qPCR_Primer_Probe_Assay_Validation_Cost_per_Target_USD",

    # Step 1–2: assay / primer design & validation (program-level + per-target)
    "Assay_Design_and_Experimental_Planning_Cost_per_Program_USD",
    "qPCR_Assay_Validation_Cost_per_Target_USD",

    # Step 3: cell treatment / sample prep
    "Cell_Seeding_Cost_per_Plate_USD",
    "Treatment_and_Compound_Addition_Cost_per_Plate_USD",

    # Step 4: RNA isolation & QC
    "RNA_Isolation_Cost_per_Plate_USD",
    "RNA_QC_Cost_per_Plate_USD",

    # Step 5: cDNA synthesis
    "cDNA_Synthesis_Cost_per_Plate_USD",

    # Step 6–7: qPCR reagents & instrument time
    "qPCR_Reagents_Cost_per_Plate_USD",
    "qPCR_Run_and_Instrument_Time_Cost_per_Plate_USD",

    # Step 8–9: data analysis & decision layer
    "Primary_Data_Analysis_Cost_per_Plate_USD",
    "Screening_Decision_and_Reporting_Cost_per_Program_USD",
]

DEFAULTS: Dict[str, str] = {
    # Universal ops
    "Currency": "USD",
    "Period_Unit": "month",
    "Duration_Periods": "12",
    "FTE_Total": "5",
    "FTE_Operations": "2",
    "FTE_Scientific": "3",
    "Hours_per_FTE_per_Week": "40",
    "Average_Utilization_Rate": "0.75",
    "Capacity_Units_per_Period": "1000",
    "Variable_Cost_per_Unit": "10",

    # RNA screening defaults (can be overridden by LLM or user)
    "Screening_Modality": "antisense",
    "Screening_Target_Type": "RNA",
    "Number_of_Screening_Compounds": "100",
    "Compounds_Per_96_Well_Plate": "80",  # rest for controls
    "Research_Grade_Synthesis_Cost_per_96_Well_Plate_USD": "15000",
    "Design_Cost_per_Program_USD": "25000",
    "Primary_Screen_Cost_per_Compound_USD": "50",   # capped at 55 later
    "Dose_Response_Cost_per_Compound_USD": "30",    # will be overwritten as 0.75 * primary
    "Cell_Line_Type": "HEK293",
    "Neuron_or_Muscle_Cell_Cost_Multiplier": "5",
    "Cell_Culture_Cost_per_Assay_Plate_USD": "500",
    "Short_Read_Sequencing_Costs_per_Sample_USD": "800",
    "Long_Read_Sequencing_Costs_per_Sample_USD": "2500",
    "Baseline_Sequencing_Depth_Million_Reads": "30",
    "Number_of_Cell_Lines_Sequenced": "2",
    "Number_of_Targets_Sequenced": "1",

    # qPCR / screening workflow defaults (per-plate / per-program costs)
    "Plates_per_Screen": "10",
    "Wells_per_Plate": "96",
    "Technical_Replicates_per_Condition": "3",
    "Biological_Replicates_per_Condition": "3",
    "Controls_per_Plate": "16",

    # Primer–probe design & validation
    "qPCR_Primer_Probe_Assay_Design_Cost_per_Target_USD": "1500",
    "qPCR_Primer_Probe_Assay_Validation_Cost_per_Target_USD": "2000",

    "Assay_Design_and_Experimental_Planning_Cost_per_Program_USD": "15000",
    "qPCR_Assay_Validation_Cost_per_Target_USD": "2000",

    "Cell_Seeding_Cost_per_Plate_USD": "150",
    "Treatment_and_Compound_Addition_Cost_per_Plate_USD": "200",

    "RNA_Isolation_Cost_per_Plate_USD": "250",
    "RNA_QC_Cost_per_Plate_USD": "150",

    "cDNA_Synthesis_Cost_per_Plate_USD": "300",

    "qPCR_Reagents_Cost_per_Plate_USD": "400",
    "qPCR_Run_and_Instrument_Time_Cost_per_Plate_USD": "300",

    "Primary_Data_Analysis_Cost_per_Plate_USD": "250",
    "Screening_Decision_and_Reporting_Cost_per_Program_USD": "10000",
}

# ---------- CRO / RNA-screening SOW structural scaffold ----------
CRO_SOW_PATTERN = """
You are modeling an in vitro RNA-target screening program outsourced to a CRO.
The CRO runs assays such as antisense, siRNA, CRISPRi, or other RNA-modulating
libraries against a target of interest, with follow-up sequencing.

Use a CRO Statement of Work (SOW) for RNA-target screening as your mental template.
Typical sections include:

1) COMMERCIAL / CONTRACT
   - CRO_Name, CRO_Facility
   - Program_Title, Screening_Modality, Screening_Target_Type
   - Study_Scope_Description (e.g., "in vitro antisense screen in neuronal cells")
   - Design_Cost_per_Program_USD
   - Research_Grade_Synthesis_Cost_per_96_Well_Plate_USD
   - qPCR_Primer_Probe_Assay_Design_Cost_per_Target_USD
   - qPCR_Primer_Probe_Assay_Validation_Cost_per_Target_USD
   - Primary_Screen_Cost_per_Compound_USD
   - Dose_Response_Cost_per_Compound_USD
   - Cell_Culture_Cost_per_Assay_Plate_USD
   - Short_Read_Sequencing_Costs_per_Sample_USD
   - Long_Read_Sequencing_Costs_per_Sample_USD
   - Payment milestones (e.g., Payment_On_Signature_Pct,
     Payment_On_Screen_Completion_Pct, Payment_On_Sequencing_Data_Delivery_Pct,
     Payment_On_Final_Report_Pct)
   - Cancellation_Fee_Rate, Postponement_Fee_Rate

2) SCREENING DESIGN
   - Number_of_Screening_Compounds (10–1000 range)
   - Compounds_Per_96_Well_Plate
   - Number_of_Plates_Primary_Screen
   - Number_of_Plates_Dose_Response
   - Hits_Advanced_to_Dose_Response
   - Replicates_per_Condition
   - Controls_per_Plate

3) CELL LINE AND CELL CULTURE
   - Cell_Line_Type (e.g., HEK293, iPSC-derived_neuron, skeletal_myotube)
   - Neuron_or_Muscle_Cell_Cost_Multiplier (multiplier vs baseline cells)
   - Cell_Culture_Cost_per_Assay_Plate_USD
   - Cell_Bank_Setup_Cost_USD
   - Differentiation_Protocol_Costs_USD (if iPSC-derived neurons or myotubes)

4) SEQUENCING & MOLECULAR READOUT
   - Number_of_Cell_Lines_Sequenced
   - Number_of_Targets_Sequenced
   - Short_Read_Sequencing_Costs_per_Sample_USD
   - Long_Read_Sequencing_Costs_per_Sample_USD
   - Baseline_Sequencing_Depth_Million_Reads
   - Number_of_Sequencing_Samples_Primary_Screen
   - Number_of_Sequencing_Samples_Dose_Response

5) OPERATIONS / TIMELINES
   - Project_Start_Quarter
   - Design_and_Synthesis_Duration_Days
   - Primary_Screen_Duration_Weeks
   - Dose_Response_Duration_Weeks
   - Sequencing_and_Analysis_Duration_Weeks
   - Data_Delivery_Weeks_from_Study_Start
   - Final_Report_Weeks_from_Study_Start

6) RISK / CHANGE ORDERS
   - Assumed_Protocol_Amendment_Rate
   - Expected_Repeat_Assay_Rate
   - Contingency_Buffer_Pct (for repeat plates, extra sequencing, etc.)

The key rate- and cost-limiting steps are typically:
   - Research-grade synthesis of screening compounds (10–1000 compounds range)
   - Primer–probe assay design and validation for qPCR
   - Culture of complex cell types (neurons, muscle) with higher per-plate costs
   - Sequencing (especially long-read sequencing for target / isoform characterization)
"""

# ---------- qPCR workflow description ----------
QPCR_WORKFLOW_DESCRIPTION = """
Major qPCR / RNA-screening steps for cost modeling:

1) Define assay and experimental design:
   - Clarify biological question, readout (Ct, ΔΔCt, fold change, IC50/EC50).
   - Choose assay format (relative vs absolute quantification).
   - Define controls (vehicle, positive, NTC, no-RT) and plate layout
     (replicates, controls per plate, standard curve wells).

2) Design and validate qPCR assays:
   - Select targets and housekeeping genes.
   - Design primers/probes (amplicon length, exon–exon spanning, Tm).
   - Estimate qPCR_Primer_Probe_Assay_Design_Cost_per_Target_USD.
   - Perform small-scale validation (efficiency, R², melt curve, gel).
   - Estimate qPCR_Primer_Probe_Assay_Validation_Cost_per_Target_USD
     and/or qPCR_Assay_Validation_Cost_per_Target_USD.

3) Cell treatment / sample prep:
   - Choose cell model and seeding density.
   - Dose with compounds (single concentration or dose–response).
   - Harvest or lyse cells at defined timepoints.

4) RNA isolation and QC:
   - Plate- or column-based RNA extraction.
   - Optional DNase treatment, NanoDrop / plate reader QC,
     representative RIN or integrity checks.

5) cDNA synthesis:
   - Reverse transcription with chosen priming strategy.
   - Include RT– controls for representative samples.

6) qPCR reaction setup:
   - Prepare master mix, add primers/probes and cDNA.
   - Include NTCs, standard curve, RT– control wells.

7) qPCR cycling and data acquisition:
   - Run instrument with validated cycling protocol.
   - Include melt curve for SYBR assays.

8) Primary data analysis:
   - QC amplification curves and melt curves.
   - Compute Ct, ΔCt, ΔΔCt, fold change and aggregate replicates.

9) Screening decision layer:
   - Define hit criteria (fold-change, stats, toxicity).
   - Rank and filter compounds, normalize across plates, generate reports.

10) Confirmation and follow-up:
   - Retest hits in independent runs.
   - Orthogonal validation at protein / functional level.
"""

# ---------- Phase 1: Build taxonomy from prompt ----------

TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for OPERATING assumptions for an in vitro
RNA-target screening program that is at least partly outsourced to a
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
- Focus on OPERATIONS and SCREENING DESIGN for a CRO RNA-target screen:
  * Number_of_Screening_Compounds (10–1000 range),
    Compounds_Per_96_Well_Plate, plates needed.
  * Research-grade synthesis costs (Research_Grade_Synthesis_Cost_per_96_Well_Plate_USD).
  * Design_Cost_per_Program_USD and per-compound screen/dose-response costs.
  * Primer–probe assay design & validation costs:
    qPCR_Primer_Probe_Assay_Design_Cost_per_Target_USD,
    qPCR_Primer_Probe_Assay_Validation_Cost_per_Target_USD,
    qPCR_Assay_Validation_Cost_per_Target_USD.
  * Cell culture intensity and cost, especially for neuronal / muscle cells:
    Cell_Line_Type, Neuron_or_Muscle_Cell_Cost_Multiplier, Cell_Culture_Cost_per_Assay_Plate_USD.
  * Sequencing of cell lines and target(s), including potential long-read sequencing:
    Short_Read_Sequencing_Costs_per_Sample_USD,
    Long_Read_Sequencing_Costs_per_Sample_USD,
    Number_of_Cell_Lines_Sequenced, Number_of_Targets_Sequenced.
  * Sponsor FTEs (FTE_Scientific, FTE_Operations) and high-level throughput.
  * CRO commercial terms (design fees, per-plate / per-compound costs, payment milestones, cancellation risk).
- Example modules (you MAY rename them): RNA_Target_Design, Research_Grade_Synthesis,
  Primary_Screen, Dose_Response, Cell_Culture_and_Cell_Lines, Sequencing_and_Molecular_Readout,
  CRO_Commercial_Terms, Sponsor_Headcount_and_Ops.
- 'must_include' labels must be unique within each module and machine-friendly
  (snake_case or Title_Case).
- Encourage labels that mirror a CRO RNA-screening SOW structure and highlight rate-
  and cost-limiting steps (synthesis, primer–probe design/validation, complex cell culture, sequencing).
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
    data.setdefault("use_case", "rna_target_screening")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data


# ---------- Phase 2: Generate assumptions using taxonomy + scaffold ----------

ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column '{table_name}' table for an OPERATING model
for an in vitro RNA-target screening program outsourced to a CRO
(design → research-grade synthesis → primary screen → dose-response → sequencing → qPCR-based readout).

CONTEXT (prompt-derived):
- use_case: {use_case}
- modules: {modules_json}
- global_must_include: {global_must_include}

UNIVERSAL_OPERATING_SCAFFOLD (always include; fill sensible defaults if user didn't specify):
{universal_scaffold}

RNA_SCREENING_SCAFFOLD (domain-specific knobs for RNA-target screening at a CRO):
{rna_screening_scaffold}

QPCR_WORKFLOW_SCAFFOLD (major screening parameters and cost per plate / program across the qPCR workflow,
including primer–probe assay design and validation costs):
{qpcr_workflow_scaffold}

CRO_SOW_PATTERN (structure of a typical CRO RNA-target screening Statement of Work):
{cro_sow_pattern}

MAJOR_QPCR_SCREENING_STEPS (for context when selecting labels and assigning costs):
{qpcr_workflow_description}

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
    * the RNA_SCREENING_SCAFFOLD,
    * the QPCR_WORKFLOW_SCAFFOLD, and
    * the CRO_SOW_PATTERN.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.

Prioritize three buckets of OPERATING inputs:

1) UNIVERSAL OPERATIONS (always present)
   - FTEs by function (FTE_Operations, FTE_Scientific, FTE_Support if used)
   - Hours_per_FTE_per_Week
   - Average_Utilization_Rate (0–1)
   - Capacity_Units_per_Period (e.g., compounds_screened_per_month, plates_per_month)
   - Variable_Cost_per_Unit

2) RNA SCREENING DESIGN, SYNTHESIS, SCREENS, CELL CULTURE, SEQUENCING, qPCR WORKFLOW
   - Number_of_Screening_Compounds (10–1000)
   - Compounds_Per_96_Well_Plate
   - Research_Grade_Synthesis_Cost_per_96_Well_Plate_USD
   - Design_Cost_per_Program_USD
   - qPCR_Primer_Probe_Assay_Design_Cost_per_Target_USD
   - qPCR_Primer_Probe_Assay_Validation_Cost_per_Target_USD
   - qPCR_Assay_Validation_Cost_per_Target_USD
   - Primary_Screen_Cost_per_Compound_USD
   - Dose_Response_Cost_per_Compound_USD
   - Cell_Line_Type
   - Neuron_or_Muscle_Cell_Cost_Multiplier (>=1; >1 if neuronal/muscle)
   - Cell_Culture_Cost_per_Assay_Plate_USD
   - Short_Read_Sequencing_Costs_per_Sample_USD
   - Long_Read_Sequencing_Costs_per_Sample_USD
   - Number_of_Cell_Lines_Sequenced
   - Number_of_Targets_Sequenced
   - Baseline_Sequencing_Depth_Million_Reads

   In addition, include plate-level and step-level costs for the qPCR workflow:
   - Plates_per_Screen, Wells_per_Plate, Technical_Replicates_per_Condition,
     Biological_Replicates_per_Condition, Controls_per_Plate
   - qPCR_Reagents_Cost_per_Plate_USD
   - qPCR_Run_and_Instrument_Time_Cost_per_Plate_USD
   - RNA_Isolation_Cost_per_Plate_USD
   - RNA_QC_Cost_per_Plate_USD
   - cDNA_Synthesis_Cost_per_Plate_USD
   - Cell_Seeding_Cost_per_Plate_USD
   - Treatment_and_Compound_Addition_Cost_per_Plate_USD
   - Primary_Data_Analysis_Cost_per_Plate_USD
   - Screening_Decision_and_Reporting_Cost_per_Program_USD

3) CRO COMMERCIAL TERMS & RISK
   - Payment_On_Signature_Pct
   - Payment_On_Screen_Completion_Pct
   - Payment_On_Sequencing_Data_Delivery_Pct
   - Payment_On_Final_Report_Pct
   - Cancellation_Fee_Rate (0–1),
     Postponement_Fee_Rate (0–1),
     Contingency_Buffer_Pct (0–1)

Additional rules:
- ALL rates (utilization, hit rates, failure rates, cancellation/postponement,
  buffer percentages, payment percentages) must be 0–1 fractions (not 0–100).
- You MAY include additional labels from the taxonomy if they are clearly relevant to
  in vitro RNA-target screening and qPCR-based assays, but keep the total within 22–32 rows.
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
    system = "You are a careful OPERATIONS modeling assistant for in vitro RNA-target screening. You STRICTLY follow output schemas."

    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        table_name=TABLE_NAME,
        use_case=taxonomy.get("use_case", "rna_target_screening"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_SCAFFOLD, ensure_ascii=False, indent=2),
        rna_screening_scaffold=json.dumps(RNA_SCREENING_SCAFFOLD, ensure_ascii=False, indent=2),
        qpcr_workflow_scaffold=json.dumps(QPCR_WORKFLOW_SCAFFOLD, ensure_ascii=False, indent=2),
        cro_sow_pattern=CRO_SOW_PATTERN.strip(),
        qpcr_workflow_description=QPCR_WORKFLOW_DESCRIPTION.strip(),
        user_prompt=user_prompt.strip() if user_prompt else ""
    )

    works.msg("🔒 requesting JSON operating assumptions from GPT (RNA-target screening)…")
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
    for req in (UNIVERSAL_SCAFFOLD + RNA_SCREENING_SCAFFOLD + QPCR_WORKFLOW_SCAFFOLD):
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

    # ---- Enforce primary screen cost cap: never more than 55 ----
    primary_key = "Primary_Screen_Cost_per_Compound_USD"
    dose_key = "Dose_Response_Cost_per_Compound_USD"

    primary_val = None
    for row in out:
        if row["label"] == primary_key:
            try:
                val = float(row["value"])
                if val > 55.0:
                    val = 55.0
                primary_val = val
                row["value"] = str(int(val)) if val.is_integer() else str(val)
            except Exception:
                pass

    # If primary wasn't present or parseable, fall back to default and cap
    if primary_val is None:
        try:
            val = float(DEFAULTS.get(primary_key, "50"))
            if val > 55.0:
                val = 55.0
            primary_val = val
            out.append({
                "label": primary_key,
                "value": str(int(val)) if val.is_integer() else str(val)
            })
        except Exception:
            primary_val = None

    # ---- Enforce dose-response cost logic: DR = 0.75 * Primary ----
    dose_val = None
    for row in out:
        if row["label"] == dose_key:
            try:
                dose_val = float(row["value"])
            except Exception:
                pass

    if primary_val is not None:
        corrected = primary_val * 0.75
        corrected_str = (
            str(int(corrected))
            if math.isfinite(corrected) and corrected.is_integer()
            else str(corrected)
        )

        if dose_val is None:
            # Add missing row
            out.append({"label": dose_key, "value": corrected_str})
        else:
            # Override existing
            for row in out:
                if row["label"] == dose_key:
                    row["value"] = corrected_str
                    break

    # --- Enforce a hard cap on number of assumptions ---
    MAX_ASSUMPTIONS = 30

    # Prefer scaffold labels first (universal + RNA-screening + qPCR workflow)
    preferred_order = [
        _sanitize_label(lab)
        for lab in (UNIVERSAL_SCAFFOLD + RNA_SCREENING_SCAFFOLD + QPCR_WORKFLOW_SCAFFOLD)
    ]

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

    # Apply deterministic timing logic based on cell line & assay direction & cell source
    final_rows = _apply_timing_logic(final_rows, user_prompt=user_prompt)

    return final_rows


# ---------- Timing logic (cell line, assay direction, cell culture setup) ----------

def _apply_timing_logic(rows: List[Dict[str, str]], user_prompt: str) -> List[Dict[str, str]]:
    """
    Inject/override time-related assumptions based on:
      - Cell_Line_Type (neuronal / muscle → add 4 weeks to primary screen)
      - Assay direction in user prompt (up-regulation → 2x design/synthesis time,
        but capped so design time is never > 1 week)
      - Cell source / culture complexity in user prompt:
          * Off-the-shelf / standard lines → 0 weeks extra setup
          * CRISPR / specific mutation editing → ~4 weeks
          * iPSC differentiation → ~12 weeks

    Adds or updates:
      - Base_Screen_Duration_Weeks (default 4)
      - Primary_Screen_Duration_Weeks (base + neuronal/muscle extra + culture setup)
      - Design_and_Synthesis_Duration_Days ( 1 Day)
      - Assay_Design_Complexity_Factor (1.0 or 2.0)
      - CRISPR_Editing_Duration_Weeks
      - iPSC_Differentiation_Duration_Weeks
      - Cell_Culture_Setup_Duration_Weeks
      - Total_Cell_Culture_and_Setup_Duration_Weeks
    """
    label_to_idx: Dict[str, int] = {r["label"]: i for i, r in enumerate(rows)}

    def get_val(label: str) -> Optional[str]:
        idx = label_to_idx.get(label)
        if idx is None:
            return None
        return str(rows[idx]["value"])

    # --- Determine cell line category (neuronal / muscle flag) ---
    cell_line_raw = get_val("Cell_Line_Type") or ""
    cell_line = cell_line_raw.lower()

    neuron_keywords = [
        "neuron", "neuronal", "motor_neuron", "motor neuron",
        "cortical", "ips", "ipsc", "dopaminergic"
    ]
    muscle_keywords = ["myotube", "myoblast", "muscle", "cardiomyocyte"]

    is_neuronal_or_muscle = any(k in cell_line for k in neuron_keywords + muscle_keywords)

    # --- Determine assay direction from user prompt ---
    prompt_l = (user_prompt or "").lower()

    up_keywords = [
        "upregulation", "up-regulation", "up regulation",
        "activation", "gain-of-function", "gain of function"
    ]
    down_keywords = [
        "downregulation", "down-regulation",
        "knockdown", "silencing", "repression",
        "loss-of-function", "loss of function"
    ]

    is_up = any(k in prompt_l for k in up_keywords)
    is_down = any(k in prompt_l for k in down_keywords)

    complexity_factor = 2.0 if is_up and not is_down else 1.0

    # --- Determine cell source & culture setup complexity from prompt ---
    crispr_keywords = [
        "crispr", "knock-in", "knockin", "knock-out", "knockout",
        "isogenic", "edited line", "engineered mutation", "specific mutation",
        "genome edited", "knock-in mutant", "knock-in variant", "snv", "point mutation"
    ]

    ipsc_keywords = [
        "ipsc", "induced pluripotent", "ipsc-derived", "ipsc derived",
        "pluripotent stem cell", "stem-cell derived", "ipsc motor neuron",
        "ipsc-derived neuron", "ipsc-derived cardiomyocyte"
    ]

    off_the_shelf_keywords = [
        "off-the-shelf", "off the shelf", "ready-made cell line", "vendor cell line"
    ]

    has_crispr = any(k in prompt_l for k in crispr_keywords)
    has_ipsc = any(k in prompt_l for k in ipsc_keywords)
    has_off_the_shelf = any(k in prompt_l for k in off_the_shelf_keywords)

    # Durations (weeks)
    ipsc_weeks = 12.0 if has_ipsc else 0.0
    crispr_weeks = 4.0 if has_crispr else 0.0

    # If explicitly off-the-shelf and no crispr/ipsc, force zero setup weeks
    if has_off_the_shelf and not has_crispr and not has_ipsc:
        crispr_weeks = 0.0
        ipsc_weeks = 0.0

    cell_culture_setup_weeks = crispr_weeks + ipsc_weeks

    # --- Base and neuronal/muscle extras ---
    base_screen_weeks = 4.0           # ~1 month
    extra_cell_weeks = 4.0 if is_neuronal_or_muscle else 0.0

    total_cell_culture_and_setup_weeks = extra_cell_weeks + cell_culture_setup_weeks
    total_primary_screen_weeks = base_screen_weeks + total_cell_culture_and_setup_weeks

    # --- Design / synthesis timing based on assay direction ---
    # Baseline design time is <1 week; up-regulation doubles but is capped at 1 week.
    base_design_weeks = 0.5           # e.g. ~3–4 days
    design_weeks = base_design_weeks * complexity_factor
    if design_weeks > 1.0:
        design_weeks = 1.0

    def set_label(label: str, value: float) -> None:
        if float(value).is_integer():
            s = str(int(value))
        else:
            s = str(value)
        if label in label_to_idx:
            rows[label_to_idx[label]]["value"] = s
        else:
            rows.append({"label": label, "value": s})
            label_to_idx[label] = len(rows) - 1

    # Write the timing assumptions
    set_label("Base_Screen_Duration_Weeks", base_screen_weeks)
    set_label("Primary_Screen_Duration_Weeks", total_primary_screen_weeks)
    set_label("Design_and_Synthesis_Duration_Days", design_weeks)
    set_label("Assay_Design_Complexity_Factor", complexity_factor)

    # Cell culture setup-related labels
    set_label("CRISPR_Editing_Duration_Weeks", crispr_weeks)
    set_label("iPSC_Differentiation_Duration_Weeks", ipsc_weeks)
    set_label("Cell_Culture_Setup_Duration_Weeks", cell_culture_setup_weeks)
    set_label("Total_Cell_Culture_and_Setup_Duration_Weeks", total_cell_culture_and_setup_weeks)

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
        elif l.endswith("_duration_weeks") or "duration_weeks" in l or l.endswith("_screen_duration_weeks"):
            units[table_name][lab] = "weeks"
        elif "fte" in l:
            units[table_name][lab] = "FTE"
        elif "hours_per_fte" in l:
            units[table_name][lab] = "hours/week"
        elif any(k in l for k in ["utilization", "uptime", "rate", "failure", "multiplier", "buffer_pct"]):
            units[table_name][lab] = "fraction"
        elif "capacity_units_per_period" in l:
            units[table_name][lab] = "units/period"
        elif l.endswith("_per_unit") or l.endswith("_usd_per_unit"):
            units[table_name][lab] = "USD/unit"
        elif l.endswith("_usd_per_period"):
            units[table_name][lab] = "USD/period"
        elif "synthesis_cost" in l or "screen_cost" in l or "dose_response_cost" in l:
            units[table_name][lab] = "USD"
        elif "primer_probe_assay_design_cost" in l or "primer_probe_assay_validation_cost" in l:
            units[table_name][lab] = "USD/target"
        elif "sequencing_costs" in l:
            units[table_name][lab] = "USD/sample"
        elif "cell_culture_cost_per_assay_plate" in l:
            units[table_name][lab] = "USD/plate"
        elif l.endswith("_usd"):
            units[table_name][lab] = "USD"
        elif "million_reads" in l:
            units[table_name][lab] = "million_reads"
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
    works.msg("🧠 CRO RNA-target screening operating assumptions pipeline starting…")
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
                "Operating defaults for in vitro RNA-target screening with a CRO, "
                "including qPCR workflow parameters, primer–probe assay design and "
                "validation costs, estimated timelines (screen + design + cell culture "
                "setup), and per-step costs, with cost caps on primary and dose-response "
                "per-compound screening costs, inferred from user prompt via GPT "
                f"(two-column table). use_case={taxonomy.get('use_case','rna_target_screening')}"
            )
        },
        "units": infer_units(TABLE_NAME, rows) if rows else {TABLE_NAME: {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "rna_target_screening"),
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
    works.msg(
        "🔧 loading CRO RNA-target screening operating assumptions-only builder "
        "(generalized, prompt-driven, with qPCR primer–probe design/validation costs, "
        "timing logic, cell-culture setup durations, and screening cost caps)…"
    )
    _main_ion("gpt-4o-mini")
