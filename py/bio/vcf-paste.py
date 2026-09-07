"""Pasted VCF text -> which genes it lands in, and which transcript to load for each.

A VCF is a machine format with exact coordinates, so nothing here is asked of a model. The
records are parsed as written and the gene each one falls in is read off GENCODE by position,
using the same tabix-indexed annotation the rest of the server uses. A variant's gene is a
fact about where it sits, not a judgement.

The transcript offered per gene is its MANE Select, or failing that its Ensembl canonical,
or failing that the longest -- in that order, because that is the order of how much anyone
should trust it.

Coordinates are taken from the file rather than from an ANN=/CSQ= field an annotator wrote
earlier: those carry the gene the annotator's build thought was there, and a VCF that has
travelled between assemblies is exactly the case where the two disagree.

Params (after the EngineMonitor):
    param(1) : the pasted VCF text
    param(2) : optional species (default human)

Resolves:
    { ok, count, skipped, unplaced, genes, note, error }
  where genes is a JSON array:
    [{gene, transcript, chr, strand, variants: [{pos, id, ref, alt, qual, filter, info}]}]
"""
import os
import json
import re
import shutil
import subprocess

from ion import works

try:
    import pysam
except Exception:
    pysam = None

_TABIX_BIN = shutil.which("tabix") or ("/usr/bin/tabix" if os.path.exists("/usr/bin/tabix") else None)

GFF = {
    "human": "reference_data/human.gencode.annotation.gff3.bgz",
    "mouse": "reference_data/mouse.annotation.gff3.bgz",
    "rat": "reference_data/rat.annotation.gff3.bgz",
    "dog": "reference_data/dog.annotation.gff3.bgz",
    "yeast": "reference_data/yeast.annotation.gff3.bgz",
}

MAX_VARIANTS = 2000      # a pasted VCF, not a whole callset
MAX_GENES = 25           # loading a transcript each; past this it is not a board any more
MAX_ALLELE = 50          # matches read-vcf-variants.py: bigger is structural

text = str(works.param(1) or "")
species = (str(works.param(2) or "human") or "human").strip().lower()

out = {"ok": False, "count": 0, "skipped": 0, "unplaced": 0, "genes": "[]",
       "note": "", "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return rel


def fetch(path, contig, start1, end1):
    if pysam:
        try:
            tb = pysam.TabixFile(path)
            for row in tb.fetch(contig, max(0, start1 - 1), end1):
                yield row
            return
        except Exception:
            return
    if _TABIX_BIN:
        try:
            proc = subprocess.run([_TABIX_BIN, path, "%s:%d-%d" % (contig, max(1, start1), end1)],
                                  capture_output=True, text=True, timeout=180)
            for line in proc.stdout.splitlines():
                if line and not line.startswith("#"):
                    yield line
        except Exception:
            return


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


# ---- parse the VCF ----------------------------------------------------------------------
rows = []
skipped = 0
for line in text.splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    f = line.split("\t")
    if len(f) < 5:
        f = re.split(r"\s+", line)          # a VCF that lost its tabs in the clipboard
    if len(f) < 5:
        continue
    try:
        pos = int(f[1])
    except Exception:
        continue
    ref = f[3].upper().strip()
    if not re.match(r"^[ACGTN]+$", ref):
        skipped += 1
        continue
    chrom = f[0].strip()
    info = f[7] if len(f) > 7 else ""
    for alt in str(f[4] or "").split(","):
        alt = alt.upper().strip()
        if not re.match(r"^[ACGTN]+$", alt):
            skipped += 1
            continue
        if len(ref) > MAX_ALLELE or len(alt) > MAX_ALLELE:
            skipped += 1
            continue
        # BARE, always. read-vcf-variants.py strips the prefix and track.variantWorldX is
        # given the bare form, so a "chr7" carried through from the file would be a second
        # spelling of the same chromosome travelling alongside the first.
        rows.append({"chr": chrom[3:] if chrom.lower().startswith("chr") else chrom,
                     "pos": pos, "id": (f[2] if len(f) > 2 and f[2] != "." else ""),
                     "ref": ref, "alt": alt,
                     "qual": (f[5] if len(f) > 5 and f[5] != "." else ""),
                     "filter": (f[6] if len(f) > 6 and f[6] != "." else ""),
                     "info": info})
        if len(rows) >= MAX_VARIANTS:
            break
    if len(rows) >= MAX_VARIANTS:
        break

gff = first_existing(GFF.get(species) or GFF["human"])

if not text.strip():
    out["error"] = "nothing was pasted"
elif not rows:
    out["error"] = "no VCF data lines could be read from that text"
elif not pysam and not _TABIX_BIN:
    out["error"] = "neither pysam nor the tabix CLI is available on this server"
elif not os.path.exists(gff):
    out["error"] = "the %s annotation is not on this server (%s)" % (species, GFF.get(species))
else:
    works.msg("Read %d variant(s); finding their genes…" % len(rows))
    # ONE QUERY PER CHROMOSOME, not one per variant. A pasted VCF is usually a handful of
    # genes in a handful of places, and a thousand tabix calls to learn that is a thousand
    # process spawns.
    by_chrom = {}
    for r in rows:
        by_chrom.setdefault(r["chr"], []).append(r)

    genes = {}          # (gene, chrom) -> {gene, chr, strand, lo, hi, variants: []}
    unplaced = 0
    for chrom, rs in by_chrom.items():
        q = chrom if str(chrom).startswith("chr") else ("chr" + str(chrom))
        lo = min(r["pos"] for r in rs)
        hi = max(r["pos"] for r in rs)
        spans = []                      # (lo, hi, gene_name, strand)
        tx = {}                         # gene_name -> (rank, transcript_id)
        for row in fetch(gff, q, lo, hi):
            f = row.split("\t")
            if len(f) < 9:
                continue
            kind = f[2]
            if kind not in ("gene", "transcript"):
                continue
            a = attrs(f[8])
            name = a.get("gene_name") or ""
            if not name:
                continue
            if kind == "gene":
                gtype = a.get("gene_type") or ""
                if gtype in ("artifact",):
                    continue
                spans.append((int(f[3]), int(f[4]), name, f[6], gtype))
            else:
                tag = a.get("tag") or ""
                tid = (a.get("transcript_id") or "").split(".")[0]
                if not tid:
                    continue
                # Lower rank is better; length only breaks ties among the unranked.
                rank = 3
                if "MANE_Select" in tag:
                    rank = 0
                elif "Ensembl_canonical" in tag:
                    rank = 1
                elif "basic" in tag:
                    rank = 2
                length = int(f[4]) - int(f[3])
                cur = tx.get(name)
                if cur is None or (rank, -length) < (cur[0], -cur[2]):
                    tx[name] = (rank, tid, length)
        for r in rs:
            hits = [s for s in spans if s[0] <= r["pos"] <= s[1]]
            if not hits:
                unplaced += 1
                continue
            # PROTEIN-CODING FIRST, then the smallest.
            #
            # Nested loci are common and the tighter one is usually the one meant -- but not
            # when the tighter one is an antisense RNA lying inside a gene. A CFTR intronic
            # variant sits inside ENSG00000083622 as well as inside CFTR, and the lncRNA is
            # smaller; filed under it, the variant arrives on a track nobody asked for under a
            # name that is an accession rather than a gene. Coding wins, and size only decides
            # between equals.
            hits.sort(key=lambda s: (0 if s[4] == "protein_coding" else 1, s[1] - s[0]))
            g = hits[0]
            key = (g[2], chrom)
            slot = genes.get(key)
            if slot is None:
                slot = genes[key] = {"gene": g[2], "chr": chrom, "strand": g[3],
                                     "transcript": (tx.get(g[2]) or (9, "", 0))[1],
                                     "variants": []}
            slot["variants"].append(r)

    ordered = sorted(genes.values(), key=lambda s: (-len(s["variants"]), s["gene"]))
    trimmed = ordered[:MAX_GENES]
    dropped_genes = len(ordered) - len(trimmed)

    out["ok"] = bool(trimmed)
    out["count"] = len(rows)
    out["skipped"] = skipped
    out["unplaced"] = unplaced
    out["genes"] = json.dumps(trimmed)
    notes = []
    if dropped_genes:
        notes.append("%d further gene(s) not shown" % dropped_genes)
    if unplaced:
        notes.append("%d variant(s) fall outside any gene" % unplaced)
    if skipped:
        notes.append("%d record(s) skipped as symbolic or structural" % skipped)
    out["note"] = "; ".join(notes)
    works.msg("%d variant(s) in %d gene(s)" % (len(rows) - unplaced, len(trimmed)))

works.resolve(out)
