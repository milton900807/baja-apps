#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from typing import Dict, List, Optional

try:
    from ion import works  # type: ignore
except Exception:
    works = None


SVG_NS = "http://www.w3.org/2000/svg"

BASE_COLORS: Dict[str, str] = {
    "A": "#2563EB",
    "T": "#DC2626",
    "U": "#DC2626",
    "G": "#059669",
    "C": "#7C3AED",
    "N": "#111111",
}

MORPHOLINO_STYLE = {
    "fill": "#FFF7ED",
    "stroke": "#C2410C",
    "text": "#7C2D12",
    "backbone": "#9A3412",
    "annotation": "#374151",
}


@dataclass
class Residue:
    index: int
    base: str
    canonical_base: str
    backbone_to_next: Optional[str]


@dataclass
class Strand:
    name: str
    sequence_5to3: str
    residues: List[Residue]


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


def normalize_canonical_base(base: str) -> str:
    b = re.sub(r"[^A-Za-z]", "", base or "").upper()
    if not b:
        return "N"
    b = b[-1]
    b = b.replace("U", "T")
    return b if b in {"A", "T", "G", "C"} else "N"


def extract_sequence(description: str) -> str:
    s = normalize_quotes_and_dashes(description).upper()

    explicit = re.search(r"5\s*'\s*[-]?\s*([ACGTU\s]+?)\s*[-]?\s*3\s*'", s)
    if explicit:
        seq = re.sub(r"[^ACGTU]", "", explicit.group(1))
        if seq:
            return seq

    matches = re.findall(r"(?:\b[ACGTU][ACGTU\s]{3,}[ACGTU]\b|\b[ACGTU]{4,}\b)", s)
    cleaned = [re.sub(r"[^ACGTU]", "", m) for m in matches]
    cleaned = [x for x in cleaned if x]
    if cleaned:
        return max(cleaned, key=len)

    raise ValueError("No nucleotide sequence found in input.")


def infer_mode(description: str) -> str:
    d = (description or "").lower()
    if "publication" in d or "pub mode" in d:
        return "publication"
    if "teaching" in d or "annotated" in d:
        return "teaching"
    return "teaching"


def build_morpholino_strand(sequence: str, mode: str = "teaching") -> Strand:
    linker_label = "P-N ∅" if mode == "teaching" else None

    residues: List[Residue] = []
    for i, base in enumerate(sequence, start=1):
        residues.append(
            Residue(
                index=i,
                base=base,
                canonical_base=normalize_canonical_base(base),
                backbone_to_next=linker_label if i < len(sequence) else None,
            )
        )
    return Strand(
        name="morpholino",
        sequence_5to3="".join(r.canonical_base for r in residues),
        residues=residues,
    )


class SvgBuilder:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.parts: List[str] = []

    def add(self, s: str) -> None:
        self.parts.append(s)

    def line(
        self,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        stroke_width: float = 2.0,
        stroke: str = "#9CA3AF",
        extra_attrs: str = "",
    ) -> None:
        self.add(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{stroke}" stroke-width="{stroke_width:.1f}"{extra_attrs} />'
        )

    def polygon(
        self,
        points: List[tuple[float, float]],
        fill: str = "#ffffff",
        stroke: str = "#222222",
        stroke_width: float = 2.0,
        extra_attrs: str = "",
    ) -> None:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        self.add(
            f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="{stroke_width:.1f}"{extra_attrs} />'
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

    def hexagon(
        self,
        cx: float,
        cy: float,
        r: float,
        text: str = "",
        text_size: int = 12,
        fill: str = "#ffffff",
        stroke: str = "#222222",
        text_color: str = "#111111",
    ) -> None:
        points: List[tuple[float, float]] = []
        for i in range(6):
            angle_deg = -30 + i * 60
            angle_rad = math.radians(angle_deg)
            x = cx + r * math.cos(angle_rad)
            y = cy + r * math.sin(angle_rad)
            points.append((x, y))

        self.polygon(points, fill=fill, stroke=stroke, stroke_width=2.0)

        safe = xml_escape(text)
        fitted_size = text_size
        max_width = r * 1.55
        for size in range(max(text_size + 4, 18), 7, -1):
            est_width = 0.58 * size * len(text)
            if est_width <= max_width:
                fitted_size = size
                break

        self.add(
            f'<text x="{cx:.1f}" y="{cy + 1:.1f}" font-family="Arial, sans-serif" '
            f'font-size="{fitted_size}" font-weight="bold" text-anchor="middle" '
            f'dominant-baseline="middle" fill="{text_color}">{safe}</text>'
        )

    def finish(self) -> str:
        body = "\n  ".join(self.parts)
        return (
            f'<svg xmlns="{SVG_NS}" width="{self.width}" height="{self.height}" '
            f'viewBox="0 0 {self.width} {self.height}">\n  {body}\n</svg>'
        )


def draw_backbone_segment(
    builder: SvgBuilder,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    monomer_r: float,
    backbone_label: Optional[str],
    mode: str,
) -> None:
    left = x1 + monomer_r * 0.88
    right = x2 - monomer_r * 0.88
    mid = (left + right) / 2.0

    builder.line(
        left,
        y1,
        right,
        y2,
        stroke_width=3.0,
        stroke=MORPHOLINO_STYLE["backbone"],
    )

    if mode == "teaching" and backbone_label:
        builder.text(
            mid,
            y1 + 22,
            backbone_label,
            size=11,
            anchor="middle",
            weight="bold",
            fill=MORPHOLINO_STYLE["backbone"],
        )


def draw_residue(
    builder: SvgBuilder,
    residue: Residue,
    cx: float,
    cy: float,
    monomer_r: float,
    base_offset: float,
) -> None:
    base_y = cy - base_offset

    builder.line(
        cx,
        cy - monomer_r * 0.85,
        cx,
        base_y + 12,
        stroke_width=1.8,
        stroke="#9CA3AF",
    )

    builder.hexagon(
        cx,
        cy,
        monomer_r,
        text="MO",
        text_size=13,
        fill=MORPHOLINO_STYLE["fill"],
        stroke=MORPHOLINO_STYLE["stroke"],
        text_color=MORPHOLINO_STYLE["text"],
    )

    builder.text(
        cx,
        base_y,
        residue.base,
        size=22,
        anchor="middle",
        weight="bold",
        fill=BASE_COLORS.get(residue.canonical_base, "#111111"),
    )


def draw_morpholino_chain(
    sequence: str,
    mode: str = "teaching",
    title: Optional[str] = None,
) -> str:
    strand = build_morpholino_strand(sequence, mode=mode)
    n = len(strand.residues)

    step = 64
    monomer_r = 22
    y = 190
    start_x = 110
    width = max(920, 240 + (n * step))
    height = 340 if mode == "teaching" else 310

    svg = SvgBuilder(width, height)

    if title is None:
        if mode == "teaching":
            title = "Morpholino chain with neutral phosphorodiamidate backbone"
        else:
            title = "Morpholino chain schematic"

    svg.text(width / 2, 28, title, size=22, anchor="middle", weight="bold")

    if mode == "teaching":
        svg.text(
            width / 2,
            55,
            "PMO schematic: morpholine rings linked by phosphorodiamidate groups",
            size=13,
            anchor="middle",
        )
        svg.text(
            width / 2,
            78,
            "∅ indicates nonionic (neutral) backbone",
            size=11,
            anchor="middle",
            fill=MORPHOLINO_STYLE["annotation"],
        )
    else:
        svg.text(
            width / 2,
            55,
            "PMO schematic with morpholine rings and neutral phosphorodiamidate backbone",
            size=13,
            anchor="middle",
        )

    svg.text(34, y, "PMO", size=15, weight="bold")
    svg.text(start_x - 58, y, "5'", size=14, anchor="middle")
    svg.text(start_x + step * (n - 1) + 58, y, "3'", size=14, anchor="middle")

    for i in range(n - 1):
        x1 = start_x + i * step
        x2 = start_x + (i + 1) * step
        draw_backbone_segment(
            svg,
            x1,
            y,
            x2,
            y,
            monomer_r=monomer_r,
            backbone_label=strand.residues[i].backbone_to_next,
            mode=mode,
        )

    for i, residue in enumerate(strand.residues):
        x = start_x + i * step
        draw_residue(svg, residue, x, y, monomer_r=monomer_r, base_offset=62)

    if mode == "teaching":
        legend_x = 60
        legend_y = height - 45

        svg.line(
            legend_x,
            legend_y,
            legend_x + 70,
            legend_y,
            stroke_width=3.0,
            stroke=MORPHOLINO_STYLE["backbone"],
        )
        svg.text(
            legend_x + 82,
            legend_y,
            "∅ = neutral phosphorodiamidate linkage",
            size=11,
            fill=MORPHOLINO_STYLE["annotation"],
        )
    else:
        svg.text(
            width / 2,
            height - 28,
            "Neutral PMO backbone",
            size=11,
            anchor="middle",
            fill=MORPHOLINO_STYLE["annotation"],
        )

    return svg.finish()


def description_to_svg(description: str) -> Dict[str, str]:
    seq = extract_sequence(description)
    mode = infer_mode(description)
    svg = draw_morpholino_chain(seq, mode=mode)

    return {
        "svg": svg,
        "chemistry": "PMO",
        "polymer_type": "Morpholino",
        "sequence": seq,
        "mode": mode,
        "title": (
            "Morpholino chain with neutral phosphorodiamidate backbone"
            if mode == "teaching"
            else "Morpholino chain schematic"
        ),
        "backbone": "neutral phosphorodiamidate",
    }


def _main() -> int:
    if works is not None:
        description = str(works.param(1) or "")
        works.resolve(description_to_svg(description))
        return 0

    import sys

    description = sys.argv[1] if len(sys.argv) > 1 else "5'-ATGCCGT-3' teaching"
    print(json.dumps(description_to_svg(description), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())