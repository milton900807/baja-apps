"""Smoke tests for djPrimer scoring against the bundled model."""
import pytest

from djprimer import load_model


@pytest.fixture(scope="module")
def model():
    return load_model()


def test_expressed_gene_scores_high(model):
    # GAPDH is a housekeeping gene: expressed everywhere, should score high.
    r = model.score("GAPDH", "CAACAGTGGCAACACCTTGTG", "TGGGTTGGTCATGCTCACTAG")
    assert 0.0 <= r["probability"] <= 1.0
    assert r["expression_known"] is True
    assert r["probability"] > 0.5


def test_unknown_gene_is_design_only(model):
    r = model.score("NOTAREALGENE", "CAACAGTGGCAACACCTTGTG", "TGGGTTGGTCATGCTCACTAG")
    assert r["design_only"] is True
    assert 0.0 <= r["probability"] <= 1.0


def test_batch(model):
    rs = model.score_batch([
        ("GAPDH", "CAACAGTGGCAACACCTTGTG", "TGGGTTGGTCATGCTCACTAG"),
        {"gene": "ACTB", "forward": "CACCATTGGCAATGAGCGGTTC", "reverse": "AGGTCTTTGCGGATGTCCACGT"},
    ])
    assert len(rs) == 2
    assert all("probability" in r for r in rs)
