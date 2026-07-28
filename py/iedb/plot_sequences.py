import matplotlib.pyplot as plt
import numpy as np

# Kyte-Doolittle Hydrophobicity Scale
hydrophobicity = {
    "A": 1.8, "C": 2.5, "D": -3.5, "E": -3.5, "F": 2.8, "G": -0.4, "H": -3.2, "I": 4.5,
    "K": -3.9, "L": 3.8, "M": 1.9, "N": -3.5, "P": -1.6, "Q": -3.5, "R": -4.5, "S": -0.8,
    "T": -0.7, "V": 4.2, "W": -0.9, "Y": -1.3
}

# Load generated sequences from file
def load_generated_sequences(file_path):
    with open(file_path, "r") as f:
        sequences = [line.strip() for line in f.readlines()]
    return sequences

# Compute hydrophobicity per sequence position
def compute_hydrophobicity_profiles(sequences):
    profiles = []
    for seq in sequences:
        profile = [hydrophobicity.get(aa, 0) for aa in seq]  # Get hydrophobicity per residue
        profiles.append(profile)
    return np.array(profiles)

# Plot hydrophobicity per sequence index
def plot_hydrophobicity_profiles(profiles):
    plt.figure(figsize=(10, 6))
    for profile in profiles:
        plt.plot(profile, alpha=0.7)  # Plot each sequence hydrophobicity profile
    plt.xlabel("Residue Position")
    plt.ylabel("Hydrophobicity Score")
    plt.title("Hydrophobicity Profiles of Generated Epitope Sequences")
    plt.savefig("generated_epitope_hydrophobicity_profiles.png")  # Save figure

# Main execution
def main():
    file_path = "optimal_epitopes.txt"  # File containing generated sequences
    sequences = load_generated_sequences(file_path)
    if not sequences:
        print("No sequences found in file.")
        return

    profiles = compute_hydrophobicity_profiles(sequences)
    plot_hydrophobicity_profiles(profiles)
    print("Hydrophobicity profile plot saved as generated_epitope_hydrophobicity_profiles.png")

if __name__ == "__main__":
    main()
