"""Fate of a cryptic exon: terminate, decay, frameshift, or extend."""
import numpy as np
import pytest

from bajasplice.evaluate.cryptic_fate import (polya_signals, exon_span_in_mrna,
                                              classify_fate, POLYA_HEXAMERS, FATES,
                                              norm_chrom, read_polya_atlas, sites_in)


def test_the_two_strong_hexamers_are_found():
    assert polya_signals("GGGAATAAAGGG") == [(3, "AATAAA")]
    assert polya_signals("GGGATTAAAGGG") == [(3, "ATTAAA")]


def test_u_is_t_so_rna_input_works():
    assert polya_signals("GGGAAUAAAGGG") == [(3, "AATAAA")]


def test_several_signals_are_all_returned_in_order():
    hits = polya_signals("AATAAA" + "CCCC" + "ATTAAA")
    assert [h[1] for h in hits] == ["AATAAA", "ATTAAA"]
    assert hits[0][0] < hits[1][0]


def test_no_signal_is_an_empty_list_not_none():
    assert polya_signals("GCGCGCGCGC") == []
    assert polya_signals("") == []


def test_every_listed_hexamer_matches_itself():
    for h in POLYA_HEXAMERS:
        assert polya_signals(h) == [(0, h)], h


PLUS = [(1000, 1100), (1500, 1600), (2000, 2100)]


def test_span_accumulates_in_transcript_order():
    # first block starts at 0 and is 101 nt, so the second starts at 101
    assert exon_span_in_mrna(PLUS, 1000, 1100) == (0, 100)
    assert exon_span_in_mrna(PLUS, 1500, 1600) == (101, 201)
    assert exon_span_in_mrna(PLUS, 2000, 2100) == (202, 302)


def test_span_is_none_for_a_block_that_is_not_there():
    assert exon_span_in_mrna(PLUS, 3000, 3100) is None


def test_span_ignores_strand_because_blocks_are_already_ordered():
    minus = [(2000, 2100), (1500, 1600), (1000, 1100)]
    assert exon_span_in_mrna(minus, 2000, 2100) == (0, 100)
    assert exon_span_in_mrna(minus, 1000, 1100) == (202, 302)


SPAN = (101, 201)          # the cryptic exon occupies offsets 101 to 201


def test_a_stop_inside_the_exon_is_its_own_class():
    # NO MOTIF ENTERS THIS. An earlier version split this class on a
    # polyadenylation hexamer that turned out to be present at chance.
    assert classify_fate(150, SPAN, 101) == "stop_in_exon"


def test_a_stop_downstream_with_a_length_off_frame_is_a_frameshift():
    assert classify_fate(250, SPAN, 101) == "frameshift"


def test_a_stop_downstream_with_an_in_frame_exon_is_an_insertion():
    assert classify_fate(250, SPAN, 102) == "in_frame"


def test_no_stop_at_all_still_classifies_on_length():
    assert classify_fate(None, SPAN, 101) == "frameshift"
    assert classify_fate(None, SPAN, 102) == "in_frame"


def test_a_stop_ending_exactly_at_the_exon_boundary_counts_as_inside():
    # first_stop returns the offset JUST PAST the stop codon
    assert classify_fate(202, SPAN, 101) == "stop_in_exon"
    assert classify_fate(203, SPAN, 101) == "frameshift"


def test_a_stop_before_the_exon_is_not_inside_it():
    assert classify_fate(50, SPAN, 101) == "frameshift"


def test_a_missing_span_gives_no_call_rather_than_a_guess():
    assert classify_fate(150, None, 101) is None


def test_every_fate_returned_is_one_of_the_declared_three():
    assert len(FATES) == 3
    for stop in (None, 50, 150, 202, 250):
        for length in (101, 102):
            assert classify_fate(stop, SPAN, length) in FATES


def test_chromosome_names_normalize_both_ways():
    assert norm_chrom("chr1") == norm_chrom("1") == "1"
    assert norm_chrom("chrX") == norm_chrom("X") == "X"
    assert norm_chrom("GL000009.2") == "GL000009.2"


def _atlas(tmp_path):
    f = tmp_path / "polya.bed"
    # PolyASite ships Ensembl-style names and is zero-based half-open
    f.write_text("1\t999\t1010\tsite1\t5.0\t+\n"
                 "1\t2000\t2010\tsite2\t1.0\t-\n"
                 "chr2\t500\t510\tsite3\t2.0\t+\n")
    return read_polya_atlas(f)


def test_atlas_is_keyed_by_chromosome_and_strand(tmp_path):
    a = _atlas(tmp_path)
    assert ("1", "+") in a and ("1", "-") in a and ("2", "+") in a


def test_a_site_is_found_when_the_window_overlaps_it(tmp_path):
    a = _atlas(tmp_path)
    assert sites_in(a, "chr1", "+", 1000, 1010) == 1
    assert sites_in(a, "1", "+", 995, 1001) == 1        # overlaps the near edge
    assert sites_in(a, "1", "+", 1010, 1200) == 1       # overlaps the far edge


def test_a_window_that_misses_it_finds_nothing(tmp_path):
    a = _atlas(tmp_path)
    assert sites_in(a, "1", "+", 1011, 1500) == 0
    assert sites_in(a, "1", "+", 500, 999) == 0


def test_the_other_strand_does_not_count(tmp_path):
    # A CLUSTER ON THE OTHER STRAND BELONGS TO ANOTHER GENE.
    a = _atlas(tmp_path)
    assert sites_in(a, "1", "-", 1000, 1010) == 0
    assert sites_in(a, "1", "+", 2000, 2010) == 0


def test_an_absent_chromosome_is_zero_not_an_error(tmp_path):
    a = _atlas(tmp_path)
    assert sites_in(a, "chr99", "+", 1, 10_000) == 0


def test_bed_half_open_start_becomes_one_based(tmp_path):
    a = _atlas(tmp_path)
    # the BED line starts at 999, so the first covered base is 1000
    assert sites_in(a, "1", "+", 1, 999) == 0
    assert sites_in(a, "1", "+", 1, 1000) == 1


from bajasplice.evaluate.cryptic_fate import GENCODE_POLYA_TYPES


def _gff3(tmp_path):
    f = tmp_path / "polyAs.gff3"
    f.write_text(
        "##gff-version 3\n"
        "#provider: GENCODE\n"
        "chr1\tENSEMBL\tpolyA_site\t1000\t1000\t.\t+\t.\tID=a\n"
        "chr1\tENSEMBL\tpolyA_signal\t950\t955\t.\t+\t.\tID=b\n"
        "chr1\tENSEMBL\tpseudo_polyA\t3000\t3000\t.\t+\t.\tID=c\n"
        "chr1\tENSEMBL\tpolyA_site\t2000\t2000\t.\t-\t.\tID=d\n")
    return f


def test_gff3_is_detected_and_is_one_based(tmp_path):
    a = read_polya_atlas(_gff3(tmp_path))
    a.pop("__kinds__", None)
    # the site is at 1000 in GFF3 one-based inclusive, so 1000 is covered
    assert sites_in(a, "chr1", "+", 1000, 1000) == 1
    assert sites_in(a, "1", "+", 999, 999) == 0


def test_polya_signal_is_excluded_by_default(tmp_path):
    # THE SIGNAL IS THE HEXAMER THAT FAILED ITS CONTROL, with an official
    # annotation wrapped around it. An annotated signal is not an observed end.
    a = read_polya_atlas(_gff3(tmp_path))
    a.pop("__kinds__", None)
    assert sites_in(a, "chr1", "+", 950, 955) == 0


def test_pseudo_polya_is_excluded_by_default_and_can_be_asked_for(tmp_path):
    f = _gff3(tmp_path)
    a = read_polya_atlas(f)
    a.pop("__kinds__", None)
    assert sites_in(a, "chr1", "+", 3000, 3000) == 0
    b = read_polya_atlas(f, ("polyA_site", "pseudo_polyA"))
    b.pop("__kinds__", None)
    assert sites_in(b, "chr1", "+", 3000, 3000) == 1


def test_gff3_strand_is_column_seven(tmp_path):
    a = read_polya_atlas(_gff3(tmp_path))
    a.pop("__kinds__", None)
    assert sites_in(a, "chr1", "-", 2000, 2000) == 1
    assert sites_in(a, "chr1", "+", 2000, 2000) == 0


def test_the_type_census_is_reported_for_the_caller(tmp_path):
    a = read_polya_atlas(_gff3(tmp_path))
    kinds = a.pop("__kinds__")
    assert kinds["polyA_site"] == 2
    assert kinds["polyA_signal"] == 1
    assert kinds["pseudo_polyA"] == 1


def test_bed_input_still_works_and_stays_zero_based(tmp_path):
    f = tmp_path / "sites.bed"
    f.write_text("1\t999\t1010\tsite1\t5.0\t+\n")
    a = read_polya_atlas(f)
    a.pop("__kinds__", None)
    assert sites_in(a, "chr1", "+", 1000, 1000) == 1
    assert sites_in(a, "chr1", "+", 999, 999) == 0


def test_an_empty_type_filter_keeps_everything(tmp_path):
    a = read_polya_atlas(_gff3(tmp_path), ())
    a.pop("__kinds__", None)
    assert sites_in(a, "chr1", "+", 950, 955) == 1
