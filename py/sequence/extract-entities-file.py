#!/usr/bin/env python3
"""
Extract genes, mutations, and ASOs from an UPLOADED FILE (PDF, image, or text).

Same contract/output as extract-entities.py, but the input is a base64 file plus its
MIME type, sent to Claude as the appropriate content block:
  - application/pdf  -> a "document" block (Claude reads the PDF natively)
  - image/*          -> an "image" block (Claude reads the figure/scan/screenshot)
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

IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")

b64 = works.param(1) or ""
mime = ("" + (works.param(2) or "")).strip().lower()
fname = works.param(3) or ""
works.progress(6)

SYSTEM = (
    "You are a biomedical text-mining expert. Read the user's document/image/text and "
    "extract three kinds of entities. Return ONLY JSON, no prose:\n"
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


def resolve_gene_at(species, chrom, start, end):
    """The authoritative gene symbol overlapping a resolved locus (so the client loads the
    gene that actually contains the mutation, not whatever name the text happened to use)."""
    if requests is None or not chrom:
        return None
    sp = ENSEMBL_SPECIES.get(("" + species).lower(), ("" + species).lower())
    try:
        r = requests.get(
            "%s/overlap/region/%s/%s:%d-%d?feature=gene" % (ENSEMBL_REST, sp, chrom, int(start), int(end)),
            headers={"content-type": "application/json"}, timeout=30)
        if r.status_code != 200:
            return None
        for g in (r.json() or []):
            name = g.get("external_name") or g.get("gene_id")
            if name:
                return str(name)
    except Exception:
        return None
    return None


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


obj, err = ask_claude()
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

    works.progress(100)
    works.resolve({"genes": genes, "mutations": mutations, "asos": asos, "error": err})
