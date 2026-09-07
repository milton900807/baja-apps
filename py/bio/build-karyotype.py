"""Build the karyotype tables the chromosome view draws from. OFFLINE BUILDER.

    python3 py/bio/build-karyotype.py <download-dir> <out-dir>

The chromosome view needs two things per species and neither is derivable from the
annotation we already hold: how long each chromosome is, and where its bands are. Both come
from UCSC, which publishes them per assembly as two small tables:

    chromInfo.txt.gz     chromosome -> length
    cytoBand.txt.gz      chromosome, start, end, band name, Giemsa stain

Together they are a few kilobytes per species, so they are built into a JSON file and
shipped, rather than fetched at draw time. A view that cannot draw a chromosome without
reaching a third party is a view that does not work on a plane.

ONLY THE PRIMARY CONTIGS. An assembly's chromInfo lists every scaffold, patch and alt --
hg38 has hundreds -- and a karyotype of chr1 through chrY plus 400 unplaced scaffolds is not
a karyotype. chr1..chrN, X, Y and M, in that order.

The centromere comes from the acen-stained bands where the assembly marks them, and is left
null where it does not: drawing a pinch at a guessed position would put a landmark on the
picture that the data does not support.

Assemblies, matched to the annotations this server already carries:
    human  hg38     mouse  mm39     rat  rn7     dog  canFam6
"""
import gzip
import json
import os
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "reference_data/karyotype"

SPECIES = [
    ("human", "hg38"),
    ("mouse", "mm39"),
    ("rat", "rn7"),
    ("dog", "canFam6"),
]

PRIMARY = re.compile(r"^chr(\d+|X|Y|M)$")


def read_gz(path):
    if not os.path.exists(path):
        return []
    with gzip.open(path, "rt") as fh:
        return [ln.rstrip("\n").split("\t") for ln in fh if ln.strip()]


def sort_key(name):
    """chr1 < chr2 < ... < chr22 < chrX < chrY < chrM, numerically not lexically."""
    tail = name[3:]
    if tail.isdigit():
        return (0, int(tail), "")
    return (1, {"X": 0, "Y": 1, "M": 2}.get(tail, 3), tail)


os.makedirs(OUT, exist_ok=True)
built = []

for species, asm in SPECIES:
    sizes = {}
    for row in read_gz(os.path.join(SRC, "chromInfo.%s.txt.gz" % asm)):
        if len(row) >= 2 and PRIMARY.match(row[0]):
            try:
                sizes[row[0]] = int(row[1])
            except Exception:
                pass
    if not sizes:
        print("  %-6s no chromInfo -- skipped" % species)
        continue

    bands = {}
    for name in ("cytoBand.%s.txt.gz" % asm, "cytoBandIdeo.%s.txt.gz" % asm):
        for row in read_gz(os.path.join(SRC, name)):
            if len(row) < 5 or not PRIMARY.match(row[0]):
                continue
            try:
                bands.setdefault(row[0], []).append(
                    {"start": int(row[1]), "end": int(row[2]), "name": row[3], "stain": row[4]})
            except Exception:
                pass
        if bands:
            break

    chroms = []
    for name in sorted(sizes, key=sort_key):
        bs = sorted(bands.get(name, []), key=lambda b: b["start"])
        acen = [b for b in bs if b["stain"] == "acen"]
        cen = None
        if acen:
            cen = {"start": min(b["start"] for b in acen), "end": max(b["end"] for b in acen)}
        chroms.append({"name": name, "length": sizes[name], "centromere": cen, "bands": bs})

    doc = {"species": species, "assembly": asm, "source": "UCSC chromInfo + cytoBand",
           "chromosomes": chroms}
    path = os.path.join(OUT, "%s.json" % species)
    with open(path, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    banded = sum(1 for c in chroms if c["bands"])
    built.append(path)
    print("  %-6s %-8s %2d chromosomes, %d with bands, %d with a centromere -> %s (%.0f kB)"
          % (species, asm, len(chroms), banded,
             sum(1 for c in chroms if c["centromere"]), path, os.path.getsize(path) / 1e3))

print("built %d file(s)" % len(built))
