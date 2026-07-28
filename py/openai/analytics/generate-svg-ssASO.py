#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

try:
    from ion import works  # type: ignore
except Exception:
    works = None


SVG_NS = "http://www.w3.org/2000/svg"

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

BASE_COLORS: Dict[str, str] = {
    "A": "#2563EB",
    "T": "#DC2626",
    "U": "#DC2626",
    "G": "#059669",
    "C": "#7C3AED",
    "N": "#111111",
}

BASE_TOKEN_RE = re.compile(
    r"^(?:A|C|G|T|U|N|m5C|5mC|m5U|5mU|m6A|m7G|psU|pseudouridine|Y|Ψ)$",
    re.IGNORECASE,
)


def is_base_token(token: str) -> bool:
    return bool(BASE_TOKEN_RE.fullmatch((token or "").strip()))


def split_sequence_tokens(sequence: str) -> List[str]:
    """Return residue display tokens from either plain or hyphen/space-delimited input.

    Examples:
      ACTG -> ["A", "C", "T", "G"]
      A-G-m5C-m5U -> ["A", "G", "5mC", "5mU"]
    """
    raw = normalize_quotes_and_dashes(sequence).strip()
    if not raw:
        return []

    # Delimited modified-base notation, e.g. A-G-m5C-m5U.
    if "-" in raw or re.search(r"\bm[0-9][ACGTU]\b|\b[0-9]m[ACGTU]\b", raw, re.IGNORECASE):
        parts = [p for p in re.split(r"\s*-\s*|\s+", raw) if p]
        tokens = [normalize_base_mod(p) for p in parts]
        if tokens and all(is_base_token(t) for t in tokens):
            return tokens

    # Plain sequence fallback.
    compact = re.sub(r"[^A-Za-z]", "", raw).upper()
    return [ch for ch in compact if ch in {"A", "C", "G", "T", "U", "N"}]


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


@dataclass
class StrandStyle:
    sugar_label: str
    sugar_note: str
    backbone_label: str
    backbone_note: str


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


def xml_escape(txt: str) -> str:
    return (txt or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def normalize_quotes_and_dashes(s: str) -> str:
    return (
        (s or "")
        .replace("’", "'")
        .replace("′", "'")
        .replace("–", "-")
        .replace("—", "-")
    )


def normalize_canonical_base(base: str, chemistry: str) -> str:
    b = re.sub(r"[^A-Za-z]", "", base or "").upper()
    if not b:
        return "N"
    b = b[-1]
    if chemistry == "RNA":
        b = b.replace("T", "U")
        return b if b in {"A", "U", "G", "C"} else "N"
    b = b.replace("U", "T")
    return b if b in {"A", "T", "G", "C"} else "N"


def guess_chemistry(text: str, sequence: str) -> str:
    t = text.upper()
    tokens = split_sequence_tokens(sequence)
    canonical = "".join(base_mod_display_to_canonical(tok, "RNA") for tok in tokens) if tokens else sequence.upper()
    if "RNA" in t:
        return "RNA"
    if "DNA" in t:
        return "DNA"
    if "U" in canonical and "T" not in canonical:
        return "RNA"
    return "DNA"


def canonical_sugar_mod(token: str, default: str = "DNA") -> Tuple[str, str]:
    t = (token or "").strip()
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
    return mapping.get(t, mapping.get(default, ("DNA", "deoxyribose sugar")))


def canonical_backbone(token: str, default: str = "PO") -> Tuple[str, str]:
    t = (token or "").strip()
    if t == "PS":
        return ("PS", "phosphorothioate")
    if t == "PS2":
        return ("PS2", "phosphorodithioate")
    return ("PO", "phosphate")


def monomer_style(label: str) -> Dict[str, str]:
    return MONOMER_COLORS.get(label, MONOMER_COLORS["default"])


def backbone_color(label: str) -> str:
    return {"PO": "#6B7280", "PS": "#B45309", "PS2": "#7C2D12"}.get(label, "#6B7280")


def extract_sequence(description: str) -> str:
    """Extract a sequence string, preserving delimited modified-base tokens."""
    normalized = normalize_quotes_and_dashes(description)

    # Prefer explicit 5'...3' style regions if present. Keep hyphenated tokens intact.
    explicit = re.search(
        r"5\s*'\s*[-]?\s*([A-Za-z0-9Ψψ\s-]+?)\s*[-]?\s*3\s*'",
        normalized,
        re.IGNORECASE,
    )
    if explicit:
        candidate = explicit.group(1).strip()
        if split_sequence_tokens(candidate):
            return candidate

    # Hyphen-delimited residue tokens, e.g. A-G-m5C-m5U-m5U.
    token = r"(?:A|C|G|T|U|N|m5C|5mC|m5U|5mU|m6A|m7G|psU|pseudouridine|Y|Ψ)"
    delimited_runs = re.finditer(
        rf"(?<![A-Za-z0-9])({token}(?:\s*-\s*{token}){{2,}})(?![A-Za-z0-9])",
        normalized,
        re.IGNORECASE,
    )
    candidates = [m.group(1) for m in delimited_runs]
    if candidates:
        return max(candidates, key=lambda x: len(split_sequence_tokens(x)))

    # Otherwise use the longest canonical nucleotide run allowing spaces.
    s = normalized.upper()
    matches = re.findall(r"(?:\b[ACGTU][ACGTU\s]{5,}[ACGTU]\b|\b[ACGTU]{6,}\b)", s)
    cleaned = [re.sub(r"[^ACGTU]", "", m) for m in matches]
    cleaned = [x for x in cleaned if x]
    if cleaned:
        return max(cleaned, key=len)

    raise ValueError("No nucleotide sequence found in input.")


def parse_positions(spec: str) -> List[int]:
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


def fuzzy_sugar(text: str) -> Optional[str]:
    t = text.lower()
    if "2'-o-methyl" in t or "2-ome" in t or "2'ome" in t or "ome" in t:
        return "2'-OMe"
    if "2'-f" in t or "2f" in t or "fluoro" in t:
        return "2'-F"
    if "lna" in t:
        return "LNA"
    if "moe" in t or "methoxyethyl" in t:
        return "MOE"
    if "gna" in t:
        return "GNA"
    if "cet" in t:
        return "cEt"
    if "dna" in t or "deoxy" in t:
        return "DNA"
    if "rna" in t or "ribose" in t:
        return "RNA"
    return None


def fuzzy_backbone(text: str) -> Optional[str]:
    t = text.lower()
    if "ps2" in t or "phosphorodithioate" in t or "dithioate" in t:
        return "PS2"
    if re.search(r"\bps\b", t) or "phosphorothioate" in t or "thioate" in t:
        return "PS"
    if "po backbone" in t or "phosphate backbone" in t or "phosphodiester" in t or re.search(r"\bpo\b", t):
        return "PO"
    return None


def normalize_base_mod(mod: str) -> str:
    m = (mod or "").strip()
    m = m.replace(" ", "")
    aliases = {
        "5MC": "5mC",
        "M5C": "5mC",
        "5MU": "5mU",
        "M5U": "5mU",
        "M6A": "m6A",
        "M7G": "m7G",
        "PSU": "Ψ",
        "PSEUDOURIDINE": "Ψ",
        "Y": "Ψ",
    }
    up = m.upper()
    return aliases.get(up, m)


def base_mod_display_to_canonical(display: str, chemistry: str) -> str:
    d = (display or "").strip()
    if d == "Ψ":
        return "U" if chemistry == "RNA" else "T"
    for ch in reversed(d):
        if ch.upper() in {"A", "C", "G", "T", "U"}:
            return normalize_canonical_base(ch, chemistry)
    return "N"


def build_single_strand(sequence: str, chemistry: str) -> Strand:
    sugar = "RNA" if chemistry == "RNA" else "DNA"
    tokens = split_sequence_tokens(sequence)
    residues: List[Residue] = []
    for i, token in enumerate(tokens, start=1):
        display_base = normalize_base_mod(token)
        residues.append(
            Residue(
                index=i,
                base=display_base,
                canonical_base=base_mod_display_to_canonical(display_base, chemistry),
                sugar=sugar,
                backbone_to_next="PO" if i < len(tokens) else None,
            )
        )
    return Strand(name="sense", sequence_5to3="".join(r.canonical_base for r in residues), residues=residues)


def apply_global_sugar(strand: Strand, sugar: str) -> None:
    for r in strand.residues:
        r.sugar = sugar


def apply_global_backbone(strand: Strand, backbone: str) -> None:
    for i, r in enumerate(strand.residues):
        r.backbone_to_next = backbone if i < len(strand.residues) - 1 else None


def apply_sugar_positions(strand: Strand, positions: List[int], sugar: str) -> None:
    for pos in positions:
        if 1 <= pos <= len(strand.residues):
            strand.residues[pos - 1].sugar = sugar


def apply_backbone_positions(strand: Strand, positions: List[int], backbone: str) -> None:
    for pos in positions:
        if 1 <= pos < len(strand.residues):
            strand.residues[pos - 1].backbone_to_next = backbone


def apply_base_mod_positions(strand: Strand, positions: List[int], base_mod: str, chemistry: str) -> None:
    for pos in positions:
        if 1 <= pos <= len(strand.residues):
            strand.residues[pos - 1].base = base_mod
            strand.residues[pos - 1].canonical_base = base_mod_display_to_canonical(base_mod, chemistry)


def apply_base_mod_all_of_type(strand: Strand, original_base: str, base_mod: str, chemistry: str) -> None:
    target = normalize_canonical_base(original_base, chemistry)
    for r in strand.residues:
        if r.canonical_base == target:
            r.base = base_mod
            r.canonical_base = base_mod_display_to_canonical(base_mod, chemistry)


def parse_modifications(description: str, strand: Strand, chemistry: str) -> str:
    text = normalize_quotes_and_dashes(description)
    notes: List[str] = []

    # Global sugar
    global_sugar_patterns = [
        r"\bfull\s+(2'-OMe|2'-F|LNA|MOE|GNA|cEt|DNA|RNA)\s+sugar\b",
        r"\bfully\s+(2'-OMe|2'-F|LNA|MOE|GNA|cEt|DNA|RNA)\b",
        r"\ball\s+(2'-OMe|2'-F|LNA|MOE|GNA|cEt|DNA|RNA)\s+sugar\b",
    ]
    for pat in global_sugar_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            sugar = fuzzy_sugar(m.group(1)) or m.group(1)
            if sugar in ALLOWED_SUGARS:
                apply_global_sugar(strand, sugar)
                notes.append(f"full sugar={sugar}")
                break

    # Global backbone
    global_backbone_patterns = [
        r"\bfull\s+(PS2|PS|PO)\s+backbone\b",
        r"\bfull\s+(phosphorodithioate|phosphorothioate|phosphate|phosphodiester)\s+backbone\b",
        r"\bfully\s+(PS2|PS|PO)\b",
        r"\ball\s+(PS2|PS|PO)\s+backbone\b",
    ]
    for pat in global_backbone_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            bb = fuzzy_backbone(m.group(1)) or m.group(1).upper()
            if bb in ALLOWED_BACKBONES:
                apply_global_backbone(strand, bb)
                notes.append(f"full backbone={bb}")
                break

    # Position-specific sugar mods
    for m in re.finditer(
        r"\b(2'-OMe|2'-F|LNA|MOE|GNA|cEt|DNA|RNA)\s+(?:at|on)\s+([0-9,\-\s;]+)\b",
        text,
        re.IGNORECASE,
    ):
        sugar = fuzzy_sugar(m.group(1)) or m.group(1)
        positions = parse_positions(m.group(2))
        if sugar in ALLOWED_SUGARS and positions:
            apply_sugar_positions(strand, positions, sugar)
            notes.append(f"{sugar} at {positions}")

    # Position-specific backbone mods
    for m in re.finditer(
        r"\b(PS2|PS|PO|phosphorodithioate|phosphorothioate|phosphate|phosphodiester)\s+(?:at|on)\s+([0-9,\-\s;]+)\b",
        text,
        re.IGNORECASE,
    ):
        bb = fuzzy_backbone(m.group(1)) or m.group(1).upper()
        positions = parse_positions(m.group(2))
        if bb in ALLOWED_BACKBONES and positions:
            apply_backbone_positions(strand, positions, bb)
            notes.append(f"{bb} at link positions {positions}")

    # Position-specific base mods, e.g. 5mC at 2,6
    for m in re.finditer(
        r"\b(5mC|m5C|5mU|m5U|m6A|m7G|pseudouridine|psU|Y|Ψ)\s+(?:at|on)\s+([0-9,\-\s;]+)\b",
        text,
        re.IGNORECASE,
    ):
        mod = normalize_base_mod(m.group(1))
        positions = parse_positions(m.group(2))
        if positions:
            apply_base_mod_positions(strand, positions, mod, chemistry)
            notes.append(f"{mod} at {positions}")

    # All-of-type base mods, e.g. all C are 5mC
    for m in re.finditer(
        r"\ball\s+([ACGTU])\s+(?:are|as)\s+(5mC|m5C|5mU|m5U|m6A|m7G|pseudouridine|psU|Y|Ψ)\b",
        text,
        re.IGNORECASE,
    ):
        original_base = m.group(1).upper()
        mod = normalize_base_mod(m.group(2))
        apply_base_mod_all_of_type(strand, original_base, mod, chemistry)
        notes.append(f"all {original_base} -> {mod}")

    # Inline chemistry hints like "RNA strand" / "DNA strand"
    if not notes:
        notes.append("default uniform chemistry inferred from sequence and prompt")

    return "; ".join(notes)


def style_from_strand(strand: Strand, chemistry: str) -> StrandStyle:
    first = strand.residues[0] if strand.residues else None
    sugar_label, sugar_note = canonical_sugar_mod(first.sugar if first else chemistry, chemistry)
    bb = next((r.backbone_to_next for r in strand.residues if r.backbone_to_next), "PO")
    backbone_label, backbone_note = canonical_backbone(bb, "PO")
    return StrandStyle(
        sugar_label=sugar_label,
        sugar_note=sugar_note,
        backbone_label=backbone_label,
        backbone_note=backbone_note,
    )


def parse_description(description: str) -> ParsedDescription:
    seq = extract_sequence(description)
    chemistry = guess_chemistry(description, seq)
    strand = build_single_strand(seq, chemistry)
    mod_summary = parse_modifications(description, strand, chemistry)
    style = style_from_strand(strand, chemistry)

    return ParsedDescription(
        strand_type="single",
        chemistry=chemistry,
        sense_seq="".join(r.canonical_base for r in strand.residues),
        antisense_seq=None,
        title="Single-stranded oligonucleotide schematic",
        sense_style=style,
        antisense_style=StrandStyle("", "", "", ""),
        interpretation_source="explicit_single_chain_parser_with_modification_interpreter",
        chemistry_recipe=mod_summary,
        seed_sequence="".join(r.canonical_base for r in strand.residues),
        sequence_source="explicit",
        chemistry_source="regex modification interpreter",
        strands=[strand],
    )


class SvgBuilder:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.parts: List[str] = []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def line(self, x1: float, y1: float, x2: float, y2: float, stroke_width: float = 2.0, stroke: str = "#9CA3AF", extra_attrs: str = "") -> None:
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{stroke_width:.1f}"{extra_attrs} />')

    def circle(self, cx: float, cy: float, r: float, text: str = "S", text_size: int = 12, fill: str = "#f7f7f7", stroke: str = "#222", text_color: str = "#111", extra_attrs: str = "") -> None:
        self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="2"{extra_attrs} />')
        safe = xml_escape(text)
        fitted_size = text_size
        max_diameter = r * 2 * 0.82
        for size in range(max(text_size + 4, 18), 7, -1):
            est_width = 0.58 * size * len(text)
            if est_width <= max_diameter:
                fitted_size = size
                break
        self.add(f'<text x="{cx:.1f}" y="{cy + 1:.1f}" font-family="Arial, sans-serif" font-size="{fitted_size}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="{text_color}">{safe}</text>')

    def text(self, x: float, y: float, txt: str, size: int = 16, anchor: str = "start", weight: str = "normal", fill: str = "#111", extra_attrs: str = "") -> None:
        safe = xml_escape(txt)
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" dominant-baseline="middle" fill="{fill}"{extra_attrs}>{safe}</text>')

    def finish(self) -> str:
        body = "\n  ".join(self.parts)
        return f'<svg xmlns="{SVG_NS}" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}">\n  {body}\n</svg>'


def draw_backbone_segment(builder: SvgBuilder, x1: float, y1: float, x2: float, y2: float, sugar_r: float, backbone_label: str) -> None:
    left = x1 + sugar_r
    right = x2 - sugar_r
    mid = (left + right) / 2.0
    builder.line(left, y1, right, y2, stroke_width=2.4, stroke="#D1D5DB")
    builder.text(mid, y1 + 24, backbone_label, size=11, anchor="middle", weight="bold", fill=backbone_color(backbone_label))


def draw_residue(builder: SvgBuilder, residue: Residue, cx: float, cy: float, sugar_r: float, base_offset: float) -> None:
    style = monomer_style(residue.sugar)
    base_y = cy - base_offset
    builder.line(cx, cy - sugar_r, cx, base_y + 11, stroke_width=1.8, stroke="#9CA3AF")
    builder.circle(cx, cy, sugar_r, text=residue.sugar, text_size=13, fill=style["fill"], stroke=style["stroke"], text_color=style["text"])
    builder.text(cx, base_y, residue.base, size=21, anchor="middle", weight="bold", fill=BASE_COLORS.get(residue.canonical_base, "#111111"))


def draw_single_stranded(parsed: ParsedDescription) -> str:
    strand = parsed.strands[0]
    n = len(strand.residues)
    step = 52
    sugar_r = 20
    y = 185
    start_x = 110
    width = max(860, 220 + (n * step))
    height = 300

    svg = SvgBuilder(width, height)
    svg.text(width / 2, 28, parsed.title, size=22, anchor="middle", weight="bold")
    svg.text(width / 2, 55, f"{parsed.chemistry} single-strand schematic", size=13, anchor="middle")
    svg.text(width / 2, 76, f"length = {n} nt", size=11, anchor="middle")

    svg.text(34, y, "sense", size=15, weight="bold")
    svg.text(start_x - 58, y, "5'", size=14, anchor="middle")
    svg.text(start_x + step * (n - 1) + 58, y, "3'", size=14, anchor="middle")

    for i in range(n - 1):
        x1 = start_x + i * step
        x2 = start_x + (i + 1) * step
        bb = strand.residues[i].backbone_to_next or "PO"
        draw_backbone_segment(svg, x1, y, x2, y, sugar_r=sugar_r, backbone_label=bb)

    for i, residue in enumerate(strand.residues):
        x = start_x + i * step
        draw_residue(svg, residue, x, y, sugar_r=sugar_r, base_offset=55)

    return svg.finish()


def description_to_svg(description: str) -> Dict[str, str]:
    parsed = parse_description(description)
    svg = draw_single_stranded(parsed)

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
    description = sys.argv[1] if len(sys.argv) > 1 else "ACTACTAT full PS backbone"
    print(json.dumps(description_to_svg(description), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())