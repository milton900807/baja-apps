#!/usr/bin/env python
"""Non-neural controls for cassette-exon PSI.

Three nested feature sets, same chromosome splits and metrics as the CNN:
  geom  - exon/intron lengths, frame, GC only  (the length-artifact control)
  ss    - PWM strength of the four splice sites only
  both  - geom + ss
If the CNN cannot beat `both`, it is not learning regulatory sequence.
"""
import numpy as np, pandas as pd, os, json, sys, pickle
from bajasplice.genome import GenomeReader, split_of
from bajasplice.datasets import load_events, site_positions
from bajasplice.evaluate.baselines_splicesite import collect_motifs, fit_pwm, score_track, DONOR_OFF, ACC_OFF
from bajasplice.train.psi import metrics
from sklearn.ensemble import HistGradientBoostingRegressor

from bajasplice.config import paths
def build_features(ev, g, pwms):
    n = len(ev)
    feats = np.zeros((n, 10), dtype=np.float32)
    gcf = lambda c: float(((c == 2) | (c == 3)).sum() / max((c > 0).sum(), 1))
    for i, r in enumerate(ev.itertuples(index=False)):
        ex = g.codes(r.chrom, int(r.a_start), int(r.a_end), r.strand)
        intr = g.codes(r.chrom, int(r.c1_end) + 1, int(r.c1_end) + 200, r.strand)
        feats[i, 0] = np.log10(max(r.exon_len, 1))
        feats[i, 1] = np.log10(max(r.intron_up_len, 1))
        feats[i, 2] = np.log10(max(r.intron_dn_len, 1))
        feats[i, 3] = 1.0 if r.exon_len % 3 == 0 else 0.0
        feats[i, 4] = gcf(ex)
        feats[i, 5] = gcf(intr)
        # four splice-site PWM scores, transcript order: D, A, D, A
        for k, p in enumerate(site_positions(r)):
            kind = "donor" if k in (0, 2) else "acceptor"
            lo, hi = DONOR_OFF if kind == "donor" else ACC_OFF
            pad = 40
            codes = g.codes(r.chrom, int(p) - pad, int(p) + pad, r.strand)
            sc = score_track(codes, pwms[kind], lo)
            feats[i, 6 + k] = sc[pad]
        if i % 20000 == 0:
            print(f"  features {i}/{n}", flush=True)
    return feats


FEATSETS = {"geom": list(range(6)), "ss": [6, 7, 8, 9], "both": list(range(10))}


def main():
    ev, psi = load_events()
    g = GenomeReader()
    with open(os.path.join(paths().processed, "splicesite_index.pkl"), "rb") as f:
        idx = pickle.load(f)
    G = idx["genes"].copy(); G["split"] = G.chrom.map(split_of)
    pwms = {k: fit_pwm(collect_motifs(idx["sites"], G, "train", g, k, n_max=50000))
            for k in ("donor", "acceptor")}
    print("PWMs fitted", flush=True)

    cache = os.path.join(paths().processed, "psi_baseline_features.npy")
    if os.path.exists(cache):
        X = np.load(cache)
        assert len(X) == len(ev), "cached features stale; delete and rerun"
    else:
        X = build_features(ev, g, pwms)
        np.save(cache, X)
    y = np.nanmean(np.where(np.isfinite(psi), psi, np.nan), axis=1)
    mask = np.isfinite(psi)
    ok = np.isfinite(y)
    tr = ((ev.split == "train").to_numpy()) & ok
    te = ((ev.split == "test").to_numpy()) & ok
    alt_te = (ev.skip_total >= 10).to_numpy()[te]

    results = {}
    for name, cols in FEATSETS.items():
        m = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06,
                                          max_depth=None, random_state=0)
        m.fit(X[tr][:, cols], y[tr])
        pred = m.predict(X[te][:, cols]).clip(0, 1)
        pt = np.repeat(pred[:, None], psi.shape[1], axis=1)
        results[name] = metrics(pred, y[te], pt, psi[te], mask[te], alt=alt_te)
        print(name, json.dumps(results[name]), flush=True)

    # trivial control: always predict the training mean
    const = np.full(te.sum(), y[tr].mean())
    results["constant"] = metrics(const, y[te],
                                  np.repeat(const[:, None], psi.shape[1], axis=1),
                                  psi[te], mask[te], alt=alt_te)
    print("constant", json.dumps(results["constant"]), flush=True)

    with open(os.path.join(paths().results, "baseline_psi_metrics.json"), "w") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
