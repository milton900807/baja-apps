#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Indication market sizing for the Analytics canvas.

A user names a disease, or a series of indications, and optionally the therapeutic
approach (target, mechanism, modality). Claude researches the patient population for
each indication with live web search, then proposes further indications the same
approach could expand into, with their populations. The result comes back as finished
value tables for the canvas, every figure tied to the source it came from.

Ion Works params
----------------
param(1): the user's prompt, free text:
            "Huntington's disease"
            "ATTR amyloidosis and AL amyloidosis, siRNA against TTR, Europe"
param(2): optional options dict. Every key is optional:
            {
              "region":         "United States"  primary geography when the prompt names none
              "max_expansions": 6                 ceiling on proposed expansion indications
              "max_searches":   12                ceiling on web searches
            }

Environment
-----------
ANTHROPIC_API_KEY          set by the /py bridge
INDICATION_MARKET_MODEL    optional model override; default claude-opus-5

Method
------
1. One streamed Messages API call with the web search server tool. Each search query is
   reported to the canvas as it is issued, and a paused turn (the server-side loop limit)
   is resumed until the model finishes.
2. The model ends with one JSON block. If that block is missing or does not parse, a
   second call restates the research as JSON under a schema (structured output cannot be
   combined with search citations in a single call).
3. Each source URL is compared with the URLs the search tool actually returned. A figure
   whose source never appeared in the search results is kept but marked, so it can be
   checked before it is relied on.
4. If web search is not enabled for the API key the research still runs, from the model's
   own knowledge, and every table says so.

Result
------
{ "status": "ok",
  "detection": {...},                       region, approach, model, searches, counts
  "tables": [ {"name", "headers", "rows"} ] tables to draw, in order
  "notes": [...] }
{ "status": "error", "error": "..." }

Calls the Messages API over HTTPS with `requests`, matching the other Claude tools in
baja-apps: the production python has no Anthropic SDK.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any, Dict, Iterator, List, Optional, Tuple

try:
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None  # type: ignore

try:
    from ion import works  # type: ignore
except Exception:  # pragma: no cover - local runs without the ion package
    class _Works:
        def msg(self, s: str) -> None:
            print("MSG:", s, file=sys.stderr)

        def progress(self, v: Any) -> None:
            print("PROGRESS:", v, file=sys.stderr)

        def resolve(self, obj: Any) -> None:
            print(json.dumps(obj, indent=2))

        def param(self, i: int) -> Any:
            return sys.argv[i] if len(sys.argv) > i else None

    works = _Works()  # type: ignore


API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("INDICATION_MARKET_MODEL") or "claude-opus-5"

DEFAULT_REGION = "United States"
DEFAULT_MAX_EXPANSIONS = 6
DEFAULT_MAX_SEARCHES = 20
# The /py bridge kills a job at 900 s. Stop resuming paused turns well before that so
# there is always time left to structure and return what was found.
RESEARCH_DEADLINE_SEC = 660
MAX_RESUMES = 4


SYSTEM = """You are researching market size for a therapeutics team. They name a disease, or several indications, and sometimes the therapeutic approach (a target, mechanism or modality). Your findings are drawn as tables on a spreadsheet canvas where the team builds patient forecasts and revenue models on top of them, so the numbers will be reused in calculations by people who will not re-read your reasoning. That makes three things matter more than polish: each figure has to be a plain number, it has to say exactly what it counts, and it has to be traceable to where it came from.

What to find, for every indication the user named:
- Prevalence (people living with the condition) and annual incidence (new cases per year) in the primary region, and global prevalence where it is reported. The primary region is the one the user names; otherwise use the default given in the request.
- The addressable population in the primary region: the patients a new therapy could realistically reach. Start from prevalence and narrow it by whatever applies and is documented, such as the diagnosed fraction, the genetic or biomarker subtype the approach needs, the age or severity range, or the line of therapy. State the narrowing in one sentence. If nothing supports narrowing, use prevalence and say so.
- Current standard of care and the main unmet need, briefly.

Then propose expansion indications: other conditions where the same therapeutic approach could plausibly work, which would enlarge the market. Good candidates share the target, pathway, causal genetics or affected tissue with a named indication, or follow a precedent where an approved drug with a similar mechanism expanded its label. If the user gave a target, mechanism or modality, anchor on it. If they did not, reason from shared pathophysiology and record that assumption in the approach field. Order them from most to least plausible, give the same population figures for each, and explain the link in one sentence. Leave out an indication when the only connection is that it is large; a short list the team can defend is worth more than a long one.

Use web search to find the figures. Searches are limited, so spread them across every indication rather than exhausting them on the first one; one good epidemiology source per indication is enough. Prefer primary and authoritative sources: peer-reviewed epidemiology, CDC, NIH, NCI SEER, GARD, Orphanet, WHO, GLOBOCAN, patient registries, and regulator or company filings. Avoid market-research vendor landing pages, which often quote numbers without a method. When sources disagree, take the most recent credible one and mention the range in the basis.

Accuracy rules:
- Report a number only when a source supports it. When you cannot find one, use null and explain in the basis. A blank cell the team knows about is far less harmful than a plausible invented figure that ends up inside a forecast.
- When you derive a number, for example a published rate multiplied by a population, say so in the basis and show the inputs.
- Keep prevalence and incidence apart, and total apart from diagnosed. Do not put a per-100,000 rate in a field meant for a count of people; convert it and note the conversion.
- A source's url must be one you actually retrieved in this conversation.
- Overlap matters: if indications share patients, say so in notes, because the team will otherwise add the rows together.

Finish your reply with exactly one fenced ```json block, and keep any text before it to a few sentences. The block must follow this shape:

{
  "region": "primary region used",
  "approach": "the therapeutic approach as given by the user, or the assumption you reasoned from",
  "summary": "two or three sentences on the overall opportunity",
  "indications": [
    {
      "name": "indication name",
      "type": "requested" or "expansion",
      "link": "for an expansion, one sentence on why the same approach applies; empty for requested",
      "plausibility": "high", "medium" or "low" for an expansion; empty for requested,
      "prevalence_region": number or null,
      "incidence_region_per_year": number or null,
      "prevalence_global": number or null,
      "addressable_region": number or null,
      "addressable_basis": "one sentence: how the addressable figure was reached, including any derivation or range",
      "standard_of_care": "brief",
      "unmet_need": "brief",
      "confidence": "high", "medium" or "low" - how well sourced the figures are,
      "sources": [ { "figure": "which figure this supports", "title": "source title", "url": "https://...", "year": "publication or data year" } ]
    }
  ],
  "notes": [ "caveats the team should see, such as patient overlap between rows" ]
}
"""


# Used only when the research reply carries no parseable JSON block.
SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["region", "approach", "summary", "indications", "notes"],
    "properties": {
        "region": {"type": "string"},
        "approach": {"type": "string"},
        "summary": {"type": "string"},
        "notes": {"type": "array", "items": {"type": "string"}},
        "indications": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "type", "link", "plausibility", "prevalence_region",
                             "incidence_region_per_year", "prevalence_global", "addressable_region",
                             "addressable_basis", "standard_of_care", "unmet_need", "confidence", "sources"],
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string", "enum": ["requested", "expansion"]},
                    "link": {"type": "string"},
                    "plausibility": {"type": "string"},
                    "prevalence_region": {"type": ["number", "null"]},
                    "incidence_region_per_year": {"type": ["number", "null"]},
                    "prevalence_global": {"type": ["number", "null"]},
                    "addressable_region": {"type": ["number", "null"]},
                    "addressable_basis": {"type": "string"},
                    "standard_of_care": {"type": "string"},
                    "unmet_need": {"type": "string"},
                    "confidence": {"type": "string"},
                    "sources": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["figure", "title", "url", "year"],
                            "properties": {
                                "figure": {"type": "string"},
                                "title": {"type": "string"},
                                "url": {"type": "string"},
                                "year": {"type": "string"},
                            },
                        },
                    },
                },
            },
        },
    },
}


# ---------------- Messages API (streamed) ----------------

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
    """POST one streamed request and rebuild the final message from its events.

    The content blocks are rebuilt exactly (thinking signatures, server tool inputs,
    encrypted search results) because a paused turn is resumed by sending them back.
    """
    body = dict(body)
    body["stream"] = True
    # Server-side refusal fallback: if the primary model declines, the API re-runs the
    # same request on a fallback model inside the same call.
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
                # Fallbacks not accepted for this model / account: retry the plain request.
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
                message["usage"] = dict(m.get("usage") or {})
            elif t == "content_block_start":
                i = int(ev.get("index", 0))
                blocks[i] = dict(ev.get("content_block") or {})
                partial[i] = ""
            elif t == "content_block_delta":
                i = int(ev.get("index", 0))
                b = blocks.get(i)
                d = ev.get("delta") or {}
                if b is None:
                    continue
                dt = d.get("type")
                if dt == "text_delta":
                    b["text"] = (b.get("text") or "") + (d.get("text") or "")
                elif dt == "input_json_delta":
                    partial[i] = partial.get(i, "") + (d.get("partial_json") or "")
                elif dt == "thinking_delta":
                    b["thinking"] = (b.get("thinking") or "") + (d.get("thinking") or "")
                elif dt == "signature_delta":
                    b["signature"] = d.get("signature") or ""
                elif dt == "citations_delta":
                    b.setdefault("citations", [])
                    if b["citations"] is None:
                        b["citations"] = []
                    b["citations"].append(d.get("citation"))
            elif t == "content_block_stop":
                i = int(ev.get("index", 0))
                b = blocks.get(i)
                if b is not None and b.get("type") in ("server_tool_use", "tool_use"):
                    # The input either streams as input_json_delta or arrives whole in
                    # content_block_start; only replace it when deltas actually came.
                    if partial.get(i):
                        try:
                            b["input"] = json.loads(partial[i])
                        except Exception:
                            b["input"] = b.get("input") or {}
                    elif not isinstance(b.get("input"), dict):
                        b["input"] = {}
                    if on_search and b.get("name") == "web_search":
                        q = (b.get("input") or {}).get("query")
                        if q:
                            on_search(str(q))
            elif t == "message_delta":
                d = ev.get("delta") or {}
                if d.get("stop_reason"):
                    message["stop_reason"] = d.get("stop_reason")
                if d.get("stop_details"):
                    message["stop_details"] = d.get("stop_details")
                message["usage"].update(ev.get("usage") or {})
            elif t == "error":
                err = ev.get("error") or {}
                raise ApiError("anthropic stream error: %s" % (err.get("message") or err.get("type") or "unknown"))
        message["content"] = [blocks[i] for i in sorted(blocks)]
        return message

    raise ApiError("Claude is busy (rate limited or overloaded). Try again in a minute.")


def _text_of(content: List[Dict[str, Any]]) -> str:
    return "".join(b.get("text") or "" for b in content if b.get("type") == "text")


# ---------------- research ----------------

def research(prompt: str, region: str, max_expansions: int, max_searches: int
             ) -> Tuple[str, List[Dict[str, Any]], Dict[str, Any]]:
    """Returns (reply text, content blocks across all turns, run info)."""
    user = (
        f"{prompt.strip()}\n\n"
        f"Default primary region when none is named above: {region}.\n"
        f"Propose at most {max_expansions} expansion indications.\n"
        f"Today's date: {time.strftime('%Y-%m-%d')}."
    )
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": max_searches}]
    body: Dict[str, Any] = {
        "model": MODEL,
        "max_tokens": 32000,
        "system": SYSTEM,
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
        # Web search is switched on per organisation in the Console. Without it the run
        # still answers from the model's own knowledge, and the tables say so.
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
            raise ApiError("the model declined this request" + (f" ({det.get('category')})" if det.get("category") else ""))
        if msg.get("stop_reason") != "pause_turn":
            break
        if resumes >= MAX_RESUMES or time.time() - started > RESEARCH_DEADLINE_SEC:
            break
        # The server-side tool loop hit its iteration limit. Send the paused turn back
        # unchanged and the API resumes it; no extra user message is needed.
        resumes += 1
        body["messages"] = body["messages"] + [{"role": "assistant", "content": msg.get("content") or []}]
        msg = _stream_message(body, on_search)

    info["stop_reason"] = msg.get("stop_reason")
    info["seconds"] = round(time.time() - started, 1)
    # Dynamic filtering can issue searches from inside the server's code sandbox, where
    # they never surface as a web_search tool call; the result blocks are the true count.
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
        if isinstance(v, dict) and isinstance(v.get("indications"), list):
            return v
    return None


def structure(prompt: str, research_text: str, found: List[Dict[str, str]]) -> Dict[str, Any]:
    """Fallback: restate finished research as JSON under SCHEMA."""
    works.msg("Organising the findings…")
    listing = "\n".join(f"- {s.get('title') or ''} | {s.get('url') or ''}" for s in found[:80])
    body: Dict[str, Any] = {
        "model": MODEL,
        "max_tokens": 16000,
        "system": SYSTEM,
        "messages": [{
            "role": "user",
            "content": (
                "Restate the research below as the JSON object described in your instructions. "
                "Use only figures and sources that appear in it; use null where it gives no figure.\n\n"
                f"Original request:\n{prompt.strip()}\n\n"
                f"Research:\n{research_text.strip()}\n\n"
                f"Pages the search returned:\n{listing}"
            ),
        }],
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
    }
    msg = _stream_message(body, None)
    if msg.get("stop_reason") == "refusal":
        raise ApiError("the model declined this request")
    parsed = _last_json_block(_text_of(msg.get("content") or []))
    if not parsed:
        raise ApiError("the research could not be organised into tables")
    return parsed


# ---------------- sources ----------------

def _norm_url(u: Any) -> str:
    s = ("" + (u or "")).strip().lower()
    s = re.sub(r"^https?://", "", s)
    s = re.sub(r"^www\.", "", s)
    s = s.split("#", 1)[0]
    return s.rstrip("/")


def found_sources(blocks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Every page the search tool returned or the model cited, in first-seen order."""
    out: List[Dict[str, str]] = []
    seen = set()

    def add(url: Any, title: Any) -> None:
        key = _norm_url(url)
        if key and key not in seen:
            seen.add(key)
            out.append({"url": "" + (url or ""), "title": "" + (title or "")})

    for b in blocks:
        t = b.get("type")
        if t == "web_search_tool_result":
            content = b.get("content")
            # A success is a list of results; an error is a single object.
            if isinstance(content, list):
                for r in content:
                    if isinstance(r, dict) and r.get("url"):
                        add(r.get("url"), r.get("title"))
        elif t == "text":
            for c in b.get("citations") or []:
                if isinstance(c, dict) and c.get("url"):
                    add(c.get("url"), c.get("title"))
    return out


# ---------------- findings -> tables ----------------

def _num(v: Any) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        n = float(v)
    else:
        s = re.sub(r"[,\s]", "", str(v))
        mult = 1.0
        m = re.match(r"^~?([0-9]*\.?[0-9]+)(k|m|b|thousand|million|billion)?$", s, re.I)
        if not m:
            return None
        n = float(m.group(1))
        unit = (m.group(2) or "").lower()
        mult = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6, "b": 1e9, "billion": 1e9}.get(unit, 1.0)
        n *= mult
    if n != n or n < 0:
        return None
    return int(n) if n == int(n) else n


def _cell(v: Any) -> Any:
    return "" if v is None else v


def _txt(v: Any) -> str:
    return re.sub(r"\s+", " ", "" + (v if isinstance(v, str) else ("" if v is None else str(v)))).strip()


def _slug(name: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", re.sub(r"['’]", "", name or ""))
    s = "_".join(words)[:24].strip("_")
    if not s:
        s = "Indication"
    if s[0].isdigit():
        s = "I_" + s
    return s


def build_tables(findings: Dict[str, Any], found: List[Dict[str, str]], info: Dict[str, Any],
                 prompt: str) -> Dict[str, Any]:
    region = _txt(findings.get("region")) or DEFAULT_REGION
    rows_in = [r for r in (findings.get("indications") or []) if isinstance(r, dict) and _txt(r.get("name"))]
    if not rows_in:
        return {"status": "error", "error": "No indications were found for that prompt. Name a disease or a list of indications."}

    requested = [r for r in rows_in if _txt(r.get("type")).lower() != "expansion"]
    expansion = [r for r in rows_in if _txt(r.get("type")).lower() == "expansion"]
    ordered = requested + expansion
    searched = bool(info.get("searched"))
    found_keys = {_norm_url(s["url"]) for s in found}

    prefix = _slug(_txt((requested or ordered)[0].get("name")))

    market_rows: List[List[Any]] = []
    detail_rows: List[List[Any]] = []
    source_rows: List[List[Any]] = []
    unverified = 0
    for r in ordered:
        kind = "Expansion" if r in expansion else "Requested"
        name = _txt(r.get("name"))
        srcs = [s for s in (r.get("sources") or []) if isinstance(s, dict) and (_txt(s.get("url")) or _txt(s.get("title")))]
        first = srcs[0] if srcs else {}
        market_rows.append([
            name, kind,
            _cell(_num(r.get("prevalence_region"))),
            _cell(_num(r.get("incidence_region_per_year"))),
            _cell(_num(r.get("prevalence_global"))),
            _cell(_num(r.get("addressable_region"))),
            _txt(r.get("addressable_basis")),
            _txt(r.get("confidence")) if searched else "unverified",
            _txt(first.get("url")) or _txt(first.get("title")),
        ])
        detail_rows.append([
            name, kind,
            _txt(r.get("link")),
            _txt(r.get("plausibility")),
            _txt(r.get("standard_of_care")),
            _txt(r.get("unmet_need")),
        ])
        for s in srcs:
            url = _txt(s.get("url"))
            if not searched:
                check = "model knowledge"
            elif url and _norm_url(url) in found_keys:
                check = "yes"
            else:
                check = "no - verify"
                unverified += 1
            source_rows.append([name, _txt(s.get("figure")), _txt(s.get("title")), url, _txt(s.get("year")), check])

    def total(rows: List[Dict[str, Any]]) -> Any:
        vals = [_num(r.get("addressable_region")) for r in rows]
        vals = [v for v in vals if v is not None]
        return sum(vals) if vals else ""

    req_total, exp_total = total(requested), total(expansion)
    both = [v for v in (req_total, exp_total) if v != ""]
    summary_rows: List[List[Any]] = [
        ["Prompt", _txt(prompt)],
        ["Region", region],
        ["Approach", _txt(findings.get("approach"))],
        ["Requested indications", len(requested)],
        ["Expansion indications", len(expansion)],
        ["Addressable patients, requested", req_total],
        ["Addressable patients, expansion", exp_total],
        ["Addressable patients, combined", sum(both) if both else ""],
        ["Summary", _txt(findings.get("summary"))],
        ["Figures from", "live web search" if searched else "model knowledge only (web search unavailable) - verify before use"],
        ["Searches run", info.get("searches") or len(info.get("queries") or [])],
        ["Model", _txt(info.get("model"))],
        ["Date", time.strftime("%Y-%m-%d")],
    ]

    notes = [_txt(n) for n in (findings.get("notes") or []) if _txt(n)]
    if len(ordered) > 1:
        notes.append("Combined addressable patients is a plain sum; indications can share patients.")
    if unverified:
        notes.append(f"{unverified} source link(s) did not appear in the search results; they are marked 'no - verify' in {prefix}_Sources.")
    if not searched:
        notes.append("Web search was unavailable, so figures come from the model's own knowledge and are unverified.")
    if info.get("stop_reason") == "pause_turn":
        notes.append("The research ran out of time before it finished; the tables hold what was found.")
    for i, n in enumerate(notes):
        summary_rows.append([f"Note {i + 1}", n])

    tables = [
        {"name": f"{prefix}_Market",
         "headers": ["Indication", "Type", f"Prevalence ({region})", f"Incidence per year ({region})",
                     "Prevalence (global)", f"Addressable patients ({region})", "Addressable basis",
                     "Confidence", "Primary source"],
         "rows": market_rows},
        {"name": f"{prefix}_Expansion",
         "headers": ["Indication", "Type", "Link to the approach", "Plausibility", "Standard of care", "Unmet need"],
         "rows": detail_rows},
        {"name": f"{prefix}_Sources",
         "headers": ["Indication", "Figure", "Title", "URL", "Year", "In search results"],
         "rows": source_rows},
        {"name": f"{prefix}_Market_Summary", "headers": ["Item", "Value"], "rows": summary_rows},
    ]
    return {
        "status": "ok",
        "detection": {
            "region": region,
            "approach": _txt(findings.get("approach")),
            "requested": [_txt(r.get("name")) for r in requested],
            "expansion": [_txt(r.get("name")) for r in expansion],
            "addressable_requested": req_total,
            "addressable_expansion": exp_total,
            "searched": searched,
            "queries": info.get("queries") or [],
            "searches": info.get("searches") or 0,
            "model": info.get("model"),
            "seconds": info.get("seconds"),
        },
        "tables": [t for t in tables if t["rows"]],
        "notes": notes,
    }


def run(prompt: Any, opts: Dict[str, Any]) -> Dict[str, Any]:
    prompt = _txt(prompt)
    # Two characters is a real indication: HD, MS, CF, AD.
    if len(prompt) < 2:
        return {"status": "error", "error": "Enter a disease or a list of indications."}
    if not ANTHROPIC_API_KEY:
        return {"status": "error", "error": "ANTHROPIC_API_KEY is not set on the server"}
    if requests is None:
        return {"status": "error", "error": "python 'requests' is not available on the server"}

    def _int(key: str, default: int, lo: int, hi: int) -> int:
        try:
            return max(lo, min(hi, int(opts.get(key))))
        except Exception:
            return default

    region = _txt(opts.get("region")) or DEFAULT_REGION
    max_expansions = _int("max_expansions", DEFAULT_MAX_EXPANSIONS, 0, 12)
    max_searches = _int("max_searches", DEFAULT_MAX_SEARCHES, 1, 25)

    try:
        import claude_usage as _cu  # type: ignore
        _cu.bump("indication-market")
    except Exception:
        pass

    works.msg("Researching patient populations…")
    works.progress(5)
    text, blocks, info = research(prompt, region, max_expansions, max_searches)
    found = found_sources(blocks)
    works.progress(85)

    findings = _last_json_block(text)
    if findings is None:
        if not text.strip():
            return {"status": "error", "error": "The research returned nothing. Try again, or name the indication more specifically."}
        findings = structure(prompt, text, found)
    works.progress(95)
    return build_tables(findings, found, info, prompt)


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
        result = {"status": "error", "error": str(e)}
    except Exception as e:  # pragma: no cover - surfaced to the UI
        result = {"status": "error", "error": f"{type(e).__name__}: {e}"}
    works.progress(100)
    works.resolve(result)
    return 0 if result.get("status") != "error" else 1


_main_ion()
