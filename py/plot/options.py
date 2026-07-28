#!/usr/bin/env python3
from __future__ import annotations

import json
import ast
import os
from urllib.parse import unquote
from typing import Any, Optional, Dict, List

from ion import works


def _decode(s: Any) -> Optional[str]:
    if s is None:
        return None

    try:
        return unquote(str(s))
    except Exception:
        return str(s)


def _load_json(raw_input: Any):
    if isinstance(raw_input, (dict, list)):
        return raw_input

    raw = _decode(raw_input)

    if raw is None:
        return None

    raw = raw.strip()

    if not raw:
        return None

    if raw.startswith("jfile:"):
        with open(raw[6:], "r", encoding="utf-8") as f:
            return json.load(f)

    if os.path.exists(raw):
        with open(raw, "r", encoding="utf-8") as f:
            return json.load(f)

    try:
        return json.loads(raw)
    except Exception:
        pass

    try:
        return ast.literal_eval(raw)
    except Exception:
        pass

    raise ValueError("Could not parse JSON input")


def group_key(well: Dict[str, Any]) -> Optional[str]:
    group = well.get("group")

    if not isinstance(group, dict) or not group:
        return None

    return next(iter(group.keys()))


def normalize_group_name(name: str) -> str:
    return str(name).strip().replace("-", "_").replace(" ", "_")


def to_float(value: Any) -> Optional[float]:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            return None

    return None


def is_column_header(well: Dict[str, Any]) -> bool:
    return group_key(well) == "ColumnHeader"


def collect_numeric_groups(
    wells: List[Dict[str, Any]]
) -> Dict[str, List[Dict[str, Any]]]:

    groups: Dict[str, List[Dict[str, Any]]] = {}

    for well in wells:
        if not isinstance(well, dict):
            continue

        if is_column_header(well):
            continue

        key = group_key(well)

        if not key:
            continue

        if to_float(well.get("value")) is None:
            continue

        key = normalize_group_name(key)

        groups.setdefault(key, []).append(well)

    return groups


def collect_numeric_columns(data: Any) -> Dict[str, List[Dict[str, Any]]]:
    """
    Fallbacks for:

    1. Simple row data:
       [
         [1, 10],
         [2, 20]
       ]

    2. Well objects with numeric values but no group,
       using x as column and y as row.
    """

    groups: Dict[str, List[Dict[str, Any]]] = {}

    if not isinstance(data, list):
        return groups

    # ---------------------------------------------------------
    # Case 1:
    # plain two-column numeric rows
    # ---------------------------------------------------------

    if all(
        isinstance(row, (list, tuple)) and len(row) >= 2
        for row in data
    ):
        rows = []

        for row in data:
            a = to_float(row[0])
            b = to_float(row[1])

            if a is None or b is None:
                return {}

            rows.append((a, b))

        if len(rows) > 1:
            groups["column_1"] = [
                {"value": a}
                for a, _ in rows
            ]

            groups["column_2"] = [
                {"value": b}
                for _, b in rows
            ]

        return groups

    # ---------------------------------------------------------
    # Case 2:
    # well objects with x/y positions
    # ---------------------------------------------------------

    columns: Dict[Any, List[Dict[str, Any]]] = {}

    for well in data:
        if not isinstance(well, dict):
            continue

        value = to_float(well.get("value"))

        x = well.get("x")
        y = well.get("y")

        if value is None:
            continue

        if x is None or y is None:
            continue

        columns.setdefault(x, []).append(well)

    for x, wells in columns.items():

        wells = sorted(
            wells,
            key=lambda w: w.get("y", 0)
        )

        if len(wells) > 1:
            if isinstance(x, int):
                name = f"column_{x + 1}"
            else:
                name = f"column_{x}"

            groups[name] = wells

    return groups


def build_plot_option_strings(data: Any) -> List[str]:

    groups: Dict[str, List[Dict[str, Any]]] = {}

    # ---------------------------------------------------------
    # Standard grouped wells
    # ---------------------------------------------------------

    if isinstance(data, dict) and "wells" in data:
        wells = data["wells"]

        groups = collect_numeric_groups(wells)

        # fallback if grouped wells were not found
        if len(groups) < 2:
            groups = collect_numeric_columns(wells)

    # ---------------------------------------------------------
    # Raw list input
    # ---------------------------------------------------------

    elif isinstance(data, list):

        # first try standard grouped wells
        groups = collect_numeric_groups(data)

        # fallback to column extraction
        if len(groups) < 2:
            groups = collect_numeric_columns(data)

    else:
        raise ValueError(
            "Expected either a list or an object with a wells array"
        )

    # ---------------------------------------------------------
    # Keep only groups with enough numeric points
    # ---------------------------------------------------------

    groups = {
        name: values
        for name, values in groups.items()
        if len(values) > 1
    }

    group_names = sorted(groups.keys())

    options: List[str] = []

    # ---------------------------------------------------------
    # Scatter + grouped bar options
    # ---------------------------------------------------------

    for x_group in group_names:
        for y_group in group_names:

            if x_group == y_group:
                continue

            options.append(
                f"Scatter: {x_group} vs {y_group}"
            )

            options.append(
                f"Bar Chart: {y_group} by {x_group}"
            )

    # ---------------------------------------------------------
    # Single-series bar charts
    # ---------------------------------------------------------

    for group_name in group_names:
        options.append(
            f"Bar Chart: {group_name}"
        )

    return options


def _main_ion() -> int:

    works.msg("\tready: generate plot option strings")

    raw1 = works.param(1)

    try:

        data = _load_json(raw1)

        options = build_plot_option_strings(data)

        works.resolve(options)

        return 0

    except Exception as e:

        works.resolve({
            "error": str(e)
        })

        return 1


works.msg(" loading plot option string generator ")

_main_ion()