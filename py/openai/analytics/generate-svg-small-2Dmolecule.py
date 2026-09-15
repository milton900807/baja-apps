#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Free text (a name, a description, or a SMILES string) -> a 2D structure drawing.

Claude reads the text and returns the SMILES; the drawing is made by RDKit when it is
installed, and by Claude itself (an SVG of the skeletal structure) when it is not.
Every outcome is answered as JSON: an import or model failure used to end the process
with nothing on stdout, which the canvas reported as "Unexpected end of JSON input".
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

try:
    from claude_chat import Claude as OpenAI  # Claude replaces OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore

try:
    from rdkit import Chem
    from rdkit.Chem import AllChem
    from rdkit.Chem.Draw import rdMolDraw2D
    HAVE_RDKIT = True
except Exception:  # pragma: no cover
    Chem = AllChem = rdMolDraw2D = None  # type: ignore
    HAVE_RDKIT = False


MODEL = os.getenv("OPENAI_MODEL", "claude-haiku-4-5")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")


def _client():
    if OpenAI is None:
        raise RuntimeError("claude_chat is not available")
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return OpenAI(api_key=ANTHROPIC_API_KEY)


STRUCTURE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "input_interpretation": {"type": "string"},
        "smiles": {"type": "string"},
        "confident": {"type": "boolean"},
    },
    "required": ["title", "input_interpretation", "smiles", "confident"],
}


def interpret(text: str) -> Dict[str, Any]:
    """Name / description / SMILES -> canonical-ish SMILES, via Claude."""
    client = _client()
    r = client.responses.create(
        model=MODEL,
        instructions=(
            "You are a chemistry structure interpreter. Return only JSON matching the schema. "
            "If the input already is a SMILES string, echo it in `smiles`. Otherwise give the "
            "exact SMILES of the named small molecule. Set `confident` false and leave `smiles` "
            "empty when the structure cannot be determined with confidence; never guess."
        ),
        input=text,
        text={"format": {"type": "json_schema", "name": "molecule_structure", "schema": STRUCTURE_SCHEMA, "strict": True}},
    )
    return json.loads(r.output_text)


def draw_with_rdkit(smiles: str, width: int = 900, height: int = 600) -> Dict[str, str]:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("RDKit could not parse the SMILES: " + smiles)
    Chem.SanitizeMol(mol)
    AllChem.Compute2DCoords(mol)
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    drawer.drawOptions().addStereoAnnotation = True
    drawer.drawOptions().clearBackground = False
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()
    return {
        "svg": drawer.GetDrawingText(),
        "canonical_smiles": Chem.MolToSmiles(mol, canonical=True),
        "molfile": Chem.MolToMolBlock(mol),
        "renderer": "rdkit",
    }


def _svg_only(text: str) -> str:
    """The <svg>...</svg> element out of whatever surrounds it (fences, prose)."""
    m = re.search(r"<svg\b.*?</svg>", text or "", re.S | re.I)
    if not m:
        raise ValueError("no <svg> element in the model answer")
    return m.group(0)


def draw_with_claude(smiles: str, title: str, width: int = 900, height: int = 600) -> Dict[str, str]:
    """Skeletal drawing as SVG paths, the shape the canvas glyph importer reads."""
    client = _client()
    r = client.responses.create(
        model=MODEL,
        instructions=(
            "You draw 2D skeletal (line-angle) structures of small molecules as SVG. "
            "Output one complete <svg> element and nothing else: no markdown, no prose. "
            f"viewBox=\"0 0 {width} {height}\", width=\"{width}\" height=\"{height}\", no background. "
            "Rules: standard 120-degree bond angles, hexagonal aromatic rings, bond length about 60 units, "
            "double bonds as two parallel lines, carbons implicit, heteroatoms and charges as <text> labels "
            "(font-size 28, font-family Arial) with bonds shortened so they do not cross the label. "
            "Every bond is a <path> with d=\"M x y L x y\", stroke=\"#000\", stroke-width=\"3\", "
            "stroke-linecap=\"round\". Centre the drawing in the viewBox and use most of it."
        ),
        input="SMILES: " + smiles + ("\nName: " + title if title else ""),
    )
    return {"svg": _svg_only(r.output_text), "canonical_smiles": smiles, "molfile": "", "renderer": "claude"}


def text_to_2d(text: str) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {"ok": False, "error": "Nothing to draw: enter a molecule name or a SMILES string.", "svg": ""}
    structure = interpret(text)
    smiles = (structure.get("smiles") or "").strip()
    if not smiles or not structure.get("confident", False):
        return {
            "ok": False,
            "error": "The structure could not be determined from the text.",
            "title": structure.get("title", ""),
            "input_interpretation": structure.get("input_interpretation", ""),
            "input_smiles": smiles,
            "svg": "",
        }
    drawing = None
    if HAVE_RDKIT:
        try:
            drawing = draw_with_rdkit(smiles)
        except Exception:
            drawing = None
    if drawing is None:
        drawing = draw_with_claude(smiles, structure.get("title", ""))
    out = {
        "ok": True,
        "title": structure.get("title", ""),
        "input_interpretation": structure.get("input_interpretation", ""),
        "input_smiles": smiles,
    }
    out.update(drawing)
    return out


def _safe(text: str) -> Dict[str, Any]:
    try:
        return text_to_2d(text)
    except Exception as e:  # always answer, never die silently
        return {"ok": False, "error": str(e), "input_smiles": (text or "").strip(), "svg": ""}


def _main() -> int:
    if works is not None:
        works.resolve(_safe(str(works.param(1) or "")))
        return 0
    import sys
    print(json.dumps(_safe(sys.argv[1] if len(sys.argv) > 1 else "aspirin"), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
