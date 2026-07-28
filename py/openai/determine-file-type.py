#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion Works entry/exit:
- param(1): either a file path to CSV/TSV or a raw table string (TSV/CSV)
- result: works.resolve(JSON)

What it does:
- Reads the table (delimiter auto-detected).
- Heuristically classifies data type (strong support for QuantStudio qPCR).
- Returns JSON with a top guess and (optionally) top candidates.

Requires: pandas
"""

import os
import re
import io
import sys
import json
from typing import List, Dict, Any, Optional, Tuple

# ----- Ion Works shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ----- Dependencies -----
try:
    import pandas as pd
except Exception as e:
    raise RuntimeError("This script requires the 'pandas' package. Try: pip install pandas") from e

# ============================ IO helpers ============================

def _read_text_from_source(source: Optional[str]) -> str:
    """
    If source points to a readable file, load it.
    Otherwise, treat it as raw table text.
    """
    if source and isinstance(source, str):
        s = source.strip()
        if s and os.path.exists(s) and os.path.isfile(s):
            works.msg(f"📄 Reading file: {s}")
            with open(s, "rb") as f:
                return f.read().decode("utf-8", errors="replace")
        # Not a file -> treat as raw table text
        works.msg("🧾 Using param(1) as raw table text.")
        return s
    # Fallback to stdin if nothing provided (rare under Ion Works)
    works.msg("⬇️ Reading from STDIN (no param(1) provided).")
    raw = sys.stdin.buffer.read()
    if not raw:
        raise RuntimeError("No input provided: pass a file path or raw table text in param(1).")
    return raw.decode("utf-8", errors="replace")

def _read_table_autodelim(text: str) -> pd.DataFrame:
    """
    Read CSV/TSV with auto delimiter detection; robust fallback sequence.
    """
    # Try pandas sniffing first
    try:
        df = pd.read_csv(io.StringIO(text), sep=None, engine="python")
        if df.shape[1] > 1:
            return df
    except Exception:
        pass

    # Common separators
    for sep in ("\t", ",", ";", "|"):
        try:
            df = pd.read_csv(io.StringIO(text), sep=sep)
            if df.shape[1] > 1:
                return df
        except Exception:
            continue

    # Last resort: whitespace
    works.msg("⚠️ Fallback: reading with whitespace separator.")
    return pd.read_csv(io.StringIO(text), sep=r"\s+")

# ============================ Utilities ============================

def _norm(s: str) -> str:
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    s = s.lower()
    s = s.replace("µ", "u")
    return re.sub(r"[^a-z0-9]+", "", s)

def _headers(df: pd.DataFrame) -> List[str]:
    return [str(c) for c in df.columns]

def _headers_norm(df: pd.DataFrame) -> List[str]:
    return [_norm(str(c)) for c in df.columns]

def _has_any(headers_norm: List[str], keys: List[str]) -> bool:
    return any(k in headers_norm for k in keys)

def _count_matches(headers_norm: List[str], keys: List[str]) -> int:
    return sum(1 for k in keys if k in headers_norm)

def _fraction_numeric(series: pd.Series, sample_n: int = 1000) -> float:
    s = series.dropna().head(sample_n)
    if s.empty:
        return 0.0
    ok = 0
    total = 0
    for v in s:
        total += 1
        try:
            float(str(v).strip().replace(",", ""))
            ok += 1
        except Exception:
            pass
    return ok / max(total, 1)

def _looks_like_gene_symbol(s: str) -> bool:
    s = str(s).strip()
    return bool(re.match(r"^[A-Za-z][A-Za-z0-9\-_.]{1,15}$", s)) and not s.replace(".", "").isdigit()

# ============================ Signatures ============================

class Signature:
    name: str
    description: str
    hard_keys: List[str]
    soft_keys: List[str]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        raise NotImplementedError

class SigQPCRQuantStudio(Signature):
    name = "qpcr_quantstudio"
    description = "qPCR (Applied Biosystems QuantStudio-style results)"
    hard_keys = [
        "well", "wellposition", "sample", "target", "dye", "reporter", "quencher",
        "ampstatus", "cq", "cqmean", "autothreshold", "autobaseline",
        "baselinestart", "baselineend"
    ]
    soft_keys = [
        "task", "tm1", "tm2", "tm3", "tm4", "ct", "yintercept", "r2", "slope", "efficiency",
        "cqsd", "quantity", "quantitymean", "quantitysd", "threshold"
    ]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        hard = _count_matches(hn, self.hard_keys)
        soft = _count_matches(hn, self.soft_keys)
        value_signals = 0
        notes = []
        # Cq/Ct numeric-ness
        for cand in ["cq", "ct", "cqmean"]:
            if cand in hn:
                col = df.iloc[:, hn.index(cand)]
                frac_num = _fraction_numeric(col)
                if frac_num >= 0.8:
                    value_signals += 1
                    notes.append(f"{cand} numeric-like (frac={frac_num:.2f})")
        # Fluorophores
        fluor_seen = False
        for cand in ["reporter", "dye"]:
            if cand in hn:
                col = df.iloc[:, hn.index(cand)].astype(str).str.upper()
                if col.str.contains(r"\b(FAM|VIC|CY5|ROX|HEX|SYBR)\b", regex=True).any():
                    fluor_seen = True
        if fluor_seen:
            value_signals += 1
            notes.append("fluorophores present (FAM/VIC/CY5/ROX/HEX/SYBR)")
        # Amp status
        if "ampstatus" in hn:
            col = df.iloc[:, hn.index("ampstatus")].astype(str).str.lower()
            if col.str.contains(r"\bamp\b").any():
                value_signals += 1
                notes.append("Amp status contains 'Amp'")
        score = (hard * 0.08) + (soft * 0.03) + (value_signals * 0.08)
        return min(score, 1.0), {"hard_hits": hard, "soft_hits": soft, "value_signals": value_signals, "notes": notes}

class SigQPCRCFX(Signature):
    name = "qpcr_biorad_cfx"
    description = "qPCR (Bio-Rad CFX-style results)"
    hard_keys = ["cq", "cqmean", "cqsd", "genename", "well", "target", "sample"]
    soft_keys = ["tm", "meltpeak", "meltpeak1", "meltpeak2", "baseline", "threshold", "replicate"]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        hard = _count_matches(hn, self.hard_keys)
        soft = _count_matches(hn, self.soft_keys)
        return min((hard * 0.08) + (soft * 0.02), 0.7), {"hard_hits": hard, "soft_hits": soft}

class SigDDPCR(Signature):
    name = "ddpcr"
    description = "Droplet digital PCR (ddPCR) results"
    hard_keys = ["accepteddroplets", "positivedroplets", "negativedroplets", "copiesul", "concentration"]
    soft_keys = ["ch1amplitude", "ch2amplitude", "rain", "threshold"]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        hard = _count_matches(hn, self.hard_keys)
        soft = _count_matches(hn, self.soft_keys)
        return min((hard * 0.15) + (soft * 0.05), 0.85), {"hard_hits": hard, "soft_hits": soft}

class SigPlateReader(Signature):
    name = "plate_reader"
    description = "Plate reader (absorbance/fluorescence/luminescence)"
    hard_keys = ["well", "wavelength", "od", "absorbance", "fluorescence", "rlu"]
    soft_keys = ["time", "kinetic", "gain", "emission", "excitation"]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        hard = _count_matches(hn, self.hard_keys)
        soft = _count_matches(hn, self.soft_keys)
        return min((hard * 0.10) + (soft * 0.03), 0.6), {"hard_hits": hard, "soft_hits": soft}

class SigRNASeqCounts(Signature):
    name = "rnaseq_counts"
    description = "RNA-seq count matrix (genes x samples)"
    hard_keys: List[str] = []
    soft_keys = ["gene", "genes", "geneid", "ensembl", "symbol"]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        soft = _count_matches(hn, self.soft_keys)
        score = soft * 0.02
        notes = []
        if df.shape[1] >= 3:
            first_col = df.iloc[:, 0]
            gene_like_frac = first_col.head(200).apply(_looks_like_gene_symbol).mean()
            numeric_cols = sum(1 for i in range(1, df.shape[1]) if _fraction_numeric(df.iloc[:, i]) > 0.9)
            if gene_like_frac >= 0.5 and numeric_cols >= max(2, int(0.5 * (df.shape[1]-1))):
                score += 0.35
                notes.append(f"gene-like first column (frac={gene_like_frac:.2f}), numeric sample columns={numeric_cols}")
        return min(score, 0.7), {"soft_hits": soft, "notes": notes}

class SigFlowCytometry(Signature):
    name = "flow_cytometry_csv"
    description = "Flow cytometry CSV export (FCS channels)"
    hard_keys: List[str] = []
    soft_keys = ["fsca", "fscw", "fsch", "ssca", "ssch", "pacificbluea", "fitca", "pe", "percp", "apca", "apccya", "bv", "buv"]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        soft = _count_matches(hn, self.soft_keys)
        big = 1.0 if df.shape[0] > 5000 else 0.0
        return min(soft * 0.02 + big * 0.2, 0.6), {"soft_hits": soft, "rows": df.shape[0]}

class SigProteomics(Signature):
    name = "proteomics_ms"
    description = "Proteomics (MaxQuant/DIANN-style)"
    hard_keys = ["proteinids", "genenames", "intensity", "lfqintensity"]
    soft_keys = ["peptidesequence", "razor", "uniquepeptides"]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        hard = _count_matches(hn, self.hard_keys)
        soft = _count_matches(hn, self.soft_keys)
        return min(hard * 0.12 + soft * 0.04, 0.7), {"hard_hits": hard, "soft_hits": soft}

class SigMetabolomics(Signature):
    name = "metabolomics_ms"
    description = "Metabolomics (feature table)"
    hard_keys = ["mz", "rt", "retentiontime", "area", "peakarea"]
    soft_keys = ["adduct", "compound", "id", "isotope"]
    def score(self, df: pd.DataFrame) -> Tuple[float, Dict[str, Any]]:
        hn = _headers_norm(df)
        hard = _count_matches(hn, self.hard_keys)
        soft = _count_matches(hn, self.soft_keys)
        return min(hard * 0.10 + soft * 0.03, 0.6), {"hard_hits": hard, "soft_hits": soft}

SIGNATURES: List[Signature] = [
    SigQPCRQuantStudio(),
    SigQPCRCFX(),
    SigDDPCR(),
    SigPlateReader(),
    SigRNASeqCounts(),
    SigFlowCytometry(),
    SigProteomics(),
    SigMetabolomics(),
]

# ============================ Core detection ============================

def detect_table_type(df: pd.DataFrame) -> Dict[str, Any]:
    headers = _headers(df)
    hn = _headers_norm(df)

    candidates = []
    for sig in SIGNATURES:
        try:
            score, meta = sig.score(df)
        except Exception as e:
            score, meta = 0.0, {"error": str(e)}
        candidates.append({
            "name": sig.name,
            "description": sig.description,
            "score": round(float(score), 4),
            "meta": meta
        })

    best = max(candidates, key=lambda x: x["score"]) if candidates else None

    result = {
        "headers": headers,
        "n_rows": int(df.shape[0]),
        "n_cols": int(df.shape[1]),
        "guess": {
            "type": best["name"] if best else None,
            "description": best["description"] if best else None,
            "score": best["score"] if best else 0.0,
            "matched_signals": best["meta"] if best else {},
        },
        "candidates_top5": sorted(candidates, key=lambda x: x["score"], reverse=True)[:5],
        "notes": []
    }

    if best and best["name"] == "qpcr_quantstudio":
        hallmark = all(k in hn for k in ["reporter", "ampstatus", "autothreshold", "baselinestart", "baselineend"])
        if hallmark:
            result["notes"].append("QuantStudio hallmark columns present (Reporter, Amp Status, Auto Threshold, Baseline Start/End).")

    return result

# ============================ Ion entry ============================

def _main_ion() -> int:
    try:
        source = works.param(1)
        text = _read_text_from_source(source)
        df = _read_table_autodelim(text)

        works.msg(f"✅ Loaded table: {df.shape[0]} rows × {df.shape[1]} cols")
        report = detect_table_type(df)
        works.resolve(report)
        return 0
    except Exception as e:
        works.msg(f"❌ Error: {e}")
        works.resolve({
            "error": str(e),
            "hint": "Pass a CSV/TSV file path or raw table text via param(1). Ensure pandas is installed."
        })
        return 1

if __name__ == "__main__":
    _main_ion()
