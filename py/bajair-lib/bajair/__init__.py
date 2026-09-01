"""bajair - intron retention propensity from sequence.

Given a genome and an annotation, score how retention-prone each intron is. No
reads, no expression data. Twenty features: fifteen describing intron geometry
(length and GC do most of the work) and five frozen BajaSplice splice-site
scores.

What it answers is "is this intron retention-prone in general", not "is it
retained in this sample". Sequence is constant across conditions and retention
is not, so condition-specific retention is out of reach by construction.

Held out: AUC 0.83 on well-annotated introns, 0.63 against VastDB, which is
independent. Use the rank, not the number -- correlation with the actual
retention level is about 0.2.

Quick start, via the bajasplice adapter that supplies splice-site scores:

    from bajasplice.bajair import score_gene
    for h in score_gene("UNC13A"):
        print(h["tier"], h["text"])
"""
from bajair.model import Scorer, load_model, tier_for
from bajair.scan import hits, introns_for, score

__version__ = "0.1.0"
__all__ = ["Scorer", "load_model", "tier_for", "hits", "introns_for", "score",
           "__version__"]
