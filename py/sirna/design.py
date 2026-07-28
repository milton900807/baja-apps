#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Tuple

from ion import works

RNA_BASES = set("AUGC")
DNA_OR_RNA_BASES = set("AUGCT")


@dataclass
class Candidate:
    rank: int
    start: int
    end: int
    length: int

    target_site_rna: str
    target_site_input_alphabet: str

    sense_strand: str
    antisense_strand: str

    sense_core_rna: str
    antisense_core_rna: str

    sense_overhang: str
    antisense_overhang: str

    sense_duplex: str
    antisense_duplex: str

    gc_percent: float
    score: float
    notes: List[str] = field(default_factory=list)


def clean_sequence(seq: str) -> str:
    """
    Accept RNA or DNA sequence, optionally pasted from FASTA.
    Converts T -> U internally.
    """
    seq = str(seq or "").strip()

    lines = seq.splitlines()
    lines = [line.strip() for line in lines if line.strip() and not line.startswith(">")]
    seq = "".join(lines).upper()

    seq = re.sub(r"[\s\-]+", "", seq)
    seq = seq.replace("T", "U")

    invalid = set(seq) - RNA_BASES
    if invalid:
        raise ValueError(f"Sequence contains invalid characters: {sorted(invalid)}")

    return seq


def complement_rna(seq: str) -> str:
    table = str.maketrans("AUGC", "UACG")
    return seq.translate(table)


def reverse_complement_rna(seq: str) -> str:
    return complement_rna(seq)[::-1]


def to_requested_alphabet(seq_rna: str, alphabet: str) -> str:
    """
    Output RNA by default. If caller wants DNA-style display, convert U -> T.
    """
    if alphabet.upper() == "DNA":
        return seq_rna.replace("U", "T")
    return seq_rna


def normalize_overhang(overhang: str, output_alphabet: str) -> str:
    """
    Overhangs are applied AFTER analysis and are treated as display/synthesis strings.

    We preserve explicit chemistry-like notation such as:
      - dTdT
      - dTdT
      - UU
      - TT
      - ""
    We only normalize plain nucleotide-only strings to the requested alphabet when sensible.
    """
    s = str(overhang or "").strip()
    if not s:
        return ""

    # If it contains chemistry notation, leave it alone.
    if re.search(r"[^ACGTU]", s, re.IGNORECASE):
        return s

    s = s.upper()

    if set(s) - DNA_OR_RNA_BASES:
        raise ValueError(f"Invalid overhang characters: {sorted(set(s) - DNA_OR_RNA_BASES)}")

    if output_alphabet.upper() == "DNA":
        return s.replace("U", "T")
    return s.replace("T", "U")


def gc_fraction(seq: str) -> float:
    return sum(1 for b in seq if b in "GC") / len(seq)


def count_au(seq: str) -> int:
    return sum(1 for b in seq if b in "AU")


def count_gc(seq: str) -> int:
    return sum(1 for b in seq if b in "GC")


def longest_run_of_pattern(seq: str, allowed: set[str]) -> int:
    longest = 0
    current = 0
    for base in seq:
        if base in allowed:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def longest_homopolymer(seq: str) -> int:
    if not seq:
        return 0
    longest = 1
    current = 1
    for i in range(1, len(seq)):
        if seq[i] == seq[i - 1]:
            current += 1
            longest = max(longest, current)
        else:
            current = 1
    return longest


def score_gc(gc: float) -> Tuple[float, str]:
    if 0.30 <= gc <= 0.50:
        bonus = 20 - abs(gc - 0.40) * 50
        return bonus, f"GC favorable ({gc * 100:.1f}%)"
    if 0.25 <= gc < 0.30 or 0.50 < gc <= 0.55:
        return 8, f"GC acceptable but not ideal ({gc * 100:.1f}%)"
    if 0.20 <= gc < 0.25 or 0.55 < gc <= 0.60:
        return -5, f"GC suboptimal ({gc * 100:.1f}%)"
    return -20, f"GC poor ({gc * 100:.1f}%)"


def score_antisense_pos1(antisense: str) -> Tuple[float, str]:
    if antisense[0] in "AU":
        return 10, f"Antisense 5' base favorable ({antisense[0]})"
    return -8, f"Antisense 5' base less favorable ({antisense[0]})"


def score_sense_pos1(sense: str) -> Tuple[float, str]:
    if sense[0] in "GC":
        return 8, f"Sense 5' base favorable ({sense[0]})"
    return -5, f"Sense 5' base less favorable ({sense[0]})"


def score_seed_au(antisense: str) -> Tuple[float, str]:
    """
    Antisense seed region = positions 2-8 (1-based).
    Assumes antisense core is provided in 5'->3' orientation.
    """
    seed = antisense[1:8]
    au = count_au(seed)
    if au >= 5:
        return 12, f"Seed AU-rich ({au}/7 AU)"
    if au == 4:
        return 6, f"Seed moderately AU-rich ({au}/7 AU)"
    if au == 3:
        return 0, f"Seed intermediate AU content ({au}/7 AU)"
    return -10, f"Seed GC-heavy ({au}/7 AU)"


def score_terminal_asymmetry(sense: str, antisense: str) -> Tuple[float, str]:
    """
    Approximate thermodynamic asymmetry using terminal composition.
    Scored on CORE duplex only, excluding overhangs.
    """
    anti_au = count_au(antisense[:4])
    sense_gc = count_gc(sense[:4])

    score = 0.0
    if anti_au >= 3:
        score += 10
    elif anti_au == 2:
        score += 4
    else:
        score -= 6

    if sense_gc >= 3:
        score += 8
    elif sense_gc == 2:
        score += 3
    else:
        score -= 5

    return score, (
        f"Terminal asymmetry approx (core only): antisense 5' AU={anti_au}/4, "
        f"sense 5' GC={sense_gc}/4"
    )


def score_repeats_and_runs(seq: str) -> Tuple[float, List[str]]:
    total = 0.0
    notes: List[str] = []

    hp = longest_homopolymer(seq)
    if hp >= 4:
        total -= (hp - 3) * 5
        notes.append(f"Homopolymer run too long (max {hp})")

    gc_run = longest_run_of_pattern(seq, {"G", "C"})
    if gc_run >= 4:
        total -= (gc_run - 3) * 4
        notes.append(f"Long GC stretch (max {gc_run})")

    dinuc_repeat_found = False
    for i in range(len(seq) - 5):
        window = seq[i:i + 6]
        if len(set(window[::2])) == 1 and len(set(window[1::2])) == 1 and window == window[:2] * 3:
            dinuc_repeat_found = True
            break
    if dinuc_repeat_found:
        total -= 6
        notes.append("Simple dinucleotide repeat detected")

    if not notes:
        notes.append("No problematic long repeats/GC runs")

    return total, notes


def make_antisense_core_from_target(target_site_rna: str, strand: int) -> str:
    """
    User-requested rule:
    - target sequence is always the scanned input window as-is
    - forward strand  (strand = 1): antisense = reverse_complement(target)
    - reverse strand  (strand = -1): antisense = complement(target)
    """
    if strand == 1:
        return reverse_complement_rna(target_site_rna)
    if strand == -1:
        return complement_rna(target_site_rna)
    raise ValueError("strand must be either -1 or 1")


def score_candidate_core(target_site_rna: str, strand: int) -> Tuple[float, List[str], str]:
    """
    Score CORE duplex only.
    Overhangs are intentionally excluded and attached later.
    """
    sense_core = target_site_rna
    antisense_core = make_antisense_core_from_target(target_site_rna, strand)

    total = 0.0
    notes: List[str] = []

    gc = gc_fraction(sense_core)
    s, note = score_gc(gc)
    total += s
    notes.append(note)

    s, note = score_antisense_pos1(antisense_core)
    total += s
    notes.append(note)

    s, note = score_sense_pos1(sense_core)
    total += s
    notes.append(note)

    s, note = score_seed_au(antisense_core)
    total += s
    notes.append(note)

    s, note = score_terminal_asymmetry(sense_core, antisense_core)
    total += s
    notes.append(note)

    s, extra = score_repeats_and_runs(sense_core)
    total += s
    notes.extend(extra)

    notes.append(
        "Antisense core derivation: "
        + ("reverse_complement(target)" if strand == 1 else "complement(target)")
    )
    notes.append("3' overhangs applied after scoring")

    return round(total, 2), notes, antisense_core


def apply_overhang(core: str, overhang: str) -> str:
    """
    Apply 3' overhang after analysis/scoring.
    """
    return core + (overhang or "")


def generate_candidates(
    long_mrna_sequence: str,
    lengths: Iterable[int] = (21, 22, 23),
    output_alphabet: str = "RNA",
    strand: int = 1,
    sense_overhang: str = "UU",
    antisense_overhang: str = "UU",
) -> List[Candidate]:
    """
    Slide across a long sequence and score every candidate window.

    Input may be DNA or RNA.
    Internally everything is normalized to RNA (T -> U).

    Important:
    - target site is always the scanned input window as-is
    - antisense core depends on strand
    - overhangs are NOT part of scoring; they are attached afterward
    """
    seq_rna = clean_sequence(long_mrna_sequence)

    lengths = list(lengths)
    if any(length not in {21, 22, 23} for length in lengths):
        raise ValueError("Only lengths 21, 22, and 23 are supported.")

    if strand not in (-1, 1):
        raise ValueError("strand must be either -1 or 1")

    sense_overhang_display = normalize_overhang(sense_overhang, output_alphabet)
    antisense_overhang_display = normalize_overhang(antisense_overhang, output_alphabet)

    results: List[Candidate] = []

    for length in lengths:
        for i in range(0, len(seq_rna) - length + 1):
            target_site_rna = seq_rna[i:i + length]
            sense_core_rna = target_site_rna
            score, notes, antisense_core_rna = score_candidate_core(target_site_rna, strand)

            sense_core_display = to_requested_alphabet(sense_core_rna, output_alphabet)
            antisense_core_display = to_requested_alphabet(antisense_core_rna, output_alphabet)

            sense_duplex = apply_overhang(sense_core_display, sense_overhang_display)
            antisense_duplex = apply_overhang(antisense_core_display, antisense_overhang_display)

            results.append(
                Candidate(
                    rank=0,
                    start=i,
                    end=i + length,
                    length=length,

                    target_site_rna=target_site_rna,
                    target_site_input_alphabet=to_requested_alphabet(target_site_rna, output_alphabet),

                    sense_strand=sense_core_display,
                    antisense_strand=antisense_core_display,

                    sense_core_rna=sense_core_rna,
                    antisense_core_rna=antisense_core_rna,

                    sense_overhang=sense_overhang_display,
                    antisense_overhang=antisense_overhang_display,

                    sense_duplex=sense_duplex,
                    antisense_duplex=antisense_duplex,

                    gc_percent=round(gc_fraction(sense_core_rna) * 100, 2),
                    score=score,
                    notes=notes,
                )
            )

    results.sort(key=lambda x: x.score, reverse=True)

    for idx, candidate in enumerate(results, start=1):
        candidate.rank = idx

    return results





def parse_request(payload: Any) -> Dict[str, Any]:
    """
    Supports:
      1. plain string input = long mRNA/DNA sequence
      2. dict input:
         {
           "sequence": "ATGCT.... or AUGCU....",
           "top_n": 10,
           "lengths": [21, 22, 23],
           "output_alphabet": "RNA" | "DNA",
           "strand": -1 | 1,
           "overhangs": {
               "sense": "dTdT",
               "antisense": "TT"
           }
         }

    Semantics:
      - target sequence is always the scanned input window as-is
      - strand =  1 -> antisense core = reverse_complement(target)
      - strand = -1 -> antisense core = complement(target)
      - overhangs are attached after scoring
      - unspecified overhang side defaults to empty string
    """
    if isinstance(payload, str):
        return {
            "sequence": payload,
            "top_n": 10,
            "lengths": [21, 22, 23],
            "output_alphabet": "RNA",
            "strand": 1,
            "overhangs": {
                "sense": "",
                "antisense": "",
            },
        }

    if isinstance(payload, dict):
        strand = int(payload.get("strand", 1))
        if strand not in (-1, 1):
            raise ValueError("strand must be either -1 or 1")

        overhangs = payload.get("overhangs", {}) or {}
        if not isinstance(overhangs, dict):
            raise ValueError("overhangs must be an object with keys 'sense' and/or 'antisense'")

        # Important behavior:
        # - if only sense is provided, antisense stays ""
        # - if only antisense is provided, sense stays ""
        # - nothing is auto-filled
        return {
            "sequence": payload.get("sequence", ""),
            "top_n": int(payload.get("top_n", 10)),
            "lengths": payload.get("lengths", [21, 22, 23]),
            "output_alphabet": str(payload.get("output_alphabet", "RNA")).upper(),
            "strand": strand,
            "overhangs": {
                "sense": str(overhangs.get("sense", "")),
                "antisense": str(overhangs.get("antisense", "")),
            },
        }

    raise ValueError("Input must be either a sequence string or a JSON object.")


def design_sirna_sites(payload: Any) -> Dict[str, Any]:
    request = parse_request(payload)

    raw_sequence = request["sequence"]
    top_n = request["top_n"]
    lengths = request["lengths"]
    output_alphabet = request["output_alphabet"]
    strand = request["strand"]
    sense_overhang = request["overhangs"]["sense"]
    antisense_overhang = request["overhangs"]["antisense"]

    normalized_rna = clean_sequence(raw_sequence)

    all_candidates = generate_candidates(
        long_mrna_sequence=raw_sequence,
        lengths=lengths,
        output_alphabet=output_alphabet,
        strand=strand,
        sense_overhang=sense_overhang,
        antisense_overhang=antisense_overhang,
    )

    top_candidates = all_candidates[:top_n]

    return {
        "input_sequence_original": re.sub(r"\s+", "", str(raw_sequence).upper()),
        "input_sequence_normalized_rna": normalized_rna,
        "input_length": len(normalized_rna),
        "input_handling": "Input may be RNA or DNA. Any T bases are normalized to U internally before scoring.",
        "strand": strand,
        "strand_handling": (
            "target sequence is always the scanned input window as-is; "
            "strand = 1 uses antisense core = reverse_complement(target); "
            "strand = -1 uses antisense core = complement(target)."
        ),
        "top_n": top_n,
        "lengths_scanned": list(lengths),
        "output_alphabet": output_alphabet,
        "overhangs": {
            "sense": normalize_overhang(sense_overhang, output_alphabet),
            "antisense": normalize_overhang(antisense_overhang, output_alphabet),
        },
        "overhang_handling": (
            "3' overhangs are excluded from analysis/scoring and attached only after "
            "core siRNA candidates are ranked."
        ),
        "total_candidates": len(all_candidates),
        "scoring_model": {
            "windowing": "Slides across the full input sequence and scores every 21-23 nt candidate window.",
            "core_only": True,
            "gc_rule": "Prefer 30-50% GC",
            "strand_selection_rules": [
                "Prefer A/U at antisense position 1",
                "Prefer G/C at sense position 1",
                "Prefer AU-rich antisense seed (positions 2-8)",
                "Prefer lower stability at antisense 5' end and higher stability at sense 5' end"
            ],
            "penalties": [
                "Long homopolymers",
                "Long GC stretches",
                "Simple dinucleotide repeats"
            ],
            "note": "Thermodynamic asymmetry is approximated from terminal nucleotide composition of the core duplex, not including overhangs."
        },
        "top_candidates": [asdict(c) for c in top_candidates],
    }


def _main() -> int:
    payload = works.param(1)
    works.resolve(design_sirna_sites(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())