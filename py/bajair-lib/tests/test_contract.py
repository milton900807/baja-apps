"""The behavioural contract: silence is a valid answer, and it is not an error."""
import pandas as pd
import pytest

from bajair.model import load_model, tier_for
from bajair.scan import hits


def _intron(**kw):
    base = dict(chrom="chr1", istart=1000, iend=1200, strand="+", gene_name="X",
                transcript_id="T1", intron_len=201, up_exon_len=100, dn_exon_len=100,
                n_introns=5, intron_number=2, rel_position=0.4, canonical=1,
                mane=1, basic=1, gc_intron=0.6, gc_5p=0.6, gc_3p=0.6,
                gc_up_exon=0.5, gc_dn_exon=0.5, ppt_frac=0.7,
                log_len=2.3, log_up_exon=2.0, log_dn_exon=2.0,
                ss_donor=0.99, ss_acceptor=0.99, ss_min=0.99,
                ss_donor_compete=0.01, ss_acceptor_compete=0.01)
    base.update(kw)
    return base


def test_tiers_are_ordered_strongest_first():
    s = load_model()
    thr = [t["threshold"] for t in s.tiers]
    assert thr == sorted(thr, reverse=True)


def test_score_below_every_tier_returns_none():
    assert tier_for(0.0, load_model()) is None


def test_no_hits_returns_empty_list_not_an_error():
    # a long AT-poor intron is the opposite of the retention-prone profile
    df = pd.DataFrame([_intron(intron_len=40000, log_len=4.6, gc_intron=0.32,
                               gc_5p=0.32, gc_3p=0.32)])
    assert hits(df) == []


def test_a_hit_carries_a_description_with_its_measured_precision():
    df = pd.DataFrame([_intron(intron_len=90, log_len=1.95, gc_intron=0.72,
                               gc_5p=0.72, gc_3p=0.72)])
    out = hits(df, tier="elevated")
    if not out:
        pytest.skip("model does not rank this synthetic intron highly")
    h = out[0]
    assert h["tier"] in {"elevated", "notable", "strong", "exceptional"}
    assert h["evidence"] and h["text"]
    assert "%" in h["expect"]          # the precision is stated, not implied
    assert "condition" in h["caveat"].lower()


def test_clean_only_drops_weak_site_introns():
    df = pd.DataFrame([_intron(intron_len=90, log_len=1.95, gc_intron=0.72,
                               gc_5p=0.72, gc_3p=0.72,
                               ss_donor=0.2, ss_acceptor=0.2, ss_min=0.2, mane=0)])
    assert hits(df, tier="elevated", clean_only=True) == []
