"""mRNA -> protein transfer: how much, and how reliably, a protein follows its mRNA.

Two numbers per protein, predicted from sequence (protein and mRNA):
  transfer  how MUCH protein changes when its mRNA changes: the log-log slope of protein on
            mRNA across samples, normalized so the typical gene = 1.0 (below 1 buffered,
            above 1 responsive). Mass-spec methods compress protein ratios differently, so
            each study's slopes are divided by its median gene before combining.
  rho       how RELIABLY protein follows mRNA (Spearman across samples).

Labels: consensus over 7 paired mRNA/protein studies (CPTAC 10 cancers, CCLE, Sanger,
TCGA breast / ovarian / colorectal, NCI-60), weighted by samples x each study's agreement
with the rest. Model: ESM-2 embeddings + protein features + mRNA features (UTRs, codon
usage, uORFs, AU-rich / Pumilio elements), cross-validated with homology clusters held out.
It needs torch, so it is PRECOMPUTED for every GENCODE v50 protein and looked up here
(source "full"); any other protein is scored live by protein-feature trees (source
"fallback"), and the result says which. Built in ~/ml/rna-to-protein-correlation.

Also returns the gene's MEASURED transfer and rho (multi-study consensus and each study's
value) and its mRNA half-life.

Params (after the EngineMonitor at param(0)):
    param(1) : protein sequence (the track's ORF peptide)
    param(2) : gene or track name, used only when the protein is not an annotated one

Resolves { transfer, rho, source, measured, halflife, n_residues, notes, error }
(transfer / rho / measured / halflife / notes are JSON strings)
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

MIN_RESIDUES = 30


def ordinal(p):
    n = int(round(p))
    if n < 1:
        return "bottom 1%"
    if n > 99:
        return "top 1%"
    suf = "th" if 11 <= n % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return "%d%s percentile" % (n, suf)


out = {"transfer": "null", "rho": "null", "source": None, "measured": "null", "halflife": "null",
       "n_residues": 0, "notes": "[]", "error": None}
notes = []

seq = re.sub(r"[^A-Z]", "", str(works.param(1) or "").upper()).replace("*", "")
name = str(works.param(2) or "").strip()
try:
    if len(seq) < MIN_RESIDUES:
        raise ValueError("the model describes whole proteins and needs at least %d residues; "
                         "this peptide has %d" % (MIN_RESIDUES, len(seq)))
    from scorer import TransferModel

    works.msg("Loading the mRNA-protein transfer model…")
    model = TransferModel()
    works.msg("Scoring %d residues…" % len(seq))
    p = model.predict_one(seq)
    gene = re.split(r"[\s\-_(|:]", name)[0] if name else None
    meas = model.measured(seq, gene)
    hl_gene = model.gencode_gene(seq) or (meas and meas.get("gene")) or gene
    half = model.halflife(hl_gene)
    for t in ("transfer", "rho"):
        out[t] = json.dumps({k: (round(v, 4) if isinstance(v, float) else
                                 [round(x, 4) for x in v] if isinstance(v, list) else v) for k, v in p[t].items()})
    out.update(source=p["source"], n_residues=len(seq), measured=json.dumps(meas), halflife=json.dumps(half))

    tr, rh = p["transfer"], p["rho"]
    notes.append("Transfer %.2f (typical gene = 1.0; %s): when this gene's mRNA changes, its protein changes %s "
                 "the typical protein does. Reliability rho %.2f (%s)."
                 % (tr["value"], ordinal(tr["percentile"]),
                    "less than" if tr["call"] == "buffered" else "more than" if tr["call"] == "responsive" else "about as much as",
                    rh["value"], ordinal(rh["percentile"])))
    notes.append("Predicted from sequence by the %s (held-out Spearman %.2f transfer, %.2f rho)."
                 % ("full model, precomputed for this annotated protein" if p["source"] == "full"
                    else "protein-feature fallback (this exact protein is not an annotated GENCODE protein)",
                    tr["cv_spearman"], rh["cv_spearman"]))
    if meas:
        notes.append("Measured in %d stud%s: transfer %s, rho %s (%s)."
                     % (meas["n_studies"], "y" if meas["n_studies"] == 1 else "ies",
                        "%.2f" % meas["transfer"] if meas.get("transfer") is not None else "n/a",
                        "%.2f" % meas["rho"] if meas.get("rho") is not None else "n/a",
                        ", ".join("%s %.2f" % (s, v[0]) for s, v in meas["studies"].items() if v[0] is not None)))
    if half:
        notes.append("mRNA half-life of %s: %s%s; genes this stable carry %.2fx the median protein per mRNA."
                     % (half["gene"], ordinal(half["percentile"]),
                        (", %.1f h in HeLa" % half["hela_hours"]) if half.get("hela_hours") is not None else "",
                        half["typical_protein_per_mrna_fold"]))
    notes.append("Transfer also depends on the samples: flat mRNA cannot move protein, and cell lines can differ "
                 "from tumours. Where a measured value exists, trust it over the prediction.")
    works.progress(100)
except Exception as e:
    out["error"] = str(e)

out["notes"] = json.dumps(notes)
works.resolve(out)
