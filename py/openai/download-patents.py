#!/usr/bin/env python3
"""
Download all (or a date-ranged subset of) US pre-grant patent publications (PGPub)
and save selected fields to a single output file.

Fields:
- title
- abstract (summary)
- filing_date
- applicants (affiliations; org/person names)
- inventors (authors; person names)
- publication_number (useful key)

Requirements:
  pip install google-cloud-bigquery google-cloud-bigquery-storage pandas pyarrow tqdm

Auth:
  - Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON OR run:
      gcloud auth application-default login
Usage examples:
  python download_us_pregrant_to_one_file.py --project YOUR_GCP_PROJECT \
    --out patents_pregrant.parquet

  # Narrow by filing date:
  python download_us_pregrant_to_one_file.py --start 2001-03-15 --end 2025-10-18 \
    --out us_pgp_2001_2025.jsonl --fmt jsonl --project YOUR_GCP_PROJECT
"""

import argparse
import json
import os
from typing import List, Optional

import pandas as pd
from google.cloud import bigquery
from google.cloud.bigquery import QueryJobConfig
from tqdm import tqdm

DEFAULT_START = "2001-03-15"  # PGPub start (USPTO)
DEFAULT_END = "2100-01-01"    # effectively "no end"

SQL_TEMPLATE = r"""
-- Pull US pre-grant (application) publications with A* kinds (A1/A9 etc.)
-- BigQuery dataset: patents-public-data.patents.publications
-- See: Google Patents Public Datasets on BigQuery.
WITH base AS (
  SELECT
    publication_number,
    application_number,
    filing_date,
    publication_date,
    publication_kind,
    title_localized,
    abstract_localized,
    applicant_harmonized,
    inventor_harmonized
  FROM `patents-public-data.patents.publications`
  WHERE
    -- US only
    STARTS_WITH(publication_number, 'US') 
    -- application publications (pre-grant); 'A' kinds are app pubs
    AND REGEXP_CONTAINS(publication_number, r'A[0-9]?$')
    -- optional filing date filter
    AND filing_date >= @start_date
    AND filing_date <  @end_date
)
SELECT
  publication_number,
  filing_date,
  -- Prefer English title/abstract; fall back to the first available language.
  COALESCE(
    (SELECT t.text FROM UNNEST(title_localized) t WHERE t.language = 'en' LIMIT 1),
    (SELECT t.text FROM UNNEST(title_localized) t LIMIT 1)
  ) AS title,
  COALESCE(
    (SELECT a.text FROM UNNEST(abstract_localized) a WHERE a.language = 'en' LIMIT 1),
    (SELECT a.text FROM UNNEST(abstract_localized) a LIMIT 1)
  ) AS abstract,
  -- Applicants (affiliations): dedup names across org/person
  ARRAY_TO_STRING(ARRAY(
    SELECT DISTINCT x
    FROM (
      SELECT TRIM(ap.name) AS x FROM UNNEST(applicant_harmonized) ap WHERE ap.name IS NOT NULL
    )
    WHERE x != ''
  ), '; ') AS applicants,
  -- Inventors (authors)
  ARRAY_TO_STRING(ARRAY(
    SELECT DISTINCT TRIM(inv.name) 
    FROM UNNEST(inventor_harmonized) inv
    WHERE inv.name IS NOT NULL AND TRIM(inv.name) != ''
  ), '; ') AS inventors
FROM base
"""

def run_query_to_dataframe(client: bigquery.Client, start: str, end: str, max_rows: Optional[int] = None) -> pd.DataFrame:
    job_config = QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start_date", "DATE", start),
            bigquery.ScalarQueryParameter("end_date",   "DATE", end),
        ]
    )
    query_job = client.query(SQL_TEMPLATE, job_config=job_config)
    it = query_job.result(page_size=100_000)  # stream in large pages

    # Stream rows into chunks to avoid huge memory spikes
    rows_iter = it.pages
    dfs: List[pd.DataFrame] = []
    total = 0
    for page in tqdm(rows_iter, desc="Downloading rows (pages)"):
        df = page.to_dataframe(create_bqstorage_client=True)
        dfs.append(df)
        total += len(df)
        if max_rows and total >= max_rows:
            break
    if max_rows:
        # truncate if we overshot
        combined = pd.concat(dfs, ignore_index=True).head(max_rows)
    else:
        combined = pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()
    return combined

def write_out(df: pd.DataFrame, out_path: str, fmt: str):
    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
    if fmt == "parquet":
        df.to_parquet(out_path, index=False)
    elif fmt == "jsonl":
        df.to_json(out_path, orient="records", lines=True, force_ascii=False)
    elif fmt == "csv":
        df.to_csv(out_path, index=False)
    else:
        raise ValueError(f"Unknown format: {fmt}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="Your GCP project id (for BigQuery).")
    ap.add_argument("--start", default=DEFAULT_START, help="Start filing date (YYYY-MM-DD). Default PGPub start.")
    ap.add_argument("--end",   default=DEFAULT_END,   help="End filing date (YYYY-MM-DD, exclusive).")
    ap.add_argument("--out",   default="us_pregrant.parquet", help="Output file path.")
    ap.add_argument("--fmt",   default="parquet", choices=["parquet", "jsonl", "csv"], help="Output format.")
    ap.add_argument("--limit", type=int, default=None, help="Optional row cap for testing (e.g., 100000).")
    args = ap.parse_args()

    client = bigquery.Client(project=args.project)

    df = run_query_to_dataframe(client, start=args.start, end=args.end, max_rows=args.limit)

    # Friendly column order & names
    rename = {
        "publication_number": "publication_number",
        "title": "title",
        "abstract": "summary",
        "filing_date": "date_filed",
        "applicants": "affiliations",
        "inventors": "authors",
    }
    keep = list(rename.keys())
    df = df[keep].rename(columns=rename)

    write_out(df, args.out, args.fmt)
    print(f"Wrote {len(df):,} records to {args.out} ({args.fmt}).")

if __name__ == "__main__":
    main()
