import entrezpy.efetch.efetcher
from Bio import Entrez

from ion import works

# db = works.param (1)
# idvalue = works.param (2)

idvalue = 'NM_002032'
db = 'nucest'
handle = Entrez.efetch(db=db, id=idvalue, rettype='gb', retmode="text", email="jmilto@gmail.com")
print ( ' ------------------------------------------------------ ')
l = handle.readline()
features = False
while l:
    print (l)
    if l.startswith ('FEATURES'):
        features = True
    if ( l.startswith ( 'ORIGIN')):
        features = False
    l = handle.readline()
handle.close()
print ( ' ------------------------------------------------------ ')
# res = {}
# works.resolve (res)
