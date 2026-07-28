#!/usr/bin/env python3
"""
Ion Works script (WITH bigWig) — find TOP-K cryptic 3' UTR polyA/cleavage sites (NO revcomp)

Interpretation (since we are only given a window sequence, not CDS/stop-codon):
- We treat a "cryptic 3' UTR site" as a *polyA signal (PAS) + plausible cleavage position* that could
  terminate the transcript within the provided window.
- We require the inferred terminal region length (acceptor->cleavage, or anchor->cleavage for - strand)
  to be within a *typical 3' UTR / terminal-region length range* (NOT exon-sized guardrails).
  This is an operational approximation of 3'UTR length constraints when the stop codon is unknown.

Behavior:
- Enumerate terminal-site candidates:
    splice acceptor anchor + PAS motif + cleavage window
- Score candidates (Gerp conservation features over [xi, xf) interval).
- Optionally collapse overlaps (keep best per overlap cluster).
- Return the TOP-K highest scoring sites (default K=10).

Strand rule (as requested):
- strand == -1 : negative strand
- otherwise    : positive strand

NO revcomp:
- We do not reverse-complement sequence or conservation arrays.
- For - strand, PAS motifs are searched as reverse-complements in the reference string.

Terminal logic:
+ strand:
  acceptor='AG' in reference sequence
  PAS motifs searched as-is
  cleavage window: [PAS_end + 10, PAS_end + 30]
  interval: [exon_anchor, cleavage)

- strand (no revcomp):
  acceptor='AC' per your convention
  PAS motifs searched as reverse complements (e.g. AATAAA -> TTTATT)
  cleavage window: [PAS_start - 30, PAS_start - 10] (upstream in reference)
  interval returned as genomic [min(anchor, cleavage), max(...)) with start<end
"""

from ion import works
import os
import pickle
from typing import List, Tuple, Optional, Dict, Union
import re
import numpy as np


# ----------------------------
# "Typical 3' UTR / terminal-region" length guardrails (NOT exon-sized)
# ----------------------------
# You can tune these. Defaults are intentionally broader than exon-sized constraints.
HUMAN_3UTR_MIN = 50
HUMAN_3UTR_MAX = 5000


# ----------------------------
# 3' terminal exon / polyA settings
# ----------------------------

# Canonical PAS and common variants in DNA alphabet
PAS_MOTIFS_PLUS = [
    "AATAAA", "ATTAAA", "TATAAA", "AGTAAA", "AAGAAA", "AATATA",
    "AATACA", "CATAAA", "GATAAA", "AATGAA", "AATAAT"
]

# Typical cleavage window relative to PAS (in nt)
# + strand: cleavage ~ 10-30 nt downstream of PAS end
PAS_CLEAVAGE_MIN_DOWNSTREAM = 10
PAS_CLEAVAGE_MAX_DOWNSTREAM = 30

# - strand (no revcomp): cleavage is ~ 10-30 nt downstream on RNA,
# which corresponds to 10-30 nt *upstream in reference* of PAS start.
PAS_CLEAVAGE_MIN_UPSTREAM = 30   # farthest upstream
PAS_CLEAVAGE_MAX_UPSTREAM = 10   # closest upstream


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
# Helpers (no revcomp scanning, but we need motif RC strings for - strand PAS search)
# ----------------------------

def revcomp_dna(s: str) -> str:
    table = str.maketrans("ACGTacgt", "TGCAtgca")
    return s.translate(table)[::-1]


def find_all_motif_positions(seq_u: str, motif_u: str) -> List[int]:
    return [m.start() for m in re.finditer(motif_u, seq_u)]


# ----------------------------
# Terminal-site candidate enumeration (acceptor + PAS + cleavage window)
# ----------------------------

def scan_cryptic_3utr_sites(
    seq: str,
    min_utr_len: int,
    max_utr_len: int,
    max_candidates: int,
    strand: int,
    acceptor: str,
    pas_motifs_plus: List[str],
    cleave_down_min: int = PAS_CLEAVAGE_MIN_DOWNSTREAM,
    cleave_down_max: int = PAS_CLEAVAGE_MAX_DOWNSTREAM,
    cleave_up_min: int = PAS_CLEAVAGE_MIN_UPSTREAM,
    cleave_up_max: int = PAS_CLEAVAGE_MAX_UPSTREAM,
) -> Tuple[List[Dict[str, object]], Dict[str, object]]:
    """
    Enumerate cryptic 3' UTR termination sites within a typical length range.

    Returns candidate dicts including:
      xi, xf (0-based half-open interval on reference window, start<end)
      cleavage_rel (0-based cut position in reference window coordinates)
      pas_start, pas_end, pas_motif
      anchor_rel (acceptor-derived exon anchor in reference window coordinates)
      terminal_len (abs(cleavage - anchor))

    NOTE: terminal_len is used as a proxy for "3' UTR / terminal-region length"
          because stop-codon position is not provided.
    """
    if min_utr_len < 1 or max_utr_len < min_utr_len:
        return [], {"acceptor": acceptor, "pas_motifs": [], "strand": strand}

    seq_u = seq.upper()
    L = len(seq_u)
    acceptor = acceptor.upper()

    # acceptor ends at exon anchor
    acc_pos = find_all_motif_positions(seq_u, acceptor)

    # PAS motifs to scan based on strand (no revcomp of sequence; just use RC motifs on -)
    if strand == -1:
        pas_motifs = [revcomp_dna(m).upper() for m in pas_motifs_plus]  # AATAAA -> TTTATT
        cleavage_mode = "upstream_of_pas_start"
    else:
        pas_motifs = [m.upper() for m in pas_motifs_plus]
        cleavage_mode = "downstream_of_pas_end"

    # Collect PAS hits: (pas_start, pas_end, motif)
    pas_hits: List[Tuple[int, int, str]] = []
    for m in pas_motifs:
        for p in find_all_motif_positions(seq_u, m):
            pas_hits.append((p, p + len(m), m))
    pas_hits.sort()

    if not acc_pos or not pas_hits:
        return [], {
            "acceptor": acceptor,
            "acceptor_pos": acc_pos,
            "pas_motifs": pas_motifs,
            "pas_hits_preview": pas_hits[:50],
            "strand": strand,
            "cleavage_mode": cleavage_mode,
        }

    out: List[Dict[str, object]] = []
    seen = set()

    for a in acc_pos:
        anchor = a + len(acceptor)  # exon anchor
        if anchor < 0 or anchor > L:
            continue

        for pas_s, pas_e, pas_m in pas_hits:
            # must have PAS "after" anchor in reference so that there is room for terminal region
            if pas_e <= anchor:
                continue

            if strand == -1:
                # cleavage positions in [pas_s - 30, pas_s - 10] (clamped)
                c0 = max(0, pas_s - cleave_up_min)
                c1 = min(L, pas_s - cleave_up_max)
                if c1 <= c0:
                    continue

                for c in range(c0, c1 + 1):
                    terminal_len = abs(c - anchor)
                    if terminal_len < min_utr_len or terminal_len > max_utr_len:
                        continue

                    s = min(anchor, c)
                    e = max(anchor, c)
                    if e <= s:
                        continue

                    key = (s, e, c, pas_s, pas_e, pas_m, anchor)
                    if key in seen:
                        continue
                    seen.add(key)

                    out.append({
                        "xi": int(s),
                        "xf": int(e),
                        "cleavage_rel": int(c),
                        "pas_start": int(pas_s),
                        "pas_end": int(pas_e),
                        "pas_motif": str(pas_m),
                        "anchor_rel": int(anchor),
                        "terminal_len": int(terminal_len),
                        "cleavage_mode": cleavage_mode,
                    })

                    if len(out) >= max_candidates:
                        return out, {
                            "acceptor": acceptor,
                            "acceptor_pos": acc_pos,
                            "pas_motifs": pas_motifs,
                            "strand": strand,
                            "cleavage_mode": cleavage_mode,
                            "note": "Minus-strand candidates returned as genomic intervals (start<end), no revcomp.",
                        }

            else:
                # + strand cleavage positions in [pas_e + 10, pas_e + 30] (clamped)
                c0 = pas_e + cleave_down_min
                c1 = min(L, pas_e + cleave_down_max)
                if c0 >= L:
                    continue

                for c in range(c0, c1 + 1):
                    terminal_len = c - anchor
                    if terminal_len < min_utr_len or terminal_len > max_utr_len:
                        continue
                    if c <= anchor:
                        continue

                    s = anchor
                    e = c
                    key = (s, e, c, pas_s, pas_e, pas_m, anchor)
                    if key in seen:
                        continue
                    seen.add(key)

                    out.append({
                        "xi": int(s),
                        "xf": int(e),
                        "cleavage_rel": int(c),
                        "pas_start": int(pas_s),
                        "pas_end": int(pas_e),
                        "pas_motif": str(pas_m),
                        "anchor_rel": int(anchor),
                        "terminal_len": int(terminal_len),
                        "cleavage_mode": cleavage_mode,
                    })

                    if len(out) >= max_candidates:
                        return out, {
                            "acceptor": acceptor,
                            "acceptor_pos": acc_pos,
                            "pas_motifs": pas_motifs,
                            "strand": strand,
                            "cleavage_mode": cleavage_mode,
                        }

    return out, {
        "acceptor": acceptor,
        "acceptor_pos": acc_pos,
        "pas_motifs": pas_motifs,
        "strand": strand,
        "cleavage_mode": cleavage_mode,
    }


# ----------------------------
# Scoring: score ALL, keep all (filtering handled later)
# ----------------------------

def score_candidates(
    model,
    cons: np.ndarray,
    candidates: List[Dict[str, object]],
) -> Tuple[List[Dict[str, object]], str]:
    X = []
    kept: List[Dict[str, object]] = []

    for c in candidates:
        s_rel = int(c["xi"])
        e_rel = int(c["xf"])
        feats = conservation_features(cons[s_rel:e_rel])
        if feats is None:
            continue
        X.append(feats)
        kept.append(c)

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

    out: List[Dict[str, object]] = []
    for c, sc in zip(kept, scores):
        c2 = dict(c)
        c2["score"] = float(sc)
        c2["length"] = int(int(c2["xf"]) - int(c2["xi"]))
        c2["score_type"] = score_type
        out.append(c2)

    return out, score_type


# ----------------------------
# Overlap collapse: keep ONLY best per overlap cluster
# ----------------------------

def collapse_overlaps_keep_best(results: List[Dict[str, object]]) -> List[Dict[str, object]]:
    """
    Cluster by overlap (half-open) on xi/xf, keep only the single best hit per cluster.

    Tie-breakers:
      1) higher score
      2) longer length
      3) earlier start (smaller xi)
      4) earlier end (smaller xf)
    """
    if not results:
        return []

    sorted_by_pos = sorted(results, key=lambda r: (int(r["xi"]), int(r["xf"])))

    clusters: List[List[Dict[str, object]]] = []
    cur: List[Dict[str, object]] = []
    cur_end: Optional[int] = None

    for r in sorted_by_pos:
        s = int(r["xi"])
        e = int(r["xf"])

        if not cur:
            cur = [r]
            cur_end = e
            continue

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

    bests: List[Dict[str, object]] = []
    for cl in clusters:
        best = sorted(
            cl,
            key=lambda r: (
                -float(r.get("score", 0.0)),
                -int(r.get("length", int(r["xf"]) - int(r["xi"]))),
                int(r["xi"]),
                int(r["xf"]),
            )
        )[0]
        bests.append(best)

    return sorted(bests, key=lambda r: (int(r["xi"]), int(r["xf"])))


def top_k_results(results: List[Dict[str, object]], k: int) -> List[Dict[str, object]]:
    return sorted(
        results,
        key=lambda r: (
            -float(r.get("score", 0.0)),
            -int(r.get("length", int(r["xf"]) - int(r["xi"]))),
            int(r["xi"]),
            int(r["xf"]),
        )
    )[: max(0, int(k))]


# ----------------------------
# Ion Works parameters
# ----------------------------

sequence = works.param(1)
chrom = works.param(2) or ""
startIndex = int(works.param(3)) if works.param(3) is not None else None
endIndex = int(works.param(4)) if works.param(4) is not None else None
strand = works.param(5)
strand = int(strand) if strand is not None else 1

# 3'UTR length constraints (defaults broad; NOT exon-sized)
min_utr_len = int(works.param(6)) if works.param(6) else HUMAN_3UTR_MIN
max_utr_len = int(works.param(7)) if works.param(7) else HUMAN_3UTR_MAX
    
max_candidates = int(works.param(8)) if works.param(8) else 5_000_000

# Optional threshold: filter after scoring (default None-like: keep all)
threshold = works.param(9)
threshold = float(threshold) if threshold is not None and str(threshold).strip() != "" else 0.9

# Top-K (default 10)
top_k = works.param(10)
top_k = int(top_k) if top_k is not None and str(top_k).strip() != "" else 10

# Whether to collapse overlaps before taking top-K (default True)
collapse = works.param(11)
collapse = (str(collapse).strip().lower() not in ("0", "false", "no", "")) if collapse is not None else True


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
# Candidate generation + scoring + ranking (cryptic 3'UTR sites; strand-aware; NO revcomp)
# ----------------------------

# strand == -1 => negative; else positive
# Per your convention (no revcomp scanning):
#   + uses acceptor AG
#   - uses acceptor AC
acceptor = "AC" if strand == -1 else "AG"

candidates, motifs = scan_cryptic_3utr_sites(
    seq=sequence,
    min_utr_len=min_utr_len,
    max_utr_len=max_utr_len,
    max_candidates=max_candidates,
    strand=strand,
    acceptor=acceptor,
    pas_motifs_plus=PAS_MOTIFS_PLUS,
)

motifs["strand_rule"] = "strand == -1 => negative else positive"
motifs["motif_logic"] = "cryptic 3'UTR sites: acceptor anchor + PAS(+cleavage window); no donor; no revcomp"
motifs["pas_plus"] = PAS_MOTIFS_PLUS
motifs["pas_cleavage_plus"] = [PAS_CLEAVAGE_MIN_DOWNSTREAM, PAS_CLEAVAGE_MAX_DOWNSTREAM]
motifs["pas_cleavage_minus_ref_upstream"] = [PAS_CLEAVAGE_MIN_UPSTREAM, PAS_CLEAVAGE_MAX_UPSTREAM]
motifs["utr_len_guardrails"] = [int(min_utr_len), int(max_utr_len)]
motifs["top_k"] = int(top_k)
motifs["collapse_overlaps"] = bool(collapse)

scored, score_type = score_candidates(
    model=model,
    cons=cons_ref,
    candidates=candidates,
)

# Optional threshold filtering
if threshold is not None:
    scored = [r for r in scored if float(r.get("score", -1.0)) >= float(threshold)]

# Optionally collapse overlaps to avoid redundant nearby calls
if collapse:
    scored = collapse_overlaps_keep_best(scored)

# Take top-K
ranked = top_k_results(scored, top_k)

# Add absolute coordinates + metadata
for r in ranked:
    r["chrom"] = chrom
    r["start_abs"] = int(startIndex + int(r["xi"]))
    r["end_abs"] = int(startIndex + int(r["xf"]))
    r["cleavage_abs"] = int(startIndex + int(r["cleavage_rel"]))
    r["anchor_abs"] = int(startIndex + int(r["anchor_rel"]))
    r["motifs"] = motifs
    r["strand"] = strand


works.resolve({
    "results": ranked,
    "meta": {
        "chrom": chrom,
        "start": int(startIndex),
        "end": int(endIndex),
        "strand": strand,
        "window_len": window_len,
        "n_candidates_generated": len(candidates),
        "n_scored": len(scored),
        "n_returned": len(ranked),
        "min_utr_len": int(min_utr_len),
        "max_utr_len": int(max_utr_len),
        "threshold": threshold,
        "top_k": int(top_k),
        "collapse_overlaps": bool(collapse),
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
            "Returns TOP-K cryptic 3'UTR polyA/cleavage sites within a typical length range. "
            "Length constraint is applied to abs(cleavage-anchor) as a proxy for terminal-region / 3'UTR length "
            "when the stop codon is not provided."
        ),
    }
})
