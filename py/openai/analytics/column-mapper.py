#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
gpt_header_mapper_ion_v2_array_min.py
-------------------------------------
Ion Works-only mapper (destination: array of plate JSON objects). Returns ONLY the
mapped columns—no profiles, no unmapped lists.

Output shape:
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
"""

from typing import List, Dict, Tuple, Optional, Any
import os, json, re, csv, io
from collections import Counter, defaultdict

# Ion Works
from ion import works  # type: ignore

# OpenAI client
from openai import OpenAI


# ---------- Destination expansion (array of plates) ----------
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


# ---------- Source parsing ----------
def _sniff_reader(text: str):
    sample = (text or "").strip()
    if not sample: return [], []
    if "\n" not in sample: return re.split(r"[\t,;]", sample), []
    try:
        first_two = "\n".join(sample.splitlines()[:2])
        dialect = csv.Sniffer().sniff(first_two)
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
        body.append([c.strip() for c in r])
    return header, body


# ---------- Profiling helpers ----------
def _profile_values(values: List[str], max_examples: int = 12) -> Dict[str, Any]:
    nonempty = [v for v in values if v != ""]
    examples = []
    for v in values:
        if v not in examples and len(examples) < max_examples:
            examples.append(v)
    def is_float(s: str) -> bool:
        try: float(s); return True
        except Exception: return False
    numeric = [float(v) for v in nonempty if is_float(v)]
    cats = [v for v in nonempty if not is_float(v)]
    stats = {
        "nonempty_ratio": round(len(nonempty)/max(1,len(values)), 3),
        "unique_values": len(set(nonempty)),
        "example_count": len(examples),
        "type_hint": "numeric" if len(numeric) >= max(3, int(0.6*len(nonempty))) else ("categorical" if len(cats) >= max(3, int(0.6*len(nonempty))) else "mixed")
    }
    if numeric:
        stats["min"] = min(numeric)
        stats["max"] = max(numeric)
    tok = []
    for v in cats[:500]: tok += re.split(r"[^A-Za-z0-9_]+", v)
    tok = [t for t in tok if t]
    if tok:
        from collections import Counter
        stats["common_tokens"] = Counter([t.lower() for t in tok]).most_common(6)
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


# ---------- GPT call ----------
def _fmt_stats(st: dict) -> str:
    bits = [f"type={st.get('type_hint','?')}", f"nonempty={st.get('nonempty_ratio',0)}", f"unique={st.get('unique_values',0)}"]
    if "min" in st and "max" in st: bits.append(f"range=[{st['min']},{st['max']}]")
    toks = st.get("common_tokens")
    if toks: bits.append("tokens=" + ",".join(t for t,_ in toks[:4]))
    return "; ".join(bits)

def _chat_gpt_map(source_profile, dest_profile, *, model="gpt-4o-mini", temperature=0.0) -> dict:
    if not os.getenv("OPENAI_API_KEY"): raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    system = (
        
        "Return ONLY a JSON object with keys:"
        "You are a precise schema mapper. "
        "Given SOURCE columns (headers + example values + stats) and DESTINATION tables (table_id, table name, columns with examples + stats), "
        "produce a mapping from each SOURCE column to zero or more DESTINATION columns across any tables. "
        "Use both header semantics and value characteristics (A1/A2 well positions, Cq numeric ranges, FAM/UNKNOWN/Amp tokens, booleans). "
        "Return STRICT JSON only with key 'mapping'."
    )
    lines = []
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
    # Ensure only 'mapping' key
    if isinstance(data, dict) and "mapping" in data:
        return {"mapping": data["mapping"]}
    raise RuntimeError("Model did not return the expected {'mapping': [...]} object")


# ---------- Exact-name fallback (minimal) ----------
def _exact_match_fallback(source_profile, dest_profile, current: dict) -> dict:
    # Build index of destination by column name
    by_col = defaultdict(list)
    for t in dest_profile:
        for c in t.get("columns", []):
            by_col[c["name"]].append({"table_id": t["table_id"], "table": t["table"], "column": c["name"]})
    # Extend mapping
    mapping_by_src = {m.get("src_col"): m for m in current.get("mapping", [])}
    mapped_pairs = set((tg.get("table_id"), tg.get("column")) for m in current.get("mapping", []) for tg in m.get("targets", []))
    for sp in source_profile:
        name = sp["name"]
        dests = by_col.get(name)
        if not dests: continue
        entry = mapping_by_src.get(name)
        if not entry:
            entry = {"src_col": name, "targets": []}
            mapping_by_src[name] = entry
        for tg in dests:
            key = (tg["table_id"], tg["column"])
            if key not in mapped_pairs:
                entry["targets"].append({**tg, "confidence": 0.9, "rationale": "Exact column-name match (fallback)"})
                mapped_pairs.add(key)
    return {"mapping": list(mapping_by_src.values())}


# ---------- Main (Ion) ----------
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

    # GPT mapping
    try:
        result = _chat_gpt_map(source_profile, dest_profile, model=str(model), temperature=temperature)
    except Exception as e:
        works.resolve({"status":"❌ error","error":str(e)})
        return 1

    # Exact fallback (optional)
    if use_exact_fallback:
        result = _exact_match_fallback(source_profile, dest_profile, result)

    works.resolve(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main_ion())
