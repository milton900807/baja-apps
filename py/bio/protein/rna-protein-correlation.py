"""RNA-protein coupling: how tightly a protein's level follows its mRNA, from its sequence.

Predicts the Spearman rho between mRNA and protein across tumours for the protein given,
and looks up the MEASURED rho when CPTAC quantified that protein (by identical sequence,
then by gene name). Built in ~/ml/rna-to-protein-correlation; see
rna_protein_model/README.md for accuracy and limits.

Two models, and the result says which one answered (`source`):
  full      ESM-2 language-model embeddings + sequence features (held-out r = 0.42). Needs
            torch, so it is PRECOMPUTED for every GENCODE v50 protein and looked up by
            sequence here; any annotated transcript's ORF gets it.
  features  the sequence-feature half alone (held-out r = 0.29), scored live. Used for any
            protein not in the table: an edited sequence, a variant, another species.
Runs on numpy alone: the LightGBM trees are stored as JSON and walked by
rna_protein_model/scorer.py, whose export was verified to reproduce the trained model.

Params (after the EngineMonitor at param(0)):
    param(1) : protein sequence (the track's ORF peptide)
    param(2) : gene or track name, used only to look up a measured value

Resolves { predicted_rho, interval_lo, interval_hi, percentile, call, source, drivers,
           measured, cv, n_residues, notes, error }  (drivers / measured / cv / notes are JSON strings)
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
PLAIN = {
    "length": "protein length", "log_length": "protein length", "n_tm": "membrane helices",
    "signal_like": "signal peptide", "signal_hydrophobic": "N-terminal hydrophobicity",
    "disorder_fraction": "disordered fraction", "pest_per_100": "PEST degrons",
    "ken_box_per_100": "KEN-box degrons", "d_box_per_100": "D-box degrons",
    "lys_per_100": "lysine density", "nls_per_100": "nuclear localisation motifs",
    "gravy": "hydrophobicity", "pi": "isoelectric point", "charge_per_res": "net charge",
    "min_entropy": "low-complexity stretch", "frac_low_complexity": "low-complexity fraction",
    "res2_destabilizing": "N-degron at residue 2", "met_cleaved": "initiator Met removed",
    "cterm_gly": "C-terminal Gly degron", "cterm_arg_gly": "C-terminal Arg-Gly degron",
    "cterm_hydrophobic": "hydrophobic C-terminus", "cys_pairs_per_100": "cysteine pairs",
    "frac_disorder_promoting": "disorder-promoting residues", "frac_charged": "charged residues",
    "frac_hydrophobic": "hydrophobic residues", "frac_aromatic": "aromatic residues",
}

out = {"predicted_rho": None, "interval_lo": None, "interval_hi": None, "percentile": None,
       "call": None, "source": None, "drivers": "[]", "measured": "null", "cv": "{}", "n_residues": 0,
       "notes": "[]", "error": None}
notes = []

seq = re.sub(r"[^A-Z]", "", str(works.param(1) or "").upper()).replace("*", "")
name = str(works.param(2) or "").strip()
try:
    if len(seq) < MIN_RESIDUES:
        raise ValueError("the model describes whole proteins and needs at least %d residues; "
                         "this peptide has %d" % (MIN_RESIDUES, len(seq)))
    from scorer import CouplingModel

    works.msg("Loading the RNA-protein coupling model…")
    model = CouplingModel()
    works.msg("Scoring %d residues…" % len(seq))
    p = model.predict_one(seq)
    drv = model.drivers(seq)
    for d in drv:
        k = d["feature"]
        d["label"] = PLAIN.get(k, ("%s content" % k[3:]) if k.startswith("aa_") else k)
    meas = None
    # the gene name is tried after the exact sequence; track names like "NEK1-201" or
    # "NEK1 (ENST...)" carry the symbol first
    gene = re.split(r"[\s\-_(|:]", name)[0] if name else None
    meas = model.measured(seq, gene)

    out.update(predicted_rho=round(p["predicted_rho"], 4), interval_lo=round(p["interval_80"][0], 4),
               interval_hi=round(p["interval_80"][1], 4), percentile=round(p["percentile"], 1),
               call=p["call"], source=p["source"], n_residues=len(seq))
    out["drivers"] = json.dumps([{k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()} for d in drv])
    out["measured"] = json.dumps(meas)
    out["cv"] = json.dumps(model.m["full"]["cv"] if p["source"] == "full" else model.m["cv"])
    if meas:
        notes.append("Measured in CPTAC tumours: rho %s (%s match to %s, %s)."
                     % ("%.2f" % meas["cptac"] if meas.get("cptac") is not None else "n/a",
                        meas["match"], meas["gene"], meas["uniprot"]))
    notes.append("Prediction from sequence alone by the %s (held-out r = %.2f against measured "
                 "values). Where a measured value exists, trust it over the prediction."
                 % ("full model, precomputed for this annotated protein" if p["source"] == "full"
                    else "sequence-feature model (protein not in the precomputed GENCODE set)",
                    p["cv_r"]))
    notes.append("Coupling also depends on how much the mRNA varies between samples: flat "
                 "mRNA cannot correlate with protein. The number is for a typical tumour cohort.")
    works.progress(100)
except Exception as e:
    out["error"] = str(e)

out["notes"] = json.dumps(notes)
works.resolve(out)
