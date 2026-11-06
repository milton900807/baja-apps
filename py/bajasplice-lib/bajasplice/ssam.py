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
import re

import numpy as np

__all__ = ["exon_table", "exon_bounds", "annotated_acceptor", "scan_exon",
           "ssam_payload", "render_png", "parse_variant", "variant_label",
           "occlusion_sweep",
           "AlleleReader", "CAVEATS"]

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
    "occlusion_is_dependence": (
        "The tile sweep measures how much a score DEPENDS on each region, by "
        "replacing the region with a composition-matched shuffle. It is not a "
        "model of an antisense oligo: an oligo occupies sequence that still "
        "reads the same bases, and the model has no occupancy channel. The "
        "sign is not a steric block's sign either -- covering a silencer and "
        "covering an enhancer both read as 'this region matters'."),
    "occlusion_spread": (
        "Per-tile figures are medians with 10th/90th percentiles, not means. "
        "At the largest-effect tiles the shuffle distribution is bimodal, so a "
        "mean describes no individual draw; read frac_below_half alongside the "
        "median rather than the median alone."),
    "variant_applied": (
        "Two alleles were scored: reference, and the same window with the "
        "given substitution. A delta is the model's response to that one "
        "sequence change and nothing else -- it is not a measurement, and it "
        "carries no information about whether the variant is pathogenic."),
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


_VARIANT_RE = re.compile(
    r"^(?:chr)?(?P<chrom>[0-9]{1,2}|[XYxy]|MT|mt)"
    r"[:\-](?P<pos>[0-9][0-9,_]*)"
    r"[:\-]?(?P<ref>[ACGTacgt]+)(?:>|->|/|:|-)(?P<alt>[ACGTacgt]+)$")


def parse_variant(spec):
    """A substitution spec to {chrom, pos, ref, alt}.

    Accepts `16:1762843:C>T`, `chr16:1762843C>T`, `16-1762843-C-T`. `pos` is
    1-based, and `ref`/`alt` are on the PLUS strand, as VCF and HGVS genomic
    notation both are -- not in transcript orientation. On a minus-strand gene
    that distinction is the whole ballgame, so it is not inferred.

    Substitutions only. An indel shifts every downstream coordinate, which
    would silently invalidate the exon bounds and candidate offsets this module
    reports, so it is refused rather than approximated.
    """
    if isinstance(spec, dict):
        d = dict(spec)
        d["chrom"] = str(d["chrom"]).replace("chr", "")
        d["pos"] = int(d["pos"])
        d["ref"], d["alt"] = d["ref"].upper(), d["alt"].upper()
    else:
        m = _VARIANT_RE.match(str(spec).strip())
        if not m:
            raise ValueError(
                f"cannot read variant {spec!r}. Use CHROM:POS:REF>ALT on the "
                "plus strand, e.g. 16:1762843:C>T")
        d = {"chrom": m["chrom"].upper().replace("CHR", ""),
             "pos": int(m["pos"].replace(",", "").replace("_", "")),
             "ref": m["ref"].upper(), "alt": m["alt"].upper()}
    if len(d["ref"]) != len(d["alt"]):
        raise ValueError(
            f'{d["ref"]}>{d["alt"]} changes length. Only substitutions are '
            "supported: an indel moves every downstream coordinate, so the "
            "exon bounds and offsets reported here would no longer hold.")
    if d["ref"] == d["alt"]:
        raise ValueError(f'{d["ref"]}>{d["alt"]} is not a change')
    return d


def variant_label(v):
    return f'chr{v["chrom"]}:{v["pos"]:,} {v["ref"]}>{v["alt"]}'


class AlleleReader:
    """A GenomeReader with one substitution applied, for allele comparison.

    Delegates every read to `base` and rewrites the substituted bases. The
    substitution is applied in PLUS-strand space before any reverse complement,
    so a minus-strand gene gets the right base without the caller converting
    anything.

    This is a scoring overlay, not an edited genome: nothing is written, and
    the underlying reader and its cache are untouched.
    """

    def __init__(self, base, variant, verify=True):
        from bajasplice.genome import _BASE
        self.base = base
        self.variant = parse_variant(variant)
        self._chrom = self.variant["chrom"]
        self._pos = self.variant["pos"]
        self._ref = np.frombuffer(self.variant["ref"].encode(), np.uint8)
        self._alt = np.asarray(_BASE[np.frombuffer(
            self.variant["alt"].encode(), np.uint8)], dtype=np.int8)
        self._ref_codes = np.asarray(_BASE[self._ref], dtype=np.int8)
        self._verify = verify
        self._applied = 0
        for attr in ("assembly", "describe", "species"):
            if hasattr(base, attr):
                setattr(self, attr, getattr(base, attr))

    def _same_chrom(self, chrom):
        return str(chrom).replace("chr", "").upper() == self._chrom

    def codes(self, chrom, start, end, strand="+"):
        out = np.array(self.base.codes(chrom, start, end, "+"), copy=True)
        n = len(self._alt)
        if self._same_chrom(chrom) and start <= self._pos + n - 1 and self._pos <= end:
            for k in range(n):
                p = self._pos + k
                if not (start <= p <= end):
                    continue
                i = p - start
                if self._verify and out[i] != self._ref_codes[k]:
                    from bajasplice.genome import _ALPHABET
                    raise ValueError(
                        f"variant {variant_label(self.variant)} says the "
                        f"reference base at {p:,} is "
                        f"{_ALPHABET[self._ref_codes[k]]}, but the genome "
                        f"reads {_ALPHABET[int(out[i])]}. Check the assembly "
                        "and that the spec is on the plus strand.")
                out[i] = self._alt[k]
                self._applied += 1
        if strand == "-":
            from bajasplice.genome import _COMP
            return _COMP[out[::-1]]
        return out

    def sequence(self, chrom, start, end, strand="+"):
        from bajasplice.genome import codes_to_str
        return codes_to_str(self.codes(chrom, start, end, strand))


def _candidate_positions(codes, lo, strand):
    """Plus-strand positions of every candidate acceptor dinucleotide.

    On the plus strand an acceptor AG ends at the site; on the minus strand the
    plus-strand text is CT and the site is the C. Matches
    `scan.rank_candidates`.
    """
    if strand == "+":
        idx = np.flatnonzero((codes[:-1] == 1) & (codes[1:] == 3)) + 1
    else:
        idx = np.flatnonzero((codes[:-1] == 2) & (codes[1:] == 4))
    return {lo + int(i) for i in idx}


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
              prefer_remote=False, variant=None, occlude=False, tile=18,
              tile_step=6, n_shuffle=16, occlude_top=3, occlude_span=None,
              seed=0):
    """Rank every candidate acceptor in a window around one exon.

    `flank` extends the window that far upstream of the annotated acceptor and
    that far downstream of the exon's donor, in transcript orientation.

    `variant` (e.g. `"16:1762843:C>T"`, plus strand) scores the window a second
    time with that substitution applied and reports the difference per
    candidate. Candidates are the UNION of the AG positions found on each
    allele, so a site the variant creates or destroys appears rather than
    vanishing from one of the two tables.
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
    pos_ref = _candidate_positions(codes, lo, strand)

    var = alt_track = None
    pos_alt = pos_ref
    if variant is not None:
        var = parse_variant(variant)
        if var["chrom"] != str(chrom).replace("chr", "").upper():
            raise ValueError(
                f'variant is on chr{var["chrom"]} but {gene} is on {chrom}')
        # A variant beyond the receptive field of every scored position cannot
        # move any score, and reporting a table of exact zeros would look like
        # a finding. scan_region pads by context//2 on each side, so that --
        # not the window -- is the bound that matters.
        reach = context // 2
        if not (lo - reach <= var["pos"] <= hi + reach):
            raise ValueError(
                f'variant at {var["pos"]:,} is outside the model\'s reach for '
                f'this window ({lo - reach:,}-{hi + reach:,}). No candidate '
                f'score could change. Raise --flank to bring it inside.')
        var["in_window"] = bool(lo <= var["pos"] <= hi)
        var["offset_from_acceptor"] = int(
            (var["pos"] - acc) if strand == "+" else (acc - var["pos"]))
        var["in_target_exon"] = bool(ex["start"] <= var["pos"] <= ex["end"])
        var["region"] = _region_label(var["pos"], rows, strand)
        alt_genome = AlleleReader(genome, var)
        alt_track, _ = scan_region(model, context, chrom, lo, hi, strand,
                                   device, genome=alt_genome)
        codes_alt = alt_genome.codes(chrom, lo, hi, "+")
        pos_alt = _candidate_positions(codes_alt, lo, strand)
        var["created_ag"] = sorted(pos_alt - pos_ref)
        var["destroyed_ag"] = sorted(pos_ref - pos_alt)

    acc_score = float(a_track[acc - lo]) if lo <= acc <= hi else float("nan")
    ref_logit = _logit(acc_score)

    # A non-GT-AG exon is a U12-type intron, not a bad prediction. Caught here
    # because the alternative is reporting a score of 0.2 for a real, used
    # acceptor with nothing to say it came from a class the model barely saw.
    acc_dinuc = _dinuc(genome, chrom, acc, strand, "acceptor")
    don_dinuc = _dinuc(genome, chrom, don, strand, "donor")
    minor = not (acc_dinuc == "AG" and don_dinuc == "GT")

    cands = []
    for pos in sorted(pos_ref | pos_alt):
        s = float(a_track[pos - lo])
        s_alt = float(alt_track[pos - lo]) if alt_track is not None else None
        # keep a candidate that clears the floor on EITHER allele, so a site
        # the variant lifts into view is not filtered out by its ref score
        if pos != acc and s < min_score and (s_alt is None or s_alt < min_score):
            continue
        offset = (pos - acc) if strand == "+" else (acc - pos)
        c = {
            "pos": pos,
            "score": round(s, 9),
            "logit": round(_logit(s), 4),
            "region": _region_label(pos, rows, strand),
            "offset": int(offset),
            "is_annotated_acceptor": pos == acc,
            "in_target_exon": ex["start"] <= pos <= ex["end"],
            "rel_to_annotated": round(s / acc_score, 9) if acc_score > 0 else None,
            "delta_logit": round(_logit(s) - ref_logit, 4),
        }
        if alt_track is not None:
            c.update({
                "score_alt": round(s_alt, 9),
                "logit_alt": round(_logit(s_alt), 4),
                # named for the allele comparison so it cannot be confused with
                # delta_logit, which is this candidate against the annotated site
                "variant_delta_logit": round(_logit(s_alt) - _logit(s), 4),
                # a non-AG position still carries a model score; these say
                # whether the dinucleotide is actually there on each allele
                "ag_ref": pos in pos_ref,
                "ag_alt": pos in pos_alt,
            })
        cands.append(c)

    cands.sort(key=lambda c: -c["score"])
    for n, c in enumerate(cands, 1):
        c["rank"] = n
    if alt_track is not None:
        # a second ranking on the variant allele: a rank that moves is the
        # readable form of "this changed the competitive order"
        for n, c in enumerate(sorted(cands, key=lambda c: -c["score_alt"]), 1):
            c["rank_alt"] = n

    occ = None
    if occlude:
        tops = [c for c in cands if not c["is_annotated_acceptor"]][:occlude_top]
        targets = ([{"pos": acc, "label": "annotated acceptor"}]
                   + [{"pos": c["pos"],
                       "label": f'rank {c["rank"]} ({c["offset"]:+d})'}
                      for c in tops])
        occ = occlusion_sweep(model, context, device, genome, chrom, lo, hi,
                              strand, targets, a_track, tile=tile,
                              step=tile_step, n_shuffle=n_shuffle, seed=seed,
                              span=occlude_span)

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
        "variant": var,
        "occlusion": occ,
        "annotated": {
            "acceptor": {"pos": int(acc), "score": round(acc_score, 9),
                         "logit": round(ref_logit, 4), "dinuc": acc_dinuc,
                         "canonical_dinuc": acc_dinuc == "AG",
                         **({} if alt_track is None else {
                             "score_alt": round(float(alt_track[acc - lo]), 9),
                             "logit_alt": round(
                                 _logit(float(alt_track[acc - lo])), 4),
                             "variant_delta_logit": round(
                                 _logit(float(alt_track[acc - lo])) - ref_logit, 4),
                             "dinuc_alt": _dinuc(alt_genome, chrom, acc,
                                                 strand, "acceptor")})},
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
            "variant": variant_label(var) if var else None,
            "occlusion": {k: occ[k] for k in
                          ("tile", "step", "n_shuffle", "n_tiles",
                           "n_passes", "null", "span")} if occ else None,
            # the U12 and variant caveats are only included when they apply, so
            # the presence of either in a payload is itself the signal
            "caveats": {k: v for k, v in CAVEATS.items()
                        if (k != "minor_spliceosome" or minor)
                        and (k != "variant_applied" or var)
                        # the two are mutually exclusive: one says no variant
                        # was applied, the other that one was
                        and (k != "reference_sequence" or not var)
                        and (not k.startswith("occlusion_") or occlude)},
        },
    }


def _dinuc(genome, chrom, pos, strand, which):
    """The two-base signal at a site, in transcript orientation."""
    if which == "acceptor":
        a, b = (pos - 1, pos) if strand == "+" else (pos, pos + 1)
    else:
        a, b = (pos, pos + 1) if strand == "+" else (pos - 1, pos)
    return genome.sequence(chrom, a, b, strand)


# ------------------------------------------------------- occlusion sweep
class _MemoryReader:
    """The GenomeReader contract served from an in-memory plus-strand array.

    Lets the tested `scan_region` chunking and strand logic run over a locally
    modified copy of the sequence without touching the real reader or its
    cache.
    """

    def __init__(self, codes, origin, assembly="in-memory"):
        self._codes = np.asarray(codes, dtype=np.int8)
        self.origin = int(origin)
        self.assembly = assembly

    def codes(self, chrom, start, end, strand="+"):
        out = np.zeros(end - start + 1, np.int8)
        a, b = start - self.origin, end - self.origin
        sa, sb = max(0, a), min(len(self._codes) - 1, b)
        if sb >= sa:
            out[sa - a:sb - a + 1] = self._codes[sa:sb + 1]
        if strand == "-":
            from bajasplice.genome import _COMP
            return _COMP[out[::-1]]
        return out

    def sequence(self, chrom, start, end, strand="+"):
        from bajasplice.genome import codes_to_str
        return codes_to_str(self.codes(chrom, start, end, strand))


def occlusion_sweep(model, context, device, genome, chrom, lo, hi, strand,
                    targets, ref_track, tile=18, step=6, n_shuffle=16,
                    seed=0, span=None):
    """Slide a tile across the window, destroy its arrangement, rescore.

    For each tile position the tile's bases are replaced by a
    dinucleotide-preserving shuffle (`cis.dinuc_shuffle`), which holds base
    composition and local transition statistics fixed so that a change in
    score is attributable to longer-range ARRANGEMENT rather than to
    composition having moved. `n_shuffle` draws are taken per tile.

    What this measures is how much each target's score DEPENDS on each region.
    It is not a model of an antisense oligo: an oligo hybridises and occupies
    sequence that still reads the same bases, and SpliceNet has no occupancy
    channel to put that in. Shuffling substitutes different sequence, which the
    model scores as different sequence. The magnitude here is a dependence, and
    its sign is not the sign of a steric block -- covering a silencer and
    covering an enhancer both show up as "this region matters".

    Reported per cell: the MEDIAN shift and the 10th/90th percentiles across
    shuffles, never the mean. At the cells with the largest effects the shuffle
    distribution is bimodal, and a mean logit there describes no individual
    shuffle; `frac_below_half` counts the draws whose probability falls under
    0.5, which is the honest form of "this tile sometimes breaks the site".

    `span` limits which part of the window is tiled, as (start, end) in
    plus-strand coordinates. Defaults to the whole window.
    """
    from bajasplice.cis import dinuc_shuffle
    from bajasplice.scan import scan_region

    reach = context // 2
    ext_lo, ext_hi = lo - reach, hi + reach
    base = np.array(genome.codes(chrom, ext_lo, ext_hi, "+"), copy=True)

    t_lo, t_hi = span if span else (lo, hi)
    starts = list(range(int(t_lo), int(t_hi) - tile + 2, int(step)))
    rng = np.random.default_rng(seed)

    tgt = [dict(t) for t in targets]
    for t in tgt:
        t["ref_logit"] = _logit(float(ref_track[t["pos"] - lo]))
        t["ref_score"] = round(float(ref_track[t["pos"] - lo]), 9)

    cells = []
    for st in starts:
        en = st + tile - 1
        a, b = st - ext_lo, en - ext_lo
        draws = np.empty((n_shuffle, len(tgt)), float)
        for k in range(n_shuffle):
            arr = base.copy()
            arr[a:b + 1] = dinuc_shuffle(arr[a:b + 1], rng)
            trk, _ = scan_region(model, context, chrom, lo, hi, strand, device,
                                 genome=_MemoryReader(arr, ext_lo))
            for j, t in enumerate(tgt):
                draws[k, j] = float(trk[t["pos"] - lo])

        row = {"start": int(st), "end": int(en),
               "offset": int((st - tgt[0]["pos"]) if strand == "+"
                             else (tgt[0]["pos"] - en)),
               "targets": []}
        for j, t in enumerate(tgt):
            p = draws[:, j]
            lg = np.array([_logit(float(x)) for x in p])
            d = lg - t["ref_logit"]
            # a tile covering the target's own AG trivially destroys it; that
            # is arithmetic, not a finding, so it is flagged rather than ranked
            own = st <= t["pos"] <= en or st <= t["pos"] - 1 <= en
            row["targets"].append({
                "pos": t["pos"], "label": t.get("label", ""),
                "median_delta_logit": round(float(np.median(d)), 4),
                "q10_delta_logit": round(float(np.quantile(d, 0.10)), 4),
                "q90_delta_logit": round(float(np.quantile(d, 0.90)), 4),
                "median_score": round(float(np.median(p)), 9),
                "min_score": round(float(p.min()), 9),
                "frac_below_half": round(float((p < 0.5).mean()), 4),
                "covers_own_dinuc": bool(own),
            })
        cells.append(row)

    return {
        "tile": int(tile), "step": int(step), "n_shuffle": int(n_shuffle),
        "seed": int(seed), "span": [int(t_lo), int(t_hi)],
        "n_tiles": len(starts), "n_passes": len(starts) * n_shuffle,
        "null": "dinucleotide-preserving shuffle (Altschul-Erikson)",
        "targets": [{"pos": t["pos"], "label": t.get("label", ""),
                     "ref_score": t["ref_score"],
                     "ref_logit": round(t["ref_logit"], 4)} for t in tgt],
        "tiles": cells,
    }


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
    v = result.get("variant")
    if v:
        print(f'\nvariant {variant_label(v)}  {v["region"]}, '
              f'{v["offset_from_acceptor"]:+d} nt from the annotated acceptor')
        if v["created_ag"] or v["destroyed_ag"]:
            print(f'  AG created: {v["created_ag"] or "none"}   '
                  f'AG destroyed: {v["destroyed_ag"] or "none"}')
        else:
            print('  creates and destroys no AG: a context change only')
        if acc.get("dinuc_alt") and acc["dinuc_alt"] != acc["dinuc"]:
            print(f'  !! it changes the annotated acceptor dinucleotide '
                  f'{acc["dinuc"]} -> {acc["dinuc_alt"]}')
        print(f'  annotated acceptor p {acc["score"]:.6f} -> '
              f'{acc["score_alt"]:.6f}   '
              f'dlogit {acc["variant_delta_logit"]:+.3f}')
    if m.get("minor_spliceosome"):
        print(f'\n!! {result["annotated"]["intron_class"]} intron -- '
              f'read the last caveat before the scores below')
    print(f'sequence: {m["sequence"].get("source")} '
          f'{m["sequence"].get("assembly", "")}   chromosome split: {m["chrom_split"]}')
    print(f'\n{len(result["candidates"])} candidate AG sites, top {top} by score')
    if v:
        print(f'  {"rank":>4s} {"position":>12s} {"p(ref)":>11s} {"p(alt)":>11s} '
              f'{"dlogit":>8s} {"rank":>9s} {"offset":>7s}  region')
        for c in result["candidates"][:top]:
            mark = " <-- annotated" if c["is_annotated_acceptor"] else ""
            if not c["ag_ref"]:
                mark += " [AG created]"
            elif not c["ag_alt"]:
                mark += " [AG destroyed]"
            move = (f'{c["rank"]}->{c["rank_alt"]}'
                    if c["rank"] != c["rank_alt"] else "-")
            print(f'  {c["rank"]:>4d} {c["pos"]:>12,d} {c["score"]:>11.3e} '
                  f'{c["score_alt"]:>11.3e} {c["variant_delta_logit"]:>+8.3f} '
                  f'{move:>9s} {c["offset"]:>+7d}  {c["region"]}{mark}')
        moved = [c for c in result["candidates"] if c["rank"] != c["rank_alt"]]
        big = [c for c in result["candidates"]
               if abs(c["variant_delta_logit"]) > 0.5]
        print(f'\n{len(big)} of {len(result["candidates"])} candidates move more '
              f'than 0.5 logits; {len(moved)} change rank')
    else:
        print(f'  {"rank":>4s} {"position":>12s} {"score":>11s} {"rel":>9s} '
              f'{"dlogit":>8s} {"offset":>7s}  region')
        for c in result["candidates"][:top]:
            mark = " <-- annotated" if c["is_annotated_acceptor"] else ""
            rel = (f'{c["rel_to_annotated"]:.3g}'
                   if c["rel_to_annotated"] is not None else "-")
            print(f'  {c["rank"]:>4d} {c["pos"]:>12,d} {c["score"]:>11.3e} {rel:>9s} '
                  f'{c["delta_logit"]:>+8.2f} {c["offset"]:>+7d}  {c["region"]}{mark}')
    inex = [c for c in result["candidates"] if c["in_target_exon"]]
    if inex:
        print(f'\n{len(inex)} inside the exon {ex["number"]} body:')
        for c in inex:
            print(f'  {c["pos"]:,}  p={c["score"]:.3e}  rank {c["rank"]}  '
                  f'{c["offset"]:+d} nt from the annotated acceptor')
    if result.get("occlusion"):
        _print_occlusion(result["occlusion"], top=top)
    print("\nreading these numbers")
    for k, v in result["meta"]["caveats"].items():
        print(f'  - {v}')


def _parse_span(text):
    if not text:
        return None
    m = re.match(r"^([0-9][0-9,_]*)[-:]([0-9][0-9,_]*)$", text.strip())
    if not m:
        raise SystemExit(f"cannot read span {text!r}. Use START-END, "
                         "e.g. 1762600-1762835")
    a = int(m[1].replace(",", "").replace("_", ""))
    b = int(m[2].replace(",", "").replace("_", ""))
    if b <= a:
        raise SystemExit(f"span {text!r} ends before it starts")
    return (a, b)


def _print_occlusion(occ, top=12):
    tgts = occ["targets"]
    print(f'\ntile sweep: {occ["n_tiles"]} tiles of {occ["tile"]} nt, '
          f'step {occ["step"]}, {occ["n_shuffle"]} shuffles each '
          f'({occ["n_passes"]:,} passes)')
    print(f'  span {occ["span"][0]:,}-{occ["span"][1]:,}   null: {occ["null"]}')
    print(f'  tracking: ' + ", ".join(
        f'{t["pos"]:,} {t["label"]} (p={t["ref_score"]:.4f})' for t in tgts))

    # ranked on the first target -- the annotated acceptor -- ignoring tiles
    # that cover its own AG, where the drop is arithmetic rather than a finding
    rows = [(c, c["targets"][0]) for c in occ["tiles"]]
    real = [(c, t) for c, t in rows if not t["covers_own_dinuc"]]
    own = [(c, t) for c, t in rows if t["covers_own_dinuc"]]
    real.sort(key=lambda ct: ct[1]["median_delta_logit"])

    print(f'\neffect on {tgts[0]["label"]} ({tgts[0]["pos"]:,}), '
          f'strongest {min(top, len(real))} of {len(real)} tiles')
    print(f'  {"tile":>19s} {"off":>6s} {"median":>8s} {"q10":>8s} {"q90":>8s} '
          f'{"p(med)":>9s} {"p<.5":>6s}')
    for c, t in real[:top]:
        print(f'  {c["start"]:>9,d}-{c["end"]:<9,d} {c["offset"]:>+6d} '
              f'{t["median_delta_logit"]:>+8.3f} {t["q10_delta_logit"]:>+8.3f} '
              f'{t["q90_delta_logit"]:>+8.3f} {t["median_score"]:>9.4f} '
              f'{t["frac_below_half"]:>6.2f}')
    if own:
        print(f'  ({len(own)} tiles covering the site\'s own AG omitted)')

    worst = real[0][1]["median_delta_logit"] if real else 0.0
    crossed = [t for _, t in real if t["frac_below_half"] > 0]
    bimodal = [t for _, t in real
               if t["q90_delta_logit"] - t["q10_delta_logit"] > 2.0]
    print(f'\nlargest median drop {worst:+.3f} logits; '
          f'{len(crossed)} tiles have any draw below p=0.5; '
          f'{len(bimodal)} have a q10-q90 spread over 2 logits')
    if len(tgts) > 1:
        print("\nsame tiles, effect on the competing candidates")
        for j, g in enumerate(tgts[1:], 1):
            ds = [c["targets"][j]["median_delta_logit"] for c in occ["tiles"]
                  if not c["targets"][j]["covers_own_dinuc"]]
            if ds:
                print(f'  {g["pos"]:,} {g["label"]:<22s} '
                      f'median shift {np.median(ds):+.3f}, '
                      f'range {min(ds):+.3f} to {max(ds):+.3f}')


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
    ap.add_argument("--variant", metavar="CHROM:POS:REF>ALT",
                    help="also score this substitution and report the delta "
                         "per candidate, e.g. '16:1762843:C>T'. QUOTE it -- an "
                         "unquoted > is a shell redirect, and 16:1762843:C-T "
                         "means the same thing without one. Plus-strand "
                         "coordinates, as in VCF. Substitutions only.")
    ap.add_argument("--occlude", action="store_true",
                    help="slide a tile across the window, replace each tile "
                         "with a composition-matched shuffle, and report how "
                         "much each site's score DEPENDS on that region. Not "
                         "an oligo model -- see the caveats it prints.")
    ap.add_argument("--tile", type=int, default=18,
                    help="tile width for --occlude (default 18)")
    ap.add_argument("--tile-step", type=int, default=6,
                    help="tile stride for --occlude (default 6)")
    ap.add_argument("--shuffles", type=int, default=16,
                    help="shuffles per tile (default 16; 64 did not change "
                         "conclusions, the spread is intrinsic to the null)")
    ap.add_argument("--occlude-top", type=int, default=3,
                    help="competing candidates to track besides the annotated "
                         "acceptor (default 3)")
    ap.add_argument("--occlude-span", metavar="START-END",
                    help="tile only this plus-strand range, e.g. 1762600-1762835 "
                         "to sweep the intron up to the acceptor")
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
                       prefer_remote=a.remote_sequence, variant=a.variant,
                       occlude=a.occlude, tile=a.tile, tile_step=a.tile_step,
                       n_shuffle=a.shuffles, occlude_top=a.occlude_top,
                       occlude_span=_parse_span(a.occlude_span))
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
