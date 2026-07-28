#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works: Algorithmic column mapping (destination <- pasted text source)

Params (via ion.works):
  param(1): destination table (dict or JSON string) — accepts import
  param(2): source table as pasted text (TSV/CSV; may contain literal '\t' and '\r\n' sequences)

Output:
{
  "status": "ok",
  "destination_table": "...",
  "source_table": "(pasted text)",
  "destination_headers": [...],
  "source_headers": [...],
  "mapping": [{"to":"DestCol","from":"SrcCol","score":0.87,"reasons":[...]}],
  "unmapped_destination": [...],
  "unused_source": [...],
  "strategy": { "threshold": 0.45, "weights": {...}, "notes": [...] }
}
"""

import json, re, math, csv, io
from typing import Any, Dict, List, Tuple, Optional

from ion import works  # type: ignore

# --------------------- small utils ---------------------

def _safe_str(v: Any) -> str:
    return "" if v is None else str(v)

def _cell_value(cell: Any) -> str:
    if isinstance(cell, dict):
        if "value" in cell and cell["value"] not in (None, ""):
            return _safe_str(cell["value"]).strip()
        for k in ("name","position","label","title"):
            v = cell.get(k)
            if v not in (None, ""):
                return _safe_str(v).strip()
        props = cell.get("properties")
        if isinstance(props, dict):
            for k in ("header","title","label"):
                v = props.get(k)
                if v not in (None, ""):
                    return _safe_str(v).strip()
        return ""
    return _safe_str(cell).strip()

def synth_headers(n: int) -> List[str]:
    return [f"Col{i+1}" for i in range(max(0, n))]

# --------------------- extract destination (structured) ---------------------

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
    return [h if (h or "").strip() else f"Col{i+1}" for i,h in enumerate(hdrs)]

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
    return [h if (h or "").strip() else f"Col{i+1}" for i,h in enumerate(headers)]

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
        return name, headers, _rows_from_flat_grid(table, width)
    headers = _headers_from_2d_wells(table)
    if headers is not None:
        width = len(headers)
        return name, headers, _rows_from_2d_wells(table, width)
    return name, ["Col1"], []

# --------------------- parse pasted text (source) ---------------------

def _unescape_if_literal(s: str) -> str:
    """If the text contains literal escape sequences like '\\t' or '\\r\\n', unescape once."""
    if "\\t" in s or "\\r" in s or "\\n" in s:
        try:
            return bytes(s, "utf-8").decode("unicode_escape")
        except Exception:
            return s
    return s

def _detect_delimiter(header_line: str) -> str:
    counts = {
        "\t": header_line.count("\t"),
        ",": header_line.count(","),
        ";": header_line.count(";"),
        "|": header_line.count("|"),
    }
    # prefer tab if ties (common for pasted qPCR exports)
    return max(counts.items(), key=lambda kv: (kv[1], 1 if kv[0]=="\t" else 0))[0]

def parse_pasted_table(text: str) -> Tuple[str, List[str], List[List[str]]]:
    text = _unescape_if_literal(text)
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln for ln in text.split("\n") if ln is not None]
    # Skip leading empty lines
    while lines and not lines[0].strip():
        lines.pop(0)
    if not lines:
        return "(pasted text)", ["Col1"], []
    delim = _detect_delimiter(lines[0])
    reader = csv.reader(io.StringIO("\n".join(lines)), delimiter=delim)
    rows = [row for row in reader]
    # trim trailing empties per row
    for i, r in enumerate(rows):
        j = len(r)
        while j > 0 and (r[j-1] is None or str(r[j-1]).strip() == ""):
            j -= 1
        rows[i] = r[:j]
    if not rows:
        return "(pasted text)", ["Col1"], []
    headers = [h.strip() for h in rows[0]]
    data = [[(c or "").strip() for c in r] for r in rows[1:] if any((c or "").strip() for c in r)]
    # ensure at least one header
    if not any(h for h in headers):
        headers = synth_headers(max((len(r) for r in data), default=1))
    return "(pasted text)", headers, data

# --------------------- sampling + datatypes ---------------------

_NUM_RE = re.compile(r"""^[\s]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[\s]*$""")
_INT_RE = re.compile(r"""^[\s]*[+-]?\d+[\s]*$""")
_BOOL_TRUE = {"true","t","yes","y","1","on"}
_BOOL_FALSE = {"false","f","no","n","0","off"}
_DATE_LITE_RE = re.compile(r"""^\s*(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*$""")

def _infer_type(col_samples: List[str]) -> str:
    vals = [s.strip() for s in col_samples if s and s.strip()]
    if not vals:
        return "text"
    if all(v.lower() in (_BOOL_TRUE | _BOOL_FALSE) for v in vals):
        return "bool"
    if sum(1 for v in vals if _DATE_LITE_RE.match(v)) >= max(1, len(vals)//2):
        return "date"
    if all(_NUM_RE.match(v) for v in vals):
        if all(_INT_RE.match(v) for v in vals):
            return "int"
        return "float"
    return "text"

def build_column_samples(headers: List[str], rows: List[List[str]], cap: int = 50) -> Dict[str, List[str]]:
    out = {h: [] for h in headers}
    w = len(headers)
    for r in rows:
        for i in range(w):
            v = (r[i] if i < len(r) else "").strip()
            if v and v not in out[headers[i]]:
                out[headers[i]].append(v)
    for h in headers:
        out[h] = out[h][:cap]
    return out

# --------------------- header normalization & vectorizers ---------------------

def norm_header(h: str) -> str:
    h = (h or "").strip()
    h = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", h)
    h = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", h)
    h = h.lower()
    h = re.sub(r"[^a-z0-9%µ ]+", " ", h)
    h = re.sub(r"\s+", " ", h).strip()
    return h

def tokens(h: str) -> List[str]:
    h = norm_header(h)
    return re.findall(r"[a-z0-9%µ]+", h)

def char_ngrams(s: str, n: int = 3) -> List[str]:
    s = norm_header(s)
    if not s: return []
    pad = f"^{s}$"
    return [pad[i:i+n] for i in range(max(0, len(pad)-n+1))]

def build_tfidf(corpus: List[List[str]]) -> Tuple[List[Dict[str,float]], Dict[str,float]]:
    df: Dict[str,int] = {}
    for doc in corpus:
        for t in set(doc):
            df[t] = df.get(t, 0) + 1
    N = max(1, len(corpus))
    idf: Dict[str,float] = {t: math.log((N + 1) / (df_t + 1)) + 1.0 for t, df_t in df.items()}
    vecs: List[Dict[str,float]] = []
    for doc in corpus:
        tf: Dict[str,int] = {}
        for t in doc:
            tf[t] = tf.get(t, 0) + 1
        v: Dict[str,float] = {t: (tf[t] * idf.get(t, 0.0)) for t in tf}
        norm = math.sqrt(sum(x*x for x in v.values())) or 1.0
        v = {t: x / norm for t, x in v.items()}
        vecs.append(v)
    return vecs, idf

def cosine(v1: Dict[str,float], v2: Dict[str,float]) -> float:
    if not v1 or not v2: return 0.0
    if len(v1) > len(v2): v1, v2 = v2, v1
    s = 0.0
    for k, x in v1.items():
        y = v2.get(k)
        if y is not None:
            s += x * y
    return max(0.0, min(1.0, s))

# --------------------- edit similarity & value tokens ---------------------

def edit_distance(a: str, b: str, cap: int = 64) -> int:
    a = norm_header(a)[:cap]; b = norm_header(b)[:cap]
    da, db = len(a), len(b)
    dp = list(range(db+1))
    for i in range(1, da+1):
        prev, dp[0] = dp[0], i
        for j in range(1, db+1):
            cur = dp[j]
            cost = 0 if a[i-1] == b[j-1] else 1
            dp[j] = min(dp[j] + 1, dp[j-1] + 1, prev + cost)
            prev = cur
    return dp[db]

def norm_edit_sim(a: str, b: str) -> float:
    a = norm_header(a); b = norm_header(b)
    if not a and not b: return 0.0
    d = edit_distance(a, b)
    m = max(1, len(a), len(b))
    return 1.0 - (d / m)

VAL_TOKEN_RE = re.compile(r"[a-z0-9%µ]+")

def value_tokens(values: List[str], cap: int = 200) -> List[str]:
    toks: List[str] = []
    for v in values[:cap]:
        v = v.lower().strip()
        toks += VAL_TOKEN_RE.findall(v)
    return toks

def jaccard(a: List[str], b: List[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb: return 0.0
    return len(sa & sb) / max(1, len(sa | sb))

# --------------------- datatype & scoring ---------------------

def dtype_compat(dst_samples: List[str], src_samples: List[str]) -> float:
    d_dst = _infer_type(dst_samples)
    d_src = _infer_type(src_samples)
    if d_dst == d_src:
        return 1.0
    num = {"int","float"}
    if d_dst in num and d_src in num:
        return 0.7
    if (d_dst == "text" and d_src != "date") or (d_src == "text" and d_dst != "date"):
        return 0.3
    return 0.0

WEIGHTS = {
    "token_cos": 0.42,
    "char3_cos": 0.28,
    "edit":      0.15,
    "dtype":     0.10,
    "valtok":    0.05,
}

THRESHOLD = 0.45

def build_header_vectors(dst_headers: List[str], src_headers: List[str]):
    all_headers = dst_headers + src_headers
    tok_corpus = [tokens(h) for h in all_headers]
    tok_vecs, _ = build_tfidf(tok_corpus)
    ch_corpus = [char_ngrams(h, 3) for h in all_headers]
    ch_vecs, _ = build_tfidf(ch_corpus)
    n_dst = len(dst_headers)
    return tok_vecs[:n_dst], tok_vecs[n_dst:], ch_vecs[:n_dst], ch_vecs[n_dst:]

def score_pair(dst_h: str, src_h: str, i_d: int, i_s: int,
               dst_tok_vecs, src_tok_vecs, dst_ch_vecs, src_ch_vecs,
               dst_samples: List[str], src_samples: List[str]) -> Tuple[float, List[str]]:
    reasons: List[str] = []
    tc = cosine(dst_tok_vecs[i_d], src_tok_vecs[i_s]);  cc = cosine(dst_ch_vecs[i_d], src_ch_vecs[i_s])
    ed = norm_edit_sim(dst_h, src_h)
    if tc > 0: reasons.append(f"token-cos {tc:.2f}")
    if cc > 0: reasons.append(f"char3-cos {cc:.2f}")
    if ed > 0: reasons.append(f"edit {ed:.2f}")
    dt = dtype_compat(dst_samples, src_samples)
    if dt > 0: reasons.append(f"dtype {dt:.2f}")
    vj = jaccard(value_tokens(dst_samples), value_tokens(src_samples))
    if vj > 0: reasons.append(f"value-token J {vj:.2f}")
    score = (WEIGHTS["token_cos"]*tc + WEIGHTS["char3_cos"]*cc + WEIGHTS["edit"]*ed +
             WEIGHTS["dtype"]*dt + WEIGHTS["valtok"]*vj)
    return score, reasons

def greedy_assign(dst_headers: List[str], src_headers: List[str],
                  samples_dst: Dict[str, List[str]], samples_src: Dict[str, List[str]]) -> Tuple[List[Dict[str, Any]], List[str], List[str]]:
    dst_tok, src_tok, dst_ch3, src_ch3 = build_header_vectors(dst_headers, src_headers)
    candidates: List[Tuple[float, int, int, List[str]]] = []
    for i_d, d in enumerate(dst_headers):
        for i_s, s in enumerate(src_headers):
            sc, rs = score_pair(d, s, i_d, i_s, dst_tok, src_tok, dst_ch3, src_ch3,
                                samples_dst.get(d, []), samples_src.get(s, []))
            if sc >= THRESHOLD:
                candidates.append((sc, i_d, i_s, rs))
    candidates.sort(key=lambda x: x[0], reverse=True)
    used_d, used_s = set(), set()
    mapping: List[Dict[str, Any]] = []
    for sc, i_d, i_s, rs in candidates:
        if i_d in used_d or i_s in used_s: continue
        used_d.add(i_d); used_s.add(i_s)
        mapping.append({"to": dst_headers[i_d], "from": src_headers[i_s],
                        "score": round(float(sc), 4), "reasons": rs})
    unmapped_dst = [dst_headers[i] for i in range(len(dst_headers)) if i not in used_d]
    unused_src   = [src_headers[i] for i in range(len(src_headers)) if i not in used_s]
    return mapping, unmapped_dst, unused_src

# --------------------- main ---------------------

def _ensure_dest_table(obj: Any, idx: int) -> Dict[str, Any]:
    if isinstance(obj, str):
        try:
            obj = json.loads(obj)
        except Exception as e:
            works.resolve({"status":"❌ error", "error": f"Param {idx} is not valid JSON for destination table: {e}"})
            raise SystemExit(1)
    if not isinstance(obj, dict):
        works.resolve({"status":"❌ error", "error": f"Param {idx} must be a table dict or JSON string."})
        raise SystemExit(1)
    return obj

def main() -> int:
    try:
        dst_raw = works.param(1)
        src_text = works.param(2)
    except Exception:
        works.resolve({"status":"❌ error", "error":"Expecting two params: destination table (dict/JSON), source as pasted text"})
        return 1

    # Destination: structured
    dst = _ensure_dest_table(dst_raw, 1)
    dst_name, dst_headers, dst_rows = extract_headers_rows_and_name(dst)
    if not dst_headers:
        dst_headers = synth_headers(len(dst_rows[0]) if dst_rows else 1)

    # Source: pasted text
    if not isinstance(src_text, str):
        works.resolve({"status":"❌ error", "error":"Param 2 must be a pasted text string (TSV/CSV)."})
        return 1
    src_name, src_headers, src_rows = parse_pasted_table(src_text)
    if not src_headers:
        src_headers = synth_headers(len(src_rows[0]) if src_rows else 1)

    # Samples
    samples_dst = build_column_samples(dst_headers, dst_rows, cap=50)
    samples_src = build_column_samples(src_headers, src_rows, cap=50)

    # Mapping
    mapping, unmapped_dst, unused_src = greedy_assign(dst_headers, src_headers, samples_dst, samples_src)

    result = {
        "status": "ok",
        "source": "local",
        "destination_table": dst_name,
        "source_table": src_name,
        "destination_headers": dst_headers,
        "source_headers": src_headers,
        "mapping": mapping,
        "unmapped_destination": unmapped_dst,
        "unused_source": unused_src,
        "strategy": {
            "threshold": THRESHOLD,
            "weights": WEIGHTS,
            "notes": [
                "Param(2) parsed as pasted text; auto-detected delimiter; literal escapes unescaped if present.",
                "No curated hints (no synonyms/units). Purely algorithmic similarities:",
                "token TF-IDF cosine, char 3-gram TF-IDF cosine, normalized edit similarity, datatype compatibility, value-token Jaccard.",
                "Greedy one-to-one assignment by descending score; pairs below threshold are ignored."
            ]
        }
    }
    works.resolve(result)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
