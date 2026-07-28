#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Refactored PnL builder (Ion Works entry/exit)

Behavior:
- Uses an Assumptions table (grid/wells structure) and optional Capital_Assumptions table
- Calls OpenAI to propose PnL rows + formulas
- Validates formulas against actual assumption labels
- Ensures:
    * A COGS row exists
    * A Gross_Profit row exists and its formula explicitly references Assumptions[...]
    * Available_Initial_Capital is derived from capital assumptions (if present)
    * EVERY PnL row has a formula (no empty formulas)
      – and fallback formulas are NON-CONSTANT and arithmetic only.

Ion params
----------
param(1): user prompt (str)
param(2): assumptions JSON (already-parsed dict in Ion, or equivalent)
param(3): capital assumptions JSON (optional dict)
param(4): model (optional; default: gpt-4o-mini)
param(5): temperature (optional; default: 0.15)
"""

import os
import json
import re
from typing import Dict, List, Tuple, Any, Optional

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---------- config ----------
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0.15
MAX_TOKENS = 4000

# ---------- regex helpers ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')
_IDENT_LABEL_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


# ---------- basic helpers ----------

def _key(table: str, i: int, j: int) -> str:
    """Build a table key of the form Table[i:i][j:j]."""
    return f"{table}[{i}:{i}][{j}:{j}]"


def _normalize_label(s: str) -> str:
    """Normalize a label into machine-friendly snake_case style."""
    s = s.strip()
    return re.sub(r"\s+", "_", s)


def _to_jsonable(obj: Any) -> Any:
    """Ensure the result is JSON-serializable for Ion."""
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


# ---------- number + assumptions handling ----------

def _coerce_number(v: Any) -> Any:
    """Coerce values from wells into int/float when possible."""
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
    Parse the grid/wells structure:

    { "name":"Assumptions", "cols":2, "rows":N,
      "wells":[{"x":0,"y":1,"value":"Label1"}, {"x":1,"y":1,"value":123}, ...]
    }

    Returns: [(normalized_label, value), ...]
      - labels from x=0 (y>=1)
      - values from x=1 (y>=1)
    """
    if not isinstance(assumptions_json, dict):
        raise RuntimeError("Assumptions JSON must be an object/dict.")

    if "wells" not in assumptions_json:
        raise RuntimeError("Assumptions JSON is missing 'wells' field.")

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
            if y is None or y < 1:
                continue
            if x == 0:
                if isinstance(val, str) and val.strip():
                    row_to_label[y] = val.strip()
            elif x == 1:
                row_to_value[y] = _coerce_number(val)
        except Exception:
            continue

    rows: List[Tuple[str, Any]] = []
    for y in sorted(row_to_label.keys()):
        label = row_to_label.get(y)
        if not label:
            continue
        value = row_to_value.get(y, "")
        norm_label = _normalize_label(label)
        rows.append((norm_label, value))

    # de-dup by first occurrence
    seen = set()
    uniq: List[Tuple[str, Any]] = []
    for lab, val in rows:
        if lab not in seen:
            uniq.append((lab, val))
            seen.add(lab)
    return uniq


def _list_assumption_labels(rows: List[Tuple[str, Any]]) -> List[str]:
    return [lab for (lab, _v) in rows]


# ---------- units inference ----------

def _infer_units_for_pnl_label(label: str) -> str:
    """Heuristic units for PnL labels."""
    L = label.lower()
    if "margin" in L or L.endswith("_pct") or L.endswith("_rate"):
        return "fraction"
    if any(
        x in L
        for x in [
            "revenue",
            "cogs",
            "gross_profit",
            "operating_expenses",
            "payroll",
            "rent",
            "marketing",
            "ebitda",
            "depreciation",
            "ebit",
            "taxes",
            "net_income",
        ]
    ):
        return "USD/year"
    return "unitless"


# ---------- LLM schema + prompting ----------

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
- Reference PnL rows via PnL[Label] where needed 
- Use only + - * / ^ and parentheses. No ranges, no dot notation, no functions.
- Provide 10–20 sensible PnL rows, ordered logically.
- Labels must be unique and machine-friendly.
- When entering rates that are percentages use 0-1 values instead of 0-100
- If a referenced Assumptions label is not available, remove or rewrite that row.
- IF Available_Initial_Capital is defined in the table make sure to derive it from the Assumptions
- Gross_Profit formula never includes currency
"""


# ---------- formula validation + enrichment ----------

def _filter_rows_to_valid_assumptions(
    rows: List[Dict[str, str]],
    valid_labels: set,
) -> List[Dict[str, str]]:
    """
    Filter out rows whose formulas reference Assumptions[...] labels that do not exist.
    """
    out: List[Dict[str, str]] = []
    ref_re = re.compile(r"Assumptions\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]")
    for r in rows:
        f = r.get("formula", "") or ""
        invalid = any(m.group("label") not in valid_labels for m in ref_re.finditer(f))
        if not invalid:
            out.append(r)
    return out


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
    """
    existing_labels = [r.get("label", "") for r in rows]
    if "COGS" in existing_labels:
        return rows  # already present

    valid_assump_labels = [lab for (lab, _v) in assumptions_rows]

    cogs_assump_label: Optional[str] = None
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
        # Relationship to Revenue/Gross_Profit
        cogs_formula = "(PnL[Revenue]-PnL[Gross_Profit])"

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


def _ensure_gross_profit_row(
    assumptions_rows: List[Tuple[str, Any]],
    rows: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Ensure that there is a Gross_Profit row (label == 'Gross_Profit') in the PnL rows,
    and that its formula explicitly references valid numeric Assumptions[...] (not units
    like Currency).

    Additional behavior:
      - If there are NO revenue-like and NO cogs-like assumptions at all,
        fall back to a constant guessed Gross_Profit of 100000.

    Strategy:
      1) If a Gross_Profit row exists and its formula references ONLY numeric, non-unit
         assumptions, leave it as-is.
      2) Otherwise, construct a formula that uses numeric Assumptions[...] with this priority:
           a) If 'Gross_Profit' exists as a numeric Assumption label:
                  Assumptions[Gross_Profit]
           b) Else, find a revenue-like and a cogs-like numeric assumption label:
                  Assumptions[<revenue_label>] - Assumptions[<cogs_label>]
              where revenue-like ~ labels containing 'revenue' or 'sales',
                    cogs-like     ~ labels containing 'cogs' or 'cost_of_goods'.
           c) If only one of revenue-like or cogs-like exists, just use that:
                  Assumptions[<revenue_label>]   or   -Assumptions[<cogs_label>]
           d) If there are NO revenue-like and NO cogs-like assumptions at all,
              set Gross_Profit = 100000 (a default guess).
           e) Otherwise (as a last numeric resort), pick another numeric, non-unit assumption.
              If absolutely nothing numeric is available, fall back to "0".
      3) Insert or overwrite the Gross_Profit row near Revenue/COGS if possible.
    """

    # Numeric-only assumption labels (based on _coerce_number result)
    numeric_assump_labels: List[str] = []
    for lab, val in assumptions_rows:
        if isinstance(val, (int, float)):
            numeric_assump_labels.append(lab)

    has_numeric = bool(numeric_assump_labels)

    def _is_unit_like(label: str) -> bool:
        L = label.lower()
        if label == "Currency":
            return True
        return ("currency" in L) or ("unit" in L) or ("format" in L)

    # Locate existing Gross_Profit row if any
    existing_labels = [r.get("label", "") for r in rows]
    gross_idx: Optional[int] = None
    for i, lab in enumerate(existing_labels):
        if lab == "Gross_Profit":
            gross_idx = i
            break

    # If Gross_Profit exists, check if its formula is acceptable
    if gross_idx is not None:
        current_formula = (rows[gross_idx].get("formula") or "").strip()
        if current_formula:
            ref_re = re.compile(r"Assumptions\[(?P<label>[A-Za-z_][A-Za-z0-9_]*)\]")
            any_assump = False
            bad = False
            for m in ref_re.finditer(current_formula):
                any_assump = True
                lab = m.group("label")
                # Reject Currency or any unit-like assumption
                if _is_unit_like(lab):
                    bad = True
                    break
                # Reject non-numeric assumptions if we know which are numeric
                if has_numeric and lab not in numeric_assump_labels:
                    bad = True
                    break
            # If it references assumptions and none are bad → keep it
            if any_assump and not bad:
                return rows
        # If we get here, we will overwrite the existing row with a safer formula

    # --- Build a safe Gross_Profit formula from assumptions ---

    formula: str = ""

    # (a) Direct numeric Gross_Profit assumption
    if "Gross_Profit" in numeric_assump_labels:
        formula = "Assumptions[Gross_Profit]"
    else:
        # (b) Find revenue-like and cogs-like numeric labels
        revenue_label: Optional[str] = None
        cogs_label: Optional[str] = None

        for lab, val in assumptions_rows:
            if not isinstance(val, (int, float)):
                continue
            L = lab.lower()
            if revenue_label is None and ("revenue" in L or "sales" in L):
                revenue_label = lab
            if cogs_label is None and ("cogs" in L or "cost_of_goods" in L):
                cogs_label = lab

        if revenue_label and cogs_label:
            formula = (
                f"Assumptions[{revenue_label}]"
                f"-Assumptions[{cogs_label}]"
            )
        elif revenue_label:
            formula = f"Assumptions[{revenue_label}]"
        elif cogs_label:
            formula = f"-Assumptions[{cogs_label}]"
        else:
            # (d) No revenue-like AND no cogs-like assumptions at all:
            #     use a default Gross_Profit guess of 100000.
            if not revenue_label and not cogs_label:
                formula = "100000"
            else:
                # (e) Last numeric resort: pick a numeric label that is not unit-like
                chosen: Optional[str] = None
                for lab in numeric_assump_labels:
                    if not _is_unit_like(lab):
                        chosen = lab
                        break
                if chosen is not None:
                    formula = f"Assumptions[{chosen}]"
                else:
                    # Truly degenerate: no numeric assumptions we can trust
                    formula = "0"

    new_row = {"label": "Gross_Profit", "formula": formula}

    if gross_idx is not None:
        # Overwrite existing Gross_Profit row
        rows[gross_idx] = new_row
        return rows

    # Need to insert a new Gross_Profit row. Prefer just after COGS, else after Revenue, else append.
    insert_idx = None
    label_to_idx = {lab: i for i, lab in enumerate(existing_labels)}
    if "COGS" in label_to_idx:
        insert_idx = label_to_idx["COGS"] + 1
    elif "Revenue" in label_to_idx:
        insert_idx = label_to_idx["Revenue"] + 1

    if insert_idx is None:
        rows.append(new_row)
    else:
        rows.insert(insert_idx, new_row)

    return rows




# ---------- capital / initial capital helpers ----------

def _derive_total_initial_capital_formula(
    capital_assumptions_rows: List[Tuple[str, Any]]
) -> str:
    """
    Derive a formula for total initial capital from the Capital_Assumptions table.

    Strategy:
      1) If we find both a base capital label and a contingency rate label:
           Total_Initial_Capital = Base_Initial_Capital * (1 + Contingency_Rate)

      2) Otherwise, sum all non-rate capital rows:
           Total_Initial_Capital = sum(Capital_Assumptions[<capital-like label>])

      3) As a last resort, just point to the first capital label.
    """
    cap_labels = [lab for (lab, _v) in capital_assumptions_rows if isinstance(lab, str)]
    if not cap_labels:
        return ""

    # --- 1) Try base + contingency pattern ---
    base_label: Optional[str] = None
    contingency_label: Optional[str] = None

    base_candidates = [
        "Base_Initial_Capital",
        "Initial_Capital_Required",
        "Initial_Capital_Without_Contingency",
        "Required_Initial_Capital",
    ]
    for cand in base_candidates:
        if cand in cap_labels:
            base_label = cand
            break

    # fuzzy backup for base
    if base_label is None:
        for lab in cap_labels:
            L = lab.lower()
            if "base" in L and "capital" in L:
                base_label = lab
                break
            if "initial_capital" in L:
                base_label = lab
                break

    # contingency label
    for lab in cap_labels:
        L = lab.lower()
        if lab == "Contingency_Rate" or "contingency" in L:
            contingency_label = lab
            break

    if base_label and contingency_label:
        return (
            f"Capital_Assumptions[{base_label}]"
            f"*(1+Capital_Assumptions[{contingency_label}])"
        )

    # --- 2) Sum all non-rate capital-like labels ---
    sum_terms: List[str] = []
    for lab in cap_labels:
        L = lab.lower()
        # skip rates / fractions
        if "rate" in L or "pct" in L or L.endswith("_fraction"):
            continue
        if "capital" in L or "equity" in L or "loan" in L or "debt" in L:
            sum_terms.append(f"Capital_Assumptions[{lab}]")

    if sum_terms:
        return "+".join(sum_terms)

    # --- 3) Last resort: just reference the first label ---
    return f"Capital_Assumptions[{cap_labels[0]}]"


def _append_initial_capital_row_from_capital(
    capital_assumptions_rows: Optional[List[Tuple[str, Any]]],
    rows: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """
    Ensure that the PnL has an initial-capital row whose formula is derived
    from the Capital_Assumptions table (if provided).

    Behavior:
      - If NO capital_assumptions_rows: leave rows unchanged.
      - If capital_assumptions_rows exists:
          * Derive a Total_Initial_Capital formula from the capital table
            (using contingency if available, or summing all sources).
          * Write that formula into a PnL initial-capital row:
              - Prefer label 'Available_Initial_Capital'
              - Else 'Initial_Capital'
              - Else create 'Available_Initial_Capital' at the bottom.
    """
    if not capital_assumptions_rows:
        return rows

    total_capital_formula = _derive_total_initial_capital_formula(capital_assumptions_rows)
    if not total_capital_formula:
        return rows

    target_labels = {"Available_Initial_Capital", "Initial_Capital"}

    # Find any existing row that looks like initial capital
    target_rows = [
        r for r in rows
        if isinstance(r.get("label"), str)
        and (
            r["label"] in target_labels
            or "initial_capital" in r["label"].lower()
            or "available_initial_capital" in r["label"].lower()
        )
    ]

    if target_rows:
        for r in target_rows:
            r["formula"] = total_capital_formula
        return rows

    # If no row exists, append a canonical one
    rows.append(
        {
            "label": "Available_Initial_Capital",
            "formula": total_capital_formula,
        }
    )
    return rows


# ---------- fallback formulas ----------

def _fallback_formula(
    label: str,
    valid_assumptions: List[str],
) -> str:
    """
    Fallback formula generator for rows where GPT omitted a formula.

    Requirements:
      - Non-empty
      - Non-constant (must reference at least one Assumptions[...] label)
      - Arithmetic-only expression
    """
    if valid_assumptions:
        # Prefer the first "non-obvious-unit" label if any
        for lab in valid_assumptions:
            L = lab.lower()
            if "currency" in L or "unit" in L or "format" in L:
                continue
            return f"Assumptions[{lab}]"
        # If everything looked like a unit, just use the first anyway
        return f"Assumptions[{valid_assumptions[0]}]"
    return "0"



def _ensure_all_formulas(
    rows: List[Dict[str, str]],
    valid_assumptions: List[str],
) -> List[Dict[str, str]]:
    """
    Ensures that EVERY PnL row has a valid, non-empty formula.

    Behavior:
      - If GPT left formula blank or missing → generate fallback via _fallback_formula
      - If provided formula is whitespace → fallback
      - Never return any row with an empty formula.
    """
    out: List[Dict[str, str]] = []

    for r in rows:
        raw_label = (r.get("label") or "").strip()
        if not raw_label:
            # skip invalid rows; later sanitizers handle this too
            continue

        label = raw_label
        formula = (r.get("formula") or "").strip()

        # If formula is missing or empty → force fallback
        if not formula:
            formula = _fallback_formula(label, valid_assumptions)

        # Ensure non-empty even if fallback somehow gave nothing
        if not formula.strip():
            formula = _fallback_formula(label, valid_assumptions)

        out.append(
            {
                "label": label,
                "formula": formula.strip(),
            }
        )

    return out


# ---------- OpenAI chat wrapper ----------

def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = DEFAULT_TEMPERATURE,
    json_mode: bool = False,
    max_tokens: int = MAX_TOKENS,
) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    kwargs: Dict[str, Any] = dict(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return (resp.choices[0].message.content or "").strip()


# ---------- wiring PnL rows to Ion tables ----------

def _rows_to_wire(
    table_name: str,
    rows: List[Dict[str, str]],
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Convert rows of {"label":..., "formula":...} into:
      tables:   { key -> label }
      formulas: { key -> formula }

    where key is table_name[i:i][j:j] with:
      - i=0 for label column
      - i=1 for value/formula column
    """
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Label",
        _key(table_name, 1, 0): "Value",
    }
    formulas: Dict[str, str] = {}
    r = 1
    for it in rows:
        lab = _normalize_label(it["label"])
        formula = re.sub(r"\s+", "", it["formula"].strip())
        tables[_key(table_name, 0, r)] = lab
        formulas[_key(table_name, 1, r)] = formula
        r += 1
    return tables, formulas

def _numeric_assumption_labels(rows: List[Tuple[str, Any]]) -> List[str]:
    """
    Return labels for assumptions whose values are numeric (int/float).

    These are the only assumptions that should generally be used in PnL formulas.
    """
    numeric_labels: List[str] = []
    for lab, val in rows:
        if isinstance(val, (int, float)):
            numeric_labels.append(lab)
    return numeric_labels

# ---------- PnL generation via GPT + safeguards ----------

def generate_pnl_via_gpt(
    *,
    user_prompt: str,
    assumptions_rows: List[Tuple[str, Any]],
    capital_assumptions_rows: Optional[List[Tuple[str, Any]]] = None,
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, Dict[str, str]], Dict[str, str]]:
    """
    Core function:
    - Call GPT for PnL rows + formulas.
    - Filter to valid assumptions.
    - Ensure COGS + Gross_Profit + Available_Initial_Capital rows.
    - Ensure EVERY row has a formula (non-constant fallback).
    - Return:
        pnl_tables, pnl_formulas, units, annotations
    """

    # All assumption labels (for reference)
    all_labs = _list_assumption_labels(assumptions_rows)

    # Numeric-only assumption labels (for formulas)
    numeric_labs = _numeric_assumption_labels(assumptions_rows)
    if not numeric_labs:
        # Safety fallback: if nothing is numeric, fall back to all labels.
        numeric_labs = all_labs

    # Show only numeric assumptions to GPT as valid for Assumptions[...]
    numeric_rows = [(lab, val) for (lab, val) in assumptions_rows if lab in numeric_labs]
    assumptions_preview = "\n".join(
        f"- {lab} = {val}" for lab, val in numeric_rows[:120]
    )

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
        max_tokens=MAX_TOKENS,
    )

    try:
        data = json.loads(content)
    except Exception:
        # Try to salvage a JSON snippet if the model wrapped it
        s, e = content.find("{"), content.rfind("}")
        if s == -1 or e == -1 or e <= s:
            raise RuntimeError("GPT did not return parseable JSON.")
        data = json.loads(content[s: e + 1])

    rows = data.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("GPT did not return any PnL rows.")

    # Filter out rows that reference non-numeric or unknown assumptions
    rows_ok = _filter_rows_to_valid_assumptions(rows, set(numeric_labs))
    if not rows_ok:
        raise RuntimeError(
            "All returned PnL rows referenced missing or non-numeric Assumptions labels."
        )

    # Ensure COGS exists
    rows_ok = _ensure_cogs_row(assumptions_rows, rows_ok)

    # Ensure Gross_Profit exists and references Assumptions[...]
    rows_ok = _ensure_gross_profit_row(assumptions_rows, rows_ok)

    # Ensure Available_Initial_Capital from capital assumptions (if provided)
    rows_ok = _append_initial_capital_row_from_capital(
        capital_assumptions_rows,
        rows_ok,
    )

    # Ensure ALL rows have formulas (no blanks, numeric-only assumptions as source)
    rows_ok = _ensure_all_formulas(rows_ok, numeric_labs)

    pnl_tables, pnl_formulas = _rows_to_wire("PnL", rows_ok)

    # units
    units: Dict[str, Dict[str, str]] = {"PnL": {}}
    for k, v in pnl_tables.items():
        m = _KEY_RE.match(k)
        if not m:
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        # label column, row >= 1
        if t == "PnL" and i == 0 and j >= 1:
            units["PnL"][v] = _infer_units_for_pnl_label(v)

    # annotation
    annotations = {
        "PnL": str(
            data.get("notes") or "Annual profit and loss derived from Assumptions."
        )
    }
    return pnl_tables, pnl_formulas, units, annotations

# ---------- Orchestrator ----------

def run_pnl_builder(
    user_prompt: str,
    assumptions_json: dict,
    capital_assumptions_json: Optional[dict] = None,
    *,
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
) -> Dict[str, Any]:
    """
    Top-level orchestrator used by Ion:
      - Parse assumptions & capital assumptions
      - Generate PnL via GPT with safeguards
      - Return artifact with tables, formulas, units, annotations
    """
    rows = _assumptions_rows(assumptions_json)
    if not rows:
        raise RuntimeError("No assumptions rows found.")

    capital_rows: Optional[List[Tuple[str, Any]]] = None
    if capital_assumptions_json is not None:
        try:
            capital_rows = _assumptions_rows(capital_assumptions_json)
        except Exception:
            # don't fail PnL if capital table is malformed
            capital_rows = None

    pnl_tables, pnl_formulas, pnl_units, pnl_ann = generate_pnl_via_gpt(
        user_prompt=user_prompt,
        assumptions_rows=rows,
        capital_assumptions_rows=capital_rows,
        model=model,
        temperature=temperature,
    )

    tables: Dict[str, str] = {}

    # Echo headers for reference (no assumption rows duplicated)
    tables[_key("Assumptions", 0, 0)] = "Label"
    tables[_key("Assumptions", 1, 0)] = "Value"

    # Optional echo for Capital_Assumptions header if we have that table
    if capital_rows:
        tables[_key("Capital_Assumptions", 0, 0)] = "Label"
        tables[_key("Capital_Assumptions", 1, 0)] = "Value"

    tables.update(pnl_tables)

    annotations: Dict[str, str] = {
        "Assumptions": "Header echo for reference",
    }
    if capital_rows:
        annotations["Capital_Assumptions"] = (
            "Header echo for capital assumptions"
        )
    annotations.update(pnl_ann)

    artifact: Dict[str, Any] = {
        "tables": tables,
        "formulas": pnl_formulas,
        "annotations": annotations,
        "units": pnl_units,
        "diagnostics": "NO_ISSUES_DETECTED",
    }
    return artifact


# ---------- Ion entry/exit ----------

def _main_ion(default_model: str = DEFAULT_MODEL) -> int:
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (user prompt).") from e

    try:
        assumptions_json = works.param(2)
    except Exception as e:
        raise RuntimeError(
            "Ion: param(2) must be the Assumptions JSON (inline or path)."
        ) from e

    # capital assumptions are optional
    capital_assumptions_json: Optional[dict] = None
    try:
        capital_assumptions_json = works.param(3)
    except Exception:
        capital_assumptions_json = None

    model = (works.param(4) or default_model)
    try:
        temperature = float(works.param(5) or DEFAULT_TEMPERATURE)
    except Exception:
        temperature = DEFAULT_TEMPERATURE

    try:
        artifact = run_pnl_builder(
            user_prompt=str(user_prompt),
            assumptions_json=assumptions_json,
            capital_assumptions_json=capital_assumptions_json,
            model=str(model),
            temperature=temperature,
        )
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve(
            {
                "status": "❌ error",
                "error": str(err),
                "where": "pnl-builder",
            }
        )
        raise


if __name__ == "__main__":
    works.msg("🔧 loading PnL builder…")
    _main_ion(DEFAULT_MODEL)
