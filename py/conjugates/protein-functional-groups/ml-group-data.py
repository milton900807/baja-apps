# Number,Name,Unigene,Ligand ID, Ligand Name,SMILES,CAS,NSC,Hotligand,species,source,ki Note,
#Kd,Reference,Link,valid_smiles,basic_in_acidic_conditions,acidic_in_acidic_conditions,hydrophobic_in_acidic_conditions,
#hydrophilic_in_acidic_conditions,polar_groups,Molecular_Weight,Polarity,Hydrophobicity,ensembl_gene_id,canonical_transcript,
#canonical_transcript_sequence,orf_distances
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from ast import literal_eval
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from ast import literal_eval
import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import curve_fit
import matplotlib.pyplot as plt


# Load the dataset (repeating essential steps for clarity)
file_path = './modified_table_with_distances.csv'
df = pd.read_csv(file_path)

# Step 2: Filter rows based on "Unigene" occurrences
# We'll use the groupby and filter methods to achieve this
filtered_df = df.groupby('Unigene').filter(lambda x: len(x) > 2)

# Step 3: Select specific columns
# Ensure these column names match exactly what's in your CSV; adjust if necessary
columns_of_interest = ['Unigene', 'Kd', 'SMILES', 'orf_distances']
filtered_df = filtered_df[columns_of_interest]

# Step 4: Save the filtered DataFrame to a new CSV file
# Replace 'filtered_table.csv' with your desired output file name
filtered_df.to_csv('group-table-with-distance.csv', index=False)
