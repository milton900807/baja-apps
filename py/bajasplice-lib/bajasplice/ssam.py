"""SSAM -- splice-site acceptor model, scoped to one exon.

Scores every candidate 3' acceptor (every AG dinucleotide) in a window around
one exon and ranks them against that exon's annotated acceptor. The question it
answers is "what else in here does the model think looks like an acceptor, and
how does it compare to the real one".

Three conventions this module is careful about, each because getting it wrong
produces a plausible-looking wrong answer rather than an error:

**Exon numbering is in transcript order, not coordinate order.** On the minus
strand exon 1 has the HIGHEST coordinates. Numbering by `start` would silently
give you the wrong exon for half the genome.

**The acceptor is the last intronic base, in transcript orientation.** On the
plus strand that is `exon_start - 1`; on the minus strand it is `exon_end + 1`.
A candidate AG is reported at the position of its G, matching
`scan.rank_candidates`.

**Offsets are in transcript orientation.** A positive offset is always
downstream -- into the exon -- on either strand.

What the module deliberately does NOT report: anything about reading frame or
coding consequence. The score is a splicing-likelihood score; it carries no
information about what a shifted acceptor would do to a transcript's frame, and
putting the two in one table invites reading a consequence off a number that
cannot support it.
"""
from __future__ import annotations

import argparse
import json
import math

import numpy as np

__all__ = ["exon_table", "exon_bounds", "annotated_acceptor", "scan_exon",
           "ssam_payload", "render_png", "CAVEATS"]

# The validation run behind these numbers only exercised strong sites: every
# annotated acceptor tested scored above 0.96. Nothing establishes what the
# gap between 0.014 and 0.0004 means, which is why the UI leads with rank.
CALIBRATED_ABOVE = 0.96

CAVEATS = {
    "rank_not_probability": (
        "Rank is meaningful; the absolute probability of a weak site is not. "
        f"Validation only exercised sites above {CALIBRATED_ABOVE}, so "
        "differences among low-scoring candidates are not calibrated."),
    "reference_sequence": (
        "Scored on reference sequence. No variant has been applied, so a "
        "patient allele is not reflected in these numbers."),
    "transcript_scope": (
        "Candidates are labelled against ONE transcript. A position marked "
        "exonic or intronic here may be an annotated acceptor in another "
        "isoform of the same gene."),
    "no_frame": (
        "Scores describe splice-acceptor likelihood only. They say nothing "
        "about reading frame or coding consequence."),
    "minor_spliceosome": (
        "This exon's annotated splice sites are not the usual GT-AG. That is "
        "the signature of a U12-type (minor spliceosome) intron, which makes "
        "up well under 1% of human introns and is correspondingly rare in "
        "training. A low score here is the model out of its depth, not "
        "evidence the site is weak -- and the AG candidates ranked against it "
        "are being judged by a U2 standard it does not share."),
}


def _logit(p):
    p = min(max(float(p), 1e-12), 1 - 1e-12)
    return math.log(p / (1 - p))


# ---------------------------------------------------------------- structure
def _n_transcripts(gene):
    """Annotated transcript count from the gene index, or None if unknown."""
    try:
        from bajasplice.index import GeneIndex
        rec = GeneIndex().gene(gene)
        if rec and rec.get("n_tx"):
            return int(rec["n_tx"])
    except Exception:
        pass
    return None


def exon_table(gene, transcript="canonical"):
    """Exons in TRANSCRIPT order, numbered from 1.

    Returns (rows, info) where each row is
    {number, start, end, length} with start <= end genomically, and info
    carries chrom / strand / transcript_id / n_transcripts.
    """
    from bajasplice.scan import gene_span
    chrom, gs, ge, strand, gex = gene_span(gene, transcript=None
                                           if transcript == "canonical" else transcript)
    tid = None
    # how many transcripts the gene really has. The slim index serves only the
    # canonical one, so counting the rows we got back would always say 1 and
    # quietly hide the scope caveat that matters most here.
    n_tx = _n_transcripts(gene)
    if "transcript_id" in gex.columns:
        if transcript not in ("canonical", "all"):
            gex = gex[gex.transcript_id == transcript]
            if gex.empty:
                raise SystemExit(f"{gene} has no exons for transcript {transcript}")
            tid = transcript
        else:
            if n_tx is None:
                n_tx = int(gex.transcript_id.nunique())
            if transcript == "canonical":
                sub = gex.assign(_len=gex.end - gex.start + 1)
                agg = (sub.groupby("transcript_id")
                          .agg(mane=("mane", "max") if "mane" in sub.columns
                               else ("_len", "size"),
                               exonic=("_len", "sum"))
                          .sort_values(["mane", "exonic"], ascending=False))
                tid = agg.index[0]
                gex = gex[gex.transcript_id == tid]

    seen, blocks = set(), []
    for r in gex.sort_values("start").itertuples(index=False):
        k = (int(r.start), int(r.end))
        if k not in seen:
            seen.add(k)
            blocks.append(k)
    if strand == "-":
        blocks = blocks[::-1]           # transcript order: exon 1 is rightmost
    rows = [{"number": i + 1, "start": s, "end": e, "length": e - s + 1}
            for i, (s, e) in enumerate(blocks)]
    return rows, {"gene": gene, "chrom": chrom, "strand": strand,
                  "transcript_id": tid, "n_transcripts": n_tx,
                  "gene_start": gs, "gene_end": ge, "n_exons": len(rows)}


def exon_bounds(rows, number):
    for r in rows:
        if r["number"] == int(number):
            return r
    raise SystemExit(f"exon {number} not found (transcript has {len(rows)} exons)")


def annotated_acceptor(exon, strand):
    """Last intronic base of the intron upstream of `exon`, transcript-oriented."""
    return exon["start"] - 1 if strand == "+" else exon["end"] + 1


def annotated_donor(exon, strand):
    return exon["end"] + 1 if strand == "+" else exon["start"] - 1


def _region_label(pos, rows, strand):
    for r in rows:
        if r["start"] <= pos <= r["end"]:
            return f"exon {r['number']}"
    order = sorted(rows, key=lambda r: r["start"])
    for a, b in zip(order, order[1:]):
        if a["end"] < pos < b["start"]:
            # the intron is named for the exon it follows in TRANSCRIPT order
            n = a["number"] if strand == "+" else b["number"]
            return f"intron {n}"
    return "outside transcript"


# ---------------------------------------------------------------- scoring
def scan_exon(gene, exon_number, flank=300, transcript="canonical",
              ckpt=None, device=None, genome=None, min_score=0.0,
              prefer_remote=False):
    """Rank every candidate acceptor in a window around one exon.

    `flank` extends the window that far upstream of the annotated acceptor and
    that far downstream of the exon's donor, in transcript orientation.
    """
    from bajasplice.scan import load_splicenet, scan_region
    from bajasplice.remote import open_genome
    from bajasplice.config import split_of

    rows, info = exon_table(gene, transcript=transcript)
    ex = exon_bounds(rows, exon_number)
    strand = info["strand"]
    chrom = info["chrom"]
    acc = annotated_acceptor(ex, strand)
    don = annotated_donor(ex, strand)

    lo = min(acc, don) - flank
    hi = max(acc, don) + flank

    if genome is None:
        genome, src = open_genome(prefer_remote=prefer_remote)
    else:
        src = {"source": "caller-supplied", "class": type(genome).__name__}

    model, context, device = load_splicenet(ckpt, device)
    a_track, d_track = scan_region(model, context, chrom, lo, hi, strand,
                                   device, genome=genome)
    codes = genome.codes(chrom, lo, hi, "+")       # plus-strand for AG finding

    # candidate dinucleotides, exactly as scan.rank_candidates finds them:
    # on + strand an acceptor AG ends at the site; on - strand the plus-strand
    # text is CT and the site is the C.
    if strand == "+":
        idx = np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 3)) + 1
    else:
        idx = np.flatnonzero((codes[:-1] == 2) & (codes[1:] == 4))

    acc_score = float(a_track[acc - lo]) if lo <= acc <= hi else float("nan")
    ref_logit = _logit(acc_score)

    # A non-GT-AG exon is a U12-type intron, not a bad prediction. Caught here
    # because the alternative is reporting a score of 0.2 for a real, used
    # acceptor with nothing to say it came from a class the model barely saw.
    acc_dinuc = _dinuc(genome, chrom, acc, strand, "acceptor")
    don_dinuc = _dinuc(genome, chrom, don, strand, "donor")
    minor = not (acc_dinuc == "AG" and don_dinuc == "GT")

    cands = []
    for i in idx:
        pos = lo + int(i)
        s = float(a_track[pos - lo])
        if s < min_score and pos != acc:
            continue
        offset = (pos - acc) if strand == "+" else (acc - pos)
        cands.append({
            "pos": pos,
            "score": round(s, 9),
            "logit": round(_logit(s), 4),
            "region": _region_label(pos, rows, strand),
            "offset": int(offset),
            "is_annotated_acceptor": pos == acc,
            "in_target_exon": ex["start"] <= pos <= ex["end"],
            "rel_to_annotated": round(s / acc_score, 9) if acc_score > 0 else None,
            "delta_logit": round(_logit(s) - ref_logit, 4),
        })
    cands.sort(key=lambda c: -c["score"])
    for n, c in enumerate(cands, 1):
        c["rank"] = n

    return {
        "schema": "bajasplice.ssam/1",
        "gene": gene,
        "chrom": chrom,
        "strand": strand,
        "transcript_id": info["transcript_id"],
        "n_transcripts": info["n_transcripts"],
        "n_exons": info["n_exons"],
        "exon": {**ex, "n_of": info["n_exons"]},
        "window": {"start": int(lo), "end": int(hi), "flank": int(flank),
                   "length": int(hi - lo + 1)},
        "annotated": {
            "acceptor": {"pos": int(acc), "score": round(acc_score, 9),
                         "logit": round(ref_logit, 4), "dinuc": acc_dinuc,
                         "canonical_dinuc": acc_dinuc == "AG"},
            "donor": {"pos": int(don),
                      "score": round(float(d_track[don - lo]), 9)
                      if lo <= don <= hi else None,
                      "dinuc": don_dinuc, "canonical_dinuc": don_dinuc == "GT"},
            "intron_class": "U12-type (non-GT-AG)" if minor else "U2-type (GT-AG)",
        },
        "candidates": cands,
        "meta": {
            "model": str(__import__("bajasplice.scan", fromlist=["x"])
                         .resolve_checkpoint(ckpt)),
            "context": int(context),
            "n_candidates": len(cands),
            # carried in meta as well as at the top level, because the payload is
            # what the client gets and the transcript-scope caveat is unreadable
            # without the count it refers to
            "n_transcripts": info["n_transcripts"],
            "n_exons": info["n_exons"],
            "min_score": min_score,
            "sequence": src,
            "chrom_split": split_of(chrom),
            "calibrated_above": CALIBRATED_ABOVE,
            "transcript_mode": transcript,
            "minor_spliceosome": bool(minor),
            # the U12 caveat is only included when it applies, so its presence
            # in a payload is itself the signal
            "caveats": {k: v for k, v in CAVEATS.items()
                        if k != "minor_spliceosome" or minor},
        },
    }


def _dinuc(genome, chrom, pos, strand, which):
    """The two-base signal at a site, in transcript orientation."""
    if which == "acceptor":
        a, b = (pos - 1, pos) if strand == "+" else (pos, pos + 1)
    else:
        a, b = (pos, pos + 1) if strand == "+" else (pos - 1, pos)
    return genome.sequence(chrom, a, b, strand)


# ---------------------------------------------------------------- payload
def ssam_payload(result, include_track=True, track_min_score=1e-3):
    """Shape a scan_exon result for a client track.

    Emits layers the existing client already knows how to draw: a FeatureLayer
    whose features are the candidate AG dinucleotides, and an AttributionLayer
    carrying the per-position acceptor track across the window. The rich
    per-candidate fields ride along on each feature, so a client can show them
    on hover without a second request.
    """
    from bajasplice.tracks import gene_track

    acc = result["annotated"]["acceptor"]
    feats = []
    for c in result["candidates"]:
        lo = c["pos"] - 1 if result["strand"] == "+" else c["pos"]
        feats.append({
            "xi": int(lo), "xf": int(lo + 1),
            "y": float(c["score"]),
            "label": ("annotated acceptor" if c["is_annotated_acceptor"]
                      else f'{c["offset"]:+d} nt'),
            "rank": c["rank"], "score": c["score"], "logit": c["logit"],
            "region": c["region"], "offset": c["offset"],
            "rel_to_annotated": c["rel_to_annotated"],
            "delta_logit": c["delta_logit"],
            "is_annotated_acceptor": c["is_annotated_acceptor"],
            "in_target_exon": c["in_target_exon"],
            "tier": _tier(c, acc["score"]),
        })

    ex = result["exon"]
    layers = [{
        "name": f'{result["gene"]} exon {ex["number"]} acceptor candidates',
        "type": "FeatureLayer",
        "attribution_type": "acceptor_candidate",
        "attribution_site": int(acc["pos"]), "window": None,
        "xmin": int(result["window"]["start"]), "xmax": int(result["window"]["end"]),
        "ymin": 0.0, "ymax": 1.0, "showScore": True,
        "n_features": len(feats),
        "features": feats,
    }]

    track = None
    if include_track:
        try:
            track, _ = gene_track(result["gene"],
                                  transcript=result["meta"]["transcript_mode"])
        except Exception:
            track = None
    if track is None:
        track = {"name": result["gene"], "chrom": result["chrom"],
                 "strand": result["strand"],
                 "transcript_id": result["transcript_id"],
                 "xmin": int(result["window"]["start"]),
                 "xmax": int(result["window"]["end"]),
                 "exons": [{"xi": int(ex["start"]), "xf": int(ex["end"])}],
                 "introns": []}

    return {
        "schema": "bajasplice.ssam/1",
        "tool": "ssam",
        "gene": result["gene"],
        "exon": ex,
        "window": result["window"],
        "annotated": result["annotated"],
        "track": track,
        "layers": layers,
        "focus": {"xmin": int(result["window"]["start"]),
                  "xmax": int(result["window"]["end"])},
        "candidates": result["candidates"],
        "meta": result["meta"],
    }


def _tier(c, ref_score):
    """A coarse band, so a client can style without inventing thresholds.

    Deliberately coarse: the gap between 'weak' and 'trace' is not calibrated
    (see CAVEATS), and a finer scale would imply a resolution the model has not
    been shown to have.
    """
    if c["is_annotated_acceptor"]:
        return "annotated"
    s = c["score"]
    if s >= CALIBRATED_ABOVE:
        return "strong"
    if s >= 0.05:
        return "moderate"
    if s >= 1e-3:
        return "weak"
    return "trace"


# ---------------------------------------------------------------- rendering
def render_png(payload, out, dpi=140, top=12):
    """Static view: exon structure, candidate stems on a log axis, a table."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    ex = payload["exon"]
    w = payload["window"]
    acc = payload["annotated"]["acceptor"]
    cands = payload["candidates"]
    strand = payload["track"]["strand"]
    colors = {"annotated": "#C2185B", "strong": "#C2185B", "moderate": "#F57C00",
              "weak": "#1976D2", "trace": "#90A4AE"}

    fig, (ax0, ax1) = plt.subplots(
        2, 1, figsize=(13, 5.6), gridspec_kw={"height_ratios": [0.5, 2.4]})

    # exon structure across the window
    ax0.plot([w["start"], w["end"]], [0.5, 0.5], color="#555", lw=1.0, zorder=0)
    for e in payload["track"].get("exons", []):
        if e["xf"] < w["start"] or e["xi"] > w["end"]:
            continue
        hit = e["xi"] == ex["start"] and e["xf"] == ex["end"]
        ax0.add_patch(plt.Rectangle((e["xi"], 0.2), max(e["xf"] - e["xi"], 1), 0.6,
                                    color="#C2185B" if hit else "#555"))
    ax0.axvline(acc["pos"], color="#C2185B", lw=1.0, ls="--", alpha=0.8)
    ax0.set_xlim(w["start"], w["end"]); ax0.set_ylim(0, 1); ax0.set_yticks([])
    ax0.set_title(
        f'{payload["gene"]} exon {ex["number"]}/{ex["n_of"]}  '
        f'{payload["track"]["chrom"]}:{ex["start"]:,}-{ex["end"]:,} ({strand})  '
        f'{ex["length"]} nt   |   annotated acceptor {acc["pos"]:,} '
        f'[{acc["dinuc"]}] p={acc["score"]:.4f}',
        fontsize=9.5, loc="left")

    # candidates, log y: the interesting range spans five orders of magnitude
    floor = 1e-7
    for c in cands:
        y = max(c["score"], floor)
        t = _tier(c, acc["score"])
        ax1.vlines(c["pos"], floor, y, color=colors[t],
                   lw=2.0 if t in ("annotated", "strong") else 1.0)
    # label only what can be labelled legibly: two stems a few nt apart overprint
    # each other, and an unreadable label is worse than none
    span = max(1, w["end"] - w["start"])
    placed = []
    for c in cands[:top]:
        if any(abs(c["pos"] - p) < span * 0.045 for p in placed):
            continue
        placed.append(c["pos"])
        # "%.3g" renders 0.9998 as "1", which is the one value where the exact
        # figure is the point
        s = f'{c["score"]:.4f}' if c["score"] > 0.99 else f'{c["score"]:.3g}'
        ax1.annotate(f'#{c["rank"]} {s}\n{c["offset"]:+d}',
                     xy=(c["pos"], max(c["score"], floor)), xytext=(0, 4),
                     textcoords="offset points", ha="center", fontsize=6.5,
                     color=colors[_tier(c, acc["score"])])
    ax1.axhline(CALIBRATED_ABOVE, color="#888", lw=0.7, ls=":")
    ax1.annotate(f"calibrated above {CALIBRATED_ABOVE}", xy=(w["start"], CALIBRATED_ABOVE),
                 xytext=(3, 3), textcoords="offset points", fontsize=6.5, color="#888")
    ax1.axvspan(ex["start"], ex["end"], color="#C2185B", alpha=0.06, zorder=0)
    # headroom above 1.0 so the label on a near-certain site is not clipped by
    # the axis it sits against
    ax1.set_yscale("log"); ax1.set_ylim(floor, 30.0)
    ax1.set_yticks([10.0 ** e for e in range(-7, 1)])
    ax1.set_xlim(w["start"], w["end"])
    ax1.set_ylabel("acceptor probability"); ax1.set_xlabel("genomic position")
    ax1.set_title(f'{len(cands)} candidate AG sites   '
                  f'(shaded = exon {ex["number"]} body; rank is meaningful, '
                  f'absolute value below the dotted line is not)',
                  fontsize=8, loc="left")
    fig.tight_layout()
    fig.savefig(out, dpi=dpi)
    plt.close(fig)
    return out


# ---------------------------------------------------------------- cli
def _print_table(result, top=15):
    acc = result["annotated"]["acceptor"]
    don = result["annotated"]["donor"]
    ex = result["exon"]
    m = result["meta"]
    print(f'{result["gene"]}  {result["chrom"]}  {result["strand"]}  '
          f'transcript {result["transcript_id"]}'
          + (f'  of {result["n_transcripts"]} annotated' if result["n_transcripts"] else ""))
    print(f'exon {ex["number"]}/{ex["n_of"]}  {ex["start"]:,}-{ex["end"]:,}  '
          f'{ex["length"]} nt')
    print(f'window {result["window"]["start"]:,}-{result["window"]["end"]:,} '
          f'(flank {result["window"]["flank"]})')
    print(f'annotated acceptor {acc["pos"]:,} [{acc["dinuc"]}] '
          f'p={acc["score"]:.6f}  logit {acc["logit"]:+.3f}')
    if don["score"] is not None:
        print(f'annotated donor    {don["pos"]:,} [{don["dinuc"]}] p={don["score"]:.6f}')
    if m.get("minor_spliceosome"):
        print(f'\n!! {result["annotated"]["intron_class"]} intron -- '
              f'read the last caveat before the scores below')
    print(f'sequence: {m["sequence"].get("source")} '
          f'{m["sequence"].get("assembly", "")}   chromosome split: {m["chrom_split"]}')
    print(f'\n{len(result["candidates"])} candidate AG sites, top {top} by score')
    print(f'  {"rank":>4s} {"position":>12s} {"score":>11s} {"rel":>9s} '
          f'{"dlogit":>8s} {"offset":>7s}  region')
    for c in result["candidates"][:top]:
        mark = " <-- annotated" if c["is_annotated_acceptor"] else ""
        rel = f'{c["rel_to_annotated"]:.3g}' if c["rel_to_annotated"] is not None else "-"
        print(f'  {c["rank"]:>4d} {c["pos"]:>12,d} {c["score"]:>11.3e} {rel:>9s} '
              f'{c["delta_logit"]:>+8.2f} {c["offset"]:>+7d}  {c["region"]}{mark}')
    inex = [c for c in result["candidates"] if c["in_target_exon"]]
    if inex:
        print(f'\n{len(inex)} inside the exon {ex["number"]} body:')
        for c in inex:
            print(f'  {c["pos"]:,}  p={c["score"]:.3e}  rank {c["rank"]}  '
                  f'{c["offset"]:+d} nt from the annotated acceptor')
    print("\nreading these numbers")
    for k, v in result["meta"]["caveats"].items():
        print(f'  - {v}')


def main():
    ap = argparse.ArgumentParser(
        prog="bajasplice ssam",
        description="score candidate 3' acceptor sites around one exon")
    ap.add_argument("--gene", required=True)
    ap.add_argument("--exon", required=True, type=int,
                    help="exon number in TRANSCRIPT order (exon 1 is first transcribed)")
    ap.add_argument("--flank", type=int, default=300,
                    help="window beyond the exon's own acceptor and donor (default 300)")
    ap.add_argument("--transcript", default="canonical",
                    help="'canonical' (MANE where available) or a transcript id")
    ap.add_argument("--min-score", type=float, default=0.0,
                    help="drop candidates below this (the annotated site is always kept)")
    ap.add_argument("--top", type=int, default=15, help="rows to print")
    ap.add_argument("--remote-sequence", action="store_true",
                    help="fetch reference sequence from Ensembl even if a FASTA is configured")
    ap.add_argument("--ckpt")
    ap.add_argument("--json", help="write the full payload here")
    ap.add_argument("--png", help="render a static figure here")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    result = scan_exon(a.gene, a.exon, flank=a.flank, transcript=a.transcript,
                       ckpt=a.ckpt, min_score=a.min_score,
                       prefer_remote=a.remote_sequence)
    if not a.quiet:
        _print_table(result, top=a.top)

    payload = ssam_payload(result)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(payload, f)
        print(f'\nwrote {a.json}')
    if a.png:
        render_png(payload, a.png)
        print(f'wrote {a.png}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
