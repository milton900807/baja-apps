import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier

df = pd.read_csv('../../conjugates/bt-proteins2.csv')
df_filtered = df[df['Kd'] < 5]

# Basic preprocessing
# Ensure your SMILES and sequences are correctly formatted and non-null
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
# Function to count occurrences of SMARTS patterns in a SMILES string
def count_smarts_patterns(smiles, patterns):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return [0] * len(patterns)  # Return a list of zeros if the molecule can't be parsed
    counts = []
    for pattern in patterns.values():
        smarts = Chem.MolFromSmarts(pattern)
        count = len(mol.GetSubstructMatches(smarts))
        counts.append(count)
    return counts

# Apply the function to count SMARTS patterns
pattern_names = list(smarts_patterns_filtered_all.keys())
smiles_features = df_filtered['SMILES'].apply(lambda x: count_smarts_patterns(x, smarts_patterns_filtered_all))
smiles_features_df = pd.DataFrame(smiles_features.tolist(), columns=pattern_names)

# Concatenate SMILES-derived features (from SMARTS patterns) with df_filtered for clustering
df_filtered = pd.concat([df_filtered.reset_index(drop=True), smiles_features_df], axis=1)

# Assume 'sequence_features' and 'smiles_features' are already defined and include SMARTS pattern counts
# Proceed with feature standardization and clustering as previously demonstrated

# Standardize features (including both sequence-derived and SMILES-derived features)
# This is an example; adapt as needed based on your actual feature columns
features_to_cluster = df_filtered[['sequence_features'] + pattern_names].values
scaler = StandardScaler()
features_scaled = scaler.fit_transform(features_to_cluster)

# Clustering
kmeans = KMeans(n_clusters=5, random_state=0).fit(features_scaled)
df_filtered['cluster'] = kmeans.labels_

