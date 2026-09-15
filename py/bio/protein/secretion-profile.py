"""Secretion probability profile along a protein sequence.

The underlying model is a whole-protein classifier: given a complete sequence it returns
the probability that the protein is secreted. It was trained on 36,681 human and mouse
proteins (Human Protein Atlas secretome for human, UniProt subcellular location for
mouse), evaluated with whole homology clusters held out at 30% identity, and reaches
0.97 AUROC on held-out human proteins.

A per-residue value therefore has to be defined rather than read off the model. The
definition used here is:

    profile[i] = P(secreted | the subsequence starting at residue i, of length `window`)

read as "if the protein began at this residue, would it look secreted?". That is a
question the model was trained to answer, and it makes the curve interpretable: it peaks
over signal peptides and signal anchors, the segments that drive a protein into the
secretory pathway. Validated on 480 annotated human proteins, the peak falls in the
first 30 residues for 90% of proteins carrying a signal peptide and for 12% of those
without.

Two honest limits to show the user:
  * the curve does NOT separate secreted from ER- or membrane-retained proteins. Both
    carry the same N-terminal signal, and mean scores over the first 20 residues are
    0.52 and 0.55 respectively.
  * proteins exported without a signal peptide (Hsp70, ALIX, gasdermin-D, NLRP3) are
    invisible to it, and score near zero.

Runs on numpy alone. The gradient-boosted ensemble is stored as JSON and evaluated by
secretion_model/scorer.py, so no LightGBM, joblib or scikit-learn is needed on the
server; the export was verified to reproduce the trained model exactly.

Params (after the EngineMonitor at param(0)):
    param(1) : sequence. Protein, or DNA/RNA which is translated (see param(6))
    param(2) : xi — the track-local x of the first residue/base (positions are xi + i)
    param(3) : window length in residues (default 70)
    param(4) : step in residues between windows (default 3)
    param(5) : polynomial degree for the smooth overlay (default 8, 0 disables)
    param(6) : reading frame 1|2|3 for nucleotide input (default 1)
    param(7) : model, 'light_hm' (human+mouse, default) or 'light' (human only)

Resolves { profile, poly, poly_coeffs, p_whole, peak, thresholds, seq_type, n_residues,
           units_per_residue, xi, window, step, model, notes, error }
where profile and poly are JSON arrays of [position, score]; position is in track
coordinates, and units_per_residue is 3 when the input was translated so the client can
draw over a nucleotide track without rescaling.
"""
import json
import os
import sys

from ion import works

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

CODONS = {
    "TTT": "F", "TTC": "F", "TTA": "L", "TTG": "L", "CTT": "L", "CTC": "L", "CTA": "L",
    "CTG": "L", "ATT": "I", "ATC": "I", "ATA": "I", "ATG": "M", "GTT": "V", "GTC": "V",
    "GTA": "V", "GTG": "V", "TCT": "S", "TCC": "S", "TCA": "S", "TCG": "S", "CCT": "P",
    "CCC": "P", "CCA": "P", "CCG": "P", "ACT": "T", "ACC": "T", "ACA": "T", "ACG": "T",
    "GCT": "A", "GCC": "A", "GCA": "A", "GCG": "A", "TAT": "Y", "TAC": "Y", "TAA": "*",
    "TAG": "*", "CAT": "H", "CAC": "H", "CAA": "Q", "CAG": "Q", "AAT": "N", "AAC": "N",
    "AAA": "K", "AAG": "K", "GAT": "D", "GAC": "D", "GAA": "E", "GAG": "E", "TGT": "C",
    "TGC": "C", "TGA": "*", "TGG": "W", "CGT": "R", "CGC": "R", "CGA": "R", "CGG": "R",
    "AGT": "S", "AGC": "S", "AGA": "R", "AGG": "R", "GGT": "G", "GGC": "G", "GGA": "G",
    "GGG": "G",
}


def looks_nucleotide(s):
    """DNA/RNA if almost every character is a base. Protein sequences fail this: even a
    cysteine- and glycine-rich protein carries residues with no base letter."""
    if len(s) < 60:
        return False
    bases = sum(1 for c in s if c in "ACGTUN")
    return bases >= 0.9 * len(s)


def translate(s, frame):
    s = s.replace("U", "T")[max(0, int(frame) - 1):]
    out = []
    for i in range(0, len(s) - 2, 3):
        aa = CODONS.get(s[i:i + 3], "X")
        if aa == "*":
            break                      # stop codon ends the open reading frame
        out.append(aa)
    return "".join(out)


out = {
    "profile": "[]", "poly": "[]", "poly_coeffs": "[]", "p_whole": None, "peak": "{}",
    "thresholds": "{}", "seq_type": None, "n_residues": 0, "units_per_residue": 1,
    "xi": 0, "window": 0, "step": 0, "model": None, "notes": "[]", "error": None,
}

raw = str(works.param(1) or "")
seq = "".join(c for c in raw.upper() if c.isalpha())
try:
    xi = int(float(works.param(2) or 0))
except Exception:
    xi = 0
try:
    window = max(30, int(float(works.param(3) or 70)))
except Exception:
    window = 70
try:
    step = max(1, int(float(works.param(4) or 3)))
except Exception:
    step = 3
try:
    poly_degree = max(0, int(float(works.param(5) or 8)))
except Exception:
    poly_degree = 8
try:
    frame = min(3, max(1, int(float(works.param(6) or 1))))
except Exception:
    frame = 1
model_name = str(works.param(7) or "light_hm").strip() or "light_hm"
if model_name not in ("light_hm", "light"):
    model_name = "light_hm"

out["xi"] = xi
out["model"] = model_name
notes = []

if not seq:
    out["error"] = "no sequence provided"
else:
    try:
        works.msg("Preparing the sequence…")
        units = 1
        if looks_nucleotide(seq):
            nt = seq
            seq = translate(nt, frame)
            units = 3
            out["seq_type"] = "nucleotide"
            notes.append("Input read as DNA/RNA and translated in frame %d: %d bases "
                         "to %d residues. Positions are in bases." % (frame, len(nt), len(seq)))
        else:
            out["seq_type"] = "protein"

        if len(seq) < 30:
            raise ValueError("the model needs at least 30 residues; this sequence has %d"
                             % len(seq))

        from secretion_model.scorer import SecretionModel, profile as build_profile

        model_path = os.path.join(_HERE, "secretion_model",
                                  "secretion_%s.json.gz" % model_name)
        if not os.path.exists(model_path):
            raise RuntimeError("the secretion model is not on this server (%s)" % model_path)

        works.msg("Loading the secretion model…")
        model = SecretionModel(model_path)

        works.msg("Scoring %d residues…" % len(seq))
        w = min(window, len(seq))
        res = build_profile(model, seq, window=w, step=step, poly_degree=poly_degree)

        prof = [[int(xi + units * (p - 1)), s]
                for p, s in zip(res["positions"], res["profile"])]
        poly = [[int(xi + units * (p - 1)), s]
                for p, s in zip(res["positions"], res["poly_fit"])] if poly_degree else []

        out["profile"] = json.dumps(prof)
        out["poly"] = json.dumps(poly)
        out["poly_coeffs"] = json.dumps(res["poly_coeffs"])
        out["p_whole"] = res["p_whole_sequence"]
        out["peak"] = json.dumps({
            "position": int(xi + units * (res["peak_position"] - 1)),
            "residue": res["peak_position"],
            "value": res["peak_value"],
        })
        out["thresholds"] = json.dumps(res["thresholds"])
        out["n_residues"] = len(seq)
        out["units_per_residue"] = units
        out["window"] = w
        out["step"] = step

        th = res["thresholds"].get("precision90")
        if th is not None and res["p_whole_sequence"] >= th:
            notes.append("Whole sequence scores %.3f, above the %.2f threshold whose "
                         "held-out precision was 90%%." % (res["p_whole_sequence"], th))
        else:
            notes.append("Whole sequence scores %.3f." % res["p_whole_sequence"])
        if res["peak_position"] <= 30 and res["peak_value"] >= 0.5:
            notes.append("The peak is at residue %d, where a signal peptide sits. In "
                         "training, 90%% of signal-peptide proteins peak in the first 30 "
                         "residues against 12%% of proteins without one."
                         % res["peak_position"])
        notes.append("The curve shows secretory-signal strength, not the final "
                     "destination: ER- and membrane-retained proteins carry the same "
                     "N-terminal signal and score just as high. Proteins exported "
                     "without a signal peptide score near zero.")
        works.progress(100)
    except Exception as e:
        out["error"] = str(e)

out["notes"] = json.dumps(notes)
works.resolve(out)
