#!/usr/bin/env python3
"""
Fetch genomic context sequences from NCBI for primer amplicons, with local cache.

Given an Excel file containing columns:
- gene_id (NCBI GeneID, integer)
- forward (amplicon coordinate)
- reverse (amplicon coordinate)

This script:
1) Reads the table.
2) For each row, computes [min(forward, reverse) - 130, max(forward, reverse) + 130].
3) Looks up the gene in NCBI Gene (ESummary) to get the genomic accession (ChrAccVer) and strand.
4) Fetches the subsequence from NCBI nuccore EFETCH (FASTA) for that accession & coordinate window.
5) Caches each fetched region on disk so repeats don't trigger new downloads.

Usage:
  python fetch_genomic_context_ncbi.py \
    --excel ppsets2.xlsx \
    --sheet Sheet1 \
    --email you@example.com \
    --out_dir ncbi_cache \
    [--api_key YOUR_EUTILS_KEY] \
    [--pad 130]

Notes:
- Requires internet access, and Python packages: pandas, requests
- The script assumes the numeric 'forward'/'reverse' coordinates are on the same accession reported
  by NCBI Gene's 'GenomicInfo' (ChrAccVer). If your coordinates are on a different reference,
  pass a mapping or adjust accordingly.
"""

import argparse
import json
import os
from pathlib import Path
import sys
import time
from typing import Dict, Optional, Tuple

import pandas as pd
import requests


EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
HEADERS = {"User-Agent": "genomic-context-fetcher/1.0"}


def ncbi_get(url: str, params: Dict, retries: int = 5, backoff: float = 0.7) -> requests.Response:
    for i in range(retries):
        r = requests.get(url, params=params, headers=HEADERS, timeout=30)
        if r.status_code == 200:
            return r
        time.sleep(backoff * (i + 1))
    r.raise_for_status()
    return r


def gene_esummary(gene_id: str, email: str, api_key: Optional[str]) -> Dict:
    params = {
        "db": "gene",
        "id": gene_id,
        "retmode": "json",
        "email": email
    }
    if api_key:
        params["api_key"] = api_key
    r = ncbi_get(f"{EUTILS_BASE}/esummary.fcgi", params)
    return r.json()


def choose_genomic_info(esum_json: Dict) -> Optional[Dict]:
    """Pick one GenomicInfo dict from ESummary (simple heuristic: take the first available)."""
    try:
        uid = next(iter(esum_json["result"]["uids"]))
        rec = esum_json["result"][uid]
        ginfolist = rec.get("genomicinfo", [])
        if ginfolist:
            # pick the first entry; users can refine this if needed
            return ginfolist[0]
    except Exception:
        pass
    return None


def fetch_subseq_fasta(acc: str, start: int, stop: int, strand: int, email: str, api_key: Optional[str]) -> str:
    """Fetch FASTA subsequence from nuccore by accession and coordinates."""
    # NCBI expects start<=stop; use strand parameter to reverse-complement if needed
    seq_start, seq_stop = (start, stop) if start <= stop else (stop, start)
    params = {
        "db": "nuccore",
        "id": acc,
        "rettype": "fasta",
        "retmode": "text",
        "seq_start": seq_start,
        "seq_stop": seq_stop,
        "strand": strand,
        "email": email
    }
    if api_key:
        params["api_key"] = api_key

    r = ncbi_get(f"{EUTILS_BASE}/efetch.fcgi", params)
    return r.text


def ensure_cache_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def load_manifest(path: Path) -> Dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_manifest(path: Path, data: Dict):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main():
    p = argparse.ArgumentParser(description="Fetch +/- PAD bp genomic context for amplicons using NCBI E-utilities, with caching.")
    p.add_argument("--excel", required=True, help="Path to Excel file (must contain gene_id, forward, reverse)")
    p.add_argument("--sheet", default="Sheet1", help="Sheet name")
    p.add_argument("--email", required=True, help="Contact email for NCBI E-utilities policy")
    p.add_argument("--api_key", default=None, help="NCBI E-utilities API key (optional but recommended)")
    p.add_argument("--out_dir", default="ncbi_cache", help="Directory to store cached FASTA files and manifest")
    p.add_argument("--pad", type=int, default=130, help="Padding bp on each side of the amplicon (default: 130)")
    args = p.parse_args()

    out_dir = Path(args.out_dir)
    ensure_cache_dir(out_dir)
    manifest_path = out_dir / "manifest.json"
    manifest = load_manifest(manifest_path)

    try:
        df = pd.read_excel(args.excel, sheet_name=args.sheet)
    except Exception as e:
        print("ERROR: Could not read Excel:", e, file=sys.stderr)
        sys.exit(1)

    required_cols = {"gene_id", "forward", "reverse"}
    missing = required_cols - set(map(str.lower, df.columns))
    # Try case-insensitive mapping
    colmap = {c.lower(): c for c in df.columns}
    if missing:
        # re-evaluate with actual available names
        if not required_cols.issubset(set(colmap.keys())):
            print(f"ERROR: File must contain columns: {required_cols}. Found: {list(df.columns)}", file=sys.stderr)
            sys.exit(2)

    # Normalize column names
    gene_col = colmap["gene_id"]
    fwd_col = colmap["forward"]
    rev_col = colmap["reverse"]

    # Iterate rows
    for idx, row in df.iterrows():
        gene_id = str(row[gene_col]).strip()
        try:
            fwd = int(float(row[fwd_col]))
            rev = int(float(row[rev_col]))
        except Exception:
            print(f"[Row {idx}] Skipping due to non-integer forward/reverse: fwd={row[fwd_col]}, rev={row[rev_col]}", file=sys.stderr)
            continue

        amp_start = min(fwd, rev)
        amp_end = max(fwd, rev)
        seq_start = max(1, amp_start - args.pad)
        seq_stop = amp_end + args.pad

        # Lookup gene info (cached per gene_id if possible)
        key_gene = f"gene:{gene_id}"
        gene_info = manifest.get(key_gene, {}).get("genomicinfo")
        if not gene_info:
            try:
                js = gene_esummary(gene_id, email=args.email, api_key=args.api_key)
                gi = choose_genomic_info(js)
                if not gi:
                    print(f"[Row {idx}] No genomicinfo for gene_id={gene_id}; skipping.", file=sys.stderr)
                    continue
                gene_info = gi
                # cache gene-level info
                manifest[key_gene] = {"genomicinfo": gi}
                save_manifest(manifest_path, manifest)
            except Exception as e:
                print(f"[Row {idx}] Gene esummary failed for gene_id={gene_id}: {e}", file=sys.stderr)
                continue

        acc = gene_info.get("ChrAccVer")
        chr_start = int(gene_info.get("ChrStart", 0))
        chr_stop = int(gene_info.get("ChrStop", 0))
        strand = 1 if chr_start <= chr_stop else 2  # 1=plus, 2=minus

        if not acc:
            print(f"[Row {idx}] Missing ChrAccVer for gene_id={gene_id}; skipping.", file=sys.stderr)
            continue

        # Prepare cache key for this region
        region_key = f"{gene_id}:{acc}:{seq_start}-{seq_stop}:strand{strand}"
        cached = manifest.get(region_key, {}).get("fasta_path")
        if cached and Path(cached).exists():
            print(f"[Row {idx}] Cached: {region_key} -> {cached}")
            continue

        # Fetch subsequence
        try:
            fasta_text = fetch_subseq_fasta(acc, seq_start, seq_stop, strand, email=args.email, api_key=args.api_key)
        except Exception as e:
            print(f"[Row {idx}] EFETCH failed for {region_key}: {e}", file=sys.stderr)
            continue

        # Save FASTA
        fname = f"gene{gene_id}_{acc}_{seq_start}_{seq_stop}_s{strand}.fasta"
        out_path = out_dir / fname
        out_path.write_text(fasta_text, encoding="utf-8")

        # Update manifest
        manifest[region_key] = {
            "fasta_path": str(out_path),
            "gene_id": gene_id,
            "acc": acc,
            "seq_start": seq_start,
            "seq_stop": seq_stop,
            "strand": strand,
            "amp_start": amp_start,
            "amp_end": amp_end,
        }
        save_manifest(manifest_path, manifest)

        print(f"[Row {idx}] Downloaded: {region_key} -> {out_path}")

    print("Done. Cache directory:", out_dir)


if __name__ == "__main__":
    main()
