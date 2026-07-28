import pandas as pd
from Bio.SeqUtils.ProtParam import ProteinAnalysis
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler
from Bio.SeqUtils.ProtParam import ProteinAnalysis
from collections import defaultdict
from rdkit import Chem
from rdkit.Chem import rdFMCS, Draw, Descriptors
import pandas as pd



# df = pd.read_csv('bt-proteins2.csv')
df = pd.read_csv('./bt-with-chem.csv')

df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])
df['Low_Kd'] = (df['Kd'] < 1).astype(int)

# Function to calculate and print descriptors for each cluster
def print_cluster_descriptors(cluster_df):
    avg_length = cluster_df['length'].mean()
    print(f"Average sequence length: {avg_length:.2f}")
    
    # Aggregate amino acid compositions for the cluster
    aa_compositions = pd.DataFrame(list(cluster_df['aa_composition'])).mean()
    top_aa = aa_compositions.sort_values(ascending=False)
    print("Top 3 amino acids by composition:\n\n", top_aa)

# Function to plot correlation between amino acid composition and Kd values
def plot_aa_correlation(cluster_df, cluster_idx):
    aa_compositions = pd.DataFrame(list(cluster_df['aa_composition']))
    aa_compositions['Kd'] = cluster_df['Kd'].values
    
    correlations = aa_compositions.corr()['Kd'].drop('Kd')
    plt.figure(figsize=(10, 6))
    sns.barplot(x=correlations.index, y=correlations.values)
    plt.title(f"Correlation between Amino Acid Composition and Kd for Cluster {cluster_idx}")
    plt.xticks(rotation=45, ha='right')
    plt.ylabel('Pearson Correlation with Kd')
    plt.tight_layout()
    plt.savefig(f'cluster_{cluster_idx}_correlation.png')
    plt.close()



def find_functional_groups(smiles, smarts_patterns):
    molecule = Chem.MolFromSmiles(smiles)
    found_groups = {}
    for name, smarts in smarts_patterns.items():
        pattern = Chem.MolFromSmarts(smarts)
        if molecule.HasSubstructMatch(pattern):
            found_groups[name] = True
        else:
            found_groups[name] = False
    return found_groups

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
# Function to count functional groups in a SMILES string
def count_functional_groups(smiles, smarts_patterns):
    molecule = Chem.MolFromSmiles(smiles)
    group_counts = {}
    for group, smarts in smarts_patterns.items():
        pattern = Chem.MolFromSmarts(smarts)
        matches = molecule.GetSubstructMatches(pattern)
        group_counts[group] = len(matches)
    return group_counts

def ml_cluster_on_chem (df, cluster_id):
    df_cluster = df[df['cluster'] == cluster_id]

    X = df_cluster[[group + '_count' for group in smarts_patterns_filtered_all.keys()]]
    y = (df_cluster['Kd'] < 1).astype(int)  # Assuming Kd values < 1 are of interest

    # Splitting dataset for training and testing
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Machine learning model to identify important features
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train_scaled, y_train)
    y_pred = clf.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)
    print(f'Accuracy: {accuracy:.2f}')

    # Identifying important functional groups
    importances = clf.feature_importances_
    indices = importances.argsort()[::-1]  # Sort features by importance
    print("Chemistry Feature ranking: (", cluster_id,  ")")
    for i in range(X.shape[1]):
        print(f"{i + 1}. feature {X.columns[indices[i]]} ({importances[indices[i]]:.3f})")

    # Generating reports and plots for each cluster
    for cluster in range(n_clusters):
        cluster_df = df[df['cluster'] == cluster]
        print(f"\nCluster {cluster} Descriptor:")
        print_cluster_descriptors(cluster_df)
        
        plot_aa_correlation(cluster_df, cluster)
# Assuming `df` is your DataFrame with columns: ['protein_sequence', 'Kd']

def extract_features(sequence):
    """Extract sequence length and amino acid composition."""
    analysis = ProteinAnalysis(sequence)
    aa_composition = analysis.get_amino_acids_percent()
    return len(sequence), aa_composition

# Calculate features
df['length'], df['aa_composition'] = zip(*df['protein_sequence'].apply(extract_features))
features = df['aa_composition'].apply(pd.Series)
features['length'] = df['length']
# for group in smarts_patterns_filtered_all.keys():
#     df[group + '_count'] = df['SMILES'].apply(lambda x: count_functional_groups(x, smarts_patterns_filtered_all)[group])



# df.to_csv ( './bt-with-chem.csv')
# KMeans clustering
n_clusters = 5  # Adjust based on your data
kmeans = KMeans(n_clusters=n_clusters, random_state=42)
df['cluster'] = kmeans.fit_predict(features)

# Machine Learning Analysis per cluster
results = defaultdict(list)
for cluster in range(n_clusters):
    cluster_df = df[df['cluster'] == cluster]
    if cluster_df.empty:
        continue
    
    X = pd.DataFrame(list(cluster_df['aa_composition']))
    y = (cluster_df['Kd'] < 1).astype(int)
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    clf = RandomForestClassifier(n_estimators=1000, random_state=42)
    clf.fit(X_train_scaled, y_train)
    
    y_pred = clf.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)
    
    importances = clf.feature_importances_
    sorted_indices = importances.argsort()[::-1]
    
    # Store the top 5 important features for each cluster
    for idx in sorted_indices[:5]:
        results[cluster].append((X.columns[idx], importances[idx]))
    
    print(f"Cluster {cluster}, Accuracy: {accuracy:.2f}")
    for feature, importance in results[cluster]:
        print(f"  {feature}: {importance:.4f}")
        
    ml_cluster_on_chem ( df, cluster )
        # mean_kd = df[df['cluster'] == cluster]['Kd'].min()
        # print(f"Cluster {cluster} Mean Kd: {mean_kd:.2f}")
    # df['Functional_Groups'] = df['SMILES'].apply(lambda x: find_functional_groups(x, smarts_patterns_filtered_all))
        
        
# Optionally, save or further process `results` as needed
# Continued from the previous script...
def aaf(letter):
    """
    Takes a single amino acid letter (uppercase or lowercase) and returns the full name.
    
    Args:
    letter (str): A single-letter amino acid code.
    
    Returns:
    str: The full name of the amino acid.
    """
    amino_acids = {
        'A': 'Alanine',
        'R': 'Arginine',
        'N': 'Asparagine',
        'D': 'Aspartic Acid',
        'C': 'Cysteine',
        'E': 'Glutamic Acid',
        'Q': 'Glutamine',
        'G': 'Glycine',
        'H': 'Histidine',
        'I': 'Isoleucine',
        'L': 'Leucine',
        'K': 'Lysine',
        'M': 'Methionine',
        'F': 'Phenylalanine',
        'P': 'Proline',
        'S': 'Serine',
        'T': 'Threonine',
        'W': 'Tryptophan',
        'Y': 'Tyrosine',
        'V': 'Valine'
    }
    





    # feature_importances.to_csv('feature_importances_by_bin.csv')

    # # Plotting the feature importances
    # plt.figure(figsize=(12, 8))
    # for bin, importances in all_feature_importances.items():
    #     plt.plot(range(len(importances)), importances, label=f'Bin {bin}')
    # plt.title('Feature Importances by Molecular Weight Bin')
    # plt.xlabel('Features (Amino Acids)')
    # plt.ylabel('Importance')
    # plt.legend()
    # plt.savefig('feature_importances.png')
    # plt.show()
