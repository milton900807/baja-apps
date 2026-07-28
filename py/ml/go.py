import pandas as pd
import mygene
from tqdm import tqdm

def get_gene_ontology(file_path, output_file):
    """
    Retrieves Gene Ontology (GO) IDs for gene IDs from a TPM dataset.
    
    :param file_path: Path to the TPM dataset containing gene IDs.
    :param output_file: Path to save the gene ontology results.
    """
    print("[INFO] Loading dataset...")
    df = pd.read_excel(file_path)
    
    if 'gene ID' not in df.columns:
        raise ValueError("Expected a 'gene_id' column with gene identifiers.")
    
    gene_ids = df['gene ID'].dropna().unique().tolist()
    print(f"[INFO] Found {len(gene_ids)} unique gene IDs to process.")
    
    mg = mygene.MyGeneInfo()
    go_annotations = []
    
    print("[INFO] Fetching Gene Ontology IDs...")
    for gene_id in tqdm(gene_ids, desc="Processing Genes"):
        result = mg.query(gene_id, fields="go")
        
        if "hits" in result and result["hits"]:
            for hit in result["hits"]:
                if "go" in hit:
                    go_info = hit["go"]
                    if isinstance(go_info, dict):
                        for category, terms in go_info.items():
                            if isinstance(terms, list):
                                for term in terms:
                                    go_annotations.append([gene_id, category, term["id"], term["term"]])
    
    go_df = pd.DataFrame(go_annotations, columns=["Gene ID", "Category", "GO ID", "GO Term"])
    print("[INFO] Saving results...")
    go_df.to_csv(output_file, index=False)
    print("[INFO] Process completed. Results saved in:", output_file)

# Example usage
file_path = "../../tpm.xlsx"
output_file = "gene_ontology_results.csv"
get_gene_ontology(file_path, output_file)
