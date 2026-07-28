#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

try:
    from ion import works  # type: ignore
except Exception:  # pragma: no cover
    works = None

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


SVG_NS = "http://www.w3.org/2000/svg"
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

RNA_COMPLEMENT: Dict[str, str] = {
    "A": "U",
    "U": "A",
    "G": "C",
    "C": "G",
    "T": "A",
}

DNA_COMPLEMENT: Dict[str, str] = {
    "A": "T",
    "T": "A",
    "G": "C",
    "C": "G",
    "U": "A",
}

ALLOWED_SUGARS = {"RNA", "DNA", "2'-OMe", "2'-F", "LNA", "MOE", "GNA", "cEt"}
ALLOWED_BACKBONES = {"PO", "PS", "PS2"}

MONOMER_COLORS: Dict[str, Dict[str, str]] = {
    "RNA": {
        "fill": "#E8F4FD",
        "stroke": "#1D4ED8",
        "text": "#0F172A",
    },
    "DNA": {
        "fill": "#F3F4F6",
        "stroke": "#4B5563",
        "text": "#111827",
    },
    "2'-OMe": {
        "fill": "#ECFDF3",
        "stroke": "#16A34A",
        "text": "#052E16",
    },
    "2'-F": {
        "fill": "#FEF3C7",
        "stroke": "#D97706",
        "text": "#451A03",
    },
    "LNA": {
        "fill": "#FCE7F3",
        "stroke": "#BE185D",
        "text": "#500724",
    },
    "MOE": {
        "fill": "#F3E8FF",
        "stroke": "#7C3AED",
        "text": "#2E1065",
    },
    "GNA": {
        "fill": "#E0F2FE",
        "stroke": "#0891B2",
        "text": "#083344",
    },
    "cEt": {
        "fill": "#FFF1F2",
        "stroke": "#E11D48",
        "text": "#4C0519",
    },
    "default": {
        "fill": "#F7F7F7",
        "stroke": "#222222",
        "text": "#111111",
    },
}

BASE_COLORS: Dict[str, str] = {
    "A": "#2563EB",
    "U": "#DC2626",
    "T": "#DC2626",
    "G": "#059669",
    "C": "#7C3AED",
    "N": "#111111",
}

PAIR_LINE_COLORS: Dict[str, str] = {
    "AU": "#2563EB",
    "UA": "#2563EB",
    "AT": "#2563EB",
    "TA": "#2563EB",
    "GC": "#059669",
    "CG": "#059669",
}

RESIDUE_TOKEN_RE = re.compile(
    r"""
    ^
    (?:(?P<prefix_sugar>d|r))?                       # optional d5mC / r5mC
    (?P<base_mod>5m|m5)?                            # optional base modification
    (?P<base>[ACGTUacgtu])                          # canonical base identity
    (?P<suffix_sugar>m|f|d|dna|rna|lna|moe|gna|cet|ome|omethyl|2f)?  # optional sugar code
    $
    """,
    re.IGNORECASE | re.VERBOSE,
)

TOKEN_RE = re.compile(
    r"""
    \b
    (?:
        (?:d|r)?(?:5m|m5)?[ACGTUacgtu](?:m|f|d|dna|rna|lna|moe|gna|cet|ome|omethyl|2f)?
    )
    \b
    """,
    re.IGNORECASE | re.VERBOSE,
)

BASE_MOD_DISPLAY: Dict[str, str] = {
    "5M": "5m",
    "M5": "5m",
    "": "",
}


def monomer_style(label: str) -> Dict[str, str]:
    return MONOMER_COLORS.get(label, MONOMER_COLORS["default"])


def backbone_color(label: str) -> str:
    return {
        "PO": "#6B7280",
        "PS": "#B45309",
        "PS2": "#7C2D12",
    }.get(label, "#6B7280")


def xml_escape(txt: str) -> str:
    return txt.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slugify(value: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip().lower())
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "item"


@dataclass
class StrandStyle:
    sugar_label: str
    sugar_note: str
    backbone_label: str
    backbone_note: str


@dataclass
class Residue:
    index: int
    base: str               # display label, e.g. "5mC"
    canonical_base: str     # pairing identity, e.g. "C"
    sugar: str
    backbone_to_next: Optional[str]


@dataclass
class Strand:
    name: str
    sequence_5to3: str      # canonical sequence only
    residues: List[Residue]


@dataclass
class ParsedDescription:
    strand_type: str
    chemistry: str
    sense_seq: str
    antisense_seq: Optional[str]
    title: str
    sense_style: StrandStyle
    antisense_style: StrandStyle
    interpretation_source: str
    chemistry_recipe: str
    seed_sequence: str
    sequence_source: str
    chemistry_source: str
    strands: List[Strand]
    antisense_three_prime_overhang: int = 0
    duplex_display_shift: int = 0


def normalize_sequence(seq: str, chemistry: str, preserve_explicit: bool = False) -> str:
    seq = re.sub(r"[^A-Za-z]", "", seq or "").upper()
    if preserve_explicit:
        return "".join(ch for ch in seq if ch in {"A", "U", "T", "G", "C"})
    if chemistry == "RNA":
        seq = seq.replace("T", "U")
        return "".join(ch for ch in seq if ch in {"A", "U", "G", "C"})
    seq = seq.replace("U", "T")
    return "".join(ch for ch in seq if ch in {"A", "T", "G", "C"})


def normalize_base(base: str, chemistry: str, preserve_explicit: bool = False) -> str:
    b = re.sub(r"[^A-Za-z]", "", base or "").upper()
    if not b:
        return "N"
    b = b[0]
    if preserve_explicit:
        return b if b in {"A", "U", "T", "G", "C"} else "N"
    if chemistry == "RNA":
        b = b.replace("T", "U")
        return b if b in {"A", "U", "G", "C"} else "N"
    b = b.replace("U", "T")
    return b if b in {"A", "T", "G", "C"} else "N"


def normalize_canonical_base(base: str, chemistry: str, preserve_explicit: bool = False) -> str:
    b = re.sub(r"[^A-Za-z]", "", base or "").upper()
    if not b:
        return "N"
    b = b[-1] if len(b) > 1 else b[0]
    if preserve_explicit:
        return b if b in {"A", "U", "T", "G", "C"} else "N"
    if chemistry == "RNA":
        b = b.replace("T", "U")
        return b if b in {"A", "U", "G", "C"} else "N"
    b = b.replace("U", "T")
    return b if b in {"A", "T", "G", "C"} else "N"


def normalize_base_label(
    base_mod: str,
    canonical_base: str,
    chemistry: str,
    preserve_explicit: bool = False,
) -> str:
    mod = BASE_MOD_DISPLAY.get((base_mod or "").upper(), "")
    base = normalize_canonical_base(canonical_base, chemistry, preserve_explicit=preserve_explicit)
    if base == "N":
        return "N"
    return f"{mod}{base}"


def residue_token_to_parts(token: str, chemistry: str, preserve_explicit: bool = False) -> Tuple[str, str, str]:
    """
    Returns:
      (display_base, canonical_base, sugar)

    Examples:
      5mC   -> ("5mC", "C", default sugar)
      d5mC  -> ("5mC", "C", "DNA")
      r5mC  -> ("5mC", "C", "RNA")
      5mCd  -> ("5mC", "C", "DNA")
      Am    -> ("A", "A", "2'-OMe")
      dT    -> ("dT", "T", "DNA")
    """
    raw = token.strip()
    m = RESIDUE_TOKEN_RE.fullmatch(raw)
    if not m:
        canon = normalize_canonical_base(raw, chemistry, preserve_explicit=preserve_explicit)
        default_sugar = "RNA" if chemistry == "RNA" else "DNA"
        return canon, canon, default_sugar

    prefix_sugar = (m.group("prefix_sugar") or "").lower()
    base_mod = m.group("base_mod") or ""
    base = m.group("base") or ""
    suffix_sugar = m.group("suffix_sugar") or ""

    canonical_base = normalize_canonical_base(base, chemistry, preserve_explicit=preserve_explicit)
    display_base = normalize_base_label(base_mod, canonical_base, chemistry, preserve_explicit=preserve_explicit)

    if prefix_sugar == "d":
        sugar = "DNA"
        if canonical_base == "T" and not base_mod:
            display_base = "dT"
    elif prefix_sugar == "r":
        sugar = "RNA"
    else:
        sugar = _token_to_sugar(suffix_sugar, chemistry)

    return display_base, canonical_base, sugar


def split_display_and_canonical_base(
    raw_base: str,
    chemistry: str,
    preserve_explicit: bool = False,
) -> Tuple[str, str]:
    """
    Structured-output-safe base parser.

    Accepts examples like:
      C, U, T, A, G
      5mC, m5C
      d5mC, r5mC
      5mCd, 5mCrna
      dT

    Returns:
      (display_base, canonical_base)
    """
    raw = (raw_base or "").strip()
    if not raw:
        return ("N", "N")

    if re.fullmatch(r"dT", raw, re.IGNORECASE):
        return ("dT", "T")

    m = RESIDUE_TOKEN_RE.fullmatch(raw)
    if m:
        canonical_base = normalize_canonical_base(
            m.group("base") or "",
            chemistry,
            preserve_explicit=preserve_explicit,
        )
        display_base = normalize_base_label(
            m.group("base_mod") or "",
            canonical_base,
            chemistry,
            preserve_explicit=preserve_explicit,
        )
        if (m.group("prefix_sugar") or "").lower() == "d" and canonical_base == "T" and not (m.group("base_mod") or ""):
            display_base = "dT"
        return (display_base, canonical_base)

    base_mod_match = re.match(r"^(5m|m5)?([ACGTUacgtu])$", raw, re.IGNORECASE)
    if base_mod_match:
        canonical_base = normalize_canonical_base(
            base_mod_match.group(2),
            chemistry,
            preserve_explicit=preserve_explicit,
        )
        display_base = normalize_base_label(
            base_mod_match.group(1) or "",
            canonical_base,
            chemistry,
            preserve_explicit=preserve_explicit,
        )
        return (display_base, canonical_base)

    canonical_base = normalize_canonical_base(raw, chemistry, preserve_explicit=preserve_explicit)
    return (raw if raw else canonical_base, canonical_base)


def reverse_complement(seq: str, chemistry: str) -> str:
    table = RNA_COMPLEMENT if chemistry == "RNA" else DNA_COMPLEMENT
    return "".join(table.get(ch, "N") for ch in reversed(seq))


def complement_base(base: str, chemistry: str) -> str:
    table = RNA_COMPLEMENT if chemistry == "RNA" else DNA_COMPLEMENT
    b = normalize_canonical_base(base, chemistry)
    return table.get(b, "N")


def canonical_backbone(token: str, default: str = "PO") -> Tuple[str, str]:
    t = (token or "").strip()
    if t == "PS":
        return ("PS", "phosphorothioate")
    if t == "PS2":
        return ("PS2", "phosphorodithioate")
    if t == "PO":
        return ("PO", "phosphate")
    return canonical_backbone(default)


def canonical_sugar_mod(token: str, default: str = "RNA") -> Tuple[str, str]:
    t = (token or "").strip()
    if t not in ALLOWED_SUGARS:
        t = default
    if t == "2'-OMe":
        return ("2'-OMe", "2'-O-methyl sugar")
    if t == "2'-F":
        return ("2'-F", "2'-fluoro sugar")
    if t == "LNA":
        return ("LNA", "locked nucleic acid sugar")
    if t == "MOE":
        return ("MOE", "2'-O-methoxyethyl sugar")
    if t == "GNA":
        return ("GNA", "glycol nucleic acid sugar")
    if t == "cEt":
        return ("cEt", "constrained ethyl sugar")
    if t == "DNA":
        return ("DNA", "deoxyribose sugar")
    return ("RNA", "ribose sugar")


def _build_json_schema() -> Dict[str, Any]:
    return {
        "name": "oligo_full_structure",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "strand_type": {"type": "string", "enum": ["single", "double"]},
                "chemistry": {"type": "string", "enum": ["RNA", "DNA"]},
                "chemistry_recipe": {"type": "string"},
                "seed_sequence": {"type": "string"},
                "sequence_source": {"type": "string", "enum": ["explicit", "derived"]},
                "strands": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 2,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "enum": ["sense", "antisense", "single"]},
                            "sequence_5to3": {"type": "string"},
                            "residues": {
                                "type": "array",
                                "minItems": 1,
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "index": {"type": "integer"},
                                        "base": {"type": "string"},  # display label, e.g. 5mC
                                        "canonical_base": {"type": "string"},  # e.g. C
                                        "sugar": {
                                            "type": "string",
                                            "enum": ["RNA", "DNA", "2'-OMe", "2'-F", "LNA", "MOE", "GNA", "cEt"]
                                        },
                                        "backbone_to_next": {
                                            "type": ["string", "null"],
                                            "enum": ["PO", "PS", "PS2", None]
                                        }
                                    },
                                    "required": ["index", "base", "canonical_base", "sugar", "backbone_to_next"]
                                }
                            }
                        },
                        "required": ["name", "sequence_5to3", "residues"]
                    }
                }
            },
            "required": [
                "title",
                "strand_type",
                "chemistry",
                "chemistry_recipe",
                "seed_sequence",
                "sequence_source",
                "strands"
            ]
        }
    }


def _ask_openai_for_structure(description: str) -> Dict[str, Any]:
    if OpenAI is None:
        raise RuntimeError("openai package is not installed")
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI()
    schema = _build_json_schema()

    instructions = """
You are an expert oligonucleotide and siRNA chemistry interpreter.

Return ONLY JSON that matches the schema.

Core requirements:
- Determine the full structure from the request.
- Do not return partial chemistry if a full chemistry pattern can be inferred.
- Build exact strand sequences and exact residue-by-residue chemistry.
- sequence_5to3 must be the CANONICAL unmodified base sequence in 5'->3' order.
- Each residue.base must be the DISPLAY label exactly as intended for rendering, for example:
  C, U, T, A, G, 5mC
- Each residue.canonical_base must be the canonical pairing identity, for example:
  5mC => C
- Final residue in each strand must have backbone_to_next = null.

Interpretation rules:
- Prefer RNA unless DNA is explicitly requested.
- If the request implies siRNA / duplex / double-stranded / ESC chemistry, use strand_type = "double".
- If the request implies a single antisense oligo, use strand_type = "single".
- Normalize chemistry language:
  * phosphorothioate => PS
  * phosphorodithioate => PS2
  * phosphate / phosphodiester => PO
  * o-methyl / OMe => 2'-OMe
  * fluoro / 2F => 2'-F
- If the request implies a named chemistry platform or motif, such as ESC, infer a full residue-level structure from that chemistry rather than using uniform whole-strand labels unless the user explicitly asked for a simplified schematic.
- For duplexes, determine the appropriate strand lengths and overhangs from the chemistry request itself when they can be inferred. Do not leave that to the caller.
- If only one strand is provided, derive the partner strand consistent with the inferred chemistry.
- If no full sequence is provided but the chemistry clearly implies a duplex design, derive a complete duplex.
- If the user provides a seed, place it appropriately for the inferred duplex architecture and derive the remaining residues.
- For named chemistries like ESC, determine where the 2'-F and 2'-OMe residues belong and return them explicitly position-by-position.
- chemistry_recipe should be a concise human-readable summary of the inferred design.
- sequence_source should be "explicit" only if the user directly supplied full strand sequences; otherwise "derived".

Modified base handling:
- Preserve modified bases in residue.base when appropriate, e.g. 5mC.
- Use residue.canonical_base for pairing identity.
- DNA-vs-RNA character should be represented by residue.sugar, not by changing residue.base away from its intended display form.
"""

    response = client.responses.create(
        model=OPENAI_MODEL,
        instructions=instructions,
        input=description,
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


def _strand_from_data(raw: Dict[str, Any], chemistry: str, preserve_explicit: bool = False) -> Strand:
    seq = normalize_sequence(
        str(raw.get("sequence_5to3", "") or ""),
        chemistry,
        preserve_explicit=preserve_explicit,
    )
    residues_in = raw.get("residues", []) or []

    residues: List[Residue] = []
    rebuilt_seq: List[str] = []

    for i, r in enumerate(residues_in, start=1):
        raw_base = str(r.get("base", "") or "")
        raw_canonical_base = str(r.get("canonical_base", "") or "").strip()

        display_base, inferred_canonical_base = split_display_and_canonical_base(
            raw_base,
            chemistry,
            preserve_explicit=preserve_explicit,
        )
        canonical_base = (
            normalize_canonical_base(
                raw_canonical_base,
                chemistry,
                preserve_explicit=preserve_explicit,
            )
            if raw_canonical_base
            else inferred_canonical_base
        )

        if canonical_base == "N":
            canonical_base = inferred_canonical_base

        sugar = str(r.get("sugar", "") or "")
        if sugar not in ALLOWED_SUGARS:
            sugar = "RNA" if chemistry == "RNA" else "DNA"

        bb = r.get("backbone_to_next", None)
        if bb is not None and bb not in ALLOWED_BACKBONES:
            bb = "PO"

        residues.append(
            Residue(
                index=i,
                base=display_base,
                canonical_base=canonical_base,
                sugar=sugar,
                backbone_to_next=bb,
            )
        )
        rebuilt_seq.append(canonical_base)

    if rebuilt_seq:
        seq = "".join(rebuilt_seq)

    if residues:
        residues[-1].backbone_to_next = None

    return Strand(
        name=str(raw.get("name", "") or "single"),
        sequence_5to3=seq,
        residues=residues,
    )


def _derive_missing_partner(strands: List[Strand], chemistry: str) -> List[Strand]:
    sense = next((s for s in strands if s.name == "sense"), None)
    antisense = next((s for s in strands if s.name == "antisense"), None)

    if sense and antisense:
        return [sense, antisense]

    if sense and not antisense:
        anti_seq = reverse_complement(sense.sequence_5to3, chemistry)
        anti_res = [
            Residue(i + 1, b, b, "RNA" if chemistry == "RNA" else "DNA", "PO")
            for i, b in enumerate(anti_seq)
        ]
        if anti_res:
            anti_res[-1].backbone_to_next = None
        return [sense, Strand("antisense", anti_seq, anti_res)]

    if antisense and not sense:
        sense_seq = reverse_complement(antisense.sequence_5to3, chemistry)
        sense_res = [
            Residue(i + 1, b, b, "RNA" if chemistry == "RNA" else "DNA", "PO")
            for i, b in enumerate(sense_seq)
        ]
        if sense_res:
            sense_res[-1].backbone_to_next = None
        return [Strand("sense", sense_seq, sense_res), antisense]

    return strands


def enforce_complementarity(
    sense: Strand,
    antisense: Strand,
    chemistry: str,
    sequence_source: str,
) -> Tuple[Strand, Strand]:
    if sequence_source == "explicit":
        return sense, antisense

    table = RNA_COMPLEMENT if chemistry == "RNA" else DNA_COMPLEMENT
    corrected_seq = "".join(table.get(base, "N") for base in reversed(sense.sequence_5to3))

    new_residues: List[Residue] = []
    for i, base in enumerate(corrected_seq):
        existing = antisense.residues[i] if i < len(antisense.residues) else None
        new_residues.append(
            Residue(
                index=i + 1,
                base=base,
                canonical_base=base,
                sugar=existing.sugar if existing else ("RNA" if chemistry == "RNA" else "DNA"),
                backbone_to_next=existing.backbone_to_next if existing else "PO",
            )
        )

    if new_residues:
        new_residues[-1].backbone_to_next = None

    corrected_antisense = Strand(
        name="antisense",
        sequence_5to3=corrected_seq,
        residues=new_residues,
    )

    return sense, corrected_antisense


def _extract_strand_block(description: str, strand_name: str) -> Optional[str]:
    escaped = re.escape(strand_name)
    pattern = re.compile(
        rf"""
        \b{escaped}(?:\s+strand)?      
        (?:
            \s+from\s+5['’]?\s*(?:to|-)?\s*3['’]? |
            \s+5['’]?\s*(?:to|-)?\s*3['’]? |
            \s+is |
            \s*:
        )*
        \s*
        (.*?)
        (?=
            (?:\bantisense(?:\s+strand)?\b |
               \bsense(?:\s+strand)?\b |
               \band\s+make\b |
               \bmake\b |
               $)
        )
        """,
        re.IGNORECASE | re.DOTALL | re.VERBOSE,
    )
    match = pattern.search(description)
    if not match:
        return None
    return match.group(1).strip(" \t\r\n:;,")


def _strand_header_position(description: str, strand_name: str) -> int:
    match = re.search(rf"\b{re.escape(strand_name)}(?:\s+strand)?\b", description, re.IGNORECASE)
    return match.start() if match else -1


def _strand_is_explicit_5to3(description: str, strand_name: str) -> bool:
    pattern = re.compile(
        rf"""
        \b{re.escape(strand_name)}(?:\s+strand)?\b
        (?:
            [^\n\r:;,.]{0,80}?
            5\s*['’]?\s*(?:to|-)?\s*3\s*['’]?
        )
        """,
        re.IGNORECASE | re.VERBOSE,
    )
    return bool(pattern.search(description))


def _extract_tokens(block: str) -> List[str]:
    if not block:
        return []
    return [m.group(0) for m in TOKEN_RE.finditer(block)]


def _guess_chemistry_from_tokens(tokens: List[str]) -> str:
    joined = " ".join(tokens).upper()
    if "T" in joined and "U" not in joined:
        return "DNA"
    return "RNA"


def _token_to_sugar(token_suffix: str, chemistry: str) -> str:
    s = token_suffix.strip().lower().replace("-", "")
    if not s:
        return "RNA" if chemistry == "RNA" else "DNA"
    mapping = {
        "m": "2'-OMe",
        "ome": "2'-OMe",
        "omethyl": "2'-OMe",
        "2f": "2'-F",
        "f": "2'-F",
        "dna": "DNA",
        "d": "DNA",
        "rna": "RNA",
        "lna": "LNA",
        "moe": "MOE",
        "gna": "GNA",
        "cet": "cEt",
    }
    return mapping.get(s, "RNA" if chemistry == "RNA" else "DNA")


def _tokens_to_strand(name: str, tokens: List[str], chemistry: str) -> Strand:
    residues: List[Residue] = []
    seq_parts: List[str] = []

    for i, token in enumerate(tokens, start=1):
        display_base, canonical_base, sugar = residue_token_to_parts(
            token,
            chemistry,
            preserve_explicit=True,
        )
        residues.append(
            Residue(
                index=i,
                base=display_base,
                canonical_base=canonical_base,
                sugar=sugar,
                backbone_to_next="PO",
            )
        )
        seq_parts.append(canonical_base)

    if residues:
        residues[-1].backbone_to_next = None

    return Strand(name=name, sequence_5to3="".join(seq_parts), residues=residues)


def _reverse_tokens(tokens: List[str]) -> List[str]:
    return list(reversed(tokens))


def _reverse_complement_tokens(tokens: List[str], chemistry: str) -> List[str]:
    reversed_tokens = list(reversed(tokens))
    out: List[str] = []
    for token in reversed_tokens:
        display_base, canonical_base, sugar = residue_token_to_parts(
            token,
            chemistry,
            preserve_explicit=True,
        )
        comp = complement_base(canonical_base, chemistry)
        prefix = ""
        if sugar == "DNA":
            prefix = "d"
        elif sugar == "RNA":
            prefix = "r"
        suffix_map = {
            "2'-OMe": "m",
            "2'-F": "f",
            "LNA": "lna",
            "MOE": "moe",
            "GNA": "gna",
        }
        suffix = "" if prefix else suffix_map.get(sugar, "")

        display_prefix = ""
        if len(display_base) > 1 and display_base.endswith(canonical_base):
            display_prefix = display_base[:-1]
            if prefix == "d" and display_prefix.lower() == "d":
                display_prefix = ""

        rebuilt = f"{prefix}{display_prefix}{comp}{suffix}"
        if prefix == "d" and comp == "T" and not display_prefix and not suffix:
            rebuilt = "dT"
        out.append(rebuilt)
    return out


def _sequence_from_tokens(tokens: List[str], chemistry: str) -> str:
    return "".join(
        residue_token_to_parts(token, chemistry, preserve_explicit=True)[1]
        for token in tokens
    )


def _optimize_token_alignment(
    first_tokens: List[str],
    second_tokens: List[str],
    chemistry: str,
) -> Tuple[List[str], List[str], int, str]:
    first_variants = [
        ("as-written", first_tokens),
        ("reversed", _reverse_tokens(first_tokens)),
        ("reverse-complemented", _reverse_complement_tokens(first_tokens, chemistry)),
    ]
    second_variants = [
        ("as-written", second_tokens),
        ("reversed", _reverse_tokens(second_tokens)),
        ("reverse-complemented", _reverse_complement_tokens(second_tokens, chemistry)),
    ]

    best_result = None

    for first_label, first_variant in first_variants:
        first_seq = _sequence_from_tokens(first_variant, chemistry)
        for second_label, second_variant in second_variants:
            second_seq = _sequence_from_tokens(second_variant, chemistry)
            shift, matches, overlap = _best_duplex_alignment(first_seq, second_seq, chemistry)
            transform_penalty = int(first_label != "as-written") + int(second_label != "as-written")
            key = (matches, overlap, -abs(shift), -transform_penalty)
            note = (
                f"best sequence alignment before object generation after sliding; "
                f"first strand={first_label}, second strand={second_label}; "
                f"all input strings interpreted as 5'->3'"
            )
            candidate = (key, first_variant, second_variant, shift, note)
            if best_result is None or candidate[0] > best_result[0]:
                best_result = candidate

    if best_result is None:
        return first_tokens, second_tokens, 0, "no valid token alignment found"

    _, best_first, best_second, best_shift, best_note = best_result
    return best_first, best_second, best_shift, best_note


def _reverse_strand(strand: Strand) -> Strand:
    residues = [
        Residue(
            index=i + 1,
            base=r.base,
            canonical_base=r.canonical_base,
            sugar=r.sugar,
            backbone_to_next="PO",
        )
        for i, r in enumerate(reversed(strand.residues))
    ]
    if residues:
        residues[-1].backbone_to_next = None
    return Strand(
        name=strand.name,
        sequence_5to3="".join(r.canonical_base for r in residues),
        residues=residues,
    )


def _reverse_complement_strand(strand: Strand, chemistry: str) -> Strand:
    reversed_residues = list(reversed(strand.residues))
    residues: List[Residue] = []
    for i, r in enumerate(reversed_residues, start=1):
        comp = complement_base(r.canonical_base, chemistry)
        residues.append(
            Residue(
                index=i,
                base=comp,
                canonical_base=comp,
                sugar=r.sugar,
                backbone_to_next="PO",
            )
        )
    if residues:
        residues[-1].backbone_to_next = None
    return Strand(
        name=strand.name,
        sequence_5to3="".join(r.canonical_base for r in residues),
        residues=residues,
    )


def _complementary_match(base1: str, base2: str, chemistry: str) -> bool:
    table = RNA_COMPLEMENT if chemistry == "RNA" else DNA_COMPLEMENT
    b1 = normalize_canonical_base(base1, chemistry)
    b2 = normalize_canonical_base(base2, chemistry)
    return table.get(b1, "N") == b2


def _pair_line_color(base1: str, base2: str, chemistry: str) -> str:
    b1 = normalize_canonical_base(base1, chemistry)
    b2 = normalize_canonical_base(base2, chemistry)
    return PAIR_LINE_COLORS.get(f"{b1}{b2}", "#9CA3AF")


def _best_duplex_alignment(
    first_seq: str,
    second_actual_5to3: str,
    chemistry: str,
) -> Tuple[int, int, int]:
    second_facing = second_actual_5to3[::-1]
    best_key: Optional[Tuple[int, int, int, int]] = None
    best_shift = 0

    for shift in range(-len(second_facing), len(first_seq) + 1):
        matches = 0
        overlap = 0

        for i, base1 in enumerate(first_seq):
            j = i - shift
            if 0 <= j < len(second_facing):
                overlap += 1
                if _complementary_match(base1, second_facing[j], chemistry):
                    matches += 1

        if overlap == 0:
            continue

        key = (matches, overlap, -abs(shift), -shift)
        if best_key is None or key > best_key:
            best_key = key
            best_shift = shift

    if best_key is None:
        return 0, 0, 0

    matches, overlap, _, _ = best_key
    return best_shift, matches, overlap


def _best_vertical_bottom_shift(
    top_seq_5to3: str,
    bottom_seq_5to3: str,
    chemistry: str,
) -> Tuple[int, int, int]:
    """
    Compute the rigid horizontal translation for the bottom strand that maximizes
    correct vertical pairings with the top strand in the rendered duplex.

    The top strand is used as written left->right in 5'->3'.
    The bottom strand is rendered left->right as its facing sequence, i.e. reversed
    from its actual 5'->3' storage order, because the bottom chain is drawn 3'->5'
    visually while preserving chain continuity.

    Returns:
      (display_shift, matches, overlap)

    display_shift semantics match draw_double_stranded:
      j = i - display_shift
    where i is top residue index and j is bottom rendered-left-to-right index.
    """
    bottom_facing = bottom_seq_5to3[::-1]
    best_key: Optional[Tuple[int, int, int, int]] = None
    best_shift = 0

    for shift in range(-len(bottom_facing), len(top_seq_5to3) + 1):
        matches = 0
        overlap = 0

        for i, top_base in enumerate(top_seq_5to3):
            j = i - shift
            if 0 <= j < len(bottom_facing):
                overlap += 1
                if _complementary_match(top_base, bottom_facing[j], chemistry):
                    matches += 1

        if overlap == 0:
            continue

        key = (matches, overlap, -abs(shift), -shift)
        if best_key is None or key > best_key:
            best_key = key
            best_shift = shift

    if best_key is None:
        return 0, 0, 0

    matches, overlap, _, _ = best_key
    return best_shift, matches, overlap


def _optimize_duplex_alignment(
    first_strand: Strand,
    second_strand: Strand,
    chemistry: str,
) -> Tuple[Strand, Strand, int, str]:
    first_variants = [
        ("as-written", first_strand),
        ("reversed", _reverse_strand(first_strand)),
        ("reverse-complemented", _reverse_complement_strand(first_strand, chemistry)),
    ]
    second_variants = [
        ("as-written", second_strand),
        ("reversed", _reverse_strand(second_strand)),
        ("reverse-complemented", _reverse_complement_strand(second_strand, chemistry)),
    ]

    best_result: Optional[Tuple[Tuple[int, int, int, int], Strand, Strand, int, str]] = None

    for first_label, first_variant in first_variants:
        for second_label, second_variant in second_variants:
            shift, matches, overlap = _best_duplex_alignment(
                first_variant.sequence_5to3,
                second_variant.sequence_5to3,
                chemistry,
            )
            transform_penalty = int(first_label != "as-written") + int(second_label != "as-written")
            key = (matches, overlap, -abs(shift), -transform_penalty)
            note = (
                f"best contiguous duplex alignment after sliding; "
                f"first strand={first_label}, second strand={second_label}"
            )
            candidate = (key, first_variant, second_variant, shift, note)
            if best_result is None or candidate[0] > best_result[0]:
                best_result = candidate

    if best_result is None:
        return first_strand, second_strand, 0, "no valid duplex alignment found"

    _, best_first, best_second, best_shift, best_note = best_result
    return best_first, best_second, best_shift, best_note


def _extract_antisense_three_prime_overhang(description: str) -> int:
    quantity_patterns = [
        (2, r"(?:two|2)"),
        (1, r"(?:one|1|a|an)"),
    ]
    templates = [
        r"\b{q}\s*[- ]?(?:base|nt|nucleotide)\s+3['’]?\s*overhang\s+on\s+the\s+antisense\s+strand\b",
        r"\b{q}\s*[- ]?(?:base|nt|nucleotide)\s+overhang\s+on\s+the\s+3['’]?\s*end\s+of\s+the\s+antisense\s+strand\b",
        r"\bantisense\s+strand\b[^.\n\r]{{0,120}}\bwith\s+{q}\s*[- ]?(?:base|nt|nucleotide)\s+3['’]?\s+overhang\b",
        r"\bantisense\s+3['’]?\s+overhang\s*[:=]?\s*{q}\b",
    ]
    for count, qpat in quantity_patterns:
        for template in templates:
            if re.search(template.format(q=qpat), description, re.IGNORECASE):
                return count

    fallback_patterns = [
        r"\b3['’]?\s*[- ]?(?:base|nt|nucleotide)\s+overhang\s+on\s+the\s+antisense\s+strand\b",
        r"\bantisense\s+strand\b[^.\n\r]{0,120}\bwith\s+a\s+3['’]?\s*[- ]?(?:base|nt|nucleotide)\s+overhang\b",
    ]
    for pattern in fallback_patterns:
        if re.search(pattern, description, re.IGNORECASE):
            return 1
    return 0


def _style_from_strand(strand: Strand, chemistry: str) -> StrandStyle:
    first = strand.residues[0] if strand.residues else None
    sugar_label, sugar_note = canonical_sugar_mod(
        first.sugar if first else ("RNA" if chemistry == "RNA" else "DNA"),
        chemistry,
    )
    bb = next((r.backbone_to_next for r in strand.residues if r.backbone_to_next), "PO")
    backbone_label, backbone_note = canonical_backbone(bb, "PO")
    return StrandStyle(
        sugar_label=sugar_label,
        sugar_note=sugar_note,
        backbone_label=backbone_label,
        backbone_note=backbone_note,
    )


def _parse_explicit_duplex(description: str) -> Optional[ParsedDescription]:
    antisense_block = _extract_strand_block(description, "antisense")
    sense_block = _extract_strand_block(description, "sense")
    if not antisense_block or not sense_block:
        return None

    antisense_tokens = _extract_tokens(antisense_block)
    sense_tokens = _extract_tokens(sense_block)
    if not antisense_tokens or not sense_tokens:
        return None

    chemistry = _guess_chemistry_from_tokens(antisense_tokens + sense_tokens)

    first_name = "sense"
    if 0 <= _strand_header_position(description, "antisense") < _strand_header_position(description, "sense") or _strand_header_position(description, "sense") < 0:
        first_name = "antisense"

    antisense_overhang = _extract_antisense_three_prime_overhang(description)

    if first_name == "sense":
        sense_tokens, antisense_tokens, display_shift, orientation_note = _optimize_token_alignment(
            sense_tokens,
            antisense_tokens,
            chemistry,
        )
    else:
        antisense_tokens, sense_tokens, display_shift, orientation_note = _optimize_token_alignment(
            antisense_tokens,
            sense_tokens,
            chemistry,
        )

    sense = _tokens_to_strand("sense", sense_tokens, chemistry)
    antisense = _tokens_to_strand("antisense", antisense_tokens, chemistry)

    _, best_matches, best_overlap = _best_duplex_alignment(
        sense.sequence_5to3,
        antisense.sequence_5to3,
        chemistry,
    )

    chemistry_recipe = "Explicit tokenized duplex parsed directly from the prompt; all input strings assumed to be 5'->3'"
    chemistry_recipe += f"; {orientation_note}"
    chemistry_recipe += f"; maximal complementary alignment = {best_matches}/{best_overlap} matched bases"
    if antisense_overhang > 0:
        chemistry_recipe += f"; explicit antisense 3' overhang request = {antisense_overhang} nt"
    else:
        chemistry_recipe += "; end overhangs allowed without penalty"

    return ParsedDescription(
        strand_type="double",
        chemistry=chemistry,
        sense_seq=sense.sequence_5to3,
        antisense_seq=antisense.sequence_5to3,
        title="Explicit siRNA duplex",
        sense_style=_style_from_strand(sense, chemistry),
        antisense_style=_style_from_strand(antisense, chemistry),
        interpretation_source="explicit_prompt_parser",
        chemistry_recipe=chemistry_recipe,
        seed_sequence="",
        sequence_source="explicit",
        chemistry_source="explicit_prompt_parser",
        strands=[sense, antisense],
        antisense_three_prime_overhang=antisense_overhang,
        duplex_display_shift=display_shift,
    )


def parse_description(description: str) -> ParsedDescription:
    explicit = _parse_explicit_duplex(description)
    if explicit is not None:
        return explicit

    raw = _ask_openai_for_structure(description)

    strand_type = "double" if raw.get("strand_type") == "double" else "single"
    chemistry = "DNA" if raw.get("chemistry") == "DNA" else "RNA"
    chemistry_recipe = str(raw.get("chemistry_recipe", "") or "").strip()
    seed_sequence = normalize_sequence(str(raw.get("seed_sequence", "") or ""), chemistry)
    sequence_source = str(raw.get("sequence_source", "") or "derived").strip() or "derived"

    strands = [
        _strand_from_data(s, chemistry, preserve_explicit=(sequence_source == "explicit"))
        for s in (raw.get("strands", []) or [])
    ]

    if strand_type == "double":
        strands = _derive_missing_partner(strands, chemistry)

        sense = next((s for s in strands if s.name == "sense"), None)
        antisense = next((s for s in strands if s.name == "antisense"), None)
        if sense is None or antisense is None:
            raise ValueError("OpenAI returned an incomplete duplex structure")

        sense, antisense = enforce_complementarity(
            sense,
            antisense,
            chemistry,
            sequence_source,
        )
        strands = [sense, antisense]

        if sequence_source == "explicit":
            if chemistry_recipe:
                chemistry_recipe += "; explicit sequences were aligned before object generation when tokenized input was available"

        sense_seq = sense.sequence_5to3
        antisense_seq = antisense.sequence_5to3

        sense_first = next((r for r in sense.residues if r.sugar), None)
        anti_first = next((r for r in antisense.residues if r.sugar), None)
        sense_link = next((r.backbone_to_next for r in sense.residues if r.backbone_to_next), "PO")
        anti_link = next((r.backbone_to_next for r in antisense.residues if r.backbone_to_next), "PO")

        sense_sugar_label, sense_sugar_note = canonical_sugar_mod(
            sense_first.sugar if sense_first else ("RNA" if chemistry == "RNA" else "DNA"),
            chemistry,
        )
        anti_sugar_label, anti_sugar_note = canonical_sugar_mod(
            anti_first.sugar if anti_first else ("RNA" if chemistry == "RNA" else "DNA"),
            chemistry,
        )
        sense_bb_label, sense_bb_note = canonical_backbone(sense_link, "PO")
        anti_bb_label, anti_bb_note = canonical_backbone(anti_link, "PO")

    else:
        strand = next((s for s in strands if s.name in {"single", "sense", "antisense"}), None)
        if strand is None:
            raise ValueError("OpenAI returned no strand structure for single-stranded request")

        sense_seq = strand.sequence_5to3
        antisense_seq = None

        first = next((r for r in strand.residues if r.sugar), None)
        link = next((r.backbone_to_next for r in strand.residues if r.backbone_to_next), "PO")

        anti_sugar_label, anti_sugar_note = canonical_sugar_mod(
            first.sugar if first else ("RNA" if chemistry == "RNA" else "DNA"),
            chemistry,
        )
        anti_bb_label, anti_bb_note = canonical_backbone(link, "PO")
        sense_sugar_label, sense_sugar_note = anti_sugar_label, anti_sugar_note
        sense_bb_label, sense_bb_note = anti_bb_label, anti_bb_note
        strands = [strand]

    title = str(raw.get("title", "") or "").strip()
    if not title:
        title = "Double-stranded siRNA" if strand_type == "double" else "Single-stranded antisense"

    return ParsedDescription(
        strand_type=strand_type,
        chemistry=chemistry,
        sense_seq=sense_seq,
        antisense_seq=antisense_seq,
        title=title,
        sense_style=StrandStyle(
            sugar_label=sense_sugar_label,
            sugar_note=sense_sugar_note,
            backbone_label=sense_bb_label,
            backbone_note=sense_bb_note,
        ),
        antisense_style=StrandStyle(
            sugar_label=anti_sugar_label,
            sugar_note=anti_sugar_note,
            backbone_label=anti_bb_label,
            backbone_note=anti_bb_note,
        ),
        interpretation_source="openai",
        chemistry_recipe=chemistry_recipe,
        seed_sequence=seed_sequence,
        sequence_source=sequence_source,
        chemistry_source="openai",
        strands=strands,
        antisense_three_prime_overhang=0,
        duplex_display_shift=0,
    )


class SvgBuilder:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.parts: List[str] = []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def open_group(self, gid: str, label: Optional[str] = None, cls: Optional[str] = None) -> None:
        attrs = [f'id="{xml_escape(gid)}"']
        if label:
            attrs.append(f'data-label="{xml_escape(label)}"')
        if cls:
            attrs.append(f'class="{xml_escape(cls)}"')
        self.add(f"<g {' '.join(attrs)}>")

    def close_group(self) -> None:
        self.add("</g>")

    def line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        dashed: bool = False,
        stroke_width: float = 2.0,
        stroke: str = "#9CA3AF",
        extra_attrs: str = "",
    ) -> None:
        dash = ' stroke-dasharray="5 4"' if dashed else ""
        self.add(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{stroke}" stroke-width="{stroke_width:.1f}"{dash}{extra_attrs} />'
        )

    def path(
        self,
        d: str,
        stroke: str = "#9CA3AF",
        stroke_width: float = 2.0,
        fill: str = "none",
        extra_attrs: str = "",
    ) -> None:
        self.add(
            f'<path d="{xml_escape(d)}" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="{stroke_width:.1f}"{extra_attrs} />'
        )

    def polygon(
        self,
        points: List[Tuple[float, float]],
        fill: str = "#F3F4F6",
        stroke: str = "#4B5563",
        stroke_width: float = 2.0,
        extra_attrs: str = "",
    ) -> None:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        self.add(
            f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="{stroke_width:.1f}"{extra_attrs} />'
        )

    def circle(
        self,
        cx: float,
        cy: float,
        r: float,
        text: str = "S",
        text_size: int = 12,
        fill: str = "#f7f7f7",
        stroke: str = "#222",
        text_color: str = "#111",
        extra_attrs: str = "",
    ) -> None:
        self.add(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="2"{extra_attrs} />'
        )

        safe = xml_escape(text)
        max_diameter = r * 2 * 0.85

        fitted_size = text_size
        for size in range(max(text_size + 4, 18), 7, -1):
            est_width = 0.62 * size * len(text)
            est_height = size
            if est_width <= max_diameter and est_height <= max_diameter:
                fitted_size = size
                break

        self.add(
            f'<text x="{cx:.1f}" y="{cy + 1:.1f}" font-family="Arial, sans-serif" '
            f'font-size="{fitted_size}" font-weight="bold" text-anchor="middle" '
            f'dominant-baseline="middle" fill="{text_color}">{safe}</text>'
        )

    def text(
        self,
        x: float,
        y: float,
        txt: str,
        size: int = 16,
        anchor: str = "start",
        weight: str = "normal",
        fill: str = "#111",
        extra_attrs: str = "",
    ) -> None:
        safe = xml_escape(txt)
        self.add(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="Arial, sans-serif" '
            f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" '
            f'dominant-baseline="middle" fill="{fill}"{extra_attrs}>{safe}</text>'
        )

    def finish(self) -> str:
        body = "\n  ".join(self.parts)
        return (
            f'<svg xmlns="{SVG_NS}" width="{self.width}" height="{self.height}" '
            f'viewBox="0 0 {self.width} {self.height}">\n'
            f'  {body}\n'
            f'</svg>'
        )


def _draw_backbone_segment(
    builder: SvgBuilder,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    sugar_r: float,
    backbone_label: str,
    show_label_above: bool,
    strand_name: str,
    segment_index: int,
) -> None:
    left = x1 + sugar_r
    right = x2 - sugar_r
    mid = (left + right) / 2.0

    builder.open_group(
        gid=f"strand-{slugify(strand_name)}-segment-{segment_index}",
        label="strand-segment",
        cls="strand-segment",
    )
    builder.line(
        left,
        y1,
        right,
        y2,
        stroke_width=2.2,
        stroke="#D1D5DB",
        extra_attrs=(
            f' data-object-type="strand-segment"'
            f' data-label="strand-segment"'
            f' data-strand="{xml_escape(strand_name)}"'
            f' data-segment-index="{segment_index}"'
        ),
    )
    label_y = y1 - 18 if show_label_above else y1 + 18
    builder.text(
        mid,
        label_y,
        backbone_label,
        size=11,
        anchor="middle",
        weight="bold",
        fill=backbone_color(backbone_label),
        extra_attrs=(
            f' data-object-type="strand-segment-label"'
            f' data-label="strand-segment-label"'
            f' data-strand="{xml_escape(strand_name)}"'
            f' data-segment-index="{segment_index}"'
        ),
    )
    builder.close_group()


def _draw_residue_nucleotide(
    builder: SvgBuilder,
    residue: Residue,
    cx: float,
    cy: float,
    sugar_r: float,
    base_offset: float,
    show_bases_above: bool,
    strand_label: str,
) -> Tuple[float, float, float, float]:
    sugar_text_size = 14 if len(residue.sugar) > 4 else 15
    style = monomer_style(residue.sugar)

    base_y = cy - base_offset if show_bases_above else cy + base_offset
    connector_y1 = cy - sugar_r if show_bases_above else cy + sugar_r
    connector_y2 = base_y + 9 if show_bases_above else base_y - 9

    nucleotide_gid = f"nucleotide-{slugify(strand_label)}-{residue.index}"
    monomer_gid = f"monomer-{slugify(strand_label)}-{residue.index}"

    builder.open_group(
        gid=nucleotide_gid,
        label="nucleotide",
        cls="nucleotide",
    )

    builder.line(
        cx,
        connector_y1,
        cx,
        connector_y2,
        stroke_width=1.8,
        stroke="#9CA3AF",
        extra_attrs=(
            f' data-object-type="nucleotide-connector"'
            f' data-label="nucleotide-connector"'
            f' data-strand="{xml_escape(strand_label)}"'
            f' data-residue-index="{residue.index}"'
        ),
    )

    builder.open_group(
        gid=monomer_gid,
        label="monomer",
        cls="monomer",
    )
    builder.circle(
        cx,
        cy,
        sugar_r,
        text=residue.sugar,
        text_size=sugar_text_size,
        fill=style["fill"],
        stroke=style["stroke"],
        text_color=style["text"],
        extra_attrs=(
            f' data-object-type="monomer"'
            f' data-label="monomer"'
            f' data-strand="{xml_escape(strand_label)}"'
            f' data-residue-index="{residue.index}"'
            f' data-sugar="{xml_escape(residue.sugar)}"'
        ),
    )
    builder.close_group()

    builder.text(
        cx,
        base_y,
        residue.base,
        size=24,
        anchor="middle",
        weight="bold",
        fill=BASE_COLORS.get(residue.canonical_base, "#111111"),
        extra_attrs=(
            f' data-object-type="nucleotide-base"'
            f' data-label="nucleotide-base"'
            f' data-strand="{xml_escape(strand_label)}"'
            f' data-residue-index="{residue.index}"'
            f' data-base="{xml_escape(residue.base)}"'
        ),
    )

    builder.close_group()
    return (cx, cy, cx, base_y)


def _draw_strand_from_residues(
    builder: SvgBuilder,
    residues: List[Residue],
    y: float,
    show_bases_above: bool,
    left_to_right: bool,
    strand_label: str,
    five_prime_left: bool,
    start_x: float,
) -> List[Tuple[float, float, float, float]]:
    n = len(residues)
    step = 48
    sugar_r = 20
    base_offset = 52
    coords: List[Tuple[float, float, float, float]] = []

    draw_residues = residues if left_to_right else list(reversed(residues))
    chain_id = f"strand-{slugify(strand_label)}"

    builder.open_group(
        gid=chain_id,
        label="strand",
        cls="strand",
    )

    builder.text(
        34,
        y,
        strand_label,
        size=15,
        weight="bold",
        extra_attrs=(
            f' data-object-type="strand-name"'
            f' data-label="strand-name"'
            f' data-strand="{xml_escape(strand_label)}"'
        ),
    )
    builder.text(
        start_x - 58,
        y,
        "5'" if five_prime_left else "3'",
        size=14,
        anchor="middle",
        extra_attrs=(
            f' data-object-type="strand-terminus"'
            f' data-label="strand-terminus"'
            f' data-strand="{xml_escape(strand_label)}"'
            f' data-terminus="left"'
        ),
    )
    builder.text(
        start_x + step * (n - 1) + 58,
        y,
        "3'" if five_prime_left else "5'",
        size=14,
        anchor="middle",
        extra_attrs=(
            f' data-object-type="strand-terminus"'
            f' data-label="strand-terminus"'
            f' data-strand="{xml_escape(strand_label)}"'
            f' data-terminus="right"'
        ),
    )

    builder.open_group(
        gid=f"{chain_id}-background",
        label="strand-background",
        cls="strand-background",
    )
    for i in range(n - 1):
        x1 = start_x + i * step
        x2 = start_x + (i + 1) * step
        bb = draw_residues[i].backbone_to_next or "PO"
        _draw_backbone_segment(
            builder,
            x1,
            y,
            x2,
            y,
            sugar_r=sugar_r,
            backbone_label=bb,
            show_label_above=show_bases_above,
            strand_name=strand_label,
            segment_index=i + 1,
        )
    builder.close_group()

    builder.open_group(
        gid=f"{chain_id}-nucleotides",
        label="strand-nucleotides",
        cls="strand-nucleotides",
    )
    for i, residue in enumerate(draw_residues):
        cx = start_x + i * step
        cy = y
        coords.append(
            _draw_residue_nucleotide(
                builder=builder,
                residue=residue,
                cx=cx,
                cy=cy,
                sugar_r=sugar_r,
                base_offset=base_offset,
                show_bases_above=show_bases_above,
                strand_label=strand_label,
            )
        )
    builder.close_group()

    builder.close_group()
    return coords


def draw_single_stranded(parsed: ParsedDescription) -> str:
    strand = parsed.strands[0]
    n = len(strand.residues)
    width = max(760, 180 + n * 48)
    height = 250
    svg = SvgBuilder(width, height)

    svg.open_group(
        gid="compound-root",
        label="compound",
        cls="compound",
    )
    svg.text(
        width / 2,
        28,
        parsed.title,
        size=22,
        anchor="middle",
        weight="bold",
        extra_attrs=' data-object-type="compound-title" data-label="compound-title"',
    )
    svg.text(
        width / 2,
        55,
        f"{parsed.chemistry} schematic with OpenAI-determined residue structure",
        size=13,
        anchor="middle",
        extra_attrs=' data-object-type="compound-subtitle" data-label="compound-subtitle"',
    )
    _draw_context_glyphs(svg, width)

    _draw_strand_from_residues(
        svg,
        residues=strand.residues,
        y=160,
        show_bases_above=True,
        left_to_right=True,
        strand_label="antisense",
        five_prime_left=True,
        start_x=110,
    )

    _draw_straight_arrow(svg, 118, 82, 150, 118, color="#94A3B8", shaft_width=6.0, head_len=13.0, head_half_height=8.0)

    svg.close_group()
    return svg.finish()


def draw_double_stranded(parsed: ParsedDescription) -> str:
    sense = next(s for s in parsed.strands if s.name == "sense")
    antisense = next(s for s in parsed.strands if s.name == "antisense")

    step = 48
    y_top = 145
    y_bottom = 275

    # Reposition the entire bottom chain as a rigid contiguous strand so that
    # the number of correct vertical Watson-Crick pairings is maximized.
    # This only translates the bottom chain horizontally; it never breaks chain continuity.
    display_shift, vertical_matches, vertical_overlap = _best_vertical_bottom_shift(
        sense.sequence_5to3,
        antisense.sequence_5to3,
        parsed.chemistry,
    )

    base_start_x = 110
    sense_start_x = base_start_x + max(0, -display_shift) * step
    antisense_start_x = base_start_x + max(0, display_shift) * step
    right_extent_nt = max(
        max(0, -display_shift) + len(sense.residues),
        max(0, display_shift) + len(antisense.residues),
    )

    width = max(820, 200 + right_extent_nt * step)
    height = 340
    svg = SvgBuilder(width, height)

    svg.open_group(
        gid="compound-root",
        label="compound",
        cls="compound",
    )
    svg.text(
        width / 2,
        28,
        parsed.title,
        size=22,
        anchor="middle",
        weight="bold",
        extra_attrs=' data-object-type="compound-title" data-label="compound-title"',
    )
    svg.text(
        width / 2,
        55,
        f"{parsed.chemistry} duplex schematic with residue-level structure",
        size=13,
        anchor="middle",
        extra_attrs=' data-object-type="compound-subtitle" data-label="compound-subtitle"',
    )
    svg.text(
        width / 2,
        76,
        f"Bottom strand horizontally translated for optimal vertical pairing: {vertical_matches}/{vertical_overlap} matches",
        size=11,
        anchor="middle",
        extra_attrs=' data-object-type="compound-alignment-note" data-label="compound-alignment-note"',
    )
    _draw_context_glyphs(svg, width, title_y=34.0)

    svg.open_group(
        gid="compound-background",
        label="compound-background",
        cls="compound-background",
    )
    top_coords = [(sense_start_x + i * step, y_top) for i in range(len(sense.residues))]
    bottom_coords = [(antisense_start_x + i * step, y_bottom) for i in range(len(antisense.residues))]

    pair_index = 0
    for i in range(len(sense.residues)):
        j = i - display_shift
        if not (0 <= j < len(antisense.residues)):
            continue
        antisense_base = antisense.sequence_5to3[len(antisense.residues) - 1 - j]
        if not _complementary_match(sense.sequence_5to3[i], antisense_base, parsed.chemistry):
            continue

        pair_index += 1
        tx, ty = top_coords[i]
        bx, by = bottom_coords[j]
        svg.open_group(
            gid=f"compound-pair-{pair_index}",
            label="compound-pair",
            cls="compound-pair",
        )
        svg.line(
            tx,
            ty + 10,
            bx,
            by - 10,
            dashed=True,
            stroke_width=1.6,
            stroke=_pair_line_color(sense.sequence_5to3[i], antisense_base, parsed.chemistry),
            extra_attrs=(
                f' data-object-type="compound-pair-line"'
                f' data-label="compound-pair-line"'
                f' data-pair-index="{pair_index}"'
                f' data-sense-index="{i + 1}"'
                f' data-antisense-facing-index="{j + 1}"'
                f' data-pair="{sense.sequence_5to3[i]}-{antisense_base}"'
            ),
        )
        svg.close_group()
    svg.close_group()

    _draw_strand_from_residues(
        svg,
        residues=sense.residues,
        y=y_top,
        show_bases_above=True,
        left_to_right=True,
        strand_label="sense",
        five_prime_left=True,
        start_x=sense_start_x,
    )
    _draw_strand_from_residues(
        svg,
        residues=antisense.residues,
        y=y_bottom,
        show_bases_above=False,
        left_to_right=False,
        strand_label="antisense",
        five_prime_left=False,
        start_x=antisense_start_x,
    )

    _draw_straight_arrow(svg, 118, 88, sense_start_x + 24, 110, color="#94A3B8", shaft_width=6.0, head_len=13.0, head_half_height=8.0)
    _draw_straight_arrow(
        svg,
        width - 215,
        88,
        antisense_start_x + max(len(antisense.residues) - 1, 0) * step - 10,
        245,
        color="#94A3B8",
        shaft_width=6.0,
        head_len=13.0,
        head_half_height=8.0,
    )

    svg.close_group()
    return svg.finish()



def _draw_straight_arrow(builder: SvgBuilder, x1: float, y1: float, x2: float, y2: float, color: str = "#6B7280", shaft_width: float = 8.0, head_len: float = 16.0, head_half_height: float = 10.0) -> None:
    dx = x2 - x1
    dy = y2 - y1
    length = max((dx * dx + dy * dy) ** 0.5, 1.0)
    ux = dx / length
    uy = dy / length
    px = -uy
    py = ux

    shaft_end_x = x2 - ux * head_len
    shaft_end_y = y2 - uy * head_len

    p1 = (x1 + px * shaft_width / 2, y1 + py * shaft_width / 2)
    p2 = (shaft_end_x + px * shaft_width / 2, shaft_end_y + py * shaft_width / 2)
    p3 = (shaft_end_x + px * head_half_height, shaft_end_y + py * head_half_height)
    p4 = (x2, y2)
    p5 = (shaft_end_x - px * head_half_height, shaft_end_y - py * head_half_height)
    p6 = (shaft_end_x - px * shaft_width / 2, shaft_end_y - py * shaft_width / 2)
    p7 = (x1 - px * shaft_width / 2, y1 - py * shaft_width / 2)

    builder.polygon(
        [p1, p2, p3, p4, p5, p6, p7],
        fill=color,
        stroke=color,
        stroke_width=1.5,
        extra_attrs=' data-object-type="context-link" data-label="context-link"',
    )

def _draw_protein_blob(builder: SvgBuilder, cx: float, cy: float, label: str, gid: str) -> None:
    scale = 1.6
    points = [
        (cx - 34*scale, cy - 10*scale),
        (cx - 22*scale, cy - 28*scale),
        (cx + 2*scale, cy - 32*scale),
        (cx + 28*scale, cy - 18*scale),
        (cx + 34*scale, cy + 6*scale),
        (cx + 18*scale, cy + 28*scale),
        (cx - 8*scale, cy + 30*scale),
        (cx - 30*scale, cy + 14*scale),
    ]
    builder.open_group(gid=gid, label="protein-blob", cls="protein-blob")
    builder.polygon(
        points,
        fill="#FDE68A",
        stroke="#B45309",
        stroke_width=2.0,
        extra_attrs=' data-object-type="protein-blob" data-label="protein-blob"',
    )
    builder.text(cx, cy, label, size=16, anchor="middle", weight="bold", fill="#78350F")
    builder.close_group()


def _draw_cylinder_blob(builder: SvgBuilder, x: float, y: float, width: float, height: float, label: str, gid: str) -> None:
    builder.open_group(gid=gid, label="nucleic-acid-cylinder", cls="nucleic-acid-cylinder")
    rx = width / 2
    ry = height * 0.22
    top_y = y - height / 2
    bottom_y = y + height / 2

    builder.add(
        f'<ellipse cx="{x + rx:.1f}" cy="{top_y + ry:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" '
        f'fill="#DBEAFE" stroke="#1D4ED8" stroke-width="2.0" '
        f'data-object-type="nucleic-acid-cylinder" data-label="nucleic-acid-cylinder" />'
    )
    builder.add(
        f'<rect x="{x:.1f}" y="{top_y + ry:.1f}" width="{width:.1f}" height="{height - 2*ry:.1f}" '
        f'fill="#DBEAFE" stroke="#1D4ED8" stroke-width="2.0" '
        f'data-object-type="nucleic-acid-cylinder" data-label="nucleic-acid-cylinder" />'
    )
    builder.add(
        f'<ellipse cx="{x + rx:.1f}" cy="{bottom_y - ry:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" '
        f'fill="#BFDBFE" stroke="#1D4ED8" stroke-width="2.0" '
        f'data-object-type="nucleic-acid-cylinder" data-label="nucleic-acid-cylinder" />'
    )
    builder.text(x + width / 2, y, label, size=11, anchor="middle", weight="bold", fill="#1E3A8A")
    builder.close_group()

def _draw_context_glyphs(builder: SvgBuilder, width: int, title_y: float = 28.0) -> None:
    left_cx = 90
    right_x = width - 170
    helix_y = title_y + 20
    protein_y = title_y + 20

    _draw_cylinder_blob(builder, left_cx - 40, helix_y, 80, 90, "NA", "context-na-left")
    _draw_protein_blob(builder, right_x, protein_y, "Protein", "context-protein-right")

    start_x = left_cx + 38
    start_y = helix_y
    end_x = right_x - 48
    end_y = protein_y
    _draw_straight_arrow(builder, start_x, start_y, end_x, end_y, color="#6B7280", shaft_width=8.0, head_len=16.0, head_half_height=10.0)


def description_to_svg(description: str) -> Dict[str, str]:
    parsed = parse_description(description)
    svg = draw_double_stranded(parsed) if parsed.strand_type == "double" else draw_single_stranded(parsed)

    return {
        "svg": svg,
        "strand_type": parsed.strand_type,
        "chemistry": parsed.chemistry,
        "sense_sequence": parsed.sense_seq,
        "antisense_sequence": parsed.antisense_seq or "",
        "title": parsed.title,
        "sense_sugar_modification": parsed.sense_style.sugar_note,
        "sense_backbone": parsed.sense_style.backbone_note,
        "antisense_sugar_modification": parsed.antisense_style.sugar_note,
        "antisense_backbone": parsed.antisense_style.backbone_note,
        "interpretation_source": parsed.interpretation_source,
        "chemistry_recipe": parsed.chemistry_recipe,
        "seed_sequence": parsed.seed_sequence,
        "sequence_source": parsed.sequence_source,
        "chemistry_source": parsed.chemistry_source,
    }


def _main() -> int:
    if works is not None:
        description = str(works.param(1) or "")
        works.resolve(description_to_svg(description))
        return 0

    import sys
    description = sys.argv[1] if len(sys.argv) > 1 else "build an siRNA with ESC chemistry"
    print(json.dumps(description_to_svg(description), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
# Antisense:  1 UGUGAAGCGAAGUGCACACUU
# sense: 2 GUGUGCACUUCGCUUCACAX
# 2'-Fluoro-Ribose		1_2;1_8-1_9;1_14;1_16;2_5;2_7-2_9	9/41
# S Propanetriol (GNA sugar)		1_6	1/41
# 2'-O-Methoxyethyl ribose		1_1;1_3-1_5;1_7;1_10-1_13;1_15;1_17-1_21;2_1-2_4;2_6;2_10-2_20	31/41
# Phosporothioate		1_2-1_3;1_20-1_21;2_2-2_3	6/39
# Phosphate		1_4-1_19;2_4-2_20	33/39


# Antisense:  1 UGUGAAGCGAAGUGCACACUU
# sense: 2 GUGUGCACUUCGCUUCACAX
# 2'-Fluoro-Ribose		1_2;1_8-1_9;1_14;1_16;2_5;2_7-2_9	9/41
# S Propanetriol (GNA sugar)		1_6	1/41
# 2'-O-Methoxyethyl ribose		1_1;1_3-1_5;1_7;1_10-1_13;1_15;1_17-1_21;2_1-2_4;2_6;2_10-2_20	31/41
# Phosporothioate		1_2-1_3;1_20-1_21;2_2-2_3	6/39
# Phosphate		1_4-1_19;2_4-2_20	33/39



# Cᵐ Uᵐ Aᵐ Gᵐ Aᵐ Cᵐ Cᶠ Uᵐ Gᶠ Uᵐ Uᵐ dT Uᵐ Uᵐ Gᵐ Cᵐ Uᵐ Uᵐ Uᵐ Uᵐ Gᵐ Uᵐ
# Am Cf Am Af Af Af Gm Cf Af Am Af Cm Af Gm Gf Um Cf Um Am Gm Am Am 