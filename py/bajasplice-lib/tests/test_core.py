"""Tests for the invariants that actually broke while building this."""
import numpy as np
import pytest

from bajasplice.config import split_of, TEST_CHROMS, VAL_CHROMS
from bajasplice.genome import one_hot, codes_to_str
from bajasplice.evaluate.metrics import topk_accuracy, pr_auc, loo_marginal


def test_splits_are_disjoint():
    assert not (TEST_CHROMS & VAL_CHROMS)
    for c in TEST_CHROMS:
        assert split_of(c) == "test"
    for c in VAL_CHROMS:
        assert split_of(c) == "val"
    assert split_of("chr8") == "train"


def test_one_hot_shape_and_n_handling():
    codes = np.array([1, 2, 3, 4, 0])          # A C G T N
    oh = one_hot(codes)
    assert oh.shape == (4, 5)
    assert oh[:, :4].sum() == 4                # every real base sets one channel
    assert oh[:, 4].sum() == 0                 # N is all-zero, not a fifth channel
    assert codes_to_str(codes) == "ACGTN"


def test_topk_accuracy():
    y = np.array([1, 0, 0, 1, 0])
    perfect = np.array([0.9, 0.1, 0.1, 0.8, 0.0])
    assert topk_accuracy(y, perfect) == 1.0
    inverted = np.array([0.0, 0.9, 0.8, 0.1, 0.7])
    assert topk_accuracy(y, inverted) == 0.0
    assert np.isnan(topk_accuracy(np.zeros(5), perfect))


def test_pr_auc_degenerate():
    assert np.isnan(pr_auc(np.zeros(4), np.array([0.1, 0.2, 0.3, 0.4])))


def test_loo_marginal_excludes_own_column():
    # exon responds to RBP 0 only; its leave-one-out rate for RBP 0 must be 0,
    # otherwise the control leaks the label it is being compared against
    H = np.array([[1.0, 0.0, 0.0]])
    M = np.ones((1, 3), dtype=bool)
    loo = loo_marginal(H, M)
    assert loo[0, 0] == 0.0
    assert loo[0, 1] == pytest.approx(0.5)     # sees RBP 0's hit, over 2 other RBPs


def test_loo_marginal_respects_mask():
    H = np.array([[1.0, 1.0, 0.0]])
    M = np.array([[True, True, False]])
    loo = loo_marginal(H, M)
    assert loo[0, 0] == pytest.approx(1.0)     # only RBP 1 counted, and it is a hit


def test_checkpoint_resolution_prefers_a_local_model(tmp_path, monkeypatch):
    """A retrained model in the data root must win over the bundled weight,
    otherwise shipping weights would silently override the user's own work."""
    import bajasplice
    from bajasplice.scan import resolve_checkpoint

    monkeypatch.delenv("BAJASPLICE_CKPT", raising=False)
    root = tmp_path / "proj"
    (root / "models").mkdir(parents=True)
    bajasplice.configure(root=root)

    # nothing local yet -> the bundled copy
    from bajasplice.weights import bundled
    assert resolve_checkpoint() == bundled()

    # a local checkpoint takes precedence
    local = root / "models" / "ss_ctx2000.pt"
    local.write_bytes(b"stub")
    assert resolve_checkpoint() == local

    # an explicit path beats both
    other = tmp_path / "other.pt"
    other.write_bytes(b"stub")
    assert resolve_checkpoint(other) == other


def test_all_five_checkpoints_ship():
    from bajasplice.weights import bundled, BUNDLED
    assert set(BUNDLED) == {"ss_ctx2000", "psi_ctx2000", "altss", "rbp", "rbp_bind"}
    for name in BUNDLED:
        p = bundled(name)
        assert p is not None and p.exists(), f"{name} should ship with the package"
        assert p.stat().st_size > 100_000, f"{name} looks truncated"
    assert bundled("no_such_model") is None


def test_receptive_field_matches_the_architecture():
    from bajasplice.cis import receptive_field
    # a dilated stack of (kernel, dilation) blocks, two convolutions each
    assert receptive_field(80) == 40
    assert receptive_field(400) == 200
    assert receptive_field(2000) == 1000
    assert receptive_field(10000) == 5000


def test_dinuc_shuffle_preserves_composition():
    """The occlusion null must destroy motifs without changing composition,
    otherwise a measured impact conflates arrangement with GC content."""
    import numpy as np
    from collections import Counter
    from bajasplice.cis import dinuc_shuffle
    rng = np.random.default_rng(0)
    seq = np.array([1, 2, 2, 4, 4, 4, 2, 3, 1, 4, 4, 2, 1, 3, 3, 4, 1, 2] * 4, dtype=np.int8)
    sh = dinuc_shuffle(seq, rng)
    assert len(sh) == len(seq)
    assert np.bincount(sh, minlength=5).tolist() == np.bincount(seq, minlength=5).tolist()
    d0 = Counter(zip(seq[:-1].tolist(), seq[1:].tolist()))
    d1 = Counter(zip(sh[:-1].tolist(), sh[1:].tolist()))
    assert d0 == d1, "dinucleotide frequencies must be preserved"


def test_cis_profile_refuses_beyond_the_receptive_field():
    """Asking past the receptive field would return a flat line that reads as
    'no regulatory content' when it means 'not measurable'. It must refuse."""
    import pytest
    from bajasplice.cis import cis_profile, receptive_field
    with pytest.raises(ValueError, match="receptive field"):
        cis_profile(None, 2000, "chr1", 1000000, "+", "acceptor", None,
                    max_dist=receptive_field(2000) + 1)


def test_dinuc_shuffle_keeps_length_and_n_positions():
    """A window can contain N: an assembly gap, or padding past the end of a
    track in the interactive client. Dropping those would silently shorten the
    window and shift every base after it, which crashed the caller when it
    wrote the result back into a fixed-width slice."""
    import numpy as np
    from bajasplice.cis import dinuc_shuffle
    rng = np.random.default_rng(0)
    seq = np.array([0, 0, 1, 2, 3, 4, 1, 2, 4, 4, 3, 1, 0, 0, 0], dtype=np.int8)
    sh = dinuc_shuffle(seq, rng)
    assert len(sh) == len(seq)
    assert np.array_equal(np.flatnonzero(seq == 0), np.flatnonzero(sh == 0))
    assert sorted(sh.tolist()) == sorted(seq.tolist())
    # an all-N window has nothing to shuffle and must come back unchanged
    allN = np.zeros(12, dtype=np.int8)
    assert np.array_equal(dinuc_shuffle(allN, rng), allN)


def test_cis_profile_sequence_refuses_beyond_the_receptive_field():
    import pytest
    from bajasplice.cis import cis_profile_sequence, receptive_field
    with pytest.raises(ValueError, match="receptive field"):
        cis_profile_sequence(None, 2000, "ACGT" * 100, 200, "+", "acceptor", None,
                             max_dist=receptive_field(2000) + 1)


def test_cis_profile_sequence_rejects_a_site_outside_the_sequence():
    """The client hands an index derived from a click, so an off-track site is
    a normal input, not a programming error. It must say so rather than
    silently profiling whatever base the index wrapped around to."""
    import pytest
    from bajasplice.cis import cis_profile_sequence
    with pytest.raises(ValueError, match="outside the sequence"):
        cis_profile_sequence(None, 2000, "ACGT" * 100, 400, "+", "acceptor", None,
                             max_dist=100)


def test_str_to_codes_round_trips_and_handles_rna_and_n():
    import numpy as np
    from bajasplice.genome import str_to_codes, codes_to_str
    assert codes_to_str(str_to_codes("ACGTN")) == "ACGTN"
    assert codes_to_str(str_to_codes("ACGU")) == "ACGT"      # RNA is accepted
    assert codes_to_str(str_to_codes("acgt")) == "ACGT"
    # reverse complement matches GenomeReader's own strand convention
    assert codes_to_str(str_to_codes("ACGTN", strand="-")) == "NACGT"
