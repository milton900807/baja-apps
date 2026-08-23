"""Flatten a GENCODE GTF into a compact exon table.

Pure Python so the package has no awk/zcat dependency, streaming so a 4 GB GTF
never lands in memory.
"""
from __future__ import annotations

import gzip
import re
from pathlib import Path

import pandas as pd

from bajasplice.config import paths

_ATTR = {
    "gene_id": re.compile(r'gene_id "([^"]+)"'),
    "transcript_id": re.compile(r'transcript_id "([^"]+)"'),
    "gene_name": re.compile(r'gene_name "([^"]+)"'),
    "gene_type": re.compile(r'gene_type "([^"]+)"'),
    "transcript_type": re.compile(r'transcript_type "([^"]+)"'),
    "exon_number": re.compile(r'exon_number (\d+)'),
    "tsl": re.compile(r'transcript_support_level "([^"]+)"'),
}
COLUMNS = ["chrom", "start", "end", "strand", "gene_id", "transcript_id", "gene_name",
           "gene_type", "transcript_type", "exon_number", "mane", "basic", "tsl"]


def _open(path):
    path = str(path)
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path, "rt")


def parse_exons(gtf, out_tsv=None, feature="exon"):
    """Write one row per exon record. Returns the output path."""
    gtf = Path(gtf)
    out_tsv = Path(out_tsv) if out_tsv else paths().interim / "exons.tsv"
    out_tsv.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with _open(gtf) as fh, open(out_tsv, "w") as out:
        out.write("\t".join(COLUMNS) + "\n")
        for line in fh:
            if line.startswith("#"):
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) != 9 or f[2] != feature:
                continue
            a = f[8]
            vals = []
            for key in ("gene_id", "transcript_id", "gene_name", "gene_type",
                        "transcript_type", "exon_number"):
                m = _ATTR[key].search(a)
                vals.append(m.group(1) if m else "")
            tsl = _ATTR["tsl"].search(a)
            out.write("\t".join([f[0], f[3], f[4], f[6], *vals,
                                 "1" if 'tag "MANE_Select"' in a else "0",
                                 "1" if 'tag "basic"' in a else "0",
                                 tsl.group(1) if tsl else "NA"]) + "\n")
            n += 1
    return out_tsv, n


def load_exons(path=None, main_only=True, **kw):
    """Read the flattened exon table."""
    path = Path(path) if path else paths().interim / "exons.tsv"
    df = pd.read_csv(path, sep="\t", low_memory=False, **kw)
    if main_only:
        from bajasplice.config import MAIN_CHROMS
        df = df[df.chrom.isin(MAIN_CHROMS)]
    return df
