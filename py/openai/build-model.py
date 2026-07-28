#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Three-stage AssignLang model builder + prior-results refinement.

Goals (strengthened):
  • Always start from a LARGE Assumptions table and build toward a complete PnL.
  • Generate a large, diverse set of interlinked finance tables and arithmetic-only formulas.
  • Enforce headers, sanitize labels, patch missing refs, normalize units, and refine.

Adds/fixes:
  • Graceful optional Ion integration (no-crash import).
  • Implemented remove_star_after_digit() used by label sanitizer.
  • Stronger scaffold to force ≥14 tables, ≥60 labeled rows, ≥120 formulas (≥8 per table).
  • Canonical finance tables required (Assumptions, Profit_and_Loss, Revenue, COGS, Opex, FTE/Hiring,
    Capex, Depreciation, Working_Capital, Taxes, Cash_Flow, KPIs, Outputs, Scenarios).
  • Post-pass seeding for Assumptions and Profit_and_Loss if missing via GPT-derived seeds (no hard-coded defaults).
  • Removed Excel-style function examples to comply with arithmetic-only rule.
  • Final post-process that removes all rows/entries whose keys (labels) start with "Auto_Label_".
  • SPEED UPS: Reuse OpenAI client, gated refine, labels-only payload to refine, formulas-only output with token caps.

Reliability upgrades:
  • Balanced JSON extractor that finds the first complete object, handling quotes/escapes and ```json fences.
  • Multi-strategy re-ask in getOpenAIModel: full → compact → skinny-with-size-cap → function-call fallback.
  • First-pass size target (≤~12k chars) to avoid truncation; pipeline expands later.
"""

import os
import sys
import json
import argparse
from typing import Optional, Dict, Any, Tuple, List, Set
import re

# ---------- Optional Ion integration ----------
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:
    class _Dummy:
        @staticmethod
        def msg(*args, **kwargs): pass
        @staticmethod
        def resolve(*args, **kwargs): pass
        @staticmethod
        def param(*args, **kwargs): raise RuntimeError("Ion not available")
    works = _Dummy()
    _HAS_ION = False

# ---------- OpenAI client ----------
# pip install -U openai
from openai import OpenAI

# ---------- DEFAULT GRAMMAR (can be overridden with --grammar-file) ----------
GRAMMAR = r"""
# (reserved for future grammar guards if you want to hard-validate tokens)
"""

# ---------- System prompt for JSON-only + grammar guard ----------
SYS_JSON_ONLY = (
    "Return ONLY a JSON object matching the provided JSON schema. "
    "No prose, no markdown, no code fences."
)

# ---------- Utilities ----------
def _extract_json_snippet(text: str) -> str:
    """
    Return the first *balanced* top-level JSON object from `text`.
    Handles ```json ... ``` fences, quoted braces, and escapes.
    """
    if not text:
        raise ValueError("Empty model output.")

    # Prefer fenced blocks if present
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S | re.I)
    if fence:
        return fence.group(1).strip()

    start = text.find("{")
    if start == -1:
        raise ValueError("No opening '{' found in model output.")

    depth = 0
    in_str = False
    esc = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start:idx + 1]

    raise ValueError("No complete JSON object found in model output.")

def _attempt_close_braces(text: str) -> str | None:
    """
    Very conservative last-ditch close-brace repair.
    Only appends missing '}' if we're not in a string and brace-depth is positive.
    """
    start = text.find("{")
    if start == -1:
        return None
    s = text[start:]
    depth = 0
    in_str = False
    esc = False
    for ch in s:
        if in_str:
            if esc: esc = False
            elif ch == "\\": esc = True
            elif ch == '"': in_str = False
        else:
            if ch == '"': in_str = True
            elif ch == "{": depth += 1
            elif ch == "}": depth -= 1
    if in_str or depth < 0:
        return None
    return s + ("}" * depth) if depth > 0 else None

def _to_jsonable(obj):
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_to_jsonable(v) for v in obj]
    for attr in ("model_dump_json", "to_json"):
        if hasattr(obj, attr):
            try:
                return json.loads(getattr(obj, attr)())
            except Exception:
                pass
    if hasattr(obj, "model_dump"):
        try:
            return _to_jsonable(obj.model_dump())
        except Exception:
            pass
    if hasattr(obj, "__dict__"):
        try:
            return _to_jsonable(vars(obj))
        except Exception:
            pass
    return str(obj)

def _json_dumps_compact(obj: Any, max_len: int = 6000) -> str:
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    if len(s) <= max_len:
        return s
    return s[: max_len - 100] + "...(truncated)..."

# ---------- Small helpers for Chat Completions ----------
_client_singleton = None
def _get_client():
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = OpenAI()
    return _client_singleton

def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.51,
    json_mode: bool = False,
    max_tokens: Optional[int] = None,
    top_p: Optional[float] = None,
) -> str:
    client = _get_client()
    kwargs = dict(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if top_p is not None:
        kwargs["top_p"] = top_p
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""

def _emit_once(*, model: str, system: str, user: str, temperature: float, max_tokens: int) -> str:
    out = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
        max_tokens=max_tokens,
    )
    try:
        print(f"[DEBUG] model_output_len={len(out or '')}", file=sys.stderr)
    except Exception:
        pass
    return out

def _try_parse_json_or_raise(text: str) -> dict:
    text = text or ""
    try:
        return json.loads(text)
    except Exception:
        try:
            return json.loads(_extract_json_snippet(text))
        except Exception:
            repaired = _attempt_close_braces(text)
            if repaired:
                return json.loads(repaired)
            raise

def generate_domain_block_and_anchor_hints(
    domain_prompt: str,
    grammar_text: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.1,
) -> Tuple[str, str]:
    sys_msg = (
        "You are a domain pack synthesizer for a grammar-driven modeling system.\n"
        "Return ONLY a JSON object with exactly two string fields: "
        '{"domain_block": "...", "anchor_hints": "..."}\n'
        "Hard target: produce anchor hints that enable many finance tables and ≥120 formulas."
    )

    user_msg = (
        "Build a domain pack and formula anchor hints for a startup financial model that begins with a large "
        "Assumptions table and culminates in a detailed Profit_and_Loss (PnL) table.\n\n"
        f"DOMAIN PROMPT:\n{domain_prompt}\n\n"
        "Hard rules:\n"
        "- All tables have 2 cols; [0:0][0:0]='Label', [1:1][0:0]='Value'.\n"
        "- Labels are unique and descriptive; formulas reference table[Label] (no quotes).\n"
        "- Provide many named tables that cover: Assumptions, Profit_and_Loss, Revenue, COGS, Operating_Expenses, "
        "FTE, Compensation, Capex, Depreciation, Working_Capital, Taxes, Cash_Flow, KPIs, Outputs, Scenarios.\n"
        "- Ensure strong inter-table relationships so PnL is fully computed from upstream tables.\n"
        "- Prefer dozens of labeled rows and ≥120 arithmetic-only formulas overall.\n"
    )

    content = _chat_call(
        model=model,
        system=sys_msg,
        user=user_msg,
        temperature=temperature,
        json_mode=True,
        max_tokens=4000,
    )
    data = json.loads(content)

    def _to_text(x):
        if x is None:
            return ""
        if isinstance(x, str):
            return x
        if isinstance(x, list):
            return "\n".join(str(i) for i in x)
        if isinstance(x, dict):
            return json.dumps(x, ensure_ascii=False, indent=2)
        return str(x)

    domain_block = _to_text(data.get("domain_block")).strip()
    anchor_hints = _to_text(data.get("anchor_hints")).strip()
    if not domain_block or not anchor_hints:
        raise ValueError("Model did not return both 'domain_block' and 'anchor_hints'.")
    return domain_block, anchor_hints

# ---------- Prompt expansion (strengthened) ----------
def _summarize_prior_for_prompt(prev: dict) -> str:
    if not prev:
        return ""
    try:
        tables = sorted({k.split("[", 1)[0] for k in (prev.get("tables") or {}).keys()})
        sample_formulas = list((prev.get("formulas") or {}).items())[:8]
        fkeys = [k for (k, _v) in sample_formulas]
        return (
            "PRIOR MODEL SUMMARY:\n"
            f"- Tables: {tables}\n"
            f"- Sample formula keys: {fkeys}\n"
        )
    except Exception:
        return "PRIOR MODEL (compact JSON):\n" + _json_dumps_compact(prev, 4000)

def expand_user_prompt(
    prompt: str,
    *,
    model: str = "gpt-4o",
    previous_results: Optional[dict] = None,
) -> str:
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

    sys_msg = (
        "Rewrite the user's request into one concise paragraph describing a startup financial model that:\n"
        "- Starts with a LARGE Assumptions table (defaults for prices, volumes, headcount plan, salaries, ramp, CAC/LTV, tax rates, depreciation years, DSOs/DPOs/Inventory_days, capex plan, funding tranches, runway target, contingencies).\n"
        "- Builds interlinked tables for Revenue, COGS, Opex (by function), Hiring/FTE, Compensation, Capex, Depreciation, Working_Capital, Taxes, Cash_Flow, KPIs, Scenarios.\n"
        "- Produces a full Profit_and_Loss table, burn rate, capital required, and runway.\n"
        "Plain English only (no lists/JSON/code)."
    )
    prior_block = _summarize_prior_for_prompt(previous_results) if previous_results else ""
    user_msg = (
        (f"(Refine using prior context.)\n{prior_block}\n\n" if prior_block else "")
        + "Expand this into the paragraph above while keeping details grounded in:\n"
        f"{prompt}"
    )

    content = _chat_call(
        model=model,
        system=sys_msg,
        user=user_msg,
        temperature=0.1,
        json_mode=False,
        max_tokens=800,
    )
    return (content or "").strip()

# ---------- System scaffold (strong, finance-focused) ----------
def build_system_scaffold(grammar_text: str, domain_block: str = "", anchor_hints: str = "") -> str:
    base = f"""
You are generating a structured model as JSON only.

FOMRULAS and TABLES (MANDATORY)
- All tables will have first column labels; no empty cells
- No duplicate rows
- All cells will have either a value defined in the tables object or a formula assigned to it in the formulas object
- formula assignments are only a single cell not a cell range!
- No formulas assigned to the left most column or the top most row 
- No formuals assigned to more than one cell
- Assign all values by single cell
- Assign all formulas by one single cell at a time 

OUTPUT CONTRACT (MANDATORY)
- Return ONLY a JSON object with exactly four top-level keys: "tables", "formulas", "annotations", "units". No prose.
- Keys in "tables" and "formulas" are single-cell addresses: "<table>[i:i][j:j]".
- All table names use underscores; no spaces; no dot notation; letters/digits/underscores only.
- All tables have 2 cols; [0:0][0:0]='Label', [1:1][0:0]='Value'.
- Label column [0:0][y:y] must be fully labeled and each label is unique within its table.
- Formulas appear only in "formulas" at keys "<table>[1:1][y:y]".
- References use named  labels that are relevant NO (Auto_label) ONLY: other_table[Field_Label]. No ranges. No dot notation. No quotes around labels.
- Allowed operators: + - * / ^ and parentheses only (no functions/macros/IF/etc.).
- Must include at least one inputs table (Assumptions) and output/result tables (Profit_and_Loss, KPIs, Outputs).

REQUIRED TABLES (MANDATORY — create only one of them if missing)
- Assumptions
- Profit_and_Loss
- Revenue
- COGS
- Operating_Expenses
- FTE
- Compensation
- Capex
- Depreciation
- Working_Capital
- Taxes
- Cash_Flow
- KPIs
- Outputs
- Scenarios

REQUIRED FORMULAS (MANDATORY — formulas should have at least one formula that assigns to these tables using the Assumptions table as a reference)
- FTE
- Compensation
- Capex
- Depreciation
- Taxes

REQUIRED Data in Assumptions TABLE (MANDATORY — must have these tables reference Assumptions via formulas)
- FTE
- Compensation
- Capex
- Depreciation
- Taxes

REQUIRED formulas for TABLES (MANDATORY — all tables below should have at least one formula)
- Assumptions
- Profit_and_Loss
- Revenue
- COGS
- Operating_Expenses
- FTE
- Compensation
- Capex
- Depreciation
- Working_Capital
- Taxes
- Cash_Flow
- KPIs

HEADER RULES (MANDATORY)
- For every table (2 columns):
  "<table>[0:0][0:0]" = "Label"
  "<table>[1:1][0:0]" = "Value"
  - Assign appropriate lables for each table no auto_label.  In other words do not put revenu in COGs
  do not use Auto_Label_1

FORMULA RULES
- No ranges like table[1:1][5:5]; convert all references to table[Label].
- No self-referential formulas.
- Replace whitespace in formulas with underscores ONLY where necessary for identifiers (but keep readability where possible).
- Every labeled row either has a constant in "tables" or a formula in "formulas".
  (No examples included to avoid suggesting non-arithmetic functions.)
- All labels and all variables and all table names must be deomain specific and not generic.  DO Not use Auto as a prefix\n
- EBITDA will be a fomrula derived at least in part from Assumptions 
- Profit will be a formula derived at least in part from Assumptions and other tables 

Example Formulas; these should use the qualified values that include both the table name and the field   
Revenue[1:1][1:1]=Assumptions[MonthlyPatients]*150
Revenue[1:1][2:2]=Assumptions[MonthlyPatients]*100
Revenue[1:1][3:3]=Assumptions[MonthlyPatients]*200
COGS[1:1][1:1]=0.1*Revenue[TotalRevenue]
Operating_Expenses[1:1][1:1]=FTE[AdminStaffFTE]*40000
FTE[1:1][1:1]=Assumptions[Developer_Count]+Assumptions[Marketing_Count]
Capex[1:1][1:1]=Assumptions[Server_Cost]+Assumptions[Office_Equipment_Cost]
Depreciation[1:1][1:1]=Capex[Server_Cost]/Assumptions[YearsOperating]
Taxes[1:1][1:1]=Profit_and_Loss[Net_Income]*Assumptions[Corporate_Tax_Rate]
Profit_and_Loss[1:1][1:1]=Revenue[TotalRevenue]-COGS[TotalCOGS]-Operating_Expenses[TotalOperatingExpenses]
Profit_and_Loss[1:1][2:2]=Profit_and_Loss[TotalRevenue]-COGS[TotalCOGS]
Profit_and_Loss[1:1][3:3]=Profit_and_Loss[TotalRevenue]-Operating_Expenses[TotalOperatingExpenses]
Profit_and_Loss[1:1][4:4]=Profit_and_Loss[TotalRevenue]-Taxes[Net_Income]
Profit_and_Loss[1:1][1:1]=Revenue[ConsultationFees]+Revenue[ProcedureRevenue]
Profit_and_Loss[1:1][2:2]=COGS[SuppliesCost]
Profit_and_Loss[1:1][3:3]=Profit_and_Loss[Revenue]-Profit_and_Loss[COGS]
Profit_and_Loss[1:1][4:4]=Operating_Expenses[RentCost]+Operating_Expenses[StaffSalaries]
Profit_and_Loss[1:1][5:5]=Profit_and_Loss[Gross_Profit]-Profit_and_Loss[Operating_Expenses]
Profit_and_Loss[1:1][6:6]=Depreciation[AnnualDepreciation]
Profit_and_Loss[1:1][7:7]=Profit_and_Loss[EBITDA]-Profit_and_Loss[Depreciation]
Profit_and_Loss[1:1][8:8]=Taxes[TaxRate]*Profit_and_Loss[EBIT]
Profit_and_Loss[1:1][9:9]=Profit_and_Loss[EBIT]-Profit_and_Loss[Taxes]
Profit_and_Loss[1:1][10:10]=Profit_and_Loss[Operating_Expenses]/Assumptions[MonthsInYear]
Revenue[1:1][1:1]=Assumptions[MonthlyPatients]*150
Revenue[1:1][2:2]=50*Assumptions[MonthlyPatients]
Revenue[1:1][3:3]=Revenue[ConsultationFees]+Revenue[ProcedureRevenue]
COGS[1:1][1:1]=0.1*Revenue[TotalRevenue]
Operating_Expenses[1:1][2:2]=FTE[AdminStaffFTE]*40000
Depreciation[1:1][1:1]=Capex[MedicalEquipment]/Assumptions[YearsOperating]
Cash_Flow[1:1][1:1]=Profit_and_Loss[Net_Income]+Depreciation[AnnualDepreciation]+Capex[MedicalEquipment]
KPIs[1:1][1:1]=Profit_and_Loss[Gross_Profit]/Revenue[TotalRevenue]
Outputs[1:1][1:1]=Profit_and_Loss[Net_Income]

CONSISTENCY RULES
- If a formula references other_table[Field_Label], ensure "tables" contains that table with headers and a Field_Label row (default constants allowed).
- All referenced labels must exist. If missing, create them with default "0" in tables.
- unique and distinct variale and label names for each table 
- all  tablename[Field]  referenced in a formulas must have the corresponding  label (Field) defined in the tables dictionary 
- No table is created unless it all cells referenced by eithre tables or formulas
- For every table (2 columns):
  "<table>[0:0][0:0]" = "Label"
  "<table>[1:1][0:0]" = "Value"
  - Assign appropriate lables for each table no auto_label.  In other words do not put revenu in COGs
  do not use Auto_Label_1

UNITS & ANNOTATIONS
- Provide one-sentence "annotations" per table.
- Provide "units": map of table -> Label -> unit string covering all labels and KPIs (e.g., USD, count, months, percent, unitless).

VALIDATION CHECKLIST
- JSON only; exactly four top-level keys.
- First-pass size target: keep total JSON under ~12,000 characters; prioritize required tables and headers.
- Aim for ≥60 labeled rows and ≥120 formulas overall, but if size would be exceeded in the first pass, include ≤5 rows per table and ≤8 formulas per table while maintaining PnL connectivity. Later refinement will expand.
- variable names and/or label values should only contain alphabet values and use underscore instead of whitespace
- Headers present for every table.
- No ranges; no functions; arithmetic-only.
- All referenced labels exist (create with default '0' if needed).
- Every labeled row has either a constant or a formula.
- Provide units for all labels and outputs.
- No table is created unless it all cells referenced by eithre tables or formulas
- All formulas with references to tables must validate that the field exists mytable[1:1][1:1]=tablename[field]+tablename[field2] the tablename[field] and tablename[field2] must exist
- For every table (2 columns):
  "<table>[0:0][0:0]" = "Label"
  "<table>[1:1][0:0]" = "Value"
  - Assign appropriate lables for each table no auto_label.  In other words do not put revenu in COGs
  do not use Auto_Label_1

ANCHOR HINTS:
{anchor_hints}

{domain_block}
"""
    return base

# ---------- Stage 2: JSON-constrained model build ----------
def getOpenAIModel(
    prompt: str,
    model: str,
    grammar_text: str,
    *,
    scaffold_model: str | None = None,
    temperature: float = 0.2,
    return_all: bool = True,
) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

    scaffold_model = scaffold_model or model

    try:
        domain_block, anchor_hints = generate_domain_block_and_anchor_hints(
            domain_prompt=prompt,
            grammar_text=grammar_text,
            model=scaffold_model,
            temperature=temperature,
        )
        sys_scaffold = build_system_scaffold(grammar_text, domain_block=domain_block, anchor_hints=anchor_hints)
        scaffold_info = {"domain_block": domain_block, "anchor_hints": anchor_hints, "sys_scaffold": sys_scaffold}
    except Exception as e:
        sys_scaffold = build_system_scaffold(grammar_text)
        scaffold_info = {"domain_block": None, "anchor_hints": None, "sys_scaffold": sys_scaffold, "generation_error": str(e)}

    system = SYS_JSON_ONLY + "\n\n" + sys_scaffold
    user = prompt

    # ---- Multi-strategy emission with robust parsing ----
    max_out = 16000  # use the largest your account/model supports
    # 1) Primary attempt (full)
    content = _emit_once(model=model, system=system, user=user, temperature=temperature, max_tokens=max_out)
    try:
        output = _try_parse_json_or_raise(content)
    except Exception:
        # 2) Compact re-emit of SAME object
        compact_user = (
            user
            + "\n\nRE-EMIT COMPACT JSON:\n"
              "- Return the SAME JSON object, but minimize whitespace and shorten string values if necessary.\n"
              "- Keep ALL keys and structure.\n"
              "- NO explanations, NO code fences."
        )
        content2 = _emit_once(model=model, system=system, user=compact_user, temperature=temperature, max_tokens=max_out)
        try:
            output = _try_parse_json_or_raise(content2)
        except Exception:
            # 3) Skinny emit with strict size cap
            skinny_user = (
                user
                + "\n\nSKINNY EMIT (SIZE CAP):\n"
                  "- Emit a VALID JSON object with exactly the four keys: tables, formulas, annotations, units.\n"
                  "- Keep TOTAL output under ~10,000 characters.\n"
                  "- Include ALL required tables with headers, but at most 5 labeled rows per table.\n"
                  "- Include formulas, but at most 8 per table; ensure Profit_and_Loss ties together.\n"
                  "- Keep annotations/units terse. JSON only."
            )
            content3 = _emit_once(model=model, system=system, user=skinny_user, temperature=temperature, max_tokens=max_out)
            try:
                output = _try_parse_json_or_raise(content3)
            except Exception:
                # 4) Function-call fallback: guaranteed JSON via tool call
                client = _get_client()
                tools = [{
                    "type": "function",
                    "function": {
                        "name": "emit_model",
                        "description": "Return the model JSON in the function arguments.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "tables": {"type": "object"},
                                "formulas": {"type": "object"},
                                "annotations": {"type": "object"},
                                "units": {"type": "object"},
                            },
                            "required": ["tables", "formulas", "annotations", "units"],
                            "additionalProperties": False,
                        },
                    },
                }]
                tool_choice = {"type": "function", "function": {"name": "emit_model"}}
                system_fc = system + "\nRespond ONLY by calling the function emit_model with the JSON."
                resp = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_fc},
                        {"role": "user", "content": user},
                    ],
                    temperature=0.0,
                    tools=tools,
                    tool_choice=tool_choice,
                    max_tokens=16000,
                )
                tcalls = resp.choices[0].message.tool_calls or []
                if not tcalls:
                    raise ValueError("No tool call returned.")
                args = tcalls[0].function.arguments or "{}"
                output = json.loads(args)

    raw_dump = {"content": content}
    if not return_all:
        return output

    return {
        "output": output,
        "request": {"model": model, "temperature": temperature, "system": system, "user": user},
        "scaffold": scaffold_info,
        "raw_response": _to_jsonable(raw_dump),
        "usage": None,
    }

# ---------- Diagnostics ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _parse_cell_key(k: str) -> Optional[Tuple[str, int, int]]:
    m = _KEY_RE.match(k or "")
    if not m:
        return None
    t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
    return (t, i, j)

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _diagnose_model_payload(final_json: dict) -> str:
    try:
        tables = dict((final_json or {}).get("tables") or {})
        formulas = dict((final_json or {}).get("formulas") or {})
        units = dict((final_json or {}).get("units") or {})
        annotations = dict((final_json or {}).get("annotations") or {})

        present_tables: Set[str] = set()
        for k in list(tables.keys()) + list(formulas.keys()):
            parsed = _parse_cell_key(k)
            if parsed:
                present_tables.add(parsed[0])

        labels_by_table: Dict[str, Dict[int, str]] = {}
        label_to_rows: Dict[str, Dict[str, List[int]]] = {}
        for k, v in tables.items():
            parsed = _parse_cell_key(k)
            if not parsed:
                continue
            t, i, j = parsed
            if i == 0 and j >= 1 and isinstance(v, str):
                labels_by_table.setdefault(t, {})[j] = v
                label_to_rows.setdefault(t, {}).setdefault(v, []).append(j)

        dups: Dict[str, List[str]] = {}
        for t, d in label_to_rows.items():
            dup_labels = [lab for lab, rows in d.items() if len(rows) > 1]
            if dup_labels:
                dups[t] = dup_labels

        missing_tables: Set[str] = set()
        missing_labels: Set[Tuple[str, str]] = set()
        self_refs: List[str] = []
        illegal_tokens: List[str] = []
        range_like: List[str] = []
        dot_notation: List[str] = []

        for k, expr in formulas.items():
            if not isinstance(expr, str):
                continue
            if re.search(r'\[\d+:\d+\]\[\d+:\d+\]', expr):
                range_like.append(k)
            if re.search(r'[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]', expr):
                dot_notation.append(k)

            refs = extract_named_refs(expr)
            key_parsed = _parse_cell_key(k)
            key_label = None
            if key_parsed:
                kt, _ki, kj = key_parsed
                key_label = labels_by_table.get(kt, {}).get(kj)

            # flag function-like tokens (not table[Label])
            if re.search(r'[A-Za-z_][A-Za-z0-9_]*\s*\(', re.sub(_LABEL_REF_ANY_RE, '', expr)):
                illegal_tokens.append(k)

            for (rt, rlab) in refs:
                if rt not in present_tables:
                    missing_tables.add(rt)
                if rlab not in set(labels_by_table.get(rt, {}).values()):
                    missing_labels.add((rt, rlab))
                if key_parsed and key_label and rt == key_parsed[0] and rlab == key_label:
                    self_refs.append(k)

        missing_headers = []
        for t in present_tables:
            if tables.get(_key(t, 0, 0)) != "Label" or tables.get(_key(t, 1, 0)) != "Value":
                missing_headers.append(t)

        tables_needing_units = []
        for t, rowmap in labels_by_table.items():
            utab = (units or {}).get(t, {})
            if not isinstance(utab, dict) or any(lab not in utab for lab in rowmap.values()):
                tables_needing_units.append(t)

        anno_gaps = [t for t in present_tables if t not in (annotations or {})]

        def _join(items, maxn=12):
            items = list(items)
            if len(items) > maxn:
                return ', '.join(map(str, items[:maxn])) + f", +{len(items)-maxn} more"
            return ', '.join(map(str, items))

        parts = []
        if missing_tables:
            parts.append(f"MISSING_TABLES: {_join(sorted(missing_tables))}")
        if missing_labels:
            parts.append("MISSING_LABELS: " + _join([f"{t}[{lab}]" for (t, lab) in sorted(missing_labels)]))
        if dups:
            parts.append("DUPLICATE_LABELS: " + _join([f"{t}:{'/'.join(sorted(v))}" for t, v in dups.items()]))
        if self_refs:
            parts.append("SELF_REFERENCES_AT: " + _join(self_refs))
        if range_like:
            parts.append("RANGE_REFS_AT: " + _join(range_like))
        if dot_notation:
            parts.append("DOT_NOTATION_AT: " + _join(dot_notation))
        if illegal_tokens:
            parts.append("ILLEGAL_FUNC_TOKENS_AT: " + _join(illegal_tokens))
        if missing_headers:
            parts.append("MISSING_HEADERS: " + _join(missing_headers))
        if tables_needing_units:
            parts.append("UNITS_GAPS: " + _join(tables_needing_units))
        if anno_gaps:
            parts.append("ANNOTATION_GAPS: " + _join(anno_gaps))

        return "\n".join(parts) or "NO_ISSUES_DETECTED"
    except Exception as e:
        return f"DIAGNOSTICS_FAILED: {e}"

# ---------- Refinement ----------
def refine_model_with_chat(
    model_json: dict,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.01,
) -> dict:
    try:
        if not os.environ.get("OPENAI_API_KEY"):
            return model_json or {}

        compact_json = _json_dumps_compact(model_json or {}, max_len=120_000)
        diag = _diagnose_model_payload(model_json or {})

        sys_msg = (
            "You are a STRICT validator-repairer for a finance spreadsheet model.\n"
            "Return ONLY a JSON object with EXACTLY four keys: tables, formulas, annotations, units.\n"
            "MANDATES:\n"
            "- Keep content where sensible; repair rather than erase.\n"
            "- Ensure EVERY referenced table[Label] exists; create missing labels with default '0' in tables.\n"
            "- Deduplicate labels per table with numeric suffixes (_2, _3, ...); UPDATE all formulas.\n"
            "- NO ranges, NO dot-notation, NO functions; only + - * / ^ and parentheses.\n"
            "- NO self-referential formulas.\n"
            "- Ensure headers for every table: [0:0][0:0]='Label', [1:1][0:0]='Value'.\n"
            "- Ensure EVERY labeled row has either a constant (tables) or a formula (formulas).\n"
            "- Provide concise annotations and units for all labels.\n"
            "- Ensure presence and connectivity of Assumptions and Profit_and_Loss; PnL must be computed from upstream tables.\n"
            "- You MAY add up to 4 new tables and ≥24 new formulas that logically integrate.\n"
            "- JSON only. No prose."
        )

        user_msg = (
            "CURRENT MODEL JSON followed by DIAGNOSTICS. REPAIR and RETURN JSON ONLY.\n\n"
            "=== CURRENT_MODEL_JSON ===\n"
            f"{compact_json}\n\n"
            "=== DIAGNOSTICS ===\n"
            f"{diag}\n\n"
            "REPAIR & NORMALIZE:\n"
            "- Create any missing tables/labels; initialize missing constants as '0'.\n"
            "- Deduplicate labels; update formulas.\n"
            "- Rewrite any range/dot/function usage to arithmetic-only named refs.\n"
            "- Ensure headers, coverage, units, annotations.\n"
            "- Make sure Profit_and_Loss aggregates Revenue, COGS, Opex, Depreciation, Taxes, to Net_Income; expose Gross_Margin, EBITDA, Burn_Rate, Capital_Required, Runway."
        )

        content = _chat_call(
            model=model,
            system=sys_msg,
            user=user_msg,
            temperature=temperature,
            json_mode=True,
            max_tokens=4000,
        )

        try:
            refined = json.loads(content or "{}")
        except Exception:
            refined = json.loads(_extract_json_snippet(content or ""))

        if not isinstance(refined, dict):
            return model_json or {}
        for k in ("tables", "formulas", "annotations", "units"):
            refined.setdefault(k, {})

        return refined
    except Exception:
        return model_json or {}

# ---------- Reference & sanitation helpers ----------
_REF_RE = re.compile(
    r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>(?:[A-Za-z_][A-Za-z0-9_]*|"[^"\n\r]*"))\]'
)

def extract_named_refs(formula: str) -> List[Tuple[str, str]]:
    refs: List[Tuple[str, str]] = []
    for m in _REF_RE.finditer(formula or ""):
        table = m.group("table")
        raw_label = m.group("label")
        if raw_label.startswith('"') and raw_label.endswith('"'):
            label = raw_label[1:-1]
        else:
            label = raw_label
        refs.append((table, label))
    return refs

def _next_row_index_for_table(tables: Dict[str, Any], table: str) -> int:
    max_j = 0
    for k in tables.keys():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, _i, j = parsed
        if t == table and j > max_j:
            max_j = j
    return max(1, max_j + 1)

def ensure_table_and_field(
    tables: Dict[str, Any],
    table: str,
    field_label: str,
    default_value: str = "0",
) -> None:
    if _key(table, 0, 0) not in tables:
        tables[_key(table, 0, 0)] = "Label"
    if _key(table, 1, 0) not in tables:
        tables[_key(table, 1, 0)] = "Value"

    for k, v in list(tables.items()):
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if t == table and i == 0 and j >= 1 and isinstance(v, str) and v == field_label:
            return

    j = _next_row_index_for_table(tables, table)
    tables[_key(table, 0, j)] = field_label
    tables[_key(table, 1, j)] = default_value

def validate_and_patch_references(final_json: dict, default_value: str = "0") -> dict:
    data = dict(final_json or {})
    tables: Dict[str, Any] = dict(data.get("tables") or {})
    formulas: Dict[str, Any] = dict(data.get("formulas") or {})

    for key, expr in formulas.items():
        if not isinstance(expr, str):
            continue
        refs = extract_named_refs(expr)
        for (t, label) in refs:
            ensure_table_and_field(tables, t, label, default_value=default_value)

    data["tables"] = tables
    return data

def strip_whitespace_in_formulas(final_json: dict) -> dict:
    data = dict(final_json or {})
    formulas = dict(data.get("formulas") or {})

    for k, v in list(formulas.items()):
        if not isinstance(v, str):
            continue
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        _table, i, _j = parsed
        if i == 1:
            formulas[k] = re.sub(r"\s+", "", v)

    data["formulas"] = formulas
    return data

_RANGE_REF_RE = re.compile(
    r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<xi>\d+):\d+\]\[(?P<yj>\d+):\d+\]'
)
_IDENT_LABEL_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

def _quote_label_if_needed(label: str) -> str:
    if _IDENT_LABEL_RE.match(label or ""):
        return label
    escaped = label.replace('\\', '\\\\').replace('"', '\\"')
    return f'"{escaped}"'

def rewrite_formulas_to_named_refs(final_json: dict) -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    label_by_row: dict[tuple[str, int], str] = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str):
            label_by_row[(t, j)] = v

    def _sub_ref(m: re.Match) -> str:
        t = m.group("table")
        yj = int(m.group("yj"))
        label = label_by_row.get((t, yj))
        if not label:
            return m.group(0)
        return f"{t}[{_quote_label_if_needed(label)}]"

    for k, v in list(formulas.items()):
        if not isinstance(v, str):
            continue
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        _t, i, _j = parsed
        if i == 1:
            formulas[k] = _RANGE_REF_RE.sub(_sub_ref, v)

    data["formulas"] = formulas
    return data

_LABEL_REF_ANY_RE = re.compile(
    r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>[^\[\]]+)\]'
)

# ---------- GPT-driven defaults for missing table[label] references ----------
def _collect_present_labels_by_table(tables: Dict[str, Any]) -> Dict[str, Set[str]]:
    """Map: table -> set(labels already present in that table)."""
    by_table: Dict[str, Set[str]] = {}
    for k, v in (tables or {}).items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str) and v.strip():
            by_table.setdefault(t, set()).add(v)
    return by_table

def _find_missing_refs(final_json: dict) -> Dict[str, Set[str]]:
    """Return a mapping of table -> {labels} that are referenced in formulas but missing in tables."""
    tables = dict((final_json or {}).get("tables") or {})
    formulas = dict((final_json or {}).get("formulas") or {})
    present = _collect_present_labels_by_table(tables)

    missing: Dict[str, Set[str]] = {}
    for expr in formulas.values():
        if not isinstance(expr, str):
            continue
        for (t, label) in extract_named_refs(expr):
            # ignore range-like or nested bracket stuff
            if ":" in (label or "") or "[" in (label or "") or "]" in (label or ""):
                continue
            if label not in present.get(t, set()):
                missing.setdefault(t, set()).add(label)
    return missing

def _fetch_gpt_defaults_for_missing_refs(
    *,
    domain_prompt: str,
    missing: Dict[str, Set[str]],
    units: Optional[Dict[str, Dict[str, str]]] = None,
    model: str = "gpt-4o-mini",
) -> Dict[str, Dict[str, str]]:
    """
    Ask the model for realistic default values for the exact missing refs.
    Returns: { table: { label: value_str, ... }, ... }
    If API not available or returns nothing, we return {} and the caller can decide how to proceed.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        return {}

    # Build a compact ask, including any unit hints to guide realism.
    want = {t: sorted(list(lbls)) for t, lbls in (missing or {}).items()}
    unit_hints = {}
    if isinstance(units, dict):
        for t, u in units.items():
            if isinstance(u, dict):
                unit_hints[t] = {k: v for k, v in u.items() if isinstance(v, str)}

    sys_msg = (
        "Return ONLY a JSON object mapping table names to objects of label->value.\n"
        "Numbers should be plain JSON numbers when appropriate; short text otherwise.\n"
        "Values must be conservative and realistic for a startup finance model.\n"
        "Do not include prose, comments, or units in the values themselves."
    )
    user_msg = json.dumps({
        "domain_prompt": (domain_prompt or "Financial model"),
        "missing_refs": want,
        "unit_hints": unit_hints,
    }, ensure_ascii=False)

    try:
        content = _chat_call(
            model=model,
            system=sys_msg,
            user=user_msg,
            temperature=0.15,
            json_mode=True,
            max_tokens=1200,
        )
        data = json.loads(content or "{}")
        # Coerce to strings to be consistent with existing table value convention
        out: Dict[str, Dict[str, str]] = {}
        if isinstance(data, dict):
            for t, mapping in data.items():
                if isinstance(mapping, dict):
                    out[t] = {str(k): str(v) for k, v in mapping.items()}
        return out
    except Exception:
        return {}

def remove_self_referencing_formulas(final_json: dict) -> dict:
    """
    For each formula cell <Table>[1:1][row:row], if the formula references Table[<that row's label>],
    delete the whole row:
      - tables["Table"][0:0][row:row] (label cell)
      - tables["Table"][1:1][row:row] (value cell)
      - formulas entry for that cell
      - units["Table"][<label>] (if present)

    Returns a new dict with removals applied. Also returns a small 'report' in final_json['_selfref_report'].
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})

    # Build quick lookup: (table, row) -> label
    labels_by_row = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str):
            labels_by_row[(t, j)] = v

    # Find rows to delete
    rows_to_delete = []  # list of (table, row, label, formula_key)
    for fkey, expr in list(formulas.items()):
        parsed = _parse_cell_key(fkey)
        if not parsed:
            continue
        t, i, j = parsed
        if i != 1 or j < 1:
            continue

        # label in this row
        row_label = labels_by_row.get((t, j))
        if not isinstance(row_label, str) or not row_label:
            continue

        # Does formula reference Table[row_label]?
        refs = extract_named_refs(expr if isinstance(expr, str) else "")
        if any((rt == t and rlab == row_label) for (rt, rlab) in refs):
            rows_to_delete.append((t, j, row_label, fkey))

    # Apply deletions
    for (t, j, row_label, fkey) in rows_to_delete:
        label_key = _key(t, 0, j)
        value_key = _key(t, 1, j)
        if fkey in formulas:
            del formulas[fkey]
        if label_key in tables:
            del tables[label_key]
        if value_key in tables:
            del tables[value_key]
        # purge units entry for that label, if any
        if isinstance(units.get(t), dict) and row_label in units[t]:
            del units[t][row_label]

    data["tables"] = tables
    data["formulas"] = formulas
    data["units"] = units

    # Optional: small report of what was removed
    data["_selfref_report"] = [
        {"table": t, "row": j, "label": lab, "formula_key": fk}
        for (t, j, lab, fk) in rows_to_delete
    ]
    return data

def validate_and_patch_references_gpt(
    final_json: dict,
    *,
    domain_prompt: str = "",
    model: str = "gpt-4o-mini",
    fallback_empty: bool = True
) -> dict:
    """
    Ensures that for every formula reference Table[Field], the tables section
    contains a Label row 'Field' in 'Table'. Values are requested from GPT.
    If GPT cannot be used or returns nothing and fallback_empty=True, rows are created with empty string values.
    """
    data = dict(final_json or {})
    tables: Dict[str, Any] = dict(data.get("tables") or {})
    formulas: Dict[str, Any] = dict(data.get("formulas") or {})
    units: Dict[str, Any] = dict(data.get("units") or {})

    # 1) Find what's missing
    missing = _find_missing_refs(data)
    if not missing:
        data["tables"] = tables
        return data

    # 2) Ask GPT for defaults
    gpt_defaults = _fetch_gpt_defaults_for_missing_refs(
        domain_prompt=domain_prompt,
        missing=missing,
        units=units if isinstance(units, dict) else {},
        model=model,
    )

    # 3) Apply values (GPT-driven). If GPT doesn't provide a value for a requested label,
    #    optionally create the row with empty string (no hard-coded numeric default).
    for table_name, labels in missing.items():
        # Ensure headers exist
        if _key(table_name, 0, 0) not in tables:
            tables[_key(table_name, 0, 0)] = "Label"
        if _key(table_name, 1, 0) not in tables:
            tables[_key(table_name, 1, 0)] = "Value"

        provided = (gpt_defaults.get(table_name) or {})
        for label in labels:
            # If already present due to earlier steps, skip
            already = False
            for k, v in tables.items():
                parsed = _parse_cell_key(k)
                if not parsed:
                    continue
                t, i, j = parsed
                if t == table_name and i == 0 and j >= 1 and v == label:
                    already = True
                    break
            if already:
                continue

            value = provided.get(label)
            if value is None and fallback_empty:
                value = ""  # keep empty string rather than a hard-coded numeric default

            # Insert row if we have either a GPT value or we allow empty fallback
            if value is not None:
                j = _next_row_index_for_table(tables, table_name)
                tables[_key(table_name, 0, j)] = label
                tables[_key(table_name, 1, j)] = str(value)

    data["tables"] = tables
    return data

def _looks_like_range_token(s: str) -> bool:
    return bool(re.fullmatch(r'\d+:\d+', s.strip()))

def sanitize_label_tokens_in_formula_text(expr: str) -> str:
    def _sub(m: re.Match) -> str:
        table = m.group('table')
        label = m.group('label')
        if _looks_like_range_token(label):
            return m.group(0)
        cleaned = re.sub(r'[\*\+/\-]+', '', label)
        cleaned = re.sub(r'__+', '_', cleaned).strip('_')
        return f"{table}[{cleaned}]"
    return _LABEL_REF_ANY_RE.sub(_sub, expr)

def sanitize_formulas_labels(final_json: dict) -> dict:
    data = dict(final_json or {})
    formulas = dict(data.get("formulas") or {})

    for k, v in list(formulas.items()):
        if isinstance(v, str):
            formulas[k] = sanitize_label_tokens_in_formula_text(v)

    data["formulas"] = formulas
    return data

def _needs_fix_star_after_digit(label: str) -> bool:
    return bool(re.search(r'\d\*', label or ""))

def remove_star_after_digit(label: str) -> str:
    # Remove '*' immediately following a digit inside label tokens (e.g., "Year_1*_Revenue" -> "Year_1_Revenue")
    return re.sub(r'(\d)\*', r'\1_', label or "").replace("__", "_").strip("_")

def _quote_or_unquote_label_for_ref(label: str) -> str:
    return label if _IDENT_LABEL_RE.match(label or "") else f'"{label}"'

def normalize_labels_remove_star_after_digit(final_json: dict) -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    remap: Dict[str, Dict[str, str]] = {}
    for k, v in list(tables.items()):
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str) and _needs_fix_star_after_digit(v):
            fixed = remove_star_after_digit(v)
            if fixed != v and fixed:
                tables[k] = fixed
                remap.setdefault(t, {})[v] = fixed

    if not remap:
        data["tables"] = tables
        data["formulas"] = formulas
        return data

    def _rewrite_refs(expr: str) -> str:
        if not isinstance(expr, str):
            return expr
        def _sub(m: re.Match) -> str:
            table = m.group('table')
            raw_label = m.group('label')
            label_is_quoted = raw_label.startswith('"') and raw_label.endswith('"')
            label_unquoted = raw_label[1:-1] if label_is_quoted else raw_label
            new_label = remap.get(table, {}).get(label_unquoted)
            if not new_label:
                return m.group(0)
            out_label = _quote_or_unquote_label_for_ref(new_label)
            return f"{table}[{out_label}]"
        return _LABEL_REF_ANY_RE.sub(_sub, expr)

    for fk, fv in list(formulas.items()):
        if isinstance(fv, str):
            formulas[fk] = _rewrite_refs(fv)

    data["tables"] = tables
    data["formulas"] = formulas
    return data

def enforce_column_headers(final_json: dict) -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    table_names: Set[str] = set()
    for d in (tables, formulas):
        for k in d.keys():
            parsed = _parse_cell_key(k)
            if parsed:
                table_names.add(parsed[0])

    for t in list(table_names):
        hdr_label_key = _key(t, 0, 0)
        hdr_value_key = _key(t, 1, 0)
        if hdr_label_key in formulas:
            tables.setdefault(hdr_label_key, formulas.pop(hdr_label_key))
        if hdr_value_key in formulas:
            tables.setdefault(hdr_value_key, formulas.pop(hdr_value_key))
        if tables.get(hdr_label_key) != "Label":
            tables[hdr_label_key] = "Label"
        if tables.get(hdr_value_key) != "Value":
            tables[hdr_value_key] = "Value"

    data["tables"] = tables
    return data

def enforce_units(final_json: dict, default_unit: str = "unitless") -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})

    labels_by_table: Dict[str, Set[str]] = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str):
            labels_by_table.setdefault(t, set()).add(v)

    incoming_units = data.get("units")
    table_defaults: Dict[str, str] = {}
    normalized_units: Dict[str, Dict[str, str]] = {}

    if isinstance(incoming_units, dict):
        for t, val in incoming_units.items():
            if isinstance(val, dict):
                normalized_units[t] = dict(val)
            elif isinstance(val, str):
                table_defaults[t] = val
                normalized_units[t] = {}
            else:
                normalized_units[t] = {}
    else:
        normalized_units = {}

    for t, labels in labels_by_table.items():
        normalized_units.setdefault(t, {})
        per_table_default = table_defaults.get(t, default_unit)
        for lab in labels:
            if lab not in normalized_units[t] or not isinstance(normalized_units[t][lab], str):
                normalized_units[t][lab] = per_table_default

    data["units"] = normalized_units
    return data

def ensure_row_labels_for_formula_rows(final_json: dict, *, label_prefix: str = "Auto_Label") -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    existing_labels_by_table: Dict[str, Set[str]] = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str) and v.strip():
            existing_labels_by_table.setdefault(t, set()).add(v)

    def _unique_label(t: str, base: str) -> str:
        used = existing_labels_by_table.setdefault(t, set())
        if base not in used:
            used.add(base)
            return base
        n = 2
        while True:
            cand = f"{base}_{n}"
            if cand not in used:
                used.add(cand)
                return cand
            n += 1

    for fk in list(formulas.keys()):
        parsed = _parse_cell_key(fk)
        if not parsed:
            continue
        t, i, j = parsed
        if i != 1 or j < 1:
            continue
        label_key = _key(t, 0, j)
        cur_label = tables.get(label_key)

        if not isinstance(cur_label, str) or not cur_label.strip():
            expr = formulas.get(fk, "")
            refs = extract_named_refs(expr)
            if refs:
                derived = refs[0][1]
                derived_clean = re.sub(r'[^A-Za-z0-9_]+', '_', derived).strip('_') or f"{label_prefix}_{j}"
                base = derived_clean
            else:
                base = f"{label_prefix}_{j}"
            new_label = _unique_label(t, base)
            tables[label_key] = new_label

        if tables.get(_key(t, 0, 0)) != "Label":
            tables[_key(t, 0, 0)] = "Label"
        if tables.get(_key(t, 1, 0)) != "Value":
            tables[_key(t, 1, 0)] = "Value"

    data["tables"] = tables
    return data

# ---------- NEW: prune tables not referenced by any formula ----------
def prune_unreferenced_tables(final_json: dict) -> dict:
    """
    Remove any tables for which *no* formula in the entire model references that table.
    This deletes:
      - All 'tables' entries whose table name is unreferenced
      - All 'formulas' entries whose LHS table is unreferenced
      - Matching 'units' and 'annotations' entries for those tables
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})
    annotations = dict(data.get("annotations") or {})

    # 1) Collect set of tables that are referenced on the RHS of any formula
    referenced: Set[str] = set()
    for expr in (formulas or {}).values():
        if not isinstance(expr, str):
            continue
        for (rt, _lab) in extract_named_refs(expr):
            referenced.add(rt)

    if not referenced:
        # If nothing is referenced, drop everything (strict interpretation)
        data["tables"] = {}
        data["formulas"] = {}
        data["units"] = {}
        data["annotations"] = {}
        return data

    # 2) Filter maps to keep only referenced tables
    def _filter_by_table_name_map(d: Dict[str, Any]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for k, v in (d or {}).items():
            parsed = _parse_cell_key(k)
            if not parsed:
                continue
            t, _i, _j = parsed
            if t in referenced:
                out[k] = v
        return out

    pruned_tables = _filter_by_table_name_map(tables)
    pruned_formulas = _filter_by_table_name_map(formulas)

    pruned_units: Dict[str, Dict[str, str]] = {}
    for t, umap in (units or {}).items():
        if t in referenced and isinstance(umap, dict):
            pruned_units[t] = dict(umap)

    pruned_annotations: Dict[str, str] = {}
    for t, note in (annotations or {}).items():
        if t in referenced:
            pruned_annotations[t] = note

    data["tables"] = pruned_tables
    data["formulas"] = pruned_formulas
    data["units"] = pruned_units
    data["annotations"] = pruned_annotations
    return data

# ---------- Prior results merge (non-destructive) ----------
def merge_with_previous(new_json: dict, prior_json: Optional[dict]) -> dict:
    if not prior_json:
        return new_json or {}

    out = dict(new_json or {})
    for top in ("tables", "formulas", "annotations", "units"):
        new_map = dict(out.get(top) or {})
        prior_map = dict(prior_json.get(top) or {})
        for k, v in prior_map.items():
            if k not in new_map:
                new_map[k] = v
        out[top] = new_map
    return out

# ---------- Post-pass: ensure key finance tables exist & GPT-derived seeding ----------
_REQUIRED_TABLES = [
    "Assumptions",
    "Profit_and_Loss",
    "Revenue",
    "COGS",
    "Operating_Expenses",
    "FTE",
    "Compensation",
    "Capex",
    "Depreciation",
    "Working_Capital",
    "Taxes",
    "Cash_Flow",
    "KPIs",
    "Outputs",
    "Scenarios",
]

def _fetch_gpt_finance_seeds(domain_prompt: str, *, model: str = "gpt-4o-mini") -> Dict[str, Dict[str, str]]:
    """
    Ask the model for realistic, startup-appropriate default values.
    Returns {"Assumptions": {label: value_str, ...}, "Profit_and_Loss": {label: value_str, ...}}
    If the call fails or API is not configured, returns empty dicts (structure-only fallback).
    """
    if not os.environ.get("OPENAI_API_KEY"):
        return {"Assumptions": {}, "Profit_and_Loss": {}}
    sys_msg = (
        "Return ONLY a JSON object with two keys Assumptions and Profit_and_Loss. "
        "Each key maps to an object of label->value (numbers or short strings). "
        "Keep values strictly JSON-safe (no units in the values; numbers as numbers; strings otherwise). "
        "Choose conservative, realistic seed values suitable for an early-stage startup model. "
        "Avoid zeros unless truly appropriate."
    )
    user_msg = (
        "Given this domain prompt, propose initial seeds for a LARGE Assumptions table and a PnL scaffold.\n\n"
        f"{domain_prompt}\n\n"
        "Assumptions labels to include at minimum: Start_Year, Currency, Price_Per_Unit, Monthly_Units_Year_1, "
        "Unit_Cost, Sales_Ramp_Months, Headcount_Year_1, Avg_Salary, Benefits_Load, Rent_Per_Month, "
        "Marketing_Per_Month, R&D_Per_Month, G&A_Per_Month, Tax_Rate, Depreciation_Years, Capex_Year_1, "
        "DSO_Days, DPO_Days, Inventory_Days, Initial_Cash, Target_Runway_Months, Contingency_Pct.\n"
        "Profit_and_Loss labels to include at minimum: Revenue, COGS, Gross_Profit, Operating_Expenses, EBITDA, "
        "Depreciation."
    )
    try:
        content = _chat_call(
            model=model,
            system=sys_msg,
            user=user_msg,
            temperature=0.15,
            json_mode=True,
            max_tokens=2000,
        )
        data = json.loads(content or "{}")
        # Coerce everything to strings to match table value convention
        out = {"Assumptions": {}, "Profit_and_Loss": {}}
        for t in out.keys():
            if isinstance(data.get(t), dict):
                for k, v in data[t].items():
                    out[t][str(k)] = str(v)
        return out
    except Exception:
        return {"Assumptions": {}, "Profit_and_Loss": {}}

def seed_required_tables(final_json: dict, *, domain_prompt: str = "", model: str = "gpt-4o-mini") -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})

    def _ensure_table(tname: str):
        if _key(tname, 0, 0) not in tables:
            tables[_key(tname, 0, 0)] = "Label"
        if _key(tname, 1, 0) not in tables:
            tables[_key(tname, 1, 0)] = "Value"

    for t in _REQUIRED_TABLES:
        _ensure_table(t)

    # Ask GPT for seeds (structure-first; content from model)
    gpt_seeds = _fetch_gpt_finance_seeds(domain_prompt or "Early-stage startup financial model", model=model)
    for tname, rowmap in gpt_seeds.items():
        for lab, val in rowmap.items():
            ensure_table_and_field(tables, tname, lab, default_value=val if val is not None else "0")

    data["tables"] = tables
    return data

# ---------- FINAL POST-PROCESS: strip Auto_Label_* rows and unit entries ----------
def _is_autolabel(s: Any) -> bool:
    return isinstance(s, str) and s.startswith("Auto_Label_")

def strip_auto_labels(final_json: dict) -> dict:
    """
    Removes any table rows where the label value starts with 'Auto_Label_' and
    prunes matching entries in formulas (same row), and in units (label keys).
    Note: formulas that *reference* those labels remain unchanged, by design.
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})
    annotations = dict(data.get("annotations") or {})

    # 1) Identify rows with Auto_Label_* in label column and remove the row in tables + its value cell + its formula cell.
    # Build per-table mapping of row index -> label for quick deletes.
    to_delete_rows: Dict[str, Set[int]] = {}

    for k, v in list(tables.items()):
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and _is_autolabel(v):
            to_delete_rows.setdefault(t, set()).add(j)

    # Delete those rows from tables
    for t, rows in to_delete_rows.items():
        for j in rows:
            label_key = _key(t, 0, j)
            value_key = _key(t, 1, j)
            if label_key in tables:
                del tables[label_key]
            if value_key in tables:
                del tables[value_key]
            # Remove a formula assigned to that exact value cell, if any
            if value_key in formulas:
                del formulas[value_key]

    # 2) Prune units entries keyed by the same Auto_Label_* labels.
    if isinstance(units, dict):
        for t, umap in list(units.items()):
            if not isinstance(umap, dict):
                continue
            for lab in list(umap.keys()):
                if _is_autolabel(lab):
                    del umap[lab]

    # 3) (Optional) If annotations contained any Auto_Label_* keys (unlikely; annotations are per-table), prune them.
    if isinstance(annotations, dict):
        for ak in list(annotations.keys()):
            if _is_autolabel(ak):
                del annotations[ak]

    data["tables"] = tables
    data["formulas"] = formulas
    data["units"] = units
    data["annotations"] = annotations
    return data

# ---------- SPEED HELPERS: reduce tokens sent to refine ----------
def _strip_values_from_tables(tables: Dict[str, Any]) -> Dict[str, Any]:
    """Keep [0:0][*:*] (labels) and [1:1][0:0] (Value header) only."""
    out = {}
    for k, v in (tables or {}).items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if (i == 0) or (i == 1 and j == 0):  # label col or Value header
            out[k] = v
    return out

def _needs_refine(full_json: dict) -> bool:
    diag = _diagnose_model_payload(full_json or "") or ""
    triggers = (
        "RANGE_REFS_AT",       # table[1:1][5:5] etc.
        "DOT_NOTATION_AT",     # table.label
        "ILLEGAL_FUNC_TOKENS", # func(...)
        "DUPLICATE_LABELS",    # duplicates
        "SELF_REFERENCES_AT",  # self refs
        "MISSING_HEADERS",     # missing headers (rare after your pass)
    )
    return any(tok in diag for tok in triggers)

def refine_formulas_only_with_chat(
    model_json: dict,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.0,
    max_tokens: int = 4000,
) -> dict:
    """
    Sends a pruned view (labels only) + current formulas and asks the model
    to return ONLY a corrected 'formulas' object. We then merge locally.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        return model_json or {}

    pruned_tables = _strip_values_from_tables((model_json or {}).get("tables") or {})
    formulas = (model_json or {}).get("formulas") or {}
    compact_payload = {
        "tables": pruned_tables,   # labels only
        "formulas": formulas       # full formulas
    }

    diag = _diagnose_model_payload(model_json or {})

    sys_msg = (
        "You are a STRICT validator-repairer for a finance spreadsheet model.\n"
        "Return ONLY a JSON object with exactly one key: 'formulas'. No prose.\n"
        "Rules:\n"
        "- Fix references to use table[Label] only (no ranges/dots/functions).\n"
        "- Remove self-references (a formula must not reference its own row label in the same table).\n"
        "- Keep arithmetic-only: + - * / ^ and parentheses.\n"
        "- Do not invent new tables or labels; use only labels present in the provided label column.\n"
        "- Preserve keys (cell addresses) for formulas; update only the right-hand sides."
    )

    user_msg = (
        "CURRENT (labels-only tables + formulas):\n"
        + _json_dumps_compact(compact_payload, max_len=80_000)
        + "\n\nDIAGNOSTICS:\n" + str(diag) +
        "\n\nTASK: Return JSON with a single key 'formulas' containing corrected formulas only."
    )

    content = _chat_call(
        model=model,
        system=sys_msg,
        user=user_msg,
        temperature=temperature,
        json_mode=True,
        max_tokens=max_tokens,
        top_p=0.9,
    )

    try:
        out = json.loads(content or "{}")
    except Exception:
        out = json.loads(_extract_json_snippet(content or ""))

    if isinstance(out, dict) and isinstance(out.get("formulas"), dict):
        merged = dict(model_json or {})
        merged["formulas"] = out["formulas"]
        # Local cleanups to guarantee consistency
        merged = strip_whitespace_in_formulas(merged)
        merged = rewrite_formulas_to_named_refs(merged)
        merged = remove_self_referencing_formulas(merged)
        return merged
    return model_json or {}





def _assure_assumption_numeric(tables: Dict[str, Any], label: str, default_value: str = "0") -> None:
    """Guarantee Assumptions[label] exists as a constant; create if missing."""
    ensure_table_and_field(tables, "Assumptions", label, default_value)

def _years_from_start(tables: Dict[str, Any], count: int = 10) -> List[int]:
    """Read Assumptions[Start_Year] (or 2024) and return [Y, Y+1, ...]."""
    # Find Start_Year constant if already present
    start = 2024
    for k, v in (tables or {}).items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if t == "Assumptions" and i == 0 and j >= 1 and v == "Start_Year":
            val = tables.get(_key("Assumptions", 1, j))
            try:
                start = int(float(str(val).strip()))
            except Exception:
                start = 2024
            break
    return [start + i for i in range(count)]

def _mk_year_table_labels(tables: Dict[str, Any], tname: str, years: List[int]) -> None:
    """Create header + year labels for a 2-col table; values are left blank (we’ll fill with formulas)."""
    ensure_table_and_field(tables, tname, "___PLACEHOLDER___", "0")  # ensures headers exist
    # Remove the placeholder label/value we just inserted (row index may vary)
    for k in list(tables.keys()):
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if t == tname and i == 0 and j >= 1 and tables.get(k) == "___PLACEHOLDER___":
            del tables[_key(tname, 0, j)]
            if _key(tname, 1, j) in tables:
                del tables[_key(tname, 1, j)]
            break

    # Append year labels in order
    row = 1
    for y in years:
        tables[_key(tname, 0, row)] = str(y)  # label column
        tables[_key(tname, 1, row)] = ""      # value (formula will fill)
        row += 1

def _set_year_formula(formulas: Dict[str, Any], tname: str, yrow: int, expr: str) -> None:
    """Assign a formula to a specific year row (col=1)."""
    formulas[_key(tname, 1, yrow)] = expr







# ---------- Main pipeline ----------
def run_two_stage(
    user_prompt: str,
    model: str,
    grammar_text: str,
    *,
    outdir: Optional[str] = None,
    previous_results: Optional[dict] = None,
    max_first_pass_retries: int = 2,
    refine_rounds_per_pass: int = 1,  # kept for API, not used in fast refine path
    stop_when_good: bool = True,
) -> Dict[str, Any]:
    if outdir:
        os.makedirs(outdir, exist_ok=True)

    if _HAS_ION:
        works.msg("Expanding scope...")

    # expanded = expand_user_prompt(user_prompt, model=model, previous_results=previous_results)
    expanded = user_prompt

    if _HAS_ION:
        works.msg("Building model with iterative refinement...")

    def _score_candidate(js: dict) -> Tuple[int, int]:
        f = js.get("formulas") or {}
        t = js.get("tables") or {}
        return (len(f), len(f) + len(t))

    best_refined: Optional[dict] = None
    best_score: Tuple[int, int] = (0, 0)

    attempt = 0
    cur_temp = 0.01

    while True:
        attempt += 1

        first = getOpenAIModel(
            expanded,
            model=model,
            grammar_text=grammar_text,
            scaffold_model=model,
            temperature=cur_temp,
            return_all=True,
        )
        raw_out = first.get("output", {}) or {}

        # --- Local hygiene BEFORE refine ---
        final_json = raw_out
        final_json = enforce_column_headers(final_json)
        final_json = sanitize_formulas_labels(final_json)

        final_json = remove_self_referencing_formulas(final_json)
        final_json = validate_and_patch_references_gpt(
            final_json,
            domain_prompt=expanded,
            model=model,
            fallback_empty=True  # creates the label with "" if GPT isn't available
        )

        final_json = ensure_row_labels_for_formula_rows(final_json)
        final_json = enforce_units(final_json, default_unit="unitless")
        final_json = seed_required_tables(final_json, domain_prompt=expanded, model=model)  # GPT-derived seeds
        final_json = merge_with_previous(final_json, previous_results)
        final_json = normalize_labels_remove_star_after_digit(final_json)
        final_json = strip_whitespace_in_formulas(final_json)
        final_json = rewrite_formulas_to_named_refs(final_json)
        final_json = ensure_row_labels_for_formula_rows(final_json)
        final_json = enforce_units(final_json, default_unit="unitless")

        # --- FAST Refinement (gated, formulas-only) ---
        refined = final_json
        if _needs_refine(final_json):
            refined_next = refine_formulas_only_with_chat(refined, model=model, temperature=0.0, max_tokens=3000)
            for k in ("tables", "formulas", "annotations", "units"):
                refined_next.setdefault(k, {})

            # Light local hygiene
            refined_next = ensure_row_labels_for_formula_rows(refined_next)
            refined_next = enforce_units(refined_next, default_unit="unitless")
            refined_next = strip_whitespace_in_formulas(refined_next)
            refined_next = rewrite_formulas_to_named_refs(refined_next)
            refined_next = remove_self_referencing_formulas(refined_next)

            refined = refined_next

        # --- NEW: prune any tables not referenced by formulas anywhere ---
        refined = prune_unreferenced_tables(refined)

        s = _score_candidate(refined)
        if s > best_score:
            best_score = s
            best_refined = refined

        has_formulas = bool((refined.get("formulas") or {}))
        if _HAS_ION:
            works.msg(f"Attempt {attempt}: formulas={len(refined.get('formulas') or {})}, score={best_score}")

        if stop_when_good and has_formulas:
            break

        if attempt >= max_first_pass_retries:
            if _HAS_ION:
                works.msg(f"Max attempts ({max_first_pass_retries}) reached; using best candidate.")
            break

        cur_temp = min(cur_temp + 0.4, 0.9)
        if _HAS_ION:
            works.msg(f"No acceptable formulas yet; retrying (attempt {attempt+1}, temp={cur_temp})")

    if best_refined is None:
        best_refined = {"tables": {}, "formulas": {}, "annotations": {}, "units": {}}

    # === FINAL POST-PROCESS: strip all Auto_Label_* keys/rows ===
    best_refined = strip_auto_labels(best_refined)

    bundle = {
        "expanded_prompt": expanded,
        "first_pass": {"attempts": attempt},
        "refined": best_refined,
    }

    if outdir:
        with open(os.path.join(outdir, "expanded_prompt.txt"), "w", encoding="utf-8") as f:
            f.write(expanded)
        with open(os.path.join(outdir, "final.json"), "w", encoding="utf-8") as f:
            json.dump(best_refined, f, ensure_ascii=False, indent=2)

    return bundle

# ---------- CLI ----------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Three-stage AssignLang builder with optional prior-results refinement."
    )
    p.add_argument("prompt", help="Natural language description.")
    p.add_argument("--model", default="gpt-4o-mini", help="Model ID (default: gpt-4o-mini)")
    p.add_argument("--out", dest="out_path", help="Path to write ONLY the final JSON output (default: stdout)")
    p.add_argument("--outdir", help="Directory to dump expanded prompt and full response bundle")
    p.add_argument("--grammar-file", help="Path to a grammar file to override the default", default=None)
    p.add_argument("--temperature", type=float, default=0.2, help="Sampling temperature")
    p.add_argument("--prev", dest="prev_input", help="Path to previous results JSON OR inline JSON text", default=None)
    return p

def _load_grammar(grammar_file: Optional[str]) -> str:
    if grammar_file:
        with open(grammar_file, "r", encoding="utf-8") as f:
            return f.read()
    return GRAMMAR

def _load_json_from_path_or_text(s: Optional[str]) -> Optional[dict]:
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    if s.startswith("{") or s.startswith("["):
        return json.loads(s)
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    if not _HAS_ION:
        raise RuntimeError("Ion entrypoint called but Ion is not available.")
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (prompt).") from e
    works.msg("Model loaded")
    try:
        bundle = run_two_stage(
            user_prompt=str(user_prompt),
            model=default_model,
            grammar_text=GRAMMAR,
            outdir=None
        )
        works.resolve(bundle)
        return 0
    except Exception as e:
        raise RuntimeError(f"Ion pipeline failed: {e}") from e

# Optional Ion autostart (safe no-op if Ion missing)
if _HAS_ION and __name__ == "__main__":
    works.msg('loading model')
    _main_ion('gpt-4.1-mini')

# End of file
