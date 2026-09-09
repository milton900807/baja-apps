"""A disease, in words -- which OMIM phenotypes is it, and which genes and variants are those?

This is the other half of py/bio/disease-variants.py, and it answers the same question from
the opposite direction. That script asks a model to REMEMBER which mutations characterise a
condition, and everything it misremembers is thrown out downstream when the transcript is
checked. This one asks the model only which OMIM PHENOTYPE the words mean -- a small question
with a checkable answer -- and takes the genes and the variants from ClinVar.

    "sickle cell disease"  ->  OMIM:603903  ->  HBB  ->  72 pathogenic ClinVar records

Nothing is recalled from memory. The MIM numbers a model proposes are looked up in an index
built from ClinVar itself (py/bio/build-clinvar-omim-index.py), and one that is not in it is
dropped rather than followed; the variants are then real records with real coordinates and
real accessions, so there is nothing to verify and nothing to lose.

Two passes, because they are two different questions:

    1. WHICH PHENOTYPE. Is this text a clinical context at all, and if so, which OMIM
       phenotypes does it name? The model answers with MIM numbers and with names.
    2. WHICH OF THESE. The proposals are resolved against the index, and the REAL candidates
       -- the ones ClinVar actually has pathogenic records for, with their gene counts -- are
       handed back for the model to choose from. It can only pick from what exists.

The second pass is the point. A model asked for a MIM number from memory produces plausible,
wrong numbers, and picking from a real list is the difference between a phenotype that loads
and one that resolves to nothing.

Params (after the EngineMonitor):
    param(1) : the user's text
    param(2) : optional maximum number of genes to return (default 6)

Resolves:
    { is_context, disease, mims, genes, phenotypes, note, error }
  where mims/genes/phenotypes are JSON strings:
    mims       ["219700"]
    genes      ["CFTR"]
    phenotypes [{mim, name, variants, stars, genes: [[symbol, count], ...]}]
"""
import json
import os
import re

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-opus-5"

INDEX_REL = "reference_data/variants/clinvar-omim.json"
DEFAULT_MAX_GENES = 6
HARD_MAX_GENES = 12
MAX_CANDIDATES = 40          # keeps pass 2 small; best-evidenced first

# A phenotype's gene list is long because a handful of records are filed against the wrong
# condition -- cystic fibrosis carries one CHD7 record and one TTN record beside CFTR's 1262.
# A gene has to carry a real share of the phenotype to be worth loading a transcript for.
MIN_GENE_RECORDS = 2
MIN_GENE_SHARE = 0.05

text = str(works.param(1) or "").strip()
try:
    max_genes = int(float(works.param(2) or DEFAULT_MAX_GENES))
except Exception:
    max_genes = DEFAULT_MAX_GENES
max_genes = max(1, min(HARD_MAX_GENES, max_genes))

out = {"is_context": False, "kind": "", "disease": "", "mims": "[]", "genes": "[]",
       "phenotypes": "[]", "note": "", "error": None}


def first_existing(rel):
    for base in [os.getcwd(), "/opt/baja-server", os.path.expanduser("~/baja-server")]:
        p = os.path.join(base, rel)
        if os.path.exists(p):
            return p
    return rel


def parse_json_blob(txt):
    if not txt:
        return None
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def call(system, user, max_tokens=1500):
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    try:
        try:
            import claude_usage as _cu
            _cu.bump("omim-variants")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": max_tokens, "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=120,
        )
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        if data.get("stop_reason") == "refusal":
            return None, "the request was declined"
        txt = "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text")
        parsed = parse_json_blob(txt)
        if parsed is None:
            return None, "could not read the reply: %s" % (txt[:200] or "empty")
        return parsed, None
    except Exception as e:
        return None, str(e)


# ---- the index -------------------------------------------------------------------------
INDEX = None
_path = first_existing(INDEX_REL)
if not text:
    out["error"] = "no description given"
elif not os.path.exists(_path):
    out["error"] = ("the ClinVar phenotype index is not on this server (%s). Build it with "
                    "py/bio/build-clinvar-omim-index.py." % INDEX_REL)
else:
    try:
        with open(_path) as fh:
            INDEX = (json.load(fh) or {}).get("phenotypes") or {}
    except Exception as e:
        out["error"] = "the ClinVar phenotype index could not be read: %s" % e

# Name matching is by CONTENT WORDS, not by phrase. "sickle cell disease" is filed by ClinVar
# as "Hb SS disease" and "cystic fibrosis" as "Cystic fibrosis", and a phrase test finds the
# second and misses the first. Words that carry no meaning of their own are dropped so they
# cannot be the thing that matched.
STOPWORDS = set(("a an and or of the for with to in on type form familial hereditary "
                 "disease diseases disorder disorders syndrome condition conditions "
                 "deficiency related associated variant variants mutation mutations").split())


def content_words(phrase):
    ws = re.sub(r"[^a-z0-9 ]+", " ", str(phrase or "").lower()).split()
    return [w for w in ws if len(w) > 3 and w not in STOPWORDS]


def dominant_genes(entry):
    """The genes that actually carry this phenotype, noise dropped."""
    genes = entry.get("genes") or []
    if not genes:
        return []
    top = genes[0][1]
    keep = [g for g, c in genes
            if c >= MIN_GENE_RECORDS and c >= MIN_GENE_SHARE * top]
    return keep or [genes[0][0]]


def entry_out(mim, e):
    return {"mim": mim, "name": e.get("name") or ("phenotype " + mim),
            "variants": e.get("v") or 0, "stars": e.get("s") or 0,
            "genes": e.get("genes") or []}


# ---- 1. which phenotype does this name? -------------------------------------------------
ASK_SYSTEM = (
    "You read a piece of text and say which OMIM phenotype it means. Reply with ONLY a JSON "
    "object:\n"
    "{\n"
    '  "kind": "context" | "variant" | "gene" | "other",\n'
    '  "disease": "the full name of the condition, if kind is context",\n'
    '  "mims": ["219700"],\n'
    '  "names": ["Cystic fibrosis", "Congenital bilateral absence of the vas deferens"],\n'
    '  "why": "one short sentence"\n'
    "}\n"
    'Use "variant" when the text names a specific change, however informally -- K27M, '
    'p.Arg175His, c.83A>T, "TP53 R175H", rs113488022, a genomic coordinate. Use "gene" when '
    "it names only a gene or transcript with no change and no disease. Use \"context\" ONLY "
    "when it names a disease, syndrome, tumour type or comparable clinical context and "
    "contains no specific change.\n"
    "mims: the OMIM phenotype MIM numbers for that condition, most central first, as strings "
    "of digits. A phenotypic series may be given as PS followed by the number. Give the ones "
    "you are confident of and no more than 8; every one is checked against a real index and a "
    "number that is not in it is discarded, so a guess costs the condition nothing but gains "
    "it nothing either.\n"
    "names: the same condition written the way a clinical variant database labels it, plus "
    "its close equivalents and main subtypes. Between 2 and 8. These are matched against real "
    "condition names, so write them as records write them, not as descriptions."
)

# ---- 2. which of the ones that really exist? --------------------------------------------
CHOOSE_SYSTEM = (
    "You are choosing which OMIM phenotypes a request means. You are given the REAL "
    "candidates -- every one has pathogenic variants in ClinVar, with the count, the review "
    "status in stars, and the genes they sit in. Reply with ONLY a JSON object:\n"
    '{"matches": true, "mims": ["219700"], "note": "one short sentence, or empty"}\n'
    "Fields:\n"
    "- matches: true only if the candidate list actually contains the condition that was "
    "asked for. Set it to FALSE when the request is for something these candidates do not "
    "cover -- a somatic tumour context against a list of germline syndromes, for example -- "
    "even if some candidates are in the same organ or share a word with it. A near neighbour "
    "is not a match.\n"
    "- mims: the chosen ids, only from the candidate list. MUST be empty when matches is "
    "false.\n"
    "- note: one short sentence, or empty.\n"
    "Rules: choose the phenotypes that ARE the condition asked for, not every phenotype that "
    "mentions it -- a request for one condition is usually one or two entries, and a request "
    "for a family of conditions may be a phenotypic series (PS...) plus its main members. "
    "Prefer entries with more variants and more stars when two say the same thing. Returning "
    "nothing is a good answer when nothing fits: the caller has another way to answer the "
    "question and a wrong phenotype sends it to the wrong genes."
)

if INDEX is not None and not out["error"]:
    works.msg("Reading \"%s\"…" % text)
    got, err = call(ASK_SYSTEM, "Text: %s" % text)
    if err:
        out["error"] = err
    else:
        # THE CLASSIFICATION IS USEFUL EVEN WHEN THE ANSWER IS NO. "SMN1" is a gene and
        # "K27M" is a change, and the caller does different things with each -- a request for
        # a transcript is a request for a transcript, and loading a database of mutations onto
        # it answers a question nobody asked. So the kind is returned whatever it is.
        out["kind"] = str(got.get("kind") or "").lower()
    if err:
        pass
    elif out["kind"] != "context":
        # Not a disease. Say so plainly and let the caller take its other path.
        out["is_context"] = False
        out["note"] = str(got.get("why") or "")
    else:
        out["is_context"] = True
        out["disease"] = str(got.get("disease") or text)

        # ---- resolve the proposals against the index --------------------------------------
        cand = {}
        for m in (got.get("mims") or [])[:8]:
            key = re.sub(r"[^0-9A-Z]", "", str(m).upper())
            for k in (key, key[2:] if key.startswith("PS") else "PS" + key):
                if k in INDEX and k not in cand:
                    cand[k] = INDEX[k]
        by_name = 0
        terms = [content_words(n) for n in (got.get("names") or [])[:8]]
        terms = [t for t in terms if t]
        if terms:
            for mim, e in INDEX.items():
                if mim in cand:
                    continue
                low = str(e.get("name") or "").lower()
                if any(all(w in low for w in words) for words in terms):
                    cand[mim] = e
                    by_name += 1
        if not cand:
            out["note"] = ("no phenotype with pathogenic ClinVar records matches \"%s\""
                           % (out["disease"] or text))
        else:
            # Best evidenced first: that is the order the chooser reads, and the order the
            # cut at MAX_CANDIDATES keeps.
            ranked = sorted(cand.items(), key=lambda kv: (-(kv[1].get("s") or 0),
                                                          -(kv[1].get("v") or 0)))[:MAX_CANDIDATES]
            chosen = [m for m, _ in ranked]
            if len(ranked) > 1:
                works.msg("Choosing among %d phenotype(s)…" % len(ranked))
                lines = []
                for mim, e in ranked:
                    genes = dominant_genes(e)
                    lines.append("- OMIM:%s%s  %s  [%d pathogenic variants, %d star(s), genes: %s]"
                                 % (mim, " (phenotypic series)" if e.get("series") else "",
                                    e.get("name"), e.get("v") or 0, e.get("s") or 0,
                                    ", ".join(genes[:8]) or "-"))
                pick, perr = call(CHOOSE_SYSTEM,
                                  "Request: %s\n\nCandidates:\n%s" % (text, "\n".join(lines)))
                if not perr and pick:
                    out["note"] = str(pick.get("note") or "")
                    # A SEPARATE FLAG, NOT AN EMPTY LIST, DECIDES WHETHER THIS FITS.
                    #
                    # Asked about DIPG -- a somatic H3-mutant brainstem tumour -- the chooser
                    # wrote in its note that DIPG "is not represented among the candidates",
                    # and then returned eleven of them anyway: glioma susceptibility loci and
                    # the whole pheochromocytoma series. Every one was a real id from the real
                    # list, so nothing downstream could tell they were wrong, and six
                    # unrelated transcripts would have been loaded.
                    #
                    # So the fit is asked for as its own boolean and answered before the ids
                    # are read. A false there ends the OMIM route cleanly and the caller falls
                    # back to enumerating the condition, which is the right answer for a
                    # context ClinVar's germline phenotypes do not cover.
                    if pick.get("matches") is False:
                        chosen = []
                    else:
                        ok = [re.sub(r"[^0-9A-Z]", "", str(m).upper()) for m in (pick.get("mims") or [])]
                        ok = [m for m in ok if m in cand]
                        chosen = ok

            # ---- the genes to load ---------------------------------------------------------
            if not chosen:
                # Nothing fits. The caller reads empty genes as "this route has no answer" and
                # falls back to enumerating the condition, so this is a normal outcome and not
                # an error -- is_context stays true, because the text really is a disease.
                out["note"] = (out["note"]
                               or ("no phenotype with pathogenic ClinVar records is "
                                   "\"%s\"" % (out["disease"] or text)))
            # Ordered by how much of the chosen phenotypes each gene actually carries, so a
            # cap takes the ones the condition is about rather than the first alphabetically.
            weight = {}
            for mim in (chosen or []):
                e = INDEX[mim]
                keep = set(dominant_genes(e))
                for g, c in (e.get("genes") or []):
                    if g in keep:
                        weight[g] = weight.get(g, 0) + c
            genes = [g for g, _ in sorted(weight.items(), key=lambda kv: (-kv[1], kv[0]))][:max_genes]
            out["mims"] = json.dumps(chosen)
            out["genes"] = json.dumps(genes)
            out["phenotypes"] = json.dumps([entry_out(m, INDEX[m]) for m in chosen])
            total = sum((INDEX[m].get("v") or 0) for m in chosen)
            out["note"] = (out["note"] or "") or ""
            works.msg("%d phenotype(s), %d gene(s), %d pathogenic records"
                      % (len(chosen), len(genes), total))

works.resolve(out)
