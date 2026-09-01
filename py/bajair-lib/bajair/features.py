#!/usr/bin/env python3
"""Intron table and sequence features from any GTF + FASTA.

Shared by training (src/introns.py) and scoring (src/score_introns.py) so the
two cannot drift apart. Train/serve skew in feature code is silent and it
invalidates the model rather than crashing it, so there is one implementation.

Conventions follow BajaSplice:
  intron = exon_end + 1 .. next_exon_start - 1, 1-based inclusive
  donor  = first intronic base in TRANSCRIPT orientation (genomic right end on
           the minus strand), acceptor = last
"""
from __future__ import annotations

import gzip
import re
import numpy as np
import pandas as pd
import pysam

FLANK = 100          # exonic window for flanking GC
PPT = (5, 35)        # polypyrimidine tract window upstream of the acceptor

_ATTR = {k: re.compile(rf'{k} "([^"]+)"') for k in
         ('gene_id', 'transcript_id', 'gene_name', 'gene_type', 'transcript_type')}

# the geometry the model is trained on, and the splice-site columns
GEOMETRY_COLS = ['log_len', 'gc_intron', 'gc_5p', 'gc_3p', 'gc_up_exon', 'gc_dn_exon',
                 'ppt_frac', 'log_up_exon', 'log_dn_exon', 'n_introns', 'intron_number',
                 'rel_position', 'canonical', 'mane', 'basic']
SPLICE_COLS = ['ss_donor', 'ss_acceptor', 'ss_min', 'ss_donor_compete', 'ss_acceptor_compete']


def _open(path):
    return gzip.open(path, 'rt') if str(path).endswith('.gz') else open(path, 'rt')


def parse_gtf_exons(gtf, genes=None, chroms=None):
    """Stream a GTF into an exon table. `genes` filters by gene_name early."""
    want = set(genes) if genes else None
    rows = []
    with _open(gtf) as fh:
        for line in fh:
            if line[0] == '#':
                continue
            f = line.rstrip('\n').split('\t')
            if len(f) != 9 or f[2] != 'exon':
                continue
            if chroms and f[0] not in chroms:
                continue
            a = f[8]
            if want is not None:
                m = _ATTR['gene_name'].search(a)
                if not m or m.group(1) not in want:
                    continue
            vals = [(_ATTR[k].search(a).group(1) if _ATTR[k].search(a) else '')
                    for k in ('gene_id', 'transcript_id', 'gene_name', 'gene_type',
                              'transcript_type')]
            rows.append((f[0], int(f[3]), int(f[4]), f[6], *vals,
                         1 if 'tag "MANE_Select"' in a else 0,
                         1 if 'tag "basic"' in a else 0))
    return pd.DataFrame(rows, columns=['chrom', 'start', 'end', 'strand', 'gene_id',
                                       'transcript_id', 'gene_name', 'gene_type',
                                       'transcript_type', 'mane', 'basic'])


OPTIONAL_DEFAULTS = {'gene_id': '', 'gene_name': '', 'gene_type': '',
                     'transcript_type': '', 'mane': 0, 'basic': 1}


def ensure_columns(ex):
    """Fill annotation columns a lighter exon source may not carry.

    BajaSplice's gene index returns transcript_id / start / end / mane /
    chrom / strand / gene_name and nothing else. `basic` defaults to 1, which
    is exactly right for the MANE transcripts that survive the clean-stratum
    filter and an approximation outside it.
    """
    ex = ex.copy()
    for c, v in OPTIONAL_DEFAULTS.items():
        if c not in ex.columns:
            ex[c] = v
    if 'gene_id' in ex.columns and (ex.gene_id == '').all():
        ex['gene_id'] = ex.gene_name
    return ex


def introns_from_exons(ex):
    """One row per distinct intron, with the non-sequence geometry."""
    ex = ensure_columns(ex)
    ex = ex.sort_values(['transcript_id', 'start'], kind='stable')
    g = ex.groupby('transcript_id', sort=False)
    nxt_start = g['start'].shift(-1)
    same = g['transcript_id'].shift(-1).notna()
    n_ex = g['start'].transform('size')
    rank = g.cumcount() + 1

    df = pd.DataFrame({
        'chrom': ex.chrom, 'strand': ex.strand,
        'istart': ex.end + 1, 'iend': nxt_start - 1,
        'up_exon_len': ex.end - ex.start + 1,
        'dn_exon_len': g['end'].shift(-1) - nxt_start + 1,
        'gene_id': ex.gene_id, 'gene_name': ex.gene_name, 'gene_type': ex.gene_type,
        'transcript_type': ex.transcript_type, 'mane': ex.mane, 'basic': ex.basic,
        'n_exons': n_ex, 'exon_rank': rank, 'transcript_id': ex.transcript_id,
    })[same]
    df = df[df.iend >= df.istart].copy()
    df['iend'] = df.iend.astype(int)
    df['dn_exon_len'] = df.dn_exon_len.astype(int)
    df['n_introns'] = df.n_exons - 1
    # transcript orientation: on the minus strand the last exon pair by
    # coordinate is the transcript's first intron
    df['intron_number'] = np.where(df.strand == '+', df.exon_rank,
                                   df.n_introns - df.exon_rank + 1)
    df = df.sort_values(['mane', 'basic'], ascending=False, kind='stable')
    key = ['chrom', 'istart', 'iend', 'strand']
    df['n_transcripts'] = df.groupby(key, sort=False)['transcript_id'].transform('size')
    df = df.drop_duplicates(key, keep='first')
    return df.reset_index(drop=True)


def add_sequence_features(df, fasta, progress=0):
    """GC, terminal dinucleotides and polypyrimidine tract, all strand-aware."""
    fa = pysam.FastaFile(str(fasta))
    have = set(fa.references)
    comp = str.maketrans('ACGTNacgtn', 'TGCANtgcan')
    rc = lambda s: s.translate(comp)[::-1]

    n = len(df)
    cols = {k: np.zeros(n, np.float32) for k in
            ('gc_intron', 'gc_up_exon', 'gc_dn_exon', 'ppt_frac', 'gc_5p', 'gc_3p')}
    d5 = np.empty(n, object)
    d3 = np.empty(n, object)

    for i, r in enumerate(df.itertuples(index=False)):
        if r.chrom not in have:
            d5[i] = d3[i] = 'NN'
            continue
        s0, e0 = r.istart - 1, r.iend
        seq = fa.fetch(r.chrom, s0, e0).upper()
        up = fa.fetch(r.chrom, max(0, s0 - FLANK), s0).upper()
        dn = fa.fetch(r.chrom, e0, e0 + FLANK).upper()
        if r.strand == '-':
            seq, up, dn = rc(seq), rc(dn), rc(up)
        ln = len(seq) or 1
        cols['gc_intron'][i] = (seq.count('G') + seq.count('C')) / ln
        cols['gc_up_exon'][i] = ((up.count('G') + up.count('C')) / len(up)) if up else 0.0
        cols['gc_dn_exon'][i] = ((dn.count('G') + dn.count('C')) / len(dn)) if dn else 0.0
        h5, h3 = seq[:FLANK], seq[-FLANK:]
        cols['gc_5p'][i] = (h5.count('G') + h5.count('C')) / (len(h5) or 1)
        cols['gc_3p'][i] = (h3.count('G') + h3.count('C')) / (len(h3) or 1)
        d5[i], d3[i] = seq[:2], seq[-2:]
        tract = seq[-PPT[1]:-PPT[0]] if len(seq) > PPT[1] else seq
        cols['ppt_frac'][i] = ((tract.count('C') + tract.count('T')) / len(tract)) if tract else 0.0
        if progress and i and i % progress == 0:
            print(f'  {i:,} introns', flush=True)

    for k, v in cols.items():
        df[k] = v
    df['donor_dinuc'] = d5
    df['acceptor_dinuc'] = d3
    df['canonical'] = ((df.donor_dinuc == 'GT') & (df.acceptor_dinuc == 'AG')).astype(int)
    return df


def add_derived(df):
    """The log transforms and ratios the model expects. Idempotent."""
    df = df.copy()
    df['intron_len'] = df.iend - df.istart + 1
    df['log_len'] = np.log10(df.intron_len.clip(lower=1))
    df['log_up_exon'] = np.log10(df.up_exon_len.clip(lower=1))
    df['log_dn_exon'] = np.log10(df.dn_exon_len.clip(lower=1))
    df['rel_position'] = df.intron_number / df.n_introns.clip(lower=1)
    return df


def build(gtf, fasta, genes=None, chroms=None, progress=0):
    """GTF + FASTA -> intron table with every non-splice-site feature."""
    ex = parse_gtf_exons(gtf, genes=genes, chroms=chroms)
    if ex.empty:
        raise SystemExit('no exons parsed -- check the GTF, and --gene if you used it')
    df = introns_from_exons(ex)
    df = add_sequence_features(df, fasta, progress=progress)
    return add_derived(df)
