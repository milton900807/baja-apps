"""Allele-selective targets: kill the one copy the tumour kept, spare the two the patient has.

THE PROBLEM THIS SOLVES. The best single-copy targets are the worst drug targets. A gene the
cell cannot do without is exactly what a hemizygous tumour has no headroom for, and exactly
what a normal cell also cannot do without -- which is why the pan-essential filter throws
most of them out. Dosage alone gives a narrow, quantitative margin: inhibit a bit, hope the
tumour dies first.

There is a second margin, and it is not quantitative. In a tract of loss of heterozygosity
the tumour has ONE parental allele; every normal cell in the patient still has both. Where
the germline was heterozygous inside such a gene, the two alleles differ in SEQUENCE, and
the tumour kept only one of them. An agent directed at the sequence of the RETAINED allele
-- an allele-selective ASO, an siRNA, a guide RNA -- destroys the tumour's only copy of an
essential gene. The normal cell loses one allele of two and carries on.

That inverts the usual logic. Here pan-essentiality is not the problem, it is the point: the
more the cell needs the gene, the more surely the tumour dies. The selectivity comes from
sequence, not from dose, and it is absolute rather than a ratio.

THREE THINGS CAN SAY WHICH ALLELE TO AIM AT, and this tool annotates a site the same way
whichever it was. `mode` only chooses the wording of the caveats returned in notes:

  somatic    the tumour kept one parental allele and every normal cell kept both (above).
  phased     the patient carries a disease allele on one copy and the file is phased, so
             every other heterozygous site on that copy is a discriminating base for the
             disease chromosome. This is how an allele-selective ASO against mutant
             huntingtin is built in practice: not against the CAG repeat, which both
             copies carry, but against a common SNP that happens to sit on the expanded
             chromosome in that patient. No tumour is involved.
  mutation   the disease change is itself the difference. Always available, needs neither
             phase nor a second sample, and is the narrowest margin of the three.

WHAT THIS TOOL DOES. It takes heterozygous sites the caller found inside genes, with which
allele is the one to hit, and says, for each one, whether it can actually be targeted: which transcript it sits in, whether it is in the mature message
(an siRNA or an exon-directed ASO needs that) or only in the pre-mRNA (a gapmer can still
use it), whether it is coding, and the reference sequence around it on both alleles, ready
to design against.

WHAT IT DOES NOT DO. It does not design the oligo, check its specificity against the rest of
the transcriptome, or score its discrimination -- one base of difference is a real but small
margin and an agent that does not discriminate will kill the patient's cells too. That is
the oligo designer's job, and this hands the site over to it.

Params (after the EngineMonitor):
    param(1) : JSON {
        sites: [{gene, chr, pos, ref, alt, retained, tumour_baf, germline_baf}, ...]
               retained is "ref" or "alt": the allele to AIM AT. For somatic that is the
               one the tumour still carries; for phased, the one on the disease copy; for
               mutation, the mutant allele.
        species: "human",
        flank: 30,           bases either side of the site in the returned context
        mode: "somatic" | "phased" | "mutation"    default somatic; wording of notes only
    }

Resolves:
    { ok, sites, n_genes, notes, mode, error }
  sites JSON array, best first:
    { gene, chr, pos, ref, alt, retained_allele, lost_allele, transcript, strand, region,
      in_mature_transcript, coding, tumour_baf, germline_baf,
      context_retained, context_lost, context_start, context_end }
"""
import json
import os
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
COMP = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}
MAX_SITES = 600
MAX_FLANK = 60

out = {"ok": False, "sites": "[]", "n_genes": 0, "notes": "[]", "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-apps", os.path.expanduser("~/baja-apps"),
                 "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def resolve_contig(names, want):
    want = str(want or "").strip()
    if not want:
        return ""
    bare = want[3:] if want.lower().startswith("chr") else want
    for c in (want, "chr" + bare, bare):
        if c and c in names:
            return c
    return ""


class Tabix:
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
            p = subprocess.run([_TABIX, self.path, "%s:%d-%d" % (contig, max(1, s1), e1)],
                               capture_output=True, text=True, timeout=300)
            for line in p.stdout.splitlines():
                if line and line[0] != "#":
                    yield line.split("\t")
        except Exception:
            return


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
            be = offset + (end - 1) // linebases * linewidth + (end - 1) % linebases
            with open(self.path, "rb") as fh:
                fh.seek(bs)
                raw = fh.read(be - bs + 1)
            return raw.decode("ascii", "replace").replace("\n", "").replace("\r", "").upper()
        except Exception:
            return ""


# RANK, the same order the rest of the server trusts a transcript in: MANE Select first,
# because the site has to be in the message a drug will actually meet.
def rank_of(a):
    tags = a.get("tag", "")
    if "MANE_Select" in tags:
        return 0
    if "Ensembl_canonical" in tags:
        return 1
    if "basic" in tags:
        return 2
    return 3


raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}
sites = req.get("sites") or []
species = (str(req.get("species") or "human") or "human").strip().lower()
try:
    flank = max(5, min(MAX_FLANK, int(req.get("flank") or 30)))
except Exception:
    flank = 30
# WHAT ESTABLISHED WHICH ALLELE TO AIM AT. The annotation is identical for all three --
# a position, the allele to hit, and what a transcript makes of it -- but the caveats
# are not interchangeable, and a phased germline result carrying a paragraph about what
# a tumour retained is worse than carrying none. Defaults to somatic so the two callers
# that predate this keep the wording they were written for.
mode = (str(req.get("mode") or "somatic") or "somatic").strip().lower()
if mode not in ("somatic", "phased", "mutation"):
    mode = "somatic"
out["mode"] = mode

gff_path = first_existing(GFF.get(species, "")) if species in GFF else ""
if not isinstance(sites, list) or not sites:
    out["error"] = "no heterozygous sites were given"
elif not gff_path:
    out["error"] = "no gene annotation for %s on this server" % species
else:
    gff = Tabix(gff_path)
    names = gff.contigs()
    genome = Genome(species)
    notes = []
    if not genome.ok():
        notes.append("The reference genome is not on this server, so no sequence context could be read; "
                     "the sites and their annotation are still correct.")

    # Grouped by chromosome and read in one pass per gene span: a tabix seek per site would
    # be hundreds of seeks for what is a handful of windows.
    byg = {}
    for s in sites[:MAX_SITES]:
        try:
            g = str(s.get("gene") or "").strip().upper()
            c = str(s.get("chr") or "").strip()
            p = int(s.get("pos"))
        except Exception:
            continue
        if not g or not c or p <= 0:
            continue
        byg.setdefault((g, c), []).append(s)

    result = []
    works.msg("Annotating %d heterozygous site(s) in %d gene(s)…" % (sum(len(v) for v in byg.values()), len(byg)))
    for (gene, chrom), group in byg.items():
        cn = resolve_contig(names, chrom)
        if not cn:
            continue
        lo = min(int(s["pos"]) for s in group)
        hi = max(int(s["pos"]) for s in group)
        # Transcripts are read over the whole gene, not the site window: a transcript cut to
        # a window has its other exons missing, and "is this in an exon" would be answered
        # from a fragment.
        span_lo, span_hi = lo, hi
        for f in gff.rows(cn, max(1, lo - 5000), hi + 5000):
            if len(f) < 9 or f[2] != "gene":
                continue
            a = attrs(f[8])
            if (a.get("gene_name") or "").upper() != gene:
                continue
            try:
                span_lo = min(span_lo, int(f[3]))
                span_hi = max(span_hi, int(f[4]))
            except ValueError:
                pass
        tx = {}
        for f in gff.rows(cn, max(1, span_lo), span_hi):
            if len(f) < 9:
                continue
            a = attrs(f[8])
            if (a.get("gene_name") or "").upper() != gene:
                continue
            tid = a.get("transcript_id") or ""
            if f[2] in ("transcript", "mRNA"):
                if tid:
                    t = tx.setdefault(tid, {"id": tid, "strand": f[6], "rank": 9, "exons": [], "cds": [],
                                            "type": a.get("transcript_type", "")})
                    t["rank"] = rank_of(a)
                    t["strand"] = f[6]
                    t["type"] = a.get("transcript_type", "")
            elif f[2] == "exon" and tid:
                tx.setdefault(tid, {"id": tid, "strand": f[6], "rank": 9, "exons": [], "cds": [], "type": ""})
                tx[tid]["exons"].append((int(f[3]), int(f[4])))
            elif f[2] == "CDS" and tid:
                tx.setdefault(tid, {"id": tid, "strand": f[6], "rank": 9, "exons": [], "cds": [], "type": ""})
                tx[tid]["cds"].append((int(f[3]), int(f[4])))
        best = sorted(tx.values(), key=lambda t: (t["rank"], -sum(e - s + 1 for s, e in t["exons"])))
        best = best[0] if best else None

        for s in group:
            pos = int(s["pos"])
            ref = str(s.get("ref") or "").upper()
            alt = str(s.get("alt") or "").upper()
            ret = "alt" if str(s.get("retained") or "").lower().startswith("a") else "ref"
            retained = alt if ret == "alt" else ref
            lost = ref if ret == "alt" else alt
            region, in_mrna, coding, tid, strand = "outside any transcript", False, False, "", ""
            if best:
                tid, strand = best["id"], best["strand"]
                in_exon = any(a <= pos <= b for a, b in best["exons"])
                in_cds = any(a <= pos <= b for a, b in best["cds"])
                in_mrna = in_exon
                coding = in_cds
                if in_cds:
                    region = "coding"
                elif in_exon and best["cds"]:
                    cds_lo = min(a for a, _ in best["cds"])
                    cds_hi = max(b for _, b in best["cds"])
                    if strand == "+":
                        region = "5' UTR" if pos < cds_lo else "3' UTR"
                    else:
                        region = "5' UTR" if pos > cds_hi else "3' UTR"
                elif in_exon:
                    region = "non-coding exon"
                else:
                    region = "intron"
            ctx_r = ctx_l = ""
            cs = ce = 0
            if genome.ok() and len(ref) == 1 and len(alt) == 1:
                cs, ce = max(1, pos - flank), pos + flank
                win = genome.seq(chrom, cs, ce)
                if win and len(win) == (ce - cs + 1):
                    k = pos - cs
                    ctx_r = win[:k] + retained + win[k + 1:]
                    ctx_l = win[:k] + lost + win[k + 1:]
            result.append({
                "evidence": ("inferred" if str(s.get("evidence") or "") == "inferred" else "measured"),
                "gene": gene, "chr": chrom, "pos": pos, "ref": ref, "alt": alt,
                "retained_allele": retained, "lost_allele": lost, "retained_is": ret,
                "transcript": tid, "strand": strand, "region": region,
                "in_mature_transcript": bool(in_mrna), "coding": bool(coding),
                "tumour_baf": s.get("tumour_baf"), "germline_baf": s.get("germline_baf"),
                "context_retained": ctx_r, "context_lost": ctx_l,
                "context_start": cs, "context_end": ce,
            })

    # A site an agent can actually reach comes first: in the mature message, then coding,
    # then by position so one gene's sites read down the transcript.
    order = {"coding": 0, "3' UTR": 1, "5' UTR": 2, "non-coding exon": 3, "intron": 4,
             "outside any transcript": 5}
    # Measured before inferred, then by how well an agent can reach it.
    result.sort(key=lambda r: (0 if r["evidence"] == "measured" else 1,
                               order.get(r["region"], 9), r["gene"], r["pos"]))
    n_mrna = sum(1 for r in result if r["in_mature_transcript"])
    if mode == "phased":
        notes.append("The retained allele is the one carried by the copy the disease variant sits on. An agent "
                     "directed at it hits the disease chromosome and leaves the healthy one, which still makes "
                     "normal product. The phase came from the caller's file: it is an assertion about this "
                     "patient's genotype and is not recoverable from the sequence, so a mis-phased block "
                     "produces a target that is real but on the wrong chromosome.")
    elif mode == "mutation":
        notes.append("The retained allele is the mutant one. It needs no phasing and no second sample, which is "
                     "why it is always available, but the discriminating base is wherever the mutation put it "
                     "rather than anywhere a design would have chosen, and for a dominant disease one mismatch "
                     "has to carry the whole of the selectivity.")
    else:
        notes.append("The retained allele is the one the TUMOUR still carries; an agent directed at it hits the "
                     "tumour's only copy, while a normal cell keeps the other allele and survives. This is why "
                     "an essential gene is the right target here and not the wrong one.")
    notes.append("%d of %d site(s) are in the mature transcript, which an siRNA or an exon-directed ASO needs. "
                 "The rest are intronic: a gapmer acting on pre-mRNA can still use them, a small-molecule or an "
                 "siRNA cannot." % (n_mrna, len(result)))
    notes.append("One base of difference is a real margin but a small one. Nothing here checks that an oligo "
                 "built on it would actually discriminate, or that it is specific against the rest of the "
                 "transcriptome. Design it in the editor and test both alleles before believing it.")
    if mode == "somatic":
        notes.append("A site is only usable if the germline call is a true heterozygote and the tumour really did "
                     "lose one side. Both come from the caller's own reads, not from a reference panel, so a "
                     "mis-called site produces a target that does not exist.")
    else:
        notes.append("A site is only usable if the heterozygous call is real. It comes from the caller's own "
                     "reads, not from a reference panel, so a mis-called site produces a target that does not "
                     "exist and an oligo built on it would hit both copies.")
    inf = sum(1 for r in result if r["evidence"] == "inferred")
    if inf and mode == "somatic":
        notes.append("%d site(s) are marked inferred. A variants-only tumour file writes nothing where the tumour "
                     "is homozygous for the REFERENCE, so the sites where it kept the reference allele leave no "
                     "record -- and they are usually the majority. Inside a tract already shown to be single-copy "
                     "that absence means the alternate allele is the one that went, which is a sound inference and "
                     "not a measurement. Confirm those on the reads, or from a tumour file that emits reference "
                     "calls, before designing against them." % inf)
    out["ok"] = bool(result)
    if not result:
        out["error"] = "no site could be annotated"
    out["sites"] = json.dumps(result)
    out["n_genes"] = len(byg)
    out["notes"] = json.dumps(notes)
    works.msg("%d site(s) annotated, %d in the mature transcript" % (len(result), n_mrna))

works.resolve(out)
