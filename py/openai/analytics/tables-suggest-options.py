#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — GPT Table Suggestions (multi-table, with notes-driven regeneration + operations)

Param(1): tables (array of table dicts, or single table dict, or JSON string)

Behavior:
- Accepts one or more Ion Works table objects.
- Extracts:
    - table_name
    - headers
    - row_count / column_count
    - row_header_samples (from first column if it looks like string row labels)
- GPT call #1:
    - Generates 'initial.options' and 'initial.notes' based on the tables.
- GPT call #2:
    - Uses 'initial.notes' as a prompt to regenerate 'regenerated.options'
      and 'regenerated.notes'.
- GPT call #3:
    - Uses the (regenerated OR initial) suggestions to propose executable
      "operations" for all suggestions, inspired by the generalized linker
      pattern (linker script) but generalized to analyses, visualizations, etc.

No heuristic fallback:
- If ANY OpenAI call fails or JSON is invalid → hard error.

Success Output:
{
  "status": "ok",
  "tables": [
    {
      "table_name": str,
      "headers": [str, ...],
      "row_count": int,
      "column_count": int,
      "row_header_samples": [str, ...]
    },
    ...
  ],
  "initial": {
    "options": [...],
    "notes": [...]
  },
  "regenerated": {
    "options": [...],
    "notes": [...]
  },
  "operations": [
    {
      "operation_id": str,
      "suggestion_label": str,
      "title": str,
      "type": str,
      "tables": [str, ...],
      "source_table": str | "",
      "target_table": str | "",
      "priority": int,
      "description": str,
      "steps": [str, ...],
      "ion_call": {
        "script": str,
        "params": {
          "1": str,
          "2": str,
          "3": str,
          "4": str
        }
      }
    },
    ...
  ],
  "operations_notes": [str, ...]
}

Error Output:
{ "status": "❌ error", "error": "GPT suggestions failed: <details>" }
"""

import json
import os
from typing import Any, Dict, List, Tuple

from ion import works  # type: ignore

# --------------------- helpers ---------------------


def _safe_str(v: Any) -> str:
    return str(v) if v is not None else ""


def _cell_value(cell: Any) -> str:
    """
    Extract a human-friendly value from a table cell.
    Mirrors behavior from your reference selector/linker scripts.
    """
    if isinstance(cell, dict):
        # Common value-like keys
        for k in ("value", "name", "position", "label", "title"):
            val = cell.get(k)
            if val not in (None, ""):
                return str(val).strip()
        # Nested properties
        props = cell.get("properties") if isinstance(cell.get("properties"), dict) else None
        if props:
            for k in ("header", "title", "label"):
                val = props.get(k)
                if val not in (None, ""):
                    return str(val).strip()
        return ""
    return str(cell).strip()


# --------------------- table extraction ---------------------


def _headers_rows_raw(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[str]]]:
    """
    Given a single Ion Works table dict, return:
      - table name
      - headers (list of strings)
      - rows (2D list of strings; excluding header row)
    Supports both:
      - flat grid wells (list of dicts with x,y)
      - 2-D wells array (wells[x][y])
    """
    name = _safe_str(table.get("name") or "Untitled Table")
    wells = table.get("wells")

    # Flat grid
    if isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]:
        try:
            width = int(table.get("cols") or max(int(c.get("x", -1)) for c in wells) + 1)
        except Exception:
            width = 1
        by_xy: Dict[Tuple[int, int], Any] = {}
        max_y = 0
        for c in wells:
            try:
                x = int(c.get("x", -1))
                y = int(c.get("y", -1))
            except Exception:
                continue
            if x < 0 or y < 0:
                continue
            by_xy[(x, y)] = c
            if y > max_y:
                max_y = y

        headers: List[str] = []
        for x in range(width):
            cell = by_xy.get((x, 0))
            headers.append(_cell_value(cell) if cell is not None else f"Col{x+1}")

        rows: List[List[str]] = []
        for y in range(1, max_y + 1):
            row_vals: List[str] = []
            for x in range(width):
                cell = by_xy.get((x, y))
                row_vals.append(_cell_value(cell) if cell is not None else "")
            if any(v.strip() for v in row_vals):
                rows.append(row_vals)

        if not any(h.strip() for h in headers):
            headers = [f"Col{i+1}" for i in range(width)]

        return name, headers, rows

    # 2-D wells array
    if isinstance(wells, list) and wells and isinstance(wells[0], list):
        width = len(wells)
        height = max((len(col) for col in wells if isinstance(col, list)), default=0)
        if width <= 0 or height <= 0:
            return name, ["Col1"], []

        headers: List[str] = []
        for x in range(width):
            top = wells[x][0] if x < len(wells) and len(wells[x]) > 0 else None
            headers.append(_cell_value(top) if top is not None else f"Col{x+1}")

        rows: List[List[str]] = []
        for y in range(1, height):
            row_vals: List[str] = []
            for x in range(width):
                cell = wells[x][y] if (x < len(wells) and y < len(wells[x])) else None
                row_vals.append(_cell_value(cell))
            if any(v.strip() for v in row_vals):
                rows.append(row_vals)

        if not any(h.strip() for h in headers):
            headers = [f"Col{i+1}" for i in range(width)]

        return name, headers, rows

    # Fallback empty
    return name, ["Col1"], []


def _summarize_tables(tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build a compact metadata summary for each table, including row header samples
    from the first column if it looks like string-like row labels.
    """
    summaries: List[Dict[str, Any]] = []

    for table in tables:
        name, headers, rows = _headers_rows_raw(table)
        col_count = len(headers)
        row_count = len(rows)

        row_header_samples: List[str] = []
        if col_count > 0 and row_count > 0:
            # Take up to N unique non-empty values from the first column as row headers.
            max_samples = 20
            seen = set()
            for r in rows:
                if not r:
                    continue
                v = _safe_str(r[0]).strip()
                if not v:
                    continue
                if v not in seen:
                    seen.add(v)
                    row_header_samples.append(v)
                if len(row_header_samples) >= max_samples:
                    break

        summaries.append({
            "table_name": name,
            "headers": headers,
            "row_count": row_count,
            "column_count": col_count,
            "row_header_samples": row_header_samples,
        })

    return summaries


# --------------------- GPT helpers ---------------------


def _extract_json_blob(s: str) -> Dict[str, Any]:
    """
    Try to recover a JSON object from a possibly-noisy string.
    """
    s = (s or "").strip()
    try:
        return json.loads(s)
    except Exception:
        start = s.find("{")
        while start != -1:
            depth = 0
            for i in range(start, len(s)):
                ch = s[i]
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        cand = s[start:i + 1]
                        try:
                            return json.loads(cand)
                        except Exception:
                            break
            start = s.find("{", start + 1)
        return {}


def _ensure_api_key():
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set")


# --------------------- GPT call #1: suggestions from tables ---------------------


def _call_chatgpt_suggestions_from_tables(
    table_summaries: List[Dict[str, Any]],
    model: str = "gpt-4o-mini",
) -> Dict[str, Any]:
    """
    Use GPT to propose a list of options/suggestions for what you can do
    with the given tables (based on table names, column names, and row headers).
    """
    _ensure_api_key()

    user_payload = {
        "tables": table_summaries
    }

    system = (
        "You are a data and experiment design assistant.\n"
        "You will receive metadata for one or more tables, including:\n"
        "- table_name\n"
        "- headers (column names)\n"
        "- row_header_samples (first-column labels if present)\n"
        "- row_count / column_count\n\n"
        "Based on this information, propose high-value options for what a user\n"
        "could do with these tables: analyses, visualizations, QC checks,\n"
        "summary reports, joins between tables, plate layout checks, etc.\n\n"
        "Think about the domain implied by the names (e.g., wells, samples,\n"
        "targets, dose, timepoint, revenue, costs, KPIs, etc.) and make\n"
        "useful, concrete suggestions.\n\n"
        "Return STRICT JSON with the schema:\n"
        "{\n"
        "  \"options\": [\n"
        "    {\n"
        "      \"label\": \"Short user-facing title\",\n"
        "      \"description\": \"What this option does and why it's useful\",\n"
        "      \"tables\": [\"table_name1\", \"table_name2\", ...],\n"
        "      \"priority\": 1  # 1 (highest) to 5 (lowest)\n"
        "    }\n"
        "  ],\n"
        "  \"notes\": [\"optional high-level notes or assumptions\"]\n"
        "}\n"
        "If you are unsure about specific domain details, keep suggestions\n"
        "generic but still actionable. Always return at least 3 options\n"
        "if there is at least one non-empty table."
    )

    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI()

        # Try Responses API first
        try:
            try:
                r = client.responses.create(
                    model=model,
                    temperature=0.0,
                    response_format={"type": "json_object"},
                    input=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                    ],
                )
            except TypeError:
                # Older client without response_format
                r = client.responses.create(
                    model=model,
                    temperature=0.0,
                    input=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                    ],
                )

            raw = getattr(r, "output_text", "") or ""
            data = _extract_json_blob(raw)
            if not isinstance(data, dict) or "options" not in data:
                raise RuntimeError("Responses API invalid JSON or missing 'options'.")
            return data

        except Exception as e_responses:
            # Fallback to Chat Completions
            try:
                resp = client.chat.completions.create(
                    model=model,
                    temperature=0.0,
                    messages=[
                        {
                            "role": "system",
                            "content": system + " Respond ONLY with valid JSON per the schema.",
                        },
                        {
                            "role": "user",
                            "content": json.dumps(user_payload, ensure_ascii=False),
                        },
                    ],
                )
                raw = (resp.choices[0].message.content or "").strip()
                data = _extract_json_blob(raw)
                if not isinstance(data, dict) or "options" not in data:
                    raise RuntimeError("Chat Completions invalid JSON or missing 'options'.")
                return data
            except Exception as e_chat:
                raise RuntimeError(f"OpenAI Responses+Chat failed: {e_responses}; {e_chat}")

    except Exception as e:
        raise RuntimeError(f"OpenAI call failed: {e}")


# --------------------- GPT call #2: suggestions from notes ---------------------


def _call_chatgpt_suggestions_from_notes(
    table_summaries: List[Dict[str, Any]],
    notes: List[str],
    model: str = "gpt-4o-mini",
) -> Dict[str, Any]:
    """
    Second GPT pass: Use the prior 'notes' as the main prompt
    to regenerate another set of options.
    """
    _ensure_api_key()

    user_payload = {
        "tables": table_summaries,
        "notes": notes,
    }

    system = (
        "You are a data and experiment design assistant.\n"
        "You will receive metadata for one or more tables AND a list of 'notes'\n"
        "that describe what these tables represent, assumptions, cautions,\n"
        "or observations from a previous analysis.\n\n"
        "Use these notes as the primary prompt to propose refined or additional\n"
        "high-value options for what a user could do with the tables. You can:\n"
        "- Specialize, focus, or extend the original notes.\n"
        "- Propose follow-on analyses that explicitly assume the notes are correct.\n"
        "- Suggest QC checks or consistency checks implied by the notes.\n"
        "- Propose joins between tables if the notes hint at relationships.\n\n"
        "Return STRICT JSON with the schema:\n"
        "{\n"
        "  \"options\": [\n"
        "    {\n"
        "      \"label\": \"Short user-facing title\",\n"
        "      \"description\": \"What this option does and why it's useful\",\n"
        "      \"tables\": [\"table_name1\", \"table_name2\", ...],\n"
        "      \"priority\": 1  # 1 (highest) to 5 (lowest)\n"
        "    }\n"
        "  ],\n"
        "  \"notes\": [\"optional updated notes or assumptions\"]\n"
        "}\n"
        "Treat the provided notes as if they were the user's own description,\n"
        "e.g. \"The 'layout' table appears to represent a sample plate layout, while\n"
        "the 'ribogreen' table contains measurement data for various wells.\",\n"
        "\"Ensure that the data types in the tables are consistent for any analyses or joins.\"\n"
        "Always return at least 3 options if there is at least one non-empty table."
    )

    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI()

        # Try Responses API first
        try:
            try:
                r = client.responses.create(
                    model=model,
                    temperature=0.0,
                    response_format={"type": "json_object"},
                    input=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                    ],
                )
            except TypeError:
                r = client.responses.create(
                    model=model,
                    temperature=0.0,
                    input=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                    ],
                )

            raw = getattr(r, "output_text", "") or ""
            data = _extract_json_blob(raw)
            if not isinstance(data, dict) or "options" not in data:
                raise RuntimeError("Responses API invalid JSON or missing 'options'.")
            return data

        except Exception as e_responses:
            # Fallback to Chat Completions
            try:
                resp = client.chat.completions.create(
                    model=model,
                    temperature=0.0,
                    messages=[
                        {
                            "role": "system",
                            "content": system + " Respond ONLY with valid JSON per the schema.",
                        },
                        {
                            "role": "user",
                            "content": json.dumps(user_payload, ensure_ascii=False),
                        },
                    ],
                )
                raw = (resp.choices[0].message.content or "").strip()
                data = _extract_json_blob(raw)
                if not isinstance(data, dict) or "options" not in data:
                    raise RuntimeError("Chat Completions invalid JSON or missing 'options'.")
                return data
            except Exception as e_chat:
                raise RuntimeError(f"OpenAI Responses+Chat failed: {e_responses}; {e_chat}")

    except Exception as e:
        raise RuntimeError(f"OpenAI call failed: {e}")


# --------------------- GPT call #3: operations for suggestions ---------------------


def _call_chatgpt_operations_for_suggestions(
    table_summaries: List[Dict[str, Any]],
    suggestions: List[Dict[str, Any]],
    model: str = "gpt-4o-mini",
) -> Dict[str, Any]:
    """
    Third GPT pass: use the suggestions to design executable operations.

    Inspired by the generalized linker script:
    - Some operations may be 'link_tables' style, where a 'linker' script is called
      with source_table / target_table.
    - Others may be analyses, visualizations, QC checks, etc.

    Schema:
    {
      "operations": [
        {
          "operation_id": "snake_case_identifier",
          "suggestion_label": "label of the originating suggestion",
          "title": "Short user-facing title",
          "type": "link_tables" | "analysis" | "visualization" | "qc_check" | "report" | "transform",
          "tables": ["table_name1", "table_name2", ...],
          "source_table": "optional (for link-style ops)",
          "target_table": "optional (for link-style ops)",
          "priority": 1,
          "description": "What this operation does and why it's useful",
          "steps": ["High-level step 1", "High-level step 2", ...],
          "ion_call": {
            "script": "linker" | "other_script_name_or_empty",
            "params": {
              "1": "value for param(1) in Ion",
              "2": "value for param(2)",
              "3": "value for param(3) (e.g. 'current_model_json')",
              "4": "value for param(4) (e.g. 'gpt-4o-mini')"
            }
          }
        }
      ],
      "notes": ["optional high-level notes about how to execute operations"]
    }
    """
    _ensure_api_key()

    user_payload = {
        "tables": table_summaries,
        "suggestions": suggestions,
    }

    system = (
        "You are an operation planner for an AssignLang/ION workflow.\n"
        "You receive:\n"
        "  - Metadata for tables (name, headers, row_header_samples, sizes),\n"
        "  - A list of high-level suggestions (label, description, tables, priority).\n\n"
        "Your job is to convert EACH suggestion into one or more executable 'operations'.\n"
        "Use the following guidelines:\n"
        "- If a suggestion clearly links two tables (e.g., layout vs measurements),\n"
        "  produce an operation of type 'link_tables' inspired by a generalized linker\n"
        "  script that takes (source_table, target_table, base_json_in, model_id) in Ion.\n"
        "- Other suggestions can be 'analysis', 'visualization', 'qc_check', 'report',\n"
        "  or 'transform' operations.\n"
        "- Prefer snake_case operation_id values.\n"
        "- The 'ion_call' block should describe how to call a script from Ion, e.g.:\n"
        "     'script': 'linker',\n"
        "     'params': { '1': 'layout', '2': 'ribogreen', '3': 'current_model_json', '4': 'gpt-4o-mini' }\n"
        "  If no direct Ion call is obvious, set 'script' to \"\" and params to an empty object.\n"
        "- Use the 'tables' field to list all relevant tables for the operation.\n"
        "- For 'link_tables' operations, also fill 'source_table' and 'target_table'.\n"
        "- 'priority' should generally mirror the originating suggestion's priority.\n"
        "- 'steps' should be short, concrete, and ordered.\n\n"
        "Return STRICT JSON with the schema:\n"
        "{\n"
        "  \"operations\": [ { ... as documented above ... } ],\n"
        "  \"notes\": [\"optional high-level notes about how to execute operations\"]\n"
        "}\n"
        "Always create at least one operation per suggestion."
    )

    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI()

        # Try Responses API first
        try:
            try:
                r = client.responses.create(
                    model=model,
                    temperature=0.0,
                    response_format={"type": "json_object"},
                    input=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                    ],
                )
            except TypeError:
                r = client.responses.create(
                    model=model,
                    temperature=0.0,
                    input=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
                    ],
                )

            raw = getattr(r, "output_text", "") or ""
            data = _extract_json_blob(raw)
            if not isinstance(data, dict) or "operations" not in data:
                raise RuntimeError("Responses API invalid JSON or missing 'operations'.")
            return data

        except Exception as e_responses:
            # Fallback to Chat Completions
            try:
                resp = client.chat.completions.create(
                    model=model,
                    temperature=0.0,
                    messages=[
                        {
                            "role": "system",
                            "content": system + " Respond ONLY with valid JSON per the schema.",
                        },
                        {
                            "role": "user",
                            "content": json.dumps(user_payload, ensure_ascii=False),
                        },
                    ],
                )
                raw = (resp.choices[0].message.content or "").strip()
                data = _extract_json_blob(raw)
                if not isinstance(data, dict) or "operations" not in data:
                    raise RuntimeError("Chat Completions invalid JSON or missing 'operations'.")
                return data
            except Exception as e_chat:
                raise RuntimeError(f"OpenAI Responses+Chat failed: {e_responses}; {e_chat}")

    except Exception as e:
        raise RuntimeError(f"OpenAI call failed: {e}")


# --------------------- orchestrator ---------------------


def analyze_tables(tables_param: Any) -> Dict[str, Any]:
    """
    Main analysis function:
      - normalize param → list of tables,
      - summarize,
      - GPT #1: suggestions from tables,
      - GPT #2: suggestions from notes,
      - GPT #3: operations from (regenerated OR initial) suggestions,
      - combine into final JSON result.
    """
    # Normalize input into a list of table dicts
    if isinstance(tables_param, str):
        try:
            parsed = json.loads(tables_param)
        except Exception as e:
            raise RuntimeError(f"Param 1 JSON parse error: {e}")
    else:
        parsed = tables_param

    if isinstance(parsed, dict):
        tables = [parsed]
    elif isinstance(parsed, list):
        tables = [t for t in parsed if isinstance(t, dict)]
    else:
        raise RuntimeError("Param 1 must be a table dict, an array of table dicts, or a JSON string representing them.")

    if not tables:
        return {
            "status": "ok",
            "tables": [],
            "initial": {"options": [], "notes": ["No tables provided; no suggestions generated."]},
            "regenerated": {"options": [], "notes": []},
            "operations": [],
            "operations_notes": ["No suggestions; no operations generated."],
        }

    summaries = _summarize_tables(tables)

    # GPT #1: from tables → options + notes
    initial = _call_chatgpt_suggestions_from_tables(summaries)
    initial_options = initial.get("options", [])
    initial_notes = list(map(_safe_str, initial.get("notes") or []))

    # GPT #2: from notes → regenerated options + notes
    regenerated = _call_chatgpt_suggestions_from_notes(summaries, initial_notes)
    regenerated_options = regenerated.get("options", [])
    regenerated_notes = list(map(_safe_str, regenerated.get("notes") or []))

    # Decide which suggestions to feed into the operations planner:
    suggestions_for_ops = regenerated_options if regenerated_options else initial_options

    # GPT #3: from suggestions → operations
    ops = _call_chatgpt_operations_for_suggestions(summaries, suggestions_for_ops)
    operations = ops.get("operations", [])
    operations_notes = list(map(_safe_str, ops.get("notes") or []))

    return {
        "status": "ok",
        "tables": summaries,
        "initial": {
            "options": initial_options,
            "notes": initial_notes,
        },
        "regenerated": {
            "options": regenerated_options,
            "notes": regenerated_notes,
        },
        "operations": operations,
        "operations_notes": operations_notes,
    }


# --------------------- entry ---------------------


def main() -> int:
    try:
        tables_param = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter: tables (1) required."})
        return 1

    try:
        result = analyze_tables(tables_param)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": f"GPT suggestions failed: {e}"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
