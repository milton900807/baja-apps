import pyBigWig
from ion import works 
import os
import requests
from msgraph import api
import json
import sys
import math

print ( sys.argv )

bwfile = works.param (1)
start = works.param (2)
end = works.param(3)
chrom = works.param(4)
chrom = str(chrom)
print ( str(start) )
print ( chrom )



fval = []
bw = pyBigWig.open('%s' % bwfile)

chrom_leader = 'chr' if [*bw.chroms().keys()][0].startswith('chr') else ''
chrom = chrom_leader + chrom
print( chrom_leader, chrom )

vvalues = bw.values(str(chrom), start, end)
start_index = start
for v in vvalues:
    if not math.isnan ( v): 
        fval.append ( [start_index, v] )
    else:
        fval.append ( [start_index, 0.] )
    start_index = start_index + 1

    

fval = [[f,v] for i,(f,v) in enumerate(fval) if (i > 0 and i < len(fval) - 1) and (fval[i-1][1] != v or fval[i+1][1] != v) ]


works.progress ( 100 )
works.resolve ( {'test':'' + str(start) + ' and ' + str(end) + ' and ' + bwfile, 'values': json.dumps(fval) } )
