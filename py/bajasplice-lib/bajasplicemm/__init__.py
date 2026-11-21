"""BajaSpliceMM - BajaSplice run as mouse (Mus musculus, GRCm39).

Not a fork. This is the same package with the species switched, so the models,
the scanning code and every pinned coordinate convention are shared with the
human build and cannot drift from it. What changes is in bajasplice.config:
the karyotype (chr1-19, X, Y), the canonical-transcript tag
(Ensembl_canonical; MANE is human-only), and a separate root, config file and
environment prefix (BAJASPLICEMM_*) so a mouse run can never pick up the human
genome.

    import bajasplicemm
    bajasplicemm.configure(root="~/ml/splicing-mm", genome_fasta=..., gencode_gtf=...)
    from bajasplicemm import scan_gene
    acc, don, where = scan_gene("Tardbp")

IMPORTING THIS MODULE SWITCHES THE WHOLE PROCESS TO MOUSE. Species is
process-wide, so do not mix human and mouse work in one interpreter; run them
as separate processes.
"""
from bajasplice.config import set_species as _set_species

_set_species("mouse")

from bajasplice import *                      # noqa: E402,F401,F403
from bajasplice import __version__            # noqa: E402,F401


def __getattr__(name):
    # scan/tracks import torch; keep `import bajasplicemm` cheap
    if name in ("scan_gene", "scan_region", "rank_candidates", "load_splicenet"):
        from bajasplice import scan
        return getattr(scan, name)
    raise AttributeError(name)
