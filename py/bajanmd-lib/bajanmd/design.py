"""Steric-block ASOs that push a cassette exon toward being skipped.

MASKING IS THE OLIGO. A steric-block oligo occludes its site rather than
rewriting it, so replacing the window with N (information removed, no motif
added) is the honest in-silico analogue. Substituting scrambled sequence is
not: tried against ISS-N1 it gave donor values from 0.037 to 0.996 over twelve
shuffles, because a mononucleotide shuffle near a real donor invents cryptic
GTs and creates elements instead of removing one. The same masking approach,
in the opposite direction, reproduces the ISS-N1 result that nusinersen came
out of (see bajasplice.evaluate.aso_walk).

EITHER SPLICE SITE IS ENOUGH. An exon needs BOTH its sites to be included, so
destroying either one causes skipping. The per-window objective is therefore
the larger of the two losses, not the smaller: no 18-mer can cover two sites
that sit 100 nt apart, and taking the minimum scores every window at zero.

LOGITS, NOT PROBABILITIES. A site at 0.9997 has almost no room to fall on the
probability scale, so probability deltas tie every effective window together.
Driving a site to the clip floor still caps the score, and those ties are
reported as `saturated` so a caller does not read the order as potency.

STRAND. GenomeReader.codes reverse-complements for a minus-strand request, so
the model's output runs in transcript order while genomic arithmetic does not.
Indexing donor and acceptor by genomic position, as an earlier walk here did,
silently scores the wrong bases on every minus-strand gene. Everything below
goes through tx_index/splice_indices, and design() reports the reference
probabilities so a wrong convention shows up as both sites reading near zero
rather than as a plausible but wrong ranking.
"""
from __future__ import annotations

import numpy as np

COMP = str.maketrans("ACGTN", "TGCAN")
SITE_PAD = 6          # the consensus reaches about 6 nt either side


def revcomp(s):
    return s.translate(COMP)[::-1]


def tx_index(g, lo, hi, strand):
    """Model-output index of genomic coordinate g, in transcript order."""
    return (g - lo) if strand == "+" else (hi - g)


def splice_indices(exon_start, exon_end, lo, hi, strand):
    """(acceptor index, donor index) for the exon, in transcript order.

    Acceptor is the last intronic base before the exon, donor the first after.
    On the minus strand the exon's first transcribed base is genomic exon_end,
    so the acceptor sits at exon_end + 1 and the donor at exon_start - 1.
    """
    if strand == "+":
        return (tx_index(exon_start - 1, lo, hi, strand),
                tx_index(exon_end + 1, lo, hi, strand))
    return (tx_index(exon_end + 1, lo, hi, strand),
            tx_index(exon_start - 1, lo, hi, strand))


def logit(v, eps=1e-7):
    v = np.clip(np.asarray(v, float), eps, 1 - eps)
    return np.log(v / (1 - v))


def _runs(s, base):
    out, cur = [], 0
    for ch in s:
        cur = cur + 1 if ch == base else 0
        if ch == base:
            out.append(cur)
    return out or [0]


def developability(aso):
    """Liabilities that sink an oligo regardless of predicted potency."""
    n = len(aso) or 1
    gc = (aso.count("G") + aso.count("C")) / n
    longest = {b: max(_runs(aso, b)) for b in "ACGT"}
    cpg = aso.count("CG")
    flags = []
    if not 0.30 <= gc <= 0.65:
        flags.append(f"gc_{gc:.2f}")
    if longest["G"] >= 4:
        flags.append(f"g_run_{longest['G']}")
    if max(longest.values()) >= 5:
        flags.append("homopolymer_5")
    if cpg >= 2:
        flags.append(f"cpg_{cpg}")
    if "N" in aso:
        flags.append("ambiguous_base")
    return {"gc": round(gc, 3), "cpg": cpg, "max_g_run": longest["G"],
            "flags": flags, "developable": not flags}


def walk(chrom, exon_start, exon_end, strand="+", aso_len=18, flank=120,
         step=1, genome=None, model=None, pad=400):
    """Mask every window over the exon and both flanks; read the splice sites."""
    import torch
    from bajasplice.genome import GenomeReader, one_hot
    from bajasplice.scan import load_splicenet

    g = genome or GenomeReader()
    model, ctx, dev = model or load_splicenet()
    half = ctx // 2
    lo = exon_start - flank - aso_len - pad
    hi = exon_end + flank + aso_len + pad
    base = g.codes(chrom, lo - half, hi + half, strand).astype(np.int64)
    a_idx, d_idx = splice_indices(exon_start, exon_end, lo, hi, strand)
    n_out = hi - lo + 1
    if not (0 <= a_idx < n_out and 0 <= d_idx < n_out):
        raise ValueError("splice index outside the scored span")

    def score(codes):
        x = torch.from_numpy(one_hot(codes)[None]).to(dev)
        with torch.no_grad():
            p = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
        if p.shape[-1] != n_out:
            raise ValueError(f"model returned {p.shape[-1]} positions, "
                             f"expected {n_out}")
        return float(p[1, a_idx]), float(p[2, d_idx])

    ref_a, ref_d = score(base)
    starts, accs, dons = [], [], []
    for gs in range(exon_start - flank, exon_end + flank - aso_len + 2, step):
        i = tx_index(gs if strand == "+" else gs + aso_len - 1, lo, hi, strand)
        i += half                       # into the uncropped input array
        if i < 0 or i + aso_len > len(base):
            continue
        c = base.copy()
        c[i:i + aso_len] = 0            # the oligo's footprint
        sa, sd = score(c)
        starts.append(gs); accs.append(sa); dons.append(sd)
    return {"ref_acceptor": ref_a, "ref_donor": ref_d,
            "start": np.array(starts), "acceptor": np.array(accs),
            "donor": np.array(dons)}


def design(chrom, exon_start, exon_end, strand="+", aso_len=18, flank=120,
           step=1, top=25, genome=None, model=None, min_ref=0.05):
    """Ranked ASO candidates for skipping one exon.

    `warning` is set, and the ranking should not be trusted, when either
    reference probability is below min_ref: the exon is not used in this
    context, or the coordinates are wrong.
    """
    from bajasplice.genome import GenomeReader

    g = genome or GenomeReader()
    w = walk(chrom, exon_start, exon_end, strand, aso_len, flank, step,
             genome=g, model=model)
    ref_a, ref_d = w["ref_acceptor"], w["ref_donor"]
    warning = None
    if min(ref_a, ref_d) < min_ref:
        warning = (f"reference acceptor {ref_a:.4f} donor {ref_d:.4f}: at "
                   f"least one is below {min_ref}, so either the exon is not "
                   f"used in this context or the coordinates are wrong. The "
                   f"ranking is not trustworthy until that is resolved.")

    da = logit(ref_a) - logit(w["acceptor"])
    dd = logit(ref_d) - logit(w["donor"])
    skip = np.maximum(da, dd)

    out = []
    for k in range(len(w["start"])):
        s = int(w["start"][k])
        e = s + aso_len - 1
        target = g.sequence(chrom, s, e, strand)     # transcript orientation
        aso = revcomp(target)
        on_left = not (e < exon_start - SITE_PAD or s > exon_start + SITE_PAD)
        on_right = not (e < exon_end - SITE_PAD or s > exon_end + SITE_PAD)
        where = ("splice_site" if (on_left or on_right)
                 else "exonic" if s >= exon_start and e <= exon_end
                 else "flank")
        exonic = max(0, min(e, exon_end) - max(s, exon_start) + 1)
        out.append({
            "chrom": chrom, "start": s, "end": e, "strand": strand,
            "aso_5to3": aso, "target": target,
            "skip_logit": round(float(skip[k]), 4),
            "d_acceptor_logit": round(float(da[k]), 4),
            "d_donor_logit": round(float(dd[k]), 4),
            "acceptor": round(float(w["acceptor"][k]), 5),
            "donor": round(float(w["donor"][k]), 5),
            "saturated": bool(min(w["acceptor"][k], w["donor"][k]) < 1e-6),
            "where": where, "exonic_nt": exonic,
            **developability(aso)})
    out.sort(key=lambda r: (-round(r["skip_logit"], 3),
                            -(r["d_acceptor_logit"] + r["d_donor_logit"]),
                            not r["developable"]))
    return {"exon": {"chrom": chrom, "start": exon_start, "end": exon_end,
                     "strand": strand,
                     "length": exon_end - exon_start + 1},
            "reference": {"acceptor": round(ref_a, 5),
                          "donor": round(ref_d, 5)},
            "aso_len": aso_len, "n_windows": len(out), "warning": warning,
            "candidates": out[:top]}
