



def predict_structure_and_calculate_ratios(peptide_sequence):
    # Definitions based on simplified propensities
    helix_prone = 'ALMQKRH'
    strand_prone = 'VIYFWT'

    # Counters for helix and strand residues
    helix_count = 0
    strand_count = 0

    # Predict secondary structure and count
    for amino_acid in peptide_sequence:
        if amino_acid in helix_prone:
            helix_count += 1
        elif amino_acid in strand_prone:
            strand_count += 1

    # Calculate the ratio (H:E)
    if strand_count == 0:  # Prevent division by zero
        helix_strand_ratio = "Undefined"  # Strand count is zero, cannot divide
    else:
        helix_strand_ratio = helix_count / strand_count

    # Normalize the ratio by the length of the protein sequence
    normalized_ratio = helix_strand_ratio / len(peptide_sequence)

    return normalized_ratio

