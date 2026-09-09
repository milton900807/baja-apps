import json
import os
import re
import shutil
import subprocess

# "More information" for a SNP/indel, answered by the  API. The prompt includes the
# genomic context — gene symbol, genomic locus (chr:pos), ref>alt, dbSNP id, ClinVar
# significance — so the summary is specific to the variant/gene.
#   let r = await exec('py/snps/snp_info_claude.py', JSON.stringify(snp), geneSymbol, chr, pos)
#   graph.setCenterParagraph(r['mutation_paragraph'])
#
# Params:
#   param(1): SNP object as a JSON string
#   param(2): gene symbol (optional)
#   param(3): chromosome (optional)
#   param(4): genomic position (optional)

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-haiku-4-5"

ENSEMBL_REST = "https://rest.ensembl.org"
ENSEMBL_SPECIES = {"human": "homo_sapiens", "mouse": "mus_musculus",
                   "rat": "rattus_norvegicus", "dog": "canis_lupus_familiaris"}


CLINVAR = "reference_data/variants/clinvar.vcf.gz"


def _first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        q = os.path.join(base, rel)
        if os.path.exists(q):
            return q
    return ""


def _clinvar_rows(chrom, pos):
    """The ClinVar records AT one position. Contigs in that file are bare ("16"), but both
    spellings are tried because the file is replaceable and the next one may differ."""
    path = _first_existing(CLINVAR)
    if not path or not chrom or not pos:
        return []
    bare = str(chrom)[3:] if str(chrom).lower().startswith("chr") else str(chrom)
    out = []
    for q in (bare, "chr" + bare):
        try:
            import pysam
            tb = pysam.TabixFile(path)
            out = [r for r in tb.fetch(q, max(0, int(pos) - 1), int(pos))]
        except Exception:
            out = []
            tabix = shutil.which("tabix")
            if tabix:
                try:
                    pr = subprocess.run([tabix, path, "%s:%d-%d" % (q, int(pos), int(pos))],
                                        capture_output=True, text=True, timeout=60)
                    out = [ln for ln in pr.stdout.splitlines() if ln and not ln.startswith("#")]
                except Exception:
                    out = []
        if out:
            return out
    return out


def _info_field(info, key):
    i = info.find(key + "=")
    if i < 0:
        return ""
    return info[i + len(key) + 1:].split(";")[0]


def resolve_locus_clinical(chrom, pos, ref="", alt=""):
    """WHAT CLINVAR SAYS ABOUT THIS EXACT VARIANT, found by POSITION.

    The rs-number lookup above can only run when the variant datastructure carries an rs
    number, and most do not: a VCF straight off a sequencer names its rows by locus, so
    the clinical question went unanswered for exactly the variants a user is most likely
    to be looking at. ClinVar is already on this server, tabix-indexed, for the karyotype's
    pathogenic filter -- so the same question can be asked of a position.

    ALLELE-SPECIFIC, deliberately. A significance belongs to one REF>ALT, not to a
    coordinate: a pathogenic C>T and a benign C>G sit at the same base, and reporting
    either for the other would be worse than saying nothing. When ref/alt are known only
    an exact allele match is used; only when they are unknown does a position match stand
    in, and then every record there is returned rather than one picked arbitrarily.
    """
    rows = _clinvar_rows(chrom, pos)
    if not rows:
        return None
    R, A = str(ref or "").upper(), str(alt or "").upper()
    exact = []
    for ln in rows:
        f = ln.split("\t")
        if len(f) < 8:
            continue
        if R and A:
            if f[3].upper() != R or A not in [x.upper() for x in f[4].split(",")]:
                continue
        exact.append(f)
    if not exact:
        return None

    sigs, phenos, rsids, genes, hgvs, review = [], [], [], [], "", ""
    for f in exact:
        info = f[7]
        sig = _info_field(info, "CLNSIG").replace("_", " ").strip()
        if sig and sig not in sigs:
            sigs.append(sig)
        for d in _info_field(info, "CLNDN").split("|"):
            d = d.replace("_", " ").strip()
            # ClinVar uses these two as "no condition recorded"; they are not phenotypes.
            if d and d.lower() not in ("not provided", "not specified") and d not in phenos:
                phenos.append(d)
        rs = _info_field(info, "RS")
        if rs and rs.isdigit():
            rsids.append("rs" + rs)
        gi = _info_field(info, "GENEINFO").split("|")[0].split(":")[0]
        if gi and gi not in genes:
            genes.append(gi)
        if not hgvs:
            hgvs = _info_field(info, "CLNHGVS")
        if not review:
            review = _info_field(info, "CLNREVSTAT").replace("_", " ").strip()
    if not sigs and not phenos:
        return None
    return {
        "clinsig": sigs, "phenotypes": phenos[:8],
        "alleles": ("%s/%s" % (exact[0][3], exact[0][4])) if exact else "",
        "rsid": rsids[0] if rsids else "", "gene": genes[0] if genes else "",
        "hgvs": hgvs, "review": review,
        "allele_matched": bool(R and A),
    }


def resolve_rsid_clinical(rsid, species="human"):
    """Look up an rs number's ASSOCIATED CLINICAL INFORMATION via Ensembl — the ClinVar/dbSNP
    clinical significance and the phenotypes/conditions it is linked to, plus its allele string.
    Returns {clinsig:[...], phenotypes:[...], alleles:'C/T'} or None."""
    if requests is None or not rsid:
        return None
    sp = ENSEMBL_SPECIES.get((species or "human").lower(), (species or "human").lower())
    try:
        r = requests.get("%s/variation/%s/%s?phenotypes=1" % (ENSEMBL_REST, sp, rsid),
                         headers={"content-type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None
        d = r.json() or {}
    except Exception:
        return None
    cs = [c for c in (d.get("clinical_significance") or []) if c and c.lower() not in ("other", "not provided")]
    phenos, seen = [], set()
    for p in (d.get("phenotypes") or []):
        tr = ("" + (p.get("trait") or p.get("description") or "")).strip()
        k = tr.lower()
        if tr and not re.search(r"^clinvar\b|not (provided|specified)|^none$", tr, re.I) and k not in seen:
            seen.add(k)
            phenos.append(tr)
    alleles = ""
    try:
        maps = d.get("mappings") or []
        if maps:
            alleles = str(maps[0].get("allele_string", ""))
    except Exception:
        alleles = ""
    return {"clinsig": cs, "phenotypes": phenos[:8], "alleles": alleles}


snp_raw = works.param(1)
# THE VARIANT ARRIVES AS JSON, AND JSON HAS COMMAS IN IT.
#
# works.arg() turns any parameter containing a comma into an array -- that is what it is
# for, and every other script here relies on it. But this one is handed
# JSON.stringify(snp), so the variant's whole datastructure was being split at every comma
# and delivered as a list of fragments:
#
#     ['{"type":"snp"', '"xi":31659700', '"name":"rs121912442"}', ...]
#
# The parse below then saw a list rather than a string, fell through to {}, and every
# field read out of it -- reference, alternate, name, id, clinsig -- came back empty. So
# the rs number was never found, the ClinVar lookup never ran, and the model was asked
# about a variant it had been told nothing about: "No specific clinical information is
# available for this variant", every time, for every SNP.
#
# The split is on "," with each piece stripped, so joining on "," puts back exactly what
# JSON.stringify produced (which is compact -- no spaces after its commas).
if isinstance(snp_raw, (list, tuple)):
    try:
        snp_raw = ",".join(str(x) for x in snp_raw)
    except Exception:
        snp_raw = ""
gene_symbol = str(works.param(2) or "").strip()
chrom = str(works.param(3) or "").strip().replace("chr", "")
position = str(works.param(4) or "").strip()

snp = {}
try:
    snp = json.loads(snp_raw) if isinstance(snp_raw, str) else (snp_raw or {})
    if not isinstance(snp, dict):
        snp = {}
except Exception:
    snp = {}

ref = str(snp.get("reference") or snp.get("reference0") or "").strip()
alt = str(snp.get("alternate") or snp.get("alternate0") or "").strip()
name = str(snp.get("name") or "").strip()
sid = str(snp.get("id") or "").strip()
clinsig = str(snp.get("clinsig") or "").strip()
is_peptide = bool(snp.get("peptide"))

# Only treat `id` as a real identifier if it is one — the SnpIndel's `id` is often internal
# (e.g. a color like "#dc2626"), which is NOT variant metadata and must not reach the model.
sid_meaningful = bool(re.search(r"(rs\d+|VCV|COS|SCV|ENS|NM_|NC_|chr|c\.|g\.|p\.)", sid, re.I))
# Find an rs number ANYWHERE in the variant datastructure (name, id, or any nested field).
_raw_str = snp_raw if isinstance(snp_raw, str) else ""
if not _raw_str:
    try:
        _raw_str = json.dumps(snp)
    except Exception:
        _raw_str = ""
m = re.search(r"rs\d+", (_raw_str + " " + name + " " + sid), re.I)
rsid = m.group(0).lower() if m else ""
# When the datastructure carries an rs number, look up its associated clinical information so it
# can be surfaced in the annotation (and the caller can re-key the SnpIndel to the rs number).
rs_clin = resolve_rsid_clinical(rsid) if rsid else None

# NO RS NUMBER, OR ONE THAT RESOLVED TO NOTHING: ask ClinVar where the variant IS.
# This is the case for anything read off a plain VCF, which names its rows by locus.
loc_clin = None
if not (rs_clin and (rs_clin.get("clinsig") or rs_clin.get("phenotypes"))):
    try:
        loc_clin = resolve_locus_clinical(chrom, position, ref, alt)
    except Exception as e:
        works.msg("clinvar lookup failed: %s" % e)
        loc_clin = None
# ClinVar often carries the rs number the datastructure lacked. Taking it here means the
# caller can re-key the SnpIndel to it exactly as it does for a variant that arrived with
# one -- the lookup that found the clinical data also names the variant.
if loc_clin and loc_clin.get("rsid") and not rsid:
    rsid = loc_clin["rsid"]
# One shape downstream, whichever lookup answered.
clin = rs_clin if (rs_clin and rs_clin.get("clinsig")) else loc_clin

# Build the prompt context from ONLY the metadata that is relevant to this variant — the
# variant name (e.g. an amino-acid change like "G93A") and the gene. Never surface placeholder
# alleles (NNN / N / N>N) — they are meaningless.
locus = ("chr%s:%s" % (chrom, position)) if (chrom and position) else ""
ctx = []
if gene_symbol:
    ctx.append("Gene symbol: %s" % gene_symbol)
# The variant's own label (a protein/amino-acid change like "G93A", or an HGVS/rs descriptor).
if name and name.lower() != "variant":
    ctx.append(("Amino-acid change: %s" if is_peptide else "Variant: %s") % name)
if locus:
    ctx.append("Genomic locus (GRCh38): %s" % locus)
# A nucleotide change only if it is REAL — reject placeholders (anything containing N, or X>X).
_r = ref.upper()
_a = alt.upper()
if (not is_peptide and _r and _a and _r != _a
        and "N" not in _r and "N" not in _a and _r != "?" and _a != "?"):
    ctx.append("Change: %s>%s" % (ref, alt))
if rsid:
    ctx.append("dbSNP: %s" % rsid)
elif sid_meaningful:
    ctx.append("Identifier: %s" % sid)
# Authoritative clinical info looked up FROM the rs number (ClinVar/dbSNP via Ensembl).
if clin and clin.get("clinsig"):
    ctx.append("ClinVar/dbSNP clinical significance: %s" % ", ".join(clin["clinsig"]))
if clin and clin.get("phenotypes"):
    ctx.append("Associated condition(s): %s" % "; ".join(clin["phenotypes"]))
if loc_clin and loc_clin is clin:
    # Said explicitly, because it is the difference between "ClinVar has this variant"
    # and "ClinVar has something at this coordinate".
    if loc_clin.get("hgvs"):
        ctx.append("ClinVar HGVS: %s" % loc_clin["hgvs"])
    if loc_clin.get("review"):
        ctx.append("ClinVar review status: %s" % loc_clin["review"])
if rs_clin and rs_clin.get("phenotypes"):
    ctx.append("Associated conditions/phenotypes: %s" % "; ".join(rs_clin["phenotypes"]))
if rs_clin and rs_clin.get("alleles") and "/" in rs_clin["alleles"] and "N" not in rs_clin["alleles"].upper():
    ctx.append("Alleles: %s" % rs_clin["alleles"])
if clinsig and not (rs_clin and rs_clin.get("clinsig")):
    ctx.append("ClinVar significance: %s" % clinsig)
context = "\n".join(ctx) if ctx else "(no structured context available)"

prompt = (
    "You are a clinical genomics assistant. Describe ONLY what is specifically known about THIS "
    "variant — its clinical significance, pathogenicity classification, the disease/phenotype it "
    "causes or is associated with, and its specific functional effect. You MAY name the gene by "
    "its SYMBOL, but do NOT describe the gene's normal function/role, biology, pathway, or any "
    "general gene/region background — nothing beyond the gene symbol. "
    "If specific information about this exact variant IS available, make it clearly visible: state "
    "its clinical significance and associated condition up front, and include the variant's "
    "specific identifiers (rsID / ClinVar significance / protein change) when given. "
    "If NOTHING specific is known about this exact variant, reply with only: "
    "\"No specific clinical information is available for this variant.\" — do NOT pad with gene "
    "background. Keep it to 1-3 short sentences. Do not fabricate citations or IDs. "
    "Do NOT use the phrase \"corresponds to the\". "
    "NEVER write a placeholder nucleotide change such as \"N>N\" (or any X>X) — it is "
    "meaningless. If only a protein/amino-acid change is known, describe it as an amino-acid "
    "(peptide) mutation, never as a nucleotide change.\n\n"
    + context
)

paragraph = None
err = None

if not requests:
    err = "requests unavailable on server python"
elif not ANTHROPIC_API_KEY:
    err = "ANTHROPIC_API_KEY is not set on the server"
else:
    try:
        try:
            import claude_usage as _cu; _cu.bump("snp_info_claude")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 600,
                "temperature": 0.2,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=45,
        )
        if r.status_code == 200:
            data = r.json()
            parts = data.get("content") or []
            paragraph = "".join(
                p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text"
            ).strip()
        else:
            err = "anthropic %s: %s" % (r.status_code, r.text[:200])
    except Exception as e:
        err = str(e)

if not paragraph:
    paragraph = "No additional information available" + ((" (" + err + ")") if err else "") + "."

works.resolve({
    "mutation_paragraph": paragraph,
    "gene_symbol": gene_symbol,
    "locus": locus,
    "rsid": rsid,                                              # so the caller can re-key the SnpIndel
    "clinsig": (clin or {}).get("clinsig") or [],
    "phenotypes": (clin or {}).get("phenotypes") or [],
    "alleles": (clin or {}).get("alleles") or "",
    # Which lookup answered, so a caller can tell a dbSNP-keyed answer from a
    # coordinate-keyed one rather than having to guess.
    "clinsource": ("dbSNP" if (clin and clin is rs_clin) else ("ClinVar" if clin else "")),
    "error": err,
})
