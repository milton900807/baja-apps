#!/usr/bin/env python
"""An ASO walk, in silico: where would blocking the RNA help the exon?

The experiment this imitates is standard in the field. Tile antisense oligos
along an intron, measure inclusion for each, and the positions that raise it are
the silencers worth drugging. ISS-N1 and nusinersen came out of exactly that.

Masking is the analogue of the oligo. An ASO occludes its site rather than
rewriting it, so N -- information removed, no motif added -- is the honest
in-silico version. Substituting scrambled sequence is not: tried against ISS-N1
it gave donor values from 0.037 to 0.996 over twelve shuffles, because a
mononucleotide shuffle 10 nt from a real donor invents cryptic GTs and creates
elements instead of removing one.

Validated on the case with a drug attached: masking ISS-N1 (intron 7 +10..+27 of
SMN2) takes the exon 7 donor from 0.93012 to 0.99754, while the same mask 34 nt
further in takes it DOWN to 0.812, and 40 dinucleotide shuffles of ISS-N1 sit
above the reference 88% of the time against 0% for the control position.

    python -m bajasplice.evaluate.aso_walk --chrom chr5 \
        --exon-start 70076521 --exon-end 70076574 \
        --from -40 --to 300 --aso-len 18

Positive offsets are into the downstream intron, negative into the exon and the
upstream intron. Reports the footprints whose masking most raises the exon's
donor and acceptor, which are the candidate targets.
"""
from __future__ import annotations

import argparse

import numpy as np
import torch

CODE = {"A": 1, "C": 2, "G": 3, "T": 4, "N": 0}


def walk(chrom, exon_start, exon_end, lo_off=-40, hi_off=300, aso_len=18,
         step=1, strand="+", genome=None, model=None):
    """(offsets, donor, acceptor) with an aso_len mask starting at each offset.

    Offsets are relative to the first base AFTER the exon, so +1 is the first
    intronic base and +10 is where ISS-N1 begins in SMN2.
    """
    from ..genome import GenomeReader, one_hot
    from ..scan import load_splicenet

    g = genome or GenomeReader()
    if model is None:
        model, ctx, dev = load_splicenet()
    else:
        model, ctx, dev = model
    half = ctx // 2
    a = exon_start - 400
    b = exon_end + max(hi_off + aso_len + 400, 800)
    base = g.codes(chrom, a - half, b + half, strand).astype(np.int64)
    d_idx = exon_end + 1 - a            # donor: first intronic base
    a_idx = exon_start - 1 - a          # acceptor: last intronic base

    def score(codes):
        x = torch.from_numpy(one_hot(codes)[None]).to(dev)
        with torch.no_grad():
            p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
        return float(p[1, a_idx]), float(p[2, d_idx])

    ref_a, ref_d = score(base)
    offs, accs, dons = [], [], []
    for off in range(lo_off, hi_off + 1, step):
        start = (exon_end + off) - (a - half)
        if start < 0 or start + aso_len >= len(base):
            continue
        c = base.copy()
        c[start:start + aso_len] = 0           # N: the oligo's footprint
        sa, sd = score(c)
        offs.append(off); accs.append(sa); dons.append(sd)
    return (np.array(offs), np.array(dons), np.array(accs), ref_d, ref_a)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chrom", default="chr5")
    ap.add_argument("--exon-start", type=int, default=70076521)
    ap.add_argument("--exon-end", type=int, default=70076574)
    ap.add_argument("--from", dest="lo", type=int, default=-40)
    ap.add_argument("--to", dest="hi", type=int, default=300)
    ap.add_argument("--aso-len", type=int, default=18)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--strand", default="+")
    ap.add_argument("--top", type=int, default=15)
    args = ap.parse_args()

    offs, don, acc, ref_d, ref_a = walk(
        args.chrom, args.exon_start, args.exon_end,
        args.lo, args.hi, args.aso_len, args.step, args.strand)

    print("reference donor %.5f   acceptor %.5f" % (ref_d, ref_a))
    print("%d footprints of %d nt, offsets %+d..%+d relative to the exon's last base"
          % (len(offs), args.aso_len, args.lo, args.hi))

    gain = don - ref_d
    order = np.argsort(-gain)[:args.top]
    print("\nmasking these RAISES the donor most -- the candidate ASO targets:")
    print("  %-10s %-10s %-10s" % ("offset", "donor", "change"))
    for i in order:
        tag = "  <- ISS-N1 is +10..+27" if 8 <= offs[i] <= 12 else ""
        print("  %+-10d %-10.5f %+-10.5f%s" % (offs[i], don[i], gain[i], tag))

    worst = np.argsort(gain)[:5]
    print("\nmasking these LOWERS it most -- enhancers, or the donor itself:")
    for i in worst:
        print("  %+-10d %-10.5f %+-10.5f" % (offs[i], don[i], gain[i]))

    print("\nnote: a footprint overlapping the donor or acceptor destroys the site")
    print("rather than regulating it, so offsets near 0 are not drug targets.")


if __name__ == "__main__":
    main()
