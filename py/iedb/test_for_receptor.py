import requests
import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer
from Bio import SeqIO
from io import StringIO

# Load pre-trained model and vectorizer
model = joblib.load("epitope_model.pkl")
vectorizer = joblib.load("vectorizer.pkl")

def download_fasta(url):
    """Download a FASTA file from a given UniProt URL and extract the protein sequence."""
    response = requests.get(url)
    if response.status_code == 200:
        fasta_content = response.text
        fasta_io = StringIO(fasta_content)
        record = SeqIO.read(fasta_io, "fasta")  # Parse FASTA file
        return str(record.seq)  # Return protein sequence
    else:
        print("Error: Unable to download FASTA file.")
        return None

def generate_peptide_windows(sequence, window_size=15):
    """Generate overlapping 15AA peptide windows from the full protein sequence."""
    return [sequence[i:i+window_size] for i in range(len(sequence) - window_size + 1)]

def predict_epitopes(peptide_windows, model, vectorizer, threshold=0.9):
    """Predict epitope likelihoods and count highly likely epitopes."""
    X_test, _ = encode_peptides(peptide_windows, vectorizer)
    scores = model.predict_proba(X_test)[:, 1]  # Probability of being an epitope
    
    # Count peptides with high epitope likelihood
    high_epitope_count = np.sum(scores >= threshold)
    
    # Create DataFrame with predictions
    results_df = pd.DataFrame({"Peptide": peptide_windows, "Epitope Score": scores})
    results_df.to_csv("epitope_predictions.csv", index=False)
    
    print(f"Number of highly likely epitopes (score ≥ {threshold}): {high_epitope_count}")
    print("Predictions saved to epitope_predictions.csv")
    
    return results_df, high_epitope_count

def encode_peptides(peptides, vectorizer):
    """Encode peptide sequences using the trained vectorizer."""
    X = vectorizer.transform(peptides).toarray()
    return X, vectorizer

# Example usage

url = "https://rest.uniprot.org/uniprotkb/O96108.fasta"
# url = "https://www.uniprot.org/uniprotkb/Q9UP52.fasta"  # Example UniProt FASTA URL
protein_sequence = download_fasta(url)

if protein_sequence:
    peptide_windows = generate_peptide_windows(protein_sequence)
    results, high_epitope_count = predict_epitopes(peptide_windows, model, vectorizer)
