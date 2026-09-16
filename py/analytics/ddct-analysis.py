#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ΔΔCt (delta-delta Ct) relative quantification for Analytics canvas tables.

Ion Works params
----------------
param(1): one table, or a list of tables, in the Plate.toValueFormulaJSON() shape:
            { "name": "PCR", "cols": 5, "rows": 25,
              "wells": [ {"x": 0, "y": 0, "value": "Sample"}, ... ] }
          A 2-D matrix form (wells[x][y] = {"value": ...}) is accepted as well.
param(2): optional options dict. Every key is optional:
            {
              "table":             "<table name>"   pick the source table explicitly
              "ct_column":         "<header>"       Ct / Cq column (long format)
              "sample_column":     "<header>"
              "target_column":     "<header>"       gene / assay column (long format)
              "condition_column":  "<header>"       biological grouping column
              "reference_targets": ["GAPDH", ...]   housekeeping gene(s)
              "calibrator":        "<label>"        condition label or sample name
              "base":              2                amplification base for base^-ΔΔCt
            }

Supported layouts
-----------------
long: one row per well/replicate with Sample, Target and Ct columns (the shape of
      a QuantStudio / CFX results export), plus an optional Condition column.
wide: one row per sample with one Ct column per gene ("GAPDH", "MYC", or
      "GAPDH Ct 1", "GAPDH Ct 2" for technical replicates).

Method
------
1. Rows are dropped when the Ct is not numeric (Undetermined, blank), when the
   task/sample/target marks a control well (NTC, NRT, blank, water) or a standard.
2. Technical replicates (same sample, condition and target) are averaged.
3. ΔCt  = mean Ct(target) - mean Ct(reference genes)          per sample
4. ΔΔCt = ΔCt(sample) - mean ΔCt(calibrator samples)          per target
5. Fold change = base ^ (-ΔΔCt); relative expression % = 100 x FC / mean FC(calibrator)
6. A summary per condition (or per sample group) reports n, mean ΔΔCt, mean and
   SD of the fold change.

Result
------
{ "status": "ok",
  "detection": {...},                       what was used and why
  "tables": [ {"name", "headers", "rows"} ] tables to draw, in order
  "notes": [...] }
{ "status": "needs_input", "need": "table"|"reference"|"calibrator",
  "title": "...", "choices": [...], "detection": {...} }
{ "status": "error", "error": "..." }
"""

from __future__ import annotations

import json
import math
import re
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

from ion import works  # type: ignore


# ============================================================
# Input parsing
# ============================================================

def _load_json_param(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        return raw


def _cell_value(cell: Any) -> Any:
    if cell is None:
        return None
    if isinstance(cell, dict):
        return cell.get("value")
    return cell


def table_to_grid(table: Dict[str, Any]) -> Tuple[str, List[str], List[List[Any]]]:
    """Return (name, headers, data rows). Row 0 of the table is the header row."""
    name = str(table.get("name") or "Table")
    wells = table.get("wells")
    cells: Dict[Tuple[int, int], Any] = {}
    max_x = -1
    max_y = -1

    if isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0]:
        for w in wells:
            try:
                x = int(w.get("x"))
                y = int(w.get("y"))
            except Exception:
                continue
            cells[(x, y)] = w.get("value")
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    elif isinstance(wells, list):
        for x, col in enumerate(wells):
            if not isinstance(col, list):
                continue
            for y, cell in enumerate(col):
                v = _cell_value(cell)
                if v is None or v == "":
                    continue
                cells[(x, y)] = v
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x < 0 or max_y < 1:
        return name, [], []

    headers = []
    for x in range(max_x + 1):
        h = cells.get((x, 0))
        headers.append(str(h).strip() if h is not None and str(h).strip() != "" else f"Column_{x + 1}")

    rows: List[List[Any]] = []
    for y in range(1, max_y + 1):
        row = [cells.get((x, y)) for x in range(max_x + 1)]
        if all(v is None or str(v).strip() == "" for v in row):
            continue
        rows.append(row)
    return name, headers, rows


def to_float(v: Any) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        return f if math.isfinite(f) else None
    s = str(v).strip().replace(",", "")
    if not s:
        return None
    try:
        f = float(s)
        return f if math.isfinite(f) else None
    except Exception:
        return None


def _s(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def sanitize_name(name: str) -> str:
    """Mirror of lib/core.js sanitizeName so table names line up with the formula engine."""
    name = (name or "").strip()
    name = re.sub(r"\s+", "", name)
    return re.sub(r"[^a-zA-Z0-9_]", "_", name)


# ============================================================
# Header roles
# ============================================================

RESULT_TABLE_SUFFIX = re.compile(r"_(ddCt|Ct_means|ddCt_summary|ddCt_settings)$")
RESULT_HEADER_RE = re.compile(r"ΔΔ|dd\s*c[tq]|delta\s*delta|fold\s*change", re.I)


def _norm(h: str) -> str:
    return re.sub(r"[\s_\-\.]+", " ", str(h or "").strip().lower())


def score_ct(h: str) -> int:
    n = _norm(h)
    if re.search(r"\b(sd|std|stdev|dev|conf|confidence|threshold|delta|Δ|quantity|efficiency|omit|flag)\b", n):
        return 0
    if n in ("cq", "ct", "cт", "crt", "cp", "crossing point", "cq (crt)", "cq (ct)"):
        return 100
    if re.fullmatch(r"(cq|ct|crt|cp) ?(value|values)", n):
        return 90
    if re.fullmatch(r"(raw|well) ?(cq|ct|crt)", n):
        return 85
    if re.fullmatch(r"(cq|ct|crt) ?(mean|avg|average)|(mean|avg|average) ?(cq|ct|crt)", n):
        return 70
    if re.search(r"\b(cq|ct|crt|cp)\b", n):
        return 40
    if re.search(r"\bcycle", n) and re.search(r"threshold|quant", n):
        return 30
    return 0


def score_sample(h: str) -> int:
    n = _norm(h)
    if n in ("sample", "sample name", "sample id", "specimen", "biological sample"):
        return 100
    if re.search(r"\bsample\b", n) and not re.search(r"type|color|colour|role|task|group", n):
        return 60
    if re.search(r"specimen|animal|subject|patient|donor|mouse|cell line", n):
        return 40
    return 0


def score_target(h: str) -> int:
    n = _norm(h)
    if n in ("target", "target name", "gene", "gene name", "assay", "assay name", "detector", "amplicon"):
        return 100
    if re.search(r"\b(target|gene|assay|primer|detector|amplicon|transcript)\b", n) and not re.search(r"type|color|colour|efficiency", n):
        return 60
    return 0


def score_condition(h: str) -> int:
    n = _norm(h)
    if n in ("condition", "treatment", "group", "biological group", "bio group", "cohort", "arm", "genotype"):
        return 100
    if re.search(r"\b(condition|treatment|treat|group|cohort|arm|genotype|dose|timepoint|time point|time|status|exposure|compound|drug)\b", n) and not re.search(r"sample|well|target", n):
        return 60
    return 0


def score_task(h: str) -> int:
    n = _norm(h)
    if n in ("task", "role", "well type", "sample type", "content"):
        return 100
    if re.search(r"\b(task|role|type|content)\b", n):
        return 50
    return 0


def score_well(h: str) -> int:
    n = _norm(h)
    if n in ("well", "well position", "position", "pos", "well id"):
        return 100
    if re.search(r"\bwell\b", n):
        return 50
    return 0


def best_header(headers: List[str], scorer, taken: set, minimum: int = 40) -> Optional[str]:
    best: Optional[str] = None
    best_score = 0
    for h in headers:
        if h in taken:
            continue
        sc = scorer(h)
        if sc > best_score:
            best, best_score = h, sc
    return best if best_score >= minimum else None


# ============================================================
# Vocabulary
# ============================================================

HOUSEKEEPING = {
    "18s", "18srrna", "rna18s", "rn18s", "28s", "actb", "actin", "bactin", "betaactin", "b2m",
    "gapdh", "gapd", "gusb", "hprt", "hprt1", "pgk1", "ppia", "rpl13a", "rplp13a", "rplp0", "rplp1",
    "rpl19", "rpl32", "rps18", "rps9", "tbp", "tubb", "tuba1a", "ubc", "ywhaz", "sdha", "hmbs",
    "tfrc", "ipo8", "eef1a1", "ef1a", "polr2a", "u6", "rnu6", "rnu6b", "snord44", "snord48",
    "pum1", "hsp90ab1", "psmb2", "rps29", "gusb1", "cyclophilin", "cypa", "rer1", "abl1",
    # QuantStudio guide names: β-actin, GAPDH, 18S ribosomal RNA
    "18sribosomalrna", "18srna", "18srrna", "eukaryotic18srrna", "rrna18s",
}

CALIBRATOR_PATTERNS = [
    re.compile(p, re.I) for p in (
        r"\butc\b", r"\buntreated\b", r"\bun-?tx\b", r"\bno\s*(treatment|tx|drug|dose)\b",
        r"\bvehicle\b", r"\bveh\b", r"\bdmso\b", r"\bmock\b", r"\bpbs\b", r"\bsaline\b",
        r"\bscr(?:amble|ambled)?\b", r"\bsi-?ctrl\b", r"\bsi-?nc\b", r"\bnon-?targeting\b",
        r"\bcontrol\b", r"\bctrl\b", r"\bctl\b", r"\bcalibrator\b", r"\bbaseline\b",
        r"\bwild\s*type\b", r"\bwt\b", r"\bparental\b", r"\bnaive\b", r"\bsham\b", r"\b0\s*(h|hr|hrs|hours?)\b",
    )
]

NOT_CALIBRATOR = re.compile(r"positive|\bpos\b|\bpc\b|negative|\bneg\b|\bnc\b(?!\s*si)|ntc|nrt|no\s*template|no\s*rt|blank|water|standard|\bstd\b", re.I)

EXCLUDE_ROW = re.compile(r"\bntc\b|\bnrt\b|no\s*template|no\s*rt\b|\bblank\b|\bwater\b|\bh2o\b|\bempty\b|\bstandard\b|\bstd\s*\d*\b|\bneg(?:ative)?\s*(?:ctrl|control)\b", re.I)


def gene_key(name: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(name or "").lower())


def is_housekeeping(name: Any) -> bool:
    return gene_key(name) in HOUSEKEEPING


def words(label: Any) -> str:
    """Punctuation to spaces so \b matches inside 'Control_1' or 'siCtrl-2'."""
    return re.sub(r"[_\-\.\/:;,()\[\]]+", " ", str(label or ""))


def looks_like_calibrator(label: Any) -> bool:
    s = words(label)
    if not s.strip() or NOT_CALIBRATOR.search(s):
        return False
    return any(p.search(s) for p in CALIBRATOR_PATTERNS)


# ============================================================
# Table assessment
# ============================================================

GENE_NOISE = re.compile(r"(?<![A-Za-z0-9])(cq|ct|cp|mean|avg|average|rep|replicate|r|tech|technical|value)(?![A-Za-z0-9])", re.I)


def gene_display(header: str) -> str:
    """'GAPDH Ct 1' -> 'GAPDH', 'Ct_MYC' -> 'MYC', 'MYC' -> 'MYC'."""
    s = re.sub(r"[_\.]+", " ", str(header or ""))
    s = GENE_NOISE.sub(" ", s)
    s = re.sub(r"(?<![A-Za-z0-9])\d+\s*$", " ", s)
    s = re.sub(r"[\s\-]+", " ", s).strip(" -")
    return s or str(header).strip()


def wide_gene_columns(headers: List[str], rows: List[List[Any]], taken: set) -> List[Tuple[str, str, int]]:
    """Columns that are mostly numeric and not already bound to a role: (header, gene, index)."""
    out = []
    for i, h in enumerate(headers):
        if h in taken:
            continue
        n = _norm(h)
        if re.search(r"\b(well|quantity|qty|conc|concentration|volume|dilution|efficiency|slope|intercept|r2|tm\d?|threshold|baseline|omit|sd|cv|n)\b", n):
            continue
        vals = [r[i] if i < len(r) else None for r in rows]
        present = [v for v in vals if v is not None and str(v).strip() != ""]
        if len(present) < 2:
            continue
        numeric = [v for v in present if to_float(v) is not None]
        if len(numeric) < max(2, int(0.6 * len(present))):
            continue
        display = gene_display(h)
        out.append((h, display.strip(), i))
    return out


def assess_table(table: Dict[str, Any], opts: Dict[str, Any]) -> Dict[str, Any]:
    name, headers, rows = table_to_grid(table)
    info: Dict[str, Any] = {"table": name, "headers": headers, "rows": rows, "usable": False, "score": 0, "format": "unknown"}
    if not headers or not rows:
        info["reason"] = "empty table"
        return info
    if RESULT_TABLE_SUFFIX.search(name) or any(RESULT_HEADER_RE.search(h) for h in headers):
        info["reason"] = "ΔΔCt result table"
        return info

    def pick(role: str, scorer, taken: set) -> Optional[str]:
        chosen = opts.get(f"{role}_column")
        if chosen and chosen in headers:
            return chosen
        return best_header(headers, scorer, taken)

    taken: set = set()
    task = pick("task", score_task, taken)
    if task:
        taken.add(task)
    well = pick("well", score_well, taken)
    if well:
        taken.add(well)
    sample = pick("sample", score_sample, taken)
    if sample:
        taken.add(sample)
    target = pick("target", score_target, taken)
    if target:
        taken.add(target)
    condition = pick("condition", score_condition, taken)
    if condition:
        taken.add(condition)
    ct = pick("ct", score_ct, taken)
    if ct:
        taken.add(ct)

    columns = {"sample": sample, "target": target, "ct": ct, "condition": condition, "task": task, "well": well}
    info["columns"] = columns

    if ct and target:
        info["format"] = "long"
        info["usable"] = bool(sample)
        info["score"] = 10 + (2 if sample else 0) + (1 if condition else 0) + (1 if task else 0)
        if not sample:
            info["reason"] = "long-format table has Target and Ct columns but no Sample column"
        return info

    genes = wide_gene_columns(headers, rows, taken - {ct} if ct else taken)
    if sample and len(genes) >= 2:
        info["format"] = "wide"
        info["usable"] = True
        columns["ct"] = None
        columns["target"] = None
        info["score"] = 5 + len(genes) + (1 if condition else 0)
        info["gene_columns"] = genes
        return info

    info["reason"] = "no Sample + Target + Ct columns, and fewer than two numeric gene columns"
    return info


# ============================================================
# Records
# ============================================================

def build_records(a: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    headers = a["headers"]
    rows = a["rows"]
    c = a["columns"]
    idx = {h: i for i, h in enumerate(headers)}

    def cell(row: List[Any], header: Optional[str]) -> Any:
        if not header or header not in idx:
            return None
        i = idx[header]
        return row[i] if i < len(row) else None

    records: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []

    for r_i, row in enumerate(rows):
        sample = _s(cell(row, c["sample"]))
        condition = _s(cell(row, c["condition"])) if c.get("condition") else ""
        task = _s(cell(row, c["task"])) if c.get("task") else ""
        well = _s(cell(row, c["well"])) if c.get("well") else ""
        y = r_i + 2  # 1-based row number in the table including the header

        blob = words(" ".join(x for x in (task, sample) if x))
        if EXCLUDE_ROW.search(blob):
            excluded.append({"row": y, "sample": sample, "reason": f"control or standard well ({task or sample})"})
            continue
        if not sample:
            excluded.append({"row": y, "sample": sample, "reason": "no sample name"})
            continue

        if a["format"] == "long":
            target = _s(cell(row, c["target"]))
            if EXCLUDE_ROW.search(words(target)):
                excluded.append({"row": y, "sample": sample, "reason": f"control target ({target})"})
                continue
            ct = to_float(cell(row, c["ct"]))
            if not target:
                excluded.append({"row": y, "sample": sample, "reason": "no target name"})
                continue
            if ct is None:
                excluded.append({"row": y, "sample": sample, "reason": f"{target}: Ct not numeric ({_s(cell(row, c['ct'])) or 'blank'})"})
                continue
            if ct <= 0:
                excluded.append({"row": y, "sample": sample, "reason": f"{target}: Ct <= 0"})
                continue
            records.append({"sample": sample, "condition": condition, "target": target, "ct": ct, "well": well, "row": y})
        else:
            for header, gene, i in a["gene_columns"]:
                raw = row[i] if i < len(row) else None
                if raw is None or str(raw).strip() == "":
                    continue
                ct = to_float(raw)
                if ct is None:
                    excluded.append({"row": y, "sample": sample, "reason": f"{gene}: Ct not numeric ({_s(raw)})"})
                    continue
                if ct <= 0:
                    excluded.append({"row": y, "sample": sample, "reason": f"{gene}: Ct <= 0"})
                    continue
                records.append({"sample": sample, "condition": condition, "target": gene, "ct": ct, "well": well, "row": y, "unit": y})

    return records, excluded


def mean(xs: List[float]) -> float:
    return sum(xs) / len(xs)


def sd(xs: List[float]) -> Optional[float]:
    if len(xs) < 2:
        return None
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def r(x: Optional[float], nd: int) -> Any:
    if x is None:
        return ""
    v = round(x, nd)
    return 0.0 if v == 0 else v


# ============================================================
# Analysis
# ============================================================

def unique(seq: List[str]) -> List[str]:
    seen: "OrderedDict[str, None]" = OrderedDict()
    for s in seq:
        seen.setdefault(s, None)
    return list(seen.keys())


def resolve_references(targets: List[str], opts: Dict[str, Any]) -> Tuple[List[str], str]:
    wanted = opts.get("reference_targets") or opts.get("reference") or []
    if isinstance(wanted, str):
        wanted = [wanted]
    if wanted:
        keys = {gene_key(w) for w in wanted}
        refs = [t for t in targets if gene_key(t) in keys]
        return refs, "chosen by the user"
    refs = [t for t in targets if is_housekeeping(t)]
    return refs, "recognised housekeeping gene(s)"


def group_label(sample: str) -> str:
    m = re.match(r"^(.*?)[\s_\-]+(?:rep(?:licate)?|bio|r|n|#)?\s*\d+$", sample, re.I)
    return m.group(1).strip() if m and m.group(1).strip() else sample


def analyze(a: Dict[str, Any], opts: Dict[str, Any]) -> Dict[str, Any]:
    records, excluded = build_records(a)
    notes: List[str] = []
    if not records:
        return {"status": "error", "error": f"No usable Ct rows in '{a['table']}'.", "excluded": excluded}

    has_condition = bool(a["columns"].get("condition"))
    targets = unique([rec["target"] for rec in records])
    samples = unique([rec["sample"] for rec in records])
    conditions = unique([rec["condition"] for rec in records if rec["condition"]])

    refs, ref_reason = resolve_references(targets, opts)
    if not refs:
        return {
            "status": "needs_input", "need": "reference",
            "title": "Select the endogenous control (housekeeping gene)",
            "choices": targets,
            "detection": {"table": a["table"], "format": a["format"], "columns": a["columns"], "targets": targets},
        }
    goi = [t for t in targets if t not in refs]
    if not goi:
        return {"status": "error", "error": "Every target is a reference gene; nothing to normalise."}

    # ---- calibrator ----
    if has_condition:
        pool = conditions
        pool_name = "condition"
    else:
        pool = samples
        pool_name = "sample"
    chosen = opts.get("calibrator")
    cal_labels: List[str] = []
    cal_reason = ""
    if chosen:
        chosen_list = chosen if isinstance(chosen, list) else [chosen]
        low = {str(x).strip().lower() for x in chosen_list}
        cal_labels = [p for p in pool if p.lower() in low]
        if not cal_labels and has_condition:
            # the user may have named a sample even though a condition column exists
            cal_samples = [s for s in samples if s.lower() in low]
            if cal_samples:
                pool, pool_name, cal_labels = samples, "sample", cal_samples
        cal_reason = "chosen by the user"
    else:
        cal_labels = [p for p in pool if looks_like_calibrator(p)]
        cal_reason = f"{pool_name} label looks like an untreated control"
        if has_condition and len(cal_labels) > 1:
            cal_labels = []
    if not cal_labels:
        return {
            "status": "needs_input", "need": "calibrator",
            "title": f"Select the reference sample (calibrator {pool_name}, the 1× sample)",
            "choices": pool,
            "detection": {"table": a["table"], "format": a["format"], "columns": a["columns"], "targets": targets, "reference_targets": refs},
        }

    def is_cal(rec: Dict[str, Any]) -> bool:
        return (rec["condition"] if pool_name == "condition" else rec["sample"]) in cal_labels

    base = to_float(opts.get("base")) or 2.0

    # ---- technical replicate means per (sample, condition, target) ----
    # A unit is one biological measurement: in a long table every well of the same
    # sample (and condition) is a technical replicate; in a wide table each row is
    # its own sample and the replicate columns are the technical replicates.
    units: "OrderedDict[Tuple[str, str, Any], Dict[str, Any]]" = OrderedDict()
    for rec in records:
        u = units.setdefault((rec["sample"], rec["condition"], rec.get("unit")), {"sample": rec["sample"], "condition": rec["condition"], "cts": OrderedDict(), "calibrator": False})
        u["cts"].setdefault(rec["target"], []).append(rec["ct"])
        if is_cal(rec):
            u["calibrator"] = True

    ct_rows: List[List[Any]] = []
    for (sample, condition, _unit), u in units.items():
        for t, cts in u["cts"].items():
            s_ = sd(cts)
            flag = ""
            if s_ is not None and s_ > 0.5:
                flag = "replicates differ by > 0.5 cycles"
            row = [sample] + ([condition] if has_condition else []) + [
                t, "reference" if t in refs else "target", len(cts), r(mean(cts), 3), r(s_, 3), flag]
            ct_rows.append(row)

    # ---- ΔCt per unit and target ----
    dct: Dict[Tuple[Tuple[str, str, Any], str], float] = {}
    ref_mean: Dict[Tuple[str, str, Any], float] = {}
    for key, u in units.items():
        ref_cts = [mean(u["cts"][rf]) for rf in refs if rf in u["cts"]]
        if not ref_cts:
            notes.append(f"{u['sample']}{' / ' + u['condition'] if u['condition'] else ''}: no reference gene Ct, skipped")
            continue
        if len(ref_cts) < len(refs):
            notes.append(f"{u['sample']}: only {len(ref_cts)} of {len(refs)} reference genes measured")
        ref_mean[key] = mean(ref_cts)
        for t in goi:
            if t in u["cts"]:
                dct[(key, t)] = mean(u["cts"][t]) - ref_mean[key]

    # ---- calibrator ΔCt per target ----
    cal_dct: Dict[str, float] = {}
    for t in goi:
        vals = [v for (key, tt), v in dct.items() if tt == t and units[key]["calibrator"]]
        if vals:
            cal_dct[t] = mean(vals)
        else:
            notes.append(f"{t}: no calibrator sample measured, ΔΔCt not computed")

    # ---- ΔΔCt, fold change, relative expression ----
    fc: Dict[Tuple[Tuple[str, str, Any], str], float] = {}
    for (key, t), d in dct.items():
        if t in cal_dct:
            fc[(key, t)] = base ** (-(d - cal_dct[t]))
    cal_fc_mean: Dict[str, float] = {}
    for t in goi:
        vals = [v for (key, tt), v in fc.items() if tt == t and units[key]["calibrator"]]
        if vals:
            cal_fc_mean[t] = mean(vals)

    ddct_rows: List[List[Any]] = []
    for key, u in units.items():
        if key not in ref_mean:
            continue
        for t in goi:
            if (key, t) not in dct:
                continue
            d = dct[(key, t)]
            dd = d - cal_dct[t] if t in cal_dct else None
            f = fc.get((key, t))
            rel = 100.0 * f / cal_fc_mean[t] if (f is not None and cal_fc_mean.get(t)) else None
            ddct_rows.append(
                [u["sample"]] + ([u["condition"]] if has_condition else []) + [
                    t, "calibrator" if u["calibrator"] else "",
                    r(mean(u["cts"][t]), 3), r(ref_mean[key], 3), r(d, 3), r(dd, 3),
                    r(f, 4), r(rel, 1),
                    r(-dd, 3) if dd is not None else "",
                ])

    # ---- summary per group ----
    def group_of(u: Dict[str, Any]) -> str:
        return u["condition"] if has_condition else group_label(u["sample"])

    groups = unique([group_of(u) for key, u in units.items() if key in ref_mean])
    grouped = has_condition or any(sum(1 for u in units.values() if group_of(u) == g) > 1 for g in groups)
    summary_rows: List[List[Any]] = []
    if grouped:
        for g in groups:
            g_units = [key for key, u in units.items() if group_of(u) == g and key in ref_mean]
            is_cal_group = any(units[k]["calibrator"] for k in g_units)
            for t in goi:
                ds = [dct[(k, t)] for k in g_units if (k, t) in dct]
                fs = [fc[(k, t)] for k in g_units if (k, t) in fc]
                if not ds:
                    continue
                dd_mean = mean(ds) - cal_dct[t] if t in cal_dct else None
                summary_rows.append([
                    g, t, "calibrator" if is_cal_group else "", len(ds),
                    r(mean(ds), 3), r(sd(ds), 3), r(dd_mean, 3),
                    r(base ** (-dd_mean), 4) if dd_mean is not None else "",
                    r(mean(fs), 4) if fs else "", r(sd(fs), 4) if fs else "",
                    r(-dd_mean, 3) if dd_mean is not None else "",
                ])

    src = sanitize_name(a["table"])
    cond_hdr = [a["columns"]["condition"]] if has_condition else []
    tables = [
        {
            "name": f"{src}_ddCt",
            "kind": "ddct",
            "headers": ["Sample"] + cond_hdr + ["Target", "Role", "Ct target", "Ct reference", "ΔCt", "ΔΔCt", f"Fold change ({_s(base)}^-ΔΔCt)", "Relative expression (%)", "log2 fold change"],
            "rows": ddct_rows,
        },
    ]
    if grouped and summary_rows:
        tables.append({
            "name": f"{src}_ddCt_summary",
            "kind": "summary",
            "headers": [a["columns"]["condition"] if has_condition else "Group", "Target", "Role", "n", "Mean ΔCt", "SD ΔCt", "ΔΔCt", f"Fold change ({_s(base)}^-ΔΔCt)", "Mean fold change", "SD fold change", "log2 fold change"],
            "rows": summary_rows,
        })
    tables.append({
        "name": f"{src}_Ct_means",
        "kind": "ct_means",
        "headers": ["Sample"] + cond_hdr + ["Target", "Role", "n", "Mean Ct", "SD Ct", "Flag"],
        "rows": ct_rows,
    })

    excluded_text = ""
    if excluded:
        reasons = unique([e["reason"] for e in excluded])
        excluded_text = f"{len(excluded)} row(s): " + "; ".join(reasons[:6]) + (" …" if len(reasons) > 6 else "")

    settings_rows = [
        ["Source table", a["table"]],
        ["Layout", "long (one row per well)" if a["format"] == "long" else "wide (one Ct column per gene)"],
        ["Sample column", a["columns"].get("sample") or ""],
        ["Target column", a["columns"].get("target") or "(column headers)"],
        ["Ct column", a["columns"].get("ct") or "(gene columns)"],
        ["Condition column", a["columns"].get("condition") or "(none)"],
        ["Endogenous control(s)", ", ".join(refs)],
        ["Endogenous control chosen because", ref_reason],
        ["Reference sample (calibrator)", ", ".join(cal_labels) + f" ({pool_name})"],
        ["Calibrator chosen because", cal_reason],
        ["Base", _s(base)],
        ["Targets analysed", ", ".join(goi)],
        ["Excluded rows", excluded_text or "none"],
        ["ΔCt", "mean Ct(target) − mean Ct(endogenous controls), per sample"],
        ["ΔΔCt", "ΔCt(sample) − mean ΔCt(calibrator samples), per target"],
        ["Fold change", f"{_s(base)}^−ΔΔCt (Livak & Schmittgen 2001)"],
        ["Relative expression", "100 × fold change ÷ mean fold change of the calibrator"],
    ]
    tables.append({
        "name": f"{src}_ddCt_settings",
        "kind": "settings",
        "headers": ["Label", "Value"],
        "rows": settings_rows,
    })

    detection = {
        "table": a["table"],
        "format": a["format"],
        "columns": a["columns"],
        "targets": goi,
        "reference_targets": refs,
        "calibrator": cal_labels,
        "calibrator_kind": pool_name,
        "samples": samples,
        "conditions": conditions,
        "base": base,
        "excluded": excluded,
        "n_records": len(records),
    }
    return {"status": "ok", "detection": detection, "tables": tables, "notes": unique(notes)}


# ============================================================
# Orchestration
# ============================================================

def run(tables_param: Any, opts: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(tables_param, dict) and "wells" in tables_param:
        tables = [tables_param]
    elif isinstance(tables_param, dict) and isinstance(tables_param.get("tables"), list):
        tables = tables_param["tables"]
    elif isinstance(tables_param, list):
        tables = [t for t in tables_param if isinstance(t, dict)]
    else:
        return {"status": "error", "error": "Expected a table or a list of tables."}
    if not tables:
        return {"status": "error", "error": "No tables were supplied."}

    assessed = [assess_table(t, opts) for t in tables]
    usable = [a for a in assessed if a["usable"]]

    wanted = opts.get("table")
    if wanted:
        picked = [a for a in usable if a["table"] == wanted]
        if not picked:
            picked = [a for a in assessed if a["table"] == wanted]
            if picked:
                return {"status": "error", "error": f"'{wanted}': {picked[0].get('reason', 'not a Ct table')}"}
            return {"status": "error", "error": f"No table named '{wanted}'."}
        return analyze(picked[0], opts)

    if not usable:
        reasons = [f"{a['table']}: {a.get('reason', 'not usable')}" for a in assessed]
        return {"status": "error",
                "error": "No table with Ct values was found. A long table needs Sample, Target and Ct columns; a wide table needs a Sample column and one Ct column per gene.",
                "details": reasons}
    if len(usable) > 1:
        usable.sort(key=lambda a: -a["score"])
        return {
            "status": "needs_input", "need": "table",
            "title": "Select the table with the Ct values",
            "choices": [a["table"] for a in usable],
            "detection": {"candidates": [{"table": a["table"], "format": a["format"], "columns": a["columns"]} for a in usable]},
        }
    return analyze(usable[0], opts)


def _main_ion() -> int:
    works.msg("ΔΔCt analysis")
    tables_param = _load_json_param(works.param(1))
    opts = _load_json_param(works.param(2)) or {}
    if not isinstance(opts, dict):
        opts = {}
    try:
        result = run(tables_param, opts)
    except Exception as e:  # pragma: no cover - surfaced to the UI
        result = {"status": "error", "error": f"{type(e).__name__}: {e}"}
    works.resolve(result)
    return 0 if result.get("status") != "error" else 1


_main_ion()
