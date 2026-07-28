#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
Prompt → ChatGPT refines into a structured PubMed query plan → NCBI PubMed query
Loosening adds ORs iteratively; we try at least 6 iterations (7 with RAW) before failing.

Env:
- OPENAI_API_KEY: API key for OpenAI
- OPENAI_MODEL: (optional) model name, default "gpt-4o-mini"
- NCBI_EMAIL / NCBI_API_KEY: optional, forwarded to NCBI

Inputs
------
param(1): prompt (free-text)
param(2): email (optional; recommended by NCBI)
param(3): api_key (optional; NCBI E-utilities key)
param(4): retmax (optional; default 100)

Output
------
{
  "results": { "milestones": [ ... ] },
  "window": { "start": ..., "end": ... },
  "debug": { ... }   # only when no hits
}
"""

import os
import re
import json
import random
import logging
from typing import Any, Dict, List, Optional, Tuple, Iterable
from datetime import datetime, date

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
RE_DOI = re.compile(r'^10\.\d{4,9}/[^\s"<>]+$', re.IGNORECASE)

# ===================== ChatGPT → structured query plan =====================

def chatgpt_refine_query(user_prompt: str) -> Optional[Dict[str, Any]]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    system = (
        "You turn biomedical prompts into a focused PubMed search plan. "
        "Respond ONLY with compact JSON matching the schema. No prose."
    )
    user = f"""
Prompt: {user_prompt}

Emit JSON with keys:
phrases, must_terms, mesh_terms, exclude_terms, date_from, date_to, species, article_types, sort, retmax.
Example:
{{
  "phrases": ["adenosine-to-inosine editing", "TDP-43"],
  "must_terms": ["ATG7", "splicing"],
  "mesh_terms": ["Autophagy", "RNA-Binding Proteins"],
  "exclude_terms": ["yeast", "Drosophila"],
  "date_from": "2015",
  "date_to": "",
  "species": "Humans",
  "article_types": ["Clinical Trial", "Review"],
  "sort": "relevance",
  "retmax": 100
}}
"""
    try:
        try:
            from openai import OpenAI  # type: ignore
            client = OpenAI(api_key=api_key)
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": user}],
                temperature=0.0,
                max_tokens=400,
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content
        except Exception:
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.0,
                "max_tokens": 400,
                "response_format": {"type": "json_object"},
            }
            r = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=60)
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]

        plan = json.loads(content)

        def _as_list(x):
            if not x: return []
            if isinstance(x, str): return [x]
            if isinstance(x, list): return [str(t) for t in x if str(t).strip()]
            return []

        plan_norm = {
            "phrases": _as_list(plan.get("phrases")),
            "must_terms": _as_list(plan.get("must_terms")),
            "mesh_terms": _as_list(plan.get("mesh_terms")),
            "exclude_terms": _as_list(plan.get("exclude_terms")),
            "date_from": (plan.get("date_from") or "").strip(),
            "date_to": (plan.get("date_to") or "").strip(),
            "species": (plan.get("species") or "").strip(),
            "article_types": _as_list(plan.get("article_types")),
            "sort": (plan.get("sort") or "relevance").strip().lower(),
            "retmax": int(plan.get("retmax") or 0) or None,
        }
        return plan_norm
    except Exception as e:
        works.msg(f"⚠️ ChatGPT refinement failed: {e}")
        return None

# ===================== Formatting helpers =====================

def _fmt_all_fields(s: str) -> str:
    s = s.replace('"', '\\"').strip()
    return f'("{s}")[All Fields]' if s else ""

def _fmt_phrase(s: str) -> str:
    s = s.replace('"', '\\"').strip()
    return f'"{s}"[All Fields]' if s else ""

def _fmt_mesh(s: str) -> str:
    s = s.replace('"', '\\"').strip()
    return f'"{s}"[MeSH Terms]' if s else ""

def _join_or(parts: List[str]) -> str:
    parts = [p for p in parts if p]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return "(" + " OR ".join(parts) + ")"

def _or_block(items: List[str], fmt_fn) -> str:
    return _join_or([fmt_fn(x) for x in items if str(x).strip()])

# ===================== Build from plan (configurable) =====================

def build_pubmed_query_from_plan(
    plan: Dict[str, Any],
    fallback_term: str,
    *,
    include_excludes: bool = True,
    include_mesh: bool = True,
    include_species: bool = True,
    include_article_types: bool = True,
    include_date_window: bool = True,
    override_sort: Optional[str] = None,
    or_phrases: bool = False,
    or_must_terms: bool = False
) -> Tuple[str, Dict[str, str]]:
    """
    Build a PubMed 'term' with fine-grained controls including OR-grouping for phrases/must_terms.
    """
    parts: List[str] = []

    phrases = plan.get("phrases", []) or []
    must_terms = plan.get("must_terms", []) or []
    mesh_terms = plan.get("mesh_terms", []) or []

    # Phrases
    if or_phrases:
        pb = _or_block(phrases, _fmt_phrase)
        if pb: parts.append(pb)
    else:
        parts += [_fmt_phrase(ph) for ph in phrases if ph]

    # Must terms
    if or_must_terms:
        mb = _or_block(must_terms, _fmt_all_fields)
        if mb: parts.append(mb)
    else:
        parts += [_fmt_all_fields(t) for t in must_terms if t]

    # MeSH
    if include_mesh:
        parts += [_fmt_mesh(m) for m in mesh_terms if m]

    # Species
    if include_species and plan.get("species"):
        parts.append(_fmt_mesh(plan["species"]))

    # Article types
    if include_article_types:
        for at in plan.get("article_types", []):
            at = at.strip()
            if at:
                parts.append(f'"{at}"[Publication Type]')

    # Excludes
    if include_excludes:
        for ex in plan.get("exclude_terms", []):
            ex = ex.strip()
            if ex:
                parts.append(f'NOT {_fmt_all_fields(ex)}')

    term = " AND ".join([p for p in parts if p]) or fallback_term

    # Extra ESearch params
    extra: Dict[str, str] = {}
    if include_date_window:
        df = (plan.get("date_from") or "").strip()
        dt = (plan.get("date_to") or "").strip()
        if df or dt:
            extra["datetype"] = "pdat"
            if df: extra["mindate"] = df
            if dt: extra["maxdate"] = dt

    sort = (override_sort or plan.get("sort") or "relevance").lower()
    extra["sort"] = sort if sort in {"relevance", "pubdate", "author", "journal"} else "relevance"
    return term, extra

# ===================== Legacy tokenizer (fallback) =====================

_STOPWORDS = {
    "the","a","an","of","and","in","on","for","to","with","by","from","at","as",
    "using","via","based","into","over","under","about","without","within","vs",
    "between","among","against","analysis","study","trial","effect","effects",
    "model","models","data","new","novel"
}

def _extract_phrases(prompt: str) -> List[str]:
    quotes = re.findall(r'“([^”]+)”|\"([^\"]+)\"', prompt)
    res: List[str] = []
    for a, b in quotes:
        res.append(a or b)
    return [p.strip() for p in res if p and p.strip()]

def _token_keywords(prompt: str) -> List[str]:
    s = re.sub(r'[\(\)\[\]\{\},;:]', ' ', prompt)
    toks = re.findall(r"[A-Za-z0-9][A-Za-z0-9\-\/\.]*", s)
    out: List[str] = []
    for t in toks:
        tl = t.lower()
        if tl in _STOPWORDS:
            continue
        if t in {'"', "''", "``"}:
            continue
        out.append(t.strip())
    seen = set(); uniq: List[str] = []
    for t in out:
        key = t.lower()
        if key not in seen:
            uniq.append(t); seen.add(key)
    return uniq

def build_pubmed_query_all_fields(prompt: str) -> str:
    phrases = _extract_phrases(prompt)
    keywords = _token_keywords(prompt)
    parts: List[str] = []
    parts += [_fmt_phrase(p) for p in phrases]
    parts += [_fmt_all_fields(k) for k in keywords]
    if not parts:
        parts = [_fmt_all_fields(prompt)]
    return " AND ".join([p for p in parts if p])

# ===================== PubMed =====================

def pubmed_esearch(term: str, email: Optional[str], api_key: Optional[str], retmax: int, extra: Optional[Dict[str, str]] = None) -> List[str]:
    params = {
        "db": "pubmed",
        "term": term,
        "retmode": "json",
        "retmax": str(retmax),
    }
    if email: params["email"] = email
    if api_key: params["api_key"] = api_key
    if extra:
        params.update({k: v for k, v in extra.items() if v})

    r = requests.get(f"{NCBI_EUTILS}/esearch.fcgi", params=params, timeout=25)
    r.raise_for_status()
    data = r.json()
    return (data.get("esearchresult") or {}).get("idlist") or []

def pubmed_efetch_details(pmids: List[str], email: Optional[str], api_key: Optional[str]) -> List[Dict[str, Any]]:
    if not pmids: return []
    params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "xml"}
    if email: params["email"] = email
    if api_key: params["api_key"] = api_key
    r = requests.get(f"{NCBI_EUTILS}/efetch.fcgi", params=params, timeout=30)
    r.raise_for_status()

    import xml.etree.ElementTree as ET
    root = ET.fromstring(r.text)
    ns = {}
    MONTHS = {"Jan":"01","Feb":"02","Mar":"03","Apr":"04","May":"05","Jun":"06",
              "Jul":"07","Aug":"08","Sep":"09","Oct":"10","Nov":"11","Dec":"12"}

    out: List[Dict[str, Any]] = []
    for art in root.findall(".//PubmedArticle", ns):
        pmid_el = art.find(".//PMID", ns)
        if pmid_el is None or not pmid_el.text:
            continue
        pmid = pmid_el.text.strip()

        title_el = art.find(".//ArticleTitle", ns)
        title = "".join(title_el.itertext()).strip() if title_el is not None else ""

        abs_el = art.find(".//Abstract", ns)
        abstract = ""
        if abs_el is not None:
            abstract = " ".join("".join(a.itertext()).strip() for a in abs_el.findall(".//AbstractText"))
            abstract = abstract.strip()

        journal_el = art.find(".//Journal/Title", ns)
        journal = journal_el.text.strip() if journal_el is not None and journal_el.text else ""

        # Publication date
        y_el = art.find(".//JournalIssue/PubDate/Year", ns)
        m_el = art.find(".//JournalIssue/PubDate/Month", ns)
        d_el = art.find(".//JournalIssue/PubDate/Day", ns)
        med_el= art.find(".//JournalIssue/PubDate/MedlineDate", ns)
        pubdate = ""
        if y_el is not None and y_el.text:
            y = y_el.text.strip()
            mm = (m_el.text.strip() if m_el is not None and m_el.text else "01")
            dd = (d_el.text.strip() if d_el is not None and d_el.text else "01")
            if len(mm) == 3 and mm.title() in MONTHS:
                mm = MONTHS[mm.title()]
            pubdate = f"{y}-{mm.zfill(2)}-{dd.zfill(2)}"
        elif med_el is not None and med_el.text:
            m = re.search(r'(\d{4})', med_el.text.strip())
            pubdate = f"{m.group(1)}-01-01" if m else ""

        # DOI
        doi = None
        for aid in art.findall(".//ArticleIdList/ArticleId", ns) or []:
            if (aid.attrib or {}).get("IdType", "").lower() == "doi" and aid.text:
                doi = aid.text.strip()
                break

        # Authors + Affiliations
        authors: List[str] = []
        affiliations: List[str] = []

        def _dedupe_preserve_order(items: List[str]) -> List[str]:
            seen = set()
            out = []
            for x in items:
                xl = x.strip()
                if xl and xl not in seen:
                    seen.add(xl)
                    out.append(xl)
            return out

        for a in art.findall(".//AuthorList/Author", ns):
            last   = (a.findtext("LastName") or "").strip()
            fore   = (a.findtext("ForeName") or "").strip()
            init   = (a.findtext("Initials") or "").strip()
            suffix = (a.findtext("Suffix") or "").strip()
            coll   = (a.findtext("CollectiveName") or "").strip()

            if last or fore or init:
                if fore:
                    nm = f"{last}, {fore}".strip(", ")
                elif init:
                    nm = f"{last}, {init}".strip(", ")
                else:
                    nm = last
                if suffix:
                    nm = f"{nm} {suffix}".strip()
                if nm:
                    authors.append(nm)
            elif coll:
                authors.append(coll)

            for aff in a.findall(".//AffiliationInfo/Affiliation", ns):
                if aff is not None:
                    txt = "".join(aff.itertext()).strip()
                    if txt:
                        affiliations.append(txt)

        affiliations = _dedupe_preserve_order(affiliations)

        out.append({
            "pmid": pmid,
            "title": title or None,
            "abstract": abstract or None,
            "authors": authors,
            "affiliations": affiliations,
            "journal": journal or None,
            "pubdate": pubdate or None,
            "doi": doi or None,
            "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "abstract_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/?format=abstract",
            "doi_url": (f"https://doi.org/{doi}" if (doi and RE_DOI.match(doi)) else None),
        })
    return out

# ===================== Milestone shaping =====================

def _parse_pubdate_to_date(pubdate: Optional[str]) -> Optional[date]:
    if not pubdate:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            dt = datetime.strptime(pubdate, fmt)
            if fmt == "%Y":
                return date(dt.year, 1, 1)
            if fmt == "%Y-%m":
                return date(dt.year, dt.month, 1)
            return dt.date()
        except Exception:
            pass
    return None

def _wcag_luminance(rgb):
    def _ch(v):
        v = v/255.0
        return v/12.92 if v <= 0.03928*12.92 else ((v+0.055)/1.055)**2.4
    return 0.2126*_ch(rgb[0]) + 0.7152*_ch(rgb[1]) + 0.0722*_ch(rgb[2])

def _contrast_ratio_with_white(rgb):
    Lc = _wcag_luminance(rgb); Lw = 1.0
    return (Lw + 0.05) / (Lc + 0.05)

def _rgb_to_hex(rgb): return "#{:02X}{:02X}{:02X}".format(*rgb)

def _random_contrasting_color():
    for _ in range(20):
        import colorsys as _cs
        h = random.random(); s = random.uniform(0.65, 1.0); l = random.uniform(0.18, 0.32)
        r,g,b = _cs.hls_to_rgb(h, l, s); rgb=(int(r*255), int(g*255), int(b*255))
        if _contrast_ratio_with_white(rgb) >= 4.5: return _rgb_to_hex(rgb)
    return "#1F2937"

def _build_milestones_and_window(prompt: str, efetch_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    parsed_dates: List[Optional[date]] = [_parse_pubdate_to_date(r.get("pubdate")) for r in efetch_rows]
    valid_dates = [d for d in parsed_dates if d is not None]
    base_date = min(valid_dates) if valid_dates else None
    max_date = max(valid_dates) if valid_dates else None

    milestones: List[Dict[str, Any]] = []
    for idx, (rec, d) in enumerate(zip(efetch_rows, parsed_dates)):
        if base_date and d:
            x_val = max(0.0, (datetime.combine(d, datetime.min.time()) - datetime.combine(base_date, datetime.min.time())).total_seconds() / 3600.0)
        else:
            x_val = float(idx) * 24.0

        y_val = random.uniform(0.35, 0.65)
        date_iso = f"{d.strftime('%Y-%m-%d')}T00:00:00" if d else None

        milestones.append({
            "x": x_val,
            "y": y_val,
            "type": "milestone",
            "name": rec.get("title"),
            "color": _random_contrasting_color(),
            "abstract": rec.get("abstract"),
            "authors": rec.get("authors"),
            "affiliations": rec.get("affiliations"),
            "date": date_iso,
            "url": rec.get("pubmed_url"),
            "title": rec.get("title"),
            "journal": rec.get("journal"),
            "pubdate": rec.get("pubdate"),
            "doi": rec.get("doi"),
            "abstract_url": rec.get("abstract_url"),
            "doi_url": rec.get("doi_url"),
        })

    window = {
        "start": f"{base_date.strftime('%Y-%m-%d')}T00:00:00" if base_date else None,
        "end":   f"{max_date.strftime('%Y-%m-%d')}T00:00:00" if max_date else None,
    }
    return {"results": {"milestones": milestones}, "window": window}

# ===================== OR-based relaxation ladder (≥6 iterations) =====================

def _raw_keyword_term(prompt: str) -> str:
    """Return just space-separated keywords, no field tags, no quotes, no boolean operators."""
    kws = _token_keywords(prompt)
    if not kws:
        return " ".join(re.findall(r"\S+", prompt))
    return " ".join(kws)

def build_pubmed_query_relaxed(
    plan: Optional[Dict[str, Any]],
    fallback_term: str,
    step: int,
) -> Tuple[str, Dict[str, str], str]:
    """
    step 0..6 are increasingly relaxed with OR groups; step 7 is RAW fallback.
    Returns (term, extras, label).
    If no plan, we synthesize similar behavior using the fallback and prompt tokens.
    """
    if not plan:
        # Emulate steps without a plan using fallback + heuristic tokens
        if step == 0:
            return fallback_term, {"sort": "relevance"}, "legacy strict (phrases+keywords)"
        if step == 1:
            # Allow OR within phrases if >1 (legacy approximation)
            phrases = _extract_phrases(fallback_term)
            pb = _join_or([_fmt_phrase(p) for p in phrases]) if phrases else ""
            term = " AND ".join([x for x in [pb] if x]) or fallback_term
            return term, {"sort": "relevance"}, "legacy OR(phrases)"
        if step == 2:
            # OR keywords
            kws = _token_keywords(fallback_term)
            kb = _join_or([_fmt_all_fields(k) for k in kws]) if kws else ""
            term = " AND ".join([x for x in [kb] if x]) or fallback_term
            return term, {"sort": "relevance"}, "legacy OR(keywords)"
        if step == 3:
            # OR(phrases ∪ keywords)
            phrases = _extract_phrases(fallback_term)
            kws = _token_keywords(fallback_term)
            block = _join_or([_fmt_phrase(p) for p in phrases] + [_fmt_all_fields(k) for k in kws])
            return (block or fallback_term), {"sort": "relevance"}, "legacy OR(all)"
        if step == 4:
            return fallback_term, {"sort": "pubdate"}, "legacy sort=pubdate"
        if step == 5:
            return fallback_term, {"sort": "relevance"}, "legacy (broad repeat)"
        if step >= 6:
            return _raw_keyword_term(fallback_term), {"sort": "relevance"}, "RAW KEYWORDS (no tags/operators)"

    # With a plan
    if step == 0:
        return build_pubmed_query_from_plan(plan, fallback_term, include_excludes=True, include_article_types=True, include_species=True, include_mesh=True, include_date_window=True, or_phrases=False, or_must_terms=False) + ("strict plan",)
    if step == 1:
        return build_pubmed_query_from_plan(plan, fallback_term, include_excludes=False, include_article_types=True, include_species=True, include_mesh=True, include_date_window=True, or_phrases=False, or_must_terms=False) + ("no excludes",)
    if step == 2:
        return build_pubmed_query_from_plan(plan, fallback_term, include_excludes=False, include_article_types=True, include_species=True, include_mesh=True, include_date_window=True, or_phrases=True, or_must_terms=False) + ("OR(phrases) + constraints",)
    if step == 3:
        return build_pubmed_query_from_plan(plan, fallback_term, include_excludes=False, include_article_types=True, include_species=True, include_mesh=True, include_date_window=True, or_phrases=True, or_must_terms=True) + ("OR(phrases) + OR(must_terms) + constraints",)
    if step == 4:
        return build_pubmed_query_from_plan(plan, fallback_term, include_excludes=False, include_article_types=False, include_species=False, include_mesh=True, include_date_window=True, or_phrases=True, or_must_terms=True) + ("drop article types & species; keep MeSH & dates; OR blocks on",)
    if step == 5:
        return build_pubmed_query_from_plan(plan, fallback_term, include_excludes=False, include_article_types=False, include_species=False, include_mesh=False, include_date_window=False, or_phrases=True, or_must_terms=True) + ("drop MeSH & dates; OR blocks on",)
    if step == 6:
        # Big OR over phrases + must_terms + mesh (as All Fields) to catch anything
        phrases = plan.get("phrases", []) or []
        musts = plan.get("must_terms", []) or []
        meshes = plan.get("mesh_terms", []) or []
        block = _join_or([_fmt_phrase(p) for p in phrases] +
                         [_fmt_all_fields(t) for t in musts] +
                         [_fmt_all_fields(m) for m in meshes])
        term = block or fallback_term
        return term, {"sort": "pubdate"}, "mega OR(phrases ∪ must_terms ∪ MeSH as All Fields), no extras"
    # step >= 7
    return _raw_keyword_term(" ".join(plan.get("phrases", []) + plan.get("must_terms", []))) or _raw_keyword_term(fallback_term), {"sort": "relevance"}, "RAW KEYWORDS (no tags/operators)"

def iter_or_relaxations_with_final_raw(
    plan: Optional[Dict[str, Any]],
    fallback_term: str
) -> Iterable[Tuple[str, Dict[str, str], str]]:
    """
    Yield steps 0..6 (≥6 iterations), step 7 is final RAW keywords.
    """
    for step in range(0, 8):  # 0..7 inclusive
        term, extras, label = build_pubmed_query_relaxed(plan, fallback_term, step)
        yield term, extras, label

# ===================== Orchestrator =====================

def run_pubmed_general_search(prompt: str, email: Optional[str], api_key: Optional[str], retmax: int = 100) -> Dict[str, Any]:
    plan = chatgpt_refine_query(prompt)
    fallback_term = build_pubmed_query_all_fields(prompt)

    if plan and plan.get("retmax"):
        try:
            retmax = max(int(plan["retmax"]), int(retmax))
        except Exception:
            pass

    works.msg("🔧 Strategy: iterative OR-loosening (≥6 steps) + final RAW keywords.")
    last_term = None
    last_extra = None
    last_label = None
    pmids: List[str] = []

    attempts = 0

    # Run 8 attempts: 0..6 with OR relaxations, then 7 RAW keywords
    for term, extra_params, label in iter_or_relaxations_with_final_raw(plan, fallback_term):
        last_term, last_extra, last_label = term, extra_params, label
        attempts += 1

        works.msg(f"🔎 Attempt {attempts}: {label}")
        works.msg(term)
        if extra_params:
            works.msg(f"ESearch extras: {json.dumps(extra_params, ensure_ascii=False)}")

        try:
            pmids = pubmed_esearch(term, email=email, api_key=api_key, retmax=retmax, extra=extra_params)
        except Exception as e:
            works.msg(f"⚠️ PubMed ESearch failed on '{label}': {e}")
            pmids = []

        if pmids:
            works.msg(f"✅ Hits found with: {label} ({len(pmids)} PMIDs)")
            break
        else:
            works.msg(f"0 hits with: {label}")

    efetch_rows: List[Dict[str, Any]] = []
    if pmids:
        try:
            efetch_rows = pubmed_efetch_details(pmids, email=email, api_key=api_key)
        except Exception as e:
            works.msg(f"⚠️ PubMed EFetch failed: {e}")

    result = _build_milestones_and_window(prompt, efetch_rows)
    if not efetch_rows:
        result["debug"] = {
            "last_term": last_term,
            "last_extras": last_extra,
            "last_label": last_label,
            "attempts": attempts,
            "message": "No results after ≥6 OR-loosening attempts + RAW fallback."
        }
    return result

# ===================== Ion entry =====================

def _read_param(i: int) -> Any:
    try: return works.param(i)
    except Exception: return None

def _main_ion() -> int:
    prompt = _read_param(1)
    email = _read_param(2) or os.getenv("NCBI_EMAIL") or None
    api_key = _read_param(3) or os.getenv("NCBI_API_KEY") or None
    try:
        retmax = int(_read_param(4) or 100)
    except Exception:
        retmax = 100

    if not prompt or not str(prompt).strip():
        raise RuntimeError("param(1) required: free-text prompt")

    works.msg("🔧 Prompt → ChatGPT refine → PubMed (OR-loosen ≥6x) → RAW keywords → milestones + window")
    result = run_pubmed_general_search(str(prompt), email=email, api_key=api_key, retmax=retmax)
    works.resolve(result)
    return 0

if __name__ == "__main__":
    _main_ion()
