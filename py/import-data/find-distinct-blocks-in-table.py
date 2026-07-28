#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
select_wells_from_table_and_prompt.py

Params
------
Param(1): table JSON object (or JSON string) containing the wells/cells
Param(2): user prompt string describing which wells to select

Behavior
--------
1. Parse the table JSON into headers + rows
2. Use OpenAI (via OPENAI_API_KEY) to infer which rows match the user prompt
3. Fall back to heuristic matching if the OpenAI call fails or returns nothing
4. Return selected well UIDs

Environment
-----------
Requires:
  OPENAI_API_KEY

Optional:
  OPENAI_MODEL (defaults to gpt-4o-mini)

Output
------
{
  "status": "ok",
  "selected_well_uids": ["...", "..."],
  "table_name": "raw",
  "best_column": {
    "col_index": 2,
    "header": "Sample Type",
    "score": 0.91
  },
  "matches": {
    "include_phrases": ["controls"],
    "exclude_phrases": ["average controls"]
  },
  "debug": {
    "matched_rows": [1, 4, 7],
    "matched_values_by_column": {
      "Sample Type": ["controls"]
    },
    "selection_method": "llm"
  }
}
"""

import json
import os
import re
from typing import Any, Dict, List, Tuple, Optional

from ion import works  # type: ignore
from openai import OpenAI


STOPWORDS = {
    "select", "find", "show", "get", "choose", "pick", "the", "a", "an",
    "all", "with", "that", "those", "these", "for", "of", "to", "in", "on",
    "and", "or", "by", "from", "cells", "cell", "wells", "well", "rows", "row",
    "uids", "uid"
}

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)


def _norm(s: Any) -> str:
    s = _safe_str(s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def _tokenize(s: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9_]+", _norm(s)) if t not in STOPWORDS]


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


def _split_prompt(prompt: str) -> Tuple[List[str], List[str]]:
    p = _norm(prompt)

    separators = [
        r"\bbut not\b",
        r"\bexcept\b",
        r"\bexcluding\b",
        r"\bwithout\b",
    ]

    for sep in separators:
        m = re.search(sep, p)
        if m:
            left = p[:m.start()].strip(" ,.")
            right = p[m.end():].strip(" ,.")
            return ([left] if left else []), ([right] if right else [])

    m = re.search(r"\bnot\b", p)
    if m:
        left = p[:m.start()].strip(" ,.")
        right = p[m.end():].strip(" ,.")
        return ([left] if left else []), ([right] if right else [])

    return ([p] if p else []), []


def _extract_table(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[Dict[str, Any]]]]:
    """
    Returns:
      table_name, headers, rows

    rows is a list of row arrays:
      {
        "text": str,
        "uid": Optional[str],
        "raw": original_cell
      }
    """
    name = _safe_str(table.get("name") or "Untitled Table")
    wells = table.get("wells")

    # Flat x/y list
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
                row.append({
                    "text": txt,
                    "uid": uid,
                    "raw": cell,
                })

            if row_has_content:
                rows.append(row)

        return name, headers, rows

    # 2D grid
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
                row.append({
                    "text": txt,
                    "uid": uid,
                    "raw": cell,
                })

            if row_has_content:
                rows.append(row)

        return name, headers, rows

    return name, ["Col1"], []


def _score_text_against_phrase(text: str, phrase: str) -> float:
    t = _norm(text)
    p = _norm(phrase)

    if not p:
        return 0.0
    if t == p:
        return 1.0
    if p in t:
        return 0.95

    ptoks = _tokenize(p)
    ttoks = set(_tokenize(t))
    if not ptoks:
        return 0.0

    overlap = sum(1 for tok in ptoks if tok in ttoks)
    return overlap / len(ptoks)


def _best_include_score(text: str, include_phrases: List[str]) -> float:
    return max((_score_text_against_phrase(text, p) for p in include_phrases), default=0.0)


def _best_exclude_score(text: str, exclude_phrases: List[str]) -> float:
    return max((_score_text_against_phrase(text, p) for p in exclude_phrases), default=0.0)


def _select_best_column(
    headers: List[str],
    rows: List[List[Dict[str, Any]]],
    include_phrases: List[str],
    exclude_phrases: List[str],
) -> Tuple[int, str, float]:
    if not rows:
        return -1, "", 0.0

    width = max((len(r) for r in rows), default=0)
    best_col = -1
    best_header = ""
    best_score = -1.0

    for col in range(width):
        header = headers[col] if col < len(headers) else f"Col{col+1}"

        header_score = _best_include_score(header, include_phrases)
        header_penalty = _best_exclude_score(header, exclude_phrases)

        value_scores: List[float] = []
        for row in rows:
            text = row[col]["text"] if col < len(row) else ""
            if not text:
                continue

            inc = _best_include_score(text, include_phrases)
            exc = _best_exclude_score(text, exclude_phrases)
            value_scores.append(max(0.0, inc - 0.9 * exc))

        top = max(value_scores, default=0.0)
        avg_top = (
            sum(sorted(value_scores, reverse=True)[: min(10, len(value_scores))]) / min(10, len(value_scores))
            if value_scores else 0.0
        )

        final_score = (0.35 * header_score) + (0.45 * top) + (0.20 * avg_top) - (0.30 * header_penalty)

        if final_score > best_score:
            best_score = final_score
            best_col = col
            best_header = header

    return best_col, best_header, max(0.0, best_score)


def _match_rows(
    rows: List[List[Dict[str, Any]]],
    best_col: int,
    include_phrases: List[str],
    exclude_phrases: List[str],
) -> List[int]:
    matched: List[int] = []

    for idx, row in enumerate(rows, start=1):
        primary_text = row[best_col]["text"] if 0 <= best_col < len(row) else ""
        inc_primary = _best_include_score(primary_text, include_phrases)
        exc_primary = _best_exclude_score(primary_text, exclude_phrases)

        row_text = " | ".join(_norm(c["text"]) for c in row if c.get("text"))
        inc_row = _best_include_score(row_text, include_phrases)
        exc_row = _best_exclude_score(row_text, exclude_phrases)

        include_score = max(inc_primary, 0.7 * inc_row)
        exclude_score = max(exc_primary, exc_row)

        if include_score >= 0.6 and exclude_score < 0.6:
            matched.append(idx)

    return matched


def _collect_selected_well_uids(
    rows: List[List[Dict[str, Any]]],
    matched_rows: List[int],
    best_col: int,
) -> List[str]:
    """
    Return the UID for the matched cell in the best column when possible.
    If that cell has no UID, fall back to the first UID found in the row.
    """
    selected: List[str] = []
    seen = set()

    for row_idx in matched_rows:
        row = rows[row_idx - 1]

        preferred_uid = None
        if 0 <= best_col < len(row):
            preferred_uid = row[best_col].get("uid")

        if preferred_uid and preferred_uid not in seen:
            selected.append(preferred_uid)
            seen.add(preferred_uid)
            continue

        for cell in row:
            uid = cell.get("uid")
            if uid and uid not in seen:
                selected.append(uid)
                seen.add(uid)
                break

    return selected


def _build_llm_rows_payload(headers: List[str], rows: List[List[Dict[str, Any]]], max_rows: int = 200) -> List[Dict[str, Any]]:
    compact_rows: List[Dict[str, Any]] = []

    for i, row in enumerate(rows[:max_rows], start=1):
        values: Dict[str, str] = {}
        row_uids: List[str] = []

        for j, cell in enumerate(row):
            text = _safe_str(cell.get("text", "")).strip()
            uid = cell.get("uid")

            if text:
                key = headers[j] if j < len(headers) else f"Col{j+1}"
                values[key] = text

            if uid:
                row_uids.append(uid)

        compact_rows.append({
            "row_index": i,
            "values": values,
            "uids": row_uids,
        })

    return compact_rows


def _llm_select_rows(
    table_name: str,
    headers: List[str],
    rows: List[List[Dict[str, Any]]],
    user_prompt: str,
) -> List[int]:
    """
    Use OpenAI to choose matching row_index values.
    Returns 1-based row indices.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return []

    compact_rows = _build_llm_rows_payload(headers, rows, max_rows=200)

    system_prompt = (
        "You are a data selection engine.\n"
        "Given a table and a user request, choose the row_index values that match.\n"
        "Rules:\n"
        "- Return JSON only\n"
        "- Output exactly this shape: {\"matched_rows\": [1,2,3]}\n"
        "- Be precise and avoid false positives\n"
        "- Respect exclusions like 'but not', 'except', 'excluding', 'without'\n"
        "- Use semantic meaning, not just keyword overlap\n"
    )

    user_message = {
        "table_name": table_name,
        "headers": headers,
        "rows": compact_rows,
        "user_request": user_prompt,
    }

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_message)},
            ],
        )

        content = (response.choices[0].message.content or "").strip()
        data = json.loads(content)

        matched_rows = data.get("matched_rows", [])
        if not isinstance(matched_rows, list):
            return []

        clean_rows: List[int] = []
        max_row = len(rows)
        for item in matched_rows:
            try:
                idx = int(item)
            except Exception:
                continue
            if 1 <= idx <= max_row:
                clean_rows.append(idx)

        # dedupe while preserving order
        seen = set()
        deduped: List[int] = []
        for idx in clean_rows:
            if idx not in seen:
                deduped.append(idx)
                seen.add(idx)

        return deduped

    except Exception:
        return []


def analyze(table_json: Dict[str, Any], user_prompt: str) -> Dict[str, Any]:
    table_name, headers, rows = _extract_table(table_json)

    if not rows:
        return {
            "status": "ok",
            "selected_well_uids": [],
            "table_name": table_name,
            "best_column": None,
            "matches": {"include_phrases": [], "exclude_phrases": []},
            "debug": {
                "matched_rows": [],
                "matched_values_by_column": {},
                "selection_method": "none",
            },
            "notes": ["No data rows found in table_json."]
        }

    include_phrases, exclude_phrases = _split_prompt(user_prompt)

    if not include_phrases:
        return {
            "status": "ok",
            "selected_well_uids": [],
            "table_name": table_name,
            "best_column": None,
            "matches": {"include_phrases": [], "exclude_phrases": exclude_phrases},
            "debug": {
                "matched_rows": [],
                "matched_values_by_column": {},
                "selection_method": "none",
            },
            "notes": ["user_prompt was empty after normalization."]
        }

    best_col, best_header, best_score = _select_best_column(
        headers=headers,
        rows=rows,
        include_phrases=include_phrases,
        exclude_phrases=exclude_phrases,
    )

    matched_rows = _llm_select_rows(
        table_name=table_name,
        headers=headers,
        rows=rows,
        user_prompt=user_prompt,
    )
    selection_method = "llm"

    if not matched_rows:
        matched_rows = _match_rows(
            rows=rows,
            best_col=best_col,
            include_phrases=include_phrases,
            exclude_phrases=exclude_phrases,
        )
        selection_method = "heuristic"

    selected_well_uids = _collect_selected_well_uids(
        rows=rows,
        matched_rows=matched_rows,
        best_col=best_col,
    )

    matched_values: List[str] = []
    if best_col >= 0:
        seen = set()
        for row_idx in matched_rows:
            txt = rows[row_idx - 1][best_col]["text"] if best_col < len(rows[row_idx - 1]) else ""
            key = _norm(txt)
            if key and key not in seen:
                matched_values.append(txt)
                seen.add(key)

    return {
        "status": "ok",
        "selected_well_uids": selected_well_uids,
        "table_name": table_name,
        "best_column": {
            "col_index": best_col,
            "header": best_header,
            "score": round(best_score, 6),
        },
        "matches": {
            "include_phrases": include_phrases,
            "exclude_phrases": exclude_phrases,
        },
        "debug": {
            "matched_rows": matched_rows,
            "matched_values_by_column": (
                {best_header: matched_values} if best_header else {}
            ),
            "selection_method": selection_method,
        },
    }


def main() -> int:
    try:
        table_json = works.param(1)
    except Exception:
        works.resolve({
            "status": "error",
            "error": "Missing param(1): table_json"
        })
        return 1

    try:
        user_prompt = works.param(2)
    except Exception:
        works.resolve({
            "status": "error",
            "error": "Missing param(2): user_prompt"
        })
        return 1

    if isinstance(table_json, str):
        try:
            table_json = json.loads(table_json)
        except Exception as e:
            works.resolve({
                "status": "error",
                "error": f"param(1) is not valid JSON: {e}"
            })
            return 1

    if not isinstance(table_json, dict):
        works.resolve({
            "status": "error",
            "error": "param(1) must be a JSON object / dict"
        })
        return 1

    user_prompt = _safe_str(user_prompt)

    try:
        result = analyze(table_json, user_prompt)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({
            "status": "error",
            "error": str(e)
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())