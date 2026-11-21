"""bajasplice - sequence models for splicing, with the controls that decide
whether the numbers mean anything.

Four supervised tasks (splice sites, cassette-exon PSI, competing splice sites,
RBP knockdown response) plus de novo cryptic exon detection. Every task ships
with a baseline that a model must beat before its score means anything:
motif-only PWMs, exon length and GC, proximal-site bias, leave-one-out
responsiveness, and dinucleotide-matched decoys.

Quick start:

    import bajasplice
    bajasplice.configure(root="~/ml/splicing", genome_fasta=..., gencode_gtf=...)
    from bajasplice.scan import scan_gene
    hits = scan_gene("TARDBP")

Mouse (BajaSpliceMM) is the same package run as another species:

    import bajasplicemm            # or bajasplice.set_species("mouse")
    bajasplicemm.configure(root="~/ml/splicing-mm", genome_fasta=..., gencode_gtf=...)
    hits = scan_gene("Tardbp")
"""
from bajasplice.config import (configure, paths, split_of, species, set_species,
                              TEST_CHROMS, VAL_CHROMS, MAIN_CHROMS)

__version__ = "0.1.0"
__all__ = ["configure", "paths", "split_of", "species", "set_species",
           "TEST_CHROMS", "VAL_CHROMS",
           "MAIN_CHROMS", "__version__"]
