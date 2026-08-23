#!/usr/bin/env python
"""SUPPA-style cassette-exon PSI from ENCODE kallisto transcript abundances.

ENCODE quantifies transcripts, not junctions, so exon inclusion is derived from
transcript abundance against the V29 annotation the quantifications were built
on:

    inclusion transcripts = contain BOTH flanking introns (C1->A and A->C2)
    exclusion transcripts = contain the skipping intron (C1->C2)
    PSI = sum(TPM_inclusion) / (sum(TPM_inclusion) + sum(TPM_exclusion))

Outputs (data/interim/):
  encode_events.tsv    one row per cassette event, V29 coordinates
  encode_psi.npy       (n_events, n_samples) float32 PSI, NaN where unquantified
  encode_samples.tsv   sample order: experiment, RBP target, cell line, replicate
"""
import numpy as np, pandas as pd, os, sys, time
from scipy import sparse

from bajasplice.config import paths
ENC = str(paths().raw / "encode")
MIN_TPM = 1.0          # inclusion+exclusion TPM needed to call a PSI


def load_samples():
    man = pd.read_csv(os.path.join(ENC, "manifest.tsv"), sep="\t")
    st = pd.read_csv(os.path.join(ENC, "fetch_status.tsv"), sep="\t", header=None,
                     names=["file_acc", "status", "row", "err"], on_bad_lines="skip")
    ok = st[st.status == "OK"][["file_acc", "row"]]
    m = man.merge(ok, on="file_acc")
    m["row"] = m.row.astype(int)
    ctrl = pd.read_csv(os.path.join(ENC, "experiment_controls.tsv"), sep="\t")
    m = m.merge(ctrl[["experiment", "controls"]], on="experiment", how="left")
    return m.sort_values("row").reset_index(drop=True)


def transcript_index():
    tx = pd.read_csv(os.path.join(ENC, "transcripts.tsv"), sep="\t")
    ids = tx.target_id.str.split("|", n=1, expand=True)[0]
    return {t: i for i, t in enumerate(ids)}, len(ids)


def build_events(tx_pos):
    """Cassette events plus the transcript sets that include or skip them."""
    ex = pd.read_csv(os.path.join(paths().interim, "exons_v29.tsv"), sep="\t", low_memory=False)
    main = {f"chr{c}" for c in list(range(1, 23)) + ["X", "Y"]}
    ex = ex[ex.chrom.isin(main)]
    ex = ex[ex.transcript_id.isin(tx_pos.keys())]
    ex = ex.sort_values(["transcript_id", "start"], kind="mergesort").reset_index(drop=True)
    print(f"v29 exons on main chromosomes with a quantified transcript: {len(ex):,}", flush=True)

    t = ex.transcript_id
    same = t.eq(t.shift(-1))
    intr = pd.DataFrame({
        "chrom": ex.chrom[same].values,
        "strand": ex.strand[same].values,
        "gene_id": ex.gene_id[same].values,
        "gene_name": ex.gene_name[same].values,
        "tx": ex.transcript_id[same].map(tx_pos).values,
        "istart": ex.end[same].values + 1,
        "iend": ex.start.shift(-1)[same].values.astype(np.int64) - 1,
    })
    intr = intr[intr.iend >= intr.istart]
    print(f"transcript introns: {len(intr):,}", flush=True)

    # intron -> transcripts carrying it
    key = list(zip(intr.chrom.values, intr.istart.values, intr.iend.values))
    intron_tx = {}
    for k, txi in zip(key, intr.tx.values):
        intron_tx.setdefault(k, []).append(txi)
    print(f"unique introns: {len(intron_tx):,}", flush=True)

    # candidate triples: internal exon with both neighbours in the same transcript
    prev_ok = t.eq(t.shift(1)); next_ok = t.eq(t.shift(-1))
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
    })
    tri = tri[(tri.a_start > tri.c1_end + 1) & (tri.c2_start > tri.a_end + 1)]
    tri = tri.drop_duplicates(["chrom", "strand", "c1_end", "a_start", "a_end", "c2_start"])
    tri = tri.reset_index(drop=True)
    print(f"candidate cassette triples: {len(tri):,}", flush=True)

    rows_i, cols_i, rows_e, cols_e, keep = [], [], [], [], []
    for i, r in enumerate(tri.itertuples(index=False)):
        up = intron_tx.get((r.chrom, r.c1_end + 1, r.a_start - 1))
        dn = intron_tx.get((r.chrom, r.a_end + 1, r.c2_start - 1))
        sk = intron_tx.get((r.chrom, r.c1_end + 1, r.c2_start - 1))
        if up is None or dn is None or sk is None:
            continue                      # needs a real skipping isoform to be a choice
        inc = set(up) & set(dn)
        if not inc:
            continue
        exc = set(sk)
        keep.append(i)
        j = len(keep) - 1
        rows_i.extend([j] * len(inc)); cols_i.extend(inc)
        rows_e.extend([j] * len(exc)); cols_e.extend(exc)
        if i % 200000 == 0:
            print(f"  triples {i}/{len(tri)} -> {len(keep)} events", flush=True)

    ev = tri.iloc[keep].reset_index(drop=True)
    n_tx = len(tx_pos)
    M_inc = sparse.csr_matrix((np.ones(len(rows_i), np.float32), (rows_i, cols_i)),
                              shape=(len(ev), n_tx))
    M_exc = sparse.csr_matrix((np.ones(len(rows_e), np.float32), (rows_e, cols_e)),
                              shape=(len(ev), n_tx))
    print(f"events with both isoform classes: {len(ev):,}", flush=True)
    return ev, M_inc, M_exc


def main():
    t0 = time.time()
    tx_pos, n_tx = transcript_index()
    samples = load_samples()
    print(f"{len(samples)} samples, {n_tx} transcripts", flush=True)

    ev, M_inc, M_exc = build_events(tx_pos)

    tpm = np.load(os.path.join(ENC, "tpm.npy"), mmap_mode="r")
    X = np.asarray(tpm[samples.row.to_numpy()], dtype=np.float32)   # (n_samples, n_tx)
    print(f"TPM block {X.shape}", flush=True)

    INC = M_inc @ X.T          # (n_events, n_samples)
    EXC = M_exc @ X.T
    tot = INC + EXC
    with np.errstate(invalid="ignore", divide="ignore"):
        psi = np.where(tot >= MIN_TPM, INC / np.maximum(tot, 1e-9), np.nan).astype(np.float32)

    ev["n_samples_quant"] = np.isfinite(psi).sum(1)
    ev["exon_len"] = ev.a_end - ev.a_start + 1
    os.makedirs(paths().interim, exist_ok=True)
    ev.to_csv(os.path.join(paths().interim, "encode_events.tsv"), sep="\t", index=False)
    np.save(os.path.join(paths().interim, "encode_psi.npy"), psi)
    samples.to_csv(os.path.join(paths().interim, "encode_samples.tsv"), sep="\t", index=False)
    print(f"PSI matrix {psi.shape}; median events quantified per sample: "
          f"{np.median(np.isfinite(psi).sum(0)):,.0f}", flush=True)
    print(f"DONE encode_psi in {(time.time()-t0)/60:.1f} min", flush=True)


if __name__ == "__main__":
    main()
