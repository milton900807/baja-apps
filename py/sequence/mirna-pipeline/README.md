# miRTarBase validated miRNA target-site layer

Builds the files the app's **microRNA** data menu consumes, so any transcript track can show
where experimentally validated miRNAs bind it:

```
mirtarbase10_hsa_strong_hg38_transcript_hits.bed.gz   # reporter / western evidence
mirtarbase10_hsa_all_hg38_transcript_hits.bed.gz      # + CLIP tier + tested-negative pairs
mirtarbase10_hsa_meta.tsv                             # MIRT id -> packed metadata label
```

Drop all three into `BIG_DATA` (`~/baja-bd`, the app's `/bd/`) and the two **microRNA** menu
items in `baja/data/data-loading-toolbar.js` render them through the shared
`baja/data/bed-hits.js` loader: colored site bars at gene scale, and, zoomed in far enough to
read the bases, a callout naming the miRNA, gene, evidence tier, assays and PMIDs.

---

## Why a pipeline is needed

miRTarBase publishes each interaction with the target site's **sequence**, never a coordinate.
Stage 1 locates every site string inside the transcripts of its annotated target gene and emits
transcript-relative intervals, which is exactly the format `read-bed-region.py` and the
patent layer already speak.

The site strings are RNA, and reporter **mutant** constructs mark their mutated bases in
lowercase. The builder uppercases and maps U to T, so a mutant simply fails to match the
reference and drops out instead of being placed at a real site.

## Run

```bash
python3 1_build_target_site_bed.py \
  --sites       ~/ml/clinical_compounds/data/raw/mirna/mirtarbase10_MicroRNA_Target_Sites.csv \
  --transcripts ~/baja-server/reference_data/human.gencode.transcripts.fa.gz \
  --out         ./out
cp out/mirtarbase10_hsa_* ~/baja-bd/
```

`--sites` comes from miRTarBase 10.0 (`MicroRNA_Target_Sites.csv`); the fetcher that keeps a
local copy is `src/fetch_mirna.py` in the clinical_compounds project. `--transcripts` is the
same GENCODE transcript FASTA the server already ships in `reference_data/`, so transcript ids
and cDNA coordinates line up with the tracks by construction.

Runtime is about 20 s and the outputs are small (249 KB / 6.7 MB / 24 MB).

**Re-deploying?** `read-bed-region.py` caches its bgzip+tabix index by filename and does not
check mtime, so delete the stale index or the app keeps serving the old intervals:

```bash
rm -f ~/baja-bd/cache/tabix/mirtarbase10_hsa_*
```

## What the current build contains

| | |
|---|---|
| human rows read | 669,108 (of 746,060 across all species) |
| rows with a usable site string | 665,879 |
| (interaction, site) pairs located in a transcript | 429,711 of 514,609 (83.5%) |
| intervals, strong-evidence BED | 24,347 |
| intervals, full BED | 903,832 |
| interactions in the metadata TSV | 245,271 |

The 16.5% that do not place are reporter mutants, sites from UTR versions the current reference
no longer carries, and a few promoter/non-transcript sites. Nothing is placed approximately:
the match is exact, or the row is dropped.

## Output contract

### BED (both files)
Transcript-keyed, transcript-relative, 6 columns, sorted by (col1, col2), bgzipped:

```
<transcript_id>\t<tx_start>\t<tx_end>\t<miRTarBase id>|<miRNA>|\t0\t+
ENST00000371953\t2077\t2101\tMIRT053778|hsa-miR-382-5p|\t0\t+
```
`read-bed-region.py` takes `split('|')[0]` (the MIRT id) as the metadata join key and builds its
own bgzip+tabix index on first use.

Different papers report slightly different windows for the same site, so a window fully
contained in a wider window of the same interaction is dropped (`--keep-contained` keeps them).
That is what takes the full set from 1.37 M raw intervals to 904 K, without inventing a
coordinate: every interval written is a window some paper reported.

### Metadata TSV
`id \t label`, with the label packed by `‖` (U+2016) in the order the frontend's `fields` config
names them:

```
MIRT053778   hsa-miR-382-5p‖PTEN‖Functional MTI‖ELISA, Luciferase reporter assay, …‖24914051‖MIRT053778
```
A header row is required: `ensure_assignee_db` in `read-bed-region.py` skips the first row when
its id does not start with a digit, so without one the first interaction would be lost.

## Evidence tiers, and why there are two BEDs

miRTarBase's tiers are not equivalent, so they are not mixed silently:

- **strong** — `Functional MTI` without the `(Weak)` qualifier: reporter assay and/or western
  blot on that specific miRNA-gene pair.
- **all** — every human row, adding the CLIP-derived `(Weak)` tier (the bulk of the database)
  and `Non-Functional MTI` rows, which are pairs that were tested and did **not** repress. Those
  are real negative results, not failures, and the callout's Evidence line names the tier.

## Verify a build without the app

```bash
BIGDATA=~/baja-bd PYTHONPATH=~/baja-apps/py/ion-lib ~/.venv/bin/python \
  ~/baja-apps/py/data/read-bed-region.py \
  /bd/mirtarbase10_hsa_strong_hg38_transcript_hits.bed.gz ENST00000371953 0 9000 1 \
  /bd/mirtarbase10_hsa_meta.tsv
```
PTEN (ENST00000371953) should come back with its 3'UTR sites, each label already joined, e.g.
`hsa-miR-26a-5p‖PTEN‖Functional MTI, Non-Functional MTI‖…‖MIRT001095`.
