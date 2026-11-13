"""Which RBP wins the competition for a stretch of sequence, via bajaclip-lib.

rbp-profile.py answers "where does THIS protein bind". This answers the other
question: given a selected stretch, which of the 170 proteins has the strongest
claim on it, and where.

It is the same forward pass. The model emits all 170 heads per window, so
ranking them against each other costs nothing beyond the scan that a single
protein already pays for.

WHY A COMPETITION RATHER THAN A SCORE. The heads inflate together on GC-rich
sequence: on random 70% GC windows 157 of the 170 sit above 0.9. Read alone,
the raw sigmoid says "everything binds everywhere" on a GC-rich transcript.
That inflation is common mode, so it cancels when a head is compared with the
other heads at the SAME window, which is exactly what this ranking is. A
protein's standing here is the fraction of the other 169 it beats, and the raw
score is reported beside it rather than instead of it, as a floor: a head that
wins a window where nothing scores at all has won nothing.

Params (after the EngineMonitor at param(0)):
    param(1) : sequence (A/C/G/T/U/N, transcript 5'->3')
    param(2) : xi -- the track-local x of the first base (positions are xi + i)
    param(3) : strand ('1' | '-1'), informational
    param(4) : step (nt between windows, default 8)
    param(5) : how many to return (default 12)
    param(6) : 'reliable' (default) to rank only the heads the model is
               trusted for, 'all' to rank every head

Resolves { ranked, winner, n, step, xi, strand, windows, scored, error }
where ranked is a JSON array of
    {rbp, specificity, raw, at, called, share}
    specificity : fraction of the other heads it beats at its best window
    raw         : its own sigmoid at that window, as a sanity floor
    at          : position of that window's centre (xi + centre)
    called      : how many windows it wins outright (specificity >= 0.99)
    share       : fraction of all windows in the selection it wins outright
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

_LIB = os.path.expanduser("~/baja-apps/py/bajaclip-lib")
if os.path.isdir(_LIB) and _LIB not in sys.path:
    sys.path.insert(0, _LIB)


def _int(v, d):
    try:
        return int(float(v))
    except Exception:
        return d


seq = str(works.param(1) or "").strip().upper()
xi = _int(works.param(2), 0)
strand = str(works.param(3) or "1")
step = max(1, _int(works.param(4), 8))
top_n = max(1, _int(works.param(5), 12))
which_set = str(works.param(6) or "reliable").strip().lower() or "reliable"

# The same two constants rbp-profile.py calls a site by, so the two tools agree about
# what "wins a window" means. A head must both out-rank the others and have scored at
# all; 0.99 is a rank among 170, i.e. beating all but one.
SITE_RANK = 0.99
RAW_FLOOR = 0.5

ranked = []
winner = None
n = 0
n_windows = 0
n_scored = 0
err = None

if not seq:
    err = "no sequence provided"
elif len(seq) < 64:
    # The window is 64 nt wide: a shorter selection has no window to score, and a
    # silently empty answer would read as "nothing binds here".
    err = ("the selection is %d nt; BajaCLIP scores 64 nt windows, so it needs at "
           "least that much sequence" % len(seq))
else:
    try:
        import numpy as np
        from bajaclip.scan import load_model, scan_sequence, resolve_rbps

        works.msg("Loading RBP model…")
        model = load_model()

        # Which heads are allowed to compete. Ranking is always against ALL 170, because
        # that is what makes the measure comparable with rbp-profile.py; this only limits
        # which ones are REPORTED. Offering a head the model is not trusted for as the
        # answer to "what binds here" would be a worse answer than a shorter list.
        names, cols = resolve_rbps(model, which_set)
        if not cols:
            names, cols = resolve_rbps(model, "all")
        if not cols:
            raise RuntimeError("the model exposes no RBP heads")

        works.msg("Scanning %d nt…" % len(seq))
        centers, allscores = scan_sequence(model, seq, None, step=step)
        n = int(len(seq))
        n_windows = int(allscores.shape[0])
        nheads = int(allscores.shape[1])
        if n_windows < 1:
            raise RuntimeError("the selection produced no scoring windows")

        works.msg("Ranking %d proteins…" % len(cols))
        # The fraction of the other heads each one beats, per window. Done by sorting
        # each row rather than comparing every pair: the pairwise form is 170x170 per
        # window and says the same thing.
        order = np.argsort(allscores, axis=1, kind="stable")
        rank = np.empty_like(order)
        rows = np.arange(n_windows)[:, None]
        rank[rows, order] = np.arange(nheads)[None, :]
        spec = rank.astype(np.float64) / max(1, nheads - 1)

        # A window counts as scored at all if SOMETHING clears the floor there. Reported
        # so a flat answer can be read as "nothing binds this" rather than as a failure.
        n_scored = int((allscores.max(axis=1) >= RAW_FLOOR).sum())

        for nm, col in zip(names, cols):
            s = allscores[:, col]
            r = spec[:, col]
            # Only windows where this head actually scored can count for it.
            ok = s >= RAW_FLOOR
            if not bool(ok.any()):
                continue
            idx = int(np.argmax(np.where(ok, r, -1.0)))
            called = int(((r >= SITE_RANK) & ok).sum())
            ranked.append({
                "rbp": nm,
                "specificity": round(float(r[idx]), 4),
                "raw": round(float(s[idx]), 4),
                "at": int(xi + int(centers[idx])),
                "called": called,
                "share": round(called / float(n_windows), 4),
            })

        # Most important first: how much of the selection it wins outright, then how
        # decisively it wins its best window. A protein that tops many windows is a
        # stronger claim than one that spikes at a single one, which is why the count
        # leads and the peak breaks ties rather than the other way round.
        #
        # HOW DECISIVE THE WIN IS MATTERS AS MUCH AS WHO WINS, so the caller is given the
        # runner-up too. Measured on a synthetic background with the model's own documented
        # behaviour (common-mode inflation: one level per window, small per-head jitter),
        # over 40 windows: with a site planted for one protein that protein ranks 1st of 170
        # and wins 7 windows against the runner-up's 3; with no site planted at all, the top
        # protein still wins 3. So a bare winner is not evidence of anything. A name is only
        # worth printing when it beats the field by a distance, which is the caller's call to
        # make and needs the second row to make it.
        ranked.sort(key=lambda d: (-d["called"], -d["specificity"], -d["raw"], d["rbp"]))
        if ranked:
            winner = ranked[0]["rbp"]
        ranked = ranked[:top_n]
        works.progress(100)
    except Exception as e:
        err = str(e)

works.resolve({
    "ranked": json.dumps(ranked),
    "winner": winner or "",
    "n": n,
    "windows": n_windows,
    "scored": n_scored,
    "step": step,
    "xi": xi,
    "strand": strand,
    "error": err,
})
