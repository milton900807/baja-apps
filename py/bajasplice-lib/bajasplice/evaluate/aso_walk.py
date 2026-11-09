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

    # RANKED ON THE LOGIT SCALE. A donor already at 0.93 can gain at most 0.07 on
    # the probability scale, so every effective footprint pins against the
    # ceiling and the ordering among them is noise: the first run put fifteen
    # positions between +0.0654 and +0.0698 and called that a ranking. Logits
    # have no ceiling, so a footprint that takes the donor to 0.99988 is
    # separated from one that reaches 0.99574 instead of tying with it.
    def lg(v):
        v = np.clip(v, 1e-7, 1 - 1e-7)
        return np.log(v / (1 - v))

    gain = lg(don) - lg(ref_d)
    gain_p = don - ref_d
    order = np.argsort(-gain)[:args.top]
    print("\nmasking these RAISES the donor most -- the candidate ASO targets:")
    print("  %-9s %-10s %-11s %-10s %s" % ("offset", "donor", "d(logit)", "d(prob)", "where"))
    for i in order:
        where = "EXON" if offs[i] < 0 else "intron"
        tag = "  <- ISS-N1 +10..+27" if 10 - args.aso_len < offs[i] <= 27 else ""
        print("  %+-9d %-10.5f %+-11.3f %+-10.5f %s%s"
              % (offs[i], don[i], gain[i], gain_p[i], where, tag))

    worst = np.argsort(gain)[:5]
    print("\nmasking these LOWERS it most -- enhancers, or the donor itself:")
    for i in worst:
        print("  %+-9d %-10.5f %+-11.3f" % (offs[i], don[i], gain[i]))

    # Is there a ranking at all, or does most of the window do the same thing?
    print("\nshape of the walk, so the top of the list can be read honestly:")
    print("  footprints raising the donor : %d of %d (%.0f%%)"
          % ((gain > 0).sum(), len(gain), 100 * (gain > 0).mean()))
    print("  median change (logit)        : %+.3f" % float(np.median(gain)))
    print("  90th percentile              : %+.3f" % float(np.percentile(gain, 90)))
    iss = [j for j, o in enumerate(offs) if 10 - args.aso_len < o <= 27]
    if iss:
        best = max(iss, key=lambda j: gain[j])
        rank = int((gain > gain[best]).sum()) + 1
        print("  best ISS-N1 footprint        : offset %+d, rank %d of %d (top %.1f%%)"
              % (offs[best], rank, len(gain), 100.0 * rank / len(gain)))

    print("\nnote: a footprint overlapping the donor or acceptor destroys the site")
    print("rather than regulating it, so offsets near 0 are not drug targets.")


if __name__ == "__main__":
    main()
