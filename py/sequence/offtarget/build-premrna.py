#!/usr/bin/env python3
"""
Build a PRIMARY-TRANSCRIPT (unspliced) FASTA from a genome + GFF3.

Each record is a gene's full genomic locus (exons + INTRONS), i.e. the primary
transcript / pre-mRNA region, so an off-target search over it catches intronic
hits (relevant for gapmers acting on nuclear pre-mRNA) that the spliced cDNA
indexes miss. One record per gene (introns are shared across a gene's isoforms,
so gene-level avoids the ~5x redundancy of per-transcript spans).

Header format `>GENE_ID gene_symbol:NAME` so build-index.py extracts the symbol.

CLI: python3 build-premrna.py <genome.fa (indexed)> <annotation.gff3[.gz]> <out.fa> [--feature gene]
"""

import sys
import gzip
import argparse

import pysam

_RC = str.maketrans("ACGTNacgtn", "TGCANtgcan")


def _open(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("genome_fa", help="genome FASTA with a .fai index")
    ap.add_argument("gff3")
    ap.add_argument("out_fa")
    ap.add_argument("--feature", default="gene", choices=["gene", "transcript"])
    args = ap.parse_args(argv)

    fa = pysam.FastaFile(args.genome_fa)
    refs = set(fa.references)
    n = 0
    skipped = 0
    with _open(args.gff3) as gh, open(args.out_fa, "w") as out:
        for line in gh:
            if not line or line[0] == "#":
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 9 or f[2] != args.feature:
                continue
            chrom, start, end, strand, attr = f[0], int(f[3]), int(f[4]), f[6], f[8]
            if chrom not in refs:
                skipped += 1
                continue
            kv = {}
            for field in attr.split(";"):
                if "=" in field:
                    k, v = field.split("=", 1)
                    kv[k] = v
            # GENCODE uses gene_id/gene_name; Ensembl uses gene_id + Name (ID=gene:...).
            gid = kv.get("gene_id") or kv.get("transcript_id") or ""
            if not gid and kv.get("ID"):
                gid = kv["ID"].split(":", 1)[-1]   # strip 'gene:'/'transcript:'
            if not gid:
                gid = "feat_%d" % n
            sym = kv.get("gene_name") or kv.get("Name") or ""
            seq = fa.fetch(chrom, start - 1, end)   # GFF3 is 1-based inclusive
            if not seq:
                skipped += 1
                continue
            if strand == "-":
                seq = seq.translate(_RC)[::-1]
            out.write(">%s gene_symbol:%s\n" % (gid, sym))
            for i in range(0, len(seq), 80):
                out.write(seq[i:i + 80] + "\n")
            n += 1
            if n % 10000 == 0:
                sys.stderr.write("  ... %d records\n" % n)
    sys.stderr.write("wrote %d %s records (%d skipped: contig not in genome)\n"
                     % (n, args.feature, skipped))


if __name__ == "__main__":
    main(sys.argv[1:])
