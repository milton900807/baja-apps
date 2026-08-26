#!/usr/bin/env python3
"""
Points-of-interest finder (genomic-range mode): given a gene name and a genomic
coordinate range [range_start, range_end] on a chromosome, ask Claude to return the
important genomic features/annotations that fall WITHIN that range, as GENOMIC
coordinates + a short title + a one-sentence rationale.

Invoked by the server:  python3 points-of-interest.py jfile:<argsfile>
Ionworks params:
    param(1) : gene name / transcript id
    param(2) : genomic range start (xi)
    param(3) : genomic range end (xf)
    param(4) : chromosome (e.g. "chr12" or "12")
Emits IONWORKS:RESOLUTION with { points:[{start,end,title,comment}], error, count }.
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
try:
    range_start = int(float(works.param(2) or 0))
except Exception:
    range_start = 0
try:
    range_end = int(float(works.param(3) or 0))
except Exception:
    range_end = 0
chrom = works.param(4) or ""

works.progress(15)


def find_points(gene, chrom, rs, re_):
    if not ANTHROPIC_API_KEY:
        return [], "ANTHROPIC_API_KEY is not set on the server"
    if requests is None:
        return [], "python 'requests' is not available on the server"

    lo, hi = (rs, re_) if rs <= re_ else (re_, rs)
    system = (
        "You are a genomics expert. Given a gene and a GENOMIC coordinate range on a "
        "chromosome, return the important genomic features/annotations for that gene that "
        "fall WITHIN that range. Consider exons, CDS, start (ATG) and stop codons, 5'/3' UTRs, "
        "key protein domains mapped to their genomic coordinates, splice donor/acceptor sites, "
        "promoter/regulatory elements, polyA signals, and known pathogenic variant hotspots. "
        "For each feature return GENOMIC start and end coordinates (integers, on the given "
        "chromosome, with range_start <= start < end <= range_end), a concise title (<= 6 "
        "words) and a single-sentence rationale for why it is notable. Respond with ONLY JSON, "
        "no prose:\n"
        '{"points":[{"start":int,"end":int,"title":"...","comment":"..."}]}\n'
        "Return at most 15 features; prefer specific, non-overlapping regions with real "
        "genomic coordinates inside the range."
    )
    user = (
        "Gene: %s\nChromosome: %s\nGenomic range (inclusive): %d - %d\n"
        "Return features with genomic coordinates strictly inside this range."
        % (gene, chrom, lo, hi)
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
                "max_tokens": 2500,
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
            s = int(p.get("start", lo))
            e = int(p.get("end", s + 1))
            s = max(lo, min(hi - 1, s))
            e = max(s + 1, min(hi, e))
            out.append({
                "start": s,
                "end": e,
                "title": ("" + str(p.get("title", ""))).strip()[:60],
                "comment": ("" + str(p.get("comment", ""))).strip()[:400],
            })
        except Exception:
            pass
    return out, None


points, err = find_points(gene, chrom, range_start, range_end)
works.progress(100)
works.resolve({"points": points, "error": err, "count": len(points)})
