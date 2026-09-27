"""Tissues available to the protein dynamic range layer, for the editor's tissue picker.

Resolves { tissues }: JSON list of {key, label, kind (tumour / cell_line / normal), samples, validated}
"""
import json
import os
import sys

from ion import works

_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rna_protein_model")
if _MODEL_DIR not in sys.path:
    sys.path.insert(0, _MODEL_DIR)

out = {"tissues": "[]", "error": None}
try:
    from scorer import TransferModel
    out["tissues"] = json.dumps(TransferModel().tissues())
except Exception as e:
    out["error"] = str(e)
works.resolve(out)
