import re
import math
import sys
from ion import works


print(sys.argv)


# ---------------------------------------------------------------------
# Configuration: edit for your chemistry
# ---------------------------------------------------------------------

MOD_TM_CORRECTIONS = {
    "LNA": 2.0,
    "2OME": 0.5,
    "2F": 0.7,
    "MOE": 1.0,
    "PS": -0.3,
    "C5_METHYL_C": 0.4,
}

BASE_ALIASES = {
    "A": "A",
    "DA": "A",
    "ADE": "A",

    "T": "T",
    "DT": "T",
    "THY": "T",

    "U": "T",
    "DU": "T",
    "URA": "T",

    "G": "G",
    "DG": "G",
    "GUA": "G",

    "C": "C",
    "DC": "C",
    "CYT": "C",
    "5MC": "C",
    "M5C": "C",
}

DNA_NN_PARAMS = {
    "AA": (-7.9, -22.2), "TT": (-7.9, -22.2),
    "AT": (-7.2, -20.4),
    "TA": (-7.2, -21.3),
    "CA": (-8.5, -22.7), "TG": (-8.5, -22.7),
    "GT": (-8.4, -22.4), "AC": (-8.4, -22.4),
    "CT": (-7.8, -21.0), "AG": (-7.8, -21.0),
    "GA": (-8.2, -22.2), "TC": (-8.2, -22.2),
    "CG": (-10.6, -27.2),
    "GC": (-9.8, -24.4),
    "GG": (-8.0, -19.9), "CC": (-8.0, -19.9),
}


def extract_polymer_block(helm):
    m = re.match(r'^\s*([A-Za-z0-9_]+)\{(.+?)\}(?:\$.*)?\s*$', helm)
    if not m:
        raise ValueError("Could not parse HELM polymer block")
    polymer_name = m.group(1)
    seq_block = m.group(2)
    return polymer_name, seq_block


def split_residues(seq_block):
    tokens = []
    buf = []
    depth_paren = 0
    depth_bracket = 0

    for ch in seq_block:
        if ch == '(':
            depth_paren += 1
        elif ch == ')':
            depth_paren -= 1
        elif ch == '[':
            depth_bracket += 1
        elif ch == ']':
            depth_bracket -= 1

        if ch == '.' and depth_paren == 0 and depth_bracket == 0:
            token = ''.join(buf).strip()
            if token:
                tokens.append(token)
            buf = []
        else:
            buf.append(ch)

    last = ''.join(buf).strip()
    if last:
        tokens.append(last)

    return tokens


def infer_mods_from_text(text):
    mods = []
    u = text.upper()

    if "LNA" in u or "[LR]" in u or "[LNA]" in u:
        mods.append("LNA")
    if "2OME" in u or "OME" in u or "MOE" in u:
        if "MOE" in u:
            mods.append("MOE")
        else:
            mods.append("2OME")
    if "2F" in u:
        mods.append("2F")
    if "PS" in u or "[S]" in u:
        mods.append("PS")
    if "5MC" in u or "M5C" in u:
        mods.append("C5_METHYL_C")

    return mods


def is_phosphate_token(token):
    t = token.strip().upper()
    return t in {"P", "RP", "SP", "[P]", "[PS]", "PS"}


def phosphate_token_is_ps(token):
    t = token.strip().upper()
    return t in {"PS", "[PS]", "SP"}


def parse_residue(token):
    raw = token.strip()

    m = re.match(r'^(.*?)(?:\()([^)]+)(?:\)(.*))$', raw)
    if not m:
        raise ValueError("Could not parse residue token: {}".format(raw))

    sugar = m.group(1).strip()
    base = m.group(2).strip()
    link = m.group(3).strip()
    mods = infer_mods_from_text(raw)

    return {
        "raw": raw,
        "sugar": sugar,
        "base": base,
        "link": link,
        "mods": mods,
    }


def canonical_base(base_token):
    cleaned = re.sub(r'[\[\]\s]', '', base_token.upper())
    cleaned = cleaned.replace('-', '').replace('_', '')

    if cleaned in BASE_ALIASES:
        return BASE_ALIASES[cleaned]

    if cleaned.startswith("D") and cleaned[1:] in BASE_ALIASES:
        return BASE_ALIASES[cleaned[1:]]

    raise ValueError("Unsupported/unknown base token: {}".format(base_token))


def parse_helm_single_strand(helm):
    polymer_name, seq_block = extract_polymer_block(helm)

    if "|" in seq_block:
        raise ValueError("Multiple polymers not supported. Single stranded only.")

    residue_tokens = split_residues(seq_block)
    if not residue_tokens:
        raise ValueError("No residues found in HELM sequence.")

    residues = []
    standalone_linkers = []

    for tok in residue_tokens:
        if is_phosphate_token(tok):
            standalone_linkers.append(tok.strip())
            continue
        residues.append(parse_residue(tok))

    if not residues:
        raise ValueError("No nucleotide residues found in HELM sequence.")

    return residues, standalone_linkers


def residues_to_sequence_and_mods(residues, standalone_linkers=None):
    if standalone_linkers is None:
        standalone_linkers = []

    seq = []
    mod_counts = {}

    for r in residues:
        b = canonical_base(r["base"])
        seq.append(b)

        for mod in r["mods"]:
            mod_counts[mod] = mod_counts.get(mod, 0) + 1

        if r["link"] and r["link"].upper() == "PS":
            mod_counts["PS"] = mod_counts.get("PS", 0) + 1

    for linker in standalone_linkers:
        if phosphate_token_is_ps(linker):
            mod_counts["PS"] = mod_counts.get("PS", 0) + 1

    return ''.join(seq), mod_counts


def complement_dna(seq):
    comp = {"A": "T", "T": "A", "G": "C", "C": "G"}
    return ''.join(comp[b] for b in seq)


def calc_tm_wallace(seq):
    at = sum(1 for b in seq if b in ("A", "T"))
    gc = sum(1 for b in seq if b in ("G", "C"))
    return 2 * at + 4 * gc


def calc_tm_nn(seq, strand_uM=2.0, na_mM=50.0):
    if len(seq) < 2:
        raise ValueError("Sequence must have length >= 2")

    dH = 0.0
    dS = 0.0

    for i in range(len(seq) - 1):
        step = seq[i:i+2]
        if step not in DNA_NN_PARAMS:
            raise ValueError("No NN parameter for dinucleotide step: {}".format(step))
        dh, ds = DNA_NN_PARAMS[step]
        dH += dh
        dS += ds

    dH += 0.2
    dS += -5.7

    terminal_at_count = int(seq[0] in "AT") + int(seq[-1] in "AT")
    dH += 2.2 * terminal_at_count
    dS += 6.9 * terminal_at_count

    R = 1.987
    ct_M = float(strand_uM) * 1e-6
    na_M = float(na_mM) * 1e-3

    if ct_M <= 0:
        raise ValueError("strand_uM must be > 0")
    if na_M <= 0:
        raise ValueError("na_mM must be > 0")

    tm_K = (1000.0 * dH) / (dS + R * math.log(ct_M / 4.0)) + 16.6 * math.log10(na_M)
    tm_C = tm_K - 273.15
    return tm_C


def apply_mod_corrections(tm_c, mod_counts):
    contributions = {}
    adjusted = tm_c

    for mod, count in mod_counts.items():
        corr = MOD_TM_CORRECTIONS.get(mod, 0.0) * count
        contributions[mod] = corr
        adjusted += corr

    return adjusted, contributions


def estimate_tm_from_helm(helm, strand_uM=2.0, na_mM=50.0):
    residues, standalone_linkers = parse_helm_single_strand(helm)
    seq, mod_counts = residues_to_sequence_and_mods(
        residues,
        standalone_linkers=standalone_linkers
    )

    if len(seq) < 8:
        baseline_tm = calc_tm_wallace(seq)
        model = "Wallace"
    else:
        baseline_tm = calc_tm_nn(seq, strand_uM=strand_uM, na_mM=na_mM)
        model = "Nearest-neighbor DNA baseline"

    adjusted_tm, contributions = apply_mod_corrections(baseline_tm, mod_counts)

    return {
        "sequence": seq,
        "complement": complement_dna(seq),
        "length": len(seq),
        "model": model,
        "baseline_tm_c": round(baseline_tm, 2),
        "mod_counts": mod_counts,
        "mod_tm_contributions_c": {k: round(v, 2) for k, v in contributions.items()},
        "adjusted_tm_c": round(adjusted_tm, 2),
        "residues": residues,
        "standalone_linkers": standalone_linkers,
    }


try:
    helm = works.param(1)
    strand_uM = works.param(2)
    na_mM = works.param(3)

    if strand_uM in [None, ""]:
        strand_uM = 2.0
    if na_mM in [None, ""]:
        na_mM = 50.0

    strand_uM = float(strand_uM)
    na_mM = float(na_mM)

    works.update({
        "status": "parsing_helm",
        "helm": helm,
        "strand_uM": strand_uM,
        "na_mM": na_mM
    })

    result = estimate_tm_from_helm(helm, strand_uM=strand_uM, na_mM=na_mM)

    works.update({
        "status": "tm_calculated",
        "sequence": result["sequence"],
        "length": result["length"],
        "baseline_tm_c": result["baseline_tm_c"],
        "adjusted_tm_c": result["adjusted_tm_c"]
    })

    print(" - - - - - - - - - - - - ")
    print("HELM:", helm)
    print("Sequence:", result["sequence"])
    print("Complement:", result["complement"])
    print("Length:", result["length"])
    print("Model:", result["model"])
    print("Baseline Tm (C):", result["baseline_tm_c"])
    print("Modification counts:", result["mod_counts"])
    print("Modification contributions (C):", result["mod_tm_contributions_c"])
    print("Adjusted Tm (C):", result["adjusted_tm_c"])
    print("Standalone linkers:", result["standalone_linkers"])
    print(" - - - - - - - - - - - - ")

    works.resolve(result)

except Exception as e:
    error_result = {
        "error": str(e),
        "status": "failed"
    }

    works.update(error_result)
    print("ERROR:", str(e))
    works.resolve(error_result)