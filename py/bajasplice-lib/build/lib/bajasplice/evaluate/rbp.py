#!/usr/bin/env python
"""Honest evaluation of the RBP-response model.

Fixes a leak in the first pass: the exon's marginal responsiveness was computed
from the full truth matrix, including the RBP being scored. Here the control is
from bajasplice.config import paths
leave-one-RBP-out, so it cannot see the column it is being compared on.

Reports, on held-out chromosomes:
  model                per-RBP AUC from sequence
  LOO marginal         exon responsiveness excluding the scored RBP
  geometry only        exon/intron length, GC, frame
  and the same restricted to the RBPs with the strongest knockdown effects,
  where sequence signal should be easiest to find if it exists at all.
"""
import numpy as np, os, json, sys, torch
from torch.utils.data import DataLoader
from sklearn.metrics import roc_auc_score
from sklearn.linear_model import LogisticRegression
from scipy.stats import wilcoxon
from bajasplice.datasets import build_rbp_matrix, RBPResponseDataset
from bajasplice.models import PSINet
from bajasplice.train.rbp import predict, MIN_POS_EVAL

def per_rbp_auc_scores(score, y, mask, keep=None):
    aucs, idx = [], []
    for k in range(y.shape[1]):
        if keep is not None and k not in keep:
            continue
        m = mask[:, k]
        if m.sum() < 50:
            continue
        yy = y[m, k]
        if yy.sum() < MIN_POS_EVAL or yy.sum() == m.sum():
            continue
        aucs.append(roc_auc_score(yy, score[m, k])); idx.append(k)
    return np.array(aucs), np.array(idx)


def loo_marginal(H, M):
    """Exon responsiveness excluding each RBP in turn: (n_events, n_rbp)."""
    hits = (H * M).sum(1, keepdims=True)
    tested = M.sum(1, keepdims=True)
    return (hits - H * M) / np.maximum(tested - M, 1)


def compare(name, score, Y, Mk, base, keep=None):
    a, idx = per_rbp_auc_scores(score, Y, Mk, keep)
    b, idxb = per_rbp_auc_scores(base, Y, Mk, keep)
    common = np.intersect1d(idx, idxb)
    da = {k: v for k, v in zip(idx, a)}; db = {k: v for k, v in zip(idxb, b)}
    pa = np.array([da[k] for k in common]); pb = np.array([db[k] for k in common])
    p = float(wilcoxon(pa, pb, alternative="greater").pvalue) if len(common) > 20 else float("nan")
    return {"model": name, "mean_auc": float(pa.mean()), "control_mean_auc": float(pb.mean()),
            "n_rbps": int(len(common)), "n_beating_control": int((pa > pb).sum()),
            "wilcoxon_p": p}


def main():
    ev, H, M, S, rbps = build_rbp_matrix()
    te = (ev.split == "test").to_numpy()
    tr = (ev.split == "train").to_numpy()
    ds = RBPResponseDataset(ev[te], H[te], M[te])
    loader = DataLoader(ds, batch_size=32, shuffle=False, num_workers=6)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(os.path.join(paths().models, "rbp.pt"), map_location="cpu", weights_only=False)
    model = PSINet(n_tissues=len(rbps), context=2000, win=400).to(device)
    model.load_state_dict(ck["model"])
    P, Y, Mk, Mg = predict(model, loader, device)
    print(f"test exons {len(Y):,}  RBPs {Y.shape[1]}  tested pairs {int(Mk.sum()):,}", flush=True)

    LOO = loo_marginal(H, M)[te]

    # geometry-only control, fit on train and applied per RBP
    def geom_feats(sub):
        e = ev[sub]
        return np.c_[np.log10(e.exon_len.clip(lower=1)), np.log10(e.intron_up_len.clip(lower=1)),
                     np.log10(e.intron_dn_len.clip(lower=1)), (e.exon_len % 3 == 0).astype(float)]
    Xtr, Xte = geom_feats(tr), geom_feats(te)
    G = np.zeros_like(P)
    Htr, Mtr = H[tr], M[tr]
    for k in range(Y.shape[1]):
        m = Mtr[:, k]
        if m.sum() < 100 or Htr[m, k].sum() < 10:
            continue
        try:
            lr = LogisticRegression(max_iter=200).fit(Xtr[m], Htr[m, k])
            G[:, k] = lr.predict_proba(Xte)[:, 1]
        except Exception:
            pass

    hits_per_rbp = (H[tr] * M[tr]).sum(0)
    top = set(np.argsort(-hits_per_rbp)[:50].tolist())

    results = {
        "all_rbps": [compare("sequence CNN", P, Y, Mk, LOO),
                     compare("geometry only", G, Y, Mk, LOO)],
        "top50_rbps": [compare("sequence CNN", P, Y, Mk, LOO, keep=top),
                       compare("geometry only", G, Y, Mk, LOO, keep=top)],
    }
    # what the leaky control looked like, for the record
    full_marg = np.repeat(ev[te].marginal_rate.to_numpy()[:, None], Y.shape[1], axis=1)
    a_leak, _ = per_rbp_auc_scores(full_marg, Y, Mk)
    a_loo, _ = per_rbp_auc_scores(LOO, Y, Mk)
    results["control_leak_check"] = {"full_marginal_auc": float(a_leak.mean()),
                                     "loo_marginal_auc": float(a_loo.mean())}

    print(json.dumps(results, indent=2), flush=True)
    with open(os.path.join(paths().results, "rbp_eval.json"), "w") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
