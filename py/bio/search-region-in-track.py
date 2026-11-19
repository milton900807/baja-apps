#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One stretch of sequence, searched against a whole other sequence, hits ranked.

   works.param(1)  {"name": "...", "seq": "ACGT..."}     the query: one region
   works.param(2)  {"name": "...", "seq": "ACGT...", "offset": 0}   the target: a whole track
   works.param(3)  {"max_hits": 8, "min_score": 0, "strands": "both"|"plus"}

"compare exon 16 of one transcript with any other part of another and rank the results" is
not a pairwise comparison. A pairwise alignment answers "how similar are these two things";
this answers "where in that thing does this one turn up, and how good is each of them".

ONE ALIGNMENT IS ONE HIT. Smith-Waterman returns the single best local alignment, so the
second-best match is invisible to it. Each hit is therefore taken, then MASKED OUT of the
target before searching again, which is what makes the next alignment find the next region
instead of the same one. Masking with a character that scores against everything is the
honest way to do it: nothing is deleted, so the coordinates of later hits are still the
coordinates of the real sequence.

SCORED LIKE BLASTN, +2 / -3 with gaps 5 and 2, so a hit's score means the same thing here
as it does in the pairwise comparison beside it and in any blastn result the user has.

BOTH STRANDS by default. Two transcripts can carry the same element in either orientation,
and a search that only looks at one strand reports "no similarity" for a perfect match that
happens to be reversed.
"""

from ion import works
import json

MATCH = 2.0
MISMATCH = -3.0
OPEN_GAP = -5.0
EXTEND_GAP = -2.0
MASK = "N"          # scores as a mismatch against every real base, so a masked hit cannot win again
MAX_TARGET = 400000  # a whole gene track is fine; a chromosome is not, and would hang the server


def _clean(s):
    return "".join(c for c in str(s or "").upper() if c in "ACGTUN").replace("U", "T")


def _rc(s):
    comp = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}
    return "".join(comp.get(c, "N") for c in reversed(s))


def _aligner():
    from Bio.Align import PairwiseAligner
    al = PairwiseAligner()
    al.mode = "local"
    al.match_score = MATCH
    al.mismatch_score = MISMATCH
    al.open_gap_score = OPEN_GAP
    al.extend_gap_score = EXTEND_GAP
    return al


def _best(al, query, target):
    """The best local alignment, with where it sits in the target."""
    try:
        alignments = al.align(target, query)       # target first: coordinates come back in it
        best = alignments[0]
    except Exception:
        return None
    try:
        tblocks = best.aligned[0]
        qblocks = best.aligned[1]
        if len(tblocks) == 0:
            return None
        t0, t1 = int(tblocks[0][0]), int(tblocks[-1][1])
        q0, q1 = int(qblocks[0][0]), int(qblocks[-1][1])
    except Exception:
        return None

    # Identity over the aligned columns, counted from the blocks so it does not depend on
    # how this Biopython formats an alignment.
    ident = cols = 0
    for (ta, tb), (qa, qb) in zip(tblocks, qblocks):
        for i in range(int(tb) - int(ta)):
            cols += 1
            if target[int(ta) + i] == query[int(qa) + i]:
                ident += 1
    gaps = (t1 - t0) - cols + (q1 - q0) - cols
    return {
        "score": float(best.score), "t0": t0, "t1": t1, "q0": q0, "q1": q1,
        "identical": ident, "columns": cols, "gaps": max(0, gaps),
    }


try:
    q_raw = works.param(1)
    t_raw = works.param(2)
    o_raw = works.param(3)
    q = json.loads(q_raw) if isinstance(q_raw, str) else (q_raw or {})
    t = json.loads(t_raw) if isinstance(t_raw, str) else (t_raw or {})
    opts = (json.loads(o_raw) if isinstance(o_raw, str) else (o_raw or {})) or {}

    query = _clean(q.get("seq"))
    target = _clean(t.get("seq"))
    offset = int(t.get("offset") or 0)
    max_hits = max(1, min(int(opts.get("max_hits") or 8), 50))
    both = str(opts.get("strands") or "both").lower() != "plus"

    if len(query) < 12:
        works.resolve({"status": "ERROR", "error": "the query region is too short to search with (%d bases)" % len(query)})
    elif len(target) < 12:
        works.resolve({"status": "ERROR", "error": "the track being searched has no sequence"})
    elif len(target) > MAX_TARGET:
        works.resolve({"status": "ERROR",
                       "error": "that track is %s bases, too long to scan here (limit %s). Search a region of it."
                                % (format(len(target), ","), format(MAX_TARGET, ","))})
    else:
        al = _aligner()
        # A hit that scores no better than this is noise: the score two unrelated sequences
        # reach by chance grows with how much target there is to look in.
        floor = float(opts.get("min_score") or 0) or max(20.0, MATCH * 0.45 * min(len(query), 60))
        work = list(target)
        hits = []
        strands = [(1, query)] + ([(-1, _rc(query))] if both else [])
        for _ in range(max_hits):
            best = None
            for strand, qseq in strands:
                r = _best(al, qseq, "".join(work))
                if r and (best is None or r["score"] > best["score"]):
                    r["strand"] = strand
                    best = r
            if not best or best["score"] < floor:
                break
            hits.append(best)
            # Mask what was found, so the next pass finds the next place rather than this one.
            for i in range(best["t0"], best["t1"]):
                if 0 <= i < len(work):
                    work[i] = MASK

        hits.sort(key=lambda h: -h["score"])
        out = []
        for rank, h in enumerate(hits, 1):
            cols = h["columns"] or 1
            out.append({
                "rank": rank,
                "score": h["score"],
                "start": h["t0"] + offset, "end": h["t1"] + offset,
                "strand": "+" if h["strand"] > 0 else "-",
                "identity": h["identical"] / cols,
                "identical": h["identical"], "length": h["columns"], "gaps": h["gaps"],
                # How much of the QUERY this hit accounts for: a 40-base match to a 170-base
                # exon is a different claim from a 170-base one, and the score alone hides it.
                "query_start": h["q0"], "query_end": h["q1"],
                "query_coverage": (h["q1"] - h["q0"]) / len(query),
            })

        works.resolve({
            "status": "OK",
            "query": {"name": q.get("name") or "query", "length": len(query)},
            "target": {"name": t.get("name") or "target", "length": len(target), "offset": offset},
            "engine": "biopython PairwiseAligner, local, +%d/%d, gap %d/%d, %s"
                      % (int(MATCH), int(MISMATCH), int(OPEN_GAP), int(EXTEND_GAP),
                         "both strands" if both else "plus strand"),
            "floor": floor,
            "hits": out,
        })

except Exception as e:
    works.resolve({"status": "ERROR", "error": str(e)})
