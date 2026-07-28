#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion-only: Suggest formulas for a target label using provided tables.

Params (Ion works):
  param(1): tables (JSON array, jfile:/path, path, or noisy/percent-encoded).
             You may also pass a Python/JSON list that contains both tables and the keyword.
  param(2): target label keyword (e.g., "Initial_Capital") — may be noisy; we'll clean/fuzzy match.
  param(3): optional model (default: "gpt-4o-mini"). "None"/None/null -> fallback to default.
  param(4): optional temperature (float; default: 0.25)

Behavior:
  • Parses tables into a compact schema summary (tables, labels, headers, sample values).
  • Cleans/fuzzy-matches the target keyword to an existing label if possible.
  • Calls OpenAI Chat Completions to propose formulas that compute the target label.
  • Returns JSON with suggestions via works.resolve.

Requirements:
  pip install openai
  The environment must have OPENAI_API_KEY set.
"""

import os
import re
import json
import ast
import difflib
from typing import Any, Optional, List, Dict, Tuple
from urllib.parse import unquote

# -------- Ion integration (required) --------
from ion import works  # type: ignore

# -------- OpenAI client --------
from openai import OpenAI


# ---------- Example formulas (reference only; many include functions) ----------
EXAMPLE_FORMULAS = r"""
- Formulas: (examples)  
"table_a[1:1][1:1]": "fte_table[Molecular_Biologist,Salary]+fte_table[Project_Manager,Salary]
"table_b[1:1][1:1]": "table_a[Annual_Costs]*0.2",
"table_c[1:1][1:1]": "table_a[Annual_Costs]*0.1",
"table_total[1:1][1:1]": "inputs[Capital]+(table_a[Annual_Costs]*10)+(table_b[Equipment_Costs]*10)+(table_c[Staff_Salaries]*10)"
"outputs[1:1][1:1]": "input_table[Items]+input_table[Units_Per_Item]"
"outputs[2:1][1:1]": "input_table[Replicates]*input_table[Units_Per_Replicate]"
"outputs[3:1][1:1]": "IF(input_table[Status]="PASS",1,0)"
"outputs[4:1][1:1]": "ROUND(input_table[Value_A]/input_table[Factor_A],3)"
"outputs[5:1][1:1]": "SUM(input_table[Value])"
"outputs[6:1][1:1]": "AVERAGE(input_table[Metric_A])"
"outputs[7:1][1:1]": "STDEV.S(input_table[Metric_A])"
"outputs[8:1][1:1]": "MAX(input_table[Signal])-MIN(input_table[Background])"
"outputs[9:1][1:1]": "IFERROR(input_table[Signal]/input_table[Background],"NA")"
"outputs[10:1][1:1]": "input_table[Item_ID]&"_"&TEXT(TODAY(),"yyyymmdd")"
"outputs[11:1][1:1]": "MEDIAN(input_table[Metric_A])"
"outputs[12:1][1:1]": "AND(input_table[QC_Flag]=0,input_table[Signal]>input_table[Threshold])"
"analysis_results[1:1][1:1]": "SUM(data_table[Signal])/COUNT(data_table[Signal])"
"analysis_results[2:1][1:1]": "VAR.S(data_table[Signal])"
"analysis_results[3:1][1:1]": "CORREL(data_table[Input_A],data_table[Output_A])"
"analysis_results[4:1][1:1]": "SLOPE(data_table[Output_A],data_table[Input_A])"
"analysis_results[5:1][1:1]": "INTERCEPT(data_table[Output_A],data_table[Input_A])"
"analysis_results[6:1][1:1]": "PERCENTILE.INC(data_table[Signal],0.95)"
"analysis_results[7:1][1:1]": "IF(OR(data_table[Outlier]=1,data_table[QC_Flag]=1),"EXCLUDE","INCLUDE")"
"analysis_results[8:1][1:1]": "GEOMEAN(data_table[Fold_Change])"
"analysis_results[9:1][1:1]": "TRIMMEAN(data_table[Signal],0.1)"
"analysis_results[10:1][1:1]": "COUNTIFS(data_table[Group],"A",data_table[Type],"STD")"
"analysis_results[11:1][1:1]": "IFERROR((data_table[Signal]-data_table[Blank])/(data_table[Standard]-data_table[Blank]),"")"
"analysis_results[12:1][1:1]": "NORM.S.DIST((data_table[Z_Score]),TRUE)"
"qc_table[1:1][1:1]": "IF(checks[Status]="PASS",1,0)"
"qc_table[2:1][1:1]": "COUNTIF(checks[Status],"PASS")"
"qc_table[3:1][1:1]": "COUNTIF(checks[Status],"FAIL")"
"qc_table[4:1][1:1]": "COUNT(checks[Status])"
"qc_table[5:1][1:1]": "TEXT(NOW(),"yyyy-mm-dd hh:mm")"
"qc_table[6:1][1:1]": "IF(AND(checks[Value]>=checks[Min],checks[Value]<=checks[Max]),"WITHIN","OUT_OF_RANGE")"
"qc_table[7:1][1:1]": "IFERROR(checks[Value]-checks[Background],"")"
"qc_table[8:1][1:1]": "AVERAGEIF(checks[Status],"PASS",checks[Value])"
"qc_table[9:1][1:1]": "STDEV.S(IF(checks[Status]="PASS",checks[Value]))"
"qc_table[10:1][1:1]": "IFS(checks[Severity]="High","ALERT",checks[Severity]="Medium","WARN",TRUE,"OK")"
"qc_table[11:1][1:1]": "NETWORKDAYS(checks[Start_Date],checks[End_Date])"
"qc_table[12:1][1:1]": "XOR(checks[Flag_A]=1,checks[Flag_B]=1)"
"analysis_matrix[1:1][1:1]": "ROUND(stats[Mean],2)"
"analysis_matrix[2:1][1:1]": "ZTEST(stats[Distribution],stats[Mean],stats[StdDev])"
"analysis_matrix[3:1][1:1]": "TTEST(stats[Group_A],stats[Group_B],2,2)"
"analysis_matrix[4:1][1:1]": "IF(stats[StdDev]=0,"NA",(stats[Mean]-stats[Target])/stats[StdDev])"
"analysis_matrix[5:1][1:1]": "RANK.EQ(stats[Mean],stats[All_Means])"
"analysis_matrix[6:1][1:1]": "POWER(stats[Effect],2)"
"analysis_matrix[7:1][1:1]": "LOG10(stats[Ratio])"
"analysis_matrix[8:1][1:1]": "EXP(stats[Ln_Value])"
"analysis_matrix[9:1][1:1]": "EDATE(Assumptions[Start_Date],1)"
"analysis_matrix[10:1][1:1]": "SUMPRODUCT(stats[Weights],stats[Values])"
"analysis_matrix[11:1][1:1]": "NORM.DIST(stats[X],stats[Mu],stats[Sigma],TRUE)"
"analysis_matrix[12:1][1:1]": "COVARIANCE.S(stats[Series_A],stats[Series_B])"
"summary_table[1:1][1:1]": "MAX(records[Reading])-MIN(records[Reading])"
"summary_table[2:1][1:1]": "AVERAGE(records[Reading])"
"summary_table[3:1][1:1]": "MEDIAN(records[Reading])"
"summary_table[4:1][1:1]": "MODE.SNGL(records[Reading])"
"summary_table[5:1][1:1]": "COUNTIF(records[Flag],"ERROR")"
"summary_table[6:1][1:1]": "CONCAT(records[Batch],"-",TEXT(records[Date],"yyyymmdd"))"
"summary_table[7:1][1:1]": "IF(records[Reading]>records[Upper_Limit],"HIGH",IF(records[Reading]<records[Lower_Limit],"LOW","OK"))"
"summary_table[8:1][1:1]": "ROUND(AVERAGEIF(records[Group],"Control",records[Reading]),3)"
"summary_table[9:1][1:1]": "VAR.P(records[Reading])"
"summary_table[10:1][1:1]": "SKEW(records[Reading])"
"summary_table[11:1][1:1]": "KURT(records[Reading])"
"summary_table[12:1][1:1]": "COUNTIFS(records[Group],"Treatment",records[Flag],"OK")"
"calibration_table[1:1][1:1]": "ABS(raw_table[Offset])"
"calibration_table[2:1][1:1]": "IF(raw_table[Slope]=0,"NA",(raw_table[Signal]-raw_table[Intercept])/raw_table[Slope])"
"calibration_table[3:1][1:1]": "LINEST(raw_table[Y],raw_table[X],TRUE,TRUE)"
"calibration_table[4:1][1:1]": "RSQ(raw_table[Y],raw_table[X])"
"calibration_table[5:1][1:1]": "EXP(raw_table[LnY])"
"calibration_table[6:1][1:1]": "LOG(raw_table[Y])"
"calibration_table[7:1][1:1]": "IFERROR((raw_table[Y]-raw_table[Y0])/raw_table[Y0],"")"
"calibration_table[8:1][1:1]": "EOMONTH(raw_table[Cal_Date],0)"
"calibration_table[9:1][1:1]": "DATEDIF(raw_table[Start],raw_table[End],"D")"
"calibration_table[10:1][1:1]": "ROUNDUP(raw_table[Std_Dev]*3,2)"
"calibration_table[11:1][1:1]": "IF(raw_table[Valid]=TRUE,"USE","REJECT")"
"calibration_table[12:1][1:1]": "FORECAST.LINEAR(raw_table[X_New],raw_table[Y],raw_table[X])"
"log_table[1:1][1:1]": "NOW()"
"log_table[2:1][1:1]": "TODAY()"
"log_table[3:1][1:1]": "TEXT(NOW(),"hh:mm:ss")"
"log_table[4:1][1:1]": "UPPER(users_table[Operator])"
"log_table[5:1][1:1]": "PROPER(users_table[Operator])"
"log_table[6:1][1:1]": "IF(tasks_table[Completed]=1,"DONE","PENDING")"
"log_table[7:1][1:1]": "CONCAT(tasks_table[Step_ID],": ",tasks_table[Description])"
"log_table[8:1][1:1]": "NETWORKDAYS(tasks_table[Start],tasks_table[Finish])"
"log_table[9:1][1:1]": "IFERROR(tasks_table[Finish]-tasks_table[Start],"")"
"log_table[10:1][1:1]": "IF(tasks_table[Priority]="High",3,IF(tasks_table[Priority]="Medium",2,1))"
"log_table[11:1][1:1]": "COUNTIFS(tasks_table[Owner],users_table[Operator],tasks_table[Completed],1)"
"log_table[12:1][1:1]": "UNIQUE(tasks_table[Batch])"
"batch_report[1:1][1:1]": "batch_table[Batch_Size]batch_table[Yield]"
"batch_report[2:1][1:1]": "IFERROR(batch_table[Good_Units]/batch_table[Batch_Size],0)"
"batch_report[3:1][1:1]": "SUMIF(batch_table[Line],"A",batch_table[Good_Units])"
"batch_report[4:1][1:1]": "AVERAGEIFS(batch_table[Cycle_Time],batch_table[Line],"B",batch_table[Shift],"Night")"
"batch_report[5:1][1:1]": "COUNTIFS(batch_table[QC_Status],"FAIL")"
"batch_report[6:1][1:1]": "TEXT(batch_table[Run_Date],"yyyy-mm-dd")"
"batch_report[7:1][1:1]": "IF(batch_table[Scrap]>0.05batch_table[Batch_Size],"INVESTIGATE","OK")"
"batch_report[8:1][1:1]": "SUMPRODUCT(batch_table[Good_Units],batch_table[Unit_Cost])"
"batch_report[9:1][1:1]": "ROUND(SUMPRODUCT(batch_table[Good_Units],batch_table[Unit_Price])-SUMPRODUCT(batch_table[Good_Units],batch_table[Unit_Cost]),2)"
"batch_report[10:1][1:1]": "EOMONTH(batch_table[Run_Date],0)"
"batch_report[11:1][1:1]": "IF(batch_table[Rework_Flag]=1,batch_table[Good_Units]-batch_table[Reworked],batch_table[Good_Units])"
"batch_report[12:1][1:1]": "SUBTOTAL(9,batch_table[Good_Units])"
"records_2[1:1][1:1]": "UPPER(meta_table[Record_ID])"
"records_2[2:1][1:1]": "PROPER(meta_table[Last_Name])&", "&PROPER(meta_table[First_Name])"
"records_2[3:1][1:1]": "DATEDIF(meta_table[DOB],TODAY(),"Y")"
"records_2[4:1][1:1]": "IF(meta_table[Consent]=TRUE,"CONSENTED","PENDING")"
"records_2[5:1][1:1]": "IFERROR(VLOOKUP(meta_table[Code],code_table[Code:Description],2,FALSE),"UNKNOWN")"
"records_2[6:1][1:1]": "CONCAT(meta_table[Record_ID],"-",TEXT(TODAY(),"YYYYMMDD"))"
"records_2[7:1][1:1]": "IF(AND(lab_table[Metric_A]>lab_table[Metric_A_ULN],lab_table[Metric_B]>lab_table[Metric_B_ULN]),"ELEVATED","OK")"
"records_2[8:1][1:1]": "ROUND(AVERAGEIFS(lab_table[Value],lab_table[Record_ID],meta_table[Record_ID]),2)"
"records_2[9:1][1:1]": "COUNTIFS(visit_table[Record_ID],meta_table[Record_ID])"
"records_2[10:1][1:1]": "IF(visit_table[Next_Visit]="",EDATE(TODAY(),1),visit_table[Next_Visit])"
"records_2[11:1][1:1]": "TEXTJOIN("; ",TRUE,pref_table[Allergies])"
"records_2[12:1][1:1]": "IFERROR(INDEX(meds_table[Drug],MATCH(meta_table[Record_ID],meds_table[Record_ID],0)),"")"
"inventory_table[1:1][1:1]": "IF(inventory[Stock_Level]<inventory[Threshold],"ORDER","OK")"
"inventory_table[2:1][1:1]": "inventory[On_Hand]+inventory[On_Order]-inventory[Committed]"
"inventory_table[3:1][1:1]": "ROUNDUP(FORECAST.LINEAR(TODAY(),sales[Date],sales[Qty])-inventory[On_Hand],0)"
"inventory_table[4:1][1:1]": "IFERROR(VLOOKUP(inventory[Item_SKU],catalog[SKU:Reorder_Point],2,FALSE),inventory[Threshold])"
"inventory_table[5:1][1:1]": "SUMIF(inventory[Category],"Category_A",inventory[On_Hand])"
"inventory_table[6:1][1:1]": "TEXT(inventory[Expiry],"yyyy-mm-dd")"
"inventory_table[7:1][1:1]": "IF(TODAY()>inventory[Expiry],"EXPIRED","VALID")"
"inventory_table[8:1][1:1]": "COUNTIFS(inventory[Location],"Location_A",inventory[On_Hand],">0")"
"inventory_table[9:1][1:1]": "SUMPRODUCT(inventory[On_Hand],inventory[Unit_Cost])"
"inventory_table[10:1][1:1]": "IF(inventory[Class]<>"",inventory[Class],"N/A")"
"inventory_table[11:1][1:1]": "LEFT(inventory[Item_Name],10)"
"inventory_table[12:1][1:1]": "IFERROR((inventory[On_Hand]/AVERAGE(sales[Daily_Use]))*1.0,"")"
"""


# ---------- Safe/robust parsing utilities ----------

def _decode(s):
    if s is None:
        return None
    t = str(s)
    try:
        return unquote(t)
    except Exception:
        return t


def _maybe_json_load(s: str):
    try:
        return json.loads(s)
    except Exception:
        return None


def _maybe_literal_eval(s: str):
    try:
        return ast.literal_eval(s)
    except Exception:
        return None


def _looks_like_path(raw: str) -> bool:
    if len(raw) > 240:
        return False
    if raw.startswith("jfile:"):
        return True
    if os.path.exists(raw):
        return True
    return raw.lower().endswith(".json") or ("/" in raw or os.path.sep in raw)


def _read_path(raw: str):
    p = raw[6:] if raw.startswith("jfile:") else raw
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_json_slice(raw: str):
    for opener, closer in (("[", "]"), ("{", "}")):
        if opener in raw and closer in raw:
            start, end = raw.find(opener), raw.rfind(closer)
            if 0 <= start < end:
                snippet = raw[start : end + 1]
                obj = _maybe_json_load(snippet)
                if obj is not None:
                    return obj
    return None


def _load_json_from_path_or_text(s: Optional[str | list | dict]):
    """
    Accepts:
      - already-parsed list/dict
      - percent-encoded strings
      - inline JSON {..} or [..]
      - python-literal (single quotes) via ast.literal_eval
      - 'jfile:/path' or plain filesystem path to a .json
      - noisy strings that contain a JSON slice; we extract the first {...} or [...]
    """
    if isinstance(s, (list, dict)):
        return s
    if s is None:
        return None

    raw = _decode(s).strip()
    if not raw:
        return None

    if _looks_like_path(raw):
        return _read_path(raw)

    if raw[:1] in "[{":
        obj = _maybe_json_load(raw)
        if obj is not None:
            return obj

    obj = _extract_json_slice(raw)
    if obj is not None:
        return obj

    lit = _maybe_literal_eval(raw)
    if isinstance(lit, (list, dict)):
        return lit

    repaired = raw.replace("'", '"')
    obj = _maybe_json_load(repaired)
    if obj is not None:
        return obj

    raise ValueError("Could not parse JSON from input.")


def _extract_label_set(tables: list) -> set[str]:
    """
    Extract label tokens from column x==0 (row y>=1), plus multi-col table headers.
    """
    labels = set()
    for tbl in tables or []:
        wells = tbl.get("wells", [])
        for w in wells:
            if w.get("x") == 0 and isinstance(w.get("value"), str):
                if (w.get("y") or 0) >= 1:
                    labels.add(w["value"])
        # Also include top headers for multicol tables (x>0, y==0)
        for w in wells:
            if w.get("y") == 0 and isinstance(w.get("value"), str):
                if (w.get("x") or 0) >= 1:
                    labels.add(w["value"])
    return labels


def _clean_keyword(raw_keyword: str | None, tables: list | None) -> str:
    """
    Normalize target keyword:
      - URL-decode
      - strip quotes/whitespace
      - if it's a big blob, try to pick a token that matches an existing label
      - fuzzy fallback to closest label
    """
    if raw_keyword is None:
        return ""
    s = _decode(raw_keyword).strip().strip("'\"")
    if not s:
        return ""
    label_set = _extract_label_set(tables or [])

    if s in label_set:
        return s

    tokens = [tok for tok in re.split(r"[\s,;/]+", s) if tok]
    for tok in tokens:
        if tok in label_set:
            return tok

    if label_set:
        best = difflib.get_close_matches(s, list(label_set), n=1, cutoff=0.6)
        if best:
            return best[0]

    return s


def _coerce_tables_and_keyword(raw1, raw2):
    """
    Supports:
      - raw1 = tables (json/path/noisy), raw2 = keyword
      - OR raw1 is a list containing [tables_or_path, keyword] (and possibly extra noise)
    Returns (tables_list, keyword_str)
    """
    # Try to parse raw1 as a list we can mine
    r1 = _decode(raw1)
    parsed1 = _maybe_json_load(r1) or _maybe_literal_eval(r1)
    tables_candidate = None
    keyword_candidate = None

    if isinstance(parsed1, list):
        for item in parsed1:
            if isinstance(item, list) and item and isinstance(item[0], dict) and "wells" in item[0]:
                tables_candidate = item
            elif isinstance(item, str) and _looks_like_path(item):
                try:
                    maybe_tables = _read_path(item)
                    if isinstance(maybe_tables, list):
                        tables_candidate = maybe_tables
                except Exception:
                    pass
            elif isinstance(item, str):
                keyword_candidate = item

    if tables_candidate is None:
        tables_candidate = _load_json_from_path_or_text(raw1)

    kw = raw2 if raw2 is not None else keyword_candidate
    kw = _clean_keyword(kw, tables_candidate)

    if not isinstance(tables_candidate, list):
        raise ValueError("Tables must resolve to a list of table dicts.")
    return tables_candidate, kw


# ---------- Model safety ----------

def _pick_model(requested: Optional[str], default_model: str = "gpt-4o-mini") -> str:
    m = (requested or "").strip() or default_model or "gpt-4o-mini"
    if m.lower() in {"none", "null"}:
        m = "gpt-4o-mini"
    return m


def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.3,
    json_mode: bool = False,
) -> str:
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


def _chat_call_safe(
    *,
    model: str | None,
    system: str,
    user: str,
    temperature: float = 0.3,
    json_mode: bool = False,
) -> str:
    m = _pick_model(model)
    try:
        return _chat_call(model=m, system=system, user=user, temperature=temperature, json_mode=json_mode)
    except Exception as e:
        # Retry on model not found with default
        if "model_not_found" in str(e) or "does not exist" in str(e):
            return _chat_call(model="gpt-4o-mini", system=system, user=user, temperature=temperature, json_mode=json_mode)
        raise


# ---------- Table summarization to guide LLM ----------

def _summarize_tables_for_llm(tables: list) -> str:
    """
    Produce a compact, deterministic text summary to condition the model.
    """
    lines: List[str] = []
    for t in tables:
        name = t.get("name", "<unnamed>")
        cols = t.get("cols")
        rows = t.get("rows")
        lines.append(f"#TABLE {name} cols={cols} rows={rows}")
        wells = t.get("wells", [])
        # headers
        headers = [w["value"] for w in wells if w.get("y") == 0 and isinstance(w.get("value"), str)]
        if headers:
            lines.append("  headers: " + ", ".join(headers[:12]) + ("..." if len(headers) > 12 else ""))
        # labels
        labels = [w["value"] for w in wells if w.get("x") == 0 and (w.get("y") or 0) >= 1 and isinstance(w.get("value"), str)]
        if labels:
            lines.append("  labels: " + ", ".join(labels[:24]) + ("..." if len(labels) > 24 else ""))
        # sample values (x==1, first few)
        values = [w["value"] for w in wells if w.get("x") == 1 and (w.get("y") or 0) >= 1]
        if values:
            vs = [str(v) for v in values[:8]]
            lines.append("  sample_values: " + ", ".join(vs) + ("..." if len(values) > 8 else ""))
    return "\n".join(lines)


# ---------- Core: suggest formulas ----------

def suggest_formulas_for_target(
    *,
    tables_spec: List[Dict[str, Any]],
    target_label: str,
    model: Optional[str] = None,
    temperature: float = 0.25,
    max_suggestions: int = 6,
) -> Dict[str, Any]:
    """
    Returns a JSON-serializable dict:
      {
        "target_label": "...",
        "suggestions": [
           {"formula": "...", "explanation": "..."},
           ...
        ]
      }
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

    schema = _summarize_tables_for_llm(tables_spec)

    system = (
        "You generate spreadsheet-like formulas using only named references of the form table_or_section[Label].\n"
        "Strict rules:\n"
        "- Use only + - * / ^ and parentheses (no functions like SUM, IF, AVERAGE, TEXT, etc.).\n"
        "- Do NOT use ranges or dot-notation. Only named references like other_table[Field].\n"
        "- or use other_table[Field,Field2] for ANDing fields\n"
        "- Prefer composing from available labels across tables. If something is missing, use sensible intermediate labels that could exist.\n"
        "- Never reference the same cell as both the assignment and an input (no self-reference).\n"
        "- Return ONLY JSON with keys: suggestions=[{formula, explanation}...]. No markdown or prose.\n"
        "- IMPORTANT: You will see a REFERENCE FORMULAS block that may include Excel-like functions. "
        "Treat them as naming/relationship inspiration only; DO NOT emit functions—rewrite ideas into pure arithmetic."
    )

    user = (
        "You are given a compact description of multiple tables and labels present in a model.\n"
        "Your job: Propose concise arithmetic formulas (no functions) to compute the requested TARGET label.\n\n"
        f"=== TABLE SUMMARY ===\n{schema}\n\n"
        f"=== TARGET ===\n{target_label}\n\n"
        f"Please return up to {max_suggestions} distinct formulas that could compute the target. "
        "Make sure references look like table_name[Label] where the label likely exists (or is a reasonable derived assumption).\n\n"
        "=== REFERENCE FORMULAS (for inspiration; many include functions you must NOT use) ===\n"
        f"{EXAMPLE_FORMULAS}"
    )

    content = _chat_call_safe(
        model=model,
        system=system,
        user=user,
        temperature=temperature,
        json_mode=True,
    )

    # Parse safe JSON; normalize output
    try:
        data = json.loads(content or "{}")
    except Exception:
        # Try to extract a JSON object if the model added any wrappers
        start = (content or "").find("{")
        end = (content or "").rfind("}")
        if start != -1 and end != -1 and end > start:
            data = json.loads(content[start : end + 1])
        else:
            data = {}

    suggestions = data.get("suggestions")
    if not isinstance(suggestions, list):
        suggestions = []

    # Minimal shape normalization and sanitization
    out_suggestions: List[Dict[str, str]] = []
    seen: set[str] = set()
    for s in suggestions:
        formula = str(s.get("formula", "")).strip()
        if not formula:
            continue
        # normalize whitespace
        formula_norm = re.sub(r"\s+", "", formula)
        if formula_norm in seen:
            continue
        seen.add(formula_norm)

        # disallow functions — crude check for word(...) not in table[Label]
        tmp = re.sub(r'[A-Za-z_][A-Za-z0-9_]*\[[^\]]+\]', '', formula)  # strip table[Label] refs
        if re.search(r'[A-Za-z_][A-Za-z0-9_]*\s*\(', tmp):
            continue

        # only allowed tokens: names with [Label], numbers, operators, parentheses, dots not allowed
        if "." in formula:
            continue

        explanation = str(s.get("explanation", "")).strip()
        out_suggestions.append({"formula": formula, "explanation": explanation})

        if len(out_suggestions) >= max_suggestions:
            break

    return {
        "target_label": target_label,
        "suggestions": out_suggestions,
    }


# ---------- Ion entry point ----------

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    """
    Ion entry:
      param(1): tables (JSON / jfile:/path / path / noisy / list-wrapped)
      param(2): keyword (target label)
      param(3): optional model
      param(4): optional temperature
    """
    works.msg("\tready: formula suggester")

    # Read raw params
    raw1 = works.param(1)  # tables or composite list
    raw2 = works.param(2)  # keyword
    try:
        raw_model = works.param(3)
    except Exception:
        raw_model = None
    try:
        actions = works.param(4)
    except Exception:
        actions = None

    model = _pick_model(str(raw_model) if raw_model is not None else None, default_model)
    temperature = 0.25
    
    
    try:
        tables_spec, keyword = _coerce_tables_and_keyword(raw1, raw2)
    except Exception as e:
        works.resolve(f"Failed to parse inputs: {e}")
        return 1

    if not keyword:
        works.resolve("No target keyword provided/found.")
        return 1

    works.msg("\tParsing tables...")
    works.msg(f"\tGenerating formula suggestions for '{keyword}'...")

    try:
        result = suggest_formulas_for_target(
            tables_spec=tables_spec,
            target_label=keyword,
            model=model,
            temperature=temperature,
            max_suggestions=6,
        )
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve(f"Error generating suggestions: {e}")
        return 1


# Auto-run when loaded by Ion
works.msg(' loading suggester ')
_main_ion('gpt-4o-mini')
