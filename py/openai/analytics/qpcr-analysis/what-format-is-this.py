#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — qPCR column-format detector

Goal:
Given a table dict (same input shape as the qPCR-style selector script),
try to determine whether targets and references are already in a *column*
format — i.e.:

- Gene / target names (including housekeeping genes) appear only in column
  headers, NOT inside any data cells.
- RiboGreen (if present) appears only as a column header.
"""

import json
import re
from typing import Any, Dict, List, Tuple, Optional
from ion import works  # type: ignore

# ---------- utils ----------

def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)

def _cell_value(cell: Any) -> str:
    """
    Extract a string value from a 'cell' which may be a bare value or a dict
    with various fields (value, name, position, label, etc.).
    Mirrors the behavior of the reference script.
    """
    if isinstance(cell, dict):
        if "value" in cell and cell["value"] not in (None, ""):
            return _safe_str(cell["value"]).strip()
        for k in ("name", "position", "label", "title"):
            val = cell.get(k)
            if val not in (None, ""):
                return _safe_str(val).strip()
        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("header", "title", "label"):
                val = props.get(k)
                if val not in (None, ""):
                    return _safe_str(val).strip()
        return ""
    return _safe_str(cell).strip()

def synth_headers(n: int) -> List[str]:
    return [f"Col{i+1}" for i in range(max(0, n))]

# ---------- header + row extraction (same semantics as reference) ----------

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

    by_xy: Dict[Tuple[int, int], Dict[str, Any]] = {}
    for c in wells:
        try:
            x = int(c.get("x"))
            y = int(c.get("y"))
        except Exception:
            continue
        if x < 0 or y < 0:
            continue
        by_xy[(x, y)] = c

    hdrs: List[str] = []
    for x in range(width):
        cell = by_xy.get((x, 0))
        hdrs.append(_cell_value(cell) if cell is not None else "")

    if not any(h.strip() for h in hdrs):
        return synth_headers(width)
    return [h if h.strip() else f"Col{i+1}" for i, h in enumerate(hdrs)]

def _rows_from_flat_grid(table: Dict[str, Any], width: int) -> List[List[str]]:
    wells = table.get("wells") or []
    by_xy: Dict[Tuple[int, int], Dict[str, Any]] = {}
    max_y = -1

    for c in wells:
        try:
            x = int(c.get("x"))
            y = int(c.get("y"))
        except Exception:
            continue
        if x < 0 or y < 0:
            continue
        by_xy[(x, y)] = c
        if y > max_y:
            max_y = y

    rows: List[List[str]] = []
    for y in range(1, max_y + 1):
        row: List[str] = []
        for x in range(width):
            cell = by_xy.get((x, y))
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
        return synth_headers(max(1, width)) if width else ["Col1"]

    headers: List[str] = []
    for x in range(width):
        col = wells[x] if x < len(wells) and isinstance(wells[x], list) else []
        top = col[0] if len(col) > 0 else None
        headers.append(_cell_value(top))

    if not any(h.strip() for h in headers):
        return synth_headers(width)
    return [h if h.strip() else f"Col{i+1}" for i, h in enumerate(headers)]

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

# ---------- gene / ribogreen heuristics ----------

HK_SET = {
    "18s","28s","actb","b2m","gapdh","gusb","hprt","hprt1","pgk1","ppia",
    "rpl13a","rplp0","tbp","tubb","ubc","ywhaz","sdha","rna18s","rplp13a"
}
HK_SET = {g.lower() for g in HK_SET}

GENERIC_HEADER_WORDS = {
    "sample","samples","control","controls","ctrl","target","targets","gene","genes",
    "assay","assays","primer","primers","well","position","wellposition","wellpos",
    "group","condition","treatment","arm","cohort",
    "conc","concentration","std","standard","dose",
    "cq","ct","mean","avg","sd","se","replicate","rep","task","role","type",
    "comment","comments","note","notes"
}

def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").strip().lower())

def _is_gene_like_header(h: str) -> bool:
    """
    Heuristic: header looks like a gene name (including housekeeping genes).
    """
    if not h or not h.strip():
        return False
    low = h.strip().lower()

    # obvious non-gene words
    for w in GENERIC_HEADER_WORDS:
        if w in low:
            return False

    n = _norm(h)
    if not n:
        return False

    # explicitly known housekeeping genes
    if n in HK_SET:
        return True

    # pattern-based: e.g. TP53, MYC, AKT1, RPL13A, etc.
    if re.fullmatch(r"[a-z0-9]{3,12}", n) and any(c.isalpha() for c in n):
        # avoid obviously generic words that slip through the regex
        if n in GENERIC_HEADER_WORDS:
            return False
        return True

    return False

def _is_ribogreen_header(h: str) -> bool:
    if not h:
        return False
    low = h.lower()
    # Allow "RiboGreen", "Ribo green", "RiboGreen RFU", etc.
    compact = _norm(h)
    return ("ribogreen" in low) or (compact == "ribogreen")

def _is_numeric(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return False
    try:
        float(s)
        return True
    except Exception:
        return False

# ---------- main analysis ----------

def analyze_column_format(table: Dict[str, Any]) -> Dict[str, Any]:
    table_name, headers, rows = extract_headers_rows_and_name(table)

    # --- find gene-like and RiboGreen headers ---
    gene_headers: List[str] = []
    gene_header_indices: List[int] = []
    housekeeping_headers: List[str] = []
    housekeeping_indices: List[int] = []
    ribogreen_headers: List[str] = []
    ribogreen_indices: List[int] = []

    for i, h in enumerate(headers):
        if _is_ribogreen_header(h):
            ribogreen_headers.append(h)
            ribogreen_indices.append(i)
        if _is_gene_like_header(h):
            gene_headers.append(h)
            gene_header_indices.append(i)
            if _norm(h) in HK_SET:
                housekeeping_headers.append(h)
                housekeeping_indices.append(i)

    # Normalized gene tokens from headers (for scanning inside cells)
    header_gene_tokens = {_norm(h) for h in gene_headers if _norm(h)}

    # --- scan table cells for gene-like tokens (that match header genes) ---
    gene_mentions_in_cells: List[str] = []
    gene_mentions_positions: List[Dict[str, int]] = []  # (row_idx, col_idx) for debugging

    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            text = (val or "").strip()
            if not text:
                continue
            # pure numeric values are expected in column-format data (Cq or expression)
            if _is_numeric(text):
                continue

            cell_norm = _norm(text)
            if cell_norm and cell_norm in header_gene_tokens:
                # gene name appears in a data cell — this suggests "long format"
                gene_mentions_in_cells.append(text)
                gene_mentions_positions.append({"row": r_idx + 1, "col": c_idx})
                continue

            # Also scan token-wise; in case the cell is like "Gene: GAPDH"
            tokens = re.split(r"[^A-Za-z0-9]+", text)
            for tok in tokens:
                if not tok:
                    continue
                tnorm = _norm(tok)
                if tnorm and tnorm in header_gene_tokens:
                    gene_mentions_in_cells.append(tok)
                    gene_mentions_positions.append({"row": r_idx + 1, "col": c_idx})
                    break  # one hit per cell is enough

    # --- high-level classification ---
    has_gene_headers = bool(gene_headers)
    has_ribogreen_header = bool(ribogreen_headers)
    has_gene_mentions_in_cells = bool(gene_mentions_in_cells)

    # We consider "column format" if:
    #  - there is at least one gene-like header, AND
    #  - those gene names never appear inside any data cell.
    targets_and_refs_as_columns = bool(has_gene_headers and not has_gene_mentions_in_cells)

    notes: List[str] = []
    if not has_gene_headers:
        notes.append("No gene-like headers detected; unable to confirm column-format targets.")
    if has_gene_mentions_in_cells:
        notes.append("Gene names were found in data cells, suggesting a non-column (long) format.")
    if has_ribogreen_header:
        notes.append("RiboGreen detected as a header; this supports a column-format layout.")

    # Try to characterize the table style
    if targets_and_refs_as_columns:
        table_style = "column_targets"
    elif has_gene_mentions_in_cells:
        table_style = "row_or_long_targets"
    else:
        table_style = "unknown"

    return {
        "status": "ok",
        "table_name": table_name,
        "headers": headers,
        "targets_and_references_as_columns": targets_and_refs_as_columns,
        "table_style": table_style,  # "column_targets" | "row_or_long_targets" | "unknown"

        # Detected headers
        "gene_headers": gene_headers,
        "gene_header_indices": gene_header_indices,
        "housekeeping_headers": housekeeping_headers,
        "housekeeping_header_indices": housekeeping_indices,
        "ribogreen_headers": ribogreen_headers,
        "ribogreen_header_indices": ribogreen_indices,

        # Evidence for non-column (long) format
        "gene_mentions_in_cells": gene_mentions_in_cells,
        "gene_mentions_positions": gene_mentions_positions,

        # Some free-text context
        "has_ribogreen_header": has_ribogreen_header,
        "notes": notes,
    }

# ---------- ion entry ----------

def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({
            "status": "❌ error",
            "error": "Missing parameter 1: table (dict/json)"
        })
        return 1

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({
                "status": "❌ error",
                "error": f"Param 1 JSON parse error: {e}"
            })
            return 1

    if not isinstance(table, dict):
        works.resolve({
            "status": "❌ error",
            "error": "Param 1 must be a table dict or JSON string of one."
        })
        return 1

    try:
        result = analyze_column_format(table)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({
            "status": "❌ error",
            "error": str(e)
        })
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
