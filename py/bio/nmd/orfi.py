#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Coding vs Non-coding Predictor — robust v2 (ORF-aware, with progress & resilient Ion params)

Key features
- If a sequence is >150 nt:
    (1) predict on the full sequence, then
    (2) find forward-strand ORFs (ATG..STOP) and predict each ORF.
- Periodic updates via works.progress(0..100) and works.msg(...) in Ion mode.
- Robust handling of Ion params that may arrive as lists, dicts, or "jfile:/tmp/..." pseudo-paths.
- Avoids re-loading the model/vectorizer for every ORF; artifacts are loaded once and reused.

Training usage (unchanged):
python coding_vs_noncoding_predictor_v2.py train \
  --gffdb Homo_sapiens.GRCh38.114.gff3.gz.db \
  --gff   Homo_sapiens.GRCh38.114.gff3.gz \
  --fasta Homo_sapiens.GRCh38.dna.primary_assembly.fa \
  --outdir model_out_v2

Prediction (CLI):
python coding_vs_noncoding_predictor_v2.py predict \
  --model model_out_v2/model.joblib \
  --vectorizer model_out_v2/vectorizer.joblib \
  --fasta sequences.fa \
  --output predictions.tsv

# or provide raw sequences:
python coding_vs_noncoding_predictor_v2.py predict \
  --model model_out_v2/model.joblib \
  --vectorizer model_out_v2/vectorizer.joblib \
  --seqs '["ATGGCC...","TTTAAA..."]' \
  --output predictions.tsv

# or via stdin:
echo '{"seqs":["ATGGCC","TTTAAA"]}' | python coding_vs_noncoding_predictor_v2.py predict \
  --model model_out_v2/model.joblib \
  --vectorizer model_out_v2/vectorizer.joblib \
  --stdin-json \
  --output predictions.tsv

Ion mode (works):
param(1): input — FASTA path OR JSON list / delimited string of sequences (can also be a list that includes a jfile path)
param(2): model path (optional; default used if empty/invalid; accepts 'jfile:/...' too)
param(3): vectorizer path (optional; default used if empty/invalid; accepts 'jfile:/...' too)
param(4): (optional) output path (TSV). If omitted, returns JSON only.
"""

from __future__ import annotations
import argparse
import gzip
import os
import sys
import json
from collections import Counter
from typing import Iterable, List, Tuple, Dict, Any, Union, Callable, Optional

import numpy as np
import pandas as pd
import joblib
from joblib import dump

# Optional Ion support
try:
    from ion import works  # type: ignore
    _HAS_ION = True
except Exception:
    _HAS_ION = False

RANDOM_STATE = 42
NUCS = ["A", "C", "G", "T"]

NONCODING_BIOTYPES = set([
    "lincRNA","lncRNA","antisense","processed_transcript","retained_intron",
    "sense_intronic","sense_overlapping","3prime_overlapping_ncRNA","macro_lncRNA",
    "nonsense_mediated_decay","non_stop_decay","pseudogene","transcribed_unprocessed_pseudogene",
    "processed_pseudogene","unprocessed_pseudogene","TEC","miRNA","snRNA","snoRNA","rRNA",
    "scaRNA","vaultRNA","misc_RNA","scRNA","srpRNA","tRNA","ribozyme"
])

COMPLEMENTS = str.maketrans("ACGTacgtNn", "TGCAtgcaNn")

# -----------------------------------------------------------------------------
# Progress / messaging helpers
# -----------------------------------------------------------------------------
def _progress(pct: float, msg: str | None = None) -> None:
    """Clamp pct to [0,100], emit works.progress and works.msg if available."""
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

# =============================================================================
# NumPy PCG64 unpickling hotfix (pre-warm BEFORE any joblib.load calls)
# =============================================================================
def _prewarm_numpy_pcg64_unpickling() -> None:
    """
    Make older pickles referencing numpy.random._pcg64 / .pcg64 resolve in this env.
    """
    import types
    import numpy as _np
    for modname in ("numpy.random._pcg64", "numpy.random.pcg64"):
        if modname not in sys.modules:
            m = types.ModuleType(modname)
            m.PCG64 = _np.random.PCG64
            sys.modules[modname] = m
    try:
        import numpy.random._pickle as _nrp
        bitgens = getattr(_nrp, "BitGenerators", None)
        if isinstance(bitgens, dict):
            for modname in ("numpy.random._pcg64", "numpy.random.pcg64", _np.random.PCG64.__module__):
                bitgens.setdefault(modname, {})["PCG64"] = _np.random.PCG64
    except Exception:
        pass

_prewarm_numpy_pcg64_unpickling()

def safe_joblib_load(path_or_obj: Any):
    """
    Load a joblib artifact. Accepts:
      - str/os.PathLike path (supports 'jfile:/...' by stripping prefix)
      - anything else -> raises TypeError with a clear message
    """
    _prewarm_numpy_pcg64_unpickling()

    # unwrap potential pathlikes
    if hasattr(path_or_obj, "__fspath__"):
        path_or_obj = path_or_obj.__fspath__()

    if isinstance(path_or_obj, str):
        p = path_or_obj
        if p.startswith("jfile:"):
            p = p.split(":", 1)[1]
        return joblib.load(p)

    raise TypeError(f"Expected a model/vectorizer path (str), got {type(path_or_obj).__name__}: {path_or_obj!r}")

# =============================================================================
# Ion param normalization
# =============================================================================
def _first_valid_path_from_list(items: Iterable[Any]) -> Optional[str]:
    """
    Given a mixed list, return the first string that looks like a path and exists.
    Accepts plain paths or 'jfile:/path' pseudo-paths.
    """
    for it in items:
        if isinstance(it, str):
            p = it.split(":", 1)[1] if it.startswith("jfile:") else it
            if os.path.exists(p):
                return p
    return None

def _normalize_path(val: Any, default: Optional[str] = None) -> Optional[str]:
    """
    Turn Ion param into a usable filesystem path string (or default).
    - str: returns stripped path (handles 'jfile:' prefix)
    - list/tuple: pick first existing path-like string
    - dict/other: ignore and return default
    """
    try:
        if isinstance(val, str):
            return val.split(":", 1)[1] if val.startswith("jfile:") else val
        if isinstance(val, (list, tuple)):
            return _first_valid_path_from_list(val) or default
        # sometimes a dict leaks in via listeners; ignore it
        return default
    except Exception:
        return default

def _extract_sequences_from_param(inp: Any) -> Tuple[List[str], List[str]]:
    """
    Heuristically parse Ion param(1) which may be:
      - a FASTA path (str) or 'jfile:/...'
      - a list/tuple containing a jfile path (we read from that)
      - a JSON string list of sequences
      - a delimited string of sequences
      - a raw sequence string
    Returns (headers, seqs). Headers empty if not from FASTA.
    """
    headers: List[str] = []
    seqs: List[str] = []

    # Case: string path to FASTA (or jfile path)
    if isinstance(inp, str):
        p = inp.split(":", 1)[1] if inp.startswith("jfile:") else inp
        if os.path.exists(p):
            for h, s in read_fasta_iter(p):
                headers.append(h); seqs.append(s)
            return headers, seqs
        # else treat as raw string / json / delimited
        return headers, _parse_seq_list(inp)

    # Case: list/tuple — try to find a file first
    if isinstance(inp, (list, tuple)):
        p = _first_valid_path_from_list(inp)
        if p:
            for h, s in read_fasta_iter(p):
                headers.append(h); seqs.append(s)
            return headers, seqs
        # else, collect only string-like parts and parse them as sequences
        flat_strs = [x for x in inp if isinstance(x, str)]
        if flat_strs:
            return headers, _parse_seq_list(flat_strs if len(flat_strs) > 1 else flat_strs[0])
        # if nothing usable, fall through

    # Case: dict/other — nothing to do
    return headers, []

# =============================================================================
# Sequence utilities
# =============================================================================
def all_kmers(k: int) -> List[str]:
    kmers = [""]
    for _ in range(k):
        kmers = [p + n for p in kmers for n in NUCS]
    return kmers

def revcomp(seq: str) -> str:
    return seq.translate(COMPLEMENTS)[::-1]

def canonicalize(seq: str) -> str:
    return seq.upper().replace("U", "T")

def gc_content(seq: str) -> float:
    seq = canonicalize(seq)
    if not seq:
        return 0.0
    g = seq.count("G"); c = seq.count("C")
    atgc = sum(seq.count(b) for b in "ACGT")
    return (g + c) / atgc if atgc else 0.0

def longest_orf_len(seq: str) -> int:
    seq = canonicalize(seq)
    stops = {"TAA", "TAG", "TGA"}
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
        if set(kmer) <= {"A", "C", "G", "T"}:
            counts[kmer] += 1
    vec = np.array([counts[kmer] for kmer in kmers_vocab], dtype=float)
    tot = vec.sum()
    if tot > 0: vec /= tot
    return vec

# ---- ORF discovery (forward strand only) ------------------------------------
def find_orfs(seq: str, require_atg: bool = True) -> List[Dict[str, int]]:
    """
    Return non-overlapping ORFs per frame on the forward strand.
    Each ORF is a dict: {"start": i, "end": j, "frame": frame, "length_nt": j-i}
    Coordinates are 0-based, end-exclusive.
    """
    seq = canonicalize(seq)
    n = len(seq)
    stops = {"TAA", "TAG", "TGA"}
    starts = {"ATG"} if require_atg else None

    orfs: List[Dict[str, int]] = []
    for frame in range(3):
        i = frame
        while i + 3 <= n:
            if starts:
                while i + 3 <= n and seq[i:i+3] not in starts:
                    i += 3
                if i + 3 > n:
                    break
            j = i + 3
            while j + 3 <= n and seq[j:j+3] not in stops:
                j += 3
            if j > i:
                orfs.append({"start": i, "end": j, "frame": frame, "length_nt": j - i})
            i = j + 3
    return orfs

# =============================================================================
# GFF / FASTA handling (train path)
# =============================================================================
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
    return chrom

def fetch_spliced_transcript_sequences(db, fasta_path: str, min_len: int = 150,
                                       limit_n: int | None = None) -> Tuple[pd.DataFrame, Dict[str, str]]:
    from pyfaidx import Fasta
    fa = Fasta(fasta_path, as_raw=True, sequence_always_upper=True)

    records = []; seqs = {}
    featuretypes = ["transcript", "mRNA"]

    for tx in db.features_of_type(featuretypes, order_by="start"):
        tid = tx.id; chrom = tx.chrom; strand = tx.strand
        # Determine biotype
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

# =============================================================================
# Train / Evaluate
# =============================================================================
def train_model(X: np.ndarray, y: np.ndarray, model_type: str = "logreg"):
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import RandomForestClassifier
    if model_type == "logreg":
        clf = LogisticRegression(
            penalty="l2", C=1.0, solver="lbfgs", max_iter=200,
            class_weight="balanced", random_state=RANDOM_STATE
        )
    elif model_type == "rf":
        clf = RandomForestClassifier(
            n_estimators=300, max_depth=None, n_jobs=-1,
            class_weight="balanced", random_state=RANDOM_STATE
        )
    else:
        raise ValueError("model_type must be 'logreg' or 'rf'")
    clf.fit(X, y)
    return clf

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
        y_prob = clf.predict_proba(X_test)[:, 1]
        metrics["roc_auc"] = float(roc_auc_score(y_test, y_prob))
    except Exception:
        metrics["roc_auc"] = float("nan")
    return metrics

# =============================================================================
# Prediction helpers
# =============================================================================
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

def _parse_seq_list(raw: Any) -> List[str]:
    """
    Accepts:
      - list/tuple of strings
      - JSON string of list, e.g. '["ATG...","..."]'
      - delimited string: comma/pipe/whitespace separated
      - single contiguous sequence -> treated as a single sequence
    """
    if isinstance(raw, (list, tuple)):
        return [str(x).strip() for x in raw if isinstance(x, str) and str(x).strip()]

    if isinstance(raw, str):
        s = raw.strip()
        # JSON list?
        try:
            obj = json.loads(s)
            if isinstance(obj, (list, tuple)):
                return [str(x).strip() for x in obj if str(x).strip()]
        except Exception:
            pass
        # Delimiters
        if "," in s:
            return [p.strip() for p in s.split(",") if p.strip()]
        if "|" in s:
            return [p.strip() for p in s.split("|") if p.strip()]
        if " " in s:
            parts = [p.strip() for p in s.split() if p.strip()]
            if len(parts) > 1:
                return parts
        return [s]

    # Fallback: nothing useful
    return []

def load_artifacts(model_path: str, vectorizer_path: str):
    clf = safe_joblib_load(model_path)
    vec: SequenceVectorizer = safe_joblib_load(vectorizer_path)
    return clf, vec

def predict_sequences(
    seqs: List[str],
    model_path: Optional[str] = None,
    vectorizer_path: Optional[str] = None,
    clf=None,
    vec: SequenceVectorizer | None = None,
) -> Tuple[List[Dict[str, Any]], List[str], np.ndarray]:
    """
    Run model prediction on an in-memory list of sequences.
    Provide either (clf, vec) or (model_path, vectorizer_path).
    Returns:
      - results: list of dicts per sequence (label, prob_coding, gc_content, longest_orf_len)
      - feat_names: vectorizer feature names
      - X: feature matrix
    """
    if clf is None or vec is None:
        if not (model_path and vectorizer_path):
            raise ValueError("Either provide (clf, vec) or (model_path, vectorizer_path).")
        clf, vec = load_artifacts(model_path, vectorizer_path)

    X = vec.transform(seqs)
    y_pred = clf.predict(X)
    try:
        y_prob = clf.predict_proba(X)[:, 1]
    except Exception:
        y_prob = np.full(len(y_pred), np.nan)

    feat_names = vec.get_feature_names()
    gc_idx = feat_names.index("gc_content") if "gc_content" in feat_names else None
    orf_idx = feat_names.index("longest_orf_len") if "longest_orf_len" in feat_names else None

    results = []
    for i, _ in enumerate(seqs):
        gc = float(X[i, gc_idx]) if gc_idx is not None else float("nan")
        orflen = int(X[i, orf_idx]) if orf_idx is not None else -1
        results.append({
            "label": int(y_pred[i]),
            "prob_coding": float(y_prob[i]),
            "gc_content": gc,
            "longest_orf_len": orflen,
        })
    return results, feat_names, X

def predict_sequence_with_orfs(
    seq: str,
    model_path: Optional[str] = None,
    vectorizer_path: Optional[str] = None,
    clf=None,
    vec: SequenceVectorizer | None = None,
    orf_threshold_nt: int = 150,
    report: Callable[[float, str], None] | None = None
) -> Dict[str, Any]:
    """
    Predict on full sequence; if len(seq) > orf_threshold_nt, also predict for each ORF.
    report(fraction, message) if provided gets called with fraction in [0,1] for this sequence.
    Returns:
      {
        "sequence": {...pred for full sequence...},
        "orfs": [
          {"index": k, "start": s, "end": e, "frame": f, "length_nt": L, "pred": {...}}, ...
        ]
      }
    """
    def r(f: float, m: str) -> None:
        if report:
            report(max(0.0, min(1.0, f)), m)

    r(0.02, "Predicting full sequence")
    seq_results, _, _ = predict_sequences([seq], model_path, vectorizer_path, clf=clf, vec=vec)
    full_pred = seq_results[0]
    out = {"sequence": full_pred, "orfs": []}
    r(0.25, "Scanning for ORFs")

    if len(seq) > orf_threshold_nt:
        orfs = find_orfs(seq, require_atg=True)
        r(0.35, f"Found {len(orfs)} ORFs")
        if orfs:
            # Predict ORFs in batch for efficiency
            orf_seqs = [canonicalize(seq)[o["start"]:o["end"]] for o in orfs]
            orf_preds, _, _ = predict_sequences(orf_seqs, model_path, vectorizer_path, clf=clf, vec=vec)
            total = len(orfs)
            for j, (o, p) in enumerate(zip(orfs, orf_preds), start=1):
                out["orfs"].append({
                    "index": j,
                    "start": o["start"],
                    "end": o["end"],
                    "frame": o["frame"],
                    "length_nt": o["length_nt"],
                    "pred": p,
                })
                # granular progress across [0.40 .. 0.98]
                frac = 0.40 + 0.58 * (j / total)
                r(frac, f"Predicted ORF {j}/{total}")
        else:
            r(0.95, "No ORFs found above threshold")
    else:
        r(0.95, "Sequence below ORF threshold; skipping ORF predictions")

    r(1.0, "Done with sequence")
    return out

# =============================================================================
# CLI commands
# =============================================================================
def cmd_train(args):
    db = load_gff_db(args.gffdb, args.gff)
    meta, seqs = fetch_spliced_transcript_sequences(db, args.fasta, min_len=args.min_len, limit_n=args.limit_n)
    if meta.empty:
        raise SystemExit("No transcripts found meeting criteria.")

    print("[INFO] label counts:", meta["label"].value_counts().to_dict())
    print("[INFO] top biotypes:\n" + meta["biotype"].value_counts().head(20).to_string())

    counts = meta["label"].value_counts().to_dict()
    if not (0 in counts and 1 in counts):
        msg = [f"Only one class present in labels: {counts}"]
        msg.append("Hints: \n - Check chromosome naming between GFF and FASTA (chr1 vs 1)."
                   "\n - Ensure your DB was built from the same Ensembl release as the FASTA."
                   "\n - Try lowering --min-len or enabling CDS fallback (built-in)."
                   "\n - Verify that protein-coding transcripts appear in biotypes above.")
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
    _progress(1, "Starting prediction")

    # Normalize artifact paths (CLI)
    model_path = args.model.split(":", 1)[1] if args.model and args.model.startswith("jfile:") else args.model
    vectorizer_path = args.vectorizer.split(":", 1)[1] if args.vectorizer and args.vectorizer.startswith("jfile:") else args.vectorizer

    # Load artifacts once
    _progress(3, "Loading model & vectorizer")
    clf, vec = load_artifacts(model_path, vectorizer_path)

    # Input can be FASTA or raw sequences via --seqs / --stdin-json
    headers: List[str] = []
    seqs: List[str] = []

    if args.stdin_json:
        try:
            payload = json.loads(sys.stdin.read() or "{}")
        except Exception:
            raise SystemExit("Invalid JSON on stdin")
        seqs = _parse_seq_list(payload.get("seqs", []))
        if not seqs and "fasta" in payload:
            args.fasta = payload["fasta"]

    if not seqs and args.seqs:
        seqs = _parse_seq_list(args.seqs)

    if not seqs and args.fasta:
        p = args.fasta.split(":", 1)[1] if args.fasta.startswith("jfile:") else args.fasta
        for h, s in read_fasta_iter(p):
            headers.append(h); seqs.append(s)

    if not seqs:
        raise SystemExit("No sequences provided (use --fasta or --seqs or --stdin-json).")

    n = len(seqs)
    _progress(8, f"Loaded {n} sequence(s)")

    # Map progress across sequences to [10..95]
    start_pct, end_pct = 10.0, 95.0
    rows = []

    for idx, s in enumerate(seqs):
        seq_id = headers[idx] if (headers and idx < len(headers)) else f"S{idx+1}"
        base = start_pct + (end_pct - start_pct) * (idx / n)
        nxt  = start_pct + (end_pct - start_pct) * ((idx + 1) / n)

        def per_seq_report(frac: float, msg: str) -> None:
            pct = base + (nxt - base) * frac
            _progress(pct, f"[{seq_id}] {msg}")

        per_seq_report(0.0, "Begin")
        combo = predict_sequence_with_orfs(s, clf=clf, vec=vec, orf_threshold_nt=150, report=per_seq_report)

        # Whole-sequence row
        sp = combo["sequence"]
        rows.append({
            "id": seq_id,
            "kind": "sequence",
            "orf_index": "",
            "start": "",
            "end": "",
            "frame": "",
            "length_nt": len(canonicalize(s)),
            "label": sp["label"],
            "prob_coding": f"{sp['prob_coding']:.6f}",
            "gc_content": f"{sp['gc_content']:.5f}",
            "longest_orf_len": sp["longest_orf_len"],
        })

        # ORF rows (if any)
        for o in combo["orfs"]:
            op = o["pred"]
            rows.append({
                "id": seq_id,
                "kind": "orf",
                "orf_index": o["index"],
                "start": o["start"],
                "end": o["end"],
                "frame": o["frame"],
                "length_nt": o["length_nt"],
                "label": op["label"],
                "prob_coding": f"{op['prob_coding']:.6f}",
                "gc_content": f"{op['gc_content']:.5f}",
                "longest_orf_len": op["longest_orf_len"],
            })
        per_seq_report(1.0, "Sequence done")

    _progress(96, "Writing output")
    with open(args.output, "w") as out:
        out.write("id\tkind\torf_index\tstart\tend\tframe\tlength_nt\tlabel\tprob_coding\tgc_content\tlongest_orf_len\n")
        for r in rows:
            out.write(
                f"{r['id']}\t{r['kind']}\t{r['orf_index']}\t{r['start']}\t{r['end']}\t{r['frame']}\t"
                f"{r['length_nt']}\t{r['label']}\t{r['prob_coding']}\t{r['gc_content']}\t{r['longest_orf_len']}\n"
            )
    _progress(100, f"Wrote predictions to {args.output}")
    print(f"[OK] Wrote predictions to {args.output}")

# =============================================================================
# Ion entrypoint (optional)
# =============================================================================
def _main_ion() -> int:
    """
    Ion params:
      1: input — FASTA path OR JSON list / delimited string of sequences (can be a list incl. jfile)
      2: model path (optional; default below if empty/invalid)
      3: vectorizer path (optional; default below if empty/invalid)
      4: (optional) output path (TSV). If omitted, we just return JSON results.
    """
    try:
        raw_inp = works.param(1)
        raw_model = None
        raw_vec = None
        raw_out = None
    except Exception as e:
        raise RuntimeError(f"Ion parameter access failed: {e}") from e

    # Defaults if paths are missing/invalid
    default_model = "../ljlapps/py/bio/nmd/orfi/model.joblib"
    default_vec   = "../ljlapps/py/bio/nmd/orfi/vectorizer.joblib"

    model_path = _normalize_path(raw_model, default_model) or default_model
    vectorizer_path = _normalize_path(raw_vec, default_vec) or default_vec
    out_path = _normalize_path(raw_out, None) if isinstance(raw_out, (str, list, tuple)) else (raw_out if isinstance(raw_out, str) else None)

    _progress(1, "Starting")
    _progress(3, "Loading model & vectorizer")
    try:
        clf, vec = load_artifacts(model_path, vectorizer_path)
    except Exception as e:
        _progress(100, f"Failed to load artifacts: {e}")
        works.resolve({"error": f"Failed to load artifacts: {e}", "model": model_path, "vectorizer": vectorizer_path})
        return 2

    # Determine input seqs
    _progress(5, "Parsing input")
    headers, seqs = _extract_sequences_from_param(raw_inp)
    if not seqs:
        works.resolve({"error": "No sequences provided"})
        return 2

    n = len(seqs)
    _progress(10, f"Loaded {n} sequence(s)")

    # Combined results per sequence (sequence + ORFs if >150nt)
    combined = []
    start_pct, end_pct = 12.0, 96.0

    for idx, s in enumerate(seqs):
        seq_id = headers[idx] if (headers and idx < len(headers)) else f"S{idx+1}"
        base = start_pct + (end_pct - start_pct) * (idx / n)
        nxt  = start_pct + (end_pct - start_pct) * ((idx + 1) / n)

        def per_seq_report(frac: float, msg: str) -> None:
            pct = base + (nxt - base) * frac
            _progress(pct, f"[{seq_id}] {msg}")

        per_seq_report(0.0, "Begin")
        combo = predict_sequence_with_orfs(s, clf=clf, vec=vec, orf_threshold_nt=150, report=per_seq_report)
        entry = {"id": seq_id, "length_nt": len(canonicalize(s)), **combo}
        combined.append(entry)
        per_seq_report(1.0, "Sequence done")

    # Optional TSV
    if out_path:
        _progress(97, f"Writing TSV to {out_path}")
        try:
            with open(out_path, "w") as out:
                out.write("id\tkind\torf_index\tstart\tend\tframe\tlength_nt\tlabel\tprob_coding\tgc_content\tlongest_orf_len\n")
                for entry in combined:
                    seq_id = entry["id"]
                    sp = entry["sequence"]
                    out.write(f"{seq_id}\tsequence\t\t\t\t\t{entry['length_nt']}\t{sp['label']}\t{sp['prob_coding']:.6f}\t{sp['gc_content']:.5f}\t{sp['longest_orf_len']}\n")
                    for o in entry["orfs"]:
                        op = o["pred"]
                        out.write(f"{seq_id}\torf\t{o['index']}\t{o['start']}\t{o['end']}\t{o['frame']}\t{o['length_nt']}\t{op['label']}\t{op['prob_coding']:.6f}\t{op['gc_content']:.5f}\t{op['longest_orf_len']}\n")
        except Exception as e:
            _progress(100, f"Failed to write TSV: {e}")
            works.resolve({"error": f"Failed to write TSV: {e}", "output": out_path})
            return 2

    _progress(100, "Done")
    works.resolve({"n_sequences": len(seqs), "results": combined, "output": out_path or None})
    return 0

# =============================================================================
# CLI args & main
# =============================================================================
def build_arg_parser():
    p = argparse.ArgumentParser(description="Train and use a sequence-only coding vs noncoding predictor (robust v2, ORF-aware, with progress)")
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
    p_pred.add_argument("--fasta", help="Path to FASTA file (or use --seqs / --stdin-json)")
    p_pred.add_argument("--seqs", help='JSON list or comma/pipe/space-separated sequences (e.g., \'["ATG...","TTT..."]\')')
    p_pred.add_argument("--stdin-json", action="store_true",
                        help='Read JSON from stdin: {"seqs": [...]} (or {"fasta":"path"})')
    p_pred.add_argument("--output", default="predictions.tsv")
    p_pred.set_defaults(func=cmd_predict)
    return p

def main():
    if _HAS_ION:
        try:
            return _main_ion()
        except RuntimeError:
            pass
    args = build_arg_parser().parse_args()
    args.func(args)

if __name__ == "__main__":
    sys.exit(main() or 0)
