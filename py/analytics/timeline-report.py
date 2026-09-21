#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Timeline report -- the events of a timeline, written up for a PDF.

param(1): JSON {"name": "...", "events": [{Name, Type, Date|Start/End, Table, Row,
          Comment, Link}, ...]}

Returns {"title", "summary", "sections":[{"name", "rows":[...]}]} -- the shape
/export-table already takes, so the caller posts it straight through.

The DRAWING is not done here: the timeline is rendered by the browser that is showing
it and sent as images. This is only the words -- a summary of the span and the shape of
the work, phases with what falls in each, and the events themselves in time order with
their comments kept whole.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from typing import Any, Dict, List

try:
    from ion import works
except Exception:  # pragma: no cover
    works = None

from claude_chat import Claude as OpenAI  # Claude replaces OpenAI

MODEL = "claude-haiku-4-5"   # the fast model: this is a short structured write-up


def _s(v: Any) -> str:
    return "" if v is None else ("" + str(v)).strip()


def _date_of(e: Dict[str, Any]) -> str:
    return _s(e.get("Date") or e.get("Start") or e.get("End"))


def _sort_key(e: Dict[str, Any]) -> str:
    d = _date_of(e)
    # An undated event sorts last rather than first: an empty string would put it at the
    # top of the report, in front of everything that actually happens.
    return d if re.match(r"^\d{4}-\d{2}-\d{2}", d) else "9999-99-99"


def _span(events: List[Dict[str, Any]]) -> str:
    ds = sorted([_date_of(e) for e in events if re.match(r"^\d{4}-\d{2}-\d{2}", _date_of(e))])
    if not ds:
        return ""
    if len(ds) == 1:
        return ds[0]
    try:
        a, b = datetime.strptime(ds[0], "%Y-%m-%d"), datetime.strptime(ds[-1], "%Y-%m-%d")
        days = (b - a).days
        months = days / 30.44
        length = f"{days} days" if days < 60 else (f"{months:.1f} months" if months < 24 else f"{months/12:.1f} years")
        return f"{ds[0]} to {ds[-1]} ({length})"
    except Exception:
        return f"{ds[0]} to {ds[-1]}"


def write_up(name: str, events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Claude groups the events into phases and says what each one is for. Failing that,
    the report still goes out -- the events are the report, the prose is the commentary,
    and losing the commentary is not a reason to lose the download."""
    span = _span(events)
    brief = [{k: _s(v) for k, v in e.items() if _s(v)} for e in events][:200]
    try:
        client = OpenAI(api_key=os.getenv("ANTHROPIC_API_KEY", ""), timeout=60, max_retries=1)
        r = client.responses.create(
            model=MODEL,
            instructions=(
                "You are writing the front page of a project timeline report. You are given the events "
                "of a timeline in time order. Return ONLY JSON: {\"summary\": \"...\", \"phases\": "
                "[{\"name\": \"...\", \"from\": \"YYYY-MM-DD\", \"to\": \"YYYY-MM-DD\", \"what\": \"...\"}]}. "
                "The summary is 2 to 4 sentences on what this timeline covers, how long it runs, and where "
                "the weight of the work sits -- plain and specific, no marketing. Group the events into 2 to 6 "
                "phases that follow the dates; every phase must name what falls in it and why those events "
                "belong together. Use ONLY the events given; invent nothing, and do not repeat the event list."
            ),
            input=json.dumps({"timeline": name, "span": span, "events": brief}),
        )
        txt = getattr(r, "output_text", None) or ""
        m = re.search(r"\{.*\}", txt, re.S)
        out = json.loads(m.group(0)) if m else {}
        return {"summary": _s(out.get("summary")), "phases": out.get("phases") or []}
    except Exception as e:  # pragma: no cover
        print(f"timeline-report: no write-up ({e})", file=sys.stderr)
        return {"summary": "", "phases": []}


def build(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, str):
        payload = json.loads(payload)
    name = _s(payload.get("name")) or "Timeline"
    events = [e for e in (payload.get("events") or []) if isinstance(e, dict)]
    events.sort(key=_sort_key)

    wu = write_up(name, events) if events else {"summary": "", "phases": []}
    span = _span(events)

    sections: List[Dict[str, Any]] = []

    # The front page: what this is, over what period, in how many events.
    overview = [{"Field": "Timeline", "Value": name}]
    if span:
        overview.append({"Field": "Span", "Value": span})
    overview.append({"Field": "Events", "Value": str(len(events))})
    kinds: Dict[str, int] = {}
    for e in events:
        kinds[_s(e.get("Type")) or "milestone"] = kinds.get(_s(e.get("Type")) or "milestone", 0) + 1
    if kinds:
        overview.append({"Field": "Of which", "Value": ", ".join(f"{v} {k}" for k, v in sorted(kinds.items()))})
    if wu["summary"]:
        overview.append({"Field": "Summary", "Value": wu["summary"]})
    sections.append({"name": "Overview", "rows": overview})

    if wu["phases"]:
        rows = []
        for p in wu["phases"]:
            if not isinstance(p, dict):
                continue
            when = " to ".join([x for x in [_s(p.get("from")), _s(p.get("to"))] if x])
            rows.append({"Phase": _s(p.get("name")), "When": when, "What it covers": _s(p.get("what"))})
        if rows:
            sections.append({"name": "Phases", "rows": rows})

    # The events themselves: every field that carries something, in time order. Nothing is
    # dropped or shortened here -- the PDF wraps a long comment across lines rather than
    # cutting it, so the report holds what the timeline holds.
    ev_rows = []
    for e in events:
        row: Dict[str, Any] = {}
        for k in ("Name", "Type", "Date", "Start", "End", "Table", "Row", "Comment", "Link"):
            v = _s(e.get(k))
            if v:
                row[k] = v
        for k, v in e.items():      # anything the caller added that is not in the list above
            if k not in row and _s(v):
                row[k] = _s(v)
        if row:
            ev_rows.append(row)
    sections.append({"name": "Events", "rows": ev_rows or [{"Name": "(no events)"}]})

    return {
        "title": name + (" — " + span if span else ""),
        "summary": wu["summary"],
        "sections": sections,
        "diagnostics": "NO_ISSUES_DETECTED",
    }


def _main() -> int:
    # THE BRIDGE PASSES ITS ARGUMENT THROUGH works.param AND TAKES THE ANSWER THROUGH
    # works.resolve. Printing JSON to stdout instead leaves it with nothing to read --
    # "the answer could not be read (Unexpected end of JSON input)" -- which is what this
    # did until it was pointed at the same contract every other py tool here uses.
    if works is not None:
        try:
            works.msg("Writing up the timeline...")
            works.resolve(build(str(works.param(1) or "{}")))
        except Exception as e:
            works.resolve({"status": "error", "error": str(e), "where": "timeline-report"})
        return 0
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(build(raw)))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
