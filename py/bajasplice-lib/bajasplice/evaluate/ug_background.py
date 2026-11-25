#!/usr/bin/env python
"""How often does an intronic window carry a UG array this long anyway?

THIS IS THE CONTROL THE CONSERVATION CLAIM NEVER HAD. The claim is that the
repressive element predates the exon it silences: mouse carries a 30-nt UG
array at the position orthologous to STMN2 exon 2a's acceptor while having no
exon there, and four New World monkeys carry UNC13A's 36-nt element above a
dead acceptor. Read as descent from a shared ancestral element, that inverts
the usual story, in which a spurious splice site drifts in and TDP-43 happens
to be sitting nearby.

The trouble is that UG-rich sequence is the most common low-complexity motif in
mammalian intronic DNA, and it is at its densest exactly where these elements
sit, immediately upstream of a 3' splice site, which is also where the
polypyrimidine tract lives. So an array of a given length at a given
orthologous position is not evidence of anything until you know the rate at
which matched windows carry one by chance. That rate is what this computes.

The matching is the whole instrument, so it is explicit:

  position   windows are taken from the 3' end of a real intron, the same place
             the observed elements sit, because a window drawn from the middle
             of an intron is a different sequence population. `--anywhere` also
             reports the unanchored rate, so the share of the rate that is just
             3' splice site context is visible rather than assumed.
  intron     sampled introns are held within `--length-tol` fold of the host
             intron, since long introns carry longer repeats.
  expression if an expression table is given, sampled genes are held to the
             host gene's decile. Without one the test is still valid, it is
             just matched on less, and the output says so rather than implying
             a control it did not run.

Run it as the species that carries the element, not as human: the question is
whether MOUSE intronic sequence produces a 30-mer at this rate, so it wants the
mouse genome and the mouse gene index.

  bajasplicemm evaluate ug-background --array-len 30 --gene Stmn2 --out mm.tsv

What the number means. If a quarter of matched windows carry an array that
long, the observation is noise and the claim has to come out of the title. If
it is a fraction of a percent, one locus is carrying a real signal and can be
reported as one locus carrying a real signal. Either way this does not test
descent, only occurrence: a rare array could still have arisen twice. The
descent test is a different instrument (divergence inside the array against its
own flanks) and it needs the alignment, not this.
"""
from __future__ import annotations

import argparse
import math
import random

import numpy as np
import pandas as pd

__all__ = ["longest_ug", "ug_fraction", "introns_of", "window_of", "wilson",
           "sample_windows"]

# The observations this is the null for, as measured in the alignment. Kept
# here so the defaults are reproducible, not because anything is hard-coded:
# every one is overridable and none is read unless asked for.
OBSERVED = {
    "STMN2": dict(species="mouse", array_len=30, gene="Stmn2"),
    "UNC13A": dict(species="marmoset", array_len=36, gene="UNC13A"),
}


def longest_ug(seq, max_interrupt=0):
    """Length in nucleotides of the longest (UG)n array in `seq`.

    An array is a stretch that reads as an alternating UG repeat in one of its
    two phases, allowing at most `max_interrupt` mismatching bases inside the
    stretch. Exact by construction rather than by regex, because a regex over
    alternation with interruptions silently prefers one phase.

    THE DEFINITION HAS TO MATCH THE ONE THE PAPER USED. If threshold_features
    exports an array scorer, this module uses that one instead and says so, so
    the two cannot drift apart unnoticed.
    """
    s = str(seq).upper().replace("U", "T")
    n = len(s)
    if n == 0:
        return 0
    best = 0
    for phase in (0, 1):
        # target[i] alternates T,G starting from `phase`
        bad = np.fromiter(
            ((s[i] != ("T" if (i + phase) % 2 == 0 else "G")) for i in range(n)),
            dtype=bool, count=n)
        lo = 0
        used = 0
        for hi in range(n):
            used += bool(bad[hi])
            while used > max_interrupt:
                used -= bool(bad[lo])
                lo += 1
            # a run may not start or end on a mismatch, or an interruption
            # budget would pad every array by one base at each end
            a, b = lo, hi
            while a <= b and bad[a]:
                a += 1
            while b >= a and bad[b]:
                b -= 1
            if b >= a:
                best = max(best, b - a + 1)
    return int(best)


def _scorer(max_interrupt):
    """The paper's array scorer if it is importable, otherwise ours."""
    try:
        from bajasplice.evaluate import threshold_features as tf
    except Exception:
        return longest_ug, "ug_background.longest_ug"
    for name in ("longest_ug", "ug_array_len", "array_len", "longest_array"):
        fn = getattr(tf, name, None)
        if callable(fn):
            try:
                if fn("GTGTGTGTGT") == 10:
                    return fn, f"threshold_features.{name}"
            except Exception:
                pass
    return longest_ug, "ug_background.longest_ug"


def ug_fraction(seq):
    s = str(seq).upper().replace("U", "T")
    if not s:
        return float("nan")
    pairs = [s[i:i + 2] for i in range(len(s) - 1)]
    return sum(p in ("TG", "GT") for p in pairs) / max(1, len(pairs))


def introns_of(exons):
    """[(start, end)] 1-based inclusive intronic spans, genomic order."""
    e = exons.sort_values("start")[["start", "end"]].to_numpy()
    out = []
    for i in range(len(e) - 1):
        s, t = int(e[i][1]) + 1, int(e[i + 1][0]) - 1
        if t >= s:
            out.append((s, t))
    return out


def window_of(intron, strand, width, offset=0):
    """The `width` bases ending `offset` before the intron's 3' splice site.

    Returned in genomic coordinates; the caller asks GenomeReader for it in
    transcript orientation. On the plus strand the acceptor is the intron's
    last base, on the minus strand its first, and getting that backwards reads
    the donor's neighbourhood instead, which is a different sequence
    population and would answer a question nobody asked.
    """
    s, t = intron
    if strand == "+":
        end = t - offset
        return (end - width + 1, end)
    start = s + offset
    return (start, start + width - 1)


def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def sample_windows(gi, genome, *, width, offset, n, length_lo, length_hi,
                   chroms, exclude=(), keep_genes=None, anywhere=False,
                   seed=0, min_intron=None):
    """Draw matched intronic windows and score each one's longest UG array."""
    rng = random.Random(seed)
    names = [r[0] for r in gi._con.execute("SELECT name FROM genes")]
    rng.shuffle(names)
    exclude = {x.upper() for x in exclude}
    keep = None if keep_genes is None else {x.upper() for x in keep_genes}
    min_intron = min_intron if min_intron is not None else width + offset + 50

    rows = []
    for name in names:
        if len(rows) >= n:
            break
        if name.upper() in exclude:
            continue
        if keep is not None and name.upper() not in keep:
            continue
        g = gi.gene(name)
        if not g or g["chrom"] not in chroms:
            continue
        try:
            ex = gi.exons(name)
        except Exception:
            continue
        if ex.empty:
            continue
        cand = [iv for iv in introns_of(ex)
                if (iv[1] - iv[0] + 1) >= max(min_intron, length_lo)
                and (iv[1] - iv[0] + 1) <= length_hi]
        if not cand:
            continue
        iv = rng.choice(cand)
        ilen = iv[1] - iv[0] + 1
        if anywhere:
            # a window wholly inside the intron, not anchored to either end
            lo = iv[0] + 30
            hi = iv[1] - 30 - width + 1
            if hi <= lo:
                continue
            s = rng.randint(lo, hi)
            win = (s, s + width - 1)
        else:
            win = window_of(iv, g["strand"], width, offset)
        seq = genome.sequence(g["chrom"], win[0], win[1], g["strand"])
        rows.append(dict(gene=name, chrom=g["chrom"], strand=g["strand"],
                         intron_len=ilen, start=win[0], end=win[1], seq=seq))
    return pd.DataFrame(rows)


def _expression_decile(path, gene, col=None):
    """Genes in the host gene's expression decile, or None if it cannot be done."""
    df = pd.read_csv(path, sep=None, engine="python")
    gcol = next((c for c in df.columns
                 if c.lower() in ("gene", "symbol", "gene_name", "name")), df.columns[0])
    if col is None:
        num = [c for c in df.columns if c != gcol and pd.api.types.is_numeric_dtype(df[c])]
        if not num:
            return None, "no numeric column in the expression table"
        col = num[0]
    df = df[[gcol, col]].dropna()
    df[gcol] = df[gcol].astype(str).str.upper()
    df = df.groupby(gcol, as_index=False)[col].mean()
    hit = df[df[gcol] == gene.upper()]
    if hit.empty:
        return None, f"{gene} is not in the expression table"
    v = float(hit[col].iloc[0])
    q = df[col].rank(pct=True)
    target = float(q[df[gcol] == gene.upper()].iloc[0])
    lo, hi = max(0.0, target - 0.05), min(1.0, target + 0.05)
    keep = df.loc[(q >= lo) & (q <= hi), gcol].tolist()
    return keep, f"{gene} at {v:.3g}, decile band {lo:.2f}-{hi:.2f}, {len(keep)} genes"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--array-len", type=int, default=30,
                    help="the observed array length the null is for (nt)")
    ap.add_argument("--gene", default=None,
                    help="host gene, used to match intron length and expression")
    ap.add_argument("--intron-len", type=int, default=None,
                    help="host intron length; taken from --gene's longest intron if absent")
    ap.add_argument("--window", type=int, default=100,
                    help="bases upstream of the 3' splice site to search")
    ap.add_argument("--offset", type=int, default=0,
                    help="bases between the window's 3' end and the acceptor")
    ap.add_argument("--max-interrupt", type=int, default=0,
                    help="non-UG bases tolerated inside an array")
    ap.add_argument("--length-tol", type=float, default=2.0,
                    help="fold band on intron length")
    ap.add_argument("--n", type=int, default=2000, help="matched windows to draw")
    ap.add_argument("--expression", default=None,
                    help="TSV/CSV of gene,value to match the host gene's decile")
    ap.add_argument("--expression-col", default=None)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None, help="write the per-window table here")
    args = ap.parse_args()

    from bajasplice.config import species
    from bajasplice.genome import GenomeReader
    from bajasplice.index import GeneIndex

    sp = species()
    gi = GeneIndex()
    genome = GenomeReader()
    base, score_src = _scorer(args.max_interrupt)
    if base is longest_ug:
        def score(seq):
            return longest_ug(seq, args.max_interrupt)
    else:
        score = base

    print(f"running as {sp.label} ({sp.assembly}); {gi.count()} genes in the index")
    print(f"array scorer: {score_src}")

    host_len = args.intron_len
    if host_len is None and args.gene:
        g = gi.gene(args.gene)
        if g:
            iv = introns_of(gi.exons(args.gene))
            if iv:
                host_len = max(b - a + 1 for a, b in iv)
    if host_len is None:
        host_len = 20000
        print("no host intron length given or found; matching on 20 kb, which is a guess")
    lo, hi = int(host_len / args.length_tol), int(host_len * args.length_tol)
    print(f"intron-length band: {lo}-{hi} nt (host {host_len})")

    keep = None
    if args.expression and args.gene:
        keep, why = _expression_decile(args.expression, args.gene, args.expression_col)
        print(f"expression matching: {why}")
        if keep is None:
            print("  falling back to no expression matching")
    else:
        print("expression matching: NOT DONE (no --expression), so the control is "
              "matched on position and intron length only")

    out = {}
    for anywhere in (False, True):
        w = sample_windows(gi, genome, width=args.window, offset=args.offset,
                           n=args.n, length_lo=lo, length_hi=hi,
                           chroms=set(sp.main_chroms), exclude=[args.gene] if args.gene else [],
                           keep_genes=keep, anywhere=anywhere, seed=args.seed)
        if w.empty:
            print("no windows survived the matching; widen --length-tol or drop --expression")
            raise SystemExit(2)
        w["array"] = [score(s) for s in w["seq"]]
        w["ug_frac"] = [ug_fraction(s) for s in w["seq"]]
        k = int((w["array"] >= args.array_len).sum())
        n = len(w)
        ci = wilson(k, n)
        label = "unanchored (middle of intron)" if anywhere else "at the 3' splice site"
        print(f"\n{label}: n={n}")
        print("  longest UG array  median %d, 90th %d, 99th %d, max %d"
              % (int(w["array"].median()), int(w["array"].quantile(0.90)),
                 int(w["array"].quantile(0.99)), int(w["array"].max())))
        print(f"  windows with an array >= {args.array_len} nt: {k}/{n} = {k/n:.4f} "
              f"(95% CI {ci[0]:.4f}-{ci[1]:.4f})")
        out["anywhere" if anywhere else "acceptor"] = w

    a, b = out["acceptor"], out["anywhere"]
    ka = int((a["array"] >= args.array_len).sum()) / len(a)
    kb = int((b["array"] >= args.array_len).sum()) / len(b)
    print(f"\n3' splice site context multiplies the rate by "
          f"{(ka / kb) if kb else float('inf'):.2f}x "
          f"({ka:.4f} against {kb:.4f}), which is how much of the element's "
          f"UG content is explained by where it sits rather than what it is")

    p = ka
    print(f"\nthe number for the paper: a matched {sp.label} window upstream of a real "
          f"acceptor carries a >= {args.array_len} nt UG array with probability {p:.4f}")
    if p >= 0.10:
        print("  AT THIS RATE THE OBSERVATION IS NOT EVIDENCE. One array of this length "
              "at one orthologous position is what the background produces anyway.")
    elif p >= 0.01:
        print("  marginal: the array is uncommon but a single locus will not carry a claim. "
              "Report it as one observation with this rate beside it.")
    else:
        print("  the array is rare enough that its presence at the orthologous position "
              "needs an explanation. Occurrence only: descent still has to be shown "
              "against recurrence.")

    if args.out:
        both = pd.concat([a.assign(anchor="acceptor"), b.assign(anchor="anywhere")])
        both.drop(columns=["seq"]).to_csv(args.out, sep="\t", index=False)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
