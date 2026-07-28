#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Assumptions-only builder (Ion Works entry/exit), generalized & prompt-driven.

What it does
------------
• Builds a domain taxonomy (use_case + modules + must-include fields) from the USER PROMPT (no hardcoded library).
• Calls GPT to infer sensible default assumptions using that taxonomy PLUS a universal time/budget scaffold.
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
param(4) = use_case hint (optional; free-text hint, e.g., "clinical trial budget")
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

# ---------- Universal time & budget scaffold (simplified ~10 params) ----------
UNIVERSAL_SCAFFOLD = [
    "Currency",
    "Start_Year",
    "Duration_Months",
    "Months_in_Year",
    "FTE_Total",
    "Average_FTE_Billing_Rate_USD_per_Year",      
    "Tax_Rate",
    "Discount_Rate",
    "Fringe_Rate",
    "Annual_Growth_Rate",
    "Contingency_Rate",
]

DEFAULTS: Dict[str, str] = {
    "Currency": "USD",
    "Start_Year": "2025",
    "Duration_Months": "12",
    "Months_in_Year": "12",
    "FTE_Total": "1",
    "Average_FTE_Billing_Rate_USD_per_Year": "250000",      
    "Tax_Rate": "0.21",
    "Discount_Rate": "0.10",
    "Fringe_Rate": "0.25",
    "Annual_Growth_Rate": "0.10",
    "Contingency_Rate": "0.10",
}

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
      "must_include": ["Label_1", "Label_2", "..."],    // 5–15 labels this module must have
      "label_hints": "brief hints for units/shape, optional"
    }
  ],
  "global_must_include": ["Label_A", "Label_B", "..."]   // 10–25 labels across modules
}

Rules:
- Choose *concise* module names (e.g., Timeframe, Payroll, Revenue, COGS, Operations, Quality, Risk, Cloud, Trial, Event, etc.)
- 'must_include' labels must be unique within each module and *machine-friendly* (snake_case or Title_Case).
- Prefer price/volume, headcount by function, payroll inputs, overhead, tax_rate, discount_rate, depreciation_years if applicable, growth rates, AND timeline fields (start/duration/phases).
- Keep 'global_must_include' distinct from module lists (no duplicates). Use it for cross-cutting essentials.
- DO NOT include formulas or commentary in labels; these are just label names.
"""

def build_taxonomy(user_prompt: str, *, model: str, temperature: float, use_case_hint: Optional[str]) -> Dict[str, Any]:
    system = "You are a domain taxonomy builder for financial/operational assumptions. You output valid JSON."
    hint = f"\nHint use_case: {use_case_hint}\n" if (use_case_hint or "").strip() else ""
    user = f"""{TAXONOMY_INSTRUCTIONS}

User scenario:
{user_prompt.strip()}

{hint}
"""
    works.msg("🧭 inferring taxonomy from prompt…")
    txt = _chat_call(model=model, system=system, user=user, temperature=temperature, json_mode=True, max_tokens=2000)
    try:
        data = json.loads(txt)
    except Exception:
        data = json.loads(_extract_json_snippet(txt))
    # Basic sanity
    data.setdefault("use_case", "general_planning")
    data.setdefault("modules", [])
    data.setdefault("global_must_include", [])
    return data

# ---------- Phase 2: Generate assumptions using taxonomy + scaffold ----------
ASSUMPTIONS_INSTRUCTIONS_TEMPLATE = """
You generate ONLY a two-column 'Assumptions' table for a financial/operational model.

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

Rules:
- 'assumptions' is a list of objects with 'label' (string) and 'value' (string or number).
- Include 6–12 rows TOTAL, derived from the user prompt + universal scaffold.
- Labels must be short and machine-friendly (snake_case or Title_Case), unique, and non-empty.
- Prioritize: currency, start_year, duration_months, months_in_year, FTE_Total,
  key rates (Tax_Rate, Discount_Rate, Fringe_Rate, Contingency_Rate),
  and ONE main growth or scale parameter (Annual_Growth_Rate).
- You MUST include 'Annual_Growth_Rate' with a sensible default in 0–1 range (e.g., 0.10).
- ALL rates (Tax_Rate, Fringe_Rate, Discount_Rate, Contingency_Rate, etc.) must be 0–1 fractions (not 0–100).
- No other tables, no formulas, no commentary. Valid JSON only.

User scenario (for reference):
{user_prompt}
"""

# --- DROP-IN REPLACEMENT ---

def _is_numeric_string(s: str) -> bool:
    """
    Return True if s can be safely parsed as a finite float, else False.
    """
    try:
        s = str(s).strip()
        if not s:
            return False
        v = float(s)
        return v == v  # True for all finite numbers, False for NaN
    except Exception:
        return False


def generate_assumptions_from_taxonomy(
    *,
    user_prompt: str,
    taxonomy: Dict[str, Any],
    model: str,
    temperature: float
) -> List[Dict[str, str]]:
    system = "You are a careful financial modeling assistant. You STRICTLY follow output schemas."

    # Compose instruction with taxonomy + scaffold
    instruction = ASSUMPTIONS_INSTRUCTIONS_TEMPLATE.format(
        use_case=taxonomy.get("use_case", "general_planning"),
        modules_json=json.dumps(taxonomy.get("modules", []), ensure_ascii=False),
        global_must_include=json.dumps(taxonomy.get("global_must_include", []), ensure_ascii=False),
        universal_scaffold=json.dumps(UNIVERSAL_SCAFFOLD, ensure_ascii=False, indent=2),
        user_prompt=user_prompt.strip() if user_prompt else ""
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

    # Backfill universal scaffold if missing
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
    MAX_ASSUMPTIONS = 10

    # Prefer scaffold labels first
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

    # 2) Fill remaining slots with any other labels (taxonomy-derived)
    if len(final_rows) < MAX_ASSUMPTIONS:
        for row in out:
            lab = row["label"]
            if lab in used:
                continue
            final_rows.append(row)
            used.add(lab)
            if len(final_rows) >= MAX_ASSUMPTIONS:
                break

    # --- NEW: filter out Currency and any row whose value is non-numeric ---
    numeric_rows: List[Dict[str, str]] = []
    for row in final_rows:
        label = str(row.get("label", "")) or ""
        value_str = str(row.get("value", "")).strip()

        # Skip Currency by label
        if label.lower() == "currency":
            continue

        # Skip non-numeric values
        if not _is_numeric_string(value_str):
            continue

        numeric_rows.append({"label": label, "value": value_str})

    return numeric_rows


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
        elif any(k in l for k in ["tax", "rate", "discount", "fringe", "indirect_cost"]):
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
    works.msg("🧠 assumptions-only pipeline starting…")
    taxonomy = build_taxonomy(user_prompt, model=model, temperature=temperature, use_case_hint=use_case_hint)
    rows = generate_assumptions_from_taxonomy(
        user_prompt=user_prompt,
        taxonomy=taxonomy,
        model=model,
        temperature=temperature
    )

    if not rows:
        works.msg("⚠️ LLM returned no rows; emitting header-only table.")
    tables = to_two_col_table("Assumptions", rows)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": {},
        "annotations": {
            "Assumptions": (
                "Defaults inferred from user prompt via GPT (two-column table). "
                f"use_case={taxonomy.get('use_case','general_planning')}"
            )
        },
        "units": infer_units("Assumptions", rows) if rows else {"Assumptions": {}},
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_ASSUMPTIONS_PAYLOAD",
        "metadata": {
            "use_case": taxonomy.get("use_case", "general_planning"),
            "modules": taxonomy.get("modules", []),
            "global_must_include": taxonomy.get("global_must_include", []),
            "rows": len(rows)
        }
    }
    return artifact



def _is_numeric_string(s: str) -> bool:
    """
    Return True if s can be safely parsed as a finite float, else False.
    """
    try:
        v = float(str(s).strip())
        return bool(s.strip()) and (v == v)  # NaN check: v == v fails for NaN
    except Exception:
        return False


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
    works.msg("🔧 loading assumptions-only builder (generalized, prompt-driven)…")
    _main_ion("gpt-4o-mini")
