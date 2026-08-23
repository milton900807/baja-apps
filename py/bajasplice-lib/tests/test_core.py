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
