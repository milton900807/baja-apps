"""Tests for the coding-constraint measurement.

Most of these are about the reading frame. A one-base frame error is the
failure mode that would invalidate every number the module reports while
leaving its output looking entirely reasonable, and on the minus strand the
arithmetic is the error-prone kind, so it is tested base by base against
hand-worked expectations rather than against the module's own helpers.
"""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.coding_constraint import (
    cds_phase, codon_positions, inclusion_fraction, classify, exon_gap,
    score_rows, paired_within_gene, intron_rows, noncoding_rows,
    frame_shift_verdict, transcript_order, internal_only, MICRO_MAX,
)


class _Track:
    """A per-base track built from an explicit {(chrom, pos): score} map."""

    def __init__(self, d, default=0.0):
        self.d, self.default = d, default
        self.chroms = {c for c, _ in d}

    def values(self, chrom, start, end):
        return np.array([self.d.get((str(chrom), p), self.default)
                         for p in range(int(start), int(end) + 1)], dtype=float)


def _cds(rows):
    return pd.DataFrame(rows).reset_index(drop=True)


# --- frame ---------------------------------------------------------------------

def test_a_single_cds_record_starts_in_frame_zero():
    d = cds_phase(_cds([dict(transcript_id="t", strand="+", chrom="chr1",
                             start=100, end=201)]))
    assert d["phase0"].tolist() == [0]
    assert bool(d["in_frame"].iloc[0]) is True


def test_the_second_record_picks_up_where_the_first_left_off():
    # 4 coding bases, then 5: the second record starts at codon position 1.
    d = cds_phase(_cds([
        dict(transcript_id="t", strand="+", chrom="chr1", start=100, end=103),
        dict(transcript_id="t", strand="+", chrom="chr1", start=200, end=204)]))
    assert d.sort_values("start")["phase0"].tolist() == [0, 1]


def test_a_transcript_whose_cds_is_not_whole_codons_is_flagged():
    d = cds_phase(_cds([dict(transcript_id="t", strand="+", chrom="chr1",
                             start=100, end=103)]))   # 4 bases
    assert bool(d["in_frame"].iloc[0]) is False


def test_on_the_minus_strand_the_first_record_is_the_rightmost():
    # 4 bases at 200-203 come FIRST in transcript order, so 100-104 starts at 1.
    d = cds_phase(_cds([
        dict(transcript_id="t", strand="-", chrom="chr1", start=100, end=104),
        dict(transcript_id="t", strand="-", chrom="chr1", start=200, end=203)]))
    by = d.set_index("start")["phase0"].to_dict()
    assert by[200] == 0
    assert by[100] == 1


def test_transcript_order_runs_the_right_way_on_each_strand():
    g = _cds([dict(start=300), dict(start=100), dict(start=200)])
    assert transcript_order(g, "+")["start"].tolist() == [100, 200, 300]
    assert transcript_order(g, "-")["start"].tolist() == [300, 200, 100]


# --- codon positions, base by base ---------------------------------------------

def test_plus_strand_codon_positions_ascend_with_the_coordinate():
    assert codon_positions(100, 108, "+", 0).tolist() == [0, 1, 2, 0, 1, 2, 0, 1, 2]


def test_a_nonzero_phase_offsets_the_whole_run():
    assert codon_positions(100, 105, "+", 1).tolist() == [1, 2, 0, 1, 2, 0]
    assert codon_positions(100, 105, "+", 2).tolist() == [2, 0, 1, 2, 0, 1]


def test_minus_strand_codon_positions_are_returned_in_genomic_order():
    # Transcript order starts at 108 and runs down, so 108 is position 0 and
    # the array handed back, which is genomic-ascending, ends at 0.
    got = codon_positions(100, 108, "-", 0).tolist()
    assert got == [2, 1, 0, 2, 1, 0, 2, 1, 0]
    assert got[-1] == 0


def test_the_two_strands_are_mirror_images_of_each_other():
    a = codon_positions(100, 120, "+", 0)
    b = codon_positions(100, 120, "-", 0)
    assert a.tolist() == b[::-1].tolist()


def test_shifting_the_frame_moves_every_base_by_the_same_amount():
    base = codon_positions(100, 111, "+", 0)
    for s in (1, 2):
        assert codon_positions(100, 111, "+", 0, shift=s).tolist() == \
            ((base + s) % 3).tolist()


@pytest.mark.parametrize("strand", ["+", "-"])
def test_every_codon_position_appears_equally_often(strand):
    pos = codon_positions(1000, 1299, strand, 0)
    assert sorted(np.bincount(pos).tolist()) == [100, 100, 100]


# --- the gap -------------------------------------------------------------------

def _planted(chrom, start, end, strand, phase0, hi=2.0, lo=0.0):
    """A track where codon positions 1 and 2 score `hi` and position 3 `lo`."""
    pos = codon_positions(start, end, strand, phase0)
    return _Track({(chrom, p): (lo if c == 2 else hi)
                   for p, c in zip(range(start, end + 1), pos)})


@pytest.mark.parametrize("strand", ["+", "-"])
def test_a_planted_gap_is_recovered_in_the_true_frame(strand):
    t = _planted("chr1", 1000, 1119, strand, 0)
    a, b, gap, n1, n2 = exon_gap(t, "chr1", 1000, 1119, strand, 0)
    assert a == pytest.approx(2.0)
    assert b == pytest.approx(0.0)
    assert gap == pytest.approx(2.0)
    assert n1 == 80 and n2 == 40


@pytest.mark.parametrize("strand", ["+", "-"])
def test_the_wrong_frame_does_not_recover_it(strand):
    t = _planted("chr1", 1000, 1119, strand, 0)
    g0 = exon_gap(t, "chr1", 1000, 1119, strand, 0, shift=0)[2]
    g1 = exon_gap(t, "chr1", 1000, 1119, strand, 0, shift=1)[2]
    g2 = exon_gap(t, "chr1", 1000, 1119, strand, 0, shift=2)[2]
    assert g0 > g1 and g0 > g2


def test_reading_a_plus_strand_exon_as_minus_destroys_the_gap():
    # The length matters here and the obvious choice hides the bug. Reading an
    # exon from the wrong end partitions the bases by (n - 1 - i) mod 3, which
    # for n = 2 mod 3 selects exactly the same third positions as reading it
    # forward, so a 119-base exon scores identically either way and the test
    # would pass whatever the code did. 120 is 0 mod 3, where the two
    # partitions genuinely differ.
    t = _planted("chr1", 1000, 1119, "+", 0)
    right = exon_gap(t, "chr1", 1000, 1119, "+", 0)[2]
    wrong = exon_gap(t, "chr1", 1000, 1119, "-", 0)[2]
    assert right > wrong


def test_the_strand_makes_no_difference_at_a_length_of_two_mod_three():
    # Recorded so the degeneracy above is a known property and not a surprise
    # the next time a strand test looks like it is passing.
    t = _planted("chr1", 1000, 1118, "+", 0)
    assert exon_gap(t, "chr1", 1000, 1118, "+", 0)[2] == \
        pytest.approx(exon_gap(t, "chr1", 1000, 1118, "-", 0)[2])


def test_flat_sequence_gives_no_gap_in_any_frame():
    t = _Track({}, default=1.3)
    for s in (0, 1, 2):
        assert exon_gap(t, "chr1", 1000, 1119, "+", 0, shift=s)[2] == \
            pytest.approx(0.0)


def test_an_exon_with_too_little_coverage_is_refused():
    t = _Track({("chr1", 1000): 1.0})
    assert np.isnan(exon_gap(t, "chr1", 1000, 1005, "+", 0)[2])


def test_uncovered_bases_are_skipped_rather_than_counted_as_zero():
    pos = codon_positions(1000, 1059, "+", 0)
    d = {("chr1", p): (np.nan if i < 30 else (0.0 if c == 2 else 2.0))
         for i, (p, c) in enumerate(zip(range(1000, 1060), pos))}
    t = _Track(d)
    a, b, gap, n1, n2 = exon_gap(t, "chr1", 1000, 1059, "+", 0)
    assert n1 + n2 == 30
    assert gap == pytest.approx(2.0)


# --- populations ---------------------------------------------------------------

def _gene(n_tx=4, shared=True):
    rows = []
    for i in range(n_tx):
        rows.append(dict(gene_id="g", transcript_id=f"t{i}", chrom="chr1",
                         start=100, end=199, strand="+", gene_type="protein_coding"))
        if shared or i == 0:
            rows.append(dict(gene_id="g", transcript_id=f"t{i}", chrom="chr1",
                             start=300, end=399, strand="+",
                             gene_type="protein_coding"))
    return pd.DataFrame(rows)


def test_an_exon_in_every_transcript_is_constitutive():
    f = inclusion_fraction(_gene(shared=True))
    assert set(f["frac"]) == {1.0}
    assert set(classify(f)["cls"]) == {"constitutive"}


def test_an_exon_in_one_transcript_of_four_is_alternative():
    f = inclusion_fraction(_gene(shared=False))
    c = classify(f).set_index("start")["cls"].to_dict()
    assert c[100] == "constitutive"
    assert c[300] == "alternative"


def test_short_alternative_exons_are_binned_as_microexons():
    rows = [dict(gene_id="g", transcript_id=f"t{i}", chrom="chr1",
                 start=100, end=199, strand="+") for i in range(4)]
    rows.append(dict(gene_id="g", transcript_id="t0", chrom="chr1",
                     start=300, end=300 + MICRO_MAX - 1, strand="+"))
    c = classify(inclusion_fraction(pd.DataFrame(rows))).set_index("start")
    assert c.loc[300, "group"] == "alternative, micro (3-15)"


def test_a_gene_with_too_few_transcripts_is_left_out():
    rows = [dict(gene_id="g", transcript_id="t0", chrom="chr1",
                 start=100, end=199, strand="+")]
    assert len(classify(inclusion_fraction(pd.DataFrame(rows)), min_tx=3)) == 0


def test_terminal_coding_records_are_dropped():
    cds = _cds([dict(transcript_id="t", strand="+", chrom="chr1",
                     start=s, end=s + 59) for s in (100, 300, 500)])
    per = pd.DataFrame([dict(chrom="chr1", start=s, end=s + 59, strand="+")
                        for s in (100, 300, 500)])
    kept = internal_only(per, cds)
    assert kept["start"].tolist() == [300]


# --- controls ------------------------------------------------------------------

def test_intronic_intervals_clear_both_splice_sites():
    cds = _cds([dict(transcript_id="t", strand="+", chrom="chr1",
                     start=1000, end=1099),
                dict(transcript_id="t", strand="+", chrom="chr1",
                     start=3000, end=3099)])
    r = intron_rows(cds, n=5, margin=100, want=400)
    assert len(r) == 1
    assert int(r["start"].iloc[0]) >= 1200
    assert int(r["end"].iloc[0]) <= 2900


def test_an_intron_too_short_for_the_margin_yields_nothing():
    cds = _cds([dict(transcript_id="t", strand="+", chrom="chr1",
                     start=1000, end=1099),
                dict(transcript_id="t", strand="+", chrom="chr1",
                     start=1200, end=1299)])
    assert len(intron_rows(cds, n=5, margin=100, want=400)) == 0


def test_noncoding_rows_take_only_noncoding_genes():
    ex = pd.DataFrame([
        dict(chrom="chr1", start=1, end=500, strand="+", gene_type="lncRNA"),
        dict(chrom="chr1", start=2000, end=2500, strand="+",
             gene_type="protein_coding")])
    r = noncoding_rows(ex, n=10)
    assert r["start"].tolist() == [1]
    assert set(r["phase0"]) == {0}


def test_the_frame_shift_verdict_passes_when_the_true_frame_wins(capsys):
    cod = pd.DataFrame({"gap": [1.0, 1.2], "gap_s1": [0.1, 0.0],
                        "gap_s2": [0.0, 0.1]})
    assert "PASS" in frame_shift_verdict(cod)


def test_the_frame_shift_verdict_fails_when_a_wrong_frame_matches(capsys):
    cod = pd.DataFrame({"gap": [0.5, 0.4], "gap_s1": [0.6, 0.5],
                        "gap_s2": [0.0, 0.1]})
    v = frame_shift_verdict(cod)
    assert "FAIL" in v and "not" in v


def test_the_verdict_does_not_pass_on_a_tie():
    cod = pd.DataFrame({"gap": [0.5, 0.5], "gap_s1": [0.5, 0.5],
                        "gap_s2": [0.0, 0.0]})
    assert "FAIL" in frame_shift_verdict(cod)


# --- pairing -------------------------------------------------------------------

def test_pairing_is_against_the_same_genes_constitutive_median():
    df = pd.DataFrame([
        dict(gene="g1", group="constitutive", gap=1.0),
        dict(gene="g1", group="constitutive", gap=3.0),
        dict(gene="g1", group="alternative, long (28+)", gap=2.5),
        dict(gene="g2", group="constitutive", gap=0.0),
        dict(gene="g2", group="alternative, long (28+)", gap=1.0),
        dict(gene="g3", group="constitutive", gap=5.0),
        dict(gene="g3", group="alternative, long (28+)", gap=5.5)])
    r = paired_within_gene(df, "alternative, long (28+)")
    assert r["n"] == 3
    assert r["diff"] == pytest.approx(((2.5 - 2.0) + (1.0 - 0.0) + 0.5) / 3)


def test_an_exon_whose_gene_has_no_constitutive_partner_is_not_paired():
    df = pd.DataFrame([
        dict(gene="g1", group="constitutive", gap=1.0),
        dict(gene="g1", group="alternative, long (28+)", gap=2.0),
        dict(gene="g2", group="alternative, long (28+)", gap=9.0),
        dict(gene="g3", group="alternative, long (28+)", gap=9.0),
        dict(gene="g4", group="alternative, long (28+)", gap=9.0)])
    r = paired_within_gene(df, "alternative, long (28+)")
    assert r is None or r["n"] == 1


# --- end to end ----------------------------------------------------------------

def test_score_rows_reports_all_three_frames():
    t = _planted("chr1", 1000, 1119, "+", 0)
    rows = pd.DataFrame([dict(chrom="chr1", start=1000, end=1119, strand="+",
                              gene_id="g", group="constitutive", phase0=0,
                              frac=1.0)])
    out = score_rows(t, rows)
    assert {"gap", "gap_s1", "gap_s2", "n_nondeg", "n_deg"} <= set(out.columns)
    assert out["gap"].iloc[0] > out["gap_s1"].iloc[0]
    assert out["len"].iloc[0] == 120


# --- poison exons and supplied sets ---------------------------------------------

from bajasplice.evaluate.coding_constraint import poison_cds, read_sets


def _biotyped():
    """One exon used by both biotypes, one used only by an NMD transcript."""
    rows = []
    for tx, tt, starts in (("t1", "protein_coding", (100, 300)),
                           ("t2", "nonsense_mediated_decay", (100, 300, 500))):
        for s in starts:
            rows.append(dict(transcript_id=tx, transcript_type=tt, chrom="chr1",
                             start=s, end=s + 59, strand="+"))
    return cds_phase(_cds(rows))


def test_a_poison_exon_is_one_no_coding_transcript_uses():
    p = poison_cds(_biotyped())
    assert p["start"].tolist() == [500]
    assert set(p["group"]) == {"poison (NMD-only)"}


def test_an_exon_shared_with_a_coding_transcript_is_not_poison():
    p = poison_cds(_biotyped())
    assert 100 not in set(p["start"])
    assert 300 not in set(p["start"])


def test_poison_exons_carry_a_reading_frame():
    p = poison_cds(_biotyped())
    assert p["phase0"].notna().all()


def test_no_nmd_transcripts_means_no_poison_exons():
    d = cds_phase(_cds([dict(transcript_id="t", transcript_type="protein_coding",
                             chrom="chr1", start=100, end=159, strand="+")]))
    assert len(poison_cds(d)) == 0


def test_a_table_without_biotypes_yields_no_poison_exons():
    d = cds_phase(_cds([dict(transcript_id="t", chrom="chr1", start=100,
                             end=159, strand="+")]))
    assert len(poison_cds(d)) == 0


def test_supplied_sets_take_their_frame_from_the_annotation(tmp_path):
    f = tmp_path / "sets.tsv"
    f.write_text("chrom\tstart\tend\tstrand\tclass\n"
                 "chr1\t100\t159\t+\tmicroexon\n")
    got = read_sets(str(f), _biotyped())
    assert got["group"].tolist() == ["set: microexon"]
    assert got["phase0"].tolist() == [0]


def test_a_supplied_phase_is_used_as_given(tmp_path):
    f = tmp_path / "sets.tsv"
    f.write_text("chrom\tstart\tend\tstrand\tclass\tphase0\n"
                 "chr9\t900\t959\t-\tcryptic\t2\n")
    got = read_sets(str(f), _biotyped())
    assert got["phase0"].tolist() == [2]


def test_a_supplied_exon_with_no_frame_anywhere_is_dropped(tmp_path):
    # A cryptic exon is not in the annotation, so it has no frame to borrow.
    f = tmp_path / "sets.tsv"
    f.write_text("chrom\tstart\tend\tstrand\tclass\n"
                 "chr9\t900\t959\t-\tcryptic\n")
    assert len(read_sets(str(f), _biotyped())) == 0


def test_sets_missing_a_required_column_is_refused(tmp_path):
    f = tmp_path / "sets.tsv"
    f.write_text("chrom\tstart\tend\tclass\nchr1\t100\t159\tx\n")
    with pytest.raises(SystemExit):
        read_sets(str(f), _biotyped())
