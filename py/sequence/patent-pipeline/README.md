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
```

### GCP credentials for stage 1

Stage 1 queries `patents-public-data.patents.publications` on BigQuery. The dataset is public
and costs nothing to store; **you pay for the bytes your query scans**. Two ways in:

**BigQuery sandbox — no credit card.** Create a project at <https://console.cloud.google.com>,
open BigQuery, and query public datasets under the free 1 TiB/month. Enough to try the
pipeline; a full 2020–2026 pull may exceed it.

**A billed project — the normal route.**

```bash
# 1. gcloud CLI (Debian/Ubuntu/WSL)
sudo apt-get install -y apt-transport-https ca-certificates gnupg curl
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
  | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update && sudo apt-get install -y google-cloud-cli

# 2. sign in and pick the project
gcloud init                                  # opens a browser; choose or create a project
gcloud services enable bigquery.googleapis.com

# 3. credentials the python client will find (ADC)
gcloud auth application-default login
```

Then `--project YOUR_PROJECT_ID` (`gcloud config get-value project` prints it). Billing must be
enabled on the project for anything past the free tier: console → Billing → link an account.

**Headless / CI** — a service account instead of a browser login:

```bash
gcloud iam service-accounts create baja-patents
gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member serviceAccount:baja-patents@YOUR_PROJECT.iam.gserviceaccount.com \
  --role roles/bigquery.jobUser
gcloud iam service-accounts keys create ~/baja-patents.json \
  --iam-account baja-patents@YOUR_PROJECT.iam.gserviceaccount.com
export GOOGLE_APPLICATION_CREDENTIALS=~/baja-patents.json
```

`roles/bigquery.jobUser` is enough — the data is public, so no dataset-level grant is needed.
Treat the JSON key as a password: it is a bearer credential with no second factor.

### Cost, before you pay it

```bash
python3 1_download_patents.py --project YOUR_PROJECT --dry-run \
        --start 2020-01-01 --end 2027-01-01
```

Asks BigQuery how many bytes the query would scan and prints the estimate, without running it.

Two things worth knowing, because they are the opposite of the intuition:

- **Widening the CPC list costs nothing.** The filter runs after the scan, so 40 prefixes scan
  exactly what 10 did. It returns more rows; it does not read more bytes.
- **`--limit` does not reduce the bill.** It caps what gets written, not what gets scanned. The
  only real lever is the **date window** — `filing_date` is what prunes partitions, so
  `--start 2024-01-01` costs a fraction of `--start 2020-01-01`. Test on one year first.

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

# 2a) look at the export FIRST: which files are FASTA, which are tables, and which columns
#     map a sequence id to a patent. Writes nothing, needs no stage-1 output.
python3 2_fetch_sequences.py --source lens-patseq --patseq /path/to/PatSeq_export/ --inspect

# 2b) sequences for the filtered patents. --emit-map also writes the sequence-id ->
#     patent-number table, which is what stage 6 needs (see below).
python3 2_fetch_sequences.py --work $WORK --source lens-patseq \
        --patseq /path/to/PatSeq_export/ \
        --emit-map $WORK/record_to_patent.tsv
#   if --inspect showed the wrong columns:
#        --seq-id-col 'Sequence ID' --patent-col 'Document Number'
#   or:  --source fasta --in some_patent_sequences.fa   (headers '>PATENTNUMBER|seqid')

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

## PatSeq: how stage 2 reads a bulk export

A PatSeq export keys its FASTA records by **sequence id** and carries the sequence → patent
document mapping in a **separate table**. Stage 2 stitches the two:

1. every file under `--patseq` is sniffed — first non-blank character `>` means FASTA, anything
   else is a candidate table (PatSeq ships `.txt` files of both kinds, so the extension does not
   decide it);
2. each table is scanned for a sequence-id column and a patent-number column, matched loosely
   against `SEQ_ID_COLS` / `PATENT_COLS` and overridable with `--seq-id-col` / `--patent-col`;
3. FASTA records are keyed by that mapping, falling back to reading a patent number off the
   header for exports that put one there.

The run prints how many sequences resolved through the mapping versus the fallback. A low
number there means the wrong columns were picked — re-run `--inspect` and name them.

> Column naming is not stable across PatSeq exports, so the candidate lists are heuristics.
> `--inspect` exists so they can be checked before a long run, not after it.

`--emit-map FILE` writes the mapping on its own as `record_id <TAB> patent_number`.

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

### With PatSeq access, the mapping is recoverable

The legacy ids are very likely **PatSeq sequence record ids**. The shape fits: 3,576,653
distinct values sparse over 2..29,803,555, which is the size of a patent-sequence corpus, not of
any patent list — and column 4 holds the same value twice (`2|2|`), i.e. whatever built it had
one identifier and wrote it into both the patent and sequence slots of the
`<patent>|<seq_id>|` contract.

If that is right, the table inside a PatSeq bulk export is the missing mapping, and stage 2
already extracts it:

```bash
python3 2_fetch_sequences.py --source lens-patseq --patseq /path/to/PatSeq_export/ \
        --inspect                                     # confirm the columns
python3 2_fetch_sequences.py --work $WORK --source lens-patseq \
        --patseq /path/to/PatSeq_export/ \
        --emit-map $WORK/record_to_patent.tsv         # the mapping, on its own

python3 6_build_patent_index_meta.py \
        --bed  /bd/patent_hg38_transcript_hits.bed.gz \
        --map  $WORK/record_to_patent.tsv \
        --meta $WORK/patents_meta.jsonl \
        --out  patent_assignees.tsv
```

Stage 6 reports what fraction of the BED's 3.6M ids the map covered. **That number is the
test of the hypothesis**: a high rate means the ids really are PatSeq sequence ids and the
legacy index is rescued in place; a near-zero rate means they came from somewhere else, and
rebuilding through stages 1–5 is the way.

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
