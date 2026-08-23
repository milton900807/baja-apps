import json
import math
import os
import re
import subprocess
import sys
from ion import works


def ensure(mod, pip_name=None):
    """Import a module, pip-installing it on first use if it is missing."""
    try:
        return __import__(mod)
    except Exception:
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "--quiet",
                            pip_name or mod], timeout=240)
            return __import__(mod)
        except Exception:
            return None


# Local cache root: remote data files are downloaded once and reused. Uses
# DATA_CACHE_DIR if set, else <BIG_DATA>/cache (BIGDATA is forwarded by the
# server from the BIG_DATA env), else a folder under the system temp dir.
_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA")
CACHE_ROOT = (os.environ.get("DATA_CACHE_DIR")
              or (os.path.join(_BD, "cache") if _BD else None)
              or os.path.join(os.environ.get("TMPDIR", "/tmp"), "public-data-cache"))


def url_to_cache_path(url):
    """Map a URL to a valid local path under CACHE_ROOT (host/path/query -> folders)."""
    try:
        from urllib.parse import urlparse
    except Exception:
        from urlparse import urlparse
    p = urlparse(url)
    parts = [p.netloc] + [seg for seg in p.path.split("/") if seg]
    if not parts:
        parts = ["file"]
    if p.query:
        parts[-1] = parts[-1] + "_" + p.query
    safe = [re.sub(r"[^A-Za-z0-9._-]", "_", seg) for seg in parts if seg]
    return os.path.join(CACHE_ROOT, *safe)


def resolve_bd(u):
    """Resolve a BIG_DATA-relative or /bd/ path to an absolute local path.

    Remote URLs (http/https/ftp) are returned unchanged.
    """
    u = str(u)
    if u.startswith("http://") or u.startswith("https://") or u.startswith("ftp://"):
        return u
    if _BD:
        if u.startswith("/bd/"):
            return _BD.rstrip("/") + u[3:]
        if not os.path.isabs(u):
            return os.path.join(_BD, u)
    return u


def ensure_local(url):
    """Return a local file path for url, downloading (and caching) it if needed."""
    u = str(url)
    # Local BIG_DATA file — use it directly, no download.
    if not (u.startswith("http://") or u.startswith("https://") or u.startswith("ftp://")):
        if os.path.exists(u) and os.path.getsize(u) > 0:
            return u, None
        return None, "local file not found: " + u
    path = url_to_cache_path(url)
    try:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path, None
        # Cache miss — tell the user this first load downloads + caches the file.
        try:
            works.msg("Downloading & caching this data for the first time — this load may take a bit longer…")
        except Exception:
            pass
        import requests
        os.makedirs(os.path.dirname(path), exist_ok=True)
        r = requests.get(url, stream=True, timeout=600, allow_redirects=True,
                         headers={"User-Agent": "baja/1.0"})
        if r.status_code != 200:
            return None, "download %s: %s" % (r.status_code, url)
        tmp = path + ".part"
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
        os.replace(tmp, path)
        return path, None
    except Exception as e:
        return None, str(e)

# ---------------------------------------------------------------------------
# Backend service: load a chosen bigWig / VCF endpoint over a genomic region and
# return track-layer data as [ [genomicPos, value], ... ] (the same shape
# view-bigwig.py returns), so the client can drop it straight into a track layer.
#
# Params (after the EngineMonitor at param(0)):
#   param(1) : endpoint url (.bw / .bigWig  OR  .vcf / .vcf.gz)
#   param(2) : type ("bigwig" | "vcf")
#   param(3) : chromosome
#   param(4) : region start (genomic, 0-based)
#   param(5) : region end (genomic)
# ---------------------------------------------------------------------------

url = str(works.param(1) or "")
etype = str(works.param(2) or "").lower()
chrom = str(works.param(3) or "")
start = int(float(works.param(4) or 0))
end = int(float(works.param(5) or 0))

# A BIG_DATA-relative path (or /bd/...) resolves to a local file; remote URLs
# pass through unchanged and are downloaded + cached as before.
url = resolve_bd(url)

MAX_VARIANTS = 5000

if not etype:
    etype = "vcf" if (".vcf" in url.lower()) else "bigwig"


def to_float(v, d=1.0):
    try:
        return float(v)
    except Exception:
        return d


def chrom_styles(name):
    n = name.replace("chr", "")
    return [name, n, "chr" + n]


# ---- bigWig ----------------------------------------------------------------
def read_bigwig():
    pyBigWig = ensure("pyBigWig")
    if pyBigWig is None:
        raise RuntimeError("pyBigWig is not installed on the server (pip install pyBigWig)")
    # pyBigWig can't reliably open some remote hosts (no byte-range) — download the
    # file to the local cache once and open from disk (reused on later requests).
    local, derr = ensure_local(url)
    if not local:
        raise RuntimeError(derr or ("could not download " + url))
    bw = pyBigWig.open(local)
    names = list(bw.chroms().keys())
    lead = "chr" if (names and names[0].startswith("chr")) else ""
    cand = lead + chrom.replace("chr", "")
    order = [cand] + [c for c in chrom_styles(chrom) if c != cand]

    vals = []
    used = cand
    for c in order:
        try:
            vv = bw.values(c, start, end)
        except Exception:
            vv = []
        if any((v is not None and not math.isnan(v)) for v in vv):
            vals = vv
            used = c
            break

    fval = []
    pos = start
    for v in vals:
        fval.append([pos, 0.0 if (v is None or math.isnan(v)) else float(v)])
        pos += 1
    # keep only the run boundaries (same reduction as view-bigwig.py)
    fval = [
        [f, v] for i, (f, v) in enumerate(fval)
        if (i > 0 and i < len(fval) - 1) and (fval[i - 1][1] != v or fval[i + 1][1] != v)
    ]
    return fval, used


# ---- VCF -------------------------------------------------------------------
def read_vcf():
    rows = []
    try:
        pysam = ensure("pysam")
        if pysam is None:
            raise ImportError("pysam")
        for c in chrom_styles(chrom):
            try:
                vf = pysam.VariantFile(url)
            except Exception:
                break
            try:
                for rec in vf.fetch(c, max(0, start), end):
                    q = rec.qual if rec.qual is not None else 1.0
                    rows.append((int(rec.pos) - 1, to_float(q, 1.0)))
                    if len(rows) >= MAX_VARIANTS:
                        break
                if rows:
                    break
            except Exception:
                continue
    except Exception:
        pass

    if not rows:
        try:
            import requests
            r = requests.get(url, timeout=45)
            if r.status_code == 200 and "\x1f\x8b" not in r.text[:4]:
                want = set(chrom_styles(chrom))
                for line in r.text.splitlines():
                    if not line or line[0] == "#":
                        continue
                    cols = line.split("\t")
                    if len(cols) < 6 or cols[0] not in want:
                        continue
                    try:
                        p = int(cols[1]) - 1
                    except Exception:
                        continue
                    if p < start or p > end:
                        continue
                    rows.append((p, to_float(cols[5], 1.0)))
                    if len(rows) >= MAX_VARIANTS:
                        break
        except Exception:
            pass

    out = []
    for pos, val in rows:
        out.append([pos, 0.0]); out.append([pos, val])
        out.append([pos + 1, val]); out.append([pos + 1, 0.0])
    return out, chrom


values = []
used_chrom = chrom
err = None
works.progress(30)
try:
    if etype == "vcf":
        values, used_chrom = read_vcf()
    else:
        values, used_chrom = read_bigwig()
except Exception as e:
    err = str(e)
works.progress(100)

if not values and not err:
    err = "no data returned for %s:%s-%s" % (chrom, start, end)

works.resolve({
    "url": url,
    "type": etype,
    "chr": used_chrom,
    "count": len(values),
    "error": err,
    "values": json.dumps(values),
})
