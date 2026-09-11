"""The reference bases in a genomic window.

The karyotype draws every chromosome at one true scale, so zooming far enough in makes a
single base tall enough to letter. At that point the honest thing to draw is the sequence
itself rather than a colored bar standing in for it. This is the lookup behind that: a
window of the reference, straight off the indexed genome FASTA the rest of the server uses.

Only ever called once a base is several pixels tall, so the windows are small (a screen
holds a few thousand bases at that zoom) and the read is a seek, not a scan.

Params (after the EngineMonitor):
    param(1) : chromosome, with or without the chr prefix
    param(2) : start (1-based, inclusive)
    param(3) : end   (1-based, inclusive)
    param(4) : optional species (default human)

Resolves:
    { ok, chr, start, end, length, sequence, error }
  sequence is uppercase A/C/G/T/N, 5'->3' on the FORWARD strand, which is the strand the
  karyotype's coordinates are in.
"""
import os

from ion import works

try:
    import pysam
except Exception:
    pysam = None

# The genomes this box holds. Human and mouse are the files the off-target indexes were
# built from; yeast is Ensembl's R64-1-1 (== SGD R64 == UCSC sacCer3), 12 MB, the file the
# server's own transcript loader reads for pre-mRNA, fetched by py/bio/build-yeast-reference.py.
# Its contigs are I..XVI and Mito; the karyotype asks for chrI..chrXVI and chrM, and
# resolve_contig translates.
GENOME = {
    "human": "data/genome/GRCh38.primary_assembly.genome.fa",
    "mouse": "data/genome/Mus_musculus.GRCm39.dna.primary_assembly.fa",
    "yeast": "data/genome/Saccharomyces_cerevisiae.R64-1-1.dna.toplevel.fa",
}

# A window wider than this is not legible anyway -- the caller only asks when a base is
# several pixels tall -- so a large request is a bug, not a use case.
MAX_SPAN = 200000

out = {"ok": False, "chr": "", "start": 0, "end": 0, "length": 0,
       "sequence": "", "error": None}


def first_existing(rel):
    for base in [os.getcwd(),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps"),
                 "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def read_fai(path):
    """name -> (length, offset, linebases, linewidth) from the .fai sidecar."""
    fai = {}
    with open(path + ".fai") as fh:
        for line in fh:
            f = line.split("\t")
            if len(f) >= 5:
                fai[f[0]] = (int(f[1]), int(f[2]), int(f[3]), int(f[4]))
    return fai


def fetch_plain(path, fai, contig, start, end):
    """1-based inclusive slice without pysam, via the .fai offsets."""
    length, offset, linebases, linewidth = fai[contig]
    start = max(1, start)
    end = min(end, length)
    if end < start:
        return ""
    bs = offset + (start - 1) // linebases * linewidth + (start - 1) % linebases
    be = offset + (end - 1) // linebases * linewidth + (end - 1) % linebases + 1
    with open(path, "rb") as fh:
        fh.seek(bs)
        raw = fh.read(be - bs)
    return raw.replace(b"\n", b"").replace(b"\r", b"").decode("ascii", "replace").upper()


def resolve_contig(names, want):
    """Match chr1 / 1 / CHR1 against whatever the FASTA actually calls it."""
    want = str(want or "").strip()
    if not want:
        return ""
    bare = want[3:] if want.lower().startswith("chr") else want
    mito = bare.upper() in ("MT", "M", "MITO")
    for cand in (want, "chr" + bare, bare, "CHR" + bare,
                 "chrM" if mito else "", "MT" if mito else "", "Mito" if mito else ""):
        if cand and cand in names:
            return cand
    low = {n.lower(): n for n in names}
    for cand in (want.lower(), ("chr" + bare).lower(), bare.lower()):
        if cand in low:
            return low[cand]
    return ""


chrom = str(works.param(1) or "").strip()
try:
    start = int(float(works.param(2) or 0))
    end = int(float(works.param(3) or 0))
except Exception:
    start = end = 0
species = (str(works.param(4) or "human").strip().lower() or "human")

if not chrom or end < start or start < 1:
    out["error"] = "a chromosome and a 1-based start<=end are required"
elif species not in GENOME:
    out["error"] = ('no genome on this server for "%s" -- human, mouse and yeast are held' % species)
else:
    path = first_existing(GENOME[species])
    if not path:
        out["error"] = "the %s genome FASTA is not on this server" % species
    elif not os.path.exists(path + ".fai"):
        out["error"] = "the %s genome has no .fai index beside it" % species
    else:
        if end - start + 1 > MAX_SPAN:
            end = start + MAX_SPAN - 1
        try:
            fai = read_fai(path)
            contig = resolve_contig(fai.keys(), chrom)
            if not contig:
                out["error"] = '"%s" is not a contig in the %s genome' % (chrom, species)
            else:
                clen = fai[contig][0]
                start = max(1, min(start, clen))
                end = max(start, min(end, clen))
                seq = ""
                if pysam is not None:
                    try:
                        fa = pysam.FastaFile(path)
                        seq = (fa.fetch(contig, start - 1, end) or "").upper()
                    except Exception:
                        seq = ""
                if not seq:
                    seq = fetch_plain(path, fai, contig, start, end)
                out["ok"] = True
                out["chr"] = contig
                out["start"] = start
                out["end"] = end
                out["length"] = len(seq)
                out["sequence"] = seq
                works.msg("%s:%d-%d (%d bases)" % (contig, start, end, len(seq)))
        except Exception as e:
            out["error"] = "could not read the genome: %s" % e

works.resolve(out)
