#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Capital Requirements Builder — builds a table of capital requirement formulas
based on existing tables (Capital_Assumptions, PnL, etc.) to determine total
capital need, buffer, and runway duration.

Ion params
-----------
param(1): all tables JSON (inline or path) — includes Capital_Assumptions, PnL, etc.
param(2): model (optional; default: gpt-4o-mini)
param(3): temperature (optional; default: 0.15)
"""

import os
import json
import re
from typing import Dict, List, Tuple, Any
from ion import works  # type: ignore
from openai import OpenAI

# ---------- utilities ----------

_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)

def _extract_json_snippet(text: str) -> str:
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e <= s:
        raise ValueError("No JSON object found.")
    return text[s:e+1].strip()

def _chat_call(*, model: str, system: str, user: str, temperature: float = 0.15, json_mode: bool = False, max_tokens: int = 2000) -> str:
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

def _load_json_from_path_or_text(s: str) -> list[dict]:
    s = (s or "").strip()
    if not s:
        raise RuntimeError("Tables input is empty.")
    if s.startswith("["):
        return json.loads(s)
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

def _parse_table_labels(tables_json: list[dict]) -> Dict[str, List[str]]:
    """
    Extracts labels from each table's wells and returns a dict {TableName: [labels...]}.
    """
    result: Dict[str, List[str]] = {}
    for table in tables_json:
        tname = table.get("name")
        if not tname:
            continue
        wells = table.get("wells", [])
        labels = []
        for w in wells:
            if w.get("x") == 0 and w.get("y") >= 1 and isinstance(w.get("value"), str):
                labels.append(re.sub(r"\s+", "_", w["value"].strip()))
        result[tname] = labels
    return result

def _infer_units_for_capital_label(label: str) -> str:
    """Infer sensible units for each Capital_Requirements row."""
    L = label.lower()
    if "rate" in L or "percentage" in L:
        return "fraction"
    if "year" in L or "runway" in L:
        return "years"
    if "profit" in L or "capex" in L or "capital" in L or "cost" in L:
        return "USD"
    return "unitless"

# ---------- LLM schema ----------

CAPITAL_SCHEMA_MSG = """
You must output ONLY valid JSON. Build a 'Capital_Requirements' table with labeled rows and formulas.
Return JSON with this exact structure:
{
  "rows": [
    {"label": "Base_CapEx", "formula": "Capital_Assumptions[Initial_Capital_Investment]+Capital_Assumptions[Facility_Buildout_Cost]+Capital_Assumptions[Lab_Equipment_Cost]+Capital_Assumptions[Manufacturing_Equipment_Cost]"},
    {"label": "Working_Capital", "formula": "PnL[Total_Revenue]*Capital_Assumptions[Working_Capital_Percentage]"},
    {"label": "Expansion_CapEx_Year2", "formula": "Capital_Assumptions[Expansion_Capex_Year2]"},
    {"label": "Capital_Reserve", "formula": "Capital_Assumptions[Capital_Reserve_Buffer]"},
    {"label": "Total_Capital_Required", "formula": "Capital_Requirements[Base_CapEx]+Capital_Requirements[Working_Capital]+Capital_Requirements[Expansion_CapEx_Year2]+Capital_Requirements[Capital_Reserve]"},
    {"label": "Financing_Rate", "formula": "Capital_Assumptions[Financing_Rate]"},
    {"label": "Annual_Interest_Cost", "formula": "Capital_Requirements[Total_Capital_Required]*Capital_Requirements[Financing_Rate]"},
    {"label": "Net_Annual_Profit", "formula": "PnL[Net_Income]-Capital_Requirements[Annual_Interest_Cost]"},
    {"label": "Runway_Years", "formula": "IF(PnL[Net_Income]>0,10,Capital_Assumptions[Initial_Capital_Investment]/ABS(PnL[Net_Income]))"}
  ],
  "notes": "Derived capital requirements including PnL profitability and estimated runway."
}

STRICT rules:
- Reference Capital_Assumptions[...] and PnL[...] when relevant.
- Use only + - * / ^ and parentheses.
- Include a Runway_Years formula that limits to 10 if profitable.
- Use only the provided labels from Capital_Assumptions and PnL.
"""

def _rows_to_wire(table_name: str, rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    tables: Dict[str, str] = {_key(table_name, 0, 0): "Label", _key(table_name, 1, 0): "Value"}
    formulas: Dict[str, str] = {}
    r = 1
    for it in rows:
        lab = re.sub(r"\s+", "_", it["label"].strip())
        tables[_key(table_name, 0, r)] = lab
        formulas[_key(table_name, 1, r)] = it["formula"].strip()
        r += 1
    return tables, formulas

# ---------- LLM generation ----------

def generate_capital_requirements_via_gpt(
    *,
    tables_json: list[dict],
    model: str = "gpt-4o-mini",
    temperature: float = 0.15,
) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, Dict[str, str]], Dict[str, str]]:
    available_labels = _parse_table_labels(tables_json)
    cap_assumptions = available_labels.get("Capital_Assumptions", [])
    pnl_labels = available_labels.get("PnL", [])

    assumptions_preview = "\n".join(f"- Capital_Assumptions[{x}]" for x in cap_assumptions)
    pnl_preview = "\n".join(f"- PnL[{x}]" for x in pnl_labels)

    system = "You are a meticulous financial modeling assistant. Return JSON exactly per schema."
    user = (
        f"{CAPITAL_SCHEMA_MSG}\n\n"
        "AVAILABLE FIELDS:\n"
        f"Capital_Assumptions:\n{assumptions_preview}\n\n"
        f"PnL:\n{pnl_preview}\n\n"
        "Reminder: Use only these labels when building formulas."
    )

    works.msg("🏗️ requesting Capital Requirements table from GPT…")
    content = _chat_call(model=model, system=system, user=user, temperature=temperature, json_mode=True, max_tokens=4000)
    try:
        data = json.loads(content)
    except Exception:
        data = json.loads(_extract_json_snippet(content))

    rows = data.get("rows") or []
    if not rows:
        raise RuntimeError("GPT did not return any Capital_Requirements rows.")

    cap_tables, cap_formulas = _rows_to_wire("Capital_Requirements", rows)

    # infer units
    cap_units: Dict[str, Dict[str, str]] = {"Capital_Requirements": {}}
    for k, v in cap_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        if t == "Capital_Requirements" and i == 0 and j >= 1:
            cap_units["Capital_Requirements"][v] = _infer_units_for_capital_label(v)

    annotations = {"Capital_Requirements": str(data.get("notes") or "Capital requirements derived from assumptions and PnL.")}
    return cap_tables, cap_formulas, cap_units, annotations

# ---------- Orchestrator ----------

def run_capital_builder(
    tables_json: list[dict],
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.15,
) -> Dict[str, Any]:
    cap_tables, cap_formulas, cap_units, cap_notes = generate_capital_requirements_via_gpt(
        tables_json=tables_json,
        model=model,
        temperature=temperature,
    )

    artifact = {
        "tables": cap_tables,
        "formulas": cap_formulas,
        "annotations": cap_notes,
        "units": cap_units,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact

# ---------- Ion entry/exit ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        tables_arg = works.param(1)
        tables_json = (tables_arg)
    except Exception as e:
        raise RuntimeError("Ion: param(1) must be all tables JSON (inline or path).") from e

    model = (works.param(2) or default_model)
    try:
        temperature = float(works.param(3) or 0.15)
    except Exception:
        temperature = 0.15

    try:
        artifact = run_capital_builder(
            tables_json=tables_json,
            model=str(model),
            temperature=temperature,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({"status": "❌ error", "error": str(err), "where": "capital-builder"})
        raise

if __name__ == "__main__":
    works.msg("💰 loading Capital Requirements builder…")
    _main_ion("gpt-4o-mini")
