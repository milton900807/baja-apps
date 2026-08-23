"""The bundled slim gene index.

The slim index carries one canonical transcript per gene with exons packed as
an int32 blob. It answers the same lookups as the full index at 1/32 the size,
but it is NOT equivalent: the full index knows every annotated transcript, so
the two exclude different sites when ranking cryptic candidates. That
difference is deliberate and must stay visible.
"""
import numpy as np
import pytest

from bajasplice.index import GeneIndex, slim_index_path, resolve_index


@pytest.fixture(scope="module")
def slim():
    p = slim_index_path()
    if not p.exists():
        pytest.skip("slim index not built")
    return GeneIndex(p)


def test_slim_index_ships_with_the_package():
    assert slim_index_path().exists(), "genes.slim.sqlite should be bundled"
    assert slim_index_path().stat().st_size < 40_000_000, "slim index got too big to ship"


def test_slim_is_flagged_as_slim(slim):
    assert slim.slim is True


def test_gene_lookup_returns_the_same_keys_as_the_full_index(slim):
    r = slim.gene("STMN2")
    assert r is not None
    for k in ("name", "chrom", "strand", "start", "end", "canonical_tx", "n_tx"):
        assert k in r
    assert r["chrom"] == "chr8" and r["strand"] == "+"


def test_unknown_gene_is_none(slim):
    assert slim.gene("NOT_A_REAL_GENE") is None


def test_packed_exons_decode_to_sane_coordinates(slim):
    r = slim.gene("STMN2")
    ex = slim.exons("STMN2")
    assert len(ex) > 1
    assert (ex.end >= ex.start).all()
    assert ex.start.min() >= r["start"] and ex.end.max() <= r["end"]
    assert ex.start.is_monotonic_increasing          # blob is stored sorted


def test_search_works_on_the_slim_schema(slim):
    names = [g["name"] for g in slim.search("STMN")]
    assert "STMN2" in names


def test_resolve_prefers_the_full_index(tmp_path, monkeypatch):
    """A full index in the data root must win, so a bundled fallback never
    silently narrows results the caller expects to span all transcripts."""
    import bajasplice
    from bajasplice.index import index_path
    bajasplice.configure(root=tmp_path)
    (tmp_path / "data" / "processed").mkdir(parents=True)
    assert resolve_index() == slim_index_path()      # nothing local yet
    full = index_path()
    full.write_bytes(b"stub")
    assert resolve_index() == full
