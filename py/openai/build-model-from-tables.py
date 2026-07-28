#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Generalized linker: connect ANY two tables in an AssignLang/ION model.

What this script does
---------------------
Given:
  • source_table (ion param 1)
  • target_table (ion param 2)
  • base_json_in (ion param 3)  ← your current model JSON (inline string OR a path)
  • model_id     (ion param 4, optional; default: gpt-4o-mini)

It:
  1) Loads the base model JSON (tables, formulas, annotations, units) from param(3).
     - If param(3) starts with '{' or '[', it is treated as inline JSON text.
     - Otherwise, it is treated as a filesystem path to a JSON file.
  2) Calls an LLM to propose a generalized set of tables + formulas linking SOURCE → TARGET.
  3) Merges/sanitizes the result:
       - Headers for all tables
       - Ensure every referenced table[Label] exists (default constant "0")
       - Strip whitespace in formulas
       - Rewrite range refs like table[1:1][5:5] to table[Some_Label] when possible
       - Minimal annotations & units coverage
  4) Returns the UPDATED model via works.resolve(...).

Ion usage examples
------------------
# Example A: pass inline JSON directly as param(3)
works.run(
  "linker",
  "startup_costs",             # param(1) = source
  "kpi_forecasts",             # param(2) = target
  '{"tables":{"startup_costs[0:0][0:0]":"Label","startup_costs[1:1][0:0]":"Value",'
  '"startup_costs[0:0][1:1]":"Laboratory_Setup_Costs","startup_costs[1:1][1:1]":"500000 USD"},'
  '"formulas":{},"annotations":{},"units":{}}',   # param(3) = inline JSON
  "gpt-4o-mini"                # param(4) optional
)

# Example B: pass a path to a JSON file as param(3)
works.run(
  "linker",
  "startup_costs",             # source
  "kpi_forecasts",             # target
  "/path/to/current_model.json", # param(3) = path to file
  "gpt-4o-mini"
)

Returns
-------
A dict with exactly four keys:
  {"tables": {...}, "formulas": {...}, "annotations": {...}, "units": {...}}
"""

import os
import re
import json
from typing import Dict, Any, Optional, Tuple, List, Set

# ---------- ION ----------
from ion import works  # type: ignore

# ---------- OpenAI ----------
from openai import OpenAI

# ===================== Utilities =====================

_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')
_RANGE_REF_RE = re.compile(r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<xi>\d+):\d+\]\[(?P<yj>\d+):\d+\]')
_REF_RE = re.compile(r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>(?:[A-Za-z_][A-Za-z0-9_]*|"[^"\n\r]*"))\]')
_IDENT_LABEL_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

def _key(t: str, i: int, j: int) -> str:
    return f"{t}[{i}:{i}][{j}:{j}]"

def _parse_key(k: str) -> Optional[Tuple[str, int, int]]:
    m = _KEY_RE.match(k or "")
    if not m: return None
    return (m.group(1), int(m.group(2)), int(m.group(3)))

def ensure_headers(tbl: Dict[str, Any], t: str) -> None:
    tbl.setdefault(_key(t,0,0), "Label")
    tbl.setdefault(_key(t,1,0), "Value")

def next_row_index(tbl: Dict[str, Any], t: str) -> int:
    max_j = 0
    for k in tbl.keys():
        p = _parse_key(k)
        if p and p[0] == t:
            max_j = max(max_j, p[2])
    return max(1, max_j + 1)

def add_const(tables: Dict[str, Any], t: str, label: str, value: str) -> int:
    ensure_headers(tables, t)
    j = next_row_index(tables, t)
    tables[_key(t,0,j)] = label
    tables[_key(t,1,j)] = value
    return j

def extract_named_refs(expr: str) -> List[Tuple[str, str]]:
    out = []
    for m in _REF_RE.finditer(expr or ""):
        table = m.group("table")
        raw_label = m.group("label")
        label = raw_label[1:-1] if (raw_label.startswith('"') and raw_label.endswith('"')) else raw_label
        out.append((table, label))
    return out

def _quote_label_if_needed(label: str) -> str:
    if _IDENT_LABEL_RE.match(label or ""):
        return label
    return '"' + label.replace('\\', '\\\\').replace('"', '\\"') + '"'

def rewrite_range_refs_to_named(model: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(model or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    # Build (table,row)->label map
    row_label: Dict[Tuple[str,int], str] = {}
    for k, v in tables.items():
        p = _parse_key(k)
        if not p: continue
        t,i,j = p
        if i == 0 and j >= 1 and isinstance(v, str):
            row_label[(t,j)] = v

    def _sub(m: re.Match) -> str:
        t = m.group("table")
        yj = int(m.group("yj"))
        lab = row_label.get((t, yj))
        if not lab:
            return m.group(0)
        return f"{t}[{_quote_label_if_needed(lab)}]"

    for k, expr in list(formulas.items()):
        if not isinstance(expr, str): continue
        formulas[k] = _RANGE_REF_RE.sub(_sub, expr)

    data["formulas"] = formulas
    return data

def ensure_refs_exist(model: Dict[str, Any], default_value: str = "0") -> Dict[str, Any]:
    data = dict(model or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    def ensure_table_label(t: str, label: str):
        ensure_headers(tables, t)
        # Exists?
        for k, v in tables.items():
            p = _parse_key(k)
            if not p: continue
            if p[0] == t and p[1] == 0 and p[2] >= 1 and isinstance(v, str) and v == label:
                return
        j = next_row_index(tables, t)
        tables[_key(t,0,j)] = label
        tables[_key(t,1,j)] = default_value

    for _, expr in formulas.items():
        if not isinstance(expr, str): continue
        for (t, lab) in extract_named_refs(expr):
            ensure_table_label(t, lab)

    data["tables"] = tables
    return data

def strip_ws_in_formulas(model: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(model or {})
    formulas = dict(data.get("formulas") or {})
    for k, v in list(formulas.items()):
        if isinstance(v, str):
            formulas[k] = re.sub(r"\s+", "", v)
    data["formulas"] = formulas
    return data

def enforce_units_annotations(model: Dict[str, Any], default_unit: str = "unitless") -> Dict[str, Any]:
    data = dict(model or {})
    tables = dict(data.get("tables") or {})
    units  = dict(data.get("units") or {})
    ann    = dict(data.get("annotations") or {})

    labels_by_table: Dict[str, Set[str]] = {}
    for k, v in tables.items():
        p = _parse_key(k)
        if not p: continue
        t,i,j = p
        if i == 0 and j >= 1 and isinstance(v, str):
            labels_by_table.setdefault(t, set()).add(v)

    for t, labs in labels_by_table.items():
        units.setdefault(t, {})
        for lab in labs:
            units[t].setdefault(lab, default_unit)
        ann.setdefault(t, f"Auto-generated table '{t}' produced by generalized linker.")

    data["units"] = units
    data["annotations"] = ann
    return data

def _compact_json(obj: Any, max_len: int = 40000) -> str:
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return s if len(s) <= max_len else s[:max_len-100] + "...(truncated)..."

# ===================== LLM call =====================

SYS_LINKER = (
    "You are a financial/analytical model linker. "
    "Given two existing tables from a spreadsheet-like JSON model, "
    "propose a GENERALIZED linkage path using ONLY arithmetic (+-*/^) and named references of the form table[Label]. "
    "Return JSON ONLY with EXACTLY these four keys: tables, formulas, annotations, units.\n"
    "Rules:\n"
    "- You MAY add new tables (avoid renaming existing tables/labels).\n"
    "- Provide headers for every table: [0:0][0:0]='Label', [1:1][0:0]='Value'.\n"
    "- No ranges, no dot-notation, no functions. Only table[Label] with arithmetic and parentheses.\n"
    "- Ensure EVERY referenced table[Label] exists in 'tables' (create missing labels with a default string value).\n"
    "- Keep labels unique per table. Keep it minimal but sufficient to map SOURCE → TARGET meaningfully.\n"
    "- Units should be simple words (USD, count, fraction, months, unitless). "
    "- Annotations: one sentence per table."
)

def prompt_for_link(source_table: str,
                    target_table: str,
                    model_json: Dict[str, Any]) -> str:
    """
    Build a compact, model-friendly prompt that summarizes the two tables and context.
    """
    tables = model_json.get("tables") or {}
    units  = model_json.get("units") or {}
    ann    = model_json.get("annotations") or {}

    def summarize_table(t: str) -> Dict[str, Any]:
        labels = []
        values = []
        for k, v in tables.items():
            p = _parse_key(k)
            if not p: continue
            tt,i,j = p
            if tt != t or j == 0: continue
            if i == 0 and isinstance(v, str):
                labels.append((j, v))
            elif i == 1 and isinstance(v, str):
                values.append((j, v))
        labels.sort(); values.sort()
        rows = []
        i = j = 0
        # simple join by row index for preview
        while i < len(labels) or j < len(values):
            lj, lab = labels[i] if i < len(labels) else (None, None)
            vj, val = values[j] if j < len(values) else (None, None)
            if lj is not None and (vj is None or lj <= vj):
                rows.append({"row": lj, "label": lab, "value": None})
                i += 1
            elif vj is not None:
                rows.append({"row": vj, "label": None, "value": val})
                j += 1
        return {
            "name": t,
            "labels_count": len([r for r in rows if r["label"]]),
            "units": units.get(t, {}),
            "annotation": ann.get(t, ""),
            "preview": rows[:20],
        }

    src_summary = summarize_table(source_table)
    tgt_summary = summarize_table(target_table)

    all_tables = sorted({ (_parse_key(k)[0]) for k in tables.keys() if _parse_key(k) })
    context = {
        "source_table": source_table,
        "target_table": target_table,
        "all_table_names": all_tables,
        "source_preview": src_summary,
        "target_preview": tgt_summary,
    }
    return (
        "LINK THESE TWO TABLES:\n"
        + json.dumps(context, ensure_ascii=False, indent=2)
        + "\nReturn JSON ONLY with keys: tables, formulas, annotations, units."
    )

def chat_linker_call(source_table: str,
                     target_table: str,
                     model_json: Dict[str, Any],
                     model_id: str = "gpt-4o-mini",
                     temperature: float = 0.1) -> Dict[str, Any]:
    client = OpenAI()
    content = client.chat.completions.create(
        model=model_id,
        response_format={"type": "json_object"},
        temperature=temperature,
        messages=[
            {"role": "system", "content": SYS_LINKER},
            {"role": "user",   "content": prompt_for_link(source_table, target_table, model_json)},
        ],
    ).choices[0].message.content or "{}"

    try:
        return json.loads(content)
    except Exception:
        start = content.find("{"); end = content.rfind("}")
        return json.loads(content[start:end+1]) if start >=0 and end > start else {"tables":{}, "formulas":{}, "annotations":{}, "units":{}}

# ===================== Merge & Validate =====================

def merge_model(base: Dict[str, Any], add: Dict[str, Any]) -> Dict[str, Any]:
    out = {
        "tables": dict(base.get("tables") or {}),
        "formulas": dict(base.get("formulas") or {}),
        "annotations": dict(base.get("annotations") or {}),
        "units": dict(base.get("units") or {}),
    }
    for top in ("tables","formulas","annotations","units"):
        extra = dict(add.get(top) or {})
        out[top].update(extra)
    return out

def enforce_headers_everywhere(model: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(model or {})
    tables = dict(data.get("tables") or {})
    tnames: Set[str] = set()
    for k in list(tables.keys()) + list((data.get("formulas") or {}).keys()):
        p = _parse_key(k)
        if p: tnames.add(p[0])
    for t in tnames:
        ensure_headers(tables, t)
    data["tables"] = tables
    return data

def sanitize_pipeline(model: Dict[str, Any]) -> Dict[str, Any]:
    m = enforce_headers_everywhere(model)
    m = ensure_refs_exist(m, default_value="0")
    m = strip_ws_in_formulas(m)
    m = rewrite_range_refs_to_named(m)
    m = ensure_refs_exist(m, default_value="0")  # again, after rewrites
    m = enforce_units_annotations(m, default_unit="unitless")
    return m

# ===================== base_json_in loader =====================

def _load_json_from_path_or_text(s: str) -> Dict[str, Any]:
    """
    Load model JSON from:
      - Inline JSON string (starts with '{' or '['), OR
      - File path (any other string): the file will be opened and parsed as JSON.

    If empty, returns an empty model scaffold.
    """
    s = (s or "").strip()
    if not s:
        return {"tables": {}, "formulas": {}, "annotations": {}, "units": {}}
    if s.startswith("{") or s.startswith("["):
        return json.loads(s)  # inline JSON
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

# ===================== ION entry =====================

def main_ion(default_model: str = "gpt-4o-mini") -> int:
    """
    Ion parameters:
      param(1): source_table (e.g., "startup_costs")
      param(2): target_table (e.g., "kpi_forecasts")
      param(3): base_json_in  (inline JSON string OR path to JSON file)  ← documented here
      param(4): model_id      (optional; defaults to gpt-4o-mini)

    'base_json_in' is the raw string from param(3). This function parses it into a dict:
      - If it's inline JSON, it's parsed directly.
      - If it's a file path, that file is opened and parsed.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY must be set")

    source_table = str(works.param(1) or "").strip()
    target_table = str(works.param(2) or "").strip()
    base_json_in = str(works.param(3) or "").strip()   # ← THIS is base_json_in
    model_id = str(works.param(4) or default_model).strip() or default_model

    if not source_table or not target_table:
        raise RuntimeError("Ion: param(1)=source_table and param(2)=target_table are required.")
    if not base_json_in:
        works.msg("[linker] param(3) was empty; starting from an empty model scaffold.")

    works.msg(f"[linker] Source={source_table} → Target={target_table}")
    works.msg(f"[linker] Loading base model from param(3): {'inline JSON' if base_json_in[:1] in '{[' else 'file path'}")
    base_model = _load_json_from_path_or_text(base_json_in)
    works.msg("[linker] Loaded base model.")

    # Call LLM to propose generalized linkage
    proposal = chat_linker_call(source_table, target_table, base_model, model_id=model_id, temperature=0.15)
    works.msg(f"[linker] LLM proposed: tables={len(proposal.get('tables') or {})}, formulas={len(proposal.get('formulas') or {})}")

    # Merge & sanitize
    merged = merge_model(base_model, proposal)
    final  = sanitize_pipeline(merged)
    works.msg("[linker] Sanitization complete.")

    works.resolve(final)
    return 0

if __name__ == "__main__":
    works.msg("[linker] Starting generalized linker…")
    main_ion("gpt-4o-mini")
