import pandas as pd
import numpy as np
from Bio.SeqUtils.ProtParam import ProteinAnalysis
from sklearn.metrics import r2_score
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression

def get_isoelectric_point(sequence):
    try:
        analysis = ProteinAnalysis(sequence)
        return analysis.isoelectric_point()
    except Exception as e:
        print(f"Error processing sequence: {e}")
        return np.nan

def preprocess_data_dep(df):
    """Add a column for the isoelectric points of the sequences."""
    df['isoelectric_point'] = df['protein_sequence'].apply(get_isoelectric_point)
    return df.dropna(subset=['isoelectric_point'])



def preprocess_data(df):
    """Filter for Kd < 4 and add a column for the isoelectric points of the sequences."""
    df_filtered = df[df['Kd'] < 4]
    df_filtered['isoelectric_point'] = df_filtered['protein_sequence'].apply(get_isoelectric_point)
    return df_filtered.dropna(subset=['isoelectric_point'])

# Assuming df is your DataFrame with 'protein_sequence' and 'Kd' columns
# df = pd.read_csv('your_dataset.csv')  # Load your dataset here

# Preprocess the data to include isoelectric points, focusing on Kd values less than 4


df = pd.read_csv('./bt-proteins2.csv')  # Make sure you have your actual dataset path here
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df.dropna(subset=['Kd'], inplace=True)
df_processed = preprocess_data(df)

# Plotting
plt.figure(figsize=(10, 6))
plt.scatter(df_processed['isoelectric_point'], df_processed['Kd'], alpha=0.5)
plt.title('Isoelectric Point vs Kd')
plt.xlabel('Isoelectric Point')
plt.ylabel('Kd')
plt.grid(True)

# Linear regression and R^2 calculation
X = df_processed['isoelectric_point'].values.reshape(-1, 1)
y = df_processed['Kd'].values.reshape(-1, 1)
reg = LinearRegression().fit(X, y)
y_pred = reg.predict(X)
r_squared = r2_score(y, y_pred)

plt.plot(df_processed['isoelectric_point'], y_pred, color='red', linewidth=2)
plt.text(max(X), max(y), f'R^2 = {r_squared:.2f}', fontsize=12, verticalalignment='top')

plt.savefig('isoelectric_point_vs_Kd.png')
plt.show()

print(f'R^2 value: {r_squared:.2f}')

