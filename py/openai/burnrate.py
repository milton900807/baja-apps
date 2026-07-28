#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
TenYear_View_Cols builder (GPT-driven, label-only refs, growth-aware) + BurnRate rows merged.

- Builds TenYear_View_Cols with YoY KPIs (your original logic).
- Appends BurnRate and BurnRate_Growth_YoY rows into the SAME table.
- Strict formula syntax: Table[Label] only; + - * / ^; no functions; no ranges.

Ion Works:
  param(1): JSON text of dataset (required)
  param(2): years_ahead integer (optional; default 10)
  param(3): model id (optional; default "gpt-4o-mini")
  param(4): temperature float (optional; default 0.15)
"""

import json
import re
import sys
import os
from datetime import datetime, date
from typing import Any, Dict, List, Tuple, Optional, Set

# --- Ion Works (optional) ---
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:
    class _Dummy:
        @staticmethod
        def msg(*a, **k): pass
        @staticmethod
        def resolve(*a, **k): pass
        @staticmethod
        def param(*a, **k): raise RuntimeError("Ion not available")
    works = _Dummy()
    _HAS_ION = False

# --- OpenAI client ---
from openai import OpenAI

# ----------------- wire helpers -----------------
def k(t: str, i: int, j: int) -> str:
    """wire key: <table>[i:i][j:j]"""
    return f"{t}[{i}:{i}][{j}:{j}]"

# ----------------- dataset normalization -----------------
def _normalize_root(obj: Any) -> List[dict]:
    if isinstance(obj, dict) and "wells" in obj and "name" in obj:
        return [obj]
    if isinstance(obj, dict) and "tables" in obj and isinstance(obj["tables"], list):
        return [t for t in obj["tables"] if isinstance(t, dict)]
    if isinstance(obj, list):
        return [t for t in obj if isinstance(t, dict)]
    raise RuntimeError("Input JSON must be a table, a list of tables, or {'tables':[...] }.")

def wells_to_maps(table_obj: dict) -> Tuple[Dict[int, str], Dict[int, Any], Dict[str, int]]:
    lbl_by_y, val_by_y, label_to_row = {}, {}, {}
    for w in table_obj.get("wells", []):
        x, y, val = w.get("x"), w.get("y"), w.get("value")
        if not isinstance(y, int) or y < 0:
            continue
        if x == 0:
            if isinstance(val, str) and val.strip():
                lab = val.strip()
                lbl_by_y[y] = lab
                label_to_row[lab] = y
        elif x == 1:
            val_by_y[y] = val
    return lbl_by_y, val_by_y, label_to_row

def find_table(tables: List[dict], name: str) -> Optional[dict]:
    for t in tables:
        if (t.get("name") or "").strip() == name:
            return t
    return None

# ----------------- metadata inventory -----------------
IDENT_LABEL = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

def inventory_scalar_catalog(tables: List[dict]) -> Dict[str, Any]:
    cat: Dict[str, Any] = {"tables": []}
    present: Dict[str, Dict[str, Set[str]]] = {}
    for t in tables:
        name = t.get("name") or ""
        lbl_by_y, val_by_y, _ = wells_to_maps(t)
        scalars: List[str] = []
        examples = []
        for y, lab in lbl_by_y.items():
            if IDENT_LABEL.match(lab):
                scalars.append(lab)
                v = val_by_y.get(y)
                if v is not None and len(examples) < 8:
                    examples.append({"label": lab, "value": v})
        scalars = sorted(set(scalars))
        cat["tables"].append({
            "name": name,
            "scalar_labels": scalars,
            "examples": examples
        })
        present[name] = {"scalars": set(scalars)}
    cat["present"] = present
    return cat

def find_start_year_or_now(tables: List[dict]) -> int:
    t = find_table(tables, "Assumptions")
    if not t:
        return datetime.now().year
    lbl_by_y, val_by_y, _ = wells_to_maps(t)
    for yy, lab in lbl_by_y.items():
        if lab == "Start_Year":
            try:
                return int(float(str(val_by_y.get(yy))))
            except Exception:
                return datetime.now().year
    return datetime.now().year

def has_growth_rate(tables: List[dict]) -> bool:
    t = find_table(tables, "Assumptions")
    if not t:
        return False
    lbl_by_y, _, _ = wells_to_maps(t)
    return any(lab == "Growth_Rate" for lab in lbl_by_y.values())

# ----------------- OpenAI call -----------------
def _extract_json_snippet(text: str) -> str:
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e <= s:
        raise ValueError("No JSON object found in model output")
    return text[s:e+1].strip()

def _chat_call(*, model: str, system: str, user: str, temperature: float = 0.15, json_mode: bool = True, max_tokens: int = 4000) -> dict:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    content = (resp.choices[0].message.content or "").strip()
    try:
        return json.loads(content)
    except Exception:
        return json.loads(_extract_json_snippet(content))

# ----------------- GPT prompt scaffold -----------------
SCHEMA_MSG = r"""
Return ONLY a JSON object with keys:
{
  "rows": [
    {"label": "Profit_Margin_YoY",   "per_year": {"<YYYY>": "<formula>", "...": "..." }},
    {"label": "Total_Profit",        "per_year": {"<YYYY>": "<formula>", "...": "..." }},
    {"label": "Revenue_Growth_YoY",  "per_year": {"<YYYY>": "<formula>", "...": "..." }},
    {"label": "<Optional_Extra_Row>", "per_year": {...}}
  ],
  "notes": "One sentence describing how you built the YoY view."
}

FORMULA EXAMPLES:
TenYear_View_Cols[1:1][1:1]=(PnL[Net_Income]/PnL[Revenue])-(PnL[Net_Income]/PnL[Revenue])
TenYear_View_Cols[2:2][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^1/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^1)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^0/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^0)
TenYear_View_Cols[3:3][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^2/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^2)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^1/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^1)
TenYear_View_Cols[4:4][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^3/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^3)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^2/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^2)
TenYear_View_Cols[5:5][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^4/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^4)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^3/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^3)
TenYear_View_Cols[6:6][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^5/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^5)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^4/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^4)
TenYear_View_Cols[7:7][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^6/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^6)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^5/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^5)
TenYear_View_Cols[8:8][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^7/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^7)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^6/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^6)
TenYear_View_Cols[9:9][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^8/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^8)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^7/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^7)
TenYear_View_Cols[10:10][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^9/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^9)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^8/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^8)
TenYear_View_Cols[1:1][2:2]=PnL[Net_Income]
TenYear_View_Cols[2:2][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^1
...
TenYear_View_Cols[1:1][3:3]=(PnL[Revenue]/PnL[Revenue])-1
TenYear_View_Cols[2:2][3:3]=(PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^1/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^0)-1
...

STRICT FORMAT & RULES:
- References MUST be exactly: Table[Label]
- Allowed operators: + - * / ^ and parentheses ONLY. No functions. No ranges.
- Provide at least these rows: Profit_Margin_YoY, Total_Profit, Revenue_Growth_YoY.
- Prefer 2–4 additional YoY rows if supported (Revenue_YoY, Net_Income_YoY, EBITDA_YoY, Gross_Margin_YoY).
- Use full year range from start_year to start_year + years_ahead inclusive.
- If Growth_Rate exists and no explicit series exists for a metric, compound: Base*(1+Assumptions[Growth_Rate])^n
- Every cell that is not the top row or first column MUST have a formula assigned to it.
- IF growth rate is not found in existing Assumptions table assume a constant to be used in the formulas.
"""

def build_user_prompt_from_catalog(catalog: Dict[str, Any], start_year: int, years_ahead: int) -> str:
    lines = []
    lines.append(f"start_year: {start_year}")
    lines.append(f"years_ahead: {years_ahead}")
    lines.append("")
    lines.append("CATALOG (reference ONLY these Table[Label] pairs):")
    for t in catalog["tables"]:
        lines.append(f"- table: {t['name']}")
        if t["scalar_labels"]:
            lines.append(f"  scalar_labels: {', '.join(t['scalar_labels'])}")
        else:
            lines.append("  scalar_labels: (none)")
    lines.append("")
    lines.append("Find appropriate formulas that use available fields to build a cumulative year-over-year view,")
    lines.append("including compound growth when Assumptions[Growth_Rate] exists.")
    lines.append("Remember: references must be Table[Label] with Label from scalar_labels above.")
    return "\n".join(lines)

# ----------------- validation/helpers -----------------
_LABEL_REF_RE = re.compile(r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]')
_ALLOWED_CHARS_RE = re.compile(r'^[0-9A-Za-z_\+\-\*\/\^\(\)\[\]\.\s]+$')

def _ref_ok(table: str, label: str, present: Dict[str, Dict[str, Set[str]]]) -> bool:
    return table in present and label in present[table]["scalars"]

def _formula_refs(formula: str) -> List[Tuple[str, str]]:
    return [(m.group("table"), m.group("label")) for m in _LABEL_REF_RE.finditer(formula or "")]

def _only_allowed_ops(formula: str) -> bool:
    if not _ALLOWED_CHARS_RE.match(formula or ""):
        return False
    if re.search(r'[A-Za-z_][A-Za-z0-9_]*\s*\(', formula):  # functions
        return False
    if re.search(r'[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]', formula):  # dot notation
        return False
    return True

def _rows_to_wire(table_name: str, rows: List[Dict[str, Dict[str, str]]], years: List[int]) -> Tuple[Dict[str, Any], Dict[str, str]]:
    tables: Dict[str, Any] = {k(table_name, 0, 0): "Label"}
    formulas: Dict[str, str] = {}
    for c, y in enumerate(years, start=1):
        tables[k(table_name, c, 0)] = f"Y{y}"
    r = 1
    for row in rows:
        lab = re.sub(r"\s+", "_", row["label"].strip())
        tables[k(table_name, 0, r)] = lab
        per_year = row.get("per_year", {})
        for c, y in enumerate(years, start=1):
            expr = per_year.get(str(y))
            if isinstance(expr, str) and expr.strip():
                formulas[k(table_name, c, r)] = re.sub(r"\s+", "", expr)
        r += 1
    return tables, formulas

# ----------------- fallback builders (growth-aware) -----------------
def _growth_term(present: Dict[str, Dict[str, Set[str]]]) -> Optional[str]:
    if "Assumptions" in present and "Growth_Rate" in present["Assumptions"]["scalars"]:
        return "(1+Assumptions[Growth_Rate])"
    return None

def _select_base(present: Dict[str, Dict[str, Set[str]]], candidates: List[Tuple[str, str]]) -> Optional[str]:
    for tname, label in candidates:
        if tname in present and label in present[tname]["scalars"]:
            return f"{tname}[{label}]"
    return None

def _autofill_required_rows(present: Dict[str, Dict[str, Set[str]]], years: List[int]) -> List[Dict[str, Dict[str, str]]]:
    rows: List[Dict[str, Dict[str, str]]] = []
    rev_base = _select_base(present, [
        ("PnL", "Revenue"), ("Profit_and_Loss", "Revenue"), ("Revenue", "Total"), ("Revenue", "Revenue")
    ])
    ni_base  = _select_base(present, [
        ("PnL", "Net_Income"), ("Profit_and_Loss", "Net_Income"),
        ("Net_Income", "Total"), ("PnL", "EBITDA")
    ])
    g = _growth_term(present)

    if ni_base:
        per_year = {}
        for idx, y in enumerate(years):
            per_year[str(y)] = f"{ni_base}*{g}^{idx}" if g else f"{ni_base}"
        rows.append({"label": "Total_Profit", "per_year": per_year})

    if rev_base and (ni_base or _select_base(present, [("PnL","EBITDA")])):
        if not ni_base:
            ni_base = _select_base(present, [("PnL","EBITDA")])
        per_year = {}
        for idx, y in enumerate(years):
            ny = f"{ni_base}*{g}^{idx}" if g else f"{ni_base}"
            ry = f"{rev_base}*{g}^{idx}" if g else f"{rev_base}"
            if idx == 0:
                per_year[str(y)] = f"({ny}/{ry})-({ny}/{ry})"
            else:
                nyp = f"{ni_base}*{g}^{idx-1}" if g else f"{ni_base}"
                ryp = f"{rev_base}*{g}^{idx-1}" if g else f"{rev_base}"
                per_year[str(y)] = f"({ny}/{ry})-({nyp}/{ryp})"
        rows.append({"label": "Profit_Margin_YoY", "per_year": per_year})

    if rev_base:
        per_year = {}
        for idx, y in enumerate(years):
            ry = f"{rev_base}*{g}^{idx}" if g else f"{rev_base}"
            if idx == 0:
                per_year[str(y)] = f"({ry}/{ry})-1"
            else:
                ryp = f"{rev_base}*{g}^{idx-1}" if g else f"{rev_base}"
                per_year[str(y)] = f"({ry}/{ryp})-1"
        rows.append({"label": "Revenue_Growth_YoY", "per_year": per_year})

    return rows

# ----------------- BurnRate helpers -----------------
def _burn_base_candidate(present: Dict[str, Dict[str, Set[str]]]) -> Optional[str]:
    return _select_base(
        present,
        [
            ("Assumptions", "Monthly_Burn"),
            ("Assumptions", "Base_Burn"),
            ("CashFlow", "Operating_Cash_Burn"),
            ("CashFlow", "Net_Cash_Burn"),
            ("PnL", "Operating_Expenses"),
            ("PnL", "Total_Operating_Expenses"),
            ("PnL", "OPEX"),
            ("Assumptions", "Burn"),  # fallback
        ],
    )

def _build_burn_rows_for_merge(present: Dict[str, Dict[str, Set[str]]], years: List[int]) -> List[Dict[str, Dict[str, str]]]:
    burn_base = _burn_base_candidate(present)
    if not burn_base:
        # If truly nothing to reference, we can't synthesize valid label-only formulas
        return []
    g = _growth_term(present)
    rows: List[Dict[str, Dict[str, str]]] = []

    # BurnRate level
    burn_row = {"label": "BurnRate", "per_year": {}}
    for idx, y in enumerate(years):
        burn_row["per_year"][str(y)] = f"{burn_base}*{g}^{idx}" if g else f"{burn_base}"
    rows.append(burn_row)

    # BurnRate_Growth_YoY
    growth_row = {"label": "BurnRate_Growth_YoY", "per_year": {}}
    for idx, y in enumerate(years):
        by = f"{burn_base}*{g}^{idx}" if g else f"{burn_base}"
        if idx == 0:
            growth_row["per_year"][str(y)] = f"({by}/{by})-1"
        else:
            byp = f"{burn_base}*{g}^{idx-1}" if g else f"{burn_base}"
            growth_row["per_year"][str(y)] = f"({by}/{byp})-1"
    rows.append(growth_row)
    return rows

# ----------------- main orchestrator (MERGED) -----------------
def build_ten_year_view_gpt_with_burn_merge(
    src_root: Any,
    years_ahead: int = 10,
    model: str = "gpt-4o-mini",
    temperature: float = 0.15
) -> Dict[str, Any]:
    tables = _normalize_root(src_root)
    start_year = find_start_year_or_now(tables)
    years = list(range(start_year, start_year + years_ahead + 1))

    catalog = inventory_scalar_catalog(tables)
    present = catalog["present"]
    user_prompt = build_user_prompt_from_catalog(catalog, start_year, years_ahead)

    system = "You are a precise financial modeling assistant. Follow the schema and hard rules exactly."
    resp = _chat_call(model=model, system=system, user=SCHEMA_MSG + "\n\n" + user_prompt, temperature=temperature, json_mode=True)

    # Validate & prune GPT rows
    rows = resp.get("rows") or []
    valid_rows: List[Dict[str, Dict[str, str]]] = []
    for row in rows:
        label = (row.get("label") or "").strip()
        per_year = row.get("per_year") or {}
        if not label or not isinstance(per_year, dict):
            continue
        ok_years: Dict[str, str] = {}
        for y in years:
            f = per_year.get(str(y))
            if not isinstance(f, str) or not f.strip():
                continue
            if not _only_allowed_ops(f):
                continue
            refs = _formula_refs(f)
            if all(_ref_ok(t, lab, present) for t, lab in refs):
                ok_years[str(y)] = f
        if ok_years:
            valid_rows.append({"label": label, "per_year": ok_years})

    # Ensure required KPI rows; add growth-aware fallbacks if needed
    need = {"Profit_Margin_YoY", "Total_Profit", "Revenue_Growth_YoY"}
    have = {r["label"] for r in valid_rows}
    if need - have:
        valid_rows += _autofill_required_rows(present, years)

    # Append BurnRate rows (merged into the SAME table)
    burn_rows = _build_burn_rows_for_merge(present, years)
    valid_rows += burn_rows

    if not valid_rows:
        raise RuntimeError("No valid rows could be constructed for TenYear_View_Cols (including BurnRate merge).")

    # Assemble wire for the merged table
    tables_map, formulas_map = _rows_to_wire("TenYear_View_Cols", valid_rows, years)

    # Units
    units = {"TenYear_View_Cols": {}}
    row_labels = [tables_map[k("TenYear_View_Cols", 0, r)] for r in range(1, 1 + len(valid_rows))]
    for lab in row_labels:
        if lab in ("Profit_Margin_YoY", "Revenue_Growth_YoY", "BurnRate_Growth_YoY") or lab.endswith("_YoY") or "Margin" in lab:
            units["TenYear_View_Cols"][lab] = "fraction"
        elif lab == "BurnRate":
            units["TenYear_View_Cols"][lab] = "USD"
        else:
            units["TenYear_View_Cols"][lab] = "USD"

    annotations = {
        "TenYear_View_Cols": (
            (resp.get("notes") or "YoY KPIs built from available scalar labels; ")
            + "Merged BurnRate and BurnRate_Growth_YoY into the same table. "
              "Compounds via Assumptions[Growth_Rate] when present; strict label-only formulas."
        )
    }

    diagnostics = {
        "start_year": start_year,
        "years": years,
        "uses_growth": bool(_growth_term(present)),
        "merged_burn_rows": bool(burn_rows),
    }

    return {
        "tables": tables_map,
        "formulas": formulas_map,
        "annotations": annotations,
        "units": units,
        "diagnostics": diagnostics
    }

# ----------------- CLI / Ion entry -----------------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    src_json_text = works.param(1)
    try:
        years_ahead = int(works.param(2))
    except Exception:
        years_ahead = 10
    model = (works.param(3) or default_model)
    try:
        temperature = float(works.param(4) or 0.15)
    except Exception:
        temperature = 0.15

    try:
        src_obj = src_json_text if isinstance(src_json_text, (dict, list)) else json.loads(str(src_json_text))
    except Exception as e:
        works.resolve({"status": "❌ error", "error": f"Failed to parse input JSON: {e}"})
        raise

    try:
        out = build_ten_year_view_gpt_with_burn_merge(src_obj, years_ahead=years_ahead, model=str(model), temperature=temperature)
        works.resolve(out)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e), "where": "TenYear_View_Cols (merged)"})
        raise

if __name__ == "__main__":
    sys.exit(_main_ion())
