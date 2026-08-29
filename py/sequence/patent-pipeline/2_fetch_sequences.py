#!/usr/bin/env python3
"""
Stage 2 — collect the disclosed nucleotide sequences for the stage-1 patents.

Patent sequences are NOT in the BigQuery publications table; they come from a sequence source.
This script is source-agnostic and keeps only sequences whose patent is in patents_meta.jsonl.

Sources (--source):
  fasta        A FASTA you already have. Each header must let us recover the patent number,
               e.g. '>US20210123456A1|S12' or '>US20210123456A1 seq 12 ...'. (--in FILE.fa[.gz])
  lens-patseq  A Lens.org PatSeq *bulk export* directory (free with a Lens account:
               lens.org → PatSeq → Bulk). We scan it for a sequences FASTA and any table that
               maps a sequence id to a patent document number, and stitch them together.
               (--patseq DIR)
  ena          Fetch from EMBL-EBI ENA's patent sequence set by patent number via its REST API
               (no key). Slower and coverage varies; best for a modest patent count. (network)

Output: <work>/patent_sequences.fa   headers '>CANONICALNUMBER|SEQID'
Only A/C/G/T/U/N sequences of length >= --min-len are kept (U normalized to T downstream).
"""
import argparse
import glob
import gzip
import json
import os
import re

NUC = re.compile(r"^[ACGTUN]+$", re.I)


def norm(num):
    """Loose key for matching patent numbers across formats (strip non-alnum, upper)."""
    return re.sub(r"[^A-Z0-9]", "", ("" + (num or "")).upper())


def load_targets(work):
    """normalized-number -> canonical publication_number, from stage 1."""
    targets = {}
    path = os.path.join(work, "patents_meta.jsonl")
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            pn = rec.get("publication_number") or ""
            if pn:
                targets[norm(pn)] = pn
    return targets


def _open(p):
    return gzip.open(p, "rt") if p.endswith(".gz") else open(p, encoding="utf-8", errors="replace")


def iter_fasta(path):
    hdr, seq = None, []
    with _open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith(">"):
                if hdr is not None:
                    yield hdr, "".join(seq)
                hdr, seq = line[1:].strip(), []
            else:
                seq.append(line.strip())
    if hdr is not None:
        yield hdr, "".join(seq)


def patent_from_header(hdr):
    """Recover a patent number token from a FASTA header (first US/EP/WO-looking token)."""
    m = re.search(r"\b((?:US|EP|WO|CN|JP)[\-\s]?\d[\d\-/]*[A-Z]?\d?)\b", hdr, re.I)
    if m:
        return m.group(1)
    return hdr.split("|")[0].split()[0]


def seqid_from_header(hdr, fallback):
    parts = hdr.split("|")
    if len(parts) > 1 and parts[1].strip():
        return re.sub(r"\s+", "", parts[1].strip())[:24]
    m = re.search(r"(?:seq(?:uence)?[\s_\-]*id[\s_:\-]*)(\w+)", hdr, re.I)
    return (m.group(1) if m else fallback)[:24]


def emit(out, canonical, seqid, seq, min_len, seen):
    s = re.sub(r"\s", "", seq).upper()
    if len(s) < min_len or not NUC.match(s):
        return 0
    key = (canonical, seqid, s)
    if key in seen:
        return 0
    seen.add(key)
    out.write(">%s|%s\n%s\n" % (canonical, seqid, s))
    return 1


def from_fasta(inp, targets, out, min_len, keep_all):
    seen, n, i = set(), 0, 0
    for hdr, seq in iter_fasta(inp):
        i += 1
        pn = patent_from_header(hdr)
        canonical = targets.get(norm(pn))
        if not canonical:
            if not keep_all:
                continue
            canonical = pn
        n += emit(out, canonical, seqid_from_header(hdr, "S%d" % i), seq, min_len, seen)
    return n


def from_lens_patseq(patseq_dir, targets, out, min_len, keep_all):
    """Best-effort over a PatSeq bulk export: use every FASTA in the dir; recover the patent
    from the header. PatSeq FASTA headers include the patent document number."""
    n = 0
    fastas = []
    for ext in ("*.fa", "*.fasta", "*.fa.gz", "*.fasta.gz", "*.txt"):
        fastas += glob.glob(os.path.join(patseq_dir, "**", ext), recursive=True)
    if not fastas:
        raise SystemExit("No FASTA found under %s (PatSeq bulk export should contain sequence FASTA files)." % patseq_dir)
    for fa in sorted(set(fastas)):
        try:
            n += from_fasta(fa, targets, out, min_len, keep_all)
        except Exception as e:
            print("  ! skipped %s (%s)" % (fa, e))
    return n


def from_ena(targets, out, min_len):
    """Query EBI-ENA for patent sequences by patent number. Uses the ENA browser API text
    search on the patent number; parses returned FASTA. Requires network; coverage varies."""
    import urllib.parse
    import urllib.request
    n = 0
    base = "https://www.ebi.ac.uk/ena/browser/api/fasta/textsearch"
    for i, (nk, canonical) in enumerate(targets.items(), 1):
        q = urllib.parse.quote('%s' % canonical)
        url = "%s?query=%s&result=sequence" % (base, q)
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read().decode("utf-8", "replace")
        except Exception:
            continue
        j = 0
        for hdr, seq in _fasta_from_text(data):
            j += 1
            n += emit(out, canonical, "E%d" % j, seq, min_len, set())
        if i % 200 == 0:
            print("  ENA: %d/%d patents queried, %d seqs" % (i, len(targets), n))
    return n


def _fasta_from_text(text):
    hdr, seq = None, []
    for line in text.splitlines():
        if line.startswith(">"):
            if hdr is not None:
                yield hdr, "".join(seq)
            hdr, seq = line[1:], []
        elif hdr is not None:
            seq.append(line.strip())
    if hdr is not None:
        yield hdr, "".join(seq)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="./out")
    ap.add_argument("--source", required=True, choices=["fasta", "lens-patseq", "ena"])
    ap.add_argument("--in", dest="inp", help="FASTA (for --source fasta)")
    ap.add_argument("--patseq", help="PatSeq bulk export dir (for --source lens-patseq)")
    ap.add_argument("--min-len", type=int, default=15, help="drop sequences shorter than this")
    ap.add_argument("--keep-all", action="store_true",
                    help="keep sequences whose patent isn't in the stage-1 set (default: drop)")
    args = ap.parse_args()

    targets = load_targets(args.work)
    print("Loaded %d target patents from stage 1." % len(targets))
    out_path = os.path.join(args.work, "patent_sequences.fa")
    with open(out_path, "w", encoding="utf-8") as out:
        if args.source == "fasta":
            if not args.inp:
                raise SystemExit("--source fasta needs --in FILE.fa")
            n = from_fasta(args.inp, targets, out, args.min_len, args.keep_all)
        elif args.source == "lens-patseq":
            if not args.patseq:
                raise SystemExit("--source lens-patseq needs --patseq DIR")
            n = from_lens_patseq(args.patseq, targets, out, args.min_len, args.keep_all)
        else:
            n = from_ena(targets, out, args.min_len)
    print("Wrote %d sequences to %s" % (n, out_path))


if __name__ == "__main__":
    main()
