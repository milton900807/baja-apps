import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from tqdm import tqdm
import seaborn as sns


def cluster_tissues_by_go_terms(
    tpm_file, go_file, mesenchymal_terms, n_clusters=3, output_file="mesenchymal_tissue_clusters.csv"
):
    """
    Clusters tissues based on the mean expression values of mesenchymal-associated GO terms.

    :param tpm_file: Path to the TPM dataset (genes as rows, tissues as columns).
    :param go_file: Path to the Gene Ontology dataset mapping Gene IDs to GO Terms.
    :param mesenchymal_terms: List of GO terms associated with mesenchymal properties.
    :param n_clusters: Number of clusters for K-means.
    :param output_file: Path to save the clustered tissue results.
    """
    print("[INFO] Loading datasets...")
    tpm_df = pd.read_excel(tpm_file)
    go_df = pd.read_csv(go_file)

    if "Gene ID" not in go_df.columns or "GO ID" not in go_df.columns:
        raise ValueError("GO file must contain 'Gene ID' and 'GO ID' columns.")

    if "gene ID" not in tpm_df.columns:
        raise ValueError("TPM dataset must contain a 'gene ID' column with gene names.")

    print("[INFO] Filtering genes linked to mesenchymal-associated GO terms...")
    mesenchymal_genes = go_df[go_df["GO ID"].isin(mesenchymal_terms)]["Gene ID"].unique()

    # Filter TPM dataset for mesenchymal-associated genes
    tpm_filtered = tpm_df[tpm_df["gene ID"].isin(mesenchymal_genes)]

    if tpm_filtered.empty:
        raise ValueError("No mesenchymal-associated genes found in TPM dataset.")

    print(f"[INFO] Retained {len(tpm_filtered)} mesenchymal-associated genes for clustering.")

    # Compute mean expression per tissue
    expression_data = tpm_filtered.iloc[:, 2:].T  # Transpose so tissues are rows
    tissue_names = expression_data.index
    mean_expression = expression_data.mean(axis=1).values.reshape(-1, 1)

    print("[INFO] Standardizing expression data...")
    scaler = StandardScaler()
    standardized_data = scaler.fit_transform(mean_expression)

    print("[INFO] Applying K-means clustering...")
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    clusters = kmeans.fit_predict(standardized_data)

    # Save clustering results
    results_df = pd.DataFrame({"Tissue": tissue_names, "Cluster": clusters})
    results_df.to_csv(output_file, index=False)

    print("[INFO] Clustering completed. Results saved in:", output_file)

    # Visualize clusters with improved labeling
    plt.figure(figsize=(24, 12))
    scatter = plt.scatter(
        range(len(tissue_names)),
        mean_expression.flatten(),
        c=clusters,
        cmap="viridis",
        edgecolors="k",
        s=100,
    )
    
    plt.xlabel("Tissue")
    plt.ylabel("Mean Expression of Mesenchymal-Associated Genes")
    plt.title("Tissue Clustering by Mesenchymal Expression")
    plt.colorbar(scatter, label="Cluster")
    
    # Adjust labels to avoid overlapping
    for i, tissue in enumerate(tissue_names):
        plt.text(
            i,
            mean_expression[i] + 0.05,  # Small vertical offset
            tissue,
            ha="right",
            rotation=45,
            fontsize=8
        )
    
    plt.xticks([])  # Remove xticks to avoid clutter
    plt.savefig("tissue_clustering_mesenchymal.png", dpi=600, bbox_inches="tight")
    plt.close()


# Example usage
tpm_file = "../../tpm.xlsx"
go_file = "gene_ontology_results.csv"
# go_terms = ['GO:0000380']
go_terms = ['GO:0006897']
# go_terms = [
#     "GO:0048762",  # Mesenchymal cell differentiation
#     "GO:0014031",  # Mesenchymal cell development
#     "GO:0060485",  # Mesenchyme development
#     "GO:0048701",  # Embryonic cranial skeleton morphogenesis
#     "GO:0001707",  # Mesoderm formation
#     "GO:0001657",  # Ureteric bud morphogenesis
#     "GO:0005623",  # Cell
#     "GO:0031012",  # Extracellular matrix
#     "GO:0071944",  # Cell periphery
#     "GO:0004888",  # Transmembrane signaling receptor activity
#     "GO:0003700",  # DNA-binding transcription factor activity
#     "GO:0008092",  # Cytoskeletal protein binding
# ]

cluster_tissues_by_go_terms(tpm_file, go_file, go_terms, n_clusters=4)
