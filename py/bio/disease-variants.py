"""A disease name, and nothing else -- what mutations does it mean, and in which genes?

"DIPG" is not a variant description. It is a context, and the thing a user wants from it is
the set of changes that define that context together with the transcripts those changes
belong on. This script answers the first half; the caller loads the transcripts for the genes
named here and then verifies every change against each transcript's own coding sequence
before anything is drawn.

It asks twice, because they are two different questions and one answer must not be allowed to
smuggle in the other:

    1. CLASSIFY. Is this text a disease or biological context on its own, with no variant in
       it? A description that already names a change ("K27M", "TP53 R175H") is NOT this, and
       is sent straight back so the ordinary single-variant path handles it.
    2. ENUMERATE. Given the disease named in step 1, which recurrent mutations characterise
       it, and in which gene is each one?

Nothing here is placed or trusted: every variant comes back as a gene plus a protein change,
and is checked against a real coding sequence downstream. A residue that is misremembered is
dropped there rather than drawn.

Params (after the EngineMonitor):
    param(1) : the user's text
    param(2) : optional maximum number of variants to return (default 12)

Resolves:
    { is_context, disease, genes: [...],
      variants: [{gene, ref, pos, alt, label, why}], note, error }
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

DEFAULT_MAX = 12
HARD_MAX = 30
AA1 = {"ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C", "GLN": "Q", "GLU": "E",
       "GLY": "G", "HIS": "H", "ILE": "I", "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F",
       "PRO": "P", "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V", "TER": "*"}


def parse_json_blob(txt):
    """The first JSON object in a reply, whether or not it is fenced."""
    if not txt:
        return None
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def one_letter(a):
    a = str(a or "").strip()
    if not a:
        return ""
    if len(a) == 1:
        return a.upper()
    return AA1.get(a.upper(), "")


def call(system, user, max_tokens=2000):
    """One Anthropic call. Returns (parsed_json, error)."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    try:
        try:
            import claude_usage as _cu
            _cu.bump("disease-variants")
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


# ---- 1. is this a context, or is it a variant? ----------------------------------------------
CLASSIFY_SYSTEM = (
    "You decide what KIND of text you have been given. Reply with ONLY a JSON object:\n"
    "{\n"
    '  "kind": "context" | "variant" | "gene" | "other",\n'
    '  "disease": "full name of the disease or biological context, if kind is context",\n'
    '  "why": "one short sentence"\n'
    "}\n"
    'Use "variant" when the text names a specific change, however informally -- K27M, '
    'p.Arg175His, c.83A>T, "TP53 R175H", rs113488022, a genomic coordinate. Use "gene" when it '
    'names only a gene or transcript and no change and no disease. Use "context" ONLY when it '
    "names a disease, syndrome, tumour type or comparable biological context and contains no "
    "specific change: DIPG, Li-Fraumeni syndrome, lung adenocarcinoma, cystic fibrosis. A text "
    "that names both a disease and a specific change is \"variant\", not \"context\"."
)

# ---- 2. which mutations define it, and where ------------------------------------------------
ENUMERATE_SYSTEM = (
    "You list the mutations that characterise a named disease or biological context. Reply "
    "with ONLY a JSON object:\n"
    "{\n"
    '  "variants": [{"gene": "H3-3A", "ref": "K", "pos": 28, "alt": "M", '
    '"label": "K27M", "why": "defining mutation of diffuse midline glioma, ~80% of cases"}],\n'
    '  "sample": false,\n'
    '  "note": ""\n'
    "}\n"
    "Rules:\n"
    "- gene is the current official HGNC symbol.\n"
    "- ref and alt are ONE-LETTER amino acids; pos is the HGVS protein position, counting the "
    "initiator methionine as 1. If the field conventionally numbers this protein differently "
    "-- histone H3 K27M is HGVS position 28 because the initiator Met is not counted -- give "
    "the HGVS position in pos and the conventional name in label.\n"
    "- label is the short name the literature uses (K27M, G34R, V600E, R175H).\n"
    "- Single-residue substitutions only. Skip fusions, amplifications, whole-exon deletions "
    "and copy-number changes; they cannot be placed as one coding change. A nonsense change "
    'is allowed: write the stop as "*" in alt (never "X"), e.g. R518*.\n'
    "- The position must be right for the gene's CANONICAL transcript, which is the one that "
    "will be loaded. If a variant is only correct in a non-canonical isoform's numbering, "
    "leave it out rather than giving a position that will not check out.\n"
    "- Order by how strongly each characterises the context, most defining first.\n"
    "- Only well-documented recurrent mutations. A short accurate list is better than a long "
    "speculative one. At most {MAX}.\n"
    "- A BROAD CATEGORY IS STILL ANSWERABLE. \"Heart disease\" and \"cancer\" have no single "
    "defining mutation, but they do have well-characterised subtypes that do: answer with a "
    "representative sample drawn across those major subtypes, name the subtype each one "
    'belongs to in its "why", and set "sample": true with a note saying what the sample '
    "covers and what it leaves out. Never refuse a real disease category for being broad.\n"
    '- Set "sample": false when the context is specific enough that the list is the '
    "characteristic set rather than a selection from one.\n"
    '- Only if the text names no disease you can work with at all, return '
    '{"variants": [], "note": "why not"}.'
)

text = str(works.param(1) or "").strip()
try:
    want = int(str(works.param(2) or "").strip() or DEFAULT_MAX)
except Exception:
    want = DEFAULT_MAX
want = max(1, min(want, HARD_MAX))

out = {"is_context": False, "disease": "", "genes": [], "variants": [], "kind": "",
       "sample": False, "note": "", "model": ANTHROPIC_MODEL, "error": None}

if not text:
    out["error"] = "nothing to look up"
else:
    works.msg("Reading \"%s\"…" % text)
    kind_res, err = call(CLASSIFY_SYSTEM, "Text: %s" % text, max_tokens=500)
    if err:
        out["error"] = err
    else:
        kind = str(kind_res.get("kind") or "other").lower()
        out["kind"] = kind
        out["disease"] = str(kind_res.get("disease") or "").strip()
        out["note"] = str(kind_res.get("why") or "")
        if kind != "context":
            # Not our question. The caller falls back to its ordinary path, which is the
            # right one for a named change or a bare gene.
            out["is_context"] = False
        else:
            out["is_context"] = True
            disease = out["disease"] or text
            works.msg("Finding the mutations that define %s…" % disease)
            got, err2 = call(ENUMERATE_SYSTEM.replace("{MAX}", str(want)),
                             "Context: %s\nAs the user wrote it: %s" % (disease, text),
                             max_tokens=3000)
            if err2:
                out["error"] = err2
            else:
                seen = set()
                variants = []
                for v in (got.get("variants") or []):
                    gene = str(v.get("gene") or "").strip()
                    ref, alt = one_letter(v.get("ref")), one_letter(v.get("alt"))
                    try:
                        pos = int(v.get("pos"))
                    except Exception:
                        continue
                    # A variant with no gene, no residues or no position cannot be verified
                    # against a transcript later, so it cannot be placed and is not returned.
                    if not gene or not ref or not alt or pos < 1:
                        continue
                    key = (gene.upper(), ref, pos, alt)
                    if key in seen:
                        continue
                    seen.add(key)
                    variants.append({
                        "gene": gene, "ref": ref, "pos": pos, "alt": alt,
                        "label": str(v.get("label") or "%s%d%s" % (ref, pos, alt)),
                        "why": str(v.get("why") or ""),
                    })
                    if len(variants) >= want:
                        break
                out["variants"] = variants
                # Genes in the order they first appear, so the most defining gene loads first.
                genes = []
                for v in variants:
                    if v["gene"] not in genes:
                        genes.append(v["gene"])
                out["genes"] = genes
                if got.get("note"):
                    out["note"] = str(got.get("note"))
                # A broad category gets a sample, not a definitive set, and the caller has to
                # be able to say so: a user who asks for "heart disease" and is handed nine
                # mutations must not read them as the nine that cause it.
                out["sample"] = bool(got.get("sample"))
                if not variants:
                    out["error"] = ("no placeable mutation could be named for \"%s\"%s"
                                    % (disease, ("; " + out["note"]) if out["note"] else ""))

works.resolve({k: (json.dumps(v) if isinstance(v, (list, dict)) else v) for k, v in out.items()})
