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

# google-cloud-bigquery is imported inside main(), AFTER --print-scope has had its chance to
# run. Reading the filter is the one thing worth doing before any of the GCP setup exists, and
# a top-level import made it the one thing you could not do.

# ---- Scope ------------------------------------------------------------------------------
# Two presets. CORE is the original filter, kept so an earlier run can be reproduced exactly;
# WIDE is the default and covers the rest of nucleic-acid medicine -- editing, mRNA, delivery
# chemistry and the conjugate/backbone art -- which the core list only caught when a patent
# happened to also carry an antisense code.
#
# Both are OR'd against the keyword net, so widening the CPC list widens the result set
# monotonically: nothing that matched before stops matching.
CPC_CORE = [
    "C12N15/11", "C12N15/111", "C12N15/113",     # antisense / RNAi constructs
    "A61K31/7088", "A61K31/712", "A61K31/713",   # oligonucleotide actives
    "C12N15/86", "C12N2750/14143", "A61K48/00",  # viral vectors / gene therapy / AAV
    "C12N2310",                                  # oligonucleotide chemistry subclass
]
CPC_WIDE = CPC_CORE + [
    # --- more of the nucleic-acid construct space -------------------------------------
    "C12N15/113",      # (already in core; listed for symmetry with the subgroups below)
    "C12N15/115",      # aptamers
    "C12N15/117",      # immunostimulatory oligonucleotides (CpG)
    "C12N15/10",       # processes for preparing / isolating nucleic acids
    "C12N15/85",       # eukaryotic expression vectors
    "C12N15/87", "C12N15/88",   # non-viral introduction / carriers
    "C12N15/90", "C12N15/907",  # site-specific integration
    "C12N15/63",       # introduction of foreign genetic material generally
    # --- gene editing -----------------------------------------------------------------
    "C12N9/22",        # ribonucleases (Cas nucleases sit here)
    "C12N2310/20",     # guide RNA
    "C12N2800/80",     # editing / recombination uses
    # --- vectors, in more detail ------------------------------------------------------
    "C12N15/861",      # adenoviral
    "C12N15/864",      # AAV
    "C12N15/867",      # retro / lentiviral
    "C12N2740/15043",  # lentivirus vector systems
    "C12N2750/14",     # parvo / AAV vector systems (broader than 14143)
    # --- oligonucleotide actives, in more detail --------------------------------------
    "A61K31/711",      # DNA actives
    "A61K31/7105",     # RNA actives (mRNA therapeutics land here)
    "A61K31/7115", "A61K31/712", "A61K31/7125",
    "A61K48/005", "A61K48/0058",
    # --- chemistry: backbones, sugars, conjugates -------------------------------------
    "C07H21",          # nucleic-acid chemistry (C07H21/02 RNA, /04 DNA)
    "A61K47/54",       # active-agent conjugates (GalNAc conjugates sit here)
    "A61K47/549",
    "C12N2320",        # uses / delivery of the oligonucleotide subclass
    # --- delivery formulation ---------------------------------------------------------
    "A61K9/127",       # liposomes / lipid vesicles
    "A61K9/5123",      # lipid microcapsules -- LNP art
    "A61K9/51",        # nanoparticles
]
# Deliberately NOT included: C12Q1/68* (nucleic-acid assays). It is the largest neighbouring
# class and almost entirely diagnostics -- every PCR and genotyping patent -- so adding it
# multiplies the result set without adding therapeutic sequence art. Add it explicitly with
# --cpc if a diagnostics index is ever wanted; it should be its own index, not this one.

# Keyword net (title/abstract) for patents that are on-topic but mis/under-classified.
KW_CORE = [
    "antisense", "gapmer", "siRNA", "shRNA", "RNA interference", "RNAi",
    "oligonucleotide", "morpholino", "splice-switching", "exon skipping",
    "aptamer", "gene therapy", "AAV", "adeno-associated", "transgene", "lentiviral",
]
KW_WIDE = KW_CORE + [
    # chemistry that names itself
    "locked nucleic acid", "phosphorothioate", "phosphorodiamidate",
    "2'-O-methoxyethyl", "peptide nucleic acid", "GalNAc",
    # editing
    "CRISPR", "guide RNA", "base editing", "prime editing", "zinc finger nuclease", "TALEN",
    # other modalities
    "antagomir", "anti-miR", "microRNA inhibitor", "ribozyme",
    "circular RNA", "self-amplifying RNA", "steric blocking", "decoy oligonucleotide",
    # delivery
    "lipid nanoparticle",
]
# Kept OUT of the keyword net on purpose: bare "mRNA", "conjugate", "nanoparticle", "vector".
# Each appears in a large share of all molecular-biology abstracts, and because keywords are
# OR'd with CPC one loose term does more to the result size than the entire CPC list above.
# The specific phrasings above ("lipid nanoparticle", "self-amplifying RNA") carry the same
# scope without the noise.

CPC_PREFIXES = CPC_WIDE
KEYWORDS = KW_WIDE

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


def build_query(cpc_prefixes):
    # De-duplicated and longest-first: purely cosmetic for the generated SQL, but it makes the
    # predicate readable when a run has to be explained.
    seen, uniq = set(), []
    for p in cpc_prefixes:
        p = p.strip().replace("'", "")
        if p and p not in seen:
            seen.add(p)
            uniq.append(p)
    cpc_pred = " OR ".join("STARTS_WITH(code, '%s')" % p for p in sorted(uniq))
    return SQL.replace("{cpc_predicate}", cpc_pred)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="GCP project id for BigQuery.")
    ap.add_argument("--start", default="2020-01-01")
    ap.add_argument("--end", default="2027-01-01", help="exclusive")
    ap.add_argument("--work", default="./out")
    ap.add_argument("--limit", type=int, default=None, help="row cap for testing")
    # Scope is settable from the command line so widening it again is a flag, not an edit.
    ap.add_argument("--preset", choices=["wide", "core"], default="wide",
                    help="wide (default) = nucleic-acid medicine incl. editing / mRNA / "
                         "delivery; core = the original antisense-RNAi-GT filter")
    ap.add_argument("--cpc", default=None,
                    help="comma-separated CPC prefixes, REPLACING the preset")
    ap.add_argument("--cpc-add", default=None,
                    help="comma-separated CPC prefixes to add to the preset")
    ap.add_argument("--keywords", default=None,
                    help="comma-separated title/abstract keywords, REPLACING the preset")
    ap.add_argument("--print-scope", action="store_true",
                    help="print the CPC list, keyword net and generated predicate, then stop "
                         "(no BigQuery, no credentials needed)")
    args = ap.parse_args()

    cpc = CPC_CORE if args.preset == "core" else CPC_WIDE
    kws = KW_CORE if args.preset == "core" else KW_WIDE
    if args.cpc:
        cpc = [p.strip() for p in args.cpc.split(",") if p.strip()]
    if args.cpc_add:
        cpc = cpc + [p.strip() for p in args.cpc_add.split(",") if p.strip()]
    if args.keywords:
        kws = [k.strip() for k in args.keywords.split(",") if k.strip()]

    kw_regex = "|".join(k.lower().replace("(", r"\(").replace(")", r"\)") for k in kws)

    if args.print_scope:
        # A dry run of the scope alone. The BigQuery bill for this query is real, so being able
        # to read the filter before paying for it is worth a flag.
        print("preset:   %s" % args.preset)
        print("CPC (%d): %s" % (len(set(cpc)), ", ".join(sorted(set(cpc)))))
        print("keywords (%d): %s" % (len(kws), ", ".join(kws)))
        print("\npredicate:\n  %s" % build_query(cpc).split("WHERE")[-1].strip()[:2000])
        return

    from google.cloud import bigquery
    from google.cloud.bigquery import QueryJobConfig, ScalarQueryParameter

    os.makedirs(args.work, exist_ok=True)
    client = bigquery.Client(project=args.project)
    job = client.query(build_query(cpc), job_config=QueryJobConfig(query_parameters=[
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
    print("Wrote %d patents (%s preset, %d CPC prefixes, %s..%s) to %s"
          % (n, args.preset, len(set(cpc)), args.start, args.end, out_path))


if __name__ == "__main__":
    main()
