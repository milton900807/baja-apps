import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from scipy.spatial.distance import cdist
from tqdm import tqdm

def cluster_tissues(file_path, n_clusters=3):
    """
    Clusters tissues based on gene expression profiles using PCA and K-means.

    :param file_path: Path to the TPM dataset (genes as rows, tissues as columns).
    :param n_clusters: Number of clusters to use for K-means.
    """
    print("[INFO] Loading dataset...")
    df = pd.read_excel(file_path)
    
    if df.shape[1] < 3:
        raise ValueError("Dataset must have at least three columns: Symbol, Gene ID, and expression values.")
    
    if 'symbol' not in df.columns:
        raise ValueError("Expected a 'symbol' column with gene names.")
    
    print("[INFO] Extracting and processing gene expression data...")
    gene_names = df['symbol'].values
    expression_data = df.iloc[:, 2:].T
    tissue_names = expression_data.index
    
    scaler = StandardScaler()
    expression_data_scaled = scaler.fit_transform(expression_data)
    
    print("[INFO] Applying PCA...")
    pca = PCA(n_components=2)
    reduced_data = pca.fit_transform(expression_data_scaled)
    
    print("[INFO] Determining optimal number of clusters using elbow method...")
    distortions = []
    K = range(1, 10)
    for k in tqdm(K, desc="Elbow Method Progress"):
        kmeans = KMeans(n_clusters=k, random_state=42)
        kmeans.fit(reduced_data)
        distortions.append(sum(np.min(cdist(reduced_data, kmeans.cluster_centers_, 'euclidean'), axis=1)) / reduced_data.shape[0])
    
    print("[INFO] Saving elbow method plot...")
    plt.figure(figsize=(12, 8))
    plt.plot(K, distortions, 'bo-', markersize=8, label='Distortion')
    plt.xlabel('Number of Clusters')
    plt.ylabel('Distortion')
    plt.title('Elbow Method for Optimal K')
    plt.legend()
    plt.savefig('elbow_method.png', dpi=600, bbox_inches='tight')
    plt.close()
    
    print("[INFO] Applying K-means clustering...")
    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    clusters = kmeans.fit_predict(reduced_data)
    
    print("[INFO] Saving tissue clustering plot...")
    plt.figure(figsize=(12, 8))
    plt.scatter(reduced_data[:, 0], reduced_data[:, 1], c=clusters, cmap='viridis', alpha=0.8, edgecolors='k', s=100)
    
    for i, tissue in enumerate(tissue_names):
        plt.annotate(tissue, (reduced_data[i, 0], reduced_data[i, 1]), fontsize=10, alpha=0.75)
    
    plt.xlabel('PCA Component 1')
    plt.ylabel('PCA Component 2')
    plt.title('Tissue Clustering using PCA and K-means')
    plt.colorbar(label='Cluster')
    plt.savefig('tissue_clustering.png', dpi=600, bbox_inches='tight')
    plt.close()
    
    print("[INFO] Clustering completed. Results saved.")
    return dict(zip(tissue_names, clusters))

# Example usage
file_path = "../../tpm.xlsx"
cluster_results = cluster_tissues(file_path, n_clusters=4)
print(cluster_results)
