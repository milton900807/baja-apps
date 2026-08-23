"""List data files available in the local BIG_DATA folder.

Replaces the remote (Claude) endpoint discovery for public-data loading: instead
of finding bigWig / VCF URLs on the web, this walks the server's BIG_DATA
directory (env BIGDATA, forwarded from BIG_DATA) and returns the local data
files, ranked by how well they match the requested resource / species.

Params (after the EngineMonitor at param(0)):
    param(1) : resource name (e.g. "RNASeq (GEO / expression)")
    param(2) : genome / species (optional, e.g. "human")

Resolves { candidates, root, error } where candidates is a JSON array of
{ label, url, type, genome } — url is the path relative to BIG_DATA, which
load-endpoint-layer.py resolves back against BIGDATA when reading.
"""
import os
import re
import json

from ion import works


name = str(works.param(1) or "")
genome = str(works.param(2) or "")

BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA")

# Keywords that make a filename/path a good match for the resource, minus filler.
STOP = {"geo", "expression", "and", "the", "of", "data", "variants", "regulatory",
        "population", "cancer", "genomics", "catalog", "tracks", "eqtls"}
kws = set(re.findall(r"[a-z0-9]+", name.lower())) - STOP
sp = genome.lower().strip()

candidates = []
err = None

if not BD or not os.path.isdir(BD):
    err = "BIG_DATA folder not found: " + str(BD)
else:
    files = []
    for root, dirs, fnames in os.walk(BD):
        # Skip the download cache used for remote files.
        dirs[:] = [d for d in dirs if d != "cache"]
        for fn in fnames:
            low = fn.lower()
            if low.endswith(".bw") or low.endswith(".bigwig"):
                typ = "bigwig"
            elif low.endswith(".vcf") or low.endswith(".vcf.gz"):
                typ = "vcf"
            else:
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, BD)
            rl = rel.lower()
            score = 0
            if kws and any(k in rl for k in kws):
                score += 2
            if sp and sp in rl:
                score += 1
            files.append((score, rel, fn, typ))

    files.sort(key=lambda t: -t[0])
    # If anything matched the resource/species, show only those; else show all.
    matched = [f for f in files if f[0] > 0]
    use = matched if matched else files

    for (score, rel, fn, typ) in use[:200]:
        candidates.append({"label": fn, "url": rel, "type": typ, "genome": sp})

    if not candidates:
        err = "no bigWig / VCF files found under " + BD

works.resolve({
    "candidates": json.dumps(candidates),
    "root": BD or "",
    "error": err,
})
