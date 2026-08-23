import json
import os
import re
from ion import works

# ---------------------------------------------------------------------------
# Read a VCF over a genomic region and return bigWig-like values so the client
# can build a track layer (same [pos, value] shape as view-bigwig.py).
#
# Each variant becomes a spike at its POS: [pos,0] -> [pos,val] -> [pos+1,val]
# -> [pos+1,0], where val is QUAL (or 1.0). Tabix-indexed remote .vcf.gz is
# queried with pysam when available; otherwise a plain .vcf is fetched and
# filtered by region.
#
# Params (after the EngineMonitor at param(0)):
#   param(1) : VCF url (.vcf or tabix-indexed .vcf.gz)
#   param(2) : chromosome
#   param(3) : region start (genomic, 0-based)
#   param(4) : region end (genomic)
# ---------------------------------------------------------------------------

url = works.param(1)
chrom = str(works.param(2) or "")
start = int(float(works.param(3) or 0))
end = int(float(works.param(4) or 0))

MAX_VARIANTS = 5000


def to_float(v, d=1.0):
    try:
        return float(v)
    except Exception:
        return d


def spikes(rows):
    """rows: list of (pos, val). Returns bigWig-like [pos,val] polygon points."""
    out = []
    for pos, val in rows:
        out.append([pos, 0.0])
        out.append([pos, val])
        out.append([pos + 1, val])
        out.append([pos + 1, 0.0])
    return out


def chrom_variants(name):
    """Yield (pos, qual) for the region, trying both chr-naming styles."""
    rows = []

    # 1) pysam tabix (works for remote tabix-indexed .vcf.gz)
    try:
        import pysam
        for cand in (name, name.replace("chr", ""), "chr" + name.replace("chr", "")):
            try:
                vf = pysam.VariantFile(url)
            except Exception:
                break
            try:
                for rec in vf.fetch(cand, max(0, start), end):
                    q = rec.qual if rec.qual is not None else 1.0
                    rows.append((int(rec.pos) - 1, to_float(q, 1.0)))  # VCF POS is 1-based
                    if len(rows) >= MAX_VARIANTS:
                        break
                if rows:
                    return rows
            except Exception:
                continue
        if rows:
            return rows
    except Exception:
        pass

    # 2) plain fetch + parse (uncompressed .vcf only)
    try:
        import requests
        r = requests.get(url, timeout=45)
        if r.status_code == 200 and "\x1f\x8b" not in r.text[:4]:
            want = {name, name.replace("chr", ""), "chr" + name.replace("chr", "")}
            for line in r.text.splitlines():
                if not line or line[0] == "#":
                    continue
                cols = line.split("\t")
                if len(cols) < 6:
                    continue
                if cols[0] not in want:
                    continue
                try:
                    pos = int(cols[1]) - 1
                except Exception:
                    continue
                if pos < start or pos > end:
                    continue
                rows.append((pos, to_float(cols[5], 1.0)))
                if len(rows) >= MAX_VARIANTS:
                    break
    except Exception:
        pass
    return rows


rows = chrom_variants(chrom)
works.progress(100)

works.resolve({
    "url": str(url or ""),
    "chr": chrom,
    "count": len(rows),
    "values": json.dumps(spikes(rows)),
})
