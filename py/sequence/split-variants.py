#!/usr/bin/env python3
"""
Split a block of text into individual, self-contained variant descriptors so each can be
resolved one-by-one through prompt-to-variant.py.

Invoked by the server:  python3 split-variants.py jfile:<argsfile>
Ionworks params:
    param(1) : the free text (may mention many variants)
Emits IONWORKS:RESOLUTION with { variants: <json array of strings>, error }.
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
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-haiku-4-5"

text = works.param(1) or ""
works.progress(15)


def split(text):
    if not ANTHROPIC_API_KEY:
        return [], "ANTHROPIC_API_KEY is not set on the server"
    if requests is None:
        return [], "python 'requests' is not available on the server"

    system = (
        "You extract genetic variants from text. Read the user's text and list EVERY distinct "
        "variant/mutation mentioned. For each, produce ONE self-contained descriptor string "
        "that includes the gene symbol plus the change (or an rsID or full HGVS) so it can be "
        "resolved on its own — e.g. \"KRAS G12D\", \"TP53 c.215C>T\", \"rs113993960\", "
        "\"CFTR NM_000492.4:c.1521_1523delCTT\". Prefer rsIDs or HGVS when present. Deduplicate. "
        "Respond with ONLY JSON, no prose: {\"variants\":[\"...\",\"...\"]}. Return at most 100."
    )
    try:
        try:
            import claude_usage as _cu; _cu.bump("split-variants")
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
                "max_tokens": 3000,
                "system": system,
                "messages": [{"role": "user", "content": text[:120000]}],
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
        raw = obj.get("variants", []) or []
    except Exception as ex:
        return [], str(ex)

    out = []
    seen = set()
    for v in raw:
        s = ("" + str(v)).strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s[:200])
    return out, None


variants, err = split(text)
works.progress(100)
works.resolve({"variants": json.dumps(variants), "error": err, "count": len(variants)})
