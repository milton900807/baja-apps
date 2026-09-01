"""Trained weights shipped with the package.

    ir_scorer.joblib               gradient-boosted classifier over 20 features
    ir_scorer.json                 features, target definition, held-out metrics
    ir_scorer_calibration.json     score tiers with their measured precision

Fitted on the train and val chromosomes of 186 ENCODE long-read RNA-seq BAMs,
holding out chr1, 3, 5, 7 and 9, which is also BajaSplice's split -- five of the
twenty features are frozen ss_ctx2000 scores, so sharing the split keeps the
whole chain honest.
"""
from __future__ import annotations

import json
from pathlib import Path

__all__ = ["bundled", "metadata", "calibration"]

_HERE = Path(__file__).parent


def bundled(name: str = "ir_scorer"):
    """Path to the bundled model, or None if it is not shipped."""
    p = _HERE / f"{name}.joblib"
    return p if p.exists() else None


def metadata(name: str = "ir_scorer"):
    p = _HERE / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else {}


def calibration(name: str = "ir_scorer"):
    p = _HERE / f"{name}_calibration.json"
    return json.loads(p.read_text()) if p.exists() else {}
