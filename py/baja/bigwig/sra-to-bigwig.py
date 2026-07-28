import os
import subprocess

def download_sra_file(sra_accession):
    """
    Download the SRA file using the SRA toolkit.

    Parameters:
        sra_accession (str): The SRA accession number.

    Returns:
        str: The name of the downloaded SRA file.
    """
    sra_file = sra_accession + ".sra"
    command = f"prefetch {sra_accession}"
    subprocess.run(command, shell=True)

    return sra_file

def convert_sra_to_bedgraph(sra_file):
    """
    Convert the SRA file to bedGraph format using the SRA toolkit.

    Parameters:
        sra_file (str): The name of the downloaded SRA file.

    Returns:
        str: The name of the generated bedGraph file.
    """
    command = f"fastq-dump --split-files {sra_file}"
    subprocess.run(command, shell=True)

    # After running fastq-dump, you will get two FASTQ files: *_1.fastq and *_2.fastq
    # Perform your analysis here and generate the bedGraph file.

    # For demonstration purposes, let's just generate a sample bedGraph file.
    bedgraph_file = sra_file.replace(".sra", ".bedGraph")
    with open(bedgraph_file, "w") as bg_file:
        bg_file.write("chr1\t100\t200\t0.5\n")  # Sample data, format: <chromosome> <start> <end> <value>

    return bedgraph_file

def convert_bedgraph_to_bigwig(bedgraph_file, genome_size, output_bigwig):
    """
    Convert the bedGraph file to bigWig format using bedGraphToBigWig from UCSC Genome Browser.

    Parameters:
        bedgraph_file (str): The name of the bedGraph file.
        genome_size (str): Path to a file containing the sizes of each chromosome in the genome.
        output_bigwig (str): The name of the output bigWig file.
    """
    command = f"bedGraphToBigWig {bedgraph_file} {genome_size} {output_bigwig}"
    subprocess.run(command, shell=True)

if __name__ == "__main__":
    sra_accession = "SRR24911860"
    genome_size_file = "./hg38.txt"  # File containing chromosome sizes in the genome
    output_bigwig_file = "output_file.bigwig"

    # Step 1: Download the SRA file
    # sra_file = download_sra_file(sra_accession)

    sra_file = 'SRR24911860/SRR24911860.sra'

    # Step 2: Convert SRA to bedGraph
    bedgraph_file = convert_sra_to_bedgraph(sra_file)

    # Step 3: Convert bedGraph to bigWig
    convert_bedgraph_to_bigwig(bedgraph_file, genome_size_file, output_bigwig_file)

    # Clean up intermediate files (optional)
    os.remove(sra_file)
    os.remove(bedgraph_file)

    print("Conversion complete. Output file:", output_bigwig_file)
