"""bajaclip - RNA-binding-protein footprint prediction from sequence.

A sphere-CNN scores 64-nt windows for 170 RBPs; sliding the window gives a
per-position binding profile that drives the same track-layer / sashimi
visualisation as bajasplice.

Quick start:

    from bajaclip.scan import load_model, scan_sequence, resolve_rbps
    m = load_model()                                  # bundled weights
    names, cols = resolve_rbps(m, "TARDBP")
    centers, scores = scan_sequence(m, "ACGU...", cols)
"""
from bajaclip.model import BajaCLIP
from bajaclip.config import resolve_checkpoint, reliable_table

__version__ = "0.1.0"
__all__ = ["BajaCLIP", "resolve_checkpoint", "reliable_table", "__version__"]
