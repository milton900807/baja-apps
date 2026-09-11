"""Cis-regulatory profile around one splice site, via bajasplice-lib.

Scrambles each window of sequence around a chosen donor or acceptor and reports
how far the model's confidence in that site moves. Positive impact means the
native sequence in that window SUPPORTS the site; negative means it SUPPRESSES
it. The scramble preserves dinucleotide composition, so the drop is attributable
to the arrangement of bases rather than to GC content having changed, and the
score is measured in log-odds because probability saturates at a confident site
(see bajasplice/cis.py).

The client has a track sequence and a track x, not a chromosome and a
coordinate, so this wraps bajasplice.cis.cis_profile_sequence and maps every
window back to a track-local [x0, x1) interval the editor can draw.

Params (after the EngineMonitor at param(0)):
    param(1) : sequence (A/C/G/T/N), the track's own string
    param(2) : xi — the track-local x of the first base (positions are xi + i)
    param(3) : strand ('1' | '-1')
    param(4) : site — track x of the splice site to profile
    param(5) : which ('acceptor' | 'donor')
    param(6) : max_dist in nt each side (clamped to the receptive field)
    param(7) : orientation of a MINUS-strand track's string ('plus' | 'coding'),
               decided by the launcher exactly as for splicing-profile.py
    param(8) : bin_size (window width, default 50)
    param(9) : step (nt between windows, default 25)
    param(10): n_shuffle (scrambles per window, default 6)

Resolves { windows, ref, ref_prob, receptive_field, max_dist, bin_size, step,
           which, site, xi, strand, n, context, error }.
Each window is [x0, x1, impact, z, covered] with x0/x1 in track coordinates.
"""
import os
import sys
import json

from ion import works


def _reexec_under_venv():
    try:
        import numpy       # noqa: F401
        import torch       # noqa: F401
        import bajasplice  # noqa: F401
        return
    except Exception:
        pass
    if os.environ.get("BAJASPLICE_REEXEC") == "1":
        return
    for py in (os.environ.get("BAJASPLICE_PYTHON"),
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3"),
               "/opt/venv/bin/python3"):
        if not py or not os.path.exists(py):
            continue
        prefix = os.path.dirname(os.path.dirname(os.path.abspath(py)))
        if os.path.abspath(prefix) == os.path.abspath(sys.prefix):
            continue
        os.environ["BAJASPLICE_REEXEC"] = "1"
        os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])


_reexec_under_venv()

_LIB = os.path.expanduser("~/baja-apps/py/bajasplice-lib")
if os.path.isdir(_LIB) and _LIB not in sys.path:
    sys.path.insert(0, _LIB)


def _int(v, default):
    try:
        return int(float(v))
    except Exception:
        return default


seq = str(works.param(1) or "").strip().upper()
xi = _int(works.param(2), 0)
strand = str(works.param(3) or "1")
site_x = _int(works.param(4), 0)
which = str(works.param(5) or "acceptor").strip().lower()
if which not in ("acceptor", "donor"):
    which = "acceptor"
max_dist = _int(works.param(6), 500)
orientation = str(works.param(7) or "plus").strip().lower()
if orientation not in ("plus", "coding"):
    orientation = "plus"
bin_size = max(4, _int(works.param(8), 50))
step = max(1, _int(works.param(9), 25))
n_shuffle = max(2, _int(works.param(10), 6))

minus = strand.strip() in ("-1", "-")

windows = []
ref = None
ref_prob = None
rf = None
n = 0
context = 0
err = None

if not seq:
    err = "no sequence provided"
else:
    try:
        import numpy as np
        from bajasplice.scan import load_splicenet
        from bajasplice.cis import cis_profile_sequence, receptive_field
        from bajasplice.genome import codes_to_str, str_to_codes, _COMP

        works.msg("Loading splicing model…")
        model, context, device = load_splicenet()
        rf = int(receptive_field(context))
        # A request past the receptive field is clamped rather than refused: the
        # user picked a number in a dialog, and the honest response is to show
        # what is measurable and say so, not to fail the run.
        max_dist = max(bin_size, min(max_dist, rf))

        # codes_x is track order (index i <-> track x = xi + i); the model wants
        # transcript order. Same two conventions as splicing-profile.py: a
        # minus-strand track holds either the plus-strand genomic slice ('plus',
        # so reverse complement) or an already-complemented string laid out by
        # ascending x ('coding', so plain reverse).
        codes_x = str_to_codes(seq)
        n = int(len(codes_x))
        if minus:
            codes = codes_x[::-1].copy()
            if orientation == "plus":
                codes = _COMP[codes]
        else:
            codes = codes_x

        def tx2x(j):
            return int(xi + (n - 1 - j)) if minus else int(xi + j)

        def x2tx(x):
            return int((n - 1) - (int(x) - xi)) if minus else int(int(x) - xi)

        j0 = x2tx(site_x)
        if not 0 <= j0 < n:
            raise ValueError("the selected site is outside the track sequence")

        works.msg("Scrambling %d nt windows…" % bin_size)
        # strand is '+' here because `codes` is already in transcript order.
        df, ref = cis_profile_sequence(
            model, context, codes_to_str(codes), j0, "+", which, device,
            max_dist=max_dist, bin_size=bin_size, step=step,
            n_shuffle=n_shuffle, strict=False)
        ref_prob = float(df.attrs.get("reference_prob", 0.0))

        half = bin_size // 2
        for row in df.itertuples(index=False):
            # cis.py reports the window center; recover the span it scrambled.
            lo, hi = j0 + int(row.offset) - half, j0 + int(row.offset) - half + bin_size
            if minus:
                # track x runs the other way, so the span's ends swap over.
                x0, x1 = tx2x(hi - 1), tx2x(lo) + 1
            else:
                x0, x1 = tx2x(lo), tx2x(hi - 1) + 1
            windows.append([int(x0), int(x1),
                            round(float(row.impact), 4),
                            round(float(row.z), 3),
                            round(float(row.covered), 3)])
        windows.sort()
        works.progress(100)
    except Exception as e:
        err = str(e)

works.resolve({
    "windows": json.dumps(windows),
    "ref": (round(float(ref), 4) if ref is not None else None),
    "ref_prob": (round(float(ref_prob), 6) if ref_prob is not None else None),
    "receptive_field": rf,
    "max_dist": max_dist,
    "bin_size": bin_size,
    "step": step,
    "which": which,
    "site": site_x,
    "xi": xi,
    "strand": strand,
    "n": n,
    "context": context,
    "error": err,
})
