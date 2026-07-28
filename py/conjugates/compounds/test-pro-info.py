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

def get_secondary_structure(uniprot_accession):
    """Retrieve secondary structural information for a given UniProt accession number."""
    server = "https://www.ebi.ac.uk/proteins/api/features"
    ext = f"/{uniprot_accession}?types=SECONDARY_STRUCTURE"
    headers = {"Accept": "application/json"}
    
    response = requests.get(f"{server}{ext}", headers=headers)
    if response.ok:
        data = response.json()
        return data
    return None

# Example usage
ensembl_protein_id = "ENSP00000369497"  # Example Ensembl protein ID
uniprot_accession = get_uniprot_accession(ensembl_protein_id)
if uniprot_accession:
    secondary_structure = get_secondary_structure(uniprot_accession)
    if secondary_structure:
        print(f"Secondary structure information for {uniprot_accession}:")
        print(secondary_structure)
    else:
        print("Secondary structure information not found.")
else:
    print("UniProt accession number not found.")
