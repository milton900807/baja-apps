"""Adapter for an external BajaCLIP eCLIP binding predictor bundle.

The bundle is optional. Point at it with

    bajasplice config --bajaclip-bundle /path/to/rbp_gene_scan_bundle_... --save

Only the bundle's model definitions and encoders are borrowed; everything else
is done here so the rest of the package has no sys.path surprises.

A caveat worth knowing before using the scores: the two shipped checkpoints
differ a lot in how RBP-specific they are. Measured against held-out eCLIP
windows with a matched-vs-mismatched control (positives of RBP k scored with
RBP j's channel), `lowfdr` separates a bound site from OTHER RBPs' bound sites
at AUROC 0.698 vs 0.516 mismatched, while `enhanced.final` manages only 0.598
vs 0.536. Prefer `lowfdr` wherever RBP identity matters.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np

from bajasplice.config import paths

_MODULE = None

MODELS = {
    "lowfdr": "models/low_fdr_models/rbp_binding_model.64.lowfdr.pt",
    "lowfdr_noposweight": "models/low_fdr_models/rbp_binding_model.64.lowfdr.noposweight.pt",
    "enhanced": "models/enhanced_models/rbp_binding_model.64.enhanced.pt",
    "enhanced_final": "models/enhanced_models/rbp_binding_model.64.enhanced.final.pt",
}
DEFAULT_MODEL = "lowfdr"


def _bundle() -> Path:
    return Path(paths().require("bajaclip_bundle"))


def _impl():
    """Load the bundle's helper module once, without polluting sys.path globally."""
    global _MODULE
    if _MODULE is None:
        wf = _bundle() / "workflow"
        target = wf / "find_3utr_all_rbp_sites.py"
        if not target.exists():
            raise FileNotFoundError(f"bundle helper not found: {target}")
        sys.path.insert(0, str(wf))
        try:
            spec = importlib.util.spec_from_file_location("_bajaclip_impl", target)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _MODULE = mod
        finally:
            try:
                sys.path.remove(str(wf))
            except ValueError:
                pass
    return _MODULE


def model_path(which: str = DEFAULT_MODEL) -> Path:
    if which in MODELS:
        return _bundle() / MODELS[which]
    p = Path(which)
    if p.exists():
        return p
    raise ValueError(f"unknown BajaCLIP model '{which}'; choose from {sorted(MODELS)} or give a path")


def load(which: str = DEFAULT_MODEL, device="cpu"):
    """Returns (model, proteins, max_len, model_type, sphere_motifs)."""
    return _impl().load_model(str(model_path(which)), device)


def encode(seq: str, max_len: int):
    return _impl().encode_seq(seq, max_len)


def sphere_features(seq: str, motifs):
    return _impl().sphere_features(seq, motifs)


def score_sequences(seqs, which=DEFAULT_MODEL, device="cpu", batch=4096, as_logits=False):
    """Score a list of sequences for every RBP the model knows.

    as_logits keeps the pre-sigmoid values. The probabilities saturate badly on
    genomic windows (median ~0.99), though note that switching to logits does
    not recover RBP specificity: the channels remain highly correlated.
    """
    import torch
    model, proteins, max_len, mtype, motifs = load(which, device)
    model.eval()
    X = np.stack([encode(s, max_len) for s in seqs])
    S = np.stack([sphere_features(s, motifs) for s in seqs])
    out = np.empty((len(seqs), len(proteins)), dtype=np.float32)
    with torch.no_grad():
        for i in range(0, len(seqs), batch):
            xb = torch.tensor(X[i:i + batch], dtype=torch.long, device=device)
            sb = torch.tensor(S[i:i + batch], dtype=torch.float32, device=device)
            logits = model(xb, sb) if str(mtype).startswith("sphere") else model(xb)
            out[i:i + batch] = (logits if as_logits else torch.sigmoid(logits)).float().cpu().numpy()
    return out, proteins
