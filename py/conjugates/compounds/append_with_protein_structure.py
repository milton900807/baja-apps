import pandas as pd
import requests



def get_uniprot_accession(ensembl_protein_id):
    """Retrieve the UniProt accession number for a given Ensembl protein ID."""
    server = "https://rest.ensembl.org"
    ext = f"/xrefs/id/{ensembl_protein_id}?external_db=Uniprot/SWISSPROT"
    headers = {"Content-Type": "application/json"}
    
    response = requests.get(f"{server}{ext}", headers=headers)
    if response.ok:
        data = response.json()
        # Assuming the first result is the most relevant
        if data:
            return data[0]['primary_id']
    return None

def get__structure(uniprot_accession):
    """Retrieve secondary structural information for a given UniProt accession number."""
    server = "https://www.ebi.ac.uk/proteins/api/features"
    ext = f"/{uniprot_accession}"
    headers = {"Accept": "application/json"}
    print (f"{server}{ext}")
    response = requests.get(f"{server}{ext}", headers=headers)
    if response.ok:
        data = response.json()
        return data
    return None
def split_or_make_array(input_string):
    if ',' in input_string:
        return input_string.split(',')
    else:
        return [input_string]
def get_secondary_structure ( ensembl_protein_ids ): 
    print ( ensembl_protein_ids )
    ensembl_protein_ids = split_or_make_array ( ensembl_protein_ids )
    for protein_id in ensembl_protein_ids:
        uniprot_accession = get_uniprot_accession(protein_id)
        if uniprot_accession:
            print(f"UniProt accession: {uniprot_accession}")
            secondary_structure = get__structure(uniprot_accession)
            if secondary_structure:
                df.to_csv('./__top-with-protein-structure.csv', index=False)

                print(f"Secondary structure information for {uniprot_accession}:")
                # Implement custom logic to process/display the secondary structure data
                # For demonstration, just print the raw data
                print(secondary_structure)
                return secondary_structure
            else:
                print("Secondary structure information not found.")
        else:
            print(f"UniProt accession number not found.{protein_id}")
        print("\n")  # Add a newline for readability between proteins
    return {}

# Load the CSV file
df = pd.read_csv('./top-with-protein.csv')
df['structure'] = df['protein_ids'].apply( get_secondary_structure)
df.to_csv('./top-with-protein-structure.csv', index=False)
print("Updated table saved.")
