#!/usr/bin/env python3
"""
Stage 1 — download 2020–2026 US patent publications filtered to ASO / siRNA / gene-therapy,
with full metadata, from Google Patents Public Data on BigQuery.

Output: <work>/patents_meta.jsonl  — one JSON object per patent:
  { publication_number, filing_date, publication_date, title, abstract, assignees, inventors, cpc }

Filter = (CPC code starts with one of CPC_PREFIXES) OR (title/abstract matches a KEYWORD),
within the filing-date window. Tune CPC_PREFIXES / KEYWORDS below for your definition of scope.

Auth:  gcloud auth application-default login   (or GOOGLE_APPLICATION_CREDENTIALS=<sa.json>)
Usage: python3 1_download_patents.py --project YOUR_GCP_PROJECT --start 2020-01-01 --end 2027-01-01 --work ./out
"""
import argparse
import json
import os

from google.cloud import bigquery
from google.cloud.bigquery import QueryJobConfig, ScalarQueryParameter

# CPC prefixes that capture antisense / RNAi / oligonucleotide therapeutics / gene therapy.
CPC_PREFIXES = [
    "C12N15/11", "C12N15/111", "C12N15/113",   # antisense / RNAi constructs
    "A61K31/7088", "A61K31/712", "A61K31/713",  # oligonucleotide actives
    "C12N15/86", "C12N2750/14143", "A61K48/00",  # viral vectors / gene therapy / AAV
    "C12N2310",                                    # oligonucleotide chemistry subclass
]
# Keyword net (title/abstract) for patents that are on-topic but mis/under-classified.
KEYWORDS = [
    "antisense", "gapmer", "siRNA", "shRNA", "RNA interference", "RNAi",
    "oligonucleotide", "morpholino", "splice-switching", "exon skipping",
    "aptamer", "gene therapy", "AAV", "adeno-associated", "transgene", "lentiviral",
]

SQL = r"""
WITH base AS (
  SELECT
    publication_number, filing_date, publication_date,
    title_localized, abstract_localized,
    applicant_harmonized, inventor_harmonized, cpc
  FROM `patents-public-data.patents.publications`
  WHERE STARTS_WITH(publication_number, 'US')
    AND REGEXP_CONTAINS(publication_number, r'A[0-9]?$')     -- application (pre-grant) pubs
    AND filing_date >= @start_date AND filing_date < @end_date
),
enriched AS (
  SELECT
    publication_number, filing_date, publication_date,
    COALESCE((SELECT t.text FROM UNNEST(title_localized) t WHERE t.language='en' LIMIT 1),
             (SELECT t.text FROM UNNEST(title_localized) t LIMIT 1)) AS title,
    COALESCE((SELECT a.text FROM UNNEST(abstract_localized) a WHERE a.language='en' LIMIT 1),
             (SELECT a.text FROM UNNEST(abstract_localized) a LIMIT 1)) AS abstract,
    ARRAY_TO_STRING(ARRAY(SELECT DISTINCT TRIM(ap.name) FROM UNNEST(applicant_harmonized) ap
                          WHERE ap.name IS NOT NULL AND TRIM(ap.name)!=''), '; ') AS assignees,
    ARRAY_TO_STRING(ARRAY(SELECT DISTINCT TRIM(inv.name) FROM UNNEST(inventor_harmonized) inv
                          WHERE inv.name IS NOT NULL AND TRIM(inv.name)!=''), '; ') AS inventors,
    ARRAY_TO_STRING(ARRAY(SELECT DISTINCT c.code FROM UNNEST(cpc) c WHERE c.code IS NOT NULL), '; ') AS cpc
  FROM base
)
SELECT * FROM enriched
WHERE
  -- CPC prefix match …
  EXISTS (SELECT 1 FROM UNNEST(SPLIT(cpc, '; ')) code
          WHERE {cpc_predicate})
  -- … OR keyword hit in title/abstract
  OR REGEXP_CONTAINS(LOWER(CONCAT(IFNULL(title,''), ' ', IFNULL(abstract,''))), @kw_regex)
"""


def build_query():
    cpc_pred = " OR ".join("STARTS_WITH(code, '%s')" % p.replace("'", "") for p in CPC_PREFIXES)
    return SQL.replace("{cpc_predicate}", cpc_pred)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="GCP project id for BigQuery.")
    ap.add_argument("--start", default="2020-01-01")
    ap.add_argument("--end", default="2027-01-01", help="exclusive")
    ap.add_argument("--work", default="./out")
    ap.add_argument("--limit", type=int, default=None, help="row cap for testing")
    args = ap.parse_args()
    os.makedirs(args.work, exist_ok=True)

    kw_regex = "|".join(k.lower().replace("(", r"\(").replace(")", r"\)") for k in KEYWORDS)
    client = bigquery.Client(project=args.project)
    job = client.query(build_query(), job_config=QueryJobConfig(query_parameters=[
        ScalarQueryParameter("start_date", "DATE", args.start),
        ScalarQueryParameter("end_date", "DATE", args.end),
        ScalarQueryParameter("kw_regex", "STRING", kw_regex),
    ]))

    out_path = os.path.join(args.work, "patents_meta.jsonl")
    n = 0
    with open(out_path, "w", encoding="utf-8") as f:
        for row in job.result(page_size=50_000):
            rec = {
                "publication_number": row["publication_number"],
                "filing_date": str(row["filing_date"] or ""),
                "publication_date": str(row["publication_date"] or ""),
                "title": row["title"] or "",
                "abstract": row["abstract"] or "",
                "assignees": row["assignees"] or "",
                "inventors": row["inventors"] or "",
                "cpc": row["cpc"] or "",
            }
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            n += 1
            if args.limit and n >= args.limit:
                break
    print("Wrote %d ASO/siRNA/GT patents (%s..%s) to %s" % (n, args.start, args.end, out_path))


if __name__ == "__main__":
    main()
