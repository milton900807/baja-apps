"""The 1011 yeast genomes, served to the chromosome view.

Peter et al. 2018 called every SNP and indel across 1,011 S. cerevisiae isolates into one
5.4 GB population VCF. py/bio/build-yeast-1011.py fetches that once and repacks it into a
per-site table and a strain-major genotype matrix; this answers the view's questions from
those files, in VCF text the view already knows how to draw.

Params (after the EngineMonitor):
    param(1) : action -- status | fetch | strains | variants
    param(2) : strains, comma-separated (variants only; empty = every polymorphic site)
    param(3) : chromosome, with or without chr, or empty for the whole genome
    param(4) : start (1-based), or empty
    param(5) : end (1-based, inclusive), or empty
    param(6) : minimum allele frequency, 0..1 (empty = 0)
    param(7) : maximum allele frequency, 0..1 (empty = 1)
    param(8) : kind -- all | snp | indel
    param(9) : line cap (default 400000, at most 1500000)

Resolves:
    status   { ok, state, phase, pct, message, sites, strains, bytes, total, error }
             state is absent | building | ready | error
    fetch    the same, after starting the build if nothing was building
    strains  { ok, strains (JSON array of names), count }
    variants { ok, vcf, count, truncated, strains, note, error }
             vcf is VCF data lines, CHROM..INFO, chromosomes chrI..chrXVI.

The strain filter is ANY: a site is written when at least one of the named strains carries
a non-reference allele there, and INFO says which of them do (GT=AAA:0/1,...). With no
strains, every site passes and INFO carries the population AC/AN/AF only.
"""
import json
import os
import subprocess
import sys
import time

from ion import works

DIR = "reference_data/variants/yeast1011"
BUILDER = "py/bio/build-yeast-1011.py"
SOURCE_URL = "http://1002genomes.u-strasbg.fr/files/1011Matrix.gvcf.gz"
MAX_LINES = 1500000
DEFAULT_LINES = 400000
GT_SHOWN = 8            # strains named in INFO before "+N more"


def first_existing(rel, want_dir=False):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server"),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def data_dir():
    return first_existing(DIR) or os.path.join(os.getcwd(), DIR)


def read_json(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return {}


def pid_alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except Exception:
        return False


def status():
    d = data_dir()
    idx = read_json(os.path.join(d, "sites", "index.json"))
    build = read_json(os.path.join(d, "build.json"))
    out = {"ok": True, "state": "absent", "phase": build.get("phase", ""),
           "pct": build.get("pct", 0), "message": "", "sites": 0, "strains": 0,
           "bytes": build.get("bytes", 0), "total": build.get("total", 0), "error": None,
           "dir": d, "source": SOURCE_URL}
    gt = os.path.join(d, "gt.bin")
    if idx.get("total") and os.path.exists(gt):
        out["state"] = "ready"
        out["sites"] = int(idx.get("total") or 0)
        out["strains"] = int(idx.get("strains") or 0)
        out["message"] = "%s sites across %d strains" % (
            "{:,}".format(out["sites"]), out["strains"])
        return out
    phase = build.get("phase", "")
    if phase == "error":
        out["state"] = "error"
        out["error"] = build.get("error") or "the build failed"
        out["message"] = "The last build failed: " + out["error"]
    elif phase and phase != "done" and pid_alive(build.get("pid", -1)):
        out["state"] = "building"
        if phase == "downloading":
            b, t = build.get("bytes", 0), build.get("total", 0)
            gib = 1024.0 ** 3
            out["message"] = "Downloading the 5.4 GB matrix — %s" % (
                ("%.1f of %.1f GB" % (b / gib, t / gib)) if t else ("%.1f GB" % (b / gib)))
            if build.get("error"):
                out["message"] += " (retrying after: %s)" % build["error"]
        elif phase == "reading":
            out["message"] = "Reading the matrix — %s%%, %s sites so far" % (
                build.get("pct", 0), "{:,}".format(build.get("sites", 0)))
        elif phase == "transposing":
            out["message"] = "Packing genotypes by strain — %s%%" % build.get("pct", 0)
        else:
            out["message"] = "Starting the build"
    elif phase and phase != "done":
        out["state"] = "error"
        out["error"] = "the build stopped at '%s' without finishing" % phase
        out["message"] = out["error"] + ". Fetch again to restart it."
    else:
        out["message"] = "Not on this server yet. Fetching it downloads 5.4 GB once and takes a while."
    return out


def fetch():
    st = status()
    if st["state"] in ("ready", "building"):
        return st
    d = data_dir()
    os.makedirs(d, exist_ok=True)
    builder = first_existing(BUILDER)
    if not builder:
        st["state"] = "error"
        st["error"] = "py/bio/build-yeast-1011.py is not on this server"
        return st
    # Detached: the engine kills a script that runs past its limit, and this one runs for
    # an hour. Its own session, its own log, nothing shared with this process.
    log = open(os.path.join(d, "build.log"), "ab")
    try:
        p = subprocess.Popen([sys.executable, builder, d],
                             stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             close_fds=True, start_new_session=True)
    except Exception as e:
        st["state"] = "error"
        st["error"] = "could not start the build: %s" % e
        return st
    # build.json says 'starting' within a moment; give it that moment so the first status
    # the caller sees is the build's own and not "absent".
    for _ in range(20):
        time.sleep(0.1)
        if os.path.exists(os.path.join(d, "build.json")):
            break
    st = status()
    if st["state"] == "absent":
        st["state"] = "building"
        st["message"] = "Starting the build (pid %d)" % p.pid
    return st


def strains():
    d = data_dir()
    names = []
    try:
        with open(os.path.join(d, "strains.txt")) as fh:
            names = [ln.strip() for ln in fh if ln.strip()]
    except Exception:
        pass
    return {"ok": bool(names), "strains": json.dumps(names), "count": len(names),
            "error": None if names else "the strain list is not on this server yet"}


def roman_chrom(t):
    """Anything a user or a file might call a yeast chromosome -> chrI..chrXVI / chrM."""
    roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
             "XIII", "XIV", "XV", "XVI"]
    s = str(t or "").strip()
    low = s.lower()
    for pre in ("chromosome", "chrom", "chr"):
        if low.startswith(pre):
            s = s[len(pre):]
            break
    if s.isdigit() and 0 < int(s) < len(roman):
        return "chr" + roman[int(s)]
    if s.upper() in ("M", "MT", "MITO"):
        return "chrM"
    return "chr" + s.upper()


def gt_text(code):
    a1, a2 = code >> 4, code & 0xF
    return ("." if a1 == 15 else str(a1)) + "/" + ("." if a2 == 15 else str(a2))


def variants(strain_list, chrom, lo, hi, min_af, max_af, kind, cap):
    d = data_dir()
    idx = read_json(os.path.join(d, "sites", "index.json"))
    out = {"ok": False, "vcf": "", "count": 0, "truncated": False, "strains": 0,
           "note": "", "error": None}
    if not idx.get("total"):
        out["error"] = "the 1011 genomes data is not on this server yet"
        return out
    total = int(idx["total"])
    index = idx.get("index") or {}
    order = idx.get("chromosomes") or list(index.keys())

    # Which strains, by column.
    names = []
    try:
        with open(os.path.join(d, "strains.txt")) as fh:
            names = [ln.strip() for ln in fh if ln.strip()]
    except Exception:
        pass
    col = {n: i for i, n in enumerate(names)}
    low = {n.lower(): i for i, n in enumerate(names)}
    want = []
    missing = []
    strain_list = [str(x).strip() for x in strain_list if str(x).strip()]
    for s in strain_list:
        j = col.get(s)
        if j is None:
            j = low.get(s.lower())
        if j is None:
            missing.append(s)
        elif j not in want:
            want.append(j)
    if strain_list and not want:
        out["error"] = "no strain called " + ", ".join(missing[:5]) + " in the 1011 set"
        return out
    if missing:
        out["note"] = "Not in the set: " + ", ".join(missing[:8])
    out["strains"] = len(want)

    # The chosen strains' columns: one contiguous read each.
    columns = []
    if want:
        with open(os.path.join(d, "gt.bin"), "rb") as fh:
            for j in want:
                fh.seek(j * total)
                columns.append(fh.read(total))
        if any(len(c) != total for c in columns):
            out["error"] = "the genotype matrix is truncated; rebuild it"
            return out
    wanted_names = [names[j] for j in want]

    chroms = order
    if chrom:
        c = roman_chrom(chrom)
        if c not in index:
            out["error"] = '"%s" is not a chromosome in the 1011 genomes matrix' % chrom
            return out
        chroms = [c]

    lines = []
    count = 0
    truncated = False
    started = time.time()
    for c in chroms:
        entry = index[c]
        base = int(entry["offset"])
        path = os.path.join(d, "sites", c + ".tsv")
        try:
            fh = open(path)
        except Exception:
            continue
        with fh:
            k = -1
            for ln in fh:
                k += 1
                f = ln.rstrip("\n").split("\t")
                if len(f) < 8:
                    continue
                pos = int(f[0])
                if lo and pos < lo:
                    continue
                if hi and pos > hi:
                    break
                ref, alts = f[2], f[3].split(",")
                if kind == "snp" and (len(ref) != 1 or any(len(a) != 1 for a in alts)):
                    continue
                if kind == "indel" and len(ref) == 1 and all(len(a) == 1 for a in alts):
                    continue
                afs = []
                for a in f[7].split(","):
                    try:
                        afs.append(float(a))
                    except ValueError:
                        afs.append(-1.0)
                info = []
                if want:
                    # ANY of the strains carries a non-reference allele here.
                    carried = set()
                    gts = []
                    site = base + k
                    for ci, colbytes in enumerate(columns):
                        code = colbytes[site]
                        a1, a2 = code >> 4, code & 0xF
                        hit = False
                        for a in (a1, a2):
                            if 0 < a < 15:
                                carried.add(a)
                                hit = True
                        if hit:
                            gts.append(wanted_names[ci] + ":" + gt_text(code))
                    if not carried:
                        continue
                    # Only the alleles somebody carries, each with its own frequency --
                    # and only the drawable ones: '*' and <SYMBOLIC> are positions in the
                    # ALT list, not bases.
                    keep = sorted(a for a in carried
                                  if a - 1 < len(alts) and alts[a - 1] and alts[a - 1] != "*"
                                  and alts[a - 1][0] != "<")
                    if not keep:
                        continue
                    site_af = max((afs[a - 1] if a - 1 < len(afs) else -1.0) for a in keep)
                    if (min_af > 0 and site_af >= 0 and site_af < min_af) or (max_af < 1 and site_af > max_af):
                        continue
                    alt_text = ",".join(alts[a - 1] for a in keep)
                    af_text = ",".join(f[7].split(",")[a - 1] if a - 1 < len(afs) else "." for a in keep)
                    shown = gts[:GT_SHOWN]
                    more = len(gts) - len(shown)
                    info.append("GT=" + ",".join(shown) + (("+%d" % more) if more > 0 else ""))
                    info.append("NS=%d" % len(gts))
                else:
                    site_af = max(afs) if afs else -1.0
                    if (min_af > 0 and site_af >= 0 and site_af < min_af) or (max_af < 1 and site_af > max_af):
                        continue
                    alt_text = f[3]
                    af_text = f[7]
                if af_text:
                    info.append("AF=" + af_text)
                if f[5]:
                    info.append("AC=" + f[5])
                if f[6]:
                    info.append("AN=" + f[6])
                lines.append("\t".join([c, f[0], f[1] or ".", ref, alt_text, f[4] or ".",
                                        "PASS", ";".join(info) or "."]))
                count += 1
                if count >= cap:
                    truncated = True
                    break
        if truncated:
            break
    out["ok"] = True
    out["vcf"] = "\n".join(lines)
    out["count"] = count
    out["truncated"] = truncated
    if truncated:
        out["note"] = (out["note"] + " " if out["note"] else "") + (
            "Stopped at %s lines; narrow it by chromosome, strain or allele frequency for the rest."
            % "{:,}".format(cap))
    works.msg("%s variant line(s) in %.1f s" % ("{:,}".format(count), time.time() - started))
    return out


def as_float(v, default):
    try:
        x = float(v)
        return x if x == x else default
    except Exception:
        return default


def as_int(v, default):
    try:
        return int(float(v))
    except Exception:
        return default


action = str(works.param(1) or "status").strip().lower()
if action == "status":
    works.resolve(status())
elif action == "fetch":
    works.resolve(fetch())
elif action == "strains":
    works.resolve(strains())
elif action == "variants":
    # A '-' is "nothing": the caller sends it in place of an empty value so that no
    # position in the argument list is ever blank.
    def blank(v):
        return None if (v is None or str(v).strip() in ("", "-")) else v
    raw = blank(works.param(2))
    if isinstance(raw, list):
        strain_list = [str(x) for x in raw]
    else:
        strain_list = [x for x in str(raw or "").replace(";", ",").split(",")]
    chrom = str(blank(works.param(3)) or "").strip()
    lo = as_int(blank(works.param(4)), 0)
    hi = as_int(blank(works.param(5)), 0)
    min_af = max(0.0, min(1.0, as_float(blank(works.param(6)), 0.0)))
    max_af = max(0.0, min(1.0, as_float(blank(works.param(7)), 1.0)))
    kind = str(blank(works.param(8)) or "all").strip().lower()
    if kind not in ("all", "snp", "indel"):
        kind = "all"
    cap = max(1, min(MAX_LINES, as_int(works.param(9), DEFAULT_LINES)))
    works.resolve(variants(strain_list, chrom, lo, hi, min_af, max_af, kind, cap))
else:
    works.resolve({"ok": False, "error": "unknown action '%s'" % action})
