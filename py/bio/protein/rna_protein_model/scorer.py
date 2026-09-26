"""Numpy-only scorer for the v2 mRNA -> protein model (shipped to baja-apps as scorer.py).

Two numbers per protein:
  transfer  how MUCH protein changes when its mRNA changes, normalized so the typical gene
            = 1.0 (below 1: buffered; above 1: responsive)
  rho       how RELIABLY protein follows mRNA (Spearman across samples)

Served by lookup (precomputed_v2.npz: the full model - ESM-2 + protein + mRNA features - for
every GENCODE v50 protein) or, for any other protein, by the protein-feature fallback trees
in model_v2.json.gz walked here. features.py is a verbatim copy of the training features.
"""
import gzip
import hashlib
import json
import os

import numpy as np

from features import featurize

_HERE = os.path.dirname(os.path.abspath(__file__))
TARGETS = ("transfer", "rho")


def _walk(node, f):
    while isinstance(node, dict):
        v = f[node["f"]]
        if v != v:
            node = node["l"] if node["m"] else node["r"]
        else:
            node = node["l"] if v <= node["t"] else node["r"]
    return node


def _gz_json(name):
    path = os.path.join(_HERE, name)
    if not os.path.exists(path):
        return None
    with gzip.open(path, "rt") as fh:
        return json.load(fh)


class TransferModel:
    def __init__(self, model=None):
        self.m = model or _gz_json("model_v2.json.gz")
        if self.m.get("format") != "rna-protein-transfer-2":
            raise ValueError("unexpected model format %r" % self.m.get("format"))
        self._pre = None
        self._measured = None
        self._half = None

    # ---------------------------------------------------------------- lookup
    def _load_pre(self):
        if self._pre is None:
            path = os.path.join(_HERE, "precomputed_v2.npz")
            self._pre = dict(np.load(path)) if os.path.exists(path) else False
        return self._pre

    def _index(self, seq):
        pre = self._load_pre()
        if not pre:
            return None
        k = np.uint64(int(hashlib.md5(seq.encode()).hexdigest()[:16], 16))
        i = int(np.searchsorted(pre["keys"], k))
        return i if i < len(pre["keys"]) and pre["keys"][i] == k else None

    def gencode_gene(self, seq):
        i = self._index(seq)
        return None if i is None else str(self._pre["gene_names"][self._pre["gene"][i]])

    # ---------------------------------------------------------------- predict
    def _calibrate(self, target, source, v):
        cal = self.m["targets"][target][source]
        q = np.array(cal["predicted_quantiles"])
        pct = float(np.interp(v, q, np.linspace(0, 100, len(q))))
        bins, hw = cal["interval_bins"], cal["interval_halfwidth_80"]
        i = int(min(max(np.searchsorted(bins, v) - 1, 0), len(hw) - 1))
        if target == "transfer":
            call = "buffered" if pct < 100 / 3 else "responsive" if pct > 200 / 3 else "typical"
        else:
            call = "low" if pct < 100 / 3 else "high" if pct > 200 / 3 else "typical"
        return {"value": float(v), "interval_80": [float(v - hw[i]), float(v + hw[i])], "percentile": pct,
                "call": call, "cv_spearman": cal["spearman"]}

    def fallback_raw(self, seq):
        f = featurize(seq)
        return {t: sum(_walk(tr, f) for tr in self.m["targets"][t]["fallback_trees"]) for t in TARGETS}

    def predict_one(self, seq, use_precomputed=True):
        i = self._index(seq) if use_precomputed else None
        if i is not None:
            raw, source = {t: float(self._pre[t][i]) for t in TARGETS}, "full"
        else:
            raw, source = self.fallback_raw(seq), "fallback"
        out = {t: self._calibrate(t, source, raw[t]) for t in TARGETS}
        out["source"] = source
        return out

    # ---------------------------------------------------------------- measured + half-life
    def measured(self, seq=None, gene=None):
        """Multi-study measured values: by the GENCODE gene of this exact protein, else by name."""
        if self._measured is None:
            self._measured = _gz_json("measured_v2.json.gz") or False
        if not self._measured:
            return None
        M = self._measured
        g = self.gencode_gene(seq) if seq else None
        for cand, how in ((g, "annotated protein (GENCODE)"), (gene, "gene name")):
            if cand and str(cand).upper() in M["genes"]:
                row = dict(zip(M["fields"], M["genes"][str(cand).upper()]))
                row["studies"] = {s: v for s, v in zip(M["studies"], row.pop("per_study")) if v is not None}
                row["gene"], row["match"] = str(cand).upper(), how
                return row
        return None

    def halflife(self, gene):
        if self._half is None:
            self._half = _gz_json("halflife.json.gz") or False
        if not self._half or not gene:
            return None
        row = self._half["genes"].get(str(gene).upper())
        if row is None:
            return None
        out = dict(zip(self._half["fields"], row), gene=str(gene).upper())
        out["typical_protein_per_mrna_fold"] = self._half["decile_fold"][out["decile"] - 1]
        out["spearman"] = self._half["spearman"]
        return out
