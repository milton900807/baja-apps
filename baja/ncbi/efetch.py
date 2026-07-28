import entrezpy.efetch.efetcher
from Bio import Entrez
from ion import works

def validate ( key, ex, indx ):
    if key in ex.keys():
        indx = indx + 1
        key = key + str(indx)
        return validate ( key, ex, indx)
    else:
        return key

def check_space(string):
    count = 0
    # loop for search each index
    for i in string:
        if i == " ":
            count += 1
        else:            
            return count
    return count



def parseCoordinates ( handle ):
    exons = []
    coding = []
    l = handle.readline()
    while l:
        sp = l.split ()
        if sp and len(sp)>0:
            exons.append (sp[0])
            coding.append (sp[1])
            l = handle.readline ()
        else:
            break
    return {
        "exons":exons,
        "coding":coding
    }



# NM_020988
db = works.param (1)
idvalue = works.param (2)
# idvalue = 2495
# db = 'gene'

# kras example
# idvalue = 'NM_004985'
#snm2
# idvalue = 'NM_017411'
# db = 'nuccore'
# db = 'nucest'
# db = 'gene'
# https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=gene&id=2495&rettype=gene_table&format=text
# https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=NM_002032&rettype=fasta
handle = Entrez.efetch(db=db, id=idvalue, rettype='gene_table', retmode="text", email="jmilto@gmail.com")
# sequence = Entrez.efetch(db='nucleotide', id=idvalue, rettype='fasta', email="jmilto@gmail.com")
# sl = sequence.readline()
# seq = ''
# while sl:
#     seq += str(sl).strip()
#     sl = sequence.readline()


l = handle.readline()
features = False
annotations = {}
exons = []
attributes = ['source', 'gene', 'exon', 'polyA_site', 'regulatory', 'CDS', 'misc_feature']
geneID = None
t = ''
while l:
    t += l
    if l.startswith ( '-------------------------------'):
        annotations['structure']=parseCoordinates ( handle )
    l = handle.readline()
# print ( exons )
handle.close()
# sequence.close();
res = {
    "id": idvalue,
    "object_type":"Transcript",
    "annotation":annotations,
    "text":t 
}
geneobj = {}
if geneID:
    genedb = Entrez.efetch(db='gene', id=geneID, rettype='gb', retmode="text", email="jmilto@gmail.com")
    l = genedb.readline()
    while l:
        # Annotation: Chromosome 11 NC_000011.10 (61964285..61967634, complement)
        if l.strip().startswith ('Annotation:'):
            geneobj['annotation'] = l.strip()
            start = l.rfind('(')
            end = l.rfind(')')            
            if start > 0 and end > 0:
                coords = l[start+1:end]
                if coords.find (',')>0:
                    coords = coords[:coords.find(',')]
                    orientation = l[l.rfind (',')+1:end].strip()
                    if orientation:
                        if orientation == 'complement':
                            res['strand'] = '-'
                        else:
                            res['strand'] = '+'
                        geneobj['orientation'] = str(orientation)
                r = coords.find ('..')
                if r>0:
                    startX = coords[:r]                    
                    endx = coords[r+2:]
                    res [ 'start'] = int(startX)
                    res [ 'end' ] = int(endx)
                    # print ( ' start ', startX, ' end ', endx )
        l = genedb.readline ()
        # print ( l )

Exons = []
indx = 0
for e in exons:
    if e["feature_type"] == 'exon':
        Exons.append ( {
            "object_type":"Exon",
            "id": str(indx),
            "start":int(e["start"]) + res['start'],
            "end":int(e["end"]) + res['end']
        })
        indx = indx+1
res['Exon'] = Exons



works.resolve (res)
