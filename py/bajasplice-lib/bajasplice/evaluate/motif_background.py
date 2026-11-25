#!/usr/bin/env python
"""Is TDP-43 special, or does every repressive RBP sit on a rare element?

The UG arrays at STMN2 and UNC13A are far into the tail of what matched
intronic sequence supplies: 3 of 2,000 matched mouse windows reach 30 nt, and
no marmoset window reaches the UNC13A element at all. That is only interesting
if it is not true of every repressor. Polypyrimidine tracts are everywhere, so
a long U-tract beside an hnRNPC-repressed exon would mean nothing; a long UG
array is rare, so one beside a TDP-43-repressed exon might mean something. The
two cannot be compared by length. They can be compared by rank within each
motif's own intronic background, which is what this does.

The design uses only files already on disk from the ENCODE path:

  encode_events.tsv     one row per cassette event, with flanking coordinates
  encode_dpsi.npy       delta-PSI per event per knockdown
  encode_dpsi_z.npy     the same, as a robust z against the event's own
                        distribution across all knockdowns in that cell line
  encode_dpsi_cols.tsv  knockdown metadata, including the RBP target

For each RBP, the repressed set is the events whose inclusion goes UP on
knockdown, at the same thresholds build_rbp_matrix uses (|z| >= 4, dPSI >=
0.10). The score for an event is the longest run of the RBP's motif, or the
count of it, in the last 100 bases of the upstream intron. The background is
the same score over events that RBP does not repress, matched on upstream
intron length decile. The per-RBP statistics are the median in each group, the
fraction of repressed events beyond the background's 99th percentile, and a
rank-sum p.

TWO THINGS THE FIRST RUN GOT WRONG, both fixed here. It scored the upstream
intron only, and the STMN2 array sits about 48 to 76 nt PAST the exon start,
so the one locus the whole comparative argument rests on was never in the
window; `--side both` now scores each flank and takes the larger. And the
ENCODE event table is annotated cassette exons on GENCODE coordinates, while
cryptic exons are unannotated by definition, so a TARDBP-repressed set drawn
from it is a different population from the cryptic exons the buffer argument
is about; `--events` takes a cryptic junction table and scores it against the
same matched background.

WHAT THIS DOES NOT TEST. It says nothing about the order of acquisition, which
is the actual buffer claim and needs the alignment, one locus at a time.
hnRNPC is the control that matters there, not here: its cryptic exons come from
antisense Alu insertions that arrive carrying both the U-tract and the 3' splice
site, so element and exon are necessarily the same age. If the ortholog test
reports the element as older at hnRNPC loci too, the method is manufacturing
precedence and the TDP-43 result means nothing. Run that before believing the
comparative claim, whatever this returns.

SRSF1 is in the table as a negative control: it is an enhancer, so its motif
should show no enrichment beside exons that lose inclusion on its knockdown,
and the sign of its effect is the opposite one anyway.
"""
from __future__ import annotations

import argparse
import itertools
import re

import numpy as np
import pandas as pd

__all__ = ["longest_repeat", "motif_count", "expand_iupac", "acceptor_window",
           "exon_window", "matched_background", "parse_junction",
           "events_from_junctions", "bh", "MOTIFS"]


def bh(p):
    """Benjamini-Hochberg adjusted p-values, order preserved."""
    p = np.asarray(p, dtype="float64")
    ok = np.isfinite(p)
    out = np.full(p.shape, np.nan)
    v = p[ok]
    n = len(v)
    if n == 0:
        return out
    order = np.argsort(v)
    ranked = v[order] * n / (np.arange(n) + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    adj = np.empty(n)
    adj[order] = np.minimum(ranked, 1.0)
    out[ok] = adj
    return out

Z_THR, DPSI_THR = 4.0, 0.10

# unit, mode. "run" = longest stretch reading as a repeat of the unit, which is
# the right statistic for a repeat or a tract, where the protein's affinity
# rises with length. "count" = occurrences, which is the right statistic for a
# short defined motif, where length is fixed and a second copy is what adds
# affinity. Motifs are the consensus from eCLIP and from the older
# selection work; IUPAC codes are allowed and expanded.
MOTIFS = {
    "TARDBP":  ("TG",     "run"),     # (UG)n
    "HNRNPL":  ("CA",     "run"),     # (CA)n, the other slippage-prone repeat
    "HNRNPC":  ("T",      "run"),     # U-tract
    "TIA1":    ("T",      "run"),
    "PTBP1":   ("CT",     "run"),     # CU-rich
    "HNRNPF":  ("G",      "run"),     # G-tract
    "HNRNPH1": ("G",      "run"),
    "RBFOX2":  ("GCATG",  "count"),
    "QKI":     ("ACTAAY", "count"),
    "MBNL1":   ("YGCY",   "count"),
    "NOVA1":   ("YCAY",   "count"),
    "NOVA2":   ("YCAY",   "count"),
    "HNRNPA1": ("TAGGGA", "count"),
    "SRSF1":   ("GGAGGA", "count"),   # enhancer, negative control
}

_IUPAC = {"A": "A", "C": "C", "G": "G", "T": "T",
          "R": "AG", "Y": "CT", "S": "CG", "W": "AT", "K": "GT", "M": "AC",
          "B": "CGT", "D": "AGT", "H": "ACT", "V": "ACG", "N": "ACGT"}


def expand_iupac(motif):
    """Every concrete sequence a possibly-degenerate motif stands for."""
    pools = [_IUPAC[c] for c in str(motif).upper().replace("U", "T")]
    return ["".join(p) for p in itertools.product(*pools)]


def longest_repeat(seq, unit, max_interrupt=0):
    """Length in nt of the longest stretch reading as a repeat of `unit`.

    Generalizes the UG-array scorer to any unit: a homopolymer for a tract
    (unit "T"), a dinucleotide for a repeat (unit "TG" or "CA"). Every phase of
    the unit is tried, at most `max_interrupt` mismatching bases are tolerated
    inside the stretch, and a stretch may not begin or end on a mismatch, or
    the budget would pad every run by a base at each end.

    An insertion inside a repeat flips the phase and is therefore NOT bridged,
    which is correct: to a protein reading the repeat, a slipped array that
    gained a base is two arrays.
    """
    s = str(seq).upper().replace("U", "T")
    u = str(unit).upper().replace("U", "T")
    n, k = len(s), len(u)
    if n == 0 or k == 0:
        return 0
    ok = [set(_IUPAC[c]) for c in u]
    best = 0
    for phase in range(k):
        bad = np.fromiter((s[i] not in ok[(i - phase) % k] for i in range(n)),
                          dtype=bool, count=n)
        lo = used = 0
        for hi in range(n):
            used += bool(bad[hi])
            while used > max_interrupt:
                used -= bool(bad[lo])
                lo += 1
            a, b = lo, hi
            while a <= b and bad[a]:
                a += 1
            while b >= a and bad[b]:
                b -= 1
            if b >= a:
                best = max(best, b - a + 1)
    return int(best)


def motif_count(seq, motif):
    """Occurrences of a possibly-degenerate motif, overlapping counted."""
    s = str(seq).upper().replace("U", "T")
    words = set(expand_iupac(motif))
    k = len(next(iter(words)))
    return sum(s[i:i + k] in words for i in range(max(0, len(s) - k + 1)))


def acceptor_window(row, width, offset=0):
    """The `width` bases of upstream intron ending `offset` before the acceptor.

    THE ACCEPTOR IS NOT THE EXON START ON BOTH STRANDS. In transcript
    orientation the upstream intron runs c1_end+1 to a_start-1 on the plus
    strand and a_end+1 to c2_start-1 on the minus strand, and the acceptor is
    the intron base adjacent to the exon in each case. Getting this backwards
    reads the downstream intron, which is a different sequence population.
    """
    if row["strand"] == "+":
        end = int(row["a_start"]) - 1 - offset
        start = end - width + 1
        floor = int(row["c1_end"]) + 1
        return (max(start, floor), end)
    start = int(row["a_end"]) + 1 + offset
    end = start + width - 1
    ceil = int(row["c2_start"]) - 1
    return (start, min(end, ceil))


def exon_window(row, width, offset=0):
    """The `width` bases running downstream from the acceptor, exon first.

    The STMN2 array is roughly 48 to 76 nt past the exon start, so a repressive
    element is not always upstream of the site it silences and scoring one
    flank answers a narrower question than the one being asked.
    """
    if row["strand"] == "+":
        start = int(row["a_start"]) + offset
        end = start + width - 1
        return (start, min(end, int(row["c2_start"]) - 1))
    end = int(row["a_end"]) - offset
    start = end - width + 1
    return (max(start, int(row["c1_end"]) + 1), end)


def _intron_up_len(ev):
    up = np.where(ev["strand"].to_numpy() == "+",
                  ev["a_start"].to_numpy() - ev["c1_end"].to_numpy() - 1,
                  ev["c2_start"].to_numpy() - ev["a_end"].to_numpy() - 1)
    return up


def matched_background(ev, hits, n, seed=0):
    """Events outside `hits`, matched to the hits' upstream intron length deciles.

    A DECILE CAN BE EMPTY OF NON-HITS. If an RBP's repressed events fill a
    length stratum, that stratum has no background left in it, and drawing
    nothing there silently changes what the comparison is matched on. Here the
    shortfall is filled from the nearest deciles and recorded in
    `.attrs["shortfall"]` as the fraction of the requested draw that had to
    come from a neighbouring stratum, so a caller can report it instead of
    discovering it later.
    """
    rng = np.random.default_rng(seed)
    ev = ev.copy()
    ev["up_len"] = _intron_up_len(ev)
    ev = ev[ev["up_len"] > 0]
    ev["decile"] = pd.qcut(ev["up_len"], 10, labels=False, duplicates="drop")
    hits = set(hits)
    want = ev.loc[ev.index.isin(hits), "decile"].value_counts()
    if want.empty:
        out = ev.iloc[:0]
        out.attrs["shortfall"] = 1.0
        return out
    pool = ev[~ev.index.isin(hits)]
    deciles = sorted(ev["decile"].dropna().unique())

    taken, used, short = [], set(), 0
    for d, k_hits in want.items():
        target = max(1, int(round(n * k_hits / want.sum())))
        # own decile first, then outward to the nearest ones
        for dd in sorted(deciles, key=lambda x: abs(x - d)):
            if target <= 0:
                break
            cand = np.array([i for i in pool.index[pool["decile"] == dd]
                             if i not in used])
            if len(cand) == 0:
                continue
            k = min(len(cand), target)
            pick = rng.choice(cand, size=k, replace=False).tolist()
            taken.extend(pick)
            used.update(pick)
            if dd != d:
                short += k
            target -= k

    out = ev.loc[taken]
    out.attrs["shortfall"] = (short / len(taken)) if taken else 1.0
    return out


def _score_rows(rows, genome, scorer, width, offset, side="both"):
    """Score each row on the chosen flank; `both` takes the larger of the two.

    Returns (score, up, down) so a caller can report which flank carries the
    signal rather than only that one of them did.
    """
    sc, ups, downs = [], [], []
    for _, r in rows.iterrows():
        u = d = np.nan
        if side in ("up", "both"):
            a, b = acceptor_window(r, width, offset)
            if b >= a:
                u = scorer(genome.sequence(r["chrom"], a, b, r["strand"]))
        if side in ("down", "both"):
            a, b = exon_window(r, width, offset)
            if b >= a:
                d = scorer(genome.sequence(r["chrom"], a, b, r["strand"]))
        ups.append(u)
        downs.append(d)
        both = [x for x in (u, d) if np.isfinite(x)]
        sc.append(max(both) if both else np.nan)
    f = lambda z: np.asarray(z, dtype="float64")
    return f(sc), f(ups), f(downs)


_JUNC = re.compile(r"(chr[\w.]+)\s*[:_]\s*([\d,]+)\s*[-_]\s*([\d,]+)")


def parse_junction(text):
    """chr8:79,611,214-79,616,822 -> ("chr8", 79611214, 79616822)."""
    m = _JUNC.search(str(text))
    if not m:
        return None
    return (m.group(1), int(m.group(2).replace(",", "")),
            int(m.group(3).replace(",", "")))


def events_from_junctions(path, gene_index=None, exon_len=100):
    """A cryptic junction table as rows shaped like encode_events.tsv.

    The junction gives the intron, so the acceptor and the upstream intron
    length are real. The cryptic exon's far end is not in the table, so a
    nominal length is used; it only bounds the downstream window and never
    enters the matching.
    """
    df = pd.read_csv(path, sep=None, engine="python")
    jcol = next((c for c in df.columns
                 if df[c].astype(str).map(lambda v: parse_junction(v) is not None).any()), None)
    if jcol is None:
        raise SystemExit(f"no column in {path} holds a junction like chr8:79,611,214-79,616,822")
    gcol = next((c for c in df.columns
                 if c.lower() in ("gene", "symbol", "gene_name", "name")), None)
    scol = next((c for c in df.columns if c.lower() == "strand"), None)

    rows = []
    for _, r in df.iterrows():
        j = parse_junction(r[jcol])
        if not j:
            continue
        chrom, lo, hi = j
        strand = None
        if scol and str(r[scol]) in ("+", "-"):
            strand = str(r[scol])
        elif gene_index is not None:
            name = str(r[gcol]) if gcol else str(r[jcol]).split()[0].strip("()")
            g = gene_index.gene(name)
            if g:
                strand = g["strand"]
        if strand is None:
            continue
        # THE OFF-BY-ONE HERE IS THE WHOLE FILE'S CORRECTNESS. By the project's
        # junction convention the acceptor, meaning the LAST INTRON BASE, is
        # end - 1 on the plus strand and start + 1 on the minus strand, so the
        # junction's far coordinate is the cryptic exon's first base in
        # transcript orientation. STMN2's chr8:79,611,214-79,616,822 therefore
        # has to come out at acceptor 79,616,821; main() prints the first few
        # so that is checkable rather than assumed.
        if strand == "+":
            rows.append(dict(chrom=chrom, strand="+", c1_end=lo, a_start=hi,
                             a_end=hi + exon_len - 1, c2_start=hi + exon_len + 1000))
        else:
            rows.append(dict(chrom=chrom, strand="-", c2_start=hi, a_end=lo,
                             a_start=lo - exon_len + 1, c1_end=lo - exon_len - 1000))
    if not rows:
        raise SystemExit(f"no usable rows in {path}: need a strand column or gene symbols "
                         "the gene index can resolve")
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rbp", action="append", default=None,
                    help="RBP to test; repeatable. Default: every RBP in the motif table.")
    ap.add_argument("--motif", default=None, help="override the motif for a single --rbp")
    ap.add_argument("--mode", choices=["run", "count"], default=None,
                    help="override the statistic for a single --rbp")
    ap.add_argument("--side", choices=["up", "down", "both"], default="both",
                    help="which flank to score; both takes the larger of the two")
    ap.add_argument("--events", default=None,
                    help="a cryptic junction table to score instead of the ENCODE "
                         "repressed set; the background stays the matched ENCODE events")
    ap.add_argument("--events-label", default="events",
                    help="name for the --events row in the output")
    ap.add_argument("--window", type=int, default=100)
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--max-interrupt", type=int, default=0)
    ap.add_argument("--background", type=int, default=2000)
    ap.add_argument("--min-hits", type=int, default=15)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    import os
    from scipy.stats import mannwhitneyu
    from bajasplice.config import paths, species
    from bajasplice.genome import GenomeReader
    from bajasplice.index import GeneIndex

    sp = species()
    interim = str(paths().interim)
    need = ["encode_events.tsv", "encode_dpsi.npy", "encode_dpsi_z.npy",
            "encode_dpsi_cols.tsv"]
    missing = [f for f in need if not os.path.exists(os.path.join(interim, f))]
    if missing:
        raise SystemExit(
            "missing " + ", ".join(missing) + f" in {interim}.\n"
            f"Build them first: `{sp.command} prepare encode-psi` then "
            f"`{sp.command} prepare encode-dpsi`.")

    ev = pd.read_csv(os.path.join(interim, "encode_events.tsv"), sep="\t")
    cols = pd.read_csv(os.path.join(interim, "encode_dpsi_cols.tsv"), sep="\t")
    D = np.load(os.path.join(interim, "encode_dpsi.npy"))
    Z = np.load(os.path.join(interim, "encode_dpsi_z.npy"))
    if len(ev) != D.shape[0]:
        raise SystemExit(f"encode_events.tsv has {len(ev)} rows, dPSI has {D.shape[0]}; "
                         "these were built from different runs")

    genome = GenomeReader()
    custom = None
    if args.events:
        custom = events_from_junctions(args.events, GeneIndex())
        print(f"{len(custom)} junctions usable from {args.events}")
        print("CHECK THESE ACCEPTORS before trusting anything below "
              "(STMN2's junction must give 79,616,821):")
        for _, r in custom.head(4).iterrows():
            acc = (int(r.a_start) - 1) if r.strand == "+" else (int(r.a_end) + 1)
            print(f"  {r.chrom}:{acc:,} ({r.strand})  upstream intron "
                  f"{int(abs((r.c2_start - r.a_end) if r.strand == '-' else (r.a_start - r.c1_end))) - 1:,} nt")
    targets = args.rbp or sorted(MOTIFS)
    if args.motif and len(targets) != 1:
        raise SystemExit("--motif applies to a single --rbp")

    print(f"running as {sp.label} ({sp.assembly}); {len(ev):,} events, "
          f"{cols.target.nunique()} RBPs knocked down")
    print(f"repressed set per RBP: inclusion UP on knockdown, z >= {Z_THR}, "
          f"dPSI >= {DPSI_THR}; window {args.window} nt ending at the acceptor\n")

    rows = []
    for rbp in targets:
        if args.motif:
            unit, mode = args.motif, (args.mode or "run")
        elif rbp in MOTIFS:
            unit, mode = MOTIFS[rbp]
            mode = args.mode or mode
        else:
            print(f"{rbp}: no motif on file, skipped (pass --motif)")
            continue

        if custom is not None:
            hit_rows, hits, label = custom, set(), f"{rbp}/{args.events_label}"
        else:
            j = np.flatnonzero(cols.target.to_numpy() == rbp)
            if len(j) == 0:
                print(f"{rbp}: not knocked down in this dataset, skipped")
                continue
            up = ((Z[:, j] >= Z_THR) & (D[:, j] >= DPSI_THR)).any(axis=1)
            hits = set(ev.index[up])
            if len(hits) < args.min_hits:
                print(f"{rbp}: {len(hits)} repressed events, below --min-hits, skipped")
                continue
            hit_rows, label = ev.loc[sorted(hits)], rbp

        if mode == "run":
            scorer = lambda s, u=unit: longest_repeat(s, u, args.max_interrupt)
        else:
            scorer = lambda s, u=unit: motif_count(s, u)

        bg = matched_background(ev, hits, args.background, seed=args.seed)
        shortfall = float(bg.attrs.get("shortfall", 0.0))
        a, a_up, a_dn = _score_rows(hit_rows, genome, scorer, args.window,
                                    args.offset, args.side)
        b, _, _ = _score_rows(bg, genome, scorer, args.window, args.offset, args.side)
        a, b = a[np.isfinite(a)], b[np.isfinite(b)]
        if len(a) < args.min_hits or len(b) < 100:
            print(f"{rbp}: {len(a)} scored hits, {len(b)} scored background, skipped")
            continue

        q99 = float(np.percentile(b, 99))
        frac = float((a > q99).mean())
        try:
            p = float(mannwhitneyu(a, b, alternative="greater").pvalue)
        except ValueError:
            p = float("nan")
        if shortfall > 0.25:
            print(f"{rbp}: {shortfall:.0%} of the background had to come from "
                  "neighbouring intron-length strata; treat the matching as partial")
        med_up = float(np.nanmedian(a_up)) if np.isfinite(a_up).any() else float("nan")
        med_dn = float(np.nanmedian(a_dn)) if np.isfinite(a_dn).any() else float("nan")
        rows.append(dict(rbp=label, motif=unit, mode=mode, side=args.side,
                         n_hits=len(a), n_bg=len(b), median_hit=float(np.median(a)),
                         median_bg=float(np.median(b)), bg_q99=q99,
                         frac_above_q99=frac, p_greater=p,
                         median_hit_up=med_up, median_hit_down=med_dn,
                         bg_shortfall=shortfall))
        print(f"{label:16s} {unit:7s} {mode:5s} n={len(a):5d}  median {np.median(a):5.1f} "
              f"against {np.median(b):5.1f}  bg 99th {q99:5.1f}  "
              f"beyond it {frac:6.3f}  p {p:.2e}   up {med_up:4.1f} / down {med_dn:4.1f}")

    if not rows:
        raise SystemExit("\nnothing testable; check the RBP names against encode_dpsi_cols.tsv")

    df = pd.DataFrame(rows)
    df["p_adj"] = bh(df["p_greater"].to_numpy())
    df = df.sort_values("frac_above_q99", ascending=False)
    print("\nranked by the share of repressed events beyond their own motif's "
          "99th percentile:")
    print(df[["rbp", "motif", "mode", "n_hits", "frac_above_q99", "p_greater", "p_adj"]]
          .to_string(index=False))

    tard = df[df.rbp.astype(str).str.startswith("TARDBP")]
    if len(tard):
        t = tard.iloc[0]
        rank = int((df.frac_above_q99 > t.frac_above_q99).sum()) + 1
        print(f"\nTARDBP ranks {rank} of {len(df)} on this statistic "
              f"({t.frac_above_q99:.3f} beyond its own 99th percentile, "
              f"adjusted p {t.p_adj:.3g}).")
        # BOTH CONDITIONS, AND SAY SO EITHER WAY. An earlier version called rank
        # 4 of 12 "at the top" because its threshold was off by one.
        if rank <= 2 and t.p_adj < 0.05:
            print("  TDP-43 is among the top two and survives correction, so the "
                  "rarity of its arrays is worth something. It still says nothing "
                  "about which came first: run the ortholog test, with hnRNPC as "
                  "the control.")
        else:
            print("  TDP-43 IS NOT SPECIAL ON THIS STATISTIC. Its repressed events "
                  "sit on motif runs no longer than matched background, so element "
                  "rarity at two famous loci is a fact about those two loci and not "
                  "about the target class.")
    print("\nSRSF1 is an enhancer; a high value in its row means the statistic is "
          "picking up exon context rather than repressor motifs.")

    if args.out:
        df.to_csv(args.out, sep="\t", index=False)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
