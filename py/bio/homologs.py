"""The homologs of a gene, closest first: its paralogs, its orthologs, or both.

    exec('py/bio/homologs.py', 'SPAG9', 'human', 25, 'orthologues')

PARALOGS AND ORTHOLOGS ARE ONE LOOKUP. Both come from the same Ensembl endpoint with one
parameter changed, both are ranked the same way, and both end up on the same screen. Two
copies of this would have been two things to keep in step for the sake of a word.

"The closest paralog to this track" was refused: nothing in the editor knew what a
paralog was. Ensembl does, and it is the same source the rest of the editor's gene
lookups come from, so a paralog found here can be loaded by the symbol it comes back
under and will be the same gene the editor already knows how to draw.

CLOSEST MEANS THE ALIGNMENT, NOT THE FAMILY. Ensembl's homology record carries the
percent identity in both directions: how much of the query the target covers
(`perc_id` on the source half) and how much of the target the query covers (on the
target half). Those differ whenever the two proteins are different lengths, and a
short paralog fully contained in a long one scores high one way and low the other.
Both are returned and the ordering uses the lower of the two, so a fragment cannot
sort above a real counterpart on the strength of its better direction.

WITHIN-SPECIES ONLY. type=paralogues already asks for that, but the endpoint will
return `other_paralog` and `gene_split` subtypes too -- a split gene model is an
artefact of the annotation rather than a duplication, and saying so is better than
quietly dropping it, so the subtype rides on every row.

WHAT THE EDITOR CAN ACTUALLY OPEN. Ensembl has orthologs in hundreds of species and the
editor holds transcript indexes for eight, so every row says which species it is in and
whether this editor can load it. Offering a button that fails is worse than saying so.

Params (after the EngineMonitor):
    param(1) : gene symbol, as the user or the track has it
    param(2) : species, Ensembl style ("human", "mouse"). Default human
    param(3) : how many to return. Default 25, max 100
    param(4) : "paralogues", "orthologues" or "all". Default paralogues

Resolves:
    { status, gene, species, kind, homologs: [...], paralogs: [...], count, note }
  homologs  [{ symbol, id, identity, identity_query, identity_target, subtype, kind,
               species, species_common, loadable, description, chromosome, start, end,
               strand, length }]
  paralogs  the same list, under the name the first version of this used
"""
import json
import urllib.error
import urllib.request

from ion import works

ENSEMBL = "https://rest.ensembl.org"
TIMEOUT = 90
DEFAULT_TOP = 25
MAX_TOP = 100
KINDS = ("paralogues", "orthologues", "all")

# The species this editor holds transcript indexes for, by Ensembl's own name. Taken
# from py/sequence/prompt-to-transcript.py, which is what actually does the loading:
# anything outside this list is a real homolog that this editor cannot draw, and the
# screen says so rather than offering a button that fails.
# Ensembl's own current names. An old alias is fine to RECOGNISE in a response but must
# not be asked for: target_species=canis_familiaris is a 400 for the whole call, which
# reads as "Ensembl does not know that gene" and is nothing of the kind.
ALSO_KNOWN = {"canis_familiaris": "dog"}

LOADABLE = {
    "homo_sapiens": "human",
    "mus_musculus": "mouse",
    "rattus_norvegicus": "rat",
    "canis_lupus_familiaris": "dog",
    "saccharomyces_cerevisiae": "yeast",
    "macaca_fascicularis": "cynomolgus monkey",
    "macaca_mulatta": "rhesus macaque",
    "drosophila_melanogaster": "fly",
}


def _pretty_species(latin):
    latin = ("" + (latin or "")).strip()
    if not latin:
        return ""
    common = LOADABLE.get(latin) or ALSO_KNOWN.get(latin)
    if common:
        return common
    return latin.replace("_", " ").capitalize()


def _get(url, tries=3):
    """One retry each side of a slow answer.

    The homology endpoint computes an alignment on demand and takes several seconds
    for a large family; a single timeout turned a working lookup into "could not
    reach Ensembl", which reads as the gene having no paralogs.
    """
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            return json.loads(urllib.request.urlopen(req, timeout=TIMEOUT).read())
        except urllib.error.HTTPError:
            raise
        except Exception as exc:                                # noqa: BLE001
            last = exc
    raise last


def _homologies(symbol, species, kind="paralogues", sequence="none"):
    """One homology call.

    ASKED FOR THE SPECIES THIS EDITOR CAN OPEN, not for all of them. An unrestricted
    ortholog query spans every vertebrate Ensembl holds and takes minutes: the server
    aligns each pair on demand, and the hundreds of rows that come back are mostly in
    species the editor has no transcript index for, so the wait buys nothing. Naming
    the targets turns it into a couple of seconds and returns exactly the rows a user
    can act on. Paralogs are within one species and need no such restriction.
    """
    # NOT format=condensed. The condensed record is one line per paralog with its gene
    # id and nothing else: no percent identity at all, so "the closest" could not be
    # answered from it. sequence=none keeps the full record's identities while leaving
    # behind the aligned protein sequences, which are the bulk of the response and are
    # not read here.
    # sequence=protein brings back both rows of every pairwise alignment, which is what
    # the conservation map is built from; none keeps the reply small when only the
    # identities are wanted.
    url = ("%s/homology/symbol/%s/%s?type=%s;sequence=%s;"
           "content-type=application/json" % (ENSEMBL, species, symbol, kind, sequence))
    if kind in ("orthologues", "all"):
        src = ("" + (species or "")).strip().lower()
        targets = [latin for latin in sorted(set(LOADABLE))
                   if LOADABLE[latin] != LOADABLE.get(src, src)]
        for latin in targets:
            url += ";target_species=" + latin
    data = _get(url)
    rows = (data or {}).get("data") or []
    return (rows[0].get("homologies") or []) if rows else []


def _lookup(ids):
    """Symbol, description and position for the paralogs, in one POST.

    The condensed homology record carries ids and identities but no symbols, and a
    list of ENSG ids is not something anyone can read or load. One call for the lot
    rather than one per paralog, which for a large family is forty round trips.
    """
    out = {}
    if not ids:
        return out
    url = "%s/lookup/id?content-type=application/json" % ENSEMBL
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        body = json.dumps({"ids": chunk}).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={
            "Content-Type": "application/json", "Accept": "application/json"})
        try:
            out.update(json.loads(urllib.request.urlopen(req, timeout=TIMEOUT).read()) or {})
        except Exception:
            continue
    return out


def run(symbol, species="human", top=DEFAULT_TOP, kind="paralogues"):
    symbol = ("" + (symbol or "")).strip()
    if not symbol:
        return {"status": "ERROR", "error": "no gene was named"}
    species = ("" + (species or "human")).strip() or "human"
    try:
        top = int(top)
    except Exception:
        top = DEFAULT_TOP
    top = max(1, min(top, MAX_TOP))
    kind = ("" + (kind or "paralogues")).strip().lower()
    kind = {"paralogs": "paralogues", "orthologs": "orthologues",
            "both": "all", "homologs": "all", "homologues": "all"}.get(kind, kind)
    if kind not in KINDS:
        kind = "paralogues"

    try:
        homologies = _homologies(symbol, species, kind)
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            # WHAT ENSEMBL ACTUALLY SAID. A 400 is usually an unknown gene and sometimes a
            # parameter this code got wrong; reporting both as "no such gene" sent one of
            # them looking in the wrong place entirely.
            detail = ""
            try:
                detail = (json.loads(exc.read()) or {}).get("error") or ""
            except Exception:
                detail = ""
            if detail and "species" in detail:
                return {"status": "ERROR", "error": "Ensembl refused the request: %s" % detail}
            return {"status": "ERROR",
                    "error": "Ensembl does not know a %s gene called %s%s"
                             % (species, symbol, (" (%s)" % detail) if detail else "")}
        return {"status": "ERROR", "error": "Ensembl returned %s" % exc.code}
    except Exception as exc:                                    # noqa: BLE001
        return {"status": "ERROR", "error": "could not reach Ensembl (%s)" % exc}

    rows = []
    for h in homologies:
        tgt = h.get("target") or {}
        src = h.get("source") or {}
        gid = tgt.get("id")
        if not gid:
            continue
        # Both directions, and the ordering takes the lower: a short paralog wholly
        # inside a long one looks like a close match from one side only.
        iq = src.get("perc_id")
        it = tgt.get("perc_id")
        vals = [float(v) for v in (iq, it) if v is not None]
        latin = tgt.get("species") or ""
        rows.append({
            "id": gid,
            "identity_query": iq,
            "identity_target": it,
            "identity": (min(vals) if vals else None),
            "subtype": h.get("subtype") or "",
            "type": h.get("type") or "",
            # within_species_paralog / ortholog_one2one, ortholog_one2many, ...
            "kind": ("paralog" if "paralog" in (h.get("type") or "") else "ortholog"),
            "species": latin,
            "species_common": _pretty_species(latin),
            "loadable": (latin in LOADABLE) or (latin in ALSO_KNOWN),
        })

    # Only the ones in this species: lookup/id is per-species-agnostic, but the symbol a
    # cross-species row needs comes back the same way, so one call still covers the lot.
    info = _lookup([r["id"] for r in rows])
    for r in rows:
        d = info.get(r["id"]) or {}
        r["symbol"] = d.get("display_name") or r["id"]
        r["description"] = (d.get("description") or "").split("[")[0].strip()
        r["chromosome"] = d.get("seq_region_name")
        r["start"] = d.get("start")
        r["end"] = d.get("end")
        r["strand"] = d.get("strand")
        try:
            r["length"] = int(d.get("end")) - int(d.get("start")) + 1
        except Exception:
            r["length"] = None

    # Closest first. A row Ensembl gave no identity for goes last rather than being
    # dropped: it is still a paralog, and saying so with a blank is honest where
    # inventing a number is not.
    # A loadable species first among equals: an ortholog this editor can draw is worth
    # more to someone about to compare two tracks than one a point closer that it cannot.
    rows.sort(key=lambda r: (r["identity"] is None, not r["loadable"],
                             -(r["identity"] or 0), r["symbol"]))
    kept = rows[:top]
    word = {"paralogues": "paralogs", "orthologues": "orthologs", "all": "homologs"}[kind]
    note = ""
    if len(rows) > len(kept):
        note = "%d %s in all; the %d closest are here" % (len(rows), word, len(kept))
    n_load = sum(1 for r in kept if r["loadable"])
    if kind != "paralogues" and n_load < len(kept):
        note = (note + ". " if note else "") + (
            "%d of these are in species this editor can open; the rest are listed because "
            "they are real homologs, not because they can be drawn here" % n_load)
    return {"status": "OK", "gene": symbol, "species": species, "kind": kind,
            "homologs": kept,
            # The name the first version of this resolved under, so nothing that already
            # reads `paralogs` has to change.
            "paralogs": kept,
            "count": len(rows), "note": note}


def _main():
    try:
        works.resolve(run(works.param(1), works.param(2) or "human",
                          works.param(3) or DEFAULT_TOP,
                          works.param(4) or "paralogues"))
    except Exception as exc:                                    # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
