#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
select-cells-in-plate-with-openai-any-cell-v4.py

Expected inputs
---------------
Param(1): table/plate JSON from sp.toValueFormulaJSON()
Param(2): prompt string

Behavior
--------
Supports:
1) deterministic structural column selection
   e.g. "select the first column and the last"
   -> returns one uid per matched cell

2) deterministic row-by-value / well-by-value selection
   e.g. "select the rows that have UTC"
        "select UTC wells"
   -> returns all uids from all matched rows

3) OpenAI fallback for freeform semantic matching

Environment
-----------
Requires OPENAI_API_KEY for fallback behavior only.
Optional:
  OPENAI_MODEL (default: gpt-4.1-mini)
"""

import json
import os
import re
from typing import Any, Dict, List, Tuple, Optional, Set

from ion import works  # type: ignore
from openai import OpenAI


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)


def _norm(s: Any) -> str:
    s = _safe_str(s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def _cell_text(cell: Any) -> str:
    if isinstance(cell, dict):
        for k in ("value", "name", "label", "title", "text", "display", "position"):
            v = cell.get(k)
            if v not in (None, ""):
                return _safe_str(v).strip()

        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("value", "name", "label", "title", "text", "display"):
                v = props.get(k)
                if v not in (None, ""):
                    return _safe_str(v).strip()

        return ""
    return _safe_str(cell).strip()


def _cell_uid(cell: Any) -> Optional[str]:
    if isinstance(cell, dict):
        for k in ("uid", "well_uid", "id", "_id"):
            v = cell.get(k)
            if v not in (None, ""):
                return _safe_str(v)

        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("uid", "well_uid", "id", "_id"):
                v = props.get(k)
                if v not in (None, ""):
                    return _safe_str(v)

    return None


def _extract_table(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[Dict[str, Any]]]]:
    name = _safe_str(table.get("name") or "Untitled Plate")
    wells = table.get("wells")

    if isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]:
        by_xy: Dict[Tuple[int, int], Any] = {}
        max_x = 0
        max_y = 0

        for c in wells:
            try:
                x = int(c.get("x", 0))
                y = int(c.get("y", 0))
            except Exception:
                continue
            by_xy[(x, y)] = c
            max_x = max(max_x, x)
            max_y = max(max_y, y)

        width = int(table.get("cols") or (max_x + 1))

        headers: List[str] = []
        for x in range(width):
            headers.append(_cell_text(by_xy.get((x, 0))) or f"Col{x+1}")

        rows: List[List[Dict[str, Any]]] = []
        for y in range(1, max_y + 1):
            row: List[Dict[str, Any]] = []
            row_has_content = False
            for x in range(width):
                cell = by_xy.get((x, y))
                txt = _cell_text(cell)
                uid = _cell_uid(cell)
                if txt or uid:
                    row_has_content = True
                row.append({"text": txt, "uid": uid, "raw": cell})
            if row_has_content:
                rows.append(row)

        return name, headers, rows

    if isinstance(wells, list) and wells and isinstance(wells[0], list):
        width = len(wells)
        height = max((len(col) for col in wells if isinstance(col, list)), default=0)

        headers: List[str] = []
        for x in range(width):
            cell = wells[x][0] if x < len(wells) and len(wells[x]) > 0 else None
            headers.append(_cell_text(cell) or f"Col{x+1}")

        rows: List[List[Dict[str, Any]]] = []
        for y in range(1, height):
            row: List[Dict[str, Any]] = []
            row_has_content = False
            for x in range(width):
                cell = wells[x][y] if x < len(wells) and y < len(wells[x]) else None
                txt = _cell_text(cell)
                uid = _cell_uid(cell)
                if txt or uid:
                    row_has_content = True
                row.append({"text": txt, "uid": uid, "raw": cell})
            if row_has_content:
                rows.append(row)

        return name, headers, rows

    return name, ["Col1"], []


def _flatten_cells(headers: List[str], rows: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    cells: List[Dict[str, Any]] = []
    cell_index = 0

    for row_index, row in enumerate(rows, start=1):
        for col_index, cell in enumerate(row):
            header = headers[col_index] if col_index < len(headers) else f"Col{col_index+1}"
            cells.append({
                "cell_index": cell_index,
                "row_index": row_index,
                "col_index": col_index,
                "header": header,
                "text": _safe_str(cell.get("text", "")).strip(),
                "uid": cell.get("uid"),
            })
            cell_index += 1

    return cells


def _representative_row_uid(row: List[Dict[str, Any]]) -> Optional[str]:
    for cell in row:
        uid = cell.get("uid")
        if uid:
            return uid
    return None


def _all_row_uids(row: List[Dict[str, Any]]) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    for cell in row:
        uid = cell.get("uid")
        if uid and uid not in seen:
            out.append(uid)
            seen.add(uid)
    return out


ORDINAL_WORDS = {
    "first": 0, "1st": 0,
    "second": 1, "2nd": 1,
    "third": 2, "3rd": 2,
    "fourth": 3, "4th": 3,
    "fifth": 4, "5th": 4,
    "sixth": 5, "6th": 5,
    "seventh": 6, "7th": 6,
    "eighth": 7, "8th": 7,
    "ninth": 8, "9th": 8,
    "tenth": 9, "10th": 9,
}


def _extract_requested_column_indexes(prompt: str, headers: List[str]) -> List[int]:
    p = _norm(prompt)
    width = len(headers)
    if width <= 0:
        return []

    p = re.sub(r"\bcolum\b", "column", p)
    p = re.sub(r"\bcolmn\b", "column", p)
    p = re.sub(r"\bcoumn\b", "column", p)
    p = re.sub(r"\bfrist\b", "first", p)
    p = re.sub(r"\badn\b", "and", p)

    indexes: List[int] = []

    for i, h in enumerate(headers):
        hn = _norm(h)
        if hn and re.search(rf"(?<!\w){re.escape(hn)}(?!\w)", p):
            indexes.append(i)

    tokens = re.findall(r"[a-z0-9]+", p)
    has_col_word = any(tok in {"column", "columns", "col", "cols"} for tok in tokens)
    if not has_col_word:
        return []

    for tok in tokens:
        if tok in ORDINAL_WORDS:
            indexes.append(ORDINAL_WORDS[tok])
        elif tok == "last":
            indexes.append(width - 1)

    for m in re.finditer(r"\bcol(?:umn)?s?\s+(\d+)\b", p):
        indexes.append(int(m.group(1)) - 1)

    out: List[int] = []
    seen = set()
    for idx in indexes:
        if 0 <= idx < width and idx not in seen:
            out.append(idx)
            seen.add(idx)
    return out


def _extract_row_value_query(prompt: str) -> Optional[str]:
    p = _safe_str(prompt).strip()

    patterns = [
        r'(?i)\bselect\b.*?\brows?\b.*?\bthat have\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b.*?\brows?\b.*?\bthat contain\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b.*?\brows?\b.*?\bcontain\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b.*?\brows?\b.*?\bwith\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b.*?\brows?\b.*?\bcontaining\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b.*?\brows?\b.*?\bwhere\b.+?\bis\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b.*?\brows?\b.*?\bvalue\b\s+["\']?(.+?)["\']?\s*$',

        # well-oriented variants
        r'(?i)\bselect\b\s+["\']?(.+?)["\']?\s+\bwells?\b\s*$',
        r'(?i)\bselect\b\s+\bwells?\b\s+\bwith\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b\s+\bwells?\b\s+\bcontaining\b\s+["\']?(.+?)["\']?\s*$',
        r'(?i)\bselect\b\s+\bwells?\b\s+\bthat contain\b\s+["\']?(.+?)["\']?\s*$',
    ]
    for pat in patterns:
        m = re.search(pat, p)
        if m:
            value = m.group(1).strip().strip('"').strip("'").strip()
            if value:
                return value

    return None


def _row_matches_value(row: List[Dict[str, Any]], target: str) -> bool:
    target_n = _norm(target)
    if not target_n:
        return False

    # exact cell match
    for cell in row:
        txt = _norm(cell.get("text", ""))
        if txt == target_n:
            return True

    # token match for short values like UTC
    target_tokens = set(re.findall(r"[a-z0-9_]+", target_n))
    if target_tokens:
        for cell in row:
            txt = _norm(cell.get("text", ""))
            txt_tokens = set(re.findall(r"[a-z0-9_]+", txt))
            if target_tokens.issubset(txt_tokens):
                return True

    # substring match
    for cell in row:
        txt = _norm(cell.get("text", ""))
        if target_n in txt:
            return True

    return False


def _matched_cells_for_rows(headers: List[str], rows: List[List[Dict[str, Any]]], matched_rows: List[int]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    wanted = set(matched_rows)

    for row_idx, row in enumerate(rows, start=1):
        if row_idx not in wanted:
            continue
        for col_index, cell in enumerate(row):
            uid = cell.get("uid")
            out.append({
                "row_index": row_idx,
                "col_index": col_index,
                "header": headers[col_index] if col_index < len(headers) else f"Col{col_index+1}",
                "text": _safe_str(cell.get("text", "")).strip(),
                "uid": uid,
            })

    return out


def _select_cells_by_columns(cells: List[Dict[str, Any]], col_indexes: List[int]) -> List[Dict[str, Any]]:
    wanted = set(col_indexes)
    return [c for c in cells if c.get("col_index") in wanted and c.get("uid")]


def _call_openai_for_cell_selection(prompt: str, cells: List[Dict[str, Any]], headers: List[str], row_count: int) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    client = OpenAI(api_key=api_key)

    compact_payload = {
        "prompt": prompt,
        "table": {
            "headers": headers,
            "row_count": row_count,
            "cells": cells,
        },
    }

    system_prompt = (
        "You select individual cells from a table-like plate/grid. "
        "Return ONLY valid JSON with this exact top-level shape: "
        "{"
        "\"matched_cell_indexes\": [number], "
        "\"include_phrases\": [string], "
        "\"exclude_phrases\": [string], "
        "\"reasoning_summary\": string"
        "}. "
        "Rules: "
        "1) matched_cell_indexes must reference the provided cell_index values. "
        "2) Multiple selections are allowed and expected when the prompt asks for more than one target. "
        "3) Respect negation / exclusion words like not, except, excluding, without. "
        "4) If the prompt refers to rows with a given value, include all cells in matching rows. "
        "5) If the prompt refers to wells with a given value, treat that as row selection and include all cells in matching rows. "
        "6) If the prompt refers to positions like first/last column, interpret them structurally."
    )

    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(compact_payload, ensure_ascii=False)},
        ],
        text={"format": {"type": "json_object"}},
    )

    data = json.loads(response.output_text)
    data["model"] = model
    return data


def analyze(table: Dict[str, Any], prompt: str) -> Dict[str, Any]:
    table_name, headers, rows = _extract_table(table)

    if not rows:
        return {
            "status": "ok",
            "table_name": table_name,
            "selection": {"selected_well_uids": []},
            "best_column": None,
            "matches": {"include_phrases": [], "exclude_phrases": []},
            "debug": {"mode": "none", "matched_rows": [], "matched_cells": [], "matched_cell_indexes": []},
            "notes": ["No data rows found."]
        }

    prompt = _safe_str(prompt).strip()
    if not prompt:
        return {
            "status": "ok",
            "table_name": table_name,
            "selection": {"selected_well_uids": []},
            "best_column": None,
            "matches": {"include_phrases": [], "exclude_phrases": []},
            "debug": {"mode": "none", "matched_rows": [], "matched_cells": [], "matched_cell_indexes": []},
            "notes": ["Prompt was empty after normalization."]
        }

    cells = _flatten_cells(headers, rows)

    # 1) Deterministic structural column selection
    requested_cols = _extract_requested_column_indexes(prompt, headers)
    if requested_cols:
        matched_cells = _select_cells_by_columns(cells, requested_cols)
        matched_cell_indexes = [int(c["cell_index"]) for c in matched_cells]
        matched_rows = sorted(set(int(c["row_index"]) for c in matched_cells))

        selected_well_uids: List[str] = []
        seen_uids: Set[str] = set()
        for c in matched_cells:
            uid = c.get("uid")
            if uid and uid not in seen_uids:
                selected_well_uids.append(uid)
                seen_uids.add(uid)

        return {
            "status": "ok",
            "table_name": table_name,
            "selection": {"selected_well_uids": selected_well_uids},
            "best_column": None,
            "matches": {
                "include_phrases": [_safe_str(headers[i]) for i in requested_cols],
                "exclude_phrases": []
            },
            "debug": {
                "mode": "column_selection",
                "matched_rows": matched_rows,
                "matched_cells": matched_cells,
                "matched_cell_indexes": matched_cell_indexes,
                "selected_column_indexes": requested_cols,
                "selected_column_headers": [_safe_str(headers[i]) for i in requested_cols],
                "model": None,
                "reasoning_summary": "Resolved as a structural column-selection request without calling OpenAI."
            },
            "notes": [
                "selected_well_uids contains one uid per matched cell.",
                "Matched cells anywhere in the requested columns, regardless of row."
            ]
        }

    # 2) Deterministic row-by-value / well-by-value selection
    row_value = _extract_row_value_query(prompt)
    if row_value:
        matched_rows = [i for i, row in enumerate(rows, start=1) if _row_matches_value(row, row_value)]
        matched_cells = _matched_cells_for_rows(headers, rows, matched_rows)

        matched_row_all_uids: Dict[int, List[str]] = {}
        selected_well_uids: List[str] = []
        seen_uids: Set[str] = set()

        for row_idx in matched_rows:
            row = rows[row_idx - 1]
            row_uids = _all_row_uids(row)
            matched_row_all_uids[row_idx] = row_uids
            for uid in row_uids:
                if uid and uid not in seen_uids:
                    selected_well_uids.append(uid)
                    seen_uids.add(uid)

        return {
            "status": "ok",
            "table_name": table_name,
            "selection": {
                "selected_well_uids": selected_well_uids
            },
            "best_column": None,
            "matches": {
                "include_phrases": [row_value],
                "exclude_phrases": []
            },
            "debug": {
                "mode": "row_value_selection",
                "matched_rows": matched_rows,
                "matched_cells": matched_cells,
                "matched_cell_indexes": [],
                "matched_row_all_uids": matched_row_all_uids,
                "model": None,
                "reasoning_summary": "Resolved as deterministic row-by-value selection. Returned all uids from each matched row."
            },
            "notes": [
                "Rows are selected when any cell in the row exactly matches, token-matches, or contains the requested value.",
                "selected_well_uids contains all uids from all matched rows.",
                "debug.matched_row_all_uids shows all uids found in each matched row."
            ]
        }

    # 3) OpenAI fallback
    model_result = _call_openai_for_cell_selection(prompt, cells, headers, len(rows))

    matched_cell_indexes_raw = model_result.get("matched_cell_indexes") or []
    valid_indexes = {int(c["cell_index"]) for c in cells}
    matched_cell_indexes: List[int] = []

    for item in matched_cell_indexes_raw:
        try:
            idx = int(item)
        except Exception:
            continue
        if idx in valid_indexes:
            matched_cell_indexes.append(idx)

    matched_cell_indexes = sorted(set(matched_cell_indexes))
    matched_cells = [c for c in cells if int(c["cell_index"]) in set(matched_cell_indexes)]

    selected_well_uids: List[str] = []
    seen_uids: Set[str] = set()
    for c in matched_cells:
        uid = c.get("uid")
        if uid and uid not in seen_uids:
            selected_well_uids.append(uid)
            seen_uids.add(uid)

    matched_rows = sorted(set(int(c["row_index"]) for c in matched_cells))

    include_phrases = model_result.get("include_phrases")
    exclude_phrases = model_result.get("exclude_phrases")
    if not isinstance(include_phrases, list):
        include_phrases = []
    if not isinstance(exclude_phrases, list):
        exclude_phrases = []

    return {
        "status": "ok",
        "table_name": table_name,
        "selection": {"selected_well_uids": selected_well_uids},
        "best_column": None,
        "matches": {
            "include_phrases": [str(x) for x in include_phrases],
            "exclude_phrases": [str(x) for x in exclude_phrases]
        },
        "debug": {
            "mode": "openai_fallback",
            "matched_rows": matched_rows,
            "matched_cells": matched_cells,
            "matched_cell_indexes": matched_cell_indexes,
            "model": model_result.get("model"),
            "reasoning_summary": _safe_str(model_result.get("reasoning_summary"))
        },
        "notes": [
            "selected_well_uids contains one uid per matched cell.",
            "Deterministic row/column patterns are handled before the OpenAI fallback."
        ]
    }


def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table"})
        return 1

    try:
        prompt = works.param(2)
    except Exception:
        prompt = ""

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"})
            return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a dict or JSON object string"})
        return 1

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