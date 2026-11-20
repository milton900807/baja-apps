"""Exon inclusion someone actually measured, for the exons a model cannot get right.

A SEPARATE QUANTITY, not a correction. untrusted.py explains why PSI at a
duplicated locus cannot be predicted: the training label is a blend of two
genes' reads, and withholding it is the most an inference-time fix can do. This
is the other half -- where a published measurement exists, show that instead,
labelled as a measurement, with its spread and its citation.

Three things are deliberately kept apart, and the UI keeps them apart too:

    measured    a number from an assay, with a range and a source
    predicted   what the model says, which at these loci is a memory of a blend
    untrusted   neither available: say so and show nothing

What this is NOT is a lookup table that quietly overwrites predictions to make
them look better. A row applies to one exon start, is shown as measured, and
carries the citation; a reader who disagrees with the figure can see where it
came from and drop the row. Adding an uncited row would be worse than adding
none, because it would look like evidence.

The values are not constants. SMN2 exon 7 inclusion depends on cell type, SMN2
copy number and whether the assay reads an endogenous gene or a reporter, which
is why psi_lo/psi_hi travel with psi and why the editor says "about 10%" rather
than 10.2%.
"""
from __future__ import annotations

import os
from pathlib import Path

_CACHE = {}


def table_path(path=None):
    """Explicit arg > BAJASPLICE_MEASURED_PSI > config > the packaged table."""
    if path:
        return str(path) if os.path.isfile(str(path)) else None
    env = os.environ.get("BAJASPLICE_MEASURED_PSI")
    if env and os.path.isfile(env):
        return env
    try:
        from .config import paths
        p = getattr(paths(), "measured_psi", None)
        if p and os.path.isfile(str(p)):
            return str(p)
    except Exception:
        pass
    p = Path(__file__).parent / "data" / "measured_psi.tsv"
    return str(p) if p.is_file() else None


def _f(v, default=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def load(path=None):
    """Rows keyed by (chrom, exon_start). Empty dict when there is no table."""
    p = table_path(path)
    if not p:
        return {}
    key = (p, os.path.getmtime(p))
    if key in _CACHE:
        return _CACHE[key]
    out = {}
    with open(p) as fh:
        for line in fh:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 6:
                continue
            try:
                chrom, start = f[1].strip(), int(f[2])
            except ValueError:
                continue                        # a header row
            psi = _f(f[5])
            if psi is None:
                continue
            out[(_norm(chrom), start)] = {
                "gene": f[0].strip(),
                "strand": f[3].strip() if len(f) > 3 else "",
                "exon": f[4].strip() if len(f) > 4 else "",
                "psi": psi,
                "lo": _f(f[6]) if len(f) > 6 else None,
                "hi": _f(f[7]) if len(f) > 7 else None,
                "assay": f[8].strip() if len(f) > 8 else "",
                "source": f[9].strip() if len(f) > 9 else "",
            }
    _CACHE.clear()
    _CACHE[key] = out
    return out


def _norm(chrom):
    c = str(chrom).strip()
    if c.lower().startswith("chr"):
        c = c[3:]
    return "chr" + c.upper() if c.upper() in ("X", "Y", "M", "MT") else "chr" + c


def for_exons(chrom, exons, path=None):
    """Measured values for whichever of `exons` ([lo, hi] pairs) have one.

    A row matches when its exon start falls INSIDE the annotated exon, so the
    table needs no exon length -- see the note at the top of measured_psi.tsv.
    """
    rows = load(path)
    if not rows:
        return []
    c = _norm(chrom)
    mine = [(s, r) for (rc, s), r in rows.items() if rc == c]
    if not mine:
        return []
    out = []
    for e in exons or ():
        try:
            lo, hi = int(e[0]), int(e[1])
        except Exception:
            continue
        if lo > hi:
            lo, hi = hi, lo
        for s, r in mine:
            if lo <= s <= hi:
                d = {"xi": lo, "xf": hi}
                d.update(r)
                out.append(d)
                break
    return out
