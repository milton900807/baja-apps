import pysam
import pyBigWig
import sys

def bam_to_bigwig(bam_file, bigwig_file, genome_size_file):
    # Open the BAM file
    bam = pysam.AlignmentFile(bam_file, "rb")
    
    # Create a new BigWig file
    bw = pyBigWig.open(bigwig_file, "w")
    
    # Add header information (chromosome sizes)
    genome_sizes = [tuple(line.strip().split("\t")) for line in open(genome_size_file)]
    bw.addHeader(genome_sizes)
    
    # Initialize variables to keep track of chromosome and counts
    curr_chrom = None
    positions = []
    counts = []
    
    for read in bam:
        chrom = bam.get_reference_name(read.reference_id)
        
        if curr_chrom is None:
            curr_chrom = chrom
            
        # If the chromosome changes, write data to BigWig and reset tracking variables
        if chrom != curr_chrom:
            bw.addEntries(curr_chrom, positions, ends=positions, values=counts)
            curr_chrom = chrom
            positions = []
            counts = []
            
        # Track the positions and counts
        positions.append(read.pos)
        counts.append(1)  # for simplicity, just add a count of 1 for each read
    
    # Write the remaining data
    if positions:
        bw.addEntries(curr_chrom, positions, ends=positions, values=counts)
    
    # Close files
    bam.close()
    bw.close()

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python bam_to_bigwig.py <BAM file> <BigWig file> <genome size file>")
        sys.exit(1)
        
    bam_file = sys.argv[1]
    bigwig_file = sys.argv[2]
    genome_size_file = sys.argv[3]
    
    bam_to_bigwig(bam_file, bigwig_file, genome_size_file)
