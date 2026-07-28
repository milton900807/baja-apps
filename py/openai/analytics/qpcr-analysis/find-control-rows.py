# identify_controls_ion_main.py
# Ion Works script: parse TAB/CSV text from param(2), detect control rows, return JSON.
# - Only uses Ion Works to receive params and resolve results.
# - No ChatGPT / no external calls.

import json
import re
import csv
import io
from typing import Dict, Any, List, Tuple

try:
    from ion import works  # Ion Works runtime
except Exception:  # local debug shim (optional)
    class _Shim:
        _params = {}
        def param(self, i): return self._params.get(i)
        def resolve(self, obj): print(json.dumps(obj, indent=2))
    works = _Shim()  # type: ignore


# ---------------- Utilities ---------------- #

def _sniff_reader(text: str) -> Tuple[List[str], List[Dict[str, str]]]:
    """
    Robustly parse TAB/CSV or whitespace-delimited qPCR export text.
    Returns (headers, rows_as_dicts with original header names).
    """
    text = text.strip("\n\r\t ")
    if not text:
        return [], []

    # Prefer tabs. Otherwise try csv.Sniffer; fall back to whitespace split.
    first_line = text.splitlines()[0]
    if "\t" in first_line:
        dialect = csv.excel_tab
        delimiter = "\t"
    else:
        try:
            dialect = csv.Sniffer().sniff(text, delimiters=",;\t")
            delimiter = dialect.delimiter
        except Exception:
            delimiter = None

    rows: List[Dict[str, str]] = []
    if delimiter:
        reader = csv.reader(io.StringIO(text), dialect=dialect)
        all_rows = list(reader)
        if not all_rows:
            return [], []
        headers = [h.strip() for h in all_rows[0]]
        for r in all_rows[1:]:
            if not any(cell.strip() for cell in r):
                continue
            row = {headers[i]: (r[i].strip() if i < len(r) else "") for i in range(len(headers))}
            rows.append(row)
        return headers, rows

    # Whitespace fallback
    parts = [re.split(r"\s{2,}|\t+|,", ln.strip()) for ln in text.splitlines() if ln.strip()]
    headers = [h.strip() for h in parts[0]]
    for r in parts[1:]:
        row = {headers[i]: (r[i].strip() if i < len(r) else "") for i in range(len(headers))}
        rows.append(row)
    return headers, rows


def _canon(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _hmap(headers: List[str]) -> Dict[str, str]:
    """
    Map likely header variants to canonical keys.
    """
    canon = {h.lower().strip(): h for h in headers}
    def pick(*alts):
        for a in alts:
            h = canon.get(a)
            if h: return h
        return None

    return {
        "well":            pick("well"),
        "well_position":   pick("well position", "position", "wellposition"),
        "sample":          pick("sample", "sample name"),
        "target":          pick("target", "assay", "gene"),
        "amp_status":      pick("amp status", "amplification status", "status"),
        "result":          pick("result"),
        "cq":              pick("cq", "ct", "cq mean", "ct mean"),
        "cq_mean":         pick("cq mean", "ct mean", "mean cq", "mean ct"),
    }


CONTROL_KEYWORDS = [
    # (pattern, control_type)
    (r"\bNTC\b|\bNO\s*TEMP(LATE)?\b|\bNO[-\s]*TEMPLATE\b", "NTC"),
    (r"\bUTC\b|\bUNTREATED\s*CTRL?\b", "UTC"),
    (r"\bRIPA\b", "RIPA"),
    (r"\bWATER\b|\bH2O\b|\bDI\s*H2?O\b", "BLANK"),
    (r"\bBLANK\b", "BLANK"),
    (r"\bNEG(ATIVE)?\s*(CTRL|CONTROL)?\b", "NEG"),
    (r"\bPOS(ITIVE)?\s*(CTRL|CONTROL)?\b", "POS"),
    (r"\bCONTROL\b|\bCTRL\b", "OTHER"),
]

def _guess_control_type(sample_text: str) -> Tuple[str, str]:
    """
    Return (control_type, reason) based on sample name text.
    """
    s_up = sample_text.upper()
    for pat, ctype in CONTROL_KEYWORDS:
        if re.search(pat, s_up):
            return ctype, f"Sample name matches '{ctype}' pattern"
    # Specific short tokens
    if s_up in {"NTC", "UTC", "RIPA", "H2O", "WATER", "BLANK"}:
        return s_up if s_up in {"NTC", "UTC", "RIPA"} else ("BLANK" if s_up in {"H2O","WATER","BLANK"} else "OTHER"), "Exact control token"
    return "", ""


def _to_float(x: str):
    try:
        if x is None: return None
        x = x.strip()
        if x == "" or x.lower() == "undetermined":
            return None
        return float(x)
    except Exception:
        return None


def _pick_cq(row: Dict[str, str], k_cq: str, k_cq_mean: str):
    v = row.get(k_cq) if k_cq else None
    if v is None or str(v).strip() in {"", "Undetermined"}:
        v = row.get(k_cq_mean) if k_cq_mean else None
    return _to_float(str(v) if v is not None else "")


def _is_no_amp(row: Dict[str, str], k_amp: str) -> bool:
    v = (row.get(k_amp) or "").strip().lower() if k_amp else ""
    return v in {"no amp", "noamp", "no amplification", "fail", "none"}


# --------------- Core Logic --------------- #

def _identify_controls(headers: List[str], rows: List[Dict[str, str]]) -> Dict[str, Any]:
    h = _hmap(headers)

    out_controls: List[Dict[str, Any]] = []
    counts: Dict[str, int] = {}

    for r in rows:
        well = _canon(r.get(h["well"] or "", ""))
        wpos = _canon(r.get(h["well_position"] or "", ""))
        sample = _canon(r.get(h["sample"] or "", ""))
        target = _canon(r.get(h["target"] or "", ""))
        amp_status = _canon(r.get(h["amp_status"] or "", ""))
        cq = _pick_cq(r, h["cq"], h["cq_mean"])

        # Primary: sample-name driven classification
        ctype, reason = _guess_control_type(sample)

        # Secondary cues:
        # - Rows with explicit 'Undetermined' CQ or 'No Amp' may support NEG/BLANK-like controls.
        if not ctype:
            if _is_no_amp(r, h["amp_status"]):
                # If sample hints at control-ish words, tag as OTHER; else skip (could be failed sample).
                if re.search(r"\b(CTRL|CONTROL|NTC|UTC|RIPA|H2O|WATER|BLANK|NEG|POS)\b", sample, re.I):
                    ctype = "OTHER"
                    reason = "No Amp with control-ish sample name"
                else:
                    # Likely a failed unknown, not a control → skip
                    continue

        if ctype:
            item = {
                "well": well or wpos or "",
                "well_position": wpos or well or "",
                "sample": sample,
                "target": target,
                "control_type": ctype,
                "reason": reason if reason else ("No Amp" if _is_no_amp(r, h["amp_status"]) else "Heuristic"),
                "amp_status": amp_status,
                "cq": cq
            }
            out_controls.append(item)
            counts[ctype] = counts.get(ctype, 0) + 1

    return {"controls": out_controls, "counts_by_type": counts}


# ---------- Main (Ion) ----------

def main_ion() -> int:
    try:
        p1 = works.param(1)  # destination plates (array/dict) - not used here, but accepted for interface parity
        p2 = works.param(2)  # source table text (required)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing required parameters: destination plates JSON and source table text"})
        return 1

    if not p2:
        works.resolve({"status": "❌ error", "error": "Source table text (param 2) is required"})
        return 1

    try:
        headers, body = _sniff_reader(str(p2))
        if not headers:
            works.resolve({"status": "❌ error", "error": "Source table has no headers"})
            return 1

        result = _identify_controls(headers, body)
        works.resolve(result)
        return 0

    except Exception as e:
        works.resolve({"status": "❌ error", "error": f"Failed to process source table: {e}"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main_ion())
