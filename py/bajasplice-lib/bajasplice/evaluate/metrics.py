"""Metrics shared across tasks.

top-k accuracy is the SpliceAI convention: take the k highest-scoring positions
where k is the number of true sites, and ask how many you got. It is a harsher
and more honest measure than accuracy on a class-imbalanced track.
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score

__all__ = ["topk_accuracy", "pr_auc", "per_rbp_auc", "loo_marginal"]

MIN_POS_EVAL = 10


def topk_accuracy(y_true_bin, y_score):
    """Fraction of true sites recovered in the top-k scoring positions, k = #true."""
    k = int(np.sum(y_true_bin))
    if k == 0:
        return float("nan")
    idx = np.argpartition(-y_score, k - 1)[:k]
    return float(np.sum(y_true_bin[idx]) / k)


def pr_auc(y_true_bin, y_score):
    if np.sum(y_true_bin) == 0:
        return float("nan")
    return float(average_precision_score(y_true_bin, y_score))


def per_rbp_auc(score, y, mask, keep=None, min_pos=MIN_POS_EVAL):
    """AUC across exons for each RBP separately.

    Pooling across RBPs would hide the thing that matters: whether the model
    knows which RBP acts on which exon, rather than which exons are generally
    responsive.
    """
    aucs, idx = [], []
    for k in range(y.shape[1]):
        if keep is not None and k not in keep:
            continue
        m = mask[:, k]
        if m.sum() < 50:
            continue
        yy = y[m, k]
        if yy.sum() < min_pos or yy.sum() == m.sum():
            continue
        aucs.append(roc_auc_score(yy, score[m, k]))
        idx.append(k)
    return np.array(aucs), np.array(idx)


def loo_marginal(H, M):
    """Exon responsiveness excluding each RBP in turn.

    Computing it from the full matrix leaks the column being scored, which
    inflates the control it is meant to provide.
    """
    hits = (H * M).sum(1, keepdims=True)
    tested = M.sum(1, keepdims=True)
    return (hits - H * M) / np.maximum(tested - M, 1)
