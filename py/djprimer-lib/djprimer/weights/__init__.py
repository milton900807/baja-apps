"""Trained model and reference tables shipped with the package.

The djPrimer qPCR assay-success model is bundled together with the per-gene
expression references it needs at inference time, so scoring works from a bare
install with no download and no reference genome.

    djprimer_model.v1     gradient-boosted classifier (primer3 + expression + amplicon)
    expression_gtex       per-gene GTEx tissue expression (median, breadth)
    expression_hpa        per-gene Human Protein Atlas cell-line expression (median)
"""
from __future__ import annotations

from pathlib import Path

__all__ = ["bundled", "expression_path", "BUNDLED", "EXPRESSION"]

BUNDLED = {
    "djprimer_model.v1": "djprimer_model.v1.pkl",
}

EXPRESSION = {
    "gtex": "expression_gtex_per_gene.csv",
    "hpa": "expression_hpa_celline_per_gene.csv",
}


def bundled(name: str = "djprimer_model.v1"):
    """Path to a bundled model checkpoint, or None if that name is not shipped."""
    fn = BUNDLED.get(name)
    if fn is None:
        return None
    p = Path(__file__).parent / fn
    return p if p.exists() else None


def expression_path(kind: str):
    """Path to a bundled per-gene expression table ('gtex' or 'hpa'), or None."""
    fn = EXPRESSION.get(kind)
    if fn is None:
        return None
    p = Path(__file__).parent / fn
    return p if p.exists() else None
