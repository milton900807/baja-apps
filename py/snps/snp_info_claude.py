import json
import os
import re

# "More information" for a SNP/indel, answered by the Claude API. The prompt includes the
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
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5"

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
name = str(snp.get("name") or "")
sid = str(snp.get("id") or "")
clinsig = str(snp.get("clinsig") or "").strip()

m = re.search(r"rs\d+", name + " " + sid, re.I)
rsid = m.group(0) if m else ""

# Genomic context lines for the prompt / search.
locus = ("chr%s:%s" % (chrom, position)) if (chrom and position) else ""
ctx = []
if gene_symbol:
    ctx.append("Gene symbol: %s" % gene_symbol)
if locus:
    ctx.append("Genomic locus (GRCh38): %s" % locus)
if ref or alt:
    ctx.append("Change: %s>%s" % (ref or "?", alt or "?"))
if rsid:
    ctx.append("dbSNP: %s" % rsid)
if clinsig:
    ctx.append("ClinVar significance: %s" % clinsig)
context = "\n".join(ctx) if ctx else "(no structured context available)"

prompt = (
    "You are a clinical genomics assistant. In 2-4 short sentences, summarize what is "
    "known about this human variant: its likely functional/clinical significance, any "
    "associated diseases or phenotypes, and the gene's normal role. Be specific to the "
    "gene and locus below. If the exact variant is not well characterized, say so and "
    "describe the gene/region context instead. Do not fabricate citations or IDs.\n\n"
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
    "rsid": rsid,
    "error": err,
})
