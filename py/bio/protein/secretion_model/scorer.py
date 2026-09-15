#!/usr/bin/env python3
"""Standalone secretion scorer: numpy and the standard library only.

Deliberately has no LightGBM, joblib, pandas or scikit-learn dependency, so it can be
dropped onto a web server without a matching ML stack. The tree ensemble is read from
the exported JSON produced by src/export_model.py, whose export step verifies that it
reproduces the original library's probabilities exactly.

Feature extraction here must stay byte-identical in behaviour to src/featurize.py. The
test at the bottom of this file checks that, and the build script refuses to ship a copy
that disagrees.
"""
from __future__ import annotations
import gzip, json, math
from pathlib import Path
import numpy as np

AA20 = "ACDEFGHIKLMNPQRSTVWY"
KD = {"A": 1.8, "R": -4.5, "N": -3.5, "D": -3.5, "C": 2.5, "Q": -3.5, "E": -3.5,
      "G": -0.4, "H": -3.2, "I": 4.5, "L": 3.8, "K": -3.9, "M": 1.9, "F": 2.8,
      "P": -1.6, "S": -0.8, "T": -0.7, "W": -0.9, "Y": -1.3, "V": 4.2}
CHARGE = {"K": 1.0, "R": 1.0, "H": 0.1, "D": -1.0, "E": -1.0}
SMALL, AROMATIC, POLAR = set("AGSCT"), set("FWY"), set("STNQ")
MEDIAN_TRAIN_LEN = 425.0
MIN_LEN = 30


def _kd(seq):
    return np.fromiter((KD.get(c, 0.0) for c in seq), dtype=np.float32, count=len(seq))


def _win(x, w):
    if len(x) < w:
        return np.array([], dtype=np.float32)
    c = np.cumsum(np.insert(x, 0, 0.0))
    return (c[w:] - c[:-w]) / w


def _comp(seq, prefix):
    n = max(len(seq), 1)
    cnt = dict.fromkeys(AA20, 0)
    for c in seq:
        if c in cnt:
            cnt[c] += 1
    return {f"{prefix}{a}": cnt[a] / n for a in AA20}


def features_one(seq: str) -> dict:
    seq = seq.upper()
    L = len(seq)
    kd = _kd(seq)
    f = {"len_log10": float(np.log10(L)), "len_raw": float(L)}
    f.update(_comp(seq, "comp_"))
    f["glob_gravy"] = float(kd.mean())
    f["glob_charge_per100"] = 100.0 * sum(CHARGE.get(c, 0.0) for c in seq) / L
    f["glob_frac_cys"] = seq.count("C") / L
    f["glob_frac_aromatic"] = sum(c in AROMATIC for c in seq) / L
    f["glob_frac_polar"] = sum(c in POLAR for c in seq) / L
    f["glob_nglyc_per100"] = 100.0 * sum(
        1 for i in range(L - 2)
        if seq[i] == "N" and seq[i + 1] != "P" and seq[i + 2] in "ST") / L
    comp_vals = np.array([v for k, v in f.items() if k.startswith("comp_")], dtype=np.float64)
    nz = comp_vals[comp_vals > 0]
    f["glob_comp_entropy"] = float(-(nz * np.log(nz)).sum())
    f["glob_max_aa_frac"] = float(comp_vals.max())

    nt = seq[:30]
    f.update(_comp(nt, "nterm_"))
    f["nterm_gravy30"] = float(kd[:30].mean())
    f["nterm_gravy15"] = float(kd[:15].mean())
    f["nterm_charge_2_8"] = float(sum(CHARGE.get(c, 0.0) for c in seq[1:8]))
    f["nterm_met_start"] = 1.0 if seq[0] == "M" else 0.0
    for w in (7, 9, 13, 19):
        wm = _win(kd[:45], w)
        if wm.size:
            f[f"nterm_maxkd_w{w}"] = float(wm.max())
            f[f"nterm_argmax_w{w}"] = float(int(wm.argmax()))
            f[f"nterm_nwin_kd2_w{w}"] = float((wm > 2.0).sum())
        else:
            f[f"nterm_maxkd_w{w}"] = 0.0
            f[f"nterm_argmax_w{w}"] = 0.0
            f[f"nterm_nwin_kd2_w{w}"] = 0.0
    f["nterm_small_frac_18_35"] = sum(c in SMALL for c in seq[18:35]) / max(len(seq[18:35]), 1)
    f["nterm_pro_frac_1_30"] = nt.count("P") / max(len(nt), 1)
    f["nterm_charged_frac_10_30"] = sum(c in "DEKR" for c in seq[10:30]) / max(len(seq[10:30]), 1)

    tail = kd[60:]
    wm19 = _win(tail, 19)
    f["tail_maxkd_w19"] = float(wm19.max()) if wm19.size else -5.0
    f["tail_nwin_kd16_w19"] = float((wm19 > 1.6).sum()) if wm19.size else 0.0
    n_tm, last = 0, -100
    if wm19.size:
        for h in np.flatnonzero(wm19 > 1.6):
            if h - last > 19:
                n_tm += 1
                last = h
    f["tail_n_tm_like"] = float(n_tm)
    f["tail_gravy"] = float(tail.mean()) if tail.size else 0.0

    ct = seq[-30:]
    f.update(_comp(ct, "cterm_"))
    f["cterm_gravy"] = float(kd[-30:].mean())
    f["cterm_kdel"] = 1.0 if seq[-4:] in ("KDEL", "HDEL", "RDEL", "KEEL") else 0.0
    f["cterm_di_lys"] = 1.0 if ("KK" in seq[-6:] or "RR" in seq[-6:]) else 0.0
    return f


class SecretionModel:
    def __init__(self, path):
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            m = json.load(fh)
        if m.get("format") != "secretion-gbdt-1":
            raise ValueError(f"unexpected model format {m.get('format')}")
        self.columns = m["columns"]
        self.trees = m["trees"]
        self.thresholds = m["thresholds"]
        self.meta = m.get("meta", {})
        self.source_model = m.get("source_model", "?")

    def _raw(self, vec) -> float:
        total = 0.0
        for t in self.trees:
            n = t
            while isinstance(n, dict):
                v = vec[n["f"]]
                n = (n["l"] if n["m"] else n["r"]) if v != v else \
                    (n["l"] if v <= n["t"] else n["r"])
            total += n
        return total

    def predict(self, seq: str, hold_length: float | None = None) -> float:
        f = features_one(seq)
        if hold_length is not None:
            f["len_raw"] = float(hold_length)
            f["len_log10"] = float(math.log10(hold_length))
        vec = [f[c] for c in self.columns]
        return 1.0 / (1.0 + math.exp(-self._raw(vec)))


def clean(seq: str) -> str:
    return "".join(c for c in seq.upper() if c.isalpha())


def profile(model: SecretionModel, seq: str, window: int = 70, step: int = 1,
            poly_degree: int = 8) -> dict:
    """profile[i] = P(secreted | the subsequence starting at i, length `window`).

    Read as "if the protein began here, would it look secreted?". It peaks over signal
    peptides and signal anchors. It is not a probability that the residue itself is
    exported, and it does not separate secreted from ER- or membrane-retained proteins:
    both carry the same N-terminal signal.
    """
    seq = clean(seq)
    L = len(seq)
    if L < MIN_LEN:
        raise ValueError(f"sequence is {L} residues; at least {MIN_LEN} are needed")
    w = min(window, L)
    starts = list(range(0, L - w + 1, max(1, step)))
    vals = [model.predict(seq[s:s + w], hold_length=MEDIAN_TRAIN_LEN) for s in starts]
    p = np.asarray(vals, dtype=float)

    deg = int(max(1, min(poly_degree, len(starts) - 1)))
    x = np.asarray(starts, dtype=float) / max(L, 1)
    if len(starts) > deg:
        coeffs = np.polyfit(x, p, deg)
        fit = np.clip(np.polyval(coeffs, x), 0.0, 1.0)
    else:
        coeffs, fit = np.array([]), p
    return {
        "length": L, "window": w, "step": max(1, step),
        "model": model.source_model,
        "positions": [s + 1 for s in starts],
        "profile": [round(float(v), 4) for v in p],
        "poly_degree": deg,
        "poly_coeffs": [float(c) for c in coeffs],
        "poly_fit": [round(float(v), 4) for v in fit],
        "p_whole_sequence": round(model.predict(seq), 4),
        "peak_position": int(starts[int(p.argmax())] + 1),
        "peak_value": round(float(p.max()), 4),
        "thresholds": model.thresholds,
    }
