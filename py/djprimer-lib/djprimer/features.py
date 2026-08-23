"""Feature computation for a candidate assay.

djPrimer's deployed feature vector is primer3's own thermodynamic scores plus the
target gene's expression. Amplicon features are part of the trained model but
require a reference transcript (Ensembl) and ViennaRNA; the service leaves them
missing, which the gradient-boosted model tolerates, and they contribute almost
nothing to the score. See the qpcr-assay-model repository for the full pipeline.
"""
from __future__ import annotations

import numpy as np

try:
    import primer3
except ImportError:  # keep import-time failure legible
    primer3 = None

__all__ = ["primer3_features", "PRIMER3_COLS"]

PRIMER3_COLS = ["p3_f_tm", "p3_r_tm", "p3_tm_diff", "p3_f_hp", "p3_r_hp",
                "p3_f_homo", "p3_r_homo", "p3_het"]


def primer3_features(fwd: str, rev: str) -> dict:
    """primer3's own thermodynamics for a primer pair (the design floor)."""
    if primer3 is None:
        raise ImportError("primer3-py is required: pip install primer3-py")
    fwd, rev = fwd.strip().upper(), rev.strip().upper()

    def one(seq):
        try:
            return (primer3.calc_tm(seq),
                    primer3.calc_hairpin(seq).dg / 1000.0,
                    primer3.calc_homodimer(seq).dg / 1000.0)
        except Exception:
            return (np.nan, np.nan, np.nan)

    ftm, fhp, fho = one(fwd)
    rtm, rhp, rho = one(rev)
    try:
        het = primer3.calc_heterodimer(fwd, rev).dg / 1000.0
    except Exception:
        het = np.nan
    return dict(p3_f_tm=ftm, p3_r_tm=rtm, p3_tm_diff=abs(ftm - rtm),
                p3_f_hp=fhp, p3_r_hp=rhp, p3_f_homo=fho, p3_r_homo=rho, p3_het=het)
