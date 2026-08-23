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

# Big-data root now comes from BIG_DATA (env BIGDATA); resolve any legacy /bd/ path.
_BD = os.environ.get("BIGDATA")
if _BD and str(bwfile).startswith("/bd/"):
    bwfile = _BD.rstrip("/") + str(bwfile)[3:]
chrom = str(chrom)
print ( str(start) )
print ( chrom )




import gzip

def parse_and_filter_gz_narrowpeak(file_path, filter_chromosome, filter_start, filter_stop):
    """
    Parses a gzipped narrowPeak file and filters for peaks within a specified chromosome and coordinate range.
    
    Parameters:
    - file_path: str, the path to the gzipped narrowPeak file.
    - filter_chromosome: str, the target chromosome to filter for (e.g., 'chr1').
    - filter_start: int, the start position of the target range.
    - filter_stop: int, the stop position of the target range.
    
    Returns:
    - filtered_peaks: list of dicts, each containing information about a peak that meets the filter criteria.
    """
    filtered_peaks = []
    keys = ["chromosome", "start", "end", "name", "score", "strand", "signalValue", "pValue", "qValue", "peak"]
    
    with gzip.open(file_path, 'rt') as file:
        for line in file:
            if line.startswith('#'):
                continue  # Skip header or comment lines
            
            fields = line.strip().split('\t')
            peak = {key: fields[i] if i < len(fields) else None for i, key in enumerate(keys)}
            
            # Convert numeric fields to integers or floats as appropriate
            peak["start"], peak["end"] = int(peak["start"]), int(peak["end"])
            for key in ["score", "signalValue", "pValue", "qValue"]:
                if peak[key] is not None:
                    peak[key] = float(peak[key])
            
            # Filter peaks based on the specified chromosome and coordinate range
            if (peak["chromosome"] == filter_chromosome and
                peak["start"] >= filter_start and 
                peak["end"] <= filter_stop):
                filtered_peaks.append(peak)
    
    return filtered_peaks


# print ( chrom, " start ", start, "end ", end )

if not chrom.startswith('chr'):
    chrom = 'chr' + chrom
filtered_peaks = parse_and_filter_gz_narrowpeak(bwfile, chrom, start, end)
works.progress ( 100 )
works.resolve ( {'start':'' + str(start) + ' and ' + str(end) + ' and ' + bwfile, 'peaks': json.dumps(filtered_peaks) } )
