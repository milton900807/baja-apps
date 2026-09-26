# RNA-protein coupling model

Predicts how tightly a protein's level follows its mRNA — the Spearman rho between mRNA and
protein across tumours — from the amino-acid sequence alone.

- **Target**: each protein's pan-cancer median rho over 1,350 CPTAC samples (BCM release).
- **Model served here**: LightGBM over 45 sequence features (length, composition, membrane
  and signal segments, disorder, PEST / KEN / D-box degrons, N- and C-terminal residues),
  trained on 12185 proteins. Stored as JSON trees and walked by `scorer.py` (numpy only).
- **Accuracy** (5-fold CV grouped by homology cluster): r = 0.29 with CPTAC rho,
  AUROC 0.69 separating the top from the bottom third. Against labels the model never saw:
  r = 0.29 with CCLE cell-line rho, 0.20 with Sanger.
- The fuller model (these features + ESM-2 650M embeddings) reaches r = 0.42 but needs
  torch and is not served here; it lives in ~/ml/rna-to-protein-correlation.

Export verified: numpy scorer vs LightGBM, max |diff| = 2.6e-15 over all training proteins.
Rebuild: `~/ml/rna-to-protein-correlation/.venv/bin/python src/export_baja.py` (refuses to
write if the scorer disagrees). `features.py` is a verbatim copy of the training features.

**Reading the number.** Coupling also depends on how much the mRNA varies in a given
sample set: flat mRNA cannot correlate with anything. The prediction is for a typical
tumour cohort. `measured.json.gz` holds the MEASURED rho where CPTAC quantified the
protein, which always beats the prediction when it exists.
