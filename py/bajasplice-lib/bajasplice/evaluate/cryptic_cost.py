#!/usr/bin/env python
"""Have the exons TDP-43 holds shut ever been filtered for cost?

This is the buffer question asked of the right exons. Every earlier version ran
on annotated cassette exons, and annotated exons are exons selection has
already vetted, so the population excluded the cryptic exons the claim is
about. On that population nothing showed: TDP-43's repressed events were
frame-disrupting at 0.598 against 0.584 for events that never moved, odds ratio
1.06, p = 0.315, rank 187 of 475 proteins. The test was fine. The exons were
wrong.

THE RIGHT NULL IS 2/3, NOT THE ANNOTATED RATE. If exon lengths were random with
respect to frame, two in three would shift the downstream reading frame.
Annotated cassette exons sit well below that, because the ones that disrupted
frame were mostly removed, and that depletion IS the record of selection having
acted. An exon population that has never been filtered should sit at 2/3. So
the measurement is not "are cryptic exons worse than annotated ones", which
invites every matching argument there is, but "is the depletion that marks
selection present or absent".

Inputs, cheapest first:

  --exons   a BED of cryptic exons: chrom, start, end, gene, score, strand.
            The curated set from the cryptic_biology repo is
            data/all_the_ce_length_manual_filtered.bed. Spans outside
            --min-len to --max-len are dropped and counted, because that file
            carries a few rows with megabase spans and one 16-mer.
  --nmd     also classify consequence properly, by splicing the cryptic exon
            into its host transcript and asking whether the stop lands more
            than DJ_THRESHOLD from the last junction. Frame is a proxy; this
            is the thing itself. Needs the annotation and the genome.
  --compendium  compendium_cryptics.csv, to split by the dataset the event came
            from. The HeLa and neuronal sets are the same protein in different
            cell types, so a difference between them is about detection and
            cell type rather than about TDP-43.

What this cannot show, and it matters for how the result is written: an exon
population at 2/3 has not been filtered for frame, which is what "untested by
selection" means quantitatively. It does not establish that repression is why
they were never filtered. Sequence that is simply never expressed is also never
filtered.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

__all__ = ["read_cryptic_bed", "frame_disrupting", "binom_against",
           "insert_exon", "forms", "host_transcript", "annotated_nmd",
           "RANDOM_FRAME"]

RANDOM_FRAME = 2.0 / 3.0


def read_cryptic_bed(path, min_len=20, max_len=600):
    """(kept, dropped) cryptic exons from a 6-column BED.

    BED is half-open and zero-based, so the exon in 1-based inclusive
    coordinates is (start + 1, end) and its length is end - start. Getting
    that wrong shifts every length by one and moves a third of the set across
    the frame boundary.
    """
    b = pd.read_csv(path, sep="\t", header=None, comment="#",
                    names=["chrom", "start", "end", "gene", "score", "strand"],
                    usecols=range(6))
    b["length"] = b["end"] - b["start"]
    b["a_start"] = b["start"] + 1
    b["a_end"] = b["end"]
    keep = (b["length"] >= min_len) & (b["length"] <= max_len)
    return b[keep].reset_index(drop=True), b[~keep].reset_index(drop=True)


def frame_disrupting(length):
    return (np.asarray(length, dtype="int64") % 3) != 0


def binom_against(k, n, p0):
    """(rate, one-sided p that the rate exceeds p0, two-sided p)."""
    from scipy.stats import binomtest
    if n == 0:
        return float("nan"), float("nan"), float("nan")
    return (k / n,
            float(binomtest(k, n, p0, alternative="greater").pvalue),
            float(binomtest(k, n, p0).pvalue))


def host_transcript(exons, cds, gene):
    """(chrom, strand, blocks in transcript order, cds_start) for one gene.

    MANE where the annotation marks one, else the transcript with the most
    exons that has a CDS. A transcript without a CDS cannot answer a frame
    question at all, so it is never used.
    """
    ex = exons[exons["gene_name"] == gene]
    if not len(ex):
        return None
    with_cds = set(cds.loc[cds["transcript_id"].isin(set(ex["transcript_id"])),
                           "transcript_id"])
    ex = ex[ex["transcript_id"].isin(with_cds)]
    if not len(ex):
        return None
    rank = ex.groupby("transcript_id").agg(mane=("mane", "max"),
                                           n=("start", "size"))
    tid = rank.sort_values(["mane", "n"], ascending=False).index[0]
    g = ex[ex["transcript_id"] == tid]
    strand = g["strand"].iloc[0]
    blocks = sorted(zip(g["start"], g["end"]), reverse=(strand == "-"))
    cd = cds[cds["transcript_id"] == tid]
    cds_start = int(cd["start"].min()) if strand == "+" else int(cd["end"].max())
    return g["chrom"].iloc[0], strand, [(int(s), int(e)) for s, e in blocks], cds_start


def insert_exon(blocks, strand, a_start, a_end):
    """Blocks with the cryptic exon spliced in, or None if it does not fit.

    It has to sit wholly inside one intron of the host transcript. An exon that
    overlaps an annotated block is not a cryptic cassette exon in this
    transcript, and silently inserting it anyway would produce a sequence that
    exists nowhere.
    """
    for s, e in blocks:
        if not (a_end < s or a_start > e):
            return None
    out = list(blocks)
    for i in range(len(blocks) - 1):
        lo, hi = blocks[i], blocks[i + 1]
        if strand == "+":
            inside = lo[1] < a_start and a_end < hi[0]
        else:
            inside = hi[1] < a_start and a_end < lo[0]
        if inside:
            out.insert(i + 1, (a_start, a_end))
            return out
    return None


def forms(blocks, strand, a_start, a_end):
    """(skip, include) block lists for one exon, or None if it cannot be built.

    ONE CODE PATH FOR BOTH POPULATIONS. A cryptic exon is absent from the host
    transcript, so the skip form is the transcript as annotated. An annotated
    cassette exon is usually present in it, so the skip form is the transcript
    with that block removed. Comparing a cryptic rate computed one way against
    an annotated rate computed another way would compare two different
    questions, which is how the afternoon's earlier results went wrong.
    """
    over = [bl for bl in blocks if not (a_end < bl[0] or a_start > bl[1])]
    if len(over) > 1:
        return None                      # overlaps more than one block
    if over:
        bl = over[0]
        if (bl[0], bl[1]) != (a_start, a_end):
            return None                  # partial overlap, not this cassette
        skip = [x for x in blocks if x != bl]
    else:
        skip = list(blocks)
    if len(skip) < 2:
        return None
    incl = insert_exon(skip, strand, a_start, a_end)
    if incl is None:
        return None
    return skip, incl


def _nmd_one(g, chrom, strand, blocks, cds_start, a_start, a_end):
    """1.0 if inclusion triggers NMD, 0.0 if not, None if undecidable."""
    from bajanmd.consequence import splice, offset_of, dj_of, classify
    f = forms(blocks, strand, a_start, a_end)
    if f is None:
        return None, "no_fit"
    skip, incl = f
    o_skip, o_incl = offset_of(skip, strand, cds_start), offset_of(incl, strand, cds_start)
    if o_skip is None or o_incl is None:
        return None, "no_frame"
    dj_skip, _ = dj_of(skip, splice(g, chrom, strand, skip), o_skip)
    dj_incl, _ = dj_of(incl, splice(g, chrom, strand, incl), o_incl)
    cls = classify(dj_skip, dj_incl)
    return (1.0 if cls in ("NMD_in", "both") else 0.0), "ok"


def _nmd_calls(b, annotation="current", verbose=True):
    """inclusion-triggers-NMD per cryptic exon, by splicing it into its host."""
    from bajanmd.consequence import annotation_tables
    from bajasplice.genome import GenomeReader

    exons, cds = annotation_tables(annotation)
    g = GenomeReader()
    out, why = [], {"ok": 0, "no_gene": 0, "no_fit": 0, "no_frame": 0}
    cache = {}
    for n, r in enumerate(b.itertuples(), 1):
        if verbose and n % 100 == 0:
            print(f"    {n}/{len(b)}", flush=True)
        if r.gene not in cache:
            cache[r.gene] = host_transcript(exons, cds, r.gene)
        host = cache[r.gene]
        if host is None:
            out.append(np.nan)
            why["no_gene"] += 1
            continue
        chrom, strand, blocks, cds_start = host
        v, tag = _nmd_one(g, chrom, strand, blocks, cds_start,
                          int(r.a_start), int(r.a_end))
        out.append(np.nan if v is None else v)
        why[tag] += 1
    return np.asarray(out, dtype="float64"), why


def annotated_nmd(n_sample, annotation="current", seed=0, verbose=True,
                  exclude_genes=()):
    """The same NMD computation on a sample of annotated cassette exons.

    The comparison the cryptic rate needs. Events are drawn from
    encode_events.tsv, which is where the annotated baseline for frame comes
    from too, so the two axes describe the same population. Genes carrying a
    cryptic exon are excluded, since an annotated cassette in such a gene is
    not an independent draw from the vetted population.
    """
    import os
    from bajanmd.consequence import annotation_tables
    from bajasplice.config import paths
    from bajasplice.genome import GenomeReader

    p = paths().interim / "encode_events.tsv"
    if not os.path.exists(p):
        return None, {"missing": 1}
    ev = pd.read_csv(p, sep="\t",
                     usecols=["chrom", "strand", "gene_name", "a_start", "a_end"])
    ev = ev[~ev["gene_name"].isin(set(exclude_genes))]
    rng = np.random.default_rng(seed)
    take = rng.choice(len(ev), size=min(n_sample, len(ev)), replace=False)
    ev = ev.iloc[np.sort(take)]

    exons, cds = annotation_tables(annotation)
    g = GenomeReader()
    out, why = [], {"ok": 0, "no_gene": 0, "no_fit": 0, "no_frame": 0}
    cache = {}
    for i, r in enumerate(ev.itertuples(), 1):
        if verbose and i % 250 == 0:
            print(f"    {i}/{len(ev)}", flush=True)
        if r.gene_name not in cache:
            cache[r.gene_name] = host_transcript(exons, cds, r.gene_name)
        host = cache[r.gene_name]
        if host is None:
            why["no_gene"] += 1
            continue
        chrom, strand, blocks, cds_start = host
        v, tag = _nmd_one(g, chrom, strand, blocks, cds_start,
                          int(r.a_start), int(r.a_end))
        why[tag] += 1
        if v is not None:
            out.append(v)
    return np.asarray(out, dtype="float64"), why


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exons", required=True,
                    help="BED of cryptic exons (chrom start end gene score strand)")
    ap.add_argument("--min-len", type=int, default=20)
    ap.add_argument("--max-len", type=int, default=600)
    ap.add_argument("--baseline", type=float, default=None,
                    help="annotated frame-disruption rate to compare against; "
                         "taken from encode_events.tsv when available")
    ap.add_argument("--nmd", action="store_true")
    ap.add_argument("--annotation", default="current")
    ap.add_argument("--compendium", default=None,
                    help="compendium_cryptics.csv, to split by source dataset")
    ap.add_argument("--annotated-nmd", type=int, default=0, metavar="N",
                    help="also run the NMD computation on N annotated cassette "
                         "exons, as the comparison the cryptic rate needs")
    ap.add_argument("--min-group", type=int, default=30,
                    help="smallest compendium group worth reporting")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    import os
    from bajasplice.config import paths, species

    b, dropped = read_cryptic_bed(args.exons, args.min_len, args.max_len)
    print(f"{len(b) + len(dropped)} rows in {os.path.basename(args.exons)}; "
          f"{len(dropped)} outside {args.min_len}-{args.max_len} nt dropped")
    if len(dropped):
        print("  dropped:", ", ".join(f"{r.gene}({r.length})"
                                      for r in dropped.head(6).itertuples()))
    if not len(b):
        raise SystemExit("nothing left after the length filter")
    print(f"{len(b)} cryptic exons; median {b['length'].median():.0f} nt, "
          f"IQR {b['length'].quantile(.25):.0f}-{b['length'].quantile(.75):.0f}")

    base = args.baseline
    if base is None:
        p = paths().interim / "encode_events.tsv"
        if os.path.exists(p):
            ev = pd.read_csv(p, sep="\t", usecols=["a_start", "a_end"])
            base = float(frame_disrupting(ev.a_end - ev.a_start + 1).mean())
            print(f"annotated baseline from {len(ev):,} cassette events: {base:.4f}")
    if base is None:
        print("no annotated baseline available; comparing against 2/3 only")

    rows = []
    f = frame_disrupting(b["length"])
    k, n = int(f.sum()), len(f)
    rate, p_rand, p2_rand = binom_against(k, n, RANDOM_FRAME)
    print(f"\nframe-disrupting: {k}/{n} = {rate:.4f}")
    print(f"  against 2/3, the rate for lengths random with respect to frame: "
          f"two-sided p {p2_rand:.3g}")
    rows.append(dict(axis="frame", group="cryptic", k=k, n=n, rate=rate,
                     null=RANDOM_FRAME, p_two_sided=p2_rand))
    if base is not None:
        _, p_base, p2_base = binom_against(k, n, base)
        print(f"  against the annotated rate {base:.4f}: one-sided p {p_base:.3g}")
        rows.append(dict(axis="frame", group="cryptic_vs_annotated", k=k, n=n,
                         rate=rate, null=base, p_one_sided=p_base))
        # THE DEPLETION IS THE SIGNAL. Say which side of 2/3 each set is on.
        if p2_rand > 0.05 and base < RANDOM_FRAME - 0.02:
            print("\n  THE CRYPTIC SET CARRIES NO FRAME DEPLETION. Annotated exons "
                  "sit below 2/3 because selection removed the disruptive ones; "
                  "these sit at 2/3, which is what an unfiltered population looks "
                  "like. That is the buffer signature, on the exons the claim is "
                  "about.")
        elif base is not None and rate < base + 0.01:
            print("\n  THE CRYPTIC SET LOOKS LIKE THE ANNOTATED ONE, so it carries "
                  "the same depletion and has been filtered too. No buffer "
                  "signature here.")

    if args.nmd:
        print("\nNMD consequence, splicing each exon into its host transcript:")
        nm, why = _nmd_calls(b, args.annotation)
        print(f"  resolved {why['ok']}, no host transcript with CDS {why['no_gene']}, "
              f"does not fit an intron {why['no_fit']}, no frame {why['no_stop']}")
        ok = np.isfinite(nm)
        if ok.sum() >= 30:
            k2, n2 = int(np.nansum(nm)), int(ok.sum())
            print(f"  inclusion triggers NMD in {k2}/{n2} = {k2 / n2:.4f}")
            rows.append(dict(axis="nmd", group="cryptic", k=k2, n=n2,
                             rate=k2 / n2))
            if not args.annotated_nmd:
                print("  no comparison set requested; pass --annotated-nmd N to "
                      "run the same computation on N annotated cassette exons, "
                      "which is the only thing that makes this rate mean "
                      "something")
            else:
                print(f"\n  the same computation on {args.annotated_nmd} annotated "
                      f"cassette exons, excluding genes that carry a cryptic one:")
                av, awhy = annotated_nmd(args.annotated_nmd, args.annotation,
                                         exclude_genes=set(b["gene"]))
                if av is None or len(av) < 50:
                    print("    too few resolved; is encode_events.tsv built?")
                else:
                    ka, na = int(av.sum()), len(av)
                    print(f"    resolved {awhy['ok']}, no host {awhy['no_gene']}, "
                          f"no fit {awhy['no_fit']}")
                    print(f"    inclusion triggers NMD in {ka}/{na} = {ka / na:.4f}")
                    from scipy.stats import fisher_exact
                    orr, pf = fisher_exact([[k2, n2 - k2], [ka, na - ka]],
                                           alternative="greater")
                    print(f"    cryptic against annotated: OR {orr:.2f}, "
                          f"one-sided p {pf:.3g}")
                    rows.append(dict(axis="nmd", group="annotated", k=ka, n=na,
                                     rate=ka / na))
                    rows.append(dict(axis="nmd", group="cryptic_vs_annotated",
                                     k=k2, n=n2, rate=k2 / n2,
                                     odds_ratio=orr, p_one_sided=pf))
                    if pf < 0.05:
                        print("    THE CRYPTIC EXONS ARE MORE DESTRUCTIVE. "
                              "Inclusion wrecks the transcript more often than "
                              "for exons selection has been through, which is "
                              "the buffer signature on the axis that measures "
                              "cost directly rather than by proxy.")
                    else:
                        print("    NO DIFFERENCE ON THIS AXIS. Frame said one "
                              "thing and consequence says another, so the frame "
                              "result should not be read as being about cost.")
        else:
            print("  too few resolved to report")

    if args.compendium:
        c = pd.read_csv(args.compendium)
        c["cell"] = np.where(c["comparison"].str.contains("HeLA", case=False),
                             "HeLa", "neuronal")
        H = set(c.loc[c["cell"] == "HeLa", "gene_name"])
        N = set(c.loc[c["cell"] == "neuronal", "gene_name"])
        # DISJOINT GROUPS OR NOTHING. Assigning by membership put 66 of 70
        # HeLa-matched exons into the neuronal group as well, so the two rows
        # were a set compared against a superset of itself.
        groups = [("HeLa only", H - N), ("neuronal only", N - H),
                  ("both cell types", H & N)]
        print(f"\ncompendium: {len(H)} HeLa genes, {len(N)} neuronal, "
              f"{len(H & N)} in both; partitioned into disjoint groups")
        matched = b["gene"].isin(H | N)
        print(f"  {int((~matched).sum())} of {len(b)} curated exons match no "
              f"compendium gene and are in no group")
        for label, gs in groups:
            m = b["gene"].isin(gs)
            kk, nn = int(frame_disrupting(b.loc[m, "length"]).sum()), int(m.sum())
            if nn < args.min_group:
                print(f"  {label:16s} {nn} exons, below --min-group, not reported")
                continue
            r, _, p2 = binom_against(kk, nn, RANDOM_FRAME)
            print(f"  {label:16s} {kk:3d}/{nn:3d} = {r:.4f}  two-sided against "
                  f"2/3 {p2:.3g}")
            rows.append(dict(axis="frame", group=label.replace(" ", "_"), k=kk,
                             n=nn, rate=r, null=RANDOM_FRAME, p_two_sided=p2))
        print("  these groups were not pre-specified, so read them as "
              "exploratory; the headline is the whole set against 2/3")

    if args.out:
        pd.DataFrame(rows).to_csv(args.out, sep="\t", index=False)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
