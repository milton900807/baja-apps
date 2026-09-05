#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shared off-target screen for the ASO designers.

design.py (gapmer) and design-steric-blocking.py both rank candidates on terms that read
the oligo against ITSELF -- GC, Tm, self-structure, runs. None of those can see the thing
that most often kills an ASO, which is that the same 16-20 bases occur in some other
transcript. That is a property of the transcriptome, so it is measured rather than
estimated: py/sequence/offtarget/search.py over a prebuilt 2-bit index, the same search the
off-target tool already runs.

Here rather than in either designer because the burden model is CALIBRATED -- the weights
below come from measurements against the human cDNA index -- and a calibration copied into
two files is a calibration that will disagree with itself. The two modalities differ in
their constants, which they pass in, not in the model.

  BURDEN IS PER DISTINCT GENE SYMBOL, NOT PER HIT.
  A hit in each of one gene's nine isoforms is one liability, not nine. Counting sites
  would rank a candidate by how well its off-target happens to be annotated.

Measured against human_cdna_all, 30-40 random oligos per row, distinct gene symbols hit:

    length   ED0        ED1              ED2                ED3
    16-mer   median 0   median 4         median 85          -
             max    1   max    54        max    436
    18-mer   median 0   median 0         median 5           median 88
             max    0   max    2         max    34          max    354
    20-mer   median 0   median 0         median 1           median 9
             max    0   max    1         max    10          max    80

Which is the whole reason the two designers screen at different edit distances. A 16-mer
gapmer separates on ED0/ED1 and ED2 is mostly chance. An 18-20mer steric blocker is
essentially unique in the transcriptome below ED3: screening it at ED2 gives almost every
candidate a burden of zero and a term that cannot discriminate. ED3 is where its variance
is, and it costs no more to search.
"""

import os
import sys


def load_search():
    """py/sequence/offtarget/search.py, imported by path.

    Returns None when it cannot be used -- no numpy, file moved, import raised. That is a
    normal outcome, not an error: the caller then scores on its sequence terms alone and
    says so in its result.
    """
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.normpath(os.path.join(here, "..", "sequence", "offtarget", "search.py"))
    if not os.path.exists(path):
        return None
    try:
        spec = importlib.util.spec_from_file_location("_baja_offtarget_search", path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["_baja_offtarget_search"] = mod
        spec.loader.exec_module(mod)
        # search.py drives works.progress() once per oligo. This is one step inside a larger
        # design, so its progress must not overwrite the design's own.
        try:
            mod.works = None
        except Exception:
            pass
        return mod
    except Exception:
        return None


def burden_from_hits(hits, weights, on_target_symbols=()):
    """(burden, {distance: gene_count}, example symbols) for one oligo's hit list.

    The intended site is subtracted rather than searched for: every candidate matches its
    own target transcript perfectly, so exactly one gene symbol at distance 0 is the design
    working as intended. A caller that knows the gene names it in on_target_symbols and the
    subtraction is not needed.
    """
    ignore = {str(x).strip().upper() for x in (on_target_symbols or []) if str(x).strip()}
    by_distance = {}
    for h in hits:
        if not isinstance(h, dict):
            continue
        sym = str(h.get("symbol") or "").strip()
        if not sym or sym.upper() in ignore:
            continue
        d = int(h.get("editdistance", 0))
        by_distance.setdefault(d, set()).add(sym)

    counts = {d: len(v) for d, v in sorted(by_distance.items())}
    if not ignore and counts.get(0):
        counts[0] = max(0, counts[0] - 1)

    burden = sum(float(weights.get(d, 0.0)) * n for d, n in counts.items())

    # Named examples for the notes, nearest distance first. A count says how much; a symbol
    # says what, and what is what a reader acts on.
    symbols = []
    for d in sorted(by_distance):
        for sym in sorted(by_distance[d]):
            if sym.upper() in ignore:
                continue
            symbols.append("%s (ED%d)" % (sym, d))
            if len(symbols) >= 8:
                break
        if len(symbols) >= 8:
            break
    return burden, counts, symbols


def cleanliness(burden, scale):
    """burden -> 0..1, where 1 is a clean transcriptome.

    Saturating rather than linear, as 1/(1 + burden/scale): the difference between 0 and 10
    off-target genes matters and the difference between 300 and 400 does not, so a linear
    penalty would spend most of its range on candidates nobody would pick.
    """
    b = max(0.0, float(burden))
    s = max(1e-9, float(scale))
    v = 1.0 / (1.0 + b / s)
    return max(0.0, min(1.0, v))


def describe_counts(counts):
    return (", ".join("%d gene(s) at ED%d" % (v, int(k)) for k, v in sorted(counts.items()))
            or "no other gene hit")
