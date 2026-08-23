#!/usr/bin/env python
"""Independent check of the GTEx-derived PSI labels against VastDB.

VastDB quantifies the same cassette exons in a different sample panel with a
different method (vast-tools), so agreement is evidence the labels are real
rather than an artefact of how junctions were counted here. Matching is on the
alternative exon's hg38 coordinates.
"""
import numpy as np, pandas as pd, os, gzip, json, sys

from bajasplice.config import paths
RAW = str(paths().raw / "vastdb")
CASSETTE_TYPES = {"S", "A_S", "C1", "C2", "C3"}


def parse_coord(c):
    """'chr12:120210930-120211106' -> (chrom, start, end)"""
    try:
        chrom, rng = c.split(":")
        a, b = rng.split("-")
        return chrom, int(a), int(b)
    except Exception:
        return None, -1, -1


def main():
    info = pd.read_csv(os.path.join(RAW, "EVENT_INFO-hg38.tab.gz"), sep="\t",
                       usecols=["GENE", "EVENT", "COMPLEX", "CO_A"], low_memory=False)
    info = info[info.COMPLEX.isin(CASSETTE_TYPES)].dropna(subset=["CO_A"])
    parsed = info.CO_A.map(parse_coord)
    info["chrom"] = [p[0] for p in parsed]
    info["a_start"] = [p[1] for p in parsed]
    info["a_end"] = [p[2] for p in parsed]
    info = info[info.a_start > 0]
    print(f"VastDB cassette-type events with coordinates: {len(info):,}", flush=True)

    psi = pd.read_csv(os.path.join(RAW, "PSI_TABLE-hg38.tab.gz"), sep="\t", low_memory=False)
    meta = ["GENE", "EVENT", "COORD", "LENGTH", "FullCO", "COMPLEX"]
    samples = [c for c in psi.columns if c not in meta]
    vals = psi[samples].apply(pd.to_numeric, errors="coerce")
    scale = 100.0 if np.nanmax(vals.to_numpy()) > 1.5 else 1.0
    psi_mean = vals.mean(axis=1, skipna=True) / scale
    n_obs = vals.notna().sum(axis=1)
    vp = pd.DataFrame({"EVENT": psi.EVENT, "vast_psi": psi_mean, "vast_n": n_obs})
    print(f"VastDB PSI table: {len(psi):,} events x {len(samples)} samples "
          f"(scale detected: 0-{int(scale)})", flush=True)

    v = info.merge(vp, on="EVENT", how="inner")
    v = v[v.vast_n >= 20]

    ev = pd.read_csv(os.path.join(paths().interim, "cassette.tsv"), sep="\t")
    from bajasplice.genome import split_of
    ev["split"] = ev.chrom.map(split_of)
    # one row per alternative exon: the same exon appears in several triples
    # with different flanking exons, and merging without collapsing would
    # count it many times over.
    ev = (ev.sort_values("reads_total", ascending=False)
            .groupby(["chrom", "a_start", "a_end"], as_index=False).head(1))
    v = v.groupby(["chrom", "a_start", "a_end"], as_index=False).agg(
        EVENT=("EVENT", "first"), COMPLEX=("COMPLEX", "first"),
        vast_psi=("vast_psi", "mean"))
    m = ev.merge(v, on=["chrom", "a_start", "a_end"], how="inner",
                 suffixes=("", "_vast"))
    m = m[np.isfinite(m.psi_mean) & np.isfinite(m.vast_psi)]
    print(f"matched on exon coordinates: {len(m):,} events", flush=True)

    from scipy.stats import pearsonr, spearmanr
    out = {"n_matched": int(len(m))}
    if len(m) > 100:
        out["pearson"] = float(pearsonr(m.psi_mean, m.vast_psi)[0])
        out["spearman"] = float(spearmanr(m.psi_mean, m.vast_psi)[0])
        out["mae"] = float(np.abs(m.psi_mean - m.vast_psi).mean())
        alt = m[m.skip_total >= 10]
        if len(alt) > 100:
            out["n_alt"] = int(len(alt))
            out["alt_pearson"] = float(pearsonr(alt.psi_mean, alt.vast_psi)[0])
            out["alt_spearman"] = float(spearmanr(alt.psi_mean, alt.vast_psi)[0])
            out["alt_mae"] = float(np.abs(alt.psi_mean - alt.vast_psi).mean())
    print(json.dumps(out, indent=2), flush=True)
    m[["chrom", "a_start", "a_end", "gene_name", "EVENT", "COMPLEX",
       "psi_mean", "vast_psi", "skip_total", "split"]].to_csv(
        os.path.join(paths().interim, "gtex_vs_vastdb.tsv"), sep="\t", index=False)
    with open(os.path.join(paths().results, "vastdb_validation.json"), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
