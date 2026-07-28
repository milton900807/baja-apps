from ion import works
from subprocess import Popen, PIPE
import json

file = works.param (1)
chrom = works.param (2)
startIndex = works.param(3)
endIndex = works.param(4)
strand = works.param(5)


print ( f' file ', file )
print ( f' chrom ', chrom )
print ( f' start ', startIndex )
print ( f' file ', endIndex )
print ( f' file ', strand )


# Function to parse each row into a dictionary
def parse_row(row):
    return {
        'chromosome': row[0].decode('utf-8'),
        'start': int(row[1].decode('utf-8')),
        'end': int(row[2].decode('utf-8')),
        'name': row[3].decode('utf-8'),
        'score': int(row[4].decode('utf-8')),
        'strand': row[5].decode('utf-8')
    }

def bgzip(filename):
    """Call bgzip to compress a file."""
    Popen(['bgzip', '-f', filename])

def tabix_query(filename, chrom, start, end):
    """Call tabix and generate an array of strings for each line it returns."""
    query = '{}:{}-{}'.format(chrom, start, end)
    print ( f'query {query}' )
    process = Popen(['tabix', '-f', filename, query], stdout=PIPE)
    for line in process.stdout:
        yield line.strip().split()

records = tabix_query (file, chrom, int(startIndex), int(endIndex))
bp=[]
bp = [parse_row(row) for row in records]

works.resolve( {'results': bp })
