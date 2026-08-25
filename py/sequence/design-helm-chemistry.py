import json
import os
import re
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# HELM chemistry design assistant (Anthropic / Claude).
#
# Given an oligonucleotide's HELM string, the monomer library available in the
# editor, and a natural-language request, Claude returns a MODIFIED HELM string
# so the user can restyle the chemistry (sugars, linkers, modifications) while
# keeping to monomers that actually exist in the library.
#
# Params (after the EngineMonitor at param(0)):
#   param(1) : the current HELM string
#   param(2) : the user's natural-language prompt
#   param(3) : JSON array (or {monomers:[...]}) of available monomers
#
# Env (forwarded by the server into the spawned python process):
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL
# ---------------------------------------------------------------------------

helm_text = works.param(1)
prompt_text = works.param(2)
monomers_json = works.param(3)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5"


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


def design(helm, prompt, mons):
    """Modify the chemistry. Returns (parsed_dict, error_string)."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if not prompt:
        return None, "empty prompt"

    symbols = ", ".join(sorted({str(x["symbol"]) for x in mons if x.get("symbol")}))

    system = (
        "You are an expert oligonucleotide medicinal chemist working in HELM notation. "
        "You are given the current HELM string for an oligonucleotide (or peptide) and the "
        "list of monomer symbols available in the editor's library. Modify the chemistry to "
        "satisfy the user's request.\n"
        "Rules:\n"
        "- Return a SINGLE valid HELM string of the form RNA1{...}$$$$ (or with connections "
        "for a duplex).\n"
        "- Use ONLY monomer symbols that appear in the provided library list.\n"
        "- Preserve the base sequence unless the user explicitly asks to change it; change "
        "only sugars, linkers and modifications as requested.\n"
        "- HELM syntax: each nucleotide is sugar(base) plus an optional trailing linker, e.g. "
        "m(A)[sp] or d(T)p. Multi-character monomer symbols MUST be wrapped in square brackets "
        "(e.g. [moe], [fl2r], [sp]); single-character symbols (m, d, r, p, A, C, G, T, U) are "
        "written bare.\n"
        "Respond with ONLY a JSON object, no prose:\n"
        '{"helm": "<the new HELM string>", "notes": "<one short line describing what changed>"}'
    )

    user = (
        "Current HELM:\n" + str(helm or "(empty)") +
        "\n\nAvailable monomer symbols:\n" + (symbols or "(none provided)") +
        "\n\nRequest:\n" + str(prompt)
    )

    try:
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


mons = parse_monomers(monomers_json)
works.progress(40)
parsed, err = design(helm_text, prompt_text, mons)
works.progress(100)

result_helm = (parsed or {}).get("helm") if parsed else None
if not result_helm and not err:
    err = "no HELM returned by the model"

works.resolve({
    "helm": result_helm or "",
    "notes": ((parsed or {}).get("notes") if parsed else "") or "",
    "error": err,
    "prompt": str(prompt_text or ""),
})
