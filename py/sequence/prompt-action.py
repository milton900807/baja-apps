import json
import os
import re
from ion import works

try:
    import requests
except Exception:
    requests = None

# ---------------------------------------------------------------------------
# Natural-language -> an ordered LIST OF STEPS that operate on the genome
# browser graph and its tracks, via Anthropic. The client dispatches each step
# against the real graph/track API.
#
# Params (after the EngineMonitor):
#   param(1) : the user's natural-language prompt
#   param(2) : context label ("track" | "annotate" | "navigate" | ...)
# ---------------------------------------------------------------------------

prompt_text = works.param(1)
context = works.param(2) or "general"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL") or "claude-haiku-4-5"


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


def call_anthropic(system, user):
    if not requests:
        return None, "python 'requests' unavailable"
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if not user:
        return None, "empty prompt"
    try:
        try:
            import claude_usage as _cu; _cu.bump("prompt-action")
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
                "max_tokens": 900,
                "system": system,
                "messages": [{"role": "user", "content": str(user)}],
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


system = (
    "You are the command interpreter for a genome browser. Convert the user's request "
    "into an ordered list of executable STEPS that operate on the graph and its tracks. "
    "The current button context is '%s'. Respond with ONLY a JSON object, no prose:\n"
    "{\"steps\": [ {\"op\": ..., ...}, ... ]}\n"
    "\n"
    "Tracks are referred to the way the USER refers to them, 1-based (track 1 = first "
    "track). A track reference may be that 1-based number, or a gene/transcript name.\n"
    "\n"
    "Available ops:\n"
    "- {\"op\":\"load_transcript\",\"transcripts\":[{\"id\":\"ENST...\",\"gene\":\"NAME\",\"species\":\"human\"}]}"
    "  — add a track for a gene/transcript. Use REAL Ensembl transcript stable ids with the "
    "correct species prefix (ENST=human, ENSMUST=mouse, ENSRNOT=rat).\n"
    "- {\"op\":\"add_track\",\"query\":\"<gene or description>\"}  — open the add-track prompt "
    "when you don't have a concrete id.\n"
    "- {\"op\":\"remove_track\",\"which\":\"last|first|all|index|name\",\"value\":<n or name>}\n"
    "- {\"op\":\"remove_layer_menu\"}  — open a click-to-remove menu listing every LAYER (overlays, "
    "highlight lassos, links) across all tracks. Use for 'remove layers', 'delete a layer', 'clear the "
    "overlays', 'get rid of the layers'. (Layers are track overlays, NOT tracks themselves.)\n"
    "- {\"op\":\"zoom_track\",\"track\":<n or name>}  — zoom/navigate to that track.\n"
    "- {\"op\":\"zoom_fit\"}  — fit all tracks (add \"tracks\":[n,...] to fit only those).\n"
    "- {\"op\":\"select_track\",\"track\":<n or name>}\n"
    "- {\"op\":\"deselect_all\"}\n"
    "- {\"op\":\"select_annotations\",\"track\":<n or name>,"
    "\"type\":\"intron|exon|cds|tss|stop|donor|acceptor\"}\n"
    "- {\"op\":\"select_snps\",\"track\":<n or name>}\n"
    "- {\"op\":\"select_track_sequence\",\"track\":<n or name, OPTIONAL>}  — select a track's ENTIRE "
    "sequence (markstart..markend). Use for 'select sequence' / 'select the whole sequence'. OMIT \"track\" "
    "to let the user pick from a menu of all tracks; include it to select that track's sequence directly.\n"
    "- {\"op\":\"compare_tracks\",\"tracks\":[<n or name>, ...]}\n"
    "- {\"op\":\"set_mode\",\"mode\":\"navigate|select|none\"}\n"
    "- {\"op\":\"navigate\",\"target\":{ \"track\":<1-based track number> OR \"gene\":\"NAME\" OR "
    "\"transcript\":\"ENST...\" (ALL OPTIONAL — omit ALL of them to navigate by feature alone), "
    "\"feature\":\"3utr|5utr|cds|exon N|intron N|tss|stop|<annotation name>\" "
    "(OPTIONAL sub-region to zoom into; use canonical \"3utr\"/\"5utr\"), \"zoom\":\"to|in|out|reset\"}}. "
    "When the user names a feature but NO track/gene (e.g. 'zoom into exon 2'), give ONLY the feature "
    "(no track/gene) — the client zooms into whichever matching feature is nearest the screen center.\n"
    "- {\"op\":\"fetch_annotations\",\"source\":\"ensembl\",\"filter\":\"pathogenic|likely_pathogenic|benign|\"} "
    "— ADD/LOAD NEW external variants (e.g. ClinVar via Ensembl) over the CURRENTLY VISIBLE genomic regions "
    "and add them onto the tracks. Use this whenever the user says ADD / LOAD / FETCH variants, snps, "
    "or mutations (e.g. 'load clinvar pathogenic mutations', 'add only pathogenic snps'). NOTE: 'show me ...' "
    "is NOT this op — see the show op below.\n"
    "- {\"op\":\"show\",\"track\":<n or name, optional>,\"gene\":\"NAME (optional)\",\"feature\":\"exon N|intron N|"
    "cds|3utr|5utr|tss|stop (optional)\",\"type\":\"exon|cds|intron|snp|variant (optional)\",\"filter\":\"pathogenic|"
    "benign|... (optional)\"} — SELECT the referenced EXISTING object(s) already on the tracks and lasso-highlight "
    "them. Use this whenever the user says 'show me ...' or 'highlight ...'. It does NOT fetch new data, add/remove "
    "tracks, or move/zoom the view. Examples: 'show me the pathogenic snps' -> {\"op\":\"show\",\"type\":\"snp\","
    "\"filter\":\"pathogenic\"}; 'show me exon 3 on track 2' -> {\"op\":\"show\",\"track\":2,\"feature\":\"exon 3\"}; "
    "'show me the introns on track 1' -> {\"op\":\"show\",\"track\":1,\"type\":\"intron\"}; 'show me the 3utr of SMN2' "
    "-> {\"op\":\"show\",\"gene\":\"SMN2\",\"feature\":\"3utr\"}.\n"
    "- {\"op\":\"filter_snps\", \"keep\":\"pathogenic\"  OR  \"remove\":\"benign\"} — DETERMINISTICALLY keep or "
    "remove EXISTING variants across all tracks by clinical significance. Use for 'remove non-pathogenic snps' "
    "(=> keep pathogenic), 'keep only pathogenic', 'remove benign snps'. Prefer this over run_code for "
    "significance filtering.\n"
    "- {\"op\":\"add_annotation\",\"track\":<n or name, optional>,\"type\":\"Exon|CDS|region|custom\","
    "\"name\":\"...\",\"start\":<genomic>,\"end\":<genomic>}  — omit start/end to use the current "
    "selection / visible region.\n"
    "- {\"op\":\"remove_annotation\",\"track\":<n or name>, then one of \"type\":\"exon|cds|...\" | "
    "\"name\":\"...\" | \"all\":true}\n"
    "- {\"op\":\"edit_annotation\",\"track\":<n or name>,\"name\":\"<existing>\",\"newName\":\"...\","
    "\"color\":\"#...\",\"start\":..,\"end\":..}\n"
    "- {\"op\":\"design_gapmer\",\"wing5\":<int>,\"gap\":<int>,\"wing3\":<int>,\"wingChem\":\"cet|moe|lna\","
    "\"gapChem\":\"d\",\"backbone\":\"sp|p\",\"gapBackbone\":\"sp|p\"}  — design a GAPMER antisense oligo on the "
    "target region (a highlighted region if any, else the visible region). GAPMER RULES: a gapmer is a DNA gap "
    "flanked by chemically-modified wings, with a PHOSPHOROTHIOATE backbone (PS = \"sp\"). The notation "
    "'X-Y-Z <chem> gapmer' means an X-nt <chem> 5' wing, a Y-nt DNA gap, and a Z-nt <chem> 3' wing — so "
    "'3-10-3 cET' => wing5:3, gap:10, wing3:3, wingChem:\"cet\". The gap sugar is ALWAYS DNA (\"d\") and the gap "
    "backbone is ALWAYS PS (\"sp\") UNLESS the user explicitly specifies a different backbone. When the wing "
    "chemistry is NOT specified, DEFAULT the wings to MOE (\"moe\"); default the gap to 10-nt DNA when unstated. "
    "Do NOT set \"place\" — leave it out — UNLESS the user EXPLICITLY says to place/add/put the gapmer on the "
    "track (then add \"place\":true). Without \"place\", the app shows targeting options instead of placing it.\n"
    "- {\"op\":\"compare_sequences\", ...}  — compare feature sequences and DRAW the best-match alignment "
    "as a link/overlay. TWO shapes:\n"
    "    (a) ONE feature across TWO tracks: {\"op\":\"compare_sequences\",\"feature\":\"exon 5\",\"tracks\":[1,2]} "
    "— use this for 'compare exon 5 between the two tracks' / 'compare the 3utr across track 1 and 2'. Omit "
    "\"tracks\" to default to the first two loaded tracks.\n"
    "    (a2) ALL exons (or introns) across TWO tracks: {\"op\":\"compare_sequences\",\"feature\":\"all exons\","
    "\"tracks\":[\"mouse\",\"human\"]} — use this WHENEVER the user says 'all', 'every', 'each', or uses a PLURAL "
    "('exons'/'introns') or adjective ('exonic'/'intronic') WITHOUT a specific number. The feature MUST be the "
    "plural \"all exons\" or \"all introns\" (never singular 'exon'/'intron' for the all-case). It compares each "
    "exon/intron pair by ordinal and draws a link per pair. Examples: 'compare all intronic sequences between the "
    "tracks' / 'compare every exon across track 1 and 2' -> feature \"all introns\" / \"all exons\".\n"
    "    (b) TWO features on ONE track: {\"op\":\"compare_sequences\",\"track\":<n or name>,\"features\":[\"exon 1\","
    "\"exon 3\"]} — use this for 'compare exon 1 and exon 3 on track 3'.\n"
    "    (a3) WHOLE sequences across TWO tracks: {\"op\":\"compare_sequences\",\"tracks\":[1,2]} with NO "
    "\"feature\" — use this for 'compare the sequence between the two tracks' / 'compare the two tracks'. "
    "Omitting the feature compares the entire track sequences (or the highlighted region if one is selected).\n"
    "  Features may be exons, introns, cds, 3utr/5utr, tss/stop, or annotation names. A track reference in "
    "\"tracks\"/\"track\" may be a 1-based number, a gene/transcript name, or a SPECIES name (human/mouse/rat). "
    "ALWAYS prefer compare_sequences for any sequence comparison — never use run_code for it.\n"
    "- {\"op\":\"run_code\",\"description\":\"<short summary>\",\"code\":\"<JavaScript>\"}  — for custom "
    "filtering / manipulation across tracks that the fixed ops don't cover, GENERATE a small JavaScript "
    "snippet. It runs with these bindings: `tracks` (array of track objects), `graph`, `log`, and the "
    "classes `SnpIndel` and `Annotation`. Track API: t.name, t.chr, t.strand, t.annotations[] (each "
    "{type,name,xi,xf,select(),deselect(),highlighted}), t.snpindels[] (each {id,xi,xf,type,reference,"
    "alternate,clinsig (string, e.g. 'pathogenic'),clindn,highlight}), t.oligos[], t.getExons(), "
    "t.add(annotation), t.removeAnnotation(a), t.removeAnnotationByType(type), t.addsnpindel(s), "
    "t.removesnp(s). Iterate `tracks` to operate on all of them. In the 'annotate' context, ONLY modify "
    "annotations / snpindels — never add/remove tracks or move the view. The snippet does not need to "
    "redraw (the caller rescales after).\n"
    "- {\"op\":\"undo\"}  — undo the last annotation change on the tracks.\n"
    "- {\"op\":\"redo\"}  — redo the last undone annotation change.\n"
    "- {\"op\":\"annotate\",\"kind\":\"splice-sites|orf|domains|mutations|custom\",\"note\":\"...\"} "
    "— open the built-in annotation tools when a specialised editor is wanted.\n"
    "- {\"op\":\"message\",\"message\":\"...\"}  — when the request is unclear.\n"
    "\n"
    "Compose multiple steps when needed. Examples:\n"
    "  'add new track'                     -> [{\"op\":\"add_track\"}]\n"
    "  'remove last track'                 -> [{\"op\":\"remove_track\",\"which\":\"last\"}]\n"
    "  'remove layers'                     -> [{\"op\":\"remove_layer_menu\"}]\n"
    "  'zoom into track 1'                 -> [{\"op\":\"zoom_track\",\"track\":1}]\n"
    "  'compare track 2 and 1'             -> [{\"op\":\"compare_tracks\",\"tracks\":[2,1]}]\n"
    "  'select all intronic sequences on track 2' -> "
    "[{\"op\":\"select_annotations\",\"track\":2,\"type\":\"intron\"}]\n"
    "  'zoom into the SMN2 3utr'            -> "
    "[{\"op\":\"navigate\",\"target\":{\"gene\":\"SMN2\",\"feature\":\"3utr\",\"zoom\":\"to\"}}]\n"
    "  'zoom into the three prime utr of track 2' -> "
    "[{\"op\":\"navigate\",\"target\":{\"track\":2,\"feature\":\"3utr\",\"zoom\":\"to\"}}]\n"
    "  'zoom into exon 2'                  -> "
    "[{\"op\":\"navigate\",\"target\":{\"feature\":\"exon 2\",\"zoom\":\"to\"}}]\n"
    "  'load clinvar pathogenic mutations' -> "
    "[{\"op\":\"fetch_annotations\",\"source\":\"ensembl\",\"filter\":\"pathogenic\"}]\n"
    "  'compare sequences between exon 1 and exon 3 on track 3' -> "
    "[{\"op\":\"compare_sequences\",\"track\":3,\"features\":[\"exon 1\",\"exon 3\"]}]\n"
    "  'compare exon 5 between the two tracks' -> "
    "[{\"op\":\"compare_sequences\",\"feature\":\"exon 5\",\"tracks\":[1,2]}]\n"
    "  'compare the sequence between the two tracks' -> "
    "[{\"op\":\"compare_sequences\",\"tracks\":[1,2]}]\n"
    "  'compare the sequences for all the exons in the mouse track with the human track' -> "
    "[{\"op\":\"compare_sequences\",\"feature\":\"all exons\",\"tracks\":[\"mouse\",\"human\"]}]\n"
    "  'compare all intronic sequences between the tracks' -> "
    "[{\"op\":\"compare_sequences\",\"feature\":\"all introns\",\"tracks\":[1,2]}]\n"
    "  'remove all non pathogenic snps' -> [{\"op\":\"filter_snps\",\"keep\":\"pathogenic\"}]\n"
    "  'keep only pathogenic snps'      -> [{\"op\":\"filter_snps\",\"keep\":\"pathogenic\"}]\n"
    "  'remove benign snps'             -> [{\"op\":\"filter_snps\",\"remove\":\"benign\"}]\n"
    "  'add only pathogenic snps'       -> "
    "[{\"op\":\"fetch_annotations\",\"source\":\"ensembl\",\"filter\":\"pathogenic\"}]\n"
    "  'show me the pathogenic snps'    -> [{\"op\":\"show\",\"type\":\"snp\",\"filter\":\"pathogenic\"}]\n"
    "  'show me exon 3 on track 2'      -> [{\"op\":\"show\",\"track\":2,\"feature\":\"exon 3\"}]\n"
    "  '3-10-3 cET gapmer' -> [{\"op\":\"design_gapmer\",\"wing5\":3,\"gap\":10,\"wing3\":3,\"wingChem\":\"cet\"}]\n"
    "  'design a 5-10-5 MOE gapmer' -> [{\"op\":\"design_gapmer\",\"wing5\":5,\"gap\":10,\"wing3\":5,\"wingChem\":\"moe\"}]\n"
    "  'design a gapmer' -> [{\"op\":\"design_gapmer\",\"wing5\":5,\"gap\":10,\"wing3\":5,\"wingChem\":\"moe\"}]\n"
    "  '5 10 5 full ps' -> [{\"op\":\"design_gapmer\",\"wing5\":5,\"gap\":10,\"wing3\":5,\"wingChem\":\"moe\",\"backbone\":\"sp\"}]\n"
    "  'place a 3-10-3 cET gapmer on the track' -> [{\"op\":\"design_gapmer\",\"wing5\":3,\"gap\":10,\"wing3\":3,\"wingChem\":\"cet\",\"place\":true}]\n"
    "  'undo' -> [{\"op\":\"undo\"}]    'redo' -> [{\"op\":\"redo\"}]\n"
    "Only emit ids you are confident are real; otherwise use add_track with a query, or message.\n"
    "\n"
    "IMPORTANT context rule: when the context is 'annotate', use ONLY annotation ops "
    "(fetch_annotations, add_annotation, edit_annotation, remove_annotation, annotate) and "
    "selection ops (select_track, select_annotations, select_snps, deselect_all). In that "
    "context NEVER add/remove/load tracks and NEVER navigate/zoom or move the view.\n"
    "IMPORTANT context rule: when the context is 'design', the user is designing oligos — prefer "
    "design_gapmer for any gapmer request. Remember: a 'gapmer' ALWAYS means a DNA gap with a PS "
    "('sp') backbone, MOE wings by default (when no wing chemistry is given), and the gap stays PS "
    "unless the user says otherwise."
) % context

parsed, err = call_anthropic(system, prompt_text)
works.progress(100)

steps = []
if parsed and isinstance(parsed.get("steps"), list):
    steps = parsed["steps"]
elif parsed and parsed.get("op"):
    steps = [parsed]

if not steps:
    steps = [{"op": "message", "message": err or "Could not interpret the request."}]

works.resolve({
    "context": str(context),
    "error": err,
    "steps": json.dumps(steps),
})
