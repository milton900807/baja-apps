"""The buffer test: direction sets, frame arithmetic, and the 2x2."""
import numpy as np
import pytest

import pandas as pd

from bajasplice.evaluate.buffer_test import (direction_sets, frame_flag,
                                             fisher_2x2, bh, summarize,
                                             class_level)


def _mat(n_events=10, n_kd=2):
    return np.zeros((n_events, n_kd)), np.zeros((n_events, n_kd))


def test_repressed_is_inclusion_up_and_enhanced_is_down():
    Z, D = _mat()
    Z[0, 0], D[0, 0] = 5.0, 0.3        # up on knockdown -> was repressed
    Z[1, 0], D[1, 0] = -5.0, -0.3      # down on knockdown -> was enhanced
    rep, enh, unt = direction_sets(Z, D, ["X", "Y"], "X")
    assert rep.tolist() == [0]
    assert enh.tolist() == [1]
    assert 0 not in unt and 1 not in unt


def test_an_event_moving_both_ways_is_dropped_not_assigned():
    Z, D = _mat(n_kd=2)
    Z[0, 0], D[0, 0] = 5.0, 0.3
    Z[0, 1], D[0, 1] = -5.0, -0.3      # the same event, the other way
    rep, enh, unt = direction_sets(Z, D, ["X", "X"], "X")
    assert 0 not in rep and 0 not in enh
    assert 0 not in unt              # and it is not quietly counted as untouched


def test_a_big_z_with_a_small_dpsi_does_not_count():
    Z, D = _mat()
    Z[0, 0], D[0, 0] = 9.0, 0.02       # significant and trivial
    rep, enh, unt = direction_sets(Z, D, ["X", "Y"], "X")
    assert rep.tolist() == []
    assert 0 in unt


def test_untested_events_are_not_called_untouched():
    Z, D = _mat()
    Z[:] = np.nan
    D[:] = np.nan
    rep, enh, unt = direction_sets(Z, D, ["X", "Y"], "X")
    assert len(unt) == 0


def test_an_rbp_not_in_the_columns_returns_none():
    Z, D = _mat()
    assert direction_sets(Z, D, ["X", "Y"], "ZZZ") is None


def test_frame_flag_is_true_only_off_multiples_of_three():
    assert frame_flag([3, 6, 99]).tolist() == [False, False, False]
    assert frame_flag([1, 2, 100]).tolist() == [True, True, True]


def test_fisher_is_one_sided_in_the_stated_direction():
    orr, p = fisher_2x2(80, 100, 20, 100)
    assert orr > 1 and p < 1e-10
    orr, p = fisher_2x2(20, 100, 80, 100)
    assert orr < 1 and p > 0.99          # the other way round is not significant


def test_fisher_on_equal_rates_is_not_significant():
    orr, p = fisher_2x2(50, 100, 50, 100)
    assert p > 0.4


def test_summarize_reports_all_three_groups():
    flag = np.array([True, True, False, False, True, False])
    r = summarize("X", flag, np.array([0, 1]), np.array([2, 3]), np.array([4, 5]), "frame")
    assert r["rate_repressed"] == 1.0
    assert r["rate_enhanced"] == 0.0
    assert r["rate_untouched"] == 0.5
    assert r["n_repressed"] == 2 and r["n_enhanced"] == 2


def test_summarize_gives_all_three_contrasts():
    flag = np.array([True, True, False, False, True, False])
    r = summarize("X", flag, np.array([0, 1]), np.array([2, 3]), np.array([4, 5]), "frame")
    for k in ("p_rep_vs_unt", "p_enh_vs_unt", "p_rep_vs_enh"):
        assert k in r


def test_the_odds_ratio_is_the_repressed_against_untouched_one():
    # THE PRIMARY CONTRAST CHANGED. An earlier version compared repressed with
    # enhanced and read the verdict off it, which the TARDBP row then gamed
    # through its enhanced side.
    flag = np.array([True, True, True, True, False, False])
    rep, enh, unt = np.array([0, 1]), np.array([2, 3]), np.array([4, 5])
    r = summarize("X", flag, rep, enh, unt, "frame")
    assert r["rate_repressed"] == 1.0 and r["rate_enhanced"] == 1.0
    assert r["odds_ratio"] > 1          # against untouched at 0.0, not against enhanced
    assert r["p_rep_vs_enh"] > 0.5      # the two directions are identical


def test_summarize_survives_an_empty_direction():
    flag = np.array([True, False])
    r = summarize("X", flag, np.array([0]), np.array([], dtype=int), np.array([1]), "frame")
    assert np.isnan(r["rate_enhanced"])
    assert np.isnan(r["p_rep_vs_enh"])


def test_continuous_axis_uses_medians_and_the_lower_direction():
    vals = np.array([0.1, 0.2, 5.0, 6.0, 3.0, 3.1])
    r = summarize("X", vals, np.array([0, 1]), np.array([2, 3]), np.array([4, 5]),
                  "phylop", continuous=True)
    assert r["rate_repressed"] < r["rate_untouched"] < r["rate_enhanced"]
    assert np.isnan(r["odds_ratio"])


def test_a_nan_value_is_dropped_not_counted_as_zero():
    vals = np.array([1.0, np.nan, 0.0, 0.0, 0.0, 0.0])
    r = summarize("X", vals, np.array([0, 1]), np.array([2, 3]), np.array([4, 5]), "frame")
    assert r["n_repressed"] == 1            # the nan is gone
    assert r["rate_repressed"] == 1.0       # not 0.5


def _class_frame(rep, enh, unt):
    return pd.DataFrame({"rate_repressed": rep, "rate_enhanced": enh,
                         "rate_untouched": unt})


def test_class_level_sees_an_asymmetric_shift():
    n = 40
    rng = np.random.default_rng(0)
    unt = np.full(n, 0.5)
    rep = unt + 0.05 + rng.normal(0, 0.01, n)
    enh = unt + rng.normal(0, 0.01, n)
    cl = class_level(_class_frame(rep, enh, unt))
    assert cl["median_rep_shift"] > 0.04
    assert cl["p_rep_shift_nonzero"] < 0.001
    assert cl["p_rep_shift_exceeds_enh"] < 0.001


def test_class_level_calls_a_symmetric_shift_symmetric():
    # BOTH DIRECTIONS SHIFTED EQUALLY is a fact about regulatable exons, and
    # this is the case the first version of the verdict got wrong.
    n = 40
    rng = np.random.default_rng(1)
    unt = np.full(n, 0.5)
    rep = unt + 0.05 + rng.normal(0, 0.01, n)
    enh = unt + 0.05 + rng.normal(0, 0.01, n)
    cl = class_level(_class_frame(rep, enh, unt))
    assert cl["p_rep_shift_nonzero"] < 0.001       # there IS a shift
    assert cl["p_rep_shift_exceeds_enh"] > 0.05    # but no asymmetry


def test_class_level_needs_enough_proteins():
    assert class_level(_class_frame([0.5] * 5, [0.5] * 5, [0.5] * 5)) is None


def test_bh_is_monotone_and_handles_nan():
    adj = bh([0.001, 0.02, 0.5, 1.0])
    assert adj[0] < adj[1] < adj[2] <= adj[3]
    assert np.isnan(bh([0.01, np.nan])[1])


def test_class_level_reports_both_paired_directions():
    n = 40
    rng = np.random.default_rng(2)
    unt = np.full(n, 0.5)
    rep = unt + rng.normal(0, 0.01, n)
    enh = unt + 0.05 + rng.normal(0, 0.01, n)   # ENHANCEMENT is the shifted one
    cl = class_level(_class_frame(rep, enh, unt))
    assert cl["p_rep_shift_exceeds_enh"] > 0.9
    assert cl["p_enh_shift_exceeds_rep"] < 0.001
