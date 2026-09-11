"""Cis-regulatory impact of sequence around a splice site.

The question this answers: if you scramble the sequence in a window at distance
d from a splice site, how much does the model's confidence in that site fall?
A large drop means the sequence there carries regulatory information the site
depends on.

Two design points decide whether the answer means anything.

**The null must preserve composition.** Replacing a window with N, or with
uniformly random bases, changes GC content and base composition as well as
destroying motifs, so the measured drop conflates the two. Here the window is
shuffled while preserving its dinucleotide frequencies (Altschul-Erikson), so
composition is held constant and only the arrangement of bases is destroyed.
What remains is the contribution of motif structure.

**The receptive field is a hard wall.** The model physically cannot see beyond
+/-1000 nt for the ctx-2000 checkpoint. Sequence outside that window has
exactly zero influence, and a profile extended past it would show a flat line
that reads like "no regulatory content here" when it actually means "not
measurable". Requests beyond the receptive field are refused rather than
answered.
"""
from __future__ import annotations

import numpy as np
import torch

from bajasplice.genome import GenomeReader, one_hot, str_to_codes
from bajasplice.models import SCHEDULES

__all__ = ["receptive_field", "dinuc_shuffle", "cis_profile",
           "cis_profile_sequence", "aggregate_cis_profile"]

_ALPH = "ACGT"


def receptive_field(context: int) -> int:
    """Half-width in nucleotides that the model can actually see."""
    if context not in SCHEDULES:
        raise ValueError(f"unknown context {context}")
    return sum(2 * (k - 1) * d for k, d in SCHEDULES[context]) // 2


_COMP_CODES = np.array([0, 4, 3, 2, 1], dtype=np.int8)   # N, A<->T, C<->G


def _rf_message(max_dist, rf):
    return (f"max_dist={max_dist} exceeds the model's receptive field of {rf} nt. "
            f"Sequence beyond {rf} nt has no influence on the prediction, so a "
            f"profile that far out would be flat by construction rather than by "
            f"biology. Use max_dist<={rf}, or a checkpoint trained with more "
            f"context (SpliceNet supports 10000, giving +/-5000).")


def dinuc_shuffle(codes, rng):
    """Shuffle preserving dinucleotide frequencies (Altschul & Erikson 1985).

    Mononucleotide shuffling would preserve the base composition of a
    polypyrimidine tract but not its run structure; preserving dinucleotides
    keeps both the composition and the local transition statistics, so a drop
    in score is attributable to longer-range arrangement rather than to
    composition having changed.

    The result is always the same length as the input. N positions (code 0,
    from an assembly gap or from padding past the end of a track) are held
    where they are and the ACGT positions are shuffled among themselves;
    returning only the shuffled bases would silently shorten the window and
    shift every base after it.
    """
    codes = np.asarray(codes, dtype=np.int8)
    real = np.flatnonzero((codes >= 1) & (codes <= 4))
    s = [int(c) for c in codes[real]]
    if len(s) < 4:
        return codes.copy()
    last = s[-1]
    edges = {b: [] for b in range(1, 5)}
    for a, b in zip(s[:-1], s[1:]):
        edges[a].append(b)

    # pick, for each vertex, a last-edge that forms a tree rooted at `last`;
    # this is what guarantees the Eulerian walk stays connected
    for _ in range(100):
        last_edge = {}
        for v in range(1, 5):
            if v != last and edges[v]:
                last_edge[v] = edges[v][rng.integers(len(edges[v]))]
        ok = True
        for v in list(last_edge):
            seen, u = set(), v
            while u != last:
                if u in seen or u not in last_edge:
                    ok = False
                    break
                seen.add(u)
                u = last_edge[u]
            if not ok:
                break
        if ok:
            break
    else:
        arr = np.array(s, dtype=np.int8)
        rng.shuffle(arr)
        return _scatter(codes, real, arr)

    pool = {v: list(e) for v, e in edges.items()}
    for v, e in last_edge.items():
        pool[v].remove(e)
    for v in pool:
        rng.shuffle(pool[v])
    for v, e in last_edge.items():
        pool[v].append(e)

    out, cur = [s[0]], s[0]
    for _ in range(len(s) - 1):
        if not pool[cur]:
            break
        nxt = pool[cur].pop(0)
        out.append(nxt)
        cur = nxt
    while len(out) < len(s):
        out.append(s[len(out)])
    return _scatter(codes, real, np.array(out[:len(s)], dtype=np.int8))


def _scatter(codes, idx, shuffled):
    out = codes.copy()
    out[idx] = shuffled
    return out


@torch.no_grad()
def _score_batch(model, mats, which, device, idx, batch=128, space="logit"):
    """Score a batch at one output position.

    Probabilities saturate: a confident site sits at 0.999 and a real loss of
    regulatory support can move it by 0.001 while moving the log-odds by
    several nats. Measuring impact in probability space therefore reports
    almost nothing for exactly the sites that are best predicted. Log-odds has
    no ceiling, so it is the default; probability is available for reporting.
    """
    out = np.zeros(len(mats), np.float32)
    ch = 1 if which == "acceptor" else 2
    for i in range(0, len(mats), batch):
        x = torch.from_numpy(np.stack(mats[i:i + batch])).to(device)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=device.type == "cuda"):
            lg = model(x).float()[:, :, idx]
        if space == "prob":
            v = torch.softmax(lg, 1)[:, ch]
        else:
            # log(p / (1-p)) computed from logits without ever forming p
            others = torch.cat([lg[:, :ch], lg[:, ch + 1:]], dim=1)
            v = lg[:, ch] - torch.logsumexp(others, dim=1)
        out[i:i + batch] = v.cpu().numpy()
    return out


def cis_profile(model, context, chrom, site, strand, which, device,
                max_dist=None, bin_size=50, step=25, n_shuffle=6,
                genome=None, seed=0, strict=True, space="logit"):
    """Impact of scrambling each window of sequence around one splice site.

    Returns a DataFrame with one row per window: its offset from the site, the
    mean drop in the site's score across `n_shuffle` composition-matched
    scrambles, and the spread of those scrambles.
    """
    rf = receptive_field(context)
    if max_dist is None:
        max_dist = rf
    if max_dist > rf:
        if strict:
            raise ValueError(_rf_message(max_dist, rf))
        max_dist = rf

    g = genome or GenomeReader()
    c = context // 2
    codes = g.codes(chrom, site - c, site + c, strand)
    return _profile_from_codes(model, context, codes, which, device,
                               max_dist=max_dist, bin_size=bin_size, step=step,
                               n_shuffle=n_shuffle, seed=seed, space=space)


def cis_profile_sequence(model, context, sequence, site_index, strand, which,
                         device, max_dist=None, bin_size=50, step=25,
                         n_shuffle=6, seed=0, strict=True, space="logit"):
    """cis_profile for a sequence held in memory rather than a genome FASTA.

    The interactive client has the track's own sequence and an index into it,
    not a chromosome and a coordinate, and a track may be shorter than the
    model's input window. The window is cut to context+1 around site_index and
    zero-padded where the track runs out, so a site near either end profiles
    correctly with the missing side reading as absent rather than as sequence
    borrowed from elsewhere.

    `strand` is the track's strand: on the minus strand the sequence is
    reverse-complemented and site_index re-expressed from the other end, so
    offsets come back in transcript orientation exactly as for cis_profile.
    """
    rf = receptive_field(context)
    if max_dist is None:
        max_dist = rf
    if max_dist > rf:
        if strict:
            raise ValueError(_rf_message(max_dist, rf))
        max_dist = rf

    codes = str_to_codes(sequence)
    n = len(codes)
    i = int(site_index)
    if not 0 <= i < n:
        raise ValueError(f"site_index {i} is outside the sequence (length {n})")
    if str(strand) in ("-", "-1", "minus"):
        codes = _COMP_CODES[codes[::-1]]
        i = n - 1 - i

    c = context // 2
    win = np.zeros(2 * c + 1, dtype=np.int8)
    lo, hi = i - c, i + c                      # inclusive, may fall outside
    src_lo, src_hi = max(0, lo), min(n - 1, hi)
    if src_hi >= src_lo:
        win[src_lo - lo:src_hi - lo + 1] = codes[src_lo:src_hi + 1]
    return _profile_from_codes(model, context, win, which, device,
                               max_dist=max_dist, bin_size=bin_size, step=step,
                               n_shuffle=n_shuffle, seed=seed, space=space)


def _profile_from_codes(model, context, codes, which, device, max_dist,
                        bin_size, step, n_shuffle, seed, space):
    """Shared core: scramble each window of `codes` and rescore the center."""
    import pandas as pd

    rf = receptive_field(context)
    c = context // 2
    # two coordinate systems: windows are placed in INPUT space, where the site
    # sits at index c, but the model crops context//2 from each side, so the
    # scored position in OUTPUT space is c - context//2, which is 0 here.
    center = c
    center_out = c - context // 2
    ref_mat = one_hot(codes)
    ref = float(_score_batch(model, [ref_mat], which, device, center_out, space=space)[0])
    ref_prob = float(_score_batch(model, [ref_mat], which, device, center_out, space="prob")[0])

    rng = np.random.default_rng(seed)
    offsets, mats, owner, covered = [], [], [], []
    for start in range(-max_dist, max_dist - bin_size + 1, step):
        lo, hi = center + start, center + start + bin_size
        if lo < 0 or hi > len(codes):
            continue
        # skip only windows covering the site's own dinucleotide, which would
        # measure the site rather than its context. Windows merely adjacent to
        # it, such as the polypyrimidine tract, are context and are kept.
        if lo <= center + 2 and center - 2 <= hi:
            continue
        offsets.append(start + bin_size // 2)
        # how much of this window is real sequence. A window sitting in the pad
        # past the end of a short track scrambles nothing and scores exactly
        # zero impact, which reads as "no regulatory content here" when it
        # means "no sequence here"; the caller needs to be able to tell them
        # apart rather than plotting a flat bar.
        covered.append(float(np.count_nonzero(codes[lo:hi])) / max(1, hi - lo))
        for _ in range(n_shuffle):
            mut = codes.copy()
            mut[lo:hi] = dinuc_shuffle(codes[lo:hi], rng)
            mats.append(one_hot(mut))
            owner.append(len(offsets) - 1)

    if not mats:
        return pd.DataFrame(
            columns=["offset", "impact", "sd", "z", "n", "covered", "region"]), ref

    scores = _score_batch(model, mats, which, device, center_out, space=space)
    owner = np.asarray(owner)
    rows = []
    for i, off in enumerate(offsets):
        s = scores[owner == i]
        imp = float(ref - s.mean())
        sd = float(s.std(ddof=1)) if len(s) > 1 else 0.0
        sem = sd / np.sqrt(len(s)) if len(s) else 0.0
        rows.append({"offset": int(off), "impact": imp, "sd": sd,
                     "covered": round(covered[i], 3),
                     # how many standard errors the effect sits from zero; the
                     # scramble-to-scramble spread is large, so an impact
                     # without its z is not interpretable
                     "z": float(imp / sem) if sem > 1e-9 else 0.0,
                     "n": int(len(s))})
    df = pd.DataFrame(rows)
    # for an acceptor the intron lies upstream and the exon downstream; for a
    # donor the reverse. Offsets are already in transcript orientation.
    if which == "acceptor":
        df["region"] = np.where(df.offset < 0, "intron", "exon")
    else:
        df["region"] = np.where(df.offset < 0, "exon", "intron")
    df.attrs["reference_score"] = ref
    df.attrs["reference_prob"] = ref_prob
    df.attrs["space"] = space
    df.attrs["receptive_field"] = rf
    return df, ref


def aggregate_cis_profile(model, context, sites, device, which="acceptor",
                          max_dist=None, bin_size=50, step=50, n_shuffle=4,
                          genome=None, seed=0, min_ref=0.5):
    """Average cis-regulatory landscape across many sites.

    Sites whose reference score is already low are dropped: a window cannot be
    shown to support a site the model does not predict in the first place.
    Impacts are normalised by each site's own reference score, so a strong and
    a weak site contribute comparably.
    """
    import pandas as pd

    g = genome or GenomeReader()
    frames, used, skipped = [], 0, 0
    for i, (chrom, pos, strand) in enumerate(sites):
        df, ref = cis_profile(model, context, chrom, int(pos), strand, which, device,
                              max_dist=max_dist, bin_size=bin_size, step=step,
                              n_shuffle=n_shuffle, genome=g, seed=seed + i,
                              strict=False)
        if df.attrs.get("reference_prob", 0.0) < min_ref or df.empty:
            skipped += 1
            continue
        # normalise by the site's own reference so strong and weak sites are
        # comparable; in log-odds space that is a fractional loss of support
        denom = abs(ref) if abs(ref) > 1e-6 else 1.0
        df = df.assign(rel=df.impact / denom, site=f"{chrom}:{pos}")
        frames.append(df)
        used += 1
    if not frames:
        return pd.DataFrame(), {"n_sites": 0, "n_skipped": skipped}
    allf = pd.concat(frames, ignore_index=True)
    agg = (allf.groupby(["offset", "region"], as_index=False)
               .agg(mean_rel_impact=("rel", "mean"),
                    sem=("rel", lambda s: float(s.std() / max(np.sqrt(len(s)), 1))),
                    n_sites=("rel", "size")))
    return agg, {"n_sites": used, "n_skipped": skipped,
                 "receptive_field": receptive_field(context)}


def profile_to_layer(df, chrom, site, strand, which, ref, name=None):
    """Turn a cis profile into a track layer for the plotting client.

    Impact is signed: positive means the native sequence supports the site,
    negative means it suppresses it. Points are bucketed by base so the layer
    drops into the same client as the other tracks, using the base at each
    window's center.
    """
    from bajasplice.genome import GenomeReader
    g = GenomeReader()
    pts = {b: [] for b in "ATCG"}
    for r in df.itertuples(index=False):
        pos = site + int(r.offset) if strand == "+" else site - int(r.offset)
        b = g.sequence(chrom, pos, pos, strand)
        if b in pts:
            pts[b].append({"x": int(pos), "y": round(float(r.impact), 5)})
    lo = float(df.impact.min()) if len(df) else 0.0
    hi = float(df.impact.max()) if len(df) else 0.0
    return {
        "name": name or f"cis impact, {which}@{site}",
        "type": "AttributionLayer",
        "attribution_type": f"{which}_attribution",
        "attribution_site": int(site), "window": int(df.offset.abs().max()) if len(df) else 0,
        "xmin": int(site - df.offset.abs().max()) if len(df) else int(site),
        "xmax": int(site + df.offset.abs().max()) if len(df) else int(site),
        "ymin": lo, "ymax": hi, "showScore": True,
        "reference_logodds": round(float(ref), 4),
        "n_points": int(sum(len(v) for v in pts.values())),
        "points": pts,
    }


def main():
    import argparse
    import json as _json
    import pandas as pd

    ap = argparse.ArgumentParser(
        description="cis-regulatory impact of sequence around a splice site")
    ap.add_argument("--gene", help="rank this gene's top site instead of giving --site")
    ap.add_argument("--chrom")
    ap.add_argument("--site", type=int)
    ap.add_argument("--strand", default=None, choices=["+", "-"])
    ap.add_argument("--which", default="acceptor", choices=["acceptor", "donor"])
    ap.add_argument("--max-dist", type=int, default=None,
                    help="half-width in nt; capped by the receptive field")
    ap.add_argument("--bin-size", type=int, default=50)
    ap.add_argument("--step", type=int, default=25)
    ap.add_argument("--shuffles", type=int, default=6)
    ap.add_argument("--space", default="logit", choices=["logit", "prob"])
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--out", help="write the full profile as TSV")
    ap.add_argument("--layer", help="write a track layer as JSON")
    a = ap.parse_args()

    from bajasplice.scan import load_splicenet, gene_span
    model, ctx, dev = load_splicenet()
    rf = receptive_field(ctx)

    chrom, site, strand = a.chrom, a.site, a.strand
    if a.gene:
        c, gs, ge, st, _ = gene_span(a.gene)
        chrom = chrom or c
        strand = strand or st
        if site is None:
            from bajasplice.scan import rank_candidates
            site = int(rank_candidates(a.gene, a.which).iloc[0].pos)
            print(f"{a.gene}: using top-ranked {a.which} at {chrom}:{site:,}")
    if site is None or chrom is None:
        raise SystemExit("give --site with --chrom, or --gene")
    strand = strand or "+"

    df, ref = cis_profile(model, ctx, chrom, int(site), strand, a.which, dev,
                          max_dist=a.max_dist, bin_size=a.bin_size, step=a.step,
                          n_shuffle=a.shuffles, space=a.space)
    print(f"{chrom}:{site:,} ({strand}) {a.which}   reference "
          f"{'log-odds' if a.space == 'logit' else 'probability'} {ref:.3f}"
          f"   p={df.attrs['reference_prob']:.4f}")
    print(f"receptive field +/-{rf} nt; profiled +/-{int(df.offset.abs().max())} nt "
          f"in {a.bin_size} nt windows, {a.shuffles} composition-matched scrambles each\n")
    d = df.reindex(df.impact.abs().sort_values(ascending=False).index).head(a.top)
    print(f"{'offset':>7s} {'region':>7s} {'impact':>9s} {'sd':>7s} {'z':>6s}  effect")
    for r in d.itertuples(index=False):
        eff = "supports" if r.impact > 0 else "suppresses"
        mark = "" if abs(r.z) >= 2 else "   (not resolved)"
        print(f"{r.offset:+7d} {r.region:>7s} {r.impact:+9.3f} {r.sd:7.3f} {r.z:+6.1f}  {eff}{mark}")
    by = df.groupby("region").impact.sum()
    print("\nsummed impact by region: " +
          ", ".join(f"{k} {v:+.2f}" for k, v in by.items()))
    for d_ in (100, 200, 300, 500):
        if d_ <= df.offset.abs().max():
            frac = df[df.offset.abs() <= d_].impact.abs().sum() / max(df.impact.abs().sum(), 1e-9)
            print(f"  {100*frac:5.1f}% of total impact lies within +/-{d_} nt")

    if a.out:
        df.to_csv(a.out, sep="\t", index=False)
        print(f"\nwrote {a.out}")
    if a.layer:
        lay = profile_to_layer(df, chrom, int(site), strand, a.which, ref)
        with open(a.layer, "w") as f:
            _json.dump({"schema": "bajasplice.track/1", "gene": a.gene or chrom,
                        "layers": [lay]}, f)
        print(f"wrote {a.layer}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
