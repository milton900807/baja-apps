import pandas as pd
import numpy as np
import requests
import joblib
import os
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score

ENSEMBL_SERVER = "https://rest.ensembl.org"
MODEL_SAVE_PATH = "model_checkpoint.pkl"
FEATURES_SAVE_PATH = "features_checkpoint.pkl"
BATCH_SIZE = 2  # Process genes in smaller batches to manage RAM usage
PROGRESS_LOG = "progress_log.txt"

# Load TPM data
def load_tpm_data(filepath):
    df = pd.read_excel(filepath, dtype=str)
    df.columns = df.columns.str.strip().str.lower()  # Standardize column names
    return df

# Fetch sequence data from Ensembl
def fetch_sequence_ensembl(ensembl_id, flank_size=1000000):
    if pd.isna(ensembl_id) or not isinstance(ensembl_id, str):
        return None
    
    endpoint = f"{ENSEMBL_SERVER}/lookup/id/{ensembl_id}?expand=1"
    headers = {"Content-Type": "application/json"}
    response = requests.get(endpoint, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        if all(k in data for k in ['seq_region_name', 'start', 'end', 'species']):
            seq_region = data['seq_region_name']
            start = max(1, data['start'] - flank_size)
            end = data['end'] + flank_size
            species = data['species']
            
            seq_endpoint = f"{ENSEMBL_SERVER}/sequence/region/{species}/{seq_region}:{start}..{end}:1?content-type=text/plain"
            seq_response = requests.get(seq_endpoint)
            
            if seq_response.status_code == 200:
                return seq_response.text.strip()
    return None

# One-hot encoding of sequence
def one_hot_encode_sequence(seq, max_length=1000):
    nucleotides = ['A', 'C', 'G', 'T']
    encoding = np.zeros((max_length, len(nucleotides)), dtype=int)
    
    for i, nucleotide in enumerate(seq[:max_length]):
        if nucleotide in nucleotides:
            encoding[i, nucleotides.index(nucleotide)] = 1
    
    return encoding.flatten()

# Prepare dataset for expression prediction
def prepare_dataset(tpm_df, start_index=0):
    if 'gene id' not in tpm_df.columns:
        raise KeyError("Column 'gene ID' not found in the TPM data. Please check the column names.")
    
    sequences = {}
    end_index = min(start_index + BATCH_SIZE, len(tpm_df))
    
    for i in range(start_index, end_index):
        print(f"Processing gene {i + 1}/{len(tpm_df)}...")
        gene_id = tpm_df.iloc[i]['gene id']
        if pd.isna(gene_id) or not isinstance(gene_id, str) or not gene_id.strip():
            continue
        seq = fetch_sequence_ensembl(gene_id)
        if seq:
            sequences[gene_id] = one_hot_encode_sequence(seq)
    
    if not sequences:
        raise ValueError("No valid gene sequences were retrieved.")
    
    feature_df = pd.DataFrame.from_dict(sequences, orient='index').fillna(0)
    expression_data = tpm_df.iloc[start_index:end_index, 2:].astype(float)
    
    if os.path.exists(FEATURES_SAVE_PATH):
        saved_features = joblib.load(FEATURES_SAVE_PATH)
        feature_df = feature_df.reindex(columns=saved_features, fill_value=0)
    else:
        joblib.dump(feature_df.columns.tolist(), FEATURES_SAVE_PATH)
    
    if len(feature_df) != len(expression_data):
        print(f"Warning: Feature and expression data mismatch! ({len(feature_df)} vs {len(expression_data)})")
        min_length = min(len(feature_df), len(expression_data))
        feature_df = feature_df.iloc[:min_length]
        expression_data = expression_data.iloc[:min_length]
    
    return feature_df, expression_data, end_index

# Train and save model in increments
def train_model(X, Y, save_path=MODEL_SAVE_PATH):
    if X.empty or Y.empty:
        raise ValueError("Feature set or expression data are empty. Model training cannot proceed.")
    
    if os.path.exists(save_path):
        model = joblib.load(save_path)
        print("Loaded existing model from checkpoint.")
    else:
        model = RandomForestRegressor(n_estimators=100, random_state=42, warm_start=True)
    
    model.fit(X, Y)
    joblib.dump(model, save_path)
    print(f"Model saved at {save_path}")
    
    predictions = model.predict(X)
    predictability = r2_score(Y, predictions)
    print(f"Model predictability (R^2 score): {predictability:.4f}")
    
    return model

if __name__ == "__main__":
    tpm_filepath = "../../tpm.xlsx"  # Update with actual file
    tpm_data = load_tpm_data(tpm_filepath)
    
    start_index = 0
    if os.path.exists(PROGRESS_LOG):
        with open(PROGRESS_LOG, "r") as f:
            start_index = int(f.read().strip())
            print(f"Resuming from gene {start_index}...")
    
    while start_index < len(tpm_data):
        X, Y, next_index = prepare_dataset(tpm_data, start_index)
        model = train_model(X, Y)
        
        # Print model status every 5 genes
        if (next_index - start_index) % 5 == 0:
            print(f"Status update: Processed {next_index} genes, model training in progress...")
        
        with open(PROGRESS_LOG, "w") as f:
            f.write(str(next_index))
            print(f"Checkpoint saved at gene {next_index}")
        
        start_index = next_index
