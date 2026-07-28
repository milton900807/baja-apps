#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Three-stage AssignLang model builder.

Stage 1: Expand the user's prompt into a richer paragraph (no JSON).
Stage 2: Use that expanded text as the prompt to the JSON-constrained AssignLang scaffold.
Stage 3: Post-process with ChatGPT again to strictly enforce:
         - every formula references valid, labeled table fields
         - every table cell has either a constant/string value, or (for outputs) a paired formula

- Exactly three OpenAI calls now (expand, scaffold, refine).
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
  : IDENT NUM_RANGE NUM_RANGE EOF
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

// ---------- Exponentiation ----------
// Exponent may be a "simple" value, or a full expr wrapped in parentheses
powExpr
  : primary ( POW exponent )*
  ;

exponent
  : simpleExponent
  | LPAREN expr RPAREN
  ;

// ---------- Atoms ----------
primary
  : NUMBER
  | reference2D
  | referenceKeyed2D
  | referenceKeyedPair
  | functionCall
  | LPAREN expr RPAREN
  ;

simpleExponent
  : NUMBER
  | reference2D
  | referenceKeyed2D
  | referenceKeyedPair
  | functionCall
  ;

// ---------- References ----------

// Positional 2D slice: table[xstart:xend][ystart:yend] (numeric-only)
reference2D
  : IDENT NUM_RANGE NUM_RANGE
  ;

// Keyed header reference (two brackets): table[ColHeader][RowHeader]
// KEYS: IDENT only (no quoted strings)
referenceKeyed2D
  : IDENT LBRACK colKey RBRACK LBRACK rowKey RBRACK
  ;

// Keyed header reference (single bracket): table[ColHeader, RowHeader]
// KEYS: IDENT only (no quoted strings)
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

// IMPORTANT: Disallow quoted keys in references/formulas.
keyTok
  : IDENT
  ;

// ---------- LEXER ----------

// NUM_RANGE greedily matches [int:int] before LBRACK/RBRACK
NUM_RANGE : '[' INT ':' INT ']' ;

// IDENT: start with a letter, then letters/digits/underscore
IDENT  : [A-Za-z] [A-Za-z0-9_]* ;
NUMBER : INT ( '.' [0-9]+ )? ;
INT    : [0-9]+ ;

// STRING kept for other uses, but NOT allowed in references
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
    "No prose, no markdown, no code fences."
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

# ---------- Small helpers for Chat Completions ----------
def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
    json_mode: bool = False,
) -> str:
    """
    Calls Chat Completions. If json_mode=True, requests JSON object output format.
    Returns the message content string.
    """
    client = OpenAI()
    kwargs = dict(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""

# ---------- Domain pack/anchor synthesis ----------
def generate_domain_block_and_anchor_hints(
    domain_prompt: str,
    grammar_text: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.3,
) -> Tuple[str, str]:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    sys_msg = (
        "You are a domain pack synthesizer for a grammar-driven modeling system.\n"
        "Return ONLY a JSON object with exactly two string fields: "
    )

    user_msg = (
        "Build a domain pack and formula anchor hints for the following domain.\n\n"
        f"DOMAIN PROMPT:\n{domain_prompt}\n\n"
        "Your output must follow these rules:\n"
        "  DOMAIN-SPECIFICITY RULES (MANDATORY):\n"
        "  REQUIRED TABLES (use underscores, no spaces):\n"
        "  ADDITIONAL HARD RULES:\n"
        "  All tables will have at least 2 columns and the table must have tablename[0:0][0:0] defined as 'label':  column 1 is the label and column 2 is the value or formula that represents that label"
        "- ENSURE ALL OPEN BRACKETS ARE MATCHED WITH CLOSING BRACKETS.\n\n"
        "  TableName[column_label][row${i}] and range selectors like [1:12], never dot notation; only + - * / ^ and parentheses.\n"
        "- Frist column of all tables are labels and all values will be defined with qualitative description string values"
        "- Must have more than 15 assumptions defined in an Assumptions table"
        "-  If a scalar is needed, use a decimal with a fractional part (e.g., 3.0), and never 0.0 or 1.0 as multiplicative factors."
        "- Never append constant-only factors at the end of a formula (e.g., *3*0, *1*0*0). Formulas must end with a reference or a closed parenthesis."
        "- All tables must have labels defined in first column "
        "GRAMMAR (for reference):\n"
        "---- GRAMMAR START ----\n"
        f"{grammar_text}\n"
        "---- GRAMMAR END ----\n"
    )

    content = _chat_call(
        model=model,
        system=sys_msg,
        user=user_msg,
        temperature=temperature,
        json_mode=True,
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
    base = f"""
You are generating a structured model as JSON only.

OUTPUT CONTRACT (MANDATORY)
- Return ONLY a JSON object with exactly four top-level keys: "tables", "formulas", "annotations", "units". No prose.
- Keys in "tables" and "formulas" are single-cell addresses: "<table>[i:i][j:j]".
- All table names use underscores; no spaces; no dot notation.
- Must use at least one inputs table and one outputs table 
- all cells will have either a value attribute defined or have that cell assinged in formulas
- inputs table should have more than 20 assumptions
- all tables will have the label column (first colum) completely labeled with string values that describe the row 
- All labels that start with Total in the first column will have an assigned sum formula assigning the second column of that row with a sum formula
- All tables must have at least one cell assigned in the formulas dictionary 

HARD COVERAGE RULE (MANDATORY)
For every labeled row Y (i.e., any key "<table>[0:0][Y:Y]" in "tables" with a string label):
  - EITHER there is a constant value in "tables" at "<table>[1:1][Y:Y]"
  - OR there is a formula in "formulas" at "<table>[1:1][Y:Y]"
If neither exists, YOU MUST create "<table>[1:1][Y:Y]" in "tables" with the string "0".

HEADER RULES (MANDATORY)
- Every table has headers:
  "<table>[0:0][0:0]" = "Label"
  "<table>[1:1][0:0]" = "Value"

FORMULA RULES
- Formulas appear only in "formulas" as strings at keys "<outputs_table>[1:1][Y:Y]".
- References use named labels: other_table[Field_Label]. No ranges. No dot notation.
- Exponent: allow base^simpleExponent; if exponent has operators, wrap it in parentheses (e.g., a^(b+c)).
- No implicit multiplication; use *, /, +, - explicitly.

CONSISTENCY RULE
- If a formula references other_table[Field_Label], ensure "tables" contains that table with headers and a row:
  "<other_table>[0:0][Y:Y]" = "Field_Label"
  "<other_table>[1:1][Y:Y]" = "<default constant string>"

UNITS & ANNOTATIONS
- Provide "annotations" describing each table in one sentence.
- Provide "units": a map of table -> Label -> unit string covering all labels and KPIs.

SELF-CHECK BEFORE RETURNING (DO NOT SKIP)
1) For every "<table>[0:0][Y:Y]" label row, confirm coverage:
   - present in "tables" at "<table>[1:1][Y:Y]" OR in "formulas" at the same key.
   - If missing, add "<table>[1:1][Y:Y]" = "0".
2) Ensure no ranges in formulas; only table[Label].
3) Ensure every referenced label exists in "tables" with a default constant if not an output.
4) Ensure headers exist for every table.
5) JSON only; exactly four top-level keys.

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
  "design_table[0:0][0:0]": "Label",
  "design_table[1:1][0:0]": "Value",
  "design_table[0:0][1:1]": "Samples",
  "design_table[1:1][1:1]": "120",
- And every outputs formula assignment follows this shape in "formulas":
  "trial_outputs[0:0][1:1]": "Total sample costs",
  "trial_outputs[1:1][1:1]": "design_table[Samples]*design_table[Captures_Per_Sample]"

VALIDATION CHECKLIST (ENFORCE ALL)
- JSON only; no prose.
- Exactly four top-level keys: tables, formulas, annotations, units.
- Every table has string headers at [0:0][0:0] and [1:1][0:0] set to "Label" and "Value".
- No ranges anywhere; only single-cell assignments.
- inputs_table_name has ≥10 labeled constants; all used by formulas.
- outputs_table_name exists; labels in "tables", formulas in "formulas".
- domain tables; each referenced in at least one formula.
- Every formula reference tablename[Field_Name] has a matching labeled row in that table with a default constant value.
- No overlapping keys between "tables" and "formulas".
- Every labeled row and every outputs KPI has a unit in the "units" map.
- Names use underscores, no leading digits, no dot-notation.
- All tables must have at least one cell assigned in the formulas dictionary 


ANCHOR HINTS:
{anchor_hints}

COVERAGE GUARANTEE (MANDATORY): For every label row "<table>[0:0][Y:Y]" present in "tables", there MUST be either
- a constant at "<table>[1:1][Y:Y]" in "tables", OR
- a formula at "<table>[1:1][Y:Y]" in "formulas".
If neither exists, add "<table>[1:1][Y:Y]" = "0" to "tables". Perform this check for ALL tables before returning JSON.

"""
    return base

# ---------- Stage 1: Prompt expansion ----------
def expand_user_prompt(
    prompt: str,
    *,
    model: str = "gpt-4o",
    temperature: float = 0.2,
    starting_scaffold: dict | str | None = None,
) -> str:
    """
    First OpenAI call:
      - If `starting_scaffold` is None: behave exactly like the original function,
        returning a single descriptive paragraph (no JSON/code/lists).
      - If `starting_scaffold` is provided (dict or JSON string): include a compact
        summary of its shape and instruct the model to preserve that data shape
        (tables[]/wells[] + formulas[]) while expanding the scope with more
        assumptions, tables, and formulas.
    """
    import os as _os
    import json as _json
    import re as _re

    if not _os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

    # ---------- ORIGINAL BEHAVIOR (no scaffold) ----------
    if starting_scaffold is None:
        sys_msg = (
            "You rewrite brief modeling prompts into one concise paragraph that fully describes "
            "the desired model, assumptions, drivers, KPIs, and relationships. "
            "Write plain English (no bullets/lists/code/JSON). Keep it focused and concrete."
        )
        user_msg = (
            "Expand this so that it describes more details and provides an explicit list of at least 10 variables the model should try to capture; "
            "find default assumptions then use those to expand the model into multiple dimensions by defining a list of assumptions to start with and "
            "then iterating over them to expand assumption variables and create even more tables with >20 rows; "
            "specify relationships between tables using appropriate default values. "
            f"{prompt}"
        )
        content = _chat_call(
            model=model,
            system=sys_msg,
            user=user_msg,
            temperature=temperature,
            json_mode=False,
        )
        return (content or "").strip()

    # ---------- SCAFFOLD-AWARE BEHAVIOR ----------
    def _summarize_scaffold(scaf: dict) -> str:
        tables = scaf.get("tables", [])
        formulas = scaf.get("formulas", [])
        tbrief = []
        for t in tables:
            if not isinstance(t, dict):
                continue
            tbrief.append({
                "name": t.get("name", ""),
                "cols": t.get("cols", ""),
                "rows": t.get("rows", ""),
            })
        f_tables = []
        for f in formulas:
            if isinstance(f, dict) and "Table" in f:
                f_tables.append(f["Table"])
        return _json.dumps({
            "table_count": len(tables),
            "tables": tbrief,
            "formula_tables": sorted(set(f_tables)),
            "schema_shape": "tables[]=({name,cols,rows,wells[]:{x,y,value,formula}}), formulas[]={({Table},{'HAS these assignments':{cell->expr}})}"
        }, ensure_ascii=False)

    # Parse/prepare scaffold summary
    try:
        scaf_obj = _json.loads(starting_scaffold) if isinstance(starting_scaffold, str) else starting_scaffold
        scaffold_block = _summarize_scaffold(scaf_obj or {})
    except Exception:
        raw = starting_scaffold if isinstance(starting_scaffold, str) else _json.dumps(starting_scaffold, ensure_ascii=False)
        scaffold_block = f'{{"note":"unable to parse scaffold fully","raw_preview":{_json.dumps(str(raw)[:1200])}}}'

    sys_msg = (
        "You rewrite brief modeling prompts into one concise paragraph that fully describes "
        "the desired model, assumptions, drivers, KPIs, and relationships. "
        "Write plain English (no bullets/lists/code/JSON). Keep it focused and concrete. "
        "Preserve the existing data shape (tables[]/wells[] & formulas[]) of the starting scaffold in the eventual build, "
        "but expand scope with more assumptions, tables, and formulas."
    )

    user_msg = "\n".join([
        "Expand the following modeling brief into a single paragraph that:",
        "- States scope and objectives.",
        "- Mentions ≥10 distinct variables/assumptions in prose.",
        "- Explains relationships across tables and which KPIs will be derived.",
        "- Calls for MORE detail than the current model (more tables, more rows, more formulas).",
        "- Preserves the SAME data shape as the starting scaffold (tables[]/wells[] & formulas[]) in the eventual JSON build.",
        "",
        "Brief:",
        str(prompt),
        "",
        "Starting scaffold (schema summary; keep this shape but expand detail):",
        scaffold_block,
        "",
        "When later building the JSON: keep exactly two columns per table (x=0 'Label', x=1 'Value'); "
        "use named references in formulas (Table[Field_Label] without quotes); no ranges/dot-notation; "
        "derive KPIs by formula where sensible."
    ])

    content = _chat_call(
        model=model,
        system=sys_msg,
        user=user_msg,
        temperature=temperature,
        json_mode=False,
    )
    return (content or "").strip()

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

    system = SYS_JSON_ONLY + "\n\n" + sys_scaffold
    user = prompt

    content = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
    )

    def _parse_output_text(text: str) -> dict:
        text = text or ""
        try:
            return json.loads(text)
        except Exception:
            return json.loads(_extract_json_snippet(text))

    output = _parse_output_text(content)
    raw_dump = {"content": content}
    usage = None  # chat.completions does not expose usage here; omit or add if needed

    if not return_all:
        return output

    return {
        "output": output,
        "request": {"model": model, "temperature": temperature, "system": system, "user": user},
        "scaffold": scaffold_info,
        "raw_response": _to_jsonable(raw_dump),
        "usage": _to_jsonable(usage),
    }

# ---------- Stage 3: Refine/validate with Chat to enforce constraints ----------
def refine_model_with_chat(
    model_json: dict,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.1,
) -> dict:
    """
    Third OpenAI call: feed the JSON back with strict instructions to:
      - expand 'formulas' (derive additional sensible relationships) while preserving all valid existing content
      - ensure EVERY labeled row in EVERY table is covered:
          * either a constant string value is present in 'tables' at x=1 for that row (y>0), OR
          * (for outputs rows) there is a matching pair of assignments in 'formulas':
              - outputs_table[0:0][y:y] = "Label"
              - outputs_table[1:1][y:y] = <FORMULA referencing existing labels via table_name[Field_Name]>
      - keep schema EXACTLY: {tables, formulas, annotations, units}; no extra keys
      - ensure 'units' covers all labels (including newly added outputs)
      - adhere to the required cell-key syntax for both 'tables' and 'formulas' (see prompt)
    """
    import json as _json
    import sys
    import json

    # Encourage expansion: at least 12 formulas, or 50% more than current, whichever is greater.
    try:
        current_formula_count = len((model_json or {}).get("formulas", {}) or {})
    except Exception:
        current_formula_count = 0
    target_formula_min = max(12, int(current_formula_count * 1.5) if current_formula_count else 12)

    sys_msg = (
        "You are a strict contract enforcer and optimizer for a modeling JSON.\n"
        "Return ONLY a JSON object with EXACTLY four top-level keys: "
        '"tables", "formulas", "annotations", "units". '
        "No prose, no markdown, no additional keys, no code fences."
    )

    # === CRITICAL SYNTAX RULES (from user) ===
    syntax_rules = """
REQUIRED KEY SYNTAX — DO NOT VIOLATE:
 \n\n"
A) Every table must be encoded in "tables" using this exact pattern of keys (example names only):
  "trial_inputs[0:0][0:0]": "Label",
  "trial_inputs[1:1][0:0]": "Value",
  "trial_inputs[0:0][1:1]": "GMP_Cost_Per_Unit",
  "trial_inputs[1:1][1:1]": "50000",
  "trial_inputs[0:0][2:2]": "Units_Required_For_GMP",
  "trial_inputs[1:1][2:2]": "100",
  "design_table[0:0][0:0]": "Label",
  "design_table[1:1][0:0]": "Value",
  "design_table[0:0][1:1]": "Samples",
  "design_table[1:1][1:1]": "120",
B) Every OUTPUTS formula assignment in "formulas" MUST be a PAIR with this exact shape:
  "trial_outputs[0:0][1:1]": "Total sample costs",
  "trial_outputs[1:1][1:1]": "design_table[Samples]*design_table[Captures_Per_Sample]"
"""
    user_msg = (
        "Take the provided JSON and COMPLETE it while preserving all existing content.\n\n"
        + syntax_rules +
        "HARD CONSTRAINTS:\n"
        "1) Top-level schema MUST remain EXACTLY {tables, formulas, annotations, units}. No other top-level keys.\n"
        "2) Every table has headers: [0:0][0:0] = 'Label' and [1:1][0:0] = 'Value'. Create them if missing.\n"
        "3) 'formulas' contains ONLY:\n"
        "     - outputs_table[0:0][y:y] = '<Label>' (string), and\n"
        "     - outputs_table[1:1][y:y] = '<FORMULA>' (string)\n"
        "   Never put constants for non-outputs in 'formulas'.\n"
        "4) Every formula must reference existing labeled rows and valid tables.\n"
        "   If a reference uses tablename[Field_Name], ensure that in 'tables' there exists that table with headers and a row where:\n"
        "      - [0:0][y:y] == Field_Name (exact string match), and\n"
        "      - [1:1][y:y] has a default constant string (e.g., '0') unless that value is produced by an outputs formula.\n"
        "5) Provide a 'units' map entry for EVERY labeled row in EVERY table and EVERY outputs KPI. Use sensible defaults like 'unitless' if unknown.\n"
        "6) Preserve valid existing content; only add what's necessary to satisfy these constraints and expand the formulas.\n"
        "7) Avoid circular dependencies and self-references. Ensure formulas are syntactically consistent.\n\n"
        "- All tables must have at least one mention in formulas dictionary\n"
        "- All tables must have at least one mention in formulas dictionary\n"
        " Any row that has the first cell start with Total must have the second column cell assigned with a formula in the formulas"
        

        "VALIDATION CHECKLIST BEFORE RETURNING:\n"
        "- All tables follow the key pattern exactly and have headers.\n"
        "- Every labeled row is covered (constant in 'tables' OR outputs pair in 'formulas').\n"
        "- Total outputs formulas (the [1:1][y:y] entries) >= target.\n"
        "- 'units' covers all labels, including any new ones.\n"
        "- JSON only. No explanations.\n\n"
        f"{_json.dumps(model_json, ensure_ascii=True)}"
    )

    content = _chat_call(
        model=model,
        system=sys_msg,
        user=user_msg,
        temperature=temperature,
        json_mode=True,
    )
    return json.loads(content)

# ---------- Two-stage runner (now three with refine) ----------
def run_two_stage(
    user_prompt: str,
    starting_scaffold: str,
    model: str,
    grammar_text: str,
    *,
    temperature: float = 0.2,
    outdir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    1) Expand the prompt into a richer paragraph
    2) Feed that text to the JSON-constrained AssignLang call
    3) Refine/validate JSON with Chat to ensure references and cell/value completeness
    """
    os.makedirs(outdir, exist_ok=True) if outdir else None

    expanded = expand_user_prompt(user_prompt, model=model, temperature=temperature, starting_scaffold=starting_scaffold)

    first = getOpenAIModel(
        expanded,
        model=model,
        grammar_text=grammar_text,
        scaffold_model=model,
        temperature=temperature,
        return_all=True,
    )

    # Local post-processing before refine
    final_json = first.get("output", {}) or {}
    final_json = enforce_column_headers(final_json)
    final_json = validate_and_patch_references(final_json, default_value="0")
    final_json = enforce_units(final_json, default_unit="unitless")

    # >>> NEW: detect missing tables and synthesize them via API (e.g., number_of_customers)
    missing = find_missing_tables(final_json)
    if missing:
        addl = synthesize_missing_tables_via_api(
            missing_tables=missing,
            prior_prompt=expanded,
            grammar_text=grammar_text,
            current_json=final_json,
            model=model,
            temperature=0.15,
        )
        final_json = _merge_augmented_json(final_json, addl)

    # Refine with a dedicated chat pass to enforce strict constraints
    refined = final_json #refine_model_with_chat(final_json, model=model, temperature=0.1)

    # Optional final local hygiene
    refined = enforce_column_headers(refined)
    refined = validate_and_patch_references(refined, default_value="0")
    refined = enforce_units(refined, default_unit="unitless")
    refined = strip_whitespace_in_formulas(refined)
    # refined = remove_unreferenced_tables(refined)
    refined = rewrite_formulas_to_named_refs(refined)

    # >>> NEW (optional): if refine introduced new refs, fetch those tables too
    missing2 = find_missing_tables(refined)
    if missing2:
        addl2 = synthesize_missing_tables_via_api(
            missing_tables=missing2,
            prior_prompt=expanded,
            grammar_text=grammar_text,
            current_json=refined,
            model=model,
            temperature=0.1,
        )
        refined = _merge_augmented_json(refined, addl2)

    bundle = {
        "expanded_prompt": expanded,
        "first_pass": first,
        "refined": refined,
    }

    if outdir:
        with open(os.path.join(outdir, "expanded_prompt.txt"), "w", encoding="utf-8") as f:
            f.write(expanded)
        with open(os.path.join(outdir, "first_pass.json"), "w", encoding="utf-8") as f:
            json.dump(first, f, ensure_ascii=False, indent=2)
        with open(os.path.join(outdir, "final.json"), "w", encoding="utf-8") as f:
            json.dump(refined, f, ensure_ascii=False, indent=2)

    return bundle

# ---------- Regex helpers for cell keys ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _parse_cell_key(k: str) -> Optional[Tuple[str, int, int]]:
    m = _KEY_RE.match(k or "")
    if not m:
        return None
    t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
    return (t, i, j)

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

# ---------- Enforce column headers in 'tables'; move from 'formulas' if needed ----------
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

        # Move from formulas -> tables if present
        if hdr_label_key in formulas:
            tables.setdefault(hdr_label_key, formulas.pop(hdr_label_key))
        if hdr_value_key in formulas:
            tables.setdefault(hdr_value_key, formulas.pop(hdr_value_key))

        # Force correct header strings
        if tables.get(hdr_label_key) != "Label":
            tables[hdr_label_key] = "Label"
        if tables.get(hdr_value_key) != "Value":
            tables[hdr_value_key] = "Value"

    data["tables"] = tables
    data["formulas"] = formulas
    return data

# ---------- Units enforcement ----------
def enforce_units(final_json: dict, default_unit: str = "unitless") -> dict:
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
    """
    Remove ALL whitespace from RHS formula strings only.
    (Keys like <table>[1:1][y:y]). Leaves label strings (at [0:0][y:y]) untouched.
    """
    data = dict(final_json or {})
    formulas = dict(data.get("formulas") or {})

    for k, v in list(formulas.items()):
        if not isinstance(v, str):
            continue
        parsed = _parse_cell_key(k)  # (<table>, i, j)
        if not parsed:
            continue
        _table, i, _j = parsed
        if i == 1:
            # RHS formula cell → strip all whitespace
            formulas[k] = re.sub(r"\s+", "", v)
        # else i == 0 → this is a label string; leave it as-is

    data["formulas"] = formulas
    return data

# ---------- Remove tables not referenced in formulas ----------
def remove_unreferenced_tables(final_json: dict) -> dict:
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

# ---------- Missing table synthesis: detection & API augment ----------
def _present_table_names(tables: Dict[str, Any]) -> Set[str]:
    names: Set[str] = set()
    for k in (tables or {}).keys():
        parsed = _parse_cell_key(k)
        if parsed:
            names.add(parsed[0])
    return names

def _referenced_table_names(formulas: Dict[str, Any]) -> Set[str]:
    refs: Set[str] = set()
    for v in (formulas or {}).values():
        if not isinstance(v, str):
            continue
        for (t, _label) in extract_named_refs(v):
            refs.add(t)
    return refs

def find_missing_tables(current_json: dict) -> Set[str]:
    tables = dict((current_json or {}).get("tables") or {})
    formulas = dict((current_json or {}).get("formulas") or {})
    return _referenced_table_names(formulas) - _present_table_names(tables)

def synthesize_missing_tables_via_api(
    *,
    missing_tables: Set[str],
    prior_prompt: str,
    grammar_text: str,
    current_json: dict,
    model: str = "gpt-4o-mini",
    temperature: float = 0.15,
) -> dict:
    """
    Ask the model to return ONLY the missing tables (headers + rows for all
    labels referenced in formulas), plus units/annotations entries for those tables.
    """
    if not missing_tables:
        return {}

    sys_msg = (
        "Return ONLY a JSON object with any of the keys {tables, annotations, units}. "
        "No prose. If a key is not needed, omit it. "
        "For each requested table, create headers [0:0][0:0]='Label', [1:1][0:0]='Value' "
        "and rows for ALL labels referenced in formulas (use sensible default constants as strings). "
        "Include 'annotations' entries (one sentence per returned table) and 'units' for those labels."
    )

    user_msg = (
        "You will augment an existing AssignLang model. "
        "ONLY add the specific missing tables listed below. "
        "Do NOT modify existing tables or formulas.\n\n"
        f"MISSING TABLES:\n{sorted(missing_tables)}\n\n"
        "CURRENT MODEL JSON (context):\n"
        f"{json.dumps(current_json, ensure_ascii=False)}\n\n"
        "ORIGINAL/EXPANDED PROMPT (context):\n"
        f"{prior_prompt}\n\n"
        "GRAMMAR (for reference):\n"
        f"{grammar_text}\n\n"
        "IMPORTANT:\n"
        "- Use named references convention (labels in first column).\n"
        "- Provide default constants as strings in x=1 for each label.\n"
        "- Include 'annotations' and 'units' entries ONLY for the missing tables."
    )

    content = _chat_call(
        model=model,
        system=sys_msg,
        user=user_msg,
        temperature=temperature,
        json_mode=True,
    )
    try:
        return json.loads(content or "{}")
    except Exception:
        return {}

def _merge_augmented_json(base: dict, delta: dict) -> dict:
    if not delta:
        return base
    out = dict(base or {})
    for top in ("tables", "annotations", "units"):
        if top in delta and isinstance(delta[top], dict):
            out.setdefault(top, {})
            for k, v in delta[top].items():
                if k not in out[top]:
                    out[top][k] = v
    return out

# ---------- CLI ----------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Three-stage AssignLang builder: (1) expand prompt, (2) JSON-constrained model generation, (3) refine & enforce."
    )
    p.add_argument("prompt", help="Natural language description.")
    p.add_argument("--model", default="gpt-4o-mini", help="Model ID (default: gpt-4o-mini)")
    p.add_argument("--out", dest="out_path", help="Path to write ONLY the final JSON output (default: stdout)")
    p.add_argument("--outdir", help="Directory to dump expanded prompt and full response bundle")
    p.add_argument("--grammar-file", help="Path to a grammar file to override the default", default=None)
    p.add_argument("--temperature", type=float, default=0.2, help="Sampling temperature")
    return p

def _load_grammar(grammar_file: Optional[str]) -> str:
    if grammar_file:
        with open(grammar_file, "r", encoding="utf-8") as f:
            return f.read()
    return GRAMMAR

# --- Convert range refs table[i:i][j:j] -> table[Label] -----------------------
_RANGE_REF_RE = re.compile(
    r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<xi>\d+):\d+\]\[(?P<yj>\d+):\d+\]'
)
_IDENT_LABEL_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

def _quote_label_if_needed(label: str) -> str:
    # If label isn't a bare IDENT, quote it as a STRING
    if _IDENT_LABEL_RE.match(label or ""):
        return label
    escaped = label.replace('\\', '\\\\').replace('"', '\\"')
    return f'"{escaped}"'

def rewrite_formulas_to_named_refs(final_json: dict) -> dict:
    """
    For every formula string in 'formulas', replace occurrences of:
        table[i:i][j:j]
    with:
        table[Label]
    where Label is taken from tables[f"{table}[0:0][j:j]"].
    Leaves anything it can't resolve unchanged.
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    # Build (table, row_j) -> label map from the first column (i==0).
    label_by_row: dict[tuple[str, int], str] = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)  # (table, i, j) for keys like table[i:i][j:j]
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
            # No label found for that row -> keep original text
            return m.group(0)
        return f"{t}[{_quote_label_if_needed(label)}]"

    # Rewrite every formula RHS (keys with i==1).
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

def main_cli() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    grammar_text = _load_grammar(args.grammar_file)

    # If running under Ion, delegate to Ion entry
    if _HAS_ION:
        return _main_ion(args.model)

    try:
        bundle = run_two_stage(
            user_prompt=args.prompt,
            model=args.model,
            grammar_text=grammar_text,
            temperature=args.temperature,
            outdir=args.outdir,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    # Bundle contains refined final JSON
    final_json = bundle.get("refined", {}) or {}

    text = json.dumps(final_json, ensure_ascii=False, indent=2)
    if args.out_path:
        with open(args.out_path, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)
    return 0

def _main_ion(default_model: str) -> int:
    try:
        user_prompt = works.param(1)
        current_table = works.param(1)
        bundle = run_two_stage(
            user_prompt=user_prompt,
            starting_scaffold=current_table,
            model=default_model,
            grammar_text=GRAMMAR,
            temperature=0.2,
            outdir=None,
        )
        final_json = bundle.get("refined", {}) or {}
        works.resolve(final_json)
        return 0
    except Exception as e:
        raise RuntimeError(f"Ion parameter access failed: {e}") from e

if __name__ == "__main__":
    # If you want CLI behavior when not under Ion, call main_cli(); otherwise keep Ion by default.
    if _HAS_ION:
        sys.exit(_main_ion('gpt-4o-mini'))
    else:
        sys.exit(main_cli())
