import csv
import json
import RNA
import pkg_resources
from ion import works
import os
import numpy


temperature = 37
param_name = 'dna_matthews2004'
parent_sequence = works.param (1)


print ( parent_sequence, ' is the parnet sequence ' )
#with open('kras.fasta', 'r') as file:
#    parent_sequence = file.read().rstrip()

if parent_sequence is not None and len(parent_sequence)>0:
    parent_sequence = parent_sequence.strip ()


tenant_id = os.environ.get('LJL_TENTANT_ID')
client_id = os.environ.get('LJL_CLIENT_ID')
thumbprint = os.environ.get('THUMPRINT')
certfile = os.environ.get ('APP_CERT_PATH')




def levenshteinDistanceDP(token1, token2):
    distances = numpy.zeros((len(token1) + 1, len(token2) + 1))

    for t1 in range(len(token1) + 1):
        distances[t1][0] = t1

    for t2 in range(len(token2) + 1):
        distances[0][t2] = t2
        
    a = 0
    b = 0
    c = 0
    
    for t1 in range(1, len(token1) + 1):
        for t2 in range(1, len(token2) + 1):
            if (token1[t1-1] == token2[t2-1]):
                distances[t1][t2] = distances[t1 - 1][t2 - 1]
            else:
                a = distances[t1][t2 - 1]
                b = distances[t1 - 1][t2]
                c = distances[t1 - 1][t2 - 1]
                
                if (a <= b and a <= c):
                    distances[t1][t2] = a + 1
                elif (b <= a and b <= c):
                    distances[t1][t2] = b + 1
                else:
                    distances[t1][t2] = c + 1

    #printDistances(distances, len(token1), len(token2))
    return distances[len(token1)][len(token2)]

def edit_distance(string1, string2):
    if len(string1) > len(string2):
        difference = len(string1) - len(string2)
        string1[:difference]

    elif len(string2) > len(string1):
        difference = len(string2) - len(string1)
        string2[:difference]

    else:
        difference = 0
    if len(string2) == len(string1):
        #print (' this is none type ', string1 )
        for i in range(len(string1)):
            if string1[i] != string2[i]:
                difference += 1

    return difference

irl = []
with open("/tmp/Human_IRES_Info.txt", "r", encoding= 'unicode_escape') as str:
    tsv_reader = csv.DictReader(str, delimiter="\t")
    #print (tsv_reader.fieldnames)
    try:
        for line in tsv_reader:
            iseq = line["IRES Sequence"]
            ss = line["Secondary Structure"]
            lo = line["Location (hg38)"]
            ii = line["IRES ID"]
            si = line["Strand (hg38)"]
            iresref = {}
            iresref["structure"]=ss
            iresref["loc"]=lo
            iresref["id"]=ii
            iresref["iseq"]=iseq
            irl.append (iresref)
    except OSError:
        print ( ' error ' )
    
    if temperature != 37:
        RNA.cvar.temperature = temperature
    RNA.cvar.dangles = 2
    settings = RNA.md()

    index = 0
    increment = 10
    
    hits = [] 
    leh = []
    works.progress ( 0 )
    total = len(parent_sequence)
    for index in  range(len(parent_sequence)-increment):
        end =index+increment
        seq = parent_sequence[index:end]
        if seq is None or len(seq)<=0:
            break
        else:
            seq = seq.strip()
        index+=len(parent_sequence)/95

       
        works.progress (index/total*100)

        fc_obj = RNA.fold_compound(
            seq,
            settings)
        structure, mfe = fc_obj.mfe()
        seq = seq.replace(' ', '')
        seq = seq.replace('\n', '')
        for i in irl:
            refstr = i["structure"]
            reloc = i["loc"]
            reid = i["id"]
            iseq = i["iseq"]
            if refstr is not None and len(refstr) > 0:
                if refstr is not None and structure is not None:
                    #edit =levenshteinDistanceDP ( structure.strip(), refstr.strip() )
                    edit = edit_distance( structure.strip(), refstr.strip())
                    print  ( ' Edit ', edit )
                    if edit < 5:
                        edit =levenshteinDistanceDP ( structure.strip(), refstr.strip() )


                        if edit < 2:
                            hits.append({
                                "index":index,
                                "sequence":seq,
                                "isequence":iseq,
                                "loc":reloc,
                                "id":reid,
                                "le":edit,
                                "structure":structure})


    works.progress ( 100 )

    works.resolve (hits)
