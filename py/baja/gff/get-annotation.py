import pandas as pd
import pybedtools

gff_file = "/path/to/your/genome_annotation.gff"
gff = pd.read_csv(gff_file, sep='\t', comment='#', header=None)
gff.columns = ['chr', 'source', 'feature', 'start', 'end', 'score', 'strand', 'frame', 'attribute']
def get_gene_name(attribute):
    for field in attribute.split(';'):
        if field.strip().startswith('Name='):
            return field.strip().split('=')[1]
    return None
gff['gene_name'] = gff['attribute'].apply(get_gene_name)
bed = pybedtools.BedTool.from_dataframe(gff[['chr', 'start', 'end', 'gene_name', 'score', 'strand']])
data = {
    "chr": "1",
    "editdistance": 1,
    "end": 11013900,
    "genome": "/mnt/genomes/Homo_sapiens.GRCh38.dna.primary_assembly.4bit",
    "start": 11013877,
    "strand": "-"
}
query_region = pybedtools.BedTool(f"{data['chr']} {data['start']} {data['end']}", from_string=True)
intersected = bed.intersect(query_region, wa=True)
genes = set()
for interval in intersected:
    genes.add(interval.name)

if genes:
    print(f"Genes at the location: {', '.join(genes)}")
else:
    print("No genes found at the location.")
