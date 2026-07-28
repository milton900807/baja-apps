#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Three-stage AssignLang model builder + prior-results refinement.

Adds:
  • Formula label sanitizer to prevent operators inside [Label] (e.g., Year_1*_Revenue).
  • Optional "previous results" input to refine/expand model:
      - Ion:   param(1)=prompt, param(2)=previous_results (JSON string or path),
               param(3)=model, param(4)=temperature
      - CLI:   --prev path_or_inline_json

Pipeline:
  1) Expand user's prompt into a richer paragraph (no JSON).
  2) Use expanded text (plus a concise summary of prior model, if given) to build JSON via scaffold.
  3) Post-process: enforce headers, sanitize labels in formulas, patch refs, units,
     rewrite range refs to named refs, optionally merge prior results, sanitize again.

Outputs:
  JSON with top-level keys: tables, formulas, annotations, units.
"""

import os
import sys
import json
import argparse
from typing import Optional, Dict, Any, Tuple, List, Set
import re

# ---------- Optional Ion integration ----------
from ion import works  # type: ignore
_HAS_ION = True

# ---------- OpenAI client ----------
# pip install -U openai
from openai import OpenAI

# ---------- DEFAULT GRAMMAR (can be overridden with --grammar-file) ----------
GRAMMAR = r"""

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

def _json_dumps_compact(obj: Any, max_len: int = 6000) -> str:
    """
    Compact dump with a soft cap to avoid blowing context window.
    """
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    if len(s) <= max_len:
        return s
    return s[: max_len - 100] + "...(truncated)..."

# ---------- Small helpers for Chat Completions ----------
def _chat_call(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.51,
    json_mode: bool = False,
) -> str:
    client = OpenAI()
    kwargs = dict(
        model=model,
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
    temperature: float = 0.1,
) -> Tuple[str, str]:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    sys_msg = (
        "You are a domain pack synthesizer for a grammar-driven modeling system.\n"
        "Return ONLY a JSON object with exactly two string fields: "
        '{"domain_block": "...", "anchor_hints": "..."}\n'
        "Hard target: produce anchor hints that enable >=16 tables and >=240 formulas."
        "Return more than 100 different formulas"
        "Return ONLY a JSON object with exactly two string fields: "
        '{"domain_block": "...", "anchor_hints": "..."}'
    )


    user_msg = (
        "Build a domain pack and formula anchor hints for the following domain.\n\n"
        f"DOMAIN PROMPT:\n{domain_prompt}\n\n"
        "Hard rules:\n"
        "- All tables have 2 cols; [0:0][0:0]='Label', [1:1][0:0]='Value'.\n"
        "- Label col must be fully labeled; formulas reference table[Label] (no quotes).\n"
        "- Refer to many tables where each has more than 20 rows and many formulas.\n"
        "- More than 140 different rows.\n"
        "- No duplicate labels.\n"
        "- No ranges or dot-notation in references; only + - * / ^ and parentheses.\n"
        "- Provide anchor hints that suggest meaningful labels and relationships.\n"
        "- Refer to many tables where each has more than 20 rows and many formulas.\n"
        "- At least 26 tables total; at least 240 distinct formulas can be constructed from these anchors.\n"
        "- More than 320 different label rows overall.\n"
        "- a formula cannot be assigned to a cell and at the same time call that cell in the formula\n\n"
        "- Use only alphabet characters for labels and tablenames\n"
        "-Create a PnL table\n"
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

# ---------- UNITS example ----------
UNITS_EXAMPLE = '''
"units": {
  "inputs": {
    "Unit_Cost": "USD/unit",
    "Units_Required": "count",
    "Cost_Per_Entity": "USD",
    "Headcount": "count"
  },
  "input_table": {
    "Items": "count",
    "Units_Per_Item": "count",
    "Actions_Per_Item": "count",
    "Action_Cost_Per_Action": "USD"
  },
  "outputs": {
    "Total_Item_Cost": "USD",
    "Total_Action_Cost": "USD",
    "Total_Units": "count",
    "Total_Entity_Cost": "USD",
    "Total_Cost": "USD"
  }
}

'''.strip()




def build_system_scaffold(grammar_text: str, domain_block: str = "", anchor_hints: str = "") -> str:
    base = f"""
You are generating a structured model as JSON only.

SIZE TARGETS (MANDATORY — DO NOT IGNORE)
- Provide AT LEAST 8 distinct tables.
- All labels are unique
- Provide AT LEAST 20 distinct labeled rows across all tables (excluding header rows).
- Provide AT LEAST 40 formulas total (in "formulas"), and at least 8 formulas per table.
- If output size is constrained, PRIORITIZE: (1) more formulas, (2) more labeled rows, (3) more tables.
- Keep "annotations" short (max 1 short sentence per table). Keep "units" minimal (one-word units).

OUTPUT CONTRACT (MANDATORY)
- Dedup rows and columns
- Return ONLY a JSON object with exactly four top-level keys: "tables", "formulas", "annotations", "units". No prose.
- Keys in "tables" and "formulas" are single-cell addresses: "<table>[i:i][j:j]".
- All table names use underscores; no spaces; no dot notation.
- Must use at least one inputs table and one outputs table.
- Every labeled row either has a constant string in tables "<table>[1:1][y:y]" OR a formula in "formulas" "<table>[1:1][y:y]".
- MUST have an input or assumption table and must have an output or results table
- alphanumeric characters only  in names and labels
- All tables have 2 cols; [0:0][0:0]='Label', [1:1][0:0]='Value'
- Label col must be fully labeled and each is unique; formulas reference table[Label] (no quotes)

HEADER RULES (MANDATORY)
- For tables with exactly two columns has headers:
  "<table>[0:0][0:0]" = "Label"
  "<table>[1:1][0:0]" = "Value"
- For tables with more than two columns has headers:
  "<table>[0:0][0:0]" = "Label"
  "<table>[1:1][0:0]" = "<domain_specific_label1>"
  "<table>[2:2][0:0]" = "<domain_specific_label2>"
  "<table>[3:3][0:0]" = "<domain_specific_label3>"
  all label columns must be completely filled with label strings 
  all header rows and header columns must be defined and assigned in the tables dictionary
  all header columns MUST be unique 
  all header rows MUST be unique 
  all Labels MUST be Unique


FORMULA RULES
- Formulas appear only in "formulas" as strings at keys "<_table_name>[1:1][Y:Y]" (or tables that calculate).
- References use named labels: other_table[Field_Label]. No ranges. No dot notation.
- Only + - * / ^ and parentheses; no implicit multiplication.
- All tables defined in tables dictionary will have some mention in formulas dictionary; All formulas and assignments are unique 
- rules must be defined and they each must include operators and/or functions 
- Formulas replace all witepace with underscores 
- Formulas do not use quotes

CONSISTENCY RULE
- If a formula references other_table[Field_Label], ensure "tables" contains that table with headers and a Field_labeled row.
- For any missing referenced label/table, provide a default constant string value.
- all cell assignments are unique 
- labels are unique and NOT null or empty strings
- formulas cannot both assign and reference the same cell

UNITS & ANNOTATIONS
- Provide "annotations" describing each table in one sentence.
- Provide "units": map of table -> Label -> unit string covering all labels and KPIs.

SELF-CHECK BEFORE RETURNING
1) For every labeled row, ensure coverage (constant in tables OR formula in formulas).
2) Ensure no ranges in formulas; only table[Label].
3) Ensure all referenced labels exist with defaults. 
4) Ensure headers exist
5) Ensure all cells are assigned in either the tables or the formulas
6) JSON only; exactly four top-level keys.
7) If a formula references other_table[Field_Label], ensure that <other_table> contains a Field_labeled row.




UNITS (MANDATORY)
- Provide "units" covering all labels and outputs; use sensible strings like "USD", "count", "unitless".
- Keys in units MUST exactly match label strings.

MODEL INPUTS MUST-HAVE EXPLICIT SHAPE EXAMPLE
- Tables:
  "<domain>_inputs[0:0][0:0]": "Label",
  "<domain>_inputs[1:1][0:0]": "Value",
  "<domain>_inputs[0:0][1:1]": "GMP_Cost_Per_Unit",
  "<domain>_inputs[1:1][1:1]": "50000",
  
- Formulas: (examples)  
"table_a[1:1][1:1]": "inputs[Capital]*0.2",
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
"analysis_matrix[2:1][1:1]": "Z.TEST(stats[Distribution],stats[Mean],stats[StdDev])"
"analysis_matrix[3:1][1:1]": "T.TEST(stats[Group_A],stats[Group_B],2,2)"
"analysis_matrix[4:1][1:1]": "IF(stats[StdDev]=0,"NA",(stats[Mean]-stats[Target])/stats[StdDev])"
"analysis_matrix[5:1][1:1]": "RANK.EQ(stats[Mean],stats[All_Means])"
"analysis_matrix[6:1][1:1]": "POWER(stats[Effect],2)"
"analysis_matrix[7:1][1:1]": "LOG10(stats[Ratio])"
"analysis_matrix[8:1][1:1]": "EXP(stats[Ln_Value])"
"analysis_matrix[9:1][1:1]": "IFERROR(INDEX(stats[Lookup_Values],MATCH(stats[Key],stats[Lookup_Keys],0)),"")"
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

VALIDATION CHECKLIST
- JSON only; no prose.
- Exactly four top-level keys: tables, formulas, annotations, units.
- Headers present for every table.
- AT LEAST 16 tables, 320+ labeled rows, 240+ formulas; ≥8 formulas per table.
- No ranges in formulas. must have >10 formulas
- All referenced labels exist with defaults if needed.
- Every labeled row has either a constant or a formula.
- Provide units for all labels and outputs.
- many tables many rows all column 0 labeled 
- A formula cannot assign itself and contain a reference to itself
- All cells in all tables should be assigned a constant value in the tables dictionary or assigned a formula in the formulas dictionary
- Mandatory: All cells have an assignment either in tables or formulas!
- Each row is unique!  mandatory unique row
- First column [0:0][y:y] must have labels and assigned in tables dictionary

ANCHOR HINTS:
{anchor_hints}

COVERAGE GUARANTEE
For every label row "<table>[0:0][Y:Y]" present in "tables", there MUST be either
- a constant at "<table>[1:1][Y:Y]" in "tables", OR
- a formula at "<table>[1:1][Y:Y]" in "formulas".
If neither exists, add "<table>[1:1][Y:Y]" = "0" to "tables" before returning JSON.
"""
    return base

# ---------- Stage 1: Prompt expansion ----------
def _summarize_prior_for_prompt(prev: dict) -> str:
    """
    Create a compact textual summary of prior results to guide the next model.
    """
    if not prev:
        return ""
    try:
        # High-level signal rather than full prior JSON
        tables = sorted({k.split("[", 1)[0] for k in (prev.get("tables") or {}).keys()})
        have_units = bool(prev.get("units"))
        have_ann = bool(prev.get("annotations"))
        sample_formulas = list((prev.get("formulas") or {}).items())[:8]
        fkeys = [k for (k, _v) in sample_formulas]
        return (
            "PRIOR MODEL SUMMARY:\n"
            f"- Tables: {tables}\n"
            f"- Units: {have_units}\n"
            f"- Annotations: {have_ann}\n"
            f"- Sample formula keys: {fkeys}\n"
        )
    except Exception:
        # Fallback to compact JSON if structure not as expected
        return "PRIOR MODEL (compact JSON):\n" + _json_dumps_compact(prev, 4000)

def expand_user_prompt(
    prompt: str,
    *,
    model: str = "gpt-4o",
    temperature: float = 0.1,
    previous_results: Optional[dict] = None,
) -> str:
    """
    First OpenAI call: expand the user's brief prompt into a detailed, single paragraph
    describing the intended model (no JSON, no code, no lists).
    If previous_results is provided, include a concise summary to steer refinement.
    """
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

    sys_msg = (
        "You rewrite brief financial modeling prompts into one concise paragraph that fully describes "
        "the  model including, assumptions, profit, loss, drivers, KPIs, tax tables, and relationships and burn rate etc. "
        "Write plain English (no bullets/lists/code/JSON). Keep it focused and concrete."
    )

    prior_block = _summarize_prior_for_prompt(previous_results) if previous_results else ""
    user_msg = (
        ("(Refine using the prior model context below.)\n" + prior_block + "\n" if prior_block else "")
        + "Expand this to describe more details and provides an explicit list of at least >10 tables and fomrulas the model should try to capture; for example KPI, capital required, operating costs per month for 3 years, and a table with FTE broken down by key positions and relevant salaries etc. "
        
        "\n Capital required, burn rate; provide default values for assumptions, then expand the model into multiple dimensions by defining a list of assumptions and iterating to create more tables (>20 rows total); "
        "specify relationships between tables using appropriate default values.  Do all of this to this paragraph: "
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
    if not return_all:
        return output

    return {
        "output": output,
        "request": {"model": model, "temperature": temperature, "system": system, "user": user},
        "scaffold": scaffold_info,
        "raw_response": _to_jsonable(raw_dump),
        "usage": None,
    }

# ---------- Diagnostics to guide the refine pass ----------
def _diagnose_model_payload(final_json: dict) -> str:
    """
    Produce a concise, model-readable diagnostics string:
      - missing tables/labels referenced by formulas
      - duplicate labels per table
      - potential self-references
      - illegal tokens (functions/ranges/dot-notation)
      - header/unit/annotation coverage
    Keep it tight (LLM context-friendly).
    """
    try:
        tables = dict((final_json or {}).get("tables") or {})
        formulas = dict((final_json or {}).get("formulas") or {})
        units = dict((final_json or {}).get("units") or {})
        annotations = dict((final_json or {}).get("annotations") or {})

        # Collect table names present
        present_tables: Set[str] = set()
        for k in list(tables.keys()) + list(formulas.keys()):
            parsed = _parse_cell_key(k)
            if parsed:
                present_tables.add(parsed[0])

        # Labels by table (from tables col 0)
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

        # Duplicates per table
        dups: Dict[str, List[str]] = {}
        for t, d in label_to_rows.items():
            dup_labels = [lab for lab, rows in d.items() if len(rows) > 1]
            if dup_labels:
                dups[t] = dup_labels

        # Reference analysis
        missing_tables: Set[str] = set()
        missing_labels: Set[Tuple[str, str]] = set()
        self_refs: List[str] = []
        illegal_tokens: List[str] = []
        range_like: List[str] = []
        dot_notation: List[str] = []

        for k, expr in formulas.items():
            if not isinstance(expr, str):
                continue
            # Detect ranges and dot-notation
            if re.search(r'\[\d+:\d+\]\[\d+:\d+\]', expr):
                range_like.append(k)
            if re.search(r'[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]', expr):
                dot_notation.append(k)

            refs = extract_named_refs(expr)
            # Identify self-reference: same table & same row's label used
            key_parsed = _parse_cell_key(k)
            key_label = None
            if key_parsed:
                kt, _ki, kj = key_parsed
                key_label = labels_by_table.get(kt, {}).get(kj)

            # Naive illegal token scan: anything that looks like a function name(
            if re.search(r'[A-Za-z_][A-Za-z0-9_]*\s*\(', expr):
                # allow table[Label] patterns; flag others
                # crude filter: if removing table[...] still leaves word(, flag
                tmp = re.sub(_LABEL_REF_ANY_RE, '', expr)
                if re.search(r'[A-Za-z_][A-Za-z0-9_]*\s*\(', tmp):
                    illegal_tokens.append(k)

            for (rt, rlab) in refs:
                if rt not in present_tables:
                    missing_tables.add(rt)
                # label missing in referenced table?
                if rlab not in set(labels_by_table.get(rt, {}).values()):
                    missing_labels.add((rt, rlab))
                # self reference check
                if key_parsed and key_label and rt == key_parsed[0] and rlab == key_label:
                    self_refs.append(k)

        # Header coverage
        missing_headers = []
        for t in present_tables:
            if tables.get(_key(t, 0, 0)) != "Label" or tables.get(_key(t, 1, 0)) != "Value":
                missing_headers.append(t)

        # Units/annotations coverage (coarse)
        tables_needing_units = []
        for t, rowmap in labels_by_table.items():
            # Any label without units entry?
            has_gap = False
            utab = (units or {}).get(t, {})
            for lab in rowmap.values():
                if not isinstance(utab, dict) or lab not in utab:
                    has_gap = True
                    break
            if has_gap:
                tables_needing_units.append(t)

        anno_gaps = [t for t in present_tables if t not in (annotations or {})]

        # Build compact diagnostic text
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


# ---------- Final strict refine (LLM-powered repair/expand pass) ----------
def refine_model_with_chat(
    model_json: dict,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.01,
) -> dict:
    """
    Use a single chat pass to:
      - verify/repair references, create any missing tables/labels, dedupe labels (and rewrite formulas)
      - enforce headers, named-refs only (no ranges, no dot-notation), no self-reference
      - correct obvious function integrity issues (prefer + - * / ^ only)
      - add short annotations/units where missing
      - (optionally) modestly expand with a few safe tables and ~24 extra formulas if helpful
    Returns a valid JSON object with the same four top-level keys.
    """
    try:
        if not os.environ.get("OPENAI_API_KEY"):
            # Fail-safe: just return original if no API key present
            return model_json or {}

        # Prepare compact JSON and diagnostics to steer the model
        compact_json = _json_dumps_compact(model_json or {}, max_len=120_000)
        diag = _diagnose_model_payload(model_json or {})

        sys_msg = (
            "You are a STRICT validator-repairer for a grammar-driven spreadsheet model.\n"
            "Return ONLY a JSON object with EXACTLY four keys: tables, formulas, annotations, units.\n"
            "MANDATES:\n"
            "- Keep all existing content where sensible; repair, don't erase, unless truly irrecoverable.\n"
            "- Ensure EVERY referenced table[Label] exists. If missing, CREATE the table and label with a default value '0' "
            "  (write constants in tables; formulas go in formulas).\n"
            "- DEDUPE labels within each table by appending numeric suffixes (_2, _3, ...), and UPDATE all formulas accordingly.\n"
            "- NO ranges (like table[1:1][5:5]) and NO dot-notation. Use ONLY named references: other_table[Field_Label].\n"
            "- NO self-referential formulas: a cell must not reference its own label in its own table.\n"
            "- Prefer formulas using only + - * / ^ and parentheses. If Excel-like functions are present and cannot be rewritten,\n"
            "  replace with a reasonable arithmetic placeholder using available labels or '0'.\n"
            "- Ensure each table has headers: [0:0][0:0] = 'Label', [1:1][0:0] = 'Value'.\n"
            "- Ensure EVERY labeled row has either a constant (in tables) OR a formula (in formulas).\n"
            "- Keep or add concise one-sentence annotations per table. Provide units for all labels (use simple unit words).\n"
            "- If safe and helpful, you MAY add up to 4 new tables and at least 24 new formulas that connect to existing ones.\n"
            "- JSON only. No prose."
        )

        user_msg = (
            "Here is the current model JSON followed by diagnostics. REPAIR and RETURN JSON ONLY.\n\n"
            "=== CURRENT_MODEL_JSON ===\n"
            f"{compact_json}\n\n"
            "=== DIAGNOSTICS ===\n"
            f"{diag}\n\n"
            "REPAIR & NORMALIZE:\n"
            "- Create any missing tables/labels referenced by formulas; initialize missing constants as '0'.\n"
            "- Deduplicate labels per table using suffixes; update all formulas referencing old names.\n"
            "- Rewrite any range or dot notation to named refs; remove illegal tokens/functions; avoid self-reference.\n"
            "- Ensure headers, coverage, units, and annotations are complete.\n"
            "- Optional expansion: up to 4 logical tables and ~24 formulas that integrate with existing labels.\n"
            "- IMPORTANT: Keep keys formatted exactly as '<table>[i:i][j:j]'."
        )

        content = _chat_call(
            model=model,
            system=sys_msg,
            user=user_msg,
            temperature=temperature,
            json_mode=True,
        )

        # Parse with resilience; fall back to original on failure
        try:
            refined = json.loads(content or "{}")
        except Exception:
            refined = json.loads(_extract_json_snippet(content or ""))

        # Basic shape guard
        if not isinstance(refined, dict):
            return model_json or {}
        for k in ("tables", "formulas", "annotations", "units"):
            refined.setdefault(k, {})

        return refined
    except Exception:
        # Last-resort: keep original
        return model_json or {}

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

# ---------- Enforce column headers in 'tables' ----------
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

# --- Convert range refs table[i:i][j:j] -> table[Label] -----------------------
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

# --- Sanitize label tokens inside formulas (remove stray math ops) -----------
_LABEL_REF_ANY_RE = re.compile(
    r'(?P<table>[A-Za-z_][A-Za-z0-9_]*)\[(?P<label>[^\[\]]+)\]'
)

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

def _quote_or_unquote_label_for_ref(label: str) -> str:
    # Keep unquoted if it's a clean identifier; otherwise quote.
    return label if _IDENT_LABEL_RE.match(label or "") else f'"{label}"'

def normalize_labels_remove_star_after_digit(final_json: dict) -> dict:
    """
    - Scans table label strings ([0:0][y:y] values) and removes '*' that immediately follows a digit.
    - Builds a {table: {old_label: new_label}} map.
    - Rewrites all formulas' table[Label] references to the new labels so references stay consistent.
    NOTE: Arithmetic like '3*5' in formulas is NOT touched; only label tokens inside [...] are remapped.
    """
    data = dict(final_json or {})
    tables = dict(data.get("tables") or {})
    formulas = dict(data.get("formulas") or {})

    # 1) Collect label changes per table
    remap: Dict[str, Dict[str, str]] = {}
    for k, v in list(tables.items()):
        parsed = _parse_cell_key(k)
        if not parsed:
            continue
        t, i, j = parsed
        if i == 0 and j >= 1 and isinstance(v, str) and _needs_fix_star_after_digit(v):
            fixed = remove_star_after_digit(v)
            if fixed != v and fixed:
                # Update table label
                tables[k] = fixed
                remap.setdefault(t, {})[v] = fixed

    if not remap:
        data["tables"] = tables
        data["formulas"] = formulas
        return data

    # 2) Rewrite formula references that point to old labels -> new labels
    #    This ONLY touches occurrences inside table[ ... ] references.
    def _rewrite_refs(expr: str) -> str:
        if not isinstance(expr, str):
            return expr

        def _sub(m: re.Match) -> str:
            table = m.group('table')
            raw_label = m.group('label')
            # Unquote if needed for mapping lookup
            label_is_quoted = raw_label.startswith('"') and raw_label.endswith('"')
            label_unquoted = raw_label[1:-1] if label_is_quoted else raw_label

            new_label = remap.get(table, {}).get(label_unquoted)
            if not new_label:
                return m.group(0)  # no change

            # Preserve quoting rules on output
            out_label = _quote_or_unquote_label_for_ref(new_label)
            return f"{table}[{out_label}]"

        return _LABEL_REF_ANY_RE.sub(_sub, expr)

    for fk, fv in list(formulas.items()):
        if isinstance(fv, str):
            formulas[fk] = _rewrite_refs(fv)

    data["tables"] = tables
    data["formulas"] = formulas
    return data

# ---------- Prior results merge (non-destructive) ----------
def merge_with_previous(new_json: dict, prior_json: Optional[dict]) -> dict:
    """
    Non-destructive merge:
      - Keep 'new_json' as the source of truth.
      - For top-level maps (tables, formulas, annotations, units), copy any missing keys from prior_json.
    """
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

# ---------- Two-stage runner (now with optional prior context) ----------
def run_two_stage(
    user_prompt: str,
    model: str,
    grammar_text: str,
    *,
    temperature: float = 0.02,
    outdir: Optional[str] = None,
    previous_results: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    1) Expand the prompt (include summary of prior model if provided)
    2) Build JSON via scaffold
    3) Local hygiene + optional merge with previous results (non-destructive)
    """
    os.makedirs(outdir, exist_ok=True) if outdir else None
    
    works.msg ( f"Expanding scope...")

    expanded = expand_user_prompt(
        user_prompt, model=model, temperature=0.5, previous_results=previous_results
    )
        
    works.msg ( f"Building model...")

    first = getOpenAIModel(
        expanded,
        model=model,
        grammar_text=grammar_text,
        scaffold_model=model,
        temperature=0.04,
        return_all=True,
    )
    works.msg ( "Model complete")

    # Local post-processing before refine
    final_json = first.get("output", {}) or {}
    final_json = enforce_column_headers(final_json)
    final_json = sanitize_formulas_labels(final_json)                 # clean label tokens early
    final_json = validate_and_patch_references(final_json, default_value="0")
    final_json = enforce_units(final_json, default_unit="unitless")
    final_json = merge_with_previous(final_json, previous_results)
    final_json = normalize_labels_remove_star_after_digit(final_json)
    refined = final_json #refine_model_with_chat(final_json, model=model, temperature=0.01)
    refined = enforce_column_headers(refined)
    refined = sanitize_formulas_labels(refined)                       # clean again post-merge
    refined = validate_and_patch_references(refined, default_value="0")
    refined = enforce_units(refined, default_unit="unitless")
    refined = strip_whitespace_in_formulas(refined)
    refined = rewrite_formulas_to_named_refs(refined)
    refined = sanitize_formulas_labels(refined)                       # and once more after rewrite

    # If rewrite introduced new refs, they are patched above; optional extra synthesis step could go here.

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

# ---------- CLI ----------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Three-stage AssignLang builder with optional prior-results refinement."
    )
    p.add_argument("prompt", help="Natural language description.")
    p.add_argument("--model", default="gpt-4o-mini", help="Model ID (default: gpt-4o-mini)")
    p.add_argument("--out", dest="out_path", help="Path to write ONLY the final JSON output (default: stdout)")
    p.add_argument("--outdir", help="Directory to dump expanded prompt and full response bundle")
    p.add_argument("--grammar-file", help="Path to a grammar file to override the default", default=None)
    p.add_argument("--temperature", type=float, default=0.2, help="Sampling temperature")
    p.add_argument("--prev", dest="prev_input", help="Path to previous results JSON OR inline JSON text", default=None)
    return p

def _load_grammar(grammar_file: Optional[str]) -> str:
    if grammar_file:
        with open(grammar_file, "r", encoding="utf-8") as f:
            return f.read()
    return GRAMMAR

def _load_json_from_path_or_text(s: Optional[str]) -> Optional[dict]:
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    if s.startswith("{") or s.startswith("["):
        return json.loads(s)
    # treat as path
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

# ---------- Entrypoints ----------
def main_cli() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    grammar_text = _load_grammar(args.grammar_file)
    prior = _load_json_from_path_or_text(args.prev_input)

    if _HAS_ION:
        # If Ion is present but we're in CLI mode, still run CLI normally.
        pass

    try:
        bundle = run_two_stage(
            user_prompt=args.prompt,
            model=args.model,
            grammar_text=grammar_text,
            temperature=args.temperature,
            outdir=args.outdir,
            previous_results=prior,
        )
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    final_json = bundle.get("refined", {}) or {}
    text = json.dumps(final_json, ensure_ascii=False, indent=2)
    if args.out_path:
        with open(args.out_path, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        print(text)
    return 0

def _maybe_json_or_path(x: Any) -> Optional[dict]:
    if x is None:
        return None
    if isinstance(x, (dict, list)):
        return x
    s = str(x).strip()
    if not s:
        return None
    if s.startswith("{") or s.startswith("["):
        return json.loads(s)
    # else assume path
    with open(s, "r", encoding="utf-8") as f:
        return json.load(f)

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    """
    Ion entry:
      param(1): prompt (string)
      param(2): optional previous results (JSON string or path)
      param(3): optional model (default: gpt-4o-mini)
      param(4): optional temperature (float, default: 0.2)
    """
    try:
        user_prompt = works.param(1)
    except Exception as e:
        raise RuntimeError("Ion: param(1) required (prompt).") from e

    try:
        prior_param = works.param(2)
    except Exception:
        prior_param = None
    works.msg ( " Model loaded ")
    try:
        bundle = run_two_stage(
            user_prompt=str(user_prompt),
            model=default_model,
            grammar_text=GRAMMAR,
            temperature=0.3,
            outdir=None
        )
        final_json = bundle.get("refined", {}) or {}
        works.resolve(final_json)
        return 0
    except Exception as e:
        raise RuntimeError(f"Ion pipeline failed: {e}") from e


works.msg ( ' loading model ')
_main_ion('gpt-4o-mini')