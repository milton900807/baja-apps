from ion import works
import os
import gzip
import io
from typing import Dict, List, Optional, TextIO, Tuple

original_file = works.param(1)

chrom = works.param(2)         # e.g. "chr1" or "1"
startIndex = int(works.param(3))
endIndex = int(works.param(4))
strand_param = works.param(5)  # optional strand: "1" or "-1"


def resolve_file_path(path: str) -> str:
    candidates = [path]

    # 1) $USER_DATA/<path> -- the canonical user-data root baja-server itself uses
    # (src/environment.ts: userData = path.join(homeDir, 'baja-users')), set on EVERY python
    # subprocess by buildPythonEnv() in src/index.ts. Authoritative and correct on any
    # deployment automatically -- checked first.
    user_data = os.environ.get("USER_DATA")
    if user_data:
        candidates.append(os.path.join(user_data, path.lstrip("/")))

    # 2) $LJUSER_DATA/<path> (an older/alternate name; nothing in this app sets it today)
    ljuser_data = os.environ.get("LJUSER_DATA")
    if ljuser_data:
        candidates.append(os.path.join(ljuser_data, path.lstrip("/")))

    # 3) $HOME/baja-users/<path> -- the real directory name
    home_dir = os.environ.get("HOME")
    if home_dir:
        candidates.append(os.path.join(home_dir, "baja-users", path.lstrip("/")))
        # 4) $HOME/ljusers/<path> -- wrong directory name (there is no "ljusers" anywhere in
        # this app), kept only for a path that happened to resolve under the old guess
        candidates.append(os.path.join(home_dir, "ljusers", path.lstrip("/")))

    # 5) /root/baja-users/<path>, /root/ljusers/<path> -- same two, for a root-run server
    candidates.append(os.path.join("/root/baja-users", path.lstrip("/")))
    candidates.append(os.path.join("/root/ljusers", path.lstrip("/")))

    for candidate in candidates:
        candidate = candidate.replace("//", "/")
        if os.path.exists(candidate):
            print(f"Resolved file path: {candidate}")
            return candidate

    print("Tried file paths:")
    for c in candidates:
        print(f"  - {c}")

    return path


file = resolve_file_path(original_file)

print(f"original file {original_file}")
print(f"file {file}")
print(f"chrom {chrom}")
print(f"start {startIndex}")
print(f"end {endIndex}")
print(f"strand/sampleIndex {strand_param}")


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


def normalize_chrom_match(record_chrom: str, chrom_filter: Optional[str]) -> bool:
    """Match chrom with or without chr prefix."""
    if not chrom_filter:
        return True

    cf = chrom_filter.strip()
    if not cf:
        return True

    def norm(c: str) -> Tuple[str, str]:
        c = c.strip()
        with_chr = c if c.startswith("chr") else f"chr{c}"
        without_chr = c[3:] if c.startswith("chr") else c
        return with_chr, without_chr

    rec_with, rec_wo = norm(record_chrom)
    fil_with, fil_wo = norm(cf)

    return (rec_with == fil_with) or (rec_wo == fil_wo)


def bed_overlaps_query(
    bed_start_0based: int,
    bed_end_0based_exclusive: int,
    query_start_1based: Optional[int],
    query_end_1based: Optional[int],
) -> bool:
    """
    BED coordinates are 0-based, half-open: [start, end)
    Query coordinates are treated like your VCF script: 1-based inclusive.

    Convert query to BED-like 0-based half-open before overlap testing.
    """
    q_start = 0 if query_start_1based is None else max(query_start_1based - 1, 0)
    q_end = bed_end_0based_exclusive if query_end_1based is None else query_end_1based

    return bed_start_0based < q_end and bed_end_0based_exclusive > q_start


def open_maybe_gzip(path: str) -> TextIO:
    """
    Open plain BED or gzipped BED.
    """
    if path.endswith(".gz"):
        fh = gzip.open(path, "rb")
        return io.TextIOWrapper(fh, encoding="utf-8", errors="replace")

    return open(path, "r", encoding="utf-8", errors="replace")


def parse_bed_line(line: str) -> Optional[Dict[str, object]]:
    """
    Parses BED3+.

    Required:
      chrom, start, end

    Optional standard BED fields:
      name, score, strand, thickStart, thickEnd, itemRgb, blockCount,
      blockSizes, blockStarts

    Extra columns are preserved in annotations.extra_fields.
    """
    line = line.rstrip("\n")

    if not line or line.startswith("#") or line.startswith("track") or line.startswith("browser"):
        return None

    parts = line.split("\t")
    if len(parts) < 3:
        parts = line.split()

    if len(parts) < 3:
        return None

    rchrom = parts[0]
    start0 = int(parts[1])
    end0 = int(parts[2])

    name = parts[3] if len(parts) > 3 and parts[3] not in ("", ".") else f"{rchrom}_{start0}_{end0}"
    score = parts[4] if len(parts) > 4 and parts[4] not in ("", ".") else None
    strand = parts[5] if len(parts) > 5 and parts[5] in ("+", "-", "1", "-1") else None

    if strand == "+":
        strand_out = "1"
    elif strand == "-":
        strand_out = "-1"
    elif strand in ("1", "-1"):
        strand_out = strand
    else:
        strand_out = "1" if str(strand_param).strip() not in ("1", "-1") else str(strand_param).strip()

    annotations = {
        "bed_chrom": rchrom,
        "bed_start_0based": start0,
        "bed_end_0based_exclusive": end0,
        "score": score,
    }

    optional_names = [
        "thickStart",
        "thickEnd",
        "itemRgb",
        "blockCount",
        "blockSizes",
        "blockStarts",
    ]

    for i, key in enumerate(optional_names, start=6):
        if len(parts) > i:
            annotations[key] = parts[i]

    if len(parts) > 12:
        annotations["extra_fields"] = parts[12:]

    return {
        "name": name,
        "type": "bed_interval",
        "id": name,

        # Keep xi/xf compatible with the prior script shape.
        # xi is converted to 1-based inclusive.
        # xf is interval length.
        "xi": start0 + 1,
        "xf": max(end0 - start0, 1),

        "strand": strand_out,
        "start": start0,
        "end": end0,
        "start_1based": start0 + 1,
        "end_1based_inclusive": end0,

        "annotations": annotations,
        "quality": "unknown",
    }


def stream_parse_bed(
    bed_path: str,
    chrom_filter: Optional[str],
    start: Optional[int],
    end: Optional[int],
) -> List[Dict[str, object]]:
    results: List[Dict[str, object]] = []

    with open_maybe_gzip(bed_path) as fh:
        for line in fh:
            parsed = parse_bed_line(line)
            if parsed is None:
                continue

            rchrom = str(parsed["annotations"]["bed_chrom"])
            bed_start = int(parsed["annotations"]["bed_start_0based"])
            bed_end = int(parsed["annotations"]["bed_end_0based_exclusive"])

            if not normalize_chrom_match(rchrom, chrom_filter):
                continue

            if not bed_overlaps_query(bed_start, bed_end, start, end):
                continue

            results.append(parsed)

    return results


features = stream_parse_bed(
    bed_path=str(file),
    chrom_filter=_to_optional_str(chrom),
    start=_to_optional_int(startIndex),
    end=_to_optional_int(endIndex),
)

works.resolve({"results": features})
