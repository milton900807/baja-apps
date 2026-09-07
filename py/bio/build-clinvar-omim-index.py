"""Build the OMIM-phenotype index over ClinVar. OFFLINE BUILDER -- not an exec script.

    python3 py/bio/build-clinvar-omim-index.py [clinvar.vcf.gz] [out.json]

ClinVar's CLNDISDB field cross-references every record to the ontologies that name its
condition, and OMIM is one of them:

    CLNDISDB=MONDO:MONDO:0019200,MeSH:D012174,MedGen:C0035334,OMIM:268000,OMIM:PS268000,Orphanet:791
    CLNDN=Retinitis_pigmentosa

So the OMIM phenotype numbers are already here, on this box, in a public-domain file. The
point of this index is the half that a region query cannot answer: given an OMIM phenotype,
WHICH GENES does it touch? Without that there is nothing to load transcripts for, and the
only other way to get from a disease to its genes is to ask a model to remember them.

What is indexed is what would actually be loaded: pathogenic and likely-pathogenic records
that are not conflicting. A phenotype's benign records are not what someone asking for a
disease means, and counting them would make the index lie about how much there is to see.

Review status is kept per phenotype as a star count, ClinVar's own scale:
    3  practice guideline
    2  reviewed by expert panel
    1  criteria provided, multiple submitters, no conflicts
    0  everything weaker

Phenotypic-series ids (OMIM:PS268000) are indexed alongside the plain ones and marked, since
"retinitis pigmentosa" as a family is often what someone means rather than one of its 90
numbered forms.

Output (JSON, ~a few hundred KB):
    { built, source, records, phenotypes: {
        "268000": { "name": ..., "series": false, "v": <variants>, "s": <best stars>,
                    "genes": [[symbol, count], ...] } } }
"""
import datetime
import gzip
import json
import os
import re
import sys

VCF = sys.argv[1] if len(sys.argv) > 1 else "reference_data/variants/clinvar.vcf.gz"
OUT = sys.argv[2] if len(sys.argv) > 2 else "reference_data/variants/clinvar-omim.json"

MAX_GENES_PER_PHENOTYPE = 80     # a phenotype touching more than this is a category, not a target
MAX_ALLELE = 50                  # matches read-vcf-variants.py: bigger is structural

OMIM_RE = re.compile(r"OMIM:(PS)?(\d+)")
STARS = [
    (3, "practice_guideline"),
    (2, "reviewed_by_expert_panel"),
    (1, "criteria_provided,_multiple_submitters,_no_conflicts"),
]


def stars_of(revstat):
    for n, needle in STARS:
        if needle in revstat:
            return n
    return 0


def info_of(col):
    d = {}
    for kv in col.split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k] = v
    return d


pheno = {}      # mim -> {name, series, v, s, genes: {symbol: count}}
records = 0
kept = 0

with gzip.open(VCF, "rt") as fh:
    for line in fh:
        if line.startswith("#"):
            continue
        records += 1
        f = line.rstrip("\n").split("\t")
        if len(f) < 8:
            continue
        if len(f[3]) > MAX_ALLELE:
            continue
        info = info_of(f[7])
        sig = info.get("CLNSIG", "")
        # "Conflicting_interpretations_of_pathogenicity" CONTAINS the word pathogenic. Testing
        # for the substring alone files every conflicting call under pathogenic, which is the
        # one mistake this must not make.
        if "Pathogenic" not in sig and "Likely_pathogenic" not in sig:
            continue
        if "Conflicting" in sig:
            continue
        disdb = info.get("CLNDISDB", "")
        if "OMIM:" not in disdb:
            continue
        gene = info.get("GENEINFO", "").split(":")[0]
        if not gene:
            continue
        st = stars_of(info.get("CLNREVSTAT", ""))
        kept += 1
        # CLNDN AND CLNDISDB ARE POSITIONALLY ALIGNED. Both are "|"-separated lists with the
        # same number of elements, and element i of one is the name of element i of the other:
        #
        #   CLNDN=Brown-Vialetto-van_Laere_syndrome_1|Progressive_bulbar_palsy_of_childhood
        #   CLNDISDB=...,OMIM:211530,...|...,OMIM:211500
        #
        # Checked across 377,623 records carrying both fields: every one matches element for
        # element. Pairing them is the difference between an index that knows OMIM:219700 is
        # cystic fibrosis and one that calls three unrelated phenotypes "Hypertrophic
        # cardiomyopathy 26" because it took whichever name happened to come first.
        names = info.get("CLNDN", "").split("|")
        for i, part in enumerate(disdb.split("|")):
            if "OMIM:" not in part:
                continue
            name = names[i].replace("_", " ").strip() if i < len(names) else ""
            if name.lower() in ("not provided", "not specified"):
                name = ""
            for m in OMIM_RE.finditer(part):
                mim = ("PS" if m.group(1) else "") + m.group(2)
                p = pheno.get(mim)
                if p is None:
                    p = pheno[mim] = {"names": {}, "series": bool(m.group(1)), "v": 0, "s": 0,
                                      "genes": {}}
                p["v"] += 1
                if st > p["s"]:
                    p["s"] = st
                if name:
                    p["names"][name] = p["names"].get(name, 0) + 1
                p["genes"][gene] = p["genes"].get(gene, 0) + 1

out = {}
for mim, p in pheno.items():
    genes = sorted(p["genes"].items(), key=lambda kv: (-kv[1], kv[0]))[:MAX_GENES_PER_PHENOTYPE]
    # Submitters word the same condition slightly differently; the wording most records use
    # is the one to show.
    name = max(p["names"].items(), key=lambda kv: (kv[1], -len(kv[0])))[0] if p["names"] else ""
    out[mim] = {"name": name or ("OMIM " + mim), "series": p["series"],
                "v": p["v"], "s": p["s"], "genes": genes}

doc = {
    "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
    "source": os.path.basename(VCF),
    "records": records,
    "pathogenic_with_omim": kept,
    "phenotypes": out,
}
with open(OUT, "w") as fh:
    json.dump(doc, fh, separators=(",", ":"))

print("%s records read, %s pathogenic with an OMIM id, %s phenotypes -> %s (%.1f MB)"
      % (records, kept, len(out), OUT, os.path.getsize(OUT) / 1e6))
