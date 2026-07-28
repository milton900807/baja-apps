import requests

def fetch_chromosome_sizes(genome_version):
    url = f"hgdownload.cse.ucsc.edu/goldenPath/{genome_version}/bigZips/{genome_version}.chrom.sizes"
    response = requests.get(url)
    chromosome_sizes = {}
    for line in response.text.strip().split('\n'):
        chrom, size = line.split('\t')
        chromosome_sizes[chrom] = int(size)
    return chromosome_sizes

def main():
    genome_version = "hg38"  # GRCh38
    chromosome_sizes = fetch_chromosome_sizes(genome_version)
    
    for chrom, size in chromosome_sizes.items():
        print(f"{chrom}\t{size}")

if __name__ == "__main__":
    main()
