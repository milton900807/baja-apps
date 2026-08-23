#!/usr/bin/env python
"""Matched-vs-mismatched control on the eCLIP held-out data itself.

The published per-RBP AUROC asks: can the model separate windows bound by RBP k
from BACKGROUND windows? A model that only learns "is this region bound by
from bajasplice.config import paths
anything" scores well on that for every RBP, without distinguishing one RBP
from another.

Two things are measured here:

  A. same design, mismatched head
     score RBP k's positives-vs-background using RBP j's output channel.
     If that also scores high, the AUROC is not evidence of RBP specificity.

  B. positives-only design
     RBP k's bound windows vs windows bound by OTHER RBPs (not k). Every
     window is a real binding site, so the shared bindability axis is held
     constant and only RBP identity can help.
"""
import numpy as np, pandas as pd, torch, os, sys, json
from sklearn.metrics import roc_auc_score
from scipy.stats import wilcoxon

from bajasplice.bajaclip import load as _bc_load, encode as encode_seq, sphere_features
from bajasplice import bajaclip

N_MISMATCH = 25
MIN_POS = 5


def score_dataset(model_path, df, device):
    model, proteins, max_len, mtype, motifs = _bc_load(model_path, device)
    model.eval()
    seqs = df.sequence.astype(str).tolist()
    X = np.stack([encode_seq(s, max_len) for s in seqs])
    S = np.stack([sphere_features(s, motifs) for s in seqs])
    out = np.empty((len(seqs), len(proteins)), dtype=np.float32)
    with torch.no_grad():
        for i in range(0, len(seqs), 4096):
            xb = torch.tensor(X[i:i+4096], dtype=torch.long, device=device)
            sb = torch.tensor(S[i:i+4096], dtype=torch.float32, device=device)
            logits = model(xb, sb) if mtype.startswith("sphere") else model(xb)
            out[i:i+4096] = torch.sigmoid(logits).float().cpu().numpy()
    return out, proteins


def label_matrix(df, proteins):
    ppos = {p: i for i, p in enumerate(proteins)}
    Y = np.zeros((len(df), len(proteins)), dtype=np.int8)
    for i, s in enumerate(df.positive_rbps.fillna("").astype(str)):
        for p in s.replace(";", ",").split(","):
            p = p.strip()
            if p in ppos:
                Y[i, ppos[p]] = 1
    return Y


def run(model_path, label, device):
    df = pd.read_csv(str(paths().require("eclip_dataset")), sep="\t")
    df = df[df.split == "test"].reset_index(drop=True)
    P, proteins = score_dataset(model_path, df, device)
    Y = label_matrix(df, proteins)
    bg = (df.is_background_negative == 1).to_numpy()
    print(f"\n=== {label} ===", flush=True)
    print(f"test windows {len(df):,}  ({bg.sum():,} background, {(~bg).sum():,} bound)  "
          f"{len(proteins)} RBP channels", flush=True)

    rng = np.random.default_rng(0)
    rowsA, rowsB = [], []
    for k, p in enumerate(proteins):
        pos = Y[:, k] == 1
        if pos.sum() < MIN_POS:
            continue
        # --- A: published design, positives vs background
        useA = pos | bg
        yA = pos[useA].astype(int)
        if yA.sum() < MIN_POS or yA.sum() == len(yA):
            continue
        aA = roc_auc_score(yA, P[useA, k])
        othersA = [j for j in range(len(proteins)) if j != k]
        misA = [roc_auc_score(yA, P[useA, j])
                for j in rng.choice(othersA, min(N_MISMATCH, len(othersA)), replace=False)]
        rowsA.append((p, int(pos.sum()), aA, float(np.mean(misA)), float(np.max(misA))))

        # --- B: positives only, k vs other RBPs' binding sites
        other_pos = (~bg) & (Y[:, k] == 0) & (Y.sum(1) > 0)
        useB = pos | other_pos
        yB = pos[useB].astype(int)
        if yB.sum() < MIN_POS or yB.sum() == len(yB) or (yB == 0).sum() < MIN_POS:
            continue
        aB = roc_auc_score(yB, P[useB, k])
        misB = [roc_auc_score(yB, P[useB, j])
                for j in rng.choice(othersA, min(N_MISMATCH, len(othersA)), replace=False)]
        rowsB.append((p, int(pos.sum()), aB, float(np.mean(misB))))

    A = pd.DataFrame(rowsA, columns=["rbp", "n_pos", "auc_matched", "auc_mismatched", "auc_mismatched_max"])
    B = pd.DataFrame(rowsB, columns=["rbp", "n_pos", "auc_matched", "auc_mismatched"])

    dA = A.auc_matched - A.auc_mismatched
    pA = float(wilcoxon(A.auc_matched, A.auc_mismatched, alternative="greater").pvalue) if len(A) > 20 else float("nan")
    print(f"\n  A. positives vs BACKGROUND  (the published design, n={len(A)} RBPs)")
    print(f"     matched head      AUROC {A.auc_matched.mean():.4f}")
    print(f"     MISmatched head   AUROC {A.auc_mismatched.mean():.4f}")
    print(f"     difference        {dA.mean():+.4f}   matched wins {int((dA>0).sum())}/{len(A)}   p={pA:.3g}")

    dB = B.auc_matched - B.auc_mismatched
    pB = float(wilcoxon(B.auc_matched, B.auc_mismatched, alternative="greater").pvalue) if len(B) > 20 else float("nan")
    print(f"\n  B. positives vs OTHER RBPs' sites  (bindability held constant, n={len(B)} RBPs)")
    print(f"     matched head      AUROC {B.auc_matched.mean():.4f}")
    print(f"     MISmatched head   AUROC {B.auc_mismatched.mean():.4f}")
    print(f"     difference        {dB.mean():+.4f}   matched wins {int((dB>0).sum())}/{len(B)}   p={pB:.3g}")

    A.to_csv(os.path.join(paths().results, f"eclip_matched_A_{label}.tsv"), sep="\t", index=False)
    B.to_csv(os.path.join(paths().results, f"eclip_matched_B_{label}.tsv"), sep="\t", index=False)
    return {"label": label, "n_test_windows": int(len(df)),
            "A_design": "positives vs background (published)",
            "A_n_rbps": int(len(A)), "A_matched": float(A.auc_matched.mean()),
            "A_mismatched": float(A.auc_mismatched.mean()),
            "A_delta": float(dA.mean()), "A_wins": int((dA > 0).sum()), "A_p": pA,
            "B_design": "positives vs other RBPs' positives",
            "B_n_rbps": int(len(B)), "B_matched": float(B.auc_matched.mean()),
            "B_mismatched": float(B.auc_mismatched.mean()),
            "B_delta": float(dB.mean()), "B_wins": int((dB > 0).sum()), "B_p": pB}


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    out = []
    out.append(run("lowfdr",
                   "lowfdr", device))
    out.append(run("enhanced_final",
                   "enhanced_final", device))
    with open(os.path.join(paths().results, "eclip_matched_vs_mismatched.json"), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
