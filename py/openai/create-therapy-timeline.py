#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Therapeutic timeline builder from two Ion-style table objects

Purpose
-------
Build a deterministic timeline from:
1) an Assumptions table object
2) an Analysis table object

Both inputs are expected to look like the example payloads you provided:
- table["name"] is "Assumptions" or "Analysis"
- table["wells"] is a 2D array of cell objects
- row labels live in row-header cells
- row values live in cells whose group contains "Value"
- for value cells, the label can be inferred from the non-"Value" group key

Expected Ion params
-------------------
param(1): assumptions table object
param(2): analysis table object
param(3): optional explicit start date override

Output
------
{
  "intervals": [...],
  "milestones": [...],
  "window": {"start": "...", "end": "..."},
  "stages": [...],
  "diagnostics": "NO_ISSUES_DETECTED"
}

Timeline logic
--------------
- Prefer detailed stage times from Assumptions if present
- Otherwise use high-level rows from Analysis:
    Discovery_Time_Weeks
    IND_Enabling_Time_Weeks
    Total_Development_Time_Weeks
- Start date comes from:
    explicit start date param(3)
    or Assumptions[Start_Date]
    or local today at 09:00
"""

import json
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

try:
    from dateutil import parser as dtparser
except Exception:
    dtparser = None

# ---- Ion Works ----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None:
            print(f"IONWORKS:MSG:{s}")

        def resolve(self, obj: Any) -> None:
            print(json.dumps(obj, indent=2, ensure_ascii=False))

        def param(self, i: int) -> Any:
            return None

    works = _Shim()  # type: ignore


# ---------- utils ----------
_MACHINE_LABEL_RE = re.compile(r"[^A-Za-z0-9_]+")


def _to_jsonable(obj: Any) -> Any:
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


def _normalize_label(label: str) -> str:
    s = (label or "").strip()
    s = re.sub(r"\s+", "_", s)
    s = _MACHINE_LABEL_RE.sub("_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        return "Unnamed"
    if re.match(r"^[0-9]", s):
        s = f"X_{s}"
    return s


def _coerce_number(v: Any) -> Any:
    if isinstance(v, (int, float)):
        return v
    if v is None:
        return 0
    if isinstance(v, str):
        s = v.strip().replace(",", "")
        if s == "":
            return 0
        try:
            if re.fullmatch(r"-?\d+", s):
                return int(s)
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return v
    return v


def _now_local() -> datetime:
    return datetime.now().astimezone().replace(second=0, microsecond=0)


def _base_9am(now: datetime) -> datetime:
    return now.replace(hour=9, minute=0, second=0, microsecond=0)


def _coerce_local_tz(dt: Optional[datetime], tz) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def _parse_start_date_maybe(v: Any) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v

    s = str(v).strip()
    if not s:
        return None

    if s.endswith("Z"):
        s = s[:-1] + "+00:00"

    try:
        return datetime.fromisoformat(s)
    except Exception:
        pass

    if dtparser is not None:
        try:
            return dtparser.parse(s)
        except Exception:
            return None

    return None


def _hours(ref: datetime, dt: datetime) -> float:
    return max(0.0, (dt - ref).total_seconds() / 3600.0)


def _interval(name: str, start_dt: datetime, end_dt: datetime, color: str = "black") -> Dict[str, Any]:
    return {
        "name": name,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "type": "interval",
        "color": color,
        "y": 0.45,
    }


def _milestone(name: str, at_dt: datetime, color: str = "black") -> Dict[str, Any]:
    return {
        "name": name,
        "at": at_dt.isoformat(),
        "type": "milestone",
        "color": color,
        "y": 0.8,
    }


# ---------- wells parsing ----------
def _group_keys(cell: Dict[str, Any]) -> List[str]:
    grp = cell.get("group") or {}
    if not isinstance(grp, dict):
        return []
    return [str(k) for k in grp.keys()]


def _is_value_cell(cell: Dict[str, Any]) -> bool:
    return "Value" in set(_group_keys(cell))


def _is_row_header_cell(cell: Dict[str, Any]) -> bool:
    return "RowHeader" in set(_group_keys(cell))


def _extract_label_from_value_cell(cell: Dict[str, Any], table_name: str) -> Optional[str]:
    """
    Example value cell groups:
      {"Value": [...], "Discovery_Time_Weeks": [...]}
      {"Value": [...], "Currency": [...]}
    We want the non-Value, non-table-name key.
    """
    ignore = {"Value", "RowHeader", "ColumnHeader", table_name}
    candidates = [k for k in _group_keys(cell) if k not in ignore]
    if not candidates:
        return None
    return _normalize_label(candidates[0])


def _extract_label_from_row_header_cell(cell: Dict[str, Any]) -> Optional[str]:
    val = cell.get("value")
    if isinstance(val, str) and val.strip():
        return _normalize_label(val)
    return None


def _extract_rows_from_table(table_obj: Any) -> List[Tuple[str, Any]]:
    """
    Robust parser for the example structures you gave.

    Strategy:
    1) Prefer value cells with groups like {"Value": ..., "<Label>": ...}
    2) Also build a row-wise fallback from the 2D wells matrix:
       first row contains labels, second row contains values at matching positions
    """
    if not isinstance(table_obj, dict):
        return []

    table_name = str(table_obj.get("name") or "").strip() or "Table"
    wells = table_obj.get("wells")
    if not isinstance(wells, list):
        return []

    results: List[Tuple[str, Any]] = []
    seen = set()

    # Pass 1: use value-cell group metadata
    for row in wells:
        if not isinstance(row, list):
            continue
        for cell in row:
            if not isinstance(cell, dict):
                continue
            if not _is_value_cell(cell):
                continue

            label = _extract_label_from_value_cell(cell, table_name)
            if not label or label in seen:
                continue

            results.append((label, _coerce_number(cell.get("value"))))
            seen.add(label)

    if results:
        return results

    # Pass 2: row-matrix fallback, assuming row 0 = labels, row 1 = values
    if len(wells) >= 2 and isinstance(wells[0], list) and isinstance(wells[1], list):
        header_row = wells[0]
        value_row = wells[1]
        max_len = min(len(header_row), len(value_row))

        for idx in range(max_len):
            h = header_row[idx]
            v = value_row[idx]
            if not isinstance(h, dict) or not isinstance(v, dict):
                continue

            label = _extract_label_from_row_header_cell(h)
            if not label or label in seen:
                continue

            if _is_value_cell(v) or idx > 0:
                results.append((label, _coerce_number(v.get("value"))))
                seen.add(label)

    return results


def _rows_to_map(rows: List[Tuple[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for label, value in rows:
        out[_normalize_label(label)] = value
    return out


# ---------- timeline builder ----------
def build_timeline_from_tables(
    assumptions_table: Any,
    analysis_table: Any,
    *,
    explicit_start_date: Optional[str] = None,
) -> Dict[str, Any]:
    assumption_rows = _extract_rows_from_table(assumptions_table)
    analysis_rows = _extract_rows_from_table(analysis_table)

    assumptions = _rows_to_map(assumption_rows)
    analysis = _rows_to_map(analysis_rows)

    works.msg(f"parsed assumptions rows: {len(assumption_rows)}")
    works.msg(f"parsed analysis rows: {len(analysis_rows)}")

    now = _now_local()
    tz = now.tzinfo

    start_dt = (
        _parse_start_date_maybe(explicit_start_date)
        or _parse_start_date_maybe(assumptions.get("Start_Date"))
        or _base_9am(now)
    )
    start_dt = _coerce_local_tz(start_dt, tz) or _base_9am(now)

    intervals: List[Dict[str, Any]] = []
    milestones: List[Dict[str, Any]] = []
    stages: List[Dict[str, Any]] = []

    # Detailed stage sequence from assumptions
    stage_sequence = [
        ("Design", "Design_Time_Weeks"),
        ("Research_Grade_Synthesis", "Research_Grade_Synthesis_Time_Weeks"),
        ("Screening", "Screening_Time_Weeks"),
        ("Dose_Response_Screening", "Dose_Response_Screening_Time_Weeks"),
        ("Protein_Screening", "Protein_Screening_Time_Weeks"),
        ("Immunogenic_Screening_In_Vitro", "Immunogenic_Screening_In_Vitro_Time_Weeks"),
        ("GMP_Production", "GMP_Production_Time_Weeks"),
        ("GLP_In_Vivo_Toxicology_13_Weeks", "GLP_In_Vivo_Toxicology_13_Weeks_Time_Weeks"),
        ("Fill_Finish", "Fill_Finish_Time_Weeks"),
        ("IND_Filing", "IND_Filing_Time_Weeks"),
    ]

    detailed_stage_values: List[Tuple[str, str, float]] = []
    for stage_name, label in stage_sequence:
        raw = assumptions.get(label, 0)
        val = _coerce_number(raw)
        try:
            weeks = float(val)
        except Exception:
            weeks = 0.0
        if weeks > 0:
            detailed_stage_values.append((stage_name, label, weeks))

    # High-level fallbacks from analysis
    def _num(m: Dict[str, Any], key: str) -> float:
        try:
            return float(_coerce_number(m.get(key, 0)))
        except Exception:
            return 0.0

    discovery_time = _num(analysis, "Discovery_Time_Weeks")
    ind_time = _num(analysis, "IND_Enabling_Time_Weeks")
    total_time = _num(analysis, "Total_Development_Time_Weeks")

    cursor = start_dt

    if detailed_stage_values:
        discovery_labels = {
            "Design_Time_Weeks",
            "Research_Grade_Synthesis_Time_Weeks",
            "Screening_Time_Weeks",
            "Dose_Response_Screening_Time_Weeks",
            "Protein_Screening_Time_Weeks",
            "Immunogenic_Screening_In_Vitro_Time_Weeks",
        }

        discovery_complete_dt: Optional[datetime] = None

        for idx, (stage_name, label, weeks) in enumerate(detailed_stage_values, start=1):
            stage_start = cursor
            stage_end = stage_start + timedelta(weeks=weeks)

            intervals.append(_interval(stage_name, stage_start, stage_end))
            stages.append(
                {
                    "order": idx,
                    "stage": stage_name,
                    "label": label,
                    "weeks": weeks,
                    "start": stage_start.isoformat(),
                    "end": stage_end.isoformat(),
                }
            )

            cursor = stage_end
            if label in discovery_labels:
                discovery_complete_dt = stage_end

        if discovery_complete_dt is not None:
            milestones.append(_milestone("Discovery_Complete", discovery_complete_dt))

        milestones.append(_milestone("Program_Complete", cursor))

    else:
        if discovery_time > 0:
            s = cursor
            e = s + timedelta(weeks=discovery_time)
            intervals.append(_interval("Discovery", s, e))
            stages.append(
                {
                    "order": 1,
                    "stage": "Discovery",
                    "label": "Discovery_Time_Weeks",
                    "weeks": discovery_time,
                    "start": s.isoformat(),
                    "end": e.isoformat(),
                }
            )
            cursor = e
            milestones.append(_milestone("Discovery_Complete", cursor))

        if ind_time > 0:
            s = cursor
            e = s + timedelta(weeks=ind_time)
            intervals.append(_interval("IND_Enabling", s, e))
            stages.append(
                {
                    "order": 2,
                    "stage": "IND_Enabling",
                    "label": "IND_Enabling_Time_Weeks",
                    "weeks": ind_time,
                    "start": s.isoformat(),
                    "end": e.isoformat(),
                }
            )
            cursor = e

        if not intervals and total_time > 0:
            s = cursor
            e = s + timedelta(weeks=total_time)
            intervals.append(_interval("Therapeutic_Development", s, e))
            stages.append(
                {
                    "order": 1,
                    "stage": "Therapeutic_Development",
                    "label": "Total_Development_Time_Weeks",
                    "weeks": total_time,
                    "start": s.isoformat(),
                    "end": e.isoformat(),
                }
            )
            cursor = e

        if intervals:
            milestones.append(_milestone("Program_Complete", cursor))

    if not intervals:
        fallback_end = start_dt + timedelta(weeks=1)
        intervals.append(_interval("Therapeutic_Development", start_dt, fallback_end))
        milestones.append(_milestone("Program_Complete", fallback_end))
        cursor = fallback_end

    min_start = min(_parse_start_date_maybe(i["start"]) for i in intervals if i.get("start"))
    max_end = max(_parse_start_date_maybe(i["end"]) for i in intervals if i.get("end"))

    min_start = _coerce_local_tz(min_start, tz) or start_dt
    max_end = _coerce_local_tz(max_end, tz) or cursor

    for i in intervals:
        s = _coerce_local_tz(_parse_start_date_maybe(i["start"]), tz)
        e = _coerce_local_tz(_parse_start_date_maybe(i["end"]), tz)
        if s is None or e is None:
            continue
        i["startX"] = _hours(min_start, s)
        i["x"] = _hours(min_start, e)

    for m in milestones:
        at = _coerce_local_tz(_parse_start_date_maybe(m["at"]), tz)
        if at is None:
            continue
        m["x"] = _hours(min_start, at)

    return {
        "intervals": intervals,
        "milestones": milestones,
        "window": {
            "start": min_start.isoformat(),
            "end": max_end.isoformat(),
        },
        "stages": stages,
        "diagnostics": "NO_ISSUES_DETECTED",
        "parsed": {
            "assumptions_rows": assumption_rows,
            "analysis_rows": analysis_rows,
        },
    }


# ---------- ion entry ----------
def _read_param(i: int) -> Any:
    try:
        return works.param(i)
    except Exception:
        return None


def _main_ion() -> int:
    assumptions_table = _read_param(1)
    analysis_table = _read_param(2)
    explicit_start_date = _read_param(3)

    if assumptions_table is None:
        raise RuntimeError("param(1) required: assumptions table object")
    if analysis_table is None:
        raise RuntimeError("param(2) required: analysis table object")

    works.msg("🧭 building therapeutic timeline from provided wells tables…")
    result = build_timeline_from_tables(
        assumptions_table=assumptions_table,
        analysis_table=analysis_table,
        explicit_start_date=str(explicit_start_date) if explicit_start_date else None,
    )
    works.resolve(_to_jsonable(result))
    return 0


if __name__ == "__main__":
    works.msg("🔧 therapeutic timeline builder from assumptions + analysis wells tables")
    _main_ion()