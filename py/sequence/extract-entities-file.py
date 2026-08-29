#!/usr/bin/env python3
"""
Extract genes, mutations, and ASOs from an UPLOADED FILE (PDF, image, or text).

Same contract/output as extract-entities.py, but the input is a base64 file plus its
MIME type, sent to  as the appropriate content block:
  - application/pdf  -> a "document" block ( reads the PDF natively)
  - image/*          -> an "image" block ( reads the figure/scan/screenshot)
  - text/*  (or fallthrough) -> the decoded text

Then resolves every dbSNP rsID (and genomic-HGVS where given) through the Ensembl REST
API to authoritative coordinates so the client can map mutations onto the loaded tracks.

Invoked by the server:  python3 extract-entities-file.py jfile:<argsfile>
Ionworks params:
    param(1) : base64-encoded file bytes
    param(2) : MIME type (e.g. application/pdf, image/png, text/plain)
    param(3) : file name (optional, for context)
Emits IONWORKS:RESOLUTION with { genes, mutations, asos, error }.
"""
import base64
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

from ion import works  # type: ignore

try:
    import requests
except Exception:
    requests = None

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
# Document reading uses a small/fast model by default (latency here is dominated by
# ingesting the file, and the output is a tiny JSON) — override with EXTRACT_MODEL for a
# more capable model on dense manuscripts.
EXTRACT_MODEL = os.environ.get("EXTRACT_MODEL") or "claude-haiku-4-5"

ENSEMBL_SPECIES = {
    "human": "homo_sapiens",
    "mouse": "mus_musculus",
    "rat": "rattus_norvegicus",
    "dog": "canis_lupus_familiaris",
}
ENSEMBL_REST = "https://rest.ensembl.org"

IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")

b64 = works.param(1) or ""
mime = ("" + (works.param(2) or "")).strip().lower()
fname = works.param(3) or ""
works.progress(6)

SYSTEM = (
    "You are a biomedical variant-curation expert. Read the ENTIRE document/image/text — "
    "abstract, results, tables, figure legends, and any variant lists — and extract EVERY "
    "gene and EVERY sequence variant/mutation you can find. Be exhaustive with mutations: "
    "do not omit any. Return ONLY JSON, no prose:\n"
    "{\n"
    '  "genes":     [{"symbol":"...","species":"human|mouse|rat"}],\n'
    '  "mutations": [{"gene":"...","species":"human|mouse|rat","id":"dbSNP rsID if known else '
    'empty","hgvs":"the CODING or genomic HGVS change if given — e.g. c.575A>G or c.3319-1G>A '
    'or 12:g.25245350C>T. Put c./n./g. notation HERE (not in protein). Empty only if none '
    'given","protein":"protein change if given, e.g. p.Tyr192Cys or p.Trp702Ter, else empty",'
    '"label":"short label e.g. ATL3 Y192C","comment":"one sentence of context"}],\n'
    '  "asos":      [{"name":"name/id if given else empty","sequence":"the oligo bases '
    '5\'->3\' using only A/C/G/T/U (strip chemistry/modifications)","target_gene":"...",'
    '"species":"human|mouse|rat","comment":"one sentence of context"}],\n'
    '  "title":     "the article/manuscript title if this document is a paper, else empty"\n'
    "}\n"
    "MUTATION RULES (important): Find them ALL — substitutions (c.529A>G, p.Asn177Asp), "
    "nonsense/stop (p.Trp702Ter, c.2908G>T), splice-site (c.3319-1G>A), deletions (del), "
    "insertions (ins), duplications (dup). A variant is often written as "
    "'GENE (c.###; p.(Xaa###Yaa))' — create ONE mutation entry per distinct variant, with its "
    "coding change in hgvs and its protein change in protein. NEVER leave hgvs empty when a "
    "c./n./g. change is given. A synonymous coding change does NOT change the protein — there is "
    "no such thing as a protein-level synonymous variant, so leave protein EMPTY for a synonymous "
    "change (its c. change still goes in hgvs). Put the gene symbol on every mutation; add the dbSNP rsID if "
    "you know it. An ASO (antisense oligonucleotide / gapmer / siRNA guide) is a short "
    "(~15-25 nt) nucleotide drug/probe — extract its base sequence only. Default species to "
    "human. Deduplicate identical entries. Return an empty array for any empty category."
)


def _decode_text(data_b64):
    try:
        raw = base64.b64decode(data_b64)
    except Exception:
        return ""
    for enc in ("utf-8", "latin-1"):
        try:
            return raw.decode(enc, errors="replace")
        except Exception:
            continue
    return ""


def build_content():
    """Return (content_blocks, error). content_blocks is the user message content."""
    instr = {"type": "text", "text": "Extract the genes, mutations, and ASOs as instructed."}
    if mime == "application/pdf" or fname.lower().endswith(".pdf"):
        return [
            {"type": "document",
             "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
            instr,
        ], None
    if mime in IMAGE_TYPES or mime.startswith("image/"):
        media = mime if mime in IMAGE_TYPES else "image/png"
        return [
            {"type": "image",
             "source": {"type": "base64", "media_type": media, "data": b64}},
            instr,
        ], None
    # text (or unknown) -> decode and send as text
    txt = _decode_text(b64)
    if not txt.strip():
        return None, "could not read text from the file"
    return [{"type": "text", "text": txt[:120000]}], None


def ask_claude():
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if requests is None:
        return None, "python 'requests' is not available on the server"
    content, err = build_content()
    if content is None:
        return None, err
    try:
        try:
            import claude_usage as _cu; _cu.bump("extract-entities-file")
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
                "model": EXTRACT_MODEL,
                "max_tokens": 4000,
                "system": SYSTEM,
                "messages": [{"role": "user", "content": content}],
            },
            timeout=180,
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


_TID_CACHE = {}


def resolve_transcript(species, symbol):
    """The REAL canonical Ensembl transcript id for a gene symbol, from Ensembl itself.
     fabricates plausible-but-wrong stable ids that then fail to load, so the second
    step ('convert genetic info -> Ensembl ids') must be authoritative, not model-generated."""
    if not symbol:
        return None
    key = (("" + species).lower(), ("" + symbol).lower())
    if key in _TID_CACHE:
        return _TID_CACHE[key]
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    from urllib.parse import quote
    r = _ensembl_get("%s/lookup/symbol/%s/%s?expand=1" % (ENSEMBL_REST, sp, quote(str(symbol), safe="")))
    tid = None
    if r is not None:
        try:
            tx = (r.json() or {}).get("Transcript") or []
            if tx:
                canon = [t for t in tx if t.get("is_canonical")]
                tid = str((canon or tx)[0].get("id") or "").split(".")[0].strip() or None
        except Exception:
            tid = None
    _TID_CACHE[key] = tid
    return tid


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
    vals = list(want.values())
    out = []
    if vals:
        with ThreadPoolExecutor(max_workers=min(8, len(vals))) as pool:
            for v, tid in pool.map(lambda v: (v, resolve_transcript(v["species"], v["gene"])), vals):
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


_GENE_TX_CACHE = {}      # (species, gene) -> [transcript ids] ordered
_GENE_WORKING_TX = {}    # (species, gene) -> transcript id that last resolved a coding HGVS


def _gene_transcripts(species, symbol):
    """All of a gene's transcript ids, canonical first then protein-coding by length. The
    manuscript's c. numbering follows ITS transcript (often the MANE Select), which may
    differ from our canonical, so coding-HGVS resolution must try several."""
    key = (("" + species).lower(), ("" + symbol).lower())
    if key in _GENE_TX_CACHE:
        return _GENE_TX_CACHE[key]
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    from urllib.parse import quote
    r = _ensembl_get("%s/lookup/symbol/%s/%s?expand=1" % (ENSEMBL_REST, sp, quote(str(symbol), safe="")))
    out = []
    if r is not None:
        try:
            rows = []
            for t in ((r.json() or {}).get("Transcript") or []):
                rows.append((0 if t.get("is_canonical") else 1,
                             0 if t.get("biotype") == "protein_coding" else 1,
                             -abs((t.get("end") or 0) - (t.get("start") or 0)),
                             str(t.get("id") or "").split(".")[0]))
            rows.sort()
            out = [row[3] for row in rows if row[3]]
        except Exception:
            out = []
    _GENE_TX_CACHE[key] = out
    return out


def resolve_coding_hgvs(species, gene, core):
    """Resolve a bare coding change (c.2106G>A) by trying the gene's transcripts until VEP
    accepts one (the transcript whose reference matches the manuscript's numbering)."""
    if not gene:
        return None
    key = (("" + species).lower(), ("" + gene).lower())
    order, tried = [], set()
    if key in _GENE_WORKING_TX:
        order.append(_GENE_WORKING_TX[key])
    order += _gene_transcripts(species, gene)
    for tid in order:
        if not tid or tid in tried:
            continue
        tried.add(tid)
        loc = resolve_hgvs(species, "%s:%s" % (tid, core))
        if loc and loc.get("start"):
            _GENE_WORKING_TX[key] = tid
            return loc
        if len(tried) >= 6:
            break
    return None


def resolve_hgvs_smart(species, hgvs, gene, tid_by_gene):
    """Resolve an HGVS string. A bare coding/non-coding change (c./n.###) needs a transcript
    reference — try the gene's transcripts (so a manuscript's 'c.529A>G' maps without an rsID
    even when its transcript differs from the canonical). Already-qualified HGVS goes to VEP."""
    h = ("" + (hgvs or "")).strip()
    if not h:
        return None
    if ":" in h and re.match(r"^(ENS[A-Z]*T\d|NM_|NR_|NC_|chr|\d+|X|Y|MT)[\w.:]*:", h, re.I):
        return resolve_hgvs(species, h)
    core = h.split(":")[-1].strip()
    if re.match(r"^[cn]\.", core, re.I):
        return resolve_coding_hgvs(species, gene, core)
    return resolve_hgvs(species, h)


# --- Protein-variant resolution ------------------------------------------------------------
# A missense/nonsense change given ONLY at the protein level (p.Arg521Cys / R521C) carries no
# genomic coordinate, so rsID + coding-HGVS resolution above leaves it unmapped. Recode it to a
# genomic variant (and a dbSNP rsID when one exists) via the Ensembl Variant Recoder, which
# translates a protein HGVS against the transcript's actual reference codon — so the degeneracy
# of the amino-acid change collapses to the single correct nucleotide variant.
_AA1_TO_3 = {
    "A": "Ala", "R": "Arg", "N": "Asn", "D": "Asp", "C": "Cys", "Q": "Gln", "E": "Glu",
    "G": "Gly", "H": "His", "I": "Ile", "L": "Leu", "K": "Lys", "M": "Met", "F": "Phe",
    "P": "Pro", "S": "Ser", "T": "Thr", "W": "Trp", "Y": "Tyr", "V": "Val", "*": "Ter", "X": "Ter",
}


def _protein_to_hgvs3(protein):
    """Normalize a protein substitution/nonsense change to 3-letter HGVS 'p.Arg521Cys'. Accepts
    'p.Arg521Cys', 'Arg521Cys', 'R521C', 'p.R521C', 'R521*'. Returns None for anything that is
    not a simple single-residue substitution (frameshift / del / ins / dup / unparseable)."""
    p = ("" + (protein or "")).strip()
    if not p:
        return None
    p = re.sub(r"^p\.?", "", p, flags=re.I).strip().replace("(", "").replace(")", "")
    if re.search(r"fs|del|ins|dup|ext|=", p, re.I):
        return None
    m3 = re.match(r"^([A-Za-z]{3})(\d{1,6})([A-Za-z]{3}|\*)$", p)
    if m3:
        ref = m3.group(1).capitalize()
        alt = "Ter" if m3.group(3) == "*" else m3.group(3).capitalize()
        # A protein-level synonymous variant is impossible (same residue = no protein change),
        # so ref == alt is a mis-parse / coding-only synonymous change — never resolve it here.
        if ref == alt:
            return None
        return "p.%s%s%s" % (ref, m3.group(2), alt)
    m1 = re.match(r"^([A-Za-z])(\d{1,6})([A-Za-z]|\*)$", p)
    if m1:
        r1, a1 = m1.group(1).upper(), m1.group(3).upper()
        ref = _AA1_TO_3.get(r1)
        alt = _AA1_TO_3.get(a1)
        if ref and alt and r1 != a1:   # reject impossible protein-level synonymous (ref == alt)
            return "p.%s%s%s" % (ref, m1.group(2), alt)
    return None


def _vep_hgvs_full(species, hgvs):
    """VEP HGVS -> {chr, start, end, rsid} including a colocated dbSNP rsID. Used for protein
    HGVS, which must be qualified with a TRANSCRIPT reference (a bare gene symbol makes the VEP
    protein-HGVS lookup hang)."""
    if requests is None:
        return None
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    from urllib.parse import quote
    r = _ensembl_get("%s/vep/%s/hgvs/%s" % (ENSEMBL_REST, sp, quote(hgvs, safe="")))
    if r is None:
        return None
    try:
        arr = r.json() or []
    except Exception:
        return None
    if not arr:
        return None
    o = arr[0]
    try:
        start = int(o.get("start"))
    except Exception:
        return None
    try:
        end = int(o.get("end")) or start
    except Exception:
        end = start
    rsid = ""
    for c in (o.get("colocated_variants") or []):
        mm = re.search(r"rs\d+", "" + (c.get("id") or ""), re.I)
        if mm:
            rsid = mm.group(0).lower()
            break
    return {"chr": str(o.get("seq_region_name", "")), "start": start,
            "end": end if end >= start else start, "rsid": rsid}


def resolve_protein_variant(species, gene, protein, tid_by_gene=None):
    """Protein change (p.Arg521Cys / R521C) -> {chr, start, end, rsid} via VEP HGVS. Protein HGVS
    must be qualified with a TRANSCRIPT reference, so try the gene's transcripts (the resolved one
    first, then canonical/protein-coding). VEP returns the genomic locus AND colocated dbSNP
    rsIDs, so a protein-only variant is both placed and given its rs number."""
    if requests is None or not gene:
        return None
    p3 = _protein_to_hgvs3(protein)
    if not p3:
        return None
    tids = []
    if tid_by_gene:
        t0 = tid_by_gene.get(("" + gene).lower())
        if t0:
            tids.append(t0)
    try:
        for t in _gene_transcripts(species, gene):
            if t and t not in tids:
                tids.append(t)
    except Exception:
        pass
    for tid in tids[:5]:
        loc = _vep_hgvs_full(species, "%s:%s" % (tid, p3))
        if loc and loc.get("start"):
            return loc
    return None


obj, err = ask_claude()
works.progress(40)
if obj is None:
    works.progress(100)
    works.resolve({"genes": [], "mutations": [], "asos": [], "title": "", "error": err})
else:
    genes = obj.get("genes", []) or []
    mutations = obj.get("mutations", []) or []
    asos = obj.get("asos", []) or []
    title = ("" + (obj.get("title") or "")).strip()

    # Resolve transcripts EARLY so a coding HGVS (c.###) can be mapped through the gene's
    # transcript. Build gene(lower) -> transcript id.
    gene_transcripts = resolve_gene_transcripts(genes, mutations, asos)
    tid_by_gene = {("" + g["gene"]).lower(): g["id"] for g in gene_transcripts}
    works.progress(50)

    # Resolve every mutation's coordinate + gene IN PARALLEL (rsID first, then coding/genomic
    # HGVS via the transcript). Each mutation's Ensembl calls run concurrently across
    # mutations, so total time is ~one round-trip rather than the sum.
    def _resolve_mut(mut):
        mut["resolved"] = False
        sp = mut.get("species") or "human"
        loc = None
        rid = re.search(r"rs\d+", "" + (mut.get("id") or ""), re.I)
        if rid:
            loc = resolve_rsid(sp, rid.group(0).lower())
        if not loc and mut.get("hgvs"):
            loc = resolve_hgvs_smart(sp, mut.get("hgvs"), mut.get("gene"), tid_by_gene)
        # Protein-only variant (e.g. p.Arg521Cys / R521C): recode to a genomic variant + rsID.
        if not loc and mut.get("protein"):
            ploc = resolve_protein_variant(sp, mut.get("gene"), mut.get("protein"), tid_by_gene)
            if ploc and ploc.get("start"):
                loc = ploc
                # Backfill the discovered dbSNP rs number when the source gave none.
                if ploc.get("rsid") and not re.search(r"rs\d+", "" + (mut.get("id") or ""), re.I):
                    mut["id"] = ploc["rsid"]
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
        return mut

    if mutations:
        with ThreadPoolExecutor(max_workers=min(8, len(mutations))) as pool:
            list(pool.map(_resolve_mut, mutations))
    works.progress(95)

    # Recompute transcripts to include any gene backfilled from a locus (cached, so cheap).
    gene_transcripts = resolve_gene_transcripts(genes, mutations, asos)

    works.progress(100)
    works.resolve({"genes": genes, "mutations": mutations, "asos": asos,
                   "geneTranscripts": gene_transcripts, "title": title, "error": err})
