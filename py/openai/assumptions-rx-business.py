#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Product assumptions-only builder (Ion Works entry/exit), generalized & prompt-driven.

What it does
------------
• Builds a domain taxonomy for DRUG PRODUCT COMMERCIAL VIABILITY from the USER PROMPT
  (no hardcoded indication / gene library).
• Calls GPT to infer sensible default PRODUCT assumptions:
    - Market size (patients, TAM) inferred from genes, targets, and/or indications.
    - Pricing + access + uptake assumptions for a drug product.
    - Development timeline + probability of success (POS) assumptions (high-level).
    - Peak annual revenue inferred ONLY from:
          Peak_Annual_Revenue_USD = Annual_Patient_Population_Global * Annual_Treatment_Price_USD * Peak_Penetration
      (not from “TAM” directly; TAM is separate context).
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
param(4) = use_case hint (optional; free-text hint, e.g., "rare disease launch", "oncology product")
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


def _normalize_value_for_label(label: str, value: Any, defaults: Dict[str, Any]) -> str:
    """
    Ensure that if a label exists, it always has a defined non-empty value.
    Priority:
      1) Use the provided value if it's non-empty.
      2) Otherwise use defaults[label] if defined.
      3) Otherwise fall back to "0".
    """
    if value is None:
        default = defaults.get(label)
        return str(default) if default is not None else "0"

    if isinstance(value, str):
        if not value.strip():
            default = defaults.get(label)
            return str(default) if default is not None else "0"
        return value

    return str(value)


def _maybe_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        if isinstance(x, (int, float)):
            return float(x)
        s = str(x).strip().replace(",", "")
        if not s:
            return None
        return float(s)
    except Exception:
        return None


def _clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


# ---------- Product operating scaffold ----------
# These are intentionally PRODUCT commercial viability assumptions.
PRODUCT_SCAFFOLD = [
    "Primary_Indication",
    "Key_Target_Genes",                        # comma-separated if multiple
    "Modality_Type",                           # e.g., ASO, siRNA, small_molecule, antibody, gene_editing
    "Annual_Patient_Population_Global",        # patients/year
    "Annual_Treatment_Price_USD",              # USD/patient/year
    "Peak_Penetration",                        # fraction 0-1
    "Annual_Market_Size_Global_USD",           # USD/year (TAM, not our revenue)
    "Peak_Annual_Revenue_USD",                 # derived: population * price * penetration
    "Time_to_Market_Years",                    # years
    "Probability_of_Success",                  # fraction 0-1
    "Annual_COGS_Percent_of_Revenue",          # fraction 0-1
    "Annual_SG_A_Percent_of_Revenue",          # fraction 0-1
    "Operating_Margin_Percent",                # fraction 0-1 (rough)
]

PRODUCT_DEFAULTS: Dict[str, Any] = {
    "Primary_Indication": "unspecified_indication",
    "Key_Target_Genes": "unspecified_genes",
    "Modality_Type": "unspecified_modality",
    "Annual_Patient_Population_Global": 100000,
    "Annual_Treatment_Price_USD": 50000,
    "Peak_Penetration": 0.15,
    "Annual_Market_Size_Global_USD": 500_000_000,
    "Peak_Annual_Revenue_USD": 750_000_000,         # 100k * 50k * 0.15
    "Time_to_Market_Years": 6,
    "Probability_of_Success": 0.12,
    "Annual_COGS_Percent_of_Revenue": 0.15,
    "Annual_SG_A_Percent_of_Revenue": 0.25,
    "Operating_Margin_Percent": 0.35,
}

# ---------- Phase 1: Build product taxonomy from prompt ----------
PRODUCT_TAXONOMY_INSTRUCTIONS = """
You will infer a domain taxonomy for DRUG PRODUCT COMMERCIAL VIABILITY based on the user's scenario.

The user may describe:
- Genes or targets (e.g., TDP-43, FGFR3, etc.).
- Modality (e.g., ASO, siRNA, antibody, small molecule).
- Indications or disease areas (e.g., ALS, specific cancers, rare diseases).
- Commercial intent (rare disease pricing vs broad primary care, etc.)

Organize into modules oriented around:
- Indications & targets.
- Epidemiology (patient population, segments, geographies).
- Pricing, access, reimbursement.
- Adoption & penetration (peak share, uptake curve assumptions).
- Competitive landscape (light-touch).
- Development timeline & probability of success (high-level).
- Unit economics (COGS/SG&A/margins, high-level).

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
- Focus on PRODUCT COMMERCIALIZATION:
  - Indication(s), target genes, modality, lines of therapy if given.
  - Patient population per year (global unless specified).
  - Annual treatment price (USD/patient/year) and access constraints if implied.
  - Peak penetration (0-1) and time-to-market (years).
  - Probability of success (0-1).
  - TAM (Annual_Market_Size_Global_USD) and peak revenue (Peak_Annual_Revenue_USD).
- Choose concise module names (e.g., Indications, Epidemiology, Pricing, Adoption, Timeline, Economics).
- 'must_include' labels must be unique within each module and machine-friendly.
- 'global_must_include' is for cross-cutting essentials (e.g., Primary_Indication, Annual_Patient_Population_Global, Annual_Treatment_Price_USD).
- DO NOT include formulas or commentary in labels; these are just label names.
"""


def build_product_taxonomy(
    user_prompt: str,
    *,
    model: str,
    temperature: float,
    use_case_hint: Optional[str],
) -> Dict[str, Any]:
    system = "You are a product commercialization taxonomy builder. You output valid JSON."
    hint = f"\nHint use_case: {use_case_hint}\n" if (use_case_hint or "").strip() else ""
    user = f"""{PRODUCT_TAXONOMY_INSTRUCTIONS}

User scenario:
{user_prompt.strip()}

{hint}
"""
    works.msg("🧭 inferring product commercialization taxonomy from prompt…")
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

    data.setdefault("use_case", "product_commercial_viability")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data


# ---------- Phase 2: Generate product assumptions using taxonomy + scaffold ----------
PRODUCT_ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column 'Assumptions' table for DRUG PRODUCT COMMERCIAL VIABILITY.

Your primary responsibilities:
1) Parse the user's prompt for genes, targets, modality, and indications.
   - If genes are listed, infer likely indication(s) and commercial archetype (rare vs broad).
   - If indications are specified, use them directly.
2) Estimate epidemiology and market:
   - Annual_Patient_Population_Global (patients/year).
   - Annual_Market_Size_Global_USD (USD/year, TAM; context only).
   - If the user does NOT supply patient population / market sizing, you MUST still provide a best-effort estimate
     (do not output "unknown" / "n/a"; choose a reasonable order-of-magnitude).
3) Estimate pricing + adoption:
   - Annual_Treatment_Price_USD (USD/patient/year).
   - Peak_Penetration (0-1).
4) Estimate timeline & risk:
   - Time_to_Market_Years.
   - Probability_of_Success (0-1).
5) Compute peak revenue:
   - Peak_Annual_Revenue_USD = Annual_Patient_Population_Global * Annual_Treatment_Price_USD * Peak_Penetration
     (peak revenue is driven ONLY by those three inputs; do NOT set it independently if unsure).

CONTEXT (prompt-derived):
- use_case: {use_case}
- modules: {modules_json}
- global_must_include: {global_must_include}

UNIVERSAL_PRODUCT_SCAFFOLD (always include; fill sensible defaults if user didn't specify):
{product_scaffold}

Return STRICT JSON with this EXACT schema:
{{
  "assumptions": [
    {{"label": "Primary_Indication", "value": "ALS"}},
    {{"label": "Annual_Treatment_Price_USD", "value": 100000}}
  ]
}}

Rules:
- 'assumptions' is a list of objects with 'label' (string) and 'value' (string or number).
- Include 8–14 rows TOTAL, derived from:
    (a) the user prompt,
    (b) the taxonomy context above,
    (c) the UNIVERSAL_PRODUCT_SCAFFOLD.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.
- Percent/fraction fields MUST be 0-1 for:
    Peak_Penetration, Probability_of_Success, Annual_COGS_Percent_of_Revenue, Annual_SG_A_Percent_of_Revenue, Operating_Margin_Percent.
- ALL currency values should be in USD.
- No other tables, no formulas, no commentary. Valid JSON only.

User scenario (for reference):
{user_prompt}
"""


def generate_assumptions_from_taxonomy(
    *,
    user_prompt: str,
    taxonomy: Dict[str, Any],
    model: str,
    temperature: float,
) -> List[Dict[str, str]]:
    system = "You are a careful drug product commercialization modeling assistant. You STRICTLY follow output schemas."

    instruction = PRODUCT_ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        use_case=taxonomy.get("use_case", "product_commercial_viability"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        product_scaffold=json.dumps(PRODUCT_SCAFFOLD, ensure_ascii=False, indent=2),
        user_prompt=user_prompt.strip() if user_prompt else "",
    )

    works.msg("🔒 requesting JSON product assumptions from GPT…")
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

    # Pass 1: sanitize labels/values, normalize percents, basic cleanup
    for it in items:
        raw_label = str(it.get("label", "")).strip()
        if not raw_label:
            continue
        label = _sanitize_label(raw_label)
        if label in seen:
            continue

        value = it.get("value", "")

        # Normalize percent strings to fractions
        if isinstance(value, str) and value.strip().endswith("%"):
            try:
                pct = float(value.strip().rstrip("%"))
                value = pct / 100.0
            except Exception:
                pass

        out.append({"label": label, "value": str(value)})
        seen.add(label)

    # Backfill scaffold defaults if missing
    for req in PRODUCT_SCAFFOLD:
        lab = _sanitize_label(req)
        if lab not in seen:
            value_str = _normalize_value_for_label(lab, PRODUCT_DEFAULTS.get(lab, "0"), PRODUCT_DEFAULTS)
            out.append({"label": lab, "value": value_str})
            seen.add(lab)

    # Post-hoc: clamp fraction fields to [0,1]
    frac_fields = {
        _sanitize_label("Peak_Penetration"),
        _sanitize_label("Probability_of_Success"),
        _sanitize_label("Annual_COGS_Percent_of_Revenue"),
        _sanitize_label("Annual_SG_A_Percent_of_Revenue"),
        _sanitize_label("Operating_Margin_Percent"),
    }
    for row in out:
        if row["label"] in frac_fields:
            v = _maybe_float(row["value"])
            if v is None:
                v = float(PRODUCT_DEFAULTS.get(row["label"], 0.0))
            row["value"] = str(_clamp01(float(v)))

    # Compute Peak_Annual_Revenue_USD from (population * price * penetration)
    pop_lab = _sanitize_label("Annual_Patient_Population_Global")
    price_lab = _sanitize_label("Annual_Treatment_Price_USD")
    pen_lab = _sanitize_label("Peak_Penetration")
    peak_rev_lab = _sanitize_label("Peak_Annual_Revenue_USD")

    by_label = {row["label"]: row["value"] for row in out}

    pop_v = _maybe_float(by_label.get(pop_lab)) or float(PRODUCT_DEFAULTS["Annual_Patient_Population_Global"])
    price_v = _maybe_float(by_label.get(price_lab)) or float(PRODUCT_DEFAULTS["Annual_Treatment_Price_USD"])
    pen_v = _maybe_float(by_label.get(pen_lab)) or float(PRODUCT_DEFAULTS["Peak_Penetration"])
    pen_v = _clamp01(float(pen_v))

    peak_revenue = float(pop_v) * float(price_v) * float(pen_v)

    updated = []
    has_peak = False
    for row in out:
        if row["label"] == peak_rev_lab:
            row["value"] = str(peak_revenue)
            has_peak = True
        updated.append(row)
    if not has_peak:
        updated.append({"label": peak_rev_lab, "value": str(peak_revenue)})
    out = updated

    # Hard cap to 14 rows, prefer scaffold order
    MAX_ASSUMPTIONS = 14
    preferred_order = [_sanitize_label(lab) for lab in PRODUCT_SCAFFOLD]
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

        if "market_size" in l and "usd" in l:
            units[table_name][lab] = "USD/year"
        elif "peak_annual_revenue" in l and "usd" in l:
            units[table_name][lab] = "USD/year"
        elif "treatment_price" in l and "usd" in l:
            units[table_name][lab] = "USD/patient/year"
        elif "patient_population" in l:
            units[table_name][lab] = "patients/year"
        elif "time_to_market" in l and "years" in l:
            units[table_name][lab] = "years"
        elif "penetration" in l or "probability" in l or "percent" in l or "margin" in l:
            units[table_name][lab] = "fraction_0_to_1"
        elif "usd" in l:
            units[table_name][lab] = "USD"
        else:
            units[table_name][lab] = "unitless"
    return units


# ---------- Orchestrator ----------
def run_assumptions_only(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    use_case_hint: Optional[str] = None,
) -> Dict[str, Any]:
    works.msg("🧠 product assumptions-only pipeline starting…")
    taxonomy = build_product_taxonomy(
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
        works.msg("⚠️ LLM returned no rows; emitting header-only Assumptions table.")
    table_name = "Assumptions"
    tables = to_two_col_table(table_name, rows)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": {},
        "annotations": {
            table_name: (
                "Drug product commercial viability assumptions inferred from user prompt via GPT "
                "(two-column table; values are approximate). "
                f"use_case={taxonomy.get('use_case','product_commercial_viability')}"
            )
        },
        "units": infer_units(table_name, rows) if rows else {table_name: {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "product_commercial_viability"),
            "modules": taxonomy.get("modules", []),
            "global_must_include": taxonomy.get("global_must_include", []),
            "rows": len(rows),
        },
    }
    return artifact


# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(1)  # required
    except Exception:
        works.resolve(
            {"status": "❌ error", "error": "Ion: param(1) required (user prompt)."}
        )
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
            use_case_hint=str(use_case_hint) if use_case_hint is not None else None,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve(
            {
                "status": "❌ error",
                "error": str(err),
                "where": "product-assumptions-only",
            }
        )
        return 1


# bootstrap
if __name__ == "__main__":
    works.msg("🔧 loading product assumptions-only builder (market + pricing + adoption + timeline + peak revenue)…")
    _main_ion("gpt-4o-mini")
