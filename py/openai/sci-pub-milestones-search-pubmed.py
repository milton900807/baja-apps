#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Milestones (JSON) → enrich using NAME + DATE (no DOI required)
- Input param(1): JSON object with {"milestones":[ ... ], "window": {...}}
- For each milestone, use its "name" and "date" to search PubMed (±120 days).
- If PubMed misses, fall back to Crossref bibliographic search with a date window.
- Output: same JSON with each milestone augmented in-place:
  title, abstract, authors, published_date, online_date, pmid, pubmed_url,
  doi (if found), doi_url, publisher_url, source ("pubmed"|"crossref"), lookup_error (if any).

Optional:
  param(2): email (for NCBI; recommended)
  param(3): api_key (NCBI E-utilities key)
"""

import os
import re
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from urllib.parse import urlencode

# ----- Ion Works shim -----
try:
    from ion import works  # type: ignore
except Exception:
    class _Shim:
        def msg(self, s: str) -> None: print(f"IONWORKS:MSG:{s}")
        def resolve(self, obj: Any) -> None: print(json.dumps(obj, indent=2, ensure_ascii=False))
        def param(self, i: int) -> Any: return None
    works = _Shim()  # type: ignore

# ----- HTTP -----
try:
    import requests
except Exception as e:
    raise RuntimeError("This script requires the 'requests' package.") from e

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

NCBI_EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
CROSSREF_WORKS = "https://api.crossref.org/works"

WINDOW_DAYS = 120
RE_DOI = re.compile(r'^10\.\d{4,9}/[^\s"<>]+$', re.IGNORECASE)

# ------------------ Helpers ------------------
def _clean(s: Optional[str]) -> str:
    return (s or "").strip()

def _iso_date_only(dt_iso: str) -> datetime.date:
    return datetime.fromisoformat(dt_iso.replace("Z", "+00:00")).date()

def _date_window(center_iso: str, days: int = WINDOW_DAYS) -> Tuple[str, str]:
    c = _iso_date_only(center_iso)
    a = (c - timedelta(days=days)).strftime("%Y/%m/%d")
    b = (c + timedelta(days=days)).strftime("%Y/%m/%d")
    return a, b

def _strip_paren_trailing_journal(title: str) -> str:
    # remove " (Journal...)" at end if present
    return re.sub(r'\s*\([^)]+\)\s*$', '', title).strip()

def _parse_name_to_title_and_first_author(name: str) -> Tuple[str, Optional[str]]:
    """
    Expected formats like:
      "Baden et al. 2020 — Safety and Immunogenicity of a SARS-CoV-2 mRNA Vaccine (NEJM)"
      "Polack et al. 2020 – Efficacy and Safety of the BNT162b2 mRNA Covid-19 Vaccine (NEJM)"
    We'll try to split on an em/en dash and take the right side as the title.
    If that fails, fall back to the whole string but remove journal parentheses.
    Also try to extract a first author before 'et al.' if present.
    """
    first_author = None
    m = re.search(r'^([A-Za-z\-\' ]+?)\s+et\s+al\.', name, re.IGNORECASE)
    if m:
        first_author = m.group(1).strip()

    # Split on em dash / en dash / hyphen flanked by spaces
    parts = re.split(r'\s[—–-]\s', name)
    if len(parts) >= 2:
        title = _strip_paren_trailing_journal(parts[-1])
    else:
        # try removing leading "X et al. 2020" chunk
        title = re.sub(r'^[^—–-]+?\d{4}\s[—–-]\s', '', name).strip()
        if not title:
            title = _strip_paren_trailing_journal(name)

    # remove the leading "Lastname et al. YEAR — " if it stuck around
    title = re.sub(r'^[A-Za-z][^—–-]+[—–-]\s*', '', title).strip()
    # collapse multiple spaces
    title = re.sub(r'\s+', ' ', title).strip()
    return title, first_author

_STOP = {
    "the","a","an","of","and","in","on","for","to","with","by","from","at","as",
    "using","via","based","into","over","under","about","without","within","covid19","sarscov2"
}

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

def _doi_url(doi: Optional[str]) -> Optional[str]:
    return f"https://doi.org/{doi}" if (doi and RE_DOI.match(doi)) else None

def _strip_jats(abstract: str) -> str:
    if not abstract: return ""
    txt = re.sub(r'<[^>]+>', ' ', abstract)
    return re.sub(r'\s+', ' ', txt).strip()

# ------------------ PubMed search by name + date ------------------
def _build_pubmed_term(title: str, first_author: Optional[str], start_ymd: str, end_ymd: str) -> str:
    title_q = f'("{title}")[Title]'
    extra = []
    if first_author:
        extra.append(f'("{first_author}")[Title/Abstract]')
    window = f'("{start_ymd}"[Date - Publication] : "{end_ymd}"[Date - Publication])'
    parts = [title_q] + extra + [window]
    return " AND ".join(parts)

def pubmed_esearch_title_date(title: str, first_author: Optional[str],
                              start_ymd: str, end_ymd: str,
                              email: Optional[str], api_key: Optional[str],
                              retmax: int = 5) -> List[str]:
    params = {
        "db": "pubmed",
        "retmode": "json",
        "retmax": str(retmax),
        "sort": "relevance",
        "term": _build_pubmed_term(title, first_author, start_ymd, end_ymd),
    }
    if email: params["email"] = email
    if api_key: params["api_key"] = api_key
    r = requests.get(f"{NCBI_EUTILS}/esearch.fcgi", params=params, timeout=20)
    r.raise_for_status()
    data = r.json()
    return (data.get("esearchresult") or {}).get("idlist") or []

def pubmed_efetch(pmids: List[str], email: Optional[str], api_key: Optional[str]) -> Dict[str, Dict[str, Any]]:
    if not pmids: return {}
    params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"}
    if email: params["email"] = email
    if api_key: params["api_key"] = api_key
    r = requests.get(f"{NCBI_EUTILS}/efetch.fcgi", params=params, timeout=20)
    r.raise_for_status()

    import xml.etree.ElementTree as ET
    root = ET.fromstring(r.text)
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

        # Abstract
        abs_el = art.find(".//Abstract", ns)
        abstract = ""
        if abs_el is not None:
            abstract = " ".join("".join(a.itertext()).strip() for a in abs_el.findall(".//AbstractText"))
            abstract = abstract.strip() or ""

        # Journal
        journal_el = art.find(".//Journal/Title", ns)
        journal = journal_el.text.strip() if journal_el is not None and journal_el.text else ""

        # Date
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
            # best-effort year
            m = re.search(r'(\d{4})', medline_el.text.strip())
            pubdate = f"{m.group(1)}-01-01" if m else ""

        # DOI
        doi = None
        for aid in art.findall(".//ArticleIdList/ArticleId", ns) or []:
            if (aid.attrib or {}).get("IdType", "").lower() == "doi" and aid.text:
                doi = aid.text.strip()
                break

        # Authors
        authors: List[str] = []
        for a in art.findall(".//AuthorList/Author", ns):
            last = (a.findtext("LastName") or "").strip()
            fore = (a.findtext("ForeName") or "").strip()
            init = (a.findtext("Initials") or "").strip()
            suffix = (a.findtext("Suffix") or "").strip()
            if last or fore or init:
                if fore:
                    authors.append(f"{last}, {fore}".strip(", "))
                elif init:
                    authors.append(f"{last}, {init}".strip(", "))
                else:
                    authors.append(last)

        out[pmid] = {
            "pmid": pmid,
            "title": title,
            "abstract": abstract or None,
            "journal": journal,
            "pubdate": pubdate or None,
            "doi": doi or None,
            "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "doi_url": _doi_url(doi),
        }
    return out

# ------------------ Crossref fallback by name + date ------------------
def crossref_query_biblio(name_title: str, start_iso: str, end_iso: str, mailto: Optional[str]) -> Optional[Dict[str, Any]]:
    headers = {"User-Agent": f"milestone-name-date-enricher/1.0 ({mailto or 'no-email'})"}
    # Crossref supports filter: from-pub-date, until-pub-date; query.bibliographic
    params = {
        "query.bibliographic": name_title,
        "filter": f"from-pub-date:{start_iso},until-pub-date:{end_iso}",
        "sort": "relevance",
        "rows": "5",
    }
    r = requests.get(CROSSREF_WORKS, headers=headers, params=params, timeout=20)
    r.raise_for_status()
    msg = (r.json() or {}).get("message") or {}
    items = msg.get("items") or []
    if not items:
        return None

    # Choose the most similar title to our parsed title
    best = None
    best_score = -1.0
    for it in items:
        t = " ".join(it.get("title") or []).strip()
        score = _title_similarity(name_title, t)
        if score > best_score:
            best_score = score
            best = it
    if not best:
        return None

    # Build normalized record
    title = " ".join(best.get("title") or []).strip() or None
    abstract = _strip_jats(best.get("abstract") or "") or None
    doi = best.get("DOI") or None
    authors: List[str] = []
    for a in best.get("author") or []:
        last = _clean(a.get("family"))
        first = _clean(a.get("given"))
        if last or first:
            authors.append(f"{last}, {first}".strip(", "))
    def _best_date(parts):
        if not parts or not parts.get("date-parts"): return None
        dp = parts["date-parts"][0]
        y = dp[0]; m = dp[1] if len(dp)>1 else 1; d = dp[2] if len(dp)>2 else 1
        try:
            return datetime(y, m, d).date().isoformat()
        except Exception:
            try:
                return datetime(y, m or 1, 1).date().isoformat()
            except Exception:
                return f"{y:04d}-01-01"
    pubdate = _best_date(best.get("published-print") or {}) or \
              _best_date(best.get("published-online") or {}) or \
              _best_date(best.get("issued") or {})

    return {
        "pmid": None,
        "title": title,
        "abstract": abstract,
        "authors": authors,
        "published_date": pubdate,
        "online_date": None,
        "doi": doi,
        "pubmed_url": None,
        "doi_url": _doi_url(doi),
        "publisher_url": _clean(best.get("URL")),
        "source": "crossref",
    }

# ------------------ Resolver by NAME + DATE ------------------
def resolve_by_name_and_date(name: str, date_iso: str, email: Optional[str], api_key: Optional[str]) -> Dict[str, Any]:
    title_guess, first_author = _parse_name_to_title_and_first_author(name)
    if not title_guess:
        return {"error": "Could not parse a title from milestone name"}

    start, end = _date_window(date_iso)
    works.msg(f"🔎 PubMed title match within {start}..{end}: {title_guess!r}" + (f" (+ {first_author})" if first_author else ""))

    # PubMed search
    pmids = []
    try:
        pmids = pubmed_esearch_title_date(title_guess, first_author, start, end, email=email, api_key=api_key, retmax=6)
    except Exception as e:
        works.msg(f"⚠️ PubMed ESearch failed: {e}")

    if pmids:
        try:
            details = pubmed_efetch(pmids, email=email, api_key=api_key)
            # pick best title match
            best = None
            best_score = -1.0
            for pmid in pmids:
                rec = details.get(pmid)
                if not rec: continue
                score = _title_similarity(title_guess, rec.get("title") or "")
                if score > best_score:
                    best = rec; best_score = score
            if best:
                return {
                    "pmid": best["pmid"],
                    "title": best.get("title"),
                    "abstract": best.get("abstract"),
                    "authors": [],  # authors already in 'title'? fetch separately if needed
                    "published_date": best.get("pubdate"),
                    "online_date": None,
                    "doi": best.get("doi"),
                    "pubmed_url": best.get("pubmed_url"),
                    "doi_url": best.get("doi_url"),
                    "publisher_url": None,
                    "source": "pubmed",
                }
        except Exception as e:
            works.msg(f"⚠️ PubMed EFetch failed: {e}")

    # Crossref fallback
    try:
        # use ISO y-m-d strings from window (replace slashes)
        start_iso = start.replace("/", "-")
        end_iso = end.replace("/", "-")
        cr = crossref_query_biblio(title_guess, start_iso, end_iso, mailto=email)
        if cr:
            return cr
    except Exception as e:
        works.msg(f"⚠️ Crossref fallback failed: {e}")

    return {"error": "No match found in PubMed or Crossref"}

# ------------------ Main enrich ------------------
def enrich_milestones(data: Dict[str, Any], email: Optional[str], api_key: Optional[str]) -> Dict[str, Any]:
    out = dict(data)
    out_ms = []
    for m in data.get("milestones", []):
        m2 = dict(m)
        name = _clean(m2.get("name"))
        date_iso = _clean(m2.get("date"))
        if not name or not date_iso:
            m2["lookup_error"] = "Missing name or date"
            out_ms.append(m2); continue

        rec = resolve_by_name_and_date(name, date_iso, email=email, api_key=api_key)
        if rec.get("error"):
            m2["lookup_error"] = rec["error"]
        else:
            m2["title"] = rec.get("title")
            m2["abstract"] = rec.get("abstract")
            m2["authors"] = rec.get("authors") or []
            m2["published_date"] = rec.get("published_date")
            m2["online_date"] = rec.get("online_date")
            m2["pmid"] = rec.get("pmid")
            m2["pubmed_url"] = rec.get("pubmed_url")
            m2["doi"] = rec.get("doi")
            m2["doi_url"] = rec.get("doi_url")
            m2["publisher_url"] = rec.get("publisher_url")
            m2["source"] = rec.get("source")

        out_ms.append(m2)

    out["milestones"] = out_ms
    return out

# ------------------ Ion entry ------------------
def _read_param(i: int) -> Any:
    try: return works.param(i)
    except Exception: return None

def _main_ion() -> int:
    raw = _read_param(1)
    email = _read_param(2) or os.getenv("NCBI_EMAIL") or None
    api_key = _read_param(3) or os.getenv("NCBI_API_KEY") or None

    if not raw:
        raise RuntimeError("param(1) required: JSON object with 'milestones'")

    if not isinstance(raw, dict):
        try:
            data = json.loads(str(raw))
        except Exception as e:
            raise RuntimeError(f"param(1) must be a JSON object: {e}")
    else:
        data = raw

    if not isinstance(data.get("milestones"), list):
        raise RuntimeError("param(1) must contain 'milestones': [ ... ]")

    works.msg(f"🧬 Enriching {len(data['milestones'])} milestones via NAME+DATE …")
    enriched = enrich_milestones(data, email=email, api_key=api_key)
    works.resolve(enriched)
    return 0

if __name__ == "__main__":
    works.msg("🔧 Milestone enricher (NAME+DATE → PubMed; Crossref fallback)")
    _main_ion()
