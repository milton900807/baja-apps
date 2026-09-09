"""Which genes and transcripts lie in a genomic window.

Read straight off the tabix-indexed GENCODE annotation the rest of the server uses, by
position. Nothing is asked of a model: a gene's span is a fact in the file, and "which genes
are in chr7:117,000,000-118,000,000" is a lookup, not a judgement.

One transcript per gene, chosen MANE Select > Ensembl canonical > basic > longest, which is
the order of how much anyone should trust it. Protein-coding genes come first because they
are what a window is usually being opened for; the rest follow, so a window whose only
occupants are lncRNAs still returns them.

Params (after the EngineMonitor):
    param(1) : chromosome, with or without the chr prefix
    param(2) : start (1-based)
    param(3) : end
    param(4) : optional species (default human)
    param(5) : optional maximum genes (default 200)

Resolves:
    { ok, chr, start, end, count, truncated, genes, error }
  genes is a JSON array, each
    {gene, transcript, biotype, strand, start, end, coding}
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

chrom = str(works.param(1) or "").strip()
try:
    start = int(float(works.param(2) or 0))
    end = int(float(works.param(3) or 0))
except Exception:
    start, end = 0, 0
species = (str(works.param(4) or "human") or "human").strip().lower()
try:
    max_genes = int(float(works.param(5) or 200))
except Exception:
    max_genes = 200
max_genes = max(1, min(1000, max_genes))

out = {"ok": False, "chr": chrom, "start": start, "end": end, "count": 0,
       "truncated": False, "genes": "[]", "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return rel


def fetch(path, contig, s1, e1):
    if pysam:
        try:
            tb = pysam.TabixFile(path)
            for row in tb.fetch(contig, max(0, s1 - 1), e1):
                yield row
            return
        except Exception:
            return
    if _TABIX:
        try:
            proc = subprocess.run([_TABIX, path, "%s:%d-%d" % (contig, max(1, s1), e1)],
                                  capture_output=True, text=True, timeout=180)
            for line in proc.stdout.splitlines():
                if line and not line.startswith("#"):
                    yield line
        except Exception:
            return


def a_is_transcript(col):
    """A feature row that carries a transcript_id is a transcript, whatever its type."""
    return "transcript_id=" in str(col or "")


def contigs_of(path):
    """Every contig the index knows, or an empty set when that cannot be asked."""
    if pysam:
        try:
            return set(pysam.TabixFile(path).contigs)
        except Exception:
            pass
    if _TABIX:
        try:
            proc = subprocess.run([_TABIX, "-l", path], capture_output=True, text=True, timeout=60)
            return set(x.strip() for x in proc.stdout.splitlines() if x.strip())
        except Exception:
            pass
    return set()


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


gff = first_existing(GFF.get(species) or GFF["human"])

if not chrom or end <= start:
    out["error"] = "a chromosome and a range are needed"
elif not pysam and not _TABIX:
    out["error"] = "neither pysam nor the tabix CLI is available on this server"
elif not os.path.exists(gff):
    out["error"] = "the %s annotation is not on this server" % species
else:
    # THE CONTIG IS SPELT THE WAY THE FILE SPELLS IT. GENCODE says chr7; Ensembl says 7,
    # and the Ensembl yeast file says I..XVI and Mito. The caller strips any chr prefix
    # before asking, so both spellings are tried, and the mitochondrion's three names.
    bare = chrom[3:] if chrom.lower().startswith("chr") else chrom
    mito = bare.upper() in ("MT", "M", "MITO")
    have = contigs_of(gff)
    q = ""
    for cand in ("chr" + bare, bare, chrom,
                 "chrM" if mito else "", "MT" if mito else "", "Mito" if mito else ""):
        if cand and (not have or cand in have):
            q = cand
            break
    if not q:
        q = "chr" + bare
    works.msg("Reading %s:%s-%s…" % (q, start, end))
    genes = {}          # name -> record
    tx = {}             # name -> (rank, id, length)
    gid2name = {}       # gene_id -> name, for transcripts that only name their Parent
    for row in fetch(gff, q, start, end):
        f = row.split("\t")
        if len(f) < 9:
            continue
        kind = f[2]
        # Ensembl's yeast file has no "transcript" rows: its transcripts are mRNA,
        # ncRNA, tRNA, snoRNA, rRNA and so on, each with a transcript_id.
        if kind == "gene":
            pass
        elif kind == "transcript" or a_is_transcript(f[8]):
            kind = "transcript"
        else:
            continue
        a = attrs(f[8])
        # GENCODE names a gene with gene_name; Ensembl with Name, and a yeast ORF that
        # has never been named carries only its systematic gene_id (YAL069W).
        name = a.get("gene_name") or a.get("Name") or ""
        if kind == "gene":
            gid = (a.get("gene_id") or a.get("ID") or "").replace("gene:", "")
            if not name:
                name = gid
            if gid:
                gid2name[gid] = name
        elif not name:
            # An Ensembl transcript names no gene: it points at one through Parent, and
            # the gene row came first in the file, so its name is already known here.
            name = gid2name.get((a.get("Parent") or "").replace("gene:", ""), "")
        if not name:
            continue
        if kind == "gene":
            gtype = a.get("gene_type") or a.get("biotype") or ""
            if gtype == "artifact":
                continue
            g = genes.get(name)
            lo, hi = int(f[3]), int(f[4])
            if g is None:
                genes[name] = {"gene": name, "transcript": "", "biotype": gtype,
                               "strand": f[6], "start": lo, "end": hi,
                               "coding": 1 if gtype == "protein_coding" else 0}
            else:
                g["start"] = min(g["start"], lo)
                g["end"] = max(g["end"], hi)
        else:
            tid = (a.get("transcript_id") or "").split(".")[0]
            if not tid:
                continue
            tag = a.get("tag") or ""
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

    rows = []
    for name, g in genes.items():
        t = tx.get(name)
        g["transcript"] = t[1] if t else ""
        rows.append(g)
    # Coding first, then the ones that overlap the window most -- a gene the window sits
    # inside is more likely the reason it was drawn than one clipped at the edge.
    def overlap(g):
        return min(g["end"], end) - max(g["start"], start)
    rows.sort(key=lambda g: (-g["coding"], -overlap(g), g["gene"]))
    out["truncated"] = len(rows) > max_genes
    rows = rows[:max_genes]
    out["ok"] = True
    out["count"] = len(rows)
    out["genes"] = json.dumps(rows)
    works.msg("%d gene(s)%s" % (len(rows), " (truncated)" if out["truncated"] else ""))

works.resolve(out)
