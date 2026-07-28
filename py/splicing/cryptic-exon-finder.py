#!/usr/bin/env python3
"""
Ion Works script (WITH bigWig) — no revcomp on reverse strand

Behavior:
- Generate exon-like candidates using canonical splice motifs.
- Score ALL candidates and keep those with score >= threshold.
- If results overlap, collapse each overlap-cluster to ONLY the single best-scoring hit.
  (Tie-breakers: higher score, longer length, earlier start, earlier end)

Strand rule (as requested):
- strand == -1 : negative strand
- otherwise    : positive strand

Key change for negative strand:
- DO NOT reverse-complement anything.
- Instead, scan the reference-window sequence directly but swap splice motifs:
    + strand: acceptor='AG' (upstream of exon start), donor='GT' (downstream of exon end)
    - strand: acceptor='AC' (revcomp of GT),        donor='CT' (revcomp of AG)

So:
  + strand expects ...AG|EXON|GT...
  - strand expects ...AC|EXON|CT...
"""

from ion import works
import os
import pickle
from typing import List, Tuple, Optional, Dict, Union
import re
import numpy as np
from bisect import bisect_left, bisect_right


# ----------------------------
# Human-standard exon length guardrails
# ----------------------------

HUMAN_EXON_MIN = 50
HUMAN_EXON_MAX = 1000


# ----------------------------
# Model + features
# ----------------------------

def unwrap_model(obj):
    if isinstance(obj, dict) and "model" in obj:
        return obj["model"], obj.get("feature_names"), obj.get("args")
    return obj, None, None


def conservation_features(vals: np.ndarray) -> Optional[np.ndarray]:
    if vals.size == 0:
        return None
    good = np.isfinite(vals)
    n = int(good.sum())
    if n < 5:
        return None
    v = vals[good]
    return np.array([
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

    if isinstance(chrom, int):
        chrom = str(chrom)
    elif not isinstance(chrom, str):
        raise RuntimeError(f"Invalid chrom type: {type(chrom)}")

    chrom = chrom.strip()

    if start0 < 0 or end0 < 0 or end0 < start0:
        raise RuntimeError(f"Invalid interval: {chrom}:{start0}-{end0}")

    with pyBigWig.open(bw_path) as bw:
        chroms = bw.chroms()

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
                examples = list(chroms.keys())[:5]
                raise RuntimeError(
                    f"Chrom '{chrom}' not found in bigWig. Example chroms: {examples} ..."
                )
            chrom = alt

        chrom_len = chroms[chrom]
        req_len = end0 - start0
        s = max(0, start0)
        e = min(end0, chrom_len)

        arr = np.full(req_len, np.nan, dtype=float)
        if e > s:
            vals = np.asarray(bw.values(chrom, s, e, numpy=True), dtype=float)
            offset = s - start0
            arr[offset:offset + (e - s)] = vals

        return arr


# ----------------------------
# Motif-aware exon scanning (motifs depend on strand; NO revcomp)
# ----------------------------

def scan_exon_like_candidates(
    seq: str,
    min_len: int,
    max_len: int,
    max_candidates: int,
    acceptor: str,
    donor: str,
) -> Tuple[List[Tuple[int, int]], Dict[str, object]]:
    """
    Find exon-like candidates bounded by acceptor/donor motifs in *reference-window* orientation.

    Coordinates are 0-based, half-open intervals [exon_start, exon_end) on `seq`.

    Motif rules (sequence as given here):
      acceptor ends at exon_start; donor starts at exon_end

    i.e. ...ACCEPTOR|EXON|DONOR...

    For + strand:
      acceptor='AG', donor='GT'  => ...AG|EXON|GT...
    For - strand (requested behavior: swap, no revcomp):
      acceptor='AC', donor='CT'  => ...AC|EXON|CT...
    """
    if min_len < 1 or max_len < min_len:
        return [], {"acceptor": acceptor, "donor": donor, "acceptor_pos": [], "donor_pos": []}

    seq_u = seq.upper()
    L = len(seq_u)

    if L < (min_len + 4):
        return [], {"acceptor": acceptor, "donor": donor, "acceptor_pos": [], "donor_pos": []}

    acceptor = acceptor.upper()
    donor = donor.upper()

    acc_pos = [m.start() for m in re.finditer(acceptor, seq_u)]
    don_pos = [m.start() for m in re.finditer(donor, seq_u)]
    don_pos.sort()

    if not acc_pos or not don_pos:
        return [], {"acceptor": acceptor, "donor": donor, "acceptor_pos": acc_pos, "donor_pos": don_pos}

    out: List[Tuple[int, int]] = []
    seen = set()

    for a in acc_pos:
        exon_s = a + len(acceptor)
        d_min = exon_s + min_len
        d_max = exon_s + max_len

        i0 = bisect_left(don_pos, d_min)
        i1 = bisect_right(don_pos, d_max)

        for d in don_pos[i0:i1]:
            exon_e = d

            if exon_e <= exon_s:
                continue
            Lx = exon_e - exon_s
            if Lx < min_len or Lx > max_len:
                continue

            # boundary checks
            if exon_s - len(acceptor) < 0 or seq_u[exon_s - len(acceptor):exon_s] != acceptor:
                continue
            if exon_e + len(donor) > L or seq_u[exon_e:exon_e + len(donor)] != donor:
                continue

            key = (exon_s, exon_e)
            if key not in seen:
                out.append(key)
                seen.add(key)

            if len(out) >= max_candidates:
                return out, {
                    "acceptor": acceptor,
                    "donor": donor,
                    "acceptor_pos": acc_pos,
                    "donor_pos": don_pos,
                }

    return out, {
        "acceptor": acceptor,
        "donor": donor,
        "acceptor_pos": acc_pos,
        "donor_pos": don_pos,
    }


# ----------------------------
# Scoring: keep ALL >= threshold
# ----------------------------

def score_candidates_all(
    model,
    cons: np.ndarray,
    candidates: List[Tuple[int, int]],
    threshold: float
) -> Tuple[List[Dict], str]:
    X = []
    kept = []

    for s_rel, e_rel in candidates:
        feats = conservation_features(cons[s_rel:e_rel])
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
        scores = model.predict(X).astype(float)
        score_type = "hard_label"
    else:
        raise RuntimeError("Model supports neither predict_proba(), decision_function(), nor predict().")

    results = []
    for (s_rel, e_rel), sc in zip(kept, scores):
        sc = float(sc)
        if sc >= threshold:
            results.append({
                "xi": int(s_rel),
                "xf": int(e_rel),
                "length": int(e_rel - s_rel),
                "score": sc,
                "score_type": score_type,
            })

    return results, score_type


# ----------------------------
# Overlap collapse: keep ONLY best per overlap cluster
# ----------------------------

def collapse_overlaps_keep_best(results: List[Dict]) -> List[Dict]:
    """
    Given results with xi/xf/score, cluster by overlap (half-open),
    and keep only the single best hit per overlap cluster.

    Tie-breakers:
      1) higher score
      2) longer length
      3) earlier start (smaller xi)
      4) earlier end (smaller xf)
    """
    if not results:
        return []

    sorted_by_pos = sorted(results, key=lambda r: (int(r["xi"]), int(r["xf"])))

    clusters: List[List[Dict]] = []
    cur: List[Dict] = []
    cur_end: Optional[int] = None

    for r in sorted_by_pos:
        s = int(r["xi"])
        e = int(r["xf"])

        if not cur:
            cur = [r]
            cur_end = e
            continue

        # overlaps current cluster span if s < cur_end (half-open)
        if cur_end is not None and s < cur_end:
            cur.append(r)
            if e > cur_end:
                cur_end = e
        else:
            clusters.append(cur)
            cur = [r]
            cur_end = e

    if cur:
        clusters.append(cur)

    bests: List[Dict] = []
    for cl in clusters:
        best = sorted(
            cl,
            key=lambda r: (
                -float(r["score"]),                                # higher score first
                -int(r.get("length", int(r["xf"]) - int(r["xi"]))), # longer first
                int(r["xi"]),                                      # earlier start first
                int(r["xf"]),                                      # earlier end first
            )
        )[0]
        bests.append(best)

    return sorted(bests, key=lambda r: (int(r["xi"]), int(r["xf"])))


# ----------------------------
# Ion Works parameters
# ----------------------------

sequence = works.param(1)
chrom = works.param(2) or ""
startIndex = int(works.param(3)) if works.param(3) is not None else None
endIndex = int(works.param(4)) if works.param(4) is not None else None
strand = works.param(5)
strand = int(strand) if strand is not None else 1

min_exon_len = int(works.param(6)) if works.param(6) else HUMAN_EXON_MIN
max_exon_len = int(works.param(7)) if works.param(7) else HUMAN_EXON_MAX
max_candidates = int(works.param(8)) if works.param(8) else 100000
threshold = float(works.param(9)) if works.param(9) else 0.98

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

bw_name = "gerp_conservation_scores.homo_sapiens.GRCh38.bw"
BIGDATA_ROOT = (os.getenv("BIGDATA") or "").strip()
LOCAL_BIGDATA_SUBDIR = (os.getenv("BIGDATA_LOCAL_SUBDIR") or "bigwig").strip().strip("/")
BW_PATH = os.path.abspath(os.path.join(BIGDATA_ROOT, LOCAL_BIGDATA_SUBDIR, bw_name))
BIGDATA_SUBPATH = LOCAL_BIGDATA_SUBDIR

works.ensure_bigdata_file_async_or_resolve(
    local_path=BW_PATH,
    filename=bw_name,
    subpath=BIGDATA_SUBPATH
)

# bigWig fetch (strandless, reference-coordinate)
try:
    cons_ref = fetch_bigwig_scores(BW_PATH, chrom=chrom, start0=int(startIndex), end0=int(endIndex))
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

if cons_ref.size != window_len:
    raise RuntimeError(
        f"Fetched conservation length ({cons_ref.size}) must match sequence length ({window_len})."
    )


# ----------------------------
# Load model
# ----------------------------

MODEL_PKL = os.path.join(os.path.dirname(__file__), "exon_from_gerp.pkl")
if not os.path.exists(MODEL_PKL):
    raise RuntimeError(f"Model not found next to script: {MODEL_PKL}")

with open(MODEL_PKL, "rb") as f:
    loaded = pickle.load(f)

model, feature_names, train_args = unwrap_model(loaded)


# ----------------------------
# Candidate generation + scoring + overlap collapse (strand-aware motifs; NO revcomp)
# ----------------------------

seq_for_scan = sequence
cons_for_scan = cons_ref

# strand == -1 => negative; else positive
if strand == -1:
    acceptor, donor = "TG", "GA"
else:
    acceptor, donor = "AG", "GT"

candidates, motifs = scan_exon_like_candidates(
    seq=seq_for_scan,
    min_len=min_exon_len,
    max_len=max_exon_len,
    max_candidates=max_candidates,
    acceptor=acceptor,
    donor=donor,
)

motifs["strand_rule"] = "strand == -1 => negative else positive"
motifs["motif_logic"] = "+ uses AG/GT; - uses AC/CT (no revcomp)"

results, score_type = score_candidates_all(
    model=model,
    cons=cons_for_scan,
    candidates=candidates,
    threshold=threshold,
)

# Collapse overlaps in reference-window coordinates
results = collapse_overlaps_keep_best(results)

# Add absolute coordinates + metadata
for r in results:
    r["chrom"] = chrom
    r["start_abs"] = int(startIndex + int(r["xi"]))
    r["end_abs"] = int(startIndex + int(r["xf"]))
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
        "bigwig_path": BW_PATH,
        "bigdata_subpath": BIGDATA_SUBPATH,
        "bigdata_root": BIGDATA_ROOT,
        "bigdata_local_subdir": LOCAL_BIGDATA_SUBDIR,
        "note": (
            "Per request: no reverse-complement scanning on negative strand. "
            "Instead we scan reference-window sequence using swapped motifs: - uses AC/CT."
        ),
    }
})
