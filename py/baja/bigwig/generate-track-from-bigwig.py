import pyBigWig
from ion import works
import os
import requests
import json
import sys
import math
from collections import OrderedDict

bwfile = works.param(1)
track_name = works.param(2) if works.param(2) else 'RNA-seq BigWig'
assembly = works.param(3) if works.param(3) else 'hg38'
target_points = works.param(4) if works.param(4) else 5000

try:
    target_points = int(target_points)
except Exception:
    target_points = 5000

# hg38 / GRCh38 primary assembly
HG38_CHROM_SIZES = OrderedDict([
    ('chr1', 248956422),
    ('chr2', 242193529),
    ('chr3', 198295559),
    ('chr4', 190214555),
    ('chr5', 181538259),
    ('chr6', 170805979),
    ('chr7', 159345973),
    ('chr8', 145138636),
    ('chr9', 138394717),
    ('chr10', 133797422),
    ('chr11', 135086622),
    ('chr12', 133275309),
    ('chr13', 114364328),
    ('chr14', 107043718),
    ('chr15', 101991189),
    ('chr16', 90338345),
    ('chr17', 83257441),
    ('chr18', 80373285),
    ('chr19', 58617616),
    ('chr20', 64444167),
    ('chr21', 46709983),
    ('chr22', 50818468),
    ('chrX', 156040895),
    ('chrY', 57227415),
    ('chrM', 16569),
])

def safe_float(v, default=0.0):
    try:
        if v is None:
            return default
        if math.isnan(v):
            return default
        return float(v)
    except Exception:
        return default

bw = pyBigWig.open('%s' % bwfile)
bw_chroms = bw.chroms()

# Determine whether file uses "chr" prefix
first_bw_chrom = list(bw_chroms.keys())[0] if len(bw_chroms) > 0 else 'chr1'
bw_has_chr_prefix = first_bw_chrom.startswith('chr')

# Build chromosome metadata in concatenated genome coordinates
chromosomes = []
genome_offset = 0
genome_total_length = 0

for chrom, chrom_len in HG38_CHROM_SIZES.items():
    bw_chrom = chrom if bw_has_chr_prefix else chrom.replace('chr', '')
    has_signal = bw_chrom in bw_chroms

    chromosomes.append({
        'name': chrom,
        'bw_name': bw_chrom,
        'length': chrom_len,
        'genome_start': genome_offset,
        'genome_end': genome_offset + chrom_len,
        'bigwig_has_chrom': has_signal,
        'bigwig_length': bw_chroms.get(bw_chrom, None)
    })

    genome_offset += chrom_len
    genome_total_length += chrom_len

# Choose bin size to keep points manageable across whole genome
if target_points < 100:
    target_points = 100

bin_size = int(math.ceil(float(genome_total_length) / float(target_points)))
if bin_size < 1:
    bin_size = 1

summary_points = []
global_min = None
global_max = None
global_sum = 0.0
global_bins_with_signal = 0

for ci, chrom_info in enumerate(chromosomes):
    chrom = chrom_info['name']
    bw_chrom = chrom_info['bw_name']
    chrom_len = chrom_info['length']
    chrom_offset = chrom_info['genome_start']

    if not chrom_info['bigwig_has_chrom']:
        continue

    num_bins = int(math.ceil(float(chrom_len) / float(bin_size)))

    for bi in range(num_bins):
        start = bi * bin_size
        end = min(start + bin_size, chrom_len)
        width = end - start

        if width <= 0:
            continue

        try:
            # pyBigWig.stats returns lists
            mean_val = bw.stats(bw_chrom, start, end, type='mean', nBins=1)[0]
            max_val = bw.stats(bw_chrom, start, end, type='max', nBins=1)[0]
            min_val = bw.stats(bw_chrom, start, end, type='min', nBins=1)[0]
            cov_val = bw.stats(bw_chrom, start, end, type='coverage', nBins=1)[0]
        except Exception:
            mean_val = None
            max_val = None
            min_val = None
            cov_val = None

        mean_val = safe_float(mean_val, 0.0)
        max_val = safe_float(max_val, 0.0)
        min_val = safe_float(min_val, 0.0)
        cov_val = safe_float(cov_val, 0.0)

        genome_start = chrom_offset + start
        genome_end = chrom_offset + end
        genome_mid = chrom_offset + int((start + end) / 2)

        point = {
            'chrom': chrom,
            'start': start,
            'end': end,
            'genome_start': genome_start,
            'genome_end': genome_end,
            'genome_mid': genome_mid,
            'bin_size': width,
            'mean': mean_val,
            'max': max_val,
            'min': min_val,
            'coverage': cov_val
        }

        summary_points.append(point)

        if cov_val > 0 or mean_val != 0.0 or max_val != 0.0 or min_val != 0.0:
            global_bins_with_signal += 1
            global_sum += mean_val
            if global_min is None or min_val < global_min:
                global_min = min_val
            if global_max is None or max_val > global_max:
                global_max = max_val

    # progress update by chromosome
    works.progress(int(((ci + 1) / float(len(chromosomes))) * 100))

# Derived stats
global_mean = (global_sum / float(global_bins_with_signal)) if global_bins_with_signal > 0 else 0.0

track_obj = {
    'type': 'GenomeTrack',
    'name': track_name,
    'track_type': 'signal',
    'signal_type': 'RNA-seq',
    'format': 'bigwig',
    'species': 'human',
    'assembly': assembly,
    'source': {
        'path': bwfile,
        'reader': 'pyBigWig'
    },
    'genome': {
        'coordinate_system': 'concatenated_chromosomes',
        'total_length': genome_total_length,
        'chromosome_count': len(chromosomes),
        'chromosomes': chromosomes
    },
    'summary_sampling': {
        'method': 'fixed_bin_genomewide',
        'target_points': target_points,
        'bin_size': bin_size,
        'actual_points': len(summary_points),
        'value_field_default': 'mean',
        'available_value_fields': ['mean', 'max', 'min', 'coverage']
    },
    'view': {
        'domain': [0, genome_total_length],
        'default_region': {
            'chrom': 'chr1',
            'start': 0,
            'end': min(1000000, HG38_CHROM_SIZES['chr1'])
        },
        'units': 'bp'
    },
    'summary': {
        'min': global_min if global_min is not None else 0.0,
        'max': global_max if global_max is not None else 0.0,
        'mean': global_mean,
        'bins_with_signal': global_bins_with_signal
    },
    'style': {
        'height': 120,
        'autoscale': True,
        'display_mode': 'dense'
    },
    'points': summary_points
}

bw.close()

works.resolve({
    'test': '%s genome summary generated with %d points and bin size %d' % (bwfile, len(summary_points), bin_size),
    'track_json': json.dumps(track_obj)
})