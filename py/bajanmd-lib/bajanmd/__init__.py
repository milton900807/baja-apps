"""BajaNMD: what happens to a transcript when a cassette exon goes in or out.

Three things, in the order a caller needs them.

  consequence  for every cassette-eligible exon of a gene, does INCLUDING it
               send the transcript to NMD (a poison exon), does SKIPPING it
               (an essential exon whose loss breaks frame), both, or neither.
               Computed from the annotation and the genome, per transcript.

  design       steric-block ASOs that push a chosen exon toward skipping,
               scored by occluding each window and re-reading the splice sites.

  offtarget    those oligos screened against the prebuilt indexes in
               py/sequence/offtarget, pre-mRNA included.

The direction the caller wants decides which exons matter, and the two are
opposite. To RAISE a protein, skip a poison exon so the transcript escapes
decay: that is the TANGO-class strategy behind STK-001 on SCN1A exon 20N. To
LOWER a protein, skip an essential exon so the transcript enters decay. The
oligo is the same kind of molecule either way; only the exon's class differs,
which is why the NMD call is the part that carries the weight here.

What this does NOT do: it says nothing about which RNA-binding protein acts at
a site. Tests in this lab found predicted RBP footprints do not localize
splicing regulation, so nothing here ranks a window by predicted binding.
"""

__version__ = "0.1.0"

from .consequence import DJ_THRESHOLD, gene_exons, classify   # noqa: F401
