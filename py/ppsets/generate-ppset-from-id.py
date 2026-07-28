#!/usr/bin/env python3
"""
Predict and rank the best primer/probe sets for a given transcript ID using a trained model.

Usage:
  python predict_primers_for_transcript.py \
      --excel ppsets2.xlsx \
      --sheet Sheet1 \
      --model primer_probe_classifier_small.pkl \
      --transcript_id RTS13 \
      --top_n 10 \
      --out_csv best_primers_RTS13.csv

The script:
  * Loads candidate primer/probe rows from the Excel sheet
  * Filters rows by the provided transcript ID (matches in columns: id, new_id, gene_id)
  * Extracts sequence features (length, GC, AT, Tm for forward/reverse/probe)
  * Loads the trained model and computes P(GOOD) for each candidate
  * Ranks and writes top-N results to CSV (and prints a concise table to stdout)
"""

import argparse
import sys
import os
from typing import List, Tuple

import joblib
import numpy as np
import pandas as pd


def wallace_tm(seq: str) -> float:
    """Rough Tm estimate (Wallace rule): 2*(A+T) + 4*(G+C)."""
    s = str(seq).replace("X", "").upper()
    a = s.count("A")
    t = s.count("T")
    g = s.count("G")
    c = s.count("C")
    return 2.0 * (a + t) + 4.0 * (g + c)


def seq_basic_features(seq: str) -> List[float]:
    """Basic length/GC/AT/Tm features; safe for empty/ambiguous sequences."""
    s = "" if seq is None else str(seq)
    s = s.replace("X", "").upper()
    length = float(len(s))
    if length == 0:
        return [0.0, 0.0, 0.0, 0.0]

    g = s.count("G")
    c = s.count("C")
    a = s.count("A")
    t = s.count("T")

    gc_content = (g + c) / length
    at_content = (a + t) / length
    tm = wallace_tm(s)

    return [length, gc_content, at_content, tm]


def extract_all_features(df: pd.DataFrame) -> np.ndarray:
    """
    Build a feature matrix from forward/reverse/probe sequences.
    For each of the three sequences we compute [len, GC, AT, Tm],
    then concatenate: total 12 features per row.
    """
    fwd = df.get("forward_sequence", pd.Series([""] * len(df)))
    rev = df.get("reverse_sequence", pd.Series([""] * len(df)))
    pro = df.get("probe_sequence", pd.Series([""] * len(df)))

    fwd_feats = np.array([seq_basic_features(s) for s in fwd])
    rev_feats = np.array([seq_basic_features(s) for s in rev])
    pro_feats = np.array([seq_basic_features(s) for s in pro])

    X = np.hstack([fwd_feats, rev_feats, pro_feats]).astype(float)
    return X


def normalize_id(x):
    """Return a tuple of (string_form, numeric_form_or_None) for flexible matching."""
    if pd.isna(x):
        return ("", None)
    s = str(x).strip().upper()
    try:
        n = int(float(x))
    except Exception:
        n = None
    return (s, n)


def filter_by_transcript(df: pd.DataFrame, transcript_id: str) -> pd.DataFrame:
    """
    Filter rows where transcript_id matches any of: id, new_id, gene_id (string or numeric compare).
    Matching is case-insensitive for strings and exact for numbers.
    """
    t_str, t_num = normalize_id(transcript_id)

    # Prepare normalized columns (string & numeric forms)
    id_str = df.get("id", pd.Series([""] * len(df))).astype(str).str.strip().str.upper()
    new_id_str = df.get("new_id", pd.Series([""] * len(df))).astype(str).str.strip().str.upper()
    gene_id_str = df.get("gene_id", pd.Series([""] * len(df))).astype(str).str.strip().str.upper()

    # Numeric tries
    def to_int_or_nan(series):
        return pd.to_numeric(series, errors="coerce")

    id_num = to_int_or_nan(df.get("id", pd.Series([np.nan] * len(df))))
    new_id_num = to_int_or_nan(df.get("new_id", pd.Series([np.nan] * len(df))))
    gene_id_num = to_int_or_nan(df.get("gene_id", pd.Series([np.nan] * len(df))))

    mask = (
        (id_str == t_str) | (new_id_str == t_str) | (gene_id_str == t_str)
    )

    if t_num is not None:
        mask = mask | (id_num == t_num) | (new_id_num == t_num) | (gene_id_num == t_num)

    return df.loc[mask].copy()


def main():
    parser = argparse.ArgumentParser(description="Rank best primer/probe sets for a transcript using a trained model.")
    parser.add_argument("--excel", required=True, help="Path to Excel file with candidate primers (e.g., ppsets2.xlsx)")
    parser.add_argument("--sheet", default="Sheet1", help="Excel sheet name (default: Sheet1)")
    parser.add_argument("--model", required=True, help="Path to trained model .pkl (e.g., primer_probe_classifier_small.pkl)")
    parser.add_argument("--transcript_id", required=True, help="Transcript ID to filter on (matches id/new_id/gene_id)")
    parser.add_argument("--top_n", type=int, default=10, help="How many top candidates to output (default: 10)")
    parser.add_argument("--out_csv", default=None, help="Optional: path to write results CSV")
    args = parser.parse_args()

    # Load data
    try:
        df = pd.read_excel(args.excel, sheet_name=args.sheet)
    except Exception as e:
        print(f"ERROR reading Excel: {e}", file=sys.stderr)
        sys.exit(1)

    # Filter by transcript
    cand = filter_by_transcript(df, args.transcript_id)
    if cand.empty:
        print("No candidates found for transcript_id:", args.transcript_id, file=sys.stderr)
        sys.exit(2)

    # Load model
    try:
        model = joblib.load(args.model)
    except Exception as e:
        print(f"ERROR loading model: {e}", file=sys.stderr)
        sys.exit(3)

    # Extract features & predict probability of GOOD
    X = extract_all_features(cand)
    if hasattr(model, "predict_proba"):
        prob = model.predict_proba(X)[:, 1]
    elif hasattr(model, "decision_function"):
        # Fallback: map decision_function to [0,1] via logistic transform
        from scipy.special import expit
        prob = expit(model.decision_function(X))
    else:
        # Fallback to predictions (0/1); convert to float
        prob = model.predict(X).astype(float)

    cand = cand.copy()
    cand["prob_good"] = prob

    # Helpful QC columns if present
    for col in ["ct", "pass", "user", "gene", "species", "cell_line"]:
        if col not in cand.columns:
            cand[col] = np.nan

    # Rank and select top-N
    cand_sorted = cand.sort_values("prob_good", ascending=False).reset_index(drop=True)
    top_n = max(1, int(args.top_n))
    out = cand_sorted.loc[: top_n - 1, [
        "id", "new_id", "gene_id", "gene", "ct", "pass",
        "forward_sequence", "probe_sequence", "reverse_sequence",
        "prob_good"
    ]]

    # Print concise table to stdout
    print("\nTop {} primer/probe candidates for transcript '{}':".format(top_n, args.transcript_id))
    with pd.option_context("display.max_colwidth", 60, "display.width", 200):
        print(out.to_string(index=False))

    # Save CSV if requested
    if args.out_csv:
        try:
            os.makedirs(os.path.dirname(args.out_csv) or ".", exist_ok=True)
            out.to_csv(args.out_csv, index=False)
            print("\nResults written to:", args.out_csv)
        except Exception as e:
            print(f"WARNING: Failed to write CSV: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
