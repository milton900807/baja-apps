"""Sequence-only protein features. Shared by training and the rna-to-protein-correlation tool.

Everything here is computed from the amino-acid string alone. The features are the
protein properties known (or suspected) to decouple protein from mRNA: size, membrane
insertion, secretion, disorder, degradation motifs (PEST, KEN/D-box, N- and C-degrons),
and ubiquitination-site density.
"""
import math
import re

import numpy as np

AA = "ACDEFGHIKLMNPQRSTVWY"
KD = dict(A=1.8, R=-4.5, N=-3.5, D=-3.5, C=2.5, Q=-3.5, E=-3.5, G=-0.4, H=-3.2, I=4.5,
          L=3.8, K=-3.9, M=1.9, F=2.8, P=-1.6, S=-0.8, T=-0.7, W=-0.9, Y=-1.3, V=4.2)
PKA = dict(Cterm=3.55, Nterm=7.5, D=3.9, E=4.07, C=8.3, Y=10.46, H=6.04, K=10.54, R=12.48)
DISORDER = set("ARGQSPEK")     # disorder-promoting (Dunker et al.)
ORDER = set("WCFIYVLN")
# N-end rule, after initiator-Met removal when residue 2 is small
MET_CLEAVED = set("ACGPSTV")
N_DESTAB = set("RKHLFWYIDENQC")


def _clean(seq):
    return re.sub(r"[^A-Z]", "", seq.upper()).replace("U", "C").replace("O", "K")


def _kd_windows(seq, w):
    v = np.array([KD.get(a, 0.0) for a in seq])
    if len(v) < w:
        return np.array([v.mean()]) if len(v) else np.array([0.0])
    c = np.convolve(v, np.ones(w) / w, mode="valid")
    return c


def _count_tm(seq, w=19, thr=1.6):
    c = _kd_windows(seq, w)
    n, i = 0, 0
    while i < len(c):
        if c[i] > thr:
            n += 1
            i += w          # non-overlapping helices
        else:
            i += 1
    return n


def _pi(seq):
    cnt = {k: seq.count(k) for k in "DECYHKR"}

    def charge(ph):
        pos = 1 / (1 + 10 ** (ph - PKA["Nterm"])) + sum(cnt[k] / (1 + 10 ** (ph - PKA[k])) for k in "HKR")
        neg = 1 / (1 + 10 ** (PKA["Cterm"] - ph)) + sum(cnt[k] / (1 + 10 ** (PKA[k] - ph)) for k in "DECY")
        return pos - neg
    lo, hi = 0.0, 14.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if charge(mid) > 0 else (lo, mid)
    return (lo + hi) / 2, charge(7.0)


def _entropy_windows(seq, w=20):
    if len(seq) < w:
        return [0.0]
    out = []
    for i in range(0, len(seq) - w + 1, 5):
        win = seq[i:i + w]
        ent = 0.0
        for a in set(win):
            p = win.count(a) / w
            ent -= p * math.log2(p)
        out.append(ent)
    return out


def _pest(seq):
    """PEST-like segments: stretches between K/R/H of >=12 residues, >=50% P/E/S/T/D, containing P."""
    n = 0
    for seg in re.split(r"[KRH]", seq):
        if len(seg) >= 12 and "P" in seg and sum(a in "PESTD" for a in seg) / len(seg) >= 0.5:
            n += 1
    return n


def _disorder_fraction(seq, w=21):
    if len(seq) < w:
        return sum(a in DISORDER for a in seq) / max(len(seq), 1)
    d = np.array([a in DISORDER for a in seq], float)
    o = np.array([a in ORDER for a in seq], float)
    dm = np.convolve(d, np.ones(w) / w, "same")
    om = np.convolve(o, np.ones(w) / w, "same")
    return float(((dm > 0.6) & (om < 0.2)).mean())


def featurize(seq):
    s = _clean(seq)
    L = len(s)
    f = {"length": L, "log_length": math.log10(max(L, 1))}
    for a in AA:
        f["aa_" + a] = s.count(a) / L
    f["frac_hydrophobic"] = sum(a in "AILMFVW" for a in s) / L
    f["frac_charged"] = sum(a in "DEKR" for a in s) / L
    f["frac_aromatic"] = sum(a in "FWY" for a in s) / L
    f["frac_disorder_promoting"] = sum(a in DISORDER for a in s) / L
    f["gravy"] = sum(KD.get(a, 0) for a in s) / L
    f["pi"], charge = _pi(s)
    f["charge_per_res"] = charge / L
    f["n_tm"] = _count_tm(s)
    f["signal_hydrophobic"] = float(_kd_windows(s[:35], 11).max()) if L >= 11 else 0.0
    # signal peptide (von Heijne): positive n-region, hydrophobic h-region, then no further TM helix
    f["signal_like"] = int(any(a in "KR" for a in s[1:6]) and f["signal_hydrophobic"] > 2.2 and _count_tm(s[40:]) == 0)
    ent = _entropy_windows(s)
    f["min_entropy"] = min(ent)
    f["frac_low_complexity"] = float(np.mean(np.array(ent) < 3.0))
    f["disorder_fraction"] = _disorder_fraction(s)
    f["pest_per_100"] = 100 * _pest(s) / L
    f["ken_box_per_100"] = 100 * len(re.findall(r"KEN", s)) / L
    f["d_box_per_100"] = 100 * len(re.findall(r"R..L", s)) / L
    f["nls_per_100"] = 100 * len(re.findall(r"K[KR].[KR]", s)) / L
    f["lys_per_100"] = 100 * s.count("K") / L
    r2 = s[1] if L > 1 else "M"
    f["met_cleaved"] = int(r2 in MET_CLEAVED)
    f["res2_destabilizing"] = int(r2 in N_DESTAB)
    f["cterm_gly"] = int(s[-1] == "G")
    f["cterm_arg_gly"] = int(bool(re.search(r"R.{0,2}G$", s)))
    f["cterm_hydrophobic"] = sum(a in "AILMFVW" for a in s[-10:]) / min(10, L)
    f["cys_pairs_per_100"] = 100 * (s.count("C") // 2) / L
    return f


def featurize_many(seqs):
    import pandas as pd
    return pd.DataFrame([featurize(s) for s in seqs])
