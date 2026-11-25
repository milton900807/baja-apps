"""Cryptic-exon cost: BED arithmetic, the frame rule, and splicing an exon in."""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.cryptic_cost import (read_cryptic_bed, frame_disrupting,
                                              binom_against, insert_exon,
                                              host_transcript, RANDOM_FRAME)


def _bed(tmp_path, rows):
    f = tmp_path / "ce.bed"
    f.write_text("".join("\t".join(map(str, r)) + "\n" for r in rows))
    return f


def test_bed_is_half_open_so_length_is_end_minus_start(tmp_path):
    f = _bed(tmp_path, [("chr1", 1000, 1120, "AAA", 0, "+")])
    b, _ = read_cryptic_bed(f)
    assert b.loc[0, "length"] == 120
    assert b.loc[0, "a_start"] == 1001      # 1-based inclusive
    assert b.loc[0, "a_end"] == 1120


def test_the_length_filter_drops_both_tails(tmp_path):
    f = _bed(tmp_path, [("chr1", 0, 16, "SHORT", 0, "+"),
                        ("chr1", 0, 114, "GOOD", 0, "+"),
                        ("chr1", 0, 100000110, "HUGE", 0, "-")])
    b, d = read_cryptic_bed(f, 20, 600)
    assert list(b.gene) == ["GOOD"]
    assert set(d.gene) == {"SHORT", "HUGE"}


def test_frame_rule_is_length_mod_three():
    assert frame_disrupting([3, 114, 300]).tolist() == [False, False, False]
    assert frame_disrupting([1, 115, 302]).tolist() == [True, True, True]


def test_binom_reports_rate_and_both_tails():
    rate, p1, p2 = binom_against(274, 427, RANDOM_FRAME)
    assert rate == pytest.approx(0.6417, abs=1e-4)
    assert p2 > 0.05          # indistinguishable from unfiltered
    rate, p1, p2 = binom_against(274, 427, 0.50)
    assert p1 < 1e-8          # and clearly above a half


def test_binom_on_an_empty_set_is_nan():
    assert all(np.isnan(x) for x in binom_against(0, 0, 0.5))


PLUS = [(1000, 1100), (2000, 2100), (3000, 3100)]
MINUS = [(3000, 3100), (2000, 2100), (1000, 1100)]   # transcript order


def test_an_exon_in_the_first_intron_lands_between_the_right_blocks():
    out = insert_exon(PLUS, "+", 1500, 1600)
    assert out == [(1000, 1100), (1500, 1600), (2000, 2100), (3000, 3100)]


def test_insertion_respects_transcript_order_on_the_minus_strand():
    out = insert_exon(MINUS, "-", 2500, 2600)
    assert out == [(3000, 3100), (2500, 2600), (2000, 2100), (1000, 1100)]
    # and the second intron, further down in coordinates, is later in the transcript
    out = insert_exon(MINUS, "-", 1500, 1600)
    assert out == [(3000, 3100), (2000, 2100), (1500, 1600), (1000, 1100)]


def test_an_exon_overlapping_an_annotated_block_is_refused():
    # SILENTLY INSERTING IT WOULD BUILD A SEQUENCE THAT EXISTS NOWHERE
    assert insert_exon(PLUS, "+", 2050, 2150) is None
    assert insert_exon(PLUS, "+", 1100, 1200) is None   # abuts, so overlaps


def test_an_exon_outside_every_intron_is_refused():
    assert insert_exon(PLUS, "+", 100, 200) is None     # before the first exon
    assert insert_exon(PLUS, "+", 4000, 4100) is None   # after the last


def test_a_single_exon_transcript_has_no_intron_to_insert_into():
    assert insert_exon([(1000, 1100)], "+", 1500, 1600) is None


def _ann():
    exons = pd.DataFrame({
        "chrom": "chr1", "strand": "+", "gene_name": "G",
        "transcript_id": ["t1"] * 3 + ["t2"] * 2,
        "start": [1000, 2000, 3000, 1000, 3000],
        "end": [1100, 2100, 3100, 1100, 3100],
        "mane": [0, 0, 0, 1, 1], "basic": 1})
    cds = pd.DataFrame({"chrom": "chr1", "strand": "+", "gene_name": "G",
                        "transcript_id": ["t1", "t2"],
                        "start": [1050, 1050], "end": [3050, 3050]})
    return exons, cds


def test_mane_wins_over_the_longer_transcript():
    exons, cds = _ann()
    chrom, strand, blocks, cds_start = host_transcript(exons, cds, "G")
    assert len(blocks) == 2          # t2, the MANE one, even with fewer exons
    assert cds_start == 1050


def test_a_transcript_without_a_cds_is_never_used():
    exons, cds = _ann()
    cds = cds[cds.transcript_id == "t1"]      # t2 loses its CDS
    _, _, blocks, _ = host_transcript(exons, cds, "G")
    assert len(blocks) == 3                   # falls back to t1
    assert host_transcript(exons, cds.iloc[:0], "G") is None


def test_an_unknown_gene_returns_none():
    exons, cds = _ann()
    assert host_transcript(exons, cds, "NOTAGENE") is None


def test_cds_start_is_the_high_coordinate_on_the_minus_strand():
    exons, cds = _ann()
    exons = exons.assign(strand="-")
    cds = cds.assign(strand="-")
    _, strand, _, cds_start = host_transcript(exons, cds, "G")
    assert strand == "-" and cds_start == 3050


def test_disjoint_grouping_is_what_the_compendium_split_needs():
    # THE BUG THIS PINS: assigning by membership put 66 of 70 HeLa-matched
    # exons into the neuronal group too, so one row contained the other.
    H, N = {"A", "B", "C"}, {"B", "C", "D"}
    only_h, only_n, both = H - N, N - H, H & N
    assert only_h == {"A"} and only_n == {"D"} and both == {"B", "C"}
    assert not (only_h & only_n) and not (only_h & both) and not (only_n & both)
    assert only_h | only_n | both == H | N


from bajasplice.evaluate.cryptic_cost import forms


def test_a_cryptic_exon_absent_from_the_host_keeps_the_skip_form_intact():
    skip, incl = forms(PLUS, "+", 1500, 1600)
    assert skip == PLUS
    assert incl == [(1000, 1100), (1500, 1600), (2000, 2100), (3000, 3100)]


def test_an_annotated_cassette_is_removed_to_build_its_own_skip_form():
    # ONE CODE PATH FOR BOTH POPULATIONS, or the two rates answer different
    # questions and the comparison is meaningless.
    skip, incl = forms(PLUS, "+", 2000, 2100)
    assert skip == [(1000, 1100), (3000, 3100)]
    assert incl == PLUS


def test_the_same_works_in_transcript_order_on_the_minus_strand():
    skip, incl = forms(MINUS, "-", 2000, 2100)
    assert skip == [(3000, 3100), (1000, 1100)]
    assert incl == MINUS


def test_a_partial_overlap_is_refused_rather_than_guessed():
    assert forms(PLUS, "+", 2050, 2150) is None
    assert forms(PLUS, "+", 1900, 2100) is None


def test_an_exon_spanning_two_blocks_is_refused():
    assert forms(PLUS, "+", 1000, 2100) is None


def test_a_two_exon_transcript_cannot_give_up_one_and_still_splice():
    assert forms([(1000, 1100), (2000, 2100)], "+", 2000, 2100) is None
