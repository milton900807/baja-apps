# Secretion model bundle

Served by `py/bio/protein/secretion-profile.py`, drawn by
`baja/bio/protein/secretion-profile.js`.

`secretion_light_hm.json.gz` (default) and `secretion_light.json.gz` are gradient-boosted
tree ensembles over 96 sequence features, exported to plain JSON so the server needs only
numpy: no LightGBM, joblib, pandas or scikit-learn. `scorer.py` evaluates them and also
carries the feature extraction, which must stay behaviourally identical to the training
code.

| | `light_hm` (default) | `light` |
|---|---|---|
| trained on | 36,681 human + mouse proteins | 19,412 human proteins |
| held-out AUROC | 0.951 | 0.951 |
| held-out average precision | 0.804 | 0.786 |
| yeast transfer (average precision) | 0.180 | 0.204 |

Labels: Human Protein Atlas secretome for human, UniProt subcellular location for mouse.
Evaluation holds out whole mmseqs clusters at 30% identity over the human+mouse union, so
no test protein has a relative in training. A larger variant using ESM-2 embeddings scores
0.971 AUROC but needs PyTorch and a GPU to be quick, so it is not served here.

## What the layer means

`profile[i] = P(secreted | the subsequence starting at residue i)`. It peaks over signal
peptides and signal anchors. On 480 annotated human proteins the peak falls in the first
30 residues for 90% carrying a signal peptide and 12% without one.

It does **not** separate secreted from ER- or membrane-retained proteins: mean score over
the first 20 residues is 0.52 for secreted and 0.55 for retained. Proteins exported
without a signal peptide score near zero. Single-pass receptors score high.

## Regenerating

Source project: `/home/jmilton/hpa-secretome` (training, evaluation, full write-up).

```bash
cd /home/jmilton/hpa-secretome
.venv/bin/python src/export_model.py --model light_hm     # refuses to write unless the
.venv/bin/python src/export_model.py --model light        # export reproduces the model
cp models/secretion_light*.json.gz deploy/secretion_model.py \
   /home/jmilton/baja-apps/py/bio/protein/secretion_model/
```

`deploy/secretion_model.py` becomes `scorer.py` here. The bundle is ~600 KB and ships with
the normal `deploy-software.sh` code sync; it does not need `--data`.
