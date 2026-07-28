import matplotlib.pyplot as plt
import numpy as np
import random

# Define a simple secondary structure probability table
# (based on amino acid propensities for helix, strand, and coil)
secondary_structure_probs = {
    "A": (0.90, 0.03, 0.07),  # High helix probability
    "C": (0.77, 0.07, 0.16),
    "D": (0.13, 0.09, 0.78),  # High coil probability
    "E": (0.67, 0.04, 0.29),
    "F": (0.42, 0.54, 0.04),
    "G": (0.12, 0.02, 0.86),  # High coil probability
    "H": (0.27, 0.21, 0.52),
    "I": (0.53, 0.40, 0.07),
    "K": (0.24, 0.11, 0.65),
    "L": (0.60, 0.30, 0.10),
    "M": (0.63, 0.27, 0.10),
    "N": (0.12, 0.20, 0.68),
    "P": (0.10, 0.05, 0.85),  # Disrupts helices
    "Q": (0.36, 0.19, 0.45),
    "R": (0.29, 0.10, 0.61),
    "S": (0.16, 0.22, 0.62),
    "T": (0.22, 0.35, 0.43),
    "V": (0.50, 0.40, 0.10),
    "W": (0.41, 0.47, 0.12),
    "Y": (0.21, 0.49, 0.30),
}

# Read generated peptide sequences
def load_generated_sequences(file_path="optimal_epitopes.txt"):
    with open(file_path, "r") as f:
        sequences = [line.strip() for line in f.readlines()]
    return sequences

# Predict secondary structure
def predict_secondary_structure(sequence):
    structure = []
    for aa in sequence:
        if aa in secondary_structure_probs:
            helix, strand, coil = secondary_structure_probs[aa]
            choice = random.choices(["H", "E", "C"], [helix, strand, coil])[0]  # Randomly assign based on probabilities
            structure.append(choice)
        else:
            structure.append("C")  # Default to coil for unknown amino acids
    return "".join(structure)

# Plot secondary structure for peptides
def plot_secondary_structure(sequences, structures):
    plt.figure(figsize=(12, 6))
    for i, (seq, struct) in enumerate(zip(sequences, structures)):
        x = np.arange(len(seq))
        y = np.full_like(x, i, dtype=np.float32)
        colors = {"H": "red", "E": "blue", "C": "gray"}  # Helix, Strand, Coil
        
        for j, s in enumerate(struct):
            plt.scatter(x[j], y[j], color=colors[s], s=50)
    
    plt.xlabel("Residue Position")
    plt.ylabel("Peptide Index")
    plt.title("Predicted Secondary Structure of Generated Peptides")
    plt.xticks([])
    plt.yticks(range(len(sequences)), [f"Peptide {i+1}" for i in range(len(sequences))])
    plt.savefig("generated_epitope_secondary_structure.png")
    plt.show()

# Main execution
def main():
    sequences = load_generated_sequences()
    if not sequences:
        print("No sequences found in file.")
        return
    
    structures = [predict_secondary_structure(seq) for seq in sequences]
    plot_secondary_structure(sequences, structures)
    print("Secondary structure plot saved as generated_epitope_secondary_structure.png")

if __name__ == "__main__":
    main()
