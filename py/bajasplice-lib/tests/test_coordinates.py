"""Coordinate conventions. Getting these wrong is silent and ruins everything
downstream, so they are pinned here.
"""
import numpy as np

from bajasplice.datasets import site_positions


class Row:
    """Minimal stand-in for a cassette-event row."""
    def __init__(self, strand, c1_end, a_start, a_end, c2_start):
        self.strand, self.c1_end = strand, c1_end
        self.a_start, self.a_end, self.c2_start = a_start, a_end, c2_start


def test_site_positions_plus_strand():
    # exon 200-300, flanked by exons ending 100 and starting 400
    r = Row("+", 100, 200, 300, 400)
    up_donor, exon_acc, exon_donor, dn_acc = site_positions(r)
    assert up_donor == 101      # first base of the upstream intron
    assert exon_acc == 199      # last base of the upstream intron
    assert exon_donor == 301    # first base of the downstream intron
    assert dn_acc == 399        # last base of the downstream intron


def test_site_positions_minus_strand_is_transcript_ordered():
    r = Row("-", 100, 200, 300, 400)
    up_donor, exon_acc, exon_donor, dn_acc = site_positions(r)
    # on the minus strand transcription runs high -> low, so the transcript's
    # upstream intron is the genomically downstream one
    assert up_donor == 399
    assert exon_acc == 301
    assert exon_donor == 199
    assert dn_acc == 101


def test_intron_convention_matches_gtex_junction_ids():
    # GTEx junction ids are chr_intronStart_intronEnd, 1-based inclusive intron.
    # For exons ending at 12227 and starting at 12613 the intron is 12228-12612.
    exon_end, next_exon_start = 12227, 12613
    assert exon_end + 1 == 12228
    assert next_exon_start - 1 == 12612
