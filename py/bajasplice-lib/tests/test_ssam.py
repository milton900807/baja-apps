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


# ------------------------------------------------------------ variant alleles
class _FakeReader:
    """A GenomeReader over a fixed plus-strand string, 1-based inclusive."""

    def __init__(self, seq, origin=1):
        self.seq, self.origin = seq.upper(), origin
        self.assembly = "test"

    def codes(self, chrom, start, end, strand="+"):
        from bajasplice.genome import _BASE, _COMP
        out = np.zeros(end - start + 1, np.int8)
        for i, p in enumerate(range(start, end + 1)):
            j = p - self.origin
            if 0 <= j < len(self.seq):
                out[i] = _BASE[ord(self.seq[j])]
        if strand == "-":
            return _COMP[out[::-1]]
        return out

    def sequence(self, chrom, start, end, strand="+"):
        from bajasplice.genome import codes_to_str
        return codes_to_str(self.codes(chrom, start, end, strand))


def test_parse_variant_accepts_the_common_spellings():
    want = {"chrom": "16", "pos": 1762843, "ref": "C", "alt": "T"}
    for spec in ("16:1762843:C>T", "chr16:1762843C>T", "16-1762843-C-T",
                 "16:1,762,843:c>t"):
        assert ssam.parse_variant(spec) == want, spec


def test_parse_variant_refuses_indels_and_non_changes():
    # an indel would move every downstream coordinate, invalidating the exon
    # bounds and offsets the module reports
    with pytest.raises(ValueError, match="changes length"):
        ssam.parse_variant("16:1762843:CA>T")
    with pytest.raises(ValueError, match="not a change"):
        ssam.parse_variant("16:1762843:C>C")
    with pytest.raises(ValueError, match="cannot read variant"):
        ssam.parse_variant("16:1762843")


def test_allele_reader_substitutes_on_the_plus_strand():
    g = _FakeReader("AAACGTAAA", origin=101)       # C is at 104
    r = ssam.AlleleReader(g, "1:104:C>T")
    assert g.sequence("1", 101, 109) == "AAACGTAAA"
    assert r.sequence("1", 101, 109) == "AAATGTAAA"
    # outside the substituted position nothing changes
    assert r.sequence("1", 101, 103) == "AAA"


def test_allele_reader_substitution_precedes_the_reverse_complement():
    """A minus-strand read must show the complement of the ALT base.

    The spec is plus-strand (VCF convention), so applying it after the
    reverse complement would put the change at the wrong end of the window
    and silently score the wrong allele.
    """
    g = _FakeReader("AAACGTAAA", origin=101)
    r = ssam.AlleleReader(g, "1:104:C>T")
    assert g.sequence("1", 101, 109, "-") == "TTTACGTTT"
    #                        plus  AAACGTAAA -> AAATGTAAA
    #                        minus TTTACATTT
    assert r.sequence("1", 101, 109, "-") == "TTTACATTT"


def test_allele_reader_verifies_the_reference_base():
    g = _FakeReader("AAACGTAAA", origin=101)
    with pytest.raises(ValueError, match="but the genome reads"):
        ssam.AlleleReader(g, "1:104:G>T").codes("1", 101, 109)


def test_candidate_positions_follow_strand():
    # plus strand: the site is the G of AG
    g = _FakeReader("TTAGTT", origin=101)          # AG at 103-104
    codes = g.codes("1", 101, 106)
    assert ssam._candidate_positions(codes, 101, "+") == {104}
    # minus strand: plus-strand text is CT and the site is the C
    g2 = _FakeReader("TTCTTT", origin=101)         # CT at 103-104
    codes2 = g2.codes("1", 101, 106)
    assert ssam._candidate_positions(codes2, 101, "-") == {103}


def test_candidate_positions_see_an_ag_the_variant_creates():
    g = _FakeReader("TTCGTT", origin=101)          # no AG
    codes = g.codes("1", 101, 106)
    assert ssam._candidate_positions(codes, 101, "+") == set()
    r = ssam.AlleleReader(g, "1:103:C>A")          # CG -> AG, site at 104
    assert ssam._candidate_positions(r.codes("1", 101, 106), 101, "+") == {104}


def test_variant_caveats_replace_the_reference_one():
    assert "reference_sequence" in ssam.CAVEATS
    assert "variant_applied" in ssam.CAVEATS


# --------------------------------------------------------- occlusion sweep
def test_memory_reader_matches_the_genome_reader_contract():
    seq = "AAACGTAAAGGG"
    g = _FakeReader(seq, origin=101)
    from bajasplice.genome import _BASE
    arr = np.array([_BASE[ord(c)] for c in seq], np.int8)
    m = ssam._MemoryReader(arr, 101)
    for strand in ("+", "-"):
        assert m.sequence("1", 101, 112, strand) == g.sequence("1", 101, 112, strand)
    # out of bounds is zero-padded, not an error, same as GenomeReader
    assert m.sequence("1", 99, 101) == "NNA"
    assert m.sequence("1", 111, 114) == "GGNN"


def test_parse_span_reads_the_cli_forms():
    assert ssam._parse_span("1762600-1762835") == (1762600, 1762835)
    assert ssam._parse_span("1,762,600:1,762,835") == (1762600, 1762835)
    assert ssam._parse_span(None) is None
    with pytest.raises(SystemExit, match="ends before it starts"):
        ssam._parse_span("200-100")
    with pytest.raises(SystemExit, match="cannot read span"):
        ssam._parse_span("nonsense")


def test_occlusion_caveats_exist_and_name_the_limitation():
    for k in ("occlusion_is_dependence", "occlusion_spread"):
        assert k in ssam.CAVEATS
    # the point of the first one is that this is NOT an oligo model
    assert "not a model of an antisense oligo" in ssam.CAVEATS["occlusion_is_dependence"]
    # and of the second that a mean would be the wrong summary
    assert "not means" in ssam.CAVEATS["occlusion_spread"]


def test_dinuc_shuffle_preserves_length_and_composition():
    """The null must change arrangement only; if composition moved too, a drop
    in score would be unattributable."""
    from bajasplice.cis import dinuc_shuffle
    rng = np.random.default_rng(0)
    codes = np.array([1, 2, 3, 4, 2, 2, 1, 3, 4, 4, 2, 1, 3, 2, 4, 1], np.int8)
    for _ in range(8):
        out = dinuc_shuffle(codes, rng)
        assert len(out) == len(codes)
        assert sorted(out.tolist()) == sorted(codes.tolist())


# ------------------------------------------------------- cross-species
def test_containment_is_high_for_similar_and_low_for_unrelated():
    from bajasplice.ortho import _containment
    a = "ATGGCAGCTTCAGCCGCCTCTTGGACCAATTCAGGATCCAAGTGCAGGTAC"
    assert _containment(a, a, k=8) == 1.0
    # one substitution leaves most 8-mers intact
    b = a[:25] + ("T" if a[25] != "T" else "A") + a[26:]
    assert 0.5 < _containment(a, b, k=8) < 1.0
    unrelated = "TTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTT"
    assert _containment(a, unrelated, k=8) < 0.05


def test_rest_exon_table_numbers_in_transcript_order(monkeypatch):
    """Exon 1 must be the rightmost block on the minus strand, as the local
    exon_table does -- otherwise a cross-species comparison silently lines up
    the wrong exons."""
    from bajasplice import ortho
    payload = {"seq_region_name": "7", "strand": -1,
               "Exon": [{"start": 300, "end": 399},
                        {"start": 100, "end": 199},
                        {"start": 500, "end": 599}]}
    monkeypatch.setattr(ortho, "_get", lambda path, species=None: payload)
    rows, info = ortho.rest_exon_table("ENSTEST", "testus_species")
    assert info["strand"] == "-" and info["chrom"] == "7"
    assert [r["number"] for r in rows] == [1, 2, 3]
    assert [r["start"] for r in rows] == [500, 300, 100]   # descending
    assert all(r["length"] == 100 for r in rows)


def test_match_exon_refuses_a_weak_or_ambiguous_correspondence():
    from bajasplice import ortho
    rows = [{"number": 1, "start": 1, "end": 40, "length": 40},
            {"number": 2, "start": 51, "end": 90, "length": 40}]
    info = {"chrom": "1", "strand": "+", "transcript_id": "ENSTEST",
            "species": "testus"}
    human = "ATGGCAGCTTCAGCCGCCTCTTGGACCAATTCAGGATCCA"

    class G:
        def __init__(self, seqs): self.seqs = seqs
        def sequence(self, chrom, start, end, strand="+"):
            return self.seqs[0] if start == 1 else self.seqs[1]

    # nothing resembles the query
    noise = "TTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCC"
    with pytest.raises(ValueError, match="no exon of"):
        ortho.match_exon(human, rows, info, G([noise, noise[::-1]]))
    # two exons match equally well -> refuse rather than pick
    with pytest.raises(ValueError, match="ambiguous correspondence"):
        ortho.match_exon(human, rows, info, G([human, human]))
    # a clear winner is returned with its margin
    row, rep = ortho.match_exon(human, rows, info, G([human, noise]))
    assert row["number"] == 1 and rep["containment"] == 1.0
