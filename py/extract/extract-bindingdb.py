import csv
import time
import pandas as pd
import re
import json
# The path to your TSV file
file_path = './bdb.tsv'
parsed_objects = []

with open(file_path, 'r') as file:
    reader = csv.DictReader(file, delimiter='\t')
    i =0
    for row in reader:
        print ( row['Ligand SMILES'] )
        # 'Ki (nM)', 'IC50 (nM)', 'Kd (nM)', 'EC50 (nM)', 
        r = { 'SMILES':row['Ligand SMILES'], 'Ki':row['Ki (nM)'], 'IC50': row['IC50 (nM)'], 'Kd':row['Kd (nM)'], 'protein_sequence': row['BindingDB Target Chain Sequence'], 
             'LIGAND_BINDING': row['BindingDB MonomerID'], 'Ligand_Name':row['BindingDB Ligand Name']}
        parsed_objects.append(r)
        


def clean_column_names(column_names):
    cleaned_columns = [re.sub(r'[^a-zA-Z0-9]', '', col) for col in column_names]
    return cleaned_columns


df = pd.DataFrame ( parsed_objects )
df.to_csv ( 'bdb-kikd.csv')

# df = pd.read_csv(file_path, delimiter='\t', dtype=str)
# df.columns = clean_column_names(df.columns)
# print ( df.columns.tolist () )


# for obj in parsed_objects:  # Adjust the slice as necessary
#     # time.sleep(1) 
#     print(obj['BindingDB Target Chain Sequence'])
