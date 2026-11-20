"""Exons whose PSI must not be believed, looked up at query time.

WHY A LOOKUP AND NOT A BETTER MODEL. SMN2 exon 7 is the worked example. It sits
in cassette.tsv with a median PSI of 0.84 across 54 tissues on 256,818 reads;
the true figure is about 0.10, because skipping that exon is the whole reason
SMA is a disease. SMN1 is 99.9% identical a short distance away, its exon 7 is
included in every tissue, and short reads do not separate the two, so the label
is a blend dominated by the wrong gene. PSINet predicted 0.9652 and was being
obedient: it reproduced the number it was shown.

That is the point. No amount of retraining on this data moves that prediction,
because the error is not in the model's fit, it is in the target. Only two
things change the answer:

  REQUANTIFY, then retrain -- long reads, or an EM over the paralogs that
                assigns multi-mapping reads instead of double-counting them.
                This is the real fix and it is a data programme, not a model
                change.
  REFUSE,     which is what this module does -- know which exons are in
                duplicated sequence and decline to state a PSI for them. A
                withheld number is worth more than a confident wrong one when
                the exon is an oligo target.

WHERE THE INTERVALS COME FROM. Either of two sources, both ordinary BED:

  a segmental-duplication or low-mappability track (UCSC hg38 genomicSuperDups
  is the obvious one), which needs no computation at all; or

  the output of mappability.cached_flags over the event table, exported by
  export_bed() below, which finds near-identical exons in OTHER genes by
  minhash and so catches pairs that differ by a base or two.

Configure the file as `untrusted_bed` (BAJASPLICE_UNTRUSTED_BED). NOTHING IS
FLAGGED WHEN NO FILE IS CONFIGURED, and callers are told which file was used
precisely so that "not checked" cannot be mistaken for "checked and clean".

Flagging is not the same as a bias correction: across the genome these exons
average PSI 0.9088 against 0.9236 for the rest, so there is no offset to
subtract. Individual events are wrong by a lot; the population is not shifted.
"""
from __future__ import annotations

import bisect
import os


def _norm(chrom):
    """chr5, 5, and Chr5 are the same chromosome."""
    c = str(chrom).strip()
    if not c:
        return ""
    if c.lower().startswith("chr"):
        c = c[3:]
    return "chr" + c.upper() if c.upper() in ("X", "Y", "M", "MT") else "chr" + c


def source(path=None):
    """The configured interval file, or None. Explicit arg > env > config."""
    if path:
        return str(path) if os.path.isfile(str(path)) else None
    env = os.environ.get("BAJASPLICE_UNTRUSTED_BED")
    if env and os.path.isfile(env):
        return env
    try:
        from .config import paths
        p = getattr(paths(), "untrusted_bed", None)
        if p and os.path.isfile(str(p)):
            return str(p)
    except Exception:
        pass
    return None


class Intervals(object):
    """Half-open BED intervals per chromosome, queryable by overlap."""

    def __init__(self, by_chrom=None, path=None):
        self.by_chrom = by_chrom or {}
        self.path = path

    def __len__(self):
        return sum(len(v[0]) for v in self.by_chrom.values())

    @classmethod
    def load(cls, path):
        """Read a BED. Column 4, when present, names what the twin is.

        A UCSC table dump (genomicSuperDups.txt and friends) is the same thing
        shifted one column right by a leading `bin`, and the offsets are NOT
        worth asking a user to know: reading chrom from the wrong column yields
        a file that parses, flags nothing, and looks like a clean locus. So the
        shift is detected per line instead -- the columns either read as
        chrom/start/end or they do not.
        """
        raw = {}
        with open(path) as fh:
            for line in fh:
                if not line.strip() or line.startswith(("#", "track", "browser")):
                    continue
                f = line.split()
                cols = None
                for off in (0, 1):      # plain BED, then bin-prefixed
                    if len(f) < off + 3:
                        continue
                    try:
                        lo, hi = int(f[off + 1]), int(f[off + 2])
                    except ValueError:
                        continue
                    c = f[off]
                    # a chromosome is not a number; without this a bin-prefixed
                    # row would match at off=0 with chrom="585"
                    if c.lstrip("-").isdigit() and len(f) > off + 3:
                        continue
                    cols = (c, lo, hi, f[off + 3] if len(f) > off + 3 else "")
                    break
                if cols is None:
                    continue            # a header row, or a line that is not an interval
                raw.setdefault(_norm(cols[0]), []).append(cols[1:])
        by_chrom = {}
        for c, rows in raw.items():
            rows.sort()
            # Parallel arrays plus a running max of `hi`, so an overlap query is a
            # bisect and a short walk back rather than a scan of the chromosome.
            starts = [r[0] for r in rows]
            ends = [r[1] for r in rows]
            names = [r[2] for r in rows]
            run = []
            m = -1
            for e in ends:
                m = e if e > m else m
                run.append(m)
            by_chrom[c] = (starts, ends, names, run)
        return cls(by_chrom, path)

    def hits(self, chrom, lo, hi):
        """Names of the intervals overlapping [lo, hi]; empty list for none."""
        rec = self.by_chrom.get(_norm(chrom))
        if not rec:
            return []
        starts, ends, names, run = rec
        lo, hi = (lo, hi) if lo <= hi else (hi, lo)
        i = bisect.bisect_right(starts, hi)          # every candidate starts at or before hi
        out = []
        j = i - 1
        while j >= 0 and run[j] >= lo:
            if ends[j] >= lo:
                out.append(names[j])
            j -= 1
        return out


def load(path=None):
    """The configured Intervals, or an empty set when nothing is configured."""
    p = source(path)
    if not p:
        return Intervals()
    try:
        return Intervals.load(p)
    except Exception:
        return Intervals()


def spans(iv, chrom, exons):
    """Which of `exons` ([lo, hi] pairs) are untrusted.

    Returns [{"xi": lo, "xf": hi, "why": name}], one entry per flagged exon.
    """
    out = []
    if not iv or not len(iv):
        return out
    for e in exons or ():
        try:
            lo, hi = int(e[0]), int(e[1])
        except Exception:
            continue
        names = iv.hits(chrom, lo, hi)
        if names:
            named = [n for n in names if n and n != "."]
            out.append({"xi": min(lo, hi), "xf": max(lo, hi),
                        "why": named[0] if named else ""})
    return out


def export_bed(ev, flag, out):
    """Write the cassette exons that mappability.cached_flags flagged, as BED.

    `ev` is the event table, `flag` the boolean array over it. Column 4 carries
    the gene, so a reader can see which locus the exon was confused with.
    """
    n = 0
    gene = (ev["gene_name"] if "gene_name" in ev.columns else ev["gene_id"]).astype(str).values
    with open(out, "w") as fh:
        fh.write("# exons with a near-identical twin in another gene: PSI not trustworthy\n")
        for i in range(len(ev)):
            if not bool(flag[i]):
                continue
            r = ev.iloc[i]
            fh.write("%s\t%d\t%d\t%s\n"
                     % (str(r.chrom), int(r.a_start), int(r.a_end), gene[i]))
            n += 1
    return n


def main():
    """bajasplice untrusted export -- build the BED from the cached flags."""
    import argparse
    ap = argparse.ArgumentParser(prog="bajasplice untrusted")
    ap.add_argument("action", choices=("export", "check"))
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    from .config import paths
    if a.action == "check":
        p = source()
        iv = load()
        print("untrusted_bed: %s" % (p or "NOT CONFIGURED -- nothing will be flagged"))
        print("intervals: %d" % len(iv))
        # The two halves are reported together because they answer one question:
        # what does the editor do at a duplicated locus? Without intervals it
        # states a PSI it cannot stand behind; with them it withholds it; with a
        # measured row it shows a measurement instead.
        try:
            from . import measured as _m
            rows = _m.load()
            print("measured_psi: %s" % (_m.table_path() or "NOT FOUND"))
            print("measured rows: %d" % len(rows))
            for (c, st), r in sorted(rows.items()):
                print("  %s %s:%d  ~%.0f%%  %s" % (r.get("gene", "?"), c, st,
                                                   100 * r["psi"], r.get("assay", "")))
        except Exception as e:
            print("measured_psi: could not be read (%s)" % e)
        return 0

    import pandas as pd
    from .mappability import cached_flags
    f = os.path.join(str(paths().interim), "cassette.tsv")
    ev = pd.read_csv(f, sep="\t")
    flag = cached_flags(ev)
    out = a.out or os.path.join(str(paths().interim), "untrusted_exons.bed")
    n = export_bed(ev, flag, out)
    print("wrote %s (%d exons of %d)" % (out, n, len(ev)))
    print("point the editor at it with:")
    print("  bajasplice config --untrusted-bed %s --save" % out)
    return 0
