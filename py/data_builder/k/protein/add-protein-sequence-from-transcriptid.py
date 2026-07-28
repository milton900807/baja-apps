import pandas as pd
import requests
import time
import pandas as pd
import requests
import sys
import json

def save_dict_to_file(dic, filename):
    print ( filename )
    """
    Saves a dictionary to a file in JSON format.
    
    Parameters:
    - dic (dict): The dictionary to save.
    - filename (str): The path to the file where the dictionary will be saved.
    """
    with open(filename, 'w') as file:
        json.dump(dic, file)
def load_dict_from_file(filename):
    """
    Loads a dictionary from a JSON-formatted file.
    
    Parameters:
    - filename (str): The path to the file from which to load the dictionary.
    
    Returns:
    - dict: The dictionary loaded from the file.
    """
    with open(filename, 'r') as file:
        return json.load(file)


def save_dataframe(df, suffix):
    filename = f"./updated_file_with_protein_sequences_{suffix}.csv"
    df.to_csv(filename, index=False)
    print(f"DataFrame saved to {filename}")

def get_protein_sequence_with_cache_and_throttle(ensembl_protein_id, cache, request_counter):
    if '.' in ensembl_protein_id:
        ensembl_protein_id = ensembl_protein_id.split('.', 1)[0]
    if ensembl_protein_id in cache:
        if 'K' in cache[ensembl_protein_id]:
            return cache[ensembl_protein_id], request_counter
    # if request_counter % 200 == 0 and request_counter > 0:
        # time.sleep(5)
    if '.' in ensembl_protein_id:
        ensembl_protein_id = ensembl_protein_id.split('.', 1)[0]
    try:
        server = "https://rest.ensembl.org"
        ext = f"/sequence/id/{ensembl_protein_id}"
        headers = {"Content-Type": "text/plain"}
        response = requests.get(f"{server}{ext}?type=protein", headers=headers)
        
        if not response.ok:
            print ( " failed. ")
            # print ( f"{server}{ext}" )
            cache[ensembl_protein_id] = "NA"  # Cache the 'NA' result
            return "NA", request_counter + 1
        
        sequence = response.text
        # print ( ensembl_protein_id, sequence )
        cache[ensembl_protein_id] = sequence  # Cache the successful result
        save_dict_to_file ( cache, './cache.json')
    except Exception as e:
        print(f"Error retrieving data for {ensembl_protein_id}: {e}")
        sequence = "NA"  # Use 'NA' if there was an error
    
    return sequence, request_counter + 1

# Load the main CSV file and the reference data.csv
file_path = "./bt-protein.csv"  # Change this to your actual file path
reference_data_path = "../../../data/protein-structure-cache.csv"  # Path to the reference data containing protein_ids and structure
df = pd.read_csv(file_path)
reference_df = pd.read_csv(reference_data_path)
# Prepare the DataFrame by initializing necessary columns
df['protein_sequence'] = 'NA'
df['structure'] = 'NA'  # Assuming you want to add the structure to the main DataFrame
protein_sequence_cache = {}
request_counter = 0

try: 
    protein_sequence_cache = load_dict_from_file ( './cache.json')
    print ( 'Cache is loaded with ', len(protein_sequence_cache))
except: 
    print ( " cache loaded... Staring from scratch ")
    
    
def find_structure_in_local_data(ensembl_protein_id, local_data):
    # print ( ' Ensemble protein id ', ensembl_protein_id )
    ensembl_protein_id = str ( ensembl_protein_id )
    if ensembl_protein_id is not None and len(ensembl_protein_id) > 0:
        matching_rows = local_data[local_data['protein_ids'].str.contains(ensembl_protein_id, na=False)]
        if not matching_rows.empty:
            return matching_rows.iloc[0]['structure']
    return None

for index, row in df.iterrows():
    ensembl_protein_id = row['canonical_transcript']
    if ensembl_protein_id and isinstance (ensembl_protein_id, str):  
        # print ( ensembl_protein_id )
        if '.' in ensembl_protein_id:
            ensembl_protein_id = ensembl_protein_id.split('.', 1)[0]
        # print ( index, ensembl_protein_id )
        structure = find_structure_in_local_data(ensembl_protein_id, reference_df)
        if structure:
            structure = structure.replace("'", '"')        
            df.at[index, 'structure'] = structure
            # print ( f'\n\n')
            jstr = json.loads(str(structure))
            if 'sequence' in jstr:
                df.at[index, 'protein_sequence'] = jstr['sequence']
            else:
                print ( " FAiled to find the sequence for ", ensembl_protein_id )
        else:
            protein_sequence, request_counter = get_protein_sequence_with_cache_and_throttle(ensembl_protein_id, protein_sequence_cache, request_counter)
            df.at[index, 'protein_sequence'] = protein_sequence
        
        
        if index % 1000 == 0:
            print ( " df status ", df)
            df.to_csv ( 'proteins_seq-bt.csv')        
        # Save progress every 400 API calls (as per your modification)
        if request_counter % 400 == 0:
            print ( f" Saving checkpoint {request_counter}")
            save_dataframe(df, f"checkpoint_{request_counter}")


df.to_csv ( 'proteins_seq-bt.csv')