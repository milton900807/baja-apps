#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Two-stage AssignLang model builder.

Stage 1: Expand the user's prompt into a richer paragraph (no JSON).
         Incorporates an existing "current_model" 2D wells[column][row] JSON as context
         and forces the expansion to end with a single sentence beginning
         with "Final assignment:".
Stage 2: Use that expanded text as the prompt to the JSON-constrained AssignLang scaffold.

- No recursion.
- Exactly two OpenAI calls.
- CLI and Ion entry preserved.
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
    _HAS_ION = False

# ---------- OpenAI client ----------
# pip install -U openai
from openai import OpenAI

# ---------- DEFAULT GRAMMAR (can be overridden with --grammar-file) ----------
GRAMMAR = r"""
grammar AssignLang;

/* Entry points:
 *   - LHS: parse with `target`
 *   - RHS: parse with `expr`
 */

// ---------- LHS ----------
target
  : IDENT LBRACK range RBRACK LBRACK range RBRACK EOF
  ;

// A numeric range x:y where x,y are integers
range
  : INT COLON INT
  ;

// ---------- RHS ----------
expr
  : sumExpr EOF
  ;

sumExpr
  : prodExpr ( (PLUS | MINUS) prodExpr )*
  ;

prodExpr
  : powExpr ( (MUL | DIV) powExpr )*
  ;

powExpr
  : atom ( POW atom )*
  ;

atom
  : NUMBER
  | reference2D          // [x1:x2][y1:y2] numeric-only
  | referenceKeyed2D     // [Col][Row] keys-only
  | referenceKeyedPair   // [Col,Row] keys-only (single bracket form)
  | functionCall
  | LPAREN expr RPAREN
  ;

// ---------- References ----------

// Positional 2D slice: table[xstart:xend][ystart: yend]  (numeric-only)
reference2D
  : IDENT LBRACK range RBRACK LBRACK range RBRACK
  ;

// Keyed header reference (two brackets): table[ColHeader][RowHeader] (keys-only)
referenceKeyed2D
  : IDENT LBRACK colKey RBRACK LBRACK rowKey RBRACK
  ;

// Keyed header reference (single bracket): table[ColHeader, RowHeader] (keys-only)
referenceKeyedPair
  : IDENT LBRACK colKey COMMA rowKey RBRACK
  ;

// ---------- Functions ----------
functionCall
  : IDENT LPAREN ( expr ( COMMA expr )* )? RPAREN
  ;

// ---------- Keys ----------
colKey
  : keyTok
  ;

rowKey
  : keyTok
  ;

keyTok
  : IDENT
  | STRING
  ;

// ---------- LEXER ----------
IDENT  : [A-Za-z] [A-Za-z] ;
NUMBER : INT ( '.' [0-9]+ )? ;
INT    : [0-9]+ ;
STRING : '"' (~["\\] | '\\' .)* '"' ;

PLUS:'+'; MINUS:'-'; MUL:'*'; DIV:'/'; POW:'^';
LPAREN:'(' ; RPAREN:')' ;
LBRACK:'[' ; RBRACK:']' ;
COMMA:',' ; COLON:':' ;

WS : [ \t\r\n]+ -> skip ;
"""

# ---------- System prompt for JSON-only + grammar guard ----------
SYS_JSON_ONLY = (
    "Return ONLY a JSON object matching the provided JSON schema. "
    "No prose, no markdown, no code fences. "
)

# ---------- Utilities ----------
def _extract_json_snippet(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return text[start:end+1].strip()

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

# ---------- Current-model helpers ----------
def _compact_json(obj: Any, max_chars: int = 20000) -> str:
    try:
        s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        s = str(obj)
    if len(s) > max_chars:
        return s[:max_chars] + "...(truncated)"
    return s

def _summarize_well_table(current_model: Any, max_samples: int = 12) -> str:
    try:
        wells = None
        if isinstance(current_model, dict):
            wells = current_model.get("wells")
        elif isinstance(current_model, list):
            wells = current_model  # raw 2D array wells[col][row]
        cols = len(wells) if isinstance(wells, list) else 0
        rows = len(wells[0]) if cols and isinstance(wells[0], list) else 0

        samples = []
        if cols and rows:
            for x in range(cols):
                col = wells[x]
                if not isinstance(col, list):
                    continue
                for y in range(rows):
                    w = col[y]
                    if w is None:
                        continue
                    if isinstance(w, dict):
                        keys = list(w.keys())[:5]
                        samples.append({"x": x, "y": y, "keys": keys})
                    else:
                        samples.append({"x": x, "y": y, "value_type": type(w).__name__})
                    if len(samples) >= max_samples:
                        break
                if len(samples) >= max_samples:
                    break

        summary = [
            f"Array shape: cols={cols} rows={rows}",
            f"Sample populated cells (up to {max_samples}): {json.dumps(samples, ensure_ascii=False)}"
        ]
        return "\n".join(summary)
    except Exception as e:
        return f"(could not summarize current_model: {e})"

def _prepare_current_model_context(current_model: Any) -> str:
    summary = _summarize_well_table(current_model)
    compact = _compact_json(current_model, max_chars=15000)
    return (
        "CURRENT MODEL (2D well table; indexed wells[column][row])\n"
        f"{summary}\n\n"
        "CURRENT_MODEL_JSON:\n"
        f"{compact}\n"
    )

def _load_current_model_input(arg: Optional[str]) -> Optional[Any]:
    if not arg:
        return None
    if os.path.exists(arg) and os.path.isfile(arg):
        with open(arg, "r", encoding="utf-8") as f:
            txt = f.read()
    else:
        txt = arg
    try:
        return json.loads(txt)
    except Exception:
        return txt  # allow raw string context if not valid JSON

# ---------- Domain pack/anchor synthesis ----------
def generate_domain_block_and_anchor_hints(
    domain_prompt: str,
    grammar_text: str,
    *,
    model: str = "gpt-5",
    temperature: float = 0.2,
) -> Tuple[str, str]:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI()

    sys_msg = (
        "You are a domain pack synthesizer for a grammar-driven modeling system.\n"
        "Return ONLY a JSON object with exactly two string fields: "
        "`domain_block` and `anchor_hints`.\n\n"
        "Requirements for `domain_block`:\n"
        "- It will be interpolated verbatim into a scaffold under {domain_block}.\n"
        "- Use the following headings and structure (exactly these labels):\n"
        "  DOMAIN-SPECIFICITY RULES (MANDATORY):\n"
        "  REQUIRED TABLES (use underscores, no spaces):\n"
        "  ADDITIONAL HARD RULES:\n"
        "- Use imperative, concise bullets.\n"
        "- Include realistic entities/constraints derived from the user's domain_prompt.\n\n"
        "Requirements for `anchor_hints`:\n"
        "- Provide >10 minimal, structure-only formula examples that MATCH THIS GRAMMAR STYLE:\n"
        "  TableName[column_label][row${i}] and range selectors like [1:12], never dot notation.\n"
        "- Do NOT invent formulas outside the user's grammar; only +, -, *, /, ^ and parentheses.\n"
        "- Show how to compute KPIs by combining table fields (structure only, not values).\n"
        "- No code fences; plain text only.\n\n"
        "Global constraints:\n"
        "- Be specific to the domain_prompt; avoid generic templates unless requested.\n"
        "- Use snake_case names; do not start names with digits; no dot-notation; fully-qualify references.\n"
        "- REQUIRED TO PROVIDE >20 domain-specific tables that are used in calculating >10 formulas and USE all tables at least once in the formulas\n\n"
        "- ENSURE ALL OPEN BRACKETS ARE MATCHED WITH CLOSING BRACKETS"
    )

    user_msg = (
        "Build a domain pack and formula anchor hints for the following domain:\n\n"
        f"{domain_prompt}\n\n"
        "Also consider this grammar so your formula shapes match its addressing rules:\n"
        "---- GRAMMAR START ----\n"
        "---- GRAMMAR END ----\n"
    )

    input_payload = [
        {"role": "system", "content": [{"type": "input_text", "text": sys_msg}]},
        {"role": "user",   "content": [{"type": "input_text", "text": user_msg}]},
    ]

    def _to_jsonable_local(obj):
        try:
            return _to_jsonable(obj)
        except Exception:
            return str(obj)

    try:
        resp = OpenAI().responses.create(
            model=model,
            input=input_payload,
            response_format={"type": "json_object"},
            temperature=temperature,
        )
        data = json.loads(resp.output_text)
    except TypeError as e:
        if "unexpected keyword argument 'response_format'" not in str(e):
            raise
        resp = OpenAI().responses.create(model=model, input=input_payload, temperature=temperature)
        raw = getattr(resp, "output_text", None) or str(resp)
        data = json.loads(_extract_json_snippet(raw))

    if isinstance(data, list):
        data = data[0] if data else {}

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

# ---------- UNITS example (escaped braces for f-strings) ----------
UNITS_EXAMPLE = '''
"units": {{
  "trial_inputs": {{
    "GMP_Cost_Per_Unit": "USD/unit",
    "Units_Required_For_GMP": "count",
    "Clinical_Trial_Cost_Per_Patient": "USD",
    "Number_of_Employees": "count"
  }},
  "design_table": {{
    "Samples": "count",
    "Captures_Per_Sample": "count",
    "Cells_Per_Sample": "cells",
    "Capture_Cost_Per_Capture": "USD"
  }},
  "trial_outputs": {{
    "Total sample costs": "USD",
    "Total capture cost": "USD",
    "Number of cells": "cells",
    "Total cost of patients": "USD",
    "Total cost of GMP": "USD"
  }}
}}
'''.strip()

# ---------- Scaffold builder ----------
def build_system_scaffold(grammar_text: str, domain_block: str = "", anchor_hints: str = "") -> str:
    base = f"""You are generating a structured model as JSON only.

OUTPUT CONTRACT
- Return ONLY a JSON object with exactly four top-level keys: "tables", "formulas", "annotations", "units".
- "tables" and "formulas" are FLAT dictionaries containing ONLY single-cell assignments using the grammar: tablename[i:i][j:j] = value.
- "annotations" is a dictionary describing the purpose of EVERY table created.
- "units" maps table names to dicts of label -> unit string, covering all labeled rows and all output KPIs.
- All in "tables" are referenced in "formulas"  

STRICT GRAMMAR (MANDATORY)
- Assignments must be single-cell, inclusive:exclusive indices: [i:i][j:j] (no ranges).
- NEVER use brackets without a table name. ALWAYS "tablename[...][...]".
- Use underscores for names; do not start names with digits; no dot-notation.
- All tables have EXACTLY two columns:
  - Column 0 (x=0): label strings.
  - Column 1 (x=1): value constants (for inputs & domain tables) or formulas (for outputs).
- EVERY table MUST assign column headers BEFORE any data rows:
  - tablename[0:0][0:0] = "Label"
  - tablename[1:1][0:0] = "Value"
- DO NOT USE RANGE REFERENCES IN TABLES OR FORMULAS. Only named single-field references in formulas: other_table[Field_Name].

TABLE NAME SYNTHESIS (MANDATORY)
- Derive exactly two canonical tables from user_input and {domain_block}:
  1) inputs_table_name (e.g., trial_inputs, bioprocess_inputs, revenue_inputs, pk_inputs) → constants only.
  2) outputs_table_name (e.g., trial_outputs, bioprocess_outputs, financial_outputs, pk_outputs) → KPI labels (tables) and formulas (formulas).
- Use these names consistently; do not use 'assumptions' or 'results'.

INPUTS TABLE (MANDATORY)
- Must exist and include headers:
  - inputs_table_name[0:0][0:0] = ""
  - inputs_table_name[1:1][0:0] = "Value"
- Provide ≥10 input rows (y ≥ 1). Each row:
  - inputs_table_name[0:0][y:y] = <Label>
  - inputs_table_name[1:1][y:y] = <Constant value>
- No formulas inside inputs_table_name.
- EVERY input value MUST be consumed by at least one formula.

OUTPUTS TABLE (MANDATORY)
- Must exist and include headers:
  - outputs_table_name[0:0][0:0] = ""
  - outputs_table_name[1:1][0:0] = "Value"
- Each row splits across both dictionaries:
  - In "tables": outputs_table_name[0:0][y:y] = <Human_readable_Label>
  - In "formulas": outputs_table_name[1:1][y:y] = "<formula>"
- Formulas must NOT start with "=".
- Formulas cannot assign to itself and also reference itself:  outputs_table_name[1:1][1:1] = "219*outputs_table[1:1][1:1]"

DOMAIN TABLES (MANDATORY)
- Define >10 additional domain-specific two-column tables (e.g., manufacturing_plan, dose_schedule, enrollment_curve, pk_pd_data, cost_buckets, pricing_scenarios, risk_register, risk_assessment, throughput_plan, capacity_model, quality_metrics, regulatory_timeline, supply_chain, resource_plan, scenario_flags).
- For EACH domain table:
  - Assign headers exactly:
    - table[0:0][0:0] = "Label"
    - table[1:1][0:0] = "Value"
  - Provide single-cell default values for needed fields:
    - table[0:0][y:y] = "Some_Field_Name"
    - table[1:1][y:y] = "<default number or string>"
  - Reference the table at least once in "formulas".

CRITICAL CONSISTENCY RULE
- If any formula references tablename[Field_Name], then the "tables" dictionary MUST include:
  - tablename[0:0][0:0] = "Label"
  - tablename[1:1][0:0] = "Value"
  - A row where:
    - tablename[0:0][y:y] = "Field_Name"
    - tablename[1:1][y:y] = <default constant>

FORMULAS DICTIONARY (MANDATORY)
- "formulas" contains ONLY single-cell keys with integer indices:
  - "<table_name>[i:i][j:j]": "<formula string>"
- Formulas use ONLY fully-qualified named references:
  - other_table[Field_Name]
- No ranges, no bare column references, no dot notation, no "=" prefix.
- Define >10 total formulas.
- Ensure there is NO overlap between any key present in "tables" and any key in "formulas".

ANNOTATIONS (MANDATORY)
- For EVERY table, add an entry:
  - "table_name": "<one-sentence description of what this table represents>"
- Include entries for the canonical inputs and outputs tables.

UNITS (MANDATORY)
- Provide a top-level "units" dictionary mapping table names to dictionaries of field label -> unit string.
- For every labeled cell in "tables" (inputs & domain tables) and every KPI label in the outputs table, include a unit.
- Use standard strings (e.g., "USD", "USD/unit", "mg/kg", "cells", "count", "unitless").
- Keys in units MUST match the exact label strings used in the first column of each table.
- Example shape:
  {UNITS_EXAMPLE}

MUST-HAVE EXPLICIT SHAPE EXAMPLE (PATTERN TO FOLLOW)
- Every table must look like this pattern in "tables" (example names only):
  "trial_inputs[0:0][0:0]": "Label",
  "trial_inputs[1:1][0:0]": "Value",
  "trial_inputs[0:0][1:1]": "GMP_Cost_Per_Unit",
  "trial_inputs[1:1][1:1]": "50000",
  "trial_inputs[0:0][2:2]": "Units_Required_For_GMP",
  "trial_inputs[1:1][2:2]": "100",
  "trial_inputs[0:0][3:3]": "Clinical_Trial_Cost_Per_Patient",
  "trial_inputs[1:1][3:3]": "20000",
  "trial_inputs[0:0][4:4]": "Number_of_Employees",
  "trial_inputs[1:1][4:4]": "8",

  "design_table[0:0][0:0]": "Label",
  "design_table[1:1][0:0]": "Value",
  "design_table[0:0][1:1]": "Samples",
  "design_table[1:1][1:1]": "120",
  "design_table[0:0][2:2]": "Captures_Per_Sample",
  "design_table[1:1][2:2]": "800",
  "design_table[0:0][3:3]": "Cells_Per_Sample",
  "design_table[1:1][3:3]": "10000",
  "design_table[0:0][4:4]": "Capture_Cost_Per_Capture",
  "design_table[1:1][4:4]": "5",

  "fte_salaries[0:0][0:0]": "Label",
  "fte_salaries[1:1][0:0]": "Value",
  "fte_salaries[0:0][1:1]": "Salary_Per_FTE",
  "fte_salaries[1:1][1:1]": "180000"

- And every outputs formula assignment follows this shape in "formulas":
  "trial_outputs[0:0][1:1]": "Total sample costs",
  "trial_outputs[1:1][1:1]": "design_table[Samples]*design_table[Captures_Per_Sample]",
  "trial_outputs[0:0][2:2]": "Total capture cost",
  "trial_outputs[1:1][2:2]": "design_table[Samples]*design_table[Captures_Per_Sample]*design_table[Capture_Cost_Per_Capture]",
  "trial_outputs[0:0][3:3]": "Number of cells",
  "trial_outputs[1:1][3:3]": "design_table[Samples]*design_table[Cells_Per_Sample]",
  "trial_outputs[0:0][4:4]": "Total cost of patients",
  "trial_outputs[1:1][4:4]": "design_table[Samples]*trial_inputs[Clinical_Trial_Cost_Per_Patient]",
  "trial_outputs[0:0][5:5]": "Total cost of GMP",
  "trial_outputs[1:1][5:5]": "trial_inputs[Units_Required_For_GMP]*trial_inputs[GMP_Cost_Per_Unit]",

VALIDATION CHECKLIST (ENFORCE ALL)
- JSON only; no prose.
- Exactly four top-level keys: tables, formulas, annotations, units.
- Every table has string headers at [0:0][0:0] and [1:1][0:0] set to "Label" and "Value".
- No ranges anywhere; only single-cell assignments.
- inputs_table_name has ≥10 labeled constants; all used by formulas.
- outputs_table_name exists; labels in "tables", formulas in "formulas".
- domain tables; each referenced in at least one formula.
- Every formula reference tablename[Field_Name] has a matching row in that table with a default value.
- No overlapping keys between "tables" and "formulas".
- Every labeled row and every outputs KPI has a unit in the "units" map.
- Names use underscores, no leading digits, no dot-notation.

BEGIN NOW. Produce ONLY the JSON that satisfies the above.

ANCHOR HINTS:
{anchor_hints}
"""
    return base

# ---------- Stage 1: Prompt expansion (now includes current_model) ----------
def expand_user_prompt(
    prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    current_model: Optional[Any] = None,
) -> str:
    """
    First OpenAI call: expand the user's brief prompt into a detailed, single paragraph
    describing the intended model (no JSON, no code, no lists).
    If current_model is provided (2D wells[column][row] JSON), include it as baseline context.
    The paragraph MUST end with a single sentence starting with 'Final assignment:' describing
    the ultimate KPI/target this model should compute.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    sys_msg = (
        "You rewrite brief modeling prompts into one concise paragraph that fully describes "
        "the desired model, assumptions, drivers, KPIs, and relationships. "
        "Write plain English (no bullets/lists/code/JSON). Keep it focused and concrete. "
        "End your paragraph with exactly one sentence that begins with 'Final assignment:' "
        "followed by a short description of the single target the model will compute."
    )

    cm_block = _prepare_current_model_context(current_model) if current_model is not None else ""
    user_msg = (
        "Expand this so that it describes more details and provides explicit tables; infer default "
        "assumptions using the CURRENT MODEL if provided; expand into multiple dimensions (>10), "
        "and describe relationships between tables. Ensure one table is named Assumptions with at least "
        "two columns and >20 rows. Also define a results table that highlights the goal.\n\n"
        f"{('' if not cm_block else cm_block + '\\n')}"
        f"USER_PROMPT:\n{prompt}"
    )

    resp = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": [{"type": "input_text", "text": sys_msg}]},
            {"role": "user",   "content": [{"type": "input_text", "text": user_msg}]},
        ],
        temperature=temperature,
    )
    text = getattr(resp, "output_text", "") or ""
    return text.strip()

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

    client = OpenAI(api_key=api_key)
    scaffold_model = scaffold_model or model

    # build scaffold with domain context
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

    input_payload = [
        {"role": "system", "content": [{"type": "input_text", "text": SYS_JSON_ONLY + "\n\n" + sys_scaffold}]},
        {"role": "user",   "content": [{"type": "input_text", "text": prompt}]},
    ]

    def _parse_output_text(text: str) -> dict:
        text = text or ""
        try:
            return json.loads(text)
        except Exception:
            return json.loads(_extract_json_snippet(text))

    try:
        resp = client.responses.create(
            model=model,
            input=input_payload,
            response_format={"type": "json_object"},
            temperature=temperature,
        )
        output = _parse_output_text(resp.output_text)
        raw_dump = _to_jsonable(resp)
        usage = _to_jsonable(getattr(resp, "usage", None))
    except TypeError as e:
        if "unexpected keyword argument 'response_format'" not in str(e):
            raise
        resp = client.responses.create(model=model, input=input_payload, temperature=temperature)
        output = _parse_output_text(getattr(resp, "output_text", None) or str(resp))
        raw_dump = _to_jsonable(resp)
        usage = _to_jsonable(getattr(resp, "usage", None))

    if not return_all:
        return output

    return {
        "output": output,
        "request": {"model": model, "temperature": temperature, "input_payload": input_payload},
        "scaffold": scaffold_info,
        "raw_response": raw_dump,
        "usage": usage,
    }

# ---------- Two-stage runner (now accepts current_model) ----------
def run_two_stage(
    current_model: Optional[Any],
    user_prompt: str,
    model: str,
    grammar_text: str,
    *,
    temperature: float = 0.2,
    outdir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    1) Expand the prompt into a richer paragraph (uses current_model context if provided).
    2) Feed that text to the JSON-constrained AssignLang call.
    """
    os.makedirs(outdir, exist_ok=True) if outdir else None

    expanded = expand_user_prompt(
        user_prompt,
        model=model,
        temperature=temperature,
        current_model=current_model,
    )

    final = getOpenAIModel(
        expanded,
        model=model,
        grammar_text=grammar_text,
        scaffold_model=model,
        temperature=temperature,
        return_all=True,
    )

    if outdir:
        with open(os.path.join(outdir, "expanded_prompt.txt"), "w", encoding="utf-8") as f:
            f.write(expanded)
        with open(os.path.join(outdir, "final.json"), "w", encoding="utf-8") as f:
            json.dump(final, f, ensure_ascii=False, indent=2)

    return {"expanded_prompt": expanded, "final": final}

def remove_duplicate_values(data: dict) -> dict:
    """
    Remove duplicate *values* across each top-level section (e.g., 'tables', 'formulas', 'annotations').
    Keeps the first occurrence of a value and removes later duplicates.
    Works even if values are unhashable (dict/list/etc.) by canonicalizing them.
    """
    def _canon(v):
        if isinstance(v, (dict, list, tuple, set)):
            try:
                return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            except TypeError:
                return repr(v)
        return v

    cleaned_data = {}
    for section, mapping in (data or {}).items():
        if not isinstance(mapping, dict):
            cleaned_data[section] = mapping
            continue

        seen = set()
        new_mapping = {}
        for key, value in mapping.items():
            sig = _canon(value)
            if sig in seen:
                continue
            seen.add(sig)
            new_mapping[key] = value
        cleaned_data[section] = new_mapping

    return cleaned_data

# ---------- Regex helpers for cell keys ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _parse_cell_key(k: str) -> Optional[Tuple[str, int, int]]:
    """
    Parse keys shaped like table[i:i][j:j]; returns (table, i, j) or None.
    """
    m = _KEY_RE.match(k or "")
    if not m:
        return None
    t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
    return (t, i, j)

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

# ---------- Enforce column headers in 'tables'; move from 'formulas' if needed ----------
def enforce_column_headers(final_json: dict) -> dict:
    """
    Ensures that for EVERY table name present in either 'tables' or 'formulas', we have:
      tables[f"{t}[0:0][0:0]"] = "Label"
      tables[f"{t}[1:1][0:0]"] = "Value"
    If these header assignments appear in 'formulas', move them to 'tables'.
    """
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
    data["formulas"] = formulas
    return data

# ---------- Units enforcement ----------
def enforce_units(final_json: dict, default_unit: str = "unitless") -> dict:
    """
    Ensure final_json has a 'units' dict and that every labeled row in every table
    (and every outputs KPI label) has an entry in units.
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    units = dict(data.get("units") or {})

    labels_by_table: Dict[str, Set[str]] = {}

    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str):
            labels_by_table.setdefault(t, set()).add(v)

    for t in labels_by_table:
        units.setdefault(t, {})
        for lab in labels_by_table[t]:
            units[t].setdefault(lab, default_unit)

    data["units"] = units
    return data

# ---------- Formula reference utilities ----------
_REF_RE = re.compile(
    r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>(?:[A-Za-z_][A-Za-z0-9_]*|"[^"\n\r]*"))\]'
)

def extract_named_refs(formula: str) -> List[Tuple[str, str]]:
    """
    Extract (table, field_label) pairs from a formula string.
    Only supports named references per the scaffold (no ranges).
    """
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
    """
    Determine next row index j for a given table by scanning existing keys.
    j==0 is header; return >=1.
    """
    max_j = 0
    for k in tables.keys():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, _i, j = parsed
        if t == table:
            if j > max_j:
                max_j = j
    return max(1, max_j + 1)

def ensure_table_and_field(
    tables: Dict[str, Any],
    table: str,
    field_label: str,
    default_value: str = "0",
) -> None:
    """
    Ensure that `table` exists with headers, and that a labeled row for `field_label` exists.
    """
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
    """
    Ensure that all named table references used in any formula exist and are defined in 'tables'.
    - Creates missing tables with headers.
    - Creates missing label rows with a default constant value.
    """
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

# ---------- Remove tables not referenced in formulas ----------
def remove_unreferenced_tables(final_json: dict) -> dict:
    """
    Remove tables that are not referenced in any formula.
    Keeps:
      - Any table that appears on the LHS of a formula (outputs tables).
      - Any table that is referenced by any formula expression (RHS).
    Removes:
      - Tables present in 'tables' but absent from the keep-set above.
    Also prunes 'annotations' and 'units' to match kept tables.
    """
    data = dict(final_json or {})
    tables: Dict[str, Any] = dict(data.get("tables") or {})
    formulas: Dict[str, Any] = dict(data.get("formulas") or {})
    annotations: Dict[str, Any] = dict(data.get("annotations") or {})
    units: Dict[str, Any] = dict(data.get("units") or {})

    rhs_tables: Set[str] = set()
    for f in formulas.values():
        if not isinstance(f, str):
            continue
        for (t, _label) in extract_named_refs(f):
            rhs_tables.add(t)

    lhs_tables: Set[str] = set()
    for k in formulas.keys():
        parsed = _parse_cell_key(k)
        if parsed:
            lhs_tables.add(parsed[0])

    keep_tables = rhs_tables | lhs_tables

    new_tables: Dict[str, Any] = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            new_tables[k] = v
            continue
        t, _i, _j = parsed
        if t in keep_tables:
            new_tables[k] = v

    new_annotations = {t: desc for t, desc in annotations.items() if t in keep_tables}
    new_units = {t: umap for t, umap in units.items() if t in keep_tables}

    data["tables"] = new_tables
    data["annotations"] = new_annotations
    data["units"] = new_units
    return data

# ---------- CLI ----------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Two-stage AssignLang builder: (1) expand prompt (optionally with a current_model table), (2) JSON-constrained model generation."
    )
    p.add_argument("prompt", help="Natural language description.")
    p.add_argument("--model", default="gpt-4o-mini", help="Model ID (default: gpt-4o-mini)")
    p.add_argument("--out", dest="out_path", help="Path to write ONLY the final JSON output (default: stdout)")
    p.add_argument("--outdir", help="Directory to dump expanded prompt and full response bundle")
    p.add_argument("--grammar-file", help="Path to a grammar file to override the default", default=None)
    p.add_argument("--temperature", type=float, default=0.2, help="Sampling temperature")
    p.add_argument("--current-model", dest="current_model_arg",
                   help="Path to a JSON file or an inline JSON string representing wells[column][row].")
    return p

def _load_grammar(grammar_file: Optional[str]) -> str:
    if grammar_file:
        with open(grammar_file, "r", encoding="utf-8") as f:
            return f.read()
    return GRAMMAR

def main_cli() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    grammar_text = _load_grammar(args.grammar_file)
    current_model = _load_current_model_input(args.current_model_arg)

    if _HAS_ION:
        return _main_ion(args.model)

    try:
        bundle = run_two_stage(
            current_model=current_model,
            user_prompt=args.prompt,
            model=args.model,
            grammar_text=grammar_text,
            temperature=args.temperature,
            outdir=args.outdir,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    final_json = bundle.get("final", {}).get("output", {}) or {}
    final_json = enforce_column_headers(final_json)
    final_json = validate_and_patch_references(final_json, default_value="0")
    final_json = enforce_units(final_json, default_unit="unitless")
    final_json = remove_unreferenced_tables(final_json)
    final_json = remove_duplicate_values(final_json)

    text = json.dumps(final_json, ensure_ascii=False, indent=2)
    if args.out_path:
        with open(args.out_path, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)
    return 0

# ---------- Ion entry ----------
def _main_ion(default_model: str) -> int:
    try:
        user_prompt = works.param(1)
        mmodel = works.param(2)  # kept for backward compatibility
        cm_raw = None
        try:
            cm_raw = works.param(3)
        except Exception:
            cm_raw = None
        current_model = _load_current_model_input(cm_raw)

        bundle = run_two_stage(
            current_model=current_model,
            user_prompt=user_prompt,
            model=default_model,
            grammar_text=GRAMMAR,
            temperature=0.2,
            outdir=None,
        )
        final_json = bundle.get("final", {}).get("output", {}) or {}
        try:
            final_json = enforce_column_headers(final_json)
            final_json = validate_and_patch_references(final_json, default_value="0")
            final_json = enforce_units(final_json, default_unit="unitless")
            final_json = remove_unreferenced_tables(final_json)
            final_json = remove_duplicate_values(final_json)
        except Exception:
            pass
        works.resolve(final_json)
        return 0
    except Exception as e:
        raise RuntimeError(f"Ion parameter access failed: {e}") from e


if __name__ == "__main__":
    if _HAS_ION:
        sys.exit(_main_ion('gpt-4o-mini') or 0)
    else:
        sys.exit(main_cli())
