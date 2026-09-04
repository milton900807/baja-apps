#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from ion import works


RNA_BASES = set("AUGC")
ALLOWED_BACKBONES = {"PS", "PO"}

# Default HELM monomer symbols
DEFAULT_HELM_SYMBOLS = {
    "DNA": "d",
    "2'-MOE": "moe",
    "RNA": "r",
    "LNA": "lna",
    "2'-OMe": "m",
}

# Heuristic per-residue Tm bonuses layered on top of Wallace estimate.
MODIFICATION_TM_BONUS_C = {
    "DNA": 0.0,
    "RNA": 0.0,
    "2'-OMe": 0.75,
    "2'-MOE": 1.25,
    "LNA": 2.5,
}

# Default panel of DNA cleavage motifs commonly used as nuclease / endonuclease
# recognition sequences. These are scanned against the INTERNAL DNA GAP only.
DEFAULT_ENDONUCLEASE_MOTIFS_DNA = [
    "GAATTC",   # EcoRI
    "GGATCC",   # BamHI
    "AAGCTT",   # HindIII
    "GCGGCCGC", # NotI
    "CTGCAG",   # PstI
    "CCCGGG",   # SmaI/XmaI core
    "GGTACC",   # KpnI
    "TCTAGA",   # XbaI
    "ACTAGT",   # SpeI
    "CTCGAG",   # XhoI
    "AGATCT",   # BglII
    "GTCGAC",   # SalI
    "CATATG",   # NdeI
    "CCATGG",   # NcoI
    "CACGTG",   # PmlI core / E-box-like palindrome
    "GATATC",   # EcoRV
    "ATCGAT",   # ClaI
    "GGCGCGCC", # AscI
]


@dataclass
class GapmerCandidate:
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
    tm_method: str
    tm_modification_bonus_c: float

    gap_start_1based: int
    gap_end_1based: int
    gap_size: int
    left_wing_size: int
    right_wing_size: int
    gap_sequence_rna: str
    gap_sequence_input_alphabet: str

    wing_modification: str
    backbone_pattern: List[str]

    chemistry_layout: List[Dict[str, Any]]
    structure: str
    notes: List[str] = field(default_factory=list)
    score: float = 0.0
    normalized_score: float = 0.0
    score_breakdown: Dict[str, float] = field(default_factory=dict)
    # Filled only for candidates that reached the off-target screen (see the funnel in
    # design_gapmer_sites). intrinsic_score is what the sequence terms alone said, kept
    # alongside the final score so the screen's effect on a candidate is readable.
    intrinsic_score: float = 0.0
    offtarget_screened: bool = False
    offtarget_index: str = ""
    offtarget_edit_distance: int = 0
    offtarget_genes_by_distance: Dict[str, int] = field(default_factory=dict)
    offtarget_burden: float = 0.0
    offtarget_component: float = 0.0
    offtarget_symbols: List[str] = field(default_factory=list)
    cleavage_motif_hits: List[str] = field(default_factory=list)


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


def complement_dna(seq: str) -> str:
    table = str.maketrans("ATGC", "TACG")
    return seq.translate(table)


def reverse_complement_dna(seq: str) -> str:
    return complement_dna(seq)[::-1]


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


def estimate_tm_with_modifications(
    seq: str,
    chemistry_layout: List[Dict[str, Any]],
) -> Tuple[float, float]:
    base_tm = estimate_tm_wallace(seq)
    mod_bonus = 0.0
    for residue in chemistry_layout:
        sugar = str(residue.get("sugar", "DNA"))
        mod_bonus += MODIFICATION_TM_BONUS_C.get(sugar, 0.0)
    return float(base_tm + mod_bonus), round(mod_bonus, 2)


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


def choose_gap_layout(length: int, gap_size: int) -> Tuple[int, int]:
    remaining = length - gap_size
    left = remaining // 2
    right = remaining - left
    return left, right


def build_backbone_pattern(length: int, default_backbone: str = "PS", po_positions: Iterable[int] = ()) -> List[str]:
    pattern = [default_backbone] * (length - 1)
    for p in po_positions:
        if 1 <= p <= length - 1:
            pattern[p - 1] = "PO"
    return pattern


def build_chemistry_layout(
    antisense_display: str,
    left_wing_size: int,
    gap_size: int,
    right_wing_size: int,
    wing_modification: str,
    backbone_pattern: List[str],
) -> List[Dict[str, Any]]:
    layout = []
    n = len(antisense_display)
    gap_start = left_wing_size + 1
    gap_end = left_wing_size + gap_size
    for i in range(1, n + 1):
        if i < gap_start:
            sugar = wing_modification
            region = "left_wing"
        elif i <= gap_end:
            sugar = "DNA"
            region = "gap"
        else:
            sugar = wing_modification
            region = "right_wing"
        layout.append({
            "position": i,
            "base": antisense_display[i - 1],
            "region": region,
            "sugar": sugar,
            "backbone_to_next": backbone_pattern[i - 1] if i <= n - 1 else None,
        })
    return layout


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def triangular_score(value: float, ideal: float, half_width: float) -> float:
    if half_width <= 0:
        return 1.0 if value == ideal else 0.0
    return clamp01(1.0 - abs(value - ideal) / half_width)


def plateau_score(value: float, low: float, high: float, soft_margin: float) -> float:
    if low > high:
        low, high = high, low
    if low <= value <= high:
        return 1.0
    if value < low:
        return clamp01(1.0 - (low - value) / max(soft_margin, 1e-9))
    return clamp01(1.0 - (value - high) / max(soft_margin, 1e-9))


def normalize_wing_mod(mod: str) -> str:
    m = str(mod or "LNA").strip()
    aliases = {
        "MOE": "2'-MOE",
        "2'-OMETHYL": "2'-OMe",
        "2'-OMETHOXYETHYL": "2'-MOE",
    }
    m = aliases.get(m.upper(), m)
    if m not in {"LNA", "2'-OMe", "2'-MOE"}:
        raise ValueError("wing_modification must be one of: LNA, 2'-OMe, 2'-MOE")
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


def normalize_motif_list(motifs: Sequence[str]) -> List[str]:
    cleaned: List[str] = []
    for motif in motifs:
        m = re.sub(r"\s+", "", str(motif or "").upper()).replace("U", "T")
        if not m:
            continue
        bad = set(m) - set("ATGC")
        if bad:
            raise ValueError(f"Invalid DNA motif characters for endonuclease scan: {sorted(bad)} in motif '{motif}'")
        cleaned.append(m)
    # Deduplicate while preserving order.
    out: List[str] = []
    seen = set()
    for motif in cleaned:
        if motif not in seen:
            seen.add(motif)
            out.append(motif)
    return out


def find_gap_cleavage_motif_hits(gap_seq_rna: str, motifs_dna: Sequence[str]) -> List[str]:
    gap_dna = gap_seq_rna.replace("U", "T")
    hits: List[str] = []
    for motif in motifs_dna:
        motif_rc = reverse_complement_dna(motif)
        if motif in gap_dna or motif_rc in gap_dna:
            if motif_rc != motif:
                hits.append(f"{motif} / {motif_rc}")
            else:
                hits.append(motif)
    return hits


# ---------------------------------------------------------------------------------------
# OFF-TARGET SCREEN
#
# The intrinsic terms below score an ASO against itself -- GC, Tm, self-structure, runs.
# None of them can see the thing that most often kills a gapmer, which is that the same
# 16 bases occur in some other transcript. That is a property of the TRANSCRIPTOME, not of
# the oligo, so it is measured rather than estimated: py/sequence/offtarget/search.py over a
# prebuilt 2-bit index, the same index and the same search the off-target tool runs.
#
# WEIGHTS PER DISTINCT GENE SYMBOL, not per hit. A hit in each of one gene's nine isoforms
# is one liability, not nine, and counting sites would rank a candidate by how well its
# off-target happens to be annotated.
#
# Measured against the human cDNA index (40 random oligos each, distinct symbols hit):
#
#            ED0            ED1                    ED2
#   16-mer   median 0       median 4, max 54       median 85, max 436
#   20-mer   median 0       median 0               median 0, max 9
#
# So ED0 and ED1 are the discriminating band for a gapmer-length oligo and ED2 is largely
# chance -- which is why ED2 is weighted at a fortieth of ED1 rather than dropped: 436 genes
# at two mismatches is still worse than 20, and the weight lets that show without letting it
# decide. The 20-mer row is why this term can move length preference at all: a 20-mer is
# essentially unique in the transcriptome and a 16-mer is not.
OFFTARGET_GENE_WEIGHT_BY_DISTANCE = {0: 40.0, 1: 8.0, 2: 0.35, 3: 0.05}

# burden -> component, as 1/(1 + burden/SCALE). Saturating rather than linear: the difference
# between 0 and 10 off-target genes matters, the difference between 300 and 400 does not, and
# a linear penalty would spend most of its range on candidates nobody would pick.
# At SCALE = 40 a typical 16-mer (0 / 4 / 85) lands near 0.39 and a clean one near 0.85.
OFFTARGET_BURDEN_SCALE = 40.0

# How much of the final score the screen is worth. The intrinsic terms keep 0.80 of it, so
# a candidate cannot be carried by a clean transcriptome alone, nor sunk by one marginal
# ED1 hit.
OFFTARGET_WEIGHT = 0.20


def _load_offtarget_search():
    """py/sequence/offtarget/search.py, imported by path. Returns None when it cannot be
    used -- no numpy, no index root, file moved -- which is a normal outcome, not an error:
    the design then runs on its intrinsic terms and says so in the result."""
    import importlib.util
    import os
    import sys
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.normpath(os.path.join(here, "..", "sequence", "offtarget", "search.py"))
    if not os.path.exists(path):
        return None
    try:
        spec = importlib.util.spec_from_file_location("_baja_offtarget_search", path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["_baja_offtarget_search"] = mod
        spec.loader.exec_module(mod)
        # search.py drives works.progress() per oligo; this is one step inside a larger
        # design, so its progress must not overwrite the design's own.
        try:
            mod.works = None
        except Exception:
            pass
        return mod
    except Exception:
        return None


def offtarget_burden_from_hits(hits, on_target_symbols=()):
    """(burden, {distance: gene_count}, top symbols) for one oligo's hit list.

    The intended site is subtracted rather than searched for. Every candidate matches its
    own target transcript perfectly, so exactly one gene symbol at distance 0 is the design
    working as intended; a caller that knows the gene can name it in on_target_symbols and
    that guess is not needed.
    """
    ignore = {str(x).strip().upper() for x in (on_target_symbols or []) if str(x).strip()}
    by_distance = {}
    for h in hits:
        if not isinstance(h, dict):
            continue
        sym = str(h.get("symbol") or "").strip()
        if not sym or sym.upper() in ignore:
            continue
        d = int(h.get("editdistance", 0))
        by_distance.setdefault(d, set()).add(sym)

    counts = {d: len(v) for d, v in sorted(by_distance.items())}
    if not ignore and counts.get(0):
        counts[0] = max(0, counts[0] - 1)          # the on-target transcript

    burden = sum(OFFTARGET_GENE_WEIGHT_BY_DISTANCE.get(d, 0.0) * n for d, n in counts.items())
    # Named examples for the notes, worst distance first -- a count says how much, a symbol
    # says what, and what is what a reader acts on.
    symbols = []
    for d in sorted(by_distance):
        for sym in sorted(by_distance[d]):
            if sym.upper() in ignore:
                continue
            symbols.append("%s (ED%d)" % (sym, d))
            if len(symbols) >= 8:
                break
        if len(symbols) >= 8:
            break
    return burden, counts, symbols


def offtarget_component(burden):
    return clamp01(1.0 / (1.0 + max(0.0, float(burden)) / OFFTARGET_BURDEN_SCALE))


# ---------------------------------------------------------------------------------------
# NUCLEOBASE COMPOSITION -> IN VIVO TOLERABILITY
#
# Derived from published Ionis/Biogen tolerability tables (see aso_patents/): 1,845 gapmers
# with functional-observational-battery scores after IT/ICV dosing across 7 CNS programmes,
# and 777 with mouse ALT fold-change. Both associations are cluster-aware (sequence families
# permuted as units) and survive residualising out the target programme.
#
#   CNS      guanine content tracks WORSE tolerability. rho = +0.38, positive in 5/5 genes.
#            Severe-finding rate (FOB >= 5) runs 6% -> 22% -> 51% -> 73% across the bands
#            below. It is guanine CONTENT, not run structure: adjusting for longest G-run,
#            GGG count and G4Hunter leaves it intact (each of those collapses to ~0 the
#            other way round), and no sequence in that corpus can even form a G-quadruplex.
#            Note this is a different claim from the existing g_run_penalty term, which is
#            about runs; the two are only weakly related and both are kept.
#   LIVER    adenine content tracks BETTER tolerability. rho = -0.23, 5/5 programmes.
#            Fraction exceeding 2x vehicle ALT runs 54% -> 48% -> 37% -> 29%.
#
# The bands are NOT monotonic once potency is included. From 8,461 compounds with in vitro
# knockdown, relative to the best band: G >= 30% costs no measurable potency (+1.4 pts,
# 95% CI [-0.8, +3.7]) while carrying the 73% severe rate -- so it is strictly dominated and
# cutting G there is free. Below 10% G costs a real 10.7 pts of knockdown (CI [8.5, 12.9])
# to buy the severe rate down to 6%, and A >= 35% costs 9.3 pts (CI [7.3, 11.3]). The anchors
# below encode that shape: the optimum is a BAND, not an extreme.
#
# Caveats that belong with the numbers: patent tables are survivorship-censored (only
# compounds that passed tolerability get published), the hepatic rule is mouse-only and
# cross-species transfer of it was ~zero, and an attempt to confirm the CNS rule on an
# independent endpoint (AIF1/GFAP induction) was null and underpowered. Treat this as a
# strong prior for window selection, not a replacement for a tolerability screen.
COMPOSITION_ANCHORS = {
    # tissue: [(base fraction, component value), ...] piecewise-linear, clamped at the ends
    "cns":   [(0.05, 0.92), (0.15, 1.00), (0.25, 0.55), (0.35, 0.28), (0.50, 0.20)],
    "liver": [(0.075, 0.64), (0.20, 0.73), (0.30, 0.88), (0.40, 0.92), (0.50, 0.92)],
}
COMPOSITION_BASE = {"cns": "G", "liver": "A"}

# Weight taken from the intrinsic block when a tissue is requested. Deliberately modest: the
# effect is real but the spread it explains is a fraction of what Tm and self-structure do,
# and it should reorder near-ties rather than override sequence quality.
COMPOSITION_WEIGHT = 0.12


def _interp(anchors, x):
    if x <= anchors[0][0]:
        return anchors[0][1]
    if x >= anchors[-1][0]:
        return anchors[-1][1]
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return anchors[-1][1]


def composition_component(seq_rna: str, tissue: str):
    """(component, detail) for the requested tissue, or (None, {}) when disabled.

    "both" takes the MINIMUM of the two rules rather than the mean: they are independent
    findings about different organs, and a design that is fine for liver but G-rich is not
    made acceptable for an intrathecal programme by averaging. In practice the two optima
    are compatible (G 10-20%, A 15-35% describe the same A/T-rich windows), so the minimum
    is rarely a hard constraint.
    """
    tissue = (tissue or "").strip().lower()
    if tissue not in ("cns", "liver", "both"):
        return None, {}
    seq = (seq_rna or "").upper().replace("U", "T")
    if not seq:
        return None, {}
    detail = {}
    parts = []
    for t in (("cns", "liver") if tissue == "both" else (tissue,)):
        frac = seq.count(COMPOSITION_BASE[t]) / len(seq)
        val = _interp(COMPOSITION_ANCHORS[t], frac)
        detail[f"{t}_{COMPOSITION_BASE[t]}_fraction"] = round(frac, 4)
        detail[f"{t}_component"] = round(val, 4)
        parts.append(val)
    return clamp01(min(parts)), detail


def score_gapmer_candidate(
    antisense_core_rna: str,
    chemistry_layout: List[Dict[str, Any]],
    gap_size: int,
    left_wing_size: int,
    right_wing_size: int,
    cleavage_motif_hits: Sequence[str],
    tissue: str = "",
) -> Tuple[float, Dict[str, float], List[str], float, float, float]:
    notes: List[str] = []
    breakdown: Dict[str, float] = {}

    gc = gc_fraction(antisense_core_rna)
    tm, tm_modification_bonus_c = estimate_tm_with_modifications(antisense_core_rna, chemistry_layout)
    self_comp = max_self_complementary_stretch(antisense_core_rna)
    homopolymer = longest_homopolymer(antisense_core_rna)
    g_run = longest_g_run(antisense_core_rna)

    breakdown["gc"] = plateau_score(gc, low=0.40, high=0.60, soft_margin=0.15)
    breakdown["tm"] = plateau_score(tm, low=55.0, high=65.0, soft_margin=12.0)
    breakdown["gap_size"] = triangular_score(gap_size, ideal=9.0, half_width=2.0)
    breakdown["wing_balance"] = triangular_score(abs(left_wing_size - right_wing_size), ideal=0.0, half_width=2.0)
    breakdown["self_complementarity"] = clamp01(1.0 - max(0, self_comp - 4) / 6.0)
    breakdown["repeat_penalty"] = clamp01(1.0 - max(0, homopolymer - 3) / 3.0)
    breakdown["g_run_penalty"] = clamp01(1.0 - max(0, g_run - 3) / 3.0)
    breakdown["cpg_penalty"] = 0.4 if has_cpg_motif(antisense_core_rna) else 1.0
    breakdown["palindrome_penalty"] = 0.0 if is_palindrome(antisense_core_rna, min_len=6) else 1.0
    breakdown["simple_repeat_penalty"] = 0.0 if has_simple_repeat(antisense_core_rna) else 1.0
    breakdown["gap_cleavage_motif_clear"] = 0.0 if cleavage_motif_hits else 1.0

    # Weighted score in [0, 1]. The gap cleavage motif screen is a hard gate.
    weights = {
        "gc": 0.18,
        "tm": 0.20,
        "gap_size": 0.08,
        "wing_balance": 0.05,
        "self_complementarity": 0.12,
        "repeat_penalty": 0.08,
        "g_run_penalty": 0.08,
        "cpg_penalty": 0.06,
        "palindrome_penalty": 0.05,
        "simple_repeat_penalty": 0.05,
        "gap_cleavage_motif_clear": 0.05,
    }
    weighted = sum(weights[k] * breakdown[k] for k in weights)

    # Composition rides on top of the intrinsic block, which is rescaled so the total stays
    # in [0, 1]. With no tissue requested this is a no-op and the score is bit-identical to
    # what it was before the term existed.
    comp, comp_detail = composition_component(antisense_core_rna, tissue)
    if comp is not None:
        weighted = (1.0 - COMPOSITION_WEIGHT) * weighted + COMPOSITION_WEIGHT * comp
        breakdown["composition_tolerability"] = round(comp, 6)
        for k, v in comp_detail.items():
            breakdown[k] = v

    final_score = 0.0 if cleavage_motif_hits else clamp01(weighted)

    notes.append(f"GC% = {gc * 100:.1f}; GC component = {breakdown['gc']:.3f}")
    notes.append(f"Tm = {tm:.1f}C; Tm component = {breakdown['tm']:.3f}")
    notes.append(f"Gap size = {gap_size}; gap-size component = {breakdown['gap_size']:.3f}")
    notes.append(f"Wing balance ({left_wing_size}|{right_wing_size}) component = {breakdown['wing_balance']:.3f}")
    notes.append(f"Max self-complementary stretch = {self_comp}; component = {breakdown['self_complementarity']:.3f}")
    notes.append(f"Longest homopolymer = {homopolymer}; component = {breakdown['repeat_penalty']:.3f}")
    notes.append(f"Longest G run = {g_run}; component = {breakdown['g_run_penalty']:.3f}")
    if has_cpg_motif(antisense_core_rna):
        notes.append("Contains CpG motif")
    if is_palindrome(antisense_core_rna, min_len=6):
        notes.append("Palindrome / strong self-symmetry detected")
    if has_simple_repeat(antisense_core_rna):
        notes.append("Repetitive sequence detected")
    if cleavage_motif_hits:
        notes.append("Excluded because the internal DNA gap matches forbidden endonuclease cleavage motif(s): " + ", ".join(cleavage_motif_hits))
    else:
        notes.append("Internal DNA gap is clear of configured endonuclease cleavage motifs")
    if comp is not None:
        t = (tissue or "").lower()
        for key in ("cns", "liver"):
            fk = f"{key}_{COMPOSITION_BASE[key]}_fraction"
            if fk in comp_detail:
                notes.append(
                    f"{key.upper()} composition rule: {COMPOSITION_BASE[key]} = "
                    f"{comp_detail[fk] * 100:.1f}%; component = {comp_detail[f'{key}_component']:.3f} "
                    f"(target band {'G 10-20%' if key == 'cns' else 'A 15-35%'})")
        if t in ("cns", "both") and comp_detail.get("cns_G_fraction", 0) >= 0.30:
            notes.append("G content >= 30%: strictly dominated -- ~73% severe-FOB rate in the "
                         "reference corpus with no measurable potency benefit over the 10-20% band")
        if t in ("cns", "both") and 0 < comp_detail.get("cns_G_fraction", 1) < 0.10:
            notes.append("G content < 10%: best tolerability band, but costs ~10.7 points of "
                         "in vitro knockdown versus the 10-20% optimum")
        notes.append("Composition rule is derived from patent tolerability tables and is "
                     "survivorship-censored; it is a prior for window choice, not a screen")
    notes.append(f"Tm includes modification bonus of +{tm_modification_bonus_c:.2f}C from wing chemistry")
    notes.append("Score is directly computed on a 0-1 scale; no min-max normalization step is used")
    notes.append("Structured RNA accessibility and protein-bound sites are not modeled explicitly in this heuristic scorer")

    return (
        round(final_score, 6),
        {k: round(v, 6) for k, v in breakdown.items()},
        notes,
        round(gc * 100, 2),
        round(tm, 2),
        tm_modification_bonus_c,
    )


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
    candidates: List[GapmerCandidate],
    top_n: int,
    min_separation: int = 0,
) -> List[GapmerCandidate]:
    selected: List[GapmerCandidate] = []
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


def generate_gapmer_candidates(
    long_sequence: str,
    lengths: Iterable[int] = (16, 17, 18, 19, 20),
    gap_sizes: Iterable[int] = (8, 9, 10),
    output_alphabet: str = "DNA",
    strand: int = 1,
    wing_modification: str = "LNA",
    default_backbone: str = "PS",
    po_link_positions: Iterable[int] = (),
    helm_symbols: Dict[str, Any] | None = None,
    endonuclease_motifs: Sequence[str] | None = None,
    exclude_gap_cleavage_motif_hits: bool = True,
    tissue: str = "",
) -> List[GapmerCandidate]:
    seq_rna = clean_sequence(long_sequence)
    lengths = list(lengths)
    gap_sizes = list(gap_sizes)

    if any(length < 16 or length > 20 for length in lengths):
        raise ValueError("Gapmer lengths must be between 16 and 20 nt")
    if any(g < 8 or g > 10 for g in gap_sizes):
        raise ValueError("Gap sizes must be between 8 and 10 nt")
    if strand not in (-1, 1):
        raise ValueError("strand must be either -1 or 1")

    wing_modification = normalize_wing_mod(wing_modification)
    default_backbone = normalize_backbone(default_backbone)
    symbol_map = build_symbol_map(helm_symbols)
    motifs_dna = normalize_motif_list(endonuclease_motifs or DEFAULT_ENDONUCLEASE_MOTIFS_DNA)

    results: List[GapmerCandidate] = []

    for length in lengths:
        valid_gap_sizes = [g for g in gap_sizes if g < length]
        for gap_size in valid_gap_sizes:
            left_wing_size, right_wing_size = choose_gap_layout(length, gap_size)

            for i in range(0, len(seq_rna) - length + 1):
                target_site_rna = seq_rna[i:i + length]
                antisense_core_rna = reverse_complement_rna(target_site_rna) if strand == 1 else complement_rna(target_site_rna)
                antisense_display = to_requested_alphabet(antisense_core_rna, output_alphabet)
                target_display = to_requested_alphabet(target_site_rna, output_alphabet)

                backbone_pattern = build_backbone_pattern(
                    length=length,
                    default_backbone=default_backbone,
                    po_positions=po_link_positions,
                )

                chemistry_layout = build_chemistry_layout(
                    antisense_display=antisense_display,
                    left_wing_size=left_wing_size,
                    gap_size=gap_size,
                    right_wing_size=right_wing_size,
                    wing_modification=wing_modification,
                    backbone_pattern=backbone_pattern,
                )

                gap_start_1based = left_wing_size 
                gap_end_1based = left_wing_size + gap_size
                gap_sequence_rna = antisense_core_rna[left_wing_size:left_wing_size + gap_size]
                gap_sequence_input_alphabet = to_requested_alphabet(gap_sequence_rna, output_alphabet)
                cleavage_motif_hits = find_gap_cleavage_motif_hits(gap_sequence_rna, motifs_dna)

                if exclude_gap_cleavage_motif_hits and cleavage_motif_hits:
                    continue

                (score, score_breakdown, notes, gc_percent, tm_c,
                 tm_modification_bonus_c) = score_gapmer_candidate(
                    antisense_core_rna=antisense_core_rna,
                    chemistry_layout=chemistry_layout,
                    gap_size=gap_size,
                    left_wing_size=left_wing_size,
                    right_wing_size=right_wing_size,
                    cleavage_motif_hits=cleavage_motif_hits,
                    tissue=tissue,
                )

                structure = build_helm_structure(
                    chemistry_layout=chemistry_layout,
                    symbol_map=symbol_map,
                )

                results.append(
                    GapmerCandidate(
                        rank=0,
                        start=i + 1,
                        end=i + length,
                        length=length,
                        target_site_rna=target_site_rna,
                        target_site_input_alphabet=target_display,
                        antisense_core_rna=antisense_core_rna,
                        antisense_display=antisense_display,
                        gc_percent=gc_percent,
                        tm_c=tm_c,
                        tm_method="wallace_plus_modification_bonus",
                        tm_modification_bonus_c=tm_modification_bonus_c,
                        gap_start_1based=gap_start_1based,
                        gap_end_1based=gap_end_1based,
                        gap_size=gap_size,
                        left_wing_size=left_wing_size,
                        right_wing_size=right_wing_size,
                        gap_sequence_rna=gap_sequence_rna,
                        gap_sequence_input_alphabet=gap_sequence_input_alphabet,
                        wing_modification=wing_modification,
                        backbone_pattern=backbone_pattern,
                        chemistry_layout=chemistry_layout,
                        structure=structure,
                        notes=notes,
                        score=score,
                        normalized_score=score,
                        score_breakdown=score_breakdown,
                        cleavage_motif_hits=list(cleavage_motif_hits),
                    )
                )

    # RANK ORDER over the whole sequence space. Score first; the rest only settles ties,
    # and what settles them matters, because with plateau-shaped components thousands of
    # candidates score identically.
    #
    # The old key was (score, tm_c desc, |gc-50| asc, length asc), and both of its first two
    # tie-breaks pulled the same way. Highest Tm means most GC, so a run of ties resolved
    # toward whatever the GC-richest stretch of the transcript happened to be; shortest-first
    # then made the length a coin toss won by 16 every time. On a 3 kb test sequence that put
    # 96 of the top 100 at 16 nt and a fifth of them on top of the single best site.
    #
    # Now: Tm NEAREST the middle of the useful window rather than highest, GC nearest 50%,
    # and the LONGER candidate ahead of the shorter one -- more sequence read is more
    # specificity, which is the right thing to prefer when nothing else separates two sites.
    results.sort(key=lambda x: (-x.score, abs(x.tm_c - 60.0), abs(x.gc_percent - 50.0), -x.length))
    for idx, candidate in enumerate(results, start=1):
        candidate.rank = idx
    return results


def parse_request(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, str):
        return {
            "sequence": payload,
            "strand": 1,
            "top_n": 20,
            "lengths": [16, 17, 18, 19, 20],
            "gap_sizes": [8, 9, 10],
            "wing_modification": "LNA",
            "default_backbone": "PS",
            "po_link_positions": [],
            "output_alphabet": "DNA",
            "helm_symbols": {},
            "enforce_non_overlapping": True,
            "min_separation": 0,
            "endonuclease_motifs": list(DEFAULT_ENDONUCLEASE_MOTIFS_DNA),
            "exclude_gap_cleavage_motif_hits": True,
            "offtarget_index": None,
            "offtarget_edit_distance": 2,
            "offtarget_oversample": 3,
            "offtarget_screen_cap": 400,
            "on_target_symbols": [],
            "tissue": "",
        }

    if isinstance(payload, dict):
        strand = int(payload.get("strand", 1))
        if strand not in (-1, 1):
            raise ValueError("strand must be either -1 or 1")

        helm_symbols = payload.get("helm_symbols", {}) or {}
        if not isinstance(helm_symbols, dict):
            raise ValueError("helm_symbols must be an object mapping chemistry names to monomer symbols")

        motifs = payload.get("endonuclease_motifs", DEFAULT_ENDONUCLEASE_MOTIFS_DNA)
        if motifs is None:
            motifs = []
        if not isinstance(motifs, list):
            raise ValueError("endonuclease_motifs must be an array of DNA motif strings")

        return {
            "sequence": payload.get("sequence", ""),
            "strand": strand,
            "top_n": int(payload.get("top_n", 20)),
            "lengths": list(payload.get("lengths", [16, 17, 18, 19, 20])),
            "gap_sizes": list(payload.get("gap_sizes", [8, 9, 10])),
            "wing_modification": str(payload.get("wing_modification", "LNA")),
            "default_backbone": str(payload.get("default_backbone", "PS")),
            "po_link_positions": list(payload.get("po_link_positions", [])),
            "output_alphabet": str(payload.get("output_alphabet", "DNA")).upper(),
            "helm_symbols": helm_symbols,
            # DEFAULT TRUE. See the note on the selection step in design_gapmer_sites():
            # taking the global top N with overlaps allowed does not return the best N ASOs,
            # it returns the best site written out N times at one-base offsets.
            "enforce_non_overlapping": bool(payload.get("enforce_non_overlapping", True)),
            "min_separation": int(payload.get("min_separation", 0)),
            "endonuclease_motifs": list(motifs),
            "exclude_gap_cleavage_motif_hits": bool(payload.get("exclude_gap_cleavage_motif_hits", True)),
            # Off-target screen. No index named, no screen -- and the design then runs exactly
            # as it did before this existed, which is what makes it safe to ask for by default
            # from a caller that may or may not have an index to offer.
            "offtarget_index": payload.get("offtarget_index") or None,
            "offtarget_edit_distance": int(payload.get("offtarget_edit_distance", 2)),
            # How many ranked sites to screen for every one returned. The screen can only
            # reorder what it sees, so this is the room the penalty has to work in: at 3, a
            # site has to be beaten by three others to be pushed out of the answer.
            "offtarget_oversample": max(1, int(payload.get("offtarget_oversample", 3))),
            "offtarget_screen_cap": max(1, int(payload.get("offtarget_screen_cap", 400))),
            "on_target_symbols": list(payload.get("on_target_symbols", []) or []),
            # "" (off), "cns", "liver" or "both". OFF BY DEFAULT: the composition rules are
            # organ-specific and opposite in direction, so applying one to the wrong
            # programme is worse than applying neither, and an existing caller that does not
            # set this gets exactly the scores it got before the term existed.
            "tissue": str(payload.get("tissue", "") or "").strip().lower(),
        }

    raise ValueError("Input must be either a sequence string or a JSON object.")


def design_gapmer_sites(payload: Any) -> Dict[str, Any]:
    request = parse_request(payload)

    raw_sequence = request["sequence"]
    strand = request["strand"]
    top_n = request["top_n"]
    lengths = request["lengths"]
    gap_sizes = request["gap_sizes"]
    wing_modification = request["wing_modification"]
    default_backbone = request["default_backbone"]
    po_link_positions = request["po_link_positions"]
    output_alphabet = request["output_alphabet"]
    helm_symbols = request["helm_symbols"]
    enforce_non_overlapping = request["enforce_non_overlapping"]
    min_separation = request["min_separation"]
    endonuclease_motifs = normalize_motif_list(request["endonuclease_motifs"])
    exclude_gap_cleavage_motif_hits = request["exclude_gap_cleavage_motif_hits"]
    tissue = request.get("tissue", "")
    offtarget_index = request["offtarget_index"]
    offtarget_edit_distance = request["offtarget_edit_distance"]
    offtarget_oversample = request["offtarget_oversample"]
    offtarget_screen_cap = request["offtarget_screen_cap"]
    on_target_symbols = request["on_target_symbols"]

    normalized_rna = clean_sequence(raw_sequence)
    symbol_map = build_symbol_map(helm_symbols)

    # Say what the algorithm is doing, stage by stage. A gapmer run over a long transcript can
    # take a while, and it used to report only "Top candidates: N" at the very end -- so until
    # then the user could not tell a slow design from a stuck one, or know what was being
    # tried on their behalf.
    works.msg(
        "Reading target: %d nt, %s strand"
        % (len(normalized_rna), "minus" if strand < 0 else "plus")
    )
    works.progress(5)
    # The MODALITY and the CHEMISTRY, in the words a chemist would use, before anything runs.
    # The parameters were reported as raw fields -- "2'-MOE wings, PS backbone" -- which is the
    # data but not the design: what a reader wants to know first is whether this is a gapmer or
    # a mixmer and what it is made of.
    #
    # gapmer vs mixmer is decided by the gap, not by a setting: a contiguous DNA gap flanked by
    # modified wings is a gapmer, and a design with no gap left to cut is a mixmer, which works
    # by affinity rather than by recruiting RNase H. The distinction changes what the compound
    # DOES, so it is named rather than left to be inferred from a number.
    _gaps = sorted(set(gap_sizes))
    _modality = "Gapmer" if min(_gaps) > 0 else "Mixmer"
    _layouts = ", ".join(
        "%d-%d-%d" % ((ln - g) // 2, g, ln - g - (ln - g) // 2)
        for ln in sorted(set(lengths)) for g in _gaps
    )
    works.msg(
        "%s ASO with %s wings and a %s backbone%s"
        % (_modality, wing_modification, default_backbone,
           (" (DNA gap for RNase H)" if _modality == "Gapmer"
            else " (no DNA gap - affinity only, no RNase H)"))
    )
    works.msg("Layouts being tiled (wing-gap-wing): %s" % _layouts)
    works.progress(15)

    all_candidates = generate_gapmer_candidates(
        long_sequence=raw_sequence,
        lengths=lengths,
        gap_sizes=gap_sizes,
        output_alphabet=output_alphabet,
        strand=strand,
        wing_modification=wing_modification,
        default_backbone=default_backbone,
        po_link_positions=po_link_positions,
        helm_symbols=helm_symbols,
        endonuclease_motifs=endonuclease_motifs,
        exclude_gap_cleavage_motif_hits=exclude_gap_cleavage_motif_hits,
        tissue=tissue,
    )

    # What the scoring pass actually cost, and what the motif filter removed -- a design that
    # comes back with few candidates is usually explained by one of these two numbers.
    works.progress(70)
    works.msg(
        "Scored %d candidate gapmer%s%s"
        % (len(all_candidates),
           "" if len(all_candidates) == 1 else "s",
           " (endonuclease-motif hits excluded)" if exclude_gap_cleavage_motif_hits else "")
    )

    # SELECTION. Every candidate above was scored; this decides which of them come back.
    #
    # The default walks the ranking from the top and takes a candidate only if it does not
    # overlap one already taken. That is what makes the result a design ACROSS the sequence:
    # #1 is the best ASO anywhere in the transcript, #2 is the best one that is not the same
    # ASO again, and so on down.
    #
    # Straight top-N is what this used to do, and it does not mean what it looks like. Every
    # start position is generated at five lengths and three gap sizes, and neighbouring starts
    # differ by one base, so the fifteen-odd variants of one good site all score within noise
    # of each other and sit together at the top of the list. Measured on a 3 kb sequence:
    # 44,025 candidates scored, and the top 100 held 49 distinct start positions, 21 of them
    # overlapping the single best site, covering 7.9% of the transcript. It is available as
    # enforce_non_overlapping: false for a caller that wants the layout variants of a site.
    # The off-target screen is a funnel, not another term in the loop above. Searching a
    # transcriptome for all 44,000-odd candidates would take hours; searching the best few
    # hundred takes seconds, and the ones it would have rejected further down were never
    # going to be returned anyway. So: rank on the intrinsic terms, take MORE sites than
    # asked for, screen those, re-score, and keep the best of them.
    #
    # The oversample is the room the penalty has. Screening exactly top_n could only reorder
    # the answer; screening 3x can change which sites are in it.
    screen = _load_offtarget_search() if offtarget_index else None
    want = (top_n * offtarget_oversample) if screen else top_n
    if screen:
        want = min(want, offtarget_screen_cap)

    if enforce_non_overlapping:
        works.msg(
            "Ranking every candidate, then taking the best %d sites%s"
            % (want, (" at least %d nt apart" % min_separation) if min_separation else ", non-overlapping")
        )
        top_candidates = select_top_non_overlapping(
            all_candidates,
            top_n=want,
            min_separation=min_separation,
        )
    else:
        works.msg("Taking the best %d by score, overlapping layouts of one site included" % want)
        top_candidates = all_candidates[:want]

    offtarget_report: Dict[str, Any] = {
        "requested": bool(offtarget_index),
        "ran": False,
        "index": offtarget_index or None,
        "edit_distance": offtarget_edit_distance,
        "screened": 0,
        "reason": None,
    }
    if offtarget_index and not screen:
        offtarget_report["reason"] = (
            "off-target search is unavailable in this interpreter (numpy or "
            "py/sequence/offtarget/search.py missing); scored on sequence terms only"
        )
        works.msg(offtarget_report["reason"])
    elif screen and top_candidates:
        works.msg(
            "Screening %d sites against %s at edit distance %d"
            % (len(top_candidates), offtarget_index, offtarget_edit_distance)
        )
        try:
            probe = [
                {"id": i, "synthesisSequence": to_requested_alphabet(c.antisense_core_rna, "DNA")}
                for i, c in enumerate(top_candidates)
            ]
            res = screen.search(offtarget_index, probe, offtarget_edit_distance, "+-")
            rows = (res or {}).get("oligoQuery", []) or []
            for i, c in enumerate(top_candidates):
                hits = rows[i].get("offtarget", []) if i < len(rows) else []
                burden, counts, symbols = offtarget_burden_from_hits(hits, on_target_symbols)
                comp = offtarget_component(burden)
                c.offtarget_screened = True
                c.offtarget_index = str(offtarget_index)
                c.offtarget_edit_distance = int(offtarget_edit_distance)
                c.offtarget_genes_by_distance = {str(k): int(v) for k, v in counts.items()}
                c.offtarget_burden = round(burden, 4)
                c.offtarget_component = round(comp, 6)
                c.offtarget_symbols = symbols
                c.intrinsic_score = c.score
                c.score_breakdown = dict(c.score_breakdown)
                c.score_breakdown["offtarget"] = round(comp, 6)
                # The intrinsic terms keep 0.80 of the score. Every candidate being ranked
                # here has been screened, so the two are compared on the same basis.
                c.score = round((1.0 - OFFTARGET_WEIGHT) * c.intrinsic_score
                                + OFFTARGET_WEIGHT * comp, 6)
                c.normalized_score = c.score
                c.notes = list(c.notes) + [
                    "Off-target screen (%s, ED<=%d): %s; burden %.1f, component %.3f"
                    % (offtarget_index, offtarget_edit_distance,
                       (", ".join("%d gene(s) at ED%d" % (v, int(k)) for k, v in sorted(counts.items()))
                        or "no other gene hit"),
                       burden, comp),
                    "Final score = 0.80 x sequence terms + 0.20 x off-target component",
                ]
                if symbols:
                    c.notes.append("Nearest off-targets: " + ", ".join(symbols))
            top_candidates.sort(key=lambda x: (-x.score, abs(x.tm_c - 60.0),
                                               abs(x.gc_percent - 50.0), -x.length))
            top_candidates = top_candidates[:top_n]
            for idx, c in enumerate(top_candidates, start=1):
                c.rank = idx
            offtarget_report["ran"] = True
            offtarget_report["screened"] = len(probe)
            works.msg("Off-target screen applied; kept the best %d of %d screened"
                      % (len(top_candidates), len(probe)))
        except Exception as exc:
            # A missing index, a corrupt one, an oligo outside the searchable length -- none
            # of it should lose the design that has already been computed.
            offtarget_report["reason"] = "off-target screen failed: %s" % (exc,)
            works.msg(offtarget_report["reason"])
            top_candidates = top_candidates[:top_n]
            for idx, c in enumerate(top_candidates, start=1):
                c.rank = idx
    else:
        top_candidates = top_candidates[:top_n]

    hits: List[Dict[str, Any]] = []
    works.progress(90)
    works.msg("Top candidates: " + str(len(top_candidates)))

    # What the design actually covers. A rank-ordered design should say how much of the
    # sequence space it looked at and how much of the transcript the answer spans, because
    # those two numbers are what tell a reader whether the list is a survey of the target or
    # a pile at one site -- which is exactly what a straight top-N looks like from the
    # outside, and cannot be told from the hits alone.
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

    for candidate in top_candidates:
        hit = asdict(candidate)
        hit["score"] = float(candidate.score)
        hit["normalized_score"] = float(candidate.score)
        hit["tm_c"] = float(candidate.tm_c)
        hit["tm_modification_bonus_c"] = float(candidate.tm_modification_bonus_c)
        hits.append(hit)

    return {
        "design_type": "gapmer",
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
        "offtarget_screen": offtarget_report,
        "selection_mode": "rank_order_across_sequence_space" if enforce_non_overlapping else "global_top_n_overlaps_allowed",
        "min_separation": min_separation,
        "lengths_scanned": list(lengths),
        "gap_sizes_scanned": list(gap_sizes),
        "wing_modification": normalize_wing_mod(wing_modification),
        "default_backbone": normalize_backbone(default_backbone),
        "po_link_positions": list(po_link_positions),
        "output_alphabet": output_alphabet,
        "helm_symbols_used": symbol_map,
        "tm_model": {
            "method": "wallace_plus_modification_bonus",
            "modification_tm_bonus_c": MODIFICATION_TM_BONUS_C,
            "note": (
                "Tm is estimated as a simple Wallace baseline plus per-residue bonus terms for modified sugars. "
                "This is a heuristic approximation, not a full nearest-neighbor thermodynamic model."
            ),
        },
        "score_model": {
            "method": "direct_weighted_score_0_to_1",
            "score_note": "score is directly computed in [0,1] from weighted component scores; no request-level min-max normalization is used.",
            "rank_note": (
                "Every candidate over the whole sequence space is scored and ranked. Ties -- which are "
                "common, because the GC and Tm components are plateaus -- are settled by Tm nearest 60C, "
                "then GC nearest 50%, then the longer candidate, so a run of equal scores does not "
                "resolve toward the GC-richest stretch of the transcript."
            ),
            "offtarget_note": (
                "When an index is named, the best sites are additionally screened against it "
                "with py/sequence/offtarget/search.py and the final score becomes 0.80 x the "
                "sequence terms + 0.20 x an off-target component. The component is "
                "1/(1 + burden/40), where burden weights DISTINCT GENE SYMBOLS hit at each "
                "edit distance (ED0 x40, ED1 x8, ED2 x0.35, ED3 x0.05) and one gene at ED0 is "
                "subtracted as the intended target unless on_target_symbols names it."
            ),
            "selection_note": (
                "Selection then walks that ranking from the top and takes a candidate only if it does not "
                "overlap one already taken, so rank 1 is the best ASO anywhere in the transcript and rank 2 "
                "is the best one that is not the same ASO again."
            ),
            "hard_filter_note": "Candidates are excluded by default if the internal DNA gap matches any configured endonuclease cleavage motif.",
        },
        "endonuclease_screen": {
            "enabled": True,
            "exclude_gap_cleavage_motif_hits": exclude_gap_cleavage_motif_hits,
            "motifs_dna": endonuclease_motifs,
            "scope": "internal_gap_only",
            "matching_rule": "motif or reverse-complement motif found within the internal DNA gap",
        },
        "total_candidates": len(all_candidates),
        "returned_candidates": len(top_candidates),
        "top_score": float(top_candidates[0].score) if top_candidates else None,
        "top_normalized_score": float(top_candidates[0].normalized_score) if top_candidates else None,
        "design_rules": {
            "length_rule": "Gapmer ASOs typically 16-20 nt",
            "gap_rule": "Central DNA gap typically 8-10 nt",
            "wing_rule": "Modified wings improve stability and affinity",
            "gc_rule": "Prefer 40-60% GC",
            # Only present when a tissue is requested, so a caller that does not use the
            # feature sees the same design_rules block it always saw.
            **({"composition_rule": {
                "tissue": tissue,
                "cns": "Prefer G 10-20% of the oligo. Severe FOB rate rises 6% -> 22% -> 51% "
                       "-> 73% across <10 / 10-20 / 20-30 / >=30% G (n=1845 gapmers, 5/5 CNS "
                       "programmes). G >= 30% is strictly dominated: no measurable potency "
                       "benefit over the 10-20% band. Below 10% costs ~10.7 points of in "
                       "vitro knockdown.",
                "liver": "Prefer A 15-35%. Fraction exceeding 2x vehicle ALT falls 54% -> 48% "
                         "-> 37% -> 29% across <15 / 15-25 / 25-35 / >=35% A (n=777, mouse). "
                         "A >= 35% costs ~9.3 points of knockdown.",
                "caveat": "Derived from published patent tolerability tables, which are "
                          "survivorship-censored. The hepatic rule is mouse-only and did not "
                          "transfer across species. A confirmation attempt on an independent "
                          "CNS endpoint (AIF1/GFAP) was null and underpowered. Use as a prior "
                          "for window selection, not as a substitute for a tolerability screen.",
                "distinct_from_g_run_penalty": "This is base COMPOSITION, not run structure. "
                       "Adjusting the composition effect for longest G-run, GGG count and "
                       "G4Hunter leaves it intact while those collapse to ~0; no sequence in "
                       "the reference corpus could form a G-quadruplex.",
            }} if tissue else {}),
            "tm_rule": "Prefer Tm around 55-65C after applying modification-aware adjustment",
            "avoid": [
                "CpG motifs",
                "long G runs",
                "palindromes",
                "self-complementarity",
                "repetitive sequences",
                "internal-gap endonuclease cleavage motifs",
                "highly structured regions",
                "protein-bound sites"
            ],
            "note": (
                "This script uses sequence-based heuristics only. "
                "It does not explicitly model RNA accessibility, RNA structure, or protein occupancy."
            )
        },
        "helm_note": "The structure field is returned as HELM using the configured monomer symbols.",
        "hits": hits,
        "top_candidates": hits,
    }


def _main() -> int:
    payload = works.param(1)
    works.resolve(design_gapmer_sites(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
