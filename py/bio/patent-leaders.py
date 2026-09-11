"""The patent 'winner' for each chromosome: the assignee holding the most (distinct)
patents on it. Read once from the genomic hit BED + the metadata TSV and cached beside
the annotation as a small JSON; every call after it is a lookup of that file.

Companion to patent-density.py (the shape) and patents-at.py (the list). This answers
"who owns the most of each chromosome" so the karyotype can label a winner per
chromosome when the whole genome is in view.

Params (after the EngineMonitor):
    param(1) : optional dataset key (default aso_sirna_gt)
    param(2) : optional species (default human)

Resolves:
    { ok, key, leaders, built, error }
  leaders is a JSON object { "chr1": {"assignee": "...", "patents": N, "total": M}, ... }
  where `patents` is how many distinct patents the winning assignee holds on that
  chromosome and `total` is the distinct patents on the chromosome from any assignee.
"""
import gzip
import json
import os

from ion import works

BED_DIRS = ["/home/ubuntu/baja-bd", "bd", "../baja-bd"]
GENOMIC_BEDS = {"aso_sirna_gt": "aso_sirna_gt_grch38_primary_hits.bed.gz"}
METAS = {"aso_sirna_gt": "aso_sirna_gt_meta.tsv"}
GFF = {
    "human": "reference_data/human.gencode.annotation.gff3.bgz",
    "mouse": "reference_data/mouse.annotation.gff3.bgz",
}

key = (str(works.param(1) or "aso_sirna_gt").strip() or "aso_sirna_gt")
species = (str(works.param(2) or "human").strip().lower() or "human")

out = {"ok": False, "key": key, "leaders": "{}", "built": False, "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def find_file(name):
    if not name:
        return ""
    for d in BED_DIRS:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
        p2 = first_existing(os.path.join(d, name))
        if p2 and os.path.exists(p2):
            return p2
    return ""


def load_assignees(tsv):
    """patent id -> assignee, from the packed 'US<n>|title|filed|granted|assignee' TSV."""
    SEP = "‖"
    who = {}
    if not tsv or not os.path.exists(tsv):
        return who
    try:
        with open(tsv, "r") as fh:
            for ln in fh:
                p = ln.rstrip("\n").split("\t")
                if len(p) >= 2 and p[0] and p[0] != "patent_id":
                    lab = p[1].strip()
                    a = ""
                    if SEP in lab:
                        fs = lab.split(SEP)
                        a = fs[4].strip() if len(fs) > 4 else ""
                    # Only a NAMED assignee is kept; a blank one is left out so it does not
                    # form one giant "Unknown" bucket that wins every chromosome.
                    if a:
                        who[p[0].strip()] = a
    except Exception:
        return {}
    return who


def build(bed_path, tsv_path):
    """Distinct patents per chromosome, then the assignee with the most on each."""
    works.msg("Finding the patent leaders (first time only)…")
    chrom_pids = {}          # chrom -> set(patent id)
    n = 0
    with gzip.open(bed_path, "rt") as fh:
        for line in fh:
            f = line.split("\t", 4)
            if len(f) < 4:
                continue
            pid = f[3].split("|")[0].strip()
            if not pid:
                continue
            chrom_pids.setdefault(f[0], set()).add(pid)
            n += 1
            if (n % 4000000) == 0:
                works.msg("Finding the patent leaders — %d million…" % (n // 1000000))
    who = load_assignees(tsv_path)
    leaders = {}
    for c, pids in chrom_pids.items():
        counts = {}
        for pid in pids:
            a = who.get(pid)
            # Only NAMED assignees compete for the win. Many hit ids in the genomic BED
            # are not in the metadata TSV; counting those as one "Unknown" bucket would
            # let it win every chromosome and say nothing. They still count toward total.
            if not a:
                continue
            counts[a] = counts.get(a, 0) + 1
        if not counts:
            continue
        # Ties broken by name so the answer is stable between builds.
        top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        leaders[c] = {"assignee": top[0], "patents": top[1], "total": len(pids)}
    works.msg("leaders for %d chromosomes over %d hits" % (len(leaders), n))
    return {"leaders": leaders}


bed = find_file(GENOMIC_BEDS.get(key) or "")
tsv = find_file(METAS.get(key) or "")
gff = first_existing(GFF.get(species) or GFF["human"])
cache_dir = os.path.dirname(gff) or (os.path.dirname(bed) if bed else ".")
cache = os.path.join(cache_dir, "%s.%s.leaders.json" % (species, key))

if not bed:
    out["error"] = "the %s hit file is not on this server" % key
else:
    data = None
    try:
        if cache and os.path.exists(cache) and os.path.getsize(cache) > 8:
            with open(cache, "r") as fh:
                data = json.load(fh)
    except Exception:
        data = None
    if data is None:
        try:
            data = build(bed, tsv)
            out["built"] = True
            tmp = cache + ".partial-%d" % os.getpid()
            with open(tmp, "w") as fh:
                json.dump(data, fh)
            os.replace(tmp, cache)
        except Exception as e:
            out["error"] = "could not build the leaders: %s" % e
    if data is not None and not out["error"]:
        out["ok"] = True
        out["leaders"] = json.dumps(data.get("leaders", {}))

works.resolve(out)
