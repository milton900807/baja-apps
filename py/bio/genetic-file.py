"""Any file dropped on the karyotype: what is it, and what in it can be put on the genome?

The Upload button used to take a VCF and nothing else. A VCF is one shape genetic
information arrives in; a clinical genetic test report is another, and so is a lab PDF, a
23andMe export, a gene panel, a paper, a screenshot of a result. This reads whichever of
those it is handed and answers in the two shapes the karyotype already draws: VCF rows for
the variants, and gene symbols for the genes.

TWO QUESTIONS, ASKED SEPARATELY, because they are different sizes of question.

    1. WHAT IS THIS FILE. A fast model looks at the file (a PDF or image is shown to it as
       is; a Word or Excel file is unpacked to its text here; a text file is shown by its
       head) and says which kind it is: a VCF, a table of variants, a genetic report, a
       gene list, a sequence file, or something else. A VCF goes back to the caller, whose
       own streaming reader is the right thing for a five-million-row file; a table goes
       back with its column map, so the caller can stream that too. Nothing else is
       decided here.

    2. WHAT IS IN IT. For a report, a list or prose, a stronger model reads the whole thing
       and lists the genes and the specific changes it names -- as the document writes
       them -- with each one's classification and condition.

NOTHING THE MODEL SAYS IS PLACED ON THE GENOME BY THE MODEL. Every variant it lists is
resolved to GRCh38 (or the karyotype's own assembly) HERE, deterministically, from files
on this box:

    genomic coordinates in the document   -> taken as written, when the build is right
    NC_0000xx.yy:g.  (HGVS genomic)        -> the accession's chromosome, version checked
    rs numbers                             -> ClinVar, by position within the gene
    c. notation (HGVS cDNA)                -> the gene's MANE Select transcript in the same
                                              GENCODE annotation the karyotype draws from,
                                              exon by exon; reference base checked against
                                              the genome FASTA
    p. notation, V600E, F508del            -> the transcript's coding sequence, read off the
                                              genome, translated, and the codon found
    a gene with no placeable change        -> the gene alone, for the caller to highlight

A change that cannot be resolved is returned as unresolved WITH THE REASON, rather than
placed approximately: a mark at the wrong base looks exactly like a mark at the right one.

Params (after the EngineMonitor):
    param(1) : base64 of the file bytes -- the whole file, or the HEAD of a large text file
    param(2) : mime type as the browser reports it ('' when it does not know)
    param(3) : file name
    param(4) : species of the open karyotype (default human)
    param(5) : total size of the file in bytes
    param(6) : 1 when param(1) is only the head of the file

Resolves:
    { ok, kind, description, genetic_content, assembly, species_seen, table,
      summary, subject, conditions, genes, variants, unresolved, vcf, notes,
      warnings, models, error }
  kind         : vcf | variant_table | genetic_report | gene_list | sequence | other
  table        : {delimiter, header_lines, comment_prefix, chrom_col, pos_col, ref_col,
                  alt_col, id_col, genotype_col} for a variant_table (0-based, -1 absent)
  genes        : [{symbol, why, quoted}]
  variants     : [{label, gene, chrom, pos, ref, alt, classification, condition, zygosity,
                   how, note, transcript}]           -- the placed ones
  unresolved   : [{label, gene, reason}]              -- the ones that could not be placed
  vcf          : the placed variants as VCF rows, ready for the karyotype's own reader
"""
from __future__ import annotations

import base64
import gzip
import io
import json
import os
import re
import shutil
import subprocess
import zipfile

from ion import works

try:
    import requests
except Exception:  # pragma: no cover
    requests = None

try:
    import pysam
except Exception:  # pragma: no cover
    pysam = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
API_URL = "https://api.anthropic.com/v1/messages"
# Two models for two sizes of question. Classifying a file is a glance, and the fast model
# is the right one for it; reading a report for every variant it names is not.
CLASSIFY_MODEL = os.environ.get("CLAUDE_FAST_MODEL") or "claude-haiku-4-5"
EXTRACT_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5"

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
ASSEMBLY_OF = {"human": "GRCh38", "mouse": "GRCm39", "rat": "mRatBN7.2", "dog": "CanFam", "yeast": "R64-1-1"}

# The same species names py/bio/gene-locus.py and karyotype.py accept.
SYNONYMS = {
    "human": ["human", "homo sapiens", "h sapiens", "hsapiens", "hs", "hg38", "grch38", "man", "people", "patient"],
    "mouse": ["mouse", "mus musculus", "m musculus", "murine", "mm39", "grcm39", "mice"],
    "rat": ["rat", "rattus norvegicus", "r norvegicus", "rn7", "rats"],
    "dog": ["dog", "canis", "canis lupus familiaris", "canine", "canfam", "dogs"],
    "yeast": ["yeast", "saccharomyces cerevisiae", "s cerevisiae", "scerevisiae", "cerevisiae",
              "saccharomyces", "sc", "sgd", "saccer3", "saccer", "r64", "s288c", "budding yeast",
              "baker s yeast", "bakers yeast", "brewer s yeast"],
}

# RefSeq chromosome accessions for GRCh38 -- the version number is what tells a GRCh38
# g. description from a GRCh37 one, so it is checked rather than stripped.
NC_GRCH38 = {
    "NC_000001.11": "chr1", "NC_000002.12": "chr2", "NC_000003.12": "chr3", "NC_000004.12": "chr4",
    "NC_000005.10": "chr5", "NC_000006.12": "chr6", "NC_000007.14": "chr7", "NC_000008.11": "chr8",
    "NC_000009.12": "chr9", "NC_000010.11": "chr10", "NC_000011.10": "chr11", "NC_000012.12": "chr12",
    "NC_000013.11": "chr13", "NC_000014.9": "chr14", "NC_000015.10": "chr15", "NC_000016.10": "chr16",
    "NC_000017.11": "chr17", "NC_000018.10": "chr18", "NC_000019.10": "chr19", "NC_000020.11": "chr20",
    "NC_000021.9": "chr21", "NC_000022.11": "chr22", "NC_000023.11": "chrX", "NC_000024.10": "chrY",
    "NC_012920.1": "chrM",
}
NC_ANY = {}
for _k, _v in NC_GRCH38.items():
    NC_ANY[_k.split(".")[0]] = _v

CODON = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L", "CTT": "L", "CTC": "L", "CTA": "L", "CTG": "L",
    "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M", "GTT": "V", "GTC": "V", "GTA": "V", "GTG": "V",
    "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S", "CCT": "P", "CCC": "P", "CCA": "P", "CCG": "P",
    "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T", "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A",
    "TAT": "Y", "TAC": "Y", "TAA": "*", "TAG": "*", "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q",
    "AAT": "N", "AAC": "N", "AAA": "K", "AAG": "K", "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E",
    "TGT": "C", "TGC": "C", "TGA": "*", "TGG": "W", "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R", "GGT": "G", "GGC": "G", "GGA": "G", "GGG": "G",
}
AA3 = {"ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C", "GLN": "Q", "GLU": "E", "GLY": "G",
       "HIS": "H", "ILE": "I", "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P", "SER": "S",
       "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V", "TER": "*", "STOP": "*", "X": "*"}
COMP = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}

CLNSIG = {
    "pathogenic": "Pathogenic", "likely_pathogenic": "Likely_pathogenic",
    "uncertain": "Uncertain_significance", "likely_benign": "Likely_benign", "benign": "Benign",
    "conflicting": "Conflicting_classifications_of_pathogenicity",
}

MAX_PDF = 30 * 1024 * 1024      # the Messages API takes PDFs to 32 MB
MAX_IMAGE = 5 * 1024 * 1024     # and images to 5 MB
MAX_HEAD_CHARS = 16000          # what the classifier sees of a text file
MAX_HEAD_LINES = 160
MAX_TEXT_CHARS = 150000         # what the reader sees of a text file
MAX_GENES = 80
MAX_VARIANTS = 60

# ---------------------------------------------------------------- the two prompts

CLASSIFY_SYSTEM = (
    "You look at a file someone has dropped onto a genome browser and say what kind of file it "
    "is, so the browser knows how to read it. You do not extract its contents.\n"
    "Kinds:\n"
    "- vcf: Variant Call Format. A ##fileformat=VCF header, or a #CHROM POS ID REF ALT header, "
    "or rows of chromosome / position / id / ref / alt / qual / filter / info.\n"
    "- variant_table: any other table where each row is a place on a genome -- a 23andMe or "
    "AncestryDNA raw-data export (rsid, chromosome, position, genotype), a BED-like file, a "
    "TSV/CSV export of annotated variants with chromosome and position columns, a MAF.\n"
    "- genetic_report: a document in prose or in labelled fields that names genes and/or "
    "specific variants -- a clinical genetic test report, a lab result, a pharmacogenomic "
    "report, a carrier screen, a tumour sequencing report, a paper, a letter, a slide, a "
    "screenshot of any of these.\n"
    "- gene_list: a list of gene symbols or gene ids with little else -- a panel, a column of "
    "symbols, a spreadsheet of genes.\n"
    "- sequence: FASTA, FASTQ, GenBank, EMBL, or raw nucleotide/protein sequence.\n"
    "- other: none of the above.\n"
    "For a variant_table, fill in `table`: the delimiter, how many header lines precede the "
    "data (comment lines starting with # count), and the 0-based column index of the "
    "chromosome, position, reference allele, alternate allele, identifier (rsid) and genotype "
    "columns, -1 for each that is absent. For every other kind, set every table column to -1.\n"
    "`assembly` is the reference build the file's coordinates are on, ONLY if the file says "
    "so (build 37 / hg19 = GRCh37; build 38 / hg38 = GRCh38); otherwise unknown.\n"
    "`species` is the organism the file is about, if it says; else ''.\n"
    "`genetic_content` is true when the file names genes, variants, or genomic positions that "
    "could be shown on a genome, whatever its kind.\n"
    "`description` is one short sentence saying what the file is, as you would to a colleague."
)

CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["vcf", "variant_table", "genetic_report", "gene_list",
                                            "sequence", "other"]},
        "description": {"type": "string"},
        "genetic_content": {"type": "boolean"},
        "assembly": {"type": "string", "enum": ["GRCh38", "GRCh37", "other", "unknown"]},
        "species": {"type": "string"},
        "table": {
            "type": "object",
            "properties": {
                "delimiter": {"type": "string", "enum": ["tab", "comma", "semicolon", "whitespace"]},
                "header_lines": {"type": "integer"},
                "comment_prefix": {"type": "string"},
                "chrom_col": {"type": "integer"},
                "pos_col": {"type": "integer"},
                "ref_col": {"type": "integer"},
                "alt_col": {"type": "integer"},
                "id_col": {"type": "integer"},
                "genotype_col": {"type": "integer"},
            },
            "required": ["delimiter", "header_lines", "comment_prefix", "chrom_col", "pos_col",
                         "ref_col", "alt_col", "id_col", "genotype_col"],
            "additionalProperties": False,
        },
    },
    "required": ["kind", "description", "genetic_content", "assembly", "species", "table"],
    "additionalProperties": False,
}

EXTRACT_SYSTEM = (
    "You read a document that carries genetic information -- a clinical genetic test report, a "
    "lab result, a gene panel, a paper, a letter, a screenshot -- and list what in it can be "
    "shown on a genome browser: the genes it is about, and every specific variant it names.\n"
    "Rules:\n"
    "- ONLY WHAT THE DOCUMENT SAYS. Do not add well-known variants of a gene the document "
    "mentions but names no variant for. Do not complete a partial description from memory. "
    "An empty variants list is a fine answer for a document that names none.\n"
    "- One entry per variant the document reports, including benign and uncertain ones, and "
    "the pharmacogenomic star alleles if they are given as specific changes. Up to 60.\n"
    "- Copy each notation EXACTLY as the document writes it into the matching field: hgvs_c "
    "(c.1521_1523delCTT), hgvs_p (p.Phe508del or p.F508del), hgvs_g (NC_000007.14:g.117559593_"
    "117559595del or g.117559593del), rsid (rs113993960), transcript (NM_000492.4 or "
    "ENST00000003084). A bare protein change written as F508del, V600E or K27M goes in hgvs_p "
    "as written. Leave a field '' when the document does not give it.\n"
    "- chrom, pos, ref, alt: ONLY when the document prints genomic coordinates for the variant; "
    "pos is 0 when it does not. assembly is the build the document states for those "
    "coordinates ('' if unstated).\n"
    "- label: the variant as the document names it, short -- 'BRCA1 c.5266dupC (p.Gln1756Profs*74)'.\n"
    "- gene: the official HGNC symbol, upper case. classification: the document's own call, "
    "mapped to the enum; not_stated when it gives none. zygosity: heterozygous, homozygous, "
    "hemizygous, mosaic, somatic, or ''. condition: the disorder the document ties this "
    "variant to, or ''.\n"
    "- evidence: the sentence, row or cell the variant was read from, verbatim, so it can be "
    "checked against the document.\n"
    "- genes: the genes the document is about -- the ones tested, the ones with findings, the "
    "ones discussed. Up to 80; the ones with findings first. why: a few words.\n"
    "- conditions: the disorders or phenotypes the document is about, as a clinical record "
    "would name them.\n"
    "- summary: two sentences saying what the document is and what it found. subject: who or "
    "what it is about (a patient, a tumour, a cell line, a cohort, a paper), without any "
    "name or identifier.\n"
    "- notes: anything you could not read, guessed, or found ambiguous."
)

VARIANT_SCHEMA = {
    "type": "object",
    "properties": {
        "label": {"type": "string"},
        "gene": {"type": "string"},
        "transcript": {"type": "string"},
        "hgvs_c": {"type": "string"},
        "hgvs_p": {"type": "string"},
        "hgvs_g": {"type": "string"},
        "rsid": {"type": "string"},
        "chrom": {"type": "string"},
        "pos": {"type": "integer"},
        "ref": {"type": "string"},
        "alt": {"type": "string"},
        "assembly": {"type": "string"},
        "zygosity": {"type": "string"},
        "classification": {"type": "string", "enum": [
            "pathogenic", "likely_pathogenic", "uncertain", "likely_benign", "benign",
            "conflicting", "risk_factor", "drug_response", "other", "not_stated"]},
        "condition": {"type": "string"},
        "evidence": {"type": "string"},
    },
    "required": ["label", "gene", "transcript", "hgvs_c", "hgvs_p", "hgvs_g", "rsid", "chrom",
                 "pos", "ref", "alt", "assembly", "zygosity", "classification", "condition",
                 "evidence"],
    "additionalProperties": False,
}

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "subject": {"type": "string"},
        "conditions": {"type": "array", "items": {"type": "string"}},
        "genes": {"type": "array", "items": {
            "type": "object",
            "properties": {"symbol": {"type": "string"}, "why": {"type": "string"}},
            "required": ["symbol", "why"], "additionalProperties": False}},
        "variants": {"type": "array", "items": VARIANT_SCHEMA},
        "notes": {"type": "string"},
    },
    "required": ["summary", "subject", "conditions", "genes", "variants", "notes"],
    "additionalProperties": False,
}


# ---------------------------------------------------------------- small helpers

def first_existing(rel):
    for base in [os.getcwd(),
                 "/opt/baja-apps", os.path.expanduser("~/baja-apps"),
                 "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return ""


def resolve_species(text):
    t = "".join(c.lower() if (c.isalnum() or c.isspace()) else " " for c in str(text or ""))
    t = " ".join(t.split())
    if not t:
        return ""
    best, best_len = "", 0
    for key, names in SYNONYMS.items():
        for n in names:
            if (t == n or t.startswith(n + " ") or t.endswith(" " + n) or (" " + n + " ") in (" " + t + " ")):
                if len(n) > best_len:
                    best, best_len = key, len(n)
    return best


def attrs(col):
    d = {}
    for kv in str(col or "").split(";"):
        if "=" in kv:
            k, v = kv.split("=", 1)
            d[k.strip()] = v.strip()
    return d


def revcomp(s):
    return "".join(COMP.get(c, "N") for c in reversed(s.upper()))


def norm(s):
    """Whitespace collapsed and case dropped, for 'does the document say this' checks."""
    return re.sub(r"\s+", "", str(s or "")).lower()


def clean_str(s, n=200):
    return re.sub(r"[\t\r\n]+", " ", str(s or "")).strip()[:n]


# ---------------------------------------------------------------- reading the file

def sniff(raw):
    """The container, from the bytes rather than the name: a .txt that is a PDF is a PDF."""
    if raw[:5] == b"%PDF-":
        return "pdf"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw[:2] == b"PK":
        return "zip"
    if raw[:2] == b"\x1f\x8b":
        return "gzip"
    head = raw[:4096]
    if b"\x00" in head:
        return "binary"
    return "text"


def decode_text(raw):
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        try:
            return raw.decode("utf-16")
        except Exception:
            pass
    try:
        return raw.decode("utf-8")
    except Exception:
        return raw.decode("latin-1", "replace")


def _xml_text(xml, para_tags, tab_tags=()):
    """Text out of an Office XML part: paragraphs to lines, tabs to tabs, tags dropped."""
    s = xml
    for t in tab_tags:
        s = s.replace(t, "\t")
    for t in para_tags:
        s = re.sub(t, "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = (s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
         .replace("&quot;", '"').replace("&apos;", "'"))
    s = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), s)
    return s


def unpack_office(raw):
    """docx / xlsx / pptx / odt -> text, with the standard library only.

    Returns (text, what) or ('', '') when the zip is none of those.
    """
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
        names = set(z.namelist())
    except Exception:
        return "", ""
    if "word/document.xml" in names:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
        return _xml_text(xml, [r"</w:p>", r"<w:br[^>]*/>"], ["<w:tab/>"]), "docx"
    if "xl/workbook.xml" in names:
        shared = []
        if "xl/sharedStrings.xml" in names:
            sx = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
            for si in re.findall(r"<si>(.*?)</si>", sx, re.S):
                shared.append(_xml_text(si, []))
        lines = []
        sheets = sorted(n for n in names if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
        for sh in sheets:
            sx = z.read(sh).decode("utf-8", "replace")
            for row in re.findall(r"<row[^>]*>(.*?)</row>", sx, re.S):
                cells = []
                for cm in re.finditer(r"<c\b([^>]*)>(.*?)</c>", row, re.S):
                    ca, cb = cm.group(1), cm.group(2)
                    v = re.search(r"<v>(.*?)</v>", cb, re.S)
                    val = v.group(1) if v else ""
                    if 't="s"' in ca:
                        try:
                            val = shared[int(val)]
                        except Exception:
                            pass
                    elif 't="inlineStr"' in ca:
                        val = _xml_text(cb, [])
                    cells.append(val.strip())
                if any(cells):
                    lines.append("\t".join(cells))
            lines.append("")
        return "\n".join(lines), "xlsx"
    slides = sorted(n for n in names if re.match(r"ppt/slides/slide\d+\.xml$", n))
    if slides:
        out = []
        for s in slides:
            sx = z.read(s).decode("utf-8", "replace")
            out.append(_xml_text(sx, [r"</a:p>"]))
        return "\n\n".join(out), "pptx"
    if "content.xml" in names:
        xml = z.read("content.xml").decode("utf-8", "replace")
        return _xml_text(xml, [r"</text:p>", r"</text:h>", r"<text:line-break/>"], ["<text:tab/>"]), "odt"
    return "", ""


def load_file(raw, mime, fname):
    """-> {form: 'pdf'|'image'|'text', mime, text, raw, container, error}"""
    out = {"form": "", "mime": "", "text": "", "raw": b"", "container": "", "error": None}
    kind = sniff(raw)
    if kind == "gzip":
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
                raw = gz.read(64 * 1024 * 1024 + 1)
            if len(raw) > 64 * 1024 * 1024:
                out["error"] = "that compressed file is over 64 MB once unpacked; decompress it first"
                return out
            out["container"] = "gzip"
            kind = sniff(raw)
        except Exception as e:
            out["error"] = "could not unpack the gzip: %s" % e
            return out
    if kind == "pdf":
        if len(raw) > MAX_PDF:
            out["error"] = "that PDF is over 30 MB, which is more than can be read at once"
            return out
        out.update(form="pdf", mime="application/pdf", raw=raw)
        return out
    if kind.startswith("image/"):
        if len(raw) > MAX_IMAGE:
            out["error"] = "that image is over 5 MB; a smaller copy can be read"
            return out
        out.update(form="image", mime=kind, raw=raw)
        return out
    if kind == "zip":
        text, what = unpack_office(raw)
        if not what:
            out["error"] = "that is a zip archive, not a document; unpack it and drop the file inside"
            return out
        out.update(form="text", text=text, container=what)
        return out
    if kind == "binary":
        out["error"] = ("could not read %s: it is a binary file of a kind this does not open "
                        "(PDF, images, Word, Excel, PowerPoint and text are read)" % (fname or "the file"))
        return out
    out.update(form="text", text=decode_text(raw))
    return out


# ---------------------------------------------------------------- the model

def call_claude(model, system, content, schema, max_tokens, effort=None):
    """One structured call. Returns (parsed_json, error, model_used)."""
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server", ""
    if requests is None:
        return None, "python 'requests' is not available on the server", ""
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": content}],
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
        "fallbacks": "default",
    }
    if effort:
        body["output_config"]["effort"] = effort
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json",
    }

    def post(b, h):
        return requests.post(API_URL, headers=h, json=b, timeout=(20, 300))

    try:
        r = post(body, headers)
        if r.status_code == 400 and "fallback" in (r.text or "").lower():
            body.pop("fallbacks", None)
            headers.pop("anthropic-beta", None)
            r = post(body, headers)
        if r.status_code == 400 and "effort" in (r.text or "").lower():
            body["output_config"].pop("effort", None)
            r = post(body, headers)
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, (r.text or "")[:300]), ""
        data = r.json()
        if data.get("stop_reason") == "refusal":
            return None, "the model declined to read this file", data.get("model") or model
        txt = "".join(b.get("text", "") for b in (data.get("content") or [])
                      if b.get("type") == "text").strip()
        try:
            parsed = json.loads(txt)
        except Exception:
            m = re.search(r"\{.*\}", txt, re.S)
            if not m:
                return None, "no JSON in the model response", data.get("model") or model
            parsed = json.loads(m.group(0))
        return parsed, None, data.get("model") or model
    except Exception as ex:
        return None, str(ex), ""


def file_blocks(doc, whole):
    """The file as content blocks: the PDF or image itself, or the text (head or whole)."""
    if doc["form"] == "pdf":
        return [{"type": "document",
                 "source": {"type": "base64", "media_type": "application/pdf",
                            "data": base64.b64encode(doc["raw"]).decode("ascii")}}]
    if doc["form"] == "image":
        return [{"type": "image",
                 "source": {"type": "base64", "media_type": doc["mime"],
                            "data": base64.b64encode(doc["raw"]).decode("ascii")}}]
    t = doc["text"]
    if whole:
        t = t[:MAX_TEXT_CHARS]
    else:
        t = "\n".join(t.split("\n")[:MAX_HEAD_LINES])[:MAX_HEAD_CHARS]
    return [{"type": "text", "text": t if t.strip() else "(the file is empty)"}]


def classify(doc, fname, mime, size, partial, species):
    ctx = ("File name: %s\nReported mime type: %s\nSize: %s bytes%s\nThe open karyotype is %s.\n"
           % (fname or "?", mime or "unknown", size or len(doc.get("raw") or doc.get("text") or ""),
              " (only the head of the file is shown)" if partial else "",
              species or "human"))
    if doc["container"]:
        ctx += "The file was unpacked from a %s container.\n" % doc["container"]
    content = file_blocks(doc, False) + [{"type": "text", "text": ctx + "What kind of file is this?"}]
    return call_claude(CLASSIFY_MODEL, CLASSIFY_SYSTEM, content, CLASSIFY_SCHEMA, 1500)


def extract(doc, fname, partial, species):
    ctx = ("File name: %s%s\nThe open karyotype is %s; say so in notes if the document is "
           "about another organism.\nList the genes and variants this document names."
           % (fname or "?", " (only the head of the file is shown)" if partial else "",
              species or "human"))
    content = file_blocks(doc, True) + [{"type": "text", "text": ctx}]
    return call_claude(EXTRACT_MODEL, EXTRACT_SYSTEM, content, EXTRACT_SCHEMA, 16000, "medium")


# ---------------------------------------------------------------- the annotation

def fetch_rows(path, contig, s1, e1):
    if pysam:
        try:
            tb = pysam.TabixFile(path)
            for row in tb.fetch(contig, max(0, s1 - 1), e1):
                yield row
            return
        except Exception:
            return
    if _TABIX:
        try:
            proc = subprocess.run([_TABIX, path, "%s:%d-%d" % (contig, max(1, s1), e1)],
                                  capture_output=True, text=True, timeout=180)
            for line in proc.stdout.splitlines():
                if line and not line.startswith("#"):
                    yield line
        except Exception:
            return


def contigs_of(path):
    if pysam:
        try:
            return set(pysam.TabixFile(path).contigs)
        except Exception:
            pass
    if _TABIX:
        try:
            proc = subprocess.run([_TABIX, "-l", path], capture_output=True, text=True, timeout=60)
            return set(x.strip() for x in proc.stdout.splitlines() if x.strip())
        except Exception:
            pass
    return set()


def contig_for(have, chrom):
    """The file's own spelling of a chromosome: chr17 / 17 / I / Mito."""
    c = str(chrom or "").strip()
    bare = c[3:] if c.lower().startswith("chr") else c
    mito = bare.upper() in ("MT", "M", "MITO")
    for cand in ("chr" + bare, bare, c, "chrM" if mito else "", "MT" if mito else "", "Mito" if mito else ""):
        if cand and (not have or cand in have):
            return cand
    return ""


class GeneIndex:
    """symbol -> locus, from the same <species>.gene-symbols.tsv gene-locus.py keeps."""

    def __init__(self, species):
        self.species = species
        self.gff = first_existing(GFF.get(species, "")) if species in GFF else ""
        self.path = (os.path.join(os.path.dirname(self.gff), "%s.gene-symbols.tsv" % species)
                     if self.gff else "")
        self.rows = None
        self.contigs = contigs_of(self.gff) if self.gff else set()

    def build(self):
        works.msg("Indexing the %s gene symbols (first time only)…" % self.species)
        tmp = self.path + ".partial-%d" % os.getpid()
        opener = gzip.open if self.gff.endswith((".gz", ".bgz")) else open
        with opener(self.gff, "rt") as fh, open(tmp, "w") as w:
            for line in fh:
                if not line or line[0] == "#":
                    continue
                f = line.rstrip("\n").split("\t")
                if len(f) < 9 or f[2] != "gene":
                    continue
                a = attrs(f[8])
                name = a.get("gene_name") or a.get("Name") or ""
                gid = a.get("gene_id") or a.get("ID") or ""
                if not name and not gid:
                    continue
                syn = (a.get("gene_synonym") or a.get("Alias") or "").replace(",", "|")
                w.write("\t".join([name, f[0], f[3], f[4], f[6],
                                   a.get("gene_type") or a.get("biotype") or "", gid, syn]) + "\n")
        os.replace(tmp, self.path)

    def load(self):
        if self.rows is not None:
            return
        self.rows = []
        if not self.gff or not os.path.exists(self.gff):
            return
        if not os.path.exists(self.path) or os.path.getsize(self.path) < 1024:
            try:
                self.build()
            except Exception as e:
                works.msg("could not index the annotation: %s" % e)
                return
        with open(self.path, "r") as fh:
            for line in fh:
                f = line.rstrip("\n").split("\t")
                if len(f) >= 8:
                    self.rows.append(f)

    def find(self, symbol):
        self.load()
        q = str(symbol or "").strip().upper()
        if not q:
            return None
        qbase = q.split(".")[0]
        hits = []
        for f in self.rows:
            how = ""
            if f[0].upper() == q:
                how = "symbol"
            elif f[6].split(".")[0].upper() == qbase:
                how = "id"
            elif f[7] and q in [s.strip().upper() for s in f[7].split("|") if s.strip()]:
                how = "synonym"
            if how:
                try:
                    hits.append({"gene": f[0] or f[6], "chr": f[1], "start": int(f[2]), "end": int(f[3]),
                                 "strand": f[4], "biotype": f[5], "gene_id": f[6], "matched": how})
                except Exception:
                    pass
        if not hits:
            return None
        rank = {"symbol": 0, "id": 1, "synonym": 2}
        hits.sort(key=lambda g: (rank.get(g["matched"], 9), -(g["end"] - g["start"]), g["chr"]))
        return hits[0]


class Transcript:
    def __init__(self, tid, strand, contig):
        self.id = tid
        self.strand = strand
        self.contig = contig
        self.exons = []      # [(start, end)] genomic, 1-based inclusive
        self.cds = []        # [(start, end)]
        self.rank = 3
        self.coding = False
        self._tx = None

    # Transcript coordinates: 1-based along the spliced transcript, 5' -> 3'.
    def _prepare(self):
        if self._tx is not None:
            return
        ex = sorted(set(self.exons))
        if self.strand == "-":
            ex = ex[::-1]
        starts, acc = [], 0
        for s, e in ex:
            starts.append(acc)
            acc += (e - s + 1)
        self._tx = (ex, starts, acc)
        if self.cds:
            cs = min(s for s, _ in self.cds)
            ce = max(e for _, e in self.cds)
            gstart = cs if self.strand == "+" else ce
            gend = ce if self.strand == "+" else cs
            self.cds_tstart = self.t_of_g(gstart)
            self.cds_tend = self.t_of_g(gend)
        else:
            self.cds_tstart = self.cds_tend = None

    def t_of_g(self, g):
        self._prepare()
        ex, starts, _ = self._tx
        for (s, e), off in zip(ex, starts):
            if s <= g <= e:
                return off + ((g - s) if self.strand == "+" else (e - g)) + 1
        return None

    def g_of_t(self, t):
        self._prepare()
        ex, starts, total = self._tx
        if t < 1 or t > total:
            return None
        for (s, e), off in zip(ex, starts):
            n = e - s + 1
            if off < t <= off + n:
                k = t - off - 1
                return (s + k) if self.strand == "+" else (e - k)
        return None

    def g_of_c(self, prefix, n, offset):
        """HGVS c. position -> genomic. prefix '' | '-' | '*', n >= 1, offset the +M/-M."""
        self._prepare()
        if self.cds_tstart is None:
            return None, "the transcript has no coding sequence"
        if prefix == "-":
            t = self.cds_tstart - n
        elif prefix == "*":
            t = self.cds_tend + n
        else:
            t = self.cds_tstart + n - 1
        ex, _, total = self._tx
        # A promoter change (c.-93) or a 3' one (c.*1200) may lie past the annotated ends
        # of the transcript: the UTRs in an annotation are what was observed, not where
        # the numbering stops. Those are carried on along the genome from the nearest end.
        if t < 1:
            first_s, first_e = ex[0]
            g = (first_s - (1 - t)) if self.strand == "+" else (first_e + (1 - t))
        elif t > total:
            last_s, last_e = ex[-1]
            g = (last_e + (t - total)) if self.strand == "+" else (last_s - (t - total))
        else:
            g = self.g_of_t(t)
        if g is None or g < 1:
            return None, "could not map c.%s%d" % (prefix, n)
        if offset:
            g += offset if self.strand == "+" else -offset
        return g, None

    def cds_length(self):
        self._prepare()
        if self.cds_tstart is None:
            return 0
        return self.cds_tend - self.cds_tstart + 1


def transcripts_of(gff, contigs, locus, gene_symbol, want_tid):
    """Every transcript of the gene in the annotation, best first."""
    q = contig_for(contigs, locus["chr"])
    if not q:
        return []
    by_id = {}
    gid = (locus.get("gene_id") or "").split(".")[0]
    for row in fetch_rows(gff, q, locus["start"], locus["end"]):
        f = row.split("\t")
        if len(f) < 9:
            continue
        kind = f[2]
        a = attrs(f[8])
        if kind == "gene":
            continue
        # Whose transcript is this? GENCODE says on every row; Ensembl only on the
        # transcript row, whose children point at it through Parent.
        tid = (a.get("transcript_id") or "")
        parent = (a.get("Parent") or "").replace("transcript:", "")
        if kind in ("exon", "CDS"):
            tid = tid or parent
        else:
            tid = tid or (a.get("ID") or "").replace("transcript:", "")
        if not tid:
            continue
        tbase = tid.split(".")[0]
        if kind in ("exon", "CDS"):
            t = by_id.get(tbase)
            if t is None:
                t = by_id[tbase] = Transcript(tid, f[6], f[0])
            if kind == "exon":
                t.exons.append((int(f[3]), int(f[4])))
            else:
                t.cds.append((int(f[3]), int(f[4])))
                t.coding = True
        elif "transcript_id" in f[8] or kind in ("transcript", "mRNA", "ncRNA", "lnc_RNA",
                                                  "tRNA", "rRNA", "snoRNA", "snRNA", "pseudogene"):
            gname = (a.get("gene_name") or "").upper()
            pgene = (a.get("Parent") or "").replace("gene:", "").split(".")[0]
            if gname and gname != gene_symbol.upper():
                by_id.setdefault(tbase, Transcript(tid, f[6], f[0])).rank = 99
                continue
            if not gname and pgene and gid and pgene != gid:
                by_id.setdefault(tbase, Transcript(tid, f[6], f[0])).rank = 99
                continue
            t = by_id.get(tbase)
            if t is None:
                t = by_id[tbase] = Transcript(tid, f[6], f[0])
            tag = a.get("tag") or ""
            rank = 3
            if "MANE_Select" in tag:
                rank = 0
            elif "Ensembl_canonical" in tag:
                rank = 1
            elif "basic" in tag:
                rank = 2
            if want_tid and tbase.upper() == want_tid.split(".")[0].upper():
                rank = -1
            t.rank = min(t.rank, rank) if t.rank != 99 else 99
    out = [t for t in by_id.values() if t.rank != 99 and t.exons]
    out.sort(key=lambda t: (t.rank, 0 if t.coding else 1, -t.cds_length()))
    return out


# ---------------------------------------------------------------- the genome

class Genome:
    def __init__(self, species):
        self.path = first_existing(GENOME.get(species, "")) if species in GENOME else ""
        self.fa = None
        self.fai = {}
        self.names = []
        if self.path and os.path.exists(self.path + ".fai"):
            if pysam:
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

    def ok(self):
        return bool(self.fa or self.fai)

    def contig(self, chrom):
        return contig_for(set(self.names), chrom)

    def seq(self, chrom, start, end):
        """Forward-strand bases, 1-based inclusive; '' when unavailable."""
        c = self.contig(chrom)
        if not c or end < start:
            return ""
        try:
            if self.fa:
                return self.fa.fetch(c, start - 1, end).upper()
            length, offset, linebases, linewidth = self.fai[c]
            start = max(1, start)
            end = min(end, length)
            bs = offset + (start - 1) // linebases * linewidth + (start - 1) % linebases
            be = offset + (end - 1) // linebases * linewidth + (end - 1) % linebases + 1
            with open(self.path, "rb") as fh:
                fh.seek(bs)
                raw = fh.read(be - bs)
            return raw.replace(b"\n", b"").replace(b"\r", b"").decode("ascii", "replace").upper()
        except Exception:
            return ""


def cds_sequence(genome, t):
    """The coding sequence in transcript orientation, ATG first, or ''."""
    if not genome.ok() or not t.cds:
        return ""
    parts = []
    for s, e in sorted(t.cds):
        parts.append(genome.seq(t.contig, s, e))
    seq = "".join(parts)
    if not seq or len(seq) != sum(e - s + 1 for s, e in t.cds):
        return ""
    return revcomp(seq) if t.strand == "-" else seq


def translate(cds):
    return "".join(CODON.get(cds[i:i + 3], "X") for i in range(0, len(cds) - len(cds) % 3, 3))


# ---------------------------------------------------------------- notation

HGVS_C = re.compile(
    r"c\.(\*|-)?(\d+)([+-]\d+)?(?:_(\*|-)?(\d+)([+-]\d+)?)?"
    r"(?:([ACGTUN]+)>([ACGTUN]+)|(delins|del|dup|ins|inv)([ACGTUN]*))?", re.I)
HGVS_P = re.compile(
    r"(?:p\.)?\(?([A-Z][a-z]{2}|[A-Z])(\d+)"
    r"(?:_([A-Z][a-z]{2}|[A-Z])(\d+))?"
    r"([A-Z][a-z]{2}|[A-Z*=]|Ter|fs|del|dup|ins|delins|ext)?", re.S)
HGVS_G = re.compile(r"(NC_\d{6}\.\d+)?:?g\.(\d+)(?:_(\d+))?(?:([ACGTN]+)>([ACGTN]+)|(delins|del|dup|ins|inv)([ACGTN]*))?", re.I)
RSID = re.compile(r"\brs(\d+)\b", re.I)


def aa1(s):
    s = str(s or "")
    if len(s) == 1:
        return s.upper()
    return AA3.get(s.upper(), "")


def parse_c(s):
    m = HGVS_C.search(str(s or ""))
    if not m:
        return None
    return {
        "prefix": m.group(1) or "", "n": int(m.group(2)), "offset": int(m.group(3) or 0),
        "prefix2": m.group(4) or "", "n2": int(m.group(5)) if m.group(5) else None,
        "offset2": int(m.group(6) or 0),
        "ref": (m.group(7) or "").upper().replace("U", "T"),
        "alt": (m.group(8) or "").upper().replace("U", "T"),
        "op": (m.group(9) or "").lower(), "opseq": (m.group(10) or "").upper().replace("U", "T"),
    }


def parse_p(s):
    s = str(s or "").strip()
    if not s:
        return None
    m = HGVS_P.search(s)
    if not m:
        return None
    ref = aa1(m.group(1))
    if not ref:
        return None
    op = m.group(5) or ""
    alt = ""
    if op in ("fs", "del", "dup", "ins", "delins", "ext"):
        pass
    elif op == "Ter" or op == "*":
        alt = "*"
    elif op == "=":
        alt = ref
        op = "="
    elif op:
        alt = aa1(op)
        op = "sub" if alt else ""
    if "fs" in s[m.end(2):m.end(2) + 12] and op in ("", "sub"):
        # p.Gln1756Profs*74: the residue after the position is the first changed one,
        # but the event is the frameshift.
        op = "fs"
    return {"ref": ref, "pos": int(m.group(2)), "alt": alt, "op": op or ("sub" if alt else "")}


# ---------------------------------------------------------------- resolution

class Resolver:
    def __init__(self, species):
        self.species = species
        self.index = GeneIndex(species)
        self.genome = Genome(species)
        self.gff = self.index.gff
        self.clinvar = first_existing(CLINVAR) if species == "human" else ""
        self.clinvar_contigs = contigs_of(self.clinvar) if self.clinvar else set()
        self.tx_cache = {}
        self.cds_cache = {}
        self.loci = {}

    def locus(self, symbol):
        key = str(symbol or "").upper()
        if not key:
            return None
        if key not in self.loci:
            self.loci[key] = self.index.find(key)
        return self.loci[key]

    def transcripts(self, symbol, want_tid):
        key = (symbol.upper(), (want_tid or "").split(".")[0].upper())
        if key not in self.tx_cache:
            loc = self.locus(symbol)
            self.tx_cache[key] = transcripts_of(self.gff, self.index.contigs, loc, symbol, want_tid) if loc else []
        return self.tx_cache[key]

    def cds_of(self, t):
        if t.id not in self.cds_cache:
            self.cds_cache[t.id] = cds_sequence(self.genome, t)
        return self.cds_cache[t.id]

    def check_ref(self, chrom, pos, expect):
        """'' when the genome agrees or cannot be asked; else what it holds."""
        if not expect or not self.genome.ok():
            return ""
        got = self.genome.seq(chrom, pos, pos + len(expect) - 1)
        if got and got != expect.upper():
            return got
        return ""

    # -- the paths, each returning a placed dict or (None, reason)

    def by_coordinates(self, v, karyotype_assembly):
        chrom = str(v.get("chrom") or "").strip()
        pos = int(v.get("pos") or 0)
        if not chrom or pos <= 0:
            return None, ""
        asm = str(v.get("assembly") or "").upper().replace(" ", "")
        if self.species == "human" and re.search(r"GRCH37|HG19|B37|BUILD37|37$", asm):
            return None, "the report gives GRCh37 coordinates and this karyotype is GRCh38; no liftover is available here"
        ref = re.sub(r"[^ACGTN]", "", str(v.get("ref") or "").upper()) or "N"
        alt = re.sub(r"[^ACGTN]", "", str(v.get("alt") or "").upper()) or "N"
        note = ""
        if not asm:
            note = "coordinates taken as %s; the report does not state a build" % karyotype_assembly
        wrong = self.check_ref(chrom, pos, ref if ref != "N" else "")
        if wrong:
            note = (note + "; " if note else "") + "the genome holds %s at that position, not %s" % (wrong, ref)
        return {"chrom": chrom, "pos": pos, "ref": ref, "alt": alt, "how": "genomic coordinates", "note": note}, ""

    def by_hgvs_g(self, v):
        m = HGVS_G.search(str(v.get("hgvs_g") or ""))
        if not m:
            return None, ""
        acc = m.group(1) or ""
        chrom = str(v.get("chrom") or "")
        if acc:
            if self.species != "human":
                return None, "an NC_ accession is a human chromosome; this karyotype is %s" % self.species
            if acc in NC_GRCH38:
                chrom = NC_GRCH38[acc]
            elif acc.split(".")[0] in NC_ANY:
                return None, ("%s is not the GRCh38 version of that chromosome (%s); the report's "
                              "g. coordinates are on another build" % (acc, [k for k in NC_GRCH38 if k.startswith(acc.split(".")[0])][0]))
            else:
                return None, "%s is not a chromosome accession this knows" % acc
        if not chrom:
            loc = self.locus(v.get("gene"))
            if not loc:
                return None, "a g. position with no chromosome and no known gene"
            chrom = loc["chr"]
        pos = int(m.group(2))
        ref = (m.group(4) or "").upper()
        alt = (m.group(5) or "").upper()
        op = (m.group(6) or "").lower()
        opseq = (m.group(7) or "").upper()
        end = int(m.group(3) or pos)
        if not ref and not alt:
            ref, alt = self.alleles_for(op, chrom, pos, end, opseq)
        note = ""
        wrong = self.check_ref(chrom, pos, ref if ref and "N" not in ref else "")
        if wrong:
            note = "the genome holds %s at %s:%d, not %s" % (wrong, chrom, pos, ref)
        return {"chrom": chrom, "pos": pos, "ref": ref or "N", "alt": alt or "N", "how": "HGVS g.", "note": note}, ""

    def alleles_for(self, op, chrom, pos, end, opseq):
        """VCF-shaped ref/alt for a del / dup / ins / delins on the forward strand."""
        n = max(1, end - pos + 1)
        span = self.genome.seq(chrom, pos, end) if self.genome.ok() else ""
        if not span or len(span) != n:
            span = "N" * n
        if op == "del":
            return "N" + span, "N"
        if op == "dup":
            return "N", "N" + span
        if op == "ins":
            return "N", "N" + (opseq or "N")
        if op == "delins":
            return span, opseq or "N"
        if op == "inv":
            return span, revcomp(span)
        return "N", "N"

    def by_rsid(self, v):
        m = RSID.search(str(v.get("rsid") or "") + " " + str(v.get("label") or ""))
        if not m:
            return None, ""
        if not self.clinvar or not os.path.exists(self.clinvar):
            return None, "rs%s: ClinVar is not on this server to look it up" % m.group(1)
        rs = m.group(1)
        loc = self.locus(v.get("gene"))
        rows = []
        if loc:
            q = contig_for(self.clinvar_contigs, loc["chr"])
            pad = 5000
            for row in fetch_rows(self.clinvar, q, max(1, loc["start"] - pad), loc["end"] + pad):
                f = row.split("\t")
                if len(f) >= 8 and re.search(r"(?:^|;)RS=%s(?:;|$)" % rs, f[7]):
                    rows.append(f)
        else:
            # No gene to narrow it: one streamed pass, bounded, for this rs number.
            try:
                proc = subprocess.run(
                    "zcat %s | grep -F 'RS=%s' | head -5" % (self.clinvar, rs),
                    shell=True, capture_output=True, text=True, timeout=120)
                for line in proc.stdout.splitlines():
                    f = line.split("\t")
                    if len(f) >= 8 and re.search(r"(?:^|;)RS=%s(?:;|$)" % rs, f[7]):
                        rows.append(f)
            except Exception as e:
                return None, "rs%s: the ClinVar scan did not finish (%s)" % (rs, e)
        if not rows:
            return None, "rs%s is not in ClinVar%s" % (rs, " near " + loc["gene"] if loc else "")
        f = rows[0]
        ref, alt = f[3].upper(), f[4].split(",")[0].upper()
        if alt in (".", "") or not re.match(r"^[ACGTN]+$", alt):
            alt = "N"
        if not re.match(r"^[ACGTN]+$", ref):
            ref = "N"
        info = attrs(f[7])
        sig = info.get("CLNSIG") or ""
        return {"chrom": f[0], "pos": int(f[1]), "ref": ref, "alt": alt, "how": "rs number via ClinVar",
                "note": ("ClinVar: " + sig.replace("_", " ")) if sig else "",
                "clinvar_sig": sig}, ""

    def by_cdna(self, v):
        c = parse_c(v.get("hgvs_c") or "")
        if not c:
            c = parse_c(v.get("label") or "")
        if not c:
            return None, ""
        gene = str(v.get("gene") or "").strip()
        if not gene:
            return None, "%s names no gene, so there is no transcript to map it on" % (v.get("hgvs_c") or v.get("label"))
        loc = self.locus(gene)
        if not loc:
            return None, "%s is not a gene in the %s annotation" % (gene, self.species)
        txs = [t for t in self.transcripts(gene, v.get("transcript")) if t.coding]
        if not txs:
            return None, "%s has no coding transcript in the annotation" % gene
        t = txs[0]
        g1, err = t.g_of_c(c["prefix"], c["n"], c["offset"])
        if err:
            return None, "%s on %s: %s" % (v.get("hgvs_c"), t.id, err)
        g2 = g1
        if c["n2"] is not None:
            g2, err2 = t.g_of_c(c["prefix2"] or c["prefix"], c["n2"], c["offset2"])
            if err2:
                g2 = g1
        lo, hi = min(g1, g2), max(g1, g2)
        note = ""
        want = (v.get("transcript") or "").split(".")[0]
        if want and want.upper() != t.id.split(".")[0].upper():
            note = "mapped on %s%s; the report cites %s" % (
                t.id, " (MANE Select)" if t.rank == 0 else "", v.get("transcript"))
        if c["ref"] and c["alt"] and not c["op"]:
            ref = c["ref"] if t.strand == "+" else revcomp(c["ref"])
            alt = c["alt"] if t.strand == "+" else revcomp(c["alt"])
            pos = lo
            wrong = self.check_ref(t.contig, pos, ref)
            if wrong:
                note = (note + "; " if note else "") + (
                    "the genome holds %s at %s:%d where the report expects %s (the report's transcript may differ)"
                    % (wrong, t.contig, pos, ref))
        else:
            ref, alt = self.alleles_for(c["op"], t.contig, lo, hi,
                                        (c["opseq"] if t.strand == "+" else revcomp(c["opseq"])) if c["opseq"] else "")
            pos = lo
            if c["op"] in ("del", "dup", "ins", "delins"):
                # VCF anchors an indel on the base before it.
                pos = max(1, lo - 1) if c["op"] in ("del", "dup", "ins") else lo
        return {"chrom": t.contig, "pos": pos, "ref": ref, "alt": alt, "how": "HGVS c. on " + t.id,
                "note": note, "transcript": t.id}, ""

    def by_protein(self, v):
        p = parse_p(v.get("hgvs_p") or "")
        if not p:
            lab = str(v.get("label") or "")
            # A bare V600E / K27M / F508del in the label, with nothing else to go on.
            if re.search(r"\b[A-Z]\d+(?:[A-Z*]|del|dup|fs|ins)\b", lab):
                p = parse_p(re.search(r"\b[A-Z]\d+(?:[A-Z*]|del|dup|fs|ins)\w*", lab).group(0))
        if not p:
            return None, ""
        gene = str(v.get("gene") or "").strip()
        label = v.get("hgvs_p") or v.get("label") or ""
        if not gene:
            return None, "%s names no gene, so there is no protein to find the residue in" % label
        loc = self.locus(gene)
        if not loc:
            return None, "%s is not a gene in the %s annotation" % (gene, self.species)
        if not self.genome.ok():
            return None, "%s: the %s genome FASTA is not on this server, so the codon cannot be read" % (label, self.species)
        txs = [t for t in self.transcripts(gene, v.get("transcript")) if t.coding]
        if not txs:
            return None, "%s has no coding transcript in the annotation" % gene
        chosen, prot, cds = None, "", ""
        for t in txs[:4]:
            cds = self.cds_of(t)
            if not cds:
                continue
            prot = translate(cds)
            if 1 <= p["pos"] <= len(prot) and prot[p["pos"] - 1] == p["ref"]:
                chosen = t
                break
        if chosen is None:
            t = txs[0]
            cds = self.cds_of(t)
            prot = translate(cds) if cds else ""
            if not prot:
                return None, "%s: could not read the coding sequence of %s off the genome" % (label, t.id)
            if p["pos"] > len(prot):
                return None, "%s: %s is only %d residues long" % (label, t.id, len(prot))
            return None, ("%s: residue %d of %s is %s, not %s -- the report's transcript may number "
                          "differently" % (label, p["pos"], t.id, prot[p["pos"] - 1], p["ref"]))
        t = chosen
        i0 = (p["pos"] - 1) * 3            # 0-based CDS offset of the codon's first base
        codon = cds[i0:i0 + 3]
        note = ""
        want = (v.get("transcript") or "").split(".")[0]
        if want and want.upper() != t.id.split(".")[0].upper():
            note = "mapped on %s%s; the report cites %s" % (
                t.id, " (MANE Select)" if t.rank == 0 else "", v.get("transcript"))
        if p["op"] == "sub" and p["alt"]:
            # The smallest change that makes the residue: one base of the codon.
            pick = None
            for k in range(3):
                for b in "ACGT":
                    if b == codon[k]:
                        continue
                    if CODON.get(codon[:k] + b + codon[k + 1:], "X") == p["alt"]:
                        pick = (k, b)
                        break
                if pick:
                    break
            if pick is None:
                k = 0
                g = t.g_of_t(t.cds_tstart + i0 + k)
                return {"chrom": t.contig, "pos": g, "ref": "N", "alt": "N",
                        "how": "protein change on " + t.id,
                        "note": (note + "; " if note else "") + "no single-base change makes %s from %s; marked at the codon" % (p["alt"], codon),
                        "transcript": t.id}, ""
            k, b = pick
            g = t.g_of_t(t.cds_tstart + i0 + k)
            ref = codon[k] if t.strand == "+" else revcomp(codon[k])
            alt = b if t.strand == "+" else revcomp(b)
            return {"chrom": t.contig, "pos": g, "ref": ref, "alt": alt,
                    "how": "protein change on " + t.id, "note": note, "transcript": t.id}, ""
        # A frameshift, deletion, duplication or extension: the codon is the place; the
        # exact bases are not in a protein-level description.
        g_first = t.g_of_t(t.cds_tstart + i0)
        g_last = t.g_of_t(t.cds_tstart + i0 + 2)
        lo, hi = min(g_first, g_last), max(g_first, g_last)
        span = self.genome.seq(t.contig, lo, hi) or "NNN"
        if p["op"] in ("del", "fs"):
            ref, alt = "N" + span, "N"
        elif p["op"] in ("dup", "ins"):
            ref, alt = "N", "N" + span
        else:
            ref, alt = span, "N"
        return {"chrom": t.contig, "pos": max(1, lo - 1) if p["op"] in ("del", "fs", "dup", "ins") else lo,
                "ref": ref, "alt": alt, "how": "protein change on " + t.id,
                "note": (note + "; " if note else "") + "placed at codon %d; the protein description does not give the exact bases" % p["pos"],
                "transcript": t.id}, ""

    def resolve(self, v, karyotype_assembly):
        """The first path that answers wins; the reasons of the ones that failed travel."""
        reasons = []
        paths = [
            ("coordinates", lambda: self.by_coordinates(v, karyotype_assembly)),
            ("g.", lambda: self.by_hgvs_g(v)),
            ("c.", lambda: self.by_cdna(v)),
            ("p.", lambda: self.by_protein(v)),
            ("rs", lambda: self.by_rsid(v)),
        ]
        for name, fn in paths:
            try:
                placed, why = fn()
            except Exception as e:
                placed, why = None, "%s lookup failed: %s" % (name, e)
            if placed and placed.get("pos"):
                return placed, reasons
            if why:
                reasons.append(why)
        return None, reasons


# ---------------------------------------------------------------- main

def b64_of(x):
    try:
        return base64.b64decode(str(x or ""), validate=False)
    except Exception:
        return b""


content_b64 = works.param(1)
mime = str(works.param(2) or "").strip()
fname = str(works.param(3) or "").strip()
species_in = str(works.param(4) or "human").strip()
try:
    total_size = int(float(works.param(5) or 0))
except Exception:
    total_size = 0
partial = str(works.param(6) or "0").strip() in ("1", "true", "True")

species = resolve_species(species_in) or "human"
karyotype_assembly = ASSEMBLY_OF.get(species, "")

out = {
    "ok": False, "kind": "", "description": "", "genetic_content": False, "assembly": "unknown",
    "species_seen": "", "table": None, "summary": "", "subject": "", "conditions": "[]",
    "genes": "[]", "variants": "[]", "unresolved": "[]", "vcf": "", "notes": "",
    "warnings": "[]", "models": "", "error": None,
}
warnings = []

raw = b64_of(content_b64)
if not raw:
    out["error"] = "no file content was received"
    works.resolve(out)
    raise SystemExit(0)

works.msg("Reading %s (%s)…" % (fname or "the file", "%d bytes" % len(raw)))
doc = load_file(raw, mime, fname)
if doc["error"]:
    out["error"] = doc["error"]
    works.resolve(out)
    raise SystemExit(0)

# ---- 1. what is it
works.msg("Asking what kind of file %s is…" % (fname or "this"))
try:
    import claude_usage as _cu  # type: ignore
    _cu.bump("genetic-file")
except Exception:
    pass
cls, err, m1 = classify(doc, fname, mime, total_size or len(raw), partial, species)
if err or not isinstance(cls, dict):
    out["error"] = "could not classify the file: %s" % (err or "empty reply")
    works.resolve(out)
    raise SystemExit(0)

kind = str(cls.get("kind") or "other")
out["kind"] = kind
out["description"] = clean_str(cls.get("description"), 300)
out["genetic_content"] = bool(cls.get("genetic_content"))
out["assembly"] = str(cls.get("assembly") or "unknown")
out["species_seen"] = clean_str(cls.get("species"), 60)
models = [m1]

# A header that says so is not a judgement; but a table the model calls a VCF is
# handed to the VCF reader either way -- that reader is the streaming one.
if doc["form"] == "text" and re.search(r"^\s*##fileformat=VCF|^#CHROM\s+POS\s+ID\s+REF\s+ALT", doc["text"], re.M):
    kind = out["kind"] = "vcf"

seen = resolve_species(out["species_seen"])
if seen and seen != species:
    warnings.append("The file appears to be about %s; this karyotype is %s." % (out["species_seen"], species))

if kind == "vcf":
    out["ok"] = True
    out["models"] = ", ".join(m for m in models if m)
    out["warnings"] = json.dumps(warnings)
    works.msg("%s is a VCF." % (fname or "This"))
    works.resolve(out)
    raise SystemExit(0)

if kind == "variant_table":
    tb = cls.get("table") or {}
    out["table"] = json.dumps({
        "delimiter": tb.get("delimiter") or "tab",
        "header_lines": int(tb.get("header_lines") or 0),
        "comment_prefix": str(tb.get("comment_prefix") or "#")[:4],
        "chrom_col": int(tb.get("chrom_col", -1)), "pos_col": int(tb.get("pos_col", -1)),
        "ref_col": int(tb.get("ref_col", -1)), "alt_col": int(tb.get("alt_col", -1)),
        "id_col": int(tb.get("id_col", -1)), "genotype_col": int(tb.get("genotype_col", -1)),
    })
    if int(tb.get("chrom_col", -1)) < 0 or int(tb.get("pos_col", -1)) < 0:
        warnings.append("The table's chromosome and position columns could not be identified.")
    if out["assembly"] == "GRCh37" and species == "human":
        warnings.append("The table states GRCh37 (build 37 / hg19) positions; this karyotype is GRCh38. "
                        "Positions will be off by up to a few megabases and no liftover is available here.")
    out["ok"] = True
    out["models"] = ", ".join(m for m in models if m)
    out["warnings"] = json.dumps(warnings)
    works.msg("%s is a table of variants." % (fname or "This"))
    works.resolve(out)
    raise SystemExit(0)

if kind == "sequence":
    out["ok"] = True
    out["models"] = ", ".join(m for m in models if m)
    warnings.append("A sequence file has no genomic positions to draw; open it in the oligo editor instead.")
    out["warnings"] = json.dumps(warnings)
    works.resolve(out)
    raise SystemExit(0)

if kind == "other" and not out["genetic_content"]:
    out["ok"] = True
    out["models"] = ", ".join(m for m in models if m)
    out["warnings"] = json.dumps(warnings)
    works.resolve(out)
    raise SystemExit(0)

# ---- 2. what is in it
works.msg("Reading %s for genes and variants…" % (fname or "the file"))
got, err, m2 = extract(doc, fname, partial, species)
models.append(m2)
if err or not isinstance(got, dict):
    out["error"] = "could not read the file's contents: %s" % (err or "empty reply")
    out["models"] = ", ".join(m for m in models if m)
    works.resolve(out)
    raise SystemExit(0)

out["summary"] = clean_str(got.get("summary"), 600)
out["subject"] = clean_str(got.get("subject"), 120)
out["notes"] = clean_str(got.get("notes"), 600)
out["conditions"] = json.dumps([clean_str(c, 120) for c in (got.get("conditions") or []) if clean_str(c)][:20])

# The text, when there is one, is the check: a variant the document does not contain
# is one the model remembered, and it is dropped rather than drawn.
text_norm = norm(doc["text"]) if doc["form"] == "text" else ""


def in_text(*cands):
    if not text_norm:
        return None
    for c in cands:
        n = norm(c)
        if n and n in text_norm:
            return True
    return False


genes = []
seen_g = set()
for g in (got.get("genes") or [])[:MAX_GENES]:
    sym = clean_str((g or {}).get("symbol"), 40).upper()
    if not sym or sym in seen_g:
        continue
    seen_g.add(sym)
    q = in_text(sym)
    genes.append({"symbol": sym, "why": clean_str(g.get("why"), 160), "quoted": (q is not False)})

resolver = Resolver(species)
placed, unresolved, vcf_rows = [], [], []
dropped = 0
vs = (got.get("variants") or [])[:MAX_VARIANTS]
for i, v in enumerate(vs):
    v = v or {}
    gene = clean_str(v.get("gene"), 40).upper()
    label = clean_str(v.get("label"), 120) or " ".join(x for x in [gene, v.get("hgvs_c"), v.get("hgvs_p")] if x)
    q = in_text(v.get("hgvs_c"), v.get("hgvs_p"), v.get("hgvs_g"), v.get("rsid"), label, v.get("evidence"))
    if q is False:
        dropped += 1
        continue
    if gene and gene not in seen_g and len(genes) < MAX_GENES:
        seen_g.add(gene)
        genes.append({"symbol": gene, "why": "carries " + label, "quoted": True})
    works.msg("Placing %d of %d: %s…" % (i + 1, len(vs), label))
    v["gene"] = gene
    hit, reasons = resolver.resolve(v, karyotype_assembly)
    cls_key = str(v.get("classification") or "not_stated")
    if hit is None:
        unresolved.append({"label": label, "gene": gene,
                           "reason": "; ".join(reasons) if reasons else "the report gives no notation that can be mapped (no c., p., g., rs number or coordinates)"})
        continue
    sig = CLNSIG.get(cls_key, "")
    if not sig and hit.get("clinvar_sig"):
        sig = hit["clinvar_sig"]
    ref = re.sub(r"[^ACGTN]", "N", str(hit.get("ref") or "N").upper()) or "N"
    alt = re.sub(r"[^ACGTN]", "N", str(hit.get("alt") or "N").upper()) or "N"
    rec = {
        "label": label, "gene": gene, "chrom": str(hit["chrom"]), "pos": int(hit["pos"]),
        "ref": ref, "alt": alt, "classification": cls_key, "condition": clean_str(v.get("condition"), 160),
        "zygosity": clean_str(v.get("zygosity"), 40), "how": hit.get("how", ""),
        "note": clean_str(hit.get("note"), 300), "transcript": hit.get("transcript") or clean_str(v.get("transcript"), 40),
    }
    placed.append(rec)
    info = []
    if sig:
        info.append("CLNSIG=" + sig)
    if rec["condition"]:
        info.append("CLNDN=" + re.sub(r"[;=\s]+", "_", rec["condition"]))
    vcf_rows.append("\t".join([rec["chrom"], str(rec["pos"]), label.replace("\t", " "), ref, alt, ".", ".",
                               ";".join(info) or "."]))

if dropped:
    warnings.append("%d variant%s the model listed did not appear in the file's text and were dropped."
                    % (dropped, "" if dropped == 1 else "s"))
if not resolver.index.gff:
    warnings.append("The %s annotation is not on this server, so nothing could be placed by gene." % species)
elif not resolver.genome.ok() and any(v.get("hgvs_p") or "" for v in vs):
    warnings.append("The %s genome FASTA is not on this server, so protein-level changes could not be placed." % species)

out["ok"] = True
out["genes"] = json.dumps(genes)
out["variants"] = json.dumps(placed)
out["unresolved"] = json.dumps(unresolved)
out["vcf"] = "\n".join(vcf_rows)
out["warnings"] = json.dumps(warnings)
out["models"] = ", ".join(m for m in models if m)
works.msg("%s: %d gene%s, %d variant%s placed, %d not placed."
          % (fname or "Done", len(genes), "" if len(genes) == 1 else "s",
             len(placed), "" if len(placed) == 1 else "s", len(unresolved)))
works.resolve(out)
