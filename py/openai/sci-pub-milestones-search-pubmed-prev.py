#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Ion Works: PubMed search per milestone (±20 days, Title/Abstract)

Inputs (Ion Works params)
-------------------------
param(1): JSON string like:
  {
    "milestones": [
      {"name":"ADAR editing increases in glioblastoma","date":"2025-09-12T09:00:00", ...},
      ...
    ]
  }
param(2): retmax (optional; default 5)
param(3): email (optional; recommended by NCBI)
param(4): api_key (optional; NCBI E-utilities key)

Output (via works.resolve)
--------------------------
Same structure, with "pubmed_results" added per milestone:
{
  "milestones": [
    {
      "name": "...",
      "date": "YYYY-MM-DDTHH:MM:SS",
      ...
      "pubmed_results": [
        {
          "pmid": "39234567",
          "title": "...",
          "journal": "Nature",
          "pubdate": "2025-09-10",
          "doi": "10.1038/....",
          "url": "https://pubmed.ncbi.nlm.nih.gov/39234567/",
          "abstract_url": "https://pubmed.ncbi.nlm.nih.gov/39234567/?format=abstract",
          "doi_url": "https://doi.org/10.1038/...."
        },
        ...
      ]
    },
    ...
  ]
}
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

# ----- Ion Works shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ----- HTTP (requests) -----
try:
    import requests
except Exception as e:
    raise RuntimeError("This script requires the 'requests' package.") from e

# ----- Config -----
NCBI_EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DEFAULT_RETMAX = 5
REQUESTS_PER_SECOND_NO_KEY = 3  # NCBI guidance without API key
RETRY_COUNT = 3
RETRY_BACKOFF = 1.8  # exponential backoff multiplier

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# ===== Helpers =====
def _rate_limit_delay(has_key: bool) -> float:
    # With an API key, NCBI allows higher throughput; we only rate-limit when no key is provided
    return 0.0 if has_key else 1.0 / REQUESTS_PER_SECOND_NO_KEY

def _iso_to_date(s: str) -> datetime.date:
    # Accepts ISO8601 date/time; normalizes Z to +00:00
    return datetime.fromisoformat((s or "").replace("Z", "+00:00")).date()

def _fmt_pdat(d) -> str:
    # PubMed publication date format
    return d.strftime("%Y/%m/%d")

def _build_query(name_text: str, start, end, extra_terms: Optional[List[str]] = None) -> str:
    """
    Build a PubMed query:
      (name_text)[Title/Abstract] AND each extra term (Title/Abstract) AND date window
    """
    def _ta(s: str) -> str:
        s = (s or "").strip()
        # naive escaping of double-quotes
        s = s.replace('"', '\\"')
        return f'("{s}")[Title/Abstract]' if s else ""

    ta_main = _ta(name_text)
    parts = [ta_main] if ta_main else []

    if extra_terms:
        parts.extend([_ta(t) for t in extra_terms if (t or "").strip()])

    window = f'("{_fmt_pdat(start)}"[Date - Publication] : "{_fmt_pdat(end)}"[Date - Publication])'
    parts.append(window)

    # join with AND, skipping empties
    parts = [p for p in parts if p]
    return " AND ".join(parts) if parts else window

def _request_with_retries(url: str, params: Dict[str, Any], has_key: bool) -> requests.Response:
    delay = _rate_limit_delay(has_key)
    last_exc = None
    for attempt in range(RETRY_COUNT):
        try:
            if delay:
                time.sleep(delay)
            resp = requests.get(url, params=params, timeout=20)
            if resp.status_code == 200:
                return resp
            if resp.status_code == 429:
                # Too many requests — back off more
                time.sleep(max(2.0, delay * 3))
                continue
            if 500 <= resp.status_code < 600:
                # transient server errors
                time.sleep((RETRY_BACKOFF ** attempt) * (delay or 0.5))
                continue
            resp.raise_for_status()
        except Exception as e:
            last_exc = e
            time.sleep((RETRY_BACKOFF ** attempt) * (delay or 0.5))
    if last_exc:
        raise last_exc
    raise RuntimeError("Unreachable retry loop")

def pubmed_esearch(term: str, api_key: Optional[str], email: Optional[str], retmax: int) -> List[str]:
    url = f"{NCBI_EUTILS_BASE}/esearch.fcgi"
    params = {
        "db": "pubmed",
        "term": term,
        "retmode": "json",
        "retmax": str(retmax),
        "sort": "relevance",
    }
    if email:
        params["email"] = email
    if api_key:
        params["api_key"] = api_key
    resp = _request_with_retries(url, params, has_key=bool(api_key))
    data = resp.json()
    return (data.get("esearchresult") or {}).get("idlist") or []

def pubmed_efetch_details(pmids: List[str], api_key: Optional[str], email: Optional[str]) -> Dict[str, Dict[str, Any]]:
    """
    Returns {pmid: {title, journal, pubdate, doi}}
    """
    if not pmids:
        return {}
    url = f"{NCBI_EUTILS_BASE}/efetch.fcgi"
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
    }
    if email:
        params["email"] = email
    if api_key:
        params["api_key"] = api_key
    resp = _request_with_retries(url, params, has_key=bool(api_key))

    import xml.etree.ElementTree as ET
    root = ET.fromstring(resp.text)
    ns = {}
    MONTHS = {"Jan":"01","Feb":"02","Mar":"03","Apr":"04","May":"05","Jun":"06",
              "Jul":"07","Aug":"08","Sep":"09","Oct":"10","Nov":"11","Dec":"12"}

    out: Dict[str, Dict[str, Any]] = {}
    for art in root.findall(".//PubmedArticle", ns):
        pmid_el = art.find(".//PMID", ns)
        if pmid_el is None or not pmid_el.text:
            continue
        pmid = pmid_el.text.strip()

        # Title
        title_el = art.find(".//ArticleTitle", ns)
        title = "".join(title_el.itertext()).strip() if title_el is not None else ""

        # Journal
        journal_el = art.find(".//Journal/Title", ns)
        journal = journal_el.text.strip() if journal_el is not None and journal_el.text else ""

        # PubDate
        y_el = art.find(".//JournalIssue/PubDate/Year", ns)
        m_el = art.find(".//JournalIssue/PubDate/Month", ns)
        d_el = art.find(".//JournalIssue/PubDate/Day", ns)
        medline_el = art.find(".//JournalIssue/PubDate/MedlineDate", ns)
        pubdate = ""
        if y_el is not None and y_el.text:
            y = y_el.text.strip()
            mm = (m_el.text.strip() if m_el is not None and m_el.text else "01")
            dd = (d_el.text.strip() if d_el is not None and d_el.text else "01")
            if len(mm) == 3 and mm.title() in MONTHS:
                mm = MONTHS[mm.title()]
            pubdate = f"{y}-{mm.zfill(2)}-{dd.zfill(2)}"
        elif medline_el is not None and medline_el.text:
            pubdate = medline_el.text.strip()

        # DOI
        doi = ""
        for aid in art.find(".//ArticleIdList", ns) or []:
            if (aid.attrib or {}).get("IdType", "").lower() == "doi" and aid.text:
                doi = aid.text.strip()
                break

        out[pmid] = {
            "title": title,
            "journal": journal,
            "pubdate": pubdate,
            "doi": doi or None,
        }
    return out

def _pubmed_url(pmid: str) -> str:
    return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"

def _abstract_url(pmid: str) -> str:
    return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/?format=abstract"

def _doi_url(doi: Optional[str]) -> Optional[str]:
    return f"https://doi.org/{doi}" if doi else None


def _normalize_content_to_terms(content: Any) -> List[str]:
    """
    content may be:
      - str: one term
      - list/tuple of str: multiple terms
      - else: ignored
    Returns a list of non-empty strings.
    """
    if isinstance(content, str):
        s = content.strip()
        return [s] if s else []
    if isinstance(content, (list, tuple)):
        out = []
        for v in content:
            if isinstance(v, str):
                s = v.strip()
                if s:
                    out.append(s)
        return out
    return []




def search_pubmed_for_points(points: List[Dict[str, Any]], retmax: int,
                             email: Optional[str], api_key: Optional[str],
                             extra_terms: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    augmented: List[Dict[str, Any]] = []
    for p in points:
        name = (p.get("name") or "").strip()
        date_iso = (p.get("date") or "").strip()

        if not name or not date_iso:
            p["pubmed_results"] = []
            augmented.append(p)
            continue

        try:
            center = _iso_to_date(date_iso)
        except Exception:
            works.msg(f"⚠️ Skipping point with invalid date: {date_iso!r}")
            p["pubmed_results"] = []
            augmented.append(p)
            continue

        start = center - timedelta(days=120)
        end = center + timedelta(days=120)
        term = _build_query(name, start, end, extra_terms=extra_terms)

        works.msg(f"🔎 PubMed: {name!r} within {start}..{end}")
        try:
            pmids = pubmed_esearch(term, api_key=api_key, email=email, retmax=retmax)
        except Exception as e:
            works.msg(f"⚠️ ESearch failed: {e}")
            p["pubmed_results"] = []
            augmented.append(p)
            continue

        details: Dict[str, Dict[str, Any]] = {}
        if pmids:
            try:
                details = pubmed_efetch_details(pmids, api_key=api_key, email=email)
            except Exception as e:
                works.msg(f"⚠️ EFetch failed for PMIDs {pmids}: {e}")

        results: List[Dict[str, Any]] = []
        for pmid in pmids:
            info = details.get(pmid) or {}
            rec = {
                "pmid": pmid,
                "title": info.get("title") or "",
                "journal": info.get("journal") or "",
                "pubdate": info.get("pubdate") or "",
                "doi": info.get("doi"),
                "url": _pubmed_url(pmid),
                "abstract_url": _abstract_url(pmid),
                "doi_url": _doi_url(info.get("doi")),
            }
            results.append(rec)

        p["pubmed_results"] = results
        augmented.append(p)
    return augmented

# ===== Ion entry/exit =====
def _read_param(i: int) -> Any:
    try:
        return works.param(i)
    except Exception:
        return None

def _main_ion() -> int:
    raw = _read_param(1)
    content = _read_param(2)  # <-- now used

    if not raw:
        raise RuntimeError("param(1) required: JSON with {'milestones':[...]}")

    try:
        data = raw
    except Exception as e:
        raise RuntimeError(f"param(1) must be valid JSON: {e}")

    if not isinstance(data, dict) or not isinstance(data.get("milestones"), list):
        raise RuntimeError("param(1) must contain 'milestones': [ ... ]")

    # NOTE: if you want to keep your previous param layout, you can leave this:
    retmax = int(_read_param(3) or DEFAULT_RETMAX)

    # Normalize content into a list of extra Title/Abstract terms
    extra_terms = _normalize_content_to_terms(content)

    email = os.getenv("NCBI_EMAIL") or "milton@lajollalabs.com"
    api_key = os.getenv("NCBI_API_KEY") or "0a18730957d33507e54a819c0a4f81b94e08"

    works.msg(
        f"🧪 Searching PubMed for {len(data['milestones'])} milestones "
        f"(retmax={retmax})"
        + (f" with extra terms: {extra_terms!r}" if extra_terms else "")
    )

    augmented = search_pubmed_for_points(
        data["milestones"],
        retmax=retmax,
        email=email,
        api_key=api_key,
        extra_terms=extra_terms,   # <-- pass content here
    )

    out = dict(data)
    out["milestones"] = augmented
    works.resolve(out)
    return 0


if __name__ == "__main__":
    works.msg("🔧 Ion Works: PubMed search per milestone (±20 days)")
    _main_ion()
