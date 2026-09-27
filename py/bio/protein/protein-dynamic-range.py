"""Protein dynamic range: how widely this protein varies between samples, predicted from mRNA,
in a chosen tissue.

Looks the gene up in two precomputed atlases, built with ~/ml/rna-to-protein-correlation's
protein-dynamic-range tool:
  tumour     CPTAC mRNA from 1,022 tumours in 10 cancer types
  cell_line  DepMap mRNA from 1,684 cancer cell lines
For each: the predicted protein SD (log2, DIA scale), the 5-95% spread as a fold change,
and the rank among all genes (100 = most variable). Where one of 7 paired studies measured
the protein, its MEASURED variability rank is returned too.

The prediction learned protein range from mRNA range across 7 paired mRNA/protein studies.
Held out one study at a time it ranks protein variability at Spearman 0.84 (CPTAC), 0.79
(CCLE), 0.63 (Sanger), better than mRNA range alone in every study. Rankings are robust;
absolute folds depend on the mass-spec method.

TISSUE-SPECIFIC: the same model run on each tissue's samples alone, for 78 tissues:
  tumour     10 CPTAC cancer types. Validated per cancer type with CPTAC held out of
             training: Spearman 0.62-0.79, beating mRNA range alone in all 10
  cell_line  19 DepMap lineages (>= 30 lines each)
  normal     49 GTEx v8 healthy tissues. NOT validated: no matched normal proteomics, and
             the model never saw normal tissue - the result says so
For the chosen tissue: the fold spread and rank; for any tissue list: where it varies most.

The gene is taken from the GENCODE protein with this exact sequence, else the track name.

Params (after the EngineMonitor at param(0)):
    param(1) : protein sequence (the track's ORF peptide; may be empty)
    param(2) : gene or track name
    param(3) : tissue key (e.g. "normal:Liver", "tumour:brca", "cell_line:Lung"); empty = none

Resolves { range, tissue, gene, matched_by, notes, error }   (range / tissue / notes are JSON)
"""
import json
import os
import re
import sys

from ion import works

_HERE = os.path.dirname(os.path.abspath(__file__))
_MODEL_DIR = os.path.join(_HERE, "rna_protein_model")
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


out = {"range": "null", "tissue": "null", "gene": None, "matched_by": None, "notes": "[]", "error": None}
notes = []
seq = re.sub(r"[^A-Z]", "", str(works.param(1) or "").upper()).replace("*", "")
name = str(works.param(2) or "").strip()
tissue_key = str(works.param(3) or "").strip() or None
try:
    from scorer import TransferModel

    works.msg("Looking up the protein dynamic range atlas…")
    model = TransferModel()
    gene, how = (model.gencode_gene(seq), "annotated protein (GENCODE)") if len(seq) >= 30 else (None, None)
    if not gene and name:
        gene, how = re.split(r"[\s\-_(|:]", name)[0].upper(), "track name"
    rng = model.dynamic_range(gene) if gene else None
    if not rng:
        raise ValueError("no dynamic range for %s: %s" % (
            gene or "this track", "the gene is not in the atlases" if gene else
            "the protein is not an annotated GENCODE protein and the track name is not a gene symbol"))
    out.update(range=json.dumps(rng), gene=gene, matched_by=how)
    tr = model.tissue_range(gene, tissue_key)
    out["tissue"] = json.dumps(tr)
    if tr and tr.get("tissue"):
        t = tr["tissue"]
        if t["rank_pct"] is None or t.get("low_expression"):
            notes.append("%s: the mRNA is barely expressed there, so there is no meaningful protein "
                         "range to predict." % t["label"])
        else:
            notes.append("In %s (%d samples): predicted protein spread %.1fx (5-95%%), %s of all proteins%s."
                         % (t["label"], t["samples"], t["fold_5_95"], ordinal(t["rank_pct"]),
                            "" if t["kind"] != "normal" else " - healthy tissue, not validated"))
    if tr:
        notes.append("Varies most in: " + "; ".join("%s %.1fx" % (c["label"], c["fold_5_95"])
                                                    for c in tr["most_variable_in"]) + ".")
    for c, label in (("tumour", "tumours"), ("cell_line", "cell lines")):
        x = rng.get(c)
        if x:
            notes.append("In %s, predicted protein spread %.1fx (5-95%%), %s of all proteins%s."
                         % (label, x["protein_fold_5_95"], ordinal(x["protein_range_pct"]),
                            "; mRNA barely expressed there, so treat with care" if x["low_mrna_expression"] else ""))
    if rng["measured_rank"]:
        notes.append("Measured variability rank: " + ", ".join(
            "%s %s" % (s, ordinal(v)) for s, v in rng["measured_rank"].items()) + ".")
    notes.append("Folds are on a DIA mass-spec scale; rankings do not depend on the method.")
    works.progress(100)
except Exception as e:
    out["error"] = str(e)
out["notes"] = json.dumps(notes)
works.resolve(out)
