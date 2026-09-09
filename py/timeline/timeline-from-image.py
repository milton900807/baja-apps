#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Image -> timeline extractor (Claude vision).

Reads a picture of a timeline, roadmap, Gantt chart, schedule slide, or a photo of a
whiteboard, asks Claude to list every dated event on it, and returns points in the shape
the timeline plot (flexigraph/plot.js, type 'timeline') draws directly:

    intervals : [{name, start, end, type:'interval', y, color, startX, x}]
    milestones: [{name, date,       type:'milestone', y, color, x}]
    window    : {start, end}              ISO instants bounding every event
    points    : intervals + milestones    ready for `new MPlot({points})`
    title     : chart title read off the image (or '')
    notes     : anything Claude flagged as uncertain

x / startX are hours from window.start, which is how the plot lays out time.

Ionworks params:
    1  base64 of the image (no data: prefix)
    2  mime type (image/png, image/jpeg, image/gif, image/webp)
    3  file name (display only)
    4  optional hint text from the user ("assume 2026", "fiscal quarters", ...)
    5  optional ISO instant for 'today' from the browser (resolves relative dates)

Env:
    ANTHROPIC_API_KEY      required (set on the server, handed to /py scripts by the bridge)
    TIMELINE_IMAGE_MODEL   optional model override; default claude-opus-5

Calls the Messages API over HTTPS with `requests`, matching the other Claude tools in
py/sequence (the Anthropic SDK is not installed on the server's python).
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except Exception:  # pragma: no cover
    requests = None

try:
    from dateutil import parser as dtparser
except Exception:  # pragma: no cover
    dtparser = None

# ----- Ion shim (lets the module run outside the server for tests) -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None:
            print(f"IONWORKS:MSG:{s}")

        def progress(self, v: Any) -> None:
            pass

        def resolve(self, obj: Any) -> None:
            print(json.dumps(obj, indent=2, ensure_ascii=False))

        def param(self, i: int) -> Any:
            return None

    works = _Shim()  # type: ignore

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("TIMELINE_IMAGE_MODEL") or "claude-opus-5"
API_URL = "https://api.anthropic.com/v1/messages"
IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")
HOUR = 3600.0

INTERVAL_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#d97706", "#db2777", "#475569", "#059669", "#b45309"]
MILESTONE_COLOR = "#dc2626"

SYSTEM = (
    "You read pictures of timelines, roadmaps, Gantt charts, project schedules, slide "
    "timelines, and hand-drawn whiteboard plans, and transcribe every dated item on them.\n"
    "Rules:\n"
    "- List EVERY event you can see. Do not summarize or merge items.\n"
    "- An item that spans time (a bar, an arrow, a phase, 'Jan-Mar', 'Q2') is kind='interval' "
    "with both start and end. A single point in time (a diamond, a dot, a dated label, a "
    "deadline, a launch) is kind='milestone' with end equal to start.\n"
    "- Dates are ISO calendar dates YYYY-MM-DD. If the image shows only months or quarters, "
    "use the first day of the month/quarter for starts and the last day for ends. If a year "
    "is not shown anywhere, infer it from context (axis labels, hints, today's date) and say "
    "so in notes. Quarters are calendar quarters unless the image says fiscal.\n"
    "- Keep names short (a few words), exactly as labeled on the image where possible.\n"
    "- lane is the visual row/swimlane the item sits on, counting from 0 at the top; use 0 "
    "when there are no rows.\n"
    "- group is the swimlane / workstream / owner label if the chart has one, else ''.\n"
    "- color is the item's own color on the image as a CSS hex string if it clearly has one, "
    "else ''.\n"
    "- title is the chart's title if printed, else ''.\n"
    "- start/end at the top level bound the axis the image shows, not just the events.\n"
    "- Put anything you could not read, guessed, or found ambiguous in notes."
)

SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "start": {"type": "string"},
        "end": {"type": "string"},
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "kind": {"type": "string", "enum": ["interval", "milestone"]},
                    "start": {"type": "string"},
                    "end": {"type": "string"},
                    "lane": {"type": "integer"},
                    "group": {"type": "string"},
                    "color": {"type": "string"},
                },
                "required": ["name", "kind", "start", "end", "lane", "group", "color"],
                "additionalProperties": False,
            },
        },
        "notes": {"type": "string"},
    },
    "required": ["title", "start", "end", "events", "notes"],
    "additionalProperties": False,
}


# ---------------- dates ----------------

def _parse_date(s: Optional[str], default: Optional[datetime] = None) -> Optional[datetime]:
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        d = datetime.fromisoformat(s)
    except Exception:
        d = None
        if dtparser is not None:
            try:
                d = dtparser.parse(s, default=default or datetime(2000, 1, 1))
            except Exception:
                d = None
    if d is None:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc)


def _iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _hours(ref: datetime, d: datetime) -> float:
    return round((d - ref).total_seconds() / HOUR, 4)


def _hex_or(default: str, s: Any) -> str:
    v = ("" + (s or "")).strip()
    return v if re.fullmatch(r"#[0-9a-fA-F]{6}", v) else default


# ---------------- Claude ----------------

def _post(body: Dict[str, Any], headers: Dict[str, str]):
    return requests.post(API_URL, headers=headers, json=body, timeout=240)


def ask_claude(b64: str, mime: str, fname: str, hint: str, today: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if not ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY is not set on the server"
    if requests is None:
        return None, "python 'requests' is not available on the server"
    if not b64:
        return None, "no image data received"

    media = mime if mime in IMAGE_TYPES else "image/png"
    user_text = "Transcribe every event on this timeline image."
    if fname:
        user_text += f"\nFile name: {fname}"
    if today:
        user_text += f"\nToday's date (for relative or missing years): {today[:10]}"
    if hint:
        user_text += f"\nHints from the user: {hint.strip()}"

    body: Dict[str, Any] = {
        "model": MODEL,
        "max_tokens": 16000,
        "system": SYSTEM,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                {"type": "text", "text": user_text},
            ],
        }],
        # Structured output: the first text block is guaranteed to be JSON matching SCHEMA.
        "output_config": {
            "effort": "medium",
            "format": {"type": "json_schema", "schema": SCHEMA},
        },
        # Server-side refusal fallback: if the primary model declines, the API re-runs the
        # same request on a fallback model inside the same call.
        "fallbacks": "default",
    }
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "content-type": "application/json",
    }

    try:
        try:
            import claude_usage as _cu  # type: ignore
            _cu.bump("timeline-from-image")
        except Exception:
            pass

        r = _post(body, headers)
        if r.status_code == 400 and "fallback" in (r.text or "").lower():
            # Fallbacks not accepted for this model / account: retry the plain request.
            body.pop("fallbacks", None)
            headers.pop("anthropic-beta", None)
            r = _post(body, headers)
        if r.status_code != 200:
            return None, "anthropic %s: %s" % (r.status_code, (r.text or "")[:300])

        data = r.json()
        if data.get("stop_reason") == "refusal":
            det = data.get("stop_details") or {}
            return None, "the model declined to read this image" + (
                f" ({det.get('category')})" if det.get("category") else "")

        parts = data.get("content", []) or []
        txt = "".join(b.get("text", "") for b in parts if b.get("type") == "text").strip()
        try:
            parsed = json.loads(txt)
        except Exception:
            m = re.search(r"\{.*\}", txt, re.S)
            if not m:
                return None, "no JSON in the model response"
            parsed = json.loads(m.group(0))
        parsed["_model"] = data.get("model") or MODEL
        return parsed, None
    except Exception as ex:
        return None, str(ex)


# ---------------- model -> plot points ----------------

def build_model(extracted: Dict[str, Any], today: Optional[str] = None) -> Dict[str, Any]:
    """Turn Claude's transcription into the point contract the timeline plot draws."""
    now = _parse_date(today) or datetime.now(timezone.utc)
    events = extracted.get("events") or []

    intervals: List[Dict[str, Any]] = []
    milestones: List[Dict[str, Any]] = []

    for ev in events:
        if not isinstance(ev, dict):
            continue
        name = ("" + (ev.get("name") or "")).strip() or "Untitled"
        s = _parse_date(ev.get("start"), now)
        e = _parse_date(ev.get("end"), now)
        if s is None and e is None:
            continue
        if s is None:
            s = e
        if e is None:
            e = s
        if e < s:
            s, e = e, s
        kind = (ev.get("kind") or "").lower()
        if kind != "milestone" and e == s:
            kind = "milestone"
        lane = ev.get("lane")
        lane = int(lane) if isinstance(lane, (int, float)) and lane >= 0 else 0
        group = ("" + (ev.get("group") or "")).strip()
        item = {"name": name, "lane": lane, "group": group}

        if kind == "milestone":
            item.update({
                "type": "milestone",
                "date": _iso(s),
                "color": _hex_or(MILESTONE_COLOR, ev.get("color")),
            })
            milestones.append(item)
        else:
            # Whole-day bars: an end date read off a chart means "through that day".
            if (e - s) < timedelta(hours=1):
                e = s + timedelta(days=1)
            item.update({
                "type": "interval",
                "start": _iso(s),
                "end": _iso(e),
                "color": _hex_or(INTERVAL_COLORS[len(intervals) % len(INTERVAL_COLORS)], ev.get("color")),
            })
            intervals.append(item)

    # Unique names (the plot keys some behaviour off point.name).
    seen: Dict[str, int] = {}
    for it in intervals + milestones:
        base = it["name"]
        n = seen.get(base, 0) + 1
        seen[base] = n
        if n > 1:
            it["name"] = f"{base} ({n})"

    # Window: what the image's axis showed, widened to cover every event.
    starts = [_parse_date(i["start"]) for i in intervals] + [_parse_date(m["date"]) for m in milestones]
    ends = [_parse_date(i["end"]) for i in intervals] + [_parse_date(m["date"]) for m in milestones]
    starts = [d for d in starts if d]
    ends = [d for d in ends if d]
    axis_s = _parse_date(extracted.get("start"), now)
    axis_e = _parse_date(extracted.get("end"), now)
    if not starts:
        w_s = axis_s or now
        w_e = axis_e or (w_s + timedelta(days=365))
    else:
        w_s = min(starts + ([axis_s] if axis_s else []))
        w_e = max(ends + ([axis_e] if axis_e else []))
    if w_e <= w_s:
        w_e = w_s + timedelta(days=1)

    # Lanes -> y. Rows the image shows are honoured; overlapping bars in one row get
    # nudged onto their own line so labels stay readable.
    def lane_y(lane: int) -> float:
        return round(min(0.92, 0.28 + lane * 0.11), 3)

    occupied: Dict[int, List[Tuple[float, float]]] = {}
    for it in intervals:
        s_h = _hours(w_s, _parse_date(it["start"]))
        e_h = _hours(w_s, _parse_date(it["end"]))
        lane = it.pop("lane")
        while any(not (e_h <= a or s_h >= b) for (a, b) in occupied.get(lane, [])):
            lane += 1
        occupied.setdefault(lane, []).append((s_h, e_h))
        it["startX"] = s_h
        it["x"] = e_h
        it["y"] = lane_y(lane)

    for idx, ms in enumerate(milestones):
        lane = ms.pop("lane")
        ms["x"] = _hours(w_s, _parse_date(ms["date"]))
        ms["y"] = round(min(0.95, 0.55 + lane * 0.11 + (0.08 if idx % 2 else 0.0)), 3)

    title = ("" + (extracted.get("title") or "")).strip()
    return {
        "title": title,
        "window": {"start": _iso(w_s), "end": _iso(w_e)},
        "intervals": intervals,
        "milestones": milestones,
        "points": intervals + milestones,
        "notes": ("" + (extracted.get("notes") or "")).strip(),
        "model": extracted.get("_model") or MODEL,
    }


# ---------------- entry ----------------

def _main_ion() -> int:
    b64 = works.param(1) or ""
    mime = ("" + (works.param(2) or "")).strip().lower()
    fname = works.param(3) or ""
    hint = ("" + (works.param(4) or "")).strip()
    today = ("" + (works.param(5) or "")).strip()

    if isinstance(b64, str) and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1] if "," in b64 else ""

    works.msg("Reading the image with Claude…")
    works.progress(10)
    extracted, err = ask_claude(b64, mime, fname, hint, today)
    if err:
        works.resolve({"error": err, "title": "", "intervals": [], "milestones": [], "points": [],
                       "window": None, "notes": ""})
        return 0
    works.progress(80)
    model = build_model(extracted or {}, today)
    works.msg(f"Found {len(model['intervals'])} spans and {len(model['milestones'])} milestones")
    works.progress(100)
    works.resolve(model)
    return 0


if __name__ == "__main__":
    _main_ion()
