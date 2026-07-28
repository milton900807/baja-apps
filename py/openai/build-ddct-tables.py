#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Natural-language → modeling tables (with formulas)

What it does
------------
• Reads a paragraph describing a desired calculation.
• If it detects qPCR ΔΔCt intent, it emits a deterministic ΔΔCt workbook with the correct layout & formulas.
• Otherwise, it uses GPT to propose a structured table + formulas.

Ion params
----------
param(1): user prompt (str)
param(2): model (optional; default "gpt-4o-mini")
param(3): temperature (optional; default 0.2)

Return shape
------------
{
  "tables": { "<Key>": "<CellValue>", ... },
  "formulas": { "<CellKey>": "<expression using other <CellKey>s>" },
  "annotations": { "<TableName>": "...", ... },
  "units": { "<TableName>": { "<ColumnHeader>": "unit", ... } },
  "diagnostics": "..."
}

Notes
-----
• Cell keys are "Table[i:i][j:j]" (0-indexed), e.g., "Samples[2:2][3:3]".
• Formulas reference other cells by their keys (string expressions).
• No external libs required for ΔΔCt; LLM only used for non-ΔΔCt requests.
"""

import os
import json
import re
from typing import Dict, List, Tuple, Optional, Any

# ---- Ion Works ----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ---- OpenAI client (only used in fallback mode) ----
def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.2,
    json_mode: bool = True,
    max_tokens: int = 1800
) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set (required for non-ΔΔCt fallback mode).")
    from openai import OpenAI
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

# ---------- helpers ----------
_KEY_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\[(\d+):\d+\]\[(\d+):\d+\]$')

def _key(table: str, i: int, j: int) -> str:
    return f"{table}[{i}:{i}][{j}:{j}]"

def _to_jsonable(obj):
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False))
    except Exception:
        return str(obj)

def _norm(s: str) -> str:
    return (s or "").strip().lower()

def _detect_ddct_intent(prompt: str) -> bool:
    s = _norm(prompt)
    return any(kw in s for kw in [
        "ddct", "∆∆ct", "ΔΔct", "delta delta ct",
        "qpcr", "q-pcr", "real-time pcr",
        "housekeeping", "reference gene", "endogenous control"
    ])

# ---------- ΔΔCt deterministic workbook ----------
def _ddct_workbook() -> Dict[str, Any]:
    """
    Build a standard ΔΔCt workbook with:
    - Config (reference base)
    - Samples (Ct replicates, averages, ΔCt, ΔΔCt, FoldChange)
    - Calibrator mapping (which sample is the baseline)
    NOTE: Users fill Ct replicate cells. Formulas compute aggregates.
    """

    tables: Dict[str, str] = {}
    formulas: Dict[str, str] = {}
    units: Dict[str, Dict[str, str]] = {}
    annotations: Dict[str, str] = {}

    # ---- Config table (general constants) ----
    # Row 0: headers
    tables[_key("Config", 0, 0)] = "Label"
    tables[_key("Config", 0, 1)] = "Value"
    # Row 1..: content
    # Base for fold change: 2 (FoldChange = Base^(-ΔΔCt))
    tables[_key("Config", 1, 0)] = "Base"
    tables[_key("Config", 1, 1)] = "2"
    # Which sample is the calibrator (by name)
    tables[_key("Config", 2, 0)] = "Calibrator_Sample"
    tables[_key("Config", 2, 1)] = "Control"  # users can change

    units["Config"] = {"Label": "unitless", "Value": "unitless"}
    annotations["Config"] = "Global constants for ΔΔCt; change Base or Calibrator_Sample as needed."

    # ---- Samples table ----
    # Columns:
    # 0: Sample
    # 1: Target_Ct_Rep1
    # 2: Target_Ct_Rep2
    # 3: Target_Ct_Rep3
    # 4: Ref_Ct_Rep1
    # 5: Ref_Ct_Rep2
    # 6: Ref_Ct_Rep3
    # 7: Mean_Target_Ct (formula)
    # 8: Mean_Ref_Ct    (formula)
    # 9: Delta_Ct       (formula)
    # 10: Calibrator_Delta_Ct (formula: looks up ΔCt of calibrator sample)
    # 11: DeltaDelta_Ct (formula = Delta_Ct - Calibrator_Delta_Ct)
    # 12: FoldChange    (formula = Base ^ (-DeltaDelta_Ct))

    headers = [
        "Sample",
        "Target_Ct_Rep1", "Target_Ct_Rep2", "Target_Ct_Rep3",
        "Ref_Ct_Rep1",    "Ref_Ct_Rep2",    "Ref_Ct_Rep3",
        "Mean_Target_Ct", "Mean_Ref_Ct",
        "Delta_Ct",
        "Calibrator_Delta_Ct",
        "DeltaDelta_Ct",
        "FoldChange"
    ]
    for j, h in enumerate(headers):
        tables[_key("Samples", 0, j)] = h

    # Seed two rows (users can add more):
    sample_names = ["Control", "Treatment"]
    for i, name in enumerate(sample_names, start=1):
        tables[_key("Samples", i, 0)] = name
        # Empty Ct replicate cells (users fill in numeric Ct values)
        for j in range(1, 7):
            tables[_key("Samples", i, j)] = ""  # user input

    # --- formulas per row (for any row >= 1) ---
    # Convenience keys per row i:
    def S(i, j): return _key("Samples", i, j)  # short alias

    # Mean_Target_Ct = AVERAGE(Target reps)
    # Mean_Ref_Ct    = AVERAGE(Ref reps)
    # Delta_Ct       = Mean_Target_Ct - Mean_Ref_Ct
    # Calibrator_Delta_Ct = ΔCt(row where Sample == Config.Calibrator_Sample)
    # DeltaDelta_Ct  = Delta_Ct - Calibrator_Delta_Ct
    # FoldChange     = Config.Base ^ (-DeltaDelta_Ct)

    # We express formulas using the same “cell key” strings.
    # We’ll also add a simple LOOKUP helper expression using a pseudo-syntax:
    #   LOOKUP_ROW("Samples", sample_name_key, col_index_of_sample_name)
    # returns the row index (integer) where Samples[row][0] == sample_name; then we index ΔCt of that row.

    # Put a helper table to expose these pseudo functions to your evaluator if needed,
    # or handle LOOKUP_ROW on your runtime.

    tables[_key("Helpers", 0, 0)] = "NOTE"
    tables[_key("Helpers", 1, 0)] = (
        "Formulas use pseudo-ops: AVERAGE(a,b,c), POW(a,b), LOOKUP_ROW(table,sample_key, sample_col_idx).\n"
        "Your evaluator should resolve these into values, then compute."
    )
    annotations["Helpers"] = "Runtime notes for formula evaluator (pseudo-ops)."

    # Insert row-agnostic formulas for existing rows (Control=1, Treatment=2)
    for i in range(1, len(sample_names) + 1):
        # Means
        formulas[S(i, 7)] = f"AVERAGE({S(i,1)},{S(i,2)},{S(i,3)})"
        formulas[S(i, 8)] = f"AVERAGE({S(i,4)},{S(i,5)},{S(i,6)})"
        # ΔCt
        formulas[S(i, 9)] = f"{S(i,7)} - {S(i,8)}"
        # Calibrator ΔCt via lookup
        # row_of_cal = LOOKUP_ROW('Samples', Config[2:2][1:1], 0)
        cal_name_key = _key("Config", 2, 1)
        # We produce a pseudo reference to the ΔCt at that looked-up row:
        formulas[S(i,10)] = f"{_key('Samples', 'LOOKUP_ROW(Samples,' + cal_name_key + ',0)', 9)}"
        # ΔΔCt
        formulas[S(i,11)] = f"{S(i,9)} - {S(i,10)}"
        # FoldChange = Base ^ ( - ΔΔCt )
        base_key = _key("Config", 1, 1)
        formulas[S(i,12)] = f"POW({base_key}, -1 * {S(i,11)})"

    # Units and annotations
    units["Samples"] = {
        "Sample": "unitless",
        "Target_Ct_Rep1": "Ct", "Target_Ct_Rep2": "Ct", "Target_Ct_Rep3": "Ct",
        "Ref_Ct_Rep1": "Ct", "Ref_Ct_Rep2": "Ct", "Ref_Ct_Rep3": "Ct",
        "Mean_Target_Ct": "Ct", "Mean_Ref_Ct": "Ct",
        "Delta_Ct": "Ct", "Calibrator_Delta_Ct": "Ct", "DeltaDelta_Ct": "Ct",
        "FoldChange": "fold"
    }
    annotations["Samples"] = (
        "Enter Ct replicates for Target and Reference (housekeeping) genes. "
        "Calibrator sample defaults to 'Control'. Formulas compute means, ΔCt, ΔΔCt, and fold change."
    )

    artifact = {
        "tables": tables,
        "formulas": formulas,
        "annotations": annotations,
        "units": units,
        "diagnostics": "OK_DDCT_TEMPLATE"
    }
    return artifact

# ---------- Fallback LLM: generic table + formulas ----------
LLM_SYSTEM = "You are a precise modeling assistant. You output only JSON in the requested schema."
LLM_USER_FMT = """
Create one or more tables with appropriate columns and rows for the user's requested calculation.
Include computed results via formula expressions that reference other cells **by their keys** in the form Table[i:i][j:j].

Return STRICT JSON with this exact structure:
{
  "tables": { "<Key>": "<CellValue>", ... },
  "formulas": { "<CellKey>": "<expression>" },
  "annotations": { "<TableName>": "..." },
  "units": { "<TableName>": { "<ColumnHeader>": "unit", ... } }
}

Rules:
- Use 0-indexed addressing. Cell keys must be like "Table[ROW:ROW][COL:COL]".
- Provide minimal but complete tables so a user can edit inputs and see outputs recompute.
- Prefer common pseudo-ops: SUM(), AVERAGE(), POW(), LOOKUP_ROW(), IF().
- Keep formulas readable and reference only cell keys or numeric constants.
- Do not add commentary outside the JSON.
User paragraph:
{paragraph}
""".strip()

def _llm_generic_workbook(paragraph: str, model: str, temperature: float) -> Dict[str, Any]:
    content = _chat_call(
        model=model,
        system=LLM_SYSTEM,
        user=LLM_USER_FMT.format(paragraph=paragraph),
        temperature=temperature,
        json_mode=True,
        max_tokens=2000
    )
    try:
        data = json.loads(content)
    except Exception:
        # Best-effort extraction (shouldn't happen in json_mode, but safe-guard)
        start = content.find("{"); end = content.rfind("}")
        data = json.loads(content[start:end+1])

    # Ensure required keys exist
    for k in ("tables", "formulas", "annotations", "units"):
        data.setdefault(k, {} if k != "tables" else {})
    data.setdefault("diagnostics", "LLM_GENERATED")
    return data

# ---------- Orchestrator ----------
def build_workbook_from_paragraph(paragraph: str, *, model: str, temperature: float) -> Dict[str, Any]:
    if _detect_ddct_intent(paragraph):
        works.msg("🧪 Detected ΔΔCt intent; building deterministic ΔΔCt workbook...")
        return _ddct_workbook()
    works.msg("🧠 No ΔΔCt intent detected; using LLM to draft tables + formulas...")
    return _llm_generic_workbook(paragraph, model=model, temperature=temperature)

# ---------- Ion entry ----------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    user_prompt = works.param(1)
    model = works.param(2) or default_model
    try:
        temperature = float(works.param(3) or 0.2)
    except Exception:
        temperature = 0.2

    if not user_prompt:
        raise RuntimeError("param(1) required: user prompt paragraph")

    works.msg("🧩 building model tables (with formulas) from natural language…")
    artifact = build_workbook_from_paragraph(str(user_prompt), model=str(model), temperature=temperature)
    works.resolve(_to_jsonable(artifact))
    return 0

if __name__ == "__main__":
    works.msg("🔧 starting natural-language → tables builder…")
    _main_ion()
