from tensorflow.keras.layers import Input, LSTM, Dense, Concatenate
from tensorflow.keras.models import Model
import pandas as pd
from rdkit import Chem
from rdkit.Chem import AllChem
import numpy as np
import sys

# Load the dataset

df = pd.read_csv('../../conjugates/bt-proteins2.csv')

df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])
df = df[df['Kd'].apply(lambda x: isinstance(x, float) and not pd.isnull(x))]
# df = df.groupby('SMILES')['Kd'].agg(Kdm=('Kd', 'mean'), Std=('Kd', 'std')).reset_index()
aggregated_df = df.groupby('SMILES')['Kd'].agg(
        meanKd='mean',
        standard_deviation='std'
    ).reset_index()
    

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

def normalized (data):
    df = pd.DataFrame(data)
    scaler = MinMaxScaler()
    normalized_data = scaler.fit_transform(df)
    normalized_df = pd.DataFrame(normalized_data, columns=df.columns)
    return normalized_data


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
# Filter the dataset for "good" and "bad" SMILES based on Kd values
good_df = aggregated_df[aggregated_df['meanKd'] < 1]
bad_df = aggregated_df[aggregated_df['meanKd'] > 100]


pattern_names = list(smarts_patterns_filtered_all.keys())
good_smiles_features = good_df['SMILES'].apply(lambda x: count_smarts_patterns(x, smarts_patterns_filtered_all))


total_counts = dict.fromkeys(smarts_patterns_filtered_all.keys(), 0)
smiles_features_df = pd.DataFrame(good_smiles_features.tolist(), columns=pattern_names)
smiles_features_df.to_csv('./gsmiles.csv', index=False)
total_counts = smiles_features_df.sum().to_dict()
total_counts_df = pd.DataFrame([total_counts], columns=pattern_names)
total_counts_df.to_csv('./total_counts.csv', index=False)
for _, row in good_smiles_features.iterrows():
    structure_counts = row['SMILES']
    for i, key in enumerate(total_counts.keys()):
        total_counts[key] += structure_counts[i]

print ( ' =====================  ')
print ( total_counts )
sys.exit()



# Example dimensions
smiles_dim = 100  # Dimensionality of encoded SMILES strings
smarts_count_dim = len(smarts_patterns_filtered_all)  # Number of SMARTS patterns
latent_dim = 50  # Size of the latent space

# Input layers
smiles_input = Input(shape=(smiles_dim,))
smarts_input = Input(shape=(smarts_count_dim,))

# Encoding layers
smiles_encoded = LSTM(latent_dim)(smiles_input)
smarts_encoded = Dense(latent_dim, activation='relu')(smarts_input)

# Combine encoded inputs
combined = Concatenate()([smiles_encoded, smarts_encoded])

# Decoding layers (mirroring the encoding layers)
decoded = Dense(smiles_dim + smarts_count_dim, activation='sigmoid')(combined)

# Autoencoder model
autoencoder = Model(inputs=[smiles_input, smarts_input], outputs=decoded)
autoencoder.compile(optimizer='adam', loss='binary_crossentropy')
preprocessed_good_smiles = preprocess_smiles(good_smiles)


from sklearn.preprocessing import MinMaxScaler
import pandas as pd

normalized_good_smarts_counts = getSmarts ( )


# Assuming preprocessed_good_smiles and normalized_good_smarts_counts are your preprocessed features
autoencoder.fit([preprocessed_good_smiles, normalized_good_smarts_counts], 
                [preprocessed_good_smiles, normalized_good_smarts_counts], 
                epochs=50, batch_size=256)
