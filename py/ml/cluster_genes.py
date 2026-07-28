import pandas as pd
import json
import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from scipy.stats import pearsonr
from tqdm import tqdm
import time
import os
import networkx as nx

def draw_gene_network(gene_dependencies, correlation_threshold=0.7):
    """
    Draws a network graph of gene dependencies based on Pearson correlation.

    :param gene_dependencies: Dictionary of genes and their correlated pairs
    :param correlation_threshold: Minimum absolute correlation value to draw an edge
    """
    G = nx.Graph()

    # Add edges based on correlation strength
    for gene, correlations in gene_dependencies.items():
        for correlated_gene, corr_value in correlations:
            if abs(corr_value) >= correlation_threshold:
                G.add_edge(gene, correlated_gene, weight=corr_value)

    # Plot the network
    plt.figure(figsize=(12, 10))
    pos = nx.spring_layout(G, seed=42)  # Layout for visualization
    edges = G.edges(data=True)
    
    # Draw nodes
    nx.draw_networkx_nodes(G, pos, node_size=500, node_color='lightblue', edgecolors='black')

    # Draw edges with varying transparency based on correlation strength
    edge_weights = [d["weight"] for (u, v, d) in edges]
    nx.draw_networkx_edges(G, pos, alpha=0.6, width=[3 * abs(w) for w in edge_weights])

    # Add labels
    nx.draw_networkx_labels(G, pos, font_size=10, font_weight='bold')

    plt.title("Gene Dependency Network")
    plt.savefig("gene_network.png", dpi=300, bbox_inches="tight")
    
def analyze_gene_dependencies(file_path, gene_list_file, output_file, checkpoint_file="checkpoint.json",
                              correlation_threshold=0.7, progress_interval=300, checkpoint_interval=10):
    start_time = time.time()

    # Load list of genes to process
    with open(gene_list_file, 'r') as f:
        gene_list = set(line.strip() for line in f if line.strip())  # Read and clean gene names

    print(f"[INFO] Loaded {len(gene_list)} genes from input list.")

    # Load TPM dataset
    df = pd.read_excel(file_path)

    # Ensure required columns exist
    required_columns = 3  # Symbol, Gene ID, and at least one expression column
    if df.shape[1] < required_columns:
        raise ValueError("Dataset must have at least three columns: Symbol, Gene ID, and TPM values.")

    if 'symbol' not in df.columns:
        raise ValueError("Expected a 'symbol' column with gene names.")

    # Filter dataset to only include genes in the provided list
    df_filtered = df[df['symbol'].isin(gene_list)].reset_index(drop=True)

    # Extract gene symbols and expression data
    gene_names = df_filtered['symbol'].values
    gene_data = df_filtered.iloc[:, 2:].values  # Extract TPM values

    print(f"[INFO] Filtered down to {len(gene_names)} genes for processing.")

    # Standardize gene expression data
    scaler = StandardScaler()
    gene_data_scaled = scaler.fit_transform(gene_data)

    # Try loading checkpoint if it exists
    if os.path.exists(checkpoint_file):
        print("[INFO] Resuming from last checkpoint...")
        with open(checkpoint_file, 'r') as f:
            checkpoint = json.load(f)
        gene_dependencies = checkpoint["gene_dependencies"]
        start_index = checkpoint["last_processed_gene"]
    else:
        gene_dependencies = {}
        start_index = 0

    num_genes = len(gene_names)
    progress_bar = tqdm(total=num_genes, desc="Processing Gene Correlations")
    last_update_time = start_time

    # Compute correlations efficiently
    for i in range(start_index, num_genes):
        for j in range(i + 1, num_genes):
            corr_value, _ = pearsonr(gene_data_scaled[i, :], gene_data_scaled[j, :])  # Compute correlation
            if abs(corr_value) >= correlation_threshold:
                gene_dependencies.setdefault(gene_names[i], []).append((gene_names[j], round(corr_value, 3)))
                gene_dependencies.setdefault(gene_names[j], []).append((gene_names[i], round(corr_value, 3)))

        progress_bar.update(1)

        # Progress update every X minutes
        if time.time() - last_update_time >= progress_interval:
            elapsed_time = time.time() - start_time
            print(f"[INFO] Processed {i+1}/{num_genes} genes. Elapsed time: {elapsed_time/60:.2f} min")
            last_update_time = time.time()

        # Save checkpoint every `checkpoint_interval` genes
        if i % checkpoint_interval == 0:
            checkpoint_data = {
                "last_processed_gene": i,
                "gene_dependencies": gene_dependencies
            }
            with open(checkpoint_file, 'w') as f:
                json.dump(checkpoint_data, f)
            print(f"[INFO] Checkpoint saved at gene {i}.")

    progress_bar.close()

    # Save final results as JSON
    with open(output_file, 'w') as f:
        json.dump(gene_dependencies, f, indent=4)

    print("[INFO] Processing complete.")
    return gene_dependencies

# Example usage
file_path = "../../tpm.xlsx"  # TPM dataset
gene_list_file = "../../gene_list.txt"  # File containing list of gene symbols
output_file = "filtered_gene_relationships.json"
checkpoint_file = "checkpoint.json"

gene_dependencies = analyze_gene_dependencies(file_path, gene_list_file, output_file, checkpoint_file)
draw_gene_network(gene_dependencies)
