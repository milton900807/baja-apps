import argparse
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from tqdm import tqdm
from joblib import dump, load

from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, average_precision_score
from sklearn.ensemble import HistGradientBoostingClassifier

# --------------------------
# Globals
# --------------------------
MAX_KMER = 3
NUCS = set("ACGTN")
STOPS = {"TAA", "TAG", "TGA"}


# --------------------------
# Utils
# --------------------------
def clean_seq(s: str) -> str:
    if not isinstance(s, str):
        return ""
    s = s.upper().replace("U", "T").replace(" ", "")
    return "".join(c if c in NUCS else "N" for c in s)


def gc_frac(s: str) -> float:
    s = clean_seq(s)
    if not s:
        return 0.0
    return (s.count("G") + s.count("C")) / len(s)


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
    s = clean_seq(seq)
    n = len(s)
    best = 0
    for frame in range(3):
        i = frame
        while i + 3 <= n:
            if s[i : i + 3] != "ATG":
                i += 3
                continue
            j = i + 3
            while j + 3 <= n:
                cod = s[j : j + 3]
                if cod in STOPS:
                    best = max(best, j + 3 - i)
                    break
                j += 3
            i = j + 3
    return best


def longest_open_run_no_stop(seq: str) -> int:
    s = clean_seq(seq)
    n = len(s)
    best = 0
    for frame in range(3):
        run = 0
        i = frame
        while i + 3 <= n:
            cod = s[i : i + 3]
            if "N" in cod or cod in STOPS:
                best = max(best, run)
                run = 0
            else:
                run += 3
            i += 3
        best = max(best, run)
    return best


def frame_gc(seq: str) -> Tuple[float, float, float]:
    s = clean_seq(seq)
    if len(s) < 3:
        return (0.0, 0.0, 0.0)
    frame_counts = [(0, 0), (0, 0), (0, 0)]
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
    return tuple(vals)


def polyA_signal_counts(seq: str) -> int:
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


# --------------------------
# Features
# --------------------------
def transcript_features(seq: str, strand: str = "+") -> Dict[str, float]:
    seq = clean_seq(seq)
    feats: Dict[str, float] = {}
    feats["cdna_len"] = len(seq)
    feats["gc_overall"] = gc_frac(seq)

    # GC periodicity
    f0, f1, f2 = frame_gc(seq)
    feats["gc_frame0"] = f0
    feats["gc_frame1"] = f1
    feats["gc_frame2"] = f2
    feats["gc_frame_amp"] = max(f0, f1, f2) - min(f0, f1, f2)

    # ORF features
    lorfa = longest_orf_len(seq)
    lrun = longest_open_run_no_stop(seq)
    feats["longest_orf_len"] = lorfa
    feats["longest_orf_cov"] = lorfa / len(seq) if len(seq) else 0.0
    feats["longest_run_no_stop"] = lrun
    feats["longest_run_cov"] = lrun / len(seq) if len(seq) else 0.0

    # k-mers
    alph = ["A", "C", "G", "T"]
    for k in range(1, MAX_KMER + 1):
        freqs = kmer_freqs(seq, k)
        kmers = []

        def build(prefix: str, depth: int):
            if depth == 0:
                kmers.append(prefix)
                return
            for ch in alph:
                build(prefix + ch, depth - 1)

        build("", k)
        for m in kmers:
            feats[f"k{k}_{m}"] = freqs.get(m, 0.0)

    # polyA
    feats["polyA_signal_tail_count"] = polyA_signal_counts(seq)
    feats["strand_plus"] = 1.0 if strand == "+" else 0.0
    return feats


# --------------------------
# I/O
# --------------------------
def _read_table_any(path: Path) -> pd.DataFrame:
    if not path.exists() or path.stat().st_size == 0:
        raise ValueError(f"{path} is missing or empty")
    compression = "infer" if path.suffix.endswith("gz") else None
    return pd.read_csv(path, sep="\t", compression=compression)








def build_labels_from_annotations(ann_path: Path, force_rule: str | None = None) -> pd.Series:
    """
    Build labels from a TSV annotations table.

    Heuristics for positives (any satisfied => positive):
      1) type/feature in {'CDS','stop_codon'}
      2) any '*_biotype' or 'biotype' equals 'protein_coding'
      3) optional force_rule like 'column=value' (e.g., 'translated=1')

    Returns: pd.Series indexed by transcript_id (version-stripped) with values {0,1}.
    """
    if not ann_path.exists():
        raise ValueError(f"{ann_path} missing")

    ann = pd.read_csv(ann_path, sep="\t", dtype=str).fillna("")
    cols = {c.lower(): c for c in ann.columns}

    # Choose a column that contains transcript IDs
    cand_tid_cols = ["transcript_id", "transcript", "Parent", "parent", "attributes"]
    tid_col = None
    for k in cand_tid_cols:
        if k in cols:
            tid_col = cols[k]
            break
    if tid_col is None:
        # try to parse from attributes-like blobs later
        if "attributes" not in cols:
            raise ValueError(
                "annotations.tsv must include a transcript identifier column "
                "(e.g., transcript_id, transcript, Parent, or attributes)"
            )

    # Normalize transcript ids
    def norm_tid(x: str) -> str:
        x = str(x)
        # try attributes like: "ID=...;Parent=transcript:ENST00000335137.3;..."
        if "Parent=" in x:
            import re
            m = re.search(r"Parent=([^;]+)", x)
            if m:
                x = m.group(1)
        for pref in ("transcript:", "mRNA:", "mrna:", "transcript_id="):
            if x.startswith(pref):
                x = x[len(pref):]
        return x.split(".")[0]

    # Build a working transcript_id column
    if tid_col is not None:
        ann["_tid"] = ann[tid_col].astype(str).map(norm_tid)
    else:
        ann["_tid"] = ann["attributes"].astype(str).map(norm_tid)

    # Rule 1: type/feature CDS/stop_codon
    type_like = None
    for k in ("type", "feature", "featuretype"):
        if k in cols:
            type_like = cols[k]
            break
    cds_mask = pd.Series(False, index=ann.index)
    if type_like:
        tvals = ann[type_like].str.strip().str.lower()
        cds_mask = tvals.isin({"cds", "stop_codon"})

    # Rule 2: any biotype == protein_coding
    biotype_mask = pd.Series(False, index=ann.index)
    for k in ann.columns:
        kl = k.lower()
        if kl.endswith("biotype") or kl == "biotype":
            biotype_mask = biotype_mask | (ann[k].str.strip().str.lower() == "protein_coding")

    # Rule 3: optional force rule like column=value
    rule_mask = pd.Series(False, index=ann.index)
    if force_rule:
        if "=" not in force_rule:
            raise ValueError("--ann-positive-rule must look like 'column=value'")
        col, val = force_rule.split("=", 1)
        if col not in ann.columns:
            raise ValueError(f"--ann-positive-rule column '{col}' not found in annotations")
        rule_mask = ann[col].astype(str).str.strip().str.lower() == val.strip().lower()

    pos_ids = set(ann.loc[cds_mask | biotype_mask | rule_mask, "_tid"])
    if not pos_ids and not force_rule:
        # Be explicit about what we looked for
        looked = []
        if type_like: looked.append(f"{type_like} in {{CDS, stop_codon}}")
        bt_cols = [c for c in ann.columns if c.lower().endswith("biotype") or c.lower() == "biotype"]
        if bt_cols: looked.append(f"{' or '.join(bt_cols)} == protein_coding")
        hint = " and ".join(looked) if looked else "standard columns"
        raise ValueError(
            "No positives found in annotations.tsv with default rules. "
            f"Tried: {hint}. Consider supplying --ann-positive-rule 'col=value'."
        )

    # Return Series of 0/1 indexed by transcript_id
    idx = ann["_tid"]
    return pd.Series(idx.map(lambda tid: 1 if tid in pos_ids else 0).values, index=idx, dtype=int)







def featurize_sequences(
    seq_path: Path,
    ann_path: Path,
    ann_positive_rule: str | None = None,  # <— required
) -> Tuple[pd.DataFrame, pd.Series, List[str]]:
    df = _read_table_any(seq_path)
    if "transcript_id" not in df.columns or "sequence" not in df.columns:
        raise ValueError("sequences.tsv must have columns: transcript_id, sequence")

    # labels
    y_series = build_labels_from_annotations(ann_path, force_rule=ann_positive_rule)

    def norm_tid(x: str) -> str:
        x = str(x)
        for pref in ("transcript:", "mRNA:", "mrna:", "transcript_id="):
            if x.startswith(pref):
                x = x[len(pref):]
        return x.split(".")[0]

    df["transcript_id"] = df["transcript_id"].astype(str).map(norm_tid)
    y_series.index = y_series.index.map(norm_tid)

    present_pos = set(df["transcript_id"]) & set(y_series.index[y_series == 1])
    print(f"[sanity] sequences={len(df)} positives_in_ann={int((y_series==1).sum())} positives_present={len(present_pos)}")
    y = df["transcript_id"].map(lambda tid: int(tid in present_pos)).astype(int)
    if y.sum() == 0 or y.sum() == len(y):
        raise ValueError("Labels are single-class after join. Check annotations or use --ann-positive-rule.")

    feats_list, ids = [], []
    for _, row in tqdm(df.iterrows(), total=len(df), desc="Featurizing"):
        tid = row["transcript_id"]; seq = row["sequence"]
        feats_list.append(transcript_features(seq)); ids.append(tid)

    X = pd.DataFrame(feats_list, dtype=np.float32)
    X.insert(0, "transcript_id", ids)
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    feature_cols = [c for c in X.columns if c != "transcript_id"]
    return X, y, feature_cols






def train_model(
    seq_path: Path,
    ann_path: Path,
    model_out: Path,
    features_out: Path | None = None,
    n_splits: int = 5,
    random_state: int = 42,
    ann_positive_rule: str | None = None,  # <— required
):
    X, y, feature_cols = featurize_sequences(seq_path, ann_path, ann_positive_rule)

    if features_out:
        X_out = X.copy()
        X_out.insert(1, "label", y.values)
        X_out.to_csv(features_out, sep="\t", index=False)

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state)
    oof_pred = np.zeros(len(X), dtype=float)

    fold = 1
    for tr_idx, va_idx in skf.split(X, y):
        Xtr, Xva = X.iloc[tr_idx][feature_cols].values, X.iloc[va_idx][feature_cols].values
        ytr, yva = y.iloc[tr_idx].values, y.iloc[va_idx].values

        pos_weight = (len(ytr) - ytr.sum()) / max(ytr.sum(), 1)
        sw = np.where(ytr == 1, pos_weight, 1.0)

        clf = HistGradientBoostingClassifier(random_state=random_state, max_depth=6, max_iter=200, learning_rate=0.05)
        clf.fit(Xtr, ytr, sample_weight=sw)
        proba = clf.predict_proba(Xva)[:, 1]
        oof_pred[va_idx] = proba

        yhat = (proba >= 0.5).astype(int)
        acc = accuracy_score(yva, yhat)
        f1 = f1_score(yva, yhat, zero_division=0)
        if len(np.unique(yva)) == 2:
            auc = roc_auc_score(yva, proba); ap = average_precision_score(yva, proba)
            print(f"[fold {fold}] ACC={acc:.3f} F1={f1:.3f} ROC-AUC={auc:.3f} AP={ap:.3f}")
        else:
            print(f"[fold {fold}] ACC={acc:.3f} F1={f1:.3f} ROC-AUC=nan AP=0.000")
        fold += 1

    final_clf = HistGradientBoostingClassifier(random_state=random_state, max_depth=6, max_iter=200, learning_rate=0.05)
    pos_weight_full = (len(y) - y.sum()) / max(y.sum(), 1)
    sw_full = np.where(y.values == 1, pos_weight_full, 1.0)
    final_clf.fit(X[feature_cols].values, y.values, sample_weight=sw_full)

    artifact = {"model": final_clf, "feature_cols": feature_cols, "id_col": "transcript_id"}
    dump(artifact, model_out)
    print(f"[saved] model -> {model_out}")

    yhat_oof = (oof_pred >= 0.5).astype(int)
    overall_acc = accuracy_score(y, yhat_oof)
    overall_f1 = f1_score(y, yhat_oof, zero_division=0)
    if len(np.unique(y)) == 2:
        overall_auc = roc_auc_score(y, oof_pred); overall_ap = average_precision_score(y, oof_pred)
        print(f"[oof] ACC={overall_acc:.3f} F1={overall_f1:.3f} ROC-AUC={overall_auc:.3f} AP={overall_ap:.3f}")
    else:
        print(f"[oof] ACC={overall_acc:.3f} F1={overall_f1:.3f} ROC-AUC=nan AP=0.000")



def predict(seq_path: Path, model_path: Path, out_csv: Path):
    artifact = load(model_path)
    model = artifact["model"]
    feature_cols = artifact["feature_cols"]

    seqs = _read_table_any(seq_path)
    feats_list, tids = [], []
    for _, row in tqdm(seqs.iterrows(), total=len(seqs), desc="Featurizing"):
        tid = str(row["transcript_id"]).split(".")[0]
        feats = transcript_features(str(row["sequence"]))
        feats_list.append(feats)
        tids.append(tid)

    X = pd.DataFrame(feats_list, dtype=np.float32)
    X.insert(0, "transcript_id", tids)
    for col in feature_cols:
        if col not in X.columns:
            X[col] = 0.0
    X = X[["transcript_id"] + feature_cols]

    proba = model.predict_proba(X[feature_cols].values)[:, 1]
    pred = (proba >= 0.5).astype(int)

    out = pd.DataFrame({"transcript_id": X["transcript_id"], "prob_translation": proba, "predicted_label": pred})
    out.to_csv(out_csv, index=False)
    print(f"[saved] predictions -> {out_csv}")


def featurize_only(seq_path: Path, ann_path: Path, out_csv: Path):
    X, y, feature_cols = featurize_sequences(seq_path, ann_path)
    X.insert(1, "label", y.values)
    X.to_csv(out_csv, index=False)
    print(f"[saved] features -> {out_csv}")


# --------------------------
# CLI
# --------------------------
def build_argparser():
    p = argparse.ArgumentParser(description="Translation likelihood predictor")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_train = sub.add_parser("train", help="Train model")
    p_train.add_argument("--seq-in", required=True)
    p_train.add_argument("--ann", required=True)
    p_train.add_argument("--model", required=True)
    p_train.add_argument("--features-out")
    p_train.add_argument("--splits", type=int, default=5)
    p_train.add_argument("--seed", type=int, default=42)
    p_train.add_argument("--max-kmer", type=int, default=3)

    p_pred = sub.add_parser("predict", help="Predict new sequences")
    p_pred.add_argument("--seq-in", required=True)
    p_pred.add_argument("--model", required=True)
    p_pred.add_argument("--out", required=True)
    p_pred.add_argument("--max-kmer", type=int, default=3)

    p_feat = sub.add_parser("featurize", help="Featurize only")
    p_feat.add_argument("--seq-in", required=True)
    p_feat.add_argument("--ann", required=True)
    p_feat.add_argument("--out", required=True)
    p_feat.add_argument("--max-kmer", type=int, default=3)

    return p




def main():
    global MAX_KMER
    ap = build_argparser()
    args = ap.parse_args()

    if hasattr(args, "max_kmer") and args.max_kmer:
        MAX_KMER = max(1, int(args.max_kmer))
    if args.cmd == "train":
    	train_model(
        	Path(args.seq_in),
        	Path(args.ann),
        	Path(args.model),
        	Path(args.features_out) if args.features_out else None,
        	n_splits=args.splits,
       	 	random_state=args.seed,
        	ann_positive_rule=getattr(args, "ann_positive_rule", None),
    	)
    elif args.cmd == "predict":
        predict(
            seq_path=Path(args.seq_in),
            model_path=Path(args.model),
            out_csv=Path(args.out),
        )
    elif args.cmd == "featurize":
        featurize_only(
            seq_path=Path(args.seq_in),
            ann_path=Path(args.ann),
            out_csv=Path(args.out),
        )
    else:
        raise SystemExit(f"Unknown cmd {args.cmd}")


if __name__ == "__main__":
    main()

