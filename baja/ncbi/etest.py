import entrezpy.efetch.efetcher
from Bio import Entrez
from ion import works
db = works.param (1)
idvalue = works.param (2)

# idvalue = 'NM_002032'
# db = 'nucest'
# db = 'nucgss'
# idvalue = 6607
# idvalue = 'NM_020988'
# idvalue = '2775' # GNAO1
# idvalue = 'NC_000005.9'
# db = 'nuccore'
# db = 'gene'
# idvalue = 'NM_022875.3'
# db = 'gene'
# db = 'nucest'
# this will get a gene id for a transcript 
# db = 'nuccore'
# nuccore
# first search for the gene id using the following: 
# idvalue = 'NM_020988'
handle = Entrez.efetch(db=db, id=idvalue,  rettype='gbwithparts', retmode="text", email="jmilto@gmail.com")

print ( ' --- ')
l = handle.readline()
features = False
annotations = {}
while l:
    l = handle.readline()
    print ( l )

handle.close()


def check_space(string):
    # counter
    count = 0
    # loop for search each index
    for i in string:
         
        # Check each char
        # is blank or not
        if i == " ":
            count += 1
        else:            
            return count
    return count




