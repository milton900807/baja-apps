import pandas as pd
import requests
import time
import pandas as pd
import requests



def save_dataframe(df, suffix):
    filename = f"updated_file_with_protein_sequences_{suffix}.csv"
    df.to_csv(filename, index=False)
    print(f"DataFrame saved to {filename}")

def get_protein_sequence_with_cache_and_throttle(ensembl_protein_id, cache, request_counter):
    if ensembl_protein_id in cache:
        return cache[ensembl_protein_id], request_counter
    if request_counter % 20 == 0 and request_counter > 0:
        time.sleep(5)
    
    try:
        server = "https://rest.ensembl.org"
        ext = f"/sequence/id/{ensembl_protein_id}"
        headers = {"Content-Type": "text/plain"}
        response = requests.get(f"{server}{ext}", headers=headers)
        
        if not response.ok:
            cache[ensembl_protein_id] = "NA"  # Cache the 'NA' result
            return "NA", request_counter + 1
        
        sequence = response.text
        cache[ensembl_protein_id] = sequence  # Cache the successful result
    except Exception as e:
        print(f"Error retrieving data for {ensembl_protein_id}: {e}")
        sequence = "NA"  # Use 'NA' if there was an error
    
    return sequence, request_counter + 1

# Load the main CSV file and the reference data.csv
file_path = "./c-i.csv"  # Change this to your actual file path
reference_data_path = "./protein-struc.csv"  # Path to the reference data containing protein_ids and structure
df = pd.read_csv(file_path)
reference_df = pd.read_csv(reference_data_path)
# Prepare the DataFrame by initializing necessary columns
df['protein_sequence'] = 'NA'
df['structure'] = 'NA'  # Assuming you want to add the structure to the main DataFrame
protein_sequence_cache = {}
request_counter = 0


def find_structure_in_local_data(ensembl_protein_id, local_data):
    print ( ' Ensemble protein id ', ensembl_protein_id )
    ensembl_protein_id = str ( ensembl_protein_id )
    
    if ensembl_protein_id is not None and len(ensembl_protein_id) > 0:
        matching_rows = local_data[local_data['protein_ids'].str.contains(ensembl_protein_id, na=False)]
        if not matching_rows.empty:
            return matching_rows.iloc[0]['structure']
    return None

for index, row in df.iterrows():
    ensembl_protein_id = row['Ensembl_protein_identifier']
    structure = find_structure_in_local_data(ensembl_protein_id, reference_df)
    if structure:
        df.at[index, 'structure'] = structure
        print ( ' structure ', structure['sequence'])
        df.at[index, 'protein_sequence'] = structure['sequence']
    else:
        protein_sequence, request_counter = get_protein_sequence_with_cache_and_throttle(ensembl_protein_id, protein_sequence_cache, request_counter)
        df.at[index, 'protein_sequence'] = protein_sequence
    
    
    if index % 1000 == 0:
        print ( " df status ", df)
    
    # Save progress every 400 API calls (as per your modification)
    if request_counter % 400 == 0:
        print ( f" Saving checkpoint {request_counter}")
        save_dataframe(df, f"checkpoint_{request_counter}")


