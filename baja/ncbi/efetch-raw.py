import entrezpy.efetch.efetcher
from Bio import Entrez

from ion import works

# db = works.param (1)
# idvalue = works.param (2)

# idvalue = 'NM_002032'
# db = 'nucest'
# db = 'nucgss'
# idvalue = '2495
# idvalue = 'NM_020988'
# idvalue = '2775' # GNAO1
# idvalue = 'NC_000005.9'
db = 'gene'
idvalue = '6607'
# db = 'gene'
# db = 'nucest'
# this will get a gene id for a transcript 
# db = 'nuccore'
# nuccore



# create function that
# return space count
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

# first search for the gene id using the following: 
# idvalue = 'NM_020988'

print ( ' --- ')

handle = Entrez.efetch(db=db, id=idvalue,  rettype='gb', retmode="text", email="jmilto@gmail.com")

print ( ' --- ')

sequence = Entrez.efetch(db='nucleotide', id=idvalue, rettype='fasta', email="jmilto@gmail.com")
# e = entrezpy.efetch.efetcher.Efetcher("tool",
#                                       "jeffmilto@gmail.com",
#                                       apikey=None,
#                                       apikey_var=None,
#                                       threads=None,
#                                       qid=None)
# analyzer = e.inquire({'db' : db,
#                       'id' : idvalue})
# https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=NM_002032&rettype=fasta

sequence.readline();
sl = sequence.readline()
seq = ''
while sl:
    seq = seq + str(sl).strip()
    sl = sequence.readline()
print ( seq )


print ( ' ------------------------------------------------------ ')
l = handle.readline()
features = False
annotations = {}
exons = []
attributes = ['exon', 'polyA_site', 'regulatory', 'CDS', 'gene', 'source']
while l:
    if l.startswith ('FEATURES'):
        features = True
    if ( l.startswith ( 'ORIGIN')):
        features = False
    if features:
        print ('f number of tabs ',  check_space(l))
        s = l.split ()

        for attr in attributes:
            if s[0] == attr:
                ex = {}
                ex['feature_type']=attr

                if s[1] and str(s[1]).isnumeric and str(s[1]).find ( '..')>0:
                    ex['start'] = int(s[1].split ( '..')[0])
                    ex['end'] = int(s[1].split ( '..')[1])
                else:
                    ex['start'] = int(s[1])
                    ex['end'] = int(s[1])
                l = handle.readline()
                print ( l )

                onFeature = True
                while onFeature:
                    print (' number of tabs ',  check_space(l))
                    s = l.split()
                    if ( len(s[0])>0 and s[0].strip().startswith ( '/')):
                        if s[0].find('=')>0:
                            exps=s[0].split('=')
                            key = exps[0][1:]
                        else:
                            key = s[0]
                        temp = l.strip().replace("\"", '')
                        temp = temp.replace("'", '')
                        ex[key]=temp

                    elif len(s[0]) > 0 and s[0] == attr:
                        exons.append ( ex )
                        ex = {};
                        ex['feature_type']=attr

                        if s[1].find ( '..')>0:
                            ex['start'] = int(s[1].split ( '..')[0])
                            ex['end'] = int(s[1].split ( '..')[1])
                        else:
                            ex['start'] = int(s[1])
                            ex['end'] = int(s[1])
                        l = handle.readline()
                        print ( l )

                        onFeature = True
                    if len(s[0]) > 0 and check_space ( l ) < 20:
                        exons.append ( ex )
                        onFeature = False
                    else:
                        l = handle.readline();
                        print ( l )

                    if ( l.startswith ( 'ORIGIN')):
                        features = False

        
    l = handle.readline()
    print ( l )

# print ( exons )
handle.close()
sequence.close();




