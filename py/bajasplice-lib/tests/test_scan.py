"""The minus-strand chunking bug, pinned.

A whole-track reverse at the end of a chunked scan looks equivalent to
reversing each chunk, but silently scrambles chunk order for any region longer
than one chunk. That shipped once; it should not ship again.
"""
import numpy as np

from bajasplice.scan import chunk_offsets


def test_plus_strand_is_identity():
    assert list(chunk_offsets(0, 5, "+")) == [0, 1, 2, 3, 4]
    assert list(chunk_offsets(100, 3, "+")) == [100, 101, 102]


def test_minus_strand_reverses_within_the_chunk_only():
    # output index 0 of a reverse-complemented chunk is its LAST genomic base
    assert list(chunk_offsets(0, 5, "-")) == [4, 3, 2, 1, 0]
    # and the second chunk stays above the first: chunk order is not reversed
    assert list(chunk_offsets(5, 5, "-")) == [9, 8, 7, 6, 5]


def test_chunks_tile_the_region_exactly_once():
    n, chunk = 23, 5
    seen = []
    for off in range(0, n, chunk):
        L = min(chunk, n - off)
        seen.extend(chunk_offsets(off, L, "-").tolist())
    assert sorted(seen) == list(range(n))          # every base covered once


def test_global_reverse_would_differ():
    """Guard against someone 'simplifying' this back to a single reverse."""
    n, chunk = 10, 5
    per_chunk = []
    for off in range(0, n, chunk):
        L = min(chunk, n - off)
        per_chunk.extend(chunk_offsets(off, L, "-").tolist())
    naive = list(range(n))[::-1]
    assert per_chunk != naive
