"""The cryptic re-ranker. The metric tests matter most: AUC on a balanced set
would flatter a model that is useless at the real base rate, so recall at k
within a held-out gene is the only number worth reporting."""
import numpy as np
import pandas as pd
import pytest

from bajasplice.train.cryptic import (TOP_K, add_features, assemble,
                                      fit_and_evaluate, load_positives,
                                      recall_at_k)
from bajasplice.evaluate.exon_age import TargetFasta


def _cands(gene, positions, scores=None):
    n = len(positions)
    return pd.DataFrame({
        "rank": np.arange(1, n + 1),
        "pos": positions,
        "score": scores if scores is not None else np.linspace(1, 0, n),
        "chrom": ["chr1"] * n, "strand": ["+"] * n,
        "type": ["acceptor"] * n})


# --- labelling candidates ------------------------------------------------------

def test_a_known_position_is_labelled_among_its_gene_candidates():
    pos = pd.DataFrame([{"gene": "G1", "chrom": "chr1", "pos": 300.0,
                         "strand": "+"}])
    out = assemble(pos, lambda g: _cands(g, [100, 200, 300, 400]), tol=0,
                   verbose=False)
    assert out["is_positive"].sum() == 1
    assert out.loc[out["is_positive"], "pos"].iloc[0] == 300


def test_tolerance_absorbs_the_off_by_one_between_catalogues():
    # Catalogues disagree about whether the acceptor is the AG's A or its G.
    pos = pd.DataFrame([{"gene": "G1", "chrom": "chr1", "pos": 301.0,
                         "strand": "+"}])
    strict = assemble(pos, lambda g: _cands(g, [100, 300]), tol=0,
                      verbose=False)
    loose = assemble(pos, lambda g: _cands(g, [100, 300]), tol=1,
                     verbose=False)
    assert strict["is_positive"].sum() == 0
    assert loose["is_positive"].sum() == 1


def test_a_positive_with_no_candidate_is_counted_as_unrecoverable(capsys):
    # rank_candidates excludes annotated sites, and a quarter of catalogued
    # cryptic acceptors sit on one. Silently dropping them would inflate recall.
    pos = pd.DataFrame([{"gene": "G1", "chrom": "chr1", "pos": 999.0,
                         "strand": "+"}])
    out = assemble(pos, lambda g: _cands(g, [100, 200]), tol=0, verbose=True)
    txt = capsys.readouterr().out
    assert out["is_positive"].sum() == 0
    assert "NOT recoverable" in txt
    assert "never appear as candidates" in txt


def test_a_gene_the_scanner_fails_on_is_reported_not_fatal(capsys):
    pos = pd.DataFrame([{"gene": "BAD", "chrom": "chr1", "pos": 1.0,
                         "strand": "+"},
                        {"gene": "G1", "chrom": "chr1", "pos": 200.0,
                         "strand": "+"}])

    def fn(g):
        if g == "BAD":
            raise RuntimeError("no such gene")
        return _cands(g, [100, 200])

    out = assemble(pos, fn, tol=0, verbose=True)
    assert out["is_positive"].sum() == 1
    assert "NO candidates" in capsys.readouterr().out


def test_the_base_rate_is_reported_because_it_decides_the_metric(capsys):
    pos = pd.DataFrame([{"gene": "G1", "chrom": "chr1", "pos": 5.0,
                         "strand": "+"}])
    assemble(pos, lambda g: _cands(g, list(range(1, 201))), tol=0,
             verbose=True)
    assert "base rate among candidates" in capsys.readouterr().out


# --- the metric ----------------------------------------------------------------

def _labelled(gene, n, pos_at, score_col):
    d = pd.DataFrame({"gene": [gene] * n, "pos": np.arange(n),
                      score_col: np.zeros(n)})
    d["is_positive"] = False
    d.loc[pos_at, "is_positive"] = True
    d.loc[pos_at, score_col] = 1.0     # the positive ranks first
    return d


def test_recall_at_k_is_one_when_the_positive_ranks_first():
    d = _labelled("G1", 100, 7, "s")
    r = recall_at_k(d, "s", ks=(1, 5))
    assert r[1] == 1.0 and r[5] == 1.0
    assert r["n_genes"] == 1


def test_recall_at_k_is_zero_when_the_positive_ranks_last():
    d = _labelled("G1", 100, 7, "s")
    d["s"] = 1.0 - d["s"]              # invert: the positive is now worst
    r = recall_at_k(d, "s", ks=(1, 5))
    assert r[1] == 0.0 and r[5] == 0.0


def test_recall_is_averaged_over_genes_not_over_rows():
    # One huge gene that fails and one tiny gene that succeeds must give 50%,
    # not a row-weighted number the big gene dominates.
    big = _labelled("BIG", 500, 499, "s")
    big["s"] = 0.0                     # positive buried
    small = _labelled("SMALL", 4, 0, "s")
    r = recall_at_k(pd.concat([big, small], ignore_index=True), "s", ks=(1,))
    assert r[1] == 0.5, r
    assert r["n_genes"] == 2


def test_genes_with_no_positive_are_not_counted_in_the_denominator():
    good = _labelled("G1", 10, 0, "s")
    empty = pd.DataFrame({"gene": ["G2"] * 10, "pos": np.arange(10),
                          "s": np.zeros(10), "is_positive": [False] * 10})
    r = recall_at_k(pd.concat([good, empty], ignore_index=True), "s", ks=(1,))
    assert r["n_genes"] == 1 and r[1] == 1.0


# --- training ------------------------------------------------------------------

def _trainable(n_genes=25, per_gene=40, seed=0, signal=True):
    rng = np.random.default_rng(seed)
    rows = []
    for gi in range(n_genes):
        for j in range(per_gene):
            is_pos = (j == 0)
            ug = rng.gamma(2, 8) + (25 if (is_pos and signal) else 0)
            rows.append({"gene": f"G{gi}", "pos": 1000 + j * 50,
                         "chrom": "chr1", "strand": "+",
                         "is_positive": is_pos,
                         "ss_acceptor": rng.random(),
                         "ug_run_total": ug,
                         "py_20": rng.random()})
    return pd.DataFrame(rows)


def test_a_learnable_signal_beats_the_splicenet_baseline():
    feat = _trainable(signal=True)
    res = fit_and_evaluate(feat, ["ss_acceptor", "ug_run_total", "py_20"],
                           ks=(1, 5))
    assert res["model_recall"][5] > res["baseline_recall"][5], (
        res["model_recall"], res["baseline_recall"])


def test_with_no_signal_it_does_not_beat_the_baseline():
    feat = _trainable(signal=False)
    res = fit_and_evaluate(feat, ["ss_acceptor", "ug_run_total", "py_20"],
                           ks=(1, 5))
    assert res["model_recall"][5] <= res["baseline_recall"][5] + 0.25


def test_out_of_fold_scores_are_filled_for_every_row():
    feat = _trainable()
    res = fit_and_evaluate(feat, ["ss_acceptor", "ug_run_total", "py_20"],
                           ks=(1,))
    assert res["oof"]["model_score"].notna().all()


def test_too_few_positives_refuses_rather_than_reporting_noise():
    feat = _trainable(n_genes=3, per_gene=5)
    with pytest.raises(SystemExit) as e:
        fit_and_evaluate(feat, ["ss_acceptor", "ug_run_total"], ks=(1,))
    assert "not enough" in str(e.value)


def test_folds_never_split_a_gene_across_train_and_test():
    feat = _trainable(n_genes=20)
    res = fit_and_evaluate(feat, ["ss_acceptor", "ug_run_total", "py_20"],
                           ks=(1,))
    # every row got an out-of-fold score, so every gene was a test gene once;
    # GroupKFold guarantees it was not also a training gene in that fold
    assert res["n_splits"] >= 2
    assert res["oof"].groupby("gene")["model_score"].apply(
        lambda s: s.notna().all()).all()


# --- features ------------------------------------------------------------------

def test_features_come_from_the_same_code_the_model_pipeline_uses(tmp_path):
    p = tmp_path / "g.fa"
    p.write_text(">chr1\n" + ("TGTG" + "CTCTCTCTCT" + "AG") * 40 + "\n")
    fa = TargetFasta(p)
    out = add_features(_cands("G1", [200, 400]).assign(gene="G1"), fa,
                       span=40)
    assert "ug_run_total" in out.columns and "py_20" in out.columns
    assert "ss_acceptor" in out.columns, "stage one's score is a stage two feature"
    assert "score" not in out.columns, "renamed, not duplicated"
    assert out[["ug_run_total", "py_20"]].notna().all().all()


# --- a missing gene symbol must not end the run --------------------------------

def test_a_system_exit_from_the_gene_index_is_caught(capsys):
    # scan.gene_span raises SystemExit for an unknown symbol, and SystemExit
    # does NOT inherit from Exception, so `except Exception` let one retired
    # symbol kill a 60-gene run after the splice model had loaded.
    pos = pd.DataFrame([{"gene": "C20orf194", "chrom": "chr1", "pos": 1.0,
                         "strand": "+"},
                        {"gene": "G1", "chrom": "chr1", "pos": 200.0,
                         "strand": "+"}])

    def fn(g):
        if g == "C20orf194":
            raise SystemExit("gene C20orf194 not found in the gene index")
        return _cands(g, [100, 200])

    out = assemble(pos, fn, tol=0, verbose=True)
    txt = capsys.readouterr().out
    assert out["is_positive"].sum() == 1, "the good gene must still train"
    assert "could not resolve" in txt
    assert "C20orf194" in txt


def test_gene_names_keep_their_catalogue_spelling(tmp_path):
    # GENCODE writes C20orf194. Uppercasing it is a guaranteed lookup miss.
    p = tmp_path / "pos.tsv"
    p.write_text("gene\tchrom\tstrand\tacceptor\n"
                 "C20orf194\tchr20\t+\t1000\n"
                 "Tardbp\tchr1\t-\t2000\n")
    out = load_positives(p, require_cat=None)
    assert set(out["gene"]) == {"C20orf194", "Tardbp"}


def test_whitespace_around_a_symbol_is_stripped(tmp_path):
    p = tmp_path / "pos.tsv"
    p.write_text("gene\tchrom\tstrand\tacceptor\n  UNC13A \tchr19\t-\t100\n")
    assert list(load_positives(p, require_cat=None)["gene"]) == ["UNC13A"]


# --- a model that loses to the baseline must not be installed -------------------

from bajasplice.train.cryptic import feature_discrimination


def test_feature_discrimination_separates_a_useful_from_a_useless_feature():
    # On the real run ss_acceptor reached AUC 0.988 and the TDP-43 element
    # only 0.571, which is what explained the model-level failure without
    # reference to any learner.
    rng = np.random.default_rng(0)
    n = 400
    pos = np.zeros(n, bool)
    pos[:20] = True
    feat = pd.DataFrame({
        "is_positive": pos,
        "useful": np.where(pos, rng.normal(5, 1, n), rng.normal(0, 1, n)),
        "useless": rng.normal(0, 1, n)})
    disc = dict((c, a) for c, a, _ in
                feature_discrimination(feat, ["useful", "useless"]))
    assert disc["useful"] > 0.95
    assert abs(disc["useless"] - 0.5) < 0.15


def test_discrimination_skips_a_feature_with_too_few_values():
    feat = pd.DataFrame({"is_positive": [True] * 2 + [False] * 50,
                         "x": [1.0] * 52})
    assert feature_discrimination(feat, ["x"]) == []


def test_discrimination_is_ordered_by_distance_from_chance():
    rng = np.random.default_rng(1)
    n = 300
    pos = np.zeros(n, bool); pos[:30] = True
    feat = pd.DataFrame({
        "is_positive": pos,
        "weak": np.where(pos, rng.normal(0.4, 1, n), rng.normal(0, 1, n)),
        "strong": np.where(pos, rng.normal(4, 1, n), rng.normal(0, 1, n))})
    order = [c for c, _, _ in feature_discrimination(feat, ["weak", "strong"])]
    assert order[0] == "strong"
