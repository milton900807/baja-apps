#!/usr/bin/env python
"""Validate the model against splicing variants whose answer is already known.

SMN2 c.840C>T was the obvious test and it turned out to be unusable: SMN1 is
99.9% identical, the reads do not separate, and the PSI label in cassette.tsv is
0.84 when the truth is about 0.10. One hand-picked case was always a weak
instrument anyway, and a bad one is worse than none.

These are chosen to avoid that. Each has a measured splicing effect, sits in a
single-copy locus, and mostly has a drug or tool compound attached so the
magnitude is independently known:

  GAA   c.-32-13T>G   late-onset Pompe. Partial skipping of exon 2 with residual
                      correct splicing, which is why the phenotype is attenuated.
                      Published ASOs restore inclusion, so there is a measured
                      effect AND a validated oligo target. The closest analogue
                      to SMN2's situation.
  ELP1  c.2204+6T>C   familial dysautonomia. Tissue-specific skipping of exon 20;
                      kinetin and RECTAS act on it. The tissue specificity is the
                      interesting part, since PSINet emits 54 tissue outputs and
                      can be asked whether it reproduces the neural bias.
  LMNA  c.1824C>T     progeria. Translationally SILENT, activates a cryptic 5'
                      splice site in exon 11. Mechanistically the closest to
                      SMN2: nothing changes in the protein, everything in the
                      splicing.
  MAPT  exon 10       not one variant but an allelic series, so it asks whether
                      predicted effect size tracks measured effect size. A
                      correlation is worth more than any number of pass/fail
                      cases.

NOTHING HERE IS HARD-CODED BY COORDINATE. Every variant is looked up in the
user's own ClinVar VCF by gene symbol and HGVS, then the reference base is
checked against the genome. Published cDNA numbering is not trustworthy on its
own: the MAPK8IP3 paper that prompted this disagreed with itself between its
abstract and its methods, and MANE gives a third answer.
"""
from __future__ import annotations

import argparse
import gzip
import re

import numpy as np

# (gene, HGVS fragment to match, what it tests)
CURATED = [
    ("GAA", "c.-32-13T>G", "partial exon 2 skipping; ASO target"),
    ("ELP1", "c.2204+6T>C", "tissue-specific exon 20 skipping"),
    ("IKBKAP", "c.2204+6T>C", "ELP1 under its older symbol"),
    ("LMNA", "c.1824C>T", "silent; cryptic 5'SS in exon 11"),
]
# MAPT is handled as a series rather than named variants, because exon 10
# numbering varies by transcript and the point is the correlation, not one case.
SERIES_GENES = ["MAPT"]

_PATH = {"Pathogenic", "Likely_pathogenic", "Pathogenic/Likely_pathogenic"}


def find_in_clinvar(path, wanted, series_genes=(), max_series=40):
    """Look each variant up by gene symbol and HGVS fragment. Substitutions only."""
    want = {(g.upper(), h) for g, h, _ in wanted}
    genes = {g for g, _, _ in wanted} | set(series_genes)
    genes = {g.upper() for g in genes}
    hits, series = [], []
    with gzip.open(path, "rt") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            f = line.rstrip("\n").split("\t")
            if len(f) < 8:
                continue
            info = f[7]
            if "GENEINFO=" not in info:
                continue
            gene = info.split("GENEINFO=", 1)[1].split(";", 1)[0].split(":", 1)[0].upper()
            if gene not in genes:
                continue
            hgvs = info.split("CLNHGVS=", 1)[1].split(";", 1)[0] if "CLNHGVS=" in info else ""
            sig = info.split("CLNSIG=", 1)[1].split(";", 1)[0] if "CLNSIG=" in info else ""
            rec = ("chr" + f[0], int(f[1]), f[3], f[4], gene, hgvs, sig)
            if len(f[3]) == 1 and len(f[4]) == 1:
                for g, frag, note in wanted:
                    if gene == g.upper() and frag.replace(" ", "") in hgvs.replace(" ", ""):
                        hits.append(rec + (note,))
                if gene in {s.upper() for s in series_genes} and sig in _PATH:
                    series.append(rec)
    return hits, series[:max_series]


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=20,
                    help="per-variant breakdown size for the synonymous set")
    ap.add_argument("--limit", type=int, default=400)
    ap.add_argument("--skip-breakdown", action="store_true")
    args = ap.parse_args()

    import torch
    from bajasplice.genome import GenomeReader
    from bajasplice.scan import load_splicenet
    from bajasplice.variants import delta_score
    from bajasplice.validate.datasets import clinvar_path

    p = clinvar_path()
    if p is None or not p.exists():
        raise SystemExit("ClinVar VCF not found; set BAJASPLICE_CLINVAR")

    g = GenomeReader()
    m, ctx, dev = load_splicenet()

    def score(chrom, pos, ref, alt):
        best = None
        for st in ("+", "-"):
            d = delta_score(m, ctx, chrom, pos, ref, alt, dev, strand=st,
                            window=50, genome=g)
            if best is None or d["delta"] > best["delta"]:
                best = d
        return best

    print("looking the curated variants up in ClinVar (no hard-coded coordinates)...")
    hits, series = find_in_clinvar(str(p), CURATED, SERIES_GENES)

    print("\n%-8s %-26s %-12s %-9s %-9s %s"
          % ("gene", "hgvs", "position", "delta", "logit", "what it tests"))
    seen = set()
    for chrom, pos, ref, alt, gene, hgvs, sig, note in hits:
        if (gene, pos) in seen:
            continue
        seen.add((gene, pos))
        got = "".join("NACGT"[int(v)] for v in g.codes(chrom, pos, pos, "+"))
        ok = "" if got == ref else "  !! genome has %s, ClinVar says %s" % (got, ref)
        d = score(chrom, pos, ref, alt)
        print("%-8s %-26s %-12s %-9.4f %-9.3f %s%s"
              % (gene, hgvs.split(":")[-1][:26], "%s:%d" % (chrom, pos),
                 d["delta"], d.get("logit_delta", 0.0), note, ok))
    if not hits:
        print("  (none of the curated variants matched; ClinVar may use other HGVS)")

    if series:
        print("\n%s pathogenic series, %d variants:" % (", ".join(SERIES_GENES), len(series)))
        rows = []
        for chrom, pos, ref, alt, gene, hgvs, sig in series:
            d = score(chrom, pos, ref, alt)
            rows.append((d.get("logit_delta", 0.0), d["delta"], gene, hgvs.split(":")[-1], pos))
        rows.sort(reverse=True)
        for lg, pr, gene, hv, pos in rows[:args.top]:
            print("  %-8s %-28s %-10d delta %-8.4f logit %-8.3f" % (gene, hv[:28], pos, pr, lg))
        v = np.array([r[0] for r in rows])
        print("  median logit delta %.3f   fraction above 3.0: %.2f"
              % (float(np.median(v)), float((v > 3.0).mean())))

    if args.skip_breakdown:
        return

    # Per-variant view of the regulatory set: which genes does it catch, which
    # does it miss? An AUC says how well it separates; this says where it fails.
    from bajasplice.validate.datasets import load_clinvar
    df = load_clinvar(max_per_class=args.limit)
    sub = df[df.cls.isin(["pathogenic_synonymous"])].reset_index(drop=True)
    if "gene" not in sub.columns or sub.empty:
        print("\n(no gene column; re-pull validate/datasets.py)")
        return
    print("\nregulatory set, per variant (%d pathogenic synonymous):" % len(sub))
    sc = []
    for row in sub.itertuples(index=False):
        d = score(row.chrom, int(row.pos), row.ref, row.alt)
        sc.append((d.get("logit_delta", 0.0), d["delta"], row.gene, row.hgvs.split(":")[-1]))
    sc.sort(reverse=True)
    print("  CAUGHT (highest logit delta):")
    for lg, pr, gene, hv in sc[:args.top]:
        print("    %-10s %-30s delta %-8.4f logit %-8.3f" % (gene, hv[:30], pr, lg))
    print("  MISSED (lowest):")
    for lg, pr, gene, hv in sc[-args.top:]:
        print("    %-10s %-30s delta %-8.4f logit %-8.3f" % (gene, hv[:30], pr, lg))


if __name__ == "__main__":
    main()
