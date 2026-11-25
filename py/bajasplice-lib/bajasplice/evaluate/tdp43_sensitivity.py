"""Can sequence features predict how TDP-43-sensitive a cryptic acceptor is?

THE FRAMING, AND WHY IT IS NOT A GENOME-WIDE DETECTOR. Human intron holds
roughly 28 million acceptor-like positions (1/16 AG rate, 34.7% of those with
a usable polypyrimidine tract, measured from matched decoys) against about 925
known novel acceptors. At 30,000:1 you need 99.996% specificity for even 50%
precision, from a few hundred training examples. That is not reachable, so
nothing here should be pointed at the genome. Inside one gene the same model
faces ~2,200 candidates and is useful for ranking ASO targets.

THE TARGET IS CONTINUOUS ON PURPOSE. `tdp43_sensitivity_sh` and
`tdp43_sensitivity_be2` are measured in two cell lines, which gives a real
external test: fit on one line, evaluate on the other. With a few hundred rows
that replication is worth more than any cross-validation scheme, because it
tests whether the feature-to-sensitivity map transfers rather than whether a
split was lucky.

A CLASSIFIER AGAINST RANDOM INTRONIC AG WOULD BE MEANINGLESS. Cryptic
acceptors carry a tract 85.4% of the time against 34.7% for arbitrary
intronic AGs, so that contrast is learnable from the splice motif alone and
BajaSplice already models it. The useful comparison is among positions that
were measured in the depletion experiment, which is what this table holds.

CONSERVATION FEATURES ARE INCLUDED IN ORDER TO SHOW THEY ARE EMPTY. phyloP at
these acceptors scored +0.009 and +0.160 against a +1.49/+2.04 positive
control; phastCons_alt against phastCons_unchanged gave p=0.932; and in a
matched test cryptic acceptors retain the macaque AG LESS often than their own
intronic decoys (OR 0.606). They are kept as features so the fitted
coefficient reports that directly instead of leaving it to be assumed.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

__all__ = ["LEAKY", "CANDIDATE_FEATURES", "ORDINAL", "encode_target",
           "grouped_cv_fit", "permutation_null_cv",
           "ceiling_agreement", "choose_features", "build_matrix",
           "fit_transfer", "permutation_null", "main"]

#: The sensitivity columns are ordinal LABELS, not numbers: how much TDP-43
#: depletion a junction needs before it responds. Early responds at the lowest
#: dose and is therefore the MOST sensitive, so the encoding runs
#: Early < Intermediate < Late in "depletion required" and a NEGATIVE
#: coefficient means a feature predicts greater sensitivity.
ORDINAL = {"early": 0, "intermediate": 1, "late": 2}


def encode_target(series, mapping=None):
    """Ordinal labels to numbers, reporting anything it could not map.

    pd.to_numeric on these columns returns all-NaN, which is how the first
    run reported 0 usable rows for both targets while the file held 501 and
    344 labels.
    """
    mapping = mapping or ORDINAL
    raw = series.astype(str).str.strip().str.lower()
    out = raw.map(mapping)
    unmapped = sorted(set(raw[out.isna() & series.notna()]))
    return pd.to_numeric(out, errors="coerce"), unmapped


def ceiling_agreement(a, b):
    """How well the two cell lines agree, on the rows carrying both labels.

    This is the ceiling. No model built from sequence can predict cell line B
    better than cell line A does, so a fit reported without it has no scale.
    """
    from scipy import stats as sps
    ok = a.notna() & b.notna()
    if int(ok.sum()) < 10:
        return None
    x, y = a[ok], b[ok]
    rho, p = sps.spearmanr(x, y)
    return {"n": int(ok.sum()), "spearman": rho, "p": p,
            "exact_agreement": float((x == y).mean())}

#: Columns that must never be features. Each is derived from the very
#: dose-response that defines the target, so including any of them produces a
#: near-perfect fit that means nothing. This is the main way this analysis
#: goes wrong, so the list is explicit rather than a heuristic.
LEAKY = {
    # the targets themselves
    "tdp43_sensitivity_sh", "tdp43_sensitivity_be2",
    # the dose series the targets are computed from
    "dox0_sh", "dox0125", "dox0187", "dox021", "dox025", "dox075",
    "dox0_be2", "dox002", "dox003", "dox004", "dox005", "dox0075",
    "dox01", "dox1",
    # outcome summaries
    "max_psi_sh", "max_psi_be2", "baseline_PSI", "contrast_PSI",
    # embeddings and clusters computed FROM the dose profiles
    "UMAP_1_together", "UMAP_2_together", "cluster_together",
    "UMAP_1_sh", "UMAP_2_sh", "cluster_sh",
    "UMAP_1_be2", "UMAP_2_be2", "cluster_be2",
    # bookkeeping
    "junction_for_clustering", "ID_exon", "n_significant_data",
}

#: Computed by `evaluate cryptic-features` from hg38, so complete by
#: construction. These replace the inherited columns that broke the first fit:
#: score_cryptic at 22% coverage and longest_ug_region with 18 distinct values.
COMPUTED_FEATURES = [
    "ss_acceptor", "ss_donor",
    "ug_run_total", "ug_run_20", "ug_run_40", "ug_run_80", "ug_run_150",
    "ug_frac_40", "ug_frac_150",
    "ug_dist_nearest", "ug_dist_run6",
    "py_10", "py_20", "py_40", "py_80", "py_longest_run",
    "gc_40", "gc_150",
]

#: Features worth trying, in the order they are reported.
CANDIDATE_FEATURES = [
    "score_cryptic",           # acceptor strength, BajaSplice
    "score_ann",               # the competing annotated site
    "longest_ug_region",       # the TDP-43 element: the causal feature
    "dist_nearest_ug_region",  # how far it sits from the acceptor
    "width",
    "phastCons_alt",           # kept to show it is empty
    "phastCons_unchanged",
    "dist_exon",               # joined in; also the contamination filter
]


def choose_features(df, extra=(), computed=True):
    """Numeric, non-leaky, non-constant columns, with derived terms added.

    Returns (frame, used, refused) so a run says what it refused and why
    instead of silently fitting on whatever happened to be numeric.
    """
    out = pd.DataFrame(index=df.index)
    used, refused = [], []
    wanted = list(CANDIDATE_FEATURES)
    if computed:
        wanted = [c for c in COMPUTED_FEATURES if c in df.columns] + wanted
    for c in wanted + list(extra):
        if c not in df.columns:
            refused.append((c, "absent"))
            continue
        if c in LEAKY:
            refused.append((c, "leaks the target"))
            continue
        v = pd.to_numeric(df[c], errors="coerce")
        n = int(v.notna().sum())
        if n < 20:
            refused.append((c, f"only {n} values of {len(df)}"))
            continue
        if n < 0.25 * len(df):
            refused.append((c, f"only {n}/{len(df)} = {n/len(df):.0%} "
                               f"coverage; median-imputing most of a column "
                               f"invents the feature"))
            continue
        if v.nunique(dropna=True) < 2:
            refused.append((c, "constant"))
            continue
        out[c] = v
        used.append(c)

    # Derived terms: a competition and two log scales. Distance and width span
    # orders of magnitude, where a linear coefficient is the wrong shape.
    if {"score_cryptic", "score_ann"} <= set(used):
        out["score_margin"] = out["score_cryptic"] - out["score_ann"]
        used.append("score_margin")
    for c in ("dist_nearest_ug_region", "width", "dist_exon",
              "ug_dist_nearest", "ug_dist_run6"):
        if c in used:
            out[f"log_{c}"] = np.log10(out[c].clip(lower=0) + 1)
            used.append(f"log_{c}")
    return out, used, refused


def add_dist_exon(df, exons):
    """Compute dist_exon directly for these rows.

    Joining it from another table matched only 69 of 294 rows, because the
    two tables are overlapping but different event sets, which left the
    contamination filter inert on three quarters of the data. Computing it
    here needs the annotation but covers every row.
    """
    from bajasplice.evaluate.constraint_axis import (chrom_exon_bounds,
                                                     nearest_boundary)
    b = chrom_exon_bounds(exons)
    out = df.copy()
    out["dist_exon"] = [
        nearest_boundary(int(a), b.get(str(c)))
        if pd.notna(a) and pd.notna(c) else np.nan
        for c, a in zip(out.get("chrom", []), out.get("acceptor", []))]
    return out


def add_coordinates(df):
    """chrom and acceptor parsed from the pasteable junction string."""
    from bajasplice.evaluate.exon_age import acceptor_from_junction
    from bajasplice.evaluate.motif_background import parse_junction
    jc = next((c for c in df.columns if "junc" in c.lower()
               and "cat" not in c.lower() and "ref" not in c.lower()
               and "cluster" not in c.lower()), None)
    if jc is None:
        return df, None
    out = df.copy()
    parsed = out[jc].map(parse_junction)
    out["chrom"] = [p[0] if p else None for p in parsed]
    out["acceptor"] = [acceptor_from_junction(p[1], p[2], st) if p else None
                       for p, st in zip(parsed, out.get("strand", "+"))]
    out["acceptor"] = pd.to_numeric(out["acceptor"], errors="coerce")
    return out, jc


def build_matrix(master, events=None, require_acceptor=True, max_dist=None,
                 min_dist=None, exons=None):
    """The acceptor rows of the compendium, with dist_exon joined if available.

    `junc_cat` holds donor and exon_skip rows too. Deriving an acceptor from a
    donor junction is the error that contaminated an earlier analysis here
    (387 of 681 rows were not acceptors), so the filter is on by default.
    """
    df = master.copy()
    notes = []
    if require_acceptor and "junc_cat" in df.columns:
        before = len(df)
        df = df[df["junc_cat"].astype(str).str.lower().str.contains("acceptor")]
        notes.append(f"junc_cat acceptor only: {before} -> {len(df)}")

    df, jc = add_coordinates(df)
    if jc is not None:
        notes.append(f"coordinates parsed from {jc}: "
                     f"{int(df['acceptor'].notna().sum())}/{len(df)} rows")
    if exons is not None:
        df = add_dist_exon(df, exons)
        got = int(np.isfinite(pd.to_numeric(df["dist_exon"],
                                            errors="coerce")).sum())
        notes.append(f"dist_exon computed from the annotation for "
                     f"{got}/{len(df)} rows")
    elif events is not None and "dist_exon" in events.columns:
        if True:
            key = events[["chrom", "acceptor", "dist_exon"]].copy()
            key["chrom"] = key["chrom"].astype(str)
            df["chrom"] = df["chrom"].astype(str)
            key["acceptor"] = pd.to_numeric(key["acceptor"], errors="coerce")
            df = df.merge(key.drop_duplicates(subset=["chrom", "acceptor"]),
                          on=["chrom", "acceptor"], how="left")
            got = int(df["dist_exon"].notna().sum())
            notes.append(f"dist_exon JOINED for only {got}/{len(df)} rows; "
                         f"pass --annotation to compute it for all of them")

    if "dist_exon" in df.columns:
        if min_dist is not None:
            before = len(df)
            df = df[df["dist_exon"].isna() | (df["dist_exon"] > min_dist)]
            notes.append(f"dist_exon > {min_dist}: {before} -> {len(df)} "
                         f"(removes positions sitting on annotated acceptors)")
        if max_dist is not None:
            before = len(df)
            df = df[df["dist_exon"].isna() | (df["dist_exon"] <= max_dist)]
            notes.append(f"dist_exon <= {max_dist}: {before} -> {len(df)}")
    return df, notes


def fit_transfer(X, y_fit, y_test, groups=None, alphas=None, seed=0,
                 drop_shared_genes=False, min_n=25):
    """Fit on the rows carrying one cell line's target, score on the other's.

    master_table.csv STACKS the two experiments rather than pairing them: a
    junction has either the sh dose series or the be2 series, essentially
    never both. The first version of this assumed paired rows and died with
    zero usable records. Disjoint row sets are the normal case here, and they
    make the test stronger: the held-out rows are different junctions AND a
    different cell line, so nothing about the fit can carry over except the
    feature-to-sensitivity map.

    When the two sets share genes, gene identity can carry the correlation on
    its own. The shared-gene count is always reported, and
    `drop_shared_genes=True` removes them from the test side.
    """
    from sklearn.linear_model import RidgeCV
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.impute import SimpleImputer
    from sklearn.model_selection import GroupKFold
    from scipy import stats as sps

    fit_ok, test_ok = y_fit.notna(), y_test.notna()
    both = int((fit_ok & test_ok).sum())
    # Fit on EVERY row carrying the fitting label and test only on rows that
    # carry the test label and not the fitting one. The previous default
    # restricted both sides to the intersection, which fit on 73 rows while
    # 216 labels sat unused, and 73 observations against 29 correlated
    # features has no power to detect anything modest. This keeps the test
    # honest (no row appears on both sides) and triples the training set.
    fit_idx = X.index[fit_ok]
    test_idx = X.index[test_ok & ~fit_ok]
    mode = "fit on all fit-label rows, test on test-label-only rows"
    if len(test_idx) < 10 and both >= min_n:
        fit_idx = test_idx = X.index[fit_ok & test_ok]
        mode = ("paired fallback: too few test-only rows, so the test rows "
                "WERE seen in training")

    g = (groups if groups is not None
         else pd.Series(X.index.astype(str), index=X.index))
    shared = set(g.loc[fit_idx]) & set(g.loc[test_idx])
    if drop_shared_genes and not mode.startswith("paired") and shared:
        test_idx = test_idx[~g.loc[test_idx].isin(shared)]

    if len(fit_idx) < min_n or len(test_idx) < 10:
        raise SystemExit(
            f"not enough rows: {len(fit_idx)} to fit on, {len(test_idx)} to "
            f"test on (rows with both targets: {both}). Check that the "
            f"sensitivity columns are populated.")

    Xf, yf = X.loc[fit_idx], y_fit.loc[fit_idx]
    Xt, yt = X.loc[test_idx], y_test.loc[test_idx]
    gf = g.loc[fit_idx]
    # The first run chose alpha=1000, the top of a logspace(-3,3) grid.
    # Landing on the boundary means CV wanted at least that much shrinkage and
    # possibly more, which the grid could not express. Widened so the choice
    # is interior, and `alpha_at_grid_edge` reports it if it still is not.
    alphas = alphas if alphas is not None else np.logspace(-4, 8, 49)
    n_groups = int(gf.nunique())
    if n_groups >= 2:
        cv = list(GroupKFold(n_splits=min(5, n_groups))
                  .split(Xf, yf, groups=gf))
    else:
        # Grouping by a constant is not grouping. GroupKFold refuses it
        # outright (n_splits > n_groups), so fall back to ungrouped folds
        # rather than dying inside sklearn.
        cv = int(min(5, max(2, len(Xf))))
    pipe = make_pipeline(
        SimpleImputer(strategy="median"), StandardScaler(),
        RidgeCV(alphas=alphas, cv=cv))
    pipe.fit(Xf, yf)
    pred = pd.Series(pipe.predict(Xt), index=test_idx)
    r_s, p_s = sps.spearmanr(pred, yt)
    r_p, p_p = sps.pearsonr(pred, yt)
    coef = pd.Series(pipe[-1].coef_, index=X.columns).sort_values(
        key=np.abs, ascending=False)
    return {"n_fit": len(fit_idx), "n_test": len(test_idx), "n_both": both,
            "mode": mode, "shared_genes": len(shared),
            "grouped_cv": n_groups >= 2,
            "alpha_at_grid_edge": bool(
                np.isclose(pipe[-1].alpha_, alphas.max())
                or np.isclose(pipe[-1].alpha_, alphas.min())),
            "pred_spread": float(np.ptp(pred)),
            "spearman": r_s, "spearman_p": p_s,
            "pearson": r_p, "pearson_p": p_p,
            "alpha": float(pipe[-1].alpha_), "coef": coef,
            "pred": pred, "y_test": yt}


def grouped_cv_fit(X, y, groups=None, alphas=None, seed=0):
    """Out-of-fold prediction on the fitting target, using every labelled row.

    The cross-cell-line test is the stronger design but it can only use the
    rows that carry the second label. With 216 labels and 78 test-only rows,
    grouped CV on all 216 is the better-powered question "is there any signal
    here at all". Folds are grouped by gene so no locus spans the split.
    """
    from sklearn.linear_model import RidgeCV
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.impute import SimpleImputer
    from sklearn.model_selection import GroupKFold, cross_val_predict
    from scipy import stats as sps

    ok = y.notna()
    Xo, yo = X[ok], y[ok]
    g = (groups[ok] if groups is not None
         else pd.Series(np.arange(len(Xo)), index=Xo.index))
    n_groups = int(g.nunique())
    if len(Xo) < 30 or n_groups < 3:
        return None
    alphas = alphas if alphas is not None else np.logspace(-4, 8, 49)
    outer = GroupKFold(n_splits=min(5, n_groups))
    pipe = make_pipeline(
        SimpleImputer(strategy="median"), StandardScaler(),
        RidgeCV(alphas=alphas))
    pred = cross_val_predict(pipe, Xo, yo, cv=outer.split(Xo, yo, groups=g))
    rho, p = sps.spearmanr(pred, yo)
    return {"n": int(len(Xo)), "groups": n_groups, "spearman": rho,
            "p": p, "pred_spread": float(np.ptp(pred))}


def permutation_null_cv(X, y, groups=None, n=100, seed=0):
    """Null for grouped_cv_fit: shuffle the target, keep the folds."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(int(n)):
        sh = y.copy()
        ok = y.notna()
        v = sh.loc[ok].to_numpy(copy=True)
        rng.shuffle(v)
        sh.loc[ok] = v
        r = grouped_cv_fit(X, sh, groups=groups)
        if r is not None and np.isfinite(r["spearman"]):
            out.append(r["spearman"])
    return np.array(out)


def permutation_null(X, y_fit, y_test, groups=None, n=200, seed=0, within=False):
    """The same fit with the fitting target shuffled, as a null.

    A correlation looks impressive until the null is drawn. The default
    shuffles the fitting target across all rows, which breaks the
    feature-to-target relationship outright and answers "could a correlation
    this size come from this feature matrix alone". Gene structure is still
    handled where it matters, inside the grouped CV that picks the penalty.

    `within=True` shuffles inside gene groups instead, which preserves each
    gene's mean sensitivity. IT IS NOT CENTRED ON ZERO AND IS NOT MEANT TO BE:
    on synthetic data with real signal it sits near +0.56, because the
    between-gene component survives the shuffle. Read it as the share of the
    fit that is explained by ranking genes rather than by ranking junctions
    within a gene. A real fit that only matches this null is a gene-level
    predictor wearing a junction-level label, which for picking an ASO target
    inside a known gene is the wrong instrument entirely.

    An earlier version did both in sequence, which made the within-group work
    pointless: the global permutation that followed destroyed the structure
    the loop had just preserved.
    """
    rng = np.random.default_rng(seed)
    g = (groups if groups is not None
         else pd.Series(X.index.astype(str), index=X.index))
    out = []
    for _ in range(int(n)):
        if within:
            sh = y_fit.copy()
            ok = y_fit.notna()
            for _, idx in pd.Series(g[ok]).groupby(g[ok]).groups.items():
                vals = sh.loc[idx].to_numpy(copy=True)
                rng.shuffle(vals)
                sh.loc[idx] = vals
        else:
            sh = y_fit.copy()
            ok = y_fit.notna()
            v = sh.loc[ok].to_numpy(copy=True)
            rng.shuffle(v)
            sh.loc[ok] = v
        try:
            r = fit_transfer(X, sh, y_test, groups=g)["spearman"]
        except Exception:
            continue
        out.append(r)
    return np.array([v for v in out if np.isfinite(v)])


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--master", required=True,
                    help="master_table.csv: junc_cat, the dox series, "
                         "score_cryptic/score_ann, longest_ug_region")
    ap.add_argument("--events", default=None,
                    help="cryptic-annotated.tsv, for dist_exon")
    ap.add_argument("--features", default=None,
                    help="output of `evaluate cryptic-features`, joined on "
                         "chrom/acceptor. This is what the first fit was "
                         "missing")
    ap.add_argument("--annotation", default=None,
                    help="exon table (chrom,start,end). Preferred over "
                         "--events: computes dist_exon for every row instead "
                         "of joining it for whichever rows happen to match")
    ap.add_argument("--drop-shared-genes", action="store_true",
                    help="when fit and test rows are disjoint, remove test "
                         "rows whose gene also appears in the fitting set")
    ap.add_argument("--min-dist", type=float, default=None,
                    help="drop acceptors within this many nt of an annotated "
                         "exon; 27%% of the curated set sits within 1 nt, "
                         "where an ANNOTATED acceptor sits. Try 50")
    ap.add_argument("--fit-on", default="sh", choices=("sh", "be2"))
    ap.add_argument("--target", default="tdp43_sensitivity",
                    help="column stem for the ordinal target "
                         "(default tdp43_sensitivity, giving _sh and _be2), "
                         "or a single complete column such as new_cate")
    ap.add_argument("--permutations", type=int, default=200)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    master = pd.read_csv(os.path.expanduser(args.master), low_memory=False)
    print(f"{len(master)} rows from {os.path.basename(args.master)}")
    events = None
    if args.events:
        events = pd.read_csv(os.path.expanduser(args.events), sep=None,
                             engine="python")
        print(f"{len(events)} annotated events from "
              f"{os.path.basename(args.events)}")

    exons = None
    if args.annotation:
        from bajasplice.evaluate.exon_age_decoys import read_annotation
        exons = read_annotation(os.path.expanduser(args.annotation))
        print(f"{len(exons)} exons from {os.path.basename(args.annotation)}")
    df, notes = build_matrix(master, events, min_dist=args.min_dist,
                             exons=exons)
    if args.features:
        feat = pd.read_csv(os.path.expanduser(args.features), sep=None,
                           engine="python")
        keep = [c for c in feat.columns
                if c in COMPUTED_FEATURES or c in ("chrom", "acceptor")]
        feat = feat[keep].copy()
        feat["chrom"] = feat["chrom"].astype(str)
        feat["acceptor"] = pd.to_numeric(feat["acceptor"], errors="coerce")
        before = len(df)
        df["chrom"] = df["chrom"].astype(str)
        df = df.merge(feat.drop_duplicates(subset=["chrom", "acceptor"]),
                      on=["chrom", "acceptor"], how="left")
        got = [c for c in keep if c not in ("chrom", "acceptor")]
        # The join either matched or it did not, and that is a property of the
        # KEY, not of any one column. Reporting the worst column confused a
        # legitimately sparse feature (ug_dist_run6 at 28%, because most
        # acceptors simply have no UG run nearby) with a failed join.
        matched = float(df[got].notna().any(axis=1).mean()) if got else 0.0
        notes.append(f"computed features joined: {len(got)} columns, "
                     f"{matched:.0%} of {before} rows matched the key")
        if matched < 0.9:
            notes.append("  THE JOIN KEY DID NOT MATCH. Run cryptic-features "
                         "on these same positions,\n  e.g. --events the "
                         "master table with --require-junc-cat acceptor.")
        sparse = {c: float(df[c].notna().mean()) for c in got
                  if df[c].notna().mean() < 0.9}
        if sparse and matched >= 0.9:
            notes.append("  joined fine; these columns are genuinely sparse "
                         "in the data, not missing:")
            for c, v in sorted(sparse.items(), key=lambda kv: kv[1]):
                notes.append(f"    {c:<22} {v:.0%}")
    for n in notes:
        print(f"  {n}")

    other = "be2" if args.fit_on == "sh" else "sh"
    fit_col, test_col = f"{args.target}_{args.fit_on}", f"{args.target}_{other}"
    if fit_col not in df.columns and args.target in df.columns:
        fit_col = test_col = args.target
        print(f"\nusing the single column {args.target} for both sides; "
              f"there is no cross-cell-line\ntest in that case, only "
              f"grouped CV within one target")
    for c in (fit_col, test_col):
        if c not in df.columns:
            raise SystemExit(
                f"{c} not in the table; sensitivity-like columns present: "
                f"{[x for x in df.columns if 'sens' in x or 'cate' in x]}")

    X, used, refused = choose_features(df)
    print(f"\nfeatures used ({len(used)}): {', '.join(used)}")
    if refused:
        print("refused:")
        for c, why in refused:
            print(f"  {c:<26} {why}")
    print(f"\nleakage guard holds back {len(LEAKY)} columns, including the dox "
          f"dose series,\nthe UMAP embeddings and the max_psi summaries: all "
          f"are computed from the\nvery dose-response the target is derived "
          f"from.")

    y_fit, un_f = encode_target(df[fit_col])
    y_test, un_t = encode_target(df[test_col])
    print(f"\ntarget encoding (Early<Intermediate<Late = depletion required, "
          f"so a NEGATIVE\ncoefficient means the feature predicts GREATER "
          f"sensitivity):")
    for nm, col, y in ((args.fit_on, fit_col, y_fit), (other, test_col, y_test)):
        vc = df[col].astype(str).str.strip().str.lower().value_counts()
        kept = {k: int(v) for k, v in vc.items() if k in ORDINAL}
        print(f"  {col:<28} {int(y.notna().sum()):>4} encoded   {kept}")
    for nm, un in ((fit_col, un_f), (test_col, un_t)):
        if un:
            print(f"  {nm}: UNMAPPED labels left as missing: {un}")

    ceil = ceiling_agreement(y_fit, y_test)
    print("\n" + "=" * 70)
    print("THE CEILING: how well do the two cell lines agree with each other?")
    print("=" * 70)
    if ceil is None:
        print("  too few rows carry both labels to say")
    else:
        print(f"  rows with both labels: {ceil['n']}")
        print(f"  Spearman between {args.fit_on} and {other}: "
              f"rho={ceil['spearman']:+.3f}  p={ceil['p']:.3g}")
        print(f"  identical label:       {ceil['exact_agreement']:.1%}")
        print("  No sequence model can predict the second cell line better "
              "than the first\n  one does. Read every number below against "
              "this, not against 1.0.")
    groups = (df["gene"].astype(str) if "gene" in df.columns
              else pd.Series(np.arange(len(df)), index=df.index))

    print("\n" + "=" * 70)
    print(f"IS THERE ANY SIGNAL? grouped CV on {args.fit_on.upper()} alone, "
          f"using every labelled row")
    print("=" * 70)
    cvres = grouped_cv_fit(X, y_fit, groups=groups)
    if cvres is None:
        print("  too few rows or genes for grouped CV")
    else:
        print(f"  n={cvres['n']} rows across {cvres['groups']} genes "
              f"(the cross-cell-line test below can only use a subset)")
        print(f"  out-of-fold Spearman: rho={cvres['spearman']:+.3f}  "
              f"p={cvres['p']:.3g}")
        if cvres["pred_spread"] < 1e-6:
            print("  predictions are constant: every fold shrank the model to "
                  "its intercept.")
        cvnull = permutation_null_cv(X, y_fit, groups=groups, n=100)
        if cvnull is not None and len(cvnull):
            beat = int((np.abs(cvnull) >= abs(cvres["spearman"])).sum())
            print(f"  permutation null: mean |rho|="
                  f"{np.abs(cvnull).mean():.3f}, 95th pct="
                  f"{np.percentile(np.abs(cvnull), 95):.3f}"
                  f"  -> empirical p={(beat + 1) / (len(cvnull) + 1):.3g}")

    print("\n" + "=" * 70)
    print(f"FIT ON {args.fit_on.upper()}, EVALUATE AGAINST {other.upper()}")
    print("=" * 70)
    print(f"  rows with {fit_col}:  {int(y_fit.notna().sum())}")
    print(f"  rows with {test_col}: {int(y_test.notna().sum())}")
    res = fit_transfer(X, y_fit, y_test, groups=groups,
                       drop_shared_genes=args.drop_shared_genes)
    print(f"  mode: {res['mode']}")
    print(f"  fit on {res['n_fit']} rows, tested on {res['n_test']} rows "
          f"({res['n_both']} carry both targets)")
    if res["shared_genes"] and not res["mode"].startswith("paired"):
        tag = "removed" if args.drop_shared_genes else "KEPT"
        print(f"  genes present in both sets: {res['shared_genes']}  ({tag})")
        if not args.drop_shared_genes:
            print("    gene identity can carry the correlation on its own; "
                  "rerun with\n    --drop-shared-genes to see the fit "
                  "without them")
    print(f"  ridge alpha chosen:  {res['alpha']:.4g}"
          + ("   AT THE EDGE OF THE GRID" if res["alpha_at_grid_edge"] else ""))
    if res["alpha_at_grid_edge"]:
        print("    CV wanted the strongest penalty available, which means it "
              "found no feature\n    worth keeping. That is a result, not a "
              "tuning problem.")
    if res["pred_spread"] < 0.1 * max(np.ptp(res["y_test"]), 1e-9):
        print(f"  predictions span only {res['pred_spread']:.4f} against a "
              f"target range of {np.ptp(res['y_test']):.1f}:")
        print("    the model has collapsed to predicting the mean.")
    print(f"  Spearman vs {other}:   rho={res['spearman']:+.3f}  "
          f"p={res['spearman_p']:.3g}")
    print(f"  Pearson  vs {other}:   r  ={res['pearson']:+.3f}  "
          f"p={res['pearson_p']:.3g}")

    if args.permutations:
        null = permutation_null(X, y_fit, y_test, groups=groups,
                                n=args.permutations)
        if len(null):
            beat = int((np.abs(null) >= abs(res["spearman"])).sum())
            print(f"\n  global null ({len(null)} shuffles): "
                  f"mean |rho|={np.abs(null).mean():.3f}, "
                  f"95th pct={np.percentile(np.abs(null), 95):.3f}")
            print(f"  shuffles matching or beating the real fit: {beat}"
                  f"  -> empirical p={(beat + 1) / (len(null) + 1):.3g}")
        wn = permutation_null(X, y_fit, y_test, groups=groups,
                              n=max(args.permutations // 4, 25), within=True)
        if len(wn):
            print(f"\n  within-gene null ({len(wn)} shuffles): "
                  f"mean rho={np.mean(wn):+.3f}, "
                  f"95th pct={np.percentile(wn, 95):+.3f}")
            print(f"  This null KEEPS each gene's mean sensitivity, so it is "
                  f"not centred on zero.")
            print(f"  It is the share of the fit explained by ranking GENES. "
                  f"Real fit {res['spearman']:+.3f}")
            # Only meaningful if there is a fit to apportion. When the real
            # fit sits inside the GLOBAL null there is no signal to attribute
            # to genes or to junctions, and calling it "a gene-level
            # predictor" would be reading structure into noise.
            no_signal = (len(null) and abs(res["spearman"])
                         <= np.percentile(np.abs(null), 95))
            if no_signal:
                print("  Not interpretable here: the fit is already inside "
                      "the global null, so\n  there is no signal to "
                      "apportion between genes and junctions.")
            elif res["spearman"] <= np.percentile(wn, 95):
                print("  THE REAL FIT DOES NOT BEAT IT. This is a gene-level "
                      "predictor, which is\n  the wrong instrument for "
                      "choosing between candidates inside one gene.")
            else:
                print("  The real fit exceeds it, so there is junction-level "
                      "signal beyond the gene.")

    print("\n  coefficients, standardized, largest first:")
    for k, v in res["coef"].items():
        tag = ""
        if k.startswith("phastCons"):
            tag = "   <- conservation: expected ~0"
        if "ug_region" in k:
            tag = "   <- the TDP-43 element"
        print(f"    {k:<26} {v:+.4f}{tag}")

    print("\n" + "=" * 70)
    print("VERDICT")
    print("=" * 70)
    inside = (len(null) and abs(res["spearman"])
              <= np.percentile(np.abs(null), 95)) if args.permutations else None
    if ceil and inside:
        print(f"  The two cell lines agree at rho={ceil['spearman']:+.3f}, so "
              f"the target is\n  reproducible and the biology is measurable. "
              f"The model reaches "
              f"rho={res['spearman']:+.3f},\n  inside its own null. The "
              f"failure is in the FEATURES, not the labels.")
        # This used to recommend computing acceptor strength from sequence.
        # Once ss_acceptor is actually present that advice is stale and tells
        # a future reader to redo work already done, so the verdict now
        # depends on what the fit really had.
        if "ss_acceptor" in X.columns:
            print("\n  Acceptor strength WAS included this time "
                  "(ss_acceptor, full coverage), so\n  the missing-feature "
                  "explanation no longer applies.")
            n_genes = int(groups.nunique()) if groups is not None else 0
            if n_genes and n_genes > 0.8 * len(df):
                print(f"\n  {n_genes} genes for {len(df)} rows: nearly one "
                      f"junction per gene, so this is\n  almost entirely a "
                      f"BETWEEN-gene comparison. Anything that varies by gene "
                      f"and\n  not by junction is invisible to a local "
                      f"window: expression level, total\n  TDP-43 occupancy "
                      f"across the transcript, the competing site's actual "
                      f"usage.")
        else:
            print("\n  Acceptor strength was absent from this fit. Generate "
                  "it with\n  `evaluate cryptic-features --with-model` and "
                  "pass --features.")
    elif ceil:
        print(f"  Model rho={res['spearman']:+.3f} against a cell-line "
              f"ceiling of {ceil['spearman']:+.3f}.")

    if args.out:
        o = pd.DataFrame({"pred": res["pred"], f"{other}_true": res["y_test"]})
        for c in ("gene", "chrom", "acceptor", "dist_exon"):
            if c in df.columns:
                o[c] = df.loc[o.index, c]
        o.to_csv(args.out, sep="\t", index=False)
        print(f"\npredictions written to {args.out}")
    return None


if __name__ == "__main__":
    main()
