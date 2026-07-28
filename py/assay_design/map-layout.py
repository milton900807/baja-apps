#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works: apply plate layout to data

Input:
  param(1): layout table dict or JSON string
            {"name": "...", "cols": N, "rows": M, "wells": [{x,y,value,...}, ...]}
  param(2): data table dict or JSON string with the same plate geometry

Output via ion.works.resolve():
{
  "status": "ok",
  "name": "<data_name>+layout",
  "cols": ...,
  "rows": ...,
  "wells": [
     {
       "x": int,
       "y": int,
       "sample": "<layout value>",      # e.g. "395254-1", "UTC"
       "layout_value": "<layout value>",
       "layout_uid": "<layout uid or None>",
       "data_value": "<raw data value>",
       "data_uid": "<data uid or None>"
     },
     ...
  ],
  "by_sample": {
     "<sample name>": [
        {
          "x": int,
          "y": int,
          "value": "<data_value>",
          "data_uid": "<uid or None>"
        },
        ...
     ],
     ...
  }
}
"""

import json
from typing import Any, Dict, Tuple, List, Optional

from ion import works  # type: ignore


def _ensure_table(obj: Any, param_name: str) -> Dict[str, Any]:
    """Accept dict or JSON string; return dict or raise."""
    if isinstance(obj, str):
        try:
            obj = json.loads(obj)
        except Exception as e:
            raise ValueError(f"{param_name} is not valid JSON: {e}") from e
    if not isinstance(obj, dict):
        raise ValueError(f"{param_name} must be a table dict or JSON string of one.")
    return obj


def _index_wells(table: Dict[str, Any]) -> Dict[Tuple[int, int], Dict[str, Any]]:
    """Index wells by (x,y) from a flat-grid style table."""
    idx: Dict[Tuple[int, int], Dict[str, Any]] = {}
    for w in table.get("wells", []) or []:
        try:
            x = int(w.get("x"))
            y = int(w.get("y"))
        except Exception:
            continue
        idx[(x, y)] = w
    return idx


def apply_layout_to_data(layout: Dict[str, Any],
                         data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge layout annotations into data wells by (x,y) coordinate.

    layout: plate layout (per-well sample IDs / conditions)
    data:   plate data (per-well numeric/other measurements)
    """
    layout_idx = _index_wells(layout)
    data_idx = _index_wells(data)

    cols = data.get("cols", layout.get("cols"))
    rows = data.get("rows", layout.get("rows"))

    merged_wells: List[Dict[str, Any]] = []
    by_sample: Dict[str, List[Dict[str, Any]]] = {}

    for (x, y), dw in data_idx.items():
        lw = layout_idx.get((x, y), {})
        layout_value = lw.get("value")
        sample_name = layout_value if isinstance(layout_value, str) else None

        merged = {
            "x": x,
            "y": y,
            "sample": sample_name,
            "layout_value": layout_value,
            "layout_uid": lw.get("uid"),
            "data_value": dw.get("value"),
            "data_uid": dw.get("uid"),
        }
        merged_wells.append(merged)

        if sample_name:
            by_sample.setdefault(sample_name, []).append(
                {
                    "x": x,
                    "y": y,
                    "value": dw.get("value"),
                    "data_uid": dw.get("uid"),
                }
            )

    result = {
        "status": "ok",
        "name": f"{data.get('name', 'data')}+layout",
        "cols": cols,
        "rows": rows,
        "wells": merged_wells,
        "by_sample": by_sample,
    }
    return result


def main() -> int:
    try:
        raw_layout = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: layout table"})
        return 1

    try:
        raw_data = works.param(2)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 2: data table"})
        return 1

    try:
        layout = _ensure_table(raw_layout, "layout")
        data = _ensure_table(raw_data, "data")
    except ValueError as e:
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1

    result = apply_layout_to_data(layout, data)
    works.resolve(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
