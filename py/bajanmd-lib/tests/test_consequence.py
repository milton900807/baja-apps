"""The NMD rule, end to end, on genes built so the answer is known by construction.

Covers the part that is new here and so has no history behind it: deriving a
cassette event from a transcript's own exon chain, splicing both isoforms,
finding the frame from the annotated CDS start, and measuring DJ. Both strands,
because GenomeReader reverse-complements a minus-strand request and every
coordinate in this file would otherwise be read off the wrong end.
"""
import sys
import types

import numpy as np
import pandas as pd
import pytest

# --- a genome stub with the real GenomeReader semantics -----------------------
_ALPH = "NACGT"
_BASE = np.zeros(256, np.int8)
for _i, _b in enumerate("ACGT", 1):
    _BASE[ord(_b)] = _i
_COMP = np.array([0, 4, 3, 2, 1], np.int8)
CHROM = {}


def _codes_to_str(codes):
    return "".join(_ALPH[int(c)] for c in codes)


class _Genome:
    def codes(self, chrom, start, end, strand="+"):
        seq = CHROM[chrom]
        out = np.zeros(end - start + 1, np.int8)
        s, e = max(1, start), min(len(seq), end)
        if e >= s:
            out[s - start:s - start + (e - s + 1)] = _BASE[
                np.frombuffer(seq[s - 1:e].encode(), np.uint8)]
        return _COMP[out[::-1]] if strand == "-" else out

    def sequence(self, chrom, start, end, strand="+"):
        return _codes_to_str(self.codes(chrom, start, end, strand))


def _install_stub():
    g = types.ModuleType("bajasplice.genome")
    g.GenomeReader = _Genome
    g.codes_to_str = _codes_to_str
    pkg = types.ModuleType("bajasplice")
    pkg.genome = g
    sys.modules.setdefault("bajasplice", pkg)
    sys.modules["bajasplice.genome"] = g


_install_stub()
from bajanmd.consequence import gene_exons, classify, dj_of, offset_of  # noqa: E402

RC = str.maketrans("ACGT", "TGCA")


def _build(gene, chrom, strand, exon_seqs, gap=200, origin=1000):
    """Lay exons on a chromosome in TRANSCRIPT order and return their records.

    On the minus strand the transcript runs from high coordinate to low, so the
    first exon is placed rightmost and its sequence is written reverse
    complemented. Getting this wrong is the failure the strand cases exist to
    catch.
    """
    rows, blocks = [], []
    if strand == "+":
        pos = origin
        for s in exon_seqs:
            blocks.append((pos, pos + len(s) - 1, s))
            pos += len(s) + gap
    else:
        pos = origin + sum(len(s) + gap for s in exon_seqs)
        for s in exon_seqs:
            end = pos
            start = end - len(s) + 1
            blocks.append((start, end, s.translate(RC)[::-1]))
            pos = start - gap - 1
    hi = max(b[1] for b in blocks) + 500
    seq = list(CHROM.get(chrom, "A" * hi).ljust(hi, "A"))
    for st, en, s in blocks:
        for k, ch in enumerate(s):
            seq[st - 1 + k] = ch
    CHROM[chrom] = "".join(seq)
    for st, en, _ in blocks:
        rows.append(dict(chrom=chrom, start=st, end=en, strand=strand,
                         transcript_id=gene + "_t", gene_name=gene,
                         mane=1, basic=1))
    return rows, blocks


def _tables(rows, cds_first_block):
    ex = pd.DataFrame(rows)
    st, en = cds_first_block
    cds = pd.DataFrame([dict(chrom=ex.chrom.iloc[0], start=st, end=en,
                             strand=ex.strand.iloc[0],
                             transcript_id=ex.transcript_id.iloc[0],
                             gene_name=ex.gene_name.iloc[0], mane=1, basic=1)])
    return ex, cds


A9 = "GCT" * 9          # 27 nt, no stop in any frame used here
POISON = ["ATG" + A9,          # exon 1, 30 nt, CDS starts here
          "TAA" + A9,          # exon 2, 30 nt, in-frame stop when included
          "GCT" * 10,          # exon 3, 30 nt
          "GCT" * 30]          # exon 4, 90 nt, long last exon
CLEAN = ["ATG" + A9, "GCT" * 10, "GCT" * 10, "GCT" * 30]


@pytest.mark.parametrize("strand", ["+", "-"])
def test_poison_exon_is_nmd_in(strand):
    """Including exon 2 puts a stop 57 nt before the last junction; skipping it
    leaves no stop at all. That is the definition of a poison exon."""
    rows, blocks = _build("POIS" + ("P" if strand == "+" else "M"),
                          "chrP" + strand, strand, POISON)
    ex, cds = _tables(rows, (blocks[0][0], blocks[0][1]))
    got = gene_exons(ex.gene_name.iloc[0], exons=ex, cds=cds, genome=_Genome())
    by = {(r["a_start"], r["a_end"]): r for r in got}
    e2 = by[(blocks[1][0], blocks[1][1])]
    assert e2["nmd_class"] == "NMD_in", got
    assert e2["dj_incl"] == 57                 # 90 nt last exon, stop ends at 33
    assert e2["dj_skip"] is None               # no stop anywhere in the skip form
    assert e2["mane_class"] == "NMD_in"
    assert e2["frac"] == 1.0


@pytest.mark.parametrize("strand", ["+", "-"])
def test_gene_with_no_stop_switches_nothing(strand):
    rows, blocks = _build("CLN" + ("P" if strand == "+" else "M"),
                          "chrC" + strand, strand, CLEAN)
    ex, cds = _tables(rows, (blocks[0][0], blocks[0][1]))
    got = gene_exons(ex.gene_name.iloc[0], exons=ex, cds=cds, genome=_Genome())
    assert got, "internal exons should still be reported"
    assert {r["nmd_class"] for r in got} == {"none"}


def test_only_internal_exons_are_cassette_candidates():
    rows, blocks = _build("EDGE", "chrE", "+", POISON)
    ex, cds = _tables(rows, (blocks[0][0], blocks[0][1]))
    got = gene_exons("EDGE", exons=ex, cds=cds, genome=_Genome())
    seen = {(r["a_start"], r["a_end"]) for r in got}
    assert (blocks[0][0], blocks[0][1]) not in seen      # first exon
    assert (blocks[3][0], blocks[3][1]) not in seen      # last exon
    assert len(seen) == 2


def test_classify_truth_table():
    assert classify(None, 99) == "NMD_in"
    assert classify(99, None) == "NMD_ex"
    assert classify(99, 99) == "both"
    assert classify(None, None) == "none"
    assert classify(10, 10) == "none"        # both below the threshold
    assert classify(10, 99) == "NMD_in"


def test_single_exon_isoform_is_never_a_substrate():
    assert dj_of([(1, 90)], "ATG" + "GCT" * 9 + "TAA", 0) == (None, None)


def test_offset_of_respects_strand():
    blocks = [(100, 109), (200, 209)]
    assert offset_of(blocks, "+", 100) == 0
    assert offset_of(blocks, "+", 205) == 15
    # minus-strand blocks arrive in transcript order, each still (low, high)
    assert offset_of([(200, 209), (100, 109)], "-", 209) == 0
    assert offset_of(blocks, "+", 150) is None
