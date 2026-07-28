"""
n Structure ML Tool
----------------------
Given a transcript table (TSV) where each row is a transcript and columns are:
  - transcript_id
  - strand            ('+' or '-')
  - is_protein_coding ('yes'/'no' or 1/0)
  - exon_count        (int)
  - exon_1..exon_N    (exon sequences in transcript 5'->3' order; RC already applied for '-' strand)

This tool extracts biologically motivated features and trains a model to classify
protein-coding vs non-coding transcripts. It also supports featurization-only and prediction.

Usage examples
--------------
1) Featurize only:
   python exon_coding_predictor.py featurize \
       --in humans.tsv --out features.csv

2) Train (with 5-fold CV) and save model:
   python exon_coding_predictor.py train \
       --in humans.tsv --model model.joblib --features-out features.csv

3) Predict on new data with a saved model:
   python exon_coding_predictor.py predict \
       --in humans.tsv --model model.joblib --out preds.csv

Dependencies: pandas, numpy, scikit-learn, joblib, tqdm

Memory note: use --max-kmer 2 or 3 and fewer CV splits if you run into RAM limits.
"""

import argparse
import math
import statistics
from collections import Counter
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import numpy as np
import pandas as pd
from joblib import dump, load
from tqdm import tqdm

from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, average_precision_score
from sklearn.ensemble import HistGradientBoostingClassifier

# ---------------------------
# Global config (tunable via CLI)
# ---------------------------

MAX_KMER = 3  # default upper bound for k-mer size (1..MAX_KMER)

# ---------------------------
# Sequence utility functions
# ---------------------------

NUCS = set("ACGTN")
STOPS = {"TAA", "TAG", "TGA"}


def clean_seq(s: str) -> str:
    if not isinstance(s, str):
        return ""
    s = s.upper().replace("U", "T").replace(" ", "")
    # Keep only IUPAC core; map others to N
    return "".join(c if c in NUCS else "N" for c in s)


def gc_frac(s: str) -> float:
    s = clean_seq(s)
    if not s:
        return 0.0
    gc = s.count("G") + s.count("C")
    return gc / len(s)


def kmer_freqs(s: str, k: int) -> Dict[str, float]:
    s = clean_seq(s)
    n = len(s)
    if n < k:
        return {}
    counts: Dict[str, int] = {}
    valid = 0
    for i in range(n - k + 1):
        kmer = s[i : i + k]
        if "N" in kmer:
            continue
        counts[kmer] = counts.get(kmer, 0) + 1
        valid += 1
    if valid == 0:
        return {}
    return {k: v / valid for k, v in counts.items()}


def longest_orf_len(seq: str) -> int:
    """Longest ORF (ATG..STOP) in any reading frame on the *given* strand.
    Returns length in nt, including start and stop codons.
    """
    s = clean_seq(seq)
    n = len(s)
    best = 0
    for frame in range(3):
        i = frame
        while i + 3 <= n:
            # find ATG
            if s[i:i+3] != "ATG":
                i += 3
                continue
            # found a start; scan to next stop
            j = i + 3
            while j + 3 <= n:
                cod = s[j:j+3]
                if cod in STOPS:
                    best = max(best, j + 3 - i)
                    break
                j += 3
            i = j + 3  # continue after the (possible) stop
    return best


def longest_open_run_no_stop(seq: str) -> int:
    """Longest run (in multiples of 3) without an in-frame stop, per frame, max over frames."""
    s = clean_seq(seq)
    n = len(s)
    best = 0
    for frame in range(3):
        run = 0
        i = frame
        while i + 3 <= n:
            cod = s[i:i+3]
            if "N" in cod:
                # reset on ambiguity
                best = max(best, run)
                run = 0
            elif cod in STOPS:
                best = max(best, run)
                run = 0
            else:
                run += 3
            i += 3
        best = max(best, run)
    return best


def frame_gc(seq: str) -> Tuple[float, float, float]:
    """GC fraction in positions 0,1,2 of codons across the sequence."""
    s = clean_seq(seq)
    if len(s) < 3:
        return (0.0, 0.0, 0.0)
    frame_counts = [(0, 0), (0, 0), (0, 0)]  # (gc, total)
    for i, base in enumerate(s):
        f = i % 3
        gc, tot = frame_counts[f]
        if base in ("G", "C"):
            gc += 1
        tot += 1
        frame_counts[f] = (gc, tot)
    vals = []
    for gc, tot in frame_counts:
        vals.append((gc / tot) if tot else 0.0)
    return tuple(vals)  # type: ignore


def polyA_signal_counts(seq: str) -> int:
    """Count canonical polyA signals near 3' end (AATAAA, ATTAAA) in last 200 nt."""
    s = clean_seq(seq)
    tail = s[-200:] if len(s) > 200 else s
    motifs = ("AATAAA", "ATTAAA")
    c = 0
    for m in motifs:
        start = 0
        while True:
            idx = tail.find(m, start)
            if idx == -1:
                break
            c += 1
            start = idx + 1
    return c

# ---------------------------
# Feature extraction per transcript
# ---------------------------

EXON_COL_PREFIX = "exon_"


def transcript_features(row: pd.Series) -> Dict[str, float]:
    # Collect exon seqs
    exon_cols = [c for c in row.index if c.startswith(EXON_COL_PREFIX)]
    exons: List[str] = [row[c] for c in exon_cols if isinstance(row[c], str) and len(row[c]) > 0]

    # Concatenate cDNA in transcript order
    cdna = clean_seq("".join(exons))

    # Basic stats
    ex_lengths = [len(clean_seq(s)) for s in exons]
    exon_count = len(ex_lengths)

    feats: Dict[str, float] = {}
    feats["exon_count"] = exon_count
    feats["cdna_len"] = len(cdna)
    feats["gc_overall"] = gc_frac(cdna)

    # Exon length distribution
    if exon_count:
        feats["ex_len_mean"] = float(np.mean(ex_lengths))
        feats["ex_len_std"] = float(np.std(ex_lengths))
        feats["ex_len_min"] = float(np.min(ex_lengths))
        feats["ex_len_max"] = float(np.max(ex_lengths))
        feats["first_ex_len"] = float(ex_lengths[0])
        feats["last_ex_len"] = float(ex_lengths[-1])
        if exon_count > 2:
            internal = ex_lengths[1:-1]
            feats["internal_ex_len_mean"] = float(np.mean(internal))
            feats["internal_ex_count"] = float(len(internal))
        else:
            feats["internal_ex_len_mean"] = 0.0
            feats["internal_ex_count"] = 0.0
    else:
        for k in ("ex_len_mean", "ex_len_std", "ex_len_min", "ex_len_max", "first_ex_len", "last_ex_len", "internal_ex_len_mean", "internal_ex_count"):
            feats[k] = 0.0

    # Frame GC periodicity
    f0, f1, f2 = frame_gc(cdna)
    feats["gc_frame0"] = f0
    feats["gc_frame1"] = f1
    feats["gc_frame2"] = f2
    feats["gc_frame_amp"] = max(f0, f1, f2) - min(f0, f1, f2)

    # ORF-based features
    lorfa = longest_orf_len(cdna)
    lrun = longest_open_run_no_stop(cdna)
    feats["longest_orf_len"] = float(lorfa)
    feats["longest_orf_cov"] = (lorfa / len(cdna)) if len(cdna) else 0.0
    feats["longest_run_no_stop"] = float(lrun)
    feats["longest_run_cov"] = (lrun / len(cdna)) if len(cdna) else 0.0

    # k-mer features up to MAX_KMER (default 1–3). Larger k explodes RAM.
    for k in range(1, MAX_KMER + 1):
        freqs = kmer_freqs(cdna, k)
        alph = ["A", "C", "G", "T"]
        kmers: List[str] = []
        def build(prefix: str, depth: int):
            if depth == 0:
                kmers.append(prefix)
                return
            for ch in alph:
                build(prefix + ch, depth - 1)
        build("", k)
        for m in kmers:
            feats[f"k{k}_{m}"] = freqs.get(m, 0.0)

    # PolyA signal counts near 3' end
    feats["polyA_signal_tail_count"] = float(polyA_signal_counts(cdna))

    # Strand as a binary flag (may be weakly informative)
    strand = str(row.get("strand", "+"))
    feats["strand_plus"] = 1.0 if strand == "+" else 0.0

    return feats


def featurize_table(tsv_path: Path) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    df = pd.read_csv(tsv_path, sep="\t")

    # Determine exon columns if not labeled
    exon_cols = [c for c in df.columns if c.startswith(EXON_COL_PREFIX)]
    if not exon_cols:
        # Fallback: assume columns after the first four are exons
        exon_cols = list(df.columns[4:])

    # Label
    y_raw = df["is_protein_coding"].astype(str).str.lower().map({"yes": 1, "no": 0})
    if y_raw.isna().any():
        # If not yes/no, try 1/0
        y_raw = pd.to_numeric(df["is_protein_coding"], errors="coerce")
    y = y_raw.fillna(0).astype(int)

    # Build features
    feats_list: List[Dict[str, float]] = []
    for _, row in tqdm(df.iterrows(), total=len(df), desc="Featurizing"):
        feats = transcript_features(row)
        feats_list.append(feats)

    X = pd.DataFrame(feats_list, dtype=np.float32)
    # Keep an ID column for bookkeeping
    X.insert(0, "transcript_id", df["transcript_id"].values)

    # Replace inf/nan
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0.0)

    feature_cols = [c for c in X.columns if c != "transcript_id"]
    return X, y, feature_cols


# ---------------------------
# Training / Evaluation
# ---------------------------


def train_model(tsv_path: Path, model_out: Path, features_out: Path = None, n_splits: int = 5, random_state: int = 42):
    X, y, feature_cols = featurize_table(tsv_path)

    # Save features if requested
    if features_out is not None:
        X_out = X.copy()
        X_out.insert(1, "label", y.values)
        X_out.to_csv(features_out, index=False)

    # Prepare model and CV
    clf = HistGradientBoostingClassifier(random_state=random_state)
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state)

    oof_pred = np.zeros(len(X))
    fold = 1
    for tr_idx, va_idx in skf.split(X, y):
        Xtr = X.iloc[tr_idx][feature_cols].values
        Xva = X.iloc[va_idx][feature_cols].values
        ytr = y.iloc[tr_idx].values
        yva = y.iloc[va_idx].values

        clf_fold = HistGradientBoostingClassifier(random_state=random_state, max_depth=6, max_iter=200, learning_rate=0.05)
        clf_fold.fit(Xtr, ytr)
        proba = clf_fold.predict_proba(Xva)[:, 1]
        oof_pred[va_idx] = proba

        acc = accuracy_score(yva, (proba >= 0.5).astype(int))
        f1 = f1_score(yva, (proba >= 0.5).astype(int))
        auc = roc_auc_score(yva, proba)
        ap = average_precision_score(yva, proba)
        print(f"[fold {fold}] ACC={acc:.3f} F1={f1:.3f} ROC-AUC={auc:.3f} AP={ap:.3f}")
        fold += 1

    # Final fit on all data
    final_clf = HistGradientBoostingClassifier(random_state=random_state, max_depth=6, max_iter=200, learning_rate=0.05)
    final_clf.fit(X[feature_cols].values, y.values)

    # Save model and feature column order
    artifact = {
        "model": final_clf,
        "feature_cols": feature_cols,
        "id_col": "transcript_id",
    }
    dump(artifact, model_out)
    print(f"[saved] model -> {model_out}")

    # Overall OOF metrics
    overall_acc = accuracy_score(y, (oof_pred >= 0.5).astype(int))
    overall_f1 = f1_score(y, (oof_pred >= 0.5).astype(int))
    overall_auc = roc_auc_score(y, oof_pred)
    overall_ap = average_precision_score(y, oof_pred)
    print(f"[oof] ACC={overall_acc:.3f} F1={overall_f1:.3f} ROC-AUC={overall_auc:.3f} AP={overall_ap:.3f}")


def predict(tsv_path: Path, model_path: Path, out_csv: Path):
    artifact = load(model_path)
    model: HistGradientBoostingClassifier = artifact["model"]
    feature_cols: List[str] = artifact["feature_cols"]
    id_col: str = artifact["id_col"]

    # We need to re-featurize inputs (ignore labels if present)
    X, y_dummy, feature_cols_built = featurize_table(tsv_path)

    # Align columns in the same order as training
    for col in feature_cols:
        if col not in X.columns:
            X[col] = 0.0
    X = X[[id_col] + feature_cols]

    proba = model.predict_proba(X[feature_cols].values)[:, 1]
    pred = (proba >= 0.5).astype(int)

    out = pd.DataFrame({
        id_col: X[id_col].values,
        "prob_protein_coding": proba,
        "predicted_label": pred,
    })
    out.to_csv(out_csv, index=False)
    print(f"[saved] predictions -> {out_csv}")


def featurize_only(tsv_path: Path, out_csv: Path):
    X, y, feature_cols = featurize_table(tsv_path)
    X.insert(1, "label", y.values)
    X.to_csv(out_csv, index=False)
    print(f"[saved] features -> {out_csv}")


# ---------------------------
# CLI
# ---------------------------


def build_argparser():
    p = argparse.ArgumentParser(description="Exon structure ML tool for coding vs noncoding transcripts")
    sub = p.add_subparsers(dest="cmd", required=True)

    # train
    p_train = sub.add_parser("train", help="Featurize, 5-fold CV, train final model, save joblib")
    p_train.add_argument("--in", dest="inp", required=True, help="Input transcript table TSV")
    p_train.add_argument("--model", dest="model", required=True, help="Output model .joblib path")
    p_train.add_argument("--features-out", dest="fout", default=None, help="Optional: save features CSV")
    p_train.add_argument("--splits", type=int, default=5, help="CV folds (default 5)")
    p_train.add_argument("--seed", type=int, default=42, help="Random seed")
    p_train.add_argument("--max-kmer", type=int, default=3, help="Max k-mer size to include (1..K). Use 2 or 3 to reduce RAM.")

    # predict
    p_pred = sub.add_parser("predict", help="Predict protein-coding probability on new data")
    p_pred.add_argument("--in", dest="inp", required=True, help="Input transcript table TSV")
    p_pred.add_argument("--model", dest="model", required=True, help="Model .joblib path")
    p_pred.add_argument("--out", dest="out", required=True, help="Output predictions CSV")
    p_pred.add_argument("--max-kmer", type=int, default=3, help="Must match the value used in training if k-mer features differ.")

    # featurize
    p_feat = sub.add_parser("featurize", help="Featurize only; save features CSV (with label if present)")
    p_feat.add_argument("--in", dest="inp", required=True, help="Input transcript table TSV")
    p_feat.add_argument("--out", dest="out", required=True, help="Output features CSV")
    p_feat.add_argument("--max-kmer", type=int, default=3, help="Max k-mer size to include (1..K).")

    return p


def main():
    global MAX_KMER
    ap = build_argparser()
    args = ap.parse_args()

    # set MAX_KMER from CLI
    if hasattr(args, 'max_kmer') and args.max_kmer:
        MAX_KMER = int(args.max_kmer)
        if MAX_KMER < 1:
            MAX_KMER = 1

    cmd = args.cmd
    if cmd == "train":
        train_model(Path(args.inp), Path(args.model), Path(args.fout) if args.fout else None, n_splits=args.splits, random_state=args.seed)
    elif cmd == "predict":
        predict(Path(args.inp), Path(args.model), Path(args.out))
    elif cmd == "featurize":
        featurize_only(Path(args.inp), Path(args.out))
    else:
        raise SystemExit(f"Unknown cmd: {cmd}")
        train_model(Path(args.inp), Path(args.model), Path(args.fout) if args.fout else None, n_splits=args.splits, random_state=args.seed)


if __name__ == "__main__":
    main()

