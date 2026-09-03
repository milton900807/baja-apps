"""
Given a pasted sequence with no hit on any track currently on the canvas, search the
PRE-MRNA (unspliced, gene-level) reference for it and resolve each hit gene to its
canonical Ensembl transcript, so the client can load that transcript and place the
compound onto it.

Why a SEPARATE index, and why gene-level: the tracks on screen are spliced (cDNA), so a
sequence that spans an exon-exon junction, or sits in an intron a gapmer is meant to act
on in the nucleus, has no match there even though it is real. human_premrna
(py/sequence/offtarget/build-premrna.py) is built one record per GENE -- exons plus
introns, primary transcript -- exactly so a search like this one can still find it.

The reference's own limits, honestly: NOT every gene is in it (build-premrna.py needs a
GFF3 gene record with an id it can resolve; a handful of loci are skipped -- see that
script's own skip counter), and a hit here is a GENE, not yet a transcript -- see below.

Resolving gene -> loadable transcript: the premrna index's contigs (contigs.json) carry a
gene SYMBOL alongside the Ensembl gene id (parsed from the GENCODE FASTA header by
build-index.py). genes.sqlite (the same GENCODE-derived catalogue
py/sequence/prompt-to-transcript.py already uses for its by-symbol candidate lists) maps
that symbol to its canonical_tx. Two joins, both by data already on this box -- no network
call, no LLM. An LLM step is the RIGHT tool when a request is a name or a description with
real ambiguity; it is the wrong one here, where the edit-distance hit already names an
exact gene and the join is deterministic.

Params (after the EngineMonitor argument the server always prepends):
    param(1)  sequence            the pasted sequence to search for
    param(2)  editDistance        int, default 1 (this feature's whole point is ED<=1;
                                   kept as a param rather than hard-coded so a caller that
                                   wants to widen the search after an ED=1 miss can, without
                                   a second script)
    param(3)  index name          default 'human_premrna' (species scope for a later day --
                                   dog_premrna / mouse_premrna / rat_premrna / the two monkey
                                   premrna indexes already exist and this script works
                                   against any of them unchanged; only the genes.sqlite join
                                   is human-only today, so a non-human index's hits come back
                                   with symbol but no canonical_transcript)

Resolves to:
    { "candidates": [ { "gene_id", "gene_id_versioned", "symbol",
                         "canonical_transcript", "editdistance", "strand" }, ... ],
      "total_hits": <int, before de-duplication by gene>,
      "index": "<index name searched>" }

One entry per gene that had a hit, best (lowest) edit distance kept when several sites in
one gene matched, sorted by edit distance. `canonical_transcript` is None when the symbol
was not found in genes.sqlite (a non-human index, or a symbol genes.sqlite does not carry)
-- the client has to handle that rather than assume every candidate is loadable.
"""
import json
import os
import re
import sqlite3
import sys

from ion import works

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from search import search, resolve_index_dir, index_root  # noqa: E402

sequence = ("" + ("" + (works.param(1) or "")).strip()).upper()
edit_distance = works.param(2)
edit_distance = int(edit_distance) if edit_distance is not None else 1
index_name = ("" + (works.param(3) or "human_premrna")).strip()

TRANSCRIPT_VERSION_RE = re.compile(r"\.\d+$")


def strip_version(tid):
    return TRANSCRIPT_VERSION_RE.sub("", ("" + (tid or "")).strip())


def genes_db_path():
    # Same resolution order as py/sequence/prompt-to-transcript.py's genes_db_path(), kept
    # in sync deliberately -- both read the one GENCODE-derived catalogue on this box, and a
    # divergent path here would let this script and the two-pass prompt flow disagree about
    # what a gene's canonical transcript is.
    p = (os.environ.get("BAJASPLICE_GENES_DB") or "").strip()
    if p and os.path.exists(p):
        return p
    root = index_root()
    if root:
        ref = os.path.dirname(root.rstrip("/"))
        p = os.path.join(ref, "bajasplice", "data", "processed", "genes.sqlite")
        if os.path.exists(p):
            return p
    return ""


def main():
    if not sequence:
        works.resolve({"candidates": [], "total_hits": 0, "index": index_name,
                       "error": "empty sequence"})
        return
    if len(sequence) < 6:
        # Below this, edit-distance-1 matches so much of any 2Gbp reference that the result
        # is noise, not a finding -- the same "too short to seed" limit search.py's own
        # README documents for its k=3 case, just reached sooner here since ED is smaller.
        works.resolve({"candidates": [], "total_hits": 0, "index": index_name,
                       "error": "sequence too short to search reliably (need >= 6 nt)"})
        return

    try:
        result = search(index_name, [{"id": 1, "synthesisSequence": sequence}],
                        edit_distance, "+-")
    except KeyError as e:
        works.resolve({"candidates": [], "total_hits": 0, "index": index_name,
                       "error": "no local index '%s': %s" % (index_name, e)})
        return

    warnings = result.get("warnings") or []
    if warnings:
        # search.py's own escape hatch for a query too non-selective to enumerate --
        # every W-mer seed of this sequence matches so much of the reference that it gives
        # up and returns a COUNT rather than real hits (its offtarget list is padded with
        # integer 0 placeholders, not hit dicts; see _pack_offtarget). A low-complexity or
        # very short sequence hits this. That is a DIFFERENT nothing from "genuinely no
        # match anywhere" -- the first means "cannot search this reliably", the second means
        # "searched, found nothing" -- and reporting them the same way would hide which one
        # happened.
        works.resolve({"candidates": [], "total_hits": 0, "index": index_name,
                       "error": "too many candidate sites to search reliably "
                                "(the sequence is too short or too repetitive)"})
        return

    raw_hits = ((result.get("oligoQuery") or [{}])[0] or {}).get("offtarget") or []
    # Defensive: only real hit dicts. (_pack_offtarget's padding only appears alongside a
    # warning we already handled above, but a hit list is not a contract worth trusting
    # blindly when a malformed entry would otherwise throw AttributeError deep in a loop.)
    hits = [h for h in raw_hits if isinstance(h, dict)]

    # Best (lowest edit distance) hit per gene. A gene can carry the sequence at more than
    # one site -- introns repeat motifs across a locus -- and the caller wants one row per
    # loadable transcript, not one per site.
    by_gene = {}
    for h in hits:
        gid_full = h.get("chr") or ""
        if not gid_full:
            continue
        prev = by_gene.get(gid_full)
        if prev is None or h.get("editdistance", 99) < prev.get("editdistance", 99):
            by_gene[gid_full] = h

    symbol_of = {}
    if by_gene:
        try:
            idx_dir = resolve_index_dir(index_name)
            with open(os.path.join(idx_dir, "contigs.json")) as f:
                for c in json.load(f):
                    symbol_of[c["name"]] = c.get("symbol", "")
        except Exception:
            pass  # candidates still come back, just without a symbol / canonical lookup

    db_path = genes_db_path()
    db = None
    if db_path:
        try:
            db = sqlite3.connect("file:%s?mode=ro" % db_path, uri=True)
        except Exception:
            db = None

    candidates = []
    for gid_full, h in by_gene.items():
        sym = symbol_of.get(gid_full, "")
        canon = None
        if db and sym:
            try:
                row = db.execute(
                    "select canonical_tx from genes where name = ? collate nocase", (sym,)
                ).fetchone()
                if row and row[0]:
                    canon = strip_version(row[0])
            except Exception:
                canon = None
        candidates.append({
            "gene_id": strip_version(gid_full),
            "gene_id_versioned": gid_full,
            "symbol": sym,
            "canonical_transcript": canon,
            "editdistance": h.get("editdistance"),
            "strand": h.get("strand"),
        })

    candidates.sort(key=lambda c: (c["editdistance"] if c["editdistance"] is not None else 99,
                                   c["symbol"] or c["gene_id"]))

    works.resolve({"candidates": candidates, "total_hits": len(hits), "index": index_name})


main()
