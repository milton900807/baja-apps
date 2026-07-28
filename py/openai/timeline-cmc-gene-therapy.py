#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Operations Scheduler → Hybrid (Deterministic + GPT) line-by-line extractor

FIXED to consume "Written Gantt Chart" text like:
- "Months −24 to −18"
- "Months 0 to +1"
- "Month 0"
…and assign intervals for the subsequent task lines until the next range.

Key behavior:
- Treat "Month 0" as the IND submission anchor date (defaults to now, 09:00).
- Convert month offsets to real datetimes using relativedelta(months=...).
- Ignore headings/section titles; only create intervals for actual task lines.
- Keeps existing per-line natural language parsing + optional GPT fallback for OTHER inputs.
"""

import re
import json
import time
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

# ----- Ion shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ----- Optional GPT client -----
try:
    from openai import OpenAI, APITimeoutError  # type: ignore
except Exception:
    OpenAI = None
    APITimeoutError = Exception

from dateutil import parser as dtparser
from dateutil.relativedelta import relativedelta

DEFAULT_FALLBACK_HOURS = 4.0

# ---------------- REGEXES ----------------

_TRAIL_DUR_RE = re.compile(r'(?i)\b(\d+(?:\.\d+)?)\s*(months?|mos?|mo|weeks?|wks?|wk|days?|d|hours?|hrs?|hr|h)\b')
_END_QUALIFIERS = re.compile(r'(?i)\b(?:until|through|thru|ending|ends?|to|till|deadline|by)\b')
_START_QUALIFIERS = re.compile(r'(?i)\b(?:starting|start(?:ing)?|begin(?:ning)?|from|as\s+of|on)\b')

_MONTH_TOKEN_RE = re.compile(
    r'(?i)\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|'
    r'sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b'
)

_NATDATE_RE = re.compile(
    r'(?ix)\b('
    r'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|'
    r'sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
    r')\s+(\d{1,2})(?:,\s*(\d{4}))?'
)

# --- NEW: Month-range headers like "Months −24 to −18", "Months 0 to +1", "Month 0"
# Accept unicode minus (−) and ascii minus (-)
_RANGE_HDR_RE = re.compile(
    r'(?i)^\s*Months?\s+([+\-−]?\d+)\s*(?:to|\-)\s*([+\-−]?\d+)\s*$'
)
_SINGLE_MONTH_HDR_RE = re.compile(
    r'(?i)^\s*Months?\s+([+\-−]?\d+)\s*$'
)

# --- NEW: Recognize headings we should ignore as tasks
_HEADING_RE = re.compile(
    r'(?i)^\s*(written gantt chart|overall timeline|program length|ind submission|fih dosing|'
    r'\d+\.\s+|(?:\d+\.\d+)\s+|cmc\b|nonclinical\b|bioanalytical\b|clinical\b|regulatory\b|post-ind\b)\s*[:\-–]?\s*$'
)

# ---------------- NAME CLEANING ----------------

def _clean_task_name(text: str) -> str:
    """Strip dates, qualifiers, durations, leaving only the task phrase."""
    if not text:
        return "Untitled"

    original = text.strip()

    lead = re.compile(
        r'(?i)^\s*(?:starting|start(?:ing)?|begin(?:ning)?|from|as\s+of|on|we\s+will|we\'ll|to\s+start)\b[,:-]?\s*'
    )
    text = lead.sub("", original).strip()

    text = re.compile(
        r'(?i)\b(?:until|through|thru|ending|ends?|by|deadline|till|to)\b.*$'
    ).sub("", text).strip()

    text = _NATDATE_RE.sub("", text).strip()

    text = re.compile(r'(?i)\b(?:\d{1,2}/\d{1,2}(?:/\d{2,4})?|\d{4})\b').sub("", text).strip()

    text = re.compile(
        r'(?i)\b(?:for|over|about|around|expect(?:ing)?)\s+\d+(?:\.\d+)?\s*'
        r'(months?|mos?|mo|weeks?|wks?|wk|days?|d|hours?|hrs?|hr|h)\b'
    ).sub("", text).strip()

    text = _TRAIL_DUR_RE.sub("", text).strip()

    text = re.compile(r'(?i)^\s*to\b\s*').sub("", text).strip()

    text = re.sub(r'\s+', " ", text).strip()
    text = re.sub(r'[,:;.\-]+$', "", text).strip()

    return text or "Untitled"


# ---------------- LOCAL PARSER ----------------

def _parse_future_biased_date(text: str, now: datetime) -> Optional[datetime]:
    if not _MONTH_TOKEN_RE.search(text):
        return None
    try:
        base = now.replace(hour=9, minute=0, second=0, microsecond=0)
        dt = dtparser.parse(text, fuzzy=True, default=base)
        if not re.search(r'\b\d{4}\b', text):
            dt = dt.replace(year=now.year)
        if dt < now:
            try:
                dt = dt.replace(year=dt.year + 1)
            except ValueError:
                dt = dt.replace(year=dt.year + 1, month=3, day=1)
        return dt
    except Exception:
        return None

def _parse_explicit_start(line: str, now: datetime) -> Optional[datetime]:
    m = _START_QUALIFIERS.search(line)
    if not m:
        return None
    segment = line[m.end():].strip()
    if not segment:
        return None

    mdate = _NATDATE_RE.search(segment)
    if mdate:
        token = mdate.group(0)
        try:
            base = now.replace(hour=9, minute=0, second=0, microsecond=0)
            dt = dtparser.parse(token, fuzzy=False, default=base)
            if mdate.group(3) is None and dt < now:
                try:
                    dt = dt.replace(year=dt.year + 1)
                except ValueError:
                    dt = dt.replace(year=dt.year + 1, month=3, day=1)
            return dt
        except Exception:
            pass

    try:
        base = now.replace(hour=9, minute=0, second=0, microsecond=0)
        dt = dtparser.parse(segment, fuzzy=True, default=base)
        if not re.search(r'\b\d{4}\b', segment) and dt < now:
            try:
                dt = dt.replace(year=dt.year + 1)
            except ValueError:
                dt = dt.replace(year=dt.year + 1, month=3, day=1)
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

def _local_parse_line(line: str, now: datetime):
    start_dt = _parse_explicit_start(line, now)
    if start_dt is None:
        start_dt = _parse_future_biased_date(line, now)

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


# ---------------- NEW: GANTT TEXT PARSER (Month offsets) ----------------

def _norm_minus(s: str) -> str:
    return s.replace("−", "-").strip()

def _parse_month_header(line: str) -> Optional[Tuple[int, int]]:
    """
    Returns (start_offset_months, end_offset_months) if line is a month header.
    For "Month 0" -> (0, 0)
    For "Months -24 to -18" -> (-24, -18)
    """
    line = line.strip()
    m = _RANGE_HDR_RE.match(line)
    if m:
        a = int(_norm_minus(m.group(1)))
        b = int(_norm_minus(m.group(2)))
        # Ensure ordering
        return (a, b) if a <= b else (b, a)

    m2 = _SINGLE_MONTH_HDR_RE.match(line)
    if m2:
        a = int(_norm_minus(m2.group(1)))
        return (a, a)

    return None

def _is_task_line(line: str) -> bool:
    """True for bullet/task-like lines we should turn into intervals."""
    s = line.strip()
    if not s:
        return False
    if _parse_month_header(s) is not None:
        return False
    if _HEADING_RE.match(s):
        return False

    # Ignore obviously non-task lines
    if re.match(r'(?i)^\s*(months?|month)\b', s):
        return False
    if re.match(r'(?i)^\s*(program length|ind submission|fih dosing)\b', s):
        return False

    # Prefer lines that look like real tasks (contain letters and are not just numbering)
    if re.match(r'^\s*\d+(\.\d+)*\s*$', s):
        return False

    return True

def _month_offsets_to_datetimes(anchor: datetime, a: int, b: int) -> Tuple[datetime, datetime]:
    """
    Convert month offsets to real datetimes.
    Convention:
      start = anchor + a months
      end   = anchor + b months
    If a == b (single month), end = start + 1 month.
    If end <= start (shouldn't happen after ordering), end = start + 1 month.
    """
    start = anchor + relativedelta(months=a)
    end = anchor + relativedelta(months=b)

    if a == b:
        end = start + relativedelta(months=1)

    if end <= start:
        end = start + relativedelta(months=1)

    return start, end

def build_intervals_from_gantt_text(prompt: str, *, ind_anchor: datetime) -> Optional[Dict[str, Any]]:
    """
    If the prompt looks like the written Gantt format (contains 'Months ...' headers),
    parse it into intervals using month offsets.
    Returns None if it doesn't look like that format.
    """
    raw_lines = [l.rstrip() for l in (prompt or "").splitlines()]
    lines = [l.strip() for l in raw_lines if l.strip()]
    if not lines:
        return None

    # Heuristic: if we have at least 2 month headers, treat as gantt-text
    month_hdrs = sum(1 for l in lines if _parse_month_header(l) is not None)
    if month_hdrs < 2:
        return None

    intervals: List[Dict[str, Any]] = []

    current_range: Optional[Tuple[int, int]] = None

    for line in lines:
        rng = _parse_month_header(line)
        if rng is not None:
            current_range = rng
            continue

        if not _is_task_line(line):
            continue

        # If there's no active range yet, skip (or could fall back)
        if current_range is None:
            continue

        a, b = current_range
        start_dt, end_dt = _month_offsets_to_datetimes(ind_anchor, a, b)

        name = _clean_task_name(line)

        intervals.append({
            "name": name,
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "type": "interval",
            "y": random.uniform(0.3, 0.6),
            "color": "black",
        })

    if not intervals:
        return None

    # ensure unique names + compute window + x positions
    ensure_unique_names(intervals)

    min_start = min(datetime.fromisoformat(i["start"]) for i in intervals)
    max_end = max(datetime.fromisoformat(i["end"]) for i in intervals)

    def _hours(ref: datetime, dt: datetime) -> float:
        return max(0.0, (dt - ref).total_seconds() / 3600)

    for i in intervals:
        s = datetime.fromisoformat(i["start"])
        e = datetime.fromisoformat(i["end"])
        i["startX"] = _hours(min_start, s)
        i["x"] = _hours(min_start, e)

    return {
        "intervals": intervals,
        "window": {"start": min_start.isoformat(), "end": max_end.isoformat()},
        "lines": lines,
        "mode": "month_offsets_gantt",
        "ind_anchor": ind_anchor.isoformat(),
    }


# ---------------- GPT FALLBACK ----------------

_client_singleton = None
def _get_client():
    global _client_singleton
    if _client_singleton is None and OpenAI is not None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

def _chat_call(line: str, model="gpt-4o-mini", temperature=0.2):
    client = _get_client()
    if client is None:
        return None

    system_prompt = (
        "You are a scheduling assistant. Return STRICT JSON:\n"
        "{\"name\": string, \"start\": \"YYYY-MM-DDTHH:MM:SS\", \"end\": \"YYYY-MM-DDTHH:MM:SS\"}.\n"
    )
    user_prompt = f"now={datetime.now().isoformat()}\nTask line: {line.strip()}"

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


# ---------------- INTERVAL BUILDER (original line parser) ----------------

def build_interval_for_line(line: str, *, model: str, temperature: float):
    name = (line or "Untitled").strip()
    now = datetime.now().replace(second=0, microsecond=0)

    start_dt, end_dt = _local_parse_line(line, now)

    num, unit, _ = _parse_duration(line)
    need_gpt = start_dt is None or (end_dt is None and not (num and unit))

    if need_gpt:
        data = _chat_call(line, model=model, temperature=temperature) or {}
        if data.get("name"):
            name = data["name"].strip() or name
        if start_dt is None:
            try:
                start_dt = datetime.fromisoformat(data.get("start"))
            except Exception:
                start_dt = now
        if end_dt is None:
            try:
                end_dt = datetime.fromisoformat(data.get("end"))
            except Exception:
                end_dt = (start_dt or now) + timedelta(hours=DEFAULT_FALLBACK_HOURS)

    if start_dt is None:
        start_dt = now
    if end_dt is None:
        end_dt = start_dt + timedelta(hours=DEFAULT_FALLBACK_HOURS)

    if end_dt < start_dt:
        start_dt, end_dt = end_dt, start_dt

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
    """
    NEW behavior:
      1) If prompt looks like the written Gantt (Months ... headers), parse by month offsets.
      2) Else fall back to the original per-line hybrid parser.
    """

    # Anchor "Month 0" (IND submission) to now at 09:00 local.
    ind_anchor = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)

    gantt = build_intervals_from_gantt_text(prompt, ind_anchor=ind_anchor)
    if gantt is not None:
        return gantt

    # --- original behavior ---
    lines = [l.strip() for l in (prompt or "").splitlines() if l.strip()]
    if not lines:
        now = datetime.now()
        return {
            "intervals": [],
            "window": {"start": now.isoformat(), "end": now.isoformat()},
            "lines": [],
            "mode": "empty",
        }

    intervals = [
        build_interval_for_line(line, model=model, temperature=temperature)
        for line in lines
    ]

    ensure_unique_names(intervals)

    min_start = min(datetime.fromisoformat(i["start"]) for i in intervals)
    max_end = max(datetime.fromisoformat(i["end"]) for i in intervals)

    def _hours(ref: datetime, dt: datetime) -> float:
        return max(0.0, (dt - ref).total_seconds() / 3600)

    for i in intervals:
        s = datetime.fromisoformat(i["start"])
        e = datetime.fromisoformat(i["end"])
        i["startX"] = _hours(min_start, s)
        i["x"] = _hours(min_start, e)

    return {
        "intervals": intervals,
        "window": {"start": min_start.isoformat(), "end": max_end.isoformat()},
        "lines": lines,
        "mode": "hybrid_line_parse",
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

    works.msg("🧠 parse: month-offset Gantt (if present) else hybrid line-by-line…")
    result = build_intervals(prompt, model=model, temperature=temperature)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    works.msg("🔧 operations scheduler — Gantt month-offset + hybrid extractor")
    _main_ion()
