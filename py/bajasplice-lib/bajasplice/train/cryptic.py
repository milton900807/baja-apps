"""A learned second stage for finding cryptic acceptors in a gene.

THE SHAPE OF THE PROBLEM, settled by arithmetic rather than by trying. Human
intron holds roughly 28 million acceptor-like positions against about 925
known cryptic acceptors, so genome-wide detection needs 99.996% specificity
for even 50% precision and is not reachable. Inside ONE gene the same model
faces a few thousand candidates and needs to put the real one in a top-ten
list, which is both tractable and what an ASO programme actually asks.

So this is a RE-RANKER, not a detector. `scan.rank_candidates` already
enumerates every intronic AG in a gene and scores it with BajaSplice, which is
stage one and is good at "is this an acceptor". Stage two is the question
BajaSplice cannot answer: of these acceptor-like positions, which ones are
held shut by TDP-43 and open when it leaves.

THE NEGATIVES COME FROM THE SAME GENERATOR AS THE POSITIVES. Training a
cryptic/not classifier against random intronic AGs teaches the splice motif
and nothing else: cryptic acceptors carry a polypyrimidine tract 85% of the
time against 35% for arbitrary AGs, so that contrast is learnable without any
cryptic-specific information and BajaSplice already models it. Here every
candidate in a gene that contains a known cryptic acceptor is a training row,
the known ones positive and the rest negative. That is exactly the
distribution the model meets at deployment.

WHAT IS MEASURED. Not AUC on a balanced set, which flatters a model that would
be useless at a 3000:1 base rate. Recall at k within each gene, with genes held
out: given a gene, is its cryptic acceptor in the top k by this model's score,
and is that better than ranking by the BajaSplice score alone. The BajaSplice-
only ranking is the baseline every number here is reported against, because a
second stage that does not beat stage one is not worth running.

A CAVEAT THAT IS A FINDING. `rank_candidates` excludes annotated splice sites,
and about a quarter of catalogued "cryptic" acceptors sit within 1 nt of an
annotated exon boundary. Those positions cannot appear among the candidates,
so they are reported as unrecoverable rather than quietly dropped: a recall
number computed only over recoverable positives would overstate what the tool
can do on a real gene.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

__all__ = ["load_positives", "assemble", "add_features", "recall_at_k",
           "feature_discrimination",
           "fit_and_evaluate", "save_model", "load_model", "rank_gene",
           "main"]

MODEL_NAME = "cryptic_acceptor.joblib"
TOP_K = (1, 5, 10, 25)


def load_positives(path, require_cat="acceptor"):
    """Known cryptic acceptors as gene/chrom/pos/strand.

    Accepts the compendium (a pasteable junction plus junc_cat) or any table
    already carrying chrom/acceptor/strand.
    """
    from bajasplice.evaluate.exon_age import read_events
    ev = read_events(os.path.expanduser(path))
    if require_cat and "junc_cat" in ev.columns:
        before = len(ev)
        ev = ev[ev["junc_cat"].astype(str).str.lower()
                .str.contains(require_cat.lower())]
        print(f"  junc_cat contains {require_cat!r}: {before} -> {len(ev)}")
    gene_col = next((c for c in ("gene", "gene_name") if c in ev.columns), None)
    if gene_col is None:
        raise SystemExit(f"{path} needs a gene column; found {list(ev.columns)}")
    # NOT uppercased. The gene index matches the annotation's own spelling,
    # and GENCODE writes C20orf194, not C20ORF194, so upper() turns a valid
    # symbol into a lookup miss for every orf gene in the catalogue.
    out = pd.DataFrame({
        "gene": ev[gene_col].astype(str).str.strip(),
        "chrom": ev["chrom"].astype(str),
        "pos": pd.to_numeric(ev["acceptor"], errors="coerce"),
        "strand": ev["strand"].astype(str)})
    return out.dropna(subset=["pos"]).drop_duplicates(
        subset=["chrom", "pos", "strand"]).reset_index(drop=True)


def assemble(positives, candidates_fn, tol=0, verbose=True):
    """Candidate tables for every gene holding a positive, labelled.

    `candidates_fn(gene)` returns that gene's candidate frame (pos, score) or
    None. `tol` allows a position to match a candidate a base or two away,
    which matters because catalogues disagree about whether the acceptor is the
    AG's A or its G.
    """
    blocks, missing, no_cands, skipped = [], 0, [], []
    for gene, grp in positives.groupby("gene", sort=False):
        try:
            cand = candidates_fn(gene)
        except (Exception, SystemExit) as e:
            # scan.gene_span raises SystemExit for a symbol the index lacks,
            # and SystemExit does NOT inherit from Exception, so a bare
            # `except Exception` let one retired gene symbol kill a 60-gene
            # run after the splice model had already loaded.
            cand = None
            skipped.append((gene, str(e)[:60]))
        if cand is None or not len(cand):
            no_cands.append(gene)
            missing += len(grp)
            continue
        cand = cand.copy()
        cand["gene"] = gene
        want = grp["pos"].to_numpy(dtype=float)
        cp = cand["pos"].to_numpy(dtype=float)
        if tol:
            hit = np.any(np.abs(cp[:, None] - want[None, :]) <= tol, axis=1)
        else:
            hit = np.isin(cp, want)
        cand["is_positive"] = hit
        found = int(cand["is_positive"].sum())
        missing += max(0, len(grp) - found)
        blocks.append(cand)
    out = (pd.concat(blocks, ignore_index=True) if blocks
           else pd.DataFrame(columns=["pos", "score", "gene", "is_positive"]))
    if verbose:
        n_pos = int(out["is_positive"].sum()) if len(out) else 0
        print(f"\n  genes with candidates: "
              f"{out['gene'].nunique() if len(out) else 0}")
        if no_cands:
            print(f"  genes with NO candidates: {len(no_cands)} "
                  f"({', '.join(no_cands[:5])}{'...' if len(no_cands) > 5 else ''})")
        if skipped:
            print(f"  genes the scanner could not resolve: {len(skipped)}")
            for gene, why in skipped[:5]:
                print(f"    {gene:<16} {why}")
            if len(skipped) > 5:
                print(f"    ... and {len(skipped) - 5} more")
            print("    Usually a retired symbol the current annotation no "
                  "longer carries. Skipped,\n    not fatal, but they are "
                  "positives this model never got to see.")
        print(f"  candidate rows: {len(out)}")
        print(f"  positives recovered among candidates: {n_pos}")
        print(f"  positives NOT recoverable: {missing}")
        if len(out) and missing:
            frac = missing / (missing + n_pos)
            print(f"    {frac:.0%} of known cryptic acceptors never appear as "
                  f"candidates.")
            print(f"    rank_candidates excludes annotated splice sites, and "
                  f"about a quarter of\n    catalogued cryptic acceptors sit "
                  f"on an annotated boundary. Recall below is\n    over "
                  f"RECOVERABLE positives and overstates whole-gene "
                  f"performance by this much.")
        if len(out):
            print(f"  base rate among candidates: "
                  f"{n_pos / len(out):.2%}  "
                  f"(1 in {len(out) / max(n_pos, 1):.0f})")
    return out


def add_features(cands, fasta, span=300):
    """Sequence features for each candidate, from the same code the model
    pipeline uses, so train and deploy cannot drift apart."""
    from bajasplice.evaluate.cryptic_features import (tract_features,
                                                      ug_features,
                                                      upstream_seq)
    recs = []
    for r in cands.itertuples():
        seq = upstream_seq(fasta, str(r.chrom), int(r.pos), str(r.strand),
                           span=span)
        rec = {}
        if seq:
            rec.update(ug_features(seq))
            rec.update(tract_features(seq))
        recs.append(rec)
    feat = pd.DataFrame(recs, index=cands.index)
    out = pd.concat([cands, feat], axis=1)
    # the BajaSplice score from stage one is a feature of stage two, and the
    # baseline this is all measured against
    out = out.rename(columns={"score": "ss_acceptor"})
    return out


def recall_at_k(df, score_col, ks=TOP_K):
    """Per gene: is a positive in the top k by `score_col`.

    Averaged over genes, not over rows. A row average would let one gene with
    many candidates dominate, and the question is asked one gene at a time.
    """
    out = {}
    genes = [g for g, d in df.groupby("gene") if d["is_positive"].any()]
    for k in ks:
        hits = 0
        for g in genes:
            d = df[df["gene"] == g].nlargest(int(k), score_col)
            hits += int(d["is_positive"].any())
        out[k] = hits / len(genes) if genes else float("nan")
    out["n_genes"] = len(genes)
    return out


def fit_and_evaluate(feat, feature_cols, ks=TOP_K, seed=0, n_splits=5):
    """Gene-held-out evaluation against the BajaSplice-only baseline."""
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.model_selection import GroupKFold

    X = feat[feature_cols]
    y = feat["is_positive"].astype(int).to_numpy()
    g = feat["gene"].astype(str)
    n_splits = int(min(n_splits, g.nunique()))
    if n_splits < 2 or y.sum() < 10:
        raise SystemExit(
            f"not enough to evaluate: {int(y.sum())} positives across "
            f"{g.nunique()} genes")
    oof = np.full(len(feat), np.nan)
    for tr, te in GroupKFold(n_splits=n_splits).split(X, y, groups=g):
        clf = HistGradientBoostingClassifier(
            max_depth=3, max_iter=300, learning_rate=0.05,
            l2_regularization=1.0, random_state=seed)
        clf.fit(X.iloc[tr], y[tr])
        oof[te] = clf.predict_proba(X.iloc[te])[:, 1]
    out = feat.copy()
    out["model_score"] = oof
    model_r = recall_at_k(out, "model_score", ks)
    base_r = recall_at_k(out, "ss_acceptor", ks)

    clf = HistGradientBoostingClassifier(
        max_depth=3, max_iter=300, learning_rate=0.05,
        l2_regularization=1.0, random_state=seed)
    clf.fit(X, y)
    return {"oof": out, "model": clf, "model_recall": model_r,
            "baseline_recall": base_r, "features": list(feature_cols),
            "n_splits": n_splits}


def save_model(res, path):
    import joblib
    joblib.dump({"model": res["model"], "features": res["features"],
                 "model_recall": res["model_recall"],
                 "baseline_recall": res["baseline_recall"]}, path)


def load_model(path=None):
    import joblib
    from bajasplice.config import paths
    p = path or (paths().models / MODEL_NAME)
    if not os.path.exists(p):
        raise SystemExit(
            f"no cryptic model at {p}; train one with "
            f"`bajasplice train cryptic --positives <table>`")
    return joblib.load(p)


def rank_gene(gene, fasta, model=None, ckpt=None, device=None, span=300,
              top=10):
    """Candidates for one gene, re-ranked by the trained second stage."""
    from bajasplice.scan import rank_candidates
    bundle = model or load_model()
    cand = rank_candidates(gene, "acceptor", ckpt=ckpt, device=device)
    if cand is None or not len(cand):
        return None
    cand = cand.copy()
    cand["gene"] = str(gene).upper()
    feat = add_features(cand, fasta, span=span)
    cols = bundle["features"]
    for c in cols:
        if c not in feat.columns:
            feat[c] = np.nan
    feat["model_score"] = bundle["model"].predict_proba(feat[cols])[:, 1]
    out = feat.sort_values("model_score", ascending=False)
    out["model_rank"] = np.arange(1, len(out) + 1)
    keep = ["model_rank", "chrom", "pos", "strand", "model_score",
            "ss_acceptor", "ug_run_total", "ug_dist_nearest", "py_20"]
    return out[[c for c in keep if c in out.columns]].head(int(top))


def feature_discrimination(feat, cols, ks=TOP_K):
    """Each feature's own AUC for positives against all other candidates.

    This is the diagnostic that explains a model-level failure without
    reference to any learner. On the first real run it showed ss_acceptor at
    0.988 and the polypyrimidine tract at 0.917, while the TDP-43 element
    (ug_run_total) reached only 0.571 at p=0.09. What marks a cryptic acceptor
    out from the other few thousand intronic AGs in its gene is that it looks
    like a real acceptor, and that is already what stage one scores, so there
    was nothing left for a second stage to add.
    """
    from scipy import stats as sps
    pos = feat["is_positive"].astype(bool)
    rows = []
    for c in cols:
        a = feat.loc[pos, c].dropna()
        b = feat.loc[~pos, c].dropna()
        if len(a) < 5 or len(b) < 5:
            continue
        u = sps.mannwhitneyu(a, b, alternative="two-sided")
        rows.append((c, u.statistic / (len(a) * len(b)), u.pvalue))
    rows.sort(key=lambda r: -abs(r[1] - 0.5))
    return rows


def report(res, ks=TOP_K, feat=None, cols=None):
    m, b = res["model_recall"], res["baseline_recall"]
    print("\n" + "=" * 70)
    print(f"RECALL AT k, GENES HELD OUT ({res['n_splits']} folds, "
          f"{m['n_genes']} genes with a recoverable positive)")
    print("=" * 70)
    print(f"  {'k':>4} {'BajaSplice alone':>18} {'+ second stage':>16} "
          f"{'change':>9}")
    better = 0
    for k in ks:
        d = m[k] - b[k]
        better += d > 0
        print(f"  {k:>4} {b[k]:>17.1%} {m[k]:>16.1%} {d:>+9.1%}")
    if feat is not None and cols:
        disc = feature_discrimination(feat, cols, ks)
        print("\n  Each feature on its own (AUC for positives against every "
              "other candidate):")
        for c, auc, pv in disc[:8]:
            tag = ""
            if c == "ss_acceptor":
                tag = "   <- stage one's own score"
            elif c.startswith("ug_"):
                tag = "   <- the TDP-43 element"
            print(f"    {c:<20} AUC {auc:>5.3f}  p={pv:<9.2g}{tag}")
        ug = [r for r in disc if r[0].startswith("ug_")]
        if ug and max(abs(a - 0.5) for _, a, _ in ug) < 0.1:
            print("    The TDP-43 element does not discriminate. Whatever "
                  "separates these\n    positions is acceptor-likeness, "
                  "which stage one already scores.")

    print("\n  The baseline is ranking by the BajaSplice acceptor score alone.")
    if better == 0:
        print("  THE SECOND STAGE ADDS NOTHING at any k. On this evidence "
              "the right tool is\n  `scan --rank acceptor`, and this model "
              "should not ship.")
    elif better < len(ks):
        print("  Mixed: it helps at some k and not others, which on a few "
              "hundred genes is\n  what noise looks like. Treat it as "
              "unproven rather than as an improvement.")
    else:
        print("  It beats the baseline at every k, which is the minimum bar "
              "for shipping a\n  second stage.")


def main(argv=None):
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--positives", required=True,
                    help="known cryptic acceptors (the compendium, or any "
                         "table with gene/chrom/acceptor/strand)")
    ap.add_argument("--genome", required=True, help="hg38 FASTA")
    ap.add_argument("--require-cat", default="acceptor",
                    help="junc_cat filter on the positives "
                         "(default acceptor; pass '' to keep all)")
    ap.add_argument("--tol", type=int, default=1,
                    help="bases of slack when matching a known position to a "
                         "candidate; catalogues disagree about whether the "
                         "acceptor is the AG's A or its G (default 1)")
    ap.add_argument("--span", type=int, default=300)
    ap.add_argument("--max-genes", type=int, default=None,
                    help="stop after this many genes, for a quick pass")
    ap.add_argument("--ckpt", default=None)
    ap.add_argument("--device", default=None)
    ap.add_argument("--out-model", default=None,
                    help=f"where to save it (default <models>/{MODEL_NAME})")
    ap.add_argument("--force", action="store_true",
                    help="save the model even if it loses to ranking by the "
                         "BajaSplice score alone")
    ap.add_argument("--out", default=None, help="per-candidate table")
    args = ap.parse_args(argv)

    from bajasplice.config import paths
    from bajasplice.evaluate.exon_age import TargetFasta
    from bajasplice.scan import load_splicenet, rank_candidates

    pos = load_positives(args.positives, args.require_cat or None)
    print(f"{len(pos)} known cryptic acceptors across "
          f"{pos['gene'].nunique()} genes")
    if args.max_genes:
        keep = sorted(pos["gene"].unique())[:int(args.max_genes)]
        pos = pos[pos["gene"].isin(keep)]
        print(f"  limited to {len(keep)} genes ({len(pos)} positives)")

    fasta = TargetFasta(os.path.expanduser(args.genome))
    print(f"  genome: {os.path.basename(args.genome)}")
    sn = load_splicenet(ckpt=args.ckpt, device=args.device)
    print(f"  splice model loaded, context {sn[1]}")

    done = {"n": 0}

    def candidates_fn(gene):
        done["n"] += 1
        if done["n"] % 25 == 0:
            print(f"    scanned {done['n']} genes")
        return rank_candidates(gene, "acceptor", ckpt=args.ckpt,
                               device=args.device)

    cands = assemble(pos, candidates_fn, tol=args.tol)
    if not len(cands) or not cands["is_positive"].any():
        raise SystemExit("no labelled candidates; nothing to train on")

    feat = add_features(cands, fasta, span=args.span)
    drop = {"rank", "pos", "chrom", "strand", "type", "gene", "is_positive",
            "seq_len", "is_ag"}
    cols = [c for c in feat.columns
            if c not in drop and pd.api.types.is_numeric_dtype(feat[c])
            and feat[c].notna().mean() > 0.5]
    print(f"\n  features ({len(cols)}): {', '.join(cols)}")

    res = fit_and_evaluate(feat, cols)
    report(res, feat=feat, cols=cols)

    m, b = res["model_recall"], res["baseline_recall"]
    wins = sum(m[k] > b[k] for k in TOP_K)
    out_model = args.out_model or (paths().models / MODEL_NAME)
    if wins <= len(TOP_K) // 2 and not args.force:
        # Installing it anyway puts a model worse than doing nothing where
        # `scan --cryptic` will load it. The first real run lost at all four
        # values of k and still wrote the file.
        print(f"\nNOT SAVED. It beat the baseline at {wins} of "
              f"{len(TOP_K)} values of k.")
        print(f"  A model that loses to `scan --rank acceptor` should not sit "
              f"where --cryptic\n  will load it. Pass --force to save it "
              f"anyway, and delete any earlier copy:")
        print(f"    rm -f {out_model}")
        return None
    os.makedirs(os.path.dirname(str(out_model)), exist_ok=True)
    save_model(res, str(out_model))
    print(f"\nmodel written to {out_model}")
    print(f"  use it with:  bajasplice scan --gene <GENE> --cryptic")
    if args.out:
        res["oof"].to_csv(args.out, sep="\t", index=False)
        print(f"per-candidate table written to {args.out}")
    return None


if __name__ == "__main__":
    main()
