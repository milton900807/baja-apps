#!/usr/bin/env python3
"""
Fill missing well values (value is empty/None AND well-level formula is empty/None)
using ChatGPT, leveraging per-well `group` annotation keys along with table name and
other known values in the table.

Indexing model (IMPORTANT, 0-based):
- wells[row][col]
- row 0 = label/header row
- row 1 = value row
- first cell in the table is [row=0][col=0]  => in your range-notation: [0:0][0:0]

- Input: array of plate objects (passed directly, as JSON string, or as file path).
- Output via Ion:
    works.resolve({
      "ok": True,
      "out": <updated plates>,
      "original": <original plates>,
      "suggestions": <LLM suggestions array>,
      "missing_items": <items we asked the LLM to fill>
    })

Env:
  OPENAI_API_KEY must be set to call the LLM. If not set, the script returns the original unchanged.
"""

from __future__ import annotations
import os, sys, json, traceback
from typing import Any, Dict, List, Tuple
from copy import deepcopy
from string import Template

# ---------- Optional Ion integration ----------
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:
    _HAS_ION = False

# ---------- OpenAI ----------
try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore


# ---------------- IO ----------------
def load_json_like(x: Any) -> Any:
    """
    Accepts:
      - already-parsed list/dict -> return as-is
      - JSON string -> json.loads
      - file path -> read and json.load
    """
    if isinstance(x, (list, dict)):
        return x
    if isinstance(x, (bytes, bytearray)):
        x = x.decode("utf-8", errors="ignore")
    if isinstance(x, str):
        s = x.strip()
        if os.path.exists(s):
            with open(s, "r", encoding="utf-8") as f:
                return json.load(f)
        try:
            return json.loads(s)
        except Exception:
            pass
    raise TypeError(f"Unable to interpret input as JSON or path: {type(x).__name__}")


# ---------------- Helpers for 2-row plates (0-based) ----------------
def _is_missing_value(v: Any) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")

def _is_empty_formula(cell: Dict[str, Any]) -> bool:
    f = cell.get("formula", None)
    return f is None or (isinstance(f, str) and f.strip() == "")

def _cell_empty_value_and_formula(cell: Dict[str, Any] | None) -> bool:
    if not cell:
        return True
    return _is_missing_value(cell.get("value")) and _is_empty_formula(cell)

def _get_rows(plate: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    wells = plate.get("wells") or []
    row0 = wells[0] if len(wells) > 0 else []
    row1 = wells[1] if len(wells) > 1 else []
    return row0, row1

def _get_label_from_row0(row0: List[Dict[str, Any]], col: int) -> str | None:
    if col < 0 or col >= len(row0) or not row0[col]:
        return None
    lab = row0[col].get("value")
    if isinstance(lab, str) and lab.strip() and lab.strip().lower() != "label":
        return lab
    return None

def _get_group_keys(cell: Dict[str, Any] | None) -> List[str]:
    if not cell:
        return []
    g = cell.get("group")
    if not isinstance(g, dict):
        return []
    return list(g.keys())

def _collect_known_rows_with_annotations(plate: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Returns:
      {"label": <str or None>, "value": <Any>, "annotations": [<str>], "col": <int>}
    Only includes columns where the value (row=1) is NOT missing (context for the LLM).
    """
    row0, row1 = _get_rows(plate)
    n = max(len(row0), len(row1))
    rows: List[Dict[str, Any]] = []
    for col in range(n):
        val_cell = row1[col] if col < len(row1) and row1[col] else None
        val = val_cell.get("value") if val_cell else None
        if _is_missing_value(val):
            continue
        label = _get_label_from_row0(row0, col)
        annotations = _get_group_keys(val_cell)
        rows.append({"label": label, "value": val, "annotations": annotations, "col": col})
    return rows

def _find_missing_items(plate: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Identify missing items at 0-based columns where:
      - value (row=1) is None/"" AND
      - well-level formula (row=1) is None/""
    For each item: table name, column index, best-available label (row=0), and group annotation keys.
    """
    row0, row1 = _get_rows(plate)
    n = max(len(row0), len(row1))
    items: List[Dict[str, Any]] = []
    for col in range(n):
        val_cell = row1[col] if col < len(row1) and row1[col] else None
        if val_cell is None:
            label = _get_label_from_row0(row0, col)
            items.append({
                "table": plate.get("name", ""),
                "col": col,
                "label": label,
                "annotations": []
            })
            continue

        if _is_missing_value(val_cell.get("value")) and _is_empty_formula(val_cell):
            label = _get_label_from_row0(row0, col)
            ann = _get_group_keys(val_cell)
            items.append({
                "table": plate.get("name", ""),
                "col": col,
                "label": label,
                "annotations": ann
            })
    return items


# ---------------- Coercion ----------------
def _to_number_if_numeric_else_keep(v: Any) -> Any:
    try:
        if isinstance(v, bool):
            return v
        f = float(v)
        if abs(f - round(f)) < 1e-9:
            return int(round(f))
        return f
    except Exception:
        return v


# ---------------- Prompt ----------------
SYSTEM_PROMPT = """You are a lab finance modeling assistant.

You will be given:
- A list of missing value cells. Each includes the table name, a 0-based column index (`col`),
  the best-known label from row 0 (if any), and annotation keys from the cell's `group` object.
- For context, known (non-missing) rows per table, each with label (row 0), value (row 1),
  annotation keys, and the 0-based column index.

Your task:
- For EACH missing item, propose a reasonable value (NUMBER or STRING) for that table+column.
- Use the table name, any provided label, the `group` annotation keys, and the other known rows in the table.
- If units are implied by annotations/labels (e.g., *_Cost, *_Per_Month), infer a reasonable scale.
- Keep the rationale to one or two sentences.
- Do not invent values for columns that were not included as missing.

Output STRICT JSON with ONLY the following top-level object:
{
  "suggested_values": [
    {
      "table": "<table name>",
      "col": <integer>,                  // 0-based column index
      "value": <number or "string">,
      "rationale": "<one or two sentences>"
    }
  ]
}
"""

USER_TEMPLATE = Template("""MISSING VALUE CELLS (0-based columns):
$MISSING

CONTEXT (per table, known rows: label (row0), value (row1), annotations, col [0-based]):
$CONTEXT

Return JSON EXACTLY:
{
  "suggested_values": [
    {
      "table": "<table name>",
      "col": <integer>,
      "value": <number or "string">,
      "rationale": "<one or two sentences>"
    }
  ]
}
""")

def build_user_message(plates: List[Dict[str, Any]]) -> tuple[str, List[Dict[str, Any]]]:
    missing_items: List[Dict[str, Any]] = []
    context: Dict[str, Any] = {}

    for plate in plates:
        name = plate.get("name", "")
        if not name:
            continue

        todo = _find_missing_items(plate)
        if todo:
            todo = [t for t in todo if t.get("table")]
            missing_items.extend(todo)

        ctx_rows = _collect_known_rows_with_annotations(plate)
        if ctx_rows:
            context[name] = {"name": name, "rows": ctx_rows}

    user_msg = USER_TEMPLATE.safe_substitute(
        MISSING=json.dumps(missing_items, indent=2),
        CONTEXT=json.dumps(context, indent=2),
    )
    return user_msg, missing_items


# ---------------- OpenAI call ----------------
def ask_openai(user_message: str, model: str = "gpt-4o-mini") -> Dict[str, Any]:
    if OpenAI is None or not os.getenv("OPENAI_API_KEY"):
        return {"suggested_values": []}
    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
    )
    content = resp.choices[0].message.content or "{}"
    try:
        return json.loads(content)
    except Exception:
        return {"suggested_values": []}


# ---------------- Apply suggestions (0-based row/col) ----------------
def _ensure_row_cell(wells: List[List[Dict[str, Any]]], row_index: int, col: int) -> Dict[str, Any]:
    """Ensure wells[row_index][col] exists; create minimal stub if needed, using 0-based naming."""
    while len(wells) <= row_index:
        wells.append([])
    row = wells[row_index]
    while len(row) <= col:
        r = row_index
        c = len(row)  # next column index (0-based)
        row.append({"name": f"cell_{r}_{c}", "value": ""})
    return row[col]

def apply_suggestions(
    plates_original: List[Dict[str, Any]],
    missing_indexed: List[Dict[str, Any]],
    llm_result: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Apply LLM suggestions into value row (row=1) at the same 0-based column as the missing cell.
    Matching is by (table, col). Returns (updated_plates, suggested_values).
    """
    plates = deepcopy(plates_original)

    want: Dict[tuple[str, int], bool] = {}
    for m in missing_indexed:
        t = m.get("table", "")
        c = int(m.get("col", -1))
        if t and c >= 0:
            want[(t, c)] = True

    name_to_plate = {p.get("name", ""): p for p in plates}
    suggestions: List[Dict[str, Any]] = llm_result.get("suggested_values", []) or []

    for s in suggestions:
        table = s.get("table", "")
        col = s.get("col", None)
        if not table or not isinstance(col, int):
            continue
        if (table, col) not in want:
            continue

        plate = name_to_plate.get(table)
        if not plate:
            continue

        wells = plate.setdefault("wells", [])
        _ensure_row_cell(wells, 0, col)  # label row
        val_cell = _ensure_row_cell(wells, 1, col)  # value row

        if (not _is_missing_value(val_cell.get("value"))) or (not _is_empty_formula(val_cell)):
            continue

        val_cell["value"] = _to_number_if_numeric_else_keep(s.get("value"))
        if "formula" not in val_cell:
            val_cell["formula"] = None

    return plates, suggestions


# ---------------- Cleanup: remove empty columns/rows ----------------
def _cleanup_plate(plate: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove columns where every value-row (row >= 1) cell is empty (value+formula).
    Then remove any value-rows that are entirely empty. Keep header row if any column remains.
    Drop header row only if no columns remain and header row itself is empty.
    """
    wells: List[List[Dict[str, Any]]] = plate.get("wells") or []
    if not wells:
        plate["wells"] = []
        return plate

    # Determine columns to keep by inspecting value rows only (row >= 1)
    max_cols = max((len(r) for r in wells), default=0)
    cols_to_keep: List[int] = []
    for c in range(max_cols):
        col_empty = True
        for r in range(1, len(wells)):  # ignore header row (r=0) for emptiness
            cell = wells[r][c] if c < len(wells[r]) else None
            if not _cell_empty_value_and_formula(cell):
                col_empty = False
                break
        if not col_empty:
            cols_to_keep.append(c)

    # Rebuild rows with kept columns; pad missing cells with explicit empties to preserve alignment
    new_wells: List[List[Dict[str, Any]]] = []
    for r, row in enumerate(wells):
        new_row: List[Dict[str, Any]] = []
        for new_idx, c in enumerate(cols_to_keep):
            if c < len(row) and row[c] is not None:
                new_row.append(row[c])
            else:
                new_row.append({"name": f"cell_{r}_{new_idx}", "value": "", "formula": None})
        new_wells.append(new_row)

    # Remove value rows that are entirely empty (all cells empty value+formula)
    final_wells: List[List[Dict[str, Any]]] = []
    for r, row in enumerate(new_wells):
        if r == 0:
            # Keep header row if any columns remain; assess later if none remain
            final_wells.append(row)
            continue
        if any(not _cell_empty_value_and_formula(cell) for cell in row):
            final_wells.append(row)

    # If only header row remains, and it's itself empty, drop it too
    if len(final_wells) == 1:
        header = final_wells[0]
        if not header or all(_cell_empty_value_and_formula(cell) for cell in header):
            final_wells = []

    plate["wells"] = final_wells
    return plate

def cleanup_all_plates(plates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [_cleanup_plate(deepcopy(p)) for p in plates]


# ---------------- Main (Ion + CLI friendly) ----------------
def main_ion() -> int:
    try:
        plates_param = works.param(1)  # list, json string, or file path
        original = load_json_like(plates_param)
        if not isinstance(original, list):
            raise TypeError("Top-level JSON must be a list of plate objects.")

        user_msg, missing_items = build_user_message(original)

        if not missing_items:
            cleaned = cleanup_all_plates(original)
            works.resolve({
                "ok": True,
                "message": "No value cells missing both value and formula.",
                "out": cleaned,
                "original": original,
                "suggestions": [],
                "missing_items": []
            })
            return 0

        llm_json = ask_openai(user_msg, os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
        updated, suggestions = apply_suggestions(original, missing_items, llm_json)
        cleaned = cleanup_all_plates(updated)

        works.resolve({
            "ok": True,
            "out": cleaned,
            "original": original,
            "suggestions": suggestions,
            "missing_items": missing_items
        })
        return 0
    except Exception as e:
        works.resolve({"ok": False, "error": str(e), "trace": traceback.format_exc()})
        return 1


def main_cli(argv: List[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="Fill missing values via ChatGPT using `group` annotation keys (0-based indexing), then prune empty rows/cols.")
    ap.add_argument("--plates", required=True, help="Path to plates.json, a JSON string, or '-' for stdin.")
    ap.add_argument("--out", help="Write updated plates to this path. If omitted, prints to stdout.")
    ap.add_argument("--show-original", action="store_true", help="Also print original JSON (for debugging).")
    ap.add_argument("--model", default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    args = ap.parse_args(argv)

    src = sys.stdin.read() if args.plates == "-" else args.plates
    original = load_json_like(src)
    if not isinstance(original, list):
        raise SystemExit("Top-level JSON must be a list of plate objects.")

    user_msg, missing_items = build_user_message(original)

    if not missing_items:
        updated = deepcopy(original)
        suggestions = []
    else:
        llm_json = ask_openai(user_msg, args.model)
        updated, suggestions = apply_suggestions(original, missing_items, llm_json)

    cleaned = cleanup_all_plates(updated)

    payload = {
        "ok": True,
        "out": cleaned,
        "original": original,
        "suggestions": suggestions,
        "missing_items": missing_items
    }

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(cleaned, f, indent=2, ensure_ascii=False)
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(payload, indent=2, ensure_ascii=False))

    if args.show_original and args.out:
        print("\n--- ORIGINAL ---\n", json.dumps(original, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    if _HAS_ION:
        sys.exit(main_ion())
    else:
        if not os.getenv("OPENAI_API_KEY"):
            print("WARNING: OPENAI_API_KEY not set; no LLM suggestions will be generated.", file=sys.stderr)
        sys.exit(main_cli(sys.argv[1:]))
