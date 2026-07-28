#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — block/group detector for qPCR-style tables

Param(1): table dict or JSON string of a table dict

This script:
- Parses the table headers/rows
- Detects control rows, standard rows, housekeeping rows, and "targets of interest"
- Groups rows into blocks by type:
    * control blocks (by control type and target gene)
    * standard blocks (by standard label/index)
    * housekeeping blocks (by gene)
    * target_of_interest blocks (by gene, numbered separately)
- Returns:
{
  "status": "ok",
  "table_name": ...,
  "headers": [...],
  "blocks": [
      {
          "block_id": "target_of_interest_1",
          "kind": "target_of_interest",
          "index": 1,
          "target_name": "MYC",
          "rows": [1,2,3],
          "selections": [...]
      },
      ...
  ],
  "row_annotations": [
      {
          "row_y": 1,
          "target": "MYC",
          "is_control": false,
          "is_standard": false,
          "is_housekeeping": false,
          "is_target_of_interest": true,
          "control_type": null,
          "std_label": null,
          "std_index": null,
          "blocks": ["target_of_interest_1"]
      },
      ...
  ],
  "notes": [...]
}
"""

import json
import re
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

def _rows_from_flat_grid(table: Dict[str, Any], width: int) -> List[List[str]]:
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
    for y in range(1, max_y+1):
        row: List[str] = []
        for x in range(width):
            cell = by_xy.get((x,y))
            row.append(_cell_value(cell) if cell is not None else "")
        if any(v.strip() for v in row):
            rows.append(row)
    return rows

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

def _rows_from_2d_wells(table: Dict[str, Any], width: int) -> List[List[str]]:
    wells = table.get("wells") or []
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
    return rows

def extract_headers_rows_and_name(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[str]]]:
    name = _safe_str(table.get("name") or "Untitled Table")
    headers = _headers_from_flat_grid(table)
    if headers is not None:
        rows = _rows_from_flat_grid(table, len(headers))
        return name, headers, rows
    headers = _headers_from_2d_wells(table)
    if headers is not None:
        rows = _rows_from_2d_wells(table, len(headers))
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

def bind_columns(headers: List[str]) -> Dict[str, Optional[int]]:
    return {
        "well":    _find_col(headers, ["wellposition","well position","position"]),
        "sample":  _find_col(headers, ["sample","specimen"]),
        "target":  _find_col(headers, ["target","gene","assay","primer"]),
        "task":    _find_col(headers, ["task","role","type"]),
        "group":   _find_col(headers, ["group","condition","treatment","arm","cohort","control","ctrl"]),
        "comment": _find_col(headers, ["comment","note","notes","annotation","description"]),
        "conc":    _find_col(headers, ["conc","concentration","std","standard","ng/µl","ng/ul","pg/ml","ng/ml","dose"]),
    }

# ---------- detectors ----------
HK_SET = {
    "18s","28s","actb","b2m","gapdh","gusb","hprt","hprt1","pgk1","ppia",
    "rpl13a","rplp0","tbp","tubb","ubc","ywhaz","sdha","rna18s","rplp13a"
}
HK_SET = {g.lower() for g in HK_SET}

CONTROL_PATTERNS = [
    ("NTC", r"\bntc\b|no\s*template"),
    ("NRT", r"\bnrt\b|no\s*rt"),
    ("Negative Control", r"negative\s*control|\bneg(?:ative)?\s*ctrl?\b|\bnc\b"),
    ("Positive Control", r"positive\s*control|\bpos(?:itive)?\s*ctrl?\b|\bpc\b"),
    ("Calibrator", r"\bcalib(?:rator)?\b|\breference\b"),
    ("Vehicle", r"\bvehicle\b|dmso|etoh|\bwater\b|\bpbs\b|\bbuffer\b|mock"),
    ("Generic Control", r"\bcontrol\b|\bctrl\b"),
    ("UTC", r"\butc\b|\buntreated(?:\s*control)?\b|\bno\s*tx\b|\bno-?treat(?:ment)?\b|\buntrt\b|\butreated:\s*no\b")
]
CONTROL_RE = [(name, re.compile(pat, re.I)) for name, pat in CONTROL_PATTERNS]

STD_LABEL_RE = re.compile(r"\bstd(?:\s*[:\-]?\s*(\d+))?\b|\bstandard(?:\s*[:\-]?\s*(\d+))?\b", re.I)

def is_housekeeping(target: str) -> bool:
    t = (target or "").strip().lower()
    if not t:
        return False
    t = re.sub(r"[^a-z0-9]+", "", t)
    return t in HK_SET

def _row_blobs(row: List[str], sample: str, target: str, task: str, group: str, comment: str) -> Tuple[str, str]:
    priority = " | ".join([s for s in [target, group, sample, task, comment] if s])
    full = " | ".join([c.strip() for c in row if c and c.strip()])
    return priority.lower(), full.lower()

def detect_control_type(texts: List[str]) -> Optional[str]:
    blob = " ".join([t for t in texts if t]).lower()
    for name, rx in CONTROL_RE:
        if rx.search(blob):
            return name
    return None

def parse_std_label(texts: List[str]) -> Tuple[Optional[str], Optional[int]]:
    for t in texts:
        if not t:
            continue
        m = STD_LABEL_RE.search(t)
        if m:
            label = "Standard" if "standard" in m.group(0).lower() else "Std"
            idx = None
            for g in (1,2):
                if m.group(g):
                    try:
                        idx = int(m.group(g))
                    except Exception:
                        pass
            return label, idx
    return None, None

def _norm_gene(s: str) -> str:
    s = (s or "").strip()
    return re.sub(r"[^A-Za-z0-9]+", "", s).lower()

# ---------- selection helper ----------
def make_selection(table_name: str, width: int, row_y: int) -> str:
    # Whole-row selection in Ion Works table syntax
    return f"{table_name}[0:{max(0,width-1)}][{row_y}:{row_y}]"

# ---------- main analysis ----------
def analyze(table: Dict[str, Any]) -> Dict[str, Any]:
    table_name, headers, rows = extract_headers_rows_and_name(table)
    width = len(headers)
    b = bind_columns(headers)

    notes: List[str] = []
    if b["target"] is None:
        notes.append("No 'Target/Gene/Assay' column detected; target classification may be limited.")
    if b["sample"] is None and b["task"] is None and b["group"] is None:
        notes.append("No 'Sample/Task/Group' column detected; control/standard detection may be limited.")

    # Per-row classification
    row_annotations: List[Dict[str, Any]] = []

    # For grouping targets-of-interest and housekeeping by gene
    toi_by_norm: Dict[str, Dict[str, Any]] = {}   # norm_gene -> { raw_name, rows: [...] }
    hk_by_norm: Dict[str, Dict[str, Any]] = {}

    # For grouping standards and controls
    std_blocks: Dict[Tuple[str, Optional[int]], List[int]] = {}  # (label, idx) -> [rows]

    # CHANGED: controls are grouped by (control_type, norm_target_gene)
    ctl_blocks: Dict[Tuple[str, str], Dict[str, Any]] = {}       # (control_type, norm_gene) -> {rows, gene}

    for idx, row in enumerate(rows):
        y = idx + 1  # 1-based data row index (since row 0 is header)

        sample = row[b["sample"]]  if b["sample"]  is not None and b["sample"]  < len(row) else ""
        target = row[b["target"]]  if b["target"]  is not None and b["target"]  < len(row) else ""
        task   = row[b["task"]]    if b["task"]    is not None and b["task"]    < len(row) else ""
        group  = row[b["group"]]   if b["group"]   is not None and b["group"]   < len(row) else ""
        comm   = row[b["comment"]] if b["comment"] is not None and b["comment"] < len(row) else ""
        conc   = row[b["conc"]]    if b["conc"]    is not None and b["conc"]    < len(row) else ""

        pri_blob, full_blob = _row_blobs(row, sample, target, task, group, comm)

        # Standard & control detection
        std_label, std_idx = parse_std_label([sample, target, task, group, comm, conc, pri_blob, full_blob])
        is_std = bool(std_label)

        ctrl_type = detect_control_type([sample, target, task, group, comm, pri_blob, full_blob])
        is_ctrl = bool(ctrl_type)

        # Housekeeping & targets
        has_target = bool(target and target.strip())
        norm_target = _norm_gene(target) if has_target else ""

        is_hk = has_target and is_housekeeping(target)

        # "Target of interest" definition:
        # rows with a non-housekeeping target, not standard, not control
        is_target_of_interest = has_target and not is_hk and not is_std and not is_ctrl

        # Record grouping for standards
        if is_std:
            key = (std_label, std_idx)
            std_blocks.setdefault(key, []).append(y)

        # CHANGED: record grouping for controls by (control_type, norm_target)
        if is_ctrl:
            key = (ctrl_type, norm_target)
            entry = ctl_blocks.setdefault(
                key,
                {
                    "rows": [],
                    "control_type": ctrl_type,
                    # store a representative gene name if present
                    "gene": target.strip() if norm_target else ""
                }
            )
            entry["rows"].append(y)
            # if we didn't have a gene name yet but this row has one, keep it
            if target.strip() and not entry["gene"]:
                entry["gene"] = target.strip()

        # Record grouping for housekeeping by gene
        if is_hk and norm_target:
            if norm_target not in hk_by_norm:
                hk_by_norm[norm_target] = {"raw_name": target.strip(), "rows": []}
            hk_by_norm[norm_target]["rows"].append(y)

        # Record grouping for targets-of-interest by gene
        if is_target_of_interest and norm_target:
            if norm_target not in toi_by_norm:
                toi_by_norm[norm_target] = {"raw_name": target.strip(), "rows": []}
            toi_by_norm[norm_target]["rows"].append(y)

        row_annotations.append({
            "row_y": y,
            "target": target or "",
            "sample": sample or "",
            "group": group or "",
            "task": task or "",
            "comment": comm or "",
            "conc": conc or "",
            "is_control": is_ctrl,
            "control_type": ctrl_type,
            "is_standard": is_std,
            "std_label": std_label,
            "std_index": std_idx,
            "is_housekeeping": is_hk,
            "is_target_of_interest": is_target_of_interest,
            "blocks": []  # filled later
        })

    # ---------- Build blocks (the "n different results") ----------
    blocks: List[Dict[str, Any]] = []
    block_id_counter = 0

    # Helper to add a block and back-annotate rows
    def add_block(kind: str,
                  label: str,
                  rows_list: List[int],
                  extra: Optional[Dict[str, Any]] = None) -> None:
        nonlocal block_id_counter
        block_id_counter += 1
        block_id = f"{kind}_{block_id_counter}"
        selections = [make_selection(table_name, width, y) for y in sorted(set(rows_list))]
        blk = {
            "block_id": block_id,
            "kind": kind,            # "control", "standard", "housekeeping", "target_of_interest"
            "label": label,
            "rows": sorted(set(rows_list)),
            "selections": selections
        }
        if extra:
            blk.update(extra)
        blocks.append(blk)
        # annotate row membership
        for ra in row_annotations:
            if ra["row_y"] in rows_list:
                ra["blocks"].append(block_id)

    # 1) Control blocks (grouped by control_type AND target gene)
    # sort by first row appearance for stable ordering
    for (ctl_type, norm_gene), info in sorted(
        ctl_blocks.items(),
        key=lambda kv: min(kv[1]["rows"]) if kv[1]["rows"] else 10**9
    ):
        rows_list = info["rows"]
        gene_name = (info.get("gene") or "").strip()
        if gene_name:
            label = f"{ctl_type} — {gene_name}"
            extra = {"control_type": ctl_type, "gene": gene_name}
        else:
            label = ctl_type
            extra = {"control_type": ctl_type}
        add_block("control", label, rows_list, extra=extra)

    # 2) Standard blocks (grouped by (label, index))
    # Sort key so Std1, Std2… are stable
    for (label, idx_val), rows_list in sorted(std_blocks.items(), key=lambda kv: (kv[0][0] or "", kv[0][1] or 0)):
        display_label = label if idx_val is None else f"{label} {idx_val}"
        add_block("standard", display_label, rows_list, extra={"standard_label": label, "standard_index": idx_val})

    # 3) Housekeeping blocks (grouped by gene)
    # order by first appearance
    hk_items = sorted(
        hk_by_norm.items(),
        key=lambda kv: min(kv[1]["rows"]) if kv[1]["rows"] else 10**9
    )
    for _, info in hk_items:
        gene_name = info["raw_name"]
        rows_list = info["rows"]
        add_block("housekeeping", gene_name, rows_list, extra={"gene": gene_name})

    # 4) Targets of interest blocks (grouped by gene, numbered)
    toi_items = sorted(
        toi_by_norm.items(),
        key=lambda kv: min(kv[1]["rows"]) if kv[1]["rows"] else 10**9
    )
    toi_index = 0
    for _, info in toi_items:
        toi_index += 1
        gene_name = info["raw_name"]
        rows_list = info["rows"]
        add_block(
            "target_of_interest",
            f"target_of_interest_{toi_index}",
            rows_list,
            extra={"gene": gene_name, "index": toi_index}
        )

    # Optionally: collect rows that are in no block at all as "other"
    other_rows = [ra["row_y"] for ra in row_annotations if not ra["blocks"]]
    if other_rows:
        add_block("other", "unclassified", other_rows, extra={})

    return {
        "status": "ok",
        "table_name": table_name,
        "headers": headers,
        "blocks": blocks,
        "row_annotations": row_annotations,
        "notes": notes
    }

# ---------- ion entry ----------
def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table (dict/json)"}); 
        return 1

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"}); 
            return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a table dict or JSON string of one."}); 
        return 1

    try:
        result = analyze(table)
        works.resolve(result); 
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)}); 
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
