import pandas as pd
import requests



def get_protein_info_from_ensembl(ensembl_id):
    """Retrieve protein information for a given Ensembl gene ID."""
    server = "http://rest.ensembl.org"
    ext = f"/lookup/id/{ensembl_id}?expand=1"
    headers = {"Content-Type": "application/json"}
    
    try:
        print ( ensembl_id )
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
            print ( proteins )
            return ",".join(proteins)

    except requests.exceptions.RequestException as e:
        print(f"Error retrieving protein information for {ensembl_id}: {e}")
    return None


# Load the CSV file
df = pd.read_csv('./top10.csv')
df['protein_ids'] = df['ensembl_gene_id'].apply( get_protein_info_from_ensembl)
df.to_csv('./top-with-protein.csv', index=False)
print("Updated table saved.")
