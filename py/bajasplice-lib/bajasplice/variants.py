"""Score what a variant does to nearby splice sites.

The quantity of interest is the same one SpliceAI reports: how much the
predicted acceptor and donor scores move anywhere in a window around the
variant, when the reference base is swapped for the alternate. A variant that
destroys a splice site shows a large loss; one that creates a cryptic site
shows a large gain. Both matter, so both are returned.

Only substitutions and short indels are handled. An indel shifts the sequence
downstream of it, so reference and alternate tracks are compared over the
window that is common to both.
"""
from __future__ import annotations

import numpy as np
import torch

from bajasplice.genome import GenomeReader, one_hot

__all__ = ["delta_score", "variant_tracks"]

_BASE_ID = {"A": 1, "C": 2, "G": 3, "T": 4}


def _encode(seq_codes):
    return one_hot(np.asarray(seq_codes, dtype=np.int8))


def _apply(codes, offset, ref, alt):
    """Splice the alternate allele into an integer-coded sequence."""
    alt_codes = np.array([_BASE_ID.get(b, 0) for b in alt.upper()], dtype=np.int8)
    return np.concatenate([codes[:offset], alt_codes, codes[offset + len(ref):]])


@torch.no_grad()
def variant_tracks(model, context, chrom, pos, ref, alt, strand, device,
                   window=50, genome=None):
    """Reference and alternate (acceptor, donor) tracks over +/- window of pos."""
    g = genome or GenomeReader()
    c = context // 2
    half = window + 5                       # a little slack for indel shifts
    start = pos - half - c
    end = pos + half + c + max(len(ref), len(alt))
    codes = g.codes(chrom, start, end, "+")
    off = pos - start                       # variant offset in the + strand array

    ref_codes = codes
    alt_codes = _apply(codes, off, ref, alt)

    out = []
    for arr in (ref_codes, alt_codes):
        if strand == "-":
            comp = np.array([0, 4, 3, 2, 1], dtype=np.int8)
            arr = comp[arr[::-1]]
        x = torch.from_numpy(_encode(arr)[None]).to(device)
        # FULL PRECISION HERE, unlike the bulk scan. bfloat16 keeps an 8-bit
        # mantissa, about 0.4% relative error, which is ~0.004 absolute at the
        # p ~ 0.99 where real splice sites live. A delta is the DIFFERENCE of two
        # such numbers, so the error does not cancel, it dominates: SMN2's exon 7
        # acceptor change is 0.0143, under 4x that floor. Scanning a whole gene in
        # bf16 is fine because nothing is subtracted; scoring a variant is not.
        p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
        if strand == "-":
            p = p[:, ::-1]
        out.append((p[1], p[2]))            # acceptor, donor
    return out[0], out[1]


def delta_score(model, context, chrom, pos, ref, alt, device, strand="+",
                window=50, genome=None):
    """Largest change in acceptor or donor score near a variant.

    Returns gains and losses separately. `delta` is the largest of the four,
    which is the single number to rank variants by.
    """
    (a_ref, d_ref), (a_alt, d_alt) = variant_tracks(
        model, context, chrom, pos, ref, alt, strand, device, window, genome)
    n = min(len(a_ref), len(a_alt))
    a_ref, a_alt = a_ref[:n], a_alt[:n]
    d_ref, d_alt = d_ref[:n], d_alt[:n]
    mid = n // 2
    lo, hi = max(0, mid - window), min(n, mid + window + 1)
    da, dd = a_alt[lo:hi] - a_ref[lo:hi], d_alt[lo:hi] - d_ref[lo:hi]
    res = {
        "acceptor_gain": float(np.max(da)) if len(da) else 0.0,
        "acceptor_loss": float(-np.min(da)) if len(da) else 0.0,
        "donor_gain": float(np.max(dd)) if len(dd) else 0.0,
        "donor_loss": float(-np.min(dd)) if len(dd) else 0.0,
    }
    res["delta"] = max(res.values())

    # THE SAME CHANGE, ON A SCALE THAT DOES NOT SATURATE. A probability near 1
    # has almost no room left, so a real change at a STRONG site is compressed
    # into a tiny difference while the identical change at a weak site reads
    # large. SMN2 c.840C>T is the case in point: both of exon 7's sites move by
    # ~2.2 and ~2.6 logits, roughly a 10-fold change in odds, and the
    # probability scale reports 0.0143 and 0.0524, below the 80th percentile of
    # benign variants. Logit deltas are reported alongside, not instead: the
    # probability scale is what the published thresholds are on.
    def _lg(v):
        v = np.clip(v, 1e-6, 1 - 1e-6)
        return np.log(v / (1.0 - v))

    la = _lg(a_alt[lo:hi]) - _lg(a_ref[lo:hi])
    ld = _lg(d_alt[lo:hi]) - _lg(d_ref[lo:hi])
    res.update({
        "logit_acceptor_gain": float(np.max(la)) if len(la) else 0.0,
        "logit_acceptor_loss": float(-np.min(la)) if len(la) else 0.0,
        "logit_donor_gain": float(np.max(ld)) if len(ld) else 0.0,
        "logit_donor_loss": float(-np.min(ld)) if len(ld) else 0.0,
    })
    res["logit_delta"] = max(res["logit_acceptor_gain"], res["logit_acceptor_loss"],
                             res["logit_donor_gain"], res["logit_donor_loss"])

    # WHICH END MOVED, reported because it is diagnostic, not as a score. An
    # exonic enhancer or silencer acts on the EXON, so it tends to move both of
    # its sites, and seeing that is useful when reading one variant.
    #
    # Summing them is NOT useful as a statistic, which was measured rather than
    # assumed: on ClinVar (600 pathogenic splice vs 600 benign) the sum scored
    # AUC 0.9919 against 0.9955 for the plain logit max, and sensitivity at 1%
    # FPR fell from 0.9467 to 0.8233. Adding across the window pulls in
    # unrelated sites, and benign variants gain more from that than pathogenic
    # ones do. The hypothesis was that SMN2-like regulatory variants would be
    # rescued by it; SMN2 did clear the sum's own 20% threshold while missing
    # the logit one, but one variant does not buy 12 points of sensitivity.
    def _signed_peak(arr):
        if not len(arr):
            return 0.0
        j = int(np.argmax(np.abs(arr)))
        return float(arr[j])

    res["logit_acceptor_signed"] = _signed_peak(la)
    res["logit_donor_signed"] = _signed_peak(ld)
    return res
