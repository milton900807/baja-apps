"""List the high-performing (reliable) RNA-binding proteins with their confidence.

Reads the reliable-RBP table bundled with bajaclip-lib (held-out AUROC >= 0.90)
and returns the RBP names with their AUROC, sorted best-first, for the picker in
baja/bio/rbp/rbp-profile.js. Plain TSV read — no torch, no model load.

Resolves { rbps, error } where rbps is a JSON array of { name, auroc }.
"""
import os
import csv
import json

from ion import works


# Short functional annotation per RBP (gene symbol -> one-line role).
NOTES = {
    "FKBP4": "HSP90 co-chaperone (immunophilin); steroid-receptor signaling",
    "ELAC2": "tRNA 3' endonuclease (RNase Z); mitochondrial RNA processing",
    "NKRF": "NF-kB repressing factor; rRNA processing",
    "TARDBP": "TDP-43; UG-rich splicing repressor; ALS/FTD",
    "XRN2": "5'->3' exoribonuclease; transcription termination, rRNA processing",
    "PRPF4": "pre-mRNA splicing factor; U4/U6 snRNP",
    "GEMIN5": "SMN complex; snRNP assembly and translation control",
    "DDX3X": "DEAD-box RNA helicase; translation, stress granules",
    "AKAP8L": "nuclear-envelope protein; mRNA export",
    "EWSR1": "FET family; transcription/splicing; Ewing-sarcoma fusion",
    "TRA2A": "SR-like splicing factor; exonic splicing enhancers",
    "DDX1": "DEAD-box helicase; tRNA splicing, R-loop resolution",
    "NONO": "paraspeckle protein (DBHS); splicing, DNA repair",
    "PPIG": "peptidyl-prolyl isomerase (cyclophilin); spliceosome-associated",
    "RPS6": "40S ribosomal protein; translation",
    "FTO": "m6A/m6Am RNA demethylase; metabolic regulation",
    "EIF4G2": "translation-initiation scaffold (DAP5); IRES-driven translation",
    "GTF2F1": "general transcription factor TFIIF; RNA Pol II",
    "SRSF1": "prototypical SR splicing factor; alternative splicing, export",
    "METAP2": "methionine aminopeptidase 2; N-terminal processing",
    "SLTM": "SAFB-like transcription modulator; splicing/transcription",
    "FMR1": "FMRP; translational repressor; Fragile X syndrome",
    "PHF6": "PHD-finger protein; transcription/rRNA; leukemia",
    "RPS3": "40S ribosomal protein; also base-excision DNA repair",
    "PABPN1": "nuclear poly(A)-binding protein; polyadenylation; OPMD",
    "DDX43": "DEAD-box helicase; cancer-testis antigen",
    "HNRNPM": "hnRNP; alternative-splicing regulator",
    "NIP7": "60S ribosome-biogenesis factor",
    "PCBP1": "poly(C)-binding protein; mRNA stability and translation",
    "EIF4E": "cap-binding translation-initiation factor",
    "MORC2": "ATPase chromatin remodeler; gene silencing",
    "DDX24": "DEAD-box helicase; ribosome biogenesis",
    "DROSHA": "RNase III; primary-miRNA processing",
    "RBM15": "m6A writer complex; splicing/export; megakaryopoiesis",
    "DDX51": "DEAD-box helicase; 60S rRNA maturation",
    "PUM1": "Pumilio; 3'UTR translational repression",
    "U2AF1": "U2 snRNP auxiliary factor; 3' splice-site recognition",
    "UCHL5": "deubiquitinase (proteasome/INO80); RNA-associated",
    "CSTF2T": "cleavage-stimulation factor (tauCstF-64); mRNA 3'-end processing",
    "DDX52": "DEAD-box helicase; ribosome biogenesis",
    "SDAD1": "nucleolar factor; 60S ribosome export",
    "ZNF622": "zinc-finger protein; 60S ribosome assembly",
    "SF3A3": "SF3a splicing factor; U2 snRNP, branch-point selection",
    "FXR2": "FMR1 autosomal homolog; translational regulation",
    "EIF3H": "eIF3 subunit h; translation initiation",
    "FUS": "FET family; transcription/splicing/DNA repair; ALS/FTD",
    "KHDRBS1": "Sam68; KH-domain; signal-dependent splicing",
    "APEX1": "AP endonuclease (base-excision repair); RNA quality control",
}


# WHERE THE TABLE IS, wherever this tree happens to be deployed.
#
# This was a single hard-coded "~/baja-apps/...", which is only true on a machine where the
# repo sits in the home directory. In production the tree is /opt/baja-apps and the service
# runs as a user whose home is somewhere else entirely, so the table was never found: the
# list came back EMPTY, and the picker in rbp-profile.js reads an empty list as "no list
# available" and silently defaults to TARDBP. Every run was TARDBP and no choice was ever
# offered.
#
# So it is derived from THIS FILE'S own location first -- py/bio/rbp/list-rbps.py, hence two
# levels up to py/ -- which is correct by construction however the tree is installed. The
# rest are fallbacks, and the environment variable still wins.
_HERE = os.path.dirname(os.path.abspath(__file__))
_CANDIDATES = [
    os.environ.get("BAJACLIP_RELIABLE"),
    os.path.join(_HERE, "..", "..", "bajaclip-lib", "bajaclip", "weights", "reliable_rbps.tsv"),
    "/opt/baja-apps/py/bajaclip-lib/bajaclip/weights/reliable_rbps.tsv",
    os.path.expanduser("~/baja-apps/py/bajaclip-lib/bajaclip/weights/reliable_rbps.tsv"),
]
path = ""
for _c in _CANDIDATES:
    if _c and os.path.exists(_c):
        path = os.path.abspath(_c)
        break
if not path:
    path = os.path.abspath(os.path.join(_HERE, "..", "..", "bajaclip-lib",
                                        "bajaclip", "weights", "reliable_rbps.tsv"))

rows = []
err = None
try:
    with open(path) as f:
        for r in csv.DictReader(f, delimiter="\t"):
            name = (r.get("RBP") or "").strip()
            if not name:
                continue
            try:
                auroc = round(float(r.get("AUROC") or 0), 3)
            except Exception:
                auroc = 0.0
            rows.append({"name": name, "auroc": auroc,
                         "note": NOTES.get(name.upper(), "RNA-binding protein")})
    rows.sort(key=lambda d: -d["auroc"])
except Exception as e:
    err = str(e)

works.resolve({
    "rbps": json.dumps(rows),
    "count": len(rows),
    "error": err,
})
