#!/usr/bin/env python
"""Benchmark: does the splice-site model score TDP-43-induced cryptic splice
sites above sequence-matched decoys?

Positives are the unannotated splice sites of junctions that appear only after
TDP-43 depletion, discovered de novo from recount3 junction counts.

Decoys are other AG (acceptor) or GT (donor) dinucleotides drawn from the same
intron, in the same orientation. Matching on the dinucleotide matters: without
it the model would be rewarded for the trivial fact that real splice sites
carry AG/GT.

Held-out only: cryptic sites on chr1/3/5/7/9, which the model never trained on.
"""
import numpy as np, pandas as pd, torch, os, sys, json
from sklearn.metrics import roc_auc_score
from bajasplice.genome import GenomeReader, one_hot, split_of, TEST_CHROMS
from bajasplice.models import SpliceNet

from bajasplice.config import paths
TARGET = 64                 # scored window; only the centre position is used
N_DECOY = 20
DECOY_RADIUS = 3000


@torch.no_grad()
def score_positions(model, context, items, device, batch=64):
    """items: list of (chrom, pos, strand, which) -> probability at that position."""
    g = GenomeReader()
    out = np.zeros(len(items), np.float32)
    half = TARGET // 2
    c = context // 2
    for i in range(0, len(items), batch):
        chunk = items[i:i + batch]
        X = np.zeros((len(chunk), 4, TARGET + context), np.float32)
        for j, (chrom, pos, strand, _) in enumerate(chunk):
            s = pos - half
            codes = g.codes(chrom, s - c, s + TARGET - 1 + c, strand)
            X[j] = one_hot(codes)
        x = torch.from_numpy(X).to(device)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            p = torch.softmax(model(x).float(), 1).cpu().numpy()   # (B,3,TARGET)
        for j, (chrom, pos, strand, which) in enumerate(chunk):
            k = half if strand == "+" else TARGET - 1 - half
            out[i + j] = p[j, 1 if which == "acceptor" else 2, k]
    return out


def decoys(g, chrom, strand, true_pos, which, rng):
    """AG/GT dinucleotides near the true site, same orientation, excluding it."""
    lo, hi = true_pos - DECOY_RADIUS, true_pos + DECOY_RADIUS
    codes = g.codes(chrom, lo, hi, "+")
    if which == "acceptor":
        if strand == "+":
            hit = np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 3)) + 1   # AG, G is site
        else:
            hit = np.flatnonzero((codes[:-1] == 2) & (codes[1:] == 4))       # CT = rc(AG)
    else:
        if strand == "+":
            hit = np.flatnonzero((codes[:-1] == 3) & (codes[1:] == 4))       # GT, G is site
        else:
            hit = np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 2)) + 1   # AC = rc(GT)
    pos = hit + lo
    pos = pos[pos != true_pos]
    if len(pos) == 0:
        return []
    take = rng.choice(len(pos), min(N_DECOY, len(pos)), replace=False)
    return [int(pos[t]) for t in take]


def main():
    J = pd.read_csv(os.path.join(paths().interim, "cryptic_junctions.tsv"), sep="\t", low_memory=False)
    J = J[J.chromosome.isin(TEST_CHROMS)]
    print(f"cryptic junctions on held-out chromosomes: {len(J):,}", flush=True)

    sites = []
    site_study = {}
    for r in J.itertuples(index=False):
        st = r.strand if r.strand in "+-" else "+"
        # genomic left = donor on +, acceptor on -; right = the other way round
        if r.left_novel:
            k = (r.chromosome, int(r.start), st, "donor" if st == "+" else "acceptor")
            sites.append(k); site_study.setdefault(k, set()).add(r.study)
        if r.right_novel:
            k = (r.chromosome, int(r.end), st, "acceptor" if st == "+" else "donor")
            sites.append(k); site_study.setdefault(k, set()).add(r.study)
    sites = list(dict.fromkeys(sites))
    print(f"unannotated cryptic splice sites: {len(sites)}", flush=True)
    if len(sites) < 20:
        print("too few to benchmark"); return

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ck = torch.load(os.path.join(paths().models, "ss_ctx2000.pt"), map_location="cpu", weights_only=False)
    model = SpliceNet(context=ck["args"]["context"], ch=ck["args"]["channels"]).to(device).eval()
    model.load_state_dict(ck["model"])
    context = ck["args"]["context"]

    g = GenomeReader(); rng = np.random.default_rng(0)
    dec_items, dec_owner = [], []
    for i, (chrom, pos, strand, which) in enumerate(sites):
        for d in decoys(g, chrom, strand, pos, which, rng):
            dec_items.append((chrom, d, strand, which)); dec_owner.append(i)
    print(f"dinucleotide-matched decoys: {len(dec_items):,}", flush=True)

    s_pos = score_positions(model, context, sites, device)
    s_dec = score_positions(model, context, dec_items, device)

    y = np.r_[np.ones(len(s_pos)), np.zeros(len(s_dec))]
    s = np.r_[s_pos, s_dec]
    auc = roc_auc_score(y, s)
    # per-site rank against its own decoys
    owner = np.array(dec_owner)
    ranks = []
    for i in range(len(sites)):
        d = s_dec[owner == i]
        if len(d):
            ranks.append(float((s_pos[i] > d).mean()))
    res = {
        "n_cryptic_sites": len(sites), "n_decoys": len(dec_items),
        "auc_vs_matched_decoys": float(auc),
        "median_within_site_percentile": float(np.median(ranks)),
        "frac_sites_beating_all_decoys": float(np.mean([r == 1.0 for r in ranks])),
        "median_score_cryptic": float(np.median(s_pos)),
        "median_score_decoy": float(np.median(s_dec)),
        "frac_cryptic_above_0.5": float((s_pos > 0.5).mean()),
        "frac_decoy_above_0.5": float((s_dec > 0.5).mean()),
    }
    # split by discovery study: SRP169127 is the one where the STMN2 positive
    # control fired, so it is the subset whose TDP-43 dependence is verified
    res["by_study"] = {}
    for st_name in ("SRP169127", "SRP069787", "SRP496259"):
        idx = [i for i, k in enumerate(sites) if st_name in site_study.get(k, ())]
        if len(idx) < 20:
            continue
        keep = np.isin(owner, idx)
        yy = np.r_[np.ones(len(idx)), np.zeros(int(keep.sum()))]
        ss = np.r_[s_pos[idx], s_dec[keep]]
        res["by_study"][st_name] = {
            "n_sites": len(idx), "n_decoys": int(keep.sum()),
            "auc": float(roc_auc_score(yy, ss)),
            "frac_above_0.5": float((s_pos[idx] > 0.5).mean()),
        }
    print(json.dumps(res, indent=2), flush=True)
    pd.DataFrame([{"chrom": c, "pos": p, "strand": st, "type": w, "score": float(v)}
                  for (c, p, st, w), v in zip(sites, s_pos)]).to_csv(
        os.path.join(paths().interim, "cryptic_sites_scored.tsv"), sep="\t", index=False)
    with open(os.path.join(paths().results, "cryptic_site_benchmark.json"), "w") as f:
        json.dump(res, f, indent=2)


if __name__ == "__main__":
    main()
