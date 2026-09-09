"""Where the patented sequences are, as a density across the genome.

The patent hits are keyed by TRANSCRIPT with transcript-relative coordinates -- that is the
form the editor needs, because it draws them as a layer on a loaded transcript. A karyotype
asks a different question: not "where in this transcript" but "where in the genome", and for
that every hit has to be carried back to a locus.

So this counts the hits per transcript, looks each transcript's genomic span up in the same
GENCODE annotation the rest of the server reads, and bins the counts along each chromosome.
The bins are a FIXED WIDTH IN BASES, not a fraction of the chromosome, so the client places
them by coordinate and nothing depends on the two sides agreeing about chromosome lengths.

A hit is placed at its transcript's midpoint rather than at its true base. Mapping a
transcript offset through the exons would put it exactly, and at 100 kb a bin it would not
move a single hit into a different one for any transcript shorter than the bin -- which is
almost all of them. The few that are longer are spread over a couple of bins at most, and
saying so here is cheaper than a mapping that costs a genome of exon arithmetic to be
invisible at this scale.

TWENTY-ONE MILLION ROWS, so the answer is cached: the first call takes about half a minute
and writes the summary beside the annotation; every call after it reads that. Delete the
file to rebuild.

Params (after the EngineMonitor):
    param(1) : optional dataset key -- 'patent' (default) or 'lipid_patents'
    param(2) : optional species (default human)
    param(3) : optional bin width in bases (default 100000)

Resolves:
    { ok, bin, hits, transcripts, unplaced, chroms, built, error }
  chroms is a JSON object { "chr1": {"i": [...bin indexes...], "n": [...counts...]}, ... }
"""
import gzip
import json
import os

from ion import works

GFF = {
    "human": "reference_data/human.gencode.annotation.gff3.bgz",
    "mouse": "reference_data/mouse.annotation.gff3.bgz",
}
# The hit files live beside the other big-data BEDs the editor reads.
BED_DIRS = ["/home/ubuntu/baja-bd", "bd", "../baja-bd"]
BEDS = {
    # The ASO/siRNA set is the default: its column 4 carries a REAL patent number, so a
    # click on the strip can say which patents are there. The 2020-2025 index is larger but
    # its column 4 is a sequential record id and nothing on disk maps it to a patent -- a
    # density drawn from it can only ever be a shape, never a list.
    "aso_sirna_gt": "aso_sirna_gt_hg38_transcript_hits.bed.gz",
    "patent": "patent_hg38_transcript_hits.bed.gz",
    "lipid_patents": "lipid_patents_hg38_transcript_hits.bed.gz",
}

key = (str(works.param(1) or "aso_sirna_gt").strip() or "aso_sirna_gt")
species = (str(works.param(2) or "human").strip().lower() or "human")
try:
    BIN = int(float(works.param(3) or 100000))
except Exception:
    BIN = 100000
BIN = max(1000, min(10000000, BIN))

out = {"ok": False, "bin": BIN, "hits": 0, "transcripts": 0, "unplaced": 0,
       "chroms": "{}", "built": False, "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def find_bed(name):
    for d in BED_DIRS:
        p = os.path.join(d, name) if os.path.isabs(d) else first_existing(os.path.join(d, name))
        if p and os.path.exists(p):
            return p
        if os.path.exists(os.path.join(d, name)):
            return os.path.join(d, name)
    return ""


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def build(bed_path, gff_path):
    """Count per transcript, then carry each count to its locus."""
    works.msg("Counting patent hits (first time only)…")
    per_tx = {}
    n_rows = 0
    with gzip.open(bed_path, "rt") as fh:
        for line in fh:
            i = line.find("\t")
            if i <= 0:
                continue
            t = line[:i]
            per_tx[t] = per_tx.get(t, 0) + 1
            n_rows += 1
            if (n_rows % 4000000) == 0:
                works.msg("Counting patent hits — %d million…" % (n_rows // 1000000))
    works.msg("%d hits across %d transcripts. Placing them…" % (n_rows, len(per_tx)))

    # Both the versioned id and the bare one, because the BED and the annotation do not
    # always agree about the version suffix.
    bare = {}
    for t, n in per_tx.items():
        b = t.split(".")[0]
        bare[b] = bare.get(b, 0) + n

    chroms = {}
    placed = 0
    seen = set()
    opener = gzip.open if gff_path.endswith((".gz", ".bgz")) else open
    with opener(gff_path, "rt") as fh:
        for line in fh:
            if not line or line[0] == "#":
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 9 or f[2] != "transcript":
                continue
            a = attrs(f[8])
            tid = a.get("transcript_id") or ""
            if not tid:
                continue
            n = per_tx.get(tid)
            if n is None:
                n = bare.get(tid.split(".")[0])
                if n is None:
                    continue
                tid = tid.split(".")[0]
            if tid in seen:
                continue
            seen.add(tid)
            try:
                mid = (int(f[3]) + int(f[4])) // 2
            except Exception:
                continue
            c = f[0]
            b = mid // BIN
            d = chroms.setdefault(c, {})
            d[b] = d.get(b, 0) + n
            placed += n

    packed = {}
    for c, d in chroms.items():
        ks = sorted(d.keys())
        packed[c] = {"i": ks, "n": [d[k] for k in ks]}
    return {"bin": BIN, "hits": n_rows, "transcripts": len(per_tx),
            "unplaced": max(0, n_rows - placed), "chroms": packed}


gff = first_existing(GFF.get(species) or GFF["human"])
bed = find_bed(BEDS.get(key) or BEDS["aso_sirna_gt"])
cache = os.path.join(os.path.dirname(gff) or ".",
                     "%s.%s.density.%d.json" % (species, key, BIN)) if gff else ""

if not bed:
    out["error"] = "the %s hit file is not on this server" % key
elif not gff or not os.path.exists(gff):
    out["error"] = "the %s annotation is not on this server" % species
else:
    data = None
    try:
        if cache and os.path.exists(cache) and os.path.getsize(cache) > 64:
            with open(cache, "r") as fh:
                data = json.load(fh)
    except Exception:
        data = None
    if data is None:
        try:
            data = build(bed, gff)
            out["built"] = True
            # Written through a temporary name so a reader racing the build sees either no
            # cache or a complete one, never half a file.
            tmp = cache + ".partial-%d" % os.getpid()
            with open(tmp, "w") as fh:
                json.dump(data, fh)
            os.replace(tmp, cache)
        except Exception as e:
            out["error"] = "could not build the %s density: %s" % (key, e)
    if data is not None and not out["error"]:
        out["ok"] = True
        out["bin"] = data.get("bin", BIN)
        out["hits"] = data.get("hits", 0)
        out["transcripts"] = data.get("transcripts", 0)
        out["unplaced"] = data.get("unplaced", 0)
        out["chroms"] = json.dumps(data.get("chroms", {}))
        works.msg("%s: %d hits over %d transcripts" %
                  (key, out["hits"], out["transcripts"]))

works.resolve(out)
