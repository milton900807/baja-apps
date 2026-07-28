import requests





start = works.param(1)
stop = works.param(2)
chromosome = works.param(3)



def fetch_gnomad_snps(chromosome, start_position, end_position):
    snps = []
    for position in range(start_position, end_position + 1):
        # Construct the URL for the gnomAD API for each position
        # Assuming a variant type, here we use a common change for example (G to A)
        url = f"gnomad.broadinstitute.org/api/v1/variant/variant/{chromosome}-{position}-G-A"
        
        # Send a GET request to the gnomAD API
        response = requests.get(url)
        
        # Check if the request was successful
        if response.status_code == 200:
            # Parse the JSON response
            data = response.json()
            # Extract SNP data, assuming 'variant' key exists and contains the SNP data
            snp_data = data.get('variant', {})
            if snp_data:
                snps.append(snp_data)
        else:
            # Optionally handle errors or continue
            print(f"Error or no data at position {position}: Response code {response.status_code}")

    return snps

gvalue = fetch_gnomad_snps ( chromosome, start, stop )
works.resolve ( gvalue )



