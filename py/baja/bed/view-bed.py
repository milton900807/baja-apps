import pybedtools
from ion import works 
import os
import requests
from msgraph import api
import msal
import json
import sys
import math
import re


bedfile = works.param (1)
#bedfile = '/tmp/ENCFF362XUO.bed'
start = works.param (2)
end = works.param(3)
chrom = str(works.param(4))
strand = str(works.param(5))

bedfile =  re.sub(r'/+', '/', bedfile)
# Big-data root now comes from BIG_DATA (env BIGDATA); resolve any legacy /bd/ path.
_BD = os.environ.get("BIGDATA")
if _BD and bedfile.startswith("/bd/"):
    bedfile = _BD.rstrip("/") + bedfile[3:]
works.progress(50)
# bw = pyBigWig.open('%s' % bwfile)
bed = pybedtools.BedTool(bedfile)
chrom_leader = 'chr' 
if bed[0].chrom.startswith('chr'):
    chrom = chrom_leader + chrom
else:
    ''
fval = []
for bi in bed:
    if bi.chrom == chrom and bi.start > start and bi.stop < end:
        if bi.strand == '+' or bi.strand == '-':
            if strand == '1' and bi.strand == '+':
                fval.append([bi.start,bi.end,bi.name])
            elif strand == '-1' and bi.strand == '-':
                fval.append([bi.start,bi.end,bi.name])
        else:
            fval.append([bi.start,bi.end,bi.name])

works.progress( 100 )
works.resolve ( {'test':'' + str(start) + ' and ' + str(end) + ' and ' + bedfile, 'values': json.dumps(fval) } )
