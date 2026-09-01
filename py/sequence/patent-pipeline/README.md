# ASO / siRNA / gene-therapy patent-sequence pipeline (2020–2026)

Builds the two files the app's patent layer consumes, for **antisense oligonucleotide (ASO),
siRNA, and gene-therapy** patents filed/published **2020–2026**, with **all metadata**:

```
aso_sirna_gt_2020_2026_hg38_transcript_hits.bed.gz   # sequence hits, transcript-keyed
aso_sirna_gt_2020_2026_meta.tsv                        # patent id -> packed metadata label
```

Drop both into the server's `BIG_DATA` dir (`/home/ubuntu/baja-bd`, i.e. the app's `/bd/`) and
the **"ASO / siRNA / gene therapy (2020–2026)"** menu item renders them: colored patent bars at
gene scale, and — zoomed in far enough to see the base sequence — a full metadata callout per
hit (patent number, title, filing date, assignee, inventors, gene/locus/strand).

This directory is the pipeline. **You run it** where you have data access; the app already knows
how to read the outputs. Nothing here needs to run on the app server.

---

## Output contract (what the app expects — do not change without updating the frontend)

### 1. BED — `aso_sirna_gt_2020_2026_hg38_transcript_hits.bed.gz`
Transcript-keyed, transcript-relative, 6 columns, **sorted by (col1, col2)** then bgzipped:

```
<transcript_id>\t<tx_start>\t<tx_end>\t<patent_number>|<seq_id>|\t0\t<strand>
ENST00000254108\t512\t531\tUS20210123456A1|S12|\t0\t+
```
- `transcript_id`  Ensembl transcript id (version optional — the reader strips it).
- `tx_start/tx_end`  0-based half-open, in transcript (cDNA) coordinates.
- col4  `<patent_number>|<seq_id>|` — the app takes `split('|')[0]` as the join key.
- `strand`  `+` / `-` (strand of the hit on the transcript).

`read-bed-region.py` auto-builds a bgzip+tabix index on first use, so plain sort+bgzip is enough.

### 2. Metadata TSV — `aso_sirna_gt_2020_2026_meta.tsv`
Two columns, **id → packed label**. The app joins it by patent number and shows the packed
fields as separate lines. Fields are joined by `‖` (U+2016), never a tab or `|`:

```
<patent_number>\t<number>‖<title>‖<filing_date>‖<assignee>‖<inventors>
US20210123456A1\tUS20210123456A1‖Antisense oligomers for …‖2020-06-02‖Ionis Pharmaceuticals‖Bennett; Swayze
```
Header row is auto-skipped by the reader. Any literal `|`, `\t`, or `‖` inside a field must be
stripped/replaced (the builder does this).

---

## Stages

| # | Script | Does | Needs |
|---|--------|------|-------|
| 1 | `1_download_patents.py` | 2020–2026 US patents filtered to ASO/siRNA/GT (CPC + keywords) → metadata JSONL | Google Patents on BigQuery (GCP project + auth) |
| 2 | `2_fetch_sequences.py` | disclosed sequences for those patents → FASTA (`>number|seqid`) | a patent-sequence source (Lens PatSeq bulk, or EBI-ENA, or a local export) |
| 3 | `3_align_to_transcripts.py` | align sequences to an hg38 transcript FASTA → transcript-keyed BED | Ensembl cDNA+ncRNA FASTA; `minimap2` for long, built-in matcher for short oligos |
| 4 | `4_build_metadata_tsv.py` | metadata JSONL → the 2-col packed TSV | stage-1 output |
| 5 | `5_package.sh` | sort + bgzip the BED, name both outputs, print deploy commands | `bgzip` (htslib) |

Run in order; each writes into `--work` (default `./out`).

---

## Prerequisites

```bash
python3 -m pip install google-cloud-bigquery google-cloud-bigquery-storage pandas pyarrow tqdm biopython edlib
# aligners / htslib:
#   minimap2   (long/gene-therapy constructs)   https://github.com/lh3/minimap2
#   bgzip      (htslib)                          sudo apt-get install tabix
# GCP auth for stage 1:
gcloud auth application-default login     # or set GOOGLE_APPLICATION_CREDENTIALS=<sa.json>
```

Reference transcriptome for stage 3 (hg38 / GRCh38), concatenate cDNA + ncRNA:
```bash
wget https://ftp.ensembl.org/pub/release-112/fasta/homo_sapiens/cdna/Homo_sapiens.GRCh38.cdna.all.fa.gz
wget https://ftp.ensembl.org/pub/release-112/fasta/homo_sapiens/ncrna/Homo_sapiens.GRCh38.ncrna.fa.gz
zcat Homo_sapiens.GRCh38.cdna.all.fa.gz Homo_sapiens.GRCh38.ncrna.fa.gz | gzip > grch38_transcripts.fa.gz
```

---

## Run

```bash
cd py/sequence/patent-pipeline
WORK=./out

# 1) patents + metadata (2020-01-01 .. 2026-12-31, ASO/siRNA/GT)
python3 1_download_patents.py --project YOUR_GCP_PROJECT \
        --start 2020-01-01 --end 2027-01-01 --work $WORK

# 2) sequences for the filtered patents (pick a source; see the script's --source help)
python3 2_fetch_sequences.py --work $WORK --source lens-patseq \
        --patseq /path/to/PatSeq_export/            # a Lens PatSeq bulk export dir
#   or: --source fasta --in some_patent_sequences.fa   (headers '>PATENTNUMBER|seqid')

# 3) align to transcripts -> BED
python3 3_align_to_transcripts.py --work $WORK \
        --transcripts grch38_transcripts.fa.gz --max-mismatch 2

# 4) metadata TSV
python3 4_build_metadata_tsv.py --work $WORK

# 5) package + deploy hints
bash 5_package.sh --work $WORK
```

`5_package.sh` prints the exact `scp`/`mv` to place both files in `/bd/` on the app server.

---

## Scope / accuracy notes
- **CPC filter** (see stage 1): `C12N15/11`, `C12N15/111`, `C12N15/113` (antisense/RNAi),
  `A61K31/7088`, `A61K31/712`, `A61K31/713` (oligonucleotide actives), `C12N15/86`,
  `C12N2750/14143`, `A61K48/00` (gene therapy / AAV). Tune in `CPC_PREFIXES` / `KEYWORDS`.
- **Short-oligo alignment**: ASO/siRNA are 15–25 nt — matched exactly and within
  `--max-mismatch` edits (both strands); a 20-mer at ≤2 mismatches is specific enough. Longer
  gene-therapy constructs (transgenes, guides+scaffold, AAV cassettes) go through `minimap2`.
- **Sequences are only as complete as the source.** Not every patent lists machine-readable
  sequences; PatSeq/ENA coverage of very recent (2025–2026) filings lags. The BED reflects what
  the source has; the metadata TSV still carries every filtered patent.
- Everything downstream (the on-zoom metadata callout, lane packing, exon-splitting) is already
  built in `baja/data/bed-hits.js` — you only produce the two files.
