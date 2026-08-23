"""Genome sequence access and one-hot encoding.

Sequences are returned in transcript orientation: a minus-strand request is
reverse-complemented, so downstream code never has to think about strand again
beyond choosing the right coordinate.
"""
from __future__ import annotations

import numpy as np
from pyfaidx import Fasta

from bajasplice.config import paths, split_of, TEST_CHROMS, VAL_CHROMS, MAIN_CHROMS

__all__ = ["GenomeReader", "one_hot", "codes_to_str", "split_of",
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
