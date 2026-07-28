#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Capital & Working Capital Assumptions Builder (Ion Works entry/exit)

What it does
------------
• Calls GPT to infer sensible INITIAL CAPITAL and WORKING CAPITAL assumptions from a user prompt.
• Designed for an asset-light / virtual organization (e.g., therapeutics company using CROs)
  with NO lab buildout, NO equipment purchases, and NO instruments.
• ALWAYS includes an Initial_Capital_Investment_USD assumption.
• Returns ONLY a single two-column 'Capital_Assumptions' table:
      Capital_Assumptions[0:0][0:0] = "Label"
      Capital_Assumptions[1:1][0:0] = "Value"
      Capital_Assumptions[0:0][r:r] = <label>
      Capital_Assumptions[1:1][r:r] = <value>
• No formulas, just tables (+ minimal annotations/units).
• Uses Ion Works for entry (begin), progress (msg), and exit (resolve).

Expected Ion params
-------------------
param(1) = user prompt
param(2) = model (optional; default gpt-4o-mini)
param(3) = temperature (optional; default 0.2)
"""

import os
import json
import re
from typing import Dict, List, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---------- helpers ----------
def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)

def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
    json_mode: bool = False,
    max_tokens: int = 1200
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

def _sanitize_label(label: str) -> str:
    s = re.sub(r"\s+", "_", label.strip())
    s = re.sub(r"[^A-Za-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s or not re.match(r"^[A-Za-z_]", s):
        s = f"A_{s}" if s else "A_Label"
    return s[:64]

# Required label + default
REQUIRED_INITIAL_LABEL = "Initial_Capital_Investment_USD"
DEFAULT_INITIAL_CAPITAL_VALUE = 5_000_000  # can be tuned later

# ---------- LLM prompt for capital & working capital assumptions ----------
CAPITAL_JSON_INSTRUCTIONS = """
You generate ONLY a two-column 'Capital_Assumptions' table for a financial/operational model.

Context:
- The organization is asset-light (e.g., virtual therapeutics / R&D company).
- There is NO internal lab buildout, NO equipment purchases, and NO instruments.
- Focus on INITIAL CAPITAL and WORKING CAPITAL required to operate and fund outsourced work
  (e.g., CRO/CDMO fees, vendor prepayments, deposits, cash buffer, financing).

You MUST ALWAYS include a row with this exact label:
- "Initial_Capital_Investment_USD"
Use a sensible positive numeric value in USD for this field (e.g., 5000000).

Your goal is to:
1) MINIMIZE the number of different capital "types" (concepts),
2) But ALLOCATE that total initial capital across the concrete needs implied by the user prompt
   (e.g., # of programs, # of ASO compounds, # of trials, # of indications).

If the user prompt clearly implies N assets (for example, "20 ASO compounds", "5 programs",
"3 lead indications", "10 constructs"), then you MUST:
- Infer that N as an integer.
- Include a row that captures the asset count, e.g.:
    • Assets_Count
    • ASO_Compounds_Count
    • Programs_Count
  (choose the most natural name based on the prompt).
- Allocate the Initial_Capital_Investment_USD across those assets using simple logic:
    • A per-asset capital row, e.g. Capital_per_ASO_USD, Capital_per_Program_USD, or Capital_per_Asset_USD.
    • If N is small (≤ 20), you MAY also include one row per asset like:
        - ASO_01_Capital_USD
        - ASO_02_Capital_USD
      but keep the per-asset pattern consistent.
- Ensure that:
    • Initial_Capital_Investment_USD ≈ Assets_Count * Capital_per_Asset_USD
      (allow small rounding differences).

Try to minimize the number of distinct capital concepts. Prefer reusing a small core set such as:
- Initial_Capital_Investment_USD   <-- REQUIRED LABEL
- Assets_Count (or ASO_Compounds_Count / Programs_Count / similar)
- Capital_per_Asset_USD (or Capital_per_ASO_USD / Capital_per_Program_USD)
- Working_Capital_Months_of_Runway
- Minimum_Cash_Reserve_USD
- Monthly_Burn_Estimate_USD
- CRO_Prepayment_Working_Capital_USD (optional)
- Operating_Cash_Buffer_USD (optional)

Return STRICT JSON with this EXACT schema:
{
  "capital_assumptions": [
    {"label": "Initial_Capital_Investment_USD", "value": 5000000},
    {"label": "Assets_Count", "value": 20},
    {"label": "Capital_per_ASO_USD", "value": 250000},
    {"label": "Working_Capital_Months_of_Runway", "value": 18},
    {"label": "Minimum_Cash_Reserve_USD", "value": 2000000}
  ]
}

Rules:
- 'capital_assumptions' is a list of objects with 'label' (string) and 'value' (string or number).
- Include **5–15** rows (not 10–25), focusing on:
    • total initial capital,
    • allocation across assets/programs implied by the prompt,
    • a small number of core working-capital items.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.

You MUST focus on INITIAL CAPITAL and WORKING CAPITAL items such as:
- Initial capital & allocation:
    • Initial_Capital_Investment_USD   <-- REQUIRED LABEL
    • Assets_Count / Programs_Count / ASO_Compounds_Count
    • Capital_per_Asset_USD / Capital_per_ASO_USD / Capital_per_Program_USD
- Working capital runway and buffers:
    • Working_Capital_Months_of_Runway
    • Minimum_Cash_Reserve_USD
    • Operating_Cash_Buffer_USD
    • Monthly_Burn_Estimate_USD
    • Working_Capital_Buffer_Rate (0–1)  (optional)
- CRO/vendored working capital items (no internal lab):
    • CRO_Prepayment_Working_Capital_USD (optional)
    • Vendor_Deposit_Working_Capital_USD (optional)
- Timing and currency:
    • Capital_Start_Year (optional)
    • Capital_Start_Month (optional)
    • Currency (optional)

STRICT EXCLUSIONS:
- DO NOT include any line items representing:
    • lab_buildout, office_buildout, facility_buildout, or renovations
    • equipment purchases (lab or manufacturing)
    • instruments or hardware
- Avoid labels containing words like "Equipment", "Instrument", "Lab", "Buildout", "Hardware".
- If the user prompt mentions such items, you should ignore or reframe them as service/vendor fees,
  but DO NOT label them as equipment, lab, or instrument costs.

Rates:
- When entering rates that are percentages, such as Financing_Rate, Working_Capital_Buffer_Rate,
  or any fees/percentages, use 0–1 format (e.g., 0.08 for 8%).

Output:
- No commentary, no text explanations, no formulas.
- Valid JSON only.
"""


def generate_capital_assumptions(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2
) -> List[Dict[str, str]]:
    system = (
        "You are a careful financial modeling assistant. "
        "You strictly focus on INITIAL CAPITAL and WORKING CAPITAL for an asset-light / virtual company, "
        "with NO lab buildout, NO equipment, and NO instruments. "
        "You MUST always include Initial_Capital_Investment_USD. "
        "You STRICTLY follow output schemas."
    )
    user = f"{CAPITAL_JSON_INSTRUCTIONS}\n\nUser prompt:\n{user_prompt.strip() if user_prompt else ''}"

    works.msg("🏗️ requesting Capital_Assumptions JSON from GPT (initial & working capital, no lab/equipment/instruments)…")
    content = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
        max_tokens=2000,
    )

    try:
        data = json.loads(content)
    except Exception:
        data = json.loads(_extract_json_snippet(content))

    items = (data.get("capital_assumptions") or [])
    out: List[Dict[str, str]] = []
    seen = set()

    forbidden_substrings = ["equipment", "instrument", "lab", "buildout", "hardware"]

    for it in items:
        raw_label = str(it.get("label", "")).strip()
        if not raw_label:
            continue
        label = _sanitize_label(raw_label)
        l_lower = label.lower()
        # Drop any forbidden categories just in case
        if any(fs in l_lower for fs in forbidden_substrings):
            continue
        if label in seen:
            continue
        value = it.get("value", "")
        out.append({"label": label, "value": str(value)})
        seen.add(label)

    # Ensure REQUIRED_INITIAL_LABEL is present; if not, append with default
    if REQUIRED_INITIAL_LABEL not in seen:
        out.insert(
            0,
            {"label": REQUIRED_INITIAL_LABEL, "value": str(DEFAULT_INITIAL_CAPITAL_VALUE)}
        )

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
        if "currency" in l:
            units[table_name][lab] = "unitless"
        elif "year" in l:
            units[table_name][lab] = "year"
        elif "month" in l:
            units[table_name][lab] = "months"
        elif "rate" in l or "percentage" in l:
            units[table_name][lab] = "fraction"
        elif any(x in l for x in ["cost", "investment", "raise", "balance", "buffer", "deposit", "prepayment", "fees", "reserve"]):
            units[table_name][lab] = "USD"
        elif "burn" in l:
            units[table_name][lab] = "USD/month"
        else:
            units[table_name][lab] = "unitless"
    return units

# ---------- Orchestrator ----------
def run_capital_assumptions_only(
    user_prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2
) -> Dict[str, Any]:
    works.msg("💡 capital & working-capital assumptions-only pipeline starting (no lab/equipment/instruments)…")
    rows = generate_capital_assumptions(user_prompt, model=model, temperature=temperature)

    if not rows:
        works.msg("⚠️ LLM returned no rows; emitting header-only table.")
    tables = to_two_col_table("Capital_Assumptions", rows)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": {},
        "annotations": {
            "Capital_Assumptions": (
                "Defaults inferred from user prompt via GPT (two-column table) "
                "for initial capital and working capital, with NO lab/equipment/instruments, "
                "and guaranteed Initial_Capital_Investment_USD."
            )
        },
        "units": infer_units("Capital_Assumptions", rows) if rows else {"Capital_Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_CAPITAL_ASSUMPTIONS",
    }
    return artifact

# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        # param(1) = user prompt
        user_prompt = works.param(1)
        if not user_prompt:
            works.resolve({"status": "❌ error", "error": "Ion: param(1) required (prompt)."})
            return 1
    except Exception:
        works.resolve({"status": "❌ error", "error": "Ion: param(1) required (prompt)."})
        return 1

    # param(2) = model
    model = works.param(2) or default_model

    # param(3) = temperature
    try:
        temperature = float(works.param(3) or 0.2)
    except Exception:
        temperature = 0.2

    try:
        artifact = run_capital_assumptions_only(
            user_prompt=str(user_prompt),
            model=str(model),
            temperature=temperature
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "capital-assumptions-only",
        })
        return 1

# bootstrap
if __name__ == "__main__":
    works.msg("🔧 loading capital & working-capital assumptions-only builder (no lab/equipment/instruments, initial capital enforced)…")
    _main_ion("gpt-4o-mini")
