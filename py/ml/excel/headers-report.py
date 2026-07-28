#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
find-string-series-in-plate.py

Expected inputs
---------------
Param(1): table/plate JSON from sp.toValueFormulaJSON()

Behavior
--------
Finds true string values that occur in row/column series and returns the cell ids/uids.

A "true string" means:
- value type is actually string, OR value is extracted as text from a string-like field
- NOT just digits written as a string, e.g. "123", "0045", "1.23", "-7"

A "series" means:
- the same true string appears at least MIN_SERIES_COUNT times in a row or column
- default MIN_SERIES_COUNT = 2

Output
------
Returns:
- selected_well_uids: all unique matched cell uids
- series_by_value: grouped details by repeated string
- row_series / column_series summaries
- debug info

Environment
-----------
No OpenAI dependency.
Uses ion works for input/output.
"""

import json
import re
from typing import Any, Dict, List, Tuple, Optional, Set

from ion import works  # type: ignore


MIN_SERIES_COUNT = 2


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)


def _norm_text(s: Any) -> str:
    s = _safe_str(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _norm_key(s: Any) -> str:
    return _norm_text(s).lower()


def _cell_text_and_type(cell: Any) -> Tuple[str, str]:
    """
    Returns (display_text, source_type)
    source_type is one of: 'string', 'number', 'other', 'empty'
    """
    if cell is None:
        return "", "empty"

    if isinstance(cell, dict):
        # Prefer direct value when present because type matters
        if "value" in cell:
            v = cell.get("value")
            if v is None:
                return "", "empty"
            if isinstance(v, str):
                return v.strip(), "string"
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                return _safe_str(v).strip(), "number"
            return _safe_str(v).strip(), "other"

        # Fallbacks
        for k in ("name", "label", "title", "text", "display", "position"):
            if k in cell:
                v = cell.get(k)
                if v is None:
                    continue
                if isinstance(v, str):
                    return v.strip(), "string"
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    return _safe_str(v).strip(), "number"
                return _safe_str(v).strip(), "other"

        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("value", "name", "label", "title", "text", "display"):
                if k in props:
                    v = props.get(k)
                    if v is None:
                        continue
                    if isinstance(v, str):
                        return v.strip(), "string"
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        return _safe_str(v).strip(), "number"
                    return _safe_str(v).strip(), "other"

        return "", "empty"

    if isinstance(cell, str):
        return cell.strip(), "string"
    if isinstance(cell, (int, float)) and not isinstance(cell, bool):
        return _safe_str(cell).strip(), "number"
    return _safe_str(cell).strip(), "other"


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


def _is_numeric_string(s: str) -> bool:
    """
    Reject strings that are just numeric text, including:
    123
    00123
    -12
    3.14
    +7
    """
    t = _norm_text(s)
    if not t:
        return False
    return bool(re.fullmatch(r"[+-]?(?:\d+\.?\d*|\.\d+)", t))


def _is_true_string(text: str, source_type: str) -> bool:
    """
    True string means:
    - source_type is string
    - non-empty
    - not purely numeric-looking
    """
    t = _norm_text(text)
    if source_type != "string":
        return False
    if not t:
        return False
    if _is_numeric_string(t):
        return False
    return True


def _extract_table(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[Dict[str, Any]]]]:
    name = _safe_str(table.get("name") or "Untitled Plate")
    wells = table.get("wells")

    # Format 1: flat list with x/y
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
            txt, _tp = _cell_text_and_type(by_xy.get((x, 0)))
            headers.append(txt or f"Col{x+1}")

        rows: List[List[Dict[str, Any]]] = []
        for y in range(1, max_y + 1):
            row: List[Dict[str, Any]] = []
            row_has_content = False
            for x in range(width):
                raw = by_xy.get((x, y))
                txt, source_type = _cell_text_and_type(raw)
                uid = _cell_uid(raw)
                if txt or uid:
                    row_has_content = True
                row.append({
                    "text": txt,
                    "source_type": source_type,
                    "uid": uid,
                    "raw": raw,
                    "x": x,
                    "y": y,
                })
            if row_has_content:
                rows.append(row)

        return name, headers, rows

    # Format 2: nested list
    if isinstance(wells, list) and wells and isinstance(wells[0], list):
        width = len(wells)
        height = max((len(col) for col in wells if isinstance(col, list)), default=0)

        headers: List[str] = []
        for x in range(width):
            raw = wells[x][0] if x < len(wells) and len(wells[x]) > 0 else None
            txt, _tp = _cell_text_and_type(raw)
            headers.append(txt or f"Col{x+1}")

        rows: List[List[Dict[str, Any]]] = []
        for y in range(1, height):
            row: List[Dict[str, Any]] = []
            row_has_content = False
            for x in range(width):
                raw = wells[x][y] if x < len(wells) and y < len(wells[x]) else None
                txt, source_type = _cell_text_and_type(raw)
                uid = _cell_uid(raw)
                if txt or uid:
                    row_has_content = True
                row.append({
                    "text": txt,
                    "source_type": source_type,
                    "uid": uid,
                    "raw": raw,
                    "x": x,
                    "y": y,
                })
            if row_has_content:
                rows.append(row)

        return name, headers, rows

    return name, ["Col1"], []


def _build_row_series(headers: List[str], rows: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    For each row, group identical true strings.
    Keep values that appear at least MIN_SERIES_COUNT times.
    """
    out: List[Dict[str, Any]] = []

    for row_idx, row in enumerate(rows, start=1):
        groups: Dict[str, List[Dict[str, Any]]] = {}

        for col_idx, cell in enumerate(row):
            text = cell.get("text", "")
            source_type = cell.get("source_type", "empty")
            uid = cell.get("uid")

            if not uid:
                continue
            if not _is_true_string(text, source_type):
                continue

            key = _norm_key(text)
            groups.setdefault(key, []).append({
                "uid": uid,
                "text": _norm_text(text),
                "row_index": row_idx,
                "col_index": col_idx,
                "header": headers[col_idx] if col_idx < len(headers) else f"Col{col_idx+1}",
            })

        for key, members in groups.items():
            if len(members) >= MIN_SERIES_COUNT:
                out.append({
                    "direction": "row",
                    "value": members[0]["text"],
                    "norm_value": key,
                    "row_index": row_idx,
                    "count": len(members),
                    "uids": [m["uid"] for m in members],
                    "members": members,
                })

    return out


def _build_column_series(headers: List[str], rows: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    For each column, group identical true strings.
    Keep values that appear at least MIN_SERIES_COUNT times.
    """
    out: List[Dict[str, Any]] = []
    width = max((len(r) for r in rows), default=0)

    for col_idx in range(width):
        groups: Dict[str, List[Dict[str, Any]]] = {}

        for row_idx, row in enumerate(rows, start=1):
            if col_idx >= len(row):
                continue

            cell = row[col_idx]
            text = cell.get("text", "")
            source_type = cell.get("source_type", "empty")
            uid = cell.get("uid")

            if not uid:
                continue
            if not _is_true_string(text, source_type):
                continue

            key = _norm_key(text)
            groups.setdefault(key, []).append({
                "uid": uid,
                "text": _norm_text(text),
                "row_index": row_idx,
                "col_index": col_idx,
                "header": headers[col_idx] if col_idx < len(headers) else f"Col{col_idx+1}",
            })

        for key, members in groups.items():
            if len(members) >= MIN_SERIES_COUNT:
                out.append({
                    "direction": "column",
                    "value": members[0]["text"],
                    "norm_value": key,
                    "col_index": col_idx,
                    "header": headers[col_idx] if col_idx < len(headers) else f"Col{col_idx+1}",
                    "count": len(members),
                    "uids": [m["uid"] for m in members],
                    "members": members,
                })

    return out


def _merge_series_by_value(row_series: List[Dict[str, Any]], column_series: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    combined = row_series + column_series
    by_value: Dict[str, Dict[str, Any]] = {}

    for s in combined:
        key = s["norm_value"]
        if key not in by_value:
            by_value[key] = {
                "value": s["value"],
                "norm_value": key,
                "uids": [],
                "row_series": [],
                "column_series": [],
            }

        bucket = by_value[key]

        for uid in s["uids"]:
            if uid not in bucket["uids"]:
                bucket["uids"].append(uid)

        if s["direction"] == "row":
            bucket["row_series"].append({
                "row_index": s["row_index"],
                "count": s["count"],
                "uids": s["uids"],
            })
        else:
            bucket["column_series"].append({
                "col_index": s["col_index"],
                "header": s["header"],
                "count": s["count"],
                "uids": s["uids"],
            })

    result = list(by_value.values())
    result.sort(key=lambda x: (-len(x["uids"]), x["value"].lower()))
    return result


def analyze(table: Dict[str, Any]) -> Dict[str, Any]:
    table_name, headers, rows = _extract_table(table)

    if not rows:
        return {
            "status": "ok",
            "table_name": table_name,
            "selection": {
                "selected_well_uids": []
            },
            "series_by_value": [],
            "row_series": [],
            "column_series": [],
            "debug": {
                "matched_count": 0,
                "headers": headers,
            },
            "notes": [
                "No data rows found."
            ]
        }

    row_series = _build_row_series(headers, rows)
    column_series = _build_column_series(headers, rows)
    series_by_value = _merge_series_by_value(row_series, column_series)

    selected_well_uids: List[str] = []
    seen: Set[str] = set()

    for item in series_by_value:
        for uid in item["uids"]:
            if uid not in seen:
                selected_well_uids.append(uid)
                seen.add(uid)

    return {
        "status": "ok",
        "table_name": table_name,
        "selection": {
            "selected_well_uids": selected_well_uids
        },
        "series_by_value": series_by_value,
        "row_series": row_series,
        "column_series": column_series,
        "debug": {
            "matched_count": len(selected_well_uids),
            "row_series_count": len(row_series),
            "column_series_count": len(column_series),
            "headers": headers,
            "min_series_count": MIN_SERIES_COUNT,
        },
        "notes": [
            "Only true strings are considered.",
            "Numeric-looking strings such as '123' or '45.6' are excluded.",
            "A series means the same true string appears at least 2 times in a row or column.",
            "selected_well_uids contains all unique matched cell ids/uids from detected series."
        ]
    }


def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table"})
        return 1

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"})
            return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a dict or JSON object string"})
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