#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
"""
AssignLang-style model builder (NO FORMULAS) + optional prior-results merge.

Guarantees canonical 'inputs' and 'outputs' tables exist:
  • Explicitly required in the scaffold (prefer exact names).
  • Post-processing renames assumptions/outcomes/results/summary → inputs/outputs.
  • Seeds at least one labeled row in each table so they are present and usable.

Outputs JSON with top-level keys: tables, formulas (always {}), annotations, units.
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
from openai import OpenAI

# ---------- DEFAULT GRAMMAR (placeholder, unused) ----------
GRAMMAR = r""""""

# ---------- System prompt helper ----------
SYS_JSON_ONLY = (
    "Return ONLY a JSON object matching the provided schema. "
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

def _json_dumps_compact(obj: Any, max_len: int = 6000) -> str:
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    if len(s) <= max_len:
        return s
    return s[: max_len - 100] + "...(truncated)..."

# ---------- Chat helper ----------
def _chat_call(*, model: str, system: str, user: str, temperature: float = 0.3, json_mode: bool = False) -> str:
    client = OpenAI()
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
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""

# ---------- No-formulas scaffold ----------
def build_system_scaffold_no_formulas() -> str:
    return (
        "You are generating a structured model as JSON only.\n\n"
        "OUTPUT CONTRACT (MANDATORY)\n"
        "- Return ONLY a JSON object with exactly four top-level keys: \"tables\", \"formulas\", \"annotations\", \"units\".\n"
        "- Keys in tables are single-cell addresses: <table>[i:i][j:j].\n"
        "- All table names use underscores; no spaces; no dot notation.\n"
        "- All tables are two columns: [0:0][0:0]=\"Label\", [1:1][0:0]=\"Value\".\n"
        "- Provide CANONICAL tables named exactly: inputs, outputs. You may include more tables, but these two must exist.\n"
        "- EVERY labeled row must have a constant string in tables at <table>[1:1][y:y].\n"
        "- The \"formulas\" object MUST BE an empty JSON object {}. Absolutely NO formulas.\n\n"
        "SIZE TARGETS\n"
        "- Prefer 1–3 distinct tables; ensure >= 50 total labeled rows across tables (excluding headers).\n"
        "- If constrained, prioritize more labeled rows over more tables.\n\n"
        "UNITS & ANNOTATIONS\n"
        "- Provide one-sentence annotations per table.\n"
        "- Provide units for ALL labels using simple units like USD, count, ratio, months, unitless.\n\n"
        "SELF-CHECK\n"
        "1) Headers present for all tables.\n"
        "2) \"formulas\" is {}.\n"
        "3) Every label has a constant and a unit.\n"
        "4) Default values must be added.\n"
        "5) NO table cell is empty!\n"
    )

# ---------- Stage 1: Prompt expansion ----------
def expand_user_prompt(prompt: str, *, model: str = "gpt-4o-mini") -> str:
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")
    sys_msg = (
        "Rewrite the brief modeling prompt into one concise paragraph describing "
        "assumptions, KPIs, inputs and outputs (plain English, no lists/JSON/code). "
        "Explicitly mention the inputs and outputs that will be represented as constants."
    )
    user_msg = (
        "Expand this into a clear, concrete narrative that lists the kinds of inputs "
        "and outputs we will include as constants (no formulas in the final model).\n\n"
        f"PROMPT: {prompt}"
    )
    content = _chat_call(model=model, system=sys_msg, user=user_msg, temperature=0.6, json_mode=False)
    return (content or "").strip()

# ---------- Stage 2: JSON build (tables only; formulas forced empty) ----------
def build_json_no_formulas(expanded_prompt: str, *, model: str = "gpt-4o-mini") -> Dict[str, Any]:
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")
    system = SYS_JSON_ONLY + "\n\n" + build_system_scaffold_no_formulas()
    user = expanded_prompt
    content = _chat_call(model=model, system=system, user=user, temperature=0.2, json_mode=True)
    try:
        out = json.loads(content)
    except Exception:
        out = json.loads(_extract_json_snippet(content))
    # Hard guard: formulas must be empty
    out["formulas"] = {}
    # Ensure required keys exist
    for k in ("tables", "annotations", "units"):
        out.setdefault(k, {})
    return out

# ---------- Basic hygiene helpers (headers/units) ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _parse_cell_key(k: str) -> Optional[Tuple[str, int, int]]:
    m = _KEY_RE.match(k or "")
    if not m:
        return None
    t, i, j = m.group(1), int(m.group(2)), int(m.group(3))
    return (t, i, j)

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _collect_table_names(tables: Dict[str, Any]) -> List[str]:
    names: Set[str] = set()
    for k in tables.keys():
        p = _parse_cell_key(k)
        if p:
            names.add(p[0])
    return sorted(names)

def _ensure_headers(tables: Dict[str, Any], t: str) -> None:
    tables.setdefault(_key(t, 0, 0), "Label")
    tables.setdefault(_key(t, 1, 0), "Value")

def _max_row_index(tables: Dict[str, Any], t: str) -> int:
    m = 0
    for k in tables.keys():
        p = _parse_cell_key(k)
        if p and p[0] == t:
            m = max(m, p[2])
    return m

def _add_const_row(tables: Dict[str, Any], t: str, label: str, value: str) -> None:
    _ensure_headers(tables, t)
    j = max(1, _max_row_index(tables, t) + 1)
    tables[_key(t, 0, j)] = label
    tables[_key(t, 1, j)] = value

def _table_labels(tables: Dict[str, Any], t: str, limit: int = 2) -> List[str]:
    labs: List[Tuple[int, str]] = []
    for k, v in (tables or {}).items():
        p = _parse_cell_key(k)
        if not p:
            continue
        tn, i, j = p
        if tn == t and i == 0 and j >= 1 and isinstance(v, str):
            labs.append((j, v))
    labs.sort()
    return [lab for (_j, lab) in labs[:limit]]

def _rename_table_keys(data: dict, old: str, new: str) -> dict:
    if old == new:
        return data
    out = dict(data or {})
    tables = dict(out.get("tables") or {})
    formulas = dict(out.get("formulas") or {})
    annotations = dict(out.get("annotations") or {})
    units = dict(out.get("units") or {})

    def _swap_key(k: str) -> str:
        p = _parse_cell_key(k)
        if not p:
            return k
        t, i, j = p
        if t != old:
            return k
        return _key(new, i, j)

    tables = {_swap_key(k): v for k, v in tables.items()}
    formulas = {_swap_key(k): v for k, v in formulas.items()}
    if old in annotations and new not in annotations:
        annotations[new] = annotations.pop(old)
    if old in units and new not in units:
        units[new] = units.pop(old)

    # textual refs shouldn't exist in no-formulas flow, but keep safe noop
    out["tables"] = tables
    out["formulas"] = {}  # enforce empty
    out["annotations"] = annotations
    out["units"] = units
    return out

def enforce_column_headers(final_json: dict) -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    table_names: Set[str] = set()
    for d in (tables, formulas):
        for k in d.keys():
            p = _parse_cell_key(k)
            if p:
                table_names.add(p[0])

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
    data["formulas"] = {}  # enforce empty
    return data

def enforce_units(final_json: dict, default_unit: str = "unitless") -> dict:
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    units = dict(data.get("units") or {})

    labels_by_table: Dict[str, Set[str]] = {}
    for k, v in tables.items():
        p = _parse_cell_key(k)
        if not p:
            continue
        t, i, j = p
        if i == 0 and j >= 1 and isinstance(v, str):
            labels_by_table.setdefault(t, set()).add(v)

    for t in labels_by_table:
        units.setdefault(t, {})
        for lab in labels_by_table[t]:
            units[t].setdefault(lab, default_unit)

    data["units"] = units
    data["formulas"] = {}  # enforce empty
    return data

# ---------- Canonical inputs/outputs enforcement ----------
def ensure_inputs_outputs_present(final_json: dict) -> dict:
    """
    Guarantee canonical 'inputs' and 'outputs' tables exist with headers
    and at least one label row. Rename common synonyms to canonical names.
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    annotations = dict(data.get("annotations") or {})
    units = dict(data.get("units") or {})

    present = set(_collect_table_names(tables))

    # Rename common synonyms → canonical
    if "inputs" not in present:
        for cand in ("assumptions", "input", "assumption"):
            if cand in present:
                data = _rename_table_keys(data, cand, "inputs")
                tables = data["tables"]; annotations = data.get("annotations", {}); units = data.get("units", {})
                present = set(_collect_table_names(tables))
                break

    if "outputs" not in present:
        for cand in ("outcomes", "results", "summary", "output"):
            if cand in present:
                data = _rename_table_keys(data, cand, "outputs")
                tables = data["tables"]; annotations = data.get("annotations", {}); units = data.get("units", {})
                present = set(_collect_table_names(tables))
                break

    # Create tables if still missing
    for t in ("inputs", "outputs"):
        _ensure_headers(tables, t)
        if not _table_labels(tables, t, 1):
            if t == "inputs":
                _add_const_row(tables, t, "Base_Input", "1")
            else:
                _add_const_row(tables, t, "Primary_Output", "0")
        annotations.setdefault(t, f"Canonical {t} table.")
        units.setdefault(t, {})
        # seed unit for the seeded labels
        for lab in _table_labels(tables, t, 4):
            units[t].setdefault(lab, "unitless")

    data["tables"] = tables
    data["annotations"] = annotations
    data["units"] = units
    data["formulas"] = {}  # enforce empty
    return data

# ---------- Runner ----------
def run_no_formulas(user_prompt: str, *, model: str = "gpt-4o-mini", previous_results: Optional[dict] = None, outdir: Optional[str] = None) -> Dict[str, Any]:
    if outdir:
        os.makedirs(outdir, exist_ok=True)

    if _HAS_ION:
        works.msg("Expanding prompt...")
    expanded = expand_user_prompt(user_prompt, model=model)

    if _HAS_ION:
        works.msg("Building JSON (no formulas)...")
    built = build_json_no_formulas(expanded, model=model)

    # Optional non-destructive merge with prior
    if previous_results:
        merged = dict(built)
        for top in ("tables", "annotations", "units"):
            new_map = dict(merged.get(top) or {})
            old_map = dict(previous_results.get(top) or {})
            for k, v in old_map.items():
                if k not in new_map:
                    new_map[k] = v
            merged[top] = new_map
        merged["formulas"] = {}
    else:
        merged = built

    # >>> Canonical inputs/outputs guarantee <<<
    merged = ensure_inputs_outputs_present(merged)

    # Hygiene
    cleaned = enforce_column_headers(merged)
    cleaned = enforce_units(cleaned, default_unit="unitless")

    bundle = {
        "expanded_prompt": expanded,
        "final": cleaned,
    }

    if outdir:
        with open(os.path.join(outdir, "expanded_prompt.txt"), "w", encoding="utf-8") as f:
            f.write(expanded)
        with open(os.path.join(outdir, "final.json"), "w", encoding="utf-8") as f:
            json.dump(cleaned, f, ensure_ascii=False, indent=2)

    return bundle

# ---------- CLI ----------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AssignLang-style builder without formulas (ensures 'inputs' and 'outputs').")
    p.add_argument("prompt", help="Natural language description.")
    p.add_argument("--model", default="gpt-4o-mini", help="Model ID (default: gpt-4o-mini)")
    p.add_argument("--out", dest="out_path", help="Path to write ONLY the final JSON output (default: stdout)")
    p.add_argument("--outdir", help="Directory to dump expanded prompt and final bundle")
    p.add_argument("--prev", dest="prev_input", help="Path to previous results JSON OR inline JSON text", default=None)
    return p

def _load_json_from_path_or_text(s: Optional[str]) -> Optional[dict]:
    if not s:
        return None
    s = str(s).strip()
    if not s:
        return None
    if s.startswith("{") or s.startswith("["):
        return json.loads(s)
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

# ---------- Ion entry ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (prompt).") from e

    try:
        prev_param = works.param(2)
    except Exception:
        prev_param = None

    try:
        mdl = works.param(3) or default_model
    except Exception:
        mdl = default_model

    try:
        temp_raw = works.param(4)
        _ = float(temp_raw) if temp_raw is not None else None  # not used; compatibility only
    except Exception:
        pass

    prior = None
    if prev_param:
        try:
            prior = _load_json_from_path_or_text(prev_param)
        except Exception:
            prior = None

    try:
        bundle = run_no_formulas(user_prompt=str(user_prompt), model=mdl, previous_results=prior, outdir=None)
        final_json = bundle.get("final", {}) or {}
        works.resolve(final_json)
        return 0
    except Exception as e:
        raise RuntimeError(f"Ion pipeline failed: {e}") from e

if __name__ == "__main__":
    if _HAS_ION:
        works.msg("loading model (no formulas, canonical inputs/outputs)...")
        _main_ion("gpt-4o-mini")
    else:
        parser = build_arg_parser()
        args = parser.parse_args()
        prior = _load_json_from_path_or_text(args.prev_input)
        bundle = run_no_formulas(user_prompt=args.prompt, model=args.model, previous_results=prior, outdir=args.outdir)
        final_json = bundle.get("final", {}) or {}
        text = json.dumps(final_json, ensure_ascii=False, indent=2)
        if args.out_path:
            with open(args.out_path, "w", encoding="utf-8") as f:
                f.write(text)
        else:
            print(text)
