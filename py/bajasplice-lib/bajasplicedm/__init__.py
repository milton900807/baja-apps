"""BajaSpliceDM - BajaSplice run as fly (Drosophila melanogaster, BDGP6).

The same package as the human and mouse builds with the species switched; see
bajasplicemm for why that is a setting and not a fork. What is specific to fly,
all of it in bajasplice.config and bajasplice.datasets:

  - the reference is Ensembl's, because GENCODE has no fly release, so
    chromosomes are 2L, 2R, 3L, 3R, 4, X, Y with no chr prefix;
  - the split is by arm: 2L held out for test, X for validation;
  - training windows label neighbouring same-strand genes' sites as well,
    because in a genome this compact a window rarely holds one gene alone.

    import bajasplicedm
    bajasplicedm.configure(root="~/ml/splicing-dm", genome_fasta=..., gencode_gtf=...)
    from bajasplicedm import scan_gene
    acc, don, where = scan_gene("TBPH")

IMPORTING THIS MODULE SWITCHES THE WHOLE PROCESS TO FLY. Species is
process-wide, so run human, mouse and fly work as separate processes.
"""
from bajasplice.config import set_species as _set_species

_set_species("fly")

from bajasplice import *                      # noqa: E402,F401,F403
from bajasplice import __version__            # noqa: E402,F401


def __getattr__(name):
    # scan/tracks import torch; keep `import bajasplicedm` cheap
    if name in ("scan_gene", "scan_region", "rank_candidates", "load_splicenet"):
        from bajasplice import scan
        return getattr(scan, name)
    raise AttributeError(name)
