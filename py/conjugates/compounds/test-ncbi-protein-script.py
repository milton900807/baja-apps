import requests

def get_protein_info_from_ensembl(ensembl_id):
    """Retrieve protein information for a given Ensembl gene ID."""
    server = "https://rest.ensembl.org"
    ext = f"/lookup/id/{ensembl_id}?expand=1"
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(f"{server}{ext}", headers=headers)
        if response.ok:
            data = response.json()
            proteins = []
            # Extract protein information; transcripts might include protein info
            if 'Transcript' in data:
                for transcript in data['Transcript']:
                    if 'Translation' in transcript:
                        protein_id = transcript['Translation']['id']
                        proteins.append(protein_id)
            return proteins
    except requests.exceptions.RequestException as e:
        print(f"Error retrieving protein information for {ensembl_id}: {e}")
    return None

# Example usage
ensembl_id = "ENSRNOG00000011202"  # Example Ensembl ID for BRCA2 gene
protein_info = get_protein_info_from_ensembl(ensembl_id)
if protein_info:
    print(f"Protein IDs for {ensembl_id}: {protein_info}")
else:
    print("No protein information available.")
