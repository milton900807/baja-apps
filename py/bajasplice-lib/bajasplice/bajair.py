"""Adapter for BajaIR, the intron-retention scorer.

BajaIR itself is deliberately free of torch: it is a gradient-boosted model over
intron geometry plus five frozen ss_ctx2000 splice-site scores. Those five come
from here, which is where the splice-site model already lives. Same shape as the
BajaCLIP adapter next door.

    from bajasplice.bajair import score_gene
    for h in score_gene("UNC13A"):
        print(h["tier"], h["text"])

score_gene returns an empty list when nothing in the gene clears the tier, which
for most genes is the correct answer and is not an error.

One caveat worth knowing. The scorer answers "is this intron retention-prone in
general", never "is it retained in this sample": sequence is constant across
conditions and retention is not. And it is a shortlist, not a caller -- at the
default tier roughly a quarter of reported introns have measurable retention,
which is 6x background but is not a prediction you should act on singly.
"""
from __future__ import annotations

import numpy as np

__all__ = ["available", "splice_site_features", "introns_for_gene", "score_gene"]

TARGET = 41      # positions scored per site; the centre is the site itself
COMPETE = 20     # +/- nt searched for a competing site
BATCH = 256


def available() -> bool:
    """Is bajair installed with usable weights?"""
    try:
        from bajair.model import load_model
        load_model()
        return True
    except Exception:
        return False


def splice_site_features(df, ckpt=None, device=None, genome=None, batch=BATCH):
    """ss_ctx2000 scores at each intron's own donor and acceptor.

    The donor is the first intronic base in TRANSCRIPT orientation, so on the
    minus strand it sits at the genomic right end. Scoring both ends as if they
    were plus-strand silently mis-scores every minus-strand intron.
    """
    import torch
    from bajasplice.genome import GenomeReader, one_hot
    from bajasplice.scan import load_splicenet

    model, context, device = load_splicenet(ckpt, device)
    g = genome or GenomeReader()
    c, half = context // 2, TARGET // 2

    plus = (df.strand.to_numpy() == "+")
    istart, iend = df.istart.to_numpy(), df.iend.to_numpy()
    pos = np.stack([np.where(plus, istart, iend), np.where(plus, iend, istart)], 1)
    chrom, strand = df.chrom.to_numpy(), df.strand.to_numpy()

    out = np.zeros((len(df), 2, 4), np.float32)
    jobs = [(i, k) for i in range(len(df)) for k in (0, 1)]
    buf, meta = [], []
    with torch.no_grad():
        for j, (i, k) in enumerate(jobs):
            p = int(pos[i, k])
            buf.append(one_hot(g.codes(chrom[i], p - half - c, p + half + c, strand[i])))
            meta.append((i, k))
            if len(buf) == batch or j == len(jobs) - 1:
                x = torch.from_numpy(np.stack(buf)).to(device)
                with torch.autocast("cuda", dtype=torch.bfloat16,
                                    enabled=device.type == "cuda"):
                    p3 = torch.softmax(model(x).float(), 1).cpu().numpy()
                for b, (ii, kk) in enumerate(meta):
                    acc, don = p3[b, 1], p3[b, 2]
                    lo, hi = half - COMPETE, half + COMPETE + 1
                    nb_d = np.concatenate([don[lo:half], don[half + 1:hi]])
                    nb_a = np.concatenate([acc[lo:half], acc[half + 1:hi]])
                    out[ii, kk] = (don[half], acc[half], nb_d.max(), nb_a.max())
                buf, meta = [], []

    df = df.copy()
    df["ss_donor"] = out[:, 0, 0]
    df["ss_donor_compete"] = out[:, 0, 2]
    df["ss_acceptor"] = out[:, 1, 1]
    df["ss_acceptor_compete"] = out[:, 1, 3]
    df["ss_min"] = df[["ss_donor", "ss_acceptor"]].min(axis=1)
    return df


def introns_for_gene(gene, transcript=None, genome_fasta=None):
    """Every distinct intron of a gene, with geometry and splice-site features.

    Exons come from BajaSplice's gene index, so this is a keyed lookup rather
    than a parse of the whole annotation.
    """
    from bajair import features as F
    from bajasplice.config import paths
    from bajasplice.scan import gene_span

    chrom, gs, ge, strand, ex = gene_span(gene, transcript=transcript)
    if "gene_name" not in ex.columns:
        ex = ex.assign(gene_name=gene)
    df = F.introns_from_exons(ex)
    if df.empty:
        return df
    fasta = genome_fasta or paths().require("genome_fasta")
    df = F.add_sequence_features(df, fasta)
    df = F.add_derived(df)
    return splice_site_features(df)


def score_gene(gene, tier="notable", clean_only=True, limit=0, transcript=None,
               ckpt=None, device=None):
    """Introns of `gene` that reach `tier`, each with a written description.

    Empty list means nothing cleared the bar, which is the usual outcome.
    """
    from bajair.scan import hits
    df = introns_for_gene(gene, transcript=transcript)
    if df is None or len(df) == 0:
        return []
    return hits(df, tier=tier, clean_only=clean_only, limit=limit)
