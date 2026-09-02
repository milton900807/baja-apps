#!/usr/bin/env python3
"""
Stage 6 — build the metadata TSV for the LEGACY patent index
(patent_hg38_transcript_hits.bed.gz), whose column 4 is NOT a patent number.

Why this exists, and what it can and cannot do
----------------------------------------------
The three patent BEDs in BIG_DATA do not agree about what column 4 holds:

    aso_sirna_gt_hg38_transcript_hits.bed.gz   ENST…  3620 3640  12186406|12186406|  0 +
    lipid_patents_hg38_transcript_hits.bed.gz  ENST…   202  265  10859585|10859585|  0 +
    patent_hg38_transcript_hits.bed.gz         ENST…  1172 1191         2|2|         0 -

The first two carry real US patent numbers and ship an assignees TSV each, so the app resolves
them to 'US<number> <ASSIGNEE>'. The third — 160 MB, the oldest of the three, and the one the
Patents layer loads — carries a bare integer. Measured over the whole file:

    rows       21,439,407
    distinct    3,576,653
    range           2 .. 29,803,555

Sparse across ~30M, so it is a RECORD id from whatever patent-sequence database the file was
built against, not a row index into any small table and not a patent number. Nothing in this
repository or on the app server maps it to a patent: there is no patent_assignees.tsv, and the
producer of that BED is not in the repo. That mapping has to come from the source database.

So this script does the half that can be automated. Give it a record_id -> patent_number map
from that source, plus patent metadata, and it writes the TSV the app joins. Without the map
there is nothing to build, and it says so rather than emitting a file of empty labels.

The join key matters and is easy to get wrong: read-bed-region.py joins on
`col4.split('|')[0]`, which for THIS index is the RECORD id. Column 1 of the output is
therefore the record id, not the patent number — the opposite of stage 4, which writes files
whose BEDs already carry patent numbers.

Usage
-----
    # What is actually in the BED (no map needed) — run this first.
    python3 6_build_patent_index_meta.py --bed /bd/patent_hg38_transcript_hits.bed.gz --probe

    # Build the TSV.
    python3 6_build_patent_index_meta.py \
        --bed  /bd/patent_hg38_transcript_hits.bed.gz \
        --map  record_to_patent.tsv \
        --meta patents_meta.jsonl \
        --out  patent_assignees.tsv

    --map   2 columns, record_id <TAB> patent_number. Header optional.
    --meta  stage-1 patents_meta.jsonl, or any JSONL/TSV/CSV keyed by publication_number
            with title / filing_date / assignees / inventors fields.

Then deploy beside the BED and point the loader at it:
    scp patent_assignees.tsv ubuntu@<server>:/home/ubuntu/baja-bd/
    # baja/data/patents.js:  const ASSIGNEES = '/bd/patent_assignees.tsv';

Output row (same contract as stage 4, different key):
    <record_id>\t<number>‖<title>‖<filing_date>‖<assignee>‖<inventors>
"""
import argparse
import csv
import gzip
import json
import os
import re
import sys

SEP = "‖"   # ‖  field delimiter inside the single label column


def clean(s, limit=None):
    """Strip the three characters that would break the two-column / ‖-packed format."""
    s = re.sub(r"[\t|‖]", " ", ("" + (s or "")))
    s = re.sub(r"\s+", " ", s).strip()
    if limit and len(s) > limit:
        s = s[:limit - 1].rstrip() + "…"
    return s


def first_n(semi_list, n):
    parts = [p.strip() for p in ("" + (semi_list or "")).split(";") if p.strip()]
    out = "; ".join(parts[:n])
    if len(parts) > n:
        out += "; +%d" % (len(parts) - n)
    return out


def open_maybe_gz(path):
    return gzip.open(path, "rt", encoding="utf-8", errors="replace") if path.endswith(".gz") \
        else open(path, "r", encoding="utf-8", errors="replace")


def bed_record_ids(path):
    """The distinct col-4 join keys actually present in the BED, and a few statistics.

    Only these ids are worth carrying: the BED holds 21M rows over 3.6M ids, so keying the
    output on the SOURCE database instead would write tens of millions of rows the app can
    never look up.
    """
    ids = set()
    rows = 0
    lo, hi = None, None
    with open_maybe_gz(path) as f:
        for line in f:
            if not line or line[0] == "#":
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            rid = parts[3].split("|")[0].strip()
            if not rid:
                continue
            rows += 1
            ids.add(rid)
            if rid.isdigit():
                v = int(rid)
                lo = v if lo is None else min(lo, v)
                hi = v if hi is None else max(hi, v)
    return ids, rows, lo, hi


def load_map(path, wanted):
    """record_id -> patent_number, restricted to ids the BED actually uses."""
    m = {}
    with open_maybe_gz(path) as f:
        for i, line in enumerate(f):
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 2:
                parts = [p.strip() for p in line.rstrip("\n").split(",")]
            if len(parts) < 2:
                continue
            rid, pn = parts[0].strip(), parts[1].strip()
            # Header row: not an id/number pair, so skip rather than emit a junk mapping.
            if i == 0 and (not rid or rid.lower() in ("record_id", "id", "seq_id", "sequence_id")):
                continue
            if rid and pn and rid in wanted:
                m[rid] = pn
    return m


def load_meta(path):
    """publication_number -> {title, filing_date, assignees, inventors}."""
    meta = {}

    def put(rec):
        pn = clean(rec.get("publication_number") or rec.get("patent_number")
                   or rec.get("number") or rec.get("patent_id"))
        if pn:
            meta[pn] = rec

    if path.endswith(".jsonl") or path.endswith(".jsonl.gz"):
        with open_maybe_gz(path) as f:
            for line in f:
                try:
                    put(json.loads(line))
                except Exception:
                    continue
    else:
        with open_maybe_gz(path) as f:
            sample = f.read(8192)
            f.seek(0)
            delim = "\t" if sample.count("\t") >= sample.count(",") else ","
            for rec in csv.DictReader(f, delimiter=delim):
                put(rec)
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bed", required=True, help="the transcript-hits BED (.gz ok)")
    ap.add_argument("--map", help="record_id <TAB> patent_number")
    ap.add_argument("--meta", help="patent metadata: JSONL (stage 1) or TSV/CSV")
    ap.add_argument("--out", default="patent_assignees.tsv")
    ap.add_argument("--probe", action="store_true",
                    help="report what is in the BED and stop (no map or metadata needed)")
    ap.add_argument("--title-max", type=int, default=140)
    args = ap.parse_args()

    sys.stderr.write("reading %s …\n" % args.bed)
    ids, rows, lo, hi = bed_record_ids(args.bed)
    sys.stderr.write("  rows      %d\n  distinct  %d\n  range     %s .. %s\n"
                     % (rows, len(ids), lo, hi))

    if args.probe:
        # The one thing a probe is for: saying whether these look like patent numbers at all.
        # US grant numbers are 7-8 digits and publication numbers carry a year prefix; a dense
        # run of small integers is neither.
        small = sum(1 for i in ids if i.isdigit() and int(i) < 1000000)
        sys.stderr.write("  ids under 1,000,000: %d (%.1f%%)\n"
                         % (small, 100.0 * small / max(1, len(ids))))
        sys.stderr.write("  -> these are %s\n" % (
            "record ids, NOT patent numbers - a --map is required"
            if small else "plausibly patent numbers - check a few by hand before mapping"))
        return

    if not args.map or not args.meta:
        sys.stderr.write(
            "\nNothing to build: --map and --meta are both required.\n"
            "This index's column 4 is a record id, so a metadata file keyed by patent number\n"
            "cannot be joined to it without the record_id -> patent_number mapping from the\n"
            "source patent-sequence database. Writing a TSV without it would fill the layer\n"
            "with labels that name nothing.\n")
        sys.exit(2)

    id_to_pn = load_map(args.map, ids)
    sys.stderr.write("mapped %d of %d record ids (%.1f%%)\n"
                     % (len(id_to_pn), len(ids), 100.0 * len(id_to_pn) / max(1, len(ids))))
    meta = load_meta(args.meta)
    sys.stderr.write("metadata for %d patents\n" % len(meta))

    written = 0
    missing_meta = 0
    with open(args.out, "w", encoding="utf-8") as out:
        out.write("patent_id\tlabel\n")   # header (the reader auto-skips it)
        for rid, pn in id_to_pn.items():
            r = meta.get(clean(pn))
            if not r:
                missing_meta += 1
                # The number alone is still worth having: it names a real patent, which is
                # more than the bare record id does. Emitted rather than dropped.
                out.write("%s\t%s\n" % (rid, clean(pn)))
                written += 1
                continue
            fields = [
                clean(pn),
                clean(r.get("title"), args.title_max),
                clean(r.get("filing_date") or r.get("date")),
                clean(first_n(r.get("assignees") or r.get("assignee"), 2)),
                clean(first_n(r.get("inventors") or r.get("inventor"), 3)),
            ]
            out.write("%s\t%s\n" % (rid, SEP.join(fields)))
            written += 1

    sys.stderr.write("wrote %d rows to %s\n" % (written, args.out))
    # Every shortfall named, so a thin file is visibly thin rather than quietly so.
    if missing_meta:
        sys.stderr.write("  %d had a patent number but no metadata row (number only)\n" % missing_meta)
    unmapped = len(ids) - len(id_to_pn)
    if unmapped:
        sys.stderr.write("  %d of the BED's record ids are not in --map and stay unlabelled\n" % unmapped)
    sys.stderr.write("\nDeploy:\n  scp %s ubuntu@<server>:/home/ubuntu/baja-bd/\n"
                     "  then set ASSIGNEES = '/bd/%s' in baja/data/patents.js\n"
                     % (args.out, os.path.basename(args.out)))


if __name__ == "__main__":
    main()
