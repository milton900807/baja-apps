#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Operations Scheduler → Hybrid (Deterministic + GPT) line-by-line extractor

FIXES:
• Sequential cursor-based scheduling (pipeline chaining)
• Supports BOTH absolute and relative starts:
  - Absolute: "Jan 5", "1/5/2026", "2026-01-05"
  - Relative: "next month", "tomorrow", "from now", etc.
• Explicit-start qualifiers supported: "starting", "from", "on", "as of"
• Duration-only lines no longer fall back to 4 hours
• GPT used only as last resort
• Clean task name extraction preserved

NEW FIX:
• Eliminates "can't compare offset-naive and offset-aware datetimes" by normalizing
  everything to timezone-aware local datetimes (same tz) end-to-end.
"""

import re
import json
import time
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from dateutil import parser as dtparser
from dateutil.relativedelta import relativedelta

DEFAULT_FALLBACK_HOURS = 4.0

# ----- Ion shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None:
            print(f"IONWORKS:MSG:{s}")

        def resolve(self, obj: Any) -> None:
            print(json.dumps(obj, indent=2, ensure_ascii=False))

        def param(self, i: int) -> Any:
            return None

    works = _Shim()  # type: ignore

# ----- Optional GPT client -----
try:
    from openai import OpenAI  # type: ignore
except Exception:
    OpenAI = None

# ---------------- TZ HELPERS ----------------

def _now_local() -> datetime:
    """Timezone-aware 'now' in local timezone."""
    return datetime.now().astimezone()

def _coerce_local_tz(dt: Optional[datetime], tz) -> Optional[datetime]:
    """Ensure dt is timezone-aware in tz (local)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)

def _fromisoformat_loose(s: Optional[str]) -> Optional[datetime]:
    """Parse ISO datetime, handling trailing 'Z'."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None

# ---------------- REGEX ----------------

# Duration anywhere in line
_TRAIL_DUR_RE = re.compile(
    r'(?i)\b(\d+(?:\.\d+)?)\s*(months?|mos?|mo|weeks?|wks?|wk|days?|d|hours?|hrs?|hr|h)\b'
)

# Explicit start qualifiers
_START_QUALIFIERS = re.compile(
    r'(?i)\b(?:starting|start(?:ing)?|begin(?:ning)?|from|as\s+of|on)\b'
)

# Month words token
_MONTH_TOKEN_RE = re.compile(
    r'(?i)\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|'
    r'sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b'
)

# Natural date like "Jan 5" or "January 5, 2026"
_NATDATE_RE = re.compile(
    r'(?ix)\b('
    r'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|'
    r'sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
    r')\s+(\d{1,2})(?:,\s*(\d{4}))?'
)

# Numeric date tokens
_NUMDATE_RE = re.compile(r'(?i)\b(\d{1,2}/\d{1,2}(?:/\d{2,4})?)\b')
_ISO_DATE_RE = re.compile(r'(?i)\b(\d{4}-\d{2}-\d{2})\b')

# Relative starts
_REL_START_RE = re.compile(
    r'(?i)\b('
    r'next\s+month|next\s+week|next\s+year|'
    r'this\s+month|this\s+week|this\s+year|'
    r'today|tomorrow|now|from\s+now'
    r')\b'
)

# ---------------- NAME CLEANING ----------------

def _clean_task_name(text: str) -> str:
    """Strip dates, qualifiers, durations, leaving only the task phrase."""
    if not text:
        return "Untitled"

    original = text.strip()

    # Remove leading qualifiers
    lead = re.compile(
        r'(?i)^\s*(?:starting|start(?:ing)?|begin(?:ning)?|from|as\s+of|on|we\s+will|we\'ll|to\s+start)\b[,:-]?\s*'
    )
    text = lead.sub("", original).strip()

    # Remove trailing end phrases like: "until March", "through June", etc.
    text = re.compile(r'(?i)\b(?:until|through|thru|ending|ends?|by|deadline|till|to)\b.*$').sub("", text).strip()

    # Remove natural dates & numeric dates & years
    text = _NATDATE_RE.sub("", text).strip()
    text = _NUMDATE_RE.sub("", text).strip()
    text = _ISO_DATE_RE.sub("", text).strip()
    text = re.compile(r'(?i)\b\d{4}\b').sub("", text).strip()

    # Remove duration phrases ("expect 3 months", "for 6 weeks")
    text = re.compile(
        r'(?i)\b(?:for|over|about|around|expect(?:ing)?|will\s+take|takes?)\s+\d+(?:\.\d+)?\s*'
        r'(months?|mos?|mo|weeks?|wks?|wk|days?|d|hours?|hrs?|hr|h)\b'
    ).sub("", text).strip()

    # Remove raw durations
    text = _TRAIL_DUR_RE.sub("", text).strip()

    # Remove leading "to <verb>"
    text = re.compile(r'(?i)^\s*to\b\s*').sub("", text).strip()

    # Cleanup
    text = re.sub(r'\s+', " ", text).strip()
    text = re.sub(r'[,:;.\-]+$', "", text).strip()

    return text or "Untitled"

# ---------------- DATE PARSERS ----------------

def _base_9am(now: datetime) -> datetime:
    return now.replace(hour=9, minute=0, second=0, microsecond=0)

def _future_bias_if_no_year(dt: datetime, *, now: datetime, had_year: bool) -> datetime:
    """If no year was present, bias to current year or next year if date has passed."""
    if had_year:
        return dt
    # force current year first
    dt = dt.replace(year=now.year)
    if dt < now:
        try:
            dt = dt.replace(year=now.year + 1)
        except ValueError:
            # Feb 29 etc.
            dt = dt.replace(year=now.year + 1, month=3, day=1)
    return dt

def _parse_relative_start(line: str, now: datetime) -> Optional[datetime]:
    m = _REL_START_RE.search(line)
    if not m:
        return None

    token = m.group(1).lower()
    base = _base_9am(now)

    if token in ("now", "from now", "today"):
        return base
    if token == "tomorrow":
        return base + timedelta(days=1)
    if token == "next week":
        return base + timedelta(weeks=1)
    if token == "next month":
        return base + relativedelta(months=+1)
    if token == "next year":
        return base + relativedelta(years=+1)
    if token in ("this week", "this month", "this year"):
        return base

    return None

def _parse_explicit_start(line: str, now: datetime) -> Optional[datetime]:
    """
    Parse "starting/from/on/as of <date...>" segment.
    Uses fuzzy parse so extra words don't break it.
    """
    m = _START_QUALIFIERS.search(line)
    if not m:
        return None

    segment = line[m.end():].strip()
    if not segment:
        return None

    try:
        base = _base_9am(now)
        dt = dtparser.parse(segment, fuzzy=True, default=base)
        dt = _coerce_local_tz(dt, base.tzinfo)

        had_year = bool(re.search(r'\b\d{4}\b', segment))
        # only apply future-bias if we actually saw a date token
        if _MONTH_TOKEN_RE.search(segment) or _NUMDATE_RE.search(segment) or _ISO_DATE_RE.search(segment):
            dt = _future_bias_if_no_year(dt, now=now, had_year=had_year)
            dt = _coerce_local_tz(dt, base.tzinfo)
            return dt
        # If no recognizable date token, don't treat it as a start
        return None
    except Exception:
        return None

def _parse_absolute_date_anywhere(line: str, now: datetime) -> Optional[datetime]:
    """
    Parse absolute dates appearing anywhere in the line, e.g.:
    - "Jan 5"
    - "1/5/2026"
    - "2026-01-05"
    """
    has_token = bool(_MONTH_TOKEN_RE.search(line) or _NUMDATE_RE.search(line) or _ISO_DATE_RE.search(line))
    if not has_token:
        return None

    try:
        base = _base_9am(now)
        dt = dtparser.parse(line, fuzzy=True, default=base)
        dt = _coerce_local_tz(dt, base.tzinfo)

        had_year = bool(re.search(r'\b\d{4}\b', line))
        dt = _future_bias_if_no_year(dt, now=now, had_year=had_year)
        dt = _coerce_local_tz(dt, base.tzinfo)
        return dt
    except Exception:
        return None

def _parse_duration(line: str):
    m = _TRAIL_DUR_RE.search(line)
    if not m:
        return None, None, False
    num = float(m.group(1))
    unit = m.group(2).lower()
    expect_flag = bool(re.search(r'(?i)\bexpect\b', line))
    return num, unit, expect_flag

def _local_parse_line(
    line: str,
    now: datetime,
    default_start: Optional[datetime],
):
    """
    Determine start_dt:
    1) explicit "starting/from/on/as of <...>"
    2) relative tokens ("next month", "tomorrow"...)
    3) absolute date anywhere ("Jan 5", "1/5/26", "2026-01-05")
    4) cursor chaining default_start
    """
    start_dt = _parse_explicit_start(line, now)
    if start_dt is None:
        start_dt = _parse_relative_start(line, now)
    if start_dt is None:
        start_dt = _parse_absolute_date_anywhere(line, now)
    if start_dt is None and default_start is not None:
        start_dt = default_start

    end_dt = None
    num, unit, expect_flag = _parse_duration(line)

    if start_dt and num is not None:
        if unit.startswith('mo'):
            months_int = max(1, int(round(num))) if num >= 1 else 1
            months_to_add = max(1, months_int - 1) if expect_flag else months_int
            end_dt = start_dt + relativedelta(months=months_to_add)
        elif unit.startswith('wk') or unit.startswith('w'):
            end_dt = start_dt + timedelta(weeks=num)
        elif unit.startswith('d'):
            end_dt = start_dt + timedelta(days=num)
        else:
            end_dt = start_dt + timedelta(hours=num)

    return start_dt, end_dt

# ---------------- GPT FALLBACK ----------------

_client_singleton = None

def _get_client():
    global _client_singleton
    if _client_singleton is None and OpenAI is not None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

def _chat_call(line: str, *, model: str, temperature: float):
    client = _get_client()
    if client is None:
        return None

    system_prompt = (
        "You are a scheduling assistant. Return STRICT JSON:\n"
        "{\"name\": string, \"start\": \"YYYY-MM-DDTHH:MM:SS\", \"end\": \"YYYY-MM-DDTHH:MM:SS\"}.\n"
    )

    user_prompt = f"now={_now_local().isoformat()}\nTask line: {line.strip()}"

    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=model,
                temperature=temperature,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return json.loads(resp.choices[0].message.content.strip())
        except Exception as e:
            works.msg(f"⚠️ GPT error: {e}; retrying...")
            time.sleep(2 ** attempt)
    return None

# ---------------- INTERVAL BUILDER ----------------

def build_interval_for_line(
    line: str,
    *,
    model: str,
    temperature: float,
    default_start: Optional[datetime] = None,
):
    name = (line or "Untitled").strip()

    now = _now_local().replace(second=0, microsecond=0)
    tz = now.tzinfo

    default_start = _coerce_local_tz(default_start, tz)

    start_dt, end_dt = _local_parse_line(line, now, default_start)
    start_dt = _coerce_local_tz(start_dt, tz)
    end_dt = _coerce_local_tz(end_dt, tz)

    num, unit, _ = _parse_duration(line)
    need_gpt = (start_dt is None) or (end_dt is None and not (num and unit))

    if need_gpt:
        data = _chat_call(line, model=model, temperature=temperature) or {}
        if data.get("name"):
            name = data["name"].strip() or name

        if start_dt is None:
            dt0 = _fromisoformat_loose(data.get("start"))
            start_dt = _coerce_local_tz(dt0, tz) or default_start or now

        if end_dt is None:
            dt1 = _fromisoformat_loose(data.get("end"))
            end_dt = _coerce_local_tz(dt1, tz) or (start_dt or now) + timedelta(hours=DEFAULT_FALLBACK_HOURS)

    if start_dt is None:
        start_dt = default_start or now
    if end_dt is None:
        end_dt = start_dt + timedelta(hours=DEFAULT_FALLBACK_HOURS)

    # Final normalization (belt + suspenders)
    start_dt = _coerce_local_tz(start_dt, tz)
    end_dt = _coerce_local_tz(end_dt, tz)

    if end_dt < start_dt:
        start_dt, end_dt = end_dt, start_dt

    # Clean name last
    name = _clean_task_name(name)

    return {
        "name": name,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
        "type": "interval",
        "y": random.uniform(0.3, 0.6),
        "color": "black",
    }

def ensure_unique_names(
    intervals: List[Dict[str, Any]],
    milestones: Optional[List[Dict[str, Any]]] = None,
    *,
    name_key: str = "name",
) -> None:
    """Ensure names are unique across intervals and milestones."""
    seen: Dict[str, int] = {}

    def _process(items: Optional[List[Dict[str, Any]]]) -> None:
        if not items:
            return
        for item in items:
            base = (item.get(name_key) or "Untitled").strip() or "Untitled"
            count = seen.get(base, 0) + 1
            seen[base] = count
            item[name_key] = base if count == 1 else f"{base} ({count})"

    _process(intervals)
    _process(milestones)

def build_intervals(prompt: str, model="gpt-4o-mini", temperature=0.2):
    lines = [l.strip() for l in (prompt or "").splitlines() if l.strip()]
    if not lines:
        now = _now_local()
        return {
            "intervals": [],
            "window": {"start": now.isoformat(), "end": now.isoformat()},
            "lines": [],
        }

    # Cursor chaining: tasks without explicit/relative/absolute start begin at previous end.
    cursor = _base_9am(_now_local()).replace(second=0, microsecond=0)

    intervals: List[Dict[str, Any]] = []
    for line in lines:
        interval = build_interval_for_line(
            line,
            model=model,
            temperature=temperature,
            default_start=cursor,
        )
        intervals.append(interval)

        cursor_parsed = _fromisoformat_loose(interval["end"])
        cursor = _coerce_local_tz(cursor_parsed, cursor.tzinfo) or cursor

    ensure_unique_names(intervals)

    min_start = min(_fromisoformat_loose(i["start"]) for i in intervals)  # type: ignore[arg-type]
    max_end = max(_fromisoformat_loose(i["end"]) for i in intervals)      # type: ignore[arg-type]

    # Safety (should not happen, but avoids mypy/runtime edge cases)
    if min_start is None or max_end is None:
        now = _now_local()
        return {
            "intervals": intervals,
            "window": {"start": now.isoformat(), "end": now.isoformat()},
            "lines": lines,
        }

    def _hours(ref: datetime, dt: datetime) -> float:
        return max(0.0, (dt - ref).total_seconds() / 3600)

    for i in intervals:
        s = _fromisoformat_loose(i["start"])
        e = _fromisoformat_loose(i["end"])
        if s is None or e is None:
            continue
        i["startX"] = _hours(min_start, s)
        i["x"] = _hours(min_start, e)

    return {
        "intervals": intervals,
        "window": {"start": min_start.isoformat(), "end": max_end.isoformat()},
        "lines": lines,
    }

# ---------------- ION ENTRY ----------------

def _read_param(i: int):
    try:
        return works.param(i)
    except Exception:
        return None

def _main_ion():
    prompt = _read_param(1)
    model = _read_param(2) or "gpt-4o-mini"
    temperature = float(_read_param(3) or 0.2)

    if not prompt:
        raise RuntimeError("param(1) required: prompt")

    works.msg("🧠 hybrid parse (absolute + relative + cursor-chained)…")
    result = build_intervals(prompt, model=model, temperature=temperature)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    works.msg("🔧 operations scheduler — hybrid line-by-line extractor (absolute+relative supported)")
    _main_ion()
