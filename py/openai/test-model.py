#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import argparse
from typing import Optional, Tuple

# ---------- Optional ion integration ----------
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
grammar TableModel;

// -------------------------
// Entry points
// -------------------------
start
  : mapping EOF
  | expr    EOF
  ;

// JSON-like key→formula mapping: key ":" formula (comma-separated)
mapping
  : entry (',' entry)* (',')?
  ;

entry
  : key ':' formula
  ;

key
  : tableRefKey
  ;

tableRefKey
  : IDENT indexing+                          // e.g., fte[5:5][1:1]
  ;

formula
  : expr
  ;

// -------------------------
// Expressions & functions
// Precedence: ^  >  * /  >  + -
// -------------------------
expr
  : <assoc=right> expr '^' expr                              # Pow
  | expr op=('*'|'/') expr                                   # MulDiv
  | expr op=('+'|'-') expr                                   # AddSub
  | primary                                                  # ToPrimary
  ;

primary
  : NUMBER                                                   # NumberLiteral
  | functionCall                                             # FuncCall
  | tableRef                                                 # TableReference
  | variable                                                 # ScalarVar
  | IDENT                                                    # BareIdent
  | '(' expr ')'                                             # Parens
  ;

functionCall
  : IDENT '(' argList? ')'
  ;

argList
  : expr (',' expr)*
  ;

// -------------------------
// Table references
// -------------------------
tableRef
  : IDENT indexing+                                          // at least one indexing block
  ;

indexing
  : '[' selectorList ']'
  ;

selectorList
  : selector (',' selector)?                                 // 1 or 2 selectors per []
  ;

selector
  : rangeSelector
  | labelSelector
  | posVarSelector
  ;

rangeSelector
  : bound ':' bound                                          // inclusive integer range
  ;

bound
  : INT
  ;

labelSelector
  : IDENT
  | QUOTED_LABEL                                             // quoted labels with escapes
  ;

posVarSelector
  : ROW VAR
  | COL VAR
  | VAR
  ;

variable
  : VAR
  ;

// -------------------------
// Lexer rules
// -------------------------
ROW           : 'row';
COL           : 'col';

NUMBER        : FLOAT | INT;
FLOAT         : INT '.' [0-9]+;
INT           : [0-9]+;

IDENT         : [A-Za-z_] [A-Za-z0-9_]*;

VAR           : '${' [A-Za-z_] [A-Za-z0-9_]* '}' ;

QUOTED_LABEL  : '"' ( ~["\\] | '\\' . )* '"' ;

WS            : [ \t\r\n]+ -> skip;
COMMENT       : '//' ~[\r\n]* -> skip;
"""

# ---------- System prompt for JSON-only + grammar guard ----------
SYS_JSON_ONLY = (
    "Return ONLY a JSON object matching the provided JSON schema. "
    "No prose, no markdown, no code fences. "
    "Generate at least two tables and one named assumptions."
)

# ---------- Utilities ----------
def _extract_json_snippet(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return text[start:end+1].strip()

# ---------- Domain pack/anchor synthesis ----------
def generate_domain_block_and_anchor_hints(
    domain_prompt: str,
    grammar_text: str,
    *,
    model: str = "gpt-5",
    temperature: float = 0.2,
) -> Tuple[str, str]:
    """
    Produces:
      - domain_block: multi-line block injected into the scaffold
      - anchor_hints: short formula-shaped examples aligned to your grammar
    """
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
        "  KPIs (put in 'outputs'):\n"
        "  ADDITIONAL HARD RULES:\n"
        "- Keep 6–12 tables in REQUIRED TABLES; use domain-appropriate names.\n"
        "- Use imperative, concise bullets.\n"
        "- Include realistic entities/constraints derived from the user's domain_prompt.\n\n"
        "Requirements for `anchor_hints`:\n"
        "- Provide 2–6 minimal, structure-only formula examples that MATCH THIS GRAMMAR STYLE:\n"
        "  TableName[column_label][row${i}] and range selectors like [1:12], never dot notation.\n"
        "- Do NOT invent functions outside the user's grammar; only +, -, *, /, ^ and parentheses.\n"
        "- Show how to compute KPIs by combining table fields (structure only, not values).\n"
        "- No code fences; plain text only.\n\n"
        "Global constraints:\n"
        "- Be specific to the domain_prompt; avoid generic templates unless requested.\n"
        "- Use snake_case names; do not start names with digits.\n"
    )

    user_msg = (
        "Build a domain pack and formula anchor hints for the following domain:\n\n"
        f"{domain_prompt}\n\n"
        "Also consider this grammar so your formula shapes match its addressing rules:\n"
        "---- GRAMMAR START ----\n"
        f"{grammar_text}\n"
        "---- GRAMMAR END ----\n"
    )

    input_payload = [
        {"role": "system", "content": [{"type": "input_text", "text": sys_msg}]},
        {"role": "user",   "content": [{"type": "input_text", "text": user_msg}]},
    ]

    try:
        resp = client.responses.create(
            model=model,
            input=input_payload,
            response_format={"type": "json_object"},
            temperature=temperature,
        )
        data = json.loads(resp.output_text)
    except TypeError as e:
        if "unexpected keyword argument 'response_format'" not in str(e):
            raise
        resp = client.responses.create(model=model, input=input_payload, temperature=temperature)
        raw = getattr(resp, "output_text", None) or str(resp)
        data = json.loads(_extract_json_snippet(raw))

    domain_block = (data.get("domain_block") or "").strip()
    anchor_hints = (data.get("anchor_hints") or "").strip()
    if not domain_block or not anchor_hints:
        raise ValueError("Model did not return both 'domain_block' and 'anchor_hints'.")
    return domain_block, anchor_hints

# ---------- Scaffold builder ----------
def build_system_scaffold(grammar_text: str, domain_block: str = "", anchor_hints: str = "") -> str:
    base = f"""
You generate structured as JSON.
HARD RULES:
- Formulas go into the "formulas" object mapping keys (tableRefKey) -> formulaString.
- Formula keys (assignments) use integer values where tablename[xstart:xend][ystart:yend] is the correct format
- tableRefKey MUST follow the same addressing rules as the grammar (e.g., TableName[colSel][rowSel]).
- Do NOT invent functions outside the grammar. Use only the allowed functions and operators.
- Use underscores for names; do not start names with digits; no dot-notation; fully-qualify references.
- Include an Assumptions table with default values for model inputs.
- if range integers are used in tables and function keys must have tablename[startx:endx][starty:endy] the model must contain both x and y values and nothing else (example: [x1:x2][y1:y2] only) 
{domain_block}

OUTPUT CONTRACT (must match the JSON Schema you will be validated against):
- model, assumptions, tables(schema with rows/columns), formulas (conforming to grammar), outputs (KPIs), errors (optional).
You MUST:
1) Define clear domain tables needed to compute the.
2) Wire tables with formulas using only the grammar.
3) Add explicit assumptions with defaults.
4) Keep labels/selectors consistent.
5) Return ONLY the JSON.
6) The model must contain more than 10 formulas
7) All tables must have all columns labeled and ranges are not used 


ANCHOR HINTS:
{anchor_hints}

GRAMMAR (EBNF/ANTLR style):
{grammar_text}
"""
    return base



def _to_jsonable(obj):
    """Recursively convert OpenAI SDK objects (and anything else) into JSON-safe types."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_to_jsonable(v) for v in obj]

    # OpenAI (pydantic) models: prefer model_dump_json -> dict, then model_dump -> dict
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

    # Generic objects: try __dict__
    if hasattr(obj, "__dict__"):
        try:
            return _to_jsonable(vars(obj))
        except Exception:
            pass

    # Last resort: string
    return str(obj)

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

    # ---- build scaffold with domain context ----
    try:
        domain_block, anchor_hints = generate_domain_block_and_anchor_hints(
            domain_prompt=prompt,
            grammar_text=grammar_text,
            model=scaffold_model,
            temperature=temperature,
        )
        sys_scaffold = build_system_scaffold(grammar_text, domain_block=domain_block, anchor_hints=anchor_hints)
        scaffold_info = {
            "domain_block": domain_block,
            "anchor_hints": anchor_hints,
            "sys_scaffold": sys_scaffold,
        }
    except Exception as e:
        sys_scaffold = build_system_scaffold(grammar_text)
        scaffold_info = {
            "domain_block": None,
            "anchor_hints": None,
            "sys_scaffold": sys_scaffold,
            "generation_error": str(e),
        }

    input_payload = [
        {"role": "system", "content": [{"type": "input_text", "text": SYS_JSON_ONLY + "\n\n" + sys_scaffold}]},
        {"role": "user",   "content": [{"type": "input_text", "text": prompt}]},
    ]

    # ---- call Responses API; ensure JSON-only output or fallback ----
    def _parse_output_text(text: str) -> dict:
        text = text or ""
        try:
            return json.loads(text)
        except Exception:
            return json.loads(_extract_json_snippet(text))

    raw_dump = None
    usage = None

    try:
        resp = client.responses.create(
            model=model,
            input=input_payload,
            response_format={"type": "json_object"},
            temperature=temperature,
        )
        output = _parse_output_text(resp.output_text)
        raw_dump = _to_jsonable(resp)          # <— JSON safe
        usage = _to_jsonable(getattr(resp, "usage", None))
    except TypeError as e:
        if "unexpected keyword argument 'response_format'" not in str(e):
            raise
        resp = client.responses.create(
            model=model,
            input=input_payload,
            temperature=temperature,
        )
        output = _parse_output_text(getattr(resp, "output_text", None) or str(resp))
        raw_dump = _to_jsonable(resp)          # <— JSON safe
        usage = _to_jsonable(getattr(resp, "usage", None))

    if not return_all:
        return output

    # Everything below is now JSON serializable
    return {
        "output": output,
        "request": {
            "model": model,
            "temperature": temperature,
            "input_payload": input_payload,
        },
        "scaffold": scaffold_info,
        "raw_response": raw_dump,
        "usage": usage,
    }
import json

def get_coffee_shop_model(path: str = "./output.json") -> dict:
    """
    Load the model JSON from a file (default: temp.json) and return it as a dict.
    """
    # Resolve relative to this script's directory so it's robust when run from elsewhere
    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, path)

    if not os.path.exists(json_path):
        raise FileNotFoundError(
            f"Could not find {json_path}. Create it next to this script or pass a different path."
        )

    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)

# Example:
# data = get_coffee_shop_model()
# print(type(data), data.keys())


# ---------- Core processing ----------
def build_input_text(user_prompt: str) -> str:
    return f"{user_prompt}"

def _main_process(user_prompt: str, model: str) -> int:
    data = get_coffee_shop_model()
    if _HAS_ION:
        works.resolve(data)
        return 0

    json_text = json.dumps(data, ensure_ascii=False, indent=2)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(json_text)
    else:
        print(json_text)
    return 0

# ---------- Ion entry ----------
def _main_ion(default_model: str) -> int:
    try:
        user_prompt = works.param(1)
        return _main_process(user_prompt, default_model)
    except Exception as e:
        raise RuntimeError(f"Ion parameter access failed: {e}") from e

# ---------- CLI entry ----------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Generate a grammar-driven model (tables + formulas) as JSON via OpenAI."
    )
    p.add_argument("prompt", help="Natural language description.")
    p.add_argument("--model", default="gpt-4o-mini", help="Model ID (default: gpt-4o-mini)")
    p.add_argument("--out", help="Path to write the JSON output (default: stdout)")
    p.add_argument("--grammar-file", help="Path to a grammar file to override the default", default=None)
    return p

def _load_grammar(grammar_file: Optional[str]) -> str:
    if grammar_file:
        with open(grammar_file, "r", encoding="utf-8") as f:
            return f.read()
    return GRAMMAR

def main():
    default_model = "gpt-4o-mini"
    _main_ion(default_model)

if __name__ == "__main__":
    sys.exit(main() or 0)
