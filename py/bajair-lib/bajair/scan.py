"""Score introns and return only the ones worth showing.

The contract is deliberate: `hits()` returns an empty list when nothing clears
the tier. A retention track is sparse by nature -- most introns in most genes
are not retention-prone, and a track that draws something for all of them is
just intron structure redrawn in a second colour.

Splice-site features are not computed here. bajair stays free of torch; the
ss_ctx2000 scores arrive from bajasplice through bajasplice/bajair.py, the same
adapter shape BajaCLIP uses.
"""
from __future__ import annotations

import numpy as np

from bajair import features as F
from bajair.describe import describe
from bajair.model import load_model, tier_for

__all__ = ["introns_for", "score", "hits", "REQUIRED_SS"]

REQUIRED_SS = ["ss_donor", "ss_acceptor", "ss_min", "ss_donor_compete",
               "ss_acceptor_compete"]


def introns_for(gtf, fasta, genes=None, chroms=None):
    """Every distinct intron in the requested genes, with geometry features."""
    return F.build(gtf, fasta, genes=genes, chroms=chroms)


def score(df, scorer=None):
    """Add an `ir_score` column. Requires the splice-site features."""
    scorer = scorer or load_model()
    missing = [c for c in scorer.features if c not in df.columns]
    if missing:
        raise ValueError(
            f"missing features {missing}. Splice-site columns come from "
            f"bajasplice: see bajasplice.bajair.score_gene, or add "
            f"{REQUIRED_SS} yourself.")
    df = df.copy()
    df["ir_score"] = scorer.clf.predict_proba(
        df[scorer.features].to_numpy(np.float32))[:, 1]
    return df


def hits(df, tier="notable", scorer=None, clean_only=True, limit=0):
    """Scored introns that reach `tier`, each with a written description.

    clean_only keeps MANE introns with both splice sites above 0.9. Without it
    the top of any ranking fills with minor-transcript introns that the model
    recognises as poorly annotated rather than as retention-prone, which is a
    property of the training data and not a finding about the gene.
    """
    scorer = scorer or load_model()
    if "ir_score" not in df.columns:
        df = score(df, scorer)
    sub = df
    if clean_only and {"mane", "ss_min"} <= set(sub.columns):
        sub = sub[(sub.mane == 1) & (sub.ss_min > 0.9)]
    thr = scorer.threshold(tier)
    sub = sub[sub.ir_score >= thr].sort_values("ir_score", ascending=False)
    if limit:
        sub = sub.head(limit)

    out = []
    for r in sub.to_dict("records"):
        t = tier_for(r["ir_score"], scorer)
        if t is None:
            continue
        out.append({
            "chrom": r["chrom"], "start": int(r["istart"]), "end": int(r["iend"]),
            "strand": r["strand"], "gene": r.get("gene_name"),
            "transcript": r.get("transcript_id"),
            "intron_number": int(r.get("intron_number") or 0),
            "n_introns": int(r.get("n_introns") or 0),
            "length": int(r["intron_len"]), "gc": round(float(r["gc_intron"]), 3),
            "ss_donor": round(float(r.get("ss_donor", float("nan"))), 4),
            "ss_acceptor": round(float(r.get("ss_acceptor", float("nan"))), 4),
            "score": round(float(r["ir_score"]), 4),
            **describe(r, t, scorer),
        })
    return out
