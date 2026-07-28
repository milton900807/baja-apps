#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — column selector from user prompt

Param(1): table dict or JSON string of a table dict
Param(2): user prompt (string) describing which columns to select

Result:
{
  "status": "ok",
  "table_name": ...,
  "headers": [...],
  "prompt": "...",
  "selected": {
      "indices": [0,2,...],
      "names": ["Well", "Target", ...]
  },
  "unmatched_prompt_terms": [...],   # best-effort
  "columns": {...},                  # same structure as annotate_headers() output
  "role_headers": {...},
  "header_annotations": [...]
}
"""

import json, re
from typing import Any, Dict, List, Tuple, Optional
from ion import works  # type: ignore

# ---------- utils ----------
def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)

def _cell_value(cell: Any) -> str:
    if isinstance(cell, dict):
        if "value" in cell and cell["value"] not in (None, ""):
            return _safe_str(cell["value"]).strip()
        for k in ("name","position","label","title"):
            val = cell.get(k)
            if val not in (None,""):
                return _safe_str(val).strip()
        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("header","title","label"):
                val = props.get(k)
                if val not in (None,""):
                    return _safe_str(val).strip()
        return ""
    return _safe_str(cell).strip()

def synth_headers(n: int) -> List[str]:
    return [f"Col{i+1}" for i in range(max(0,n))]

# ---------- header + row extraction ----------
def _headers_from_flat_grid(table: Dict[str, Any]) -> Optional[List[str]]:
    wells = table.get("wells")
    if not (isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]):
        return None
    if isinstance(table.get("cols"), int) and table["cols"] > 0:
        width = table["cols"]
    else:
        try:
            width = max(int(c.get("x", -1)) for c in wells) + 1
        except Exception:
            return None
    by_xy: Dict[Tuple[int,int], Dict[str, Any]] = {}
    for c in wells:
        try:
            x = int(c.get("x")); y = int(c.get("y"))
        except Exception:
            continue
        if x < 0 or y < 0:
            continue
        by_xy[(x,y)] = c
    hdrs: List[str] = []
    for x in range(width):
        cell = by_xy.get((x,0))
        hdrs.append(_cell_value(cell) if cell is not None else "")
    if not any(h.strip() for h in hdrs):
        return synth_headers(width)
    return [h if h.strip() else f"Col{i+1}" for i,h in enumerate(hdrs)]

def _headers_from_2d_wells(table: Dict[str, Any]) -> Optional[List[str]]:
    wells = table.get("wells")
    if not (isinstance(wells, list) and wells and isinstance(wells[0], list)):
        return None
    width = len(wells)
    height = max((len(col) for col in wells if isinstance(col, list)), default=0)
    if width <= 0 or height <= 0:
        return synth_headers(max(1,width)) if width else ["Col1"]
    headers: List[str] = []
    for x in range(width):
        col = wells[x] if x < len(wells) and isinstance(wells[x], list) else []
        top = col[0] if len(col) > 0 else None
        headers.append(_cell_value(top))
    if not any(h.strip() for h in headers):
        return synth_headers(width)
    return [h if h.strip() else f"Col{i+1}" for i,h in enumerate(headers)]

def extract_headers_rows_and_name(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[str]]]:
    """Return (table_name, headers, rows) — rows are mostly unused here."""
    name = _safe_str(table.get("name") or "Untitled Table")
    headers = _headers_from_flat_grid(table)
    if headers is not None:
        # rows not needed for column-only selection, but we keep structure consistent
        wells = table.get("wells") or []
        by_xy: Dict[Tuple[int,int], Dict[str, Any]] = {}
        max_y = -1
        for c in wells:
            try:
                x = int(c.get("x")); y = int(c.get("y"))
            except Exception:
                continue
            if x < 0 or y < 0:
                continue
            by_xy[(x,y)] = c
            if y > max_y:
                max_y = y
        rows: List[List[str]] = []
        width = len(headers)
        for y in range(1, max_y+1):
            row: List[str] = []
            for x in range(width):
                cell = by_xy.get((x,y))
                row.append(_cell_value(cell) if cell is not None else "")
            if any(v.strip() for v in row):
                rows.append(row)
        return name, headers, rows

    headers = _headers_from_2d_wells(table)
    if headers is not None:
        wells = table.get("wells") or []
        width = len(wells) if isinstance(wells, list) else len(headers)
        height = max((len(col) for col in wells if isinstance(col, list)), default=0)
        rows: List[List[str]] = []
        for y in range(1, height):
            row: List[str] = []
            for x in range(width):
                col = wells[x] if x < len(wells) and isinstance(wells[x], list) else []
                cell = col[y] if y < len(col) else None
                row.append(_cell_value(cell))
            if any(v.strip() for v in row):
                rows.append(row)
        return name, headers, rows

    return name, ["Col1"], []

# ---------- column binding ----------
def _find_col(headers: List[str], keys: List[str]) -> Optional[int]:
    hlow = [h.lower() for h in headers]
    for i, h in enumerate(hlow):
        for k in keys:
            if k in h:
                return i
    return None

def _find_all_cols(headers: List[str], keys: List[str]) -> List[int]:
    hits: List[int] = []
    hlow = [h.lower() for h in headers]
    for i, h in enumerate(hlow):
        for k in keys:
            if k in h:
                hits.append(i)
                break
    # also catch plain "cq" or "ct" as whole tokens via regex
    token_rx = re.compile(r"\b(cq|ct)\b", re.I)
    for i, h in enumerate(headers):
        if token_rx.search(h):
            if i not in hits:
                hits.append(i)
    return sorted(set(hits))

def bind_columns(headers: List[str]) -> Dict[str, Optional[int]]:
    return {
        "well":    _find_col(headers, ["wellposition","well position","position"]),
        "sample":  _find_col(headers, ["sample","specimen"]),
        "target":  _find_col(headers, ["target","gene","assay","primer"]),
        "task":    _find_col(headers, ["task","role","type"]),
        "group":   _find_col(headers, ["group","condition","treatment","arm","cohort","control","ctrl"]),
        "comment": _find_col(headers, ["comment","note","notes","annotation","description"]),
        "conc":    _find_col(headers, ["conc","concentration","std","standard","ng/µl","ng/ul","pg/ml","ng/ml","dose"]),
        "cq":      _find_col(headers, [
                        "cq","ct","cq mean","ct mean","cq value","ct value",
                        "cq avg","ct avg","cq-mean","ct-mean","cq_m","ct_m"
                   ]),
    }

def annotate_headers(headers: List[str], b: Dict[str, Optional[int]]) -> Dict[str, Any]:
    cq_all = _find_all_cols(headers, [
        "cq","ct","cq mean","ct mean","cq value","ct value",
        "cq avg","ct avg","cq-mean","ct-mean","cq_m","ct_m"
    ])
    well_all = _find_all_cols(headers, [
        "wellposition","well position","position"
    ])

    def _name(i: Optional[int]) -> Optional[str]:
        return headers[i] if (i is not None and 0 <= i < len(headers)) else None

    columns = {
        "well": b.get("well"),
        "sample": b.get("sample"),
        "target": b.get("target"),
        "cq": b.get("cq"),
        "task": b.get("task"),
        "group": b.get("group"),
        "comment": b.get("comment"),
        "conc": b.get("conc"),
        "all": {
            "cq": cq_all,
            "well": well_all
        }
    }

    role_headers = {
        "well": _name(b.get("well")),
        "sample": _name(b.get("sample")),
        "target": _name(b.get("target")),
        "cq": _name(b.get("cq")),
        "task": _name(b.get("task")),
        "group": _name(b.get("group")),
        "comment": _name(b.get("comment")),
        "conc": _name(b.get("conc")),
        "all": {
            "cq": [headers[i] for i in cq_all],
            "well": [headers[i] for i in well_all]
        }
    }

    idx_to_role: Dict[int, str] = {}
    for role in ("well","sample","target","cq","task","group","comment","conc"):
        i = b.get(role)
        if isinstance(i, int) and 0 <= i < len(headers):
            idx_to_role[i] = role
    header_annotations = [
        {"index": i, "name": headers[i], "role": idx_to_role.get(i, "other")}
        for i in range(len(headers))
    ]

    return {
        "columns": columns,
        "role_headers": role_headers,
        "header_annotations": header_annotations
    }

# ---------- prompt parsing & column selection ----------
ROLE_PROMPT_KEYWORDS: Dict[str, List[str]] = {
    "well":    ["well", "wells", "well position", "position"],
    "sample":  ["sample", "samples", "specimen"],
    "target":  ["target", "targets", "gene", "genes", "assay", "primer"],
    "cq":      ["cq", "ct", "cq value", "ct value", "cq mean", "ct mean"],
    "task":    ["task", "role", "type"],
    "group":   ["group", "groups", "condition", "treatment", "arm", "cohort", "control", "ctrl"],
    "comment": ["comment", "comments", "note", "notes", "annotation", "description"],
    "conc":    ["conc", "concentration", "standard", "std", "dose"],
}

def _split_prompt_terms(prompt: str) -> List[str]:
    # Split on commas, semicolons, slashes, "and"
    parts = re.split(r"[,\n;/]+|\band\b", prompt.lower())
    return [p.strip() for p in parts if p.strip()]

def select_columns_from_prompt(headers: List[str], prompt: str) -> Dict[str, Any]:
    """
    Heuristic selection:
      - role-based: "show well, sample, and cq columns"
      - header-based: tokens that match header substrings
    """
    p = (prompt or "").strip()
    if not p:
        return {
            "indices": [],
            "names": [],
            "unmatched_prompt_terms": []
        }

    low_prompt = p.lower()
    headers_low = [h.lower() for h in headers]

    b = bind_columns(headers)
    header_role_info = annotate_headers(headers, b)

    selected_indices: List[int] = []

    # --- role-based selection ---
    for role, keywords in ROLE_PROMPT_KEYWORDS.items():
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", low_prompt):
                if role == "cq":
                    # "all cq/ct columns"
                    all_cq = header_role_info["columns"]["all"]["cq"]
                    selected_indices.extend(all_cq)
                else:
                    idx = b.get(role)
                    if isinstance(idx, int):
                        selected_indices.append(idx)
                break  # don't double-add for same role

    # Detect phrases like "all columns" or "everything"
    if re.search(r"\ball\s+columns\b|\beverything\b|\ball\b", low_prompt):
        selected_indices.extend(range(len(headers)))

    # --- header-name based selection ---
    terms = _split_prompt_terms(p)
    unmatched_terms: List[str] = []
    for term in terms:
        before = len(selected_indices)
        for i, h in enumerate(headers_low):
            if term and term in h:
                selected_indices.append(i)
        if len(selected_indices) == before:
            # no header matched this term; track as unmatched
            unmatched_terms.append(term)

    # Deduplicate & sort
    selected_indices = sorted(set(i for i in selected_indices if 0 <= i < len(headers)))
    selected_names = [headers[i] for i in selected_indices]

    return {
        "indices": selected_indices,
        "names": selected_names,
        "unmatched_prompt_terms": sorted(set(unmatched_terms))
    }

# ---------- analyze ----------
def analyze(table: Dict[str, Any], prompt: str) -> Dict[str, Any]:
    table_name, headers, _rows = extract_headers_rows_and_name(table)
    header_role_info = annotate_headers(headers, bind_columns(headers))
    selection = select_columns_from_prompt(headers, prompt)

    return {
        "status": "ok",
        "table_name": table_name,
        "headers": headers,
        "prompt": prompt,
        "selected": selection,
        "columns": header_role_info["columns"],
        "role_headers": header_role_info["role_headers"],
        "header_annotations": header_role_info["header_annotations"],
    }

# ---------- ion entry ----------
def main() -> int:
    # Param 1: table
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table (dict/json)"})
        return 1

    # Param 2: user prompt
    try:
        prompt = works.param(2)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 2: prompt (string)"})
        return 1

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"})
            return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a table dict or JSON string of one."})
        return 1

    if not isinstance(prompt, str):
        prompt = _safe_str(prompt)

    try:
        result = analyze(table, prompt)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
