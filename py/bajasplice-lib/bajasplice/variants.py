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
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
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
    return res
