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
import time

MATCH = 2.0
MISMATCH = -3.0
OPEN_GAP = -5.0
EXTEND_GAP = -2.0
# TWO DIFFERENT MASKS, and neither is a base.
#
# Masking both sides with the same character makes masked regions match EACH OTHER: N
# against N is a match, so a stretch already found and blanked on both sides aligns to
# itself perfectly and comes back as a second, higher-scoring, 100%-identical hit of the
# same place. X and Z are stripped from any input by _clean, so neither can occur in a real
# sequence, and X against Z is a mismatch like any other.
MASK_T = "X"        # what has been found in the target
MASK_Q = "Z"        # what has been found in the query
# ALIGN EVERYTHING UP TO HERE, NARROW FIRST ABOVE IT.
#
# DNM3's genomic track is 571 kb and this was a flat refusal at 400 kb, so every exon of
# DNM1 searched against it came back as an error -- and the caller reported twenty-two
# errors as "none of the 22 exons matches anything above the noise floor", which is a
# statement about two paralogous genes that is simply false.
#
# Smith-Waterman over a megabase per exon is minutes of work, so above the window the
# search does what any real one does: exact k-mer seeds say which few places are worth
# aligning, and the alignment runs there. The per-call alignment cost stays inside the
# bound that was always accepted; what grows is one linear scan of the target.
WINDOW = 400000       # how much target one alignment is given at a time
# NO LIMIT ON HOW MUCH TARGET THERE IS. There was one, at 400 kb, and a 571 kb gene track
# hit it: the search refused, and the caller turned a refusal into "nothing matched". The
# size of the thing being searched is not a reason to refuse to search it. What was really
# bounded was one alignment, and that is bounded still -- by the window above, with the
# target covered in windows -- so a long target costs more time rather than an error.
TIME_BUDGET = 150.0   # seconds of exhaustive sweeping before reporting what was covered
SEED_K = 9            # short enough to survive paralogous divergence. At 73% identity --
                      # what two paralogous coding exons look like -- a 150 nt exon shares
                      # almost no exact 12-mer with its partner, so seeding on 12 found
                      # nothing in a place where the alignment scores twice the floor
SEED_BUCKET = 2000    # diagonal width: a seed cluster is a diagonal band, not an exact line
SEED_REGIONS = 8      # how many places to align in; the best hit is taken across them


def _clean(s):
    return "".join(c for c in str(s or "").upper() if c in "ACGTUN").replace("U", "T")


def _rc(s):
    comp = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}
    return "".join(comp.get(c, "N") for c in reversed(s))


# FOR A MAP, GAPS HAVE TO BE EXPENSIVE.
#
# At blastn's gap costs a local alignment will happily bridge several hundred bases of
# unrelated sequence to join two conserved blocks, because the blocks pay for the crossing.
# That is the right answer for "how similar are these two" and the wrong one for "which
# regions correspond": it returns one long, gappy, middling-identity alignment and the two
# real blocks inside it are never named. Charging properly for the crossing leaves the
# blocks separate, which is what a map is made of.
BLOCK_OPEN_GAP = -12.0
BLOCK_EXTEND_GAP = -8.0


def _aligner(blocks=False):
    from Bio.Align import PairwiseAligner
    al = PairwiseAligner()
    al.mode = "local"
    al.match_score = MATCH
    al.mismatch_score = MISMATCH
    al.open_gap_score = BLOCK_OPEN_GAP if blocks else OPEN_GAP
    al.extend_gap_score = BLOCK_EXTEND_GAP if blocks else EXTEND_GAP
    return al


def _chunks(n, query_len):
    """The whole target in overlapping windows.

    The exhaustive path. One alignment is still given at most WINDOW bases, which is the
    cost that was always accepted; the windows overlap by more than one alignment's width
    so a hit that straddles a boundary is found whole in the next one.
    """
    over = min(WINDOW // 2, max(4 * query_len, 2000))
    out = []
    s0 = 0
    while s0 < n:
        e0 = min(n, s0 + WINDOW)
        out.append((s0, e0))
        if e0 >= n:
            break
        s0 = e0 - over
    return out


def _candidate_regions(query, target):
    """Where in a long target this query could plausibly align, from exact k-mer seeds.

    Seeds are counted per diagonal band (target position minus query position), which is
    where a real alignment puts them: a band with many seeds is a place the sequences line
    up, a band with one is chance. Each surviving band becomes a window with a query length
    of slack on both sides, so an alignment that starts before the first seed and ends after
    the last still fits inside the window it is searched in.

    Returns [(start, end)] in target coordinates, merged and sorted. An empty list means no
    seed anywhere, which for a 12-mer over a gene is a real answer: nothing matches.
    """
    k = SEED_K
    if len(query) < k or len(target) < k:
        return [(0, len(target))]
    qk = {}
    for i in range(len(query) - k + 1):
        qk.setdefault(query[i:i + k], []).append(i)
    votes = {}
    for j in range(len(target) - k + 1):
        where = qk.get(target[j:j + k])
        if not where:
            continue
        for i in where:
            b = (j - i) // SEED_BUCKET
            v = votes.get(b)
            if v is None:
                votes[b] = [1, j, j]
            else:
                v[0] += 1
                if j < v[1]:
                    v[1] = j
                if j > v[2]:
                    v[2] = j
    if not votes:
        return []
    # A FAST PATH THAT IS NOT CONVINCING IS WORSE THAN NO FAST PATH. Random 9-mers in a
    # megabase of sequence fill every diagonal band with one or two votes, and the true
    # band for two exons at 73% identity holds about three -- so ranking by votes buried
    # the real place under noise and spent eight alignments proving it. Unless some band
    # stands out, this says so by returning nothing, and the caller sweeps the target
    # properly instead of being told where to look by a coin toss.
    strongest = max(v[0] for v in votes.values())
    if strongest < max(4, len(query) // 25):
        return []
    top = sorted(votes.values(), key=lambda v: -v[0])[:SEED_REGIONS]
    pad = len(query) + SEED_BUCKET
    spans = sorted((max(0, v[1] - pad), min(len(target), v[2] + pad + k)) for v in top)
    merged = []
    for s0, e0 in spans:
        if merged and s0 <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e0)
        else:
            merged.append([s0, e0])
    return [(a, b) for a, b in merged]


def _scan(al, query, work, regions):
    """The best alignment of query anywhere in the given regions of `work`."""
    best = None
    for (s0, e0) in regions:
        if e0 - s0 < 12:
            continue
        r = _best(al, query, "".join(work[s0:e0]))
        if not r:
            continue
        # Back into target coordinates before anything compares two regions' hits.
        r["t0"] += s0
        r["t1"] += s0
        if best is None or r["score"] > best["score"]:
            best = r
    return best


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
    q_offset = int(q.get("offset") or 0)
    max_hits = max(1, min(int(opts.get("max_hits") or 8), 50))
    both = str(opts.get("strands") or "both").lower() != "plus"
    # For a map of corresponding regions rather than a search for one region.
    mask_query = bool(opts.get("mask_query"))

    if len(query) < 12:
        works.resolve({"status": "ERROR", "error": "the query region is too short to search with (%d bases)" % len(query)})
    elif len(target) < 12:
        works.resolve({"status": "ERROR", "error": "the track being searched has no sequence"})
    else:
        # Blocks when the caller is drawing a map (it masks the query too); otherwise the
        # blastn costs, which is what a search for one region wants.
        al = _aligner(blocks=mask_query)
        # A hit that scores no better than this is noise: the score two unrelated sequences
        # reach by chance grows with how much target there is to look in.
        floor = float(opts.get("min_score") or 0) or max(20.0, MATCH * 0.45 * min(len(query), 60))
        work = list(target)
        hits = []
        strands = [(1, query)] + ([(-1, _rc(query))] if both else [])
        narrowed = len(target) > WINDOW
        partial = False
        # SEEDS FIRST, THE WHOLE THING IF THEY FIND NOTHING.
        #
        # Exact k-mers say which few places are worth aligning, which turns a megabase
        # target into a handful of windows. Seeds can miss, though, and a search that
        # reports "no match" because a heuristic looked in the wrong places is the bug this
        # file exists to fix -- so when the seeded pass comes back empty the target is swept
        # in overlapping windows instead, and "nothing matched" is only ever said after
        # something has actually looked everywhere.
        if not narrowed:
            regions = {st: [(0, len(target))] for st, _q in strands}
        else:
            regions = {st: _candidate_regions(qs, target) for st, qs in strands}
        for _ in range(max_hits):
            best = None
            for strand, qseq in strands:
                reg = regions.get(strand) or []
                if not reg:
                    continue
                r = _scan(al, qseq, work, reg)
                if r and (best is None or r["score"] > best["score"]):
                    r["strand"] = strand
                    best = r
            if not best or best["score"] < floor:
                break
            hits.append(best)
            # Mask what was found, so the next pass finds the next place rather than this one.
            for i in range(best["t0"], best["t1"]):
                if 0 <= i < len(work):
                    work[i] = MASK_T
            # BOTH SIDES, when the query is a whole sequence rather than one region.
            #
            # Masking only the target lets the next pass match the SAME stretch of query
            # somewhere else, which is the right answer for "where does this exon turn up"
            # and the wrong one for "which regions of these two correspond": there the blocks
            # are supposed to tile the pair, and a query stretch that answers twice draws two
            # overlapping ribbons from one place.
            if mask_query:
                qwork = list(strands[0][1])
                for i in range(best["q0"], best["q1"]):
                    if 0 <= i < len(qwork):
                        qwork[i] = MASK_Q
                masked_q = "".join(qwork)
                strands = [(1, masked_q)] + ([(-1, _rc(masked_q))] if both else [])

        # Nothing, and the seeds chose where to look: look everywhere instead. `work` is
        # untouched because masking only happens after a hit, so this starts clean.
        if narrowed and not hits:
            started = time.time()
            chunks = _chunks(len(target), len(query))
            done = 0
            for (c0, c1) in chunks:
                best = None
                for strand, qseq in strands:
                    r = _scan(al, qseq, work, [(c0, c1)])
                    if r and (best is None or r["score"] > best["score"]):
                        r["strand"] = strand
                        best = r
                done += 1
                if best and best["score"] >= floor:
                    hits.append(best)
                    if len(hits) >= max_hits:
                        break
                if time.time() - started > TIME_BUDGET:
                    partial = True
                    break
            swept = done / float(len(chunks) or 1)
        else:
            swept = 1.0

        hits.sort(key=lambda h: -h["score"])
        out = []
        for rank, h in enumerate(hits, 1):
            cols = h["columns"] or 1
            # ORIENTATION. A minus-strand hit was found by aligning the REVERSE COMPLEMENT of
            # the query, so q0 and q1 are offsets into that reversed string. Reported as they
            # stand they point at the mirror-image position: near the end of the query for a
            # block that is near its start. Nothing about the number looks wrong, which is
            # exactly why it has to be converted back here rather than noticed later.
            if h["strand"] < 0:
                q0, q1 = len(query) - h["q1"], len(query) - h["q0"]
            else:
                q0, q1 = h["q0"], h["q1"]
            out.append({
                "rank": rank,
                "score": h["score"],
                "start": h["t0"] + offset, "end": h["t1"] + offset,
                "strand": "+" if h["strand"] > 0 else "-",
                "identity": h["identical"] / cols,
                "identical": h["identical"], "length": h["columns"], "gaps": h["gaps"],
                # In the query's own forward coordinates, with its offset applied, so both
                # sides of a block come back in the coordinates their track uses.
                "query_start": q0 + q_offset, "query_end": q1 + q_offset,
                # How much of the QUERY this hit accounts for: a 40-base match to a 170-base
                # exon is a different claim from a 170-base one, and the score alone hides it.
                "query_coverage": (q1 - q0) / len(query),
            })

        works.resolve({
            "status": "OK",
            "query": {"name": q.get("name") or "query", "length": len(query), "offset": q_offset},
            "target": {"name": t.get("name") or "target", "length": len(target), "offset": offset},
            "engine": "biopython PairwiseAligner, local, +%d/%d, gap %d/%d, %s"
                      % (int(MATCH), int(MISMATCH),
                         int(BLOCK_OPEN_GAP if mask_query else OPEN_GAP),
                         int(BLOCK_EXTEND_GAP if mask_query else EXTEND_GAP),
                         "both strands" if both else "plus strand"),
            "floor": floor,
            # What was actually looked at, so a caller can tell "nothing is there" from
            # "not all of it was searched" without guessing.
            "narrowed": bool(narrowed),
            "partial": bool(partial),
            "swept": round(swept, 4),
            "hits": out,
        })

except Exception as e:
    works.resolve({"status": "ERROR", "error": str(e)})
