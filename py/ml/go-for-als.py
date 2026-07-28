import pandas as pd
from gprofiler import GProfiler
import os
import pickle

# Load the Excel file
input_file = "/mnt/c/Users/JeffMilton/Documents/als-genes1.xlsx"
output_file = "gene_data_with_GO.xlsx"
cached_file = "go_terms_cache.pkl"

# Read the Excel file
df = pd.read_excel(input_file)

# Initialize gProfiler
gp = GProfiler(return_dataframe=True)

# Load cache if it exists
if os.path.exists(cached_file):
    with open(cached_file, "rb") as f:
        go_cache = pickle.load(f)
else:
    go_cache = {}

# Function to get GO terms for a gene
def get_go_terms(gene_name):
    if gene_name in go_cache:
        return go_cache[gene_name]
    try:
        results = gp.profile(organism="hsapiens", query=[gene_name])
        if results.empty:
            go_terms, descriptions, categories = "NA", "NA", "NA"
        else:
            go_terms = "; ".join(results["native"].tolist())
            descriptions = "; ".join(results["name"].tolist())
            categories = "; ".join(results["source"].tolist())
        go_cache[gene_name] = (go_terms, descriptions, categories)
        return go_cache[gene_name]
    except Exception as e:
        print(f"Error fetching GO terms for {gene_name}: {e}")
        return "NA", "NA", "NA"

# Apply function to get GO terms with progress tracking
go_data = []
for idx, gene in enumerate(df["gene_name"]):
    go_data.append(get_go_terms(gene))
    if (idx + 1) % 10 == 0:
        print(f"Processed {idx + 1} genes...")

# Convert list to DataFrame
go_df = pd.DataFrame(go_data, columns=["GO_Terms", "GO_Descriptions", "GO_Categories"])
df = pd.concat([df, go_df], axis=1)

# Save the updated dataframe to a new Excel file
df.to_excel(output_file, index=False)

# Save the cache
with open(cached_file, "wb") as f:
    pickle.dump(go_cache, f)

print(f"File saved as {output_file}")
