import json
import os
import re
import sqlite3
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# Natural-language -> Ensembl transcript ids, resolved by Anthropic in TWO passes.
#
# Pass 1 asks only "which species, and which genes?" -- a small question a model
# answers reliably.
#
# Pass 2 then hands the model the REAL list of Ensembl transcript ids we hold for
# those genes in that species and asks it to choose. Every id it returns is
# checked against that list, so a hallucinated or retired id cannot reach the
# client. This is the point of the split: a model asked to recall a stable id from
# memory produces plausible, wrong ids, and the client only discovers that when
# the load comes back an empty shell.
#
# Candidate ids come from data already on this box:
#   human            genes.sqlite (GENCODE), which carries canonical_tx and MANE
#   other species    the off-target index contigs, which carry name + gene symbol
#
# When we hold no catalogue for the species (zebrafish, say) the original
# one-pass behaviour still runs, so nothing that worked before stops working.
#
# Params (after the EngineMonitor):
#   param(1) : the user's natural-language prompt
#   param(2) : optional species override (e.g. "human", "mouse")
#
# Env (forwarded by the server into the spawned python process):
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL, OFFTARGET_INDEX_DIR
# ---------------------------------------------------------------------------

prompt_text = works.param(1)
species_override = works.param(2)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-haiku-4-5"
INDEX_ROOT = (os.environ.get("OFFTARGET_INDEX_DIR") or "").strip()

# Ensembl transcript stable id, any species prefix: ENST / ENSMUST / ENSRNOT ...
TRANSCRIPT_RE = re.compile(r"^ENS[A-Z]*T\d+$", re.I)

MAX_CANDIDATES_PER_GENE = 40    # keeps the pass-2 prompt small; canonical goes first
MAX_GENES = 12

# Species -> the indexes whose contigs carry that species' transcripts. Order
# matters: the first index holding a symbol wins.
SPECIES_INDEX = {
    "human": ["human_all_transcripts", "human_cdna_all", "human_ncrna"],
    "mouse": ["mouse_cdna", "mouse_ncrna"],
    "rat": ["rat_cdna", "rat_ncrna"],
    "dog": ["dog_cdna"],
    "cynomolgus monkey": ["monkey_cyno_cdna"],
    "rhesus macaque": ["monkey_rhesus_cdna"],
}

SPECIES_ALIASES = {
    "homo sapiens": "human", "h. sapiens": "human", "hsa": "human", "hs": "human",
    "man": "human", "people": "human", "patient": "human",
    "mus musculus": "mouse", "m. musculus": "mouse", "mmu": "mouse", "murine": "mouse",
    "rattus norvegicus": "rat", "r. norvegicus": "rat", "rno": "rat",
    "canis familiaris": "dog", "canis lupus familiaris": "dog", "canine": "dog",
    "beagle": "dog", "cfa": "dog",
    "cynomolgus": "cynomolgus monkey", "cyno": "cynomolgus monkey",
    "macaca fascicularis": "cynomolgus monkey", "crab-eating macaque": "cynomolgus monkey",
    "long-tailed macaque": "cynomolgus monkey", "mfa": "cynomolgus monkey",
    "rhesus": "rhesus macaque", "rhesus monkey": "rhesus macaque",
    "macaca mulatta": "rhesus macaque", "mmu monkey": "rhesus macaque",
    # A bare "monkey"/"NHP" is nearly always the cyno in tox work.
    "monkey": "cynomolgus monkey", "macaque": "cynomolgus monkey",
    "nhp": "cynomolgus monkey", "non-human primate": "cynomolgus monkey",
}


def norm_species(s):
    s = re.sub(r"\s+", " ", ("" + (s or "")).strip().lower())
    if not s:
        return ""
    s = SPECIES_ALIASES.get(s, s)
    return s if s in SPECIES_INDEX else s


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


def ask(system, user, max_tokens=1200, tag="prompt-to-transcript"):
    """One Anthropic call. Returns (parsed_dict, error_string)."""
    if not requests:
        return None, "python 'requests' library unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    try:
        try:
            import claude_usage as _cu; _cu.bump(tag)
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
                "max_tokens": max_tokens,
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


# --- pass 1: which species, which genes? -------------------------------------
def ask_species_and_genes(text, hint):
    system = (
        "You are a genomics assistant. Read the request and say only WHICH SPECIES and "
        "WHICH GENES it refers to. Do not give transcript IDs. Respond with ONLY a JSON "
        "object, no prose:\n"
        '{"targets": [{"species": "human", "genes": ["KRAS", "TP53"]}, '
        '{"species": "mouse", "genes": ["Kras"]}]}\n'
        "Rules: use the common English species name (human, mouse, rat, dog, cynomolgus "
        "monkey, rhesus macaque, ...). One entry per species; a request may span several "
        "(e.g. 'load human, mouse and rat KRAS'). Write each gene in that species' own "
        "nomenclature: human symbols uppercase (KRAS), mouse and rat title case (Kras). "
        "If no species is stated, use human. If the request names a transcript ID rather "
        "than a gene, give the gene that ID belongs to if you know it, otherwise return "
        "an empty gene list."
    )
    user = str(text or "")
    if hint:
        user += "\n\n(Species: %s)" % hint
    return ask(system, user, max_tokens=500, tag="prompt-to-transcript:species")


# --- candidate catalogues ----------------------------------------------------
def genes_db_path():
    p = (os.environ.get("BAJASPLICE_GENES_DB") or "").strip()
    if p and os.path.exists(p):
        return p
    if INDEX_ROOT:
        # <reference_data>/offtarget_index -> <reference_data>/bajasplice/...
        ref = os.path.dirname(INDEX_ROOT.rstrip("/"))
        p = os.path.join(ref, "bajasplice", "data", "processed", "genes.sqlite")
        if os.path.exists(p):
            return p
    return ""


def human_candidates(symbols):
    """{SYMBOL: [{id, canonical}]} from GENCODE, canonical/MANE flagged and first."""
    db = genes_db_path()
    if not db or not symbols:
        return {}
    out = {}
    try:
        con = sqlite3.connect("file:%s?mode=ro" % db, uri=True)
        for sym in symbols:
            row = con.execute(
                "select canonical_tx from genes where name = ? collate nocase", (sym,)
            ).fetchone()
            canon = strip_version(row[0]) if row and row[0] else ""
            ids = []
            for (tid, mane) in con.execute(
                "select distinct transcript_id, max(mane) from exons where gene = ? "
                "collate nocase group by transcript_id", (sym,)
            ):
                t = strip_version(tid)
                if TRANSCRIPT_RE.match(t):
                    ids.append({"id": t, "canonical": bool(mane) or t == canon})
            if canon and not any(x["id"] == canon for x in ids):
                ids.insert(0, {"id": canon, "canonical": True})
            ids.sort(key=lambda x: (not x["canonical"], x["id"]))
            if ids:
                out[sym.upper()] = ids[:MAX_CANDIDATES_PER_GENE]
        con.close()
    except Exception:
        return out
    return out


def strip_version(v):
    return ("" + (v or "")).split(".")[0].strip().upper()


def index_candidates(species, symbols):
    """{SYMBOL: [{id, canonical}]} from the off-target index contigs for a species.

    The contigs carry no canonical flag, so the longest transcript is offered as
    the likely canonical -- a proxy, and labelled as one in the prompt."""
    names = SPECIES_INDEX.get(species) or []
    if not INDEX_ROOT or not names or not symbols:
        return {}
    want = set(s.upper() for s in symbols)
    found = {}
    for idx in names:
        f = os.path.join(INDEX_ROOT, idx, "contigs.json")
        if not os.path.exists(f):
            continue
        try:
            with open(f) as fh:
                contigs = json.load(fh)
        except Exception:
            continue
        for c in contigs:
            sym = ("" + (c.get("symbol") or "")).upper()
            if sym not in want:
                continue
            tid = strip_version(c.get("name"))
            if not TRANSCRIPT_RE.match(tid):
                continue
            found.setdefault(sym, {})[tid] = int(c.get("length") or 0)
        if len(found) >= len(want):
            break
    out = {}
    for sym, d in found.items():
        ids = sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))
        # No canonical flag exists in these contigs, so do not claim one. Longest
        # first is a weak hint only -- mouse Sod1's longest is not its canonical.
        out[sym] = [{"id": t, "canonical": False, "longest": (i == 0)}
                    for i, (t, _n) in enumerate(ids[:MAX_CANDIDATES_PER_GENE])]
    return out


def candidates_for(species, symbols):
    if species == "human":
        c = human_candidates(symbols)
        missing = [s for s in symbols if s.upper() not in c]
        if missing:
            c.update(index_candidates("human", missing))
        return c
    return index_candidates(species, symbols)


# --- pass 2: choose from the real list ---------------------------------------
def ask_choose(text, species, cand, exact_canonical):
    lines = []
    for sym, ids in cand.items():
        parts = []
        for x in ids:
            mark = " [canonical]" if x.get("canonical") else (" [longest]" if x.get("longest") else "")
            parts.append(x["id"] + mark)
        lines.append("%s: %s" % (sym, ", ".join(parts)))
    canon_note = (
        "Entries marked [canonical] are the MANE Select / Ensembl canonical transcript; "
        "prefer them."
        if exact_canonical else
        "No canonical flag is available for this species: [longest] marks only the longest "
        "transcript, which is often NOT the canonical one. Use your own knowledge of the "
        "species to choose from the list."
    )
    system = (
        "You are a genomics assistant choosing which transcripts to load. You are given "
        "the COMPLETE list of Ensembl transcript stable IDs available for each gene in "
        "this species. Respond with ONLY a JSON object, no prose:\n"
        '{"transcripts": [{"id": "ENST0000...", "gene": "KRAS", '
        '"canonical": true, "why": "short reason"}]}\n'
        "Rules: every id you return MUST appear verbatim in the candidate list below. "
        "Never invent, complete or correct an id. If the right transcript is not in the "
        "list, return nothing for that gene. " + canon_note + " Default to one canonical "
        "transcript per gene; return several only when the user asked for all isoforms or "
        "for a specific non-canonical one. Do not include version suffixes."
    )
    user = ("Request: %s\n\nSpecies: %s\n\nCandidate transcripts:\n%s"
            % (str(text or ""), species, "\n".join(lines)))
    return ask(system, user, max_tokens=1200, tag="prompt-to-transcript:choose")


def fallback_pick(cand):
    """Canonical of each gene, used when pass 2 fails or returns nothing usable."""
    out = []
    for sym, ids in cand.items():
        pick = next((x for x in ids if x.get("canonical")), ids[0] if ids else None)
        if not pick:
            continue
        known = bool(pick.get("canonical"))
        out.append({"id": pick["id"], "gene": sym, "canonical": known,
                    "why": ("canonical transcript for %s" % sym) if known
                           else ("longest transcript for %s; no canonical flag for this "
                                 "species" % sym)})
    return out


# --- legacy one-pass path (species we hold no catalogue for) -----------------
def ask_ids_directly(text, species_hint):
    system = (
        "You are a genomics assistant. Given a user's request, return the matching "
        "Ensembl transcript stable IDs. A single request may span MULTIPLE genes AND "
        "MULTIPLE species. Respond with ONLY a JSON object, no prose:\n"
        '{"transcripts": [{"id": "ENST0000...", "gene": "KRAS", "species": "human", '
        '"biotype": "protein_coding", "canonical": true, "why": "short reason"}]}\n'
        "Rules: use REAL Ensembl transcript stable IDs with the CORRECT species prefix "
        "(ENST=human, ENSMUST=mouse, ENSRNOT=rat, and the appropriate prefix for other "
        "species). Return one entry per requested (gene, species) combination. TAG each "
        "transcript with its own gene and species. When the user asks for the canonical / "
        "main transcript, return the MANE Select (or Ensembl canonical) and set "
        "canonical=true; for 'all transcripts/isoforms' list the principal ones. If you "
        "are not confident of an exact ID, omit that one rather than guessing. Do not "
        "include version suffixes (no trailing .1)."
    )
    user = str(text or "")
    if species_hint:
        user += "\n\n(Species: %s)" % species_hint
    return ask(system, user, max_tokens=800, tag="prompt-to-transcript:direct")


def collect_direct(parsed, species_hint):
    out = []
    if not parsed:
        return out
    for t in (parsed.get("transcripts") or []):
        tid = strip_version(t.get("id"))
        if not TRANSCRIPT_RE.match(tid):
            continue
        out.append({
            "id": tid, "gene": t.get("gene"),
            "species": t.get("species") or species_hint or "human",
            "biotype": t.get("biotype"), "canonical": bool(t.get("canonical")),
            "why": t.get("why"),
        })
    return out


# --- run ---------------------------------------------------------------------
override = norm_species(species_override)
errs = []
results = []
species_seen = []
genes_seen = []
mode = "anthropic-2pass"

if not prompt_text:
    errs.append("empty prompt")
    targets = []
else:
    step1, e1 = ask_species_and_genes(prompt_text, species_override)
    if e1:
        errs.append("species pass: %s" % e1)
    targets = (step1 or {}).get("targets") or []
    if not isinstance(targets, list):
        targets = []

works.progress(30)

for tgt in targets[:6]:
    if not isinstance(tgt, dict):
        continue
    sp = override or norm_species(tgt.get("species")) or "human"
    genes = [g for g in (tgt.get("genes") or []) if isinstance(g, str) and g.strip()]
    genes = [g.strip() for g in genes][:MAX_GENES]
    if sp not in species_seen:
        species_seen.append(sp)
    for g in genes:
        if g not in genes_seen:
            genes_seen.append(g)
    if not genes:
        continue

    cand = candidates_for(sp, genes)

    # Genes the catalogue does not hold (rat Kras carries no symbol in the index,
    # for one) still get the old unconstrained answer rather than vanishing.
    missing = [g for g in genes if g.upper() not in cand]
    if missing:
        q = "%s\n\nOnly these genes, in %s: %s" % (prompt_text, sp, ", ".join(missing))
        parsed, e = ask_ids_directly(q, sp)
        if e:
            errs.append("%s (%s): %s" % (sp, ", ".join(missing), e))
        got = [r for r in collect_direct(parsed, sp)]
        if got:
            mode = "anthropic-2pass+direct"
            results.extend(got)
        else:
            errs.append("%s: no transcript found for %s" % (sp, ", ".join(missing)))

    if not cand:
        continue

    allowed = {}
    for sym, ids in cand.items():
        for x in ids:
            allowed[x["id"]] = sym

    chosen, e2 = ask_choose(prompt_text, sp, cand, sp == "human" and bool(genes_db_path()))
    if e2:
        errs.append("%s choose pass: %s" % (sp, e2))

    picked = []
    for t in ((chosen or {}).get("transcripts") or []):
        tid = strip_version(t.get("id"))
        if tid not in allowed:
            continue                      # not in the catalogue -> refuse it
        picked.append({
            "id": tid, "gene": t.get("gene") or allowed[tid], "species": sp,
            "biotype": t.get("biotype"), "canonical": bool(t.get("canonical")),
            "why": t.get("why"),
        })

    if not picked:
        picked = [dict(p, species=sp, biotype=None) for p in fallback_pick(cand)]
        if picked:
            errs.append("%s: fell back to the canonical transcript of each gene" % sp)

    results.extend(picked)

# Nothing at all: one last unconstrained attempt, so a species we do not index
# or a prompt naming a retired id still resolves.
if not results and prompt_text:
    parsed, e = ask_ids_directly(prompt_text, species_override)
    if e:
        errs.append(e)
    results = collect_direct(parsed, override or species_override)
    if results:
        mode = "anthropic-direct"

works.progress(90)

# de-duplicate, keeping first occurrence
seen = set()
deduped = []
for r in results:
    k = (r["id"], (r.get("species") or "").lower())
    if k in seen:
        continue
    seen.add(k)
    deduped.append(r)
results = deduped

if not results and not errs:
    errs.append("no valid transcript ids returned by the model")

works.progress(100)

works.resolve({
    "prompt": str(prompt_text or ""),
    "gene": (genes_seen[0] if genes_seen else None),
    "genes": json.dumps(genes_seen),
    "species": (override or (species_seen[0] if species_seen else "human")),
    "mode": mode,
    "error": ("; ".join(errs) if errs else None),
    "count": len(results),
    "transcripts": json.dumps(results),
})
