"""The paralogs of a gene, closest first.

    exec('py/bio/paralogs.py', 'SPAG9', 'human')

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

Params (after the EngineMonitor):
    param(1) : gene symbol, as the user or the track has it
    param(2) : species, Ensembl style ("human", "mouse"). Default human
    param(3) : how many to return. Default 25, max 100

Resolves:
    { status, gene, species, paralogs: [...], count, note }
  paralogs  [{ symbol, id, identity, identity_query, identity_target, subtype,
               description, chromosome, start, end, strand, length }]
"""
import json
import urllib.error
import urllib.request

from ion import works

ENSEMBL = "https://rest.ensembl.org"
TIMEOUT = 90
DEFAULT_TOP = 25
MAX_TOP = 100


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


def _homologies(symbol, species):
    # NOT format=condensed. The condensed record is one line per paralog with its gene
    # id and nothing else: no percent identity at all, so "the closest" could not be
    # answered from it. sequence=none keeps the full record's identities while leaving
    # behind the aligned protein sequences, which are the bulk of the response and are
    # not read here.
    url = ("%s/homology/symbol/%s/%s?type=paralogues;sequence=none;"
           "content-type=application/json" % (ENSEMBL, species, symbol))
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


def run(symbol, species="human", top=DEFAULT_TOP):
    symbol = ("" + (symbol or "")).strip()
    if not symbol:
        return {"status": "ERROR", "error": "no gene was named"}
    species = ("" + (species or "human")).strip() or "human"
    try:
        top = int(top)
    except Exception:
        top = DEFAULT_TOP
    top = max(1, min(top, MAX_TOP))

    try:
        homologies = _homologies(symbol, species)
    except urllib.error.HTTPError as exc:
        if exc.code == 400:
            return {"status": "ERROR",
                    "error": "Ensembl does not know a %s gene called %s" % (species, symbol)}
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
        rows.append({
            "id": gid,
            "identity_query": iq,
            "identity_target": it,
            "identity": (min(vals) if vals else None),
            "subtype": h.get("subtype") or "",
            "type": h.get("type") or "",
        })

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
    rows.sort(key=lambda r: (r["identity"] is None, -(r["identity"] or 0), r["symbol"]))
    kept = rows[:top]
    note = ""
    if len(rows) > len(kept):
        note = "%d paralogs in all; the %d closest are here" % (len(rows), len(kept))
    return {"status": "OK", "gene": symbol, "species": species,
            "paralogs": kept, "count": len(rows), "note": note}


def _main():
    try:
        works.resolve(run(works.param(1), works.param(2) or "human",
                          works.param(3) or DEFAULT_TOP))
    except Exception as exc:                                    # noqa: BLE001
        works.resolve({"status": "ERROR", "error": str(exc) or exc.__class__.__name__})
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
