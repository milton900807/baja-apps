"""The loss matrix of one sample: which genes carry a loss-of-function variant.

A synthetic-lethal target is only a target in a tumor that has ALREADY lost something, so
the first question about any tumor genome is "which genes are out of action here". This
answers it for the variants a karyotype holds -- the small variants of one sample of a VCF
-- by placing each one on the GENCODE annotation and reading its consequence off the
coding sequence:

    frameshift      an indel in coding sequence whose length is not a multiple of three
    stop_gained     a substitution that turns a codon into a stop
    start_lost      a substitution in the ATG
    splice_donor / splice_acceptor
                    an intronic change within two bases of a coding exon's edge
    hotspot_missense
                    a missense at a recurrent inactivating codon of a TUMOUR SUPPRESSOR
                    (TP53 R175/R248/R273, PTEN R130, SMAD4 R361 ...)
    pathogenic_missense
                    a missense that ClinVar classifies Pathogenic / Likely pathogenic,
                    again only in a tumour suppressor

Those are LOSS OF FUNCTION. The two missense classes are restricted to tumour suppressors
because in an oncogene a hotspot is a GAIN -- KRAS G12D activates -- and calling it a loss
would put the wrong genes in the background. Other missense, in-frame indels, synonymous,
UTR and intronic changes are counted but not called lost: a matrix that called every
missense a loss would be a list of every gene in the genome. Deletion and silencing are
NOT visible in a VCF and are not called here; a gene lost that way needs copy number or
expression, which the caller is told.

One transcript speaks for each gene: MANE Select, else Ensembl canonical, else basic,
else the longest -- the same order every other script on this server trusts them in. A
change that is a frameshift on a minor isoform and intronic on the MANE transcript is
reported as the MANE transcript sees it, which is how a clinical report would read it.

Params (after the EngineMonitor):
    param(1) : JSON  { species, variants: { "chr17": [[pos, ref, alt], ...], ... } }
               positions 1-based, alleles as the VCF wrote them (shared first base on
               indels). The caller has usually pre-filtered to exons +/- a few bases;
               anything else is simply classified as intronic or intergenic.

Resolves:
    { ok, species, scanned, genes, counts, notes, error }
  genes : JSON array, one per gene with at least one LoF variant, worst first:
    { gene, gene_id, chr, start, end, strand, transcript, biotype, lof: 1,
      variants: [{ pos, ref, alt, effect, hgvs_c, hgvs_p }], n_lof, n_other }
  counts: JSON { effect -> n } over every variant scanned, LoF or not.
"""
import json
import os
import re
import shutil
import subprocess

from ion import works

try:
    import pysam
except Exception:
    pysam = None

_TABIX = shutil.which("tabix") or ("/usr/bin/tabix" if os.path.exists("/usr/bin/tabix") else None)

GFF = {
    "human": "reference_data/human.gencode.annotation.gff3.bgz",
    "mouse": "reference_data/mouse.annotation.gff3.bgz",
    "rat": "reference_data/rat.annotation.gff3.bgz",
    "dog": "reference_data/dog.annotation.gff3.bgz",
    "yeast": "reference_data/yeast.annotation.gff3.bgz",
}
GENOME = {
    "human": "data/genome/GRCh38.primary_assembly.genome.fa",
    "mouse": "data/genome/Mus_musculus.GRCm39.dna.primary_assembly.fa",
    "yeast": "data/genome/Saccharomyces_cerevisiae.R64-1-1.dna.toplevel.fa",
}

CLINVAR = "reference_data/variants/clinvar.vcf.gz"

MAX_VARIANTS = 250_000
SPLICE_BP = 2
LOF = ("frameshift", "stop_gained", "start_lost", "splice_donor", "splice_acceptor",
       "hotspot_missense", "pathogenic_missense")
# Worst first, for choosing which consequence names a variant when several transcripts
# disagree and for ordering the genes in the answer.
SEVERITY = {"frameshift": 0, "stop_gained": 1, "start_lost": 2, "splice_donor": 3,
            "splice_acceptor": 4, "hotspot_missense": 5, "pathogenic_missense": 6,
            "stop_lost": 7, "inframe_indel": 8, "missense": 9,
            "synonymous": 10, "coding_unresolved": 11, "utr": 12, "non_coding_exon": 13,
            "intronic": 14, "intergenic": 15}

# Genes in which a recurrent or ClinVar-pathogenic MISSENSE is a loss: tumour suppressors
# whose hotspots are dominant-negative or inactivating. The same list build-depmap-sl.py
# uses for the DepMap hotspot matrix, so the karyotype's loss set and the model's loss
# calls agree about what a hotspot means.
HOTSPOT_AS_LOSS = {
    "TP53", "RB1", "PTEN", "CDKN2A", "MTAP", "ARID1A", "BAP1", "KEAP1", "NF1", "PBRM1", "SMAD4",
    "SMARCA4", "STK11", "VHL", "BRCA1", "BRCA2", "APC", "ATM", "NF2", "CDH1", "PALB2", "CHEK2",
    "MLH1", "MSH2", "MSH6", "PMS2", "KMT2D", "CREBBP", "EP300", "FBXW7", "ARID2", "ATRX",
    "CDKN1B", "CIC", "DAXX", "KDM6A", "MEN1", "NOTCH1", "PTCH1", "RNF43", "SETD2", "TSC1",
    "TSC2", "WT1", "AXIN1", "CASP8", "ZFHX3", "SMARCB1", "SPOP", "FUBP1",
}
# Recurrent inactivating codons (protein position on the MANE transcript), the ones that
# recur across tumours often enough to be hotspots in their own right. ClinVar covers the
# long tail; this list catches a hotspot even where ClinVar has no exact record.
HOTSPOT_CODONS = {
    "TP53": {175, 245, 248, 249, 273, 282, 220, 213, 196, 306, 337, 158, 163, 176, 179, 205, 234,
             237, 238, 241, 242, 244, 266, 272, 275, 278, 280, 281, 283, 286, 132, 135, 141, 151,
             152, 157, 193, 194, 195, 215, 216, 236, 239, 246, 250, 255, 270, 285},
    "PTEN": {130, 173, 233, 129, 165, 34, 92, 124, 136},
    "CDKN2A": {80, 83, 84, 74, 114, 58, 69, 72, 88, 100},
    "SMAD4": {361, 351, 355, 386, 493, 515, 500, 445, 330},
    "VHL": {98, 117, 161, 167, 65, 76, 78, 86, 88},
    "FBXW7": {465, 479, 505, 278, 400, 441},
    "SPOP": {133, 131, 125, 102, 50, 55, 87},
    "BRCA1": {61, 1699, 1775, 1749, 1706, 1708, 1812},
    "KEAP1": {334, 320, 483, 254, 413, 470},
    "CDH1": {},
    "STK11": {194, 232, 87, 297, 354},
    "NF2": {},
    "PTCH1": {},
    "ATM": {2891, 3008, 2694},
    "ARID1A": {},
    "SMARCA4": {1162, 1196, 1232, 1243, 1250, 1256, 1272, 973, 1135, 1142, 1189},
    "MEN1": {},
    "CIC": {1512, 1515, 215, 1516},
    "FUBP1": {},
    "SETD2": {},
    "RNF43": {},
}

CODON = {}
_B = "TCAG"
_AA = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG"
for _i, _a in enumerate(_AA):
    CODON[_B[_i // 16] + _B[(_i // 4) % 4] + _B[_i % 4]] = _a
AA3 = {"A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys", "Q": "Gln", "E": "Glu",
       "G": "Gly", "H": "His", "I": "Ile", "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe",
       "P": "Pro", "S": "Ser", "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val", "*": "Ter"}
COMP = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}

out = {"ok": False, "species": "", "scanned": 0, "genes": "[]", "counts": "{}",
       "notes": "[]", "error": None}


def first_existing(rel):
    for base in [os.getcwd(),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps"),
                 "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def revcomp(s):
    return "".join(COMP.get(b, "N") for b in reversed(s))


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


class Tabix:
    """One open handle per file, pysam when it is there and the binary otherwise."""
    def __init__(self, path):
        self.path = path
        self.tb = None
        if pysam is not None:
            try:
                self.tb = pysam.TabixFile(path)
            except Exception:
                self.tb = None

    def contigs(self):
        if self.tb is not None:
            try:
                return set(self.tb.contigs)
            except Exception:
                pass
        if not _TABIX:
            return set()
        try:
            p = subprocess.run([_TABIX, "-l", self.path], capture_output=True, text=True, timeout=60)
            return set(x.strip() for x in p.stdout.splitlines() if x.strip())
        except Exception:
            return set()

    def rows(self, contig, s1, e1):
        if self.tb is not None:
            try:
                for row in self.tb.fetch(contig, max(0, s1 - 1), e1):
                    yield row.split("\t")
                return
            except Exception:
                return
        if not _TABIX:
            return
        try:
            proc = subprocess.run([_TABIX, self.path, "%s:%d-%d" % (contig, max(1, s1), e1)],
                                  capture_output=True, text=True, timeout=300)
            for line in proc.stdout.splitlines():
                if line and line[0] != "#":
                    yield line.split("\t")
        except Exception:
            return


def resolve_contig(names, want):
    want = str(want or "").strip()
    if not want:
        return ""
    bare = want[3:] if want.lower().startswith("chr") else want
    mito = bare.upper() in ("MT", "M", "MITO")
    for c in (want, "chr" + bare, bare,
              "chrM" if mito else "", "MT" if mito else "", "Mito" if mito else ""):
        if c and c in names:
            return c
    return ""


class Genome:
    def __init__(self, species):
        self.path = first_existing(GENOME.get(species, "")) if species in GENOME else ""
        self.fa = None
        self.fai = {}
        self.names = []
        if self.path and os.path.exists(self.path + ".fai"):
            if pysam is not None:
                try:
                    self.fa = pysam.FastaFile(self.path)
                    self.names = list(self.fa.references)
                except Exception:
                    self.fa = None
            if not self.fa:
                with open(self.path + ".fai") as fh:
                    for line in fh:
                        f = line.split("\t")
                        if len(f) >= 5:
                            self.fai[f[0]] = (int(f[1]), int(f[2]), int(f[3]), int(f[4]))
                self.names = list(self.fai)
        self._contig = {}

    def ok(self):
        return bool(self.fa or self.fai)

    def contig(self, chrom):
        if chrom not in self._contig:
            self._contig[chrom] = resolve_contig(set(self.names), chrom)
        return self._contig[chrom]

    def seq(self, chrom, start, end):
        c = self.contig(chrom)
        if not c or end < start or start < 1:
            return ""
        try:
            if self.fa:
                return self.fa.fetch(c, start - 1, end).upper()
            length, offset, linebases, linewidth = self.fai[c]
            end = min(end, length)
            bs = offset + (start - 1) // linebases * linewidth + (start - 1) % linebases
            be = offset + (end - 1) // linebases * linewidth + (end - 1) % linebases + 1
            with open(self.path, "rb") as fh:
                fh.seek(bs)
                raw = fh.read(be - bs)
            return raw.replace(b"\n", b"").replace(b"\r", b"").decode("ascii", "replace").upper()
        except Exception:
            return ""


class Transcript:
    __slots__ = ("id", "gene", "gene_id", "biotype", "strand", "contig", "rank", "exons", "cds",
                 "coding", "_sorted")

    def __init__(self, tid, contig, strand):
        self.id = tid
        self.gene = ""
        self.gene_id = ""
        self.biotype = ""
        self.strand = strand
        self.contig = contig
        self.rank = 3
        self.exons = []      # (start, end)
        self.cds = []        # (start, end, phase)
        self.coding = False
        self._sorted = False

    def prepare(self):
        if self._sorted:
            return
        self.exons = sorted(set(self.exons))
        self.cds = sorted(set(self.cds))
        self._sorted = True

    def cds_span(self):
        if not self.cds:
            return None
        return (self.cds[0][0], self.cds[-1][1])

    def start_codon(self):
        """Genomic positions of the ATG, or ()."""
        if not self.cds:
            return ()
        if self.strand == "+":
            s = self.cds[0][0]
            return (s, s + 1, s + 2)
        e = self.cds[-1][1]
        return (e - 2, e - 1, e)

    def cds_index(self, pos):
        for i, (s, e, _ph) in enumerate(self.cds):
            if s <= pos <= e:
                return i
        return -1

    def in_exon(self, pos):
        for s, e in self.exons:
            if s <= pos <= e:
                return True
        return False

    def cds_offset(self, pos):
        """0-based offset of a genomic position within the coding sequence, in transcript
        orientation, or None. Walks the CDS segments, so a codon that spans a junction is
        read across it."""
        acc = 0
        segs = self.cds if self.strand == "+" else list(reversed(self.cds))
        for s, e, _ph in segs:
            if s <= pos <= e:
                return acc + ((pos - s) if self.strand == "+" else (e - pos))
            acc += (e - s + 1)
        return None

    def cds_base_at(self, genome, off):
        """The coding base at transcript offset `off` (0-based), read from the genome."""
        acc = 0
        segs = self.cds if self.strand == "+" else list(reversed(self.cds))
        for s, e, _ph in segs:
            n = e - s + 1
            if acc <= off < acc + n:
                k = off - acc
                g = (s + k) if self.strand == "+" else (e - k)
                b = genome.seq(self.contig, g, g)
                if not b:
                    return ""
                return b if self.strand == "+" else COMP.get(b, "N")
            acc += n
        return ""


def load_transcripts(gff, contig, lo, hi):
    """Every transcript overlapping [lo, hi], with ALL its exons and CDS, best-ranked first per gene.

    Two passes on purpose. A variant's coding offset -- the c. number, the codon, whether an
    indel is in frame -- is counted from the transcript's FIRST coding base, so a transcript
    read only within the variant's window is a transcript with its beginning missing, and
    every offset comes out wrong by however much was cut off: a nonsense read as missense,
    R248 read as codon 216. So the window is first widened to the full span of every gene
    and transcript it touches, and the exons and CDS are read from that."""
    span_lo, span_hi = lo, hi
    for f in gff.rows(contig, lo, hi):
        if len(f) < 9:
            continue
        if f[2] == "gene" or f[2] in ("transcript", "mRNA") or "transcript_id" in f[8]:
            try:
                span_lo = min(span_lo, int(f[3]))
                span_hi = max(span_hi, int(f[4]))
            except ValueError:
                pass
    by_id = {}
    for f in gff.rows(contig, max(1, span_lo), span_hi):
        if len(f) < 9:
            continue
        kind = f[2]
        if kind == "gene":
            continue
        a = attrs(f[8])
        if kind in ("exon", "CDS"):
            tid = (a.get("transcript_id") or (a.get("Parent") or "").replace("transcript:", ""))
            if not tid:
                continue
            tb = tid.split(".")[0]
            t = by_id.get(tb)
            if t is None:
                t = by_id[tb] = Transcript(tid, f[0], f[6])
            if not t.gene:
                t.gene = a.get("gene_name") or ""
                t.gene_id = (a.get("gene_id") or "").split(".")[0]
                t.biotype = a.get("gene_type") or a.get("biotype") or ""
            try:
                s, e = int(f[3]), int(f[4])
            except ValueError:
                continue
            if kind == "exon":
                t.exons.append((s, e))
            else:
                try:
                    ph = int(f[7]) if f[7] in ("0", "1", "2") else 0
                except ValueError:
                    ph = 0
                t.cds.append((s, e, ph))
                t.coding = True
        elif "transcript_id" in f[8] or kind in ("transcript", "mRNA"):
            tid = a.get("transcript_id") or (a.get("ID") or "").replace("transcript:", "")
            if not tid:
                continue
            tb = tid.split(".")[0]
            t = by_id.get(tb)
            if t is None:
                t = by_id[tb] = Transcript(tid, f[0], f[6])
            t.gene = a.get("gene_name") or t.gene
            t.gene_id = (a.get("gene_id") or t.gene_id).split(".")[0]
            t.biotype = a.get("gene_type") or a.get("biotype") or t.biotype
            tag = a.get("tag") or ""
            rank = 3
            if "MANE_Select" in tag:
                rank = 0
            elif "Ensembl_canonical" in tag:
                rank = 1
            elif "basic" in tag:
                rank = 2
            t.rank = min(t.rank, rank)
    ts = [t for t in by_id.values() if t.exons and t.gene]
    for t in ts:
        t.prepare()
    return ts


def classify(t, genome, pos, ref, alt):
    """(effect, hgvs_c, hgvs_p) of one variant on one transcript."""
    ref = (ref or "").upper()
    alt = (alt or "").upper()
    ex_lo, ex_hi = t.exons[0][0], t.exons[-1][1]
    is_indel = len(ref) != len(alt)
    # The genomic bases a variant touches. An indel shares its first base with the
    # reference, so the change proper starts one base in; an insertion sits between
    # pos and pos+1.
    if is_indel:
        if len(ref) > len(alt):
            span = (pos + 1, pos + len(ref) - 1)
        else:
            span = (pos, pos + 1)
    else:
        span = (pos, pos + len(ref) - 1)
    if span[1] < ex_lo - SPLICE_BP or span[0] > ex_hi + SPLICE_BP:
        return ("intergenic", "", "")

    # Splice sites: the two intronic bases either side of every internal exon edge of a
    # coding transcript. Which is donor and which acceptor depends on the strand.
    if t.coding and len(t.exons) > 1:
        for i, (s, e) in enumerate(t.exons):
            first = (i == 0)
            last = (i == len(t.exons) - 1)
            # Left edge of the exon (genomic): intronic bases s-2, s-1. Not for the first exon.
            if not first and span[1] >= s - SPLICE_BP and span[0] <= s - 1:
                return (("splice_acceptor" if t.strand == "+" else "splice_donor"), "", "")
            if not last and span[0] <= e + SPLICE_BP and span[1] >= e + 1:
                return (("splice_donor" if t.strand == "+" else "splice_acceptor"), "", "")

    in_ex = any(s <= p <= e for p in range(span[0], span[1] + 1) for s, e in t.exons)
    if not in_ex:
        return ("intronic", "", "")
    if not t.coding:
        return ("non_coding_exon", "", "")
    cs, ce = t.cds_span()
    in_cds = any(cs <= p <= ce and t.cds_index(p) >= 0 for p in range(span[0], span[1] + 1))
    if not in_cds:
        return ("utr", "", "")

    if is_indel:
        d = abs(len(alt) - len(ref))
        # An insertion: both flanking bases must be coding for it to sit in the CDS.
        if len(alt) > len(ref) and not (t.cds_index(pos) >= 0 and t.cds_index(pos + 1) >= 0):
            return ("utr", "", "")
        off = t.cds_offset(pos + 1 if len(ref) > len(alt) else pos)
        cnum = "" if off is None else ("c.%d" % (off + 1))
        if d % 3:
            return ("frameshift", cnum + ("del" if len(ref) > len(alt) else "ins") if cnum else "", "")
        return ("inframe_indel", cnum + ("del" if len(ref) > len(alt) else "ins") if cnum else "", "")

    if len(ref) != 1:
        return ("coding_unresolved", "", "")
    off = t.cds_offset(pos)
    if off is None:
        return ("utr", "", "")
    tref = ref if t.strand == "+" else COMP.get(ref, "N")
    talt = alt if t.strand == "+" else COMP.get(alt, "N")
    hgvs_c = "c.%d%s>%s" % (off + 1, tref, talt)
    if not genome.ok():
        return ("coding_unresolved", hgvs_c, "")
    ci = off // 3
    k = off % 3
    codon = "".join(t.cds_base_at(genome, ci * 3 + j) for j in range(3))
    if len(codon) != 3 or "N" in codon or not all(b in "ACGT" for b in codon):
        return ("coding_unresolved", hgvs_c, "")
    if codon[k] != tref:
        # The VCF and the genome disagree about the reference base: wrong assembly, or a
        # multi-allelic row the caller split oddly. Say so rather than translate a fiction.
        return ("coding_unresolved", hgvs_c, "")
    alt_codon = codon[:k] + talt + codon[k + 1:]
    a_ref = CODON.get(codon, "X")
    a_alt = CODON.get(alt_codon, "X")
    hgvs_p = "p.%s%d%s" % (AA3.get(a_ref, a_ref), ci + 1, AA3.get(a_alt, a_alt) if a_alt != a_ref else "=")
    if ci == 0 and a_ref == "M" and a_alt != "M":
        return ("start_lost", hgvs_c, hgvs_p)
    if a_alt == "*" and a_ref != "*":
        return ("stop_gained", hgvs_c, hgvs_p)
    if a_ref == "*" and a_alt != "*":
        return ("stop_lost", hgvs_c, hgvs_p)
    if a_alt == a_ref:
        return ("synonymous", hgvs_c, hgvs_p)
    return ("missense", hgvs_c, hgvs_p)


# ---------------------------------------------------------------- main

raw = works.param(1)
if isinstance(raw, (list, dict)):
    req = raw if isinstance(raw, dict) else {}
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}
species = (str(req.get("species") or "human").strip().lower() or "human")
variants = req.get("variants") or {}
out["species"] = species

total = 0
if isinstance(variants, dict):
    for v in variants.values():
        if isinstance(v, list):
            total += len(v)

if not isinstance(variants, dict) or not total:
    out["error"] = "no variants were given"
elif total > MAX_VARIANTS:
    out["error"] = "too many variants (%d); narrow them to exons first" % total
elif species not in GFF:
    out["error"] = 'no annotation on this server for "%s"' % species
else:
    gpath = first_existing(GFF[species])
    if not gpath:
        out["error"] = "the %s annotation is not on this server" % species
    elif pysam is None and not _TABIX:
        out["error"] = "neither pysam nor the tabix CLI is available on this server"
    else:
        gff = Tabix(gpath)
        contigs = gff.contigs()
        genome = Genome(species)
        notes = []
        cvpath = first_existing(CLINVAR) if species == "human" else ""
        clinvar = Tabix(cvpath) if cvpath else None
        cv_contigs = clinvar.contigs() if clinvar else set()
        if species == "human" and not clinvar:
            notes.append("ClinVar is not on this server, so pathogenic missense changes could not be called; "
                         "hotspot codons still are.")
        HGVS_P_CODON = re.compile(r"p\.[A-Za-z]{3}(\d+)")
        hotspot_n = 0

        def clinvar_index(contig_name, lo, hi):
            """(pos, ref, alt) -> CLNSIG for ClinVar rows in a window, pathogenic or not."""
            idx = {}
            if not clinvar:
                return idx
            cc = resolve_contig(cv_contigs, contig_name)
            if not cc:
                return idx
            for f in clinvar.rows(cc, lo, hi):
                if len(f) < 8:
                    continue
                info = f[7]
                i = info.find("CLNSIG=")
                if i < 0:
                    continue
                sig = info[i + 7:].split(";")[0]
                try:
                    pos = int(f[1])
                except ValueError:
                    continue
                for alt in f[4].split(","):
                    idx[(pos, f[3].upper(), alt.upper())] = sig
            return idx

        def is_pathogenic(sig):
            t = (sig or "").lower()
            return ("pathogenic" in t) and ("conflict" not in t) and ("non_pathogenic" not in t) \
                and not t.startswith("benign") and "benign/likely_benign" not in t
        if not genome.ok():
            notes.append("The %s genome FASTA is not on this server, so substitutions could not be "
                         "translated: only frameshifts and splice-site changes are called." % species)
        genes = {}          # gene -> record
        counts = {}
        scanned = 0
        chrom_names = list(variants.keys())
        for ci_n, chrom in enumerate(chrom_names):
            rows = variants.get(chrom) or []
            if not rows:
                continue
            contig = resolve_contig(contigs, chrom)
            if not contig:
                counts["intergenic"] = counts.get("intergenic", 0) + len(rows)
                scanned += len(rows)
                continue
            works.msg("Placing %d variant(s) on %s (%d of %d)…" % (len(rows), contig, ci_n + 1, len(chrom_names)))
            # Group the variants into windows so the annotation is read in a few tabix
            # calls per chromosome rather than one per variant. A window closes when the
            # next variant is more than a gene's width away from the last.
            prep = []
            for r in rows:
                try:
                    p = int(r[0])
                    prep.append((p, str(r[1] or "N"), str(r[2] or "N")))
                except Exception:
                    continue
            prep.sort()
            i = 0
            WIN_GAP = 250_000
            while i < len(prep):
                j = i
                while j + 1 < len(prep) and prep[j + 1][0] - prep[j][0] <= WIN_GAP:
                    j += 1
                lo = prep[i][0] - 1000
                hi = prep[j][0] + max(1000, len(prep[j][1]))
                ts = load_transcripts(gff, contig, max(1, lo), hi)
                cv = clinvar_index(contig, max(1, lo), hi)
                # Best transcript per gene among those overlapping this window.
                best = {}
                for t in ts:
                    cur = best.get(t.gene)
                    key = (t.rank, 0 if t.coding else 1, -(t.exons[-1][1] - t.exons[0][0]))
                    if cur is None or key < cur[0]:
                        best[t.gene] = (key, t)
                # Gene rows for the coordinates the karyotype will band.
                for q in range(i, j + 1):
                    pos, ref, alt = prep[q]
                    scanned += 1
                    worst = None
                    for gname, (_k, t) in best.items():
                        if pos + max(len(ref), 1) < t.exons[0][0] - SPLICE_BP or pos > t.exons[-1][1] + SPLICE_BP:
                            continue
                        eff, hc, hp = classify(t, genome, pos, ref, alt)
                        if eff == "intergenic":
                            continue
                        cand = (SEVERITY.get(eff, 99), eff, hc, hp, t)
                        if worst is None or cand[0] < worst[0]:
                            worst = cand
                    if worst is None:
                        counts["intergenic"] = counts.get("intergenic", 0) + 1
                        continue
                    _sv, eff, hc, hp, t = worst
                    # A MISSENSE IN A TUMOUR SUPPRESSOR may be a loss: at a known hotspot
                    # codon, or where ClinVar has the exact change as pathogenic. Only in
                    # those genes -- the same missense in an oncogene is a gain.
                    if eff == "missense" and t.gene in HOTSPOT_AS_LOSS:
                        sig = cv.get((pos, ref.upper(), alt.upper()))
                        codon = None
                        m = HGVS_P_CODON.match(hp or "")
                        if m:
                            codon = int(m.group(1))
                        if codon is not None and codon in HOTSPOT_CODONS.get(t.gene, set()):
                            eff = "hotspot_missense"
                            hotspot_n += 1
                        elif sig and is_pathogenic(sig):
                            eff = "pathogenic_missense"
                            hotspot_n += 1
                            hp = (hp + " (ClinVar " + sig.replace("_", " ") + ")") if hp else ("ClinVar " + sig.replace("_", " "))
                    counts[eff] = counts.get(eff, 0) + 1
                    g = genes.get(t.gene)
                    if g is None:
                        g = genes[t.gene] = {
                            "gene": t.gene, "gene_id": t.gene_id, "chr": contig,
                            "start": t.exons[0][0], "end": t.exons[-1][1], "strand": t.strand,
                            "transcript": t.id, "biotype": t.biotype, "lof": 0,
                            "variants": [], "n_lof": 0, "n_other": 0,
                        }
                    if eff in LOF:
                        g["lof"] = 1
                        g["n_lof"] += 1
                        g["variants"].append({"pos": pos, "ref": ref, "alt": alt, "effect": eff,
                                              "hgvs_c": hc, "hgvs_p": hp})
                    else:
                        g["n_other"] += 1
                i = j + 1
        lost = [g for g in genes.values() if g["lof"]]
        for g in lost:
            g["variants"].sort(key=lambda v: (SEVERITY.get(v["effect"], 99), v["pos"]))
        lost.sort(key=lambda g: (SEVERITY.get(g["variants"][0]["effect"], 99), -g["n_lof"], g["gene"]))
        if not genome.ok():
            pass
        notes.append("Hotspot and ClinVar-pathogenic missense changes count as loss in tumour suppressors only; "
                     "a hotspot in an oncogene is a gain and is not called."
                     + ((" %d such missense change(s) were counted." % hotspot_n) if hotspot_n else ""))
        notes.append("Deletions and silencing are not visible in a VCF: a gene lost by copy number "
                     "or expression is not in this matrix.")
        out["ok"] = True
        out["scanned"] = scanned
        out["genes"] = json.dumps(lost)
        out["counts"] = json.dumps(counts)
        out["notes"] = json.dumps(notes)
        works.msg("%d gene(s) with a loss-of-function variant among %d variant(s)" % (len(lost), scanned))

works.resolve(out)
