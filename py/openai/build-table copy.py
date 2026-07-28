#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Three-stage AssignLang model builder + prior-results refinement.

Modified to emit exactly TWO tables:
  • Assumptions — only constants (default values).
  • pNl        — only formulas (no hard-coded constants for pNl rows).

Strong guarantee that the model output includes ALL assumptions needed by pNl formulas.
Post-processing also auto-creates any missing referenced assumptions with empty defaults.

Other notes retained from the original:
  • Arithmetic-only formulas.
  • Headers enforced, label sanitization, reference patching, units, annotations.
  • Robust JSON extraction and optional OpenAI usage.
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

def try_fix_json(text: str) -> dict:
    """
    Best-effort JSON recovery: fenced block -> balanced object -> brace repair.
    Falls back to {} if all attempts fail.
    """
    for fixer in (lambda t: _extract_json_snippet(t),
                  lambda t: t,
                  lambda t: _attempt_close_braces(t) or t):
        try:
            candidate = fixer(text)
            return json.loads(candidate)
        except Exception:
            continue
    return {}

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
        "Hard target: produce anchor hints that enable two-table finance with formulas in pNl."
    )

    user_msg = (
        "Build a domain pack and formula anchor hints for a startup financial model that begins with a large "
        "Assumptions table (constants) and culminates in a pNl table (formulas only).\n\n"
        f"DOMAIN PROMPT:\n{domain_prompt}\n\n"
        "Rules:\n"
        "- Two tables only: Assumptions, pNl.\n"
        "- pNl must be fully computed from Assumptions via arithmetic-only formulas.\n"
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

# ---------- Prompt expansion (kept simple) ----------
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
        "- Starts with a LARGE Assumptions table (defaults for prices, volumes, headcount plan, salaries, tax rates, etc.).\n"
        "- Produces a pNl table computed purely from Assumptions (arithmetic-only).\n"
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

# ---------- Required assumptions (used to coerce LLM + seed) ----------
REQUIRED_ASSUMPTIONS: List[str] = [
    # Core scaffolding
    "Currency", "Start_Year", "Months_In_Year",
    # Unit economics generic
    "Price_Per_Unit", "Monthly_Units_Year_1", "Unit_Cost",
    # Operating
    "Headcount_Year_1", "Avg_Salary", "Benefits_Load",
    "Rent_Per_Month", "Marketing_Per_Month", "R_and_D_Per_Month", "G_and_A_Per_Month",
    # Accounting
    "Depreciation_Years", "Tax_Rate",
]

# ---------- System scaffold (two-table, strict) ----------
def build_system_scaffold(grammar_text: str, domain_block: str = "", anchor_hints: str = "") -> str:
    base = f"""
You are generating a structured model as JSON only.

OUTPUT CONTRACT (STRICT)
- Return ONLY a JSON object with exactly four top-level keys: "tables", "formulas", "annotations", "units".
- Define exactly TWO tables: Assumptions and pNl (note the exact casing).
- All tables have 2 columns; [0:0][0:0]='Label', [1:1][0:0]='Value'.
- Label column [0:0][y:y] must be fully labeled and unique within its table.
- Formulas appear only in "formulas" at keys "<table>[1:1][y:y]".
- References use table[Label] with arithmetic-only operators (+ - * / ^ and parentheses). No functions or ranges.

TABLE RULES
- Assumptions: every labeled row MUST be a constant/value (NO formulas in Assumptions).
- pNl: every labeled row MUST be defined by a formula (NO constants in pNl; the tables map for pNl rows can be empty string "" since formulas live in 'formulas').

SCOPE LIMIT
- Do NOT create any tables other than Assumptions and pNl.
- Do NOT reference any tables other than Assumptions and pNl.

UNITS & ANNOTATIONS
- Provide one-sentence "annotations" for Assumptions and pNl.
- Provide "units": map of table -> Label -> unit string covering all labels.

REQUIRED ASSUMPTIONS (LLM MUST INCLUDE THESE LABELS IN 'Assumptions'):
- Currency
- Start_Year
- Months_In_Year
- Price_Per_Unit
- Monthly_Units_Year_1
- Unit_Cost
- Headcount_Year_1
- Avg_Salary
- Benefits_Load
- Rent_Per_Month
- Marketing_Per_Month
- R_and_D_Per_Month
- G_and_A_Per_Month
- Depreciation_Years
- Tax_Rate

VALIDATION CHECKLIST
- JSON only; exactly four top-level keys.
- Only two tables exist: Assumptions and pNl.
- Assumptions rows have constants and NO formulas.
- pNl rows have formulas and NO constants (values can be "" in tables; the actual numbers come from 'formulas').
- All table headers present.
- No self-references; all referenced labels exist.

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
    max_out = 16000
    content = _emit_once(model=model, system=system, user=user, temperature=temperature, max_tokens=max_out)
    try:
        output = _try_parse_json_or_raise(content)
    except Exception:
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
            skinny_user = (
                user
                + "\n\nSKINNY EMIT (SIZE CAP):\n"
                  "- Emit a VALID JSON object with exactly the four keys: tables, formulas, annotations, units.\n"
                  "- Include Assumptions and pNl only; ≤10 labeled rows per table if needed.\n"
                  "- JSON only."
            )
            content3 = _emit_once(model=model, system=system, user=skinny_user, temperature=temperature, max_tokens=max_out)
            try:
                output = _try_parse_json_or_raise(content3)
            except Exception:
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
            "- Ensure presence and connectivity of Assumptions and pNl.\n"
            "- JSON only. No prose."
        )

        user_msg = (
            "CURRENT MODEL JSON followed by DIAGNOSTICS. REPAIR and RETURN JSON ONLY.\n\n"
            "=== CURRENT_MODEL_JSON ===\n"
            f"{compact_json}\n\n"
            "=== DIAGNOSTICS ===\n"
            f"{diag}\n\n"
            "REPAIR & NORMALIZE:\n"
            "- Create any missing labels; initialize missing constants in Assumptions as '' and formulas in pNl as '0'.\n"
            "- Deduplicate labels; update formulas.\n"
            "- Rewrite any range/dot/function usage to arithmetic-only named refs."
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

def _collect_present_labels_by_table(tables: Dict[str, Any]) -> Dict[str, Set[str]]:
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
    tables = dict((final_json or {}).get("tables") or {})
    formulas = dict((final_json or {}).get("formulas") or {})
    present = _collect_present_labels_by_table(tables)

    missing: Dict[str, Set[str]] = {}
    for expr in formulas.values():
        if not isinstance(expr, str):
            continue
        for (t, label) in extract_named_refs(expr):
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
    if not os.environ.get("OPENAI_API_KEY"):
        return {}

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
        out: Dict[str, Dict[str, str]] = {}
        if isinstance(data, dict):
            for t, mapping in data.items():
                if isinstance(mapping, dict):
                    out[t] = {str(k): str(v) for k, v in mapping.items()}
        return out
    except Exception:
        return {}

def remove_self_referencing_formulas(final_json: dict) -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})

    labels_by_row = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str):
            labels_by_row[(t, j)] = v

    rows_to_delete = []
    for fkey, expr in list(formulas.items()):
        parsed = _parse_cell_key(fkey)
        if not parsed:
            continue
        t, i, j = parsed
        if i != 1 or j < 1:
            continue

        row_label = labels_by_row.get((t, j))
        if not isinstance(row_label, str) or not row_label:
            continue

        refs = extract_named_refs(expr if isinstance(expr, str) else "")
        if any((rt == t and rlab == row_label) for (rt, rlab) in refs):
            rows_to_delete.append((t, j, row_label, fkey))

    for (t, j, row_label, fkey) in rows_to_delete:
        label_key = _key(t, 0, j)
        value_key = _key(t, 1, j)
        if fkey in formulas:
            del formulas[fkey]
        if label_key in tables:
            del tables[label_key]
        if value_key in tables:
            del tables[value_key]
        if isinstance(units.get(t), dict) and row_label in units[t]:
            del units[t][row_label]

    data["tables"] = tables
    data["formulas"] = formulas
    data["units"] = units
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
    data = dict(final_json or {})
    tables: Dict[str, Any] = dict(data.get("tables") or {})
    formulas: Dict[str, Any] = dict(data.get("formulas") or {})
    units: Dict[str, Any] = dict(data.get("units") or {})

    missing = _find_missing_refs(data)
    if not missing:
        data["tables"] = tables
        return data

    gpt_defaults = _fetch_gpt_defaults_for_missing_refs(
        domain_prompt=domain_prompt,
        missing=missing,
        units=units if isinstance(units, dict) else {},
        model=model,
    )

    for table_name, labels in missing.items():
        if _key(table_name, 0, 0) not in tables:
            tables[_key(table_name, 0, 0)] = "Label"
        if _key(table_name, 1, 0) not in tables:
            tables[_key(table_name, 1, 0)] = "Value"

        provided = (gpt_defaults.get(table_name) or {})
        for label in labels:
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
                value = ""

            if value is not None:
                j = _next_row_index_for_table(tables, table_name)
                tables[_key(table_name, 0, j)] = label
                tables[_key(table_name, 1, j)] = str(value)

    data["tables"] = tables
    return data

def _looks_productized(tables: dict) -> bool:
    # detect presence of any label that ends with _A/_B/_C style productization
    for k, v in (tables or {}).items():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
        if not m: 
            continue
        t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
        if t == "Assumptions" and i == 0 and j >= 1 and isinstance(v, str):
            if re.search(r"_(A|B|C)$", v) or re.search(r"_A$|_B$|_C$", v):
                return True
    return False


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
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})
    annotations = dict(data.get("annotations") or {})

    referenced: Set[str] = set()
    for expr in (formulas or {}).values():
        if not isinstance(expr, str):
            continue
        for (rt, _lab) in extract_named_refs(expr):
            referenced.add(rt)

    if not referenced:
        data["tables"] = {}
        data["formulas"] = {}
        data["units"] = {}
        data["annotations"] = {}
        return data

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

# ---------- Required tables (restricted to two) ----------
_REQUIRED_TABLES = [
    "Assumptions",
    "pNl",
]

# ---------- (Kept but unused by pipeline) GPT seeding helpers ----------
def _fetch_gpt_finance_seeds(domain_prompt: str, *, model: str = "gpt-4o-mini") -> Dict[str, Dict[str, str]]:
    if not os.environ.get("OPENAI_API_KEY"):
        return {"Assumptions": {}, "Profit_and_Loss": {}}
    sys_msg = (
        "Return ONLY a JSON object with two keys Assumptions and Profit_and_Loss. "
        "Each key maps to an object of label->value (numbers or short strings). "
        "Numbers only (no units inside values)."
    )
    user_msg = (
        "Given this domain prompt, propose initial seeds for a LARGE Assumptions table.\n\n"
        f"{domain_prompt}\n"
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
        out = {"Assumptions": {}, "Profit_and_Loss": {}}
        for t in out.keys():
            if isinstance(data.get(t), dict):
                for k, v in data[t].items():
                    out[t][str(k)] = str(v)
        return out
    except Exception:
        return {"Assumptions": {}, "Profit_and_Loss": {}}

def seed_required_tables(final_json: dict, *, domain_prompt: str = "", model: str = "gpt-4o-mini") -> dict:
    """
    Ensures 'Assumptions' and 'pNl' exist with headers.
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})

    def _ensure_table(tname: str):
        if _key(tname, 0, 0) not in tables:
            tables[_key(tname, 0, 0)] = "Label"
        if _key(tname, 1, 0) not in tables:
            tables[_key(tname, 1, 0)] = "Value"

    for t in _REQUIRED_TABLES:
        _ensure_table(t)

    data["tables"] = tables
    return data

# ---------- FINAL POST-PROCESS: strip Auto_Label_* ----------
def _is_autolabel(s: Any) -> bool:
    return isinstance(s, str) and s.startswith("Auto_Label_")

def strip_auto_labels(final_json: dict) -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})
    annotations = dict(data.get("annotations") or {})

    to_delete_rows: Dict[str, Set[int]] = {}

    for k, v in list(tables.items()):
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and _is_autolabel(v):
            to_delete_rows.setdefault(t, set()).add(j)

    for t, rows in to_delete_rows.items():
        for j in rows:
            label_key = _key(t, 0, j)
            value_key = _key(t, 1, j)
            if value_key in formulas:
                del formulas[value_key]
            if label_key in tables:
                del tables[label_key]
            if value_key in tables:
                del tables[value_key]

    if isinstance(units, dict):
        for t, umap in list(units.items()):
            if not isinstance(umap, dict):
                continue
            for lab in list(umap.keys()):
                if _is_autolabel(lab):
                    del umap[lab]

    if isinstance(annotations, dict):
        for ak in list(annotations.keys()):
            if _is_autolabel(ak):
                del annotations[ak]

    data["tables"] = tables
    data["formulas"] = formulas
    data["units"] = units
    data["annotations"] = annotations
    return data

# ---------- SPEED HELPERS ----------
def _strip_values_from_tables(tables: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in (tables or {}).items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if (i == 0) or (i == 1 and j == 0):
            out[k] = v
    return out

def _needs_refine(full_json: dict) -> bool:
    diag = _diagnose_model_payload(full_json or "") or ""
    triggers = (
        "RANGE_REFS_AT",
        "DOT_NOTATION_AT",
        "ILLEGAL_FUNC_TOKENS",
        "DUPLICATE_LABELS",
        "SELF_REFERENCES_AT",
        "MISSING_HEADERS",
    )
    return any(tok in diag for tok in triggers)

def refine_formulas_only_with_chat(
    model_json: dict,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.0,
    max_tokens: int = 4000,
) -> dict:
    if not os.environ.get("OPENAI_API_KEY"):
        return model_json or {}

    pruned_tables = _strip_values_from_tables((model_json or {}).get("tables") or {})
    formulas = (model_json or {}).get("formulas") or {}
    compact_payload = {
        "tables": pruned_tables,
        "formulas": formulas
    }

    diag = _diagnose_model_payload(model_json or {})

    sys_msg = (
        "You are a STRICT validator-repairer for a finance spreadsheet model.\n"
        "Return ONLY a JSON object with exactly one key: 'formulas'. No prose.\n"
        "Rules:\n"
        "- Fix references to use table[Label] only (no ranges/dots/functions).\n"
        "- Remove self-references.\n"
        "- Arithmetic-only: + - * / ^ and parentheses.\n"
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
        merged = strip_whitespace_in_formulas(merged)
        merged = rewrite_formulas_to_named_refs(merged)
        merged = remove_self_referencing_formulas(merged)
        return merged
    return model_json or {}

# ---------- NEW HELPERS for the two-table contract ----------
def _ensure_header(tables: Dict[str, Any], tname: str) -> None:
    if _key(tname, 0, 0) not in tables: tables[_key(tname, 0, 0)] = "Label"
    if _key(tname, 1, 0) not in tables: tables[_key(tname, 1, 0)] = "Value"

def _add_const_row(tables: Dict[str, Any], tname: str, label: str, value: str) -> None:
    ensure_table_and_field(tables, tname, label, default_value=str(value))



def seed_three_product_saas_model(final_json: dict, products=None) -> dict:
    """
    Ensures:
      - Assumptions has constants for THREE SaaS products (A/B/C by default),
        including price, users, server costs, and product-level FTEs.
      - Company-level FTE (Sales & Marketing, G&A), payroll assumptions,
        facilities/marketing, tax, depreciation, etc.
      - pNl has formulas ONLY, with product-level Revenue/Server_Cost, totals,
        payroll buckets, OpEx, EBITDA, Depreciation, EBIT, Taxes, Net_Income.
    """
    if products is None:
        products = ["A", "B", "C"]

    def _key(table: str, i: int, j: int) -> str:
        return f"{table}[{i}:{i}][{j}:{j}]"

    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})
    annotations = dict(data.get("annotations") or {})

    # --- Ensure headers
    def _ensure_header(tname: str):
        if _key(tname, 0, 0) not in tables: tables[_key(tname, 0, 0)] = "Label"
        if _key(tname, 1, 0) not in tables: tables[_key(tname, 1, 0)] = "Value"
    _ensure_header("Assumptions")
    _ensure_header("pNl")

    # --- Add or ensure a constant row in Assumptions
    def _add_const(label: str, value: str):
        # Check if label already exists
        found = False
        max_row = 0
        for k, v in tables.items():
            m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
            if not m: continue
            t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
            if t == "Assumptions":
                max_row = max(max_row, j)
                if i == 0 and j >= 1 and v == label:
                    found = True
        if not found:
            row = max_row + 1 if max_row >= 1 else 1
            tables[_key("Assumptions", 0, row)] = label
            tables[_key("Assumptions", 1, row)] = str(value)

    # --- Default constants
    base_defaults = {
        "Currency": "USD",
        "Start_Year": "2025",
        "Months_In_Year": "12",
        "Avg_Salary": "140000",
        "Benefits_Load": "0.25",
        "Rent_Per_Month": "10000",
        "Marketing_Per_Month": "30000",
        "Depreciation_Years": "5",
        "Tax_Rate": "0.21",
        "FTE_Sales_Marketing": "6",
        "FTE_GA": "5",
    }
    for k, v in base_defaults.items():
        _add_const(k, v)

    # Product-specific assumptions (conservative defaults; feel free to tweak)
    for p in products:
        _add_const(f"Price_Per_User_{p}", "40")           # USD/user/month
        _add_const(f"Monthly_Users_{p}", "1000")          # users
        _add_const(f"Server_Cost_Per_User_{p}", "6")      # USD/user/month
        _add_const(f"FTE_Dev_{p}", "3")
        _add_const(f"FTE_Maintenance_{p}", "2")
        _add_const(f"FTE_Support_{p}", "2")

    # --- Units for assumptions
    units.setdefault("Assumptions", {})
    uA = units["Assumptions"]
    uA.update({
        "Currency": "unitless",
        "Start_Year": "year",
        "Months_In_Year": "months",
        "Avg_Salary": "USD/year",
        "Benefits_Load": "fraction",
        "Rent_Per_Month": "USD/month",
        "Marketing_Per_Month": "USD/month",
        "Depreciation_Years": "years",
        "Tax_Rate": "fraction",
        "FTE_Sales_Marketing": "FTE",
        "FTE_GA": "FTE",
    })
    for p in products:
        uA[f"Price_Per_User_{p}"] = "USD/user/month"
        uA[f"Monthly_Users_{p}"] = "users"
        uA[f"Server_Cost_Per_User_{p}"] = "USD/user/month"
        uA[f"FTE_Dev_{p}"] = "FTE"
        uA[f"FTE_Maintenance_{p}"] = "FTE"
        uA[f"FTE_Support_{p}"] = "FTE"

    annotations["Assumptions"] = (
        "Three-product SaaS constants (pricing, volume, server costs, FTEs) plus payroll/overhead."
    )

    # --- pNl labels (blank values; all computed in formulas)
    pnl_labels = []
    for p in products:
        pnl_labels += [f"Revenue_{p}", f"Server_Cost_{p}"]
    pnl_labels += [
        "Total_Revenue",
        "Total_Server_Cost",
        "Gross_Profit",
        "Payroll_Dev",
        "Payroll_Maintenance",
        "Payroll_Support",
        "Payroll_Sales_Marketing",
        "Payroll_GA",
        "Total_Payroll",
        "Facilities_Overhead",
        "Marketing_Spend",
        "Operating_Expenses",
        "EBITDA",
        "Depreciation",
        "EBIT",
        "Taxes",
        "Net_Income",
    ]

    # write rows
    next_row = 1
    for lab in pnl_labels:
        tables[_key("pNl", 0, next_row)] = lab
        tables[_key("pNl", 1, next_row)] = ""   # formulas drive value
        next_row += 1

    # Units for pNl
    units.setdefault("pNl", {})
    uP = units["pNl"]
    for p in products:
        uP[f"Revenue_{p}"] = "USD/year"
        uP[f"Server_Cost_{p}"] = "USD/year"
    for lab in [
        "Total_Revenue","Total_Server_Cost","Gross_Profit",
        "Payroll_Dev","Payroll_Maintenance","Payroll_Support",
        "Payroll_Sales_Marketing","Payroll_GA","Total_Payroll",
        "Facilities_Overhead","Marketing_Spend","Operating_Expenses",
        "EBITDA","Depreciation","EBIT","Taxes","Net_Income",
    ]:
        uP[lab] = "USD/year"

    annotations["pNl"] = "Annual P&L for three-product SaaS; formulas only."

    # --- index pNl rows
    row_idx = {}
    for k, v in tables.items():
        m = re.match(r"^pNl\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
        if not m: 
            continue
        i, j = int(m.group(1)), int(m.group(2))
        if i == 0 and j >= 1 and isinstance(v, str):
            row_idx[v] = j

    def setf(label: str, expr: str):
        formulas[_key("pNl", 1, row_idx[label])] = expr

    # --- product revenues and server costs
    for p in products:
        setf(f"Revenue_{p}",
             f"Assumptions[Price_Per_User_{p}]*Assumptions[Monthly_Users_{p}]*Assumptions[Months_In_Year]")
        setf(f"Server_Cost_{p}",
             f"Assumptions[Server_Cost_Per_User_{p}]*Assumptions[Monthly_Users_{p}]*Assumptions[Months_In_Year]")

    # totals & gross profit
    sum_rev = "+".join([f"pNl[Revenue_{p}]" for p in products])
    sum_srv = "+".join([f"pNl[Server_Cost_{p}]" for p in products])
    setf("Total_Revenue", sum_rev)
    setf("Total_Server_Cost", sum_srv)
    setf("Gross_Profit", "pNl[Total_Revenue]-pNl[Total_Server_Cost]")

    # payroll buckets
    setf("Payroll_Dev",
         "+".join([f"Assumptions[FTE_Dev_{p}]" for p in products]) +
         "*Assumptions[Avg_Salary]*(1+Assumptions[Benefits_Load])")
    setf("Payroll_Maintenance",
         "+".join([f"Assumptions[FTE_Maintenance_{p}]" for p in products]) +
         "*Assumptions[Avg_Salary]*(1+Assumptions[Benefits_Load])")
    setf("Payroll_Support",
         "+".join([f"Assumptions[FTE_Support_{p}]" for p in products]) +
         "*Assumptions[Avg_Salary]*(1+Assumptions[Benefits_Load])")
    setf("Payroll_Sales_Marketing",
         "Assumptions[FTE_Sales_Marketing]*Assumptions[Avg_Salary]*(1+Assumptions[Benefits_Load])")
    setf("Payroll_GA",
         "Assumptions[FTE_GA]*Assumptions[Avg_Salary]*(1+Assumptions[Benefits_Load])")
    setf("Total_Payroll",
         "pNl[Payroll_Dev]+pNl[Payroll_Maintenance]+pNl[Payroll_Support]+pNl[Payroll_Sales_Marketing]+pNl[Payroll_GA]")

    # facilities & marketing
    setf("Facilities_Overhead",
         "Assumptions[Rent_Per_Month]*Assumptions[Months_In_Year]")
    setf("Marketing_Spend",
         "Assumptions[Marketing_Per_Month]*Assumptions[Months_In_Year]")

    # OpEx and EBITDA
    setf("Operating_Expenses",
         "pNl[Total_Payroll]+pNl[Facilities_Overhead]+pNl[Marketing_Spend]")
    setf("EBITDA",
         "pNl[Gross_Profit]-pNl[Operating_Expenses]")

    # depreciation, EBIT, taxes, net income
    setf("Depreciation",
         "(0.05*Assumptions[Avg_Salary]*(+"
         + "+".join([f"Assumptions[FTE_Dev_{p}]+Assumptions[FTE_Maintenance_{p}]+Assumptions[FTE_Support_{p}]" for p in products])
         + "+Assumptions[FTE_Sales_Marketing]+Assumptions[FTE_GA]))/Assumptions[Depreciation_Years]".replace("++", "+"))
    setf("EBIT", "pNl[EBITDA]-pNl[Depreciation]")
    setf("Taxes", "pNl[EBIT]*Assumptions[Tax_Rate]")
    setf("Net_Income", "pNl[EBIT]-pNl[Taxes]")

    # wipe any accidental Assumptions formulas
    formulas = {k: v for k, v in formulas.items()
                if not (re.match(r"^Assumptions\[\d+:\d+\]\[\d+:\d+\]$", k or ""))}

    data["tables"] = tables
    data["formulas"] = formulas
    data["units"] = units
    data["annotations"] = annotations
    return data




def seed_two_table_model(final_json: dict) -> dict:
    """
    Ensures:
      - Assumptions has sane default constants (no formulas).
      - pNl has common P&L lines with formulas ONLY (no constants).
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})
    annotations = dict(data.get("annotations") or {})

    # --- Assure the two tables exist ---
    _ensure_header(tables, "Assumptions")
    _ensure_header(tables, "pNl")

    # --- Seed Assumptions (constants only) ---
    defaults = {
        "Currency": "USD",
        "Start_Year": "2025",
        "Months_In_Year": "12",
        "Price_Per_Unit": "150",
        "Monthly_Units_Year_1": "1000",
        "Unit_Cost": "60",
        "Headcount_Year_1": "8",
        "Avg_Salary": "120000",
        "Benefits_Load": "0.25",  # fraction
        "Rent_Per_Month": "8000",
        "Marketing_Per_Month": "15000",
        "R_and_D_Per_Month": "70000",
        "G_and_A_Per_Month": "25000",
        "Depreciation_Years": "5",
        "Tax_Rate": "0.21",       # fraction
    }
    for lab, val in defaults.items():
        _add_const_row(tables, "Assumptions", lab, val)

    # Units for Assumptions
    units.setdefault("Assumptions", {})
    units["Assumptions"].update({
        "Currency": "unitless",
        "Start_Year": "year",
        "Months_In_Year": "months",
        "Price_Per_Unit": "USD/unit",
        "Monthly_Units_Year_1": "units/month",
        "Unit_Cost": "USD/unit",
        "Headcount_Year_1": "count",
        "Avg_Salary": "USD/year",
        "Benefits_Load": "fraction",
        "Rent_Per_Month": "USD/month",
        "Marketing_Per_Month": "USD/month",
        "R_and_D_Per_Month": "USD/month",
        "G_and_A_Per_Month": "USD/month",
        "Depreciation_Years": "years",
        "Tax_Rate": "fraction",
    })
    annotations["Assumptions"] = "Default operating and cost parameters; all rows are constants."

    # --- pNl labels (values left blank; ALL computed in formulas) ---
    pnl_labels = [
        "Revenue",
        "COGS",
        "Gross_Profit",
        "Operating_Expenses",
        "EBITDA",
        "Depreciation",
        "EBIT",
        "Taxes",
        "Net_Income",
    ]
    row = 1
    for lab in pnl_labels:
        tables[_key("pNl", 0, row)] = lab
        tables[_key("pNl", 1, row)] = ""   # value comes from 'formulas'
        row += 1

    # Units for pNl
    units.setdefault("pNl", {})
    units["pNl"].update({
        "Revenue": "USD/year",
        "COGS": "USD/year",
        "Gross_Profit": "USD/year",
        "Operating_Expenses": "USD/year",
        "EBITDA": "USD/year",
        "Depreciation": "USD/year",
        "EBIT": "USD/year",
        "Taxes": "USD/year",
        "Net_Income": "USD/year",
    })
    annotations["pNl"] = "Annual P&L computed entirely from Assumptions via formulas."

    # Build quick index of pNl row indices
    pnl_row_index = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed: continue
        t, i, j = parsed
        if t == "pNl" and i == 0 and j >= 1 and isinstance(v, str):
            pnl_row_index[v] = j

    def set_pnl_formula(label: str, expr: str) -> None:
        j = pnl_row_index[label]
        formulas[_key("pNl", 1, j)] = expr

    # --- pNl formulas (arithmetic-only) ---
    set_pnl_formula("Revenue",
        "Assumptions[Price_Per_Unit]*Assumptions[Monthly_Units_Year_1]*Assumptions[Months_In_Year]"
    )
    set_pnl_formula("COGS",
        "Assumptions[Unit_Cost]*Assumptions[Monthly_Units_Year_1]*Assumptions[Months_In_Year]"
    )
    set_pnl_formula("Gross_Profit",
        "pNl[Revenue]-pNl[COGS]"
    )
    set_pnl_formula("Operating_Expenses",
        "(Assumptions[Rent_Per_Month]+Assumptions[Marketing_Per_Month]+Assumptions[R_and_D_Per_Month]+Assumptions[G_and_A_Per_Month])"
        "*Assumptions[Months_In_Year]"
        "+Assumptions[Headcount_Year_1]*Assumptions[Avg_Salary]*(1+Assumptions[Benefits_Load])"
    )
    set_pnl_formula("EBITDA",
        "pNl[Gross_Profit]-pNl[Operating_Expenses]"
    )
    set_pnl_formula("Depreciation",
        "(Assumptions[Headcount_Year_1]*Assumptions[Avg_Salary]*0.05)/Assumptions[Depreciation_Years]"
    )
    set_pnl_formula("EBIT",
        "pNl[EBITDA]-pNl[Depreciation]"
    )
    set_pnl_formula("Taxes",
        "pNl[EBIT]*Assumptions[Tax_Rate]"
    )
    set_pnl_formula("Net_Income",
        "pNl[EBIT]-pNl[Taxes]"
    )

    # Remove any accidental formulas in Assumptions
    formulas = {k: v for k, v in formulas.items()
                if not (_parse_cell_key(k) and _parse_cell_key(k)[0] == "Assumptions")}

    # Keep only two tables everywhere
    keep_tables = {"Assumptions", "pNl"}
    def _filter_maps_by_tables(d: Dict[str, Any]) -> Dict[str, Any]:
        out = {}
        for k, v in (d or {}).items():
            parsed = _parse_cell_key(k)
            if parsed and parsed[0] in keep_tables:
                out[k] = v
        return out

    data["tables"] = _filter_maps_by_tables(tables)
    data["formulas"] = _filter_maps_by_tables(formulas)
    data["units"] = {t: u for t, u in (units or {}).items() if t in keep_tables}
    data["annotations"] = {t: a for t, a in (annotations or {}).items() if t in keep_tables}
    return data
def fixup_pnl_formulas(model: dict) -> dict:
    tbl = model.get("tables", {})
    fml = model.get("formulas", {})
    units = model.setdefault("units", {})
    uA = units.setdefault("Assumptions", {})
    uP = units.setdefault("pNl", {})

    # --- Ensure correct payroll parentheses
    def wrap_fte_sum(label_base: str, fte_labels: list):
        # label_base: "Payroll_Dev", etc.
        # Construct (FTE_A + FTE_B + ...)*AvgSalary*(1+Benefits_Load)
        sum_expr = "(" + "+".join(f"Assumptions[{x}]" for x in fte_labels) + ")"
        expr = f"{sum_expr}*Assumptions[Avg_Salary]*(1+Assumptions[Benefits_Load])"
        # Find the pNl row for this label and set formula
        for k, v in tbl.items():
            m = re.match(r"^pNl\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
            if not m or m.group(1) != "0":
                continue
            if v == label_base:
                row = int(m.group(2))
                fml[f"pNl[1:1][{row}:{row}]"] = expr
                break

    # Dev/Maint/Support use product FTEs
    wrap_fte_sum("Payroll_Dev",        ["FTE_Dev_A","FTE_Dev_B","FTE_Dev_C"])
    wrap_fte_sum("Payroll_Maintenance",["FTE_Maintenance_A","FTE_Maintenance_B","FTE_Maintenance_C"])
    wrap_fte_sum("Payroll_Support",    ["FTE_Support_A","FTE_Support_B","FTE_Support_C"])
    # Sales & Marketing, G&A are single FTE labels
    wrap_fte_sum("Payroll_Sales_Marketing",["FTE_Sales_Marketing"])
    wrap_fte_sum("Payroll_GA",              ["FTE_GA"])

    # --- Clean up Depreciation leading '(+'
    # Find Depreciation row
    dep_row = None
    for k, v in tbl.items():
        m = re.match(r"^pNl\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
        if m and m.group(1) == "0" and v == "Depreciation":
            dep_row = int(m.group(2))
            break
    if dep_row is not None:
        dep_key = f"pNl[1:1][{dep_row}:{dep_row}]"
        if dep_key in fml:
            fml[dep_key] = fml[dep_key].replace("(+", "(")

    # --- Units: keep only keys that exist as labels
    # collect actual labels
    labels = set()
    for k, v in tbl.items():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
        if not m: 
            continue
        if m.group(1) == "Assumptions" and m.group(2) == "0" and isinstance(v, str) and v not in ("Label",""):
            labels.add(v)
        if m.group(1) == "pNl" and m.group(2) == "0" and isinstance(v, str) and v not in ("Label",""):
            labels.add(v)

    # prune stale unit keys and add missing ones
    for section, bucket in [("Assumptions", uA), ("pNl", uP)]:
        for k in list(bucket.keys()):
            if k not in labels:
                del bucket[k]
        # ensure required units are present for any missing label in this section
        for lab in labels:
            # add defaults if missing
            if lab not in bucket:
                if section == "Assumptions":
                    # sensible defaults by suffix
                    if lab.startswith("Price_Per_User_"):
                        bucket[lab] = "USD/user/month"
                    elif lab.startswith("Monthly_Users_"):
                        bucket[lab] = "users"
                    elif lab.startswith("Server_Cost_Per_User_"):
                        bucket[lab] = "USD/user/month"
                    elif lab.startswith("FTE_"):
                        bucket[lab] = "FTE"
                    elif lab in ("Avg_Salary",):
                        bucket[lab] = "USD/year"
                    elif lab.endswith("_Per_Month"):
                        bucket[lab] = "USD/month"
                    elif lab in ("Benefits_Load","Tax_Rate"):
                        bucket[lab] = "fraction"
                    elif lab in ("Months_In_Year","Depreciation_Years"):
                        bucket[lab] = "years" if lab == "Depreciation_Years" else "months"
                    else:
                        bucket[lab] = "unitless"
                else:
                    bucket[lab] = "USD/year"

    # --- Optional COGS alias
    # If someone expects COGS_Total, alias from Total_Server_Cost (units too).
    # Find rows for both; create if missing label row isn't desired—here we only alias via formula map.
    total_srv_row = None
    for k, v in tbl.items():
        m = re.match(r"^pNl\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
        if m and m.group(1) == "0" and v == "Total_Server_Cost":
            total_srv_row = int(m.group(2))
    if total_srv_row is not None:
        # create a synthetic formula entry for COGS_Total if the label exists; if not, skip quietly
        for k, v in tbl.items():
            m = re.match(r"^pNl\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
            if m and m.group(1) == "0" and v == "COGS_Total":
                row = int(m.group(2))
                fml[f"pNl[1:1][{row}:{row}]"] = "pNl[Total_Server_Cost]"
                uP["COGS_Total"] = "USD/year"
                break

    model["formulas"] = fml
    model["units"] = units
    return model


def enforce_two_table_contract(final_json: dict) -> dict:
    """
    Final guard:
      - Drops any tables except Assumptions and pNl.
      - Ensures no formulas target Assumptions.
      - Ensures pNl has formulas for every labeled row and no constants (values can be "").
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})
    units = dict(data.get("units") or {})
    annotations = dict(data.get("annotations") or {})

    keep = {"Assumptions", "pNl"}

    # Filter maps by table
    def _filter(d: Dict[str, Any]) -> Dict[str, Any]:
        out = {}
        for k, v in (d or {}).items():
            parsed = _parse_cell_key(k)
            if parsed and parsed[0] in keep:
                out[k] = v
        return out

    tables = _filter(tables)
    formulas = _filter(formulas)

    # No formulas in Assumptions
    formulas = {k: v for k, v in formulas.items()
                if not (_parse_cell_key(k) and _parse_cell_key(k)[0] == "Assumptions")}

    # Ensure pNl rows have formulas and no constants
    pnl_labels_by_row = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if t == "pNl" and i == 0 and j >= 1 and isinstance(v, str):
            pnl_labels_by_row[j] = v

    for row, lab in pnl_labels_by_row.items():
        value_key = _key("pNl", 1, row)
        # wipe any literal constants sitting in tables; value is driven by formula
        if value_key in tables:
            tables[value_key] = ""
        # ensure a formula exists
        if value_key not in formulas:
            formulas[value_key] = "0"  # minimal valid formula; gets replaced by seeds upstream

    data["tables"] = tables
    data["formulas"] = formulas
    data["units"] = {t: u for t, u in (units or {}).items() if t in keep}
    data["annotations"] = {t: a for t, a in (annotations or {}).items() if t in keep}
    return data

def call_llm_with_retry(
    prompt: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.2,
    max_retries: int = 3,
    json_mode: bool = True,
    max_tokens: int = 4000
) -> str:
    """
    Wrapper around the LLM chat API that retries on transient errors or malformed outputs.
    Ensures the returned string is not empty and attempts multiple calls if the model fails
    to produce valid JSON.

    Returns: raw text output from the model.
    """
    from openai import OpenAI
    import time
    client = OpenAI()

    system_prompt = (
        "You are a strict JSON emitter. Return only valid JSON that matches the schema "
        "described in the system message. Do not include any explanations, markdown, or code fences."
    )

    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"} if json_mode else None,
            )
            content = response.choices[0].message.content
            if content and content.strip():
                return content
            else:
                raise ValueError("Empty response from LLM.")
        except Exception as e:
            last_error = e
            print(f"⚠️ LLM call failed (attempt {attempt}/{max_retries}): {e}")
            time.sleep(min(2**attempt, 8))  # exponential backoff

    raise RuntimeError(f"LLM call failed after {max_retries} retries: {last_error}")


def generate_json_from_grammar(prompt: str, model: str = "gpt-4o-mini") -> dict:
    """
    Stage 1 (revised): Calls the LLM with a concrete SaaS-3-products instruction
    and the strict two-table contract. Returns parsed JSON.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set; cannot call OpenAI.")

    grammar_text = load_grammar_text()

    # hard guardrail that mirrors your scaffold (JSON-only, two tables, arithmetic ref syntax)
    system_scaffold = build_system_scaffold(grammar_text)

    # strengthen the user instruction so GPT bakes in your domain specifics
    user_instruction = f"""
You are building a two-table finance model for a SaaS company with THREE products (A, B, C).
Rules:
- Exactly two tables: Assumptions (constants only) and pNl (formulas only).
- All formulas must be arithmetic-only using the syntax Table[Label].
- Include explicit assumptions for:
  • Price per user per month per product (A/B/C)
  • Users per product (A/B/C)
  • Server cost per user per month per product (A/B/C)
  • FTE counts per product for Dev, Maintenance, Support
  • Company-level FTE for Sales & Marketing and G&A
  • Payroll assumptions (Avg_Salary, Benefits_Load)
  • Rent, Marketing, Depreciation_Years, Tax_Rate, Months_In_Year, Start_Year
- pNl must include product revenues, server costs per product, COGS total, payroll by function,
  facilities/overhead, marketing spend, Operating_Expenses, EBITDA, Depreciation, EBIT, Taxes, Net_Income.

Your content must be sufficient for post-processing without adding new tables later.

USER PROMPT (from caller):
{prompt}
""".strip()

    # visible breadcrumb
    try:
        works.msg("🔗 calling OpenAI chat.completions (generate_json_from_grammar)")
    except Exception:
        print("🔗 calling OpenAI chat.completions (generate_json_from_grammar)", file=sys.stderr)

    raw_output = call_llm_with_retry(
        prompt=f"{system_scaffold}\n\nYour task:\nReturn ONLY the JSON model.\n\n{user_instruction}",
        model=model,
        json_mode=True,
        temperature=0.15,
        max_tokens=6000,
    )

    try:
        parsed = json.loads(raw_output)
    except Exception:
        parsed = try_fix_json(raw_output)

    if not isinstance(parsed, dict):
        parsed = {}

    parsed.setdefault("tables", {})
    parsed.setdefault("formulas", {})
    parsed.setdefault("annotations", {})
    parsed.setdefault("units", {})

    return parsed


def run_two_stage(prompt: str, domain_prompt: str = "", anchor_hints: str = "", model: str = "gpt-4o-mini") -> dict:
    """
    Orchestrator (revised):
    1) Explicit LLM call that bakes in 3-product SaaS structure.
    2) Merge + enforce two-table contract.
    3) Hygiene passes.
    """
    try:
        works.msg("🚀 Starting two-stage generation (LLM explicit)...")
        works.msg(f"model={model}")
    except Exception:
        print("🚀 Starting two-stage generation (LLM explicit)...", file=sys.stderr)
        print(f"model={model}", file=sys.stderr)

    # ---- Stage 1: explicit LLM call that includes your 3-product SaaS constraints
    base_json = generate_json_from_grammar(prompt, model=model)
    try:
        works.msg("✅ Stage 1 complete: LLM returned base JSON.")
    except Exception:
        print("✅ Stage 1 complete: LLM returned base JSON.", file=sys.stderr)

    # ---- Stage 2: merge + seed + enforce strict two-table
    final_json = merge_with_base(base_json)
    
    
       # If we don't see productized labels, seed the 3-product SaaS scaffold
    if not _looks_productized(final_json.get("tables")):
        final_json = seed_three_product_saas_model(final_json, products=["A", "B", "C"])
    final_json = enforce_two_table_contract(final_json)    # wipes constants from pNl etc.

    # ---- Hygiene & normalization
    final_json = normalize_formulas(final_json)
    final_json = ensure_headers_present(final_json)
    final_json = ensure_unique_labels(final_json)

    # optional: ensure units/annotations are fully present
    final_json = ensure_units_and_annotations(final_json)
    final_json = fixup_pnl_formulas(final_json)  # <— add this

    try:
        diag = _diagnose_model_payload(final_json)
        works.msg("🩺 diagnostics")
        works.resolve(final_json)
    except Exception:
        print("🩺 diagnostics", file=sys.stderr)
        print(_diagnose_model_payload(final_json), file=sys.stderr)

    return final_json


def load_grammar_text(grammar_file: str | None = None) -> str:
    """
    Loads the JSON grammar definition used to constrain model generation.
    If a custom grammar file path is provided, it reads from that file;
    otherwise, it falls back to the built-in GRAMMAR constant.

    Returns: str (grammar text)
    """
    import os

    if grammar_file and os.path.exists(grammar_file):
        with open(grammar_file, "r", encoding="utf-8") as f:
            grammar_text = f.read()
            print(f"📘 Loaded custom grammar file: {grammar_file}")
            return grammar_text

    # fallback to default grammar constant
    print("📘 Using built-in default grammar definition.")
    return GRAMMAR



def merge_with_base(model_json: dict, base_json: dict | None = None) -> dict:
    """
    Merge the generated model JSON with a base model structure.
    Ensures that all top-level keys ('tables', 'formulas', 'annotations', 'units')
    are present and merges non-destructively so existing values are not overwritten.

    Args:
        model_json: The current generated model dictionary.
        base_json:  A base dictionary providing default structure or seed values.

    Returns:
        dict: Merged dictionary preserving both existing and base data.
    """
    result = {
        "tables": {},
        "formulas": {},
        "annotations": {},
        "units": {},
    }

    # start from base if provided
    if isinstance(base_json, dict):
        for key in result.keys():
            if isinstance(base_json.get(key), dict):
                result[key].update(base_json[key])

    # overlay with new content, keeping existing base entries if missing
    if isinstance(model_json, dict):
        for key in result.keys():
            if isinstance(model_json.get(key), dict):
                result[key].update(model_json[key])

    return result




def normalize_formulas(model_json: dict) -> dict:
    """
    Normalize all formula expressions within the model JSON.
    Ensures arithmetic-only syntax (+ - * / ^), removes whitespace,
    replaces invalid tokens, and standardizes references to table[label] form.

    Args:
        model_json (dict): Full structured model containing 'formulas' and 'tables'.

    Returns:
        dict: Model JSON with normalized formulas.
    """
    import re

    if not isinstance(model_json, dict):
        return model_json or {}

    formulas = dict(model_json.get("formulas") or {})
    tables = dict(model_json.get("tables") or {})

    # regex patterns
    _whitespace_re = re.compile(r"\s+")
    _invalid_func_re = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\s*\(")  # function-like patterns
    _range_re = re.compile(r"\[\d+:\d+\]\[\d+:\d+\]")               # range refs
    _dot_notation_re = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]")  # dot notation

    cleaned_formulas = {}

    for key, expr in formulas.items():
        if not isinstance(expr, str):
            continue

        f = expr.strip()

        # Remove whitespace
        f = _whitespace_re.sub("", f)

        # Remove disallowed syntax
        f = _invalid_func_re.sub("", f)
        f = _range_re.sub("", f)
        f = _dot_notation_re.sub("", f)

        # Replace double operators like "--" -> "+"
        f = f.replace("--", "+").replace("++", "+").replace("+-", "-")

        # Ensure only valid arithmetic characters remain
        f = re.sub(r"[^A-Za-z0-9_\[\]\+\-\*\/\^\(\)\.]", "", f)

        cleaned_formulas[key] = f

    model_json["formulas"] = cleaned_formulas
    return model_json


def ensure_headers_present(model_json: dict) -> dict:
    """
    Ensures every table in the model has its two mandatory headers:
        [0:0][0:0] = 'Label'
        [1:1][0:0] = 'Value'
    If a table is missing either header, it is automatically added.

    Args:
        model_json (dict): Full model dictionary with 'tables' and optionally 'formulas'.

    Returns:
        dict: Model JSON with enforced headers.
    """
    if not isinstance(model_json, dict):
        return model_json or {}

    tables = dict(model_json.get("tables") or {})
    formulas = dict(model_json.get("formulas") or {})

    # Collect all distinct table names mentioned anywhere
    def _parse_cell_key(k: str):
        import re
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
        return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None

    table_names = set()
    for d in (tables, formulas):
        for key in d.keys():
            parsed = _parse_cell_key(key)
            if parsed:
                table_names.add(parsed[0])

    def _key(table: str, i: int, j: int) -> str:
        return f"{table}[{i}:{i}][{j}:{j}]"

    for tname in table_names:
        # Add headers if missing
        if tables.get(_key(tname, 0, 0)) != "Label":
            tables[_key(tname, 0, 0)] = "Label"
        if tables.get(_key(tname, 1, 0)) != "Value":
            tables[_key(tname, 1, 0)] = "Value"

    model_json["tables"] = tables
    return model_json



def ensure_unique_labels(model_json: dict) -> dict:
    """
    Ensures that each table's Label column contains unique labels.
    If duplicates are found, a numeric suffix (_2, _3, etc.) is appended.

    Args:
        model_json (dict): Full model dictionary with 'tables' key.

    Returns:
        dict: Model JSON with unique labels per table.
    """
    if not isinstance(model_json, dict):
        return model_json or {}

    tables = dict(model_json.get("tables") or {})

    def _parse_cell_key(k: str):
        import re
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$", k or "")
        return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None

    def _key(t: str, i: int, j: int) -> str:
        return f"{t}[{i}:{i}][{j}:{j}]"

    # Build per-table index of label values
    labels_by_table = {}
    for k, v in tables.items():
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j > 0:  # label column, not header
            labels_by_table.setdefault(t, []).append((j, str(v)))

    # Detect and rename duplicates
    for tname, entries in labels_by_table.items():
        seen = {}
        for j, label in entries:
            base = label.strip() or "Unnamed"
            if base not in seen:
                seen[base] = 1
            else:
                seen[base] += 1
                base = f"{base}_{seen[base]}"
            tables[_key(tname, 0, j)] = base  # update with unique name

    model_json["tables"] = tables
    return model_json



def ensure_units_and_annotations(model_json: dict, default_unit: str = "unitless") -> dict:
    """
    Ensures every labeled row in every table has a unit entry, and that each table
    has a concise annotation. Does not overwrite existing units/annotations.

    Args:
        model_json (dict): Full model dictionary with 'tables', 'units', 'annotations'.

    Returns:
        dict: Updated model JSON with complete units and annotations.
    """
    if not isinstance(model_json, dict):
        return model_json or {}

    tables = dict(model_json.get("tables") or {})
    units = dict(model_json.get("units") or {})
    annotations = dict(model_json.get("annotations") or {})

    # Helper: parse "<Table>[i:i][j:j]" -> (Table, i, j)
    import re
    key_re = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$")
    def _parse(k: str):
        m = key_re.match(k or "")
        return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None

    # Collect labels by table
    labels_by_table = {}
    for k, v in tables.items():
        parsed = _parse(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str) and v.strip():
            labels_by_table.setdefault(t, set()).add(v)

    # Initialize units for tables if missing
    for t, labels in labels_by_table.items():
        units.setdefault(t, {})
        for lab in labels:
            units[t].setdefault(lab, default_unit)

    # Provide concise annotations if missing
    for t in labels_by_table.keys():
        if t not in annotations or not isinstance(annotations[t], str) or not annotations[t].strip():
            if t == "Assumptions":
                annotations[t] = "Default operating parameters; constants only (no formulas)."
            elif t.lower() == "pnl" or t == "pNl":
                annotations[t] = "Annual profit and loss computed entirely via formulas."
            else:
                annotations[t] = "Auto-generated table with labeled rows and values."

    model_json["units"] = units
    model_json["annotations"] = annotations
    return model_json


def main():
    """
    Ion Works entrypoint.
    - Reads input fields from Ion Works params: prompt, domain_prompt, anchor_hints, model
    - Generates a strict two-table model (Assumptions + pNl)
    - Emits artifacts back to Ion Works via works.resolve(...)
    - Streams progress/status via works.msg(...)
    """
    import json
    import sys
    import traceback

    if not _HAS_ION:
        print("❌ Ion Works not available. Run via CLI or ensure `ion` is installed.", file=sys.stderr)
        sys.exit(2)

    try:
        # ---- Inputs (with sensible defaults) ----
        user_prompt   = works.param(1)
        domain_prompt = ""
        anchor_hints  = ""
        model_name    = "gpt-4o-mini"

        works.msg("🚀 Starting two-stage generation (Ion Works)...")
        works.msg(f"model={model_name}")

        # ---- Run the generation pipeline ----
        result_json = run_two_stage(
            prompt=user_prompt,
            domain_prompt=domain_prompt or user_prompt,
            anchor_hints=anchor_hints,
            model=model_name,
        )

        # ---- Lightweight diagnostics & normalization preview ----
        diag = _diagnose_model_payload(result_json)
        works.msg("diagnostics")

        # Optional: ensure units/annotations completeness for downstream post-processing
        result_json = ensure_units_and_annotations(result_json)

        # ---- Emit results to Ion Works ----
        works.resolve({
            "status": "✅ Two-table model generated",
            "model_output": result_json,          # full JSON (tables, formulas, annotations, units)
            "diagnostics": diag,                  # human-readable validation summary
            "assumptions_only": {                 # convenience view for post-processing
                k: v for k, v in result_json.get("tables", {}).items()
                if k.startswith("Assumptions[")
            },
            "pnl_formulas_only": {
                k: v for k, v in result_json.get("formulas", {}).items()
                if k.startswith("pNl[")
            },
        })

        works.msg("✅ Generation complete. Artifacts written to Ion Works.")
    except Exception as e:
        err = f"❌ Generation failed: {e}"
        # Surface a structured failure artifact so downstream steps can branch
        works.resolve({
            "status": err,
            "error": str(e),
            "trace": traceback.format_exc(),
        })
        sys.exit(1)


if __name__ == "__main__":
    main()
