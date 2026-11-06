"""SSAM exon numbering, strand handling and candidate finding.

The failure these pin down is silent: on the minus strand, numbering exons by
genomic coordinate gives you the wrong exon and the wrong end of it, and every
score that follows is a real number for the wrong place.
"""
import numpy as np
import pandas as pd
import pytest

from bajasplice import ssam


def _exons(strand):
    """Four exons, genomic 100-200, 300-400, 500-600, 700-800."""
    blocks = [(100, 200), (300, 400), (500, 600), (700, 800)]
    return pd.DataFrame({
        "chrom": ["chr1"] * 4,
        "start": [b[0] for b in blocks],
        "end": [b[1] for b in blocks],
        "strand": [strand] * 4,
        "gene_name": ["G"] * 4,
        "transcript_id": ["t1"] * 4,
        "mane": [1] * 4,
    })


@pytest.fixture
def patched(monkeypatch):
    """gene_span fed from the frame above, and no transcript-count lookup."""
    def fake_gene_span(name, exons=None, transcript=None):
        ex = _exons(fake_gene_span.strand)
        return "chr1", 100, 800, fake_gene_span.strand, ex
    monkeypatch.setattr("bajasplice.scan.gene_span", fake_gene_span)
    monkeypatch.setattr(ssam, "_n_transcripts", lambda g: 7)
    return fake_gene_span


def test_plus_strand_numbering_follows_coordinates(patched):
    patched.strand = "+"
    rows, info = ssam.exon_table("G")
    assert [r["number"] for r in rows] == [1, 2, 3, 4]
    assert (rows[0]["start"], rows[0]["end"]) == (100, 200)
    assert (rows[3]["start"], rows[3]["end"]) == (700, 800)
    assert info["n_transcripts"] == 7


def test_minus_strand_numbering_is_reversed(patched):
    patched.strand = "-"
    rows, _ = ssam.exon_table("G")
    # exon 1 is the genomically RIGHTMOST block on the minus strand
    assert (rows[0]["start"], rows[0]["end"]) == (700, 800)
    assert (rows[3]["start"], rows[3]["end"]) == (100, 200)


def test_acceptor_is_last_intronic_base_in_transcript_orientation(patched):
    patched.strand = "+"
    rows, _ = ssam.exon_table("G")
    e2 = ssam.exon_bounds(rows, 2)              # 300-400
    assert ssam.annotated_acceptor(e2, "+") == 299
    assert ssam.annotated_donor(e2, "+") == 401

    patched.strand = "-"
    rows, _ = ssam.exon_table("G")
    e2 = ssam.exon_bounds(rows, 2)              # transcript exon 2 = 500-600
    assert (e2["start"], e2["end"]) == (500, 600)
    # minus strand: the upstream intron is genomically to the RIGHT
    assert ssam.annotated_acceptor(e2, "-") == 601
    assert ssam.annotated_donor(e2, "-") == 499


def test_intron_is_named_for_the_exon_it_follows_in_transcript_order(patched):
    patched.strand = "+"
    rows, _ = ssam.exon_table("G")
    assert ssam._region_label(250, rows, "+") == "intron 1"
    assert ssam._region_label(150, rows, "+") == "exon 1"

    patched.strand = "-"
    rows, _ = ssam.exon_table("G")
    # 250 sits between genomic blocks 1 and 2, which are transcript exons 4 and 3
    assert ssam._region_label(250, rows, "-") == "intron 3"
    assert ssam._region_label(150, rows, "-") == "exon 4"


def test_exon_bounds_rejects_a_number_that_does_not_exist(patched):
    patched.strand = "+"
    rows, _ = ssam.exon_table("G")
    with pytest.raises(SystemExit):
        ssam.exon_bounds(rows, 9)


# -------------------------------------------------------------- candidates
class FakeGenome:
    """Serves one plus-strand string; same .codes() contract as GenomeReader."""
    def __init__(self, seq, origin):
        from bajasplice.genome import str_to_codes, _COMP
        self.c = str_to_codes(seq)
        self.origin = origin
        self._COMP = _COMP

    def codes(self, chrom, start, end, strand="+"):
        n = end - start + 1
        out = np.zeros(n, np.int8)
        a, b = start - self.origin, end - self.origin
        sa, sb = max(0, a), min(len(self.c) - 1, b)
        if sb >= sa:
            out[sa - a:sb - a + 1] = self.c[sa:sb + 1]
        return self._COMP[out[::-1]] if strand == "-" else out

    def sequence(self, chrom, start, end, strand="+"):
        from bajasplice.genome import codes_to_str
        return codes_to_str(self.codes(chrom, start, end, strand))


def test_candidate_dinucleotide_is_AG_in_transcript_orientation():
    """An acceptor reads AG on the transcript, whichever strand it is on.

    Plus strand: plus-strand text AG, site at the G.
    Minus strand: plus-strand text CT, site at the C -- which is the G once
    the window is reverse-complemented.
    """
    # origin 101, so seq[0] sits at 101: the AG spans 105-106
    seq = "TTTT" + "AG" + "TTTT" * 24 + "CT" + "TTTT"
    g = FakeGenome(seq, 101)
    assert g.sequence("chr1", 105, 106, "+") == "AG"
    # the CT at the same place, read on the minus strand, is an AG
    ct_at = 101 + seq.index("CT")
    assert g.sequence("chr1", ct_at, ct_at + 1, "+") == "CT"
    assert g.sequence("chr1", ct_at, ct_at + 1, "-") == "AG"


def test_dinuc_helper_matches_site_convention():
    seq = "TTTT" + "AG" + "CCCC"
    g = FakeGenome(seq, 101)
    # plus strand: acceptor site is the G at 106, dinuc spans 105-106
    assert ssam._dinuc(g, "chr1", 106, "+", "acceptor") == "AG"
