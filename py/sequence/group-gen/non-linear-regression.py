from sklearn.metrics import r2_score
import re
from typing import List
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import make_pipeline
import random
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import pandas as pd
from scipy.stats import pearsonr
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Crippen
import pandas as pd
from sklearn.datasets import make_classification

from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen, GraphDescriptors, rdMolDescriptors
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import json
from itertools import cycle
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.linear_model import LinearRegression
from rdkit.Chem import AllChem
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
from sklearn.model_selection import train_test_split
import re
import os 
import sys
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras import layers, models
import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
from sklearn.preprocessing import MinMaxScaler
import tensorflow as tf
from tensorflow.keras import layers, models

from tensorflow.keras.layers import Input, Dense, Concatenate
from tensorflow.keras.models import Model

# Assuming TokenAndPositionEmbedding and TransformerBlock are defined as in the previous example
from tensorflow.keras import layers, models
import numpy as np
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors
import tensorflow as tf
from peptide_features import peptide_features_all
from chem_features import  chem_features_all
import sys
sys.path.append('.')
import importlib.util

# Specify the path to your module
# module_path = './peptide_features.py'

# # Load the module
# spec = importlib.util.spec_from_file_location("peptide_features", module_path)
# peptide_features = importlib.util.module_from_spec(spec)
# sys.modules["peptide_features"] = peptide_features
# spec.loader.exec_module(peptide_features)
# Function to use the dictionary for feature calculation
def calculate_peptide_features(sequence, df):
    features = []
    for feature_name, calculator in peptide_features_all.items():
        val = calculator ( sequence )
        features.append(val)
        df.loc[df['protein_sequence'] == sequence, feature_name] = val

    return features




maxlen = 200

def calculate_features(smiles, smarts_patterns):
    mol = Chem.MolFromSmiles(smiles)
    features = [Descriptors.MolLogP(mol)]
    for name, pattern in smarts_patterns.items():
        smarts = Chem.MolFromSmarts(pattern)
        val = len(mol.GetSubstructMatches(smarts))
        features.append(val)
    return features
def calculate_smiles_feature(smiles, smart):
    mol = Chem.MolFromSmiles(smiles)
    smarts = Chem.MolFromSmarts(smart)
    val = len(mol.GetSubstructMatches(smarts))
    return val

# Convert peptide sequences to feature vectors
def encode_protein_sequence(sequence):
    # print ( sequence )
    return [amino_acid_mapping.get(aminoacid, 0) for aminoacid in sequence]


def check_file_exists(name, index, directory="."):
    file_path = os.path.join(directory, f'model{name}{index}.png')
    return os.path.exists(file_path)
def is_dna_string(s):
    try:
        valid_nucleotides = {'A', 'C', 'G', 'T'}
        return ( all(char in valid_nucleotides for char in s.upper()) )
    except:
        return False
def is_peptide_string(s):
    try:
        valid = {'A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V'}
        # valid_nucleotides = amino_acid_mapping.keys()
        return ( all(char in valid for char in s.upper()) )
    except:
        return False

def one_hot_encode_dna(sequence):
    
    # Mapping of nucleotides to vectors
    mapping = {'A': [1, 0, 0, 0], 'C': [0, 1, 0, 0], 'G': [0, 0, 1, 0], 'T': [0, 0, 0, 1]}
    
    # Initialize an empty list to store the encoded sequence
    encoded_sequence = []
    
    # Iterate through each nucleotide in the sequence and encode it
    for nucleotide in sequence.upper():
        if nucleotide in mapping:
            encoded_sequence.append(mapping[nucleotide])
        else:
            # Handle unknown nucleotides (e.g., N) by a neutral vector, if needed
            encoded_sequence.append([0, 0, 0, 0]) # Optional: choose how to handle unknowns
    
    # Convert the list of vectors into a numpy array
    return np.array(encoded_sequence)
def process_string(input_string):
    # Remove non-digit characters and concatenate to no more than 4 characters
    digits = ''.join([char for char in input_string if char.isdigit()])
    return digits[:4]

# Convert SMILES to molecular fingerprints
def smiles_to_fp(smiles, fp_size=2048):
    mol = Chem.MolFromSmiles(smiles)
    return np.array(AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=fp_size))

# Function to convert SMILES to binary vector based on SMARTS patterns
def smiles_to_feature_vector(smiles, smarts_patterns):
    mol = Chem.MolFromSmiles(smiles)
    feature_vector = []
    for pattern in smarts_patterns.values():
        smarts = Chem.MolFromSmarts(pattern)
        feature_vector.append(int(mol.HasSubstructMatch(smarts)))
    return np.array(feature_vector) 



def add_chem_features(df, smarts_patterns_filtered_all): 
    """Add chemical features to the DataFrame based on SMARTS patterns."""
    for feature_name, calculator in smarts_patterns_filtered_all.items():
        df[feature_name] = df['SMILES'].apply(calculator)
    return df
def add_smarts_features(df, smarts_patterns_filtered_all): 
    """Add chemical features to the DataFrame based on SMARTS patterns."""
    for feature_name, smarts in smarts_patterns_filtered_all.items():
        df[feature_name] = df['SMILES'].apply(lambda x: calculate_smiles_feature(x, smarts))
    return df
    
def add_peptide_features(df, peptide_features_all):
    """Adds columns to the DataFrame for each peptide feature."""
    for feature_name, calculator in peptide_features_all.items():
        df[feature_name] = df['protein_sequence'].apply(calculator)
    return df



df = pd.read_csv('./../../data/proteins_seq-bt.csv')
df['SMILES'] = df['SMILES'].str.upper()
df['SMILES'] = df['SMILES'].str.replace(r'CL', 'Cl', regex=True)
df['SMILES'] = df['SMILES'].str.replace(r'BR', 'Br', regex=True)
df['SMILES'] = df['SMILES'].str.replace(r'LI', 'Li', regex=True)
df['SMILES'] = df['SMILES'].str.replace(r'SI', 'Si', regex=True)
df['SMILES'] = df['SMILES'].str.replace(r'NA', 'Na', regex=True)
df  = df[df['protein_sequence'].apply(is_peptide_string)]
def is_valid_smiles(smiles):
    mol = Chem.MolFromSmiles(smiles)
    return mol is not None  
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
print ( ' Kd Max and Min' )
print ( df['Kd'].max ())
print ( df['Kd'].min ())
df.dropna(subset=['Kd'], inplace=True)
df['valid_smiles'] = df['SMILES'].apply(is_valid_smiles)
data_valid_smiles = df[df['valid_smiles']]
df = data_valid_smiles.drop(columns=['valid_smiles'])
amino_acid_mapping = {
    'A': 1, 'R': 2, 'N': 3, 'D': 4, 'C': 5, 'Q': 6, 'E': 7, 'G': 8, 'H': 9, 'I': 10,
    'L': 11, 'K': 12, 'M': 13, 'F': 14, 'P': 15, 'S': 16, 'T': 17, 'W': 18, 'Y': 19, 'V': 20,
    'X': 0,  # Unknown amino acids or padding
    '-': 0   # Padding symbol if needed
    
}
low_kd = 0.1
df['Low_Kd'] = (df['Kd'] < low_kd).astype(int)


print (f'Count of Kd < {low_kd}',  len(df[df['Kd'] < low_kd]))
# sys.exit()
name = 'main_model'
index = 0
if not name:
    name = (g['Name'].iloc[0])    
print ( name )
index+=1
name = re.sub(r'[\W\s]', '_', name)
df = add_chem_features(df, chem_features_all)
df = add_peptide_features(df, peptide_features_all)

features =  list(chem_features_all.keys()) +  list(peptide_features_all.keys()) 
X_pep = (peptide_features_all.keys())
X_smiles = (chem_features_all.keys())

X_combined = list(X_smiles) +  list(X_pep)
X = df[X_combined]
y = df['Kd']

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
rf = RandomForestRegressor(n_estimators=100, random_state=42)

if isinstance(X_train, pd.DataFrame):
    for col in X_train.columns:
        if any(isinstance(x, list) for x in X_train[col]):
            print(f"Column '{col}' contains lists.")


rf.fit(X_train, y_train)
y_pred = rf.predict(X_test)
mse = mean_squared_error(y_test, y_pred)
print(f"Mean Squared Error: {mse}")
feature_importances = rf.feature_importances_
important_features = sorted(zip(feature_importances, features), reverse=True)
y_pred_test = rf.predict(X_test)
y_pred_train = rf.predict(X_train)
mse_test = mean_squared_error(y_test, y_pred_test)
mse_train = mean_squared_error(y_train, y_pred_train)
r2_test = r2_score(y_test, y_pred_test)
r2_train = r2_score(y_train, y_pred_train)
print ( ' -------------------------------------------- ')
print(f"Training MSE: {mse_train} Test MSE: {mse_test}")
print(f"Training R-squared: {r2_train} Test R-squared: {r2_test}")
print ( ' -------------------------------------------- ')
print ( ' -------------------------------------------- ')
# Initialize lists to store results
feature_names = []
r_squared_values = []

print("Top important features:")
for importance, name in important_features:
    print(f"{name}: {importance}")
    X_feature = X[[name]]  # Double brackets keep it as a DataFrame
    X_train_feature, X_test_feature, y_train, y_test = train_test_split(X_feature, y, test_size=0.2, random_state=42)
    # print(f"Original y range: {y.min()} to {y.max()}")
    # print(f"y_train range: {y_train.min()} to {y_train.max()}")
    # print(f"y_test range: {y_test.min()} to {y_test.max()}")

    # Fit a linear regression model for the feature vs Kd
    model = LinearRegression()
    model.fit(X_train_feature, y_train)
    y_pred = model.predict(X_test_feature)
    r_squared = r2_score(y_test, y_pred)
    
    feature_names.append(name)
    r_squared_values.append(r_squared)

output_dir = 'output'
results_file_path = os.path.join(output_dir, f"model_{name}.txt")
with open(results_file_path, "w") as file:
    for importance, name in important_features:
        file.write (f"{name}: {importance} \n")
 


    if r_squared > 0.6:
        plt.figure(figsize=(8, 6))
        plt.scatter(X_test_feature, y_test, color='blue', label='Actual values', alpha=0.5)
        plt.plot(X_test_feature, y_pred, color='red', label=f'Linear fit (R^2={r_squared:.2f})')
        plt.xlabel(name)
        plt.ylabel('Target variable')
        plt.title(f'Scatter Plot with Linear Fit for {name}')
        plt.legend()
        plt.savefig ( f'./output/{name}_.png')    
        
import numpy as np
import matplotlib.pyplot as plt

def plot_with_polynomial_and_scatter(top_feature_names, importances, actual_x, actual_y):
    """
    Plots a polynomial function derived from feature importances and overlays
    a scatter plot of actual vs. predicted values.
    
    Args:
    importances (list): Coefficients for the polynomial, typically feature importances.
    actual_x (array-like): Actual values (e.g., y_test).
    actual_y (array-like): Predicted values (e.g., y_pred_test).
    """
    # Polynomial Plot
    # Generate x values for the polynomial plot
    x_poly = np.linspace(0, 10, 400)
    # Calculate y values based on the "coefficients" (importances)
    y_poly = np.polyval(importances, x_poly)
    
    # Actual vs. Predicted Scatter Plot
    plt.figure(figsize=(10, 7))
    plt.scatter(actual_x, actual_y, color='blue', label='Actual vs. Predicted', alpha=0.5, zorder=5)
    
    # Overlaying the Polynomial Representation
    plt.plot(x_poly, y_poly, color='red', linestyle='--', linewidth=2, label='Polynomial of Importances', zorder=10)
    
    # Adding a line for perfect predictions for reference
    plt.plot([actual_x.min(), actual_x.max()], [actual_x.min(), actual_x.max()], 'k--', lw=2, label='Perfect Predictions', zorder=1)
    
    plt.xlabel('Actual Kd')
    plt.ylabel('Predicted Kd / Polynomial Value')
    plt.title('Actual vs. Predicted Kd with Polynomial Representation of Feature Importances')
    plt.legend()
    plt.grid(True)
    plt.savefig(f'output/{top_feature_names[0]}.png')

 

def findC ( _f, _constant, df, degree, N=50, output_dir='output', file_='ft' ):
    if N > len(_f):
        N = len(_f)
    interaction_df = pd.DataFrame(index=df.index)
    for feature_a in _f:
        for feature_b in _constant:
            interaction_df[f'{feature_a}_x_{feature_b}'] = df[feature_a] * df[feature_b]
    y = df['Low_Kd']  # Target variable
    combined_df = pd.concat([interaction_df], axis=1)
    poly = PolynomialFeatures(degree=degree, interaction_only=True, include_bias=False)
    X_poly = poly.fit_transform(combined_df)
    feature_names = poly.get_feature_names_out(combined_df.columns)
    X_train, X_test, y_train, y_test = train_test_split(X_poly, y, test_size=0.2, random_state=42)
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f'Accuracy: {accuracy:.4f} \t{len(X_train)}X{len(y_train)}')
    feature_importances = clf.feature_importances_
    indices = np.argsort(feature_importances)[-N:]
    # print ( feature_importances )
    results_file_path = os.path.join(output_dir, f"model_results{i}.txt")
    N = len(feature_importances) # Adjust based on how many top features you want to list
    indices = np.argsort(clf.feature_importances_)[-N:]
    top_feature_names = np.array(feature_names)[indices]
    top_feature_importances = clf.feature_importances_[indices]
    r_squared = r2_score(y_test, y_pred)
    print(f'R-squared: {r_squared:.4f}')
    # r_squared_direct = clf.score(X_test, y_test)
    # print(f'R-squared (Direct): {r_squared_direct:.4f}')
    prr = False    
    if accuracy > 0.96:
        prr = True

    # for name, importance in zip(top_feature_names, top_feature_importances):
    #     if importance > 1:
    #         prr = True
    #         break
    #     elif importance < 0.9:
    #         prr = False
    #     else: 
    #         prr = True
    #         break
    if prr:
        filtered_features = [(name, importance) for name, importance in zip(top_feature_names, top_feature_importances) if importance >= 0.09]
# Check if the filtered list is empty
        if filtered_features:
            # If not empty, unzip the names and importances
            top_feature_names, top_feature_importances = zip(*filtered_features)
            if len(top_feature_importances)>1:
                plot_with_polynomial_and_scatter (top_feature_names, top_feature_importances, y_test, y_pred_test )
            with open(results_file_path, "w") as file:
                file.write(f"Order: {degree}\n")
                file.write(f"Model Accuracy: {accuracy:.4f}\n")
                file.write("Top Features Based on Importances:\n")
                for name, importance in zip(top_feature_names, top_feature_importances):
                    file.write(f"{name}: {importance:.4f}\n")

            print(f"Results written to {results_file_path}")
            agg_df = df.groupby(['protein_sequence', 'SMILES']).agg(
                mean_Kd=('Kd', 'mean'),
                std_Kd=('Kd', 'std')
            ).reset_index()
            agg_df['label'] = agg_df.index
            fig, axs = plt.subplots(2, 1, figsize=(12, 10))
            axs[0].errorbar(agg_df['label'], agg_df['mean_Kd'], yerr=agg_df['std_Kd'], fmt='o', ecolor='r', capsize=5, linestyle='None', markersize=5, label='Mean Kd with Std Dev')
            axs[0].set_xlabel('Protein_Sequence + SMILES Index')
            axs[0].set_ylabel('Kd (mean with std dev)')
            axs[0].set_title('Mean Kd Values by Protein_Sequence and SMILES with Standard Deviation')
            axs[0].legend()
            axs[1].barh(top_feature_names, top_feature_importances, color='skyblue')
            axs[1].set_xlabel('Feature Importance')
            axs[1].set_title('Top Polynomial Features by Importance')
            plt.tight_layout()
            file_path = os.path.join(output_dir, f"kd_vs_protein_smiles{i}.png")
            #plt.savefig(file_path)
            plt.close()
            
            return top_feature_names, top_feature_importances


import os
output_dir = "output"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

k = []
t = []
for i in range(10000):
    random_number = random.randint(1, 19) 
    l = list(peptide_features_all.keys()) + list(chem_features_all.keys())
    ml = random.sample(l, 4)
    
    for v, name in important_features[:9]:
        k.append ( name )
    mll = random.sample(k, 4)
    print ( ml )
    print ( mll )
    print ( 'Order ', random_number)

    values = findC (ml,  mll, df, random_number, 1000, output_dir, 'tfr')
    if values:
        top_features_names, top_features_importances  =  values
        print ( ' ------------------------------------------------------------- ')
        print ( top_features_names, top_features_importances )
        print ( ' ------------------------------------------------------------- ')
        t.append ( top_features_importances )
        print ( t ) 
