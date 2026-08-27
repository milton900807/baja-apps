#!/usr/bin/env python3
"""
Extract genes, mutations, and ASOs from free text (mutation/ASO mapping mode).

Reads a block of pasted text, asks Claude to extract:
  - genes           : {symbol, species}
  - mutations       : {gene, species, id (rsID preferred), hgvs, protein, label, comment}
  - asos            : {name, sequence, target_gene, species, comment}
Then resolves every dbSNP rsID (and genomic-HGVS where given) through the Ensembl REST
API to authoritative coordinates so the client can map mutations onto the loaded tracks.

Invoked by the server:  python3 extract-entities.py jfile:<argsfile>
Ionworks params:
    param(1) : the pasted text
Emits IONWORKS:RESOLUTION with { genes, mutations, asos, error }.
"""
import json
import os
import re
import time

from ion import works  # type: ignore

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-4-5"

ENSEMBL_SPECIES = {
    "human": "homo_sapiens",
    "mouse": "mus_musculus",
    "rat": "rattus_norvegicus",
    "dog": "canis_lupus_familiaris",
}
ENSEMBL_REST = "https://rest.ensembl.org"

text = works.param(1) or ""
works.progress(8)


def ask_claude(text):
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if requests is None:
        return None, "python 'requests' is not available on the server"

    system = (
        "You are a biomedical text-mining expert. Read the user's text and extract three "
        "kinds of entities. Return ONLY JSON, no prose:\n"
        "{\n"
        '  "genes":     [{"symbol":"...","species":"human|mouse|rat"}],\n'
        '  "mutations": [{"gene":"...","species":"human|mouse|rat","id":"rsID if known (e.g. '
        'rs121913529), else ClinVar/COSMIC id or empty","hgvs":"full HGVS if given (e.g. '
        'NM_..:c.35G>A or 12:g.25245350C>T), else empty","protein":"p.XxxNNNYyy if given, else '
        'empty","label":"short label e.g. KRAS G12D","comment":"one sentence of context"}],\n'
        '  "asos":      [{"name":"name/id if given else empty","sequence":"the oligo bases '
        '5\'->3\' using only A/C/G/T/U (strip chemistry/modifications)","target_gene":"...",'
        '"species":"human|mouse|rat","comment":"one sentence of context"}]\n'
        "}\n"
        "Rules: Default species to human when not stated. For EVERY mutation, if you recognise "
        "the variant, ALWAYS fill in its dbSNP rsID in the id field (this is used to look up its "
        "exact coordinates). Include the gene symbol on each mutation and each ASO's target "
        "gene. An ASO (antisense oligonucleotide / gapmer / siRNA guide) is a short (~15-25 nt) "
        "nucleotide sequence given as a drug/probe; extract its base sequence only. Deduplicate. "
        "If a category has no entries return an empty array."
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
                "max_tokens": 4000,
                "system": system,
                "messages": [{"role": "user", "content": text[:120000]}],
            },
            timeout=150,
        )
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, r.text[:300])
        data = r.json()
        parts = data.get("content", []) or []
        txt = "".join(b.get("text", "") for b in parts if b.get("type") == "text")
        m = re.search(r"\{.*\}", txt, re.S)
        return (json.loads(m.group(0)) if m else {}), None
    except Exception as ex:
        return None, str(ex)


def _pick_primary_mapping(maps):
    for m in maps:
        srn = str(m.get("seq_region_name", ""))
        if m.get("coord_system") == "chromosome" and "_" not in srn and "." not in srn:
            return m
    return maps[0] if maps else None


def resolve_rsid(species, rsid):
    if requests is None:
        return None
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    try:
        r = requests.get("%s/variation/%s/%s" % (ENSEMBL_REST, sp, rsid),
                         headers={"content-type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None
        best = _pick_primary_mapping((r.json() or {}).get("mappings") or [])
    except Exception:
        return None
    if not best:
        return None
    try:
        return {"chr": str(best.get("seq_region_name", "")),
                "start": int(best.get("start")), "end": int(best.get("end"))}
    except Exception:
        return None


def _ensembl_get(url, timeout=30, tries=4):
    """GET with retry/backoff — Ensembl 429/503-rate-limits bursts, and we make several
    calls per mutation (rsID, then gene overlap), so the second call must survive a throttle."""
    if requests is None:
        return None
    for i in range(tries):
        try:
            r = requests.get(url, headers={"content-type": "application/json"}, timeout=timeout)
        except Exception:
            time.sleep(0.6 * (i + 1))
            continue
        if r.status_code == 200:
            return r
        if r.status_code in (429, 503):
            wait = 1.0
            try:
                wait = float(r.headers.get("Retry-After", "1")) or 1.0
            except Exception:
                wait = 1.0
            time.sleep(min(6.0, wait) + 0.4 * i)
            continue
        return None
    return None


def resolve_gene_at(species, chrom, start, end):
    """The authoritative gene symbol overlapping a resolved locus (so the client loads the
    gene that actually contains the mutation, not whatever name the text happened to use)."""
    if not chrom:
        return None
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    r = _ensembl_get("%s/overlap/region/%s/%s:%d-%d?feature=gene"
                     % (ENSEMBL_REST, sp, chrom, int(start), int(end)))
    if r is None:
        return None
    try:
        genes = r.json() or []
    except Exception:
        return None
    if not genes:
        return None
    pt = int(start)

    def contains(g):
        try:
            return int(g.get("start")) <= pt <= int(g.get("end"))
        except Exception:
            return False

    def span(g):
        try:
            return int(g.get("end")) - int(g.get("start"))
        except Exception:
            return 10 ** 12

    # Prefer a protein-coding gene that actually contains the point; then smallest span.
    pool = [g for g in genes if contains(g)] or genes
    coding = [g for g in pool if g.get("biotype") == "protein_coding"]
    pool = sorted(coding or pool, key=span)
    for g in pool:
        name = g.get("external_name") or g.get("gene_id")
        if name:
            return str(name)
    return None


def resolve_transcript(species, symbol):
    """The REAL canonical Ensembl transcript id for a gene symbol, from Ensembl itself.
    Claude fabricates plausible-but-wrong stable ids that then fail to load, so the second
    step ('convert genetic info -> Ensembl ids') must be authoritative, not model-generated."""
    if not symbol:
        return None
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    from urllib.parse import quote
    r = _ensembl_get("%s/lookup/symbol/%s/%s?expand=1" % (ENSEMBL_REST, sp, quote(str(symbol), safe="")))
    if r is None:
        return None
    try:
        d = r.json() or {}
    except Exception:
        return None
    tx = d.get("Transcript") or []
    if not tx:
        return None
    canon = [t for t in tx if t.get("is_canonical")]
    t = (canon or tx)[0]
    tid = str(t.get("id") or "").split(".")[0].strip()
    return tid or None


def resolve_gene_transcripts(genes, mutations, asos):
    """Step 2: every distinct (gene, species) -> its real Ensembl transcript id, so the
    client can load the tracks directly instead of relying on model-guessed ids."""
    want = {}
    def add(sym, sp):
        if sym:
            want.setdefault((("" + sym).lower(), ("" + (sp or "human")).lower()),
                            {"gene": sym, "species": sp or "human"})
    for g in genes:
        add(g.get("symbol"), g.get("species"))
    for m in mutations:
        add(m.get("gene"), m.get("species"))
    for a in asos:
        add(a.get("target_gene"), a.get("species"))
    out = []
    for v in want.values():
        tid = resolve_transcript(v["species"], v["gene"])
        if tid:
            out.append({"gene": v["gene"], "species": v["species"], "id": tid})
    return out


def resolve_hgvs(species, hgvs):
    """Best-effort: resolve a full HGVS descriptor via the Ensembl VEP endpoint."""
    if requests is None or ":" not in hgvs:
        return None
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    try:
        from urllib.parse import quote
        r = requests.get("%s/vep/%s/hgvs/%s" % (ENSEMBL_REST, sp, quote(hgvs, safe="")),
                         headers={"content-type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None
        arr = r.json() or []
        if not arr:
            return None
        o = arr[0]
        return {"chr": str(o.get("seq_region_name", "")),
                "start": int(o.get("start")), "end": int(o.get("end"))}
    except Exception:
        return None


obj, err = ask_claude(text)
works.progress(45)
if obj is None:
    works.progress(100)
    works.resolve({"genes": [], "mutations": [], "asos": [], "error": err})
else:
    genes = obj.get("genes", []) or []
    mutations = obj.get("mutations", []) or []
    asos = obj.get("asos", []) or []

    # Resolve mutation coordinates (rsID first, then genomic HGVS).
    total = max(1, len(mutations))
    for i, mut in enumerate(mutations):
        mut["resolved"] = False
        sp = mut.get("species") or "human"
        loc = None
        rid = re.search(r"rs\d+", "" + (mut.get("id") or ""), re.I)
        if rid:
            loc = resolve_rsid(sp, rid.group(0).lower())
        if not loc and mut.get("hgvs"):
            loc = resolve_hgvs(sp, "" + mut["hgvs"])
        if loc and loc.get("start"):
            mut["chr"] = loc["chr"]
            mut["start"] = loc["start"]
            mut["end"] = loc["end"] if loc["end"] and loc["end"] >= loc["start"] else loc["start"] + 1
            mut["resolved"] = True
            # Backfill/override the gene from the resolved locus so the loaded track always
            # contains the mutation (fixes empty or mismatched gene names in the source).
            gsym = resolve_gene_at(sp, mut["chr"], mut["start"], mut["end"])
            if gsym:
                mut["gene"] = gsym
        works.progress(45 + int(50.0 * (i + 1) / total))

    # Step 2: convert the extracted genes into REAL Ensembl transcript ids to load.
    works.progress(95)
    gene_transcripts = resolve_gene_transcripts(genes, mutations, asos)

    works.progress(100)
    works.resolve({"genes": genes, "mutations": mutations, "asos": asos,
                   "geneTranscripts": gene_transcripts, "error": err})
