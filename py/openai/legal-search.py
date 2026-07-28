#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Legal/Court Timeline Builder (with Prompt Expansion) → Milestone Points
— FIXED: Always infer via GPT when no dated lines are found (no paragraph-only gate)
— Added: Fallback inference on original prompt if expanded text yields nothing
— Added: Helpful logging of counts and paths taken
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

_KIND_KEYWORDS = [
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
    meta["kind"] = _guess_kind(line)
    return meta

# ===== Prompt Expansion =====
def _mk_expand_instructions(target_density_hint: float) -> str:
    scope = "broad" if target_density_hint >= 0.6 else "focused"
    return f"""
Return STRICT JSON:
{{"expanded_prompt":"<single expanded paragraph or short bulleted lines>"}}
Your job:
- Expand the user's legal prompt to {scope} scope without inventing new facts:
  • Normalize court/case phrasing, ECF/docket mentions, rule cites (FRCP/FRAP/L.R.), judge titles.
  • Surface implied adjacent steps (e.g., motion → opposition → reply → hearing → order → deadline),
    define actor roles (Plaintiff/Defendant/etc.), and clarify shorthand (e.g., CMC, OSC).
  • Keep any known dates verbatim; DO NOT fabricate dates; DO NOT change party or court facts.
  • Prefer concise, information-dense phrasing suitable for downstream parsing.
- Output only valid JSON with 'expanded_prompt'. No commentary.
""".strip()

def expand_prompt_via_gpt(prompt: str, *, model: str, temperature: float, density: float) -> str:
    instructions = _mk_expand_instructions(density)
    sanitized = _sanitize_for_gpt(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You are a legal analyst that broadens scope and normalizes legal prompts for timeline extraction.",
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

# ===== GPT milestone inference (LEGAL) =====
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
      "name":"<concise event name>",
      "date":"YYYY-MM-DDTHH:MM:SS",
      "kind":"filing|order|deadline|hearing|trial|conference|other",
      "court":"<court name if known>",
      "case_number":"<e.g., 3:24-cv-01234-JAH-BLM>",
      "docket_number":"<e.g., ECF No. 17>",
      "judge":"<e.g., Hon. Jane A. Doe>",
      "party":"<primary party if relevant>",
      "rule":"<e.g., FRCP 12(b)(6), L.R. 7.1>",
      "location":"<courtroom/Dept>",
      "hearing_type":"<e.g., status conference, oral argument>",
      "url":"<source if present, else empty>"
    }}
  ]
}}
Rules:
- Generate about {target} key legal milestones (±2) with real dates (YYYY-MM-DDTHH:MM:SS).
- Use only dates you can justify from the text; assume current year if the line implies a month/day without year.
- Prefer filings, orders, hearings, conferences, trials, and explicit deadlines; infer reasonable names (verb-first).
- Maintain chronological order; no duplicates; valid JSON only.
""".strip()

def _mk_infer_ref_instructions(target: int) -> str:
    return rf"""
Return STRICT JSON:
{{"references":[{{"name":"<milestone>","date":"YYYY-MM-DDTHH:MM:SS","url":"https://..."}}]]}}
Rules:
- Extract items with explicit URLs (PACER-like, CourtListener, gov, judiciary, law sites). If no URL, omit.
- Aim for up to {target} items; keep only clear matches. Valid JSON only.
""".strip()

def infer_milestones_via_gpt(prompt: str, *, model: str, temperature: float, density: float) -> List[Dict[str, Any]]:
    target, _, _ = _desired_counts_from_density(density)
    instructions = _mk_infer_mst_instructions_legal(target)
    sanitized_prompt = _sanitize_for_gpt(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You are a paralegal that extracts legal/court milestones with dates and metadata as JSON.",
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
            }
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
            day_type = (m.group(2) or "calendar").lower()  # hook for business-day logic later
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
            milestones.append({"name": name, "date": dt, **meta})
    anchors: Dict[str, datetime] = {}
    for m in milestones:
        for key in [m["name"].lower(), (m.get("hearing_type") or "").lower(), (m.get("kind") or "").lower()]:
            if key:
                anchors.setdefault(key, m["date"])
    milestones.extend(_parse_relative_deadlines(lines, anchors))
    return milestones

# ===== Main builder =====
def _hours_from(ref: datetime, dt: datetime) -> float:
    return max(0.0, (dt - ref).total_seconds() / 3600.0)

def build_milestones(prompt: str, *, model: str = "gpt-4o-mini", temperature: float = 0.2, density: float = 0.5) -> Dict[str, Any]:
    density = _clamp01(density, 0.5)

    works.msg("🧩 expanding scope of prompt for legal normalization & adjacent steps…")
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
        })

    works.msg(f"✅ emitting {len(out_points)} milestones; window {min_dt.date()} → {max_dt.date()}")
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
    density = _clamp01(_read_param(4), 0.5)

    if not prompt:
        raise RuntimeError("param(1) required: prompt")

    works.msg("🔧 legal/court timeline builder (prompt expansion → milestones + legal metadata + optional refs + density)")
    result = build_milestones(str(prompt), model=str(model), temperature=temperature, density=density)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    _main_ion()
