from rdkit import Chem
from rdkit.Chem import Crippen
import pandas as pd
from sklearn.datasets import make_classification

from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen
from sklearn.model_selection import train_test_split
from itertools import combinations



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

smarts_patterns_filtered_subset = {
    'carboxyl': 'C(=O)O',
    'amino': '[NX3;H2,H1;!$(NC=O)]',
    'aldehyde': '[CX3H1](=O)[#6]',
    'ketone': '[#6][CX3](=O)[#6]',
    'ester': '[#6]C(=O)O[#6]',
    'amide': '[NX3][CX3](=O)[#6]',
    'ether': '[#6]O[#6]',
    'benzyl': '[#6]c1ccccc1',
    'aromatic': 'c1ccccc1',
    'alcohol': '[OH]',
}



from rdkit.Chem import Descriptors, Crippen, Lipinski

from rdkit import Chem

chem_features_all = {
    'LogP': lambda smiles: Crippen.MolLogP(Chem.MolFromSmiles(smiles)),
    'CalcKappa1': lambda smiles: Descriptors.Kappa1(Chem.MolFromSmiles(smiles)),
    'CalcKappa2': lambda smiles: Descriptors.Kappa2(Chem.MolFromSmiles(smiles)),
    'CalcKappa3': lambda smiles: Descriptors.Kappa3(Chem.MolFromSmiles(smiles)),
    'TPSA': lambda smiles: Descriptors.TPSA(Chem.MolFromSmiles(smiles)),
    'RotatableBonds': lambda smiles: Lipinski.NumRotatableBonds(Chem.MolFromSmiles(smiles)),
    "Molecular_Weight": lambda smiles: Descriptors.MolWt(Chem.MolFromSmiles(smiles)),
}


def calculate_feature_count(smiles, pattern_keys):
    """
    Calculates the total count of matched features based on SMARTS patterns in a given SMILES string.
    
    Args:
    smiles (str): A SMILES string representing a chemical compound.
    pattern_keys (str): A string that can be a single SMARTS pattern key or multiple keys separated by commas.
    smarts_patterns_filtered_all (dict): Dictionary mapping pattern keys to their SMARTS patterns.
    
    Returns:
    int: The total count of features matched.
    """
    # Initialize the total feature count
    total_feature_count = 0
    mol = Chem.MolFromSmiles(smiles)
    
    # Split the pattern keys if multiple, otherwise use a single-key list
    keys = pattern_keys.split(',') if ',' in pattern_keys else [pattern_keys]
    
    for key in keys:
        pattern = smarts_patterns_filtered_all.get(key, "")
        if pattern:
            smarts = Chem.MolFromSmarts(pattern)
            # Instead of checking for any match, count all matches
            match_count = len(mol.GetSubstructMatches(smarts))
            if match_count > 0:
                # Accumulate the count of matches
                total_feature_count += match_count
                
    return total_feature_count


def calculate_features(smiles, smarts_patterns):
    features = []
    mol = Chem.MolFromSmiles(smiles)
    for name, pattern in smarts_patterns.items():
        smarts = Chem.MolFromSmarts(pattern)
        val = len(mol.GetSubstructMatches(smarts))
        if val>0:
            features.append(val)
        
    return (len(features)==len(smarts_patterns))

def calculate_feature(smiles, pattern):
    feature_presence = 0  # Assume feature is absent initially
    mol = Chem.MolFromSmiles(smiles)
    
    keys = [pattern]
    if ',' in pattern:
        keys = pattern.split(',')
    else:
        keys = [pattern]

    has_feature = 1
    for key in keys:
        pattern = smarts_patterns_filtered_all.get(key, "")
        if pattern:
            smarts = Chem.MolFromSmarts(pattern)
            if not mol.HasSubstructMatch(smarts):
                has_feature = 0
                break  # No need to check further patterns if one is missing
        else:
            has_feature = 0  # Treat missing keys as not matching
            break
        if has_feature:
            feature_presence = 1
            break  # Since we only need at least one feature present, we can stop checking further

    return feature_presence






# di_amino_acid_patterns = [f'{a},{a}' for a in smarts_patterns_filtered_all]
# for pattern in di_amino_acid_patterns:
#     chem_features_all[f"{pattern}_pattern"] = lambda smiles, pattern=pattern: calculate_feature(smiles, pattern)

# tri_amino_acid_patterns = [f'{a},{a},{a}' for a in smarts_patterns_filtered_all]
# for pattern in tri_amino_acid_patterns:
#     chem_features_all[f"{pattern}"] = lambda smiles, pattern=pattern: calculate_feature(smiles, pattern)


single_aa = [a for a in smarts_patterns_filtered_all]
for pattern in single_aa:
    chem_features_all[f"{pattern}_pattern"] = lambda smiles, pattern=pattern: calculate_feature_count(smiles, pattern)


pattern_pairs = combinations(smarts_patterns_filtered_subset.keys(), 3)

for pattern1, pattern2, pattern3 in pattern_pairs:
    feature_name = f"{pattern1}_{pattern2}_{pattern3}_pattern"
    chem_features_all[feature_name] = lambda smiles, pattern1=pattern1, pattern2=pattern2, pattern3=pattern3: calculate_feature_count(smiles, f"{pattern1},{pattern2},{pattern3}")


pattern_pairs = combinations(smarts_patterns_filtered_subset.keys(), 4)
for pattern1, pattern2, pattern3, pattern4 in pattern_pairs:
    feature_name = f"{pattern1}_{pattern2}_{pattern3}_{pattern4}_pattern"
    chem_features_all[feature_name] = lambda smiles, pattern1=pattern1, pattern2=pattern2, pattern3=pattern3, pattern4=pattern4: calculate_feature_count(smiles, f"{pattern1},{pattern2},{pattern3},{pattern4}")
