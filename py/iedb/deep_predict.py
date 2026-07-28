import requests
import joblib
import numpy as np
import pandas as pd
import tensorflow as tf
import matplotlib.pyplot as plt
from Bio import SeqIO
from io import StringIO

# Load pre-trained deep learning model
model = tf.keras.models.load_model("epitope_model.h5")

# Define valid amino acids
AMINO_ACIDS = set("ACDEFGHIKLMNPQRSTVWY")

# Feature dictionaries
def get_hydrophobicity():
    return {
        'A': 1.8, 'C': 2.5, 'D': -3.5, 'E': -3.5, 'F': 2.8, 'G': -0.4, 'H': -3.2, 'I': 4.5,
        'K': -3.9, 'L': 3.8, 'M': 1.9, 'N': -3.5, 'P': -1.6, 'Q': -3.5, 'R': -4.5, 'S': -0.8,
        'T': -0.7, 'V': 4.2, 'W': -0.9, 'Y': -1.3
    }

def get_polarity():
    return {
        'A': 8.1, 'C': 5.5, 'D': 13.0, 'E': 12.3, 'F': 5.2, 'G': 9.0, 'H': 10.4, 'I': 5.2,
        'K': 11.3, 'L': 4.9, 'M': 5.7, 'N': 11.6, 'P': 8.0, 'Q': 10.5, 'R': 10.5, 'S': 9.2,
        'T': 8.6, 'V': 5.9, 'W': 5.4, 'Y': 6.2
    }

def get_molecular_weight():
    return {
        'A': 89.1, 'C': 121.2, 'D': 133.1, 'E': 147.1, 'F': 165.2, 'G': 75.1, 'H': 155.2, 'I': 131.2,
        'K': 146.2, 'L': 131.2, 'M': 149.2, 'N': 132.1, 'P': 115.1, 'Q': 146.2, 'R': 174.2, 'S': 105.1,
        'T': 119.1, 'V': 117.1, 'W': 204.2, 'Y': 181.2
    }
    
def get_functional_groups():
    return {
        'A': [0, 1, 0, 0], 'C': [0, 1, 1, 0], 'D': [1, 0, 0, 0], 'E': [1, 0, 0, 0], 'F': [0, 0, 1, 0],
        'G': [0, 1, 0, 0], 'H': [0, 0, 1, 1], 'I': [0, 1, 0, 0], 'K': [1, 0, 0, 0], 'L': [0, 1, 0, 0],
        'M': [0, 1, 1, 0], 'N': [1, 0, 0, 0], 'P': [0, 1, 0, 0], 'Q': [1, 0, 0, 0], 'R': [1, 0, 0, 1],
        'S': [0, 1, 0, 0], 'T': [0, 1, 0, 0], 'V': [0, 1, 0, 0], 'W': [0, 0, 1, 0], 'Y': [0, 0, 1, 0]
    }

def fetch_uniprot_annotation(uniprot_id):
    """Fetch UniProt annotations for transmembrane and cell surface receptor properties."""
    url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.txt"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        content = response.text
        
        is_transmembrane = "TRANSMEM" in content
        is_receptor = "Receptor" in content
        
        return "Transmembrane" if is_transmembrane else ("Receptor" if is_receptor else "None")
    except requests.RequestException:
        return "Unknown"


def download_fasta(uniprot_id):
    """Download a FASTA file from UniProt and extract the protein sequence and name."""
    url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.fasta"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        fasta_io = StringIO(response.text)
        record = SeqIO.read(fasta_io, "fasta")
        protein_name = record.description.split(None, 1)[1]
        return str(record.seq), protein_name
    except (requests.RequestException, ValueError):
        print(f"Warning: Unable to download or parse FASTA for {uniprot_id}. Skipping...")
        return None, None

def predict_epitopes(peptide_windows, model, threshold=0.85):
    """Predict epitope likelihoods using the deep learning model."""
    if not peptide_windows:
        return 0, 0
    
    X_test = compute_features(peptide_windows)
    scores = model.predict(X_test).flatten()
    high_epitope_count = np.sum(scores >= threshold)
    
    return high_epitope_count, len(peptide_windows)


def generate_peptide_windows(sequence, window_size=15):
    """Generate overlapping 15AA peptide windows from the protein sequence."""
    return [sequence[i:i+window_size] for i in range(len(sequence) - window_size + 1)]


def compute_features(peptides):
    """Compute physicochemical features for peptides."""
    hydrophobicity = get_hydrophobicity()
    polarity = get_polarity()
    molecular_weight = get_molecular_weight()
    functional_groups = get_functional_groups()
    
    feature_vectors = []
    for peptide in peptides:
        hydro_values = [hydrophobicity.get(aa, 0) for aa in peptide]
        polar_values = [polarity.get(aa, 0) for aa in peptide]
        mw_values = [molecular_weight.get(aa, 0) for aa in peptide]
        func_values = np.sum([functional_groups.get(aa, [0, 0, 0, 0]) for aa in peptide], axis=0)
        
        features = [
            np.mean(hydro_values), np.std(hydro_values),
            np.mean(polar_values), np.std(polar_values),
            np.mean(mw_values), np.std(mw_values),
            len(peptide)
        ] + list(func_values)
        feature_vectors.append(features)
    
    return np.array(feature_vectors)




def process_uniprot_ids(csv_file):
    """Process a CSV file with UniProt IDs, predict epitope scores, normalize, and annotate."""
    df = pd.read_csv(csv_file)
    results = []
    
    for index, row in df.iterrows():
        uniprot_id = row.iloc[2]
        protein_sequence, protein_name = download_fasta(uniprot_id)
        
        if protein_sequence:
            peptide_windows = generate_peptide_windows(protein_sequence)
            high_epitope_count, total_windows = predict_epitopes(peptide_windows, model)
            normalized_score = high_epitope_count / total_windows if total_windows > 0 else 0
            annotation = fetch_uniprot_annotation(uniprot_id)
            
            results.append((uniprot_id, protein_name, high_epitope_count, normalized_score, annotation))
    
    results_df = pd.DataFrame(results, columns=["UniProt ID", "Protein Name", "High Epitope Count", "Normalized Epitope Score", "Annotation"])
    results_df = results_df.sort_values(by="High Epitope Count", ascending=False)
    
    print(results_df.to_string(index=False))
    
    if not results_df.empty:
        plt.figure(figsize=(10, 5))
        plt.bar(results_df["Protein Name"], results_df["High Epitope Count"])
        plt.xticks(rotation=90)
        plt.xlabel("Protein Name")
        plt.ylabel("High Epitope Count")
        plt.title("Epitope Score Ranking")
        plt.tight_layout()
        plt.savefig("epitope_scores.png")
        print("Plot saved as epitope_scores.png")
    else:
        print("No valid UniProt IDs processed.")
    
    return results_df

# Example usage:
csv_file = "../immunogenic_proteins.csv"
results_df = process_uniprot_ids(csv_file)




# def process_uniprot_ids(csv_file):
#     """Process a CSV file with UniProt IDs, predict epitope scores, normalize, and save plot as PNG."""
#     df = pd.read_csv(csv_file)
#     results = []
    
#     for index, row in df.iterrows():
#         uniprot_id = row.iloc[2]
#         protein_sequence, protein_name = download_fasta(uniprot_id)
        
#         if protein_sequence:
#             peptide_windows = generate_peptide_windows(protein_sequence)
#             high_epitope_count, total_windows = predict_epitopes(peptide_windows, model)
#             normalized_score = high_epitope_count / total_windows if total_windows > 0 else 0
#             results.append((uniprot_id, protein_name, high_epitope_count, normalized_score))
    
#     results_df = pd.DataFrame(results, columns=["UniProt ID", "Protein Name", "High Epitope Count", "Normalized Epitope Score"])
#     results_df = results_df.sort_values(by="High Epitope Count", ascending=False)
    
#     print(results_df.to_string(index=False))
    
#     if not results_df.empty:
#         plt.figure(figsize=(10, 5))
#         plt.bar(results_df["Protein Name"], results_df["High Epitope Count"])
#         plt.xticks(rotation=90)
#         plt.xlabel("Protein Name")
#         plt.ylabel("High Epitope Count")
#         plt.title("Epitope Score Ranking")
#         plt.tight_layout()
#         plt.savefig("epitope_scores.png")
#         print("Plot saved as epitope_scores.png")
#     else:
#         print("No valid UniProt IDs processed.")
    
#     return results_df

# # Example usage:
# csv_file = "../immunogenic_proteins.csv"
# results_df = process_uniprot_ids(csv_file)
