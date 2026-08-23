"""Read BED intervals over a genomic region from a (large) BIG_DATA .bed.gz.

Designed for big genome-wide BED files (e.g. patent hits): on first use it builds
a sorted, bgzip + tabix index in the BIG_DATA cache (via pysam — no external
tabix/bgzip binary needed), then answers each region query by streaming only that
region. If the index can't be built it falls back to a plain gzip linear scan, so
the query still works (just slower).

Params (after the EngineMonitor at param(0)):
    param(1) : bed path ('/bd/...' or BIG_DATA-relative or absolute)
    param(2) : chromosome
    param(3) : region start (genomic)
    param(4) : region end (genomic)
    param(5) : strand ('1' | '-1' | ''), optional filter

Resolves { values, indexed, count, error } where values is a JSON array of
[start, end, name] (0-based BED coords).
"""
import os
import sys
import json
import gzip
import sqlite3
import subprocess

from ion import works


def _reexec_under_venv():
    try:
        import pysam  # noqa: F401
        return
    except Exception:
        pass
    for py in (os.environ.get("BAJACLIP_PYTHON"),
               os.environ.get("BAJASPLICE_PYTHON"),
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3")):
        if py and os.path.exists(py) and \
                os.path.realpath(py) != os.path.realpath(sys.executable):
            os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])


_reexec_under_venv()

_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA")
MAX_ROWS = 20000


def resolve_bd(u):
    u = str(u)
    if u.startswith("http://") or u.startswith("https://") or u.startswith("ftp://"):
        return u
    if _BD:
        if u.startswith("/bd/"):
            return _BD.rstrip("/") + u[3:]
        if not os.path.isabs(u):
            return os.path.join(_BD, u)
    return u


def name_candidates(name):
    """Acceptable sequence names for a query: the BED's first column may be a
    transcript id (ENST..[.version]) or a chromosome, so match exactly, on the
    version-stripped base, and on chr/no-chr variants."""
    name = str(name)
    base = name.split(".")[0]
    n = base.replace("chr", "")
    return {name, base, n, "chr" + n}


def name_matches(contig, cands):
    return contig in cands or contig.split(".")[0] in cands


def ensure_indexed(path):
    """Return a bgzip+tabix-indexed copy of path (built once, cached), or None."""
    import pysam
    cache = os.path.join(_BD or os.path.dirname(path), "cache", "tabix")
    base = os.path.splitext(os.path.basename(path))[0]        # strip .gz
    if base.endswith(".bed"):
        base = base[:-4]
    gz = os.path.join(cache, base + ".sorted.bed.gz")
    if os.path.exists(gz) and os.path.exists(gz + ".tbi"):
        return gz
    try:
        works.msg("Indexing this data for the first time — this load may take a bit longer…")
        os.makedirs(cache, exist_ok=True)
        plain = os.path.join(cache, base + ".sorted.bed")
        # decompress + sort by chrom,start (tabix requires sorted input)
        env = dict(os.environ, TMPDIR=cache)
        with open(plain, "wb") as out:
            zcat = subprocess.Popen(["zcat", path], stdout=subprocess.PIPE, env=env)
            srt = subprocess.Popen(["sort", "-k1,1", "-k2,2n"], stdin=zcat.stdout,
                                   stdout=out, env=env)
            zcat.stdout.close()
            srt.communicate()
            zcat.wait()
        if srt.returncode != 0 or zcat.returncode != 0:
            raise RuntimeError("sort/zcat failed")
        # bgzip + tabix index in place -> plain+'.gz' and plain+'.gz.tbi'
        pysam.tabix_index(plain, preset="bed", force=True)
        made = plain + ".gz"
        if os.path.exists(made) and os.path.exists(made + ".tbi"):
            if made != gz:
                os.replace(made, gz)
                if os.path.exists(made + ".tbi"):
                    os.replace(made + ".tbi", gz + ".tbi")
            return gz
    except Exception:
        return None
    return None


def read_tabix(indexed, chrom, start, end):
    import pysam
    tb = pysam.TabixFile(indexed)
    cands = name_candidates(chrom)
    out = []
    for c in tb.contigs:
        if not name_matches(c, cands):
            continue
        for row in tb.fetch(c, max(0, start), end, parser=pysam.asTuple()):
            try:
                s = int(row[1]); e = int(row[2])
            except Exception:
                continue
            out.append([s, e, row[3] if len(row) > 3 else ""])
            if len(out) >= MAX_ROWS:
                break
        if len(out) >= MAX_ROWS:
            break
    return out


def ensure_assignee_db(tsv):
    """Build (once, cached) a sqlite id->assignee index from a TSV, return its path.

    TSV: first column = patent id, second column = assignee (header auto-skipped).
    Plain or .gz. Keyed lookup keeps region queries fast on a large mapping.
    """
    tsv = resolve_bd(tsv)
    if not tsv or not os.path.exists(tsv):
        return None
    cache = os.path.join(_BD or os.path.dirname(tsv), "cache", "tabix")
    db = os.path.join(cache, os.path.basename(tsv) + ".sqlite")
    if os.path.exists(db) and os.path.getmtime(db) >= os.path.getmtime(tsv):
        return db
    tmp = db + ".building"
    try:
        works.msg("Indexing patent assignees for the first time — this may take a bit…")
        os.makedirs(cache, exist_ok=True)
        con = sqlite3.connect(tmp)
        con.execute("PRAGMA journal_mode=OFF")
        con.execute("PRAGMA synchronous=OFF")
        con.execute("CREATE TABLE a (id TEXT PRIMARY KEY, name TEXT)")
        op = gzip.open if tsv.endswith(".gz") else open
        batch = []
        with op(tsv, "rt") as f:
            for i, line in enumerate(f):
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 2:
                    continue
                pid = parts[0].strip().split("|")[0]
                if i == 0 and not pid[:1].isdigit():
                    continue   # header row
                batch.append((pid, parts[1].strip()))
                if len(batch) >= 50000:
                    con.executemany("INSERT OR REPLACE INTO a VALUES (?,?)", batch)
                    batch = []
        if batch:
            con.executemany("INSERT OR REPLACE INTO a VALUES (?,?)", batch)
        con.commit()
        con.close()
        os.replace(tmp, db)
        return db
    except Exception:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
        return None


def label_assignees(values, tsv):
    """Replace each row's name (patent id) with its assignee where known."""
    db = ensure_assignee_db(tsv)
    if not db:
        return
    ids = {}
    for row in values:
        ids[str(row[2]).split("|")[0].strip()] = None
    try:
        con = sqlite3.connect(db)
        keys = list(ids.keys())
        for k in range(0, len(keys), 500):
            chunk = keys[k:k + 500]
            qm = ",".join("?" * len(chunk))
            for pid, name in con.execute("SELECT id, name FROM a WHERE id IN (%s)" % qm, chunk):
                ids[pid] = name
        con.close()
    except Exception:
        return
    for row in values:
        asg = ids.get(str(row[2]).split("|")[0].strip())
        if asg:
            row[2] = asg


def read_scan(path, chrom, start, end):
    cands = name_candidates(chrom)
    out = []
    with gzip.open(path, "rt") as f:
        for line in f:
            if not line or line[0] == "#":
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 3 or not name_matches(cols[0], cands):
                continue
            try:
                s = int(cols[1]); e = int(cols[2])
            except Exception:
                continue
            if e < start or s > end:
                continue
            out.append([s, e, cols[3] if len(cols) > 3 else ""])
            if len(out) >= MAX_ROWS:
                break
    return out


path = resolve_bd(str(works.param(1) or ""))
chrom = str(works.param(2) or "")
start = int(float(works.param(3) or 0))
end = int(float(works.param(4) or 0))
# param(6): optional id->assignee lookup TSV (BIG_DATA-relative). When present,
# each interval's label is replaced by the patent assignee.
assignee_tsv = str(works.param(6) or os.environ.get("PATENT_ASSIGNEES") or "").strip()

values = []
indexed_used = False
err = None

if not os.path.exists(path):
    err = "file not found: " + path
else:
    try:
        idx = ensure_indexed(path)
        if idx:
            values = read_tabix(idx, chrom, start, end)
            indexed_used = True
        else:
            values = read_scan(path, chrom, start, end)
    except Exception as e:
        err = str(e)
        try:
            values = read_scan(path, chrom, start, end)
        except Exception as e2:
            err = str(e2)

    # Join patent ids to assignees for the label, if a lookup was provided.
    if values and assignee_tsv:
        try:
            label_assignees(values, assignee_tsv)
        except Exception:
            pass

works.resolve({
    "values": json.dumps(values),
    "indexed": indexed_used,
    "count": len(values),
    "error": err,
})
