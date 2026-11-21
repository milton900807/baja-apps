"""The measured-PSI table, and the one row that matters.

SMN2 exon 7 is the reason the table exists: its short-read PSI is a blend with
SMN1's and no model fit to that label can be right, so a published measurement
is the only honest number to show.
"""
import os
import tempfile

from bajasplice import measured

SMN2_E7_START = 70076521


def test_the_shipped_table_has_smn2_exon7():
    rows = measured.load()
    assert ("chr5", SMN2_E7_START) in rows
    r = rows[("chr5", SMN2_E7_START)]
    assert r["gene"] == "SMN2"
    # about a tenth, which is the published figure; the point of the range is
    # that this is not a constant across assays and cell types
    assert 0.05 <= r["psi"] <= 0.20
    assert r["lo"] is not None and r["hi"] is not None
    assert r["lo"] <= r["psi"] <= r["hi"]
    # an uncited row would look like evidence without being any
    assert r["source"].startswith("http")
    assert r["assay"]


def test_it_matches_an_annotated_exon_containing_the_start():
    hits = measured.for_exons("chr5", [[SMN2_E7_START - 5, SMN2_E7_START + 60]])
    assert len(hits) == 1 and hits[0]["gene"] == "SMN2"
    # the chromosome may arrive bare from a track
    assert len(measured.for_exons("5", [[SMN2_E7_START, SMN2_E7_START + 53]])) == 1
    # and reversed, from a minus-strand track
    assert len(measured.for_exons("chr5", [[SMN2_E7_START + 53, SMN2_E7_START]])) == 1


def test_it_does_not_match_a_neighbouring_exon():
    assert measured.for_exons("chr5", [[SMN2_E7_START + 100, SMN2_E7_START + 200]]) == []
    assert measured.for_exons("chr7", [[SMN2_E7_START, SMN2_E7_START + 53]]) == []
    # one row per exon, not one per overlapping candidate
    hits = measured.for_exons("chr5", [[SMN2_E7_START - 1000, SMN2_E7_START + 1000]])
    assert len(hits) == 1


def test_an_override_table_replaces_the_shipped_one():
    fh = tempfile.NamedTemporaryFile("w", suffix=".tsv", delete=False)
    fh.write("# gene\tchrom\texon_start\tstrand\texon\tpsi\n"
             "MYGENE\tchr9\t500\t-\t3\t0.42\t0.40\t0.44\tnanopore\thttps://example.org/x\n")
    fh.close()
    os.environ["BAJASPLICE_MEASURED_PSI"] = fh.name
    try:
        rows = measured.load()
        assert ("chr9", 500) in rows
        assert ("chr5", SMN2_E7_START) not in rows      # replaced, not merged
        assert rows[("chr9", 500)]["psi"] == 0.42
    finally:
        os.environ.pop("BAJASPLICE_MEASURED_PSI", None)
        measured._CACHE.clear()


def test_rows_without_a_value_are_skipped():
    fh = tempfile.NamedTemporaryFile("w", suffix=".tsv", delete=False)
    fh.write("gene\tchrom\texon_start\tstrand\texon\tpsi\n"          # header
             "A\tchr1\t10\t+\t1\t\t\t\t\t\n"                         # no psi
             "B\tchr1\tnotanumber\t+\t1\t0.5\n"                      # no start
             "C\tchr1\t30\t+\t1\t0.5\t0.4\t0.6\tassay\thttps://e.org\n")
    fh.close()
    os.environ["BAJASPLICE_MEASURED_PSI"] = fh.name
    try:
        measured._CACHE.clear()
        rows = measured.load()
        assert list(rows) == [("chr1", 30)]
    finally:
        os.environ.pop("BAJASPLICE_MEASURED_PSI", None)
        measured._CACHE.clear()
