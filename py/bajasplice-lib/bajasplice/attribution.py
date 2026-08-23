"""Per-nucleotide attribution for a predicted splice site.

Two methods, both answering "which bases hold this site up":

  ism       in-silico mutagenesis. Mutate every position in a window to each of
            the three alternatives and measure how far the target site's score
            falls. Slow but model-agnostic and directly interpretable: a
            positive value means the reference base supports the site.
  gradient  gradient of the site's logit with respect to the one-hot input,
            times the input. One backward pass, so it scales to whole genes,
            but it is a local linearisation rather than a real perturbation.

Both return one value per genomic position, aligned to the reference base at
that position, which is what a base-coloured client track wants.
"""
from __future__ import annotations

import numpy as np
import torch

from bajasplice.genome import GenomeReader, one_hot

__all__ = ["ism_attribution", "gradient_attribution", "site_score"]

_CLASS = {"acceptor": 1, "donor": 2}


def _window_input(g, chrom, site, strand, context):
    """One-hot input centred so the model's single output position is `site`."""
    c = context // 2
    codes = g.codes(chrom, site - c, site + c, strand)
    return one_hot(codes), codes


@torch.no_grad()
def site_score(model, context, chrom, site, strand, which, device, genome=None):
    """Model probability of `which` at exactly this genomic position."""
    g = genome or GenomeReader()
    x, _ = _window_input(g, chrom, site, strand, context)
    t = torch.from_numpy(x[None]).to(device)
    p = torch.softmax(model(t).float(), 1)[0, :, 0]
    return float(p[_CLASS[which]])


@torch.no_grad()
def ism_attribution(model, context, chrom, site, strand, which, window,
                    device, genome=None, batch=512):
    """In-silico mutagenesis around `site`.

    Returns (positions, attribution, ref_bases, reference_score). Attribution is
    the mean score drop across the three alternative bases, so positive means
    the reference base is holding the site up.
    """
    g = genome or GenomeReader()
    c = context // 2
    lo, hi = site - window, site + window
    # a mutation at genomic p must be applied inside the model's input window
    base_codes = g.codes(chrom, site - c, site + c, "+")     # genomic orientation
    ref_x, _ = _window_input(g, chrom, site, strand, context)
    ref = site_score(model, context, chrom, site, strand, which, device, g)

    positions, variants, idx_of = [], [], []
    for p in range(lo, hi + 1):
        off = p - (site - c)
        if off < 0 or off >= len(base_codes):
            continue
        r = int(base_codes[off])
        if r == 0:
            continue
        positions.append(p)
        for alt in (1, 2, 3, 4):
            if alt == r:
                continue
            variants.append((off, alt))
            idx_of.append(len(positions) - 1)

    if not positions:
        return np.array([]), np.array([]), [], ref

    # build mutated inputs in transcript orientation
    L = ref_x.shape[1]
    deltas = np.zeros(len(variants), np.float32)
    for s in range(0, len(variants), batch):
        chunk = variants[s:s + batch]
        X = np.repeat(ref_x[None], len(chunk), axis=0)
        for j, (off, alt) in enumerate(chunk):
            # genomic offset -> input column (reverse for minus strand)
            col = off if strand == "+" else L - 1 - off
            a = alt if strand == "+" else {1: 4, 2: 3, 3: 2, 4: 1}[alt]
            X[j, :, col] = 0.0
            X[j, a - 1, col] = 1.0
        t = torch.from_numpy(X).to(device)
        p = torch.softmax(model(t).float(), 1)[:, _CLASS[which], 0]
        deltas[s:s + len(chunk)] = ref - p.cpu().numpy()

    attr = np.zeros(len(positions), np.float32)
    cnt = np.zeros(len(positions), np.float32)
    for d, i in zip(deltas, idx_of):
        attr[i] += d
        cnt[i] += 1
    attr = attr / np.maximum(cnt, 1)
    refs = ["NACGT"[int(base_codes[p - (site - c)])] for p in positions]
    return np.array(positions), attr, refs, ref


def gradient_attribution(model, context, chrom, site, strand, which, window,
                         device, genome=None):
    """Gradient x input for the site's logit. Returns the same tuple as ISM."""
    g = genome or GenomeReader()
    c = context // 2
    x, _ = _window_input(g, chrom, site, strand, context)
    base_codes = g.codes(chrom, site - c, site + c, "+")
    t = torch.from_numpy(x[None]).to(device).requires_grad_(True)
    logit = model(t)[0, _CLASS[which], 0]
    model.zero_grad(set_to_none=True)
    logit.backward()
    gi = (t.grad[0] * t[0]).sum(0).detach().cpu().numpy()      # per input column
    L = len(gi)
    positions, attr, refs = [], [], []
    for p in range(site - window, site + window + 1):
        off = p - (site - c)
        if off < 0 or off >= L:
            continue
        r = int(base_codes[off])
        if r == 0:
            continue
        col = off if strand == "+" else L - 1 - off
        positions.append(p)
        attr.append(float(gi[col]))
        refs.append("NACGT"[r])
    with torch.no_grad():
        ref = float(torch.softmax(model(torch.from_numpy(x[None]).to(device)).float(), 1)[0, _CLASS[which], 0])
    return np.array(positions), np.array(attr, np.float32), refs, ref
