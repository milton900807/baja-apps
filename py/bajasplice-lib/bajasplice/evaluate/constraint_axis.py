#!/usr/bin/env python
"""Are cryptic splice sites under purifying selection, or not?

The reading this program has arrived at is that TDP-43 masks splice sites that
selection has never filtered: the sites persist because they are never used,
not because they do anything. That is currently an INFERENCE from a frame
distribution. 64.2% of curated cryptic exons disrupt the reading frame, which
is the 2/3 expected if their lengths are random with respect to frame, while
annotated cassette exons sit at 58.4%. Random-with-respect-to-frame is what
unfiltered sequence looks like.

This module tests the same claim the direct way, by measuring selection on the
sequence instead of inferring it from frame statistics. A per-base
conservation track (phyloP, phastCons, or any bigWig of the same shape) says
how much substitution each position has tolerated across the alignment. If a
cryptic acceptor has been maintained by selection it carries signal; if it is
an accident of sequence that TDP-43 happens to hold shut, it reads as intron.

FOUR POPULATIONS, AND ONLY ONE OF THEM IS A MATCHED COMPARISON:

  cryptic     the cryptic acceptors themselves.

  decoy       unused AG dinucleotides in the SAME intron, far enough from any
              real splice site to be unused. This is the matched comparison
              and the primary contrast. Same intron means the same gene, the
              same local mutation rate, the same alignment depth and the same
              regional conservation, so a difference between cryptic and decoy
              is about the position and not about where it sits.

  intron      random positions in the same introns. The neutral floor, and a
              check that the decoys are not themselves special.

  annotated   real annotated acceptors in the same genes. A SCALE REFERENCE,
              NOT a matched comparison: annotated acceptors are by definition
              at exon boundaries, conservation decays with distance from an
              exon, and cryptic acceptors sit deep in introns. Reading
              cryptic-below-annotated as evidence of anything would be reading
              that decay. It is printed because it says what constraint looks
              like in these genes, which is the only way to judge whether the
              cryptic number is small.

DECOYS ARE MATCHED TO THE EVENT'S OWN ORIENTATION CLASS, AND BALANCING THEM IS
A MISTAKE THAT LOOKS LIKE A FIX. A decoy read as "an AG in transcript
orientation" is a forward-strand AG on a plus-strand gene and a forward-strand
CT on a minus-strand one, and those two populations do not score alike: forward
AG sits about 0.11 above forward CT in intronic sequence. That difference is a
property of the track.

It cancels, because the event and its decoys are always in the same class. A
plus-strand acceptor is a forward AG compared against forward AGs; a
minus-strand acceptor is a forward CT compared against forward CTs. The
negative control is the proof and the only valid orientation test here: random
transcript AGs give -0.006 on the plus strand and +0.006 on the minus, with a
within-intron percentile of exactly 0.500 on each. A matched background that
carried an orientation bias could not do that.

Taking both orientations instead, which --decoy-orientation both does, makes
half the background the wrong class for the event and shifts each strand by
half of 0.11 in opposite directions. On the compendium that moved plus from
+0.009 to +0.068 and minus from +0.160 to +0.093: the two strands land on the
average of themselves and appear to agree. The agreement is arithmetic, not
evidence, so it is not the default.

THE MIRROR TEST BREAKS THE MATCHING RATHER THAN TESTING FOR BIAS, which is
worth knowing before reading its output. Flipping the strand label leaves the
event on its original base while the decoys change class, so the mirror
measures the 0.11 gap between classes. It does not show that an unmirrored run
is biased. Use it to measure that gap; use the negative control to ask whether
the comparison is fair.

ORIENTATION IS IRREDUCIBLE IN ONE PLACE AND NOWHERE ELSE. A 3' splice site is
defined relative to the direction of transcription, so finding the acceptor
must know the strand: it is j2-1 on the plus strand and j1+1 on the minus, the
pyrimidine tract is upstream in transcript terms, and "an AG" means an AG read
in transcript orientation, which on a minus-strand gene is CT on the reference.
None of that is a convention; it is what the feature is.

Everything after that is strand-internal. Each acceptor is compared only to
decoys found with the same convention in the same intron, so a plus-strand
gene gives forward-AG against forward-AG and a minus-strand gene gives
forward-CT against forward-CT. Strand cancels inside every pair, which is why
the negative control returns -0.006 and +0.006 on the two strands and a
within-intron percentile of exactly 0.500 on each.

--mirror-strand tests the claim rather than asserting it. The strand label is
flipped AFTER the acceptor is derived, so the event sits on the identical
genomic base in the identical interval and only the reading turns around: the
window mirrors and the decoys become the opposite dinucleotide. Run it with a
symmetric --span and the window stops moving as well, leaving decoy
orientation as the only variable. A contrast that does not change under the
mirror has no orientation dependence left to find.

AND A NEGATIVE CONTROL, WHICH IS THE ONE THAT CALIBRATES THE TAIL. Pass
--null-events and every event keeps its gene, strand and intron but its
acceptor is moved to a randomly chosen eligible AG in that same intron. The
analysis is then identical except that the position called "the event" is
certainly not a splice site. Every number must come back at chance: the paired
contrast at zero, and the tail counts at 25%, 10%, 5% and 1%.

This is what the positive control cannot tell you. A positive control shows
the pipeline finds signal where signal exists; it says nothing about what the
pipeline reports where there is none, and the tail statistic in particular
assumes the event acceptor is exchangeable with its own decoys. It is not
obviously exchangeable: the event sits at the end of the searched interval
while decoys are sampled across it and held 50 nt clear of both the event and
any annotated exon. If that asymmetry alone produces a tail, the tail is an
artifact of position and nothing else, and the only way to find out is to run
the whole thing on positions that cannot be anything.

THERE IS A POSITIVE CONTROL FOR THE WHOLE PIPELINE, AND IT IS WORTH RUNNING
BEFORE BELIEVING ANY RESULT. Pass --control-events N and the cryptic events are
replaced by N annotated acceptors drawn from the same genes, run through the
same decoy search, the same windows and the same contrasts. The answer is known
in advance: a real acceptor beats arbitrary AGs in its own intron by a lot, and
it does so by the same amount on both strands, because strand is not a property
of either the splice site or the track. Anything else is the pipeline, not the
biology, and the size of the gap between the strands is the size of the bias.

This is the control that separates "the cryptic events on one strand are
unusual" from "the measurement treats the strands differently", and no amount
of re-examining the cryptic numbers can tell those apart.

EVERY CONTRAST IS RUN ON EACH STRAND SEPARATELY, AND A DISAGREEMENT KILLS THE
POOLED ANSWER. A per-base conservation track has no strand. Any finding that
appears on one strand and not the other is therefore a property of the
measurement, not of the biology, however clean the pooled statistics look.
This is not hypothetical here. The pooled primary contrast came out at +0.064,
p 0.02, with a tail of 29 events beating their own decoys' 95th percentile
against 5% expected, p 3e-06. Split by strand, the plus strand gave -0.051,
p 0.31, and a tail at 8.0% against 5% expected, p 0.11, while the minus strand
gave +0.214, p 2e-05, and a tail at 17.9%, p 7e-07. The pooled number was the
average of a null and an artifact, and the "conserved minority" was 20 minus
and 9 plus.

The artifact itself needs both an asymmetric window and an AG at the position:
the strand-symmetric flank shows none of it, random intronic positions show
none of it, and it does not fade with distance from the nearest exon, which
rules out a conservation gradient. The remaining candidate is local sequence
context, since the -20 to +3 window reads a pyrimidine tract on the forward
genome for a plus-strand gene and its purine-rich complement for a minus-strand
one, and substitution-rate estimates depend on context. Whatever the cause, the
discipline is the same: report both strands, and when they disagree, report
that and nothing else.

THE DERIVED ACCEPTOR IS CHECKED AGAINST THE GENOME, PER STRAND. An events
table says where an exon is, not where its acceptor is, and the two differ by
a base in opposite directions on the two strands. If the table is 0-based and
this code reads it as 1-based, or the reverse, the error lands one base inside
the exon on one strand and one base inside the intron on the other. Exons are
conserved and introns are not, so the result is a strand asymmetry in a
strandless track: positions on one strand look systematically more conserved,
and the events that reach any conservation threshold are drawn from that
strand. Nothing else in the module would notice, because the decoys are found
by reading sequence rather than by arithmetic on a table and so are immune.

The check is the splice site itself. A 3' acceptor ends in AG in transcript
orientation, so the two bases at offsets -1 and 0 are read from the genome for
every event and the rate is reported for each strand separately. Canonical
acceptors run above 95%. A rate near chance on one strand means that strand's
coordinates are off, and the offset scan says by how much. The offset
calibration on the conservation track is likewise reported per strand, because
a pooled scan can peak at zero while each strand is shifted the other way.

BOTH SIDES OF A PAIR MUST LIVE IN THE SAME SEQUENCE SPACE. Decoys and
random positions are held clear of every annotated exon boundary, so the
cryptic acceptor has to clear it too or the contrast is rigged. This matters
more than it sounds: about a quarter of the acceptors in a cryptic compendium
turn out to BE annotated exon boundaries, because the annotation has caught up
with the literature or because the locus carries a lowly supported transcript
through the same site. Those positions are conserved, they are supposed to be,
and they are not the unfiltered sequence the claim is about. They are reported
as their own contrast and kept out of the primary. The exclusion is built from
every gene's exons rather than the host gene's, since genes overlap and a
neighbour's exon lifts a window just as well as the host's.

THE POSITIVE CONTROL IS A GATE, NOT A COURTESY. If annotated acceptors do not
score above random intron, then the track, the coordinates or the strand
handling is wrong, and every other number here is measuring the wrong
sequence. That has happened in this program before: a window built from an
intronic span put every scan 5.6 kb from the acceptor it claimed to measure
and returned six confident nulls. So the control runs first, and a failed
control suppresses the verdict instead of decorating it.

The same goes for the offset. A conservation bigWig is 0-based half-open and
the annotation here is 1-based inclusive, so a one-base error is easy and
would not be visible in a 24-base window while ruining a 2-base one. The
calibration scan shifts the AG window across annotated acceptors and reports
which shift maximizes conservation. The answer should be zero.

A SHIFT AND A TAIL ARE DIFFERENT CLAIMS. A paired median answers "are cryptic
acceptors conserved", which is the wrong question if most are not and a few
are. So each cryptic acceptor is also ranked inside its own intron's decoy
distribution, and the excess over chance is counted at several thresholds. A
median barely off 0.5 next to a sevenfold excess above the 99th percentile
says most of these positions are unremarkable and a minority sit on conserved
sequence, which neither the median nor a significance test on it would tell
you.

CONSERVED AND CONSERVED AS A SPLICE SITE ARE ALSO DIFFERENT CLAIMS. A real 3'
splice site is conserved at the AG and the tract and not especially in the
surrounding intron, so it shows as a peak. Sequence that is conserved for some
other reason, an exon of a transcript the annotation lacks, an overlapping
non-coding RNA, a regulatory element, shows as a plateau that happens to
contain an AG. The two are told apart by scoring a flank on either side of the
site and subtracting: annotated acceptors set the scale for what a real peak
looks like, and a tail event with no peak above its own flank is conserved for
something other than splicing.

A NULL HERE IS A RESULT, SO IT IS REPORTED AS ONE. "No difference" is only
worth printing next to the difference the data could have seen, so the paired
contrast carries a bootstrap interval and the verdict states the effect the
interval excludes. An underpowered null and a real null look identical until
someone writes down that number.

STRENGTH MATCHING, BECAUSE THE DECOYS ARE NOT INNOCENT. A cryptic acceptor was
found because TDP-43 depletion made it fire, so it is a better splice site than
an arbitrary AG: a real pyrimidine tract, a usable branch point. If splice-
site-like sequence carries any conservation of its own, whatever the exon does,
cryptic would beat decoy with no selection on the exon at all. A UG element is
the obvious way for that to happen, since TDP-43's own binding site sits
exactly there and could well be conserved for reasons that have nothing to do
with the exon downstream of it. So every candidate is also scored with a 3'
splice-site PWM, and the contrast is repeated against only those decoys of
comparable strength. A positive result has to survive both.

WHAT WOULD FALSIFY THE READING: cryptic acceptors scoring above matched decoys
in the same introns, in both the unmatched and the strength-matched contrast. That would mean something has been maintaining these
positions, and masked-but-unfiltered would be the wrong description. The
secondary split by fate is where to look first: if the in-frame subset carries
constraint the frame-disrupting subset lacks, then the exons that can make
protein are not accidents, whatever the pooled number says.
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

from bajasplice.evaluate.buffer_test import bh
from bajasplice.evaluate.motif_background import parse_junction

# Transcript-oriented offsets from the acceptor. Offset 0 is the acceptor
# itself, the last intron base, the G of the AG. Negative is further into the
# intron, positive is into the exon.
AG_SPAN = (-1, 0)
SS_SPAN = (-20, 3)
# A decoy must be this far from any annotated exon boundary and from the
# cryptic acceptor, so that exon-proximal conservation is not what is measured.
EXCLUDE = 50
RANDOM_PER_INTRON = 10
MAX_DECOY_PER_INTRON = 40
# Width of the window scored by the 3'SS PWM, in transcript offsets, and how
# far a decoy's score may sit from the cryptic site's to count as comparable.
PWM_SPAN = (-20, 2)
STRENGTH_TOL = 4.0
PWM_SAMPLE = 20000
# The flank used to tell a conserved splice site from a conserved element:
# FLANK_INNER nt on each side of the acceptor are skipped so the site itself is
# not counted, and FLANK_OUTER nt beyond that are averaged.
FLANK_INNER, FLANK_OUTER = 60, 260
# Dinucleotides that qualify as a decoy, in transcript orientation. AG alone:
# a decoy should be acceptor-like in the gene's own orientation, which is what
# makes it a matched background for an acceptor.
DECOY_UNITS = ("AG",)
# Both classes, for --decoy-orientation both. Orientation-free, but half of it
# is the wrong class for the event; see the module docstring.
DECOY_UNITS_BOTH = ("AG", "CT")
# Thresholds for the within-intron excess count. Each is a percentile of the
# event's own decoy distribution, so the null rate is 100 minus it.
TAIL_PCTS = (75, 90, 95, 99)


# --- coordinates --------------------------------------------------------------
def genomic_pos(acceptor, strand, offset):
    """Genomic coordinate of a transcript-oriented offset from the acceptor."""
    return int(acceptor) + int(offset) if strand == "+" else int(acceptor) - int(offset)


def genomic_span(acceptor, strand, lo, hi):
    """(start, end), 1-based inclusive and sorted, for offsets lo..hi.

    On the minus strand transcript-upstream runs toward HIGHER coordinates, so
    the pair comes back swapped and has to be ordered before it is used as an
    interval. Returning it unsorted is how a window ends up over the exon.
    """
    a = genomic_pos(acceptor, strand, lo)
    b = genomic_pos(acceptor, strand, hi)
    return (min(a, b), max(a, b))


def acceptor_from_junction(j1, j2, strand):
    """The acceptor of a junction: the last intron base, not the exon base."""
    return int(j2) - 1 if strand == "+" else int(j1) + 1


def acceptor_from_exon(a_start, a_end, strand):
    """The acceptor of a cryptic exon given its own span."""
    return int(a_start) - 1 if strand == "+" else int(a_end) + 1


def intron_of(j1, j2):
    """The intron body of a junction, 1-based inclusive, excluding both exons."""
    lo, hi = sorted((int(j1), int(j2)))
    return (lo + 1, hi - 1)


# --- the conservation track ---------------------------------------------------
class Scores:
    """Per-base conservation, from a bigWig or from a plain table.

    The table form takes `chrom<TAB>pos<TAB>score` with 1-based positions and
    exists for two reasons: the tests need a track without a 6 GB download,
    and pyBigWig does not install everywhere. Both forms answer in 1-based
    inclusive coordinates, converting to the bigWig's 0-based half-open
    internally, which is the only place that conversion appears.
    """

    def __init__(self, path):
        self.path = path
        self._bw = None
        self._tab = None
        if str(path).lower().endswith((".bw", ".bigwig")):
            try:
                import pyBigWig
            except ImportError:
                raise SystemExit(
                    "reading a bigWig needs pyBigWig: pip install pyBigWig\n"
                    "or pass a plain chrom/pos/score table instead of "
                    f"{os.path.basename(str(path))}")
            self._bw = pyBigWig.open(str(path))
            self.chroms = set(self._bw.chroms())
        else:
            t = pd.read_csv(path, sep="\t")
            need = {"chrom", "pos", "score"}
            if not need <= set(t.columns):
                raise SystemExit(f"{path}: a score table needs columns "
                                 f"{sorted(need)}, found {list(t.columns)}")
            self._tab = {}
            for c, g in t.groupby("chrom"):
                self._tab[str(c)] = dict(zip(g["pos"].astype(int),
                                             g["score"].astype(float)))
            self.chroms = set(self._tab)

    def values(self, chrom, start, end):
        """Scores for 1-based inclusive [start, end], NaN where the track has none."""
        start, end = int(start), int(end)
        if end < start:
            return np.array([])
        if str(chrom) not in self.chroms:
            return np.full(end - start + 1, np.nan)
        if self._bw is not None:
            size = self._bw.chroms()[str(chrom)]
            lo, hi = max(start - 1, 0), min(end, size)
            if hi <= lo:
                return np.full(end - start + 1, np.nan)
            v = np.array(self._bw.values(str(chrom), lo, hi), dtype=float)
            pad = (end - start + 1) - len(v)
            if pad > 0:
                v = np.concatenate([v, np.full(pad, np.nan)])
            return v
        d = self._tab[str(chrom)]
        return np.array([d.get(p, np.nan) for p in range(start, end + 1)])

    def mean(self, chrom, start, end):
        """Mean score over a window, or NaN if the track covers none of it."""
        v = self.values(chrom, start, end)
        if len(v) == 0 or np.all(np.isnan(v)):
            return np.nan
        return float(np.nanmean(v))

    def covered(self, chrom, start, end):
        """Fraction of the window the track actually scores."""
        v = self.values(chrom, start, end)
        if len(v) == 0:
            return 0.0
        return float(np.mean(~np.isnan(v)))


# --- events -------------------------------------------------------------------
def apply_requires(df, requires):
    """Keep rows matching every COL=VALUE, comparing as lower-case strings.

    A real events table carries rows that are not events: a compendium lists
    one row per dataset comparison and flags which junctions are cryptic at
    all. Filtering has to happen before the acceptors are derived, or the
    coordinate check and every count below are computed over the wrong set.
    """
    for spec in requires or []:
        if "=" not in spec:
            raise SystemExit(f"--require wants COL=VALUE, got {spec!r}")
        col, want = spec.split("=", 1)
        col, want = col.strip(), want.strip().lower()
        if col not in df.columns:
            raise SystemExit(f"--require {spec}: no column {col!r}; "
                             f"columns are {list(df.columns)}")
        keep = df[col].astype(str).str.strip().str.lower() == want
        if not keep.any():
            vals = sorted(set(df[col].astype(str).str.strip()))[:8]
            raise SystemExit(f"--require {spec}: nothing matches; {col!r} "
                             f"holds {vals}")
        df = df[keep]
    return df


def read_events(path, gene_col=None, requires=None):
    """Cryptic events with an acceptor, an intron and a host gene.

    Accepts either an exon table (chrom/a_start/a_end/strand) or a junction
    table (a junction column plus strand). A junction gives the acceptor and
    the whole intron exactly; an exon span gives the acceptor exactly and the
    intron only as far as its own edge, so the junction form is preferred when
    both are present.
    """
    sep = "," if str(path).endswith(".csv") else "\t"
    df = pd.read_csv(path, sep=sep, low_memory=False)
    df = apply_requires(df, requires)
    if "strand" not in df.columns:
        raise SystemExit(f"{path}: need a strand column; the acceptor is at "
                         "the opposite end of the exon on each strand and "
                         "guessing it would score the donor")
    gcol = gene_col or next(
        (c for c in df.columns
         if str(c).lower() in ("gene", "gene_name", "symbol", "host", "host_gene")),
        None)
    if gcol is None:
        raise SystemExit(f"{path}: need a gene column, found {list(df.columns)}")

    jcol = next((c for c in df.columns
                 if "junction" in str(c).lower() or "paste_into_igv" in str(c).lower()),
                None)
    rows = []
    for _, r in df.iterrows():
        st = str(r["strand"]).strip()
        if st not in ("+", "-"):
            continue
        chrom = acc = i_lo = i_hi = None
        if jcol is not None and pd.notna(r.get(jcol)):
            p = parse_junction(r[jcol])
            if p is not None:
                chrom, j1, j2 = p
                acc = acceptor_from_junction(j1, j2, st)
                i_lo, i_hi = intron_of(j1, j2)
        if acc is None and {"chrom", "a_start", "a_end"} <= set(df.columns) \
                and pd.notna(r.get("a_start")) and pd.notna(r.get("a_end")):
            chrom = str(r["chrom"])
            acc = acceptor_from_exon(r["a_start"], r["a_end"], st)
            # No junction, so the intron is only known on the acceptor side.
            i_lo, i_hi = ((acc - 5000, acc) if st == "+" else (acc, acc + 5000))
        if acc is None:
            continue
        row = {"gene": str(r[gcol]).strip().upper(), "chrom": str(chrom),
               "strand": st, "acceptor": int(acc),
               "intron_start": int(i_lo), "intron_end": int(i_hi)}
        for extra in ("fate", "supported", "n_datasets", "tier"):
            if extra in df.columns:
                row[extra] = r[extra]
        rows.append(row)
    return pd.DataFrame(rows).drop_duplicates(
        subset=["chrom", "acceptor", "strand"]).reset_index(drop=True)


# --- the annotation -----------------------------------------------------------
def control_events(exons, genes, n=300, upstream=5000, seed=0):
    """Annotated acceptors dressed up as events, for a positive control.

    Same shape as read_events returns, so the rest of the pipeline cannot
    tell the difference: each acceptor gets the same fixed upstream window to
    search for decoys in, and the contrast that follows should come out large
    and equal on both strands. Sampling is balanced across strands so a
    per-strand comparison is not decided by whichever strand happened to
    supply more positions.
    """
    ann = annotated_acceptors(exons, genes)
    if not len(ann):
        return pd.DataFrame()
    rng = np.random.default_rng(seed)
    parts = []
    for st in ("+", "-"):
        sub = ann[ann["strand"] == st]
        if not len(sub):
            continue
        take = min(len(sub), max(n // 2, 1))
        parts.append(sub.iloc[rng.choice(len(sub), size=take, replace=False)])
    if not parts:
        return pd.DataFrame()
    pick = pd.concat(parts, ignore_index=True)
    rows = []
    for _, r in pick.iterrows():
        a, st = int(r["pos"]), str(r["strand"])
        lo, hi = ((a - upstream, a) if st == "+" else (a, a + upstream))
        rows.append({"gene": str(r["gene"]), "chrom": str(r["chrom"]),
                     "strand": st, "acceptor": a,
                     "intron_start": int(lo), "intron_end": int(hi)})
    return pd.DataFrame(rows)


def null_events(events, exons, genome, n=0, exclude=EXCLUDE, seed=0,
                max_intron=200000, units=DECOY_UNITS):
    """The same events with each acceptor moved to a random AG in its intron.

    A negative control. Gene, chromosome, strand and the searched interval are
    all preserved, so the only thing that changes is which AG carries the
    label "event". Nothing about such a position is a splice site, so every
    contrast and every tail count must come back at chance. Anything else is
    the analysis reporting structure that is not there.

    Events whose intron offers no eligible AG are dropped rather than left at
    their real acceptor, which would quietly mix real sites into the null.
    """
    rng = np.random.default_rng(seed)
    bounds = chrom_exon_bounds(exons)
    pool = events
    if n and n < len(pool):
        pool = pool.iloc[rng.choice(len(pool), size=n, replace=False)]
    rows = []
    for _, ev in pool.iterrows():
        lo, hi = int(ev["intron_start"]), int(ev["intron_end"])
        if hi - lo > max_intron:
            if ev["strand"] == "+":
                lo = max(lo, int(ev["acceptor"]) - max_intron)
            else:
                hi = min(hi, int(ev["acceptor"]) + max_intron)
        if hi <= lo:
            continue
        gb = bounds.get(str(ev["chrom"]), np.array([], dtype=np.int64))
        seq = genome.sequence(ev["chrom"], lo, hi, ev["strand"])
        cand = [p for p in ag_positions(seq, lo, hi, ev["strand"], units=units)
                if abs(p - int(ev["acceptor"])) > exclude
                and nearest_boundary(p, gb) > exclude]
        if not cand:
            continue
        row = dict(ev)
        row["acceptor"] = int(cand[rng.integers(0, len(cand))])
        rows.append(row)
    return pd.DataFrame(rows).reset_index(drop=True)


def gene_exon_bounds(exons, genes):
    """gene -> (chrom, strand, sorted array of every annotated exon boundary).

    Boundaries, not acceptors: conservation rises near any exon edge, so a
    decoy has to be clear of donors too.
    """
    sub = exons[exons["gene_name"].str.upper().isin(set(genes))]
    out = {}
    for gene, g in sub.groupby(sub["gene_name"].str.upper(), sort=False):
        pos = np.sort(np.concatenate([g["start"].to_numpy(dtype=np.int64),
                                      g["end"].to_numpy(dtype=np.int64)]))
        out[gene] = (str(g["chrom"].iloc[0]), str(g["strand"].iloc[0]),
                     np.unique(pos))
    return out


def chrom_exon_bounds(exons):
    """chrom -> sorted array of every annotated exon boundary, ALL genes.

    Not just the host gene's. Genes overlap, and an exon belonging to
    something else in the same locus is just as conserved and just as capable
    of lifting a window that is supposed to be measuring intron. Scoping the
    exclusion to the host gene left those in, which is the likeliest source of
    any residual difference between cryptic acceptors and their decoys.
    """
    out = {}
    for chrom, g in exons.groupby(exons["chrom"].astype(str), sort=False):
        pos = np.concatenate([g["start"].to_numpy(dtype=np.int64),
                              g["end"].to_numpy(dtype=np.int64)])
        out[str(chrom)] = np.unique(pos)
    return out


def annotated_acceptors(exons, genes):
    """Every annotated acceptor in these genes, deduplicated.

    An acceptor is the intron base before the exon, so it is start-1 on the
    plus strand and end+1 on the minus.

    THE FIRST EXON OF A TRANSCRIPT HAS NO ACCEPTOR, and dropping it is not a
    detail. Its start-1 is promoter sequence, which is conserved for reasons
    of its own and is not a splice site, so leaving those positions in both
    dilutes the reference population every other number is scaled against and
    puts a floor of about 30% non-AG positions under any check of this
    module's arithmetic. Transcript order decides which exon that is, so the
    5'-most exon is the one with the smallest start on the plus strand and the
    largest end on the minus.
    """
    sub = exons[exons["gene_name"].str.upper().isin(set(genes))]
    if not len(sub):
        return pd.DataFrame(columns=["gene", "chrom", "strand", "pos"])
    rows = []
    for _, g in sub.groupby("transcript_id", sort=False):
        st = str(g["strand"].iloc[0])
        # Drop the transcript's 5'-most exon: it is preceded by a promoter,
        # not by an intron.
        g = g.sort_values("start" if st == "+" else "end",
                          ascending=(st == "+")).iloc[1:]
        for _, r in g.iterrows():
            acc = int(r["start"]) - 1 if st == "+" else int(r["end"]) + 1
            rows.append({"gene": str(r["gene_name"]).upper(),
                         "chrom": str(r["chrom"]), "strand": st, "pos": acc})
    if not rows:
        return pd.DataFrame(columns=["gene", "chrom", "strand", "pos"])
    return pd.DataFrame(rows).drop_duplicates(
        subset=["chrom", "pos", "strand"]).reset_index(drop=True)


def nearest_boundary(pos, bounds):
    """Distance in nt from a position to the closest annotated exon boundary."""
    if bounds is None or len(bounds) == 0:
        return np.inf
    i = int(np.searchsorted(bounds, pos))
    cand = []
    if i < len(bounds):
        cand.append(abs(int(bounds[i]) - pos))
    if i > 0:
        cand.append(abs(pos - int(bounds[i - 1])))
    return min(cand) if cand else np.inf


# --- decoys and the neutral floor ---------------------------------------------
def ag_positions(seq, lo, hi, strand, units=DECOY_UNITS):
    """Genomic positions of the second base of each unit in `seq`.

    `seq` is what GenomeReader returns for [lo, hi] on `strand`, so index 0 is
    `lo` on the plus strand and `hi` on the minus. Mapping the index back with
    the wrong sign puts every decoy at the far end of the intron, which is the
    same error as reading the donor instead of the acceptor.

    `units` defaults to AG alone, so a decoy is acceptor-like in the gene's own
    orientation and therefore in the same class as the acceptor it backs. That
    is what makes the roughly 0.11 difference between forward AG and forward CT
    cancel. Passing ("AG", "CT") gives an orientation-free set at the cost of
    making half of it the wrong class for the event; the module docstring has
    the numbers.
    """
    s = str(seq).upper()
    want = tuple(u.upper() for u in units)
    out = []
    for i in range(len(s) - 1):
        if s[i:i + 2] in want:
            j = i + 1
            out.append(int(lo) + j if strand == "+" else int(hi) - j)
    return out


def pick_decoys(positions, acceptor, bounds, exclude=EXCLUDE, cap=MAX_DECOY_PER_INTRON,
                rng=None):
    """Unused AGs in this intron: clear of the cryptic site and of real exons.

    Capped per intron and sampled without replacement, so a 100 kb intron does
    not supply half the comparison population on its own.
    """
    keep = [p for p in positions
            if abs(p - int(acceptor)) > exclude
            and nearest_boundary(p, bounds) > exclude]
    if cap and len(keep) > cap:
        rng = rng or np.random.default_rng(0)
        idx = rng.choice(len(keep), size=cap, replace=False)
        keep = [keep[i] for i in sorted(idx)]
    return keep


def random_positions(intron_start, intron_end, acceptor, bounds, n=RANDOM_PER_INTRON,
                     exclude=EXCLUDE, rng=None):
    """Uniform positions in the intron, clear of the same things decoys are."""
    rng = rng or np.random.default_rng(0)
    lo, hi = int(intron_start), int(intron_end)
    if hi <= lo:
        return []
    out, tries = [], 0
    while len(out) < n and tries < 40 * max(n, 1):
        tries += 1
        p = int(rng.integers(lo, hi + 1))
        if abs(p - int(acceptor)) <= exclude:
            continue
        if nearest_boundary(p, bounds) <= exclude:
            continue
        out.append(p)
    return out


# --- splice-site strength -----------------------------------------------------
def site_sequence(genome, chrom, acceptor, strand, span=PWM_SPAN):
    """The splice-site window around an acceptor, in transcript orientation."""
    lo, hi = genomic_span(acceptor, strand, span[0], span[1])
    return genome.sequence(str(chrom), lo, hi, strand)


def acceptor_pwm(genome, annotated, span=PWM_SPAN, sample=PWM_SAMPLE, seed=0):
    """A 3'SS PWM fitted on annotated acceptors in these same genes.

    Fitted here rather than imported so the matrix comes from the same
    coordinate convention and the same strand handling as everything else in
    this module. A matrix fitted elsewhere and scored here would hide exactly
    the off-by-one the calibration scan exists to catch.
    """
    from bajasplice.evaluate.threshold_drivers import fit_pwm
    rows = annotated if isinstance(annotated, list) else annotated.to_dict("records")
    if len(rows) > sample:
        rng = np.random.default_rng(seed)
        idx = rng.choice(len(rows), size=sample, replace=False)
        rows = [rows[i] for i in idx]
    seqs = [site_sequence(genome, r["chrom"], r["pos"], r["strand"], span)
            for r in rows]
    seqs = [x for x in seqs if x and len(x) == span[1] - span[0] + 1]
    if len(seqs) < 50:
        return None
    return fit_pwm(seqs)


def strength_of(genome, pwm, chrom, acceptor, strand, span=PWM_SPAN):
    """PWM score of one acceptor, or NaN when the window is unreadable."""
    from bajasplice.evaluate.threshold_drivers import score_pwm
    if pwm is None:
        return np.nan
    return score_pwm(pwm, site_sequence(genome, chrom, acceptor, strand, span))


def matched_decoys(rows, cryptic_strength, tol=STRENGTH_TOL):
    """Decoy rows whose splice site scores within `tol` of the cryptic one's."""
    if not np.isfinite(cryptic_strength):
        return []
    return [r for r in rows
            if np.isfinite(r.get("strength", np.nan))
            and abs(r["strength"] - cryptic_strength) <= tol]


# --- scoring ------------------------------------------------------------------
def score_rows(scores, rows, span, shift=0):
    """Mean conservation over `span` for each (chrom, pos, strand) row."""
    vals, cov = [], []
    for r in rows:
        acc = int(r["pos"]) + shift if r["strand"] == "+" else int(r["pos"]) - shift
        s, e = genomic_span(acc, r["strand"], span[0], span[1])
        vals.append(scores.mean(r["chrom"], s, e))
        cov.append(scores.covered(r["chrom"], s, e))
    return np.array(vals, dtype=float), np.array(cov, dtype=float)


def flank_spans(acceptor, strand, inner=FLANK_INNER, outer=FLANK_OUTER):
    """The two genomic intervals flanking a site, with the site itself cut out.

    Strand does not matter to the answer, since both sides are taken and the
    track is strandless, but it is threaded through anyway so the offsets mean
    the same thing here as everywhere else in this module.
    """
    a = int(acceptor)
    lo_in, hi_in = genomic_span(a, strand, -inner, inner)
    lo_out, hi_out = genomic_span(a, strand, -outer, outer)
    return [(lo_out, lo_in - 1), (hi_in + 1, hi_out)]


def score_flank(scores, chrom, acceptor, strand, inner=FLANK_INNER,
                outer=FLANK_OUTER):
    """Mean conservation of the sequence around a site, excluding the site."""
    vals = []
    for lo, hi in flank_spans(acceptor, strand, inner, outer):
        v = scores.values(str(chrom), lo, hi)
        if len(v):
            vals.append(v)
    if not vals:
        return np.nan
    v = np.concatenate(vals)
    if np.all(np.isnan(v)):
        return np.nan
    return float(np.nanmean(v))


def acceptor_dinucleotide(genome, chrom, acceptor, strand):
    """The two bases at offsets -1 and 0, transcript orientation.

    A real 3' splice site reads AG here. Anything else and either the event
    is not an acceptor or the coordinate is wrong.
    """
    lo, hi = genomic_span(acceptor, strand, -1, 0)
    seq = genome.sequence(str(chrom), lo, hi, strand)
    return str(seq).upper().replace("U", "T")


def ag_rate(genome, rows, shift=0):
    """Fraction of positions reading AG, and the count, at a given shift."""
    ok = n = 0
    for r in rows:
        a = (int(r["pos"]) + shift if r["strand"] == "+"
             else int(r["pos"]) - shift)
        d = acceptor_dinucleotide(genome, r["chrom"], a, r["strand"])
        if len(d) != 2:
            continue
        n += 1
        ok += int(d == "AG")
    return (ok / n if n else np.nan), ok, n


def coordinate_check(genome, events, shifts=(-2, -1, 0, 1, 2)):
    """Per-strand AG rate across candidate shifts, to catch a base-off table.

    Reported per strand because the error this catches is antisymmetric: a
    0-based table read as 1-based moves the window into the exon on one
    strand and into the intron on the other, so a pooled rate hides it.
    """
    rows = []
    for strand in ("+", "-"):
        sub = [{"chrom": r["chrom"], "pos": r["acceptor"], "strand": strand}
               for _, r in events.iterrows() if r["strand"] == strand]
        if not sub:
            continue
        for sh in shifts:
            rate, ok, n = ag_rate(genome, sub, shift=sh)
            rows.append({"strand": strand, "shift": sh, "AG": ok, "n": n,
                         "rate": rate})
    return pd.DataFrame(rows)


def _coordinate_note(check, floor=0.80):
    """What the per-strand AG table means, in one or two sentences."""
    if check is None or not len(check):
        return None
    out = []
    for strand in ("+", "-"):
        sub = check[check["strand"] == strand]
        if not len(sub) or sub["rate"].isna().all():
            continue
        at0 = sub.loc[sub["shift"] == 0, "rate"]
        best = sub.loc[sub["rate"].idxmax()]
        r0 = float(at0.iloc[0]) if len(at0) else np.nan
        if np.isfinite(r0) and r0 >= floor:
            continue
        out.append(
            f"strand {strand}: only {100 * r0:.0f}% of acceptors read AG as "
            f"derived, best at shift {int(best['shift']):+d} with "
            f"{100 * best['rate']:.0f}%")
    if not out:
        return None
    return ("COORDINATES ARE OFF: " + "; ".join(out) + ". The events table's "
            "convention does not match how it is being read. Fix that before "
            "reading anything below: a one-base shift lands inside the exon "
            "on one strand and inside the intron on the other, which makes "
            "that strand's positions look conserved and fills any "
            "conservation threshold with events from it.")


def within_intron_pctile(cryptic, decoys, pcts=TAIL_PCTS, min_decoy=20):
    """Where a cryptic score sits in its own intron's decoy distribution.

    Returns (percentile, {pct: above?}). Ranking inside the intron is what
    makes this comparable across genes: an absolute phyloP of zero is top
    decile in a dead intron and bottom quartile in a conserved one.
    """
    d = np.asarray([x for x in decoys if not np.isnan(x)], dtype=float)
    if np.isnan(cryptic) or len(d) < min_decoy:
        return np.nan, {p: None for p in pcts}
    return (float((d < cryptic).mean()),
            {p: bool(cryptic > np.percentile(d, p)) for p in pcts})


def by_strand(per_event, seed=0, pcts=TAIL_PCTS):
    """The primary contrast and the tail count, computed on each strand alone.

    A conservation track is strandless, so these two blocks are measuring the
    same thing twice. They are here because when they disagree, the pooled
    number is the average of a real answer and an artifact, and no amount of
    significance on the pooled number tells you which half is which.
    """
    rows = []
    for st in ("+", "-"):
        sub = per_event[per_event["strand"] == st]
        if len(sub) < 10:
            continue
        r = paired(sub["cryptic"], sub["decoy"], seed=seed)
        r["strand"] = st
        for pct in pcts:
            col = f"above_p{pct}"
            if col not in sub.columns:
                continue
            v = sub[col].dropna()
            if not len(v):
                continue
            r[f"p{pct}_rate"] = float(v.astype(bool).mean())
            r[f"p{pct}_null"] = (100 - pct) / 100.0
        rows.append(r)
    if len(rows) < 2:
        return None
    out = pd.DataFrame(rows)
    front = ["strand", "n_pairs", "diff_median", "lo", "hi", "p"]
    extra = [c for c in out.columns if c.startswith("p9") or c.startswith("p7")]
    return out[[c for c in front + sorted(extra) if c in out.columns]]


def strands_disagree(bs, floor=0.05):
    """Does one strand carry the effect while the other shows nothing?

    True when exactly one strand reaches significance with an interval clear
    of zero and the other does not, or when the two intervals do not overlap.
    Either way the pooled estimate is not describing one population.
    """
    if bs is None or len(bs) < 2:
        return False
    a, b = bs.iloc[0], bs.iloc[1]

    def live(r):
        return (np.isfinite(r.get("p", np.nan)) and r["p"] < floor
                and np.isfinite(r.get("lo", np.nan))
                and (r["lo"] > 0 or r["hi"] < 0))

    if live(a) != live(b):
        return True
    for x, y in ((a, b), (b, a)):
        if (np.isfinite(x.get("lo", np.nan)) and np.isfinite(y.get("hi", np.nan))
                and x["lo"] > y["hi"]):
            return True
    return False


def tail_excess(per_event, pcts=TAIL_PCTS):
    """How many acceptors beat their own decoys, against how many should.

    A binomial against the threshold's own null rate. This is the statistic
    that separates "a few are conserved" from "all are slightly conserved",
    and the two have different biology.
    """
    from scipy.stats import binomtest
    rows = []
    for pct in pcts:
        col = f"above_p{pct}"
        if col not in per_event.columns:
            continue
        v = per_event[col].dropna()
        n, k = len(v), int(v.astype(bool).sum())
        null = (100 - pct) / 100.0
        if n < 10:
            rows.append({"threshold": f"above own decoys' p{pct}", "k": k,
                         "n": n, "observed": np.nan, "expected": null,
                         "fold": np.nan, "p": np.nan})
            continue
        rows.append({
            "threshold": f"above own decoys' p{pct}", "k": k, "n": n,
            "observed": k / n, "expected": null,
            "fold": (k / n) / null if null else np.nan,
            "p": float(binomtest(k, n, null, alternative="greater").pvalue)})
    return pd.DataFrame(rows)


def calibrate(scores, rows, shifts=(-2, -1, 0, 1, 2), by_strand=False):
    """Mean AG conservation at each offset, to catch a one-base coordinate error.

    The peak belongs at 0. Anywhere else and the track is being read off by
    that many bases, which a wide window would hide.

    With by_strand, one block per strand. A pooled scan can peak at zero
    while each strand sits a base off in opposite directions, which is
    exactly the error a strand-dependent coordinate convention produces.
    """
    groups = [("both", rows)]
    if by_strand:
        groups = [(st, [r for r in rows if r["strand"] == st])
                  for st in ("+", "-")]
    out = []
    for label, sub in groups:
        if not sub:
            continue
        for s in shifts:
            v, _ = score_rows(scores, sub, AG_SPAN, shift=s)
            v = v[~np.isnan(v)]
            out.append({"strand": label, "shift": s, "n": int(len(v)),
                        "mean": float(np.mean(v)) if len(v) else np.nan,
                        "median": float(np.median(v)) if len(v) else np.nan})
    df = pd.DataFrame(out)
    return df if by_strand else df.drop(columns=["strand"])


# --- statistics ---------------------------------------------------------------
def describe(name, v):
    v = np.asarray(v, dtype=float)
    v = v[~np.isnan(v)]
    if len(v) == 0:
        return {"population": name, "n": 0, "median": np.nan, "mean": np.nan,
                "q25": np.nan, "q75": np.nan}
    return {"population": name, "n": int(len(v)), "median": float(np.median(v)),
            "mean": float(np.mean(v)), "q25": float(np.percentile(v, 25)),
            "q75": float(np.percentile(v, 75))}


def pooled(a, b):
    """Mann-Whitney between two unpaired populations, two-sided."""
    from scipy.stats import mannwhitneyu
    a = np.asarray(a, float); b = np.asarray(b, float)
    a = a[~np.isnan(a)]; b = b[~np.isnan(b)]
    if len(a) < 3 or len(b) < 3:
        return {"n_a": len(a), "n_b": len(b), "diff_median": np.nan, "p": np.nan}
    u = mannwhitneyu(a, b, alternative="two-sided")
    return {"n_a": int(len(a)), "n_b": int(len(b)),
            "diff_median": float(np.median(a) - np.median(b)),
            "p": float(u.pvalue)}


def paired(a, b, n_boot=2000, seed=0):
    """Wilcoxon signed-rank on within-intron pairs, with a bootstrap interval.

    Pairing inside the intron is what makes the contrast mean something: gene
    expression, alignment depth, regional conservation and mutation rate are
    all held fixed, because both members of the pair sit in the same intron.
    """
    from scipy.stats import wilcoxon
    a = np.asarray(a, float); b = np.asarray(b, float)
    ok = ~np.isnan(a) & ~np.isnan(b)
    a, b = a[ok], b[ok]
    d = a - b
    if len(d) < 6:
        return {"n_pairs": int(len(d)), "diff_median": np.nan, "p": np.nan,
                "lo": np.nan, "hi": np.nan, "note": "too few pairs"}
    if np.allclose(d, 0):
        # Every pair identical. The signed-rank test is undefined here and
        # scipy raises, but the answer is not missing: the difference is zero.
        # Reporting this as "unavailable" would hide an exact null.
        return {"n_pairs": int(len(d)), "diff_median": 0.0, "p": 1.0,
                "lo": 0.0, "hi": 0.0, "note": "every pair identical"}
    p = float(wilcoxon(a, b, alternative="two-sided").pvalue)
    rng = np.random.default_rng(seed)
    boot = [float(np.median(d[rng.integers(0, len(d), len(d))]))
            for _ in range(n_boot)]
    return {"n_pairs": int(len(d)), "diff_median": float(np.median(d)), "p": p,
            "lo": float(np.percentile(boot, 2.5)),
            "hi": float(np.percentile(boot, 97.5)), "note": ""}


# --- verdict ------------------------------------------------------------------
def _null_verdict(primary, tail, by_strand, floor=0.05):
    """Whether the analysis reports nothing when there is nothing to report.

    Every number here has a known right answer, so this reads as a list of
    pass or fail rather than as a finding. A failure is not a result about
    cryptic exons; it is the size of the structure this analysis invents, and
    it has to be subtracted from, or exceed, anything the real run produces.
    """
    lines = ["NEGATIVE CONTROL, so every number below has a known right "
             "answer and this is a pass-or-fail list."]
    d, p, lo, hi = (primary.get("diff_median", np.nan),
                    primary.get("p", np.nan), primary.get("lo", np.nan),
                    primary.get("hi", np.nan))
    ok = np.isfinite(lo) and np.isfinite(hi) and lo <= 0 <= hi
    lines.append(
        f"{'PASS' if ok else 'FAIL'}  paired contrast {d:+.4g} "
        f"(95% CI {lo:+.4g} to {hi:+.4g}, p {p:.3g}); zero expected"
        + ("" if ok else ". The contrast itself is biased by this much on "
                        "positions that are not splice sites."))
    worst = None
    if tail is not None and len(tail):
        for _, r in tail.iterrows():
            if not np.isfinite(r["p"]):
                continue
            good = r["p"] >= floor
            lines.append(
                f"{'PASS' if good else 'FAIL'}  {r['threshold']}: "
                f"{r['k']}/{r['n']} = {100 * r['observed']:.1f}% against "
                f"{100 * r['expected']:.0f}% expected, {r['fold']:.2f}-fold, "
                f"p {r['p']:.3g}")
            if not good and (worst is None or r["fold"] > worst):
                worst = r["fold"]
    if worst is not None:
        lines.append(
            f"So the tail statistic is NOT calibrated: it reports up to "
            f"{worst:.2f}-fold enrichment on positions chosen for having no "
            "function at all. Any tail in the real run has to beat that "
            "factor, not the binomial null, and a real excess of similar "
            "size is indistinguishable from this.")
    elif tail is not None and len(tail):
        lines.append("The tail statistic is calibrated: on positions with no "
                     "function it returns chance at every threshold, so an "
                     "excess in the real run is an excess.")
    if by_strand is not None and len(by_strand) >= 2:
        a, b = by_strand.iloc[0], by_strand.iloc[1]
        lines.append(
            f"Per strand: {a['strand']} {a['diff_median']:+.4g} "
            f"(CI {a['lo']:+.4g} to {a['hi']:+.4g}), {b['strand']} "
            f"{b['diff_median']:+.4g} (CI {b['lo']:+.4g} to {b['hi']:+.4g}). "
            "Both belong at zero.")
    return "\n".join(lines)


def _control_verdict(control, primary, by_strand):
    """What the positive control says about the pipeline, not about biology.

    On annotated acceptors the expected answer is known, so the only things
    worth reporting are whether the contrast is large and whether the two
    strands agree. The gap between them is this module's own strand bias, in
    the same units as any result it will later produce, which makes it the
    floor a one-sided effect has to clear.
    """
    lines = ["POSITIVE CONTROL, so none of this is about cryptic exons."]
    d, lo, hi = (primary.get("diff_median", np.nan), primary.get("lo", np.nan),
                 primary.get("hi", np.nan))
    cd = control.get("diff_median", np.nan)
    if not np.isfinite(d) or d <= 0:
        lines.append(
            f"BROKEN: annotated acceptors do not beat arbitrary AGs in their "
            f"own introns ({d:.3g}). Nothing this module reports can be "
            "trusted until that is fixed.")
        return "\n".join(lines)
    lines.append(
        f"Annotated acceptors beat arbitrary AGs in their own introns by "
        f"{d:.3g} (95% CI {lo:.3g} to {hi:.3g}), against {cd:.3g} for the "
        "unpaired annotated-versus-intron comparison. The pipeline measures "
        "a real splice site.")
    if by_strand is None or len(by_strand) < 2:
        lines.append("No per-strand split available, which is the half of "
                     "this control that matters.")
        return "\n".join(lines)
    a, b = by_strand.iloc[0], by_strand.iloc[1]
    gap = abs(a["diff_median"] - b["diff_median"])
    lines.append(
        f"Strand {a['strand']}: {a['diff_median']:.3g} (CI {a['lo']:.3g} to "
        f"{a['hi']:.3g}). Strand {b['strand']}: {b['diff_median']:.3g} (CI "
        f"{b['lo']:.3g} to {b['hi']:.3g}). The truth is identical on both, so "
        f"THE STRAND BIAS OF THIS MEASUREMENT IS {gap:.3g}, in the same units "
        "as any cryptic result. Treat that as the floor a one-sided cryptic "
        "effect has to clear before it means anything.")
    lines.append(
        "Whether that bias is additive or proportional is not settled here, "
        "since these sites score far above the cryptic ones: stratify the "
        "control by its own conservation level to find out, because an "
        "additive bias carries down to the cryptic range and a proportional "
        "one does not.")
    return "\n".join(lines)


def _verdict(control, primary, scale, fate=None, matched=None, tail=None,
             peak=None, n_tail=None, strand=None, by_strand=None,
             discordant=False):
    """What the numbers say, or why they cannot say anything.

    The control gates the rest. A track read at the wrong coordinates produces
    a confident null, and a confident null is the answer this test is most
    likely to want to give, so the gate comes first.

    Significance alone decides nothing here. The signed-rank test answers
    whether the shifts lean one way and the bootstrap answers how big the
    shift is, and on a few hundred pairs the first can reach p < 0.01 while
    the second still straddles zero. The question is whether selection
    maintains these positions, which is a question about size, so a result
    whose interval includes zero is reported as settling nothing rather than
    as a finding. Every effect is also given as a share of the
    annotated-to-intron difference, because a phyloP difference of 0.05 means
    nothing until it is set against what a real splice site scores.
    """
    lines = []
    if discordant and by_strand is not None and len(by_strand) >= 2:
        a, b = by_strand.iloc[0], by_strand.iloc[1]
        lines.append(
            "STRANDS DISAGREE, SO THERE IS NO POOLED RESULT TO REPORT. "
            f"On strand {a['strand']} the contrast is {a['diff_median']:+.3g} "
            f"(95% CI {a['lo']:+.3g} to {a['hi']:+.3g}, p {a['p']:.3g}, "
            f"{int(a['n_pairs'])} pairs); on strand {b['strand']} it is "
            f"{b['diff_median']:+.3g} (95% CI {b['lo']:+.3g} to "
            f"{b['hi']:+.3g}, p {b['p']:.3g}, {int(b['n_pairs'])} pairs). A "
            "per-base conservation track has no strand, so these two blocks "
            "are the same measurement made twice and they cannot both be "
            "right. The pooled estimate is the average of a result and an "
            "artifact.")
        lines.append(
            "Take the answer from the strand that shows nothing, not from "
            "the pooled number: the null is what a strandless quantity can "
            "produce, and a one-sided effect is not. Then find the artifact "
            "before trusting either. No verdict on the cryptic sites here.")
        return "\n".join(lines)
    if strand is not None and np.isfinite(strand.get("p", np.nan)) \
            and strand["p"] < 0.01:
        lines.append(
            "STRAND ASYMMETRY, WHICH IS NOT A BIOLOGICAL RESULT: cryptic "
            f"acceptors on the minus strand sit at percentile "
            f"{strand['minus_median']:.3f} inside their own introns against "
            f"{strand['plus_median']:.3f} on the plus strand (p "
            f"{strand['p']:.3g}). That measure is normalized to each event's "
            "own intron, so gene and region conservation are already divided "
            "out and the conservation track has no strand. The acceptors are "
            "being derived a base off on one strand, which puts the window "
            "inside the exon there and inside the intron on the other. Read "
            "the per-strand AG table: nothing below is interpretable until "
            "both strands sit above 95%.")
    cd, cp = control.get("diff_median"), control.get("p")
    if not np.isfinite(cd) or not np.isfinite(cp) or cd <= 0 or cp >= 0.05:
        lines.append(
            "CONTROL FAILED: annotated acceptors in these genes do not score "
            "above random intronic positions "
            f"(median difference {cd:.3g}, p {cp:.3g}). A conservation track "
            "read at the right coordinates separates those two populations "
            "easily, so this says the track, the coordinates or the strand "
            "handling is wrong, not that splice sites are unconstrained.")
        lines.append("No verdict on the cryptic sites: with the control "
                     "failing they would be measuring the wrong sequence.")
        return "\n".join(lines)
    lines.append(f"Control holds: annotated acceptors score {cd:.3g} above "
                 f"random intron (p {cp:.3g}), so the track is being read.")

    d, p, lo, hi = (primary.get("diff_median", np.nan),
                    primary.get("p", np.nan),
                    primary.get("lo", np.nan), primary.get("hi", np.nan))
    n = primary.get("n_pairs", 0)
    if not np.isfinite(p):
        lines.append(
            f"Primary contrast unavailable: "
            f"{primary.get('note') or 'no usable pairs'} ({n} pairs).")
        return "\n".join(lines)

    def pct(x):
        """An effect as a share of the annotated-to-intron difference.

        Every number here is in whatever units the track uses, which means
        none of them are interpretable on their own. A difference of 0.05 is
        either large or negligible depending on what a real splice site
        scores, so the verdict says which.
        """
        if not (np.isfinite(x) and scale and np.isfinite(scale) and scale > 0):
            return "?"
        return f"{100 * abs(x) / scale:.0f}%"

    # The signed-rank test and the bootstrap median answer different
    # questions, and they can disagree: a mass of tiny positive shifts moves
    # the ranks while leaving the median where it was. When they disagree the
    # interval wins, because the claim at issue is about the size of the
    # effect and not merely its sign.
    ci_clears_zero = np.isfinite(lo) and np.isfinite(hi) and (lo > 0 or hi < 0)
    def mg(key):
        """A field of the matched contrast, NaN when absent or None."""
        if not matched:
            return np.nan
        v = matched.get(key)
        return np.nan if v is None else v

    md, mp, mlo, mhi = mg("diff_median"), mg("p"), mg("lo"), mg("hi")
    ran = matched is not None and np.isfinite(mp)
    matched_holds = (ran and mp < 0.05 and md > 0
                     and np.isfinite(mlo) and mlo > 0)
    span = f"95% CI {lo:.3g} to {hi:.3g}" if np.isfinite(lo) else "no interval"
    bound = max(abs(lo), abs(hi)) if np.isfinite(lo) and np.isfinite(hi) else np.nan

    if p < 0.05 and d > 0 and not ci_clears_zero:
        lines.append(
            f"NOT SUPPORTED either way: cryptic acceptors sit {d:.3g} above "
            f"decoy AGs by the rank test (p {p:.3g}, {n} pairs), but the "
            f"bootstrap interval includes zero ({span}). The rank test is "
            "reading a mass of small positive shifts the median does not "
            f"carry. At {pct(d)} of the {scale:.3g} that separates annotated "
            "acceptors from intron, this is not selection maintaining a "
            "splice site whichever way the sign falls.")
    elif p < 0.05 and d > 0 and not ran:
        lines.append(
            f"Cryptic acceptors score {d:.3g} above decoy AGs in the same "
            f"introns (p {p:.3g}, {n} pairs, {span}), {pct(d)} of "
            "splice-site-scale constraint, and the strength-matched control "
            "DID NOT RUN, so this is unconfirmed rather than either way. A "
            "cryptic site is a better splice site than an arbitrary AG by "
            "construction, and until the matched contrast runs that alone "
            "could produce this. Check that the PWM fitted.")
    elif p < 0.05 and d > 0 and matched_holds:
        lines.append(
            f"FALSIFIED as stated: cryptic acceptors score {d:.3g} ABOVE "
            f"decoy AGs in the same introns (p {p:.3g}, {n} pairs, {span}), "
            f"it survives strength matching ({md:.3g}, p {mp:.3g}, CI "
            f"{mlo:.3g} to {mhi:.3g}), and both intervals clear zero. That "
            f"is {pct(d)} of the {scale:.3g} separating annotated acceptors "
            "from intron. Something has been maintaining these positions, so "
            "masked-but-unfiltered is the wrong description and the frame "
            "result needs another explanation.")
    elif p < 0.05 and d > 0 and md > 0 and mp < 0.05:
        # Reproduced under matching with the same sign, just with an interval
        # that does not clear zero. Calling that "does not survive" would
        # misdescribe a larger, more significant effect as a failure.
        lines.append(
            f"Cryptic acceptors score {d:.3g} above decoy AGs (p {p:.3g}, "
            f"{n} pairs, {span}), {pct(d)} of splice-site-scale constraint. "
            f"Strength matching REPRODUCES it rather than removing it "
            f"({md:.3g}, p {mp:.3g}), so it is not simply that cryptic sites "
            f"are better splice sites than arbitrary AGs; but the matched "
            f"interval still includes zero (CI {mlo:.3g} to {mhi:.3g}), so "
            "the size is not pinned down.")
    elif p < 0.05 and d > 0:
        lines.append(
            f"Cryptic acceptors score {d:.3g} above decoy AGs (p {p:.3g}, "
            f"{n} pairs), and it COLLAPSES under strength matching "
            f"({md:.3g}, p {mp:.3g}). Read this as cryptic acceptors being "
            "better splice sites than arbitrary AGs, which is how they were "
            "found, rather than as selection maintaining the exons.")
    elif p < 0.05 and d < 0 and ci_clears_zero:
        lines.append(
            f"Cryptic acceptors score {d:.3g} BELOW decoy AGs (p {p:.3g}, "
            f"{n} pairs, {span}). Consistent with no selection maintaining "
            "them, and worth asking whether the decoy set is picking up weak "
            "real sites rather than the cryptic set being actively "
            "unconserved.")
    elif np.isfinite(bound) and scale and np.isfinite(scale) and scale > 0:
        lines.append(
            f"CONSISTENT with no selection: cryptic acceptors are "
            f"indistinguishable from decoy AGs in the same introns (median "
            f"difference {d:.3g}, p {p:.3g}, {n} pairs). The 95% interval "
            f"excludes a difference larger than {bound:.3g}, against the "
            f"{scale:.3g} that separates annotated acceptors from intron, so "
            f"this rules out anything above {pct(bound)} of splice-site-scale "
            "constraint.")
    else:
        lines.append(
            f"CONSISTENT with no selection (median difference {d:.3g}, "
            f"p {p:.3g}, {n} pairs), with no scale to state it against.")
    if tail is not None and len(tail):
        t95 = tail[tail["threshold"].str.endswith("p95")]
        t99 = tail[tail["threshold"].str.endswith("p99")]
        got = []
        for row, label in ((t95, "95th"), (t99, "99th")):
            if len(row) and np.isfinite(row["p"].iloc[0]):
                r = row.iloc[0]
                got.append(f"{r['k']}/{r['n']} ({100 * r['observed']:.1f}%) "
                           f"beat the {label} percentile of their own decoys "
                           f"against {100 * r['expected']:.0f}% expected, "
                           f"{r['fold']:.1f}-fold, p {r['p']:.3g}")
        if got:
            lines.append(
                "SHAPE: this is a tail, not a shift. " + "; ".join(got) + ". "
                "Most acceptors sit where their intron's arbitrary AGs sit; a "
                "minority sit on conserved sequence. A median difference "
                "averages those two populations together and describes "
                "neither.")
    if peak is not None and np.isfinite(peak.get("p", np.nan)):
        pd_, pp = peak["diff_median"], peak["p"]
        nt = peak.get("n_tail", n_tail)
        if pp < 0.05 and pd_ < 0:
            lines.append(
                f"And the conserved minority does NOT look like splice sites: "
                f"its peak above its own flank sits {abs(pd_):.3g} BELOW what "
                f"annotated acceptors make (p {pp:.3g}, {nt} events). A real "
                "3' splice site is conserved at the AG and the tract and not "
                "especially around them. A plateau instead points at sequence "
                "conserved for another reason: an exon of a transcript the "
                "annotation lacks, an overlapping non-coding RNA, a "
                "regulatory element. Check those events individually before "
                "calling any of them a maintained splice site.")
        else:
            tp, rp, ap = (peak.get("tail_peak"), peak.get("rest_peak"),
                          peak.get("ann_peak"))
            nr = peak.get("n_rest")
            if all(v is not None and np.isfinite(v) for v in (tp, rp, ap)):
                # The difference may or may not be significant; stating
                # either unconditionally has now been wrong both ways.
                how = (f"a difference of {pd_:+.3g} at p {pp:.3g}"
                       if pp < 0.05 else
                       f"a difference of {pd_:+.3g} that does not reach "
                       f"significance (p {pp:.3g})")
                lines.append(
                    f"TWO POPULATIONS, not one. The conserved minority peaks "
                    f"{tp:.3g} above its own flank against {ap:.3g} for "
                    f"annotated acceptors, {how}, on {nt} events: "
                    "on this measure they are real 3' splice sites. The "
                    f"other {nr} are flat, {rp:.3g} above their own flank, "
                    "which is what an AG that nothing has ever used looks "
                    "like. So the set is a mixture: mostly accidents, plus a "
                    "minority of maintained splice sites that something is "
                    "holding shut. Name those events and ask where else in "
                    "the phylogeny they are used.")
            else:
                lines.append(
                    f"The conserved minority peaks above its own flank much "
                    f"as annotated acceptors do ({pd_:+.3g}, p {pp:.3g}, "
                    f"{nt} events), which is what a maintained splice site "
                    "looks like. These events are worth naming individually.")
    if fate is not None and np.isfinite(fate.get("p", np.nan)):
        fd, fp = fate["diff_median"], fate["p"]
        if fp < 0.05 and fd > 0:
            lines.append(
                f"But the fate split is NOT null: in-frame cryptic acceptors "
                f"score {fd:.3g} above frame-disrupting ones (p {fp:.3g}). "
                "The subset that can make protein carries constraint the rest "
                "does not, which is what selection on a new isoform would "
                "look like.")
        else:
            lines.append(
                f"The fate split adds nothing: in-frame versus "
                f"frame-disrupting differ by {fd:.3g} (p {fp:.3g}), so the "
                "exons that could make protein are no better conserved than "
                "the ones that cannot.")
    return "\n".join(lines)


# --- assembly -----------------------------------------------------------------
def _med(values):
    """Median ignoring missing values, NaN when there is nothing to take."""
    x = [v for v in values if v is not None and not np.isnan(v)]
    return float(np.median(x)) if x else np.nan



def build(events, exons, genome, scores, span=SS_SPAN, exclude=EXCLUDE,
          n_random=RANDOM_PER_INTRON, cap=MAX_DECOY_PER_INTRON, seed=0,
          max_intron=200000, tol=STRENGTH_TOL, pwm=None, fit_strength=True,
          flank_inner=FLANK_INNER, flank_outer=FLANK_OUTER, control=False,
          units=DECOY_UNITS):
    """Score every position in all four populations.

    Returns (per-position table, per-event table). The per-event table is what
    the paired tests use: one cryptic score, the median of its own intron's
    decoys, the median of the subset of those decoys whose splice site scores
    as well as the cryptic one's, and the median of its random positions, all
    on the same row.
    """
    rng = np.random.default_rng(seed)
    genes = set(events["gene"])
    bounds = chrom_exon_bounds(exons)

    ann = annotated_acceptors(exons, genes)
    if pwm is None and fit_strength and len(ann):
        pwm = acceptor_pwm(genome, ann, seed=seed)

    pos_rows, ev_rows = [], []
    for i, ev in events.iterrows():
        gb = bounds.get(str(ev["chrom"]), np.array([], dtype=np.int64))
        lo, hi = int(ev["intron_start"]), int(ev["intron_end"])
        if hi - lo > max_intron:
            # Scan the acceptor's half of a very long intron, not all of it.
            if ev["strand"] == "+":
                lo = max(lo, int(ev["acceptor"]) - max_intron)
            else:
                hi = min(hi, int(ev["acceptor"]) + max_intron)
        seq = genome.sequence(ev["chrom"], lo, hi, ev["strand"]) if hi > lo else ""
        ags = ag_positions(seq, lo, hi, ev["strand"], units=units)
        dec = pick_decoys(ags, ev["acceptor"], gb, exclude=exclude, cap=cap, rng=rng)
        ran = random_positions(lo, hi, ev["acceptor"], gb, n=n_random,
                               exclude=exclude, rng=rng)

        here = [{"population": "cryptic", "event": i, "gene": ev["gene"],
                 "chrom": ev["chrom"], "strand": ev["strand"],
                 "pos": int(ev["acceptor"])}]
        here += [{"population": "decoy", "event": i, "gene": ev["gene"],
                  "chrom": ev["chrom"], "strand": ev["strand"], "pos": p}
                 for p in dec]
        here += [{"population": "intron", "event": i, "gene": ev["gene"],
                  "chrom": ev["chrom"], "strand": ev["strand"], "pos": p}
                 for p in ran]
        v, cov = score_rows(scores, here, span)
        for r, sc, c in zip(here, v, cov):
            r["score"] = sc
            r["covered"] = c
            r["dist_exon"] = nearest_boundary(r["pos"], gb)
            r["strength"] = strength_of(genome, pwm, r["chrom"], r["pos"],
                                        r["strand"])
            r["flank"] = score_flank(scores, r["chrom"], r["pos"], r["strand"],
                                     flank_inner, flank_outer)
            # Positive means the site stands above its own surroundings, which
            # is what a splice site does and what a conserved element does not.
            r["peak"] = r["score"] - r["flank"]
        pos_rows += here

        def med(name):
            return _med([r["score"] for r in here
                         if r["population"] == name])

        mat = matched_decoys([r for r in here if r["population"] == "decoy"],
                             here[0]["strength"], tol=tol)
        mat_scores = [r["score"] for r in mat if not np.isnan(r["score"])]

        pctile, above = within_intron_pctile(
            here[0]["score"],
            [r["score"] for r in here if r["population"] == "decoy"])

        row = {"event": i, "gene": ev["gene"], "chrom": ev["chrom"],
               "strand": ev["strand"], "acceptor": int(ev["acceptor"]),
               "cryptic": here[0]["score"], "n_decoy": len(dec),
               "decoy": med("decoy"), "n_random": len(ran),
               "intron": med("intron"),
               "strength": here[0]["strength"],
               "flank": here[0]["flank"],
               "peak": here[0]["peak"],
               "decoy_peak": _med([r["peak"] for r in here
                                   if r["population"] == "decoy"]),
               "n_decoy_matched": len(mat_scores),
               "decoy_matched": (float(np.median(mat_scores))
                                 if mat_scores else np.nan),
               "dist_exon": here[0]["dist_exon"],
               # The cryptic acceptor has to clear the same exclusion its
               # decoys cleared. Without this the contrast compares acceptors
               # that may sit on an annotated exon edge against decoys that
               # were forbidden from sitting anywhere near one, and the
               # annotated edges win on position alone.
               "clear": bool(here[0]["dist_exon"] > exclude or control),
               "pctile": pctile,
               "intron_len": hi - lo + 1}
        for pct, flag in above.items():
            row[f"above_p{pct}"] = flag
        for extra in ("fate", "supported", "n_datasets", "tier"):
            if extra in events.columns:
                row[extra] = ev[extra]
        ev_rows.append(row)

    if len(ann):
        arecs = ann.to_dict("records")
        av, acov = score_rows(scores, arecs, span)
        aflank = [score_flank(scores, r["chrom"], r["pos"], r["strand"],
                              flank_inner, flank_outer) for r in arecs]
        ann = ann.assign(
            population="annotated", event=np.nan, score=av, covered=acov,
            dist_exon=0.0,
            strength=[strength_of(genome, pwm, r["chrom"], r["pos"], r["strand"])
                      for r in arecs],
            flank=aflank, peak=np.asarray(av) - np.asarray(aflank))
        pos_rows += ann.to_dict("records")

    return (pd.DataFrame(pos_rows), pd.DataFrame(ev_rows))


def summarize(positions, per_event, seed=0):
    """Population summaries and every contrast, with BH across the contrasts."""
    pops = ["cryptic", "decoy", "intron", "annotated"]
    summary = pd.DataFrame([
        describe(p, positions.loc[positions["population"] == p, "score"])
        for p in pops])

    ann = positions.loc[positions["population"] == "annotated", "score"]
    ran = positions.loc[positions["population"] == "intron", "score"]
    control = pooled(ann, ran)
    control["contrast"] = "annotated vs intron (control, unpaired)"

    rows = [control]
    clear = (per_event["clear"] if "clear" in per_event.columns
             else pd.Series(True, index=per_event.index))
    ok = per_event[clear.fillna(False).astype(bool)]
    near = per_event[~clear.fillna(False).astype(bool)]

    pri = paired(ok["cryptic"], ok["decoy"], seed=seed)
    pri["contrast"] = ("cryptic vs decoy, paired within intron, acceptors "
                       "clear of annotated exons (PRIMARY)")
    rows.append(pri)
    if "decoy_matched" in per_event.columns:
        mat = paired(ok["cryptic"], ok["decoy_matched"], seed=seed)
        mat["contrast"] = ("cryptic vs strength-matched decoy, clear "
                           "acceptors (CONFOUND CONTROL)")
        rows.append(mat)
    else:
        mat = None
    sec = paired(ok["cryptic"], ok["intron"], seed=seed)
    sec["contrast"] = "cryptic vs random intron, clear acceptors"
    rows.append(sec)
    dec = paired(ok["decoy"], ok["intron"], seed=seed)
    dec["contrast"] = "decoy vs random intron, clear acceptors"
    rows.append(dec)
    if len(near):
        nr = paired(near["cryptic"], near["decoy"], seed=seed)
        nr["contrast"] = ("cryptic vs decoy, acceptors ON an annotated exon "
                          "edge (EXCLUDED from the primary; these are "
                          "annotated splice sites)")
        rows.append(nr)
    cva = pooled(positions.loc[positions["population"] == "cryptic", "score"], ann)
    cva["contrast"] = "cryptic vs annotated (scale reference, NOT matched)"
    rows.append(cva)

    fate = None
    if "fate" in ok.columns:
        f = ok["fate"].astype(str).str.lower()
        inframe = ok.loc[f.str.contains("in_frame|inframe|in frame"), "cryptic"]
        decay = ok.loc[
            f.str.contains("nmd|decay|frame_dis|frameshift|stop_in_exon|ptc"),
            "cryptic"]
        if len(inframe) >= 3 and len(decay) >= 3:
            fate = pooled(inframe, decay)
            fate["contrast"] = ("cryptic in-frame vs frame-disrupting, clear "
                                "acceptors (unpaired)")
            rows.append(fate)

    cont = pd.DataFrame(rows)
    cont["padj"] = bh(cont["p"].to_numpy(dtype=float))
    front = ["contrast", "n_pairs", "n_a", "n_b", "diff_median", "lo", "hi",
             "p", "padj"]
    cont = cont[[c for c in front if c in cont.columns]]

    # Is this a shift in the bulk or a conserved minority? The paired median
    # above cannot tell the difference and the two mean different things.
    tail = tail_excess(ok)
    if "above_p95" in ok.columns:
        # The column holds True/False/None, so it arrives as object dtype and
        # a bare fillna would downcast with a warning. Compare instead.
        is_tail = ok["above_p95"].apply(lambda v: v is True)
    else:
        is_tail = pd.Series(False, index=ok.index)

    # And is whatever is conserved conserved AS A SPLICE SITE? Annotated
    # acceptors set the scale for the peak a real site makes above its own
    # surroundings.
    peaks, peak = None, None
    if "peak" in positions.columns:
        ann_peak = positions.loc[positions["population"] == "annotated", "peak"]
        peaks = pd.DataFrame([
            describe("annotated (reference peak)", ann_peak),
            describe("cryptic, conserved tail", ok.loc[is_tail, "peak"]),
            describe("cryptic, the rest", ok.loc[~is_tail, "peak"]),
            describe("decoy (median per intron)", ok["decoy_peak"]),
        ])
        if is_tail.sum() >= 3 and ann_peak.notna().sum() >= 10:
            peak = pooled(ok.loc[is_tail, "peak"], ann_peak)
            peak["contrast"] = ("peak above own flank: conserved tail vs "
                                "annotated acceptors")
            peak["n_tail"] = int(is_tail.sum())
            peak["rest_peak"] = _med(ok.loc[~is_tail, "peak"])
            peak["tail_peak"] = _med(ok.loc[is_tail, "peak"])
            peak["ann_peak"] = _med(ann_peak)
            peak["n_rest"] = int((~is_tail).sum())

    # A percentile inside the event's own intron is normalized for gene,
    # intron and region, so it cannot legitimately depend on strand. If it
    # does, the acceptors are being derived wrongly on one strand: the decoys
    # come from reading sequence and are immune, so the asymmetry shows up
    # here and nowhere else.
    strand = None
    if "pctile" in ok.columns and "strand" in ok.columns:
        a = ok.loc[ok["strand"] == "-", "pctile"].dropna()
        b = ok.loc[ok["strand"] == "+", "pctile"].dropna()
        if len(a) >= 10 and len(b) >= 10:
            strand = pooled(a, b)
            strand["contrast"] = ("within-intron percentile, minus vs plus "
                                  "strand (SANITY: should be nothing)")
            strand["minus_median"] = float(a.median())
            strand["plus_median"] = float(b.median())

    bs = by_strand(ok, seed=seed)
    return {"strand": strand, "by_strand": bs,
            "discordant": strands_disagree(bs),
            "summary": summary, "contrasts": cont, "control": control,
            "primary": pri, "fate": fate, "matched": mat, "tail": tail,
            "peaks": peaks, "peak": peak, "n_tail": int(is_tail.sum())}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", required=True,
                    help="cryptic events: a junction column plus strand, or "
                         "chrom/a_start/a_end/strand, plus a gene column")
    ap.add_argument("--scores", required=True,
                    help="per-base conservation: an hg38 phyloP or phastCons "
                         "bigWig (.bw), or a chrom/pos/score table")
    ap.add_argument("--gene-col", default=None)
    ap.add_argument("--require", action="append", default=[],
                    metavar="COL=VALUE",
                    help="keep only rows whose COL equals VALUE, compared as "
                         "lower-case text; repeatable. Applied before the "
                         "acceptors are derived, so the coordinate check and "
                         "every count report the set actually used. Needed "
                         "for any table that carries one row per comparison "
                         "rather than one per event")
    ap.add_argument("--annotation", default="current")
    ap.add_argument("--span", default="-20,3", metavar="LO,HI",
                    help="transcript-oriented offsets scored around each "
                         "acceptor; 0 is the acceptor itself, negative is "
                         "intronic. Default -20,3 covers the pyrimidine "
                         "tract and the AG")
    ap.add_argument("--exclude", type=int, default=EXCLUDE,
                    help="nt a decoy or random position must keep from the "
                         "cryptic acceptor and from any annotated exon edge")
    ap.add_argument("--decoys-per-intron", type=int, default=MAX_DECOY_PER_INTRON)
    ap.add_argument("--random-per-intron", type=int, default=RANDOM_PER_INTRON)
    ap.add_argument("--max-intron", type=int, default=200000,
                    help="longest stretch of a single intron scanned for AGs")
    ap.add_argument("--flank-inner", type=int, default=FLANK_INNER,
                    metavar="NT",
                    help="nt on each side of the acceptor left out of the "
                         "flank, so the site is not counted in its own "
                         "background")
    ap.add_argument("--flank-outer", type=int, default=FLANK_OUTER,
                    metavar="NT",
                    help="nt on each side averaged as the flank. The site "
                         "minus its flank is what separates a conserved "
                         "splice site from a conserved element that happens "
                         "to contain one")
    ap.add_argument("--strength-tol", type=float, default=STRENGTH_TOL,
                    metavar="BITS",
                    help="how far a decoy's 3'SS PWM score may sit from the "
                         "cryptic site's and still count as comparable. The "
                         "matched contrast is what separates selection on the "
                         "exon from the cryptic site simply being a better "
                         "splice site than a random AG")
    ap.add_argument("--no-strength", action="store_true",
                    help="skip the PWM entirely. Only sensible if the "
                         "unmatched contrast is already null, since a "
                         "positive result without this control is confounded")
    ap.add_argument("--decoy-orientation", choices=["transcript", "both"],
                    default="transcript",
                    help="which dinucleotides count as decoys. 'transcript' "
                         "(the default) takes AG in the gene's own "
                         "orientation, so every decoy is in the same class as "
                         "the acceptor it backs and the ~0.11 gap between "
                         "forward AG and forward CT cancels. 'both' adds CT: "
                         "orientation-free, but half the background is then "
                         "the wrong class for the event, which shifts each "
                         "strand by half that gap in opposite directions and "
                         "makes them appear to agree")
    ap.add_argument("--mirror-strand", action="store_true",
                    help="flip every event's strand AFTER its acceptor is "
                         "derived, so the position and the interval are "
                         "unchanged and only the reading is mirrored: the "
                         "window turns around and the decoys become the "
                         "opposite dinucleotide. With a symmetric --span the "
                         "window stops moving too, isolating decoy "
                         "orientation. A contrast that survives the mirror "
                         "has no orientation dependence")
    ap.add_argument("--null-events", type=int, default=-1, metavar="N",
                    nargs="?", const=0,
                    help="NEGATIVE control: keep every event's gene, strand "
                         "and intron but move its acceptor to a random "
                         "eligible AG in that same intron. Nothing there is a "
                         "splice site, so every contrast must come back at "
                         "zero and every tail count at chance. This is what "
                         "calibrates the tail statistic, which the positive "
                         "control cannot. N limits how many events to use; "
                         "omit the value for all of them")
    ap.add_argument("--control-events", type=int, default=0, metavar="N",
                    help="replace the cryptic events with N annotated "
                         "acceptors from the same genes and run everything "
                         "else unchanged. A positive control on the whole "
                         "pipeline: the contrast must come out large and "
                         "EQUAL on both strands, because strand is not a "
                         "property of a splice site or of the track. Any "
                         "gap between the strands here is the measurement's "
                         "own bias, measured in the same units as the result")
    ap.add_argument("--ignore-coordinates", action="store_true",
                    help="run even when the derived acceptors do not read AG. "
                         "Only for a non-acceptor events table; on a cryptic "
                         "acceptor table a poor rate means the coordinates "
                         "are wrong and every number here is measuring the "
                         "wrong bases")
    ap.add_argument("--no-calibrate", action="store_true",
                    help="skip the offset scan. Do not: it is the check that "
                         "the track is read in the right coordinate base")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None, help="per-event table")
    ap.add_argument("--out-positions", default=None, help="per-position table")
    args = ap.parse_args()

    units = (DECOY_UNITS_BOTH if args.decoy_orientation == "both"
             else DECOY_UNITS)
    try:
        lo, hi = (int(x) for x in str(args.span).split(","))
    except ValueError:
        raise SystemExit(f"--span wants LO,HI such as -20,3, got {args.span!r}")
    if lo > hi:
        raise SystemExit(f"--span LO must not exceed HI, got {lo},{hi}")

    from bajanmd.consequence import annotation_tables
    from bajasplice.genome import GenomeReader

    events = read_events(args.events, args.gene_col, args.require)
    if not len(events):
        raise SystemExit(f"{args.events}: no usable events")
    if args.mirror_strand:
        flip = {"+": "-", "-": "+"}
        events = events.assign(
            strand=events["strand"].map(flip).fillna(events["strand"]))
        print("MIRRORED: every strand label flipped after the acceptors were "
              "derived. The positions and intervals are unchanged; only the "
              "window orientation and the decoy dinucleotide are. A contrast "
              "that matches the unmirrored run has no orientation "
              "dependence; one that does not localizes it.")

    control = None
    if args.null_events >= 0:
        from bajanmd.consequence import annotation_tables as _at0
        from bajasplice.genome import GenomeReader as _GR0
        _ex0, _ = _at0(args.annotation)
        before = len(events)
        events = null_events(events, _ex0, _GR0(), n=args.null_events,
                             exclude=args.exclude, seed=args.seed,
                             max_intron=args.max_intron, units=units)
        if not len(events):
            raise SystemExit("--null-events found no eligible AG in any "
                             "intron, so there is nothing to test")
        print("NEGATIVE CONTROL: each acceptor has been moved to a random AG "
              "in its own intron. None of these positions is a splice site, "
              "so every contrast must come back at zero and every tail count "
              "at chance. Anything else is the analysis inventing structure.")
        print(f"  {len(events)} of {before} events kept; the rest had no "
              "eligible AG")
    if args.control_events:
        from bajanmd.consequence import annotation_tables as _at
        _ex, _ = _at(args.annotation)
        control = control_events(_ex, set(events["gene"]),
                                 n=args.control_events, seed=args.seed)
        if not len(control):
            raise SystemExit("--control-events found no annotated acceptors "
                             "in these genes")
        events = control
        print("POSITIVE CONTROL: the events below are ANNOTATED acceptors, "
              "not cryptic ones. The contrast must be large and equal on "
              "both strands; a gap between them is this pipeline's own "
              "strand bias.")
    print(f"{len(events)} events, {events['gene'].nunique()} genes "
          f"from {'the annotation' if control is not None else os.path.basename(args.events)}")
    if args.require and control is None:
        print(f"  after {', '.join(args.require)}, deduplicated on "
              "chrom/acceptor/strand")
    print(f"  acceptor window: offsets {lo} to {hi} around the acceptor, "
          f"transcript orientation")
    print(f"  decoys: {' and '.join(units)} in transcript orientation"
          + ("  (orientation-free, but half the background is the wrong "
             "class for the event)" if args.decoy_orientation == "both"
             else "  (matched to the acceptor's own class)"))

    exons, _ = annotation_tables(args.annotation)
    genome = GenomeReader()

    check = coordinate_check(genome, events)
    if control is not None:
        print("\n(positive control: these acceptors come from the "
              "annotation, so the AG rate below is a check on this module's "
              "own arithmetic rather than on an events table)")
    print("\nderived acceptors read AG? (a 3' splice site does; reported per "
          "strand because a base-off table errs in opposite directions on "
          "the two strands)")
    print(check.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    note = _coordinate_note(check)
    if note:
        print("\n" + note, file=sys.stderr)
        if not args.ignore_coordinates:
            raise SystemExit(
                "\nStopping. Pass --ignore-coordinates to run anyway, but "
                "the conservation numbers will be measuring the wrong bases "
                "on at least one strand.")

    scores = Scores(args.scores)
    missing = sorted(set(events["chrom"]) - scores.chroms)
    if missing:
        print(f"  WARNING: the track has no {', '.join(missing[:6])}"
              f"{' and more' if len(missing) > 6 else ''}; "
              "those events will score NaN", file=sys.stderr)

    positions, per_event = build(
        events, exons, genome, scores, span=(lo, hi), exclude=args.exclude,
        n_random=args.random_per_intron, cap=args.decoys_per_intron,
        seed=args.seed, max_intron=args.max_intron, tol=args.strength_tol,
        fit_strength=not args.no_strength, flank_inner=args.flank_inner,
        flank_outer=args.flank_outer, control=control is not None,
        units=units)

    if not args.no_calibrate:
        ann = positions[positions["population"] == "annotated"]
        if len(ann) >= 20:
            cal = calibrate(scores, ann.to_dict("records"), by_strand=True)
            print("\noffset calibration on annotated acceptors "
                  "(the AG itself; the peak belongs at shift 0 on BOTH "
                  "strands):")
            print(cal.to_string(index=False,
                                float_format=lambda v: f"{v:.4g}"))
            for st in ("+", "-"):
                sub = cal[cal["strand"] == st]
                if not len(sub) or sub["mean"].isna().all():
                    continue
                best = int(sub.loc[sub["mean"].idxmax(), "shift"])
                if best != 0:
                    print(f"  WARNING: on strand {st} conservation peaks at "
                          f"shift {best:+d}, not 0. The track is being read "
                          "off by that many bases there; the wide-window "
                          "numbers below will survive it and the AG-scale "
                          "ones will not.", file=sys.stderr)

    res = summarize(positions, per_event, seed=args.seed)
    cov = positions["covered"].mean()
    print(f"\ntrack covers {100 * cov:.1f}% of the scored windows on average")
    if "clear" in per_event.columns:
        n_clear = int(per_event["clear"].sum())
        n_near = len(per_event) - n_clear
        print(f"\n{n_clear} of {len(per_event)} acceptors sit more than "
              f"{args.exclude} nt from any annotated exon boundary and carry "
              "the primary contrast")
        if n_near:
            print(f"  {n_near} are within {args.exclude} nt of one, so they "
                  "are annotated splice sites rather than unfiltered "
                  "sequence; they get their own contrast and are kept out of "
                  "the primary")
    if "n_decoy_matched" in per_event.columns and not args.no_strength:
        usable = int((per_event["n_decoy_matched"] > 0).sum())
        print(f"strength matching: {usable} of {len(per_event)} events have "
              f"at least one decoy within {args.strength_tol:g} bits")
        if usable == 0:
            print("  WARNING: no event got a strength-matched decoy, so the "
                  "confound control is not running. Usually the PWM did not "
                  "fit, which needs at least 50 readable annotated acceptors "
                  "in these genes.", file=sys.stderr)
    fmt = lambda v: f"{v:.4g}"
    print("\npopulations:")
    print(res["summary"].to_string(index=False, float_format=fmt))
    print("\ncontrasts:")
    print(res["contrasts"].to_string(index=False, float_format=fmt))
    if res["tail"] is not None and len(res["tail"]):
        print("\nwhere each acceptor sits inside its OWN intron's decoy "
              "distribution:")
        print(res["tail"].to_string(index=False, float_format=fmt))
    if res["peaks"] is not None:
        print(f"\npeak above own flank (the site minus the "
              f"{args.flank_inner} to {args.flank_outer} nt on either side of "
              "it); a splice site peaks, a conserved element does not:")
        print(res["peaks"].to_string(index=False, float_format=fmt))

    scale = res["control"].get("diff_median", np.nan)
    if res["by_strand"] is not None:
        print("\nthe primary contrast and the tail, on each strand alone "
              "(a conservation track has no strand, so these must agree):")
        print(res["by_strand"].to_string(index=False, float_format=fmt))
    if res["strand"] is not None:
        print("\nstrand sanity check on the intron-normalized measure "
              "(a difference here is a measurement artifact, not biology):")
        print(pd.DataFrame([res["strand"]]).to_string(
            index=False, float_format=fmt))
    if args.null_events >= 0:
        print("\n" + _null_verdict(res["primary"], res["tail"],
                                   res["by_strand"]))
    elif control is not None:
        print("\n" + _control_verdict(res["control"], res["primary"],
                                      res["by_strand"]))
    else:
        print("\n" + _verdict(res["control"], res["primary"], scale,
                              res["fate"], res["matched"], res["tail"],
                              res["peak"], res["n_tail"], res["strand"],
                              res["by_strand"], res["discordant"]))

    if args.out:
        per_event.to_csv(args.out, sep="\t", index=False)
        print(f"\nwrote {args.out}")
    if args.out_positions:
        positions.to_csv(args.out_positions, sep="\t", index=False)
        print(f"wrote {args.out_positions}")


if __name__ == "__main__":
    main()
