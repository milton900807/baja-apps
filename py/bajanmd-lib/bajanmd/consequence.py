"""NMD consequence of every cassette-eligible exon of a gene.

THE RULE. A stop codon is read as premature, and the transcript degraded, when
it sits more than ~50 nt upstream of the last exon-exon junction, because the
exon junction complex deposited there is not displaced by the terminating
ribosome. So the question for any cassette exon is what the distance from stop
to last junction (DJ) becomes in each of its two isoforms.

    DJ(inclusion) > threshold, DJ(skipping) not   ->  NMD_in, a poison exon:
                                                      including it causes decay
    DJ(skipping) > threshold, DJ(inclusion) not   ->  NMD_ex, an essential exon:
                                                      skipping it causes decay
    both                                          ->  "both", no usable switch
    neither                                       ->  "none"

EVENTS COME FROM THE ANNOTATION, NOT A CATALOGUE. Every internal exon of every
transcript of the gene is a cassette candidate, with its two neighbours as the
flanks. Deriving them here means no precomputed event table ships with the app
and nothing goes stale against a GENCODE release.

PER TRANSCRIPT, ON PURPOSE. The same exon can be ordinary in one isoform and
frameshifting in another, because the reading frame it lands in differs. An
earlier version of this analysis picked one host transcript per exon and
reported its verdict as the exon's; checked against observed inclusion, the
exons it called poison turned out to sit at ~99% inclusion, which no real
poison exon can do, because the isoform carrying it would be the one destroyed.
Those were minority labels borrowed from a minor isoform. So every transcript
carrying the exon is evaluated and the result reports the agreement, with MANE
called out separately. A caller that wants one answer should use `mane_class`
and treat a split `frac` as the warning it is.
"""
from __future__ import annotations

import os
from collections import defaultdict

import pandas as pd

DJ_THRESHOLD = 50
CODON_STOP = {"TAA", "TAG", "TGA"}

REQUIRED_COLS = ["chrom", "start", "end", "strand", "transcript_id", "gene_name"]
OPTIONAL_COLS = ["mane", "basic"]


# --- annotation ---------------------------------------------------------------
def _read_annotation(path):
    """Read an annotation table only if it carries the columns needed.

    Returns None otherwise, so a file of the same name written by another part
    of the pipeline with a different schema is passed over rather than
    crashing or being overwritten.
    """
    if not os.path.exists(path):
        return None
    have = set(pd.read_csv(path, sep="\t", nrows=0).columns)
    if not set(REQUIRED_COLS) <= have:
        return None
    use = REQUIRED_COLS + [c for c in OPTIONAL_COLS if c in have]
    df = pd.read_csv(path, sep="\t", low_memory=False, usecols=use)
    for c in OPTIONAL_COLS:
        if c not in df.columns:
            df[c] = 0
    return df


def annotation_tables(which="current"):
    """(exon table, CDS table), parsed from the GTF on first use and cached.

    The coding start comes from the annotation's CDS records rather than being
    guessed from the first exon, because the frame is the whole question here.
    Existing tables are reused when their schema fits; otherwise a copy is
    parsed under an nmd_ prefix, so nothing already on disk is overwritten.
    """
    from bajasplice.config import paths

    gtf_key = "gencode_gtf" if which == "current" else "gencode_v29_gtf"
    suffix = "" if which == "current" else "_v29"
    out = {}
    for feature, stem in (("exon", f"exons{suffix}"), ("CDS", f"cds{suffix}")):
        df = _read_annotation(str(paths().interim / f"{stem}.tsv"))
        if df is None:
            own = paths().interim / f"nmd_{stem}.tsv"
            df = _read_annotation(str(own))
            if df is None:
                from bajasplice.prepare.gencode import parse_exons
                parse_exons(paths().require(gtf_key), out_tsv=own,
                            feature=feature)
                df = _read_annotation(str(own))
        out[feature] = df
    return out["exon"], out["CDS"]


# --- the rule ------------------------------------------------------------------
def transcript_chains(exons):
    """transcript_id -> (chrom, strand, [(start, end), ...] in transcript order)."""
    chains = {}
    for tid, g in exons.groupby("transcript_id", sort=False):
        st = g.strand.iloc[0]
        chains[tid] = (g.chrom.iloc[0], st,
                       sorted(zip(g.start, g.end), reverse=(st == "-")))
    return chains


def splice(g, chrom, strand, blocks):
    """Spliced mRNA sequence for exon blocks already in transcript order."""
    from bajasplice.genome import codes_to_str
    return "".join(codes_to_str(g.codes(chrom, int(s), int(e), strand))
                   for s, e in blocks)


def offset_of(blocks, strand, pos):
    """mRNA offset of a genomic position, or None if it is not in an exon."""
    off = 0
    for s, e in blocks:
        if s <= pos <= e:
            return off + (pos - s if strand == "+" else e - pos)
        off += e - s + 1
    return None


def first_stop(seq, start_off):
    """Offset just past the first in-frame stop codon, or None if none found."""
    for i in range(start_off, len(seq) - 2, 3):
        if seq[i:i + 3] in CODON_STOP:
            return i + 3
    return None


def dj_of(blocks, seq, start_off):
    """(distance from stop to last junction, stop offset).

    A single-exon isoform has no junction, so it is never an NMD substrate by
    this rule and returns (None, None).
    """
    if len(blocks) < 2:
        return None, None
    stop_end = first_stop(seq, start_off)
    if stop_end is None:
        return None, None
    last_len = blocks[-1][1] - blocks[-1][0] + 1
    return (len(seq) - last_len) - stop_end, stop_end


def classify(dj_skip, dj_incl, thr=DJ_THRESHOLD):
    in_skip = dj_skip is not None and dj_skip > thr
    in_incl = dj_incl is not None and dj_incl > thr
    if in_incl and not in_skip:
        return "NMD_in"
    if in_skip and not in_incl:
        return "NMD_ex"
    return "both" if in_incl else "none"


# --- per gene ------------------------------------------------------------------
def gene_exons(gene, dj=DJ_THRESHOLD, annotation="current", genome=None,
               exons=None, cds=None):
    """Every cassette-eligible exon of `gene`, with its NMD consequence.

    One row per distinct exon, aggregated over the transcripts that carry it:

        chrom, strand, a_start, a_end, exon_len, frame_preserving,
        n_tx          transcripts carrying the exon that could be evaluated
        nmd_class     the majority call across them
        frac          the fraction agreeing with it; below 1.0 means the
                      consequence depends on which isoform you ask about
        mane_class    the call in the MANE Select transcript, or None
        dj_skip, dj_incl   from the MANE transcript when there is one, else
                      the first transcript evaluated
        transcripts   per-transcript detail, for a caller that wants it

    Raises KeyError when the gene is not in the annotation, which is a
    different thing from a gene with no cassette exons (an empty list).
    """
    from bajasplice.genome import GenomeReader

    if exons is None or cds is None:
        exons, cds = annotation_tables(annotation)
    ex = exons[exons.gene_name == gene]
    if not len(ex):
        raise KeyError(f"{gene} is not in the {annotation} annotation")
    keep = set(ex.transcript_id)
    cd = cds[cds.transcript_id.isin(keep)]

    chains = transcript_chains(ex)
    cds_start = {}
    for tid, g in cd.groupby("transcript_id", sort=False):
        st = g.strand.iloc[0]
        cds_start[tid] = int(g.start.min()) if st == "+" else int(g.end.max())
    rank = ex.groupby("transcript_id").agg(mane=("mane", "max"),
                                           basic=("basic", "max"))
    g = genome or GenomeReader()

    per_exon = defaultdict(list)
    for tid, (chrom, strand, blocks) in chains.items():
        if tid not in cds_start or len(blocks) < 3:
            continue                      # no CDS, or no internal exon
        start_pos = cds_start[tid]
        for i in range(1, len(blocks) - 1):
            a_start, a_end = blocks[i]
            skip_b = blocks[:i] + blocks[i + 1:]
            incl_b = list(blocks)
            o_skip = offset_of(skip_b, strand, start_pos)
            o_incl = offset_of(incl_b, strand, start_pos)
            if o_skip is None or o_incl is None:
                continue                  # CDS start falls in the exon removed
            d_skip, _ = dj_of(skip_b, splice(g, chrom, strand, skip_b), o_skip)
            d_incl, _ = dj_of(incl_b, splice(g, chrom, strand, incl_b), o_incl)
            per_exon[(chrom, strand, int(a_start), int(a_end))].append({
                "transcript_id": tid,
                "mane": int(rank.mane.get(tid, 0)),
                "basic": int(rank.basic.get(tid, 0)),
                "dj_skip": d_skip, "dj_incl": d_incl,
                "nmd_class": classify(d_skip, d_incl, dj),
            })

    rows = []
    for (chrom, strand, a_start, a_end), hits in per_exon.items():
        counts = defaultdict(int)
        for h in hits:
            counts[h["nmd_class"]] += 1
        top = max(counts.items(), key=lambda kv: kv[1])
        mane_hits = [h for h in hits if h["mane"]]
        lead = mane_hits[0] if mane_hits else hits[0]
        rows.append({
            "gene_name": gene, "chrom": chrom, "strand": strand,
            "a_start": a_start, "a_end": a_end,
            "exon_len": a_end - a_start + 1,
            "frame_preserving": int((a_end - a_start + 1) % 3 == 0),
            "n_tx": len(hits),
            "nmd_class": top[0],
            "frac": round(top[1] / len(hits), 3),
            "mane_class": mane_hits[0]["nmd_class"] if mane_hits else None,
            "dj_skip": lead["dj_skip"], "dj_incl": lead["dj_incl"],
            "transcripts": hits,
        })
    rows.sort(key=lambda r: (r["chrom"], r["a_start"]))
    return rows
