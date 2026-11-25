"""The background-rate control for the conservation claim."""
import pandas as pd
import pytest

from bajasplice.evaluate.ug_background import (longest_ug, ug_fraction, introns_of,
                                               window_of, wilson)


def test_exact_array_is_its_own_length():
    assert longest_ug("GTGTGTGTGT") == 10
    assert longest_ug("TGTGTGTG") == 8


def test_array_found_inside_flanks():
    assert longest_ug("AAAA" + "GTGTGTGTGTGT" + "CCCC") == 12


def test_both_phases_score_the_same():
    # the same repeat read from either phase; a phase-blind scorer loses one
    assert longest_ug("GTGTGTGT") == longest_ug("TGTGTGTG") == 8


def test_a_substitution_splits_an_array_when_none_is_allowed():
    sub = "GTGTGTATGTGTGTGT"          # one G of a 16-mer replaced by A
    assert longest_ug(sub) == 9        # the longer side, not both
    assert longest_ug(sub, max_interrupt=1) == 16


def test_an_insertion_is_not_joined_by_an_interruption_budget():
    # AN INSERTION FLIPS THE PHASE, so the two sides are not one array in any
    # phase and no budget should pretend otherwise. A slipped array that gained
    # a base really is two arrays to a protein reading the repeat.
    ins = "GTGTGT" + "A" + "GTGTGTGTG"
    assert longest_ug(ins) == 9
    assert longest_ug(ins, max_interrupt=1) == 9


def test_an_array_never_starts_or_ends_on_a_mismatch():
    # with a budget to spend, the greedy window would pad both ends by a base
    assert longest_ug("AGTGTGTA", max_interrupt=2) == 6


def test_u_is_t():
    assert longest_ug("GUGUGUGU") == 8


def test_no_array_is_zero_not_one():
    # a single matching base is not an array; one T reads as phase-correct
    assert longest_ug("AAAAA") == 0
    assert longest_ug("AATAA") == 1   # documented, so a change is deliberate


def test_ug_fraction_counts_overlapping_dinucleotides():
    assert ug_fraction("GTGT") == 1.0
    assert ug_fraction("AAAA") == 0.0


def test_introns_are_the_gaps_and_are_inclusive():
    ex = pd.DataFrame({"start": [100, 300, 500], "end": [200, 400, 600]})
    assert introns_of(ex) == [(201, 299), (401, 499)]


def test_introns_tolerate_unsorted_exons():
    ex = pd.DataFrame({"start": [500, 100, 300], "end": [600, 200, 400]})
    assert introns_of(ex) == [(201, 299), (401, 499)]


def test_abutting_exons_make_no_intron():
    ex = pd.DataFrame({"start": [100, 201], "end": [200, 300]})
    assert introns_of(ex) == []


def test_window_sits_at_the_acceptor_on_each_strand():
    # plus strand: the acceptor is the intron's LAST base
    assert window_of((1000, 2000), "+", width=100) == (1901, 2000)
    # minus strand: the acceptor is the intron's FIRST base
    assert window_of((1000, 2000), "-", width=100) == (1000, 1099)


def test_offset_moves_the_window_off_the_splice_site():
    assert window_of((1000, 2000), "+", width=10, offset=5) == (1986, 1995)
    assert window_of((1000, 2000), "-", width=10, offset=5) == (1005, 1014)


def test_wilson_brackets_the_point_estimate():
    lo, hi = wilson(5, 100)
    assert lo < 0.05 < hi
    assert lo > 0.0


def test_wilson_is_not_zero_width_at_zero_events():
    lo, hi = wilson(0, 100)
    assert lo == 0.0
    assert hi > 0.0
