import pyBigWig
from ion import works
import os
import requests
import json
import sys
import math

start = int(works.param(2))
end = int(works.param(3))
chrom = str(works.param(4))



original_file = works.param(1)

def resolve_file_path(path: str) -> str:
    candidates = [path]

    # 1) $LJUSER_DATA/<path>
    ljuser_data = os.environ.get("LJUSER_DATA")
    if ljuser_data:
        candidates.append(
            os.path.join(ljuser_data, path.lstrip("/"))
        )

    # 2) $HOME/ljusers/<path>
    home_dir = os.environ.get("HOME")
    if home_dir:
        candidates.append(
            os.path.join(home_dir, "ljusers", path.lstrip("/"))
        )

    # 3) /root/ljusers/<path>
    candidates.append(
        os.path.join("/root/ljusers", path.lstrip("/"))
    )

    for candidate in candidates:
        candidate = candidate.replace("//", "/")
        if os.path.exists(candidate):
            print(f"Resolved file path: {candidate}")
            return candidate

    print("Tried file paths:")
    for c in candidates:
        print(f"  - {c}")

    return path  # preserve old behavior if nothing exists

bwfile = resolve_file_path(original_file)



fval = []
bw = pyBigWig.open('%s' % bwfile)

bw_chroms = bw.chroms()
bw_chrom_names = list(bw_chroms.keys())

# Default behavior: match the chromosome naming style of the BigWig
chrom_leader = 'chr' if bw_chrom_names[0].startswith('chr') else ''
default_chrom = chrom_leader + chrom.replace('chr', '')

# Fallback behavior: try the opposite naming style
if default_chrom.startswith('chr'):
    fallback_chrom = default_chrom.replace('chr', '', 1)
else:
    fallback_chrom = 'chr' + default_chrom

print("Trying chromosome:", default_chrom)

try:
    vvalues = bw.values(default_chrom, start, end)
except RuntimeError:
    vvalues = []

# If no values came back, try the fallback chromosome naming style
has_results = any((v is not None and not math.isnan(v)) for v in vvalues)

if not has_results:
    print("No results for", default_chrom, "- trying fallback:", fallback_chrom)

    try:
        vvalues = bw.values(fallback_chrom, start, end)
        chrom = fallback_chrom
    except RuntimeError:
        vvalues = []
        chrom = default_chrom
else:
    chrom = default_chrom

start_index = start

for v in vvalues:
    if v is not None and not math.isnan(v):
        fval.append([start_index, v])
    else:
        fval.append([start_index, 0.])
    start_index += 1

fval = [
    [f, v]
    for i, (f, v) in enumerate(fval)
    if (i > 0 and i < len(fval) - 1)
    and (fval[i - 1][1] != v or fval[i + 1][1] != v)
]

works.progress(100)
works.resolve({
    'test': str(start) + ' and ' + str(end) + ' and ' + bwfile + ' chrom ' + chrom,
    'values': json.dumps(fval)
})