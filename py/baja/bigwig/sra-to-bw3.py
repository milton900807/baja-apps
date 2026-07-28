import os
import subprocess
import sys

def download_sra(sra_url, output_dir):
    """Download SRA file from the given URL using prefetch."""
    sra_id = sra_url.split('/')[-1]
    download_command = ['prefetch', sra_id, '--output-directory', output_dir]
    subprocess.run(download_command, check=True)
    return os.path.join(output_dir, sra_id + '.sra')

def sra_to_fastq(sra_file, output_dir):
    """Convert SRA to FASTQ using fastq-dump."""
    fastq_command = ['fastq-dump', '--split-files', '--outdir', output_dir, sra_file]
    subprocess.run(fastq_command, check=True)
    return [os.path.join(output_dir, sra_file.replace('.sra', '_1.fastq')),
            os.path.join(output_dir, sra_file.replace('.sra', '_2.fastq'))]

def align_reads(fastq_files, index_prefix, output_dir):
    """Align reads using HISAT2."""
    sam_file = os.path.join(output_dir, 'aligned.sam')
    hisat2_command = ['hisat2', '-x', index_prefix, '-1', fastq_files[0], '-2', fastq_files[1], '-S', sam_file]
    subprocess.run(hisat2_command, check=True)
    return sam_file

def sam_to_bam(sam_file):
    """Convert SAM to sorted BAM using Samtools."""
    bam_file = sam_file.replace('.sam', '.bam')
    sorted_bam_file = bam_file.replace('.bam', '.sorted.bam')
    samtools_view_command = ['samtools', 'view', '-bS', sam_file, '-o', bam_file]
    samtools_sort_command = ['samtools', 'sort', '-o', sorted_bam_file, bam_file]
    subprocess.run(samtools_view_command, check=True)
    subprocess.run(samtools_sort_command, check=True)
    os.remove(bam_file)  # Clean up intermediate BAM file
    return sorted_bam_file

def bam_to_bedgraph(sorted_bam_file, output_dir):
    """Convert BAM to BedGraph using bedtools."""
    bedgraph_file = os.path.join(output_dir, 'output.bedgraph')
    bedtools_command = ['bedtools', 'genomecov', '-bg', '-ibam', sorted_bam_file, '-g', sorted_bam_file.replace('.bam', '.genome'), '-trackline']
    with open(bedgraph_file, 'w') as bedgraph_output:
        subprocess.run(bedtools_command, stdout=bedgraph_output, check=True)
    return bedgraph_file

def bedgraph_to_bigwig(bedgraph_file, genome_file, output_dir):
    """Convert BedGraph to BigWig using bedGraphToBigWig."""
    bigwig_file = os.path.join(output_dir, 'output.bw')
    bedGraphToBigWig_command = ['bedGraphToBigWig', bedgraph_file, genome_file, bigwig_file]
    subprocess.run(bedGraphToBigWig_command, check=True)
    return bigwig_file

def main(sra_url, index_prefix, genome_file, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    # Download SRA file
    sra_file = download_sra(sra_url, output_dir)

    # Convert SRA to FASTQ
    fastq_files = sra_to_fastq(sra_file, output_dir)

    # Align reads to reference genome
    sam_file = align_reads(fastq_files, index_prefix, output_dir)

    # Convert SAM to sorted BAM
    sorted_bam_file = sam_to_bam(sam_file)

    # Convert BAM to BedGraph
    bedgraph_file = bam_to_bedgraph(sorted_bam_file, output_dir)

    # Convert BedGraph to BigWig
    bigwig_file = bedgraph_to_bigwig(bedgraph_file, genome_file, output_dir)

    print(f"BigWig file created: {bigwig_file}")

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python script.py <SRA_URL> <HISAT2_INDEX_PREFIX> <GENOME_FILE> <OUTPUT_DIR>")
        sys.exit(1)

    sra_url = sys.argv[1]
    index_prefix = sys.argv[2]
    genome_file = sys.argv[3]
    output_dir = sys.argv[4]

    main(sra_url, index_prefix, genome_file, output_dir)
