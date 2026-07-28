"""

oding vs Non-coding Predictor — robust v2

Fixes the "Only one class present in labels" issue by:
  * Considering both featuretypes: transcript and mRNA
  * Using transcript_biotype, transcript_type, biotype, and parent gene_biotype
  * Treating NMD/non_stop_decay as NONCODING
  * Falling back to CDS presence to mark a transcript as coding when biotypes are missing/misleading
  * Handling chromosome name mismatches between GFF and FASTA (e.g., 'chr1' vs '1')
  * Emitting a biotype distribution summary so you can see what's going on

Usage (same references):
python coding_vs_noncoding_predictor_v2.py train \
  --gffdb Homo_sapiens.GRCh38.114.gff3.gz.db \
  --gff   Homo_sapiens.GRCh38.114.gff3.gz \
  --fasta Homo_sapiens.GRCh38.dna.primary_assembly.fa \
  --outdir model_out_v2
"""
from __future__ import annotations
import argparse
import gzip
import os
import sys
import json
from collections import Counter
from typing import Iterable, List, Tuple, Dict

import numpy as np
import pandas as pd
from joblib import dump, load

RANDOM_STATE = 42
NUCS = ["A","C","G","T"]

NONCODING_BIOTYPES = set([
    "lincRNA","lncRNA","antisense","processed_transcript","retained_intron",
    "sense_intronic","sense_overlapping","3prime_overlapping_ncRNA","macro_lncRNA",
    "nonsense_mediated_decay","non_stop_decay","pseudogene","transcribed_unprocessed_pseudogene",
    "processed_pseudogene","unprocessed_pseudogene","TEC","miRNA","snRNA","snoRNA","rRNA",
    "scaRNA","vaultRNA","misc_RNA","scRNA","srpRNA","tRNA","ribozyme"
])

COMPLEMENTS = str.maketrans("ACGTacgtNn", "TGCAtgcaNn")

def all_kmers(k: int) -> List[str]:
    kmers = [""]
    for _ in range(k):
        kmers = [p + n for p in kmers for n in NUCS]
    return kmers

def revcomp(seq: str) -> str:
    return seq.translate(COMPLEMENTS)[::-1]

def canonicalize(seq: str) -> str:
    return seq.upper().replace("U","T")

def gc_content(seq: str) -> float:
    seq = canonicalize(seq)
    if not seq:
        return 0.0
    g = seq.count("G"); c = seq.count("C")
    atgc = sum(seq.count(b) for b in "ACGT")
    return (g + c) / atgc if atgc else 0.0

def longest_orf_len(seq: str) -> int:
    seq = canonicalize(seq)
    stops = {"TAA","TAG","TGA"}
    best = 0; n = len(seq)
    for frame in range(3):
        i = frame
        while i + 3 <= n:
            while i + 3 <= n and seq[i:i+3] != "ATG":
                i += 3
            if i + 3 > n: break
            j = i + 3
            while j + 3 <= n and seq[j:j+3] not in stops:
                j += 3
            best = max(best, j - i)
            i = j + 3
    return best

def kmer_counts(seq: str, k: int, kmers_vocab: List[str]) -> np.ndarray:
    seq = canonicalize(seq)
    counts = Counter(); n = len(seq)
    for i in range(n - k + 1):
        kmer = seq[i:i+k]
        if set(kmer) <= {"A","C","G","T"}:
            counts[kmer] += 1
    vec = np.array([counts[kmer] for kmer in kmers_vocab], dtype=float)
    tot = vec.sum();
    if tot > 0: vec /= tot
    return vec

# -----------------------------
# GFF / FASTA handling
# -----------------------------

def load_gff_db(gffdb: str | None, gff: str | None):
    import gffutils
    if gffdb and os.path.exists(gffdb):
        return gffutils.FeatureDB(gffdb, keep_order=True)
    if not gff:
        raise FileNotFoundError("GFF DB not found and no GFF provided to create one.")
    dbfn = gff + ".db"
    print(f"[INFO] Creating GFF database at {dbfn} (one-time cost)...", file=sys.stderr)
    gffutils.create_db(
        gff, dbfn=dbfn, force=True, keep_order=True,
        merge_strategy="create_unique", sort_attribute_values=True,
        disable_infer_transcripts=False, disable_infer_genes=False,
    )
    import gffutils
    return gffutils.FeatureDB(dbfn, keep_order=True)


def _chrom_alias(chrom: str, fa) -> str:
    if chrom in fa: return chrom
    if chrom.startswith("chr") and chrom[3:] in fa: return chrom[3:]
    if ("chr" + chrom) in fa: return "chr" + chrom
    return chrom  # will KeyError downstream if truly missing


def fetch_spliced_transcript_sequences(db, fasta_path: str, min_len: int = 150,
                                       limit_n: int | None = None) -> Tuple[pd.DataFrame, Dict[str, str]]:
    from pyfaidx import Fasta
    fa = Fasta(fasta_path, as_raw=True, sequence_always_upper=True)

    records = []; seqs = {}

    featuretypes = ["transcript", "mRNA"]

    for tx in db.features_of_type(featuretypes, order_by="start"):
        tid = tx.id; chrom = tx.chrom; strand = tx.strand
        # Determine biotype from multiple possible keys
        biotype = None
        for key in ("transcript_biotype","transcript_type","biotype"):
            if key in tx.attributes and tx.attributes[key]:
                biotype = tx.attributes[key][0]; break
        parent_gene_biotype = None
        try:
            gene = next(db.parents(tx, featuretype="gene"))
            for key in ("gene_biotype","biotype"):
                if key in gene.attributes and gene.attributes[key]:
                    parent_gene_biotype = gene.attributes[key][0]; break
        except StopIteration:
            pass
        if biotype is None:
            biotype = parent_gene_biotype or "unknown"

        # Label logic
        is_coding_biotype = (biotype == "protein_coding") or (parent_gene_biotype == "protein_coding")
        if biotype in NONCODING_BIOTYPES or biotype in {"nonsense_mediated_decay","non_stop_decay"}:
            is_coding_biotype = False
        has_cds = any(True for _ in db.children(tx, featuretype="CDS"))
        label = 1 if (is_coding_biotype or has_cds) else 0

        # Build spliced sequence
        exons = list(db.children(tx, featuretype=["exon","CDS"], order_by="start"))
        if not exons:
            continue
        pieces = []
        try:
            for ex in exons:
                chrom_name = _chrom_alias(ex.chrom, fa)
                seq = fa[chrom_name][ex.start-1:ex.end]
                pieces.append(str(seq))
            seq_concat = "".join(pieces)
            if strand == "-":
                seq_concat = revcomp(seq_concat)
        except KeyError:
            continue

        if len(seq_concat) < min_len:
            continue

        seqs[tid] = seq_concat
        records.append({
            "transcript_id": tid,
            "gene_id": tx.attributes.get("gene_id", [None])[0],
            "chr": chrom,
            "start": tx.start,
            "end": tx.end,
            "strand": strand,
            "biotype": biotype,
            "gene_biotype": parent_gene_biotype,
            "has_cds": has_cds,
            "label": label,
            "length": len(seq_concat),
        })
        if limit_n and len(seqs) >= limit_n:
            break

    meta = pd.DataFrame.from_records(records)
    return meta, seqs

class SequenceVectorizer:
    def __init__(self, k: int = 4, include_gc: bool = True, include_orf: bool = True):
        self.k = k; self.include_gc = include_gc; self.include_orf = include_orf
        self.kmers_vocab = all_kmers(k); self.dim_ = len(self.kmers_vocab) + int(include_gc) + int(include_orf)
    def transform(self, seqs: List[str]) -> np.ndarray:
        feats = []
        for s in seqs:
            vec = kmer_counts(s, self.k, self.kmers_vocab)
            extras = []
            if self.include_gc: extras.append(gc_content(s))
            if self.include_orf: extras.append(longest_orf_len(s))
            if extras: vec = np.concatenate([vec, np.array(extras, dtype=float)])
            feats.append(vec)
        return np.vstack(feats) if feats else np.empty((0, self.dim_), dtype=float)
    def get_feature_names(self) -> List[str]:
        names = [f"kmer_{k}" for k in self.kmers_vocab]
        if self.include_gc: names.append("gc_content")
        if self.include_orf: names.append("longest_orf_len")
        return names

# -----------------------------
# Train / Evaluate / Predict
# -----------------------------

def train_model(X: np.ndarray, y: np.ndarray, model_type: str = "logreg"):
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import RandomForestClassifier
    if model_type == "logreg":
        clf = LogisticRegression(penalty="l2", C=1.0, solver="lbfgs", max_iter=200, class_weight="balanced", random_state=RANDOM_STATE)
    elif model_type == "rf":
        clf = RandomForestClassifier(n_estimators=300, max_depth=None, n_jobs=-1, class_weight="balanced", random_state=RANDOM_STATE)
    else:
        raise ValueError("model_type must be 'logreg' or 'rf'")
    clf.fit(X, y); return clf


def evaluate_model(clf, X_test: np.ndarray, y_test: np.ndarray) -> Dict[str, float]:
    from sklearn.metrics import accuracy_score, roc_auc_score, f1_score, precision_score, recall_score
    y_pred = clf.predict(X_test)
    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred)),
        "recall": float(recall_score(y_test, y_pred)),
        "f1": float(f1_score(y_test, y_pred)),
    }
    try:
        y_prob = clf.predict_proba(X_test)[:,1]
        metrics["roc_auc"] = float(roc_auc_score(y_test, y_prob))
    except Exception:
        metrics["roc_auc"] = float("nan")
    return metrics

# -----------------------------
# CLI
# -----------------------------

def read_fasta_iter(fasta_path: str):
    opener = gzip.open if fasta_path.endswith(".gz") else open
    with opener(fasta_path, "rt") as fh:
        header = None; chunks = []
        for line in fh:
            if line.startswith(">"):
                if header is not None:
                    yield header, "".join(chunks)
                header = line[1:].strip(); chunks = []
            else:
                chunks.append(line.strip())
        if header is not None:
            yield header, "".join(chunks)


def cmd_train(args):
    db = load_gff_db(args.gffdb, args.gff)
    meta, seqs = fetch_spliced_transcript_sequences(db, args.fasta, min_len=args.min_len, limit_n=args.limit_n)
    if meta.empty:
        raise SystemExit("No transcripts found meeting criteria.")

    # Debug summary
    print("[INFO] label counts:", meta["label"].value_counts().to_dict())
    print("[INFO] top biotypes:\n" + meta["biotype"].value_counts().head(20).to_string())

    counts = meta["label"].value_counts().to_dict()
    if not (0 in counts and 1 in counts):
        # surface helpful hints
        msg = [f"Only one class present in labels: {counts}"]
        msg.append("Hints: \n - Check chromosome naming between GFF and FASTA (chr1 vs 1).\n - Ensure your DB was built from the same Ensembl release as the FASTA.\n - Try lowering --min-len or enabling CDS fallback (built-in).\n - Verify that protein-coding transcripts appear in biotypes above.")
        raise SystemExit("\n".join(msg))

    vec = SequenceVectorizer(k=args.k)
    X = vec.transform([seqs[tid] for tid in meta["transcript_id"]])
    y = meta["label"].values.astype(int)

    from sklearn.model_selection import train_test_split
    idx = np.arange(len(y))
    tr, te = train_test_split(idx, test_size=args.test_size, random_state=RANDOM_STATE, stratify=y)
    Xtr, Xte = X[tr], X[te]
    ytr, yte = y[tr], y[te]

    clf = train_model(Xtr, ytr, model_type=args.model)
    metrics = evaluate_model(clf, Xte, yte)

    os.makedirs(args.outdir, exist_ok=True)
    dump(clf, os.path.join(args.outdir, "model.joblib"))
    dump(vec, os.path.join(args.outdir, "vectorizer.joblib"))
    meta.to_csv(os.path.join(args.outdir, "training_metadata.tsv"), sep="\t", index=False)
    with open(os.path.join(args.outdir, "metrics.json"), "w") as fh:
        json.dump(metrics, fh, indent=2)
    print("[METRICS]", json.dumps(metrics, indent=2))


def cmd_predict(args):
    clf = load(args.model); vec: SequenceVectorizer = load(args.vectorizer)
    headers = []; seqs = []
    for h, s in read_fasta_iter(args.fasta):
        headers.append(h); seqs.append(s)
    if not seqs:
        raise SystemExit("No sequences found in FASTA.")
    X = vec.transform(seqs)
    y_pred = clf.predict(X)
    try: y_prob = clf.predict_proba(X)[:,1]
    except Exception: y_prob = np.full(len(y_pred), np.nan)
    with open(args.output, "w") as out:
        out.write("id\tlabel\tprob_coding\tgc_content\tlongest_orf_len\n")
        feat_names = vec.get_feature_names()
        gc_idx = feat_names.index("gc_content") if "gc_content" in feat_names else None
        orf_idx = feat_names.index("longest_orf_len") if "longest_orf_len" in feat_names else None
        for i, h in enumerate(headers):
            gc = X[i, gc_idx] if gc_idx is not None else np.nan
            orflen = int(X[i, orf_idx]) if orf_idx is not None else -1
            out.write(f"{h}\t{int(y_pred[i])}\t{y_prob[i]:.6f}\t{gc:.5f}\t{orflen}\n")
    print(f"[OK] Wrote predictions to {args.output}")


def build_arg_parser():
    p = argparse.ArgumentParser(description="Train and use a sequence-only coding vs noncoding predictor (robust v2)")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_train = sub.add_parser("train")
    p_train.add_argument("--gffdb", default="Homo_sapiens.GRCh38.114.gff3.gz.db")
    p_train.add_argument("--gff", default="Homo_sapiens.GRCh38.114.gff3.gz")
    p_train.add_argument("--fasta", default="Homo_sapiens.GRCh38.dna.primary_assembly.fa")
    p_train.add_argument("--min-len", dest="min_len", type=int, default=150)
    p_train.add_argument("--limit-n", dest="limit_n", type=int, default=None)
    p_train.add_argument("--k", type=int, default=4)
    p_train.add_argument("--model", choices=["logreg","rf"], default="logreg")
    p_train.add_argument("--test-size", type=float, default=0.2)
    p_train.add_argument("--outdir", default="model_out_v2")
    p_train.set_defaults(func=cmd_train)

    p_pred = sub.add_parser("predict")
    p_pred.add_argument("--model", required=True)
    p_pred.add_argument("--vectorizer", required=True)
    p_pred.add_argument("--fasta", required=True)
    p_pred.add_argument("--output", default="predictions.tsv")
    p_pred.set_defaults(func=cmd_predict)
    return p


def main():
    args = build_arg_parser().parse_args()
    args.func(args)

if __name__ == "__main__":
    main()

