"""Matched intronic decoy acceptors, to give `exon-age` a null.

WHY THIS EXISTS. `exon-age` reported that 66.7% of TDP-43 cryptic acceptors
have a usable 3' splice site in macaque, which reads as evidence that the
sites are old and unused. It is not evidence of anything on its own. Human
and macaque are about 93% identical, so an AG at an orthologous position
survives by default most of the time, and a polypyrimidine tract is broadly
conserved as well. The number to compare against is what an ARBITRARY human
intronic AG scores through the same pipeline, and nobody had measured it.

This is the same error that killed an earlier finding in this program. Cryptic
acceptors above the 95th percentile of conservation looked locally peaked
(+0.857 against +0.568 for annotated acceptors), until the negative control's
own above-p95 positions were measured and came back at +0.641. Selecting
positions that beat their neighbourhood selects local maxima by construction.
The control has to be the null's own tail, not a different population.

WHAT A DECOY IS HERE. For each cryptic acceptor, other AG dinucleotides in
the same intronic neighbourhood, on the same strand, at least `exclude` nt
from the cryptic site itself and from every annotated exon boundary. Same
locus means the regional substitution rate, the chain coverage and the
alignability are matched by construction rather than by adjustment.

AG IN THE EVENT'S OWN ORIENTATION ONLY. Forward AG and forward CT differ by
roughly 0.11 in intronic phyloP, and that difference cancels only when the
decoy is in the same orientation class as the acceptor it backs. An
orientation-free set makes half the decoys the wrong class.

`dist_exon` IS EMITTED FOR EVERY ROW. Distance from the nearest exon is the
covariate that mattered when the alignability proxy was tested: matched on it,
cryptic acceptors were indistinguishable from their decoys (pooled Fisher
p=1). A comparison that does not at least check this covariate is not matched,
so the column is written whether or not the caller stratifies on it.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

from bajasplice.evaluate.constraint_axis import (DECOY_UNITS, EXCLUDE,
                                                 ag_positions,
                                                 chrom_exon_bounds,
                                                 nearest_boundary)
from bajasplice.evaluate.exon_age import TargetFasta, read_events

WINDOW = 5000
PER_EVENT = 5
CARRY = ("gene", "fate", "frame_disrupting")

__all__ = ["decoys_for_event", "build_decoys", "read_annotation", "main"]


NEEDED = ("chrom", "start", "end")


def read_annotation(path):
    """An exon table, reading only the three columns the decoys need.

    The human exons.tsv is 554 MB and only chrom/start/end are used here, so
    this reads the header, picks the separator from it, and hands the C parser
    a usecols list. `sep=None` would be tidier but forces pandas onto the
    python engine, which parses in pure Python: on a file this size that is
    the difference between seconds and not finishing. Reading all columns
    would also carry a few GB of sequence and identifiers for nothing.
    """
    with open(path) as fh:
        head = fh.readline()
    sep = "\t" if head.count("\t") >= head.count(",") else ","
    cols = [c.strip() for c in head.rstrip("\n").split(sep)]
    missing = [c for c in NEEDED if c not in cols]
    if missing:
        raise SystemExit(
            f"{path} lacks {', '.join(missing)}; need an exon table with "
            f"chrom, start, end (found {cols[:8]})")
    ex = pd.read_csv(path, sep=sep, usecols=list(NEEDED),
                     dtype={"chrom": str}, low_memory=False)
    return ex


def decoys_for_event(fasta, chrom, strand, acceptor, bounds, window=WINDOW,
                     per_event=PER_EVENT, exclude=EXCLUDE, rng=None,
                     units=DECOY_UNITS, match_dist=None):
    """Up to `per_event` matched AG positions near one cryptic acceptor.

    The window is centred on the acceptor and read in the event's own
    orientation, so `ag_positions` maps indices back with the right sign. A
    window that runs off the contig comes back short rather than raising,
    which is the TargetFasta contract.
    """
    acceptor = int(acceptor)
    lo, hi = acceptor - int(window), acceptor + int(window)
    seq = fasta.sequence(chrom, lo, hi, strand)
    if not seq:
        return []
    # sequence() clips to the contig, so the span it actually returned may be
    # shorter than asked. Recover the true lo/hi before mapping indices back,
    # or every position in a clipped window lands at the wrong coordinate.
    key = fasta.resolve(chrom)
    clen = len(fasta.fa[key])
    lo_c, hi_c = max(1, lo), min(clen, hi)
    pos = ag_positions(seq, lo_c, hi_c, strand, units=units)
    keep = [p for p in pos
            if abs(p - acceptor) > exclude
            and nearest_boundary(p, bounds) > exclude]
    if match_dist is not None and bounds is not None and len(bounds):
        # Distance from the nearest exon is NOT incidental here. On the first
        # decoy run the cryptic set had median 366 nt and a 25th percentile of
        # 1, against 805 and 302 for the decoys, Mann-Whitney p=1.2e-16. Exon-
        # adjacent intron is under its own constraint, so an unmatched decoy
        # set is a null for conservation but not for position. Matching keeps
        # candidates whose own distance is within a factor of `match_dist` of
        # the parent's, which is scale-free: 10 vs 100 nt matters, 2000 vs
        # 2100 does not.
        d_par = nearest_boundary(acceptor, bounds)
        if np.isfinite(d_par) and d_par > 0:
            lo_d, hi_d = d_par / match_dist, d_par * match_dist
            band = [p for p in keep
                    if lo_d <= nearest_boundary(p, bounds) <= hi_d]
            if band:
                keep = band
    if per_event and len(keep) > per_event:
        rng = rng or np.random.default_rng(0)
        idx = rng.choice(len(keep), size=int(per_event), replace=False)
        keep = [keep[i] for i in sorted(idx)]
    return keep


def build_decoys(events, fasta, exons, window=WINDOW, per_event=PER_EVENT,
                 exclude=EXCLUDE, seed=0, units=DECOY_UNITS, match_dist=None):
    """A decoy events table, one block of rows per cryptic acceptor."""
    bounds = chrom_exon_bounds(exons) if exons is not None else {}
    rng = np.random.default_rng(int(seed))
    rows = []
    for r in events.itertuples():
        chrom, strand = str(r.chrom), str(r.strand)
        acceptor = int(r.acceptor)
        b = bounds.get(chrom)
        for p in decoys_for_event(fasta, chrom, strand, acceptor, b,
                                  window=window, per_event=per_event,
                                  exclude=exclude, rng=rng, units=units,
                                  match_dist=match_dist):
            rec = {"chrom": chrom, "strand": strand, "acceptor": int(p),
                   "parent_acceptor": acceptor,
                   "offset": int(p) - acceptor,
                   "dist_exon": float(nearest_boundary(p, b)),
                   "is_decoy": True}
            for c in CARRY:
                if hasattr(r, c):
                    rec[c] = getattr(r, c)
            rows.append(rec)
    out = pd.DataFrame(rows)
    if len(out):
        out = out.drop_duplicates(subset=["chrom", "acceptor", "strand"])
    return out.reset_index(drop=True)


def annotate_events(events, exons):
    """The cryptic events with their own dist_exon, for the matched comparison.

    The covariate was computed for the summary and then thrown away, so the
    cryptic side of any stratified test had no dist_exon column to stratify
    on. It also answers a question this program has been carrying unresolved:
    a position 1 nt from an annotated exon boundary IS where an annotated
    acceptor sits, and the cryptic set's 25th percentile is 1.
    """
    b = chrom_exon_bounds(exons) if exons is not None else {}
    out = events.copy()
    out["dist_exon"] = [nearest_boundary(int(r.acceptor), b.get(str(r.chrom)))
                        for r in events.itertuples()]
    out["is_decoy"] = False
    return out


def summarize(events, decoys, exons, bounds=None):
    print("\n" + "=" * 70)
    print("MATCHED DECOY SET")
    print("=" * 70)
    print(f"  cryptic acceptors in:        {len(events)}")
    print(f"  decoys out:                  {len(decoys)}")
    if not len(decoys):
        print("\n  NO DECOYS. Nothing downstream of this is interpretable.")
        return
    per = decoys.groupby("parent_acceptor").size()
    print(f"  events with at least one:    {len(per)}"
          f"  ({len(per) / max(len(events), 1):.1%})")
    print(f"  decoys per event:            median {per.median():.0f}, "
          f"min {per.min()}, max {per.max()}")
    orphan = len(events) - len(per)
    if orphan:
        print(f"  events with NONE:            {orphan}  these drop out of "
              f"any paired comparison")

    b = bounds if bounds is not None else (
        chrom_exon_bounds(exons) if exons is not None else {})
    d_ev = np.array([nearest_boundary(int(r.acceptor), b.get(str(r.chrom)))
                     for r in events.itertuples()], dtype=float)
    d_de = decoys["dist_exon"].to_numpy(dtype=float)
    fin_ev, fin_de = d_ev[np.isfinite(d_ev)], d_de[np.isfinite(d_de)]
    print("\n  distance from the nearest annotated exon, the covariate that")
    print("  mattered when alignability was tested:")
    if len(fin_ev) and len(fin_de):
        print(f"    cryptic:  median {np.median(fin_ev):>9.0f}  "
              f"p25 {np.percentile(fin_ev, 25):>8.0f}  "
              f"p75 {np.percentile(fin_ev, 75):>8.0f}")
        print(f"    decoys:   median {np.median(fin_de):>9.0f}  "
              f"p25 {np.percentile(fin_de, 25):>8.0f}  "
              f"p75 {np.percentile(fin_de, 75):>8.0f}")
        try:
            from scipy import stats as sps
            u = sps.mannwhitneyu(fin_ev, fin_de, alternative="two-sided")
            print(f"    Mann-Whitney p={u.pvalue:.3g}")
            if u.pvalue < 0.05:
                print("    THESE DO NOT MATCH. Stratify on dist_exon before "
                      "comparing, or the\n    decoy set is not a null for "
                      "this covariate.")
        except Exception:
            pass
    near = {k: int((d_ev <= k).sum()) for k in (1, 5, 10, 50)}
    print("\n  cryptic acceptors sitting AT an annotated exon boundary:")
    for k, v in near.items():
        print(f"    within {k:>3} nt: {v:>5}  {v / max(len(events), 1):>6.1%}")
    if near[1] / max(len(events), 1) > 0.1:
        print("    A position 1 nt from a boundary is where an ANNOTATED "
              "acceptor sits. These\n    may not be cryptic at all, and an "
              "annotated acceptor has a real tract,\n    which is the whole "
              "of the apparent conservation signal.")

    print("\n  Next: run `evaluate exon-age` on this table with the same "
          "chains and\n  genomes, then compare 'site present' rates. If they "
          "agree, age is not\n  what the cryptic numbers were measuring.")


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", required=True,
                    help="the cryptic events table, same one exon-age takes")
    ap.add_argument("--genome", required=True,
                    help="human FASTA, named the way the chains are (hg38)")
    ap.add_argument("--annotation", default=None,
                    help="exon table (chrom,start,end) whose boundaries are "
                         "excluded. Without it NO exon exclusion happens and "
                         "decoys can sit on real splice sites")
    ap.add_argument("--window", type=int, default=WINDOW,
                    help=f"nt each side of the acceptor to scan "
                         f"(default {WINDOW})")
    ap.add_argument("--per-event", type=int, default=PER_EVENT,
                    help=f"decoys sampled per acceptor (default {PER_EVENT})")
    ap.add_argument("--exclude", type=int, default=EXCLUDE,
                    help=f"nt of clearance from the acceptor and from any "
                         f"exon boundary (default {EXCLUDE})")
    ap.add_argument("--match-dist", type=float, default=None, metavar="FACTOR",
                    help="keep only decoys whose own distance from the "
                         "nearest exon is within this multiplicative factor "
                         "of the parent's (try 2.0). Off by default; the "
                         "unmatched set failed its own check at p=1.2e-16")
    ap.add_argument("--events-out", default=None,
                    help="write the cryptic events with dist_exon added, so "
                         "the cryptic side can be stratified too")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    ev = read_events(args.events)
    print(f"{len(ev)} events from {args.events}")
    fasta = TargetFasta(os.path.expanduser(args.genome))
    print(f"  genome: {os.path.basename(args.genome)}")
    exons = None
    if args.annotation:
        exons = read_annotation(os.path.expanduser(args.annotation))
        print(f"  annotation: {len(exons)} exons from "
              f"{os.path.basename(args.annotation)}")
    else:
        print("  NO --annotation: decoys are not screened against real exons, "
              "so some will\n  sit on annotated splice sites and score as "
              "present for the obvious reason")

    dec = build_decoys(ev, fasta, exons, window=args.window,
                       per_event=args.per_event, exclude=args.exclude,
                       seed=args.seed, match_dist=args.match_dist)
    summarize(ev, dec, exons)
    if args.events_out:
        annotate_events(ev, exons).to_csv(args.events_out, sep="\t",
                                          index=False)
        print(f"annotated cryptic events written to {args.events_out}")
    if args.out:
        dec.to_csv(args.out, sep="\t", index=False)
        print(f"\ndecoy events written to {args.out}")
    return dec


if __name__ == "__main__":
    main()
