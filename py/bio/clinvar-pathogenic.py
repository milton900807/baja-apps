"""ClinVar's pathogenic and likely pathogenic variants, per chromosome, for matching in the browser.

The karyotype matches a loaded VCF against ClinVar while the genome loads. A genome is
millions of variants and ClinVar's P/LP set is about 350,000, so the small side travels:
this returns every P/LP record on the chromosomes asked for, and the client keys them by
position and alleles and looks each of its own variants up. Matching is EXACT -- same
position, same REF, same ALT after both are trimmed to their minimal representation --
because a different change at a pathogenic base is not that pathogenic variant.

Conflicting classifications are left out: ClinVar itself does not call those pathogenic.

Params (after the EngineMonitor):
    param(1) : comma list of chromosomes, with or without the chr prefix
    param(2) : optional species (default human; ClinVar is GRCh38 human only)

Resolves:
    { ok, version, data: JSON {<asked name>: <index> | null}, counts, error }

    <index> is columnar, positions ascending and delta-encoded:
      pos   [delta, ...]             ref, alt  [allele, ...]
      sig   [1 Pathogenic | 2 Pathogenic/Likely pathogenic | 3 Likely pathogenic, ...]
      lp    [1 where ClinVar adds "low penetrance", else 0]
      vid   [ClinVar VariationID, ...]
      star  [review stars 0-4, ...]
      g, mc, cn   indices into the genes, mcs and conds tables

Cached as one JSON per contig under $BIGDATA/cache/clinvar-plp/<ClinVar size-mtime>/, so a
new ClinVar download invalidates it by itself and a repeat load reads a file.
"""
import json
import os
import shutil
import subprocess
import tempfile

from ion import works

try:
    import pysam
except Exception:
    pysam = None

_TABIX = shutil.which("tabix") or ("/usr/bin/tabix" if os.path.exists("/usr/bin/tabix") else None)
CLINVAR = "reference_data/variants/clinvar.vcf.gz"
_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA") or os.path.expanduser("~/baja-bd")

STARS = {
    "practice_guideline": 4,
    "reviewed_by_expert_panel": 3,
    "criteria_provided,_multiple_submitters,_no_conflicts": 2,
    "criteria_provided,_single_submitter": 1,
    "criteria_provided,_conflicting_classifications": 1,
}
NOT_A_CONDITION = {"not_provided", "not_specified", "see_cases", ""}

out = {"ok": False, "version": "", "data": "{}", "counts": "{}", "error": None}


def first_existing(rel):
    if os.environ.get("CLINVAR_PATH") and os.path.exists(os.environ["CLINVAR_PATH"]):
        return os.environ["CLINVAR_PATH"]
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def contigs_of(path):
    if pysam is not None:
        try:
            return set(pysam.TabixFile(path, encoding="utf-8").contigs)
        except Exception:
            pass
    if not _TABIX:
        return set()
    try:
        p = subprocess.run([_TABIX, "-l", path], capture_output=True, text=True, timeout=60)
        return set(x.strip() for x in p.stdout.splitlines() if x.strip())
    except Exception:
        return set()


def rows(path, contig):
    if pysam is not None:
        # UTF-8, not pysam's default ASCII: ClinVar's condition names carry accented
        # characters, and an ASCII handle raises at the first one -- 571 of chr2's 37,198
        # rows. And a fallback that re-read the contig after a partial read wrote every row
        # read so far twice, so it only runs when pysam produced nothing at all.
        given = 0
        try:
            tb = pysam.TabixFile(path, encoding="utf-8")
            for row in tb.fetch(contig):
                given += 1
                yield row.split("\t")
            return
        except Exception:
            if given:
                return
    if not _TABIX:
        return
    proc = subprocess.Popen([_TABIX, path, contig], stdout=subprocess.PIPE, text=True)
    for line in proc.stdout:
        if line and line[0] != "#":
            yield line.rstrip("\n").split("\t")
    proc.wait()


def resolve_contig(names, want):
    want = str(want or "").strip()
    bare = want[3:] if want.lower().startswith("chr") else want
    mito = bare.upper() in ("MT", "M")
    for c in (want, bare, "chr" + bare, "MT" if mito else "", "chrM" if mito else ""):
        if c and c in names:
            return c
    return ""


def trim(pos, ref, alt):
    """Minimal representation: shared trailing bases, then shared leading bases past one."""
    while len(ref) > 1 and len(alt) > 1 and ref[-1] == alt[-1]:
        ref, alt = ref[:-1], alt[:-1]
    while len(ref) > 1 and len(alt) > 1 and ref[0] == alt[0]:
        ref, alt, pos = ref[1:], alt[1:], pos + 1
    return pos, ref, alt


def info_of(s):
    d = {}
    for part in s.split(";"):
        k, _, v = part.partition("=")
        d[k] = v
    return d


def build(path, contig):
    genes, mcs, conds = {}, {}, {}
    recs = []
    for f in rows(path, contig):
        if len(f) < 8:
            continue
        info = info_of(f[7])
        raw = info.get("CLNSIG", "")
        low = raw.lower()
        # "Pathogenic|risk_factor" and "Pathogenic,_low_penetrance" are still pathogenic;
        # the first term is the classification, the rest qualifies it.
        head = low.split("|")[0].replace(",_low_penetrance", "")
        if head.startswith("pathogenic/likely_pathogenic"):
            code = 2
        elif head.startswith("pathogenic"):
            code = 1            # also Pathogenic/Likely_risk_allele
        elif head.startswith("likely_pathogenic"):
            code = 3            # also Likely_pathogenic/Likely_risk_allele
        else:
            continue
        try:
            pos = int(f[1])
        except ValueError:
            continue
        ref, alt = f[3].upper(), f[4].upper()
        if not ref or not alt or alt == "." or "," in alt:
            continue
        pos, ref, alt = trim(pos, ref, alt)
        gene = info.get("GENEINFO", "").split("|")[0].split(":")[0]
        mc = info.get("MC", "").split(",")[0].partition("|")[2].replace("_variant", "")
        names = [x for x in info.get("CLNDN", "").split("|") if x.lower() not in NOT_A_CONDITION]
        cond = "; ".join(x.replace("_", " ") for x in names[:2])
        if len(names) > 2:
            cond += " (+%d)" % (len(names) - 2)
        try:
            vid = int(f[2])
        except ValueError:
            vid = 0
        recs.append((pos, ref, alt, code, 1 if "low_penetrance" in low else 0, vid,
                     STARS.get(info.get("CLNREVSTAT", ""), 0),
                     genes.setdefault(gene, len(genes)), mcs.setdefault(mc, len(mcs)),
                     conds.setdefault(cond, len(conds))))
    recs.sort()
    idx = {"n": len(recs), "pos": [], "ref": [], "alt": [], "sig": [], "lp": [], "vid": [], "star": [],
           "g": [], "mc": [], "cn": [],
           "genes": sorted(genes, key=genes.get), "mcs": sorted(mcs, key=mcs.get),
           "conds": sorted(conds, key=conds.get)}
    last = 0
    for r in recs:
        idx["pos"].append(r[0] - last)
        last = r[0]
        for key, val in zip(("ref", "alt", "sig", "lp", "vid", "star", "g", "mc", "cn"), r[1:]):
            idx[key].append(val)
    return idx


def cached(path, contig):
    st = os.stat(path)
    d = os.path.join(_BD, "cache", "clinvar-plp", "%d-%d" % (st.st_size, int(st.st_mtime)))
    f = os.path.join(d, contig + ".json")
    if os.path.exists(f):
        with open(f) as fh:
            return fh.read()
    text = json.dumps(build(path, contig), separators=(",", ":"))
    try:
        os.makedirs(d, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        with os.fdopen(fd, "w") as fh:
            fh.write(text)
        os.replace(tmp, f)          # atomic: two loads building the same contig cannot corrupt it
    except Exception as e:
        works.msg("clinvar cache not written: %s" % e)
    return text


def version_of(path):
    try:
        if pysam is not None:
            for line in pysam.TabixFile(path, encoding="utf-8").header:
                if line.startswith("##fileDate="):
                    return line.split("=", 1)[1]
    except Exception:
        pass
    return ""


asked = works.param(1)
if isinstance(asked, (list, tuple)):
    asked = ",".join(str(x) for x in asked)
chroms = [x.strip() for x in str(asked or "").split(",") if x.strip()]
species = (str(works.param(2) or "human").strip().lower() or "human")

if not chroms:
    out["error"] = "no chromosomes asked for"
elif species != "human":
    out["error"] = "ClinVar covers human only"
else:
    path = first_existing(CLINVAR)
    if not path:
        out["error"] = "ClinVar is not on this server"
    else:
        names = contigs_of(path)
        parts, counts = [], {}
        for c in chroms[:8]:
            contig = resolve_contig(names, c)
            if not contig:
                parts.append(json.dumps(c) + ":null")
                counts[c] = 0
                continue
            text = cached(path, contig)
            parts.append(json.dumps(c) + ":" + text)
            counts[c] = int(text[5:text.index(",")]) if text.startswith('{"n":') else -1
        out["data"] = "{" + ",".join(parts) + "}"
        out["counts"] = json.dumps(counts)
        out["version"] = version_of(path)
        out["ok"] = True
        works.msg("clinvar P/LP %s" % json.dumps(counts))

works.resolve(out)
