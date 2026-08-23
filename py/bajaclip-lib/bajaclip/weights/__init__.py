"""Trained weights shipped with the package.

The BajaCLIP RNA-binding-protein predictor (170 RBPs, ~7.6 MB) is bundled, so the
model is usable from a bare install with no download and no reference genome —
it scores sequence windows directly.

    bajaclip_predict.v1   sphere-CNN, 64-nt windows -> per-RBP binding probability
"""
from __future__ import annotations

from pathlib import Path

__all__ = ["bundled", "reliable_path", "BUNDLED"]

BUNDLED = {
    "bajaclip_predict.v1": "bajaclip_predict.v1.pt",
}


def bundled(name: str = "bajaclip_predict.v1"):
    """Path to a bundled checkpoint, or None if that name is not shipped."""
    fn = BUNDLED.get(name)
    if fn is None:
        return None
    p = Path(__file__).parent / fn
    return p if p.exists() else None


def reliable_path():
    """Path to the reliable-RBP table (AUROC>=0.90 held-out), or None."""
    p = Path(__file__).parent / "reliable_rbps.tsv"
    return p if p.exists() else None
