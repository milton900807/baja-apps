import os
import tempfile

import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.constraint_axis import (
    AG_SPAN, EXCLUDE, SS_SPAN, Scores, acceptor_from_exon,
    acceptor_from_junction, acceptor_pwm, ag_positions, annotated_acceptors,
    build, calibrate, chrom_exon_bounds, describe, gene_exon_bounds,
    genomic_pos, genomic_span,
    intron_of, matched_decoys, nearest_boundary, paired, pick_decoys, pooled,
    PWM_SPAN, random_positions, read_events, score_rows, site_sequence,
    strength_of, STRENGTH_TOL, summarize, _verdict,
    flank_spans, score_flank, tail_excess, within_intron_pctile,
    FLANK_INNER, FLANK_OUTER, TAIL_PCTS,
    acceptor_dinucleotide, ag_rate, coordinate_check, _coordinate_note,
    by_strand, strands_disagree, control_events, _control_verdict,
    apply_requires, null_events, _null_verdict, DECOY_UNITS,
    DECOY_UNITS_BOTH,
)


def _write(tmp, name, text):
    p = os.path.join(tmp, name)
    with open(p, "w") as fh:
        fh.write(text)
    return p


# ---- coordinates ----------------------------------------------------------

def test_offset_runs_with_the_transcript_on_the_plus_strand():
    assert genomic_pos(1000, "+", -20) == 980
    assert genomic_pos(1000, "+", 0) == 1000
    assert genomic_pos(1000, "+", 3) == 1003


def test_offset_runs_against_the_coordinate_on_the_minus_strand():
    assert genomic_pos(1000, "-", -20) == 1020
    assert genomic_pos(1000, "-", 0) == 1000
    assert genomic_pos(1000, "-", 3) == 997


def test_span_comes_back_sorted_on_both_strands():
    assert genomic_span(1000, "+", -20, 3) == (980, 1003)
    assert genomic_span(1000, "-", -20, 3) == (997, 1020)


def test_minus_strand_span_covers_the_intron_not_the_exon():
    # On the minus strand the intron is at HIGHER coordinates than the
    # acceptor, so a span that is mostly intronic must extend upward.
    start, end = genomic_span(1000, "-", -20, 3)
    assert end - 1000 == 20
    assert 1000 - start == 3


def test_ag_span_is_two_bases():
    assert genomic_span(500, "+", *AG_SPAN) == (499, 500)
    assert genomic_span(500, "-", *AG_SPAN) == (500, 501)


def test_acceptor_from_junction_matches_the_validated_stmn2_site():
    # chr8:79,611,214-79,616,822 on the plus strand, acceptor 79,616,821.
    assert acceptor_from_junction(79611214, 79616822, "+") == 79616821


def test_acceptor_from_junction_flips_end_on_the_minus_strand():
    assert acceptor_from_junction(1000, 2000, "-") == 1001


def test_acceptor_from_exon_is_outside_the_exon():
    assert acceptor_from_exon(500, 600, "+") == 499
    assert acceptor_from_exon(500, 600, "-") == 601


def test_intron_excludes_both_flanking_exon_bases():
    assert intron_of(1000, 2000) == (1001, 1999)
    assert intron_of(2000, 1000) == (1001, 1999)


# ---- AG discovery ---------------------------------------------------------

def test_ag_positions_on_the_plus_strand_point_at_the_g():
    # lo=100: "ttAGtt" puts the G at index 3, so position 103.
    assert ag_positions("TTAGTT", 100, 105, "+") == [103]


def test_decoys_default_to_the_acceptors_own_class():
    # Matched, not orientation-free: the ~0.11 gap between forward AG and
    # forward CT cancels only when event and decoys are the same class.
    assert tuple(DECOY_UNITS) == ("AG",)
    assert set(DECOY_UNITS_BOTH) == {"AG", "CT"}


def test_the_default_decoy_set_takes_only_ag():
    assert ag_positions("AGTTCT", 100, 105, "+") == [101]
    assert ag_positions("AGTTCT", 100, 105, "+",
                        units=DECOY_UNITS_BOTH) == [101, 105]


def test_the_both_class_loci_are_the_same_either_way_they_are_read():
    # The property the mirror demanded: holding both AG and CT, the set of
    # dinucleotide LOCI is identical whichever way the locus is read. The
    # reported position is the unit's second base in transcript orientation,
    # so it sits one base apart between readings; comparing the pair's lower
    # genomic coordinate takes that out.
    fwd = "TTAGTTCTAA"
    rev = "".join(_COMP[b] for b in reversed(fwd))
    plus = {p - 1 for p in ag_positions(fwd, 100, 109, "+",
                                        units=DECOY_UNITS_BOTH)}
    minus = {p for p in ag_positions(rev, 100, 109, "-",
                                     units=DECOY_UNITS_BOTH)}
    assert plus == minus == {102, 106}


def test_the_reported_positions_differ_by_exactly_one_base():
    fwd = "TTAGTTCTAA"
    rev = "".join(_COMP[b] for b in reversed(fwd))
    plus = sorted(ag_positions(fwd, 100, 109, "+", units=DECOY_UNITS_BOTH))
    minus = sorted(ag_positions(rev, 100, 109, "-", units=DECOY_UNITS_BOTH))
    assert plus == [103, 107]
    assert minus == [102, 106]


def test_a_single_orientation_set_does_not_even_match_on_loci():
    fwd = "TTAGTTCTAA"
    rev = "".join(_COMP[b] for b in reversed(fwd))
    plus = {p - 1 for p in ag_positions(fwd, 100, 109, "+")}
    minus = {p for p in ag_positions(rev, 100, 109, "-")}
    assert plus != minus





def test_ag_positions_on_the_minus_strand_count_down_from_hi():
    # The sequence is already transcript-oriented, so index 3 is hi-3.
    assert ag_positions("TTAGTT", 100, 105, "-") == [102]


def test_overlapping_ag_runs_are_all_found():
    assert ag_positions("AGAG", 10, 13, "+") == [11, 13]


def test_no_ag_gives_no_positions():
    assert ag_positions("TTTTCCCC", 10, 17, "+") == []
    assert ag_positions("AAAATTTT", 10, 17, "+", units=DECOY_UNITS_BOTH) == []


# ---- the annotation -------------------------------------------------------

def _exons():
    return pd.DataFrame({
        "chrom": ["chr1"] * 4 + ["chr2"] * 2,
        "start": [100, 500, 900, 500, 100, 700],
        "end": [200, 600, 1000, 620, 200, 800],
        "strand": ["+"] * 4 + ["-"] * 2,
        "transcript_id": ["t1", "t1", "t1", "t2", "t3", "t3"],
        "gene_name": ["AAA"] * 4 + ["BBB"] * 2,
    })


def test_gene_bounds_collect_every_edge_once():
    b = gene_exon_bounds(_exons(), ["AAA"])
    assert b["AAA"][0] == "chr1"
    assert list(b["AAA"][2]) == [100, 200, 500, 600, 620, 900, 1000]


def test_gene_bounds_ignore_genes_not_asked_for():
    b = gene_exon_bounds(_exons(), ["AAA"])
    assert "BBB" not in b


def test_annotated_acceptors_sit_in_the_intron_on_each_strand():
    # t1 runs 100-200, 500-600, 900-1000 on the plus strand, so its
    # acceptors are 499 and 899; 99 belongs to the first exon and is a
    # promoter position, not a splice site. t2 is a single exon 500-620 and
    # contributes nothing. t3 runs 700-800 then 100-200 on the minus strand,
    # so its only acceptor is 201.
    a = annotated_acceptors(_exons(), ["AAA", "BBB"])
    plus = set(a.loc[a["strand"] == "+", "pos"])
    minus = set(a.loc[a["strand"] == "-", "pos"])
    assert plus == {499, 899}
    assert minus == {201}


def test_the_first_exon_of_a_transcript_contributes_no_acceptor():
    a = annotated_acceptors(_exons(), ["AAA"])
    assert 99 not in set(a["pos"])


def test_a_single_exon_transcript_contributes_nothing():
    one = pd.DataFrame({
        "chrom": ["chr1"], "start": [100], "end": [200], "strand": ["+"],
        "transcript_id": ["solo"], "gene_name": ["AAA"]})
    assert annotated_acceptors(one, ["AAA"]).empty


def test_the_dropped_exon_is_the_five_prime_one_on_the_minus_strand():
    # The minus-strand transcript's 5' end is its HIGHEST coordinate, so the
    # exon with the largest end is the one without an acceptor.
    t = pd.DataFrame({
        "chrom": ["chr1"] * 3, "start": [100, 500, 900],
        "end": [200, 600, 1000], "strand": ["-"] * 3,
        "transcript_id": ["m"] * 3, "gene_name": ["ZZZ"] * 3})
    a = annotated_acceptors(t, ["ZZZ"])
    assert set(a["pos"]) == {201, 601}
    assert 1001 not in set(a["pos"])


def test_annotated_acceptors_deduplicate_shared_sites():
    a = annotated_acceptors(_exons(), ["AAA"])
    assert len(a) == len(a.drop_duplicates(subset=["chrom", "pos", "strand"]))


def test_chrom_bounds_collect_every_gene_not_just_one():
    # BBB's exons are on chr2 in the fixture; a gene-scoped lookup for AAA
    # would miss a neighbour sharing a chromosome, which is the whole point.
    ex = _exons().copy()
    ex.loc[ex["gene_name"] == "BBB", "chrom"] = "chr1"
    b = chrom_exon_bounds(ex)
    assert set(b) == {"chr1"}
    assert 700 in b["chr1"] and 800 in b["chr1"]
    assert 100 in b["chr1"] and 1000 in b["chr1"]


def test_chrom_bounds_keep_chromosomes_apart():
    b = chrom_exon_bounds(_exons())
    assert 900 in b["chr1"]
    assert 900 not in b["chr2"]


def test_nearest_boundary_takes_the_closer_side():
    b = np.array([100, 500])
    assert nearest_boundary(110, b) == 10
    assert nearest_boundary(480, b) == 20
    assert nearest_boundary(500, b) == 0


def test_nearest_boundary_with_no_exons_is_infinite():
    assert nearest_boundary(10, np.array([], dtype=np.int64)) == np.inf


# ---- decoys and the floor -------------------------------------------------

def test_decoys_keep_clear_of_the_cryptic_acceptor():
    got = pick_decoys([1000, 1010, 1200], acceptor=1000,
                      bounds=np.array([], dtype=np.int64), exclude=50)
    assert got == [1200]


def test_decoys_keep_clear_of_annotated_exon_edges():
    got = pick_decoys([1200, 1400], acceptor=1000,
                      bounds=np.array([1410]), exclude=50)
    assert got == [1200]


def test_decoys_are_capped_per_intron():
    got = pick_decoys(list(range(2000, 2100)), acceptor=1000,
                      bounds=np.array([], dtype=np.int64), exclude=50, cap=7,
                      rng=np.random.default_rng(1))
    assert len(got) == 7
    assert got == sorted(got)


def test_decoy_cap_of_zero_keeps_everything():
    got = pick_decoys([2000, 2010], acceptor=1000,
                      bounds=np.array([], dtype=np.int64), exclude=50, cap=0)
    assert got == [2000, 2010]


def test_random_positions_land_inside_the_intron():
    got = random_positions(1000, 3000, acceptor=1500,
                           bounds=np.array([], dtype=np.int64), n=20,
                           rng=np.random.default_rng(0))
    assert len(got) == 20
    assert all(1000 <= p <= 3000 for p in got)
    assert all(abs(p - 1500) > EXCLUDE for p in got)


def test_random_positions_give_up_rather_than_loop_forever():
    # Every position in a tiny intron is inside the exclusion zone.
    got = random_positions(1000, 1020, acceptor=1010,
                           bounds=np.array([], dtype=np.int64), n=5,
                           rng=np.random.default_rng(0))
    assert got == []


def test_empty_intron_gives_no_random_positions():
    assert random_positions(1000, 1000, 900,
                            np.array([], dtype=np.int64)) == []


# ---- the score track ------------------------------------------------------

def _track(tmp, rows):
    text = "chrom\tpos\tscore\n" + "".join(
        f"{c}\t{p}\t{s}\n" for c, p, s in rows)
    return Scores(_write(tmp, "scores.tsv", text))


def test_table_track_reads_one_based_inclusive():
    with tempfile.TemporaryDirectory() as tmp:
        s = _track(tmp, [("chr1", 100, 1.0), ("chr1", 101, 3.0)])
        assert list(s.values("chr1", 100, 101)) == [1.0, 3.0]
        assert s.mean("chr1", 100, 101) == 2.0


def test_uncovered_positions_are_nan_not_zero():
    with tempfile.TemporaryDirectory() as tmp:
        s = _track(tmp, [("chr1", 100, 2.0)])
        v = s.values("chr1", 100, 102)
        assert v[0] == 2.0
        assert np.isnan(v[1]) and np.isnan(v[2])
        assert s.mean("chr1", 100, 102) == 2.0
        assert s.covered("chr1", 100, 102) == pytest.approx(1 / 3)


def test_a_window_with_no_data_is_nan_not_a_number():
    with tempfile.TemporaryDirectory() as tmp:
        s = _track(tmp, [("chr1", 100, 2.0)])
        assert np.isnan(s.mean("chr1", 500, 510))
        assert np.isnan(s.mean("chr9", 100, 110))


def test_reversed_window_is_empty_rather_than_wrapping():
    with tempfile.TemporaryDirectory() as tmp:
        s = _track(tmp, [("chr1", 100, 2.0)])
        assert len(s.values("chr1", 110, 100)) == 0


def test_score_table_without_the_columns_is_refused():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "bad.tsv", "chrom\tstart\tvalue\nchr1\t1\t2\n")
        with pytest.raises(SystemExit):
            Scores(p)


def test_score_rows_reads_the_requested_span():
    with tempfile.TemporaryDirectory() as tmp:
        s = _track(tmp, [("chr1", 99, 4.0), ("chr1", 100, 6.0)])
        rows = [{"chrom": "chr1", "pos": 100, "strand": "+"}]
        v, cov = score_rows(s, rows, AG_SPAN)
        assert v[0] == 5.0
        assert cov[0] == 1.0


def test_score_rows_shift_moves_with_the_strand():
    with tempfile.TemporaryDirectory() as tmp:
        s = _track(tmp, [("chr1", 200, 9.0), ("chr1", 201, 9.0)])
        plus = [{"chrom": "chr1", "pos": 199, "strand": "+"}]
        minus = [{"chrom": "chr1", "pos": 202, "strand": "-"}]
        assert score_rows(s, plus, AG_SPAN, shift=2)[0][0] == 9.0
        assert score_rows(s, minus, AG_SPAN, shift=2)[0][0] == 9.0


# ---- events ---------------------------------------------------------------

def test_events_read_from_a_junction_table():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv",
                   "gene\tjunction\tstrand\n"
                   "STMN2\tchr8:79,611,214-79,616,822\t+\n")
        ev = read_events(p)
        assert len(ev) == 1
        assert ev.loc[0, "acceptor"] == 79616821
        assert ev.loc[0, "intron_start"] == 79611215
        assert ev.loc[0, "intron_end"] == 79616821


def test_events_read_from_an_exon_table():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv",
                   "gene\tchrom\ta_start\ta_end\tstrand\n"
                   "AAA\tchr1\t500\t600\t+\n"
                   "BBB\tchr2\t500\t600\t-\n")
        ev = read_events(p)
        assert set(ev["acceptor"]) == {499, 601}


def test_events_without_a_strand_are_refused():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv", "gene\tchrom\ta_start\ta_end\nA\tchr1\t5\t6\n")
        with pytest.raises(SystemExit):
            read_events(p)


def test_events_without_a_gene_are_refused():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv", "chrom\ta_start\ta_end\tstrand\nchr1\t5\t6\t+\n")
        with pytest.raises(SystemExit):
            read_events(p)


def test_events_drop_rows_with_an_unusable_strand():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv",
                   "gene\tchrom\ta_start\ta_end\tstrand\n"
                   "AAA\tchr1\t500\t600\t+\n"
                   "BBB\tchr1\t700\t800\t.\n")
        assert len(read_events(p)) == 1


def test_duplicate_acceptors_collapse():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv",
                   "gene\tchrom\ta_start\ta_end\tstrand\n"
                   "AAA\tchr1\t500\t600\t+\n"
                   "AAA\tchr1\t500\t650\t+\n")
        assert len(read_events(p)) == 1


def test_fate_column_is_carried_through():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv",
                   "gene\tchrom\ta_start\ta_end\tstrand\tfate\n"
                   "AAA\tchr1\t500\t600\t+\tin_frame\n")
        assert read_events(p).loc[0, "fate"] == "in_frame"


def test_gene_symbols_are_normalized_for_matching():
    with tempfile.TemporaryDirectory() as tmp:
        p = _write(tmp, "ev.tsv",
                   "gene\tchrom\ta_start\ta_end\tstrand\n"
                   " stmn2 \tchr1\t500\t600\t+\n")
        assert read_events(p).loc[0, "gene"] == "STMN2"


# ---- row filtering --------------------------------------------------------

def _compendium(tmp):
    """A table shaped like a real compendium: many rows per junction."""
    return _write(tmp, "comp.csv",
                  "gene_name,paste_into_igv_junction,strand,is_cryptic,comparison\n"
                  "STMN2,chr8:79611214-79616822,+,True,ds1\n"
                  "STMN2,chr8:79611214-79616822,+,True,ds2\n"
                  "AAA,chr1:1000-2000,+,False,ds1\n"
                  "BBB,chr2:5000-6000,-,True,ds1\n")


def test_require_keeps_only_matching_rows():
    df = pd.DataFrame({"flag": ["True", "False", "True"], "x": [1, 2, 3]})
    assert list(apply_requires(df, ["flag=True"])["x"]) == [1, 3]


def test_require_ignores_case_and_padding():
    df = pd.DataFrame({"flag": [" TRUE ", "false"], "x": [1, 2]})
    assert list(apply_requires(df, ["flag=true"])["x"]) == [1]


def test_require_can_be_stacked():
    df = pd.DataFrame({"a": ["y", "y", "n"], "b": ["1", "2", "1"],
                       "x": [1, 2, 3]})
    got = apply_requires(df, ["a=y", "b=1"])
    assert list(got["x"]) == [1]


def test_require_without_an_equals_is_refused():
    with pytest.raises(SystemExit):
        apply_requires(pd.DataFrame({"a": ["y"]}), ["a"])


def test_require_on_a_missing_column_is_refused():
    with pytest.raises(SystemExit):
        apply_requires(pd.DataFrame({"a": ["y"]}), ["b=y"])


def test_require_that_matches_nothing_is_refused_with_the_values():
    with pytest.raises(SystemExit) as e:
        apply_requires(pd.DataFrame({"a": ["y", "n"]}), ["a=maybe"])
    assert "holds" in str(e.value)


def test_no_require_changes_nothing():
    df = pd.DataFrame({"a": ["y", "n"]})
    assert len(apply_requires(df, [])) == 2
    assert len(apply_requires(df, None)) == 2


def test_events_filter_then_deduplicate_a_compendium():
    with tempfile.TemporaryDirectory() as tmp:
        ev = read_events(_compendium(tmp), requires=["is_cryptic=True"])
        # Two STMN2 rows collapse to one acceptor; AAA is filtered out.
        assert sorted(ev["gene"]) == ["BBB", "STMN2"]
        assert ev.loc[ev.gene == "STMN2", "acceptor"].iloc[0] == 79616821


def test_a_compendium_read_unfiltered_keeps_the_non_cryptic_rows():
    with tempfile.TemporaryDirectory() as tmp:
        ev = read_events(_compendium(tmp))
        assert "AAA" in set(ev["gene"])


# ---- statistics -----------------------------------------------------------

def test_describe_ignores_missing_scores():
    d = describe("x", [1.0, np.nan, 3.0])
    assert d["n"] == 2
    assert d["median"] == 2.0


def test_describe_of_nothing_does_not_raise():
    assert describe("x", [np.nan, np.nan])["n"] == 0


def test_pooled_finds_a_real_shift():
    a = np.arange(30) + 10.0
    b = np.arange(30) * 1.0
    r = pooled(a, b)
    assert r["diff_median"] == pytest.approx(10.0)
    assert r["p"] < 0.001


def test_pooled_with_too_few_points_is_nan_not_an_error():
    assert np.isnan(pooled([1.0, 2.0], [3.0, 4.0])["p"])


def test_paired_detects_a_within_pair_shift():
    rng = np.random.default_rng(0)
    base = rng.normal(0, 1, 60)
    r = paired(base + 0.8, base, n_boot=200)
    assert r["n_pairs"] == 60
    assert r["p"] < 0.001
    assert r["lo"] > 0


def test_paired_interval_brackets_a_null():
    rng = np.random.default_rng(1)
    a = rng.normal(0, 1, 80)
    b = rng.normal(0, 1, 80)
    r = paired(a, b, n_boot=400)
    assert r["p"] > 0.05
    assert r["lo"] < 0 < r["hi"]


def test_paired_drops_pairs_with_a_missing_member():
    a = np.array([1.0, 2.0, np.nan, 4.0, 5.0, 6.0, 7.0])
    b = np.array([0.0, 1.0, 3.0, np.nan, 4.0, 5.0, 6.0])
    assert paired(a, b, n_boot=100)["n_pairs"] == 5


def test_paired_identical_inputs_report_an_exact_null():
    # Not "unavailable": the difference is zero and that is an answer.
    a = np.arange(20) * 1.0
    r = paired(a, a.copy(), n_boot=50)
    assert r["diff_median"] == 0.0
    assert r["p"] == 1.0
    assert r["note"] == "every pair identical"


def test_paired_too_few_pairs_says_which_problem_it_is():
    r = paired([1.0, 2.0, 3.0], [1.5, 2.5, 3.5], n_boot=50)
    assert np.isnan(r["p"])
    assert r["note"] == "too few pairs"


# ---- calibration ----------------------------------------------------------

def test_calibration_peaks_at_zero_when_coordinates_are_right():
    with tempfile.TemporaryDirectory() as tmp:
        rows, track = [], []
        for i in range(40):
            acc = 1000 + i * 100
            rows.append({"chrom": "chr1", "pos": acc, "strand": "+"})
            for off in range(-4, 5):
                track.append(("chr1", acc + off, 5.0 if off in (-1, 0) else 0.1))
        s = _track(tmp, track)
        cal = calibrate(s, rows)
        assert cal.loc[cal["mean"].idxmax(), "shift"] == 0


def test_calibration_names_the_shift_when_coordinates_are_off_by_one():
    with tempfile.TemporaryDirectory() as tmp:
        rows, track = [], []
        for i in range(40):
            acc = 1000 + i * 100
            rows.append({"chrom": "chr1", "pos": acc, "strand": "+"})
            for off in range(-4, 5):
                # The conserved AG actually sits one base further in.
                track.append(("chr1", acc + off, 5.0 if off in (0, 1) else 0.1))
        s = _track(tmp, track)
        cal = calibrate(s, rows)
        assert cal.loc[cal["mean"].idxmax(), "shift"] == 1


# ---- the coordinate check -------------------------------------------------

_COMP = {"A": "T", "C": "G", "G": "C", "T": "A", "N": "N"}


class _AgGenome:
    """A real little genome: a forward dict plus honest reverse complementing.

    `plant(pos, strand)` writes the bases that make `pos` read AG at
    transcript offsets -1 and 0 on that strand. `off` shifts every planted
    site by that many GENOMIC bases, which is how a strand-dependent
    coordinate error is reproduced: the same genomic shift moves a
    plus-strand site one way in transcript terms and a minus-strand site the
    other.
    """

    def __init__(self, off=0):
        self.off = off
        self.fwd = {}

    def plant(self, pos, strand):
        p = int(pos) + self.off
        if strand == "+":
            self.fwd[p - 1] = "A"
            self.fwd[p] = "G"
        else:
            self.fwd[p + 1] = "T"   # revcomp -> A
            self.fwd[p] = "C"       # revcomp -> G
        return self

    def sequence(self, chrom, start, end, strand="+"):
        fwd = "".join(self.fwd.get(p, "T")
                      for p in range(int(start), int(end) + 1))
        if strand == "-":
            return "".join(_COMP[b] for b in reversed(fwd))
        return fwd


def _ag_rows(g, n=30, base=1000, step=50, strand="+"):
    rows = []
    for i in range(n):
        pos = base + step * i
        g.plant(pos, strand)
        rows.append({"chrom": "chr1", "pos": pos, "strand": strand})
    return rows


def test_acceptor_dinucleotide_reads_ag_on_the_plus_strand():
    g = _AgGenome().plant(1000, "+")
    assert acceptor_dinucleotide(g, "chr1", 1000, "+") == "AG"


def test_acceptor_dinucleotide_reads_ag_on_the_minus_strand():
    g = _AgGenome().plant(1000, "-")
    assert acceptor_dinucleotide(g, "chr1", 1000, "-") == "AG"


def test_acceptor_dinucleotide_is_not_ag_one_base_over():
    g = _AgGenome().plant(1000, "+")
    assert acceptor_dinucleotide(g, "chr1", 1001, "+") != "AG"


def test_ag_rate_is_one_when_every_site_is_canonical():
    g = _AgGenome()
    rate, ok, n = ag_rate(g, _ag_rows(g))
    assert n == 30 and ok == 30 and rate == 1.0


def test_ag_rate_is_one_on_the_minus_strand_too():
    g = _AgGenome()
    assert ag_rate(g, _ag_rows(g, strand="-"))[0] == 1.0


def test_ag_rate_falls_when_the_position_is_off():
    g = _AgGenome()
    rows = _ag_rows(g)
    assert ag_rate(g, rows, shift=1)[0] < 1.0


def test_ag_rate_recovers_at_the_shift_that_corrects_the_error():
    g = _AgGenome(off=1)
    rows = _ag_rows(g)
    assert ag_rate(g, rows, shift=0)[0] < 1.0
    assert ag_rate(g, rows, shift=1)[0] == 1.0


def test_the_same_genomic_error_needs_opposite_shifts_on_the_two_strands():
    # This is the whole reason the check is per strand: one convention
    # mismatch, two different corrections.
    gp, gm = _AgGenome(off=1), _AgGenome(off=1)
    rp, rm = _ag_rows(gp), _ag_rows(gm, strand="-")
    assert ag_rate(gp, rp, shift=1)[0] == 1.0
    assert ag_rate(gm, rm, shift=-1)[0] == 1.0


def _events_for(g, strands=("+", "-")):
    rows = []
    base = 1000
    for st in strands:
        for i in range(20):
            pos = base + 50 * i
            g.plant(pos, st)
            rows.append({"chrom": "chr1", "acceptor": pos, "strand": st})
        base += 5000
    return pd.DataFrame(rows)


def test_coordinate_check_reports_each_strand_separately():
    g = _AgGenome()
    out = coordinate_check(g, _events_for(g), shifts=(0, 1))
    assert set(out["strand"]) == {"+", "-"}
    assert len(out) == 4


def test_a_clean_table_passes_on_both_strands():
    g = _AgGenome()
    out = coordinate_check(g, _events_for(g))
    at0 = out[out["shift"] == 0]
    assert (at0["rate"] == 1.0).all()
    assert _coordinate_note(out) is None


def test_a_base_off_table_produces_a_coordinate_note():
    g = _AgGenome(off=1)
    note = _coordinate_note(coordinate_check(g, _events_for(g, ("+",))))
    assert note is not None
    assert "COORDINATES ARE OFF" in note
    assert "shift +1" in note


def test_the_note_names_the_opposite_shift_on_the_minus_strand():
    g = _AgGenome(off=1)
    note = _coordinate_note(coordinate_check(g, _events_for(g, ("-",))))
    assert "strand -" in note
    assert "shift -1" in note


def test_the_coordinate_note_names_only_the_broken_strand():
    # The error this catches is antisymmetric, so one strand can be fine.
    g = _AgGenome()
    check = coordinate_check(g, _events_for(g))
    bad = check.copy()
    bad.loc[bad["strand"] == "+", "rate"] = 0.3
    bad.loc[bad["strand"] == "+", "AG"] = 6
    note = _coordinate_note(bad)
    assert "strand +" in note
    assert "strand -" not in note


def test_an_empty_check_is_silent():
    assert _coordinate_note(pd.DataFrame()) is None
    assert _coordinate_note(None) is None


def test_calibration_can_split_by_strand():
    with tempfile.TemporaryDirectory() as tmp:
        rows, track = [], []
        for i in range(40):
            acc = 1000 + i * 100
            st = "+" if i % 2 else "-"
            rows.append({"chrom": "chr1", "pos": acc, "strand": st})
            for off in range(-4, 5):
                track.append(("chr1", acc + off, 5.0 if off in (-1, 0) else 0.1))
        s = _track(tmp, track)
        cal = calibrate(s, rows, by_strand=True)
        assert set(cal["strand"]) == {"+", "-"}
        # The plus-strand AG sits at offsets -1,0; the minus-strand one would
        # sit at +1,0 in genomic terms, so only the plus block peaks at 0.
        plus = cal[cal["strand"] == "+"]
        assert int(plus.loc[plus["mean"].idxmax(), "shift"]) == 0


def test_pooled_calibration_keeps_its_old_shape():
    with tempfile.TemporaryDirectory() as tmp:
        rows, track = [], []
        for i in range(40):
            acc = 1000 + i * 100
            rows.append({"chrom": "chr1", "pos": acc, "strand": "+"})
            for off in range(-4, 5):
                track.append(("chr1", acc + off, 5.0 if off in (-1, 0) else 0.1))
        cal = calibrate(_track(tmp, track), rows)
        assert "strand" not in cal.columns


# ---- flank, percentile and the tail ---------------------------------------

def test_flank_spans_cut_the_site_out_of_its_own_background():
    lo, hi = flank_spans(1000, "+", inner=60, outer=260)
    assert lo == (740, 939)
    assert hi == (1061, 1260)


def test_flank_spans_are_symmetric_across_strands():
    plus = flank_spans(1000, "+", inner=10, outer=50)
    minus = flank_spans(1000, "-", inner=10, outer=50)
    assert sorted(plus) == sorted(minus)


def test_flank_excludes_the_site_from_the_average():
    with tempfile.TemporaryDirectory() as tmp:
        track = [("chr1", p, 0.0) for p in range(800, 1201)]
        track += [("chr1", p, 9.0) for p in range(995, 1006)]
        s = _track(tmp, track)
        # The spike is inside the inner window, so the flank must not see it.
        assert s.mean("chr1", 995, 1005) == 9.0
        assert score_flank(s, "chr1", 1000, "+", inner=10, outer=100) == 0.0


def test_flank_is_nan_where_the_track_has_nothing():
    with tempfile.TemporaryDirectory() as tmp:
        s = _track(tmp, [("chr1", 1000, 1.0)])
        assert np.isnan(score_flank(s, "chr1", 50000, "+"))


def test_percentile_places_a_score_in_its_own_distribution():
    d = list(np.arange(100) / 100.0)
    pctile, above = within_intron_pctile(0.97, d)
    assert pctile == pytest.approx(0.97)
    assert above[95] is True
    assert above[99] is False


def test_percentile_needs_enough_decoys_to_mean_anything():
    pctile, above = within_intron_pctile(5.0, [0.1, 0.2, 0.3])
    assert np.isnan(pctile)
    assert all(v is None for v in above.values())


def test_percentile_ignores_a_missing_cryptic_score():
    pctile, _ = within_intron_pctile(np.nan, list(range(50)))
    assert np.isnan(pctile)


def test_a_dead_intron_makes_a_mediocre_score_look_top_decile():
    # The point of ranking within the intron: an absolute score of zero is
    # remarkable in a dead intron and unremarkable in a conserved one.
    dead = list(np.linspace(-2.0, -0.5, 60))
    live = list(np.linspace(0.5, 3.0, 60))
    assert within_intron_pctile(0.0, dead)[1][95] is True
    assert within_intron_pctile(0.0, live)[1][95] is False


def test_tail_excess_counts_against_the_threshold_null():
    ev = pd.DataFrame({"above_p95": [True] * 20 + [False] * 80})
    out = tail_excess(ev, pcts=(95,))
    r = out.iloc[0]
    assert r["k"] == 20 and r["n"] == 100
    assert r["expected"] == pytest.approx(0.05)
    assert r["fold"] == pytest.approx(4.0)
    assert r["p"] < 1e-6


def test_tail_excess_finds_nothing_when_the_rate_matches_chance():
    ev = pd.DataFrame({"above_p95": [True] * 5 + [False] * 95})
    assert tail_excess(ev, pcts=(95,)).iloc[0]["p"] > 0.3


def test_tail_excess_declines_to_test_a_handful_of_events():
    ev = pd.DataFrame({"above_p95": [True, False, True]})
    assert np.isnan(tail_excess(ev, pcts=(95,)).iloc[0]["p"])


def test_tail_excess_skips_thresholds_the_table_lacks():
    ev = pd.DataFrame({"above_p95": [True] * 20 + [False] * 80})
    assert len(tail_excess(ev, pcts=(95, 99))) == 1


# ---- the mirror -----------------------------------------------------------

def test_mirroring_a_strand_leaves_the_position_alone():
    # The whole point: the base is the same, only the reading turns around.
    ev = pd.DataFrame({"gene": ["A", "B"], "chrom": ["chr1"] * 2,
                       "strand": ["+", "-"], "acceptor": [1000, 2000],
                       "intron_start": [1, 2000], "intron_end": [1000, 7000]})
    flip = {"+": "-", "-": "+"}
    out = ev.assign(strand=ev["strand"].map(flip))
    assert list(out["acceptor"]) == [1000, 2000]
    assert list(out["intron_start"]) == [1, 2000]
    assert list(out["strand"]) == ["-", "+"]


def test_a_symmetric_window_is_unmoved_by_the_mirror():
    # -12,11 is not symmetric; -12,12 is. The mirror test needs a span whose
    # genomic interval is identical on both strands, or the window moves and
    # decoy orientation is no longer the only variable.
    assert genomic_span(1000, "+", -12, 12) == genomic_span(1000, "-", -12, 12)
    assert genomic_span(1000, "+", -20, 3) != genomic_span(1000, "-", -20, 3)


def test_the_default_window_does_move_under_the_mirror():
    plus = genomic_span(1000, "+", *SS_SPAN)
    minus = genomic_span(1000, "-", *SS_SPAN)
    assert plus != minus
    assert plus[1] - plus[0] == minus[1] - minus[0]


def test_mirroring_swaps_which_dinucleotide_a_decoy_is():
    # A transcript AG on the plus strand is forward AG; mirrored, the same
    # interval yields transcript AGs that are forward CT.
    g = _AgGenome()
    g.fwd.update({100: "A", 101: "G"})
    assert acceptor_dinucleotide(g, "chr1", 101, "+") == "AG"
    assert acceptor_dinucleotide(g, "chr1", 101, "-") != "AG"


# ---- the negative control -------------------------------------------------

def _null_inputs():
    exons = pd.DataFrame({
        "chrom": ["chr1"] * 2, "start": [1000, 20000], "end": [1200, 20200],
        "strand": ["+"] * 2, "transcript_id": ["t1"] * 2,
        "gene_name": ["AAA"] * 2})
    events = pd.DataFrame([{
        "gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": 10000,
        "intron_start": 1201, "intron_end": 19999, "fate": "in_frame"}])
    return events, exons


def test_null_events_move_the_acceptor():
    events, exons = _null_inputs()
    got = null_events(events, exons, _FakeGenome(), seed=1)
    assert len(got) == 1
    assert got.loc[0, "acceptor"] != 10000


def test_null_events_keep_everything_else():
    events, exons = _null_inputs()
    got = null_events(events, exons, _FakeGenome(), seed=1)
    for col in ("gene", "chrom", "strand", "intron_start", "intron_end",
                "fate"):
        assert got.loc[0, col] == events.loc[0, col]


def test_null_acceptors_land_inside_the_intron():
    events, exons = _null_inputs()
    got = null_events(events, exons, _FakeGenome(), seed=2)
    a = int(got.loc[0, "acceptor"])
    assert 1201 <= a <= 19999


def test_null_acceptors_keep_clear_of_the_real_one_and_of_exons():
    events, exons = _null_inputs()
    for seed in range(8):
        got = null_events(events, exons, _FakeGenome(), seed=seed, exclude=50)
        a = int(got.loc[0, "acceptor"])
        assert abs(a - 10000) > 50
        assert min(abs(a - b) for b in (1000, 1200, 20000, 20200)) > 50


def test_null_events_are_sampled_differently_with_a_different_seed():
    events, exons = _null_inputs()
    picks = {int(null_events(events, exons, _FakeGenome(), seed=s)
                 .loc[0, "acceptor"]) for s in range(6)}
    assert len(picks) > 1


def test_null_events_can_be_capped():
    events, exons = _null_inputs()
    many = pd.concat([events] * 10, ignore_index=True)
    assert len(null_events(many, exons, _FakeGenome(), n=4, seed=0)) == 4


def test_an_intron_with_no_eligible_ag_is_dropped_not_kept():
    # Keeping it at its real acceptor would mix a real site into the null.
    class _NoAg:
        def sequence(self, chrom, start, end, strand="+"):
            return "T" * (int(end) - int(start) + 1)
    events, exons = _null_inputs()
    assert null_events(events, exons, _NoAg(), seed=0).empty


# ---- the negative control's verdict ---------------------------------------

def _tail_rows(folds):
    return pd.DataFrame([
        {"threshold": f"above own decoys' p{q}", "k": int(1000 * f * (100 - q) / 100),
         "n": 1000, "observed": f * (100 - q) / 100, "expected": (100 - q) / 100,
         "fold": f, "p": 1e-9 if f > 1.3 else 0.5}
        for q, f in folds])


def test_a_clean_negative_control_passes_everything():
    out = _null_verdict(
        {"diff_median": 0.002, "p": 0.9, "lo": -0.03, "hi": 0.04,
         "n_pairs": 400},
        _tail_rows([(90, 1.0), (95, 1.02), (99, 0.98)]), None)
    assert "FAIL" not in out
    assert "tail statistic is calibrated" in out


def test_a_biased_contrast_fails_and_says_by_how_much():
    out = _null_verdict(
        {"diff_median": 0.12, "p": 1e-6, "lo": 0.05, "hi": 0.19,
         "n_pairs": 400},
        _tail_rows([(95, 1.0)]), None)
    assert "FAIL  paired contrast" in out
    assert "biased by this much" in out


def test_an_uncalibrated_tail_fails_and_names_the_factor():
    out = _null_verdict(
        {"diff_median": 0.0, "p": 0.9, "lo": -0.03, "hi": 0.04,
         "n_pairs": 400},
        _tail_rows([(90, 1.9), (95, 2.6), (99, 5.9)]), None)
    assert "FAIL" in out
    assert "NOT calibrated" in out
    assert "5.90-fold" in out
    assert "beat that factor" in out


def test_the_null_verdict_reports_both_strands():
    bs = pd.DataFrame([
        {"strand": "+", "n_pairs": 200, "diff_median": 0.01, "lo": -0.05,
         "hi": 0.07, "p": 0.8},
        {"strand": "-", "n_pairs": 200, "diff_median": 0.2, "lo": 0.1,
         "hi": 0.3, "p": 1e-5}])
    out = _null_verdict(
        {"diff_median": 0.1, "p": 0.01, "lo": 0.02, "hi": 0.18,
         "n_pairs": 400}, None, bs)
    assert "Both belong at zero" in out
    assert "+0.2" in out


def test_the_null_verdict_never_mentions_cryptic_findings():
    out = _null_verdict(
        {"diff_median": 0.3, "p": 1e-9, "lo": 0.2, "hi": 0.4,
         "n_pairs": 400},
        _tail_rows([(95, 3.0)]), None)
    assert "FALSIFIED" not in out
    assert "TWO POPULATIONS" not in out
    assert "phylogeny" not in out


# ---- the positive control -------------------------------------------------

def _big_exons(n=120):
    """Enough annotated exons on both strands to sample a control from."""
    rows = []
    for i in range(n):
        st = "+" if i % 2 else "-"
        base = 100000 + i * 20000
        for k in range(3):
            rows.append({"chrom": "chr1", "start": base + k * 6000,
                         "end": base + k * 6000 + 150, "strand": st,
                         "transcript_id": f"t{i}", "gene_name": f"G{i}"})
    return pd.DataFrame(rows)


def test_control_events_look_like_real_events():
    ev = control_events(_big_exons(), {f"G{i}" for i in range(120)}, n=40)
    assert set(["gene", "chrom", "strand", "acceptor", "intron_start",
                "intron_end"]) <= set(ev.columns)
    assert len(ev) == 40


def test_control_events_are_balanced_across_strands():
    ev = control_events(_big_exons(), {f"G{i}" for i in range(120)}, n=60)
    counts = ev["strand"].value_counts()
    assert counts["+"] == counts["-"]


def test_control_acceptors_sit_in_the_intron_on_each_strand():
    ex = _big_exons()
    ev = control_events(ex, {f"G{i}" for i in range(120)}, n=40)
    starts = set(ex["start"]); ends = set(ex["end"])
    for _, r in ev.iterrows():
        if r["strand"] == "+":
            assert r["acceptor"] + 1 in starts
        else:
            assert r["acceptor"] - 1 in ends


def test_control_search_window_runs_upstream_on_both_strands():
    ev = control_events(_big_exons(), {f"G{i}" for i in range(120)}, n=40,
                        upstream=3000)
    for _, r in ev.iterrows():
        if r["strand"] == "+":
            assert r["intron_end"] == r["acceptor"]
            assert r["intron_start"] == r["acceptor"] - 3000
        else:
            assert r["intron_start"] == r["acceptor"]
            assert r["intron_end"] == r["acceptor"] + 3000


def test_control_events_with_no_annotation_is_empty():
    assert control_events(pd.DataFrame(
        columns=["chrom", "start", "end", "strand", "transcript_id",
                 "gene_name"]), {"X"}) .empty


def test_control_mode_keeps_acceptors_that_sit_on_exon_edges():
    # Every annotated acceptor is one base from an exon boundary, so the
    # ordinary clear filter would discard the entire control set.
    with tempfile.TemporaryDirectory() as tmp:
        exons = pd.DataFrame({
            "chrom": ["chr1"] * 2, "start": [1000, 9000], "end": [1200, 9100],
            "strand": ["+"] * 2, "transcript_id": ["t1"] * 2,
            "gene_name": ["AAA"] * 2})
        events = pd.DataFrame([{
            "gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": 8999,
            "intron_start": 1201, "intron_end": 8999}])
        s = _track(tmp, [("chr1", p, 1.0) for p in range(1201, 9000)])
        _, plain = build(events, exons, _FakeGenome(), s, exclude=50)
        _, ctrl = build(events, exons, _FakeGenome(), s, exclude=50,
                        control=True)
        assert bool(plain.loc[0, "clear"]) is False
        assert bool(ctrl.loc[0, "clear"]) is True


# ---- the control's own verdict --------------------------------------------

def _ctrl_strands(plus, minus):
    return pd.DataFrame([
        {"strand": "+", "n_pairs": 200, "diff_median": plus, "lo": plus - 0.15,
         "hi": plus + 0.15, "p": 1e-28},
        {"strand": "-", "n_pairs": 200, "diff_median": minus,
         "lo": minus - 0.27, "hi": minus + 0.25, "p": 1e-32}])


def test_the_control_verdict_says_it_is_not_about_cryptic_exons():
    out = _control_verdict({"diff_median": 1.95},
                           {"diff_median": 1.92, "lo": 1.77, "hi": 2.04},
                           _ctrl_strands(1.799, 2.072))
    assert out.startswith("POSITIVE CONTROL")
    assert "none of this is about cryptic exons" in out
    assert "FALSIFIED" not in out
    assert "TWO POPULATIONS" not in out


def test_the_control_verdict_names_the_strand_bias():
    # The real run: plus 1.799, minus 2.072, so the bias is 0.273.
    out = _control_verdict({"diff_median": 1.95},
                           {"diff_median": 1.92, "lo": 1.77, "hi": 2.04},
                           _ctrl_strands(1.799, 2.072))
    assert "STRAND BIAS OF THIS MEASUREMENT IS 0.273" in out
    assert "floor" in out


def test_the_control_verdict_flags_a_dead_pipeline():
    out = _control_verdict({"diff_median": 0.01},
                           {"diff_median": -0.02, "lo": -0.2, "hi": 0.1},
                           _ctrl_strands(0.0, 0.0))
    assert "BROKEN" in out
    assert "STRAND BIAS" not in out


def test_the_control_verdict_wants_the_per_strand_split():
    out = _control_verdict({"diff_median": 1.95},
                           {"diff_median": 1.92, "lo": 1.77, "hi": 2.04}, None)
    assert "No per-strand split" in out


def test_the_control_verdict_asks_whether_the_bias_scales():
    out = _control_verdict({"diff_median": 1.95},
                           {"diff_median": 1.92, "lo": 1.77, "hi": 2.04},
                           _ctrl_strands(1.799, 2.072))
    assert "additive or proportional" in out


# ---- the per-strand gate --------------------------------------------------

def _strand_events(plus_shift, minus_shift, n=60, seed=0):
    """Events whose cryptic score beats their decoys by a per-strand amount."""
    rng = np.random.default_rng(seed)
    rows = []
    for st, shift in (("+", plus_shift), ("-", minus_shift)):
        base = rng.normal(0, 0.5, n)
        for i in range(n):
            rows.append({"strand": st, "decoy": base[i],
                         "cryptic": base[i] + shift + rng.normal(0, 0.1),
                         "above_p95": bool(shift > 0.2 and i % 4 == 0)})
    return pd.DataFrame(rows)


def test_by_strand_reports_one_row_per_strand():
    bs = by_strand(_strand_events(0.0, 0.0))
    assert list(bs["strand"]) == ["+", "-"]
    assert (bs["n_pairs"] == 60).all()


def test_by_strand_needs_both_strands():
    ev = _strand_events(0.0, 0.0)
    assert by_strand(ev[ev["strand"] == "+"]) is None


def test_by_strand_carries_the_tail_rates():
    bs = by_strand(_strand_events(0.0, 0.5))
    assert "p95_rate" in bs.columns
    assert "p95_null" in bs.columns
    assert bs.loc[bs["strand"] == "-", "p95_rate"].iloc[0] > 0


def test_agreeing_strands_are_not_discordant():
    assert strands_disagree(by_strand(_strand_events(0.0, 0.0))) is False
    assert strands_disagree(by_strand(_strand_events(0.5, 0.5))) is False


def test_an_effect_on_one_strand_only_is_discordant():
    assert strands_disagree(by_strand(_strand_events(0.0, 0.5))) is True


def test_opposite_effects_are_discordant():
    assert strands_disagree(by_strand(_strand_events(-0.5, 0.5))) is True


def test_discordance_needs_something_to_compare():
    assert strands_disagree(None) is False
    assert strands_disagree(pd.DataFrame()) is False


def test_discordance_suppresses_the_whole_verdict():
    # The v4 run: plus -0.051 p 0.31, minus +0.214 p 2e-05.
    bs = pd.DataFrame([
        {"strand": "+", "n_pairs": 113, "diff_median": -0.0505, "lo": -0.151,
         "hi": 0.054, "p": 0.313},
        {"strand": "-", "n_pairs": 112, "diff_median": 0.2139, "lo": 0.117,
         "hi": 0.312, "p": 1.95e-05}])
    out = _verdict(_good_control(),
                   {"diff_median": 0.0641, "p": 0.0223, "lo": 0.0036,
                    "hi": 0.1305, "n_pairs": 225}, 1.806,
                   by_strand=bs, discordant=True)
    assert out.startswith("STRANDS DISAGREE")
    assert "No verdict" in out
    assert "a tail, not a shift" not in out
    assert "TWO POPULATIONS" not in out
    assert "CONSISTENT with no selection" not in out


def test_agreeing_strands_let_the_verdict_run():
    bs = pd.DataFrame([
        {"strand": "+", "n_pairs": 113, "diff_median": 0.01, "lo": -0.05,
         "hi": 0.07, "p": 0.7},
        {"strand": "-", "n_pairs": 112, "diff_median": 0.02, "lo": -0.04,
         "hi": 0.08, "p": 0.6}])
    out = _verdict(_good_control(),
                   {"diff_median": 0.015, "p": 0.6, "lo": -0.04, "hi": 0.07,
                    "n_pairs": 225}, 1.806,
                   by_strand=bs, discordant=False)
    assert "STRANDS DISAGREE" not in out
    assert "CONSISTENT with no selection" in out


def test_summarize_runs_the_per_strand_split():
    with tempfile.TemporaryDirectory() as tmp:
        pos, ev = _two_events(tmp, 5000, 4000)
        ev = pd.concat([ev] * 30, ignore_index=True)
        ev["clear"] = True
        ev["strand"] = ["+"] * 30 + ["-"] * 30
        rng = np.random.default_rng(0)
        ev["decoy"] = rng.normal(0, 0.3, 60)
        ev["cryptic"] = ev["decoy"] + np.where(
            ev["strand"] == "-", 0.6, 0.0) + rng.normal(0, 0.05, 60)
        ev["decoy_matched"] = ev["decoy"]
        ev["intron"] = ev["decoy"]
        ev["pctile"] = 0.5
        res = summarize(pos, ev)
        assert res["by_strand"] is not None
        assert res["discordant"] is True


# ---- the verdict ----------------------------------------------------------

def _good_control():
    return {"diff_median": 2.0, "p": 1e-8}


def test_a_failed_control_suppresses_the_verdict():
    out = _verdict({"diff_median": 0.01, "p": 0.6},
                   {"diff_median": 0.0, "p": 0.9, "lo": -0.1, "hi": 0.1,
                    "n_pairs": 300}, 0.01)
    assert "CONTROL FAILED" in out
    assert "No verdict" in out
    assert "CONSISTENT" not in out


def test_a_negative_control_difference_also_fails():
    out = _verdict({"diff_median": -1.0, "p": 1e-9},
                   {"diff_median": 0.0, "p": 0.9, "lo": -0.1, "hi": 0.1,
                    "n_pairs": 300}, 1.0)
    assert "CONTROL FAILED" in out


def test_a_null_primary_reports_what_it_excludes():
    out = _verdict(_good_control(),
                   {"diff_median": 0.02, "p": 0.7, "lo": -0.15, "hi": 0.19,
                    "n_pairs": 320}, 2.0)
    assert "CONSISTENT with no selection" in out
    assert "excludes a difference larger than" in out
    assert "10%" in out


def test_cryptic_above_decoy_is_falsification_only_when_matching_holds():
    hi = {"diff_median": 0.9, "p": 1e-4, "lo": 0.4, "hi": 1.3, "n_pairs": 300}
    out = _verdict(_good_control(), hi, 2.0,
                   matched={"diff_median": 0.8, "p": 1e-3, "lo": 0.3,
                            "hi": 1.2})
    assert "FALSIFIED" in out
    assert "ABOVE" in out
    assert "45%" in out


def test_falsification_needs_the_matched_interval_to_clear_zero_too():
    hi = {"diff_median": 0.9, "p": 1e-4, "lo": 0.4, "hi": 1.3, "n_pairs": 300}
    out = _verdict(_good_control(), hi, 2.0,
                   matched={"diff_median": 0.8, "p": 1e-3, "lo": -0.1,
                            "hi": 1.5})
    assert "FALSIFIED" not in out


def test_a_significant_p_with_an_interval_through_zero_settles_nothing():
    # The run that produced this: p 0.00127 with a CI of -0.012 to +0.131.
    # Calling that falsification was the bug.
    thin = {"diff_median": 0.0504, "p": 0.00127, "lo": -0.0119, "hi": 0.1308,
            "n_pairs": 335}
    out = _verdict(_good_control(), thin, 1.805,
                   matched={"diff_median": 0.1029, "p": 0.00038, "lo": 0.025,
                            "hi": 0.167})
    assert "NOT SUPPORTED either way" in out
    assert "FALSIFIED" not in out
    assert "includes zero" in out


def test_every_branch_states_the_effect_against_the_control_scale():
    thin = {"diff_median": 0.0504, "p": 0.00127, "lo": -0.0119, "hi": 0.1308,
            "n_pairs": 335}
    out = _verdict(_good_control(), thin, 1.805)
    assert "3%" in out


def test_cryptic_above_decoy_is_a_confound_when_matching_kills_it():
    hi = {"diff_median": 0.9, "p": 1e-4, "lo": 0.4, "hi": 1.3, "n_pairs": 300}
    out = _verdict(_good_control(), hi, 2.0,
                   matched={"diff_median": 0.05, "p": 0.7, "lo": -0.3,
                            "hi": 0.4})
    assert "FALSIFIED" not in out
    assert "better splice sites than arbitrary AGs" in out


def test_a_missing_control_is_not_reported_as_a_failed_one():
    # The difference matters: one says the result did not reproduce under
    # matching, the other says nobody checked.
    hi = {"diff_median": 0.9, "p": 1e-4, "lo": 0.4, "hi": 1.3, "n_pairs": 300}
    out = _verdict(_good_control(), hi, 2.0, matched=None)
    assert "FALSIFIED" not in out
    assert "DID NOT RUN" in out
    assert "does NOT survive" not in out


def test_an_unfittable_control_is_also_reported_as_not_run():
    hi = {"diff_median": 0.9, "p": 1e-4, "lo": 0.4, "hi": 1.3, "n_pairs": 300}
    out = _verdict(_good_control(), hi, 2.0,
                   matched={"diff_median": np.nan, "p": np.nan})
    assert "DID NOT RUN" in out


def test_cryptic_below_decoy_is_not_called_falsification():
    out = _verdict(_good_control(),
                   {"diff_median": -0.5, "p": 1e-3, "lo": -0.8, "hi": -0.2,
                    "n_pairs": 300}, 2.0)
    assert "FALSIFIED" not in out
    assert "BELOW" in out


def test_too_few_pairs_says_so_instead_of_concluding():
    out = _verdict(_good_control(),
                   {"diff_median": np.nan, "p": np.nan, "lo": np.nan,
                    "hi": np.nan, "n_pairs": 3}, 2.0)
    assert "unavailable" in out
    assert "CONSISTENT" not in out


def test_a_reproducing_matched_contrast_is_not_called_a_collapse():
    # The v2 run: the matched effect was LARGER and more significant than the
    # primary, and only its interval straddled zero. Calling that a failure
    # to survive matching misdescribed the data.
    pri = {"diff_median": 0.0641, "p": 0.0223, "lo": 0.0036, "hi": 0.1305,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   matched={"diff_median": 0.1058, "p": 0.00204,
                            "lo": -0.0091, "hi": 0.1942})
    assert "REPRODUCES" in out
    assert "COLLAPSES" not in out
    assert "not pinned down" in out


def test_a_collapsing_matched_contrast_is_still_called_a_collapse():
    pri = {"diff_median": 0.0641, "p": 0.0223, "lo": 0.0036, "hi": 0.1305,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   matched={"diff_median": 0.004, "p": 0.8, "lo": -0.1,
                            "hi": 0.1})
    assert "COLLAPSES" in out


def test_a_tail_excess_is_reported_as_a_tail_not_a_shift():
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    tail = pd.DataFrame([
        {"threshold": "above own decoys' p95", "k": 29, "n": 225,
         "observed": 29 / 225, "expected": 0.05, "fold": 2.58, "p": 3.4e-6},
        {"threshold": "above own decoys' p99", "k": 16, "n": 225,
         "observed": 16 / 225, "expected": 0.01, "fold": 7.1, "p": 1.7e-9}])
    out = _verdict(_good_control(), pri, 1.806, tail=tail)
    assert "a tail, not a shift" in out
    assert "7.1-fold" in out
    assert "describes" in out


def test_a_tail_at_chance_is_not_announced():
    pri = {"diff_median": 0.0, "p": 0.9, "lo": -0.1, "hi": 0.1,
           "n_pairs": 225}
    tail = pd.DataFrame([
        {"threshold": "above own decoys' p95", "k": 11, "n": 225,
         "observed": 11 / 225, "expected": 0.05, "fold": 0.98, "p": 0.6}])
    out = _verdict(_good_control(), pri, 1.806, tail=tail)
    assert "a tail, not a shift" in out  # the shape is still stated
    assert "0.98" in out or "1.0-fold" in out


def test_a_flat_conserved_minority_is_called_not_a_splice_site():
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   peak={"diff_median": -1.4, "p": 1e-5, "n_tail": 29})
    assert "does NOT look like splice sites" in out
    assert "plateau" in out


def test_a_peaking_conserved_minority_is_called_a_splice_site():
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   peak={"diff_median": 0.05, "p": 0.8, "n_tail": 29})
    assert "much as" in out
    assert "worth naming individually" in out


def test_a_significant_peak_difference_is_not_called_insignificant():
    # The control run printed "does not reach significance (p 2.92e-07)".
    pri = {"diff_median": 1.92, "p": 1e-59, "lo": 1.77, "hi": 2.04,
           "n_pairs": 400}
    out = _verdict(_good_control(), pri, 1.95,
                   peak={"diff_median": 0.524, "p": 2.92e-07, "n_tail": 261,
                         "tail_peak": 1.339, "rest_peak": -0.105,
                         "ann_peak": 0.815, "n_rest": 139})
    assert "does not reach significance" not in out
    assert "at p 2.92e-07" in out


def test_an_insignificant_peak_difference_still_says_so():
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   peak={"diff_median": 0.3, "p": 0.257, "n_tail": 29,
                         "tail_peak": 0.998, "rest_peak": 0.006,
                         "ann_peak": 0.698, "n_rest": 196})
    assert "does not reach significance (p 0.257)" in out


def test_a_peaking_minority_beside_a_flat_majority_is_called_a_mixture():
    # The v3 run: tail peaks 0.998, annotated 0.698, the other 196 flat at
    # 0.006. One number for "the cryptic exons" describes neither group.
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   peak={"diff_median": 0.3, "p": 0.257, "n_tail": 29,
                         "tail_peak": 0.998, "rest_peak": 0.006,
                         "ann_peak": 0.698, "n_rest": 196})
    assert "TWO POPULATIONS" in out
    assert "mostly accidents" in out
    assert "phylogeny" in out


def test_the_mixture_message_falls_back_without_the_group_medians():
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   peak={"diff_median": 0.3, "p": 0.257, "n_tail": 29,
                         "tail_peak": np.nan, "rest_peak": 0.006,
                         "ann_peak": 0.698, "n_rest": 196})
    assert "TWO POPULATIONS" not in out
    assert "much as" in out


def test_a_strand_asymmetry_is_called_a_bug_and_put_first():
    # The v3 run: minus 0.663 vs plus 0.450 on a measure normalized inside
    # each intron, which no biology can produce on a strandless track.
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   strand={"p": 0.0002, "minus_median": 0.663,
                           "plus_median": 0.450})
    assert out.startswith("STRAND ASYMMETRY")
    assert "not a biological result" in out.lower()
    assert "derived a base off" in out


def test_a_balanced_strand_check_is_not_mentioned():
    pri = {"diff_median": 0.064, "p": 0.02, "lo": 0.004, "hi": 0.13,
           "n_pairs": 225}
    out = _verdict(_good_control(), pri, 1.806,
                   strand={"p": 0.6, "minus_median": 0.51,
                           "plus_median": 0.49})
    assert "STRAND ASYMMETRY" not in out


def test_summarize_checks_strand_on_the_normalized_measure():
    with tempfile.TemporaryDirectory() as tmp:
        pos, ev = _two_events(tmp, 5000, 4000)
        ev = pd.concat([ev] * 12, ignore_index=True)
        ev["clear"] = True
        ev["strand"] = ["+"] * 12 + ["-"] * 12
        ev["pctile"] = [0.4] * 12 + [0.9] * 12
        ev["cryptic"] = 0.1
        ev["decoy"] = 0.0
        ev["decoy_matched"] = 0.0
        ev["intron"] = 0.0
        res = summarize(pos, ev)
        assert res["strand"] is not None
        assert res["strand"]["minus_median"] > res["strand"]["plus_median"]


def test_a_conserved_in_frame_subset_is_called_out():
    out = _verdict(_good_control(),
                   {"diff_median": 0.0, "p": 0.8, "lo": -0.1, "hi": 0.1,
                    "n_pairs": 300}, 2.0,
                   fate={"diff_median": 0.7, "p": 0.004})
    assert "fate split is NOT null" in out


def test_a_null_fate_split_is_reported_as_adding_nothing():
    out = _verdict(_good_control(),
                   {"diff_median": 0.0, "p": 0.8, "lo": -0.1, "hi": 0.1,
                    "n_pairs": 300}, 2.0,
                   fate={"diff_median": 0.05, "p": 0.6})
    assert "adds nothing" in out


# ---- splice-site strength -------------------------------------------------

class _SeqGenome:
    """Returns the genomic interval it was asked for, so spans are checkable."""

    def __init__(self, seq_by_pos=None):
        self.calls = []
        self.seq_by_pos = seq_by_pos or {}

    def sequence(self, chrom, start, end, strand="+"):
        self.calls.append((chrom, int(start), int(end), strand))
        n = int(end) - int(start) + 1
        return self.seq_by_pos.get((int(start), int(end)), "A" * n)


def test_site_sequence_asks_for_the_pwm_span_on_the_plus_strand():
    g = _SeqGenome()
    site_sequence(g, "chr1", 1000, "+")
    assert g.calls == [("chr1", 980, 1002, "+")]


def test_site_sequence_asks_upward_on_the_minus_strand():
    g = _SeqGenome()
    site_sequence(g, "chr1", 1000, "-")
    assert g.calls == [("chr1", 998, 1020, "-")]


def test_pwm_needs_enough_acceptors_to_fit():
    g = _SeqGenome()
    few = pd.DataFrame({"chrom": ["chr1"] * 5, "pos": [100, 200, 300, 400, 500],
                        "strand": ["+"] * 5})
    assert acceptor_pwm(g, few) is None


def test_pwm_fits_from_enough_acceptors():
    g = _SeqGenome()
    many = pd.DataFrame({"chrom": ["chr1"] * 80,
                         "pos": list(range(1000, 1000 + 80 * 50, 50)),
                         "strand": ["+"] * 80})
    pwm = acceptor_pwm(g, many)
    assert pwm is not None
    assert pwm.shape == (4, PWM_SPAN[1] - PWM_SPAN[0] + 1)


def test_pwm_sampling_caps_the_number_of_sequences_read():
    g = _SeqGenome()
    many = pd.DataFrame({"chrom": ["chr1"] * 300,
                         "pos": list(range(1000, 1000 + 300 * 50, 50)),
                         "strand": ["+"] * 300})
    acceptor_pwm(g, many, sample=120)
    assert len(g.calls) == 120


def test_strength_without_a_pwm_is_nan_not_zero():
    assert np.isnan(strength_of(_SeqGenome(), None, "chr1", 100, "+"))


def test_strength_scores_a_real_site_above_a_poor_one():
    from bajasplice.evaluate.threshold_drivers import fit_pwm
    n = PWM_SPAN[1] - PWM_SPAN[0] + 1
    good = "T" * (n - 3) + "CAG"
    pwm = fit_pwm([good] * 60)
    g = _SeqGenome({(980, 1002): good, (1980, 2002): "A" * n})
    hi = strength_of(g, pwm, "chr1", 1000, "+")
    lo = strength_of(g, pwm, "chr1", 2000, "+")
    assert hi > lo


def test_matched_decoys_keep_only_comparable_sites():
    rows = [{"strength": 10.0}, {"strength": 12.0}, {"strength": 2.0},
            {"strength": np.nan}]
    got = matched_decoys(rows, 11.0, tol=2.0)
    assert [r["strength"] for r in got] == [10.0, 12.0]


def test_matched_decoys_give_up_when_the_cryptic_site_is_unscored():
    assert matched_decoys([{"strength": 10.0}], np.nan) == []


# ---- end to end -----------------------------------------------------------

class _FakeGenome:
    """An intron of TTAG repeats, so every 4th base is a decoy acceptor."""

    def sequence(self, chrom, start, end, strand="+"):
        n = int(end) - int(start) + 1
        return ("TTAG" * (n // 4 + 1))[:n]


def _end_to_end(tmp, cryptic_score, decoy_score, seed=0):
    # Eight exons, not three: the first exon of a transcript has no acceptor
    # and is dropped, so a short fixture leaves too few annotated positions
    # for the control contrast to run at all.
    starts = [1000, 9000, 12000, 15000, 18000, 21000, 24000, 27000]
    exons = pd.DataFrame({
        "chrom": ["chr1"] * len(starts),
        "start": starts,
        "end": [v + 200 for v in starts],
        "strand": ["+"] * len(starts),
        "transcript_id": ["t1"] * len(starts),
        "gene_name": ["AAA"] * len(starts),
    })
    events = pd.DataFrame([{
        "gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": 5000,
        "intron_start": 1201, "intron_end": 8999, "fate": "in_frame"}])
    track = []
    for p in range(1201, 9000):
        track.append(("chr1", p, decoy_score))
    for p in range(4979, 5004):
        track.append(("chr1", p, cryptic_score))
    for v in starts:
        for e in (v, v + 200):
            for off in range(-25, 26):
                track.append(("chr1", e + off, 4.0))
    s = _track(tmp, track)
    pos, ev = build(events, exons, _FakeGenome(), s, span=SS_SPAN, seed=seed)
    return summarize(pos, ev, seed=seed), pos, ev


def test_end_to_end_builds_all_four_populations():
    with tempfile.TemporaryDirectory() as tmp:
        res, pos, ev = _end_to_end(tmp, 0.1, 0.1)
        assert set(res["summary"]["population"]) == {"cryptic", "decoy",
                                                     "intron", "annotated"}
        summary = res["summary"]
        assert summary.loc[summary["population"] == "cryptic", "n"].iloc[0] == 1
        assert summary.loc[summary["population"] == "decoy", "n"].iloc[0] > 5


def test_end_to_end_control_separates_annotated_from_intron():
    with tempfile.TemporaryDirectory() as tmp:
        res, pos, ev = _end_to_end(tmp, 0.1, 0.1)
        assert res["control"]["diff_median"] > 1.0


def test_end_to_end_decoys_avoid_the_cryptic_acceptor():
    with tempfile.TemporaryDirectory() as tmp:
        _, pos, _ = _end_to_end(tmp, 0.1, 0.1)
        dec = pos.loc[pos["population"] == "decoy", "pos"]
        assert (abs(dec - 5000) > EXCLUDE).all()


def test_end_to_end_per_event_row_carries_both_medians():
    with tempfile.TemporaryDirectory() as tmp:
        _, _, ev = _end_to_end(tmp, 0.1, 0.1)
        assert ev.loc[0, "n_decoy"] > 0
        assert not np.isnan(ev.loc[0, "decoy"])
        assert not np.isnan(ev.loc[0, "intron"])


def test_end_to_end_per_event_row_carries_the_matched_decoy_set():
    # A handful of annotated acceptors cannot fit a PWM, so the matrix is
    # supplied here; the point is that the matched set is populated from it.
    from bajasplice.evaluate.threshold_drivers import fit_pwm
    n = PWM_SPAN[1] - PWM_SPAN[0] + 1
    pwm = fit_pwm(["T" * (n - 3) + "CAG"] * 60)
    with tempfile.TemporaryDirectory() as tmp:
        exons = pd.DataFrame({
            "chrom": ["chr1"] * 2, "start": [1000, 9000], "end": [1200, 9100],
            "strand": ["+"] * 2, "transcript_id": ["t1"] * 2,
            "gene_name": ["AAA"] * 2})
        events = pd.DataFrame([{
            "gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": 5000,
            "intron_start": 1201, "intron_end": 8999}])
        s = _track(tmp, [("chr1", p, 1.0) for p in range(1201, 9000)])
        pos, ev = build(events, exons, _FakeGenome(), s, pwm=pwm)
        assert "decoy_matched" in ev.columns
        assert ev.loc[0, "n_decoy_matched"] >= 1
        assert pos["strength"].notna().any()


def test_too_few_annotated_acceptors_leaves_matching_unavailable():
    # Degrading to no control is acceptable; silently reporting it as a
    # failed control is not, which the verdict test below pins down.
    with tempfile.TemporaryDirectory() as tmp:
        _, _, ev = _end_to_end(tmp, 0.1, 0.1)
        assert ev.loc[0, "n_decoy_matched"] == 0


def test_end_to_end_lists_the_confound_control_as_a_contrast():
    with tempfile.TemporaryDirectory() as tmp:
        res, _, _ = _end_to_end(tmp, 0.1, 0.1)
        assert res["contrasts"]["contrast"].str.contains(
            "CONFOUND CONTROL").any()


def test_skipping_strength_leaves_the_sites_unscored():
    with tempfile.TemporaryDirectory() as tmp:
        exons = pd.DataFrame({
            "chrom": ["chr1"] * 2, "start": [1000, 9000], "end": [1200, 9100],
            "strand": ["+"] * 2, "transcript_id": ["t1"] * 2,
            "gene_name": ["AAA"] * 2})
        events = pd.DataFrame([{
            "gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": 5000,
            "intron_start": 1201, "intron_end": 8999}])
        s = _track(tmp, [("chr1", 5000, 1.0)])
        pos, ev = build(events, exons, _FakeGenome(), s, fit_strength=False)
        assert pos["strength"].isna().all()
        assert np.isnan(ev.loc[0, "decoy_matched"])


def test_end_to_end_contrasts_are_bh_adjusted():
    with tempfile.TemporaryDirectory() as tmp:
        res, _, _ = _end_to_end(tmp, 0.1, 0.1)
        contrasts = res["contrasts"]
        assert "padj" in contrasts.columns
        assert (contrasts["padj"].dropna() >= contrasts["p"].dropna()).all()


def test_end_to_end_single_event_cannot_support_a_paired_test():
    # One intron is one pair, and the verdict has to say so rather than
    # ranking a single difference.
    with tempfile.TemporaryDirectory() as tmp:
        res, _, _ = _end_to_end(tmp, 3.0, 0.1)
        assert res["primary"]["n_pairs"] <= 1
        assert "unavailable" in _verdict(res["control"], res["primary"], 2.0)


def _two_events(tmp, acc_a, acc_b, score=1.0):
    """Two introns, one acceptor each, so clear and near can be compared."""
    exons = pd.DataFrame({
        "chrom": ["chr1"] * 4,
        "start": [1000, 9000, 11000, 19000],
        "end": [1200, 9100, 11200, 19100],
        "strand": ["+"] * 4,
        "transcript_id": ["t1", "t1", "t2", "t2"],
        "gene_name": ["AAA", "AAA", "BBB", "BBB"]})
    events = pd.DataFrame([
        {"gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": acc_a,
         "intron_start": 1201, "intron_end": 8999},
        {"gene": "BBB", "chrom": "chr1", "strand": "+", "acceptor": acc_b,
         "intron_start": 11201, "intron_end": 18999}])
    track = [("chr1", p, score) for p in range(1201, 19000)]
    s = _track(tmp, track)
    return build(events, exons, _FakeGenome(), s, span=SS_SPAN, exclude=50)


def test_an_acceptor_on_an_annotated_edge_is_not_clear():
    with tempfile.TemporaryDirectory() as tmp:
        # 9000 is an annotated exon start; 5000 is deep in the intron.
        _, ev = _two_events(tmp, 5000, 8999)
        by_gene = ev.set_index("gene")["clear"]
        assert bool(by_gene["AAA"]) is True
        assert bool(by_gene["BBB"]) is False


def test_the_primary_contrast_drops_the_non_clear_acceptors():
    with tempfile.TemporaryDirectory() as tmp:
        pos, ev = _two_events(tmp, 5000, 8999)
        ev = pd.concat([ev] * 8, ignore_index=True)
        ev["cryptic"] = np.linspace(0.1, 0.9, len(ev))
        ev["decoy"] = 0.0
        ev["decoy_matched"] = 0.0
        ev["intron"] = 0.0
        res = summarize(pos, ev)
        assert res["primary"]["n_pairs"] == int(ev["clear"].sum())


def test_non_clear_acceptors_get_their_own_labelled_contrast():
    with tempfile.TemporaryDirectory() as tmp:
        pos, ev = _two_events(tmp, 5000, 8999)
        ev = pd.concat([ev] * 8, ignore_index=True)
        ev["cryptic"] = np.linspace(0.1, 0.9, len(ev))
        ev["decoy"] = 0.0
        ev["decoy_matched"] = 0.0
        ev["intron"] = 0.0
        res = summarize(pos, ev)
        assert res["contrasts"]["contrast"].str.contains(
            "ON an annotated exon edge").any()


def test_a_neighbouring_genes_exon_also_excludes_decoys():
    # The decoy exclusion must see BBB's exon at 11000 even though the event
    # belongs to AAA, because conservation does not care whose exon it is.
    with tempfile.TemporaryDirectory() as tmp:
        exons = pd.DataFrame({
            "chrom": ["chr1"] * 3,
            "start": [1000, 19000, 5000],
            "end": [1200, 19100, 5200],
            "strand": ["+"] * 3,
            "transcript_id": ["t1", "t1", "t2"],
            "gene_name": ["AAA", "AAA", "NEIGHBOUR"]})
        events = pd.DataFrame([{
            "gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": 9000,
            "intron_start": 1201, "intron_end": 18999}])
        s = _track(tmp, [("chr1", p, 1.0) for p in range(1201, 19000)])
        pos, _ = build(events, exons, _FakeGenome(), s, exclude=50)
        dec = pos.loc[pos["population"] == "decoy", "pos"]
        assert ((dec < 4950) | (dec > 5250)).all()


def test_build_clips_a_very_long_intron_to_the_acceptor_side():
    with tempfile.TemporaryDirectory() as tmp:
        exons = pd.DataFrame({
            "chrom": ["chr1"], "start": [10], "end": [20], "strand": ["+"],
            "transcript_id": ["t"], "gene_name": ["AAA"]})
        events = pd.DataFrame([{
            "gene": "AAA", "chrom": "chr1", "strand": "+", "acceptor": 500000,
            "intron_start": 100, "intron_end": 500000}])
        s = _track(tmp, [("chr1", 499000, 1.0)])
        pos, ev = build(events, exons, _FakeGenome(), s, max_intron=5000)
        dec = pos.loc[pos["population"] == "decoy", "pos"]
        assert dec.min() >= 495000
