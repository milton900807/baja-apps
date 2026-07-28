import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt
import json

from sklearn.discriminant_analysis import StandardScaler

polygons = works.param(1)

# Sample set of DNA sequences (replace this with your actual data)
dna_sequences = [
    "ATCG", "ATGC", "CGTA", "GCGC", "TATA",
    "CGCG", "AAAA", "TTTT", "GGGG", "CCCC"
]

# Step 1: Calculate nucleotide composition
def calculate_nucleotide_composition(sequences):
    composition_vectors = []
    for seq in sequences:
        total_length = len(seq)
        comp_vector = [
            seq.count('A') / total_length,
            seq.count('T') / total_length,
            seq.count('C') / total_length,
            seq.count('G') / total_length
        ]
        composition_vectors.append(comp_vector)
    return np.array(composition_vectors)

composition_vectors = calculate_nucleotide_composition(dna_sequences)

# Step 2: Standardize the data (important for clustering)
scaler = StandardScaler()
composition_vectors_scaled = scaler.fit_transform(composition_vectors)

# Step 3: Apply clustering algorithm (e.g., K-means)
kmeans = KMeans(n_clusters=3, random_state=42)  # Adjust the number of clusters as needed
clusters = kmeans.fit_predict(composition_vectors_scaled)

# Step 4: Apply PCA to reduce to 2 dimensions for scatterplot
pca = PCA(n_components=2)
pca_result = pca.fit_transform(composition_vectors_scaled)

# Step 5: Create scatterplot data
scatter_plot_data = {
    "title": "DNA Sequence Clustering by Nucleotide Composition",
    "xlabel": "Principal Component 1",
    "ylabel": "Principal Component 2",
    "points": []
}

for i, seq in enumerate(dna_sequences):
    scatter_plot_data["points"].append({
        "sequence": seq,
        "x": float(pca_result[i, 0]),
        "y": float(pca_result[i, 1]),
        "cluster": int(clusters[i])  # Add cluster label
    })

# Step 6: Convert the scatter plot data to JSON
scatter_plot_json = json.dumps(scatter_plot_data, indent=4)

# Output the JSON object
print(scatter_plot_json)
