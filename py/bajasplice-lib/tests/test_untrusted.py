"""The untrusted-exon lookup, on the event it exists for.

SMN2 exon 7 is chr5:70,076,521-70,076,573 in hg38. cassette.tsv gives it a
median PSI of 0.84 and the truth is about 0.10, so the only acceptable
behaviour is that a run over this exon comes back flagged.
"""
import os
import tempfile

from bajasplice import untrusted

SMN2_E7 = (70076521, 70076573)

BED = """# comment
track name=segdups
chr5\t70070000\t70080000\tSMN1
chr7\t100\t200\t.
chr7\t150\t400\tFOO
chr7\t1000\t1100\tBAR
"""


def _bed():
    fh = tempfile.NamedTemporaryFile("w", suffix=".bed", delete=False)
    fh.write(BED)
    fh.close()
    return fh.name


def test_smn2_exon7_is_flagged():
    iv = untrusted.Intervals.load(_bed())
    assert iv.hits("chr5", *SMN2_E7) == ["SMN1"]
    # the chromosome may arrive bare from a track
    assert iv.hits("5", *SMN2_E7) == ["SMN1"]
    out = untrusted.spans(iv, "5", [list(SMN2_E7)])
    assert len(out) == 1 and out[0]["why"] == "SMN1"
    assert out[0]["xi"] == SMN2_E7[0]


def test_clean_exon_is_not_flagged():
    iv = untrusted.Intervals.load(_bed())
    assert iv.hits("chr5", 70090000, 70090100) == []
    assert iv.hits("chr9", 70070500, 70070600) == []   # right span, wrong chromosome
    assert untrusted.spans(iv, "chr5", [[70090000, 70090100]]) == []


def test_boundaries_and_overlap():
    iv = untrusted.Intervals.load(_bed())
    assert iv.hits("chr7", 200, 250)            # touches the end of the first
    assert iv.hits("chr7", 90, 100)             # touches the start of the first
    assert not iv.hits("chr7", 500, 900)        # in the gap
    # an exon spanning two intervals reports both, and the nested one does not
    # hide behind the wider one that starts before it
    assert sorted(iv.hits("chr7", 160, 180)) == [".", "FOO"]
    # a name of "." is not a reason, so the span falls back to empty
    s = untrusted.spans(iv, "chr7", [[110, 120]])
    assert len(s) == 1 and s[0]["why"] == ""


def test_reversed_coordinates():
    """A minus-strand track hands over hi, lo."""
    iv = untrusted.Intervals.load(_bed())
    assert iv.hits("chr5", SMN2_E7[1], SMN2_E7[0]) == ["SMN1"]
    out = untrusted.spans(iv, "chr5", [[SMN2_E7[1], SMN2_E7[0]]])
    assert out[0]["xi"] == SMN2_E7[0] and out[0]["xf"] == SMN2_E7[1]


def test_absent_file_flags_nothing_and_says_so():
    """The whole point: silence must be distinguishable from a clean result."""
    os.environ.pop("BAJASPLICE_UNTRUSTED_BED", None)
    iv = untrusted.load("/nonexistent/path.bed")
    assert len(iv) == 0
    assert untrusted.source("/nonexistent/path.bed") is None
    assert untrusted.spans(iv, "chr5", [list(SMN2_E7)]) == []


def test_env_var_is_honoured():
    p = _bed()
    os.environ["BAJASPLICE_UNTRUSTED_BED"] = p
    try:
        assert untrusted.source() == p
        assert untrusted.load().hits("chr5", *SMN2_E7) == ["SMN1"]
    finally:
        os.environ.pop("BAJASPLICE_UNTRUSTED_BED", None)


def test_malformed_rows_are_skipped():
    fh = tempfile.NamedTemporaryFile("w", suffix=".bed", delete=False)
    fh.write("chrom\tstart\tend\nchr5\tnotanumber\t5\nchr5\t1\n"
             "chr5\t70070000\t70080000\tSMN1\n")
    fh.close()
    iv = untrusted.Intervals.load(fh.name)
    assert len(iv) == 1
    assert iv.hits("chr5", *SMN2_E7) == ["SMN1"]
