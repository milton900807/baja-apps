import re
import requests
import numpy as np
import pandas as pd
from Bio import SeqIO
from io import StringIO
import numpy as np
import pandas as pd
from Bio import SeqIO
from io import StringIO
import requests
import numpy as np
import pandas as pd
from Bio import SeqIO
from io import StringIO
from itertools import combinations
import scipy.spatial.distance as ssd
import matplotlib.pyplot as plt

    
import requests
import joblib
import numpy as np
import pandas as pd
import tensorflow as tf
import matplotlib.pyplot as plt
import scipy.cluster.hierarchy as sch
from Bio import SeqIO
from io import StringIO
from ete3 import NCBITaxa
from itertools import combinations

# Load pre-trained deep learning model
model = tf.keras.models.load_model("tcr_model.h5")

    
# Initialize NCBI Taxonomy Database
ncbi = NCBITaxa()

# Load pre-trained deep learning model
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

def predict_epitopes(peptide_windows, model, threshold=0.80):
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





# def process_uniprot_ids(csv_file):
#     """Process a CSV file with UniProt IDs, predict epitope scores, normalize, and annotate."""
#     df = pd.read_csv(csv_file)
#     results = []
#     scores = []
#     for index, row in df.iterrows():
#         uniprot_id = row.iloc[2]
#         protein_sequence, protein_name = download_fasta(uniprot_id)
        
#         if protein_sequence:
#             peptide_windows = generate_peptide_windows(protein_sequence)
#             high_epitope_count, total_windows = predict_epitopes(peptide_windows, model)
#             normalized_score = high_epitope_count / total_windows if total_windows > 0 else 0
#             taxid = fetch_uniprot_taxonomy_id(uniprot_id)

#             if taxid:
#                 results.append((uniprot_id, taxid, normalized_score))
#                 scores.append(normalized_score)
    

def fetch_uniprot_taxonomy_id(uniprot_id):
    """Fetch NCBI Taxonomy ID from UniProt using the structured JSON API."""
    url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.json"

    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # Raise an error for bad responses (4xx, 5xx)
        data = response.json()  # Parse JSON response

        # Extract Taxonomy ID
        tax_id = data.get("organism", {}).get("taxonId")
        if tax_id:
            return int(tax_id)
        else:
            print(f"⚠️ No Taxonomy ID found in UniProt JSON for {uniprot_id}")
            return None

    except requests.RequestException as e:
        print(f"❌ UniProt API Error for {uniprot_id}: {e}")
        return None

def get_common_ancestor_distance(taxid1, taxid2):
    """Calculate the phylogenetic distance between two taxonomy IDs using their lowest common ancestor (LCA)."""
    lineage1 = ncbi.get_lineage(taxid1)
    lineage2 = ncbi.get_lineage(taxid2)

    common_ancestors = set(lineage1) & set(lineage2)
    if not common_ancestors:
        return float('inf')

    lca = max(common_ancestors, key=lineage1.index)
    distance = lineage1.index(taxid1) + lineage2.index(taxid2) - 2 * lineage1.index(lca)
    
    return distance

def compute_distance_matrix(taxids):
    """Generate a condensed pairwise phylogenetic distance matrix."""
    distances = []
    for i, j in combinations(range(len(taxids)), 2):
        distances.append(get_common_ancestor_distance(taxids[i], taxids[j]))
    return np.array(distances)

def plot_phylogenetic_tree(taxids, names, scores):
    """Plot a dendrogram based on phylogenetic distances and display model scores."""
    if len(taxids) < 2:
        print("Not enough taxonomy IDs to generate a phylogenetic tree.")
        return
    
    dist_matrix = compute_distance_matrix(taxids)
    if len(dist_matrix) == 0:
        print("Distance matrix is empty, skipping phylogenetic tree plot.")
        return
    
    condensed_dist_matrix = ssd.squareform(dist_matrix)
    linkage_matrix = sch.linkage(condensed_dist_matrix, method='average')
    
    plt.figure(figsize=(10, 5))
    dendro = sch.dendrogram(linkage_matrix, labels=[f"{name} (Score: {score:.2f})" for name, score in zip(names, scores)],
                            leaf_rotation=90)
    plt.title("Phylogenetic Distance Dendrogram with Model Scores")
    plt.xlabel("Species")
    plt.ylabel("Phylogenetic Distance")
    plt.savefig("phylogenetic_tree_with_scores.png")
    print("✅ Phylogenetic tree saved as phylogenetic_tree_with_scores.png")



def fetch_uniprot_taxonomy_name(uniprot_id):
    """Fetch species name from UniProt."""
    url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.json"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get("organism", {}).get("scientificName", "Unknown")
    except requests.RequestException:
        return "Unknown"
    
def read_fasta_and_filter_by_taxid(fasta_file):
    """Read a FASTA file and filter sequences based on the given taxonomy ID (OX=9606 for humans)."""
    sequences = []
    headers = []
    for record in SeqIO.parse(fasta_file, "fasta"):
        sequences.append(str(record.seq))
        headers.append(record.description)
    
    return headers, sequences

def process_uniprot_ids(csv_file):
    """Process UniProt IDs from CSV, predict epitopes, and integrate phylogenetic distance."""
    df = pd.read_csv(csv_file)
    results = []
    species_names = []
    
    for index, row in df.iterrows():
        uniprot_id = row.iloc[2]
        species_name = fetch_uniprot_taxonomy_name(uniprot_id)
        species_names.append(species_name)
        
        protein_sequence, _ = download_fasta(uniprot_id)
        if protein_sequence:
            peptide_windows = generate_peptide_windows(protein_sequence)
            high_epitope_count, total_windows = predict_epitopes(peptide_windows, model)
            normalized_score = high_epitope_count / total_windows if total_windows > 0 else 0
            taxid = fetch_uniprot_taxonomy_id(uniprot_id)
            
            if taxid:
                results.append((species_name, high_epitope_count))
    
    results_df = pd.DataFrame(results, columns=["Species", "High Epitope Count"])
    results_df = results_df.dropna()
    
    plt.figure(figsize=(48, 18))
    plt.scatter(results_df["Species"], results_df["High Epitope Count"], alpha=0.7)
    plt.xticks(rotation=90)
    plt.xlabel("Species")
    plt.ylabel("High Epitope Count")
    plt.title("Correlation between Species and High Epitope Count")
    plt.grid()
    plt.tight_layout()
    plt.savefig("epitope_species_correlation.png")
    print("Plot saved as epitope_species_correlation.png")
    return results_df

def extract_taxid(header):
    """Extract taxid from the FASTA header if annotated by 'OX='."""
    match = re.search(r"OX=(\d+)", header)
    return match.group(1) if match else None


def extract_species_name(description):
    """
    Extracts the species name from a FASTA record description.
    Specifically handles descriptions formatted like:
    
    >sp|P48347-2|14310_ARATH Isoform 2 of 14-3-3-like protein GF14 epsilon OS=Arabidopsis thaliana OX=3702 GN=GRF10

    The species name is extracted from the `OS=` (Organism Species) field.
    
    Example extraction:
    - Input: '>sp|P48347-2|14310_ARATH Isoform 2 of ... OS=Arabidopsis thaliana OX=3702 GN=GRF10'
    - Output: 'Arabidopsis thaliana'
    """
    match = re.search(r"OS=([^=]+?) OX=", description)
    
    if match:
        return match.group(1).strip()
    
    return "Unknown Species"  # Fallback if no species name is found

def extract_protein_name(description):
    """
    Extracts the protein name from the FASTA header.
    Assumes the protein name is present after a recognizable pattern.
    
    Example headers:
    >sp|P12345|Protein_Name_HUMAN Some description text
    >tr|Q67890|Another_Protein_MOUSE More description
    >XP_027295194.1 hypothetical protein LOC12345

    This function extracts "Protein_Name_HUMAN" or "Another_Protein_MOUSE" or "hypothetical protein LOC12345".
    """

    # Case 1: Uniprot format (e.g., >sp|P12345|Protein_Name_HUMAN)
    match = re.search(r'\|\w+\|([^ ]+)', description)
    if match:
        return match.group(1)  # Extracts "Protein_Name_HUMAN"
    
    # Case 2: GenBank format (e.g., >XP_027295194.1 hypothetical protein LOC12345)
    match = re.search(r'^(>\S+)\s+(.+)', description)
    if match:
        return match.group(2)  # Extracts the part after the first identifier

    # Default: If no clear protein name is found, return the whole description
    return description


import pandas as pd
import matplotlib.pyplot as plt
from Bio import SeqIO

def process_fasta_file(fasta_file, output_xlsx="epitope_results.xlsx"):
    """Process a FASTA file, predict epitopes, and integrate phylogenetic distance."""
    results = []

    for record in SeqIO.parse(fasta_file, "fasta"):
        species_name = extract_species_name(record.description)  # Extract species name
        if "Homo sapiens" not in species_name:  # Skip non-human sequences
            continue
        
        protein_name = extract_protein_name(record.description)  # Extract protein name
        protein_sequence = str(record.seq)
        peptide_windows = generate_peptide_windows(protein_sequence)
        high_epitope_count, total_windows = predict_epitopes(peptide_windows, model)
        normalized_score = high_epitope_count / total_windows if total_windows > 0 else 0
        
        results.append((protein_name, normalized_score))
    
    results_df = pd.DataFrame(results, columns=["Protein", "High Epitope Count"])
    results_df = results_df.dropna()

    # Sort DataFrame by "High Epitope Count" in descending order
    results_df = results_df.sort_values(by="High Epitope Count", ascending=False)

    # Plotting
    plt.figure(figsize=(120, 60))  # Adjust width dynamically

    plt.scatter(results_df["Protein"], results_df["High Epitope Count"], alpha=0.7)

    # Rotate x-axis labels for better readability
    plt.xticks(rotation=90, ha='right', fontsize=8)  
    plt.xlabel("Protein Name")
    plt.ylabel("High Epitope Count")
    plt.title("High Epitope Count for Human Proteins (Sorted)")

    # Label points where "High Epitope Count" is greater than 0.8
    for i, row in results_df.iterrows():
        if row["High Epitope Count"] > 0.7:
            plt.text(row["Protein"], row["High Epitope Count"], f'{row["Protein"]}', 
                    fontsize=8, ha='center', va='bottom', color='red', fontweight='bold')

    plt.tight_layout()
    plt.savefig("epitope_protein_correlation.png", dpi=300, bbox_inches="tight")
    print("Plot saved as epitope_protein_correlation.png")

    # Save DataFrame to Excel
    results_df.to_excel(output_xlsx, index=False)
    print(f"Results saved to {output_xlsx}")

    return results_df
# Example Usage:
# csv_file = "../immunogenic_proteins.csv"
# results_df = process_uniprot_ids(csv_file)
    
process_fasta_file('../uniprot_sprot.fasta')
