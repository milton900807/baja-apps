import pandas as pd

# Step 1: Read the table
df = pd.read_csv('../bt-group.csv')

# Step 2 & 3: Group by 'Name' and sort within each group by 'Kd'
# Since the requirement involves sorting by low Kd and low standard deviation within groups,
# and the direct interpretation of sorting by standard deviation is unclear in this context,
# this step focuses on sorting by 'Kd'.
sorted_groups = df.groupby('Ligand ID', as_index=False).apply(lambda x: x.sort_values('Kd'))

# Reset index to avoid multi-index issues after groupby and apply
sorted_groups.reset_index(drop=True, inplace=True)

# Step 4: Save to a new CSV, keeping only specified columns
columns_to_keep = ['Name', 'Unigene', 'Ligand ID', 'SMILES', 
                   'species', 'source', 'ki Note', 'Kd', 'ensembl_gene_id']

sorted_groups[columns_to_keep].to_csv('./bt-group.csv', index=False)


