#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works: header + sample-aware classifier for plate-like tables (domain-aware + option selection)

What's new in this version
--------------------------
- Adds a **fine-grained datatype slug** with the following canonical values where applicable:
  - "qpcr_cq" — Cq/Ct-style qPCR results.
  - "qpcr_quantity" — qPCR tables reporting quantities (e.g., copies/µL, ng, quantities derived from std curve).
  - "dose_response" — raw dose–response tables (concentration + response/viability/activity), not yet fitted.
  - "ic50" — fitted results tables (per-sample IC50/EC50 or curve params present) or an output sheet containing IC50/EC50.
  - "elisa" — OD/Absorbance + standards present (kept from prior version).
  - "time_course" — time-series plates (kept from prior version).
  - "plate_measurements" — generic plate with numeric signals.
  - "ribogreen" — RiboGreen (or similar fluorescence-based RNA quantification) plates with standards and unknowns.  # RIBOGREEN
  - "generic_table" / "general_table" — fallback cases.
  - "unknown" — explicit when no confident match can be made.
- Classifier now inspects both **headers** and **sample values** for stronger signals (e.g., "copies/µL", "logIC50").
- Returns the fine-grained slug in `datatype.name` and preserves a readable `datatype.description` + suggested actions.

Input:
  param(1): a single "table" dict, either:
    A) Flat grid: {"name": ..., "cols": N, "rows": M, "wells": [{x,y,value,field?}, ...]}
    B) 2-D wells: {"name": ..., "wells": [ [cell0, cell1, ...], [cell0, ...], ... ] }  # wells[cols][rows]
  param(2): (optional) list of candidate strings (Python list or JSON string). The tool will pick the most appropriate option
            and provide a ranking based on headers/samples/domain context.

Output via ion.works.resolve():
{
  "status": "ok",
  "source": "chatgpt|local",
  "table_name": "...",
  "headers": [...],
  "samples": { "HeaderA": [...], ... },
  "datatype": { "name": "<slug>", "description": "...", "actions": [{name, description}] },
  "selection": { "chosen": "<option or None>", "ranking": ["...", "..."] },
  "detected": { "notes": [...] }
}
"""

import json, os, re, math
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

def _normalize_options_param(raw: Any) -> List[str]:
    """Accept Python list or JSON string; return list[str]."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw if str(x).strip()]
    if isinstance(raw, str):
        s = raw.strip()
        try:
            if s.startswith("["):
                arr = json.loads(s)
                if isinstance(arr, list):
                    return [str(x) for x in arr if str(x).strip()]
        except Exception:
            # fallback: comma-separated
            return [p.strip() for p in s.split(",") if p.strip()]
    return []

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

COPIES_TOKENS = {
    "copies/ul","copies/µl","copies per ul","copies per µl","copies","copy number","copy#","cn","ge/ul","gc/ul",
    "ng/ul","ng/µl","fg/ul","pg/ul","pg/ml","ng/ml","ug/ml","µg/ml","mass","quantity","amount"
}

IC50_TOKENS = {"ic50","ec50","logic50","logec50","hill","hillslope","bottom","top","base","slope"}

RESPONSE_TOKENS = {"response","inhibition","activity","viability","signal","rfu","rlu","abs","od"}

CONC_TOKENS = {"conc","concentration","dose","molar","nm","um","µm","mm","pm","ng/ml","ug/ml","µg/ml"}

TIME_TOKENS = {"time","hour","hrs","min","sec","day"}

# RIBOGREEN: header/value token sets
RIBOGREEN_HEADER_TOKENS = {
    "ribogreen", "ribo green", "quant-it", "quant it", "quanti-t", "quanti it",
    "rna hs", "rna assay", "rna quant", "rna quantitation", "rna quantity",
    "picogreen", "pico green"
}

RIBOGREEN_VALUE_TOKENS = {
    "rfu", "fluor", "fluorescence", "fluorescence units", "fluorescent units"
}

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
    for i, h in enumerate(lc):
        if any(p in h for p in patterns):
            out.append(headers[i])
    return out

def _any_in(headers_lc: List[str], substrings: List[str]) -> bool:
    return any(any(sub in h for sub in substrings) for h in headers_lc)

# --------------------- fine-grained classifier + action generator ---------------------

class Detected:
    def __init__(self):
        self.notes: List[str] = []
    def add(self, msg: str):
        self.notes.append(msg)

def _looks_like_qpcr_quantity(headers: List[str], samples: Dict[str, List[str]]) -> bool:
    hl = [h.lower() for h in headers]
    has_quantity_hdr = any(
        any(tok in h for tok in ["quantity","qty","copies","copy number","copy#","cn","ng/", "pg/", "fg/", "ge/", "gc/"]) for h in hl
    )
    if has_quantity_hdr:
        return True
    # sample sniffing
    for col, vals in samples.items():
        cl = col.lower()
        if any(tok in cl for tok in ["quantity","copies","copy number","ng/","pg/","fg/","ge/","gc/"]):
            return True
        for v in vals:
            vl = v.lower()
            if any(tok in vl for tok in COPIES_TOKENS):
                return True
    return False

def _looks_like_ic50(headers: List[str], samples: Dict[str, List[str]]) -> bool:
    hl = [h.lower() for h in headers]
    if any(any(tok in h for tok in IC50_TOKENS) for h in hl):
        return True
    for col, vals in samples.items():
        cl = col.lower()
        if any(tok in cl for tok in IC50_TOKENS):
            return True
        for v in vals:
            if any(tok in v.lower() for tok in IC50_TOKENS):
                return True
    return False

def _looks_like_dose_response(headers: List[str], samples: Dict[str, List[str]]) -> bool:
    hl = [h.lower() for h in headers]
    has_conc = any(any(tok in h for tok in CONC_TOKENS) for h in hl)
    has_resp = any(any(tok in h for tok in RESPONSE_TOKENS) for h in hl)
    if has_conc and has_resp:
        return True
    # sample sniffing (units in values)
    if has_conc and not has_resp:
        for col, vals in samples.items():
            if col.lower() in hl:
                continue
            for v in vals:
                if _NUM_RE.match(v) and any(u in v.lower() for u in ["%", "fraction", "viability", "inhibition"]):
                    return True
    return False

# RIBOGREEN detector
def _looks_like_ribogreen(headers: List[str], samples: Dict[str, List[str]]) -> bool:
    hl = [h.lower() for h in headers]

    # Direct header hits (strongest signal)
    if any(any(tok in h for tok in RIBOGREEN_HEADER_TOKENS) for h in hl):
        return True

    # RNA + fluorescence / RFU style headers
    has_rna = any("rna" in h for h in hl)
    has_fluor_hdr = any(
        any(tok in h for tok in ["rfu", "fluor", "fluorescence"]) for h in hl
    )
    if has_rna and has_fluor_hdr:
        return True

    # Sample sniffing: look for RiboGreen-ish tokens in column names or values
    for col, vals in samples.items():
        cl = col.lower()
        if any(tok in cl for tok in RIBOGREEN_HEADER_TOKENS):
            return True
        if has_rna and any(tok in cl for tok in RIBOGREEN_VALUE_TOKENS):
            return True
        for v in vals:
            vl = v.lower()
            if any(tok in vl for tok in RIBOGREEN_VALUE_TOKENS):
                return True

    return False

def local_actions(headers: List[str], samples: Dict[str, List[str]]) -> Tuple[str, str, List[Dict[str,str]], List[str]]:
    notes: List[str] = []
    detected = Detected()
    headers_lc = [h.lower() for h in headers]
    types: Dict[str, str] = {h: _infer_type(samples.get(h, [])) for h in headers}

    # Common field groups
    well_cols     = _find_cols(headers, ["well", "wellpos", "position"])
    reporter_cols = _find_cols(headers, ["reporter", "fam", "vic", "sybr", "fluor"])
    cq_cols       = _find_cols(headers, ["cq", "ct"])  # Ct == Cq
    amp_cols      = _find_cols(headers, ["amp", "ampstatus", "amplification"])
    thresh_cols   = _find_cols(headers, ["threshold", "autothreshold"])
    baseline_cols = _find_cols(headers, ["baseline", "autobaseline", "baselinestart", "baselineend"])
    tm_cols       = _find_cols(headers, ["tm", "melt"])
    stdcurve_cols = _find_cols(headers, ["slope", "intercept", "r^2", "rsquared", "efficiency"])
    conc_cols     = _find_cols(headers, ["conc", "concentration", "dose", "ng/µl", "ng/ul", "molar", "µm", "um", "nm", "mm", "pm"])  # units too
    od_cols       = _find_cols(headers, ["od", "abs", "absorbance", "450", "570", "600"])
    time_cols     = _find_cols(headers, ["time", "hour", "hrs", "min", "sec", "day"])
    group_cols    = _find_cols(headers, ["group", "condition", "treatment", "arm", "cohort", "control"])

    # Domain flags (coarse)
    has_well = bool(well_cols)
    is_qpcr_like  = bool(cq_cols or amp_cols or thresh_cols or reporter_cols or baseline_cols)
    has_std_curve = bool(stdcurve_cols) or _any_in(headers_lc, ["std", "standard", "calibrator"])
    is_elisa = bool(od_cols) and _any_in(headers_lc, ["std", "standard", "concentration", "pg/ml", "ng/ml"])
    is_dose_response = _looks_like_dose_response(headers, samples)
    is_ic50 = _looks_like_ic50(headers, samples)
    is_qpcr_quantity = _looks_like_qpcr_quantity(headers, samples)
    is_time_course = bool(time_cols) and _any_in(headers_lc, ["response", "conc", "intensity", "signal", "viability"]) \
                     or (bool(time_cols) and any(types.get(h) in {"int","float"} for h in headers))

    numeric_cols = [h for h, t in types.items() if t in {"int","float"}]
    is_plate_measure = has_well and bool(numeric_cols)

    # RiboGreen / RNA quant plates
    is_ribogreen = _looks_like_ribogreen(headers, samples)

    # Fine-grained decision tree for slug
    dt_name = "unknown"
    desc = "Type could not be confidently determined."
    actions: List[Dict[str,str]] = [
        {"name":"export_csv","description":"Export the table to CSV."},
        {"name":"profile_columns","description":"Compute data profiles (type, completeness, unique counts) per column."},
        {"name":"filter_rows","description":"Filter rows by keyword, ranges, or boolean conditions."},
    ]

    if is_qpcr_like and cq_cols:
        dt_name = "qpcr_cq"
        desc = "qPCR/RT-qPCR Cq/Ct results (may include AmpStatus, Threshold/Baseline, Reporter)."
        actions += [
            {"name":"qpcr_qc","description":"Plot Cq/Ct distributions and inspect AmpStatus/threshold/baseline."},
            {"name":"replicate_collapse","description":"Average technical replicates by Sample × Target; compute Cq mean/SD."},
            {"name":"delta_ct","description":"Compute ΔCt vs. reference gene."},
            {"name":"delta_delta_ct","description":"Compute ΔΔCt and fold change (2^-ΔΔCt) vs. control."},
        ]
        if has_std_curve:
            actions.append({"name":"std_curve_evaluation","description":"Evaluate slope, intercept, R²; estimate PCR efficiency."})
        if reporter_cols:
            actions.append({"name":"channel_qc","description":"Per-reporter QC and channel comparisons."})
        if tm_cols:
            actions.append({"name":"melt_curve_checks","description":"Inspect Tm to detect nonspecific products/primer dimers."})
        if has_well:
            actions.append({"name":"plate_heatmap","description":"Visualize Cq across wells; spot edge effects."})

    elif is_qpcr_like and is_qpcr_quantity:
        dt_name = "qpcr_quantity"
        desc = "qPCR quantities (e.g., copies/µL, ng/µL) likely derived via a standard curve."
        actions += [
            {"name":"replicate_aggregation","description":"Aggregate technical replicates; compute mean/SD/CV%."},
            {"name":"normalize_to_control","description":"Normalize quantities to control or per µg RNA."},
            {"name":"log_transform","description":"Log10 transform quantities if skewed."},
        ]
        if has_std_curve:
            actions.append({"name":"backcalculation_qc","description":"Back-calc standards; flag out-of-tolerance points."})
        if has_well:
            actions.append({"name":"plate_heatmap","description":"Visualize quantities across wells."})

    elif is_ribogreen:
        dt_name = "ribogreen"
        desc = "RiboGreen (or similar fluorescence-based RNA quantification) plate with standards and unknowns."
        actions += [
            {"name": "blank_subtraction", "description": "Subtract buffer/blank wells from raw fluorescence values."},
            {"name": "standard_curve_ribogreen", "description": "Fit a standard curve (typically linear in log space) to RNA standards."},
            {"name": "backcalculate_unknowns", "description": "Convert fluorescence values for unknown wells to RNA concentration (e.g., ng/µL)."},
            {"name": "replicate_aggregation", "description": "Aggregate replicate wells per sample; compute mean/SD/CV%."},
            {"name": "plate_heatmap", "description": "Visualize fluorescence across wells to detect edge effects or pipetting issues."},
            {"name": "flag_outliers", "description": "Flag standards or unknowns deviating strongly from curve residuals."},
        ]

    elif is_elisa:
        dt_name = "elisa"
        desc = "ELISA/absorbance assay based on OD/Abs columns and standards/concentrations."
        actions += [
            {"name":"blank_subtraction","description":"Subtract blank OD/Abs."},
            {"name":"standard_curve_4pl","description":"Fit 4PL to standards; compute unknown concentrations."},
            {"name":"replicate_aggregation","description":"Aggregate replicates; compute mean/SD/CV%."},
            {"name":"lod_loq_estimation","description":"Estimate LOD/LOQ based on blanks and residuals."},
            {"name":"plate_layout_qc","description":"Heatmap of OD across wells; flag artifacts."},
        ]

    elif is_ic50:
        dt_name = "ic50"
        desc = "Fitted dose–response results (IC50/EC50 or curve parameters present)."
        actions += [
            {"name":"compare_groups","description":"Compare IC50/EC50 across groups with CIs."},
            {"name":"forest_plot","description":"Visualize IC50/EC50 estimates with confidence intervals."},
            {"name":"residual_diagnostics","description":"If raw data are present, inspect residuals/outliers against 4PL fit."},
        ]

    elif is_dose_response:
        dt_name = "dose_response"
        desc = "Dose–response data detected from concentration and response/viability fields (raw, not yet fitted)."
        actions += [
            {"name":"log_transform_conc","description":"Log10 transform concentrations."},
            {"name":"fit_4pl_ic50","description":"Fit 4PL to estimate IC50/EC50 with CIs."},
            {"name":"normalize_to_control","description":"Normalize responses to a control group."},
            {"name":"compare_groups","description":"Compare IC50/EC50 or top/bottom asymptotes across groups."},
            {"name":"residual_diagnostics","description":"Inspect residuals and outliers."},
        ]

    elif has_std_curve:
        dt_name = "standard_curve_table"
        desc = "Standard/calibration curve present (slope/intercept/R²/efficiency)."
        actions += [
            {"name":"refit_linear","description":"Refit linear calibration; compute R² and residuals."},
            {"name":"apply_calibration","description":"Convert raw signal to concentration for unknowns."},
            {"name":"backcalculation_qc","description":"Back-calc standards and flag out-of-tolerance."},
        ]

    elif is_time_course:
        dt_name = "time_course"
        desc = "Time-course data detected from time fields and response/measurement columns."
        actions += [
            {"name":"align_timepoints","description":"Align/round timepoints to common bins."},
            {"name":"trend_plots","description":"Plot response over time by group/condition; compute AUC."},
            {"name":"model_fit","description":"Fit basic kinetic models (rise/decay)."},
        ]

    elif is_plate_measure:
        dt_name = "plate_measurements"
        desc = "Plate-style table with per-well numeric measurements and descriptors."
        actions += [
            {"name":"plate_heatmap","description":"Visualize per-well numeric metrics; detect edge effects."},
            {"name":"group_summary","description":"Summarize by group/condition; mean/SD and ANOVA."},
            {"name":"baseline_correction","description":"Subtract background/blank or normalize to control."},
        ]

    else:
        # generic fallbacks
        if numeric_cols:
            dt_name = "generic_table"
            desc = "General-purpose numeric table inferred from headers and sample values."
            actions += [
                {"name":"summary_stats","description":"Per-column stats and missingness."},
                {"name":"category_counts","description":"Frequency tables for categorical columns."},
                {"name":"outlier_detection","description":"Flag row outliers using robust z-scores/IQR."},
            ]
        else:
            dt_name = "unknown"
            desc = "Type could not be confidently determined."
            actions += [
                {"name":"summary_stats","description":"Per-column stats and missingness."},
                {"name":"category_counts","description":"Frequency tables for categorical columns."},
            ]

    actions = actions[:16]
    return dt_name, desc, actions, notes + detected.notes

# --------------------- selection (local fallback) ---------------------

def _tokenize(s: str) -> List[str]:
    s = (s or "").lower()
    return re.findall(r"[a-z0-9\+\-]+", s)

def _score_option_against_context(option: str, headers: List[str], samples: Dict[str, List[str]], dt_name: str) -> float:
    """Heuristic score: token overlap with headers/samples, plus domain boosts."""
    if not option:
        return -1e9
    toks = set(_tokenize(option))
    if not toks:
        return -1e9

    # Build a context bag
    bag = []
    for h in headers:
        bag += _tokenize(h)
    for col, vals in samples.items():
        bag += _tokenize(col)
        for v in vals[:8]:
            bag += _tokenize(v)
    bag += _tokenize(dt_name)
    bagset = set(bag)

    overlap = len(toks & bagset)
    jaccard = overlap / max(1, len(toks | bagset))
    len_boost = math.log1p(len(bagset))
    base = overlap + 2.0 * jaccard * len_boost

    # Domain boosts
    o = option.lower()
    if ("qpcr" in o or "ct" in o or "gene expr" in o) and ("qpcr" in dt_name or "gene" in dt_name):
        base += 3.0
    if ("elisa" in o or "od" in o or "4pl" in o) and ("elisa" in dt_name):
        base += 3.0
    if ("dose" in o or "ic50" in o or "ec50" in o) and ("dose_response" in dt_name or "ic50" in dt_name):
        base += 3.0
    if ("standard" in o or "calibration" in o) and ("standard_curve" in dt_name):
        base += 2.5
    if ("plate" in o) and ("plate" in dt_name):
        base += 2.0
    if ("time" in o or "kinetic" in o or "pk" in o or "pd" in o) and ("time_course" in dt_name):
        base += 2.5
    if ("ribogreen" in o or "rna quant" in o or "rna quantity" in o) and ("ribogreen" in dt_name):  # RIBOGREEN boost
        base += 3.0

    return base

def local_select_option(options: List[str], headers: List[str], samples: Dict[str, List[str]], dt_name: str) -> Tuple[Optional[str], List[str]]:
    if not options:
        return None, []
    scored = [(opt, _score_option_against_context(opt, headers, samples, dt_name)) for opt in options]
    ranked = [opt for opt, _ in sorted(scored, key=lambda x: x[1], reverse=True)]
    chosen = ranked[0] if ranked else None
    return chosen, ranked

# --------------------- GPT driver (headers + samples + options) ---------------------

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

def classify_with_gpt(headers: List[str], samples: Dict[str, List[str]], table_name: str, options: List[str], model: str = "gpt-4o-mini") -> Dict[str, Any]:
    # First compute local domain/actions for fallback and for local selection
    l_dt, l_desc, l_actions, l_notes = local_actions(headers, samples)
    # Local selection (always available)
    local_choice, local_ranking = local_select_option(options, headers, samples, l_dt)

    if not os.getenv("OPENAI_API_KEY"):
        return {
            "status":"ok","source":"local",
            "table_name":table_name,"headers":headers,"samples":samples,
            "datatype":{"name":l_dt,"description":l_desc,"actions":l_actions},
            "selection":{"chosen": local_choice, "ranking": local_ranking},
            "detected":{"notes":l_notes}
        }

    system = (
        "You receive ONLY column headers, a few distinct sample values per column, and a list of candidate options.\n"
        "1) Infer the specific scientific/analytical datatype as a short slug (qpcr_cq, qpcr_quantity, dose_response, ic50, elisa, ribogreen, time_course, plate_measurements, generic_table, unknown).\n"
        "2) Propose concrete, domain-appropriate next actions (analysis steps).\n"
        "3) Choose the single BEST option from the provided list and also return a best-to-worst ranking of ALL options.\n"
        "Return STRICT JSON:\n"
        "{\n"
        '  "datatype": {"name": slug, "description": "<=2 sentences", "actions": [{"name": str, "description": str}]},\n'
        '  "selection": {"chosen": "<one of options or null>", "ranking": ["opt1","opt2",...]},\n'
        '  "detected": {"notes": []}\n'
        "}"
    )
    user_payload = {"table_name": table_name, "headers": headers, "samples": samples, "options": options}

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
        # Extract datatype
        dt = data.get("datatype", {}) if isinstance(data.get("datatype", {}), dict) else {}
        name = _safe_str(dt.get("name") or dt.get("datatype_name") or dt.get("type") or "").strip()
        desc = _safe_str(dt.get("description") or "").strip()
        acts = dt.get("actions") or []
        norm_actions: List[Dict[str,str]] = []
        if isinstance(acts, list):
            for a in acts[:16]:
                if isinstance(a, str) and a.strip():
                    norm_actions.append({"name": a.strip(), "description": ""})
                elif isinstance(a, dict):
                    nm = _safe_str(a.get("name") or a.get("title") or a.get("action") or "").strip()
                    ds = _safe_str(a.get("description") or a.get("desc") or "").strip()
                    if nm:
                        norm_actions.append({"name": nm, "description": ds})

        # Extract selection
        sel = data.get("selection", {}) if isinstance(data.get("selection", {}), dict) else {}
        chosen = sel.get("chosen")
        ranking = sel.get("ranking") if isinstance(sel.get("ranking"), list) else None

        # Validate chosen/ranking against provided options; if invalid, fall back to local selection
        optset = set(options)
        if not options:
            chosen = None
            ranking = []
        else:
            if chosen not in optset:
                chosen = local_choice
            if not ranking or any(o not in optset for o in ranking) or len(set(ranking)) != len(ranking):
                ranking = local_ranking

        # If model returned an unrecognized slug, downgrade to local result but preserve a valid selection
        known_slugs = {
            "qpcr_cq",
            "qpcr_quantity",
            "dose_response",
            "ic50",
            "elisa",
            "ribogreen",
            "time_course",
            "plate_measurements",
            "generic_table",
            "unknown",
        }
        if name not in known_slugs:
            return {
                "status":"ok","source":"local",
                "table_name":table_name,"headers":headers,"samples":samples,
                "datatype":{"name":l_dt,"description":l_desc,"actions":(norm_actions or l_actions)},
                "selection":{"chosen": chosen, "ranking": ranking},
                "detected":{"notes":l_notes + ([f"GPT returned unknown slug: {name}"] if name else [])}
            }

        return {
            "status":"ok","source":"chatgpt",
            "table_name":table_name,"headers":headers,"samples":samples,
            "datatype":{"name":name or l_dt,"description":(desc or "Inferred from headers and sample values."),"actions":(norm_actions or l_actions)},
            "selection":{"chosen": chosen, "ranking": ranking},
            "detected":{"notes":l_notes}
        }
    except Exception as e:
        l_notes.append(f"Fallback from ChatGPT due to: {e}")
        return {
            "status":"ok","source":"local",
            "table_name":table_name,"headers":headers,"samples":samples,
            "datatype":{"name":l_dt,"description":l_desc,"actions":l_actions},
            "selection":{"chosen": local_choice, "ranking": local_ranking},
            "detected":{"notes":l_notes}
        }

# --------------------- main ---------------------

def main() -> int:
    # param(1): table
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

    # param(2): options (list or JSON string)
    try:
        raw_options = works.param(2)
    except Exception:
        raw_options = None
    options = _normalize_options_param(raw_options)

    # Extract headers + rows
    table_name, headers, rows = extract_headers_rows_and_name(table)

    if not headers:
        width = None
        if isinstance(table.get("cols"), int) and table["cols"] > 0:
            width = table["cols"]
        elif isinstance(table.get("wells"), list) and table["wells"]:
            width = len(table["wells"]) if isinstance(table["wells"][0], list) else None
        headers = synth_headers(width or 1)

    # Samples
    samples = build_column_samples(headers, rows, cap=12)

    # Classify + select
    model = "gpt-4o-mini"
    result = classify_with_gpt(headers, samples, table_name, options, model=model)

    # Ensure core echoes
    result["table_name"] = table_name
    result["headers"] = headers
    result["samples"] = samples
    if "selection" not in result:
        # Shouldn't happen, but keep stable shape
        result["selection"] = {"chosen": None, "ranking": []}

    works.resolve(result)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
