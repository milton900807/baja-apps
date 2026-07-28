#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Operations Scheduler → Milestone Points (dated milestones on a time axis)

Adds URL references:
- If a line contains a URL (raw or markdown), attach it to that milestone.
- In paragraph (GPT) mode, request optional "url" for each milestone.

Ion params
----------
param(1): prompt (string with lines or a paragraph)
param(2): model (optional; default "gpt-4o-mini")
param(3): temperature (optional; default 0.2)
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

# ===== Utility: sanitize before GPT (preserve URL punctuation) =====
# Keeps alphanumerics, whitespace, and URL-useful punctuation.
def _sanitize_for_gpt(text: str) -> str:
    if not text:
        return ''
    # collapse weird control chars, keep URL punctuation
    return re.sub(r"[^\w\s:/\.\-\_\?\=\#\(\)\%\+]", "", text, flags=re.UNICODE)

# ===== Bullet/number parsing =====
_LEAD_RE = re.compile(r'^\s*(?:\d+\.\s*|[-*]\s*)?')

# ===== URL extraction =====
#  - Markdown [label](url)
_MD_LINK_RE = re.compile(r'\[[^\]]+\]\((https?://[^\s)]+)\)')
#  - Raw http(s)://...
_RAW_URL_RE = re.compile(r'(?:(?:https?://)|(?:www\.))[\w\-\.~:/?#\[\]@!$&\'()*+,;=%]+', re.IGNORECASE)

def _extract_first_url(text: str) -> Optional[str]:
    if not text:
        return None
    m = _MD_LINK_RE.search(text)
    if m:
        return m.group(1)
    m = _RAW_URL_RE.search(text)
    if m:
        url = m.group(0)
        # normalize www. to https:// if scheme missing
        if url.lower().startswith('www.'):
            url = 'https://' + url
        return url
    return None

# ===== Date extraction =====
_MONTHS = {
    "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,"may":5,"jun":6,"june":6,
    "jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,"september":9,"oct":10,"october":10,"nov":11,
    "november":11,"dec":12,"december":12
}
_ISO_DATE_RE      = re.compile(r'\b(\d{4})-(\d{2})-(\d{2})\b')              # 2025-10-09
_US_SLASH_DATE_RE = re.compile(r'\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b')        # 10/9/2025 or 10/9/25
_LONG_DATE_RE     = re.compile(r'\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?\b')  # Oct 9, 2025 / October 9

def _try_parse_date_tokens(year: int, month: int, day: int) -> Optional[datetime]:
    try:
        return datetime(year, month, day, hour=WORK_START_HOUR, minute=0, second=0, microsecond=0)
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
        if y < 100:  # naive pivot
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

# ===== GPT milestone inference (paragraph mode or fallback) =====
INFER_MST_JSON_INSTRUCTIONS = r"""
Return STRICT JSON:
{"milestones":[{"name":"<milestone>","date":"YYYY-MM-DDTHH:MM:SS","url":"<optional url or empty>"}]}
Rules:
- Generate 3–10 key milestones with real dates (YYYY-MM-DDTHH:MM:SS).
- If the user text includes relevant links, include them in "url"; otherwise use "".
- Dates must be plausible given the user's text (assume current year if not specified).
- Keep names concise and verb-focused.
- Valid JSON only; no commentary.
"""

def infer_milestones_via_gpt(prompt: str, *, model: str, temperature: float) -> List[Dict[str, Any]]:
    sanitized_prompt = _sanitize_for_gpt(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You extract or infer dated milestones with optional URLs as JSON.",
            user=f"{INFER_MST_JSON_INSTRUCTIONS}\n\nUser prompt:\n{sanitized_prompt}",
            temperature=temperature,
            json_mode=True,
            max_tokens=800
        )
        data = json.loads(raw)
        out: List[Dict[str, Any]] = []
        for m in (data.get("milestones") or []):
            name = str(m.get("name", "")).strip()
            date_str = str(m.get("date", "")).strip()
            url = str(m.get("url", "") or "").strip() or None
            if not name or not date_str:
                continue
            try:
                dt = datetime.fromisoformat(date_str)
            except Exception:
                continue
            out.append({"name": name, "date": dt, "url": url})
        return out
    except Exception as e:
        works.msg(f"⚠️ GPT milestone inference failed: {e}")
        return []

# ===== Orchestrator bits =====
def _hours_from(ref: datetime, dt: datetime) -> float:
    return max(0.0, (dt - ref).total_seconds() / 3600.0)

def parse_milestones_from_lines(prompt: str) -> List[Dict[str, Any]]:
    """
    For each numbered/bulleted non-empty line, try to extract a date and build a milestone.
    Also capture the first URL on the line (raw or markdown) if present.
    """
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
            url = _extract_first_url(line)
            milestones.append({"name": name, "date": dt, "url": url})
    return milestones

# ----- Random high-contrast color -----
import colorsys
def _wcag_luminance(rgb):  # rgb in [0,255]
    def _channel(c):
        c = c / 255.0
        return c/12.92 if c <= 0.03928*12.92 else ((c+0.055)/1.055) ** 2.4
    r, g, b = (_channel(rgb[0]), _channel(rgb[1]), _channel(rgb[2]))
    return 0.2126*r + 0.7152*g + 0.0722*b
def _contrast_ratio_with_white(rgb):
    Lc = _wcag_luminance(rgb)
    return (1.0 + 0.05) / (Lc + 0.05)
def _rgb_to_hex(rgb):
    return "#{:02X}{:02X}{:02X}".format(*rgb)
def _random_contrasting_color():
    for _ in range(20):
        h = random.random()
        s = random.uniform(0.65, 1.0)
        l = random.uniform(0.18, 0.32)
        r, g, b = colorsys.hls_to_rgb(h, l, s)  # colorsys uses HLS
        rgb = (int(r*255), int(g*255), int(b*255))
        if _contrast_ratio_with_white(rgb) >= 4.5:
            return _rgb_to_hex(rgb)
    palette = ["#1F2937","#0F766E","#065F46","#7C2D12","#6B21A8","#9D174D","#1D4ED8","#B45309","#14532D","#7F1D1D"]
    return random.choice(palette)

def build_milestones(prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2) -> Dict[str, Any]]:
    # 1) Parse bullets/numbers first
    milestones = parse_milestones_from_lines(prompt)

    # 1b) Paragraph-only or no dated lines → GPT inference
    if (not milestones) and _is_paragraph_only(prompt):
        works.msg("🧠 inferring milestones from paragraph…")
        milestones = infer_milestones_via_gpt(prompt, model=model, temperature=temperature)

    if not milestones:
        # Nothing to place; return an empty set with a small default window
        s = datetime.now().replace(minute=0, second=0, microsecond=0)
        e = s + timedelta(hours=8)
        return {"milestones": [], "window": {"start": s.isoformat(), "end": e.isoformat()}}

    # 2) Normalize & compute axis coordinates
    milestones.sort(key=lambda m: m["date"])
    min_dt = milestones[0]["date"]
    max_dt = milestones[-1]["date"]

    out_points: List[Dict[str, Any]] = []
    for m in milestones:
        dt = m["date"]
        tx = _hours_from(min_dt, dt)               # hours since earliest
        ty = random.uniform(0.35, 0.65)
        out_points.append({
            "x": tx,
            "y": ty,
            "type": "milestone",
            "name": m["name"],
            "color": _random_contrasting_color(),
            "date": dt.isoformat(),
            "url": m.get("url") or None,          # <-- include URL if found
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
    model = _read_param(2) or default_model
    temperature = float(_read_param(3) or 0.2)
    if not prompt:
        raise RuntimeError("param(1) required: prompt")

    works.msg("📍 building milestone points (with URLs when available)…")
    result = build_milestones(str(prompt), model=str(model), temperature=temperature)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    works.msg("🔧 operations scheduler (milestones + urls)")
    _main_ion()
