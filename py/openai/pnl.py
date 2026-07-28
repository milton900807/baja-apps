#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
PnL builder (Ion Works entry/exit) — builds a two-column Profit & Loss table
driven by a previously generated Assumptions table (grid/wells structure) and a fresh user prompt.

Ion params
----------
param(1): user prompt (str)
param(2): assumptions JSON (inline JSON string or path to a JSON file) — must be {name, cols, rows, wells:[...]}
param(3): model (optional; default: gpt-4o-mini)
param(4): temperature (optional; default: 0.15)
"""

import os
import json
import re
from typing import Dict, List, Tuple, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---------- utils ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')
_IDENT_LABEL_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)

def _extract_json_snippet(text: str) -> str:
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e <= s:
        raise ValueError("No JSON object found.")
    return text[s:e+1].strip()

def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.15,
    json_mode: bool = False,
    max_tokens: int = 2000,
) -> str:
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
    return (resp.choices[0].message.content or "").strip()

def _load_json_from_path_or_text(s: str) -> dict:
    s = (s or "").strip()
    if not s:
        raise RuntimeError("Assumptions input is empty.")
    if s.startswith("{") or s.startswith("["):
        return json.loads(s)
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

def _coerce_number(v: Any) -> Any:
    if isinstance(v, (int, float)):
        return v
    if v is None:
        return 0
    if isinstance(v, str):
        s = v.strip()
        try:
            if s.isdigit():
                return int(s)
            f = float(s)
            return int(f) if f.is_integer() else f
        except Exception:
            return s
    return v

def _assumptions_rows(assumptions_json: dict) -> List[Tuple[str, Any]]:
    """
    Supports the grid/wells structure:
    { "name":"Assumptions", "cols":2, "rows":N, "wells":[{x,y,value,field:[...]}...] }
    Returns: [(label, value), ...] where labels come from x=0 (y>=1) and values from x=1 (y>=1).
    """
    rows: List[Tuple[str, Any]] = []

    # --- wells format ---
    if isinstance(assumptions_json, dict) and "wells" in assumptions_json:
        wells = assumptions_json.get("wells") or []
        if not isinstance(wells, list):
            raise RuntimeError("Assumptions 'wells' must be a list.")

        row_to_label: Dict[int, str] = {}
        row_to_value: Dict[int, Any] = {}

        for cell in wells:
            try:
                x = cell.get("x")
                y = cell.get("y")
                val = cell.get("value")
                if x == 0 and y is not None and y >= 1:
                    if isinstance(val, str) and val.strip():
                        row_to_label[y] = val.strip()
                elif x == 1 and y is not None and y >= 1:
                    row_to_value[y] = _coerce_number(val)
            except Exception:
                continue

        for y in sorted(row_to_label.keys()):
            label = row_to_label.get(y)
            if not label:
                continue
            value = row_to_value.get(y, "")
            # normalize label to machine-friendly (keep existing underscores)
            norm_label = re.sub(r"\s+", "_", label.strip())
            rows.append((norm_label, value))
        # de-dup by first occurrence
        seen = set()
        uniq: List[Tuple[str, Any]] = []
        for lab, val in rows:
            if lab not in seen:
                uniq.append((lab, val))
                seen.add(lab)
        return uniq

    # --- fallback legacy shapes (tables/assumptions) if ever passed in ---
    if "tables" in assumptions_json:
        tbl = {k: v for k, v in (assumptions_json.get("tables") or {}).items()}
        labels, vals = {}, {}
        for k, v in tbl.items():
            m = _KEY_RE.match(k)
            if not m:
                continue
            t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
            if t != "Assumptions" or j == 0:
                continue
            if i == 0:
                labels[j] = str(v)
            elif i == 1:
                vals[j] = _coerce_number(v)
        out = []
        for j in sorted(set(labels.keys()) | set(vals.keys())):
            lab = labels.get(j)
            if lab:
                out.append((re.sub(r"\s+", "_", lab.strip()), vals.get(j, "")))
        return out

    if "assumptions" in assumptions_json:
        out = []
        for it in assumptions_json["assumptions"]:
            lab = str(it.get("label", "")).strip()
            if not lab:
                continue
            out.append((re.sub(r"\s+", "_", lab), _coerce_number(it.get("value", ""))))
        return out

    raise RuntimeError("Unrecognized assumptions JSON shape.")

def _infer_units_for_pnl_label(label: str) -> str:
    L = label.lower()
    if "margin" in L or L.endswith("_pct") or L.endswith("_rate"):
        return "fraction"
    if any(x in L for x in ["revenue","cogs","gross_profit","operating_expenses",
                            "payroll","rent","marketing","ebitda","depreciation",
                            "ebit","taxes","net_income"]):
        return "USD/year"
    return "unitless"

# ---------- LLM schema + generation ----------
PNL_SCHEMA_MSG = """
You must output ONLY valid JSON. Build a two-column 'PnL' table with labeled rows and formulas.
Return JSON with the EXACT shape:
{
  "rows": [
    {"label": "Revenue", "formula": "Assumptions[Revenue_Per_Year]"},
    {"label": "COGS", "formula": "Assumptions[COGS_Per_Service]"},
    {"label": "Gross_Profit", "formula": "PnL[Revenue]-PnL[COGS]"},
    {"label": "Payroll", "formula": "Assumptions[FTE_Molecular_Biologists]*Assumptions[Average_Salary_Biologist]+Assumptions[FTE_Lab_Technicians]*Assumptions[Average_Salary_Technician]+Assumptions[FTE_Quality_Assurance]*Assumptions[Average_Salary_QA]+Assumptions[FTE_Project_Managers]*Assumptions[Average_Salary_PM]+Assumptions[FTE_Admin_Support]*Assumptions[Average_Salary_Admin]"},
    {"label": "Operating_Expenses", "formula": "Assumptions[Operating_Expenses_Per_Year]+Assumptions[Rent_Per_Year]+Assumptions[Marketing_Expenses_Per_Year]"},
    {"label": "EBITDA", "formula": "PnL[Gross_Profit]-PnL[Operating_Expenses]"},
    {"label": "Depreciation", "formula": "Assumptions[Initial_Capital_Investment]/Assumptions[Depreciation_Years]"},
    {"label": "EBIT", "formula": "PnL[EBITDA]-PnL[Depreciation]"},
    {"label": "Taxes", "formula": "PnL[EBIT]*Assumptions[Tax_Rate]"},
    {"label": "Net_Income", "formula": "PnL[EBIT]-PnL[Taxes]"},
    {"label": "Gross_Margin_Pct", "formula": "PnL[Gross_Profit]/PnL[Revenue]"},
    {"label": "EBITDA_Margin_Pct", "formula": "PnL[EBITDA]/PnL[Revenue]"},
    {"label": "Net_Margin_Pct", "formula": "PnL[Net_Income]/PnL[Revenue]"}
  ],
  "notes": "One-sentence annotation for the PnL table."
}
STRICT rules:
- Use ONLY labels from the provided Assumptions list when referencing Assumptions[...].
- Reference PnL rows via PnL[Label] where needed (e.g., PnL[Gross_Profit]).
- Use only + - * / ^ and parentheses. No ranges, no dot notation, no functions.
- Provide 10–20 sensible PnL rows, ordered logically.
- Labels must be unique and machine-friendly.
- When entering rates that are percentages use 0-1 values instead of 0-100
- If a referenced Assumptions label is not available, remove or rewrite that row.
- IF Available_Initial_Capital is defined in the table make sure to derive it from the Assumptions
"""
def _ensure_payroll_row(
    assumptions_rows: List[Tuple[str, Any]],
    rows: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Ensure that there is a Payroll row (label == 'Payroll') in the PnL rows.

    Strategy:
    - If 'Payroll' already exists, do nothing.
    - Otherwise, try to derive it from assumptions:
        * Prefer exact Payroll-related drivers like FTE_* x Average_Salary_*
        * Fallback to a direct Payroll assumption if present
        * Fallback to 0
    - Insert before Operating_Expenses if present, otherwise after Gross_Profit,
      otherwise append at the end.
    """
    existing_labels = [r.get("label", "") for r in rows]
    if "Payroll" in existing_labels:
        return rows

    valid_assump_labels = [lab for (lab, _v) in assumptions_rows]
    valid_set = set(valid_assump_labels)

    payroll_formula = None

    # Preferred explicit role-based payroll build
    role_pairs = [
        ("FTE_Molecular_Biologists", "Average_Salary_Biologist"),
        ("FTE_Lab_Technicians", "Average_Salary_Technician"),
        ("FTE_Quality_Assurance", "Average_Salary_QA"),
        ("FTE_Project_Managers", "Average_Salary_PM"),
        ("FTE_Admin_Support", "Average_Salary_Admin"),
    ]
    terms = [
        f"Assumptions[{fte}]*Assumptions[{salary}]"
        for fte, salary in role_pairs
        if fte in valid_set and salary in valid_set
    ]
    if terms:
        payroll_formula = "+".join(terms)

    # Fallback: direct payroll assumption
    if not payroll_formula:
        direct_candidates = [
            "Payroll",
            "Payroll_Per_Year",
            "Annual_Payroll",
            "Personnel_Costs",
            "Personnel_Costs_Per_Year",
            "Labor_Costs",
            "Labor_Costs_Per_Year",
        ]
        for lab in direct_candidates:
            if lab in valid_set:
                payroll_formula = f"Assumptions[{lab}]"
                break

    if not payroll_formula:
        payroll_formula = "0"

    payroll_row = {"label": "Payroll", "formula": payroll_formula}

    insert_idx = None
    if "Operating_Expenses" in existing_labels:
        insert_idx = existing_labels.index("Operating_Expenses")
    elif "Gross_Profit" in existing_labels:
        insert_idx = existing_labels.index("Gross_Profit") + 1

    if insert_idx is None:
        rows.append(payroll_row)
    else:
        rows.insert(insert_idx, payroll_row)

    return rows

def _ensure_net_income_row(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Ensure that there is a Net_Income row in the PnL rows.

    Strategy:
    - If 'Net_Income' already exists, do nothing.
    - Otherwise:
        * Prefer: PnL[EBIT]-PnL[Taxes]
        * Fallback: if Taxes is missing but EBIT exists, use PnL[EBIT]
        * Fallback: use 0
    - Insert after Taxes if present, otherwise after EBIT if present,
      otherwise append at the end.
    """
    existing_labels = [r.get("label", "") for r in rows]
    if "Net_Income" in existing_labels:
        return rows

    has_ebit = "EBIT" in existing_labels
    has_taxes = "Taxes" in existing_labels

    if has_ebit and has_taxes:
        net_income_formula = "PnL[EBIT]-PnL[Taxes]"
    elif has_ebit:
        net_income_formula = "PnL[EBIT]"
    else:
        net_income_formula = "0"

    net_income_row = {"label": "Net_Income", "formula": net_income_formula}

    insert_idx = None
    if "Taxes" in existing_labels:
        insert_idx = existing_labels.index("Taxes") + 1
    elif "EBIT" in existing_labels:
        insert_idx = existing_labels.index("EBIT") + 1

    if insert_idx is None:
        rows.append(net_income_row)
    else:
        rows.insert(insert_idx, net_income_row)

    return rows


def _list_assumption_labels(rows: List[Tuple[str, Any]]) -> List[str]:
    return [lab for (lab, _v) in rows]

def _filter_rows_to_valid_assumptions(rows: List[Dict[str, str]], valid_labels: set) -> List[Dict[str, str]]:
    out = []
    ref_re = re.compile(r'Assumptions\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]')
    for r in rows:
        f = r.get("formula", "")
        invalid = any(m.group("label") not in valid_labels for m in ref_re.finditer(f))
        if not invalid:
            out.append(r)
    return out

# ---- NEW: ensure COGS row exists (PnL[COGS]) ----
def _ensure_cogs_row(
    assumptions_rows: List[Tuple[str, Any]],
    rows: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Ensure that there is a COGS row (label == 'COGS') in the PnL rows.

    Strategy:
    - If 'COGS' already present as a label, do nothing.
    - Otherwise, try to map it to an Assumption:
        * First try exact 'COGS'.
        * Then any label containing 'cogs' or 'cost_of_goods'.
      If found, use Assumptions[that_label] as the formula.
      If not found, fall back to a safe '0' formula.
    - Insert the COGS row directly after Revenue/Total_Revenue/Sales if present,
      otherwise append at the end.
    """
    existing_labels = [r.get("label", "") for r in rows]
    if "COGS" in existing_labels:
        return rows  # already present

    valid_assump_labels = [lab for (lab, _v) in assumptions_rows]

    cogs_assump_label = None
    if "COGS" in valid_assump_labels:
        cogs_assump_label = "COGS"
    else:
        for lab in valid_assump_labels:
            L = lab.lower()
            if "cogs" in L or "cost_of_goods" in L:
                cogs_assump_label = lab
                break

    if cogs_assump_label:
        cogs_formula = f"Assumptions[{cogs_assump_label}]"
    else:
        # Safe placeholder if we can't map to assumptions cleanly.
        cogs_formula = "0"

    cogs_row = {"label": "COGS", "formula": cogs_formula}

    insert_idx = None
    for i, lab in enumerate(existing_labels):
        L = (lab or "").lower()
        if L in ("revenue", "total_revenue", "sales"):
            insert_idx = i + 1
            break

    if insert_idx is None:
        rows.append(cogs_row)
    else:
        rows.insert(insert_idx, cogs_row)

    return rows
# ---- END NEW ----

def _rows_to_wire(table_name: str, rows: List[Dict[str, str]]) -> Tuple[Dict[str, str], Dict[str, str]]:
    tables: Dict[str, str] = {_key(table_name, 0, 0): "Label", _key(table_name, 1, 0): "Value"}
    formulas: Dict[str, str] = {}
    r = 1
    for it in rows:
        lab = re.sub(r"\s+", "_", it["label"].strip())
        tables[_key(table_name, 0, r)] = lab
        formulas[_key(table_name, 1, r)] = re.sub(r"\s+", "", it["formula"].strip())
        r += 1
    return tables, formulas
def generate_pnl_via_gpt(
    *,
    user_prompt: str,
    assumptions_rows: List[Tuple[str, Any]],
    model: str = "gpt-4o-mini",
    temperature: float = 0.15,
) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, Dict[str, str]], Dict[str, str]]:
    valid_labs = _list_assumption_labels(assumptions_rows)
    assumptions_preview = "\n".join(f"- {lab} = {val}" for lab, val in assumptions_rows[:120])

    system = "You are a meticulous financial-modeling assistant. Return JSON exactly per schema."
    user = (
        f"{PNL_SCHEMA_MSG}\n\n"
        f"USER PROMPT:\n{user_prompt.strip()}\n\n"
        "AVAILABLE ASSUMPTIONS (labels you may reference as Assumptions[Label]):\n"
        f"{assumptions_preview}\n\n"
        "Reminder: Only reference the labels listed above when using Assumptions[...]."
    )

    works.msg("🧾 requesting PnL rows + formulas from GPT…")
    content = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
        max_tokens=4000,
    )

    try:
        data = json.loads(content)
    except Exception:
        data = json.loads(_extract_json_snippet(content))

    rows = data.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("GPT did not return any PnL rows.")

    rows_ok = _filter_rows_to_valid_assumptions(rows, set(valid_labs))
    if not rows_ok:
        raise RuntimeError("All returned PnL rows referenced missing Assumptions labels.")

    # Ensure required rows exist in PnL
    # Ensure required rows exist in PnL
    rows_ok = _ensure_cogs_row(assumptions_rows, rows_ok)
    rows_ok = _ensure_payroll_row(assumptions_rows, rows_ok)
    rows_ok = _ensure_net_income_row(rows_ok)
    
    pnl_tables, pnl_formulas = _rows_to_wire("PnL", rows_ok)

    units: Dict[str, Dict[str, str]] = {"PnL": {}}
    for k, v in pnl_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        if t == "PnL" and i == 0 and j >= 1:
            units["PnL"][v] = _infer_units_for_pnl_label(v)

    annotations = {
        "PnL": str(data.get("notes") or "Annual profit and loss derived from Assumptions.")
    }
    return pnl_tables, pnl_formulas, units, annotations


# ---------- Orchestrator ----------
def run_pnl_builder(user_prompt: str, assumptions_json: dict, *, model: str = "gpt-4o-mini", temperature: float = 0.15) -> Dict[str, Any]:
    rows = _assumptions_rows(assumptions_json)
    if not rows:
        raise RuntimeError("No assumptions rows found.")

    pnl_tables, pnl_formulas, pnl_units, pnl_ann = generate_pnl_via_gpt(
        user_prompt=user_prompt,
        assumptions_rows=rows,
        model=model,
        temperature=temperature,
    )

    tables = {}
    # Echo headers for reference (no assumption rows duplicated)
    tables[_key("Assumptions", 0, 0)] = "Label"
    tables[_key("Assumptions", 1, 0)] = "Value"
    tables.update(pnl_tables)

    annotations = {"Assumptions": "Header echo for reference"}
    annotations.update(pnl_ann)

    artifact = {
        "tables": tables,
        "formulas": pnl_formulas,
        "annotations": annotations,
        "units": pnl_units,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact

# ---------- Ion entry/exit ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    try:
        assumptions_arg = works.param(2)
        assumptions_json = ((assumptions_arg))
    except Exception as e:
        raise RuntimeError("Ion: param(2) must be the Assumptions JSON (inline or path).") from e

    try:
        capital_assumptions_arg = works.param(3)
        capital_assumptions_json = ((assumptions_arg))
    except Exception as e:
        raise RuntimeError("Ion: param(2) must be the Assumptions JSON (inline or path).") from e

    model = (works.param(3) or default_model)
    try:
        temperature = float(works.param(4) or 0.15)
    except Exception:
        temperature = 0.15

    try:
        artifact = run_pnl_builder(
            user_prompt=str(user_prompt),
            assumptions_json=assumptions_json,
            model=str(model),
            temperature=temperature,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({"status": "❌ error", "error": str(err), "where": "pnl-builder"})
        raise

if __name__ == "__main__":
    works.msg("🔧 loading PnL builder…")
    _main_ion("gpt-4o-mini")
