#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Ion Works: generalized suggester (target-safe, 2-column tables, >=5 formulas, >=2 Assumptions refs per model)

Input  (Ion):
  param(1): JSON array of tables: [{ "name": "...", "cols": N, "rows": M, "wells": [{x,y,value,field:[...]}] }, ...]

Output (Ion):
  works.resolve({
    "metadata": {...},
    "next_models": [
      {
        "label": "...",
        "description": "...",
        "rationale": "...",
        "tables": { "<Model>[0:0][0:0]": "Label", "<Model>[1:1][0:0]": "Value",
                    "<Model>[0:0][1:1]": "RowLabel1", "<Model>[1:1][1:1]": "<formula or default>", ... },
        "formulas": { "<Model>[1:1][1:1]": "<formula>", "<Model>[1:1][2:2]": "<formula>", ... },
        "formula_pairs": [{"label":"...", "formula":"..."}],
        "annotations": {"<Model>": "..."},
        "units": {"<Model>": {}},
        "confidence": 0.0-1.0,
        "category": "..."
      }, ...
    ]
  })

Rules enforced:
- NEVER write formulas into input tables (LHS always a new model table).
- Each model returns a strictly two-column grid (Label/Value).
- Each model has >=5 formula rows total.
- Each model has >=2 formulas that reference Assumptions[...] on the RHS.
- RHS may reference input tables (e.g., Assumptions[...]) and/or constants/defaults.
"""

import os
import re
import json
from typing import Any, Dict, List, Optional, Tuple

from ion import works  # type: ignore

# ---------- Optional LLM (ChatGPT) ----------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

def call_llm(prompt: str, system: str = "You are a meticulous modeling assistant.") -> Optional[str]:
    if not OPENAI_API_KEY:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0.2,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content
    except Exception as e:
        works.msg(f"LLM call failed: {e}")
        return None

# ---------- Parsing helpers ----------
def _ensure_list(obj: Any) -> List[Dict[str, Any]]:
    if isinstance(obj, list):
        return obj
    raise ValueError("Input must be a JSON array of tables.")

def _extract_json_slice(raw: str):
    for opener, closer in (("[", "]"), ("{", "}")):
        if opener in raw and closer in raw:
            start, end = raw.find(opener), raw.rfind(closer)
            if 0 <= start < end:
                try:
                    return json.loads(raw[start : end + 1])
                except Exception:
                    pass
    return None

def _load_tables_from_param(raw: Optional[str]) -> List[Dict[str, Any]]:
    if raw is None:
        raise ValueError("Missing param(1) with tables JSON.")
    raw = str(raw).strip()
    try:
        return _ensure_list(json.loads(raw))
    except Exception:
        pass
    sl = _extract_json_slice(raw)
    if isinstance(sl, list):
        return sl
    raise ValueError("Could not parse param(1) into a list of tables.")

def extract_row_labels(table: Dict[str, Any]) -> List[str]:
    labels = []
    for w in table.get("wells", []):
        if w.get("x") == 0 and (w.get("y") or 0) >= 1 and isinstance(w.get("value"), str):
            labels.append(w["value"])
    return labels

def extract_all_labels(tables: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for t in tables:
        out[t.get("name", "table")] = extract_row_labels(t)
    return out

def flatten_labels(label_map: Dict[str, List[str]]) -> List[str]:
    return [f"{t}[{l}]" for t, lbls in label_map.items() for l in lbls]

def input_table_names(tables: List[Dict[str, Any]]) -> List[str]:
    return [t.get("name", "table") for t in tables]

# ---------- Naming & coordinates ----------
COORD_RX = re.compile(r"^([A-Za-z0-9_]+)\[(\d+:\d+)\]\[(\d+:\d+)\]$")

def sanitize_name(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_]", "_", name or "Model").strip("_")
    return s or "Model"

def unique_new_table_name(label: str, forbidden: List[str]) -> str:
    base = sanitize_name(label or "Model")
    if base not in forbidden:
        return base
    cand = base + "_Out"
    i = 2
    while cand in forbidden:
        cand = f"{base}_Out{i}"
        i += 1
    return cand

# ---------- Short, qualitative labels from formulas ----------
REF_RX = re.compile(r"([A-Za-z0-9_]+)\[([A-Za-z0-9_ ]+)\]")
FUNC_RX = re.compile(r"([A-Z]{2,})\s*\(")

def _tok(s: str) -> str:
    s = s.strip().replace(" ", "_")
    s = re.sub(r"[^A-Za-z0-9_]", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s[:32]  # concise

def _refs(expr: str) -> List[str]:
    return [_tok(m.group(2)) for m in REF_RX.finditer(expr)]

def _first2(xs: List[str]) -> List[str]:
    return xs[:2] if xs else xs

def label_from_formula(expr: str, fallback_idx: int = 1) -> str:
    e = expr.strip()
    EU = e.upper()
    refs = _refs(e)
    r2 = _first2(refs)

    # Special/common cases
    if EU.startswith("EDATE("):
        return "End_Date"
    if EU.startswith("YEAR(") and refs:
        return f"Year_{r2[0]}"

    # Arithmetic shapes (tight, qualitative)
    if "*" in e and not any(op in e for op in "/+-"):
        return f"{r2[0]}_x_{r2[1]}" if len(r2) >= 2 else "Product"
    if "/" in e and not any(op in e for op in "*+-"):
        parts = [p.strip() for p in e.split("/")]
        left = _refs(parts[0]) or [_tok(parts[0])]
        right = _refs(parts[1]) or [_tok(parts[1])]
        return f"{left[0]}_per_{right[0]}"
    if "+" in e and "SUM(" not in EU:
        return f"Sum_{'_'.join(r2)}" if r2 else "Sum"
    if "-" in e and not any(op in e for op in "*/+"):
        return f"Diff_{'_'.join(r2)}" if r2 else "Diff"

    # Function names
    m = FUNC_RX.search(EU)
    if m:
        fn = m.group(1)
        if fn == "SUM":
            return f"Sum_{'_'.join(r2)}" if r2 else "Sum"
        if fn in ("AVG", "AVERAGE"):
            return f"Avg_{'_'.join(r2)}" if r2 else "Avg"
        if fn.startswith("COUNTIF"):
            return "Count_Matching"
        if fn == "LEN":
            return f"Len_{r2[0]}" if r2 else "Len"

    # Mixed / fallback
    if refs:
        return f"Calc_{'_'.join(r2)}"
    return f"Calc_{fallback_idx}"

# ---------- Model placeholder alias (NEW) ----------
MODEL_TOKEN_RX = re.compile(r'(?<![A-Za-z0-9_])Model(?=\s*\[)')

def _rewrite_placeholder_model(expr: str, model_name: str) -> str:
    """Treat 'Model[...]' as an alias for the current model table name."""
    return MODEL_TOKEN_RX.sub(model_name, str(expr))

# ---------- Two-column table builder ----------
def build_two_col_model(model_table: str, rows: List[Tuple[str, str]]) -> Tuple[Dict[str,str], Dict[str,str]]:
    """
    rows: list of (RowLabel, ValueOrFormulaString)
    Returns (tables_map, formulas_map).
      - tables_map enforces two columns:
          model[0:0][0:0] = "Label"
          model[1:1][0:0] = "Value"
          model[0:0][i:i] = RowLabel
          model[1:1][i:i] = ValueOrFormulaString
      - formulas_map contains entries ONLY for rows that are formulas.
    """
    tables_map: Dict[str,str] = {
        f"{model_table}[0:0][0:0]": "Label",
        f"{model_table}[1:1][0:0]": "Value",
    }
    formulas_map: Dict[str,str] = {}
    for i, (lbl, val) in enumerate(rows, start=1):
        # --- NEW: make 'Model[...]' mean "this table" ---
        v = _rewrite_placeholder_model(str(val), model_table)

        tables_map[f"{model_table}[0:0][{i}:{i}]"] = lbl
        tables_map[f"{model_table}[1:1][{i}:{i}]"] = v
        # detect formulas (letters/operators or [Table[Field]])
        is_num = False
        try:
            float(v.strip())
            is_num = True
        except Exception:
            is_num = False
        looks_formula = ("[" in v) or any(op in v for op in " + - * / ( ) EDATE YEAR COUNTIF COUNTIFS RSQ LEN AVG AVERAGE SUM ".split())
        if looks_formula and not is_num:
            formulas_map[f"{model_table}[1:1][{i}:{i}]"] = v
    return tables_map, formulas_map

# ---------- Assumptions-ref enforcement (>=2 per model) ----------
def ensure_min_two_assumption_refs(rows: List[Tuple[str, str]],
                                   a_labels: List[str],
                                   model: str) -> List[Tuple[str, str]]:
    """Append labeled formulas that reference Assumptions[...] until we have at least 2 in this model."""
    def uses_assumptions(expr: str) -> bool:
        return "Assumptions[" in expr

    count = sum(1 for _, v in rows if uses_assumptions(str(v)))
    if count >= 2:
        return rows

    have = set(a_labels).__contains__
    # Candidate assumption-driven formulas (do not depend on existing model rows to remain safe)
    candidates: List[str] = []
    if have("Annual_Growth_Rate") and have("Opex_USD"):
        candidates.append("Assumptions[Opex_USD]*(1+Assumptions[Annual_Growth_Rate])")
    if have("Tax_Rate") and have("Capex_USD"):
        candidates.append("Assumptions[Capex_USD]*(1+Assumptions[Tax_Rate])")
    if have("Price_per_Oligo_USD") and have("Volume_Oligos_per_Month"):
        candidates.append("Assumptions[Price_per_Oligo_USD]*Assumptions[Volume_Oligos_per_Month]")
    if have("Users") and have("ARPU_USD"):
        candidates.append("Assumptions[Users]*Assumptions[ARPU_USD]")
    if have("Paid_Media_Budget_USD") and have("Tax_Rate"):
        candidates.append("Assumptions[Paid_Media_Budget_USD]*(1+Assumptions[Tax_Rate])")
    if have("Duration_Months"):
        candidates.append("Assumptions[Duration_Months]*30")
    if have("Discount_Rate") and have("Capex_USD"):
        candidates.append("Assumptions[Capex_USD]/(1+Assumptions[Discount_Rate])")

    # Generic fallbacks if assumptions sparse
    if not candidates:
        candidates = [
            "1*Assumptions[Annual_Growth_Rate]" if have("Annual_Growth_Rate") else "0+0",
            "1*Assumptions[Tax_Rate]" if have("Tax_Rate") else "1*1",
            "Assumptions[Duration_Months]*30" if have("Duration_Months") else "10/2",
        ]

    i = 0
    while count < 2 and i < len(candidates):
        expr = candidates[i]
        lbl = label_from_formula(expr, fallback_idx=len(rows) + 1)
        rows.append((lbl, expr))
        count += 1 if uses_assumptions(expr) else 0
        i += 1

    # If still short (extreme sparse assumptions), add neutral assumption-based fillers
    j = 0
    while count < 2:
        expr = "1*Assumptions[Annual_Growth_Rate]" if have("Annual_Growth_Rate") else "1*Assumptions[Tax_Rate]" if have("Tax_Rate") else "Assumptions[Duration_Months]*0"
        lbl = label_from_formula(expr, fallback_idx=len(rows) + 1 + j)
        rows.append((lbl, expr))
        count += 1
        j += 1

    return rows

# ---------- Labeled fillers to reach >=5 formulas ----------
def labeled_fillers(a_labels: List[str]) -> List[Tuple[str, str]]:
    have = set(a_labels).__contains__
    pairs: List[Tuple[str, str]] = []
    # Safe, assumption-driven first
    if have("Audience_Size") and have("Reach_Percentage"):
        expr = "Assumptions[Audience_Size]*Assumptions[Reach_Percentage]"
        pairs.append((label_from_formula(expr), expr))
    if have("Audience_Size") and have("Reach_Percentage") and have("Impressions_Per_User"):
        expr = "Assumptions[Audience_Size]*Assumptions[Reach_Percentage]*Assumptions[Impressions_Per_User]"
        pairs.append((label_from_formula(expr), expr))
    if have("Click_Through_Rate") and have("Impressions_Per_User") and have("Audience_Size") and have("Reach_Percentage"):
        expr = ("Assumptions[Audience_Size]*Assumptions[Reach_Percentage]*"
                "Assumptions[Impressions_Per_User]*Assumptions[Click_Through_Rate]")
        pairs.append((label_from_formula(expr), expr))
    if have("Duration_Months"):
        expr = "Assumptions[Duration_Months]*30"
        pairs.append((label_from_formula(expr), expr))
    if have("Tax_Rate") and have("Paid_Media_Budget_USD"):
        expr = "Assumptions[Paid_Media_Budget_USD]*(1+Assumptions[Tax_Rate])"
        pairs.append((label_from_formula(expr), expr))
    # Generic if assumptions sparse
    if not pairs:
        gens = ["0+0", "1*1", "10/2", "SUM(1,2,3)", "AVG(1,2,3)"]
        pairs = [(label_from_formula(g, i+1), g) for i, g in enumerate(gens)]
    return pairs

# ---------- Self-reference rewriter (kept feature) ----------
def _rewrite_self_refs_expr(expr: str, old_names: List[str], new_name: str) -> str:
    s = str(expr)
    for old in old_names:
        if not old:
            continue
        # Replace table tokens 'OldName[' with 'NewName[' when OldName is a standalone table token
        pat = re.compile(rf'(?<![A-Za-z0-9_]){re.escape(old)}\s*(?=\[)')
        s = pat.sub(new_name, s)
    return s

def _rewrite_rows_self_refs(rows: List[Tuple[str, str]], old_names: List[str], new_name: str) -> List[Tuple[str, str]]:
    return [(lbl, _rewrite_self_refs_expr(val, old_names, new_name)) for (lbl, val) in rows]

def _old_name_variants(name: str) -> List[str]:
    if not name:
        return []
    return list(dict.fromkeys([
        name,
        sanitize_name(name),
        re.sub(r'\s+', '_', name.strip()),
        re.sub(r'[^A-Za-z0-9_]', '_', name.strip()),
    ]))

# ---------- Heuristic models (base 3; always new tables, 2 columns, >=5 formulas, >=2 assumption refs) ----------
def heuristic_models(tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    label_map = extract_all_labels(tables)
    a_labels = label_map.get("Assumptions", [])
    forbidden = input_table_names(tables)

    A = lambda x: f"Assumptions[{x}]"
    have = set(a_labels).__contains__
    def pick(name, default): return name if have(name) else default

    suggestions: List[Dict[str, Any]] = []

    # Budget Model
    model = unique_new_table_name("Budget", forbidden)
    forbidden.append(model)
    budget_rows: List[Tuple[str, str]] = [
        ("Total_Budget",
         " + ".join([A(n) for n in [
             "Paid_Media_Budget_USD","Content_Budget_USD","Events_Budget_USD",
             "Communications_Budget_USD","Technology_Tools_Budget_USD","External_Services_Budget_USD",
             "Opex_USD","Capex_USD"
          ] if have(n)]) or "0"),
        ("Monthly_Run_Rate",
         f"{model}[Total_Budget]/{A(pick('Duration_Months','Duration_Months'))}"),
        ("After_Tax_Budget",
         f"{model}[Total_Budget]*(1+{A(pick('Tax_Rate','Tax_Rate'))})"),
        ("Contingency_AddOn",
         f"{model}[Total_Budget]*{A(pick('Contingency_Rate','Contingency_Rate'))}" if have("Contingency_Rate") else "0"),
        ("All_In_Budget",
         f"{model}[After_Tax_Budget]+{model}[Contingency_AddOn]")
    ]
    # Ensure >=2 Assumptions refs
    budget_rows = ensure_min_two_assumption_refs(budget_rows, a_labels, model)
    b_tables, b_formulas = build_two_col_model(model, budget_rows)
    b_pairs = [{"label": l, "formula": v} for (l, v) in budget_rows]
    suggestions.append({
        "label": "Budget Model",
        "description": "Roll up budgets with tax and contingency adjustments.",
        "rationale": "Budget-like assumption fields detected.",
        "tables": b_tables,
        "formulas": b_formulas,
        "formula_pairs": b_pairs,
        "annotations": {model: "Auto-generated Budget model (2-column)."},
        "units": {model: {}},
        "confidence": 0.82 if a_labels else 0.65,
        "category": "finance/budgeting",
    })

    # Forecast Model
    model = unique_new_table_name("Forecast", forbidden)
    forbidden.append(model)
    forecast_rows: List[Tuple[str, str]] = [
        ("Reachable_Audience",
         f"{A(pick('Audience_Size','Audience_Size'))}*{A(pick('Reach_Percentage','Reach_Percentage'))}"),
        ("Projected_Impressions",
         f"{model}[Reachable_Audience]*{A(pick('Impressions_Per_User','Impressions_Per_User'))}"),
        ("Projected_Clicks",
         f"{model}[Projected_Impressions]*{A(pick('Click_Through_Rate','Click_Through_Rate'))}"),
        ("Projected_Conversions",
         f"{model}[Projected_Clicks]*{A(pick('Conversion_Rate','Conversion_Rate'))}"),
        ("CPM_Spend",
         f"{model}[Projected_Impressions]/1000*{A(pick('Cost_Per_Thousand_Impressions_USD','Cost_Per_Thousand_Impressions_USD'))}")
    ]
    forecast_rows = ensure_min_two_assumption_refs(forecast_rows, a_labels, model)
    f_tables, f_formulas = build_two_col_model(model, forecast_rows)
    f_pairs = [{"label": l, "formula": v} for (l, v) in forecast_rows]
    suggestions.append({
        "label": "Forecast Model",
        "description": "Estimate reach, clicks, conversions, and CPM spend.",
        "rationale": "Audience and media parameters present in assumptions.",
        "tables": f_tables,
        "formulas": f_formulas,
        "formula_pairs": f_pairs,
        "annotations": {model: "Auto-generated Forecast model (2-column)."},
        "units": {model: {}},
        "confidence": 0.78 if a_labels else 0.62,
        "category": "planning/forecast",
    })

    # Timeline Model
    model = unique_new_table_name("Timeline", forbidden)
    forbidden.append(model)
    timeline_rows: List[Tuple[str, str]] = [
        ("End_Date",
         f"EDATE({A(pick('Start_Date','Start_Date'))},{A(pick('Duration_Months','Duration_Months'))})"),
        ("Duration_Days",
         f"{A(pick('Duration_Months','Duration_Months'))}*30"),
        ("Payments_Delay",
         f"{A(pick('Payment_Terms_Days','Payment_Terms_Days'))}" if have("Payment_Terms_Days") else "0"),
        ("Working_Capital_Buffer",
         f"{A(pick('Working_Capital_Days','Working_Capital_Days'))}" if have("Working_Capital_Days") else "0"),
        ("Total_Cycle_Days",
         f"{model}[Duration_Days]+{model}[Payments_Delay]+{model}[Working_Capital_Buffer]")
    ]
    timeline_rows = ensure_min_two_assumption_refs(timeline_rows, a_labels, model)
    t_tables, t_formulas = build_two_col_model(model, timeline_rows)
    t_pairs = [{"label": l, "formula": v} for (l, v) in timeline_rows]
    suggestions.append({
        "label": "Timeline & Cohort",
        "description": "Compute end date and overall operating cycle days.",
        "rationale": "Start date, duration, and timing fields found in assumptions.",
        "tables": t_tables,
        "formulas": t_formulas,
        "formula_pairs": t_pairs,
        "annotations": {model: "Auto-generated Timeline model (2-column)."},
        "units": {model: {}},
        "confidence": 0.74 if a_labels else 0.6,
        "category": "analytics/time",
    })

    return suggestions

# ---------- Template-based extra models to reach 10+ (each enforces >=2 assumption refs) ----------
def _mk_model(name: str,
              forbidden: List[str],
              rows: List[Tuple[str, str]],
              description: str,
              rationale: str,
              category: str,
              a_labels: List[str],
              confidence: float = 0.7) -> Dict[str, Any]:
    model = unique_new_table_name(name, forbidden)
    forbidden.append(model)

    # Rewrite any hardcoded self-refs to the actual model name
    old_names = _old_name_variants(name)
    rows = _rewrite_rows_self_refs(rows, old_names, model)

    # Ensure >=2 Assumptions refs BEFORE building
    rows = ensure_min_two_assumption_refs(rows, a_labels, model)

    # Top up to >=5 formulas, if needed
    if sum(1 for _, v in rows if "[" in str(v)) < 5:
        fills = labeled_fillers(a_labels)
        i = 0
        while sum(1 for _, v in rows if ("[" in str(v) and not str(v).strip().replace(".", "", 1).isdigit())) < 5 and i < len(fills):
            rows.append(fills[i])
            i += 1

    tables_map, formulas_map = build_two_col_model(model, rows)
    pairs = [{"label": l, "formula": v} for (l, v) in rows]
    return {
        "label": f"{name} Model" if not name.lower().endswith("model") else name,
        "description": description,
        "rationale": rationale,
        "tables": tables_map,
        "formulas": formulas_map,
        "formula_pairs": pairs,
        "annotations": {model: f"Auto-generated {name} model (2-column)."},
        "units": {model: {}},
        "confidence": max(0.5, min(0.95, confidence)),
        "category": category,
    }

def generate_additional_models(tables: List[Dict[str, Any]],
                               existing_names: List[str],
                               a_labels: List[str],
                               needed: int) -> List[Dict[str, Any]]:
    A = lambda x: f"Assumptions[{x}]"
    have = set(a_labels).__contains__
    pick = lambda x, default: x if have(x) else default

    forbidden = input_table_names(tables) + existing_names[:]
    out: List[Dict[str, Any]] = []

    # KPI
    rows = [
        ("CTR", f"{A(pick('Click_Through_Rate','Click_Through_Rate'))}" if have("Click_Through_Rate") else "5/100"),
        ("CPA", f"{A(pick('Spend_USD','Spend_USD'))}/{A(pick('Conversions','Conversions'))}" if have("Spend_USD") and have("Conversions") else "1000/10"),
        ("CPC", f"{A(pick('Spend_USD','Spend_USD'))}/{A(pick('Clicks','Clicks'))}" if have("Spend_USD") and have("Clicks") else "1000/1000"),
        ("Conv_Rate", f"{A(pick('Conversion_Rate','Conversion_Rate'))}" if have("Conversion_Rate") else "1/20"),
        ("Revenue", f"{A(pick('Users','Users'))}*{A(pick('ARPU_USD','ARPU_USD'))}" if have("Users") and have("ARPU_USD") else "1000*10"),
    ]
    out.append(_mk_model("KPI", forbidden, rows,
                         "Basic marketing/econ KPIs.", "Common KPI fields or safe defaults.", "analytics/kpi", a_labels))

    # Funnel
    rows = [
        ("Visitors", A(pick("Visitors","Visitors")) if have("Visitors") else "10000"),
        ("Signup_Rate", A(pick("Signup_Rate","Signup_Rate")) if have("Signup_Rate") else "10/100"),
        ("Signups", "Funnel[Visitors]*Funnel[Signup_Rate]"),
        ("Conv_Rate", A(pick("Conversion_Rate","Conversion_Rate")) if have("Conversion_Rate") else "5/100"),
        ("Customers", "Funnel[Signups]*Funnel[Conv_Rate]"),
    ]
    out.append(_mk_model("Funnel", forbidden, rows,
                         "Top-of-funnel to customers.", "Funnel structure with minimal assumptions.", "analytics/funnel", a_labels))

    # Unit Economics
    rows = [
        ("CAC", A(pick("CAC_USD","CAC_USD")) if have("CAC_USD") else "100"),
        ("ARPU", A(pick("ARPU_USD","ARPU_USD")) if have("ARPU_USD") else "10"),
        ("Gross_Margin", A(pick("Gross_Margin","Gross_Margin")) if have("Gross_Margin") else "70/100"),
        ("LTV", "Unit_Economics[ARPU]*12*Unit_Economics[Gross_Margin]"),
        ("LTV_to_CAC", "Unit_Economics[LTV]/Unit_Economics[CAC]"),
    ]
    out.append(_mk_model("Unit_Economics", forbidden, rows,
                         "Compute LTV and LTV/CAC.", "Standard unit-econ placeholders.", "finance/unit_econ", a_labels))

    # Cashflow
    rows = [
        ("Monthly_Revenue", f"{A(pick('Users','Users'))}*{A(pick('ARPU_USD','ARPU_USD'))}" if have("Users") and have("ARPU_USD") else "1000*10"),
        ("Monthly_Costs", A(pick("Opex_USD","Opex_USD")) if have("Opex_USD") else "5000"),
        ("Monthly_Profit", "Cashflow[Monthly_Revenue]-Cashflow[Monthly_Costs]"),
        ("Burn_Rate", "0-Cashflow[Monthly_Profit]"),
        ("Runway_Months", f"{A(pick('Cash_USD','Cash_USD'))}/Cashflow[Monthly_Costs]" if have("Cash_USD") else "100000/5000"),
    ]
    out.append(_mk_model("Cashflow", forbidden, rows,
                         "Simple monthly cashflow metrics.", "Revenue/cost/runway with fallbacks.", "finance/cashflow", a_labels))

    # Sensitivity
    rows = [
        ("Base_Value", "100"),
        ("Low", "Sensitivity[Base_Value]*90/100"),
        ("High", "Sensitivity[Base_Value]*110/100"),
        ("Adj_for_Growth", "Sensitivity[Base_Value]*(1+Assumptions[Annual_Growth_Rate])"),
        ("Adj_for_Tax", "Sensitivity[Base_Value]*(1+Assumptions[Tax_Rate])"),
    ]
    out.append(_mk_model("Sensitivity", forbidden, rows,
                         "±10% sensitivity around a base.", "Generic what-if frame with assumption knobs.", "analytics/sensitivity", a_labels))

    # Pricing
    rows = [
        ("Unit_Cost", A(pick("Unit_Cost_USD","Unit_Cost_USD")) if have("Unit_Cost_USD") else "5"),
        ("Price", A(pick("Price_USD","Price_USD")) if have("Price_USD") else "12"),
        ("Gross_Margin_%", "(Pricing[Price]-Pricing[Unit_Cost])/Pricing[Price]"),
        ("Taxed_Price", "Pricing[Price]*(1+Assumptions[Tax_Rate])"),
        ("Discounted_Price", "Pricing[Price]*(1-Assumptions[Discount_Rate])"),
    ]
    out.append(_mk_model("Pricing", forbidden, rows,
                         "Basic pricing and margins.", "Price/cost structure with tax & discount assumptions.", "finance/pricing", a_labels))

    # Capacity
    rows = [
        ("Capacity_Units", A(pick("Capacity_Units","Capacity_Units")) if have("Capacity_Units") else "10000"),
        ("Utilization_%", A(pick("Utilization","Utilization")) if have("Utilization") else "80/100"),
        ("Used_Capacity", "Capacity[Capacity_Units]*Capacity[Utilization_%]"),
        ("Backlog_Units", A(pick("Backlog_Units","Backlog_Units")) if have("Backlog_Units") else "500"),
        ("Days_to_Clear", "Capacity[Backlog_Units]/(Capacity[Used_Capacity]/30)"),
    ]
    out.append(_mk_model("Capacity", forbidden, rows,
                         "Capacity, utilization, backlog.", "Ops throughput quick math.", "ops/capacity", a_labels))

    # Quality
    rows = [
        ("Units_Produced", A(pick("Units_Produced","Units_Produced")) if have("Units_Produced") else "10000"),
        ("Defect_Rate", A(pick("Defect_Rate","Defect_Rate")) if have("Defect_Rate") else "2/100"),
        ("Defects", "Quality[Units_Produced]*Quality[Defect_Rate]"),
        ("Rework_Cost", "Quality[Defects]*Assumptions[Rework_Cost_USD]" if have("Rework_Cost_USD") else "Quality[Defects]*3"),
        ("Yield_%", "1-Quality[Defect_Rate]"),
    ]
    out.append(_mk_model("Quality", forbidden, rows,
                         "Yield and defect metrics.", "Manufacturing-style quality KPIs.", "ops/quality", a_labels))

    # Staffing
    rows = [
        ("Headcount", A(pick("Headcount","Headcount")) if have("Headcount") else "20"),
        ("Avg_Salary", A(pick("Avg_Salary_USD","Avg_Salary_USD")) if have("Avg_Salary_USD") else "120000"),
        ("Fringe_%", A(pick("Fringe_Rate","Fringe_Rate")) if have("Fringe_Rate") else "25/100"),
        ("Monthly_Payroll", "Staffing[Headcount]*Staffing[Avg_Salary]/12*(1+Staffing[Fringe_%])"),
        ("Annual_Payroll", "Staffing[Monthly_Payroll]*12"),
    ]
    out.append(_mk_model("Staffing", forbidden, rows,
                         "Payroll and benefits rollup.", "Headcount-driven cost calc.", "hr/staffing", a_labels))

    # Risk
    rows = [
        ("Prob_Low", "10/100"),
        ("Prob_Med", "30/100"),
        ("Prob_High", "60/100"),
        ("Impact_Score", "Risk[Prob_Med]*3 + Risk[Prob_High]*5"),
        ("Expected_Loss", "Risk[Impact_Score]*(1+Assumptions[Tax_Rate])"),
    ]
    out.append(_mk_model("Risk", forbidden, rows,
                         "Simple probabilistic impact model.", "Risk-weighted scoring with tax modifier.", "governance/risk", a_labels))

    # Scenario
    rows = [
        ("Base", "100"),
        ("Low", "Scenario[Base]*90/100"),
        ("High", "Scenario[Base]*110/100"),
        ("Growth_Adjusted", "Scenario[Base]*(1+Assumptions[Annual_Growth_Rate])"),
        ("Discount_Adjusted", "Scenario[Base]/(1+Assumptions[Discount_Rate])"),
    ]
    out.append(_mk_model("Scenario", forbidden, rows,
                         "Base/Low/High scenario math.", "Spread with growth/discount assumptions.", "planning/scenario", a_labels))

    return out[:max(0, needed)]

# ---------- LLM prompt (request label–formula pairs & no ranges) ----------
def build_llm_prompt(tables: List[Dict[str, Any]]) -> str:
    label_map = extract_all_labels(tables)
    flat = flatten_labels(label_map)
    input_names = input_table_names(tables)
    assumptions = label_map.get("Assumptions", [])

    schema = {
        "label": "string",
        "description": "string",
        "rationale": "string",
        "tables": {"<GridCoord>": "Label OR Value"},
        "formulas": {"<GridCoord>": "Formula"},
        "formula_pairs": [{"label": "RowLabel", "formula": "FormulaOrDefault"}],
        "annotations": {"Model": "string"},
        "units": {"Model": {}},
        "confidence": "0.0-1.0",
        "category": "string"
    }

    instruction = f"""
You are given table labels. Propose AT LEAST 3 modeling suggestions.

CRITICAL SHAPE RULES:
- Use NEW model table names for LHS; never assign into these input names: {input_names}
- Two columns only:
  [0:0] column = "Label"; [1:1] column = "Value"
  Row 0: headers ("Label","Value")
  Data rows i>=1: Model[0:0][i:i] = RowLabel, Model[1:1][i:i] = FormulaOrDefault
- Include >=5 formula rows per model.
- Include >=2 formulas per model that reference Assumptions[...].
- NEVER use ranges in formulas. ALWAYS use label refs: <Table>[<Label>]
- Formulas must contain an operator or function (not a lone reference).
- Tables must contain only strings/numbers (no leading "=").
- Labels must be short, qualitative, and specific (e.g., Audience_x_Reach, End_Date, Avg_Metric).

IMPORTANT: Alongside the legacy "formulas" map, also return "formula_pairs": a list of objects, each with:
  - "label": the short qualitative row label
  - "formula": the exact formula (or default constant if not a formula)

Known references you can safely use:
{flat}

Assumptions rows (if present):
{assumptions}

STRICT OUTPUT: a single JSON object with keys "metadata" and "next_models".
Each item in "next_models" must have exactly:
["label","description","rationale","tables","formulas","formula_pairs","annotations","units","confidence","category"].

Schema hint:
{json.dumps(schema, indent=2)}
"""
    return instruction.strip()

# ---------- Post-process LLM -> strict two-column & >=5 formulas, >=2 Assumptions refs ----------
def sanitize_llm_item(item: Dict[str, Any],
                      forbidden: List[str],
                      a_labels: List[str]) -> Dict[str, Any]:
    label = item.get("label") or "Model"
    model = unique_new_table_name(label, forbidden)
    forbidden.append(model)

    # Prefer explicit pairs from LLM
    pairs = item.get("formula_pairs") or []
    rows: List[Tuple[str, str]] = []

    for i, p in enumerate(pairs, start=1):
        lbl = str(p.get("label") or "").strip()
        expr = str(p.get("formula") or "").strip()
        if not lbl:
            lbl = label_from_formula(expr, fallback_idx=i)
        rows.append((lbl, expr))

    # Consider legacy 'formulas' map if provided
    if not rows:
        llm_formulas = item.get("formulas") or {}
        exprs: List[str] = [str(v) for _, v in llm_formulas.items()]
        for i, expr in enumerate(exprs, start=1):
            rows.append((label_from_formula(expr, fallback_idx=i), expr))

    # Rewrite LLM self-references (label → actual model name)
    old_names = _old_name_variants(label)
    rows = _rewrite_rows_self_refs(rows, old_names, model)

    # Ensure >=2 Assumptions refs
    rows = ensure_min_two_assumption_refs(rows, a_labels, model)

    # Ensure >=5 labeled formula rows by appending labeled fillers
    fills = labeled_fillers(a_labels)
    fi = 0
    def formula_count(rr): return sum(1 for _, v in rr if "[" in str(v) and not str(v).strip().replace(".", "", 1).isdigit())
    while formula_count(rows) < 5:
        if fi < len(fills):
            rows.append(fills[fi])
            fi += 1
        else:
            g = ["0+0", "1*1", "10/2", "SUM(1,2,3)", "AVG(1,2,3)"][(len(rows)) % 5]
            rows.append((label_from_formula(g, fallback_idx=len(rows)+1), g))

    # Build strict 2-col table + formula map
    tables_map, formulas_map = build_two_col_model(model, rows)

    return {
        "label": label,
        "description": item.get("description") or "Auto-generated suggestion.",
        "rationale": item.get("rationale") or "Derived from available tables.",
        "tables": tables_map,
        "formulas": formulas_map,
        "formula_pairs": [{"label": r[0], "formula": r[1]} for r in rows],
        "annotations": {model: f"Auto-generated {label} model (2-column)."},
        "units": {model: {}},
        "confidence": max(0.0, min(1.0, float(item.get("confidence", 0.7)))),
        "category": item.get("category") or "exec/general",
    }

# ---------- Main generator ----------
def generate_suggestions(tables: List[Dict[str, Any]]) -> Dict[str, Any]:
    label_map = extract_all_labels(tables)
    a_labels = label_map.get("Assumptions", [])
    forbidden = input_table_names(tables)[:]  # clone

    used_llm = False
    models: List[Dict[str, Any]] = []

    # Try LLM path
    llm_txt = call_llm(build_llm_prompt(tables))
    if llm_txt:
        used_llm = True
        try:
            parsed = json.loads(llm_txt)
        except Exception:
            m = re.search(r"\{[\s\S]+\}", llm_txt)
            parsed = json.loads(m.group(0)) if m else {}
        nm = parsed.get("next_models", [])
        if isinstance(nm, list):
            for it in nm:
                try:
                    models.append(sanitize_llm_item(it, forbidden, a_labels))
                except Exception:
                    continue

    # Baseline heuristics (adds 3)
    if len(models) < 3:
        base = heuristic_models(tables)
        models.extend(base)

    # If more than 2 input tables, ensure AT LEAST 10 suggestions
    target = 10 if len(tables) > 2 else 3
    if len(models) < target:
        existing_names = []
        for m in models:
            ann = m.get("annotations", {})
            if ann:
                existing_names.extend(list(ann.keys()))
        extra_needed = target - len(models)
        extras = generate_additional_models(tables, existing_names, a_labels, extra_needed)
        models.extend(extras)

    # Cap at 10
    models = models[:max(10, 3 if len(tables) <= 2 else 10)]

    return {
        "metadata": {
            "engine": "llm+heuristic",
            "notes": ("All suggestions target NEW tables, enforce 2-column grids, include >=5 formulas, "
                      "and include >=2 formulas that reference Assumptions[...]. At least 10 suggestions are returned "
                      "when input has >2 tables."),
            "used_llm": used_llm,
        },
        "next_models": models
    }

# ---------- Ion entry ----------
def _main_ion() -> int:
    works.msg("\tready: generalized suggester (2-col, >=5 formulas, >=2 Assumptions refs, target-safe)")
    raw1 = works.param(1)
    try:
        tables = (raw1)  # If raw JSON text is provided, use: tables = _load_tables_from_param(raw1)
    except Exception as e:
        works.resolve({"error": f"Failed to parse tables: {e}"})
        return 1

    try:
        out = generate_suggestions(tables)
        works.resolve(out)
        return 0
    except Exception as e:
        works.resolve({"error": f"Failed to generate suggestions: {e}"})
        return 1

# Auto-run
works.msg(" loading generalized suggester (2-col / >=5 formulas / >=2 Assumptions refs / target-safe) ")
_main_ion()
