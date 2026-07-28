#!/usr/bin/env python3
"""
find_dilution_trends_ion.py

Find the single best plate well run whose signal trends with a supplied
standard dilution series.

Expected Ion Works params:
1 -> Ion Works table object (dict with keys like cols, rows, wells)
2 -> optional dilution series (newline/comma/space separated numbers, or JSON list)
3 -> optional signal column name (default: "RFU - BG"; fallback: "Mean")

Default dilution series:
100, 50, 25, 12.5, 6.25, 0

Returns:
{
  "result": [
    {
      "direction": "horizontal",
      "wells": ["A1", "A2", "A3", "A4", "A5", "A6"],
      "well_uids": ["...", "...", "...", "...", "...", "..."],
      "signal_uids": ["...", "...", "...", "...", "...", "..."],
      "signal_column": "RFU - BG",
      "signals": [17561.52, 16986.41, 14311.41, 14567.19, 17383.41, 19954.30],
      "expected_dilutions": [100.0, 50.0, 25.0, 12.5, 6.25, 0.0],
      "matched_orientation": "forward",
      "pearson_r": 0.91,
      "r_squared": 0.83,
      "spearman_like": 0.89,
      "monotonic_fraction": 0.80,
      "score": 0.86
    }
  ],
  "meta": {
    "signal_column_used": "RFU - BG",
    "dilution_series": [100.0, 50.0, 25.0, 12.5, 6.25, 0.0],
    "default_dilution_series": [100.0, 50.0, 25.0, 12.5, 6.25, 0.0],
    "match_threshold": 0.85,
    "returned_hits": 1
  }
}
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from ion import works


DEFAULT_SIGNAL_COL = "RFU - BG"
FALLBACK_SIGNAL_COL = "Mean"
DEFAULT_MATCH_THRESHOLD = 0.85
DEFAULT_DILUTION_SERIES = [100.0, 50.0, 25.0, 12.5, 6.25, 0.0]


def safe_float(x: Any) -> Optional[float]:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if not s:
        return None
    s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_dilution_series(raw: Any) -> List[float]:
    if raw is None:
        return DEFAULT_DILUTION_SERIES.copy()

    if isinstance(raw, list):
        vals = [safe_float(v) for v in raw]
        vals = [v for v in vals if v is not None]
        return vals if vals else DEFAULT_DILUTION_SERIES.copy()

    s = str(raw).strip()
    if not s:
        return DEFAULT_DILUTION_SERIES.copy()

    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            vals = [safe_float(v) for v in parsed]
            vals = [v for v in vals if v is not None]
            return vals if vals else DEFAULT_DILUTION_SERIES.copy()
    except Exception:
        pass

    parts = re.split(r"[\s,;]+", s)
    vals = [safe_float(p) for p in parts if p.strip()]
    vals = [v for v in vals if v is not None]
    return vals if vals else DEFAULT_DILUTION_SERIES.copy()


def parse_well_name(well: str) -> Tuple[str, int]:
    m = re.fullmatch(r"([A-Za-z]+)(\d+)", str(well).strip())
    if not m:
        raise ValueError(f"Invalid well name: {well}")
    return m.group(1).upper(), int(m.group(2))


def pearson_r(x: List[float], y: List[float]) -> float:
    n = len(x)
    if n != len(y) or n < 2:
        return 0.0

    mx = sum(x) / n
    my = sum(y) / n

    num = sum((a - mx) * (b - my) for a, b in zip(x, y))
    denx = math.sqrt(sum((a - mx) ** 2 for a in x))
    deny = math.sqrt(sum((b - my) ** 2 for b in y))

    if denx == 0 or deny == 0:
        return 0.0
    return num / (denx * deny)


def rankdata(vals: List[float]) -> List[float]:
    indexed = sorted(enumerate(vals), key=lambda t: t[1])
    ranks = [0.0] * len(vals)

    i = 0
    while i < len(indexed):
        j = i
        while j + 1 < len(indexed) and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j + 2) / 2.0
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1

    return ranks


def spearman_like(x: List[float], y: List[float]) -> float:
    return pearson_r(rankdata(x), rankdata(y))


def monotonic_fraction(signal: List[float], reference: List[float]) -> float:
    if len(signal) < 2 or len(signal) != len(reference):
        return 0.0

    matches = 0.0
    total = 0
    for i in range(len(signal) - 1):
        ds = signal[i + 1] - signal[i]
        dr = reference[i + 1] - reference[i]

        sign_s = 0 if ds == 0 else (1 if ds > 0 else -1)
        sign_r = 0 if dr == 0 else (1 if dr > 0 else -1)

        total += 1
        if sign_s == sign_r:
            matches += 1
        elif sign_s == 0 or sign_r == 0:
            matches += 0.5

    return matches / total if total else 0.0


def trend_score(signal: List[float], dilution: List[float]) -> Dict[str, float]:
    forward_r = pearson_r(signal, dilution)
    reverse_signal = list(reversed(signal))
    reverse_r = pearson_r(reverse_signal, dilution)

    if abs(reverse_r) > abs(forward_r):
        chosen_signal = reverse_signal
        orientation = "reversed"
        r = reverse_r
    else:
        chosen_signal = signal
        orientation = "forward"
        r = forward_r

    rs = r * r
    sp = spearman_like(chosen_signal, dilution)
    mono = monotonic_fraction(chosen_signal, dilution)
    score = 0.45 * abs(sp) + 0.35 * abs(r) + 0.20 * mono

    return {
        "matched_orientation": orientation,
        "pearson_r": round(r, 6),
        "r_squared": round(rs, 6),
        "spearman_like": round(sp, 6),
        "monotonic_fraction": round(mono, 6),
        "score": round(score, 6),
    }


def extract_table_rows(table_obj: Dict[str, Any]) -> List[Dict[str, Any]]:
    cells = table_obj.get("wells", [])
    if not isinstance(cells, list) or not cells:
        raise ValueError("Param 1 does not look like a valid Ion Works table object")

    by_y: Dict[int, Dict[int, Dict[str, Any]]] = defaultdict(dict)
    for cell in cells:
        x = cell.get("x")
        y = cell.get("y")
        if x is None or y is None:
            continue
        by_y[int(y)][int(x)] = cell

    if 0 not in by_y:
        raise ValueError("Could not find header row (y=0)")

    header_row = by_y[0]
    headers: Dict[int, str] = {}
    for x, cell in header_row.items():
        headers[x] = str(cell.get("value", "")).strip()

    if not headers:
        raise ValueError("No headers found in the table input")

    rows: List[Dict[str, Any]] = []
    for y in sorted(k for k in by_y.keys() if k != 0):
        row_cells = by_y[y]
        row: Dict[str, Any] = {"_row_index": y}
        for x, col_name in headers.items():
            cell = row_cells.get(x)
            if cell is None:
                row[col_name] = None
                row[f"{col_name}__uid"] = None
            else:
                row[col_name] = cell.get("value")
                row[f"{col_name}__uid"] = cell.get("uid")
        rows.append(row)

    return rows


def choose_signal_column(rows: List[Dict[str, Any]], requested: Optional[str]) -> str:
    if requested:
        req = str(requested).strip()
        if req and any(req in r for r in rows):
            return req

    if rows and DEFAULT_SIGNAL_COL in rows[0]:
        return DEFAULT_SIGNAL_COL
    if rows and FALLBACK_SIGNAL_COL in rows[0]:
        return FALLBACK_SIGNAL_COL

    candidate_counts: Dict[str, int] = defaultdict(int)
    for row in rows:
        for k, v in row.items():
            if k.endswith("__uid") or k.startswith("_") or k == "Well":
                continue
            if safe_float(v) is not None:
                candidate_counts[k] += 1

    if not candidate_counts:
        raise ValueError("Could not find a numeric signal column")
    return max(candidate_counts, key=candidate_counts.get)


def build_plate_maps(rows: List[Dict[str, Any]], signal_col: str) -> Dict[str, Dict[str, Any]]:
    plate: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        well = row.get("Well")
        if well is None:
            continue
        well_name = str(well).strip()
        if not well_name:
            continue

        signal = safe_float(row.get(signal_col))
        if signal is None:
            continue

        well_uid = row.get("Well__uid")
        signal_uid = row.get(f"{signal_col}__uid")

        plate[well_name] = {
            "well": well_name,
            "signal": signal,
            "well_uid": well_uid,
            "signal_uid": signal_uid,
        }
    return plate


def generate_horizontal_runs(
    plate: Dict[str, Dict[str, Any]],
    run_len: int,
) -> List[List[Dict[str, Any]]]:
    rows_by_letter: Dict[str, Dict[int, Dict[str, Any]]] = defaultdict(dict)
    for well_name, payload in plate.items():
        row_letter, col_num = parse_well_name(well_name)
        rows_by_letter[row_letter][col_num] = payload

    runs: List[List[Dict[str, Any]]] = []
    for _, col_map in rows_by_letter.items():
        cols = sorted(col_map.keys())
        for start in cols:
            seq = []
            ok = True
            for c in range(start, start + run_len):
                if c not in col_map:
                    ok = False
                    break
                seq.append(col_map[c])
            if ok:
                runs.append(seq)
    return runs


def generate_vertical_runs(
    plate: Dict[str, Dict[str, Any]],
    run_len: int,
) -> List[List[Dict[str, Any]]]:
    cols_by_num: Dict[int, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    for well_name, payload in plate.items():
        row_letter, col_num = parse_well_name(well_name)
        cols_by_num[col_num][row_letter] = payload

    runs: List[List[Dict[str, Any]]] = []
    for _, row_map in cols_by_num.items():
        row_letters = sorted(row_map.keys())
        for i in range(len(row_letters) - run_len + 1):
            seq_letters = row_letters[i : i + run_len]
            ords = [ord(r) for r in seq_letters]
            if ords != list(range(ords[0], ords[0] + run_len)):
                continue
            seq = [row_map[r] for r in seq_letters]
            runs.append(seq)
    return runs


def build_hit(
    seq: List[Dict[str, Any]],
    dilution: List[float],
    direction: str,
    signal_col: str,
) -> Dict[str, Any]:
    signals = [x["signal"] for x in seq]
    stats = trend_score(signals, dilution)

    return {
        "direction": direction,
        "wells": [x["well"] for x in seq],
        "well_uids": [x["well_uid"] for x in seq],
        "signal_uids": [x["signal_uid"] for x in seq],
        "signal_column": signal_col,
        "signals": [round(float(v), 6) for v in signals],
        "expected_dilutions": dilution,
        **stats,
    }


def better_hit(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if a is None:
        return b
    if b is None:
        return a

    if b["score"] != a["score"]:
        return b if b["score"] > a["score"] else a

    if abs(b["pearson_r"]) != abs(a["pearson_r"]):
        return b if abs(b["pearson_r"]) > abs(a["pearson_r"]) else a

    if b["r_squared"] != a["r_squared"]:
        return b if b["r_squared"] > a["r_squared"] else a

    return a


def main() -> None:
    try:
        table_obj = works.param(1)
        dilution_raw = works.param(2)
        requested_signal_col = works.param(3)

        if not table_obj:
            works.resolve({"error": "Missing required param 1: Ion Works table object"})
            return

        dilution = parse_dilution_series(dilution_raw)
        if len(dilution) < 3:
            works.resolve({
                "error": "Dilution series must contain at least 3 numeric values"
            })
            return

        rows = extract_table_rows(table_obj)
        if not rows:
            works.resolve({"error": "No usable rows found in the table"})
            return

        signal_col = choose_signal_column(rows, requested_signal_col)
        plate = build_plate_maps(rows, signal_col)

        if len(plate) < len(dilution):
            works.resolve({
                "error": "Not enough numeric wells in the selected signal column to compare against the dilution series"
            })
            return

        horizontal_runs = generate_horizontal_runs(plate, len(dilution))
        vertical_runs = generate_vertical_runs(plate, len(dilution))

        best_hit: Optional[Dict[str, Any]] = None
        matched_runs = 0

        for seq in horizontal_runs:
            hit = build_hit(seq, dilution, "horizontal", signal_col)
            if hit["score"] >= DEFAULT_MATCH_THRESHOLD:
                matched_runs += 1
                best_hit = better_hit(best_hit, hit)

        for seq in vertical_runs:
            hit = build_hit(seq, dilution, "vertical", signal_col)
            if hit["score"] >= DEFAULT_MATCH_THRESHOLD:
                matched_runs += 1
                best_hit = better_hit(best_hit, hit)

        works.resolve({
            "result": [best_hit] if best_hit else [],
            "meta": {
                "signal_column_used": signal_col,
                "dilution_series": dilution,
                "default_dilution_series": DEFAULT_DILUTION_SERIES,
                "match_threshold": DEFAULT_MATCH_THRESHOLD,
                "horizontal_runs_checked": len(horizontal_runs),
                "vertical_runs_checked": len(vertical_runs),
                "matches_found": matched_runs,
                "returned_hits": 1 if best_hit else 0,
            }
        })

    except Exception as e:
        works.resolve({
            "error": str(e)
        })


if __name__ == "__main__":
    main()