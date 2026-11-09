"""Find events whose PSI cannot be trusted because the reads do not map uniquely.

WHY THIS EXISTS. SMN2 exon 7 is in cassette.tsv with a median PSI of 0.84 across
54 tissues and 256,818 reads. The true figure is about 0.10: exon 7 skipping is
the whole reason SMA is a disease. SMN1 sits 99.9% identical a short distance
away, its exon 7 is essentially always included, short reads do not distinguish
the two, so the measured value is a blend dominated by the wrong gene. PSINet
then learned that label and predicted 0.9652, which looked like a model failure
and was a data failure.

Nothing in prepare/ filters for this, so every segmental duplication in the
genome contributes corrupted labels. Two ways to catch it:

  paralog_pairs()  needs nothing but the genome. Exons that share sequence with
                   an exon in ANOTHER gene are found by minhash, which tolerates
                   the handful of differences real paralogs carry -- SMN1 and
                   SMN2 exon 7 differ by one base, so exact matching misses them
                   and a k-mer sketch does not.

  overlapping()    the correct version when you have a track: a segmental
                   duplication or low-mappability BED, from UCSC or elsewhere.

Neither is applied automatically. Dropping events changes what the model is
trained on, so it is a decision to take deliberately, with the count in view.
"""
from __future__ import annotations

import numpy as np

# Sketch size. More hashes means fewer missed paralogs and more spurious pairs;
# 4 catches a pair differing at one base in a 54-mer with probability well over
# 0.99 while leaving unrelated exons almost always apart.
N_HASH = 4
KMER = 21


def _kmer_hashes(seq, k=KMER, n=N_HASH):
    """n minimum 64-bit hashes over the k-mers of seq (a minhash sketch)."""
    if len(seq) < k:
        seq = seq.ljust(k, "N")
    out = []
    for s in range(n):
        best = None
        for i in range(len(seq) - k + 1):
            h = hash((s, seq[i:i + k])) & 0xFFFFFFFFFFFFFFF
            if best is None or h < best:
                best = h
        out.append(best)
    return out


def paralog_pairs(ev, genome=None, limit=None, progress=None):
    """Flag events whose cassette exon shares sequence with one in another gene.

    Returns a boolean array over `ev`. True means the exon has a near-identical
    twin elsewhere, so its junction reads are not uniquely assignable and its
    PSI should not be believed.
    """
    from .genome import GenomeReader
    g = genome or GenomeReader()
    n = len(ev) if limit is None else min(limit, len(ev))

    buckets = {}
    sketches = []
    for i in range(n):
        r = ev.iloc[i]
        codes = g.codes(str(r.chrom), int(r.a_start), int(r.a_end), str(r.strand))
        seq = "".join("NACGT"[int(v)] for v in codes)
        hs = _kmer_hashes(seq)
        sketches.append(hs)
        for s, h in enumerate(hs):
            buckets.setdefault((s, h), []).append(i)
        if progress and i % 20000 == 0:
            progress(i, n)

    gene = ev["gene_name"].astype(str).values if "gene_name" in ev.columns \
        else ev["gene_id"].astype(str).values
    flag = np.zeros(n, dtype=bool)
    for members in buckets.values():
        if len(members) < 2:
            continue
        names = {gene[j] for j in members}
        if len(names) > 1:                 # same sequence, different genes
            for j in members:
                flag[j] = True
    return flag


def overlapping(ev, bed_path):
    """Flag events whose cassette exon overlaps any interval in a BED file."""
    import collections
    iv = collections.defaultdict(list)
    with open(bed_path) as fh:
        for line in fh:
            if not line.strip() or line.startswith(("#", "track", "browser")):
                continue
            f = line.split()
            iv[f[0]].append((int(f[1]), int(f[2])))
    for c in iv:
        iv[c].sort()

    flag = np.zeros(len(ev), dtype=bool)
    for i in range(len(ev)):
        r = ev.iloc[i]
        lo, hi = int(r.a_start), int(r.a_end)
        for s, e in iv.get(str(r.chrom), ()):
            if s > hi:
                break
            if e >= lo:
                flag[i] = True
                break
    return flag
