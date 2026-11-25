"""What distinguishes a cryptic acceptor from a normal one in the same gene?

WHY THIS CONTRAST AND NOT THE OTHER ONE. Every earlier attempt compared cryptic
acceptors against arbitrary intronic AGs. In that contrast the winning features
were acceptor strength (AUC 0.988) and the polypyrimidine tract (0.917), while
the TDP-43 element reached 0.571 at p=0.09. Both winners say "this looks like a
real acceptor", which BajaSplice already scores, so a second stage had nothing
to add and lost to stage one at every k.

Comparing against ANNOTATED acceptors from the same genes removes that
confound by construction. Both classes are genuine, used 3' splice sites with
an AG and a tract. Whatever separates them is about why one is constitutive and
the other stays shut until TDP-43 leaves, which is the mechanism rather than
the motif.

THE BASE RATE IS NOW SANE, SO AUC IS A FAIR METRIC HERE. Against 28 million
background positions it was not: a model with AUC 0.99 would still be useless
at 18,646:1, which is why the earlier evaluation used recall at k instead. A
gene carries on the order of ten annotated acceptors, so this is roughly 1:10
and ordinary classification metrics mean what they usually mean.

MATCHED WITHIN GENE. Negatives are drawn from the SAME genes as the positives,
so gene-level composition, expression neighbourhood and regional base content
are matched rather than adjusted for. Folds are grouped by gene so no locus
spans the split.

WHAT TO BE SUSPICIOUS OF IN THE RESULT. Conservation will separate these
classes easily and it means little: annotated exons are under selection because
they are used, so phastCons at an annotated acceptor is high almost by
definition. The compendium's own columns already show it, around 0.99 against
0.12. It is reported, and reported as circular. The features worth believing
are the ones that describe the local sequence rather than its evolutionary
history.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

__all__ = ["annotated_acceptors", "assemble", "add_features", "GROUPS",
           "ablate", "per_feature_auc", "fit_and_evaluate", "main"]

SPAN = 300
#: reported but never believed; see the module docstring
CIRCULAR = ("phastCons_alt", "phastCons_unchanged")


def annotated_acceptors(exons, genes=None, min_exon=1):
    """Every annotated 3' splice site, as chrom/pos/strand/gene.

    The acceptor is the base before the exon in transcript orientation, so
    `start - 1` on the plus strand and `end + 1` on the minus. A transcript's
    FIRST exon has no acceptor, and including its start would add a position
    that is not a splice site at all; exons are deduplicated per gene and the
    outermost one in transcript orientation is dropped for that reason.
    """
    need = {"chrom", "start", "end", "strand", "gene_name"}
    missing = need - set(exons.columns)
    if missing:
        raise SystemExit(f"exon table lacks {', '.join(sorted(missing))}")
    ex = exons
    if genes is not None:
        ex = ex[ex["gene_name"].isin(set(genes))]
    rows = []
    for gene, g in ex.groupby("gene_name", sort=False):
        strand = str(g["strand"].iloc[0])
        chrom = str(g["chrom"].iloc[0])
        starts = g["start"].astype(int).to_numpy()
        ends = g["end"].astype(int).to_numpy()
        if strand == "+":
            pos = np.unique(starts) - 1
            pos = pos[pos > np.min(starts) - 1]      # drop the first exon's
        else:
            pos = np.unique(ends) + 1
            pos = pos[pos < np.max(ends) + 1]
        for p in pos:
            rows.append({"gene": str(gene), "chrom": chrom,
                         "pos": int(p), "strand": strand})
    return pd.DataFrame(rows)


def assemble(cryptic, annotated, tol=2, verbose=True):
    """Label both sets, removing any annotated position that IS a cryptic one.

    About a quarter of catalogued cryptic acceptors sit within a base or two
    of an annotated boundary. Leaving those in the negative class would put
    the same position on both sides of the comparison, which is the fastest
    way to make a real difference look like noise.
    """
    cry = cryptic.copy()
    cry["is_cryptic"] = True
    ann = annotated.copy()
    ann["is_cryptic"] = False
    genes = set(cry["gene"])
    ann = ann[ann["gene"].isin(genes)]
    dropped = 0
    if len(ann) and len(cry):
        keep = np.ones(len(ann), bool)
        for gene, grp in cry.groupby("gene", sort=False):
            m = (ann["gene"] == gene).to_numpy()
            if not m.any():
                continue
            ap = ann.loc[m, "pos"].to_numpy(float)
            cp = grp["pos"].to_numpy(float)
            clash = np.any(np.abs(ap[:, None] - cp[None, :]) <= tol, axis=1)
            idx = np.flatnonzero(m)
            keep[idx[clash]] = False
            dropped += int(clash.sum())
        ann = ann[keep]
    out = pd.concat([cry, ann], ignore_index=True)
    if verbose:
        n_g = out["gene"].nunique()
        print(f"\n  genes in the comparison: {n_g}")
        print(f"  cryptic acceptors:  {int(out['is_cryptic'].sum())}")
        print(f"  annotated acceptors: {int((~out['is_cryptic']).sum())}")
        if dropped:
            print(f"  annotated positions removed for coinciding with a "
                  f"cryptic one: {dropped}")
        per = out.groupby("gene")["is_cryptic"].agg(["sum", "size"])
        print(f"  annotated per gene: median "
              f"{(per['size'] - per['sum']).median():.0f}")
        both = int(((per["sum"] > 0) & (per["size"] - per["sum"] > 0)).sum())
        print(f"  genes carrying both classes: {both}  "
              f"(only these contribute to a matched comparison)")
    return out


def add_features(rows, fasta, span=SPAN, with_model=False, genome_path=None,
                 ckpt=None, device=None):
    from bajasplice.evaluate.cryptic_features import (splicenet_scores,
                                                      tract_features,
                                                      ug_features,
                                                      upstream_seq)
    recs = []
    for r in rows.itertuples():
        seq = upstream_seq(fasta, str(r.chrom), int(r.pos), str(r.strand),
                           span=span)
        rec = {"seq_len": len(seq)}
        if seq:
            rec.update(ug_features(seq))
            rec.update(tract_features(seq))
        recs.append(rec)
    out = pd.concat([rows.reset_index(drop=True),
                     pd.DataFrame(recs)], axis=1)
    if with_model:
        sn = splicenet_scores(
            list(zip(out["chrom"], out["pos"], out["strand"])),
            fasta=genome_path, ckpt=ckpt, device=device)
        if sn:
            for k, v in sn.items():
                out[k] = v
    return out


def per_feature_auc(feat, cols):
    """Each feature's AUC for cryptic against annotated, with a sign."""
    from scipy import stats as sps
    cry = feat["is_cryptic"].astype(bool)
    rows = []
    for c in cols:
        a = feat.loc[cry, c].dropna()
        b = feat.loc[~cry, c].dropna()
        if len(a) < 5 or len(b) < 5:
            continue
        u = sps.mannwhitneyu(a, b, alternative="two-sided")
        auc = u.statistic / (len(a) * len(b))
        # Series.append was removed in pandas 2.0
        mid = float(pd.concat([a, b]).median())
        # ss_acceptor piles up at 0 and 1, so ties drag Mann-Whitney to
        # exactly 0.500 while the means differ by 0.31 against 0.46. A rank
        # test on a saturated score reports "no difference" for a real one,
        # so the tail rate is carried alongside it.
        rows.append({"feature": c, "auc": auc, "p": u.pvalue,
                     "cryptic_median": float(a.median()),
                     "annotated_median": float(b.median()),
                     "cryptic_hi": float((a > mid).mean()),
                     "annotated_hi": float((b > mid).mean()),
                     "n_cryptic": len(a), "n_annotated": len(b)})
    df = pd.DataFrame(rows)
    if len(df):
        df["signal"] = (df["auc"] - 0.5).abs()
        df = df.sort_values("signal", ascending=False).drop(columns="signal")
    return df.reset_index(drop=True)


#: feature groups, ablated so a group's contribution is visible
GROUPS = {"GC": "gc_", "UG": "ug_", "pyrimidine": "py_", "splicenet": "ss_"}


def _oof(feat, cols, y, g, seed=0, n_splits=5):
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.model_selection import GroupKFold
    oof = np.full(len(feat), np.nan)
    for tr, te in GroupKFold(n_splits=n_splits).split(feat[cols], y,
                                                      groups=g):
        clf = HistGradientBoostingClassifier(
            max_depth=3, max_iter=250, learning_rate=0.05,
            l2_regularization=1.0, class_weight="balanced",
            random_state=seed)
        clf.fit(feat[cols].iloc[tr], y[tr])
        oof[te] = clf.predict_proba(feat[cols].iloc[te])[:, 1]
    return oof


def ablate(feat, cols, seed=0, n_splits=5):
    """Each group alone, and everything without it.

    AVERAGE PRECISION LEADS, not AUC. On the first real run AUC said the UG
    element was worth nothing: 0.877 with it and 0.871 without. Average
    precision said it was worth a third of the whole result, 0.183 against
    0.117. At a 2.8% base rate only the top of the ranking matters and AP is
    what measures it, so an ablation read by AUC would have discarded the one
    mechanistically meaningful feature group in the model.
    """
    from sklearn.metrics import average_precision_score, roc_auc_score
    y = feat["is_cryptic"].astype(int).to_numpy()
    g = feat["gene"].astype(str)
    rows = []

    def score(use, name):
        use = [c for c in use if c in feat.columns]
        if not use:
            return
        o = _oof(feat, use, y, g, seed, n_splits)
        ok = ~np.isnan(o)
        rows.append({"set": name, "n_features": len(use),
                     "auc": roc_auc_score(y[ok], o[ok]),
                     "ap": average_precision_score(y[ok], o[ok])})

    score(cols, "everything")
    present = {k: [c for c in cols if c.startswith(pre)]
               for k, pre in GROUPS.items()}
    present = {k: v for k, v in present.items() if v}
    for k, v in present.items():
        score(v, f"{k} only")
    for k, v in present.items():
        score([c for c in cols if c not in v], f"everything except {k}")
    out = pd.DataFrame(rows)
    out["lift"] = out["ap"] / max(y.mean(), 1e-12)
    return out


def fit_and_evaluate(feat, cols, seed=0, n_splits=5, drop_circular=True):
    """Gene-grouped out-of-fold AUC, with and without the circular features."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import average_precision_score, roc_auc_score
    from sklearn.model_selection import GroupKFold

    y = feat["is_cryptic"].astype(int).to_numpy()
    g = feat["gene"].astype(str)
    n_splits = int(min(n_splits, g.nunique()))
    if n_splits < 2 or y.sum() < 10 or (1 - y).sum() < 10:
        raise SystemExit(
            f"not enough to evaluate: {int(y.sum())} cryptic and "
            f"{int((1 - y).sum())} annotated across {g.nunique()} genes")

    sets = {"all features": list(cols)}
    if drop_circular:
        trimmed = [c for c in cols if c not in CIRCULAR]
        if len(trimmed) != len(cols):
            sets["sequence only (no conservation)"] = trimmed

    out = {}
    for name, use in sets.items():
        oof = np.full(len(feat), np.nan)
        for tr, te in GroupKFold(n_splits=n_splits).split(feat[use], y,
                                                          groups=g):
            clf = HistGradientBoostingClassifier(
                max_depth=3, max_iter=250, learning_rate=0.05,
                l2_regularization=1.0, class_weight="balanced",
                random_state=seed)
            clf.fit(feat[use].iloc[tr], y[tr])
            oof[te] = clf.predict_proba(feat[use].iloc[te])[:, 1]
        ok = ~np.isnan(oof)
        out[name] = {
            "auc": float(roc_auc_score(y[ok], oof[ok])),
            "ap": float(average_precision_score(y[ok], oof[ok])),
            "base_rate": float(y[ok].mean()),
            "oof": oof, "features": use}
    out["_n_splits"] = n_splits
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--positives", required=True,
                    help="known cryptic acceptors (the compendium)")
    ap.add_argument("--require-cat", default="novel_acceptor")
    ap.add_argument("--annotation", required=True,
                    help="exon table with chrom,start,end,strand,gene_name")
    ap.add_argument("--genome", required=True, help="hg38 FASTA")
    ap.add_argument("--span", type=int, default=SPAN)
    ap.add_argument("--with-model", action="store_true",
                    help="also score each position with BajaSplice")
    ap.add_argument("--max-genes", type=int, default=None)
    ap.add_argument("--ckpt", default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    from bajasplice.evaluate.exon_age import TargetFasta
    from bajasplice.train.cryptic import load_positives

    cry = load_positives(args.positives, args.require_cat or None)
    print(f"{len(cry)} cryptic acceptors across {cry['gene'].nunique()} genes")
    if args.max_genes:
        keep = sorted(cry["gene"].unique())[:int(args.max_genes)]
        cry = cry[cry["gene"].isin(keep)]
        print(f"  limited to {len(keep)} genes ({len(cry)} positives)")

    ex = pd.read_csv(os.path.expanduser(args.annotation), sep="\t",
                     usecols=["chrom", "start", "end", "strand", "gene_name"],
                     dtype={"chrom": str, "gene_name": str},
                     low_memory=False)
    print(f"{len(ex):,} exons from {os.path.basename(args.annotation)}")
    ann = annotated_acceptors(ex, genes=set(cry["gene"]))
    print(f"  {len(ann)} annotated acceptors in those genes")

    rows = assemble(cry, ann)
    gpath = os.path.expanduser(args.genome)
    fasta = TargetFasta(gpath)
    print(f"  genome: {os.path.basename(gpath)}")
    feat = add_features(rows, fasta, span=args.span,
                        with_model=args.with_model, genome_path=gpath,
                        ckpt=args.ckpt, device=args.device)

    drop = {"gene", "chrom", "pos", "strand", "is_cryptic", "seq_len", "is_ag"}
    cols = [c for c in feat.columns
            if c not in drop and pd.api.types.is_numeric_dtype(feat[c])
            and feat[c].notna().mean() > 0.5]

    tab = per_feature_auc(feat, cols)
    print("\n" + "=" * 78)
    print("EACH FEATURE ON ITS OWN: cryptic vs annotated acceptors")
    print("=" * 78)
    print(f"  {'feature':<20} {'AUC':>6} {'p':>10} {'cryptic':>11} "
          f"{'annotated':>11}")
    for r in tab.head(14).itertuples():
        tag = ""
        if r.feature in CIRCULAR:
            tag = "  <- circular"
        elif r.feature.startswith("ug_"):
            tag = "  <- TDP-43 element"
        elif r.feature.startswith("ss_"):
            tag = "  <- acceptor strength"
        print(f"  {r.feature:<20} {r.auc:>6.3f} {r.p:>10.2g} "
              f"{r.cryptic_median:>11.3f} {r.annotated_median:>11.3f}{tag}")
    print("\n  AUC above 0.5 means HIGHER in cryptic acceptors.")

    res = fit_and_evaluate(feat, cols)
    print("\n" + "=" * 78)
    print(f"A MODEL, GENES HELD OUT ({res['_n_splits']} folds)")
    print("=" * 78)
    for name in [k for k in res if not k.startswith("_")]:
        r = res[name]
        print(f"  {name:<34} AUC {r['auc']:.3f}   avg precision {r['ap']:.3f}"
              f"   (base rate {r['base_rate']:.1%})")
    if "sequence only (no conservation)" in res:
        d = (res["all features"]["auc"]
             - res["sequence only (no conservation)"]["auc"])
        print(f"\n  conservation is worth {d:+.3f} AUC. Annotated exons are "
              f"conserved BECAUSE they\n  are used, so that part is circular "
              f"and the sequence-only number is the one\n  that says "
              f"something mechanistic.")

    abl = ablate(feat, cols, n_splits=res["_n_splits"])
    print("\n" + "=" * 78)
    print("WHICH FEATURES CARRY IT? genes held out")
    print("=" * 78)
    print(f"  {'feature set':<32} {'n':>4} {'AUC':>7} {'AP':>7} {'lift':>7}")
    for r in abl.itertuples():
        print(f"  {r.set:<32} {r.n_features:>4} {r.auc:>7.3f} {r.ap:>7.3f} "
              f"{r.lift:>6.1f}x")
    full = abl[abl["set"] == "everything"]
    if len(full):
        fap = float(full["ap"].iloc[0])
        print("\n  Read the AP column, not AUC. A group whose removal barely "
              "moves AUC can\n  still carry much of the precision, and at "
              "this base rate precision is the\n  only thing that matters.")
        for r in abl[abl["set"].str.startswith("everything except")].itertuples():
            cost = (fap - r.ap) / fap if fap else 0.0
            if cost > 0.15:
                grp = r.set.replace("everything except ", "")
                print(f"    dropping {grp} costs {cost:.0%} of the average "
                      f"precision")

    if args.out:
        o = feat.copy()
        for name in [k for k in res if not k.startswith("_")]:
            o[f"score[{name}]"] = res[name]["oof"]
        o.to_csv(args.out, sep="\t", index=False)
        print(f"\nper-position table written to {args.out}")
    return None


if __name__ == "__main__":
    main()
