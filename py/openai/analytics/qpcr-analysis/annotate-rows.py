#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works — qPCR-style metadata detector (ChatGPT-driven)

Param(1): table dict
  A) Flat grid:  {"name": ..., "cols": N, "rows": M, "wells": [{x,y,value,field?}, ...]}
  B) 2-D wells:  {"name": ..., "wells": [ [cell0, cell1, ...], [cell0, ...], ... ] }  # wells[cols][rows]
     (headers in top row y=0 across x; body rows y>=1)

Behavior:
- Extract headers & rows with resilient logic (unchanged).
- If OPENAI_API_KEY is present, send a compact JSON of headers + rows to ChatGPT
  with explicit instructions and a strict output schema to identify:
    • housekeeping gene rows
    • target gene rows
    • control rows (NTC/NRT/Pos/Neg/Vehicle/Calibrator/etc.)
    • standard/dilution series rows (Std/Standard labels, optional indices, concentrations)
- Otherwise, fall back to local heuristics.

Output (via ion.works.resolve):
{
  "status": "ok",
  "table_name": "...",
  "headers": [...],
  "meta": {
    "columns": {"well": "...", "sample": "...", "target": "...", "task": "...", "conc": "..."},
    "housekeeping_genes": [{"row_index": int, "target": str, "well": str|"" , "sample": str|""}],
    "target_genes": [{"row_index": int, "target": str, "well": str|"" , "sample": str|""}],
    "controls": [{"row_index": int, "type": str, "well": str|"" , "sample": str|"" , "target": str|""}],
    "standards": {
      "series": [
        {
          "label": "Std"|"Standard"|...,
          "members": [
            {"row_index": int, "std_index": int|null, "well": str|"" , "sample": str|"" , "target": str|"" , "concentration": str|"" , "conc_value": float|null}
          ],
          "fold_change": float|null,
          "order": "ascending"|"descending"|null
        }
      ]
    },
    "notes": [ "...", ... ]
  }
}
"""

import json, re, math, os
from typing import Any, Dict, List, Tuple, Optional

from ion import works  # type: ignore


# --------------------- small utils ---------------------

def _safe_str(v: Any) -> str:
    if v is None: return ""
    return str(v)

def _cell_value(cell: Any) -> str:
    if isinstance(cell, dict):
        if "value" in cell and cell["value"] not in (None, ""):
            return _safe_str(cell["value"]).strip()
        # soft fallbacks
        for k in ("name","position","label","title"):
            val = cell.get(k)
            if val not in (None,""):
                return _safe_str(val).strip()
        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("header","title","label"):
                val = props.get(k)
                if val not in (None,""):
                    return _safe_str(val).strip()
        return ""
    return _safe_str(cell).strip()

def synth_headers(n: int) -> List[str]:
    return [f"Col{i+1}" for i in range(max(0,n))]

def _to_float_maybe(s: str) -> Optional[float]:
    if not s: return None
    txt = s.strip().lower()
    txt = re.sub(r"\s*(pg/ml|ng/ml|ug/ml|µg/ml|mg/ml|pm|nm|um|µm|mm|m|%|fold|x)\s*$", "", txt)
    txt = txt.replace("µ", "u").replace(",", "")
    try:
        return float(txt)
    except Exception:
        m = re.search(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", txt)
        if m:
            try: return float(m.group(0))
            except Exception: pass
    return None


# --------------------- header + row extraction (unchanged) ---------------------

def _headers_from_flat_grid(table: Dict[str, Any]) -> Optional[List[str]]:
    wells = table.get("wells")
    if not (isinstance(wells, list) and wells and isinstance(wells[0], dict) and "x" in wells[0] and "y" in wells[0]):
        return None
    if isinstance(table.get("cols"), int) and table["cols"] > 0:
        width = table["cols"]
    else:
        try:
            width = max(int(c.get("x", -1)) for c in wells) + 1
        except Exception:
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
        cell = by_xy.get((x,0))
        hdrs.append(_cell_value(cell) if cell is not None else "")
    if not any(h.strip() for h in hdrs):
        return synth_headers(width)
    return [h if h.strip() else f"Col{i+1}" for i,h in enumerate(hdrs)]

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
    for y in range(1, max_y+1):
        row: List[str] = []
        for x in range(width):
            cell = by_xy.get((x,y))
            row.append(_cell_value(cell) if cell is not None else "")
        if any(v.strip() for v in row):
            rows.append(row)
    return rows

def _headers_from_2d_wells(table: Dict[str, Any]) -> Optional[List[str]]:
    wells = table.get("wells")
    if not (isinstance(wells, list) and wells and isinstance(wells[0], list)): return None
    width = len(wells)
    height = max((len(col) for col in wells if isinstance(col, list)), default=0)
    if width <= 0 or height <= 0:
        return synth_headers(max(1,width)) if width else ["Col1"]
    headers: List[str] = []
    for x in range(width):
        col = wells[x] if x < len(wells) and isinstance(wells[x], list) else []
        top = col[0] if len(col) > 0 else None
        headers.append(_cell_value(top))
    if not any(h.strip() for h in headers):
        return synth_headers(width)
    return [h if h.strip() else f"Col{i+1}" for i,h in enumerate(headers)]

def _rows_from_2d_wells(table: Dict[str, Any], width: int) -> List[List[str]]:
    wells = table.get("wells") or []
    height = max((len(col) for col in wells if isinstance(col, list)), default=0)
    rows: List[List[str]] = []
    for y in range(1, height):
        row: List[str] = []
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
        return name, headers, _rows_from_flat_grid(table, len(headers))
    headers = _headers_from_2d_wells(table)
    if headers is not None:
        return name, headers, _rows_from_2d_wells(table, len(headers))
    return name, ["Col1"], []


# --------------------- column binding (used for meta.columns only) ---------------------

def _find_col(headers: List[str], keys: List[str]) -> Optional[int]:
    hlow = [h.lower() for h in headers]
    for i, h in enumerate(hlow):
        for k in keys:
            if k in h:
                return i
    return None

def bind_columns(headers: List[str]) -> Dict[str, Optional[int]]:
    return {
        "well":   _find_col(headers, ["wellposition","well position","well_id","well id","well","position"]),
        "sample": _find_col(headers, ["sample","specimen"]),
        "target": _find_col(headers, ["target","gene","assay","primer"]),
        "task":   _find_col(headers, ["task","role","type"]),
        "conc":   _find_col(headers, ["conc","concentration","std","standard","ng/µl","ng/ul","pg/ml","ng/ml","dose"])
    }


# --------------------- local (heuristic) fallback ---------------------

HK_SET = {
    "18s","18s rrna","28s","actb","b2m","gapdh","gusb","hprt","hprt1","pgk1","ppia",
    "rpl13a","rplp0","tbp","tubb","ubc","ywhaz","sdha","rna18s","rplp13a"
}
HK_SET = {g.lower() for g in HK_SET}

CONTROL_PATTERNS = [
    ("NTC", r"\bntc\b|no\s*template"),
    ("NRT", r"\bnrt\b|no\s*rt"),
    ("Negative Control", r"negative\s*control|\bneg\b"),
    ("Positive Control", r"positive\s*control|\bpos\b"),
    ("Calibrator", r"\bcalib|\bcalibrator\b|\bcontrol\s*calibrator\b"),
    ("Vehicle", r"vehicle|dmso|water|buffer"),
    ("Control", r"\bcontrol\b"),
]
CONTROL_RE = [(name, re.compile(pat, re.I)) for name, pat in CONTROL_PATTERNS]
STD_LABEL_RE = re.compile(r"\bstd(?:\s*[:\-]?\s*(\d+))?\b|\bstandard(?:\s*[:\-]?\s*(\d+))?\b", re.I)

def _heuristic_detect(headers: List[str], rows: List[List[str]]) -> Dict[str, Any]:
    bindings = bind_columns(headers)
    col_well = bindings["well"]
    col_sample = bindings["sample"]
    col_target = bindings["target"]
    col_task = bindings["task"]
    col_conc = bindings["conc"]

    hk_rows, tgt_rows, ctl_rows = [], [], []
    std_groups: Dict[str, List[Dict[str, Any]]] = {}

    for idx, row in enumerate(rows):
        target = (row[col_target] if col_target is not None and col_target < len(row) else "").strip()
        sample = (row[col_sample] if col_sample is not None and col_sample < len(row) else "").strip()
        task   = (row[col_task]   if col_task   is not None and col_task   < len(row) else "").strip()
        well   = (row[col_well]   if col_well   is not None and col_well   < len(row) else "").strip()
        conc_s = (row[col_conc]   if col_conc   is not None and col_conc   < len(row) else "").strip()
        conc_v = _to_float_maybe(conc_s)

        if target:
            t_norm = re.sub(r"[^a-z0-9]+", "", target.lower())
            if t_norm in HK_SET:
                hk_rows.append({"row_index": idx+1, "target": target, "well": well, "sample": sample})

        blob = " ".join([sample, target, task]).lower()
        found_ctrl = None
        for name, rx in CONTROL_RE:
            if rx.search(blob):
                found_ctrl = name; break
        if found_ctrl:
            ctl_rows.append({"row_index": idx+1, "type": found_ctrl, "well": well, "sample": sample, "target": target})

        mlabel = STD_LABEL_RE.search(blob)
        if mlabel:
            label = "Standard" if "standard" in mlabel.group(0).lower() else "Std"
            std_idx = None
            for g in (1,2):
                if mlabel.group(g):
                    try: std_idx = int(mlabel.group(g))
                    except Exception: pass
            std_groups.setdefault(label, []).append({
                "row_index": idx+1, "std_index": std_idx, "well": well, "sample": sample,
                "target": target, "concentration": conc_s, "conc_value": conc_v
            })

    control_idx = {r["row_index"] for r in ctl_rows}
    if bindings["target"] is not None:
        for idx, row in enumerate(rows):
            t = (row[col_target] if col_target is not None and col_target < len(row) else "").strip()
            if not t: continue
            t_norm = re.sub(r"[^a-z0-9]+", "", t.lower())
            if t_norm in HK_SET: continue
            if (idx+1) in control_idx: continue
            well = (row[col_well] if col_well is not None and col_well < len(row) else "").strip()
            sample = (row[col_sample] if col_sample is not None and col_sample < len(row) else "").strip()
            tgt_rows.append({"row_index": idx+1, "target": t, "well": well, "sample": sample})

    standards_meta = {"series": []}
    def _monotone_and_fold(values: List[Optional[float]]) -> Tuple[Optional[str], Optional[float]]:
        xs = [v for v in values if v is not None]
        if len(xs) < 3: return None, None
        asc = all(xs[i] <= xs[i+1] for i in range(len(xs)-1))
        desc = all(xs[i] >= xs[i+1] for i in range(len(xs)-1))
        if not (asc or desc): return None, None
        ratios = []
        for a,b in zip(xs[:-1], xs[1:]):
            if not a or not b: continue
            ratios.append(abs(b/a))
        if len(ratios) < 2: return ("ascending" if asc else "descending"), None
        import math
        logs = [math.log(r) for r in ratios if r > 0]
        if not logs: return ("ascending" if asc else "descending"), None
        return ("ascending" if asc else "descending"), round(math.exp(sum(logs)/len(logs)), 4)

    for label, members in std_groups.items():
        with_idx = [m for m in members if isinstance(m.get("std_index"), int)]
        members_sorted = sorted(members, key=lambda m: (m.get("std_index") is None, m.get("std_index") or 0)) if with_idx else members
        conc_vals = [m.get("conc_value") for m in members_sorted]
        order, fold = _monotone_and_fold(conc_vals)
        standards_meta["series"].append({
            "label": label, "members": members_sorted, "fold_change": fold, "order": order
        })

    return bindings, hk_rows, tgt_rows, ctl_rows, standards_meta


# --------------------- ChatGPT driver ---------------------

def _trim_cell(s: str, max_len: int = 100) -> str:
    s = (s or "").strip()
    if len(s) <= max_len: return s
    return s[:max_len-1] + "…"

def _build_compact_payload(headers: List[str], rows: List[List[str]], max_rows: int = 600) -> Dict[str, Any]:
    # keep memory in check: cap rows and cell size
    sel_rows = rows[:max_rows]
    compact = []
    for i, r in enumerate(sel_rows, start=1):
        item = {"row_index": i, "cells": {}}
        for j, h in enumerate(headers):
            v = r[j] if j < len(r) else ""
            item["cells"][h] = _trim_cell(v)
        compact.append(item)
    return {"headers": headers, "rows": compact}

def _extract_json(s: str) -> Dict[str, Any]:
    s = (s or "").strip()
    if not s: return {}
    if s.startswith("```"): s = "\n".join(s.splitlines()[1:])
    if s.endswith("```"): s = "\n".join(s.splitlines()[:-1])
    try:
        return json.loads(s)
    except Exception:
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
                        try: return json.loads(cand)
                        except Exception: break
            start = s.find("{", start+1)
    return {}

def _call_chatgpt(headers: List[str], rows: List[List[str]], model: str = "gpt-4o-mini") -> Optional[Dict[str, Any]]:
    if not os.getenv("OPENAI_API_KEY"):
        return None

    payload = _build_compact_payload(headers, rows, max_rows=800)

    system = (
        "You are a molecular biology data analyst. "
        "Given qPCR-style plate tables (headers + rows), identify:\n"
        "• housekeeping gene rows (GAPDH, ACTB, B2M, 18S, RPLP0, TBP, PPIA, PGK1, GUSB, etc.)\n"
        "• target gene rows (non-housekeeping, non-control targets)\n"
        "• control rows (NTC, NRT, negative/positive control, calibrator, vehicle/DMSO, generic control)\n"
        "• standard/dilution series rows (labels like 'Std', 'Standard', or concentration series)\n\n"
        "Use the top row (y=0) as headers; row_index starts at 1 for the first data row (y=1). "
        "If a Well column exists, include the well id; otherwise use ''. "
        "If a concentration column exists, include both the raw concentration string and a parsed numeric value if possible.\n\n"
        "Return STRICT JSON:\n"
        "{\n"
        "  \"housekeeping_genes\": [{\"row_index\":int, \"target\":str, \"well\":str, \"sample\":str}],\n"
        "  \"target_genes\": [{\"row_index\":int, \"target\":str, \"well\":str, \"sample\":str}],\n"
        "  \"controls\": [{\"row_index\":int, \"type\":str, \"well\":str, \"sample\":str, \"target\":str}],\n"
        "  \"standards\": {\"series\": [\n"
        "    {\"label\":str, \"members\":[{\"row_index\":int, \"std_index\":int|null, \"well\":str, \"sample\":str, \"target\":str, \"concentration\":str, \"conc_value\":float|null}],\n"
        "     \"fold_change\": float|null, \"order\": \"ascending\"|\"descending\"|null}\n"
        "  ]},\n"
        "  \"notes\": [str]\n"
        "}\n"
        "Only include rows that you are reasonably confident about. Prefer explicit labels in Sample/Target/Task over guessing."
    )

    # Light hints so the model can find key columns
    col_hints = {
        "likely_well_headers": ["Well", "WellPosition", "Well Position", "Position"],
        "likely_sample_headers": ["Sample", "Specimen"],
        "likely_target_headers": ["Target", "Gene", "Assay", "Primer"],
        "likely_task_headers": ["Task", "Type", "Role"],
        "likely_conc_headers": ["Conc", "Concentration", "Dose", "ng/µl", "ng/ul", "pg/ml", "ng/ml", "Std", "Standard"]
    }
    user = {"context": {"hints": col_hints}, **payload}

    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI()
        raw = ""
        # Prefer Responses API
        try:
            r = client.responses.create(
                model=model,
                temperature=0.0,
                response_format={"type": "json_object"},
                input=[
                    {"role":"system","content": system},
                    {"role":"user","content": json.dumps(user, ensure_ascii=False)}
                ]
            )
            raw = getattr(r, "output_text", "") or ""
        except Exception:
            # Fallback to Chat Completions
            resp = client.chat.completions.create(
                model=model,
                temperature=0.0,
                response_format={"type": "json_object"},
                messages=[
                    {"role":"system","content": system},
                    {"role":"user","content": json.dumps(user, ensure_ascii=False)}
                ]
            )
            raw = (resp.choices[0].message.content or "").strip()

        data = _extract_json(raw)
        if not isinstance(data, dict): return None
        return data
    except Exception:
        return None


# --------------------- orchestrator ---------------------

def analyze_with_chatgpt(headers: List[str], rows: List[List[str]]) -> Optional[Dict[str, Any]]:
    data = _call_chatgpt(headers, rows)
    if not data: return None

    # Coerce minimal fields & validate types
    hk = data.get("housekeeping_genes") or []
    tg = data.get("target_genes") or []
    ct = data.get("controls") or []
    st = data.get("standards") or {}
    notes = data.get("notes") or []

    # Basic sanity: ensure row_index >=1 and within bounds
    nrows = len(rows)
    def _valid_row(r): 
        try:
            i = int(r.get("row_index", -1))
            return 1 <= i <= nrows
        except Exception: 
            return False

    hk = [r for r in hk if isinstance(r, dict) and _valid_row(r)]
    tg = [r for r in tg if isinstance(r, dict) and _valid_row(r)]
    ct = [r for r in ct if isinstance(r, dict) and _valid_row(r)]

    # Standards structure
    series = []
    if isinstance(st, dict) and isinstance(st.get("series"), list):
        for s in st["series"]:
            if not isinstance(s, dict): continue
            label = s.get("label") or "Std"
            members = [m for m in (s.get("members") or []) if isinstance(m, dict) and _valid_row(m)]
            order = s.get("order") if s.get("order") in ("ascending","descending") else None
            fold = s.get("fold_change")
            try:
                fold = float(fold) if fold is not None else None
            except Exception:
                fold = None
            series.append({"label": label, "members": members, "fold_change": fold, "order": order})

    return {
        "housekeeping_genes": hk,
        "target_genes": tg,
        "controls": ct,
        "standards": {"series": series},
        "notes": [str(x) for x in notes if isinstance(x, (str,int,float))]
    }


# --------------------- main analyze ---------------------

def analyze(table: Dict[str, Any]) -> Dict[str, Any]:
    table_name, headers, rows = extract_headers_rows_and_name(table)
    bindings = bind_columns(headers)

    # Try ChatGPT path
    gpt_meta = analyze_with_chatgpt(headers, rows)

    if gpt_meta is None:
        # fallback: heuristics
        bindings_fallback, hk_rows, tgt_rows, ctl_rows, standards_meta = _heuristic_detect(headers, rows)
        bindings = bindings or bindings_fallback
        meta = {
            "columns": {
                "well":   headers[bindings["well"]]   if bindings["well"]   is not None else None,
                "sample": headers[bindings["sample"]] if bindings["sample"] is not None else None,
                "target": headers[bindings["target"]] if bindings["target"] is not None else None,
                "task":   headers[bindings["task"]]   if bindings["task"]   is not None else None,
                "conc":   headers[bindings["conc"]]   if bindings["conc"]   is not None else None,
            },
            "housekeeping_genes": hk_rows,
            "target_genes": tgt_rows,
            "controls": ctl_rows,
            "standards": standards_meta,
            "notes": ["Local heuristic fallback used (no OPENAI_API_KEY or model error)."]
        }
    else:
        meta = {
            "columns": {
                "well":   headers[bindings["well"]]   if bindings["well"]   is not None else None,
                "sample": headers[bindings["sample"]] if bindings["sample"] is not None else None,
                "target": headers[bindings["target"]] if bindings["target"] is not None else None,
                "task":   headers[bindings["task"]]   if bindings["task"]   is not None else None,
                "conc":   headers[bindings["conc"]]   if bindings["conc"]   is not None else None,
            },
            **gpt_meta
        }

    return {
        "status": "ok",
        "table_name": table_name,
        "headers": headers,
        "meta": meta
    }


# --------------------- ion entry ---------------------

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
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"})
            return 1

    if not isinstance(table, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a table dict or JSON string of one."})
        return 1

    try:
        result = analyze(table)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
