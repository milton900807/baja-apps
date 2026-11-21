"""BajaNMD: steric-block ASOs designed to skip one exon, screened for specificity.

Tiles oligo-length windows across the exon and both flanks, masks each one to
N (an oligo occludes its site, it does not rewrite it) and re-reads the two
splice sites with SpliceNet. An exon needs both sites to be included, so
destroying either one causes skipping and the per-window score is the larger
of the two losses, on the logit scale because a site at 0.9997 has no room to
fall on the probability scale.

What skipping the exon DOES depends on the exon's class, from
py/bio/nmd/bajanmd-exons.py: skip a poison exon (NMD_in) and protein goes up,
skip an essential exon (NMD_ex) and protein goes down. The oligos are the same
kind of molecule; this script does not need to know which case it is in.

Candidates are screened against human_premrna, the gene-level reference with
introns, because a splice-site oligo straddles the exon-intron boundary and so
has no site at all in a spliced reference. An exact hit in another gene marks
an oligo undevelopable and sorts it last whatever its score.

READ `reference` FIRST. Both numbers should be high. If either is near zero
the exon is not used in this context or the coordinates are wrong, `warning`
says so, and the ranking means nothing. `saturated` marks oligos whose score
is capped by the clip floor: those tie, and the order among them is not a
potency ordering.

Params (after the EngineMonitor at param(0)):
    param(1) : chrom (e.g. 'chr19')
    param(2) : exon start (genomic, 1-based inclusive)
    param(3) : exon end
    param(4) : strand ('+' | '-')
    param(5) : gene symbol, optional. Excluded from off-target counts and used
               to report self_hit, so pass it when you have it.
    param(6) : oligo length, default 18
    param(7) : how many candidates to return, default 15
    param(8) : off-target index, default 'human_premrna'

Resolves to:
    { "candidates": "<json list>", "reference": "<json>", "warning": ...,
      "n_windows": "...", "error": null }
"""
import os
import sys
import json

from ion import works


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

# Resolve the libraries from this file's own location first: deploy-all.sh
# installs to $APPS_DIR (/opt/baja-apps), not to the ~ checkout, so looking only
# under ~ imports a library the deploy never put there. See bajanmd-exons.py.
_HERE = os.path.dirname(os.path.abspath(__file__))
_APPS_PY = os.path.abspath(os.path.join(_HERE, "..", ".."))
for _lib in (os.path.join(_APPS_PY, "bajasplice-lib"),
             os.path.join(_APPS_PY, "bajanmd-lib"),
             os.path.expanduser("~/baja-apps/py/bajasplice-lib"),
             os.path.expanduser("~/baja-apps/py/bajanmd-lib")):
    if os.path.isdir(_lib) and _lib not in sys.path:
        sys.path.insert(0, _lib)


def _int(v, d):
    try:
        return int(float(v))
    except Exception:
        return d


chrom = str(works.param(1) or "").strip()
start = _int(works.param(2), 0)
end = _int(works.param(3), 0)
strand = str(works.param(4) or "+").strip()
gene = str(works.param(5) or "").strip() or None
aso_len = _int(works.param(6), 18)
top = _int(works.param(7), 15)
index = str(works.param(8) or "human_premrna").strip()

if not chrom or not start or not end or end <= start:
    works.resolve({"error": "need chrom, exon start and exon end",
                   "candidates": json.dumps([]), "n_windows": "0"})
elif strand not in ("+", "-"):
    works.resolve({"error": f"strand must be + or -, got '{strand}'",
                   "candidates": json.dumps([]), "n_windows": "0"})
else:
    try:
        from bajanmd.design import design
        from bajanmd.offtarget import screen

        d = design(chrom, start, end, strand, aso_len=aso_len, top=top)
        screen(d["candidates"], gene=gene, index=index)
        works.resolve({
            "candidates": json.dumps(d["candidates"]),
            "reference": json.dumps(d["reference"]),
            "exon": json.dumps(d["exon"]),
            "warning": d["warning"],
            "n_windows": str(d["n_windows"]),
            "gene": gene or "",
            "index": index,
            "error": None,
        })
    except Exception as e:
        works.resolve({"error": str(e), "candidates": json.dumps([]),
                       "n_windows": "0", "gene": gene or ""})
