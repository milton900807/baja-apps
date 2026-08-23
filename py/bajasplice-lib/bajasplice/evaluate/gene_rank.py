#!/usr/bin/env python
"""Rank every candidate cryptic splice site in UNC13A, and ask whether the
model's ranking tracks experimental junction usage.

Part 1: score every intronic AG (acceptor) and GT (donor) dinucleotide in
        UNC13A and rank them, marking the sites reported by Ma et al. 2022.
Part 2: across all TDP-43-induced cryptic sites discovered from recount3, test
        whether model score correlates with how strongly the junction is
        actually used after TDP-43 depletion.
"""
import numpy as np, pandas as pd, torch, os, sys, json
from scipy.stats import spearmanr, pearsonr, mannwhitneyu
from bajasplice.genome import GenomeReader, one_hot, TEST_CHROMS
from bajasplice.models import SpliceNet

from bajasplice.config import paths
RAW = str(paths().raw / "recount3" / "tdp43")
TARGET = 64

KNOWN = {  # Ma et al. Nature 2022, UNC13A is on the minus strand
    17642542: "acceptor of 128 bp cryptic exon",
    17642592: "acceptor of 178 bp cryptic exon",
    17642413: "donor of both cryptic exons",
}


@torch.no_grad()
def score_positions(model, context, items, device, batch=256):
    g = GenomeReader(); out = np.zeros(len(items), np.float32)
    half = TARGET // 2; c = context // 2
    for i in range(0, len(items), batch):
        ch = items[i:i + batch]
        X = np.zeros((len(ch), 4, TARGET + context), np.float32)
        for j, (chrom, pos, strand, _) in enumerate(ch):
            s = pos - half
            X[j] = one_hot(g.codes(chrom, s - c, s + TARGET - 1 + c, strand))
        p = torch.softmax(model(torch.from_numpy(X).to(device)).float(), 1).cpu().numpy()
        for j, (_, _, strand, which) in enumerate(ch):
            k = half if strand == "+" else TARGET - 1 - half
            out[i + j] = p[j, 1 if which == "acceptor" else 2, k]
    return out


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(os.path.join(paths().models, "ss_ctx2000.pt"), map_location="cpu", weights_only=False)
    model = SpliceNet(context=ck["args"]["context"], ch=ck["args"]["channels"]).to(device).eval()
    model.load_state_dict(ck["model"]); context = ck["args"]["context"]

    # ---------- part 1: UNC13A ----------
    ex = pd.read_csv(os.path.join(paths().interim, "exons.tsv"), sep="\t", low_memory=False,
                     usecols=["chrom", "start", "end", "strand", "gene_name"])
    u = ex[ex.gene_name == "UNC13A"]
    chrom, gs, ge, strand = u.chrom.iloc[0], int(u.start.min()), int(u.end.max()), u.strand.iloc[0]
    g = GenomeReader()
    codes = g.codes(chrom, gs, ge, "+")
    exonic = np.zeros(ge - gs + 1, bool)
    for s, e in zip(u.start, u.end):
        exonic[max(0, s - gs):max(0, e - gs + 1)] = True
    intronic = ~exonic
    # minus strand: acceptor sits on CT (= revcomp AG), donor on AC (= revcomp GT)
    acc_hit = np.flatnonzero((codes[:-1] == 2) & (codes[1:] == 4))
    don_hit = np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 2)) + 1
    # exclude ANNOTATED splice sites: for every annotated exon the flanking
    # intronic bases are real sites of some transcript, and they score ~1.0.
    # Leaving them in makes the ranking a list of known sites, not cryptic ones.
    annot_sites = set()
    for st_, en_ in zip(u.start, u.end):
        annot_sites.add(int(st_) - 1); annot_sites.add(int(en_) + 1)
    acc_pos = [gs + int(i) for i in acc_hit if intronic[i] and (gs + int(i)) not in annot_sites]
    don_pos = [gs + int(i) for i in don_hit if intronic[i] and (gs + int(i)) not in annot_sites]
    print(f"  excluded {len(annot_sites)} annotated splice-site positions", flush=True)
    print(f"UNC13A {chrom}:{gs:,}-{ge:,} ({strand})  "
          f"{len(acc_pos):,} intronic acceptor candidates, {len(don_pos):,} donor candidates",
          flush=True)

    items = [(chrom, p, strand, "acceptor") for p in acc_pos] + \
            [(chrom, p, strand, "donor") for p in don_pos]
    sc = score_positions(model, context, items, device)
    df = pd.DataFrame({"pos": [i[1] for i in items], "type": [i[3] for i in items], "score": sc})
    df["known"] = df.pos.map(KNOWN).fillna("")
    for t in ("acceptor", "donor"):
        sub = df[df.type == t].sort_values("score", ascending=False).reset_index(drop=True)
        sub["rank"] = np.arange(1, len(sub) + 1)
        print(f"\n  top 10 predicted cryptic {t}s in UNC13A introns:")
        print(sub.head(10)[["rank", "pos", "score", "known"]].to_string(index=False), flush=True)
        k = sub[sub.known != ""]
        if len(k):
            print(f"  known {t} sites:")
            for r in k.itertuples(index=False):
                print(f"    chr19:{r.pos:,}  rank {r.rank} of {len(sub):,}  "
                      f"score {r.score:.4f}  ({r.known})", flush=True)
        sub.to_csv(os.path.join(paths().interim, f"unc13a_ranked_{t}s.tsv"), sep="\t", index=False)

    # ---------- part 2: does rank track experiment? ----------
    J = pd.read_csv(os.path.join(paths().interim, "cryptic_junctions.tsv"), sep="\t", low_memory=False)
    rows = []
    for r in J.itertuples(index=False):
        st = r.strand if r.strand in "+-" else "+"
        if r.left_novel:
            rows.append((r.chromosome, int(r.start), st, "donor" if st == "+" else "acceptor",
                         float(r.kd_mean), float(r.ctl_mean), r.study))
        if r.right_novel:
            rows.append((r.chromosome, int(r.end), st, "acceptor" if st == "+" else "donor",
                         float(r.kd_mean), float(r.ctl_mean), r.study))
    D = pd.DataFrame(rows, columns=["chrom", "pos", "strand", "type", "kd", "ctl", "study"])
    D = D.groupby(["chrom", "pos", "strand", "type"], as_index=False).agg(
        kd=("kd", "max"), ctl=("ctl", "max"), n_studies=("study", "nunique"))
    D = D[D.chrom.isin(TEST_CHROMS)].reset_index(drop=True)
    D["score"] = score_positions(model, context,
                                 list(D[["chrom", "pos", "strand", "type"]].itertuples(index=False, name=None)),
                                 device)
    D["log_kd"] = np.log10(D.kd + 0.1)
    out = {"n_sites": int(len(D))}
    rs, ps = spearmanr(D.score, D.log_kd)
    out["spearman_score_vs_kd_usage"] = float(rs); out["spearman_p"] = float(ps)
    print(f"\n=== does model score track experimental usage? (n={len(D)} held-out cryptic sites) ===")
    print(f"  Spearman(model score, log10 knockdown junction usage) = {rs:.4f}  p={ps:.3g}", flush=True)
    # strong vs weak cryptic junctions
    hi = D[D.kd >= D.kd.quantile(0.75)]; lo = D[D.kd <= D.kd.quantile(0.25)]
    uu, pu = mannwhitneyu(hi.score, lo.score, alternative="greater")
    out["median_score_strong"] = float(hi.score.median()); out["median_score_weak"] = float(lo.score.median())
    out["mannwhitney_p"] = float(pu)
    print(f"  strongly used cryptic junctions  median score {hi.score.median():.4f} (n={len(hi)})")
    print(f"  weakly used cryptic junctions    median score {lo.score.median():.4f} (n={len(lo)})")
    print(f"  Mann-Whitney one-sided p = {pu:.3g}", flush=True)
    # reproducibility across studies
    if D.n_studies.max() > 1:
        m1 = D[D.n_studies == 1].score; m2 = D[D.n_studies > 1].score
        if len(m2) > 5:
            out["median_score_single_study"] = float(m1.median())
            out["median_score_multi_study"] = float(m2.median())
            print(f"  seen in 1 study: median {m1.median():.4f} (n={len(m1)}) | "
                  f">1 study: median {m2.median():.4f} (n={len(m2)})", flush=True)
    D.to_csv(os.path.join(paths().interim, "cryptic_sites_with_usage.tsv"), sep="\t", index=False)
    with open(os.path.join(paths().results, "cryptic_rank_vs_experiment.json"), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
