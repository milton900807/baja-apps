import pandas as pd
import re
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from collections import Counter

# Hydrophobicity scale (Kyte-Doolittle scale)
hydrophobicity = {
    "A": 1.8, "C": 2.5, "D": -3.5, "E": -3.5, "F": 2.8, "G": -0.4, "H": -3.2, "I": 4.5,
    "K": -3.9, "L": 3.8, "M": 1.9, "N": -3.5, "P": -1.6, "Q": -3.5, "R": -4.5, "S": -0.8,
    "T": -0.7, "V": 4.2, "W": -0.9, "Y": -1.3
}

# Load Excel file
def load_data(file_path):
    df = pd.read_excel(file_path, header=None)
    return df

# Extract peptide sequences
def extract_peptides(df):
    peptides = df[2].dropna().astype(str).tolist()
    peptides = [pep for pep in peptides if re.fullmatch("[ACDEFGHIKLMNPQRSTVWY]+", pep)]  # Ensure only valid peptide characters
    return [pep for pep in peptides if len(pep) > 0]  # Ignore empty sequences

# Compute amino acid composition features
def compute_aa_composition(peptides):
    amino_acids = "ACDEFGHIKLMNPQRSTVWY"
    features = []
    
    for pep in peptides:
        count = Counter(pep)
        features.append([count[aa] / len(pep) for aa in amino_acids])  # Normalize by sequence length
    
    return pd.DataFrame(features, columns=list(amino_acids))

# Compute proximal hydrophobicity
def compute_proximal_hydrophobicity(peptides, window_size=3):
    features = []
    
    for pep in peptides:
        if len(pep) < window_size:
            features.append(0)  # Assign 0 if sequence is too short
            continue
        hydrophobicity_values = [hydrophobicity.get(aa, 0) for aa in pep]
        proximal_hydrophobicity = [
            sum(hydrophobicity_values[i:i+window_size]) / window_size
            for i in range(len(hydrophobicity_values) - window_size + 1)
        ]
        features.append(sum(proximal_hydrophobicity) / len(proximal_hydrophobicity))  # Average over sequence
    
    return pd.DataFrame(features, columns=["ProximalHydrophobicity"])

# Perform PCA and KMeans clustering
def analyze_features(features):
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(features)
    
    pca = PCA(n_components=2)
    reduced_features = pca.fit_transform(scaled_features)
    
    kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
    clusters = kmeans.fit_predict(reduced_features)
    
    return reduced_features, clusters

# Plot the clusters
def plot_clusters(reduced_features, clusters):
    plt.scatter(reduced_features[:, 0], reduced_features[:, 1], c=clusters, cmap='viridis', alpha=0.7)
    plt.xlabel("PCA1")
    plt.ylabel("PCA2")
    plt.title("Epitope Peptide Clusters")
    plt.colorbar()
    plt.show()

# Main function
def main():
    file_path = "epitope_data.xlsx"  # Change this to your file path
    df = load_data(file_path)
    peptides = extract_peptides(df)
    if not peptides:
        print("No valid peptides found.")
        return
    aa_features = compute_aa_composition(peptides)
    hydro_features = compute_proximal_hydrophobicity(peptides)
    features = pd.concat([aa_features, hydro_features], axis=1)
    reduced_features, clusters = analyze_features(features)
    plot_clusters(reduced_features, clusters)

if __name__ == "__main__":
    main()
