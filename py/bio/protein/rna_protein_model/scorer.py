"""Numpy-only scorer for the RNA-protein coupling model (shipped to baja-apps as scorer.py).

No LightGBM, pandas or scikit-learn: the trees come from model.json.gz and features.py is
a verbatim copy of the training feature code.
"""
import gzip
import hashlib
import json
import math
import os

import numpy as np

from features import featurize

_HERE = os.path.dirname(os.path.abspath(__file__))


def _walk(node, f):
    while isinstance(node, dict):
        v = f[node["f"]]
        if v != v:                                   # NaN: follow the default direction
            node = node["l"] if node["m"] else node["r"]
        else:
            node = node["l"] if v <= node["t"] else node["r"]
    return node


class CouplingModel:
    def __init__(self, model=None):
        if model is None:
            with gzip.open(os.path.join(_HERE, "model.json.gz"), "rt") as fh:
                model = json.load(fh)
        if model.get("format") != "rna-protein-gbdt-1":
            raise ValueError("unexpected model format %r" % model.get("format"))
        self.m = model
        self._measured = None
        self._pre = None

    def precomputed(self, seq):
        """Full-model (ESM-2 + sequence) rho for an annotated GENCODE protein, or None.
        Keyed by the first 64 bits of the sequence md5 (sorted uint64 array)."""
        if self._pre is None:
            path = os.path.join(_HERE, "precomputed.npz")
            if not os.path.exists(path):
                self._pre = False
                return None
            z = np.load(path)
            self._pre = (z["keys"], z["rho"])
        if self._pre is False:
            return None
        keys, vals = self._pre
        k = np.uint64(int(hashlib.md5(seq.encode()).hexdigest()[:16], 16))
        i = int(np.searchsorted(keys, k))
        return float(vals[i]) if i < len(keys) and keys[i] == k else None

    def predict_one(self, seq, use_precomputed=True):
        f = featurize(seq)
        full = self.precomputed(seq) if use_precomputed and "full" in self.m else None
        if full is not None:
            raw, cal, source = full, self.m["full"], "full"
        else:
            raw, cal, source = sum(_walk(t, f) for t in self.m["trees"]), self.m, "features"
        q = np.array(cal["predicted_quantiles"])
        pct = float(np.interp(raw, q, np.linspace(0, 100, len(q))))
        bins, hw = cal["interval_bins"], cal["interval_halfwidth_80"]
        i = int(min(max(np.searchsorted(bins, raw) - 1, 0), len(hw) - 1))
        return {"predicted_rho": raw, "interval_80": [raw - hw[i], raw + hw[i]], "percentile": pct,
                "call": "low" if pct < 100 / 3 else "high" if pct > 200 / 3 else "typical",
                "source": source, "cv_r": cal["cv"]["r"], "features": f}

    def drivers(self, seq, n=5):
        """Which features move this protein's prediction most, by one-feature substitution:
        replace a feature with the training median and see how far the prediction moves."""
        f = featurize(seq)
        base = sum(_walk(t, f) for t in self.m["trees"])
        med = self.m.get("feature_medians") or {}
        out = []
        for k in self.m["features"]:
            if k not in med:
                continue
            g = dict(f)
            g[k] = med[k]
            out.append((k, f[k], base - sum(_walk(t, g) for t in self.m["trees"])))
        out.sort(key=lambda t: -abs(t[2]))
        return [{"feature": k, "value": v, "effect": e} for k, v, e in out[:n]]

    def measured(self, seq=None, gene=None):
        if self._measured is None:
            path = os.path.join(_HERE, "measured.json.gz")
            if not os.path.exists(path):
                return None
            with gzip.open(path, "rt") as fh:
                self._measured = json.load(fh)
        M = self._measured
        if seq:
            u = M["by_md5"].get(hashlib.md5(seq.encode()).hexdigest())
            if u:
                return dict(M["proteins"][u], match="identical sequence")
        if gene:
            u = M["by_gene"].get(str(gene).upper())
            if u:
                return dict(M["proteins"][u], match="gene name (UniProt canonical isoform)")
        return None
