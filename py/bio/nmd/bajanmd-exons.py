"""BajaNMD: every cassette exon of a gene, with what including or skipping it does.

For each internal exon of each transcript of the gene, builds both isoforms,
translates from the annotated CDS start and measures the distance from the
first in-frame stop to the last exon-exon junction. Past ~50 nt that stop is
read as premature and the transcript is degraded, so:

    NMD_in   including the exon causes decay (a poison exon). SKIP it with an
             oligo and protein goes UP. This is the TANGO-class strategy, as
             in STK-001 against SCN1A exon 20N.
    NMD_ex   skipping the exon causes decay (frame-breaking essential exon).
             SKIP it and protein goes DOWN.
    both     no usable switch; decay either way.
    none     no usable switch; decay neither way.

Both classes are returned, because which one a caller wants depends on whether
they are raising or lowering the protein, and the oligo design is the same job
either way (py/bio/nmd/bajanmd-aso.py).

`frac` below 1.0 means the transcripts carrying this exon disagree about the
consequence, which is real: the same exon can be ordinary in one isoform and
frameshifting in another. `mane_class` is the call in the MANE Select
transcript and is the one to lead with when they disagree.

Params (after the EngineMonitor at param(0)):
    param(1) : gene symbol (e.g. 'SCN1A')
    param(2) : class filter, optional. 'NMD_in' | 'NMD_ex' | 'switch'
               (either of those two, the default) | 'all'
    param(3) : DJ threshold in nt, default 50 (50 to 55 is the accepted range)

Resolves to:
    { "exons": "<json list>", "n": "<int>", "gene": "...", "error": null }

An empty list is a normal answer: plenty of genes have no frame-switching
cassette exon. The client must not treat it as an error.
"""
import os
import sys
import json

from ion import works


# The server spawns the system python3, which has neither torch nor bajasplice.
# Re-exec under the project virtualenv if this interpreter cannot import them.
# Same shape as py/bio/splice/splicing-profile.py.
def _reexec_under_venv():
    try:
        import torch        # noqa: F401
        import bajasplice   # noqa: F401
        return
    except Exception:
        pass
    for py in (os.environ.get("BAJASPLICE_PYTHON"),
               "/opt/venv/bin/python3",
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3")):
        if py and os.path.exists(py) and \
                os.path.realpath(py) != os.path.realpath(sys.executable):
            os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])


_reexec_under_venv()

# WHERE THE LIBRARIES ARE. Resolve them from THIS file's own location first.
# deploy-all.sh installs to $APPS_DIR, which is /opt/baja-apps on the server,
# while ~/baja-apps is a checkout the deploy never writes to. Looking only under
# ~ meant the deployed script imported a library the deploy had not put there
# and died at import, which reaches the browser as a bare server-side error.
# This file sits at <apps>/py/bio/nmd/, so the libraries are two levels up.
_HERE = os.path.dirname(os.path.abspath(__file__))
_APPS_PY = os.path.abspath(os.path.join(_HERE, "..", ".."))
for _lib in (os.path.join(_APPS_PY, "bajasplice-lib"),
             os.path.join(_APPS_PY, "bajanmd-lib"),
             os.path.expanduser("~/baja-apps/py/bajasplice-lib"),
             os.path.expanduser("~/baja-apps/py/bajanmd-lib")):
    if os.path.isdir(_lib) and _lib not in sys.path:
        sys.path.insert(0, _lib)


gene = str(works.param(1) or "").strip()
want = (str(works.param(2) or "switch").strip() or "switch")
try:
    dj = int(float(works.param(3) or 50))
except Exception:
    dj = 50


def _coord(v):
    try:
        return int(round(float(v)))
    except Exception:
        return 0


# ONE EXON, WHEN THE CALLER CLICKED ONE. The menu this runs from is exon-scoped:
# it is titled with the exon's id, so answering about the whole gene makes the
# user hunt for the row they already pointed at. Given coordinates, the answer
# is about that exon and carries the per-transcript detail the list view drops.
exon_lo, exon_hi = _coord(works.param(4)), _coord(works.param(5))
if exon_lo and exon_hi and exon_lo > exon_hi:
    exon_lo, exon_hi = exon_hi, exon_lo

if not gene:
    works.resolve({"error": "no gene given", "exons": json.dumps([]),
                   "n": "0", "gene": ""})
else:
    try:
        from bajanmd.consequence import gene_exons

        rows = gene_exons(gene, dj=dj)
        picked = None
        if exon_lo and exon_hi:
            # The annotation's bounds and the GTF's can differ by a base or two,
            # so match the overlapping exon whose ends are closest rather than
            # demanding equality, and report what was matched so a snap is
            # visible instead of silent.
            over = [r for r in rows
                    if r["a_start"] <= exon_hi and r["a_end"] >= exon_lo]
            if over:
                picked = min(over, key=lambda r: abs(r["a_start"] - exon_lo)
                             + abs(r["a_end"] - exon_hi))
                picked["asked_start"] = exon_lo
                picked["asked_end"] = exon_hi
                picked["exact"] = (picked["a_start"] == exon_lo
                                   and picked["a_end"] == exon_hi)
            rows = [picked] if picked else []
        else:
            keep = {"NMD_in": {"NMD_in"}, "NMD_ex": {"NMD_ex"},
                    "switch": {"NMD_in", "NMD_ex"}}.get(want)
            if keep:
                rows = [r for r in rows if r["nmd_class"] in keep]
        for r in rows:
            tx = r.get("transcripts") or []
            r["n_mane_tx"] = sum(1 for t in tx if t["mane"])
            # the list view does not use the per-transcript detail; the
            # single-exon answer does, so keep it only there
            if picked is None:
                r.pop("transcripts", None)
        works.resolve({
            "exons": json.dumps(rows),
            "n": str(len(rows)),
            "gene": gene,
            "dj_threshold": str(dj),
            "filter": ("exon" if (exon_lo and exon_hi) else want),
            "asked": json.dumps({"start": exon_lo, "end": exon_hi}),
            "error": None,
        })
    except Exception as e:
        works.resolve({"error": str(e), "exons": json.dumps([]), "n": "0",
                       "gene": gene})
