#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
+Year_View_Cols builder (GPT-driven, label-only refs, growth-aware)

Reads a wells-style dataset (tables with {name, cols, rows, wells[x,y,value,field]}), inventories
all scalar labels per table, and asks GPT to synthesize per-year (years as columns) formulas for
YoY KPIs using ONLY label refs:

  Table[Label]   <-- strictly this format; no quoted labels, no ranges, no functions.

If no explicit per-year series exists for a needed metric, and a growth rate exists in the tables,
the script compounds a base with (1+<Table[Growth_Label]>)^n. If no growth label is found,
we assume a neutral default of 0.0 for fallbacks.

REQUIRED ROWS in the output table "Year_View_Cols":
  - Total_Profit
  - Profit_Margin_YoY
  - cash_on_hand

cash_on_hand semantics:
  - Treat cash as a BALANCE: starting cash balance grows by growth rate and accumulates net income;
    if Base_CapEx exists, subtract Base_CapEx each year (as an annual outflow).
  - Example pattern with both cash base and NI present:
      cash_on_hand_y = <cash_base> * (1+growth)^n + <NI_base> * n - <Base_CapEx> * n

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

# --- OpenAI client ---
from openai import OpenAI


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
def inventory_scalar_catalog(tables: List[dict]) -> Dict[str, Any]:
    """
    Build a catalog of scalar-ish labels per table.
    IMPORTANT: Do NOT filter to identifier-only; keep original labels (spaces/symbols allowed)
    so GPT can reference exactly what exists.
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
Year_View_Cols[1:1][1:1]=(PnL[Net_Income]/PnL[Revenue])-(PnL[Net_Income]/PnL[Revenue])
Year_View_Cols[2:2][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^1/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^1)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^0/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^0)
Year_View_Cols[3:3][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^2/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^2)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^1/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^1)
Year_View_Cols[4:4][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^3/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^3)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^2/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^2)
Year_View_Cols[5:5][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^4/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^4)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^3/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^3)
Year_View_Cols[6:6][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^5/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^5)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^4/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^4)
Year_View_Cols[7:7][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^6/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^6)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^5/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^5)
Year_View_Cols[8:8][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^7/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^7)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^6/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^6)
Year_View_Cols[9:9][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^8/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^8)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^7/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^7)
Year_View_Cols[10:10][1:1]=(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^9/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^9)-(PnL[Net_Income]*(1+Assumptions[Annual_Growth_Rate])^8/PnL[Revenue]*(1+Assumptions[Annual_Growth_Rate])^8)
Year_View_Cols[1:1][3:3]  = Capital_Assumptions[Initial_Capital_Investment] + Year_View_Cols[Total_Profit, Y2025]
Year_View_Cols[2:2][3:3]  = Year_View_Cols[Cash, Y2025] + Year_View_Cols[Total_Profit, Y2026]
Year_View_Cols[3:3][3:3]  = Year_View_Cols[Cash, Y2026] + Year_View_Cols[Total_Profit, Y2027]
Year_View_Cols[4:4][3:3]  = Year_View_Cols[Cash, Y2027] + Year_View_Cols[Total_Profit, Y2028]
Year_View_Cols[5:5][3:3]  = Year_View_Cols[Cash, Y2028] + Year_View_Cols[Total_Profit, Y2029]
Year_View_Cols[6:6][3:3]  = Year_View_Cols[Cash, Y2029] + Year_View_Cols[Total_Profit, Y2030]
Year_View_Cols[7:7][3:3]  = Year_View_Cols[Cash, Y2030] + Year_View_Cols[Total_Profit, Y2031]
Year_View_Cols[8:8][3:3]  = Year_View_Cols[Cash, Y2031] + Year_View_Cols[Total_Profit, Y2032]
Year_View_Cols[9:9][3:3]  = Year_View_Cols[Cash, Y2032] + Year_View_Cols[Total_Profit, Y2033]
Year_View_Cols[10:10][3:3] = Year_View_Cols[Cash, Y2033] + Year_View_Cols[Total_Profit, Y2034]


FORMULA RULES (STRICT):
- References MUST be exactly: Table[Label]  (no quotes inside brackets, no ranges, no dot notation).
  Labels may contain spaces/symbols if they appear that way in the catalog—use them exactly as listed.
- Allowed operators: + - * / ^ and parentheses ONLY. No functions (e.g., SUM, IF) of any kind.
- Labels you reference MUST appear in the provided catalog under that table's scalar_labels.
- Provide at least these rows: Profit_Margin_YoY, Total_Profit, cash_on_hand.
- Prefer 2–4 additional YoY rows if supported (e.g., Revenue_YoY, Net_Income_YoY, EBITDA_YoY, Gross_Margin_YoY).
- Use the full year range from start_year to (start_year + years_ahead), inclusive.

GROWTH LOGIC (MANDATORY WHEN APPLICABLE):
- If a growth rate label exists anywhere in the catalog, and NO explicit per-year series exists
  for a needed metric, compound a base value using:
    Base * (1 + <Table[Growth_Label]>)^n
  where n = year_index (0 for start_year).
- Choose a sensible Base from the catalog (e.g., PnL[Revenue], PnL[Net Income], Revenue[Total], Balance_Sheet[Cash]).
- Example pattern (illustrative): NetIncome_y = PnL[Net Income] * (1+Assumptions[Annual_Growth_Rate])^n

SEMANTICS:
- Total_Profit[YYYY] represents a net-income–like measure (prefer PnL[Net Income]; fall back to EBITDA if needed).
- Profit_Margin_YoY[YYYY] = (NetIncome_y / Revenue_y) - (NetIncome_prev / Revenue_prev).
  For the first year, use a self-cancelling formula like (A/B)-(A/B) to produce 0.
- cash_on_hand[YYYY] represents an available cash balance. Prefer Balance_Sheet[Cash] or a similar cash label; if absent, compound a reasonable cash base using the discovered growth rate.
- If Base_CapEx exists, subtract Base_CapEx each year (as an annual outflow).
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
# Allow labels with spaces/symbols inside brackets (anything except closing bracket)
_LABEL_REF_RE = re.compile(r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>[^\]]+)\]')

# Allowed chars in formulas: numbers, letters, underscores, + - * / ^ ( ) [ ] . spaces
# (dot left only for numeric literals; we still ban function-like tokens)
# _ALLOWED_CHARS_RE = re.compile(r'^[0-9A-Za-z_\+\-\*\/\^\(\)\[\]\.\s]+$')
_ALLOWED_CHARS_RE = re.compile(r'^[0-9A-Za-z_\+\-\*\/\^\(\)\[\]\.\=\s]+$')


def _ref_ok(table: str, label: str, present: Dict[str, Dict[str, Set[str]]]) -> bool:
    # exact presence required as listed in the catalog
    return table in present and label in present[table]["scalars"]


def _formula_refs(formula: str) -> List[Tuple[str, str]]:
    return [(m.group("table"), m.group("label")) for m in _LABEL_REF_RE.finditer(formula or "")]


def _only_allowed_ops(formula: str) -> bool:
    if not _ALLOWED_CHARS_RE.match(formula or ""):
        return False
    # forbid function-like tokens e.g., SUM( ... ), IF( ... ), etc.
    if re.search(r'[A-Za-z_][A-Za-z0-9_]*\s*\(', formula):
        return False
    # forbid dot-notation references like Table.Label
    if re.search(r'[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]', formula):
        return False
    # forbid quotes inside brackets (enforces Table[Label] not Table["Label"])
    if re.search(r'\[[^\]]*["\']+[^\]]*\]', formula):
        return False
    return True


# ----------------- growth discovery -----------------
def _find_growth_ref(present: Dict[str, Dict[str, Set[str]]]) -> Optional[str]:
    """
    Return a label reference like Table[Label] for a growth rate if found.
    Preference order:
      1) Assumptions[Growth_Rate]
      2) Assumptions[Annual_Growth_Rate] (and spaced variants)
      3) Any table with a label containing growth keywords (growth_rate, annual_growth_rate, cagr, growth_percent, growth)
         preferring the Assumptions table if present.
    """
    if "Assumptions" in present:
        if "Growth_Rate" in present["Assumptions"]["scalars"]:
            return "Assumptions[Growth_Rate]"
        if "Annual_Growth_Rate" in present["Assumptions"]["scalars"]:
            return "Assumptions[Annual_Growth_Rate]"
        if "Annual Growth Rate" in present["Assumptions"]["scalars"]:
            return "Assumptions[Annual Growth Rate]"
        if "Growth Rate" in present["Assumptions"]["scalars"]:
            return "Assumptions[Growth Rate]"
    # fuzzy search
    kws = ["growth_rate", "annual_growth_rate", "cagr", "growth_percent", "growth"]

    def _norm_local(s: str) -> str:
        return re.sub(r'[^A-Za-z0-9_]', '_', s).lower()

    if "Assumptions" in present:
        for lab in present["Assumptions"]["scalars"]:
            nl = _norm_local(lab)
            if any(kw in nl for kw in kws):
                return f"Assumptions[{lab}]"
    for tname, info in present.items():
        for lab in info["scalars"]:
            nl = _norm_local(lab)
            if any(kw in nl for kw in kws):
                return f"{tname}[{lab}]"
    return None


def _growth_term_or_default(present: Dict[str, Dict[str, Set[str]]], default: float = 0.0) -> str:
    ref = _find_growth_ref(present)
    if ref:
        return f"(1+{ref})"
    return f"(1+{default})"


# ----------------- fallback builders (growth-aware) -----------------
def _select_base(present: Dict[str, Dict[str, Set[str]]], candidates: List[Tuple[str, str]]) -> Optional[str]:
    for tname, label in candidates:
        if tname in present and label in present[tname]["scalars"]:
            return f"{tname}[{label}]"
    return None


def _norm(s: str) -> str:
    return re.sub(r'[^A-Za-z0-9_]', '_', s).strip('_').replace('__', '_').lower()


def _select_base_loose(
    present: Dict[str, Dict[str, Set[str]]],
    *,
    prefer_tables: List[str],
    label_keywords: List[str],
) -> Optional[str]:
    """
    Fuzzy selector: try tables in preferred order; within each, pick first label
    whose normalized text contains any keyword.
    """
    kws = [_norm(kw) for kw in label_keywords]

    def match(label: str) -> bool:
        nl = _norm(label)
        return any(kw in nl for kw in kws)

    for tname in prefer_tables:
        if tname not in present:
            continue
        for lab in present[tname]["scalars"]:
            if match(lab):
                return f"{tname}[{lab}]"
    # Last resort: search all tables
    for tname, info in present.items():
        for lab in info["scalars"]:
            if match(lab):
                return f"{tname}[{lab}]"
    return None


def _merge_required_rows_and_fill_years(
    valid_rows: List[Dict[str, Dict[str, str]]],
    present: Dict[str, Dict[str, Set[str]]],
    years: List[int],
) -> List[Dict[str, Dict[str, str]]]:
    """
    Ensure required rows (Total_Profit, Profit_Margin_YoY, cash_on_hand) exist
    and have formulas for *all* years.

    Strategy:
      - Build fallback rows via _autofill_required_rows (growth-aware, with cash_on_hand).
      - For each fallback row:
          * If label not in valid_rows -> append entire row.
          * If label already exists -> only fill missing year entries.
    """
    fallback_rows = _autofill_required_rows(present, years)

    # Map by label for quick access
    label_to_valid = {r["label"]: r for r in valid_rows}
    label_to_fallback = {r["label"]: r for r in fallback_rows}

    for lab, fr in label_to_fallback.items():
        fb_per_year = fr.get("per_year", {}) or {}
        if lab not in label_to_valid:
            # No GPT row: just append the fallback row
            valid_rows.append({
                "label": lab,
                "per_year": dict(fb_per_year),
            })
            continue

        # Merge into existing GPT row
        vr = label_to_valid[lab]
        vr_per_year = vr.setdefault("per_year", {})
        for y, expr in fb_per_year.items():
            # Fill missing or empty year slots only
            if not isinstance(vr_per_year.get(y), str) or not vr_per_year.get(y, "").strip():
                vr_per_year[y] = expr

    return valid_rows


def _autofill_required_rows(present: Dict[str, Dict[str, Set[str]]], years: List[int]) -> List[Dict[str, Dict[str, str]]]:
    """
    Ensure we have Total_Profit, Profit_Margin_YoY, and cash_on_hand.

    Total_Profit:
      - Built from a net-income-like base ni_base with growth: ni_base * g^idx

    Profit_Margin_YoY:
      - (NetIncome_y / Revenue_y) - (NetIncome_prev / Revenue_prev)

    cash_on_hand:
      - Starting balance is ONLY:
          • Capital_Assumptions[Initial_Capital_Investment_USD] or similar
          • OR Balance_Sheet/BS Cash or Total_Cash
          • OR 0 if nothing available
      - If Capital_Assumptions[Minimum_Cash_Reserve_USD] exists AND
        Capital_Assumptions[Initial_Capital_Investment_USD] exists, then
        starting balance is:

          =Capital_Assumptions[Initial_Capital_Investment_USD]
           -Capital_Assumptions[Minimum_Cash_Reserve_USD]

      - Per year n:
          = <starting_balance_expr> + (ni_base*(1^0)+...+ni_base*(1^n))
            - Base_CapEx*(n+1)   (if Base_CapEx exists)
    """
    rows: List[Dict[str, Dict[str, str]]] = []

    # --- helper: discover a good "initial capital" / starting cash reference ---
    def _initial_capital_ref(present: Dict[str, Dict[str, Set[str]]]) -> Optional[str]:
        # 1) Look in Capital_Assumptions for explicit initial capital / cash
        if "Capital_Assumptions" in present:
            scalars = present["Capital_Assumptions"]["scalars"]

            # Hard-prefer this exact label
            if "Initial_Capital_Investment_USD" in scalars:
                return "Capital_Assumptions[Initial_Capital_Investment_USD]"

            # Other obvious initial-capital-ish labels
            preferred_caps = [
                "Initial_Capital_Investment",
                "Initial_Capital_Raise_USD",
                "Initial_Equity_Raise_USD",
                "Initial_Cash_Balance_USD",
                "Initial_Cash_Balance",
                "Initial_Cash",
                "Initial_Capital",
            ]
            for p in preferred_caps:
                if p in scalars:
                    return f"Capital_Assumptions[{p}]"

            # Fuzzy: "initial" + ("capital" or "cash" or "equity")
            for lab in scalars:
                nl = _norm(lab)
                if "initial" in nl and ("capital" in nl or "cash" in nl or "equity" in nl):
                    return f"Capital_Assumptions[{lab}]"

        # 2) If no Capital_Assumptions, fall back ONLY to Balance Sheet cash
        for tname, label in [
            ("Balance_Sheet", "Total_Cash"),
            ("Balance Sheet", "Total_Cash"),
            ("BS", "Total_Cash"),
            ("Balance_Sheet", "Cash"),
            ("Balance Sheet", "Cash"),
            ("BS", "Cash"),
        ]:
            if tname in present and label in present[tname]["scalars"]:
                return f"{tname}[{label}]"

        # 3) Otherwise, no initial capital; we'll treat it as 0
        return None

    # --- discover revenue & net-income bases ---
    rev_base = _select_base(present, [
        ("PnL", "Revenue"),
        ("Profit_and_Loss", "Revenue"),
        ("Revenue", "Total"),
        ("Revenue", "Revenue"),
        ("IS", "Revenue"),
        ("Income_Statement", "Revenue"),
        ("PL", "Revenue"),
        ("P_L", "Revenue"),
        ("Income Statement", "Revenue"),
    ])
    ni_base = _select_base(present, [
        ("PnL", "Net_Income"),
        ("Profit_and_Loss", "Net_Income"),
        ("Net_Income", "Total"),
        ("PnL", "EBITDA"),
        ("IS", "Net_Income"),
        ("Income_Statement", "Net_Income"),
        ("PnL", "Profit"),
        ("Income Statement", "Net Income"),
    ])

    # Loose/fuzzy if not found
    if not rev_base:
        rev_base = _select_base_loose(
            present,
            prefer_tables=["PnL", "Profit_and_Loss", "IS", "Income_Statement", "Income Statement", "Revenue"],
            label_keywords=["revenue", "sales", "turnover", "total_revenue", "topline", "rev"],
        )
    if not ni_base:
        ni_base = _select_base_loose(
            present,
            prefer_tables=["PnL", "Profit_and_Loss", "IS", "Income_Statement", "Income Statement"],
            label_keywords=["net_income", "net_profit", "earnings", "profit_after_tax", "profit", "ebit", "ebitda"],
        )

    # Initial capital reference (STRICT: no COGS / random PnL fallback)
    init_cap = _initial_capital_ref(present)

    # Minimum cash reserve (if present)
    min_reserve: Optional[str] = None
    if "Capital_Assumptions" in present and "Minimum_Cash_Reserve_USD" in present["Capital_Assumptions"]["scalars"]:
        min_reserve = "Capital_Assumptions[Minimum_Cash_Reserve_USD]"

    # Growth term for Total_Profit / Profit_Margin_YoY
    g = _growth_term_or_default(present, default=0.0)

    # 1) Total_Profit (net-income-like, growth-aware)
    if ni_base:
        per_year_tp: Dict[str, str] = {}
        for idx, y in enumerate(years):
            per_year_tp[str(y)] = f"{ni_base}*{g}^{idx}"
        rows.append({"label": "Total_Profit", "per_year": per_year_tp})

    # 2) Profit_Margin_YoY (only if both bases exist)
    if rev_base and ni_base:
        per_year_pm: Dict[str, str] = {}
        for idx, y in enumerate(years):
            ny = f"{ni_base}*{g}^{idx}"
            ry = f"{rev_base}*{g}^{idx}"
            if idx == 0:
                per_year_pm[str(y)] = f"({ny}/{ry})-({ny}/{ry})"  # 0 in a structural way
            else:
                nyp = f"{ni_base}*{g}^{idx-1}"
                ryp = f"{rev_base}*{g}^{idx-1}"
                per_year_pm[str(y)] = f"({ny}/{ry})-({nyp}/{ryp})"
        rows.append({"label": "Profit_Margin_YoY", "per_year": per_year_pm})

    # 3) cash_on_hand

    # Find Base_CapEx reference if present
    capex_ref: Optional[str] = None
    if "Assumptions" in present and "Base_CapEx" in present["Assumptions"]["scalars"]:
        capex_ref = "Assumptions[Base_CapEx]"
    else:
        for tname, info in present.items():
            for lab in info["scalars"]:
                if _norm(lab) == "base_capex":
                    capex_ref = f"{tname}[{lab}]"
                    break
            if capex_ref:
                break

    # Build starting cash expression (single base used for all years)
    def _starting_cash_expr() -> str:
        # If both initial capital *and* minimum cash reserve exist in Capital_Assumptions,
        # force the pattern:
        #   =Capital_Assumptions[Initial_Capital_Investment_USD]-Capital_Assumptions[Minimum_Cash_Reserve_USD]
        if init_cap == "Capital_Assumptions[Initial_Capital_Investment_USD]" and min_reserve:
            return f"=Capital_Assumptions[Initial_Capital_Investment_USD]-{min_reserve}"
        # Otherwise, just use whatever init_cap we have
        if init_cap:
            return f"={init_cap}"
        # Otherwise, start at 0
        return "=0"

    base_expr = _starting_cash_expr()
    per_year_cash: Dict[str, str] = {}

    for idx, y in enumerate(years):
        # inner sum of profit terms: ni_base*(1^0)+...+ni_base*(1^idx)
        inner_sum = None
        if ni_base:
            terms = [f"{ni_base}*(1^{i})" for i in range(0, idx + 1)]
            inner_sum = "(" + "+".join(terms) + ")" if terms else None

        expr = base_expr

        # add cumulative profit part if present
        if inner_sum:
            expr += f"+{inner_sum}"

        # subtract Base_CapEx*(n+1) if we have a capex_ref
        if capex_ref:
            expr += f"-{capex_ref}*{idx+1}"

        # extreme edge case: no init_cap, no ni_base, no capex -> force a safe zero
        if expr == "=0" and not ni_base and not capex_ref:
            expr = "=(1^0)-(1^0)"

        per_year_cash[str(y)] = expr.replace(" ", "")

    rows.append({"label": "cash_on_hand", "per_year": per_year_cash})

    return rows


# ----------------- row assembly -----------------
def _rows_to_wire(table_name: str, rows: List[Dict[str, Dict[str, str]]], years: List[int]) -> Tuple[Dict[str, Any], Dict[str, str]]:
    tables: Dict[str, Any] = {k(table_name, 0, 0): "Label"}
    formulas: Dict[str, str] = {}

    # headers: YYYYY
    for c, y in enumerate(years, start=1):
        tables[k(table_name, c, 0)] = f"Y{y}"

    # rows in provided order
    r = 1
    for row in rows:
        lab = re.sub(r"\s+", "_", row["label"].strip())
        tables[k(table_name, 0, r)] = lab
        per_year = row.get("per_year", {})
        for c, y in enumerate(years, start=1):
            expr = per_year.get(str(y))
            if isinstance(expr, str) and expr.strip():
                # Keep original spacing but strip unnecessary whitespace
                formulas[k(table_name, c, r)] = re.sub(r"\s+", "", expr)
        r += 1
    return tables, formulas


# ----------------- main orchestrator -----------------
def build_ten_year_view_gpt(src_root: Any, years_ahead: int = 11, model: str = "gpt-4o-mini", temperature: float = 0.15) -> Dict[str, Any]:
    tables = _normalize_root(src_root)
    start_year = find_start_year_or_now(tables)
    years = list(range(start_year, start_year + years_ahead))

    catalog = inventory_scalar_catalog(tables)
    present = catalog["present"]
    user_prompt = build_user_prompt_from_catalog(catalog, start_year, years_ahead)

    system = "You are a precise financial modeling assistant. Follow the schema and hard rules exactly."
    resp = _chat_call(model=model, system=system, user=SCHEMA_MSG + "\n\n" + user_prompt, temperature=temperature, json_mode=True)

    # Validate & prune
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
            if refs and all(_ref_ok(t, lab, present) for t, lab in refs):
                ok_years[str(y)] = f
        if ok_years:
            valid_rows.append({"label": label, "per_year": ok_years})

    valid_rows = _merge_required_rows_and_fill_years(valid_rows, present, years)

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

    # Assemble wire
    tables_map, formulas_map = _rows_to_wire("Year_View_Cols", valid_rows, years)

    # Minimal units & annotations
    units = {"Year_View_Cols": {}}
    row_labels = [tables_map[k("Year_View_Cols", 0, r)] for r in range(1, 1 + len(valid_rows))]
    for lab in row_labels:
        if lab == "Profit_Margin_YoY" or lab.endswith("_YoY") or "Margin" in lab:
            units["Year_View_Cols"][lab] = "fraction"
        else:
            units["Year_View_Cols"][lab] = "USD"

    annotations = {
        "Year_View_Cols": resp.get("notes") or "YoY KPIs built from available scalar labels; growth compounding via discovered growth label when present."
    }

    return {
        "tables": tables_map,
        "formulas": formulas_map,
        "annotations": annotations,
        "units": units,
        "diagnostics": {
            "start_year": start_year,
            "years": years,
            "uses_growth": has_growth_rate(tables),
            "growth_ref": _find_growth_ref(present)
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
        return 1  # <<< no re-raise

    try:
        out = build_ten_year_view_gpt(src_obj, years_ahead=years_ahead, model=str(model), temperature=temperature)
        works.resolve(out)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e), "where": "Year_View_Cols"})
        return 1 


if __name__ == "__main__":
    sys.exit(_main_ion())
