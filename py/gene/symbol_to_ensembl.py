import requests
import json
from ion import works




gene_symbol = works.param(1)
species = works.param(2)
if not species:
    species = 'human' 

def lookup_gene_symbol(species, symbol):
    # Ensembl REST API URL for the lookup endpoint
    url = f"http://rest.ensembl.org/lookup/symbol/{species}"

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    # Perform the POST request
    response = requests.post(url, headers=headers, data='{"symbols": ["' + symbol + '"] }')

    # Check if the request was successful
    if response.status_code == 200:
        return response.json()  # Return the parsed JSON response
    else:
        return f"Error: Received status code {response.status_code}"

# Example usage
if not species:
    species = "homo_sapiens"  # Example species
result = lookup_gene_symbol(species, gene_symbol)

works.resolve ( result )

