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
except Exception:
    works = None

try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore

SVG_NS = "http://www.w3.org/2000/svg"
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

RNA_COMPLEMENT: Dict[str, str] = {"A": "U", "U": "A", "G": "C", "C": "G", "T": "A"}
DNA_COMPLEMENT: Dict[str, str] = {"A": "T", "T": "A", "G": "C", "C": "G", "U": "A"}

ALLOWED_SUGARS = {"RNA", "DNA", "2'-OMe", "2'-F", "LNA", "MOE", "GNA", "cEt"}
ALLOWED_BACKBONES = {"PO", "PS", "PS2"}

MONOMER_COLORS: Dict[str, Dict[str, str]] = {
    "RNA": {"fill": "#E8F4FD", "stroke": "#1D4ED8", "text": "#0F172A"},
    "DNA": {"fill": "#F3F4F6", "stroke": "#4B5563", "text": "#111827"},
    "2'-OMe": {"fill": "#ECFDF3", "stroke": "#16A34A", "text": "#052E16"},
    "2'-F": {"fill": "#FEF3C7", "stroke": "#D97706", "text": "#451A03"},
    "LNA": {"fill": "#FCE7F3", "stroke": "#BE185D", "text": "#500724"},
    "MOE": {"fill": "#F3E8FF", "stroke": "#7C3AED", "text": "#2E1065"},
    "GNA": {"fill": "#E0F2FE", "stroke": "#0891B2", "text": "#083344"},
    "cEt": {"fill": "#FFF1F2", "stroke": "#E11D48", "text": "#4C0519"},
    "default": {"fill": "#F7F7F7", "stroke": "#222222", "text": "#111111"},
}
BASE_COLORS: Dict[str, str] = {"A": "#2563EB", "U": "#DC2626", "T": "#DC2626", "G": "#059669", "C": "#7C3AED", "N": "#111111"}
PAIR_LINE_COLORS: Dict[str, str] = {"AU": "#2563EB", "UA": "#2563EB", "AT": "#2563EB", "TA": "#2563EB", "GC": "#059669", "CG": "#059669"}

# Case-sensitive token parsing:
# - Lowercase suffix m means 2'-OMe, e.g. Tm.
# - Lowercase suffix f means 2'-F, e.g. Af.
# - Uppercase sequence letters remain normal bases.
RESIDUE_TOKEN_RE = re.compile(
    r"^(?:(?P<prefix_sugar>d|r))?"
    r"(?P<base_mod>5m|m5)?"
    r"(?P<base>[ACGTUacgtu])"
    r"(?P<suffix_sugar>m|f|d|dna|rna|lna|moe|gna|cet|ome|omethyl|2f)?$"
)
TOKEN_RE = re.compile(
    r"(?:(?:d|r)?(?:5m|m5)?[ACGTUacgtu](?:m|f|d|dna|rna|lna|moe|gna|cet|ome|omethyl|2f)?)"
)
PLAIN_SEQ_RE = re.compile(r"\b[ACGTUacgtu](?:[ACGTUacgtu]|m|f){5,}\b")
INDEX_SPEC_RE = re.compile(r"(\d+)_([0-9]+(?:-[0-9]+)?)")
BASE_MOD_DISPLAY = {"5M": "5m", "M5": "5m", "": ""}


@dataclass
class Residue:
    index: int
    base: str
    canonical_base: str
    sugar: str
    backbone_to_next: Optional[str]


@dataclass
class Strand:
    name: str
    sequence_5to3: str
    residues: List[Residue]
    source_chain_index: int = 0


@dataclass
class StrandStyle:
    sugar_label: str
    sugar_note: str
    backbone_label: str
    backbone_note: str


@dataclass
class AlignmentResult:
    strand1: Strand
    strand2: Strand
    display_shift: int
    best_contiguous_run: int
    total_matches: int
    total_overlap: int
    orientation_note: str
    overhang_left_1: int
    overhang_right_1: int
    overhang_left_2: int
    overhang_right_2: int


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
    duplex_display_shift: int = 0
    best_contiguous_run: int = 0


def xml_escape(txt: str) -> str:
    return (txt or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def monomer_style(label: str) -> Dict[str, str]:
    return MONOMER_COLORS.get(label, MONOMER_COLORS["default"])


def backbone_color(label: str) -> str:
    return {"PO": "#6B7280", "PS": "#B45309", "PS2": "#7C2D12"}.get(label, "#6B7280")


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


def normalize_base_label(base_mod: str, canonical_base: str, chemistry: str, preserve_explicit: bool = False) -> str:
    mod = BASE_MOD_DISPLAY.get((base_mod or "").upper(), "")
    base = normalize_canonical_base(canonical_base, chemistry, preserve_explicit=preserve_explicit)
    return "N" if base == "N" else f"{mod}{base}"


def _token_to_sugar(token_suffix: str, chemistry: str) -> str:
    s = (token_suffix or "").strip().lower().replace("-", "")
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


def residue_token_to_parts(token: str, chemistry: str, preserve_explicit: bool = False) -> Tuple[str, str, str]:
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


def canonical_backbone(token: str, default: str = "PO") -> Tuple[str, str]:
    t = (token or "").strip()
    if t == "PS":
        return ("PS", "phosphorothioate")
    if t == "PS2":
        return ("PS2", "phosphorodithioate")
    return ("PO", "phosphate")


def canonical_sugar_mod(token: str, default: str = "RNA") -> Tuple[str, str]:
    t = (token or "").strip()
    if t not in ALLOWED_SUGARS:
        t = default
    mapping = {
        "2'-OMe": ("2'-OMe", "2'-O-methyl sugar"),
        "2'-F": ("2'-F", "2'-fluoro sugar"),
        "LNA": ("LNA", "locked nucleic acid sugar"),
        "MOE": ("MOE", "2'-O-methoxyethyl sugar"),
        "GNA": ("GNA", "glycol nucleic acid sugar"),
        "cEt": ("cEt", "constrained ethyl sugar"),
        "DNA": ("DNA", "deoxyribose sugar"),
        "RNA": ("RNA", "ribose sugar"),
    }
    return mapping[t]


def _guess_chemistry_from_tokens(tokens: List[str]) -> str:
    joined = " ".join(tokens).upper()
    return "DNA" if ("T" in joined and "U" not in joined) else "RNA"


def _expand_positions(spec: str) -> List[int]:
    values: List[int] = []
    for part in re.split(r"[;,]\s*", spec.strip()):
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            try:
                start = int(a)
                end = int(b)
            except Exception:
                continue
            if start <= end:
                values.extend(range(start, end + 1))
            else:
                values.extend(range(start, end - 1, -1))
        else:
            try:
                values.append(int(part))
            except Exception:
                pass
    return values


def _split_modified_sequence(seq: str) -> List[str]:
    """Split compact oligo notation into residue tokens.

    Supported examples:
    - GCGTCATTGTCACTGGTCmTmT -> G C G T C ... C Tm Tm T
    - mGmCGmGUCAUUmGUCAmCUGGUCmUmU -> Gm Cm G Gm U C A U U Gm U C A Cm U G G U C Um Um
    - AfGmC -> Af Gm C

    Lowercase prefix/suffix m means 2'-OMe.
    Lowercase prefix/suffix f means 2'-F.
    Uppercase A/C/G/T/U are normal bases.
    """
    tokens: List[str] = []
    i = 0
    while i < len(seq):
        prefix_mod = ""

        # Prefix notation: mG, mC, mU, fA, etc.
        if seq[i] in {"m", "f"} and i + 1 < len(seq) and seq[i + 1].upper() in {"A", "C", "G", "T", "U"}:
            prefix_mod = seq[i]
            i += 1

        if i >= len(seq):
            break

        base = seq[i]
        if base.upper() not in {"A", "C", "G", "T", "U"}:
            i += 1
            continue

        token = base.upper()
        i += 1

        # Suffix notation: Gm, Cf, etc. Prefix wins if both are present.
        suffix_mod = ""
        if i < len(seq) and seq[i] in {"m", "f"}:
            suffix_mod = seq[i]
            i += 1

        mod = prefix_mod or suffix_mod
        if mod:
            token += mod

        tokens.append(token)
    return tokens


def _extract_sequence_blocks(description: str) -> List[List[str]]:
    blocks: List[List[str]] = []

    # Accept JSON-ish inputs too, for example:
    # {"chain1": "GCGTCATTGTCACTGGTCmTmT", "chain2": "CGCAGTAACAGTGACCAG"}
    try:
        data = json.loads(description)
        if isinstance(data, dict):
            vals: List[str] = []
            for key in (
                "chain1",
                "sense",
                "strand1",
                "sequence1",
                "seq1",
                "chain2",
                "antisense",
                "strand2",
                "sequence2",
                "seq2",
            ):
                v = data.get(key)
                if isinstance(v, str) and PLAIN_SEQ_RE.search(v):
                    vals.append(v)
            plain = [p for v in vals for p in PLAIN_SEQ_RE.findall(v)]
            if len(plain) >= 2:
                return [_split_modified_sequence(plain[0]), _split_modified_sequence(plain[1])]
    except Exception:
        pass

    for raw_line in description.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        candidate = line.split(":", 1)[1].strip() if ":" in line else line

        plain = PLAIN_SEQ_RE.findall(candidate)
        if len(plain) >= 2:
            return [_split_modified_sequence(plain[0]), _split_modified_sequence(plain[1])]
        if len(plain) == 1:
            blocks.append(_split_modified_sequence(plain[0]))
            continue

        tokens = [m.group(0) for m in TOKEN_RE.finditer(candidate)]
        if len(tokens) >= 2:
            blocks.append(tokens)

    if len(blocks) >= 2:
        return blocks[:2]

    plain_all = PLAIN_SEQ_RE.findall(description)
    if len(plain_all) >= 2:
        return [_split_modified_sequence(plain_all[0]), _split_modified_sequence(plain_all[1])]

    return []


def _tokens_to_strand(name: str, tokens: List[str], chemistry: str, source_chain_index: int) -> Strand:
    residues: List[Residue] = []
    seq_parts: List[str] = []
    for i, token in enumerate(tokens, start=1):
        display_base, canonical_base, sugar = residue_token_to_parts(token, chemistry, preserve_explicit=False)
        residues.append(Residue(index=i, base=display_base, canonical_base=canonical_base, sugar=sugar, backbone_to_next="PO"))
        seq_parts.append(canonical_base)
    if residues:
        residues[-1].backbone_to_next = None
    return Strand(name=name, sequence_5to3="".join(seq_parts), residues=residues, source_chain_index=source_chain_index)


def _reverse_strand_preserving_mods(strand: Strand) -> Strand:
    residues = [
        Residue(index=i + 1, base=r.base, canonical_base=r.canonical_base, sugar=r.sugar, backbone_to_next="PO")
        for i, r in enumerate(reversed(strand.residues))
    ]
    if residues:
        residues[-1].backbone_to_next = None
    return Strand(name=strand.name, sequence_5to3="".join(r.canonical_base for r in residues), residues=residues, source_chain_index=strand.source_chain_index)


def _complementary_match(base1: str, base2: str, chemistry: str) -> bool:
    table = RNA_COMPLEMENT if chemistry == "RNA" else DNA_COMPLEMENT
    b1 = normalize_canonical_base(base1, chemistry)
    b2 = normalize_canonical_base(base2, chemistry)
    return table.get(b1, "N") == b2


def _alignment_metrics(first_seq: str, second_actual_5to3: str, chemistry: str, shift: int) -> Tuple[int, int, int]:
    second_facing = second_actual_5to3[::-1]
    matches = 0
    overlap = 0
    longest = 0
    current = 0
    for i, base1 in enumerate(first_seq):
        j = i - shift
        if 0 <= j < len(second_facing):
            overlap += 1
            if _complementary_match(base1, second_facing[j], chemistry):
                matches += 1
                current += 1
                longest = max(longest, current)
            else:
                current = 0
        else:
            current = 0
    return matches, overlap, longest


def _best_duplex_alignment_longest_run(first_seq: str, second_actual_5to3: str, chemistry: str) -> Tuple[int, int, int, int]:
    second_facing = second_actual_5to3[::-1]
    best_key: Optional[Tuple[int, int, int, int, int]] = None
    best_shift = 0
    best_matches = 0
    best_overlap = 0
    best_longest = 0
    for shift in range(-len(second_facing), len(first_seq) + 1):
        matches, overlap, longest = _alignment_metrics(first_seq, second_actual_5to3, chemistry, shift)
        if overlap == 0:
            continue
        key = (longest, matches, overlap, -abs(shift), -shift)
        if best_key is None or key > best_key:
            best_key = key
            best_shift = shift
            best_matches = matches
            best_overlap = overlap
            best_longest = longest
    if best_key is None:
        return 0, 0, 0, 0
    return best_shift, best_matches, best_overlap, best_longest


def _compute_overhangs(len1: int, len2: int, shift: int) -> Tuple[int, int, int, int]:
    start1 = max(0, shift)
    end1 = min(len1, shift + len2)
    start2 = max(0, -shift)
    end2 = min(len2, len1 - shift)
    return start1, max(0, len1 - end1), start2, max(0, len2 - end2)


def _optimize_duplex_alignment_only_reverse(first_strand: Strand, second_strand: Strand, chemistry: str) -> AlignmentResult:
    first_variants = [("as-written", first_strand), ("reversed", _reverse_strand_preserving_mods(first_strand))]
    second_variants = [("as-written", second_strand), ("reversed", _reverse_strand_preserving_mods(second_strand))]
    best_result = None
    for first_label, first_variant in first_variants:
        for second_label, second_variant in second_variants:
            shift, matches, overlap, longest = _best_duplex_alignment_longest_run(first_variant.sequence_5to3, second_variant.sequence_5to3, chemistry)
            transform_penalty = int(first_label != "as-written") + int(second_label != "as-written")
            key = (longest, matches, overlap, -transform_penalty, -abs(shift))
            note = f"alignment maximized for the longest contiguous run; chain1={first_label}, chain2={second_label}"
            candidate = (key, first_variant, second_variant, shift, longest, matches, overlap, note)
            if best_result is None or candidate[0] > best_result[0]:
                best_result = candidate
    if best_result is None:
        return AlignmentResult(first_strand, second_strand, 0, 0, 0, 0, "no valid duplex alignment found", 0, 0, 0, 0)
    _, best_first, best_second, best_shift, best_longest, best_matches, best_overlap, best_note = best_result
    oh1l, oh1r, oh2l, oh2r = _compute_overhangs(len(best_first.residues), len(best_second.residues), best_shift)
    return AlignmentResult(
        strand1=best_first,
        strand2=best_second,
        display_shift=best_shift,
        best_contiguous_run=best_longest,
        total_matches=best_matches,
        total_overlap=best_overlap,
        orientation_note=best_note,
        overhang_left_1=oh1l,
        overhang_right_1=oh1r,
        overhang_left_2=oh2l,
        overhang_right_2=oh2r,
    )


def _fuzzy_sugar(name: str) -> Optional[str]:
    n = (name or "").lower()
    if "fluoro" in n or "2'-f" in n or "2f" in n:
        return "2'-F"
    if "omethoxyethyl" in n or "moe" in n:
        return "MOE"
    if "o-methyl" in n or "omethyl" in n or "ome" in n:
        return "2'-OMe"
    if "lna" in n:
        return "LNA"
    if "gna" in n or "propanetriol" in n:
        return "GNA"
    if "cet" in n:
        return "cEt"
    if "dna" in n or "deoxy" in n:
        return "DNA"
    if "rna" in n or "ribose" in n:
        return "RNA"
    return None


def _fuzzy_backbone(name: str) -> Optional[str]:
    n = (name or "").lower()
    if "dithio" in n:
        return "PS2"
    if "thio" in n:
        return "PS"
    if "phosphate" in n or "phosphodiester" in n:
        return "PO"
    return None


def _apply_positions_to_strand_sugar(strand: Strand, positions: List[int], sugar: str) -> None:
    for pos in positions:
        if 1 <= pos <= len(strand.residues):
            strand.residues[pos - 1].sugar = sugar


def _apply_positions_to_strand_backbone(strand: Strand, positions: List[int], backbone: str) -> None:
    for pos in positions:
        if 1 <= pos < len(strand.residues):
            strand.residues[pos - 1].backbone_to_next = backbone


def _parse_mods_regex(description: str, strands_by_source: Dict[int, Strand]) -> Tuple[List[str], List[str]]:
    sugar_notes: List[str] = []
    backbone_notes: List[str] = []
    for raw_line in description.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        sugar = _fuzzy_sugar(line)
        backbone = _fuzzy_backbone(line)
        if not sugar and not backbone:
            continue
        matches = INDEX_SPEC_RE.findall(line)
        if not matches:
            continue
        by_chain: Dict[int, List[int]] = {}
        for chain_idx_txt, spec in matches:
            chain_idx = int(chain_idx_txt)
            by_chain.setdefault(chain_idx, []).extend(_expand_positions(spec))
        for chain_idx, positions in by_chain.items():
            strand = strands_by_source.get(chain_idx)
            if strand is None:
                continue
            if sugar:
                _apply_positions_to_strand_sugar(strand, positions, sugar)
            if backbone:
                _apply_positions_to_strand_backbone(strand, positions, backbone)
        if sugar:
            sugar_notes.append(f"parsed sugar modification line: {line}")
        if backbone:
            backbone_notes.append(f"parsed backbone modification line: {line}")
    return sugar_notes, backbone_notes


def _call_openai_json(prompt: str, instructions: str, schema: Dict[str, Any]) -> Dict[str, Any]:
    if OpenAI is None:
        raise RuntimeError("openai package is not installed")
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    response = client.responses.create(
        model=OPENAI_MODEL,
        instructions=instructions,
        input=prompt,
        text={"format": {"type": "json_schema", "name": schema["name"], "schema": schema["schema"], "strict": True}},
    )
    return json.loads(response.output_text)


def _apply_modifications_with_openai(description: str, strands_by_source: Dict[int, Strand], chemistry: str) -> str:
    schema = {
        "name": "oligo_modification_map",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "summary": {"type": "string"},
                "default_chain_1_sugar": {"type": "string", "enum": list(ALLOWED_SUGARS)},
                "default_chain_2_sugar": {"type": "string", "enum": list(ALLOWED_SUGARS)},
                "sugar_modifications": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "chain_index": {"type": "integer"},
                            "positions": {"type": "array", "items": {"type": "integer"}},
                            "sugar": {"type": "string", "enum": list(ALLOWED_SUGARS)},
                        },
                        "required": ["chain_index", "positions", "sugar"],
                    },
                },
                "backbone_modifications": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "chain_index": {"type": "integer"},
                            "positions": {"type": "array", "items": {"type": "integer"}},
                            "backbone": {"type": "string", "enum": list(ALLOWED_BACKBONES)},
                        },
                        "required": ["chain_index", "positions", "backbone"],
                    },
                },
            },
            "required": ["summary", "default_chain_1_sugar", "default_chain_2_sugar", "sugar_modifications", "backbone_modifications"],
        },
    }
    chain_payload = {
        "chemistry": chemistry,
        "chain_1_length": len(strands_by_source[1].residues),
        "chain_2_length": len(strands_by_source[2].residues),
        "chain_1_tokens_5to3": [r.base for r in strands_by_source[1].residues],
        "chain_2_tokens_5to3": [r.base for r in strands_by_source[2].residues],
        "prompt": description,
    }
    instructions = '''
You parse oligonucleotide chemistry instructions into explicit position-based modifications.
Rules:
- There are exactly two chains, numbered 1 and 2 in the order they appear in the prompt.
- Count all positions from each chain's own 5' end exactly as written before any later alignment/reversal.
- Preserve sequence identities; only assign sugar and backbone modifications.
- If a line like 1_2-1_3 appears for phosphorothioate/phosphate, that means backbone links starting at those positions.
- Use the closest allowed sugar enum and backbone enum.
- Unspecified positions should stay at the default chain sugar and phosphate backbone.
- Return only JSON matching the schema.
'''
    try:
        data = _call_openai_json(json.dumps(chain_payload), instructions, schema)
        default_1 = data.get("default_chain_1_sugar", "RNA")
        default_2 = data.get("default_chain_2_sugar", "RNA")
        for residue in strands_by_source[1].residues:
            if residue.sugar not in ALLOWED_SUGARS:
                residue.sugar = default_1
        for residue in strands_by_source[2].residues:
            if residue.sugar not in ALLOWED_SUGARS:
                residue.sugar = default_2
        for item in data.get("sugar_modifications", []):
            chain_idx = int(item["chain_index"])
            if chain_idx in strands_by_source:
                _apply_positions_to_strand_sugar(strands_by_source[chain_idx], [int(x) for x in item["positions"]], str(item["sugar"]))
        for item in data.get("backbone_modifications", []):
            chain_idx = int(item["chain_index"])
            if chain_idx in strands_by_source:
                _apply_positions_to_strand_backbone(strands_by_source[chain_idx], [int(x) for x in item["positions"]], str(item["backbone"]))
        return str(data.get("summary", "modifications parsed with OpenAI"))
    except Exception:
        sugar_notes, backbone_notes = _parse_mods_regex(description, strands_by_source)
        notes = sugar_notes + backbone_notes
        return "; ".join(notes) if notes else "no explicit modification instructions parsed"


def _style_from_strand(strand: Strand, chemistry: str) -> StrandStyle:
    first = strand.residues[0] if strand.residues else None
    sugar_label, sugar_note = canonical_sugar_mod(first.sugar if first else ("RNA" if chemistry == "RNA" else "DNA"), chemistry)
    bb = next((r.backbone_to_next for r in strand.residues if r.backbone_to_next), "PO")
    backbone_label, backbone_note = canonical_backbone(bb, "PO")
    return StrandStyle(sugar_label=sugar_label, sugar_note=sugar_note, backbone_label=backbone_label, backbone_note=backbone_note)


def parse_description(description: str) -> ParsedDescription:
    sequence_blocks = _extract_sequence_blocks(description)
    if len(sequence_blocks) < 2:
        raise ValueError(f"Expected two explicit sequence chains separated by whitespace or placed on separate lines. Got: {description[:200]!r}")
    flat_tokens = sequence_blocks[0] + sequence_blocks[1]
    chemistry = _guess_chemistry_from_tokens(flat_tokens)
    chain1 = _tokens_to_strand("chain1", sequence_blocks[0], chemistry, source_chain_index=1)
    chain2 = _tokens_to_strand("chain2", sequence_blocks[1], chemistry, source_chain_index=2)
    strands_by_source = {1: chain1, 2: chain2}
    mod_summary = _apply_modifications_with_openai(description, strands_by_source, chemistry)
    aln = _optimize_duplex_alignment_only_reverse(chain1, chain2, chemistry)
    aln.strand1.name = "sense"
    aln.strand2.name = "antisense"
    sense_style = _style_from_strand(aln.strand1, chemistry)
    antisense_style = _style_from_strand(aln.strand2, chemistry)
    recipe = (
        f"{aln.orientation_note}; longest contiguous run={aln.best_contiguous_run}; "
        f"total matches={aln.total_matches}/{aln.total_overlap}; "
        f"overhangs are preserved as contiguous chain extensions: "
        f"chain1(left={aln.overhang_left_1}, right={aln.overhang_right_1}), "
        f"chain2(left={aln.overhang_left_2}, right={aln.overhang_right_2}); "
        f"modification parsing: {mod_summary}"
    )
    return ParsedDescription(
        strand_type="double",
        chemistry=chemistry,
        sense_seq=aln.strand1.sequence_5to3,
        antisense_seq=aln.strand2.sequence_5to3,
        title="Explicit two-chain duplex with preserved overhangs",
        sense_style=sense_style,
        antisense_style=antisense_style,
        interpretation_source="explicit_two_chain_parser_with_longest_run_alignment",
        chemistry_recipe=recipe,
        seed_sequence=aln.strand1.sequence_5to3,
        sequence_source="explicit",
        chemistry_source="OpenAI + regex modification interpreter",
        strands=[aln.strand1, aln.strand2],
        duplex_display_shift=aln.display_shift,
        best_contiguous_run=aln.best_contiguous_run,
    )


class SvgBuilder:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.parts: List[str] = []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def line(self, x1: float, y1: float, x2: float, y2: float, dashed: bool = False, stroke_width: float = 2.0, stroke: str = "#9CA3AF", extra_attrs: str = "") -> None:
        dash = ' stroke-dasharray="5 4"' if dashed else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{stroke_width:.1f}"{dash}{extra_attrs} />')

    def circle(self, cx: float, cy: float, r: float, text: str = "S", text_size: int = 12, fill: str = "#f7f7f7", stroke: str = "#222", text_color: str = "#111", extra_attrs: str = "") -> None:
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="2"{extra_attrs} />')
        safe = xml_escape(text)
        fitted_size = text_size
        max_diameter = r * 2 * 0.85
        for size in range(max(text_size + 4, 18), 7, -1):
            est_width = 0.62 * size * len(text)
            if est_width <= max_diameter and size <= max_diameter:
                fitted_size = size
                break
        self.add(f'<text x="{cx:.1f}" y="{cy + 1:.1f}" font-family="Arial, sans-serif" font-size="{fitted_size}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="{text_color}">{safe}</text>')

    def text(self, x: float, y: float, txt: str, size: int = 16, anchor: str = "start", weight: str = "normal", fill: str = "#111", extra_attrs: str = "") -> None:
        safe = xml_escape(txt)
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" dominant-baseline="middle" fill="{fill}"{extra_attrs}>{safe}</text>')

    def finish(self) -> str:
        body = "\n  ".join(self.parts)
        return f'<svg xmlns="{SVG_NS}" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}">\n  {body}\n</svg>'


def _pair_line_color(base1: str, base2: str, chemistry: str) -> str:
    b1 = normalize_canonical_base(base1, chemistry)
    b2 = normalize_canonical_base(base2, chemistry)
    return PAIR_LINE_COLORS.get(f"{b1}{b2}", "#9CA3AF")


def _best_vertical_bottom_shift(top_seq_5to3: str, bottom_seq_5to3: str, chemistry: str) -> Tuple[int, int, int]:
    bottom_facing = bottom_seq_5to3[::-1]
    best_key: Optional[Tuple[int, int, int, int, int]] = None
    best_shift = 0
    best_matches = 0
    best_overlap = 0
    for shift in range(-len(bottom_facing), len(top_seq_5to3) + 1):
        matches, overlap, longest = _alignment_metrics(top_seq_5to3, bottom_seq_5to3, chemistry, shift)
        if overlap == 0:
            continue
        key = (longest, matches, overlap, -abs(shift), -shift)
        if best_key is None or key > best_key:
            best_key = key
            best_shift = shift
            best_matches = matches
            best_overlap = overlap
    return best_shift, best_matches, best_overlap


def _draw_backbone_segment(builder: SvgBuilder, x1: float, y1: float, x2: float, y2: float, sugar_r: float, backbone_label: str, show_label_above: bool) -> None:
    left = x1 + sugar_r
    right = x2 - sugar_r
    mid = (left + right) / 2.0
    builder.line(left, y1, right, y2, stroke_width=2.2, stroke="#D1D5DB")
    builder.text(mid, y1 - 18 if show_label_above else y1 + 18, backbone_label, size=11, anchor="middle", weight="bold", fill=backbone_color(backbone_label))


def _draw_residue_nucleotide(builder: SvgBuilder, residue: Residue, cx: float, cy: float, sugar_r: float, base_offset: float, show_bases_above: bool) -> Tuple[float, float, float, float]:
    sugar_text_size = 14 if len(residue.sugar) > 4 else 15
    style = monomer_style(residue.sugar)
    base_y = cy - base_offset if show_bases_above else cy + base_offset
    connector_y1 = cy - sugar_r if show_bases_above else cy + sugar_r
    connector_y2 = base_y + 9 if show_bases_above else base_y - 9
    builder.line(cx, connector_y1, cx, connector_y2, stroke_width=1.8, stroke="#9CA3AF")
    builder.circle(cx, cy, sugar_r, text=residue.sugar, text_size=sugar_text_size, fill=style["fill"], stroke=style["stroke"], text_color=style["text"])
    builder.text(cx, base_y, residue.base, size=24, anchor="middle", weight="bold", fill=BASE_COLORS.get(residue.canonical_base, "#111111"))
    return (cx, cy, cx, base_y)


def _draw_strand_from_residues(builder: SvgBuilder, residues: List[Residue], y: float, show_bases_above: bool, left_to_right: bool, strand_label: str, five_prime_left: bool, start_x: float) -> List[Tuple[float, float, float, float]]:
    n = len(residues)
    step = 48
    sugar_r = 20
    base_offset = 52
    coords: List[Tuple[float, float, float, float]] = []
    draw_residues = residues if left_to_right else list(reversed(residues))
    builder.text(34, y, strand_label, size=15, weight="bold")
    builder.text(start_x - 58, y, "5'" if five_prime_left else "3'", size=14, anchor="middle")
    builder.text(start_x + step * (n - 1) + 58, y, "3'" if five_prime_left else "5'", size=14, anchor="middle")
    for i in range(n - 1):
        x1 = start_x + i * step
        x2 = start_x + (i + 1) * step
        bb = draw_residues[i].backbone_to_next or "PO"
        _draw_backbone_segment(builder, x1, y, x2, y, sugar_r=sugar_r, backbone_label=bb, show_label_above=show_bases_above)
    for i, residue in enumerate(draw_residues):
        coords.append(_draw_residue_nucleotide(builder, residue, start_x + i * step, y, sugar_r, base_offset, show_bases_above))
    return coords


def draw_double_stranded(parsed: ParsedDescription) -> str:
    sense = next(s for s in parsed.strands if s.name == "sense")
    antisense = next(s for s in parsed.strands if s.name == "antisense")
    step = 48
    y_top = 145
    y_bottom = 275
    display_shift, vertical_matches, vertical_overlap = _best_vertical_bottom_shift(sense.sequence_5to3, antisense.sequence_5to3, parsed.chemistry)
    base_start_x = 110
    sense_start_x = base_start_x + max(0, -display_shift) * step
    antisense_start_x = base_start_x + max(0, display_shift) * step
    right_extent_nt = max(max(0, -display_shift) + len(sense.residues), max(0, display_shift) + len(antisense.residues))
    width = max(820, 200 + right_extent_nt * step)
    height = 340
    svg = SvgBuilder(width, height)
    svg.text(width / 2, 28, parsed.title, size=22, anchor="middle", weight="bold")
    svg.text(width / 2, 55, f"{parsed.chemistry} duplex schematic with preserved explicit residues", size=13, anchor="middle")
    svg.text(width / 2, 76, f"longest contiguous run={parsed.best_contiguous_run}; overhangs kept intact", size=11, anchor="middle")
    top_coords = [(sense_start_x + i * step, y_top) for i in range(len(sense.residues))]
    bottom_coords = [(antisense_start_x + i * step, y_bottom) for i in range(len(antisense.residues))]
    for i in range(len(sense.residues)):
        j = i - display_shift
        if not (0 <= j < len(antisense.residues)):
            continue
        antisense_base = antisense.sequence_5to3[len(antisense.residues) - 1 - j]
        if not _complementary_match(sense.sequence_5to3[i], antisense_base, parsed.chemistry):
            continue
        tx, ty = top_coords[i]
        bx, by = bottom_coords[j]
        svg.line(tx, ty + 10, bx, by - 10, dashed=True, stroke_width=1.6, stroke=_pair_line_color(sense.sequence_5to3[i], antisense_base, parsed.chemistry))
    _draw_strand_from_residues(svg, sense.residues, y_top, True, True, "sense", True, sense_start_x)
    _draw_strand_from_residues(svg, antisense.residues, y_bottom, False, False, "antisense", False, antisense_start_x)
    return svg.finish()


def description_to_svg(description: str) -> Dict[str, str]:
    parsed = parse_description(description)
    svg = draw_double_stranded(parsed)
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

    description = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else (
        "GCGTCATTGTCACTGGTCmTmT\nCGCAGTAACAGTGACCAG"
    )
    print(json.dumps(description_to_svg(description), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
