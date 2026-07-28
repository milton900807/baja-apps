#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Ion Amplicon Designer + Ct Model Scorer (top-N, UNIQUE, AMP-SPANS-EXON-JUNCTION)

Input (Ion):
  param(1): TRACK JSON object OR JSON string containing:
      - track["sequence"] : cDNA sequence (string)
      - track["annotations"] : list, includes Exon features with xi/xf in transcript coords
  param(2): modeldir OR model.joblib path (optional)
  param(3): output path (optional) CSV/XLSX
  param(4): options JSON (optional)

Requirement (THIS VERSION):
  - Amplicon must span an exon–exon junction:
      exists junction position j such that amp_start < j < amp_end
    (equivalently: forward primer in one exon and reverse primer in a different exon)
  - If no exon junctions exist, fall back to normal top-N behavior.

Also:
  - Dedupe exact duplicates from overlapping windows
  - Optional min spacing between returned amplicons
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

import joblib
import numpy as np
import pandas as pd

import primer3
from primer3 import bindings as p3b

# Optional Ion support
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:
    _HAS_ION = False


# -----------------------------------------------------------------------------
# Progress / messaging helpers
# -----------------------------------------------------------------------------
def _progress(pct: float, msg: str | None = None) -> None:
    p = int(max(0, min(100, round(pct))))
    if _HAS_ION:
        try:
            works.progress(p)
            if msg:
                works.msg(str(msg))
        except Exception:
            pass
    else:
        if msg:
            print(f"[{p:3d}%] {msg}", file=sys.stderr)


def _msg(msg: str) -> None:
    if _HAS_ION:
        try:
            works.msg(str(msg))
        except Exception:
            pass
    else:
        print(msg, file=sys.stderr)


def _emit_payload(payload: Dict[str, Any]) -> None:
    """
    Ion Works output methods vary by version. Prefer resolve(), else fall back.
    """
    s = json.dumps(payload)
    if _HAS_ION:
        for fn_name in ("resolve", "send", "out", "output", "result"):
            fn = getattr(works, fn_name, None)
            if callable(fn):
                try:
                    fn(payload if fn_name == "resolve" else s)
                    return
                except Exception:
                    pass
        print(s)
    else:
        print(json.dumps(payload, indent=2))


# -----------------------------------------------------------------------------
# Model bundle (must match ct_good_model_amplicon_structure.py)
# -----------------------------------------------------------------------------
@dataclass
class ModelBundle:
    pipeline: Any
    feature_columns: List[str]
    ct_threshold: float
    use_primer3: bool
    use_rnafold: bool
    decision_threshold: float


# -----------------------------------------------------------------------------
# Robust Ion param normalization helpers
# -----------------------------------------------------------------------------
def _first_valid_path_from_list(items: Iterable[Any]) -> Optional[str]:
    for it in items:
        if isinstance(it, str):
            p = it.split(":", 1)[1] if it.startswith("jfile:") else it
            if os.path.exists(p):
                return p
    return None


def _normalize_path(val: Any, default: Optional[str] = None) -> Optional[str]:
    try:
        if isinstance(val, str):
            p = val.split(":", 1)[1] if val.startswith("jfile:") else val
            return p if p else default
        if isinstance(val, (list, tuple)):
            return _first_valid_path_from_list(val) or default
        return default
    except Exception:
        return default


# -----------------------------------------------------------------------------
# Track JSON parsing + exon junction logic
# -----------------------------------------------------------------------------
def _as_obj(x: Any) -> Any:
    if isinstance(x, str):
        s = x.strip()
        if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
            try:
                return json.loads(s)
            except Exception:
                return x
    return x


def _extract_track_sequence_and_exons(track: Any) -> Tuple[str, str, List[Tuple[int, int]]]:
    """
    Returns (name, sequence, exons) where exons are (xi, xf) half-open transcript coords.
    Falls back to legacy input parsing if track isn't dict-like.
    """
    track = _as_obj(track)

    if isinstance(track, dict) and "sequence" in track:
        name = str(track.get("name") or track.get("transcript_id") or "track")
        seq = str(track.get("sequence") or "")
        anns = track.get("annotations") or []
        exons: List[Tuple[int, int]] = []
        if isinstance(anns, list):
            for a in anns:
                if not isinstance(a, dict):
                    continue
                if str(a.get("type") or "").lower() != "exon":
                    continue
                xi = a.get("xi")
                xf = a.get("xf")
                if isinstance(xi, (int, float)) and isinstance(xf, (int, float)):
                    xi_i = int(xi)
                    xf_i = int(xf)
                    if xf_i > xi_i:
                        exons.append((xi_i, xf_i))
        exons.sort(key=lambda t: (t[0], t[1]))
        return name, seq, exons

    # Legacy: treat param(1) as sequence/path
    name, raw_seq = _extract_first_sequence(track)
    return name, raw_seq, []


def exon_junction_positions(exons: List[Tuple[int, int]]) -> List[int]:
    """
    Junction positions are boundaries between adjacent exons in transcript coords.
    For exons [(0,4665),(4665,4824),...], junctions are [4665,4824,...]
    """
    if not exons or len(exons) < 2:
        return []
    # Sort by xi
    ex = sorted(exons, key=lambda t: (t[0], t[1]))
    junctions: List[int] = []
    # Boundary at end of each exon (except last)
    for i in range(len(ex) - 1):
        j = int(ex[i][1])
        # sanity: boundary should be between exon i and i+1
        # even if they overlap/gap, we still consider this a boundary marker
        junctions.append(j)
    # unique/sorted
    junctions = sorted(set(junctions))
    return junctions


def amplicon_spans_junction(amp_start: int, amp_end: int, junctions: List[int]) -> bool:
    """
    True if exists j where amp_start < j < amp_end.
    """
    for j in junctions:
        if amp_start < j < amp_end:
            return True
    return False


# -----------------------------------------------------------------------------
# Sequence utilities / normalization (RNA->DNA)
# -----------------------------------------------------------------------------
DNA_RE = re.compile(r"[^ACGTUacgtu]")
DNA_COMP = str.maketrans("ACGTUacgtu", "TGCAAtgcaa")


def norm_rna_to_dna(seq: str) -> str:
    return DNA_RE.sub("", str(seq)).upper().replace("U", "T")


def revcomp(seq: str) -> str:
    return seq.translate(DNA_COMP)[::-1]


def gc_content(seq: str) -> float:
    return (seq.count("G") + seq.count("C")) / len(seq) if seq else 0.0


def shannon_entropy(seq: str) -> float:
    if not seq:
        return 0.0
    n = len(seq)
    counts = [seq.count(b) for b in "ACGT"]
    probs = [c / n for c in counts if c > 0]
    return float(-sum(p * math.log2(p) for p in probs))


def max_homopolymer(seq: str) -> int:
    if not seq:
        return 0
    best = 1
    cur = 1
    for i in range(1, len(seq)):
        if seq[i] == seq[i - 1]:
            cur += 1
            best = max(best, cur)
        else:
            cur = 1
    return best


def dinuc_freqs(seq: str) -> Dict[str, float]:
    out = {a + b: 0.0 for a in "ACGT" for b in "ACGT"}
    if len(seq) < 2:
        return out
    total = len(seq) - 1
    for i in range(total):
        d = seq[i : i + 2]
        if d in out:
            out[d] += 1.0
    return {k: (v / total) for k, v in out.items()}


def basic_seq_features(prefix: str, seq: str) -> Dict[str, float]:
    d: Dict[str, float] = {
        f"{prefix}_len": float(len(seq)),
        f"{prefix}_gc": float(gc_content(seq)),
        f"{prefix}_entropy": float(shannon_entropy(seq)),
        f"{prefix}_homopolymer": float(max_homopolymer(seq)),
    }
    d.update({f"{prefix}_di_{k}": float(v) for k, v in dinuc_freqs(seq).items()})
    return d


# -----------------------------------------------------------------------------
# Secondary-structure proxies
# -----------------------------------------------------------------------------
def _is_complement(a: str, b: str) -> bool:
    return (a, b) in {("A", "T"), ("T", "A"), ("C", "G"), ("G", "C")}


def self_complementarity_proxy(seq: str) -> Tuple[int, float, float]:
    if not seq:
        return 0, 0.0, 0.0
    rc = revcomp(seq)
    n = len(seq)
    best_runs: List[int] = []
    total_comp = 0
    total_aligned = 0
    max_run = 0
    for shift in range(-(n - 1), n):
        run = 0
        best_this = 0
        for i in range(n):
            j = i + shift
            if 0 <= j < n:
                total_aligned += 1
                if _is_complement(seq[i], rc[j]):
                    total_comp += 1
                    run += 1
                    best_this = max(best_this, run)
                else:
                    run = 0
        best_runs.append(best_this)
        max_run = max(max_run, best_this)
    best_runs.sort(reverse=True)
    topk = best_runs[:5] if best_runs else [0]
    mean_best = float(np.mean(topk)) if topk else 0.0
    comp_density = (total_comp / total_aligned) if total_aligned else 0.0
    return int(max_run), float(mean_best), float(comp_density)


def palindromic_kmer_density(seq: str, k: int) -> float:
    if not seq or len(seq) < k:
        return 0.0
    total = len(seq) - k + 1
    pal = 0
    for i in range(total):
        kmer = seq[i : i + k]
        if kmer == revcomp(kmer):
            pal += 1
    return pal / total if total else 0.0


def rnafold_mfe(seq: str) -> Optional[float]:
    if not seq:
        return None
    if shutil.which("RNAfold") is None:
        return None
    try:
        p = subprocess.run(
            ["RNAfold", "--noPS"],
            input=(seq + "\n").encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=5,
        )
        out = p.stdout.decode("utf-8", errors="ignore").strip().splitlines()
        if len(out) < 2:
            return None
        m = re.search(r"\(\s*([-\d\.]+)\s*\)\s*$", out[1])
        return float(m.group(1)) if m else None
    except Exception:
        return None


def secondary_structure_features(prefix: str, seq: str, use_rnafold: bool) -> Dict[str, float]:
    max_run, mean_best, comp_density = self_complementarity_proxy(seq)
    pal6 = palindromic_kmer_density(seq, 6)
    pal8 = palindromic_kmer_density(seq, 8)
    mfe = rnafold_mfe(seq) if use_rnafold else None
    return {
        f"{prefix}_selfcomp_maxrun": float(max_run),
        f"{prefix}_selfcomp_meanbest5": float(mean_best),
        f"{prefix}_selfcomp_density": float(comp_density),
        f"{prefix}_pal_k6_density": float(pal6),
        f"{prefix}_pal_k8_density": float(pal8),
        f"{prefix}_rnafold_mfe": float(mfe) if mfe is not None else 0.0,
        f"{prefix}_rnafold_available": 1.0 if mfe is not None else 0.0,
    }


# -----------------------------------------------------------------------------
# Primer3 thermo features
# -----------------------------------------------------------------------------
def primer3_oligo(prefix: str, seq: str) -> Dict[str, float]:
    if not seq:
        return {f"{prefix}_tm": 0.0, f"{prefix}_hairpin_dg": 0.0, f"{prefix}_homodimer_dg": 0.0}
    out: Dict[str, float] = {}
    try:
        out[f"{prefix}_tm"] = float(primer3.calc_tm(seq))
    except Exception:
        out[f"{prefix}_tm"] = 0.0
    try:
        hp = primer3.calc_hairpin(seq)
        out[f"{prefix}_hairpin_dg"] = float(getattr(hp, "dg", 0.0) or 0.0)
    except Exception:
        out[f"{prefix}_hairpin_dg"] = 0.0
    try:
        hd = primer3.calc_homodimer(seq)
        out[f"{prefix}_homodimer_dg"] = float(getattr(hd, "dg", 0.0) or 0.0)
    except Exception:
        out[f"{prefix}_homodimer_dg"] = 0.0
    return out


def primer3_hetero(prefix: str, a: str, b: str) -> Dict[str, float]:
    if not a or not b:
        return {f"{prefix}_heterodimer_dg": 0.0}
    try:
        het = primer3.calc_heterodimer(a, b)
        return {f"{prefix}_heterodimer_dg": float(getattr(het, "dg", 0.0) or 0.0)}
    except Exception:
        return {f"{prefix}_heterodimer_dg": 0.0}


# -----------------------------------------------------------------------------
# Featurization
# -----------------------------------------------------------------------------
def featurize_row(
    fwd: str,
    rev: str,
    probe: str,
    amp: str,
    *,
    use_primer3: bool,
    use_rnafold: bool,
) -> Dict[str, float]:
    d: Dict[str, float] = {}
    d.update(basic_seq_features("fwd", fwd))
    d.update(basic_seq_features("rev", rev))
    d.update(basic_seq_features("probe", probe))
    d.update(basic_seq_features("amp", amp))

    alen = len(amp)
    d["amp_len_sq"] = float(alen * alen)
    d["amp_len_log1p"] = float(math.log1p(alen)) if alen else 0.0
    d["amp_len_from_100"] = float(abs(alen - 100)) if alen else 0.0

    d.update(secondary_structure_features("amp", amp, use_rnafold=use_rnafold))

    ps = amp.find(probe) if amp and probe else -1
    d["probe_pos_frac"] = float((ps + len(probe) / 2) / len(amp)) if ps >= 0 and len(amp) > 0 else 0.0

    if use_primer3:
        d.update(primer3_oligo("fwd", fwd))
        d.update(primer3_oligo("rev", rev))
        d.update(primer3_oligo("probe", probe))
        d.update(primer3_hetero("fwd_rev", fwd, rev))
        d.update(primer3_hetero("fwd_probe", fwd, probe))
        d.update(primer3_hetero("rev_probe", rev, probe))
        d["tm_diff_fwd_rev"] = abs(d.get("fwd_tm", 0.0) - d.get("rev_tm", 0.0))
        d["tm_probe_minus_mean_primers"] = d.get("probe_tm", 0.0) - 0.5 * (
            d.get("fwd_tm", 0.0) + d.get("rev_tm", 0.0)
        )
    else:
        for k in [
            "fwd_tm",
            "rev_tm",
            "probe_tm",
            "fwd_hairpin_dg",
            "rev_hairpin_dg",
            "probe_hairpin_dg",
            "fwd_homodimer_dg",
            "rev_homodimer_dg",
            "probe_homodimer_dg",
            "fwd_rev_heterodimer_dg",
            "fwd_probe_heterodimer_dg",
            "rev_probe_heterodimer_dg",
            "tm_diff_fwd_rev",
            "tm_probe_minus_mean_primers",
        ]:
            d[k] = 0.0
    return d


# -----------------------------------------------------------------------------
# Primer3 design (WINDOWED)
# -----------------------------------------------------------------------------
def primer3_global_settings(
    *,
    product_min: int,
    product_max: int,
    allow_probe: bool,
    relax: bool,
) -> Dict[str, object]:
    if not relax:
        return dict(
            PRIMER_NUM_RETURN=1,
            PRIMER_PICK_LEFT_PRIMER=1,
            PRIMER_PICK_RIGHT_PRIMER=1,
            PRIMER_PICK_INTERNAL_OLIGO=1 if allow_probe else 0,
            PRIMER_OPT_SIZE=20,
            PRIMER_MIN_SIZE=18,
            PRIMER_MAX_SIZE=25,
            PRIMER_MIN_TM=57.0,
            PRIMER_OPT_TM=60.0,
            PRIMER_MAX_TM=63.0,
            PRIMER_MIN_GC=30.0,
            PRIMER_MAX_GC=70.0,
            PRIMER_MAX_POLY_X=5,
            PRIMER_PRODUCT_SIZE_RANGE=[[product_min, product_max]],
            PRIMER_EXPLAIN_FLAG=1,
            PRIMER_INTERNAL_OPT_SIZE=22,
            PRIMER_INTERNAL_MIN_SIZE=18,
            PRIMER_INTERNAL_MAX_SIZE=30,
            PRIMER_INTERNAL_MIN_TM=64.0,
            PRIMER_INTERNAL_OPT_TM=68.0,
            PRIMER_INTERNAL_MAX_TM=72.0,
        )
    return dict(
        PRIMER_NUM_RETURN=1,
        PRIMER_PICK_LEFT_PRIMER=1,
        PRIMER_PICK_RIGHT_PRIMER=1,
        PRIMER_PICK_INTERNAL_OLIGO=1 if allow_probe else 0,
        PRIMER_OPT_SIZE=20,
        PRIMER_MIN_SIZE=17,
        PRIMER_MAX_SIZE=28,
        PRIMER_MIN_TM=54.0,
        PRIMER_OPT_TM=60.0,
        PRIMER_MAX_TM=66.0,
        PRIMER_MIN_GC=20.0,
        PRIMER_MAX_GC=80.0,
        PRIMER_MAX_POLY_X=8,
        PRIMER_PRODUCT_SIZE_RANGE=[[product_min, product_max]],
        PRIMER_EXPLAIN_FLAG=1,
        PRIMER_INTERNAL_OPT_SIZE=22,
        PRIMER_INTERNAL_MIN_SIZE=16,
        PRIMER_INTERNAL_MAX_SIZE=35,
        PRIMER_INTERNAL_MIN_TM=60.0,
        PRIMER_INTERNAL_OPT_TM=68.0,
        PRIMER_INTERNAL_MAX_TM=75.0,
    )


def design_candidates_windowed(
    template: str,
    *,
    product_min: int,
    product_max: int,
    window_size: int,
    step: int,
    max_designs: int,
    allow_probe: bool,
    relax: bool,
    debug: bool,
) -> List[Dict[str, object]]:
    n = len(template)
    candidates: List[Dict[str, object]] = []
    global_args = primer3_global_settings(
        product_min=product_min,
        product_max=product_max,
        allow_probe=allow_probe,
        relax=relax,
    )

    window_size = max(int(window_size), int(product_max) + 60)
    starts = list(range(0, max(1, n - product_min), int(step)))

    for idx, window_start in enumerate(starts):
        if len(candidates) >= max_designs:
            break

        if idx % max(1, len(starts) // 20) == 0:
            _progress(10 + 40 * (idx / max(1, len(starts))), f"primer3 scanning... ({idx}/{len(starts)})")

        window = template[window_start : window_start + window_size]
        if len(window) < product_min + 20:
            break

        seq_args = {"SEQUENCE_ID": f"win_{window_start}", "SEQUENCE_TEMPLATE": window}

        try:
            res = p3b.design_primers(seq_args, global_args)
        except Exception:
            continue

        if res.get("PRIMER_PAIR_NUM_RETURNED", 0) < 1:
            if debug:
                explain = res.get("PRIMER_PAIR_EXPLAIN", "") or res.get("PRIMER_EXPLAIN", "")
                if explain:
                    _msg(f"[primer3 fail @ {window_start}] {explain}")
            continue

        left_seq = res.get("PRIMER_LEFT_0_SEQUENCE", "")
        right_seq = res.get("PRIMER_RIGHT_0_SEQUENCE", "")
        if not left_seq or not right_seq:
            continue

        left_pos, left_len = res.get("PRIMER_LEFT_0", [None, None])
        right_pos, right_len = res.get("PRIMER_RIGHT_0", [None, None])
        if left_pos is None or left_len is None or right_pos is None or right_len is None:
            continue

        amp_start_local = int(left_pos)
        amp_end_local = int(right_pos) + int(right_len)
        if not (0 <= amp_start_local < amp_end_local <= len(window)):
            continue

        amplicon = window[amp_start_local:amp_end_local]
        probe_seq = res.get("PRIMER_INTERNAL_0_SEQUENCE", "") or ""

        amp_start = window_start + amp_start_local
        amp_end = window_start + amp_end_local

        candidates.append(
            dict(
                amp_start=int(amp_start),
                amp_end=int(amp_end),
                amp_len=int(len(amplicon)),
                forward_primer=str(left_seq),
                reverse_primer=str(right_seq),
                probe=str(probe_seq),
                amplicon=str(amplicon),
                p3_pair_penalty=float(res.get("PRIMER_PAIR_0_PENALTY", 0.0) or 0.0),
                window_start=int(window_start),
                window_size=int(len(window)),
            )
        )

    return candidates


# -----------------------------------------------------------------------------
# Load model bundle (relative to script directory)
# -----------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = str(SCRIPT_DIR / "model.joblib")


def load_modelbundle(model_path_or_dir: str) -> ModelBundle:
    p = model_path_or_dir or ""
    if isinstance(p, str) and p.startswith("jfile:"):
        p = p.split(":", 1)[1]

    path = Path(p)
    if not path.is_absolute():
        path = (SCRIPT_DIR / path).resolve()

    if path.is_dir():
        path = path / "model.joblib"

    if not path.exists():
        raise FileNotFoundError(f"Model bundle not found: {path}")

    return joblib.load(str(path))


# -----------------------------------------------------------------------------
# Scoring
# -----------------------------------------------------------------------------
def score_candidates(bundle: ModelBundle, cands: List[Dict[str, object]]) -> pd.DataFrame:
    feat_rows: List[Dict[str, float]] = []
    for c in cands:
        feat_rows.append(
            featurize_row(
                fwd=str(c["forward_primer"]),
                rev=str(c["reverse_primer"]),
                probe=str(c.get("probe", "")),
                amp=str(c["amplicon"]),
                use_primer3=bool(bundle.use_primer3),
                use_rnafold=bool(bundle.use_rnafold),
            )
        )
    X = pd.DataFrame(feat_rows).fillna(0.0)

    for col in bundle.feature_columns:
        if col not in X.columns:
            X[col] = 0.0
    X = X[bundle.feature_columns].copy()

    proba = np.asarray(bundle.pipeline.predict_proba(X)[:, 1], dtype=float)

    out = pd.DataFrame(cands)
    out["prob_good_ct_lt_threshold"] = proba
    out["ct_threshold_used"] = float(bundle.ct_threshold)
    out["decision_threshold_star"] = float(bundle.decision_threshold)
    return out


# -----------------------------------------------------------------------------
# Deduping / spacing
# -----------------------------------------------------------------------------
def dedupe_exact(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    return df.drop_duplicates(
        subset=["amp_start", "amp_end", "forward_primer", "reverse_primer", "probe"],
        keep="first",
    ).reset_index(drop=True)


def enforce_spacing(df: pd.DataFrame, min_sep: int) -> pd.DataFrame:
    if df.empty or min_sep <= 0:
        return df
    kept = []
    starts: List[int] = []
    for _, r in df.iterrows():
        s = int(r["amp_start"])
        if all(abs(s - ss) >= min_sep for ss in starts):
            kept.append(r)
            starts.append(s)
    return pd.DataFrame(kept).reset_index(drop=True)


def topn_as_payload(df: pd.DataFrame, topn: int) -> Dict[str, Any]:
    hits = df.head(topn).to_dict(orient="records")
    return {
        "n_candidates": int(len(df)),
        "n_returned": int(len(hits)),
        "ct_threshold_used": float(df["ct_threshold_used"].iloc[0]) if len(df) else None,
        "decision_threshold_star": float(df["decision_threshold_star"].iloc[0]) if len(df) else None,
        "hits": hits,
    }


# -----------------------------------------------------------------------------
# Ion entrypoint
# -----------------------------------------------------------------------------
def ion_main() -> None:
    inp = works.param(1) if _HAS_ION else None
    modelp = works.param(2) if _HAS_ION else None
    outp = works.param(3) if _HAS_ION else None
    optp = works.param(4) if _HAS_ION else None

    model_path = _normalize_path(modelp, default=DEFAULT_MODEL) or DEFAULT_MODEL
    out_path = _normalize_path(outp, default=None)

    options: Dict[str, Any] = {}
    if isinstance(optp, str) and optp.strip():
        try:
            options = json.loads(optp)
        except Exception:
            options = {}
    elif isinstance(optp, dict):
        options = optp

    topn = int(options.get("topn", 10))
    product_min = int(options.get("product_min", 60))
    product_max = int(options.get("product_max", 120))
    window_size = int(options.get("window_size", 260))
    step = int(options.get("step", 10))
    max_designs = int(options.get("max_designs", 3000))
    relax = bool(options.get("relax", True))
    no_probe = bool(options.get("no_probe", True))
    debug_primer3 = bool(options.get("debug_primer3", False))

    dedupe = bool(options.get("dedupe", True))
    min_sep = int(options.get("min_sep", 150))

    _progress(1, "Parsing track JSON (sequence + exons)...")
    name, raw_seq, exons = _extract_track_sequence_and_exons(inp)
    template = norm_rna_to_dna(raw_seq)

    if not template or len(template) < (product_min + 60):
        _emit_payload(
            {
                "error": "Input sequence is empty or too short after normalization.",
                "name": name,
                "raw_len": len(str(raw_seq)) if raw_seq is not None else 0,
                "clean_len": len(template),
            }
        )
        return

    junctions = exon_junction_positions(exons)

    _progress(5, f"Loading model bundle from: {model_path}")
    bundle = load_modelbundle(model_path)

    allow_probe = not no_probe

    _progress(10, "Designing candidates with primer3 (windowed)...")
    cands = design_candidates_windowed(
        template,
        product_min=product_min,
        product_max=product_max,
        window_size=window_size,
        step=step,
        max_designs=max_designs,
        allow_probe=allow_probe,
        relax=relax,
        debug=debug_primer3,
    )

    if not cands:
        _emit_payload(
            {
                "error": "No primer3 candidates found (even after windowing).",
                "name": name,
                "clean_len": len(template),
            }
        )
        return

    _progress(55, f"Scoring {len(cands)} candidates with Ct model...")
    df = score_candidates(bundle, cands)

    _progress(75, "Ranking candidates...")
    df = df.sort_values(
        by=["prob_good_ct_lt_threshold", "p3_pair_penalty", "amp_len"],
        ascending=[False, True, True],
    ).reset_index(drop=True)

    if dedupe:
        _progress(82, "De-duplicating exact amplicons...")
        df = dedupe_exact(df)
    if min_sep > 0:
        _progress(88, f"Enforcing min spacing (min_sep={min_sep})...")
        df = enforce_spacing(df, min_sep=min_sep)

    # ------------------ NEW FILTER: amplicon spans exon junction ------------------
    used_filter = "none"
    if junctions:
        mask = df.apply(lambda r: amplicon_spans_junction(int(r["amp_start"]), int(r["amp_end"]), junctions), axis=1)
        df_j = df[mask].reset_index(drop=True)
        if len(df_j) >= 1:
            df = df_j
            used_filter = "amplicon_spans_exon_junction"
        else:
            used_filter = "no_hits_spanning_junction_fallback_to_unfiltered"
    else:
        used_filter = "no_exon_junctions_fallback_to_unfiltered"
    # ---------------------------------------------------------------------------

    topn = max(1, topn)
    topdf = df.head(topn).copy()
    topdf.insert(0, "transcript_id", name)

    if out_path:
        _progress(90, f"Writing output: {out_path}")
        if out_path.lower().endswith(".xlsx"):
            topdf.to_excel(out_path, index=False)
        else:
            topdf.to_csv(out_path, index=False)

    payload = topn_as_payload(topdf, topn=topn)
    payload["transcript_id"] = name
    payload["clean_len"] = len(template)
    payload["exon_count"] = int(len(exons))
    payload["junction_count"] = int(len(junctions))
    payload["junction_filter"] = used_filter
    payload["params"] = {
        "topn": topn,
        "product_min": product_min,
        "product_max": product_max,
        "window_size": window_size,
        "step": step,
        "max_designs": max_designs,
        "relax": relax,
        "no_probe": no_probe,
        "dedupe": dedupe,
        "min_sep": min_sep,
        "model_path": model_path,
    }

    _progress(100, "Done.")
    _emit_payload(payload)


# -----------------------------------------------------------------------------
# CLI entrypoint (optional)
# -----------------------------------------------------------------------------
def cli_main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="TRACK JSON string/file not supported here; raw seq/FASTA ok")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--out", default="")
    ap.add_argument("--topn", type=int, default=10)

    ap.add_argument("--product-min", type=int, default=60)
    ap.add_argument("--product-max", type=int, default=120)
    ap.add_argument("--window-size", type=int, default=260)
    ap.add_argument("--step", type=int, default=10)
    ap.add_argument("--max-designs", type=int, default=3000)
    ap.add_argument("--relax", action="store_true")
    ap.add_argument("--no-probe", action="store_true")
    ap.add_argument("--debug-primer3", action="store_true")

    ap.add_argument("--dedupe", action="store_true")
    ap.add_argument("--min-sep", type=int, default=150)
    args = ap.parse_args()

    name, raw = _extract_first_sequence(args.input)
    template = norm_rna_to_dna(raw)
    if not template or len(template) < args.product_min + 60:
        raise SystemExit("Input sequence is empty/too short after normalization.")

    bundle = load_modelbundle(args.model)
    cands = design_candidates_windowed(
        template,
        product_min=args.product_min,
        product_max=args.product_max,
        window_size=args.window_size,
        step=args.step,
        max_designs=args.max_designs,
        allow_probe=not args.no_probe,
        relax=bool(args.relax),
        debug=bool(args.debug_primer3),
    )
    if not cands:
        raise SystemExit("No primer3 candidates found.")

    df = score_candidates(bundle, cands).sort_values(
        by=["prob_good_ct_lt_threshold", "p3_pair_penalty", "amp_len"],
        ascending=[False, True, True],
    ).reset_index(drop=True)

    if args.dedupe:
        df = dedupe_exact(df)
    if args.min_sep > 0:
        df = enforce_spacing(df, min_sep=args.min_sep)

    topdf = df.head(max(1, args.topn)).copy()
    topdf.insert(0, "transcript_id", name)

    if args.out:
        if args.out.lower().endswith(".xlsx"):
            topdf.to_excel(args.out, index=False)
        else:
            topdf.to_csv(args.out, index=False)

    print(topdf.to_string(index=False))


if __name__ == "__main__":
    if _HAS_ION:
        ion_main()
    else:
        cli_main()