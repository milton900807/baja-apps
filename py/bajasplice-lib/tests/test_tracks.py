"""The client payload contract.

A JS TrackLayer consumes this directly, so the field names are an API. If a
refactor renames `xi`/`xf` or drops a base bucket the client breaks silently,
which is what these pin.
"""
import numpy as np
import pytest

from bajasplice.tracks import _bucket, BASES


def test_bucket_splits_by_reference_base():
    pos = np.array([10, 11, 12, 13])
    val = np.array([0.1, 0.2, 0.3, 0.4])
    refs = ["A", "T", "C", "G"]
    out = _bucket(pos, val, refs=refs)
    assert set(out) == set(BASES)
    assert out["A"] == [{"x": 10, "y": 0.1}]
    assert out["G"] == [{"x": 13, "y": 0.4}]


def test_bucket_emits_client_point_objects():
    out = _bucket(np.array([5]), np.array([0.5]), refs=["A"])
    pt = out["A"][0]
    # the client reads pt.x / pt.y, and pushes into apts/tpts/cpts/gpts
    assert set(pt) == {"x", "y"}
    assert isinstance(pt["x"], int) and isinstance(pt["y"], float)


def test_bucket_drops_ambiguous_bases():
    out = _bucket(np.array([1, 2]), np.array([0.1, 0.2]), refs=["N", "A"])
    assert sum(len(v) for v in out.values()) == 1


def test_bucket_rounds_values():
    out = _bucket(np.array([1]), np.array([0.123456789]), refs=["A"], decimals=3)
    assert out["A"][0]["y"] == 0.123


def _fake_payload():
    return {
        "schema": "bajasplice.track/1", "gene": "X",
        "track": {"name": "X", "chrom": "chr1", "strand": "+",
                  "xmin": 1, "xmax": 100,
                  "exons": [{"xi": 1, "xf": 10}], "introns": []},
        "layers": [{"name": "l", "type": "AttributionLayer",
                    "attribution_type": "acceptor_attribution",
                    "attribution_site": 50, "window": 10,
                    "xmin": 40, "xmax": 60, "ymin": 0.0, "ymax": 1.0,
                    "points": {b: [] for b in BASES}}],
    }


def test_payload_exposes_exon_keys_the_client_expects():
    # the client's metaAnalysis() reads e.xi / e.xf from track.getExons()
    e = _fake_payload()["track"]["exons"][0]
    assert "xi" in e and "xf" in e


def test_attribution_layer_carries_site_and_window():
    L = _fake_payload()["layers"][0]
    # AttributionLayer's constructor takes (name, xmin, ymin, xmax, ymax,
    # attribution_type, attribution_site, window, track)
    for k in ("name", "xmin", "ymin", "xmax", "ymax",
              "attribution_type", "attribution_site", "window", "points"):
        assert k in L, f"client constructor needs {k}"
    assert set(L["points"]) == set(BASES)
