#!/usr/bin/env python
"""Do RNA-binding proteins hold shut the exons that would cost something?

This is the buffer question with the dating removed. A buffer lets a splice
site exist that selection would otherwise have taken out: the site is
recognizable, the repressor keeps it closed, and the host gene's output never
changes. Nothing in that claim requires knowing which came first. What it
requires is that repression be aimed at exons whose inclusion would be
destructive, rather than at exons generally.

THREE GROUPS, AND THE PRIMARY CONTRAST IS AGAINST THE ONES THAT NEVER MOVED.
Each knockdown gives exons whose inclusion RISES, which the protein was
repressing, exons whose inclusion FALLS, which it was enhancing, and exons that
were tested and did not move. Buffering says the repressed set is enriched for
destructive consequence relative to the ones that never moved. The enhanced set
is reported beside it because it is the thing that tells you whether any
enrichment is about repression or about regulation in general.

Getting that the wrong way round cost a day. An earlier version made repressed
against enhanced the verdict, and on frame disruption TARDBP came out with the
smallest p of 475 proteins. Decomposed, its repressed exons sat at the class
median against never-moved, +0.014, rank 230 of 475, and the whole effect was
its ENHANCED exons being unusually frame-preserving, 0.504 against 0.584, ninth
most negative of 475. The denominator was the finding.

AND THE CLASS-LEVEL TEST IS THE ONE THAT ANSWERS THE QUESTION. A per-protein
screen over 475 RBPs cannot return a positive at BH 0.05 unless some raw p
falls below about 1e-4, so an empty screen is partly a statement about power.
Whether repression is generally aimed at costly exons is a paired question
asked across proteins: does the repressed shift exceed the enhanced shift,
protein by protein? On frame disruption it does not. Both directions sit about
+0.014 above the exons that never moved, the same size, which is a fact about
which exons are regulatable at all and not about what repression is for.

Destructive is measured two ways, cheapest first:

  frame     the exon's length is not a multiple of three, so including it
            shifts the reading frame of everything downstream. Free: it is
            arithmetic on the event table.
  nmd       including the exon puts a stop more than DJ_THRESHOLD nt from the
            last junction, which is the rule BajaNMD already uses. Needs the
            annotation and the genome, so it runs under --nmd and is slower.

A third axis, conservation, is the other half of the buffer claim: buffered
sequence is sequence selection has not acted on. It needs a phyloP or
phastCons bigWig, which is a download rather than anything on disk, so it runs
only when --phylop points at one.

WHAT A POSITIVE RESULT WOULD AND WOULD NOT MEAN. Enrichment of destructive
consequence among repressed exons says repression is pointed at exons that
would be costly if included. That is the behavior a buffer has. It does not
establish that the repression evolved for that purpose, and it cannot: a
protein that represses weak, recent, badly behaved splice sites for any reason
at all produces this pattern. The claim this test can support is functional,
not historical.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

__all__ = ["direction_sets", "frame_flag", "fisher_2x2", "bh", "summarize"]

Z_THR, DPSI_THR = 4.0, 0.10


def direction_sets(Z, D, cols, rbp, z_thr=Z_THR, dpsi_thr=DPSI_THR):
    """(repressed, enhanced, untouched) index arrays for one RBP.

    Repressed = inclusion rises on knockdown. Enhanced = inclusion falls.
    An event that moves both ways across this RBP's experiments is dropped
    rather than assigned: it is evidence about the measurement, not about the
    direction of regulation.
    """
    j = np.flatnonzero(np.asarray(cols) == rbp)
    if len(j) == 0:
        return None
    up = ((Z[:, j] >= z_thr) & (D[:, j] >= dpsi_thr)).any(axis=1)
    dn = ((Z[:, j] <= -z_thr) & (D[:, j] <= -dpsi_thr)).any(axis=1)
    tested = (np.isfinite(Z[:, j]) & np.isfinite(D[:, j])).any(axis=1)
    both = up & dn
    return (np.flatnonzero(up & ~both),
            np.flatnonzero(dn & ~both),
            np.flatnonzero(tested & ~up & ~dn))


def frame_flag(exon_len):
    """True when including the exon shifts the downstream reading frame."""
    return (np.asarray(exon_len, dtype="int64") % 3) != 0


def fisher_2x2(k1, n1, k2, n2):
    """One-sided p that group 1's rate exceeds group 2's, plus the odds ratio."""
    from scipy.stats import fisher_exact
    table = [[int(k1), int(n1 - k1)], [int(k2), int(n2 - k2)]]
    try:
        orr, p = fisher_exact(table, alternative="greater")
    except ValueError:
        return float("nan"), float("nan")
    return float(orr), float(p)


def bh(p):
    """Benjamini-Hochberg adjusted p-values, order preserved."""
    p = np.asarray(p, dtype="float64")
    ok = np.isfinite(p)
    out = np.full(p.shape, np.nan)
    v = p[ok]
    n = len(v)
    if n == 0:
        return out
    order = np.argsort(v)
    ranked = v[order] * n / (np.arange(n) + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    adj = np.empty(n)
    adj[order] = np.minimum(ranked, 1.0)
    out[ok] = adj
    return out


def summarize(rbp, flag, rep, enh, unt, axis, continuous=False):
    """Rates or medians in each group, and the three contrasts that matter.

    THE PRIMARY CONTRAST IS REPRESSED AGAINST UNTOUCHED. An earlier version
    made it repressed against enhanced and read the verdict off that, which
    answers whether repression differs from enhancement rather than whether
    repression is aimed at exons that would cost something. TDP-43 showed the
    smallest p of 475 proteins on that contrast while its repressed exons sat
    at the class median; the whole effect was its enhanced exons being
    unusually frame-preserving. All three contrasts are reported so the
    denominator cannot hide again.

    `continuous` switches to medians and a rank-sum, for an axis like
    conservation where the buffer prediction is LOWER in the repressed set
    rather than higher.
    """
    v = np.asarray(flag, dtype="float64")

    def grp(idx):
        x = v[idx]
        x = x[np.isfinite(x)]
        return x

    a, b, c = grp(rep), grp(enh), grp(unt)
    out = dict(rbp=rbp, axis=axis, n_repressed=len(a), n_enhanced=len(b),
               n_untouched=len(c))
    if continuous:
        from scipy.stats import mannwhitneyu
        out.update(rate_repressed=float(np.median(a)) if len(a) else np.nan,
                   rate_enhanced=float(np.median(b)) if len(b) else np.nan,
                   rate_untouched=float(np.median(c)) if len(c) else np.nan,
                   odds_ratio=np.nan)
        def mw(x, y):
            if len(x) < 5 or len(y) < 5:
                return np.nan
            return float(mannwhitneyu(x, y, alternative="less").pvalue)
        out.update(p_rep_vs_unt=mw(a, c), p_enh_vs_unt=mw(b, c), p_rep_vs_enh=mw(a, b))
        return out

    out.update(rate_repressed=(a.sum() / len(a)) if len(a) else np.nan,
               rate_enhanced=(b.sum() / len(b)) if len(b) else np.nan,
               rate_untouched=(c.sum() / len(c)) if len(c) else np.nan)
    orr, p_ru = (fisher_2x2(a.sum(), len(a), c.sum(), len(c))
                 if len(a) and len(c) else (np.nan, np.nan))
    _, p_eu = (fisher_2x2(b.sum(), len(b), c.sum(), len(c))
               if len(b) and len(c) else (np.nan, np.nan))
    _, p_re = (fisher_2x2(a.sum(), len(a), b.sum(), len(b))
               if len(a) and len(b) else (np.nan, np.nan))
    out.update(odds_ratio=orr, p_rep_vs_unt=p_ru, p_enh_vs_unt=p_eu,
               p_rep_vs_enh=p_re)
    return out


def class_level(df):
    """Is there anything general here, across all the proteins at once?

    A per-protein screen over hundreds of RBPs cannot return a positive at BH
    0.05 unless some p is below about 1e-4, so absence of per-protein hits is a
    statement about power. The class-level question is different and better
    powered: does the repressed shift exceed the enhanced shift, protein by
    protein? That is a paired comparison within each RBP, and it is the test
    the buffer claim actually makes.
    """
    from scipy.stats import binomtest, wilcoxon
    d_rep = df["rate_repressed"].to_numpy() - df["rate_untouched"].to_numpy()
    d_enh = df["rate_enhanced"].to_numpy() - df["rate_untouched"].to_numpy()
    ok = np.isfinite(d_rep) & np.isfinite(d_enh)
    d_rep, d_enh = d_rep[ok], d_enh[ok]
    n = len(d_rep)
    if n < 10:
        return None
    up = int((d_rep > 0).sum())
    try:
        w = float(wilcoxon(d_rep, d_enh, alternative="greater").pvalue)
    except ValueError:
        w = float("nan")
    try:
        w2 = float(wilcoxon(d_rep, d_enh, alternative="less").pvalue)
    except ValueError:
        w2 = float("nan")
    return dict(n_rbps=n,
                median_rep_shift=float(np.median(d_rep)),
                median_enh_shift=float(np.median(d_enh)),
                rbps_rep_above_untouched=up,
                p_rep_shift_nonzero=float(binomtest(up, n, 0.5).pvalue),
                p_rep_shift_exceeds_enh=w,
                p_enh_shift_exceeds_rep=w2)


def _nmd_flags(ev, idx, annotation, genome, cache, verbose=True):
    """inclusion-triggers-NMD per event, by (chrom, a_start, a_end) lookup."""
    from bajanmd.consequence import annotation_tables, gene_exons

    exons, cds = annotation_tables(annotation)
    out = np.full(len(ev), np.nan)
    genes = pd.unique(ev.loc[idx, "gene_name"].dropna())
    if verbose:
        print(f"  NMD consequence for {len(genes)} genes", flush=True)
    for n, gene in enumerate(genes, 1):
        if gene not in cache:
            try:
                cache[gene] = {(r["chrom"], int(r["a_start"]), int(r["a_end"])): r
                               for r in gene_exons(gene, annotation=annotation,
                                                   genome=genome, exons=exons, cds=cds)}
            except (KeyError, ValueError):
                cache[gene] = {}
        if verbose and n % 500 == 0:
            print(f"    {n}/{len(genes)}", flush=True)
    for i in idx:
        r = ev.loc[i]
        hit = cache.get(r["gene_name"], {}).get(
            (r["chrom"], int(r["a_start"]), int(r["a_end"])))
        if hit is None:
            continue
        cls = hit.get("mane_class") or hit.get("nmd_class")
        if cls is None:
            continue
        out[i] = 1.0 if cls in ("NMD_in", "both") else 0.0
    return out


def _phylop_means(ev, idx, path, flank=0):
    """Mean phyloP over each exon, or None when the file cannot be read."""
    try:
        import pyBigWig
    except ImportError:
        raise SystemExit("--phylop needs pyBigWig: pip install --break-system-packages pyBigWig")
    bw = pyBigWig.open(str(path))
    out = np.full(len(ev), np.nan)
    for i in idx:
        r = ev.loc[i]
        s, e = int(r["a_start"]) - flank, int(r["a_end"]) + flank
        try:
            v = bw.stats(r["chrom"], max(0, s - 1), e, type="mean")[0]
        except (RuntimeError, TypeError):
            v = None
        if v is not None:
            out[i] = float(v)
    bw.close()
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rbp", action="append", default=None,
                    help="RBP to test; repeatable. Default: every RBP with enough of both.")
    ap.add_argument("--min-set", type=int, default=25,
                    help="minimum events in EACH direction for an RBP to be testable")
    ap.add_argument("--nmd", action="store_true",
                    help="also test NMD consequence (slower: needs the annotation)")
    ap.add_argument("--annotation", default="current")
    ap.add_argument("--phylop", default=None,
                    help="phyloP or phastCons bigWig, to test conservation as well")
    ap.add_argument("--untouched-cap", type=int, default=6000,
                    help="cap on the untouched set for the slower axes")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    import os
    from bajasplice.config import paths, species

    sp = species()
    interim = str(paths().interim)
    need = ["encode_events.tsv", "encode_dpsi.npy", "encode_dpsi_z.npy",
            "encode_dpsi_cols.tsv"]
    missing = [f for f in need if not os.path.exists(os.path.join(interim, f))]
    if missing:
        raise SystemExit("missing " + ", ".join(missing) + f" in {interim}; build them "
                         f"with `{sp.command} prepare encode-psi` and `prepare encode-dpsi`")

    ev = pd.read_csv(os.path.join(interim, "encode_events.tsv"), sep="\t")
    cols = pd.read_csv(os.path.join(interim, "encode_dpsi_cols.tsv"), sep="\t")
    D = np.load(os.path.join(interim, "encode_dpsi.npy"))
    Z = np.load(os.path.join(interim, "encode_dpsi_z.npy"))
    if len(ev) != D.shape[0]:
        raise SystemExit(f"{len(ev)} events against {D.shape[0]} dPSI rows; "
                         "these came from different runs")
    if "exon_len" not in ev.columns:
        ev["exon_len"] = ev.a_end - ev.a_start + 1

    axes = {"frame": (frame_flag(ev["exon_len"].to_numpy()).astype("float64"), False)}
    targets = args.rbp or sorted(cols.target.unique())
    print(f"running as {sp.label}; {len(ev):,} events, {cols.target.nunique()} RBPs")
    print(f"repressed = inclusion up on knockdown, enhanced = inclusion down, "
          f"both at z >= {Z_THR} and |dPSI| >= {DPSI_THR}")
    print("primary contrast: repressed against NEVER RESPONDED. The repressed "
          "against enhanced contrast is reported beside it and is not the verdict.\n")

    genome = None
    if args.nmd or args.phylop:
        from bajasplice.genome import GenomeReader
        genome = GenomeReader()

    rows, cache = [], {}
    for rbp in targets:
        sets = direction_sets(Z, D, cols.target.to_numpy(), rbp)
        if sets is None:
            continue
        rep, enh, unt = sets
        if len(rep) < args.min_set or len(enh) < args.min_set:
            continue
        unt_small = unt[:args.untouched_cap]

        for axis, (flag, continuous) in axes.items():
            rows.append(summarize(rbp, flag, rep, enh, unt, axis, continuous))
            r = rows[-1]
            print(f"{rbp:10s} {axis:7s} repressed {r['rate_repressed']:.3f} "
                  f"(n={r['n_repressed']:4d})  never {r['rate_untouched']:.3f}  "
                  f"enhanced {r['rate_enhanced']:.3f} (n={r['n_enhanced']:4d})  "
                  f"OR {r['odds_ratio']:.2f}  p(rep>never) {r['p_rep_vs_unt']:.2e}")

        if args.nmd:
            idx = np.concatenate([rep, enh, unt_small])
            nm = _nmd_flags(ev, idx, args.annotation, genome, cache)
            rows.append(summarize(rbp, nm, rep, enh, unt_small, "nmd", False))
            r = rows[-1]
            if r["n_repressed"] >= args.min_set and r["n_untouched"] >= 50:
                print(f"{rbp:10s} nmd     repressed {r['rate_repressed']:.3f} "
                      f"(n={r['n_repressed']:4d})  never {r['rate_untouched']:.3f}  "
                      f"enhanced {r['rate_enhanced']:.3f}  OR {r['odds_ratio']:.2f}  "
                      f"p(rep>never) {r['p_rep_vs_unt']:.2e}")
            else:
                rows.pop()
                print(f"{rbp:10s} nmd     too few events resolved in the annotation")

        if args.phylop:
            idx = np.concatenate([rep, enh, unt_small])
            ph = _phylop_means(ev, idx, args.phylop)
            # the buffer prediction here is LOWER conservation in the repressed set
            rows.append(summarize(rbp, ph, rep, enh, unt_small, "phylop", True))
            r = rows[-1]
            print(f"{rbp:10s} phylop  repressed {r['rate_repressed']:6.3f} "
                  f"(n={r['n_repressed']:4d})  never {r['rate_untouched']:6.3f}  "
                  f"enhanced {r['rate_enhanced']:6.3f}  "
                  f"p(rep<never) {r['p_rep_vs_unt']:.2e}")

    if not rows:
        raise SystemExit("no RBP had at least --min-set events in both directions")

    df = pd.DataFrame(rows)
    # NOT col.replace("p_", "padj_"): "p_rep_vs_unt" has a second "p_" inside
    # "rep_", so that spelling produced padj_repadj_vs_unt and the next lookup
    # died. Name the columns explicitly.
    PADJ = {"p_rep_vs_unt": "padj_rep_vs_unt",
            "p_enh_vs_unt": "padj_enh_vs_unt",
            "p_rep_vs_enh": "padj_rep_vs_enh"}
    for axis, g in df.groupby("axis"):
        for col, adj in PADJ.items():
            df.loc[g.index, adj] = bh(g[col].to_numpy())

    for axis, g in df.groupby("axis"):
        print(f"\n=== {axis} " + "=" * 52)
        need = 0.05 / max(1, len(g))
        sig = g[g["padj_rep_vs_unt"] < 0.05]
        print(f"per protein: {len(sig)} of {len(g)} enriched in the repressed set "
              f"against never-responded at BH 0.05")
        print(f"  with {len(g)} tests, BH needs a raw p below {need:.2e}, so a null "
              f"screen here is partly a statement about power")
        top = g.sort_values("p_rep_vs_unt").head(10)
        print(top[["rbp", "n_repressed", "rate_repressed", "rate_untouched",
                   "rate_enhanced", "odds_ratio", "p_rep_vs_unt"]].to_string(index=False))

        cl = class_level(g)
        if cl is None:
            print("  too few proteins for a class-level test")
            continue
        print(f"\nclass level over {cl['n_rbps']} proteins:")
        print(f"  repressed minus never: median {cl['median_rep_shift']:+.4f}, "
              f"above zero in {cl['rbps_rep_above_untouched']}/{cl['n_rbps']} "
              f"(p {cl['p_rep_shift_nonzero']:.2e})")
        print(f"  enhanced  minus never: median {cl['median_enh_shift']:+.4f}")
        print(f"  repressed shift exceeds enhanced shift: p {cl['p_rep_shift_exceeds_enh']:.2e}")
        print(f"  enhanced shift exceeds repressed shift: p {cl['p_enh_shift_exceeds_rep']:.2e}")
        # THE BUFFER CLAIM NEEDS BOTH: a shift, and an asymmetry. A shift in
        # both directions equally is a fact about which exons are regulatable.
        shift = cl["p_rep_shift_nonzero"] < 0.05 and cl["median_rep_shift"] > 0
        asym = cl["p_rep_shift_exceeds_enh"] < 0.05
        if shift and asym:
            print("  BUFFERING LOOKS GENERAL on this axis: repression is shifted "
                  "toward costly exons and enhancement is not.")
        elif cl["p_enh_shift_exceeds_rep"] < 0.05:
            # BACKWARDS IS CHECKED FIRST. Ordered the other way round, the
            # symmetric branch swallowed this case and printed "shifted by the
            # same amount" while the reverse test sat at 0.021.
            print("  THE PREDICTION CAME OUT BACKWARDS. Enhancement is shifted "
                  "toward costly exons MORE than repression is, which is the "
                  "opposite of what a buffer requires.")
        elif shift and not asym:
            print("  NOT BUFFERING. Both directions are shifted by the same amount, "
                  "so this is about which exons are regulatable at all, not about "
                  "what repression is aimed at.")
        else:
            print("  NO CLASS-LEVEL EFFECT on this axis.")

    print("\nEnrichment here would say repression is pointed at exons that would be "
          "costly if included. It would not say the repression evolved for that, and "
          "this design cannot: a protein that represses recent, badly behaved splice "
          "sites for any reason produces the same pattern.")

    if args.out:
        df.to_csv(args.out, sep="\t", index=False)
        print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
