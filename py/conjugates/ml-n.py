import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score



df = pd.read_csv('bt-proteins2.csv')
# Assuming 'df' is your DataFrame and it already includes amino acid composition
# Convert 'Kd' to numeric, removing non-numeric rows as previously discussed
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df = df.dropna(subset=['Kd'])


def filter_invalid_peptides(df, sequence_column='protein_sequence'):
    """
    Remove rows from a DataFrame where the protein_sequence does not consist of valid peptide sequences.
    
    Parameters:
    - df: pandas.DataFrame containing the column with peptide sequences.
    - sequence_column: str, the name of the column containing peptide sequences.
    
    Returns:
    - pandas.DataFrame with only valid peptide sequences.
    """
    # Define a set of valid amino acid single-letter codes
    valid_amino_acids = {'A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I',
                         'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V'}
    
    # Filter the DataFrame based on whether each sequence contains only valid amino acids
    valid_sequences_mask = df[sequence_column].apply(lambda seq: set(seq).issubset(valid_amino_acids))
    
    return df[valid_sequences_mask]


# Nitrogen count calculation
def count_nitrogens(peptide):
    try: 
        nitrogen_counts = {
            'A': 1, 'R': 4, 'N': 2, 'D': 1, 'C': 1,
            'E': 1, 'Q': 2, 'G': 1, 'H': 3, 'I': 1,
            'L': 1, 'K': 2, 'M': 1, 'F': 1, 'P': 1,
            'S': 1, 'T': 1, 'W': 2, 'Y': 1, 'V': 1,
        }
    except Exception: 
        print ( " reduce it" )

    return sum(nitrogen_counts[aa] for aa in peptide)

valid_amino_acids = set('ARNDCEQGHILKMFPSTWYV')
def is_valid_sequence(sequence):
    valid_amino_acids = {'A', 'R', 'N', 'D', 'C', 'E', 'Q', 'G', 'H', 'I',
                         'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V'}
    return all(aa in valid_amino_acids for aa in sequence)

df = df[df['Kd'] <= 1]

print ( len(df ))
df = df[df['protein_sequence'].apply(is_valid_sequence)]
print ( len(df))
df ['nitrogen_count'] = df['protein_sequence'].apply(count_nitrogens)
print ( ' the number of nitrogens ', len(df))

X_train, X_test, y_train, y_test = train_test_split(df[['nitrogen_count']], df['Kd'], test_size=0.2, random_state=42)
model = LinearRegression()
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
mse = mean_squared_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

# Plotting
plt.figure(figsize=(10, 6))
plt.scatter(X_test, y_test, color='black', label='Actual Kd values')
plt.plot(X_test, y_pred, color='blue', linewidth=3, label='Predicted Kd values')
plt.xlabel('Nitrogen Count')
plt.ylabel('Kd Value')
plt.title(f'Peptide Nitrogen Count vs Kd Value (MSE: {mse:.2f}, R-squared: {r2:.2f})')
plt.legend()
plt.grid(True)

# Save the plot to a PNG file
plt.savefig('./protein-structure/nitrogen_vs_kd_plot.png')
plt.show()

