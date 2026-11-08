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
array of [position, score] at window centers (position = xi + center).
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
# 'specificity' (default) ranks the chosen head against the other 169 at each window;
# 'raw' restores the old absolute-threshold behaviour.
mode = str(works.param(6) or "specificity").strip().lower() or "specificity"

# WHY THE RAW SCORE IS NOT USED DIRECTLY. The checkpoint's own training_note says
# "Final balanced": the model was trained on a balanced positive/negative set, so its
# sigmoid is centred for a 50/50 prior and means nothing thresholded against transcript
# sequence, which is overwhelmingly negative. Worse, the heads inflate TOGETHER on
# GC-rich sequence: on random 70% GC windows 157 of the 170 heads sit above 0.9 and 122
# above 0.99, while on uniform sequence none do. A GC-rich transcript such as MAPK8IP3
# pins every head near 1 along its whole length, and the raw score ranks GC-rich
# background ABOVE a planted (UG)n repeat, the canonical TDP-43 site.
#
# That inflation is common mode, so it cancels when a head is compared with the other
# heads at the SAME window, and all 170 come out of one forward pass so it is free.
# Measured on a GC-rich background with a planted (UG)n site: the old rule called the
# whole 1,200 nt a binding site whether or not a site was there; this one calls nothing
# when there is none and a single 136 nt interval on the site when there is.
SITE_RANK = 0.99
# A floor on the raw score, so nothing is called where no head scores at all.
RAW_FLOOR = 0.5
# Kept for mode='raw', which restores the old behaviour.
SITE_THRESHOLD = 0.5

profile = []
sites = []
per_rbp = {}
per_profile = {}
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
        # cols=None scores every head: the specificity measure needs them all, and it is
        # the same forward pass either way. ONE scan serves every selected protein.
        centers, allscores = scan_sequence(model, seq, None, step=step)
        n = int(len(seq))
        nheads = int(allscores.shape[1])
        half = int(model.max_len) // 2

        def call_sites(col):
            """(profile, sites) for one head, in local coordinates."""
            s = allscores[:, col]
            # Specificity: the fraction of the other heads this one beats at the same
            # window. Bounded 0..1, so it draws as a coverage layer unchanged.
            r = (allscores < s[:, None]).sum(axis=1) / max(1, nheads - 1)
            prof = [[int(xi + int(c)), round(float(sv if mode == "raw" else rv), 4),
                     round(float(sv), 4)] for c, sv, rv in zip(centers, s, r)]
            hits = []
            for c, sv, rv in zip(centers, s, r):
                ok = (float(sv) >= SITE_THRESHOLD) if mode == "raw" else (
                    float(rv) >= SITE_RANK and float(sv) >= RAW_FLOOR)
                if ok:
                    hits.append((max(0, int(c) - half), min(n, int(c) + half),
                                 float(sv if mode == "raw" else rv)))
            hits.sort()
            out = []
            for lo, hi, sv in hits:
                if out and lo <= out[-1][1]:            # overlaps the previous site
                    out[-1][1] = max(out[-1][1], hi)
                    out[-1][2] = max(out[-1][2], sv)
                else:
                    out.append([lo, hi, sv])
            return prof, [[int(xi + lo), int(xi + hi), round(float(sv), 4)]
                          for lo, hi, sv in out]

        # Per protein, so several can be picked at once and drawn as separate layers.
        for nm, col in zip(names, cols):
            pr, st = call_sites(col)
            per_rbp[nm] = st
            per_profile[nm] = pr

        # Back-compatible single answer: the first selected protein, or the strongest
        # when a set ('reliable' / 'all') was asked for.
        best = names[0] if len(names) == 1 else max(
            names, key=lambda k: max([x[2] for x in per_rbp[k]] or [0.0]))
        profile = per_profile[best]
        sites = per_rbp[best]
        works.progress(100)
    except Exception as e:
        err = str(e)

works.resolve({
    "profile": json.dumps(profile),
    "sites": json.dumps(sites),
    # {name: [[start, end, score], ...]} for every selected protein, so the UI can draw
    # one layer each from a single scan.
    "sitesByRbp": json.dumps(per_rbp),
    "rbp": rbp,
    "n": n,
    "step": step,
    "xi": xi,
    "strand": strand,
    "error": err,
})
