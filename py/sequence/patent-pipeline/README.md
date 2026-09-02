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

# 0) read the filter before paying for the query. Needs no GCP setup at all.
python3 1_download_patents.py --project - --print-scope

# 1) patents + metadata (2020-01-01 .. 2026-12-31)
#    --preset wide (the default) is nucleic-acid medicine broadly; --preset core reproduces
#    the original antisense/RNAi/GT filter exactly.
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

### The CPC filter, and the two presets

`--preset core` is the original filter — 10 CPC prefixes, 16 keywords — kept so an earlier run
can be reproduced exactly. `--preset wide` is now the **default**: 40 prefixes and 37 keywords,
adding the rest of nucleic-acid medicine, which the core list caught only when a patent happened
to also carry an antisense code.

| added | covers |
|---|---|
| `C12N15/115`, `/117`, `/10`, `/63`, `/85`, `/87`, `/88`, `/90`, `/907` | aptamers, CpG immunostimulatory oligos, preparation, non-viral introduction, site-specific integration |
| `C12N9/22`, `C12N2310/20`, `C12N2800/80` | gene editing — Cas nucleases, guide RNA, editing uses |
| `C12N15/861`, `/864`, `/867`, `C12N2740/15043`, `C12N2750/14` | adenoviral, AAV, lenti / retroviral vectors in detail |
| `A61K31/711`, `/7105`, `/7115`, `/7125`, `A61K48/005`, `/0058` | DNA and RNA actives (mRNA therapeutics sit in `/7105`) |
| `C07H21`, `A61K47/54`, `/549`, `C12N2320` | backbone and sugar chemistry, conjugates (GalNAc), delivery uses |
| `A61K9/127`, `/51`, `/5123` | liposome / lipid-nanoparticle formulation |

Core is a strict subset of wide, so widening is monotonic: nothing that matched before stops
matching.

**Deliberately excluded: `C12Q1/68*`** (nucleic-acid assays). It is the largest neighbouring
class and almost entirely diagnostics — every PCR and genotyping patent — so it multiplies the
result set without adding therapeutic sequence art. If a diagnostics index is ever wanted, add
it with `--cpc-add C12Q1/68` and build it as its OWN index rather than folding it into this one.

**Keywords are the expensive half.** They are OR'd with the CPC predicate, so one loose term
does more to the result size than the entire CPC list. `mRNA`, `conjugate`, `nanoparticle` and
`vector` are kept out for that reason — each appears in a large share of all molecular-biology
abstracts. The specific phrasings used instead (`lipid nanoparticle`, `self-amplifying RNA`)
carry the same scope without the noise.

Scope is settable from the command line, so widening it again is a flag rather than an edit:

```bash
--preset core|wide            # the two built-in scopes
--cpc      A,B,C              # replace the preset's CPC list
--cpc-add  C12Q1/68           # add to it
--keywords a,b,c              # replace the keyword net
--print-scope                 # print the filter and stop; no BigQuery, no credentials
```
- **Short-oligo alignment**: ASO/siRNA are 15–25 nt — matched exactly and within
  `--max-mismatch` edits (both strands); a 20-mer at ≤2 mismatches is specific enough. Longer
  gene-therapy constructs (transgenes, guides+scaffold, AAV cassettes) go through `minimap2`.
- **Sequences are only as complete as the source.** Not every patent lists machine-readable
  sequences; PatSeq/ENA coverage of very recent (2025–2026) filings lags. The BED reflects what
  the source has; the metadata TSV still carries every filtered patent.
- Everything downstream (the on-zoom metadata callout, lane packing, exon-splitting) is already
  built in `baja/data/bed-hits.js` — you only produce the two files.

---

## Stage 6 — the legacy `patent_hg38_transcript_hits.bed.gz` index

The three patent BEDs in `BIG_DATA` do not agree about what column 4 holds:

```
aso_sirna_gt_hg38_transcript_hits.bed.gz   ENST…  3620 3640  12186406|12186406|  0 +
lipid_patents_hg38_transcript_hits.bed.gz  ENST…   202  265  10859585|10859585|  0 +
patent_hg38_transcript_hits.bed.gz         ENST…  1172 1191         2|2|         0 -
```

The first two carry real US patent numbers and ship an assignees TSV each, so the app resolves
them to `US<number> <ASSIGNEE>`. The third — 160 MB, the oldest of the three, and the one the
**Patents** layer loads — carries a bare integer. Over the whole file:

| | |
|---|---|
| rows | 21,439,407 |
| distinct ids | 3,576,653 |
| range | 2 .. 29,803,555 |

Sparse across ~30M, so it is a **record id** from whatever patent-sequence database that BED was
built against: not a row index into any small table, and not a patent number. Nothing in this
repository or on the app server maps it to a patent — there is no `patent_assignees.tsv`, and
the producer of that BED is not in the repo. **That mapping has to come from the source
database.** Until it does, a hit from this index can be shown honestly (locus, transcript,
window, strand — see `baja/data/patents.js`) but cannot name its patent.

`6_build_patent_index_meta.py` does the half that can be automated:

```bash
# What is actually in the BED — no map or metadata needed.
python3 6_build_patent_index_meta.py --bed /bd/patent_hg38_transcript_hits.bed.gz --probe

# Build the TSV, once you have the record_id -> patent_number mapping.
python3 6_build_patent_index_meta.py \
    --bed  /bd/patent_hg38_transcript_hits.bed.gz \
    --map  record_to_patent.tsv \
    --meta patents_meta.jsonl \
    --out  patent_assignees.tsv
```

`--meta` takes the stage-1 `patents_meta.jsonl`, or any JSONL/TSV/CSV keyed by
`publication_number`. Without `--map` the script exits rather than writing a file of labels that
name nothing, and it reports every shortfall (ids with no mapping, patents with no metadata) so
a thin file is visibly thin.

**The join key is the record id, not the patent number.** `read-bed-region.py` joins on
`col4.split('|')[0]`, which for this index is the record id — so column 1 of the output is that,
the opposite of stage 4, whose BEDs already carry patent numbers.

Deploy:

```bash
scp patent_assignees.tsv ubuntu@<server>:/home/ubuntu/baja-bd/
# then in baja/data/patents.js:  const ASSIGNEES = '/bd/patent_assignees.tsv';
```

The expansion of the packed `number‖title‖date‖assignee‖inventors` form is already wired in
`patents.js`, so setting that path is the only frontend change.

### The alternative worth weighing first

Stages 1–5 already produce an index **with** real numbers and full metadata
(`aso_sirna_gt_*`, built Aug 2025), covering exactly the ASO / siRNA / gene-therapy art this
app is about. Re-running them over a wider CPC filter would replace the legacy index with one
that needs no record-id mapping at all — likely less work than recovering a mapping for
3.6M ids, and it retires 160 MB of unattributable hits.
