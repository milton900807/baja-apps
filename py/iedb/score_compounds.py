import requests
import joblib
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.feature_extraction.text import CountVectorizer
from Bio import SeqIO
from io import StringIO

# Load pre-trained model and vectorizer
model = joblib.load("epitope_model.pkl")
vectorizer = joblib.load("vectorizer.pkl")

def download_fasta(uniprot_id):
    """Download a FASTA file from UniProt and extract the protein sequence and name."""
    url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.fasta"
    print('URL:', url)
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # Raise an error for bad status codes
        fasta_content = response.text
        fasta_io = StringIO(fasta_content)
        record = SeqIO.read(fasta_io, "fasta")  # Parse FASTA file
        protein_name = record.description.split(None, 1)[1]  # Extract protein name
        return str(record.seq), protein_name  # Return protein sequence and name
    except (requests.RequestException, ValueError):
        print(f"Warning: Unable to download or parse FASTA for {uniprot_id}. Skipping...")
        return None, None

def generate_peptide_windows(sequence, window_size=15):
    """Generate overlapping 15AA peptide windows from the full protein sequence."""
    return [sequence[i:i+window_size] for i in range(len(sequence) - window_size + 1)]

def encode_peptides(peptides, vectorizer):
    """Encode peptide sequences using the trained vectorizer, ensuring feature size consistency."""
    X_encoded = vectorizer.transform(peptides).toarray()
    
    expected_features = model.n_features_in_  # Get expected number of features from the trained model
    current_features = X_encoded.shape[1]
    
    if current_features != expected_features:
        print(f"Warning: Mismatched feature size! Model expects {expected_features}, but got {current_features}. Adjusting...")
        
        # Adjust feature vector size by padding or truncating
        if current_features < expected_features:
            padding = np.zeros((X_encoded.shape[0], expected_features - current_features))
            X_encoded = np.hstack((X_encoded, padding))  # Pad missing columns with zeros
        else:
            X_encoded = X_encoded[:, :expected_features]  # Truncate extra features
    
    return X_encoded


def predict_epitopes(peptide_windows, model, vectorizer, threshold=0.85):
    """Predict epitope likelihoods and count highly likely epitopes."""
    if not peptide_windows:
        return 0, 0  # Return zero if there are no peptide windows
    
    X_test = encode_peptides(peptide_windows, vectorizer)
    scores = model.predict_proba(X_test)[:, 1]  # Probability of being an epitope
    
    high_epitope_count = np.sum(scores >= threshold)
    
    return high_epitope_count, len(peptide_windows)

def process_uniprot_ids(csv_file):
    """Process a CSV file with UniProt IDs, predict epitope scores, normalize, and save plot as PNG."""
    df = pd.read_csv(csv_file)
    
    results = []
    
    for index, row in df.iterrows():
        uniprot_id = row.iloc[2]  # Assuming UniProt IDs are in column 3 (index 2)
        
        protein_sequence, protein_name = download_fasta(uniprot_id)
        
        if protein_sequence:
            peptide_windows = generate_peptide_windows(protein_sequence)
            high_epitope_count, total_windows = predict_epitopes(peptide_windows, model, vectorizer)
            normalized_score = high_epitope_count / total_windows if total_windows > 0 else 0
            results.append((uniprot_id, protein_name, high_epitope_count, normalized_score))
    
    # Convert results to DataFrame
    results_df = pd.DataFrame(results, columns=["UniProt ID", "Protein Name", "High Epitope Count", "Normalized Epitope Score"])
    results_df = results_df.sort_values(by="High Epitope Count", ascending=False)
    
    # Print results to standard output
    print(results_df.to_string(index=False))
    
    # Save plot as PNG
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
csv_file = "../immunogenic_peptides_uniprot.csv"  # Replace with actual file path
results_df = process_uniprot_ids(csv_file)