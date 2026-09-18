# Trained MHC class I presentation model

The neoantigen module scores peptide–HLA pairs. Until now that came from
`liverpool/lib/hla.js`, a hand-built position-specific matrix over published anchor
motifs: 19 alleles, 8 of them marked `weak`, and every row tagged `source: 'motif'` so
nobody mistook it for a trained prediction. This directory holds a trained replacement.

**It predicts presentation, not immunogenicity.** Whether a peptide reaches the cell
surface is what these files model. Whether a T cell then responds to it is a different
and much harder question, and nothing here answers it. Do not relabel the output.

## Files

| File | What it is |
|---|---|
| `presentation-model.json` | the gradient-boosted trees, the BLOSUM62 matrix, and the feature spec the scorer must reproduce |
| `presentation-alleles.json` | allele → `{g: 34-residue groove pseudosequence, t: 1 if trained on}` |
| `presentation-bg.json` | per allele and length, score quantiles of a natural-peptide background, which turn a raw score into the %rank the module already speaks |
| `presentation-fixture.json` | reference scores from the Python model; the browser scorer is checked against these |

The scorer is `liverpool/lib/presentation-model.js`. Nothing else reads these files.

## How it is wired in

`hla.js` already had the seam. `editor.js` calls:

```js
const PM = await exec('liverpool/lib/presentation-model.js');
await PM.install(HLA);          // registers via HLA.setExternalPredictor
```

`HLA.predict(allele, peptides)` then tries the model first and **falls back to the motif
screen on any failure** — a missing file, an unsupported allele, a thrown error. A design
is never blocked on this model being available. Every row carries `source` and
`confidence` all the way to the report and the CSV export:

| `source` | `confidence` | Meaning |
|---|---|---|
| `presentation-model` | `trained` | the model was fitted on eluted ligands for this allele |
| `presentation-model` | `pan-allele` | scored from groove similarity; no ligand data for this allele |
| `motif` | `good` / `fair` / `weak` | the model did not load or does not cover this allele |

## Why it runs in the browser

The production server has numpy 1.26.4 and nothing else: no LightGBM, no torch, no GPU.
So the trees ship as JSON and are walked in JavaScript. That also keeps the work off the
shared Python bridge, which runs six jobs site-wide across all users. Scoring a few
thousand peptides is a few million float comparisons, which takes well under a second.

Assets load through the app's own `/script` route, the same endpoint that serves
lionscript modules. It returns `{rule_value: "<file text>"}` and leaves filenames that
already carry an extension alone.

## Rebuilding it

From `/home/jmilton/epitope-ml`:

```bash
.venv/bin/python src/export_presentation_model.py --outdir export
cp export/presentation-*.json /home/jmilton/baja-apps/liverpool/model/
node src/verify_browser_scorer.js        # must print PASS before deploying
```

The verification step is not optional. A tree ensemble re-implemented in a second
language is exactly the kind of thing that looks right and is quietly wrong: an
off-by-one in the feature order, a `<=` that should be `<`, a transposed BLOSUM row.
`verify_browser_scorer.js` runs the browser code over the fixture peptides and fails on
any disagreement beyond float noise.

## Two things that will bite you

**Do not put these files in a directory called `data`.** `deploy-software.sh` excludes
every directory of that name, so the model would silently never reach production while
everything kept working locally. That is why this directory is `model/`.

**Do not persist state in a `__`-prefixed field.** The document serializer drops every
key beginning with an underscore, so such a flag is `null` after a reload while the
fields beside it survive. Not relevant to these files, but it is the trap next door.

## Feature layout

The scorer must build exactly 864 features in this order:

1. **9 × 20** — BLOSUM62 rows for a 9-slot groove frame
2. **4** — length one-hot for 8, 9, 10, 11
3. **34 × 20** — BLOSUM62 rows for the groove pseudosequence

The 9-slot frame mirrors `coreMap` in `hla.js`: a class I peptide of any length 8–11
binds the groove with its anchors at the same ends, so the first four residues and the
last four keep their slots and whatever lies between is a bulge. Slot 5 takes the middle
of the bulge, and an 8-mer has none, so slot 5 is a gap scoring zero. Using the module's
own assumption rather than a new one keeps the trained path and the motif fallback
talking about the same geometry.
