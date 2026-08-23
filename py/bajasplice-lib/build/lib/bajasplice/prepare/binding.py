#!/usr/bin/env python
"""Score BajaCLIP predicted RBP binding around every cassette exon.

Six regions per exon, in transcript orientation, covering the places splicing
regulators actually act:

  up_int_5p   first 150 nt of the upstream intron   (C1 donor side)
  up_int_3p   last  300 nt of the upstream intron   (branch point / polypyrimidine)
  exon_5p     first 150 nt of the exon
  exon_3p     last  150 nt of the exon
  dn_int_5p   first 300 nt of the downstream intron (A donor side)
  dn_int_3p   last  150 nt of the downstream intron

Each region is tiled with 64-nt windows (the model's input size), every window
scored for all 170 RBPs, and the max and mean taken per region.

Outputs (data/interim/):
  rbp_binding_max.npy   (n_exons, 6, 170) float32
  rbp_binding_mean.npy  (n_exons, 6, 170) float32
  rbp_binding_meta.json regions and protein order
"""
import numpy as np, os, sys, json, time
import torch
from multiprocessing import Pool

from bajasplice.config import paths
from bajasplice.bajaclip import load as _bc_load, encode as encode_seq, sphere_features
from bajasplice import bajaclip
from bajasplice.genome import GenomeReader
from bajasplice.datasets import build_rbp_matrix

MODEL = os.environ.get("BAJACLIP_MODEL", bajaclip.DEFAULT_MODEL)
WIN, STEP = 64, 32
REGIONS = ["up_int_5p", "up_int_3p", "exon_5p", "exon_3p", "dn_int_5p", "dn_int_3p"]
REGION_LEN = {"up_int_5p": 150, "up_int_3p": 300, "exon_5p": 150,
              "exon_3p": 150, "dn_int_5p": 300, "dn_int_3p": 150}
CHUNK = 2000

_G = None
_MOTIFS = None


def _init(motifs):
    global _G, _MOTIFS
    _G = GenomeReader()
    _MOTIFS = motifs


def _seq(chrom, start, end, strand):
    if end < start:
        return ""
    c = _G.codes(chrom, int(start), int(end), strand)
    return "".join("NACGT"[i] for i in c)


def _regions_for(row):
    """Transcript-oriented region sequences for one exon."""
    chrom, strand = row["chrom"], row["strand"]
    if strand == "+":
        up = (row["c1_end"] + 1, row["a_start"] - 1)
        dn = (row["a_end"] + 1, row["c2_start"] - 1)
    else:
        up = (row["a_end"] + 1, row["c2_start"] - 1)
        dn = (row["c1_end"] + 1, row["a_start"] - 1)
    up_s = _seq(chrom, up[0], up[1], strand)
    dn_s = _seq(chrom, dn[0], dn[1], strand)
    ex_s = _seq(chrom, row["a_start"], row["a_end"], strand)
    return {
        "up_int_5p": up_s[:REGION_LEN["up_int_5p"]],
        "up_int_3p": up_s[-REGION_LEN["up_int_3p"]:],
        "exon_5p": ex_s[:REGION_LEN["exon_5p"]],
        "exon_3p": ex_s[-REGION_LEN["exon_3p"]:],
        "dn_int_5p": dn_s[:REGION_LEN["dn_int_5p"]],
        "dn_int_3p": dn_s[-REGION_LEN["dn_int_3p"]:],
    }


def _windows(s):
    s = s.upper()
    if len(s) < 10:
        return []
    if len(s) <= WIN:
        return [s]
    return [s[i:i + WIN] for i in range(0, len(s) - WIN + 1, STEP)]


def _work(row):
    """Encoded windows + sphere features for one exon, with region boundaries."""
    regs = _regions_for(row)
    X, S, bounds = [], [], []
    for r in REGIONS:
        w = _windows(regs[r])
        start = len(X)
        for s in w:
            X.append(encode_seq(s, WIN))
            S.append(sphere_features(s, _MOTIFS))
        bounds.append((start, len(X)))
    if not X:
        return None
    return (np.asarray(X, dtype=np.int8), np.asarray(S, dtype=np.float32), bounds)


def main():
    ev, H, M, S_, rbps = build_rbp_matrix()
    rows = ev[["chrom", "strand", "c1_end", "a_start", "a_end", "c2_start"]].to_dict("records")
    n = len(rows)
    print(f"{n:,} exons to scan", flush=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, proteins, max_len, mtype, motifs = _bc_load(MODEL, device)
    model.eval()
    n_p = len(proteins)
    print(f"BajaCLIP: {n_p} RBPs, window {max_len}, {len(motifs)} motifs, on {device}", flush=True)

    BMAX = np.zeros((n, len(REGIONS), n_p), dtype=np.float32)
    BMEAN = np.zeros((n, len(REGIONS), n_p), dtype=np.float32)

    t0 = time.time()
    with Pool(processes=10, initializer=_init, initargs=(motifs,)) as pool:
        for c0 in range(0, n, CHUNK):
            chunk = rows[c0:c0 + CHUNK]
            feats = pool.map(_work, chunk, chunksize=25)
            allX, allS, offs = [], [], []
            for f in feats:
                if f is None:
                    offs.append(None); continue
                X, Sf, b = f
                base = sum(len(a) for a in allX)
                allX.append(X); allS.append(Sf)
                offs.append([(base + s, base + e) for s, e in b])
            if not allX:
                continue
            X = torch.from_numpy(np.concatenate(allX).astype(np.int64))
            Sf = torch.from_numpy(np.concatenate(allS))
            P = np.empty((len(X), n_p), dtype=np.float32)
            with torch.no_grad():
                for i in range(0, len(X), 8192):
                    xb = X[i:i + 8192].to(device); sb = Sf[i:i + 8192].to(device)
                    P[i:i + 8192] = torch.sigmoid(model(xb, sb)).float().cpu().numpy()
            for j, ob in enumerate(offs):
                if ob is None:
                    continue
                for k, (s, e) in enumerate(ob):
                    if e > s:
                        BMAX[c0 + j, k] = P[s:e].max(0)
                        BMEAN[c0 + j, k] = P[s:e].mean(0)
            done = min(c0 + CHUNK, n)
            el = time.time() - t0
            print(f"  {done}/{n} exons  {el/60:.1f} min  ({done/max(el,1):.0f} exons/s)", flush=True)

    np.save(os.path.join(paths().interim, "rbp_binding_%s_max.npy" % TAG), BMAX)
    np.save(os.path.join(paths().interim, "rbp_binding_%s_mean.npy" % TAG), BMEAN)
    with open(os.path.join(paths().interim, "rbp_binding_%s_meta.json" % TAG), "w") as f:
        json.dump({"regions": REGIONS, "region_len": REGION_LEN, "proteins": proteins,
                   "window": WIN, "step": STEP, "model": MODEL}, f, indent=2)
    print(f"DONE {BMAX.shape} in {(time.time()-t0)/60:.1f} min", flush=True)


if __name__ == "__main__":
    main()
