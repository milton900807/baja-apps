#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Align proteins, pairwise, and say how much of each is the same.

   works.param(1)  [{"name": "...", "seq": "MKT..."}, ...]   two or more
   works.param(2)  {"mode": "local"|"global"}                optional, local by default

A PROTEIN ALIGNMENT IS NOT A STRING COMPARISON. Two related proteins differ by
substitutions that matter very differently -- a leucine for an isoleucine is nearly free,
a proline for a glycine is not -- so the alignment is scored with BLOSUM62 and affine
gaps (open 11, extend 1), which are the blastp defaults. The numbers then read the way a
blastp result reads, which is the point: they are comparable with what the user gets
anywhere else.

LOCAL, NOT GLOBAL, by default. Two related proteins usually share a domain and differ at
the ends. A global alignment drags the ends into the alignment and buries the shared core
under them, so a pair that is 90% identical over a real domain reports 30% and reads as
unrelated. Local alignment finds the core; the coverage figures that come back say how
much of each protein it accounts for, so "90% identical over 40% of it" stays honest in
both directions.

Identity is counted over the ALIGNED columns, gaps excluded from the numerator and
included in the length, which is what blastp reports. Similar counts positions whose
BLOSUM62 score is positive: conservative substitutions.
"""

from ion import works
import json

MATRIX_NAME = "BLOSUM62"
OPEN_GAP = -11.0
EXTEND_GAP = -1.0


def _clean(s):
    return "".join(c for c in str(s or "").upper() if c.isalpha())


def _aligner(mode):
    from Bio.Align import PairwiseAligner, substitution_matrices
    al = PairwiseAligner()
    al.substitution_matrix = substitution_matrices.load(MATRIX_NAME)
    al.open_gap_score = OPEN_GAP
    al.extend_gap_score = EXTEND_GAP
    al.mode = "global" if mode == "global" else "local"
    return al


def _columns(alignment):
    """The two aligned strings, gaps included, however this Biopython spells them."""
    try:
        a, b = str(alignment[0]), str(alignment[1])
        if len(a) == len(b):
            return a, b
    except Exception:
        pass
    # Older releases only format the alignment; the top and bottom rows are the sequences.
    rows = [r for r in str(alignment).split("\n") if r.strip()]
    if len(rows) >= 3:
        return rows[0], rows[2]
    return "", ""


def _pair(a, b, al, matrix):
    """One pair, as blastp would report it."""
    if not a["seq"] or not b["seq"]:
        return {"a": a["name"], "b": b["name"], "error": "one of them has no protein"}
    try:
        alignments = al.align(a["seq"], b["seq"])
        best = alignments[0]
    except Exception as e:                      # an alignment that cannot be made is not a crash
        return {"a": a["name"], "b": b["name"], "error": str(e)}

    top, bot = _columns(best)
    ident = simil = gaps = cols = 0
    for x, y in zip(top, bot):
        if x == "-" or y == "-":
            gaps += 1
            cols += 1
            continue
        cols += 1
        if x == y:
            ident += 1
            simil += 1
        else:
            try:
                if matrix[x, y] > 0:
                    simil += 1
            except Exception:
                pass

    la, lb = len(a["seq"]), len(b["seq"])
    # Aligned columns minus gaps is how much of each sequence the alignment actually used.
    used = cols - gaps
    return {
        "a": a["name"], "b": b["name"],
        "score": float(getattr(best, "score", 0.0)),
        "length": cols, "gaps": gaps,
        "identical": ident, "similar": simil,
        # Over the aligned region, which is the figure that means something for a local
        # alignment. The coverages below are what stop it being read as whole-protein identity.
        "identity": (ident / cols) if cols else 0.0,
        "similarity": (simil / cols) if cols else 0.0,
        "coverage_a": (used / la) if la else 0.0,
        "coverage_b": (used / lb) if lb else 0.0,
        "len_a": la, "len_b": lb,
        "alignment": {"a": top[:4000], "b": bot[:4000], "truncated": len(top) > 4000},
    }


try:
    raw = works.param(1)
    items = json.loads(raw) if isinstance(raw, str) else (raw or [])
    opts_raw = works.param(2)
    opts = (json.loads(opts_raw) if isinstance(opts_raw, str) else (opts_raw or {})) or {}

    seqs = []
    for it in (items or []):
        if not isinstance(it, dict):
            continue
        s = _clean(it.get("seq"))
        if s:
            seqs.append({"name": str(it.get("name") or ("protein %d" % (len(seqs) + 1))), "seq": s})

    if len(seqs) < 2:
        works.resolve({"status": "ERROR",
                       "error": "two proteins are needed to align; %d were sent" % len(seqs)})
    else:
        from Bio.Align import substitution_matrices
        matrix = substitution_matrices.load(MATRIX_NAME)
        al = _aligner(opts.get("mode"))
        pairs = []
        for i in range(len(seqs)):
            for j in range(i + 1, len(seqs)):
                pairs.append(_pair(seqs[i], seqs[j], al, matrix))
        works.resolve({
            "status": "OK",
            "engine": "biopython PairwiseAligner, %s, gap %d/%d, %s"
                      % (MATRIX_NAME, int(OPEN_GAP), int(EXTEND_GAP), al.mode),
            "inputs": [{"name": s["name"], "length": len(s["seq"])} for s in seqs],
            "pairs": pairs,
        })

except Exception as e:
    works.resolve({"status": "ERROR", "error": str(e)})
