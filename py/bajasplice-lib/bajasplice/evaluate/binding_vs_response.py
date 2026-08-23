#!/usr/bin/env python
"""Does predicted binding of RBP k near an exon predict that the exon responds
to knocking down RBP k?

No training involved: the binding score is used directly as a classifier of the
knockdown response, RBP by RBP.

The control that decides this is matched-vs-mismatched. Some regions are bound
by everything, and some exons respond to everything, so a raw AUC above 0.5
proves nothing. Scoring RBP k's response with a DIFFERENT RBP's binding track
holds all of that constant and isolates whether the identity of the RBP carries
information.
"""
import numpy as np, pandas as pd, os, json, sys
from sklearn.metrics import roc_auc_score
from scipy.stats import wilcoxon
from bajasplice.datasets import build_rbp_matrix

from bajasplice.config import paths
N_MISMATCH = 25
MIN_POS = 20


def auc_or_nan(y, s):
    if y.sum() < MIN_POS or y.sum() == len(y):
        return np.nan
    if np.allclose(s, s[0]):
        return np.nan
    return roc_auc_score(y, s)


def main():
    ev, H, M, S, rbps = build_rbp_matrix()
    meta = json.load(open(os.path.join(paths().interim, "rbp_binding_meta.json")))
    regions, proteins = meta["regions"], meta["proteins"]
    BMAX = np.load(os.path.join(paths().interim, "rbp_binding_max.npy"))

    rpos = {r: i for i, r in enumerate(rbps)}
    ppos = {p: i for i, p in enumerate(proteins)}
    shared = [r for r in proteins if r in rpos]
    print(f"{len(shared)} RBPs with both a binding model and a knockdown", flush=True)

    rng = np.random.default_rng(0)
    splits = {"all": np.ones(len(ev), bool), "test": (ev.split == "test").to_numpy()}
    out = {}

    for sname, smask in splits.items():
        Hs, Ms = H[smask], M[smask]
        Bs = BMAX[smask]
        rows = []
        for p in shared:
            k, pi = rpos[p], ppos[p]
            m = Ms[:, k]
            if m.sum() < 200:
                continue
            y = Hs[m, k]
            if y.sum() < MIN_POS:
                continue
            # matched: this RBP's own binding, best region per exon
            a_match = auc_or_nan(y, Bs[m, :, pi].max(1))
            # per-region, matched
            per_reg = [auc_or_nan(y, Bs[m, ri, pi]) for ri in range(len(regions))]
            # mismatched: other RBPs' binding tracks, same labels
            others = [q for q in proteins if q != p]
            pick = rng.choice(len(others), min(N_MISMATCH, len(others)), replace=False)
            a_mis = [auc_or_nan(y, Bs[m, :, ppos[others[i]]].max(1)) for i in pick]
            rows.append({"rbp": p, "n_pos": int(y.sum()), "n_tested": int(m.sum()),
                         "auc_matched": a_match,
                         "auc_mismatched_mean": float(np.nanmean(a_mis)),
                         "auc_mismatched_max": float(np.nanmax(a_mis)),
                         **{f"auc_{r}": v for r, v in zip(regions, per_reg)}})
        df = pd.DataFrame(rows).dropna(subset=["auc_matched", "auc_mismatched_mean"])
        d = df.auc_matched - df.auc_mismatched_mean
        p_w = float(wilcoxon(df.auc_matched, df.auc_mismatched_mean,
                             alternative="greater").pvalue) if len(df) > 20 else float("nan")
        out[sname] = {
            "n_rbps": int(len(df)),
            "mean_auc_matched": float(df.auc_matched.mean()),
            "mean_auc_mismatched": float(df.auc_mismatched_mean.mean()),
            "median_delta": float(d.median()),
            "n_matched_beats_mismatched": int((d > 0).sum()),
            "wilcoxon_p": p_w,
            "mean_auc_by_region": {r: float(df[f"auc_{r}"].mean(skipna=True)) for r in regions},
        }
        df.to_csv(os.path.join(paths().interim, f"rbp_binding_vs_response_{sname}.tsv"), sep="\t", index=False)
        print(f"\n=== {sname} exons ({len(df)} RBPs) ===", flush=True)
        print(f"  matched binding AUC     {out[sname]['mean_auc_matched']:.4f}", flush=True)
        print(f"  mismatched binding AUC  {out[sname]['mean_auc_mismatched']:.4f}", flush=True)
        print(f"  matched > mismatched in {out[sname]['n_matched_beats_mismatched']}/{len(df)} RBPs"
              f"  (Wilcoxon p={p_w:.3g})", flush=True)
        print("  by region:", {r: round(v, 4) for r, v in out[sname]["mean_auc_by_region"].items()}, flush=True)
        if sname == "all":
            top = df.sort_values("auc_matched", ascending=False).head(15)
            print("\n  top 15 RBPs where binding predicts knockdown response:")
            print(top[["rbp", "n_pos", "auc_matched", "auc_mismatched_mean"]].to_string(index=False), flush=True)

    with open(os.path.join(paths().results, "rbp_binding_vs_response.json"), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
