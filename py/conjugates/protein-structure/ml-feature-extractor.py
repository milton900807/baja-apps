import pandas as pd
from rdkit import Chem
from rdkit.Chem import rdqueries
from sklearn.model_selection import train_test_split
from sklearn.linear_model import Lasso
from sklearn.metrics import mean_squared_error
import random
# Load dataset
dataset = pd.read_csv('./bt-proteins2.csv')  # Adjust path as needed

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


# Function to convert SMILES to binary features based on SMARTS
def smarts_to_features(smiles, smarts_patterns):
    mol = Chem.MolFromSmiles(smiles)
    features = []
    for smarts in smarts_patterns.values():
        pattern = Chem.MolFromSmarts(smarts)
        features.append(int(mol.HasSubstructMatch(pattern)))
    return features

random_number = random.randint(1, 10)

dataset['glycine_dist'] = dataset['protein_sequence'].apply(lambda x: pd.Series(normalized_glycine_distances(x)))
dataset['gp_prox'] = dataset['protein_sequence'].apply(lambda x: pd.Series(count_gp_proximity(x, random_number)))
dataset['Kd'] = pd.to_numeric(dataset['Kd'], errors='coerce')
dataset.dropna(subset=['Kd'], inplace=True)


# Apply feature engineering to the dataset
features = dataset['SMILES'].apply(lambda x: smarts_to_features(x, smarts_patterns_filtered))
flist = features.tolist()
flist.append ( 'glycine_dist')
flist.append ( 'gp_prox')
features_df = pd.DataFrame(features.tolist(), columns=smarts_patterns_filtered.keys())
# Prepare the data for training
X = features_df
y = dataset['Kd']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a model
model = Lasso(alpha=0.1)
model.fit(X_train, y_train)

# Evaluate the model
y_pred = model.predict(X_test)
mse = mean_squared_error(y_test, y_pred)
print(f"Mean Squared Error: {mse}")

# Analyze feature importance
importance = pd.DataFrame({'Feature': smarts_patterns_filtered.keys(), 'Coefficient': model.coef_})
print(importance.sort_values(by='Coefficient', ascending=False))
# Assuming the rest of the script is the same and the model has been trained

# Analyze feature importance and sort by absolute value of coefficient for importance
importance = pd.DataFrame({'Feature': smarts_patterns_filtered.keys(), 'Coefficient': model.coef_})
importance['AbsoluteCoefficient'] = importance['Coefficient'].abs()
importance_sorted = importance.sort_values(by='AbsoluteCoefficient', ascending=False).drop('AbsoluteCoefficient', axis=1)

print("Features sorted by their importance in predicting Kd:")
print(importance_sorted)
importance_sorted.to_csv ('feature-finder.csv')
