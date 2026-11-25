#!/usr/bin/env python
"""What sets a cryptic exon's TDP-43 threshold?

The graded knockdown series orders cryptic exons by the TDP-43 level at which
they appear, and the order reproduces across cell lines: Spearman rho 0.725 on
T50 and 0.762 on EC50 between SH-SY5Y and SK-N-BE(2) on the 80 events measured
in both. Two lines with different genetic backgrounds and different cofactor
abundances cannot agree that well on a trans-determined quantity, so most of
what sets an exon's threshold is written in its own sequence. This module asks
which sequence features those are.

TWO FACTORS, NOT ONE. Repression is a competition between TDP-43 occupancy and
the spliceosome, so the threshold has a term from each side:

  occupancy    how well TDP-43 holds the intron as its concentration falls,
               which under mass action is set by the affinity and the valency
               of the binding element. Measured here as the longest
               uninterrupted UG run on either flank of the acceptor, the same
               statistic the array-rarity work used, where STMN2 carries a run
               past 30 nt that matched intronic windows essentially never
               reach.

  competence   how good a substrate the cryptic exon is once repression
               weakens. An exon with a strong polypyrimidine tract and a
               canonical AG is a real competitor and needs substantial TDP-43
               to stay silenced; a weak site is nearly silent on its own and
               only emerges when repression is almost gone. Measured here from
               sequence, as pyrimidine fraction over the tract, the AG, and a
               position weight matrix score for the 3' splice site.

Reporting both, and the standardized regression of the threshold on both, is
the point: a single feature will not predict T50, and which term dominates is
the biology. If occupancy dominates, thresholds are a titration of binding
chemistry. If competence dominates, they are a property of the splice sites
and TDP-43 is closer to a switch than a rheostat.

SIGN CONVENTION IS YOURS, NOT MINE. A threshold column can mean either "the
fraction of TDP-43 remaining when the exon appears" or "the knockdown depth
required to make it appear", and those give opposite expected signs for the
same biology. Pass `--higher-threshold-is remaining` or `depth` and the
verdict is phrased against that convention. Without it the signed correlations
are still printed, with both readings stated, and no verdict is given, because
a verdict that assumed a convention would be wrong half the time.

NOT A CAUSAL CLAIM. Any correlation here is across events that differ in many
ways at once, and both features correlate with intron and exon length. The
partial correlations against baseline PSI and exon length are printed for that
reason. An event that is already leaky at baseline has a low apparent
threshold for reasons that have nothing to do with how tightly TDP-43 binds.
"""
import argparse
import os
import re
import sys

import numpy as np
import pandas as pd

from bajasplice.evaluate.buffer_test import bh
from bajasplice.evaluate.motif_background import (
    acceptor_window, exon_window, longest_repeat, parse_junction,
)

# Header patterns for a threshold table, since the column names vary by run.
THRESHOLD_PATTERNS = (
    ("t50", re.compile(r"^(t50|t_50|thresh(old)?_?50|t50_psi)$", re.I)),
    ("ec50", re.compile(r"^(ec50|ec_50|hill_?ec50|ec50_fit)$", re.I)),
)
GENE_PATTERNS = re.compile(r"^(gene|gene_name|gene_id|symbol|host|host_gene)$", re.I)
JUNCTION_PATTERNS = re.compile(r"(junction|junc|paste_into_igv|coords?|locus)", re.I)
# Pyrimidine tract: the 3' splice site's defining feature, read in transcript
# orientation immediately upstream of the acceptor.
TRACT_LO, TRACT_HI = 5, 25
PWM_SPAN = (-20, 3)
UG_WIDTH = 120


def find_threshold_columns(cols):
    """Map t50/ec50 to real column names, or {} if none look like thresholds."""
    out = {}
    for key, pat in THRESHOLD_PATTERNS:
        for c in cols:
            if pat.match(str(c).strip()):
                out[key] = c
                break
    if not out:
        # fall back to anything containing the token, so a prefixed column
        # like shsy5y_t50 is still found rather than silently ignored
        for key, _ in THRESHOLD_PATTERNS:
            hits = [c for c in cols if key in str(c).lower()]
            if len(hits) == 1:
                out[key] = hits[0]
            elif len(hits) > 1:
                raise SystemExit(
                    f"several columns look like {key}: {hits}; "
                    f"name one with --{key}-col")
    return out


def find_gene_column(cols):
    for c in cols:
        if GENE_PATTERNS.match(str(c).strip()):
            return c
    return None


def read_thresholds(path, t50_col=None, ec50_col=None, gene_col=None):
    """A threshold table with its columns identified, not assumed.

    Returns (df, cols) where cols maps 'gene', and whichever of 't50' and
    'ec50' were found, to this file's actual column names. Raises if neither
    threshold column can be located, because guessing which numeric column is
    a threshold is exactly the kind of silent error that produces a confident
    wrong correlation.
    """
    path = os.path.expanduser(path)
    if not os.path.exists(path):
        raise SystemExit(f"no such threshold table: {path}")
    sep = "," if path.endswith(".csv") else "\t"
    df = pd.read_csv(path, sep=sep)
    cols = {}
    if t50_col:
        cols["t50"] = t50_col
    if ec50_col:
        cols["ec50"] = ec50_col
    if not cols:
        cols = find_threshold_columns(df.columns)
    if not cols:
        raise SystemExit(
            f"{os.path.basename(path)} has no column that looks like a "
            f"threshold; columns are {list(df.columns)}. Name one with "
            "--t50-col or --ec50-col.")
    g = gene_col or find_gene_column(df.columns)
    if g is None:
        raise SystemExit(f"{os.path.basename(path)} has no gene column; "
                         f"columns are {list(df.columns)}")
    cols["gene"] = g
    for k, c in cols.items():
        if c not in df.columns:
            raise SystemExit(f"no column {c!r} in {os.path.basename(path)}")
    return df, cols


def coords_from(df):
    """(chrom, left, right) per row from explicit columns or a junction string.

    Explicit coordinate columns win, because a junction string names the
    intronic span and an exon-coordinate column names the exon; conflating
    them shifts every window by an intron.
    """
    lower = {str(c).lower(): c for c in df.columns}
    if {"chrom", "a_start", "a_end"} <= set(lower):
        return (df[lower["chrom"]].astype(str).tolist(),
                df[lower["a_start"]].astype("int64").tolist(),
                df[lower["a_end"]].astype("int64").tolist())
    jcol = next((c for c in df.columns if JUNCTION_PATTERNS.search(str(c))), None)
    if jcol is None:
        return None
    parsed = [parse_junction(x) for x in df[jcol]]
    if all(p[0] is None for p in parsed):
        return None
    # A JUNCTION IS NOT AN EXON, and this function used to return it as one.
    # The endpoints of chr8:79611214-79616822 are the intron's bounds: the
    # acceptor is one of them and the exon runs outward from there for an
    # unknown length. Returned as (a_start, a_end) it put every window at the
    # donor end, 5.6 kb from the acceptor in STMN2's case, and produced
    # confident null correlations on the wrong sequence. A junction alone
    # cannot place both the upstream and the exon window, so refuse it and
    # name the fix rather than guessing.
    raise SystemExit(
        f"the only coordinates in this table are the junction column "
        f"{jcol!r}, and a junction names the INTRON, not the exon: its "
        "endpoints are the donor and the acceptor, so windows placed on them "
        "land an intron away from the site. Pass --coords with a table that "
        "has chrom/a_start/a_end for the exon, such as a cryptic-fate "
        "per-event output.")


def pyrimidine_fraction(seq):
    """C+T fraction, the polypyrimidine tract's strength in one number."""
    s = str(seq).upper().replace("U", "T")
    s = "".join(ch for ch in s if ch in "ACGT")
    if not s:
        return float("nan")
    return sum(ch in "CT" for ch in s) / len(s)


def has_canonical_ag(seq):
    """True if the two bases immediately 5' of the exon are AG.

    `seq` runs in transcript orientation and ends on the last intron base, so
    the acceptor dinucleotide is its final two characters.
    """
    s = str(seq).upper().replace("U", "T")
    return len(s) >= 2 and s[-2:] == "AG"


def fit_pwm(motifs, pseudo=1.0):
    """Log-odds PWM over ACGT from equal-length sequences, uniform background.

    A uniform background is deliberate and it is a limitation: intronic
    sequence is AT-rich, so this score mixes tract composition with site
    identity rather than isolating the site. It is reported beside the
    pyrimidine fraction for that reason, not instead of it.
    """
    keep = [str(m).upper().replace("U", "T") for m in motifs]
    keep = [m for m in keep if m and set(m) <= set("ACGT")]
    if not keep:
        raise SystemExit("no usable sequences to fit a PWM")
    n = len(keep[0])
    if any(len(m) != n for m in keep):
        raise SystemExit("PWM sequences must all be the same length")
    counts = np.full((4, n), pseudo, dtype="float64")
    index = {b: i for i, b in enumerate("ACGT")}
    for m in keep:
        for j, b in enumerate(m):
            counts[index[b], j] += 1
    freq = counts / counts.sum(axis=0, keepdims=True)
    return np.log2(freq / 0.25)


def score_pwm(pwm, seq):
    s = str(seq).upper().replace("U", "T")
    if len(s) != pwm.shape[1] or not set(s) <= set("ACGT"):
        return float("nan")
    index = {b: i for i, b in enumerate("ACGT")}
    return float(sum(pwm[index[b], j] for j, b in enumerate(s)))


def ug_features(row, genome, width=UG_WIDTH, max_interrupt=0):
    """Longest uninterrupted UG run upstream and downstream of the acceptor.

    Both flanks, and the larger of the two, because STMN2's array sits roughly
    48 to 76 nt PAST the exon start: a repressive element is not always
    upstream of the site it silences, and scoring one flank answers a narrower
    question than the one being asked.
    """
    up = down = float("nan")
    a, b = acceptor_window(row, width)
    if b >= a:
        up = longest_repeat(genome.sequence(row["chrom"], a, b, row["strand"]),
                            "TG", max_interrupt)
    a, b = exon_window(row, width)
    if b >= a:
        down = longest_repeat(genome.sequence(row["chrom"], a, b, row["strand"]),
                              "TG", max_interrupt)
    both = [x for x in (up, down) if np.isfinite(x)]
    return (max(both) if both else float("nan")), up, down


def drop_absent(x, absent_is_zero=True):
    """Turn a 0 that means "no element found" into NaN.

    A feature column that records the longest UG run writes 0 where it found
    none, and 0 is not a short array: treating it as one mixes two
    populations and can invert the sign of the correlation. On the curated
    thresholds set that is not hypothetical, it flips SH-SY5Y from -0.245 to
    +0.064.
    """
    v = np.asarray(x, dtype="float64").copy()
    if absent_is_zero:
        v[v == 0] = np.nan
    return v


def spearman(x, y):
    """Spearman rho and p over the rows where both are finite."""
    from scipy.stats import spearmanr
    x = np.asarray(x, dtype="float64")
    y = np.asarray(y, dtype="float64")
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 4:
        return float("nan"), float("nan"), int(ok.sum())
    r, p = spearmanr(x[ok], y[ok])
    return float(r), float(p), int(ok.sum())


def partial_spearman(x, y, z):
    """Spearman of x and y with z ranked out of both.

    Needed because an event already leaky at baseline has a low apparent
    threshold for reasons unrelated to binding, and both sequence features
    track intron and exon length.
    """
    from scipy.stats import rankdata, spearmanr
    x, y, z = (np.asarray(v, dtype="float64") for v in (x, y, z))
    ok = np.isfinite(x) & np.isfinite(y) & np.isfinite(z)
    if ok.sum() < 6:
        return float("nan"), float("nan"), int(ok.sum())
    rx, ry, rz = (rankdata(v[ok]) for v in (x, y, z))
    # A control with no variance controls for nothing: regressing on it
    # leaves both residuals intact, so the "partial" silently equals the raw
    # correlation. That is how a scan pad reported as exon_len produced an
    # exon-length control identical to every raw rho beside it.
    if rz.std() == 0:
        return float("nan"), float("nan"), int(ok.sum())
    A = np.column_stack([np.ones_like(rz), rz])
    ex = rx - A @ np.linalg.lstsq(A, rx, rcond=None)[0]
    ey = ry - A @ np.linalg.lstsq(A, ry, rcond=None)[0]
    # If a feature is a perfect function of the control, its residual is
    # floating-point noise, and two such residuals correlate at 1.0 because
    # the noise is identical. The partial correlation is undefined there, so
    # say so rather than reporting the strongest result on the page.
    for e, rank in ((ex, rx), (ey, ry)):
        if e.std() <= 1e-8 * max(rank.std(), 1.0):
            return float("nan"), float("nan"), int(ok.sum())
    r, p = spearmanr(ex, ey)
    return float(r), float(p), int(ok.sum())


def standardized_fit(y, features):
    """Least squares of ranked y on ranked features, standardized.

    Ranks rather than raw values so one long UG array cannot set the slope,
    and standardized so the coefficients are comparable across features of
    different units. Returns coefficient per feature plus the R squared.
    """
    from scipy.stats import rankdata
    y = np.asarray(y, dtype="float64")
    names = list(features)
    X = np.column_stack([np.asarray(features[k], dtype="float64") for k in names])
    ok = np.isfinite(y) & np.isfinite(X).all(axis=1)
    if ok.sum() < len(names) + 3:
        return {k: float("nan") for k in names}, float("nan"), int(ok.sum())
    ry = rankdata(y[ok])
    ry = (ry - ry.mean()) / ry.std()
    cols = []
    for j in range(X.shape[1]):
        c = rankdata(X[ok, j])
        s = c.std()
        cols.append((c - c.mean()) / s if s > 0 else np.zeros_like(c))
    A = np.column_stack([np.ones(ok.sum())] + cols)
    beta, *_ = np.linalg.lstsq(A, ry, rcond=None)
    resid = ry - A @ beta
    ss = float(((ry - ry.mean()) ** 2).sum())
    r2 = 1.0 - float((resid ** 2).sum()) / ss if ss > 0 else float("nan")
    return dict(zip(names, (float(b) for b in beta[1:]))), r2, int(ok.sum())


def stratified(th, feature, threshold, near=None, cutoffs=(10, 20, 30, 40, 60, 80, 140),
               absent_is_zero=True):
    """rho(feature, threshold) overall and within each distance cutoff.

    Reported as a scan rather than one chosen cutoff, because a single cutoff
    picked after seeing the data is a choice the reader cannot check. A real
    local effect should strengthen monotonically as the window tightens; one
    that appears at a single cutoff and nowhere else is noise.
    """
    x = drop_absent(th[feature], absent_is_zero)
    y = pd.to_numeric(th[threshold], errors="coerce").to_numpy()
    rows = [dict(feature=feature, threshold=threshold, within=None,
                 **dict(zip(("rho", "p", "n"), spearman(x, y))))]
    if near is None:
        return rows
    d = pd.to_numeric(th[near], errors="coerce").to_numpy()
    for c in cutoffs:
        keep = np.isfinite(d) & (d <= c)
        xx = np.where(keep, x, np.nan)
        r, pv, n = spearman(xx, y)
        rows.append(dict(feature=feature, threshold=threshold, within=c,
                         rho=r, p=pv, n=n))
    return rows


def from_columns(th, cols, features, near=None, absent_is_zero=True):
    """Correlate existing columns against the thresholds, no sequence needed.

    This is the path to use when the threshold table already carries the
    features, which is the common case: those columns were computed against
    the real exon coordinates by whatever produced them, and recomputing from
    a table that only has junctions is how the window ends up on the wrong
    side of the intron.
    """
    missing = [f for f in features if f not in th.columns]
    if missing:
        raise SystemExit(f"no such column(s): {missing}; "
                         f"columns are {list(th.columns)}")
    if near is not None and near not in th.columns:
        raise SystemExit(f"no such distance column: {near!r}")
    out = []
    for k in [c for c in ("t50", "ec50") if c in cols]:
        for f in features:
            out += stratified(th, f, cols[k], near,
                              absent_is_zero=absent_is_zero)
    df = pd.DataFrame(out)
    if len(df):
        base = df["within"].isna()
        df.loc[base, "padj"] = bh(df.loc[base, "p"].tolist())
    return df


def acceptor_of(j1, j2, strand):
    """The acceptor (last intron base) of a junction, per this project's rule.

    A junction names the intron, so one of its endpoints is the donor and the
    other the acceptor. The convention used throughout this codebase is
    `end - 1` on the plus strand and `start + 1` on the minus strand, which
    puts STMN2 exon 2a's acceptor at chr8:79,616,821 for the junction
    chr8:79,611,214-79,616,822. Getting this backwards reads the donor end,
    which for STMN2 is 5.6 kb away.
    """
    if strand == "+":
        return int(j2) - 1
    return int(j1) + 1


def rows_from_junctions(df, pad):
    """Window anchors derived from junctions, with the acceptor placed exactly.

    THE UPSTREAM WINDOW IS EXACT AND THE EXON WINDOW IS NOT. A junction fixes
    the acceptor and the far end of the intron, so the upstream window is
    bounded correctly on both sides. It says nothing about where the exon
    ends, so a downstream window of fixed width can run past the exon into
    the next intron. Both flanks are still reported, separately, so a caller
    can rely on the upstream one and treat the downstream one as an upper
    bound; `exon_end_known` records which rows had a real exon boundary.
    """
    out = df.copy()
    plus = out["strand"].to_numpy() == "+"
    j1 = pd.to_numeric(out["_j1"], errors="coerce").to_numpy()
    j2 = pd.to_numeric(out["_j2"], errors="coerce").to_numpy()
    acc = np.where(plus, j2 - 1, j1 + 1)
    # exon side: first exon base on +, last exon base on -
    out["a_start"] = np.where(plus, j2, j1 - pad).astype("int64")
    out["a_end"] = np.where(plus, j2 + pad, j1).astype("int64")
    # intron side bound: the junction's other endpoint, so a window cannot
    # leave the intron it is supposed to be scanning
    out["c1_end"] = np.where(plus, j1, out["a_start"] - pad).astype("int64")
    out["c2_start"] = np.where(plus, out["a_end"] + pad, j2).astype("int64")
    out["acceptor"] = acc.astype("int64")
    out["exon_end_known"] = False
    return out


def _verdict(rows, convention):
    """One line, only when a sign convention makes the sign interpretable."""
    if convention is None:
        return ("no --higher-threshold-is given, so no verdict: the sign of "
                "every correlation above means the opposite under the other "
                "convention")
    # Under 'depth', a tighter-held intron needs a deeper knockdown, so the
    # occupancy model predicts a POSITIVE threshold-to-UG correlation. Under
    # 'remaining', the same biology predicts a negative one.
    want = 1.0 if convention == "depth" else -1.0
    hits = [r for r in rows
            if np.isfinite(r["p"]) and r["p"] < 0.05
            and np.sign(r["rho"]) == want]
    if hits:
        best = min(hits, key=lambda r: r["p"])
        return (f"{best['feature']} predicts the threshold in the direction "
                f"the occupancy model requires (rho {best['rho']:.3f}, "
                f"p {best['p']:.3g}, n {best['n']})")
    back = [r for r in rows
            if np.isfinite(r["p"]) and r["p"] < 0.05
            and np.sign(r["rho"]) == -want]
    if back:
        best = min(back, key=lambda r: r["p"])
        return (f"the correlation runs BACKWARDS: {best['feature']} "
                f"rho {best['rho']:.3f}, p {best['p']:.3g}, which is the "
                "opposite of what tighter binding holding on longer predicts")
    lo = min((r["p"] for r in rows if np.isfinite(r["p"])), default=float("nan"))
    return (f"no sequence feature predicts the threshold (smallest p {lo:.3g}); "
            "the ordering is reproducible across cell lines but is not "
            "explained by these features")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--thresholds", required=True,
                    help="per-event table with T50 and/or EC50")
    ap.add_argument("--t50-col", default=None)
    ap.add_argument("--ec50-col", default=None)
    ap.add_argument("--gene-col", default=None)
    ap.add_argument("--coords", default=None,
                    help="table with chrom/a_start/a_end to take exon "
                         "coordinates from, such as a cryptic-fate output, "
                         "when the threshold table has none")
    ap.add_argument("--annotation", default="current")
    ap.add_argument("--ug-width", type=int, default=UG_WIDTH,
                    help="bases scanned on each flank for a UG run")
    ap.add_argument("--max-interrupt", type=int, default=0,
                    help="mismatches tolerated inside a UG run; an insertion "
                         "flips phase and is not bridged")
    ap.add_argument("--higher-threshold-is", choices=["remaining", "depth"],
                    default=None,
                    help="what a LARGER threshold value means in your file: "
                         "'remaining' = more TDP-43 left when the exon "
                         "appears; 'depth' = a deeper knockdown was needed")
    ap.add_argument("--pwm-sample", type=int, default=20000,
                    help="annotated acceptors sampled to fit the 3'SS PWM")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--feature-col", action="append", default=[],
                    metavar="NAME",
                    help="correlate an EXISTING column against the "
                         "thresholds instead of computing features from "
                         "sequence; repeatable. Needs no genome, and is the "
                         "right path when the table already carries the "
                         "features.")
    ap.add_argument("--from-junction", action="store_true",
                    help="derive the acceptor from the junction column and "
                         "scan around it. The upstream window is exact; the "
                         "exon window is an upper bound, because a junction "
                         "does not say where the exon ends.")
    ap.add_argument("--near-col", default=None, metavar="NAME",
                    help="distance column to stratify --feature-col by, such "
                         "as the distance of a UG array from the acceptor")
    ap.add_argument("--keep-zero", action="store_true",
                    help="treat a 0 in a feature column as a real zero. By "
                         "default 0 means 'none found' and is dropped, "
                         "because mixing the two inverts the sign.")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    th, cols = read_thresholds(args.thresholds, args.t50_col, args.ec50_col,
                              args.gene_col)
    have = [k for k in ("t50", "ec50") if k in cols]
    print(f"{len(th)} rows from {os.path.basename(args.thresholds)}")
    print(f"  gene column: {cols['gene']!r}")
    for k in have:
        v = pd.to_numeric(th[cols[k]], errors="coerce")
        print(f"  {k}: column {cols[k]!r}, {v.notna().sum()} numeric, "
              f"median {v.median():.4g}, range {v.min():.4g} to {v.max():.4g}")

    if args.feature_col:
        print("\nusing existing columns; no sequence is read")
        if not args.keep_zero:
            print("  a 0 in a feature column is read as 'none found' and "
                  "dropped (--keep-zero to override)")
        res = from_columns(th, cols, args.feature_col, args.near_col,
                           absent_is_zero=not args.keep_zero)
        base = res[res["within"].isna()]
        print("\noverall:")
        print(base.drop(columns=["within"]).to_string(
            index=False, float_format=lambda v: f"{v:.4g}"))
        if args.near_col:
            print(f"\nstratified by {args.near_col}:")
            strat = res[res["within"].notna()]
            print(strat.to_string(index=False,
                                  float_format=lambda v: f"{v:.4g}"))
        print("\n" + _verdict(base.to_dict("records"),
                              args.higher_threshold_is))
        if args.out:
            res.to_csv(args.out, sep="\t", index=False)
            print(f"\nwrote {args.out}")
        return

    # Imported here, not at the top of main, so the --feature-col path above
    # runs with no genome and no annotation: that path exists precisely for
    # the case where the features are already computed.
    from bajanmd.consequence import annotation_tables
    from bajasplice.genome import GenomeReader

    if args.from_junction:
        jcol = next((c for c in th.columns
                     if JUNCTION_PATTERNS.search(str(c))), None)
        if jcol is None:
            raise SystemExit("--from-junction needs a junction column; "
                             f"columns are {list(th.columns)}")
        if "strand" not in th.columns:
            raise SystemExit("--from-junction needs a strand column: the "
                             "acceptor is end-1 on + and start+1 on -")
        parsed = [parse_junction(x) for x in th[jcol]]
        th = th.assign(chrom=[p[0] for p in parsed],
                       _j1=[p[1] for p in parsed],
                       _j2=[p[2] for p in parsed])
        th = th[th["chrom"].notna()].copy()
        pad = max(args.ug_width, TRACT_HI) + 50
        th = rows_from_junctions(th, pad)
        print(f"\nderived the acceptor from {jcol!r} for {len(th)} events "
              "(end-1 on +, start+1 on -)")
        print("  no exon end is available, so exon_len is the scan pad and "
              "the exon-length partial is NOT reported")
        print("  the upstream window is exact; the exon window is an upper "
              "bound, since a junction does not give the exon's far end")
        c = (th["chrom"].tolist(), th["a_start"].tolist(), th["a_end"].tolist())
    else:
        c = coords_from(th)
    if c is None:
        if not args.coords:
            raise SystemExit(
                "the threshold table has no coordinates; pass --coords with a "
                "table that has chrom/a_start/a_end, such as a cryptic-fate "
                "per-event output")
        co = pd.read_csv(os.path.expanduser(args.coords), sep="\t")
        need = {"gene", "chrom", "a_start", "a_end"}
        if not need <= set(co.columns):
            raise SystemExit(f"--coords needs {sorted(need)}; "
                             f"it has {list(co.columns)}")
        # One gene can host several cryptic exons, so a gene join is
        # ambiguous. Keep it and say how ambiguous it is rather than
        # pretending the join is clean.
        dup = int(co["gene"].duplicated().sum())
        th = th.merge(co[["gene", "chrom", "a_start", "a_end"]],
                      left_on=cols["gene"], right_on="gene", how="inner",
                      suffixes=("", "_coord"))
        print(f"joined to {args.coords} by gene: {len(th)} rows "
              f"({dup} genes in the coordinate table host more than one exon, "
              "so those genes contribute every pairing)")
        c = coords_from(th)
    else:
        th = th.assign(chrom=c[0], a_start=c[1], a_end=c[2])
        print("took exon coordinates from the threshold table itself")

    th = th.dropna(subset=["chrom", "a_start", "a_end"]).copy()
    th["a_start"] = th["a_start"].astype("int64")
    th["a_end"] = th["a_end"].astype("int64")
    if "strand" not in th.columns:
        raise SystemExit("no strand column; the acceptor is end-1 on + and "
                         "start+1 on -, so a window cannot be placed without "
                         "it")
    # The flank helpers need the neighbouring exon bounds; without a real
    # annotation join, bound them generously by the scan width so a window is
    # never silently clipped to nothing.
    if "c1_end" not in th.columns:
        pad = max(args.ug_width, TRACT_HI) + 50
        th["c1_end"] = th["a_start"] - pad
        th["c2_start"] = th["a_end"] + pad

    genome = GenomeReader()

    print("\nfitting a 3' splice site PWM from annotated acceptors", flush=True)
    exons, _ = annotation_tables(args.annotation)
    lo, hi = PWM_SPAN
    rng = np.random.default_rng(args.seed)
    pool = exons.sample(min(args.pwm_sample, len(exons)), random_state=args.seed)
    motifs = []
    for r in pool.itertuples():
        chrom = getattr(r, "chrom", None)
        strand = getattr(r, "strand", None)
        start = getattr(r, "start", None)
        end = getattr(r, "end", None)
        if None in (chrom, strand, start, end):
            continue
        if strand == "+":
            a, b = int(start) + lo, int(start) + hi - 1
        else:
            a, b = int(end) - hi + 1, int(end) - lo
        if b <= a:
            continue
        s = genome.sequence(chrom, a, b, strand)
        if len(s) == hi - lo and set(s.upper()) <= set("ACGT"):
            motifs.append(s)
        if len(motifs) >= args.pwm_sample:
            break
    print(f"  {len(motifs)} usable acceptor windows")
    pwm = fit_pwm(motifs)

    print("\nscoring cryptic acceptors", flush=True)
    feats = {"ug_max": [], "ug_up": [], "ug_down": [], "py_tract": [],
             "canonical_ag": [], "pwm": [], "exon_len": []}
    for i, r in enumerate(th.to_dict("records"), 1):
        if i % 50 == 0:
            print(f"    {i}/{len(th)}", flush=True)
        m, u, d = ug_features(r, genome, args.ug_width, args.max_interrupt)
        feats["ug_max"].append(m)
        feats["ug_up"].append(u)
        feats["ug_down"].append(d)
        a, b = acceptor_window(r, TRACT_HI - TRACT_LO, TRACT_LO)
        tract = genome.sequence(r["chrom"], a, b, r["strand"]) if b >= a else ""
        feats["py_tract"].append(pyrimidine_fraction(tract))
        a, b = acceptor_window(r, 2)
        ag = genome.sequence(r["chrom"], a, b, r["strand"]) if b >= a else ""
        feats["canonical_ag"].append(1.0 if has_canonical_ag(ag) else 0.0)
        # The PWM window straddles the junction, so it is placed directly
        # rather than through acceptor_window, which stops at the exon edge.
        if r["strand"] == "+":
            a, b = int(r["a_start"]) + lo, int(r["a_start"]) + hi - 1
        else:
            a, b = int(r["a_end"]) - hi + 1, int(r["a_end"]) - lo
        site = genome.sequence(r["chrom"], a, b, r["strand"]) if b > a else ""
        feats["pwm"].append(score_pwm(pwm, site))
        feats["exon_len"].append(float(int(r["a_end"]) - int(r["a_start"]) + 1))
    for k, v in feats.items():
        th[k] = v

    print(f"\ncanonical AG at {int(np.nansum(feats['canonical_ag']))} of "
          f"{len(th)} cryptic acceptors")
    print("UG run length, longer flank: median "
          f"{np.nanmedian(feats['ug_max']):.0f} nt, max "
          f"{np.nanmax(feats['ug_max']):.0f} nt")

    tested = ("ug_max", "ug_up", "ug_down", "py_tract", "pwm", "canonical_ag")
    base = next((c for c in th.columns
                 if str(c).lower() in ("baseline_psi", "baseline")), None)
    rows, allrows = [], []
    for k in have:
        y = pd.to_numeric(th[cols[k]], errors="coerce").to_numpy()
        print(f"\n{k} against each feature:")
        for f in tested:
            r, p, n = spearman(th[f].to_numpy(), y)
            rec = {"threshold": k, "feature": f, "rho": r, "p": p, "n": n}
            if base is not None:
                pr, pp, pn = partial_spearman(
                    th[f].to_numpy(), y,
                    pd.to_numeric(th[base], errors="coerce").to_numpy())
                rec.update(rho_partial_baseline=pr, p_partial_baseline=pp)
            # Only when a real exon end was available. Under --from-junction
            # exon_len is the scan pad, identical on every row, so a partial
            # against it equals the raw correlation and prints as a control
            # that controlled for nothing.
            if th.get("exon_end_known", pd.Series([True])).any():
                pr, pp, _ = partial_spearman(th[f].to_numpy(), y,
                                             th["exon_len"].to_numpy())
                rec.update(rho_partial_exonlen=pr, p_partial_exonlen=pp)
            allrows.append(rec)
            if k == have[0]:
                rows.append(rec)
            extra = ""
            if np.isfinite(rec.get("rho_partial_exonlen", np.nan)):
                extra = f"   (exon-length partial {rec['rho_partial_exonlen']:+.3f})"
            print(f"  {f:13s} rho {r:+.3f}  p {p:.3g}  n {n}{extra}")

        beta, r2, n = standardized_fit(
            y, {f: th[f].to_numpy() for f in ("ug_max", "py_tract", "pwm")})
        print(f"  standardized joint fit on n={n}: R2 {r2:.3f}; " +
              ", ".join(f"{a} {b:+.3f}" for a, b in beta.items()))
        print("    occupancy term is ug_max; competence terms are py_tract "
              "and pwm")

    print("\n" + _verdict(rows, args.higher_threshold_is))

    if args.out:
        pd.DataFrame(allrows).to_csv(args.out, sep="\t", index=False)
        per = os.path.splitext(args.out)[0] + "-per-event.tsv"
        th.to_csv(per, sep="\t", index=False)
        print(f"\nwrote {args.out} and {per}")


if __name__ == "__main__":
    sys.exit(main())
