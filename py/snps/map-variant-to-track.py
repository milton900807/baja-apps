import json
import os
import re

# Match a PROTEIN-LEVEL variant (e.g. "R521C variant with weakness of neck and proximal
# limb muscles") that did NOT resolve to a genomic position to the best-fitting gene/track
# already loaded on the canvas, and parse its protein-level change. The caller then places
# the variant on that track via residue -> codon genomic coordinate (track.getCDS().codonPos).
#
#   let r = await exec('py/snps/map-variant-to-track.py', JSON.stringify(mutInfo), JSON.stringify(tracks))
#   // r = { matched, gene, track_name, residue, ref_aa, alt_aa, kind, confidence, reason }
#
# Params:
#   param(1): mutation info as a JSON string { label, id, hgvs, protein, gene, comment, species }
#   param(2): loaded tracks as a JSON string [ { gene, name, transcriptID, proteinLength }, ... ]

from ion import works

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-haiku-4-5"

mut_raw = works.param(1)
tracks_raw = works.param(2)


def _load(x, default):
    try:
        v = json.loads(x) if isinstance(x, str) else x
        return v if v is not None else default
    except Exception:
        return default


mut = _load(mut_raw, {}) or {}
tracks = _load(tracks_raw, []) or []
if not isinstance(mut, dict):
    mut = {}
if not isinstance(tracks, list):
    tracks = []

label = str(mut.get("label") or "").strip()
hgvs = str(mut.get("hgvs") or "").strip()
protein = str(mut.get("protein") or "").strip()
gene_hint = str(mut.get("gene") or "").strip()
comment = str(mut.get("comment") or "").strip()
species = str(mut.get("species") or "human").strip() or "human"

# One-line-per-track menu the model must choose from (by exact gene symbol).
track_lines = []
gene_set = []
for t in tracks:
    if not isinstance(t, dict):
        continue
    g = str(t.get("gene") or "").strip()
    nm = str(t.get("name") or g).strip()
    plen = t.get("proteinLength")
    gene_set.append(g)
    track_lines.append(
        "- gene: %s | track: %s | protein length: %s aa"
        % (g or "?", nm or "?", (str(plen) if plen else "unknown"))
    )
track_menu = "\n".join(track_lines) if track_lines else "(no tracks loaded)"

variant_lines = []
if label:
    variant_lines.append("Description: %s" % label)
if hgvs:
    variant_lines.append("HGVS: %s" % hgvs)
if protein and protein != hgvs:
    variant_lines.append("Protein change: %s" % protein)
if gene_hint:
    variant_lines.append("Gene hint (may be missing or wrong): %s" % gene_hint)
if comment:
    variant_lines.append("Notes: %s" % comment)
variant_lines.append("Species: %s" % species)
variant_block = "\n".join(variant_lines)

prompt = (
    "You are a clinical genomics assistant. A protein-level sequence variant could not be "
    "mapped to a genomic coordinate automatically. Using your knowledge of the variant and "
    "the gene(s) it is classically reported in, decide which of the ALREADY-LOADED gene "
    "tracks below it belongs to, and parse its protein-level change.\n\n"
    "VARIANT:\n" + variant_block + "\n\n"
    "LOADED TRACKS (choose the single best match by its exact gene symbol):\n"
    + track_menu + "\n\n"
    "Rules:\n"
    "- Pick the gene whose canonical protein carries this residue change. For example, the "
    "ALS variant R521C is in the FUS gene; SOD1 A4V is in SOD1.\n"
    "- residue = the 1-based amino-acid position (e.g. R521C -> 521).\n"
    "- ref_aa / alt_aa = single-letter amino acids where applicable (R521C -> R / C). Use "
    "\"*\" for a stop (nonsense) alt.\n"
    "- kind = one of: substitution, nonsense, frameshift, deletion, insertion, other.\n"
    "- Only set matched=true if you are confident the residue lands within the chosen "
    "gene's protein (residue <= its protein length when known). If none of the loaded tracks "
    "is a plausible home for this variant, set matched=false.\n\n"
    "Respond with ONLY a JSON object, no prose, of exactly this shape:\n"
    "{\"matched\": true/false, \"gene\": \"SYMBOL\", \"track_name\": \"...\", "
    "\"residue\": <int>, \"ref_aa\": \"X\", \"alt_aa\": \"Y\", "
    "\"kind\": \"substitution\", \"confidence\": 0.0-1.0, \"reason\": \"one short sentence\"}"
)

out = {
    "matched": False,
    "gene": "",
    "track_name": "",
    "residue": 0,
    "ref_aa": "",
    "alt_aa": "",
    "kind": "",
    "confidence": 0.0,
    "reason": "",
    "error": None,
}

err = None
raw_text = ""

if not requests:
    err = "requests unavailable on server python"
elif not ANTHROPIC_API_KEY:
    err = "ANTHROPIC_API_KEY is not set on the server"
elif not track_lines:
    err = "no loaded tracks to match against"
else:
    try:
        try:
            import claude_usage as _cu; _cu.bump("map-variant-to-track")
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
                "max_tokens": 400,
                "temperature": 0,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=45,
        )
        if r.status_code == 200:
            data = r.json()
            parts = data.get("content") or []
            raw_text = "".join(
                p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text"
            ).strip()
        else:
            err = "anthropic %s: %s" % (r.status_code, r.text[:200])
    except Exception as e:
        err = str(e)

# Pull the JSON object out of the reply (tolerate stray prose / code fences).
parsed = None
if raw_text:
    try:
        parsed = json.loads(raw_text)
    except Exception:
        m = re.search(r"\{.*\}", raw_text, re.S)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except Exception:
                parsed = None

if isinstance(parsed, dict):
    try:
        out["matched"] = bool(parsed.get("matched"))
        out["gene"] = str(parsed.get("gene") or "").strip()
        out["track_name"] = str(parsed.get("track_name") or "").strip()
        res = parsed.get("residue")
        try:
            out["residue"] = int(float(res)) if res is not None and str(res) != "" else 0
        except Exception:
            out["residue"] = 0
        out["ref_aa"] = str(parsed.get("ref_aa") or "").strip()[:1]
        out["alt_aa"] = str(parsed.get("alt_aa") or "").strip()[:1]
        out["kind"] = str(parsed.get("kind") or "").strip().lower()
        try:
            out["confidence"] = float(parsed.get("confidence") or 0)
        except Exception:
            out["confidence"] = 0.0
        out["reason"] = str(parsed.get("reason") or "").strip()
    except Exception as e:
        err = err or str(e)

# Only trust a match that names a gene actually on the canvas and gives a real residue.
if out["matched"]:
    known = set(g.upper() for g in gene_set if g)
    if out["residue"] < 1 or (known and out["gene"].upper() not in known):
        out["matched"] = False

# Regex fallback for the residue if the model gave a gene but no position.
if out["matched"] and out["residue"] < 1:
    mm = re.search(r"([A-Za-z])\s*(\d{1,5})\s*([A-Za-z\*])", label + " " + hgvs + " " + protein)
    if mm:
        out["residue"] = int(mm.group(2))
        if not out["ref_aa"]:
            out["ref_aa"] = mm.group(1).upper()
        if not out["alt_aa"]:
            out["alt_aa"] = mm.group(3).upper()
    else:
        out["matched"] = False

out["error"] = err
works.resolve(out)
