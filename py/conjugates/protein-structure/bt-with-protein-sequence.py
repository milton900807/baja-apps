from collections import Counter
import re
import pandas as pd
import json
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
from rdkit.Chem import Crippen


# Load the CSV files into DataFrames
# data_file_path = './bt-proteins.csv'  # Update this path
data_file_path = './bdb-kikd.csv'  # Update this path
lookup_file_path = './protein-struc.csv'  # Update this path

data = pd.read_csv(data_file_path)
lookup = pd.read_csv(lookup_file_path)
# highhitlist = ['7tm_1', 'DUF1385', '7TM_GPCR_Srsx', 'TAS2R', '7TM_GPCR_Srv', '7tm_4', 'DUF1725', 'RVT_1', '7TM_GPCR_Srx', '7TM_GPCR_Srw', 'Orf78']
smarts_patterns_filtered = {
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



import re

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


def remove_outliers_for_large_groups(df, group_column='protein_sequence', target_column='Kd', min_group_size=5):
    """
    Removes potential outliers from a DataFrame within each group defined by 'group_column',
    based on the 'target_column' values using the Interquartile Range (IQR) method, but only
    for groups with a number of observations greater than 'min_group_size'.
    
    Args:
    df (pd.DataFrame): The input DataFrame.
    group_column (str): The name of the column to group by.
    target_column (str): The name of the column to analyze for outliers.
    min_group_size (int): The minimum number of observations a group must have to consider
                          outlier removal.
    
    Returns:
    pd.DataFrame: A new DataFrame with potential outliers removed from groups meeting
                  the size criterion.
    """
    # Function to identify outliers within a group
    def identify_outliers(group):
        if len(group) >= min_group_size:
            q1 = group.quantile(0.25)
            q3 = group.quantile(0.75)
            iqr = q3 - q1
            return (group < (q1 - 2 * iqr)) | (group > (q3 + 2 * iqr))
        else:
            # If the group size is smaller than min_group_size, do not identify any outliers
            return pd.Series([False] * len(group), index=group.index)
    
    # Apply the outlier identification function within each group and get a boolean mask
    outlier_mask = df.groupby(group_column)[target_column].transform(identify_outliers)
    
    # Filter the DataFrame to exclude outliers
    filtered_df = df[~outlier_mask]
    
    return filtered_df


cache = {}
# Function to validate SMILES strings using RDKit
def is_valid_smiles(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol is not None:
        cache[smiles]=mol
    return mol is not None


# Filter the DataFrame to keep only rows with valid SMILES
data = data[data['SMILES'].apply(is_valid_smiles)]


# Function to calculate the count of each SMARTS pattern in a molecule
def count_smarts_patterns(smiles, patterns):
    
    mol = cache[smiles]
    if mol is None:            
        mol = Chem.MolFromSmiles(smiles)
    if mol is None: return [0] * len(patterns)  # Return a list of zeros if the molecule can't be parsed
    counts = []
    if mol is None: 
        return 0
    for pattern in patterns.values():
        smarts = Chem.MolFromSmarts(pattern)
        count = len(mol.GetSubstructMatches(smarts))
        counts.append(count)
    return counts



# Define the method
def add_regex_counts(dataframe, regex_list):
    """
    Counts occurrences of patterns defined in regex_list within each sequence in the dataframe.
    
    Parameters:
    - dataframe (pd.DataFrame): DataFrame containing the sequences.
    - regex_list (list of tuples): Each tuple contains (regex pattern, column name).
    
    Returns:
    - pd.DataFrame: Original DataFrame with added columns for each regex count.
    """
    for regex, name in regex_list:
        # Use a lambda function to count occurrences of each pattern
        dataframe[name] = dataframe['protein_sequence'].apply(lambda seq: len(re.findall(regex, seq)))
    return dataframe
# Assuming the 'structure' column in 'lookup' contains JSON data with a 'sequence' key
def extract_sequence(ensembl_gene_id, lookup_df):
    """
    Extracts the protein sequence for a given ensembl_gene_id from the lookup DataFrame.
    
    Parameters:
    - ensembl_gene_id (str): The Ensembl Gene ID to search for.
    - lookup_df (pd.DataFrame): The DataFrame containing the lookup data.
    
    Returns:
    - str: The protein sequence if found, otherwise None.
    """
    row = lookup_df[lookup_df['ensembl_gene_id'] == ensembl_gene_id]
    if not row.empty:
        
        structure_json = row.iloc[0]['structure']
        # print ( structure_json )

        try:
            structure_json = structure_json.replace("'", '"')

            structure_data = json.loads(str(structure_json))
            # print ( structure_data )
            # Assuming the sequence is stored under a key named 'sequence'
            return structure_data.get('sequence', None)
        except json.JSONDecodeError as e:
            
            match = re.search(r'"sequence":\s*"([^"]+)"', structure_json)
            if match:
                return match.group(1)  # Return the matched sequence value
            else:
                print ( structure_json )
                print ( ' failed ', e)
                return None
    return None



print ( ' Count', len(data))
data = remove_outliers_for_large_groups ( data )
print ('Count after outlier filter: ', len(data))

# Loop over the rows in 'data' and append the protein sequence
# data['protein_sequence'] = data['ensembl_gene_id'].apply(lambda id: extract_sequence(id, lookup))
data.dropna(subset=['protein_sequence'], inplace=True)


hydrophobic_aa = set('AILVFMWY')
hydrophilic_aa = set('RKHDESTNQ')
neutral_aa = set('CGP')


def count_hydrox_reactive_sites(peptide_sequence):
    """
    Counts the total number of potential reactive sites for hydroxyl groups
    in a peptide chain, focusing on amino acids with hydroxyl groups or
    those that can react with hydroxyl groups under certain conditions.

    Args:
    peptide_sequence (str): The peptide sequence.

    Returns:
    int: The total count of reactive sites.
    """
    # Amino acids considered for their potential to react with hydroxyl groups
    reactive_amino_acids = ['S', 'T', 'Y']  # Serine, Threonine, Tyrosine
    
    # Count the occurrences of each reactive amino acid in the sequence
    reactive_sites_count = sum(peptide_sequence.count(aa) for aa in reactive_amino_acids)

    return reactive_sites_count

# Function to calculate properties
def calculate_properties(seq, type):
    properties = {
        'hydrophobic_residues': sum(seq.count(aa) for aa in hydrophobic_aa),
        'hydrophilic_residues': sum(seq.count(aa) for aa in hydrophilic_aa),
        'neutral_residues': sum(seq.count(aa) for aa in neutral_aa),
        'lysine_residues': seq.count('K'),
    }
    # Count of each amino acid
    for aa in set(seq):
        properties[aa] = seq.count(aa)
    return properties

# Apply the function to each sequence in the DataFrame

pattern_counts = data['SMILES'].apply(lambda x: pd.Series(count_smarts_patterns(x, smarts_patterns_filtered)))
pattern_counts.columns = list(smarts_patterns_filtered.keys())


amino_acid_regex_list = [
    (r'A', 'Alanine'),
    (r'R', 'Arginine'),
    (r'N', 'Asparagine'),
    (r'D', 'Aspartic acid'),
    (r'C', 'Cysteine'),
    (r'E', 'Glutamic acid'),
    (r'Q', 'Glutamine'),
    (r'G', 'Glycine'),
    (r'H', 'Histidine'),
    (r'I', 'Isoleucine'),
    (r'L', 'Leucine'),
    (r'K', 'Lysine'),
    (r'M', 'Methionine'),
    (r'F', 'Phenylalanine'),
    (r'P', 'Proline'),
    (r'S', 'Serine'),
    (r'T', 'Threonine'),
    (r'W', 'Tryptophan'),
    (r'Y', 'Tyrosine'),
    (r'V', 'Valine'),
]
amino_acid_names = [
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
ts = ['hydrophilic_residues',
    'neutral_residues',
    'lysine_residues']

# data_with_domains['hydroxl_reactive_sites'] = data_with_domains['protein_sequence'].apply(lambda x: count_hydrox_reactive_sites(x))
featuresList =  ['SMILES'] + ['protein_sequence']  
# Function to count occurrences of each amino acid
def add_amino_acid_counts(row, regex_list):
    for regex, aa_name in regex_list:
        row[aa_name] = len(re.findall(regex, row['protein_sequence']))/len(row['protein_sequence'])
    return row




# Method to count chemical groups in SMILES strings and add counts to the DataFrame
def add_chemical_group_counts(df, smarts_patterns):
    # Convert SMARTS patterns to RDKit Mol objects for pattern matching
    smarts_mols = {name: Chem.MolFromSmarts(pattern) for name, pattern in smarts_patterns.items()}
    
    # Initialize columns in the DataFrame for each chemical group
    for name in smarts_patterns.keys():
        df[name] = 0
    
    # Iterate over the DataFrame rows
    for index, row in df.iterrows():
        mol = cache[row['SMILES']]
        if mol is None:
            mol = Chem.MolFromSmiles(row['SMILES'])
        for name, smarts_mol in smarts_mols.items():
            count = len(mol.GetSubstructMatches(smarts_mol))
            df.at[index, name] = count
    
    return df

def mol_log_p ( smiles ): 
    mol = cache[smiles]
    if mol is None:
        mol = Chem.MolFromSmiles(smiles)
    return Crippen.MolLogP(mol)

def add_logp_column(df):
    """
    Adds a column to the DataFrame with logP values for the molecules
    represented by the SMILES strings in the 'SMILES' column.

    Parameters:
    df (pandas.DataFrame): DataFrame with a 'SMILES' column.

    Returns:
    pandas.DataFrame: Updated DataFrame with a new 'logP' column.
    """
    # Check if 'SMILES' column exists
    if 'SMILES' not in df.columns:
        raise ValueError("DataFrame must contain a 'SMILES' column.")
    
    # Calculate logP for each SMILES string and store in a new 'logP' column
    df['logP'] = df['SMILES'].apply(lambda x: mol_log_p(x))

    return df





# # Define a threshold for what is considered a "large" standard deviation
# large_std_threshold = 0.1

# # Calculate the standard deviation for 'Kd' within each 'protein_sequence' group
# std_deviation_by_sequence = data_with_domains.groupby('protein_sequence')['Kd'].std()

# # Identify groups with a standard deviation larger than the threshold
# groups_with_large_std = std_deviation_by_sequence[std_deviation_by_sequence > large_std_threshold].index

# # Filter out rows from the original DataFrame that belong to groups with a large standard deviation
# data_with_domains = data_with_domains[~data_with_domains['protein_sequence'].isin(groups_with_large_std)]





print ('data with domains',  len(data_with_domains) )


# Use the method to add chemical group counts to the DataFrame
data = add_chemical_group_counts(data, smarts_patterns_filtered)
data = add_logp_column ( data )
# Example: Dynamically adding columns to the DataFrame for each method
for method_name in method_names:
    data[method_name] = data['protein_sequence'].apply(lambda sequence: apply_method(sequence, method_name))


smli = []
for l in smarts_patterns_filtered:
    print ( l )
    smli.append ( str(l) )
# Apply the function to each row in the DataFrame
data = data.apply(lambda row: add_amino_acid_counts(row, amino_acid_regex_list), axis=1)
featuresList = featuresList + smli + ["logP"] + ['Kd'] + method_names + amino_acid_names

print ( featuresList )
bt_pr = data[featuresList]


# Verify the results
print(data.head())
bt_pr.to_csv ( './bt-proteins2.csv')
print ( data.columns )
