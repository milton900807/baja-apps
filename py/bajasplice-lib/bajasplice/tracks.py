"""Build plot payloads for a gene, shaped for a client TrackLayer.

The payload matches what an AttributionLayer-style client consumes directly:

  track.exons          objects with `xi` / `xf`, the names the client's
                       metaAnalysis() expects from track.getExons()
  layer.points         split into A / T / C / G by the REFERENCE base at each
                       genomic position, which is how the client colours them
                       (its addAttributionPoint(x, y, base) does the same split)
  layer.attribution_site / .window
                       set for attribution layers, null for whole-gene score
                       tracks, exactly as the client's constructor expects

Three kinds of layer are produced:

  score        per-position acceptor or donor probability across the transcript
  attribution  per-base support for one chosen site, from in-silico mutagenesis
               or gradient x input
  feature      sparse intervals with a written description each -- currently
               BajaIR retained introns. A feature layer carries `features`
               instead of `points`, and is omitted entirely when nothing clears
               its threshold, so a gene with no retention-prone introns draws
               nothing rather than an empty axis.
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np

from bajasplice.config import paths
from bajasplice.genome import GenomeReader

__all__ = ["gene_track", "score_layers", "attribution_layers", "retention_layer",
           "build_payload", "render_png"]

BASES = ("A", "T", "C", "G")


def _bucket(positions, values, refs=None, genome=None, chrom=None, decimals=5):
    """Split (x, y) into per-base buckets keyed by the reference base at x."""
    out = {b: [] for b in BASES}
    if refs is None:
        g = genome or GenomeReader()
        lo, hi = int(positions[0]), int(positions[-1])
        codes = g.codes(chrom, lo, hi, "+")
        refs = ["NACGT"[int(codes[p - lo])] for p in positions]
    for x, y, b in zip(positions, values, refs):
        if b in out:
            out[b].append({"x": int(x), "y": round(float(y), decimals)})
    return out


def gene_track(gene, exons=None, transcript="canonical"):
    """Transcript structure for the client's track, plus the gene's span.

    transcript="canonical" draws one transcript (MANE Select where annotated,
    otherwise the one with the most exonic sequence), which is what you want
    for a transcript plot. "all" unions every annotated exon, which for a
    well-annotated gene is dozens of overlapping blocks and reads as a smear.
    A transcript id draws exactly that transcript.
    """
    from bajasplice.scan import gene_span
    chrom, gs, ge, strand, gex = gene_span(gene, exons)

    tid = None
    if transcript and transcript != "all" and "transcript_id" in gex.columns:
        if transcript != "canonical":
            tid = transcript
        else:
            sub = gex.assign(_len=gex.end - gex.start + 1)
            agg = (sub.groupby("transcript_id")
                      .agg(mane=("mane", "max") if "mane" in sub.columns else ("_len", "size"),
                           exonic=("_len", "sum"))
                      .sort_values(["mane", "exonic"], ascending=False))
            tid = agg.index[0]
        if (gex.transcript_id == tid).any():
            gex = gex[gex.transcript_id == tid]

    seen, ex = set(), []
    for r in gex.sort_values("start").itertuples(index=False):
        k = (int(r.start), int(r.end))
        if k in seen:
            continue
        seen.add(k)
        ex.append({"xi": int(r.start), "xf": int(r.end)})
    introns = []
    for a, b in zip(ex, ex[1:]):
        if b["xi"] > a["xf"] + 1:
            introns.append({"xi": a["xf"] + 1, "xf": b["xi"] - 1})
    return {
        "name": gene, "chrom": chrom, "strand": strand,
        "transcript_id": tid, "transcript_mode": transcript,
        "xmin": gs, "xmax": ge, "exons": ex, "introns": introns,
    }, (chrom, gs, ge, strand)


def score_layers(gene, ckpt=None, device=None, min_score=1e-3,
                 kinds=("acceptor", "donor"), transcript="canonical"):
    """Whole-transcript score tracks. attribution_site is null for these."""
    from bajasplice.scan import load_splicenet, scan_region
    model, context, device = load_splicenet(ckpt, device)
    track, (chrom, gs, ge, strand) = gene_track(gene, transcript=transcript)
    g = GenomeReader()
    acc, don = scan_region(model, context, chrom, gs, ge, strand, device, genome=g)
    codes = g.codes(chrom, gs, ge, "+")
    refs_all = np.array(list("NACGT"))[codes.astype(int)]

    layers = []
    for kind, arr in (("acceptor", acc), ("donor", don)):
        if kind not in kinds:
            continue
        keep = np.flatnonzero(arr >= min_score)
        pos = gs + keep
        pts = _bucket(pos, arr[keep], refs=refs_all[keep])
        layers.append({
            "name": f"{gene} {kind}", "type": "AttributionLayer",
            "attribution_type": f"{kind}_score",
            "attribution_site": None, "window": None,
            "xmin": int(gs), "xmax": int(ge), "ymin": 0.0, "ymax": 1.0,
            "showScore": False,
            "n_points": int(keep.size), "min_score": min_score,
            "points": pts,
        })
    return layers, track


def attribution_layers(gene, sites, which="acceptor", window=100, method="ism",
                       ckpt=None, device=None, transcript="canonical"):
    """One attribution layer per requested site."""
    from bajasplice.scan import load_splicenet
    from bajasplice.attribution import ism_attribution, gradient_attribution
    model, context, device = load_splicenet(ckpt, device)
    track, (chrom, gs, ge, strand) = gene_track(gene, transcript=transcript)
    g = GenomeReader()
    fn = ism_attribution if method == "ism" else gradient_attribution
    layers = []
    for site in sites:
        pos, attr, refs, ref_score = fn(model, context, chrom, int(site), strand,
                                        which, window, device, genome=g)
        if len(pos) == 0:
            continue
        span = float(np.max(np.abs(attr))) or 1.0
        layers.append({
            "name": f"{gene} {which}@{int(site)} ({method})",
            "type": "AttributionLayer",
            "attribution_type": f"{which}_attribution",
            "attribution_site": int(site), "window": int(window),
            "xmin": int(pos[0]), "xmax": int(pos[-1]),
            "ymin": float(np.min(attr)), "ymax": float(np.max(attr)),
            "showScore": True,
            "site_score": round(ref_score, 6), "method": method,
            "abs_max": round(span, 6),
            "n_points": int(len(pos)),
            "points": _bucket(pos, attr, refs=refs),
        })
    return layers, track


def retention_layer(gene, tier="notable", transcript="canonical", clean_only=True,
                    limit=0, ckpt=None, device=None):
    """BajaIR retained introns as a sparse feature layer, or None if there are none.

    Returning None rather than an empty layer is the point of this track: most
    introns in most genes are not retention-prone, and a layer that draws
    something for all of them is intron structure redrawn in a second colour.
    The caller records that the model ran in payload meta, so "nothing shown"
    stays distinguishable from "never ran".
    """
    from bajasplice.bajair import score_gene
    track, (chrom, gs, ge, strand) = gene_track(gene, transcript=transcript)
    hits = score_gene(gene, tier=tier, clean_only=clean_only, limit=limit,
                      ckpt=ckpt, device=device)
    if not hits:
        return None, track, 0
    from bajair.model import load_model
    scorer = load_model()
    feats = []
    for h in hits:
        feats.append({
            "xi": int(h["start"]), "xf": int(h["end"]),
            "y": float(h["score"]), "tier": h["tier"],
            "label": f"intron {h['intron_number']}/{h['n_introns']}",
            "headline": h["headline"], "evidence": h["evidence"],
            "expect": h["expect"], "caveat": h["caveat"], "text": h["text"],
            "length": h["length"], "gc": h["gc"],
            "ss_donor": h["ss_donor"], "ss_acceptor": h["ss_acceptor"],
            "transcript": h["transcript"],
        })
    layer = {
        "name": f"{gene} retained introns",
        "type": "FeatureLayer",
        "attribution_type": "intron_retention",
        "attribution_site": None, "window": None,
        "xmin": int(gs), "xmax": int(ge), "ymin": 0.0, "ymax": 1.0,
        "showScore": True,
        "tier": tier, "threshold": scorer.threshold(tier),
        "clean_only": bool(clean_only),
        "n_features": len(feats),
        "features": feats,
    }
    return layer, track, len(feats)


def build_payload(gene, sites=(), which="acceptor", window=100, method="ism",
                  min_score=1e-3, ckpt=None, device=None, scores=True,
                  transcript="canonical", retention=False, tier="notable",
                  clean_only=True):
    layers, track = ([], None)
    bajair_meta = None
    if scores:
        layers, track = score_layers(gene, ckpt=ckpt, device=device,
                                     min_score=min_score, transcript=transcript)
    if sites:
        al, track2 = attribution_layers(gene, sites, which=which, window=window,
                                        method=method, ckpt=ckpt, device=device,
                                        transcript=transcript)
        layers = layers + al
        track = track or track2
    if retention:
        rl, track3, n_hits = retention_layer(gene, tier=tier, transcript=transcript,
                                             clean_only=clean_only, ckpt=ckpt,
                                             device=device)
        track = track or track3
        if rl is not None:
            layers = layers + [rl]
        # recorded whether or not anything was drawn, so a silent track is
        # distinguishable from a model that never ran
        bajair_meta = {"ran": True, "tier": tier, "clean_only": bool(clean_only),
                       "n_hits": n_hits}
    if track is None:
        track, _ = gene_track(gene, transcript=transcript)
    return {
        "schema": "bajasplice.track/1",
        "gene": gene,
        "track": track,
        "layers": layers,
        "meta": {"model": str(__import__("bajasplice.scan", fromlist=["x"]).resolve_checkpoint(ckpt)),
                 "n_layers": len(layers),
                 **({"bajair": bajair_meta} if bajair_meta else {})},
    }


def render_png(payload, out, dpi=140):
    """Optional static rendering, for a quick look without the client."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    colors = {"A": "#2ca02c", "T": "#d62728", "C": "#1f77b4", "G": "#ff7f0e"}
    tr = payload["track"]
    layers = payload["layers"]
    fig, axes = plt.subplots(len(layers) + 1, 1, figsize=(13, 2.0 * len(layers) + 1.4),
                             sharex=False, gridspec_kw={"height_ratios": [0.5] + [1] * len(layers)})
    axes = np.atleast_1d(axes)
    ax0 = axes[0]
    for e in tr["exons"]:
        ax0.add_patch(plt.Rectangle((e["xi"], 0.25), max(e["xf"] - e["xi"], 1), 0.5,
                                    color="#444"))
    ax0.plot([tr["xmin"], tr["xmax"]], [0.5, 0.5], color="#444", lw=0.8, zorder=0)
    ax0.set_xlim(tr["xmin"], tr["xmax"]); ax0.set_ylim(0, 1)
    ax0.set_yticks([]); ax0.set_title(f"{tr['name']}  {tr['chrom']}:{tr['xmin']:,}-{tr['xmax']:,} ({tr['strand']})",
                                      fontsize=10, loc="left")
    for ax, L in zip(axes[1:], layers):
        if L.get("type") == "FeatureLayer":
            for f in L["features"]:
                w = max(f["xf"] - f["xi"], 1)
                ax.add_patch(plt.Rectangle((f["xi"], 0), w, f["y"],
                                           color="#0B6E5F", alpha=0.75))
                ax.annotate(f'{f["label"]}  {f["y"]:.2f}',
                            xy=(f["xi"] + w / 2, f["y"]), xytext=(0, 3),
                            textcoords="offset points", ha="center",
                            fontsize=6.5, color="#0B6E5F")
            ax.set_xlim(L["xmin"], L["xmax"])
            ax.set_ylim(0, max(1e-3, max(f["y"] for f in L["features"]) * 1.35))
            ax.set_ylabel("retention\npropensity", fontsize=7)
            ax.set_title(f'{L["name"]}  ({L["n_features"]} at tier '
                         f'"{L["tier"]}", threshold {L["threshold"]:.2f})',
                         fontsize=8, loc="left")
            continue
        for b in BASES:
            pts = L["points"][b]
            if not pts:
                continue
            ax.vlines([p["x"] for p in pts], 0, [p["y"] for p in pts],
                      color=colors[b], lw=0.8, label=b)
        if L["attribution_site"] is not None:
            ax.axvline(L["attribution_site"], color="red", lw=1.0, alpha=0.6)
        ax.set_xlim(L["xmin"], L["xmax"])
        ax.set_ylabel(L["attribution_type"].replace("_", "\n"), fontsize=7)
        ax.set_title(L["name"], fontsize=8, loc="left")
        ax.legend(fontsize=6, ncol=4, loc="upper right", frameon=False)
    axes[-1].set_xlabel("genomic position")
    fig.tight_layout()
    fig.savefig(out, dpi=dpi)
    plt.close(fig)
    return out


def main():
    ap = argparse.ArgumentParser(description="build a gene plot payload for a client track")
    ap.add_argument("--gene", required=True)
    ap.add_argument("--site", type=int, action="append", default=[],
                    help="genomic position to attribute; repeatable")
    ap.add_argument("--top-sites", type=int, default=0,
                    help="instead of --site, attribute the N top-scoring predicted sites")
    ap.add_argument("--which", choices=["acceptor", "donor"], default="acceptor")
    ap.add_argument("--window", type=int, default=100)
    ap.add_argument("--method", choices=["ism", "gradient"], default="ism")
    ap.add_argument("--min-score", type=float, default=1e-3,
                    help="drop score-track points below this; keeps payloads small")
    ap.add_argument("--no-scores", action="store_true", help="attribution layers only")
    ap.add_argument("--retention", action="store_true",
                    help="add a BajaIR retained-intron layer; it is omitted "
                         "entirely when no intron clears the tier")
    ap.add_argument("--tier", default="notable",
                    choices=["elevated", "notable", "strong", "exceptional"],
                    help="how strong a hit must be to be reported (default notable, "
                         "~6x background)")
    ap.add_argument("--all-introns", action="store_true",
                    help="do not restrict to MANE introns with strong splice sites; "
                         "expect minor-transcript artifacts at the top")
    ap.add_argument("--transcript", default="canonical",
                    help="'canonical' (MANE where available), 'all', or a transcript id")
    ap.add_argument("--ckpt")
    ap.add_argument("--out", help="write JSON here (default stdout)")
    ap.add_argument("--png", help="also render a static PNG here")
    a = ap.parse_args()

    sites = list(a.site)
    if a.top_sites:
        from bajasplice.scan import rank_candidates
        df = rank_candidates(a.gene, a.which, ckpt=a.ckpt)
        sites += df.head(a.top_sites).pos.astype(int).tolist()

    payload = build_payload(a.gene, sites=sites, which=a.which, window=a.window,
                            method=a.method, min_score=a.min_score, ckpt=a.ckpt,
                            scores=not a.no_scores, transcript=a.transcript,
                            retention=a.retention, tier=a.tier,
                            clean_only=not a.all_introns)
    js = json.dumps(payload)
    if a.out:
        with open(a.out, "w") as f:
            f.write(js)
        n = sum(L.get("n_points", 0) for L in payload["layers"])
        print(f"wrote {a.out}  ({len(payload['layers'])} layers, {n:,} points, "
              f"{len(js)/1e6:.2f} MB)")
    else:
        print(js)
    if a.retention:
        b = payload["meta"].get("bajair", {})
        if b.get("n_hits"):
            for f in next(L for L in payload["layers"]
                          if L["type"] == "FeatureLayer")["features"]:
                print(f'  [{f["tier"]}] {f["label"]}  {f["xi"]}-{f["xf"]}  '
                      f'score {f["y"]:.3f}\n     {f["text"]}')
        else:
            print(f'  no introns reached tier "{b.get("tier")}" -- nothing to show')
    if a.png:
        render_png(payload, a.png)
        print(f"wrote {a.png}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
