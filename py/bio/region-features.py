"""Which parts of a genomic window are coding, intronic, UTR, or pathogenic.

The karyotype holds millions of variants in the browser; shipping them here to be
annotated is not an option. So this answers the other way round: given a window,
it returns the FEATURE INTERVALS in it, and the client classifies its own variants
against them with a binary search. A window is a few intervals; a VCF is millions
of variants.

Intervals are merged and returned as flat [start, end, start, end, ...] arrays --
1-based, inclusive, the same convention as the GFF3 and the VCF they come from.

    cds         protein-coding sequence (GFF3 CDS)
    five_utr    5' UTR
    three_utr   3' UTR
    exon        every exon, coding or not
    gene        gene bodies; a variant inside one of these but outside `exon` is
                intronic, which is how the client works out "intronic" without a
                separate feature type existing in the file
    pathogenic  ClinVar positions whose CLNSIG says pathogenic or likely
                pathogenic, as a flat position list

Params (after the EngineMonitor):
    param(1) : chromosome, with or without the chr prefix
    param(2) : start (1-based, inclusive)
    param(3) : end   (1-based, inclusive)
    param(4) : optional comma list of what to return; default everything
    param(5) : optional species (default human)

Resolves:
    { ok, chr, start, end, cds, five_utr, three_utr, exon, gene, pathogenic,
      counts, truncated, error }
"""
import json
import os
import shutil
import subprocess

from ion import works

try:
    import pysam
except Exception:
    pysam = None

_TABIX = shutil.which("tabix") or ("/usr/bin/tabix" if os.path.exists("/usr/bin/tabix") else None)

GFF = {
    "human": "reference_data/human.gencode.annotation.gff3.bgz",
    "mouse": "reference_data/mouse.annotation.gff3.bgz",
    "rat": "reference_data/rat.annotation.gff3.bgz",
    "dog": "reference_data/dog.annotation.gff3.bgz",
    "yeast": "reference_data/yeast.annotation.gff3.bgz",
}
CLINVAR = "reference_data/variants/clinvar.vcf.gz"

# A whole chromosome IS a legitimate window: "show me protein coding across the
# genome" asks this once per chromosome. Measured on the box, chr1 end to end
# scans in 0.7s and merges to 21,690 CDS intervals -- about 0.35 MB -- because
# coding exons from every isoform collapse onto each other. So the ceiling is
# the longest chromosome plus room, not a selection-sized window.
MAX_SPAN = 300_000_000
MAX_INTERVALS = 400_000

WANTED_TYPES = {
    "CDS": "cds",
    "five_prime_UTR": "five_utr",
    "three_prime_UTR": "three_utr",
    "exon": "exon",
    "gene": "gene",
}

out = {"ok": False, "chr": "", "start": 0, "end": 0, "counts": "{}",
       "cds": "[]", "five_utr": "[]", "three_utr": "[]", "exon": "[]",
       "gene": "[]", "pathogenic": "[]", "truncated": False, "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def rows(path, contig, s1, e1):
    """Tabix a region, yielding split rows. pysam when it is there, the binary otherwise."""
    if pysam is not None:
        try:
            tb = pysam.TabixFile(path)
            for row in tb.fetch(contig, max(0, s1 - 1), e1):
                yield row.split("\t")
            return
        except Exception:
            pass
    if not _TABIX:
        return
    try:
        proc = subprocess.run([_TABIX, path, "%s:%d-%d" % (contig, max(1, s1), e1)],
                              capture_output=True, text=True, timeout=120)
        for line in proc.stdout.splitlines():
            if line and line[0] != "#":
                yield line.split("\t")
    except Exception:
        return


def contigs_of(path):
    if pysam is not None:
        try:
            return set(pysam.TabixFile(path).contigs)
        except Exception:
            pass
    if not _TABIX:
        return set()
    try:
        p = subprocess.run([_TABIX, "-l", path], capture_output=True, text=True, timeout=60)
        return set(x.strip() for x in p.stdout.splitlines() if x.strip())
    except Exception:
        return set()


def resolve_contig(names, want):
    want = str(want or "").strip()
    if not want:
        return ""
    bare = want[3:] if want.lower().startswith("chr") else want
    # The mitochondrion has as many names as there are annotators: chrM (UCSC), MT
    # (Ensembl vertebrates), Mito (Ensembl yeast).
    mito = bare.upper() in ("MT", "M", "MITO")
    for c in (want, "chr" + bare, bare,
              "chrM" if mito else "", "MT" if mito else "", "Mito" if mito else ""):
        if c and c in names:
            return c
    return ""


def merge(spans):
    """[(s,e), ...] -> flat [s,e,s,e,...], merged and sorted."""
    if not spans:
        return []
    spans.sort()
    flat = []
    cs, ce = spans[0]
    for s, e in spans[1:]:
        if s <= ce + 1:
            if e > ce:
                ce = e
        else:
            flat.extend((cs, ce))
            cs, ce = s, e
    flat.extend((cs, ce))
    return flat


chrom = str(works.param(1) or "").strip()
try:
    start = int(float(works.param(2) or 0))
    end = int(float(works.param(3) or 0))
except Exception:
    start = end = 0
# A COMMA LIST ARRIVES AS A LIST. works.arg() turns any parameter containing a comma into
# an array -- that is what it is for -- so "cds,exon" reaches this script as ['cds','exon'],
# and str() of that is "['cds', 'exon']", which splits into nothing that matches a feature
# name. Every multi-type request therefore came back with all counts zero and no error: the
# intronic filter asks for "gene,exon" and had been silently finding nothing at all.
_want_raw = works.param(4)
if isinstance(_want_raw, (list, tuple)):
    _want_raw = ",".join(str(x) for x in _want_raw)
want = str(_want_raw or "").strip().lower()
species = (str(works.param(5) or "human").strip().lower() or "human")
wanted = set(x.strip() for x in want.split(",") if x.strip()) if want else None

if not chrom or end < start or start < 1:
    out["error"] = "a chromosome and a 1-based start<=end are required"
elif species not in GFF:
    out["error"] = 'no annotation on this server for "%s"' % species
else:
    if end - start + 1 > MAX_SPAN:
        end = start + MAX_SPAN - 1
        out["truncated"] = True
    gff = first_existing(GFF[species])
    if not gff:
        out["error"] = "the %s annotation is not on this server" % species
    else:
        buckets = {v: [] for v in WANTED_TYPES.values()}
        contig = resolve_contig(contigs_of(gff), chrom)
        if not contig:
            out["error"] = '"%s" is not a contig in the %s annotation' % (chrom, species)
        else:
            n = 0
            for f in rows(gff, contig, start, end):
                if len(f) < 5:
                    continue
                key = WANTED_TYPES.get(f[2])
                if not key:
                    continue
                if wanted and key not in wanted:
                    continue
                try:
                    buckets[key].append((int(f[3]), int(f[4])))
                except ValueError:
                    continue
                n += 1
                if n > MAX_INTERVALS:
                    out["truncated"] = True
                    break
            counts = {}
            for k, v in buckets.items():
                flat = merge(v)
                out[k] = json.dumps(flat)
                counts[k] = len(flat) // 2

            # ClinVar, only when asked for it: a separate file and a separate cost.
            if (wanted is None) or ("pathogenic" in wanted):
                cv = first_existing(CLINVAR)
                if cv:
                    cvc = resolve_contig(contigs_of(cv), chrom)
                    hits = []
                    if cvc:
                        for f in rows(cv, cvc, start, end):
                            if len(f) < 8:
                                continue
                            info = f[7]
                            i = info.find("CLNSIG=")
                            if i < 0:
                                continue
                            sig = info[i + 7:].split(";")[0].lower()
                            # "Pathogenic", "Likely_pathogenic",
                            # "Pathogenic/Likely_pathogenic" all count; a conflicting
                            # call does not, and neither does "non_pathogenic".
                            if "conflict" in sig or "non_pathogenic" in sig:
                                continue
                            if "pathogenic" in sig:
                                try:
                                    hits.append(int(f[1]))
                                except ValueError:
                                    pass
                            if len(hits) > MAX_INTERVALS:
                                out["truncated"] = True
                                break
                    hits.sort()
                    out["pathogenic"] = json.dumps(hits)
                    counts["pathogenic"] = len(hits)

            out["ok"] = True
            out["chr"] = contig
            out["start"] = start
            out["end"] = end
            out["counts"] = json.dumps(counts)
            works.msg("%s:%d-%d %s" % (contig, start, end, json.dumps(counts)))

works.resolve(out)
