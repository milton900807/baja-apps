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
- The typical price per patient in the primary region for a therapy of this approach in this indication: the list price of an approved drug with the same or the closest mechanism, annualised, in US dollars. Name the comparator in price_basis. For a one-time therapy such as a gene therapy, give the one-time price and say so. Use null when there is no credible comparator.

Then find the COMPETITION, which is what a market sizing is read against:
- Assets aimed at the primary indications: approved drugs first, then those in late clinical development, then notable earlier ones when the field is thin. For each, give the drug, the company, the modality or mechanism, its stage or approval year, the indication it is aimed at, and whether it competes directly with this approach or serves the same patients by another route.
- The companies active in this field: who they are, what they have in it, and what is distinctive about their position. Include the owners of the assets above and any company whose declared programmes target the same pathway or patient group.
Spend at most three searches on this between them, and prefer regulator approvals, company pipelines and trial registries over news summaries. Use an empty list when a field genuinely has no competition on record.

Also build the HISTORY of the primary indication, which is what the team reads the forecast against: how long the disease has been understood, how long it has been diagnosable, and how long anything has been available to treat it. Find the dated events that matter, each with a year:
- DISCOVERY: when the disease was first described, and when its cause was established -- the gene, the pathogen, the mechanism -- as separate events where they differ.
- DIAGNOSTIC: the first test cleared or approved by a regulator to diagnose or screen for it, and later ones that changed practice (a genetic test, an imaging standard, newborn screening).
- THERAPEUTIC: the first therapy approved for it by a regulator, and each later approval that changed the standard of care, with the drug's name.
Give at most twelve events, oldest first, every one with a four-digit year and a source. Use the FDA, EMA, the regulator's own announcement or a peer-reviewed history in preference to a news summary. Spend at most two searches on this. Return an empty list rather than guessing: an invented date is worse than a short history, and a year you are unsure of belongs in the detail, not the year field.

Also estimate what it costs to take one program of this approach to market, from published benchmarks for the modality and therapeutic area where they exist: the cost and duration of preclinical work, Phase I, Phase II, Phase III and regulatory review, the cost of launch, and the probability of moving from Phase I to Phase II, Phase II to Phase III, Phase III to filing, and filing to approval. Spend at most two searches on this, and put the figures in the development object with their sources. Use null for any figure you cannot support; the canvas fills gaps with clearly marked defaults.

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
      "annual_price_usd": number or null,
      "price_basis": "one sentence: the comparator drug and how the price was annualised",
      "sources": [ { "figure": "which figure this supports", "title": "source title", "url": "https://...", "year": "publication or data year" } ]
    }
  ],
  "history": [
    {
      "event": "what happened, in a few words",
      "year": 4-digit year as a number,
      "kind": "discovery", "diagnostic", "therapeutic" or "other",
      "detail": "one sentence, including any uncertainty about the date",
      "source": { "title": "source title", "url": "https://...", "year": "publication year" }
    }
  ],
  "development": {
    "preclinical_cost_usd": number or null, "preclinical_years": number or null,
    "phase_i_cost_usd": number or null, "phase_i_years": number or null, "phase_i_success_rate": number or null,
    "phase_ii_cost_usd": number or null, "phase_ii_years": number or null, "phase_ii_success_rate": number or null,
    "phase_iii_cost_usd": number or null, "phase_iii_years": number or null, "phase_iii_success_rate": number or null,
    "regulatory_cost_usd": number or null, "regulatory_years": number or null, "regulatory_success_rate": number or null,
    "launch_cost_usd": number or null,
    "basis": "one or two sentences on where these benchmarks come from",
    "sources": [ { "figure": "...", "title": "...", "url": "https://...", "year": "..." } ]
  },
  "competitors": [
    { "drug": "name or code", "company": "owner", "modality": "siRNA, antibody, small molecule...",
      "stage": "approved 2019 | phase III | phase I | preclinical", "indication": "what it is aimed at",
      "competes": "direct" or "adjacent", "note": "one sentence on how it bears on this approach",
      "source": { "title": "...", "url": "https://...", "year": "..." } }
  ],
  "companies": [
    { "company": "name", "focus": "what they do in this field", "assets": "their programmes here",
      "position": "one sentence on where they stand",
      "source": { "title": "...", "url": "https://...", "year": "..." } }
  ],
  "notes": [ "caveats the team should see, such as patient overlap between rows" ]
}

Success rates are fractions between 0 and 1.
"""


# The development benchmarks the research returns, in the order the cost table shows them.
DEV_NUMBERS = [
    "preclinical_cost_usd", "preclinical_years",
    "phase_i_cost_usd", "phase_i_years", "phase_i_success_rate",
    "phase_ii_cost_usd", "phase_ii_years", "phase_ii_success_rate",
    "phase_iii_cost_usd", "phase_iii_years", "phase_iii_success_rate",
    "regulatory_cost_usd", "regulatory_years", "regulatory_success_rate",
    "launch_cost_usd",
]

# Used only when the research reply carries no parseable JSON block.
SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["region", "approach", "summary", "indications", "history", "development", "competitors", "companies", "notes"],
    "properties": {
        "history": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["event", "year", "kind", "detail", "source"],
                "properties": {
                    "event": {"type": "string"},
                    "year": {"type": ["number", "null"]},
                    "kind": {"type": "string", "enum": ["discovery", "diagnostic", "therapeutic", "other"]},
                    "detail": {"type": "string"},
                    "source": {
                        "type": "object", "additionalProperties": False,
                        "required": ["title", "url", "year"],
                        "properties": {"title": {"type": "string"}, "url": {"type": "string"},
                                       "year": {"type": "string"}},
                    },
                },
            },
        },
        "development": {
            "type": "object",
            "additionalProperties": False,
            "required": DEV_NUMBERS + ["basis", "sources"],
            "properties": dict(
                {k: {"type": ["number", "null"]} for k in DEV_NUMBERS},
                basis={"type": "string"},
                sources={"type": "array", "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["figure", "title", "url", "year"],
                    "properties": {"figure": {"type": "string"}, "title": {"type": "string"},
                                   "url": {"type": "string"}, "year": {"type": "string"}}}},
            ),
        },
        "competitors": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["drug", "company", "modality", "stage", "indication", "competes", "note", "source"],
                "properties": {
                    "drug": {"type": "string"}, "company": {"type": "string"}, "modality": {"type": "string"},
                    "stage": {"type": "string"}, "indication": {"type": "string"},
                    "competes": {"type": "string"}, "note": {"type": "string"},
                    "source": {"type": "object", "additionalProperties": False,
                               "required": ["title", "url", "year"],
                               "properties": {"title": {"type": "string"}, "url": {"type": "string"}, "year": {"type": "string"}}},
                },
            },
        },
        "companies": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["company", "focus", "assets", "position", "source"],
                "properties": {
                    "company": {"type": "string"}, "focus": {"type": "string"}, "assets": {"type": "string"},
                    "position": {"type": "string"},
                    "source": {"type": "object", "additionalProperties": False,
                               "required": ["title", "url", "year"],
                               "properties": {"title": {"type": "string"}, "url": {"type": "string"}, "year": {"type": "string"}}},
                },
            },
        },
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
                             "addressable_basis", "standard_of_care", "unmet_need", "confidence",
                             "annual_price_usd", "price_basis", "sources"],
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
                    "annual_price_usd": {"type": ["number", "null"]},
                    "price_basis": {"type": "string"},
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
    # Letters only: the table builder reads a digit next to a name as multiplication, so a
    # table called Type_2_Diabetes_Market could not be referenced from a formula.
    words = re.findall(r"[A-Za-z]+", re.sub(r"['’]", "", name or ""))
    s = "_".join(words)
    if len(s) > 24:
        cut = s[:24]
        s = cut[:cut.rfind("_")] if "_" in cut else cut      # whole words only
    return s.strip("_") or "Indication"


def _label(s: str, maxlen: int = 26) -> str:
    s = re.sub(r"['’]", "", str(s or ""))
    s = re.sub(r"\d+", " ", s)
    s = re.sub(r"[^A-Za-z_ ]+", " ", s)
    s = re.sub(r"\s+", "_", s.strip())
    s = re.sub(r"_+", "_", s).strip("_")
    if len(s) > maxlen:
        cut = s[:maxlen]
        s = (cut[:cut.rfind("_")] if "_" in cut else cut).strip("_")
    return s or "Indication"


def _key(table: str, c: int, r: int) -> str:
    return f"{table}[{c}:{c}][{r}:{r}]"


# Industry-average phase transition rates, used only where the research found none:
# BIO, Informa Pharma Intelligence and QLS, Clinical Development Success Rates 2011-2020.
BENCHMARK_SUCCESS = {"phase_i": 0.520, "phase_ii": 0.289, "phase_iii": 0.578, "regulatory": 0.906}
BENCHMARK_NOTE = "Industry average (BIO/Informa/QLS, Clinical Development Success Rates 2011-2020). Edit."


def build_model(prefix: str, ordered: List[Dict[str, Any]], expansion: List[Dict[str, Any]],
                findings: Dict[str, Any]) -> Dict[str, Any]:
    """The market model as formulas over one table of editable inputs.

    <P>_Market_Inputs   Label | Value | Unit | Basis    (researched figures and assumptions)
    <P>_Market_Size     per indication and totals: patients, peak patients, price, revenue, TAM
    <P>_Cost_To_Market  per stage: cost, years, success rate, expected (risk-weighted) cost
    <P>_Market_Model    the headline numbers
    Every number outside the inputs table is a formula, so editing an input moves them all.
    """
    I, S, C, M = f"{prefix}_Market_Inputs", f"{prefix}_Market_Size", f"{prefix}_Cost_To_Market", f"{prefix}_Market_Model"
    tables: Dict[str, Any] = {}
    formulas: Dict[str, str] = {}
    ann: Dict[str, str] = {}
    units: Dict[str, Dict[str, str]] = {I: {}, S: {}, C: {}, M: {}}
    # A row's label tags every OTHER cell in its row, so Inputs[Peak_Share] means "the
    # cells tagged Peak_Share" -- one cell only while the table is Label | Value. This
    # table also carries Unit and Basis, so the bare label is the whole row and the
    # arithmetic reading it gets three values where it wanted one. Name the column.
    INPUT_COLS = ["Label", "Value", "Unit", "Basis"]
    ref = lambda lab: f"{I}[{lab},{INPUT_COLS[1]}]"

    inputs: List[Tuple[str, Any, str, str]] = []
    rows: List[Tuple[str, str]] = []           # (label, kind)
    taken: set = set()
    for r in ordered:
        base = _label(_txt(r.get("name")))
        lab, n = base, 0
        while lab in taken:
            n += 1
            lab = f"{base}_{chr(ord('A') + n)}"
        taken.add(lab)
        kind = "Expansion" if r in expansion else "Primary"
        pts, pb = _num(r.get("addressable_region")), _txt(r.get("addressable_basis"))
        if pts is None and _num(r.get("prevalence_region")) is not None:
            pts, pb = _num(r.get("prevalence_region")), "No addressable figure; regional prevalence used. " + pb
        if pts is None:
            pts, pb = 0, "No population figure was found. Enter one."
        price, qb = _num(r.get("annual_price_usd")), _txt(r.get("price_basis"))
        if price is None:
            price, qb = 0, "No comparator price was found. Enter one. " + qb
        inputs += [
            (f"{lab}_Patients", pts, "patients", pb),
            (f"{lab}_Treated_Share", 0.5, "fraction", "Assumption: share of addressable patients diagnosed and treated. Edit."),
            (f"{lab}_Peak_Share", 0.2, "fraction", "Assumption: peak share of treated patients this therapy reaches. Edit."),
            (f"{lab}_Price", price, "USD per patient per year", qb.strip()),
        ]
        rows.append((lab, kind))

    dev = findings.get("development") if isinstance(findings.get("development"), dict) else {}
    dbasis = _txt(dev.get("basis")) or "Research benchmark."
    stages = [("Preclinical", "preclinical", False), ("Phase_I", "phase_i", True), ("Phase_II", "phase_ii", True),
              ("Phase_III", "phase_iii", True), ("Regulatory", "regulatory", True), ("Launch", "launch", False)]
    for lab, key, has_rate in stages:
        cost = _num(dev.get(f"{key}_cost_usd"))
        inputs.append((f"{lab}_Cost", cost if cost is not None else 0, "USD", dbasis if cost is not None else "Not found. Enter the cost."))
        if key != "launch":
            yrs = _num(dev.get(f"{key}_years"))
            inputs.append((f"{lab}_Years", yrs if yrs is not None else 0, "years", dbasis if yrs is not None else "Not found. Enter the duration."))
        if has_rate:
            rate = _num(dev.get(f"{key}_success_rate"))
            if rate is not None and rate > 1:
                rate = rate / 100.0
            if rate is None:
                inputs.append((f"{lab}_Success_Rate", BENCHMARK_SUCCESS[key], "fraction", BENCHMARK_NOTE))
            else:
                inputs.append((f"{lab}_Success_Rate", rate, "fraction", dbasis))

    for c, h in enumerate(INPUT_COLS):
        tables[_key(I, c, 0)] = h
    for r, (lab, val, unit, basis) in enumerate(inputs, start=1):
        tables[_key(I, 0, r)] = lab
        tables[_key(I, 1, r)] = val
        tables[_key(I, 2, r)] = unit
        tables[_key(I, 3, r)] = basis
        if unit.startswith("USD"):
            units[I][lab] = "USD"
    ann[I] = ("Inputs. Patients, prices and development figures come from the research (see Basis and the Sources table); "
              "treated share and peak share are assumptions. Every number in the other model tables is a formula over this table.")

    # ---- market size per indication, with totals ----
    heads = ["Label", "Addressable_Patients", "Treated_Patients", "Peak_Patients", "Price",
             "Peak_Annual_Revenue", "Total_Addressable_Market", "Type"]
    for c, h in enumerate(heads):
        tables[_key(S, c, 0)] = h
    expr: Dict[str, Dict[str, str]] = {}
    for r, (lab, kind) in enumerate(rows, start=1):
        pa = ref(f"{lab}_Patients")
        tr = f"{pa}*{ref(f'{lab}_Treated_Share')}"
        pk = f"{tr}*{ref(f'{lab}_Peak_Share')}"
        pr = ref(f"{lab}_Price")
        e = {"pa": pa, "tr": tr, "pk": pk, "rev": f"{pk}*{pr}", "tam": f"{pa}*{pr}"}
        expr[lab] = e
        tables[_key(S, 0, r)] = lab
        formulas[_key(S, 1, r)] = e["pa"]
        formulas[_key(S, 2, r)] = e["tr"]
        formulas[_key(S, 3, r)] = e["pk"]
        formulas[_key(S, 4, r)] = pr
        formulas[_key(S, 5, r)] = e["rev"]
        formulas[_key(S, 6, r)] = e["tam"]
        tables[_key(S, 7, r)] = kind
    req = [lab for lab, k in rows if k == "Primary"]
    exp = [lab for lab, k in rows if k == "Expansion"]
    total = lambda labs, k: "+".join(expr[l][k] for l in labs) if labs else "0"
    r = len(rows) + 1
    groups = [("Total_Primary", req)] + ([("Total_Expansion", exp), ("Total_All", req + exp)] if exp else [])
    for name, labs in groups:
        tables[_key(S, 0, r)] = name
        for c, k in ((1, "pa"), (2, "tr"), (3, "pk"), (5, "rev"), (6, "tam")):
            formulas[_key(S, c, r)] = total(labs, k)
        tables[_key(S, 7, r)] = "Total"
        r += 1
    for h in ("Price", "Peak_Annual_Revenue", "Total_Addressable_Market"):
        units[S][h] = "USD"
    ann[S] = ("Market size. Addressable x treated share x peak share = peak patients; x price = peak annual revenue. "
              "Total addressable market is addressable patients x price. Indications can share patients, so totals are plain sums.")

    # ---- cost to market, stage by stage ----
    for c, h in enumerate(["Label", "Cost", "Years", "Success_Rate", "Expected_Cost"]):
        tables[_key(C, c, 0)] = h
    reach = "1"
    expected: List[str] = []
    costs: List[str] = []
    years: List[str] = []
    rates: List[str] = []
    for r, (lab, key, has_rate) in enumerate(stages, start=1):
        cost = ref(f"{lab}_Cost")
        tables[_key(C, 0, r)] = lab
        formulas[_key(C, 1, r)] = cost
        if key != "launch":
            formulas[_key(C, 2, r)] = ref(f"{lab}_Years")
            years.append(ref(f"{lab}_Years"))
        if has_rate:
            formulas[_key(C, 3, r)] = ref(f"{lab}_Success_Rate")
        # A stage's cost is spent only if the program gets that far.
        e_cost = cost if reach == "1" else f"{cost}*{reach}"
        formulas[_key(C, 4, r)] = e_cost
        expected.append(e_cost)
        costs.append(cost)
        if has_rate:
            rates.append(ref(f"{lab}_Success_Rate"))
            reach = "*".join(rates)
    r = len(stages) + 1
    tables[_key(C, 0, r)] = "Total"
    formulas[_key(C, 1, r)] = "+".join(costs)
    formulas[_key(C, 2, r)] = "+".join(years)
    formulas[_key(C, 3, r)] = "*".join(rates)
    formulas[_key(C, 4, r)] = "+".join(expected)
    units[C]["Cost"] = "USD"; units[C]["Expected_Cost"] = "USD"
    ann[C] = ("Cost to market by stage. Expected cost weights each stage by the chance of reaching it; "
              "the total success rate is the chance that a program entering Phase I is approved.")

    # ---- the headline numbers ----
    cost_sum, exp_sum, pos = "+".join(costs), "+".join(expected), "*".join(rates)
    headline = [
        ("Addressable_Patients_Primary", total(req, "pa"), "patients"),
        ("Total_Addressable_Market_Primary", total(req, "tam"), "USD"),
        ("Peak_Annual_Revenue_Primary", total(req, "rev"), "USD"),
    ]
    if exp:
        headline += [
            ("Addressable_Patients_With_Expansion", total(req + exp, "pa"), "patients"),
            ("Total_Addressable_Market_With_Expansion", total(req + exp, "tam"), "USD"),
            ("Peak_Annual_Revenue_With_Expansion", total(req + exp, "rev"), "USD"),
        ]
    headline += [
        ("Cost_To_Market", cost_sum, "USD"),
        ("Expected_Cost_To_Market", exp_sum, "USD"),
        ("Probability_Of_Approval", pos, "fraction"),
        ("Cost_Per_Approval", f"({exp_sum})/({pos})", "USD"),
        ("Years_To_Market", "+".join(years), "years"),
        ("Peak_Revenue_To_Cost_Per_Approval", f"({total(req, 'rev')})/(({exp_sum})/({pos}))", "ratio"),
    ]
    for c, h in enumerate(["Label", "Value", "Unit"]):
        tables[_key(M, c, 0)] = h
    for r, (lab, f, unit) in enumerate(headline, start=1):
        tables[_key(M, 0, r)] = lab
        formulas[_key(M, 1, r)] = f
        tables[_key(M, 2, r)] = unit
        if unit == "USD":
            units[M][lab] = "USD"
    ann[M] = "The headline numbers. All formulas over the inputs table: change an input and these follow."

    return {"tables": tables, "formulas": formulas, "annotations": ann, "units": units,
            "diagnostics": "NO_ISSUES_DETECTED", "names": [I, S, C, M]}


# The colour a band takes on the canvas, by what kind of event it is.
HISTORY_COLOURS = {
    "discovery": "#6f7dbc",      # understanding the disease
    "diagnostic": "#2f8f9d",     # being able to find it
    "therapeutic": "#16a34a",    # being able to treat it
    "other": "#9aa5ad",
}
# Each kind keeps its own lane, so the three strands of the story read across the axis:
# what was understood, when it could be found, when it could be treated.
HISTORY_LANES = {"discovery": 0.78, "diagnostic": 0.54, "therapeutic": 0.30, "other": 0.92}


def build_history(prefix: str, findings: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The indication's history as a timeline the canvas can draw.

    Each event becomes a one-year band at its year, in the shape the timeline plot reads
    (name / start / end, plus startX and x as hours from the window's start, which is what
    py/openai/timeline.py produces and flexigraph/plot.js consumes). Events with no year
    are dropped rather than placed at a guess, and if nothing survives there is no
    timeline: an empty axis says less than no axis at all.
    """
    raw = findings.get("history")
    if not isinstance(raw, list) or not raw:
        return None

    events: List[Tuple[int, str, str, str, str]] = []
    for h in raw:
        if not isinstance(h, dict):
            continue
        year = _num(h.get("year"))
        name = _txt(h.get("event"))
        if year is None or not name:
            continue
        y = int(year)
        if y < 1000 or y > 2200:          # a four-digit year, not a count or a duration
            continue
        kind = (_txt(h.get("kind")) or "other").lower()
        if kind not in HISTORY_COLOURS:
            kind = "other"
        src = h.get("source") if isinstance(h.get("source"), dict) else {}
        events.append((y, name, kind, _txt(h.get("detail")), _txt(src.get("url"))))

    if not events:
        return None
    events.sort(key=lambda e: e[0])

    # The axis runs from the first event to a little past the last, so the newest band is
    # not flush against the right edge.
    first, last = events[0][0], events[-1][0]
    span_end = max(last + 1, first + 2)
    pad = max(2.0, (span_end - first) * 0.10)
    start_dt = f"{first:04d}-01-01T00:00:00"
    end_dt = f"{span_end:04d}-01-01T00:00:00"
    HOURS_PER_YEAR = 365.2425 * 24

    intervals: List[Dict[str, Any]] = []
    seen: set = set()
    for y, name, kind, detail, url in events:
        label = f"{y} {name}"
        n = 1
        while label in seen:                 # the plot wants unique names
            n += 1
            label = f"{y} {name} ({n})"
        seen.add(label)
        # A MILESTONE, not an interval. These are dated events, not durations: as one-year
        # bands on an axis spanning a century they came out as specks too small to carry
        # their own name. A milestone is a point with a pill, which is what a date wants.
        at = (y - first) * HOURS_PER_YEAR
        intervals.append({
            "type": "milestone",
            "name": label,
            "x": at,
            "startX": at,
            "y": HISTORY_LANES[kind],
            "color": HISTORY_COLOURS[kind],
            "start": f"{y:04d}-01-01T00:00:00",
            "end": f"{y:04d}-01-01T00:00:00",
            "kind": kind,
            "detail": detail,
            "url": url,
        })

    return {
        "name": f"{prefix}_History",
        "intervals": intervals,
        "window": {"start": start_dt, "end": end_dt},
        # The axis is padded a tenth of the span at each end. Without it the first and
        # last pills hang over the edges of the frame, since a pill is drawn centred on
        # its year and the outermost years sit exactly at the ends.
        "axis": {"min": -pad * HOURS_PER_YEAR,
                 "max": (span_end - first + pad) * HOURS_PER_YEAR},
        "span": {"first_year": first, "last_year": last},
    }


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
        kind = "Expansion" if r in expansion else "Primary"
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
            source_rows.append([name, _txt(s.get("figure")), _txt(s.get("title")), url, _txt(s.get("year"))])

    dev = findings.get("development") if isinstance(findings.get("development"), dict) else {}
    for s in (dev.get("sources") or []):
        if not isinstance(s, dict) or not (_txt(s.get("url")) or _txt(s.get("title"))):
            continue
        url = _txt(s.get("url"))
        if not searched:
            check = "model knowledge"
        elif url and _norm_url(url) in found_keys:
            check = "yes"
        else:
            check = "no - verify"
            unverified += 1
        source_rows.append(["Cost to market", _txt(s.get("figure")), _txt(s.get("title")), url, _txt(s.get("year"))])

    def total(rows: List[Dict[str, Any]]) -> Any:
        vals = [_num(r.get("addressable_region")) for r in rows]
        vals = [v for v in vals if v is not None]
        return sum(vals) if vals else ""

    # The history, as rows as well as a timeline: the timeline shows WHEN, the table keeps
    # the detail and the source a date has to be checkable against.
    history_rows: List[List[Any]] = []
    for h in (findings.get("history") or []):
        if not isinstance(h, dict):
            continue
        yr = _num(h.get("year"))
        name = _txt(h.get("event"))
        if yr is None or not name:
            continue
        src = h.get("source") if isinstance(h.get("source"), dict) else {}
        history_rows.append([int(yr), name, _txt(h.get("kind")) or "other",
                             _txt(h.get("detail")), _txt(src.get("url")) or _txt(src.get("title"))])
    history_rows.sort(key=lambda r: r[0])

    req_total, exp_total = total(requested), total(expansion)
    both = [v for v in (req_total, exp_total) if v != ""]
    summary_rows: List[List[Any]] = [
        ["Prompt", _txt(prompt)],
        ["Region", region],
        ["Approach", _txt(findings.get("approach"))],
        ["Primary indications", len(requested)],
        ["Expansion indications", len(expansion)],
        ["Addressable patients, primary", req_total],
        ["Addressable patients, expansion", exp_total],
        ["Addressable patients, combined", sum(both) if both else ""],
        ["Summary", _txt(findings.get("summary"))],
    ]

    notes = [_txt(n) for n in (findings.get("notes") or []) if _txt(n)]
    def _esc(t: str) -> str:
        return (_txt(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    if len(ordered) > 1:
        notes.append("Combined addressable patients is a plain sum; indications can share patients.")
    if unverified:
        notes.append(f"{unverified} source link(s) did not appear in the search results and are worth checking before the figures they support are relied on.")
    if not searched:
        notes.append("Web search was unavailable, so figures come from the model's own knowledge and are unverified.")
    if info.get("stop_reason") == "pause_turn":
        notes.append("The research ran out of time before it finished; the tables hold what was found.")
    # (The notes used to be appended here as "Note 1", "Note 2"... rows. They are prose and
    # now live in the document this build also places on the canvas.)

    # ---- the competition: assets aimed at these patients, and who is behind them ----
    comp_rows: List[List[Any]] = []
    firm_rows: List[List[Any]] = []
    def _count_unverified(src: Any) -> None:
        # Not shown as a column any more; it still adds to the count the caveats report.
        nonlocal unverified
        url = _txt((src or {}).get("url"))
        if searched and url and _norm_url(url) not in found_keys:
            unverified += 1
    for c in (findings.get("competitors") or []):
        if not isinstance(c, dict) or not (_txt(c.get("drug")) or _txt(c.get("company"))):
            continue
        src = c.get("source") or {}
        comp_rows.append([
            _txt(c.get("drug")), _txt(c.get("company")), _txt(c.get("modality")), _txt(c.get("stage")),
            _txt(c.get("indication")), _txt(c.get("competes")), _txt(c.get("note")),
            _txt(src.get("url")) or _txt(src.get("title")),
        ])
        _count_unverified(src)
    for f in (findings.get("companies") or []):
        if not isinstance(f, dict) or not _txt(f.get("company")):
            continue
        src = f.get("source") or {}
        firm_rows.append([
            _txt(f.get("company")), _txt(f.get("focus")), _txt(f.get("assets")), _txt(f.get("position")),
            _txt(src.get("url")) or _txt(src.get("title")),
        ])
        _count_unverified(src)
    if comp_rows or firm_rows:
        notes.append("Competition is what was found on the record at the date of the run; a field like this moves, so check before relying on it.")

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
         "headers": ["Indication", "Figure", "Title", "URL", "Year"],
         "rows": source_rows},
        {"name": f"{prefix}_History",
         "headers": ["Year", "Event", "Kind", "Detail", "Source"],
         "rows": history_rows},
        {"name": f"{prefix}_Market_Summary", "headers": ["Item", "Value"], "rows": summary_rows},
        # The Competition group: drawn together and bookmarked under that name on the canvas.
        {"name": f"{prefix}_Competition", "group": "Competition",
         "headers": ["Drug", "Company", "Modality", "Stage", "Indication", "Competes", "Note", "Source"],
         "rows": comp_rows},
        {"name": f"{prefix}_Competition_Companies", "group": "Competition",
         "headers": ["Company", "Focus in this field", "Programmes", "Position", "Source"],
         "rows": firm_rows},
    ]
    # ---- the written part, as a document rather than rows of a table ----------------
    # The summary, what the approach is, what was searched and the caveats are prose. In a
    # table each sentence was a cell clipped to its column; on the canvas they are one
    # document object (baja/plate/model-document.js).
    doc_html = ["<h2>", _esc(", ".join(_txt(r.get("name")) for r in requested) or "Market"), "</h2>"]
    if _txt(findings.get("summary")):
        doc_html.append("<p>" + _esc(findings.get("summary")) + "</p>")
    doc_html.append("<h3>What was asked</h3><p>" + _esc(prompt) + "</p>")
    doc_html.append("<h3>The approach</h3><p>" + (_esc(findings.get("approach")) or "Not stated.") + "</p>")
    bits = [
        f"{len(requested)} primary indication(s), {len(expansion)} expansion indication(s)",
        f"region: {_esc(region)}",
        ("figures from live web search" if searched else "figures from the model's own knowledge, unverified"),
        f"{info.get('searches') or len(info.get('queries') or [])} search(es)",
        time.strftime("%Y-%m-%d"),
    ]
    doc_html.append("<h3>How this was put together</h3><ul>" + "".join("<li>" + _esc(b) + "</li>" for b in bits) + "</ul>")
    if comp_rows or firm_rows:
        doc_html.append("<h3>Competition</h3><p>" + _esc(
            f"{len(comp_rows)} asset(s) and {len(firm_rows)} company(ies) on the record in this field; "
            "the tables under the Competition bookmark carry them with their sources.") + "</p>")
    if notes:
        doc_html.append("<h3>Caveats</h3><ul>" + "".join("<li>" + _esc(n) + "</li>" for n in notes) + "</ul>")
    documents = [{"name": f"{prefix}_Notes", "html": "".join(doc_html)}]

    return {
        "status": "ok",
        "documents": documents,
        "detection": {
            "region": region,
            "approach": _txt(findings.get("approach")),
            "requested": [_txt(r.get("name")) for r in requested],
            "expansion": [_txt(r.get("name")) for r in expansion],
            # For the patient-population pie on the canvas: one slice per indication.
            "populations": [
                {"name": _txt(r.get("name")),
                 "type": ("Expansion" if r in expansion else "Primary"),
                 "addressable": (_num(r.get("addressable_region")) if _num(r.get("addressable_region")) is not None
                                 else (_num(r.get("prevalence_region")) or 0))}
                for r in ordered
                if (_num(r.get("addressable_region")) or _num(r.get("prevalence_region")))
            ],
            "addressable_requested": req_total,
            "addressable_expansion": exp_total,
            "searched": searched,
            "queries": info.get("queries") or [],
            "searches": info.get("searches") or 0,
            "model": info.get("model"),
            "seconds": info.get("seconds"),
        },
        "tables": [t for t in tables if t["rows"]],
        "model": build_model(prefix, ordered, expansion, findings),
        "timeline": build_history(prefix, findings),
        "notes": notes,
    }


# ---------------------------------------------------------------- earlier research
#
# Every prompt is recorded in a structured form, and a prompt that asks a question already
# researched is answered from that research (py/ion-lib/indication_store.py keeps the records).
# "The same question" is a judgement, so it is put to the model, in one small call that does
# two things: it structures THIS prompt, and it says whether one of the earlier runs shown to
# it answers it. The same model as the research: the call costs a cent or two against a
# dollar-and-three-minutes run, and the one mistake that matters here -- handing someone the
# numbers for a different disease, region or approach -- is a quiet one, which is where the
# stronger model earns its place.

ANALYZE_MODEL = os.environ.get("INDICATION_ANALYZE_MODEL") or MODEL

ANALYZE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["structured", "decision", "match_id", "reason"],
    "properties": {
        "structured": {
            "type": "object",
            "additionalProperties": False,
            "required": ["indications", "aliases", "target", "modality", "region", "population", "wants_fresh"],
            "properties": {
                "indications": {"type": "array", "items": {"type": "string"},
                                "description": "The diseases or indications the prompt asks about, each by its standard full name."},
                "aliases": {"type": "array", "items": {"type": "string"},
                            "description": "Other names, abbreviations and spellings those indications go by (HD, Huntington disease, ATTR-CM...)."},
                "target": {"type": "string", "description": "The gene, protein or mechanism named, or an empty string."},
                "modality": {"type": "string", "description": "siRNA, ASO, antibody, small molecule..., or an empty string."},
                "region": {"type": "string", "description": "The region the sizing is for, by its standard name."},
                "population": {"type": "string", "description": "Any restriction on which patients (paediatric, a genotype, a line of therapy), or an empty string."},
                "wants_fresh": {"type": "boolean", "description": "True when the prompt itself asks for new, latest, updated or re-run research."},
            },
        },
        "decision": {"type": "string", "enum": ["reuse", "new"]},
        "match_id": {"type": "integer", "description": "The id of the earlier run to reuse, or 0."},
        "reason": {"type": "string", "description": "One sentence for the person who typed the prompt. Do not quote the earlier prompt."},
    },
}

ANALYZE_SYSTEM = """A therapeutics team types a prompt to size a market: a disease or a list of indications, sometimes with the therapeutic approach (a target, a mechanism, a modality) and a region. Researching one takes a few minutes of web search and the figures go into patient forecasts and revenue models. Earlier research is kept, and your job is to say whether one of the earlier runs shown to you already answers the new prompt, so that it can be loaded instead of researched again.

First put the new prompt in structured form. Give each indication its standard full name, and list the other names it goes by in `aliases` (abbreviations, eponyms, spelling variants): those aliases are how a later prompt finds this one.

Then decide. Reuse an earlier run only when someone asking the new prompt would be fully served by it. The wording does not have to match: abbreviations, synonyms, word order, spelling, a disease named by its eponym or by its gene are all the same question. What has to match is the substance:
- the same set of indications. A subset or a superset is a different question, because the totals and the overlap notes change.
- the same region, however it is written (US, USA, United States).
- a compatible therapeutic approach. The expansion indications, the competitors and the price comparators in a run all follow from its approach, so a run made for "siRNA against TTR" does not answer a prompt that names no approach, or a different target or modality, and the reverse.
- the same patient population, when either prompt restricts it.
If the new prompt itself asks for new, latest, updated or re-run research, set wants_fresh and decide "new". Age matters too: each run shows its age in days, and pipelines and prices move faster than prevalence, so prefer "new" for an old run when the prompt is about competitors, prices or a fast-moving field.

When you are unsure, decide "new". A needless new run costs a few minutes; a wrong reuse puts another question's numbers into someone's forecast without their knowing.

Set match_id to the id of the run to reuse, or 0 with "new". The reason is one plain sentence for the person who typed the prompt; it must not quote the earlier prompt, which may be someone else's."""


def analyze_prompt(prompt: str, region: str, max_expansions: int,
                   cands: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], str]:
    """Structure the prompt and judge it against earlier runs. Returns (analysis, error)."""
    if requests is None or not ANTHROPIC_API_KEY:
        return None, "no API access"
    shown = [{"id": c["id"], "age_days": c["age_days"], "prompt": c["prompt"], "region": c["region"],
              "max_expansions": c["max_expansions"], "structured": c.get("structured") or {}}
             for c in cands]
    user = ("New prompt:\n" + json.dumps({"prompt": prompt, "region_option": region,
                                           "max_expansions": max_expansions}, ensure_ascii=False)
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
        with_fallback = True
        r = requests.post(API_URL, headers=_headers(True), json=body, timeout=90)
        if r.status_code == 400 and "fallback" in (r.text or "").lower():
            with_fallback = False
            body.pop("fallbacks", None)
            r = requests.post(API_URL, headers=_headers(False), json=body, timeout=90)
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, (r.text or "")[:200])
        data = r.json()
        if data.get("stop_reason") == "refusal":
            return None, "declined"
        txt = "".join(b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text").strip()
        out = json.loads(txt)
        if not isinstance(out, dict) or not isinstance(out.get("structured"), dict):
            return None, "unexpected analysis"
        out["_model"] = data.get("model") or ANALYZE_MODEL
        return out, ""
    except Exception as ex:  # the store must never be why a run fails
        return None, "%s: %s" % (type(ex).__name__, ex)


def _structured_from_findings(findings: Dict[str, Any], region: str) -> Dict[str, Any]:
    """The structured form of a prompt when the model could not be asked: what the research
    itself says it was about."""
    rows = [r for r in (findings.get("indications") or []) if isinstance(r, dict)]
    requested = [_txt(r.get("name")) for r in rows if _txt(r.get("type")).lower() != "expansion" and _txt(r.get("name"))]
    return {"indications": requested or [_txt(r.get("name")) for r in rows if _txt(r.get("name"))][:6],
            "aliases": [], "target": "", "modality": _txt(findings.get("approach"))[:120],
            "region": _txt(findings.get("region")) or region, "population": "", "wants_fresh": False}


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

    # Earlier research first (see "earlier research" above). `fresh` skips the lookup: the
    # canvas offers it after a stored run has been loaded.
    store = None
    try:
        import indication_store as store  # type: ignore
        if not store.enabled():
            store = None
    except Exception:
        store = None
    fresh = bool(opts.get("fresh"))
    options_log = {"region": region, "max_expansions": max_expansions, "max_searches": max_searches, "fresh": fresh}
    structured: Optional[Dict[str, Any]] = None
    judge_model, judge_ms, reason = "", 0, ""

    if store is not None:
        works.msg("Checking earlier research…")
        works.progress(2)
        cands = [] if fresh else store.candidates(prompt, max_expansions)
        t0 = time.time()
        analysis, err = analyze_prompt(prompt, region, max_expansions, cands)
        judge_ms = int((time.time() - t0) * 1000)
        if analysis is not None:
            structured = analysis.get("structured")
            judge_model = _txt(analysis.get("_model"))
            reason = _txt(analysis.get("reason"))
            ids = {c["id"] for c in cands}
            match_id = analysis.get("match_id")
            wants_fresh = bool((structured or {}).get("wants_fresh"))
            if (not fresh and not wants_fresh and analysis.get("decision") == "reuse"
                    and isinstance(match_id, int) and match_id in ids):
                prior = store.get_run(match_id)
                if prior and isinstance(prior.get("findings"), dict):
                    prior_info = prior.get("info") if isinstance(prior.get("info"), dict) else {}
                    result = build_tables(prior["findings"], prior.get("found") or [], prior_info, prompt)
                    if result.get("status") == "ok":
                        store.touch_hit(match_id)
                        store.log_prompt(prompt, region, options_log, structured, "reused", match_id,
                                         reason, judge_model, judge_ms)
                        result["cache"] = {
                            "hit": True, "run_id": match_id, "created_at": prior.get("created_at"),
                            "age_days": prior.get("age_days"), "reason": reason,
                            # someone else's wording is theirs: only your own earlier prompt is shown back
                            "prompt": prior.get("prompt") if prior.get("same_user") else "",
                        }
                        return result
        else:
            reason = "analysis unavailable: " + err

    works.msg("Researching patient populations…")
    works.progress(5)
    try:
        text, blocks, info = research(prompt, region, max_expansions, max_searches)
    except Exception:
        if store is not None:
            store.log_prompt(prompt, region, options_log, structured, "error", None, reason, judge_model, judge_ms)
        raise
    found = found_sources(blocks)
    works.progress(85)

    findings = _last_json_block(text)
    if findings is None:
        if not text.strip():
            if store is not None:
                store.log_prompt(prompt, region, options_log, structured, "error", None, reason, judge_model, judge_ms)
            return {"status": "error", "error": "The research returned nothing. Try again, or name the indication more specifically."}
        findings = structure(prompt, text, found)
    works.progress(95)
    result = build_tables(findings, found, info, prompt)

    if store is not None:
        run_id = None
        if result.get("status") == "ok":
            if not isinstance(structured, dict):
                structured = _structured_from_findings(findings, region)
            run_id = store.save_run(prompt, region, max_expansions, max_searches, structured, findings, found, info)
        store.log_prompt(prompt, region, options_log, structured,
                         ("forced_new" if fresh else "new") if result.get("status") == "ok" else "error",
                         run_id, reason, judge_model, judge_ms)
        if result.get("status") == "ok":
            result["cache"] = {"hit": False, "run_id": run_id, "reason": reason}
    return result


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
