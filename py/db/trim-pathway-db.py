#!/usr/bin/env python3
"""
Build a SQLite flatfile database and a filtered mapping file from a
Reactome-like gene→pathway mapping, but ONLY for therapeutically
relevant species.

Input file conceptual format (6 columns):
    gene_symbol   pathway_id   pathway_url   pathway_name   evidence_code   species

- Supports TAB-delimited lines.
- Also supports space-delimited lines like your example, where:
    col0 = gene_symbol
    col1 = pathway_id
    col2 = pathway_url
    col(3..-4) = pathway_name
    col(-3) = evidence_code
    col(-2..) = species (usually two tokens: "Genus species")

Outputs:
  1) SQLite DB (flatfile) with ONLY therapeutically relevant species.
     - Table: pathways
     - Columns: gene_symbol, pathway_id, pathway_url, pathway_name, evidence_code, species
     - Index: (gene_symbol, species)

  2) Filtered mapping file in the same 6-column format (TAB-delimited),
     containing ONLY therapeutically relevant species.

Usage:

  python build_filtered_reactome_db.py \
      --input reactome_mapping.txt \
      --db reactome_pathways_filtered.db \
      --filtered reactome_mapping_therapeutic_species.txt
"""

import argparse
import os
import sqlite3
from typing import Tuple, Optional

# Therapeutically relevant / commonly used preclinical species
THERAPEUTIC_SPECIES = [
    "Homo sapiens",
    "Pan troglodytes",
    "Pan paniscus",
    "Gorilla gorilla",
    "Pongo abelii",
    "Macaca mulatta",
    "Mus musculus",
    "Rattus norvegicus",
    "Canis lupus familiaris",
]

THERAPEUTIC_SPECIES_SET = {s.lower() for s in THERAPEUTIC_SPECIES}


def parse_line(line: str) -> Optional[Tuple[str, str, str, str, str, str]]:
    """
    Parse a line into:
      (gene_symbol, pathway_id, pathway_url, pathway_name, evidence_code, species)

    Handles:
      - TAB-delimited (6+ columns)
      - Space-delimited as in the long example.
    """
    line = line.strip()
    if not line:
        return None

    # Prefer TAB-delimited
    if "\t" in line:
        parts = line.split("\t")
        if len(parts) < 6:
            return None
        gene_symbol = parts[0].strip()
        pathway_id = parts[1].strip()
        pathway_url = parts[2].strip()
        pathway_name = parts[3].strip()
        evidence_code = parts[4].strip()
        species = parts[5].strip()
        return gene_symbol, pathway_id, pathway_url, pathway_name, evidence_code, species

    # Fallback: space-delimited
    tokens = line.split()
    if len(tokens) < 6:
        return None

    gene_symbol = tokens[0]
    pathway_id = tokens[1]
    pathway_url = tokens[2]

    # evidence_code is third from the end
    evidence_code = tokens[-3]
    # species is the last two tokens (usually "Genus species")
    species_tokens = tokens[-2:]
    species = " ".join(species_tokens)

    # pathway_name is everything between col2 and evidence_code
    pathway_name_tokens = tokens[3:-3]
    pathway_name = " ".join(pathway_name_tokens)

    return (
        gene_symbol.strip(),
        pathway_id.strip(),
        pathway_url.strip(),
        pathway_name.strip(),
        evidence_code.strip(),
        species.strip(),
    )


def create_schema(conn: sqlite3.Connection) -> None:
    """
    Create the pathways table and an index for (gene_symbol, species).
    """
    cur = conn.cursor()
    cur.execute("DROP TABLE IF EXISTS pathways")
    cur.execute(
        """
        CREATE TABLE pathways (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gene_symbol   TEXT NOT NULL,
            pathway_id    TEXT NOT NULL,
            pathway_url   TEXT,
            pathway_name  TEXT,
            evidence_code TEXT,
            species       TEXT NOT NULL
        )
        """
    )
    cur.execute(
        "CREATE INDEX idx_pathways_gene_species "
        "ON pathways(gene_symbol, species)"
    )
    conn.commit()


def build_filtered_db_and_file(
    input_path: str,
    db_path: str,
    filtered_path: str,
) -> None:
    """
    Read the input file, keep ONLY therapeutically relevant species,
    write those rows to:
      - SQLite DB
      - filtered text file (same 6 columns, TAB-delimited)
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    create_schema(conn)

    with open(input_path, "r", encoding="utf-8") as fin, \
            open(filtered_path, "w", encoding="utf-8") as fout:

        rows_to_insert = []
        total_parsed = 0
        total_kept = 0

        for line_number, line in enumerate(fin, start=1):
            parsed = parse_line(line)
            if parsed is None:
                # Could log a warning if desired
                continue

            total_parsed += 1
            gene_symbol, pathway_id, pathway_url, pathway_name, evidence_code, species = parsed

            # Filter: ONLY keep therapeutically relevant species
            if species.lower() not in THERAPEUTIC_SPECIES_SET:
                continue

            total_kept += 1

            # Add to DB batch
            rows_to_insert.append(
                (gene_symbol, pathway_id, pathway_url, pathway_name, evidence_code, species)
            )

            # Write to filtered text file (TAB-delimited 6 columns)
            fout.write(
                "\t".join(
                    [
                        gene_symbol,
                        pathway_id,
                        pathway_url,
                        pathway_name,
                        evidence_code,
                        species,
                    ]
                )
                + "\n"
            )

        # Bulk insert into DB (only the filtered rows)
        if rows_to_insert:
            cur.executemany(
                """
                INSERT INTO pathways (
                    gene_symbol,
                    pathway_id,
                    pathway_url,
                    pathway_name,
                    evidence_code,
                    species
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                rows_to_insert,
            )
            conn.commit()

    conn.close()

    print(f"Total parsed rows: {total_parsed}")
    print(f"Total rows kept (therapeutic species only): {total_kept}")
    print(f"Rows written to DB: {len(rows_to_insert)} (db: {db_path})")
    print(f"Rows written to filtered file: {total_kept} (file: {filtered_path})")
    print("Therapeutically relevant species used for filtering:")
    for s in THERAPEUTIC_SPECIES:
        print(f"  - {s}")


def main():
    parser = argparse.ArgumentParser(
        description="Build a SQLite flatfile DB and a filtered mapping file "
                    "containing ONLY therapeutically relevant species "
                    "(top ~20 closest to human/mouse/rat)."
    )
    parser.add_argument(
        "--input", "-i", required=True,
        help="Path to the input mapping file."
    )
    parser.add_argument(
        "--db", "-d", required=True,
        help="Path to the output SQLite database file (e.g. reactome_pathways_filtered.db)."
    )
    parser.add_argument(
        "--filtered", "-f", required=True,
        help="Path to the output filtered mapping file."
    )

    args = parser.parse_args()
    build_filtered_db_and_file(args.input, args.db, args.filtered)


if __name__ == "__main__":
    main()
