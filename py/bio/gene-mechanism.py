"""How does disease happen in this gene -- loss of function, gain of function, or something else?

ClinVar says what a variant IS (missense, nonsense, splice donor) and how it was classified
(pathogenic, benign). It does not say what the variant DOES, and that is the thing someone
looking at a track actually wants: this one truncates the protein and this gene's disease is
haploinsufficiency, so it is a loss-of-function allele.

Half of that is deterministic and is done on the client, from the molecular consequence the
record already carries. The other half is a property of the GENE, not of the variant -- CFTR
disease is loss of function whatever the allele, KRAS disease is constitutive activation --
and that is what this asks for. ONE call for every gene on the track, not one per variant:
three thousand variants in four genes is four questions.

Nothing here is placed or drawn on its own. It is a sentence about a gene, shown beside a
variant whose consequence supports it, and it says it is general knowledge rather than a
finding about the specific allele.

Params (after the EngineMonitor):
    param(1) : JSON array of gene symbols, e.g. ["CFTR","KRAS"]

Resolves:
    { genes, error }
  where genes is a JSON object:
    { "CFTR": {"mechanism": "loss of function",
               "truncating": "loss of function",
               "note": "channel function is lost; two defective alleles cause disease"} }
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

MAX_GENES = 40

out = {"genes": "{}", "error": None}

try:
    wanted = json.loads(works.param(1) or "[]")
except Exception:
    wanted = []
wanted = [str(g).strip().upper() for g in wanted if str(g).strip()][:MAX_GENES]

SYSTEM = (
    "You state the DISEASE MECHANISM of human genes. Reply with ONLY a JSON object keyed by "
    "the gene symbol you were given:\n"
    '{"CFTR": {"mechanism": "loss of function", "truncating": "loss of function", '
    '"note": "chloride channel function is lost; disease needs two defective alleles"}}\n'
    "Fields:\n"
    '- mechanism: one of "loss of function", "gain of function", "dominant negative", '
    '"loss and gain of function", "unclear". This is how PATHOGENIC variants in this gene '
    "cause disease, in general.\n"
    '- truncating: what a nonsense, frameshift or splice-disrupting allele does in THIS gene '
    '-- usually "loss of function", but say "not a known disease mechanism" for a gene where '
    'only activating missense alleles cause disease (a truncated KRAS does not cause cancer), '
    'and "unclear" when it is genuinely not settled.\n'
    "- note: one short clause naming the mechanism in the terms the field uses -- "
    '"haploinsufficiency", "constitutive kinase activation", "toxic polyglutamine expansion", '
    '"dominant-negative collagen assembly". No more than about twelve words.\n'
    "Rules: include every gene you were given and no others. Where a gene is not one you know "
    'a disease mechanism for, return "unclear" rather than a guess -- this text is shown '
    "beside real variants and a confident wrong mechanism is worse than an admitted gap."
)

if not wanted:
    out["error"] = "no genes given"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "ANTHROPIC_API_KEY is not set on the server"
else:
    works.msg("Reading the disease mechanism of %d gene(s)…" % len(wanted))
    try:
        try:
            import claude_usage as _cu
            _cu.bump("gene-mechanism")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 2000, "system": SYSTEM,
                  "messages": [{"role": "user", "content": "Genes: " + ", ".join(wanted)}]},
            timeout=120,
        )
        if r.status_code != 200:
            out["error"] = "anthropic %s: %s" % (r.status_code, r.text[:300])
        else:
            data = r.json()
            txt = "".join(b.get("text", "") for b in (data.get("content") or [])
                          if b.get("type") == "text")
            m = re.search(r"\{.*\}", txt, re.S)
            parsed = json.loads(m.group(0)) if m else None
            if not isinstance(parsed, dict):
                out["error"] = "could not read the reply: %s" % (txt[:200] or "empty")
            else:
                # Only the genes that were asked about, only the fields expected. A reply that
                # invents a gene does not get to put a sentence on a track.
                keep = {}
                allowed = {"loss of function", "gain of function", "dominant negative",
                           "loss and gain of function", "unclear"}
                for g in wanted:
                    e = parsed.get(g) or parsed.get(g.upper()) or parsed.get(g.title())
                    if not isinstance(e, dict):
                        continue
                    mech = str(e.get("mechanism") or "").strip().lower()
                    if mech not in allowed:
                        mech = "unclear"
                    keep[g] = {"mechanism": mech,
                               "truncating": str(e.get("truncating") or "").strip().lower(),
                               "note": str(e.get("note") or "").strip()}
                out["genes"] = json.dumps(keep)
                works.msg("%d of %d gene(s) answered" % (len(keep), len(wanted)))
    except Exception as e:
        out["error"] = str(e)

works.resolve(out)
