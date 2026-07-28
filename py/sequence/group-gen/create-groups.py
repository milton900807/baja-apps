from tensorflow.keras.layers import Input, LSTM, Dense, Concatenate
from tensorflow.keras.models import Model
import pandas as pd
from rdkit import Chem
from rdkit.Chem import AllChem
import numpy as np
import sys

# Load the dataset

df = pd.read_csv('../../bt-proteins2.csv')

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

group_dfs = []
for protein_sequence, group_df in df.groupby('protein_sequence'):
    new_df = group_df[['SMILES', 'protein_sequence', 'Kd']].copy()
    group_dfs.append(new_df)


# Calculate the size (number of rows) of each group and then the average size
group_sizes = df.groupby('protein_sequence').size()
average_group_size = group_sizes.mean()
print ( 'Average size of the groups ', average_group_size )
print ( ' Number of groups', len(group_dfs))



# Initialize a list to store the range of Kd values for each group
kd_ranges = []

# Step 2: Iterate over each group formed by 'protein_sequence'
for _, group_df in df.groupby('protein_sequence'):
    # Calculate the range of Kd values within this group
    kd_range = group_df['Kd'].max() - group_df['Kd'].min()
    if group_df['Kd'].min() < 1 and group_df['Kd'].max() > 100:
        kd_ranges.append(kd_range)

# Calculate the average of these ranges
average_kd_range = pd.Series(kd_ranges).mean()

print(f'Average range of Kd for all groups: {average_kd_range}')


qualifying_groups_count = 0
for _, group_df in df.groupby('protein_sequence'):
    # Check if the group's Kd values meet the specified criteria
    if group_df['Kd'].min() < 1 and group_df['Kd'].max() > 100:
        qualifying_groups_count += 1

print(f'Number of groups with min Kd < 1 and max Kd > 100: {qualifying_groups_count}')
