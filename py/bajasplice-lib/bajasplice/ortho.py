"""Cross-species comparison for SSAM: score the orthologous exon too.

The point is a consistency check, not a precision improvement. If an exon's
annotated acceptor is rank 1 in mouse and dog as well as human, that is
evidence the human call is reading conserved signal. If a weak human candidate
does NOT recur in any ortholog, that is evidence it is a coincidental AG in
human sequence rather than a site under selection -- which is exactly the
regime SSAM's own scores are uncalibrated in (everything below 0.96).

Two things this module is deliberately careful about.

**Exon correspondence is established by sequence, not by number.** Exon 16 of a
human transcript is not exon 16 of a mouse transcript -- transcripts differ in
exon count, and a gene with an extra 5' exon in one species would shift every
number after it. Matching by rank would be silently wrong in exactly the cases
where comparison matters most. Here the human exon's sequence is compared
against every exon of the ortholog transcript, and the margin between the best
and second-best match is reported so a doubtful correspondence is visible
rather than assumed.

**The model is human-trained.** Applying it to mouse sequence is out of
distribution. Splice signals are conserved enough that this usually transfers,
but a low ortholog score is ambiguous between "the site is different there" and
"the model is off its training distribution", and nothing here resolves that.
It is stated in the caveats rather than left for the reader to infer.
"""
from __future__ import annotations

import argparse
import json

__all__ = ["ortholog", "rest_exon_table", "match_exon", "compare_species",
           "CAVEATS", "DEFAULT_SPECIES"]

# Chosen to span a range of divergence from human: rodent, carnivore, and a
# non-mammal far enough out that a shared site is unlikely to be coincidence.
DEFAULT_SPECIES = ("mus_musculus", "canis_lupus_familiaris", "gallus_gallus")

MIN_CONTAINMENT = 0.12
MIN_MARGIN = 1.4            # best match must beat the runner-up by this factor

CAVEATS = {
    "human_trained_model": (
        "The checkpoint was trained on human sequence. Scores on another "
        "species are out of distribution: a low ortholog score does not "
        "distinguish 'the site differs there' from 'the model is outside what "
        "it was trained on'."),
    "correspondence_by_sequence": (
        "The orthologous exon was identified by sequence similarity, not by "
        "exon number. The reported containment and margin are how trustworthy "
        "that correspondence is -- a small margin means two exons matched "
        "almost equally well and the comparison should not be relied on."),
    "orthologs_are_one_transcript": (
        "One transcript per species, each that species' Ensembl canonical. A "
        "site absent from the ortholog's canonical transcript may still be "
        "annotated in another of its isoforms."),
}


def _reader(species):
    from bajasplice.remote import EnsemblReader
    return EnsemblReader(species=species)


def _get(path, species="homo_sapiens"):
    return _reader(species)._get_json(path)


# ------------------------------------------------------------- orthologs
def ortholog(gene, species, source="homo_sapiens"):
    """The one-to-one orthologue of a gene symbol in `species`.

    Returns {species, gene_id, protein_id, transcript_id, type, identity} or
    raises. One-to-one orthologues are preferred; a one-to-many relationship is
    returned only if nothing better exists, with its type recorded so the
    ambiguity is visible.
    """
    path = (f"/homology/symbol/{source}/{gene}"
            f"?target_species={species};type=orthologues;"
            f"content-type=application/json")
    data = _get(path)
    homs = (data.get("data") or [{}])[0].get("homologies") or []
    if not homs:
        raise ValueError(f"Ensembl lists no orthologue of {gene} in {species}")
    homs.sort(key=lambda h: (h.get("type") != "ortholog_one2one",
                             -float(h.get("target", {}).get("perc_id") or 0)))
    h = homs[0]
    tgt = h["target"]
    prot = tgt.get("protein_id") or tgt.get("id")
    tx = None
    if prot and prot.startswith("ENS"):
        try:
            tx = _get(f"/lookup/id/{prot}?content-type=application/json",
                      species).get("Parent")
        except Exception:
            tx = None
    return {
        "species": species,
        "gene_id": tgt.get("id"),
        "protein_id": prot,
        "transcript_id": tx,
        "type": h.get("type"),
        "identity": tgt.get("perc_id"),
        "n_homologies": len(homs),
    }


def rest_exon_table(transcript_id, species):
    """An ssam-shaped (rows, info) for any species, from Ensembl REST.

    Same contract as `ssam.exon_table`: rows are {number, start, end, length}
    with start <= end genomically, numbered 1.. in TRANSCRIPT order, so exon 1
    is the rightmost block on the minus strand.
    """
    d = _get(f"/lookup/id/{transcript_id}?expand=1;content-type=application/json",
             species)
    ex = d.get("Exon") or []
    if not ex:
        raise ValueError(f"{transcript_id} has no exons in Ensembl")
    strand = "+" if int(d["strand"]) == 1 else "-"
    blocks = sorted(({"start": int(e["start"]), "end": int(e["end"])}
                     for e in ex), key=lambda b: b["start"])
    if strand == "-":
        blocks = blocks[::-1]              # transcript order
    rows = [{"number": i, "start": b["start"], "end": b["end"],
             "length": b["end"] - b["start"] + 1}
            for i, b in enumerate(blocks, 1)]
    info = {"chrom": str(d["seq_region_name"]), "strand": strand,
            "transcript_id": transcript_id, "n_transcripts": None,
            "n_exons": len(rows), "species": species}
    return rows, info


# -------------------------------------------------------- exon matching
def _kmers(seq, k=8):
    seq = seq.upper()
    return {seq[i:i + k] for i in range(len(seq) - k + 1)
            if "N" not in seq[i:i + k]}


def _containment(a, b, k=8):
    """Fraction of the query's k-mers present in the subject.

    Alignment-free on purpose: it tolerates the small indels that separate
    orthologous exons, needs no gap penalties to tune, and is decisive when
    choosing among the ~30 very different exons of one gene.
    """
    ka, kb = _kmers(a, k), _kmers(b, k)
    if not ka:
        return 0.0
    return len(ka & kb) / len(ka)


def match_exon(human_seq, rows, info, genome, k=8,
               min_containment=MIN_CONTAINMENT, min_margin=MIN_MARGIN):
    """Which exon of an ortholog transcript corresponds to a human exon.

    Returns (row, report). Raises when the match is too weak or too close to
    its runner-up to trust, because a wrong correspondence produces real
    numbers for the wrong piece of sequence -- the failure mode worth refusing
    rather than reporting.
    """
    scored = []
    for r in rows:
        seq = genome.sequence(info["chrom"], r["start"], r["end"], info["strand"])
        scored.append((_containment(human_seq, seq, k), r))
    scored.sort(key=lambda t: -t[0])
    best, runner = scored[0], (scored[1] if len(scored) > 1 else (0.0, None))
    margin = (best[0] / runner[0]) if runner[0] > 0 else float("inf")
    report = {
        "containment": round(best[0], 4),
        "runner_up": round(runner[0], 4),
        "margin": (round(margin, 2) if margin != float("inf") else None),
        "exon_number": best[1]["number"],
        "n_exons": len(rows),
        "k": k,
    }
    if best[0] < min_containment:
        raise ValueError(
            f'no exon of {info["transcript_id"]} matches: best {k}-mer '
            f'containment {best[0]:.3f} < {min_containment}. The exon may be '
            f'absent in {info.get("species")}, or too diverged to align.')
    if margin < min_margin:
        raise ValueError(
            f'ambiguous correspondence in {info["transcript_id"]}: exons '
            f'{best[1]["number"]} and {runner[1]["number"]} score '
            f'{best[0]:.3f} and {runner[0]:.3f} (margin {margin:.2f} < '
            f'{min_margin}). Refusing rather than picking one.')
    return best[1], report


# ------------------------------------------------------------ comparison
def compare_species(gene, exon_number, species=DEFAULT_SPECIES, flank=300,
                    transcript="canonical", ckpt=None, device=None,
                    min_score=0.0, k=8):
    """Score a human exon and its orthologue in each species.

    The human run is the reference; each ortholog is reported with its own
    acceptor's score and rank, so the comparison is "is the annotated site
    still the winner there", not a numeric difference between species (which
    the human-trained model could not support).
    """
    from bajasplice import ssam

    human = ssam.scan_exon(gene, exon_number, flank=flank,
                           transcript=transcript, ckpt=ckpt, device=device,
                           min_score=min_score, prefer_remote=True)
    hg = _reader("homo_sapiens")
    hx = human["exon"]
    human_seq = hg.sequence(human["chrom"], hx["start"], hx["end"],
                            human["strand"])

    out = []
    for sp in species:
        rec = {"species": sp}
        try:
            orth = ortholog(gene, sp)
            rec["ortholog"] = orth
            if not orth["transcript_id"]:
                raise ValueError(f'no transcript found for {orth["protein_id"]}')
            rows, info = rest_exon_table(orth["transcript_id"], sp)
            g = _reader(sp)
            row, report = match_exon(human_seq, rows, info, g, k=k)
            rec["match"] = report
            r = ssam.scan_exon_table(rows, info, row["number"], gene=gene,
                                     flank=flank, ckpt=ckpt, device=device,
                                     genome=g, min_score=min_score)
            acc = r["annotated"]["acceptor"]
            rank = next((c["rank"] for c in r["candidates"]
                         if c["is_annotated_acceptor"]), None)
            rec["result"] = {
                "in_exon": [{"offset": c["offset"], "score": c["score"],
                             "rank": c["rank"]}
                            for c in r["candidates"] if c["in_target_exon"]],
                "chrom": r["chrom"], "strand": r["strand"],
                "exon": {k2: row[k2] for k2 in ("number", "start", "end", "length")},
                "acceptor": {"pos": acc["pos"], "score": acc["score"],
                             "logit": acc["logit"], "dinuc": acc["dinuc"]},
                "acceptor_rank": rank,
                "n_candidates": r["meta"]["n_candidates"],
                "intron_class": r["annotated"]["intron_class"],
                "assembly": r["meta"]["sequence"].get("assembly"),
            }
        except Exception as e:                    # one species failing is data,
            rec["error"] = f"{type(e).__name__}: {e}"   # not a reason to stop
        out.append(rec)

    hacc = human["annotated"]["acceptor"]
    hrank = next((c["rank"] for c in human["candidates"]
                  if c["is_annotated_acceptor"]), None)
    return {
        "schema": "bajasplice.ssam.ortho/1",
        "gene": gene,
        "human": {
            "chrom": human["chrom"], "strand": human["strand"],
            "transcript_id": human["transcript_id"],
            "exon": human["exon"],
            "acceptor": {"pos": hacc["pos"], "score": hacc["score"],
                         "logit": hacc["logit"], "dinuc": hacc["dinuc"]},
            "acceptor_rank": hrank,
            "n_candidates": human["meta"]["n_candidates"],
            "exon_length": human["exon"]["length"],
            "in_exon": [{"offset": c["offset"], "score": c["score"],
                         "rank": c["rank"]}
                        for c in human["candidates"] if c["in_target_exon"]],
        },
        "species": out,
        "meta": {
            "model": human["meta"]["model"],
            "context": human["meta"]["context"],
            "k": k,
            "min_containment": MIN_CONTAINMENT,
            "min_margin": MIN_MARGIN,
            "caveats": {**CAVEATS,
                        "rank_not_probability":
                            ssam.CAVEATS["rank_not_probability"]},
        },
    }


RECUR_TOL = 3


def _print_recurrence(res, tol=RECUR_TOL):
    """Do the human exon's in-body AG candidates have an ortholog counterpart?

    Offsets are compared with a +/- `tol` nt tolerance, which stands in for a
    real alignment rather than being one: an indel anywhere upstream inside the
    exon shifts every offset after it. Treat a hit as suggestive and a miss
    across all species as the stronger signal -- a weak human candidate with no
    counterpart anywhere is most likely a coincidental AG.
    """
    ok = [s for s in res["species"] if not s.get("error")]
    hum = res["human"].get("in_exon") or []
    if not hum or not ok:
        return
    print(f'\nin-exon AG candidates: does each human one recur? '
          f'(offset +/-{tol} nt, approximate -- no alignment)')
    names = [s["species"].split("_")[0][:6] for s in ok]
    print(f'  {"offset":>7s} {"human p":>10s} ' +
          " ".join(f'{n:>8s}' for n in names) + "   recurs")
    for c in sorted(hum, key=lambda c: c["offset"]):
        cells, hits = [], 0
        for s in ok:
            near = [o for o in (s["result"].get("in_exon") or [])
                    if abs(o["offset"] - c["offset"]) <= tol]
            if near:
                best = max(near, key=lambda o: o["score"])
                cells.append(f'{best["score"]:>8.1e}')
                hits += 1
            else:
                cells.append(f'{"-":>8s}')
        print(f'  {c["offset"]:>+7d} {c["score"]:>10.1e} ' +
              " ".join(cells) + f'   {hits}/{len(ok)}')
    absent = [c for c in hum
              if not any(any(abs(o["offset"] - c["offset"]) <= tol
                             for o in (s["result"].get("in_exon") or []))
                         for s in ok)]
    print(f'  {len(absent)} of {len(hum)} human in-exon candidates have no '
          f'counterpart in any ortholog scored')


def _print(res):
    h = res["human"]
    print(f'{res["gene"]}  human exon {h["exon"]["number"]}/'
          f'{h["exon"]["n_of"]}  {h["exon"]["length"]} nt  '
          f'{h["chrom"]}:{h["exon"]["start"]:,}-{h["exon"]["end"]:,} {h["strand"]}')
    print(f'  acceptor {h["acceptor"]["pos"]:,} [{h["acceptor"]["dinuc"]}] '
          f'p={h["acceptor"]["score"]:.6f}  '
          f'rank {h["acceptor_rank"]}/{h["n_candidates"]}')
    print(f'\n{"species":<28s} {"exon":>9s} {"cont":>6s} {"marg":>6s} '
          f'{"acceptor":>12s} {"p":>10s} {"rank":>9s}  dinuc')
    for s in res["species"]:
        if s.get("error"):
            print(f'  {s["species"]:<26s} -- {s["error"][:60]}')
            continue
        m, r = s["match"], s["result"]
        marg = f'{m["margin"]:.1f}' if m["margin"] is not None else "inf"
        print(f'  {s["species"]:<26s} {m["exon_number"]:>4d}/{m["n_exons"]:<4d} '
              f'{m["containment"]:>6.3f} {marg:>6s} {r["acceptor"]["pos"]:>12,d} '
              f'{r["acceptor"]["score"]:>10.6f} '
              f'{r["acceptor_rank"]:>4d}/{r["n_candidates"]:<4d}  '
              f'[{r["acceptor"]["dinuc"]}]')
    _print_recurrence(res)
    ok = [s for s in res["species"] if not s.get("error")]
    won = [s for s in ok if s["result"]["acceptor_rank"] == 1]
    print(f'\nannotated acceptor is rank 1 in {len(won)} of {len(ok)} orthologs '
          f'scored (human: rank {h["acceptor_rank"]})')
    print("\nreading these numbers")
    for v in res["meta"]["caveats"].values():
        print(f'  - {v}')


def main():
    ap = argparse.ArgumentParser(
        prog="bajasplice ssam-ortho",
        description="score a human exon's acceptor and its orthologue's")
    ap.add_argument("--gene", required=True)
    ap.add_argument("--exon", required=True, type=int,
                    help="human exon number in TRANSCRIPT order")
    ap.add_argument("--species", default=",".join(DEFAULT_SPECIES),
                    help="comma-separated Ensembl species names "
                         f"(default: {','.join(DEFAULT_SPECIES)})")
    ap.add_argument("--flank", type=int, default=300)
    ap.add_argument("--transcript", default="canonical")
    ap.add_argument("--min-score", type=float, default=0.0)
    ap.add_argument("--kmer", type=int, default=8,
                    help="k for the exon-correspondence containment (default 8)")
    ap.add_argument("--ckpt")
    ap.add_argument("--json", help="write the full result here")
    a = ap.parse_args()

    res = compare_species(a.gene, a.exon,
                          species=tuple(s.strip() for s in a.species.split(",")
                                        if s.strip()),
                          flank=a.flank, transcript=a.transcript,
                          ckpt=a.ckpt, min_score=a.min_score, k=a.kmer)
    _print(res)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(res, f)
        print(f'\nwrote {a.json}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
