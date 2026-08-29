#!/usr/bin/env python3
"""
Stage 4 — turn stage-1 metadata into the 2-column TSV the app joins by patent number.

Output: <work>/aso_sirna_gt_2020_2026_meta.tsv
Row:  <publication_number>\t<number>‖<title>‖<filing_date>‖<assignee>‖<inventors>

The app's read-bed-region.py replaces the BED's col-4 (the patent number) with this label, and
baja/data/patent-hits.js splits it on ‖ into the on-zoom metadata callout. Fields are sanitized
so they never contain a tab, '|', or '‖'. A header row is written (the reader skips it).
"""
import argparse
import json
import os
import re

SEP = "‖"   # ‖  field delimiter inside the single label column


def clean(s, limit=None):
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="./out")
    ap.add_argument("--title-max", type=int, default=140)
    ap.add_argument("--abstract-max", type=int, default=0, help=">0 to append a trimmed abstract line")
    args = ap.parse_args()

    src = os.path.join(args.work, "patents_meta.jsonl")
    out_path = os.path.join(args.work, "aso_sirna_gt_2020_2026_meta.tsv")
    n = 0
    with open(src, encoding="utf-8") as f, open(out_path, "w", encoding="utf-8") as out:
        out.write("patent_id\tlabel\n")   # header (reader auto-skips)
        for line in f:
            try:
                r = json.loads(line)
            except Exception:
                continue
            pn = clean(r.get("publication_number"))
            if not pn:
                continue
            fields = [
                pn,
                clean(r.get("title"), args.title_max),
                clean(r.get("filing_date")),
                clean(first_n(r.get("assignees"), 2)),
                clean(first_n(r.get("inventors"), 3)),
            ]
            if args.abstract_max > 0:
                fields.append(clean(r.get("abstract"), args.abstract_max))
            out.write("%s\t%s\n" % (pn, SEP.join(fields)))
            n += 1
    print("Wrote %d metadata rows to %s" % (n, out_path))


if __name__ == "__main__":
    main()
