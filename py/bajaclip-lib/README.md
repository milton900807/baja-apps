# bajaclip

RNA-binding-protein footprint prediction from sequence, packaged like
`bajasplice` so the same track-layer / sashimi visualisation can be driven from
an RBP model instead of a splicing model.

A sphere-CNN scores a 64-nt window for 170 RBPs (sigmoid probability per RBP).
Sliding the window across a sequence yields a per-position binding profile for a
chosen RBP (e.g. TARDBP / TDP-43). Trained on ENCODE eCLIP + POSTAR3 — it's
sequence-intrinsic binding potential (where to look), best at the region level,
strongest for the ~48 "reliable" RBPs (held-out AUROC >= 0.90).

Bundled weights (`bajaclip/weights/bajaclip_predict.v1.pt`, ~7.6 MB) — no
download, no reference genome needed.

## Use

```python
from bajaclip.scan import load_model, scan_sequence, resolve_rbps
m = load_model()                       # bundled checkpoint
names, cols = resolve_rbps(m, "TARDBP")   # 'all' | 'reliable' | comma list
centers, scores = scan_sequence(m, "ACGUACGU...", cols, step=8)
# centers: window-centre positions (0-based); scores: (n_windows, len(cols))
```

Override the checkpoint with the `BAJACLIP_CKPT` env var. The list of reliable
RBPs is in `bajaclip/weights/reliable_rbps.tsv` (or `BAJACLIP_RELIABLE`).

Model provenance: `bajaclip_predict.v1` from the BajaCLIP Predict bundle
(`~/ml/beta/rbp_gene_scan_bundle_*`). Research use only.
