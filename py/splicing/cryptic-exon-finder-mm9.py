#!/usr/bin/env python3
"""
Ion Works script (WITH bigWig) - UPDATED FOR mm9 + NEW MODEL

Thin script:
- Computes BW_PATH inside the BIGDATA cache folder
- Calls works.ensure_bigdata_file_async_or_resolve(...) to ensure the bigWig exists locally
  (ALL server exists check + async download + lock handling is inside works)
- Then opens the local .bw and proceeds

Local cache base resolution:
  1) env BIGDATA (passed by Node as bigDataFilesPath)
  2) env WD + "/bigdata" (WD passed by Node as process.cwd())
  3) "/tmp/bigdata"

Node sets env:
  BIGDATA, SENDER_USER_ID, WD, SERVER_BASE_URL

Server endpoints expected by works.ensure_bigdata_file_async_or_resolve:
  GET  /bigdata-exists?filename=...&path=...
  GET  /bigdata?filename=...&path=...   (or set env BIGDATA_DOWNLOAD_PATH to your actual download route)
"""

from ion import works
import os
import pickle
from typing import List, Tuple, Optional, Dict, Union
from bisect import bisect_left, bisect_right
import re

import numpy as np


# ----------------------------
# Exon length guardrails (defaults)
# ----------------------------
# You can override via params 6 and 7 as before.
EXON_MIN_DEFAULT = 20
EXON_MAX_DEFAULT = 1000


# ----------------------------
# Model + features
# ----------------------------

def unwrap_model(obj):
    """
    Supports either:
      - raw sklearn Pipeline / estimator
      - {"model": estimator, "feature_names": [...], "args": {...}}
    """
    if isinstance(obj, dict) and "model" in obj:
        return obj["model"], obj.get("feature_names"), obj.get("args")
    return obj, None, None


def conservation_features(vals: np.ndarray) -> Optional[np.ndarray]:
    """
    MUST match the features used in training.
    (This matches your training script: 13 summary features.)
    """
    if vals.size == 0:
        return None
    good = np.isfinite(vals)
    n = int(good.sum())
    if n < 5:
        return None
    v = vals[good]
    feats = np.array([
        float(n),
        float(vals.size),
        float(n / vals.size),
        float(np.mean(v)),
        float(np.std(v)),
        float(np.min(v)),
        float(np.max(v)),
        float(np.median(v)),
        float(np.quantile(v, 0.10)),
        float(np.quantile(v, 0.90)),
        float(np.mean(v > 0.0)),
        float(np.mean(v > 2.0)),
        float(np.mean(v < 0.0)),
    ], dtype=float)
    return feats


# ----------------------------
# bigWig fetch
# ----------------------------

def fetch_bigwig_scores(
    bw_path: str,
    chrom: Union[str, int],
    start0: int,
    end0: int
) -> np.ndarray:
    """
    Fetch per-base scores from a bigWig for [start0, end0) (0-based, half-open).
    Returns float array of length (end0-start0) with NaN for missing values.
    """
    try:
        import pyBigWig  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "pyBigWig is required to read .bw files but could not be imported. "
            "Install it (e.g., pip install pyBigWig)."
        ) from e

    # ---- Normalize chromosome ----
    if isinstance(chrom, int):
        chrom = str(chrom)
    elif not isinstance(chrom, str):
        raise RuntimeError(f"Invalid chrom type: {type(chrom)}")

    chrom = chrom.strip()

    # ---- Validate interval ----
    if start0 < 0 or end0 < 0 or end0 < start0:
        raise RuntimeError(f"Invalid interval: {chrom}:{start0}-{end0}")

    with pyBigWig.open(bw_path) as bw:
        chroms = bw.chroms()

        # ---- Resolve chromosome name ----
        if chrom not in chroms:
            alt = None
            if chrom.startswith("chr"):
                maybe = chrom[3:]
                if maybe in chroms:
                    alt = maybe
            else:
                maybe = "chr" + chrom
                if maybe in chroms:
                    alt = maybe

            if alt is None:
                examples = list(chroms.keys())[:10]
                raise RuntimeError(
                    f"Chrom '{chrom}' not found in bigWig. Example chroms: {examples} ..."
                )
            chrom = alt

        # ---- Clamp interval to chromosome bounds ----
        chrom_len = chroms[chrom]
        req_len = end0 - start0
        s = max(0, start0)
        e = min(end0, chrom_len)

        arr = np.full(req_len, np.nan, dtype=float)

        if e > s:
            vals = bw.values(chrom, s, e, numpy=True)
            vals = np.asarray(vals, dtype=float)
            offset = s - start0
            arr[offset:offset + (e - s)] = vals

        return arr


# ----------------------------
# Motif-aware exon scanning on sequence
# ----------------------------

def scan_exon_like_candidates(
    seq: str,
    strand: str,
    min_len: int,
    max_len: int,
    max_candidates: int,
) -> Tuple[List[Tuple[int, int]], Dict[str, object]]:
    """
    Find exon-like candidates bounded by canonical acceptor/donor motifs.

    Coordinates are 0-based, half-open intervals [exon_start, exon_end) on `seq`.

    Motif rules (genomic sequence as given):
      + strand: acceptor='AG' ends at exon_start; donor='GT' starts at exon_end
      - strand: acceptor='CT' ends at exon_start; donor='AC' starts at exon_end
    """
    if strand not in {"+", "-"}:
        strand = "+"

    if min_len < 1 or max_len < min_len:
        return [], {"acceptor": "", "donor": "", "acceptor_pos": [], "donor_pos": []}

    seq_u = seq.upper()
    L = len(seq_u)
    if L < (min_len + 4):
        return [], {"acceptor": "", "donor": "", "acceptor_pos": [], "donor_pos": []}

    if strand == "+":
        acceptor, donor = "AG", "GT"
    else:
        acceptor, donor = "CT", "AC"

    accept_re = re.compile(acceptor)
    donor_re = re.compile(donor)

    acc_pos = [m.start() for m in accept_re.finditer(seq_u)]
    don_pos = [m.start() for m in donor_re.finditer(seq_u)]
    don_pos.sort()

    if not acc_pos or not don_pos:
        return [], {"acceptor": acceptor, "donor": donor, "acceptor_pos": acc_pos, "donor_pos": don_pos}

    out: List[Tuple[int, int]] = []
    seen = set()

    for a in acc_pos:
        exon_s = a + 2  # acceptor ends at exon start
        d_min = exon_s + min_len
        d_max = exon_s + max_len

        i0 = bisect_left(don_pos, d_min)
        i1 = bisect_right(don_pos, d_max)

        for d in don_pos[i0:i1]:
            exon_e = d
            if exon_e <= exon_s:
                continue
            if exon_e - exon_s < min_len or exon_e - exon_s > max_len:
                continue

            if exon_s - 2 < 0 or seq_u[exon_s - 2:exon_s] != acceptor:
                continue
            if exon_e + 2 > L or seq_u[exon_e:exon_e + 2] != donor:
                continue

            key = (exon_s, exon_e)
            if key not in seen:
                out.append(key)
                seen.add(key)

            if len(out) >= max_candidates:
                info = {"acceptor": acceptor, "donor": donor, "acceptor_pos": acc_pos, "donor_pos": don_pos}
                return out, info

    info = {"acceptor": acceptor, "donor": donor, "acceptor_pos": acc_pos, "donor_pos": don_pos}
    return out, info


# ----------------------------
# Post-process: overlap clusters + keep top N per cluster
# ----------------------------

def keep_top_n_per_overlap_cluster(results: List[Dict], n_keep: int = 3) -> List[Dict]:
    """
    Cluster results by overlap (half-open [xi, xf)), then keep the top `n_keep` per cluster.
    """
    if not results or n_keep <= 0:
        return []

    sorted_by_pos = sorted(results, key=lambda r: (int(r["xi"]), int(r["xf"])))

    clusters: List[List[Dict]] = []
    cur_cluster: List[Dict] = []
    cur_end = None

    for r in sorted_by_pos:
        s = int(r["xi"])
        e = int(r["xf"])

        if not cur_cluster:
            cur_cluster = [r]
            cur_end = e
            continue

        if s < cur_end:
            cur_cluster.append(r)
            if e > cur_end:
                cur_end = e
        else:
            clusters.append(cur_cluster)
            cur_cluster = [r]
            cur_end = e

    if cur_cluster:
        clusters.append(cur_cluster)

    kept: List[Dict] = []
    for cl in clusters:
        ranked = sorted(
            cl,
            key=lambda r: (
                float(r["score"]),
                int(r.get("length", int(r["xf"]) - int(r["xi"]))),
                -int(r["xi"]),
                -int(r["xf"]),
            ),
            reverse=True,
        )
        kept.extend(ranked[:n_keep])

    return sorted(kept, key=lambda r: (int(r["xi"]), int(r["xf"])))


# ----------------------------
# Scoring candidates
# ----------------------------

def score_candidates(
    model,
    cons: np.ndarray,
    candidates: List[Tuple[int, int]],
    threshold: float
) -> Tuple[List[Dict], str]:
    X = []
    kept = []

    for s_rel, e_rel in candidates:
        vals = cons[s_rel:e_rel]
        feats = conservation_features(vals)
        if feats is None:
            continue
        X.append(feats)
        kept.append((s_rel, e_rel))

    if not X:
        return [], "none"

    X = np.vstack(X)

    if hasattr(model, "predict_proba"):
        scores = model.predict_proba(X)[:, 1]
        score_type = "predict_proba"
    elif hasattr(model, "decision_function"):
        raw = model.decision_function(X)
        scores = 1.0 / (1.0 + np.exp(-raw))
        score_type = "sigmoid(decision_function)"
    elif hasattr(model, "predict"):
        pred = model.predict(X)
        scores = pred.astype(float)
        score_type = "hard_label"
    else:
        raise RuntimeError("Model supports neither predict_proba(), decision_function(), nor predict().")

    results = []
    for (s_rel, e_rel), sc in zip(kept, scores):
        if sc < threshold:
            continue
        results.append({
            "xi": int(s_rel),
            "xf": int(e_rel),
            "length": int(e_rel - s_rel),
            "score": float(sc),
            "score_type": score_type,
        })

    return results, score_type


# ----------------------------
# Ion Works parameters
# ----------------------------

sequence = works.param(1)
chrom = works.param(2) or ""
startIndex = int(works.param(3)) if works.param(3) is not None else None
endIndex = int(works.param(4)) if works.param(4) is not None else None
strand = works.param(5) or "+"

min_exon_len = int(works.param(6)) if works.param(6) else EXON_MIN_DEFAULT
max_exon_len = int(works.param(7)) if works.param(7) else EXON_MAX_DEFAULT
max_candidates = int(works.param(8)) if works.param(8) else 100000
threshold = float(works.param(9)) if works.param(9) else 0.99

if sequence is None:
    raise RuntimeError("sequence (param 1) is required.")
sequence = str(sequence)
window_len = len(sequence)

if not chrom:
    raise RuntimeError("chrom (param 2) is required to fetch bigWig scores.")
if startIndex is None:
    raise RuntimeError("startIndex (param 3) is required to fetch bigWig scores.")

# Normalize endIndex semantics (half-open)
if endIndex is None:
    endIndex = int(startIndex + window_len)
else:
    # If caller passed inclusive end, normalize to half-open
    if (endIndex - startIndex) == (window_len - 1):
        endIndex = int(endIndex + 1)

if (endIndex - startIndex) != window_len:
    works.msg(f"WARNING: end-start = {endIndex-startIndex} but sequence length = {window_len}")


# ----------------------------
# NEW: bigWig + model selection (env-overridable)
# ----------------------------

# bigWig filename in BIGDATA cache:
# Default: your mm9 phyloP
# Override via env BIGWIG_NAME if needed
bw_name = (os.getenv("BIGWIG_NAME") or "phyloP30way.mm9.bw").strip()

# bigWig subdir under BIGDATA:
# Default: bigwig (same as your original)
# Override via env BIGDATA_LOCAL_SUBDIR if your server stores it elsewhere
BIGDATA_ROOT = (os.getenv("BIGDATA") or "").strip()
LOCAL_BIGDATA_SUBDIR = (os.getenv("BIGDATA_LOCAL_SUBDIR") or "bigwig").strip().strip("/")
BIGDATA_SUBPATH = LOCAL_BIGDATA_SUBDIR

BW_PATH = os.path.abspath(os.path.join(BIGDATA_ROOT, LOCAL_BIGDATA_SUBDIR, bw_name))

works.ensure_bigdata_file_async_or_resolve(
    local_path=BW_PATH,
    filename=bw_name,
    subpath=BIGDATA_SUBPATH
)

# Fetch conservation for the window
try:
    cons = fetch_bigwig_scores(BW_PATH, chrom=chrom, start0=int(startIndex), end0=int(endIndex))
except RuntimeError as e:
    if "pyBigWig" in str(e):
        works.resolve({
            "status": "missing_dependency",
            "dependency": "pyBigWig",
            "message": str(e),
            "how_to_fix": [
                "Install pyBigWig in the same Python environment used by Node spawn('python3').",
                "Examples:",
                "  pip install pyBigWig",
                "  conda install -c bioconda pybigwig",
            ],
            "meta": {
                "chrom": chrom,
                "start": int(startIndex),
                "end": int(endIndex),
                "strand": strand,
                "window_len": window_len,
                "bigwig_path": BW_PATH
            },
        })
        raise SystemExit(0)
    raise

if cons.size != window_len:
    raise RuntimeError(f"Fetched conservation length ({cons.size}) must match sequence length ({window_len}).")


# ----------------------------
# NEW: load the NEW model pickle (env-overridable)
# ----------------------------

# Default: your newly trained hard-neg model pickle placed next to this script.
# Override via env MODEL_PKL_NAME if you want to hot-swap models without editing code.
MODEL_PKL_NAME = (os.getenv("MODEL_PKL_NAME") or "exon_intron_mm9_phyloP_logreg_hardnegs_chr16.pkl").strip()
MODEL_PKL = os.path.join(os.path.dirname(__file__), MODEL_PKL_NAME)

if not os.path.exists(MODEL_PKL):
    raise RuntimeError(
        f"Model not found: {MODEL_PKL}\n"
        f"Tip: copy your trained pickle next to this script or set env MODEL_PKL_NAME / MODEL_PKL_NAME."
    )

with open(MODEL_PKL, "rb") as f:
    loaded = pickle.load(f)

model, feature_names, train_args = unwrap_model(loaded)


# ----------------------------
# Candidate generation + scoring
# ----------------------------

candidates, motifs = scan_exon_like_candidates(
    seq=sequence,
    strand=strand,
    min_len=min_exon_len,
    max_len=max_exon_len,
    max_candidates=max_candidates,
)

results, score_type = score_candidates(
    model=model,
    cons=cons,
    candidates=candidates,
    threshold=threshold,
)

# Cluster by overlap and keep top N per cluster
results = keep_top_n_per_overlap_cluster(results, n_keep=10)

for r in results:
    r["chrom"] = chrom
    r["start_abs"] = int(startIndex + r["xi"])
    r["end_abs"] = int(startIndex + r["xf"])
    r["motifs"] = motifs
    r["strand"] = strand


works.resolve({
    "results": results,
    "meta": {
        "chrom": chrom,
        "start": int(startIndex),
        "end": int(endIndex),
        "strand": strand,
        "window_len": window_len,
        "n_candidates_generated": len(candidates),
        "n_returned": len(results),
        "min_exon_len": min_exon_len,
        "max_exon_len": max_exon_len,
        "threshold": threshold,
        "motifs_used": motifs,
        "score_type": score_type,
        "feature_names": feature_names,
        "train_args": train_args,
        "model_pickle_wrapped": isinstance(loaded, dict) and "model" in loaded,

        # NEW meta fields
        "model_pkl": MODEL_PKL,
        "bigwig_name": bw_name,

        # Old fields preserved
        "bigwig_path": BW_PATH,
        "bigdata_subpath": BIGDATA_SUBPATH,
        "bigdata_root": BIGDATA_ROOT,
        "bigdata_local_subdir": LOCAL_BIGDATA_SUBDIR
    }
})
