# peptide_features.py

def calculate_disulfide_bonds(sequence):
    # Your implementation here
    return sequence.count('C') // 2


def calculate_lysine_bonds(sequence):
    return sequence.count('K') 



def calculate_diamino_acid_pattern(sequence, pattern):
    """
    Generalized function to count occurrences of specified di-amino acid patterns.
    For continuous di-amino acids like CC (cysteine pairs), simply pass "CC" as the pattern.
    Pattern should be passed in upper case.
    """
    count = 0
    for i in range(len(sequence) - len(pattern) + 1):
        if sequence[i:i+len(pattern)].upper() == pattern:
            count += 1
    return count

def calculate_amino_acid_ratio(sequence, amino_acid):
    return sequence.upper().count(amino_acid.upper()) / len(sequence)

def calculate_block_copolymer_patterns(sequence):
    # Your implementation here
    hydrophobic = 'AILMFWPVG'
    hydrophilic = 'RKHDESTNQC'
    count = 0
    for i in range(len(sequence) - 5):
        if all(residue in hydrophobic for residue in sequence[i:i+3]) and all(residue in hydrophilic for residue in sequence[i+3:i+6]):
            count += 1
    return count

def calculate_lysine_ratio(sequence):
    # Your implementation here
    return sequence.count('K') / len(sequence)

def calculate_arginine_ratio(sequence):
    # Your implementation here
    return sequence.count('R') / len(sequence)




pKa_values = {
    'N_terminus': 9.69,
    'C_terminus': 2.34,
    'K': 10.54,  # Lysine
    'R': 12.48,  # Arginine
    'H': 6.04,   # Histidine
    'D': 3.86,   # Aspartic Acid
    'E': 4.25    # Glutamic Acid
}

def calculate_peptide_pKa(sequence):
    # Count the occurrences of each ionizable group in the peptide sequence
    group_counts = {group: 0 for group in pKa_values.keys()}
    group_counts['N_terminus'] = 1  # Count the N-terminus
    group_counts['C_terminus'] = 1  # Count the C-terminus
    
    for residue in sequence:
        if residue in pKa_values:
            group_counts[residue] += 1

    # Calculate the approximate pKa for the peptide
    # This simplified example averages the pKa values of the ionizable groups present
    total_pKa = sum(pKa_values[group] * count for group, count in group_counts.items())
    total_groups = sum(group_counts.values())
    average_pKa = total_pKa / total_groups if total_groups else None

    return average_pKa

peptide_features_all ={
    "Potential Disulfide Bonds": calculate_disulfide_bonds,
    "Potential L Bonds": calculate_lysine_bonds,
    "Block Copolymer Patterns": calculate_block_copolymer_patterns,
    "pKa": calculate_peptide_pKa
}

amino_acids = 'ACDEFGHIKLMNPQRSTVWY'  # Standard amino acids
for aa in amino_acids:
    peptide_features_all[f"{aa} Ratio"] = lambda sequence, aa=aa: calculate_amino_acid_ratio(sequence, aa)



# di_amino_acid_patterns = [a+a for a in amino_acids]
# for pattern in di_amino_acid_patterns:
#     peptide_features_all[f"{pattern} Pattern"] = lambda sequence, pattern=pattern: calculate_diamino_acid_pattern(sequence, pattern)

