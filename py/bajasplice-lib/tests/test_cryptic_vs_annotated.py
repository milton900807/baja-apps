"""Cryptic against annotated acceptors in the same genes."""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.cryptic_vs_annotated import (CIRCULAR,
                                                      annotated_acceptors,
                                                      assemble,
                                                      fit_and_evaluate,
                                                      per_feature_auc)


def _exons(gene="G1", chrom="chr1", strand="+", spans=((100, 200), (300, 400),
                                                       (500, 600))):
    return pd.DataFrame([{"chrom": chrom, "start": s, "end": e,
                          "strand": strand, "gene_name": gene}
                         for s, e in spans])


# --- deriving annotated acceptors ----------------------------------------------

def test_a_plus_strand_acceptor_is_the_base_before_the_exon():
    out = annotated_acceptors(_exons())
    assert sorted(out["pos"]) == [299, 499]       # 300-1 and 500-1


def test_the_first_exon_contributes_no_acceptor():
    # Its start is a transcription start, not a splice site. Including it adds
    # a position that is not an acceptor at all.
    out = annotated_acceptors(_exons())
    assert 99 not in set(out["pos"])


def test_a_minus_strand_acceptor_is_the_base_after_the_exon():
    out = annotated_acceptors(_exons(strand="-"))
    assert sorted(out["pos"]) == [201, 401]       # 200+1 and 400+1
    assert 601 not in set(out["pos"])             # the first exon on minus


def test_duplicate_exons_across_transcripts_collapse():
    ex = pd.concat([_exons(), _exons()], ignore_index=True)
    assert len(annotated_acceptors(ex)) == 2


def test_an_exon_table_missing_strand_says_so():
    ex = _exons().drop(columns=["strand"])
    with pytest.raises(SystemExit) as e:
        annotated_acceptors(ex)
    assert "strand" in str(e.value)


def test_only_the_requested_genes_are_used():
    ex = pd.concat([_exons("G1"), _exons("G2")], ignore_index=True)
    out = annotated_acceptors(ex, genes={"G1"})
    assert set(out["gene"]) == {"G1"}


# --- assembling the comparison -------------------------------------------------

def _cry(gene="G1", pos=(299,)):
    return pd.DataFrame([{"gene": gene, "chrom": "chr1", "pos": p,
                          "strand": "+"} for p in pos])


def test_an_annotated_position_that_is_also_cryptic_is_removed(capsys):
    # A quarter of catalogued cryptic acceptors sit on an annotated boundary.
    # Leaving them in the negatives puts one position on both sides.
    ann = annotated_acceptors(_exons())            # 299 and 499
    out = assemble(_cry(pos=(299,)), ann, tol=0, verbose=True)
    assert out["is_cryptic"].sum() == 1
    assert (~out["is_cryptic"]).sum() == 1         # only 499 survives
    assert "removed for coinciding" in capsys.readouterr().out


def test_the_clash_check_has_tolerance():
    ann = annotated_acceptors(_exons())
    out = assemble(_cry(pos=(300,)), ann, tol=2, verbose=False)
    assert (~out["is_cryptic"]).sum() == 1, "299 is within 2 of 300"


def test_negatives_come_only_from_genes_holding_a_positive():
    ex = pd.concat([_exons("G1"), _exons("G2", chrom="chr2")],
                   ignore_index=True)
    ann = annotated_acceptors(ex)
    out = assemble(_cry("G1", (999,)), ann, verbose=False)
    assert set(out["gene"]) == {"G1"}


def test_genes_carrying_both_classes_are_counted(capsys):
    ann = annotated_acceptors(_exons())
    assemble(_cry(pos=(999,)), ann, verbose=True)
    assert "carrying both classes" in capsys.readouterr().out


# --- per-feature discrimination ------------------------------------------------

def _feat(n=200, seed=0, signal=True):
    rng = np.random.default_rng(seed)
    cry = np.zeros(n, bool)
    cry[: n // 4] = True
    return pd.DataFrame({
        "gene": [f"G{i % 20}" for i in range(n)],
        "chrom": "chr1", "pos": np.arange(n), "strand": "+",
        "is_cryptic": cry,
        "ug_run_total": np.where(cry & signal, rng.normal(14, 3, n),
                                 rng.normal(5, 3, n)),
        "py_20": rng.random(n),
        "phastCons_alt": np.where(cry, rng.normal(0.1, .05, n),
                                  rng.normal(0.95, .05, n))})


def test_a_feature_higher_in_cryptic_reads_above_half():
    t = per_feature_auc(_feat(), ["ug_run_total", "py_20"])
    row = t[t.feature == "ug_run_total"].iloc[0]
    assert row.auc > 0.9 and row.p < 1e-10
    assert row.cryptic_median > row.annotated_median


def test_a_feature_lower_in_cryptic_reads_below_half():
    t = per_feature_auc(_feat(), ["phastCons_alt"])
    assert t.iloc[0].auc < 0.1


def test_an_uninformative_feature_sits_at_chance():
    t = per_feature_auc(_feat(), ["py_20"])
    assert abs(t.iloc[0].auc - 0.5) < 0.15


def test_the_table_is_ordered_by_distance_from_chance():
    t = per_feature_auc(_feat(), ["py_20", "ug_run_total"])
    assert t.iloc[0].feature == "ug_run_total"


# --- the model -----------------------------------------------------------------

def test_the_circular_features_are_reported_separately():
    feat = _feat(n=400)
    res = fit_and_evaluate(feat, ["ug_run_total", "py_20", "phastCons_alt"])
    assert "all features" in res
    assert "sequence only (no conservation)" in res
    assert "phastCons_alt" not in res[
        "sequence only (no conservation)"]["features"]


def test_conservation_alone_can_carry_the_whole_fit():
    # The warning exists because this is what happens: annotated exons are
    # conserved because they are used, so the split is trivially learnable
    # from phastCons and means nothing mechanistic.
    feat = _feat(n=400, signal=False)
    res = fit_and_evaluate(feat, ["ug_run_total", "py_20", "phastCons_alt"])
    assert res["all features"]["auc"] > 0.9
    assert res["sequence only (no conservation)"]["auc"] < 0.75


def test_real_sequence_signal_survives_dropping_conservation():
    feat = _feat(n=400, signal=True)
    res = fit_and_evaluate(feat, ["ug_run_total", "py_20", "phastCons_alt"])
    assert res["sequence only (no conservation)"]["auc"] > 0.85


def test_too_few_of_either_class_refuses():
    feat = _feat(n=40)
    feat["is_cryptic"] = False
    with pytest.raises(SystemExit) as e:
        fit_and_evaluate(feat, ["ug_run_total"])
    assert "not enough" in str(e.value)


def test_every_row_gets_an_out_of_fold_score():
    feat = _feat(n=400)
    res = fit_and_evaluate(feat, ["ug_run_total", "py_20"])
    assert not np.isnan(res["all features"]["oof"]).any()


# --- AP, not AUC, and the saturated-score trap ---------------------------------

from bajasplice.evaluate.cryptic_vs_annotated import ablate


def test_a_saturated_score_gets_a_tail_rate_beside_its_rank_test():
    # ss_acceptor piles up at 0 and 1. Ties drag Mann-Whitney to exactly
    # 0.500 while the class means differ by 0.31 against 0.46, so the rank
    # test reports "no difference" for a real one.
    n = 400
    cry = np.zeros(n, bool); cry[:100] = True
    sat = np.zeros(n)
    sat[:30] = 1.0            # 30 of 100 cryptic are high
    sat[100:240] = 1.0        # 140 of 300 annotated are high
    feat = pd.DataFrame({"is_cryptic": cry, "gene": "G", "sat": sat})
    t = per_feature_auc(feat, ["sat"]).iloc[0]
    assert "cryptic_hi" in t.index and "annotated_hi" in t.index
    assert t.cryptic_hi < t.annotated_hi, "the tail rate must show the gap"


def test_the_ablation_names_every_group_both_ways():
    feat = _feat(n=400)
    feat["gc_40"] = np.random.default_rng(0).random(len(feat))
    feat["ss_acceptor"] = np.random.default_rng(1).random(len(feat))
    cols = ["ug_run_total", "py_20", "gc_40", "ss_acceptor"]
    t = ablate(feat, cols, n_splits=3)
    sets = set(t["set"])
    assert "everything" in sets
    for g in ("UG", "GC", "pyrimidine", "splicenet"):
        assert f"{g} only" in sets and f"everything except {g}" in sets


def test_the_ablation_reports_average_precision_and_lift():
    feat = _feat(n=400)
    t = ablate(feat, ["ug_run_total", "py_20"], n_splits=3)
    assert {"auc", "ap", "lift"} <= set(t.columns)
    assert (t["ap"] > 0).all() and (t["lift"] > 0).all()


def test_ap_can_show_a_contribution_that_auc_hides():
    # The real case: dropping UG moved AUC 0.877 -> 0.871 while AP fell
    # 0.183 -> 0.117. An ablation read by AUC alone discards the one
    # mechanistically meaningful group.
    feat = _feat(n=600, signal=True)
    rng = np.random.default_rng(3)
    feat["gc_40"] = rng.random(len(feat))
    t = ablate(feat, ["ug_run_total", "gc_40"], n_splits=3).set_index("set")
    assert t.loc["everything", "ap"] > t.loc["everything except UG", "ap"]
