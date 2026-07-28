#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — Local Control Detector (no GPT)

Param(1): table dict (flat grid or 2-D wells)

Behavior:
- Extract headers & rows from the table (supports flat-grid wells{x,y,...} or wells[col][row]).
- Uses ONLY local regex/vocabulary rules to identify control rows:
  Negative Control, Positive Control, Untreated Control (UTC), Vehicle Control (DMSO/VC/VEH),
  No Template Control (NTC), No RT Control (NRT), Blank, Calibrator, Housekeeping.
- Pulls authoritative `well_uid` from the Well-column cell's `uid` attribute (if present).

Success Output:
{
  "status": "ok",
  "table_name": str,
  "headers": [...],
  "controls": {
    "control_rows": [
      {"row_index": int, "type": str, "well": str, "well_uid": str, "reason": str, "cells": {...}}
    ],
    "selected_wells": [str],
    "selected_well_uids": [str],
    "by_type": {
      "Negative Control": {"wells": [...], "well_uids": [...]},
      "Positive Control": {"wells": [...], "well_uids": [...]},
      "Untreated Control": {...},
      "Vehicle Control": {...},
      "No Template Control": {...},
      "No RT Control": {...},
      "Blank": {...},
      "Calibrator": {...},
      "Housekeeping": {...},
      "Generic Control": {...}
    },
    "notes": [str]
  }
}

Error Output:
{"status": "❌ error", "error": "<details>"}
"""

import json, re
from typing import Any, Dict, List, Tuple, Optional

from ion import works  # type: ignore


# --------------------- utils ---------------------

def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)

def _cell_value(cell: Any) -> str:
    if isinstance(cell, dict):
        # Primary fields that usually carry human text
        for k in ("value", "name", "position", "label", "title"):
            val = cell.get(k)
            if val not in (None, ""):
                return str(val).strip()
        props = cell.get("properties") if isinstance(cell.get("properties"), dict) else None
        if props:
            for k in ("header", "title", "label"):
                val = props.get(k)
                if val not in (None, ""):
                    return str(val).strip()
        return ""
    return str(cell).strip()


# --------------------- extract headers, rows, raw ---------------------

def _headers_rows_raw(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[str]], List[List[Any]]]:
    name = _safe_str(table.get("name") or "Untitled Table")
    wells = table.get("wells")

    # Flat grid wells: [{x,y,...}, ...]
    if isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]:
        try:
            width = int(table.get("cols") or max(int(c.get("x", -1)) for c in wells) + 1)
        except Exception:
            width = 1
        by_xy: Dict[Tuple[int,int], Any] = {}
        max_y = 0
        for c in wells:
            try:
                x = int(c.get("x", -1)); y = int(c.get("y", -1))
            except Exception:
                continue
            if x < 0 or y < 0:
                continue
            by_xy[(x,y)] = c
            if y > max_y:
                max_y = y

        headers: List[str] = []
        for x in range(width):
            cell = by_xy.get((x,0))
            headers.append(_cell_value(cell) if cell is not None else f"Col{x+1}")

        rows: List[List[str]] = []
        raw:  List[List[Any]] = []
        for y in range(1, max_y+1):
            row_vals: List[str] = []
            row_raw:  List[Any] = []
            for x in range(width):
                cell = by_xy.get((x,y))
                row_raw.append(cell)
                row_vals.append(_cell_value(cell) if cell is not None else "")
            if any(v.strip() for v in row_vals):
                rows.append(row_vals)
                raw.append(row_raw)

        if not any(h.strip() for h in headers):
            headers = [f"Col{i+1}" for i in range(width)]

        return name, headers, rows, raw

    # 2-D wells: wells[x][y]
    if isinstance(wells, list) and wells and isinstance(wells[0], list):
        width = len(wells)
        height = max((len(col) for col in wells if isinstance(col, list)), default=0)
        if width <= 0 or height <= 0:
            return name, ["Col1"], [], []

        headers: List[str] = []
        for x in range(width):
            top = wells[x][0] if (x < len(wells) and len(wells[x]) > 0) else None
            headers.append(_cell_value(top) if top is not None else f"Col{x+1}")

        rows: List[List[str]] = []
        raw:  List[List[Any]] = []
        for y in range(1, height):
            row_vals: List[str] = []
            row_raw:  List[Any] = []
            for x in range(width):
                cell = wells[x][y] if (x < len(wells) and y < len(wells[x])) else None
                row_raw.append(cell)
                row_vals.append(_cell_value(cell))
            if any(v.strip() for v in row_vals):
                rows.append(row_vals)
                raw.append(row_raw)

        if not any(h.strip() for h in headers):
            headers = [f"Col{i+1}" for i in range(width)]

        return name, headers, rows, raw

    # Fallback
    return name, ["Col1"], [], []


# --------------------- column binding ---------------------

def _find_col(headers: List[str], keys: List[str]) -> Optional[int]:
    hlow = [h.lower() for h in headers]
    keys_l = [k.lower() for k in keys]
    for i, h in enumerate(hlow):
        for k in keys_l:
            if k in h:
                return i
    return None

def bind_columns(headers: List[str]) -> Dict[str, Optional[int]]:
    return {
        "well":   _find_col(headers, ["wellposition","well position","well_id","well id","well","position"]),
        "sample": _find_col(headers, ["sample","specimen","patient","subject","condition","group","arm","cohort","line","clone"]),
        "target": _find_col(headers, [
            "target","gene","assay","primer","protein","biomarker","transcript","rna","dna","peptide",
            "compound","drug","enzyme","ligand","metabolite","analyte","pathway","cytokine","chemokine",
            "mutation","variant","isoform","antigen","epitope","antibody","reporter","probe",
            "dose","concentration","exposure","treatment","response","efficacy","toxicity","safety",
            "adverse event","pharmacokinetic","pharmacodynamic","half-life","auc","cmax","tmax",
            "ct","cq","intensity","absorbance","od","signal","luminescence","activity","rate",
            "atp","nadh","glucose","lactate","ph","ion","calcium","sodium","potassium","chloride"
        ]),
        "task":   _find_col(headers, ["task","role","type","condition","control","treatment","sample type","designation","group type"]),
    }


# --------------------- vocab & patterns ---------------------

HOUSEKEEPING = {
    "gapdh","actb","b2m","rplp0","rpl13a","tbp","ppia","pgk1","gusb","hprt","hprt1","18s","rna18s",
    "sdha","ubc","ywhaz","tubb","28s"
}

# Order matters (first match wins)
CONTROL_RULES = [
    ("No Template Control",   re.compile(r"\bntc\b|no\s*template", re.I)),
    ("No RT Control",         re.compile(r"\bnrt\b|no\s*rt", re.I)),
    ("Positive Control",      re.compile(r"\bpos(?:ctrl)?\b|positive\s*control", re.I)),
    ("Negative Control",      re.compile(r"\bneg(?:ctrl)?\b|negative\s*control", re.I)),
    ("Untreated Control",     re.compile(r"\butc\b|\buntreated\b", re.I)),
    ("Vehicle Control",       re.compile(r"\bvc\b|\bveh\b|vehicle|dmso|ethanol|etoh|buffer", re.I)),
    ("Calibrator",            re.compile(r"\bcalib(?:rator)?\b|\bcal\b", re.I)),
    ("Blank",                 re.compile(r"\bblank\b|\bh2o\b|\bwater\b|\bpbs\b", re.I)),
    # Housekeeping by gene symbol (matched separately below)
    ("Housekeeping",          re.compile(r"$^")),  # placeholder; handled explicitly
    ("Generic Control",       re.compile(r"\bcontrol\b", re.I)),
]

def detect_control_type(sample: str, target: str, task: str) -> Optional[Tuple[str, str]]:
    """
    Returns (type, reason) if detected, else None.
    """
    blob = " ".join(filter(None, [sample, target, task])).strip()
    blob_l = blob.lower()

    # Housekeeping gene quick check
    t_norm = re.sub(r"[^a-z0-9]+", "", target.lower()) if target else ""
    if t_norm in HOUSEKEEPING:
        return ("Housekeeping", f"Target {target} is a known housekeeping gene")

    # Rules precedence
    for ctype, rx in CONTROL_RULES:
        if ctype == "Housekeeping":
            continue
        if rx.search(blob_l):
            return (ctype, f"Matched pattern for {ctype}")

    # If we saw "control" anywhere, but no specific type
    if re.search(r"\bcontrol\b", blob_l):
        return ("Generic Control", "Contains 'control'")

    return None


# --------------------- main analyze ---------------------

def analyze(table: Dict[str, Any]) -> Dict[str, Any]:
    try:
        table_name, headers, rows, raw = _headers_rows_raw(table)
    except Exception as e:
        return {"status": "❌ error", "error": f"Table parse failed: {e}"}

    bindings = bind_columns(headers)
    col_well   = bindings.get("well")
    col_sample = bindings.get("sample")
    col_target = bindings.get("target")
    col_task   = bindings.get("task")

    control_rows: List[Dict[str, Any]] = []
    wells_set, uids_set = set(), set()

    for i, row in enumerate(rows, start=1):
        sample = row[col_sample] if isinstance(col_sample, int) and col_sample < len(row) else ""
        target = row[col_target] if isinstance(col_target, int) and col_target < len(row) else ""
        task   = row[col_task]   if isinstance(col_task,   int) and col_task   < len(row) else ""
        well   = row[col_well]   if isinstance(col_well,   int) and col_well   < len(row) else ""

        hit = detect_control_type(sample, target, task)
        if not hit:
            continue

        ctype, reason = hit
        # authoritative well_uid from raw cell in Well column
        well_uid = ""
        if isinstance(col_well, int) and i-1 < len(raw) and col_well < len(raw[i-1]):
            cell = raw[i-1][col_well]
            if isinstance(cell, dict):
                uid = cell.get("uid")
                if isinstance(uid, (str, int)):
                    well_uid = str(uid)

        control_rows.append({
            "row_index": i,
            "type": ctype,
            "well": well,
            "well_uid": well_uid,
            "reason": reason,
            "cells": {h: (row[j] if j < len(row) else "") for j, h in enumerate(headers)},
        })
        if well:
            wells_set.add(well)
        if well_uid:
            uids_set.add(well_uid)

    # Group by type for convenience
    by_type: Dict[str, Dict[str, List[str]]] = {}
    for r in control_rows:
        t = r["type"]
        bt = by_type.setdefault(t, {"wells": [], "well_uids": []})
        if r["well"]:
            bt["wells"].append(r["well"])
        if r["well_uid"]:
            bt["well_uids"].append(r["well_uid"])

    return {
        "status": "ok",
        "table_name": table_name,
        "headers": headers,
        "controls": {
            "control_rows": control_rows,
            "selected_wells": sorted(wells_set),
            "selected_well_uids": sorted(uids_set),
            "by_type": by_type,
            "notes": [
                "Local rule-based detection only (no GPT).",
                "Patterns include UTC/Untreated, VC/Vehicle/DMSO, NTC, NRT, POS/NEG controls, Blank, Calibrator, and common housekeeping genes."
            ]
        }
    }


# --------------------- ion entry ---------------------

def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table (dict/json)"})
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

    try:
        result = analyze(table)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
