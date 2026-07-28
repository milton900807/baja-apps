#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Legal/Court Timeline Builder (with Prompt Expansion) → Milestone Points
Bankruptcy-focused enhancements:
- Detect bankruptcy events (Ch. 7/11/13/Subchapter V; petition, conversion, plan, confirmation, dismissal, 341 mtg)
- Extract debtor/company/person and chapter
- Prefix milestone 'name' with debtor (e.g., "Acme Corp — Voluntary Chapter 11 Petition Filed")
— FIXED (prev): Always infer via GPT when no dated lines are found; fallback to original prompt
— Added: Helpful logging of counts and paths taken
— NEW: For each milestone point, perform a first-pass web search to identify debtor; drop points with unknown debtor
"""

import os
import json
import re
import time
import random
import requests
from urllib.parse import urlencode
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

# ----- OpenAI (for expansion/inference/refs) -----
from openai import OpenAI, APITimeoutError
_client_singleton = None
def _get_client() -> OpenAI:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

def _chat_call(*, model: str, system: str, user: str,
               temperature: float = 0.2, json_mode: bool = True,
               max_tokens: int = 1500, tries: int = 3, backoff: float = 2.0) -> str:
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
    if not text:
        return ""
    # allow legal punctuation (v., §, FRCP/L.R.), URLs, quotes
    return re.sub(r"[^\w\s:/\.\-\_\?\=\#\(\)\%\+\,&;‘’'“”\"§\[\]]", "", text, flags=re.UNICODE)

def _sanitize_for_gpt_urls(text: str) -> str:
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
_ISO_DATE_RE      = re.compile(r'\b(\d{4})-(\d{2})-(\d{2})\b')
_US_SLASH_DATE_RE = re.compile(r'\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b')
_LONG_DATE_RE     = re.compile(r'\b([A-Za-z]{3,9}\.?)\s+(\d{1,2})(?:,\s*(\d{4}))?\b')

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
        if y < 100:
            y += 2000 if y <= 49 else 1900
        dt = _try_parse_date_tokens(y, mo, d)
        if dt: return dt

    m = _LONG_DATE_RE.search(s)
    if m:
        mon_name = m.group(1).lower().rstrip(".")
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else (default_year or datetime.now().year)
        mo = _MONTHS.get(mon_name[:3] if mon_name not in _MONTHS else mon_name)
        if mo:
            dt = _try_parse_date_tokens(year, mo, day)
            if dt: return dt

    return None

def _extract_name(line: str) -> str:
    return _LEAD_RE.sub('', line).strip()

# ===== LEGAL metadata extraction =====
_CASE_NO_RE = re.compile(r'(?:Case\s*(?:No\.?|Number)\s*[:#]?\s*|No\.\s*)([A-Za-z0-9:\-\.]+)', re.I)
_DOCKET_RE  = re.compile(r'(?:ECF\s*No\.?|Dkt\.?|Docket\s*No\.?)\s*[:#]?\s*([A-Za-z0-9\-]+)', re.I)
_COURT_RE   = re.compile(r'\b(US|U\.S\.|United States)\s+(?:District|Appeals|Bankruptcy)\s+Court(?:\s+for\s+the\s+([A-Za-z\-\s]+))?', re.I)
_JUDGE_RE   = re.compile(r'\b(?:Hon\.?|Judge)\s+([A-Z][A-Za-z\.\-\s]+)', re.I)
_RULE_RE    = re.compile(r'\b(?:Fed\.?\s*R\.?\s*Civ\.?\s*P\.?|FRCP|Fed\.?\s*R\.?\s*App\.?\s*P\.?|FRAP|Local\s*Rule|L\.?R\.?|Cal\.? R\.? Ct\.?)\s*[\w\.\-()]*', re.I)
_HEARING_RE = re.compile(r'\b(hearing|oral argument|status conference|case management conference|CMC|trial|evidentiary hearing|settlement conference)\b', re.I)
_LOCATION_RE= re.compile(r'\b(?:Dept\.?|Courtroom|Room)\s*[A-Za-z0-9\-]+|\b[A-Z]{2,} Courthouse\b', re.I)
_PARTY_RE   = re.compile(r'\b(?:Plaintiff|Defendant|Appellant|Appellee|Petitioner|Respondent)\b[:\s\-]*([A-Z][A-Za-z0-9\.\-\s&]+)', re.I)

# ----- Bankruptcy-specific patterns -----
# Debtor/entity
_IN_RE_RE         = re.compile(r'\bIn\s+re[:\s]+([A-Z][A-Za-z0-9\.\-&,\s]+)', re.I)
_DEBTOR_FIELD_RE  = re.compile(r'\bDebtor(?:s)?[:\s]+([A-Z][A-Za-z0-9\.\-&,\s]+)', re.I)
_FILES_FOR_BK_RE  = re.compile(r'\b(file(?:d)?\s+for\s+bankruptcy|bankruptcy\s+petition|voluntary\s+petition|involuntary\s+petition)\b', re.I)

# Chapters (include Subchapter V)
_CHAPTER_RE       = re.compile(r'\b(?:chapter|ch\.?)\s*(7|11|13)\b', re.I)
_SUBCHAP_V_RE     = re.compile(r'\bsubchapter\s*V\b', re.I)

# Other BK lifecycle keywords
_BK_KEYWORDS = [
    r'first[-\s]?day\s+motion',
    r'disclosure\s+statement',
    r'plan\s+of\s+reorganization',
    r'plan\s+confirmation',
    r'confirmation\s+hearing',
    r'conversion\s+to\s+chapter\s*(7|11|13)',
    r'dismissal\s+of\s+case',
    r'\b341\s+(meeting|mtg)\b',
    r'use\s+of\s+cash\s+collateral',
    r'debtor[-\s]?in[-\s]?possession',
    r'\bDIP\s+financing\b',
]
_BK_KEYWORD_RE = re.compile('|'.join(_BK_KEYWORDS), re.I)

def _extract_bankruptcy_meta(text: str) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    debtor = None
    for rx in (_DEBTOR_FIELD_RE, _IN_RE_RE):
        m = rx.search(text)
        if m:
            debtor = m.group(1).strip(' ,.-')
            break
    chapter = None
    m = _CHAPTER_RE.search(text)
    if m:
        chapter = m.group(1)
    if _SUBCHAP_V_RE.search(text):
        chapter = "11 (Subchapter V)" if (chapter == "11" or chapter is None) else f"{chapter} (Subchapter V)"
    # Is it bankruptcy?
    is_bk = bool(_FILES_FOR_BK_RE.search(text) or _BK_KEYWORD_RE.search(text))
    meta["debtor"] = debtor
    meta["chapter"] = chapter
    meta["is_bankruptcy"] = is_bk
    return meta

# Known legal kinds by keyword (+ bankruptcy)
_KIND_KEYWORDS = [
    ("bankruptcy", r'(bankruptcy|voluntary\s+petition|involuntary\s+petition|disclosure\s+statement|plan\s+confirmation|341\s+meeting|DIP\s+financing|cash\s+collateral|conversion\s+to\s+chapter|dismissal\s+of\s+case)'),
    ("filing",   r'\b(file|filed|filing|submit|lodged)\b'),
    ("order",    r'\b(order|ordered|signed order)\b'),
    ("deadline", r'\b(deadline|due|must\s+serve|shall\s+file|no later than|within\s+\d+\s+day)\b'),
    ("hearing",  r'\b(hearing|oral argument|status conference|CMC|case management conference|evidentiary hearing|settlement conference)\b'),
    ("trial",    r'\b(trial|bench trial|jury trial)\b'),
    ("conference", r'\b(conference|meet and confer|Rule 26\(f\)|mediation)\b'),
]
_KIND_COMPILED = [(k, re.compile(p, re.I)) for k, p in _KIND_KEYWORDS]

def _guess_kind(text: str) -> str:
    for k, rx in _KIND_COMPILED:
        if rx.search(text):
            return k
    return "other"

def _extract_legal_metadata(line: str) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    m = _CASE_NO_RE.search(line);      meta["case_number"]   = m.group(1).strip() if m else None
    m = _DOCKET_RE.search(line);       meta["docket_number"] = m.group(1).strip() if m else None
    m = _COURT_RE.search(line);        meta["court"]         = (m.group(0).strip()) if m else None
    m = _JUDGE_RE.search(line);        meta["judge"]         = m.group(1).strip() if m else None
    m = _RULE_RE.search(line);         meta["rule"]          = m.group(0).strip() if m else None
    m = _HEARING_RE.search(line);      meta["hearing_type"]  = m.group(1).strip().lower() if m else None
    m = _LOCATION_RE.search(line);     meta["location"]      = m.group(0).strip() if m else None
    m = _PARTY_RE.search(line);        meta["party"]         = m.group(1).strip() if m else None
    # Bankruptcy enrich
    bk = _extract_bankruptcy_meta(line)
    meta.update(bk)
    meta["kind"] = "bankruptcy" if bk.get("is_bankruptcy") else _guess_kind(line)
    return meta

# ----- Name augmentation: prepend debtor/entity to name -----
def _augment_name_with_entity(name: str, meta: Dict[str, Any]) -> str:
    debtor = (meta.get("debtor") or meta.get("party") or "").strip()
    if not debtor:
        return name
    normalized = name.lower()
    if debtor.lower() in normalized:
        return name  # already present
    return f"{debtor} — {name}"

# ===== Prompt Expansion (bias to bankruptcy) =====
def _mk_expand_instructions(target_density_hint: float) -> str:
    scope = "broad" if target_density_hint >= 0.6 else "focused"
    return f"""
Return STRICT JSON:
{{"expanded_prompt":"<single expanded paragraph or short bulleted lines>"}}
Your job:
- Expand the user's legal prompt to {scope} scope without inventing new facts.
- PRIORITIZE bankruptcy context if present or implied: debtor names, chapter (7/11/13/Subchapter V),
  petition type (voluntary/involuntary), first-day motions, 341 meeting, DIP financing, plan/disclosure statement,
  confirmation, conversion, dismissal, key hearings, and deadlines.
- Normalize court/case phrasing, ECF/docket mentions, rule cites, judge titles; keep known dates verbatim.
- Output only valid JSON with 'expanded_prompt'. No commentary.
""".strip()

def expand_prompt_via_gpt(prompt: str, *, model: str, temperature: float, density: float) -> str:
    instructions = _mk_expand_instructions(density)
    sanitized = _sanitize_for_gpt(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You are a legal analyst that broadens scope and normalizes legal prompts for timeline extraction (with bankruptcy focus).",
            user=f"{instructions}\n\nUser prompt:\n{sanitized}",
            temperature=max(0.1, min(0.8, temperature + 0.1)),
            json_mode=True,
            max_tokens=1200
        )
        data = json.loads(raw)
        expanded = (data.get("expanded_prompt") or "").strip()
        if expanded:
            return expanded
    except Exception as e:
        works.msg(f"⚠️ GPT prompt expansion failed: {e}")
    return prompt  # fallback

# ===== GPT milestone inference (LEGAL w/ bankruptcy) =====
def _desired_counts_from_density(density: float) -> Tuple[int, int, int]:
    milestone_target = max(3, min(20, int(round(5 + density * 15))))
    ref_target = max(3, min(15, int(round(3 + density * 12))))
    augment_flag = 1 if density >= 0.75 else 0
    return milestone_target, ref_target, augment_flag

def _mk_infer_mst_instructions_legal(target: int) -> str:
    return rf"""
Return STRICT JSON:
{{
  "milestones":[
    {{
      "name":"<concise event name — include the debtor/company in the name, e.g., 'Acme Corp — Voluntary Chapter 11 Petition Filed'>",
      "date":"YYYY-MM-DDTHH:MM:SS",
      "kind":"bankruptcy|filing|order|deadline|hearing|trial|conference|other",
      "court":"<court name if known>",
      "case_number":"<e.g., 23-12345>",
      "docket_number":"<e.g., ECF No. 17>",
      "judge":"<e.g., Hon. Jane A. Doe>",
      "party":"<primary party if relevant>",
      "rule":"<e.g., FRBP 2004, LBR 4001-2>",
      "location":"<courtroom/Dept>",
      "hearing_type":"<e.g., first-day hearing, plan confirmation>",
      "url":"<source if present, else empty>",
      "debtor":"<company/person name if applicable>",
      "chapter":"<7|11|13|11 (Subchapter V)>"
    }}
  ]
}}
Rules:
- Generate ~{target} key milestones (±2). Prefer bankruptcy events if the context suggests bankruptcy.
- Keep dates real; assume current year when MM/DD appears without year.
- Include the debtor/company IN THE NAME (prefix) whenever a debtor is known.
- Maintain chronological order; no duplicates; valid JSON only.
""".strip()

def _mk_infer_ref_instructions(target: int) -> str:
    return rf"""
Return STRICT JSON:
{{"references":[{{"name":"<milestone>","date":"YYYY-MM-DDTHH:MM:SS","url":"https://..."}}]]}}
Rules:
- Extract items with explicit URLs (PACER-like, CourtListener, gov, judiciary, credible law sites). If no URL, omit.
- Aim for up to {target} items; valid JSON only.
""".strip()

def infer_milestones_via_gpt(prompt: str, *, model: str, temperature: float, density: float) -> List[Dict[str, Any]]:
    target, _, _ = _desired_counts_from_density(density)
    instructions = _mk_infer_mst_instructions_legal(target)
    sanitized_prompt = _sanitize_for_gpt(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You are a paralegal that extracts legal/court milestones with dates and metadata as JSON (bankruptcy-aware).",
            user=f"{instructions}\n\nUser prompt:\n{sanitized_prompt}",
            temperature=temperature,
            json_mode=True,
            max_tokens=1500
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
            meta = {
                "kind": (m.get("kind") or "other").strip().lower(),
                "court": (m.get("court") or None),
                "case_number": (m.get("case_number") or None),
                "docket_number": (m.get("docket_number") or None),
                "judge": (m.get("judge") or None),
                "party": (m.get("party") or None),
                "rule": (m.get("rule") or None),
                "location": (m.get("location") or None),
                "hearing_type": (m.get("hearing_type") or None),
                "url": (m.get("url") or None),
                "debtor": (m.get("debtor") or None),
                "chapter": (m.get("chapter") or None),
            }
            # Ensure debtor prefix in name
            name = _augment_name_with_entity(name, meta)
            out.append({"name": name, "date": dt, **meta})
        return out
    except Exception as e:
        works.msg(f"⚠️ GPT legal milestone inference failed: {e}")
        return []

def infer_references_via_gpt(prompt: str, *, model: str, temperature: float, density: float) -> List[Dict[str, Any]]:
    target = _desired_counts_from_density(density)[1]
    instructions = _mk_infer_ref_instructions(target)
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

# ===== Colors =====
import colorsys

def _wcag_luminance(rgb):
    def _channel(c):
        c = c / 255.0
        return c/12.92 if c <= 0.03928*12.92 else ((c+0.055)/1.055) ** 2.4
    r, g, b = (_channel(rgb[0]), _channel(rgb[1]), _channel(rgb[2]))
    return 0.2126*r + 0.7152*g + 0.0722*b

def _contrast_ratio_with_white(rgb):
    Lc = _wcag_luminance(rgb)
    Lw = 1.0
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
    return random.choice(["#1F2937", "#0F766E", "#065F46", "#7C2D12", "#6B21A8",
                          "#9D174D", "#1D4ED8", "#B45309", "#14532D", "#7F1D1D"])

# ===== URL merge/dedupe =====
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
        key = (name, d.year, d.month, d.day, m.get("docket_number"), m.get("kind"))
        if key in seen:
            continue
        seen.add(key)
        out.append(m)
    return out

# ===== Relative deadlines =====
_RELATIVE_RE = re.compile(
    r'\b(?:within|no later than|not later than|by|due)\s+(\d{1,3})\s+(calendar|court|business)?\s*day[s]?\s+(?:of|after|before)\s+(?:"([^"]+)"|the\s+([A-Za-z][A-Za-z\s]+)|on\s+([A-Za-z]+\s+\d{1,2},?\s*\d{0,4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4}))',
    re.I
)

def _parse_relative_deadlines(lines: List[str], anchors: Dict[str, datetime]) -> List[Dict[str, Any]]:
    milestones: List[Dict[str, Any]] = []
    for line in lines:
        for m in _RELATIVE_RE.finditer(line):
            days = int(m.group(1))
            day_type = (m.group(2) or "calendar").lower()
            phrase_target = (m.group(3) or m.group(4) or m.group(5) or "").strip()
            anchor_dt = _parse_first_date_in_text(phrase_target)
            if not anchor_dt:
                key = phrase_target.lower()
                anchor_dt = anchors.get(key)
                if not anchor_dt:
                    for k, v in anchors.items():
                        if key and key in k:
                            anchor_dt = v
                            break
            if not anchor_dt:
                continue
            span_text = m.group(0).lower()
            delta = timedelta(days=days)
            due = anchor_dt - delta if "before" in span_text else anchor_dt + delta
            name = f"Deadline: {days} {day_type} days {'before' if 'before' in span_text else 'after'} {phrase_target}"
            meta = _extract_legal_metadata(line)
            meta["kind"] = "deadline"
            # Prefix debtor in deadline name as well, if known
            name = _augment_name_with_entity(name, meta)
            milestones.append({"name": name, "date": due, **meta})
    return milestones

# ===== Line-based parsing =====
def parse_milestones_from_lines(prompt: str) -> List[Dict[str, Any]]:
    milestones: List[Dict[str, Any]] = []
    default_year = datetime.now().year
    lines = [(ln or "").strip() for ln in (prompt or "").splitlines() if (ln or "").strip()]
    for raw in lines:
        line = raw.strip()
        name = _extract_name(line)
        if not name:
            continue
        dt = _parse_first_date_in_text(line, default_year=default_year)
        if dt:
            meta = _extract_legal_metadata(line)
            # Bankruptcy emphasis: if it's a BK event or debtor known, prefix name
            name = _augment_name_with_entity(name, meta)
            milestones.append({"name": name, "date": dt, **meta})
    # Build anchors for relative deadlines
    anchors: Dict[str, datetime] = {}
    for m in milestones:
        for key in [m["name"].lower(), (m.get("hearing_type") or "").lower(), (m.get("kind") or "").lower()]:
            if key:
                anchors.setdefault(key, m["date"])
    milestones.extend(_parse_relative_deadlines(lines, anchors))
    return milestones

# ===== Web search backends (pluggable) =====
def web_search(query: str, *, num: int = 5, timeout: float = 10.0) -> List[Dict[str, str]]:
    """
    Returns: list of {"title":..., "snippet":..., "url":...}
    Tries CourtListener -> Bing -> Google CSE -> SerpAPI (first one with creds wins).
    """
    hits: List[Dict[str, str]] = []

    # 1) CourtListener search (opinions + dockets)
    cl_token = os.getenv("COURTLISTENER_TOKEN")
    if cl_token:
        try:
            params = {
                "q": query,
                "page_size": min(10, max(1, num)),
                "order_by": "dateFiled desc"
            }
            headers = {"Authorization": f"Token {cl_token}"}
            # Opinions
            r1 = requests.get("https://www.courtlistener.com/api/rest/v3/opinions/", params=params, headers=headers, timeout=timeout)
            if r1.ok:
                data = r1.json()
                for res in data.get("results", [])[:num]:
                    hits.append({
                        "title": res.get("caseName", "") or res.get("case_name", "") or "Opinion",
                        "snippet": res.get("per_curiam", "") and "Per curiam opinion" or "",
                        "url": f"https://www.courtlistener.com{res.get('absolute_url','')}"
                    })
            # Dockets
            if len(hits) < num:
                r2 = requests.get("https://www.courtlistener.com/api/rest/v3/dockets/", params=params, headers=headers, timeout=timeout)
                if r2.ok:
                    data = r2.json()
                    for res in data.get("results", []):
                        title = res.get("case_name", "") or res.get("caseName", "") or "Docket"
                        hits.append({
                            "title": title,
                            "snippet": (res.get("court") or {}).get("full_name", "") if isinstance(res.get("court"), dict) else "",
                            "url": f"https://www.courtlistener.com{res.get('absolute_url','')}"
                        })
            if hits:
                return hits[:num]
        except Exception as e:
            works.msg(f"⚠️ CourtListener search failed: {e}")

    # 2) Bing Web Search
    bing_key = os.getenv("BING_API_KEY") or "MpRDTcHkAnPldqDAMxqdUHh8UQPbWat8lrtli28ZY5AzSeBdkwsQ"
    if bing_key:
        try:
            endpoint = "https://api.bing.microsoft.com/v7.0/search"
            headers = {"Ocp-Apim-Subscription-Key": bing_key}
            params = {"q": query, "count": num, "mkt": "en-US", "responseFilter": "Webpages"}
            r = requests.get(endpoint, headers=headers, params=params, timeout=timeout)
            if r.ok:
                js = r.json()
                for w in (js.get("webPages") or {}).get("value", []):
                    hits.append({"title": w.get("name",""), "snippet": w.get("snippet",""), "url": w.get("url","")})
                if hits:
                    return hits[:num]
        except Exception as e:
            works.msg(f"⚠️ Bing search failed: {e}")

    # 3) Google Custom Search (Programmable Search Engine)
    g_key = os.getenv("GOOGLE_API_KEY") or 'AIzaSyBaB5XKJEcmIR04NJ0TGbBWJQgJ85wwoHw'
    g_cx  = os.getenv("GOOGLE_CSE_ID") or '017576662512468239146:omuauf_lfve'
    if g_key and g_cx:
        try:
            u = "https://www.googleapis.com/customsearch/v1?" + urlencode({"key": g_key, "cx": g_cx, "q": query, "num": num})
            r = requests.get(u, timeout=timeout)
            if r.ok:
                js = r.json()
                for it in js.get("items", []):
                    hits.append({"title": it.get("title",""), "snippet": it.get("snippet",""), "url": it.get("link","")})
                if hits:
                    return hits[:num]
        except Exception as e:
            works.msg(f"⚠️ Google CSE failed: {e}")

    # 4) SerpAPI
    serp_key = os.getenv("SERPAPI_KEY")
    if serp_key:
        try:
            params = {"engine": "google", "q": query, "num": num, "api_key": serp_key}
            r = requests.get("https://serpapi.com/search", params=params, timeout=timeout)
            if r.ok:
                js = r.json()
                for it in js.get("organic_results", []):
                    hits.append({"title": it.get("title",""), "snippet": it.get("snippet",""), "url": it.get("link","")})
                if hits:
                    return hits[:num]
        except Exception as e:
            works.msg(f"⚠️ SerpAPI failed: {e}")

    return hits[:num]

# ===== Debtor extraction from snippets/titles/pages =====
_DEBTOR_PATTERNS = [
    r'\bIn\s+re[:\s]+([A-Z][A-Za-z0-9\.\-&,\s]+)',          # In re Acme Corp
    r'\bDebtor(?:s)?[:\s]+([A-Z][A-Za-z0-9\.\-&,\s]+)',     # Debtor: Acme Corp
    r'\b(?:Re|Regarding)[:\s]+([A-Z][A-Za-z0-9\.\-&,\s]+)\s+(?:\—|-|–)?\s*Debtor',  # Re: X — Debtor
    r'\b([A-Z][A-Za-z0-9\.\-&,\s]+)\s+—\s+Debtor\b',
    r'\b([A-Z][A-Za-z0-9\.\-&,\s]+)\s+\(Debtor\)\b',
]
_DEBTOR_RX = [re.compile(p, re.I) for p in _DEBTOR_PATTERNS]

def _clean_debtor_name(s: str) -> str:
    s = s.strip(" \t\r\n,.;:—-–")
    # Avoid trailing chapter/keywords in capture
    s = re.sub(r'\b(Chapter\s*\d+|Subchapter\s*V|Bankruptcy|Case|Petition)\b.*$', '', s, flags=re.I)
    return s.strip(" \t\r\n,.;:—-–")

def extract_debtor_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    for rx in _DEBTOR_RX:
        m = rx.search(text)
        if m:
            cand = _clean_debtor_name(m.group(1))
            if cand and len(cand) >= 2:
                return cand
    # Fallback: caption heuristics like "Acme Corp, Debtor — Case No. 23-xxxxx"
    m = re.search(r'^([A-Z][A-Za-z0-9\.\-&,\s]+?),\s+Debtor\b', text, re.I | re.M)
    if m:
        return _clean_debtor_name(m.group(1))
    return None

def resolve_debtor_for_point(point: Dict[str, Any], *, max_hits: int = 5) -> Optional[str]:
    """
    Build a precise query from the milestone and try to infer debtor from search hits.
    """
    # Compose a targeted query
    parts = [
        point.get("name") or "",
        point.get("case_number") or "",
        point.get("court") or "",
        point.get("chapter") or "",
        "bankruptcy",
    ]
    # Include month/year from date to focus results
    try:
        dt = datetime.fromisoformat(point["date"])
    except Exception:
        dt = None
    if dt:
        parts.append(dt.strftime("%B %Y"))

    query = " ".join(p for p in parts if p).strip()
    hits = web_search(query, num=max_hits)
    works.msg(f"🔎 debtor search hits: {len(hits)} for query: {query!r}")

    # Try title/snippet first (fast)
    for h in hits:
        for field in (h.get("title",""), h.get("snippet","")):
            debtor = extract_debtor_from_text(field)
            if debtor:
                return debtor

    # Optional: fetch first couple pages if necessary
    for h in hits[:2]:
        url = h.get("url")
        if not url:
            continue
        try:
            r = requests.get(url, timeout=7)
            if r.ok and r.text:
                debtor = extract_debtor_from_text(r.text)
                if debtor:
                    return debtor
        except Exception:
            pass

    return None

def filter_points_by_debtor(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    For each milestone point:
      - If debtor already present, keep (and ensure name is prefixed).
      - Else try to resolve via web search; if found, set and prefix.
      - If no debtor found, drop the point.
    """
    kept: List[Dict[str, Any]] = []
    removed = 0

    for p in points:
        debtor = (p.get("debtor") or "").strip()
        if not debtor:
            debtor = resolve_debtor_for_point(p)
            if debtor:
                p["debtor"] = debtor

        if debtor:
            # Ensure debtor prefix in the display name
            current_name = p.get("name","")
            if debtor.lower() not in current_name.lower():
                p["name"] = f"{debtor} — {current_name}"
            kept.append(p)
        else:
            removed += 1

    works.msg(f"🧹 debtor-filter removed {removed} point(s); kept {len(kept)}")
    return kept

# ===== Main builder =====
def _hours_from(ref: datetime, dt: datetime) -> float:
    return max(0.0, (dt - ref).total_seconds() / 3600.0)

def build_milestones(prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2, density: float = 0.5) -> Dict[str, Any]:
    density = _clamp01(density, 0.5)

    works.msg("🧩 expanding scope of prompt for legal normalization & adjacent (bankruptcy) steps…")
    expanded = expand_prompt_via_gpt(prompt, model=model, temperature=temperature, density=density)
    if expanded != prompt:
        works.msg(f"ℹ️ expansion added {max(0, len(expanded) - len(prompt))} chars")
    combined_prompt = f"{prompt.strip()}\n\n[Expanded Context]\n{expanded.strip()}"

    # 1) Try explicit dated bullets/numbers on combined text
    milestones = parse_milestones_from_lines(combined_prompt)
    works.msg(f"🔎 line-parse milestones: {len(milestones)}")

    # 1a) If none found, ALWAYS infer via GPT on the combined text
    if not milestones:
        works.msg("🧠 inferring legal milestones from expanded content (no dated lines found)…")
        inferred = infer_milestones_via_gpt(combined_prompt, model=model, temperature=temperature, density=density)
        works.msg(f"🧠 GPT inference (expanded) produced: {len(inferred)}")
        milestones = inferred

    # 1b) If still none, fallback: infer on the ORIGINAL prompt
    if not milestones:
        works.msg("↩️ fallback inference on original prompt…")
        inferred2 = infer_milestones_via_gpt(prompt, model=model, temperature=temperature, density=density)
        works.msg(f"🧠 GPT inference (original) produced: {len(inferred2)}")
        milestones = inferred2

    # 1c) High density → augmentation
    _, _, augment_flag = _desired_counts_from_density(density)
    if milestones and augment_flag:
        works.msg("➕ augmenting legal milestones for higher density…")
        extra = infer_milestones_via_gpt(combined_prompt, model=model, temperature=temperature, density=density)
        works.msg(f"➕ augmentation added: {len(extra)} (before dedupe)")
        if extra:
            milestones = _dedupe_milestones(milestones + extra)
            works.msg(f"🧹 after dedupe: {len(milestones)}")

    # 1d) Optional URL references
    if milestones:
        works.msg("🔗 extracting dated references with URLs…")
        refs = infer_references_via_gpt(combined_prompt, model=model, temperature=temperature, density=density)
        works.msg(f"🔗 references found: {len(refs)}")
        if refs:
            _merge_urls_into_milestones(milestones, refs)

    if not milestones:
        works.msg("∅ No milestones found — returning empty set with default window")
        s = _next_business_start(datetime.now())
        e = s + timedelta(hours=8)
        return {"milestones": [], "window": {"start": s.isoformat(), "end": e.isoformat()}}

    # 2) Normalize & compute axis coordinates
    milestones.sort(key=lambda m: m["date"])
    min_dt = milestones[0]["date"]
    max_dt = milestones[-1]["date"]

    out_points: List[Dict[str, Any]] = []
    for m in milestones:
        dt = m["date"]
        tx = _hours_from(min_dt, dt)
        ty = random.uniform(0.35, 0.65)
        out_points.append({
            "x": tx,
            "y": ty,
            "type": "milestone",
            "name": m["name"],
            "color": _random_contrasting_color(),
            "date": dt.isoformat(),
            "url": m.get("url") or None,
            "kind": m.get("kind") or "other",
            "court": m.get("court"),
            "case_number": m.get("case_number"),
            "docket_number": m.get("docket_number"),
            "judge": m.get("judge"),
            "party": m.get("party"),
            "rule": m.get("rule"),
            "location": m.get("location"),
            "hearing_type": m.get("hearing_type"),
            # Bankruptcy metadata
            "debtor": m.get("debtor"),
            "chapter": m.get("chapter"),
        })

    works.msg(f"✅ emitting {len(out_points)} milestones; window {min_dt.date()} → {max_dt.date()}")

    # >>> NEW: First search pass per point to resolve debtor, then filter <<<
    works.msg("🌐 resolving debtor via web search for each hit (and filtering points without debtor)…")
    out_points = filter_points_by_debtor(out_points)

    # If everything was filtered out, fall back to empty window starting next business start
    if not out_points:
        works.msg("∅ All milestones removed due to missing debtor — returning empty set with default window")
        s = _next_business_start(datetime.now())
        e = s + timedelta(hours=8)
        return {"milestones": [], "window": {"start": s.isoformat(), "end": e.isoformat()}}

    # Recompute window after filtering
    out_points.sort(key=lambda p: p["date"])
    new_min = datetime.fromisoformat(out_points[0]["date"])
    new_max = datetime.fromisoformat(out_points[-1]["date"])

    return {
        "milestones": out_points,
        "window": {"start": new_min.isoformat(), "end": new_max.isoformat()}
    }

# ----- Ion entry -----
def _read_param(i: int) -> Any:
    try: return works.param(i)
    except Exception: return None

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    prompt = _read_param(1)
    model = _read_param(2) or default_model
    temperature = float(_read_param(3) or 0.2)
    density = _clamp01(_read_param(4), 0.5)

    if not prompt:
        raise RuntimeError("param(1) required: prompt")

    works.msg("🔧 legal/court timeline builder (prompt expansion → bankruptcy-aware milestones + metadata + refs + density + debtor-search filter)")
    result = build_milestones(str(prompt), model=str(model), temperature=temperature, density=density)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    _main_ion()


# MpRDTcHkAnPldqDAMxqdUHh8UQPbWat8lrtli28ZY5AzSeBdkwsQ