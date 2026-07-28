#!/usr/bin/env python3
"""
train_control_detector.py

Train a model to identify rows that are likely controls
(e.g. UTC, untreated, vehicle, negative control, etc.)
from assay export files like the sample Jeff uploaded.

Usage:
    python train_control_detector.py \
        --train-glob "data/*.csv" \
        --output-model control_detector.joblib

    python train_control_detector.py \
        --train-glob "data/*" \
        --predict-file new_run.csv \
        --output-predictions predictions.csv

Notes:
- Best results happen if your files contain a text column like "Sample".
- This script uses weak supervision: it auto-labels rows whose text clearly
  matches control-like patterns, then learns from both text and numeric columns.
- You can extend CONTROL_PATTERNS and NON_CONTROL_PATTERNS below.
"""

from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler


# ----------------------------
# Heuristics you can customize
# ----------------------------

CONTROL_PATTERNS = [
    r"\butc\b",
    r"\buntreated\b",
    r"\buntr\b",
    r"\buntreat(?:ed)?\b",
    r"\bcontrol\b",
    r"\bctrl\b",
    r"\bnegative\s*control\b",
    r"\bneg\s*ctrl\b",
    r"\bvehicle\b",
    r"\bmock\b",
    r"\bdmso\b",
    r"\bmedia\s*only\b",
    r"\bno\s*treatment\b",
    r"\bbaseline\b",
    r"\bparental\b",
    r"\bwt\s*control\b",
]

# Optional: rows that are probably not controls, to reduce false positives.
NON_CONTROL_PATTERNS = [
    r"\bko\b",
    r"\boe\b",
    r"\boverexpression\b",
    r"\btreated\b",
    r"\bdose\b",
    r"\b\d+(\.\d+)?\b",  # often dose-bearing sample names like B01_5, B01_20
]

TEXT_CANDIDATE_COLUMNS = [
    "Sample",
    "sample",
    "Sample Name",
    "Sample_Name",
    "Name",
    "Condition",
    "Group",
    "Treatment",
]

DROP_IF_PRESENT = [
    "uid",
]

MIN_LABELED_ROWS = 20


def read_table(path: Path) -> pd.DataFrame:
    """Read CSV/TSV/XLS/XLSX flexibly."""
    suffix = path.suffix.lower()

    if suffix in [".xlsx", ".xls"]:
        return pd.read_excel(path)

    if suffix in [".tsv", ".txt"]:
        return pd.read_csv(path, sep="\t")

    if suffix == ".csv":
        # Try normal CSV first, then fallback to auto-detect.
        try:
            return pd.read_csv(path)
        except Exception:
            return pd.read_csv(path, sep=None, engine="python")

    # Last resort
    return pd.read_csv(path, sep=None, engine="python")


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Drop junk columns and coerce obvious numerics."""
    df = df.copy()
    for col in DROP_IF_PRESENT:
        if col in df.columns:
            df = df.drop(columns=col)

    # Try to convert numeric-like columns.
    for col in df.columns:
        if df[col].dtype == object:
            converted = pd.to_numeric(df[col], errors="ignore")
            df[col] = converted

    return df


def find_text_column(df: pd.DataFrame) -> Optional[str]:
    """Find the best text column to inspect for control names."""
    for col in TEXT_CANDIDATE_COLUMNS:
        if col in df.columns:
            return col

    # Fallback: choose first object/string column with useful diversity
    object_cols = [c for c in df.columns if df[c].dtype == object]
    if not object_cols:
        return None

    scored = []
    for col in object_cols:
        nunique = df[col].astype(str).nunique(dropna=True)
        scored.append((nunique, col))
    scored.sort(reverse=True)

    return scored[0][1] if scored else None


def label_from_text(text: str) -> Optional[int]:
    """
    Weak supervision:
      1 -> control
      0 -> non-control
      None -> unknown / don't use as labeled training row
    """
    if text is None or pd.isna(text):
        return None

    s = str(text).strip().lower()

    if not s:
        return None

    control_hit = any(re.search(p, s, flags=re.IGNORECASE) for p in CONTROL_PATTERNS)
    non_control_hit = any(re.search(p, s, flags=re.IGNORECASE) for p in NON_CONTROL_PATTERNS)

    if control_hit:
        return 1

    # Conservative: only mark non-control if it looks like a real sample row
    # and does not match control terms.
    if non_control_hit:
        return 0

    return None


def build_training_frame(paths: Iterable[Path]) -> Tuple[pd.DataFrame, str]:
    """
    Load all files, attach source_file, infer text column, and build one frame.
    Returns:
        combined dataframe, chosen text column name
    """
    dfs: List[pd.DataFrame] = []

    for path in paths:
        try:
            df = read_table(path)
            df = normalize_columns(df)
            df["source_file"] = path.name
            dfs.append(df)
        except Exception as exc:
            print(f"[WARN] Skipping {path}: {exc}")

    if not dfs:
        raise ValueError("No readable files found.")

    # Union columns across files
    combined = pd.concat(dfs, ignore_index=True, sort=False)

    text_col = find_text_column(combined)
    if text_col is None:
        raise ValueError(
            "Could not find a usable text column like 'Sample'. "
            "Please add one or update TEXT_CANDIDATE_COLUMNS."
        )

    return combined, text_col


def add_weak_labels(df: pd.DataFrame, text_col: str) -> pd.DataFrame:
    df = df.copy()
    df["_text_for_model"] = df[text_col].astype(str).fillna("")
    df["_weak_label"] = df["_text_for_model"].apply(label_from_text)
    return df


def get_feature_columns(df: pd.DataFrame, text_col: str) -> Tuple[List[str], List[str]]:
    """Return text cols and numeric cols for the model."""
    numeric_cols = [
        c for c in df.columns
        if c not in [text_col, "_text_for_model", "_weak_label", "source_file"]
        and pd.api.types.is_numeric_dtype(df[c])
    ]

    text_cols = ["_text_for_model"]

    return text_cols, numeric_cols


def build_model(text_cols: List[str], numeric_cols: List[str]) -> Pipeline:
    """
    Hybrid model:
    - TF-IDF on sample/control names
    - numeric features scaled/imputed
    - random forest classifier
    """
    text_transformer = Pipeline(steps=[
        ("select", FunctionTransformer(lambda x: x.iloc[:, 0].fillna("").astype(str), validate=False)),
        ("tfidf", TfidfVectorizer(
            lowercase=True,
            ngram_range=(1, 3),
            min_df=1,
            max_features=5000,
            token_pattern=r"(?u)\b[\w\-\.\+]+\b",
        )),
    ])

    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scale", StandardScaler(with_mean=False)),
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ("text", text_transformer, text_cols),
            ("num", numeric_transformer, numeric_cols),
        ],
        remainder="drop",
        sparse_threshold=0.3,
    )

    model = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("clf", RandomForestClassifier(
            n_estimators=300,
            max_depth=None,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            random_state=42,
            n_jobs=-1,
        )),
    ])

    return model


def train_model(df: pd.DataFrame, text_col: str) -> Tuple[Pipeline, dict]:
    df = add_weak_labels(df, text_col)

    labeled = df[df["_weak_label"].notna()].copy()
    labeled["_weak_label"] = labeled["_weak_label"].astype(int)

    if len(labeled) < MIN_LABELED_ROWS:
        raise ValueError(
            f"Only found {len(labeled)} weakly labeled rows. "
            "Add more files or expand CONTROL_PATTERNS / NON_CONTROL_PATTERNS."
        )

    text_cols, numeric_cols = get_feature_columns(df, text_col)
    model = build_model(text_cols, numeric_cols)

    X = labeled[text_cols + numeric_cols]
    y = labeled["_weak_label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
        stratify=y if y.nunique() > 1 else None,
    )

    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)

    metadata = {
        "text_column": text_col,
        "text_features": text_cols,
        "numeric_features": numeric_cols,
        "n_total_rows": int(len(df)),
        "n_labeled_rows": int(len(labeled)),
        "n_controls": int((y == 1).sum()),
        "n_non_controls": int((y == 0).sum()),
        "report": report,
    }

    return model, metadata


def predict_rows(model: Pipeline, metadata: dict, df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    text_col = metadata["text_column"]
    df["_text_for_model"] = df[text_col].astype(str).fillna("")

    needed_numeric = metadata["numeric_features"]
    for col in needed_numeric:
        if col not in df.columns:
            df[col] = np.nan

    X = df[["_text_for_model"] + needed_numeric]

    probs = model.predict_proba(X)
    # Class 1 should be control
    class_order = list(model.named_steps["clf"].classes_)
    if 1 in class_order:
        control_idx = class_order.index(1)
        control_prob = probs[:, control_idx]
    else:
        control_prob = np.zeros(len(df))

    pred = (control_prob >= 0.5).astype(int)

    df["pred_is_control"] = pred
    df["pred_control_probability"] = control_prob

    return df.sort_values("pred_control_probability", ascending=False)


def expand_glob_patterns(patterns: List[str]) -> List[Path]:
    paths: List[Path] = []
    for pattern in patterns:
        for p in glob.glob(pattern):
            path = Path(p)
            if path.is_file():
                paths.append(path)

    # Deduplicate while preserving order
    seen = set()
    deduped: List[Path] = []
    for p in paths:
        if p not in seen:
            deduped.append(p)
            seen.add(p)
    return deduped


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--train-glob",
        nargs="+",
        required=True,
        help="One or more glob patterns for training files, e.g. data/*.csv",
    )
    parser.add_argument(
        "--output-model",
        default="control_detector.joblib",
        help="Path to save trained model bundle",
    )
    parser.add_argument(
        "--predict-file",
        default=None,
        help="Optional file to score after training",
    )
    parser.add_argument(
        "--output-predictions",
        default="predictions.csv",
        help="Where to save predictions if --predict-file is set",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    train_paths = expand_glob_patterns(args.train_glob)
    if not train_paths:
        raise SystemExit("No training files matched.")

    print(f"[INFO] Found {len(train_paths)} training file(s).")

    train_df, text_col = build_training_frame(train_paths)
    print(f"[INFO] Using text column: {text_col}")

    model, metadata = train_model(train_df, text_col)

    bundle = {
        "model": model,
        "metadata": metadata,
        "control_patterns": CONTROL_PATTERNS,
        "non_control_patterns": NON_CONTROL_PATTERNS,
    }
    joblib.dump(bundle, args.output_model)
    print(f"[INFO] Saved model to {args.output_model}")

    print("[INFO] Training summary:")
    print(json.dumps({
        "text_column": metadata["text_column"],
        "n_total_rows": metadata["n_total_rows"],
        "n_labeled_rows": metadata["n_labeled_rows"],
        "n_controls": metadata["n_controls"],
        "n_non_controls": metadata["n_non_controls"],
    }, indent=2))

    print("[INFO] Validation report:")
    print(json.dumps(metadata["report"], indent=2))

    if args.predict_file:
        pred_df = read_table(Path(args.predict_file))
        pred_df = normalize_columns(pred_df)

        scored = predict_rows(model, metadata, pred_df)
        scored.to_csv(args.output_predictions, index=False)
        print(f"[INFO] Saved predictions to {args.output_predictions}")

        # Show a quick preview of top likely controls
        preview_cols = [c for c in [text_col, "pred_is_control", "pred_control_probability"] if c in scored.columns]
        print("\n[INFO] Top likely controls:")
        print(scored[preview_cols].head(20).to_string(index=False))


if __name__ == "__main__":
    main()