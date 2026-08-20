#!/usr/bin/env python3
"""
Off-target index builder.

Turns a (multi-contig) nucleotide FASTA (.fa or .fa.gz) into an on-disk,
mmap-friendly index used by search.py to find Levenshtein off-target sites for
short oligos (8-25 nt) up to edit distance 3.

Artifacts written to  <index_root>/<name>/ :
    meta.json           {name, W, seqLen, nContigs, packing, dtype_pos, source, sha1, built}
                        (written LAST -- its presence marks the index complete)
    seq.pack            packed 2-bit sequence, uint8, 4 bases/byte (A=0 C=1 G=2 T=3; N->0)
    contigs.json        [{name, length, offset}]  (offset = global start of the contig)
    contig.off.npy      int64 (nContigs+1,) cumulative contig offsets
    nmask.iv.npy        int64 (M,2) half-open [start,end) runs of N / non-ACGT
    kmer.offsets.npy    int64 (4**W + 1,) CSR prefix sums of the W-mer seed index
    kmer.positions.npy  int32|int64  global start positions grouped by W-mer code

W-mers do NOT span contig boundaries or N-runs (those windows are excluded).

CLI:  python3 build-index.py <fasta> <index_root> <name> [--W 8]
Runs standalone; if the bundled `ion` package is importable it also emits
IONWORKS:PROGRESS lines so the server can surface build progress.
"""

import os
import re
import sys
import gzip
import json
import time
import hashlib
import argparse

import numpy as np

# Optional ionworks progress (present when spawned by the server; absent in tests)
try:
    from ion import works  # type: ignore

    def _progress(v):
        try:
            works.progress(int(v))
        except Exception:
            pass

    def _msg(m):
        try:
            works.msg(str(m))
        except Exception:
            pass
except Exception:  # pragma: no cover - standalone
    def _progress(v):
        pass

    def _msg(m):
        sys.stderr.write(str(m) + "\n")


# --- base -> 2-bit code lookup ------------------------------------------------
# A/a=0 C/c=1 G/g=2 T/t=3 U/u=3 ; everything else -> 0 and flagged as "N".
_CODE = np.zeros(256, dtype=np.uint8)
_VALID = np.zeros(256, dtype=bool)
for _ch, _v in (("A", 0), ("C", 1), ("G", 2), ("T", 3), ("U", 3)):
    for _c in (_ch, _ch.lower()):
        _CODE[ord(_c)] = _v
        _VALID[ord(_c)] = True


def _open(path):
    return gzip.open(path, "rb") if path.endswith(".gz") else open(path, "rb")


_SYM_RE = re.compile(r"gene_symbol:(\S+)")


def _parse_header(line):
    """From a FASTA header line (bytes, incl. '>') return (clean_name, symbol).

    Handles GENCODE pipe headers ( ENST|ENSG|-|OTT|tx_name|GENE_SYMBOL|... ) and
    Ensembl space headers ( ENST... gene_symbol:SYMBOL ... ). Name is the
    transcript/contig id up to the first whitespace or '|'.
    """
    h = line[1:].decode("ascii", "replace").rstrip("\n").rstrip("\r")
    first = h.split()[0] if h else ""
    clean = first.split("|")[0]
    symbol = ""
    if "|" in first:
        parts = first.split("|")
        # GENCODE: gene symbol is field index 5 (0-based); fall back to tx name.
        if len(parts) > 5 and parts[5] and parts[5] != "-":
            symbol = parts[5]
        elif len(parts) > 4 and parts[4] and parts[4] != "-":
            symbol = parts[4]
    else:
        m = _SYM_RE.search(h)
        if m:
            symbol = m.group(1)
    return clean, symbol


def read_fasta(path):
    """Yield (contig_name, symbol, raw_bytes) for each record, streaming."""
    name = None
    symbol = ""
    chunks = []
    with _open(path) as fh:
        for line in fh:
            if line[:1] == b">":
                if name is not None:
                    yield name, symbol, b"".join(chunks)
                name, symbol = _parse_header(line)
                chunks = []
            else:
                chunks.append(line.strip())
        if name is not None:
            yield name, symbol, b"".join(chunks)


def build_index(fasta_path, out_root, name, W=8):
    t0 = time.time()
    os.makedirs(out_root, exist_ok=True)
    out_dir = os.path.join(out_root, name)
    os.makedirs(out_dir, exist_ok=True)

    # --- pass 1: decode all contigs into one global code array + N-mask -------
    # code==0 is ambiguous between 'A' and 'N', so validity is tracked separately.
    code_parts = []
    valid_parts = []
    contigs = []
    offset = 0
    hasher = hashlib.sha1()
    for cname, symbol, raw in read_fasta(fasta_path):
        hasher.update(cname.encode("utf-8"))
        hasher.update(raw)
        arr = np.frombuffer(raw, dtype=np.uint8)
        code_parts.append(_CODE[arr])
        valid_parts.append(_VALID[arr])
        contigs.append({"name": cname, "length": int(arr.size), "offset": int(offset), "symbol": symbol})
        offset += int(arr.size)

    seq_len = offset
    if seq_len == 0:
        raise SystemExit("build-index: empty FASTA %s" % fasta_path)

    codes = np.ascontiguousarray(np.concatenate(code_parts), dtype=np.uint8)
    is_n = ~np.concatenate(valid_parts)
    del code_parts, valid_parts
    _progress(20)

    contig_off = np.zeros(len(contigs) + 1, dtype=np.int64)
    for i, c in enumerate(contigs):
        contig_off[i + 1] = contig_off[i] + c["length"]

    # --- N-run intervals (global, half-open) ----------------------------------
    nmask = _runs(is_n)

    # --- pack 2-bit -----------------------------------------------------------
    _write_pack(os.path.join(out_dir, "seq.pack"), codes)
    _progress(40)

    # --- W-mer seed index (per contig; never cross boundaries or N) -----------
    # Two-pass STREAMING counting sort: never materializes the full W-mer array or
    # a global argsort index, so a multi-Gbp reference builds in a few GB instead of
    # tens of GB. Pass 1 counts per bucket; pass 2 scatters positions into the CSR.
    n_buckets = 4 ** W
    pos_dtype = np.int32 if seq_len < (1 << 31) else np.int64
    km_dtype = np.uint16 if n_buckets <= 65536 else np.int32

    def contig_kmers(c):
        s, L = c["offset"], c["length"]
        if L < W:
            return None
        cc = codes[s:s + L].astype(np.int64)
        km = cc[0:L - W + 1].copy()
        for j in range(1, W):
            km *= 4
            km += cc[j:j + (L - W + 1)]
        ncum = np.zeros(L + 1, dtype=np.int64)
        np.cumsum(is_n[s:s + L].astype(np.int64), out=ncum[1:])
        win_has_n = (ncum[W:L + 1] - ncum[0:L - W + 1]) > 0
        starts_local = np.nonzero(~win_has_n)[0]
        if starts_local.size == 0:
            return None
        km_v = km[starts_local].astype(km_dtype)
        pos_v = (starts_local.astype(np.int64) + s).astype(pos_dtype)
        return km_v, pos_v

    # Pass 1: per-bucket counts.
    counts = np.zeros(n_buckets, dtype=np.int64)
    n_seeds = 0
    for c in contigs:
        r = contig_kmers(c)
        if r is None:
            continue
        km_v, _ = r
        counts += np.bincount(km_v, minlength=n_buckets)
        n_seeds += int(km_v.size)
    offsets = np.zeros(n_buckets + 1, dtype=np.int64)
    np.cumsum(counts, out=offsets[1:])
    _progress(65)

    # Pass 2: stable scatter into the CSR positions array via a per-bucket cursor.
    positions = np.empty(n_seeds, dtype=pos_dtype)
    cursor = offsets[:-1].copy()
    for c in contigs:
        r = contig_kmers(c)
        if r is None:
            continue
        km_v, pos_v = r
        o = np.argsort(km_v, kind="stable")       # per-contig (small)
        km_s = km_v[o]
        pos_s = pos_v[o]
        rank = np.arange(km_s.size, dtype=np.int64) - np.searchsorted(km_s, km_s, side="left")
        positions[cursor[km_s] + rank] = pos_s
        uniq, cnt = np.unique(km_s, return_counts=True)
        cursor[uniq] += cnt
    _progress(85)

    # --- persist --------------------------------------------------------------
    np.save(os.path.join(out_dir, "contig.off.npy"), contig_off)
    np.save(os.path.join(out_dir, "nmask.iv.npy"), nmask)
    np.save(os.path.join(out_dir, "kmer.offsets.npy"), offsets)
    np.save(os.path.join(out_dir, "kmer.positions.npy"), positions)
    with open(os.path.join(out_dir, "contigs.json"), "w") as f:
        json.dump(contigs, f)

    meta = {
        "name": name,
        "W": int(W),
        "seqLen": int(seq_len),
        "nContigs": len(contigs),
        "packing": "2bit-4pb",
        "dtype_pos": np.dtype(pos_dtype).name,
        "nSeeds": int(positions.size),
        "source": os.path.abspath(fasta_path),
        "sha1": hasher.hexdigest(),
        "built": int(time.time()),
        "buildSeconds": round(time.time() - t0, 2),
    }
    # meta.json written LAST -- it is the "index complete" sentinel.
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump(meta, f)
    _progress(100)
    _msg("built index '%s': %d bp, %d seeds in %.1fs" %
         (name, seq_len, positions.size, time.time() - t0))
    return meta


def _runs(mask):
    """Return int64 (M,2) half-open [start,end) runs where mask is True."""
    if mask.size == 0 or not mask.any():
        return np.zeros((0, 2), dtype=np.int64)
    m = mask.astype(np.int8)
    d = np.diff(m)
    starts = list(np.nonzero(d == 1)[0] + 1)
    ends = list(np.nonzero(d == -1)[0] + 1)
    if m[0]:
        starts = [0] + starts
    if m[-1]:
        ends = ends + [m.size]
    return np.array(list(zip(starts, ends)), dtype=np.int64)


def _write_pack(path, codes):
    """Pack 2-bit codes (uint8 in 0..3), 4 bases/byte, into path."""
    n = codes.size
    pad = (-n) % 4
    if pad:
        codes = np.concatenate([codes, np.zeros(pad, dtype=np.uint8)])
    c = codes.reshape(-1, 4).astype(np.uint8)
    packed = (c[:, 0] << 6) | (c[:, 1] << 4) | (c[:, 2] << 2) | c[:, 3]
    packed.astype(np.uint8).tofile(path)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("fasta")
    ap.add_argument("index_root")
    ap.add_argument("name")
    ap.add_argument("--W", type=int, default=8)
    args = ap.parse_args(argv)
    build_index(args.fasta, args.index_root, args.name, W=args.W)


if __name__ == "__main__":
    main(sys.argv[1:])
