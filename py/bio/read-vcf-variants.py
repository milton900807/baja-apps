import os
import sys
import json

# Query a bgzip+tabix-indexed VCF by genomic region and return normalized variants.
# Designed to be invoked with the lionscript exec(), e.g.
#   let res = await exec(server + '/py/bio/read-vcf-variants.py', em, 'clinvar', chr, start, end)
#   let variants = JSON.parse(res.variants)
#
# Params (after the EngineMonitor):
#   param(1): a known database token ('clinvar') OR a VCF path (absolute, BIG_DATA
#             '/bd/…', or relative to the server dir)
#   param(2): chromosome (e.g. '17' or 'chr17')
#   param(3): start (1-based)
#   param(4): end   (1-based, inclusive)
#   param(5): optional db label for the 'source' field (defaults to the token)

from ion import works

try:
    import pysam
except Exception:
    pysam = None

MAX_ROWS = 5000
# Skip structural variants: alleles longer than this (bp) aren't point variants and
# would render as giant deletions/insertions spanning the region.
MAX_ALLELE = 50
_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA")

# Known databases -> their VCF under the server reference store.
VARIANT_VCF = {
    "clinvar": "reference_data/variants/clinvar.vcf.gz",
}

token = str(works.param(1) or "clinvar")
chrom = str(works.param(2) or "")
start = int(float(works.param(3) or 0))
end = int(float(works.param(4) or 0))
db = str(works.param(5) or token).lower()


def _first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return rel


def resolve_vcf(tok):
    t = str(tok)
    key = t.lower()
    if key in VARIANT_VCF:
        return _first_existing(VARIANT_VCF[key])
    if os.path.isabs(t):
        return t
    if _BD and t.startswith("/bd/"):
        return _BD.rstrip("/") + t[3:]
    return _first_existing(t)


def parse_info(info):
    d = {}
    for kv in str(info or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k] = v
        elif kv:
            d[kv] = ""
    return d


path = resolve_vcf(token)
variants = []
err = None

if not pysam:
    err = "pysam is not available on this server's python3"
elif not chrom or end <= 0:
    err = "missing chrom/start/end"
elif not os.path.exists(path):
    err = "vcf not found: " + path
else:
    try:
        chrom_q = chrom.replace("chr", "")
        tb = pysam.TabixFile(path)
        contigs = set(tb.contigs)
        cand = chrom_q if chrom_q in contigs else ("chr" + chrom_q if ("chr" + chrom_q) in contigs else chrom_q)
        for row in tb.fetch(cand, max(0, start - 1), end):
            f = row.split("\t")
            if len(f) < 8:
                continue
            pos = int(f[1])
            ref = f[3]
            if len(ref) > MAX_ALLELE:
                continue   # structural variant — too large for a point marker
            info = parse_info(f[7])
            clinsig = []
            if info.get("CLNSIG"):
                s = info["CLNSIG"].replace("_", " ").replace("|", ",").replace("/", ",")
                clinsig = [x.strip() for x in s.split(",") if x.strip()]
            gene = (info.get("GENEINFO", "").split(":")[0] or None)
            rid = ("rs" + info["RS"]) if info.get("RS") else (f[2] if (f[2] and f[2] != ".") else db)
            consequence = info["MC"].split("|")[-1] if info.get("MC") else None
            for alt in str(f[4] or "").split(","):
                if len(alt) > MAX_ALLELE:
                    continue   # structural alt allele
                variants.append({
                    "id": rid,
                    "chr": f[0].replace("chr", ""),
                    "start": pos,
                    "end": pos + max(0, len(ref) - 1),
                    "strand": 1,
                    "ref": ref,
                    "alt": alt,
                    "alleles": [ref, alt],
                    "clinsig": clinsig,
                    "consequence": consequence,
                    "source": ("ClinVar" if db == "clinvar" else db),
                    "af": None,
                    "gene": gene,
                })
                if len(variants) >= MAX_ROWS:
                    break
            if len(variants) >= MAX_ROWS:
                break
    except Exception as e:
        err = str(e)

works.resolve({
    "db": db,
    "region": "%s:%s-%s" % (chrom, start, end),
    "count": len(variants),
    "error": err,
    "variants": json.dumps(variants),
})
