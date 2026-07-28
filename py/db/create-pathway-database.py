#!/usr/bin/env python3
"""
Build a flatfile (SQLite) database of gene -> pathways per species
from a Reactome-style tab-delimited text file.

Input file format (tab-separated, 6 columns):
    gene_symbol   pathway_id   pathway_url   pathway_name   evidence_code   species

Example line:
    B0393.1.1  R-CEL-72706  https://reactome.org/PathwayBrowser/#/R-CEL-72706  GTP hydrolysis and joining of the 60S ribosomal subunit  IEA  Caenorhabditis elegans

Usage:

  python build_reactome_db.py \
      --input reactome_mapping.txt \
      --db reactome_pathways.db

This script *only* builds the database. You can write a separate script
to query it later using standard SQLite.
"""

import argparse
import os
import sqlite3


def create_schema(conn: sqlite3.Connection) -> None:
    """
    Create the pathways table and an index optimized for gene+species lookups.
    """
    cur = conn.cursor()

    # Drop existing table if you want a clean rebuild each time
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

    # Index to make queries fast:
    #   SELECT * FROM pathways WHERE gene_symbol=? AND species=?;
    cur.execute(
        "CREATE INDEX idx_pathways_gene_species "
        "ON pathways(gene_symbol, species)"
    )

    conn.commit()


def load_file_into_db(input_path: str, db_path: str) -> None:
    """
    Read the tab-delimited file and populate the SQLite database.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    # Connect to the SQLite file (this is our flatfile DB)
    conn = sqlite3.connect(db_path)
    try:
        create_schema(conn)
        cur = conn.cursor()

        with open(input_path, "r", encoding="utf-8") as f:
            rows_to_insert = []
            for line_number, line in enumerate(f, start=1):
                line = line.rstrip("\n")
                if not line.strip():
                    continue  # skip empty lines

                parts = line.split("\t")
                if len(parts) < 6:
                    print(
                        f"Warning: line {line_number} has {len(parts)} columns (<6); skipping:"
                        f" {line}"
                    )
                    continue

                gene_symbol, pathway_id, pathway_url, pathway_name, evidence_code, species = parts[:6]

                rows_to_insert.append(
                    (
                        gene_symbol.strip(),
                        pathway_id.strip(),
                        pathway_url.strip(),
                        pathway_name.strip(),
                        evidence_code.strip(),
                        species.strip(),
                    )
                )

            # Bulk insert for speed
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
        print(f"Loaded {len(rows_to_insert)} row(s) into {db_path}")

    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Build a SQLite flatfile database of gene-to-pathway mappings."
    )
    parser.add_argument(
        "--input", "-i", required=True, help="Path to the input tab-delimited file."
    )
    parser.add_argument(
        "--db",
        "-d",
        required=True,
        help="Path to the output SQLite database file (e.g. reactome_pathways.db).",
    )

    args = parser.parse_args()
    load_file_into_db(args.input, args.db)


if __name__ == "__main__":
    main()
