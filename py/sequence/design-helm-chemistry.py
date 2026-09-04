import json
import os
import re
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# HELM chemistry design assistant (Anthropic / ).
#
# Given an oligonucleotide's HELM string, the monomer library available in the
# editor, and a natural-language request,  returns a MODIFIED HELM string
# so the user can restyle the chemistry (sugars, linkers, modifications) while
# keeping to monomers that actually exist in the library.
#
# Params (after the EngineMonitor at param(0)):
#   param(1) : the current HELM string (may be empty)
#   param(2) : the user's natural-language prompt
#   param(3) : JSON array (or {monomers:[...]}) of available monomers
#   param(4) : the oligo's raw base sequence, 5'->3' (optional) -- grounds the model when
#              the HELM is empty or doesn't need to be trusted for the base order; the HELM
#              itself always still wins when both are present and disagree, since HELM is
#              the thing actually being edited.
#   param(5) : JSON object of the oligo's other properties (optional) -- name, id, type,
#              strand, length, target gene and so on. Context only: it lets a request like
#              "make the antisense strand a gapmer" or "use siRNA chemistry" resolve against
#              what this compound actually IS, without the model having to guess from the
#              sequence alone.
#
# Env (forwarded by the server into the spawned python process):
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL
# ---------------------------------------------------------------------------

helm_text = works.param(1)
prompt_text = works.param(2)
monomers_json = works.param(3)
sequence_text = works.param(4)
properties_json = works.param(5)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-haiku-4-5"


def parse_monomers(txt):
    """Return a compact list of {symbol,name,polymerType,monomerType,naturalAnalog}."""
    out = []
    try:
        m = json.loads(txt) if txt else []
        if isinstance(m, dict):
            m = m.get("monomers", []) or []
        for x in (m or []):
            if isinstance(x, dict) and x.get("symbol"):
                out.append({
                    "symbol": x.get("symbol"),
                    "name": x.get("name"),
                    "polymerType": x.get("polymerType"),
                    "monomerType": x.get("monomerType"),
                    "naturalAnalog": x.get("naturalAnalog"),
                })
    except Exception:
        pass
    return out


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


def summarize_properties(txt):
    """A short 'key: value' block of an oligo's own properties, for context. Only simple
    scalar values -- nested objects/arrays are the app's internal bookkeeping (render state,
    off-target hit lists) and would bury the useful fields."""
    try:
        p = json.loads(txt) if txt else None
    except Exception:
        return ""
    if not isinstance(p, dict):
        return ""
    lines = []
    for k, v in p.items():
        if v is None or isinstance(v, (dict, list)):
            continue
        s = str(v)
        if not s or s in ("NaN", "undefined"):
            continue
        lines.append("%s: %s" % (k, s[:120]))
    return "\n".join(lines[:25])


def design(helm, prompt, mons, sequence=None, properties=None):
    """Modify the chemistry. Returns (parsed_dict, error_string)."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if not prompt:
        return None, "empty prompt"
    if not helm and not sequence:
        return None, "no HELM and no base sequence -- nothing to build chemistry onto"

    symbols = ", ".join(sorted({str(x["symbol"]) for x in mons if x.get("symbol")}))

    system = (
        "You are an expert oligonucleotide medicinal chemist working in HELM notation. "
        "You are given the current HELM string for an oligonucleotide (or peptide), "
        "optionally its raw base sequence, and the list of monomer symbols available in the "
        "editor's library. Modify the chemistry to satisfy the user's request.\n"
        "Rules:\n"
        "- Return a SINGLE valid HELM string of the form RNA1{...}$$$$ (or with connections "
        "for a duplex).\n"
        "- Use ONLY monomer symbols that appear in the provided library list.\n"
        "- NEVER change the base sequence. The bases (the letters inside the parentheses, "
        "e.g. the A in m(A)) must come out in exactly the same order, and the same count, as "
        "they went in. Change ONLY the sugars, linkers and modifications around them. This "
        "holds even if the user's request seems to ask for a different sequence -- in that "
        "case keep the bases and say so in notes. If the HELM is empty but a base sequence is "
        "given, build the HELM from that sequence, unchanged.\n"
        "- The base sequence, when given, is the source of truth for base order -- if it "
        "disagrees with the HELM's own bases, follow the sequence.\n"
        "- HELM syntax: each nucleotide is sugar(base) plus an optional trailing linker, e.g. "
        "m(A)[sp] or d(T)p. Multi-character monomer symbols MUST be wrapped in square brackets "
        "(e.g. [moe], [fl2r], [sp], [lna], [cet]); single-character symbols (m, d, r, p, A, C, "
        "G, T, U) are written bare.\n"
        "- The LINKER is that trailing token and you must actually write it. A "
        "phosphorothioate backbone is [sp] on every linkage (d(A)[sp].d(C)[sp]...), a normal "
        "phosphate is p. If the request asks for phosphorothioate, or PS, or a stabilised "
        "backbone, put [sp] between every residue -- do not leave p in place and mention the "
        "change in notes instead. The last residue in a strand carries no trailing linker.\n"
        "Respond with ONLY a JSON object, no prose:\n"
        '{"helm": "<the new HELM string>", "notes": "<one short line describing what changed>"}'
    )

    props = summarize_properties(properties)
    user = (
        "Current HELM:\n" + str(helm or "(empty)") +
        (("\n\nBase sequence (5'->3'), which must not change:\n" + str(sequence)) if sequence else "") +
        (("\n\nThis compound's properties:\n" + props) if props else "") +
        "\n\nAvailable monomer symbols:\n" + (symbols or "(none provided)") +
        "\n\nRequest:\n" + str(prompt)
    )

    try:
        try:
            import claude_usage as _cu; _cu.bump("design-helm-chemistry")
        except Exception:
            pass
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 1500,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=60,
        )
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        parts = data.get("content", []) or []
        txt = "".join(b.get("text", "") for b in parts if b.get("type") == "text")
        parsed = parse_json_blob(txt)
        if not parsed:
            return None, "could not parse model output: %s" % (txt[:200] or "empty")
        return parsed, None
    except Exception as e:
        return None, str(e)


def helm_bases(helm):
    """The bases of a HELM string, in order -- everything inside each (...) pair. Same
    reading baja/chem/biopolymer.js's Biopolymer.getSequence() does on the client."""
    return "".join(re.findall(r"\(([^)]*)\)", helm or "")).upper()


mons = parse_monomers(monomers_json)
works.progress(40)
parsed, err = design(helm_text, prompt_text, mons, sequence_text, properties_json)
works.progress(100)

result_helm = (parsed or {}).get("helm") if parsed else None
if not result_helm and not err:
    err = "no HELM returned by the model"

# Sequence preservation is CHECKED, not just requested. The system prompt forbids changing
# the bases, but a model that does it anyway would silently hand back a different compound
# wearing the same name -- so the bases that came out are compared against the bases that
# went in (the caller's sequence when given, else the original HELM's own), and a mismatch
# is reported as an error with the new HELM withheld rather than applied.
if result_helm and not err:
    want = ("" + (sequence_text or "")).upper().replace("U", "T") or helm_bases(helm_text).replace("U", "T")
    got = helm_bases(result_helm).replace("U", "T")
    if want and got and want != got:
        err = ("the model changed the base sequence (%s -> %s) -- chemistry not applied"
               % (want[:40], got[:40]))
        result_helm = ""

works.resolve({
    "helm": result_helm or "",
    "notes": ((parsed or {}).get("notes") if parsed else "") or "",
    "error": err,
    "prompt": str(prompt_text or ""),
})
