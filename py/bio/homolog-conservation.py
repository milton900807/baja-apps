"""Where a gene is conserved across species, position by position.

    exec('py/bio/homolog-conservation.py', 'SPAG9', 'human', 'orthologues')

"I want to understand and visually plot the highly conserved regions across all
transcripts." A list of homologs with one percentage each says how alike two proteins
are overall and nothing about WHERE, and where is the whole question: a protein can be
60% identical because every residue is a coin flip, or because two domains are perfect
and the linker between them is not.

NOTHING IS ALIGNED HERE. Ensembl has already aligned every homolog to the query and
returns both rows of each pairwise alignment (align_seq). They are all alignments of
the SAME query protein, so every one can be projected onto the query's own residue
numbering and stacked, which gives a column per residue across all species without
running a multiple alignment -- and without the arbitrariness of one: a column here is
exactly what each pairwise alignment said about that residue.

IDENTICAL AND SIMILAR ARE NOT THE SAME ANSWER. A conservative substitution (K for R,
I for V) keeps a protein working and is what tells a domain from a coincidence, so
both are counted and both are returned. Similarity uses BLOSUM62 where Biopython is
present and a grouping of the amino acids by chemistry where it is not, which differs
only at the margin and is said in the result rather than passed off as the same thing.

Params (after the EngineMonitor):
    param(1) : gene symbol
    param(2) : species of the query. Default human
    param(3) : "orthologues" (default), "paralogues" or "all"
    param(4) : JSON { min_identity: 0.9, min_block: 8, max_species: 12 }

Resolves:
    { status, gene, species, length, species_rows, profile, blocks, scoring, note }
  species_rows [{ symbol, species, species_common, identity, states }]
                 states: one character per QUERY residue --
                 '=' identical, '+' similar, '.' different, '-' not aligned
  profile      { identical: [n per residue], similar: [n], aligned: [n], n: species }
  blocks       [{ start, end, length, identity, similarity, peak }] 1-based, inclusive
"""
import json

from ion import works

ENSEMBL = "https://rest.ensembl.org"
DEFAULTS = {"min_identity": 0.9, "min_block": 8, "max_species": 12}

# Amino acids grouped by what a substitution between them costs a protein. Used only
# when Biopython is not importable; BLOSUM62 is the real answer and this is the
# serviceable one, which is why the result says which was used.
GROUPS = ["AGSTP", "ILMVF", "KRH", "DENQ", "CWY"]


def _similar_fallback(a, b):
    for g in GROUPS:
        if a in g and b in g:
            return True
    return False


def _similarity():
    """(is_similar, name). BLOSUM62 if it is here, chemistry if it is not."""
    try:
        from Bio.Align import substitution_matrices
        m = substitution_matrices.load("BLOSUM62")

        def sim(a, b):
            try:
                return m[a, b] > 0
            except Exception:
                return False
        return sim, "BLOSUM62"
    except Exception:
        return _similar_fallback, "amino acid chemistry (BLOSUM62 not available here)"


def run(symbol, species="human", kind="orthologues", opts=None):
    # The lookup, the species restriction and the pretty names all live in homologs.py;
    # this asks it for the same rows with the alignments attached rather than keeping a
    # second copy of which species this editor can open.
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import homologs as HOM
    except Exception as exc:                                    # noqa: BLE001
        return {"status": "ERROR", "error": "the homolog lookup could not be loaded (%s)" % exc}

    o = {}
    if isinstance(opts, str):
        try:
            o = json.loads(opts) or {}
        except Exception:
            o = {}
    elif isinstance(opts, dict):
        o = opts
    min_identity = float(o.get("min_identity") or DEFAULTS["min_identity"])
    min_block = int(o.get("min_block") or DEFAULTS["min_block"])
    max_species = int(o.get("max_species") or DEFAULTS["max_species"])

    symbol = ("" + (symbol or "")).strip()
    if not symbol:
        return {"status": "ERROR", "error": "no gene was named"}
    species = ("" + (species or "human")).strip() or "human"

    try:
        homologies = HOM._homologies(symbol, species, kind, sequence="protein")
    except Exception as exc:                                    # noqa: BLE001
        return {"status": "ERROR", "error": "could not reach Ensembl (%s)" % exc}

    sim, scoring = _similarity()

    # The query's own length, from any one alignment: its align_seq without the gaps.
    rows, qlen = [], 0
    for h in homologies:
        src = (h.get("source") or {})
        tgt = (h.get("target") or {})
        a, b = src.get("align_seq") or "", tgt.get("align_seq") or ""
        if not a or not b or len(a) != len(b):
            continue
        latin = tgt.get("species") or ""
        states = []
        for x, y in zip(a, b):
            if x == "-":
                continue                      # an insertion in the other protein: the
                                              # query has no residue here to speak of
            if y == "-":
                states.append("-")
            elif x == y:
                states.append("=")
            elif sim(x, y):
                states.append("+")
            else:
                states.append(".")
        if not states:
            continue
        qlen = max(qlen, len(states))
        rows.append({
            "id": tgt.get("id"),
            "species": latin,
            "species_common": HOM._pretty_species(latin),
            "loadable": (latin in HOM.LOADABLE) or (latin in HOM.ALSO_KNOWN),
            "identity": tgt.get("perc_id"),
            "states": "".join(states),
        })

    if not rows:
        return {"status": "OK", "gene": symbol, "species": species, "length": 0,
                "species_rows": [], "profile": {}, "blocks": [], "scoring": scoring,
                "note": "no aligned homolog came back for %s" % symbol}

    # The closest first, and no more than asked for: a map of forty species is a smear.
    rows.sort(key=lambda r: -(r["identity"] or 0))
    rows = rows[:max_species]

    # One name per row, looked up together.
    info = HOM._lookup([r["id"] for r in rows if r.get("id")])
    for r in rows:
        d = info.get(r.get("id")) or {}
        r["symbol"] = d.get("display_name") or r.get("id") or "?"

    ident = [0] * qlen
    simil = [0] * qlen
    aligned = [0] * qlen
    for r in rows:
        st = r["states"]
        for i in range(min(qlen, len(st))):
            c = st[i]
            if c == "-":
                continue
            aligned[i] += 1
            if c == "=":
                ident[i] += 1
                simil[i] += 1
            elif c == "+":
                simil[i] += 1

    n = len(rows)
    # THE DENOMINATOR IS EVERY SPECIES, NOT THE ALIGNED ONES. A residue present in one
    # species out of eight and identical there is not conserved, and dividing by the
    # one that aligned would score it 100%.
    frac = [(ident[i] / n) if n else 0.0 for i in range(qlen)]

    blocks, start = [], None
    for i in range(qlen + 1):
        hot = (i < qlen and frac[i] >= min_identity)
        if hot and start is None:
            start = i
        elif not hot and start is not None:
            if i - start >= min_block:
                seg = range(start, i)
                blocks.append({
                    "start": start + 1, "end": i, "length": i - start,
                    "identity": sum(frac[j] for j in seg) / (i - start),
                    "similarity": sum(simil[j] / n for j in seg) / (i - start),
                    "peak": max(frac[j] for j in seg),
                })
            start = None
    blocks.sort(key=lambda b: (-b["length"], -b["identity"]))

    return {"status": "OK", "gene": symbol, "species": species, "kind": kind,
            "length": qlen, "species_rows": rows,
            "profile": {"identical": ident, "similar": simil, "aligned": aligned, "n": n},
            "blocks": blocks, "scoring": scoring,
            "note": ("%d species, %d residues, %d conserved block%s at %d%% or better"
                     % (n, qlen, len(blocks), "" if len(blocks) == 1 else "s",
                        round(min_identity * 100)))}


def _main():
    try:
        works.resolve(run(works.param(1), works.param(2) or "human",
                          works.param(3) or "orthologues", works.param(4)))
    except Exception as exc:                                    # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
