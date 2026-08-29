import json
import os
import re

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
if rs_clin and rs_clin.get("clinsig"):
    ctx.append("ClinVar/dbSNP clinical significance: %s" % ", ".join(rs_clin["clinsig"]))
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
    "clinsig": (rs_clin or {}).get("clinsig") or [],
    "phenotypes": (rs_clin or {}).get("phenotypes") or [],
    "alleles": (rs_clin or {}).get("alleles") or "",
    "error": err,
})
