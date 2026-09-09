"""Where a gene is, given its symbol.

The reverse of genes-in-range.py: that one asks "what is in chr7:117-118 Mb", this one asks
"where is CFTR". Both read the same tabix-indexed GENCODE annotation, because a gene's span
is a fact in that file and nothing here is a judgement.

WHY AN INDEX. Tabix indexes the annotation by POSITION, which is exactly the wrong key for
this question -- finding a symbol means reading every gene row, and that is ~5 s and 63,000
genes on the human file. Once is fine, per keystroke is not. So the first lookup for a
species writes a small symbol table beside the annotation (~3 MB) and every lookup after it
is a grep-speed read of that. The index is derived, never edited: delete it and the next
lookup rebuilds it.

Synonyms are indexed too, from the GFF's own attributes, so an old name still finds the
gene -- looking up ALS1 and being told nothing is there would be wrong, not merely unhelpful.

Params (after the EngineMonitor):
    param(1) : gene symbol, or an Ensembl gene id
    param(2) : optional species (default human)
    param(3) : optional maximum matches (default 12)

Resolves:
    { ok, query, count, genes, built, error }
  genes is a JSON array, each
    {gene, chr, start, end, strand, biotype, gene_id, matched}
  `matched` is 'symbol', 'synonym' or 'id' -- how the row was reached, so a caller can say
  so rather than presenting a synonym hit as an exact one.
"""
import gzip
import json
import os
import subprocess
import shutil

from ion import works

GFF = {
    "human": "reference_data/human.gencode.annotation.gff3.bgz",
    "mouse": "reference_data/mouse.annotation.gff3.bgz",
    "rat": "reference_data/rat.annotation.gff3.bgz",
    "dog": "reference_data/dog.annotation.gff3.bgz",
    "yeast": "reference_data/yeast.annotation.gff3.bgz",
}

# THE SAME NAMES py/bio/karyotype.py ACCEPTS.
#
# Both are handed a species by the same free-text box, so a name one of them understands and
# the other does not is a name that draws the right chromosomes and then searches the wrong
# genome. Kept as one table per species, longest match first, so "mus musculus" is not read
# as "mus" and "s cerevisiae" is not missed for lacking a dot.
SYNONYMS = {
    "human": ["human", "homo sapiens", "h sapiens", "hsapiens", "hs", "hg38", "grch38", "man", "people", "patient"],
    "mouse": ["mouse", "mus musculus", "m musculus", "murine", "mm39", "grcm39", "mice"],
    "rat": ["rat", "rattus norvegicus", "r norvegicus", "rn7", "rats"],
    "dog": ["dog", "canis", "canis lupus familiaris", "canine", "canfam", "dogs"],
    "yeast": ["yeast", "saccharomyces cerevisiae", "s cerevisiae", "scerevisiae", "cerevisiae",
              "saccharomyces", "sc", "sgd", "saccer3", "saccer", "r64", "s288c", "budding yeast",
              "baker s yeast", "bakers yeast", "brewer s yeast"],
}


def resolve_species(text):
    """A species name in words -> the key GFF is indexed by, or '' when it is not one."""
    t = "".join(c.lower() if (c.isalnum() or c.isspace()) else " " for c in str(text or ""))
    t = " ".join(t.split())
    if not t:
        return ""
    best, best_len = "", 0
    for key, names in SYNONYMS.items():
        for n in names:
            if (t == n or t.startswith(n + " ") or t.endswith(" " + n) or (" " + n + " ") in (" " + t + " ")):
                if len(n) > best_len:
                    best, best_len = key, len(n)
    return best


query = str(works.param(1) or "").strip()
species_in = str(works.param(2) or "human").strip()
species = resolve_species(species_in) if species_in else "human"
try:
    max_hits = int(float(works.param(3) or 12))
except Exception:
    max_hits = 12
max_hits = max(1, min(200, max_hits))

# `species` is echoed back so the caller can SEE which genome was actually searched rather
# than assume it was the one it asked for -- the whole point of the change below.
out = {"ok": False, "query": query, "species": "", "count": 0, "genes": "[]",
       "built": False, "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return rel


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def build_index(gff_path, index_path):
    """One pass over the annotation, keeping only the gene rows.

    Written to a temporary file and renamed, so a lookup racing the build either sees no
    index and builds its own, or sees a complete one -- never a half-written table that
    would answer wrongly and keep answering wrongly.
    """
    works.msg("Indexing the %s gene symbols (first time only)…" % species)
    tmp = index_path + ".partial-%d" % os.getpid()
    n = 0
    opener = gzip.open if gff_path.endswith((".gz", ".bgz")) else open
    with opener(gff_path, "rt") as fh, open(tmp, "w") as w:
        for line in fh:
            if not line or line[0] == "#":
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 9 or f[2] != "gene":
                continue
            a = attrs(f[8])
            name = a.get("gene_name") or a.get("Name") or ""
            gid = a.get("gene_id") or a.get("ID") or ""
            if not name and not gid:
                continue
            syn = a.get("gene_synonym") or a.get("Alias") or ""
            syn = syn.replace(",", "|")
            w.write("\t".join([
                name, f[0], f[3], f[4], f[6],
                a.get("gene_type") or a.get("biotype") or "", gid, syn,
            ]) + "\n")
            n += 1
            if (n % 20000) == 0:
                works.msg("Indexing the %s gene symbols — %d…" % (species, n))
    os.replace(tmp, index_path)
    works.msg("Indexed %d %s genes." % (n, species))
    return n


# NO SILENT FALL BACK TO HUMAN. This read `GFF.get(species) or GFF["human"]`, so every
# species name the table did not recognise -- "Mus musculus", "Saccharomyces cerevisiae",
# "monkey", or an empty string -- searched the HUMAN annotation and answered with human
# coordinates and no error at all. Asking where Sod1 is in the mouse genome and being handed
# chr21:31,659,666, the human SOD1 locus, is worse than being told nothing: it is an answer,
# it looks like an answer, and nothing about it says it is about the wrong animal.
out["species"] = species
if not species:
    out["error"] = ('"%s" is not a species this holds an annotation for. Try one of: %s.'
                    % (species_in, ", ".join(sorted(GFF))))
    gff, index_path = "", ""
else:
    gff = first_existing(GFF[species]) or ""
    index_path = os.path.join(os.path.dirname(gff), "%s.gene-symbols.tsv" % species) if gff else ""

if out["error"]:
    pass
elif not query:
    out["error"] = "a gene symbol is needed"
elif not gff or not os.path.exists(gff):
    out["error"] = "the %s annotation is not on this server" % species
else:
    try:
        if not os.path.exists(index_path) or os.path.getsize(index_path) < 1024:
            build_index(gff, index_path)
            out["built"] = True
    except Exception as e:
        out["error"] = "could not index the %s annotation: %s" % (species, e)

    if not out["error"]:
        q = query.upper()
        # An Ensembl id may carry a version; the index holds it with one.
        qbase = q.split(".")[0]
        hits, seen = [], set()

        def add(f, how):
            gid = f[6]
            key = (f[0], f[1], f[2], gid)
            if key in seen:
                return
            seen.add(key)
            try:
                s1, e1 = int(f[2]), int(f[3])
            except Exception:
                return
            hits.append({
                "gene": f[0], "chr": f[1], "start": s1, "end": e1,
                "strand": f[4], "biotype": f[5], "gene_id": gid, "matched": how,
            })

        try:
            with open(index_path, "r") as fh:
                for line in fh:
                    f = line.rstrip("\n").split("\t")
                    if len(f) < 8:
                        continue
                    if f[0].upper() == q:
                        add(f, "symbol")
                    elif f[6].split(".")[0].upper() == qbase:
                        add(f, "id")
                    elif f[7] and q in [s.strip().upper() for s in f[7].split("|") if s.strip()]:
                        add(f, "synonym")
        except Exception as e:
            out["error"] = "could not read the gene index: %s" % e

        if not out["error"]:
            # Exact symbol first, then id, then synonym; and within a kind the longest span,
            # which is the gene rather than a fragment sharing its name on a patch contig.
            rank = {"symbol": 0, "id": 1, "synonym": 2}
            hits.sort(key=lambda g: (rank.get(g["matched"], 9),
                                     -(g["end"] - g["start"]), g["chr"]))
            out["ok"] = True
            out["count"] = len(hits)
            out["genes"] = json.dumps(hits[:max_hits])
            works.msg("%s — %d match%s" % (query, len(hits), "" if len(hits) == 1 else "es"))

works.resolve(out)
