#!/usr/bin/env python3
"""
Points-of-interest finder: given a gene's nucleotide sequence + its annotations,
ask Claude to identify the most biologically interesting regions WITHIN the
sequence and return their offsets + a short title + a one-sentence rationale.

Invoked by the server:  python3 points-of-interest.py jfile:<argsfile>
Ionworks params:
    param(1) : the track's nucleotide sequence
    param(2) : the annotations as a JSON string
    param(3) : optional context (gene symbol / transcript id / description)
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

sequence = works.param(1) or ""
annotations = works.param(2) or "[]"
context = works.param(3) or ""

works.progress(15)


def find_points(seq, anns, ctx):
    if not ANTHROPIC_API_KEY:
        return [], "ANTHROPIC_API_KEY is not set on the server"
    if requests is None:
        return [], "python 'requests' is not available on the server"

    system = (
        "You are a molecular biology expert examining a single gene/transcript. Given its "
        "nucleotide sequence and annotations, identify the most biologically INTERESTING or "
        "IMPORTANT regions that lie WITHIN the provided sequence. Consider: the start (ATG) "
        "and stop codons, functional/protein domains, key sequence motifs, splice donor/"
        "acceptor sites and branch points, 5'/3' UTR regulatory elements, uORFs, Kozak "
        "context, miRNA/RBP binding sites, polyA signals, repeat / low-complexity stretches, "
        "GC-rich or notable secondary-structure regions, and any disease-relevant hotspots. "
        "For each region return 0-based half-open offsets [start,end) INTO THE PROVIDED "
        "SEQUENCE (0 <= start < end <= sequence length), a concise title (<= 6 words), and a "
        "single-sentence rationale for why it is interesting. Respond with ONLY JSON, no prose:\n"
        '{"points":[{"start":int,"end":int,"title":"...","comment":"..."}]}\n'
        "Return at most 12 points; prefer non-overlapping, biologically specific regions."
    )
    user = (
        "Context: %s\nSequence length: %d nt\nAnnotations (JSON): %s\n\nSequence:\n%s"
        % (ctx, len(seq), (anns or "")[:6000], seq[:200000])
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

    L = len(seq)
    out = []
    for p in raw:
        try:
            s = int(p.get("start", 0))
            e = int(p.get("end", s + 1))
            s = max(0, min(L - 1, s))
            e = max(s + 1, min(L, e))
            out.append({
                "start": s,
                "end": e,
                "title": ("" + str(p.get("title", ""))).strip()[:60],
                "comment": ("" + str(p.get("comment", ""))).strip()[:400],
            })
        except Exception:
            pass
    return out, None


points, err = find_points(sequence, annotations, context)
works.progress(100)
works.resolve({"points": points, "error": err, "count": len(points)})
