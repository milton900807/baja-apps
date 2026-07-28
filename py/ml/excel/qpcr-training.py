#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

# ------------------------------------------------------------
# Reproducibility
# ------------------------------------------------------------
GLOBAL_SEED = 42
random.seed(GLOBAL_SEED)
np.random.seed(GLOBAL_SEED)

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
TEXT_COL = "Sample"
TARGET_COL = "Synthetic_Is_Control"

NUMERIC_COLS = [
    "Cq_exclusion",
    "Cq_gen_ab",
    "dCq_target",
    "ddCq_target",
    "dCq_ref",
    "ddCq_ref",
    "Cq_housekeeper",
    "Expression_Ratio",
    "Viability_Index",
    "Treatment_Strength",
    "Delta_Signal",
    "ZScore_Like",
    "_Control_excl",
    "Signal_Strength",
    "Plate_Bias",
    "Global_Shift",
]

TEXT_AUX_COLS = [
    "Target_Gene",
    "Well_Position",
]

ALL_TEXT_MODEL_COLS = [TEXT_COL, *TEXT_AUX_COLS]

CONTROL_NAMES = [
    "UTC",
    "untreated",
    "untreat",
    "control",
    "ctrl",
    "negative_control",
    "neg_ctrl",
    "vehicle",
    "mock",
    "DMSO",
    "media_only",
    "baseline",
    "parental",
    "WT_control",
    "unexposed",
    "no_treatment",
]

NONCONTROL_PREFIXES = [
    "B01", "B02", "B03", "B04", "C01", "C02", "D01", "E01",
    "KO", "OE", "TRT", "CMPD", "CLONE", "CELL", "MUT", "SG",
    "siRNA", "CRISPR", "DOSE", "EXP", "PTB", "COND"
]

NONCONTROL_SUFFIXES = [
    "0.039", "0.078", "0.156", "0.312", "0.625", "1.25", "2.5",
    "5", "10", "20", "40", "80", "160",
    "alpha", "beta", "gamma",
    "low", "mid", "high",
    "24h", "48h", "72h",
    "clone1", "clone2", "clone3",
]

GENES = [
    "GAPDH", "ACTB", "TP53", "MYC", "BRAF", "EGFR", "CDK4",
    "CCND1", "STAT3", "KRAS", "MAPK1", "JUN"
]

# ------------------------------------------------------------
# Synthetic row generation
# ------------------------------------------------------------

def random_well_position() -> str:
    row = random.choice(list("ABCDEFGHIJKLMNOP"))
    col = random.randint(1, 24)
    return f"{row}{col}"


def maybe_corrupt_text(s: str) -> str:
    out = s

    case_mode = random.choice(["orig", "lower", "upper", "mixed"])
    if case_mode == "lower":
        out = out.lower()
    elif case_mode == "upper":
        out = out.upper()
    elif case_mode == "mixed":
        out = "".join(
            ch.upper() if random.random() < 0.5 else ch.lower()
            for ch in out
        )

    if random.random() < 0.3:
        out = out.replace("_", random.choice(["-", " ", "__"]))

    if len(out) > 5 and random.random() < 0.12:
        i = random.randint(1, len(out) - 2)
        out = out[:i] + out[i + 1:]

    if random.random() < 0.25:
        out += random.choice(["", "_v2", "_x", "_test", "_run1", "_r1", "_setA"])

    return out


def generate_control_name() -> str:
    base = random.choice(CONTROL_NAMES)
    deco = random.choice([
        "",
        "_rep1", "_rep2", "_rep3",
        "_A", "_B", "_C",
        "-1", "-2", "-3",
        "_plate1", "_plate2",
        "_day1", "_day2",
        "_batchA", "_batchB",
    ])
    return maybe_corrupt_text(f"{base}{deco}")


def generate_noncontrol_name() -> str:
    prefix = random.choice(NONCONTROL_PREFIXES)
    suffix = random.choice(NONCONTROL_SUFFIXES)
    sep = random.choice(["_", "-", " "])
    stem = f"{prefix}{sep}{suffix}"

    if random.random() < 0.35:
        stem += random.choice([
            "_rep1", "_rep2", "_24h", "_48h", "_A", "_B",
            "_DMSO+drug", "_KO", "_OE", "_stim"
        ])

    return maybe_corrupt_text(stem)


def generate_row(
    is_control: int,
    dataset_id: int,
    row_id: int,
    plate_bias: float,
    global_shift: float
) -> Dict:
    sample_name = generate_control_name() if is_control else generate_noncontrol_name()
    well = random_well_position()

    batch_effect = np.random.normal(0, 0.35)
    row_col_effect = np.random.normal(0, 0.25)

    if is_control:
        cq_exclusion = np.random.normal(26.5 + global_shift + plate_bias, 1.4)
        cq_gen_ab = np.random.normal(24.8 + global_shift + batch_effect, 1.2)
        dcq_target = np.random.normal(1.8 + row_col_effect, 0.9)
        ddcq_target = np.random.normal(0.15 + batch_effect, 0.7)
        expr_ratio = np.random.normal(1.0, 0.25)
        viability = np.random.normal(0.95, 0.05)
        treatment_strength = np.random.normal(0.05, 0.08)
    else:
        cq_exclusion = np.random.normal(28.6 + global_shift + plate_bias, 2.1)
        cq_gen_ab = np.random.normal(25.9 + global_shift + batch_effect, 1.8)
        dcq_target = np.random.normal(3.8 + row_col_effect, 1.6)
        ddcq_target = np.random.normal(1.4 + batch_effect, 1.25)
        expr_ratio = np.random.normal(0.65, 0.35)
        viability = np.random.normal(0.77, 0.15)
        treatment_strength = np.random.normal(0.85, 0.35)

    if random.random() < 0.06:
        cq_exclusion += np.random.normal(2.0, 1.0)
        ddcq_target += np.random.normal(1.2, 0.6)
        expr_ratio -= np.random.normal(0.2, 0.1)

    if random.random() < 0.04:
        cq_exclusion -= np.random.normal(1.5, 0.8)
        ddcq_target -= np.random.normal(1.0, 0.5)
        expr_ratio += np.random.normal(0.25, 0.15)

    dcq_ref = np.random.normal(2.2 + 0.3 * global_shift, 0.9)
    ddcq_ref = dcq_ref - np.random.normal(1.1, 0.5)
    cq_housekeeper = cq_gen_ab + np.random.normal(0.5, 0.8)
    delta_signal = np.random.normal((1.0 if is_control else -0.8), 0.7)
    zscore_like = np.random.normal((-0.2 if is_control else 1.1), 0.9)
    control_excl = np.random.normal((0.12 if is_control else 0.85), 0.25)
    signal_strength = np.random.normal((1.05 if is_control else 0.72), 0.18)

    expr_ratio = float(np.clip(expr_ratio, 0.01, 3.0))
    viability = float(np.clip(viability, 0.0, 1.2))
    treatment_strength = float(np.clip(treatment_strength, 0.0, 2.5))
    control_excl = float(np.clip(control_excl, 0.0, 2.0))
    signal_strength = float(np.clip(signal_strength, 0.0, 2.0))

    row = {
        "Dataset_ID": dataset_id,
        "Synthetic_Row_ID": row_id,
        "Well": row_id + 1,
        "Well_Position": well,
        "Sample": sample_name,
        "Target_Gene": random.choice(GENES),
        "Cq_exclusion": cq_exclusion,
        "Cq_gen_ab": cq_gen_ab,
        "dCq_target": dcq_target,
        "ddCq_target": ddcq_target,
        "dCq_ref": dcq_ref,
        "ddCq_ref": ddcq_ref,
        "Cq_housekeeper": cq_housekeeper,
        "Expression_Ratio": expr_ratio,
        "Viability_Index": viability,
        "Treatment_Strength": treatment_strength,
        "Delta_Signal": delta_signal,
        "ZScore_Like": zscore_like,
        "_Control_excl": control_excl,
        "Signal_Strength": signal_strength,
        "Plate_Bias": plate_bias,
        "Global_Shift": global_shift,
        TARGET_COL: is_control,
    }

    for col in [
        "Cq_exclusion", "Cq_gen_ab", "dCq_target", "ddCq_target",
        "dCq_ref", "ddCq_ref", "Cq_housekeeper", "Expression_Ratio",
        "Viability_Index", "Treatment_Strength", "Delta_Signal",
        "ZScore_Like", "_Control_excl", "Signal_Strength"
    ]:
        if random.random() < 0.04:
            row[col] = np.nan

    if random.random() < 0.01:
        row["Sample"] = ""
    elif random.random() < 0.01:
        row["Sample"] = None

    return row


def generate_dataset(dataset_id: int, min_rows: int, max_rows: int) -> pd.DataFrame:
    n_rows = random.randint(min_rows, max_rows)
    control_rate = np.clip(np.random.beta(2.2, 6.5), 0.03, 0.45)
    global_shift = np.random.normal(0, 0.7)
    plate_bias = np.random.normal(0, 0.5)

    rows = []
    for i in range(n_rows):
        is_control = 1 if random.random() < control_rate else 0
        rows.append(
            generate_row(
                is_control=is_control,
                dataset_id=dataset_id,
                row_id=i,
                plate_bias=plate_bias,
                global_shift=global_shift,
            )
        )

    return pd.DataFrame(rows)


def generate_synthetic_corpus(n_datasets: int, min_rows: int, max_rows: int) -> pd.DataFrame:
    parts = []
    for ds_id in range(n_datasets):
        if ds_id % 250 == 0:
            print(f"[INFO] Generating synthetic dataset {ds_id + 1}/{n_datasets}")
        parts.append(generate_dataset(ds_id, min_rows, max_rows))
    return pd.concat(parts, ignore_index=True)

# ------------------------------------------------------------
# Model building
# ------------------------------------------------------------

def combine_text_columns(df: pd.DataFrame) -> pd.Series:
    parts = []
    for col in ALL_TEXT_MODEL_COLS:
        if col in df.columns:
            parts.append(df[col].fillna("").astype(str))
        else:
            parts.append(pd.Series([""] * len(df), index=df.index))

    combined = parts[0]
    for p in parts[1:]:
        combined = combined + " " + p
    return combined.str.strip()


def build_pipeline() -> Pipeline:
    text_transformer = Pipeline(steps=[
        (
            "selector",
            FunctionTransformer(text_selector, validate=False)
        ),
        (
            "tfidf",
            TfidfVectorizer(
                lowercase=True,
                ngram_range=(1, 2),
                min_df=2,
                max_features=10000,
                token_pattern=r"(?u)\b[\w\-\.\+]+\b",
                dtype=np.float32,
            )
        ),
    ])
        
    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
        ("scale", StandardScaler(with_mean=False)),
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ("text", text_transformer, ALL_TEXT_MODEL_COLS),
            ("num", numeric_transformer, NUMERIC_COLS),
        ],
        remainder="drop",
        sparse_threshold=1.0,
    )

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("clf", SGDClassifier(
            loss="log_loss",
            penalty="l2",
            alpha=1e-4,
            max_iter=2000,
            tol=1e-3,
            random_state=GLOBAL_SEED,
            class_weight="balanced",
        )),
    ])

    return pipeline

# ------------------------------------------------------------
# Real-file reading
# ------------------------------------------------------------

def read_table(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()

    if suffix in [".xlsx", ".xls"]:
        return pd.read_excel(path)

    if suffix in [".tsv", ".txt"]:
        try:
            return pd.read_csv(path, sep="\t")
        except Exception:
            return pd.read_csv(path, sep=None, engine="python")

    if suffix == ".csv":
        try:
            return pd.read_csv(path)
        except Exception:
            return pd.read_csv(path, sep=None, engine="python")

    return pd.read_csv(path, sep=None, engine="python")


def normalize_real_file(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    rename_map = {}
    if "Sample" not in df.columns:
        for alt in ["sample", "Sample Name", "Sample_Name", "Name", "Condition", "Group"]:
            if alt in df.columns:
                rename_map[alt] = "Sample"
                break

    if "Well_Position" not in df.columns:
        for alt in ["Well Position", "well_position", "Position"]:
            if alt in df.columns:
                rename_map[alt] = "Well_Position"
                break

    df = df.rename(columns=rename_map)

    for col in ALL_TEXT_MODEL_COLS:
        if col not in df.columns:
            df[col] = ""

    for col in NUMERIC_COLS:
        if col not in df.columns:
            df[col] = np.nan
        df[col] = pd.to_numeric(df[col], errors="coerce").astype(np.float32)

    return df

# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n-datasets", type=int, default=3000)
    parser.add_argument("--min-rows", type=int, default=96)
    parser.add_argument("--max-rows", type=int, default=192)
    parser.add_argument("--output-model", type=str, default="synthetic_control_detector.joblib")
    parser.add_argument("--output-synthetic-csv", type=str, default=None)
    parser.add_argument("--predict-file", type=str, default=None)
    parser.add_argument("--output-predictions", type=str, default="predictions.csv")
    return parser.parse_args()

def text_selector(X):
    return combine_text_columns(X)
def main() -> None:
    args = parse_args()

    print("[INFO] Starting synthetic corpus generation")
    synthetic_df = generate_synthetic_corpus(
        n_datasets=args.n_datasets,
        min_rows=args.min_rows,
        max_rows=args.max_rows,
    )

    print(f"[INFO] Synthetic rows generated: {len(synthetic_df):,}")
    print(f"[INFO] Control prevalence: {synthetic_df[TARGET_COL].mean():.4f}")

    for col in NUMERIC_COLS:
        synthetic_df[col] = pd.to_numeric(synthetic_df[col], errors="coerce").astype(np.float32)

    synthetic_df[TARGET_COL] = synthetic_df[TARGET_COL].astype(np.int8)

    mem_gb = synthetic_df.memory_usage(deep=True).sum() / (1024 ** 3)
    print(f"[INFO] DataFrame memory usage before fit: {mem_gb:.3f} GiB")

    if args.output_synthetic_csv:
        synthetic_df.to_csv(args.output_synthetic_csv, index=False)
        print(f"[INFO] Saved synthetic corpus to {args.output_synthetic_csv}")

    X = synthetic_df[ALL_TEXT_MODEL_COLS + NUMERIC_COLS]
    y = synthetic_df[TARGET_COL]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=GLOBAL_SEED,
        stratify=y,
    )

    pipeline = build_pipeline()
    print(pipeline)

    print("[INFO] Training model on synthetic data")
    pipeline.fit(X_train, y_train)

    print("[INFO] Evaluating model")
    pred = pipeline.predict(X_test)
    prob = pipeline.predict_proba(X_test)[:, 1]

    report = classification_report(y_test, pred, output_dict=True, zero_division=0)
    auc = roc_auc_score(y_test, prob)

    metadata = {
        "seed": GLOBAL_SEED,
        "n_datasets": args.n_datasets,
        "min_rows": args.min_rows,
        "max_rows": args.max_rows,
        "n_total_rows": int(len(synthetic_df)),
        "control_rate": float(synthetic_df[TARGET_COL].mean()),
        "text_columns": ALL_TEXT_MODEL_COLS,
        "numeric_columns": NUMERIC_COLS,
        "auc": float(auc),
        "report": report,
    }

    bundle = {
        "model": pipeline,
        "metadata": metadata,
    }

    joblib.dump(bundle, args.output_model)
    print(f"[INFO] Saved model bundle to {args.output_model}")

    print("[INFO] Training summary:")
    print(json.dumps({
        "n_total_rows": metadata["n_total_rows"],
        "control_rate": metadata["control_rate"],
        "auc": metadata["auc"],
    }, indent=2))

    print("[INFO] Classification report:")
    print(json.dumps(report, indent=2))

    if args.predict_file:
        print(f"[INFO] Scoring real file: {args.predict_file}")
        real_df = read_table(Path(args.predict_file))
        real_df = normalize_real_file(real_df)

        probs = pipeline.predict_proba(real_df[ALL_TEXT_MODEL_COLS + NUMERIC_COLS])[:, 1]
        preds = (probs >= 0.5).astype(np.int8)

        scored = real_df.copy()
        scored["pred_is_control"] = preds
        scored["pred_control_probability"] = probs
        scored = scored.sort_values("pred_control_probability", ascending=False)

        scored.to_csv(args.output_predictions, index=False)
        print(f"[INFO] Saved predictions to {args.output_predictions}")

        preview_cols = [c for c in ["Sample", "Well_Position", "pred_is_control", "pred_control_probability"] if c in scored.columns]
        print("[INFO] Top likely control rows:")
        print(scored[preview_cols].head(25).to_string(index=False))


if __name__ == "__main__":
    main()