"""Genome sequence access and one-hot encoding.

Sequences are returned in transcript orientation: a minus-strand request is
reverse-complemented, so downstream code never has to think about strand again
beyond choosing the right coordinate.
"""
from __future__ import annotations

import numpy as np
from pyfaidx import Fasta

from bajasplice.config import (paths, split_of, species, SPECIES,
                              TEST_CHROMS, VAL_CHROMS, MAIN_CHROMS)

__all__ = ["GenomeReader", "one_hot", "codes_to_str", "str_to_codes", "split_of",
           "check_assembly",
           "TEST_CHROMS", "VAL_CHROMS", "MAIN_CHROMS"]

_BASE = np.zeros(256, dtype=np.int8)
for _i, _b in enumerate("ACGT"):
    _BASE[ord(_b)] = _i + 1
    _BASE[ord(_b.lower())] = _i + 1

_COMP = np.arange(5, dtype=np.int8)
_COMP[1:] = [4, 3, 2, 1]        # A<->T, C<->G

_ALPHABET = "NACGT"


def codes_to_str(codes) -> str:
    """Integer codes back to a sequence string (0 -> N)."""
    return "".join(_ALPHABET[int(c)] for c in codes)


def str_to_codes(seq, strand="+"):
    """Sequence string to integer codes, the inverse of codes_to_str.

    Anything outside ACGT (including U and N) becomes 0, which one_hot maps to
    an all-zero column, so a track carrying RNA or masked bases is accepted
    rather than rejected. `strand="-"` reverse-complements, matching
    GenomeReader.codes so a caller can hand either source to the same model.
    """
    raw = str(seq).replace("U", "T").replace("u", "t").encode()
    out = _BASE[np.frombuffer(raw, dtype=np.uint8)].copy()
    if strand == "-":
        out = _COMP[out[::-1]]
    return out


def check_assembly(contigs, path="the genome FASTA"):
    """Refuse a FASTA that belongs to the other species.

    THE WRONG GENOME DOES NOT FAIL, IT ANSWERS. Mouse coordinates exist in a
    human FASTA, the bases come back, and the model scores them. The karyotype
    is the cheap tell: mouse has no chr20-22, and a human assembly that carries
    chr19 always carries them. A reduced FASTA (one chromosome, a test fixture)
    passes, because it is not evidence either way.
    """
    contigs = set(contigs)
    sp = species()
    if contigs and not (contigs & set(sp.main_chroms)):
        # NOT ONE CHROMOSOME OF THIS SPECIES IS IN THE FILE. Either it is
        # another organism or the same one under another naming (UCSC chr2L
        # against Ensembl 2L), and every lookup would miss or read padding.
        raise ValueError(
            f"{path} has none of the {sp.label} chromosomes this build expects "
            f"({', '.join(sorted(sp.main_chroms)[:4])}, ...); it has "
            f"{', '.join(sorted(contigs)[:4])}, ... Point `{sp.command} config "
            f"--genome-fasta` at a {sp.assembly} FASTA named the way the annotation is.")
    if sp.absent_chroms and any(c in contigs for c in sp.absent_chroms):
        raise ValueError(
            f"{path} has {', '.join(c for c in sp.absent_chroms if c in contigs)}, which "
            f"{sp.label} ({sp.assembly}) does not. This looks like another species' genome. "
            f"Point `{sp.command} config --genome-fasta` at a {sp.assembly} FASTA.")
    for other in SPECIES.values():
        if other.key == sp.key or not other.absent_chroms:
            continue
        if "chr19" in contigs and not any(c in contigs for c in other.absent_chroms):
            raise ValueError(
                f"{path} has chr19 but none of {', '.join(other.absent_chroms)}, which is the "
                f"{other.label} karyotype, and this process is running as {sp.label}. "
                f"Use `{other.command}` for {other.assembly}, or point "
                f"`{sp.command} config --genome-fasta` at a {sp.assembly} FASTA.")


class GenomeReader:
    """Thread/process-local FASTA handle.

    Returns integer-encoded sequence (0 = N or pad, 1..4 = A,C,G,T). The handle
    is opened lazily so instances can be created in a parent process and used
    inside DataLoader workers.
    """

    def __init__(self, path=None):
        self.path = str(path) if path else None
        self._fa = None

    @property
    def fa(self):
        if self._fa is None:
            p = self.path or str(paths().require("genome_fasta"))
            self._fa = Fasta(p, as_raw=True, sequence_always_upper=True)
            check_assembly(self._fa.keys(), p)
        return self._fa

    def codes(self, chrom, start, end, strand="+"):
        """1-based inclusive [start, end]; out-of-bounds is zero-padded."""
        n = end - start + 1
        out = np.zeros(n, dtype=np.int8)
        clen = len(self.fa[chrom])
        s = max(1, start)
        e = min(clen, end)
        if e >= s:
            raw = self.fa[chrom][s - 1:e]
            arr = _BASE[np.frombuffer(raw.encode(), dtype=np.uint8)]
            out[s - start:s - start + len(arr)] = arr
        if strand == "-":
            out = _COMP[out[::-1]]
        return out

    def sequence(self, chrom, start, end, strand="+") -> str:
        return codes_to_str(self.codes(chrom, start, end, strand))


def one_hot(codes):
    """(..., L) integer codes -> (..., 4, L) float32. N maps to an all-zero column."""
    codes = np.asarray(codes)
    oh = np.zeros(codes.shape + (5,), dtype=np.float32)
    np.put_along_axis(oh, codes[..., None].astype(np.int64), 1.0, axis=-1)
    oh = oh[..., 1:]
    return np.moveaxis(oh, -1, -2)
