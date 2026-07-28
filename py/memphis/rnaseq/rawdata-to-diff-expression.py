#!/usr/bin/env python3
"""
Process a directory of NYGC ALS Consortium count files (*.txt.gz) into a normalized
differential expression analysis.

File format: NYGC 2-col (gene/TE, count).
Filename example: GSM3533232_CGND-HRA-00015_counts.txt.gz

Usage:
  python nygc_de_dir.py --indir counts_dir --out als_vs_ctrl \
    --condmap cond_map.tsv --minsum 10 --prefer-r

where cond_map.tsv is a two-column TSV: sample_pattern <tab> condition
  Example:
    CGND-HRA-00015    ALS
    CGND-HRA-00016    ALS
    CGND-HRA-00020    Control
"""

import argparse, os, re, gzip
import pandas as pd
import numpy as np
from pathlib import Path

# --- reuse core functions from earlier ---
from scipy import stats

def read_nygc_two_col(path: str) -> pd.DataFrame:
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as f:
        df = pd.read_csv(f, sep="\t", quotechar='"', engine="python")
    if df.shape[1] != 2:
        raise ValueError(f"Unexpected number of columns in {path}")
    df.columns = ["feature", "count"]
    df["feature"] = df["feature"].astype(str).str.replace(r'^"|"$', "", regex=True)
    df["count"] = pd.to_numeric(df["count"], errors="coerce")
    if df["count"].isna().any():
        raise ValueError(f"Non-numeric counts detected in {path}")
    return df

def merge_counts(files: dict) -> pd.DataFrame:
    # files = {sample: filepath}
    merged = None
    for sample, f in files.items():
        df = read_nygc_two_col(f)
        df = df.rename(columns={"count": sample})
        if merged is None:
            merged = df
        else:
            merged = merged.merge(df, on="feature", how="outer")
    merged = merged.fillna(0)
    for c in merged.columns[1:]:
        merged[c] = merged[c].astype(int)
    return merged

def filter_low_counts(counts: pd.DataFrame, minsum: int) -> pd.DataFrame:
    numeric = counts.iloc[:, 1:]
    mask = numeric.sum(axis=1) >= minsum
    return counts.loc[mask].reset_index(drop=True)

def cpm(count_mat: pd.DataFrame) -> pd.DataFrame:
    lib_sizes = count_mat.sum(axis=0)
    return count_mat.divide(lib_sizes, axis=1) * 1e6

def bh_fdr(pvals: np.ndarray) -> np.ndarray:
    p = np.asarray(pvals, dtype=float)
    n = p.size
    order = np.argsort(p)
    ranked = np.empty(n, dtype=float)
    cummin = 1.0
    for i in range(n-1, -1, -1):
        rank = i + 1
        val = p[order[i]] * n / rank
        cummin = min(cummin, val)
        ranked[order[i]] = min(cummin, 1.0)
    return ranked

def welch_de(log2_expr: pd.DataFrame, groups: pd.Series) -> pd.DataFrame:
    levels = sorted(groups.unique())
    g1, g2 = levels
    idx1 = groups[groups == g1].index
    idx2 = groups[groups == g2].index

    m1 = log2_expr[idx1].mean(axis=1)
    m2 = log2_expr[idx2].mean(axis=1)
    lfc = m2 - m1

    stats_list, pvals = [], []
    for i in range(log2_expr.shape[0]):
        t = stats.ttest_ind(
            log2_expr.iloc[i, log2_expr.columns.get_indexer(idx1)],
            log2_expr.iloc[i, log2_expr.columns.get_indexer(idx2)],
            equal_var=False, nan_policy="omit"
        )
        stats_list.append(np.nan_to_num(t.statistic, nan=0.0))
        pvals.append(np.nan_to_num(t.pvalue, nan=1.0))

    res = pd.DataFrame({
        "feature": log2_expr.index,
        "log2FoldChange": lfc.values,
        "stat": stats_list,
        "pvalue": pvals,
    })
    res["padj"] = bh_fdr(res["pvalue"].values)
    return res

# --- main ---
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--indir", required=True, help="Directory with *_counts.txt.gz files")
    ap.add_argument("--out", default="de_results", help="Output prefix")
    ap.add_argument("--condmap", required=True,
                   help="TSV with sample_pattern <tab> condition mapping")
    ap.add_argument("--minsum", type=int, default=10)
    args = ap.parse_args()

    indir = Path(args.indir)
    files = sorted(indir.glob("*_counts.txt.gz"))
    if not files:
        raise SystemExit(f"No *_counts.txt.gz files found in {indir}")

    # load mapping
    cmap = pd.read_csv(args.condmap, sep="\t", header=None, names=["pattern","condition"])
    cmap_dict = dict(zip(cmap.pattern, cmap.condition))

    sample_files = {}
    conditions = {}
    for f in files:
        sname = f.name.replace("_counts.txt.gz","")
        cond = None
        for pat, c in cmap_dict.items():
            if pat in sname:
                cond = c
                break
        if cond is None:
            raise ValueError(f"No condition mapping found for {sname}")
        sample_files[sname] = str(f)
        conditions[sname] = cond

    merged = merge_counts(sample_files)
    merged_filt = filter_low_counts(merged, args.minsum)

    count_mat = merged_filt.set_index("feature")
    groups = pd.Series(conditions)

    # normalize by CPM
    cpm_mat = cpm(count_mat)
    log2_cpm = np.log2(cpm_mat + 0.5)

    res = welch_de(log2_cpm, groups)

    # baseMean
    res = res.merge(cpm_mat.mean(axis=1).rename("baseMean"),
                    left_on="feature", right_index=True)

    # rank sort
    res_ranked = res.sort_values(
        by=["padj","log2FoldChange"],
        ascending=[True, False],
        key=lambda s: np.where(s.name=="log2FoldChange", np.abs(s), s)
    )

    res_ranked.to_csv(f"{args.out}.welch_results.tsv", sep="\t", index=False)

    # GSEA .rnk
    res[["feature","stat"]].fillna(0).sort_values("stat", ascending=False) \
       .to_csv(f"{args.out}.gsea.rnk", sep="\t", index=False, header=False)

    # normalized counts
    cpm_mat.reset_index().rename(columns={"index":"feature"}) \
        .to_csv(f"{args.out}.normalized_counts.tsv", sep="\t", index=False)

    with open(f"{args.out}.summary.txt","w") as f:
        f.write(f"indir: {indir}\n")
        f.write(f"n_samples: {len(sample_files)}\n")
        f.write(f"conditions: {groups.unique().tolist()}\n")
        f.write(f"minsum_filter: {args.minsum}\n")
        f.write(f"method: Welch log2-CPM\n")

if __name__ == "__main__":
    main()
