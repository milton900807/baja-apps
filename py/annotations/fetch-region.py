import json
import re
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# Fetch external annotations (variants) over a set of genomic regions and
# return them per-region so the client can add them to the matching tracks.
#
# Source: Ensembl REST /overlap/region (server-side, no browser CORS).
#
# Params (after the EngineMonitor):
#   param(1) : list of regions  [{ "chr": "12", "start": 70925087,
#                                  "end": 70953015, "track": <index> }, ...]
#   param(2) : source label (currently "ensembl")
#   param(3) : filter, e.g. "pathogenic" | "benign" | "" (clinical significance)
# ---------------------------------------------------------------------------

regions_in = works.param(1)
source = (works.param(2) or "ensembl")
filt = ("" + (works.param(3) or "")).strip().lower()

ENSEMBL = "https://rest.ensembl.org"
MAX_REGION = 5000000            # Ensembl overlap variation region cap
TRANSIENT = set([429, 500, 502, 503, 504])


def as_list(v):
    if isinstance(v, list):
        return v
    if isinstance(v, str):
        try:
            j = json.loads(v)
            return j if isinstance(j, list) else []
        except Exception:
            return []
    return []


regions = as_list(regions_in)


def ensembl_get(url):
    if not requests:
        return None
    for attempt in range(1, 4):
        try:
            r = requests.get(url, headers={"Accept": "application/json"}, timeout=45)
        except Exception:
            continue
        if r.status_code == 200:
            try:
                return r.json()
            except Exception:
                return None
        if r.status_code in TRANSIENT and attempt < 3:
            continue
        break
    return None


def fetch_variation(chrom, start, end):
    url = "%s/overlap/region/human/%s:%d-%d?feature=variation;content-type=application/json" % (
        ENSEMBL, chrom, start, end
    )
    data = ensembl_get(url)
    return data if isinstance(data, list) else []


def matches_filter(clinsig):
    if not filt:
        return True
    joined = " ".join(str(c).lower() for c in (clinsig or []))
    return filt in joined


results = []
total = max(len(regions), 1)

for idx, reg in enumerate(regions):
    chrom = str(reg.get("chr") or "").replace("chr", "").replace("Chr", "")
    try:
        start = int(reg.get("start"))
        end = int(reg.get("end"))
    except (TypeError, ValueError):
        results.append({"track": reg.get("track"), "chr": chrom, "variants": [], "note": "bad coordinates"})
        works.progress(int(100 * (idx + 1) / total))
        continue

    if start > end:
        start, end = end, start

    note = None
    variants = []
    if not chrom:
        note = "no chromosome"
    elif (end - start) <= 0:
        note = "empty region"
    elif (end - start) > MAX_REGION:
        note = "region too large (%d bp); zoom in" % (end - start)
    else:
        for v in fetch_variation(chrom, start, end):
            clinsig = v.get("clinical_significance") or []
            if not matches_filter(clinsig):
                continue
            variants.append({
                "id": v.get("id"),
                "start": v.get("start"),
                "end": v.get("end"),
                "alleles": v.get("alleles") or [],
                "consequence": v.get("consequence_type"),
                "clinical_significance": clinsig,
                "strand": v.get("strand"),
            })

    results.append({"track": reg.get("track"), "chr": chrom, "variants": variants, "note": note})
    works.progress(int(100 * (idx + 1) / total))

works.progress(100)
works.resolve({
    "source": source,
    "filter": filt,
    "count": sum(len(r["variants"]) for r in results),
    "results": json.dumps(results),
})
