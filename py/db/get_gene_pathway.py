#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ion Works op: Query the Reactome gene→pathway SQLite flatfile database and emit JSON.

Param(1): config dict or JSON string with keys:
  - "symbol"            (str, optional)       — single gene symbol, e.g. "KRAS"
  - "symbols"           (list[str], optional) — list of gene symbols, e.g. ["KRAS","NRAS"]
       At least one of "symbol" or "symbols" must be provided.
  - "db"                (str, required)       — path to SQLite DB file
  - "species"           (str, optional)       — DB species name filter; if omitted, all species are returned
  - "ensembl_species"   (str, optional)       — Ensembl species to try first, e.g. "homo_sapiens"

Output (works.resolve):
{
  "status": "ok" | "❌ error",
  "query_source": "...",
  "results": [
    {
      "symbol": "<input gene symbol>",
      "species": [
        {
          "species": "<species name>",
          "transcripts": [
            {
              "id": "<transcript or DB gene ID>",
              "names": [
                {
                  "name": "<pathway name>"
                },
                ...
              ]
            },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ]
}
"""

import json
import sqlite3
from collections import defaultdict
from typing import List, Optional, Iterable, Dict, Any, Set

import requests  # type: ignore
from ion import works  # type: ignore


# ---------- Ensembl species panel for fallback ----------

DEFAULT_ENSEMBL_PANEL = [
    "homo_sapiens",             # human
    "pan_troglodytes",          # chimpanzee
    "gorilla_gorilla",          # gorilla
    "pongo_abelii",             # orangutan
    "macaca_mulatta",           # rhesus macaque
    "papio_anubis",             # olive baboon
    "callithrix_jacchus",       # marmoset
    "mus_musculus",             # mouse
    "rattus_norvegicus",        # rat
    "canis_lupus_familiaris",   # dog
    "bos_taurus",               # cow
]


# ---------- Ensembl transcript resolver ----------

def get_transcripts_from_gene_name(
    gene_name: str,
    primary_species: Optional[str] = None,
    panel: Optional[List[str]] = None,
) -> List[str]:
    """
    Resolve a gene symbol (e.g. KRAS) to transcript IDs using Ensembl REST.
    Tries primary_species (if given) first, then the panel.
    """
    if panel is None:
        panel = list(DEFAULT_ENSEMBL_PANEL)

    species_to_try: List[str] = []
    if primary_species:
        species_to_try.append(primary_species.strip())
    for sp in panel:
        if sp not in species_to_try:
            species_to_try.append(sp)

    headers = {"Content-Type": "application/json"}
    tried: List[str] = []

    for sp in species_to_try:
        tried.append(sp)
        url_lookup = f"https://rest.ensembl.org/xrefs/symbol/{sp}/{gene_name}?"
        r = requests.get(url_lookup, headers=headers)
        if not r.ok:
            continue
        xrefs = r.json()
        if not xrefs:
            continue

        gene_id = xrefs[0].get("id")
        if not gene_id:
            continue

        url_info = f"https://rest.ensembl.org/lookup/id/{gene_id}?expand=1"
        r2 = requests.get(url_info, headers=headers)
        if not r2.ok:
            continue

        info = r2.json()
        transcripts = [t["id"] for t in info.get("Transcript", []) if "id" in t]
        if transcripts:
            return transcripts

    # No hits
    return []


# ---------- (optional) species ranking helpers (currently unused but kept) ----------

def species_phylo_rank(species_name: str) -> int:
    s = species_name.strip().lower()

    if "homo sapiens" in s:
        return 0

    if any(x in s for x in ["pan troglodytes", "gorilla", "pongo", "macaca", "callithrix"]):
        return 1

    if any(x in s for x in [
        "mus musculus", "rattus", "canis", "felis", "bos",
        "sus", "ovis", "monodelphis", "ornithorhynchus"
    ]):
        return 2

    if any(x in s for x in ["danio", "xenopus", "gallus", "taeniopygia"]):
        return 3

    if "drosophila" in s:
        return 4
    if "caenorhabditis elegans" in s:
        return 5

    if any(x in s for x in ["arabidopsis", "saccharomyces"]):
        return 6

    return 10


def choose_closest_species(species_list: Iterable[str]) -> Optional[str]:
    species_list = list(set(species_list))
    if not species_list:
        return None
    best: Optional[str] = None
    best_rank = 999
    for sp in species_list:
        r = species_phylo_rank(sp)
        if r < best_rank or (r == best_rank and (best is None or sp < best)):
            best = sp
            best_rank = r
    return best


# ---------- Database query ----------

def query_pathways(db_path: str, gene_ids: List[str], species: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Query the SQLite DB for pathways matching a set of gene IDs (gene_symbol column).

    Returns a list of dicts:
      {
        "gene_id": <ID used in the DB>,
        "species": <species name>,
        "pathway_id": ...,
        "pathway_name": ...,
        "pathway_url": ...,
        "evidence": ...
      }
    """
    if not gene_ids:
        return []

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    placeholders = ",".join(["?"] * len(gene_ids))

    if species:
        sql = f"""
            SELECT gene_symbol, species, pathway_id, pathway_name, pathway_url, evidence_code
            FROM pathways
            WHERE gene_symbol IN ({placeholders}) AND species = ?
        """
        params = list(gene_ids) + [species]
    else:
        sql = f"""
            SELECT gene_symbol, species, pathway_id, pathway_name, pathway_url, evidence_code
            FROM pathways
            WHERE gene_symbol IN ({placeholders})
        """
        params = list(gene_ids)

    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()

    results: List[Dict[str, Any]] = []
    for gene_symbol, sp, pid, name, url, ev in rows:
        results.append(
            {
                "gene_id": gene_symbol,
                "species": sp,
                "pathway_id": pid,
                "pathway_name": name,
                "pathway_url": url,
                "evidence": ev,
            }
        )
    return results


# ---------- Ion Works entrypoint ----------

def analyze(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Core logic: takes a config dict (already parsed) and returns the result dict
    to be passed to works.resolve().

    Supports:
      - "symbol": single symbol (string)
      - "symbols": list of symbols
    Produces a UNION of results across all symbols, then organizes
    results with the gene symbol as the top-level grouping in `results`.
    """

    db_path = config.get("db")
    if not db_path or not isinstance(db_path, str):
        return {"status": "❌ error", "error": "Missing or invalid 'db' in param(1)."}

    # Normalize input symbols
    single_symbol = config.get("symbol")
    symbols_list = config.get("symbols")

    symbols: List[str] = []

    if isinstance(symbols_list, list):
        for s in symbols_list:
            if isinstance(s, str) and s.strip():
                symbols.append(s.strip())
    if isinstance(single_symbol, str) and single_symbol.strip():
        sym = single_symbol.strip()
        if sym not in symbols:
            symbols.append(sym)

    if not symbols:
        return {
            "status": "❌ error",
            "error": "At least one gene symbol must be provided via 'symbol' or 'symbols'."
        }

    species_filter = config.get("species")
    if species_filter is not None and not isinstance(species_filter, str):
        return {"status": "❌ error", "error": "'species' must be a string if provided."}

    ensembl_species = config.get("ensembl_species")
    if ensembl_species is not None and not isinstance(ensembl_species, str):
        return {"status": "❌ error", "error": "'ensembl_species' must be a string if provided."}

    # Resolve each symbol → transcript IDs via Ensembl
    transcript_to_symbols: Dict[str, Set[str]] = defaultdict(set)
    total_transcripts = 0

    for sym in symbols:
        transcripts = get_transcripts_from_gene_name(
            sym,
            primary_species=ensembl_species,
            panel=DEFAULT_ENSEMBL_PANEL,
        )
        for t in transcripts:
            transcript_to_symbols[t].add(sym)
        total_transcripts += len(transcripts)

    if not transcript_to_symbols:
        return {
            "status": "ok",
            "query_source": f"symbols {symbols} → 0 transcript IDs (no Ensembl hits)",
            "results": []
        }

    # Union of all transcript IDs
    union_transcripts = sorted(transcript_to_symbols.keys())
    print_source = (
        f"symbols {symbols} → {total_transcripts} transcript IDs "
        f"({len(union_transcripts)} unique after union)"
    )

    # Query DB (possibly restricted to a specific species)
    rows = query_pathways(db_path, union_transcripts, species_filter)

    if not rows:
        return {
            "status": "ok",
            "query_source": print_source,
            "results": []
        }

    # Build nested structure:
    # gene_symbol -> species -> transcript_id -> [ pathway objects ]
    gene_map: Dict[str, Dict[str, Dict[str, List[Dict[str, Any]]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )

    for r in rows:
        sp = r["species"]
        gid = r["gene_id"]
        # All input symbols that map to this transcript
        attached_symbols = transcript_to_symbols.get(gid, set())

        for sym in attached_symbols:
            gene_map[sym][sp][gid].append(
                {
                    "name": r["pathway_name"],
                }
            )

    # Convert to requested JSON array structure: top-level per gene
    results_out: List[Dict[str, Any]] = []

    # Preserve input order of symbols where possible
    for sym in symbols:
        if sym not in gene_map:
            # Symbol had transcripts but no DB hits; still include with empty species?
            continue

        species_blocks = []
        for sp, trans_dict in gene_map[sym].items():
            transcripts_list = []
            for gid, pathways in trans_dict.items():
                transcripts_list.append(
                    {
                        "id": gid,
                        "names": pathways,  # list of {"name": "<pathway name>"}
                    }
                )
            species_blocks.append(
                {
                    "species": sp,
                    "transcripts": transcripts_list,
                }
            )

        results_out.append(
            {
                "symbol": sym,
                "species": species_blocks,
            }
        )

    return {
        "status": "ok",
        "query_source": print_source,
        "results": results_out,
    }


def main() -> int:
    try:
        cfg = works.param(1)
    except Exception:
        works.resolve({"status": "❌ error", "error": "Missing parameter 1: config (dict or JSON string)."})
        return 1

    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except Exception as e:
            works.resolve({"status": "❌ error", "error": f"Param 1 JSON parse error: {e}"})
            return 1

    if not isinstance(cfg, dict):
        works.resolve({"status": "❌ error", "error": "Param 1 must be a dict or JSON string of a dict."})
        return 1

    try:
        result = analyze(cfg)
        works.resolve(result)
        return 0
    except Exception as e:
        works.resolve({"status": "❌ error", "error": str(e)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
