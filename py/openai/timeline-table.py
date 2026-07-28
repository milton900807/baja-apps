#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Operations Timeline Builder (Ion Works entry/exit)

What it does
------------
• Calls GPT to infer a step-by-step operations plan from a natural-language prompt.
• Returns ONLY a single two-column table named 'Ops_Timeline' with headers:
      Ops_Timeline[0:0][0:0] = "Operation"
      Ops_Timeline[1:1][0:0] = "Time"
      Ops_Timeline[0:0][r:r] = <operation>
      Ops_Timeline[1:1][r:r] = <time>
• No formulas; just a table (+ light annotations).
• Uses Ion Works for entry (begin), progress (msg), and exit (resolve).

Expected Ion params
-------------------
param(1) = user prompt (describe the goal / project / workflow)
param(2) = model (optional; default gpt-4o-mini)
param(3) = temperature (optional; default 0.2)
"""

import os
import json
import re
from typing import Dict, List, Optional, Any

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI client ----
from openai import OpenAI

# ---------- helpers ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

_DEF_TABLE_NAME = "Ops_Timeline"


def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)


def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
    json_mode: bool = False,
    max_tokens: int = 1600,
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


def _extract_json_snippet(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output.")
    return text[start:end+1].strip()

# ---------- LLM prompt for operations & times ----------
OPS_JSON_INSTRUCTIONS = r"""
You generate ONLY a two-column 'Ops_Timeline' table representing an operational plan: a list of steps and how long each step takes.
Your output must be STRICT JSON with this EXACT schema:
{
  "steps": [
    {"operation": "Define scope", "time": "2 days"},
    {"operation": "Set milestones", "time": "1 day"}
  ]
}

Rules:
- 'steps' is a list (5–25 items typical). Each item must have:
  - operation: short, imperative description (e.g., "Collect samples", "QC sequencing data").
  - time: a concise duration string (e.g., "2 h", "1 day", "3–5 days", "4 weeks").
- Be realistic and concrete given the user's prompt; break into sequential operations.
- Prefer consistent, human-readable units (h/hours, day(s), week(s)).
- Do NOT include any commentary, rationale, or extra fields. Valid JSON only.
"""


def generate_ops_timeline(user_prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2) -> List[Dict[str, str]]:
    system = (
        "You are a careful operations planning assistant. You STRICTLY follow output schemas and return valid JSON only."
    )
    user = f"{OPS_JSON_INSTRUCTIONS}\n\nUser prompt:\n{(user_prompt or '').strip()}"

    works.msg("🧮 requesting operations & times from GPT…")
    content = _chat_call(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
        max_tokens=2200,
    )

    try:
        data = json.loads(content)
    except Exception:
        data = json.loads(_extract_json_snippet(content))

    items = (data.get("steps") or [])
    out: List[Dict[str, str]] = []
    seen_ops = set()
    for it in items:
        op = str(it.get("operation", "")).strip()
        tm = str(it.get("time", "")).strip()
        if not op or not tm:
            continue
        # de-dup identical operation labels while preserving order
        if op in seen_ops:
            continue
        seen_ops.add(op)
        out.append({"operation": op, "time": tm})
    return out


# ---------- Build tables wire format ----------

def to_two_col_table(table_name: str, rows: List[Dict[str, str]]) -> Dict[str, str]:
    tables: Dict[str, str] = {
        _key(table_name, 0, 0): "Operation",
        _key(table_name, 1, 0): "Time",
    }
    r = 1
    for kv in rows:
        tables[_key(table_name, 0, r)] = kv["operation"]
        tables[_key(table_name, 1, r)] = kv["time"]
        r += 1
    return tables


def build_artifact(rows: List[Dict[str, str]], table_name: str = _DEF_TABLE_NAME) -> Dict[str, Any]:
    tables = to_two_col_table(table_name, rows)
    annotations = {
        table_name: "Operations and estimated durations inferred from user prompt via GPT (two-column table)."
    }
    # Units are textual durations; we keep a light note.
    units = {table_name: {"Time": "duration"}}
    return {
        "tables": tables,
        "formulas": {},
        "annotations": annotations,
        "units": units,
        "diagnostics": "NO_ISSUES_DETECTED" if rows else "EMPTY_STEPS_PAYLOAD",
    }


# ---------- Orchestrator ----------

def run_ops_timeline(user_prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2) -> Dict[str, Any]:
    works.msg("🧠 operations-timeline pipeline starting…")
    rows = generate_ops_timeline(user_prompt, model=model, temperature=temperature)
    if not rows:
        works.msg("⚠️ LLM returned no steps; emitting header-only table.")
    artifact = build_artifact(rows, _DEF_TABLE_NAME)
    return artifact


# ---------- Ion entry/exit ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    model = works.param(2) or default_model
    try:
        temperature = float(works.param(3) or 0.2)
    except Exception:
        temperature = 0.2

    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (prompt).") from e

    try:
        artifact = run_ops_timeline(user_prompt=str(user_prompt), model=str(model), temperature=temperature)
        works.resolve(_to_jsonable(artifact))
        return 0
    except Exception as err:
        works.resolve({
            "status": "❌ error",
            "error": str(err),
            "where": "operations-timeline",
        })
        raise


# bootstrap
if __name__ == "__main__":
    works.msg("🔧 loading operations timeline builder…")
    _main_ion("gpt-4o-mini")
