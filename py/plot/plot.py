#!/usr/bin/env python3
from __future__ import annotations

import json, ast, os, re
from urllib.parse import unquote
from typing import Any, Dict, List, Optional

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


def group_key(well: Dict[str, Any]) -> Optional[str]:
    g = well.get("group")
    if not isinstance(g, dict) or not g:
        return None
    return next(iter(g.keys()))


def norm(name: str) -> str:
    return str(name).strip().replace("-", "_").replace(" ", "_")


def is_header(well: Dict[str, Any]) -> bool:
    return group_key(well) == "ColumnHeader"


def point_label(well: Dict[str, Any]) -> str:
    return well.get("position") or well.get("name") or ""


def collect_groups(wells: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    groups: Dict[str, List[Dict[str, Any]]] = {}

    for well in wells:
        if not isinstance(well, dict):
            continue

        if is_header(well):
            continue

        key = group_key(well)
        if not key:
            continue

        if to_float(well.get("value")) is None:
            continue

        key = norm(key)
        groups.setdefault(key, []).append(well)

    for key in groups:
        groups[key].sort(
            key=lambda w: (
                w.get("y", 0),
                w.get("x", 0),
                w.get("position", ""),
                w.get("name", "")
            )
        )

    return groups


def collect_numeric_columns(data: Any) -> Dict[str, List[Dict[str, Any]]]:
    groups: Dict[str, List[Dict[str, Any]]] = {}

    if not isinstance(data, list):
        return groups

    if all(isinstance(row, (list, tuple)) and len(row) >= 2 for row in data):
        rows = []

        for row in data:
            a = to_float(row[0])
            b = to_float(row[1])

            if a is None or b is None:
                return {}

            rows.append((a, b))

        if len(rows) > 1:
            groups["column_1"] = [{"value": a, "name": f"row_{i + 1}"} for i, (a, _) in enumerate(rows)]
            groups["column_2"] = [{"value": b, "name": f"row_{i + 1}"} for i, (_, b) in enumerate(rows)]

        return groups

    columns: Dict[Any, List[Dict[str, Any]]] = {}

    for well in data:
        if not isinstance(well, dict):
            continue

        value = to_float(well.get("value"))
        x = well.get("x")
        y = well.get("y")

        if value is None or x is None or y is None:
            continue

        columns.setdefault(x, []).append(well)

    for x, column_wells in columns.items():
        column_wells = sorted(
            column_wells,
            key=lambda w: (
                w.get("y", 0),
                w.get("position", ""),
                w.get("name", "")
            )
        )

        if len(column_wells) > 1:
            if isinstance(x, int):
                name = f"column_{x + 1}"
            else:
                name = f"column_{x}"

            groups[name] = column_wells

    return groups


def collect_available_groups(wells: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    groups = collect_groups(wells)

    if len(groups) < 2:
        groups = collect_numeric_columns(wells)

    return {
        name: values
        for name, values in groups.items()
        if len(values) > 1
    }


def parse_plot_option(option: str) -> Dict[str, Any]:
    option = str(option).strip()

    tests = [
        (r"^Scatter:\s*(.*?)\s+vs\s+(.*?)$", "scatter_pair"),
        (r"^Linear Regression:\s*(.*?)\s+vs\s+(.*?)$", "linear_regression"),
        (r"^Bar Chart:\s*(.*?)\s+by\s+(.*?)$", "barchart_pair"),
        (r"^Bar Chart:\s*(.*?)$", "barchart_single"),
        (r"^Pie Chart:\s*(.*?)$", "pie"),
        (r"^Timeline:\s*(.*?)\s+vs\s+(.*?)$", "timeline_pair"),
        (r"^Timeline:\s*(.*?)$", "timeline_single"),
    ]

    for pattern, kind in tests:
        m = re.match(pattern, option, re.IGNORECASE)
        if not m:
            continue

        if kind in ("scatter_pair", "linear_regression", "timeline_pair"):
            return {
                "kind": kind,
                "xGroup": norm(m.group(1)),
                "yGroup": norm(m.group(2)),
            }

        if kind == "barchart_pair":
            return {
                "kind": kind,
                "xGroup": norm(m.group(2)),
                "yGroup": norm(m.group(1)),
            }

        return {
            "kind": kind,
            "xGroup": "index",
            "yGroup": norm(m.group(1)),
        }

    raise ValueError(f"Unknown plot option string: {option}")


def make_xy_points(
    x_wells: List[Dict[str, Any]],
    y_wells: List[Dict[str, Any]],
    x_group: str,
    y_group: str
) -> List[Dict[str, Any]]:
    points = []

    for xw, yw in zip(x_wells, y_wells):
        x = to_float(xw.get("value"))
        y = to_float(yw.get("value"))

        if x is None or y is None:
            continue

        points.append({
            "x": x,
            "xuid": xw.get("uid"),
            "xLabel": point_label(xw),
            "xGroup": x_group,

            "y": y,
            "yuid": yw.get("uid"),
            "yLabel": point_label(yw),
            "yGroup": y_group,

            "name": point_label(yw),
            "stdDev": yw.get("stdDev")
        })

    return points


def make_index_points(
    wells: List[Dict[str, Any]],
    y_group: str
) -> List[Dict[str, Any]]:
    points = []

    for i, well in enumerate(wells):
        y = to_float(well.get("value"))
        if y is None:
            continue

        points.append({
            "x": i,
            "xuid": well.get("uid"),
            "xLabel": point_label(well),
            "xGroup": "index",

            "y": y,
            "yuid": well.get("uid"),
            "yLabel": point_label(well),
            "yGroup": y_group,

            "name": point_label(well),
            "stdDev": well.get("stdDev")
        })

    return points


def make_pie_points(
    wells: List[Dict[str, Any]],
    group: str
) -> List[Dict[str, Any]]:
    points = []

    for i, well in enumerate(wells):
        value = to_float(well.get("value"))
        if value is None:
            continue

        points.append({
            "x": i,
            "y": value,
            "value": value,
            "name": point_label(well),
            "label": point_label(well),
            "uid": well.get("uid"),
            "xuid": well.get("uid"),
            "yuid": well.get("uid"),
            "xGroup": "index",
            "yGroup": group
        })

    return points


def make_timeline_points(
    wells: List[Dict[str, Any]],
    group: str
) -> List[Dict[str, Any]]:
    points = []

    for i, well in enumerate(wells):
        value = to_float(well.get("value"))
        if value is None:
            continue

        points.append({
            "x": i,
            "startX": i,
            "y": value,
            "type": "interval",
            "name": point_label(well),
            "uid": well.get("uid"),
            "xuid": well.get("uid"),
            "yuid": well.get("uid"),
            "xGroup": "index",
            "yGroup": group
        })

    return points


def linear_regression(points: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if len(points) < 2:
        return None

    xs = [p["x"] for p in points]
    ys = [p["y"] for p in points]
    n = len(points)

    sx = sum(xs)
    sy = sum(ys)
    sxy = sum(p["x"] * p["y"] for p in points)
    sxx = sum(x * x for x in xs)

    denom = n * sxx - sx * sx
    if denom == 0:
        return None

    slope = (n * sxy - sx * sy) / denom
    intercept = (sy / n) - slope * (sx / n)

    mean_y = sy / n
    ss_total = sum((y - mean_y) ** 2 for y in ys)
    ss_residual = sum((p["y"] - (slope * p["x"] + intercept)) ** 2 for p in points)

    r_squared = None if ss_total == 0 else 1 - ss_residual / ss_total

    return {
        "slope": slope,
        "intercept": intercept,
        "rSquared": r_squared
    }


def build_plot_payload(wells: List[Dict[str, Any]], option_string: str) -> Dict[str, Any]:
    groups = collect_available_groups(wells)
    parsed = parse_plot_option(option_string)

    kind = parsed["kind"]
    x_group = parsed["xGroup"]
    y_group = parsed["yGroup"]

    if y_group not in groups:
        raise ValueError(f"Could not find group: {y_group}")

    if kind in ("scatter_pair", "linear_regression", "barchart_pair", "timeline_pair"):
        if x_group not in groups:
            raise ValueError(f"Could not find group: {x_group}")

        points = make_xy_points(
            groups[x_group],
            groups[y_group],
            x_group,
            y_group
        )

    elif kind == "pie":
        points = make_pie_points(groups[y_group], y_group)

    elif kind == "timeline_single":
        points = make_timeline_points(groups[y_group], y_group)

    else:
        points = make_index_points(groups[y_group], y_group)

    plot_type_map = {
        "scatter_pair": "scatter",
        "linear_regression": "scatter",
        "barchart_pair": "barchart",
        "barchart_single": "barchart",
        "pie": "pie",
        "timeline_pair": "timeline",
        "timeline_single": "timeline",
    }

    payload: Dict[str, Any] = {
        "plotOption": option_string,
        "type": plot_type_map[kind],
        "xGroup": x_group,
        "yGroup": y_group,
        "scatterData": {
            "points": points
        }
    }

    if kind == "linear_regression":
        reg = linear_regression(points)
        payload["mode"] = "linearRegression"
        payload["lineEquations"] = []

        if reg:
            payload["lineEquations"].append({
                **reg,
                "label": f"{y_group} = {reg['slope']} * {x_group} + {reg['intercept']}",
                "color": "red"
            })

    return payload


def build_all_plot_payloads(wells: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups = collect_available_groups(wells)
    names = sorted(groups.keys())

    payloads: List[Dict[str, Any]] = []

    for x_group in names:
        for y_group in names:
            if x_group == y_group:
                continue

            pair_options = [
                f"Scatter: {x_group} vs {y_group}",
                f"Bar Chart: {y_group} by {x_group}",
                f"Linear Regression: {x_group} vs {y_group}",
                f"Timeline: {x_group} vs {y_group}",
            ]

            for option in pair_options:
                payloads.append(build_plot_payload(wells, option))

    for group in names:
        single_options = [
            f"Bar Chart: {group}",
            f"Pie Chart: {group}",
            f"Timeline: {group}",
        ]

        for option in single_options:
            payloads.append(build_plot_payload(wells, option))

    return payloads


def _main_ion() -> int:
    works.msg("\tready: generate all plot payloads")

    raw_json = works.param(1)
    plot_option = works.param(2)

    try:
        data = _load_json(raw_json)

        if isinstance(data, dict) and "wells" in data:
            wells = data["wells"]
        elif isinstance(data, list):
            wells = data
        else:
            raise ValueError("Expected list of wells or object with wells array")

        if plot_option:
            result = build_plot_payload(wells, plot_option)
        else:
            result = build_all_plot_payloads(wells)

        works.resolve(result)
        return 0

    except Exception as e:
        works.resolve({"error": str(e)})
        return 1

_main_ion()