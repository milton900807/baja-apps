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

# THE BLOCKS THE ALIGNMENT IS MADE OF, so the comparison can be DRAWN and not only
# reported. One identity for a whole pair says how alike they are; it cannot say WHERE,
# and where is what a track is for. These are the stretches the alignment holds together:
# the columns walked once, broken wherever a gap runs longer than a few residues.
#
# A short gap does not end a block. Splitting at every single gap shatters one conserved
# domain into twenty fragments, each too small to mean anything and each drawing its own
# bar and its own arrow, which is worse than drawing nothing. A run of more than
# MAX_INNER_GAP is a real discontinuity and does end it.
MIN_BLOCK = 8            # residues; shorter than this is noise in any protein pair
MAX_INNER_GAP = 5        # a gap run up to this long is carried inside a block
MIN_BLOCK_IDENTITY = 0.35
MAX_BLOCKS = 12


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


def _segments(alignment, la, lb):
    """The ungapped segments of one alignment, as ((a0,a1),(b0,b1)) half-open pairs.

    Taken from Biopython's own `aligned`, which gives them in SEQUENCE coordinates.
    Walking the formatted strings instead loses where a LOCAL alignment started: the
    columns begin partway into each protein, and counting from zero puts every block
    that many residues to the left -- on a track, squarely on the wrong codons.
    """
    try:
        pairs = []
        blocks_a, blocks_b = alignment.aligned
        for (a0, a1), (b0, b1) in zip(blocks_a, blocks_b):
            a0, a1, b0, b1 = int(a0), int(a1), int(b0), int(b1)
            if a1 <= a0 or b1 <= b0:
                continue
            if a1 > la or b1 > lb:
                continue
            pairs.append(((a0, a1), (b0, b1)))
        return pairs
    except Exception:
        return []


def _blocks(alignment, sa, sb, matrix, opts):
    """Where two proteins are alike, on each one's own residues (0-based, inclusive).

    A short gap does not end a block. Splitting at every single gap shatters one
    conserved domain into twenty fragments, each too small to mean anything and each
    drawing its own bar and its own arrow, which is worse than drawing nothing. A run
    longer than MAX_INNER_GAP on either side is a real discontinuity and does end it.
    """
    min_len = int(opts.get("min_block") or MIN_BLOCK)
    max_gap = int(opts.get("max_inner_gap") or MAX_INNER_GAP)
    min_id = float(opts.get("min_block_identity") or MIN_BLOCK_IDENTITY)
    cap = int(opts.get("max_blocks") or MAX_BLOCKS)

    segs = _segments(alignment, len(sa), len(sb))
    if not segs:
        return []

    merged = []
    for (a0, a1), (b0, b1) in segs:
        if merged:
            (pa0, pa1), (pb0, pb1) = merged[-1]
            if (a0 - pa1) <= max_gap and (b0 - pb1) <= max_gap:
                merged[-1] = ((pa0, a1), (pb0, b1))
                continue
        merged.append(((a0, a1), (b0, b1)))

    out = []
    for (a0, a1), (b0, b1) in merged:
        n = min(a1 - a0, b1 - b0)
        if n < min_len:
            continue
        ident = simil = 0
        for k in range(n):
            x, y = sa[a0 + k], sb[b0 + k]
            if x == y:
                ident += 1
                simil += 1
            else:
                try:
                    if matrix[x, y] > 0:
                        simil += 1
                except Exception:
                    pass
        if not n or (ident / n) < min_id:
            continue
        out.append({
            "a0": a0, "a1": a1 - 1, "b0": b0, "b1": b1 - 1,
            "columns": n, "identical": ident, "similar": simil,
            "identity": ident / n, "similarity": simil / n,
        })

    # Best first by how much conserved sequence each block actually accounts for, capped,
    # then put back in order along A so the numbering reads left to right on the track.
    out.sort(key=lambda d: -d["identical"])
    out = out[:cap]
    out.sort(key=lambda d: d["a0"])
    for i, d in enumerate(out):
        d["n"] = i + 1
    return out


def _pair(a, b, al, matrix, opts):
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
        # Where the two are alike, not just how much: residue ranges on each protein,
        # 0-based and inclusive, for the caller to put on the tracks.
        "blocks": _blocks(best, a["seq"], b["seq"], matrix, opts),
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
                pairs.append(_pair(seqs[i], seqs[j], al, matrix, opts))
        works.resolve({
            "status": "OK",
            "engine": "biopython PairwiseAligner, %s, gap %d/%d, %s"
                      % (MATRIX_NAME, int(OPEN_GAP), int(EXTEND_GAP), al.mode),
            "inputs": [{"name": s["name"], "length": len(s["seq"])} for s in seqs],
            "pairs": pairs,
        })

except Exception as e:
    works.resolve({"status": "ERROR", "error": str(e)})
