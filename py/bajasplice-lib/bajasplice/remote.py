"""Reference sequence without a local FASTA.

`GenomeReader` needs a genome FASTA, which is a ~3 GB download and a
`bajasplice config --genome-fasta` away. Everything in this package that scores
a region needs only a few kilobases of that file, so for interactive work --
scoring one exon, profiling one site -- the download is the entire barrier to
entry.

`EnsemblReader` implements the same `.codes()` contract against the Ensembl
REST API, caching each fetched span on disk. It is deliberately NOT a
replacement for the FASTA: training and any whole-genome sweep must use the
local file, both for speed and because a public API is not a reproducible
sequence source. What it is for is the single-locus case.

Two things worth knowing about it:

**The assembly must match.** The bundled checkpoints were trained on GRCh38.
Ensembl's default REST endpoint serves the current assembly, which is GRCh38
today and will not be forever. The assembly actually used is recorded on the
reader and in any payload built from it, so a score can be traced to the
sequence it came from rather than assumed.

**Coordinates are 1-based inclusive and out-of-bounds is zero-padded**, exactly
as for `GenomeReader`, so a window running off the end of a chromosome reads as
absent rather than silently shifting.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

from bajasplice.genome import GenomeReader, _BASE, _COMP, codes_to_str

__all__ = ["EnsemblReader", "open_genome", "have_local_fasta"]

_SERVER = "https://rest.ensembl.org"
_SPECIES = "homo_sapiens"
# one request per block, so repeated nearby queries reuse a cached span instead
# of issuing a fetch per window
_BLOCK = 100_000
_MAX_TRIES = 5


def have_local_fasta() -> bool:
    """Whether a usable genome FASTA is configured."""
    try:
        from bajasplice.config import paths
        p = paths().genome_fasta
        return bool(p) and Path(p).exists()
    except Exception:
        return False


class EnsemblReader:
    """GenomeReader's `.codes()` contract, served from Ensembl REST + disk cache.

    The cache is keyed by (assembly, chrom, block) and holds plain sequence
    text, so it is inspectable and survives across processes.
    """

    def __init__(self, cache_dir=None, server=_SERVER, species=_SPECIES,
                 assembly=None, timeout=60, block=_BLOCK):
        self.server = server.rstrip("/")
        self.species = species
        self.timeout = timeout
        self.block = int(block)
        self._assembly = assembly
        self._mem = {}
        if cache_dir is None:
            cache_dir = os.environ.get("BAJASPLICE_SEQ_CACHE") or (
                Path(os.path.expanduser("~")) / ".cache" / "bajasplice" / "seq")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    # -- assembly ---------------------------------------------------------
    @property
    def assembly(self) -> str:
        """Assembly name the server is serving, fetched once.

        Not assumed: a score is only interpretable against a known assembly,
        and the bundled weights are GRCh38.
        """
        if self._assembly is None:
            try:
                info = self._get_json(f"/info/assembly/{self.species}?")
                self._assembly = str(info.get("assembly_name") or "unknown")
            except Exception:
                self._assembly = "unknown"
        return self._assembly

    # -- fetching ---------------------------------------------------------
    def _request(self, url, headers):
        last = None
        for attempt in range(_MAX_TRIES):
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return r.read().decode()
            except urllib.error.HTTPError as e:
                last = e
                # 400 is a bad request: a wrong chromosome name or a span past
                # the end. Retrying cannot fix it, and the message says which.
                if e.code == 400:
                    raise RuntimeError(
                        f"Ensembl rejected {url}: {e.read().decode()[:200]}") from e
                time.sleep(3 * (attempt + 1))
            except (urllib.error.URLError, TimeoutError) as e:
                last = e
                time.sleep(3 * (attempt + 1))
        raise RuntimeError(f"Ensembl unreachable after {_MAX_TRIES} tries: {last}")

    def _get_json(self, path):
        return json.loads(self._request(self.server + path,
                                       {"Content-Type": "application/json"}))

    def _fetch_block(self, chrom, bi):
        """Sequence for one cache block, 1-based inclusive."""
        lo = bi * self.block + 1
        hi = lo + self.block - 1
        name = chrom[3:] if chrom.startswith("chr") else chrom
        key = f"{self.assembly}_{chrom}_{bi}.txt"
        f = self.cache_dir / key
        if f.exists():
            return f.read_text().strip()
        url = (f"{self.server}/sequence/region/{self.species}/"
               f"{name}:{lo}..{hi}:1?content-type=text/plain")
        seq = self._request(url, {"Content-Type": "text/plain"}).strip().upper()
        tmp = f.with_suffix(".part")
        tmp.write_text(seq)
        tmp.replace(f)
        return seq

    def _block(self, chrom, bi):
        k = (chrom, bi)
        if k not in self._mem:
            self._mem[k] = self._fetch_block(chrom, bi)
        return self._mem[k]

    # -- GenomeReader contract -------------------------------------------
    def codes(self, chrom, start, end, strand="+"):
        """1-based inclusive [start, end]; out-of-bounds is zero-padded."""
        n = end - start + 1
        out = np.zeros(n, dtype=np.int8)
        if n <= 0:
            return out
        first = max(0, (start - 1) // self.block)
        last = (end - 1) // self.block
        for bi in range(first, last + 1):
            seq = self._block(chrom, bi)
            blo = bi * self.block + 1           # 1-based position of seq[0]
            s = max(start, blo)
            e = min(end, blo + len(seq) - 1)
            if e < s:
                continue
            chunk = seq[s - blo:e - blo + 1]
            arr = _BASE[np.frombuffer(chunk.encode(), dtype=np.uint8)]
            out[s - start:s - start + len(arr)] = arr
        if strand == "-":
            out = _COMP[out[::-1]]
        return out

    def sequence(self, chrom, start, end, strand="+") -> str:
        return codes_to_str(self.codes(chrom, start, end, strand))

    def describe(self) -> dict:
        return {"source": "ensembl-rest", "server": self.server,
                "species": self.species, "assembly": self.assembly,
                "cache": str(self.cache_dir)}


def open_genome(prefer_remote=False, cache_dir=None):
    """A sequence reader, local FASTA first.

    Returns (reader, description). The description goes into payload meta so a
    result records which sequence source produced it -- a local GRCh38 FASTA
    and a live API are not interchangeable provenance.
    """
    if not prefer_remote and have_local_fasta():
        from bajasplice.config import paths
        return GenomeReader(), {"source": "local-fasta",
                                "path": str(paths().genome_fasta)}
    r = EnsemblReader(cache_dir=cache_dir)
    return r, r.describe()
