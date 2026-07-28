#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.Draw import rdMolDraw2D


def smiles_to_svg(smiles: str, width: int = 900, height: int = 600) -> dict:
    smiles = (smiles or "").strip()
    if not smiles:
        raise ValueError("Empty SMILES string")

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES string: {smiles}")

    Chem.SanitizeMol(mol)
    AllChem.Compute2DCoords(mol)

    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    drawer.drawOptions().addStereoAnnotation = True
    drawer.drawOptions().clearBackground = False
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()

    svg = drawer.GetDrawingText()

    return {
        "ok": True,
        "input_smiles": smiles,
        "canonical_smiles": Chem.MolToSmiles(mol, canonical=True),
        "svg": svg,
    }


def _main() -> int:
    if works is not None:
        smiles = str(works.param(1) or "")
        try:
            works.resolve(smiles_to_svg(smiles))
        except Exception as e:
            works.resolve({
                "ok": False,
                "error": str(e),
                "input_smiles": smiles,
                "svg": "",
            })
        return 0

    import sys
    smiles = sys.argv[1] if len(sys.argv) > 1 else "CC(=O)Oc1ccccc1C(=O)O"
    print(json.dumps(smiles_to_svg(smiles), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())