import json
import os
import re
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# Natural-language / HGVS / rsID variant description -> a structured variant,
# resolved by Anthropic ().  determines the variant TYPE and the
# genomic coordinates so the client can place a SNP/indel on any track that
# spans that position.
#
# Params (after the EngineMonitor):
#   param(1) : the user's variant text (e.g. "TP53 c.215C>T", "rs113993960",
#              "chr7:117559593 delF508", "BRAF V600E")
#   param(2) : optional gene / transcript context
#
# Env (forwarded by the server):
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL
# ---------------------------------------------------------------------------

variant_text = works.param(1)
context_hint = works.param(2)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-haiku-4-5"


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


def anthropic_variant(text, hint):
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if not text:
        return None, "empty variant"

    system = (
        "You are a clinical-genomics assistant. Given a user's variant description "
        "(free text, HGVS c./g./p., an rsID, or a protein change), determine the variant "
        "and return its GENOMIC coordinates on the GRCh38 assembly. Respond with ONLY a "
        "JSON object, no prose:\n"
        "{\n"
        '  "variant": {\n'
        '    "type": "snp" | "ins" | "del",\n'
        '    "gene": "TP53",\n'
        '    "chr": "17",              // chromosome name, no "chr" prefix\n'
        '    "genomic": 7676154,        // 1-based GRCh38 genomic position of the first affected base\n'
        '    "ref": "C",                // reference allele(s) on the + genomic strand\n'
        '    "alt": "T",                // alternate allele(s) on the + genomic strand\n'
        '    "strand": 1,               // gene/transcript strand: 1 or -1\n'
        '    "hgvs_c": "c.215C>T",     // if known\n'
        '    "hgvs_g": "g.7676154C>T",  // if known\n'
        '    "rsid": "rs28934578",      // if known\n'
        '    "ensembl": "ENST00000269305",  // an Ensembl TRANSCRIPT id that spans this position (prefer MANE Select / canonical)\n'
        '    "ensembl_gene": "ENSG00000141510",  // the Ensembl GENE id\n'
        '    "assembly": "GRCh38",\n'
        '    "label": "TP53 p.R72... ",\n'
        '    "why": "short reasoning"\n'
        "  }\n"
        "}\n"
        "Rules: type is 'snp' for a single-base substitution, 'ins' for an insertion, "
        "'del' for a deletion. ref/alt are the alleles on the PLUS genomic strand "
        "(reverse-complement if the gene is on the minus strand). Give the 1-based GRCh38 "
        "genomic position. For 'ensembl', give a stable Ensembl transcript id (ENST…) whose "
        "exons or span cover this genomic position on GRCh38 — prefer the MANE Select / "
        "canonical transcript; this lets the client fetch a track for the variant when none "
        "is loaded. If you are not confident of the exact genomic coordinate, still return "
        "your best estimate and note it in 'why'. Never invent a gene that does not match the "
        "request."
    )

    user = str(text)
    if hint:
        user += "\n\n(Context: %s)" % hint

    try:
        try:
            import claude_usage as _cu; _cu.bump("prompt-to-variant")
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
                "max_tokens": 800,
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
        parsed = parse_json_blob(txt)
        if not parsed:
            return None, "could not parse model output: %s" % (txt[:200] or "empty")
        return parsed, None
    except Exception as e:
        return None, str(e)


def build_variant(v):
    """Normalize a resolver dict (from ) into our variant shape."""
    try:
        t = str(v.get("type") or "snp").lower()
        if t.startswith("ins"):
            t = "ins"
        elif t.startswith("del"):
            t = "del"
        else:
            t = "snp"
        out = {
            "type": t,
            "gene": v.get("gene"),
            "chr": str(v.get("chr") or "").replace("chr", "").strip(),
            "genomic": int(v.get("genomic")) if v.get("genomic") is not None else None,
            "ref": str(v.get("ref") or "").upper(),
            "alt": str(v.get("alt") or "").upper(),
            "strand": int(v.get("strand")) if v.get("strand") is not None else 1,
            "hgvs_c": v.get("hgvs_c"),
            "hgvs_g": v.get("hgvs_g"),
            "rsid": v.get("rsid"),
            "ensembl": (str(v.get("ensembl")).strip() if v.get("ensembl") else None),
            "ensembl_gene": (str(v.get("ensembl_gene")).strip() if v.get("ensembl_gene") else None),
            "assembly": v.get("assembly") or "GRCh38",
            "label": v.get("label") or v.get("gene") or "variant",
            "why": v.get("why"),
        }
        if out["genomic"] is None or not out["chr"]:
            return None, "no genomic position"
        return out, None
    except Exception as e:
        return None, "could not read variant: %s" % e


def ensembl_overlap_transcript(chrom, pos):
    """Find an Ensembl transcript overlapping (chrom, pos); prefer the canonical one."""
    if not requests:
        return None, None
    try:
        r = requests.get(
            "https://rest.ensembl.org/overlap/region/human/%s:%s-%s?feature=transcript" % (chrom, pos, pos),
            headers={"Content-Type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None, None
        arr = r.json() or []
        if not arr:
            return None, None
        best = None
        for tr in arr:
            if tr.get("is_canonical") == 1:
                best = tr
                break
        if not best:
            best = arr[0]
        return (best.get("transcript_id") or best.get("id")), best.get("Parent")
    except Exception:
        return None, None


def ensembl_variation(rsid):
    """Resolve an rsID to an authoritative GRCh38 variant via the Ensembl variation API."""
    if not requests:
        return None, "python 'requests' library unavailable"
    try:
        r = requests.get(
            "https://rest.ensembl.org/variation/human/%s" % rsid,
            headers={"Content-Type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None, "ensembl variation %s: %s" % (r.status_code, r.text[:200])
        data = r.json()
        mappings = data.get("mappings") or []
        best = None
        for m in mappings:
            if str(m.get("assembly_name")) == "GRCh38":
                best = m
                break
        if not best and mappings:
            best = mappings[0]
        if not best:
            return None, "no GRCh38 mapping for %s" % rsid

        chrom = str(best.get("seq_region_name") or "").strip()
        start = best.get("start")
        allele_string = str(best.get("allele_string") or "")
        alleles = [a for a in re.split(r"[/|]", allele_string) if a != ""]
        ref = (alleles[0] if alleles else "").upper()
        alt = (alleles[1] if len(alleles) > 1 else "").upper()
        # normalize dash-style indels ('-') to empty
        ref = "" if ref == "-" else ref
        alt = "" if alt == "-" else alt

        if len(ref) == 1 and len(alt) == 1 and ref and alt:
            vtype = "snp"
        elif len(alt) > len(ref):
            vtype = "ins"
        elif len(ref) > len(alt):
            vtype = "del"
        else:
            vtype = "snp"

        if start is None or not chrom:
            return None, "ensembl mapping missing position for %s" % rsid

        ens_tx, ens_gene = ensembl_overlap_transcript(chrom, start)

        return {
            "type": vtype,
            "gene": None,
            "chr": chrom.replace("chr", ""),
            "genomic": int(start),
            "ref": ref or "N",
            "alt": alt or "N",
            "strand": int(best.get("strand", 1) or 1),
            "hgvs_c": None,
            "hgvs_g": None,
            "rsid": rsid,
            "ensembl": ens_tx,
            "ensembl_gene": ens_gene,
            "assembly": "GRCh38",
            "label": (data.get("name") or rsid),
            "why": "Ensembl variation API (%s)" % (data.get("most_severe_consequence") or "variation"),
        }, None
    except Exception as e:
        return None, str(e)


def build_hgvs(text):
    """Build a `transcript:c.change` HGVS string from a free-text variant, e.g.
    'SPTLC2 (NM_004863.4) c.778G>A p.(Glu260Lys)' -> 'NM_004863.4:c.778G>A'."""
    t = str(text or "")
    mtx = re.search(r"\b((?:NM|NR|XM|XR)_\d+(?:\.\d+)?|ENST\d+(?:\.\d+)?)\b", t, re.I)
    mc = re.search(r"\b([cng]\.[^\s;,)]+)", t)   # c./n./g. change (exclude protein p.)
    if not mc:
        return None
    change = mc.group(1)
    if mtx:
        return mtx.group(1) + ":" + change
    if change[:2].lower() == "g.":
        return "chr:" + change   # genomic HGVS still needs a chromosome; skip
    return None


def ensembl_vep_hgvs(hgvs):
    """Resolve an HGVS coding/transcript variant to a GRCh38 genomic variant via VEP."""
    if not requests:
        return None, "python 'requests' library unavailable"
    try:
        try:
            from urllib.parse import quote
        except Exception:
            from urllib import quote
        r = requests.get(
            "https://rest.ensembl.org/vep/human/hgvs/" + quote(hgvs),
            headers={"Content-Type": "application/json"}, timeout=45)
        if r.status_code != 200:
            return None, "vep %s: %s" % (r.status_code, r.text[:200])
        arr = r.json()
        if not arr:
            return None, "no VEP result for %s" % hgvs
        d = arr[0]
        chrom = str(d.get("seq_region_name") or "").replace("chr", "").strip()
        start = d.get("start")
        allele = str(d.get("allele_string") or "")
        parts = [p for p in allele.split("/") if p != ""]
        ref = (parts[0] if parts else "").upper()
        alt = (parts[1] if len(parts) > 1 else "").upper()
        strand = int(d.get("strand", 1) or 1)
        # VEP reports the alleles on the transcript/coding strand; normalize to the + strand.
        comp = {"A": "T", "T": "A", "G": "C", "C": "G", "N": "N", "-": "-"}
        def rc(s):
            return "".join(comp.get(b, b) for b in reversed(s))
        if strand == -1:
            ref = rc(ref)
            alt = rc(alt)
        gene = None
        ens_gene = None
        for tc in (d.get("transcript_consequences") or []):
            gene = gene or tc.get("gene_symbol")
            ens_gene = ens_gene or tc.get("gene_id")
        ens_tx, ens_gene2 = ensembl_overlap_transcript(chrom, start)
        ens_gene = ens_gene or ens_gene2
        if len(ref) == 1 and len(alt) == 1 and ref and alt:
            vtype = "snp"
        elif len(alt) > len(ref):
            vtype = "ins"
        elif len(ref) > len(alt):
            vtype = "del"
        else:
            vtype = "snp"
        if start is None or not chrom:
            return None, "VEP missing genomic position for %s" % hgvs
        change = hgvs.split(":")[-1]
        return {
            "type": vtype,
            "gene": gene,
            "chr": chrom,
            "genomic": int(start),
            "ref": ref or "N",
            "alt": alt or "N",
            "strand": strand,
            "hgvs_c": change if change.lower().startswith("c.") else None,
            "hgvs_g": d.get("id"),
            "rsid": None,
            "ensembl": ens_tx,
            "ensembl_gene": ens_gene,
            "assembly": "GRCh38",
            "label": ((gene + " ") if gene else "") + change,
            "why": "Ensembl VEP (%s)" % (d.get("most_severe_consequence") or "hgvs"),
        }, None
    except Exception as e:
        return None, str(e)


variant = None
err = None
mode = "anthropic"

# rsIDs: go straight to the Ensembl variation API (authoritative), not the model.
rsm = re.match(r"^\s*(rs\d+)\s*$", str(variant_text or ""), re.I)
if rsm:
    mode = "ensembl"
    variant, err = ensembl_variation(rsm.group(1).lower())
    works.progress(50)

# HGVS coding/transcript notation (e.g. "NM_004863.4 c.778G>A") -> VEP (authoritative
# genomic mapping from the c./transcript coordinate), not the model.
if not variant:
    hgvs = build_hgvs(variant_text)
    if hgvs and ":" in hgvs and not hgvs.startswith("chr:"):
        mode = "vep"
        variant, verr = ensembl_vep_hgvs(hgvs)
        if not variant:
            err = err or verr
        works.progress(55)

# Anything else (or an id VEP/Ensembl could not resolve): let  resolve it.
if not variant:
    if rsm or mode == "vep":
        mode = "anthropic-fallback"
    parsed, cerr = anthropic_variant(variant_text, context_hint)
    works.progress(70)
    if parsed:
        v = parsed.get("variant") or parsed
        variant, verr = build_variant(v)
        if not variant:
            err = err or verr or cerr
    else:
        err = err or cerr

if not variant and not err:
    err = "could not resolve the variant"

works.progress(100)

works.resolve({
    "input": str(variant_text or ""),
    "mode": mode,
    "error": err,
    "variant": json.dumps(variant) if variant else "",
})
