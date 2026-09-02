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
import csv
import glob
import gzip
import json
import os
import re

NUC = re.compile(r"^[ACGTUN]+$", re.I)

# ---- PatSeq bulk export: the FASTA and the mapping table are separate files ---------------
# A PatSeq export keys its FASTA records by SEQUENCE id, and carries the sequence -> patent
# document mapping in a separate table. Column naming is not stable across exports, so the
# candidates below are matched loosely and both can be overridden (--seq-id-col / --patent-col).
# Run --inspect first: it prints every table and FASTA found, the columns it detected and a
# sample of what it would map, without writing anything.
SEQ_ID_COLS = [
    "sequence_id", "seq_id", "seqid", "sequence id", "lens_seq_id", "lens sequence id",
    "sequence_identifier", "doc_seq_id", "sequence_number", "seq_no", "id",
]
PATENT_COLS = [
    "publication_number", "patent_number", "document_number", "doc_number", "patent_id",
    "pub_number", "patent_publication_number", "patent_document_number", "publication",
    "patent", "document", "doc_key", "lens_id",
]


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
        # First TOKEN, not the whole field with its spaces squeezed out: a PatSeq header reads
        # '>29803555|1 Homo sapiens', and collapsing that gave the id '1Homosapiens', which then
        # travelled into the BED's col-4 second field and out to the app.
        return parts[1].strip().split()[0][:24]
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


def _first_line(path):
    try:
        with _open(path) as f:
            for line in f:
                if line.strip():
                    return line
    except Exception:
        pass
    return ""


def _looks_fasta(path):
    """Sniffed, not assumed from the extension: PatSeq ships .txt files that are tables and
    .txt files that are FASTA, and treating a table as FASTA silently yields nothing."""
    return _first_line(path).lstrip().startswith(">")


def _pick_col(fieldnames, candidates):
    """Match a column loosely: exact first, then substring, on a normalized name."""
    if not fieldnames:
        return None
    norm_map = {re.sub(r"[^a-z0-9]", "", (c or "").lower()): c for c in fieldnames}
    for cand in candidates:
        k = re.sub(r"[^a-z0-9]", "", cand)
        if k in norm_map:
            return norm_map[k]
    for cand in candidates:
        k = re.sub(r"[^a-z0-9]", "", cand)
        for nk, orig in norm_map.items():
            if k and k in nk:
                return orig
    return None


def _read_table(path, seq_col=None, pat_col=None):
    """seq_id -> patent number from one delimited table. ('', '', 0) if it is not one."""
    head = _first_line(path)
    if not head or head.lstrip().startswith(">"):
        return {}, None, None
    delim = "\t" if head.count("\t") >= head.count(",") else ","
    mapping = {}
    sc = pc = None
    with _open(path) as f:
        rd = csv.DictReader(f, delimiter=delim)
        sc = seq_col or _pick_col(rd.fieldnames, SEQ_ID_COLS)
        pc = pat_col or _pick_col(rd.fieldnames, PATENT_COLS)
        if not sc or not pc or sc == pc:
            return {}, sc, pc
        for row in rd:
            sid = ("" + (row.get(sc) or "")).strip()
            pn = ("" + (row.get(pc) or "")).strip()
            if sid and pn:
                mapping[sid] = pn
    return mapping, sc, pc


def patseq_files(patseq_dir, exclude=()):
    """Every FASTA and every candidate table under the export, split by sniffing.

    `exclude` keeps this run's own outputs out of its inputs: --work is allowed to sit inside
    --patseq, and patent_sequences.fa is opened for writing before the scan starts, so without
    this the scan finds its own empty output file.
    """
    skip = set(os.path.abspath(p) for p in exclude if p)
    paths = []
    for ext in ("*.fa", "*.fasta", "*.fn", "*.seq", "*.txt", "*.tsv", "*.csv",
                "*.fa.gz", "*.fasta.gz", "*.txt.gz", "*.tsv.gz", "*.csv.gz"):
        paths += glob.glob(os.path.join(patseq_dir, "**", ext), recursive=True)
    paths = sorted(set(p for p in paths if os.path.abspath(p) not in skip))
    fastas = [p for p in paths if _looks_fasta(p)]
    tables = [p for p in paths if p not in fastas]
    return fastas, tables


def build_seq_map(tables, seq_col=None, pat_col=None, verbose=True):
    """The sequence -> patent mapping, stitched from every table that has both columns."""
    seq_map = {}
    used = []
    for t in tables:
        try:
            m, sc, pc = _read_table(t, seq_col, pat_col)
        except Exception as e:
            if verbose:
                print("  ! table %s unreadable (%s)" % (os.path.basename(t), e))
            continue
        if m:
            seq_map.update(m)
            used.append((t, sc, pc, len(m)))
            if verbose:
                print("  map %-42s %s -> %s   %d rows" % (os.path.basename(t)[:42], sc, pc, len(m)))
        elif verbose and (sc or pc):
            print("  -   %-42s columns %s / %s -- not both found, skipped"
                  % (os.path.basename(t)[:42], sc, pc))
    return seq_map, used


def from_lens_patseq(patseq_dir, targets, out, min_len, keep_all,
                     seq_col=None, pat_col=None, emit_map=None, exclude=()):
    """A PatSeq bulk export: FASTA keyed by SEQUENCE id, plus a table mapping that id to the
    patent document. This used to glob the FASTAs and read the patent off the header, which is
    what the docstring promised NOT to do -- PatSeq headers carry the sequence id, so on a real
    export every record failed to match a stage-1 patent and was dropped. Nothing said so: the
    run simply ended with 0 sequences, or with --keep-all wrote a file keyed by sequence ids.
    """
    fastas, tables = patseq_files(patseq_dir, exclude)
    if not fastas:
        raise SystemExit("No FASTA found under %s (a PatSeq bulk export contains sequence FASTA files)." % patseq_dir)
    print("Found %d FASTA file(s) and %d candidate table(s)." % (len(fastas), len(tables)))
    seq_map, _ = build_seq_map(tables, seq_col, pat_col)
    print("Sequence -> patent mapping: %d entries." % len(seq_map))
    if not seq_map:
        print("  ! No mapping table matched. Falling back to reading the patent off each FASTA\n"
              "    header, which works only if this export puts it there. If the run ends with\n"
              "    few or no sequences, re-run with --inspect and pass --seq-id-col/--patent-col.")

    if emit_map:
        # The mapping on its own is worth keeping: it is exactly the --map stage 6 needs to
        # put metadata on the legacy patent_hg38_transcript_hits.bed.gz index, whose column 4
        # is a bare sequence record id.
        with open(emit_map, "w", encoding="utf-8") as mf:
            mf.write("record_id\tpatent_number\n")
            for sid, pn in seq_map.items():
                mf.write("%s\t%s\n" % (sid, pn))
        print("Wrote %d mapping rows to %s (use as stage 6 --map)." % (len(seq_map), emit_map))

    n, matched, unmapped = 0, 0, 0
    seen = set()
    for fa in fastas:
        try:
            i = 0
            for hdr, seq in iter_fasta(fa):
                i += 1
                sid = hdr.split("|")[0].split()[0].strip() if hdr else ""
                pn = seq_map.get(sid)
                if pn:
                    matched += 1
                else:
                    unmapped += 1
                    pn = patent_from_header(hdr)      # export that names the patent inline
                canonical = targets.get(norm(pn))
                if not canonical:
                    if not keep_all:
                        continue
                    canonical = pn
                n += emit(out, canonical, seqid_from_header(hdr, sid or ("S%d" % i)),
                          seq, min_len, seen)
        except Exception as e:
            print("  ! skipped %s (%s)" % (fa, e))
    # Named, not silent: a low match rate is the difference between a thin index and a wrong one.
    print("Resolved %d sequences through the mapping table, %d fell back to the header."
          % (matched, unmapped))
    return n


def inspect_patseq(patseq_dir, seq_col=None, pat_col=None):
    """Print what the export contains and what would be mapped, and write nothing."""
    fastas, tables = patseq_files(patseq_dir)
    print("FASTA files (%d):" % len(fastas))
    for f in fastas[:20]:
        print("  %s" % f)
    if len(fastas) > 20:
        print("  … and %d more" % (len(fastas) - 20))
    for f in fastas[:1]:
        print("  first header: %s" % (_first_line(f).strip()[:160] or "(empty)"))
    print("Candidate tables (%d):" % len(tables))
    for t in tables[:20]:
        print("  %s" % t)
    if len(tables) > 20:
        print("  … and %d more" % (len(tables) - 20))
    print("Mapping:")
    seq_map, used = build_seq_map(tables, seq_col, pat_col)
    if not used:
        print("  none -- pass --seq-id-col and --patent-col with the real column names.")
    for sid, pn in list(seq_map.items())[:5]:
        print("  sample  %s -> %s" % (sid, pn))
    print("Total mapping entries: %d" % len(seq_map))


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
    ap.add_argument("--seq-id-col", help="PatSeq mapping table: sequence-id column name")
    ap.add_argument("--patent-col", help="PatSeq mapping table: patent-number column name")
    ap.add_argument("--emit-map", help="also write the sequence-id -> patent-number TSV here "
                                       "(this is stage 6's --map)")
    ap.add_argument("--inspect", action="store_true",
                    help="report what the PatSeq export contains and stop; writes nothing "
                         "and needs no stage-1 output")
    args = ap.parse_args()

    if args.inspect:
        if not args.patseq:
            raise SystemExit("--inspect needs --patseq DIR")
        inspect_patseq(args.patseq, args.seq_id_col, args.patent_col)
        return

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
            n = from_lens_patseq(args.patseq, targets, out, args.min_len, args.keep_all,
                                 args.seq_id_col, args.patent_col, args.emit_map,
                                 exclude=(out_path, args.emit_map))
        else:
            n = from_ena(targets, out, args.min_len)
    print("Wrote %d sequences to %s" % (n, out_path))


if __name__ == "__main__":
    main()
