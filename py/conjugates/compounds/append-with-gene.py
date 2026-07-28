import pandas as pd
from Bio import Entrez
import requests

def get_gene_symbol_from_unigene(unigene_id):
    """Retrieve the gene symbol for a given UniGene ID using Entrez."""
    Entrez.email = "your.email@example.com"  # Replace with your actual email
    try:
        handle = Entrez.esummary(db="gene", term=unigene_id)
        record = Entrez.read(handle)
        handle.close()
        if record and 'DocSum' in record and len(record['DocSum']) > 0:
            for item in record['DocSum'][0]['Item']:
                if item['Name'] == 'Name':
                    return item['Content']
    except Exception as e:
        print(f"Error retrieving gene symbol for UniGene ID {unigene_id}: {e}")
    return None

def get_ensembl_id_from_gene_symbol(gene_symbol):
    """Retrieve the Ensembl gene ID for a given gene symbol."""
    server = "https://rest.ensembl.org"
    ext = f"/xrefs/symbol/homo_sapiens/{gene_symbol}?external_db=Ensembl_Gene"
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(f"{server}{ext}", headers=headers)
        if response.ok:
            data = response.json()
            if len(data) > 0:
                return data[0]['id']
    except Exception as e:
        print(f"Error retrieving Ensembl ID for gene symbol {gene_symbol}: {e}")
    return None

# Load the CSV file into a DataFrame
df = pd.read_csv('./top.csv')  # Replace with the path to your CSV file

# Use the methods to append the 'ensembl_gene_id' column
ensembl_gene_ids = []
for unigene_id in df['Unigene']:
    gene_symbol = get_gene_symbol_from_unigene(unigene_id)
    if gene_symbol:
        ensembl_id = get_ensembl_id_from_gene_symbol(gene_symbol)
        ensembl_gene_ids.append(ensembl_id)
    else:
        ensembl_gene_ids.append(None)

df['ensembl_gene_id'] = ensembl_gene_ids

# Save the updated DataFrame to a new CSV file
df.to_csv('./top-a.csv', index=False)  # Replace with your desired output file path

print("Updated table saved.")
