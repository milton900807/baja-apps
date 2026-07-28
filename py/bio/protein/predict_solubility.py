#!/usr/bin/env python3
"""
predict_solubility_ion.py

Predict protein solubility propensity from a peptide/protein sequence
using a hardcoded model path and Ion Works inputs/outputs.

Expected Ion Works params:
1 -> protein sequence

Hardcoded model path:
solubility_model_lgbm/best_model.joblib

Returns:
{
  "result": [
    {
      "name": "query",
      "sequence": "...",
      "sequence_length": 123,
      "predicted_label": 1,
      "solubility_propensity": 0.8421,
      "propensity_class": "high"
    }
  ]
}
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List

import joblib
import pandas as pd
from ion import works

CLEAN_AA_RE = re.compile(r"[^ACDEFGHIKLMNPQRSTVWY]", re.IGNORECASE)
HARDCODED_MODEL_RELATIVE_PATH = "solubility_model_lgbm/best_model.joblib"


def normalize_sequence(seq: str) -> str:
    seq = str(seq).strip().upper()
    seq = seq.replace("*", "")
    seq = CLEAN_AA_RE.sub("", seq)
    return seq


def aa_composition(seq: str) -> Dict[str, float]:
    aa_order = "ACDEFGHIKLMNPQRSTVWY"
    n = max(len(seq), 1)
    return {f"frac_{aa}": seq.count(aa) / n for aa in aa_order}


def basic_sequence_features(seq: str) -> Dict[str, float]:
    n = len(seq)
    hydrophobic = set("AILMFWVYC")
    positive = set("KRH")
    negative = set("DE")
    polar = set("STNQ")
    gly_pro = set("GP")

    feats = {
        "length": n,
        "frac_hydrophobic": sum(c in hydrophobic for c in seq) / max(n, 1),
        "frac_positive": sum(c in positive for c in seq) / max(n, 1),
        "frac_negative": sum(c in negative for c in seq) / max(n, 1),
        "frac_polar": sum(c in polar for c in seq) / max(n, 1),
        "frac_gp": sum(c in gly_pro for c in seq) / max(n, 1),
        "net_charge_proxy": (
            sum(c in positive for c in seq) - sum(c in negative for c in seq)
        ),
        "aromaticity_proxy": sum(c in set("FWY") for c in seq) / max(n, 1),
    }
    feats.update(aa_composition(seq))
    return feats


def build_feature_row(seq: str, name: str = "query") -> Dict:
    seq = normalize_sequence(seq)
    row = {
        "name": name,
        "sequence": seq,
    }
    row.update(basic_sequence_features(seq))
    return row


def classify_propensity(prob: float) -> str:
    if prob >= 0.8:
        return "high"
    if prob >= 0.6:
        return "moderate"
    if prob >= 0.4:
        return "borderline"
    if prob >= 0.2:
        return "low"
    return "very_low"


def run_predictions(model, rows: List[Dict]) -> pd.DataFrame:
    X = pd.DataFrame(rows)

    probs = model.predict_proba(X)[:, 1]
    preds = model.predict(X)

    out = X[["name", "sequence"]].copy()
    out["sequence_length"] = out["sequence"].str.len()
    # out["predicted_label"] = preds.astype(int)
    out["solubility_propensity"] = probs
    out["propensity_class"] = [classify_propensity(p) for p in probs]

    return out


def resolve_model_path() -> Path:
    script_dir = Path(__file__).resolve().parent
    model_path = (script_dir / HARDCODED_MODEL_RELATIVE_PATH).resolve()
    return model_path


def main() -> None:
    try:
        sequence_raw = works.param(1)

        if not sequence_raw:
            works.resolve({
                "error": "Missing required param 1: protein sequence"
            })
            return

        seq = normalize_sequence(str(sequence_raw))
        if len(seq) < 20:
            works.resolve({
                "error": "Sequence is too short after cleaning; need at least ~20 residues"
            })
            return

        model_path = resolve_model_path()
        if not model_path.exists():
            works.resolve({
                "error": f"Model file not found: {model_path}"
            })
            return

        model = joblib.load(model_path)

        rows = [build_feature_row(seq, name="query")]
        results = run_predictions(model, rows)

        works.resolve({
            "result": results.to_dict(orient="records")
        })

    except Exception as e:
        works.resolve({
            "error": str(e)
        })


if __name__ == "__main__":
    main()