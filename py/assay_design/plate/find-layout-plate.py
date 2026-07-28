#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion-only: Determine which table is the plate layout vs measured plate,
based on plate dimensions and string-vs-numeric content.

Params (Ion):
  param(1): tables (JSON array, jfile:/path, path, or noisy/percent-encoded).
             Must resolve to a list of table dicts:
               {
                 "name": str,
                 "cols": int,
                 "rows": int,
                 "wells": [{ "x": int, "y": int, "value": Any, ... }, ...]
               }
             Typically includes two tables:
               - a plate layout (mostly non-numeric labels)
               - a measured plate (mostly numeric values)
  param(2): ignored (reserved for compatibility).
  param(3): ignored.
  param(4): ignored.

Heuristic:
  • Known plate sizes: 24, 48, 96, 384, 1536 wells:
      (cols, rows) ∈ {
         (6, 4), (4, 6),
         (8, 6), (6, 8),
         (12, 8), (8, 12),
         (24, 16), (16, 24),
         (48, 32), (32, 48),
      }
  • For each table:
      - dimension_match_flag = 1 if (cols, rows) in known sizes else 0
      - nonfloat_string_count = number of wells where:
            value is a str and float(value) fails
  • The table with the highest (dimension_match_flag, nonfloat_string_count)
    is considered the layout. If there are exactly two tables, the other
    one is the measured plate.

No OpenAI / GPT is used.
"""

import os
import json
import ast
from urllib.parse import unquote
from typing import Any, Dict, List, Optional, Tuple

# -------- Ion integration (required) --------
from ion import works  # type: ignore

# ---------- Known plate dimensions ----------

KNOWN_PLATE_SIZES = {
    (6, 4), (4, 6),       # 24-well
    (8, 6), (6, 8),       # 48-well
    (12, 8), (8, 12),     # 96-well
    (24, 16), (16, 24),   # 384-well
    (48, 32), (32, 48),   # 1536-well
}


# ---------- Safe/robust parsing utilities (Ion-style) ----------

def _decode(s: Any) -> Optional[str]:
    if s is None:
        return None
    t = str(s)
    try:
        return unquote(t)
    except Exception:
        return t


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
                snippet = raw[start: end + 1]
                obj = _maybe_json_load(snippet)
                if obj is not None:
                    return obj
    return None


def _load_json_from_path_or_text(s: Optional[str | list | dict]):
    """
    Accepts:
      - already-parsed list/dict
      - percent-encoded strings
      - inline JSON {..} or [..]
      - python-literal (single quotes) via ast.literal_eval
      - 'jfile:/path' or plain filesystem path to a .json
      - noisy strings that contain a JSON slice; we extract the first {...} or [...].
    """
    if isinstance(s, (list, dict)):
        return s
    if s is None:
        return None

    raw = _decode(s)
    if raw is None:
        return None
    raw = raw.strip()
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

    raise ValueError("Could not parse JSON from input.")


def _coerce_tables(raw1) -> List[Dict[str, Any]]:
    """
    Ensure we end up with a list[table_dict].
    `raw1` can be:
      - JSON/path/noisy representation of a list of tables
      - JSON/path/noisy representation of a single table
      - a python-literal representation, etc.
    """
    parsed = _load_json_from_path_or_text(raw1)

    if isinstance(parsed, dict) and "wells" in parsed:
        return [parsed]

    if isinstance(parsed, list):
        # If list elements are themselves tables or a mix
        # of tables and wrappers, flatten obvious table entries.
        tables: List[Dict[str, Any]] = []
        for item in parsed:
            if isinstance(item, dict) and "wells" in item:
                tables.append(item)
            elif isinstance(item, list):
                for sub in item:
                    if isinstance(sub, dict) and "wells" in sub:
                        tables.append(sub)
        if tables:
            return tables

        # Fallback: maybe the list already is exactly the tables list
        if parsed and isinstance(parsed[0], dict) and "wells" in parsed[0]:
            return parsed  # type: ignore

    raise ValueError("Input must resolve to a list of table dicts with 'wells'.")


# ---------- Plate-layout heuristics ----------

def is_float_string(s: str) -> bool:
    """Return True if string can be converted to float, False otherwise."""
    try:
        float(s)
        return True
    except (ValueError, TypeError):
        return False


def count_nonfloat_strings(table: Dict[str, Any]) -> int:
    """
    Count how many well 'value's are strings that cannot be parsed as floats.
    """
    count = 0
    for well in table.get("wells", []):
        v = well.get("value")
        if isinstance(v, str):
            vv = v.strip()
            if vv and not is_float_string(vv):
                count += 1
    return count


def dimensions_match_plate(table: Dict[str, Any]) -> bool:
    """
    Check if the table's (cols, rows) matches a known microplate format.
    """
    cols = table.get("cols")
    rows = table.get("rows")
    if not isinstance(cols, int) or not isinstance(rows, int):
        return False
    return (cols, rows) in KNOWN_PLATE_SIZES


def score_table_for_layout(table: Dict[str, Any]) -> Tuple[int, int]:
    """
    Produce a score for how likely this table is to be the layout.

    Score = (dimension_match_flag, nonfloat_string_count)
      - dimension_match_flag: 1 if known plate size, else 0
      - nonfloat_string_count: how many non-float strings in wells
    Higher is "more likely layout".
    """
    dim_flag = 1 if dimensions_match_plate(table) else 0
    nonfloat_strings = count_nonfloat_strings(table)
    return (dim_flag, nonfloat_strings)


def determine_layout_and_measured(
    tables: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Given a list of tables, determine:

      - Which table is the plate layout (most likely).
      - If there are exactly two tables, treat the other as measured plate.
      - If more than two, only the best-scoring layout is identified; the rest
        are returned as "others".

    Returns a dict:
      {
        "layout": {
          "index": int,    # index in input tables list
          "name": str,
          "score": [dim_flag, nonfloat_count]
        },
        "measured": {
          "index": int | None,
          "name": str | None
        },
        "all_scores": [
          {"index": i, "name": ..., "score": [dim_flag, nonfloat_count]},
          ...
        ]
      }
    """
    if not tables:
        raise ValueError("No tables provided.")

    scores: List[Tuple[int, int]] = []
    for tbl in tables:
        scores.append(score_table_for_layout(tbl))

    # Find index of table with max score
    best_idx = max(range(len(tables)), key=lambda i: scores[i])
    layout_tbl = tables[best_idx]
    layout_score = scores[best_idx]

    # If exactly two tables, pick the other as measured
    measured_idx = None
    measured_name = None
    if len(tables) == 2:
        measured_idx = 1 - best_idx
        measured_name = tables[measured_idx].get("name")

    all_scores = []
    for i, (dim_flag, nonfloat_count) in enumerate(scores):
        all_scores.append({
            "index": i,
            "name": tables[i].get("name"),
            "score": [dim_flag, nonfloat_count],
        })

    return {
        "layout": {
            "index": best_idx,
            "name": layout_tbl.get("name"),
            "score": list(layout_score),
        },
        "measured": {
            "index": measured_idx,
            "name": measured_name,
        },
        "all_scores": all_scores,
    }


# ---------- Ion entry point ----------

def _main_ion() -> int:
    """
    Ion entry:
      param(1): tables (JSON / jfile:/path / path / noisy)
      param(2): ignored
      param(3): ignored
      param(4): ignored
    """
    works.msg("\tready: plate layout vs measured classifier (no GPT)")

    raw1 = works.param(1)
    try:
        _ = works.param(2)
        _ = works.param(3)
        _ = works.param(4)
    except Exception:
        # In case fewer params are passed; safe to ignore
        pass

    try:
        tables = _coerce_tables(raw1)
    except Exception as e:
        works.resolve({"error": f"Failed to parse tables: {e}"})
        return 1

    works.msg(f"\tParsed {len(tables)} table(s). Scoring for layout likelihood...")

    try:
        result = determine_layout_and_measured(tables)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({"error": f"Error determining layout/measured: {e}"})
        return 1


# Auto-run when loaded by Ion
works.msg(" loading plate layout classifier (no GPT) ")
_main_ion()
