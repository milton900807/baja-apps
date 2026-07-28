#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — qPCR-style selectors (housekeeping, targets, controls, standards)
Now supports overlapping categories:
- A row can be BOTH housekeeping and control
- A row can be BOTH target and control
- (Standards can also overlap; we keep them too)

Param(1): table dict
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
            if val not in (None,""): return _safe_str(val).strip()
        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("header","title","label"):
                val = props.get(k)
                if val not in (None,""): return _safe_str(val).strip()
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
        if x < 0 or y < 0: continue
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
        if x < 0 or y < 0: continue
        by_xy[(x,y)] = c
        if y > max_y: max_y = y
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
    if not (isinstance(wells, list) and wells and isinstance(wells[0], list)): return None
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
        return name, headers, _rows_from_flat_grid(table, len(headers))
    headers = _headers_from_2d_wells(table)
    if headers is not None:
        return name, headers, _rows_from_2d_wells(table, len(headers))
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
                hits.append(i); break
    # also catch plain "cq" or "ct" as whole tokens via regex (avoids missing "Cq" exactly)
    token_rx = re.compile(r"\b(cq|ct)\b", re.I)
    for i, h in enumerate(headers):
        if token_rx.search(h):
            if i not in hits: hits.append(i)
    return sorted(set(hits))

def bind_columns(headers: List[str]) -> Dict[str, Optional[int]]:
    # keys are substrings searched in lowercase header names
    return {
        "well":    _find_col(headers, ["wellposition","well position","position"]),
        "sample":  _find_col(headers, ["sample","specimen"]),
        "target":  _find_col(headers, ["target","gene","assay","primer"]),
        "task":    _find_col(headers, ["task","role","type"]),
        "group":   _find_col(headers, ["group","condition","treatment","arm","cohort","control","ctrl"]),
        "comment": _find_col(headers, ["comment","note","notes","annotation","description"]),
        "conc":    _find_col(headers, ["conc","concentration","std","standard","ng/µl","ng/ul","pg/ml","ng/ml","dose"]),
        # NEW: primary Cq/Ct column (first match) + we’ll also compute all matches elsewhere
        "cq":      _find_col(headers, [
                        "cq","ct","cq mean","ct mean","cq value","ct value",
                        "cq avg","ct avg","cq-mean","ct-mean","cq_m","ct_m"
                   ]),
    }

def annotate_headers(headers: List[str], b: Dict[str, Optional[int]]) -> Dict[str, Any]:
    """Produce structured role info for headers, including all Cq/Ct and Well candidates."""
    # gather all possible Cq/Ct columns
    cq_all = _find_all_cols(headers, [
        "cq","ct","cq mean","ct mean","cq value","ct value",
        "cq avg","ct avg","cq-mean","ct-mean","cq_m","ct_m"
    ])
    # gather all possible Well-position columns
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
        # multi-candidate lists
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

    # best-effort single role assignment for each header to help downstream UIs
    idx_to_role: Dict[int, str] = {}
    for role in ("well","sample","target","cq","task","group","comment","conc"):
        i = b.get(role)
        if isinstance(i, int) and 0 <= i < len(headers):
            idx_to_role[i] = role
    header_annotations = [{"index": i, "name": headers[i], "role": idx_to_role.get(i, "other")}
                          for i in range(len(headers))]

    return {
        "columns": columns,                # indices for primary roles (+ all.cq/well lists)
        "role_headers": role_headers,      # names for primary roles (+ all.cq/well names)
        "header_annotations": header_annotations
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
    if not t: return False
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
        if not t: continue
        m = STD_LABEL_RE.search(t)
        if m:
            label = "Standard" if "standard" in m.group(0).lower() else "Std"
            idx = None
            for g in (1,2):
                if m.group(g):
                    try: idx = int(m.group(g))
                    except Exception: pass
            return label, idx
    return None, None

# ---------- selection helper ----------
def make_selection(table_name: str, width: int, row_y: int) -> str:
    return f"{table_name}[0:{max(0,width-1)}][{row_y}:{row_y}]"

# ---------- analyze (OVERLAP-AWARE) ----------
def analyze(table: Dict[str, Any]) -> Dict[str, Any]:
    table_name, headers, rows = extract_headers_rows_and_name(table)
    width = len(headers)
    b = bind_columns(headers)

    hk_rows_idx: List[int] = []
    tgt_rows_idx: List[int] = []
    ctl_rows_idx: List[int] = []
    std_rows_idx: List[int] = []

    # For explicit overlap outputs
    ctl_and_hk_idx: List[int] = []
    ctl_and_tgt_idx: List[int] = []

    notes: List[str] = []
    if b["target"] is None:
        notes.append("No 'Target/Gene/Assay' column detected; gene-based detection may be limited.")
    if b["sample"] is None and b["task"] is None and b["group"] is None:
        notes.append("No 'Sample/Task/Group' column detected; control/standard detection may be limited.")
    if b.get("cq") is None:
        notes.append("No 'Cq/Ct' column detected; quantitative value detection may be limited.")

    # --- NEW: collect distinct targets across rows (row-direction uniqueness)
    distinct_targets_norm: List[str] = []   # normalized for counting
    distinct_targets_raw: List[str] = []    # raw strings (first-seen casing)

    def _norm_gene(s: str) -> str:
        s = (s or "").strip()
        return re.sub(r"[^A-Za-z0-9]+", "", s).lower()

    for idx, row in enumerate(rows):
        y = idx + 1
        sample = row[b["sample"]]  if b["sample"]  is not None and b["sample"]  < len(row) else ""
        target = row[b["target"]]  if b["target"]  is not None and b["target"]  < len(row) else ""
        task   = row[b["task"]]    if b["task"]    is not None and b["task"]    < len(row) else ""
        group  = row[b["group"]]   if b["group"]   is not None and b["group"]   < len(row) else ""
        comm   = row[b["comment"]] if b["comment"] is not None and b["comment"] < len(row) else ""
        conc   = row[b["conc"]]    if b["conc"]    is not None and b["conc"]    < len(row) else ""

        # track row-direction distinct target names (includes housekeeping genes)
        if target and target.strip():
            tn = _norm_gene(target)
            if tn and tn not in distinct_targets_norm:
                distinct_targets_norm.append(tn)
                distinct_targets_raw.append(target.strip())

        # Build blobs (scan entire row)
        pri_blob, full_blob = _row_blobs(row, sample, target, task, group, comm)

        # Independently detect each flag (NO precedence, allow overlaps)
        is_std = bool(parse_std_label([sample, target, task, group, comm, pri_blob, full_blob])[0])
        ctrl_type = detect_control_type([sample, target, task, group, comm, pri_blob, full_blob])
        is_ctrl = bool(ctrl_type)
        is_hk = bool(target and is_housekeeping(target))
        is_tgt = bool(target.strip())

        if is_std:
            std_rows_idx.append(y)
        if is_ctrl:
            ctl_rows_idx.append(y)
        if is_hk:
            hk_rows_idx.append(y)
        # A target is anything with a target value (even if also control/housekeeping)
        if is_tgt:
            tgt_rows_idx.append(y)

        # Explicit overlap captures (do not deduplicate yet)
        if is_ctrl and is_hk:
            ctl_and_hk_idx.append(y)
        if is_ctrl and is_tgt:
            ctl_and_tgt_idx.append(y)

    # Deduplicate & sort
    def _dedup(xs: List[int]) -> List[int]:
        return sorted(set(xs))

    hk_rows_idx      = _dedup(hk_rows_idx)
    tgt_rows_idx     = _dedup(tgt_rows_idx)
    ctl_rows_idx     = _dedup(ctl_rows_idx)
    std_rows_idx     = _dedup(std_rows_idx)
    ctl_and_hk_idx   = _dedup(ctl_and_hk_idx)
    ctl_and_tgt_idx  = _dedup(ctl_and_tgt_idx)

    selections = {
        "reference":            [make_selection(table_name, width, y) for y in hk_rows_idx],
        "target":               [make_selection(table_name, width, y) for y in tgt_rows_idx],
        "control":              [make_selection(table_name, width, y) for y in ctl_rows_idx],
        "standard":             [make_selection(table_name, width, y) for y in std_rows_idx],
        # Explicit overlap channels
        "control_and_reference":  [make_selection(table_name, width, y) for y in ctl_and_hk_idx],
        "control_and_target":     [make_selection(table_name, width, y) for y in ctl_and_tgt_idx],
    }

    # ---- NEW: table_structure inference (row vs column targets)
    row_unique_target_count = len(distinct_targets_norm)
    row_has_multiple_targets = row_unique_target_count > 1
    table_structure = "rowtargets" if row_has_multiple_targets else "columntargets"

    # ---- structured header role info (indices & names, incl. all Cq candidates)
    header_role_info = annotate_headers(headers, b)

    return {
        "status": "ok", 
        "table_name": table_name,
        "headers": headers,
        "selections": selections,
        "notes": notes,
        # New fields (non-breaking):
        "columns": header_role_info["columns"],                 # indices
        "role_headers": header_role_info["role_headers"],       # names
        "header_annotations": header_role_info["header_annotations"],  # per-header roles

        # --- NEW: row-direction target summary + structure flag ---
        "row_unique_targets": distinct_targets_raw,             # first-seen raw names (cased)
        "row_unique_target_count": row_unique_target_count,
        "row_has_multiple_targets": row_has_multiple_targets,
        "table_structure": table_structure,
    }

# ---------- ion entry ----------
def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table (dict/json)"}); return 1

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"}); return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a table dict or JSON string of one."}); return 1

    try:
        result = analyze(table)
        works.resolve(result); return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)}); return 1

if __name__ == "__main__":
    raise SystemExit(main())
