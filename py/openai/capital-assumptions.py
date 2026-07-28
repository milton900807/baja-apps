#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Super-Simplified Capital Assumptions Builder (Ion Works)

Behavior:
- Takes user prompt.
- Calls GPT once.
- Returns only a two-column 'Capital_Assumptions' table.
- No units logic, no advanced parsing, no helpers except essentials.
"""

from __future__ import annotations
import os, json, re
from typing import List, Dict, Any

from ion import works
from openai import OpenAI

# ---------------- GPT Call ----------------

SYS = "You are a strict financial modeling assistant. Only output valid JSON."

INSTRUCTIONS = """
Generate ONLY this JSON structure:

{
  "capital_assumptions": [
    {"label": "Initial_Capital_Investment", "value": 2000000}
  ]
}

Rules:
- 10–25 rows.
- label: short, machine-friendly, unique.
- value: number or string.
- No commentary.
- No text outside JSON.
"""

def gpt_call(model: str, temperature: float, user_prompt: str) -> dict:
    client = OpenAI()
    result = client.chat.completions.create(
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYS},
            {"role": "user", "content": INSTRUCTIONS + "\n\nUser prompt:\n" + user_prompt}
        ],
    )
    return json.loads(result.choices[0].message.content)

# ---------------- Table Builder ----------------

def build_two_col(table_name: str, rows: List[Dict[str, str]]) -> Dict[str, str]:
    out = {
        f"{table_name}[0:0][0:0]": "Label",
        f"{table_name}[1:1][0:0]": "Value",
    }
    r = 1
    for kv in rows:
        out[f"{table_name}[0:0][{r}:{r}]"] = kv["label"]
        out[f"{table_name}[1:1][{r}:{r}]"] = str(kv["value"])
        r += 1
    return out

# ---------------- Orchestrator ----------------

def run(user_prompt: str, model: str, temperature: float) -> Dict[str, Any]:
    works.msg("📡 Requesting capital assumptions from GPT…")

    data = gpt_call(model, temperature, user_prompt)
    rows = data.get("capital_assumptions", [])

    # sanitize labels
    cleaned = []
    seen = set()
    for item in rows:
        label = re.sub(r"\s+", "_", str(item.get("label", "")).strip())
        if label and label not in seen:
            cleaned.append({"label": label, "value": item.get("value")})
            seen.add(label)

    tables = build_two_col("Capital_Assumptions", cleaned)

    return {
        "tables": tables,
        "formulas": {},
        "annotations": {"Capital_Assumptions": "Auto-generated from GPT."},
        "units": {"Capital_Assumptions": {}},
        "diagnostics": "OK" if cleaned else "EMPTY"
    }

# ---------------- Ion Main ----------------

def _main():
    prompt = works.param(2)
    if not prompt:
        raise RuntimeError("Ion: param(1) required (prompt).")

    model = works.param(3) or "gpt-4o-mini"
    try:
        temperature = float(works.param(4) or 0.2)
    except:
        temperature = 0.2

    try:
        artifact = run(prompt, model, temperature)
        works.resolve(artifact)
    except Exception as e:
        works.resolve({"status": "ERROR", "error": str(e)})

if __name__ == "__main__":
    works.msg("🔧 simplified capital-assumptions builder loaded")
    _main()
