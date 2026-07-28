import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt
import os
from rdkit import Chem
from rdkit.Chem import Descriptors
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_squared_error


from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import make_pipeline
import random

# Load your dataset
data_path = './bt-proteins2.csv'  # Make sure this points to your CSV file
df = pd.read_csv(data_path)
#df2 = pd.read_csv('./bt-proteins.csv')

# Concatenate the DataFrames into one
#df = pd.concat([df1, df2], ignore_index=True)

def print_column_mean(df, column_name):
    """
    Prints the mean of a specified column in a pandas DataFrame.

    Parameters:
    - df: pandas.DataFrame. The DataFrame containing the data.
    - column_name: str. The name of the column for which to calculate the mean.

    Returns:
    None
    """
    if column_name in df.columns:
        mean_value = df[column_name].mean()
        print(f"The mean of '{column_name}' is: {mean_value}")
    else:
        print(f"The column '{column_name}' does not exist in the DataFrame.")





# Defining chemistry and biology columns as before
chemistry_columns = [
    'hydroxyl', 'carboxyl', 'amino', 'aldehyde', 'ketone', 'ester', 'amide', 'ether', 'nitrile', 'sulfone',
    'sulfoxide', 'thiol', 'halide', 'phenyl', 'benzyl', 'alkene', 'alkyne', 'aromatic_nitrogen', 'hydrazone',
    'imine', 'alkyl_halide', 'aromatic', 'alcohol', 'epoxide', 'alkane', 'logP'
]

biology_columns_dep = [
    'count_zinc_fingers', 'count_helix_loop_helix', 'count_SH3_domains', 'count_leucine_zipper',
    'count_serine_threonine_kinase_domains', 'count_PH_domains', 'count_WW_domains', 'count_EF_hand_domains',
    'find_cam_binding_domains', 'Alanine', 'Arginine', 'Asparagine', 'Aspartic acid', 'Cysteine', 'Glutamic acid',
    'Glutamine', 'Glycine', 'Histidine', 'Isoleucine', 'Leucine', 'Lysine', 'Methionine', 'Phenylalanine', 'Proline',
    'Serine', 'Threonine', 'Tryptophan', 'Tyrosine', 'Valine'
]

biology_columns = [
        'Kd', 'normalized_amine_groups'
]

def is_valid_smiles(smiles):
    mol = Chem.MolFromSmiles(smiles)
    return mol is not None  # Returns True if mol creation was successful, False otherwise


df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df.dropna(subset=['Kd'], inplace=True)
df['valid_smiles'] = df['SMILES'].apply(is_valid_smiles)
df = df[df['valid_smiles']]
df = df.drop(columns=['valid_smiles'])
df ['Low_Kd'] = (df ['Kd'] < 1).astype(int)
df ['Kd_category'] = (df ['Kd'] < 5).astype(int) - (df ['Kd'] > 10).astype(int)
df =df [df ['Kd_category'] != 0]
# Calculate the count of nucleophilic amine groups (K, R, and N-terminus) and chain length
df['amine_group_count'] = df['protein_sequence'].apply(lambda x: x.count('K') + x.count('R') + 1)  # +1 for N-terminus
df['chain_length'] = df['protein_sequence'].apply(len)
df['normalized_amine_groups'] = df['amine_group_count'] / df['chain_length']
    

print_column_mean(df, 'Kd')
print_column_mean(df, 'Low_Kd')
Q1 = df['Kd'].quantile(0.25)
Q3 = df['Kd'].quantile(0.75)
IQR = Q3 - Q1

# Define bounds for outliers
lower_bound = Q1 - 1.5 * IQR
upper_bound = Q3 + 1.5 * IQR
df['protein_length'] = df['protein_sequence'].apply(len)
outliers = df[(df['Kd'] < lower_bound) | (df['Kd'] > upper_bound)]
outlier_combinations = outliers[['SMILES', 'protein_sequence']].drop_duplicates()
clean_df = pd.merge(df, outlier_combinations, on=['SMILES', 'protein_sequence'], how='outer', indicator=True).query('_merge=="left_only"').drop(columns=['_merge'])
df = clean_df



# Define your cluster labels here (example labels)
cluster_labels = {
}
index = 0
for bio in biology_columns:
    cluster_labels[index] = bio


# Cluster samples based on biology features
biology_data = df[biology_columns]
kmeans = KMeans(n_clusters=len(biology_columns), random_state=42)  # Adjust n_clusters based on your data and needs
clusters = kmeans.fit_predict(biology_data)

# Make sure you have a directory to save the plots
plots_dir = 'cluster_plots'
if not os.path.exists(plots_dir):
    os.makedirs(plots_dir)

# Path for the report file
report_file_path = 'cluster_report.txt'

# Add the cluster assignments to your DataFrame
df['cluster'] = clusters

print_column_mean ( df, 'Kd' )



# Open the report file to write
with open(report_file_path, 'w') as report_file:

    for cluster in sorted(df['cluster'].unique()):
        cluster_label = cluster_labels.get(cluster, f"Cluster {cluster}")  # Default to cluster number if no label
        cluster_data = df[df['cluster'] == cluster]

        y = cluster_data['Kd']
        X = df[chemistry_columns]#,cluster_data[biology_columns], axis=1)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        model = make_pipeline(PolynomialFeatures(degree=2, include_bias=False), LinearRegression()) 
        #model = RandomForestRegressor(n_estimators=1000, random_state=42)
        model.fit(X_train, y_train)
        
        predictions = model.predict(X_test)
        mse = mean_squared_error(y_test, predictions)
        report_file.write(f"Cluster {cluster} - Mean Squared Error: {mse}\n")
        linear_model =model.named_steps['linearregression']  # Use the actual step name
        coefficients = linear_model.coef_
        #feature_importances = pd.Series(coefficients, index=X.columns)
        feature_importances =linear_model.feature_importances_
        plt.figure(figsize=(10,6))
        feature_importances.sort_values().plot(kind='barh')
        plt.title(f'Feature Importances for Cluster {cluster} {cluster_label}')
        plot_path = os.path.join(plots_dir, f'cluster_{cluster_label}_feature_importance.png')
        plt.savefig(plot_path)
        plt.close()

        # Mention in the report that the plot has been saved
        report_file.write(f"Feature importance plot saved as: {plot_path}\n\n")

print(f"Cluster report written to {report_file_path}")

