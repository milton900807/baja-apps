"""Does an exon's conservation come from the peptide it encodes, or from the
sequence itself?

THE QUESTION. An exon regulated by an RNA-binding protein can be conserved
for two unrelated reasons. The peptide it adds may matter, in which case
selection acts on amino acids. Or the exon may itself be a regulatory
element, an exonic splicing enhancer the protein binds, in which case
selection acts on nucleotides and the peptide is incidental. dN/dS and
disorder prediction do not separate those, and for an RBP target the second
is the obvious confound, because the binding site lives inside the coding
sequence.

Codon position separates them, with no alignment and no outgroup. Within a
codon the third base is mostly free to vary without changing the amino acid,
so protein-level selection shows up as a GAP between the first two positions
and the third. Nucleotide-level selection does not care which position a base
occupies and so produces no gap. The per-exon gap

    gap = mean phyloP at codon positions 1 and 2
        - mean phyloP at codon position 3

is therefore a direct read on how much of an exon's conservation is about
the protein. A large gap means the amino acids are what is held. A gap near
zero on a conserved exon means the conservation is about the sequence.

WHERE THE FRAME COMES FROM, WHICH IS THE WHOLE CORRECTNESS QUESTION. The
cached CDS table drops the GTF frame column, so the phase is derived here
from the cumulative coding length preceding each record within its
transcript. That is the better of the two sources rather than a workaround:
a transcript whose CDS records do not tile a whole number of codons is
visible and can be dropped, where a trusted frame field would disagree
quietly. Transcripts whose total CDS length is not a multiple of three are
dropped for exactly this reason, which also removes the 5'-incomplete
transcripts whose first record genuinely starts out of phase.

FOUR CONTROLS, BUILT IN RATHER THAN ADDED AFTER. This module exists because
a measurement in this program kept producing findings that its own controls
later removed, and in every case the missing control was the one that asked
whether the comparison population had been through the same treatment.

  1. POSITIVE. Constitutive coding exons must show a large gap. Protein-level
     selection is strongest there, so a measurement that cannot see it there
     cannot see it anywhere.

  2. NEGATIVE, no reading frame. Non-coding exons scored with a pretend frame
     must show no gap. Any gap they do show is the floor under every number
     here, and is subtracted from nothing: it is reported so the reader can
     judge the rest against it.

  3. NEGATIVE, no exon. Intronic intervals scored with a pretend frame, same
     requirement.

  4. FRAME SHIFT. Every coding exon is also scored in the two wrong frames.
     The true frame must give the largest gap. This is the analogue of the
     coordinate check in the acceptor axis, and it is the strongest of the
     four, because a shifted frame keeps the exon, the region, the base
     composition and the alignment depth and changes only the thing being
     claimed.

A gap that survives all four is about amino acids. One that does not is
about something else, and the something else is usually composition.

TWO CLASSES CALIBRATE THE SCALE, AND BOTH COME FREE WITH THE ANNOTATION.
A poison exon carries an early in-frame stop and routes its transcript to
nonsense-mediated decay, so it is never translated into working protein. In
the SR splicing factors these elements are ultraconserved, held tighter than
the coding exons beside them, because the dosage control they provide is what
selection maintains. They should therefore be CONSERVED WITH NO GAP: the
nucleotides matter and the codon positions do not. Microexons are the
opposite pole, conserved because of the few amino acids they insert, so they
should be CONSERVED WITH A GAP.

Those two bracket the measurement. Any claim that an RBP's targets are
'conserved' should be read against them, because conserved-with-a-gap and
conserved-without-one mean different things and the usual statistics cannot
tell them apart. Poison exons are found here from the annotation's own
nonsense_mediated_decay transcript biotype rather than from a curated list:
a coding record used only by NMD-biotype transcripts, never by a
protein_coding one.
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

from bajasplice.evaluate.constraint_axis import Scores

MICRO_MAX = 15          # microexons, as the literature defines them: 3 to 15 nt
SHORT_MAX = 27          # the upper edge of the neural microexon program
SAMPLE = 4000           # exons scored per class unless --sample says otherwise
MIN_COVERED = 6         # an exon needs this many scored bases in each group
BOOT = 10000


# --- frame ---------------------------------------------------------------------

def transcript_order(df, strand):
    """CDS records in transcript order: ascending on +, descending on -."""
    return df.sort_values("start", ascending=(strand == "+"))


def cds_phase(cds):
    """Codon position of each CDS record's first base, in transcript order.

    Returns the frame column alongside a flag for transcripts whose coding
    length is not a multiple of three, which are the ones to drop.
    """
    out = []
    for (tx, strand), g in cds.groupby(["transcript_id", "strand"], sort=False):
        g = transcript_order(g, strand)
        lens = (g["end"] - g["start"] + 1).to_numpy(dtype=np.int64)
        before = np.concatenate([[0], np.cumsum(lens)[:-1]])
        whole = int(lens.sum()) % 3 == 0
        out.append(pd.DataFrame({
            "idx": g.index, "phase0": (before % 3).astype(int),
            "cds_len": int(lens.sum()), "in_frame": whole}))
    if not out:
        return cds.assign(phase0=np.nan, cds_len=np.nan, in_frame=False)
    f = pd.concat(out).set_index("idx")
    return cds.join(f)


def codon_positions(start, end, strand, phase0, shift=0):
    """Genomic positions and their codon position, for one CDS record.

    `phase0` is the codon position of the record's first base in transcript
    orientation; `shift` moves the reading frame and is how the frame-shift
    control is built. Returns positions ascending in genomic order, which is
    what Scores.values answers in.
    """
    start, end = int(start), int(end)
    n = end - start + 1
    i = np.arange(n)
    pos = (i + int(phase0) + int(shift)) % 3
    if strand == "-":
        pos = pos[::-1]
    return pos


# --- populations ---------------------------------------------------------------

def inclusion_fraction(df):
    """Per distinct exon, the share of its gene's transcripts that carry it.

    This is what separates constitutive from alternative without needing a
    splicing dataset: an exon in every transcript of its gene is constitutive
    by construction, and the ones in a minority are the alternative ones.
    """
    key = ["gene_id", "chrom", "start", "end", "strand"]
    per_gene = df.groupby("gene_id")["transcript_id"].nunique().rename("n_tx")
    per_exon = (df.groupby(key)["transcript_id"].nunique()
                .rename("n_tx_exon").reset_index())
    per_exon = per_exon.merge(per_gene, on="gene_id")
    per_exon["frac"] = per_exon["n_tx_exon"] / per_exon["n_tx"]
    return per_exon


def classify(per_exon, const_min=1.0, alt_max=0.5, min_tx=3):
    """Label each exon constitutive or alternative, and size-bin the latter."""
    d = per_exon[per_exon["n_tx"] >= min_tx].copy()
    d["len"] = d["end"] - d["start"] + 1
    d["cls"] = np.where(d["frac"] >= const_min, "constitutive",
                np.where(d["frac"] <= alt_max, "alternative", "intermediate"))
    size = np.where(d["len"] <= MICRO_MAX, "micro (3-15)",
            np.where(d["len"] <= SHORT_MAX, "short (16-27)", "long (28+)"))
    d["size"] = size
    d["group"] = np.where(d["cls"] == "alternative",
                          "alternative, " + d["size"], d["cls"])
    return d


def poison_cds(cds):
    """Coding records used only by NMD-biotype transcripts.

    GENCODE labels transcripts whose product is destroyed by nonsense-mediated
    decay, so a record appearing in those and never in a protein_coding
    transcript is a poison exon by the annotation's own reckoning rather than
    by guesswork here. Requires cds_phase to have run, since the frame comes
    from the same place as everything else.
    """
    key = ["chrom", "start", "end", "strand"]
    if "transcript_type" not in cds.columns:
        return cds.head(0).assign(group="poison (NMD-only)")
    tt = cds["transcript_type"].astype(str)
    nmd, pc = cds[tt == "nonsense_mediated_decay"], cds[tt == "protein_coding"]
    if len(nmd) == 0:
        return cds.head(0).assign(group="poison (NMD-only)")
    pc_keys = set(map(tuple, pc[key].to_numpy())) if len(pc) else set()
    keep = [tuple(r) not in pc_keys for r in nmd[key].to_numpy()]
    out = nmd[pd.Series(keep, index=nmd.index)].drop_duplicates(key).copy()
    out["group"] = "poison (NMD-only)"
    out["frac"] = np.nan
    return out


def read_sets(path, cds):
    """User-supplied exon classes, for sets the annotation does not label.

    Needs chrom, start, end, strand and class. The frame comes from a phase0
    column when there is one, otherwise from matching the coordinates against
    the CDS table. An exon the annotation does not contain, which is what a
    cryptic exon is, has neither, so it is reported and dropped: its frame
    depends on the coding length upstream of where it inserts, which is what
    the cryptic-fate module computes, and it has to be supplied rather than
    guessed here.
    """
    d = pd.read_csv(path, sep=None, engine="python")
    need = ["chrom", "start", "end", "strand", "class"]
    missing = [c for c in need if c not in d.columns]
    if missing:
        raise SystemExit(f"{path}: --sets needs columns {need}; missing "
                         f"{missing}; found {list(d.columns)}")
    d = d.copy()
    d["group"] = "set: " + d["class"].astype(str)
    key = ["chrom", "start", "end", "strand"]
    if "phase0" not in d.columns:
        ph = cds.drop_duplicates(key)[key + ["phase0"]]
        d = d.merge(ph, on=key, how="left")
    n_bad = int(d["phase0"].isna().sum())
    if n_bad:
        print(f"  --sets: {n_bad}/{len(d)} rows have no reading frame, from "
              f"neither a phase0 column nor the annotation, and are dropped")
    return d[d["phase0"].notna()]


def internal_only(d, cds):
    """Drop each transcript's first and last coding record.

    A terminal CDS record carries the start or stop codon and is flanked by
    untranslated sequence, so its frame and its conservation both behave
    differently from an internal one.
    """
    ends = []
    for (tx, strand), g in cds.groupby(["transcript_id", "strand"], sort=False):
        g = transcript_order(g, strand)
        if len(g) < 3:
            ends.append(g)
        else:
            ends.append(g.iloc[[0, -1]])
    term = pd.concat(ends)[["chrom", "start", "end", "strand"]].drop_duplicates()
    term["_terminal"] = True
    m = d.merge(term, on=["chrom", "start", "end", "strand"], how="left")
    return m[m["_terminal"].isna()].drop(columns=["_terminal"])


# --- scoring -------------------------------------------------------------------

def exon_gap(scores, chrom, start, end, strand, phase0, shift=0,
             min_covered=MIN_COVERED):
    """Mean phyloP at codon positions 1 and 2, at position 3, and the gap."""
    v = scores.values(chrom, start, end)
    if v.size == 0:
        return (np.nan, np.nan, np.nan, 0, 0)
    pos = codon_positions(start, end, strand, phase0, shift)
    if pos.size != v.size:
        return (np.nan, np.nan, np.nan, 0, 0)
    ok = np.isfinite(v)
    nd = ok & (pos != 2)
    dg = ok & (pos == 2)
    if nd.sum() < min_covered or dg.sum() < min_covered:
        return (np.nan, np.nan, np.nan, int(nd.sum()), int(dg.sum()))
    a, b = float(v[nd].mean()), float(v[dg].mean())
    return (a, b, a - b, int(nd.sum()), int(dg.sum()))


def score_rows(scores, rows, shifts=(0, 1, 2), label=""):
    """Score a frame of exon rows, in the true frame and the two wrong ones."""
    out = []
    for r in rows.itertuples():
        rec = {"chrom": r.chrom, "start": int(r.start), "end": int(r.end),
               "strand": r.strand, "gene": getattr(r, "gene_id", ""),
               "group": getattr(r, "group", label),
               "len": int(r.end) - int(r.start) + 1,
               "frac": getattr(r, "frac", np.nan)}
        for s in shifts:
            a, b, g, n1, n2 = exon_gap(scores, r.chrom, r.start, r.end,
                                       r.strand, getattr(r, "phase0", 0), s)
            tag = "" if s == 0 else f"_s{s}"
            rec[f"p12{tag}"], rec[f"p3{tag}"], rec[f"gap{tag}"] = a, b, g
            if s == 0:
                rec["n_nondeg"], rec["n_deg"] = n1, n2
        out.append(rec)
    return pd.DataFrame(out)


# --- statistics ----------------------------------------------------------------

def boot_ci(x, fn=np.mean, seed=0, n=BOOT):
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if x.size < 3:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    v = fn(x[rng.integers(0, x.size, size=(n, x.size))], axis=1)
    return (float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5)))


def describe(x, label, seed=0, width=34):
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if x.size < 3:
        print(f"  {label:<{width}} n={x.size:<6} too few")
        return
    lo, hi = boot_ci(x, seed=seed)
    flag = "" if (lo > 0 or hi < 0) else "   (interval spans zero)"
    print(f"  {label:<{width}} n={x.size:<6} gap={x.mean():+.4f}  "
          f"CI [{lo:+.4f}, {hi:+.4f}]{flag}")


def paired_within_gene(df, group, ref="constitutive", seed=0):
    """Each exon of `group` against its own gene's constitutive median.

    Pairing inside the gene is what holds expression, alignment depth,
    regional conservation and mutation rate fixed, which is the same reason
    the acceptor axis pairs inside the intron.
    """
    base = (df[df["group"] == ref].groupby("gene")["gap"].median()
            .rename("ref_gap"))
    sub = df[df["group"] == group].merge(base, left_on="gene",
                                         right_index=True, how="inner")
    d = (sub["gap"] - sub["ref_gap"]).dropna()
    if len(d) < 3:
        return None
    lo, hi = boot_ci(d.values, seed=seed)
    try:
        from scipy import stats as sps
        p = float(sps.wilcoxon(sub["gap"], sub["ref_gap"]).pvalue)
    except Exception:
        p = float("nan")
    return {"n": len(d), "diff": float(d.mean()), "lo": lo, "hi": hi, "p": p}


# --- the controls --------------------------------------------------------------

def noncoding_rows(exons, n, seed=0, kinds=("lncRNA", "processed_pseudogene")):
    """Non-coding exons, given a pretend frame.

    They have no reading frame at all, so a gap here is the measurement
    inventing one, and whatever it comes to is the floor under every coding
    number in this run.
    """
    d = exons[exons["gene_type"].astype(str).isin(kinds)].copy()
    d = d[(d["end"] - d["start"] + 1).between(60, 2000)]
    if len(d) == 0:
        return d.assign(phase0=0, group="control: non-coding")
    d = d.drop_duplicates(["chrom", "start", "end", "strand"])
    d = d.sample(min(n, len(d)), random_state=seed)
    return d.assign(phase0=0, group="control: non-coding")


def intron_rows(cds, n, seed=0, margin=100, want=400):
    """Intervals inside introns, given a pretend frame.

    Held `margin` clear of both splice sites, so the interval carries neither
    the acceptor nor the donor, and no coding sequence at all.
    """
    rng = np.random.default_rng(seed)
    out = []
    txs = cds["transcript_id"].drop_duplicates()
    if len(txs) > 4 * n:
        txs = txs.sample(4 * n, random_state=seed)
    for (tx, strand), g in cds[cds["transcript_id"].isin(txs)].groupby(
            ["transcript_id", "strand"], sort=False):
        g = g.sort_values("start")
        s = g["end"].to_numpy()[:-1] + 1 + margin
        e = g["start"].to_numpy()[1:] - 1 - margin
        ch = g["chrom"].to_numpy()[:-1]
        keep = e - s + 1 >= want
        for c, a, b in zip(ch[keep], s[keep], e[keep]):
            out.append({"chrom": c, "start": int(a), "end": int(a) + want - 1,
                        "strand": strand, "gene_id": tx, "phase0": 0,
                        "group": "control: intron"})
        if len(out) >= n * 2:
            break
    if not out:
        return pd.DataFrame(columns=["chrom", "start", "end", "strand",
                                     "gene_id", "phase0", "group"])
    d = pd.DataFrame(out)
    return d.sample(min(n, len(d)), random_state=seed)


def frame_shift_verdict(cod):
    """The true frame must beat both wrong ones. Returns a verdict string."""
    g0, g1, g2 = (cod[c].mean() for c in ("gap", "gap_s1", "gap_s2"))
    print(f"\n  FRAME SHIFT, the strongest control: the same exons, the same "
          f"bases,\n  the same composition, read in the two wrong frames.")
    for lab, v in (("true frame", g0), ("shifted by 1", g1),
                   ("shifted by 2", g2)):
        print(f"    {lab:<16} gap={v:+.4f}")
    if g0 > g1 and g0 > g2:
        margin = g0 - max(g1, g2)
        return (f"    PASS: the true frame leads by {margin:+.4f}. The gap "
                f"tracks the reading frame,\n          which composition "
                f"alone cannot do.")
    return ("    FAIL: a wrong frame scores as well as the right one, so the "
            "gap is not\n          about codons. Nothing below is "
            "interpretable.")


# --- build ---------------------------------------------------------------------

def build(args):
    from bajanmd.consequence import annotation_tables
    exons, cds = annotation_tables(args.annotation)
    print(f"annotation {args.annotation}: {len(exons)} exon records, "
          f"{len(cds)} CDS records")

    cds = cds[cds["chrom"].astype(str).str.startswith("chr")].copy()
    cds = cds.reset_index(drop=True)   # cds_phase joins on the index
    cds = cds_phase(cds)
    before = cds["transcript_id"].nunique()
    cds = cds[cds["in_frame"]]
    after = cds["transcript_id"].nunique()
    print(f"  transcripts whose CDS tiles whole codons: {after}/{before} "
          f"({after / max(before, 1):.1%}); the rest are dropped because "
          f"their frame cannot be derived")

    per = classify(inclusion_fraction(cds), const_min=args.const_min,
                   alt_max=args.alt_max, min_tx=args.min_tx)
    per = internal_only(per, cds)
    # One exon can be read in different frames by different transcripts. Those
    # have no single answer here, so they are dropped rather than resolved by
    # whichever row happened to sort first.
    key = ["chrom", "start", "end", "strand"]
    agree = cds.groupby(key)["phase0"].nunique()
    ph = (cds[cds.set_index(key).index.isin(agree[agree == 1].index)]
          .drop_duplicates(key)[key + ["phase0"]])
    n_amb = int((agree > 1).sum())
    print(f"  exons read in one frame by every transcript that uses them: "
          f"{len(ph)}; {n_amb} read in more than one and dropped")
    per = per.merge(ph, on=key, how="inner")
    print("\n  coding exons by class, before sampling:")
    for g, k in per["group"].value_counts().items():
        print(f"    {g:<28} {k}")

    rng = np.random.default_rng(args.seed)
    picks = []
    for g, sub in per.groupby("group"):
        if len(sub) < 20:
            continue
        picks.append(sub.sample(min(args.sample, len(sub)),
                                random_state=args.seed))
    coding = pd.concat(picks) if picks else per.head(0)

    poison = poison_cds(cds)
    print(f"\n  poison exons from the annotation's NMD biotype: {len(poison)}")
    if len(poison) > args.sample:
        poison = poison.sample(args.sample, random_state=args.seed)
    extra = read_sets(args.sets, cds) if args.sets else None

    scores = Scores(args.scores)
    n_extra = 0 if extra is None else len(extra)
    print(f"\nscoring {len(coding) + len(poison) + n_extra} exons in three "
          f"frames, plus controls")
    cod = score_rows(scores, coding)
    if len(poison) >= 20:
        cod = pd.concat([cod, score_rows(scores, poison)], ignore_index=True)
    if extra is not None and len(extra):
        cod = pd.concat([cod, score_rows(scores, extra)], ignore_index=True)
    nc = score_rows(scores, noncoding_rows(exons, args.sample, args.seed),
                    shifts=(0,), label="control: non-coding")
    itr = score_rows(scores, intron_rows(cds, args.sample, args.seed),
                     shifts=(0,), label="control: intron")
    return cod, nc, itr


def summarize(cod, nc, itr, seed=0):
    print("\n" + "=" * 72)
    print("GAP = mean phyloP at codon positions 1 and 2, minus position 3.")
    print("Large gap: the amino acids are what is conserved.")
    print("Gap near zero on conserved sequence: the nucleotides are.")
    print("=" * 72)

    print("\n[1] CONTROLS")
    for d, lab in ((nc, "non-coding exons"), (itr, "intronic intervals")):
        if len(d):
            describe(d["gap"], f"{lab}, pretend frame", seed=seed)
    con = cod[cod["group"] == "constitutive"]
    if len(con):
        describe(con["gap"], "constitutive coding", seed=seed + 1)
    verdict = frame_shift_verdict(cod) if len(cod) else "    no coding exons"
    print(verdict)

    print("\n[2] BY CLASS, unpaired")
    print("    Read every class against the two calibration poles: a poison")
    print("    exon is conserved with NO gap, a microexon conserved WITH one.")
    for g, sub in cod.groupby("group"):
        describe(sub["gap"], g, seed=seed + 2)
    poi = cod[cod["group"] == "poison (NMD-only)"]["gap"].dropna()
    mic = cod[cod["group"].str.contains("micro", na=False)]["gap"].dropna()
    if len(poi) >= 3 and len(mic) >= 3:
        print(f"\n    the two poles differ by {mic.mean() - poi.mean():+.4f}"
              f" (microexon minus poison).")
        print("    A small difference means this measurement cannot tell "
              "regulatory\n    constraint from protein constraint, and no "
              "class below is interpretable.")

    print("\n[3] AGAINST THE SAME GENE'S CONSTITUTIVE EXONS")
    print("    (positive = more of this exon's conservation is about the "
          "protein)")
    for g in sorted(set(cod["group"]) - {"constitutive"}):
        r = paired_within_gene(cod, g, seed=seed + 3)
        if r is None:
            print(f"  {g:<34} too few paired")
            continue
        flag = "" if (r["lo"] > 0 or r["hi"] < 0) else "   (spans zero)"
        print(f"  {g:<34} n={r['n']:<6} diff={r['diff']:+.4f}  "
              f"CI [{r['lo']:+.4f}, {r['hi']:+.4f}]  p={r['p']:.3g}{flag}")
    return verdict


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scores", required=True,
                    help="phyloP bigWig, or a chrom/pos/score table")
    ap.add_argument("--annotation", default="current")
    ap.add_argument("--sample", type=int, default=SAMPLE,
                    help="exons scored per class")
    ap.add_argument("--min-tx", type=int, default=3,
                    help="a gene needs this many transcripts before its exons "
                         "can be called constitutive or alternative")
    ap.add_argument("--const-min", type=float, default=1.0)
    ap.add_argument("--alt-max", type=float, default=0.5)
    ap.add_argument("--sets", default=None,
                    help="TSV or CSV of extra exon classes to score, with "
                         "columns chrom, start, end, strand, class, and "
                         "optionally phase0. Use it for sets the annotation "
                         "does not label, such as an RBP's targets; a cryptic "
                         "exon absent from the annotation needs its phase0 "
                         "supplied, since its frame depends on the coding "
                         "length upstream of where it inserts")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=None, help="per-exon table")
    args = ap.parse_args(argv)

    cod, nc, itr = build(args)
    summarize(cod, nc, itr, seed=args.seed)
    if args.out:
        pd.concat([cod, nc, itr]).to_csv(args.out, sep="\t", index=False)
        print(f"\nper-exon table written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
