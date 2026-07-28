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
- NEW: user prompt can also shape how demographic milestones are sampled, e.g.:
    "plot life expectancy for every ten years"
    "show me life expectancy around major natural disasters"

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
from typing import Any, Dict, List, Optional, Tuple, TypedDict
import colorsys

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


# ===== DEMOGRAPHIC DATA BLOCK (Life Expectancy only, 1790–2023) =====

class DemographicRecord(TypedDict):
    year: int
    life_expectancy: float


LIFE_EXPECTANCY = [
    [1790, 35],
    [1791, 35.083333333333336],
    [1792, 35.166666666666664],
    [1793, 35.25],
    [1794, 35.333333333333336],
    [1795, 35.416666666666664],
    [1796, 35.5],
    [1797, 35.583333333333336],
    [1798, 35.666666666666664],
    [1799, 35.75],
    [1800, 35.833333333333336],
    [1801, 35.916666666666664],
    [1802, 36],
    [1803, 36.083333333333336],
    [1804, 36.166666666666664],
    [1805, 36.25],
    [1806, 36.333333333333336],
    [1807, 36.416666666666664],
    [1808, 36.5],
    [1809, 36.583333333333336],
    [1810, 36.666666666666664],
    [1811, 36.75],
    [1812, 36.833333333333336],
    [1813, 36.916666666666664],
    [1814, 37],
    [1815, 37.083333333333336],
    [1816, 37.166666666666664],
    [1817, 37.25],
    [1818, 37.333333333333336],
    [1819, 37.416666666666664],
    [1820, 37.5],
    [1821, 37.583333333333336],
    [1822, 37.666666666666664],
    [1823, 37.75],
    [1824, 37.833333333333336],
    [1825, 37.916666666666664],
    [1826, 38],
    [1827, 38.083333333333336],
    [1828, 38.166666666666664],
    [1829, 38.25],
    [1830, 38.333333333333336],
    [1831, 38.416666666666664],
    [1832, 38.5],
    [1833, 38.583333333333336],
    [1834, 38.666666666666664],
    [1835, 38.75],
    [1836, 38.833333333333336],
    [1837, 38.916666666666664],
    [1838, 39],
    [1839, 39.083333333333336],
    [1840, 39.166666666666664],
    [1841, 39.25],
    [1842, 39.333333333333336],
    [1843, 39.416666666666664],
    [1844, 39.5],
    [1845, 39.583333333333336],
    [1846, 39.666666666666664],
    [1847, 39.75],
    [1848, 39.833333333333336],
    [1849, 39.916666666666664],
    [1850, 40],
    [1851, 40.2],
    [1852, 40.4],
    [1853, 40.6],
    [1854, 40.8],
    [1855, 41],
    [1856, 41.2],
    [1857, 41.4],
    [1858, 41.6],
    [1859, 41.8],
    [1860, 42],
    [1861, 42.2],
    [1862, 42.4],
    [1863, 42.6],
    [1864, 42.8],
    [1865, 43],
    [1866, 43.2],
    [1867, 43.4],
    [1868, 43.6],
    [1869, 43.8],
    [1870, 44],
    [1871, 44.2],
    [1872, 44.4],
    [1873, 44.6],
    [1874, 44.8],
    [1875, 45],
    [1876, 45.2],
    [1877, 45.4],
    [1878, 45.6],
    [1879, 45.8],
    [1880, 46],
    [1881, 46.2],
    [1882, 46.4],
    [1883, 46.6],
    [1884, 46.8],
    [1885, 47],
    [1886, 47.2],
    [1887, 47.4],
    [1888, 47.6],
    [1889, 47.8],
    [1890, 48],
    [1891, 48.2],
    [1892, 48.4],
    [1893, 48.6],
    [1894, 48.8],
    [1895, 49],
    [1896, 49.2],
    [1897, 49.4],
    [1898, 49.6],
    [1899, 49.8],
    [1900, 50],
    [1901, 50.2],
    [1902, 50.4],
    [1903, 50.6],
    [1904, 50.8],
    [1905, 51],
    [1906, 51.2],
    [1907, 51.4],
    [1908, 51.6],
    [1909, 51.8],
    [1910, 52],
    [1911, 52.2],
    [1912, 52.4],
    [1913, 52.6],
    [1914, 52.8],
    [1915, 53],
    [1916, 53.2],
    [1917, 53.4],
    [1918, 53.6],
    [1919, 53.8],
    [1920, 54],
    [1921, 54.2],
    [1922, 54.4],
    [1923, 54.6],
    [1924, 54.8],
    [1925, 55],
    [1926, 55.2],
    [1927, 55.4],
    [1928, 55.6],
    [1929, 55.8],
    [1930, 56],
    [1931, 56.2],
    [1932, 56.4],
    [1933, 56.6],
    [1934, 56.8],
    [1935, 57],
    [1936, 57.2],
    [1937, 57.4],
    [1938, 57.6],
    [1939, 57.8],
    [1940, 58],
    [1941, 58.2],
    [1942, 58.4],
    [1943, 58.6],
    [1944, 58.8],
    [1945, 59],
    [1946, 59.2],
    [1947, 59.4],
    [1948, 59.6],
    [1949, 59.8],
    [1950, 60],
    [1951, 60.16],
    [1952, 60.32],
    [1953, 60.48],
    [1954, 60.64],
    [1955, 60.8],
    [1956, 60.96],
    [1957, 61.12],
    [1958, 61.28],
    [1959, 61.44],
    [1960, 61.6],
    [1961, 61.76],
    [1962, 61.92],
    [1963, 62.08],
    [1964, 62.24],
    [1965, 62.4],
    [1966, 62.56],
    [1967, 62.72],
    [1968, 62.88],
    [1969, 63.04],
    [1970, 63.2],
    [1971, 63.36],
    [1972, 63.52],
    [1973, 63.68],
    [1974, 63.84],
    [1975, 64],
    [1976, 64.16],
    [1977, 64.32],
    [1978, 64.48],
    [1979, 64.64],
    [1980, 64.8],
    [1981, 64.96],
    [1982, 65.12],
    [1983, 65.28],
    [1984, 65.44],
    [1985, 65.6],
    [1986, 65.76],
    [1987, 65.92],
    [1988, 66.08],
    [1989, 66.24],
    [1990, 66.4],
    [1991, 66.56],
    [1992, 66.72],
    [1993, 66.88],
    [1994, 67.04],
    [1995, 67.2],
    [1996, 67.36],
    [1997, 67.52],
    [1998, 67.68],
    [1999, 67.84],
    [2000, 76.8],
    [2001, 76.9],
    [2002, 77],
    [2003, 77.1],
    [2004, 77.4],
    [2005, 77.7],
    [2006, 77.9],
    [2007, 78.1],
    [2008, 78.2],
    [2009, 78.5],
    [2010, 78.7],
    [2011, 78.7],
    [2012, 78.8],
    [2013, 78.8],
    [2014, 78.9],
    [2015, 78.8],
    [2016, 78.7],
    [2017, 78.6],
    [2018, 78.7],
    [2019, 78.8],
    [2020, 77],
    [2021, 76.4],
    [2022, 78.4],
    [2023, 78.4],
]

DEMOGRAPHIC_DATA: List[DemographicRecord] = [
    {"year": year, "life_expectancy": value}
    for (year, value) in LIFE_EXPECTANCY
]

DEMOGRAPHIC_BY_YEAR: Dict[int, DemographicRecord] = {
    rec["year"]: rec for rec in DEMOGRAPHIC_DATA
}


def get_demographic_record(year: int) -> Optional[DemographicRecord]:
    """Return demographic record for a given year, or None if not present."""
    return DEMOGRAPHIC_BY_YEAR.get(year)


# Fixed color for the life expectancy series
LIFE_EXPECTANCY_COLOR = "#1D4ED8"   # blue-ish


def _demographic_year_to_dt(year: int) -> datetime:
    """
    Represent a demographic data point as a real datetime so it can live on
    the same time axis as other milestones. We use Jan 1 of that year at
    WORK_START_HOUR.
    """
    return datetime(year, 1, 1, WORK_START_HOUR, 0, 0, 0)


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


def _infer_primary_series_from_prompt(prompt: str) -> str:
    """
    We only have one demographic series (life_expectancy), so always return that.
    """
    return "life_expectancy"


def _analyze_prompt_for_demographic_structure(
    prompt: str,
    *,
    model: str,
    temperature: float
) -> Dict[str, Any]:
    """
    Look at the user prompt to decide how to sample demographic data.

    Returns a dict with possible keys:
      - "interval_years": Optional[int]  (e.g., 10 → every 10 years)
      - "focus_years": Optional[List[int]] (specific years of interest)
      - "window_years": int  (include +/- window_years around each focus_year)

    Examples:
      "plot life expectancy for every ten years"
        → {"interval_years": 10, "focus_years": [], "window_years": 0}

      "show me life expectancy around major natural disasters"
        → {"focus_years": [1906, 2005, ...], "window_years": 2}
    """
    s = (prompt or "").lower()
    sampling: Dict[str, Any] = {
        "interval_years": None,
        "focus_years": [],
        "window_years": 0,
    }

    # 1) Explicit "every N years" pattern
    m = re.search(r"every\s+(\d+)\s+years?", s)
    if m:
        try:
            interval = int(m.group(1))
            if interval > 0:
                sampling["interval_years"] = interval
                return sampling
        except Exception:
            pass

    # 2) Decade patterns: "every decade", "per decade", "by decade"
    if ("every decade" in s) or ("per decade" in s) or ("by decade" in s):
        sampling["interval_years"] = 10
        return sampling

    # 3) If user mentions certain event-like language, ask GPT for focus years
    if any(kw in s for kw in [
        "natural disaster", "natural disasters",
        "pandemic", "pandemics",
        "war", "wars",
        "recession", "depression",
        "crisis", "catastrophe"
    ]):
        min_year = DEMOGRAPHIC_DATA[0]["year"]
        max_year = DEMOGRAPHIC_DATA[-1]["year"]
        instructions = f"""
Return STRICT JSON only, of the form:
{{"focus_years":[YYYY, ...], "window_years": N}}

Rules:
- focus_years: list of calendar years (integers) for major historical events
  relevant to the user's request.
- Only use years between {min_year} and {max_year} inclusive.
- window_years: small integer (0–5) indicating how many years on each side of
  each focus_year should be included. 0 means only that exact year.
- No duplicates in focus_years.
- Do not include any commentary, just JSON.
""".strip()

        try:
            raw = _chat_call(
                model=model,
                system="You choose relevant historical years as JSON.",
                user=f"{instructions}\n\nUser prompt:\n{prompt}",
                temperature=0.0,
                json_mode=True,
                max_tokens=400,
            )
            data = json.loads(raw)
            fy_raw = data.get("focus_years") or []
            wy_raw = data.get("window_years") or 0

            focus_years: List[int] = []
            for y in fy_raw:
                try:
                    yy = int(y)
                    if min_year <= yy <= max_year:
                        focus_years.append(yy)
                except Exception:
                    continue

            window_years = 0
            try:
                window_years = int(wy_raw)
            except Exception:
                window_years = 0
            window_years = max(0, min(10, window_years))

            sampling["focus_years"] = sorted(set(focus_years))
            sampling["window_years"] = window_years
        except Exception as e:
            works.msg(f"⚠️ prompt-structure analysis failed: {e}")

        return sampling

    # Default: no special sampling instructions → include all years in range
    return sampling


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

# Match a full ISO datetime: 2025-01-30T12:34:56.789Z (timezone optional)
_ISO_DATETIME_RE = re.compile(
    r"(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?"
)

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


def _build_demographic_milestones(
    start_dt: Optional[datetime],
    end_dt: Optional[datetime],
    sampling: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Turn the LIFE_EXPECTANCY table into 'milestone-like' items:
    - one milestone per (year, life_expectancy) after applying:
        * date window [start_dt, end_dt]
        * optional interval sampling (interval_years)
        * optional focus_years ± window_years
    - name is the numeric value as a string
    - series = 'life_expectancy'
    - no x/y yet; that gets filled in by build_milestones().
    """
    out: List[Dict[str, Any]] = []

    interval_years: Optional[int] = sampling.get("interval_years") or None
    focus_years: List[int] = sampling.get("focus_years") or []
    window_years: int = int(sampling.get("window_years") or 0)

    def in_date_range(dt: datetime) -> bool:
        if start_dt and dt < start_dt:
            return False
        if end_dt and dt > end_dt:
            return False
        return True

    # Compute base year for interval sampling (first year in global + within date window)
    all_years = [rec["year"] for rec in DEMOGRAPHIC_DATA]
    min_year_global = min(all_years)
    max_year_global = max(all_years)

    min_year_win = min_year_global
    max_year_win = max_year_global
    if start_dt:
        min_year_win = max(min_year_win, start_dt.year)
    if end_dt:
        max_year_win = min(max_year_win, end_dt.year)

    base_year_for_interval = min_year_win

    for rec in DEMOGRAPHIC_DATA:
        year = rec["year"]
        dt = _demographic_year_to_dt(year)
        if not in_date_range(dt):
            continue

        # If we have focus_years, keep only those years near focus_years
        if focus_years:
            matched = False
            for fy in focus_years:
                if abs(year - fy) <= window_years:
                    matched = True
                    break
            if not matched:
                continue

        # If we have interval_years (and no focus_years), keep only every N years
        if interval_years and not focus_years:
            if interval_years > 0:
                if (year - base_year_for_interval) % interval_years != 0:
                    continue

        out.append({
            "name": f"{rec['life_expectancy']:.2f}",
            "date": dt,
            "series": "life_expectancy",
            "value": rec["life_expectancy"],
            "year": year,
        })

    return out


def build_milestones(prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2,
                     density: float = 0.5, start_dt: Optional[datetime] = None,
                     end_dt: Optional[datetime] = None) -> Dict[str, Any]:
    density = _clamp01(density, 0.5)
    target_count, _, augment_flag = _desired_counts_from_density(density)

    # Infer which demographic series is primary for this prompt
    primary_series = _infer_primary_series_from_prompt(prompt)

    # NEW: analyze prompt for demographic sampling rules
    sampling = _analyze_prompt_for_demographic_structure(
        prompt,
        model=model,
        temperature=temperature,
    )

    # 1) Prompt-based milestones (user data)
    user_milestones = parse_milestones_from_lines(prompt)

    # Filter by date range if we already have bullets
    if user_milestones and (start_dt or end_dt):
        user_milestones = _filter_by_range(user_milestones, start_dt, end_dt)

    # Paragraph-only or no dated lines -> GPT inference
    if (not user_milestones) and _is_paragraph_only(prompt):
        if start_dt or end_dt:
            works.msg(f"🧠 inferring milestones from paragraph (constrained to [{start_dt or '-∞'} .. {end_dt or '+∞'}])…")
        else:
            works.msg("🧠 inferring milestones from paragraph…")
        user_milestones = infer_milestones_via_gpt(
            prompt,
            model=model,
            temperature=temperature,
            density=density,
            start_dt=start_dt,
            end_dt=end_dt
        )

    # If bullets exist but density is high, augment with GPT
    if user_milestones and augment_flag:
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
            user_milestones = _dedupe_milestones(user_milestones + extra)

    # Enforce date window again after augmentation
    if user_milestones and (start_dt or end_dt):
        user_milestones = _filter_by_range(user_milestones, start_dt, end_dt)

    # Optional second GPT query: URLs merged into user milestones
    if user_milestones:
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
            _merge_urls_into_milestones(user_milestones, refs)

    # 2) Demographic milestones (life expectancy only), shaped by sampling
    demo_milestones = _build_demographic_milestones(start_dt, end_dt, sampling)

    # If absolutely nothing
    if not user_milestones and not demo_milestones:
        works.msg("⚠️ no milestones within the specified date range.")
        return {
            "milestones": [],
            "window": {
                "start": start_dt.isoformat() if start_dt else None,
                "end": end_dt.isoformat() if end_dt else None,
            },
            "sources": {
                "user_milestones": 0,
                "demographic_milestones": 0,
            },
            "sampling": sampling,
        }

    all_milestones: List[Dict[str, Any]] = []

    # Mark user milestones with the inferred primary series
    for m in user_milestones:
        m = dict(m)  # shallow copy

        if primary_series == "life_expectancy":
            m["series"] = "life_expectancy"
        else:
            m.setdefault("series", "user")

        all_milestones.append(m)

    # Add demographic milestones
    all_milestones.extend(demo_milestones)

    # Sort by date across both sources
    all_milestones.sort(key=lambda m: m["date"])

    min_dt = all_milestones[0]["date"]
    max_dt = all_milestones[-1]["date"]

    out_points: List[Dict[str, Any]] = []
    for m in all_milestones:
        dt = m["date"]
        tx = _hours_from(min_dt, dt)

        series = m.get("series", "user")

        # Different vertical bands/colors per series
        if series == "life_expectancy":
            ty = random.uniform(0.70, 0.90)
            color = LIFE_EXPECTANCY_COLOR
        else:  # "user" with no attached demographic series
            ty = random.uniform(0.35, 0.65)
            color = m.get("color") or _random_contrasting_color()

        # Figure out the numeric value for this point, if any
        year = m.get("year")
        value = m.get("value")

        # For user milestones attached to a demographic series, look up the right column
        if year is None:
            year = dt.year

        if value is None and series == "life_expectancy":
            rec = DEMOGRAPHIC_BY_YEAR.get(year)
            if rec:
                value = rec["life_expectancy"]

        out_points.append({
            "x": tx,
            "y": ty,
            "type": "milestone",
            "name": str(m.get("name", "")),  # numeric strings for demographic; text for user
            "color": color,
            "date": dt.isoformat(),
            "url": m.get("url") or None,
            "series": series,
            "meta": {
                "year": year,
                "value": value,
            },
        })

    return {
        "milestones": out_points,
        "window": {"start": min_dt.isoformat(), "end": max_dt.isoformat()},
        "sources": {
            "user_milestones": len(user_milestones),
            "demographic_milestones": len(demo_milestones),
        },
        "sampling": sampling,
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
    works.msg("📍 building milestone points from dated text + life expectancy data (prompt-shaped)…")

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
    works.msg("🔧 operations scheduler (milestones + refs + density + date window + life expectancy, prompt-shaped)")
    _main_ion()
