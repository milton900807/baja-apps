#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import copy
import json
import math
import os
import re
from collections import defaultdict
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


OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

RNA_COMPLEMENT: Dict[str, str] = {
    "A": "U",
    "U": "A",
    "G": "C",
    "C": "G",
    "T": "A",  # tolerate T in RNA-ish input
}

DNA_COMPLEMENT: Dict[str, str] = {
    "A": "T",
    "T": "A",
    "G": "C",
    "C": "G",
    "U": "A",  # tolerate U in DNA-ish input
}


@dataclass
class FoldResult:
    method: str
    sequence: str
    chemistry: str
    dot_bracket: str
    pair_count: int
    pairs: List[Tuple[int, int]]
    notes: str


def normalize_sequence(seq: str, chemistry: Optional[str] = None) -> Tuple[str, str]:
    seq = re.sub(r"[^A-Za-z]", "", seq or "").upper()
    if not seq:
        raise ValueError("Empty sequence after normalization")

    if chemistry is None:
        chemistry = "DNA" if ("T" in seq and "U" not in seq) else "RNA"
    chemistry = chemistry.upper()
    if chemistry not in {"RNA", "DNA"}:
        raise ValueError("chemistry must be RNA or DNA")

    if chemistry == "RNA":
        seq = seq.replace("T", "U")
        allowed = {"A", "U", "G", "C"}
    else:
        seq = seq.replace("U", "T")
        allowed = {"A", "T", "G", "C"}

    cleaned = "".join(ch for ch in seq if ch in allowed)
    if not cleaned:
        raise ValueError("Sequence contains no valid bases after normalization")
    return cleaned, chemistry


def complement_table(chemistry: str) -> Dict[str, str]:
    return RNA_COMPLEMENT if chemistry == "RNA" else DNA_COMPLEMENT


def can_pair(base1: str, base2: str, chemistry: str) -> bool:
    return complement_table(chemistry).get(base1) == base2


def parse_dot_bracket(dot_bracket: str) -> List[Tuple[int, int]]:
    stack: List[int] = []
    pairs: List[Tuple[int, int]] = []

    for idx, ch in enumerate(dot_bracket):
        if ch == "(":
            stack.append(idx)
        elif ch == ")":
            if not stack:
                raise ValueError("Invalid dot-bracket: unmatched closing parenthesis")
            left = stack.pop()
            pairs.append((left, idx))
        elif ch != ".":
            raise ValueError(f"Invalid dot-bracket character: {ch!r}")

    if stack:
        raise ValueError("Invalid dot-bracket: unmatched opening parenthesis")

    return sorted(pairs)


def validate_dot_bracket(sequence: str, chemistry: str, dot_bracket: str, min_loop_size: int) -> List[Tuple[int, int]]:
    if len(dot_bracket) != len(sequence):
        raise ValueError("Dot-bracket length must equal sequence length")

    pairs = parse_dot_bracket(dot_bracket)
    for left, right in pairs:
        if right - left - 1 < min_loop_size:
            raise ValueError(
                f"Pair ({left + 1}, {right + 1}) violates minimum loop size {min_loop_size}"
            )
        if not can_pair(sequence[left], sequence[right], chemistry):
            raise ValueError(
                f"Non-Watson-Crick pair at ({left + 1}, {right + 1}): {sequence[left]}-{sequence[right]}"
            )
    return pairs


def score_pairs(sequence: str, pairs: List[Tuple[int, int]], chemistry: str) -> int:
    return sum(1 for left, right in pairs if can_pair(sequence[left], sequence[right], chemistry))


def nussinov_fold(sequence: str, chemistry: str, min_loop_size: int = 3) -> FoldResult:
    """Classic DP fallback that maximizes total canonical base pairs without pseudoknots."""
    n = len(sequence)
    if n == 0:
        return FoldResult("deterministic_nussinov", sequence, chemistry, "", 0, [], "Empty sequence")

    dp = [[0] * n for _ in range(n)]
    traceback: List[List[Optional[Tuple[Any, ...]]]] = [[None] * n for _ in range(n)]

    for span in range(1, n):
        for i in range(n - span):
            j = i + span

            best_score = dp[i + 1][j] if i + 1 <= j else 0
            best_action: Tuple[Any, ...] = ("skip_i", i + 1, j)

            if i <= j - 1 and dp[i][j - 1] > best_score:
                best_score = dp[i][j - 1]
                best_action = ("skip_j", i, j - 1)

            if j - i - 1 >= min_loop_size and can_pair(sequence[i], sequence[j], chemistry):
                paired_score = 1 + (dp[i + 1][j - 1] if i + 1 <= j - 1 else 0)
                if paired_score > best_score:
                    best_score = paired_score
                    best_action = ("pair", i + 1, j - 1)

            for k in range(i, j):
                split_score = dp[i][k] + dp[k + 1][j]
                if split_score > best_score:
                    best_score = split_score
                    best_action = ("split", i, k, k + 1, j)

            dp[i][j] = best_score
            traceback[i][j] = best_action

    structure = ["."] * n
    pairs: List[Tuple[int, int]] = []

    def backtrack(i: int, j: int) -> None:
        if i >= j:
            return
        action = traceback[i][j]
        if action is None:
            return

        tag = action[0]
        if tag == "skip_i":
            backtrack(action[1], action[2])
        elif tag == "skip_j":
            backtrack(action[1], action[2])
        elif tag == "pair":
            structure[i] = "("
            structure[j] = ")"
            pairs.append((i, j))
            backtrack(action[1], action[2])
        elif tag == "split":
            backtrack(action[1], action[2])
            backtrack(action[3], action[4])

    backtrack(0, n - 1)
    pairs.sort()

    return FoldResult(
        method="deterministic_nussinov",
        sequence=sequence,
        chemistry=chemistry,
        dot_bracket="".join(structure),
        pair_count=len(pairs),
        pairs=pairs,
        notes="Dynamic-programming fallback maximizing canonical self-pairs without pseudoknots.",
    )


def ask_openai_for_hairpin(sequence: str, chemistry: str, min_loop_size: int = 3) -> Optional[FoldResult]:
    if OpenAI is None:
        return None
    if not os.getenv("OPENAI_API_KEY"):
        return None

    client = OpenAI()
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "dot_bracket": {"type": "string"},
            "notes": {"type": "string"},
        },
        "required": ["dot_bracket", "notes"],
    }

    instructions = f"""
You are folding ONE contiguous {chemistry} oligonucleotide back onto itself.

Return only JSON matching the schema.

Rules:
- Keep the exact same sequence. Do not mutate, trim, reorder, insert, or delete bases.
- Propose a single non-pseudoknotted secondary structure in dot-bracket notation.
- dot_bracket must be exactly the same length as the sequence.
- Only use canonical Watson-Crick pairs.
- Respect a minimum loop size of {min_loop_size} unpaired nucleotides.
- Maximize the total number of canonical self-pairs.
- Prefer one dominant hairpin/stem-loop when ties exist.
""".strip()

    response = client.responses.create(
        model=OPENAI_MODEL,
        instructions=instructions,
        input=f"Sequence ({chemistry}): {sequence}",
        text={
            "format": {
                "type": "json_schema",
                "name": "hairpin_fold",
                "schema": schema,
                "strict": True,
            }
        },
    )

    data = json.loads(response.output_text)
    dot_bracket = data["dot_bracket"]
    notes = data["notes"]
    pairs = validate_dot_bracket(sequence, chemistry, dot_bracket, min_loop_size)

    return FoldResult(
        method="openai",
        sequence=sequence,
        chemistry=chemistry,
        dot_bracket=dot_bracket,
        pair_count=score_pairs(sequence, pairs, chemistry),
        pairs=pairs,
        notes=notes,
    )


def choose_best_result(results: List[FoldResult]) -> FoldResult:
    if not results:
        raise RuntimeError("No folding results available")
    return max(results, key=lambda r: (r.pair_count, -r.dot_bracket.count("."), r.method == "openai"))


def paired_bases(sequence: str, pairs: List[Tuple[int, int]]) -> List[Dict[str, object]]:
    return [
        {
            "left_index_1based": left + 1,
            "right_index_1based": right + 1,
            "left_base": sequence[left],
            "right_base": sequence[right],
            "pair": f"{sequence[left]}-{sequence[right]}",
        }
        for left, right in pairs
    ]


# ---------------------------------------------------------------------------
# Shape translation helpers
# ---------------------------------------------------------------------------

def _first_circle_in_svg_group(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if obj.get("type") != "svg_group":
        return None
    for s in obj.get("shapes", []):
        if isinstance(s, dict) and s.get("type") == "circle":
            return s
    return None


def object_anchor_x(obj: Dict[str, Any]) -> Optional[float]:
    t = obj.get("type")
    if t == "line":
        x1 = obj.get("x1")
        x2 = obj.get("x2")
        if isinstance(x1, (int, float)) and isinstance(x2, (int, float)):
            return (float(x1) + float(x2)) / 2.0
        if isinstance(x1, (int, float)):
            return float(x1)
    if t == "text":
        x = obj.get("x")
        if isinstance(x, (int, float)):
            return float(x)
    if t == "svg_group":
        circ = _first_circle_in_svg_group(obj)
        if circ is not None and isinstance(circ.get("cx"), (int, float)):
            return float(circ["cx"])
    if t == "circle":
        x = obj.get("cx")
        if isinstance(x, (int, float)):
            return float(x)
    return None


def object_anchor_y(obj: Dict[str, Any]) -> Optional[float]:
    t = obj.get("type")
    if t == "svg_group":
        circ = _first_circle_in_svg_group(obj)
        if circ is not None and isinstance(circ.get("cy"), (int, float)):
            return float(circ["cy"])
    if t == "circle":
        y = obj.get("cy")
        if isinstance(y, (int, float)):
            return float(y)
    if t == "line":
        y1 = obj.get("y1")
        y2 = obj.get("y2")
        if isinstance(y1, (int, float)) and isinstance(y2, (int, float)):
            return (float(y1) + float(y2)) / 2.0
        if isinstance(y1, (int, float)):
            return float(y1)
    if t == "text":
        y = obj.get("y")
        if isinstance(y, (int, float)):
            return float(y)
    return None


def translate_shape_object(obj: Dict[str, Any], dx: float, dy: float) -> None:
    for key in ("x", "x1", "x2", "cx", "xf"):
        if isinstance(obj.get(key), (int, float)):
            obj[key] += dx
    for key in ("y", "y1", "y2", "cy", "yf"):
        if isinstance(obj.get(key), (int, float)):
            obj[key] += dy

    if isinstance(obj.get("pts"), list):
        for p in obj["pts"]:
            if isinstance(p, dict):
                if isinstance(p.get("x"), (int, float)):
                    p["x"] += dx
                if isinstance(p.get("y"), (int, float)):
                    p["y"] += dy

    if isinstance(obj.get("shapes"), list):
        for child in obj["shapes"]:
            if isinstance(child, dict):
                translate_shape_object(child, dx, dy)


def bucket_objects_into_nucleotides(objects: List[Dict[str, Any]], tol: float = 0.5) -> List[Dict[str, Any]]:
    """
    Groups the flat SVG-ish object array into one bucket per nucleotide using
    shared x-center. This matches the repeated line + svg_group + text pattern
    in the sample input.
    """
    buckets: Dict[float, List[Dict[str, Any]]] = defaultdict(list)

    def quantize(x: float) -> float:
        return round(x / tol) * tol

    for obj in objects:
        ax = object_anchor_x(obj)
        if ax is None:
            continue
        buckets[quantize(ax)].append(obj)

    groups: List[Dict[str, Any]] = []
    for x in sorted(buckets.keys()):
        objs = buckets[x]
        ay = None
        for obj in objs:
            ay = object_anchor_y(obj)
            if ay is not None:
                break
        groups.append({
            "orig_x": x,
            "orig_y": 0.0 if ay is None else ay,
            "objects": objs,
        })
    return groups


def build_partner_map(pairs: List[Tuple[int, int]], n: int) -> List[int]:
    partner = [-1] * n
    for i, j in pairs:
        partner[i] = j
        partner[j] = i
    return partner


def compute_hairpin_layout(
    n: int,
    pairs: List[Tuple[int, int]],
    center_x: float = 0.0,
    base_y: float = 0.0,
    stem_gap: float = 140.0,
    rise: float = 56.0,
    loop_radius: float = 80.0,
) -> List[Tuple[float, float]]:
    """
    Places paired bases into two stem columns and unpaired loop bases on an arc.
    """
    targets: List[Optional[Tuple[float, float]]] = [None] * n
    partner = build_partner_map(pairs, n)

    stem_pairs = sorted(pairs, key=lambda p: (p[0], -p[1]))
    if not stem_pairs:
        return [(center_x + i * 48.0, base_y) for i in range(n)]

    left_x = center_x - stem_gap / 2.0
    right_x = center_x + stem_gap / 2.0

    for level, (i, j) in enumerate(stem_pairs):
        y = base_y + level * rise
        targets[i] = (left_x, y)
        targets[j] = (right_x, y)

    inner_i, inner_j = stem_pairs[-1]
    loop_indices = [k for k in range(inner_i + 1, inner_j) if partner[k] == -1]

    if loop_indices:
        loop_cx = center_x
        loop_cy = base_y + (len(stem_pairs) - 1) * rise
        m = len(loop_indices)
        for idx, k in enumerate(loop_indices):
            theta = math.pi / 2.0 if m == 1 else math.pi - (math.pi * idx / (m - 1))
            x = loop_cx + loop_radius * math.cos(theta)
            y = loop_cy + loop_radius * math.sin(theta)
            targets[k] = (x, y)

    for i in range(n):
        if targets[i] is None:
            targets[i] = (center_x, base_y)

    return [(x, y) for x, y in targets]  # type: ignore[misc]


def translate_objects_to_hairpin(
    original_objects: List[Dict[str, Any]],
    pairs: List[Tuple[int, int]],
    center_x: float = 0.0,
    base_y: float = 0.0,
    stem_gap: float = 140.0,
    rise: float = 56.0,
    loop_radius: float = 80.0,
) -> Dict[str, Any]:
    translated = copy.deepcopy(original_objects)
    nucleotide_groups = bucket_objects_into_nucleotides(translated)
    n = len(nucleotide_groups)

    if n == 0:
        return {
            "translated_objects": translated,
            "layout_debug": {
                "nucleotide_count": 0,
                "group_count": 0,
            },
        }

    targets = compute_hairpin_layout(
        n=n,
        pairs=pairs,
        center_x=center_x,
        base_y=base_y,
        stem_gap=stem_gap,
        rise=rise,
        loop_radius=loop_radius,
    )

    for idx, group in enumerate(nucleotide_groups):
        if idx >= len(targets):
            break
        old_x = float(group["orig_x"])
        old_y = float(group["orig_y"])
        new_x, new_y = targets[idx]

        dx = new_x - old_x
        dy = new_y - old_y

        for obj in group["objects"]:
            translate_shape_object(obj, dx, dy)

    return {
        "translated_objects": translated,
        "layout_debug": {
            "nucleotide_count": n,
            "group_count": len(nucleotide_groups),
            "target_count": len(targets),
            "stem_pair_count": len(pairs),
            "layout_params": {
                "center_x": center_x,
                "base_y": base_y,
                "stem_gap": stem_gap,
                "rise": rise,
                "loop_radius": loop_radius,
            },
        },
    }


def fold_sequence(payload: object) -> Dict[str, object]:
    objects: List[Dict[str, Any]] = []
    center_x = 0.0
    base_y = 0.0
    stem_gap = 140.0
    rise = 56.0
    loop_radius = 80.0

    if isinstance(payload, dict):
        raw_sequence = str(payload.get("sequence") or payload.get("chain") or payload.get("input") or "")
        chemistry = payload.get("chemistry")
        min_loop_size = int(payload.get("min_loop_size", 3))
        raw_objects = payload.get("objects") or []
        if isinstance(raw_objects, list):
            objects = raw_objects

        layout = payload.get("layout") or {}
        if isinstance(layout, dict):
            center_x = float(layout.get("center_x", center_x))
            base_y = float(layout.get("base_y", base_y))
            stem_gap = float(layout.get("stem_gap", stem_gap))
            rise = float(layout.get("rise", rise))
            loop_radius = float(layout.get("loop_radius", loop_radius))
    else:
        raw_sequence = str(payload or "")
        chemistry = None
        min_loop_size = 3

    sequence, chemistry = normalize_sequence(raw_sequence, chemistry)

    deterministic = nussinov_fold(sequence, chemistry, min_loop_size=min_loop_size)
    candidates = [deterministic]

    openai_error: Optional[str] = None
    try:
        openai_result = ask_openai_for_hairpin(sequence, chemistry, min_loop_size=min_loop_size)
        if openai_result is not None:
            candidates.append(openai_result)
    except Exception as exc:
        openai_error = str(exc)

    best = choose_best_result(candidates)

    translated_objects: List[Dict[str, Any]] = []
    layout_debug: Dict[str, Any] = {}
    translation_error = ""

    try:
        if objects:
            translated_payload = translate_objects_to_hairpin(
                original_objects=objects,
                pairs=best.pairs,
                center_x=center_x,
                base_y=base_y,
                stem_gap=stem_gap,
                rise=rise,
                loop_radius=loop_radius,
            )
            translated_objects = translated_payload.get("translated_objects", [])
            layout_debug = translated_payload.get("layout_debug", {})
    except Exception as exc:
        translation_error = str(exc)

    return {
        "input_sequence": raw_sequence,
        "normalized_sequence": best.sequence,
        "chemistry": best.chemistry,
        "best_method": best.method,
        "dot_bracket": best.dot_bracket,
        "watson_crick_pair_count": best.pair_count,
        "pairs": paired_bases(best.sequence, best.pairs),
        "translated_objects": translated_objects,
        "layout_debug": layout_debug,
        "notes": best.notes,
        "openai_error": openai_error or "",
        "translation_error": translation_error,
    }


def _main() -> int:
    if works is not None:
        incoming = works.param(1)
        works.resolve(fold_sequence(incoming))
        return 0

    import sys

    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: python hairpin_fold_ionworks_modified.py '<sequence>' [RNA|DNA] OR python hairpin_fold_ionworks_modified.py payload.json"
        )

    payload: object
    if len(sys.argv) == 2 and sys.argv[1].lower().endswith(".json"):
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            payload = json.load(f)
    elif len(sys.argv) >= 3:
        payload = {"sequence": sys.argv[1], "chemistry": sys.argv[2]}
    else:
        payload = sys.argv[1]

    print(json.dumps(fold_sequence(payload), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
