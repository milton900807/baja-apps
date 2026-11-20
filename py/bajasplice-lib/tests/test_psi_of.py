"""psi_of must score the genome untouched.

It is a wrapper over psi_delta with pos=-1, chosen because no window and no
exon can contain it, so the "alt" pass applies no substitution. That is a
sentinel, and a sentinel is the kind of thing that stops working quietly: if
psi_delta's bounds test ever changed, psi_of would start scoring a mutated
sequence and still return a plausible number. Hence a test that watches the
bases the model is actually handed.
"""
import numpy as np
import torch

from bajasplice import psi_variants


class Genome:
    """Deterministic sequence, so a mutated base is visible in what arrives."""

    def codes(self, chrom, lo, hi, strand):
        return np.array([(abs(i) % 4) + 1 for i in range(lo, hi + 1)], dtype=np.int64)


class Model:
    """Records every window it is given and returns something input-dependent."""

    def __init__(self):
        self.seen = []

    def __call__(self, x, gm):
        self.seen.append(x.detach().cpu().numpy().copy())
        v = x.sum().reshape(1, 1)
        return v.repeat(1, 3), v.reshape(1)


EVENT = dict(chrom="chr5", strand="+", c1_end=1000, a_start=2000, a_end=2053,
             c2_start=3000)
ARGS = {"win": 20, "context": 40}


def test_psi_of_returns_the_reference_prediction():
    m = Model()
    v, tis = psi_variants.psi_of(m, ARGS, torch.device("cpu"), genome=Genome(), **EVENT)
    assert np.isfinite(v)
    assert len(tis) == 3
    # psi_delta runs a ref pass and an alt pass; with nothing applied the two
    # batches of windows must be byte-identical
    assert len(m.seen) == 2
    assert np.array_equal(m.seen[0], m.seen[1]), "the alt pass changed the sequence"


def test_a_real_variant_does_change_what_the_model_sees():
    """The negative control: without this, the test above passes if psi_delta
    has silently stopped applying variants at all."""
    m = Model()
    # The alt base must actually differ from what Genome returns there, or the
    # control passes vacuously: 2010 % 4 == 2, which this stub encodes as G.
    assert Genome().codes("chr5", 2010, 2010, "+")[0] == 3
    psi_variants.psi_delta(m, ARGS, torch.device("cpu"), pos=2010, ref="G", alt="A",
                           genome=Genome(), **EVENT)
    assert len(m.seen) == 2
    assert not np.array_equal(m.seen[0], m.seen[1]), \
        "psi_delta applied no variant, so psi_of's sentinel proves nothing"


def test_the_sentinel_is_outside_every_window():
    """Stated as an assertion rather than left to the reader: the lowest
    coordinate any window reaches must still be above pos=-1."""
    half = (ARGS["win"] + ARGS["context"]) // 2
    sites = psi_variants._site_positions(EVENT["strand"], EVENT["c1_end"],
                                         EVENT["a_start"], EVENT["a_end"],
                                         EVENT["c2_start"])
    assert min(sites) - half > -1
