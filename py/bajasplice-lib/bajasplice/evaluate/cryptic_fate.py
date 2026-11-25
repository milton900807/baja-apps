#!/usr/bin/env python
"""Does a cryptic exon end the transcript, or just break the protein?

The distinction decides what kind of lesion the cryptic exon program is. An
exon that inserts a stop AND a polyadenylation site terminates the message
early, so everything downstream is gone, including the annotated 3' UTR and
whatever localization elements it carried. An exon that inserts a stop with no
polyadenylation site leaves the 3' UTR attached to a message that gets
degraded. An exon that shifts the frame without stopping inside itself leaves
the UTR intact too. Those are three different failures, and only the first
revokes an address.

The two best-known loci already differ, which is why this is worth counting
rather than assuming: the STMN2 event is described as producing a truncated
polyadenylated transcript, and the UNC13A event as a decay substrate.

THE MOTIF SCAN FAILED ITS OWN CONTROL, so it no longer produces a class. On
the curated set a hexamer from the permissive twelve turned up in 61.0% of
windows against a chance rate of 60.0% for a 313-nt window under uniform
composition, and real intronic sequence is AT-rich, so the true rate is
higher. Restricted to AATAAA and ATTAAA it was 12.4% against 14.2% expected.
A six-base motif with no information content cannot distinguish a used
cleavage site from the dozens of unused matches around it. STMN2 makes the
point: its truncated transcript is known to be polyadenylated, and the scan
called it on AAGAAA, which is noise.

So sequence alone gives three classes and no termination call:

  stop_in_exon   first in-frame stop falls inside the cryptic exon. 235 of 354
                 on the curated set, 66.4%. Measured, no motif involved.
  frameshift     no stop inside, length not a multiple of three, so the stop
                 lands downstream and the 3' UTR is retained
  in_frame       length a multiple of three and no stop inside

A termination call requires observed 3' ends, so it appears only with
`--polya-atlas`, a BED of supported cleavage sites from PolyASite or APAatlas.
An exon that both stops inside itself and overlaps a supported site is called
`terminating_supported`, and the rate is reported against matched intronic
windows on the same strand, because an atlas built from many tissues has sites
scattered through introns too.

Hexamer counts stay in the output as columns, for anyone who wants them, and
are not used to classify anything.
"""
from __future__ import annotations

import argparse
import re

import numpy as np
import pandas as pd

from bajasplice.evaluate.cryptic_cost import (read_cryptic_bed, host_transcript,
                                              insert_exon, frame_disrupting)

__all__ = ["POLYA_HEXAMERS", "polya_signals", "exon_span_in_mrna",
           "classify_fate", "read_polya_atlas", "sites_in", "norm_chrom",
           "GENCODE_POLYA_TYPES", "FATES"]

FATES = ("stop_in_exon", "frameshift", "in_frame")

# Beaudoing et al.: AATAAA and ATTAAA carry most of the usage, the rest are the
# recognized variants. Ordered strongest first so the report can say which.
POLYA_HEXAMERS = ("AATAAA", "ATTAAA", "AGTAAA", "TATAAA", "CATAAA", "GATAAA",
                  "AATATA", "AATACA", "AATAGA", "ACTAAA", "AAGAAA", "AATGAA")
_HEX = re.compile("|".join(POLYA_HEXAMERS))


def polya_signals(seq):
    """Every polyadenylation hexamer in `seq`, as (offset, hexamer)."""
    s = str(seq).upper().replace("U", "T")
    return [(m.start(), m.group(0)) for m in _HEX.finditer(s)]


def exon_span_in_mrna(blocks, a_start, a_end):
    """(start, end) offsets of one block within the spliced sequence.

    Blocks arrive in transcript order, so the offset accumulates in that order
    regardless of strand. Returns None if the block is not in the list.
    """
    off = 0
    for s, e in blocks:
        if (s, e) == (a_start, a_end):
            return off, off + (e - s)
        off += e - s + 1
    return None


def classify_fate(stop_end, span, exon_len):
    """Which of the three sequence-decidable fates.

    NO MOTIF ENTERS HERE. An earlier version split stop_in_exon into
    terminating and stop_no_signal on a polyadenylation hexamer, and the
    hexamer turned out to be present at the chance rate, so the split carried
    no information and the word terminating implied a measurement nobody had
    made.

    `stop_end` is the offset just past the first in-frame stop, as
    bajanmd.consequence.first_stop returns it, or None when the frame runs off
    the end. `span` is the cryptic exon's own (start, end) offsets.
    """
    if span is None:
        return None
    lo, hi = span
    if stop_end is not None and lo < stop_end <= hi + 1:
        return "stop_in_exon"
    return "frameshift" if exon_len % 3 else "in_frame"


def norm_chrom(c):
    """chr1 and 1 are the same chromosome; atlases disagree about which."""
    c = str(c)
    return c[3:] if c.lower().startswith("chr") else c


GENCODE_POLYA_TYPES = ("polyA_site",)


def _is_gff3(path):
    """GFF3 by extension, or by the version pragma on the first line."""
    if str(path).lower().endswith((".gff3", ".gff", ".gff3.gz", ".gff.gz")):
        return True
    import gzip
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt") as fh:
        return fh.readline().startswith("##gff-version")


def read_polya_atlas(path, types=GENCODE_POLYA_TYPES):
    """{(chrom, strand): (starts, ends)} of cleavage sites, from BED or GFF3.

    BED is PolyASite's shape: zero-based half-open, strand in column six.
    GFF3 is GENCODE's polyA feature file: one-based inclusive, type in column
    three, strand in column seven.

    `types` filters the GFF3 by feature type and defaults to polyA_site alone.
    polyA_signal is DELIBERATELY EXCLUDED: it is the same hexamer that failed
    its control earlier, with an official annotation wrapped around it, and an
    annotated signal is not an observed 3' end. pseudo_polyA is excluded too
    unless asked for, since it marks sites in pseudogene context.

    Both strands are kept separately. A cluster on the other strand belongs to
    another gene and must never count.
    """
    if _is_gff3(path):
        df = pd.read_csv(path, sep="\t", header=None, comment="#",
                         usecols=[0, 2, 3, 4, 6],
                         names=["chrom", "type", "start", "end", "strand"],
                         dtype={"chrom": str, "type": str, "strand": str})
        kinds = dict(df["type"].value_counts())
        if types:
            df = df[df["type"].isin(set(types))]
        df.attrs["kinds"] = kinds
        starts_are_one_based = True
    else:
        df = pd.read_csv(path, sep="\t", header=None, comment="#",
                         usecols=range(6),
                         names=["chrom", "start", "end", "name", "score", "strand"],
                         dtype={"chrom": str, "strand": str})
        df.attrs["kinds"] = {}
        starts_are_one_based = False

    out = {}
    for (c, st), g in df.groupby(["chrom", "strand"]):
        g = g.sort_values("start")
        lo = g["start"].to_numpy() + (0 if starts_are_one_based else 1)
        out[(norm_chrom(c), st)] = (lo, g["end"].to_numpy())
    out_kinds = df.attrs.get("kinds", {})
    if out_kinds:
        out["__kinds__"] = out_kinds
    return out


def sites_in(atlas, chrom, strand, lo, hi):
    """How many atlas sites overlap [lo, hi] on this strand."""
    key = (norm_chrom(chrom), strand)
    if key not in atlas or key == "__kinds__":
        return 0
    starts, ends = atlas[key]
    # overlap means start <= hi and end >= lo
    i = np.searchsorted(starts, hi, side="right")
    if i == 0:
        return 0
    return int((ends[:i] >= lo).sum())


def _matched_windows(rows, width, seed=0):
    """Same-size windows placed elsewhere in the same intron, same strand."""
    rng = np.random.default_rng(seed)
    out = []
    for r in rows.itertuples():
        shift = int(rng.integers(2000, 20000))
        s = int(r.a_start) + (shift if r.strand == "+" else -shift)
        if s < 1:
            continue
        out.append((r.chrom, r.strand, s, s + width - 1))
    return out


def _background_rate(windows, fn):
    hits = sum(1 for w in windows if fn(*w))
    return (hits / len(windows) if windows else float("nan")), len(windows)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--exons", required=True)
    ap.add_argument("--min-len", type=int, default=20)
    ap.add_argument("--max-len", type=int, default=600)
    ap.add_argument("--downstream", type=int, default=200,
                    help="bases past the exon's 3' end to search")
    ap.add_argument("--annotation", default="current")
    ap.add_argument("--polya-atlas", default=None,
                    help="BED of supported cleavage sites (PolyASite, APAatlas). "
                         "Without it there is no termination call at all.")
    ap.add_argument("--polya-types", default=",".join(GENCODE_POLYA_TYPES),
                    help="GFF3 feature types to keep; polyA_signal is excluded "
                         "on purpose and adding it back reintroduces the "
                         "hexamer problem")
    ap.add_argument("--strong-only", action="store_true",
                    help="count only AATAAA and ATTAAA in the hexamer columns")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    from bajanmd.consequence import annotation_tables, splice, offset_of, first_stop
    from bajasplice.genome import GenomeReader

    global _HEX
    if args.strong_only:
        _HEX = re.compile("AATAAA|ATTAAA")

    b, dropped = read_cryptic_bed(args.exons, args.min_len, args.max_len)
    print(f"{len(b)} cryptic exons after dropping {len(dropped)} outside "
          f"{args.min_len}-{args.max_len} nt")

    atlas = None
    if args.polya_atlas:
        wanted = tuple(t for t in args.polya_types.split(",") if t)
        atlas = read_polya_atlas(args.polya_atlas, wanted)
        kinds = atlas.pop("__kinds__", {})
        tot = sum(len(v[0]) for v in atlas.values())
        if kinds:
            print("feature types in the file: " +
                  ", ".join(f"{k} {v:,}" for k, v in sorted(kinds.items())))
            print(f"keeping {', '.join(wanted)}")
        print(f"polyA atlas: {tot:,} sites over {len(atlas)} chromosome-strand keys")
        if tot == 0:
            raise SystemExit("no sites survived the type filter; check --polya-types "
                             "against the types listed above")
    else:
        print("no --polya-atlas given, so no termination call is made; the "
              "hexamer columns are reported and are NOT used to classify")

    exons, cds = annotation_tables(args.annotation)
    g = GenomeReader()
    cache = {}
    rows, why = [], {"no_gene": 0, "no_fit": 0, "no_frame": 0, "ok": 0}

    for i, r in enumerate(b.itertuples(), 1):
        if i % 100 == 0:
            print(f"    {i}/{len(b)}", flush=True)
        if r.gene not in cache:
            cache[r.gene] = host_transcript(exons, cds, r.gene)
        host = cache[r.gene]
        if host is None:
            why["no_gene"] += 1
            continue
        chrom, strand, blocks, cds_start = host
        a_start, a_end = int(r.a_start), int(r.a_end)
        if any(not (a_end < s or a_start > e) for s, e in blocks):
            why["no_fit"] += 1
            continue
        incl = insert_exon(blocks, strand, a_start, a_end)
        if incl is None:
            why["no_fit"] += 1
            continue
        off = offset_of(incl, strand, cds_start)
        if off is None:
            why["no_frame"] += 1
            continue
        seq = splice(g, chrom, strand, incl)
        stop_end = first_stop(seq, off)
        span = exon_span_in_mrna(incl, a_start, a_end)
        fate = classify_fate(stop_end, span, int(r.length))
        if fate is None:
            why["no_frame"] += 1
            continue

        exon_seq = g.sequence(chrom, a_start, a_end, strand)
        if strand == "+":
            lo, hi = a_start, a_end + args.downstream
            tail = g.sequence(chrom, a_end + 1, a_end + args.downstream, strand)
        else:
            lo, hi = max(1, a_start - args.downstream), a_end
            tail = g.sequence(chrom, max(1, a_start - args.downstream),
                              a_start - 1, strand)
        n_sites = sites_in(atlas, chrom, strand, lo, hi) if atlas else 0
        why["ok"] += 1
        rows.append(dict(gene=r.gene, chrom=chrom, strand=strand,
                         a_start=a_start, a_end=a_end, length=int(r.length),
                         frame_disrupting=bool(frame_disrupting([r.length])[0]),
                         fate=fate,
                         n_hexamer_in_exon=len(polya_signals(exon_seq)),
                         n_hexamer_downstream=len(polya_signals(tail)),
                         n_polya_sites=n_sites,
                         supported=bool(atlas and n_sites > 0),
                         terminating_supported=bool(
                             atlas and n_sites > 0 and fate == "stop_in_exon")))

    if not rows:
        raise SystemExit("nothing resolved; check the annotation and the BED")
    df = pd.DataFrame(rows)
    n = len(df)
    print(f"\nresolved {n}; no host transcript with CDS {why['no_gene']}, "
          f"fits no intron {why['no_fit']}, no reading frame {why['no_frame']}")

    print(f"\nsequence-decidable fates of {n} cryptic exons")
    for f in FATES:
        k = int((df.fate == f).sum())
        print(f"  {f:14s} {k:4d}  {k / n:6.3f}")

    hexrate = ((df.n_hexamer_in_exon + df.n_hexamer_downstream) > 0).mean()
    print(f"\nhexamer present somewhere in exon plus {args.downstream} nt: {hexrate:.3f}")

    if atlas is None:
        print("\nTo split stop_in_exon into messages that terminate and messages "
              "that merely decay, pass --polya-atlas. Sequence cannot do it.")
    else:
        width = int(df.length.median()) + args.downstream
        wins = _matched_windows(b, width, seed=args.seed)
        bg, nbg = _background_rate(
            wins, lambda c, st, lo, hi: sites_in(atlas, c, st, lo, hi) > 0)
        obs = df.supported.mean()
        print(f"\nsupported cleavage site in the exon plus {args.downstream} nt: "
              f"{int(df.supported.sum())}/{n} = {obs:.3f}")
        print(f"  matched intronic windows of {width} nt, same strand: "
              f"{bg:.3f} (n={nbg})")
        from scipy.stats import binomtest
        if np.isfinite(bg) and 0 < bg < 1:
            p = binomtest(int(df.supported.sum()), n, bg,
                          alternative="greater").pvalue
            print(f"  one-sided p against that background: {p:.3g}")
            if p > 0.05:
                print("  NO ENRICHMENT. These exons do not sit at used cleavage "
                      "sites more often than matched intron does, so the program "
                      "is predominantly a decay program and replacing a 3' UTR is "
                      "a special case, not the mechanism.")
            else:
                print("  ENRICHED. The exons sit at used cleavage sites above "
                      "background, so terminating is a real class and the "
                      "address-revocation reading survives for that subset.")
        k = int(df.terminating_supported.sum())
        print(f"\nterminating_supported, meaning stop inside the exon AND a "
              f"supported site: {k}/{n} = {k / n:.3f}")
        hit = df[df.terminating_supported]
        if len(hit):
            print("  first 12 by gene: " + ", ".join(sorted(hit.gene.unique())[:12]))
        for gene in ("STMN2", "UNC13A"):
            sub = df[df.gene == gene]
            if len(sub):
                print(f"  {gene}: " + "; ".join(
                    f"{int(x.a_start)}-{int(x.a_end)} {x.fate}"
                    f" sites={int(x.n_polya_sites)}" for x in sub.itertuples()))

    if args.out:
        df.to_csv(args.out, sep="\t", index=False)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
