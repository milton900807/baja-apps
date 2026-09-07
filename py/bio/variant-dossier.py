"""Everything that is known about these variants, laid out under fixed headings.

The single-variant "More information" in snp-menu.js asks for one short paragraph and puts
it on the marker as a callout. This is the longer form of the same question, asked of a
SELECTION rather than of one marker: what the change is, how it was classified and on what
evidence, which conditions it is seen in and how they are inherited, who carries it, what it
does to the protein, and whether any of that is actionable.

Everything the client knows travels with the question -- the genomic locus, the alleles, the
gene and transcript, the rsID, the ClinVar significance and condition, the molecular
consequence -- so the answer is about THIS variant at THIS position rather than about its
gene in general.

WHAT IS NOT KNOWN IS PART OF THE ANSWER, and it has its own heading. A variant with no
population data gets "not established" under that heading rather than a plausible frequency,
because a made-up allele frequency is indistinguishable from a real one once it is on the
screen. The same goes for citations: none are asked for and none should be invented.

Params (after the EngineMonitor):
    param(1) : JSON array of variants, each
               {key, name, gene, chr, pos, ref, alt, type, rsid, clinsig, clindn,
                consequence, transcript, annotations}

Resolves:
    { variants, error }
  where variants is a JSON array:
    [{key, title, sections: [{heading, text}]}]
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

MAX_VARIANTS = 12

HEADINGS = [
    "What this variant is",
    "Clinical significance",
    "Conditions and inheritance",
    "Population and frequency",
    "Functional mechanism",
    "Therapeutic relevance",
    "What is not established",
]

SYSTEM = (
    "You write short clinical dossiers on genetic variants. You are given what a genome "
    "browser knows about each one. Reply with ONLY a JSON object:\n"
    '{"variants": [{"key": "<the key you were given>", "title": "CFTR F508del (chr7:117559590)", '
    '"sections": [{"heading": "What this variant is", "text": "..."}]}]}\n'
    "Use EXACTLY these headings, in this order, for every variant:\n"
    + "".join("  - %s\n" % h for h in HEADINGS) +
    "Each section is ONE OR TWO sentences of plain prose. No bullet points, no markdown, "
    "no citations, no reference numbers.\n"
    "Rules:\n"
    "- Write about THIS variant at THIS position, not about its gene in general. Where only "
    "gene-level information exists, say that it is gene-level.\n"
    "- 'Population and frequency': give real, well-established figures only -- a founder "
    "population, a carrier rate, a gnomAD frequency you are confident of. If you are not "
    "confident, say the frequency is not established. A fabricated allele frequency is "
    "indistinguishable from a real one once it is on the screen.\n"
    "- 'What is not established' is not optional and must not be empty. Say plainly what is "
    "unknown or contested about this variant: absent functional data, conflicting "
    "submissions, unclear penetrance, no population data.\n"
    "- Where the browser's own data disagrees with what you know, say so rather than "
    "silently preferring one.\n"
    "- Return one entry per variant given, with the key copied exactly. Do not add variants."
)

try:
    given = json.loads(works.param(1) or "[]")
except Exception:
    given = []
given = [v for v in given if isinstance(v, dict)][:MAX_VARIANTS]

out = {"variants": "[]", "error": None}


def describe(v):
    bits = []
    for label, key in (("name", "name"), ("gene", "gene"), ("transcript", "transcript"),
                       ("chromosome", "chr"), ("position", "pos"), ("ref", "ref"),
                       ("alt", "alt"), ("type", "type"), ("dbSNP", "rsid"),
                       ("ClinVar significance", "clinsig"), ("ClinVar condition", "clindn"),
                       ("molecular consequence", "consequence")):
        val = v.get(key)
        if val in (None, "", [], {}):
            continue
        bits.append("%s: %s" % (label, val))
    ann = v.get("annotations")
    if ann:
        if isinstance(ann, list):
            ann = "; ".join(str(a) for a in ann[:40])
        bits.append("record fields: %s" % str(ann)[:1200])
    return "- key %s\n    %s" % (v.get("key"), "\n    ".join(bits) or "nothing but a position")


if not given:
    out["error"] = "no variants given"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "ANTHROPIC_API_KEY is not set on the server"
else:
    works.msg("Looking up %d variant(s)…" % len(given))
    user = "Variants:\n" + "\n".join(describe(v) for v in given)
    try:
        try:
            import claude_usage as _cu
            _cu.bump("variant-dossier")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 8000, "system": SYSTEM,
                  "messages": [{"role": "user", "content": user}]},
            timeout=240,
        )
        if r.status_code != 200:
            out["error"] = "anthropic %s: %s" % (r.status_code, r.text[:300])
        else:
            data = r.json()
            body = "".join(b.get("text", "") for b in (data.get("content") or [])
                           if b.get("type") == "text")
            # A reply cut off at the token limit is JSON that never closed, and json.loads
            # says only "expecting ',' delimiter" -- which reads like a model that cannot
            # write JSON rather than an answer that ran out of room. Tell them apart.
            stop = str((data.get("stop_reason") or ""))
            m = re.search(r"\{.*\}", body, re.S)
            parsed = None
            if m:
                try:
                    parsed = json.loads(m.group(0))
                except Exception:
                    parsed = None
            if not isinstance(parsed, dict):
                out["error"] = ("the reply was cut off before it finished (too many variants "
                                "at once; select fewer)" if stop == "max_tokens"
                                else "could not read the reply: %s" % (body[:200] or "empty"))
            else:
                wanted = {str(v.get("key")): v for v in given}
                keep = []
                for e in (parsed.get("variants") or []):
                    if not isinstance(e, dict):
                        continue
                    k = str(e.get("key") or "")
                    if k not in wanted:
                        continue          # an entry for a variant nobody asked about
                    secs = []
                    for sec in (e.get("sections") or []):
                        if not isinstance(sec, dict):
                            continue
                        h = str(sec.get("heading") or "").strip()
                        t = str(sec.get("text") or "").strip()
                        if h and t:
                            secs.append({"heading": h, "text": t})
                    if secs:
                        keep.append({"key": k, "title": str(e.get("title") or k),
                                     "sections": secs})
                out["variants"] = json.dumps(keep)
                works.msg("%d of %d answered" % (len(keep), len(given)))
    except Exception as e:
        out["error"] = str(e)

works.resolve(out)
