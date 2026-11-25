"""Sequence features for every cryptic acceptor, computed rather than inherited.

WHY. The first model attempt fitted the compendium's own columns and reached
Spearman +0.04 against a cross-cell-line ceiling of +0.66. The labels were
reproducible, so the failure was the features. Two of them explain it:
`score_cryptic` and `score_ann` carried acceptor strength and existed for 64
of 294 acceptor rows (22%), so they were refused rather than median-imputed;
and the TDP-43 element was represented by `longest_ug_region`, which has 18
distinct values across the whole table, with `dist_nearest_ug_region` missing
for half of it. The model ran without the two quantities that matter.

Everything here is computed from hg38 for every row, so coverage is 100% by
construction.

WHAT IS DELIBERATELY NOT HERE: BajaCLIP occupancy. Its own docstring records
that the probabilities saturate on genomic windows at a median around 0.99 and
that logits do not recover RBP specificity, the channels staying highly
correlated. A per-RBP "TARDBP occupancy" drawn from it would be a number
without the meaning its name claims. The structural definition is used
instead: `motif_background.MOTIFS` already encodes TARDBP as ("TG", "run"),
the (UG)n repeat, which is interpretable, full-coverage and the actual binding
determinant.

TRACT METRICS ARE CONTINUOUS. The thresholded version of this question cost an
evening: a hard pyrimidine cutoff of 0.55 on a 17-base window, where the
fraction can only take k/17, produced a result that moved from 78% to 33% as
the cutoff swept and whose significance peaked exactly on the default. Nothing
here thresholds anything; the windows are reported as fractions and a model
can find its own boundary.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

from bajasplice.evaluate.motif_background import MOTIFS, longest_repeat

__all__ = ["UPSTREAM", "WINDOWS", "ug_features", "tract_features",
           "splicenet_scores", "build_features", "main"]

#: Intronic window upstream of the acceptor, in transcript orientation, where
#: the branch point, the pyrimidine tract and TDP-43's element all sit.
UPSTREAM = 300
#: Nested windows immediately upstream. The tract is classically 10-25 nt out;
#: wider windows catch the UG element, which sits further away.
WINDOWS = (10, 20, 40, 80, 150, 300)


def _rc(seq):
    return seq[::-1].translate(str.maketrans("ACGTN", "TGCAN"))


def upstream_seq(fasta, chrom, acceptor, strand, span=UPSTREAM):
    """`span` intronic bases ending AT the acceptor, in transcript orientation.

    The acceptor is the last intronic base, so the window runs up to and
    including it. On the minus strand that is the other genomic direction, and
    getting the sign wrong here reads the donor's neighbourhood instead, which
    is the single most repeated error in this codebase's history.
    """
    a = int(acceptor)
    if strand == "+":
        return fasta.sequence(chrom, a - span + 1, a, "+")
    return fasta.sequence(chrom, a, a + span - 1, "-")


def ug_features(seq):
    """TARDBP's element, structurally: the (UG)n repeat and where it sits.

    `seq` runs 5' to 3' in transcript orientation and ENDS at the acceptor, so
    index -1 is the acceptor itself and distances are measured back from it.

    On the `ug_run_*` scale: longest_repeat tries every phase of the unit, so a
    lone T or G scores 1 and only 2 or more is a real TG. Read 0 and 1 alike as
    "no element". The distances are left missing rather than zero when nothing
    is found, because zero would mean the element sits ON the acceptor.
    """
    unit, _mode = MOTIFS["TARDBP"]
    out = {}
    for w in WINDOWS:
        sub = seq[-w:] if len(seq) >= w else seq
        out[f"ug_run_{w}"] = float(longest_repeat(sub, unit))
        out[f"ug_frac_{w}"] = (float(sub.count(unit) * len(unit) / len(sub))
                               if sub else np.nan)
    # distance from the acceptor back to the nearest TG dinucleotide, and to
    # the nearest run of at least 3 repeats
    out["ug_dist_nearest"] = np.nan
    out["ug_dist_run6"] = np.nan
    for i in range(len(seq) - 2, -1, -1):
        if seq[i:i + 2] == unit:
            out["ug_dist_nearest"] = float(len(seq) - 1 - i)
            break
    for i in range(len(seq) - 6, -1, -1):
        if seq[i:i + 6] == unit * 3:
            out["ug_dist_run6"] = float(len(seq) - 1 - i)
            break
    out["ug_run_total"] = float(longest_repeat(seq, unit))
    return out


def tract_features(seq):
    """Pyrimidine content and composition, as fractions, never thresholded."""
    out = {}
    for w in WINDOWS:
        sub = seq[-w:] if len(seq) >= w else seq
        if not sub:
            out[f"py_{w}"] = out[f"gc_{w}"] = np.nan
            continue
        out[f"py_{w}"] = float(sum(c in "CT" for c in sub) / len(sub))
        out[f"gc_{w}"] = float(sum(c in "GC" for c in sub) / len(sub))
    # the longest uninterrupted pyrimidine stretch anywhere in the window,
    # which is what a U2AF2 footprint actually needs
    best = cur = 0
    for c in seq:
        cur = cur + 1 if c in "CT" else 0
        best = max(best, cur)
    out["py_longest_run"] = float(best)
    # the acceptor dinucleotide itself, as a check that the position is right
    out["is_ag"] = float(seq[-2:] == "AG") if len(seq) >= 2 else np.nan
    return out


def splicenet_scores(rows, fasta=None, ckpt=None, device=None, model=None):
    """BajaSplice acceptor and donor probability at each position.

    This is the full-coverage replacement for `score_cryptic`. The model emits
    three channels per base (neither / acceptor / donor), so the acceptor
    probability AT the acceptor is p[1, idx] where idx is that base, exactly as
    aso_walk does it.

    Returns None when the model or its checkpoint is unavailable, so the
    sequence features still get produced rather than the whole run failing on
    a missing checkpoint.
    """
    try:
        import torch
        from bajasplice.scan import load_splicenet
        from bajasplice.genome import GenomeReader, one_hot
    except Exception as e:
        print(f"  splicenet unavailable ({type(e).__name__}: {e}); "
              f"acceptor strength will be MISSING")
        return None
    try:
        model, ctx, dev = model or load_splicenet(ckpt=ckpt, device=device)
    except Exception as e:
        print(f"  could not load the splice model ({type(e).__name__}: {e}); "
              f"acceptor strength will be MISSING")
        return None

    g = GenomeReader(fasta) if isinstance(fasta, str) else fasta
    half = int(ctx) // 2
    # The model CROPS half the context from each end: aso_walk reads a window
    # from a-half to b+half and indexes the output relative to `a`, so the
    # output is (b-a+1) long, not the input length. For one position that means
    # a window of ctx+1 bases and an output of length 1, indexed at 0.
    # Indexing at `half` instead raises IndexError on every row, and the bare
    # except that used to be here turned 354 identical failures into a silently
    # empty column.
    acc, don = [], []
    first_error = None
    n_fail = 0
    for chrom, pos, strand in rows:
        try:
            codes = g.codes(str(chrom), int(pos) - half, int(pos) + half,
                            str(strand)).astype(np.int64)
            x = torch.from_numpy(one_hot(codes)[None]).to(dev)
            with torch.no_grad():
                out = torch.softmax(model(x).float(), 1)[0].cpu().numpy()
            if out.shape[1] != 1:
                raise RuntimeError(
                    f"expected one output position for a {len(codes)}-base "
                    f"window at context {ctx}, got {out.shape[1]}")
            acc.append(float(out[1, 0]))
            don.append(float(out[2, 0]))
        except Exception as e:
            n_fail += 1
            if first_error is None:
                first_error = f"{type(e).__name__}: {e}"
            acc.append(np.nan)
            don.append(np.nan)
    if n_fail:
        print(f"  splicenet failed on {n_fail}/{len(acc)} positions; "
              f"first error was {first_error}")
    else:
        print(f"  splicenet scored {len(acc)}/{len(acc)} positions")
    return {"ss_acceptor": acc, "ss_donor": don}


def build_features(events, fasta, span=UPSTREAM, with_model=False, ckpt=None,
                   device=None, genome_path=None):
    """One feature row per event, keyed by chrom/acceptor/strand."""
    recs = []
    for r in events.itertuples():
        chrom, strand = str(r.chrom), str(r.strand)
        acceptor = int(r.acceptor)
        seq = upstream_seq(fasta, chrom, acceptor, strand, span=span)
        rec = {"chrom": chrom, "acceptor": acceptor, "strand": strand,
               "seq_len": len(seq)}
        if seq:
            rec.update(ug_features(seq))
            rec.update(tract_features(seq))
        for c in ("gene", "fate", "dist_exon"):
            if hasattr(r, c):
                rec[c] = getattr(r, c)
        recs.append(rec)
    out = pd.DataFrame(recs)
    if with_model and len(out):
        sn = splicenet_scores(
            list(zip(out["chrom"], out["acceptor"], out["strand"])),
            fasta=genome_path, ckpt=ckpt, device=device)
        if sn:
            for k, v in sn.items():
                out[k] = v
    return out


def summarize(feat):
    print("\n" + "=" * 70)
    print("COMPUTED FEATURES")
    print("=" * 70)
    print(f"  rows: {len(feat)}")
    if not len(feat):
        return
    short = int((feat["seq_len"] < feat["seq_len"].max()).sum())
    if short:
        print(f"  windows clipped at a contig edge: {short}")
    if "is_ag" in feat:
        ag = feat["is_ag"].mean()
        print(f"  positions whose last two bases are AG: {ag:.1%}")
        if ag < 0.8:
            print("    LOW. The window should END at the acceptor, so this "
                  "should be near 1.\n    A low value means the coordinate "
                  "convention or the strand is wrong.")
    num = feat.select_dtypes(include=[np.number])
    cov = num.notna().mean().sort_values()
    print(f"\n  coverage, lowest first (the point of this step is that these "
          f"are all 1.00):")
    for k, v in list(cov.items())[:8]:
        flag = "   <- INCOMPLETE" if v < 0.99 else ""
        print(f"    {k:<24} {v:>6.1%}{flag}")
    print("\n  a few distributions:")
    for k in ("ug_run_total", "ug_run_40", "ug_dist_nearest", "py_20",
              "py_longest_run", "ss_acceptor"):
        if k in num.columns and num[k].notna().any():
            v = num[k].dropna()
            print(f"    {k:<18} median {v.median():>8.3f}  "
                  f"p10 {v.quantile(.1):>8.3f}  p90 {v.quantile(.9):>8.3f}")
    if "ss_acceptor" not in feat.columns:
        print("\n  NOTE: no ss_acceptor column. Acceptor strength is the "
              "feature whose absence\n  broke the first model; rerun with "
              "--with-model once a checkpoint is reachable.")


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--events", required=True,
                    help="table with chrom, strand and an acceptor (or "
                         "a_start/a_end, or a junction column)")
    ap.add_argument("--genome", required=True, help="hg38 FASTA")
    ap.add_argument("--require-junc-cat", default=None, metavar="CAT",
                    help="keep only rows whose junc_cat contains this, e.g. "
                         "acceptor. Use when pointing --events at "
                         "master_table.csv so the features are computed for "
                         "the SAME positions the model will fit on")
    ap.add_argument("--span", type=int, default=UPSTREAM,
                    help=f"intronic bases upstream of the acceptor "
                         f"(default {UPSTREAM})")
    ap.add_argument("--with-model", action="store_true",
                    help="also score each position with BajaSplice. Needs a "
                         "checkpoint and torch; without it ss_acceptor is "
                         "absent and the model is missing its most important "
                         "feature")
    ap.add_argument("--ckpt", default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)

    from bajasplice.evaluate.exon_age import TargetFasta, read_events
    ev = read_events(os.path.expanduser(args.events))
    print(f"{len(ev)} events from {args.events}")
    if args.require_junc_cat and "junc_cat" in ev.columns:
        before = len(ev)
        ev = ev[ev["junc_cat"].astype(str).str.lower()
                .str.contains(args.require_junc_cat.lower())]
        print(f"  junc_cat contains {args.require_junc_cat!r}: "
              f"{before} -> {len(ev)}")
    gpath = os.path.expanduser(args.genome)
    fasta = TargetFasta(gpath)
    print(f"  genome: {os.path.basename(gpath)}")

    feat = build_features(ev, fasta, span=args.span,
                          with_model=args.with_model, ckpt=args.ckpt,
                          device=args.device, genome_path=gpath)
    summarize(feat)
    feat.to_csv(args.out, sep="\t", index=False)
    print(f"\nfeatures written to {args.out}")
    print("  join it into the model with:  evaluate tdp43-sensitivity "
          "--features <this file>")
    return None


if __name__ == "__main__":
    main()
