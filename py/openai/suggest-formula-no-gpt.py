#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion-only: Heuristically suggest formulas for a target label using provided tables,
WITHOUT using GPT.

Params (Ion):
  param(1): tables (JSON array, jfile:/path, path, or noisy/percent-encoded).
             You may also pass a Python/JSON list that contains both tables and the keyword.
  param(2): target label keyword (e.g., "Initial_Capital") — may be noisy; we'll clean/fuzzy match.
  param(3): ignored (for compatibility with previous version).
  param(4): ignored.

Behavior:
  • Parses tables into Python structures.
  • Cleans/fuzzy-matches the target keyword to existing labels (for context).
  • Scans tables to find numeric columns.
  • Proposes formulas using SUM, AVERAGE, and SUMPRODUCT over those columns.
  • Returns JSON with suggestions via works.resolve.

No OpenAI / GPT is used.
"""

import os
import re
import json
import ast
import difflib
from typing import Any, Optional, List, Dict, Tuple
from urllib.parse import unquote

# -------- Ion integration (required) --------
from ion import works  # type: ignore


# ---------- Safe/robust parsing utilities ----------

def _decode(s):
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

    raw = _decode(s).strip()
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


def _extract_label_set(tables: list) -> set[str]:
    """
    Extract label tokens from column x==0 (row y>=1), plus multi-col table headers.
    """
    labels = set()
    for tbl in tables or []:
        wells = tbl.get("wells", [])
        for w in wells:
            if w.get("x") == 0 and isinstance(w.get("value"), str):
                if (w.get("y") or 0) >= 1:
                    labels.add(w["value"])
        # Also include top headers for multicol tables (x>0, y==0)
        for w in wells:
            if w.get("y") == 0 and isinstance(w.get("value"), str):
                if (w.get("x") or 0) >= 1:
                    labels.add(w["value"])
    return labels


def _clean_keyword(raw_keyword: str | None, tables: list | None) -> str:
    """
    Normalize target keyword:
      - URL-decode
      - strip quotes/whitespace
      - if it's a big blob, try to pick a token that matches an existing label
      - fuzzy fallback to closest label
    """
    if raw_keyword is None:
        return ""
    s = _decode(raw_keyword).strip().strip("'\"")
    if not s:
        return ""
    label_set = _extract_label_set(tables or [])

    if s in label_set:
        return s

    tokens = [tok for tok in re.split(r"[\s,;/]+", s) if tok]
    for tok in tokens:
        if tok in label_set:
            return tok

    if label_set:
        best = difflib.get_close_matches(s, list(label_set), n=1, cutoff=0.6)
        if best:
            return best[0]

    return s


def _coerce_tables_and_keyword(raw1, raw2):
    """
    Supports:
      - raw1 = tables (json/path/noisy), raw2 = keyword
      - OR raw1 is a list containing [tables_or_path, keyword] (and possibly extra noise)
    Returns (tables_list, keyword_str)
    """
    # Try to parse raw1 as a list we can mine
    r1 = _decode(raw1)
    parsed1 = _maybe_json_load(r1) or _maybe_literal_eval(r1)
    tables_candidate = None
    keyword_candidate = None

    if isinstance(parsed1, list):
        for item in parsed1:
            if isinstance(item, list) and item and isinstance(item[0], dict) and "wells" in item[0]:
                tables_candidate = item
            elif isinstance(item, str) and _looks_like_path(item):
                try:
                    maybe_tables = _read_path(item)
                    if isinstance(maybe_tables, list):
                        tables_candidate = maybe_tables
                except Exception:
                    pass
            elif isinstance(item, str):
                keyword_candidate = item

    if tables_candidate is None:
        tables_candidate = _load_json_from_path_or_text(raw1)

    kw = raw2 if raw2 is not None else keyword_candidate
    kw = _clean_keyword(kw, tables_candidate)

    if not isinstance(tables_candidate, list):
        raise ValueError("Tables must resolve to a list of table dicts.")
    return tables_candidate, kw


# ---------- Heuristic table analysis (no GPT) ----------

def _get_numeric_columns(table: Dict[str, Any]) -> Tuple[Dict[int, str], Dict[int, List[float]]]:
    """
    For a single table, return:
      - headers_by_x: mapping x -> header string
      - numeric_values_by_x: mapping x -> list of numeric values for that column
    """
    wells = table.get("wells", [])
    headers_by_x: Dict[int, str] = {}
    numeric_values_by_x: Dict[int, List[float]] = {}

    # Collect headers (top row, y==0)
    for w in wells:
        x = w.get("x")
        y = w.get("y")
        if y == 0 and isinstance(w.get("value"), str) and isinstance(x, int):
            headers_by_x[x] = w["value"]

    # Collect numeric values for columns with x>=1, y>=1
    for w in wells:
        x = w.get("x")
        y = w.get("y")
        if not isinstance(x, int) or not isinstance(y, int):
            continue
        if x < 1 or y < 1:
            continue
        v = w.get("value")
        try:
            num = float(v)
        except (TypeError, ValueError):
            continue
        if num is None or num != num:  # NaN check
            continue
        numeric_values_by_x.setdefault(x, []).append(num)

    # Filter to columns that actually have both header and at least one numeric value
    filtered_numeric: Dict[int, List[float]] = {}
    for x, vals in numeric_values_by_x.items():
        if x in headers_by_x and vals:
            filtered_numeric[x] = vals

    return headers_by_x, filtered_numeric


def suggest_formulas_for_target_heuristic(
    *,
    tables_spec: List[Dict[str, Any]],
    target_label: str,
    max_suggestions: int = 12,
) -> Dict[str, Any]:
    """
    Heuristic (non-GPT) formula suggester.

    Strategy:
      - Find numeric columns in each table.
      - Prefer columns whose header is similar to target_label.
      - Propose formulas using:
          SUM(table[Col]),
          AVERAGE(table[Col]),
          SUMPRODUCT(table[ColA],table[ColB]).
    """
    suggestions: List[Dict[str, str]] = []
    seen_formulas: set[str] = set()

    def add_suggestion(formula: str, explanation: str):
        nonlocal suggestions, seen_formulas
        f_norm = re.sub(r"\s+", "", formula)
        if f_norm in seen_formulas:
            return
        seen_formulas.add(f_norm)
        suggestions.append({"formula": formula, "explanation": explanation})

    # Helper to rank headers by similarity to target_label
    def header_score(h: str) -> float:
        if not target_label:
            return 0.0
        return difflib.SequenceMatcher(None, h.lower(), target_label.lower()).ratio()

    for tbl in tables_spec:
        if len(suggestions) >= max_suggestions:
            break

        name = tbl.get("name", "<unnamed>")
        headers_by_x, numeric_by_x = _get_numeric_columns(tbl)
        if not numeric_by_x:
            continue

        # Rank columns by similarity to target label
        cols = list(numeric_by_x.keys())
        cols.sort(key=lambda x: header_score(headers_by_x.get(x, "")), reverse=True)

        # 1) For each numeric column, propose SUM and AVERAGE
        for x in cols:
            if len(suggestions) >= max_suggestions:
                break
            header = headers_by_x.get(x, f"col_{x}")

            # SUM
            formula_sum = f"SUM({name}[{header}])"
            add_suggestion(
                formula_sum,
                f"Sum of all numeric values in column '{header}' of table '{name}'."
            )
            if len(suggestions) >= max_suggestions:
                break

            # AVERAGE
            formula_avg = f"AVERAGE({name}[{header}])"
            add_suggestion(
                formula_avg,
                f"Average of numeric values in column '{header}' of table '{name}'."
            )

        # 2) For each pair of numeric columns, propose SUMPRODUCT
        ncols = len(cols)
        for i in range(ncols):
            if len(suggestions) >= max_suggestions:
                break
            for j in range(i + 1, ncols):
                if len(suggestions) >= max_suggestions:
                    break
                x1, x2 = cols[i], cols[j]
                h1 = headers_by_x.get(x1, f"col_{x1}")
                h2 = headers_by_x.get(x2, f"col_{x2}")
                formula_sp = f"SUMPRODUCT({name}[{h1}],{name}[{h2}])"
                add_suggestion(
                    formula_sp,
                    f"Sumproduct of columns '{h1}' and '{h2}' in table '{name}', useful for weighted sums."
                )

    return {
        "target_label": target_label,
        "suggestions": suggestions[:max_suggestions],
    }


# ---------- Ion entry point ----------

def _main_ion() -> int:
    """
    Ion entry:
      param(1): tables (JSON / jfile:/path / path / noisy / list-wrapped)
      param(2): keyword (target label)
      param(3): ignored
      param(4): ignored
    """
    works.msg("\tready: heuristic formula suggester (no GPT)")

    raw1 = works.param(1)  # tables or composite list
    raw2 = works.param(2)  # keyword

    # param(3), param(4) kept for interface compatibility, but ignored
    try:
        _ = works.param(3)
    except Exception:
        pass
    try:
        _ = works.param(4)
    except Exception:
        pass

    try:
        tables_spec, keyword = _coerce_tables_and_keyword(raw1, raw2)
    except Exception as e:
        works.resolve(f"Failed to parse inputs: {e}")
        return 1

    if not keyword:
        works.resolve("No target keyword provided/found.")
        return 1

    works.msg("\tParsing tables...")
    works.msg(f"\tGenerating heuristic formula suggestions for '{keyword}'...")

    try:
        result = suggest_formulas_for_target_heuristic(
            tables_spec=tables_spec,
            target_label=keyword,
            max_suggestions=12,
        )
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve(f"Error generating suggestions: {e}")
        return 1


# Auto-run when loaded by Ion
works.msg(' loading heuristic suggester (no GPT) ')
_main_ion()
