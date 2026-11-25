"""How old is a cryptic acceptor, and was the site already there?

THE PROBLEM THIS SOLVES. Conservation cannot tell a young exon on the
exonization route from permanent splicing noise, because both predict no
constraint: a newly born exon shows markedly accelerated substitution, so
absence of conservation is its expected state. The variable that does
separate them is age. The exonization route predicts a maturation gradient,
where older sites are more included, more often in frame and more often
coding. Noise predicts no relationship between age and anything.

WHAT WAS TRIED FIRST AND DOES NOT WORK, recorded so nobody repeats it.
Alignment coverage in the 470-way phyloP track looked like a free age proxy:
a young lineage-specific insertion should be less alignable than the intron
around it. It is not usable. Coverage is above 99% everywhere, so the dynamic
range is under one percent, and matched on distance from the nearest exon the
cryptic acceptors are indistinguishable from decoys in their own introns
(Fisher p = 1 pooled, and p = 0.55, 1 and 1 in the distance bands). That null
does establish one thing worth keeping: these positions are not recently
inserted DNA. The sequence is old even if its use as an exon is not, which
fits an origin by point mutation in ancient intronic sequence rather than by
transposon insertion, and matches the published finding that TDP-43 cryptic
exons, unlike hnRNP C's, cannot be linked to transposable elements.

WHAT THIS MODULE DOES INSTEAD. It lifts each human cryptic acceptor to one or
more other assemblies and asks what is there, which gives three outcomes per
species, and the third is the interesting one.

  SEQUENCE ABSENT    the position does not lift. The locus is younger than
                     the split with that species, or has been rearranged.

  SITE ABSENT        the position lifts, but the dinucleotide is not AG. The
                     sequence is old and the splice site arose later, in the
                     human lineage or after that split.

  SITE PRESENT       the position lifts and reads AG, with a polypyrimidine
                     tract scoring like a 3' splice site. The site is old and
                     has been sitting there unused. This is the only outcome
                     that supports a reservoir rather than an accident,
                     because it says the capacity predates the lineage and
                     was not acted on.

A clock needs at least two time points. With hg38 to rheMac10 (about 25
million years) and hg38 to mm39 (about 90 million years), each site sorts
into primate-specific, mammal-wide, or neither, which is coarse but enough to
ask whether age predicts frame class, inclusion or conservation.

WHAT YOU HAVE TO FETCH. Two chain files from UCSC, each a few hundred MB at
most, plus the target genome FASTA for the dinucleotide check:

  hg38ToMm39.over.chain.gz      hg38ToRheMac10.over.chain.gz

Without a target FASTA the module still reports whether each position lifts,
which answers SEQUENCE ABSENT on its own and is the cheapest half of the
calculation.
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

PWM_SPAN = (-20, 2)
MIN_PY = 0.55          # pyrimidine fraction over the tract to call it usable
TRACT = (-20, -4)      # the polypyrimidine tract, in transcript orientation


def genomic_pos(acceptor, strand, offset):
    return int(acceptor) + int(offset) if strand == "+" else int(acceptor) - int(offset)


def genomic_span(acceptor, strand, lo, hi):
    a = genomic_pos(acceptor, strand, lo)
    b = genomic_pos(acceptor, strand, hi)
    return (min(a, b), max(a, b))


def acceptor_from_junction(j1, j2, strand):
    return int(j2) - 1 if strand == "+" else int(j1) + 1


# --- lifting --------------------------------------------------------------------

class Lifter:
    """hg38 to one target assembly, via a UCSC chain file.

    Wrapped rather than used directly so the rest of the module can be tested
    without a 300 MB download, and so a position that lifts to several places
    is treated as unliftable rather than as whichever came first: an ambiguous
    mapping is not evidence the site is old.
    """

    def __init__(self, chain):
        from pyliftover import LiftOver
        self.lo = LiftOver(str(chain))

    def lift(self, chrom, pos):
        """1-based position in, (chrom, pos, strand) or None out."""
        hits = self.lo.convert_coordinate(str(chrom), int(pos) - 1)
        if not hits or len(hits) != 1:
            return None
        c, p, s = hits[0][0], hits[0][1] + 1, hits[0][2]
        return (str(c), int(p), str(s))


def flip(strand):
    return "-" if strand == "+" else "+"


def target_strand(human_strand, lift_strand):
    """A chain can map to the opposite strand, which flips the gene's sense."""
    return human_strand if lift_strand == "+" else flip(human_strand)


# --- target genome access -------------------------------------------------------

class TargetFasta:
    """A FASTA for a species that is deliberately NOT the running build's.

    GenomeReader is the wrong tool here and fails two ways, both silently
    fatal. First, it runs check_assembly, whose whole job is to refuse a
    foreign genome: pointed at a rhesus or mouse FASTA while the process runs
    as human it raises, which is correct for the training path and wrong for a
    cross-species lift. Second, it looks contigs up by exact name. A chain
    file emits UCSC names (chr1), and an Ensembl FASTA is keyed 1, so every
    rhesus lookup would KeyError while a GENCODE mouse FASTA, keyed chr1,
    would work. A tool that reads two assemblies from two sources has to
    resolve the naming itself rather than assume one convention.

    So this reader does no species check and resolves names through an alias
    map built from the keys the file actually has, in both directions.
    """

    def __init__(self, path):
        from pyfaidx import Fasta
        self.path = str(path)
        self.fa = Fasta(self.path, as_raw=True, sequence_always_upper=True)
        self.alias = {}
        for k in self.fa.keys():
            self.alias.setdefault(k, k)
            bare = k[3:] if k.lower().startswith("chr") else k
            self.alias.setdefault(bare, k)
            self.alias.setdefault("chr" + bare, k)
            # MT and chrM name the same contig in the two conventions
            if bare in ("M", "MT"):
                self.alias.setdefault("chrM", k)
                self.alias.setdefault("MT", k)

    def resolve(self, chrom):
        """The file's own key for this name, or None if it has no such contig."""
        return self.alias.get(str(chrom))

    def sequence(self, chrom, start, end, strand="+"):
        """1-based inclusive [start, end] in transcript orientation.

        Returns "" for an unknown contig or an empty span, which classify
        reads as `lifted, sequence unread` rather than as a missing site: not
        reading a base is not evidence that the base is absent.
        """
        key = self.resolve(chrom)
        if key is None:
            return ""
        clen = len(self.fa[key])
        s, e = max(1, int(start)), min(clen, int(end))
        if e < s:
            return ""
        seq = str(self.fa[key][s - 1:e]).upper()
        if strand == "-":
            seq = seq[::-1].translate(_RC)
        return seq


_RC = str.maketrans("ACGTN", "TGCAN")


# --- what is at the lifted position ---------------------------------------------

def dinucleotide(genome, chrom, acceptor, strand):
    """The two bases ending at the acceptor, in transcript orientation."""
    lo, hi = genomic_span(acceptor, strand, -1, 0)
    seq = genome.sequence(str(chrom), lo, hi, strand)
    return str(seq).upper()[-2:] if seq else ""


def pyrimidine_fraction(genome, chrom, acceptor, strand, span=TRACT):
    """Share of C and T over the polypyrimidine tract, in transcript orientation.

    A 3' splice site needs the tract as much as it needs the AG, and a UG
    repeat read on the antisense strand supplies exactly that, which is why
    these positions are spliceable at all. Checking the dinucleotide alone
    would call a site present where no spliceosome could use it.
    """
    lo, hi = genomic_span(acceptor, strand, *span)
    seq = str(genome.sequence(str(chrom), lo, hi, strand) or "").upper()
    if not seq:
        return float("nan")
    return sum(c in "CT" for c in seq) / len(seq)


def classify(lifted, dinuc, py, min_py=MIN_PY):
    """What is at the orthologous position.

    Losing the AG and keeping the AG over a weak tract are different events
    and must not share a label. On the first run they did, and 40 of 103
    macaque "site absent" calls turned out to carry an intact AG, 18 of them
    within one base of passing: the tract cutoff, not the dinucleotide, was
    making the call. Worse, STMN2 exon 2a came back "site absent" in macaque
    because the UG element there is replaced by an AG-rich tract in Old World
    monkeys, and an AG tract is purine-rich, so it fails a pyrimidine test by
    construction. That locus is characterized and present; calling it absent
    is wrong. Keeping the two apart lets a reader see which one they have.
    """
    if lifted is None:
        return "sequence absent"
    if not dinuc:
        return "lifted, sequence unread"
    if dinuc != "AG":
        return "dinucleotide lost"
    if np.isfinite(py) and py < min_py:
        return "tract below cutoff"
    return "site present"


#: states that are not a usable site, in the order classify can return them
NOT_PRESENT = ("sequence absent", "lifted, sequence unread",
               "dinucleotide lost", "tract below cutoff")


# --- the run --------------------------------------------------------------------

def age_call(per_species, order):
    """Deepest species where the site is still present, as a coarse age.

    `order` runs from the closest relative outward, so the first species that
    lacks the site bounds the age. A site present in the outermost species
    tested is reported as at least that old rather than as a number, because
    the chains do not go deeper.
    """
    deepest = None
    broke_at = None
    for sp in order:
        state = per_species.get(sp)
        if state == "site present":
            deepest = sp
        else:
            broke_at = sp
            break
    if deepest is None and broke_at is not None:
        # Nothing in the closest relative. If a DEEPER species still has the
        # site, this is not "human only": the pattern is non-monotonic and
        # means convergent gain or loss in the closer lineage, which no single
        # age describes. Folding it into human only hid 8 of 354 events on the
        # first run, UNC13A among them, where they were indistinguishable from
        # events with nothing in any species.
        if any(per_species.get(sp) == "site present" for sp in order):
            return "non-monotonic"
    return deepest or "human only"


#: columns score_events generates itself, which an input may not shadow
GENERATED = ("gene", "chrom", "strand", "acceptor", "fate", "frame_disrupting",
             "age")


def passthrough_columns(events, order):
    """Input columns to copy into the output untouched.

    Without this the output held a fixed six columns and everything else was
    dropped. That silently discarded `parent_acceptor`, `dist_exon` and
    `is_decoy` from the decoy table, which are exactly the columns a paired or
    covariate-matched comparison needs, so the decoy run produced a file that
    could only be compared in aggregate.
    """
    per_sp = {f"{sp}_{k}" for sp in order
              for k in ("pos", "dinuc", "py", "state")}
    return [c for c in events.columns
            if c not in GENERATED and c not in per_sp]


def score_events(events, lifters, genomes, order, min_py=MIN_PY):
    rows = []
    extra = passthrough_columns(events, order)
    for r in events.itertuples():
        rec = {"gene": getattr(r, "gene", ""), "chrom": r.chrom,
               "strand": r.strand, "acceptor": int(r.acceptor),
               "fate": getattr(r, "fate", ""),
               "frame_disrupting": getattr(r, "frame_disrupting", "")}
        for c in extra:
            rec[c] = getattr(r, c, None)
        per = {}
        for sp in order:
            lift = lifters[sp].lift(r.chrom, int(r.acceptor))
            if lift is None:
                per[sp] = "sequence absent"
                rec[f"{sp}_pos"] = ""
                continue
            c, p, s = lift
            st = target_strand(str(r.strand), s)
            rec[f"{sp}_pos"] = f"{c}:{p}:{st}"
            g = genomes.get(sp)
            if g is None:
                per[sp] = "lifted, sequence unread"
                continue
            d = dinucleotide(g, c, p, st)
            py = pyrimidine_fraction(g, c, p, st)
            rec[f"{sp}_dinuc"], rec[f"{sp}_py"] = d, py
            per[sp] = classify(lift, d, py, min_py)
        for sp in order:
            rec[f"{sp}_state"] = per[sp]
        rec["age"] = age_call(per, order)
        rows.append(rec)
    return pd.DataFrame(rows)


def _text(v):
    """A stripped string, treating NaN and None as empty."""
    if v is None or v != v:
        return ""
    return str(v).strip()


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return float("nan")
    return f


def inframe_trend(t):
    """Cochran-Armitage trend on in-frame share, youngest age class outward.

    This is the test the exonization claim actually makes. A chi-square over
    the whole fate table does NOT test it: on the first run the table gave
    p=0.0034 while in-frame versus the rest gave p=0.275, and deleting the
    in-frame column made the table p SMALLER (0.0034 -> 0.0011), which is
    proof that in-frame contributed nothing to it. Printing the table p under
    the in-frame numbers invited exactly the wrong reading, so the two are
    now computed and labelled separately.
    """
    from scipy import stats as sps
    rows = [r for r in AGE_ORDER if r in t.index]
    if len(rows) < 2 or "in_frame" not in t:
        return None
    t = t.loc[rows]
    x = t["in_frame"].to_numpy(float)
    n = t.sum(axis=1).to_numpy(float)
    scores = np.arange(len(rows), dtype=float)
    pbar = x.sum() / n.sum()
    if pbar in (0.0, 1.0):
        return None
    var = pbar * (1 - pbar) * ((n * scores ** 2).sum()
                               - (n * scores).sum() ** 2 / n.sum())
    if var <= 0:
        return None
    z = (scores * (x - n * pbar)).sum() / np.sqrt(var)
    return z, 2 * (1 - sps.norm.cdf(abs(z)))


#: youngest first, so the trend score is ordered
AGE_ORDER = ("human only", "macaque", "mouse")


def threshold_sweep(df, order, cutoffs=(0.0, 0.35, 0.45, 0.5, 0.55, 0.6, 0.7)):
    """Re-derive the states and ages at other tract cutoffs.

    MIN_PY is a constant nobody calibrated, and the tract window is 17 bases,
    so the fraction can only take k/17 and one base flips a call. On the first
    run the whole result moved with it: macaque "site present" ran from 78% at
    0.0 to 33% at 0.75, and the fate-table p was 0.24 at one end and 0.19 at
    the other while peaking at 0.0034 on the default. A number that is the
    maximum of the sweep over its own free parameter is not a finding, so the
    sweep is printed with the result rather than left for someone to run.
    """
    out = []
    for mp in cutoffs:
        ages, present = [], 0
        for r in df.itertuples():
            per = {}
            for sp in order:
                # NaN is truthy and is not a str, so `x or ""` leaves a float
                # here and .strip() raises. An empty cell reads as NaN from
                # read_csv, which is the common case, so this is the path.
                per[sp] = classify(_text(getattr(r, f"{sp}_pos", "")) or None,
                                   _text(getattr(r, f"{sp}_dinuc", "")),
                                   _num(getattr(r, f"{sp}_py", float("nan"))),
                                   mp)
            present += per.get(order[0]) == "site present"
            ages.append(age_call(per, order))
        out.append((mp, present, pd.Series(ages)))
    return out


def summarize(df, order):
    print("\n" + "=" * 70)
    print("WHAT IS AT THE ORTHOLOGOUS POSITION")
    print("=" * 70)
    for sp in order:
        col = f"{sp}_state"
        if col not in df:
            continue
        print(f"\n  {sp}")
        for k, v in df[col].value_counts().items():
            print(f"    {k:<26} {v:>6}  {v / len(df):>6.1%}")
        n_abs = (df[col] == "dinucleotide lost").sum()
        n_tract = (df[col] == "tract below cutoff").sum()
        if n_tract:
            print(f"    -> of the {n_abs + n_tract} positions without a usable site, "
                  f"{n_tract} keep an intact AG and")
            print(f"       fail only the tract cutoff of {MIN_PY}, which is an "
                  f"uncalibrated constant.")

    print("\n  age, by the deepest species still carrying a usable site:")
    for k, v in df["age"].value_counts().items():
        print(f"    {k:<26} {v:>6}  {v / len(df):>6.1%}")
    if (df["age"] == "non-monotonic").any():
        n = (df["age"] == "non-monotonic").sum()
        print(f"\n    {n} events have a site in a deeper species but not in the "
              f"closest one.\n    No single age describes these; they are not "
              f"'human only'.")

    if "fate" in df and df["fate"].astype(str).str.len().gt(0).any():
        t = pd.crosstab(df["age"], df["fate"])
        if len(t):
            print("\nDOES AGE PREDICT FRAME CLASS?")
            print("  Exonization predicts a gradient: older sites more often "
                  "in frame.")
            print(t.to_string())
            share = (t.get("in_frame", pd.Series(0, index=t.index))
                     / t.sum(axis=1))
            print("\n  in-frame share by age:")
            for k, v in share.items():
                print(f"    {k:<26} {v:>6.1%}")
            tr = inframe_trend(t)
            if tr:
                z, p = tr
                print(f"\n  THE GRADIENT, tested directly (Cochran-Armitage on "
                      f"in-frame share):")
                print(f"    z={z:+.3f}  p={p:.3g}   <- this is the exonization "
                      f"claim, and nothing else is")
            try:
                from scipy import stats as sps
                if t.shape[0] > 1 and t.shape[1] > 1:
                    # Unpacked, not `.pvalue`: chi2_contingency returned a
                    # plain 4-tuple until scipy 1.11, and this has to run on
                    # a Python 3.9 venv with an older scipy. Unpacking works
                    # on every version.
                    _, chi_p, _, _ = sps.chi2_contingency(t.values)
                    print(f"\n  Separately, the whole fate table: p="
                          f"{chi_p:.3g}")
                    print("    This asks whether ANY fate class shifts with age, "
                          "not whether in-frame\n    rises with it. A small p "
                          "here is not support for the gradient.")
            except Exception:
                pass

    missing = [c for sp in order
               for c in (f"{sp}_pos", f"{sp}_dinuc", f"{sp}_py")
               if c not in df.columns]
    if missing:
        print(f"\n  (no tract sweep: table lacks {', '.join(missing)})")
        sweep = None
    else:
        sweep = threshold_sweep(df, order)
    if sweep:
        print("\n" + "=" * 70)
        print(f"HOW MUCH OF THIS IS THE TRACT CUTOFF? (the run used {MIN_PY})")
        print("=" * 70)
        print(f"  {'cutoff':>7} {order[0] + ' present':>18} "
              f"{'human only':>11} {'in-frame trend p':>17} {'fate table p':>13}")
        from scipy import stats as sps
        for mp, present, ages in sweep:
            t = pd.crosstab(ages, df["fate"].reset_index(drop=True))
            tp = fp = float("nan")
            if len(t) > 1 and t.shape[1] > 1:
                tr = inframe_trend(t)
                tp = tr[1] if tr else float("nan")
                _, fp, _, _ = sps.chi2_contingency(t.values)
            flag = "  <- run" if abs(mp - MIN_PY) < 1e-9 else ""
            print(f"  {mp:>7.2f} {present:>18} {(ages == 'human only').sum():>11} "
                  f"{tp:>17.3f} {fp:>13.4f}{flag}")
        print("\n  Read down the last two columns before quoting either. A p that "
              "is small only\n  at the default, and null at both ends of the "
              "sweep, is a property of the cutoff.")

    print("\n  WHAT IS STILL MISSING: there is no null here. Human and macaque "
          "are ~93%\n  identical, so an AG at an orthologous position survives "
          "by default most of the\n  time. Until matched intronic decoy AGs run "
          "through this same pipeline, a high\n  'site present' rate is not "
          "evidence of age.")


def read_events(path):
    """Load an events table and give every row an `acceptor` column.

    Accepts three shapes, in this order: an explicit `acceptor`; `a_start`
    and `a_end` exon spans, where the acceptor is the base before the exon in
    transcript orientation; or any column with "junc" in its name holding a
    pasteable junction string.

    `sep=None` sniffs tab against comma, which needs the python engine, and
    the python engine rejects `low_memory`. Passing both raises before a row
    is read, so this is a function with a test rather than a line inside
    main() that only runs in production.
    """
    ev = pd.read_csv(path, sep=None, engine="python")
    if "acceptor" not in ev.columns:
        if {"a_start", "a_end"} <= set(ev.columns):
            ev["acceptor"] = np.where(ev["strand"] == "+",
                                      ev["a_start"] - 1, ev["a_end"] + 1)
        else:
            jc = next((c for c in ev.columns if "junc" in c.lower()), None)
            if jc is None:
                raise SystemExit(
                    "need an acceptor column, a_start/a_end, or a junction "
                    f"column; found {list(ev.columns)}")
            from bajasplice.evaluate.motif_background import parse_junction
            parsed = ev[jc].map(parse_junction)
            ev["chrom"] = [x[0] for x in parsed]
            ev["acceptor"] = [acceptor_from_junction(x[1], x[2], st)
                              for x, st in zip(parsed, ev["strand"])]
    ev = ev.dropna(subset=["chrom", "strand", "acceptor"])
    ev["acceptor"] = ev["acceptor"].astype("int64")
    return ev


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", required=True,
                    help="table with chrom, strand and either acceptor, or a "
                         "junction column, or a_start/a_end exon spans")
    ap.add_argument("--chain", action="append", default=[], metavar="SP=PATH",
                    help="target assembly and its hg38 chain, closest "
                         "relative first; repeatable, e.g. "
                         "--chain macaque=hg38ToRheMac10.over.chain.gz")
    ap.add_argument("--genome", action="append", default=[], metavar="SP=PATH",
                    help="target FASTA for the dinucleotide and tract check. "
                         "Without it the run still answers whether the "
                         "position lifts at all")
    ap.add_argument("--min-py", type=float, default=MIN_PY)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    ev = read_events(args.events)
    print(f"{len(ev)} events from {args.events}")

    order, lifters, genomes = [], {}, {}
    for spec in args.chain:
        if "=" not in spec:
            raise SystemExit(f"--chain wants SP=PATH, got {spec!r}")
        sp, path = spec.split("=", 1)
        order.append(sp)
        print(f"  loading chain for {sp}: {os.path.basename(path)}")
        lifters[sp] = Lifter(os.path.expanduser(path))
    if not order:
        raise SystemExit("at least one --chain is required")
    for spec in args.genome:
        if "=" not in spec:
            raise SystemExit(f"--genome wants SP=PATH, got {spec!r}")
        sp, path = spec.split("=", 1)
        path = os.path.expanduser(path)
        if not os.path.exists(path):
            raise SystemExit(f"--genome {sp}: no such file {path}")
        print(f"  loading genome for {sp}: {os.path.basename(path)}")
        genomes[sp] = TargetFasta(path)
    missing = [sp for sp in order if sp not in genomes]
    if missing:
        print(f"  no FASTA for {missing}; those report lifting only, which "
              f"answers whether the sequence is there but not whether the "
              f"site is")

    df = score_events(ev, lifters, genomes, order, min_py=args.min_py)
    summarize(df, order)
    if args.out:
        df.to_csv(args.out, sep="\t", index=False)
        print(f"\nper-event table written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
