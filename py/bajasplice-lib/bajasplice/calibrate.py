#!/usr/bin/env python
"""Turn a delta score into a number that means something.

A delta of 0.23 is uninterpretable on its own, and the one threshold in the
codebase is 0.5, picked because it is half of one. The BajaCLIP weights get this
right and ship a per-RBP thr99 with the sensitivity that goes with it; the splice
model ships nothing equivalent, so every consumer invents a cutoff.

This fits the operating points against real data: pathogenic splice-site variants
from ClinVar as positives, benign variants away from splice sites as negatives.
For each target false-positive rate it reports the delta that achieves it and the
sensitivity you get in exchange, which is the trade a caller has to make
knowingly rather than by accident.

Two things this is NOT.

  * It is not a pathogenicity model. A variant can destroy a splice site and be
    benign; ClinVar's own benign_splice class exists for exactly that. The
    positives here are "clinically disrupts splicing", nothing more.
  * It is not calibrated for cryptic-site gains. ClinVar's splice-site
    annotations are dominated by variants AT the canonical GT/AG, so the fitted
    thresholds describe losses far better than gains. Gains need MFASS or
    Vex-seq, which are not in this repo.

    python -m bajasplice.calibrate --limit 600 --save
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

# False-positive rates worth an operating point. 0.01 is the conservative call
# a clinical report wants; 0.10 is the screening call that feeds a shortlist.
TARGET_FPR = (0.01, 0.02, 0.05, 0.10, 0.20)


def thresholds_at_fpr(pos, neg, fprs=TARGET_FPR):
    """The delta achieving each FPR against `neg`, and the sensitivity there."""
    neg = np.asarray(neg, dtype=float)
    pos = np.asarray(pos, dtype=float)
    out = []
    for f in fprs:
        # the (1-f) quantile of the negatives IS the threshold with that FPR
        t = float(np.quantile(neg, 1.0 - f)) if len(neg) else float("nan")
        sens = float((pos >= t).mean()) if len(pos) else float("nan")
        out.append({"fpr": f, "delta": round(t, 4), "sensitivity": round(sens, 4)})
    return out


def percentile_of(delta, neg):
    """Where a delta sits in the benign distribution, as a one-sided p."""
    neg = np.asarray(neg, dtype=float)
    if not len(neg):
        return None
    return float((1 + (neg >= float(delta)).sum()) / (len(neg) + 1))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=600,
                    help="variants per ClinVar class (default 600)")
    ap.add_argument("--save", action="store_true",
                    help="write weights/delta_calibration.json")
    args = ap.parse_args()

    from bajasplice.validate.datasets import load_clinvar
    from bajasplice.validate.suite import _device_model
    from bajasplice.variants import delta_score
    from bajasplice.genome import GenomeReader
    from sklearn.metrics import roc_auc_score

    def both_deltas(df):
        """(probability delta, logit delta) per variant, best of the two strands.

        The logit scale is carried through because a probability near 1 has no
        room left: a real change at a strong site is compressed to almost
        nothing there while the same change at a weak site reads large.
        """
        m, ctx, dev = _device_model()
        g = GenomeReader()
        P, L, Q = [], [], []
        for row in df.itertuples(index=False):
            best = None
            for st in ("+", "-"):
                r = delta_score(m, ctx, row.chrom, int(row.pos), row.ref, row.alt,
                                dev, strand=st, window=50, genome=g)
                if best is None or r["delta"] > best["delta"]:
                    best = r
            P.append(best["delta"])
            L.append(best.get("logit_delta", 0.0))
            Q.append(best.get("logit_pair", 0.0))
        return np.asarray(P), np.asarray(L), np.asarray(Q)

    df = load_clinvar(max_per_class=args.limit)
    if df is None or df.empty:
        raise SystemExit("ClinVar VCF not found; set BAJASPLICE_CLINVAR")

    sub = df[df.cls.isin(["pathogenic_splice", "benign_missense"])].reset_index(drop=True)
    if sub.cls.nunique() < 2:
        raise SystemExit("need both pathogenic_splice and benign_missense")

    d, dl, dq = both_deltas(sub)
    y = (sub.cls == "pathogenic_splice").astype(int).values
    pos, neg = d[y == 1], d[y == 0]
    lpos, lneg = dl[y == 1], dl[y == 0]
    qpos, qneg = dq[y == 1], dq[y == 0]

    auc = float(roc_auc_score(y, d))
    lauc = float(roc_auc_score(y, dl))
    rows = thresholds_at_fpr(pos, neg)
    lrows = thresholds_at_fpr(lpos, lneg)
    qauc = float(roc_auc_score(y, dq))
    qrows = thresholds_at_fpr(qpos, qneg)

    print("n positives (pathogenic splice): %d" % len(pos))
    print("n negatives (benign missense)  : %d" % len(neg))
    print("AUC                            : %.4f" % auc)
    print()
    print("AUC (logit scale)              : %.4f" % lauc)
    print("AUC (logit pair, both ends)    : %.4f" % qauc)
    print()
    print("%-6s | %-10s %-9s | %-11s %-9s | %-11s %-9s"
          % ("FPR", "delta>=", "sens", "logit>=", "sens", "pair>=", "sens"))
    for r, lr, qr in zip(rows, lrows, qrows):
        print("%-6.2f | %-10.4f %-9.4f | %-11.3f %-9.4f | %-11.3f %-9.4f"
              % (r["fpr"], r["delta"], r["sensitivity"],
                 lr["delta"], lr["sensitivity"], qr["delta"], qr["sensitivity"]))
    print()
    print("median delta: pathogenic %.4f, benign %.4f"
          % (float(np.median(pos)), float(np.median(neg))))
    print("the 0.5 that the code currently assumes has FPR %.4f and sensitivity %.4f"
          % (float((neg >= 0.5).mean()), float((pos >= 0.5).mean())))

    if args.save:
        import bajasplice
        out = Path(bajasplice.__file__).parent / "weights" / "delta_calibration.json"
        out.write_text(json.dumps({
            "source": "ClinVar pathogenic_splice vs benign_missense",
            "n_pos": int(len(pos)), "n_neg": int(len(neg)),
            "auc": round(auc, 4),
            "operating_points": rows,
            "auc_logit": round(lauc, 4),
            "operating_points_logit": lrows,
            "auc_logit_pair": round(qauc, 4),
            "operating_points_logit_pair": qrows,
            "logit_benign_quantiles": {str(q): round(float(np.quantile(lneg, q)), 4)
                                       for q in (0.5, 0.8, 0.9, 0.95, 0.98, 0.99, 0.995)},
            # the benign distribution itself, so a consumer can place any delta
            "benign_quantiles": {str(q): round(float(np.quantile(neg, q)), 4)
                                 for q in (0.5, 0.8, 0.9, 0.95, 0.98, 0.99, 0.995)},
            "caveat": ("losses only: ClinVar splice annotations are dominated by "
                       "variants at the canonical GT/AG, so gains are not calibrated"),
        }, indent=1))
        print("\nwrote %s" % out)


if __name__ == "__main__":
    main()
