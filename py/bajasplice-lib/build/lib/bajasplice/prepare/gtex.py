#!/usr/bin/env python
"""
Stream the 4 GB GTEx v8 junction GCT and collapse 17,382 samples into
per-tissue pseudo-bulk junction counts.

Junction IDs are chr_intronStart_intronEnd, 1-based inclusive INTRON
coordinates (verified against GENCODE introns).

Outputs (data/interim/):
  junction_tissue_counts.npy   (n_junctions, n_tissues) float32  summed reads
  junction_tissue_nzfrac.npy   (n_junctions, n_tissues) float32  frac of samples with >=1 read
  junctions.tsv                junction_id, gene_id, chrom, start, end
  tissues.tsv                  tissue name, n_samples
"""
import numpy as np, pandas as pd, os, sys, time

from bajasplice.config import paths
RAW = str(paths().raw / "gtex")
GCT = os.path.join(RAW, "GTEx_v8_junctions.gct.gz")
CHUNK = 2000

def main():
    attrs = pd.read_csv(os.path.join(RAW, "GTEx_v8_SampleAttributes.txt"), sep="\t",
                        usecols=["SAMPID", "SMTSD"], dtype=str)
    samp2tis = dict(zip(attrs.SAMPID, attrs.SMTSD))

    header = pd.read_csv(GCT, sep="\t", skiprows=2, nrows=0)
    cols = list(header.columns)
    sample_cols = cols[2:]
    n_samp = len(sample_cols)

    tis_of = [samp2tis.get(s) for s in sample_cols]
    unknown = sum(t is None for t in tis_of)
    tissues = sorted({t for t in tis_of if t})
    t_index = {t: i for i, t in enumerate(tissues)}
    col_tis = np.array([t_index.get(t, -1) for t in tis_of], dtype=np.int32)
    n_tis = len(tissues)
    n_per = np.bincount(col_tis[col_tis >= 0], minlength=n_tis)
    print(f"{n_samp} sample columns, {unknown} without tissue label, {n_tis} tissues", flush=True)

    # one-hot (n_samp, n_tis) for a fast matmul reduction
    onehot = np.zeros((n_samp, n_tis), dtype=np.float32)
    ok = col_tis >= 0
    onehot[np.arange(n_samp)[ok], col_tis[ok]] = 1.0

    sums, nz, ids = [], [], []
    t0 = time.time(); nrows = 0
    reader = pd.read_csv(GCT, sep="\t", skiprows=2, chunksize=CHUNK,
                         dtype={c: np.float32 for c in sample_cols} | {"Name": str, "Description": str})
    for ch in reader:
        ids.append(ch[["Name", "Description"]])
        v = ch[sample_cols].to_numpy(np.float32)
        sums.append(v @ onehot)
        nz.append((v > 0).astype(np.float32) @ onehot)
        nrows += len(ch)
        if nrows % 50000 == 0:
            el = time.time() - t0
            print(f"  {nrows}/357746 rows  {el/60:.1f} min  ({nrows/max(el,1):.0f} rows/s)", flush=True)

    S = np.vstack(sums); NZ = np.vstack(nz) / np.maximum(n_per, 1)[None, :]
    idf = pd.concat(ids, ignore_index=True).rename(columns={"Name": "junction_id", "Description": "gene_id"})
    parts = idf.junction_id.str.rsplit("_", n=2, expand=True)
    idf["chrom"] = parts[0]; idf["start"] = parts[1].astype(np.int64); idf["end"] = parts[2].astype(np.int64)

    os.makedirs(paths().interim, exist_ok=True)
    np.save(os.path.join(paths().interim, "junction_tissue_counts.npy"), S)
    np.save(os.path.join(paths().interim, "junction_tissue_nzfrac.npy"), NZ.astype(np.float32))
    idf.to_csv(os.path.join(paths().interim, "junctions.tsv"), sep="\t", index=False)
    pd.DataFrame({"tissue": tissues, "n_samples": n_per}).to_csv(os.path.join(paths().interim, "tissues.tsv"), sep="\t", index=False)
    print(f"DONE {S.shape} in {(time.time()-t0)/60:.1f} min", flush=True)

if __name__ == "__main__":
    main()
