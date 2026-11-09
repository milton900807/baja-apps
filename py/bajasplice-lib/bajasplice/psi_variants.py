"""What a variant does to exon INCLUSION, rather than to splice-site strength.

Everything in variants.py differences SpliceNet, which scores how good a site
looks. That is the right question for a variant at a GT or an AG and the wrong
one for a regulatory variant, which leaves both sites intact and changes how
often the exon is used. Measured on ClinVar, the site-strength statistics reach
AUC 0.9955, and SMN2 c.840C>T still scores below the 20th percentile of benign
variants on every one of them, because it moves exon 7's sites by a real but
unremarkable amount while changing inclusion from ~90% to ~10%.

PSINet predicts inclusion directly, from the four splice-site windows of a
cassette event plus six geometry features, so differencing IT asks the question
the variant actually answers.

What this needs that the site models do not: the exon TRIPLE. The upstream
exon's end, the cassette exon's start and end, and the downstream exon's start.
A variant alone is not enough, because inclusion is a property of an event.

    from bajasplice.psi_variants import load_psinet, psi_delta
    m, args, dev = load_psinet()
    r = psi_delta(m, args, dev, "chr5", "+", c1_end=70070751, a_start=70076521,
                  a_end=70076574, c2_start=70077542,
                  pos=70076526, ref="T", alt="C")
    r["dpsi"]   # predicted change in mean PSI, alt minus ref

Windows and geometry follow bajasplice.datasets.PSIDataset exactly; if that
changes, this must change with it or the numbers are quietly meaningless.
"""
from __future__ import annotations

import numpy as np
import torch

from .genome import GenomeReader, one_hot
from .models import PSINet
from .scan import resolve_checkpoint

# + strand complement over the 0..4 code alphabet (0 = N)
_COMP5 = np.array([0, 4, 3, 2, 1], dtype=np.int64)
_CODE = {"A": 1, "C": 2, "G": 3, "T": 4, "N": 0}


def load_psinet(ckpt=None, device=None):
    """(model, args, device). n_tissues is read from the checkpoint, not guessed."""
    path = resolve_checkpoint(ckpt, name="psi_ctx2000")
    ck = torch.load(str(path), map_location="cpu", weights_only=False)
    args = ck.get("args", {}) or {}
    n_tis = int(ck["model"]["out_tissue.weight"].shape[0])
    dev = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    m = PSINet(n_tissues=n_tis, context=int(args.get("context", 2000)),
               ch=int(args.get("channels", 32)), win=int(args.get("win", 400)))
    m.load_state_dict(ck["model"])
    return m.to(dev).eval(), args, dev


def _site_positions(strand, c1_end, a_start, a_end, c2_start):
    """The four sites in TRANSCRIPT order, as datasets.site_positions does it."""
    if strand == "+":
        return (c1_end + 1, a_start - 1, a_end + 1, c2_start - 1)
    return (c2_start - 1, a_end + 1, a_start - 1, c1_end + 1)


def _gc(c):
    return float(((c == 2) | (c == 3)).sum() / max((c > 0).sum(), 1))


def psi_delta(model, args, device, chrom, strand, c1_end, a_start, a_end, c2_start,
              pos, ref, alt, genome=None):
    """Predicted mean PSI for the reference and the alternate allele.

    The variant is applied on the PLUS strand, as a VCF writes it, and each
    window is reverse-complemented afterwards when the event is on the minus
    strand -- the same order variants.variant_tracks uses, so the two agree.
    """
    g = genome or GenomeReader()
    total = int(args.get("win", 400)) + int(args.get("context", 2000))
    half = total // 2
    sites = _site_positions(strand, c1_end, a_start, a_end, c2_start)

    def window(p, mutate):
        lo, hi = int(p) - half, int(p) + half - 1
        codes = g.codes(chrom, lo, hi, "+").astype(np.int64)
        if mutate and lo <= pos <= hi:
            j = pos - lo
            # a substitution only; an indel would shift the window and needs its
            # own handling rather than being silently mis-scored
            if len(ref) == len(alt):
                for k, b in enumerate(alt):
                    if 0 <= j + k < len(codes):
                        codes[j + k] = _CODE.get(b, 0)
        if strand == "-":
            codes = _COMP5[codes[::-1]]
        return one_hot(codes)

    def geom(mutate):
        ex = g.codes(chrom, int(a_start), int(a_end), strand).astype(np.int64)
        intr = g.codes(chrom, int(c1_end) + 1, int(c1_end) + 200, strand).astype(np.int64)
        if mutate and len(ref) == len(alt) and a_start <= pos <= a_end:
            j = (pos - a_start) if strand == "+" else (a_end - pos)
            if 0 <= j < len(ex):
                b = alt if strand == "+" else {"A": "T", "C": "G", "G": "C", "T": "A"}.get(alt, "N")
                ex[j] = _CODE.get(b[0], 0)
        exon_len = int(a_end) - int(a_start) + 1
        return np.array([
            np.log10(max(exon_len, 1)),
            np.log10(max(int(a_start) - int(c1_end) - 1, 1)),
            np.log10(max(int(c2_start) - int(a_end) - 1, 1)),
            1.0 if exon_len % 3 == 0 else 0.0,
            _gc(ex), _gc(intr),
        ], dtype=np.float32)

    out = {}
    for tag, mut in (("ref", False), ("alt", True)):
        wins = np.stack([window(p, mut) for p in sites]).astype(np.float32)
        x = torch.from_numpy(wins[None]).to(device)
        gm = torch.from_numpy(geom(mut)[None]).to(device)
        with torch.no_grad():
            tis, mean = model(x, gm)
        out[tag] = float(torch.sigmoid(mean)[0].item())
        out[tag + "_tissue"] = torch.sigmoid(tis)[0].cpu().numpy()

    out["dpsi"] = out["alt"] - out["ref"]
    # the logit scale, for the same reason variants.py reports it: a PSI near 0
    # or 1 has no room left, and SMN2's exon 7 sits at an extreme in both alleles
    lg = lambda v: float(np.log(np.clip(v, 1e-6, 1 - 1e-6) / (1 - np.clip(v, 1e-6, 1 - 1e-6))))
    out["dpsi_logit"] = lg(out["alt"]) - lg(out["ref"])
    out["max_tissue_dpsi"] = float(np.max(np.abs(out["alt_tissue"] - out["ref_tissue"])))
    for k in ("ref_tissue", "alt_tissue"):
        out[k] = [round(float(v), 4) for v in out[k]]
    return out
