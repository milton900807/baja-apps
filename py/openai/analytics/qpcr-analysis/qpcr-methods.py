#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works: header + sample-aware classifier for plate-like tables (with formulas)

- Input (param 1): a single "table" dict, either:
  A) Flat grid of cells: {"name": ..., "cols": N, "rows": M, "wells": [{x,y,value,field?}, ...]}
  B) 2-D wells array:   {"name": ..., "wells": [ [cell0, cell1, ...], [cell0, ...], ... ] }  # wells[cols][rows]
     where a cell is a dict (prefer .value) or a scalar.

Behavior:
- Extract headers from TOP ROW (y=0) across x.
- Build body rows (y>=1) and per-column distinct sample values (capped).
- Detect domain (qPCR, ELISA/OD, dose-response, std-curve, CRISPR, time-course, plate/generic).
- Propose next-step actions **with formulas** (string math/Excel-like / analysis pseudo-formulas).
- If OPENAI_API_KEY is set, ask GPT (headers+samples) for actions, then **attach local formulas** that match action names.

Output via ion.works.resolve():
{
  "status": "ok",
  "source": "chatgpt|local",
  "table_name": "...",
  "headers": [...],
  "samples": { "Header": [...] },
  "datatype": {
    "name": "...",
    "description": "...",
    "actions": [
      {"name":"...", "description":"...", "formulas": {"Label":"Formula", ...}},
      ...
    ]
  },
  "detected": { "notes": [...] }
}
"""

import json, os, re
from typing import Any, Dict, List, Tuple, Optional

from ion import works  # type: ignore

# --------------------- utils ---------------------

def _safe_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v)

def synth_headers(n: int) -> List[str]:
    return [f"Col{i+1}" for i in range(max(0, n))]

def _cell_value(cell: Any) -> str:
    """Prefer dict['value'] if present; else stringify."""
    if isinstance(cell, dict):
        if "value" in cell and cell["value"] not in (None, ""):
            return _safe_str(cell["value"]).strip()
        for k in ("name", "position", "label", "title"):
            v = cell.get(k)
            if v not in (None, ""):
                return _safe_str(v).strip()
        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("header", "title", "label"):
                v = props.get(k)
                if v not in (None, ""):
                    return _safe_str(v).strip()
        return ""
    return _safe_str(cell).strip()

# --------------------- extraction: headers + rows ---------------------

def _headers_from_flat_grid(table: Dict[str, Any]) -> Optional[List[str]]:
    wells = table.get("wells")
    if not (isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]):
        return None
    width = None
    if isinstance(table.get("cols"), int) and table["cols"] > 0:
        width = table["cols"]
    else:
        try:
            width = max(int(c.get("x", -1)) for c in wells) + 1
        except Exception:
            width = None
    if not width or width <= 0:
        return None
    by_xy: Dict[Tuple[int,int], Dict[str, Any]] = {}
    for c in wells:
        try:
            x = int(c.get("x")); y = int(c.get("y"))
        except Exception:
            continue
        if x < 0 or y < 0: continue
        by_xy[(x,y)] = c
    hdrs: List[str] = []
    for x in range(width):
        cell = by_xy.get((x, 0))
        hdrs.append(_cell_value(cell) if cell is not None else "")
    if not any((h or "").strip() for h in hdrs):
        return synth_headers(width)
    return [h if (h or "").strip() else f"Col{i+1}" for i, h in enumerate(hdrs)]

def _rows_from_flat_grid(table: Dict[str, Any], width: int) -> List[List[str]]:
    wells = table.get("wells") or []
    by_xy: Dict[Tuple[int,int], Dict[str, Any]] = {}
    max_y = -1
    for c in wells:
        try:
            x = int(c.get("x")); y = int(c.get("y"))
        except Exception:
            continue
        if x < 0 or y < 0: continue
        by_xy[(x,y)] = c
        if y > max_y: max_y = y
    rows: List[List[str]] = []
    for y in range(1, max_y + 1):
        row = []
        for x in range(width):
            cell = by_xy.get((x, y))
            row.append(_cell_value(cell) if cell is not None else "")
        if any(v.strip() for v in row):
            rows.append(row)
    return rows

def _headers_from_2d_wells(table: Dict[str, Any]) -> Optional[List[str]]:
    wells = table.get("wells")
    if not (isinstance(wells, list) and wells and isinstance(wells[0], list)):
        return None
    width = len(wells)
    height = max((len(col) for col in wells if isinstance(col, list)), default=0)
    if width <= 0 or height <= 0:
        return synth_headers(max(1, width)) if width else ["Col1"]
    headers: List[str] = []
    for x in range(width):
        col = wells[x] if x < len(wells) and isinstance(wells[x], list) else []
        top = col[0] if len(col) > 0 else None
        headers.append(_cell_value(top))
    if not any((h or "").strip() for h in headers):
        return synth_headers(width)
    return [h if (h or "").strip() else f"Col{i+1}" for i, h in enumerate(headers)]

def _rows_from_2d_wells(table: Dict[str, Any], width: int) -> List[List[str]]:
    wells = table.get("wells") or []
    height = max((len(col) for col in wells if isinstance(col, list)), default=0)
    rows: List[List[str]] = []
    for y in range(1, height):
        row = []
        for x in range(width):
            col = wells[x] if x < len(wells) and isinstance(wells[x], list) else []
            cell = col[y] if y < len(col) else None
            row.append(_cell_value(cell))
        if any(v.strip() for v in row):
            rows.append(row)
    return rows

def extract_headers_rows_and_name(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[str]]]:
    name = _safe_str(table.get("name") or "Untitled Table")
    headers = _headers_from_flat_grid(table)
    if headers is not None:
        width = len(headers)
        rows = _rows_from_flat_grid(table, width)
        return name, headers, rows
    headers = _headers_from_2d_wells(table)
    if headers is not None:
        width = len(headers)
        rows = _rows_from_2d_wells(table, width)
        return name, headers, rows
    return name, ["Col1"], []

# --------------------- sampling + type inference ---------------------

_NUM_RE = re.compile(r"""^[\s]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[\s]*$""")
_INT_RE = re.compile(r"""^[\s]*[+-]?\d+[\s]*$""")
_BOOL_TRUE = {"true","t","yes","y","1","on"}
_BOOL_FALSE = {"false","f","no","n","0","off"}
_DATE_LITE_RE = re.compile(r"""^\s*(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*$""")

def _infer_type(samples: List[str]) -> str:
    if not samples:
        return "text"
    vals = [s.strip() for s in samples if s.strip()]
    if vals and all(v.lower() in (_BOOL_TRUE | _BOOL_FALSE) for v in vals):
        return "bool"
    if vals and sum(1 for v in vals if _DATE_LITE_RE.match(v)) >= max(1, len(vals)//2):
        return "date"
    if vals and all(_NUM_RE.match(v) for v in vals):
        if all(_INT_RE.match(v) for v in vals):
            return "int"
        return "float"
    return "text"

def build_column_samples(headers: List[str], rows: List[List[str]], cap: int = 12) -> Dict[str, List[str]]:
    samples: Dict[str, List[str]] = {h: [] for h in headers}
    width = len(headers)
    for row in rows:
        for i in range(width):
            v = (row[i] if i < len(row) else "").strip()
            if v:
                lst = samples[headers[i]]
                if v not in lst:
                    lst.append(v)
    for h in headers:
        samples[h] = samples[h][:cap]
    return samples

# --------------------- domain detection helpers ---------------------

def _find_cols(headers: List[str], patterns: List[str]) -> List[str]:
    out = []
    lc = [h.lower() for h in headers]
    for i,h in enumerate(lc):
        if any(p in h for p in patterns):
            out.append(headers[i])
    return out

def _first_or(headers: List[str], patterns: List[str], default: Optional[str] = None) -> Optional[str]:
    cols = _find_cols(headers, patterns)
    return cols[0] if cols else default

def _num_cols(headers: List[str], samples: Dict[str, List[str]]) -> List[str]:
    return [h for h in headers if _infer_type(samples.get(h, [])) in {"int","float"}]

def _mk_action(name: str, description: str, formulas: Dict[str, str]) -> Dict[str, Any]:
    return {"name": name, "description": description, "formulas": formulas}

# --------------------- local action generator (DOMAIN-AWARE, WITH FORMULAS) ---------------------

def local_actions_with_formulas(headers: List[str], samples: Dict[str, List[str]]) -> Tuple[str, str, List[Dict[str,Any]], List[str]]:
    notes: List[str] = []
    headers_lc = [h.lower() for h in headers]

    # Common fields
    well_col     = _first_or(headers, ["well", "wellpos", "position"])
    sample_col   = _first_or(headers, ["sample", "specimen", "well id"])
    target_col   = _first_or(headers, ["target", "gene", "assay", "primer"])
    reporter_col = _first_or(headers, ["reporter", "fam", "vic", "sybr", "fluor"])
    cq_col       = _first_or(headers, ["cq", "ct"])
    amp_col      = _first_or(headers, ["amp", "ampstatus", "amplification"])
    thresh_col   = _first_or(headers, ["threshold"])
    base_start   = _first_or(headers, ["baselinestart"])
    base_end     = _first_or(headers, ["baselineend"])
    tm_col       = _first_or(headers, ["tm", "melt"])
    slope_col    = _first_or(headers, ["slope"])
    inter_col    = _first_or(headers, ["intercept"])
    rsq_col      = _first_or(headers, ["r^2", "rsquared", "r2", "r-squared"])
    conc_col     = _first_or(headers, ["conc", "concentration", "dose", "ng/µl", "ng/ul", "µm", "um", "nm"])
    od_col       = _first_or(headers, ["od", "abs", "absorbance", "450", "570", "600"])
    time_col     = _first_or(headers, ["time", "hour", "hrs", "min", "sec", "day"])
    group_col    = _first_or(headers, ["group", "condition", "treatment", "arm", "cohort", "control"])
    count_col    = _first_or(headers, ["count", "reads"])
    logfc_col    = _first_or(headers, ["log2fc", "logfc", "lfc"])

    numeric_cols = _num_cols(headers, samples)
    has_well = well_col is not None
    is_qpcr  = any(k in h for h in headers_lc for k in ["cq","ct","ampstatus","threshold","autothreshold","baseline"])
    is_elisa = od_col is not None and any(s in h for h in headers_lc for s in ["std","standard","conc","pg/ml","ng/ml"])
    is_dose  = conc_col is not None and any(s in h for h in headers_lc for s in ["response","inhibition","activity","viability"])
    has_std  = any(s in h for h in headers_lc for s in ["slope","intercept","r^2","rsquared","efficiency"]) or any("std" in h for h in headers_lc)
    is_timec = time_col is not None and any(s in h for h in headers_lc for s in ["response","conc","intensity","signal","viability"])
    is_crispr = (logfc_col is not None) or (count_col is not None and any(s in h for h in headers_lc for s in ["sgRNA","sgrna","guide","gRNA","grna"]))

    actions: List[Dict[str, Any]] = []

    # Always-useful actions (generic formulas)
    actions.append(_mk_action(
        "export_csv",
        "Export the table to CSV.",
        {"Export": "WRITE_CSV(Table)"}
    ))
    actions.append(_mk_action(
        "profile_columns",
        "Compute data profiles (type, completeness, unique counts).",
        {"Unique_Count": "NUNIQUES([Column])", "Missing_Count": "COUNTBLANK([Column])"}
    ))
    actions.append(_mk_action(
        "filter_rows",
        "Filter rows by keyword, ranges, or boolean conditions.",
        {"Filter": "FILTER(Table, Condition)"}
    ))

    # qPCR domain
    if is_qpcr:
        dt_name = "qpcr_results_table"
        desc = "qPCR/RT-qPCR results (Cq/Ct, AmpStatus, Threshold/Baseline, optional Reporter)."

        # Replicate collapse
        if cq_col and sample_col and target_col:
            actions.append(_mk_action(
                "replicate_collapse",
                "Average technical replicates by Sample × Target; compute Cq mean/SD and flag high SD.",
                {
                    "Cq_Mean": f"AVERAGE(GROUPBY({cq_col}, {sample_col}, {target_col}))",
                    "Cq_SD":   f"STDEV.S(GROUPBY({cq_col}, {sample_col}, {target_col}))",
                    "Flag_High_SD": "IF(Cq_SD>0.5,1,0)"
                }
            ))

        # ΔCt / ΔΔCt / FoldChange
        ref_gene = "REFERENCE_GENE"  # user-specified later; we expose formula structure
        control_sample = "CONTROL_SAMPLE"
        if cq_col and target_col and sample_col:
            actions.append(_mk_action(
                "delta_ct",
                "Compute ΔCt vs a selected reference gene (housekeeper).",
                {
                    "Cq_mean_target": f"AVERAGEIF({target_col}, Target, {cq_col})",
                    "Cq_mean_ref":    f"AVERAGEIF({target_col}, {ref_gene}, {cq_col})",
                    "Delta_Ct":       "Cq_mean_target - Cq_mean_ref"
                }
            ))
            actions.append(_mk_action(
                "delta_delta_ct",
                "Compute ΔΔCt vs. a control sample and fold change (2^-ΔΔCt).",
                {
                    "Delta_Ct_sample": "Delta_Ct",
                    "Delta_Ct_control": f"AVERAGEIF({sample_col}, {control_sample}, Delta_Ct)",
                    "Delta_Delta_Ct": "Delta_Ct_sample - Delta_Ct_control",
                    "Fold_Change": "POWER(2, -Delta_Delta_Ct)"
                }
            ))

        # qPCR QC
        if cq_col:
            actions.append(_mk_action(
                "qpcr_qc",
                "Plot Cq distribution, check non-amplified wells and threshold/baseline settings.",
                {
                    "NonAmp_Flag": f"IF(OR(ISBLANK({cq_col}), {cq_col}<=0),1,0)",
                    "Threshold_OK": f"IF(NOT(ISBLANK({thresh_col or 'Threshold'})),1,0)"
                }
            ))

        if has_well and cq_col:
            actions.append(_mk_action(
                "plate_heatmap",
                "Visualize Cq across wells to detect edge effects.",
                {"Heatmap": f"PLOT_HEATMAP({well_col}, {cq_col})"}
            ))

        if slope_col and inter_col and rsq_col:
            actions.append(_mk_action(
                "std_curve_evaluation",
                "Evaluate slope, intercept and R²; estimate PCR efficiency.",
                {
                    "PCR_Efficiency_%": "100*(POWER(10, -1/Slope) - 1)",
                    "Backcalc_Cq": f"Slope*Log10(Copies) + {inter_col}",
                    "R2_Check": f"{rsq_col}"
                }
            ))

    # ELISA / Absorbance domain
    elif is_elisa and od_col:
        dt_name = "elisa_table"
        desc = "ELISA/absorbance assay with standards and unknowns."

        actions.append(_mk_action(
            "blank_subtraction",
            "Apply blank subtraction to OD.",
            {"OD_Corr": f"{od_col} - AVERAGEIF(SampleType, 'Blank', {od_col})"}
        ))
        actions.append(_mk_action(
            "standard_curve_4pl",
            "Fit 4-parameter logistic (4PL) to standards; compute unknown concentrations.",
            {
                "Fit_4PL": "PARAMS = 4PL_FIT(ConcStd, OD_Corr_Std)",  # returns Top, Bottom, Hill, IC50
                "Conc_Unknown": "4PL_INVERT(OD_Corr, PARAMS)"
            }
        ))
        actions.append(_mk_action(
            "replicate_aggregation",
            "Aggregate technical replicates per Sample; compute mean/SD/CV%.",
            {
                "Mean_OD": f"AVERAGE(GROUPBY({od_col}, Sample))",
                "SD_OD":   f"STDEV.S(GROUPBY({od_col}, Sample))",
                "CV_%":    "100*SD_OD/Mean_OD"
            }
        ))
        actions.append(_mk_action(
            "backcalc_qc",
            "Back-calculate standards and flag those out of tolerance.",
            {"Backcalc_Std": "4PL_PRED(ConcStd, PARAMS)", "Flag": "IF(ABS(Backcalc_Std-OD_Corr_Std)>Tol,1,0)"}
        ))

    # Dose–response
    elif is_dose and conc_col:
        dt_name = "dose_response_table"
        desc = "Dose–response / IC50/EC50 estimation."

        resp_col = _first_or(headers, ["response","viability","inhibition","activity","signal"], default="Response")

        actions.append(_mk_action(
            "log_transform_conc",
            "Log10 transform concentrations (handle zeros with offset).",
            {"Log10Conc": f"LOG10({conc_col} + 1e-12)"}
        ))
        actions.append(_mk_action(
            "fit_4pl_ic50",
            "Fit 4-parameter logistic curve to get IC50/EC50.",
            {"IC50": f"4PL_FIT({conc_col}, {resp_col}).IC50"}
        ))
        if group_col:
            actions.append(_mk_action(
                "normalize_to_control",
                "Normalize responses by a control group.",
                {"Resp_%Control": f"100*{resp_col}/AVERAGEIF({group_col}, 'Control', {resp_col})"}
            ))
            actions.append(_mk_action(
                "compare_groups",
                "Compare IC50/EC50 across groups.",
                {"Delta_IC50": "IC50(GroupA) - IC50(GroupB)"}
            ))

    # Standard curve (generic)
    elif has_std and (slope_col or inter_col):
        dt_name = "standard_curve_table"
        desc = "Standard/calibration curve detected."

        x_col = _first_or(headers, ["x","conc","concentration","std_x"], default="X")
        y_col = _first_or(headers, ["y","signal","od","abs","raw","std_y"], default="Y")
        actions.append(_mk_action(
            "refit_linear",
            "Refit linear calibration; compute R² and residuals.",
            {
                "Slope": f"SLOPE({y_col}, {x_col})",
                "Intercept": f"INTERCEPT({y_col}, {x_col})",
                "R2": f"RSQ({y_col}, {x_col})",
                "Residual": f"{y_col} - (Slope*{x_col}+Intercept)"
            }
        ))
        actions.append(_mk_action(
            "apply_calibration",
            "Convert raw signal to concentration for unknowns.",
            {"Calc_X": f"({y_col} - Intercept)/Slope"}
        ))
        actions.append(_mk_action(
            "backcalculation_qc",
            "Back-calculate standards; flag out-of-tolerance.",
            {"Backcalc_Y": "Slope*Std_X + Intercept", "Flag": "IF(ABS(Backcalc_Y-Std_Y)>Tol,1,0)"}
        ))

    # CRISPR pooled screens
    elif is_crispr:
        dt_name = "crispr_screen_table"
        desc = "CRISPR pooled screen with counts/log2FC."

        treat_col = _first_or(headers, ["treated","treatment","post"], default="Treated_Count")
        ctrl_col  = _first_or(headers, ["control","baseline","pre"], default="Control_Count")
        actions.append(_mk_action(
            "count_normalization",
            "Normalize counts to CPM/median-ratio across libraries.",
            {"CPM": f"1e6*{count_col or 'Count'}/SUM({count_col or 'Count'})"}
        ))
        actions.append(_mk_action(
            "log2_fc",
            "Compute log2 fold-change vs control.",
            {"log2FC": f"LOG2(({treat_col}+1)/({ctrl_col}+1))"}
        ))
        actions.append(_mk_action(
            "hit_calling",
            "Rank guides/genes by enrichment/depletion; multiple testing correction.",
            {"Rank": "RANK(-ABS(log2FC))", "AdjP": "BH_FDR(Pvalue)"}
        ))

    # Time-course
    elif is_timec and time_col:
        dt_name = "time_course_table"
        desc = "Time-course with responses over time."

        resp_col = _first_or(headers, ["response","signal","intensity","viability","value"], default="Response")
        actions.append(_mk_action(
            "align_timepoints",
            "Align/round timepoints to common bins.",
            {"Time_Bin": f"ROUND({time_col}, BinSize)"}
        ))
        actions.append(_mk_action(
            "trend_plots",
            "Plot response over time by group/condition.",
            {"Trend": f"SLOPE({resp_col}, {time_col})"}
        ))
        actions.append(_mk_action(
            "area_under_curve",
            "Compute AUC for each group.",
            {"AUC": f"TRAPZ({time_col}, {resp_col})"}
        ))

    # Plate measurements
    elif has_well and numeric_cols:
        dt_name = "plate_measurements"
        desc = "Per-well numeric measurements on a plate."

        actions.append(_mk_action(
            "plate_heatmap",
            "Visualize numeric metric across the plate to detect edge effects.",
            {"Heatmap": f"PLOT_HEATMAP({well_col}, {numeric_cols[0]})"}
        ))
        if group_col:
            actions.append(_mk_action(
                "group_summary",
                "Summarize measurements by group/condition.",
                {"Mean": f"AVERAGEIF({group_col}, Group, {numeric_cols[0]})", "SD": f"STDEV.SIF({group_col}, Group, {numeric_cols[0]})"}
            ))
        actions.append(_mk_action(
            "baseline_correction",
            "Subtract background/blank wells or normalize to control.",
            {"Corrected": f"{numeric_cols[0]} - AVERAGEIF(SampleType, 'Blank', {numeric_cols[0]})"}
        ))

    # Generic
    else:
        dt_name = "generic_table"
        desc = "General-purpose table inferred from headers and sample values."
        # Add a couple of numeric/categorical defaults
        num = numeric_cols[:1]
        if num:
            actions.append(_mk_action(
                "summary_stats",
                "Compute mean, median, stdev for numeric columns.",
                {"Mean": f"AVERAGE({num[0]})", "Median": f"MEDIAN({num[0]})", "StDev": f"STDEV.S({num[0]})"}
            ))
        cat = [h for h in headers if _infer_type(samples.get(h, [])) == "text"]
        if cat:
            actions.append(_mk_action(
                "category_counts",
                "Frequency table for a likely categorical column.",
                {"Counts": f"FREQ_TABLE({cat[0]})"}
            ))

    # Cap & return
    actions = actions[:16]
    return dt_name, desc, actions, notes

# --------------------- GPT driver (headers + samples) ---------------------

def _extract_json(s: str) -> Dict[str, Any]:
    s = (s or "").strip()
    if not s:
        return {}
    if s.startswith("```"):
        s = "\n".join(s.splitlines()[1:])
    if s.endswith("```"):
        s = "\n".join(s.splitlines()[:-1])
    try:
        return json.loads(s)
    except Exception:
        pass
    start = s.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(s)):
            ch = s[i]
            if ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    cand = s[start:i+1]
                    try:
                        return json.loads(cand)
                    except Exception:
                        break
        start = s.find("{", start+1)
    return {}

def _enrich_actions_with_formulas(gpt_actions: List[Dict[str, Any]], local_actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Merge local formulas into GPT actions by fuzzy name matching.
    If GPT already has 'formulas', keep them; else attach from the closest local action.
    """
    out: List[Dict[str, Any]] = []
    def _norm(s: str) -> str:
        return re.sub(r"[^a-z0-9]+","", s.lower())
    local_map = {_norm(a.get("name","")): a for a in local_actions}
    for a in (gpt_actions or []):
        name = a.get("name") or a.get("title") or a.get("action") or ""
        key = _norm(name)
        enriched = dict(a)
        if "formulas" not in enriched or not isinstance(enriched["formulas"], dict) or not enriched["formulas"]:
            if key in local_map and isinstance(local_map[key].get("formulas"), dict):
                enriched["formulas"] = local_map[key]["formulas"]
        out.append(enriched)
    return out

def classify_with_gpt(headers: List[str], samples: Dict[str, List[str]], table_name: str, model: str = "gpt-4o-mini") -> Dict[str, Any]:
    # Always compute local domain + formulas first (used for fallback and enrichment)
    l_dt, l_desc, l_actions, l_notes = local_actions_with_formulas(headers, samples)

    if not os.getenv("OPENAI_API_KEY"):
        return {
            "status":"ok","source":"local",
            "table_name":table_name,"headers":headers,"samples":samples,
            "datatype":{"name":l_dt,"description":l_desc,"actions":l_actions},
            "detected":{"notes":l_notes}
        }

    system = (
        "You receive ONLY column headers and a few distinct sample values per column.\n"
        "Infer the specific scientific/analytical datatype (e.g., qPCR, ELISA, dose-response, CRISPR screen, standard curve) "
        "and propose concrete next actions. Return STRICT JSON: "
        "{\"datatype\": {\"name\": slug, \"description\": \"<=2 sentences\", "
        "\"actions\": [{\"name\": string, \"description\": string}]}, "
        "\"detected\": {\"notes\": []}}"
    )
    user_payload = {"table_name": table_name, "headers": headers, "samples": samples}

    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI()
        raw = ""
        try:
            r = client.responses.create(
                model=model,
                temperature=0.0,
                response_format={"type": "json_object"},
                input=[
                    {"role":"system","content":system},
                    {"role":"user","content":json.dumps(user_payload, ensure_ascii=False)},
                ],
            )
            raw = getattr(r, "output_text", "") or ""
        except Exception:
            resp = client.chat.completions.create(
                model=model,
                temperature=0.0,
                response_format={"type": "json_object"},
                messages=[
                    {"role":"system","content":system},
                    {"role":"user","content":json.dumps(user_payload, ensure_ascii=False)},
                ],
            )
            raw = (resp.choices[0].message.content or "").strip()

        data = _extract_json(raw) or {}
        dt = data.get("datatype", {}) if isinstance(data.get("datatype", {}), dict) else {}
        name = _safe_str(dt.get("name") or dt.get("datatype_name") or dt.get("type") or "").strip()
        desc = _safe_str(dt.get("description") or "").strip()
        acts = dt.get("actions") or []
        gpt_actions: List[Dict[str, Any]] = []
        if isinstance(acts, list):
            for a in acts[:16]:
                if isinstance(a, str) and a.strip():
                    gpt_actions.append({"name": a.strip(), "description": ""})
                elif isinstance(a, dict):
                    nm = _safe_str(a.get("name") or a.get("title") or a.get("action") or "").strip()
                    ds = _safe_str(a.get("description") or a.get("desc") or "").strip()
                    if nm:
                        gpt_actions.append({"name": nm, "description": ds})

        # Enrich GPT actions with local formulas
        enriched_actions = _enrich_actions_with_formulas(gpt_actions, l_actions)

        if not name:
            # Fall back to local, but prefer any GPT actions (now enriched)
            return {
                "status":"ok","source":"local",
                "table_name":table_name,"headers":headers,"samples":samples,
                "datatype":{"name":l_dt,"description":l_desc,"actions":(enriched_actions or l_actions)},
                "detected":{"notes":l_notes + (["GPT response missing datatype.name"] if not enriched_actions else [])}
            }

        notes = []
        if isinstance(data.get("detected"), dict) and isinstance(data["detected"].get("notes"), list):
            notes = [str(x) for x in data["detected"]["notes"]]

        return {
            "status":"ok","source":"chatgpt",
            "table_name":table_name,"headers":headers,"samples":samples,
            "datatype":{"name":name,"description":(desc or "Inferred from headers and sample values."),"actions":enriched_actions},
            "detected":{"notes":notes}
        }
    except Exception as e:
        # Local fallback
        l_notes.append(f"Fallback from ChatGPT due to: {e}")
        return {
            "status":"ok","source":"local",
            "table_name":table_name,"headers":headers,"samples":samples,
            "datatype":{"name":l_dt,"description":l_desc,"actions":l_actions},
            "detected":{"notes":l_notes}
        }

# --------------------- main ---------------------

def main() -> int:
    try:
        table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: table (dict/json)"})
        return 1

    if isinstance(table, str):
        try:
            table = json.loads(table)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 is not valid JSON: {e}"})
            return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a table dict or JSON string of one."})
        return 1

    table_name, headers, rows = extract_headers_rows_and_name(table)

    if not headers:
        width = None
        if isinstance(table.get("cols"), int) and table["cols"] > 0:
            width = table["cols"]
        elif isinstance(table.get("wells"), list) and table["wells"]:
            width = len(table["wells"]) if isinstance(table["wells"][0], list) else None
        headers = synth_headers(width or 1)

    samples = build_column_samples(headers, rows, cap=12)

    model = "gpt-4o-mini"
    result = classify_with_gpt(headers, samples, table_name, model=model)

    result["table_name"] = table_name
    result["headers"] = headers
    result["samples"] = samples

    works.resolve(result)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
