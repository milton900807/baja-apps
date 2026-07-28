#!/usr/bin/env python3
"""
Query the Reactome gene→pathway SQLite flatfile database and emit JSON.

This version:
  - Emits a JSON array to stdout.
  - JSON structure:
      [
        {
          "species": "<species name>",
          "transcripts": [
            {
              "id": "<transcript or DB gene ID>",
              "names": [
                {
                  "pathway_id": "<Reactome ID>",
                  "name": "<pathway name>",
                  "url": "<Reactome URL>",
                  "evidence": "<evidence code>"
                },
                ...
              ]
            },
            ...
          ]
        },
        ...
      ]

  - Supports:
       * Direct DB gene IDs (--gene)
       * Biological gene symbols resolved via Ensembl (--symbol)
  - Optional DB species (--species):
       * If provided: only that species is returned.
       * If omitted: all species with hits are included in the JSON.
"""

import argparse
import sqlite3
import sys
import json
from collections import defaultdict
from typing import List, Optional, Iterable

import requests


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

    species_to_try = []
    if primary_species:
        species_to_try.append(primary_species.strip())
    for sp in panel:
        if sp not in species_to_try:
            species_to_try.append(sp)

    headers = {"Content-Type": "application/json"}
    tried = []

    for sp in species_to_try:
        tried.append(sp)
        url_lookup = f"https://rest.ensembl.org/xrefs/symbol/{sp}/{gene_name}?"
        r = requests.get(url_lookup, headers=headers)
        if not r.ok:
            continue
        xrefs = r.json()
        if not xrefs:
            continue

        gene_id = xrefs[0]["id"]
        url_info = f"https://rest.ensembl.org/lookup/id/{gene_id}?expand=1"
        r2 = requests.get(url_info, headers=headers)
        if not r2.ok:
            continue

        info = r2.json()
        transcripts = [t["id"] for t in info.get("Transcript", [])]
        if transcripts:
            print(f"Resolved symbol '{gene_name}' in Ensembl '{sp}'", file=sys.stderr)
            return transcripts

    print(f"No transcripts found for '{gene_name}' in: {', '.join(tried)}", file=sys.stderr)
    return []


# ---------- (optional) species ranking helpers (kept for future use) ----------

def species_phylo_rank(species_name: str) -> int:
    s = species_name.strip().lower()

    if "homo sapiens" in s:
        return 0

    if any(x in s for x in ["pan troglodytes", "gorilla", "pongo", "macaca", "callithrix"]):
        return 1

    if any(x in s for x in ["mus musculus", "rattus", "canis", "felis", "bos", "sus", "ovis", "monodelphis", "ornithorhynchus"]):
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
    best = None
    best_rank = 999
    for sp in species_list:
        r = species_phylo_rank(sp)
        if r < best_rank or (r == best_rank and sp < best):
            best = sp
            best_rank = r
    return best


# ---------- Database query ----------

def query_pathways(db_path: str, gene_ids: List[str], species: Optional[str] = None):
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

    results = []
    for gene_symbol, sp, pid, name, url, ev in rows:
        results.append(
            {
                "gene_id": gene_symbol,  # this is effectively the "queried ID" in the DB
                "species": sp,
                "pathway_id": pid,
                "pathway_name": name,
                "pathway_url": url,
                "evidence": ev,
            }
        )
    return results


# ---------- Main ----------

def main():
    parser = argparse.ArgumentParser(
        description="Query Reactome gene→pathway SQLite DB and emit JSON grouped by species and transcript ID."
    )
    parser.add_argument("--db", "-d", required=True, help="Path to SQLite database file.")

    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--gene", "-g", help="Exact DB gene ID (e.g. B0393.1.1)")
    grp.add_argument("--symbol", help="Gene symbol (e.g. KRAS) to resolve via Ensembl")

    parser.add_argument("--species", "-s", help="DB species name (optional)")
    parser.add_argument("--ensembl-species", help="Preferred Ensembl species for symbol resolution")

    args = parser.parse_args()

    # Determine which IDs to query in the DB
    if args.gene:
        gene_ids = [args.gene]
        print_source = f"DB gene ID '{args.gene}'"
    else:
        transcripts = get_transcripts_from_gene_name(
            args.symbol,
            primary_species=args.ensembl_species,
            panel=DEFAULT_ENSEMBL_PANEL,
        )
        if not transcripts:
            # Error already printed to stderr by resolver
            sys.exit(0)
        gene_ids = transcripts
        print_source = f"symbol '{args.symbol}' → {len(transcripts)} transcript IDs"

    # Query DB (possibly restricted to a specific species)
    rows = query_pathways(args.db, gene_ids, args.species)

    if not rows:
        print(f"No results found for {print_source}.", file=sys.stderr)
        print("[]")  # empty JSON array for consistency
        sys.exit(0)

    # Build nested structure:
    # species -> gene_id -> list of pathway objects
    species_map = defaultdict(lambda: defaultdict(list))

    for r in rows:
        sp = r["species"]
        gid = r["gene_id"]
        species_map[sp][gid].append(
            {
                # "pathway_id": r["pathway_id"],
                "name": r["pathway_name"],
                # "url": r["pathway_url"],
                # "evidence": r["evidence"],
            }
        )

    # Convert to requested JSON array structure
    json_out = []
    for sp, gene_dict in species_map.items():
        transcripts_list = []
        for gid, pathways in gene_dict.items():
            transcripts_list.append(
                {
                    "id": gid,
                    "names": pathways,  # each element has pathway_id, name, url, evidence
                }
            )
        json_out.append(
            {
                "species": sp,
                "transcripts": transcripts_list,
            }
        )

    # Emit JSON to stdout
    print(json.dumps(json_out, indent=2))


if __name__ == "__main__":
    main()
