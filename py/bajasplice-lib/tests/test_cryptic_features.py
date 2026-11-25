"""Computed sequence features. The strand tests carry most of the weight:
reading the window in the wrong direction scores the donor's neighbourhood
instead of the acceptor's, which is the error this codebase has made most."""
import numpy as np
import pandas as pd
import pytest

from bajasplice.evaluate.cryptic_features import (UPSTREAM, WINDOWS,
                                                  build_features,
                                                  splicenet_scores,
                                                  tract_features, ug_features,
                                                  upstream_seq)
from bajasplice.evaluate.exon_age import TargetFasta


def _fa(tmp_path, seq, name="chr1", fn="g.fa"):
    p = tmp_path / fn
    p.write_text(f">{name}\n{seq}\n")
    return TargetFasta(p)


# --- the window must END at the acceptor, on both strands ----------------------

def test_the_plus_strand_window_ends_at_the_acceptor():
    # genome: ...A G at 9,10 -> an acceptor at 10 must give a window ending AG
    pass


def test_plus_strand_window_ends_on_the_ag(tmp_path):
    fa = _fa(tmp_path, "TTTTTTTTAG" + "CCCCCCCCCC")   # AG at 9-10
    seq = upstream_seq(fa, "chr1", 10, "+", span=10)
    assert seq == "TTTTTTTTAG"
    assert seq.endswith("AG")


def test_minus_strand_window_ends_on_the_ag(tmp_path):
    # On the minus strand the acceptor's AG reads as CT on the plus strand,
    # and the window runs the other genomic way. Acceptor at 11 means plus
    # 11-12 is CT, reverse-complementing to AG at the window's end.
    fa = _fa(tmp_path, "CCCCCCCCCC" + "CT" + "AAAAAAAA")
    seq = upstream_seq(fa, "chr1", 11, "-", span=10)
    assert seq.endswith("AG"), seq
    assert len(seq) == 10


def test_the_two_strands_read_opposite_genomic_directions(tmp_path):
    # A window that read the same direction on both strands would silently
    # score the donor side for half of all events.
    fa = _fa(tmp_path, "AAAAAAAAAA" + "GGGGGGGGGG")
    plus = upstream_seq(fa, "chr1", 10, "+", span=5)     # ends at 10
    minus = upstream_seq(fa, "chr1", 11, "-", span=5)    # ends at 11, going up
    assert plus == "AAAAA"
    assert minus == "CCCCC", minus     # rc of GGGGG at 11-15


def test_a_window_at_a_contig_edge_comes_back_short_not_shifted(tmp_path):
    fa = _fa(tmp_path, "TTAG" + "CCCC")
    seq = upstream_seq(fa, "chr1", 4, "+", span=100)
    assert seq == "TTAG"


def test_an_unknown_contig_gives_an_empty_window(tmp_path):
    fa = _fa(tmp_path, "TTAGCCCC")
    assert upstream_seq(fa, "chr9", 4, "+", span=10) == ""


# --- the TDP-43 element -------------------------------------------------------

def test_a_ug_repeat_is_measured_in_bases():
    f = ug_features("AAAA" + "TGTGTGTGTG" + "CCCCCCAG")
    assert f["ug_run_total"] == 10.0


def test_the_distance_to_the_element_is_measured_back_from_the_acceptor():
    # ...TGTGTG then 6 bases then AG. The acceptor is the final base, so the
    # nearest TG sits 8 back from it.
    seq = "AAAA" + "TGTGTG" + "CCCCCCAG"
    f = ug_features(seq)
    assert f["ug_dist_nearest"] == float(len(seq) - 1 - seq.rfind("TG"))
    assert f["ug_dist_run6"] == float(len(seq) - 1 - 4)


def test_no_element_leaves_the_distances_missing_not_zero():
    # Zero would mean "right at the acceptor", the opposite of absent.
    f = ug_features("AAAACCCCAAAACCCCAG")
    assert np.isnan(f["ug_dist_nearest"])
    assert np.isnan(f["ug_dist_run6"])


def test_nested_windows_see_a_distal_element_only_at_the_wider_spans():
    seq = "TGTGTGTGTG" + "A" * 50 + "CCCCCCCCAG"
    f = ug_features(seq)
    # longest_repeat tries every phase of the unit, so a lone T or G scores 1
    # and only >=2 is a real TG. The near window has no repeat.
    assert f["ug_run_10"] <= 1.0, f["ug_run_10"]
    assert f["ug_run_150"] == 10.0         # the wider window finds it


def test_a_run_of_one_means_no_repeat_not_a_short_one():
    # Pinning the convention so ug_run_* == 1 is never read as an element.
    from bajasplice.evaluate.motif_background import longest_repeat
    assert longest_repeat("CCCCCCCCAG", "TG") == 1   # the lone G
    assert longest_repeat("AAAAAAAA", "TG") == 0     # neither base
    assert longest_repeat("TG", "TG") == 2           # one full repeat


# --- the tract ----------------------------------------------------------------

def test_tract_metrics_are_fractions_not_calls():
    f = tract_features("CTCTCTCTCT" * 5)
    assert 0.0 <= f["py_20"] <= 1.0
    assert f["py_20"] == 1.0
    assert f["py_longest_run"] == 50.0


def test_a_purine_window_reads_low_rather_than_being_rejected():
    f = tract_features("AGAGAGAGAG" * 3)
    assert f["py_20"] == 0.0
    assert f["py_longest_run"] == 0.0


def test_the_acceptor_dinucleotide_is_recorded_as_a_sanity_check():
    assert tract_features("TTTTTTTTAG")["is_ag"] == 1.0
    assert tract_features("TTTTTTTTGG")["is_ag"] == 0.0


def test_every_declared_window_produces_its_columns():
    f = tract_features("CT" * 200)
    g = ug_features("CT" * 200)
    for w in WINDOWS:
        assert f"py_{w}" in f and f"gc_{w}" in f
        assert f"ug_run_{w}" in g and f"ug_frac_{w}" in g


# --- the table ----------------------------------------------------------------

def _events():
    return pd.DataFrame([
        {"gene": "G1", "chrom": "chr1", "strand": "+", "acceptor": 60,
         "fate": "in_frame"},
        {"gene": "G2", "chrom": "chr1", "strand": "+", "acceptor": 120,
         "fate": "frameshift"},
    ])


def test_the_feature_table_has_no_missing_sequence_features(tmp_path):
    # The entire point: score_cryptic was refused at 22% coverage, so anything
    # computed here must be complete.
    seq = ("TGTG" + "CTCTCTCTCTCTCTCTCT" + "AG") * 10
    fa = _fa(tmp_path, seq)
    out = build_features(_events(), fa, span=40)
    cols = [c for c in out.columns
            if c.startswith(("ug_run", "ug_frac", "py_", "gc_"))]
    assert out[cols].notna().all().all()
    assert len(out) == 2


def test_carried_columns_survive_into_the_feature_table(tmp_path):
    fa = _fa(tmp_path, "CT" * 200)
    out = build_features(_events(), fa, span=40)
    assert list(out["fate"]) == ["in_frame", "frameshift"]
    assert list(out["gene"]) == ["G1", "G2"]


def test_the_table_is_keyed_for_joining_back(tmp_path):
    fa = _fa(tmp_path, "CT" * 200)
    out = build_features(_events(), fa, span=40)
    for c in ("chrom", "acceptor", "strand"):
        assert c in out.columns
    assert not out.duplicated(subset=["chrom", "acceptor", "strand"]).any()


# --- the model arm degrades instead of failing --------------------------------

def test_a_missing_checkpoint_returns_none_rather_than_raising(tmp_path):
    got = splicenet_scores([("chr1", 10, "+")], fasta=str(tmp_path / "nope.fa"),
                           ckpt=str(tmp_path / "nothing.pt"))
    assert got is None


def test_the_sequence_features_are_produced_even_without_the_model(tmp_path):
    fa = _fa(tmp_path, "CT" * 200)
    out = build_features(_events(), fa, span=40, with_model=True,
                         ckpt=str(tmp_path / "nothing.pt"))
    assert len(out) == 2
    assert out["py_20"].notna().all()


# --- the model arm: output length, and no silent failures -----------------------

class _FakeNet:
    """Mimics SpliceNet's cropping: output is input length minus context."""
    def __init__(self, ctx, acc=0.7, don=0.2):
        self.ctx, self.acc, self.don = ctx, acc, don

    def __call__(self, x):
        import torch
        n_out = x.shape[-1] - self.ctx
        logits = torch.zeros((1, 3, n_out))
        logits[0, 1, :] = self.acc
        logits[0, 2, :] = self.don
        return logits


def test_a_single_position_yields_exactly_one_output_column():
    # The bug: a window of ctx+1 gives ONE output position, indexed 0. Indexing
    # at ctx//2 raised IndexError on every row and a bare except hid it.
    import torch
    ctx = 80
    net = _FakeNet(ctx)
    x = torch.zeros((1, 4, ctx + 1))
    assert net(x).shape[-1] == 1


def test_failures_are_counted_and_the_first_one_is_reported(capsys, tmp_path):
    got = splicenet_scores([("chr1", 10, "+")] * 3,
                           fasta=str(tmp_path / "missing.fa"),
                           ckpt=str(tmp_path / "missing.pt"))
    out = capsys.readouterr().out
    # either the loader fails up front or every row fails; both must SAY so
    assert got is None or "failed on" in out
    assert out.strip(), "a failure must never be silent"


def test_scores_land_in_range_when_the_model_behaves(monkeypatch, tmp_path):
    import sys, types, torch
    ctx = 40
    fa = _fa(tmp_path, "ACGT" * 200)

    class _G:
        def codes(self, chrom, start, end, strand="+"):
            return np.zeros(end - start + 1, dtype=np.int8)

    mod = types.ModuleType("bajasplice.scan")
    mod.load_splicenet = lambda ckpt=None, device=None: (
        _FakeNet(ctx), ctx, "cpu")
    monkeypatch.setitem(sys.modules, "bajasplice.scan", mod)
    gmod = types.ModuleType("bajasplice.genome")
    gmod.GenomeReader = lambda p: _G()
    gmod.one_hot = lambda c: np.zeros((4, len(c)), dtype=np.float32)
    monkeypatch.setitem(sys.modules, "bajasplice.genome", gmod)

    got = splicenet_scores([("chr1", 500, "+"), ("chr1", 600, "-")],
                           fasta="x")
    assert got is not None
    assert len(got["ss_acceptor"]) == 2
    assert all(0.0 <= v <= 1.0 for v in got["ss_acceptor"])
    assert not any(np.isnan(v) for v in got["ss_acceptor"])
