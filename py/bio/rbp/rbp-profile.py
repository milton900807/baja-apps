"""RBP binding profile for a raw sequence, via the bajaclip-lib model.

Slides the 64-nt BajaCLIP window across the sequence and returns a per-position
binding profile for a chosen RNA-binding protein (default TARDBP / TDP-43), so
the client can draw it as a coverage-style track layer — the RBP analogue of the
splicing profile service.

Params (after the EngineMonitor at param(0)):
    param(1) : sequence (A/C/G/T/U/N, transcript 5'->3')
    param(2) : xi — the track-local x of the first base (positions are xi + i)
    param(3) : strand ('1' | '-1'), informational
    param(4) : RBP name (default 'TARDBP'); 'reliable'/'all' pick the max over that set
    param(5) : step (nt between windows, default 8)

Resolves { profile, rbp, n, step, xi, strand, error } where profile is a JSON
array of [position, score] at window centres (position = xi + centre).
"""
import os
import sys
import json

from ion import works


def _reexec_under_venv():
    try:
        import torch      # noqa: F401
        import bajaclip   # noqa: F401
        return
    except Exception:
        pass
    for py in (os.environ.get("BAJACLIP_PYTHON"),
               os.environ.get("BAJASPLICE_PYTHON"),
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3")):
        if py and os.path.exists(py) and \
                os.path.realpath(py) != os.path.realpath(sys.executable):
            os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])


_reexec_under_venv()

# Make the library importable even if it isn't pip-installed in this interpreter.
_LIB = os.path.expanduser("~/baja-apps/py/bajaclip-lib")
if os.path.isdir(_LIB) and _LIB not in sys.path:
    sys.path.insert(0, _LIB)


seq = str(works.param(1) or "").strip().upper()
try:
    xi = int(float(works.param(2) or 0))
except Exception:
    xi = 0
strand = str(works.param(3) or "1")
rbp = str(works.param(4) or "TARDBP").strip() or "TARDBP"
try:
    step = max(1, int(float(works.param(5) or 8)))
except Exception:
    step = 8

# Windows scoring at/above this are called potential binding sites.
SITE_THRESHOLD = 0.5

profile = []
sites = []
n = 0
err = None

if not seq:
    err = "no sequence provided"
else:
    try:
        import numpy as np
        from bajaclip.scan import load_model, scan_sequence, resolve_rbps

        works.msg("Loading RBP model…")
        model = load_model()
        names, cols = resolve_rbps(model, rbp)
        if not cols:
            raise RuntimeError("RBP not in model: " + rbp)

        works.msg("Scanning RBP binding…")
        centers, scores = scan_sequence(model, seq, cols, step=step)
        n = int(len(seq))
        # One score per position: the chosen RBP, or the max over a set.
        col_scores = scores.max(axis=1) if scores.shape[1] > 1 else scores[:, 0]
        for c, s in zip(centers, col_scores):
            profile.append([int(xi + int(c)), round(float(s), 4)])

        # Potential binding sites: threshold the windows, span each to its full
        # width, then merge overlapping windows into contiguous site intervals
        # (keeping the strongest score). Positions are local (xi + i).
        half = int(model.max_len) // 2
        raw = []
        for c, s in zip(centers, col_scores):
            if float(s) >= SITE_THRESHOLD:
                lo = max(0, int(c) - half)
                hi = min(n, int(c) + half)
                raw.append((lo, hi, float(s)))
        raw.sort()
        for lo, hi, s in raw:
            if sites and lo <= sites[-1][1]:            # overlaps the previous site
                sites[-1][1] = max(sites[-1][1], hi)
                sites[-1][2] = max(sites[-1][2], s)
            else:
                sites.append([lo, hi, s])
        sites = [[int(xi + lo), int(xi + hi), round(float(s), 4)] for lo, hi, s in sites]
        works.progress(100)
    except Exception as e:
        err = str(e)

works.resolve({
    "profile": json.dumps(profile),
    "sites": json.dumps(sites),
    "rbp": rbp,
    "n": n,
    "step": step,
    "xi": xi,
    "strand": strand,
    "error": err,
})
