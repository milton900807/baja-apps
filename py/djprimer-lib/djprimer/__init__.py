"""djprimer - qPCR assay-success prediction from primer design and target expression.

A gradient-boosted model scores a candidate assay (target gene + primer pair) for
its probability of working. primer3-style design thermodynamics form a floor;
the signal that actually decides the outcome is whether the target is expressed,
brought in from bundled per-gene expression references. Use it to triage assays
before the bench: rank candidates, run the high-scoring ones first.

Quick start:

    from djprimer import load_model, score
    m = load_model()                                  # bundled model + references
    score("GAPDH", "CAACAGTGGCAACACCTTGTG", "TGGGTTGGTCATGCTCACTAG", m)

Serve it:

    uvicorn djprimer.service:app          # POST /score {gene, forward, reverse}
"""
from djprimer.predict import DJPrimer, load_model, score, score_batch

__version__ = "0.1.0"
__all__ = ["DJPrimer", "load_model", "score", "score_batch", "__version__"]
