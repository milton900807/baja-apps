from ion import works
from subprocess import Popen, PIPE
import json

file = works.param (1)
chrom = works.param (2)
startIndex = works.param(3)
endIndex = works.param(4)
strand = works.param(5)


def bgzip(filename):
    """Call bgzip to compress a file."""
    Popen(['bgzip', '-f', filename])

def tabix_index(filename,
        preset="gff", chrom=1, start=4, end=5, skip=0, comment="#"):
    """Call tabix to create an index for a bgzip-compressed file."""
    Popen(['tabix', '-p', preset, '-s', chrom, '-b', start, '-e', end,
        '-S', skip, '-c', comment])

def tabix_query(filename, chrom, start, end):
    """Call tabix and generate an array of strings for each line it returns."""
    query = '{}:{}-{}'.format(chrom, start, end)
    process = Popen(['tabix', '-f', filename, query], stdout=PIPE)
    for line in process.stdout:
        yield line.strip().split()

#print ( ' executing query ', chrom, ' startIndex', startIndex, ' endIndex ', endIndex )
records = tabix_query (file, chrom, int(startIndex), int(endIndex))
#X       31348554        rs1556539065    A       C       .       .       dbSNP_154;TSA=SNV;E_Phenotype_or_Disease;CLIN_pathogenic;AA=A

snps=[]

for r in records:
    # print ( r )
    ftype = 'snp'
    snpid = r[2].decode('utf-8')
    ref = r[3].decode("utf-8") 
    alt = r[4].decode("utf-8")
    if len(ref) > len(alt):
        ftype = 'del'
    elif len(ref) < len(alt):
        if alt.find(",")==-1:
            ftype = 'ins'
        else: 
            ftype = 'snp'
    else:
        ftype = 'snp'

    name = r[2].decode("utf-8")
    if name is None or len(name)<=0:
        name = ftype + str(r[1].decode('utf-8'))
    if r[2] is not None and snpid.startswith("rs"):
        snpindel = { 
            "name": name,
            "type":ftype,
            "id":str(r[2].decode("utf-8") ),
            "xi":int(r[1].decode("utf-8") ),
            "xf":len(alt),
            "strand":str(strand),
            "alternate":str(r[4].decode("utf-8") ),
            "reference":str(r[3].decode("utf-8") ),
            "phase":1
        }
        snps.append (snpindel)

works.resolve( {'results': snps } )
