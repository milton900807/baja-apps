from ion import works

import matplotlib as mpl
mpl.use('agg')
from matplotlib.testing.compare import compare_images
from tempfile import NamedTemporaryFile
import os.path
import pygenometracks.plotTracks
from pygenometracks.utilities import InputError
import os
import subprocess
import logging
import pandas
import tempfile
import gzip
import pipes



#bcftools view -r X:31119222-33211549 /tmp/homo_sapiens-chrX.vcf.gz

#vcf = works.param(1)
#track_config = works.param(2)
#region = works.param(3)
region = ' X:31119222-33211549'
vcf = '/tmp/homo_sapiens-chrX.vcf.gz'



def runShellCommand(*args):
    """ Run a shell command (e.g. bcf tools), and return output
    """
    qargs = []
    for a in args:
        if a.strip() != "|":
            qargs.append(pipes.quote(a))
        else:
            qargs.append("|")

    cmd_line = " ".join(qargs)
    logging.info(cmd_line)
    po = subprocess.Popen(cmd_line,
                          shell=True,
                          stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE)
    stdout, stderr = po.communicate()
    po.wait()
    return_code = po.returncode

    if return_code != 0:
        raise Exception("Command line {} got return code {}.\nSTDOUT: {}\nSTDERR: {}".format(cmd_line, return_code, stdout, stderr))
    return stdout



#exec(`${endpoint}`, `${filepath}`, trackConfigFile, `${chromosome}:${xi}-${xf}`);
print ( ' region ', region )
outfile = NamedTemporaryFile(suffix='.out', delete=False) 
args = f"view -r {region} {vcf}".split()

output = runShellCommand('bcftools', *args)

f = open ('temp.out', 'a')
f.write ( str(output.decode('utf-8') ))
f.close ()

#bcftools view -r X:31119222-33211549 /tmp/homo_sapiens-chrX.vcf.gz


rangev = region.split( ':')[1]
print ( rangev )
s = rangev.split('-')
startIndex=int(s[0])
endIndex=int(s[1])
#for i in range(startIndex, endIndex):
#    if i % 10000 ==0:
#        print ( ' x value ', i )



