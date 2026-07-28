#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Operations Scheduler → Milestone Points (dated milestones on a time axis)

What this does
--------------
- Parses user text:
  • If numbered/bulleted lines exist: tries to extract a true date from each line to make a milestone.
  • Otherwise (single paragraph): asks GPT to infer key milestones with true dates.
- Business hours logic is used only for window defaults; x is hours since earliest milestone date.
- Outputs milestones where:
    x = hours since earliest milestone date (true date)
    y ∈ [0, 1] (random; can be styled by caller)
    type = 'milestone'
- Sanitizes user prompt (alphanumeric + whitespace) before GPT calls.
- Optional: second GPT query extracts {name, date, url} references and merges URLs into milestones.
- density param (0..1) to control result granularity (0=sparse, 1=dense).
- start/end date params to constrain milestones to a closed interval [start, end] (inclusive).

Ion params
----------
param(1): prompt (string with lines or a paragraph)
param(2): start date constraint (e.g., "2025-01-01", "Jan 1 2025", "1/1/25")
param(3): end date constraint   (e.g., "2025-12-31", "Dec 31 2025", "12/31/25")
param(4): model (optional; default "gpt-4o-mini")
param(5): temperature (optional; default 0.2)
param(6): density (optional; float in [0,1], default 0.5)
"""

import os
import json
import re
import time
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

# ----- Config -----
WORK_START_HOUR = 9
WORK_END_HOUR = 17  # exclusive

# ----- Ion Works shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ----- OpenAI (for paragraph milestone inference or date window infer if needed) -----
from openai import OpenAI, APITimeoutError
_client_singleton = None
def _get_client() -> OpenAI:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

def _chat_call(*, model: str, system: str, user: str,
               temperature: float = 0.2, json_mode: bool = True,
               max_tokens: int = 900, tries: int = 3, backoff: float = 2.0) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set")
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    client = _get_client()
    last_err = None
    for attempt in range(tries):
        try:
            resp = client.chat.completions.create(**kwargs)
            return (resp.choices[0].message.content or "").strip()
        except APITimeoutError as e:
            last_err = e
            wait = backoff ** attempt
            works.msg(f"⚠️ OpenAI timeout — retrying in {wait:.1f}s (attempt {attempt+1}/{tries})")
            time.sleep(wait)
    raise last_err

# ===== Utility =====
def _sanitize_for_gpt(text: str) -> str:
    # alphanumeric + whitespace (removes punctuation)
    return re.sub(r'[^A-Za-z0-9\s]', '', text or '')

def _sanitize_for_gpt_urls(text: str) -> str:
    # preserve URL punctuation
    if not text:
        return ''
    return re.sub(r"[^\w\s:/\.\-\_\?\=\#\(\)\%\+]", "", text, flags=re.UNICODE)

def _clamp01(x: Any, default: float = 0.5) -> float:
    try:
        v = float(x)
    except Exception:
        return default
    if v < 0: return 0.0
    if v > 1: return 1.0
    return v

# ===== Bullet/number parsing =====
_LEAD_RE = re.compile(r'^\s*(?:\d+\.\s*|[-*]\s*)?')

# ===== Date extraction =====
_MONTHS = {
    "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,"may":5,"jun":6,"june":6,
    "jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,"september":9,"oct":10,"october":10,"nov":11,
    "november":11,"dec":12,"december":12
}

_ISO_DATE_RE     = re.compile(r'\b(\d{4})-(\d{2})-(\d{2})\b')              # 2025-10-09
_US_SLASH_DATE_RE= re.compile(r'\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b')        # 10/9/2025 or 10/9/25
_LONG_DATE_RE    = re.compile(r'\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?\b')  # Oct 9, 2025 or October 9

def _try_parse_date_tokens(year: int, month: int, day: int, *, end_of_day: bool=False) -> Optional[datetime]:
    try:
        hour = 23 if end_of_day else WORK_START_HOUR
        minute = 59 if end_of_day else 0
        second = 59 if end_of_day else 0
        return datetime(year, month, day, hour=hour, minute=minute, second=second, microsecond=0)
    except ValueError:
        return None

def _parse_first_date_in_text(text: str, *, default_year: int = None) -> Optional[datetime]:
    s = text.strip()

    m = _ISO_DATE_RE.search(s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        dt = _try_parse_date_tokens(y, mo, d)
        if dt: return dt

    m = _US_SLASH_DATE_RE.search(s)
    if m:
        mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000 if y <= 49 else 1900
        dt = _try_parse_date_tokens(y, mo, d)
        if dt: return dt

    m = _LONG_DATE_RE.search(s)
    if m:
        mon_name = m.group(1).lower()
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else (default_year or datetime.now().year)
        mo = _MONTHS.get(mon_name[:3] if mon_name not in _MONTHS else mon_name)
        if mo:
            dt = _try_parse_date_tokens(year, mo, day)
            if dt: return dt

    return None

from datetime import datetime
from typing import Any, Optional
import re

# Match a full ISO datetime: 2025-01-30T12:34:56.789Z (timezone optional)
_ISO_DATETIME_RE = re.compile(
    r"(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?"
)

def _parse_date_param(text: Any, *, prefer_end: bool = False) -> Optional[datetime]:
    """
    Parse a start/end date parameter. Accepts ISO dates and full ISO datetimes such as:
      - '2025-02-07'
      - '2025-02-07T12:45:30.123Z'
    If prefer_end=True, returns end-of-day for date-only values.
    """
    if not text:
        return None

    s = str(text).strip()
    if not s:
        return None

    # 1. Full ISO datetime? Extract date part.
    m = _ISO_DATETIME_RE.search(s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _try_parse_date_tokens(y, mo, d, end_of_day=prefer_end)

    # 2. Fallback to plain ISO date (YYYY-MM-DD)
    m = _ISO_DATE_RE.search(s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return _try_parse_date_tokens(y, mo, d, end_of_day=prefer_end)

    return None


def _extract_name(line: str) -> str:
    return _LEAD_RE.sub('', line).strip()

# ===== Paragraph detection =====
_PARAGRAPH_ONLY_PATTERN = re.compile(r'(\n|^\s*[-*]\s*|\d+\.\s*)', re.MULTILINE)
def _is_paragraph_only(text: str) -> bool:
    if not text or not text.strip():
        return False
    if '\n' in text.strip():
        return False
    return not _PARAGRAPH_ONLY_PATTERN.search(text)

# ===== GPT milestone inference =====
def _desired_counts_from_density(density: float) -> Tuple[int, int, int]:
    """
    Returns (milestone_target, ref_target, augment_flag) where:
      - milestone_target ~ number GPT is nudged to produce (±2)
      - ref_target ~ number of URL references to try for (upper bound)
      - augment_flag = 1 if we should augment bullets with GPT (dense), else 0
    """
    milestone_target = max(3, min(20, int(round(5 + density * 15))))
    ref_target = max(3, min(15, int(round(3 + density * 12))))
    augment_flag = 1 if density >= 0.75 else 0
    return milestone_target, ref_target, augment_flag

def _mk_infer_mst_instructions(target: int, start_iso: Optional[str], end_iso: Optional[str]) -> str:
    window_rule = ""
    if start_iso or end_iso:
        window_rule = f"""
- Only include milestones whose dates fall within the closed interval:
  [{start_iso or "-∞"}, {end_iso or "+∞"}] (inclusive)."""

    return rf"""
Return STRICT JSON:
{{"milestones":[{{"name":"<milestone>","date":"YYYY-MM-DDTHH:MM:SS"}}]]}}
Rules:
- Generate about {target} key milestones (±2) with real dates (YYYY-MM-DDTHH:MM:SS).
- Dates must be plausible given the user's text (assume current year if not specified).
- Keep names concise and verb-focused.
- No duplicates; sequence should be chronological where possible.{window_rule}
- Valid JSON only; no commentary.
""".strip()

def _mk_infer_ref_instructions(target: int, start_iso: Optional[str], end_iso: Optional[str]) -> str:
    window_rule = ""
    if start_iso or end_iso:
        window_rule = f"""
- Only include items whose dates fall within [{start_iso or "-∞"}, {end_iso or "+∞"}] (inclusive)."""

    return rf"""
Return STRICT JSON:
{{"references":[{{"name":"<milestone>","date":"YYYY-MM-DDTHH:MM:SS","url":"https://..."}}]]}}
Rules:
- Extract or infer major milestones mentioned or implied by the user text WITH a source URL IF present in the text.
- If no URL is present for an item, omit that item (ONLY return items that have a URL).
- Aim for up to {target} items; keep only the clearest matches.
- Dates must be plausible (assume current year if not specified).
- Keep names concise and verb-focused. No duplicates.{window_rule}
- Valid JSON only; no commentary.
""".strip()

def infer_milestones_via_gpt(prompt: str, *, model: str, temperature: float, density: float,
                             start_dt: Optional[datetime], end_dt: Optional[datetime]) -> List[Dict[str, Any]]:
    target, _, _ = _desired_counts_from_density(density)
    instructions = _mk_infer_mst_instructions(
        target,
        start_dt.isoformat() if start_dt else None,
        end_dt.isoformat() if end_dt else None
    )
    sanitized_prompt = _sanitize_for_gpt(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You extract or infer dated milestones as JSON.",
            user=f"{instructions}\n\nUser prompt:\n{sanitized_prompt}",
            temperature=temperature,
            json_mode=True,
            max_tokens=1200
        )
        data = json.loads(raw)
        out: List[Dict[str, Any]] = []
        for m in (data.get("milestones") or []):
            name = str(m.get("name", "")).strip()
            date_str = str(m.get("date", "")).strip()
            if not name or not date_str:
                continue
            try:
                dt = datetime.fromisoformat(date_str)
            except Exception:
                continue
            out.append({"name": name, "date": dt})
        return out
    except Exception as e:
        works.msg(f"⚠️ GPT milestone inference failed: {e}")
        return []

def infer_references_via_gpt(prompt: str, *, model: str, temperature: float, density: float,
                             start_dt: Optional[datetime], end_dt: Optional[datetime]) -> List[Dict[str, Any]]:
    target = _desired_counts_from_density(density)[1]
    instructions = _mk_infer_ref_instructions(
        target,
        start_dt.isoformat() if start_dt else None,
        end_dt.isoformat() if end_dt else None
    )
    sanitized = _sanitize_for_gpt_urls(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You extract dated references with URLs as JSON.",
            user=f"{instructions}\n\nUser prompt:\n{sanitized}",
            temperature=temperature,
            json_mode=True,
            max_tokens=1200
        )
        data = json.loads(raw)
        out: List[Dict[str, Any]] = []
        for r in (data.get("references") or []):
            name = str(r.get("name", "")).strip()
            date_str = str(r.get("date", "")).strip()
            url = str(r.get("url", "")).strip()
            if not name or not date_str or not url:
                continue
            try:
                dt = datetime.fromisoformat(date_str)
            except Exception:
                continue
            out.append({"name": name, "date": dt, "url": url})
        return out
    except Exception as e:
        works.msg(f"⚠️ GPT reference extraction failed: {e}")
        return []

# ===== Business time helpers =====
def _is_weekend(dt: datetime) -> bool:
    return dt.weekday() >= 5

def _next_business_start(dt: datetime) -> datetime:
    d = dt
    if _is_weekend(d):
        days = (7 - d.weekday()) % 7 or 1
        d = d + timedelta(days=days)
        return d.replace(hour=WORK_START_HOUR, minute=0, second=0, microsecond=0)
    if d.hour >= WORK_END_HOUR:
        d = d + timedelta(days=1)
        while _is_weekend(d):
            d += timedelta(days=1)
        return d.replace(hour=WORK_START_HOUR, minute=0, second=0, microsecond=0)
    if d.hour < WORK_START_HOUR:
        return d.replace(hour=WORK_START_HOUR, minute=0, second=0, microsecond=0)
    return d

# ===== Orchestrator =====
def _hours_from(ref: datetime, dt: datetime) -> float:
    return max(0.0, (dt - ref).total_seconds() / 3600.0)

def parse_milestones_from_lines(prompt: str) -> List[Dict[str, Any]]:
    milestones: List[Dict[str, Any]] = []
    default_year = datetime.now().year
    for raw in (prompt or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        name = _extract_name(line)
        if not name:
            continue
        dt = _parse_first_date_in_text(line, default_year=default_year)
        if dt:
            milestones.append({"name": name, "date": dt})
    return milestones

import colorsys

def _wcag_luminance(rgb):  # rgb in [0,255]
    def _channel(c):
        c = c / 255.0
        return c/12.92 if c <= 0.03928*12.92 else ((c+0.055)/1.055) ** 2.4
    r, g, b = (_channel(rgb[0]), _channel(rgb[1]), _channel(rgb[2]))
    return 0.2126*r + 0.7152*g + 0.0722*b

def _contrast_ratio_with_white(rgb):
    Lc = _wcag_luminance(rgb)
    Lw = 1.0  # luminance(white)
    return (Lw + 0.05) / (Lc + 0.05)

def _rgb_to_hex(rgb):
    return "#{:02X}{:02X}{:02X}".format(*rgb)

def _random_contrasting_color():
    for _ in range(20):
        h = random.random()
        s = random.uniform(0.65, 1.0)
        l = random.uniform(0.18, 0.32)
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        rgb = (int(r*255), int(g*255), int(b*255))
        if _contrast_ratio_with_white(rgb) >= 4.5:
            return _rgb_to_hex(rgb)
    palette = [
        "#1F2937", "#0F766E", "#065F46", "#7C2D12", "#6B21A8",
        "#9D174D", "#1D4ED8", "#B45309", "#14532D", "#7F1D1D"
    ]
    return random.choice(palette)

def _merge_urls_into_milestones(milestones: List[Dict[str, Any]], refs: List[Dict[str, Any]]) -> None:
    ref_map: Dict[Tuple[str, int, int, int], str] = {}
    for r in refs:
        n = r.get("name", "")
        d: datetime = r.get("date")
        u = r.get("url")
        if not n or not isinstance(d, datetime) or not u:
            continue
        key = (n.strip().lower(), d.year, d.month, d.day)
        ref_map.setdefault(key, u)

    for m in milestones:
        n = m.get("name", "")
        d: datetime = m.get("date")
        if not n or not isinstance(d, datetime):
            continue
        key = (n.strip().lower(), d.year, d.month, d.day)
        url = ref_map.get(key)
        if url and not m.get("url"):
            m["url"] = url

def _dedupe_milestones(milestones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for m in milestones:
        name = (m.get("name") or "").strip().lower()
        d = m.get("date")
        if not name or not isinstance(d, datetime):
            continue
        key = (name, d.year, d.month, d.day)
        if key in seen:
            continue
        seen.add(key)
        out.append(m)
    return out

def _filter_by_range(items: List[Dict[str, Any]], start_dt: Optional[datetime], end_dt: Optional[datetime]) -> List[Dict[str, Any]]:
    """Keep only items whose date is within [start_dt, end_dt] (inclusive)."""
    if not (start_dt or end_dt):
        return items
    def in_win(dt: datetime) -> bool:
        if start_dt and dt < start_dt:
            return False
        if end_dt and dt > end_dt:
            return False
        return True
    out = []
    for m in items:
        dt = m.get("date")
        if isinstance(dt, datetime) and in_win(dt):
            out.append(m)
    return out

def build_milestones(prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2,
                     density: float = 0.5, start_dt: Optional[datetime] = None,
                     end_dt: Optional[datetime] = None) -> Dict[str, Any]:
    density = _clamp01(density, 0.5)
    target_count, _, augment_flag = _desired_counts_from_density(density)

    # 1) Try explicit dated bullets/numbers first
    milestones = parse_milestones_from_lines(prompt)

    # NEW: if we already have bullets, immediately filter by date range
    if milestones and (start_dt or end_dt):  # NEW
        milestones = _filter_by_range(milestones, start_dt, end_dt)

    # 1a) Paragraph-only or no dated lines → GPT inference
    if (not milestones) and _is_paragraph_only(prompt):
        if start_dt or end_dt:
            works.msg(f"🧠 inferring milestones from paragraph (constrained to [{start_dt or '-∞'} .. {end_dt or '+∞'}])…")
        else:
            works.msg("🧠 inferring milestones from paragraph…")
        milestones = infer_milestones_via_gpt(
            prompt,
            model=model,
            temperature=temperature,
            density=density,
            start_dt=start_dt,
            end_dt=end_dt
        )

    # 1b) If bullets exist but density is high, augment with extra GPT milestones for granularity
    if milestones and augment_flag:
        works.msg("➕ augmenting milestones for higher density…")
        extra = infer_milestones_via_gpt(
            prompt,
            model=model,
            temperature=temperature,
            density=density,
            start_dt=start_dt,
            end_dt=end_dt
        )
        if extra:
            milestones = _dedupe_milestones(milestones + extra)

    # NEW: ensure that after all augmentation, we still strictly enforce the date window
    if milestones and (start_dt or end_dt):  # NEW
        milestones = _filter_by_range(milestones, start_dt, end_dt)

    # 1c) Optional second query: dated references with URLs, then merge into milestones
    if milestones:  # only bother if we have something to annotate
        works.msg("🔗 attempting to extract dated references with URLs…")
        refs = infer_references_via_gpt(
            prompt,
            model=model,
            temperature=temperature,
            density=density,
            start_dt=start_dt,
            end_dt=end_dt
        )
        if refs:
            _merge_urls_into_milestones(milestones, refs)

    # If nothing survived the filters, return an empty structure
    if not milestones:  # NEW guard
        works.msg("⚠️ no milestones within the specified date range.")
        return {
            "milestones": [],
            "window": {
                "start": start_dt.isoformat() if start_dt else None,
                "end": end_dt.isoformat() if end_dt else None,
            },
        }

    milestones.sort(key=lambda m: m["date"])
    min_dt = milestones[0]["date"]
    max_dt = milestones[-1]["date"]

    out_points: List[Dict[str, Any]] = []
    for m in milestones:
        dt = m["date"]
        tx = _hours_from(min_dt, dt)               # hours from earliest date
        ty = random.uniform(0.35, 0.65)            # mild vertical jitter
        out_points.append({
            "x": tx,
            "y": ty,
            "type": "milestone",
            "name": m["name"],
            "color": _random_contrasting_color(),
            "date": dt.isoformat(),
            "url": m.get("url") or None,
        })

    return {
        "milestones": out_points,
        "window": {"start": min_dt.isoformat(), "end": max_dt.isoformat()}
    }

# ----- Ion entry -----
def _read_param(i: int) -> Any:
    try: return works.param(i)
    except Exception: return None

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    prompt = _read_param(1)
    # date window params (inclusive)
    start_dt = _parse_date_param(_read_param(2), prefer_end=False)
    end_dt   = _parse_date_param(_read_param(3), prefer_end=True)

    # If both provided but reversed, swap (and note)
    if start_dt and end_dt and start_dt > end_dt:
        works.msg(f"↔️ start/end provided out of order; swapping to [{end_dt} .. {start_dt}]")
        start_dt, end_dt = end_dt, start_dt

    model = (_read_param(4) or default_model)
    try:
        temperature = float(_read_param(5) or 0.2)
    except Exception:
        temperature = 0.2
    density = _clamp01(_read_param(6), 0.5)

    if not prompt:
        raise RuntimeError("param(1) required: prompt")

    if start_dt or end_dt:
        works.msg(f"📅 constraining milestones to [{start_dt or '-∞'} .. {end_dt or '+∞'}] (inclusive)")
    works.msg("📍 building milestone points from dated text or inferred milestones…")

    result = build_milestones(
        str(prompt),
        model=str(model),
        temperature=temperature,
        density=density,
        start_dt=start_dt,
        end_dt=end_dt
    )
    works.resolve(result)
    return 0


if __name__ == "__main__":
    works.msg("🔧 operations scheduler (milestones + optional refs + density + date window)")
    _main_ion()
