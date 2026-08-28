# NCBI CD-Search (Batch RPS-BLAST web service) — protein-domain search with NO local
# BLAST install or CDD database. Submits the protein to NCBI, polls until done, and emits
# the same DOMAIN/SITES text format the local rpsbproc path produced, so the client
# (baja/manchester/menu/protein-domains.js) parses it unchanged.
#
#   exec('py/cdd/cdsearch.py', <protein-sequence>)
#
# Output file format (tab-separated data rows; the client reads specific columns):
#   DOMAIN
#   \t\t<hitType>\t\t<from>\t<to>\t<evalue>\t\t<accession>\t<shortName>
#   ENDDOMAINS
#   SITES
#   \t\t\t<featureTitle>\t<coord list e.g. L8,T9,...>
#   ENDSITES
from ion import works
import requests
import time

BASE = "https://www.ncbi.nlm.nih.gov/Structure/bwrpsb/bwrpsb.cgi"


def _submit(seq, tdata):
    r = requests.post(BASE, data={
        "queries": ">query\n" + seq,
        "db": "cdd", "smode": "auto", "tdata": tdata,
        "dmode": "rep", "evalue": "0.01",
    }, timeout=60)
    for line in r.text.splitlines():
        if line.startswith("#cdsid"):
            parts = line.split("\t")
            if len(parts) > 1:
                return parts[1].strip()
    return None


def _poll(cdsid, tdata, tries=30, wait=5):
    txt = ""
    for _ in range(tries):
        time.sleep(wait)
        try:
            r = requests.post(BASE, data={"cdsid": cdsid, "tdata": tdata, "dmode": "rep"}, timeout=60)
        except Exception:
            continue
        txt = r.text
        status = None
        for line in txt.splitlines():
            if line.startswith("#status"):
                p = line.split("\t")
                if len(p) > 1:
                    status = p[1].strip()
        # Done when NCBI reports success (status 0 / "success"); status 3 = still running.
        if status in ("0", "success"):
            return txt
    return txt


def _rows(txt):
    # Actual result rows start with the query tag ("Q#..."); skip #headers and the column line.
    return [l for l in txt.splitlines() if l.startswith("Q#")]


seq = str(works.param(1) or "").strip()
seq = "".join(ch for ch in seq if ch.isalpha())   # strip fasta header / whitespace
works.progress(10)

out = []
if len(seq) >= 3:
    try:
        # ---- Domains (tdata=hits): Query,HitType,PSSM,From,To,EValue,Bitscore,Accession,ShortName
        cid = _submit(seq, "hits")
        works.progress(35)
        htxt = _poll(cid, "hits") if cid else ""
        out.append("DOMAIN")
        for l in _rows(htxt):
            f = l.split("\t")
            if len(f) < 9:
                continue
            hit_type, frm, to, ev, acc, name = f[1], f[3], f[4], f[5], f[7], f[8]
            out.append("\t".join(["", "", hit_type, "", frm, to, ev, "", acc, name]))
        out.append("ENDDOMAINS")
        works.progress(70)

        # ---- Sites (tdata=feats): Query,Type,Title,coordinates,...
        cid2 = _submit(seq, "feats")
        ftxt = _poll(cid2, "feats") if cid2 else ""
        out.append("SITES")
        for l in _rows(ftxt):
            f = l.split("\t")
            if len(f) < 4:
                continue
            title, coords = f[2], f[3]
            out.append("\t".join(["", "", "", title, coords]))
        out.append("ENDSITES")
    except Exception:
        out = ["DOMAIN", "ENDDOMAINS", "SITES", "ENDSITES"]

works.progress(100)
works.resolve({"file": "\n".join(out)})
