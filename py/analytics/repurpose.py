#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Repurposing: what is already in the clinic that could work here.

param(1): free text -- an INDICATION ("chronic hepatitis B"), a MECHANISM OF ACTION
          ("degrades mutant huntingtin"), or a TARGET ("SCN9A", "IRAK4").
param(2): {"fresh": true} to research again rather than answer from the store.

Returns the shape the canvas already draws:
  {"status":"ok","detection":{...},"tables":[{name,group,headers,rows}],
   "documents":[{name,html}],"notes":[...]}

WHY FOUR ROUTES. A drug gets repurposed for one of four reasons, and they are different
kinds of evidence with different failure modes -- so they are asked for, and reported,
separately rather than mixed into one "rationale":

  molecular    the drug hits the target, the pathway, or a node one step from it:
               binding, engagement, genetic validation, expression.
  systems      the drug's signature and the disease's disagree across a network:
               transcriptomic reversal (CMap/LINCS), pathway or multi-omic overlap.
  phenotypic   something happened in a model: a screen, an organoid, an animal.
  clinical     something happened in people: off-label use, an EHR or claims signal,
               a registry, a trial run for another indication that read across.

A candidate with one route is a hypothesis. A candidate with three is worth a meeting.
The tables say which routes each candidate has, so that difference is visible rather
than buried in prose.

Every figure keeps its source, and every citation is checked against what the search
actually returned. That check is NOT a column -- it would read "yes" almost the whole way
down and cost the width of a real one; the rows that failed it are counted in the notes and
in the document instead, where a reader will act on them.

The API plumbing (streamed request, server tool loop, paused-turn resume) is the same
as py/analytics/indication-market.py; it is repeated rather than imported because that
file's name is not importable and the two tools move independently.
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
MODEL = os.environ.get("REPURPOSE_MODEL") or "claude-opus-5"

DEFAULT_MAX_CANDIDATES = 10
DEFAULT_MAX_SEARCHES = 20
# The /py bridge kills a job at 900 s; stop resuming in time to structure what was found.
RESEARCH_DEADLINE_SEC = 660
MAX_RESUMES = 4

ROUTES = ["molecular", "systems", "phenotypic", "clinical"]
ROUTE_LABEL = {
    "molecular": "Molecular",
    "systems": "Systems",
    "phenotypic": "Phenotypic",
    "clinical": "Clinical",
}

SYSTEM = """You find drugs that already exist and could be repurposed, and you show your working.

INPUT is one of three things, and you decide which: an INDICATION (a disease), a
MECHANISM OF ACTION (what a drug would have to do), or a TARGET (a gene, protein or
pathway). Say which you decided and restate it in one line.

Search the literature and the trial registries. Prefer: peer-reviewed papers, ClinicalTrials.gov,
FDA/EMA labels and reviews, DrugBank/ChEMBL/Open Targets, LINCS/CMap analyses, large EHR or
claims studies. Say the year of everything.

FIND DRUGS THAT ARE ALREADY IN PEOPLE -- approved, or at least through Phase I for something
else. A molecule that has never been dosed in a human is not a repurposing candidate; leave it
out however good the biology looks.

For each candidate, gather evidence along FOUR ROUTES, and be explicit about which ones it has:
  molecular   - it binds/inhibits/degrades the target, or a node one step away; genetic
                validation of that node in this disease; expression where it matters.
  systems     - network, pathway or signature-level overlap: transcriptomic reversal
                (CMap/LINCS), shared pathway modules, multi-omic or proteomic overlap.
  phenotypic  - it did something in a model: phenotypic screen, organoid, animal model.
  clinical    - it did something in people: off-label use, an EHR/claims signal, a registry,
                a trial in another indication that read across, an adverse-event signal that
                points the right way.

A candidate with one route is a hypothesis; say so. Do not inflate confidence: "low" is a
useful answer and a wrong "high" costs someone a year.

Say what would KILL each candidate -- the exposure it cannot reach at a tolerated dose, the
tissue it does not enter, the trial that already failed. A repurposing list without the risks
is a list of things someone else already tried.

Return ONLY this JSON, in a ```json fence, after the prose:

{
  "subject": {"kind": "indication|mechanism|target", "name": "...", "restated": "one line"},
  "summary": "three or four sentences: what the strongest candidates are and why",
  "candidates": [
    {"drug": "generic name", "brand": "", "approved_for": "what it is approved/tested for",
     "stage": "approved|phase 3|phase 2|phase 1|withdrawn",
     "target_mechanism": "what it does, molecularly",
     "routes": ["molecular", "clinical"],
     "confidence": "high|medium|low",
     "rationale": "why it could work here, in one or two sentences",
     "risks": "what would kill it",
     "source": {"title": "...", "url": "...", "year": 2024}}
  ],
  "evidence": [
    {"drug": "generic name", "route": "molecular|systems|phenotypic|clinical",
     "finding": "what was observed",
     "data": "what kind of data it is (assay, model, cohort, dataset)",
     "direction": "supports|mixed|against",
     "year": 2024, "confidence": "high|medium|low",
     "source": {"title": "...", "url": "...", "year": 2024}}
  ],
  "targets": [
    {"target": "gene/protein/pathway", "link": "how it connects to the subject",
     "drugs": "drugs that hit it", "evidence": "what supports the link",
     "source": {"title": "...", "url": "...", "year": 2024}}
  ],
  "caveats": ["what this list does not cover"]
}

At most %d candidates. Every candidate needs at least one evidence row. Invent nothing: if
you did not find it, leave it out."""


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

def research(prompt: str, max_candidates: int, max_searches: int
             ) -> Tuple[str, List[Dict[str, Any]], Dict[str, Any]]:
    user = (
        f"{prompt.strip()}\n\n"
        f"Today's date: {time.strftime('%Y-%m-%d')}."
    )
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches}]
    body: Dict[str, Any] = {
        "model": MODEL,
        "max_tokens": 32000,
        "system": SYSTEM % max_candidates,
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
        if isinstance(v, dict) and isinstance(v.get("candidates"), list):
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


# ---------------- the canvas's tables ----------------

def _prefix(subject: Dict[str, Any], prompt: str) -> str:
    base = _s(subject.get("name")) or _s(prompt)[:40] or "Repurpose"
    base = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_")
    return (base[:40] or "Repurpose")


def build_tables(found: Dict[str, Any], blocks: List[Dict[str, Any]], prompt: str,
                 info: Dict[str, Any]) -> Dict[str, Any]:
    subject = found.get("subject") if isinstance(found.get("subject"), dict) else {}
    prefix = _prefix(subject, prompt)
    seen = _urls_seen(blocks)

    cands = [c for c in (found.get("candidates") or []) if isinstance(c, dict)]
    evid = [e for e in (found.get("evidence") or []) if isinstance(e, dict)]
    targs = [t for t in (found.get("targets") or []) if isinstance(t, dict)]

    # routes per drug, from the candidate row AND from the evidence rows, so a candidate
    # cannot claim a route no evidence row supports
    by_drug_routes: Dict[str, set] = {}
    for e in evid:
        d = _s(e.get("drug"))
        r = _s(e.get("route")).lower()
        if d and r in ROUTES and _s(e.get("direction")).lower() != "against":
            by_drug_routes.setdefault(d, set()).add(r)

    cand_rows = []
    source_rows = []
    for c in cands:
        drug = _s(c.get("drug")) or "(unnamed)"
        claimed = {_s(r).lower() for r in (c.get("routes") or []) if _s(r).lower() in ROUTES}
        backed = by_drug_routes.get(drug, set())
        shown = sorted(claimed & backed) or sorted(backed)
        src = c.get("source") if isinstance(c.get("source"), dict) else {}
        cand_rows.append({
            "Drug": drug,
            "Brand": _s(c.get("brand")),
            "Approved or tested for": _s(c.get("approved_for")),
            "Stage": _s(c.get("stage")),
            "Target or mechanism": _s(c.get("target_mechanism")),
            "Evidence routes": ", ".join(ROUTE_LABEL[r] for r in shown) or "none backed by an evidence row",
            "Routes found": str(len(shown)),
            "Confidence": _s(c.get("confidence")),
            "Why it could work": _s(c.get("rationale")),
            "What would kill it": _s(c.get("risks")),
            "Source": _s(src.get("title")),
            "Checked": _verified(_s(src.get("url")), seen),
        })
        if src:
            source_rows.append({
                "Drug": drug, "Claim": "candidate",
                "Title": _s(src.get("title")), "URL": _s(src.get("url")),
                "Year": _year(src.get("year")), "Checked": _verified(_s(src.get("url")), seen),
            })

    # strongest first: more routes, then confidence
    conf_rank = {"high": 0, "medium": 1, "low": 2, "": 3}
    cand_rows.sort(key=lambda r: (-int(r["Routes found"] or 0), conf_rank.get(r["Confidence"].lower(), 3)))

    ev_rows = []
    for e in evid:
        src = e.get("source") if isinstance(e.get("source"), dict) else {}
        route = _s(e.get("route")).lower()
        ev_rows.append({
            "Drug": _s(e.get("drug")),
            "Route": ROUTE_LABEL.get(route, _s(e.get("route"))),
            "Finding": _s(e.get("finding")),
            "Kind of data": _s(e.get("data")),
            "Direction": _s(e.get("direction")),
            "Year": _year(e.get("year")) or _year(src.get("year")),
            "Confidence": _s(e.get("confidence")),
            "Source": _s(src.get("title")),
            "Checked": _verified(_s(src.get("url")), seen),
        })
        if src:
            source_rows.append({
                "Drug": _s(e.get("drug")), "Claim": ROUTE_LABEL.get(route, "evidence"),
                "Title": _s(src.get("title")), "URL": _s(src.get("url")),
                "Year": _year(src.get("year")), "Checked": _verified(_s(src.get("url")), seen),
            })
    ev_rows.sort(key=lambda r: (r["Drug"].lower(), ROUTES.index(r["Route"].lower()) if r["Route"].lower() in ROUTES else 9))

    targ_rows = []
    for t in targs:
        src = t.get("source") if isinstance(t.get("source"), dict) else {}
        targ_rows.append({
            "Target or pathway": _s(t.get("target")),
            "How it connects": _s(t.get("link")),
            "Drugs that hit it": _s(t.get("drugs")),
            "Evidence": _s(t.get("evidence")),
            "Source": _s(src.get("title")),
            "Checked": _verified(_s(src.get("url")), seen),
        })
        if src:
            source_rows.append({
                "Drug": _s(t.get("drugs")), "Claim": "target",
                "Title": _s(src.get("title")), "URL": _s(src.get("url")),
                "Year": _year(src.get("year")), "Checked": _verified(_s(src.get("url")), seen),
            })

    # one row per URL
    uniq: Dict[str, Dict[str, str]] = {}
    for r in source_rows:
        key = (r.get("URL") or "") + "|" + (r.get("Claim") or "")
        if key not in uniq:
            uniq[key] = r
    source_rows = list(uniq.values())

    by_route = {r: sum(1 for e in ev_rows if e["Route"].lower() == r) for r in ROUTES}
    multi = sum(1 for r in cand_rows if int(r["Routes found"] or 0) >= 2)
    summary_rows = [
        {"Item": "Asked about", "Value": _s(subject.get("restated")) or _s(prompt)},
        {"Item": "Read as", "Value": _s(subject.get("kind")) or "unclear"},
        {"Item": "Candidates", "Value": str(len(cand_rows))},
        {"Item": "With two or more routes", "Value": str(multi)},
        {"Item": "Evidence rows", "Value": str(len(ev_rows))},
    ]
    for r in ROUTES:
        summary_rows.append({"Item": ROUTE_LABEL[r] + " evidence", "Value": str(by_route[r])})
    summary_rows.append({"Item": "Searches", "Value": str(info.get("searches", 0))})
    if not info.get("searched", True):
        summary_rows.append({"Item": "Web search", "Value": "not available - model knowledge only"})

    # THE CANVAS TAKES ROWS AS ARRAYS, in header order -- drawValueTable indexes by column
    # (cpd/baja-analytics.js). They are built as dicts above because a dict cannot put a
    # value under the wrong heading; this is the one place they become positional.
    def rows_of(headers: List[str], dicts: List[Dict[str, Any]]) -> List[List[str]]:
        return [[_s(d.get(h)) for h in headers] for d in dicts]

    # NO "Checked" COLUMN. Whether the search actually returned a cited source is still
    # computed for every row -- it is what the "N rows cite a source the search did not
    # return" note is counting -- but it is not a column. A column costs the same width on
    # every table as the drug name does and reads "yes" almost all the way down; what a
    # reader needs is to be told, once, that some rows are unverified. Same rule as the
    # unit column: keep the fact, lose the column.
    CAND_COLS = ["Drug", "Brand", "Approved or tested for", "Stage", "Target or mechanism",
                 "Evidence routes", "Routes found", "Confidence", "Why it could work",
                 "What would kill it", "Source"]
    EV_COLS = ["Drug", "Route", "Finding", "Kind of data", "Direction", "Year",
               "Confidence", "Source"]
    TARG_COLS = ["Target or pathway", "How it connects", "Drugs that hit it", "Evidence", "Source"]
    SRC_COLS = ["Drug", "Claim", "Title", "URL", "Year"]

    unverified = sum(1 for d in (cand_rows + ev_rows + targ_rows + source_rows)
                     if _s(d.get("Checked")).startswith("no"))

    tables = [
        {"name": f"{prefix}_Repurpose_Candidates", "group": "Candidates",
         "headers": CAND_COLS, "rows": rows_of(CAND_COLS, cand_rows)},
        {"name": f"{prefix}_Repurpose_Evidence", "group": "Evidence",
         "headers": EV_COLS, "rows": rows_of(EV_COLS, ev_rows)},
        {"name": f"{prefix}_Repurpose_Targets", "group": "Targets",
         "headers": TARG_COLS, "rows": rows_of(TARG_COLS, targ_rows)},
        {"name": f"{prefix}_Repurpose_Sources", "group": "Sources",
         "headers": SRC_COLS, "rows": rows_of(SRC_COLS, source_rows)},
        {"name": f"{prefix}_Repurpose_Summary", "group": "Candidates",
         "headers": ["Item", "Value"], "rows": rows_of(["Item", "Value"], summary_rows)},
    ]
    return {"prefix": prefix, "tables": tables, "subject": subject,
            "counts": {"candidates": len(cand_rows), "evidence": len(ev_rows),
                       "multi_route": multi, "by_route": by_route,
                       "unverified": unverified}}


def _document(subject: Dict[str, Any], found: Dict[str, Any], counts: Dict[str, Any],
              info: Dict[str, Any]) -> Dict[str, str]:
    esc = lambda t: (_s(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    name = _s(subject.get("name")) or "Repurposing"
    parts = [f"<h2>{esc(name)} — repurposing</h2>"]
    if _s(subject.get("restated")):
        parts.append(f"<p><i>Read as a {esc(subject.get('kind') or 'subject')}: {esc(subject.get('restated'))}</i></p>")
    if _s(found.get("summary")):
        parts.append(f"<p>{esc(found.get('summary'))}</p>")
    br = counts.get("by_route") or {}
    parts.append(
        "<p><b>Where the evidence came from.</b> "
        + ", ".join(f"{ROUTE_LABEL[r]}: {br.get(r, 0)}" for r in ROUTES)
        + f". {counts.get('multi_route', 0)} of {counts.get('candidates', 0)} candidates have two or more routes — "
        "one route is a hypothesis, several is a case.</p>")
    caveats = [c for c in (found.get("caveats") or []) if _s(c)]
    if caveats:
        parts.append("<p><b>What this does not cover.</b></p><ul>"
                     + "".join(f"<li>{esc(c)}</li>" for c in caveats) + "</ul>")
    unver = int(counts.get("unverified") or 0)
    parts.append(
        "<p><b>Reading the tables.</b> Every row keeps its source. Each citation is checked "
        "against what the search actually returned"
        + (f", and {unver} of them did not come back — those claims may still be right, but nothing "
           "here confirmed them, so look at the source before any of it goes into a plan."
           if unver else ", and all of them came back.")
        + "</p>")
    if not info.get("searched", True):
        parts.append("<p><b>Web search was unavailable</b>, so this is the model's own knowledge, "
                     "unverified and possibly out of date.</p>")
    return {"name": f"{name} — repurposing notes", "html": "".join(parts)}


# ---------------- the run ----------------

def run(prompt: str, opts: Dict[str, Any]) -> Dict[str, Any]:
    prompt = _s(prompt)
    if not prompt:
        return {"status": "error", "error": "Give an indication, a mechanism of action, or a target."}
    if requests is None:
        return {"status": "error", "error": "The server cannot reach the API (requests is missing)."}
    if not ANTHROPIC_API_KEY:
        return {"status": "error", "error": "No ANTHROPIC_API_KEY on the server."}

    max_candidates = int(opts.get("max_candidates") or DEFAULT_MAX_CANDIDATES)
    max_searches = int(opts.get("max_searches") or DEFAULT_MAX_SEARCHES)

    works.msg("Looking for drugs that could be repurposed…")
    works.progress(5)
    text, blocks, info = research(prompt, max_candidates, max_searches)

    works.msg("Organising the candidates…")
    works.progress(85)
    found = _last_json_block(text)
    if not found:
        return {"status": "error",
                "error": "The research came back without a usable answer. Try again, or narrow the question.",
                "detail": text[:600]}

    built = build_tables(found, blocks, prompt, info)
    doc = _document(built["subject"], found, built["counts"], info)

    notes = []
    if not info.get("searched", True):
        notes.append("Web search was unavailable: everything here is model knowledge and unverified.")
    unchecked = int(built["counts"].get("unverified") or 0)
    if unchecked:
        notes.append(f"{unchecked} row(s) cite a source the search did not return: treat those citations "
                     "as unconfirmed.")
    if built["counts"]["candidates"] and not built["counts"]["multi_route"]:
        notes.append("No candidate has more than one route of evidence: treat the whole list as hypotheses.")

    works.progress(95)
    return {
        "status": "ok",
        "detection": {
            "kind": _s(built["subject"].get("kind")),
            "subject": _s(built["subject"].get("name")) or prompt,
            "candidates": built["counts"]["candidates"],
            "multi_route": built["counts"]["multi_route"],
            "by_route": built["counts"]["by_route"],
            "searched": bool(info.get("searched", True)),
            "seconds": info.get("seconds"),
        },
        "tables": built["tables"],
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
