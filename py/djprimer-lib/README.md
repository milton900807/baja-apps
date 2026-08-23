# djprimer

qPCR assay-success prediction, packaged like `bajaclip` / `bajasplice` so it can
be imported as a library or run as a scoring service.

Given a target gene and a primer pair, djPrimer returns the probability the assay
works. primer3-style design thermodynamics form a floor; the signal that actually
decides the outcome is whether the target is expressed, brought in from bundled
per-gene expression references (GTEx tissue and Human Protein Atlas cell lines).
Use it to triage assays before the bench: rank candidates, run the high-scoring
ones first, redesign or deprioritise the bottom of the list.

Bundled artifacts (`djprimer/weights/`, ~4 MB) — no download, no reference genome:

    djprimer_model.v1.pkl              gradient-boosted classifier
    expression_gtex_per_gene.csv       per-gene GTEx tissue expression
    expression_hpa_celline_per_gene.csv  per-gene HPA cell-line expression

## Install

```bash
pip install -e .            # library + CLI
pip install -e '.[service]' # + FastAPI/uvicorn for the HTTP service
```

## Use — library

```python
from djprimer import load_model, score
m = load_model()                       # bundled model + expression tables
score("GAPDH", "CAACAGTGGCAACACCTTGTG", "TGGGTTGGTCATGCTCACTAG", m)
# {'gene': 'GAPDH', 'probability': 0.84, 'expression_known': True, 'design_only': False}

m.score_batch([("GAPDH", "CAAC...", "TGGG..."), ("HTR7", "CAGT...", "AACT...")])
```

## Use — CLI

```bash
djprimer score GAPDH CAACAGTGGCAACACCTTGTG TGGGTTGGTCATGCTCACTAG
# GAPDH: success probability 0.84
```

## Use — service

```bash
djprimer serve --host 0.0.0.0 --port 8000
# or: uvicorn djprimer.service:app --host 0.0.0.0 --port 8000
```

```
GET  /health
POST /score        {"gene": "GAPDH", "forward": "...", "reverse": "..."}
POST /score/batch  {"assays": [{"gene": "...", "forward": "...", "reverse": "..."}, ...]}
```

The model and references load once at startup. Override the bundled artifacts
with `DJPRIMER_MODEL`, `DJPRIMER_GTEX`, `DJPRIMER_HPA`.

## Notes

- The score is dominated, by design, by the target's expression. A clean primer
  for a gene that is silent in the panel scores low, which is the correct answer.
- Genes absent from the expression references fall back to a **design-only**
  estimate (flagged `design_only: true`), which is far weaker.
- The trained model also has amplicon features; those need a reference transcript
  (Ensembl) and ViennaRNA and are left missing here, which the model tolerates and
  which barely changes the score. The full training/reconstruction pipeline lives
  in `~/ml/ppset/qpcr-assay-model`.
- `joblib` pickles are scikit-learn-version-sensitive; install a compatible
  `scikit-learn` if loading warns.

Model provenance: `djprimer_model.v1`, trained on the proprietary ppset qPCR
validation database (Baja Bio) with public expression references (GTEx, Human
Protein Atlas). Research use. See `~/ml/ppset/qpcr-assay-model` for the paper,
white paper, and full pipeline.
