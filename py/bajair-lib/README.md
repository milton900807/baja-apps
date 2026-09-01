# bajair

Intron retention propensity from sequence, packaged like `bajasplice` and
`bajaclip` so the same track layer can be driven by it.

Given a genome and an annotation, it scores how retention-prone each intron is.
No reads, no expression data. Twenty features: fifteen describing intron
geometry, five frozen BajaSplice splice-site scores. Intron length and GC do
most of the work.

## What it answers, and what it does not

**"Is this intron retention-prone in general"** — yes. **"Is it retained in this
sample"** — no, and not fixably: sequence is constant across conditions and
retention is not. CLK1, the textbook detained-intron gene, sits at the 32nd
percentile because its retention is stress-dependent and its cross-tissue mean
is low. That is the model behaving correctly.

## How good it is

| | AUC | top 1% precision | lift |
|---|---|---|---|
| well-annotated introns, held out | 0.83 | 31% | 9.4x |
| VastDB, fully independent | 0.63 | 70%* | 2.2x |

\* against VastDB's own 31.7% base rate, which is already enriched.

Use the rank, not the number: held-out correlation with the measured retention
level is about 0.2. Trained on 186 ENCODE long-read BAMs across 74 groups,
holding out chr1, 3, 5, 7 and 9 — BajaSplice's split, shared because five
features come from its frozen splice-site model.

## Use

Through the bajasplice adapter, which supplies the splice-site scores:

```python
from bajasplice.bajair import score_gene

for h in score_gene("UNC13A"):          # [] when nothing clears the tier
    print(h["tier"], h["text"])
```

As a track layer:

```bash
bajasplice plot --gene UNC13A --retention --no-scores --png unc13a.png
```

The layer is **omitted entirely** when no intron clears the tier, so a gene with
nothing retention-prone draws nothing rather than an empty axis. The payload's
`meta.bajair` still records that the model ran, so "nothing shown" stays
distinguishable from "never ran".

## Tiers

A score is reported only if it reaches a tier. Each tier's precision is
measured, not asserted, against long-read retention on held-out chromosomes:

| tier | threshold | precision | lift over the 3.3% background |
|---|---|---|---|
| exceptional | 0.410 | 39% | 11.8x |
| strong | 0.324 | 36% | 10.9x |
| notable (default) | 0.155 | 23% | 7.1x |
| elevated | 0.100 | 17% | 5.2x |

Thresholds sit at the 99.5th, 99th, 95th and 90th percentile of this model's own
score distribution over the clean stratum. Precision is measured on chr1, 3, 5,
7 and 9 only, which the model never trained on — an earlier calibration mixed
in-sample chromosomes and advertised 44% for the top tier against a held-out 39%.

Even the top tier is right under 40% of the time. Descriptions say so rather
than rounding it away — this produces a shortlist, not a call.

`clean_only=True` (the default) keeps MANE introns with both splice sites above
0.9. Turning it off fills the top of any ranking with minor-transcript introns,
which the model recognises as poorly annotated rather than as retention-prone.
That is a property of the training annotation, not a finding about the gene.

## Layout

```
bajair/
  features.py   GTF or exon table + FASTA -> introns with geometry
  model.py      load the bundled model, place a score on the calibration
  describe.py   turn a scored intron into a written description
  scan.py       score, filter to a tier, describe; empty list is a normal answer
  weights/      model, held-out metrics, measured tier calibration
```

Splice-site features are not computed here — bajair stays free of torch. They
arrive from `bajasplice/bajair.py`, the same adapter shape BajaCLIP uses.

## Provenance

Built in `~/ml/retained_introns`, which holds the training pipeline, the
controls, and the genome-wide ranking of all 696,803 GENCODE v50 introns.
Research use only.
