import mygene
import pandas as pd
import json
from ion import works 


gene_list_str = works.param (1)


def string_to_array(s):
    return [item.strip() for item in s.split(",")]


def fetch_gene_ontology(genes):
    mg = mygene.MyGeneInfo()
    
    # Query MyGene.info for GO terms
    fields = "go"
    results = mg.querymany(genes, scopes="symbol", fields=fields, species="human", as_dataframe=True)
    
    gene_ontology_data = []

    for gene in genes:
        if gene in results.index:
            go_terms = results.loc[gene, "go"]
            
            if isinstance(go_terms, dict):  # Ensure GO terms exist
                bp_terms = [term["term"] for term in go_terms.get("BP", [])] if "BP" in go_terms else []
                mf_terms = [term["term"] for term in go_terms.get("MF", [])] if "MF" in go_terms else []
                cc_terms = [term["term"] for term in go_terms.get("CC", [])] if "CC" in go_terms else []
                
                gene_ontology_data.append({
                    "Gene": gene,
                    "Biological_Process": bp_terms,
                    "Molecular_Function": mf_terms,
                    "Cellular_Component": cc_terms
                })
            else:
                gene_ontology_data.append({
                    "Gene": gene,
                    "Biological_Process": [],
                    "Molecular_Function": [],
                    "Cellular_Component": []
                })
        else:
            gene_ontology_data.append({
                "Gene": gene,
                "Biological_Process": [],
                "Molecular_Function": [],
                "Cellular_Component": []
            })

    # Convert results into a JSON object
    json_output = json.dumps(gene_ontology_data, indent=4)
    return json_output


try: 
    gene_list = string_to_array(gene_list_str)
    json_result = fetch_gene_ontology(gene_list)
    works.resolve(json_result)
except Exception as e:
    print(f"An error occurred: {e}")
    works.resolve("{e}")
