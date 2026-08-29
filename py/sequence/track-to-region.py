#!/usr/bin/env python3
"""
Resolve a track to its GENOMIC REGION for a ClinVar (or other region) lookup.

Preferred: the track's Ensembl id (gene/transcript) -> Ensembl REST /lookup/id -> region.
Fallback: if no usable Ensembl id, use the track's METADATA (name, description, species) and
ask Claude for the correct gene symbol, then resolve that symbol via Ensembl to a region.

  let r = await exec('/py/sequence/track-to-region.py', em, ensemblId, name, description, species)
  // r = { chr, start, end, gene, source, error }

Params:
    param(1): Ensembl id (ENSG.../ENST...), optional
    param(2): track name / label
    param(3): track description
    param(4): species (human|mouse|rat|dog), default human
"""
import json
import os
import re

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("POINTS_MODEL") or "claude-haiku-4-5"

ENSEMBL_SPECIES = {
    "human": "homo_sapiens", "mouse": "mus_musculus",
    "rat": "rattus_norvegicus", "dog": "canis_lupus_familiaris",
}
ENSEMBL_REST = "https://rest.ensembl.org"

ens_id = ("" + (works.param(1) or "")).strip()
name = ("" + (works.param(2) or "")).strip()
description = ("" + (works.param(3) or "")).strip()
species = ("" + (works.param(4) or "human")).strip().lower() or "human"


def _region_from_mapping(o):
    try:
        chrom = str(o.get("seq_region_name", "")).strip()
        start = int(o.get("start"))
        end = int(o.get("end"))
        if chrom and end >= start:
            return {"chr": chrom, "start": start, "end": end}
    except Exception:
        pass
    return None


def lookup_id(eid):
    """Ensembl /lookup/id/<id> -> region (works for gene AND transcript ids)."""
    if requests is None or not eid:
        return None
    base = eid.split(".")[0]
    try:
        r = requests.get("%s/lookup/id/%s" % (ENSEMBL_REST, base),
                         headers={"content-type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None
        return _region_from_mapping(r.json() or {})
    except Exception:
        return None


def lookup_symbol(sp, symbol):
    if requests is None or not symbol:
        return None
    slug = ENSEMBL_SPECIES.get(sp, sp)
    from urllib.parse import quote
    try:
        r = requests.get("%s/lookup/symbol/%s/%s" % (ENSEMBL_REST, slug, quote(symbol, safe="")),
                         headers={"content-type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None
        return _region_from_mapping(r.json() or {})
    except Exception:
        return None


def claude_gene_symbol(nm, desc, sp):
    """Ask Claude for the gene symbol from the track's metadata."""
    if requests is None or not ANTHROPIC_API_KEY:
        return ""
    prompt = (
        "From the track metadata below, give ONLY the official HGNC gene symbol (e.g. SOD1) that "
        "this track represents — no other text.\n"
        "Name: %s\nDescription: %s\nSpecies: %s"
        % (nm or "(none)", (desc or "(none)")[:600], sp)
    )
    try:
        try:
            import claude_usage as _cu; _cu.bump("track-to-region")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 40, "temperature": 0,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=45,
        )
        if r.status_code != 200:
            return ""
        parts = (r.json().get("content") or [])
        txt = "".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text")
        m = re.search(r"[A-Za-z0-9][A-Za-z0-9\-\.]{0,20}", txt.strip())
        return m.group(0) if m else ""
    except Exception:
        return ""


out = {"chr": "", "start": 0, "end": 0, "gene": "", "source": "", "error": None}

# 1) An Ensembl id (ENSG/ENST/ENSMUSG/...) -> region directly.
loc = None
if re.match(r"^ENS[A-Z]*[GT]\d", ens_id, re.I):
    loc = lookup_id(ens_id)
    if loc:
        out.update(loc)
        out["source"] = "ensembl-id"

# 2) No id (or it didn't resolve) -> Claude-search the gene symbol from metadata, then Ensembl.
if not out["chr"]:
    if requests is None:
        out["error"] = "requests unavailable on server python"
    else:
        symbol = claude_gene_symbol(name, description, species)
        if symbol:
            out["gene"] = symbol
            loc = lookup_symbol(species, symbol)
            if loc:
                out.update(loc)
                out["gene"] = symbol
                out["source"] = "claude+ensembl-symbol"
        if not out["chr"] and not out["error"]:
            out["error"] = "could not resolve a genomic region for this track"

works.resolve(out)
