import pysam
import sys

def filter_vcf_by_coordinates(vcf_file, chrom, start, end):
    # Open the VCF file
    vcf = pysam.VariantFile(vcf_file)

    # Print the VCF header (optional)
    #print(str(vcf.header))

    # Fetch variants in the given genome coordinate range
    for variant in vcf.fetch(chrom, start, end):
        print(f"Chromosome: {variant.chrom}, Position: {variant.pos}, "
              f"ID: {variant.id}, REF: {variant.ref}, ALT: {variant.alts}")

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python filter_vcf_by_coordinates.py <VCF file> <chromosome> <start_position> <end_position>")
        sys.exit(1)

    vcf_file = sys.argv[1]
    chrom = sys.argv[2]
    start = int(sys.argv[3])
    end = int(sys.argv[4])

    filter_vcf_by_coordinates(vcf_file, chrom, start, end)
