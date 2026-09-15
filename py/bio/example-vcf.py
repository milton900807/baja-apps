"""Example VCFs, at REAL coordinates, to show off the multi-sample and phasing features.

The karyotype colours by sample, by phase, and reads a tumour against its normal — but a
first-time visitor has no VCF of that shape to try it on. This builds one: it draws real
Pathogenic / Likely-pathogenic records from ClinVar (so every mark lands on a true GRCh38
coordinate with a real REF/ALT and CLNSIG), spread across the chromosomes, and synthesises
the SAMPLE and genotype columns for the requested shape. The COORDINATES are real; the
genotypes are illustrative and say so in the VCF header.

Types:
    tumor_normal  two samples (TUMOR, NORMAL): somatic (0/1 tumour, 0/0 normal), shared
                  germline, and a few LOH sites (1/1 tumour, 0/1 normal)
    phased        one sample (PATIENT) with phased calls (1|0, 0|1, 1|1) and some unphased
    trio          FATHER, MOTHER, CHILD with Mendelian inheritance and a few de novos
    multisample   five samples (S1..S5), each variant carried by a different subset

Params (after the EngineMonitor):
    param(1) : type (default tumor_normal)
    param(2) : optional species (ClinVar is GRCh38 human only)
    param(3) : optional variants-per-chromosome (default 8)

Resolves:
    { ok, type, name, samples, n, vcf, error }
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
CLINVAR = "reference_data/variants/clinvar.vcf.gz"
_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA") or os.path.expanduser("~/baja-bd")
CONTIGS = ["chr" + c for c in [str(i) for i in range(1, 23)] + ["X"]]

vtype = (str(works.param(1) or "tumor_normal").strip().lower() or "tumor_normal")
if vtype not in ("tumor_normal", "phased", "trio", "multisample"):
    vtype = "tumor_normal"
try:
    per = max(2, min(40, int(float(works.param(3) or 8))))
except Exception:
    per = 8

out = {"ok": False, "type": vtype, "name": "", "samples": "[]", "n": 0, "vcf": "", "error": None}


def first_existing(rel):
    if os.environ.get("CLINVAR_PATH") and os.path.exists(os.environ["CLINVAR_PATH"]):
        return os.environ["CLINVAR_PATH"]
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def contigs_of(path):
    if pysam is not None:
        try:
            return set(pysam.TabixFile(path, encoding="utf-8").contigs)
        except Exception:
            pass
    if not _TABIX:
        return set()
    try:
        p = subprocess.run([_TABIX, "-l", path], capture_output=True, text=True, timeout=60)
        return set(x.strip() for x in p.stdout.splitlines() if x.strip())
    except Exception:
        return set()


def rows(path, contig):
    if pysam is not None:
        try:
            tb = pysam.TabixFile(path, encoding="utf-8")
            for row in tb.fetch(contig):
                yield row.split("\t")
            return
        except Exception:
            pass
    if not _TABIX:
        return
    proc = subprocess.Popen([_TABIX, path, contig], stdout=subprocess.PIPE, text=True)
    for line in proc.stdout:
        if line and line[0] != "#":
            yield line.rstrip("\n").split("\t")
    proc.wait()


def resolve_contig(names, want):
    bare = want[3:] if want.lower().startswith("chr") else want
    for c in (want, bare, "chr" + bare):
        if c and c in names:
            return c
    return ""


def info_of(s):
    d = {}
    for part in s.split(";"):
        k, _, v = part.partition("=")
        d[k] = v
    return d


# A tiny deterministic PRNG so the same type always yields the same VCF (no Python `random`
# seeding surprises across versions). 0..1 from an integer key.
def rnd(n):
    x = (n * 2654435761) & 0xFFFFFFFF
    x ^= (x >> 13)
    x = (x * 1274126177) & 0xFFFFFFFF
    x ^= (x >> 16)
    return (x & 0xFFFFFF) / float(0x1000000)


def pick_variants(path, names):
    """Real P/LP SNVs, up to `per` evenly spaced across each chromosome."""
    picked = []
    for want in CONTIGS:
        c = resolve_contig(names, want)
        if not c:
            continue
        snvs = []
        for f in rows(path, c):
            if len(f) < 8:
                continue
            ref, alt = f[3].upper(), f[4].upper()
            if len(ref) != 1 or len(alt) != 1 or alt in (".", ",") or "," in alt:
                continue
            if ref not in "ACGT" or alt not in "ACGT":
                continue
            info = info_of(f[7])
            head = info.get("CLNSIG", "").lower().split("|")[0].replace(",_low_penetrance", "")
            if not (head.startswith("pathogenic") or head.startswith("likely_pathogenic")):
                continue
            try:
                pos = int(f[1])
            except ValueError:
                continue
            gene = info.get("GENEINFO", "").split("|")[0].split(":")[0]
            sig = "Pathogenic" if head.startswith("pathogenic") else "Likely_pathogenic"
            snvs.append((want, pos, ref, alt, gene, sig))
        if not snvs:
            continue
        # Even spread across the chromosome's records, not the first `per`.
        step = max(1, len(snvs) // per)
        for i in range(0, len(snvs), step):
            picked.append(snvs[i])
            if sum(1 for x in picked if x[0] == want) >= per:
                break
    return picked


def genotypes(vtype, i):
    """Return (samples_header_list, [gt per sample]) for variant index i."""
    if vtype == "tumor_normal":
        b = rnd(i * 7 + 1)
        if b < 0.55:
            return ["0/1", "0/0"]        # somatic
        if b < 0.85:
            return ["0/1", "0/1"]        # shared germline
        return ["1/1", "0/1"]            # LOH in the tumour
    if vtype == "phased":
        b = rnd(i * 11 + 3)
        if b < 0.35:
            return ["1|0"]
        if b < 0.70:
            return ["0|1"]
        if b < 0.85:
            return ["1|1"]
        return ["0/1"]                   # unphased het
    if vtype == "trio":
        fa = "0/1" if rnd(i * 5 + 2) < 0.5 else "0/0"
        mo = "0/1" if rnd(i * 5 + 9) < 0.5 else "0/0"
        if rnd(i * 13 + 4) < 0.06:
            return [fa if fa != "0/1" else "0/0", mo if mo != "0/1" else "0/0", "0/1"]  # de novo in child
        # child inherits one allele from each parent
        fa_al = 1 if (fa == "1/1" or (fa == "0/1" and rnd(i * 17 + 1) < 0.5)) else 0
        mo_al = 1 if (mo == "1/1" or (mo == "0/1" and rnd(i * 17 + 2) < 0.5)) else 0
        child = "%d/%d" % (min(fa_al, mo_al), max(fa_al, mo_al))
        return [fa, mo, child]
    # multisample: five samples, a different carried subset each time, at least one carrier
    gts = []
    for s in range(5):
        r = rnd(i * 31 + s * 7 + 5)
        gts.append("1/1" if r < 0.12 else ("0/1" if r < 0.5 else "0/0"))
    if all(g == "0/0" for g in gts):
        gts[i % 5] = "0/1"
    return gts


HEADER_SAMPLES = {
    "tumor_normal": ["TUMOR", "NORMAL"],
    "phased": ["PATIENT"],
    "trio": ["FATHER", "MOTHER", "CHILD"],
    "multisample": ["S1", "S2", "S3", "S4", "S5"],
}
NICE_NAME = {
    "tumor_normal": "example_tumor_normal.vcf",
    "phased": "example_phased.vcf",
    "trio": "example_trio.vcf",
    "multisample": "example_multisample.vcf",
}

path = first_existing(CLINVAR)
if not path:
    out["error"] = "ClinVar is not on this server (%s)" % CLINVAR
else:
    names = contigs_of(path)
    works.msg("Reading real pathogenic coordinates from ClinVar…")
    variants = pick_variants(path, names)
    if not variants:
        out["error"] = "no pathogenic variants could be read from ClinVar"
    else:
        samples = HEADER_SAMPLES[vtype]
        lines = [
            "##fileformat=VCFv4.2",
            "##source=BajaBio example VCF — REAL ClinVar GRCh38 pathogenic coordinates, "
            "illustrative (synthetic) genotypes for the %s demonstration" % vtype,
            "##FILTER=<ID=PASS,Description=\"All filters passed\">",
            "##INFO=<ID=CLNSIG,Number=.,Type=String,Description=\"ClinVar clinical significance\">",
            "##INFO=<ID=GENEINFO,Number=1,Type=String,Description=\"Gene\">",
            "##FORMAT=<ID=GT,Number=1,Type=String,Description=\"Genotype\">",
            "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t" + "\t".join(samples),
        ]
        for i, (chrom, pos, ref, alt, gene, sig) in enumerate(variants):
            gts = genotypes(vtype, i)
            info = "CLNSIG=%s" % sig + (";GENEINFO=%s" % gene if gene else "")
            lines.append("\t".join([chrom, str(pos), ".", ref, alt, ".", "PASS", info, "GT"] + gts))
        out["ok"] = True
        out["name"] = NICE_NAME[vtype]
        out["samples"] = json.dumps(samples)
        out["n"] = len(variants)
        out["vcf"] = "\n".join(lines) + "\n"
        works.msg("%d variants, %d sample(s)" % (len(variants), len(samples)))

works.resolve(out)
