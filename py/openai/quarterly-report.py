#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
+TenYear_View_Cols builder (GPT-driven, label-only refs, growth-aware) + y(x) point formula
NOW returns:
  - window.startDate and window.endDate
  - series: quarterly points with x (hours since startDate), date, year, q, y_ref

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
from datetime import datetime
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

# --- OpenAI client (optional; used to propose y(x) strictly) ---
try:
    from openai import OpenAI
    _HAS_OPENAI = True
except Exception:
    _HAS_OPENAI = False

# ----------------- wire helpers -----------------
def k(t: str, i: int, j: int) -> str:
    """wire key: <table>[i:i][j:j]"""
    return f"{t}[{i}:{i}][{j}:{j}]"

# ----------------- dataset normalization -----------------
def _normalize_root(obj: Any) -> List[dict]:
    """
    Accept:
      • a single table object {name, cols, rows, wells}
      • a list of such tables
      • {"tables":[...]}
    Return: list[table_obj]
    """
    if isinstance(obj, dict) and "wells" in obj and "name" in obj:
        return [obj]
    if isinstance(obj, dict) and "tables" in obj and isinstance(obj["tables"], list):
        return [t for t in obj["tables"] if isinstance(t, dict)]
    if isinstance(obj, list):
        return [t for t in obj if isinstance(t, dict)]
    raise RuntimeError("Input JSON must be a table, a list of tables, or {'tables':[...] }.")

def wells_to_maps(table_obj: dict) -> Tuple[Dict[int, str], Dict[int, Any], Dict[str, int]]:
    """
    Returns (labels_by_row_index, values_by_row_index, label_to_row)
    for a 2-col wells table.
    """
    lbl_by_y, val_by_y, label_to_row = {}, {}, {}
    for w in table_obj.get("wells", []) or []:
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
def inventory_scalar_catalog(tables: List[dict]) -> Dict[str, Any]:
    """
    Build a catalog of scalar-ish labels per table.
    Keep original labels (spaces/symbols allowed) so GPT can reference exactly what exists.
    """
    cat: Dict[str, Any] = {"tables": []}
    present: Dict[str, Dict[str, Set[str]]] = {}
    for t in tables:
        name = t.get("name") or ""
        lbl_by_y, val_by_y, _ = wells_to_maps(t)
        scalars: List[str] = []
        examples = []
        for y, lab in lbl_by_y.items():
            if isinstance(lab, str) and lab.strip():
                clean = lab.strip()
                scalars.append(clean)
                v = val_by_y.get(y)
                if v is not None and len(examples) < 8:
                    examples.append({"label": clean, "value": v})
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

def _parse_iso_date(s: str) -> Optional[datetime]:
    try:
        st = str(s).strip()
        if not st:
            return None
        # Prefer ISO-8601; allow bare YYYY-MM-DD as well
        if re.match(r"^\d{4}-\d{2}-\d{2}([ T].*)?$", st):
            dt = datetime.fromisoformat(st.replace("Z",""))
            # Set a default business-hour time if none provided
            if len(st) == 10:
                dt = dt.replace(hour=9, minute=0, second=0, microsecond=0)
            return dt
        return datetime.fromisoformat(st)
    except Exception:
        return None

def find_base_date_or_year_start(tables: List[dict], start_year: int) -> datetime:
    """
    Try to read a base date from Assumptions: Start_Date or Base_Date (ISO-8601),
    else fall back to Jan 1 of start_year at 09:00.
    """
    t = find_table(tables, "Assumptions")
    if t:
        lbl_by_y, val_by_y, _ = wells_to_maps(t)
        for yy, lab in lbl_by_y.items():
            if lab in ("Start_Date", "Base_Date", "Start Date", "Base Date"):
                dt = _parse_iso_date(val_by_y.get(yy))
                if dt:
                    return dt
    return datetime(start_year, 1, 1, 9, 0, 0)

def make_window_dates(start_year: int, years_ahead: int, base_dt: datetime) -> Tuple[str, str]:
    """
    window.startDate = base_dt (ISO)
    window.endDate   = Dec 31 of the last year in range @ 17:00 local
    """
    last_year = start_year + years_ahead - 1
    end_dt = datetime(last_year, 12, 31, 17, 0, 0)
    return base_dt.isoformat(), end_dt.isoformat()

def has_growth_rate(tables: List[dict]) -> bool:
    t = find_table(tables, "Assumptions")
    if not t:
        return False
    lbl_by_y, _, _ = wells_to_maps(t)
    return any(lab == "Growth_Rate" for lab in lbl_by_y.values())

# ----------------- OpenAI call (existing) -----------------
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

SCHEMA_MSG = r"""
Return ONLY a JSON object with keys:
{
  "rows": [
    {"label": "Profit_Margin_YoY",   "per_year": {"<YYYY>": "<formula>", "...": "..." }},
    {"label": "Total_Profit",        "per_year": {"<YYYY>": "<formula>", "...": "..." }},
    {"label": "cash_on_hand",        "per_year": {"<YYYY>": "<formula>", "...": "..." }}
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
TenYear_View_Cols[3:3][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^2
TenYear_View_Cols[4:4][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^3
TenYear_View_Cols[5:5][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^4
TenYear_View_Cols[6:6][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^5
TenYear_View_Cols[7:7][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^6
TenYear_View_Cols[8:8][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^7
TenYear_View_Cols[9:9][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^8
TenYear_View_Cols[10:10][2:2]=PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^9
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
    lines.append("including compound growth when a growth label exists.")
    lines.append("Remember: references must be Table[Label] with Label from scalar_labels above.")
    return "\n".join(lines)

# ----------------- validation/helpers -----------------
_LABEL_REF_RE = re.compile(r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>[^\]]+)\]')
_ALLOWED_CHARS_RE = re.compile(r'^[0-9A-Za-z_\+\-\*\/\^\(\)\[\]\.\s]+$')

def _ref_ok(table: str, label: str, present: Dict[str, Dict[str, Set[str]]]) -> bool:
    return table in present and label in present[table]["scalars"]

def _formula_refs(formula: str) -> List[Tuple[str, str]]:
    return [(m.group("table"), m.group("label")) for m in _LABEL_REF_RE.finditer(formula or "")]

def _only_allowed_ops(formula: str) -> bool:
    if not _ALLOWED_CHARS_RE.match(formula or ""):
        return False
    if re.search(r'[A-Za-z_][A-Za-z0-9_]*\s*\(', formula):  # ban function-like tokens
        return False
    if re.search(r'[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]', formula):  # ban dot notation
        return False
    if re.search(r'\[[^\]]*["\']+[^\]]*\]', formula):  # ban quotes inside brackets
        return False
    return True

# ----------------- growth discovery -----------------
def _find_growth_ref(present: Dict[str, Dict[str, Set[str]]]) -> Optional[str]:
    if "Assumptions" in present:
        if "Growth_Rate" in present["Assumptions"]["scalars"]: return "Assumptions[Growth_Rate]"
        if "Annual_Growth_Rate" in present["Assumptions"]["scalars"]: return "Assumptions[Annual_Growth_Rate]"
        if "Annual Growth Rate" in present["Assumptions"]["scalars"]: return "Assumptions[Annual Growth Rate]"
        if "Growth Rate" in present["Assumptions"]["scalars"]: return "Assumptions[Growth Rate]"
    kws = ["growth_rate", "annual_growth_rate", "cagr", "growth_percent", "growth"]
    def _nl(s: str) -> str: return re.sub(r'[^A-Za-z0-9_]', '_', s).lower()
    if "Assumptions" in present:
        for lab in present["Assumptions"]["scalars"]:
            if any(kw in _nl(lab) for kw in kws): return f"Assumptions[{lab}]"
    for tname, info in present.items():
        for lab in info["scalars"]:
            if any(kw in _nl(lab) for kw in kws): return f"{tname}[{lab}]"
    return None

def _growth_term_or_default(present: Dict[str, Dict[str, Set[str]]], default: float = 0.0) -> str:
    ref = _find_growth_ref(present)
    return f"(1+{ref})" if ref else f"(1+{default})"

# ----------------- fallback helpers -----------------
def _norm(s: str) -> str:
    return re.sub(r'[^A-Za-z0-9_]', '_', s).strip('_').replace('__', '_').lower()

def _select_base(present: Dict[str, Dict[str, Set[str]]], candidates: List[Tuple[str, str]]) -> Optional[str]:
    for tname, label in candidates:
        if tname in present and label in present[tname]["scalars"]:
            return f"{tname}[{label}]"
    return None

def _select_base_loose(present: Dict[str, Dict[str, Set[str]]], *, prefer_tables: List[str], label_keywords: List[str]) -> Optional[str]:
    kws = [_norm(kw) for kw in label_keywords]
    def match(label: str) -> bool:
        return any(kw in _norm(label) for kw in kws)
    for tname in prefer_tables:
        if tname not in present: continue
        for lab in present[tname]["scalars"]:
            if match(lab): return f"{tname}[{lab}]"
    for tname, info in present.items():
        for lab in info["scalars"]:
            if match(lab): return f"{tname}[{lab}]"
    return None

def _discover_cash_refs(present: Dict[str, Dict[str, Set[str]]]) -> Dict[str, str]:
    cash_base = _select_base(present, [
        ("Balance_Sheet","Cash"), ("Balance Sheet","Cash"), ("BS","Cash"),
        ("Balance_Sheet","Cash_and_Cash_Equivalents"), ("Balance Sheet","Cash and Cash Equivalents"),
        ("Cash","Total"), ("Assumptions","Starting_Cash"), ("Treasury","Operating_Cash"),
    ]) or _select_base_loose(
        present,
        prefer_tables=["Balance_Sheet","Balance Sheet","BS","Cash","Treasury","Assumptions"],
        label_keywords=["cash","cash_on_hand","cash_equivalents","liquidity","starting_cash"]
    )
    ni_base = _select_base(present, [
        ("PnL","Net_Income"), ("Profit_and_Loss","Net_Income"), ("IS","Net_Income"),
        ("Income_Statement","Net_Income"), ("Income Statement","Net Income"),
        ("PnL","Profit"), ("PnL","EBITDA"),
    ]) or _select_base_loose(
        present,
        prefer_tables=["PnL","Profit_and_Loss","IS","Income_Statement","Income Statement"],
        label_keywords=["net_income","net_profit","earnings","profit_after_tax","profit","ebit","ebitda"]
    )
    g_ref = _find_growth_ref(present) or "Assumptions_Auto[Growth_Rate]"
    capex_ref = _select_base(present, [("Assumptions","Base_CapEx")]) or "Assumptions_Auto[Base_CapEx]"
    cash_base = cash_base or "Assumptions_Auto[Starting_Cash]"
    ni_base = ni_base or "Assumptions_Auto[Net_Income_Base]"
    return {"cash": cash_base, "ni": ni_base, "g": g_ref, "capex": capex_ref}

# ----------------- GPT y(x) synthesis -----------------
def _gpt_point_formula(catalog: Dict[str, Any], model: str, temperature: float) -> Optional[Dict[str, str]]:
    if not _HAS_OPENAI or not os.getenv("OPENAI_API_KEY"):
        return None

    tables_str = []
    for t in catalog["tables"]:
        name = t["name"]
        labs = ", ".join(t["scalar_labels"]) if t["scalar_labels"] else "(none)"
        tables_str.append(f"- {name}: {labs}")
    inventory = "\n".join(tables_str)

    SYSTEM = "You are a precise financial modeling assistant. Output strict formulas only."
    USER = fr"""
Return ONLY JSON with keys:
{{
  "t_years_formula": "<strict formula for Eval[t_years]>",
  "y_formula": "<strict formula for Cash_vs_Time[y]>"
}}

RULES:
- References MUST be exactly Table[Label] (no quotes in brackets, no ranges, no Table.Label).
- Allowed operators ONLY: + - * / ^ and parentheses. NO functions (SUM, IF, etc).
- You MAY use helper labels: Eval[x] (hours), Eval[t_years] (years). Use an Hours_Per_Year label if present to convert x→years.
- Prefer growth-aware cash logic if available: starting cash compounded, net income accumulation, CapEx drains.
- Use labels exactly as listed below.

AVAILABLE SCALARS:
{inventory}

EXAMPLE PATTERN (illustrative; adapt to the actual labels available):
Eval[t_years] = Eval[x]/Assumptions[Hours_Per_Year]
Cash_vs_Time[y] = Balance_Sheet[Cash]*(1+Assumptions[Growth_Rate])^Eval[t_years]
                  + PnL[Net_Income]*((1+Assumptions[Growth_Rate])^Eval[t_years]-1)/Assumptions[Growth_Rate]
                  - Assumptions[Base_CapEx]*Eval[t_years]
"""
    client = OpenAI()
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role":"system","content":SYSTEM},{"role":"user","content":USER}],
        temperature=temperature,
        max_tokens=700,
        response_format={"type":"json_object"},
    )
    raw = (resp.choices[0].message.content or "").strip()
    try:
        data = json.loads(raw)
        return {
            "t_years": str(data.get("t_years_formula") or "").strip(),
            "y": str(data.get("y_formula") or "").strip(),
        }
    except Exception:
        return None

def _refs_ok_strict(formula: str, present: Dict[str, Dict[str, Set[str]]], extra_allowed: Set[str]) -> bool:
    if not _only_allowed_ops(formula):
        return False
    for m in _formula_refs(formula):
        table, label = m
        ref = f"{table}[{label}]"
        if ref in extra_allowed:
            continue
        if not _ref_ok(table, label, present):
            return False
    return True

# ----------------- TenYear fallback rows -----------------
def _autofill_required_rows(present: Dict[str, Dict[str, Set[str]]], years: List[int]) -> List[Dict[str, Dict[str, str]]]:
    rows: List[Dict[str, Dict[str, str]]] = []

    def _select_base_loose(present: Dict[str, Dict[str, Set[str]]], *, prefer_tables: List[str], label_keywords: List[str]) -> Optional[str]:
        kws = [_norm(kw) for kw in label_keywords]
        def match(label: str) -> bool:
            nl = _norm(label); return any(kw in nl for kw in kws)
        for tname in prefer_tables:
            if tname not in present: continue
            for lab in present[tname]["scalars"]:
                if match(lab): return f"{tname}[{lab}]"
        for tname, info in present.items():
            for lab in info["scalars"]:
                if match(lab): return f"{tname}[{lab}]"
        return None

    rev_base = _select_base(present, [
        ("PnL", "Revenue"), ("Profit_and_Loss", "Revenue"),
        ("Revenue", "Total"), ("Revenue", "Revenue"),
        ("IS", "Revenue"), ("Income_Statement", "Revenue"),
        ("PL", "Revenue"), ("P_L", "Revenue"), ("Income Statement", "Revenue"),
    ]) or _select_base_loose(present,
        prefer_tables=["PnL","Profit_and_Loss","IS","Income_Statement","Income Statement","Revenue"],
        label_keywords=["revenue","sales","turnover","total_revenue","topline","rev"])
    ni_base  = _select_base(present, [
        ("PnL", "Net_Income"), ("Profit_and_Loss", "Net_Income"),
        ("Net_Income", "Total"), ("PnL", "EBITDA"),
        ("IS", "Net_Income"), ("Income_Statement", "Net_Income"),
        ("PnL", "Profit"), ("Income Statement", "Net Income"),
    ]) or _select_base_loose(present,
        prefer_tables=["PnL","Profit_and_Loss","IS","Income_Statement","Income Statement"],
        label_keywords=["net_income","net_profit","earnings","profit_after_tax","profit","ebit","ebitda"])
    cash_base = _select_base(present, [
        ("Balance_Sheet", "Cash"), ("Balance Sheet","Cash"), ("BS","Cash"),
        ("Balance_Sheet","Cash_and_Cash_Equivalents"), ("Balance Sheet","Cash and Cash Equivalents"),
        ("Cash","Total"), ("Assumptions","Starting_Cash"), ("Treasury","Operating_Cash"),
    ]) or _select_base_loose(
        present,
        prefer_tables=["Balance_Sheet","Balance Sheet","BS","Cash","Treasury","Assumptions"],
        label_keywords=["cash","cash_on_hand","cash_equivalents","liquidity","starting_cash"])

    if not cash_base:
        cash_base = ni_base or rev_base

    g = _growth_term_or_default(present, default=0.0)

    # Total_Profit
    if ni_base:
        per_year = {str(y): f"{ni_base}*{g}^{idx}" for idx, y in enumerate(years)}
        rows.append({"label":"Total_Profit","per_year":per_year})

    # Profit_Margin_YoY
    if ni_base and rev_base:
        per_year = {}
        for idx, y in enumerate(years):
            ny = f"{ni_base}*{g}^{idx}"
            ry = f"{rev_base}*{g}^{idx}"
            if idx == 0:
                per_year[str(y)] = f"({ny}/{ry})-({ny}/{ry})"
            else:
                nyp = f"{ni_base}*{g}^{idx-1}"
                ryp = f"{rev_base}*{g}^{idx-1}"
                per_year[str(y)] = f"({ny}/{ry})-({nyp}/{ryp})"
        rows.append({"label":"Profit_Margin_YoY","per_year":per_year})

    # cash_on_hand
    capex_ref: Optional[str] = None
    if "Assumptions" in present and "Base_CapEx" in present["Assumptions"]["scalars"]:
        capex_ref = "Assumptions[Base_CapEx]"
    else:
        for tname, info in present.items():
            for lab in info["scalars"]:
                if _norm(lab) == "base_capex":
                    capex_ref = f"{tname}[{lab}]"; break
            if capex_ref: break

    per_year = {}
    if cash_base and ni_base:
        for idx, y in enumerate(years):
            expr = f"{cash_base}*{g}^{idx}+{ni_base}*{idx}"
            if capex_ref: expr += f"-{capex_ref}*{idx}"
            per_year[str(y)] = expr
    elif cash_base:
        for idx, y in enumerate(years):
            expr = f"{cash_base}*{g}^{idx}"
            if capex_ref: expr += f"-{capex_ref}*{idx}"
            per_year[str(y)] = expr
    elif ni_base:
        for idx, y in enumerate(years):
            expr = f"{ni_base}*{idx}"
            if capex_ref: expr += f"-{capex_ref}*{idx}"
            per_year[str(y)] = expr
    else:
        for idx, y in enumerate(years):
            per_year[str(y)] = f"({g}^{idx}/{g}^{idx})-({g}^{idx}/{g}^{idx})"
    rows.append({"label":"cash_on_hand","per_year":per_year})
    return rows

# ----------------- rows to wire -----------------
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

# ----------------- series helpers (quarterly points) -----------------
def _add_quarters(dt: datetime, q: int) -> datetime:
    months_add = 3 * q
    y = dt.year + (dt.month - 1 + months_add) // 12
    m = ((dt.month - 1 + months_add) % 12) + 1
    d = min(dt.day, 28)  # safe day for all months
    return datetime(y, m, d, dt.hour, dt.minute, dt.second, dt.microsecond)

def _idx_to_date(idx: int, base_dt: datetime) -> datetime:
    return _add_quarters(base_dt, idx)

def _build_quarterly_series(base_dt: datetime, years_ahead: int) -> List[Dict[str, Any]]:
    """
    Create quarterly points across the window:
      - x: hours since base_dt
      - date: ISO date
      - year: 1-based year index in horizon
      - q: quarter number (1..4)
      - y_ref: label to evaluate for y (set Eval[x]=x then evaluate Cash_vs_Time[y])
    """
    n_quarters = max(1, years_ahead * 4)
    series: List[Dict[str, Any]] = []
    start_dt = base_dt
    for i in range(n_quarters):
        dt = _idx_to_date(i, base_dt)
        x_hours = max(0.0, (dt - start_dt).total_seconds() / 3600.0)
        series.append({
            "x": x_hours,
            "date": dt.isoformat(),
            "year": (i // 4) + 1,
            "q": (i % 4) + 1,
            "y_ref": "Cash_vs_Time[y]"
        })
    return series

# ----------------- point formula assembly -----------------
def _point_formula_build(catalog: Dict[str, Any], model: str, temperature: float) -> Tuple[Dict[str, Any], Dict[str, str], Dict[str, str], str]:
    """
    Returns:
      tables_add, formulas_add, point_formula (dict with 't_years' and 'y'), path_used
    """
    present = catalog["present"]

    # Always include Assumptions_Auto + Eval + Cash_vs_Time scaffolding
    tables_add: Dict[str, Any] = {}
    def _write_scalar_table(table_name: str, rows: List[Tuple[str, Any]]) -> Dict[str, Any]:
        m: Dict[str, Any] = {}
        m[k(table_name, 0, 0)] = "Label"
        m[k(table_name, 1, 0)] = "Value"
        for r, (label, value) in enumerate(rows, start=1):
            m[k(table_name, 0, r)] = label
            m[k(table_name, 1, r)] = value
        return m

    tables_add.update(_write_scalar_table("Assumptions_Auto", [
        ("Hours_Per_Year", 8760),
        ("Epsilon", 0.000001),
        ("Growth_Rate", 0.0),
        ("Base_CapEx", 0.0),
        ("Starting_Cash", 0.0),
        ("Net_Income_Base", 0.0),
    ]))
    tables_add.update(_write_scalar_table("Eval", [
        ("x", 0.0),
        ("t_years", None),
    ]))
    tables_add.update(_write_scalar_table("Cash_vs_Time", [
        ("y", None),
    ]))

    formulas_add: Dict[str, str] = {}
    point_formula: Dict[str, str] = {}
    path = "gpt"

    # Try GPT proposal
    props = _gpt_point_formula(catalog, model, temperature)
    if props:
        t_f = props.get("t_years") or ""
        y_f = props.get("y") or ""
        extra_ok = {"Eval[x]", "Eval[t_years]"}
        if _refs_ok_strict(t_f, present, extra_ok) and _refs_ok_strict(y_f, present, extra_ok):
            formulas_add[k("Eval", 1, 2)] = t_f
            formulas_add[k("Cash_vs_Time", 1, 1)] = y_f
            point_formula = {"t_years": t_f, "y": y_f}
        else:
            path = "fallback"
            props = None

    # Fallback
    if not props:
        refs = _discover_cash_refs(present)
        rterm = f"(1+{refs['g']})"
        t_f = "Eval[x]/Assumptions_Auto[Hours_Per_Year]"
        y_f = (
            f"{refs['cash']}*{rterm}^Eval[t_years]"
            f"+{refs['ni']}*({rterm}^Eval[t_years]-1)/({refs['g']}+Assumptions_Auto[Epsilon])"
            f"-{refs['capex']}*Eval[t_years]"
        )
        formulas_add[k("Eval", 1, 2)] = t_f
        formulas_add[k("Cash_vs_Time", 1, 1)] = y_f
        point_formula = {"t_years": t_f, "y": y_f}
        path = "fallback"

    return tables_add, formulas_add, point_formula, path

# ----------------- main orchestrator -----------------
def build_ten_year_view_gpt(src_root: Any, years_ahead: int = 10, model: str = "gpt-4o-mini", temperature: float = 0.15) -> Dict[str, Any]:
    tables = _normalize_root(src_root)
    start_year = find_start_year_or_now(tables)

    # window dates & quarterly series
    base_dt = find_base_date_or_year_start(tables, start_year)
    start_date_iso, end_date_iso = make_window_dates(start_year, years_ahead, base_dt)
    series = _build_quarterly_series(base_dt, years_ahead)

    years = list(range(start_year, start_year + years_ahead))

    catalog = inventory_scalar_catalog(tables)
    present = catalog["present"]
    user_prompt = build_user_prompt_from_catalog(catalog, start_year, years_ahead)

    system = "You are a precise financial modeling assistant. Follow the schema and hard rules exactly."
    resp = _chat_call(model=model, system=system, user=SCHEMA_MSG + "\n\n" + user_prompt, temperature=temperature, json_mode=True)

    # Validate & prune TenYear rows
    rows = resp.get("rows") or []
    valid_rows = []
    for row in rows:
        label = (row.get("label") or "").strip()
        per_year = row.get("per_year") or {}
        if not label or not isinstance(per_year, dict):
            continue
        ok_years = {}
        for y in years:
            f = per_year.get(str(y))
            if not isinstance(f, str) or not f.strip():
                continue
            if not _only_allowed_ops(f):
                continue
            refs = _formula_refs(f)
            if refs and all(_ref_ok(t, lab, present) for t, lab in refs):
                ok_years[str(y)] = f
        if ok_years:
            valid_rows.append({"label": label, "per_year": ok_years})

    # Ensure required rows; add fallbacks if needed
    need = {"Profit_Margin_YoY", "Total_Profit", "cash_on_hand"}
    have = {r["label"] for r in valid_rows}
    if need - have:
        autofilled = _autofill_required_rows(present, years)
        existing_labels = {r["label"] for r in valid_rows}
        for ar in autofilled:
            if ar["label"] not in existing_labels:
                valid_rows.append(ar)

    if not valid_rows:
        debug = {
            "catalog_tables": catalog.get("tables", []),
            "assumptions_has_growth": has_growth_rate(tables),
            "required_labels_checked": {
                "revenue_keywords": ["revenue", "sales", "turnover", "total_revenue", "topline", "rev"],
                "net_income_keywords": ["net_income", "net_profit", "earnings", "profit_after_tax", "profit", "ebit", "ebitda"],
                "cash_keywords": ["cash", "cash_on_hand", "cash_equivalents", "liquidity"],
            },
            "start_year": start_year,
            "years": years
        }
        raise RuntimeError(
            "All GPT-proposed rows were invalid after validation, and no fallbacks could be constructed.\n"
            + json.dumps(debug, indent=2)
        )

    # Assemble TenYear_View_Cols
    tables_map, formulas_map = _rows_to_wire("TenYear_View_Cols", valid_rows, years)

    # Build the per-point y(x) formula & scaffolding
    pt_tables, pt_formulas, point_formula, path_used = _point_formula_build(catalog, model, temperature)
    tables_map.update(pt_tables)
    formulas_map.update(pt_formulas)

    # Units & annotations
    units = {"TenYear_View_Cols": {}}
    row_labels = [tables_map.get(k("TenYear_View_Cols", 0, r)) for r in range(1, 1 + len(valid_rows))]
    for lab in row_labels:
        if not isinstance(lab, str): 
            continue
        if lab == "Profit_Margin_YoY" or lab.endswith("_YoY") or "Margin" in lab:
            units["TenYear_View_Cols"][lab] = "fraction"
        else:
            units["TenYear_View_Cols"][lab] = "USD"

    annotations = {
        "TenYear_View_Cols": resp.get("notes") or "YoY KPIs built from available scalar labels; growth compounding via discovered growth label when present.",
        "Cash_vs_Time": "y(x) = cash-in-hand as a strict formula. For each series point: set Eval[x]=point.x, then evaluate Cash_vs_Time[y].",
        "series": "Quarterly points across the window; x = hours since window.startDate."
    }

    return {
        "tables": tables_map,
        "formulas": formulas_map,
        "annotations": annotations,
        "units": units,
        "window": {
            "startDate": start_date_iso,
            "endDate": end_date_iso
        },
        "series": series,   # ← NEW: quarterly series in the same style as the quarterly report
        "diagnostics": {
            "start_year": start_year,
            "years": years,
            "uses_growth": has_growth_rate(tables),
            "growth_ref": _find_growth_ref(present),
            "point_formula": point_formula,
            "point_formula_path": path_used
        }
    }

# ----------------- Ion entrypoint -----------------
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
        return 1

    try:
        out = build_ten_year_view_gpt(src_obj, years_ahead=years_ahead, model=str(model), temperature=temperature)
        works.resolve(out)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e), "where": "TenYear_View_Cols"})
        return 1

if __name__ == "__main__":
    sys.exit(_main_ion())
