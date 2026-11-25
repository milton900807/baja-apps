"""Cross-RBP motif background: scoring, windows, and the matching."""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.motif_background import (longest_repeat, motif_count,
                                                  expand_iupac, acceptor_window,
                                                  matched_background, MOTIFS)
from bajasplice.evaluate.ug_background import longest_ug


def test_agrees_with_the_ug_scorer_on_ug():
    # THE TWO MUST NOT DRIFT: the paper's number came from longest_ug
    for s in ["GTGTGTGTGT", "AAAAGTGTGTGTCCCC", "GTGTGTATGTGTGTGT", "AAAAA", "GUGUGU"]:
        assert longest_repeat(s, "TG") == longest_ug(s), s


def test_homopolymer_unit_scores_a_tract():
    assert longest_repeat("AAATTTTTTTTGGG", "T") == 8


def test_ca_repeat_is_found_in_either_phase():
    assert longest_repeat("CACACACA", "CA") == 8
    assert longest_repeat("ACACACAC", "CA") == 8


def test_a_unit_longer_than_two_works():
    assert longest_repeat("GGCTAACTAACTAATT", "CTAA") == 12


def test_degenerate_unit_matches_either_base():
    # Y = C or T, so YG matches CG and TG alike
    assert longest_repeat("CGTGCGTG", "YG") == 8


def test_interruption_budget_joins_a_substitution_only():
    sub = "GTGTGTATGTGTGTGT"
    assert longest_repeat(sub, "TG") == 9
    assert longest_repeat(sub, "TG", max_interrupt=1) == 16


def test_empty_inputs_are_zero_not_an_error():
    assert longest_repeat("", "TG") == 0
    assert longest_repeat("GTGT", "") == 0


def test_iupac_expansion_covers_the_cross_product():
    assert set(expand_iupac("YCAY")) == {"CCAC", "CCAT", "TCAC", "TCAT"}
    assert expand_iupac("GCATG") == ["GCATG"]
    assert expand_iupac("GCAUG") == ["GCATG"]      # U is T


def test_motif_count_counts_overlapping_hits():
    assert motif_count("GCATGCATG", "GCATG") == 2
    assert motif_count("TCATCAT", "YCAY") == 2
    assert motif_count("AAAA", "GCATG") == 0


def test_every_table_motif_expands_and_scores():
    for rbp, (unit, mode) in MOTIFS.items():
        assert expand_iupac(unit), rbp
        if mode == "run":
            assert longest_repeat(unit * 4, unit) == len(unit) * 4, rbp
        else:
            assert motif_count(expand_iupac(unit)[0], unit) == 1, rbp


def test_window_takes_the_upstream_intron_on_each_strand():
    plus = {"strand": "+", "c1_end": 1000, "a_start": 2000, "a_end": 2100,
            "c2_start": 3000}
    # plus strand: upstream intron is 1001..1999, acceptor is 1999
    assert acceptor_window(plus, width=100) == (1900, 1999)
    minus = {"strand": "-", "c1_end": 1000, "a_start": 2000, "a_end": 2100,
             "c2_start": 3000}
    # minus strand: upstream intron is 2101..2999, acceptor is 2101
    assert acceptor_window(minus, width=100) == (2101, 2200)


def test_window_never_runs_into_the_flanking_exon():
    tight = {"strand": "+", "c1_end": 1000, "a_start": 1040, "a_end": 1100,
             "c2_start": 2000}
    s, e = acceptor_window(tight, width=100)
    assert s == 1001 and e == 1039          # clipped at the upstream exon
    tightm = {"strand": "-", "c1_end": 1000, "a_start": 1040, "a_end": 1100,
              "c2_start": 1140}
    s, e = acceptor_window(tightm, width=100)
    assert s == 1101 and e == 1139


def test_offset_moves_the_window_off_the_splice_site():
    plus = {"strand": "+", "c1_end": 1000, "a_start": 2000, "a_end": 2100,
            "c2_start": 3000}
    assert acceptor_window(plus, width=10, offset=5) == (1985, 1994)


def _events(n=400):
    rng = np.random.default_rng(0)
    up = rng.integers(200, 50000, n)
    return pd.DataFrame({
        "chrom": "chr1", "strand": "+",
        "c1_end": 10000, "a_start": 10000 + up + 1,
        "a_end": 10000 + up + 101, "c2_start": 10000 + up + 2000,
    })


def test_background_excludes_the_hits_themselves():
    ev = _events()
    hits = set(ev.index[:40])
    bg = matched_background(ev, hits, n=200)
    assert len(bg) > 0
    assert not (set(bg.index) & hits)


def test_background_follows_the_intron_length_deciles_of_the_hits():
    ev = _events()
    # hits drawn only from the longest introns
    hits = set(ev["a_start"].sort_values().index[-40:])
    bg = matched_background(ev, hits, n=200)
    ev2 = ev.copy()
    ev2["up"] = ev2.a_start - ev2.c1_end - 1
    assert ev2.loc[list(bg.index), "up"].median() > ev2["up"].median()


def test_background_reports_when_a_decile_had_to_be_borrowed():
    ev = _events()
    hits = set(ev["a_start"].sort_values().index[-40:])   # fills the top decile
    bg = matched_background(ev, hits, n=200)
    assert len(bg) > 0
    assert bg.attrs["shortfall"] > 0        # it had to borrow, and says so
    assert not (set(bg.index) & hits)


def test_background_borrows_nothing_when_every_decile_has_room():
    ev = _events()
    rng = np.random.default_rng(1)
    hits = set(rng.choice(ev.index, size=40, replace=False).tolist())
    bg = matched_background(ev, hits, n=100)
    assert bg.attrs["shortfall"] == 0.0


def test_background_never_repeats_an_event():
    ev = _events()
    hits = set(ev.index[:40])
    bg = matched_background(ev, hits, n=5000)   # more than the pool holds
    assert len(bg) == len(set(bg.index))


from bajasplice.evaluate.motif_background import (exon_window, parse_junction,
                                                  events_from_junctions, bh)


def test_exon_window_runs_downstream_from_the_acceptor():
    plus = {"strand": "+", "c1_end": 1000, "a_start": 2000, "a_end": 2100,
            "c2_start": 3000}
    # STMN2's array sits ~48-76 nt past the exon start, so this window must
    # start AT the exon and run forward
    assert exon_window(plus, width=100) == (2000, 2099)
    minus = {"strand": "-", "c1_end": 1000, "a_start": 2000, "a_end": 2100,
             "c2_start": 3000}
    assert exon_window(minus, width=100) == (2001, 2100)


def test_exon_window_is_clipped_by_the_next_exon():
    plus = {"strand": "+", "c1_end": 1000, "a_start": 2000, "a_end": 2040,
            "c2_start": 2050}
    assert exon_window(plus, width=100) == (2000, 2049)


def test_the_two_windows_do_not_overlap():
    plus = {"strand": "+", "c1_end": 1000, "a_start": 2000, "a_end": 2100,
            "c2_start": 3000}
    up = acceptor_window(plus, width=50)
    dn = exon_window(plus, width=50)
    assert up[1] < dn[0]


def test_junctions_are_parsed_with_or_without_commas():
    assert parse_junction("chr8:79,611,214-79,616,822") == ("chr8", 79611214, 79616822)
    assert parse_junction("chr19:17642414-17642541") == ("chr19", 17642414, 17642541)
    assert parse_junction("STMN2 (chr8:79611214-79616822)")[0] == "chr8"
    assert parse_junction("no junction here") is None


def test_junction_table_puts_the_acceptor_on_the_right_side(tmp_path):
    f = tmp_path / "ce.tsv"
    f.write_text("gene\tjunction\tstrand\n"
                 "STMN2\tchr8:79611214-79616822\t+\n"
                 "UNC13A\tchr19:17642414-17642541\t-\n")
    ev = events_from_junctions(f)
    assert len(ev) == 2
    p = ev[ev.strand == "+"].iloc[0]
    # plus strand: acceptor is end - 1, so the exon begins AT the junction's end
    assert p.a_start == 79616822 and p.c1_end == 79611214
    assert p.a_start - 1 == 79616821           # STMN2 exon 2a's acceptor
    m = ev[ev.strand == "-"].iloc[0]
    # minus strand: acceptor is start + 1, so the exon's 5' base is that start
    assert m.a_end == 17642414 and m.c2_start == 17642541
    assert m.a_end + 1 == 17642415


def test_junction_table_refuses_rows_it_cannot_orient(tmp_path):
    f = tmp_path / "ce.tsv"
    f.write_text("gene\tjunction\nNOTAGENE\tchr8:1000-2000\n")
    with pytest.raises(SystemExit):
        events_from_junctions(f)          # no strand column, no gene index


def test_bh_is_monotone_and_bounded():
    adj = bh([0.001, 0.02, 0.5, 1.0])
    assert adj[0] < adj[1] < adj[2] < adj[3]
    assert adj[3] <= 1.0


def test_bh_matches_the_hand_computed_case():
    adj = bh([0.01, 0.02, 0.03, 0.04])
    assert adj[0] == pytest.approx(0.04)
    assert adj[3] == pytest.approx(0.04)


def test_bh_carries_nans_through():
    adj = bh([0.01, np.nan, 0.5])
    assert np.isnan(adj[1])
    assert np.isfinite(adj[0]) and np.isfinite(adj[2])
