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



# Define a function that checks if a SMILES string is valid by trying to create an RDKit molecule object from it
def is_valid_smiles(smiles):
    mol = Chem.MolFromSmiles(smiles)
    return mol is not None  # Returns True if mol creation was successful, False otherwise

# Load the dataset
file_path = './bt-proteins.csv'  # Adjust the path to your file location
data = pd.read_csv(file_path)

data['Kd'] = pd.to_numeric(data['Kd'], errors='coerce')
data.dropna(subset=['Kd'], inplace=True)
data['valid_smiles'] = data['SMILES'].apply(is_valid_smiles)
data_valid_smiles = data[data['valid_smiles']]
data = data_valid_smiles.drop(columns=['valid_smiles'])


# Apply the function to each SMILES string in the dataset
pattern_counts = data['SMILES'].apply(lambda x: pd.Series(count_smarts_patterns(x, smarts_patterns_filtered)))

# Set column names for the pattern counts
pattern_counts.columns = list(smarts_patterns_filtered.keys())

# Concatenate the original DataFrame with the pattern counts
data_with_features = pd.concat([data, pattern_counts], axis=1)
# Ensure Kd is numeric and create a binary classification target based on Kd values
data_with_features['Kd'] = pd.to_numeric(data_with_features['Kd'], errors='coerce')
data_with_features.dropna(subset=['Kd'], inplace=True)

data_with_features['Kd_category'] = (data_with_features['Kd'] < 5).astype(int) - (data_with_features['Kd'] > 100).astype(int)




data_with_features = data_with_features[data_with_features['Kd_category'] != 0]
cfeatures_list = [
        'basic_in_acidic_conditions', 'acidic_in_acidic_conditions','hydrophobic_in_acidic_conditions',
        'hydrophilic_in_acidic_conditions','polar_groups','Molecular_Weight','Polarity', 'Hydrophobicity',
        # 'MENTAL', 'DUF3574', 'DUF373', 'TIL',
        # '7tm_1',
        # 'DUF1385',
        # '7TM_GPCR_Srsx', 
        # 'G3P_acyltransf', 'Calcyon',
        # 'AFG1_ATPase', 'SelP_N', 'TAS2R', 'FxsA', 
        # '7TM_GPCR_Srv', '7tm_4','7TM_GPCR_Srw', '7TM_GPCR_Srx',
        # 'RseC_MucC', 'EVC2_like', 'Phage_30_3',  
        # 'DUF202', 'DUF1725', 'RVT_1', 'DUF3704', 'Tnp_22_trimer', 'Transposase_22', 'DUF1492', 'SlyX', 'GCP_N_terminal', 
        # 'DUF1515',  'Cyt_bd_oxida_II', 'ArsP_1',  'DUF3671', 'DUF3169', 'KilA-N', 'Tnp_22_dsRBD', 
        # 'Laminin_II', 'DUF4686', 'DUF2095', 'Noelin-1', 'T3SS_basalb_I', 'CENP-F_leu_zip', 'TMPIT', 'Viral_NABP', 'Mt_ATP-synt_D', 'Serine_rich', 
        # 'DUF1664', 'FAM27', 'SOAR', 'DUF2203', 'DegS', 'Tweety', 'Exo_endo_phos_2', 'Exo_endo_phos', 'YwiC', 'NICE-1', 'DUF5416', 'DUF1651', 'FAF', 'NAD-GH', 
        # 'Pox_P21', 'Orf78', 'DUF2208', 'DUF4834', 'Shisa', 'FAA_hydrolase_N', 'ABC-3', 'CCER1', 'Sid-5', 'Chromate_transp', 'DUF5559', 'PqiA', 'CIDR1_gamma', 'DUF3098',
        # 'Bee_toxin', 'DUF4284', 'SLC3A2_N', 'Piezo_RRas_bdg', 'Macoilin', 'TP2', 'DUF3346', 'Neur_chan_memb', 'Insulin_TMD', 'DUF4491', 'ThiJ_like', 'DUF997', 'Pox_E6',
        # 'DUF2232', 'YqzL', 'PUNUT', 'DUF2206', 'TMEM191C', 'DUF2768', 'DUF5313', 'RIFIN', 'Stevor', 'CcmH', 'zf-Nse', 'DUF5393', 'DUF2528', 'Fibrillin_U_N', 'EMI', 'DUF5346', 
        # 'ARL6IP6', 'DUF1661', 'Dicty_CAR', 'DUF4231', 'DMRT-like', 'DUF5626', 'Sirohm_synth_C', 'vMSA', 'Vfa1', 'PTPRCAP', 'Abhydrolase_9_N', 'MWFE', 'TraG_N', 'Ni_hydr_CYTB', 
        # 'DUF3810', 'DUF485', 'Neur_chan_LBD', 'Glyco_hydro_57', 'Papilloma_E5', 'DUF2852', 'zf-LITAF-like', 'Keratin_2_head', 'DUF2631', 'STE3', 'SecG', 'FDX-ACB', 'Dynamin_M', 
        # 'DUF4417', 'Psu', 'CDH', 'DUF16', 'Syntaxin-6_N', 'FlxA', 'Glycoprotein_G', 'PilJ', 'DUF3636', 'Gastrin', 'ECH_2', 'GTP_EFTU', 'BRICHOS', 'Orthoreo_P17', 'Histone', 'Tantalus',
        # "Alanine",
        # "Arginine",
        # "Asparagine",
        # "Aspartic acid",
        # "Cysteine",
        # "Glutamic acid",
        # "Glutamine",
        # "Glycine",
        # "Histidine",
        # "Isoleucine",
        # "Leucine",
        # "Lysine",
        # "Methionine",
        # "Phenylalanine",
        # "Proline",
        # "Serine",
        # "Threonine",
        # "Tryptophan",
        # "Tyrosine",
        # "Valine"
    ]

highhitlist = ['7tm_1', 'DUF1385', '7TM_GPCR_Srsx', 'TAS2R', '7TM_GPCR_Srv', '7tm_4', 'DUF1725', 'RVT_1', '7TM_GPCR_Srx', '7TM_GPCR_Srw', 'Orf78']

cfeatures_list = cfeatures_list +  highhitlist 


# Function to randomly select 10 different items from an array of strings
def random_select_10_from_array(array):
    if len(array) < 10:
        raise ValueError("Array must have at least 10 items.")
    return random.sample(array, 10)


for i in range(10001):



    random_number = random.randint(1, 10) 
    data_with_features['glycine_dist'] = data_with_features['protein_sequence'].apply(lambda x: pd.Series(normalized_glycine_distances(x)))
    data_with_features[f'gp_prox{random_number}'] = data_with_features['protein_sequence'].apply(lambda x: pd.Series(count_gp_proximity(x, random_number)))
    cfeatures_list.append ( 'glycine_dist')
    cfeatures_list.append ( f'gp_prox{random_number}')


    features_list = random_select_10_from_array ( cfeatures_list )
    X = data_with_features[features_list]  # Features are the counts of SMARTS patterns
    y = data_with_features['Kd_category']  # Target variable
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    clf = RandomForestClassifier(n_estimators=1000, random_state=42)
    clf.fit(X_train, y_train)
    predictions = clf.predict(X_test)
    report = classification_report(y_test, predictions)#, target_names=label_encoder.classes_)
    rdf = pd.DataFrame(clf.feature_importances_,
                                index = X_train.columns,
                                columns=['importance']).sort_values('importance', ascending=False)
    trdf = rdf[rdf['importance'] > 0]
    if ( len(trdf)>0):
        rdf.to_csv ( f'{i}feature-importance.csv')




    # Create a pipeline with PolynomialFeatures and RandomForestClassifier
    # Adjust `degree` as needed to explore different combinations of features
    pipeline = make_pipeline(PolynomialFeatures(degree=3, include_bias=False), RandomForestClassifier(n_estimators=50000, random_state=42))

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

    importance_df_nonzero = importance_df[importance_df['Importance'] > 0]
    print ( importance_df )

    print ( 'index, ', i )
    if len(importance_df_nonzero):
        importance_df_nonzero.to_csv ( f'FoundSOME-{i}-poly.csv')
    # Write the classification report to a text file
    # report_file_path = 'classification_report.txt'  # Specify your desired file path
    # with open(report_file_path, 'w') as f:
    #     f.write(report)
