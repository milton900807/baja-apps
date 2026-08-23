#!/usr/bin/env python
"""Delta-PSI per RBP knockdown, against its matched ENCODE control.

A cross-batch null (random control vs random control) is useless here: each
knockdown is matched to its own control from the same batch, and ENCODE reuses
one control across ~8.6 knockdowns, so control-control pairs measure batch
effects rather than the noise floor of the actual comparison.

Instead each event is scored against the distribution of its own dPSI across
ALL knockdowns in the same cell line (robust median/MAD z-score). Most RBPs do
not regulate any given exon, so that distribution IS the null, and an exon
responding specifically to one RBP shows up as an outlier.

Validation, not assumed but measured:
  - replicate split: dPSI from replicate 1 alone vs replicate 2 alone
  - positive control: known splicing factors should outrank other RBPs

Outputs (data/interim/):
  encode_dpsi.npy / encode_dpsi_z.npy   (n_events, n_kd) float32
  encode_dpsi_cols.tsv                  knockdown metadata + hit counts
  encode_rbp_summary.tsv                per-RBP ranking
"""
import numpy as np, pandas as pd, os, json

from bajasplice.config import paths
Z_THR = 4.0
DPSI_THR = 0.10
MIN_KD_PER_CELL = 30

# core spliceosome / SR / hnRNP / well-known splicing regulators, used only as an
# independent check that the ranking is biologically sensible
SPLICING_FACTORS = {
    "SF3B1","SF3B4","SF3A3","SF1","U2AF1","U2AF2","SNRNP70","SNRNP200","SNRPA","SNRPB2",
    "PRPF8","PRPF4","PRPF6","PRPF19","AQR","EFTUD2","BUD13","XAB2","CDC40","SDE2",
    "SRSF1","SRSF2","SRSF3","SRSF4","SRSF5","SRSF6","SRSF7","SRSF9","SRSF11","TRA2A","TRA2B",
    "HNRNPA1","HNRNPA2B1","HNRNPC","HNRNPD","HNRNPF","HNRNPH1","HNRNPK","HNRNPL","HNRNPM",
    "HNRNPU","HNRNPUL1","PCBP1","PCBP2","PTBP1","PTBP3","RBFOX2","QKI","ESRP1","ESRP2",
    "MBNL1","MBNL2","CELF1","TIA1","TIAL1","KHSRP","RBM22","RBM15","RBM17","RBM25","RBM39",
    "SUGP2","PPIG","GPKOW","ZRANB2","SRRM2","SRSF10","SMNDC1","PUF60","SF3B2",
}


def experiment_matrix(psi, samples, by_rep=None):
    """Collapse replicates to one PSI column per experiment.
    by_rep=None uses all replicates; by_rep=k uses only biological replicate k."""
    sub = samples if by_rep is None else samples[samples.bio_rep == by_rep]
    g = sub.groupby("experiment", sort=False).col.apply(list)
    accs = list(g.index)
    E = np.full((psi.shape[0], len(accs)), np.nan, dtype=np.float32)
    for i, cols in enumerate(g):
        with np.errstate(invalid="ignore"):
            E[:, i] = np.nanmean(psi[:, cols], axis=1) if len(cols) > 1 else psi[:, cols[0]]
    return E, {a: i for i, a in enumerate(accs)}


def dpsi_from(E, epos, kd):
    D = np.full((E.shape[0], len(kd)), np.nan, dtype=np.float32)
    for i, r in enumerate(kd.itertuples(index=False)):
        if r.experiment in epos and r.controls in epos:
            D[:, i] = E[:, epos[r.experiment]] - E[:, epos[r.controls]]
    return D


def robust_z(D, cell_of):
    """z per event against the spread of dPSI across all knockdowns in that cell line."""
    Z = np.full_like(D, np.nan)
    for cl in pd.unique(cell_of):
        idx = np.flatnonzero(cell_of == cl)
        if len(idx) < MIN_KD_PER_CELL:
            continue
        block = D[:, idx]
        med = np.nanmedian(block, axis=1, keepdims=True)
        mad = np.nanmedian(np.abs(block - med), axis=1, keepdims=True)
        scale = 1.4826 * mad
        scale = np.where(scale < 0.01, np.nan, scale)      # events with no spread are uninformative
        Z[:, idx] = (block - med) / scale
    return Z


def main():
    samples = pd.read_csv(os.path.join(paths().interim, "encode_samples.tsv"), sep="\t")
    samples["col"] = np.arange(len(samples))
    psi = np.load(os.path.join(paths().interim, "encode_psi.npy"))

    meta = samples.groupby("experiment", sort=False).agg(
        target=("target", "first"), cell_line=("cell_line", "first"),
        assay=("assay", "first"), controls=("controls", "first")).reset_index()
    ctrl_set = set(meta[meta.target == "CONTROL"].experiment)
    kd = meta[(meta.target != "CONTROL") & meta.controls.isin(ctrl_set)].reset_index(drop=True)
    print(f"{len(kd)} knockdowns, {kd.target.nunique()} RBPs, "
          f"{len(ctrl_set)} controls (each serving ~{len(kd)/len(ctrl_set):.1f} knockdowns)", flush=True)

    E, epos = experiment_matrix(psi, samples)
    D = dpsi_from(E, epos, kd)
    cell_of = kd.cell_line.to_numpy()
    Z = robust_z(D, cell_of)

    hit = (np.abs(Z) >= Z_THR) & (np.abs(D) >= DPSI_THR)
    kd["n_tested"] = (np.isfinite(Z) & np.isfinite(D)).sum(0)
    kd["n_hits"] = hit.sum(0)
    kd["frac_hits"] = kd.n_hits / kd.n_tested.clip(lower=1)

    # ---- validation 1: replicate split ----------------------------------
    E1, p1 = experiment_matrix(psi, samples, by_rep=1)
    E2, p2 = experiment_matrix(psi, samples, by_rep=2)
    D1, D2 = dpsi_from(E1, p1, kd), dpsi_from(E2, p2, kd)
    m = np.isfinite(D1) & np.isfinite(D2)
    r_all = np.corrcoef(D1[m], D2[m])[0, 1]
    hm = hit & m
    r_hits = np.corrcoef(D1[hm], D2[hm])[0, 1] if hm.sum() > 100 else float("nan")
    sign_agree = float((np.sign(D1[hm]) == np.sign(D2[hm])).mean()) if hm.sum() > 100 else float("nan")
    print(f"\nreplicate split: dPSI r={r_all:.4f} over all tested events, "
          f"r={r_hits:.4f} over called hits, sign agreement {sign_agree:.3f}", flush=True)

    # ---- validation 2: are known splicing factors enriched? -------------
    summ = (kd.groupby("target").agg(n_experiments=("experiment", "size"),
                                     cell_lines=("cell_line", lambda s: ",".join(sorted(set(s)))),
                                     n_hits=("n_hits", "sum"),
                                     frac_hits=("frac_hits", "mean"))
              .sort_values("frac_hits", ascending=False).reset_index())
    summ["is_splicing_factor"] = summ.target.isin(SPLICING_FACTORS)
    summ["rank"] = np.arange(1, len(summ) + 1)
    sf = summ[summ.is_splicing_factor]
    other = summ[~summ.is_splicing_factor]
    from scipy.stats import mannwhitneyu
    u, p = mannwhitneyu(sf.frac_hits, other.frac_hits, alternative="greater")
    top50 = summ.head(50).is_splicing_factor.sum()
    exp50 = 50 * len(sf) / len(summ)
    print(f"splicing factors: {len(sf)} of {len(summ)} RBPs annotated", flush=True)
    print(f"  median frac_hits  splicing {sf.frac_hits.median():.4f} vs other {other.frac_hits.median():.4f}", flush=True)
    print(f"  Mann-Whitney one-sided p = {p:.3g}", flush=True)
    print(f"  in top 50 RBPs: {top50} splicing factors (expected {exp50:.1f} by chance)", flush=True)

    np.save(os.path.join(paths().interim, "encode_dpsi.npy"), D)
    np.save(os.path.join(paths().interim, "encode_dpsi_z.npy"), Z.astype(np.float32))
    kd.to_csv(os.path.join(paths().interim, "encode_dpsi_cols.tsv"), sep="\t", index=False)
    summ.to_csv(os.path.join(paths().interim, "encode_rbp_summary.tsv"), sep="\t", index=False)

    print(f"\ntotal (event, RBP) hits: {int(hit.sum()):,}  "
          f"events with >=1 hit: {int((hit.sum(1) > 0).sum()):,} of {hit.shape[0]:,}", flush=True)
    print("\ntop 20 RBPs by fraction of exons changed")
    print(summ.head(20)[["rank", "target", "cell_lines", "n_hits", "frac_hits",
                         "is_splicing_factor"]].to_string(index=False), flush=True)

    with open(os.path.join(paths().results, "encode_dpsi_qc.json"), "w") as f:
        json.dump({"n_knockdowns": int(len(kd)), "n_rbps": int(kd.target.nunique()),
                   "z_threshold": Z_THR, "dpsi_threshold": DPSI_THR,
                   "replicate_split_r_all": float(r_all),
                   "replicate_split_r_hits": float(r_hits),
                   "replicate_sign_agreement": sign_agree,
                   "splicing_factor_mwu_p": float(p),
                   "splicing_factors_in_top50": int(top50),
                   "splicing_factors_expected_top50": float(exp50),
                   "total_hits": int(hit.sum()),
                   "events_with_hit": int((hit.sum(1) > 0).sum())}, f, indent=2)


if __name__ == "__main__":
    main()
