import pandas as pd

# Load the Excel file
file_path = './ppsets2.xlsx'  # Update this to the path of your Excel file
df = pd.read_excel(file_path)



# Group the data by 'gene' and count unique 'id' for each gene
gene_id_counts = df.groupby('gene')['id'].nunique()

# Find the top 10 genes with the most unique IDs
top_10_genes = gene_id_counts.nlargest(10)

# Calculate the range of Ct values for each of the top 10 genes
ct_ranges = df[df['gene'].isin(top_10_genes.index)].groupby('gene')['ct'].agg([min, max])

# Merge the top 10 gene counts with their Ct ranges
top_10_genes_with_ct = top_10_genes.to_frame(name='unique_ids').join(ct_ranges)

# Print the results
print("Top 10 genes with the most unique IDs and their range of Ct values:")
print(top_10_genes_with_ct)

# Additionally, print the gene with the most unique IDs
gene_with_most_ids = top_10_genes.idxmax()
max_ids = top_10_genes.max()
print(f"\nThe gene with the most unique IDs is {gene_with_most_ids} with {max_ids} unique IDs.")


# Additionally, find the gene with the most unique IDs
gene_with_most_ids = top_10_genes.idxmax()
max_ids = top_10_genes.max()
print(f"\nThe gene with the most unique IDs is {gene_with_most_ids} with {max_ids} unique IDs.")

# Print all Ct values for the gene with the most unique IDs
all_ct_values = df[df['gene'] == gene_with_most_ids]['ct'].values
print(f"All Ct values for the gene {gene_with_most_ids}: {all_ct_values}")