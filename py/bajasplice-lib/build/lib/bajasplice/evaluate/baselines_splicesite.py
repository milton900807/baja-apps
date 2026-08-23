#!/usr/bin/env python
"""Position-weight-matrix baseline for splice-site detection.

Fits donor (-3..+6) and acceptor (-20..+3) PWMs on training chromosomes and
scores every position of the held-out test windows, using exactly the same
windows and metrics as the CNN so the two are directly comparable. This is the
control that says how much of the CNN's performance is just the core motif.
"""
import numpy as np, pickle, os, json, sys
from bajasplice.genome import GenomeReader, split_of
from bajasplice.evaluate.metrics import topk_accuracy, pr_auc

from bajasplice.config import paths
DONOR_OFF = (-3, 6)      # relative to first intronic base
ACC_OFF = (-20, 3)       # relative to last intronic base


def collect_motifs(sites, genes, split, g, kind, n_max=200000):
    """Integer-coded motif matrix for donors or acceptors on one split."""
    lo, hi = DONOR_OFF if kind == "donor" else ACC_OFF
    m = hi - lo + 1
    rows = []
    for r in genes[genes.split == split].itertuples(index=False):
        d, a = sites.get(r.transcript_id, (None, None))
        if d is None:
            continue
        pos = d if kind == "donor" else a
        for p in pos:
            if r.strand == "+":
                s, e = p + lo, p + hi
            else:
                s, e = p - hi, p - lo
            c = g.codes(r.chrom, s, e, r.strand)
            if len(c) == m and (c > 0).all():
                rows.append(c)
        if len(rows) >= n_max:
            break
    return np.array(rows, dtype=np.int8)


def fit_pwm(motifs, pseudo=1.0):
    m = motifs.shape[1]
    counts = np.full((m, 4), pseudo, dtype=np.float64)
    for j in range(m):
        for b in range(1, 5):
            counts[j, b - 1] += (motifs[:, j] == b).sum()
    freq = counts / counts.sum(1, keepdims=True)
    bg = counts.sum(0) / counts.sum()
    return np.log(freq / bg[None, :]).astype(np.float32)     # (m, 4) log-odds


def score_track(codes, pwm, lo):
    """Log-odds at every position i, where the motif spans codes[i+lo : i+lo+m].
    Positions whose motif runs off the array or hits an N score -50."""
    m = pwm.shape[0]
    L = len(codes)
    idx = np.arange(L)[:, None] + np.arange(m)[None, :] + lo      # (L, m)
    inb = (idx >= 0) & (idx < L)
    c = codes[np.clip(idx, 0, L - 1)]                             # (L, m)
    good = inb & (c > 0)
    contrib = pwm[np.arange(m)[None, :], np.clip(c - 1, 0, 3)]
    sc = np.where(good, contrib, 0.0).sum(1).astype(np.float32)
    sc[~good.all(1)] = -50.0
    return sc


def main():
    with open(os.path.join(paths().processed, "splicesite_index.pkl"), "rb") as f:
        idx = pickle.load(f)
    W, S, G = idx["windows"], idx["sites"], idx["genes"]
    G = G.copy(); G["split"] = G.chrom.map(split_of)
    g = GenomeReader()

    pwms = {}
    for kind in ("donor", "acceptor"):
        mot = collect_motifs(S, G, "train", g, kind)
        pwms[kind] = fit_pwm(mot)
        cons = "".join("ACGT"[i] for i in pwms[kind].argmax(1))
        print(f"{kind}: {len(mot):,} training motifs, consensus {cons}", flush=True)

    target_len = int(W.win_end.iloc[0] - W.win_start.iloc[0] + 1)
    test = W[W.split == "test"].reset_index(drop=True)
    print(f"scoring {len(test):,} test windows x {target_len} nt", flush=True)

    n = len(test) * target_len
    sc_d = np.empty(n, dtype=np.float16); sc_a = np.empty(n, dtype=np.float16)
    lab = np.empty(n, dtype=np.int8)
    lo_d, lo_a = DONOR_OFF[0], ACC_OFF[0]

    for i, r in enumerate(test.itertuples(index=False)):
        pad = 30
        codes = g.codes(r.chrom, r.win_start - pad, r.win_end + pad, r.strand)
        d = score_track(codes, pwms["donor"], lo_d)[pad:pad + target_len]
        a = score_track(codes, pwms["acceptor"], lo_a)[pad:pad + target_len]
        y = np.zeros(target_len, dtype=np.int8)
        dn, ac = S[r.transcript_id]
        for arr, l in ((ac, 1), (dn, 2)):
            m = (arr >= r.win_start) & (arr <= r.win_end)
            if m.any():
                off = arr[m] - r.win_start
                if r.strand == "-":
                    off = target_len - 1 - off
                y[off] = l
        sl = slice(i * target_len, (i + 1) * target_len)
        sc_d[sl] = d; sc_a[sl] = a; lab[sl] = y
        if i % 10000 == 0:
            print(f"  {i}/{len(test)}", flush=True)

    out = {}
    for cls, name, sc in ((1, "acceptor", sc_a), (2, "donor", sc_d)):
        yb = (lab == cls).astype(np.int8)
        s = sc.astype(np.float32)
        out[f"{name}_topk"] = topk_accuracy(yb, s)
        out[f"{name}_prauc"] = pr_auc(yb, s)
        out[f"{name}_n_true"] = int(yb.sum())
    out["n_positions"] = int(n)
    print("PWM BASELINE TEST", json.dumps(out), flush=True)
    with open(os.path.join(paths().results, "baseline_pwm_metrics.json"), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
