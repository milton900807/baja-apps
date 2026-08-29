#!/usr/bin/env python3
"""
Stage 3 — align patent sequences to an hg38 transcript FASTA and emit the transcript-keyed BED
the app reads.

Short oligos (<= --short-max, ASO/siRNA) are matched by a built-in pigeonhole seed-and-verify
(both strands, Hamming distance <= --max-mismatch) — no external tool needed, but for large runs
`bowtie -v <m> -a` is far faster (see README). Long sequences (gene-therapy constructs) go through
minimap2 when available.

Output: <work>/aso_sirna_gt_2020_2026_hg38_transcript_hits.bed   (unsorted; stage 5 sorts+bgzips)
Row: <transcript_id>\t<tx_start>\t<tx_end>\t<patent>|<seqid>|\t0\t<strand>
  strand '+' = query matches the transcript sense; '-' = its reverse-complement matches.
"""
import argparse
import gzip
import os
import shutil
import subprocess
import tempfile

COMP = str.maketrans("ACGTN", "TGCAN")


def rc(s):
    return s.translate(COMP)[::-1]


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


def tid_of(hdr):
    # Ensembl cDNA/ncRNA header: '>ENST00000254108.9 cdna chromosome:...'
    return hdr.split()[0]


def norm_seq(s):
    return s.upper().replace("U", "T")


def load_queries(fa, short_max):
    short, longq = [], []
    for hdr, seq in iter_fasta(fa):
        s = norm_seq(seq)
        if not s or set(s) - set("ACGTN"):
            continue
        (short if len(s) <= short_max else longq).append((hdr, s))
    return short, longq


def build_seed_index(short, m, min_seed):
    """Pigeonhole: split each query (both strands) into m+1 disjoint chunks; index each chunk
    seq -> list of (qi, strand, offset, L). At <= m mismatches at least one chunk is exact."""
    idx = {}
    metas = []
    for qi, (hdr, s) in enumerate(short):
        L = len(s)
        for strand, seq in (("+", s), ("-", rc(s))):
            k = max(min_seed, L // (m + 1))
            nchunks = m + 1
            for c in range(nchunks):
                off = c * k
                if off + k > L:
                    break
                idx.setdefault(seq[off:off + k], []).append((qi, strand, off, L))
        metas.append(hdr)
    return idx, metas


def hamming_ok(a, b, m):
    d = 0
    for i in range(len(a)):
        if a[i] != b[i]:
            d += 1
            if d > m:
                return False
    return True


def align_short_builtin(short, transcripts_fa, m, min_seed, out):
    if not short:
        return 0
    idx, _ = build_seed_index(short, m, min_seed)
    seed_lens = sorted({len(k) for k in idx.keys()})
    n = 0
    for hdr, tseq in iter_fasta(transcripts_fa):
        t = norm_seq(tseq)
        tid = tid_of(hdr)
        T = len(t)
        seen = set()
        for K in seed_lens:
            for p in range(0, T - K + 1):
                cands = idx.get(t[p:p + K])
                if not cands:
                    continue
                for (qi, strand, off, L) in cands:
                    start = p - off
                    if start < 0 or start + L > T:
                        continue
                    key = (qi, strand, start)
                    if key in seen:
                        continue
                    qseq = short[qi][1] if strand == "+" else rc(short[qi][1])
                    if hamming_ok(qseq, t[start:start + L], m):
                        seen.add(key)
                        pnum, seqid = _split_hdr(short[qi][0])
                        out.write("%s\t%d\t%d\t%s|%s|\t0\t%s\n" % (tid, start, start + L, pnum, seqid, strand))
                        n += 1
    return n


def _split_hdr(hdr):
    parts = hdr.split("|")
    pnum = parts[0].strip()
    seqid = parts[1].strip() if len(parts) > 1 else "S"
    return pnum, seqid


def align_long_minimap2(longq, transcripts_fa, out):
    if not longq:
        return 0
    if not shutil.which("minimap2"):
        print("  ! minimap2 not found — %d long sequences skipped (install minimap2 to include them)." % len(longq))
        return 0
    with tempfile.NamedTemporaryFile("w", suffix=".fa", delete=False) as qf:
        for hdr, s in longq:
            qf.write(">%s\n%s\n" % (hdr, s))
        qpath = qf.name
    n = 0
    try:
        # -c PAF with CIGAR; sr = short-read genomic; use map-ont-ish 'asm20' for divergent constructs.
        proc = subprocess.run(["minimap2", "-cx", "sr", "--secondary=yes", transcripts_fa, qpath],
                              capture_output=True, text=True)
        for line in proc.stdout.splitlines():
            f = line.split("\t")
            if len(f) < 9:
                continue
            qname, strand, tname, tstart, tend = f[0], f[4], f[5], f[7], f[8]
            pnum, seqid = _split_hdr(qname)
            tid = tname.split()[0]
            out.write("%s\t%s\t%s\t%s|%s|\t0\t%s\n" % (tid, tstart, tend, pnum, seqid, strand))
            n += 1
    finally:
        os.unlink(qpath)
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="./out")
    ap.add_argument("--transcripts", required=True, help="hg38 transcript FASTA (Ensembl cDNA+ncRNA), .fa[.gz]")
    ap.add_argument("--max-mismatch", type=int, default=2, help="Hamming mismatches for short oligos")
    ap.add_argument("--short-max", type=int, default=40, help="len <= this -> built-in matcher; else minimap2")
    ap.add_argument("--min-seed", type=int, default=8)
    args = ap.parse_args()

    qfa = os.path.join(args.work, "patent_sequences.fa")
    short, longq = load_queries(qfa, args.short_max)
    print("Queries: %d short (<=%dnt), %d long." % (len(short), args.short_max, len(longq)))

    out_path = os.path.join(args.work, "aso_sirna_gt_2020_2026_hg38_transcript_hits.bed")
    with open(out_path, "w", encoding="utf-8") as out:
        ns = align_short_builtin(short, args.transcripts, args.max_mismatch, args.min_seed, out)
        nl = align_long_minimap2(longq, args.transcripts, out)
    print("Wrote %d short + %d long hits to %s" % (ns, nl, out_path))


if __name__ == "__main__":
    main()
