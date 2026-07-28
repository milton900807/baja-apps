#!/usr/bin/env python3
"""
download_tss_datasets.py

Download "TSS-supporting" datasets:
  1) FANTOM5 hg38 CAGE peaks (BED.gz)   [always]
  2) ENCODE RAMPAGE bigWig             [optional]

Examples
--------
# Download just FANTOM5 CAGE peaks:
python download_tss_datasets.py --outdir ./tss_data

# Also download an ENCODE RAMPAGE bigWig (best match for GRCh38):
python download_tss_datasets.py --include-rampage --outdir ./tss_data

# Bias selection toward a biosample (e.g., K562, HepG2):
python download_tss_datasets.py --include-rampage --biosample K562 --outdir ./tss_data

Notes
-----
- CAGE peaks are hard-coded to FANTOM5 "reprocessed hg38_latest" peaks BED.gz.
- ENCODE selection is "best-effort":
    - Prefer biosample term match (if provided)
    - Prefer released bigWig files
    - Slightly prefer larger files
- For strict reproducibility, you can pass --rampage-url with a specific ENCODE download URL.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from typing import Optional, Dict, Any, Tuple, List

FANTOM5_CAGE_HG38_BED_GZ = (
    "https://fantom.gsc.riken.jp/5/datafiles/reprocessed/hg38_latest/extra/CAGE_peaks/"
    "hg38_fair+new_CAGE_peaks_phase1and2.bed.gz"
)

ENCODE_BASE = "https://www.encodeproject.org"


def http_get_json(url: str, timeout: int = 60) -> Dict[str, Any]:
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def download_url(url: str, out_path: str, timeout: int = 240) -> int:
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    with open(out_path, "wb") as f:
        f.write(data)
    return len(data)


def normalize_assembly(assembly: str) -> str:
    a = (assembly or "").strip()
    if a.lower() in ("hg38", "grch38"):
        return "GRCh38"
    return a


def pick_encode_rampage_bigwig(
    assembly: str = "GRCh38",
    biosample_term: str = "",
    limit: int = 200,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Query ENCODE for released RAMPAGE bigWig files and pick a "best" candidate.

    Returns: (selected_file_dict_or_None, search_url)
      selected_file_dict has keys:
        accession, title, download_url, file_size, md5sum, biosample_summary
    """
    params = [
        ("type", "File"),
        ("assay_term_name", "RAMPAGE"),
        ("file_format", "bigWig"),
        ("assembly", assembly),
        ("status", "released"),
        ("limit", str(limit)),
        ("format", "json"),
    ]

    # This filter helps, but ENCODE metadata varies; we still score after retrieval.
    if biosample_term.strip():
        params.append(("biosample_ontology.term_name", biosample_term.strip()))

    search_url = ENCODE_BASE + "/search/?" + urllib.parse.urlencode(params)
    data = http_get_json(search_url)
    files = data.get("@graph", [])
    if not files:
        return None, search_url

    bt = biosample_term.strip().lower()

    def score_file(f: Dict[str, Any]) -> float:
        s = 0.0

        # biosample matching
        if bt:
            term = ""
            bo = f.get("biosample_ontology")
            if isinstance(bo, dict):
                term = str(bo.get("term_name") or "").lower()
            summ = str(f.get("biosample_summary") or "").lower()

            if term == bt:
                s += 100.0
            elif bt in term:
                s += 25.0
            if bt in summ:
                s += 10.0

        # prefer direct download bigWig-looking entries
        title = str(f.get("title") or "")
        href = str(f.get("href") or "")
        if title.endswith(".bigWig") and "/@@download/" in href:
            s += 5.0

        # slightly prefer larger files (MB / 10)
        fs = f.get("file_size") or 0
        try:
            s += (float(fs) / (1024.0 * 1024.0)) / 10.0
        except Exception:
            pass

        return s

    best = None
    best_score = -1e18
    for f in files:
        sc = score_file(f)
        if sc > best_score:
            best_score = sc
            best = f

    if not best:
        return None, search_url

    href = best.get("href")
    download_url = (ENCODE_BASE + href) if href else ""

    selected = {
        "accession": best.get("accession"),
        "title": best.get("title"),
        "download_url": download_url,
        "file_size": best.get("file_size"),
        "md5sum": best.get("md5sum"),
        "biosample_summary": best.get("biosample_summary"),
    }
    return selected, search_url


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", required=True, help="Output directory")
    ap.add_argument("--assembly", default="GRCh38", help="Assembly (GRCh38/hg38 supported)")
    ap.add_argument("--include-rampage", action="store_true", help="Also download an ENCODE RAMPAGE bigWig")
    ap.add_argument("--biosample", default="", help="ENCODE biosample term_name to bias RAMPAGE selection (e.g., K562)")
    ap.add_argument(
        "--rampage-url",
        default="",
        help="If provided, download this RAMPAGE bigWig URL directly (skips ENCODE search/selection)",
    )
    ap.add_argument("--limit", type=int, default=200, help="ENCODE search limit")
    args = ap.parse_args()

    outdir = args.outdir
    os.makedirs(outdir, exist_ok=True)

    assembly = normalize_assembly(args.assembly)
    if assembly != "GRCh38":
        raise SystemExit("This downloader currently supports only GRCh38/hg38 for the built-in CAGE URL.")

    result: Dict[str, Any] = {
        "cage": None,
        "rampage": None,
        "log": [],
    }

    # 1) FANTOM5 CAGE peaks
    cage_local = os.path.join(outdir, "FANTOM5_hg38_CAGE_peaks_phase1and2.bed.gz")
    cage_bytes = download_url(FANTOM5_CAGE_HG38_BED_GZ, cage_local)
    result["log"].append(f"Downloaded CAGE: {cage_local} ({cage_bytes} bytes)")
    result["cage"] = {
        "source": "FANTOM5",
        "assembly": "hg38",
        "url": FANTOM5_CAGE_HG38_BED_GZ,
        "local_path": cage_local,
        "bytes": cage_bytes,
    }

    # 2) Optional RAMPAGE
    if args.include_rampage or args.rampage_url:
        if args.rampage_url:
            rampage_url = args.rampage_url.strip()
            result["log"].append("Using user-provided RAMPAGE URL (skipping ENCODE search).")
            selected = {
                "accession": None,
                "title": os.path.basename(rampage_url.split("?")[0]),
                "download_url": rampage_url,
                "file_size": None,
                "md5sum": None,
                "biosample_summary": None,
            }
            search_url = None
        else:
            selected, search_url = pick_encode_rampage_bigwig(
                assembly=assembly,
                biosample_term=args.biosample,
                limit=args.limit,
            )
            result["log"].append(f"ENCODE search URL: {search_url}")

        if not selected or not selected.get("download_url"):
            result["log"].append("No ENCODE RAMPAGE bigWig found for the specified filters.")
            result["rampage"] = {
                "source": "ENCODE",
                "assembly": assembly,
                "biosample_term": args.biosample,
                "encode_search_url": search_url,
                "selected_file": None,
                "local_path": None,
                "bytes": 0,
            }
        else:
            fn = selected.get("title") or "ENCODE_RAMPAGE.bigWig"
            rampage_local = os.path.join(outdir, fn)
            rampage_bytes = download_url(selected["download_url"], rampage_local)
            result["log"].append(
                f"Downloaded RAMPAGE: {rampage_local} ({rampage_bytes} bytes) "
                f"| accession={selected.get('accession')} biosample={selected.get('biosample_summary')}"
            )
            result["rampage"] = {
                "source": "ENCODE",
                "assembly": assembly,
                "biosample_term": args.biosample,
                "encode_search_url": search_url,
                "selected_file": selected,
                "local_path": rampage_local,
                "bytes": rampage_bytes,
            }

    # Emit JSON summary
    result["log"] = "\n".join(result["log"])
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
