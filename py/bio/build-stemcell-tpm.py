"""Build reference_data/stemcell/stem-tpm.tsv.gz: expression in stem and progenitor cells.

GTEx samples adult tissue, so a design read against it alone cannot say what a gene does in the
cells a tissue renews itself from. ENCODE has RNA-seq of exactly those: embryonic stem cells (H1,
H9), an induced pluripotent line, neural progenitors, mesenchymal stem cells and a haematopoietic
progenitor. This pulls their gene quantifications, averages the replicates of each type, and writes
one TPM per gene per type, in the same shape the GTEx panel is read in.

Ensembl gene ids are mapped to symbols through the GTEx median-TPM table already on the box
(its Name column is the versioned id, its Description the symbol), so nothing extra is downloaded
for the mapping.

Run:  python3 py/bio/build-stemcell-tpm.py [--out DIR] [--gtex FILE] [--max-files N]
"""
import argparse
import collections
import gzip
import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://www.encodeproject.org"
# The types, in the order they are shown. Each is an ENCODE biosample term and the name used here.
TYPES = [
    ("H1", "H1 (embryonic)"),
    ("H9", "H9 (embryonic)"),
    ("GM23338", "iPSC"),
    ("neural progenitor cell", "Neural progenitor"),
    ("mesenchymal stem cell", "Mesenchymal"),
    ("hematopoietic multipotent progenitor cell", "Haematopoietic progenitor"),
]
PREFERRED_ASSAYS = ["polyA plus RNA-seq", "total RNA-seq", "RNA-seq"]


def get_json(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "baja/1.0"})
    with urllib.request.urlopen(req, timeout=120) as fh:
        return json.load(fh)


def files_for(term, want):
    """The gene-quantification files for one biosample term, best assay first."""
    q = (API + "/search/?type=File&output_type=gene+quantifications&file_format=tsv&assembly=GRCh38"
         "&status=released&limit=60&format=json&biosample_ontology.term_name=" + urllib.parse.quote(term))
    try:
        rows = get_json(q).get("@graph", [])
    except Exception as e:
        sys.stderr.write("  ! %s: %s\n" % (term, e))
        return []
    out, seen = [], set()
    for assay in PREFERRED_ASSAYS:
        for r in rows:
            acc = r.get("accession")
            if not acc or acc in seen:
                continue
            # The search result carries little; the file page says which assay it came from.
            try:
                meta = get_json(API + "/files/" + acc + "/?format=json")
            except Exception:
                continue
            if (meta.get("assay_term_name") or "") and assay not in (meta.get("assay_title") or meta.get("assay_term_name") or ""):
                continue
            if (meta.get("biosample_ontology") or {}).get("term_name") != term:
                continue
            seen.add(acc)
            out.append(acc)
            if len(out) >= want:
                return out
    return out


def read_tpm(acc, cache):
    """{Ensembl gene id: TPM} from one RSEM gene-quantification file."""
    path = os.path.join(cache, acc + ".tsv")
    if not os.path.exists(path):
        url = API + "/files/" + acc + "/@@download/" + acc + ".tsv"
        req = urllib.request.Request(url, headers={"User-Agent": "baja/1.0"})
        with urllib.request.urlopen(req, timeout=300) as fh, open(path, "wb") as out:
            out.write(fh.read())
    vals = {}
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        head = fh.readline().rstrip("\n").split("\t")
        try:
            i_id, i_tpm = head.index("gene_id"), head.index("TPM")
        except ValueError:
            return {}
        for line in fh:
            f = line.rstrip("\n").split("\t")
            if len(f) <= i_tpm or not f[i_id].startswith("ENSG"):
                continue
            try:
                vals[f[i_id].split(".")[0]] = float(f[i_tpm])
            except ValueError:
                continue
    return vals


def ensg_to_symbol(gtex_path):
    m = {}
    with gzip.open(gtex_path, "rt", encoding="utf-8", errors="replace") as fh:
        fh.readline()
        fh.readline()
        fh.readline()
        for line in fh:
            f = line.split("\t", 2)
            if len(f) < 2 or not f[0].startswith("ENSG"):
                continue
            m[f[0].split(".")[0]] = f[1].strip().upper()
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="reference_data/stemcell")
    ap.add_argument("--gtex", default="reference_data/gtex/GTEx_Analysis_v10_RNASeQCv2.4.2_gene_median_tpm.gct.gz")
    ap.add_argument("--cache", default="/tmp/stem-tpm-src")
    ap.add_argument("--max-files", type=int, default=2)
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)

    sys.stderr.write("mapping gene ids through %s\n" % a.gtex)
    sym = ensg_to_symbol(a.gtex)
    sys.stderr.write("  %d ids\n" % len(sym))

    labels, per_type = [], []
    for term, label in TYPES:
        accs = files_for(term, a.max_files)
        if not accs:
            sys.stderr.write("  %-42s no files\n" % term)
            continue
        totals, counts = collections.defaultdict(float), collections.defaultdict(int)
        for acc in accs:
            vals = read_tpm(acc, a.cache)
            for gid, v in vals.items():
                totals[gid] += v
                counts[gid] += 1
        if not totals:
            continue
        sys.stderr.write("  %-42s %s (%d genes)\n" % (term, ",".join(accs), len(totals)))
        labels.append(label)
        per_type.append({g: totals[g] / max(1, counts[g]) for g in totals})

    if not labels:
        sys.stderr.write("nothing to write\n")
        return 1
    os.makedirs(a.out, exist_ok=True)
    out_path = os.path.join(a.out, "stem-tpm.tsv.gz")
    genes = set()
    for d in per_type:
        genes.update(d.keys())
    n = 0
    with gzip.open(out_path, "wt", encoding="utf-8") as out:
        out.write("symbol\t" + "\t".join(labels) + "\n")
        best = {}
        for gid in genes:
            s = sym.get(gid)
            if not s:
                continue
            row = [d.get(gid, 0.0) for d in per_type]
            # A symbol on two gene ids: the more expressed one, as the GTEx reader does.
            if s in best and sum(best[s]) >= sum(row):
                continue
            best[s] = row
        for s in sorted(best):
            out.write(s + "\t" + "\t".join("%.2f" % v for v in best[s]) + "\n")
            n += 1
    sys.stderr.write("wrote %s (%d genes, %d types)\n" % (out_path, n, len(labels)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
