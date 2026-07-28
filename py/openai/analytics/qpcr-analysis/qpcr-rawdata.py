#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Ion Works analyzer (Python, ChatGPT-assisted)

Input (Ion Works):
  1: import_table (string; Excel paste or CSV/TSV text)
  2: [optional] model name (default: "gpt-4o-mini")

Output (works.resolve):
{
  "status": "ok",
  "source": "chatgpt" | "heuristic",
  "model": "gpt-4o-mini",
  "delimiter": "\t",
  "headers": ["Well", "Target", "Sample", "Cq", ...],
  "detected": {
    "well_columns": [0],
    "cq_columns": [3],
    "control_rows": [5, 18, ...],      # 0-based indices within body (header excluded)
    "replicate_groups": [
      {"key": {"Sample":"S1","Target":"GAPDH","Task":"Unknown"}, "row_indices":[0,1,2], "count":3}
    ],
    "column_roles": {"Well":"well","Target":"target","Sample":"sample","Cq":"cq", ...}
  }
}
"""

from typing import Any, Dict, List, Tuple, Optional
import json, csv, io, re, os

from ion import works  # type: ignore

# ------------------------------ Fallback heuristics ---------------------------

QPCR_HEADER_PATTERNS = {
    "well":    [r"^well$", r"^well\s*id$", r"^id$", r"^pos$", r"^well\s*#", r"^index$", r"^well\s*position$", r"^position$"],
    "sample":  [r"^sample(\s*name)?$", r"^sample\s*id$", r"^id\s*sample$"],
    "target":  [r"^target$", r"^assay$", r"^gene$", r"^amplicon$"],
    "task":    [r"^task$", r"^role$", r"^unknown$", r"^standard$", r"^neg(ative)?\s*ctrl?$", r"^pos(itive)?\s*ctrl?$"],
    "cq":      [r"^cq$", r"^ct$", r"^cq\s*value$", r"^ct\s*value$", r"^cq\s*mean$", r"^ct\s*mean$", r"^(cq|ct)\s*(avg|mean)$"],
}

# Expanded control tokens (added: UTC, untreated, control, vehicle, mock, calibrator, standard/std, etc.)
CONTROL_TOKENS = [
    r"\bNTC\b", r"\bNAC\b", r"\bNO\s*TEMPLATE\b", r"\bNO\s*RT\b",
    r"\bWATER\b", r"\bH2O\b", r"\bBLANK\b",
    r"\bNEG(ATIVE)?\b(?:\s*(CTRL|CONTROL|CTRL|CTL))?",   # NEG / NEGATIVE [/ CONTROL]
    r"\bPOS(ITIVE)?\b(?:\s*(CTRL|CONTROL|CTRL|CTL))?",   # POS / POSITIVE [/ CONTROL]
    r"\bCTRL?\b", r"\bCONTROL\b",                        # generic control
    r"\bUTC\b",                                          # untreated control
    r"\bUNTREATED\b",
    r"\bVEH(ICLE)?\b",
    r"\bMOCK\b",
    r"\bCALIBRATOR\b",
    r"\bSTANDARD\b", r"\bSTD\b",
    r"\bREFERENCE\b", r"\bREF\b",
    r"\bUNKNOWN\b", r"\bUNKN(OWN)?\b"
]
CONTROL_RX = re.compile("|".join(CONTROL_TOKENS), re.IGNORECASE)

# A/H well like values (supports 96/384 loosely): A1, A01, AA12, H24, etc.
WELLVAL_RE = re.compile(r"^[A-Ha-h](?:[A-Za-z])?\s*0?(?:[1-9]|[1-2]\d|3[0-6])$")

def _rx_any(patterns: List[str]) -> re.Pattern:
    return re.compile("(" + "|".join(patterns) + ")", re.IGNORECASE)

def _match_header(name: str, patterns: List[str]) -> bool:
    return bool(_rx_any(patterns).search((name or "").strip()))

def _is_floaty(v: str) -> bool:
    try: float(v); return True
    except Exception: return False

def _looks_like_well(v: str) -> bool:
    return bool(WELLVAL_RE.match((v or "").strip()))

# ------------------------------ Parsing utils --------------------------------

def detect_delimiter(sample: str) -> str:
    sample = sample or ""
    lines = [l for l in sample.splitlines() if l]
    if not lines:
        return ","
    if "\t" in lines[0]:
        return "\t"
    try:
        dialect = csv.Sniffer().sniff("\n".join(lines[:10]), delimiters=",;\t|")
        return dialect.delimiter
    except Exception:
        candidates = ["\t", ",", ";", "|"]
        best = (None, -1.0, -1.0)
        for d in candidates:
            counts = [len(l.split(d)) for l in lines]
            avg = sum(counts)/len(counts)
            var = sum((c-avg)**2 for c in counts)/len(counts)
            cons = 1.0/(var + 1e-4)
            if (cons, avg) > (best[1], best[2]):
                best = (d, cons, avg)
        return best[0] or ","

def parse_table(text: str) -> Tuple[List[str], List[List[str]], str]:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    if not text.strip():
        return [], [], ","
    delim = detect_delimiter(text)
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    rows = [[c.strip() for c in r] for r in reader if any(c.strip() for c in r)]
    if not rows:
        return [], [], delim
    header = rows[0]
    body = rows[1:] if len(rows) > 1 else []
    return header, body, delim

# ------------------------------ Heuristic fallback ----------------------------

def heuristic_analyze(header: List[str], body: List[List[str]], delim: str) -> Dict[str, Any]:
    roles: Dict[str, str] = {}
    for h in header:
        hl = (h or "").strip().lower()
        if _match_header(h, QPCR_HEADER_PATTERNS["well"]): roles[hl] = "well"
        elif _match_header(h, QPCR_HEADER_PATTERNS["sample"]): roles[hl] = "sample"
        elif _match_header(h, QPCR_HEADER_PATTERNS["target"]): roles[hl] = "target"
        elif _match_header(h, QPCR_HEADER_PATTERNS["task"]): roles[hl] = "task"
        elif _match_header(h, QPCR_HEADER_PATTERNS["cq"]): roles[hl] = "cq"

    cols = len(header)
    col_values: List[List[str]] = [[] for _ in range(cols)]
    for r in body:
        for i in range(cols):
            col_values[i].append("" if i >= len(r) else r[i])

    for i, h in enumerate(header):
        hl = (h or "").strip().lower()
        vals = [v for v in col_values[i] if v != ""]
        if roles.get(hl) is None and vals:
            if sum(1 for v in vals if _looks_like_well(v)) >= max(3, int(0.3*len(vals))):
                roles[hl] = "well"
        if roles.get(hl) is None and vals:
            numeric = [float(v) for v in vals if _is_floaty(v)]
            if numeric:
                mn, mx = min(numeric), max(numeric)
                if 10.0 <= mn <= 45.0 and 10.0 <= mx <= 45.0:
                    roles[hl] = "cq"
        if roles.get(hl) is None:
            roles[hl] = "other"

    well_cols = [i for i, h in enumerate(header) if roles.get(h.lower()) == "well"]
    cq_cols   = [i for i, h in enumerate(header) if roles.get(h.lower()) == "cq"]

    # Prefer scanning Sample/Task/Target columns; fallback to entire row
    key_cols = [i for i, h in enumerate(header) if roles.get(h.lower()) in {"sample","task","target"}]
    control_rows: List[int] = []
    for ri, row in enumerate(body):
        hay = " ".join([row[i] for i in key_cols if i < len(row)]) if key_cols else " ".join(row)
        if CONTROL_RX.search(hay or ""):
            control_rows.append(ri)

    # replicate groups
    hl = [h.lower() for h in header]
    idx = {
        "sample": [i for i, h in enumerate(hl) if roles.get(h) == "sample"],
        "target": [i for i, h in enumerate(hl) if roles.get(h) == "target"],
        "task":   [i for i, h in enumerate(hl) if roles.get(h) == "task"],
    }

    def first_role(row, role):
        for i in idx.get(role, []):
            if i < len(row) and row[i] != "": return row[i]
        return None

    order = [("sample","target","task"), ("sample","target"), ("sample",), ("target",)]
    chosen = None
    for tpl in order:
        if all(idx.get(r) for r in tpl): chosen = tpl; break

    groups: Dict[tuple, List[int]] = {}
    keys_meta: Dict[tuple, Dict[str,str]] = {}
    if chosen:
        for ri, row in enumerate(body):
            vals, meta, ok = [], {}, True
            for r in chosen:
                v = first_role(row, r)
                if v is None or str(v).strip()=="":
                    ok = False; break
                vals.append(str(v)); meta[r.capitalize()] = str(v)
            if not ok: continue
            k = tuple(vals)
            groups.setdefault(k, []).append(ri)
            keys_meta.setdefault(k, meta)

    replicate_groups = [
        {"key": keys_meta[k], "row_indices": rows, "count": len(rows)}
        for k, rows in groups.items() if len(rows) >= 2
    ]

    return {
        "status": "ok",
        "source": "heuristic",
        "model": None,
        "delimiter": delim,
        "headers": header,
        "detected": {
            "well_columns": well_cols,
            "cq_columns": cq_cols,
            "control_rows": control_rows,
            "replicate_groups": replicate_groups,
            "column_roles": {h: roles.get(h.lower(), "other") for h in header}
        }
    }

# ------------------------------ ChatGPT driver --------------------------------

def chatgpt_analyze(header: List[str], body: List[List[str]], delim: str, model: str) -> Dict[str, Any]:
    """
    Ask ChatGPT to classify columns/rows and return structured JSON.
    Falls back to heuristic if API is unavailable or returns invalid JSON.
    """
    try:
        from openai import OpenAI  # type: ignore
    except Exception:
        return heuristic_analyze(header, body, delim)

    if not os.getenv("OPENAI_API_KEY"):
        return heuristic_analyze(header, body, delim)

    client = OpenAI()

    rows = body
    max_rows = 2000
    if len(rows) > max_rows:
        rows = rows[:max_rows]

    system = (
        "You are a meticulous qPCR/RT-qPCR table analyzer.\n"
        "Given the header and rows of a pasted table, return STRICT JSON only (no prose) describing:\n"
        "- which columns are well addresses (A1/A01/AA12 etc.),\n"
        "- which columns are Ct/Cq values (Ct/Cq/Cq Mean/etc.),\n"
        "- which rows are controls (e.g., NTC, NEG/NEGATIVE, POS/POSITIVE, WATER/H2O, BLANK, NO TEMPLATE, NO RT, UTC, UNTREATED, CONTROL, VEHICLE, MOCK, CALIBRATOR, STANDARD/STD, REFERENCE/REF),\n"
        "- replicate groupings by Sample/Target/Task (prefer all three; otherwise Sample+Target; otherwise Sample; otherwise Target).\n"
        "Treat 'Ct' and 'Cq' as synonyms. Row indices must be 0-based relative to the BODY (exclude header).\n"
        "Return ONLY JSON in the exact schema provided."
    )

    schema = {
        "status": "ok",
        "source": "chatgpt",
        "model": model,
        "delimiter": delim,
        "headers": header,
        "detected": {
            "well_columns": [],
            "cq_columns": [],
            "control_rows": [],
            "replicate_groups": [],
            "column_roles": {}
        }
    }

    user_payload = {
        "headers": header,
        "rows": rows,
        "instructions": {
            "indexing": "Row indices must be 0-based relative to body rows (header excluded).",
            "roles": ["well","sample","target","task","cq","other"],
            # Expanded control vocabulary sent to ChatGPT:
            "control_tokens": [
                "NTC","NAC","NO TEMPLATE","NO RT","WATER","H2O","BLANK",
                "NEG","NEGATIVE","POS","POSITIVE",
                "CTRL","CONTROL","CTRL","CTL",
                "UTC","UNTREATED","VEH","VEHICLE","MOCK",
                "CALIBRATOR","STANDARD","STD","REFERENCE","REF","UNKNOWN","UNKN"
            ],
            "cq_synonyms": ["Cq","Ct","Cq Mean","Ct Mean","Mean Cq","Mean Ct","Avg Cq","Avg Ct"]
        },
        "return_schema": schema
    }

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)}
    ]

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        content = (resp.choices[0].message.content or "").strip()
        data = json.loads(content)
        if isinstance(data, dict) and "detected" in data and "headers" in data:
            data.setdefault("delimiter", delim)
            data.setdefault("model", model)
            data.setdefault("source", "chatgpt")
            return data
    except Exception:
        pass

    return heuristic_analyze(header, body, delim)

# ---------------------------------- Main -------------------------------------

def main() -> int:
    try:
        import_table = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing required parameter 1: import_table (Excel-style paste string)."})
        return 1

    try:
        model = str(works.param(2) or "gpt-4o-mini")
    except Exception:
        model = "gpt-4o-mini"

    source_text = str(import_table or "")
    header, body, delim = parse_table(source_text)
    if not header:
        works.resolve({"status": "❌ error", "error": "Input has no headers."})
        return 1

    result = chatgpt_analyze(header, body, delim, model)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
