# CDD protein-domain search, called via exec('py/cdd/domains.py', <protein>) from the JS side.
#
# Runs FULLY LOCAL when a self-hosted CDD is present (rpsblast+ + rpsbproc + the Cdd RPS
# database) — no external service. Falls back to NCBI's hosted CD-Search only if the local
# database/binaries aren't installed on the machine running this exec, so the feature keeps
# working everywhere. Either way it emits the rpsbproc-style DOMAINS/SITES text that
# baja/manchester/menu/protein-domains.js parses unchanged.
#
# Local paths (override via env): RPSBLAST_BIN, CDD_DB, RPSBPROC_BIN, RPSBPROC_DATA.
from ion import works
import os
import subprocess
import tempfile
import time

_HOME = os.path.expanduser("~")
RPSBLAST = os.environ.get("RPSBLAST_BIN") or ("/usr/bin/rpsblast+" if os.path.exists("/usr/bin/rpsblast+") else "/usr/bin/rpsblast")
CDD_DB = os.environ.get("CDD_DB") or os.path.join(_HOME, "ml", "cdd", "db", "Cdd")
RPSBPROC = os.environ.get("RPSBPROC_BIN") or os.path.join(_HOME, "ml", "cdd", "RpsbProc-x64-linux", "rpsbproc")
RPSBPROC_DATA = os.environ.get("RPSBPROC_DATA") or os.path.join(_HOME, "ml", "cdd", "RpsbProc-x64-linux", "data")

NCBI = "https://www.ncbi.nlm.nih.gov/Structure/bwrpsb/bwrpsb.cgi"


def local_available():
    db_ok = os.path.exists(CDD_DB + ".pal") or os.path.exists(CDD_DB + ".00.phr") or os.path.exists(CDD_DB + ".phr")
    return os.path.exists(RPSBLAST) and db_ok and os.path.exists(RPSBPROC) and os.path.isdir(RPSBPROC_DATA)


def run_local(seq):
    d = tempfile.mkdtemp(prefix="cdd_")
    fasta = os.path.join(d, "q.fasta")
    asn = os.path.join(d, "q.asn")
    out = os.path.join(d, "q.out")
    with open(fasta, "w") as f:
        f.write(">query\n" + seq + "\n")
    works.progress(35)
    subprocess.run([RPSBLAST, "-query", fasta, "-db", CDD_DB, "-evalue", "0.01",
                    "-outfmt", "11", "-out", asn], check=True, timeout=300,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    works.progress(75)
    subprocess.run([RPSBPROC, "-i", asn, "-o", out, "-d", RPSBPROC_DATA], check=True, timeout=120,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(out) as f:
        data = f.read()
    for p in (fasta, asn, out):
        try:
            os.remove(p)
        except Exception:
            pass
    try:
        os.rmdir(d)
    except Exception:
        pass
    return data   # rpsbproc DOMAINS/SITES text — already in the format the client parses


# ---- NCBI CD-Search fallback (only if no local CDD) ------------------------------------
def _ncbi_submit(seq, tdata):
    import requests
    r = requests.post(NCBI, data={"queries": ">query\n" + seq, "db": "cdd", "smode": "auto",
                                  "tdata": tdata, "dmode": "rep", "evalue": "0.01"}, timeout=60)
    for line in r.text.splitlines():
        if line.startswith("#cdsid"):
            p = line.split("\t")
            if len(p) > 1:
                return p[1].strip()
    return None


def _ncbi_poll(cdsid, tdata, tries=30, wait=5):
    import requests
    txt = ""
    for _ in range(tries):
        time.sleep(wait)
        try:
            r = requests.post(NCBI, data={"cdsid": cdsid, "tdata": tdata, "dmode": "rep"}, timeout=60)
        except Exception:
            continue
        txt = r.text
        status = None
        for line in txt.splitlines():
            if line.startswith("#status"):
                p = line.split("\t")
                if len(p) > 1:
                    status = p[1].strip()
        if status in ("0", "success"):
            return txt
    return txt


def run_ncbi(seq):
    rows = lambda t: [l for l in t.splitlines() if l.startswith("Q#")]
    out = ["DOMAINS"]
    cid = _ncbi_submit(seq, "hits")
    for l in rows(_ncbi_poll(cid, "hits") if cid else ""):
        f = l.split("\t")
        if len(f) < 9:
            continue
        # NCBI hits: Query,HitType,PSSM,From,To,EValue,Bitscore,Accession,ShortName
        # Emit so the client reads [2]=type [4]=from [5]=to [6]=evalue [8]=id [9]=name.
        out.append("\t".join(["1", f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8]]))
    out.append("ENDDOMAINS")
    out.append("SITES")
    cid2 = _ncbi_submit(seq, "feats")
    for l in rows(_ncbi_poll(cid2, "feats") if cid2 else ""):
        f = l.split("\t")
        if len(f) < 4:
            continue
        out.append("\t".join(["1", f[0], f[1], f[2], f[3]]))
    out.append("ENDSITES")
    return "\n".join(out)


seq = str(works.param(1) or "").strip()
seq = "".join(ch for ch in seq if ch.isalpha())
works.progress(10)

data = ""
if len(seq) >= 3:
    if local_available():
        try:
            data = run_local(seq)
        except Exception:
            try:
                data = run_ncbi(seq)
            except Exception:
                data = ""
    else:
        try:
            data = run_ncbi(seq)
        except Exception:
            data = ""

works.progress(100)
works.resolve({"file": data})
