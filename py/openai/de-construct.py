#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Universal Variable Breakdown Table Builder (GPT-assisted, Ion-friendly)

CHANGELOG:
  - Always includes "Label" and "Value" header row explicitly at top (y=0).
  - Returns ONLY the newly created table, not the originals.

Goal:
  Given ANY variable name (param(2)), ask ChatGPT to propose a simple breakdown table
  with sensible row labels and DEFAULT values. If some rows clearly correspond to existing
  scalar labels in your dataset, the model may include a mapped_ref ("Table[Label]").
  Otherwise, we store the default value directly.

Ion Works:
  param(1): JSON text/object of dataset                      (required)
  param(2): variable name string, e.g., "Revenue"            (required)
  param(3): optional flags (comma-separated):
            - "force-zero"           -> ignore model defaults and write 0s
            - "append-only"          -> if <Var>_Breakdown exists, create <Var>_Breakdown_2, etc.
            - "no-map"               -> do not allow GPT to map to dataset refs (always literals)
  param(4): model id (default "gpt-4o-mini")
  param(5): temperature float (default 0.2)
  param(6): max_rows int cap for model rows (default 10)

Output:
  ONLY the new table, wrapped in the same envelope shape as input:
    - if input was a single table object -> return the single new table object
    - if input was {"tables":[...]}      -> return {"tables":[ new_table ]}
    - if input was a list of tables      -> return [ new_table ]

Table shape (wells-style, 2 columns):
  Col0: "Label" (identifier-like row labels)
  Col1: "Value" (either a literal default or "Table[Label]" string if mapped)
"""

import json
import re
import sys
from typing import Any, Dict, List, Tuple, Optional

# ---- Ion Works (optional) ----
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:
    class _Dummy:
        @staticmethod
        def msg(*a, **k): pass
        @staticmethod
        def resolve(*a, **k):
            print(json.dumps(a[0] if a else {}, indent=2))
        @staticmethod
        def param(*a, **k): raise RuntimeError("Ion not available")
    works = _Dummy()
    _HAS_ION = False

# ---- OpenAI client ----
import os
from openai import OpenAI

IDENT_LABEL = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# ----------------- dataset helpers -----------------
def normalize_root(obj: Any) -> Tuple[List[dict], str]:
    """Normalize input into list[tables]; return (tables, shape) where shape is 'single', 'list', or 'wrapped'."""
    if isinstance(obj, dict) and "wells" in obj and "name" in obj:
        return [obj], "single"
    if isinstance(obj, dict) and "tables" in obj and isinstance(obj["tables"], list):
        return [t for t in obj["tables"] if isinstance(t, dict)], "wrapped"
    if isinstance(obj, list):
        return [t for t in obj if isinstance(t, dict)], "list"
    raise RuntimeError("Input must be a table, a list of tables, or {'tables': [...]}")

def package_new_only(new_tables: List[dict], shape: str) -> Any:
    """
    Return ONLY the new tables, matching the input envelope shape.
    - 'single'  -> single table object (first new table)
    - 'wrapped' -> {"tables":[ ...new tables... ]}
    - 'list'    -> [ ...new tables... ]
    """
    if shape == "single":
        return new_tables[0] if new_tables else {}
    if shape == "wrapped":
        return {"tables": new_tables}
    return new_tables  # 'list'

def wells_to_label_value_maps(table_obj: dict) -> Tuple[Dict[int, str], Dict[int, Any]]:
    labels_by_y, values_by_y = {}, {}
    for w in table_obj.get("wells", []):
        x, y, val = w.get("x"), w.get("y"), w.get("value")
        if isinstance(y, int) and y >= 0:
            if x == 0 and isinstance(val, str):
                labels_by_y[y] = val.strip()
            elif x == 1:
                values_by_y[y] = val
    return labels_by_y, values_by_y

def inventory_scalar_catalog(tables: List[dict]) -> Dict[str, Any]:
    """Build a compact catalog of identifier-like labels per table with a few example values."""
    cat: Dict[str, Any] = {"tables": []}
    for t in tables:
        name = (t.get("name") or "").strip()
        lbl_by_y, val_by_y = wells_to_label_value_maps(t)
        scalars = []
        examples = []
        for y, lab in lbl_by_y.items():
            if IDENT_LABEL.match(lab):
                scalars.append(lab)
                if len(examples) < 6 and y in val_by_y:
                    examples.append({"label": lab, "value": val_by_y.get(y)})
        cat["tables"].append({
            "name": name,
            "scalar_labels": sorted(set(scalars)),
            "examples": examples
        })
    return cat

def next_unique_name(existing: List[str], base: str) -> str:
    if base not in existing:
        return base
    i = 2
    while f"{base}_{i}" in existing:
        i += 1
    return f"{base}_{i}"

def sanitize_ident(s: str, fallback: str = "Item") -> str:
    s2 = re.sub(r"\W+", "_", (s or "").strip())
    if not IDENT_LABEL.match(s2):
        s2 = f"{fallback}"
    return s2

# ----------------- GPT scaffold -----------------
SYSTEM = """You are a careful data modeling assistant.
You must produce compact, valid JSON describing a small breakdown table for an arbitrary variable.
Keep labels identifier-like (A_Z a_z 0_9 and underscores), short, and unambiguous.
If a semantically close dataset field exists in the provided catalog, you MAY add a mapped_ref in the form "Table[Label]".
Otherwise provide a sensible default value (numeric or short string).
Avoid proprietary or private content; do not invent references outside the catalog.
Do not include any functions, formulas, or code—defaults are literals only.
"""

SCHEMA = r"""
Return ONLY a JSON object with keys:
{
  "rows": [
    {
      "label": "Identifier_Label",
      "default_value": 0,          // number or short string; keep simple
      "mapped_ref": "Table[Label]" // OPTIONAL; only if this exact ref exists in the catalog
    }
    // 3–10 rows total preferred, include an "Other" row last if helpful
  ],
  "notes": "One sentence on how you chose defaults."
}

Rules:
- Rows should be reasonable for ANY variable name; think of common components or drivers.
- Prefer 4–8 rows unless instructed otherwise; cap at 10.
- Ensure labels are unique and pass ^[A-Za-z_][A-Za-z0-9_]*$ .
- If mapped_ref is used, it MUST be exactly in Table[Label] form and exist in the catalog.
- Keep default_value simple (e.g., 0, 1, 0.0, "TBD").
"""

def build_user_prompt(var_name: str, catalog: Dict[str, Any], max_rows: int, allow_map: bool) -> str:
    lines = []
    lines.append(f"variable_name: {var_name}")
    lines.append(f"max_rows: {max_rows}")
    lines.append(f"allow_mapping_to_dataset_refs: {str(bool(allow_map)).lower()}")
    lines.append("")
    lines.append("DATASET CATALOG (you may only reference these):")
    for t in catalog.get("tables", []):
        lines.append(f"- table: {t['name']}")
        if t["scalar_labels"]:
            lines.append(f"  scalar_labels: {', '.join(t['scalar_labels'])}")
        else:
            lines.append("  scalar_labels: (none)")
        if t["examples"]:
            ex = "; ".join([f"{e['label']}={e['value']}" for e in t["examples"]])
            lines.append(f"  examples: {ex}")
    return "\n".join(lines)

def extract_json_snippet(text: str) -> str:
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e <= s:
        raise ValueError("No JSON object found in model output")
    return text[s:e+1].strip()

def chat_json(model: str, temperature: float, system: str, user: str) -> dict:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": SCHEMA + "\n\n" + user}],
        temperature=temperature,
        max_tokens=1200,
        response_format={"type": "json_object"}
    )
    content = (resp.choices[0].message.content or "").strip()
    try:
        return json.loads(content)
    except Exception:
        return json.loads(extract_json_snippet(content))

# ----------------- validation & table build -----------------
def validate_rows(rows: List[dict],
                  catalog: Dict[str, Any],
                  max_rows: int,
                  allow_map: bool,
                  force_zero: bool) -> List[dict]:
    valid_refs = set()
    for t in catalog.get("tables", []):
        tname = t["name"]
        for lab in t["scalar_labels"]:
            valid_refs.add(f"{tname}[{lab}]")

    clean: List[dict] = []
    seen = set()
    for r in rows[:max_rows]:
        lab = sanitize_ident(str(r.get("label") or ""), fallback="Item")
        if not lab or lab in seen:
            continue
        seen.add(lab)

        mapped = str(r.get("mapped_ref") or "").strip()
        dv = r.get("default_value", 0)

        if force_zero:
            dv = 0
            mapped = ""
        else:
            if isinstance(dv, (int, float)):
                pass
            elif isinstance(dv, str):
                dv = dv.strip()[:64] if dv.strip() else "TBD"
            else:
                dv = 0

        use_ref = False
        if allow_map and mapped and mapped in valid_refs:
            use_ref = True

        clean.append({
            "label": lab,
            "value_cell": mapped if use_ref else dv
        })
    return clean

def assemble_wells_table(var_name: str, rows: List[dict], existing_names: List[str], append_only: bool) -> dict:
    base = f"{sanitize_ident(var_name, 'Variable')}_Breakdown"
    table_name = next_unique_name(existing_names, base) if (append_only or base in existing_names) else base

    wells = []
    # --- Top header row (explicit) ---
    wells.append({"x": 0, "y": 0, "value": "Label"})
    wells.append({"x": 1, "y": 0, "value": "Value"})

    # --- Data rows start at y=1 ---
    y = 1
    for r in rows:
        wells.append({"x": 0, "y": y, "value": r["label"]})
        wells.append({"x": 1, "y": y, "value": r["value_cell"]})
        y += 1

    # Optional "Other" if not present
    if all(r["label"] != "Other" for r in rows) and len(rows) <= 9:
        wells.append({"x": 0, "y": y, "value": "Other"})
        wells.append({"x": 1, "y": y, "value": 0})
        y += 1

    return {
        "name": table_name,
        "cols": 2,
        "rows": y,   # includes header
        "wells": wells
    }

# ----------------- main (Ion) -----------------
def main() -> int:
    src_json_text = works.param(1)
    var_name = (works.param(2) or "").strip()
    flags_raw = (works.param(3) or "").strip()
    model = (works.param(4) or "gpt-4o-mini").strip()
    try:
        temperature = float(works.param(5) or 0.2)
    except Exception:
        temperature = 0.2
    try:
        max_rows = int(works.param(6) or 10)
    except Exception:
        max_rows = 10

    if not var_name:
        works.resolve({"status": "❌ error", "error": "param(2) variable name is required"})
        return 1

    flags = set([f.strip().lower() for f in flags_raw.split(",") if f.strip()]) if flags_raw else set()
    force_zero = ("force-zero" in flags)
    append_only = ("append-only" in flags)
    allow_map = ("no-map" not in flags)

    try:
        src_obj = src_json_text if isinstance(src_json_text, (dict, list)) else json.loads(str(src_json_text))
    except Exception as e:
        works.resolve({"status": "❌ error", "error": f"Failed to parse input JSON: {e}"})
        return 1

    try:
        tables, shape = normalize_root(src_obj)
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1

    catalog = inventory_scalar_catalog(tables)
    try:
        user = build_user_prompt(var_name, catalog, max_rows=max_rows, allow_map=allow_map)
        resp = chat_json(model=model, temperature=temperature, system=SYSTEM, user=user)
        rows = resp.get("rows") or []
    except Exception:
        rows = [
            {"label": f"{sanitize_ident(var_name)}_Component_A", "default_value": 0},
            {"label": f"{sanitize_ident(var_name)}_Component_B", "default_value": 0},
            {"label": "Other", "default_value": 0},
        ]

    clean_rows = validate_rows(rows, catalog, max_rows=max_rows, allow_map=allow_map, force_zero=force_zero)

    if not clean_rows:
        clean_rows = [
            {"label": f"{sanitize_ident(var_name)}_Component_A", "value_cell": 0},
            {"label": f"{sanitize_ident(var_name)}_Component_B", "value_cell": 0},
            {"label": "Other", "value_cell": 0},
        ]

    existing_names = [(t.get("name") or "").strip() for t in tables]
    new_table = assemble_wells_table(var_name, clean_rows, existing_names, append_only=append_only)

    works.resolve(package_new_only([new_table], shape))
    return 0

if __name__ == "__main__":
    sys.exit(main())
