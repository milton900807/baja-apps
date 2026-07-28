import os 
dir_path = os.path.dirname(os.path.realpath(__file__))
print ( dir_path )
from gff3 import Gff3
filepath = dir_path + "\\gencode-simple-annotations.gff3"
gff = Gff3()
gff.parse(filepath)
print ( ' parse complete ')
type_map = {'exon': 'pseudogenic_exon', 'transcript': 'pseudogenic_transcript'}
pseudogenes = [line for line in gff.lines if line['line_type'] == 'feature' and line['type'] == 'pseudogene']
for pseudogene in pseudogenes:
    # convert types
    for line in gff.descendants(pseudogene):
        if line['type'] in type_map:
            line['type'] = type_map[line['type']]
    # find overlapping gene
    overlapping_genes = [line for line in gff.lines if line['line_type'] == 'feature' and line['type'] == 'gene' and gff.overlap(line, pseudogene)]
    if overlapping_genes:
        # move pseudogene children to overlapping gene
        gff.adopt(pseudogene, overlapping_genes[0])
        # remove pseudogene
        gff.remove(pseudogene)
gff.write('annotations_fixed.gff3')