#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — Local Standard/Dilution Series Detector (no GPT)

Param(1): table dict (flat grid or 2-D wells)

Behavior:
- Extracts headers & rows from the table (supports flat-grid wells{x,y,...} or wells[col][row]).
- Uses ONLY local rules to identify standard/dilution series (e.g., "Std", "Standard", "Standard Curve", dilutions like 1:2, 1/10, 10^-1).
- Parses concentration strings when present and computes monotonic order + geometric mean fold-change between adjacent concentrations.
- Pulls authoritative `well_uid` from the Well-column cell's `uid` attribute (if present).

Success Output:
{
  "status": "ok",
  "table_name": str,
  "headers": [...],
  "standards": {
    "series": [
      {
        "label": str,
        "members": [
          {
            "row_index": int,
            "std_index": int|null,
            "well": str,
            "well_uid": str,
            "sample": str,
            "target": str,
            "concentration": str,
            "conc_value": float|null,
            "reason": str
          }
        ],
        "order": "ascending"|"descending"|null,
        "fold_change": float|null,   # geometric mean of adjacent ratios
        "basis": "concentration"|"inferred"
      }
    ],
    "selected_wells": [str],
    "selected_well_uids": [str],
    "notes": [str]
  }
}

Error Output:
{"status": "❌ error", "error": "<details>"}
"""

import json, re, math
from typing import Any, Dict, List, Tuple, Optional

from ion import works  # type: ignore


# --------------------- utils ---------------------

def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)

def _cell_value(cell: Any) -> str:
    if isinstance(cell, dict):
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

def _to_float_maybe(s: str) -> Optional[float]:
    """
    Parse a concentration or numeric string; strip common units and parse sci-notation or embedded numbers.
    Handles %, x/fold suffix, molarity-like units, etc.
    """
    if not s:
        return None
    txt = s.strip().lower()
    # Remove common units/suffixes
    txt = re.sub(r"\s*(pg/ml|ng/ml|ug/ml|µg/ml|mg/ml|pg\/ml|ng\/ml|ug\/ml|µg\/ml|mg\/ml|pm|nm|um|µm|mm|m|%|fold|x)\s*$", "", txt)
    txt = txt.replace("µ", "u").replace(",", "")
    # Normalize ratio-like numbers e.g., "1/10" -> 0.1 ; "1:2" -> 0.5 ; "10^-3" -> 0.001
    m_pow = re.match(r"^\s*10\^(-?\d+)\s*$", txt)
    if m_pow:
        try:
            return 10 ** int(m_pow.group(1))
        except Exception:
            pass
    m_ratio = re.match(r"^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$", txt)
    if m_ratio:
        try:
            a = float(m_ratio.group(1)); b = float(m_ratio.group(2))
            if b != 0:
                return a / b
        except Exception:
            pass
    # Plain float / sci-notation (or embedded first number)
    try:
        return float(txt)
    except Exception:
        m = re.search(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", txt)
        if m:
            try:
                return float(m.group(0))
            except Exception:
                return None
    return None


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
        "target": _find_col(headers, ["target","gene","assay","primer","protein","biomarker","transcript","rna","dna","peptide"]),
        "task":   _find_col(headers, ["task","role","type","condition","control","treatment","sample type","designation","group type"]),
        "conc":   _find_col(headers, ["conc","concentration","dose","std","standard","ng/µl","ng/ul","pg/ml","ng/ml","um","µm","mm","m","%","fold","x"])
    }


# --------------------- standard detection rules ---------------------

STD_LABEL_RE = re.compile(r"\bstd(?:\s*[:\-]?\s*(\d+))?\b|\bstandard(?:\s*[:\-]?\s*(\d+))?\b", re.I)
DILUTION_RE  = re.compile(r"\b(standard|std|calib(?:rator)?)\b|\b(1[:/]\d+)\b|\b10\^-?\d+\b|\b\d+[:/]\d+\b", re.I)

def _find_std_label_and_index(sample: str, target: str, task: str) -> Tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Try to detect a standard label and its (optional) index from sample/target/task.
    Returns (label, std_index, reason) or (None, None, None) if not obvious.
    """
    blob = " ".join(filter(None, [sample, target, task]))
    m = STD_LABEL_RE.search(blob)
    if m:
        label = "Standard" if "standard" in m.group(0).lower() else "Std"
        std_idx = None
        for g in (1,2):
            if m.group(g):
                try:
                    std_idx = int(m.group(g))
                except Exception:
                    pass
        return label, std_idx, f"Matched {m.group(0)}"
    # More generic dilution hits
    if DILUTION_RE.search(blob):
        return "Standard", None, "Dilution/Standard token present"
    return None, None, None


def _series_order_and_fold(conc_values: List[Optional[float]]) -> Tuple[Optional[str], Optional[float], str]:
    """
    Determine monotonic order and geometric mean fold-change between adjacent numeric concentrations.
    """
    xs = [v for v in conc_values if isinstance(v, (int, float))]
    if len(xs) < 3:
        return None, None, "Insufficient numeric concentrations for order/fold"
    asc = all(xs[i] <= xs[i+1] for i in range(len(xs)-1))
    desc = all(xs[i] >= xs[i+1] for i in range(len(xs)-1))
    if not (asc or desc):
        return None, None, "Non-monotonic concentrations"
    ratios = []
    for a, b in zip(xs[:-1], xs[1:]):
        if a is None or b is None or a == 0 or b == 0:
            continue
        ratios.append(abs(b / a))
    if len(ratios) < 2:
        return ("ascending" if asc else "descending"), None, "Too few valid adjacent ratios"
    logs = [math.log(r) for r in ratios if r > 0]
    if not logs:
        return ("ascending" if asc else "descending"), None, "No positive ratios"
    gmean = math.exp(sum(logs) / len(logs))
    return ("ascending" if asc else "descending"), round(gmean, 6), "Computed geometric mean fold-change"


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
    col_conc   = bindings.get("conc")

    # Collect candidate standard rows
    candidates: List[Dict[str, Any]] = []
    for i, row in enumerate(rows, start=1):
        sample = row[col_sample] if isinstance(col_sample, int) and col_sample < len(row) else ""
        target = row[col_target] if isinstance(col_target, int) and col_target < len(row) else ""
        task   = row[col_task]   if isinstance(col_task,   int) and col_task   < len(row) else ""
        well   = row[col_well]   if isinstance(col_well,   int) and col_well   < len(row) else ""
        conc_s = row[col_conc]   if isinstance(col_conc,   int) and col_conc   < len(row) else ""

        label, std_idx, reason = _find_std_label_and_index(sample, target, task)
        if not label and not conc_s:
            # no explicit label, no concentration cell; skip
            continue

        # authoritative well_uid from raw cell in Well column
        well_uid = ""
        if isinstance(col_well, int) and i-1 < len(raw) and col_well < len(raw[i-1]):
            cell = raw[i-1][col_well]
            if isinstance(cell, dict):
                uid = cell.get("uid")
                if isinstance(uid, (str, int)):
                    well_uid = str(uid)

        candidates.append({
            "row_index": i,
            "label": label or "Standard",
            "std_index": std_idx,
            "well": well,
            "well_uid": well_uid,
            "sample": sample,
            "target": target,
            "concentration": conc_s or "",
            "conc_value": _to_float_maybe(conc_s) if conc_s else None,
            "reason": reason or ("Concentration present" if conc_s else "Heuristic standard mention"),
        })

    if not candidates:
        return {
            "status": "ok",
            "table_name": table_name,
            "headers": headers,
            "standards": {
                "series": [],
                "selected_wells": [],
                "selected_well_uids": [],
                "notes": ["No obvious standards found by local rules."]
            }
        }

    # Group candidates into series.
    # Strategy:
    # 1) Prefer explicit Std/Standard tokens with optional indices -> group by 'label' + (target if present).
    # 2) Otherwise, group by (target if present) + presence of concentration.
    # This keeps different targets' standards separated.
    from collections import defaultdict

    groups: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    for c in candidates:
        key = (c["label"], (c["target"] or "").lower())
        groups[key].append(c)

    series_out: List[Dict[str, Any]] = []
    wells_set, uids_set = set(), set()

    for (label, target_lc), members in groups.items():
        # Sort members:
        # - If std_index exists for any, sort by (has_index, index)
        # - Else if conc_value present, sort by numeric conc
        # - Else keep input order
        any_idx = any(isinstance(m.get("std_index"), int) for m in members)
        if any_idx:
            members_sorted = sorted(members, key=lambda m: (m.get("std_index") is None, m.get("std_index") or 0))
        else:
            any_conc = any(isinstance(m.get("conc_value"), (int, float)) for m in members)
            if any_conc:
                # If most concentrations are monotonic descending in typical standard curves (high->low),
                # sorting ascending numeric is fine; order detection is handled later.
                members_sorted = sorted(members, key=lambda m: (float('inf') if m.get("conc_value") is None else m["conc_value"]))
            else:
                members_sorted = members

        conc_values = [m.get("conc_value") for m in members_sorted]
        order, fold, basis_reason = _series_order_and_fold(conc_values)
        basis = "concentration" if any(v is not None for v in conc_values) else "inferred"

        # Collect selected wells
        for m in members_sorted:
            if m["well"]:
                wells_set.add(m["well"])
            if m["well_uid"]:
                uids_set.add(m["well_uid"])

        # Emit series
        series_out.append({
            "label": label,
            "members": [
                {
                    "row_index": m["row_index"],
                    "std_index": m["std_index"] if isinstance(m["std_index"], int) else None,
                    "well": m["well"],
                    "well_uid": m["well_uid"],
                    "sample": m["sample"],
                    "target": m["target"],
                    "concentration": m["concentration"],
                    "conc_value": m["conc_value"],
                    "reason": m["reason"]
                }
                for m in members_sorted
            ],
            "order": order,
            "fold_change": fold,
            "basis": basis
        })

    return {
        "status": "ok",
        "table_name": table_name,
        "headers": headers,
        "standards": {
            "series": series_out,
            "selected_wells": sorted(wells_set),
            "selected_well_uids": sorted(uids_set),
            "notes": [
                "Local rule-based detection (no GPT).",
                "Heuristics: Std/Standard tokens with optional indices, dilution tokens (1:2, 1/10, 10^-1), presence of concentration values.",
                "Order/fold derived from numeric concentrations when available."
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
