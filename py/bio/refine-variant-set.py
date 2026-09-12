"""Too many mutations to draw at once -- which subset of them is the one being asked for?

A gene or a condition can carry hundreds of pathogenic records, and drawing all of them
answers a broader question than the one that was asked. The honest fix is to let the person
choose, but a list of two hundred variants is not a choice anyone can make. What they can
choose between is a handful of SUBSETS, and the useful part is knowing which subset the
condition is actually about.

So the counts are done here, from the records themselves, and the only thing asked of the
model is which of those subsets it would keep and why -- a recommendation over a list that
already exists, not a recall of variants. It cannot invent a gene, a classification or a
phenotype: it picks from what was counted, and anything it names that was not in the list
is dropped.

Params (after the EngineMonitor):
    param(1) : JSON {
        disease: "Cystic fibrosis",
        total: 412,
        genes:      [[symbol, count], ...],
        significances: [[label, count], ...],
        phenotypes: [[name, count], ...]
    }

Resolves:
    { ok, kind, values, why, note, error }
  kind    "gene" | "significance" | "phenotype" | ""   the axis to narrow on
  values  the values on that axis to KEEP, each one present in the list given
  why     one sentence, for the person choosing
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

out = {"ok": False, "kind": "", "values": "[]", "why": "", "note": "", "error": None}

SYSTEM = (
    "You are helping someone narrow a set of pathogenic ClinVar records before drawing them "
    "on a genome. They have been given the counts below. Choose ONE axis to narrow on and the "
    "values on it worth keeping.\n"
    "Reply with ONLY a JSON object: {\"kind\": \"gene\"|\"significance\"|\"phenotype\"|\"\", "
    "\"values\": [...], \"why\": \"one sentence\"}.\n"
    "Rules:\n"
    "- Every value MUST appear verbatim in the list you were given for that axis. Do not invent "
    "one, do not reword one, do not merge two.\n"
    "- Choose the axis that separates the condition being asked about from everything else the "
    "records happen to cover. A gene carrying almost all of the records with a handful of stray "
    "ones elsewhere is the clearest case: keep that gene.\n"
    "- 'why' is for the person choosing, in plain words, and says what is being left out as well "
    "as what is being kept. No more than 30 words.\n"
    "- If no subset is defensible -- the records really are all about the same thing -- return "
    "kind \"\" and empty values, and say so in 'why'. That is a real answer, not a failure."
)

raw = works.param(1)
if isinstance(raw, dict):
    req = raw
else:
    try:
        req = json.loads(str(raw or "{}"))
    except Exception:
        req = {}

disease = str(req.get("disease") or "").strip()
try:
    total = int(req.get("total") or 0)
except Exception:
    total = 0


def pairs(key):
    got = []
    for x in (req.get(key) or []):
        try:
            name, n = str(x[0]), int(x[1])
        except Exception:
            continue
        if name:
            got.append((name, n))
    return sorted(got, key=lambda kv: -kv[1])[:40]


genes = pairs("genes")
sigs = pairs("significances")
phen = pairs("phenotypes")

if not (genes or sigs or phen):
    out["error"] = "nothing to narrow"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "ANTHROPIC_API_KEY is not set on the server"
else:
    def block(title, got):
        if not got:
            return ""
        return title + ":\n" + "\n".join("- %s  [%d records]" % (a, b) for a, b in got) + "\n"

    ask = ("Asked for: %s\n%d pathogenic records in total.\n\n%s%s%s"
           % (disease or "(not named)", total, block("gene", genes),
              block("significance", sigs), block("phenotype", phen)))
    works.msg("Weighing %d records across %d gene(s)…" % (total, len(genes)))
    try:
        try:
            import claude_usage as _cu
            _cu.bump("refine-variant-set")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 700, "system": SYSTEM,
                  "messages": [{"role": "user", "content": ask}]},
            timeout=120,
        )
        if r.status_code != 200:
            out["error"] = "the suggestion service answered %s" % r.status_code
        else:
            data = r.json()
            txt = "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text")
            m = re.search(r"\{.*\}", txt, re.S)
            got = None
            if m:
                try:
                    got = json.loads(m.group(0))
                except Exception:
                    got = None
            if not isinstance(got, dict):
                out["error"] = "the suggestion could not be read"
            else:
                kind = str(got.get("kind") or "").strip().lower()
                pool = {"gene": [a for a, _ in genes], "significance": [a for a, _ in sigs],
                        "phenotype": [a for a, _ in phen]}.get(kind, [])
                # ONLY WHAT WAS COUNTED. A value that is not in the list is a value that came
                # from somewhere other than these records, and filtering on it would silently
                # produce an empty set.
                vals = [str(v) for v in (got.get("values") or []) if str(v) in pool]
                dropped = len([v for v in (got.get("values") or []) if str(v) not in pool])
                if not vals:
                    kind = ""
                out["ok"] = True
                out["kind"] = kind
                out["values"] = json.dumps(vals)
                out["why"] = str(got.get("why") or "")[:400]
                if dropped:
                    out["note"] = "%d suggested value(s) were not among these records and were ignored." % dropped
                works.msg("Suggested: %s" % (", ".join(vals) if vals else "no narrowing"))
    except Exception as e:
        out["error"] = str(e)

works.resolve(out)
