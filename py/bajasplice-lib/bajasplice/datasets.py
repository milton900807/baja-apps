"""Datasets for the four supervised tasks.

    SpliceSiteDataset   windowed per-nucleotide donor/acceptor labels
    PSIDataset          cassette-exon inclusion across tissues
    AltSSDataset        competing splice sites, one group per item
    RBPResponseDataset  which RBP knockdowns change an exon

All of them take genomic coordinates and read sequence in transcript
orientation, so a minus-strand event needs no special handling by the caller.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from bajasplice.config import paths, split_of
from bajasplice.genome import GenomeReader, one_hot

__all__ = ["canonical_transcripts", "build_splicesite_index", "SpliceSiteDataset",
           "site_positions", "load_events", "PSIDataset",
           "load_groups", "AltSSDataset", "MAX_GROUP",
           "build_rbp_matrix", "aligned_binding", "RBPResponseDataset"]

# ----------------------------------------------------------------------
# task 1: splice sites
# ----------------------------------------------------------------------

def canonical_transcripts(exons, protein_coding_only=True):
    ex = exons
    if protein_coding_only:
        ex = ex[ex.gene_type == "protein_coding"]
    tx = (ex.groupby(["gene_id", "transcript_id"], observed=True)
            .agg(chrom=("chrom", "first"), strand=("strand", "first"),
                 gene_name=("gene_name", "first"), mane=("mane", "max"),
                 basic=("basic", "max"), n_exons=("start", "size"),
                 span_start=("start", "min"), span_end=("end", "max"),
                 exonic_len=("end", lambda s: 0)).reset_index())
    tx["exonic_len"] = (ex.assign(l=ex.end - ex.start + 1)
                          .groupby("transcript_id", observed=True).l.sum()
                          .reindex(tx.transcript_id).to_numpy())
    tx = tx.sort_values(["gene_id", "mane", "basic", "exonic_len"],
                        ascending=[True, False, False, False])
    return tx.groupby("gene_id", observed=True).head(1).reset_index(drop=True)


def build_splicesite_index(target_len=5000, min_introns=1, protein_coding_only=True):
    exons = pd.read_csv(os.path.join(paths().interim, "exons.tsv"), sep="\t", low_memory=False,
                        usecols=["chrom", "start", "end", "strand", "gene_id",
                                 "transcript_id", "gene_name", "gene_type", "mane", "basic"])
    from bajasplice.config import MAIN_CHROMS
    exons = exons[exons.chrom.isin(MAIN_CHROMS)]
    can = canonical_transcripts(exons, protein_coding_only)
    keep_tx = set(can.transcript_id)
    ce = exons[exons.transcript_id.isin(keep_tx)].sort_values(["transcript_id", "start"])

    sites, genes = {}, []
    for tid, grp in ce.groupby("transcript_id", sort=False):
        st = grp.start.to_numpy(); en = grp.end.to_numpy()
        if len(st) < min_introns + 1:
            continue
        strand = grp.strand.iloc[0]; chrom = grp.chrom.iloc[0]
        # intron k spans en[k]+1 .. st[k+1]-1
        if strand == "+":
            donors = en[:-1] + 1            # first base of intron
            acceptors = st[1:] - 1          # last base of intron
        else:
            donors = st[1:] - 1
            acceptors = en[:-1] + 1
        sites[tid] = (np.asarray(donors), np.asarray(acceptors))
        genes.append((tid, grp.gene_id.iloc[0], chrom, strand, int(st.min()), int(en.max())))

    gdf = pd.DataFrame(genes, columns=["transcript_id", "gene_id", "chrom", "strand",
                                       "span_start", "span_end"])
    gdf["split"] = gdf.chrom.map(split_of)

    windows = []
    for r in gdf.itertuples(index=False):
        n = r.span_end - r.span_start + 1
        nw = max(1, int(np.ceil(n / target_len)))
        for w in range(nw):
            ws = r.span_start + w * target_len
            windows.append((r.transcript_id, r.chrom, r.strand, ws, ws + target_len - 1, r.split))
    wdf = pd.DataFrame(windows, columns=["transcript_id", "chrom", "strand",
                                         "win_start", "win_end", "split"])
    return wdf, sites, gdf


class SpliceSiteDataset(Dataset):
    def __init__(self, windows, sites, context=2000, target_len=5000):
        self.w = windows.reset_index(drop=True)
        self.sites = sites
        self.context = context
        self.target_len = target_len
        self.g = GenomeReader()

    def __len__(self):
        return len(self.w)

    def __getitem__(self, i):
        r = self.w.iloc[i]
        c = self.context // 2
        codes = self.g.codes(r.chrom, r.win_start - c, r.win_end + c, r.strand)
        y = np.zeros(self.target_len, dtype=np.int64)
        donors, acceptors = self.sites[r.transcript_id]
        for arr, lab in ((acceptors, 1), (donors, 2)):
            m = (arr >= r.win_start) & (arr <= r.win_end)
            if m.any():
                off = arr[m] - r.win_start
                if r.strand == "-":
                    off = self.target_len - 1 - off
                y[off] = lab
        x = one_hot(codes)
        return torch.from_numpy(x), torch.from_numpy(y)


# ----------------------------------------------------------------------
# task 2: cassette-exon PSI
# ----------------------------------------------------------------------

def site_positions(row):
    """Four site positions in transcript order, each a genomic coordinate."""
    if row.strand == "+":
        return (row.c1_end + 1, row.a_start - 1, row.a_end + 1, row.c2_start - 1)
    # minus strand: transcript order runs from high to low coordinates
    return (row.c2_start - 1, row.a_end + 1, row.a_start - 1, row.c1_end + 1)


def load_events(min_tissues=5, min_reads=50):
    ev = pd.read_csv(os.path.join(paths().interim, "cassette.tsv"), sep="\t")
    psi = np.load(os.path.join(paths().interim, "cassette_psi.npy"))
    keep = (ev.n_tissues_quant >= min_tissues) & (ev.reads_total >= min_reads)
    ev = ev[keep].reset_index(drop=True)
    psi = psi[keep.to_numpy()]
    ev["split"] = ev.chrom.map(split_of)
    return ev, psi


class PSIDataset(Dataset):
    def __init__(self, events, psi, win=400, context=400):
        self.ev = events.reset_index(drop=True)
        self.psi = psi
        self.win = win
        self.context = context
        self.total = win + context
        self.g = GenomeReader()
        self.sites = np.array([site_positions(r) for r in self.ev.itertuples(index=False)],
                              dtype=np.int64)

    def __len__(self):
        return len(self.ev)

    def geometry(self, r, exon_codes, intron_codes):
        gc = lambda c: float(((c == 2) | (c == 3)).sum() / max((c > 0).sum(), 1))
        return np.array([
            np.log10(max(r.exon_len, 1)),
            np.log10(max(r.intron_up_len, 1)),
            np.log10(max(r.intron_dn_len, 1)),
            1.0 if r.exon_len % 3 == 0 else 0.0,
            gc(exon_codes),
            gc(intron_codes),
        ], dtype=np.float32)

    def __getitem__(self, i):
        r = self.ev.iloc[i]
        half = self.total // 2
        wins = np.zeros((4, 4, self.total), dtype=np.float32)
        for k, p in enumerate(self.sites[i]):
            codes = self.g.codes(r.chrom, int(p) - half, int(p) + half - 1, r.strand)
            wins[k] = one_hot(codes)
        ex = self.g.codes(r.chrom, int(r.a_start), int(r.a_end), r.strand)
        intr = self.g.codes(r.chrom, int(r.c1_end) + 1, int(r.c1_end) + 200, r.strand)
        geom = self.geometry(r, ex, intr)
        y = self.psi[i]
        mask = np.isfinite(y)
        ymean = float(np.nanmean(y)) if mask.any() else 0.0
        return (torch.from_numpy(wins), torch.from_numpy(geom),
                torch.from_numpy(np.nan_to_num(y, nan=0.0).astype(np.float32)),
                torch.from_numpy(mask), torch.tensor(ymean, dtype=torch.float32))


# ----------------------------------------------------------------------
# task 3: competing splice sites
# ----------------------------------------------------------------------

MAX_GROUP = 6


def load_groups(min_tissues=5, min_reads=50):
    a = pd.read_csv(os.path.join(paths().interim, "altss.tsv"), sep="\t")
    a = a[(a.n_tissues_quant >= min_tissues)]
    tot = a.groupby("group_id").reads_total.transform("sum")
    a = a[tot >= min_reads]
    sz = a.groupby("group_id").group_id.transform("size")
    a = a[(sz >= 2) & (sz <= MAX_GROUP)].copy()
    a["split"] = a.chrom.map(split_of)
    # renormalise usage within the surviving members
    a["usage"] = a.usage_mean / a.groupby("group_id").usage_mean.transform("sum")
    return a


class AltSSDataset(Dataset):
    def __init__(self, groups, win=200, context=2000):
        self.groups = [g for _, g in groups.groupby("group_id", sort=False)]
        self.win = win
        self.context = context
        self.total = win + context
        self.g = GenomeReader()

    def __len__(self):
        return len(self.groups)

    def __getitem__(self, i):
        grp = self.groups[i]
        n = len(grp)
        x = np.zeros((MAX_GROUP, 4, self.total), dtype=np.float32)
        feat = np.zeros((MAX_GROUP, 2), dtype=np.float32)
        y = np.zeros(MAX_GROUP, dtype=np.float32)
        m = np.zeros(MAX_GROUP, dtype=bool)
        half = self.total // 2
        for k, r in enumerate(grp.itertuples(index=False)):
            # the variable site is the acceptor for alt3, the donor for alt5
            p = int(r.acceptor_pos if r.event_type == "alt3" else r.donor_pos)
            codes = self.g.codes(r.chrom, p - half, p + half - 1, r.strand)
            x[k] = one_hot(codes)
            ilen = abs(int(r.iend) - int(r.istart)) + 1
            feat[k, 0] = np.log10(max(ilen, 1))
            feat[k, 1] = 1.0 if r.event_type == "alt3" else 0.0
            y[k] = r.usage
            m[k] = True
        return (torch.from_numpy(x), torch.from_numpy(feat),
                torch.from_numpy(y), torch.from_numpy(m))


# ----------------------------------------------------------------------
# task 4: RBP knockdown response
# ----------------------------------------------------------------------

Z_THR, DPSI_THR = 4.0, 0.10
MIN_HITS_PER_RBP = 30


def build_rbp_matrix():
    ev = pd.read_csv(os.path.join(paths().interim, "encode_events.tsv"), sep="\t")
    cols = pd.read_csv(os.path.join(paths().interim, "encode_dpsi_cols.tsv"), sep="\t")
    D = np.load(os.path.join(paths().interim, "encode_dpsi.npy"))
    Z = np.load(os.path.join(paths().interim, "encode_dpsi_z.npy"))

    hit = (np.abs(Z) >= Z_THR) & (np.abs(D) >= DPSI_THR)
    tested = np.isfinite(Z) & np.isfinite(D)

    rbps = sorted(cols.target.unique())
    rpos = {r: i for i, r in enumerate(rbps)}
    H = np.zeros((len(ev), len(rbps)), dtype=np.float32)
    M = np.zeros((len(ev), len(rbps)), dtype=bool)
    S = np.zeros((len(ev), len(rbps)), dtype=np.float32)      # signed dPSI, largest magnitude
    for j, tgt in enumerate(cols.target):
        k = rpos[tgt]
        M[:, k] |= tested[:, j]
        H[:, k] = np.maximum(H[:, k], hit[:, j].astype(np.float32))
        d = np.nan_to_num(D[:, j])
        take = np.abs(d) > np.abs(S[:, k])
        S[take, k] = d[take]

    ev["split"] = ev.chrom.map(split_of)
    ev["intron_up_len"] = ev.a_start - ev.c1_end - 1
    ev["intron_dn_len"] = ev.c2_start - ev.a_end - 1
    ev["n_rbp_tested"] = M.sum(1)
    ev["n_rbp_hits"] = (H * M).sum(1)
    ev["marginal_rate"] = ev.n_rbp_hits / ev.n_rbp_tested.clip(lower=1)

    keep_rbp = ((H * M).sum(0) >= MIN_HITS_PER_RBP)
    keep_ev = (ev.n_rbp_tested >= 100).to_numpy()
    return (ev[keep_ev].reset_index(drop=True), H[keep_ev][:, keep_rbp],
            M[keep_ev][:, keep_rbp], S[keep_ev][:, keep_rbp],
            [r for r, k in zip(rbps, keep_rbp) if k])


def aligned_binding(rbps):
    """BajaCLIP binding (n_exons, n_regions, n_rbp) aligned to the RBP column
    order of the response matrix. RBPs with no binding model get zeros."""
    meta = json.load(open(os.path.join(paths().interim, "rbp_binding_meta.json")))
    prot = meta["proteins"]
    B = np.load(os.path.join(paths().interim, "rbp_binding_max.npy"))
    ppos = {p: i for i, p in enumerate(prot)}
    out = np.zeros((B.shape[0], B.shape[1], len(rbps)), dtype=np.float32)
    have = np.zeros(len(rbps), dtype=bool)
    for k, r in enumerate(rbps):
        if r in ppos:
            out[:, :, k] = B[:, :, ppos[r]]
            have[k] = True
    return out, have


class RBPResponseDataset(Dataset):
    """Four splice-site windows + geometry -> per-RBP response vector.
    If `binding` is given, each exon also carries its per-RBP BajaCLIP scores."""

    def __init__(self, events, H, M, win=400, context=2000, binding=None):
        self.ev = events.reset_index(drop=True)
        self.H, self.M = H, M
        self.binding = binding
        self.total = win + context
        self.g = GenomeReader()
        s = []
        for r in self.ev.itertuples(index=False):
            if r.strand == "+":
                s.append((r.c1_end + 1, r.a_start - 1, r.a_end + 1, r.c2_start - 1))
            else:
                s.append((r.c2_start - 1, r.a_end + 1, r.a_start - 1, r.c1_end + 1))
        self.sites = np.array(s, dtype=np.int64)

    def __len__(self):
        return len(self.ev)

    def __getitem__(self, i):
        r = self.ev.iloc[i]
        half = self.total // 2
        wins = np.zeros((4, 4, self.total), dtype=np.float32)
        for k, p in enumerate(self.sites[i]):
            wins[k] = one_hot(self.g.codes(r.chrom, int(p) - half, int(p) + half - 1, r.strand))
        ex = self.g.codes(r.chrom, int(r.a_start), int(r.a_end), r.strand)
        intr = self.g.codes(r.chrom, int(r.c1_end) + 1, int(r.c1_end) + 200, r.strand)
        gc = lambda c: float(((c == 2) | (c == 3)).sum() / max((c > 0).sum(), 1))
        geom = np.array([np.log10(max(r.exon_len, 1)),
                         np.log10(max(r.intron_up_len, 1)),
                         np.log10(max(r.intron_dn_len, 1)),
                         1.0 if r.exon_len % 3 == 0 else 0.0,
                         gc(ex), gc(intr)], dtype=np.float32)
        b = (torch.from_numpy(self.binding[i]) if self.binding is not None
             else torch.zeros(1, dtype=torch.float32))
        return (torch.from_numpy(wins), torch.from_numpy(geom),
                torch.from_numpy(self.H[i]), torch.from_numpy(self.M[i]), b)
