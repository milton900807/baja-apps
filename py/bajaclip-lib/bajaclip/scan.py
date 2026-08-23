"""Scan a sequence for RNA-binding-protein footprints.

The model scores a 64-nt window; sliding it across a sequence gives a per-position
binding profile for each RBP (the score is placed at the window centre). This is
the analogue of bajasplice.scan for RBP occupancy, so the same track-layer /
sashimi-style visualisation can be driven from it.

    from bajaclip.scan import load_model, scan_sequence, resolve_rbps
    m = load_model()
    centers, scores = scan_sequence(m, "ACGU...", resolve_rbps(m, "TARDBP"))
"""
from __future__ import annotations

import csv

import numpy as np

from bajaclip.config import resolve_checkpoint, reliable_table

__all__ = ["load_model", "load_reliable", "resolve_rbps", "windows", "scan_sequence"]


def load_model(ckpt=None, device="auto"):
    """Load BajaCLIP from the bundled (or overridden) checkpoint."""
    from bajaclip.model import BajaCLIP
    return BajaCLIP(str(resolve_checkpoint(ckpt)), device=device)


def load_reliable():
    """The set of reliable RBP names (held-out AUROC >= 0.90), upper-cased."""
    path = reliable_table()
    if not path:
        return set()
    with open(path) as f:
        return {r["RBP"].upper() for r in csv.DictReader(f, delimiter="\t")}


def resolve_rbps(model, spec):
    """Resolve an RBP spec to (names, column indices).

    spec: 'all', 'reliable' (default set), or a comma-separated list of names.
    """
    if not spec or str(spec).lower() == "reliable":
        reliable = load_reliable()
        names = [p for p in model.proteins if p.upper() in reliable] or list(model.proteins)
    elif str(spec).lower() == "all":
        names = list(model.proteins)
    else:
        want = [x.strip() for x in str(spec).split(",") if x.strip()]
        names = [w for w in want if w.upper() in model.idx]
    cols = [model.idx[n.upper()] for n in names]
    return names, cols


def windows(seq, w, step):
    """Tiled (start, end, subseq) windows of width w over seq."""
    seq = seq.upper().replace("U", "T")
    if len(seq) < w:
        return [(0, len(seq), seq)]
    starts = list(range(0, len(seq) - w + 1, step))
    if starts[-1] != len(seq) - w:
        starts.append(len(seq) - w)
    return [(s, s + w, seq[s:s + w]) for s in starts]


def scan_sequence(model, seq, cols=None, step=8, batch_size=1024):
    """Per-window RBP scores across a sequence.

    Returns (centers, scores) where centers is an int array of window-centre
    positions (0-based, in the input sequence) and scores is (n_windows, k) for
    the requested RBP columns (all 170 if cols is None).
    """
    wins = windows(seq, model.max_len, max(1, int(step)))
    P = model.score_windows([x[2] for x in wins], batch_size=batch_size)  # (n, 170)
    centers = np.array([(s + e) // 2 for s, e, _ in wins], dtype=np.int64)
    scores = P if cols is None else P[:, cols]
    return centers, scores
