#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Assumptions-only builder (Ion Works entry/exit), generalized & prompt-driven.

What it does
------------
• Builds a domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT.
• Calls GPT to infer sensible default assumptions using that taxonomy PLUS a contractor-oriented
  therapeutic development scaffold.
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
param(4) = use_case hint (optional; free-text hint, e.g., "therapeutic outsourced development")
"""

import os
import json
import re
from typing import Dict, List, Optional, Any

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
    return s[:80]


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
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
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
    return text[start:end + 1].strip()


# ---------- Universal + contractor-facing scaffold ----------
UNIVERSAL_SCAFFOLD = [
    # Program frame
    "Currency",
    "Program_Name",
    "Start_Date",
    "Start_Year",
    "Start_Month",
    "Duration_Months",
    "Months_in_Year",

    # Commercial / contracting assumptions
    "Vendor_Count",
    "Primary_Contracting_Model",
    "Payment_Terms_Days",
    "Contingency_Rate",
    "Tax_Rate",
    "Discount_Rate",
    "Change_Order_Rate",
    "Program_Management_Fee_Rate",
    "Quality_Oversight_Fee_Rate",
    "Shipping_Logistics_Cost_USD",
    "Tech_Transfer_Cost_USD",
    "Analytical_Method_Transfer_Cost_USD",
    "Regulatory_Writing_Support_Cost_USD",
    "Project_Management_Cadence_Per_Month",
    "Review_Cycle_Days",
    "Annual_Growth_Rate",

    # Discovery cost assumptions
    "Design_Cost_USD",
    "Research_Grade_Synthesis_Cost_USD",
    "Screening_Cost_USD",
    "Dose_Response_Screening_Cost_USD",
    "Protein_Screening_Cost_USD",
    "Immunogenic_Screening_In_Vitro_Cost_USD",

    # IND-enabling cost assumptions
    "GMP_Production_Cost_USD",
    "GLP_In_Vivo_Toxicology_13_Weeks_Cost_USD",
    "Fill_Finish_Cost_USD",
    "IND_Filing_Cost_USD",

    # Required timeline assumptions requested by user
    "Design_Time_Weeks",
    "Research_Grade_Synthesis_Time_Weeks",
    "Screening_Time_Weeks",
    "Dose_Response_Screening_Time_Weeks",
    "Protein_Screening_Time_Weeks",
    "Immunogenic_Screening_In_Vitro_Time_Weeks",
    "Discovery_Subtotal_Time_Weeks",
    "GMP_Production_Time_Weeks",
    "GLP_In_Vivo_Toxicology_13_Weeks_Time_Weeks",
    "Fill_Finish_Time_Weeks",
    "IND_Filing_Time_Weeks",
    "IND_Enabling_Subtotal_Time_Weeks",
]

DEFAULTS: Dict[str, str] = {
    "Currency": "USD",
    "Program_Name": "Therapeutic_Development_Program",
    "Start_Date": "2026-01-01",
    "Start_Year": "2026",
    "Start_Month": "1",
    "Duration_Months": "12",
    "Months_in_Year": "12",

    "Vendor_Count": "3",
    "Primary_Contracting_Model": "Milestone_Based",
    "Payment_Terms_Days": "30",
    "Contingency_Rate": "0.10",
    "Tax_Rate": "0.00",
    "Discount_Rate": "0.10",
    "Change_Order_Rate": "0.08",
    "Program_Management_Fee_Rate": "0.07",
    "Quality_Oversight_Fee_Rate": "0.03",
    "Shipping_Logistics_Cost_USD": "25000",
    "Tech_Transfer_Cost_USD": "40000",
    "Analytical_Method_Transfer_Cost_USD": "30000",
    "Regulatory_Writing_Support_Cost_USD": "60000",
    "Project_Management_Cadence_Per_Month": "4",
    "Review_Cycle_Days": "7",
    "Annual_Growth_Rate": "0.10",

    # Discovery cost defaults
    "Design_Cost_USD": "10000",
    "Research_Grade_Synthesis_Cost_USD": "250000",
    "Screening_Cost_USD": "120000",
    "Dose_Response_Screening_Cost_USD": "80000",
    "Protein_Screening_Cost_USD": "90000",
    "Immunogenic_Screening_In_Vitro_Cost_USD": "70000",

    # IND-enabling cost defaults
    "GMP_Production_Cost_USD": "400000",
    "GLP_In_Vivo_Toxicology_13_Weeks_Cost_USD": "350000",
    "Fill_Finish_Cost_USD": "125000",
    "IND_Filing_Cost_USD": "100000",

    # Timeline defaults
    "Design_Time_Weeks": "2",
    "Research_Grade_Synthesis_Time_Weeks": "6",
    "Screening_Time_Weeks": "4",
    "Dose_Response_Screening_Time_Weeks": "3",
    "Protein_Screening_Time_Weeks": "3",
    "Immunogenic_Screening_In_Vitro_Time_Weeks": "3",
    "Discovery_Subtotal_Time_Weeks": "21",
    "GMP_Production_Time_Weeks": "8",
    "GLP_In_Vivo_Toxicology_13_Weeks_Time_Weeks": "13",
    "Fill_Finish_Time_Weeks": "2",
    "IND_Filing_Time_Weeks": "4",
    "IND_Enabling_Subtotal_Time_Weeks": "27",
}


def _normalize_value_for_label(label: str, value: Any) -> str:
    if value is None:
        default = DEFAULTS.get(label)
        return str(default) if default is not None else "0"

    if isinstance(value, str):
        if not value.strip():
            default = DEFAULTS.get(label)
            return str(default) if default is not None else "0"
        return value

    return str(value)


# ---------- Phase 1: Build taxonomy from prompt ----------
TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for assumptions based on the user's scenario.

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
- This model should favor assumptions used by a company CONTRACTING OUT work to CROs/CDMOs/labs/vendors.
- Prefer vendor quote assumptions, milestone payments, external service pricing, change orders,
  QA oversight, regulatory support, shipping/logistics, release testing, batch assumptions, and timeline assumptions.
- Do NOT include employee headcount, salary, fringe, payroll burden, or internal org-chart assumptions unless explicitly requested.
- Choose concise module names (e.g., Program, Vendors, Discovery, Preclinical, CMC, Regulatory, Timeline, Risk).
- 'must_include' labels must be unique within each module and machine-friendly.
- Keep 'global_must_include' distinct from module lists.
- Do NOT include formulas or commentary in labels.
"""


def build_taxonomy(
    user_prompt: str,
    *,
    model: str,
    temperature: float,
    use_case_hint: Optional[str]
) -> Dict[str, Any]:
    system = "You are a domain taxonomy builder for contractor-facing financial and operational assumptions. You output valid JSON."
    hint = f"\nHint use_case: {use_case_hint}\n" if (use_case_hint or "").strip() else ""
    user = f"""{TAXONOMY_INSTRUCTIONS}

User scenario:
{user_prompt.strip()}

{hint}
"""
    works.msg("🧭 inferring taxonomy from prompt…")
    txt = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
        max_tokens=2000,
    )
    try:
        data = json.loads(txt)
    except Exception:
        data = json.loads(_extract_json_snippet(txt))

    data.setdefault("use_case", "outsourced_therapeutic_development")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data


# ---------- Phase 2: Generate assumptions using taxonomy + scaffold ----------
ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column 'Assumptions' table for a contractor-facing therapeutic development model.

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
    {{"label": "Design_Time_Weeks", "value": "2"}}
  ]
}}

Rules:
- 'assumptions' is a list of objects with 'label' and 'value'.
- Include 25–60 rows derived from the user prompt + modules/global_must_include + universal scaffold.
- Labels must be short, machine-friendly, unique, and non-empty.
- This should look like assumptions a sponsor would review when CONTRACTING OUT work.
- Favor assumptions such as:
  vendor quotes, milestone billing, batch count, lot size, release testing, QA oversight,
  shipping, storage, tech transfer, analytical transfer, regulatory writing support,
  review cycle timing, payment terms, and contingency/change order assumptions.
- Do NOT include headcount, FTE, salary, payroll, fringe, recruiter, or org design assumptions unless explicitly requested.
- You MUST include ALL of the following exact labels:
  Design_Time_Weeks
  Research_Grade_Synthesis_Time_Weeks
  Screening_Time_Weeks
  Dose_Response_Screening_Time_Weeks
  Protein_Screening_Time_Weeks
  Immunogenic_Screening_In_Vitro_Time_Weeks
  Discovery_Subtotal_Time_Weeks
  GMP_Production_Time_Weeks
  GLP_In_Vivo_Toxicology_13_Weeks_Time_Weeks
  Fill_Finish_Time_Weeks
  IND_Filing_Time_Weeks
  IND_Enabling_Subtotal_Time_Weeks
- Use GLP_In_Vivo_Toxicology_13_Weeks_Time_Weeks = 13 unless the user explicitly provides a better value.
- ALL rates must be 0–1 fractions.
- No formulas, no commentary. Valid JSON only.

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
    system = "You are a careful financial modeling assistant. You strictly follow output schemas."

    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        use_case=taxonomy.get("use_case", "outsourced_therapeutic_development"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_SCAFFOLD, ensure_ascii=False, indent=2),
        user_prompt=user_prompt.strip() if user_prompt else "",
    )

    works.msg("🔒 requesting JSON assumptions from GPT…")
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

    items = data.get("assumptions") or []
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
        if isinstance(value, str) and value.strip().endswith("%"):
            try:
                pct = float(value.strip().rstrip("%"))
                value = pct / 100.0
            except Exception:
                pass

        out.append({"label": label, "value": str(value)})
        seen.add(label)

    # Backfill scaffold
    for req in UNIVERSAL_SCAFFOLD:
        lab = _sanitize_label(req)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, DEFAULTS.get(lab, "0"))
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # Ensure defaults exist
    for k, v in DEFAULTS.items():
        lab = _sanitize_label(k)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, v)
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    return out


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

        if "currency" in l or l.endswith("_model") or "name" in l:
            units[table_name][lab] = "unitless"
        elif l.endswith("_time_weeks"):
            units[table_name][lab] = "weeks"
        elif any(k in l for k in ["start_year", "year"]):
            units[table_name][lab] = "year"
        elif any(k in l for k in ["month", "months"]):
            units[table_name][lab] = "months"
        elif any(k in l for k in ["days", "_days"]):
            units[table_name][lab] = "days"
        elif any(k in l for k in ["tax_rate", "discount_rate", "contingency_rate", "change_order_rate", "fee_rate", "growth_rate"]):
            units[table_name][lab] = "fraction"
        elif l.endswith("_cost_usd") or l.endswith("_usd"):
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
    works.msg("🧠 assumptions-only pipeline starting…")

    taxonomy = build_taxonomy(
        user_prompt,
        model=model,
        temperature=temperature,
        use_case_hint=use_case_hint,
    )

    rows = generate_assumptions_from_taxonomy(
        user_prompt=user_prompt,
        taxonomy=taxonomy,
        model=model,
        temperature=temperature,
    )

    if not rows:
        works.msg("⚠️ LLM returned no rows; emitting header-only table.")

    tables = to_two_col_table("Assumptions", rows)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": {},
        "annotations": {
            "Assumptions": (
                "Contractor-facing therapeutic development assumptions inferred from prompt. "
                f"use_case={taxonomy.get('use_case', 'outsourced_therapeutic_development')}"
            )
        },
        "units": infer_units("Assumptions", rows) if rows else {"Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "outsourced_therapeutic_development"),
            "modules": taxonomy.get("modules", []),
            "global_must_include": taxonomy.get("global_must_include", []),
            "rows": len(rows),
        },
    }
    return artifact


# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(2)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(1) required (user prompt)."})
        return 1

    try:
        model = str(works.param(3) or default_model)
    except Exception:
        model = default_model

    try:
        temperature = float(works.param(4) or 0.2)
    except Exception:
        temperature = 0.2

    try:
        use_case_hint = works.param(4) or None
    except Exception:
        use_case_hint = None

    try:
        artifact = run_assumptions_only(
            user_prompt=str(user_prompt),
            model=model,
            temperature=temperature,
            use_case_hint=str(use_case_hint) if use_case_hint is not None else None,
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


if __name__ == "__main__":
    works.msg("🔧 loading assumptions-only builder (contractor-facing therapeutic version)…")
    _main_ion("gpt-4o-mini")