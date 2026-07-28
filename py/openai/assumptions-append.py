#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Assumptions Diff (Ion Works) — Return ONLY new items (labels not present in existing).
- Input: existing assumptions (wire map or JSON) + user prompt.
- Output: a single dict mapping { "<label>": "<value>", ... } for just the new rows.

Ion params
----------
param(1) = existing assumptions (JSON/path/noisy). Supported:
           A) Ion 2-col wire format: { "Assumptions[0:0][0:0]": "Label", ... }
           B) JSON: {"assumptions":[{"label":"…","value":"…"}, ...]} or [{"label":"…","value":"…"}, ...]
param(2) = user prompt
param(3) = model (optional; default gpt-4o-mini)
param(4) = temperature (optional; default 0.2)
"""

import os
import re
import json
from typing import Dict, List, Tuple, Any
from urllib.parse import unquote

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---------- regex & helpers ----------
# Matches: Table[i:i][j:j]  -> groups: (table, i, j)
_KEY_RE = re.compile(r'^\s*([^\[\]]+?)\s*\[(\d+):(\d+)\]\s*\[(\d+):(\d+)\]\s*$')

def _decode(s: Any) -> str:
    try:
        return unquote(str(s))
    except Exception:
        return str(s)

def _maybe_json_load(s: str):
    try:
        return json.loads(s)
    except Exception:
        return None

def _looks_like_path(raw: str) -> bool:
    if not raw or len(raw) > 240:
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

def _extract_json_snippet(raw: str):
    for opener, closer in (("{", "}"), ("[", "]")):
        if opener in raw and closer in raw:
            start, end = raw.find(opener), raw.rfind(closer)
            if 0 <= start < end:
                snip = raw[start : end + 1]
                obj = _maybe_json_load(snip)
                if obj is not None:
                    return obj
    return None

def _load_json_from_path_or_text(s: Any):
    if isinstance(s, (list, dict)):
        return s
    raw = _decode(s or "").strip()
    if not raw:
        return {}
    if _looks_like_path(raw):
        return _read_path(raw)
    obj = _maybe_json_load(raw)
    if obj is not None:
        return obj
    obj = _extract_json_snippet(raw)
    if obj is not None:
        return obj
    obj = _maybe_json_load(raw.replace("'", '"'))
    if obj is not None:
        return obj
    return {}

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _norm_label(lbl: str) -> str:
    s = str(lbl or "").strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "Item"

def _parse_assumptions_wire(obj: Dict[str, Any]) -> Tuple[str, List[Dict[str, str]]]:
    """Parse Ion 2-col wire format to (table_name, rows[{label,value}])."""
    if isinstance(obj, dict) and "assumptions" in obj and isinstance(obj["assumptions"], list):
        rows = [{"label": _norm_label(it.get("label","")), "value": str(it.get("value",""))}
                for it in obj["assumptions"]]
        return "Assumptions", rows

    tables_seen = set()
    for k in obj.keys():
        m = _KEY_RE.match(k)
        if m:
            tables_seen.add(m.group(1))
    tname = "Assumptions"
    if tables_seen and "Assumptions" not in tables_seen:
        tname = sorted(tables_seen)[0]

    rows: List[Dict[str, str]] = []
    j = 1
    while True:
        k_label = _key(tname, 0, j)
        k_value = _key(tname, 1, j)
        if k_label not in obj and k_value not in obj:
            break
        lab = _norm_label(obj.get(k_label, ""))
        val = obj.get(k_value, "")
        rows.append({"label": lab, "value": str(val)})
        j += 1

    return tname, rows

# ---------- LLM call ----------
ASSUMPTIONS_JSON_INSTRUCTIONS = """
You generate ONLY a two-column 'Assumptions' list for a financial/operational model.

Return STRICT JSON:
{ "assumptions": [ {"label":"…","value":"…"}, ... ] }

Rules:
- 10–40 items derived from the user prompt; concise & machine-friendly labels (snake_case / Title_Case).
- Include revenue drivers, timeframe, FTE by function, payroll inputs, COGS, OPEX, tax_rate (0..1), depreciation_years,
  working_capital assumptions, initial_capital/capex, currency, months_in_year, start_year, Annual_Growth_Rate (default set).
- Percentages are fractions (e.g., 0.25 for 25%).
- No commentary, no other tables, valid JSON only.
"""

def _chat_json(*, prompt: str, model: str, temperature: float) -> List[Dict[str, Any]]:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a careful financial modeling assistant. You STRICTLY follow schemas."},
            {"role": "user", "content": f"{ASSUMPTIONS_JSON_INSTRUCTIONS}\n\nUser prompt:\n{prompt.strip()}"},
        ],
        max_tokens=2000,
    )
    text = (resp.choices[0].message.content or "").strip()
    try:
        data = json.loads(text)
    except Exception:
        start = text.find("{"); end = text.rfind("}")
        data = json.loads(text[start:end+1]) if (start!=-1 and end!=-1 and end>start) else {"assumptions":[]}
    items = data.get("assumptions") or []
    out: List[Dict[str,str]] = []
    seen = set()
    for it in items:
        lab = _norm_label(it.get("label",""))
        if not lab or lab in seen:
            continue
        val = it.get("value","")
        out.append({"label": lab, "value": str(val)})
        seen.add(lab)
    return out

# ---------- Diff (only new) ----------
def _only_new_rows(existing: List[Dict[str, str]], incoming: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Return rows that are present in 'incoming' but NOT in 'existing' (by normalized label).
    - Existing values are ignored; we only check label existence.
    - Order is the incoming order (stable).
    """
    existing_keys = { _norm_label(r["label"]).lower() for r in existing }
    new_rows: List[Dict[str, str]] = []
    for r in incoming:
        k = _norm_label(r["label"]).lower()
        if k not in existing_keys:
            new_rows.append({"label": _norm_label(r["label"]), "value": str(r["value"])})
    return new_rows

def _rows_to_label_value_dict(rows: List[Dict[str, str]]) -> Dict[str, str]:
    """Convert list of {'label','value'} to a flat dict {label: value}."""
    out: Dict[str, str] = {}
    for kv in rows:
        lab = _norm_label(kv.get("label",""))
        if not lab:
            continue
        out[lab] = str(kv.get("value",""))
    return out

# ---------- Orchestrator ----------
def run_return_new_assumptions(existing_payload: Any, user_prompt: str, *, model: str, temperature: float) -> Dict[str, str]:
    works.msg("🔎 parsing existing assumptions…")

    loaded_existing = _load_json_from_path_or_text(existing_payload)
    table_name, existing_rows = _parse_assumptions_wire(loaded_existing if isinstance(loaded_existing, dict) else {})

    # Fallbacks if existing payload is JSON list or {"assumptions":[...]}
    if not existing_rows:
        if isinstance(loaded_existing, dict) and "assumptions" in loaded_existing:
            existing_rows = [{"label": _norm_label(it.get("label","")), "value": str(it.get("value",""))}
                             for it in loaded_existing.get("assumptions") or []]
        elif isinstance(loaded_existing, list):
            existing_rows = [{"label": _norm_label(it.get("label","")), "value": str(it.get("value",""))}
                             for it in loaded_existing]

    works.msg("🧠 requesting assumptions from GPT…")
    incoming_rows = _chat_json(prompt=user_prompt, model=model, temperature=temperature)

    works.msg("🧮 computing diff (only new labels)…")
    only_new = _only_new_rows(existing_rows, incoming_rows)

    # Build flat dict containing only the new rows: {label: value}
    return _rows_to_label_value_dict(only_new)

# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    works.msg("🔧 loading assumptions diff tool (only-new)…")

    try:
        raw_existing = works.param(1)
    except Exception:
        raw_existing = {}

    try:
        user_prompt = str(works.param(2) or "").strip()
        if not user_prompt:
            works.resolve({"error": "param(2) user prompt is required"})
            return 1
    except Exception as e:
        works.resolve({"error": f"param(2) missing: {e}"})
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
        updated = run_return_new_assumptions(raw_existing, user_prompt, model=model, temperature=temperature)
        works.resolve(updated)  # Return ONLY the new rows as a flat {label: value} dict
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "assumptions-diff-only-new",
        })
        return 1

# bootstrap
if __name__ == "__main__":
    _main_ion("gpt-4o-mini")
