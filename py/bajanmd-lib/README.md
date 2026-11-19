# BajaNMD

What happens to a transcript when a cassette exon goes in or out, and the
steric-block ASOs that switch it.

    from bajanmd import gene_exons
    from bajanmd.design import design
    from bajanmd.offtarget import screen

    rows = gene_exons("SCN1A")                     # every exon + NMD class
    d = design("chr2", 166007230, 166007293, "-")  # oligos to skip one
    screen(d["candidates"], gene="SCN1A")          # pre-mRNA specificity

`NMD_in` is a poison exon: including it causes decay, so skipping it RAISES
protein (the TANGO-class strategy, as in STK-001 on SCN1A exon 20N).
`NMD_ex` is an essential exon: skipping it breaks frame and causes decay, so
skipping it LOWERS protein. Same kind of oligo, opposite consequence, and the
NMD call is what distinguishes them.

Entry points for the app are `py/bio/nmd/bajanmd-exons.py` and
`py/bio/nmd/bajanmd-aso.py`.
