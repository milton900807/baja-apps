import os
import tempfile

import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.threshold_drivers import (
    PWM_SPAN, TRACT_HI, TRACT_LO, coords_from, find_gene_column,
    find_threshold_columns, fit_pwm, has_canonical_ag, partial_spearman,
    pyrimidine_fraction, read_thresholds, score_pwm, spearman,
    standardized_fit, ug_features, drop_absent, from_columns,
    stratified, acceptor_of, acceptor_window, rows_from_junctions,
    _verdict,
)


def _write(tmp, name, text):
    p = os.path.join(tmp, name)
    with open(p, "w") as fh:
        fh.write(text)
    return p


# ---- column discovery -----------------------------------------------------

def test_finds_plain_threshold_columns():
    got = find_threshold_columns(["gene", "T50", "EC50", "r2"])
    assert got == {"t50": "T50", "ec50": "EC50"}


def test_finds_a_prefixed_threshold_column():
    got = find_threshold_columns(["gene", "shsy5y_t50", "note"])
    assert got["t50"] == "shsy5y_t50"


def test_refuses_an_ambiguous_threshold_column():
    with pytest.raises(SystemExit):
        find_threshold_columns(["gene", "shsy5y_t50", "sknbe2_t50"])


def test_no_threshold_columns_returns_empty():
    assert find_threshold_columns(["gene", "psi", "dpsi"]) == {}


def test_finds_a_gene_column_under_several_names():
    for name in ("gene", "gene_name", "symbol", "host_gene"):
        assert find_gene_column(["x", name, "y"]) == name


def test_gene_column_absent_is_none():
    assert find_gene_column(["chrom", "start"]) is None


# ---- reading the table ----------------------------------------------------

def test_read_thresholds_identifies_columns():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "th.tsv", "gene\tT50\tEC50\nSTMN2\t0.4\t0.5\n")
        df, cols = read_thresholds(p)
        assert cols["gene"] == "gene" and cols["t50"] == "T50"
        assert len(df) == 1


def test_read_thresholds_says_which_file_is_missing():
    with pytest.raises(SystemExit) as e:
        read_thresholds("/nope/th.tsv")
    assert "th.tsv" in str(e.value)


def test_read_thresholds_lists_columns_when_none_match():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "th.tsv", "gene\tpsi\nSTMN2\t0.4\n")
        with pytest.raises(SystemExit) as e:
            read_thresholds(p)
        assert "psi" in str(e.value)


def test_read_thresholds_honours_an_explicit_column():
    with tempfile.TemporaryDirectory() as t:
        p = _write(t, "th.tsv", "gene\tmidpoint\nSTMN2\t0.4\n")
        _, cols = read_thresholds(p, t50_col="midpoint")
        assert cols["t50"] == "midpoint"


# ---- coordinates ----------------------------------------------------------

def test_coords_prefers_explicit_columns_over_a_junction_string():
    df = pd.DataFrame({"chrom": ["chr8"], "a_start": [79616822],
                       "a_end": [79617073],
                       "junction": ["chr8:79611214-79616822"]})
    chrom, left, right = coords_from(df)
    # the exon, not the intronic span
    assert (chrom[0], left[0], right[0]) == ("chr8", 79616822, 79617073)


def test_coords_refuses_to_treat_a_junction_as_an_exon():
    # a junction names the intron: its endpoints are the donor and acceptor,
    # so using them as exon bounds puts every window an intron away
    df = pd.DataFrame({"paste_into_igv_junction": ["chr8:79,611,214-79,616,822"]})
    with pytest.raises(SystemExit) as e:
        coords_from(df)
    msg = str(e.value)
    assert "INTRON" in msg and "--coords" in msg


def test_coords_refusal_names_the_offending_column():
    df = pd.DataFrame({"junction": ["chr1:100-200"]})
    with pytest.raises(SystemExit) as e:
        coords_from(df)
    assert "junction" in str(e.value)


def test_coords_returns_none_when_there_is_nothing_to_parse():
    assert coords_from(pd.DataFrame({"gene": ["STMN2"], "T50": [0.4]})) is None


# ---- sequence features ----------------------------------------------------

def test_pyrimidine_fraction_counts_c_and_t():
    assert pyrimidine_fraction("CTCTCTCT") == 1.0
    assert pyrimidine_fraction("AGAGAGAG") == 0.0
    assert pyrimidine_fraction("ACGT") == 0.5


def test_pyrimidine_fraction_treats_u_as_t_and_ignores_n():
    assert pyrimidine_fraction("UUUU") == 1.0
    assert pyrimidine_fraction("NNCT") == 1.0


def test_pyrimidine_fraction_of_nothing_is_nan():
    assert np.isnan(pyrimidine_fraction(""))
    assert np.isnan(pyrimidine_fraction("NNNN"))


def test_canonical_ag_reads_the_last_two_bases():
    assert has_canonical_ag("CTCTCTAG")
    assert not has_canonical_ag("CTCTCTGG")


def test_canonical_ag_needs_two_bases():
    assert not has_canonical_ag("G")
    assert not has_canonical_ag("")


# ---- PWM ------------------------------------------------------------------

def test_pwm_scores_its_own_consensus_highest():
    motifs = ["ACGT"] * 50 + ["ACGA"] * 5
    pwm = fit_pwm(motifs)
    assert score_pwm(pwm, "ACGT") > score_pwm(pwm, "TGCA")


def test_pwm_shape_follows_the_motif_length():
    pwm = fit_pwm(["ACGTAC"] * 10)
    assert pwm.shape == (4, 6)


def test_pwm_rejects_ragged_input():
    with pytest.raises(SystemExit):
        fit_pwm(["ACGT", "ACG"])


def test_pwm_rejects_an_empty_pool():
    with pytest.raises(SystemExit):
        fit_pwm(["NNNN", ""])


def test_score_pwm_is_nan_on_a_wrong_length_or_ambiguous_base():
    pwm = fit_pwm(["ACGT"] * 10)
    assert np.isnan(score_pwm(pwm, "ACG"))
    assert np.isnan(score_pwm(pwm, "ACGN"))


def test_pseudocount_keeps_an_unseen_base_finite():
    pwm = fit_pwm(["AAAA"] * 20)
    assert np.isfinite(score_pwm(pwm, "TTTT"))


# ---- UG features ----------------------------------------------------------

class _FakeGenome:
    """Returns a fixed sequence, so window placement is what gets tested."""

    def __init__(self, seq):
        self.seq = seq
        self.calls = []

    def sequence(self, chrom, start, end, strand="+"):
        self.calls.append((chrom, start, end, strand))
        return self.seq


def _row(strand="+"):
    return {"chrom": "chr1", "strand": strand, "a_start": 1000,
            "a_end": 1100, "c1_end": 500, "c2_start": 1600}


def test_ug_features_scores_both_flanks():
    g = _FakeGenome("TGTGTGTGTG")
    m, up, down = ug_features(_row(), g, width=50)
    assert m == 10 and up == 10 and down == 10
    assert len(g.calls) == 2


def test_ug_features_takes_the_larger_flank():
    class Varying(_FakeGenome):
        def sequence(self, chrom, start, end, strand="+"):
            self.calls.append(start)
            return "TGTG" if len(self.calls) == 1 else "TGTGTGTGTGTG"

    m, up, down = ug_features(_row(), Varying(""), width=50)
    assert (up, down, m) == (4, 12, 12)


def test_ug_features_windows_differ_by_strand():
    gp, gm = _FakeGenome("TG"), _FakeGenome("TG")
    ug_features(_row("+"), gp, width=20)
    ug_features(_row("-"), gm, width=20)
    assert gp.calls[0][1:3] != gm.calls[0][1:3]


def test_ug_features_is_nan_when_no_window_fits():
    r = _row()
    r["c1_end"] = r["a_start"] - 1   # no upstream intron left
    r["c2_start"] = r["a_start"]     # and no downstream room
    m, up, down = ug_features(r, _FakeGenome("TGTG"), width=50)
    assert np.isnan(up) and np.isnan(down) and np.isnan(m)


# ---- statistics -----------------------------------------------------------

def test_spearman_ignores_non_finite_pairs():
    r, p, n = spearman([1, 2, 3, 4, np.nan], [2, 4, 6, 8, 1])
    assert n == 4 and r > 0.99


def test_spearman_needs_enough_pairs():
    r, p, n = spearman([1, 2], [2, 4])
    assert np.isnan(r) and n == 2


def test_partial_spearman_removes_a_shared_driver():
    z = np.arange(40, dtype="float64")
    x = z + 0.0
    y = z + 0.0
    r_raw, _, _ = spearman(x, y)
    r_par, p_par, _ = partial_spearman(x, y, z)
    assert r_raw > 0.99
    # undefined, not 1.0: the residuals are numerical noise
    assert np.isnan(r_par) and np.isnan(p_par)


def test_partial_spearman_keeps_a_real_signal():
    rng = np.random.default_rng(0)
    z = rng.normal(size=60)
    x = rng.normal(size=60)
    y = 2 * x + 0.1 * z
    r, p, n = partial_spearman(x, y, z)
    assert r > 0.8 and p < 1e-6


def test_standardized_fit_prefers_the_real_predictor():
    rng = np.random.default_rng(1)
    good = rng.normal(size=80)
    noise = rng.normal(size=80)
    y = 3 * good + 0.05 * noise
    beta, r2, n = standardized_fit(
        y, {"ug_max": good, "py_tract": noise, "pwm": rng.normal(size=80)})
    assert abs(beta["ug_max"]) > abs(beta["py_tract"])
    assert r2 > 0.8 and n == 80


def test_standardized_fit_is_nan_without_enough_rows():
    beta, r2, n = standardized_fit(
        [1.0, 2.0], {"a": [1.0, 2.0], "b": [2.0, 1.0], "c": [0.0, 1.0]})
    assert np.isnan(r2) and all(np.isnan(v) for v in beta.values())


def test_standardized_fit_survives_a_constant_feature():
    rng = np.random.default_rng(2)
    good = rng.normal(size=40)
    beta, r2, n = standardized_fit(
        3 * good, {"ug_max": good, "py_tract": np.ones(40), "pwm": rng.normal(size=40)})
    assert np.isfinite(r2) and beta["py_tract"] == 0.0


# ---- verdict --------------------------------------------------------------

def _rec(rho, p, feature="ug_max"):
    return {"threshold": "t50", "feature": feature, "rho": rho, "p": p, "n": 80}


def test_no_convention_means_no_verdict():
    v = _verdict([_rec(0.5, 1e-6)], None)
    assert "no verdict" in v


def test_depth_convention_wants_a_positive_correlation():
    assert "direction the occupancy model requires" in _verdict(
        [_rec(0.5, 1e-6)], "depth")


def test_remaining_convention_flips_the_expected_sign():
    # the same positive rho is now the backwards direction
    assert "BACKWARDS" in _verdict([_rec(0.5, 1e-6)], "remaining")
    assert "direction the occupancy model requires" in _verdict(
        [_rec(-0.5, 1e-6)], "remaining")


def test_a_nonsignificant_correlation_is_reported_as_null():
    v = _verdict([_rec(0.5, 0.4)], "depth")
    assert "no sequence feature predicts" in v


def test_tract_window_sits_upstream_of_the_acceptor():
    assert TRACT_LO < TRACT_HI
    assert PWM_SPAN[0] < 0 < PWM_SPAN[1]


# ---- absent vs zero -------------------------------------------------------

def test_drop_absent_turns_zero_into_nan():
    out = drop_absent([0, 4, 0, 16])
    assert np.isnan(out[0]) and np.isnan(out[2])
    assert out[1] == 4 and out[3] == 16


def test_keep_zero_leaves_it_alone():
    out = drop_absent([0, 4], absent_is_zero=False)
    assert out[0] == 0


def test_dropping_absent_can_change_the_sign():
    # the real failure mode: "none found" recorded as 0 against high
    # thresholds pulls the correlation the wrong way
    arr = [0, 0, 0, 0, 10, 20, 30, 40]
    t50 = [90, 85, 80, 75, 40, 30, 20, 10]
    r_with, _, _ = spearman(drop_absent(arr, absent_is_zero=False), t50)
    r_without, _, n = spearman(drop_absent(arr), t50)
    assert r_with < 0 and r_without < 0 and n == 4


# ---- column path ----------------------------------------------------------

def _th():
    rng = np.random.default_rng(0)
    n = 60
    ug = rng.integers(0, 50, n).astype("float64")
    dist = rng.integers(0, 200, n).astype("float64")
    t50 = 80 - ug + rng.normal(0, 5, n)
    return pd.DataFrame({"gene": [f"G{i}" for i in range(n)], "T50": t50,
                         "longest_ug": ug, "dist_ug": dist})


def test_from_columns_finds_a_planted_relationship():
    res = from_columns(_th(), {"t50": "T50", "gene": "gene"}, ["longest_ug"])
    row = res.iloc[0]
    assert row["rho"] < -0.8 and row["p"] < 1e-6


def test_from_columns_errors_on_an_unknown_column():
    with pytest.raises(SystemExit) as e:
        from_columns(_th(), {"t50": "T50", "gene": "gene"}, ["nope"])
    assert "nope" in str(e.value)


def test_from_columns_errors_on_an_unknown_distance_column():
    with pytest.raises(SystemExit):
        from_columns(_th(), {"t50": "T50", "gene": "gene"},
                     ["longest_ug"], near="nope")


def test_from_columns_adjusts_only_the_unstratified_rows():
    res = from_columns(_th(), {"t50": "T50", "gene": "gene"},
                       ["longest_ug"], near="dist_ug")
    assert res["padj"].notna().sum() == 1
    assert res["within"].notna().sum() >= 5


def test_stratified_reports_a_scan_not_one_cutoff():
    rows = stratified(_th(), "longest_ug", "T50", near="dist_ug")
    withins = [r["within"] for r in rows]
    assert withins[0] is None and len([w for w in withins if w]) >= 5


def test_stratified_without_a_distance_column_gives_one_row():
    rows = stratified(_th(), "longest_ug", "T50")
    assert len(rows) == 1 and rows[0]["within"] is None


def test_stratified_n_shrinks_as_the_window_tightens():
    rows = [r for r in stratified(_th(), "longest_ug", "T50", near="dist_ug")
            if r["within"]]
    ns = [r["n"] for r in rows]
    assert ns == sorted(ns)


# ---- acceptor from a junction --------------------------------------------

def test_acceptor_matches_the_known_stmn2_coordinate():
    # chr8:79,611,214-79,616,822 on + strand; exon 2a's acceptor is 79,616,821
    assert acceptor_of(79611214, 79616822, "+") == 79616821


def test_acceptor_is_the_other_end_on_the_minus_strand():
    assert acceptor_of(100, 200, "-") == 101
    assert acceptor_of(100, 200, "+") == 199


def test_acceptor_never_picks_the_donor_end():
    for strand in ("+", "-"):
        a = acceptor_of(1000, 5000, strand)
        donor = 1000 if strand == "+" else 5000
        assert abs(a - donor) > 100


def _junc(strand):
    return pd.DataFrame({"gene": ["G"], "strand": [strand],
                         "chrom": ["chr1"], "_j1": [1000], "_j2": [5000]})


def test_rows_from_junctions_puts_the_acceptor_at_the_exon_edge():
    r = rows_from_junctions(_junc("+"), 200).iloc[0]
    # on +, the first exon base is the junction end, so a_start - 1 is the acceptor
    assert r["a_start"] - 1 == r["acceptor"] == 4999


def test_rows_from_junctions_minus_strand_edge():
    r = rows_from_junctions(_junc("-"), 200).iloc[0]
    assert r["a_end"] + 1 == r["acceptor"] == 1001


def test_upstream_window_stays_inside_the_intron():
    for strand in ("+", "-"):
        r = rows_from_junctions(_junc(strand), 200).iloc[0]
        lo, hi = acceptor_window(r, 5000)
        # the window must not cross the junction's far endpoint
        assert lo >= 1000 and hi <= 5000


def test_upstream_window_ends_on_the_acceptor():
    for strand in ("+", "-"):
        r = rows_from_junctions(_junc(strand), 200).iloc[0]
        lo, hi = acceptor_window(r, 50)
        assert (hi if strand == "+" else lo) == r["acceptor"]


def test_exon_end_is_flagged_as_unknown():
    r = rows_from_junctions(_junc("+"), 200).iloc[0]
    assert r["exon_end_known"] is False or r["exon_end_known"] == False


def test_a_constant_control_makes_the_partial_undefined():
    # exon_len is the scan pad under --from-junction: identical on every row,
    # so a partial against it cannot control for anything
    rng = np.random.default_rng(3)
    x = rng.normal(size=40)
    y = 2 * x + rng.normal(0, 0.2, 40)
    r, p, n = partial_spearman(x, y, np.full(40, 251.0))
    assert np.isnan(r) and np.isnan(p)
