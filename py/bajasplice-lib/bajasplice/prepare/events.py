#!/usr/bin/env python
"""
Turn GENCODE structures + GTEx junction counts into supervised splicing datasets.

Produces three label sets:

  A. introns.tsv        every annotated intron -> donor/acceptor positions,
                        with GTEx read support. Feeds the splice-site model.
  B. cassette.tsv       cassette-exon events (C1 - A - C2) with per-tissue PSI
                        from GTEx junction reads. Feeds the PSI / "preferred
                        exon" model.
  C. altss.tsv          competing 5' and 3' splice sites sharing a partner,
                        with usage fraction per tissue. "Which site wins?"

Coordinates: 1-based inclusive throughout, matching GTF and GTEx junction IDs
(junction = chr_intronStart_intronEnd).
"""
import numpy as np, pandas as pd, os, sys

from bajasplice.config import paths
MIN_READS = 10          # per-tissue total reads required to call a PSI
MAIN_CHROMS = {f"chr{c}" for c in list(range(1, 23)) + ["X", "Y"]}


def load_exons():
    ex = pd.read_csv(os.path.join(paths().interim, "exons.tsv"), sep="\t",
                     dtype={"chrom": "category", "strand": "category",
                            "gene_id": str, "transcript_id": str, "gene_name": str,
                            "gene_type": "category", "transcript_type": "category",
                            "tsl": "category"},
                     low_memory=False)
    ex = ex[ex.chrom.isin(MAIN_CHROMS)].copy()
    ex["chrom"] = ex.chrom.cat.remove_unused_categories()
    return ex


def transcript_intron_table(ex):
    """Per-transcript ordered exons -> introns and (C1, A, C2) triples."""
    ex = ex.sort_values(["transcript_id", "start"], kind="mergesort").reset_index(drop=True)
    g = ex.transcript_id
    same = g.eq(g.shift(-1))

    # intron between consecutive exons of the same transcript
    intr = pd.DataFrame({
        "chrom": ex.chrom[same].values,
        "strand": ex.strand[same].values,
        "gene_id": ex.gene_id[same].values,
        "transcript_id": ex.transcript_id[same].values,
        "gene_name": ex.gene_name[same].values,
        "transcript_type": ex.transcript_type[same].values,
        "mane": ex.mane[same].values,
        "basic": ex.basic[same].values,
        "istart": ex.end[same].values + 1,                 # first base of intron
        "iend": ex.start.shift(-1)[same].values.astype(np.int64) - 1,  # last base of intron
        "up_exon_start": ex.start[same].values,
        "up_exon_end": ex.end[same].values,
        "dn_exon_start": ex.start.shift(-1)[same].values.astype(np.int64),
        "dn_exon_end": ex.end.shift(-1)[same].values.astype(np.int64),
    })
    intr = intr[intr.iend >= intr.istart]                  # drop zero/negative-length introns
    return ex, intr


def build_triples(ex):
    """(C1, A, C2) cassette candidates: every internal exon with both neighbours."""
    ex = ex.sort_values(["transcript_id", "start"], kind="mergesort").reset_index(drop=True)
    t = ex.transcript_id
    prev_ok = t.eq(t.shift(1))
    next_ok = t.eq(t.shift(-1))
    internal = prev_ok & next_ok
    tri = pd.DataFrame({
        "chrom": ex.chrom[internal].values,
        "strand": ex.strand[internal].values,
        "gene_id": ex.gene_id[internal].values,
        "gene_name": ex.gene_name[internal].values,
        "c1_end": ex.end.shift(1)[internal].values.astype(np.int64),
        "a_start": ex.start[internal].values.astype(np.int64),
        "a_end": ex.end[internal].values.astype(np.int64),
        "c2_start": ex.start.shift(-1)[internal].values.astype(np.int64),
        "mane": ex.mane[internal].values,
    })
    tri = tri[(tri.a_start > tri.c1_end + 1) & (tri.c2_start > tri.a_end + 1)]
    agg = tri.groupby(["chrom", "strand", "gene_id", "c1_end", "a_start", "a_end", "c2_start"],
                      observed=True).agg(gene_name=("gene_name", "first"),
                                         n_tx=("mane", "size"),
                                         in_mane=("mane", "max")).reset_index()
    return agg


class JunctionIndex:
    def __init__(self):
        j = pd.read_csv(os.path.join(paths().interim, "junctions.tsv"), sep="\t")
        self.counts = np.load(os.path.join(paths().interim, "junction_tissue_counts.npy"))
        self.tissues = pd.read_csv(os.path.join(paths().interim, "tissues.tsv"), sep="\t").tissue.tolist()
        self.key = pd.Series(np.arange(len(j)),
                             index=pd.MultiIndex.from_arrays([j.chrom, j.start, j.end]))
        self.key = self.key[~self.key.index.duplicated()]
        self.n_tis = self.counts.shape[1]

    def lookup(self, chrom, start, end):
        """Row index per query, -1 when the junction was never observed."""
        idx = pd.MultiIndex.from_arrays([chrom, start, end])
        return self.key.reindex(idx).fillna(-1).to_numpy(np.int64)

    def rows(self, ridx):
        out = np.zeros((len(ridx), self.n_tis), dtype=np.float32)
        hit = ridx >= 0
        out[hit] = self.counts[ridx[hit]]
        return out


def main():
    ex = load_exons()
    print(f"exons on main chromosomes: {len(ex):,}", flush=True)

    ex_sorted, intr = transcript_intron_table(ex)
    print(f"transcript introns: {len(intr):,}", flush=True)

    ji = JunctionIndex()
    print(f"GTEx junctions indexed: {len(ji.key):,}  tissues: {ji.n_tis}", flush=True)

    # ---- A. unique annotated introns with GTEx support -------------------
    uintr = (intr.groupby(["chrom", "strand", "istart", "iend"], observed=True)
                 .agg(gene_id=("gene_id", "first"), gene_name=("gene_name", "first"),
                      n_tx=("mane", "size"), in_mane=("mane", "max"),
                      n_basic=("basic", "sum")).reset_index())
    ridx = ji.lookup(uintr.chrom.astype(str), uintr.istart, uintr.iend)
    cts = ji.rows(ridx)
    uintr["gtex_total"] = cts.sum(1)
    uintr["gtex_n_tissues"] = (cts > 0).sum(1)
    uintr["observed_in_gtex"] = ridx >= 0
    # donor/acceptor genomic positions depend on strand
    plus = uintr.strand.astype(str).values == "+"
    uintr["donor_pos"] = np.where(plus, uintr.istart, uintr.iend)
    uintr["acceptor_pos"] = np.where(plus, uintr.iend, uintr.istart)
    uintr.to_csv(os.path.join(paths().interim, "introns.tsv"), sep="\t", index=False)
    print(f"unique introns: {len(uintr):,}  observed in GTEx: {uintr.observed_in_gtex.sum():,}", flush=True)

    # ---- B. cassette exons with per-tissue PSI ---------------------------
    tri = build_triples(ex_sorted)
    print(f"cassette candidates: {len(tri):,}", flush=True)
    ch = tri.chrom.astype(str)
    i1 = ji.rows(ji.lookup(ch, tri.c1_end + 1, tri.a_start - 1))     # upstream inclusion
    i2 = ji.rows(ji.lookup(ch, tri.a_end + 1, tri.c2_start - 1))     # downstream inclusion
    sk = ji.rows(ji.lookup(ch, tri.c1_end + 1, tri.c2_start - 1))    # skipping

    inc = (i1 + i2) / 2.0
    tot = inc + sk
    with np.errstate(invalid="ignore", divide="ignore"):
        psi = np.where(tot >= MIN_READS, inc / np.maximum(tot, 1e-9), np.nan).astype(np.float32)

    valid = np.isfinite(psi)
    tri["n_tissues_quant"] = valid.sum(1)
    tri["psi_mean"] = np.nanmean(np.where(valid, psi, np.nan), axis=1)
    tri["psi_min"] = np.nanmin(np.where(valid, psi, np.nan), axis=1)
    tri["psi_max"] = np.nanmax(np.where(valid, psi, np.nan), axis=1)
    tri["psi_range"] = tri.psi_max - tri.psi_min
    tri["psi_sd"] = np.nanstd(np.where(valid, psi, np.nan), axis=1)
    tri["reads_total"] = tot.sum(1)
    tri["skip_total"] = sk.sum(1)
    tri["exon_len"] = tri.a_end - tri.a_start + 1
    tri["intron_up_len"] = tri.a_start - tri.c1_end - 1
    tri["intron_dn_len"] = tri.c2_start - tri.a_end - 1

    keep = tri.n_tissues_quant >= 5
    tri_k = tri[keep].reset_index(drop=True)
    psi_k = psi[keep.to_numpy()]
    tri_k.to_csv(os.path.join(paths().interim, "cassette.tsv"), sep="\t", index=False)
    np.save(os.path.join(paths().interim, "cassette_psi.npy"), psi_k)
    print(f"cassette events with >=5 quantified tissues: {len(tri_k):,}", flush=True)
    print(tri_k.psi_mean.describe(), flush=True)

    # ---- C. competing splice sites --------------------------------------
    # group introns by shared donor -> competing acceptors, and vice versa
    obs = uintr[uintr.observed_in_gtex].copy()
    ridx_obs = ji.lookup(obs.chrom.astype(str), obs.istart, obs.iend)
    cts_obs = ji.rows(ridx_obs)
    frames = []
    for kind, keycols in (("alt3", ["chrom", "strand", "donor_pos"]),
                          ("alt5", ["chrom", "strand", "acceptor_pos"])):
        grp = obs.groupby(keycols, observed=True).ngroup().to_numpy()
        # pre-extract as plain arrays: indexing .values inside the loop is slow
        A_chrom = obs.chrom.astype(str).to_numpy()
        A_strand = obs.strand.astype(str).to_numpy()
        A_gene = obs.gene_id.to_numpy()
        A_name = obs.gene_name.to_numpy()
        A_is = obs.istart.to_numpy(); A_ie = obs.iend.to_numpy()
        A_dp = obs.donor_pos.to_numpy(); A_ap = obs.acceptor_pos.to_numpy()
        order = np.argsort(grp, kind="mergesort")
        g_sorted = grp[order]
        bounds = np.flatnonzero(np.r_[True, g_sorted[1:] != g_sorted[:-1], True])
        rows = []
        for a, b in zip(bounds[:-1], bounds[1:]):
            if b - a < 2:            # needs >=2 competing sites to be a choice
                continue
            members = order[a:b]
            sub = cts_obs[members]
            tot_g = sub.sum(0, keepdims=True)
            frac = np.where(tot_g >= MIN_READS, sub / np.maximum(tot_g, 1e-9), np.nan)
            valid_g = np.isfinite(frac)
            for k, m in enumerate(members):
                if valid_g[k].sum() < 5:
                    continue
                rows.append((kind, A_chrom[m], A_strand[m], A_gene[m], A_name[m],
                             int(A_is[m]), int(A_ie[m]), int(A_dp[m]), int(A_ap[m]),
                             b - a, float(np.nanmean(frac[k])), float(np.nanmax(frac[k])),
                             float(np.nanmin(frac[k])), int(valid_g[k].sum()),
                             float(sub[k].sum())))
        if rows:
            frames.append(pd.DataFrame(rows, columns=[
                "event_type", "chrom", "strand", "gene_id", "gene_name", "istart", "iend",
                "donor_pos", "acceptor_pos", "n_competing", "usage_mean", "usage_max",
                "usage_min", "n_tissues_quant", "reads_total"]))
        print(f"{kind}: {len(rows):,} competing sites", flush=True)
    if frames:
        alt = pd.concat(frames, ignore_index=True)
        # competing sites share their PARTNER: alt3 events share a donor,
        # alt5 events share an acceptor. Grouping on both coordinates would
        # identify a single intron and mark every row preferred.
        shared = np.where(alt.event_type.values == "alt3",
                          alt.donor_pos.values, alt.acceptor_pos.values)
        alt["group_id"] = (alt.event_type.astype(str) + ":" + alt.chrom.astype(str) + ":" +
                           alt.strand.astype(str) + ":" + pd.Series(shared, index=alt.index).astype(str))
        alt["is_preferred"] = 0
        alt.loc[alt.groupby("group_id").usage_mean.idxmax(), "is_preferred"] = 1
        alt.to_csv(os.path.join(paths().interim, "altss.tsv"), sep="\t", index=False)
        print(f"competing-site rows: {len(alt):,}", flush=True)
    print("DONE build_events", flush=True)


if __name__ == "__main__":
    main()
