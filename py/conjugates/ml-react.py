import random    # Import necessary libraries
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import make_pipeline
import random

# Function to extract chemical features from a SMILES string
def extract_features(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol:
        return [
            Descriptors.MolWt(mol),
            Descriptors.MolLogP(mol),
            Descriptors.NumHAcceptors(mol),
            Descriptors.NumHDonors(mol), 
        ]
    else:
        print ( ' failed to extract chemical features ')
        return [None, None, None, None]

smarts_patterns_filtered = {
    'hydroxyl': '[OH]',
    'amino': '[NX3;H2,H1;!$(NC=O)]',
    'aromatic_nitrogen': '[nX2]',
    'amide': '[NX3][CX3](=O)[#6]',
    'aromatic_nitrogen': '[nX2]',
    'alcohol': '[OH]',
    'benzyl': '[#6]c1ccccc1',
}
smarts_patterns_filtered_all = {
    'hydroxyl': '[OH]',
    'carboxyl': 'C(=O)O',
    'amino': '[NX3;H2,H1;!$(NC=O)]',
    'aldehyde': '[CX3H1](=O)[#6]',
    'ketone': '[#6][CX3](=O)[#6]',
    'ester': '[#6]C(=O)O[#6]',
    'amide': '[NX3][CX3](=O)[#6]',
    'ether': '[#6]O[#6]',
    'nitrile': '[CX2]#[NX1]',
    'sulfone': '[SX4](=[OX1])(=[OX1])([#6])[#6]',
    'sulfoxide': '[SX3](=O)[#6]',
    'thiol': '[#16H]',
    'halide': '[F,Cl,Br,I]',
    'phenyl': 'c1ccccc1',
    'benzyl': '[#6]c1ccccc1',
    'alkene': 'C=C',
    'alkyne': 'C#C',
    'aromatic_nitrogen': '[nX2]',
    'hydrazone': '[#6]=[NX2]-[#6]',
    'imine': '[NX2]=[CX3]',
    'alkyl_halide': '[CX4][F,Cl,Br,I]',
    'aromatic': 'c1ccccc1',
    'alcohol': '[OH]',
    'epoxide': 'O1CC1',
    'alkane': 'C'
}

# Function to calculate the count of each SMARTS pattern in a molecule
def count_smarts_patterns(smiles, patterns):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None: 
        return 0
    if mol is None: return [0] * len(patterns)  # Return a list of zeros if the molecule can't be parsed
    counts = []
    for pattern in patterns.values():
        smarts = Chem.MolFromSmarts(pattern)
        count = len(mol.GetSubstructMatches(smarts))
        counts.append(count)
    return counts


def count_gp_proximity(protein_sequence, distance):
    gp_count = 0  # Initialize count of G-P or P-G pairs
    sequence_length = len(protein_sequence)  # Get the length of the protein sequence
    
    # Iterate through the protein sequence
    for i, amino_acid in enumerate(protein_sequence):
        # Check for Glycine (G)
        if amino_acid == 'G':
            # Check for Proline (P) within 'distance' amino acids of the Glycine
            for j in range(max(0, i - distance), min(sequence_length, i + distance + 1)):
                if protein_sequence[j] == 'A':
                    gp_count += 1
                    break  # Once a pair is found, move to the next position

        # Check for Proline (P)
        elif amino_acid == 'A':
            # Check for Glycine (G) within 'distance' amino acids of the Proline
            for j in range(max(0, i - distance), min(sequence_length, i + distance + 1)):
                if protein_sequence[j] == 'G':
                    gp_count += 1
                    break  # Once a pair is found, move to the next position
    
    return gp_count


def normalized_glycine_distances(peptide_sequence):
    # Find the positions (indexes) of all glycines in the sequence
    glycine_positions = [i for i, amino_acid in enumerate(peptide_sequence) if amino_acid == 'G']
    
    # Calculate the distances between consecutive glycines
    distances = [glycine_positions[i+1] - glycine_positions[i] for i in range(len(glycine_positions)-1)]
    
    # Sum up the distances
    total_distance = sum(distances)
    
    # Normalize the total distance by the length of the peptide sequence
    normalized_distance = total_distance / len(peptide_sequence) if len(peptide_sequence) > 0 else 0
    
    return normalized_distance


def count_zinc_fingers(sequence):
    """Estimate the number of zinc finger domains based on a Cys-His pattern."""
    pattern = r'C.{2,4}C.{12}H.{3,5}H'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_helix_loop_helix(sequence):
    """Estimate the number of helix-loop-helix domains based on a basic pattern."""
    pattern = r'[A-Z]{20,40}L[A-Z]{5,10}L[A-Z]{20,40}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_SH3_domains(sequence):
    """Estimate the number of SH3 domains based on a proline-rich pattern."""
    pattern = r'P.{2}P.{2}P'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_leucine_zipper(sequence):
    """Estimate the number of leucine zipper domains based on leucine repeats."""
    pattern = r'(L.{6}){4,}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_serine_threonine_kinase_domains(sequence):
    """Estimate the number of serine/threonine kinase domains based on S/T-rich regions."""
    pattern = r'[ST]{5,}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_PH_domains(sequence):
    """Estimate the number of PH domains based on a basic pattern."""
    # This is highly simplified and speculative; real PH domain prediction is complex
    pattern = r'[RK]{3,}[A-Z]{20,100}[RK]{3,}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_WW_domains(sequence):
    """Estimate the number of WW domains based on tryptophan (W) presence."""
    pattern = r'W.{20,40}W'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_EF_hand_domains(sequence):
    """Estimate the number of EF-hand domains based on a calcium-binding motif."""
    pattern = r'D.{1,3}D.{1,3}E.{1,3}D'
    matches = re.findall(pattern, sequence)
    return len(matches)


def apply_method(sequence, method_name):
    method_function = globals().get(method_name)
    if method_function:
        return method_function(sequence)
    else:
        return None

def find_cam_binding_domains(sequence):
    """
    Attempts to identify potential Calmodulin (CaM) ligand-binding domains
    in a protein sequence based on a simplified pattern.

    Args:
    sequence (str): The protein sequence.

    Returns:
    list: A list of potential CaM-binding sequences.
    """
    # Define a simplified regex pattern for CaM-binding domains
    # R/K at position 1, hydrophobic (VILMF) at position 5 and 10
    # This is a very simplified approximation and will not be fully accurate
    pattern = r'[RK].[^RKVILMF]{3}[VILMF].[^RKVILMF]{4}[VILMF]'
    
    # Find all sequences matching the pattern
    matches = re.findall(pattern, sequence)
    
    return len(matches)

method_names = [
    "count_zinc_fingers",
    "count_helix_loop_helix",
    "count_SH3_domains",
    "count_leucine_zipper",
    "count_serine_threonine_kinase_domains",
    "count_PH_domains",
    "count_WW_domains",
    "count_EF_hand_domains",
    "find_cam_binding_domains"
]


# Define a function that checks if a SMILES string is valid by trying to create an RDKit molecule object from it
def is_valid_smiles(smiles):
    mol = Chem.MolFromSmiles(smiles)
    return mol is not None  # Returns True if mol creation was successful, False otherwise

# Load the dataset
file_path = './bt-proteins2.csv'  # Adjust the path to your file location
data = pd.read_csv(file_path)
print ( 'count rows : ', len(data))
print ( 'count data rows : ', len(data))


data['Kd'] = pd.to_numeric(data['Kd'], errors='coerce')
data.dropna(subset=['Kd'], inplace=True)
data['valid_smiles'] = data['SMILES'].apply(is_valid_smiles)
data_valid_smiles = data[data['valid_smiles']]
data = data_valid_smiles.drop(columns=['valid_smiles'])
# Calculate the count of nucleophilic amine groups (K, R, and N-terminus) and chain length
data['amine_group_count'] = data['protein_sequence'].apply(lambda x: x.count('K') + x.count('R') + 1)  # +1 for N-terminus
data['chain_length'] = data['protein_sequence'].apply(len)
data['normalized_amine_groups'] = data['amine_group_count'] / data['chain_length']


# Apply the function to each SMILES string in the dataset
pattern_counts = data['SMILES'].apply(lambda x: pd.Series(count_smarts_patterns(x, smarts_patterns_filtered)))

# Set column names for the pattern counts
pattern_counts.columns = list(smarts_patterns_filtered.keys())

# Concatenate the original DataFrame with the pattern counts
data_with_features = pd.concat([data, pattern_counts], axis=1)
# Ensure Kd is numeric and create a binary classification target based on Kd values
data_with_features['Kd'] = pd.to_numeric(data_with_features['Kd'], errors='coerce')
data_with_features.dropna(subset=['Kd'], inplace=True)

data_with_features['Kd_category'] = (data_with_features['Kd'] < 2).astype(int) - (data_with_features['Kd'] > 5).astype(int)
data_with_features['Low_Kd'] = (data_with_features['Kd'] < 1).astype(int)
data_with_features = data_with_features[data_with_features['Kd_category'] != 0]
chemical_features = [
    "hydroxyl", "carboxyl", "amino", "aldehyde",
    "ketone", "ester", "amide", "ether", "nitrile", "sulfone", "sulfoxide",
    "thiol", "halide", "phenyl", "benzyl", "alkene", "alkyne", "aromatic_nitrogen",
    "hydrazone", "imine", "alkyl_halide", "aromatic", "alcohol", "epoxide",
    "alkane", "logP"
]

method_names = [
    "count_zinc_fingers",
    "count_helix_loop_helix",
    "count_SH3_domains",
    "count_leucine_zipper",
    "count_serine_threonine_kinase_domains",
    "count_PH_domains",
    "count_WW_domains",
    "count_EF_hand_domains",
    "find_cam_binding_domains"
]

amino_acid_names_dep = [
    'Glutamic acid',
    'Glutamine',
    'Glycine',
    'Lysine',
    'Arginine',
    'normalized_amine_groups'
]
amino_acid_names = [
    'normalized_amine_groups',
    'Alanine',
    'Arginine',
    'Asparagine',
    'Aspartic acid',
    'Cysteine',
    'Glutamic acid',
    'Glutamine',
    'Glycine',
    'Histidine',
    'Isoleucine',
    'Leucine',
    'Lysine',
    'Methionine',
    'Phenylalanine',
    'Proline',
    'Serine',
    'Threonine',
    'Tryptophan',
    'Tyrosine',
    'Valine'
]

protein_domains = amino_acid_names




# Function to randomly select 10 different items from an array of strings
def random_select_10_from_array():
    return ['logP']
    #return random.sample(chemical_features, 1)

# Function to randomly select 10 different items from an array of strings
def random_select_1_from_array():
    return random.sample(protein_domains, 10)
    # random_number = random.randint(0, len(protein_domains)-1) 
    # return [protein_domains[random_number]]

cfeatures_list = chemical_features
for i in range(1000):
    random_number = random.randint(1, 10) 
    features_list = random_select_10_from_array (  )
    features_list2 = random_select_1_from_array (  )
    f = features_list + features_list2
    
    print ( f )
    print (f[0], ' and ',f[1] )
    print ( data_with_features[f[0]] )


    X = data_with_features[f]  # Features are the counts of SMARTS patterns
    y = data_with_features['Kd_category']  # Target variable
    print ( 'count rows : ', len(data_with_features))
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    clf = RandomForestClassifier(n_estimators=5000, random_state=42)
    clf.fit(X_train, y_train)
    predictions = clf.predict(X_test)
    report = classification_report(y_test, predictions)#, target_names=label_encoder.classes_)
    rdf = pd.DataFrame(clf.feature_importances_,
                                index = X_train.columns,
                                columns=['importance']).sort_values('importance', ascending=False)
    trdf = rdf[rdf['importance'] > 0.2]
    if ( len(trdf)>0):
        rdf.to_csv ( f'./protein-structure/{i}feature-importance.out')
    y = data_with_features['Low_Kd']  # Target variable
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    # Create a pipeline with PolynomialFeatures and RandomForestClassifier
    # Adjust `degree` as needed to explore different combinations of features
    pipeline = make_pipeline(PolynomialFeatures(degree=3, include_bias=False), RandomForestClassifier(n_estimators=5000, random_state=42))

    # Train the model
    pipeline.fit(X_train, y_train)

    # Predict on test data
    predictions = pipeline.predict(X_test)

    # Evaluate the model
    print("Accuracy:", accuracy_score(y_test, predictions))
    print("Classification Report:\n", classification_report(y_test, predictions))

    # Feature Importance (from RandomForest)
    feature_importances = pipeline.named_steps['randomforestclassifier'].feature_importances_

    # Adjusted part: using get_feature_names_out() for compatibility with newer sklearn versions
    feature_names = pipeline.named_steps['polynomialfeatures'].get_feature_names_out(input_features=X.columns)

    # Map feature importances to their names and sort them
    importance_df = pd.DataFrame({'Feature': feature_names, 'Importance': feature_importances}).sort_values(by='Importance', ascending=False)

    importance_df_nonzero = importance_df[importance_df['Importance'] > 0.0]
    for p in importance_df:
        print ( p )


    print ( 'index, ', i )
    if len(importance_df_nonzero):
        importance_df_nonzero.to_csv ( f'./protein-structure/hits{i}.out')
    # Write the classification report to a text file
    # report_file_path = 'classification_report.txt'  # Specify your desired file path
    # with open(report_file_path, 'w') as f:
    #     f.write(report)
