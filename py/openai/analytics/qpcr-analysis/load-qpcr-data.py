#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
gpt_header_mapper_ion_v2_array_min_qpcr.py
------------------------------------------
Ion Works-only mapper (destination: array of plate JSON objects), specialized for qPCR data.

Output:
{
  "mapping": [
    {
      "src_col": "<source header>",
      "targets": [
        {"table_id":"<id>","table":"<t>","column":"<c>","confidence":0.0-1.0,"rationale":"..."}
      ]
    }
  ]
}

Enhancements vs base:
- qPCR-specific synonyms (Cq/Ct, Amp Status, Reporter, Quencher, Task, Target, Threshold, Baseline, etc.)
- Deterministic heuristic mapping (works when GPT is disabled: model="none"/"off")
- qPCR-centered GPT prompt with explicit rules and synonym table
"""

from typing import List, Dict, Tuple, Optional, Any
import os, json, re, csv, io
from collections import defaultdict, Counter

# Ion Works
from ion import works  # type: ignore

# Optional OpenAI (can be disabled by model="none"/"off")
try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore


# ======================= qPCR Domain Synonyms / Signals =======================

# Canonical -> list of regex tokens (case-insensitive)
QPCR_SYNONYMS: Dict[str, List[str]] = {
    "well": [r"^well$", r"^well\s*id$", r"^id$", r"^pos$", r"^w$", r"^well\s*#", r"^index$"],
    "well_position": [r"^well\s*position$", r"^position$", r"^wellpos$", r"^[a-h]\d{1,2}$"],
    "sample": [r"^sample(\s*name)?$", r"^id\s*sample$", r"^sample\s*id$"],
    "target": [r"^target$", r"^assay$", r"^gene$", r"^amplicon$"],
    "task": [r"^task$", r"^role$", r"^unknown$", r"^standard$", r"^ntc$", r"^neg(ative)?\s*ctrl?$", r"^pos(itive)?\s*ctrl?$"],
    "reporter": [r"^reporter$", r"\b(fam|vic|cy5|sybr)\b"],
    "quencher": [r"^quencher$", r"\b(bhq\d?|mgb)\b"],
    "amp_status": [r"^amp(\s*status)?$", r"^amplification\s*status$", r"^status$"],
    "amp_score": [r"^amp\s*score$", r"^amplification\s*score$"],
    "curve_quality": [r"^curve\s*quality$", r"^quality$", r"^result\s*quality$"],
    "result": [r"^result$", r"^call$", r"^detected$", r"^qual$"],
    "result_issues": [r"^result\s*quality\s*issues$"],
    "cq": [r"^cq$", r"^ct$", r"^cq\s*value$", r"^ct\s*value$"],
    "cq_mean": [r"^cq\s*mean$", r"^ct\s*mean$", r"^mean\s*(cq|ct)$", r"^(cq|ct)\s*avg$"],
    "cq_sd": [r"^cq\s*sd$", r"^ct\s*sd$", r"^stdev\s*(cq|ct)$"],
    "cq_conf": [r"^cq\s*confidence$", r"^ct\s*confidence$", r"^(cq|ct)\s*conf$"],
    "threshold": [r"^threshold$", r"^manual\s*threshold$", r"^cthresh(old)?$"],
    "auto_threshold": [r"^auto\s*threshold$"],
    "baseline": [r"^baseline$", r"^manual\s*baseline$"],
    "auto_baseline": [r"^auto\s*baseline$"],
}

CONTROL_TOKENS = [r"\bNTC\b", r"\bUTC\b", r"\bRIPA\b", r"\bWATER\b", r"\bH2O\b", r"\bBLANK\b",
                  r"\bNEG(ATIVE)?\s*(CTRL|CONTROL)?\b", r"\bPOS(ITIVE)?\s*(CTRL|CONTROL)?\b"]

WELLVAL_RE = re.compile(r"^[A-Ha-h](0?[1-9]|1[0-2]|[1-2]\d|3[0-2]|3[3-6]?)$")  # handles 96/384 formats loosely


def _rx_any(patterns: List[str]) -> re.Pattern:
    return re.compile("(" + "|".join(patterns) + ")", re.IGNORECASE)


def _match_any(name: str, patterns: List[str]) -> bool:
    rx = _rx_any(patterns)
    return bool(rx.search(name.strip()))


def _looks_like_well_value(v: str) -> bool:
    return bool(WELLVAL_RE.match(v.strip()))


def _is_floaty(v: str) -> bool:
    try:
        float(v); return True
    except Exception:
        return False


# ======================= Destination expansion (array of plates) ==============

def _expand_destination(root: Any) -> List[Dict[str, Any]]:
    out = []
    def is_table(obj: Any) -> bool:
        return isinstance(obj, dict) and "wells" in obj and "name" in obj
    def plate_tag_for(idx: int, plate_obj: Any) -> str:
        for key in ("plate_id", "plateId", "plate_name", "plateName", "name", "id"):
            if isinstance(plate_obj, dict) and plate_obj.get(key):
                return f"plate#{idx}:{str(plate_obj.get(key))}"
        return f"plate#{idx}"
    def add_table(plate_tag: str, t: dict):
        tname = (t.get("name") or "").strip() or "unnamed_table"
        out.append({"table": t, "table_name": tname, "plate_tag": plate_tag, "table_id": f"{plate_tag}/{tname}"})
    def handle_plate(idx: int, plate_obj: Any):
        tag = plate_tag_for(idx, plate_obj)
        if isinstance(plate_obj, dict) and "tables" in plate_obj and isinstance(plate_obj["tables"], list):
            for t in plate_obj["tables"]:
                if is_table(t): add_table(tag, t)
        elif is_table(plate_obj):
            add_table(tag, plate_obj)
    if isinstance(root, list):
        for i, item in enumerate(root): handle_plate(i, item)
    elif isinstance(root, dict):
        handle_plate(0, root)
    else:
        raise RuntimeError("Destination must be a dict or a list of plate JSON objects.")
    return out


# ======================= Source parsing =======================================

def _sniff_reader(text: str):
    """
    Prefer TAB (qPCR exports). Fallback to csv.Sniffer, then comma/semicolon.
    Keeps first non-empty row as header.
    """
    sample = (text or "").strip()
    if not sample: return [], []
    if "\n" not in sample:
        return re.split(r"[\t,;]", sample), []
    # Prefer tabs
    first_line = sample.splitlines()[0]
    if "\t" in first_line:
        dialect = csv.excel_tab
    else:
        try:
            dialect = csv.Sniffer().sniff("\n".join(sample.splitlines()[:10]), delimiters=",;\t")
        except Exception:
            class _TDialect(csv.Dialect):
                delimiter = "\t"; quotechar = '"'; doublequote = True
                escapechar = None; lineterminator = "\n"; quoting = csv.QUOTE_MINIMAL
                skipinitialspace = True
            dialect = _TDialect()
    reader = csv.reader(io.StringIO(sample), dialect=dialect)
    rows = [r for r in reader]
    header = None
    for r in rows:
        if any(c.strip() for c in r):
            header = [c.strip() for c in r]; break
    if header is None: return [], []
    body, seen = [], False
    for r in rows:
        if not seen:
            if [c.strip() for c in r] == header: seen = True
            continue
        if any(c.strip() for c in r):
            body.append([c.strip() for c in r])
    return header, body


# ======================= Profiling helpers ====================================

def _profile_values(values: List[str], max_examples: int = 12) -> Dict[str, Any]:
    nonempty = [v for v in values if v != ""]
    examples = []
    for v in values:
        if v not in examples and len(examples) < max_examples:
            examples.append(v)
    numeric = [float(v) for v in nonempty if _is_floaty(v)]
    cats = [v for v in nonempty if not _is_floaty(v)]
    # qPCR-ish tokens (for qualitative columns)
    tok = []
    for v in cats[:500]:
        tok += re.split(r"[^A-Za-z0-9_]+", v)
    tok = [t for t in tok if t]
    common_tokens = Counter([t.lower() for t in tok]).most_common(8)

    stats = {
        "nonempty_ratio": round(len(nonempty)/max(1,len(values)), 3),
        "unique_values": len(set(nonempty)),
        "example_count": len(examples),
        "type_hint": "numeric" if len(numeric) >= max(3, int(0.6*len(nonempty))) else ("categorical" if len(cats) >= max(3, int(0.6*len(nonempty))) else "mixed"),
        "common_tokens": common_tokens
    }
    if numeric:
        stats["min"] = min(numeric)
        stats["max"] = max(numeric)
    return {"examples": examples, "stats": stats}


def _collect_destination_profile(expanded_tables: List[Dict[str,Any]], max_examples: int = 12) -> List[Dict[str, Any]]:
    out = []
    for item in expanded_tables:
        t = item["table"]
        wells = t.get("wells", [])
        headers_by_x = {}
        for w in wells:
            fields = set(map(str.lower, w.get("field", [])))
            if w.get("y") == 0 and "columnheader" in fields:
                headers_by_x[w.get("x")] = str(w.get("value","")).strip()
        if not headers_by_x: continue
        vals_by_x = defaultdict(list)
        for w in wells:
            x, y, val = w.get("x"), w.get("y"), w.get("value")
            if isinstance(x,int) and isinstance(y,int) and y>0 and x in headers_by_x:
                vals_by_x[x].append("" if val is None else str(val))
        cols = []
        for x, colname in headers_by_x.items():
            prof = _profile_values(vals_by_x.get(x, []), max_examples=max_examples)
            cols.append({"name": colname, "examples": prof["examples"], "stats": prof["stats"]})
        out.append({"table_id": item["table_id"], "table": item["table_name"], "plate_tag": item["plate_tag"], "columns": cols})
    return out


def _collect_source_profile(headers: List[str], body: List[List[str]], max_examples: int = 12) -> List[Dict[str, Any]]:
    cols_vals = [[] for _ in headers]
    for r in body:
        for i in range(len(headers)):
            cols_vals[i].append("" if i>=len(r) or r[i] is None else str(r[i]))
    out = []
    for i, h in enumerate(headers):
        prof = _profile_values(cols_vals[i], max_examples=max_examples)
        out.append({"name": h, "examples": prof["examples"], "stats": prof["stats"]})
    return out


# ======================= Heuristic (deterministic) qPCR mapper =================

def _canon(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()

def _semantic_label(header: str, examples: List[str], stats: Dict[str, Any]) -> Tuple[str, float, str]:
    """
    Guess canonical qPCR field + confidence from header + value shape.
    Returns (label, confidence [0..1], reason)
    """
    h = header.strip()
    hl = h.lower()

    # header-driven signals
    for label, pats in QPCR_SYNONYMS.items():
        if _match_any(hl, pats):
            # refine with value shape
            reason = f"Header matches qPCR pattern for {label}"
            conf = 0.78
            if label in {"cq", "cq_mean", "cq_sd", "cq_conf", "threshold", "auto_threshold"} and stats.get("type_hint") == "numeric":
                conf = 0.88; reason += " and values are numeric"
            if label in {"well", "well_position"}:
                if any(_looks_like_well_value(e) for e in examples if e):
                    conf = 0.9; reason += " and examples look like well IDs"
            if label in {"reporter", "quencher"}:
                toks = [t for t,_ in stats.get("common_tokens", [])]
                if any(t in {"fam","vic","cy5","sybr"} for t in toks):
                    conf = 0.9; reason += " and reporter tokens present"
            if label == "amp_status":
                toks = [t for t,_ in stats.get("common_tokens", [])]
                if any(t in {"amp","no","noamp","fail"} for t in toks):
                    conf = 0.86; reason += " and amplification tokens present"
            return label, conf, reason

    # value-shape fallbacks
    if stats.get("type_hint") == "numeric":
        rng = (stats.get("min"), stats.get("max"))
        if rng[0] is not None and rng[1] is not None:
            mn, mx = float(rng[0]), float(rng[1])
            # Cq/Ct typically ~15–40; thresholds typically small (<1) on some systems
            if 10 <= mn <= 45 and 10 <= mx <= 45:
                return "cq_like", 0.6, "Numeric range suggests Cq/Ct"
            if 0 <= mn <= 1.0 and mx <= 2.0:
                return "threshold_like", 0.55, "Small numeric values suggest threshold/baseline"
    if any(_looks_like_well_value(e) for e in examples if e):
        return "well_like", 0.65, "Examples look like well IDs"

    return "", 0.0, "No qPCR signal"

def _pair_score(src_lbl: str, dst_name: str) -> float:
    """Score source label to destination column name affinity."""
    dl = dst_name.lower().strip()
    # strong alignment
    label_to_key = {
        "well": ["well", "position"],
        "well_position": ["position", "well"],
        "sample": ["sample"],
        "target": ["target","assay","gene"],
        "task": ["task","role"],
        "reporter": ["reporter","fam","vic","cy5","sybr"],
        "quencher": ["quencher","bhq","mgb"],
        "amp_status": ["amp","status","amplification"],
        "amp_score": ["amp score","amplification score"],
        "curve_quality": ["curve quality","quality"],
        "result": ["result","call","detected"],
        "result_issues": ["result quality issues"],
        "cq": ["cq","ct","mean cq","mean ct"],
        "cq_mean": ["cq mean","ct mean","mean cq","mean ct","avg"],
        "cq_sd": ["cq sd","ct sd","stdev"],
        "cq_conf": ["cq confidence","ct confidence","conf"],
        "threshold": ["threshold","cthresh"],
        "auto_threshold": ["auto threshold"],
        "baseline": ["baseline"],
        "auto_baseline": ["auto baseline"],
        "cq_like": ["cq","ct","mean"],
        "threshold_like": ["threshold","baseline"],
        "well_like": ["well","position"]
    }
    keys = label_to_key.get(src_lbl, [])
    for k in keys:
        if re.search(re.escape(k), dl):
            return 0.85
    return 0.0

def _heuristic_map(source_profile, dest_profile) -> dict:
    mapping_by_src: Dict[str, Dict[str, Any]] = {}
    # Precompute destination name list
    dest_cols = []
    for t in dest_profile:
        for c in t.get("columns", []):
            dest_cols.append((t["table_id"], t["table"], c["name"]))

    for sp in source_profile:
        sname = sp["name"]
        lbl, base_conf, reason = _semantic_label(sname, sp.get("examples", []), sp.get("stats", {}))
        if not lbl:
            continue
        bests = []
        for table_id, table_name, dcol in dest_cols:
            score = _pair_score(lbl, dcol)
            if score > 0:
                # modulate confidence by base_conf
                conf = round(min(1.0, base_conf * 0.6 + score * 0.6), 3)
                bests.append({"table_id": table_id, "table": table_name, "column": dcol,
                              "confidence": conf, "rationale": f"Heuristic qPCR mapping: {reason} → {lbl} vs '{dcol}'"})
        if bests:
            # de-dup columns; keep top few
            bests.sort(key=lambda x: x["confidence"], reverse=True)
            mapping_by_src[sname] = {"src_col": sname, "targets": bests[:4]}

    return {"mapping": list(mapping_by_src.values())}


# ======================= GPT call (qPCR-specialized) ==========================

def _fmt_stats(st: dict) -> str:
    bits = [f"type={st.get('type_hint','?')}", f"nonempty={st.get('nonempty_ratio',0)}", f"unique={st.get('unique_values',0)}"]
    if "min" in st and "max" in st: bits.append(f"range=[{st['min']},{st['max']}]")
    toks = st.get("common_tokens") or []
    if toks: bits.append("tokens=" + ",".join(t for t,_ in toks[:6]))
    return "; ".join(bits)

def _qpcr_syn_table() -> str:
    lines = []
    for k, vs in QPCR_SYNONYMS.items():
        lines.append(f"- {k}: " + ", ".join(vs))
    return "\n".join(lines)

def _chat_gpt_map(source_profile, dest_profile, *, model="gpt-4o-mini", temperature=0.0) -> dict:
    if model and str(model).lower() in {"none", "off"}:
        # Explicitly disabled
        return {"mapping": []}

    if OpenAI is None:
        raise RuntimeError("OpenAI client not available; set model='none' to disable GPT.")

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI()
    system = (
        "You are a precise qPCR schema mapper.\n"
        "Goal: map SOURCE columns to DESTINATION table columns (possibly multiple tables).\n"
        "The data are qPCR exports (Cq/Ct, Amp Status, Reporter/Quencher, Threshold, Baseline, Sample, Target, etc.).\n"
        "Use header semantics + example values + ranges (e.g., Cq 15–40; thresholds small) and tokens (FAM, VIC, CY5, Amp/No Amp).\n"
        "NEVER invent destination names or IDs. If no good match, return empty targets for that source.\n"
        "Return STRICT JSON with only one key: 'mapping'. Confidence in [0,1].\n"
        "Prefer exact/near synonym matches from the table below; otherwise use value-shape reasoning.\n"
    )
    syn_table = _qpcr_syn_table()

    lines = []
    lines.append("qPCR SYNONYMS (regex-style hints):")
    lines.append(syn_table)
    lines.append("")
    lines.append("SOURCE COLUMNS:")
    for col in source_profile:
        ex = ", ".join(repr(e) for e in col.get("examples", [])[:6])
        lines.append(f"- {col['name']}: examples=[{ex}] ; {_fmt_stats(col.get('stats',{}))}")
    lines.append("")
    lines.append("DESTINATION TABLES:")
    for t in dest_profile:
        lines.append(f"* {t['table_id']} (table={t['table']}, plate={t['plate_tag']}):")
        for c in t.get("columns", []):
            ex = ", ".join(repr(e) for e in c.get("examples", [])[:5])
            lines.append(f"  - {c['name']}: examples=[{ex}] ; {_fmt_stats(c.get('stats',{}))}")
    lines.append("")
    lines.append('Return JSON EXACTLY like: {"mapping":[{"src_col":"<source>","targets":[{"table_id":"<id>","table":"<t>","column":"<c>","confidence":0.0-1.0,"rationale":"..."}]}]}')
    lines.append("Rules: a source column may map to multiple destinations; do not invent names or ids; confidence in [0,1].")
    user = "\n".join(lines)

    resp = client.chat.completions.create(
        model=model,
        messages=[{"role":"system","content":system},{"role":"user","content":user}],
        temperature=temperature,
        response_format={"type":"json_object"},
    )
    content = (resp.choices[0].message.content or "").strip()
    data = json.loads(content)
    if isinstance(data, dict) and "mapping" in data:
        return {"mapping": data["mapping"]}
    raise RuntimeError("Model did not return the expected {'mapping': [...]} object")


# ======================= Exact-name fallback (as before) =======================

def _exact_match_fallback(source_profile, dest_profile, current: dict) -> dict:
    by_col = defaultdict(list)
    for t in dest_profile:
        for c in t.get("columns", []):
            by_col[c["name"]].append({"table_id": t["table_id"], "table": t["table"], "column": c["name"]})

    mapping_by_src = {m.get("src_col"): m for m in current.get("mapping", [])}
    mapped_pairs = set((tg.get("table_id"), tg.get("column")) for m in current.get("mapping", []) for tg in m.get("targets", []))

    # Normalize with common qPCR equivalences (e.g., Ct == Cq)
    def norm(h: str) -> str:
        h2 = h.lower().strip()
        h2 = re.sub(r"\s+", " ", h2)
        h2 = h2.replace("ct ", "cq ").replace(" ct", " cq").replace(" ct ", " cq ")
        h2 = h2.replace("ct", "cq")  # crude but effective for header equality
        return h2

    dest_norm = defaultdict(list)
    for t in dest_profile:
        for c in t.get("columns", []):
            dest_norm[norm(c["name"])].append({"table_id": t["table_id"], "table": t["table"], "column": c["name"]})

    for sp in source_profile:
        name = sp["name"]
        candidates = by_col.get(name, []) + dest_norm.get(norm(name), [])
        if not candidates: continue
        entry = mapping_by_src.get(name)
        if not entry:
            entry = {"src_col": name, "targets": []}
            mapping_by_src[name] = entry
        for tg in candidates:
            key = (tg["table_id"], tg["column"])
            if key not in mapped_pairs:
                entry["targets"].append({**tg, "confidence": 0.9, "rationale": "Exact/normalized header match (Ct~Cq) (fallback)"})
                mapped_pairs.add(key)

    return {"mapping": list(mapping_by_src.values())}


# ======================= Main (Ion) ===========================================

def main_ion() -> int:
    try:
        p1 = works.param(1)  # destination plates (array/dict)
        p2 = works.param(2)  # source table text
    except Exception:
        works.resolve({"status":"❌ error","error":"Missing required parameters: destination plates JSON and source table text"})
        return 1

    model = (works.param(3) or "gpt-4o-mini")
    try:
        temperature = float(works.param(4) or 0.0)
    except Exception:
        temperature = 0.0
    try:
        sample_size = int(works.param(5) or 12)
    except Exception:
        sample_size = 12
    use_fallback_raw = (works.param(6) or "true")
    use_exact_fallback = str(use_fallback_raw).strip().lower() not in {"false","0","no","off"}

    # Parse destination
    try:
        dest_root = p1 if isinstance(p1, (dict, list)) else json.loads(str(p1))
        expanded = _expand_destination(dest_root)
        if not expanded: raise RuntimeError("No tables found in destination plates JSON.")
    except Exception as e:
        works.resolve({"status":"❌ error","error":f"Failed to parse destination plates JSON: {e}"})
        return 1

    # Parse source
    headers, body = _sniff_reader(str(p2))
    if not headers:
        works.resolve({"status":"❌ error","error":"Source table has no headers"})
        return 1

    # Profiles
    dest_profile = _collect_destination_profile(expanded, max_examples=sample_size)
    source_profile = _collect_source_profile(headers, body, max_examples=sample_size)

    # 1) Deterministic qPCR heuristic mapping
    result = _heuristic_map(source_profile, dest_profile)

    # 2) Optional GPT mapping (qPCR specialized)
    try:
        gpt_map = _chat_gpt_map(source_profile, dest_profile, model=str(model), temperature=temperature)
        # merge: prefer higher-confidence targets, unify by (src, table_id, column)
        by_src = {m["src_col"]: m for m in result.get("mapping", [])}
        for m in gpt_map.get("mapping", []):
            entry = by_src.setdefault(m["src_col"], {"src_col": m["src_col"], "targets": []})
            existing = {(t["table_id"], t["column"]): t for t in entry["targets"]}
            for tg in m.get("targets", []):
                key = (tg["table_id"], tg["column"])
                if key in existing:
                    if tg.get("confidence", 0) > existing[key].get("confidence", 0):
                        existing[key].update(tg)
                else:
                    existing[key] = tg
            entry["targets"] = sorted(existing.values(), key=lambda x: x.get("confidence", 0), reverse=True)[:6]
        result = {"mapping": list(by_src.values())}
    except Exception as e:
        # If GPT disabled or fails, keep heuristic result
        if str(model).lower() not in {"none","off"}:
            # Report as non-fatal info
            pass

    # 3) Exact/normalized fallback (Ct ~ Cq, exact header)
    if use_exact_fallback:
        result = _exact_match_fallback(source_profile, dest_profile, result)

    works.resolve(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main_ion())
