from ion import works
from subprocess import Popen, PIPE

import gzip
import io
import json
from typing import Dict, List, Optional, TextIO, Tuple


file = works.param(1)         # path to .vcf.gz (or .vcf)
chrom = works.param(2)        # e.g. "chr1" (or "1")
startIndex = int(works.param(3))
endIndex = int(works.param(4))
strand_param = works.param(5)  # may be actual strand ("1"/"-1") OR (legacy) sample index

print(f"file {file}")
print(f"chrom {chrom}")
print(f"start {startIndex}")
print(f"end {endIndex}")
print(f"strand/sampleIndex {strand_param}")


# ---------------------------
# Helpers: parsing + safety
# ---------------------------
def parse_info_field(info: str) -> Dict[str, str]:
    """Parse INFO like AF=0.625;AQ=36;AN=8;AC=5 into dict."""
    out: Dict[str, str] = {}
    if not info or info == ".":
        return out
    for item in info.split(";"):
        item = item.strip()
        if not item:
            continue
        if "=" in item:
            k, v = item.split("=", 1)
            out[k] = v
        else:
            out[item] = "true"
    return out


def _to_float(x: Optional[str]) -> Optional[float]:
    if x is None:
        return None
    s = str(x).strip()
    if s in ("", ".", "None", "null", "NULL"):
        return None
    # handle comma-separated values by taking the first
    if "," in s:
        s = s.split(",", 1)[0]
    try:
        return float(s)
    except Exception:
        return None


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


def qualify_call(
    qual_col: Optional[str],
    info: str,
    gq: Optional[str],
    dp: Optional[str],
    missing_gt: bool = False,
) -> str:
    """
    Return a ONE-WORD qualitative label: "high" | "medium" | "low" | "unknown".

    Priority:
      1) missing genotype => unknown
      2) GQ (sample)      => >=30 high, 20-29 medium, <20 low
      3) QUAL (col 6)     => >=50 high, 30-49 medium, <30 low
      4) AQ (INFO)        => >=50 high, 30-49 medium, <30 low
      5) DP (sample)      => >=10 medium else low
      6) unknown
    """
    if missing_gt:
        return "unknown"

    gq_f = _to_float(gq)
    if gq_f is not None:
        if gq_f >= 30:
            return "high"
        if gq_f >= 20:
            return "medium"
        return "low"

    qual_f = _to_float(qual_col)
    if qual_f is not None:
        if qual_f >= 50:
            return "high"
        if qual_f >= 30:
            return "medium"
        return "low"

    info_map = parse_info_field(info)
    aq_f = _to_float(info_map.get("AQ"))
    if aq_f is not None:
        if aq_f >= 50:
            return "high"
        if aq_f >= 30:
            return "medium"
        return "low"

    dp_f = _to_float(dp)
    if dp_f is not None:
        if dp_f >= 10:
            return "medium"
        return "low"

    return "unknown"


def parse_phase01_from_gt(gt: str) -> int:
    """
    Return phase as:
      1 => phased AND ALT is on haplotype 1 (e.g. 1|0, 2|0, etc.)
      0 => otherwise (unphased, ALT on hap2, both, none, missing, non-diploid)
    """
    if not gt or gt in {".", "./.", ".|."}:
        return 0

    if "|" not in gt:
        return 0

    parts = gt.split("|")
    if len(parts) != 2:
        return 0

    a1, a2 = parts[0], parts[1]

    def is_alt(a: str) -> bool:
        return (a is not None) and (a != ".") and (a != "0")

    return 1 if (is_alt(a1) and not is_alt(a2)) else 0


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


def variant_xf(ref: str, alt: str) -> int:
    """
    Size-like field.
    If you truly want xf=1 always, change this to `return 1`.
    """
    return max(len(ref), len(alt), 1)


def normalize_chrom_match(record_chrom: str, chrom_filter: Optional[str]) -> bool:
    """Match chrom with/without chr prefix."""
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


def parse_format_sample(fmt: str, sample: str) -> Dict[str, str]:
    keys = fmt.split(":") if fmt else []
    vals = sample.split(":") if sample else []
    out: Dict[str, str] = {}
    for i, k in enumerate(keys):
        out[k] = vals[i] if i < len(vals) else ""
    return out


def open_maybe_gzip(path: str) -> TextIO:
    """
    Safe opener:
    - .vcf  -> open()
    - .vcf.gz -> ONLY try gzip if it is real gzip
      (BGZF/tabix-compressed will be rejected; caller should handle)
    """
    if path.endswith(".gz"):
        try:
            fh = gzip.open(path, "rb")
            fh.peek(1)  # validate gzip header
            return io.TextIOWrapper(fh, encoding="utf-8", errors="replace")
        except OSError:
            raise RuntimeError(
                f"{path} looks like BGZF/tabix-compressed; cannot stream-parse with gzip. "
                "Use tabix (preferred) or provide an uncompressed .vcf for fallback parsing."
            )
    return open(path, "r", encoding="utf-8", errors="replace")


def tabix_query(filename, chrom, start, end):
    query = f"{chrom}:{start}-{end}"
    filename = str(filename).replace("//", "/")

    process = Popen(
        ["tabix", filename, query],
        stdout=PIPE,
        stderr=PIPE
    )

    saw_output = False

    for raw in process.stdout:
        saw_output = True
        yield raw.rstrip(b"\n").split(b"\t")

    stderr = process.stderr.read().decode("utf-8", errors="replace").strip()
    rc = process.wait()

    if stderr:
        print("TABIX STDERR:", stderr)

    # Treat "no records found"/"region not found" as empty.
    if rc != 0 and not saw_output:
        return

    if rc != 0:
        raise RuntimeError(f"tabix exited with code {rc}")


# ---------------------------
# Decide: strand vs sample index (backwards compatible)
# ---------------------------
# If user passes "1" or "-1", treat as strand. Otherwise treat as sample index.
strand_out = "1"
sample_index = 0

sp = str(strand_param).strip()
if sp in ("1", "-1"):
    strand_out = sp
    sample_index = 0
else:
    si = _to_optional_int(sp)
    sample_index = int(si) if si is not None else 0
    strand_out = "1"

print(f"interpreted strand_out={strand_out}, sample_index={sample_index}")


# ---------------------------
# Fallback: stream-parse VCF (ONLY if real gzip or plain VCF)
# ---------------------------
def fallback_parse_vcf(vcf_path: str, chrom_filter: Optional[str], start: Optional[int], end: Optional[int], sample_index: int):
    results: List[Dict[str, object]] = []
    with open_maybe_gzip(vcf_path) as fh:
        for line in fh:
            if not line or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 8:
                continue

            rchrom = parts[0]
            pos = int(parts[1])
            vcf_id = parts[2] if len(parts) > 2 else "."
            ref = parts[3]
            alt_field = parts[4]
            qual_col = parts[5] if len(parts) > 5 else "."
            info = parts[7] if len(parts) > 7 else "."

            if not normalize_chrom_match(rchrom, chrom_filter):
                continue
            if not in_range(pos, start, end):
                continue

            alts = alt_field.split(",") if alt_field and alt_field != "." else []
            if not alts:
                continue

            fmt = parts[8] if len(parts) > 8 else ""
            samples = parts[9:] if len(parts) > 9 else []

            gt = ""
            gq = None
            dp = None
            missing_gt = True
            phase01 = 0

            if fmt and samples and 0 <= sample_index < len(samples):
                smap = parse_format_sample(fmt, samples[sample_index])
                gt = smap.get("GT", "")
                missing_gt = (not gt) or (gt in {".", "./.", ".|."})
                phase01 = parse_phase01_from_gt(gt)  # unified semantics
                gq = smap.get("GQ")
                dp = smap.get("DP")

            qlabel = qualify_call(qual_col=qual_col, info=info, gq=gq, dp=dp, missing_gt=missing_gt)

            for alt in alts:
                vid = build_id(rchrom, pos, ref, alt, vcf_id)
                results.append(
                    {
                        "name": vid,
                        "type": infer_variant_type(ref, alt),
                        "id": vid,
                        "xi": pos,
                        "xf": variant_xf(ref, alt),
                        "strand": strand_out,
                        "alternate": alt,
                        "reference": ref,
                        "phase": phase01,
                        "annotations": info,
                        "quality": qlabel,
                    }
                )

    return results


# ---------------------------
# Main logic: try tabix; if none (or tabix missing), fallback safely
# ---------------------------
snps: List[Dict[str, object]] = []
tabix_had_any = False
tabix_failed = False

try:
    for r in tabix_query(file, chrom, startIndex, endIndex):
        tabix_had_any = True

        # VCF columns:
        # 0 CHROM, 1 POS, 2 ID, 3 REF, 4 ALT, 5 QUAL, 6 FILTER, 7 INFO, 8 FORMAT, 9... samples
        chrom_s = r[0].decode("utf-8")
        pos = int(r[1].decode("utf-8"))
        vcf_id = r[2].decode("utf-8")
        ref = r[3].decode("utf-8")
        alt_field = r[4].decode("utf-8")
        qual_col = r[5].decode("utf-8") if len(r) > 5 else "."
        info = r[7].decode("utf-8") if len(r) > 7 else "."

        alts = alt_field.split(",") if alt_field and alt_field != "." else []
        if not alts:
            continue

        # Parse FORMAT/sample (pick sample_index if present; else use first sample if any)
        gt = ""
        gq = None
        dp = None
        missing_gt = True
        phase01 = 0

        if len(r) >= 10:
            fmt_keys = r[8].decode("utf-8").split(":")
            samples = [x.decode("utf-8") for x in r[9:]]
            chosen_sample = samples[sample_index] if (0 <= sample_index < len(samples)) else (samples[0] if samples else "")
            sample_vals = chosen_sample.split(":")
            fmt_map = {k: i for i, k in enumerate(fmt_keys)}

            if "GT" in fmt_map and fmt_map["GT"] < len(sample_vals):
                gt = sample_vals[fmt_map["GT"]]
                missing_gt = (not gt) or (gt in {".", "./.", ".|."})
                phase01 = parse_phase01_from_gt(gt)

            if "GQ" in fmt_map and fmt_map["GQ"] < len(sample_vals):
                gq = sample_vals[fmt_map["GQ"]]

            if "DP" in fmt_map and fmt_map["DP"] < len(sample_vals):
                dp = sample_vals[fmt_map["DP"]]

        qlabel = qualify_call(qual_col=qual_col, info=info, gq=gq, dp=dp, missing_gt=missing_gt)

        for alt in alts:
            vid = build_id(chrom_s, pos, ref, alt, vcf_id)
            snps.append(
                {
                    "name": vid,
                    "type": infer_variant_type(ref, alt),
                    "id": vid,
                    "xi": pos,
                    "xf": variant_xf(ref, alt),
                    "strand": strand_out,
                    "alternate": alt,
                    "reference": ref,
                    "phase": phase01,
                    "annotations": info,
                    "quality": qlabel,
                }
            )

except Exception as e:
    print(f"TABIX failed ({type(e).__name__}): {e}")
    tabix_failed = True
    tabix_had_any = False


# If no tabix hits, attempt fallback.
# If fallback detects BGZF, do NOT crash: return empty results.
if not tabix_had_any:
    print("No tabix results found; attempting fallback parse...")

    try:
        snps = fallback_parse_vcf(
            vcf_path=str(file),
            chrom_filter=_to_optional_str(chrom),
            start=_to_optional_int(startIndex),
            end=_to_optional_int(endIndex),
            sample_index=sample_index,
        )
    except RuntimeError as e:
        # Typically BGZF error; safest behavior is to return empty.
        print(f"FALLBACK skipped: {e}")
        snps = []


works.resolve({"results": snps})
