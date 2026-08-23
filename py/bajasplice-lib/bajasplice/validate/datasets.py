"""Loaders for the external datasets the validation suite compares against."""
from __future__ import annotations

import gzip
import os
import re
from pathlib import Path

import numpy as np
import pandas as pd

from bajasplice.config import paths, MAIN_CHROMS

_SPLICE = re.compile(r"splice_(donor|acceptor)_variant")
_PATH = {"Pathogenic", "Likely_pathogenic", "Pathogenic/Likely_pathogenic"}
_BENIGN = {"Benign", "Likely_benign", "Benign/Likely_benign"}


def clinvar_path():
    p = os.environ.get("BAJASPLICE_CLINVAR")
    if p:
        return Path(p)
    for cand in (paths().raw / "clinvar" / "clinvar.vcf.gz",
                 Path.home() / "ml" / "rna_binding" / "clinvar.vcf.gz"):
        if cand.exists():
            return cand
    return None


def load_clinvar(max_per_class=1500, seed=0):
    """ClinVar substitutions in three classes.

        pathogenic_splice   pathogenic, annotated as a splice donor/acceptor variant
        benign_splice       benign, same consequence annotation
        benign_missense     benign, missense, away from splice sites

    The three exist because two different questions get conflated. Comparing
    pathogenic splice variants against benign MISSENSE ones asks whether the
    model detects splicing disruption, which is its job. Comparing them against
    benign SPLICE variants asks whether a disrupted splice site is clinically
    pathogenic, which depends on the gene and the transcript and is not
    something a sequence model of splicing can know.
    """
    p = clinvar_path()
    if p is None or not p.exists():
        return None
    rows = []
    with gzip.open(p, "rt") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 8:
                continue
            chrom, pos, _, ref, alt = f[0], f[1], f[2], f[3], f[4]
            if len(ref) != 1 or len(alt) != 1 or ref == alt:
                continue                       # substitutions only
            c = "chr" + chrom
            if c not in MAIN_CHROMS:
                continue
            info = f[7]
            if "MC=" not in info or "CLNSIG=" not in info:
                continue
            mc = info.split("MC=", 1)[1].split(";", 1)[0]
            sig = info.split("CLNSIG=", 1)[1].split(";", 1)[0]
            spl = bool(_SPLICE.search(mc))
            if sig in _PATH and spl:
                cls = "pathogenic_splice"
            elif sig in _BENIGN and spl:
                cls = "benign_splice"
            elif sig in _BENIGN and not spl and "missense" in mc:
                cls = "benign_missense"
            else:
                continue
            rows.append((c, int(pos), ref, alt, cls))
    df = pd.DataFrame(rows, columns=["chrom", "pos", "ref", "alt", "cls"])
    if df.empty:
        return df
    rng = np.random.default_rng(seed)
    out = []
    for cls, grp in df.groupby("cls"):
        if len(grp) > max_per_class:
            grp = grp.iloc[rng.choice(len(grp), max_per_class, replace=False)]
        out.append(grp)
    return pd.concat(out, ignore_index=True)


def load_gtex_junctions():
    """GTEx junction coordinates, including junctions absent from annotation."""
    p = paths().interim / "junctions.tsv"
    if not p.exists():
        return None
    return pd.read_csv(p, sep="\t", usecols=["chrom", "start", "end"])


def load_vastdb_comparison():
    p = paths().interim / "gtex_vs_vastdb.tsv"
    return pd.read_csv(p, sep="\t") if p.exists() else None


def load_cryptic_sites():
    p = paths().interim / "cryptic_sites_with_usage.tsv"
    return pd.read_csv(p, sep="\t") if p.exists() else None
