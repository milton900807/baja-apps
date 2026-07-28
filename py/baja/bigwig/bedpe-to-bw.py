import pyBigWig
import argparse

def bedpe_to_bedgraph(bedpe_file, genome_size_file):
    bedgraph_data = {}
    
    with open(bedpe_file, 'r') as f:
        for line in f:
            if line.startswith("#"):
                continue
            fields = line.strip().split("\t")
            chrom1, start1, end1, chrom2, start2, end2, score = fields[:7]
            score = float(score)
            
            # Assuming BEDPE is 0-based half-open format
            start1 = int(start1)
            end1 = int(end1)
            start2 = int(start2)
            end2 = int(end2)
            
            if chrom1 not in bedgraph_data:
                bedgraph_data[chrom1] = []
            if chrom2 not in bedgraph_data:
                bedgraph_data[chrom2] = []
            
            # Convert BEDPE to BEDGraph format
            bedgraph_data[chrom1].append((start1, end1, score))
            bedgraph_data[chrom2].append((start2, end2, score))
    
    # Write BEDGraph files
    bedgraph_files = []
    for chrom, data in bedgraph_data.items():
        bedgraph_file = f"{chrom}.bedgraph"
        bedgraph_files.append(bedgraph_file)
        with open(bedgraph_file, 'w') as bgf:
            data.sort()  # Sort by start position
            for start, end, score in data:
                bgf.write(f"{chrom}\t{start}\t{end}\t{score}\n")
    
    return bedgraph_files

def convert_bedgraph_to_bigwig(bedgraph_files, genome_size_file):
    for bedgraph_file in bedgraph_files:
        bigwig_file = bedgraph_file.replace(".bedgraph", ".bigwig")
        bw = pyBigWig.open(bigwig_file, 'w')
        bw.addHeader(list(zip(['chrom', 'size'], open(genome_size_file, 'r'))))
        
        with open(bedgraph_file, 'r') as bgf:
            for line in bgf:
                chrom, start, end, score = line.strip().split("\t")
                start = int(start)
                end = int(end)
                score = float(score)
                bw.addEntries([chrom], [start], ends=[end], values=[score])
        
        bw.close()

def main():
    parser = argparse.ArgumentParser(description="Convert BEDPE format to BigWig")
    parser.add_argument("bedpe_file", help="Input BEDPE file")
    parser.add_argument("genome_size_file", help="Genome size file (2-column: chrom, size)")
    args = parser.parse_args()
    
    bedgraph_files = bedpe_to_bedgraph(args.bedpe_file, args.genome_size_file)
    convert_bedgraph_to_bigwig(bedgraph_files, args.genome_size_file)
    
if __name__ == "__main__":
    main()
