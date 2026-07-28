from ion import works
import matplotlib as mpl
mpl.use('agg')
from matplotlib.testing.compare import compare_images
from tempfile import NamedTemporaryFile
import os.path
import os
import subprocess
import logging
import pandas
import tempfile
import gzip
import pipes
import sys



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
    # logging.info(cmd_line)
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





fasta = works.param(1)
works.progress ( 10 )


# print ( " key ", ' ' )
#bcftools view -r X:31119222-33211549 /tmp/homo_sapiens-chrX.vcf.gz
#vcf = works.param(1)
#track_config = works.param(2)
#region = works.param(3)
# region = ' X:31119222-33211549'
# print ( ' region ', fasta )

with tempfile.NamedTemporaryFile(suffix=".fasta", mode = "w", delete=False) as tf:
    tf.write (fasta)

print ( tf.name )


# /rpsblast -query test.fasta -db ./db/Cdd -outfmt 11 -out test.asn

# output = runShellCommand("cat", tf.name )

while os.path.getsize(tf.name) <= 0:
    print ( ' wait ')


works.progress ( 40 )


output = runShellCommand("ls", "/ljserver")
print ( output )
output = runShellCommand("/ljserver/ncbi/bin/rpsblast","-query", tf.name, "-db", "/db/Cdd", "-outfmt", "11", "-out", "/test1.asn")

works.progress ( 50 )
output = runShellCommand("/ljserver/RpsbProc-x64-linux/rpsbproc","-i", "/test1.asn", "-o", "/test.out")
# rpsbproc.exe -i sequence.asn -o sequence.out -e 0.01
# -m re

data = ''
with open('/test.out', 'r') as file:
    data = file.read().rstrip()
works.progress ( 100 )

works.resolve ( {"file":data})