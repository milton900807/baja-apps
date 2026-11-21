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


def bundled(name: str = "ss_ctx2000", species: str | None = None) -> Path | None:
    """Path to a bundled checkpoint, or None if that name is not shipped.

    A BUNDLED WEIGHT BELONGS TO ONE SPECIES. Mouse checkpoints carry the
    species' file prefix (mm_ss_ctx2000.pt), so a mouse run that has no mouse
    model gets None and an error that says to train one, rather than the human
    file under the same name. Pass species="human" to ask for the human weight
    on purpose, which is what the zero-shot control does.
    """
    from bajasplice.config import SPECIES, species as _active
    sp = SPECIES[species] if species else _active()
    fn = BUNDLED.get(name)
    if fn is None:
        return None
    p = Path(__file__).parent / (sp.weight_prefix + fn)
    return p if p.exists() else None
