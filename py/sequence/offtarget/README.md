# Off-target service (2-bit indexes + Levenshtein ≤ 3)

Local, self-hosted off-target search for short oligos (8–25 nt) against
reference transcriptomes. Replaces the external "levenshtein worker": when a
reference FASTA is downloaded, `baja-server` builds a compact **2-bit + seed
index**; `search.py` finds every site within **Levenshtein (edit) distance ≤ 3**,
on both strands, using only **numpy**.

## Files

- `build-index.py` — FASTA(`.fa.gz`) → on-disk index (run once per reference).
- `search.py` — query the index for off-targets (spawned per request).

## Index layout

One directory per index name under `$OFFTARGET_INDEX_DIR`
(default `baja-server/reference_data/offtarget_index/`):

```
<name>/
  meta.json            # {name, W, seqLen, nContigs, packing, dtype_pos, source, sha1, built}
                       #   written LAST -> its presence means "index complete"
  seq.pack             # packed 2-bit sequence, uint8, 4 bases/byte (A=0 C=1 G=2 T=3; N->0)
  contigs.json         # [{name, length, offset}]  (offset = global start of the contig)
  contig.off.npy       # int64 (nContigs+1,) cumulative contig offsets
  nmask.iv.npy         # int64 (M,2) half-open [start,end) N / non-ACGT runs
  kmer.offsets.npy     # int64 (4**W + 1,) CSR prefix sums of the W-mer seed index
  kmer.positions.npy   # int32|int64 global start positions grouped by W-mer code
```

`seq.pack` ≈ seqLen/4 bytes; `kmer.positions` ≈ 4×seqLen bytes (the dominant
artifact). A ~440 Mbp transcriptome → ~1.8 GB, builds in ~80 s, ~24 GB peak RAM.

## Build an index

```bash
python3 build-index.py <fasta.fa.gz> <index_root> <name> [--W 8]
# e.g.
python3 build-index.py reference_data/human.gencode.transcripts.fa.gz \
        reference_data/offtarget_index human_cdna
```

Requires **numpy**. `--W` is the seed length (default 8; 4096^… buckets = 4**W).
The source FASTA is uppercased and `U→T` normalized; soft-masked (lowercase)
bases are kept (repeat off-targets are real); windows overlapping N-runs or
crossing contig boundaries are excluded from the seed index.

`baja-server` builds indexes automatically: `ensureFastaFile` (src/index.ts)
fires `ensureOffTargetIndex(fasta, deriveIndexName(species,label))` whenever a
reference FASTA becomes available (fresh download or already present).

## Query

`search.py` is invoked one-shot via the ionworks `jfile:` convention:

```
python3 search.py jfile:<args.json>
```

where `args.json` maps positional params:

```json
{ "1": "human_cdna"          | ["human_cdna", "..."],   // index name(s)
  "2": [ {"id": 1, "synthesisSequence": "ACGT..."} ],   // oligoQuery
  "3": 3,                                                // editDistance (0..3)
  "4": "+-",                                             // strand: + | - | +-
  "5": "editdistance" }                                  // runMode (optional)
```

It prints one `IONWORKS:RESOLUTION:\t<json>` line:

```json
{ "oligoQuery": [ { "id": 1, "synthesisSequence": "ACGT...",
      "offtarget": [ {"chr","start","end","strand","editdistance"} , ... ] } ],
  "warnings": [ {"id","reason"} ], "editdistance": 3, "strand": "+-" }
```

Coordinates are **0-based, half-open**; exact for substitutions, ±k for indels.
`id`s round-trip so the client can match by `String(id)`.

### Index-name resolution & aliases

`search.py` resolves a name to `$OFFTARGET_INDEX_DIR/<name>/`. Legacy / UI names
are mapped by `_ALIASES` (mirrored in `baja-server` `OFFTARGET_ALIASES`), e.g.
`Homo_sapiens.GRCh38.88.3utr → human_cdna`. Keep the two alias tables in sync.

Naming convention from a reference: `deriveIndexName(species,label)` →
`human_cdna`, `human_ncrna`, `mouse_cdna`, `rat_ncrna`, … (`label` ∈
`cdna`/`ncrna`).

## Algorithm

Pigeonhole **seed-and-verify**: split the query into k+1 disjoint seeds; at
least one matches exactly under ≤k edits. Look up each seed's W-mer anchor in
the CSR index, back-shift to a predicted oligo start, then **bulk-decode all
candidate windows and run a vectorized fitting edit-distance alignment across
all candidates at once** (numpy) to keep verification fast. Reverse-complement
of the query yields the `-` strand. Hits are greedy-deduped per (chr, strand).

**Limits (honest caveats):**
- Very short oligos (≈8–12 nt) at k=3 are ~37% divergence — they match a huge
  fraction of the reference and cannot be seeded with guarantees. These return
  a count above the client's 1000-hit threshold (rendered as a count label) plus
  an `approximate` warning, rather than an exhaustive list.
- Candidate volume above `CANDIDATE_GUARD` short-circuits to a count sentinel.
- Whole-genome (≫2 Gbp) DNA is out of scope for this local path (positions array
  would be ~25 GB); it stays on the external-worker fallback. This service
  targets transcriptomes (cDNA/ncRNA).

## Performance

numpy-only. On the ~440 Mbp `human_cdna` index (warm page cache): ~0.1 s/oligo;
10 oligos in ~1 s, ~300 MB RSS (the index is `mmap`'d, not loaded).

## Runtime requirement

The `python3` that `baja-server` spawns must have **numpy** installed
(`py/requirements.txt` lists it). No other dependency is required — the C
distance libraries are intentionally not used.
