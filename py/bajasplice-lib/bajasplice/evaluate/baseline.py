#!/usr/bin/env python
"""Record what the models do now, so a retrain can be judged rather than felt.

Fine-tuning will change every number. Without a frozen record of the current
ones, "did it get worse?" is unanswerable, and the temptation is to look only at
the metric that improved.

    python -m bajasplice.evaluate.baseline --save pre-mfass
    ...train...
    python -m bajasplice.evaluate.baseline --compare pre-mfass

Each probe is independent and failures are recorded rather than fatal, so a
missing dataset costs you that line and not the run. Every number here was
measured on 2026-11-09; the comparison prints deltas and flags regressions.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

# A regression worth stopping for, per metric. AUCs move little and matter a
# lot; single-variant deltas are noisier and are reported but not gated.
GATES = {"clinvar_disruption_auc_logit": 0.005,
         "clinvar_regulatory_auc_logit": 0.02,
         "issn1_donor_gain_logit": 1.0}


def probes():
    """{name: callable} -- each returns a float or raises."""
    import torch
    from bajasplice.genome import GenomeReader, one_hot
    from bajasplice.scan import load_splicenet
    from bajasplice.variants import delta_score
    from sklearn.metrics import roc_auc_score

    g = GenomeReader()
    m, ctx, dev = load_splicenet()
    out = {}

    def best(chrom, pos, ref, alt, key, strand=None):
        """Score a variant. SELECT ON THE SCALE BEING REPORTED, and prefer an
        explicit strand.

        The first version picked the strand with the largest PROBABILITY delta
        and then reported the LOGIT, which for MAPK8IP3 R578C chose the minus
        strand (delta 0.0294, logit 0.980) over the plus (0.0198, logit 1.850)
        and recorded the antisense number for a plus-strand gene. Scanning both
        strands is the right default when the strand is unknown; for a named
        variant in a known gene it is a way to record the wrong answer.
        """
        sts = (strand,) if strand else ("+", "-")
        b = None
        for st in sts:
            d = delta_score(m, ctx, chrom, pos, ref, alt, dev, strand=st,
                            window=50, genome=g)
            v = d.get(key, d.get("logit_delta", 0.0))
            if b is None or v > b[0]:
                b = (v, d)
        return b[0]

    def clinvar(classes, limit=400):
        from bajasplice.validate.datasets import load_clinvar
        df = load_clinvar(max_per_class=limit)
        sub = df[df.cls.isin(classes)].reset_index(drop=True)
        y = (sub.cls == classes[0]).astype(int).values
        P, L = [], []
        for r in sub.itertuples(index=False):
            b = None
            for st in ("+", "-"):
                d = delta_score(m, ctx, r.chrom, int(r.pos), r.ref, r.alt, dev,
                                strand=st, window=50, genome=g)
                if b is None or d["delta"] > b["delta"]:
                    b = d
            P.append(b["delta"]); L.append(b.get("logit_delta", 0.0))
        return (float(roc_auc_score(y, P)), float(roc_auc_score(y, L)))

    def issn1():
        """Donor gain when ISS-N1 is masked -- the ASO analogue."""
        EX7_END, LO, TLEN = 70076574, 70076584, 18
        half = ctx // 2
        a = EX7_END - 200
        base = g.codes("chr5", a - half, EX7_END + 400 + half, "+").astype(np.int64)

        def donor(codes):
            x = torch.from_numpy(one_hot(codes)[None]).to(dev)
            with torch.no_grad():
                p = torch.softmax(m(x).float(), 1)[0].cpu().numpy()
            return float(p[2, EX7_END + 1 - a])

        lg = lambda v: float(np.log(np.clip(v, 1e-7, 1 - 1e-7) / (1 - np.clip(v, 1e-7, 1 - 1e-7))))
        ref = donor(base)
        c = base.copy()
        off = LO - (a - half)
        c[off:off + TLEN] = 0
        return ref, lg(donor(c)) - lg(ref)

    out["clinvar_disruption_auc"] = lambda: clinvar(["pathogenic_splice", "benign_missense"])[0]
    out["clinvar_disruption_auc_logit"] = lambda: clinvar(["pathogenic_splice", "benign_missense"])[1]
    out["clinvar_regulatory_auc"] = lambda: clinvar(["pathogenic_synonymous", "benign_synonymous"])[0]
    out["clinvar_regulatory_auc_logit"] = lambda: clinvar(["pathogenic_synonymous", "benign_synonymous"])[1]
    # single variants: noisy, reported but not gated
    # strands stated, not inferred: SMN2 and MAPK8IP3 are plus-strand, LMNA is
    # plus-strand. Letting the scan choose recorded the antisense value above.
    out["smn2_c840_logit"] = lambda: best("chr5", 70076526, "T", "C", "logit_delta", "+")
    out["lmna_g608g_logit"] = lambda: best("chr1", 156136110, "C", "T", "logit_delta", "+")
    out["mapk8ip3_r578c_logit"] = lambda: best("chr16", 1762843, "C", "T", "logit_delta", "+")
    out["issn1_donor_reference"] = lambda: issn1()[0]
    out["issn1_donor_gain_logit"] = lambda: issn1()[1]
    return out


def run():
    res, P = {}, probes()
    for name, fn in P.items():
        try:
            v = float(fn())
            res[name] = round(v, 6)
            print("  %-34s %.6f" % (name, v))
        except Exception as e:
            res[name] = {"error": str(e)[:200]}
            print("  %-34s FAILED: %s" % (name, str(e)[:80]))
    return res


def path_for(tag):
    import bajasplice
    d = Path(bajasplice.__file__).parent / "weights" / "baselines"
    d.mkdir(parents=True, exist_ok=True)
    return d / ("%s.json" % tag)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--save", metavar="TAG")
    ap.add_argument("--compare", metavar="TAG")
    a = ap.parse_args()
    if not (a.save or a.compare):
        raise SystemExit("one of --save or --compare is required")

    print("measuring...")
    now = run()

    if a.save:
        p = path_for(a.save)
        p.write_text(json.dumps({"tag": a.save, "when": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                 "metrics": now}, indent=1))
        print("\nwrote %s" % p)
        return

    p = path_for(a.compare)
    if not p.is_file():
        raise SystemExit("no baseline %r at %s" % (a.compare, p))
    old = json.loads(p.read_text())
    print("\ncompared with %r (%s)" % (old["tag"], old["when"]))
    print("  %-34s %-12s %-12s %-10s" % ("metric", "before", "now", "change"))
    bad = []
    for k, was in old["metrics"].items():
        new = now.get(k)
        if isinstance(was, dict) or isinstance(new, dict) or new is None:
            print("  %-34s %-12s %-12s %s" % (k, was, new, "(not comparable)")); continue
        d = new - was
        flag = ""
        if k in GATES and d < -GATES[k]:
            flag = "  <-- REGRESSION (gate %.3f)" % GATES[k]
            bad.append(k)
        print("  %-34s %-12.6f %-12.6f %+-10.6f%s" % (k, was, new, d, flag))
    print()
    if bad:
        print("REGRESSED past the gate: %s" % ", ".join(bad))
        print("restore with:  python -m bajasplice.snapshot restore --tag <your snapshot>")
    else:
        print("no gated metric regressed.")


if __name__ == "__main__":
    main()
