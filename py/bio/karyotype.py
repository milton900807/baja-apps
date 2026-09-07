"""The chromosomes of a species: how long each one is, and where its bands are.

Read from a table built offline by py/bio/build-karyotype.py from UCSC's chromInfo and
cytoBand, and shipped with the reference data. Nothing is fetched at draw time: a view that
cannot draw a chromosome without reaching a third party is a view that does not work on a
plane, and these tables are a few kilobytes.

The species is matched on its own words rather than by a model. "human", "Homo sapiens",
"a human patient" and "hs" are the same request, and a synonym table answers it exactly --
where a model would answer it almost exactly, sometimes.

Params (after the EngineMonitor):
    param(1) : species, in words

Resolves:
    { ok, species, assembly, source, chromosomes, error }
  chromosomes is a JSON array:
    [{name, length, centromere: {start, end} | null,
      bands: [{start, end, name, stain}]}]
"""
import json
import os
import re

from ion import works

DIR = "reference_data/karyotype"

# Every name a species is likely to be typed under. Longest match wins, so "mouse" inside
# "mouse embryo" resolves and does not collide with anything else here.
SYNONYMS = {
    "human": ["human", "homo sapiens", "h sapiens", "hsapiens", "hs", "hg38", "grch38", "man", "people", "patient"],
    "mouse": ["mouse", "mus musculus", "m musculus", "murine", "mm39", "grcm39", "mice"],
    "rat": ["rat", "rattus norvegicus", "r norvegicus", "rn7", "rats"],
    "dog": ["dog", "canis", "canis lupus familiaris", "canine", "canfam", "dogs"],
}

text = str(works.param(1) or "").strip()
out = {"ok": False, "species": "", "assembly": "", "source": "",
       "chromosomes": "[]", "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return rel


def resolve(t):
    low = " " + re.sub(r"[^a-z0-9 ]+", " ", t.lower()) + " "
    best, best_len = "", 0
    for species, names in SYNONYMS.items():
        for n in names:
            if (" " + n + " ") in low and len(n) > best_len:
                best, best_len = species, len(n)
    return best


if not text:
    out["error"] = "no species given"
else:
    species = resolve(text)
    if not species:
        out["error"] = ('"%s" is not a species this holds chromosomes for. '
                        "Try human, mouse, rat or dog." % text)
    else:
        path = first_existing(os.path.join(DIR, "%s.json" % species))
        if not os.path.exists(path):
            out["error"] = ("the %s karyotype is not on this server (%s/%s.json). Build it "
                            "with py/bio/build-karyotype.py." % (species, DIR, species))
        else:
            try:
                with open(path) as fh:
                    doc = json.load(fh)
                chroms = doc.get("chromosomes") or []
                out["ok"] = bool(chroms)
                out["species"] = doc.get("species") or species
                out["assembly"] = doc.get("assembly") or ""
                out["source"] = doc.get("source") or ""
                out["chromosomes"] = json.dumps(chroms)
                works.msg("%s (%s): %d chromosomes"
                          % (out["species"], out["assembly"], len(chroms)))
            except Exception as e:
                out["error"] = "the %s karyotype could not be read: %s" % (species, e)

works.resolve(out)
