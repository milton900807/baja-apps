"""Build reference_data/geneannot/gene-function.tsv.gz: what each gene DOES, in a line.

A report that says a gene is a dependency and that the tumour has mutated it still does not say
what the gene is for. This bundle answers that, from two public sources:

  * NCBI gene_info          one descriptive name per symbol ("tumor protein p53").
  * GO annotations (GOA)    every GO term a human gene is annotated with, which are folded into
                            a small set of plain functional categories -- stem cell /
                            self-renewal, DNA repair, spliceosome, cell cycle and so on -- and a
                            few of the most specific process terms, kept as they are written.

The categories are the point: "stem cell / self-renewal" on a common-essential gene says something
a Chronos score cannot. They are keyword rules over GO term NAMES, deliberately readable and
deliberately few; a gene keeps every category it earns, ordered by how much of its annotation
supports it.

Run:  python3 py/bio/build-gene-annotations.py  [--out DIR] [--gaf FILE] [--obo FILE] [--geneinfo FILE]
Sources are downloaded when not given: current.geneontology.org (goa_human.gaf.gz, go-basic.obo)
and NCBI's Homo_sapiens.gene_info.gz.
"""
import argparse
import gzip
import os
import re
import sys
import urllib.request

GAF_URL = "https://current.geneontology.org/annotations/goa_human.gaf.gz"
OBO_URL = "https://current.geneontology.org/ontology/go-basic.obo"
GENEINFO_URL = "https://ftp.ncbi.nlm.nih.gov/gene/DATA/GENE_INFO/Mammalia/Homo_sapiens.gene_info.gz"

# The categories, in the order they are shown. Each is a list of patterns matched against the GO
# term name, lowercased. A term can carry a gene into several categories, which is correct: a
# histone methyltransferase is both chromatin and transcription.
CATEGORIES = [
    ("stem cell / self-renewal", [r"\bstem cell", r"self-renewal", r"pluripoten", r"\bblastocyst", r"somatic stem cell"]),
    ("development / differentiation", [r"\bdevelopment\b", r"differentiation", r"morphogenesis", r"cell fate", r"pattern specification"]),
    ("cell cycle / mitosis", [r"cell cycle", r"\bmitotic\b", r"\bmitosis\b", r"\bmeiotic\b", r"chromosome segregation", r"spindle", r"kinetochore", r"cytokinesis"]),
    ("DNA replication", [r"dna replication", r"replication fork", r"origin (firing|licensing)", r"okazaki"]),
    ("DNA repair / damage response", [r"dna repair", r"dna damage", r"double-strand break", r"mismatch repair", r"nucleotide-excision", r"base-excision", r"homologous recombination", r"interstrand cross-link"]),
    ("chromatin / epigenetics", [r"chromatin", r"histone", r"nucleosome", r"dna methylation", r"heterochromatin", r"chromatin remodel"]),
    ("transcription", [r"transcription", r"rna polymerase ii", r"\bpromoter\b", r"\benhancer\b"]),
    ("splicing / spliceosome", [r"splic", r"spliceosom", r"\bsnrnp\b"]),
    ("translation / ribosome", [r"translation", r"ribosom", r"\btrna\b", r"polysome", r"trna aminoacylation"]),
    ("RNA processing / turnover", [r"rna processing", r"rna modification", r"mrna (export|stability|catabolic)", r"rna degradation", r"nonsense-mediated", r"polyadenylation", r"rna binding", r"ribonucleoprotein"]),
    ("protein degradation / ubiquitin", [r"ubiquitin", r"proteasom", r"protein catabolic", r"sumoylation", r"neddylation"]),
    ("protein folding / trafficking", [r"protein folding", r"chaperone", r"protein transport", r"vesicle", r"golgi", r"endoplasmic reticulum", r"endosom", r"secretion", r"unfolded protein"]),
    ("signalling", [r"signal transduction", r"signaling pathway", r"kinase activity", r"phosphatase activity", r"receptor activity", r"second messenger", r"gtpase"]),
    ("apoptosis / cell death", [r"apoptot", r"apoptosis", r"cell death", r"necropto", r"pyropto", r"ferropto"]),
    ("autophagy", [r"autophag"]),
    ("metabolism", [r"metabolic process", r"biosynthetic process", r"catabolic process", r"glycoly", r"oxidoreductase", r"nucleotide (bio)?synth"]),
    ("mitochondria / respiration", [r"mitochondri", r"respiratory chain", r"oxidative phosphorylation", r"electron transport chain", r"\btca\b", r"tricarboxylic"]),
    ("lipid / membrane", [r"lipid", r"phospholipid", r"cholesterol", r"fatty acid", r"sphingolipid", r"membrane organization"]),
    ("cytoskeleton / adhesion / motility", [r"cytoskelet", r"actin", r"microtubule", r"cell adhesion", r"cell migration", r"\bmotility\b", r"focal adhesion"]),
    ("telomere maintenance", [r"telomer"]),
    ("immune", [r"immune", r"\bt cell\b", r"\bb cell\b", r"interferon", r"antigen processing", r"inflammatory", r"cytokine"]),
    ("angiogenesis / vasculature", [r"angiogenesis", r"vasculature", r"blood vessel"]),
    ("neuronal / synaptic", [r"synap", r"neuron", r"neurotransmitter", r"axon", r"dendrit", r"myelin"]),
    ("transporter / channel", [r"transmembrane transport", r"ion channel", r"channel activity", r"transporter activity", r"symporter", r"antiporter"]),
    ("cancer-associated pathway", [r"wnt signaling", r"notch signaling", r"hedgehog", r"tgf-?beta", r"\bmapk\b", r"pi3k", r"\bp53\b", r"hippo signaling", r"nf-kappab"]),
]
COMPILED = [(name, [re.compile(p) for p in pats]) for name, pats in CATEGORIES]

MAX_CATEGORIES = 4        # kept per gene, best supported first
MAX_TERMS = 3             # the most specific process terms, kept as written
TERM_MIN_GENES, TERM_MAX_GENES = 8, 400
SKIP_TERMS = {"protein binding", "identical protein binding", "metal ion binding", "atp binding",
              "rna binding", "dna binding", "protein-containing complex binding", "enzyme binding",
              "nucleus", "cytoplasm", "cytosol", "nucleoplasm", "membrane", "extracellular exosome"}


def fetch(url, path):
    if os.path.exists(path):
        return path
    sys.stderr.write("downloading %s\n" % url)
    urllib.request.urlretrieve(url, path)
    return path


def read_obo(path):
    """{GO id: (name, namespace)} and the set of obsolete ids."""
    names, obsolete = {}, set()
    gid = name = ns = None
    in_term = False
    is_obs = False
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line == "[Term]":
                in_term, gid, name, ns, is_obs = True, None, None, None, False
                continue
            if line.startswith("["):
                in_term = False
                continue
            if not in_term:
                continue
            if line.startswith("id: GO:"):
                gid = line[4:].strip()
            elif line.startswith("name: "):
                name = line[6:].strip()
            elif line.startswith("namespace: "):
                ns = line[11:].strip()
            elif line.startswith("is_obsolete: true"):
                is_obs = True
            elif line == "":
                if gid and name:
                    if is_obs:
                        obsolete.add(gid)
                    else:
                        names[gid] = (name, ns or "")
                in_term = False
    return names, obsolete


def read_gaf(path, names, obsolete):
    """{symbol: {GO id: evidence count}}, NOT-qualified annotations left out."""
    per = {}
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("!"):
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 15:
                continue
            sym, qual, gid, aspect = f[2].strip().upper(), f[3], f[4].strip(), f[8]
            if not sym or not gid or gid in obsolete or gid not in names:
                continue
            if "NOT" in qual.split("|"):
                continue
            if aspect not in ("P", "F"):      # what it does and what it takes part in
                continue
            d = per.setdefault(sym, {})
            d[gid] = d.get(gid, 0) + 1
    return per


def read_geneinfo(path):
    """{symbol: description}, protein-coding and the rest alike."""
    desc = {}
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        head = fh.readline()
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) < 10 or f[0] != "9606":
                continue
            sym, d = f[2].strip().upper(), f[8].strip()
            if sym and d and d != "-":
                desc.setdefault(sym, d)
    return desc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="reference_data/geneannot")
    ap.add_argument("--gaf", default="")
    ap.add_argument("--obo", default="")
    ap.add_argument("--geneinfo", default="")
    ap.add_argument("--cache", default="/tmp/gene-annot-src")
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    gaf = a.gaf or fetch(GAF_URL, os.path.join(a.cache, "goa_human.gaf.gz"))
    obo = a.obo or fetch(OBO_URL, os.path.join(a.cache, "go-basic.obo"))
    gi = a.geneinfo or fetch(GENEINFO_URL, os.path.join(a.cache, "Homo_sapiens.gene_info.gz"))

    sys.stderr.write("reading the ontology\n")
    names, obsolete = read_obo(obo)
    sys.stderr.write("  %d terms, %d obsolete\n" % (len(names), len(obsolete)))
    sys.stderr.write("reading the annotations\n")
    per = read_gaf(gaf, names, obsolete)
    sys.stderr.write("  %d symbols\n" % len(per))
    desc = read_geneinfo(gi)
    sys.stderr.write("  %d descriptions\n" % len(desc))

    # How many genes carry each term: a term on half the genome says nothing about one gene.
    breadth = {}
    for sym, d in per.items():
        for gid in d:
            breadth[gid] = breadth.get(gid, 0) + 1

    os.makedirs(a.out, exist_ok=True)
    out_path = os.path.join(a.out, "gene-function.tsv.gz")
    n_cat = 0
    with gzip.open(out_path, "wt", encoding="utf-8") as out:
        out.write("symbol\tdescription\tcategories\tterms\n")
        for sym in sorted(set(list(per.keys()) + list(desc.keys()))):
            terms = per.get(sym, {})
            score = {}
            for gid, ev in terms.items():
                nm = names[gid][0].lower()
                for cat, pats in COMPILED:
                    if any(p.search(nm) for p in pats):
                        score[cat] = score.get(cat, 0) + ev
            order = [c for c, _ in CATEGORIES if c in score]
            order.sort(key=lambda c: (-score[c], [n for n, _ in CATEGORIES].index(c)))
            cats = order[:MAX_CATEGORIES]
            # The most specific process terms that are still about a PROCESS rather than one
            # experiment: a term only two or three genes in the genome carry is usually the
            # record of a single paper ("response to isolation stress"), so terms below
            # TERM_MIN_GENES are left out, and very broad ones above TERM_MAX_GENES with them.
            spec = [(breadth.get(gid, 0), names[gid][0]) for gid in terms
                    if names[gid][1] == "biological_process" and names[gid][0].lower() not in SKIP_TERMS
                    and TERM_MIN_GENES <= breadth.get(gid, 0) <= TERM_MAX_GENES]
            # A term that speaks to one of the categories chosen comes first: the three shown
            # should read as evidence for the labels above them, not as a separate list.
            catpats = [pats for name, pats in COMPILED if name in cats]
            def fits(nm):
                low = nm.lower()
                return 0 if any(p.search(low) for pats in catpats for p in pats) else 1
            spec.sort(key=lambda x: (fits(x[1]), x[0]))
            best, seen = [], set()
            for _, nm in spec:
                k = nm.lower()
                if k in seen:
                    continue
                seen.add(k)
                best.append(nm)
                if len(best) >= MAX_TERMS:
                    break
            if cats:
                n_cat += 1
            out.write("%s\t%s\t%s\t%s\n" % (sym, desc.get(sym, ""), "|".join(cats), "|".join(best)))
    sys.stderr.write("wrote %s (%d genes with a category)\n" % (out_path, n_cat))


if __name__ == "__main__":
    main()
