"""Trained weights shipped with the package.

All five checkpoints are bundled (13 MB total), so every model is usable from a
bare install without a data root. They are small because the architectures are
small: dilated CNNs of 0.1-0.7M parameters, not transformers.

    ss_ctx2000    splice sites, per-nucleotide donor/acceptor
    psi_ctx2000   cassette-exon inclusion across 54 GTEx tissues
    altss         competing splice sites, which one is preferred
    rbp           RBP knockdown response from sequence
    rbp_bind      the same, with BajaCLIP predicted binding as an input

Note what `rbp` and `rbp_bind` are for: they reproduce a NEGATIVE result. Per-RBP
AUC is 0.573 and 0.577 against a 0.851 leave-one-out reference, so they are
shipped to make that reproducible, not because they predict well.
"""
from __future__ import annotations

from pathlib import Path

__all__ = ["bundled", "BUNDLED"]

BUNDLED = {
    "ss_ctx2000": "ss_ctx2000.pt",
    "psi_ctx2000": "psi_ctx2000.pt",
    "altss": "altss.pt",
    "rbp": "rbp.pt",
    "rbp_bind": "rbp_bind.pt",
}


def bundled(name: str = "ss_ctx2000") -> Path | None:
    """Path to a bundled checkpoint, or None if that name is not shipped."""
    fn = BUNDLED.get(name)
    if fn is None:
        return None
    p = Path(__file__).parent / fn
    return p if p.exists() else None
