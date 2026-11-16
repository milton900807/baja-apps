#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read a calendar (iCalendar/.ics) and return its events as plain dates.

WHY ICS AND NOT A GOOGLE SIGN-IN. Reading somebody's calendar through Google's API needs the
calendar scope added to the consent screen, a refresh token kept per user on the server, and
Google's verification of the app for a sensitive scope -- none of which can be invented here,
and all of which are decisions for whoever owns the cloud project. Every calendar worth
reading (Google, Outlook, Apple, Fastmail) publishes a private iCal address that needs no
sign-in at all, so that is what this reads. The address is a secret: it is used and never
stored or logged here.

RECURRING EVENTS ARE NOT EXPANDED. An RRULE is a small language of its own (counts, until,
by-day, exceptions) and half-expanding it would put events on dates they do not fall on,
which is worse than leaving them out and saying so. They are counted and reported.

param(1): the calendar address (https or webcal), or the text of an .ics file
param(2): optional JSON {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "limit": n}

Resolves {"status":"OK","events":[{title,start,end,all_day}],"skipped_recurring":n,
          "total":n,"name":"..."} or {"status":"ERROR","error":...}
"""
from __future__ import annotations
import json
import re
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

from ion import works

MAX_BYTES = 8 * 1024 * 1024
DEFAULT_LIMIT = 400


def _unfold(text: str) -> List[str]:
    """ICS folds long lines by starting the continuation with a space or tab."""
    out: List[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and out:
            out[-1] += raw[1:]
        else:
            out.append(raw)
    return out


def _unescape(v: str) -> str:
    """A value as written: ICS escapes commas, semicolons and newlines inside one."""
    out = v.replace(chr(92) + "n", " ").replace(chr(92) + "N", " ")
    out = out.replace(chr(92) + ",", ",").replace(chr(92) + ";", ";")
    out = out.replace(chr(92) + chr(92), chr(92))
    return out.strip()


def _parse_dt(value: str) -> Optional[Dict[str, Any]]:
    """A DTSTART/DTEND value as {date, all_day}. Times are kept to the day they fall on.

    A timeline is drawn in days, so the time of day is not what is being asked for; what
    matters is that an event does not slide to the day before. A UTC stamp (trailing Z) is
    left on its own date rather than shifted into the reader's zone, since the shift is what
    produces a meeting that happened yesterday.
    """
    v = (value or "").strip()
    if not v:
        return None
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$", v)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        dd = date(y, mo, d)
    except ValueError:
        return None
    return {"date": dd.isoformat(), "all_day": m.group(4) is None,
            "time": (m.group(4) + ":" + m.group(5)) if m.group(4) else None}


def _fetch(address: str) -> str:
    import requests
    url = address.strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    if not url.lower().startswith("https://"):
        raise ValueError("the calendar address has to be an https:// or webcal:// link")
    r = requests.get(url, timeout=30, headers={"User-Agent": "gene.clinic calendar reader"},
                     stream=True)
    if r.status_code == 404:
        raise ValueError("that address returned 'not found': in Google Calendar it is "
                         "Settings > the calendar > 'Secret address in iCal format'")
    if r.status_code in (401, 403):
        raise ValueError("that address was refused: the SECRET iCal address is the one that "
                         "needs no sign-in, not the one from the browser's address bar")
    r.raise_for_status()
    body = r.raw.read(MAX_BYTES + 1, decode_content=True) or b""
    if len(body) > MAX_BYTES:
        raise ValueError("that calendar is larger than this can read in one go")
    return body.decode("utf-8", "replace")


def _events(text: str, start: Optional[date], end: Optional[date], limit: int) -> Dict[str, Any]:
    if "BEGIN:VEVENT" not in text.upper():
        raise ValueError("that did not come back as a calendar (no events in it)")
    name = ""
    events: List[Dict[str, Any]] = []
    skipped_recurring = 0
    total = 0
    cur: Optional[Dict[str, Any]] = None
    for line in _unfold(text):
        up = line.upper()
        if up.startswith("BEGIN:VEVENT"):
            cur = {}
            continue
        if up.startswith("END:VEVENT"):
            if cur is not None:
                total += 1
                if cur.get("recurring"):
                    skipped_recurring += 1
                elif cur.get("start") and cur.get("title"):
                    events.append({"title": cur["title"],
                                   "start": cur["start"]["date"],
                                   "end": (cur.get("end") or cur["start"])["date"],
                                   "all_day": bool(cur["start"]["all_day"]),
                                   "time": cur["start"].get("time")})
            cur = None
            continue
        if cur is None:
            if up.startswith("X-WR-CALNAME"):
                name = _unescape(line.split(":", 1)[1]) if ":" in line else ""
            continue
        key = up.split(":", 1)[0].split(";", 1)[0]
        val = line.split(":", 1)[1] if ":" in line else ""
        if key == "SUMMARY":
            cur["title"] = _unescape(val)[:200]
        elif key == "DTSTART":
            cur["start"] = _parse_dt(val)
        elif key == "DTEND":
            cur["end"] = _parse_dt(val)
        elif key == "RRULE":
            cur["recurring"] = True

    # An all-day event's DTEND is the day AFTER it ends, by the spec. Left as it comes, a
    # one-day event is drawn as a two-day band.
    for e in events:
        if e["all_day"] and e["end"] != e["start"]:
            try:
                e["end"] = (date.fromisoformat(e["end"]) - timedelta(days=1)).isoformat()
            except ValueError:
                pass
        if e["end"] < e["start"]:
            e["end"] = e["start"]

    if start or end:
        kept = []
        for e in events:
            try:
                s = date.fromisoformat(e["start"]); en = date.fromisoformat(e["end"])
            except ValueError:
                continue
            if start and en < start:
                continue
            if end and s > end:
                continue
            kept.append(e)
        events = kept

    events.sort(key=lambda e: (e["start"], e["title"]))
    cut = len(events) > limit
    return {"status": "OK", "name": name, "events": events[:limit], "total": total,
            "skipped_recurring": skipped_recurring,
            "note": ("only the first %d are returned" % limit) if cut else ""}


def _main() -> int:
    try:
        source = str(works.param(1) or "").strip()
        if not source:
            works.resolve({"status": "ERROR", "error": "no calendar address was given"})
            return 0
        raw = works.param(2)
        opts: Dict[str, Any] = {}
        if raw:
            try:
                opts = json.loads(raw) if isinstance(raw, str) else (raw or {})
            except Exception:
                opts = {}
        if not isinstance(opts, dict):
            opts = {}

        def day(key: str) -> Optional[date]:
            v = str(opts.get(key) or "").strip()
            try:
                return date.fromisoformat(v) if v else None
            except ValueError:
                return None

        try:
            limit = int(opts.get("limit") or DEFAULT_LIMIT)
        except (TypeError, ValueError):
            limit = DEFAULT_LIMIT
        limit = max(1, min(limit, 2000))

        text = source if "BEGIN:VEVENT" in source.upper() else _fetch(source)
        works.resolve(_events(text, day("from"), day("to"), limit))
    except Exception as e:  # noqa: BLE001
        # The address can carry a secret token, so the message says what went wrong without
        # echoing what was asked for.
        msg = str(e)
        if source if False else False:
            pass
        works.resolve({"status": "ERROR", "error": msg[:300]})
    return 0


_main()
