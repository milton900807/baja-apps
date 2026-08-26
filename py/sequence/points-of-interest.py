#!/usr/bin/env python3
"""
Points-of-interest finder (mutation mode): given a GENE SYMBOL and SPECIES, ask Claude
to surface important known mutations/variants for that gene that carry a stable database
ID (dbSNP rsID, ClinVar, COSMIC, or HGVS) from which a genomic location can be derived.
Each returned point includes the variant id, its derived genomic location, a title, and a
one-sentence note on why it matters.

Invoked by the server:  python3 points-of-interest.py jfile:<argsfile>
Ionworks params:
    param(1) : gene symbol (or transcript id)
    param(2) : species  (e.g. "human", "mouse", "rat")
    param(3) : chromosome, for assembly context  (e.g. "chr12" or "12")
    param(4) : anchor coord start (assembly context only; NOT a constraint)
    param(5) : anchor coord end   (assembly context only; NOT a constraint)
Emits IONWORKS:RESOLUTION with { points:[{id,chr,start,end,title,comment}], error, count }.
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
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5"

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

works.progress(15)


def find_points(gene, species, chrom, alo, ahi):
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
        "identifier from which a genomic location can be derived: dbSNP rsID, ClinVar variation "
        "id, COSMIC id, or a precise HGVS (genomic g. or coding c.) descriptor. Prioritise "
        "clinically or biologically significant variants: pathogenic/likely-pathogenic alleles, "
        "recurrent oncogenic hotspots (e.g. activating driver mutations), founder alleles, and "
        "well-characterised functional variants. For EACH variant return:\n"
        "  id     : the database identifier (e.g. rs121913529, VCV000012600, COSM521, or an "
        "HGVS string) — required, this is what locates it\n"
        "  chr    : chromosome on the reference assembly (string)\n"
        "  start  : genomic start coordinate (1-based integer)\n"
        "  end    : genomic end coordinate (>= start; equal to start for a SNV)\n"
        "  title  : short label, ideally protein change + id (e.g. \"KRAS G12D (rs121913529)\")\n"
        "  comment: one sentence on clinical/biological significance\n"
        "Respond with ONLY JSON, no prose:\n"
        '{"points":[{"id":"...","chr":"...","start":int,"end":int,"title":"...","comment":"..."}]}\n'
        "Return at most 15 variants, most important first. Only include a variant if you can "
        "give a real database id AND a genomic coordinate; omit anything you cannot locate."
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
            if not vid or s <= 0:
                continue
            out.append({
                "id": vid,
                "chr": ("" + str(p.get("chr", chrom))).strip()[:20],
                "start": s,
                "end": e,
                "title": ("" + str(p.get("title", vid))).strip()[:80],
                "comment": ("" + str(p.get("comment", ""))).strip()[:400],
            })
        except Exception:
            pass
    return out, None


points, err = find_points(gene, species, chrom, anchor_lo, anchor_hi)
works.progress(100)
works.resolve({"points": points, "error": err, "count": len(points)})
