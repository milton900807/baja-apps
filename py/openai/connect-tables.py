#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
gpt_formula_connector.py

- Reads a workbook-like JSON structure with "tables", "formulas", "annotations", "units".
- Calls ChatGPT (via _chat_call) to PROPOSE formula connections between tables, returning JSON.
- Validates the proposed formulas locally:
    * reference existence (table + field/row:col)
    * allowed functions/operators
    * parenthesis/bracket balance
    * dependency DAG (no cycles)
    * optional arithmetic-only evaluation sanity check
- On success, merges/updates `workbook["formulas"]` and (optionally) writes it back.

NOTE: This validator focuses on structural connection validity plus basic arithmetic evaluation.
      Spreadsheet-style functions are whitelisted but not executed (except a few trivial ones).
"""

import json
import re
import math
from collections import defaultdict, deque
from datetime import datetime, date

# ------------------------------------------------------------
# You said you already have this helper. Import or paste it here.
# ------------------------------------------------------------
# from your_module import _chat_call

# --- If you want to keep everything in one file, uncomment and use this stub: ---
# from openai import OpenAI
# def _chat_call(*, model: str, system: str, user: str, temperature: float = 0.51, json_mode: bool = False) -> str:
#     client = OpenAI()
#     kwargs = dict(
#         model=model,
#         messages=[
#             {"role": "system", "content": system},
#             {"role": "user", "content": user},
#         ],
#         temperature=temperature,
#     )
#     if json_mode:
#         kwargs["response_format"] = {"type": "json_object"}
#     resp = client.chat.completions.create(**kwargs)
#     return resp.choices[0].message.content or ""


# ------------------------------------------------------------
# Parsing helpers
# ------------------------------------------------------------

ROW_COL_RE = re.compile(r"^\s*(\d+)\s*:\s*(\d+)\s*$")

# tableRef pattern captures tokens like:  table_name[Field With Spaces]  or  table_name[1:4]
# and also tolerates extra trailing [shape] segments like table_name[Field][1:1]
TABLE_TOKEN_RE = re.compile(r"""
    (?P<table>[A-Za-z_]\w*)               # table name
    \s*
    \[
        (?P<field>[^\]]+)
    \]
    (?:\s*\[[^\]]+\])*                    # optional trailing bracketed segments (ignored)
""", re.VERBOSE)

ALLOWED_OPERATORS = set(list("+-*/^=,<>()"))
# We allow comma inside function calls; equals and comparisons mainly for IF-like parsing acceptance.

ALLOWED_FUNCTIONS = {
    # Common spreadsheet-like names that may appear in your examples
    "IF", "IFERROR", "AND", "OR", "XOR",
    "ROUND", "ROUNDUP", "ABS", "POWER", "LOG", "LOG10", "EXP",
    "MAX", "MIN", "SUM", "AVERAGE", "MEDIAN",
    "STDEV.S", "STDEV.P", "VAR.S", "VAR.P", "MODE.SNGL",
    "TEXT", "UPPER", "PROPER", "LEFT",
    "TODAY", "NOW", "EOMONTH", "EDATE", "DATEDIF", "NETWORKDAYS",
    "SUMIF", "SUMPRODUCT", "COUNTIFS", "AVERAGEIF", "AVERAGEIFS",
    "RANK.EQ", "UNIQUE",
    # Placeholders for advanced ones (accepted but not executed here)
    "Z.TEST", "T.TEST", "COVARIANCE.S", "NORM.S.DIST", "NORM.DIST",
    "CORREL", "SLOPE", "INTERCEPT", "RSQ", "LINEST", "PERCENTILE.INC",
    "FORECAST.LINEAR", "INDEX", "MATCH", "SUBTOTAL", "EOMONTH",
    "COUNTIF", "SUMIFS", "RANK", "TRIMMEAN", "GEOMEAN", "MODE", "MODE.SNGL",
    "IFS",
}

# Normalize dotted names you accept to a canonical variant for function presence checks
CANON_FUN_RENAMES = {
    "STDEV.S": "STDEV.S",  # keep
    "STDEV.P": "STDEV.P",
    "VAR.S": "VAR.S",
    "VAR.P": "VAR.P",
    "MODE.SNGL": "MODE.SNGL",
    "RANK.EQ": "RANK.EQ",
    "PERCENTILE.INC": "PERCENTILE.INC",
    "COVARIANCE.S": "COVARIANCE.S",
    "NORM.S.DIST": "NORM.S.DIST",
    "NORM.DIST": "NORM.DIST",
}

# Plain names (used by user too)
PLAIN_FUN_NAMES = {fn.split(".")[0] for fn in ALLOWED_FUNCTIONS}


def extract_function_calls(expr: str):
    """
    Very light function call finder: finds NAME( ... ).
    Returns a set of function identifiers found (raw).
    """
    found = set()
    for m in re.finditer(r"([A-Za-z_][A-Za-z0-9_\.]*)\s*\(", expr):
        found.add(m.group(1))
    return found


def balance_check(expr: str) -> bool:
    """
    Parentheses and bracket balance check.
    """
    stack = []
    pairs = {")": "(", "]": "["}
    for ch in expr:
        if ch in "([": stack.append(ch)
        elif ch in ")]":
            if not stack or stack[-1] != pairs[ch]:
                return False
            stack.pop()
    return len(stack) == 0


# ------------------------------------------------------------
# Workbook utilities
# ------------------------------------------------------------

def load_workbook(json_path_or_dict):
    if isinstance(json_path_or_dict, str):
        with open(json_path_or_dict, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json_path_or_dict
    data.setdefault("tables", {})
    data.setdefault("formulas", {})
    data.setdefault("annotations", {})
    data.setdefault("units", {})
    return data


def build_label_index(workbook):
    """
    Returns:
      labels_by_table: {table: set(labels)}
      max_row_by_table: {table: max_row_int or 0}
    """
    labels_by_table = {}
    max_row_by_table = {}
    for tname, tmap in workbook["tables"].items():
        labels = set()
        max_row = 0
        for k, v in tmap.items():
            if k.startswith("0:"):
                try:
                    r = int(k.split(":")[1])
                    max_row = max(max_row, r)
                except Exception:
                    pass
                labels.add(str(v))
        labels_by_table[tname] = labels
        max_row_by_table[tname] = max_row
    return labels_by_table, max_row_by_table


def resolve_ref_exists(workbook, table, field):
    """
    Returns True if the reference points to a valid (table, label) OR (table, r:c with c==1 present).
    NOTE: We consider value column to be c==1; labels live in col 0.
    """
    tables = workbook["tables"]
    if table not in tables:
        return False

    # row:col?
    m = ROW_COL_RE.match(field)
    if m:
        r = int(m.group(1))
        c = int(m.group(2))
        if c != 1:
            return False
        return f"1:{r}" in tables[table]  # value cell exists
    else:
        # label lookup
        labels, _ = build_label_index(workbook)
        return field in labels.get(table, set())


def extract_dependencies(expr: str):
    """
    Returns a list of (table, field) references found in expr.
    """
    deps = []
    for m in TABLE_TOKEN_RE.finditer(expr):
        table = m.group("table")
        field = m.group("field").strip()
        deps.append((table, field))
    return deps


def check_allowed_functions(expr: str):
    """
    Ensure all function-like tokens are in our allowed list.
    """
    calls = extract_function_calls(expr)
    bad = []
    for fn in calls:
        # Accept either dotted or plain name if whitelisted
        if (fn in ALLOWED_FUNCTIONS) or (fn.split(".")[0] in PLAIN_FUN_NAMES):
            continue
        bad.append(fn)
    return bad  # list of invalid names


# ------------------------------------------------------------
# Dependency graph + cycle check
# ------------------------------------------------------------

def build_dependency_graph(formulas: dict):
    """
    Nodes are target refs (keys of formulas). Edges target -> dep_target if a formula's RHS references
    another target exactly by its token (e.g., `outputs[1:1]` appearing inside another formula).
    We *also* capture external references (table field reads) but they won't be nodes if not formula targets.
    """
    graph = defaultdict(set)
    reverse_index = set(formulas.keys())

    # RegEx to catch target-shape ref usage inside other formulas
    TARGET_TOKEN_RE = re.compile(r"([A-Za-z_]\w*\[[^\]]+\](?:\s*\[[^\]]+\])*)")

    for target, expr in formulas.items():
        for m in TARGET_TOKEN_RE.finditer(expr):
            token = m.group(1)
            # If token itself is a known target key, add an edge
            if token in reverse_index:
                graph[target].add(token)
    return graph


def has_cycle(graph: dict) -> bool:
    """
    Simple cycle detection via Kahn's algorithm.
    """
    # Compute indegree
    indeg = defaultdict(int)
    for u in graph:
        indeg.setdefault(u, 0)
        for v in graph[u]:
            indeg[v] += 1

    q = deque([n for n, d in indeg.items() if d == 0])
    visited = 0
    while q:
        u = q.popleft()
        visited += 1
        for v in graph.get(u, []):
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)

    return visited != len(indeg)


# ------------------------------------------------------------
# Lightweight arithmetic evaluator (optional)
# ------------------------------------------------------------

def parse_numeric_value(cell_str):
    """
    Parse something like '500000 USD' -> (500000.0, 'USD') or plain numbers/strings.
    """
    if cell_str is None:
        return None, None
    if isinstance(cell_str, (int, float)):
        return float(cell_str), None
    if not isinstance(cell_str, str):
        # keep as raw
        return cell_str, None
    s = cell_str.strip()
    m = re.match(r"^([-+]?\d+(?:\.\d+)?)(?:\s+([A-Za-z%/_\-\.]+))?$", s)
    if m:
        val = float(m.group(1))
        unit = m.group(2)
        return val, unit
    return s, None


def safe_eval_arithmetic(expr: str):
    """
    Very limited eval for arithmetic-only expressions with numbers, + - * / ^, and parentheses.
    Returns float if evaluable, raises ValueError otherwise.
    """
    # Replace caret with ** for Python
    py = expr.replace("^", "**")
    # allow digits, dots, signs, parentheses, arithmetic ops, and whitespace
    if not re.fullmatch(r"[\d\.\+\-\*/\^\(\)\s]+", expr):
        raise ValueError("Expression contains non-arithmetic tokens")
    return eval(py, {"__builtins__": {}}, {})


def attempt_numeric_substitution_and_eval(workbook, expr: str):
    """
    Substitute table references with numeric literals IF those references are numeric.
    If any substitution yields non-numeric string or a unit conflict, we abort arithmetic eval.
    """
    def replacer(m):
        t = m.group(0)
        table = m.group("table")
        field = m.group("field").strip()

        # fetch
        if table not in workbook["tables"]:
            raise ValueError(f"Unknown table {table}")
        tbl = workbook["tables"][table]

        # resolve r:c vs label
        m2 = ROW_COL_RE.match(field)
        if m2:
            r = int(m2.group(1))
            c = int(m2.group(2))
            if c != 1:
                raise ValueError(f"Only value column c=1 is supported in {t}")
            raw_val = tbl.get(f"1:{r}")
        else:
            # find row by label
            row_for_label = None
            for k, v in tbl.items():
                if k.startswith("0:") and str(v) == field:
                    row_for_label = int(k.split(":")[1])
                    break
            if row_for_label is None:
                raise ValueError(f"Label {field!r} not found in {table}")
            raw_val = tbl.get(f"1:{row_for_label}")

        val, unit = parse_numeric_value(raw_val)
        if isinstance(val, (int, float)) and unit is None:
            return str(val)
        # If unitful or string, make evaluation skip by throwing
        raise ValueError("Non-unitless numeric or non-numeric encountered")

    arith_expr = TABLE_TOKEN_RE.sub(replacer, expr)
    # check pure arithmetic
    return safe_eval_arithmetic(arith_expr)


# ------------------------------------------------------------
# Prompting ChatGPT to propose formulas
# ------------------------------------------------------------

def propose_formulas_via_gpt(workbook: dict, model: str = "gpt-4.1"):
    """
    Sends a structured prompt to ChatGPT to propose formula connections.
    Returns a dict: { "formulas": { target_ref: expr, ... }, "notes": "...optional..." }
    """
    # Describe the schema succinctly (labels per table + sample values)
    labels_by_table, _ = build_label_index(workbook)

    schema_lines = []
    for t, tmap in workbook["tables"].items():
        labels = sorted(labels_by_table.get(t, []))
        # sample first few value rows
        sample_vals = []
        for k, v in tmap.items():
            if k.startswith("1:"):
                row = int(k.split(":")[1])
                # get label
                lbl = tmap.get(f"0:{row}", f"Row {row}")
                sample_vals.append((row, lbl, str(v)))
        sample_vals = sorted(sample_vals)[:6]
        schema_lines.append(f"- {t}: fields={labels[:8]}{'...' if len(labels)>8 else ''}; samples={sample_vals}")

    system = (
        "You are a formula architect. You connect tables by proposing spreadsheet-like formulas. "
        "Use references like table_name[Label] or table_name[r:c]. Ignore any extra [shape] segments. "
        "Output STRICT JSON with a top-level object containing a key 'formulas' mapping target refs to expressions. "
        "Do not include explanations."
    )

    # You can guide targets you want. Here we nudge a few reasonable targets for the provided example.
    # You can customize this list or leave it open-ended and let the model decide.
    goals = [
        # Sample guidance that mirrors the user's example intentions:
        # totals, roll-ups, sanity outputs joining the given tables
        'outputs[1:1][1:1]  # Total Startup Costs (from startup_costs[Total Startup Costs])',
        'outputs[2:1][1:1]  # Total Revenue (3 Years) (from annual_service_revenue[Total Revenue (3 Years)])',
        'outputs[3:1][1:1]  # Total Cash Flow (3 Years) (from cash_flow_projection[Total Cash Flow (3 Years)])',
        'outputs[4:1][1:1]  # Total FTEs (from fte_table[Total FTEs])',
        'outputs[5:1][1:1]  # Net (Revenue - Startup Costs)',
    ]

    user = (
        "You are given a small workbook (tables with label-value rows). "
        "Propose a handful of useful formula connections that link these tables together. "
        "Use only fields that exist. Prefer label references when available. "
        "Make 4-10 outputs under an 'outputs' table with addresses like outputs[1:1][1:1], outputs[2:1][1:1], etc. "
        "Return ONLY JSON.\n\n"
        "Workbook schema:\n" + "\n".join(schema_lines) + "\n\n"
        "Targets you MAY define (optional hints):\n- " + "\n- ".join(goals) + "\n"
    )

    raw = _chat_call(model=model, system=system, user=user, json_mode=True)
    try:
        parsed = json.loads(raw)
    except Exception:
        # If the model didn't return valid JSON, wrap it
        parsed = {"formulas": {}, "raw": raw}
    if "formulas" not in parsed or not isinstance(parsed["formulas"], dict):
        parsed["formulas"] = {}
    return parsed


# ------------------------------------------------------------
# Validation pipeline
# ------------------------------------------------------------

def validate_formulas(workbook: dict, formulas: dict):
    """
    Validate:
      * syntax balance
      * allowed functions
      * reference existence
      * cycle-free dependency graph
      * optional arithmetic eval for pure arithmetic cases
    Returns (ok, report_str, details_dict)
    """
    report = []
    ok = True

    # 1) balance + function allow-list + reference existence
    for target, expr in formulas.items():
        # balance
        if not balance_check(expr):
            ok = False
            report.append(f"[ERROR] Unbalanced parentheses/brackets in {target}: {expr}")

        # function check
        bad_fns = check_allowed_functions(expr)
        if bad_fns:
            ok = False
            report.append(f"[ERROR] Unknown function(s) in {target}: {bad_fns}")

        # reference existence
        deps = extract_dependencies(expr)
        for (t, fld) in deps:
            if not resolve_ref_exists(workbook, t, fld):
                ok = False
                report.append(f"[ERROR] Bad reference in {target}: {t}[{fld}]")

    # 2) dependency DAG (only between targets)
    dep_graph = build_dependency_graph(formulas)
    if has_cycle(dep_graph):
        ok = False
        report.append("[ERROR] Detected a dependency cycle among targets.")

    # 3) optional arithmetic-only quick eval
    for target, expr in formulas.items():
        try:
            # If expression can be reduced to pure arithmetic (unitless cell values), this succeeds
            attempt_numeric_substitution_and_eval(workbook, expr)
        except Exception as e:
            # Not fatal: it may be non-arithmetic (uses functions or units/strings)
            report.append(f"[WARN] Skipped arithmetic eval for {target}: {e}")

    details = {"graph": {k: list(v) for k, v in dep_graph.items()}}
    return ok, "\n".join(report) if report else "All checks passed.", details


# ------------------------------------------------------------
# Integration convenience: run proposal + validation + merge
# ------------------------------------------------------------

def connect_with_gpt_and_validate(workbook_json_or_path, *, model="gpt-4.1", merge_into_workbook=True):
    """
    1) Load workbook
    2) Ask GPT to propose formulas
    3) Validate them locally
    4) Optionally merge into workbook["formulas"] and return (workbook, formulas, report)
    """
    wb = load_workbook(workbook_json_or_path)

    proposal = propose_formulas_via_gpt(wb, model=model)
    proposed_formulas = proposal.get("formulas", {})
    ok, report, details = validate_formulas(wb, proposed_formulas)

    if merge_into_workbook and ok:
        wb["formulas"].update(proposed_formulas)

    return wb, proposed_formulas, ok, report, details


# ------------------------------------------------------------
# Example CLI usage
# ------------------------------------------------------------

if __name__ == "__main__":
    import argparse, sys

    parser = argparse.ArgumentParser(description="Connect tables using ChatGPT and validate formulas.")
    parser.add_argument("--in", dest="in_path", required=True, help="Path to input JSON workbook")
    parser.add_argument("--out", dest="out_path", help="Write merged workbook (with formulas) to this path")
    parser.add_argument("--model", default="gpt-4.1", help="OpenAI model name")
    parser.add_argument("--no-merge", action="store_true", help="Do not merge proposed formulas into workbook")
    args = parser.parse_args()

    wb, formulas, ok, report, details = connect_with_gpt_and_validate(
        args.in_path, model=args.model, merge_into_workbook=(not args.no_merge)
    )

    print("=== Proposed formulas ===")
    print(json.dumps(formulas, indent=2))
    print("\n=== Validation report ===")
    print(report)
    if details.get("graph"):
        print("\n=== Dependency graph (edges) ===")
        for k, vs in details["graph"].items():
            print(f"{k} -> {vs}")

    if args.out_path:
        with open(args.out_path, "w", encoding="utf-8") as f:
            json.dump(wb, f, indent=2)
        print(f"\nWrote merged workbook to: {args.out_path}")
