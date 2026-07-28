import os
import requests

# Define the base URL and output directory
base_url = "https://ftp.ensembl.org/pub/current_variation/vcf/homo_sapiens/"  # Replace with your actual base URL
output_dir = "downloaded_files/"

# Ensure the output directory exists
os.makedirs(output_dir, exist_ok=True)

chromosomes = ["chr" + str(i) for i in range(1, 23)] + ["chrX", "chrY"]

# Loop over chromosomes and download files
for chromosome_index in chromosomes:
    # Construct the URL for the current chromosome
    url = f"{base_url}homo_sapiens-{chromosome_index}.vcf.gz"
    	# homo_sapiens-chr1.vcf.gz
    # Define the local filename to save the downloaded file
    filename = f"homo_sapiens-{chromosome_index}.vcf.gz"
    local_path = os.path.join(output_dir, filename)

    # Make an HTTP request to download the file
    response = requests.get(url, stream=True)
    
    if response.status_code == 200:
        # Save the downloaded content to a local file
        with open(local_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
        
        print(f"Downloaded: {filename}")
    else:
        print(f"Failed to download: {filename}")

print("Download complete.")
