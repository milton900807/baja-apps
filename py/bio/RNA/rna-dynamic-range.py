"""RNA dynamic range: how widely this gene's mRNA varies between samples of a tissue.

MEASURED, not predicted: the 5th-95th percentile spread of log2 expression across the
tissue's own samples, from 78 tissues (10 CPTAC tumour types, 19 DepMap cell-line lineages,
49 GTEx healthy tissues). Coding and non-coding genes (lncRNAs such as XIST, MALAT1,
HOTAIR are included where GTEx / CPTAC measure them). A gene in the bottom 30% of mean
expression in a tissue is reported as barely expressed there - its spread is noise.

Also returns the protein's PREDICTED range rank in the same tissue (the protein dynamic
range atlas), so a track can show whether the protein follows its mRNA's range or is
buffered.

The gene is taken from the GENCODE protein with this exact sequence (coding tracks), else
the track name (non-coding tracks and anything unannotated).

Params (after the EngineMonitor at param(0)):
    param(1) : protein sequence from the track's ORF (may be empty for non-coding RNA)
    param(2) : gene or track name
    param(3) : tissue key (e.g. "normal:Liver", "tumour:brca", "cell_line:Lung")

Resolves { rna, protein, gene, matched_by, notes, error }   (rna / protein / notes are JSON)
"""
import json
import os
import re
import sys

from ion import works

_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "protein", "rna_protein_model")
if _MODEL_DIR not in sys.path:
    sys.path.insert(0, _MODEL_DIR)


def ordinal(p):
    n = int(round(p))
    if n < 1:
        return "bottom 1%"
    if n > 99:
        return "top 1%"
    suf = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return "%d%s percentile" % (n, suf)


def fold(x):
    return ("%.0fx" % x) if x >= 100 else ("%.1fx" % x)


out = {"rna": "null", "protein": "null", "gene": None, "matched_by": None, "notes": "[]", "error": None}
notes = []
seq = re.sub(r"[^A-Z]", "", str(works.param(1) or "").upper()).replace("*", "")
name = str(works.param(2) or "").strip()
tissue_key = str(works.param(3) or "").strip() or None
try:
    from scorer import TransferModel

    works.msg("Looking up the mRNA dynamic range atlas…")
    model = TransferModel()
    gene, how = (model.gencode_gene(seq), "annotated protein (GENCODE)") if len(seq) >= 30 else (None, None)
    if not gene and name:
        gene, how = re.split(r"[\s_(|:]", name)[0].upper(), "track name"
        # "NEK1-201" is a transcript name; "HLA-A" is a gene: try the full token, then the stem
        if model.rna_tissue_range(gene) is None and "-" in gene:
            gene = gene.rsplit("-", 1)[0]
    rna = model.rna_tissue_range(gene, tissue_key) if gene else None
    if not rna:
        raise ValueError("no mRNA range for %s: %s" % (
            gene or "this track", "the gene is not expressed in any atlas tissue" if gene else
            "the protein is not an annotated GENCODE protein and the track name is not a gene symbol"))
    prot = model.tissue_range(gene, tissue_key)
    out.update(rna=json.dumps(rna), protein=json.dumps(prot), gene=gene, matched_by=how)
    t = rna.get("tissue")
    if t:
        if t["rank_pct"] is None or t["low_expression"]:
            notes.append("%s: the mRNA is barely expressed there, so its spread is noise." % t["label"])
        else:
            notes.append("In %s (%d samples): measured mRNA spread %s (5-95%%), %s of all genes; expression "
                         "level %s." % (t["label"], t["samples"], fold(t["fold_5_95"]), ordinal(t["rank_pct"]),
                                        ordinal(t["level_pct"])))
    notes.append("mRNA varies most in: " + "; ".join("%s %s" % (c["label"], fold(c["fold_5_95"]))
                                                   for c in rna["widest_in"]) + ".")
    pt = prot and prot.get("tissue")
    if pt and pt.get("rank_pct") is not None and not pt.get("low_expression"):
        notes.append("Predicted protein range there: %.1fx, %s (DIA scale; mass spec compresses protein "
                     "ratios, so compare ranks, not folds)." % (pt["fold_5_95"], ordinal(pt["rank_pct"])))
    works.progress(100)
except Exception as e:
    out["error"] = str(e)
out["notes"] = json.dumps(notes)
works.resolve(out)
