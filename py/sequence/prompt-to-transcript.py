import json
import os
import re
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# Natural-language -> Ensembl transcript ids, resolved by Anthropic (Claude).
#
# Claude is asked to return the matching Ensembl transcript stable IDs directly
# (Ensembl REST resolution is unreliable / rate-limited in this deployment).
# The actual sequence + annotations for each id are loaded later by the client
# through the server's failsafe /transcript endpoint.
#
# Params (after the EngineMonitor):
#   param(1) : the user's natural-language prompt
#   param(2) : optional species override (e.g. "human", "mouse")
#
# Env (forwarded by the server into the spawned python process):
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL
# ---------------------------------------------------------------------------

prompt_text = works.param(1)
species_override = works.param(2)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5"

# Ensembl transcript stable id, any species prefix: ENST / ENSMUST / ENSRNOT ...
TRANSCRIPT_RE = re.compile(r"^ENS[A-Z]*T\d+$", re.I)


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


def anthropic_transcripts(text, species_hint):
    """Ask Claude to return real Ensembl transcript ids for the request.
    Returns (parsed_dict, error_string)."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if not text:
        return None, "empty prompt"

    system = (
        "You are a genomics assistant. Given a user's request, return the matching "
        "Ensembl transcript stable IDs. A single request may span MULTIPLE genes AND "
        "MULTIPLE species (e.g. 'load human, mouse and rat KRAS'). Respond with ONLY a "
        "JSON object, no prose:\n"
        "{\n"
        '  "transcripts": [\n'
        '    {"id": "ENST0000...", "gene": "KRAS", "species": "human", '
        '"biotype": "protein_coding", "canonical": true, "why": "short reason"},\n'
        '    {"id": "ENSMUST0000...", "gene": "Kras", "species": "mouse", '
        '"canonical": true, "why": "..."},\n'
        '    {"id": "ENSRNOT0000...", "gene": "Kras", "species": "rat", '
        '"canonical": true, "why": "..."}\n'
        "  ]\n"
        "}\n"
        "Rules: use REAL Ensembl transcript stable IDs with the CORRECT species prefix "
        "(ENST=human, ENSMUST=mouse, ENSRNOT=rat, and the appropriate prefix for other "
        "species). Return one entry per requested (gene, species) combination. TAG each "
        "transcript with its own gene and species. When the user asks for the canonical / "
        "main transcript, return the MANE Select (or Ensembl canonical) and set "
        "canonical=true; for 'all transcripts/isoforms' list the principal ones. If you "
        "are not confident of an exact ID, omit that one rather than guessing. Do not "
        "include version suffixes (no trailing .1)."
    )

    user = str(text)
    if species_hint:
        user += "\n\n(Species: %s)" % species_hint

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
                "max_tokens": 800,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=45,
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


# --- resolve via Anthropic ---------------------------------------------------
parsed, err = anthropic_transcripts(prompt_text, species_override)
works.progress(60)

results = []
gene = None
species = species_override or "human"

if parsed:
    gene = parsed.get("gene")
    species = species_override or parsed.get("species") or species
    for t in (parsed.get("transcripts") or []):
        tid = str(t.get("id") or "").split(".")[0].strip()
        if not TRANSCRIPT_RE.match(tid):
            continue
        # Keep each transcript's OWN species/gene so one prompt can span
        # multiple species (e.g. "human, mouse and rat KRAS").
        results.append({
            "id": tid.upper(),
            "gene": t.get("gene") or gene,
            "species": t.get("species") or species_override or parsed.get("species") or "human",
            "biotype": t.get("biotype"),
            "canonical": bool(t.get("canonical")),
            "why": t.get("why"),
        })

if not results and not err:
    err = "no valid transcript ids returned by the model"

works.progress(100)

works.resolve({
    "prompt": str(prompt_text or ""),
    "gene": gene,
    "species": species,
    "mode": "anthropic",
    "error": err,
    "count": len(results),
    "transcripts": json.dumps(results),
})
