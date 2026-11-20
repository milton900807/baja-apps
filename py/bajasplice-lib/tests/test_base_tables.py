"""_BASE and _COMP are lookup TABLES, not dicts.

Written because a caller used _BASE.get(base, 0), which raised
"'numpy.ndarray' object has no attribute 'get'" at runtime. The call sat
inside a run's own try/except, so the whole PSI result was lost for every
track that had a variant on it: the inclusion numbers went down with the
variant scoring that failed.

Both tables are indexed, and they are indexed by DIFFERENT things, which is
the easy mistake: _BASE by the byte of the base, _COMP by the code. Pinning
both here means the next caller that guesses wrong fails in a test rather
than in a user's report.
"""
import numpy as np

from bajasplice.genome import _BASE, _COMP


def test_base_is_an_ordinal_indexed_table():
    assert isinstance(_BASE, np.ndarray)
    assert not hasattr(_BASE, "get"), "a dict-style lookup on _BASE is the bug this guards"
    assert len(_BASE) == 256, "indexed by the byte, so it must span the byte range"
    for i, b in enumerate("ACGT"):
        assert int(_BASE[ord(b)]) == i + 1
        assert int(_BASE[ord(b.lower())]) == i + 1, "soft-masked sequence reads the same"
    assert int(_BASE[ord("N")]) == 0
    assert int(_BASE[ord("-")]) == 0


def test_comp_is_a_code_indexed_table():
    assert isinstance(_COMP, np.ndarray)
    assert not hasattr(_COMP, "get")
    assert len(_COMP) == 5, "indexed by the 0..4 code, not by the byte"
    # A<->T and C<->G, with 0 (N) complementing to itself
    assert int(_COMP[0]) == 0
    assert int(_COMP[int(_BASE[ord("A")])]) == int(_BASE[ord("T")])
    assert int(_COMP[int(_BASE[ord("T")])]) == int(_BASE[ord("A")])
    assert int(_COMP[int(_BASE[ord("C")])]) == int(_BASE[ord("G")])
    assert int(_COMP[int(_BASE[ord("G")])]) == int(_BASE[ord("C")])


def test_the_two_tables_compose_the_way_a_variant_pass_uses_them():
    """Exactly the operation that was wrong: a plus-strand base written into a
    minus-strand transcript."""
    def code_for(base, minus):
        c = int(_BASE[ord(base)])
        return int(_COMP[c]) if minus else c

    assert code_for("T", False) == int(_BASE[ord("T")])
    assert code_for("T", True) == int(_BASE[ord("A")])
    # the SMN2 c.840C>T case: a C>T on the plus strand of a minus-strand track
    # has to be written as G
    assert code_for("T", True) == int(_BASE[ord("A")])
    assert code_for("C", True) == int(_BASE[ord("G")])
    # and an unknown base must not silently become a real one
    assert code_for("N", False) == 0
