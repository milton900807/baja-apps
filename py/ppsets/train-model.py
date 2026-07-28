#!/usr/bin/env python3
"""
Train a predictive model using primer-only features PLUS genomic context features
(amplicon +/- PAD bp window fetched from NCBI and cached locally).

Inputs:
- Excel with columns: forward_sequence, reverse_sequence, forward, reverse, gene_id, pass, ct, id
- Cache directory with manifest.json created by `fetch_genomic_context_ncbi.py`

Label:
- GOOD if pass == "Pass" and 18 <= Ct <= 25

Features:
- Primer features (forward & reverse): len, %GC, %AT, Wallace Tm, ΔTm, GC clamp, max homopolymer,
  3' GC (last 5), hairpin/dimer proxies (k-mer RC matches), amplicon length, in-70–200 flag,
  distance to 135bp, Tm last10, GC window variance (w=5)
- Genomic context features (from cached FASTA of amplicon +/- PAD):
  length, %GC, AT%, CpG per kb, Shannon entropy, max homopolymer in window,
  dinucleotide frequencies (16 features, normalized)

Evaluation:
- 5-fold GroupKFold by `id` (transcript) with probability calibration (sigmoid)
- Threshold tuned on out-of-fold predictions to maximize F1
- Report PR-AUC and ROC-AUC

Usage:
  python train_primer_probe_model_v3.py \
    --excel ppsets2.xlsx \
    --sheet Sheet1 \
    --cache_dir ncbi_cache \
    --model_out primer_probe_model_v3.pkl \
    --report_out training_report_v3.json \
    --n_estimators 300 \
    --pad 130

Note:
- This script reads genomic context from cache manifest; it does NOT fetch from NCBI.
  Run `fetch_genomic_context_ncbi.py` first to populate the cache.
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import (
    precision_recall_curve,
    average_precision_score,
    roc_auc_score,
    confusion_matrix,
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.utils.class_weight import compute_class_weight

# ----------------- Helpers -----------------

def make_calibrated(base, method="sigmoid", cv=3):
    try:
        return CalibratedClassifierCV(estimator=base, method=method, cv=cv)
    except TypeError:
        return CalibratedClassifierCV(base_estimator=base, method=method, cv=cv)

def wallace_tm(seq: str) -> float:
    s = str(seq).upper().replace("X", "")
    return 2.0 * (s.count("A") + s.count("T")) + 4.0 * (s.count("G") + s.count("C"))

def gc_clamp(seq: str) -> int:
    s = str(seq).upper().replace("X", "")
    return 1 if len(s) and s[-1] in ("G", "C") else 0

def max_homopolymer(seq: str) -> int:
    s = str(seq).upper().replace("X", "")
    if not s:
        return 0
    best, run, prev = 1, 1, s[0]
    for c in s[1:]:
        if c == prev:
            run += 1
        else:
            run = 1
            prev = c
        if run > best:
            best = run
    return best

def three_prime_gc_count(seq: str, k: int = 5) -> int:
    s = str(seq).upper().replace("X", "")
    tail = s[-k:] if len(s) >= k else s
    return tail.count("G") + tail.count("C")

def revcomp(seq: str) -> str:
    s = str(seq)
    tbl = str.maketrans("ATGCatgc", "TACGtacg")
    return s.translate(tbl)[::-1]

def short_match_score(a: str, b: str, k: int = 4) -> int:
    au = str(a).upper().replace("X", "")
    bu = str(b).upper().replace("X", "")
    rc_b = revcomp(bu).upper()
    aset = {au[i:i+k] for i in range(0, max(0, len(au) - k + 1))}
    bset = {rc_b[i:i+k] for i in range(0, max(0, len(rc_b) - k + 1))}
    aset = {x for x in aset if set(x) <= set("ATGC") and len(x) == k}
    bset = {x for x in bset if set(x) <= set("ATGC") and len(x) == k}
    return len(aset & bset)

def tm_last_k(seq, k=10):
    s = str(seq).upper().replace("X","")
    tail = s[-k:] if len(s)>=k else s
    return 2*(tail.count("A")+tail.count("T")) + 4*(tail.count("G")+tail.count("C"))

def gc_window_var(seq, w=5):
    s = str(seq).upper().replace("X","")
    if len(s) < w:
        return 0.0
    vals = []
    for i in range(len(s)-w+1):
        win = s[i:i+w]
        vals.append( (win.count("G")+win.count("C"))/w )
    return float(np.var(vals))

# ---- Genomic context features ----

def shannon_entropy(seq: str) -> float:
    s = str(seq).upper()
    n = len(s)
    if n == 0:
        return 0.0
    from collections import Counter
    counts = Counter([c for c in s if c in "ATGC"])
    total = sum(counts.values())
    if total == 0:
        return 0.0
    ent = 0.0
    for c in "ATGC":
        p = counts.get(c, 0) / total
        if p > 0:
            ent -= p * math.log2(p)
    # normalize to [0,2] theoretically; return raw bits
    return ent

def dinuc_freqs(seq: str) -> Dict[str, float]:
    s = str(seq).upper()
    valid = set("ATGC")
    counts = {a+b: 0 for a in "ATGC" for b in "ATGC"}
    total = 0
    for i in range(len(s)-1):
        d = s[i:i+2]
        if set(d) <= valid:
            counts[d] += 1
            total += 1
    if total == 0:
        return {k: 0.0 for k in counts}
    return {k: counts[k]/total for k in counts}

def cpg_per_kb(seq: str) -> float:
    s = str(seq).upper()
    n = len(s)
    if n < 2:
        return 0.0
    cpg = 0
    for i in range(len(s)-1):
        if s[i:i+2] == "CG":
            cpg += 1
    return 1000.0 * cpg / n

def load_manifest(cache_dir: Path) -> Dict:
    path = cache_dir / "manifest.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

def read_fasta_text(path: Path) -> str:
    txt = path.read_text(encoding="utf-8")
    lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
    if not lines:
        return ""
    # drop header '>' line(s)
    seq = "".join(ln for ln in lines if not ln.startswith(">"))
    return seq

def context_features_from_manifest_row(mrow: Dict) -> Dict[str, float]:
    """Compute features from cached FASTA given a manifest entry for a row."""
    fasta_path = mrow.get("fasta_path")
    if not fasta_path or not Path(fasta_path).exists():
        return None
    seq = read_fasta_text(Path(fasta_path))
    if not seq:
        return None

    feats = {}
    L = float(len(seq))
    g = seq.count("G"); c = seq.count("C"); a = seq.count("A"); t = seq.count("T")
    gc = (g + c)/L if L>0 else 0.0
    at = (a + t)/L if L>0 else 0.0
    feats["ctx_len"] = L
    feats["ctx_gc"] = gc
    feats["ctx_at"] = at
    feats["ctx_entropy"] = shannon_entropy(seq)
    feats["ctx_max_run"] = max_homopolymer(seq)
    feats["ctx_cpg_per_kb"] = cpg_per_kb(seq)
    # add 16 dinuc freqs
    for k, v in dinuc_freqs(seq).items():
        feats[f"ctx_di_{k}"] = v
    return feats

# ----------------- Build labels + features -----------------

def build_labels(df: pd.DataFrame) -> np.ndarray:
    passed = df["pass"].astype(str).str.strip().str.lower() == "pass"
    ct = pd.to_numeric(df["ct"], errors="coerce")
    good = (passed) & (ct >= 18) & (ct <= 25)
    return good.fillna(False).astype(int).to_numpy()

def make_feature_row(fwd: str, rev: str, amp_len: float) -> Dict[str, float]:
    def base_features(seq: str) -> Dict[str, float]:
        s = str(seq).upper().replace("X", "")
        L = float(len(s))
        if L == 0:
            return {"len": 0.0, "gc": 0.0, "at": 0.0, "tm": 0.0}
        g = s.count("G"); c = s.count("C"); a = s.count("A"); t = s.count("T")
        return {"len": L, "gc": (g + c) / L, "at": (a + t) / L, "tm": wallace_tm(s)}

    f = base_features(fwd); r = base_features(rev)
    tm_f, tm_r = f["tm"], r["tm"]
    row = {
        "fwd_len": f["len"], "fwd_gc": f["gc"], "fwd_at": f["at"], "fwd_tm": tm_f,
        "rev_len": r["len"], "rev_gc": r["gc"], "rev_at": r["at"], "rev_tm": tm_r,
        "delta_tm": abs(tm_f - tm_r),
        "fwd_gc_clamp": gc_clamp(fwd),
        "rev_gc_clamp": gc_clamp(rev),
        "fwd_max_run": max_homopolymer(fwd),
        "rev_max_run": max_homopolymer(rev),
        "fwd_3p_gc5": three_prime_gc_count(fwd, 5),
        "rev_3p_gc5": three_prime_gc_count(rev, 5),
        "heterodimer_k4": short_match_score(fwd, rev, k=4),
        "hairpin_fwd_k4": short_match_score(fwd, fwd, k=4),
        "hairpin_rev_k4": short_match_score(rev, rev, k=4),
        "amp_len": float(amp_len),
        "amp_in_70_200": 1.0 if 70 <= amp_len <= 200 else 0.0,
        "amp_dist_to_mid135": abs(float(amp_len) - 135.0),
        "fwd_tm_last10": tm_last_k(fwd, 10),
        "rev_tm_last10": tm_last_k(rev, 10),
        "fwd_gc_win_var5": gc_window_var(fwd, 5),
        "rev_gc_win_var5": gc_window_var(rev, 5),
    }
    return row

def build_features_with_context(df: pd.DataFrame, cache_dir: Path, pad: int) -> Tuple[np.ndarray, List[str]]:
    fwd_seq = df.get("forward_sequence", pd.Series([""] * len(df)))
    rev_seq = df.get("reverse_sequence", pd.Series([""] * len(df)))
    fwd_pos = pd.to_numeric(df.get("forward", pd.Series([np.nan] * len(df))), errors="coerce")
    rev_pos = pd.to_numeric(df.get("reverse", pd.Series([np.nan] * len(df))), errors="coerce")
    amp_len = (rev_pos - fwd_pos).abs().fillna(0)

    # Load cache manifest
    manifest = load_manifest(cache_dir)

    rows = []
    missing_ctx = 0

    for i, (fwd, rev, alen, gid, fpos, rpos) in enumerate(zip(
            fwd_seq, rev_seq, amp_len, df.get("gene_id", pd.Series([""]*len(df))), fwd_pos, rev_pos)):

        base = make_feature_row(fwd, rev, alen)

        # find cached region: key pattern "*gene_id:acc:start-stop:strand*"
        ctx_feats = None
        # We also stored an entry 'gene:<gene_id>' with genomicinfo; but region entries include exact window.
        # The window expected is [min(fwd,rev)-pad , max(fwd,rev)+pad] with given strand acc.
        if pd.notna(gid) and pd.notna(fpos) and pd.notna(rpos):
            amp_start = int(min(fpos, rpos))
            amp_end = int(max(fpos, rpos))
            seq_start = max(1, amp_start - pad)
            seq_stop = amp_end + pad

            # search manifest for a region with same gene_id and seq range (any accession/strand)
            for k, v in manifest.items():
                if not isinstance(v, dict): 
                    continue
                if str(v.get("gene_id", "")).strip() != str(gid).strip():
                    continue
                if int(v.get("seq_start", -1)) == seq_start and int(v.get("seq_stop", -1)) == seq_stop:
                    ctx_feats = context_features_from_manifest_row(v)
                    if ctx_feats: break

        if ctx_feats is None:
            missing_ctx += 1
            # fill zeros to keep row usable
            ctx_feats = {
                "ctx_len": 0.0, "ctx_gc": 0.0, "ctx_at": 0.0,
                "ctx_entropy": 0.0, "ctx_max_run": 0.0, "ctx_cpg_per_kb": 0.0
            }
            for a in "ATGC":
                for b in "ATGC":
                    ctx_feats[f"ctx_di_{a+b}"] = 0.0

        base.update(ctx_feats)
        rows.append(base)

    if missing_ctx:
        print(f"NOTE: Missing genomic context for {missing_ctx} rows (filled with zeros). "
              f"Ensure cache matches pad={pad} and run fetch script first.", file=sys.stderr)

    X_df = pd.DataFrame(rows)
    feature_names = list(X_df.columns)
    return X_df.to_numpy(dtype=float), feature_names

# ----------------- Train / Eval -----------------

def evaluate_group_kfold(X, y, groups, n_estimators: int, random_state: int) -> Dict:
    gkf = GroupKFold(n_splits=5)
    y_all = []
    p_all = []
    for tr, te in gkf.split(X, y, groups):
        classes = np.unique(y[tr])
        weights = compute_class_weight(class_weight="balanced", classes=classes, y=y[tr])
        class_weight = {int(c): float(w) for c, w in zip(classes, weights)}

        base = RandomForestClassifier(
            n_estimators=n_estimators, random_state=random_state,
            class_weight=class_weight, n_jobs=-1
        )
        clf = make_calibrated(base, method="sigmoid", cv=3)
        clf.fit(X[tr], y[tr])
        prob = clf.predict_proba(X[te])[:, 1]
        y_all.append(y[te]); p_all.append(prob)

    y_all = np.concatenate(y_all)
    p_all = np.concatenate(p_all)
    pr_auc = average_precision_score(y_all, p_all)
    roc = roc_auc_score(y_all, p_all)

    prec, rec, thr = precision_recall_curve(y_all, p_all)
    f1 = 2 * prec * rec / (prec + rec + 1e-9)
    best_idx = int(np.nanargmax(f1))
    best_thr = float(thr[max(0, best_idx - 1)]) if len(thr) else 0.5

    return {
        "pr_auc": float(pr_auc),
        "roc_auc": float(roc),
        "best_threshold": best_thr,
    }

def train_final_model(X, y, n_estimators: int, random_state: int):
    classes = np.unique(y)
    weights = compute_class_weight(class_weight="balanced", classes=classes, y=y)
    class_weight = {int(c): float(w) for c, w in zip(classes, weights)}

    base = RandomForestClassifier(
        n_estimators=n_estimators, random_state=random_state,
        class_weight=class_weight, n_jobs=-1
    )
    clf = make_calibrated(base, method="sigmoid", cv=3)
    clf.fit(X, y)
    return clf

# ----------------- Main -----------------

def main():
    ap = argparse.ArgumentParser(description="Train primer model with genomic context features (v3).")
    ap.add_argument("--excel", required=True)
    ap.add_argument("--sheet", default="Sheet1")
    ap.add_argument("--cache_dir", required=True, help="Directory containing manifest.json and cached FASTAs")
    ap.add_argument("--pad", type=int, default=130, help="Padding used when caching sequences")
    ap.add_argument("--model_out", default="primer_probe_model_v3.pkl")
    ap.add_argument("--report_out", default="training_report_v3.json")
    ap.add_argument("--n_estimators", type=int, default=300)
    ap.add_argument("--random_state", type=int, default=42)
    args = ap.parse_args()

    cache_dir = Path(args.cache_dir)
    if not (cache_dir / "manifest.json").exists():
        print("ERROR: manifest.json not found in cache_dir. Run fetch_genomic_context_ncbi.py first.", file=sys.stderr)
        sys.exit(1)

    try:
        df = pd.read_excel(args.excel, sheet_name=args.sheet)
    except Exception as e:
        print("ERROR reading Excel:", e, file=sys.stderr)
        sys.exit(1)

    y = build_labels(df)
    X, feature_names = build_features_with_context(df, cache_dir, args.pad)
    groups = df.get("id", pd.Series([""] * len(df))).astype(str)

    eval_metrics = evaluate_group_kfold(X, y, groups, args.n_estimators, args.random_state)
    best_thr = eval_metrics["best_threshold"]

    final_model = train_final_model(X, y, args.n_estimators, args.random_state)

    bundle = {
        "model": final_model,
        "threshold": best_thr,
        "feature_names": feature_names,
        "label_rule": "GOOD if pass=='Pass' and 18<=ct<=25",
        "feature_version": "v3_with_genomic_context",
        "pad": args.pad,
    }

    joblib.dump(bundle, args.model_out, compress=3)
    with open(args.report_out, "w", encoding="utf-8") as f:
        json.dump({"metrics": eval_metrics, "feature_names": feature_names}, f, indent=2)

    print("=== v3 Training complete ===")
    print("PR-AUC:", eval_metrics["pr_auc"])
    print("ROC-AUC:", eval_metrics["roc_auc"])
    print("Best threshold:", best_thr)
    print("Saved model:", args.model_out)
    print("Saved report:", args.report_out)

if __name__ == "__main__":
    main()
