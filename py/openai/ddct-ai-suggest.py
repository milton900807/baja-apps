#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
ddCt feasibility detector (Ion Works)

Purpose
-------
Takes in one or more tables and determines whether ddCt can be calculated.
If yes, returns the likely columns involved and the operation labels needed.

What it checks
--------------
For ddCt, the script looks for evidence that the input tables support:

1) Ct / Cq measurement
2) Target-vs-reference separation
3) Sample / grouping alignment
4) Control / baseline grouping

Supported input shapes
----------------------
1) Ion-style "tables" dict:
   {
     "tables": {
       "PCR[0:0][0:0]": "Sample",
       "PCR[1:0][0:0]": "Condition",
       ...
     }
   }

2) Wells-style:
   {
     "wells": [
       {"table": "PCR", "x": 0, "y": 0, "value": "Sample"},
       {"table": "PCR", "x": 1, "y": 0, "value": "Condition"},
       ...
     ]
   }

3) Wrapper objects around either of the above:
   artifact/result/data/payload/output/response

Output artifact shape
---------------------
{
  "tables": {...},
  "formulas": {},
  "annotations": {...},
  "units": {...},
  "diagnostics": "NO_ISSUES_DETECTED"
}

Key outputs in Analysis table
-----------------------------
- Status
- Can_Calculate_dCt
- Can_Calculate_ddCt
- Format_Detected
- Best_Table
- Ct_Value_Column
- Target_Column
- Reference_Column
- Sample_Column
- Condition_Column
- Control_Label
- Operation_1_Label
- Operation_1_Columns
- Operation_2_Label
- Operation_2_Columns
- Notes
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

# ---- Ion Works ----
from ion import works  # type: ignore


# ---------------- regex / utils ----------------
_KEY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$")
_MACHINE_LABEL_RE = re.compile(r"[^A-Za-z0-9_]+")

_REFERENCE_GENE_HINTS = {
    "gapdh",
    "actb",
    "18s",
    "18s_rrna",
    "rrna18s",
    "hprt",
    "hprt1",
    "rplp0",
    "b2m",
    "tbp",
    "pgk1",
    "gusb",
    "endo_control",
    "endogenous_control",
    "housekeeping",
    "reference",
    "normalizer",
}

_CONTROL_HINTS = {
    "control",
    "vehicle",
    "untreated",
    "baseline",
    "mock",
    "wt",
    "wildtype",
    "wild_type",
    "parental",
    "dmso",
    "day0",
    "day_0",
    "t0",
    "time0",
    "time_0",
    "reference",
    "calibrator",
}


def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"


def _to_jsonable(obj: Any) -> Any:
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


def _normalize_label(label: str) -> str:
    s = str(label or "").strip()
    s = re.sub(r"\s+", "_", s)
    s = _MACHINE_LABEL_RE.sub("_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s:
        return "Unnamed"
    if re.match(r"^[0-9]", s):
        s = f"X_{s}"
    return s


def _norm_text(v: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(v or "").strip().lower()).strip("_")


def _is_numberish(v: Any) -> bool:
    if isinstance(v, (int, float)):
        return True
    s = str(v or "").strip().replace(",", "")
    if s == "":
        return False
    try:
        float(s)
        return True
    except Exception:
        return False


def _safe_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v)


# ---------------- parsing input into tables ----------------
def _parse_tables_object(obj: Any) -> Optional[Dict[str, List[List[Any]]]]:
    if not isinstance(obj, dict):
        return None

    tables = obj.get("tables")
    if not isinstance(tables, dict):
        return None

    by_table: Dict[str, Dict[Tuple[int, int], Any]] = {}
    max_rc: Dict[str, Tuple[int, int]] = {}

    for k, v in tables.items():
        m = _KEY_RE.match(str(k))
        if not m:
            continue
        table_name, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        by_table.setdefault(table_name, {})[(j, i)] = v
        rmax, cmax = max_rc.get(table_name, (-1, -1))
        max_rc[table_name] = (max(rmax, j), max(cmax, i))

    out: Dict[str, List[List[Any]]] = {}
    for t, cells in by_table.items():
        rmax, cmax = max_rc[t]
        grid = [["" for _ in range(cmax + 1)] for _ in range(rmax + 1)]
        for (r, c), v in cells.items():
            grid[r][c] = v
        out[t] = grid

    return out if out else None


def _parse_wells_object(obj: Any) -> Optional[Dict[str, List[List[Any]]]]:
    if not isinstance(obj, dict):
        return None

    wells = obj.get("wells")
    if not isinstance(wells, list):
        return None

    by_table: Dict[str, Dict[Tuple[int, int], Any]] = {}
    max_rc: Dict[str, Tuple[int, int]] = {}

    for cell in wells:
        if not isinstance(cell, dict):
            continue
        table_name = str(cell.get("table") or cell.get("sheet") or cell.get("name") or "Table1")
        x = cell.get("x")
        y = cell.get("y")
        if x is None or y is None:
            continue
        try:
            c = int(x)
            r = int(y)
        except Exception:
            continue
        by_table.setdefault(table_name, {})[(r, c)] = cell.get("value")
        rmax, cmax = max_rc.get(table_name, (-1, -1))
        max_rc[table_name] = (max(rmax, r), max(cmax, c))

    out: Dict[str, List[List[Any]]] = {}
    for t, cells in by_table.items():
        rmax, cmax = max_rc[t]
        grid = [["" for _ in range(cmax + 1)] for _ in range(rmax + 1)]
        for (r, c), v in cells.items():
            grid[r][c] = v
        out[t] = grid

    return out if out else None


def _extract_tables(input_json: Any) -> Dict[str, List[List[Any]]]:
    def _try(obj: Any) -> Optional[Dict[str, List[List[Any]]]]:
        if obj is None:
            return None

        if isinstance(obj, dict):
            for parser in (_parse_tables_object, _parse_wells_object):
                parsed = parser(obj)
                if parsed:
                    return parsed

            for wrapper_key in ("artifact", "result", "data", "payload", "output", "response"):
                if wrapper_key in obj:
                    parsed = _try(obj.get(wrapper_key))
                    if parsed:
                        return parsed

        return None

    parsed = _try(input_json)
    if parsed:
        return parsed

    raise RuntimeError("Unrecognized input shape. Expected Ion tables or wells format.")


# ---------------- table inspection ----------------
def _headers_and_rows(grid: List[List[Any]]) -> Tuple[List[str], List[Dict[str, Any]]]:
    if not grid:
        return [], []

    header_row = grid[0]
    headers = [_normalize_label(_safe_str(h) or f"Column_{idx}") for idx, h in enumerate(header_row)]

    rows: List[Dict[str, Any]] = []
    for raw_row in grid[1:]:
        row_dict: Dict[str, Any] = {}
        for idx, h in enumerate(headers):
            row_dict[h] = raw_row[idx] if idx < len(raw_row) else ""
        if any(str(v).strip() != "" for v in row_dict.values()):
            rows.append(row_dict)

    return headers, rows


def _column_values(rows: List[Dict[str, Any]], col: str, max_n: int = 50) -> List[Any]:
    vals = []
    for r in rows[:max_n]:
        vals.append(r.get(col))
    return vals


def _score_ct_header(h: str) -> int:
    n = _norm_text(h)
    score = 0
    if n in {"ct", "cq"}:
        score += 10
    if "ct" in n:
        score += 6
    if "cq" in n:
        score += 6
    if "threshold_cycle" in n:
        score += 8
    if "mean_ct" in n or "avg_ct" in n:
        score += 4
    return score


def _score_gene_header(h: str) -> int:
    n = _norm_text(h)
    score = 0
    for token in ("gene", "target", "assay", "analyte", "transcript", "marker"):
        if token in n:
            score += 3
    return score


def _score_role_header(h: str) -> int:
    n = _norm_text(h)
    score = 0
    for token in ("role", "type", "class", "kind"):
        if token in n:
            score += 3
    return score


def _score_sample_header(h: str) -> int:
    n = _norm_text(h)
    score = 0
    for token in ("sample", "sample_id", "well", "well_id", "replicate", "bio_rep", "tech_rep", "subject", "specimen"):
        if token in n:
            score += 3
    return score


def _score_condition_header(h: str) -> int:
    n = _norm_text(h)
    score = 0
    for token in ("condition", "group", "treatment", "arm", "cohort", "timepoint", "dose", "status"):
        if token in n:
            score += 3
    return score


def _find_best(headers: List[str], scorer) -> Optional[str]:
    best_h = None
    best_score = -1
    for h in headers:
        s = scorer(h)
        if s > best_score:
            best_score = s
            best_h = h
    return best_h if best_score > 0 else None


def _find_control_label(rows: List[Dict[str, Any]], condition_col: Optional[str]) -> Optional[str]:
    if not condition_col:
        return None
    vals = [_norm_text(v) for v in _column_values(rows, condition_col, max_n=100)]
    counts: Dict[str, int] = {}
    for v in vals:
        if not v:
            continue
        counts[v] = counts.get(v, 0) + 1
    for v in counts:
        if v in _CONTROL_HINTS:
            return v
    return None


def _has_reference_values(rows: List[Dict[str, Any]], col: Optional[str]) -> bool:
    if not col:
        return False
    vals = [_norm_text(v) for v in _column_values(rows, col, max_n=100)]
    return any(v in _REFERENCE_GENE_HINTS or "reference" in v or "housekeeping" in v for v in vals)


def _find_likely_reference_ct_column(headers: List[str]) -> Optional[str]:
    candidates = []
    for h in headers:
        n = _norm_text(h)
        if _score_ct_header(h) <= 0:
            continue
        bonus = 0
        if any(tok in n for tok in ("reference", "housekeeping", "normalizer", "gapdh", "actb", "18s", "hprt", "rplp0", "b2m", "tbp")):
            bonus += 10
        candidates.append((bonus + _score_ct_header(h), h))
    candidates.sort(reverse=True)
    return candidates[0][1] if candidates and candidates[0][0] > 0 else None


def _find_likely_target_ct_column(headers: List[str], ref_col: Optional[str]) -> Optional[str]:
    candidates = []
    for h in headers:
        if h == ref_col:
            continue
        if _score_ct_header(h) <= 0:
            continue
        n = _norm_text(h)
        bonus = 0
        if "target" in n or "gene" in n or "assay" in n:
            bonus += 4
        if not any(tok in n for tok in ("reference", "housekeeping", "normalizer", "gapdh", "actb", "18s", "hprt", "rplp0", "b2m", "tbp")):
            bonus += 2
        candidates.append((bonus + _score_ct_header(h), h))
    candidates.sort(reverse=True)
    return candidates[0][1] if candidates and candidates[0][0] > 0 else None


def _assess_table(table_name: str, grid: List[List[Any]]) -> Dict[str, Any]:
    headers, rows = _headers_and_rows(grid)

    ct_value_col = _find_best(headers, _score_ct_header)
    gene_col = _find_best(headers, _score_gene_header)
    role_col = _find_best(headers, _score_role_header)
    sample_col = _find_best(headers, _score_sample_header)
    condition_col = _find_best(headers, _score_condition_header)

    control_label = _find_control_label(rows, condition_col)

    # Long-format ddCt pattern:
    # sample + condition + ct + gene/target + some way to identify reference gene/assay
    long_format_score = 0
    if ct_value_col:
        long_format_score += 2
    if gene_col:
        long_format_score += 2
    if sample_col:
        long_format_score += 1
    if condition_col:
        long_format_score += 1
    if _has_reference_values(rows, gene_col):
        long_format_score += 3
    if _has_reference_values(rows, role_col):
        long_format_score += 2

    # Wide-format ddCt pattern:
    # sample + condition + separate ct columns for target and reference
    ref_ct_col = _find_likely_reference_ct_column(headers)
    target_ct_col = _find_likely_target_ct_column(headers, ref_ct_col)

    wide_format_score = 0
    if ref_ct_col:
        wide_format_score += 4
    if target_ct_col:
        wide_format_score += 3
    if sample_col:
        wide_format_score += 1
    if condition_col:
        wide_format_score += 1

    if wide_format_score >= long_format_score and ref_ct_col and target_ct_col:
        fmt = "wide"
        can_dct = True
        can_ddct = bool(condition_col and control_label)
        return {
            "table": table_name,
            "format": fmt,
            "can_dct": can_dct,
            "can_ddct": can_ddct,
            "ct_value_col": None,
            "target_col": target_ct_col,
            "reference_col": ref_ct_col,
            "sample_col": sample_col,
            "condition_col": condition_col,
            "control_label": control_label,
            "score": wide_format_score,
            "notes": "Detected separate target/reference Ct columns.",
        }

    fmt = "long" if long_format_score > 0 else "unknown"
    can_dct = bool(ct_value_col and gene_col and (_has_reference_values(rows, gene_col) or _has_reference_values(rows, role_col)))
    can_ddct = bool(can_dct and condition_col and control_label)

    return {
        "table": table_name,
        "format": fmt,
        "can_dct": can_dct,
        "can_ddct": can_ddct,
        "ct_value_col": ct_value_col,
        "target_col": gene_col,
        "reference_col": gene_col if _has_reference_values(rows, gene_col) else role_col,
        "sample_col": sample_col,
        "condition_col": condition_col,
        "control_label": control_label,
        "score": long_format_score,
        "notes": (
            "Detected long-format Ct table." if fmt == "long"
            else "Could not confidently detect a ddCt-compatible structure."
        ),
    }


def _pick_best_assessment(assessments: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not assessments:
        raise RuntimeError("No tables found.")
    ranked = sorted(
        assessments,
        key=lambda x: (
            1 if x.get("can_ddct") else 0,
            1 if x.get("can_dct") else 0,
            int(x.get("score") or 0),
        ),
        reverse=True,
    )
    return ranked[0]


# ---------------- output assembly ----------------
def _analysis_rows(best: Dict[str, Any]) -> List[Tuple[str, str]]:
    if best["format"] == "wide":
        op1_label = "delta_ct"
        op1_cols = f"{best.get('target_col')}-{best.get('reference_col')}"
        op2_label = "delta_delta_ct"
        op2_cols = f"{op1_label}-mean({op1_label} where {best.get('condition_col')}={best.get('control_label')})"
    elif best["format"] == "long":
        ref_basis = best.get("reference_col") or "reference_marker"
        op1_label = "delta_ct"
        op1_cols = f"{best.get('ct_value_col')} grouped by {best.get('sample_col')} using {best.get('target_col')} vs {ref_basis}"
        op2_label = "delta_delta_ct"
        op2_cols = f"{op1_label}-mean({op1_label} where {best.get('condition_col')}={best.get('control_label')})"
    else:
        op1_label = ""
        op1_cols = ""
        op2_label = ""
        op2_cols = ""

    status = (
        "DDCT_CALCULABLE" if best.get("can_ddct") else
        "DCT_ONLY" if best.get("can_dct") else
        "DDCT_NOT_CALCULABLE"
    )

    notes = best.get("notes") or ""
    if best.get("can_dct") and not best.get("can_ddct"):
        notes = (notes + " Missing clear control/baseline grouping for ddCt.").strip()

    return [
        ("Status", status),
        ("Can_Calculate_dCt", "YES" if best.get("can_dct") else "NO"),
        ("Can_Calculate_ddCt", "YES" if best.get("can_ddct") else "NO"),
        ("Format_Detected", _safe_str(best.get("format"))),
        ("Best_Table", _safe_str(best.get("table"))),
        ("Ct_Value_Column", _safe_str(best.get("ct_value_col"))),
        ("Target_Column", _safe_str(best.get("target_col"))),
        ("Reference_Column", _safe_str(best.get("reference_col"))),
        ("Sample_Column", _safe_str(best.get("sample_col"))),
        ("Condition_Column", _safe_str(best.get("condition_col"))),
        ("Control_Label", _safe_str(best.get("control_label"))),
        ("Operation_1_Label", op1_label),
        ("Operation_1_Columns", op1_cols),
        ("Operation_2_Label", op2_label),
        ("Operation_2_Columns", op2_cols),
        ("Notes", notes),
    ]


def _rows_to_wire(table_name: str, rows: List[Tuple[str, str]]) -> Dict[str, str]:
    out: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    r = 1
    for label, value in rows:
        out[_key(table_name, 0, r)] = _normalize_label(label)
        out[_key(table_name, 1, r)] = value
        r += 1
    return out


def _build_output(input_tables: Dict[str, List[List[Any]]]) -> Dict[str, Any]:
    assessments = []
    for table_name, grid in input_tables.items():
        if not grid or len(grid) < 2:
            continue
        assessments.append(_assess_table(table_name, grid))

    if not assessments:
        raise RuntimeError("No non-empty tables available for ddCt assessment.")

    best = _pick_best_assessment(assessments)
    analysis_rows = _analysis_rows(best)

    tables = _rows_to_wire("Analysis", analysis_rows)

    artifact = {
        "tables": tables,
        "formulas": {},
        "annotations": {
            "Analysis": (
                "ddCt feasibility assessment. Returns whether dCt/ddCt appear calculable, "
                "the likely columns to use, and the operation labels."
            )
        },
        "units": {
            "Analysis": {
                "Can_Calculate_dCt": "boolean",
                "Can_Calculate_ddCt": "boolean",
            }
        },
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------------- orchestrator ----------------
def run_ddct_detector(
    user_prompt: str,
    tables_json: Any,
    *,
    model: str = "gpt-4o-mini",   # retained for compatibility
    temperature: float = 0.0,     # retained for compatibility
) -> Dict[str, Any]:
    parsed_tables = _extract_tables(tables_json)
    return _build_output(parsed_tables)


# ---------------- ion entrypoint ----------------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    try:
        tables_json = works.param(2)
    except Exception as e:
        raise RuntimeError("Ion: param(2) must be input tables JSON.") from e

    try:
        model = str(works.param(3) or default_model)
    except Exception:
        model = default_model

    try:
        temperature = float(works.param(4) or 0.0)
    except Exception:
        temperature = 0.0

    try:
        artifact = run_ddct_detector(
            user_prompt=str(user_prompt),
            tables_json=tables_json,
            model=model,
            temperature=temperature,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "ddct-feasibility-detector",
        })
        raise


if __name__ == "__main__":
    works.msg("🔎 loading ddCt feasibility detector…")
    _main_ion("gpt-4o-mini")