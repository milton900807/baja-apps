#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
from typing import Any, Dict

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore

from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.Draw import rdMolDraw2D


OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def build_structure_schema() -> Dict[str, Any]:
    return {
        "name": "molecule_structure_request",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "molecule_type": {
                    "type": "string",
                    "enum": ["small_molecule", "oligonucleotide", "peptide", "unknown"]
                },
                "input_interpretation": {"type": "string"},
                "molecular_string": {"type": "string"},
                "string_format": {
                    "type": "string",
                    "enum": ["smiles", "molblock", "unknown"]
                }
            },
            "required": [
                "title",
                "molecule_type",
                "input_interpretation",
                "molecular_string",
                "string_format"
            ]
        }
    }


def infer_molecular_string(prompt: str) -> Dict[str, Any]:
    if OpenAI is None:
        raise RuntimeError("openai package is not installed")
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI(api_key=OPENAI_API_KEY)
    schema = build_structure_schema()

    instructions = """
You are a chemistry structure interpreter.

Return only valid JSON matching the schema.

Rules:
- Prefer exact SMILES for small molecules when possible.
- Use molblock only if that is substantially more appropriate.
- If you cannot determine the structure confidently, set string_format to "unknown".
- Do not invent a precise structure when the prompt is ambiguous.
"""

    response = client.responses.create(
        model=OPENAI_MODEL,
        instructions=instructions,
        input=prompt,
        text={
            "format": {
                "type": "json_schema",
                "name": schema["name"],
                "schema": schema["schema"],
                "strict": True,
            }
        },
    )

    return json.loads(response.output_text)


def molecular_string_to_rdkit_mol(molecular_string: str, string_format: str) -> Chem.Mol:
    molecular_string = (molecular_string or "").strip()
    string_format = (string_format or "").strip().lower()

    if not molecular_string:
        raise ValueError("Empty molecular string")

    mol = None

    if string_format == "smiles":
        mol = Chem.MolFromSmiles(molecular_string)
    elif string_format == "molblock":
        mol = Chem.MolFromMolBlock(molecular_string, sanitize=True, removeHs=True)
    else:
        mol = Chem.MolFromSmiles(molecular_string)
        if mol is None:
            mol = Chem.MolFromMolBlock(molecular_string, sanitize=True, removeHs=True)

    if mol is None:
        raise ValueError("RDKit could not parse the molecular string")

    Chem.SanitizeMol(mol)

    # Force 2D coordinates so MolToMolBlock returns a 2D molfile layout.
    AllChem.Compute2DCoords(mol)

    return mol


def rdkit_mol_to_svg(mol: Chem.Mol, width: int = 900, height: int = 600) -> str:
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    drawer.drawOptions().addStereoAnnotation = True
    drawer.drawOptions().clearBackground = False
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def rdkit_mol_to_molblock(mol: Chem.Mol, force_v3000: bool = False) -> str:
    """
    Returns a molfile string.
    With 2D coords already computed above, this will be a 2D mol block.
    """
    return Chem.MolToMolBlock(mol, forceV3000=force_v3000)


def prompt_to_structure_output(prompt: str) -> Dict[str, Any]:
    structure = infer_molecular_string(prompt)

    molecular_string = structure.get("molecular_string", "")
    string_format = structure.get("string_format", "unknown")

    if string_format == "unknown":
        return {
            "ok": False,
            "error": "AI could not determine a precise molecular string.",
            "title": structure.get("title", ""),
            "input_interpretation": structure.get("input_interpretation", ""),
            "molecular_string": molecular_string,
            "string_format": string_format,
            "canonical_smiles": "",
            "molfile": "",
            "svg": "",
        }

    mol = molecular_string_to_rdkit_mol(molecular_string, string_format)

    svg = rdkit_mol_to_svg(mol)
    molfile = rdkit_mol_to_molblock(mol)

    return {
        "ok": True,
        "title": structure.get("title", ""),
        "molecule_type": structure.get("molecule_type", ""),
        "input_interpretation": structure.get("input_interpretation", ""),
        "molecular_string": molecular_string,
        "string_format": string_format,
        "canonical_smiles": Chem.MolToSmiles(mol, canonical=True),
        "molfile": molfile,
        "svg": svg,
    }


def _main() -> int:
    if works is not None:
        prompt = str(works.param(1) or "")
        works.resolve(prompt_to_structure_output(prompt))
        return 0

    import sys
    prompt = sys.argv[1] if len(sys.argv) > 1 else "aspirin"
    print(json.dumps(prompt_to_structure_output(prompt), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())