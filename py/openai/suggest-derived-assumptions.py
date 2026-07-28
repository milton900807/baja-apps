#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Builds a chain of tables (assumptions → drivers → calcs → final outputs)
that compute user-selected values from a prompt.

Inputs:
  - user_prompt: free text (what we're modeling)
  - tablename: name of the final/output table
  - tables_spec: JSON array (or path / noisy string) of existing tables
  - selections: dict mapping "qualifier" -> value (e.g., {"FTE":4,"initial_capital":56000})

Behavior:
  - Summarize existing tables for the LLM.
  - Ask the model to propose additional tables (e.g., fte_assumptions) with headers/rows.
  - Ensure each selected qualifier ultimately appears in `tablename` via formula chains.
  - Return JSON with: tables[], dependencies, notes.

Notes:
  - This script intentionally ALLOWS common spreadsheet functions (COUNT, SUM, SUMIF, SUMPRODUCT, etc.).
  - Output wells use the same "grid" notion: each cell can carry {"x","y","value"} or {"x","y","formula"}.
  - References are of the form table_name[Label] (column label references), and functions use Excel-like names.

CLI usage (quick demo):
  python build_formula_chain.py \
      --prompt "Model headcount and startup costs for a 12-month R&D plan" \
      --tablename "final_outputs" \
      --tables '[{"name":"inputs","cols":2,"rows":3,"wells":[{"x":0,"y":0,"value":"Label"},{"x":1,"y":0,"value":"Value"},{"x":0,"y":1,"value":"Budget"},{"x":1,"y":1,"value":100000},{"x":0,"y":2,"value":"Year"},{"x":1,"y":2,"value":1}]}]' \
      --selections '{"FTE":4,"initial_capital":56000}'
"""

import os
import re
import ast
import json
import argparse
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote
from openai import OpenAI

# ------------------------------- Utilities -------------------------------

def _decode(s: Any) -> Optional[str]:
    if s is None:
        return None
    try:
        return unquote(str(s))
    except Exception:
        return str(s)

def _maybe_json_load(s: str):
    try:
        return json.loads(s)
    except Exception:
        return None

def _maybe_literal_eval(s: str):
    try:
        return ast.literal_eval(s)
    except Exception:
        return None

def _looks_like_path(raw: str) -> bool:
    if not raw:
        return False
    if len(raw) > 240:
        return False
    if raw.startswith("jfile:"):
        return True
    if os.path.exists(raw):
        return True
    return raw.lower().endswith(".json") or ("/" in raw or os.path.sep in raw)

def _read_path(raw: str):
    p = raw[6:] if raw.startswith("jfile:") else raw
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def _extract_json_slice(raw: str):
    for opener, closer in (("[", "]"), ("{", "}")):
        if opener in raw and closer in raw:
            start, end = raw.find(opener), raw.rfind(closer)
            if 0 <= start < end:
                snippet = raw[start : end + 1]
                obj = _maybe_json_load(snippet)
                if obj is not None:
                    return obj
    return None

def _load_json_from_path_or_text(s: Any):
    if isinstance(s, (list, dict)):
        return s
    if s is None:
        return None
    raw = (_decode(s) or "").strip()
    if not raw:
        return None
    if _looks_like_path(raw):
        return _read_path(raw)
    if raw[:1] in "[{":
        obj = _maybe_json_load(raw)
        if obj is not None:
            return obj
    obj = _extract_json_slice(raw)
    if obj is not None:
        return obj
    lit = _maybe_literal_eval(raw)
    if isinstance(lit, (list, dict)):
        return lit
    repaired = raw.replace("'", '"')
    obj = _maybe_json_load(repaired)
    if obj is not None:
        return obj
    raise ValueError("Could not parse JSON for tables/selections.")

def _summarize_tables_for_llm(tables: List[Dict[str, Any]]) -> str:
    """Compact deterministic schema summary for LLM context."""
    lines: List[str] = []
    for t in tables or []:
        name = t.get("name", "<unnamed>")
        cols = t.get("cols")
        rows = t.get("rows")
        lines.append(f"#TABLE {name} cols={cols} rows={rows}")
        wells = t.get("wells", [])
        headers = [w["value"] for w in wells if w.get("y") == 0 and isinstance(w.get("value"), str)]
        if headers:
            lines.append("  headers: " + ", ".join(headers[:12]) + ("..." if len(headers) > 12 else ""))
        labels = [w["value"] for w in wells if w.get("x") == 0 and (w.get("y") or 0) >= 1 and isinstance(w.get("value"), str)]
        if labels:
            lines.append("  labels: " + ", ".join(labels[:24]) + ("..." if len(labels) > 24 else ""))
        values = [w["value"] for w in wells if w.get("x") == 1 and (w.get("y") or 0) >= 1]
        if values:
            vs = [str(v) for v in values[:8]]
            lines.append("  sample_values: " + ", ".join(vs) + ("..." if len(values) > 8 else ""))
    return "\n".join(lines)

def _clean_name(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_]", "_", name.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "table"

def _normalize_selections(sel: Any) -> Dict[str, Any]:
    """Accept dict or list of {k:v} objects; produce dict."""
    if isinstance(sel, dict):
        return sel
    if isinstance(sel, list):
        out: Dict[str, Any] = {}
        for item in sel:
            if isinstance(item, dict) and len(item) == 1:
                k, v = list(item.items())[0]
                out[str(k)] = v
        return out
    raise ValueError("selections must be a dict or a list of single-key dicts")

# ------------------------------- OpenAI call -------------------------------

def _pick_model(requested: Optional[str], default_model: str = "gpt-4o-mini") -> str:
    m = (requested or "").strip() or default_model
    if m.lower() in {"none", "null"}:
        m = default_model
    return m

def _chat_json(*, model: str, system: str, user: str, temperature: float = 0.2) -> Dict[str, Any]:
    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    text = resp.choices[0].message.content or "{}"
    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        return {}

# ------------------------------- Core builder -------------------------------

def build_formula_chain(
    *,
    user_prompt: str,
    tablename: str,
    tables_spec: List[Dict[str, Any]],
    selections: Dict[str, Any],
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tables: int = 8
) -> Dict[str, Any]:
    """
    Returns JSON:
      {
        "final_table": "<tablename>",
        "tables": [ {name, cols, rows, wells:[{x,y,value|formula}...]}, ... ],
        "dependencies": [ {"from":"tableA[Field]","to":"tableB[Field]"}, ... ],
        "notes": "rationale / guidance"
      }
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set.")

    tname = _clean_name(tablename or "final_outputs")
    schema = _summarize_tables_for_llm(tables_spec or [])
    sels = { _clean_name(k): v for k, v in selections.items() }

    system = (
        "You design spreadsheet models as a chain of tables. Each table has:\n"
        "- headers on row y=0; labels in column x=0 for y>=1; values in x>=1.\n"
        "- Any cell may have either a constant value or a formula.\n\n"
        "FORMULAS:\n"
        "- You MAY use common spreadsheet functions (COUNT, SUM, SUMIF, SUMPRODUCT, IF, ROUND, etc.).\n"
        "- References use the form table_name[Label] or table_name[Header] when unambiguous.\n"
        "- No ranges like A1:B3; when needed, use aggregate functions referencing a table field.\n"
        "- Build a logical chain: assumptions → drivers → calcs → outputs.\n"
        "- Ensure each requested selection qualifier appears in the final output table with a formula path.\n"
        "- Prefer realistic structures (e.g., fte_assumptions with roles,salary,FTE; cost drivers; capex; etc.).\n\n"
        "OUTPUT JSON SHAPE (strict):\n"
        "{\n"
        '  "tables": [\n'
        '    {"name":"table_name","cols":<int>,"rows":<int>,\n'
        '     "wells":[ {"x":<int>,"y":<int>,"value":<scalar>|"formula":<string>}, ... ]\n'
        "    }, ...],\n"
        '  "dependencies": [ {"from":"tableA[Field]","to":"tableB[Field]"}, ... ],\n'
        '  "notes": "<concise rationale>"\n'
        "}\n"
        "- Keep to at most {max_tables} new/modified tables (including the final one).\n"
        "- The final table MUST be named exactly: " + tname + "\n"
    ).replace("{max_tables}", str(max_tables))

    # Give the model concrete goals and selections
    user = (
        "=== USER PROMPT ===\n" + user_prompt.strip() + "\n\n"
        "=== EXISTING TABLES (schema summary) ===\n" + (schema or "(none)") + "\n\n"
        "=== FINAL TABLENAME ===\n" + tname + "\n\n"
        "=== TARGET SELECTIONS (qualifier -> value) ===\n" + json.dumps(sels, ensure_ascii=False) + "\n\n"
        "Please produce the JSON exactly as specified, ensuring the final table contains rows/fields\n"
        "for each qualifier with formulas that trace back to assumptions/drivers you create.\n"
        "Example ideas (not mandatory):\n"
        "- fte_assumptions: Role, Salary, FTE; drivers for headcount; final FTE = COUNT(fte_assumptions)\n"
        "- capex_assumptions: Item, Unit_Cost, Qty; initial_capital = SUMPRODUCT(Unit_Cost, Qty)\n"
    )

    plan = _chat_json(
        model=_pick_model(model),
        system=system,
        user=user,
        temperature=temperature,
    )

    # Minimal validation & normalization
    tables = plan.get("tables") if isinstance(plan, dict) else None
    if not isinstance(tables, list):
        tables = []
    deps = plan.get("dependencies")
    if not isinstance(deps, list):
        deps = []

    # Ensure final table present
    has_final = any(isinstance(t, dict) and _clean_name(t.get("name","")) == tname for t in tables)
    if not has_final:
        # Append a minimal final table shell that echoes selections if missing
        final_wells = [{"x":0,"y":0,"value":"Label"},{"x":1,"y":0,"value":"Value"}]
        y = 1
        for k,v in sels.items():
            final_wells += [{"x":0,"y":y,"value":k},{"x":1,"y":y,"value":v}]
            y += 1
        tables.append({"name": tname, "cols":2, "rows":y, "wells":final_wells})
        deps.append({"from":"<fallback>", "to":f"{tname}[*]"})

    return {
        "final_table": tname,
        "tables": tables,
        "dependencies": deps,
        "notes": plan.get("notes", "Generated chain from assumptions to outputs."),
    }

# ------------------------------- CLI wrapper -------------------------------

def main():
    ap = argparse.ArgumentParser(description="Build tables + formulas chain to compute selected values.")
    ap.add_argument("--prompt", required=True, help="User prompt describing the goal.")
    ap.add_argument("--tablename", required=True, help="Final table name.")
    ap.add_argument("--tables", required=False, default="[]", help="JSON/path/inline of existing tables.")
    ap.add_argument("--selections", required=True, help='JSON of qualifiers → value (or list of {"k":v}).')
    ap.add_argument("--model", required=False, default="gpt-4o-mini")
    ap.add_argument("--temperature", required=False, type=float, default=0.2)
    args = ap.parse_args()

    tables_spec = (args.tables)
    selections = _normalize_selections(_load_json_from_path_or_text(args.selections))

    result = build_formula_chain(
        user_prompt=args.prompt,
        tablename=args.tablename,
        tables_spec=tables_spec if isinstance(tables_spec, list) else [],
        selections=selections,
        model=args.model,
        temperature=float(args.temperature),
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
