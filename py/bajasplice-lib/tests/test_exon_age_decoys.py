"""The decoy arm: does it produce a null that is actually matched?"""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.exon_age import TargetFasta
from bajasplice.evaluate.exon_age_decoys import (build_decoys, decoys_for_event,
                                                 read_annotation)


def _fa(tmp_path, seq, name="chr1", fn="g.fa"):
    p = tmp_path / fn
    p.write_text(f">{name}\n{seq}\n")
    return TargetFasta(p)


# --- finding AGs in the right place ---------------------------------------------

def test_a_decoy_lands_on_the_g_of_an_ag(tmp_path):
    # AG at positions 4-5 (1-based), so the acceptor-like position is 5
    fa = _fa(tmp_path, "TTTAGTTTTTTTTTTTTT")
    got = decoys_for_event(fa, "chr1", "+", 1, None, window=50, per_event=10,
                           exclude=0)
    assert 5 in got


def test_the_parent_acceptor_itself_is_excluded(tmp_path):
    fa = _fa(tmp_path, "TTTAGTTTTTTTTTTTTT")
    # acceptor at 5 is the AG's own G; with clearance it must not be returned
    got = decoys_for_event(fa, "chr1", "+", 5, None, window=50, per_event=10,
                           exclude=2)
    assert 5 not in got


def test_positions_near_an_exon_boundary_are_excluded(tmp_path):
    fa = _fa(tmp_path, "TTTAGTTTTTTTTTTTTT")
    # an exon boundary right at the decoy kills it
    assert decoys_for_event(fa, "chr1", "+", 1, np.array([5]), window=50,
                            per_event=10, exclude=2) == []
    # one far away does not
    assert 5 in decoys_for_event(fa, "chr1", "+", 1, np.array([900]),
                                 window=50, per_event=10, exclude=2)


def test_the_minus_strand_maps_indices_back_with_the_right_sign(tmp_path):
    # On the minus strand the read is reverse-complemented, so a CT on the
    # plus strand presents as AG. Mapping with the wrong sign puts every decoy
    # at the far end of the window, which is the donor-instead-of-acceptor bug.
    fa = _fa(tmp_path, "AAAAAAAAAAAACTAAA")   # CT at plus 13-14
    got = decoys_for_event(fa, "chr1", "-", 1, None, window=50, per_event=10,
                           exclude=0)
    # read on minus, the AG's G sits at plus coordinate 13
    assert 13 in got, got


def test_a_window_running_off_the_contig_still_maps_correctly(tmp_path):
    # sequence() clips to the contig; if lo is not corrected the coordinates
    # all shift by the amount clipped.
    fa = _fa(tmp_path, "TTTAGTTTTT")
    got = decoys_for_event(fa, "chr1", "+", 2, None, window=10_000,
                           per_event=10, exclude=0)
    assert got == [5], got


def test_an_unknown_contig_yields_nothing_rather_than_raising(tmp_path):
    fa = _fa(tmp_path, "TTTAGTTTTT")
    assert decoys_for_event(fa, "chr99", "+", 5, None) == []


# --- sampling -------------------------------------------------------------------

def test_sampling_is_capped_and_deterministic_under_a_seed(tmp_path):
    fa = _fa(tmp_path, "AG" * 200)
    a = decoys_for_event(fa, "chr1", "+", 1, None, window=500, per_event=5,
                         exclude=0, rng=np.random.default_rng(7))
    b = decoys_for_event(fa, "chr1", "+", 1, None, window=500, per_event=5,
                         exclude=0, rng=np.random.default_rng(7))
    assert len(a) == 5 and a == b


def test_per_event_zero_keeps_every_candidate(tmp_path):
    fa = _fa(tmp_path, "AG" * 20)
    got = decoys_for_event(fa, "chr1", "+", 1, None, window=500, per_event=0,
                           exclude=0)
    assert len(got) > 5


# --- the table ------------------------------------------------------------------

def _events():
    return pd.DataFrame([{"gene": "G1", "chrom": "chr1", "strand": "+",
                          "acceptor": 100, "fate": "in_frame"}])


def test_the_table_carries_fate_through_so_stratification_survives(tmp_path):
    fa = _fa(tmp_path, "T" * 90 + "AG" + "T" * 200)
    out = build_decoys(_events(), fa, None, window=80, per_event=5, exclude=5)
    assert len(out)
    assert set(out["fate"]) == {"in_frame"}
    assert set(out["parent_acceptor"]) == {100}
    assert (out["is_decoy"]).all()


def test_every_decoy_records_its_distance_from_an_exon(tmp_path):
    fa = _fa(tmp_path, "T" * 90 + "AG" + "T" * 200)
    ex = pd.DataFrame([{"chrom": "chr1", "start": 300, "end": 320}])
    out = build_decoys(_events(), fa, ex, window=80, per_event=5, exclude=5)
    assert "dist_exon" in out and out["dist_exon"].notna().all()
    assert (out["dist_exon"] > 5).all()


def test_duplicate_decoys_across_overlapping_events_are_collapsed(tmp_path):
    # two cryptic acceptors 10 nt apart share almost all of their window
    fa = _fa(tmp_path, "T" * 90 + "AG" + "T" * 200)
    ev = pd.DataFrame([{"chrom": "chr1", "strand": "+", "acceptor": 100},
                       {"chrom": "chr1", "strand": "+", "acceptor": 110}])
    out = build_decoys(ev, fa, None, window=80, per_event=5, exclude=5)
    assert not out.duplicated(subset=["chrom", "acceptor", "strand"]).any()


def test_an_event_with_no_usable_decoy_simply_contributes_none(tmp_path):
    fa = _fa(tmp_path, "T" * 300)          # no AG anywhere
    out = build_decoys(_events(), fa, None, window=80, per_event=5)
    assert len(out) == 0


# --- the annotation contract ----------------------------------------------------

def test_an_annotation_without_the_needed_columns_says_which(tmp_path):
    p = tmp_path / "bad.tsv"
    p.write_text("chrom\tbegin\tfinish\nchr1\t1\t2\n")
    with pytest.raises(SystemExit) as e:
        read_annotation(p)
    msg = str(e.value)
    assert "start" in msg and "end" in msg


def test_a_good_annotation_loads(tmp_path):
    p = tmp_path / "ok.tsv"
    p.write_text("chrom\tstart\tend\tstrand\nchr1\t10\t20\t+\n")
    assert len(read_annotation(p)) == 1


# --- reading a very large annotation --------------------------------------------

def test_only_the_three_needed_columns_are_loaded(tmp_path):
    # The human exons.tsv is 554 MB and mostly columns this step never uses.
    p = tmp_path / "big.tsv"
    p.write_text("chrom\tstart\tend\tstrand\tgene_name\tseq\n"
                 "chr1\t10\t20\t+\tG1\tACGTACGT\n"
                 "chr1\t50\t60\t+\tG1\tTTTTTTTT\n")
    ex = read_annotation(p)
    assert list(ex.columns) == ["chrom", "start", "end"]
    assert len(ex) == 2


def test_a_comma_separated_annotation_is_still_read(tmp_path):
    p = tmp_path / "a.csv"
    p.write_text("chrom,start,end,strand\nchr1,10,20,+\n")
    assert len(read_annotation(p)) == 1


def test_chrom_stays_a_string_so_a_numeric_contig_still_matches(tmp_path):
    # An Ensembl-style table keys contigs as 1, 2, ... If those load as int64
    # the per-chrom bounds dict is keyed by int and every lookup by "1" misses,
    # silently removing all exon exclusion.
    p = tmp_path / "ens.tsv"
    p.write_text("chrom\tstart\tend\n1\t10\t20\n")
    ex = read_annotation(p)
    assert ex["chrom"].iloc[0] == "1"
    from bajasplice.evaluate.constraint_axis import chrom_exon_bounds
    assert "1" in chrom_exon_bounds(ex)


# --- matching on distance from the nearest exon ---------------------------------
#
# The unmatched set failed its own check: cryptic median 366 nt with a 25th
# percentile of 1, decoys 805 and 302, Mann-Whitney p=1.2e-16. Exon-adjacent
# intron carries its own constraint, so position has to be matched too.

from bajasplice.evaluate.exon_age_decoys import annotate_events


def test_matching_keeps_decoys_at_a_similar_distance_from_an_exon(tmp_path):
    # AGs at plus 5 and 105; exon boundary at 1000. Parent sits at 995, so
    # 5 nt from the boundary... build it explicitly instead:
    #   exon boundary at 200. parent acceptor at 190 -> dist 10.
    #   candidate A at 195 -> dist 5   (within a factor of 2 of 10)
    #   candidate B at 60  -> dist 140 (outside)
    seq = ["T"] * 400
    seq[193], seq[194] = "A", "G"      # G at 195 -> dist 5
    seq[58], seq[59] = "A", "G"        # G at 60  -> dist 140
    fa = _fa(tmp_path, "".join(seq))
    bounds = np.array([200])
    got = decoys_for_event(fa, "chr1", "+", 190, bounds, window=300,
                           per_event=10, exclude=2, match_dist=2.0)
    assert 195 in got and 60 not in got, got


def test_without_matching_both_distances_are_kept(tmp_path):
    seq = ["T"] * 400
    seq[193], seq[194] = "A", "G"
    seq[58], seq[59] = "A", "G"
    fa = _fa(tmp_path, "".join(seq))
    bounds = np.array([200])
    got = decoys_for_event(fa, "chr1", "+", 190, bounds, window=300,
                           per_event=10, exclude=2, match_dist=None)
    assert 195 in got and 60 in got


def test_matching_falls_back_rather_than_returning_nothing(tmp_path):
    # If no candidate sits in the band, returning an empty set would drop the
    # event entirely and bias the comparison toward easily-matched loci.
    seq = ["T"] * 400
    seq[58], seq[59] = "A", "G"        # only candidate, dist 140
    fa = _fa(tmp_path, "".join(seq))
    got = decoys_for_event(fa, "chr1", "+", 190, np.array([200]), window=300,
                           per_event=10, exclude=2, match_dist=1.1)
    assert got == [60], got


def test_matching_is_scale_free_not_absolute(tmp_path):
    # 2000 vs 2100 nt from an exon is the same situation; 10 vs 100 is not.
    seq = ["T"] * 5000
    seq[2598], seq[2599] = "A", "G"    # G at 2600 -> dist 2400 from boundary 5000
    fa = _fa(tmp_path, "".join(seq))
    bounds = np.array([5000])
    got = decoys_for_event(fa, "chr1", "+", 2500, bounds, window=2000,
                           per_event=10, exclude=2, match_dist=2.0)
    assert 2600 in got, got


# --- the cryptic side gets the covariate too ------------------------------------

def test_the_cryptic_events_come_back_with_their_own_dist_exon():
    ev = pd.DataFrame([{"chrom": "chr1", "strand": "+", "acceptor": 190},
                       {"chrom": "chr1", "strand": "+", "acceptor": 201}])
    ex = pd.DataFrame([{"chrom": "chr1", "start": 200, "end": 300}])
    out = annotate_events(ev, ex)
    assert list(out["dist_exon"]) == [10.0, 1.0]
    assert not out["is_decoy"].any()


def test_an_event_on_a_chromosome_with_no_exons_is_infinite_not_zero():
    # A silent 0 would read as "sits on an exon boundary", the opposite of
    # the truth, and would be kept by any nearness filter.
    ev = pd.DataFrame([{"chrom": "chrZ", "strand": "+", "acceptor": 500}])
    ex = pd.DataFrame([{"chrom": "chr1", "start": 200, "end": 300}])
    out = annotate_events(ev, ex)
    assert np.isinf(out["dist_exon"].iloc[0])
