#!/usr/bin/env python3
"""
Points-of-interest finder (mutation mode): given a GENE SYMBOL and SPECIES, ask 
to surface important known mutations/variants for that gene that carry a stable database
ID (dbSNP rsID, ClinVar, COSMIC, or HGVS). Any dbSNP rsID is then resolved through the
Ensembl REST API to its EXACT genomic coordinates (authoritative), overriding the model's
coordinate. Each returned point includes the variant id, its genomic location, a title,
and a one-sentence note on why it matters.

Invoked by the server:  python3 points-of-interest.py jfile:<argsfile>
Ionworks params:
    param(1) : gene symbol (or transcript id)
    param(2) : species  (e.g. "human", "mouse", "rat")
    param(3) : chromosome, for assembly context  (e.g. "chr12" or "12")
    param(4) : anchor coord start (assembly context only; NOT a constraint)
    param(5) : anchor coord end   (assembly context only; NOT a constraint)
Emits IONWORKS:RESOLUTION with { points:[{id,chr,start,end,title,comment,resolved}], error, count }.
"""
import json
import os
import re

from ion import works  # type: ignore

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Points-of-interest is a quick interactive lookup, so use the FASTEST model Claude
# offers (Haiku 4.5) by default rather than the slower global default. Override with
# POINTS_MODEL if ever needed; kept independent of ANTHROPIC_MODEL so a global Sonnet
# setting can't slow this path down.
ANTHROPIC_MODEL = os.environ.get("POINTS_MODEL") or "claude-haiku-4-5"

# species -> Ensembl REST species slug
ENSEMBL_SPECIES = {
    "human": "homo_sapiens",
    "mouse": "mus_musculus",
    "rat": "rattus_norvegicus",
    "dog": "canis_lupus_familiaris",
}
ENSEMBL_REST = "https://rest.ensembl.org"

gene = works.param(1) or ""
species = works.param(2) or "human"
chrom = works.param(3) or ""
try:
    anchor_lo = int(float(works.param(4) or 0))
except Exception:
    anchor_lo = 0
try:
    anchor_hi = int(float(works.param(5) or 0))
except Exception:
    anchor_hi = 0

works.progress(10)


def ask_claude(gene, species, chrom, alo, ahi):
    if not ANTHROPIC_API_KEY:
        return [], "ANTHROPIC_API_KEY is not set on the server"
    if requests is None:
        return [], "python 'requests' is not available on the server"

    anchor = ""
    if chrom or ahi:
        anchor = (
            "\nAssembly/coordinate context (for consistency ONLY, not a filter): the track "
            "sits on chromosome %s roughly spanning %d - %d on the current reference assembly. "
            "Use the same assembly so coordinates are comparable, but do NOT restrict variants "
            "to this span." % (chrom or "?", alo, ahi)
        )

    system = (
        "You are a clinical/cancer genomics expert. Given a GENE SYMBOL and SPECIES, list the "
        "most important known mutations/variants in that gene that carry a stable database "
        "identifier from which a genomic location can be derived. STRONGLY PREFER dbSNP rsIDs "
        "(e.g. rs121913529) because their coordinates will be looked up authoritatively; you "
        "may also use ClinVar variation ids, COSMIC ids, or a precise HGVS descriptor. "
        "Prioritise clinically or biologically significant variants: pathogenic/likely-"
        "pathogenic alleles, recurrent oncogenic hotspots (activating driver mutations), "
        "founder alleles, and well-characterised functional variants. For EACH variant return:\n"
        "  id     : the database identifier — prefer the rsID (e.g. rs121913529) — required\n"
        "  chr    : chromosome on the reference assembly (string)\n"
        "  start  : genomic start coordinate (1-based integer; best estimate)\n"
        "  end    : genomic end coordinate (>= start; equal to start for a SNV)\n"
        "  title  : short label, ideally protein change + id (e.g. \"KRAS G12D (rs121913529)\")\n"
        "  comment: one sentence on clinical/biological significance\n"
        "Respond with ONLY JSON, no prose:\n"
        '{"points":[{"id":"...","chr":"...","start":int,"end":int,"title":"...","comment":"..."}]}\n'
        "Return at most 15 variants, most important first. Only include a variant if you can "
        "give a real database id AND a coordinate estimate."
    )
    user = (
        "Gene symbol: %s\nSpecies: %s%s\n"
        "List the important, identifiable mutations for this gene."
        % (gene, species, anchor)
    )
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
                "max_tokens": 3000,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=120,
        )
        if r.status_code != 200:
            return [], "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        parts = data.get("content", []) or []
        txt = "".join(b.get("text", "") for b in parts if b.get("type") == "text")
        m = re.search(r"\{.*\}", txt, re.S)
        obj = json.loads(m.group(0)) if m else {}
        raw = obj.get("points", []) or []
    except Exception as ex:
        return [], str(ex)

    out = []
    for p in raw:
        try:
            s = int(p.get("start", 0))
            e = int(p.get("end", s))
            if e < s:
                s, e = e, s
            if e == s:
                e = s + 1
            vid = ("" + str(p.get("id", ""))).strip()[:60]
            if not vid:
                continue
            out.append({
                "id": vid,
                "chr": ("" + str(p.get("chr", chrom))).strip()[:20],
                "start": s,
                "end": e,
                "title": ("" + str(p.get("title", vid))).strip()[:80],
                "comment": ("" + str(p.get("comment", ""))).strip()[:400],
                "resolved": False,
            })
        except Exception:
            pass
    return out, None


def resolve_rsid(species, rsid):
    """Look up a dbSNP rsID's exact genomic coordinates via Ensembl REST.
    Returns {chr,start,end,assembly} on the primary chromosome, or None."""
    if requests is None:
        return None
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    try:
        r = requests.get(
            "%s/variation/%s/%s" % (ENSEMBL_REST, sp, rsid),
            headers={"content-type": "application/json"},
            timeout=30,
        )
        if r.status_code != 200:
            return None
        maps = (r.json() or {}).get("mappings") or []
    except Exception:
        return None
    best = None
    for m in maps:
        srn = str(m.get("seq_region_name", ""))
        # primary chromosome only (skip patches/haplotypes/scaffolds)
        if m.get("coord_system") == "chromosome" and "_" not in srn and "." not in srn:
            best = m
            break
    if best is None and maps:
        best = maps[0]
    if best is None:
        return None
    try:
        return {
            "chr": str(best.get("seq_region_name", "")),
            "start": int(best.get("start")),
            "end": int(best.get("end")),
            "assembly": str(best.get("assembly_name", "")),
        }
    except Exception:
        return None


points, err = ask_claude(gene, species, chrom, anchor_lo, anchor_hi)
works.progress(55)

# Resolve any dbSNP rsID to authoritative Ensembl coordinates, overriding the estimate.
resolved_n = 0
if points:
    total = len(points)
    for i, p in enumerate(points):
        m = re.search(r"rs\d+", p.get("id", ""), re.I)
        if m:
            loc = resolve_rsid(species, m.group(0).lower())
            if loc and loc.get("start"):
                p["chr"] = loc["chr"] or p["chr"]
                p["start"] = loc["start"]
                # keep at least a 1bp span; use Ensembl end when it is larger
                p["end"] = loc["end"] if loc["end"] and loc["end"] >= loc["start"] else loc["start"] + 1
                if p["end"] <= p["start"]:
                    p["end"] = p["start"] + 1
                p["resolved"] = True
                resolved_n += 1
        works.progress(55 + int(40.0 * (i + 1) / max(1, total)))

# Drop anything we still could not place (no positive coordinate).
points = [p for p in points if p.get("start", 0) > 0]

works.progress(100)
works.resolve({"points": points, "error": err, "count": len(points), "resolved": resolved_n})
