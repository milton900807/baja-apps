#!/usr/bin/env python3
"""
Ion Works script (WITH sequence->conservation model, NO bigWig lookup)

What changed vs your original:
- Removes bigWig fetching (no pyBigWig required)
- Loads a co-located regression model: gerp_seq5_ridge_genome.pkl
- Predicts per-base "conservation" from the provided `sequence` using a centered 5bp window
  (same encoding as the trainer: one-hot over {A,C,G,T,N} for each of 5 positions)
- Then proceeds exactly as before: motif scan -> features from predicted conservation -> exon model scoring

Assumptions:
- gerp_seq5_ridge_genome.pkl lives next to this script and contains {"model": ..., "meta": ...}
  as produced by the training script.
- The sequence passed in is the genomic sequence in the given window.
"""

from ion import works
import os
import pickle
from typing import List, Tuple, Optional, Dict
import re

import numpy as np

# ----------------------------
# Human-standard exon length guardrails
# ----------------------------

HUMAN_EXON_MIN = 20
HUMAN_EXON_MAX = 1000

# ----------------------------
# Helper: unwrap model payload
# ----------------------------

def unwrap_model(obj):
    if isinstance(obj, dict) and "model" in obj:
        return obj["model"], obj.get("feature_names"), obj.get("args") or obj.get("meta")
    return obj, None, None

# ----------------------------
# Conservation features (unchanged)
# ----------------------------

def conservation_features(vals: np.ndarray) -> Optional[np.ndarray]:
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
# NEW: sequence -> per-base conservation prediction (5bp window)
# ----------------------------

BASES = ["A", "C", "G", "T", "N"]
BASE_TO_IDX = {b: i for i, b in enumerate(BASES)}

def one_hot_seq_window(seq5: str) -> np.ndarray:
    """One-hot encode 5-mer into 25-dim float vector."""
    if len(seq5) != 5:
        raise ValueError(f"Expected 5-mer, got len={len(seq5)}")
    x = np.zeros((5, 5), dtype=np.float32)
    s = seq5.upper()
    for p, ch in enumerate(s):
        idx = BASE_TO_IDX.get(ch, BASE_TO_IDX["N"])
        x[p, idx] = 1.0
    return x.reshape(-1)

def predict_conservation_from_sequence(seq: str, model) -> np.ndarray:
    """
    Predict a per-base conservation array for `seq`.

    Returns:
      cons: float array length len(seq)
        - positions 0,1 and last two are NaN (no full 5bp context)
        - positions 2..len-3 are predicted by the model
    """
    seq_u = str(seq).upper()
    n = len(seq_u)
    cons = np.full(n, np.nan, dtype=float)

    if n < 5:
        return cons

    X = []
    centers = []
    for i in range(2, n - 2):
        mer = seq_u[i - 2 : i + 3]
        X.append(one_hot_seq_window(mer))
        centers.append(i)

    if not X:
        return cons

    X = np.vstack(X).astype(np.float32)
    pred = model.predict(X)

    # Fill back in
    for idx, p in zip(centers, pred):
        cons[idx] = float(p)

    return cons

# ----------------------------
# Motif-aware exon scanning on sequence (unchanged)
# ----------------------------

from bisect import bisect_left, bisect_right

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
        exon_s = a + 2

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
# Post-process: overlap clusters + keep top N per cluster (unchanged)
# ----------------------------

def keep_top_n_per_overlap_cluster(results: List[Dict], n_keep: int = 3) -> List[Dict]:
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

    kept = sorted(kept, key=lambda r: (int(r["xi"]), int(r["xf"])))
    return kept

# ----------------------------
# Scoring candidates (unchanged)
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
# Ion Works parameters (same signature)
# ----------------------------

sequence = works.param(1)
chrom = works.param(2) or ""
startIndex = int(works.param(3)) if works.param(3) is not None else None
endIndex = int(works.param(4)) if works.param(4) is not None else None
strand = works.param(5) or "+"

min_exon_len = int(works.param(6)) if works.param(6) else HUMAN_EXON_MIN
max_exon_len = int(works.param(7)) if works.param(7) else HUMAN_EXON_MAX
max_candidates = int(works.param(8)) if works.param(8) else 100000
threshold = float(works.param(9)) if works.param(9) else 0.50

if sequence is None:
    raise RuntimeError("sequence (param 1) is required.")
sequence = str(sequence)
window_len = len(sequence)

# NOTE: chrom/startIndex still carried through for absolute coordinates in results.
# We no longer require chrom/startIndex to fetch bigWig, but we keep validations if you want.
if not chrom:
    raise RuntimeError("chrom (param 2) is required (used for reporting absolute coords).")
if startIndex is None:
    raise RuntimeError("startIndex (param 3) is required (used for reporting absolute coords).")

# Normalize endIndex semantics (half-open)
if endIndex is None:
    endIndex = int(startIndex + window_len)
else:
    if (endIndex - startIndex) == (window_len - 1):
        endIndex = int(endIndex + 1)

if (endIndex - startIndex) != window_len:
    works.msg(f"WARNING: end-start = {endIndex-startIndex} but sequence length = {window_len}")

# ----------------------------
# NEW: Load co-located sequence->conservation model
# ----------------------------

CONS_MODEL_PKL = os.path.join(os.path.dirname(__file__), "gerp_seq5_ridge_genome.pkl")
if not os.path.exists(CONS_MODEL_PKL):
    raise RuntimeError(f"Conservation model not found next to script: {CONS_MODEL_PKL}")

with open(CONS_MODEL_PKL, "rb") as f:
    cons_loaded = pickle.load(f)

cons_model, cons_feature_names, cons_meta = unwrap_model(cons_loaded)

# Predict per-base conservation from sequence
cons = predict_conservation_from_sequence(sequence, cons_model)

# Sanity: should match sequence length
if cons.size != window_len:
    raise RuntimeError(
        f"Predicted conservation length ({cons.size}) must match sequence length ({window_len})."
    )

# ----------------------------
# Load exon classifier model (still next to script)
# ----------------------------

EXON_MODEL_PKL = os.path.join(os.path.dirname(__file__), "exon_from_gerp.pkl")
if not os.path.exists(EXON_MODEL_PKL):
    raise RuntimeError(f"Exon model not found next to script: {EXON_MODEL_PKL}")

with open(EXON_MODEL_PKL, "rb") as f:
    loaded = pickle.load(f)

exon_model, feature_names, train_args = unwrap_model(loaded)

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
    model=exon_model,
    cons=cons,
    candidates=candidates,
    threshold=threshold,
)

results = keep_top_n_per_overlap_cluster(results, n_keep=1)

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

        # new model info
        "conservation_model_path": CONS_MODEL_PKL,
        "conservation_model_wrapped": isinstance(cons_loaded, dict) and "model" in cons_loaded,
        "conservation_model_feature_names": cons_feature_names,
        "conservation_model_meta": cons_meta,

        # indicate we did NOT use bigWig
        "conservation_source": "sequence_model",
    }
})
