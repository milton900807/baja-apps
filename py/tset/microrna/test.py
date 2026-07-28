from pyensembl import EnsemblRelease
import os
from Bio import AlignIO
from Bio.Seq import Seq
from Bio.Seq import MutableSeq
from Bio.Align import PairwiseAligner
from ion import works

grch38 = EnsemblRelease(77)
seq1 = grch38.transcript_by_id("ENST00000557334")
seq2 = grch38.transcript_by_id("ENST00000311936")
aligner = PairwiseAligner()
alignments = aligner.align(Seq(seq1.sequence), Seq(seq2.sequence))
# for alignment in alignments:
#     print(alignment)
works.resolve (alignments)


