#!/usr/bin/env python3
"""
peptide_stats_ion.py

Analyze a peptide/protein sequence and return useful statistics using
Ion Works params for input and works.resolve for output.

Expected Ion Works params:
1 -> peptide/protein sequence (optional if FASTA is provided)
2 -> FASTA file path (optional if sequence is provided)

Examples:
- works.param(1): "KWKLFKKIGAVLKVL"
- works.param(2): "/path/to/peptide.fasta"

Returns:
{
  "result": [
    {
      "name": "query",
      "sequence": "KWKLFKKIGAVLKVL",
      "length": 15,
      ...
    }
  ]
}
"""

from __future__ import annotations

import math
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

from ion import works

VALID_AA = set("ACDEFGHIKLMNPQRSTVWY")
CLEAN_AA_RE = re.compile(r"[^ACDEFGHIKLMNPQRSTVWY]", re.IGNORECASE)

# Average residue molecular weights after peptide bond formation (Da)
AA_MW = {
    "A": 71.0788,
    "R": 156.1875,
    "N": 114.1038,
    "D": 115.0886,
    "C": 103.1388,
    "E": 129.1155,
    "Q": 128.1307,
    "G": 57.0519,
    "H": 137.1411,
    "I": 113.1594,
    "L": 113.1594,
    "K": 128.1741,
    "M": 131.1926,
    "F": 147.1766,
    "P": 97.1167,
    "S": 87.0782,
    "T": 101.1051,
    "W": 186.2132,
    "Y": 163.1760,
    "V": 99.1326,
}

# Kyte-Doolittle hydropathy scale
HYDROPATHY = {
    "A": 1.8,
    "R": -4.5,
    "N": -3.5,
    "D": -3.5,
    "C": 2.5,
    "E": -3.5,
    "Q": -3.5,
    "G": -0.4,
    "H": -3.2,
    "I": 4.5,
    "L": 3.8,
    "K": -3.9,
    "M": 1.9,
    "F": 2.8,
    "P": -1.6,
    "S": -0.8,
    "T": -0.7,
    "W": -0.9,
    "Y": -1.3,
    "V": 4.2,
}

PKA = {
    "C_term": 2.34,
    "N_term": 9.69,
    "C": 8.33,
    "D": 3.86,
    "E": 4.25,
    "H": 6.00,
    "K": 10.53,
    "R": 12.48,
    "Y": 10.07,
}

EXT_COEFF = {"W": 5500, "Y": 1490, "C": 125}  # C estimated as cystine pairs

HYDROPHOBIC = set("AILMFWVPC")
POLAR = set("STNQYC")
POSITIVE = set("KRH")
NEGATIVE = set("DE")
AROMATIC = set("FWYH")
ALIPHATIC = set("AVLIG")

# Rough instability heuristic
INSTABILITY_BONUS = {
    "M": 1.0,
    "Q": 1.0,
    "E": 1.0,
    "P": 0.5,
    "S": 0.5,
    "T": 0.5,
    "G": 0.5,
}
INSTABILITY_PENALTY = {
    "W": 1.0,
    "Y": 0.8,
    "F": 0.8,
    "I": 0.6,
    "L": 0.6,
    "V": 0.6,
    "C": 0.5,
}


def normalize_sequence(seq: str) -> str:
    seq = str(seq).strip().upper()
    seq = seq.replace("*", "")
    seq = CLEAN_AA_RE.sub("", seq)
    return seq


def parse_fasta(path: Path) -> List[Tuple[str, str]]:
    records: List[Tuple[str, str]] = []
    header = None
    seq_parts: List[str] = []

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith(">"):
                if header is not None:
                    records.append((header, "".join(seq_parts)))
                header = line[1:]
                seq_parts = []
            else:
                seq_parts.append(line)

    if header is not None:
        records.append((header, "".join(seq_parts)))

    return records


def aa_composition(seq: str) -> Dict[str, float]:
    counts = Counter(seq)
    n = max(len(seq), 1)
    return {f"frac_{aa}": counts.get(aa, 0) / n for aa in sorted(VALID_AA)}


def molecular_weight(seq: str) -> float:
    return sum(AA_MW[aa] for aa in seq) + 18.01528


def gravy(seq: str) -> float:
    n = max(len(seq), 1)
    return sum(HYDROPATHY[aa] for aa in seq) / n


def aromaticity(seq: str) -> float:
    n = max(len(seq), 1)
    return sum(seq.count(aa) for aa in "FWY") / n


def aliphatic_index(seq: str) -> float:
    counts = Counter(seq)
    n = max(len(seq), 1)
    a = 100 * counts.get("A", 0) / n
    v = 100 * counts.get("V", 0) / n
    i = 100 * counts.get("I", 0) / n
    l = 100 * counts.get("L", 0) / n
    return a + 2.9 * v + 3.9 * (i + l)


def extinction_coefficient(seq: str) -> int:
    w = seq.count("W")
    y = seq.count("Y")
    c = seq.count("C") // 2
    return w * EXT_COEFF["W"] + y * EXT_COEFF["Y"] + c * EXT_COEFF["C"]


def fraction_of_group(seq: str, group: set[str]) -> float:
    n = max(len(seq), 1)
    return sum(1 for aa in seq if aa in group) / n


def estimate_net_charge(seq: str, ph: float = 7.0) -> float:
    counts = Counter(seq)

    pos = 0.0
    pos += 1.0 / (1.0 + 10 ** (ph - PKA["N_term"]))
    pos += counts["K"] / (1.0 + 10 ** (ph - PKA["K"]))
    pos += counts["R"] / (1.0 + 10 ** (ph - PKA["R"]))
    pos += counts["H"] / (1.0 + 10 ** (ph - PKA["H"]))

    neg = 0.0
    neg += 1.0 / (1.0 + 10 ** (PKA["C_term"] - ph))
    neg += counts["D"] / (1.0 + 10 ** (PKA["D"] - ph))
    neg += counts["E"] / (1.0 + 10 ** (PKA["E"] - ph))
    neg += counts["C"] / (1.0 + 10 ** (PKA["C"] - ph))
    neg += counts["Y"] / (1.0 + 10 ** (PKA["Y"] - ph))

    return pos - neg


def estimate_pi(seq: str) -> float:
    low, high = 0.0, 14.0
    for _ in range(100):
        mid = (low + high) / 2.0
        charge = estimate_net_charge(seq, mid)
        if charge > 0:
            low = mid
        else:
            high = mid
    return (low + high) / 2.0


def instability_index(seq: str) -> float:
    if len(seq) < 2:
        return 0.0

    score = 0.0
    for i in range(len(seq) - 1):
        a, b = seq[i], seq[i + 1]
        dipeptide = a + b

        score += INSTABILITY_BONUS.get(a, 0.0)
        score += INSTABILITY_BONUS.get(b, 0.0)
        score -= INSTABILITY_PENALTY.get(a, 0.0)
        score -= INSTABILITY_PENALTY.get(b, 0.0)

        if "P" in dipeptide:
            score += 0.3
        if dipeptide in {"GW", "YW", "WF", "FF", "YY", "WW"}:
            score -= 0.6

    scaled = 40 + (10 * score / max(1, len(seq) - 1))
    return max(0.0, scaled)


def hydrophobic_moment_proxy(seq: str) -> float:
    if not seq:
        return 0.0
    angles = [math.radians((i * 100) % 360) for i in range(len(seq))]
    x = sum(HYDROPATHY[aa] * math.cos(theta) for aa, theta in zip(seq, angles))
    y = sum(HYDROPATHY[aa] * math.sin(theta) for aa, theta in zip(seq, angles))
    return math.sqrt(x * x + y * y) / len(seq)


def longest_hydrophobic_stretch(seq: str, threshold: float = 1.6) -> int:
    best = cur = 0
    for aa in seq:
        if HYDROPATHY[aa] >= threshold:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def low_complexity_fraction(seq: str) -> float:
    if not seq:
        return 0.0
    counts = Counter(seq)
    probs = [c / len(seq) for c in counts.values()]
    shannon = -sum(p * math.log2(p) for p in probs if p > 0)
    max_shannon = math.log2(min(len(VALID_AA), len(seq))) if len(seq) > 0 else 1.0
    if max_shannon == 0:
        return 0.0
    return 1.0 - (shannon / max_shannon)


def motif_flags(seq: str) -> Dict[str, bool]:
    return {
        "possible_n_glycosylation_motif_nxs_t": bool(re.search(r"N[^P][ST]", seq)),
        "dibasic_site_kr_rr_rk_kk": bool(re.search(r"(KR|RR|RK|KK)", seq)),
        "c_terminal_amidation_glycine": seq.endswith("G"),
        "cysteine_rich_possible_disulfides": seq.count("C") >= 4,
        "proline_rich_possible_sh3_binding_like_region": fraction_of_group(seq, {"P"}) >= 0.15,
        "arginine_lysine_rich_possible_cpp_or_nuclear_bias": fraction_of_group(seq, {"R", "K"}) >= 0.25,
        "acidic_rich_region": fraction_of_group(seq, {"D", "E"}) >= 0.25,
        "aromatic_rich_region": fraction_of_group(seq, {"F", "W", "Y"}) >= 0.20,
    }


def likely_transmembrane(seq: str) -> bool:
    return longest_hydrophobic_stretch(seq) >= 18


def likely_secreted_or_signal_peptide_like(seq: str) -> bool:
    nterm = seq[:30]
    if len(nterm) < 12:
        return False
    n_pos = sum(1 for aa in nterm[:8] if aa in {"K", "R"})
    hydro_run = longest_hydrophobic_stretch(nterm[5:], threshold=1.6)
    return n_pos >= 1 and hydro_run >= 7


def classify_charge(net_charge: float) -> str:
    if net_charge >= 2:
        return "strongly_cationic"
    if net_charge > 0.5:
        return "mildly_cationic"
    if net_charge <= -2:
        return "strongly_anionic"
    if net_charge < -0.5:
        return "mildly_anionic"
    return "near_neutral"


def classify_hydrophobicity(g: float) -> str:
    if g >= 1.0:
        return "highly_hydrophobic"
    if g >= 0.3:
        return "moderately_hydrophobic"
    if g <= -1.0:
        return "highly_hydrophilic"
    if g <= -0.3:
        return "moderately_hydrophilic"
    return "mixed_balanced"


def functional_heuristics(seq: str) -> List[str]:
    hints: List[str] = []
    net7 = estimate_net_charge(seq, 7.0)
    g = gravy(seq)
    hm = hydrophobic_moment_proxy(seq)

    if len(seq) <= 50 and net7 >= 3 and hm >= 0.35:
        hints.append(
            "Could be amphipathic/cationic; worth checking for antimicrobial or membrane-active behavior"
        )
    if likely_transmembrane(seq):
        hints.append(
            "Contains a long hydrophobic stretch; may include a transmembrane helix"
        )
    if likely_secreted_or_signal_peptide_like(seq):
        hints.append(
            "N-terminus looks signal-peptide-like; may enter secretory pathway"
        )
    if fraction_of_group(seq, {"R", "K"}) >= 0.25 and len(seq) <= 40:
        hints.append(
            "Basic residue enrichment may support nucleic-acid binding, cell penetration, or nuclear localization bias"
        )
    if fraction_of_group(seq, {"D", "E"}) >= 0.25:
        hints.append(
            "Acidic character may favor metal interaction, disorder, or regulatory interaction surfaces"
        )
    if seq.count("C") >= 4:
        hints.append(
            "Cysteine richness may support disulfide bonding and extracellular stability"
        )
    if low_complexity_fraction(seq) >= 0.35:
        hints.append(
            "Sequence appears relatively low-complexity; consider disorder, repeats, or scaffold/regulatory roles"
        )
    if aromaticity(seq) >= 0.15:
        hints.append(
            "Aromatic content is elevated; may contribute to stacking, ligand interaction, or membrane interfacial binding"
        )
    if instability_index(seq) > 40:
        hints.append(
            "Predicted instability is relatively high; experimental expression/stability may be challenging"
        )
    else:
        hints.append(
            "Predicted instability is relatively low; sequence may be reasonably stable in vitro"
        )

    return hints


def build_result_record(seq: str, name: str = "query") -> Dict:
    seq = normalize_sequence(seq)
    counts = Counter(seq)

    result = {
        "name": name,
        "sequence": seq,
        "length": len(seq),
        "molecular_weight_da": round(molecular_weight(seq), 4),
        "estimated_pi": round(estimate_pi(seq), 4),
        "estimated_net_charge_ph7": round(estimate_net_charge(seq, 7.0), 4),
        "charge_class": classify_charge(estimate_net_charge(seq, 7.0)),
        "gravy_hydropathy": round(gravy(seq), 4),
        "hydrophobicity_class": classify_hydrophobicity(gravy(seq)),
        "aromaticity": round(aromaticity(seq), 4),
        "aliphatic_index": round(aliphatic_index(seq), 4),
        "instability_index_rough": round(instability_index(seq), 4),
        "hydrophobic_moment_proxy": round(hydrophobic_moment_proxy(seq), 4),
        "low_complexity_fraction": round(low_complexity_fraction(seq), 4),
        "extinction_coefficient_m1_cm1": extinction_coefficient(seq),
        "longest_hydrophobic_stretch": longest_hydrophobic_stretch(seq),
        "frac_hydrophobic": round(fraction_of_group(seq, HYDROPHOBIC), 4),
        "frac_polar": round(fraction_of_group(seq, POLAR), 4),
        "frac_positive": round(fraction_of_group(seq, POSITIVE), 4),
        "frac_negative": round(fraction_of_group(seq, NEGATIVE), 4),
        "frac_aromatic": round(fraction_of_group(seq, AROMATIC), 4),
        "frac_aliphatic": round(fraction_of_group(seq, ALIPHATIC), 4),
        "count_A": counts.get("A", 0),
        "count_C": counts.get("C", 0),
        "count_D": counts.get("D", 0),
        "count_E": counts.get("E", 0),
        "count_F": counts.get("F", 0),
        "count_G": counts.get("G", 0),
        "count_H": counts.get("H", 0),
        "count_I": counts.get("I", 0),
        "count_K": counts.get("K", 0),
        "count_L": counts.get("L", 0),
        "count_M": counts.get("M", 0),
        "count_N": counts.get("N", 0),
        "count_P": counts.get("P", 0),
        "count_Q": counts.get("Q", 0),
        "count_R": counts.get("R", 0),
        "count_S": counts.get("S", 0),
        "count_T": counts.get("T", 0),
        "count_V": counts.get("V", 0),
        "count_W": counts.get("W", 0),
        "count_Y": counts.get("Y", 0),
        "motif_flags": motif_flags(seq),
        "functional_heuristics": functional_heuristics(seq),
        "likely_transmembrane": likely_transmembrane(seq),
        "likely_signal_peptide_like": likely_secreted_or_signal_peptide_like(seq),
    }

    result.update({k: round(v, 6) for k, v in aa_composition(seq).items()})
    return result


def main() -> None:
    try:
        sequence_raw = works.param(1)
        fasta_path_raw = works.param(2)

        rows: List[Dict] = []

        if sequence_raw:
            seq = normalize_sequence(str(sequence_raw))
            if len(seq) < 1:
                works.resolve({
                    "error": "Sequence is empty after cleaning"
                })
                return

            rows.append(build_result_record(seq, name="query"))

        elif fasta_path_raw:
            fasta_path = Path(str(fasta_path_raw))
            if not fasta_path.exists():
                works.resolve({
                    "error": f"FASTA file not found: {fasta_path}"
                })
                return

            records = parse_fasta(fasta_path)
            if not records:
                works.resolve({
                    "error": f"No FASTA records found in: {fasta_path}"
                })
                return

            for header, seq in records:
                seq = normalize_sequence(seq)
                if len(seq) < 1:
                    continue
                rows.append(build_result_record(seq, name=header))

            if not rows:
                works.resolve({
                    "error": "No valid sequences found in FASTA input"
                })
                return

        else:
            works.resolve({
                "error": "Provide either param 1 (sequence) or param 2 (FASTA path)"
            })
            return

        works.resolve({
            "result": rows
        })

    except Exception as e:
        works.resolve({
            "error": str(e)
        })


if __name__ == "__main__":
    main()