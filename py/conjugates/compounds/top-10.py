import pandas as pd

# Step 1: Read the table
df = pd.read_csv('./bt-group.csv')

# Ensure 'Kd' is numeric for calculations
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')

# make sure we have replicates per gene 
filtered_groups = df.groupby(['Unigene', 'SMILES']).filter(lambda x: len(x) > 0)
aggregated_data = filtered_groups.groupby(['Unigene', 'ensembl_gene_id'])['Kd'].agg(['median', 'std', 'size']).reset_index()
aggregated_data_sorted = aggregated_data.sort_values(by=['std','median'], ascending=[True, True])

# top_10_genes = stats.sort_values(by=['median', 'std'], ascending=[True, True]).head(10)

columns_to_include = ['Name', 'Unigene', 'Ligand ID',  'SMILES', 
                      'species', 'source', 'ki Note', 'Kd', 'ensembl_gene_id']

# Step 4: Save the top 10 gene groups to a new CSV file
aggregated_data_sorted.to_csv('./top10.csv', index=False)

import matplotlib.pyplot as plt

# Define a directory where you want to save the plots
output_directory = './top-10/'

# Ensure the output directory exists
import os
if not os.path.exists(output_directory):
    os.makedirs(output_directory)

plt.figure(figsize=(10, 6))

# Plot Kd vs Ligand ID for each Unigene in the top 10 and save to PNG
for unigene in aggregated_data_sorted:
    # Filter data for the current Unigene
    unigene_data = aggregated_data_sorted[aggregated_data_sorted['Unigene'] == unigene]
    print ( unigene_data )
    # Create the plot
    plt.scatter(unigene_data['Unigene'], unigene_data['median'], alpha=0.6, edgecolors='w', linewidth=0.5)
plt.title(f'Kd vs Ligand ID for Unigene {unigene}')
plt.xlabel('Ligand ID')
plt.ylabel('Kd')
plt.xticks(rotation=45)  # Rotate labels to avoid overlap
plt.tight_layout()  # Adjust layout to make room for the rotated x-axis labels
plot_filename = f'top10_.png'
plt.savefig(os.path.join(output_directory, plot_filename))
plt.close()  # Close the plot to free memory

print("Plots have been saved to PNG files.")
