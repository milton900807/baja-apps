#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import ast
import os
from urllib.parse import unquote
from typing import Any, Dict, List, Optional

from ion import works


# ============================================================
# Parsing (same robustness as your other script)
# ============================================================

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
    if len(raw) > 240:
        return False
    if raw.startswith("jfile:"):
        return True
    if os.path.exists(raw):
        return True
    return raw.lower().endswith(".json") or ("/" in raw or os.path.sep in raw)


def _read_path(raw: str):
    path = raw[6:] if raw.startswith("jfile:") else raw
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_json_slice(raw: str):
    for opener, closer in (("{", "}"), ("[", "]")):
        if opener in raw and closer in raw:
            start = raw.find(opener)
            end = raw.rfind(closer)
            if 0 <= start < end:
                snippet = raw[start:end + 1]
                obj = _maybe_json_load(snippet)
                if obj is not None:
                    return obj
    return None


def _load_json(raw_input: Any):
    if isinstance(raw_input, dict):
        return raw_input

    raw = _decode(raw_input)
    if raw is None:
        return None

    raw = raw.strip()
    if not raw:
        return None

    if _looks_like_path(raw):
        return _read_path(raw)

    if raw[:1] in "{[":
        obj = _maybe_json_load(raw)
        if obj is not None:
            return obj

    obj = _extract_json_slice(raw)
    if obj is not None:
        return obj

    lit = _maybe_literal_eval(raw)
    if isinstance(lit, dict):
        return lit

    repaired = raw.replace("'", '"')
    obj = _maybe_json_load(repaired)
    if obj is not None:
        return obj

    raise ValueError("Could not parse JSON input")


# ============================================================
# Table helpers
# ============================================================

def build_grid(table: Dict[str, Any]) -> List[List[Any]]:
    cols = table["cols"]
    rows = table["rows"]
    grid = [[None for _ in range(cols)] for _ in range(rows)]

    for well in table.get("wells", []):
        x = well["x"]
        y = well["y"]
        if 0 <= y < rows and 0 <= x < cols:
            grid[y][x] = well.get("value")

    return grid


def extract_headers_and_rows(table: Dict[str, Any]):
    grid = build_grid(table)

    headers = [
        str(v).strip() if v is not None else f"Column_{x}"
        for x, v in enumerate(grid[0])
    ]

    rows = []
    for y in range(1, len(grid)):
        row = {}
        for x, h in enumerate(headers):
            row[h] = grid[y][x]
        rows.append(row)

    return headers, rows


# ============================================================
# Value helpers
# ============================================================

def to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip())
        except Exception:
            return None
    return None


def is_rfu_header(h: str) -> bool:
    return "rfu" in h.lower()


# ============================================================
# Column computation
# ============================================================

def compute_average_rfu(headers: List[str], rows: List[Dict[str, Any]]):
    rfu_headers = [h for h in headers if is_rfu_header(h)]

    if not rfu_headers:
        return None

    values: List[Any] = [None]  # y=0 header slot

    for row in rows:
        nums = [to_float(row.get(h)) for h in rfu_headers]
        nums = [n for n in nums if n is not None]

        if nums:
            values.append(sum(nums) / len(nums))
        else:
            values.append(None)

    return {
        "column": "Average RFU",
        "values": values,
        "sourceColumns": rfu_headers
    }


# ============================================================
# Main
# ============================================================

def _main_ion() -> int:
    works.msg("\tready: compute derived column")

    raw1 = works.param(1)

    try:
        table = _load_json(raw1)
    except Exception as e:
        works.resolve({"error": str(e)})
        return 1

    try:
        headers, rows = extract_headers_and_rows(table)

        result = compute_average_rfu(headers, rows)

        if result is None:
            works.resolve({
                "error": "No RFU columns found; cannot compute Average RFU"
            })
            return 1

        works.resolve(result)
        return 0

    except Exception as e:
        works.resolve({"error": str(e)})
        return 1


works.msg(" loading derived column generator ")
_main_ion()