#!/usr/bin/env python3
"""
ION Works VCF -> JSON parser

Inputs (works.param):
  1: vcf file path (.vcf or .vcf.gz)
  2: (optional) chrom filter (e.g. "12" or "chr12") or "" / "." to disable
  3: (optional) start position (1-based, inclusive) or "" / "." to disable
  4: (optional) end position   (1-based, inclusive) or "" / "." to disable
  5: (optional) sample index for phase (0-based). Default 0.

Output (works.resolve):
  {
    "results": [...],
    "meta": {...}
  }

Behavior:
- Skips VCF header lines (#...)
- Splits multi-allelic ALT into one output record per ALT allele
- type inference: snp/del/ins/mnv/complex
- phase inferred from GT of selected sample:
    '|' => 1, '/' => 0, missing => 0
- strand always "1", xf always 1 (matching your example)
- name/id prefer VCF ID column; if '.' then synthesize chrom_pos_ref_alt
- annotations is raw INFO string
"""

from __future__ import annotations

import gzip
import io
import json
from typing import Dict, List, Optional, TextIO, Tuple

from ion import works


def _to_optional_int(x) -> Optional[int]:
    if x is None:
        return None
    s = str(x).strip()
    if s in ("", ".", "None", "null", "NULL"):
        return None
    try:
        return int(float(s))
    except Exception:
        return None


def _to_optional_str(x) -> Optional[str]:
    if x is None:
        return None
    s = str(x).strip()
    if s in ("", ".", "None", "null", "NULL"):
        return None
    return s


def open_maybe_gzip(path: str) -> TextIO:
    if path.endswith(".gz"):
        return io.TextIOWrapper(gzip.open(path, "rb"), encoding="utf-8", errors="replace")
    return open(path, "r", encoding="utf-8", errors="replace")


def infer_variant_type(ref: str, alt: str) -> str:
    rlen, alen = len(ref), len(alt)
    if rlen == 1 and alen == 1:
        return "snp"
    if rlen > alen:
        return "del"
    if alen > rlen:
        return "ins"
    if rlen == alen and rlen > 1:
        return "mnv"
    return "complex"


def parse_format_sample(fmt: str, sample: str) -> Dict[str, str]:
    keys = fmt.split(":") if fmt else []
    vals = sample.split(":") if sample else []
    out: Dict[str, str] = {}
    for i, k in enumerate(keys):
        out[k] = vals[i] if i < len(vals) else ""
    return out


def phase_from_gt(gt: str) -> int:
    if not gt:
        return 0
    return 1 if "|" in gt else 0


def normalize_chrom(chrom: str, chrom_filter: Optional[str]) -> bool:
    """
    Returns True if record chrom matches filter; otherwise True if no filter.
    Accepts chrom filter like "12" or "chr12".
    """
    if not chrom_filter:
        return True
    cf = chrom_filter.strip()
    if not cf:
        return True

    # Normalize both to either with or without 'chr'
    def norm(c: str) -> Tuple[str, str]:
        c = c.strip()
        with_chr = c if c.startswith("chr") else f"chr{c}"
        without_chr = c[3:] if c.startswith("chr") else c
        return with_chr, without_chr

    rec_with, rec_wo = norm(chrom)
    fil_with, fil_wo = norm(cf)
    return (rec_with == fil_with) or (rec_wo == fil_wo)


def in_range(pos: int, start: Optional[int], end: Optional[int]) -> bool:
    if start is not None and pos < start:
        return False
    if end is not None and pos > end:
        return False
    return True


def build_id(chrom: str, pos: int, ref: str, alt: str, vcf_id: str) -> str:
    if vcf_id and vcf_id != ".":
        return vcf_id
    return f"{chrom}_{pos}_{ref}_{alt}"


def parse_vcf(
    vcf_path: str,
    chrom_filter: Optional[str],
    start: Optional[int],
    end: Optional[int],
    sample_index: int,
) -> Dict[str, object]:
    results: List[Dict[str, object]] = []
    total_records = 0
    kept_records = 0

    with open_maybe_gzip(vcf_path) as fh:
        for line in fh:
            if not line or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 8:
                continue

            total_records += 1

            chrom = parts[0]
            pos = int(parts[1])
            vcf_id = parts[2] if len(parts) > 2 else "."
            ref = parts[3]
            alt_field = parts[4]
            info = parts[7] if len(parts) > 7 else "."

            if not normalize_chrom(chrom, chrom_filter):
                continue
            if not in_range(pos, start, end):
                continue

            alts = alt_field.split(",") if alt_field and alt_field != "." else []
            if not alts:
                continue

            fmt = parts[8] if len(parts) > 8 else ""
            samples = parts[9:] if len(parts) > 9 else []

            # phase from chosen sample's GT
            phase = 0
            if fmt and samples and 0 <= sample_index < len(samples):
                smap = parse_format_sample(fmt, samples[sample_index])
                phase = phase_from_gt(smap.get("GT", ""))

            for alt in alts:
                vid = build_id(chrom, pos, ref, alt, vcf_id)
                results.append(
                    {
                        "name": vid,
                        "type": infer_variant_type(ref, alt),
                        "id": vid,
                        "xi": pos,
                        "xf": 1,
                        "strand": "1",
                        "alternate": alt,
                        "reference": ref,
                        "phase": phase,
                        "annotations": info,
                    }
                )
                kept_records += 1

    return {
        "results": results,
        "meta": {
            "vcf": vcf_path,
            "chrom_filter": chrom_filter or "",
            "start": start if start is not None else "",
            "end": end if end is not None else "",
            "sample_index": sample_index,
            "input_records_seen": total_records,
            "output_records_emitted": kept_records,
        },
    }


def main() -> None:
    vcf_path = str(works.param(1))

    # Optional filters like your bw script style
    chrom_filter = _to_optional_str(works.param(2))  # e.g. "12" or "chr12"
    start = _to_optional_int(works.param(3))
    end = _to_optional_int(works.param(4))

    si = _to_optional_int(works.param(5))
    sample_index = int(si) if si is not None else 0

    payload = parse_vcf(vcf_path, chrom_filter, start, end, sample_index)

    works.progress(100)

    # Many ION pipelines like strings; returning both structured + JSON string is handy.
    works.resolve(
        {
            "meta": payload["meta"],
            "results": payload["results"],               # structured (if your runner supports it)
            "results_json": json.dumps(payload["results"]),  # always-safe string form
        }
    )


if __name__ == "__main__":
    main()
