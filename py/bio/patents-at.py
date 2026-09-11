"""Which patents claim sequence in a genomic window.

The companion to patent-density.py: that one draws the shape, this one answers a click on
it. The hits are keyed by TRANSCRIPT, so a genomic question is answered in two steps --
which transcripts overlap the window, then which patents hit those transcripts.

WHICH DATASET CAN ANSWER THIS AT ALL. aso_sirna_gt and lipid_patents carry a real patent
number in column 4 and ship a TSV mapping it to the publication and assignee. The larger
2020-2025 index does not: its column 4 is a sequential record id and nothing on disk maps
it to a patent, so it can be counted but never named. Asking for it here returns the count
and says so, rather than inventing labels for numbers that are not patent numbers.

Params (after the EngineMonitor):
    param(1) : chromosome, with or without the chr prefix
    param(2) : start (1-based, inclusive)
    param(3) : end
    param(4) : optional dataset key (default aso_sirna_gt)
    param(5) : optional species (default human)
    param(6) : optional maximum patents returned (default 60)

Resolves:
    { ok, chr, start, end, key, nameable, transcripts, hits, count, patents, error }
  patents is a JSON array of { id, label, hits, transcripts, start, end } by hits.
"""
import gzip
import json
import os
import shutil
import subprocess

from ion import works

GFF = {
    "human": "reference_data/human.gencode.annotation.gff3.bgz",
    "mouse": "reference_data/mouse.annotation.gff3.bgz",
}
BED_DIRS = ["/home/ubuntu/baja-bd", "bd", "../baja-bd"]
# A GENOMIC hit file, where one exists, replaces BOTH the annotation lookup and the
# full scan below: the window can be asked of a tabix index directly, and the answer
# carries each hit's real position rather than the span of the transcript it fell in.
# It also contains the intronic hits a cDNA-keyed file cannot represent.
GENOMIC_SETS = {
    "aso_sirna_gt": "aso_sirna_gt_grch38_primary_hits.bed.gz",
}


def genomic_index(name):
    """The tabix-indexed copy the app builds beside the BED, if it is there."""
    if not name:
        return ""
    base = name[:-7] if name.endswith(".bed.gz") else name
    for d in BED_DIRS:
        p = os.path.join(d, "cache", "tabix", base + ".sorted.bed.gz")
        if os.path.exists(p) and os.path.exists(p + ".tbi"):
            return p
    return ""


def genomic_rows(idx, chrom, start, end):
    """Rows over a window, pysam first and the tabix binary as a fallback."""
    cands = [chrom, "chr" + chrom.replace("chr", "")]
    for c in dict.fromkeys(cands):
        try:
            import pysam
            tb = pysam.TabixFile(idx)
            if c not in tb.contigs:
                continue
            return [str(r).split("\t") for r in
                    tb.fetch(c, max(0, start), end, parser=pysam.asTuple())]
        except Exception:
            pass
        tabix = shutil.which("tabix")
        if tabix:
            try:
                pr = subprocess.run([tabix, idx, "%s:%d-%d" % (c, max(1, start), end)],
                                    capture_output=True, text=True, timeout=60)
                rows = [ln.split("\t") for ln in pr.stdout.splitlines() if ln]
                if rows:
                    return rows
            except Exception:
                pass
    return []


SETS = {
    "aso_sirna_gt": ("aso_sirna_gt_hg38_transcript_hits.bed.gz", "aso_sirna_gt_meta.tsv"),
    "lipid_patents": ("lipid_patents_hg38_transcript_hits.bed.gz", "lipid_patents_assignees.tsv"),
    "patent": ("patent_hg38_transcript_hits.bed.gz", ""),
}

chrom = str(works.param(1) or "").strip()
try:
    start = int(float(works.param(2) or 0))
    end = int(float(works.param(3) or 0))
except Exception:
    start, end = 0, 0
key = (str(works.param(4) or "aso_sirna_gt").strip() or "aso_sirna_gt")
species = (str(works.param(5) or "human").strip().lower() or "human")
try:
    max_out = int(float(works.param(6) or 60))
except Exception:
    max_out = 60
max_out = max(1, min(500, max_out))

out = {"ok": False, "chr": chrom, "start": start, "end": end, "key": key,
       "nameable": False, "transcripts": 0, "hits": 0, "count": 0,
       "patents": "[]", "error": None}


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


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def load_patent_labels(tsv_path):
    """A metadata TSV -> (labels, meta). Two shapes are handled: the flat
    'number -> label' one, and the packed 'US<n>|title|filed|granted|assignee'
    one (U+2016 separated). meta[id] keeps the fields separate so the karyotype
    can lay the title and dates out on their own lines once a chromosome is
    zoomed in far enough; labels[id] is the collapsed 'number assignee' line.
    One reader for both the genomic and the transcript path, so a click on the
    strip and a label on the chromosome describe a patent the same way."""
    SEP = "‖"
    labels, meta = {}, {}
    if not tsv_path or not os.path.exists(tsv_path):
        return labels, meta
    try:
        with open(tsv_path, "r") as fh:
            for ln in fh:
                p = ln.rstrip("\n").split("\t")
                if len(p) >= 2 and p[0] and p[0] != "patent_id":
                    k = p[0].strip()
                    lab = p[1].strip()
                    if SEP in lab:
                        fs = [x.strip() for x in lab.split(SEP)]
                        g = lambda i: (fs[i] if len(fs) > i else "")
                        num, who = g(0), g(4)
                        meta[k] = {"title": g(1), "filed": g(2),
                                   "granted": g(3), "assignee": who}
                        lab = (num + " " + who).strip() if who else num
                    labels[k] = lab
    except Exception:
        return {}, {}
    return labels, meta


def transcripts_in(gff_path, c, s1, e1):
    """Transcript ids overlapping the window -> their genomic spans, by tabix so only the
    window is read. The spans are what lets a caller DRAW a patent where it sits rather
    than only list it."""
    q = c if c.startswith("chr") else ("chr" + c)
    rows = []
    try:
        import pysam
        tb = pysam.TabixFile(gff_path)
        rows = list(tb.fetch(q, max(0, s1 - 1), e1))
    except Exception:
        rows = []
        tabix = shutil.which("tabix")
        if tabix:
            try:
                pr = subprocess.run([tabix, gff_path, "%s:%d-%d" % (q, max(1, s1), e1)],
                                    capture_output=True, text=True, timeout=180)
                rows = [ln for ln in pr.stdout.splitlines() if ln and not ln.startswith("#")]
            except Exception:
                rows = []
    spans = {}
    for ln in rows:
        f = ln.split("\t")
        if len(f) < 9 or f[2] != "transcript":
            continue
        t = attrs(f[8]).get("transcript_id") or ""
        if not t:
            continue
        try:
            a, b = int(f[3]), int(f[4])
        except Exception:
            continue
        spans[t] = (a, b)
        spans[t.split(".")[0]] = (a, b)
    return spans


gff = first_existing(GFF.get(species) or GFF["human"])
bed_name, tsv_name = SETS.get(key) or SETS["aso_sirna_gt"]
bed = find_file(bed_name)
tsv = find_file(tsv_name)
# Resolved before the dispatch below: when this is present the window can be read
# straight from a tabix index and neither the annotation nor the transcript file is
# touched.
gidx = genomic_index(GENOMIC_SETS.get(key) or "")
out["nameable"] = bool(tsv_name)

if not chrom or end < start:
    out["error"] = "a chromosome and a range are needed"
elif not gff or not os.path.exists(gff):
    out["error"] = "the %s annotation is not on this server" % species
elif not bed and not gidx:
    out["error"] = "the %s hit file is not on this server" % key
elif gidx:
    # GENOMIC PATH. One indexed window read, no annotation and no full scan: the old
    # route had to find every transcript overlapping the window and then read the
    # whole hit file to see which rows belonged to them.
    works.msg("Reading the patent hits in that window…")
    by_pat = {}
    tx_by_pat = {}
    span_by_pat = {}
    hits = 0
    for f in genomic_rows(gidx, chrom, start, end):
        if len(f) < 4:
            continue
        pid = f[3].split("|")[0].strip()
        if not pid:
            continue
        try:
            a, b = int(f[1]), int(f[2])
        except Exception:
            continue
        by_pat[pid] = by_pat.get(pid, 0) + 1
        # The SPAN is now the extent of the hits themselves, not of the transcripts
        # they landed in, so a patent no longer appears to cover a whole gene on the
        # strength of one 20-mer inside it.
        cur = span_by_pat.get(pid)
        span_by_pat[pid] = (min(cur[0], a), max(cur[1], b)) if cur else (a, b)
        hits += 1
    out["hits"] = hits
    out["transcripts"] = 0
    # NAME THEM, so the karyotype can label the strip and not only draw its height.
    # This path used to stop at the counts -- it built by_pat and the spans and then
    # emitted nothing, so the chromosome showed a patent strip with no patents on it
    # and a click returned an empty list. The metadata TSV keys on the same bare
    # number the hit rows carry (column 4, '<number>|<number>|'), so the labels, the
    # title and the dates are all available here; they were simply never read.
    labels, meta = load_patent_labels(tsv)
    rows = []
    for pid, n in by_pat.items():
        sp = span_by_pat.get(pid)
        m = meta.get(pid) or {}
        rows.append({
            "id": pid,
            "label": labels.get(pid) or (("US" + pid) if out["nameable"] else ("record " + pid)),
            "title": m.get("title", ""),
            "filed": m.get("filed", ""),
            "granted": m.get("granted", ""),
            "assignee": m.get("assignee", ""),
            "hits": n,
            "transcripts": 0,
            "start": (sp[0] if sp else 0),
            "end": (sp[1] if sp else 0),
        })
    rows.sort(key=lambda r: (-r["hits"], r["id"]))
    out["count"] = len(rows)
    out["patents"] = json.dumps(rows[:max_out])
    out["ok"] = True
    works.msg("%d patent(s), %d hit(s)" % (len(rows), hits))
else:
    tspan = transcripts_in(gff, chrom, start, end)
    tids = set(tspan.keys())
    out["transcripts"] = len([t for t in tids if "." in t])
    if not tids:
        out["ok"] = True
        works.msg("no transcripts in that window")
    else:
        works.msg("Reading the patent hits over %d transcript(s)…" % out["transcripts"])
        by_pat = {}
        tx_by_pat = {}
        span_by_pat = {}
        hits = 0
        with gzip.open(bed, "rt") as fh:
            for line in fh:
                i = line.find("\t")
                if i <= 0:
                    continue
                t = line[:i]
                if t not in tids and t.split(".")[0] not in tids:
                    continue
                f = line.rstrip("\n").split("\t")
                if len(f) < 4:
                    continue
                # '12186406|12186406|' -- the same id repeated; take the first field.
                pid = f[3].split("|")[0].strip()
                if not pid:
                    continue
                by_pat[pid] = by_pat.get(pid, 0) + 1
                tx_by_pat.setdefault(pid, set()).add(t)
                sp = tspan.get(t) or tspan.get(t.split(".")[0])
                if sp:
                    cur = span_by_pat.get(pid)
                    span_by_pat[pid] = (min(cur[0], sp[0]), max(cur[1], sp[1])) if cur else sp
                hits += 1
        out["hits"] = hits

        # The metadata TSVs come in two shapes. The older ones are a flat
        # 'number -> US<number> <assignee>' label. The newer ones pack the fields as
        # 'US<number>|title|filed|granted|assignee' (U+2016 as the separator) so the
        # canvas layer can show them as labelled lines. This endpoint wants ONE readable
        # string, so a packed label is collapsed back to number + assignee rather than
        # being emitted with its separators showing.
        SEP = "\u2016"
        labels = {}
        meta = {}          # id -> {title, filed, granted, assignee}
        if tsv and os.path.exists(tsv):
            try:
                with open(tsv, "r") as fh:
                    for ln in fh:
                        p = ln.rstrip("\n").split("\t")
                        if len(p) >= 2 and p[0] and p[0] != "patent_id":
                            key = p[0].strip()
                            lab = p[1].strip()
                            if SEP in lab:
                                f = [x.strip() for x in lab.split(SEP)]
                                g = lambda i: (f[i] if len(f) > i else "")
                                num, who = g(0), g(4)
                                # KEEP THE FIELDS, do not just collapse them.
                                #
                                # The karyotype draws the title and the dates once a
                                # chromosome is zoomed in far enough for them to fit, and
                                # it can only do that if they arrive separately. Flattening
                                # to 'number assignee' here is what made that impossible:
                                # the data was parsed and then thrown away one line later.
                                meta[key] = {
                                    "title": g(1), "filed": g(2),
                                    "granted": g(3), "assignee": who,
                                }
                                lab = (num + " " + who).strip() if who else num
                            labels[key] = lab
            except Exception:
                labels, meta = {}, {}

        rows = []
        for pid, n in by_pat.items():
            sp = span_by_pat.get(pid)
            m = meta.get(pid) or {}
            rows.append({
                "id": pid,
                "label": labels.get(pid) or (("US" + pid) if out["nameable"] else ("record " + pid)),
                # Separate fields so a caller can lay them out; empty when the set has no
                # metadata TSV, which the karyotype treats as "draw the label only".
                "title": m.get("title", ""),
                "filed": m.get("filed", ""),
                "granted": m.get("granted", ""),
                "assignee": m.get("assignee", ""),
                "hits": n,
                "transcripts": len(tx_by_pat.get(pid) or ()),
                # Where it sits, so it can be drawn on a chromosome and not only listed.
                # The union of the spans of the transcripts it hits in this window.
                "start": (sp[0] if sp else 0),
                "end": (sp[1] if sp else 0),
            })
        rows.sort(key=lambda r: (-r["hits"], r["id"]))
        out["count"] = len(rows)
        out["patents"] = json.dumps(rows[:max_out])
        out["ok"] = True
        works.msg("%d patent(s), %d hit(s)" % (len(rows), hits))

works.resolve(out)
