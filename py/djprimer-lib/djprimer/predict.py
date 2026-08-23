"""Score a candidate qPCR assay for its probability of success.

    from djprimer import load_model, score
    m = load_model()                       # bundled model + expression tables
    score("GAPDH", "CAACAGTGGCAACACCTTGTG", "TGGGTTGGTCATGCTCACTAG", m)
    # {'gene': 'GAPDH', 'probability': 0.90, 'expression_known': True, 'design_only': False}

The probability is, by design, dominated by the target's expression: a clean
primer for a gene that is silent in the panel scores low, which is the correct
answer. Genes absent from the expression references fall back to a design-only
estimate (flagged), which is far weaker.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from djprimer.config import resolve_expression, resolve_model
from djprimer.features import primer3_features

__all__ = ["DJPrimer", "load_model", "score", "score_batch"]


class DJPrimer:
    """Loaded djPrimer model plus the per-gene expression references it needs."""

    def __init__(self, model, features, gmed, gbreadth, cmed):
        self.model = model
        self.features = features
        self._gmed = gmed
        self._gbreadth = gbreadth
        self._cmed = cmed

    def _expression(self, gene: str) -> dict:
        g = (gene or "").upper()
        return dict(gmed=self._gmed.get(g, np.nan),
                    gbreadth=self._gbreadth.get(g, np.nan),
                    cmed=self._cmed.get(g, np.nan))

    def score(self, gene: str, forward: str, reverse: str) -> dict:
        expr = self._expression(gene)
        feats = {**primer3_features(forward, reverse), **expr}
        x = np.array([[feats.get(c, np.nan) for c in self.features]], dtype=float)
        prob = float(self.model.predict_proba(x)[0, 1])
        known = not (np.isnan(expr["gmed"]) and np.isnan(expr["cmed"]))
        return dict(gene=(gene or "").upper(), probability=round(prob, 4),
                    expression_known=known, design_only=not known)

    def score_batch(self, assays) -> list:
        """assays: iterable of (gene, forward, reverse) tuples or dicts."""
        out = []
        for a in assays:
            if isinstance(a, dict):
                out.append(self.score(a["gene"], a["forward"], a["reverse"]))
            else:
                out.append(self.score(*a))
        return out


def load_model(model=None, gtex=None, hpa=None) -> DJPrimer:
    """Load the bundled (or overridden) model and expression tables."""
    import joblib
    bundle = joblib.load(resolve_model(model))
    g = pd.read_csv(resolve_expression("gtex", gtex)).set_index("gene")
    h = pd.read_csv(resolve_expression("hpa", hpa)).set_index("gene")
    return DJPrimer(model=bundle["model"], features=bundle["features"],
                    gmed=g["gmed"].to_dict(), gbreadth=g["gbreadth"].to_dict(),
                    cmed=h["cmed"].to_dict())


def score(gene: str, forward: str, reverse: str, model: DJPrimer = None) -> dict:
    """Convenience one-shot scorer. Pass a loaded model to avoid reloading."""
    m = model or load_model()
    return m.score(gene, forward, reverse)


def score_batch(assays, model: DJPrimer = None) -> list:
    m = model or load_model()
    return m.score_batch(assays)
