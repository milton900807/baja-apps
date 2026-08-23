from shapely.geometry import Polygon
from ion import works
import os


def parse_maf(maf_file):
    """Parses a MAF file and extracts the alignment blocks."""
    alignments = []
    with open(maf_file, 'r') as file:
        block = []
        for line in file:
            if line.startswith('a'):
                if block:
                    alignments.append(block)
                    block = []
            elif line.startswith('s'):
                block.append(line.strip().split())
        if block:
            alignments.append(block)
    return alignments

def generate_polygons(alignments, chromosome, start_range, end_range):
    """Generates Polygon objects from alignment blocks within a specific range."""
    polygons = []
    for block in alignments:
        for seq in block:
            chrom = seq[1]
            start = int(seq[2])
            size = int(seq[3])
            end = start + size
            strand = seq[4]

            # Check if the sequence is in the specified chromosome and range
            if chrom == chromosome and start < end_range and end > start_range:
                # Clip the polygon to the desired range
                start = max(start, start_range)
                end = min(end, end_range)
                
                # Create a polygon from start to end
                if strand == '+':
                    polygon = Polygon([(start, 0), (end, 0), (end, 1), (start, 1)])
                else:
                    polygon = Polygon([(end, 0), (start, 0), (start, 1), (end, 1)])
                
                polygons.append((chrom, polygon))
    return polygons


maf_file = works.param (1)
start = works.param (2)
end = works.param(3)
chrom = works.param(4)

# Big-data root now comes from BIG_DATA (env BIGDATA); resolve any legacy /bd/ path.
_BD = os.environ.get("BIGDATA")
if _BD and str(maf_file).startswith("/bd/"):
    maf_file = _BD.rstrip("/") + str(maf_file)[3:]
chrom = str(chrom)
print ( str(start) )
print ( chrom )

alignments = parse_maf(maf_file)
polygons = generate_polygons(alignments, chrom, start, end)
for chrom, polygon in polygons:
    print(f"Chromosome: {chrom}, Polygon: {polygon}")
    
