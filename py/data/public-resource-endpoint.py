import json
import os
import re
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# Public-resource endpoint finder (Anthropic / Claude).
#
# Given a public genomics resource (RNASeq, ClinVar, dbSNP, GWAS, conservation,
# ...), a genome build and a region (chr:start-end), Claude proposes candidate
# PUBLIC bigWig or VCF data endpoints (files/URLs) that cover the region. The
# client then (a) lets the user pick one if there is more than one, and (b)
# reads the chosen endpoint as a bigWig / VCF to build a track-layer (see
# public-data.js). The genomic coordinates are passed through so Claude can
# scope the suggestions to the region.
#
# Params (after the EngineMonitor at param(0)):
#   param(1) : resource label
#   param(2) : chromosome
#   param(3) : region start (genomic)
#   param(4) : region end (genomic)
#   param(5) : genome / species hint
#   param(6) : optional free-text refinement
#
# Env: ANTHROPIC_API_KEY, ANTHROPIC_MODEL
# ---------------------------------------------------------------------------

resource = works.param(1)
chrom = works.param(2)
start = works.param(3)
end = works.param(4)
genome = works.param(5)
user_query = works.param(6)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5"


def parse_json_blob(txt):
    if not txt:
        return None
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def url_ok(url):
    """True if the URL is reachable (not 404/unreachable). HEAD first, falling
    back to a tiny ranged GET for hosts that reject HEAD."""
    if not requests or not url:
        return False
    hdrs = {"User-Agent": "baja/1.0"}
    try:
        r = requests.head(url, timeout=15, allow_redirects=True, headers=hdrs)
        if r.status_code in (403, 405, 501) or r.status_code >= 400:
            r = requests.get(url, timeout=15, allow_redirects=True, stream=True,
                             headers=dict(hdrs, Range="bytes=0-0"))
            r.close()
        return r.status_code < 400
    except Exception:
        return False


def anthropic_candidates(resource, chrom, start, end, genome, user_query):
    """Ask Claude for candidate bigWig / VCF endpoints. Returns (list, error)."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"

    system = (
        "You locate PUBLIC bigWig (.bw/.bigWig) or VCF (.vcf/.vcf.gz) data files for a "
        "genomics resource in a given genome build / species. Only suggest real, publicly "
        "reachable files/URLs (e.g. UCSC hgdownload / track hubs, ENCODE portal files, "
        "Ensembl FTP, GTEx, gnomAD, Roadmap Epigenomics, 1000 Genomes) whose data type is "
        "a bigWig signal track or a VCF of variants. These are WHOLE-GENOME files — do NOT "
        "scope them to a region (the client reads the chosen file over a specific region "
        "later). The endpoint MUST be a bigWig or VCF file (not a JSON REST API).\n"
        "Respond with ONLY a JSON object, no prose:\n"
        "{\n"
        '  "candidates": [\n'
        '    {"label": "<human label>", "url": "<direct https URL to the .bw or .vcf(.gz)>", '
        '"type": "bigwig|vcf", "genome": "<build>", "notes": "<one short line>"}\n'
        "  ]\n"
        "}\n"
        "Rules: return 1-8 candidates most relevant to the resource and genome build. If you "
        "cannot find a real file, return an empty candidates list."
    )

    user = (
        "Resource: " + str(resource) +
        "\nGenome / species: " + str(genome or "human")
    )
    if user_query:
        user += "\nExtra: " + str(user_query)

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
                "max_tokens": 1000,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=45,
        )
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        parts = data.get("content", []) or []
        txt = "".join(b.get("text", "") for b in parts if b.get("type") == "text")
        spec = parse_json_blob(txt)
        if not spec:
            return None, "model output not parseable: %s" % (txt[:200] or "empty")
        cands = spec.get("candidates") or []
        clean = []
        for c in cands:
            if not isinstance(c, dict):
                continue
            url = str(c.get("url") or "").strip()
            typ = str(c.get("type") or "").strip().lower()
            if not url:
                continue
            if typ not in ("bigwig", "vcf"):
                typ = "vcf" if (".vcf" in url.lower()) else "bigwig"
            clean.append({
                "label": str(c.get("label") or url)[:120],
                "url": url,
                "type": typ,
                "genome": str(c.get("genome") or genome or ""),
                "notes": str(c.get("notes") or "")[:160],
            })
        return clean, None
    except Exception as e:
        return None, str(e)


works.progress(40)
candidates, err = anthropic_candidates(resource, chrom, start, end, genome, user_query)

if candidates is None:
    candidates = []

# Only show endpoints whose URL is actually reachable (drop 404 / dead links).
if candidates:
    try:
        works.msg("Validating " + str(len(candidates)) + " endpoint(s)…")
    except Exception:
        pass
    candidates = [c for c in candidates if url_ok(c.get("url"))]

works.progress(100)

if not candidates and not err:
    err = "no reachable bigWig / VCF endpoints found for this resource + region"

works.resolve({
    "resource": str(resource or ""),
    "chr": str(chrom or ""),
    "start": str(start or ""),
    "end": str(end or ""),
    "error": err,
    "count": len(candidates),
    "candidates": json.dumps(candidates),
})
