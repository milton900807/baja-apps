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

for _lib in ("~/baja-apps/py/bajasplice-lib", "~/baja-apps/py/bajanmd-lib"):
    _p = os.path.expanduser(_lib)
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)


gene = str(works.param(1) or "").strip()
want = (str(works.param(2) or "switch").strip() or "switch")
try:
    dj = int(float(works.param(3) or 50))
except Exception:
    dj = 50

if not gene:
    works.resolve({"error": "no gene given", "exons": json.dumps([]),
                   "n": "0", "gene": ""})
else:
    try:
        from bajanmd.consequence import gene_exons

        rows = gene_exons(gene, dj=dj)
        keep = {"NMD_in": {"NMD_in"}, "NMD_ex": {"NMD_ex"},
                "switch": {"NMD_in", "NMD_ex"}}.get(want)
        if keep:
            rows = [r for r in rows if r["nmd_class"] in keep]
        # per-transcript detail is large and the list view does not use it
        for r in rows:
            r["n_mane_tx"] = sum(1 for t in r.pop("transcripts") if t["mane"])
        works.resolve({
            "exons": json.dumps(rows),
            "n": str(len(rows)),
            "gene": gene,
            "dj_threshold": str(dj),
            "filter": want,
            "error": None,
        })
    except Exception as e:
        works.resolve({"error": str(e), "exons": json.dumps([]), "n": "0",
                       "gene": gene})
