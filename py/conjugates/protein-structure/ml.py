import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np

# Assuming data is already loaded and extract_annotations_by_ensembl_id is defined
import pandas as pd
import json

def extract_annotations_by_ensembl_id(ensembl_gene_id, dataframe):
    """
    Parses the 'structure' JSON field for a specified ensembl_gene_id to extract features,
    each with an array of 'annotation' objects having attributes type, category, description,
    begin, end, and molecule.
    
    Parameters:
    - ensembl_gene_id (str): The Ensembl Gene ID to search for in the dataframe.
    - dataframe (pd.DataFrame): The dataframe containing the data.
    
    Returns:
    - list: An array of features, each containing annotations with specified attributes.
    """
    annotations_list = []
    
    # Find the row with the matching ensembl_gene_id
    row = dataframe[dataframe['ensembl_gene_id'] == ensembl_gene_id]
    
    # Check if the row was found and has a non-empty 'structure'
    if not row.empty:
        row = row.iloc[0]  # Extract the first (and should be only) matching row
        structure_json = row['structure']
        if structure_json and structure_json != '{}':
            # Parse the 'structure' JSON field safely
            structure_json = structure_json.replace("\'", "\"")
            try:
                structure_data = json.loads(structure_json)
                
                # Extract the molecule/accession as a common attribute for all annotations
                molecule = structure_data.get('accession', '')
                
                # Iterate through each feature in the 'features' list
                if 'features' in structure_data:
                    for feature in structure_data['features']:
                        # Extract annotation details
                        annotation = {
                            'type': feature.get('type', ''),
                            'category': feature.get('category', ''),
                            'description': feature.get('description', ''),
                            'begin': feature.get('begin', ''),
                            'end': feature.get('end', ''),
                            'molecule': molecule  # Assign the common molecule value
                        }
                        annotations_list.append(annotation)
                        
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON: {e}")
    
    return annotations_list




    

# Feature extraction from SMILES strings
def extract_chemical_features(smiles):
    mol = Chem.MolFromSmiles(smiles)
    features = {
        "mol_weight": Descriptors.MolWt(mol),
        "logp": Descriptors.MolLogP(mol),
        # Add more descriptors as needed
    }
    return features



# Load the CSV file
file_path = './top-with-protein-structure.csv'
data = pd.read_csv(file_path)
ensembl_gene_id = 'ENSG00000258839'  # Example Ensembl Gene ID
annotations = extract_annotations_by_ensembl_id(ensembl_gene_id, data)
print(annotations[:5])  # Display first 5 annotations for brevity


# Prepare the dataset
feature_columns = []  # This will be filled with the names of the generated features
features = []
for index, row in data.iterrows():
    # Extract chemical properties from SMILES
    chem_features = extract_chemical_features(row['SMILES'])
    # Extract structural properties from protein annotations (simplified example)
    protein_features = len(extract_annotations_by_ensembl_id(row['ensembl_gene_id'], data))  # Example feature: count of annotations
    
    # Combine features and add to the dataset
    combined_features = list(chem_features.values()) + [protein_features]
    features.append(combined_features)
    
    if not feature_columns:  # Fill feature names if not done yet
        feature_columns = list(chem_features.keys()) + ['protein_features']

# Assuming 'kd_value' is the target column in your dataframe
X = np.array(features)
y = data['Kd'].values

# Split the dataset into training and test sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Model training
model = RandomForestRegressor(random_state=42)
model.fit(X_train, y_train)

# Predictions and evaluation
predictions = model.predict(X_test)
rmse = mean_squared_error(y_test, predictions, squared=False)

print(f"RMSE: {rmse}")
