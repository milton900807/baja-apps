import pandas as pd
import requests
from io import StringIO

def download_ncbi_to_ensembl_map():
    # BioMart URL for fetching data
    url = 'http://www.ensembl.org/biomart/martservice?query='

    # XML query to fetch NCBI to Ensembl mapping
    query = """
    <!DOCTYPE Query>
    <Query virtualSchemaName="default" formatter="TSV" header="1" uniqueRows="1" count="" datasetConfigVersion="0.6" >
        
        <Dataset name="hsapiens_gene_ensembl" interface="default" >
            <Attribute name="refseq_mrna" />
            <Attribute name="ensembl_transcript_id" />
        </Dataset>
    </Query>
    """

    # Send request to BioMart
    response = requests.get(url + query)

    if response.status_code != 200:
        print(f"Failed to retrieve data: {response.status_code}")
        return None

    # Read the response content into a pandas DataFrame
    data = pd.read_csv(StringIO(response.text), sep='\t')

    # Rename columns for clarity
    data.columns = ['NCBI_ID', 'Ensembl_Transcript_ID']

    return data

# Example usage
ncbi_to_ensembl_map = download_ncbi_to_ensembl_map()
if ncbi_to_ensembl_map is not None:
    # Save to a CSV file
    ncbi_to_ensembl_map.to_csv('ncbi_to_ensembl_map.csv', index=False)
    print("Mapping file has been downloaded and saved as 'ncbi_to_ensembl_map.csv'")
else:
    print("Failed to download the mapping file.")
