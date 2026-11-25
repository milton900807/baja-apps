"""The sensitivity model. Most of these guard against leakage, which is the
only way a few-hundred-row fit on this table produces an impressive number."""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.tdp43_sensitivity import (CANDIDATE_FEATURES, LEAKY,
                                                   build_matrix,
                                                   choose_features,
                                                   fit_transfer,
                                                   permutation_null)


def _master(n=200, seed=0, signal=True):
    rng = np.random.default_rng(seed)
    ug = rng.gamma(2, 20, n)
    d = rng.gamma(2, 150, n)
    sc = rng.normal(5, 2, n)
    base = (0.03 * ug - 0.002 * d + 0.1 * sc) if signal else np.zeros(n)
    df = pd.DataFrame({
        "gene": [f"G{i // 4}" for i in range(n)],
        "junc_cat": ["acceptor"] * n,
        "paste_into_igv_junction": [f"chr1:{1000 + 50*i}-{2000 + 50*i}"
                                    for i in range(n)],
        "strand": ["+"] * n,
        "score_cryptic": sc,
        "score_ann": rng.normal(6, 2, n),
        "longest_ug_region": ug,
        "dist_nearest_ug_region": d,
        "width": rng.gamma(3, 30, n),
        "phastCons_alt": rng.random(n),
        "phastCons_unchanged": rng.random(n),
        "tdp43_sensitivity_sh": base + rng.normal(0, 0.5, n),
        "tdp43_sensitivity_be2": base + rng.normal(0, 0.5, n),
    })
    # every leaky column, correlated almost perfectly with the target
    for c in ("max_psi_sh", "dox1", "UMAP_1_sh", "cluster_be2"):
        df[c] = df["tdp43_sensitivity_be2"] + rng.normal(0, 0.01, n)
    return df


# --- leakage ---------------------------------------------------------------

def test_every_leaky_column_is_refused_even_when_present():
    df = _master()
    X, used, refused = choose_features(df)
    for c in ("max_psi_sh", "dox1", "UMAP_1_sh", "cluster_be2"):
        assert c not in X.columns, f"{c} leaked into the feature matrix"
    assert "tdp43_sensitivity_be2" not in X.columns


def test_the_target_itself_can_never_become_a_feature():
    df = _master()
    X, used, _ = choose_features(df, extra=["tdp43_sensitivity_be2"])
    assert "tdp43_sensitivity_be2" not in used


def test_a_leaky_column_offered_as_extra_is_still_refused():
    df = _master()
    X, used, refused = choose_features(df, extra=["dox1", "UMAP_2_sh"])
    assert "dox1" not in used and "UMAP_2_sh" not in used
    assert any(w == "leaks the target" for _, w in refused)


def test_the_leaky_set_covers_both_cell_lines_dose_series():
    for c in ("dox0_sh", "dox075", "dox0_be2", "dox1", "max_psi_sh",
              "max_psi_be2", "tdp43_sensitivity_sh", "tdp43_sensitivity_be2"):
        assert c in LEAKY


# --- feature selection -----------------------------------------------------

def test_constant_and_sparse_columns_are_dropped():
    df = _master()
    df["width"] = 7.0                      # constant
    df["phastCons_alt"] = np.nan
    df.loc[df.index[:5], "phastCons_alt"] = 0.5   # only 5 values
    _, used, refused = choose_features(df)
    assert "width" not in used
    assert "phastCons_alt" not in used
    reasons = dict(refused)
    assert reasons["width"] == "constant"
    assert "values" in reasons["phastCons_alt"]


def test_derived_terms_are_added():
    X, used, _ = choose_features(_master())
    assert "score_margin" in used
    assert "log_dist_nearest_ug_region" in used
    assert np.allclose(X["score_margin"],
                       X["score_cryptic"] - X["score_ann"])


def test_an_absent_column_is_reported_not_fatal():
    df = _master().drop(columns=["longest_ug_region"])
    _, used, refused = choose_features(df)
    assert "longest_ug_region" not in used
    assert ("longest_ug_region", "absent") in refused


# --- population filters ----------------------------------------------------

def test_donor_and_exon_skip_rows_are_removed():
    df = _master(n=60)
    df.loc[df.index[:20], "junc_cat"] = "donor"
    df.loc[df.index[20:30], "junc_cat"] = "exon_skip"
    out, notes = build_matrix(df)
    assert len(out) == 30
    assert set(out["junc_cat"]) == {"acceptor"}
    assert any("junc_cat" in n for n in notes)


def test_the_near_exon_contamination_filter_works():
    df = _master(n=40)
    df["dist_exon"] = [1.0] * 20 + [500.0] * 20
    out, notes = build_matrix(df, min_dist=50)
    assert len(out) == 20
    assert (out["dist_exon"] > 50).all()
    assert any("annotated acceptors" in n for n in notes)


def test_rows_with_no_dist_exon_survive_the_filter():
    # An unjoined row is unknown, not known-contaminated; dropping it would
    # silently shrink the set for a join failure.
    df = _master(n=20)
    df["dist_exon"] = [np.nan] * 10 + [500.0] * 10
    out, _ = build_matrix(df, min_dist=50)
    assert len(out) == 20


# --- does it find signal, and does it report none when there is none? ------

def test_a_planted_signal_transfers_across_cell_lines():
    df = _master(n=300, signal=True)
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["spearman"] > 0.3, res["spearman"]
    assert res["spearman_p"] < 1e-3


def test_pure_noise_does_not_transfer():
    df = _master(n=300, signal=False)
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert abs(res["spearman"]) < 0.25, res["spearman"]


def test_the_permutation_null_is_centred_near_zero():
    df = _master(n=150, signal=True)
    X, _, _ = choose_features(df)
    null = permutation_null(X, df["tdp43_sensitivity_sh"],
                            df["tdp43_sensitivity_be2"],
                            groups=df["gene"], n=25)
    assert len(null) > 10
    assert abs(np.mean(null)) < 0.2, np.mean(null)


def test_rows_missing_either_target_are_dropped_not_imputed():
    df = _master(n=100)
    df.loc[df.index[:30], "tdp43_sensitivity_be2"] = np.nan
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["n_both"] == 70
    assert res["mode"].startswith("paired")


def test_disjoint_targets_are_the_normal_case_and_still_fit():
    # master_table.csv stacks the two experiments: a junction carries the sh
    # dose series or the be2 series, never both. The first version assumed
    # paired rows and died with n_splits=0 on an empty frame.
    df = _master(n=200)
    half = len(df) // 2
    df.loc[df.index[:half], "tdp43_sensitivity_be2"] = np.nan
    df.loc[df.index[half:], "tdp43_sensitivity_sh"] = np.nan
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["n_both"] == 0
    assert "test-label-only" in res["mode"]
    assert res["n_fit"] == half and res["n_test"] == half
    assert res["spearman"] > 0.2, res["spearman"]


def test_shared_genes_between_the_two_sets_are_counted():
    df = _master(n=200)
    half = len(df) // 2
    df.loc[df.index[:half], "tdp43_sensitivity_be2"] = np.nan
    df.loc[df.index[half:], "tdp43_sensitivity_sh"] = np.nan
    df["gene"] = ["shared"] * len(df)      # every gene in both sets
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["shared_genes"] == 1
    assert res["grouped_cv"] is False, "one gene cannot be grouped"


def test_dropping_shared_genes_can_empty_the_test_set_loudly():
    # Better a clear SystemExit than a correlation on three rows.
    df = _master(n=200)
    half = len(df) // 2
    df.loc[df.index[:half], "tdp43_sensitivity_be2"] = np.nan
    df.loc[df.index[half:], "tdp43_sensitivity_sh"] = np.nan
    df["gene"] = ["shared"] * len(df)   # one gene, present on both sides
    X, _, _ = choose_features(df)
    with pytest.raises(SystemExit) as e:
        fit_transfer(X, df["tdp43_sensitivity_sh"],
                     df["tdp43_sensitivity_be2"], groups=df["gene"],
                     drop_shared_genes=True)
    assert "test on" in str(e.value)


def test_too_few_rows_to_fit_says_so_instead_of_crashing_in_sklearn():
    df = _master(n=30)
    df["tdp43_sensitivity_sh"] = np.nan
    X, _, _ = choose_features(df)
    with pytest.raises(SystemExit) as e:
        fit_transfer(X, df["tdp43_sensitivity_sh"],
                     df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert "not enough rows" in str(e.value)


def test_the_within_group_null_retains_between_gene_signal_by_design():
    # It preserves each gene's mean sensitivity, so with real signal it is
    # strongly positive (~+0.56 here). That is the point: it measures how much
    # of a fit is just ranking genes. Asserting it sits at zero would be
    # asserting the null does not work.
    df = _master(n=150, signal=True)
    X, _, _ = choose_features(df)
    null = permutation_null(X, df["tdp43_sensitivity_sh"],
                            df["tdp43_sensitivity_be2"],
                            groups=df["gene"], n=25, within=True)
    assert len(null) > 10
    assert np.mean(null) > 0.3, np.mean(null)


def test_both_nulls_collapse_to_zero_when_there_is_no_signal():
    df = _master(n=150, signal=False)
    X, _, _ = choose_features(df)
    for within in (False, True):
        null = permutation_null(X, df["tdp43_sensitivity_sh"],
                                df["tdp43_sensitivity_be2"],
                                groups=df["gene"], n=25, within=within)
        assert abs(np.mean(null)) < 0.25, (within, np.mean(null))


# --- the targets are ordinal labels, not numbers --------------------------------
#
# pd.to_numeric on these columns returns all-NaN, which is how a run reported
# 0 usable rows for both targets while the file held 501 and 344 labels.

from bajasplice.evaluate.tdp43_sensitivity import (ORDINAL, ceiling_agreement,
                                                   encode_target)


def test_the_sensitivity_labels_encode_in_depletion_order():
    s = pd.Series(["Early", "Intermediate", "Late"])
    y, unmapped = encode_target(s)
    assert list(y) == [0, 1, 2]
    assert unmapped == []


def test_encoding_is_case_and_whitespace_tolerant():
    y, unmapped = encode_target(pd.Series([" early ", "LATE", "Intermediate"]))
    assert list(y) == [0, 2, 1]
    assert unmapped == []


def test_an_unrecognised_label_is_reported_not_silently_zero():
    # new_cate has a fourth value nobody has looked at. Mapping it to 0 would
    # make it the most sensitive class by accident.
    y, unmapped = encode_target(pd.Series(["Early", "Mystery", "Late"]))
    assert list(y[[0, 2]]) == [0, 2]
    assert pd.isna(y[1])
    assert unmapped == ["mystery"]


def test_numeric_coercion_is_what_broke_so_it_must_not_be_used():
    s = pd.Series(["Early", "Intermediate", "Late"])
    assert pd.to_numeric(s, errors="coerce").notna().sum() == 0
    assert encode_target(s)[0].notna().sum() == 3


# --- the ceiling ----------------------------------------------------------------

def test_perfect_cell_line_agreement_reads_as_the_ceiling():
    a = pd.Series([0, 1, 2] * 10, dtype=float)
    c = ceiling_agreement(a, a.copy())
    assert c["spearman"] > 0.99
    assert c["exact_agreement"] == 1.0
    assert c["n"] == 30


def test_disagreeing_cell_lines_give_a_low_ceiling():
    rng = np.random.default_rng(0)
    a = pd.Series(rng.integers(0, 3, 100), dtype=float)
    b = pd.Series(rng.integers(0, 3, 100), dtype=float)
    c = ceiling_agreement(a, b)
    assert abs(c["spearman"]) < 0.3
    assert c["exact_agreement"] < 0.5


def test_the_ceiling_only_uses_rows_carrying_both_labels():
    a = pd.Series([0.0, 1.0, 2.0, np.nan, np.nan] * 10)
    b = pd.Series([0.0, 1.0, 2.0, 0.0, 1.0] * 10)
    assert ceiling_agreement(a, b)["n"] == 30


def test_too_few_paired_rows_returns_nothing_rather_than_a_number():
    a = pd.Series([0.0, 1.0, np.nan])
    assert ceiling_agreement(a, pd.Series([0.0, 1.0, 2.0])) is None


# --- coverage -------------------------------------------------------------------

def test_a_feature_covering_a_fifth_of_rows_is_refused():
    # score_cryptic has 131 values in 681 rows. Median-imputing 80% of a
    # column invents the feature rather than measuring it.
    df = _master(n=400)
    df.loc[df.index[80:], "score_cryptic"] = np.nan
    _, used, refused = choose_features(df)
    assert "score_cryptic" not in used
    assert any("coverage" in w for c, w in refused if c == "score_cryptic")
    # and the derived margin must not appear without its parent
    assert "score_margin" not in used


# --- reporting defects the first real run exposed --------------------------------

def test_the_alpha_grid_reaches_far_enough_to_be_interior():
    # The first run chose alpha=1000, the top of logspace(-3,3). A boundary
    # choice means CV wanted at least that much shrinkage and maybe more,
    # which the grid could not express.
    df = _master(n=200, signal=False)
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert not res["alpha_at_grid_edge"], res["alpha"]


def test_no_signal_collapses_the_model_to_the_mean_and_says_so():
    df = _master(n=250, signal=False)
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["pred_spread"] < 0.1 * np.ptp(res["y_test"]), res["pred_spread"]
    assert abs(res["spearman"]) < 0.25


def test_real_signal_keeps_the_predictions_spread_out():
    df = _master(n=250, signal=True)
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["pred_spread"] > 0.1 * np.ptp(res["y_test"])


def test_paired_mode_reports_shared_genes_but_they_are_vacuous():
    # In paired mode fit and test are the SAME rows, so every gene is shared
    # by construction. Warning about it invites a reader to discount a fit for
    # a reason that does not apply.
    df = _master(n=120)
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["mode"].startswith("paired")
    assert res["shared_genes"] == df["gene"].nunique()


# --- the computed features, joined in ------------------------------------------

from bajasplice.evaluate.tdp43_sensitivity import COMPUTED_FEATURES


def test_computed_features_are_picked_up_when_present():
    df = _master(n=200)
    rng = np.random.default_rng(1)
    for c in ("ss_acceptor", "ug_run_total", "py_20", "ug_dist_nearest"):
        df[c] = rng.random(len(df))
    _, used, _ = choose_features(df)
    for c in ("ss_acceptor", "ug_run_total", "py_20"):
        assert c in used, c
    assert "log_ug_dist_nearest" in used, "distance needs a log scale too"


def test_computed_features_can_be_switched_off():
    df = _master(n=200)
    df["ss_acceptor"] = 0.5
    _, used, _ = choose_features(df, computed=False)
    assert "ss_acceptor" not in used


def test_a_computed_feature_is_still_refused_if_it_is_mostly_missing():
    df = _master(n=400)
    df["ss_acceptor"] = np.nan
    df.loc[df.index[:50], "ss_acceptor"] = 0.5
    _, used, refused = choose_features(df)
    assert "ss_acceptor" not in used
    assert any("coverage" in w for c, w in refused if c == "ss_acceptor")


def test_the_computed_list_does_not_overlap_the_leakage_guard():
    assert not (set(COMPUTED_FEATURES) & LEAKY)


# --- using every labelled row ---------------------------------------------------
#
# Paired mode fitted on 73 rows while 216 labels sat unused. 73 observations
# against 29 correlated features cannot detect a modest effect, so the row
# budget was the binding constraint, not the feature set.

from bajasplice.evaluate.tdp43_sensitivity import (grouped_cv_fit,
                                                   permutation_null_cv)


def test_the_test_rows_are_never_also_training_rows():
    df = _master(n=240)
    # 160 carry sh, 120 carry be2, 40 carry both
    df.loc[df.index[160:], "tdp43_sensitivity_sh"] = np.nan
    df.loc[df.index[:120], "tdp43_sensitivity_be2"] = np.nan
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert res["n_fit"] == 160, res["n_fit"]
    assert res["n_test"] == 80, res["n_test"]     # 240-160, all unseen
    assert res["n_both"] == 40


def test_it_falls_back_to_paired_and_says_the_rows_were_seen():
    df = _master(n=120)          # every row carries both labels
    X, _, _ = choose_features(df)
    res = fit_transfer(X, df["tdp43_sensitivity_sh"],
                       df["tdp43_sensitivity_be2"], groups=df["gene"])
    assert "WERE seen in training" in res["mode"]


def test_grouped_cv_uses_every_labelled_row_not_just_the_overlap():
    df = _master(n=240, signal=True)
    df.loc[df.index[80:], "tdp43_sensitivity_be2"] = np.nan
    X, _, _ = choose_features(df)
    cv = grouped_cv_fit(X, df["tdp43_sensitivity_sh"], groups=df["gene"])
    assert cv["n"] == 240, "the fitting target has all 240 labels"
    assert cv["spearman"] > 0.2


def test_grouped_cv_finds_nothing_in_noise():
    df = _master(n=240, signal=False)
    X, _, _ = choose_features(df)
    cv = grouped_cv_fit(X, df["tdp43_sensitivity_sh"], groups=df["gene"])
    assert abs(cv["spearman"]) < 0.25, cv["spearman"]


def test_grouped_cv_declines_when_there_are_too_few_genes():
    df = _master(n=40)
    df["gene"] = "one"
    X, _, _ = choose_features(df)
    assert grouped_cv_fit(X, df["tdp43_sensitivity_sh"],
                          groups=df["gene"]) is None


def test_the_cv_null_is_centred_near_zero():
    df = _master(n=150, signal=True)
    X, _, _ = choose_features(df)
    null = permutation_null_cv(X, df["tdp43_sensitivity_sh"],
                               groups=df["gene"], n=15)
    assert len(null) > 5
    assert abs(np.mean(null)) < 0.25, np.mean(null)


def test_the_verdict_advice_is_not_stale_once_the_feature_exists():
    # The verdict told the reader to compute acceptor strength from sequence.
    # After that was done and ss_acceptor was in the fit, the text still said
    # it, which would send a future reader to redo finished work.
    import inspect
    from bajasplice.evaluate import tdp43_sensitivity as m
    src = inspect.getsource(m.main)
    i = src.index("VERDICT")
    tail = src[i:]
    assert '"ss_acceptor" in X.columns' in tail, \
        "the verdict must branch on whether the feature was actually present"
    assert "no longer applies" in tail
