#!/usr/bin/env python
"""
Download ENCODE RBP-knockdown RNA-seq transcript quantifications (V29 / GRCh38)
and reduce them on the fly: each 30 MB kallisto TSV becomes a float32 row in a
memmap, so the full 118 GB collection lands in ~6.5 GB of disk.

Outputs (data/raw/encode/):
  manifest.tsv          one row per file: experiment, RBP target, cell line, replicate
  transcripts.tsv       the shared transcript index (row order of the matrices)
  tpm.f32.memmap        (n_files, n_tx) float32  -- TPM
  counts.f32.memmap     (n_files, n_tx) float32  -- estimated counts
  fetch_status.tsv      per-file success/failure, for resuming
"""
import csv, os, sys, io, time
import numpy as np
import pandas as pd
import requests
from concurrent.futures import ThreadPoolExecutor

from bajasplice.config import paths
BASE = str(paths().raw / "encode")
ANNOT = "V29"
WORKERS = 8
MIN_FREE_GB = 20


def free_gb(path=BASE):
    s = os.statvfs(path)
    return s.f_bavail * s.f_frsize / 1e9


def build_manifest():
    rows = []
    for fn in ("metadata_shRNA.tsv", "metadata_CRISPR.tsv"):
        with open(os.path.join(BASE, fn)) as f:
            for r in csv.DictReader(f, delimiter="\t"):
                if r.get("Genome annotation") != ANNOT:
                    continue
                rows.append({
                    "file_acc": r["File accession"],
                    "experiment": r["Experiment accession"],
                    "assay": r["Assay"],
                    "target": (r["Experiment target"] or "").replace("-human", "") or "CONTROL",
                    "cell_line": r["Biosample term name"],
                    "bio_rep": r["Biological replicate(s)"],
                    "tech_rep": r["Technical replicate(s)"],
                    "url": r["File download URL"],
                    "size": r["Size"],
                })
    # stable, de-duplicated order
    seen, out = set(), []
    for r in sorted(rows, key=lambda x: (x["target"], x["cell_line"], x["experiment"], x["file_acc"])):
        if r["file_acc"] in seen:
            continue
        seen.add(r["file_acc"])
        out.append(r)
    return out


def fetch_one(url, retries=4):
    for a in range(retries):
        try:
            resp = requests.get(url, timeout=600)
            resp.raise_for_status()
            return resp.content
        except Exception:
            if a == retries - 1:
                raise
            time.sleep(3 * (a + 1))


def parse(content):
    df = pd.read_csv(io.BytesIO(content), sep="\t", usecols=["target_id", "est_counts", "tpm"],
                     dtype={"target_id": str, "est_counts": np.float32, "tpm": np.float32})
    return df


def main():
    man = build_manifest()
    n = len(man)
    print(f"{n} {ANNOT} files across {len(set(m['experiment'] for m in man))} experiments, "
          f"{len(set(m['target'] for m in man))} targets", flush=True)

    with open(os.path.join(BASE, "manifest.tsv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(man[0].keys()), delimiter="\t")
        w.writeheader(); w.writerows(man)

    # reference transcript index from the first file
    tx_path = os.path.join(BASE, "transcripts.tsv")
    if os.path.exists(tx_path):
        tx = pd.read_csv(tx_path, sep="\t")["target_id"].tolist()
    else:
        tx = parse(fetch_one(man[0]["url"]))["target_id"].tolist()
        pd.DataFrame({"target_id": tx}).to_csv(tx_path, sep="\t", index=False)
    n_tx = len(tx)
    tx_pos = {t: i for i, t in enumerate(tx)}
    print(f"transcript index: {n_tx} transcripts -> matrix {n} x {n_tx} "
          f"({n*n_tx*4/1e9:.2f} GB per matrix)", flush=True)

    tpm = np.lib.format.open_memmap(os.path.join(BASE, "tpm.npy"), mode="r+" if
          os.path.exists(os.path.join(BASE, "tpm.npy")) else "w+", dtype=np.float32, shape=(n, n_tx))
    cnt = np.lib.format.open_memmap(os.path.join(BASE, "counts.npy"), mode="r+" if
          os.path.exists(os.path.join(BASE, "counts.npy")) else "w+", dtype=np.float32, shape=(n, n_tx))

    status_path = os.path.join(BASE, "fetch_status.tsv")
    done = set()
    if os.path.exists(status_path):
        with open(status_path) as f:
            for line in f:
                acc, ok = line.rstrip("\n").split("\t")[:2]
                if ok == "OK":
                    done.add(acc)
    print(f"resuming: {len(done)} already fetched", flush=True)

    sf = open(status_path, "a", buffering=1)
    lock_report = {"n": 0, "t0": time.time()}

    def work(i):
        m = man[i]
        if m["file_acc"] in done:
            return
        try:
            df = parse(fetch_one(m["url"]))
            if len(df) == n_tx and df["target_id"].iloc[0] == tx[0] and df["target_id"].iloc[-1] == tx[-1]:
                tpm[i, :] = df["tpm"].to_numpy(np.float32)
                cnt[i, :] = df["est_counts"].to_numpy(np.float32)
            else:  # different transcript order/set: map by id
                idx = df["target_id"].map(tx_pos)
                keep = idx.notna()
                tpm[i, idx[keep].astype(int).to_numpy()] = df["tpm"].to_numpy(np.float32)[keep.to_numpy()]
                cnt[i, idx[keep].astype(int).to_numpy()] = df["est_counts"].to_numpy(np.float32)[keep.to_numpy()]
            sf.write(f"{m['file_acc']}\tOK\t{i}\n")
        except Exception as e:
            sf.write(f"{m['file_acc']}\tFAIL\t{i}\t{type(e).__name__}: {e}\n")
        lock_report["n"] += 1
        if lock_report["n"] % 50 == 0:
            el = time.time() - lock_report["t0"]
            print(f"  {lock_report['n']}/{n-len(done)} in {el/60:.1f} min "
                  f"({lock_report['n']/max(el,1):.1f} files/s), free {free_gb():.0f} GB", flush=True)

    todo = [i for i in range(n) if man[i]["file_acc"] not in done]
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        list(ex.map(work, todo))
    sf.close()
    tpm.flush(); cnt.flush()
    print("DONE encode", flush=True)


if __name__ == "__main__":
    main()
