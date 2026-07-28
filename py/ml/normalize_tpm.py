import pandas as pd
import numpy as np

def read_file(file_path):
    """Reads a CSV or Excel file and returns a DataFrame."""
    if file_path.endswith(".csv"):
        return pd.read_csv(file_path)
    elif file_path.endswith(".xlsx") or file_path.endswith(".xls"):
        return pd.read_excel(file_path)
    else:
        raise ValueError(f"Unsupported file format: {file_path}")

def normalize_tpm_by_go_terms(tpm_file, go_file, output_file="normalized_tpm.csv"):
    print("[INFO] Loading datasets...")
    tpm_df = read_file(tpm_file)
    go_df = read_file(go_file)

    # Standardize column names
    tpm_df.columns = tpm_df.columns.str.strip().str.lower()
    go_df.columns = go_df.columns.str.strip().str.lower()

    print(f"[INFO] TPM dataset columns: {tpm_df.columns.tolist()}")
    print(f"[INFO] GO dataset columns: {go_df.columns.tolist()}")

    # Check required columns
    if "gene id" not in go_df.columns or "go id" not in go_df.columns:
        raise ValueError("GO file must contain 'Gene ID' and 'GO ID' columns.")
    
    if "gene id" not in tpm_df.columns:
        raise ValueError("TPM dataset must contain a 'gene ID' column.")

    # Standardize Gene IDs
    go_df["gene id"] = go_df["gene id"].astype(str).str.strip().str.upper()
    tpm_df["gene id"] = tpm_df["gene id"].astype(str).str.strip().str.upper()

    # Define GO terms of interest
    translation_go = "GO:0006412"
    mitochondrion_go = "GO:0005739"

    # Extract relevant genes
    translation_genes = go_df[go_df["go id"] == translation_go]["gene id"].unique()
    mitochondrion_genes = go_df[go_df["go id"] == mitochondrion_go]["gene id"].unique()

    print(f"[INFO] Found {len(translation_genes)} unique genes for Translation.")
    print(f"[INFO] Found {len(mitochondrion_genes)} unique genes for Mitochondrion.")

    # Check if GO terms exist in GO file
    if len(translation_genes) == 0 or len(mitochondrion_genes) == 0:
        raise ValueError(f"GO file does not contain the target GO terms: {translation_go}, {mitochondrion_go}")

    # Filter TPM dataset
    tpm_translation = tpm_df[tpm_df["gene id"].isin(translation_genes)]
    tpm_mitochondrion = tpm_df[tpm_df["gene id"].isin(mitochondrion_genes)]

    print(f"[INFO] Found {len(tpm_translation)} genes in TPM for Translation.")
    print(f"[INFO] Found {len(tpm_mitochondrion)} genes in TPM for Mitochondrion.")

    # Check for missing data
    missing_terms = []
    if tpm_translation.empty:
        missing_terms.append("GO:0006412 (Translation)")
    if tpm_mitochondrion.empty:
        missing_terms.append("GO:0005739 (Mitochondrion)")

    if missing_terms:
        raise ValueError(f"Insufficient data: No genes found for {', '.join(missing_terms)} in TPM dataset.")

    # Compute mean expression per sample (excluding first two columns)
    translation_mean = tpm_translation.iloc[:, 2:].mean(skipna=True)
    mitochondrion_mean = tpm_mitochondrion.iloc[:, 2:].mean(skipna=True)

    # Compute mean difference
    mean_difference = translation_mean - mitochondrion_mean

    # Avoid division by zero
    if (mean_difference == 0).any():
        raise ValueError("[ERROR] Mean difference contains zero values, cannot normalize TPM.")

    print(f"[INFO] Mean difference calculated, normalizing TPM values...")

    # Normalize only numeric columns (after column 2)
    normalized_tpm = tpm_df.copy()
    numeric_cols = normalized_tpm.columns[2:]  # Only process numeric values from column 3 onward
    normalized_tpm[numeric_cols] = normalized_tpm[numeric_cols].div(mean_difference, axis=1)

    print("[INFO] Saving normalized TPM data...")
    normalized_tpm.to_csv(output_file, index=False)
    print(f"[INFO] Normalization complete. Results saved to: {output_file}")

# Example usage
tpm_file = "../../tpm.xlsx"
go_file = "./gene_ontology_results.csv"
normalize_tpm_by_go_terms(tpm_file, go_file, output_file="normalized_tpm_output.csv")
