#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
SNP describer (Ion Works) — SNP STRUCTURE INPUT (fault tolerant, human-only)

Behavior:
- Do NOT use uid.
- Use only true identifier-like fields for structured lookup.
- Do NOT use the name field for structured lookup.
- If the name field contains common database IDs (rs, ClinVar, HGVS-like, etc.),
  keep them as OpenAI-only context hints.
- Otherwise, use genomic coordinates + ref + alt.
- Search for associated diseases using:
    1) gene name if available
    2) rsID if available
    3) genomic location + ref + alt
- Always assume human.
- If an Ensembl transcript ID is provided:
    1) use OpenAI to derive transcript/gene context if possible
    2) if a gene symbol or gene name can be derived, do a second OpenAI pass
       to summarize mutation / disease information linked to the variant in that gene context
    3) if nothing additional can be supported, return "No additional information found."

Params:
param(1): SNP object string (JSON or JS-object-literal style)
param(2): ensembl_transcript_id (optional)
param(3): model (optional; default: gpt-4o-mini)
param(4): temperature (optional; default: 0.2)

Output keys preserved:
- rsid
- ncbi_snp_url
- observed_alleles
- placements_count
- genes
- clinical_notes
- mutation_paragraph

Additional keys included when available:
- input_id
- known_ids
- name_ids
- lookup_method
- chromosome
- position
- reference
- alternate
- variant_type
- genome_build
- organism
- associated_diseases
- ensembl_transcript_id
- transcript_additional_information
- transcript_gene_context
- gene_symbol
- gene_disease_additional_information
"""

import os
import json
import re
import ast
from typing import Any, Dict, Optional, Tuple, List, Set
from urllib.parse import quote
from urllib.request import Request, urlopen

# ---- Ion Works ----
from ion import works  # type: ignore

# ---- OpenAI ----
from openai import OpenAI

BASE = "https://api.ncbi.nlm.nih.gov/variation/v0"
NCBI_SNP_WEB = "https://www.ncbi.nlm.nih.gov/snp"
_RS_RE = re.compile(r"^rs(\d+)$", re.IGNORECASE)

_COORD_ID_RE = re.compile(
    r"^(chr)?(?P<chrom>[A-Za-z0-9]+)[_:](?P<pos>\d+)[_:](?P<ref>[A-Za-z]+)[_:](?P<alt>[A-Za-z]+)$",
    re.IGNORECASE,
)

# -------------------------
# Fault-tolerant SNP parser
# -------------------------
_BARE_KEY_RE = re.compile(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)')
_TRAILING_COMMA_RE = re.compile(r",\s*([}\]])")


def _sanitize_objectish(text: str) -> str:
    s = text.strip()

    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        inner = s[1:-1].strip()
        if inner.startswith("{") and inner.endswith("}"):
            s = inner

    s = _BARE_KEY_RE.sub(r'\1"\2"\3', s)
    s = _TRAILING_COMMA_RE.sub(r"\1", s)
    return s


def parse_snp_json(snp_text: str) -> Dict[str, Any]:
    if not snp_text:
        raise ValueError("param(1) is empty")

    raw = str(snp_text).strip()
    sanitized = _sanitize_objectish(raw)

    try:
        obj = json.loads(sanitized)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    try:
        obj = ast.literal_eval(sanitized)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    raise ValueError(
        "Invalid SNP payload in param(1). Expected JSON or JS-style object. "
        f"Preview: {raw[:200]}"
    )


# -------------------------
# Generic helpers
# -------------------------
def normalize_rsid(value: Optional[str]) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    m = _RS_RE.fullmatch(value.strip())
    if not m:
        return None
    return f"rs{int(m.group(1))}"


def normalize_known_ids(values: List[str]) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()

    for v in values or []:
        if not isinstance(v, str):
            continue
        vv = v.strip()
        if not vv:
            continue
        rs = normalize_rsid(vv)
        norm = rs if rs else vv
        if norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out


def build_ncbi_snp_url(rsid: Optional[str]) -> Optional[str]:
    rs = normalize_rsid(rsid)
    if not rs:
        return None
    return f"{NCBI_SNP_WEB}/{int(rs[2:])}"


def safe_get(d: Any, path: str, default=None):
    cur = d
    for part in path.split("."):
        if cur is None:
            return default
        m = re.fullmatch(r"([^\[\]]+)(\[(\d+)\])?", part)
        if not m:
            return default
        key, idx = m.group(1), m.group(3)
        if isinstance(cur, dict) and key in cur:
            cur = cur[key]
        else:
            return default
        if idx is not None:
            try:
                cur = cur[int(idx)]
            except Exception:
                return default
    return cur


# -------------------------
# Annotation / object scanning
# -------------------------
def _extract_rsid_from_annotations(ann: Any) -> Optional[str]:
    if ann is None:
        return None
    if isinstance(ann, list):
        for item in ann:
            rs = _extract_rsid_from_annotations(item)
            if rs:
                return rs
        return None
    if isinstance(ann, dict):
        for v in ann.values():
            rs = _extract_rsid_from_annotations(v)
            if rs:
                return rs
        return None
    if isinstance(ann, str):
        m = re.search(r"\brs\d+\b", ann, flags=re.IGNORECASE)
        if m:
            return m.group(0)
    return None


def _extract_known_ids_from_annotations(ann: Any) -> List[str]:
    found: Set[str] = set()

    def _walk(x: Any) -> None:
        if x is None:
            return
        if isinstance(x, list):
            for i in x:
                _walk(i)
            return
        if isinstance(x, dict):
            for v in x.values():
                _walk(v)
            return
        if isinstance(x, str):
            for m in re.findall(r"\brs\d+\b", x, flags=re.IGNORECASE):
                found.add(m)
            for m in re.findall(r"\bss\d+\b", x, flags=re.IGNORECASE):
                found.add(m)
            for m in re.findall(r"\bVCV\d+\b", x, flags=re.IGNORECASE):
                found.add(m)
            for m in re.findall(r"\bRCV\d+\b", x, flags=re.IGNORECASE):
                found.add(m)
            for m in re.findall(r"\bClinVar[:_ ]?\d+\b", x, flags=re.IGNORECASE):
                found.add(m)
            for m in re.findall(r"\b(?:NC_|NM_|NR_|NP_)[A-Za-z0-9_.:>+-]+\b", x):
                found.add(m)

    _walk(ann)
    return sorted(found)


def extract_database_ids_from_name(name_value: Any) -> List[str]:
    if not isinstance(name_value, str) or not name_value.strip():
        return []

    s = name_value.strip()
    found: Set[str] = set()

    patterns = [
        r"\brs\d+\b",
        r"\bss\d+\b",
        r"\bVCV\d+\b",
        r"\bRCV\d+\b",
        r"\bClinVar[:_ ]?\d+\b",
        r"\bCA\d+\b",
        r"\bgnomAD[:_ ][A-Za-z0-9_.:-]+\b",
        r"\b(?:NC_|NM_|NR_|NP_)[A-Za-z0-9_.:>+-]+\b",
    ]

    for pat in patterns:
        for m in re.findall(pat, s, flags=re.IGNORECASE):
            found.add(m.strip())

    return sorted(found)


def _parse_coordinate_style_id(value: str) -> Optional[Dict[str, Any]]:
    if not isinstance(value, str) or not value.strip():
        return None
    m = _COORD_ID_RE.fullmatch(value.strip())
    if not m:
        return None
    return {
        "chromosome": m.group("chrom"),
        "position": int(m.group("pos")),
        "reference": m.group("ref"),
        "alternate": m.group("alt"),
    }


def _looks_like_biological_id(value: str) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    s = value.strip()

    if _COORD_ID_RE.fullmatch(s):
        return False

    if normalize_rsid(s):
        return True

    patterns = [
        r"^ss\d+$",
        r"^VCV\d+$",
        r"^RCV\d+$",
        r"^ClinVar[:_ ]?\d+$",
        r"^(NC_|NM_|NR_|NP_).+",
        r"^[A-Za-z]{2,10}[:_]\d+$",
    ]
    return any(re.fullmatch(p, s, flags=re.IGNORECASE) for p in patterns)


def _candidate_id_fields(obj: Dict[str, Any]) -> List[str]:
    return [
        "rsid",
        "dbsnp_id",
        "snp_id",
        "variant_id",
        "clinvar_id",
        "identifier",
        "id",
    ]


def get_best_variant_id_from_input(obj: Dict[str, Any]) -> Optional[str]:
    for key in _candidate_id_fields(obj):
        v = obj.get(key)
        if isinstance(v, str) and _looks_like_biological_id(v):
            return v.strip()

    ann_rsid = _extract_rsid_from_annotations(obj.get("annotations"))
    if ann_rsid:
        return ann_rsid

    return None


def get_coordinate_like_id_from_input(obj: Dict[str, Any]) -> Optional[str]:
    v = obj.get("id")
    if isinstance(v, str) and _COORD_ID_RE.fullmatch(v.strip()):
        return v.strip()
    return None


def get_rsid_from_snp_obj(obj: Dict[str, Any]) -> Optional[str]:
    direct = get_best_variant_id_from_input(obj)
    if direct:
        rs = normalize_rsid(direct)
        if rs:
            return rs

    rs_from_ann = _extract_rsid_from_annotations(obj.get("annotations"))
    if rs_from_ann:
        return rs_from_ann

    return None


def _infer_variant_fields(obj: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"organism": "Homo sapiens"}

    coord_id = get_coordinate_like_id_from_input(obj)
    parsed_from_id = _parse_coordinate_style_id(coord_id) if coord_id else None
    if parsed_from_id:
        out.update(parsed_from_id)

    raw_id = obj.get("id")
    if "chromosome" not in out and isinstance(raw_id, str):
        m = re.match(r"^(chr)?([A-Za-z0-9]+)[_:]", raw_id.strip(), flags=re.IGNORECASE)
        if m:
            out["chromosome"] = m.group(2)

    for key in ("chromosome", "chr", "chrom"):
        v = obj.get(key)
        if isinstance(v, str) and v.strip():
            out.setdefault("chromosome", v.strip().replace("chr", ""))
            break

    for key in ("position", "xi", "start", "pos"):
        v = obj.get(key)
        if v is not None:
            try:
                out.setdefault("position", int(v))
                break
            except Exception:
                pass

    for key in ("reference", "reference0", "ref"):
        v = obj.get(key)
        if isinstance(v, str) and v.strip():
            out.setdefault("reference", v.strip())
            break

    for key in ("alternate", "alternate0", "alt", "sequence"):
        v = obj.get(key)
        if isinstance(v, str) and v.strip():
            out.setdefault("alternate", v.strip())
            break

    for key in ("variant_type", "type", "snp_type"):
        v = obj.get(key)
        if isinstance(v, str) and v.strip():
            out.setdefault("variant_type", v.strip())
            break

    for key in ("gene", "gene_name", "symbol", "gene_symbol"):
        v = obj.get(key)
        if isinstance(v, str) and v.strip():
            out.setdefault("gene_name", v.strip())
            break

    for key in ("genome_build", "assembly", "build"):
        v = obj.get(key)
        if isinstance(v, str) and v.strip():
            out.setdefault("genome_build", v.strip())
            break

    return out


# -------------------------
# HTTP utilities
# -------------------------
def http_get_json(url: str, timeout: int = 30) -> Any:
    req = Request(
        url,
        headers={"User-Agent": "ion-snp-describer/2.8", "Accept": "application/json"},
    )
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def try_fetch_refsnp(rs_numeric: int) -> Tuple[Optional[Dict[str, Any]], str]:
    for u in (f"{BASE}/refsnp/{rs_numeric}", f"{BASE}/rs/{rs_numeric}"):
        try:
            return http_get_json(u), u
        except Exception:
            pass
    return None, ""


# -------------------------
# NCBI extraction
# -------------------------
def extract_compact_snp_facts(obj: Dict[str, Any], rs_numeric: int) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "rsid": f"rs{rs_numeric}",
        "ncbi_snp_url": f"{NCBI_SNP_WEB}/{rs_numeric}",
        "organism": "Homo sapiens",
    }

    placements = safe_get(obj, "primary_snapshot_data.placements_with_allele", [])
    if isinstance(placements, list):
        out["placements_count"] = len(placements)

    alleles = set()
    for p in placements or []:
        for a in p.get("alleles", []) or []:
            spdi = a.get("allele", {}).get("spdi", {})
            ins = spdi.get("inserted_sequence")
            if ins:
                alleles.add(ins)
    if alleles:
        out["observed_alleles"] = sorted(alleles)

    genes = []
    ann = safe_get(obj, "primary_snapshot_data.allele_annotations[0].assembly_annotation.genes", [])
    for g in ann or []:
        if "name" in g:
            genes.append(g["name"])
    if genes:
        out["genes"] = sorted(set(genes))

    clin = []
    disease_names: Set[str] = set()

    for aa in safe_get(obj, "primary_snapshot_data.allele_annotations", []) or []:
        for c in aa.get("clinical", []) or []:
            dn = c.get("disease_names")
            if isinstance(dn, list):
                for item in dn:
                    if isinstance(item, str) and item.strip():
                        disease_names.add(item.strip())
            clin.append({
                "clinical_significances": c.get("clinical_significances"),
                "review_status": c.get("review_status"),
                "disease_names": c.get("disease_names"),
            })

    if clin:
        out["clinical_notes"] = clin[:10]
    if disease_names:
        out["associated_diseases"] = sorted(disease_names)[:20]

    known_ids: Set[str] = {f"rs{rs_numeric}"}

    merged_snapshot = safe_get(obj, "merged_snapshot_data.merged_into", [])
    if isinstance(merged_snapshot, list):
        for mid in merged_snapshot:
            if isinstance(mid, int):
                known_ids.add(f"rs{mid}")
            elif isinstance(mid, str) and mid.strip():
                known_ids.add(normalize_rsid(mid) or mid.strip())

    dbsnp1 = safe_get(obj, "refsnp_id")
    if isinstance(dbsnp1, int):
        known_ids.add(f"rs{dbsnp1}")
    elif isinstance(dbsnp1, str) and dbsnp1.strip():
        known_ids.add(normalize_rsid(dbsnp1) or dbsnp1.strip())

    if known_ids:
        out["known_ids"] = sorted(known_ids)

    return out


# -------------------------
# ID / location lookup
# -------------------------
def _extract_ids_from_dbsnp_search_hits(payload: Any) -> Dict[str, Any]:
    primary_rsid: Optional[str] = None
    known_ids: Set[str] = set()

    def _walk(x: Any) -> None:
        nonlocal primary_rsid

        if x is None:
            return

        if isinstance(x, list):
            for i in x:
                _walk(i)
            return

        if isinstance(x, dict):
            for k, v in x.items():
                lk = str(k).lower()

                if lk in ("refsnp_id", "rsid", "id"):
                    if isinstance(v, int):
                        rs = f"rs{v}"
                        known_ids.add(rs)
                        if primary_rsid is None:
                            primary_rsid = rs
                    elif isinstance(v, str):
                        rs = normalize_rsid(v)
                        if rs:
                            known_ids.add(rs)
                            if primary_rsid is None:
                                primary_rsid = rs
                        elif v.strip():
                            known_ids.add(v.strip())

                elif lk in ("submitted_snapshot_id", "ss_id", "submitted_id"):
                    if isinstance(v, int):
                        known_ids.add(f"ss{v}")
                    elif isinstance(v, str) and v.strip():
                        known_ids.add(v.strip())

                _walk(v)
            return

        if isinstance(x, str):
            for m in re.findall(r"\brs\d+\b", x, flags=re.IGNORECASE):
                rs = normalize_rsid(m)
                if rs:
                    known_ids.add(rs)
                    if primary_rsid is None:
                        primary_rsid = rs
            for m in re.findall(r"\bss\d+\b", x, flags=re.IGNORECASE):
                known_ids.add(m)

    _walk(payload)

    return {
        "primary_rsid": primary_rsid,
        "known_ids": sorted(known_ids),
    }


def lookup_variant_by_any_id(raw_id: str) -> Optional[Dict[str, Any]]:
    raw_id = raw_id.strip()
    if not raw_id:
        return None

    candidates = [
        f"{BASE}/search/{quote(raw_id)}",
        f"{BASE}/beta/search/{quote(raw_id)}",
    ]

    for url in candidates:
        try:
            payload = http_get_json(url)
            parsed = _extract_ids_from_dbsnp_search_hits(payload)
            known = set(parsed.get("known_ids", []) or [])
            known.add(raw_id)
            if known:
                return {
                    "primary_rsid": parsed.get("primary_rsid"),
                    "known_ids": sorted(known),
                    "lookup_method": "non_rsid_lookup",
                }
        except Exception:
            pass

    return None


def lookup_variant_by_location(
    chromosome: str,
    position: int,
    reference: str,
    alternate: str,
    variant_type: Optional[str] = None,
    genome_build: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    chrom = chromosome.strip().replace("chr", "")
    ref = reference.strip()
    alt = alternate.strip()

    known_ids: Set[str] = set()
    primary_rsid: Optional[str] = None

    coord_id_1 = f"chr{chrom}_{position}_{ref}_{alt}"
    coord_id_2 = f"{chrom}:{position}:{ref}>{alt}"
    coord_id_3 = f"chr{chrom}:{position}:{ref}>{alt}"

    known_ids.update({coord_id_1, coord_id_2, coord_id_3})

    search_terms = [
        coord_id_1,
        coord_id_2,
        f"{chrom}:{position}:{ref}:{alt}",
        f"{chrom}-{position}-{ref}-{alt}",
        f"Homo sapiens {chrom}:{position} {ref}>{alt}",
        f"human chr{chrom} {position} {ref}>{alt}",
    ]

    if genome_build:
        gb = genome_build.strip()
        search_terms = [f"{gb}:{t}" for t in search_terms] + search_terms

    for term in search_terms:
        for url in (
            f"{BASE}/search/{quote(term)}",
            f"{BASE}/beta/search/{quote(term)}",
        ):
            try:
                payload = http_get_json(url)
                parsed = _extract_ids_from_dbsnp_search_hits(payload)
                for kid in parsed.get("known_ids", []) or []:
                    known_ids.add(kid)
                if not primary_rsid and parsed.get("primary_rsid"):
                    primary_rsid = parsed["primary_rsid"]
            except Exception:
                pass

    if primary_rsid or known_ids:
        return {
            "primary_rsid": primary_rsid,
            "known_ids": sorted(known_ids),
            "lookup_method": "genomic_context_lookup",
            "variant_type": variant_type,
            "genome_build": genome_build,
            "organism": "Homo sapiens",
        }

    return None


def try_resolve_non_rsid(raw_id: str) -> Optional[Dict[str, Any]]:
    resolved = lookup_variant_by_any_id(raw_id)
    if not resolved:
        return None

    known_ids = normalize_known_ids(resolved.get("known_ids", []))
    if raw_id not in known_ids:
        known_ids.append(raw_id)

    primary_rsid = normalize_rsid(resolved.get("primary_rsid"))
    if not primary_rsid:
        for vid in known_ids:
            rs = normalize_rsid(vid)
            if rs:
                primary_rsid = rs
                break

    return {
        "primary_rsid": primary_rsid,
        "known_ids": sorted(set(known_ids)),
        "lookup_method": resolved.get("lookup_method", "non_rsid_lookup"),
    }


def try_resolve_by_genomic_context(input_snp: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    inferred = _infer_variant_fields(input_snp)

    chrom = inferred.get("chromosome")
    pos = inferred.get("position")
    ref = inferred.get("reference")
    alt = inferred.get("alternate")
    variant_type = inferred.get("variant_type")
    genome_build = inferred.get("genome_build")

    if not chrom or pos is None or not ref or not alt:
        return None

    try:
        pos_int = int(pos)
    except Exception:
        return None

    resolved = lookup_variant_by_location(
        chromosome=str(chrom),
        position=pos_int,
        reference=str(ref),
        alternate=str(alt),
        variant_type=str(variant_type).strip() if variant_type else None,
        genome_build=str(genome_build).strip() if genome_build else None,
    )
    if not resolved:
        return None

    known_ids = normalize_known_ids(resolved.get("known_ids", []))
    primary_rsid = normalize_rsid(resolved.get("primary_rsid"))

    if not primary_rsid:
        for vid in known_ids:
            rs = normalize_rsid(vid)
            if rs:
                primary_rsid = rs
                break

    return {
        "primary_rsid": primary_rsid,
        "known_ids": sorted(set(known_ids)),
        "lookup_method": resolved.get("lookup_method", "genomic_context_lookup"),
        "organism": "Homo sapiens",
    }


def resolve_variant_identity(input_snp: Dict[str, Any]) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "primary_rsid": None,
        "known_ids": [],
        "ncbi_snp_url": None,
        "lookup_method": None,
        "organism": "Homo sapiens",
    }

    known_ids: Set[str] = set()

    rsid = get_rsid_from_snp_obj(input_snp)
    if rsid:
        rs = normalize_rsid(rsid)
        if rs:
            result["primary_rsid"] = rs
            result["known_ids"] = [rs]
            result["ncbi_snp_url"] = build_ncbi_snp_url(rs)
            result["lookup_method"] = "direct_rsid"
            return result

    biological_id = get_best_variant_id_from_input(input_snp)
    if biological_id:
        resolved = try_resolve_non_rsid(biological_id)
        if resolved:
            known_ids.update(resolved.get("known_ids", []) or [])
            primary_rsid = resolved.get("primary_rsid")
            if primary_rsid:
                result["primary_rsid"] = primary_rsid
                result["ncbi_snp_url"] = build_ncbi_snp_url(primary_rsid)
            result["known_ids"] = sorted(known_ids)
            result["lookup_method"] = resolved.get("lookup_method", "non_rsid_lookup")
            return result

    loc_resolved = try_resolve_by_genomic_context(input_snp)
    if loc_resolved:
        known_ids.update(loc_resolved.get("known_ids", []) or [])
        primary_rsid = loc_resolved.get("primary_rsid")
        if primary_rsid:
            result["primary_rsid"] = primary_rsid
            result["ncbi_snp_url"] = build_ncbi_snp_url(primary_rsid)
        result["known_ids"] = sorted(known_ids)
        result["lookup_method"] = loc_resolved.get("lookup_method", "genomic_context_lookup")
        return result

    ann_ids = set(_extract_known_ids_from_annotations(input_snp.get("annotations")))
    known_ids.update(ann_ids)
    if biological_id:
        known_ids.add(biological_id)

    result["known_ids"] = sorted(known_ids)
    result["lookup_method"] = "unresolved_input_only" if known_ids else "unresolved"
    return result


# -------------------------
# Disease association lookup
# -------------------------
def _extract_disease_names_from_payload(payload: Any) -> List[str]:
    found: Set[str] = set()

    disease_key_names = {
        "disease_names",
        "disease_name",
        "trait_name",
        "trait_names",
        "preferred_name",
        "condition_name",
        "conditions",
    }

    def _clean(s: str) -> Optional[str]:
        t = re.sub(r"\s+", " ", s).strip(" ;,")
        if not t:
            return None
        if len(t) < 3:
            return None
        if t.lower() in {"not provided", "not specified", "none", "na", "n/a"}:
            return None
        return t

    def _walk(x: Any, parent_key: Optional[str] = None) -> None:
        if x is None:
            return

        if isinstance(x, dict):
            for k, v in x.items():
                lk = str(k).lower()

                if lk in disease_key_names:
                    if isinstance(v, list):
                        for item in v:
                            if isinstance(item, str):
                                c = _clean(item)
                                if c:
                                    found.add(c)
                    elif isinstance(v, str):
                        c = _clean(v)
                        if c:
                            found.add(c)

                _walk(v, lk)
            return

        if isinstance(x, list):
            for item in x:
                _walk(item, parent_key)
            return

        if isinstance(x, str):
            if parent_key in disease_key_names:
                c = _clean(x)
                if c:
                    found.add(c)

    _walk(payload)
    return sorted(found)


def _search_diseases_with_variation_api(terms: List[str], max_terms: int = 6) -> List[str]:
    diseases: Set[str] = set()

    for term in terms[:max_terms]:
        if not isinstance(term, str) or not term.strip():
            continue
        for url in (
            f"{BASE}/search/{quote(term.strip())}",
            f"{BASE}/beta/search/{quote(term.strip())}",
        ):
            try:
                payload = http_get_json(url)
                for d in _extract_disease_names_from_payload(payload):
                    diseases.add(d)
            except Exception:
                pass

    return sorted(diseases)[:20]


def find_associated_diseases(
    snp_facts: Dict[str, Any],
    input_snp: Dict[str, Any],
) -> List[str]:
    diseases: Set[str] = set()

    for d in snp_facts.get("associated_diseases", []) or []:
        if isinstance(d, str) and d.strip():
            diseases.add(d.strip())

    for c in snp_facts.get("clinical_notes", []) or []:
        if isinstance(c, dict):
            dn = c.get("disease_names")
            if isinstance(dn, list):
                for item in dn:
                    if isinstance(item, str) and item.strip():
                        diseases.add(item.strip())

    gene_names: List[str] = []
    genes = snp_facts.get("genes")
    if isinstance(genes, list):
        for g in genes:
            if isinstance(g, str) and g.strip():
                gene_names.append(g.strip())

    inferred = _infer_variant_fields(input_snp)
    for key in ("gene_name", "gene_symbol"):
        v = snp_facts.get(key) or inferred.get(key)
        if isinstance(v, str) and v.strip():
            gene_names.append(v.strip())

    gene_names = list(dict.fromkeys(gene_names))

    rsid = snp_facts.get("rsid")
    chrom = snp_facts.get("chromosome") or inferred.get("chromosome")
    pos = snp_facts.get("position") or inferred.get("position")
    ref = snp_facts.get("reference") or inferred.get("reference")
    alt = snp_facts.get("alternate") or inferred.get("alternate")

    terms: List[str] = []

    for gene in gene_names[:3]:
        terms.extend([
            f"{gene} disease human",
            f"{gene} ClinVar human",
            f"{gene} pathogenic variant human",
        ])

    if isinstance(rsid, str) and rsid.strip():
        terms.extend([
            f"{rsid} disease human",
            f"{rsid} ClinVar human",
        ])

    if chrom and pos and ref and alt:
        chrom_s = str(chrom).replace("chr", "")
        coord = f"chr{chrom_s}_{pos}_{ref}_{alt}"
        terms.extend([
            f"{coord} disease human",
            f"chr{chrom_s}:{pos} {ref}>{alt} disease human",
        ])

    for d in _search_diseases_with_variation_api(terms):
        diseases.add(d)

    return sorted(diseases)[:20]


# -------------------------
# OpenAI helpers
# -------------------------
def _chat_call(model: str, system: str, user: str, temperature: float, max_tokens: int = 500) -> str:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI()
    r = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (r.choices[0].message.content or "").strip()


def _extract_json_block(text: str) -> Optional[Dict[str, Any]]:
    if not isinstance(text, str) or not text.strip():
        return None

    s = text.strip()

    # direct parse
    try:
        obj = json.loads(s)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    # fenced or embedded JSON
    m = re.search(r"\{.*\}", s, flags=re.DOTALL)
    if m:
        try:
            obj = json.loads(m.group(0))
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass

    return None


def generate_transcript_gene_context(
    snp_facts: Dict[str, Any],
    input_snp: Dict[str, Any],
    ensembl_transcript_id: Optional[str],
    model: str,
    temperature: float,
) -> Dict[str, Any]:
    transcript_id = (ensembl_transcript_id or "").strip()
    if not transcript_id:
        return {
            "transcript_additional_information": "No additional information found."
        }

    inferred = _infer_variant_fields(input_snp)

    system = (
        "You are a careful genetics analyst. "
        "Use ONLY the facts given in the prompt. "
        "Do not use outside knowledge. "
        "Infer transcript-context only when it is directly supportable from the provided facts. "
        "Return strict JSON with keys: "
        "gene_name, gene_symbol, transcript_additional_information. "
        "If gene_name or gene_symbol cannot be derived from the provided facts, set them to null. "
        "If no additional transcript information can be supported, set transcript_additional_information to "
        "\"No additional information found.\""
    )

    user = (
        "Infer any transcript-linked gene context from the supplied facts.\n"
        "Rules:\n"
        "- Do not invent a gene name or gene symbol.\n"
        "- If the transcript ID itself does not let you derive extra supported context from the supplied facts, do not guess.\n"
        "- gene_symbol should be a short symbol if explicitly supportable; otherwise null.\n"
        "- gene_name may be a fuller gene label if supportable; otherwise null.\n\n"
        f"FACTS:\n{json.dumps({'ensembl_transcript_id': transcript_id, 'snp_facts': snp_facts, 'input': {'gene_name': inferred.get('gene_name'), 'genes': snp_facts.get('genes'), 'chromosome': inferred.get('chromosome'), 'position': inferred.get('position'), 'reference': inferred.get('reference'), 'alternate': inferred.get('alternate'), 'variant_type': inferred.get('variant_type'), 'annotations': input_snp.get('annotations')}}, indent=2)}"
    )

    try:
        resp = _chat_call(model, system, user, temperature, max_tokens=250)
    except Exception:
        return {
            "transcript_additional_information": "No additional information found."
        }

    parsed = _extract_json_block(resp)
    if not parsed:
        return {
            "transcript_additional_information": "No additional information found."
        }

    out: Dict[str, Any] = {}
    gene_name = parsed.get("gene_name")
    gene_symbol = parsed.get("gene_symbol")
    transcript_info = parsed.get("transcript_additional_information")

    if isinstance(gene_name, str) and gene_name.strip():
        out["gene_name"] = gene_name.strip()

    if isinstance(gene_symbol, str) and gene_symbol.strip():
        out["gene_symbol"] = gene_symbol.strip()

    if isinstance(transcript_info, str) and transcript_info.strip():
        out["transcript_additional_information"] = transcript_info.strip()
    else:
        out["transcript_additional_information"] = "No additional information found."

    return out

def generate_gene_disease_additional_information(
    snp_facts: Dict[str, Any],
    input_snp: Dict[str, Any],
    model: str,
    temperature: float,
) -> str:
    gene_symbol = snp_facts.get("gene_symbol")
    gene_name = snp_facts.get("gene_name")
    genes = snp_facts.get("genes", [])
    rsid = snp_facts.get("rsid")

    inferred = _infer_variant_fields(input_snp)
    chrom = snp_facts.get("chromosome") or inferred.get("chromosome")
    pos = snp_facts.get("position") or inferred.get("position")
    ref = snp_facts.get("reference") or inferred.get("reference")
    alt = snp_facts.get("alternate") or inferred.get("alternate")
    variant_type = snp_facts.get("variant_type") or inferred.get("variant_type")

    has_gene_context = any(
        isinstance(x, str) and x.strip()
        for x in [gene_symbol, gene_name]
    ) or (isinstance(genes, list) and len(genes) > 0)

    has_genomic_context = bool(chrom and pos is not None and ref and alt)

    if not has_gene_context and not has_genomic_context:
        return "No additional information found."

    system = (
        "You are a careful genetics analyst. "
        "Use ONLY the facts provided in the prompt. "
        "Do not use outside knowledge beyond what can be reasonably inferred from the supplied identifiers, "
        "gene labels, transcript context, disease associations, and genomic context in the prompt. "
        "Write one short paragraph only if the supplied gene symbol, gene name, transcript/gene context, "
        "or genomic context supports additional information about diseases known to be linked to mutations "
        "in this gene or at this variant context. "
        "If the supplied facts do not support any extra gene-linked or locus-linked mutation/disease statement, "
        "return exactly: \"No additional information found.\""
    )

    user = (
        "Determine whether the supplied gene symbol, gene name, transcript context, or genomic context "
        "adds additional supported information about diseases linked to mutations in this gene or variant context.\n"
        "Rules:\n"
        "- Use only the supplied facts.\n"
        "- Do not invent mechanism, pathogenicity, penetrance, or disease causality.\n"
        "- If the gene symbol/name is available, summarize diseases known from the supplied facts to be linked "
        "to mutations in that gene.\n"
        "- If gene symbol/name is unavailable but genomic context is available, use the genomic context cautiously "
        "to summarize any additional disease-linked mutation context supportable from the supplied facts.\n"
        "- If associated diseases are already present, you may connect them carefully to the gene or genomic context "
        "only if supported by the facts.\n"
        "- If the facts do not support an additional statement, return exactly: No additional information found.\n\n"
        f"FACTS:\n{json.dumps({'gene_symbol': gene_symbol, 'gene_name': gene_name, 'genes': genes, 'rsid': rsid, 'chromosome': chrom, 'position': pos, 'reference': ref, 'alternate': alt, 'variant_type': variant_type, 'associated_diseases': snp_facts.get('associated_diseases'), 'clinical_notes': snp_facts.get('clinical_notes'), 'transcript_additional_information': snp_facts.get('transcript_additional_information'), 'name_ids': snp_facts.get('name_ids'), 'known_ids': snp_facts.get('known_ids'), 'annotations': input_snp.get('annotations'), 'clinsig': input_snp.get('clinsig'), 'clindn': input_snp.get('clindn')}, indent=2)}"
    )

    try:
        resp = _chat_call(model, system, user, temperature, max_tokens=320).strip()
    except Exception:
        return "No additional information found."

    if not resp:
        return "No additional information found."

    if resp.strip().strip('"').strip("'") == "No additional information found.":
        return "No additional information found."

    return resp

# -------------------------
# OpenAI paragraph
# -------------------------
def generate_mutation_paragraph(
    snp_facts: Dict[str, Any],
    input_snp: Dict[str, Any],
    model: str,
    temperature: float,
    rsid_found: bool,
) -> str:
    rsid = snp_facts.get("rsid") or input_snp.get("rsid")
    known_ids = snp_facts.get("known_ids")
    name_ids = snp_facts.get("name_ids", [])
    associated_diseases = snp_facts.get("associated_diseases", [])
    genes = snp_facts.get("genes", [])

    system = (
        "You are a careful genetics explainer. "
        "Write ONE paragraph for a scientific audience. "
        "Do not invent facts. "
        "Always assume the organism is human unless stated otherwise in the facts. "
        "If prevalence, penetrance, or disease association are not available from the provided data, explicitly say so. "
        "IDs extracted from the name field are label/context hints only unless explicitly validated elsewhere in the facts."
    )

    annotations = input_snp.get("annotations")
    inferred = _infer_variant_fields(input_snp)

    refs = []
    if rsid_found and isinstance(rsid, str) and rsid.strip():
        refs.append(f"dbSNP (rsID: {rsid.strip()})")
        refs.append("NCBI dbSNP record")
    else:
        refs.append("Input SNP object")
        if known_ids:
            refs.append("Resolved identifier mapping")
        if name_ids:
            refs.append("Name-field identifier hints")
        if annotations:
            refs.append("Input annotations")

    if associated_diseases:
        refs.append("Associated disease search")

    if snp_facts.get("transcript_additional_information") and snp_facts.get("transcript_additional_information") != "No additional information found.":
        refs.append("Ensembl transcript context")

    if snp_facts.get("gene_disease_additional_information") and snp_facts.get("gene_disease_additional_information") != "No additional information found.":
        refs.append("Gene-linked mutation/disease context")

    mode_note = (
        "You have structured NCBI-derived human variant fields plus the original input object."
        if rsid_found
        else
        "No confirmed rsID-backed NCBI human SNP record was available, so you MUST rely only on the provided human coordinate fields, allele fields, annotations, resolved IDs, gene names, disease associations, transcript context, and gene-linked context found in the facts. Do NOT imply a validated dbSNP record exists unless explicitly present in the facts."
    )

    user = (
        f"{mode_note}\n\n"
        "Using ONLY the facts below, write one paragraph describing this variant.\n"
        "- Mention allele change (reference→alternate) if available.\n"
        "- Mention genomic location if available.\n"
        "- If a gene name or symbol is available, use it.\n"
        "- If multiple IDs are known, mention that the variant is associated with multiple identifiers.\n"
        "- If associated diseases are available, mention them carefully as reported associations from the provided facts.\n"
        "- If transcript-specific additional information is available, incorporate it briefly.\n"
        "- If gene-linked mutation/disease additional information is available, incorporate it briefly.\n"
        "- If no disease associations are available, explicitly say that disease association is not established from the provided data.\n"
        "- Include a sentence on prevalence/penetrance and explicitly say if unknown.\n"
        "- Do not infer disease relevance from AF/AQ/AN/AC alone.\n"
        "- End with a short 'References:' clause naming sources (no URLs).\n\n"
        f"FACTS:\n{json.dumps({'ncbi': snp_facts, 'input': {'id': input_snp.get('id'), 'name': input_snp.get('name'), 'name_ids': name_ids, 'reference': inferred.get('reference'), 'alternate': inferred.get('alternate'), 'chromosome': inferred.get('chromosome'), 'position': inferred.get('position'), 'variant_type': inferred.get('variant_type'), 'gene_name': snp_facts.get('gene_name') or inferred.get('gene_name'), 'gene_symbol': snp_facts.get('gene_symbol'), 'genes': genes, 'associated_diseases': associated_diseases, 'ensembl_transcript_id': snp_facts.get('ensembl_transcript_id'), 'transcript_additional_information': snp_facts.get('transcript_additional_information'), 'gene_disease_additional_information': snp_facts.get('gene_disease_additional_information'), 'organism': 'Homo sapiens', 'annotations': annotations, 'clinsig': input_snp.get('clinsig'), 'clindn': input_snp.get('clindn')}}, indent=2)}\n\n"
        f"References: {', '.join(dict.fromkeys(refs))}"
    )

    return _chat_call(model, system, user, temperature, max_tokens=500)


# -------------------------
# Ion run
# -------------------------
def run(
    snp_payload: str,
    ensembl_transcript_id: Optional[str],
    model: str,
    temperature: float,
) -> Dict[str, Any]:
    input_snp = parse_snp_json(snp_payload)
    inferred = _infer_variant_fields(input_snp)

    works.msg("🧬 resolving variant identity…")
    resolved = resolve_variant_identity(input_snp)

    snp_facts: Dict[str, Any] = {"organism": "Homo sapiens"}
    rsid_found = False

    if ensembl_transcript_id and str(ensembl_transcript_id).strip():
        snp_facts["ensembl_transcript_id"] = str(ensembl_transcript_id).strip()

    primary_rsid = resolved.get("primary_rsid") if resolved else None
    if primary_rsid:
        snp_facts["rsid"] = primary_rsid
    if resolved.get("known_ids"):
        snp_facts["known_ids"] = resolved["known_ids"]
    if resolved.get("ncbi_snp_url"):
        snp_facts["ncbi_snp_url"] = resolved["ncbi_snp_url"]
    if resolved.get("lookup_method"):
        snp_facts["lookup_method"] = resolved["lookup_method"]

    biological_id = get_best_variant_id_from_input(input_snp)
    coordinate_id = get_coordinate_like_id_from_input(input_snp)
    if biological_id:
        snp_facts["input_id"] = biological_id
    elif coordinate_id:
        snp_facts["input_id"] = coordinate_id

    name_ids = extract_database_ids_from_name(input_snp.get("name"))
    if name_ids:
        snp_facts["name_ids"] = name_ids

    for k in ("chromosome", "position", "reference", "alternate", "variant_type", "gene_name", "genome_build", "organism"):
        if inferred.get(k) not in (None, "", []):
            snp_facts.setdefault(k, inferred[k])

    # Fetch NCBI only if we truly have an rsID from structured lookup
    if primary_rsid:
        m = _RS_RE.fullmatch(primary_rsid.strip())
        if m:
            rsid_found = True
            rs_numeric = int(m.group(1))

            works.msg(f"🧬 fetching NCBI data for {primary_rsid}…")
            obj, src = try_fetch_refsnp(rs_numeric)
            if obj:
                fetched = extract_compact_snp_facts(obj, rs_numeric)
                fetched["ncbi_api_source"] = src

                for k, v in fetched.items():
                    if k == "known_ids":
                        existing = set(snp_facts.get("known_ids", []) or [])
                        incoming = set(v or [])
                        if biological_id:
                            existing.add(biological_id)
                        elif coordinate_id:
                            existing.add(coordinate_id)
                        snp_facts["known_ids"] = sorted(existing | incoming)
                    elif k == "associated_diseases":
                        existing = set(snp_facts.get("associated_diseases", []) or [])
                        incoming = set(v or [])
                        snp_facts["associated_diseases"] = sorted(existing | incoming)
                    else:
                        snp_facts[k] = v
            else:
                works.msg(
                    f"⚠️ NCBI fetch failed for {primary_rsid}; "
                    f"falling back to coordinate/annotation-based paragraph."
                )
                rsid_found = False

    if snp_facts.get("rsid"):
        m2 = _RS_RE.fullmatch(str(snp_facts["rsid"]).strip())
        if m2:
            snp_facts.setdefault("ncbi_snp_url", f"{NCBI_SNP_WEB}/{int(m2.group(1))}")

    # Build known_ids without uid and without name
    ann_ids = set(_extract_known_ids_from_annotations(input_snp.get("annotations")))
    known_ids = set(snp_facts.get("known_ids", []) or [])
    known_ids.update(ann_ids)

    if biological_id:
        known_ids.add(biological_id)
    elif coordinate_id:
        known_ids.add(coordinate_id)

    chrom = snp_facts.get("chromosome")
    pos = snp_facts.get("position")
    ref = snp_facts.get("reference")
    alt = snp_facts.get("alternate")
    if chrom and pos and ref and alt:
        known_ids.add(f"chr{str(chrom).replace('chr', '')}_{pos}_{ref}_{alt}")
        known_ids.add(f"{str(chrom).replace('chr', '')}:{pos}:{ref}>{alt}")

    if snp_facts.get("rsid"):
        known_ids.add(str(snp_facts["rsid"]).strip())

    if known_ids:
        snp_facts["known_ids"] = sorted(normalize_known_ids(list(known_ids)))

    # Merge alleles from input
    alleles = set(snp_facts.get("observed_alleles", []) or [])
    for k in ("reference", "alternate", "reference0", "alternate0", "sequence"):
        v = input_snp.get(k)
        if isinstance(v, str) and v.strip():
            alleles.add(v.strip())
    if alleles:
        snp_facts["observed_alleles"] = sorted(alleles)

    # Find associated diseases, favoring gene if available
    works.msg("🩺 searching associated diseases…")
    disease_hits = find_associated_diseases(snp_facts, input_snp)
    if disease_hits:
        existing = set(snp_facts.get("associated_diseases", []) or [])
        existing.update(disease_hits)
        snp_facts["associated_diseases"] = sorted(existing)[:20]

    # Transcript-specific OpenAI context
    works.msg("🧾 analyzing transcript context…")
    transcript_ctx = generate_transcript_gene_context(
        snp_facts=snp_facts,
        input_snp=input_snp,
        ensembl_transcript_id=ensembl_transcript_id,
        model=model,
        temperature=temperature,
    )
    for k, v in transcript_ctx.items():
        snp_facts[k] = v

    # If transcript-derived gene symbol/name exists, do second OpenAI pass
    works.msg("🧠 analyzing gene-linked mutation and disease context…")
    snp_facts["gene_disease_additional_information"] = generate_gene_disease_additional_information(
        snp_facts=snp_facts,
        input_snp=input_snp,
        model=model,
        temperature=temperature,
    )

    works.msg("✍️ generating description…")
    snp_facts["mutation_paragraph"] = generate_mutation_paragraph(
        snp_facts=snp_facts,
        input_snp=input_snp,
        model=model,
        temperature=temperature,
        rsid_found=rsid_found,
    )

    return snp_facts


# -------------------------
# Ion entry
# -------------------------
def _main_ion(default_model: str = "gpt-4o-mini") -> int:
    try:
        payload = works.param(1)
        ensembl_transcript_id = works.param(2) or ""
        model = works.param(3) or default_model
        temperature = float(works.param(4) or 0.2)

        result = run(payload, ensembl_transcript_id, model, temperature)
        works.resolve(result)
        return 0

    except Exception as e:
        preview = ""
        try:
            preview = str(works.param(1))[:200]
        except Exception:
            preview = ""
        works.resolve({
            "status": "❌ error",
            "where": "snp-describer",
            "error": str(e),
            "input_preview": preview,
        })
        return 1


if __name__ == "__main__":
    works.msg("🔧 loading SNP describer…")
    _main_ion()