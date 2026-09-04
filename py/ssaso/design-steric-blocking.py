#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ion import works


RNA_BASES = set("AUGC")
ALLOWED_BACKBONES = {"PS", "PO"}
ALLOWED_FULL_MODIFICATIONS = {"LNA", "2'-OMe", "2'-MOE", "RNA", "DNA"}

# Default HELM monomer symbols
DEFAULT_HELM_SYMBOLS = {
    "DNA": "d",
    "2'-MOE": "moe",
    "RNA": "r",
    "LNA": "lna",
    "2'-OMe": "m",
}


@dataclass
class StericBlockingASOCandidate:
    rank: int
    start: int
    end: int
    length: int

    target_site_rna: str
    target_site_input_alphabet: str

    antisense_core_rna: str
    antisense_display: str

    gc_percent: float
    tm_c: float

    full_modification: str
    backbone_pattern: List[str]

    chemistry_layout: List[Dict[str, Any]]
    structure: str
    annotations_overlapping: List[Dict[str, Any]] = field(default_factory=list)
    annotation_summary: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)
    score: float = 0.0


def clean_sequence(seq: str) -> str:
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
    if str(alphabet).upper() == "DNA":
        return seq_rna.replace("U", "T")
    return seq_rna


def gc_fraction(seq: str) -> float:
    return sum(1 for b in seq if b in "GC") / len(seq)


def estimate_tm_wallace(seq: str) -> float:
    au = sum(1 for b in seq if b in "AU")
    gc = sum(1 for b in seq if b in "GC")
    return float(2 * au + 4 * gc)


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


def longest_g_run(seq: str) -> int:
    longest = 0
    current = 0
    for ch in seq:
        if ch == "G":
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def has_cpg_motif(seq: str) -> bool:
    seq_dna = seq.replace("U", "T")
    return "CG" in seq_dna


def is_palindrome(seq: str, min_len: int = 6) -> bool:
    rc = reverse_complement_rna(seq)
    if len(seq) < min_len:
        return False
    return seq == rc


def max_self_complementary_stretch(seq: str) -> int:
    rc = reverse_complement_rna(seq)
    n = len(seq)
    m = len(rc)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    best = 0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if seq[i - 1] == rc[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
                best = max(best, dp[i][j])
    return best


def has_simple_repeat(seq: str) -> bool:
    if longest_homopolymer(seq) >= 4:
        return True

    for i in range(len(seq) - 5):
        window = seq[i:i + 6]
        if len(set(window[::2])) == 1 and len(set(window[1::2])) == 1 and window == window[:2] * 3:
            return True

    return False


def build_backbone_pattern(length: int, default_backbone: str = "PS", po_positions: Iterable[int] = ()) -> List[str]:
    pattern = [default_backbone] * (length - 1)
    for p in po_positions:
        if 1 <= p <= length - 1:
            pattern[p - 1] = "PO"
    return pattern


def build_chemistry_layout(
    antisense_display: str,
    full_modification: str,
    backbone_pattern: List[str],
) -> List[Dict[str, Any]]:
    layout = []
    n = len(antisense_display)

    for i in range(1, n + 1):
        layout.append({
            "position": i,
            "base": antisense_display[i - 1],
            "region": "full_length",
            "sugar": full_modification,
            "backbone_to_next": backbone_pattern[i - 1] if i <= n - 1 else None,
        })

    return layout


def score_gc(gc: float) -> Tuple[float, str]:
    if 0.40 <= gc <= 0.60:
        bonus = 20 - abs(gc - 0.50) * 50
        return bonus, f"GC favorable ({gc*100:.1f}%)"
    if 0.35 <= gc < 0.40 or 0.60 < gc <= 0.65:
        return 8, f"GC acceptable but not ideal ({gc*100:.1f}%)"
    return -15, f"GC outside preferred range ({gc*100:.1f}%)"


def score_tm(tm: float) -> Tuple[float, str]:
    if 55 <= tm <= 75:
        bonus = 18 - abs(tm - 65) * 1.2
        return bonus, f"Tm favorable for tight steric-blocking binding ({tm:.1f}C)"
    if 50 <= tm < 55 or 75 < tm <= 80:
        return 6, f"Tm acceptable but not ideal ({tm:.1f}C)"
    return -12, f"Tm outside preferred range ({tm:.1f}C)"


def score_offtarget_toxicity_rules(seq: str) -> Tuple[float, List[str]]:
    total = 0.0
    notes: List[str] = []

    if has_cpg_motif(seq):
        total -= 8
        notes.append("Contains CpG motif")

    g_run = longest_g_run(seq)
    if g_run >= 4:
        total -= (g_run - 3) * 6
        notes.append(f"Long G run detected (max {g_run})")

    if is_palindrome(seq, min_len=6):
        total -= 10
        notes.append("Palindrome / strong self-symmetry detected")

    self_comp = max_self_complementary_stretch(seq)
    if self_comp >= 6:
        total -= (self_comp - 5) * 3
        notes.append(f"Self-complementary stretch detected (max {self_comp})")

    if has_simple_repeat(seq):
        total -= 8
        notes.append("Repetitive sequence detected")

    if not notes:
        notes.append("No major CpG / long G run / palindrome / repeat liabilities detected")

    return total, notes


def normalize_annotation_type(value: Any) -> str:
    raw = str(value or "generic").strip()
    key = raw.lower().replace("_", "-")
    aliases = {
        "splice donor": "splice_donor",
        "splice acceptor": "splice_acceptor",
        "donor": "splice_donor",
        "acceptor": "splice_acceptor",
        "ese": "ese",
        "ess": "ess",
        "iss": "iss",
        "ise": "ise",
        "protein binding": "protein_binding",
        "protein-binding": "protein_binding",
        "rbp": "protein_binding",
        "start codon": "start_codon",
        "stop codon": "stop_codon",
        "uorf": "uorf",
        "microrna": "mirna_site",
        "mirna": "mirna_site",
        "miRNA": "mirna_site",
    }
    return aliases.get(key, raw)


def normalize_annotation_weight(weight: Any, default: float = 0.0) -> float:
    if weight is None:
        return float(default)
    try:
        return float(weight)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid annotation weight: {weight}") from exc


def default_annotation_weight(annotation_type: str) -> float:
    weights = {
        "splice_donor": 30.0,
        "splice_acceptor": 30.0,
        "ese": 16.0,
        "ess": 14.0,
        "iss": 12.0,
        "ise": 12.0,
        "protein_binding": 10.0,
        "mirna_site": 10.0,
        "start_codon": 14.0,
        "stop_codon": 8.0,
        "uorf": 6.0,
        "generic": 0.0,
    }
    return weights.get(annotation_type, 0.0)


def normalize_annotations(annotations: Any, seq_len: int) -> List[Dict[str, Any]]:
    if annotations in (None, ""):
        return []
    if not isinstance(annotations, list):
        raise ValueError("annotations must be a list of objects")

    normalized: List[Dict[str, Any]] = []
    for idx, ann in enumerate(annotations, start=1):
        if not isinstance(ann, dict):
            raise ValueError(f"Annotation at index {idx} must be an object")

        if "position" in ann and ("start" not in ann and "end" not in ann):
            start = end = int(ann["position"])
        else:
            start = int(ann.get("start", 0))
            end = int(ann.get("end", start))

        if start < 1 or end < start or end > seq_len:
            raise ValueError(
                f"Annotation at index {idx} has invalid coordinates: start={start}, end={end}, sequence_length={seq_len}"
            )

        annotation_type = normalize_annotation_type(ann.get("type", "generic"))
        label = str(ann.get("label", annotation_type)).strip() or annotation_type
        mode = str(ann.get("mode", "favor")).strip().lower()
        if mode not in {"favor", "avoid", "neutral"}:
            raise ValueError(f"Annotation at index {idx} has invalid mode '{mode}'. Use favor, avoid, or neutral.")

        raw_weight = ann.get("weight")
        default_weight = default_annotation_weight(annotation_type)
        weight = normalize_annotation_weight(raw_weight, default=default_weight)

        normalized.append({
            "id": ann.get("id", idx),
            "start": start,
            "end": end,
            "type": annotation_type,
            "label": label,
            "mode": mode,
            "weight": weight,
            "metadata": ann.get("metadata", {}),
        })

    return normalized


def interval_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    return max(0, min(a_end, b_end) - max(a_start, b_start) + 1)


def summarize_annotation_overlap(
    candidate_start: int,
    candidate_end: int,
    annotations: List[Dict[str, Any]],
) -> Tuple[float, List[Dict[str, Any]], List[str], Dict[str, Any]]:
    total = 0.0
    overlaps: List[Dict[str, Any]] = []
    notes: List[str] = []

    favored = 0
    avoided = 0
    neutral = 0

    for ann in annotations:
        overlap_nt = interval_overlap(candidate_start, candidate_end, ann["start"], ann["end"])
        if overlap_nt <= 0:
            continue

        ann_len = ann["end"] - ann["start"] + 1
        frac = overlap_nt / ann_len
        effect = ann["weight"] * frac
        signed_effect = effect
        if ann["mode"] == "avoid":
            signed_effect = -effect
            avoided += 1
        elif ann["mode"] == "neutral":
            signed_effect = 0.0
            neutral += 1
        else:
            favored += 1

        total += signed_effect
        overlaps.append({
            **ann,
            "overlap_nt": overlap_nt,
            "annotation_length": ann_len,
            "overlap_fraction_of_annotation": round(frac, 4),
            "score_contribution": round(signed_effect, 2),
        })

    if overlaps:
        overlaps.sort(key=lambda x: (abs(x["score_contribution"]), x["overlap_nt"]), reverse=True)
        for entry in overlaps:
            if entry["mode"] == "favor":
                notes.append(
                    f"Overlaps favored annotation '{entry['label']}' ({entry['type']}, +{entry['score_contribution']:.2f})"
                )
            elif entry["mode"] == "avoid":
                notes.append(
                    f"Overlaps avoided annotation '{entry['label']}' ({entry['type']}, {entry['score_contribution']:.2f})"
                )
            else:
                notes.append(
                    f"Overlaps neutral annotation '{entry['label']}' ({entry['type']}, no score change)"
                )
    else:
        notes.append("No supplied annotations overlap this candidate")

    summary = {
        "total_annotations_overlapping": len(overlaps),
        "favored_overlaps": favored,
        "avoided_overlaps": avoided,
        "neutral_overlaps": neutral,
        "annotation_score_total": round(total, 2),
    }
    return total, overlaps, notes, summary


def score_steric_blocking_candidate(
    target_site_rna: str,
    antisense_core_rna: str,
    candidate_start: int,
    candidate_end: int,
    annotations: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[float, List[str], float, float, List[Dict[str, Any]], Dict[str, Any]]:
    total = 0.0
    notes: List[str] = []

    gc = gc_fraction(antisense_core_rna)
    tm = estimate_tm_wallace(antisense_core_rna)

    s, note = score_gc(gc)
    total += s
    notes.append(note)

    s, note = score_tm(tm)
    total += s
    notes.append(note)

    s, extra = score_offtarget_toxicity_rules(antisense_core_rna)
    total += s
    notes.extend(extra)

    total += 5
    notes.append("Fully modified steric-blocking architecture bonus")

    if annotations:
        s, overlaps, ann_notes, ann_summary = summarize_annotation_overlap(
            candidate_start=candidate_start,
            candidate_end=candidate_end,
            annotations=annotations,
        )
        total += s
        notes.extend(ann_notes)
    else:
        overlaps = []
        ann_summary = {
            "total_annotations_overlapping": 0,
            "favored_overlaps": 0,
            "avoided_overlaps": 0,
            "neutral_overlaps": 0,
            "annotation_score_total": 0.0,
        }
        notes.append("No annotations supplied; ranking is sequence-only")

    notes.append(
        "This scorer does not explicitly model full RNA structure, local accessibility, or cell-type-specific protein occupancy"
    )

    return round(total, 2), notes, round(gc * 100, 2), round(tm, 2), overlaps, ann_summary


def normalize_full_modification(mod: str) -> str:
    m = str(mod or "2'-MOE").strip()
    aliases = {
        "MOE": "2'-MOE",
        "2'-OMETHYL": "2'-OMe",
        "2'-OMETHOXYETHYL": "2'-MOE",
        "OME": "2'-OMe",
    }
    m = aliases.get(m.upper(), m)
    if m not in ALLOWED_FULL_MODIFICATIONS:
        raise ValueError("full_modification must be one of: DNA, RNA, LNA, 2'-OMe, 2'-MOE")
    return m


def normalize_backbone(backbone: str) -> str:
    b = str(backbone or "PS").strip().upper()
    if b not in ALLOWED_BACKBONES:
        raise ValueError("default_backbone must be PS or PO")
    return b


def build_symbol_map(user_symbols: Dict[str, Any] | None) -> Dict[str, str | None]:
    merged: Dict[str, str | None] = dict(DEFAULT_HELM_SYMBOLS)
    if user_symbols:
        for k, v in user_symbols.items():
            merged[str(k)] = None if v is None else str(v)
    return merged


def resolve_helm_symbol(sugar: str, symbol_map: Dict[str, str | None]) -> str:
    sugar = str(sugar)
    symbol = symbol_map.get(sugar)

    if not symbol:
        raise ValueError(
            f"No HELM monomer symbol configured for sugar/modification '{sugar}'. "
            f"Provide it in json_input['helm_symbols']."
        )
    return symbol


def build_helm_structure(
    chemistry_layout: List[Dict[str, Any]],
    symbol_map: Dict[str, str | None],
) -> str:
    monomers: List[str] = []

    for residue in chemistry_layout:
        symbol = resolve_helm_symbol(residue["sugar"], symbol_map)
        base = str(residue["base"]).upper()
        monomers.append(f"{symbol}({base})")

    return f"RNA1{{{'.'.join(monomers)}}}$$$$"


def overlaps_with_margin(
    a_start: int,
    a_end: int,
    b_start: int,
    b_end: int,
    min_separation: int = 0,
) -> bool:
    return not (
        a_end + min_separation < b_start or
        a_start - min_separation > b_end
    )


def select_top_non_overlapping(
    candidates: List[StericBlockingASOCandidate],
    top_n: int,
    min_separation: int = 0,
) -> List[StericBlockingASOCandidate]:
    selected: List[StericBlockingASOCandidate] = []

    for cand in candidates:
        conflict = False
        for chosen in selected:
            if overlaps_with_margin(
                cand.start,
                cand.end,
                chosen.start,
                chosen.end,
                min_separation=min_separation,
            ):
                conflict = True
                break

        if not conflict:
            selected.append(cand)

        if len(selected) >= top_n:
            break

    for idx, candidate in enumerate(selected, start=1):
        candidate.rank = idx

    return selected


def generate_steric_blocking_aso_candidates(
    long_sequence: str,
    lengths: Iterable[int] = (16, 17, 18, 19, 20),
    output_alphabet: str = "DNA",
    strand: int = 1,
    full_modification: str = "2'-MOE",
    default_backbone: str = "PS",
    po_link_positions: Iterable[int] = (),
    helm_symbols: Dict[str, Any] | None = None,
    annotations: Optional[List[Dict[str, Any]]] = None,
) -> List[StericBlockingASOCandidate]:
    seq_rna = clean_sequence(long_sequence)
    lengths = list(lengths)

    if any(length < 12 or length > 25 for length in lengths):
        raise ValueError("Steric-blocking ASO lengths must be between 12 and 25 nt")

    if strand not in (-1, 1):
        raise ValueError("strand must be either -1 or 1")

    full_modification = normalize_full_modification(full_modification)
    default_backbone = normalize_backbone(default_backbone)
    symbol_map = build_symbol_map(helm_symbols)
    annotations = annotations or []

    results: List[StericBlockingASOCandidate] = []

    for length in lengths:
        for i in range(0, len(seq_rna) - length + 1):
            target_site_rna = seq_rna[i:i + length]

            if strand == 1:
                antisense_core_rna = reverse_complement_rna(target_site_rna)
            else:
                antisense_core_rna = complement_rna(target_site_rna)

            start_1based = i + 1
            end_1based = i + length
            score, notes, gc_percent, tm_c, overlaps, ann_summary = score_steric_blocking_candidate(
                target_site_rna=target_site_rna,
                antisense_core_rna=antisense_core_rna,
                candidate_start=start_1based,
                candidate_end=end_1based,
                annotations=annotations,
            )

            antisense_display = to_requested_alphabet(antisense_core_rna, output_alphabet)
            target_display = to_requested_alphabet(target_site_rna, output_alphabet)

            backbone_pattern = build_backbone_pattern(
                length=length,
                default_backbone=default_backbone,
                po_positions=po_link_positions,
            )

            chemistry_layout = build_chemistry_layout(
                antisense_display=antisense_display,
                full_modification=full_modification,
                backbone_pattern=backbone_pattern,
            )

            structure = build_helm_structure(
                chemistry_layout=chemistry_layout,
                symbol_map=symbol_map,
            )

            results.append(
                StericBlockingASOCandidate(
                    rank=0,
                    start=start_1based,
                    end=end_1based,
                    length=length,
                    target_site_rna=target_site_rna,
                    target_site_input_alphabet=target_display,
                    antisense_core_rna=antisense_core_rna,
                    antisense_display=antisense_display,
                    gc_percent=gc_percent,
                    tm_c=tm_c,
                    full_modification=full_modification,
                    backbone_pattern=backbone_pattern,
                    chemistry_layout=chemistry_layout,
                    structure=structure,
                    annotations_overlapping=overlaps,
                    annotation_summary=ann_summary,
                    notes=notes,
                    score=score,
                )
            )

    # RANK ORDER over the whole sequence space. Score first, then tie-breaks -- and the
    # tie-breaks matter, because this score is a coarse points total that lands on the same
    # value for large numbers of candidates. Sorting on score alone left those runs in
    # generation order, which is length-major and then left-to-right, so the answer was
    # decided by the order the loops happened to run in.
    #
    # 65C and 50% GC are this scorer's own optima (score_tm peaks at 65, score_gc at 0.50),
    # so a tie is settled by the same criteria that produced it rather than by a new one. The
    # gapmer scorer targets 60C instead -- different chemistry, different window. The longer
    # candidate goes ahead of the shorter: more sequence read is more specificity, which is
    # the right thing to prefer when nothing else separates two sites.
    results.sort(key=lambda x: (-x.score, abs(x.tm_c - 65.0), abs(x.gc_percent - 50.0), -x.length))
    for idx, candidate in enumerate(results, start=1):
        candidate.rank = idx

    return results


def parse_request(payload: Any) -> Dict[str, Any]:
    """
    Example input:
    {
      "sequence": "ATGGCTACTGATGCTACTGATGCTACTGATCGTACGATCGATCGTAGCTA",
      "strand": 1,
      "top_n": 10,
      "lengths": [16, 17, 18, 19, 20],
      "full_modification": "2'-MOE",
      "default_backbone": "PS",
      "po_link_positions": [],
      "output_alphabet": "DNA",
      "helm_symbols": {
        "DNA": "25d3r",
        "2'-MOE": "25moe3r",
        "RNA": "25r",
        "LNA": "YOUR_LNA_SYMBOL",
        "2'-OMe": "YOUR_2OME_SYMBOL"
      },
      "annotations": [
        {"start": 31, "end": 39, "type": "splice_acceptor", "label": "Exon 7 acceptor", "mode": "favor", "weight": 35},
        {"start": 40, "end": 46, "type": "ese", "label": "Predicted SRSF1 ESE", "mode": "favor", "weight": 18},
        {"start": 10, "end": 18, "type": "protein_binding", "label": "RBP footprint", "mode": "avoid", "weight": 12}
      ],
      "enforce_non_overlapping": true,
      "min_separation": 0
    }
    """
    if isinstance(payload, str):
        return {
            "sequence": payload,
            "strand": 1,
            "top_n": 20,
            "lengths": [16, 17, 18, 19, 20],
            "full_modification": "2'-MOE",
            "default_backbone": "PS",
            "po_link_positions": [],
            "output_alphabet": "DNA",
            "helm_symbols": {},
            "annotations": [],
            "enforce_non_overlapping": True,
            "min_separation": 0,
        }

    if isinstance(payload, dict):
        strand = int(payload.get("strand", 1))
        if strand not in (-1, 1):
            raise ValueError("strand must be either -1 or 1")

        helm_symbols = payload.get("helm_symbols", {}) or {}
        if not isinstance(helm_symbols, dict):
            raise ValueError("helm_symbols must be an object mapping chemistry names to monomer symbols")

        sequence = payload.get("sequence", "")
        normalized_rna = clean_sequence(sequence)
        annotations = normalize_annotations(payload.get("annotations", []), seq_len=len(normalized_rna))

        return {
            "sequence": sequence,
            "strand": strand,
            "top_n": int(payload.get("top_n", 20)),
            "lengths": list(payload.get("lengths", [16, 17, 18, 19, 20])),
            "full_modification": str(payload.get("full_modification", payload.get("wing_modification", "2'-MOE"))),
            "default_backbone": str(payload.get("default_backbone", "PS")),
            "po_link_positions": list(payload.get("po_link_positions", [])),
            "output_alphabet": str(payload.get("output_alphabet", "DNA")).upper(),
            "helm_symbols": helm_symbols,
            "annotations": annotations,
            # DEFAULT TRUE. See the note on the selection step: the global top N with overlaps
            # allowed is the best site written out N times, not the best N ASOs.
            "enforce_non_overlapping": bool(payload.get("enforce_non_overlapping", True)),
            "min_separation": int(payload.get("min_separation", 0)),
        }

    raise ValueError("Input must be either a sequence string or a JSON object.")


def design_steric_blocking_aso_sites(payload: Any) -> Dict[str, Any]:
    request = parse_request(payload)

    raw_sequence = request["sequence"]
    strand = request["strand"]
    top_n = request["top_n"]
    lengths = request["lengths"]
    full_modification = request["full_modification"]
    default_backbone = request["default_backbone"]
    po_link_positions = request["po_link_positions"]
    output_alphabet = request["output_alphabet"]
    helm_symbols = request["helm_symbols"]
    annotations = request["annotations"]
    enforce_non_overlapping = request["enforce_non_overlapping"]
    min_separation = request["min_separation"]

    normalized_rna = clean_sequence(raw_sequence)
    symbol_map = build_symbol_map(helm_symbols)

    # Stage-by-stage reporting, for the same reason as the gapmer designer: this run used to
    # say nothing at all until it returned, so a slow design and a stuck one looked identical.
    works.msg(
        "Reading target: %d nt, %s strand"
        % (len(normalized_rna), "minus" if strand < 0 else "plus")
    )
    works.progress(5)
    # The annotation count matters here in a way it does not for a gapmer: a steric blocker is
    # placed against features -- splice sites, uORFs, start codons -- so with none supplied the
    # run is scoring on sequence alone, and the user should be told that before reading the
    # results.
    # The modality and the chemistry first, in a chemist's words: this is a fully modified
    # single strand with no DNA gap, so it occupies its site rather than marking it for
    # cleavage -- which is the thing that distinguishes it from the gapmer designer and the
    # thing a reader needs before interpreting a score.
    works.msg(
        "Steric-blocking ASO with full %s and a %s backbone (no DNA gap - blocks, does not cleave)"
        % (full_modification, default_backbone)
    )
    works.msg(
        "Tiling lengths %s; %s"
        % ("-".join(str(x) for x in sorted(set(lengths))),
           ("%d annotation site%s to block"
            % (len(annotations), "" if len(annotations) == 1 else "s"))
           if annotations else "no annotation sites supplied - scoring on sequence alone")
    )
    works.progress(15)

    all_candidates = generate_steric_blocking_aso_candidates(
        long_sequence=raw_sequence,
        lengths=lengths,
        output_alphabet=output_alphabet,
        strand=strand,
        full_modification=full_modification,
        default_backbone=default_backbone,
        po_link_positions=po_link_positions,
        helm_symbols=helm_symbols,
        annotations=annotations,
    )

    works.progress(70)
    works.msg(
        "Scored %d candidate ASO%s"
        % (len(all_candidates), "" if len(all_candidates) == 1 else "s")
    )

    # SELECTION. Every candidate above was scored; this decides which come back.
    #
    # The default walks the ranking from the top and takes a candidate only if it does not
    # overlap one already taken, which is what makes the result a design ACROSS the sequence:
    # rank 1 is the best ASO anywhere in the transcript, rank 2 the best one that is not the
    # same ASO again.
    #
    # Straight top-N is what this used to do. Every start position is generated at five
    # lengths and neighbouring starts differ by one base, so the variants of one good site
    # score within noise of each other and fill the top of the list. Measured on a 3 kb
    # sequence, top 100 requested: 46 distinct start positions, 31 of the hundred overlapping
    # the single best site, 6.9% of the transcript covered. Still available as
    # enforce_non_overlapping: false for a caller that wants a site's length variants.
    if enforce_non_overlapping:
        works.msg(
            "Ranking every candidate, then taking the best %d sites%s"
            % (top_n, (" at least %d nt apart" % min_separation) if min_separation else ", non-overlapping")
        )
        top_candidates = select_top_non_overlapping(
            all_candidates,
            top_n=top_n,
            min_separation=min_separation,
        )
    else:
        works.msg("Taking the best %d by score, overlapping layouts of one site included" % top_n)
        top_candidates = all_candidates[:top_n]

    works.progress(90)
    works.msg("Top candidates: %d" % len(top_candidates))

    # What the design actually covers -- the two numbers that separate a survey of the target
    # from a pile at one site, which the hit list alone cannot tell you.
    _covered = set()
    for _c in top_candidates:
        _covered.update(range(_c.start, _c.end + 1))
    _starts = sorted({_c.start for _c in top_candidates})
    coverage = {
        "candidates_scored": len(all_candidates),
        "sites_returned": len(_starts),
        "first_site": _starts[0] if _starts else None,
        "last_site": _starts[-1] if _starts else None,
        "nt_covered": len(_covered),
        "fraction_of_transcript_covered": (
            round(len(_covered) / len(normalized_rna), 4) if normalized_rna else 0.0
        ),
    }
    if coverage["sites_returned"]:
        works.msg(
            "%d sites from %d scored candidates, spanning %d-%d and covering %d nt "
            "(%.1f%% of the transcript)"
            % (coverage["sites_returned"], coverage["candidates_scored"],
               coverage["first_site"], coverage["last_site"],
               coverage["nt_covered"], 100.0 * coverage["fraction_of_transcript_covered"])
        )

    return {
        "design_type": "steric_blocking_aso",
        "input_sequence_original": re.sub(r"\s+", "", str(raw_sequence).upper()),
        "input_sequence_normalized_rna": normalized_rna,
        "input_length": len(normalized_rna),
        "input_handling": "Input may be RNA or DNA. Any T bases are normalized to U internally before analysis.",
        "strand": strand,
        "strand_handling": (
            "target sequence is always the scanned input window as-is; "
            "strand = 1 uses antisense = reverse_complement(target); "
            "strand = -1 uses antisense = complement(target)."
        ),
        "top_n": top_n,
        "coverage": coverage,
        "selection_mode": "rank_order_across_sequence_space" if enforce_non_overlapping else "global_top_n_overlaps_allowed",
        "min_separation": min_separation,
        "lengths_scanned": list(lengths),
        "full_modification": normalize_full_modification(full_modification),
        "default_backbone": normalize_backbone(default_backbone),
        "po_link_positions": list(po_link_positions),
        "output_alphabet": output_alphabet,
        "helm_symbols_used": symbol_map,
        "annotations_supplied": annotations,
        "annotation_handling": {
            "description": "Annotations can favor, avoid, or neutrally tag specific transcript intervals during ranking.",
            "allowed_modes": ["favor", "avoid", "neutral"],
            "coordinate_system": "1-based inclusive transcript coordinates",
        },
        "total_candidates": len(all_candidates),
        "returned_candidates": len(top_candidates),
        "design_rules": {
            "length_rule": "Steric-blocking ASOs are commonly screened around 12-25 nt",
            "chemistry_rule": "Entire oligo is fully modified; no central DNA gap is used",
            "binding_rule": "Higher-affinity binding is generally preferred for occupancy-based blocking",
            "gc_rule": "Prefer moderate GC, commonly around 40-60% as a starting heuristic",
            "tm_rule": "Prefer Tm high enough for stable binding, often around 55-75C in this simple heuristic",
            "annotation_rule": "User-supplied annotations can boost or penalize overlapping sites",
            "avoid": [
                "CpG motifs",
                "long G runs",
                "palindromes",
                "self-complementarity",
                "repetitive sequences",
                "highly structured regions",
                "protein-bound sites unless intentionally targeted"
            ],
            "note": (
                "This script uses sequence-based heuristics plus optional user annotations only. "
                "It does not explicitly model RNA accessibility, RNA folding, or cell-context-dependent occupancy."
            )
        },
        "helm_note": "The structure field is returned as HELM using the configured monomer symbols.",
        "top_candidates": [asdict(c) for c in top_candidates],
    }


# Backward-compatible alias for existing integrations that still call the old function name.
def design_gapmer_sites(payload: Any) -> Dict[str, Any]:
    return design_steric_blocking_aso_sites(payload)


def _main() -> int:
    payload = works.param(1)
    works.resolve(design_steric_blocking_aso_sites(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
