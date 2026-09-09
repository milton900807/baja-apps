"""Fetch the yeast reference the chromosome view draws from. OFFLINE BUILDER.

    python3 py/bio/build-yeast-reference.py [<download-dir>]

Three small files, none of which the server can make for itself:

    data/genome/Saccharomyces_cerevisiae.R64-1-1.dna.toplevel.fa (+ .fai)
                                                  Ensembl R64-1-1 == SGD R64 == UCSC sacCer3, 12 MB,
                                                  contigs I..XVI and Mito. The server's transcript
                                                  loader (GENOME_FA_BY_SPECIES in index.ts) and
                                                  py/bio/genome-sequence.py both read it.
    <download-dir>/chromInfo.sacCer3.txt.gz       UCSC chromosome lengths
    <download-dir>/saccharomyces_cerevisiae.gff.gz SGD chromosomal features, for the centromeres

then runs py/bio/build-karyotype.py on the download directory, which writes
reference_data/karyotype/yeast.json (and rebuilds any other species whose UCSC tables are in
the same directory). Run from the baja-server directory, the way the other builders are.

The .fai is written here rather than by samtools so the box needs nothing installed: the
FASTA is fixed-width, and an index of a fixed-width FASTA is five numbers per contig.

The yeast gene annotation (reference_data/yeast.annotation.gff3.bgz) is not fetched here:
the server installs it itself through /reference/install/yeast.
"""
import gzip
import os
import shutil
import subprocess
import sys
import urllib.request

DL = sys.argv[1] if len(sys.argv) > 1 else "reference_data/downloads"
FASTA_URL = ("https://ftp.ensembl.org/pub/release-110/fasta/saccharomyces_cerevisiae/dna/"
             "Saccharomyces_cerevisiae.R64-1-1.dna.toplevel.fa.gz")
FASTA_NAME = "Saccharomyces_cerevisiae.R64-1-1.dna.toplevel.fa"
CHROMINFO_URL = "https://hgdownload.soe.ucsc.edu/goldenPath/sacCer3/database/chromInfo.txt.gz"
SGD_URL = "https://downloads.yeastgenome.org/curation/chromosomal_feature/saccharomyces_cerevisiae.gff.gz"

# Beside the human and mouse genomes, which live under baja-apps, not baja-server.
GENOME_DIRS = ["data/genome", "/opt/baja-apps/data/genome",
               os.path.expanduser("~/baja-apps/data/genome")]


def fetch(url, path):
    if os.path.exists(path):
        print("  have   %s" % path)
        return
    print("  fetch  %s" % url)
    tmp = path + ".part"
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as out:
        shutil.copyfileobj(r, out)
    os.replace(tmp, path)


def write_fai(fa):
    """name, length, offset of first base, bases per line, bytes per line."""
    rows = []
    with open(fa, "rb") as fh:
        name, length, offset, lb, lw = None, 0, 0, 0, 0
        pos = 0
        for line in fh:
            if line.startswith(b">"):
                if name:
                    rows.append((name, length, offset, lb, lw))
                name = line[1:].split()[0].decode()
                length, lb, lw = 0, 0, 0
                offset = pos + len(line)
            else:
                bases = len(line.rstrip(b"\r\n"))
                if not lb and bases:
                    lb, lw = bases, len(line)
                length += bases
            pos += len(line)
        if name:
            rows.append((name, length, offset, lb, lw))
    with open(fa + ".fai", "w") as out:
        for r in rows:
            out.write("%s\t%d\t%d\t%d\t%d\n" % r)
    return rows


os.makedirs(DL, exist_ok=True)
genome_dir = next((d for d in GENOME_DIRS if os.path.isdir(d)), GENOME_DIRS[0])
os.makedirs(genome_dir, exist_ok=True)

print("genome -> %s" % genome_dir)
fa = os.path.join(genome_dir, FASTA_NAME)
if not os.path.exists(fa):
    gz = os.path.join(DL, FASTA_NAME + ".gz")
    fetch(FASTA_URL, gz)
    with gzip.open(gz, "rb") as src, open(fa + ".part", "wb") as out:
        shutil.copyfileobj(src, out)
    os.replace(fa + ".part", fa)
rows = write_fai(fa)
print("  %d contigs, %s bases, .fai written" % (len(rows), "{:,}".format(sum(r[1] for r in rows))))

print("karyotype tables")
fetch(CHROMINFO_URL, os.path.join(DL, "chromInfo.sacCer3.txt.gz"))
fetch(SGD_URL, os.path.join(DL, "saccharomyces_cerevisiae.gff.gz"))
builder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-karyotype.py")
subprocess.run([sys.executable, builder, DL, "reference_data/karyotype"], check=True)
