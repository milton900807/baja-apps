"""Off-target screening for designed oligos, through the engine already here.

WHY NOT A NEW INDEX. py/sequence/offtarget/search.py is a pigeonhole
seed-and-verify search over prebuilt 2-bit indexes: edit distance up to 3,
both strands, indels included, with gene symbols attached to every hit. A
Hamming-only k-mer table would be strictly weaker and would duplicate indexes
that are already built and already maintained.

PRE-MRNA MATTERS HERE MORE THAN USUAL. A steric-block oligo against a splice
site straddles the exon-intron boundary by construction, so a large part of it
is intronic and its own target site does not exist in any mature transcript.
Screened against a spliced reference alone, such an oligo comes back with zero
hits and the zero means nothing: the reference simply does not contain the
sequence. human_premrna (py/sequence/offtarget/build-premrna.py) is built one
record per gene with introns included, which is the reference these oligos
actually act on, so it is the default here. `self_hit` reports whether the
oligo's own gene came back, which is the check that the screen tested anything
at all.
"""
from __future__ import annotations

import os
import sys

DEFAULT_INDEX = "human_premrna"


def _engine():
    """Import search.py from py/sequence/offtarget without installing it."""
    here = os.path.dirname(os.path.abspath(__file__))
    for up in (os.path.join(here, "..", "..", "sequence", "offtarget"),
               os.path.expanduser("~/baja-apps/py/sequence/offtarget")):
        p = os.path.abspath(up)
        if os.path.isfile(os.path.join(p, "search.py")):
            if p not in sys.path:
                sys.path.insert(0, p)
            import search                     # noqa: E402
            return search
    raise ImportError("py/sequence/offtarget/search.py not found")


def screen(candidates, gene=None, index=DEFAULT_INDEX, k=2, strand="+-"):
    """Annotate design() candidates in place with off-target counts.

    Adds to each candidate:
        off_genes    distinct gene symbols hit, excluding `gene`
        off_n        how many of them
        self_hit     True when `gene` itself came back, meaning the oligo's
                     own site is in this reference and the screen is real
        off_error    set instead of the above when the index is unavailable

    An oligo that hits another gene is marked not developable and sorted to the
    bottom, because specificity outranks predicted potency: a potent oligo that
    also binds a paralog is not a candidate.
    """
    try:
        eng = _engine()
        res = eng.search([index],
                         [{"id": i, "synthesisSequence": c["aso_5to3"]}
                          for i, c in enumerate(candidates)],
                         k, strand)
    except Exception as e:                   # no index on this box, say so
        for c in candidates:
            c["off_error"] = str(e)
        return candidates

    by_id = {e.get("id"): e for e in res.get("oligoQuery", [])}
    for i, c in enumerate(candidates):
        syms = list(by_id.get(i, {}).get("offtargetsymbols") or [])
        c["self_hit"] = bool(gene and gene in syms)
        others = [s for s in syms if s != gene] if gene else syms
        c["off_genes"] = others
        c["off_n"] = len(others)
        if others:
            c["flags"] = list(c.get("flags", [])) + [f"offtarget_{len(others)}"]
            c["developable"] = False
    candidates.sort(key=lambda r: (r.get("off_n", 0) > 0,
                                   -round(r["skip_logit"], 3),
                                   r.get("off_n", 0),
                                   not r.get("developable", True)))
    return candidates
