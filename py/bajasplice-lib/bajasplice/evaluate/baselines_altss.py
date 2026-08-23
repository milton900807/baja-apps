#!/usr/bin/env python
"""Controls for the competing-splice-site task.

  pwm       pick the member whose variable site has the strongest PWM score
  proximal  pick the member with the shortest intron
  distal    pick the member with the longest intron
  random    expected accuracy given the observed group-size distribution

Splice-site choice has a well-known proximal bias, so `proximal` is the control
that matters: a model that only reproduces it has learned nothing about
regulatory sequence.
"""
import numpy as np, pandas as pd, os, json, sys, pickle
from bajasplice.genome import GenomeReader, split_of
from bajasplice.datasets import load_groups
from bajasplice.evaluate.baselines_splicesite import collect_motifs, fit_pwm, score_track, DONOR_OFF, ACC_OFF
from scipy.stats import pearsonr

from bajasplice.config import paths
def main():
    a = load_groups()
    a = a[a.split == "test"].copy()
    g = GenomeReader()
    with open(os.path.join(paths().processed, "splicesite_index.pkl"), "rb") as f:
        idx = pickle.load(f)
    G = idx["genes"].copy(); G["split"] = G.chrom.map(split_of)
    pwms = {k: fit_pwm(collect_motifs(idx["sites"], G, "train", g, k, n_max=50000))
            for k in ("donor", "acceptor")}
    print(f"test rows {len(a):,}  groups {a.group_id.nunique():,}", flush=True)

    pad = 40
    scores = np.zeros(len(a), dtype=np.float32)
    for i, r in enumerate(a.itertuples(index=False)):
        kind = "acceptor" if r.event_type == "alt3" else "donor"
        p = int(r.acceptor_pos if r.event_type == "alt3" else r.donor_pos)
        lo = (ACC_OFF if kind == "acceptor" else DONOR_OFF)[0]
        codes = g.codes(r.chrom, p - pad, p + pad, r.strand)
        scores[i] = score_track(codes, pwms[kind], lo)[pad]
        if i % 20000 == 0:
            print(f"  {i}/{len(a)}", flush=True)
    a["pwm"] = scores
    a["ilen"] = (a.iend - a.istart).abs() + 1

    out = {}
    for name, col, asc in (("pwm", "pwm", False), ("proximal", "ilen", True),
                           ("distal", "ilen", False)):
        pick = a.sort_values(col, ascending=asc).groupby("group_id").head(1)
        truth = a.sort_values("usage", ascending=False).groupby("group_id").head(1)
        merged = pick[["group_id"]].assign(pick_idx=pick.index).merge(
            truth[["group_id"]].assign(true_idx=truth.index), on="group_id")
        acc = float((merged.pick_idx == merged.true_idx).mean())
        out[name] = {"preferred_top1_acc": acc, "n_groups": int(merged.shape[0])}
        print(name, json.dumps(out[name]), flush=True)

    # softmax over PWM scores as a usage predictor
    ex = np.exp(a.pwm - a.groupby("group_id").pwm.transform("max"))
    a["pwm_usage"] = ex / a.groupby("group_id")[["pwm"]].transform(
        lambda s: np.exp(s - s.max()).sum()).iloc[:, 0]
    ok = np.isfinite(a.pwm_usage) & np.isfinite(a.usage)
    out["pwm"]["usage_pearson"] = float(pearsonr(a.pwm_usage[ok], a.usage[ok])[0])
    out["pwm"]["usage_mae"] = float(np.abs(a.pwm_usage[ok] - a.usage[ok]).mean())

    sizes = a.groupby("group_id").size()
    out["random"] = {"preferred_top1_acc": float((1.0 / sizes).mean()),
                     "n_groups": int(len(sizes))}
    print("random", json.dumps(out["random"]), flush=True)
    print("pwm usage r", out["pwm"]["usage_pearson"], flush=True)
    with open(os.path.join(paths().results, "baseline_altss_metrics.json"), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
