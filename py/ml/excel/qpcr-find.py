import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from ion import works

rows = works.param(1)


def coerce_rows_to_dataframe(value):
    """
    Accept a few table-like forms without hard-coding domain column names:
      - list of dict rows
      - dict with 'rows'
      - single dict (treated as one row)
      - JSON string of any of the above
    """
    if isinstance(value, str):
        parsed = json.loads(value)
        return coerce_rows_to_dataframe(parsed)

    if isinstance(value, list):
        return pd.DataFrame(value)

    if isinstance(value, dict):
        if "rows" in value and isinstance(value["rows"], list):
            return pd.DataFrame(value["rows"])
        return pd.DataFrame([value])

    raise ValueError("Expected table input as list[dict], dict, or JSON string")


def infer_feature_groups(df):
    """
    Fallback only when model metadata is unavailable.
    Infer text vs numeric columns from the incoming table.
    """
    text_columns = []
    numeric_columns = []

    for col in df.columns:
        series = df[col]

        if pd.api.types.is_numeric_dtype(series):
            numeric_columns.append(col)
            continue

        # Try numeric coercion on object-like columns
        coerced = pd.to_numeric(series, errors="coerce")
        numeric_fraction = coerced.notna().mean() if len(series) else 0.0

        if numeric_fraction >= 0.8:
            numeric_columns.append(col)
        else:
            text_columns.append(col)

    return text_columns, numeric_columns


def align_to_model_schema(df, metadata):
    """
    Build exactly the columns the model expects, without hard-coded semantic names.
    """
    df = df.copy()

    text_columns = metadata.get("text_columns")
    numeric_columns = metadata.get("numeric_columns")

    # Fallback if metadata is incomplete
    if not text_columns and not numeric_columns:
        text_columns, numeric_columns = infer_feature_groups(df)
    else:
        text_columns = list(text_columns or [])
        numeric_columns = list(numeric_columns or [])

    # Ensure required columns exist
    for col in text_columns:
        if col not in df.columns:
            df[col] = ""

    for col in numeric_columns:
        if col not in df.columns:
            df[col] = np.nan

    # Normalize types
    for col in text_columns:
        df[col] = df[col].fillna("").astype(str)

    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    feature_columns = text_columns + numeric_columns
    return df, feature_columns, text_columns, numeric_columns


def score_rows(table_input):
    df = coerce_rows_to_dataframe(table_input)

    base_dir = Path(__file__).resolve().parent
    model_path = base_dir / "synthetic_control_detector.joblib"

    bundle = joblib.load(model_path)

    # Support either bundle format:
    # 1) {"model": ..., "metadata": ...}
    # 2) raw model object only
    if isinstance(bundle, dict) and "model" in bundle:
        model = bundle["model"]
        metadata = bundle.get("metadata", {})
    else:
        model = bundle
        metadata = {}

    prepared_df, feature_columns, text_columns, numeric_columns = align_to_model_schema(df, metadata)

    probabilities = model.predict_proba(prepared_df[feature_columns])[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    result_df = df.copy()
    result_df["pred_is_control"] = predictions
    result_df["pred_control_probability"] = probabilities

    result_df = result_df.sort_values(
        by="pred_control_probability",
        ascending=False
    ).reset_index(drop=True)

    return {
        "model_path": str(model_path),
        "rows_scored": int(len(result_df)),
        "predicted_controls": int(result_df["pred_is_control"].sum()),
        "feature_columns_used": feature_columns,
        "text_columns_used": text_columns,
        "numeric_columns_used": numeric_columns,
        "results": result_df.to_dict(orient="records"),
    }


result = score_rows(rows)

works.resolve(json.dumps(result, indent=4, default=str))