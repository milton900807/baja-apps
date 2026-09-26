# mRNA → protein transfer model (v2)

For a protein, predicts two numbers from sequence (protein and mRNA):

- **transfer**: how much the protein changes when its mRNA changes. It is the log–log
  slope of protein on mRNA across samples, normalized so the typical gene = 1.0. Below 1
  the protein is buffered (RPL5: 0.27); above 1 it is responsive.
- **rho**: how reliably protein follows mRNA (Spearman across samples).

## Labels

Consensus of 7 paired mRNA/protein studies, 11,039 proteins:
- CPTAC (10 cancer types)
- CCLE and Sanger cell lines
- TCGA breast, ovarian (JHU and PNNL labs) and colorectal tumours
- NCI-60

Each study's slopes are divided by its median gene (mass-spec methods compress ratios
differently), then combined. Weights are samples (capped at 200) × each study's agreement
with the other studies.

## Model

ESM-2 650M embedding → ridge, then LightGBM over that plus 45 protein features and 78 mRNA
features (UTR lengths and GC, codon usage and CAI, uORFs, Kozak, AU-rich / Pumilio /
polyA elements). Accuracy with whole homology clusters held out (Spearman):

| | transfer | rho |
|---|---|---|
| full model (served by lookup) | 0.49 | 0.52 |
| protein-feature fallback (live) | 0.33 | 0.34 |

## Files

- `precomputed_v2.npz`: the full model for every GENCODE v50 protein (239,267), keyed by
  the first 64 bits of the sequence md5, with each protein's gene.
- `model_v2.json.gz`: the fallback trees (thresholds at full precision) and the
  calibration of both models.
- `measured_v2.json.gz`: per gene, the consensus transfer and rho, the number of studies,
  and each study's own transfer, rho and sample count.
- `halflife.json.gz`: consensus mRNA half-life (49 datasets, Agarwal & Kelley 2022; HeLa
  hours from Tani et al. 2012).
- `scorer.py`: numpy-only scorer. `features.py` is a verbatim copy of the training
  features.

Rebuild from `~/ml/rna-to-protein-correlation`:

```bash
src/final_v2.py
src/precompute_v2.py
src/export_baja_v2.py
```

`export_baja_v2.py` refuses to write unless:
- the tree walker reproduces LightGBM to 1e-9 (it does to 6e-15);
- the lookup matches the deployed model on the training proteins (exactly);
- there are no key collisions.

The result's `source` field says which model answered: `full` (lookup) or `fallback`
(live).
