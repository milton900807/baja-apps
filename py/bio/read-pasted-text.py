"""Someone pasted a page of text. What in it can be put on the board?

An abstract, a clinical report, a paragraph from a paper: prose that is not a sequence and is
not an identifier, but which names things this application can load -- transcripts, genes,
conditions, specific changes. This reads it and says what is in there. It loads nothing and
decides nothing; the caller shows the list and the user picks.

NOTHING IS INVENTED, AND THE CHECK IS MECHANICAL. Every transcript id and every mutation the
model returns must appear VERBATIM in the pasted text, or it is dropped here. A model reading
a CFTR paper will happily supply F508del from what it knows of CFTR rather than from what it
just read, and a list of things "found in your text" that were not in the text is worse than
a short list. Genes and diseases are allowed to be named rather than quoted -- "cystic
fibrosis" is a disease whether or not the paper spells out CFTR -- and are marked as inferred
when they do not appear.

Params (after the EngineMonitor):
    param(1) : the pasted text

Resolves:
    { ok, summary, transcripts, genes, diseases, mutations, note, error }
  where the four lists are JSON strings:
    transcripts [{"id": "ENST00000003084", "why": "..."}]
    genes       [{"symbol": "CFTR", "quoted": true, "why": "..."}]
    diseases    [{"name": "Cystic fibrosis", "quoted": true, "why": "..."}]
    mutations   [{"gene": "CFTR", "label": "F508del", "quoted": true, "why": "..."}]
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

MAX_CHARS = 40000        # a long paper's worth; the tail is rarely where the ids are
MAX_EACH = 12

# ENST/ENSMUST..., RefSeq NM_/NR_/XM_, with or without a version suffix.
TRANSCRIPT_RE = re.compile(r"^(?:ENS[A-Z]*T\d+|[NX][MR]_\d+)(?:\.\d+)?$", re.I)

text = str(works.param(1) or "")
out = {"ok": False, "summary": "", "transcripts": "[]", "genes": "[]", "diseases": "[]",
       "mutations": "[]", "note": "", "error": None}

SYSTEM = (
    "You read a piece of text someone pasted into a genome browser and say what in it can be "
    "loaded. Reply with ONLY a JSON object:\n"
    "{\n"
    '  "summary": "one sentence saying what this text is",\n'
    '  "transcripts": [{"id": "ENST00000003084", "why": "the transcript the paper reports"}],\n'
    '  "genes": [{"symbol": "CFTR", "why": "the gene under study"}],\n'
    '  "diseases": [{"name": "Cystic fibrosis", "why": "the condition described"}],\n'
    '  "mutations": [{"gene": "CFTR", "label": "F508del", "why": "the variant reported"}],\n'
    '  "note": "one short sentence, or empty"\n'
    "}\n"
    "Rules:\n"
    "- transcripts: Ensembl or RefSeq transcript identifiers that APPEAR IN THE TEXT. Do not "
    "supply an identifier you know for a gene the text names; only ones written there.\n"
    "- mutations: specific changes the text names -- F508del, p.Arg117His, c.1521_1523delCTT, "
    "G551D, rs113993960. Write the label as the TEXT writes it. Do not add well-known variants "
    "of a gene the text mentions but does not name a variant for.\n"
    "- genes: official HGNC symbols for the genes the text is about.\n"
    "- diseases: the conditions the text is about, named as a clinical record would name them.\n"
    "- At most 12 of each, most central first. Empty lists are a fine answer for a text that "
    "names none of these; say so in the note."
)


def parse_json_blob(txt):
    m = re.search(r"\{.*\}", txt or "", re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


if not text.strip():
    out["error"] = "nothing was pasted"
elif not requests:
    out["error"] = "python 'requests' library unavailable"
elif not ANTHROPIC_API_KEY:
    out["error"] = "ANTHROPIC_API_KEY is not set on the server"
else:
    clipped = text[:MAX_CHARS]
    works.msg("Reading %d characters…" % len(clipped))
    try:
        try:
            import claude_usage as _cu
            _cu.bump("read-pasted-text")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": 2000, "system": SYSTEM,
                  "messages": [{"role": "user", "content": clipped}]},
            timeout=180,
        )
        if r.status_code != 200:
            out["error"] = "anthropic %s: %s" % (r.status_code, r.text[:300])
        else:
            data = r.json()
            body = "".join(b.get("text", "") for b in (data.get("content") or [])
                           if b.get("type") == "text")
            got = parse_json_blob(body)
            if not isinstance(got, dict):
                out["error"] = "could not read the reply: %s" % (body[:200] or "empty")
            else:
                low = clipped.lower()

                def quoted(s):
                    s = ("" + str(s or "")).strip().lower()
                    return bool(s) and s in low

                transcripts = []
                for t in (got.get("transcripts") or [])[:MAX_EACH]:
                    tid = str((t or {}).get("id") or "").strip()
                    # Format first, then presence. An id that is not in the text is one the
                    # model remembered, and this is a reader, not a recall exercise.
                    if not TRANSCRIPT_RE.match(tid) or not quoted(tid):
                        continue
                    transcripts.append({"id": tid.upper(), "why": str(t.get("why") or "")})

                mutations = []
                for m in (got.get("mutations") or [])[:MAX_EACH]:
                    lab = str((m or {}).get("label") or "").strip()
                    if not lab or not quoted(lab):
                        continue
                    mutations.append({"gene": str(m.get("gene") or "").strip().upper(),
                                      "label": lab, "quoted": True,
                                      "why": str(m.get("why") or "")})

                genes = []
                for g in (got.get("genes") or [])[:MAX_EACH]:
                    sym = str((g or {}).get("symbol") or "").strip().upper()
                    if not sym:
                        continue
                    genes.append({"symbol": sym, "quoted": quoted(sym),
                                  "why": str(g.get("why") or "")})

                diseases = []
                for d in (got.get("diseases") or [])[:MAX_EACH]:
                    nm = str((d or {}).get("name") or "").strip()
                    if not nm:
                        continue
                    diseases.append({"name": nm, "quoted": quoted(nm),
                                     "why": str(d.get("why") or "")})

                out["ok"] = bool(transcripts or genes or diseases or mutations)
                out["summary"] = str(got.get("summary") or "")
                out["note"] = str(got.get("note") or "")
                out["transcripts"] = json.dumps(transcripts)
                out["genes"] = json.dumps(genes)
                out["diseases"] = json.dumps(diseases)
                out["mutations"] = json.dumps(mutations)
                works.msg("%d transcript(s), %d gene(s), %d disease(s), %d mutation(s)"
                          % (len(transcripts), len(genes), len(diseases), len(mutations)))
    except Exception as e:
        out["error"] = str(e)

works.resolve(out)
