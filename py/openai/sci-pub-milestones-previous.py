#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Citation Scheduler → Publication Points (dated pubs on a time axis)
Pipeline:
  1) Scope expansion (GPT) → enriched query
  2) Reference extraction (GPT) → structured IDs (DOI/PMID/PMCID/arXiv)
  3) DOI hardening: normalize + regex + Crossref existence
  4) DOI alignment: title/date/venue checks
  5) GPT Judge #1: validate borderline DOI alignment (accept/reject/unsure)
  6) If rejected: Crossref search for candidates
  7) GPT Judge #2: rank/choose candidate DOI
Outputs:
  - milestones with canonical URLs + abstract_url + verified/adjusted DOI
  - doi_validation_report (syntax/existence)
  - doi_alignment_report (ok/fixed/removed with notes)
  - gpt_validation_report (decisions and rationales from both judges)
"""

import os, json, re, time, random, colorsys, urllib.parse
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, urlunparse

# ===== Config =====
WORK_START_HOUR = 9
WORK_END_HOUR = 17

# Heuristic thresholds
TITLE_SIM_THRESHOLD_OK      = 0.70   # accept automatically if ≥ this
TITLE_SIM_BORDERLINE_LOW    = 0.55   # if in [LOW, OK) → ask GPT
DATE_TOL_DAYS_OK            = 45     # accept automatically if ≤ this
DATE_TOL_DAYS_BORDERLINE    = 90     # if in (OK, BORDERLINE] → ask GPT
CROSSREF_SEARCH_ROWS        = 10
CROSSREF_SEARCH_WINDOW_DAYS = 210

# ===== Ion Works shim =====
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ===== HTTP (requests) =====
try:
    import requests
except Exception as e:
    raise RuntimeError("This script requires the 'requests' package.") from e

# ===== OpenAI =====
from openai import OpenAI, APITimeoutError
_client_singleton = None
def _get_client() -> OpenAI:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = OpenAI(timeout=60, max_retries=3)
    return _client_singleton

def _chat_call(*, model: str, system: str, user: str,
               temperature: float = 0.2, json_mode: bool = True,
               max_tokens: int = 1000, tries: int = 3, backoff: float = 2.0) -> str:
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
def _sanitize_for_gpt_urls(text: str) -> str:
    if not text: return ''
    return re.sub(r"[^\w\s:/\.\-\_\?\=\#\(\)\%\+]", "", text, flags=re.UNICODE)

def _clamp01(x: Any, default: float = 0.5) -> float:
    try: v = float(x)
    except Exception: return default
    return max(0.0, min(1.0, v))

# ===== ID validation & canonical URLs =====
RE_DOI  = re.compile(r'^10\.\d{4,9}/[^\s"<>]+$', re.IGNORECASE)
RE_PMID = re.compile(r'^\d{5,9}$')
RE_PMCID= re.compile(r'^PMC\d+$', re.IGNORECASE)
RE_ARXIV= re.compile(r'^\d{4}\.\d{4,5}(v\d+)?$|^[a-z\-]+(\.[A-Z]{2})?/\d{7}(v\d+)?$', re.IGNORECASE)

def _canonical_pub_url_from_ids(*, doi: str=None, pmcid: str=None, pmid: str=None,
                                arxiv_id: str=None) -> Optional[str]:
    if doi and RE_DOI.match(doi):       return f"https://doi.org/{doi}"
    if pmcid and RE_PMCID.match(pmcid): return f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
    if pmid and RE_PMID.match(pmid):    return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    if arxiv_id and RE_ARXIV.match(arxiv_id): return f"https://arxiv.org/abs/{arxiv_id}"
    return None

def _abstract_url(url: str) -> Optional[str]:
    try:
        u = urlparse(url); host, path = u.netloc.lower(), u.path
        if host == "pubmed.ncbi.nlm.nih.gov":
            return urlunparse((u.scheme, u.netloc, path, "", "format=abstract", ""))
        if host == "www.ncbi.nlm.nih.gov" and path.startswith("/pmc/articles/"):
            return urlunparse((u.scheme, u.netloc, path, "", "", "abstract"))
        if host == "arxiv.org":
            if path.startswith("/pdf/"):
                path = "/abs/" + path[len("/pdf/"):]
                if path.endswith(".pdf"): path = path[:-4]
            elif not path.startswith("/abs/"):
                parts = [p for p in path.split("/") if p]
                if parts: path = "/abs/" + parts[-1]
            return urlunparse((u.scheme, u.netloc, path, "", "", ""))
        return url
    except Exception:
        return None

# ===== DOI utils =====
def _normalize_doi(raw: Optional[str]) -> Optional[str]:
    if not raw: return None
    s = raw.strip()
    s = re.sub(r'^\s*doi:\s*', '', s, flags=re.IGNORECASE)
    for prefix in ('https://doi.org/','http://doi.org/','doi.org/'):
        if s.lower().startswith(prefix): s = s[len(prefix):]
    s = urllib.parse.unquote(s)
    s = s.strip().strip('.,;)]}<>')
    s = re.sub(r'\s+', '', s)
    return s or None

def _doi_exists_crossref(doi: str, mailto: Optional[str] = None, timeout: int = 12) -> bool:
    try:
        headers = {"User-Agent": f"doi-validator/1.0 ({mailto or 'no-email'})"}
        url = "https://api.crossref.org/works/" + requests.utils.quote(doi, safe="")
        r = requests.get(url, headers=headers, timeout=timeout)
        if r.status_code == 200:
            j = r.json()
            return bool((j or {}).get("message"))
        return False
    except Exception:
        return False

def _fetch_crossref_by_doi(doi: str, mailto: Optional[str]=None) -> Optional[Dict[str, Any]]:
    try:
        headers = {"User-Agent": f"doi-align/1.0 ({mailto or 'no-email'})"}
        url = "https://api.crossref.org/works/" + requests.utils.quote(doi, safe="")
        r = requests.get(url, headers=headers, timeout=18)
        if r.status_code != 200: return None
        msg = (r.json() or {}).get("message") or {}
        return msg or None
    except Exception:
        return None

def _crossref_date_to_iso(msg: Dict[str, Any]) -> Optional[str]:
    for key in ("published-print","published-online","issued"):
        parts = (msg.get(key) or {}).get("date-parts")
        if parts and parts[0]:
            y = parts[0][0]; m = parts[0][1] if len(parts[0])>1 else 1; d = parts[0][2] if len(parts[0])>2 else 1
            try:
                return datetime(y,m,d).date().isoformat()
            except Exception:
                try:
                    return datetime(y, m or 1, 1).date().isoformat()
                except Exception:
                    return f"{y:04d}-01-01"
    return None

def _crossref_biblio_search(title: str, first_author: Optional[str],
                            center_date: datetime, mailto: Optional[str]) -> List[Dict[str, Any]]:
    headers = {"User-Agent": f"doi-align/1.0 ({mailto or 'no-email'})"}
    start = (center_date - timedelta(days=CROSSREF_SEARCH_WINDOW_DAYS)).date().isoformat()
    end   = (center_date + timedelta(days=CROSSREF_SEARCH_WINDOW_DAYS)).date().isoformat()
    query = title if not first_author else f"{title} {first_author}"
    params = {
        "query.bibliographic": query,
        "filter": f"from-pub-date:{start},until-pub-date:{end}",
        "rows": str(CROSSREF_SEARCH_ROWS),
        "sort": "relevance",
    }
    try:
        r = requests.get("https://api.crossref.org/works", headers=headers, params=params, timeout=20)
        r.raise_for_status()
        items = ((r.json() or {}).get("message") or {}).get("items") or []
        return items
    except Exception:
        return []

# ===== Similarity utils =====
_STOP = {"the","a","an","of","and","in","on","for","to","with","by","from","at","as","using","via","based","into","over","under","about","without","within"}
def _norm_title_tokens(s: str) -> List[str]:
    s = s.lower()
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    toks = [t for t in s.split() if t and t not in _STOP]
    return toks

def _title_similarity(a: str, b: str) -> float:
    A, B = set(_norm_title_tokens(a)), set(_norm_title_tokens(b))
    if not A or not B: return 0.0
    inter = len(A & B); union = len(A | B)
    return inter / union

def _venue_similarity(expected: str, container: str) -> float:
    if not expected or not container: return 0.0
    return _title_similarity(expected, container)

def _date_distance_days(a_iso: Optional[str], b_iso: Optional[str]) -> int:
    if not a_iso or not b_iso: return 10**6
    try:
        a = datetime.fromisoformat(a_iso).date()
        b = datetime.fromisoformat(b_iso).date()
        return abs((a-b).days)
    except Exception:
        return 10**6

def _first_author_guess(authors: List[str]) -> Optional[str]:
    if not authors: return None
    lead = authors[0]
    if "," in lead:
        return lead.split(",",1)[0].strip()
    return lead.split()[-1].strip() if lead.strip() else None

# ===== GPT: scope expansion =====
def _mk_scope_expand_instructions(expand_strength: float) -> str:
    k = max(3, min(12, int(round(3 + expand_strength * 9))))
    return rf"""
Return STRICT JSON with this shape:

{{
  "expanded_prompt": "<one concise paragraph that broadens the user's query with nearby concepts, methods, and outcomes>",
  "keywords": ["token1","token2","..."],               # ~{k} high-signal terms, no duplicates
  "synonyms": ["alternate names/aliases/acronyms"],    # related aliases and acronyms
  "entities": ["genes","proteins","drugs","variants"], # optional but helpful
  "time_window": "YYYY-YYYY or YYYY-MM to YYYY-MM"     # optional; omit if unclear
}}

Rules:
- No URLs. No prose outside JSON.
- Focus on scientific retrieval utility: assays, mechanisms, targets, variants, pathways, model systems, endpoints.
- Prefer unambiguous terms (e.g., 'BNT162b2', 'mRNA-1273', 'neutralizing antibodies', 'Delta (B.1.617.2)').
""".strip()

def expand_prompt_via_gpt(prompt: str, *, model: str, temperature: float, expand_strength: float) -> Dict[str, Any]:
    instructions = _mk_scope_expand_instructions(expand_strength)
    sanitized = _sanitize_for_gpt_urls(prompt)
    try:
        raw = _chat_call(
            model=model,
            system="You expand and structure a scientific search prompt for best-possible literature retrieval.",
            user=f"{instructions}\n\nUser prompt:\n{sanitized}",
            temperature=min(0.7, max(0.1, temperature + 0.2)),
            json_mode=True,
            max_tokens=1200
        )
        data = json.loads(raw)
        data["expanded_prompt"] = str(data.get("expanded_prompt") or "").strip()
        for k in ("keywords","synonyms","entities"):
            seq = data.get(k) or []
            data[k] = [str(x).strip() for x in seq if isinstance(x, str) and x.strip()] if isinstance(seq, list) else []
        data["time_window"] = str(data["time_window"]).strip() if data.get("time_window") else None
        return data
    except Exception as e:
        works.msg(f"⚠️ GPT scope expansion failed: {e}")
        return {"expanded_prompt": sanitized, "keywords": [], "synonyms": [], "entities": [], "time_window": None}

# ===== GPT Judge #1: alignment verdict for borderline cases =====
def _mk_alignment_judge_instructions() -> str:
    return """
Return STRICT JSON:
{
  "verdict": "accept" | "reject" | "unsure",
  "confidence": 0.0-1.0,
  "reasons": ["...","..."]
}
Rules:
- Decide whether CANDIDATE (title/container/date) is the SAME publication as EXPECTED.
- Prefer exact/near-exact title match, acceptable abbreviations, and close dates.
- If titles describe different endpoints, cohorts, or modalities, reject.
- If container is a common alias (e.g., NEJM vs New England Journal of Medicine), do not penalize.
- If unsure due to ambiguous phrasing, return "unsure".
""".strip()

def gpt_alignment_judge(expected: Dict[str, Any], candidate: Dict[str, Any],
                        expansion: Dict[str, Any], model: str, temperature: float) -> Dict[str, Any]:
    sys = "You are a meticulous bibliographic validator."
    instr = _mk_alignment_judge_instructions()
    payload = {
        "EXPECTED": {
            "title": expected.get("title"),
            "venue": expected.get("venue"),
            "date": expected.get("date").isoformat() if isinstance(expected.get("date"), datetime) else expected.get("date"),
        },
        "EXPANSION_TERMS": {
            "keywords": expansion.get("keywords") or [],
            "entities": expansion.get("entities") or [],
            "synonyms": expansion.get("synonyms") or [],
        },
        "CANDIDATE": {
            "title": candidate.get("title"),
            "container_title": candidate.get("container_title"),
            "date": candidate.get("date_iso"),
            "doi": candidate.get("doi"),
        }
    }
    user = instr + "\n\nJSON:\n" + json.dumps(payload, ensure_ascii=False)
    try:
        raw = _chat_call(model=model, system=sys, user=user, temperature=min(0.4, max(0.0, temperature-0.1)), json_mode=True, max_tokens=400)
        return json.loads(raw)
    except Exception as e:
        works.msg(f"⚠️ GPT alignment judge failed: {e}")
        return {"verdict":"unsure","confidence":0.0,"reasons":["model_error"]}

# ===== GPT Judge #2: candidate ranking/selection =====
def _mk_candidate_rank_instructions() -> str:
    return """
Return STRICT JSON:
{
  "choice_index": <integer index of the best candidate in CANDIDATES or -1 if none>,
  "confidence": 0.0-1.0,
  "reasons": ["...","..."]
}
Rules:
- Choose the candidate that is the SAME publication as EXPECTED.
- Use title semantic equivalence (allow abbreviations), venue aliases, and date proximity.
- If all candidates are wrong or ambiguous, return -1.
""".strip()

def gpt_rank_candidates(expected: Dict[str, Any], candidates: List[Dict[str, Any]],
                        model: str, temperature: float) -> Dict[str, Any]:
    sys = "You are a careful bibliography matcher."
    instr = _mk_candidate_rank_instructions()
    payload = {
        "EXPECTED": {
            "title": expected.get("title"),
            "venue": expected.get("venue"),
            "date": expected.get("date").isoformat() if isinstance(expected.get("date"), datetime) else expected.get("date"),
        },
        "CANDIDATES": candidates
    }
    user = instr + "\n\nJSON:\n" + json.dumps(payload, ensure_ascii=False)
    try:
        raw = _chat_call(model=model, system=sys, user=user, temperature=min(0.4, max(0.0, temperature-0.1)), json_mode=True, max_tokens=600)
        return json.loads(raw)
    except Exception as e:
        works.msg(f"⚠️ GPT ranker failed: {e}")
        return {"choice_index": -1, "confidence": 0.0, "reasons":["model_error"]}

# ===== GPT extraction of references (with DOI hardening) =====
def _mk_infer_ref_instructions(target: int) -> str:
    return rf"""
Return STRICT JSON:
{{
  "references":[
    {{
      "title":"<paper title>",
      "date":"YYYY-MM-DDTHH:MM:SS",
      "venue":"<journal or conference name>",     # optional
      "authors":["Last, First","..."],            # optional
      "ids": {{
        "doi":"10.xxxx/xxxxx",            # REAL DOI only (starts "10.", contains "/")
        "pmid":"12345678",                # optional
        "pmcid":"PMC1234567",             # optional
        "arxiv_id":"YYYY.NNNNN",          # optional
        "biorxiv_doi":"10.1101/xxxxxx",   # optional (this IS a DOI)
        "medrxiv_doi":"10.1101/xxxxxx"    # optional (this IS a DOI)
      }}
    }}
  ]
}}
Rules:
- ONLY scientific publications (peer-reviewed, conference papers, or preprints).
- DO NOT invent or guess DOIs. If uncertain, omit DOI.
- DO NOT output journal short codes as DOIs.
- No URLs; only structured IDs.
- Aim for up to {target} items most relevant to the user's text.
- Valid JSON only; no commentary.
""".strip()

def infer_references_via_gpt(prompt: str, *, model: str, temperature: float, density: float) -> List[Dict[str, Any]]:
    target = max(3, min(15, int(round(3 + density * 12))))
    instructions = _mk_infer_ref_instructions(target)
    sanitized = _sanitize_for_gpt_urls(prompt)

    invalid_dois_local: List[str] = []
    unresolvable_dois_local: List[str] = []

    try:
        raw = _chat_call(
            model=model,
            system="You extract dated references to scientific publications as JSON with structured IDs only.",
            user=f"{instructions}\n\nUser prompt:\n{sanitized}",
            temperature=temperature,
            json_mode=True,
            max_tokens=1800
        )
        data = json.loads(raw)
        out: List[Dict[str, Any]] = []
        for r in (data.get("references") or []):
            title = str(r.get("title", "")).strip()
            date_str = str(r.get("date", "")).strip()
            venue = (r.get("venue") or "").strip()
            authors = r.get("authors") or []
            ids = r.get("ids") or {}
            if not title or not date_str or not isinstance(ids, dict):
                continue
            try:
                dt = datetime.fromisoformat(date_str)
            except Exception:
                continue

            doi_raw = (ids.get("doi") or ids.get("biorxiv_doi") or ids.get("medrxiv_doi") or "").strip()
            doi_norm = _normalize_doi(doi_raw)
            doi_ok = doi_norm if (doi_norm and RE_DOI.match(doi_norm)) else None
            if doi_raw and not doi_ok:
                invalid_dois_local.append(doi_raw)
            if doi_ok and not _doi_exists_crossref(doi_ok):
                unresolvable_dois_local.append(doi_ok)
                doi_ok = None

            pmid     = (ids.get("pmid") or "").strip() or None
            pmcid    = (ids.get("pmcid") or "").strip() or None
            arxiv_id = (ids.get("arxiv_id") or "").strip() or None

            url = _canonical_pub_url_from_ids(doi=doi_ok, pmcid=pmcid, pmid=pmid, arxiv_id=arxiv_id)
            if not url:
                continue

            out.append({
                "title": title,
                "date": dt,
                "venue": venue,
                "authors": [str(a) for a in authors if isinstance(a, str) and a.strip()],
                "url": url,
                "doi": doi_ok
            })

        infer_references_via_gpt._last_report = {"invalid_dois": invalid_dois_local, "unresolvable_dois": unresolvable_dois_local}  # type: ignore[attr-defined]
        return out

    except Exception as e:
        works.msg(f"⚠️ GPT reference extraction failed: {e}")
        infer_references_via_gpt._last_report = {"invalid_dois": [], "unresolvable_dois": []}  # type: ignore[attr-defined]
        return []

# ===== Alignment + GPT validation =====
def _align_or_fix_doi(ref: Dict[str, Any], expansion: Dict[str, Any],
                      mailto: Optional[str], model: str, temperature: float) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Returns: (possibly updated ref, alignment_record, gpt_validation_record or None)
    alignment_record: ok/fixed/removed with heuristic notes
    gpt_validation_record: judge decisions (1st and/or 2nd pass)
    """
    title_expected = ref.get("title") or ""
    date_expected  = ref.get("date")
    venue_expected = ref.get("venue") or ""
    doi            = ref.get("doi")

    gpt_record: Dict[str, Any] = {"judge1": None, "judge2": None}

    alignment = {
        "title": title_expected,
        "expected_date": date_expected.isoformat() if isinstance(date_expected, datetime) else None,
        "expected_venue": venue_expected or None,
        "initial_doi": doi,
        "status": None,
        "final_doi": None,
        "note": None,
    }

    def evaluate_msg(msg: Dict[str, Any], candidate_doi: str) -> Tuple[float,int,float,str,str]:
        title_msg = " ".join(msg.get("title") or []).strip()
        cont = " ".join(msg.get("container-title") or []).strip()
        date_msg = _crossref_date_to_iso(msg)
        ts = _title_similarity(title_expected, title_msg)
        dd = _date_distance_days(ref["date"].date().isoformat() if isinstance(ref["date"], datetime) else None, date_msg)
        vs = _venue_similarity(venue_expected, cont)
        return ts, dd, vs, date_msg or "", title_msg

    # If we have a DOI, try to align it first
    if doi:
        msg = _fetch_crossref_by_doi(doi, mailto=mailto)
        if msg:
            ts, dd, vs, date_msg, title_msg = evaluate_msg(msg, doi)
            # auto-accept if clearly good
            if ts >= TITLE_SIM_THRESHOLD_OK and dd <= DATE_TOL_DAYS_OK:
                alignment["status"] = "ok"; alignment["final_doi"] = doi
                alignment["note"] = f"title_sim={ts:.2f}, date_diff={dd}, venue_sim={vs:.2f}"
                return ref, alignment, None

            # borderline → ask GPT Judge #1
            if (TITLE_SIM_BORDERLINE_LOW <= ts < TITLE_SIM_THRESHOLD_OK) or (DATE_TOL_DAYS_OK < dd <= DATE_TOL_DAYS_BORDERLINE):
                cand = {"title": title_msg, "container_title": " ".join(msg.get("container-title") or []).strip(),
                        "date_iso": date_msg, "doi": doi}
                expected = {"title": title_expected, "venue": venue_expected, "date": ref["date"]}
                verdict = gpt_alignment_judge(expected, cand, expansion, model=model, temperature=temperature)
                gpt_record["judge1"] = {"candidate_doi": doi, "verdict": verdict}
                if verdict.get("verdict") == "accept" and verdict.get("confidence", 0) >= 0.6:
                    alignment["status"] = "ok"
                    alignment["final_doi"] = doi
                    alignment["note"] = f"GPT accept (borderline); title_sim={ts:.2f}, date_diff={dd}, venue_sim={vs:.2f}"
                    return ref, alignment, gpt_record
            # else: considered mismatch; proceed to fix

        # Fix via Crossref candidate search
        first_author = _first_author_guess(ref.get("authors") or [])
        items = _crossref_biblio_search(title_expected, first_author, ref["date"] if isinstance(ref["date"], datetime) else datetime.now(), mailto)
        # Prepare candidate payload for GPT #2
        candidates_for_gpt = []
        best_item = None; best_score = -1e9; best_tuple = (0.0,10**6,0.0,"","")
        for it in items:
            if not it.get("DOI"): continue
            ts, dd, vs, dmsg, tmsg = evaluate_msg(it, it.get("DOI",""))
            score = (ts*2.0) + (vs*0.5) - (dd/60.0)
            if score > best_score:
                best_score = score; best_item = it; best_tuple = (ts, dd, vs, dmsg, tmsg)
            candidates_for_gpt.append({
                "title": tmsg,
                "container_title": " ".join(it.get("container-title") or []).strip(),
                "date_iso": dmsg,
                "doi": it.get("DOI")
            })

        # Ask GPT Judge #2 to select among candidates (if any)
        if candidates_for_gpt:
            expected = {"title": title_expected, "venue": venue_expected, "date": ref["date"]}
            pick = gpt_rank_candidates(expected, candidates_for_gpt, model=model, temperature=temperature)
            gpt_record["judge2"] = pick
            idx = pick.get("choice_index", -1)
            if isinstance(idx, int) and 0 <= idx < len(candidates_for_gpt) and pick.get("confidence", 0) >= 0.55:
                chosen = candidates_for_gpt[idx]
                new_doi = chosen.get("doi")
                if new_doi and RE_DOI.match(new_doi):
                    ref["doi"] = new_doi
                    ref["url"] = f"https://doi.org/{new_doi}"
                    alignment["status"] = "fixed"
                    alignment["final_doi"] = new_doi
                    alignment["note"] = f"GPT-chosen candidate; title~venue~date considered"
                    return ref, alignment, gpt_record

        # fallback: heuristic best
        if best_item:
            new_doi = best_item.get("DOI")
            ts, dd, vs, dmsg, tmsg = best_tuple
            if new_doi and RE_DOI.match(new_doi) and ts >= TITLE_SIM_BORDERLINE_LOW and dd <= DATE_TOL_DAYS_BORDERLINE:
                ref["doi"] = new_doi
                ref["url"] = f"https://doi.org/{new_doi}"
                alignment["status"] = "fixed"
                alignment["final_doi"] = new_doi
                alignment["note"] = f"heuristic fix; title_sim={ts:.2f}, date_diff={dd}, venue_sim={vs:.2f}"
                return ref, alignment, gpt_record

        # Could not fix
        ref["doi"] = None
        alignment["status"] = "removed"
        alignment["final_doi"] = None
        alignment["note"] = "dropped DOI after mismatch; no suitable replacement"
        return ref, alignment, gpt_record

    # No DOI initially → try to find one (with GPT rank support)
    first_author = _first_author_guess(ref.get("authors") or [])
    items = _crossref_biblio_search(title_expected, first_author, ref["date"] if isinstance(ref["date"], datetime) else datetime.now(), mailto)
    candidates_for_gpt = []
    best_item = None; best_score = -1e9; best_tuple = (0.0,10**6,0.0,"","")
    for it in items:
        if not it.get("DOI"): continue
        ts, dd, vs, dmsg, tmsg = evaluate_msg(it, it.get("DOI",""))
        score = (ts*2.0) + (vs*0.5) - (dd/60.0)
        if score > best_score:
            best_score = score; best_item = it; best_tuple = (ts, dd, vs, dmsg, tmsg)
        candidates_for_gpt.append({
            "title": tmsg,
            "container_title": " ".join(it.get("container-title") or []).strip(),
            "date_iso": dmsg,
            "doi": it.get("DOI")
        })

    if candidates_for_gpt:
        expected = {"title": title_expected, "venue": venue_expected, "date": ref["date"]}
        pick = gpt_rank_candidates(expected, candidates_for_gpt, model=model, temperature=temperature)
        gpt_record["judge2"] = pick
        idx = pick.get("choice_index", -1)
        if isinstance(idx, int) and 0 <= idx < len(candidates_for_gpt) and pick.get("confidence", 0) >= 0.55:
            chosen = candidates_for_gpt[idx]
            new_doi = chosen.get("doi")
            if new_doi and RE_DOI.match(new_doi):
                ref["doi"] = new_doi
                ref["url"] = f"https://doi.org/{new_doi}"
                alignment["status"] = "fixed"
                alignment["final_doi"] = new_doi
                alignment["note"] = "GPT-chosen new DOI"
                return ref, alignment, gpt_record

    if best_item:
        new_doi = best_item.get("DOI")
        ts, dd, vs, dmsg, tmsg = best_tuple
        if new_doi and RE_DOI.match(new_doi) and ts >= TITLE_SIM_THRESHOLD_OK and dd <= DATE_TOL_DAYS_OK:
            ref["doi"] = new_doi
            ref["url"] = f"https://doi.org/{new_doi}"
            alignment["status"] = "fixed"
            alignment["final_doi"] = new_doi
            alignment["note"] = f"heuristic; title_sim={ts:.2f}, date_diff={dd}"
            return ref, alignment, gpt_record

    alignment["status"] = "ok"
    alignment["final_doi"] = None
    alignment["note"] = "no DOI assigned"
    return ref, alignment, gpt_record

# ===== Orchestrator (build milestones) =====
def _rgb_to_hex(rgb): return "#{:02X}{:02X}{:02X}".format(*rgb)
def _wcag_luminance(rgb):
    def _ch(v):
        v=v/255.0
        return v/12.92 if v<=0.03928*12.92 else ((v+0.055)/1.055)**2.4
    return 0.2126*_ch(rgb[0]) + 0.7152*_ch(rgb[1]) + 0.0722*_ch(rgb[2])
def _contrast_ratio_with_white(rgb):
    Lc = _wcag_luminance(rgb); Lw = 1.0
    return (Lw + 0.05) / (Lc + 0.05)
def _random_contrasting_color():
    for _ in range(20):
        import colorsys as _cs
        h = random.random(); s = random.uniform(0.65, 1.0); l = random.uniform(0.18, 0.32)
        r,g,b = _cs.hls_to_rgb(h, l, s); rgb=(int(r*255), int(g*255), int(b*255))
        if _contrast_ratio_with_white(rgb) >= 4.5: return _rgb_to_hex(rgb)
    return "#1F2937"

def _format_authors_short(authors: List[str]) -> str:
    if not authors: return ""
    def last_name(a: str) -> str:
        a=a.strip()
        if not a: return ""
        if "," in a: return a.split(",",1)[0].strip()
        toks=a.split(); return toks[-1].strip() if toks else ""
    last_names=[ln for ln in map(last_name, authors) if ln]
    if not last_names: return ""
    if len(last_names)==1: return last_names[0]
    if len(last_names)==2: return f"{last_names[0]} & {last_names[1]}"
    return f"{last_names[0]} et al."

def _citation_text(title: str, date: datetime, authors: List[str], venue: str) -> str:
    yr = date.year; auth=_format_authors_short(authors); core=title.strip()
    if auth and venue: return f"{auth} {yr} — {core} ({venue})"
    if auth: return f"{auth} {yr} — {core}"
    if venue: return f"{yr} — {core} ({venue})"
    return f"{yr} — {core}"

def build_publication_milestones(prompt: str, *, model: str = "gpt-4o-mini",
                                 temperature: float = 0.2, density: float = 0.5,
                                 expand_strength: float = 0.6) -> Dict[str, Any]:
    density = _clamp01(density, 0.5)
    expand_strength = _clamp01(expand_strength, 0.6)

    # 0) Scope expansion
    works.msg("🌐 expanding prompt scope…")
    expansion = expand_prompt_via_gpt(prompt, model=model, temperature=temperature, expand_strength=expand_strength)

    enriched_query_parts = [
        expansion.get("expanded_prompt") or "",
        "KEYWORDS: " + ", ".join(expansion.get("keywords") or []),
        "SYNONYMS: " + ", ".join(expansion.get("synonyms") or []),
        "ENTITIES: " + ", ".join(expansion.get("entities") or []),
    ]
    if expansion.get("time_window"):
        enriched_query_parts.append("TIME_WINDOW: " + expansion["time_window"])
    enriched_query_parts.append("ORIGINAL_PROMPT: " + (prompt or ""))
    enriched_prompt = "\n".join([p for p in enriched_query_parts if p.strip()])

    # 1) Extract refs
    works.msg("🔗 extracting publications (IDs only) …")
    refs = infer_references_via_gpt(enriched_prompt, model=model, temperature=temperature, density=density)
    doi_report = getattr(infer_references_via_gpt, "_last_report", {"invalid_dois": [], "unresolvable_dois": []})

    if not refs:
        s = datetime.now().replace(hour=WORK_START_HOUR, minute=0, second=0, microsecond=0)
        e = s + timedelta(hours=8)
        return {
            "milestones": [],
            "window": {"start": s.isoformat(), "end": e.isoformat()},
            "expansion": expansion,
            "doi_validation_report": doi_report,
            "doi_alignment_report": [],
            "gpt_validation_report": []
        }

    # 2) Align/validate DOI with GPT passes
    works.msg("🧭 aligning & validating DOIs…")
    alignment_records: List[Dict[str, Any]] = []
    gpt_records: List[Dict[str, Any]] = []
    for i, r in enumerate(refs):
        updated, align_rec, gpt_rec = _align_or_fix_doi(r, expansion, mailto=os.getenv("NCBI_EMAIL") or None,
                                                        model=model, temperature=temperature)
        refs[i] = updated
        if align_rec: alignment_records.append(align_rec)
        if gpt_rec: gpt_records.append(gpt_rec)

    # 3) Build timeline points
    refs.sort(key=lambda r: r["date"])
    min_dt, max_dt = refs[0]["date"], refs[-1]["date"]

    out_points: List[Dict[str, Any]] = []
    for r in refs:
        dt = r["date"]
        tx = max(0.0, (dt - min_dt).total_seconds() / 3600.0)
        ty = random.uniform(0.35, 0.65)
        name = _citation_text(r["title"], r["date"], r.get("authors") or [], r.get("venue") or "")
        url = r["url"]
        out_points.append({
            "x": tx,
            "y": ty,
            "type": "milestone",
            "name": name,
            "color": _random_contrasting_color(),
            "date": dt.isoformat(),
            "url": url,
            "abstract_url": _abstract_url(url) or url,
            "doi": r.get("doi")
        })

    return {
        "milestones": out_points,
        "window": {"start": min_dt.isoformat(), "end": max_dt.isoformat()},
        "expansion": expansion,
        "doi_validation_report": doi_report,
        "doi_alignment_report": alignment_records,
        "gpt_validation_report": gpt_records
    }

# ===== Ion entry =====
def _read_param(i: int) -> Any:
    try: return works.param(i)
    except Exception: return None

def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    prompt = _read_param(1)
    model = _read_param(2) or default_model
    temperature = float(_read_param(3) or 0.2)
    density = _clamp01(_read_param(4), 0.5)
    expand_strength = _clamp01(_read_param(5), 0.6)
    if not prompt:
        raise RuntimeError("param(1) required: prompt")
    works.msg("📍 building publication points (scope expansion → strict IDs → DOI alignment + GPT validation)…")
    result = build_publication_milestones(str(prompt), model=str(model),
                                          temperature=temperature, density=density,
                                          expand_strength=expand_strength)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    works.msg("🔧 citation scheduler (expand → extract → validate DOI → GPT judge(s))")
    _main_ion()
