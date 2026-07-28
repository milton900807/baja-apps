import math
from collections import Counter, defaultdict

from ion import works
import tempfile
seq = works.param(1)


# ---------- IUPAC helpers ----------
IUPAC_TO_SET = {
    'A': {'A'}, 'C': {'C'}, 'G': {'G'}, 'T': {'T'},
    'R': {'A','G'}, 'Y': {'C','T'}, 'S': {'G','C'}, 'W': {'A','T'},
    'K': {'G','T'}, 'M': {'A','C'},
    'B': {'C','G','T'}, 'D': {'A','G','T'}, 'H': {'A','C','T'}, 'V': {'A','C','G'},
    'N': {'A','C','G','T'}
}
SET_TO_IUPAC = {frozenset(v): k for k, v in IUPAC_TO_SET.items()}

def iupac_for(chars):
    """Return IUPAC code for a set of bases; fall back to 'N'."""
    return SET_TO_IUPAC.get(frozenset(chars), 'N')

def consensus_iupac(kmers):
    """Make a simple IUPAC consensus for equal-length kmers."""
    if not kmers:
        return ""
    L = len(kmers[0])
    cols = [set() for _ in range(L)]
    for k in kmers:
        for i, ch in enumerate(k):
            cols[i].add(ch)
    return "".join(iupac_for(c) for c in cols)

# ---------- core counting ----------
def count_kmers(seq, k):
    s = seq.upper()
    return Counter(s[i:i+k] for i in range(len(s)-k+1))

def mono_freqs(seq):
    s = seq.upper()
    c = Counter(ch for ch in s if ch in "ACGT")
    n = sum(c.values()) or 1
    return {b: c.get(b,0)/n for b in "ACGT"}

def expected_count_independent(seq_len, kmer, mono):
    """Expected count under i.i.d. background."""
    p = 1.0
    for ch in kmer:
        p *= mono.get(ch, 0.0)
    return max(0.0, (seq_len - len(kmer) + 1) * p)

def z_score(obs, exp):
    # Poissonish variance ~ exp; guard small exp
    var = max(exp, 1e-6)
    return (obs - exp) / math.sqrt(var)

# ---------- utilities ----------
def positions_of(seq, pattern):
    """All start positions of exact 'pattern' (no gaps) in seq."""
    s = seq.upper()
    p = pattern.upper()
    pos = []
    i = s.find(p, 0)
    while i != -1:
        pos.append(i)
        i = s.find(p, i+1)
    return pos

def spaced_repeats(seq, seed, min_repeats=2, min_support=2):
    """
    Look for repetitions of 'seed' with a constant gap: seed + gap + seed (+ gap + seed ...).
    Returns list of (motif_string, repeat_count, gap, occurrences),
    where motif_string uses '*' as one-base wildcard, e.g. 'GT***GT***GT'.
    """
    s = seq.upper()
    k = len(seed)
    pos = positions_of(s, seed)
    if len(pos) < 2:
        return []
    # compute gaps between consecutive occurrences (distance minus k)
    gap_counts = Counter()
    gaps_by_index = []
    for a, b in zip(pos, pos[1:]):
        g = b - a - k
        if g >= 0:
            gap_counts[g] += 1
            gaps_by_index.append(g)
        else:
            gaps_by_index.append(None)

    results = []
    # consider gaps that appear often enough
    for g, cnt in gap_counts.items():
        if cnt < min_support:
            continue
        # build runs where the same gap repeats r times (=> r+1 seeds)
        run = 1
        best = 1
        occurrences = []
        i = 0
        while i < len(pos) - 1:
            if pos[i+1] - pos[i] - k == g:
                start = i
                run = 2
                j = i + 1
                while j < len(pos) - 1 and pos[j+1] - pos[j] - k == g:
                    run += 1
                    j += 1
                best = max(best, run)
                if run >= min_repeats:
                    occurrences.append((pos[start], pos[j] + k))
                i = j + 1
            else:
                i += 1
        if best >= min_repeats and occurrences:
            motif = (seed + ("*"*g + seed) * (best-1)) if g > 0 else (seed * best)
            results.append((motif, best, g, occurrences))
    return results

def hamming(a, b):
    return sum(x != y for x, y in zip(a, b))

# ---------- main discovery ----------
def discover_motifs(seq,
                    kmin=2, kmax=5,
                    top_k_per_size=50,
                    min_enrichment=2.0,
                    min_support=3,
                    cluster_hamming=1):
    """
    Discover motif candidates from a single sequence.

    Returns: list of dicts:
      {
        'motif': 'TGCA*TGCA',        # string with IUPAC letters and '*' (one-base wildcard). Runs of '*' mean fixed gaps.
        'type': 'enriched|spaced_repeat|tandem_repeat|consensus_cluster',
        'k': 4,                      # seed k (if applicable)
        'support': 12,               # number of occurrences (or spans)
        'enrichment': 5.4,           # obs/exp (if applicable)
        'z': 9.2,                    # z-score (if applicable)
        'positions': [ ... ],        # start positions or (start,end) spans
        'details': {...}             # extra info
      }
    """
    s = ''.join(ch for ch in seq.upper() if ch in "ACGT")
    n = len(s)
    mono = mono_freqs(s)
    candidates = []

    # 1) Enriched exact k-mers (seeds)
    enriched_seeds_by_k = {}
    for k in range(kmin, kmax+1):
        counts = count_kmers(s, k)
        scored = []
        for kmer, obs in counts.items():
            exp = expected_count_independent(n, kmer, mono)
            enr = (obs / exp) if exp > 0 else float('inf')
            z = z_score(obs, exp) if exp > 0 else float('inf')
            if obs >= min_support and enr >= min_enrichment:
                scored.append((kmer, obs, enr, z))
        scored.sort(key=lambda x: (-x[3], -x[2], -x[1]))  # prioritize z, then enrichment, then count
        enriched = scored[:top_k_per_size]
        enriched_seeds_by_k[k] = enriched

        # Add as "enriched" motifs
        for kmer, obs, enr, z in enriched:
            pos = positions_of(s, kmer)
            candidates.append({
                'motif': kmer,
                'type': 'enriched',
                'k': k,
                'support': obs,
                'enrichment': enr,
                'z': z,
                'positions': pos,
                'details': {}
            })

    # 2) Spaced repeats from enriched seeds (e.g., GT***GT)
    for k, enriched in enriched_seeds_by_k.items():
        for kmer, obs, enr, z in enriched:
            sr = spaced_repeats(s, kmer, min_repeats=3, min_support=2)  # need at least 3 copies
            for motif, repeats, gap, spans in sr:
                candidates.append({
                    'motif': motif,
                    'type': 'spaced_repeat',
                    'k': k,
                    'support': len(spans),
                    'enrichment': None,
                    'z': None,
                    'positions': spans,   # list of (start,end) spans covering the whole repeated block
                    'details': {'seed': kmer, 'gap': gap, 'repeat_count': repeats}
                })

    # 3) Tandem repeats for units of 1..4 bp (e.g., (CA){3,})
    for unit_len in range(1, min(4, kmax)+1):
        i = 0
        while i <= n - unit_len:
            unit = s[i:i+unit_len]
            j = i + unit_len
            while j <= n - unit_len and s[j:j+unit_len] == unit:
                j += unit_len
            reps = (j - i) // unit_len
            if reps >= 3:
                candidates.append({
                    'motif': f'({unit})' + '{3,}',
                    'type': 'tandem_repeat',
                    'k': unit_len,
                    'support': reps,
                    'enrichment': None,
                    'z': None,
                    'positions': [(i, j)],
                    'details': {'unit': unit, 'min_repeats': 3}
                })
                i = j
            else:
                i += 1

    # 4) Cluster enriched seeds by Hamming distance and make IUPAC consensus
    for k, enriched in enriched_seeds_by_k.items():
        seeds = [e[0] for e in enriched]
        used = set()
        for i, a in enumerate(seeds):
            if a in used:
                continue
            cluster = [a]
            used.add(a)
            for b in seeds[i+1:]:
                if b in used:
                    continue
                if len(b) == len(a) and hamming(a, b) <= cluster_hamming:
                    cluster.append(b)
                    used.add(b)
            if len(cluster) >= max(3, min_support):
                motif = consensus_iupac(cluster)
                # positions: union of exact occurrences of all cluster members
                pos = sorted({p for kmer in cluster for p in positions_of(s, kmer)})
                candidates.append({
                    'motif': motif,
                    'type': 'consensus_cluster',
                    'k': k,
                    'support': len(pos),
                    'enrichment': None,
                    'z': None,
                    'positions': pos,
                    'details': {'members': cluster}
                })

    # Rank candidates: prioritize repeats & consensus, then enriched by z
    def rank_key(c):
        tprio = {'spaced_repeat': 0, 'tandem_repeat': 1, 'consensus_cluster': 2, 'enriched': 3}
        return (tprio.get(c['type'], 9), -(c['support'] or 0), -(c.get('z') or 0.0))

    candidates.sort(key=rank_key)
    return candidates


motifs = discover_motifs(seq)
works.resolve(motifs)


# # ---------- quick demo ----------
# if __name__ == "__main__":
#     seq = "AACCAAGGCAACATGCAGAGGGAGCCAAACCAGGCCTTCGGTTCTGGAAATAACTCTTATAGTGGCTCTAATTCTGGTGCA"
#     motifs = discover_motifs(seq)
#     for m in motifs[:10]:
#         print(f"{m['type']:>16}  {m['motif']:<20}  support={m['support']}  k={m['k']}  z={m.get('z')}")
