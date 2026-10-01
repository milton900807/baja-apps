#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compensation: the gene is lost at the RNA level -- what else could carry the load.

param(1): a GENE SYMBOL, optionally with context ("STXBP1", "SCN1A in Dravet syndrome").
param(2): {"fresh": true} to research again rather than answer from the store.

Returns the shape the canvas already draws:
  {"status":"ok","detection":{...},"tables":[{name,group,headers,rows}],
   "documents":[{name,html}],"svgs":[...],"notes":[...]}

THE ASSUMPTION, which is the whole point of the tool. The named gene has LOST FUNCTION AT
THE RNA LEVEL -- the transcript is absent, truncated, degraded by NMD, or made in too small
an amount. Not a missense protein with the wrong shape, and not a gain of function. So the
question is never "how do we fix this gene": it is "what ELSE, that antisense chemistry can
reach, would carry the load the gene has dropped".

WHY THAT RULES OUT MOST OF THE OBVIOUS ANSWERS. Replacing the gene is gene therapy and
correcting it is editing, and neither is asked for here -- so a plan that lands on AAV, a
lentivirus, base or prime editing, CRISPR of any flavour, or delivered mRNA is not an answer
to this question, however good the biology is. What is left is what an oligonucleotide can
do to RNA that already exists in the cell:

  upregulate   raise the output of a gene that is still intact. Skip a poison or
               NMD-triggering exon (TANGO); block a uORF, an IRE or a repressive 5'UTR
               element; knock down a natural antisense transcript or a cis-acting lncRNA;
               block a miRNA site in the 3'UTR; switch to a distal polyA site.
  knockdown    gapmer or siRNA against something whose REMOVAL compensates: a negative
               regulator of the surviving pathway, a repressor of the paralog, a competing
               subunit, a toxic downstream effector.
  splicing     change which isoform is made: include a skipped exon, skip a frame-disrupting
               one, block a pseudoexon, shift the balance between two isoforms.

FOUR ROUTES, because "what compensates" is answered by four different kinds of evidence with
four different failure modes, and they are kept apart rather than mixed into one rationale:

  paralog   a paralogue or a functionally redundant gene covers the same biochemistry.
            Strong when the paralogue is expressed in the right tissue; worthless when it
            is not, which is why the tables carry tissue rather than leaving it implied.
  systems   the network says so: flux reroutes, a feedback loop opens, a module buffers the
            loss. Co-expression, pathway and multi-omic work.
  genetic   something rescued the loss in an experiment: a modifier screen, a double mutant,
            a model organism, a patient-derived line.
  clinical  something rescued it in people: a human modifier allele, a milder genotype
            explained by another gene, an oligonucleotide already dosed in this pathway.

A node with one route is a hypothesis. A node with three is worth a programme. The tables
say which routes each node has, so that difference is visible rather than buried in prose.

The API plumbing (streamed request, server tool loop, paused-turn resume) is the same as
py/analytics/repurpose.py; it is repeated rather than imported because that file's name is
not importable and the two tools move independently.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any, Dict, Iterator, List, Optional, Tuple

try:
    from ion import works
except Exception:  # pragma: no cover - running outside the bridge
    class _Works:
        def msg(self, s: str) -> None:
            print(s, file=sys.stderr)

        def progress(self, n: int) -> None:
            pass

        def resolve(self, obj: Any) -> None:
            print(json.dumps(obj, indent=2))

        def param(self, i: int) -> Any:
            return sys.argv[i] if len(sys.argv) > i else None

    works = _Works()  # type: ignore

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("COMPENSATE_MODEL") or "claude-opus-5"

DEFAULT_MAX_NODES = 8
DEFAULT_MAX_SEARCHES = 20
# The /py bridge kills a job at 900 s; stop resuming in time to structure what was found.
RESEARCH_DEADLINE_SEC = 660
MAX_RESUMES = 4

ROUTES = ["paralog", "systems", "genetic", "clinical"]
ROUTE_LABEL = {
    "paralog": "Paralogue",
    "systems": "Systems",
    "genetic": "Genetic rescue",
    "clinical": "Human",
}

# The three things an oligonucleotide can do, and the only three this tool will propose.
MODALITIES = ["upregulation", "knockdown", "splicing"]
MODALITY_LABEL = {
    "upregulation": "Upregulation",
    "knockdown": "Knockdown",
    "splicing": "Splicing",
}

# A strategy naming any of these is dropped before it reaches the canvas, however it was
# phrased: the user asked for antisense and nothing else, and a plan that quietly leans on a
# virus or a nuclease is not a smaller version of that answer, it is a different one.
FORBIDDEN = re.compile(
    r"\b(aav\d*|adeno[- ]?associated|lentivir(?:us|al)|adenovir(?:us|al)|retrovir(?:us|al)|"
    r"crispr|cas9|cas12|cas13|casrx|base[- ]edit\w*|prime[- ]edit\w*|zinc[- ]finger|"
    r"talen|gene[- ]therap\w*|gene[- ]replacement|gene[- ]transfer|gene[- ]addition|"
    r"transgene|knock[- ]?in|mrna[- ]therap\w*|modified[- ]mrna|saRNA|self[- ]amplifying|"
    r"viral[- ]vector|episom\w*|integrat(?:ing|ion)[- ]vector|cell[- ]therap\w*|"
    r"stem[- ]cell[- ]transplant\w*)\b", re.I)

SYSTEM = """You are given ONE GENE and you assume it has lost function AT THE RNA LEVEL: the
transcript is absent, truncated, degraded by nonsense-mediated decay, or made in too small an
amount. Assume loss of function even if the gene is better known for gain-of-function disease,
and say so in `assumption`. Your job is to find what ELSE could carry the load, and to say how
antisense chemistry would do it.

Say which gene you read, its standard symbol, what it does, and what breaks when it is lost --
the tissue, the cell type, the process. If the prompt names a disease or a tissue as well, keep
the whole answer inside that context.

WHAT YOU ARE LOOKING FOR: compensatory nodes. A gene, protein or pathway whose modulation
offsets the loss.

THE GENE ITSELF COUNTS AS A NODE when some functional transcript is still being made -- a
haploinsufficiency with one intact allele, or a leaky splice variant. Raising the output of
what survives is antisense territory and it is usually the best-precedented answer on the
page (poison-exon skipping of the intact allele, the TANGO approach), so include it, name it
as the gene with relation "intact allele", and say what fraction of normal is still there. Do
NOT include it when the assumption is a complete absence of transcript from both alleles:
there is nothing to raise, and listing it would be the one dishonest row in the table.

Look along all four of these routes and be explicit about which ones each
node has:
  paralog   - a paralogue or functionally redundant gene doing the same biochemistry. Say
              whether it is EXPRESSED in the tissue that matters, with a number if you can
              find one; a paralogue that is silent where the gene is needed is not a
              compensator, and this is the single most common way a paralogue hypothesis dies.
  systems   - the network says so: flux reroutes through another branch, a feedback loop
              opens, a module buffers the loss. Co-expression, pathway, flux or multi-omic
              analyses, network models, metabolic maps.
  genetic   - the loss was actually rescued in an experiment: a modifier or suppressor
              screen, a double mutant, a model organism, a patient-derived line, a CRISPR
              screen read as genetics (the screen is evidence; do not propose CRISPR as the
              therapy).
  clinical  - it was rescued in people: a human modifier allele, siblings with the same
              variant and different severity explained by another gene, an oligonucleotide
              already dosed in this pathway.

Search the literature. Prefer peer-reviewed papers, Open Targets, GTEx/Human Protein Atlas for
expression, DepMap and published screens for genetic interaction, OMIM and ClinVar for human
modifiers, ClinicalTrials.gov for anything already dosed. Say the year of everything.

THEN, FOR EACH NODE, SAY HOW AN OLIGONUCLEOTIDE WOULD DO IT. The answer must be antisense
technology and nothing else. Exactly three modalities are allowed:
  upregulation - raise the output of an intact gene. Skip a poison or NMD-triggering exon
                 (TANGO); block a uORF or a repressive 5'UTR element; knock down a natural
                 antisense transcript or cis-acting lncRNA; block a miRNA site in the 3'UTR;
                 shift to a distal polyadenylation site.
  knockdown    - gapmer ASO or siRNA against something whose REMOVAL compensates: a negative
                 regulator of the surviving pathway, a repressor of the paralogue, a competing
                 subunit, a toxic downstream effector.
  splicing     - change which isoform is made: include a skipped exon, skip a frame-disrupting
                 one, block a pseudoexon, shift the balance between two isoforms.

NEVER propose gene therapy, gene replacement, a viral vector of any kind, CRISPR, base or
prime editing, a nuclease, a transgene, delivered mRNA, or a cell therapy. These are excluded
by the question, not by their merit. If the only credible way to compensate a node is one of
those, LEAVE THE NODE OUT and say why in `caveats`. Do not describe an excluded approach as a
comparison, an alternative or a fallback.

For each strategy be concrete about the RNA: which transcript, which region (a named exon, the
5'UTR, a uORF, the 3'UTR, a branch point, an antisense transcript), and which direction the
amount of protein moves. Say what makes it hard: the tissue the oligo has to reach, whether
intrathecal or systemic delivery is implied, the dose window, whether the compensator is
dangerous when overshot.

Say what would KILL each node -- the paralogue that is not expressed there, the rescue that
only worked in a dish, the compensation that is already maximal in patients, the feedback loop
that cancels it. A compensation list without that is a list of things that have already failed.

Return ONLY this JSON, in a ```json fence, after the prose:

{
  "subject": {"gene": "SYMBOL", "aliases": ["..."], "function": "one line: what the gene does",
              "assumption": "one line: what RNA-level loss of function means for this gene",
              "consequence": "one sentence: what breaks when it is lost -- tissue, cell type, process",
              "context": "the disease or tissue the question is restricted to, or an empty string"},
  "summary": "three or four sentences: the strongest compensatory routes and why",
  "nodes": [
    {"node": "gene/protein/pathway that compensates",
     "relation": "paralogue|same complex|downstream effector|negative regulator|parallel pathway|upstream activator",
     "how": "how compensating works, one or two sentences",
     "tissue": "where it is expressed relative to where the loss hurts, with a figure if found",
     "routes": ["paralog", "genetic"],
     "confidence": "high|medium|low",
     "direction": "increase|decrease",
     "risks": "what would kill this node",
     "ceiling": "how much of the lost function this could plausibly restore, and on what basis",
     "source": {"title": "...", "url": "...", "year": 2024}}
  ],
  "strategies": [
    {"node": "the node it acts on", "modality": "upregulation|knockdown|splicing",
     "approach": "the specific antisense approach, e.g. 'skip the poison exon 20N'",
     "transcript": "the transcript or gene the oligo binds",
     "region": "the region it binds: exon, 5'UTR, uORF, 3'UTR, branch point, antisense transcript",
     "chemistry": "the oligo class this needs: gapmer, steric-blocking ASO, siRNA, splice-switching ASO",
     "effect": "which way the protein amount moves and roughly how far",
     "precedent": "an oligonucleotide that has done this before, with its name, or an empty string",
     "feasibility": "high|medium|low",
     "obstacle": "the thing that makes this hard -- tissue, delivery route, dose window, overshoot",
     "source": {"title": "...", "url": "...", "year": 2024}}
  ],
  "evidence": [
    {"node": "the node", "route": "paralog|systems|genetic|clinical",
     "finding": "what was observed",
     "data": "what kind of data it is (screen, model, cohort, dataset, expression atlas)",
     "direction": "supports|mixed|against",
     "year": 2024, "confidence": "high|medium|low",
     "source": {"title": "...", "url": "...", "year": 2024}}
  ],
  "caveats": ["what this list does not cover, including any node left out because the only way to reach it was excluded"]
}

At most %d nodes. Every node needs at least one evidence row and at least one strategy. Every
strategy must be one of the three allowed modalities. Invent nothing: if you did not find it,
leave it out."""


class ApiError(Exception):
    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


def _headers(with_fallback: bool) -> Dict[str, str]:
    h = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
    }
    if with_fallback:
        h["anthropic-beta"] = FALLBACK_BETA
    return h


def _sse_events(resp: Any) -> Iterator[Dict[str, Any]]:
    for raw in resp.iter_lines(decode_unicode=False):
        if not raw:
            continue
        line = raw.decode("utf-8", "replace")
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if not payload:
            continue
        try:
            yield json.loads(payload)
        except Exception:
            continue


def _stream_message(body: Dict[str, Any], on_search: Any = None) -> Dict[str, Any]:
    """POST one streamed request and rebuild the final message from its events."""
    body = dict(body)
    body["stream"] = True
    body["fallbacks"] = "default"
    with_fallback = True

    for _attempt in range(3):
        try:
            resp = requests.post(API_URL, headers=_headers(with_fallback), json=body,
                                 stream=True, timeout=(15, 180))
        except Exception as ex:
            raise ApiError("Claude request failed: %s" % ex)

        if resp.status_code != 200:
            text = (resp.text or "")[:400]
            if resp.status_code == 400 and with_fallback and "fallback" in text.lower():
                body.pop("fallbacks", None)
                with_fallback = False
                continue
            if resp.status_code in (429, 500, 502, 503, 529):
                time.sleep(4)
                continue
            raise ApiError("anthropic %s: %s" % (resp.status_code, text), resp.status_code)

        message: Dict[str, Any] = {"content": [], "stop_reason": None, "usage": {}}
        blocks: Dict[int, Dict[str, Any]] = {}
        partial: Dict[int, str] = {}
        for ev in _sse_events(resp):
            t = ev.get("type")
            if t == "message_start":
                m = ev.get("message") or {}
                message["model"] = m.get("model")
                message["usage"] = m.get("usage") or {}
            elif t == "content_block_start":
                blocks[ev.get("index")] = dict(ev.get("content_block") or {})
                partial[ev.get("index")] = ""
            elif t == "content_block_delta":
                i = ev.get("index")
                d = ev.get("delta") or {}
                if d.get("type") == "text_delta":
                    blocks.setdefault(i, {"type": "text", "text": ""})
                    blocks[i]["text"] = (blocks[i].get("text") or "") + (d.get("text") or "")
                elif d.get("type") == "thinking_delta":
                    blocks.setdefault(i, {"type": "thinking", "thinking": ""})
                    blocks[i]["thinking"] = (blocks[i].get("thinking") or "") + (d.get("thinking") or "")
                elif d.get("type") == "signature_delta":
                    blocks.setdefault(i, {"type": "thinking"})
                    blocks[i]["signature"] = (blocks[i].get("signature") or "") + (d.get("signature") or "")
                elif d.get("type") == "input_json_delta":
                    partial[i] = (partial.get(i) or "") + (d.get("partial_json") or "")
            elif t == "content_block_stop":
                i = ev.get("index")
                b = blocks.get(i)
                if b is not None and partial.get(i):
                    try:
                        b["input"] = json.loads(partial[i])
                    except Exception:
                        b["input"] = {}
                if b is not None and b.get("type") == "server_tool_use" and on_search:
                    q = (b.get("input") or {}).get("query")
                    if q:
                        try:
                            on_search(str(q))
                        except Exception:
                            pass
            elif t == "message_delta":
                d = ev.get("delta") or {}
                if d.get("stop_reason"):
                    message["stop_reason"] = d.get("stop_reason")
                if d.get("stop_details"):
                    message["stop_details"] = d.get("stop_details")
                if ev.get("usage"):
                    message["usage"] = ev.get("usage")
            elif t == "error":
                raise ApiError("stream error: %s" % json.dumps(ev.get("error") or {})[:200])

        message["content"] = [blocks[i] for i in sorted(blocks.keys())]
        return message

    raise ApiError("Claude is busy (rate limited or overloaded). Try again in a minute.")


def _text_of(content: List[Dict[str, Any]]) -> str:
    return "".join(b.get("text") or "" for b in content if b.get("type") == "text")


def _s(v: Any) -> str:
    return "" if v is None else ("" + str(v)).strip()


def _year(v: Any) -> str:
    m = re.search(r"(19|20)\d{2}", _s(v))
    return m.group(0) if m else ""



# ---------------- research ----------------

def research(prompt: str, max_nodes: int, max_searches: int
             ) -> Tuple[str, List[Dict[str, Any]], Dict[str, Any]]:
    user = (
        f"{prompt.strip()}\n\n"
        f"Today's date: {time.strftime('%Y-%m-%d')}."
    )
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches}]
    body: Dict[str, Any] = {
        "model": MODEL,
        "max_tokens": 32000,
        "system": SYSTEM % max_nodes,
        "messages": [{"role": "user", "content": user}],
        "tools": tools,
        "output_config": {"effort": "medium"},
    }

    info: Dict[str, Any] = {"searched": True, "queries": [], "model": MODEL}

    def on_search(q: str) -> None:
        info["queries"].append(q)
        works.msg("Searching: " + q[:110])
        works.progress(min(80, 10 + 6 * len(info["queries"])))

    started = time.time()
    all_blocks: List[Dict[str, Any]] = []
    try:
        msg = _stream_message(body, on_search)
    except ApiError as ex:
        if ex.status in (400, 403) and re.search(r"web[_ ]search", str(ex), re.I):
            info["searched"] = False
            body.pop("tools", None)
            works.msg("Web search is not enabled; using model knowledge")
            msg = _stream_message(body, None)
        else:
            raise

    resumes = 0
    while True:
        all_blocks.extend(msg.get("content") or [])
        info["model"] = msg.get("model") or info["model"]
        if msg.get("stop_reason") == "refusal":
            det = msg.get("stop_details") or {}
            raise ApiError("the model declined this request"
                           + (f" ({det.get('category')})" if det.get("category") else ""))
        if msg.get("stop_reason") != "pause_turn":
            break
        if resumes >= MAX_RESUMES or time.time() - started > RESEARCH_DEADLINE_SEC:
            break
        resumes += 1
        body["messages"] = body["messages"] + [{"role": "assistant", "content": msg.get("content") or []}]
        msg = _stream_message(body, on_search)

    info["stop_reason"] = msg.get("stop_reason")
    info["seconds"] = round(time.time() - started, 1)
    info["searches"] = max(len(info["queries"]),
                           sum(1 for b in all_blocks if b.get("type") == "web_search_tool_result"))
    return _text_of(all_blocks), all_blocks, info


def _last_json_block(text: str) -> Optional[Dict[str, Any]]:
    fenced = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidates = list(reversed(fenced))
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        candidates.append(m.group(0))
    for c in candidates:
        try:
            v = json.loads(c)
        except Exception:
            continue
        if isinstance(v, dict) and isinstance(v.get("nodes"), list):
            return v
    return None


def _urls_seen(blocks: List[Dict[str, Any]]) -> set:
    """Every URL the SEARCH actually returned. A citation outside this set was not
    checked by anything, and its row says so."""
    seen = set()
    for b in blocks:
        if b.get("type") != "web_search_tool_result":
            continue
        for r in (b.get("content") or []):
            u = _s(r.get("url"))
            if u:
                seen.add(u.split("#")[0].rstrip("/"))
    return seen


def _verified(url: str, seen: set) -> str:
    u = _s(url).split("#")[0].rstrip("/")
    if not u:
        return "no - none given"
    return "yes" if u in seen else "no - verify"


# ---------------- what the question excludes ----------------

def _excluded(strategy: Dict[str, Any]) -> str:
    """The first excluded approach this strategy names, or "". Every free-text field is read,
    not just the modality: a row can be labelled "upregulation" and still describe delivering
    a transgene, and that row is the one worth catching."""
    for k in ("approach", "transcript", "region", "chemistry", "effect", "precedent", "obstacle"):
        m = FORBIDDEN.search(_s(strategy.get(k)))
        if m:
            return m.group(0)
    return ""


def _usable_strategies(found: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """(kept, dropped). A strategy is kept when its modality is one of the three and nothing
    in it names an excluded approach."""
    kept, dropped = [], []
    for s in (found.get("strategies") or []):
        if not isinstance(s, dict):
            continue
        mod = _s(s.get("modality")).lower().strip()
        if mod not in MODALITIES:
            s = dict(s)
            s["_why"] = "not an antisense modality: " + (mod or "(none given)")
            dropped.append(s)
            continue
        bad = _excluded(s)
        if bad:
            s = dict(s)
            s["_why"] = "names an excluded approach: " + bad
            dropped.append(s)
            continue
        kept.append(s)
    return kept, dropped


# ---------------- the canvas's tables ----------------

def _prefix(subject: Dict[str, Any], prompt: str) -> str:
    base = _s(subject.get("gene")) or _s(prompt)[:40] or "Compensate"
    base = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_")
    return (base[:40] or "Compensate")


# ---------------- the compensation map ----------------
#
# One picture, and it answers the question the tables take four of to answer: the gene is
# gone, so what is still standing, and what would an oligo do to it. The lost gene sits on
# the left struck through; each compensatory node sits to the right of it with the modality
# that reaches it written on the arrow, coloured by modality rather than by node -- the
# modality is the part a chemist acts on.

ROUTE_COLOUR = {
    "paralog": "#1aa3bd",
    "systems": "#7c3aed",
    "genetic": "#16a34a",
    "clinical": "#FD5E53",
}
MODALITY_COLOUR = {
    "upregulation": "#16a34a",   # more protein
    "knockdown": "#FD5E53",      # less of something
    "splicing": "#7c3aed",       # a different isoform
}
MODALITY_GLYPH = {"upregulation": "↑", "knockdown": "↓", "splicing": "⇄"}


def _xml(t: Any) -> str:
    return (_s(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def _fit(t: Any, n: int) -> str:
    s = _s(t)
    return s if len(s) <= n else (s[: max(1, n - 1)].rstrip() + "…")


def _wrap(text: str, per_line: int, lines: int) -> List[str]:
    """Break a caption on spaces, and say so with an ellipsis if it will not fit."""
    words = _s(text).split()
    out, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if len(trial) <= per_line:
            cur = trial
        else:
            if cur:
                out.append(cur)
            cur = w
            if len(out) == lines:
                break
    if cur and len(out) < lines:
        out.append(cur)
    if not out:
        return []
    if len(out) == lines and len(" ".join(words)) > sum(len(o) for o in out) + len(out) - 1:
        out[-1] = out[-1][: max(1, per_line - 1)].rstrip() + "…"
    return out


def _compensation_svg(subject: Dict[str, Any], node_rows: List[Dict[str, Any]],
                      strats: List[Dict[str, Any]]) -> str:
    rows = node_rows[:6]
    if not rows:
        return ""
    gene = _fit(_s(subject.get("gene")) or "gene", 16)

    ROW_H, TOP, LEFT = 108, 92, 40
    GENE_W, NODE_X, NODE_W = 196, 470, 300
    H = TOP + ROW_H * len(rows) + 76
    W = 1060
    mid = TOP + ROW_H * len(rows) / 2.0

    p: List[str] = []
    p.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
             f'font-family="Helvetica,Arial,sans-serif">')
    p.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff"/>')
    p.append(f'<text x="{LEFT}" y="38" font-size="21" font-weight="700" fill="#0a2540">'
             f'{_xml(gene)} is lost at the RNA level — what could carry the load</text>')
    sub = _fit(_s(subject.get("consequence")) or _s(subject.get("function")), 112)
    if sub:
        p.append(f'<text x="{LEFT}" y="62" font-size="13" fill="#5b6b7f">{_xml(sub)}</text>')

    # The gene, struck through: it is the one box on the page nothing acts on.
    gy = mid - 34
    p.append(f'<rect x="{LEFT}" y="{gy:.0f}" width="{GENE_W}" height="68" rx="12" '
             f'fill="#eef2f6" stroke="#9fb3c8" stroke-width="1.5" stroke-dasharray="5 4"/>')
    p.append(f'<text x="{LEFT + GENE_W / 2:.0f}" y="{gy + 32:.0f}" font-size="17" font-weight="700" '
             f'fill="#64748b" text-anchor="middle">{_xml(gene)}</text>')
    p.append(f'<line x1="{LEFT + 26}" y1="{gy + 27:.0f}" x2="{LEFT + GENE_W - 26}" y2="{gy + 27:.0f}" '
             f'stroke="#b42318" stroke-width="2.5"/>')
    p.append(f'<text x="{LEFT + GENE_W / 2:.0f}" y="{gy + 52:.0f}" font-size="11.5" fill="#8a99ab" '
             f'text-anchor="middle">no transcript to work with</text>')

    # One row per node. The arrow carries the modality, because that is the actionable part.
    by_node: Dict[str, List[Dict[str, Any]]] = {}
    for s in strats:
        by_node.setdefault(_s(s.get("node")), []).append(s)

    for i, r in enumerate(rows):
        y = TOP + i * ROW_H + ROW_H / 2
        name = _s(r.get("Node"))
        mods = [_s(s.get("modality")).lower() for s in by_node.get(name, [])]
        mods = [m for m in mods if m in MODALITIES]
        lead = mods[0] if mods else "upregulation"
        col = MODALITY_COLOUR.get(lead, "#1aa3bd")

        # elbow from the gene box to the node
        x0 = LEFT + GENE_W
        p.append(f'<path d="M {x0} {mid:.0f} C {(x0 + NODE_X) / 2:.0f} {mid:.0f}, '
                 f'{(x0 + NODE_X) / 2:.0f} {y:.0f}, {NODE_X - 11} {y:.0f}" fill="none" '
                 f'stroke="{col}" stroke-width="2.2" opacity="0.85"/>')
        p.append(f'<path d="M {NODE_X - 11} {y - 5:.0f} L {NODE_X - 1} {y:.0f} L {NODE_X - 11} {y + 5:.0f} Z" fill="{col}"/>')

        # the modality badge, on the arrow
        bx = (x0 + NODE_X) / 2 - 46
        label = " ".join(MODALITY_GLYPH.get(m, "") + MODALITY_LABEL.get(m, m) for m in (mods[:2] or [lead]))
        p.append(f'<rect x="{bx:.0f}" y="{y - 30:.0f}" width="{_badge_w(label)}" height="19" rx="9.5" '
                 f'fill="{col}" opacity="0.14"/>')
        p.append(f'<text x="{bx + 7:.0f}" y="{y - 16:.0f}" font-size="11" font-weight="700" fill="{col}">'
                 f'{_xml(_fit(label, 26))}</text>')

        # the node
        p.append(f'<rect x="{NODE_X}" y="{y - 36:.0f}" width="{NODE_W}" height="72" rx="12" '
                 f'fill="#ffffff" stroke="{col}" stroke-width="2"/>')
        p.append(f'<text x="{NODE_X + 14}" y="{y - 14:.0f}" font-size="15.5" font-weight="700" '
                 f'fill="#0a2540">{_xml(_fit(name, 26))}</text>')
        rel = _fit(_s(r.get("Relation")), 34)
        p.append(f'<text x="{NODE_X + 14}" y="{y + 4:.0f}" font-size="11.5" fill="#5b6b7f">{_xml(rel)}</text>')
        move = _s(r.get("Move")) or "increase"
        p.append(f'<text x="{NODE_X + 14}" y="{y + 23:.0f}" font-size="11.5" font-weight="700" '
                 f'fill="{col}">{_xml(move)} it</text>')

        # routes and confidence, to the right
        tx = NODE_X + NODE_W + 22
        routes = _s(r.get("Routes"))
        p.append(f'<text x="{tx}" y="{y - 12:.0f}" font-size="11.5" fill="#0a2540" font-weight="700">'
                 f'{_xml(_fit(routes, 30))}</text>')
        conf = _s(r.get("Confidence"))
        if conf:
            p.append(f'<text x="{tx}" y="{y + 6:.0f}" font-size="11" fill="#5b6b7f">'
                     f'confidence {_xml(conf)}</text>')
        ceil = _wrap(_s(r.get("Ceiling")), 30, 1)
        if ceil:
            p.append(f'<text x="{tx}" y="{y + 24:.0f}" font-size="10.5" fill="#8a99ab">{_xml(ceil[0])}</text>')

    # The legend says what the colours mean, and the footer says what the picture leaves out.
    ly = H - 42
    p.append(f'<text x="{LEFT}" y="{ly}" font-size="11" font-weight="700" fill="#5b6b7f">Antisense route:</text>')
    lx = LEFT + 112
    for m in MODALITIES:
        c = MODALITY_COLOUR[m]
        p.append(f'<rect x="{lx}" y="{ly - 10}" width="11" height="11" rx="3" fill="{c}"/>')
        p.append(f'<text x="{lx + 17}" y="{ly}" font-size="11" fill="#5b6b7f">'
                 f'{MODALITY_GLYPH[m]} {MODALITY_LABEL[m]}</text>')
        lx += 150
    p.append(f'<text x="{LEFT}" y="{H - 18}" font-size="10.5" fill="#9fb3c8">'
             f'Oligonucleotide routes only — no editing, no gene therapy. '
             f'The tables carry the transcript, the region and what would kill each one.</text>')
    p.append("</svg>")
    return "".join(p)


def _badge_w(label: str) -> int:
    return max(58, min(190, int(6.3 * len(_fit(label, 26))) + 14))


def build_tables(found: Dict[str, Any], blocks: List[Dict[str, Any]], prompt: str,
                 info: Dict[str, Any]) -> Dict[str, Any]:
    subject = found.get("subject") if isinstance(found.get("subject"), dict) else {}
    prefix = _prefix(subject, prompt)
    seen = _urls_seen(blocks)

    nodes = [n for n in (found.get("nodes") or []) if isinstance(n, dict)]
    evid = [e for e in (found.get("evidence") or []) if isinstance(e, dict)]
    strats, dropped = _usable_strategies(found)

    # Routes per node, from the node row AND from the evidence rows, so a node cannot claim a
    # route no evidence row supports.
    by_node_routes: Dict[str, set] = {}
    for e in evid:
        n = _s(e.get("node"))
        r = _s(e.get("route")).lower()
        if n and r in ROUTES and _s(e.get("direction")).lower() != "against":
            by_node_routes.setdefault(n, set()).add(r)

    # A node with no surviving strategy is not an answer to this question, whatever its
    # biology: the whole ask was what ANTISENSE could do about it. Those nodes are counted and
    # named in the notes rather than listed as if they were actionable.
    strat_nodes = {_s(s.get("node")) for s in strats if _s(s.get("node"))}
    actionable = [n for n in nodes if _s(n.get("node")) in strat_nodes]
    unreachable = [n for n in nodes if _s(n.get("node")) not in strat_nodes]

    source_rows: List[Dict[str, Any]] = []

    def keep_source(what: str, label: str, src: Any) -> None:
        d = src if isinstance(src, dict) else {}
        if not (_s(d.get("title")) or _s(d.get("url"))):
            return
        source_rows.append({
            "What": what, "Item": label, "Title": _s(d.get("title")),
            "Year": _year(d.get("year")), "URL": _s(d.get("url")),
            "Checked": _verified(d.get("url"), seen),
        })

    node_rows = []
    for n in actionable:
        name = _s(n.get("node")) or "(unnamed)"
        claimed = {_s(r).lower() for r in (n.get("routes") or []) if _s(r).lower() in ROUTES}
        backed = by_node_routes.get(name, set())
        shown = sorted(claimed & backed) or sorted(backed)
        mods = sorted({_s(s.get("modality")).lower() for s in strats if _s(s.get("node")) == name})
        node_rows.append({
            "Node": name,
            "Relation": _s(n.get("relation")),
            "Move": _s(n.get("direction")) or "increase",
            "Antisense": ", ".join(MODALITY_LABEL.get(m, m) for m in mods),
            "Routes": ", ".join(ROUTE_LABEL.get(r, r) for r in shown) or "none backed",
            "N": str(len(shown)),
            "Confidence": _s(n.get("confidence")),
            "How it compensates": _s(n.get("how")),
            "Expression where it matters": _s(n.get("tissue")),
            "Ceiling": _s(n.get("ceiling")),
            "What would kill it": _s(n.get("risks")),
        })
        keep_source("Node", name, n.get("source"))

    strat_rows = []
    for s in strats:
        label = _s(s.get("node")) + " — " + _s(s.get("approach"))
        strat_rows.append({
            "Node": _s(s.get("node")),
            "Modality": MODALITY_LABEL.get(_s(s.get("modality")).lower(), _s(s.get("modality"))),
            "Approach": _s(s.get("approach")),
            "Transcript": _s(s.get("transcript")),
            "Region": _s(s.get("region")),
            "Chemistry": _s(s.get("chemistry")),
            "Effect": _s(s.get("effect")),
            "Precedent": _s(s.get("precedent")),
            "Feasibility": _s(s.get("feasibility")),
            "Obstacle": _s(s.get("obstacle")),
        })
        keep_source("Strategy", label[:60], s.get("source"))

    ev_rows = []
    for e in evid:
        if _s(e.get("node")) not in strat_nodes:
            continue
        ev_rows.append({
            "Node": _s(e.get("node")),
            "Route": ROUTE_LABEL.get(_s(e.get("route")).lower(), _s(e.get("route"))),
            "Finding": _s(e.get("finding")),
            "Data": _s(e.get("data")),
            "Direction": _s(e.get("direction")),
            "Year": _year(e.get("year")),
            "Confidence": _s(e.get("confidence")),
        })
        keep_source("Evidence", _s(e.get("node")), e.get("source"))

    by_route = {r: sum(1 for row in node_rows if ROUTE_LABEL[r] in row["Routes"]) for r in ROUTES}
    multi = sum(1 for row in node_rows if int(row["N"] or 0) >= 2)
    by_mod = {m: sum(1 for s in strats if _s(s.get("modality")).lower() == m) for m in MODALITIES}
    unverified = sum(1 for r in source_rows if r["Checked"] != "yes")

    summary_rows = [
        {"Item": "Gene", "Value": _s(subject.get("gene")) or _s(prompt)},
        {"Item": "Assumed", "Value": _s(subject.get("assumption")) or "Loss of function at the RNA level"},
        {"Item": "What it does", "Value": _s(subject.get("function"))},
        {"Item": "What breaks", "Value": _s(subject.get("consequence"))},
        {"Item": "Context", "Value": _s(subject.get("context")) or "none given"},
        {"Item": "Compensatory nodes", "Value": str(len(node_rows))},
        {"Item": "Nodes with 2+ routes", "Value": str(multi)},
        {"Item": "Antisense strategies", "Value": str(len(strat_rows))},
    ]
    for m in MODALITIES:
        summary_rows.append({"Item": MODALITY_LABEL[m] + " strategies", "Value": str(by_mod[m])})
    for r in ROUTES:
        summary_rows.append({"Item": ROUTE_LABEL[r] + " evidence", "Value": str(by_route[r])})
    if unreachable:
        summary_rows.append({"Item": "Nodes with no antisense route",
                             "Value": str(len(unreachable)) + " — " + ", ".join(_s(n.get("node")) for n in unreachable[:6])})
    if dropped:
        summary_rows.append({"Item": "Strategies excluded by the question", "Value": str(len(dropped))})
    summary_rows.append({"Item": "Searches", "Value": str(info.get("searches") or 0)})
    summary_rows.append({"Item": "Model", "Value": _s(info.get("model"))})

    NODE_COLS = ["Node", "Relation", "Move", "Antisense", "Routes", "N", "Confidence",
                 "How it compensates", "Expression where it matters", "Ceiling", "What would kill it"]
    STRAT_COLS = ["Node", "Modality", "Approach", "Transcript", "Region", "Chemistry",
                  "Effect", "Precedent", "Feasibility", "Obstacle"]
    EV_COLS = ["Node", "Route", "Finding", "Data", "Direction", "Year", "Confidence"]
    SRC_COLS = ["What", "Item", "Title", "Year", "URL", "Checked"]

    def rows_of(headers: List[str], dicts: List[Dict[str, Any]]) -> List[List[str]]:
        return [[_s(d.get(h)) for h in headers] for d in dicts]

    tables = [
        {"name": f"{prefix}_Compensate_Nodes", "group": "Nodes",
         "headers": NODE_COLS, "rows": rows_of(NODE_COLS, node_rows)},
        {"name": f"{prefix}_Compensate_Strategies", "group": "Strategies",
         "headers": STRAT_COLS, "rows": rows_of(STRAT_COLS, strat_rows)},
        {"name": f"{prefix}_Compensate_Evidence", "group": "Evidence",
         "headers": EV_COLS, "rows": rows_of(EV_COLS, ev_rows)},
        {"name": f"{prefix}_Compensate_Sources", "group": "Sources",
         "headers": SRC_COLS, "rows": rows_of(SRC_COLS, source_rows)},
        {"name": f"{prefix}_Compensate_Summary", "group": "Nodes",
         "headers": ["Item", "Value"], "rows": rows_of(["Item", "Value"], summary_rows)},
    ]
    tables = [t for t in tables if t["rows"]]

    svgs = []
    try:
        if node_rows:
            svg = _compensation_svg(subject, node_rows, strats)
            if svg:
                svgs.append({"name": f"{prefix}_Compensate_Map",
                             "title": (_s(subject.get("gene")) or "Gene") + " — how the loss is covered",
                             "svg": svg})
    except Exception as exc:  # pragma: no cover - a picture is never worth the run
        works.msg("the map could not be drawn: %s" % exc)

    return {
        "subject": subject, "tables": tables, "svgs": svgs,
        "strategies": strats, "dropped": dropped, "unreachable": unreachable,
        "counts": {
            "nodes": len(node_rows), "strategies": len(strat_rows), "multi_route": multi,
            "by_route": by_route, "by_modality": by_mod, "unverified": unverified,
            "dropped": len(dropped), "unreachable": len(unreachable),
        },
    }


def _document(subject: Dict[str, Any], found: Dict[str, Any], built: Dict[str, Any],
              info: Dict[str, Any]) -> Dict[str, str]:
    esc = lambda t: (_s(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    counts = built["counts"]
    gene = _s(subject.get("gene")) or "Gene"
    parts = [f"<h2>{esc(gene)} — compensating a loss of function</h2>"]
    assumed = _s(subject.get("assumption")) or "Loss of function at the RNA level."
    ctx = _s(subject.get("context"))
    parts.append("<p><i>Read as: " + esc(gene) + " has lost function at the RNA level. "
                 + esc(assumed) + (" Restricted to " + esc(ctx) + "." if ctx else "") + "</i></p>")
    if _s(subject.get("consequence")):
        parts.append(f"<p><b>What breaks.</b> {esc(subject.get('consequence'))}</p>")
    if _s(found.get("summary")):
        parts.append(f"<p>{esc(found.get('summary'))}</p>")

    br = counts.get("by_route") or {}
    parts.append(
        "<p><b>Where the evidence came from.</b> "
        + ", ".join(f"{ROUTE_LABEL[r]}: {br.get(r, 0)}" for r in ROUTES)
        + f". {counts.get('multi_route', 0)} of {counts.get('nodes', 0)} nodes have two or more routes — "
        "one route is a hypothesis, several is a case.</p>")

    bm = counts.get("by_modality") or {}
    parts.append(
        "<p><b>What the oligo would do.</b> "
        + ", ".join(f"{MODALITY_LABEL[m]}: {bm.get(m, 0)}" for m in MODALITIES)
        + f" — {counts.get('strategies', 0)} strategies across {counts.get('nodes', 0)} nodes. "
        "Upregulation raises a gene that is still intact; knockdown removes something whose loss "
        "compensates; splicing changes which isoform is made.</p>")

    # THE EXCLUSION, STATED, NOT IMPLIED. A reader of this report needs to know that the
    # question was asked with its hands tied -- otherwise the absence of the obvious answer
    # looks like the tool missing it.
    parts.append(
        "<p><b>What was ruled out before the search started.</b> Gene replacement, editing of "
        "any kind, viral vectors, nucleases, transgenes, delivered mRNA and cell therapy are "
        "excluded by the question rather than by their merit. Everything here is something an "
        "oligonucleotide can do to RNA that the cell already makes.</p>")

    dropped = built.get("dropped") or []
    if dropped:
        parts.append(f"<p><b>{len(dropped)} proposed strateg"
                     + ("y was" if len(dropped) == 1 else "ies were")
                     + " dropped</b> for naming an excluded approach or a modality that is not "
                       "antisense:</p><ul>"
                     + "".join("<li>" + esc(_s(d.get('node')) + " — " + _s(d.get('approach')))
                               + " <i>(" + esc(d.get("_why")) + ")</i></li>" for d in dropped[:8])
                     + "</ul>")

    unreachable = built.get("unreachable") or []
    if unreachable:
        parts.append("<p><b>Nodes with no antisense route.</b> These came back as real "
                     "compensators with nothing an oligonucleotide could do about them, so they "
                     "are not in the tables. They are the list to revisit if the modality "
                     "constraint ever lifts: "
                     + esc(", ".join(_s(n.get("node")) for n in unreachable[:10])) + ".</p>")

    caveats = [c for c in (found.get("caveats") or []) if _s(c)]
    if caveats:
        parts.append("<p><b>What this does not cover.</b></p><ul>"
                     + "".join(f"<li>{esc(c)}</li>" for c in caveats) + "</ul>")

    unver = int(counts.get("unverified") or 0)
    parts.append(
        "<p><b>Reading the tables.</b> Every row keeps its source. Each citation is checked "
        "against what the search actually returned"
        + (f", and {unver} of them did not come back — those claims may still be right, but "
           "nothing here confirmed them, so look at the source before any of it goes into a plan."
           if unver else ", and all of them came back.")
        + " The column that matters most on a paralogue is <i>Expression where it matters</i>: a "
          "paralogue that is silent in the tissue the loss hurts is not a compensator, and that "
          "is the usual way one of these hypotheses dies.</p>")

    if not info.get("searched", True):
        parts.append("<p><b>Web search was unavailable</b>, so this is the model's own knowledge, "
                     "unverified and possibly out of date.</p>")
    return {"name": f"{gene} — compensation notes", "html": "".join(parts)}


# ---------------- earlier research ----------------
#
# A run is twenty web searches and two to three minutes of Opus, and what compensates for
# losing STXBP1 does not change between Tuesday and Thursday. So every prompt is kept with
# the research it led to, and a later prompt asking the same question is answered from it.
#
# IT SHARES py/ion-lib/repurpose_store.py, pointed at its own database. The schema is the
# same -- a prompt, a structured form of it, the findings, the blocks -- and duplicating four
# hundred lines to rename the file would be worse than reusing it. The store reads its path
# from the environment on every call, so setting it here (before the first store call) gives
# this tool a separate database running the same code: a repurposing run must never be offered
# as the answer to a compensation question, and separate files are the simplest way to be sure.
#
# Writing to os.environ cannot leak into another tool's run: the bridge starts each job with
# spawn("python3", ...) (baja-server/src/index.ts spawnPythonGated), so this process holds its
# own copy of the environment and exits with it. The age limit has to be set here too rather
# than afterwards, because the store reads it once at import.
def _point_store_at_our_own_db() -> None:
    os.environ.setdefault("REPURPOSE_CACHE_MAX_AGE_DAYS",
                          os.environ.get("COMPENSATE_CACHE_MAX_AGE_DAYS") or "180")
    if os.environ.get("COMPENSATE_STORE_PATH"):
        os.environ["REPURPOSE_STORE_PATH"] = os.environ["COMPENSATE_STORE_PATH"]
        return
    bd = os.environ.get("BIGDATA") or ""
    if bd:
        os.environ["REPURPOSE_STORE_PATH"] = os.path.join(bd, "compensate.sqlite")


ANALYZE_MODEL = os.environ.get("COMPENSATE_ANALYZE_MODEL") or MODEL

ANALYZE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["structured", "decision", "match_id", "reason"],
    "properties": {
        "structured": {
            "type": "object",
            "additionalProperties": False,
            "required": ["kind", "subject", "aliases", "target", "mechanism", "indication", "wants_fresh"],
            "properties": {
                "kind": {"type": "string", "enum": ["gene", "unclear"],
                         "description": "Always \"gene\" unless the prompt names no gene at all."},
                "subject": {"type": "string", "description": "The gene by its standard HGNC symbol."},
                "aliases": {"type": "array", "items": {"type": "string"},
                            "description": "Other symbols, previous symbols, protein names and spellings the gene goes by."},
                "target": {"type": "string", "description": "The gene symbol, repeated."},
                "mechanism": {"type": "string", "description": "An empty string: this tool always assumes RNA-level loss of function."},
                "indication": {"type": "string", "description": "The disease or tissue the prompt restricts the question to, or an empty string."},
                "wants_fresh": {"type": "boolean",
                                "description": "True when the prompt itself asks for new, latest, updated or re-run research."},
            },
        },
        "decision": {"type": "string", "enum": ["reuse", "new"]},
        "match_id": {"type": "integer", "description": "The id of the earlier run to reuse, or 0."},
        "reason": {"type": "string",
                   "description": "One sentence for the person who typed the prompt. Do not quote the earlier prompt."},
    },
}

ANALYZE_SYSTEM = """A therapeutics team names a gene and asks what could compensate for losing it at the RNA level, to be reached by antisense technology only. Researching one takes twenty web searches and a few minutes. Earlier research is kept, and your job is to say whether one of the earlier runs shown to you already answers the new prompt.

First put the new prompt in structured form. Give the gene its standard HGNC symbol and list the other names it goes by in `aliases` -- previous symbols, protein names, common misspellings. Those aliases are how a later prompt finds this one.

Then decide. Reuse an earlier run only when someone asking the new prompt would be fully served by it. The wording does not have to match: a gene named by an old symbol, a protein name or a current symbol is the same gene.

What has to match is the substance:
- the same gene. Not a paralogue, not another member of the family: the compensators for SCN1A are not the compensators for SCN2A even though each is the other's closest relative.
- the same restriction. If either prompt narrows the question to a disease, a tissue or a cell type -- this gene IN Dravet syndrome, IN liver, IN cortical interneurons -- the other must narrow it the same way. Compensation is tissue-specific in a way that repurposing is not: a paralogue that covers the loss in muscle may be silent in brain, so the same gene in a different tissue is a DIFFERENT question, and reusing across tissues is the mistake to avoid here.
- a question the earlier run actually answered. A run that found no node with an antisense route does not answer a new prompt any better than no run at all.

If the new prompt itself asks for new, latest, updated or re-run research, set wants_fresh and decide "new".

When you are unsure, decide "new". A needless run costs a few minutes; a wrong reuse puts another gene's compensators in front of someone as though they were the answer to theirs.

Set match_id to the id of the run to reuse, or 0 with "new". The reason is one plain sentence for the person who typed the prompt; it must not quote the earlier prompt, which may be someone else's."""


def analyze_prompt(prompt: str, max_nodes: int,
                   cands: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], str]:
    """Structure the prompt and judge it against earlier runs. Returns (analysis, error)."""
    if requests is None or not ANTHROPIC_API_KEY:
        return None, "no API access"
    shown = [{"id": c["id"], "age_days": c["age_days"], "prompt": c["prompt"],
              "kind": c.get("kind"), "subject": c.get("subject"),
              "nodes_found": c.get("candidates"), "structured": c.get("structured") or {}}
             for c in cands]
    user = ("New prompt:\n" + json.dumps({"prompt": prompt, "max_nodes": max_nodes},
                                          ensure_ascii=False)
            + "\n\nEarlier runs"
            + (" (none: structure the prompt and decide \"new\")" if not shown else "")
            + ":\n" + json.dumps(shown, ensure_ascii=False, indent=1))
    body: Dict[str, Any] = {
        "model": ANALYZE_MODEL,
        "max_tokens": 4000,
        "system": ANALYZE_SYSTEM,
        "messages": [{"role": "user", "content": user}],
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": ANALYZE_SCHEMA}},
        "fallbacks": "default",
    }
    try:
        r = requests.post(API_URL, headers=_headers(True), json=body, timeout=90)
        if r.status_code == 400 and "fallback" in (r.text or "").lower():
            body.pop("fallbacks", None)
            r = requests.post(API_URL, headers=_headers(False), json=body, timeout=90)
        if r.status_code != 200:
            return None, "analysis HTTP %s" % r.status_code
        data = r.json()
        out: Dict[str, Any] = {}
        for blk in (data.get("content") or []):
            if blk.get("type") == "text":
                try:
                    out = json.loads(blk.get("text") or "{}")
                    break
                except Exception:
                    continue
        if not isinstance(out, dict) or "decision" not in out:
            return None, "analysis returned nothing usable"
        out["_model"] = _s(data.get("model"))
        return out, ""
    except Exception as exc:
        return None, str(exc)


def _structured_from_findings(found: Dict[str, Any], prompt: str) -> Dict[str, Any]:
    """A structured form worked out from the research itself, for the case where the judge
    could not be reached: without one the run would be stored with no aliases and would never
    be found again."""
    subj = found.get("subject") if isinstance(found.get("subject"), dict) else {}
    gene = _s(subj.get("gene")) or _s(prompt)
    aliases = [_s(a) for a in (subj.get("aliases") or []) if _s(a)]
    return {
        "kind": "gene" if gene else "unclear",
        "subject": gene,
        "aliases": aliases,
        "target": gene,
        "mechanism": "",
        "indication": _s(subj.get("context")),
        "wants_fresh": False,
    }


# ---------------- the run ----------------

def run(prompt: str, opts: Dict[str, Any]) -> Dict[str, Any]:
    prompt = _s(prompt)
    if not prompt:
        return {"status": "error", "error": "Name a gene."}
    if requests is None:
        return {"status": "error", "error": "The server cannot reach the API (requests is missing)."}
    if not ANTHROPIC_API_KEY:
        return {"status": "error", "error": "No ANTHROPIC_API_KEY on the server."}

    max_nodes = int(opts.get("max_nodes") or DEFAULT_MAX_NODES)
    max_searches = int(opts.get("max_searches") or DEFAULT_MAX_SEARCHES)

    try:
        import claude_usage as _cu  # type: ignore
        _cu.bump("compensate")
    except Exception:
        pass

    _point_store_at_our_own_db()
    store = None
    try:
        import repurpose_store as store  # type: ignore
        if not store.enabled():
            store = None
    except Exception:
        store = None
    fresh = bool(opts.get("fresh"))
    options_log = {"max_nodes": max_nodes, "max_searches": max_searches, "fresh": fresh,
                   "tool": "compensate"}
    structured: Optional[Dict[str, Any]] = None
    judge_model, judge_ms, reason = "", 0, ""

    if store is not None:
        works.msg("Checking earlier research…")
        works.progress(2)
        cands = [] if fresh else store.candidates(prompt, max_nodes)
        t0 = time.time()
        analysis, err = analyze_prompt(prompt, max_nodes, cands)
        judge_ms = int((time.time() - t0) * 1000)
        if analysis is not None:
            structured = analysis.get("structured")
            judge_model = _s(analysis.get("_model"))
            reason = _s(analysis.get("reason"))
            ids = {c["id"] for c in cands}
            match_id = analysis.get("match_id")
            wants_fresh = bool((structured or {}).get("wants_fresh"))
            if (not fresh and not wants_fresh and analysis.get("decision") == "reuse"
                    and isinstance(match_id, int) and match_id in ids):
                prior = store.get_run(match_id)
                if prior and isinstance(prior.get("findings"), dict):
                    prior_info = prior.get("info") if isinstance(prior.get("info"), dict) else {}
                    # Say that it came from the store BEFORE rebuilding, so the progress bar
                    # learns which kind of run this is: a reused one takes seconds and a
                    # researched one takes minutes, and the bar keeps their histories apart
                    # on this message alone.
                    works.msg("Found earlier research: rebuilding the tables…")
                    works.progress(60)
                    result = _assemble(prior["findings"], prior.get("blocks") or [], prompt, prior_info)
                    if result.get("status") == "ok":
                        store.touch_hit(match_id)
                        store.log_prompt(prompt, options_log, structured, "reused", match_id,
                                         reason, judge_model, judge_ms)
                        result["cache"] = {
                            "hit": True, "run_id": match_id, "created_at": prior.get("created_at"),
                            "age_days": prior.get("age_days"), "reason": reason,
                            "prompt": prior.get("prompt") if prior.get("same_user") else "",
                        }
                        works.progress(95)
                        return result
        else:
            reason = "analysis unavailable: " + err

    works.msg("Looking for compensatory pathways…")
    works.progress(5)
    try:
        text, blocks, info = research(prompt, max_nodes, max_searches)
    except Exception:
        if store is not None:
            store.log_prompt(prompt, options_log, structured, "error", None, reason, judge_model, judge_ms)
        raise

    works.msg("Organising the strategies…")
    works.progress(85)
    found = _last_json_block(text)
    if not found:
        return {"status": "error",
                "error": "The research came back without a usable answer. Try again, or name the gene on its own.",
                "detail": text[:600]}

    result = _assemble(found, blocks, prompt, info)

    if store is not None:
        run_id = None
        if result.get("status") == "ok":
            if not isinstance(structured, dict):
                structured = _structured_from_findings(found, prompt)
            run_id = store.save_run(prompt, max_nodes, max_searches, structured, found, blocks,
                                    info, result.get("detection"))
        store.log_prompt(prompt, options_log, structured,
                         ("forced_new" if fresh else "new") if result.get("status") == "ok" else "error",
                         run_id, reason, judge_model, judge_ms)
        if result.get("status") == "ok":
            result["cache"] = {"hit": False, "run_id": run_id, "reason": reason}
    return result


# The result the canvas draws, built from the research. One function, so a run loaded from the
# store and a run just researched are assembled by exactly the same code.
def _assemble(found: Dict[str, Any], blocks: List[Dict[str, Any]], prompt: str,
              info: Dict[str, Any]) -> Dict[str, Any]:
    built = build_tables(found, blocks, prompt, info)
    doc = _document(built["subject"], found, built, info)
    counts = built["counts"]

    notes = []
    if not info.get("searched", True):
        notes.append("Web search was unavailable: everything here is model knowledge and unverified.")
    unchecked = int(counts.get("unverified") or 0)
    if unchecked:
        notes.append(f"{unchecked} row(s) cite a source the search did not return: treat those citations "
                     "as unconfirmed.")
    if counts["nodes"] and not counts["multi_route"]:
        notes.append("No node has more than one route of evidence: treat the whole list as hypotheses.")
    if counts.get("dropped"):
        notes.append(f"{counts['dropped']} proposed strateg"
                     + ("y was" if counts["dropped"] == 1 else "ies were")
                     + " dropped for relying on editing, gene therapy or another excluded approach.")
    if counts.get("unreachable"):
        notes.append(f"{counts['unreachable']} compensatory node(s) had no antisense route and are not "
                     "in the tables; the notes name them.")
    if not counts["nodes"]:
        notes.append("Nothing came back that antisense could reach. Try naming the tissue or the "
                     "disease as well, which lets the search judge a paralogue's expression.")

    works.progress(95)
    return {
        "status": "ok",
        "detection": {
            "kind": "gene",
            "subject": _s(built["subject"].get("gene")) or prompt,
            "context": _s(built["subject"].get("context")),
            "candidates": counts["nodes"],
            "nodes": counts["nodes"],
            "strategies": counts["strategies"],
            "multi_route": counts["multi_route"],
            "by_route": counts["by_route"],
            "by_modality": counts["by_modality"],
            "dropped": counts.get("dropped", 0),
            "searched": bool(info.get("searched", True)),
            "seconds": info.get("seconds"),
        },
        "tables": built["tables"],
        "svgs": built.get("svgs") or [],
        "documents": [doc],
        "notes": notes,
        "diagnostics": "NO_ISSUES_DETECTED",
    }


def _friendly_error(msg: str) -> str:
    m = (msg or "").lower()
    if "credit balance is too low" in m:
        return ("The Anthropic account this server's API key belongs to has no credit left, so the "
                "research could not run. Add credits in the Console, and check that the key's "
                "WORKSPACE has a spend limit above zero.")
    if "invalid x-api-key" in m or "authentication_error" in m or "anthropic 401" in m:
        return ("The Anthropic API key on the server was rejected. Set ANTHROPIC_API_KEY in "
                "/opt/baja-server/.env and restart the service.")
    if "rate_limit" in m or "anthropic 429" in m:
        return "Anthropic rate limit reached. Give it a minute and run it again."
    if "overloaded" in m or "anthropic 529" in m:
        return "Anthropic is overloaded right now. Run it again shortly."
    return msg


def _load_json_param(v: Any) -> Any:
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str) and v.strip()[:1] in ("{", "["):
        try:
            return json.loads(v)
        except Exception:
            return None
    return None


def _main_ion() -> int:
    prompt = works.param(1) or ""
    opts = _load_json_param(works.param(2)) or {}
    if not isinstance(opts, dict):
        opts = {}
    try:
        result = run(prompt, opts)
    except ApiError as e:
        result = {"status": "error", "error": _friendly_error(str(e)), "detail": str(e)}
    except Exception as e:  # pragma: no cover - surfaced to the UI
        result = {"status": "error", "error": f"{type(e).__name__}: {e}"}
    works.progress(100)
    works.resolve(result)
    return 0 if result.get("status") != "error" else 1


_main_ion()
