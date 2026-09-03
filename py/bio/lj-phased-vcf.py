from ion import works
from subprocess import Popen, PIPE
import os
import gzip
import io
import re
from typing import Dict, List, Optional, TextIO, Tuple

original_file = works.param(1)

chrom = works.param(2)        # e.g. "chr1" (or "1")
startIndex = int(works.param(3))
endIndex = int(works.param(4))
strand_param = works.param(5)  # may be actual strand ("1"/"-1") OR (legacy) sample index




def resolve_file_path(path: str) -> str:
    candidates = [path]

    # 1) $USER_DATA/<path> -- the canonical user-data root baja-server itself uses
    # (src/environment.ts: userData = path.join(homeDir, 'baja-users')), set on EVERY python
    # subprocess by buildPythonEnv() in src/index.ts. Authoritative and correct on any
    # deployment automatically -- checked first so nothing below it is ever needed when the
    # server is wired up normally.
    user_data = os.environ.get("USER_DATA")
    if user_data:
        candidates.append(
            os.path.join(user_data, path.lstrip("/"))
        )

    # 2) $LJUSER_DATA/<path> (an older/alternate name; nothing in this app currently sets
    # it, but a caller might)
    ljuser_data = os.environ.get("LJUSER_DATA")
    if ljuser_data:
        candidates.append(
            os.path.join(ljuser_data, path.lstrip("/"))
        )

    # 3) $HOME/baja-users/<path> -- the real directory name, in case USER_DATA/LJUSER_DATA
    # are both unset for some reason (e.g. run outside baja-server's own spawn path)
    home_dir = os.environ.get("HOME")
    if home_dir:
        candidates.append(
            os.path.join(home_dir, "baja-users", path.lstrip("/"))
        )
        # 4) $HOME/ljusers/<path> -- wrong directory name (there is no "ljusers" anywhere in
        # this app; the real one is "baja-users"), kept only so a path that happened to
        # resolve under the old guess keeps working
        candidates.append(
            os.path.join(home_dir, "ljusers", path.lstrip("/"))
        )

    # 5) /root/baja-users/<path>, /root/ljusers/<path> -- same two, for a root-run server
    candidates.append(
        os.path.join("/root/baja-users", path.lstrip("/"))
    )
    candidates.append(
        os.path.join("/root/ljusers", path.lstrip("/"))
    )

    for candidate in candidates:
        candidate = candidate.replace("//", "/")
        if os.path.exists(candidate):
            print(f"Resolved file path: {candidate}")
            return candidate

    print("Tried file paths:")
    for c in candidates:
        print(f"  - {c}")

    return path  # preserve old behavior if nothing exists

file = resolve_file_path(original_file)

print(f"original file {original_file}")
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


# ---------------------------
# GT/phase parsing (integrated approach)
# ---------------------------
def parse_gt(gt: str) -> Tuple[bool, Optional[int], Optional[int]]:
    """
    Returns: (phased, a1, a2)
    a1/a2 are allele indices (0=REF, 1=ALT1, 2=ALT2, ...) or None if missing '.'.
    """
    if gt is None or gt in {".", "./.", ".|."}:
        return (False, None, None)

    if "|" in gt:
        phased = True
        parts = gt.split("|")
    elif "/" in gt:
        phased = False
        parts = gt.split("/")
    else:
        phased = False
        parts = [gt]

    def to_int(x: str) -> Optional[int]:
        return None if x in (None, "", ".") else int(x)

    if len(parts) == 1:
        return (phased, to_int(parts[0]), None)

    if len(parts) != 2:
        return (phased, None, None)

    return (phased, to_int(parts[0]), to_int(parts[1]))


def parse_phase01_from_gt(gt: str) -> int:
    """
    1 => phased AND ALT on haplotype 1 only (e.g. 1|0, 2|0)
    0 => otherwise
    """
    phased, a1, a2 = parse_gt(gt)
    if not phased:
        return 0

    def is_alt(ai: Optional[int]) -> bool:
        return (ai is not None) and (ai != 0)

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
    return max(len(ref), len(alt), 1)


# ---------------------------
# Structural-variant ALT shapes (symbolic <DEL>/<DUP>/... and BND breakends). A structural-
# variant caller (Sniffles2, cuteSV, ...) does not put sequence in ALT for these -- REF/ALT
# length has nothing to do with the variant's real size, so infer_variant_type/variant_xf
# above would size a multi-kb deletion as a handful of bases (the literal length of the
# string "<DEL>") and would report a BND's bracket-mate-coordinate ALT (e.g.
# "T]chr3:198172701]") as if it were a DNA sequence.
# ---------------------------
SYMBOLIC_ALT_RE = re.compile(r"^<([A-Za-z:]+)>$")
BND_MATE_RE = re.compile(r"[\[\]]([^\[\]:]+):(\d+)[\[\]]")

SYMBOLIC_TYPE_MAP = {
    "DEL": "del", "DUP": "dup", "INV": "inv", "INS": "ins", "CNV": "cnv", "TRA": "bnd",
}


def is_bnd_alt(alt: str) -> bool:
    return "[" in alt or "]" in alt


def bnd_mate_label(alt: str) -> str:
    """The mate breakpoint (e.g. "chr3:198172701") pulled out of standard VCF 4.2 breakend
    ALT syntax, as a human-readable label -- there is no sequence in a BND ALT to show."""
    m = BND_MATE_RE.search(alt)
    return ("→ " + m.group(1) + ":" + m.group(2)) if m else "BND"


def sv_span_from_info(info_map: Dict[str, str], pos: int) -> Optional[int]:
    """Width in bases of a symbolic-ALT SV, from INFO SVLEN (may be reported negative for a
    deletion by some callers, hence abs()) or, failing that, INFO END. None if neither is
    present -- the caller falls back to a 1-base marker rather than guessing."""
    svlen = _to_optional_int(info_map.get("SVLEN"))
    if svlen is not None and svlen != 0:
        return abs(svlen)
    end = _to_optional_int(info_map.get("END"))
    if end is not None and end >= pos:
        return (end - pos) + 1
    return None


def variant_type_span_and_alleles(
    ref: str, alt: str, info_map: Dict[str, str], pos: int
) -> Tuple[str, int, str, str]:
    """(type, xf, reference, alternate) for ONE alt allele -- literal ACGT ref/alt sized and
    typed exactly as before (infer_variant_type/variant_xf, unchanged), a symbolic SV ALT
    typed from INFO SVTYPE and sized from SVLEN/END (since the ALT string itself carries
    neither), or a BND breakend reported as a 1-base junction point with its mate coordinate
    as the alternate label instead of the bracket-mate-coordinate string."""
    if is_bnd_alt(alt):
        return "bnd", 1, ref, bnd_mate_label(alt)

    m = SYMBOLIC_ALT_RE.match(alt)
    if m:
        svtype = (info_map.get("SVTYPE") or m.group(1).split(":")[0]).upper()
        span = sv_span_from_info(info_map, pos) or 1
        return SYMBOLIC_TYPE_MAP.get(svtype, "sv"), span, ref, alt

    return infer_variant_type(ref, alt), variant_xf(ref, alt), ref, alt


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


def extract_sample_call(fmt: str, sample_str: str) -> Dict[str, Optional[str]]:
    """
    Extracts fields from a sample column given FORMAT.
    Returns dict with keys GT, GQ, DP, PS (if present).
    """
    smap = parse_format_sample(fmt, sample_str)
    gt = smap.get("GT") or ""
    gq = smap.get("GQ")
    dp = smap.get("DP")
    ps = smap.get("PS")  # <-- the standard phase-set field in FORMAT
    if ps in (None, "", "."):
        ps = None
    return {"GT": gt, "GQ": gq, "DP": dp, "PS": ps}


def open_maybe_gzip(path: str) -> TextIO:
    """
    Safe opener:
    - .vcf     -> open()
    - .vcf.gz  -> gzip.open(). BGZF (the block-gzip tabix itself indexes) is valid
      multi-member gzip, so Python's gzip module streams it sequentially just fine -- it
      just can't use the BGZF index for random access, which this fallback (only reached
      when tabix itself already failed) never does anyway. Verified directly against a real
      BGZF VCF.

    Two DIFFERENT failure modes used to come out of the same except-OSError as one misleading
    message ("looks like BGZF/tabix-compressed; cannot stream-parse with gzip") -- including
    a resolve_file_path() miss (a FileNotFoundError, which IS an OSError subtype) reported as
    if the file were an unreadable BGZF, when the real problem was that it was never found at
    all. Split apart here so the actual cause is what gets reported.
    """
    if path.endswith(".gz"):
        if not os.path.exists(path):
            raise RuntimeError(f"{path} does not exist (resolve_file_path could not find it)")
        try:
            fh = gzip.open(path, "rb")
            fh.peek(1)  # validate gzip header
            return io.TextIOWrapper(fh, encoding="utf-8", errors="replace")
        except OSError as e:
            raise RuntimeError(f"{path} is not a readable gzip file: {e}")
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

    if rc != 0 and not saw_output:
        return

    if rc != 0:
        raise RuntimeError(f"tabix exited with code {rc}")


# ---------------------------
# Decide: strand vs sample index (backwards compatible)
# ---------------------------
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
# PRIMARY record->result conversion
# Returns:
#   phase: { "phase01": <0/1>, "phased": <0/1>, "ps": <PS or None>, "gt": <GT> }
# where "ps" is the VCF FORMAT PS value when present.
# ---------------------------
def record_to_results(
    rchrom: str,
    pos: int,
    vcf_id: str,
    ref: str,
    alt_field: str,
    qual_col: str,
    info: str,
    fmt: str,
    samples: List[str],
    sample_index: int,
) -> List[Dict[str, object]]:
    alts = alt_field.split(",") if alt_field and alt_field != "." else []
    if not alts:
        return []

    gt = ""
    gq = None
    dp = None
    ps = None
    missing_gt = True

    phased_flag = 0
    phase01 = 0

    if fmt and samples:
        chosen = samples[sample_index] if (0 <= sample_index < len(samples)) else samples[0]
        call = extract_sample_call(fmt, chosen)
        gt = call["GT"] or ""
        gq = call["GQ"]
        dp = call["DP"]
        ps = call["PS"]  # <-- PHASE SET ID from FORMAT PS
        missing_gt = (not gt) or (gt in {".", "./.", ".|."})

        phased_flag = 1 if ("|" in gt) else 0
        phase01 = parse_phase01_from_gt(gt)

    qlabel = qualify_call(qual_col=qual_col, info=info, gq=gq, dp=dp, missing_gt=missing_gt)
    info_map = parse_info_field(info)

    out: List[Dict[str, object]] = []
    for alt in alts:
        # build_id keeps the ORIGINAL alt string (VCF-stable, unique) even though a symbolic
        # or BND alt gets a different, human-readable value below for display/rendering.
        vid = build_id(rchrom, pos, ref, alt, vcf_id)
        vtype, xf, out_ref, out_alt = variant_type_span_and_alleles(ref, alt, info_map, pos)
        out.append(
            {
                "name": vid,
                "type": vtype,
                "id": vid,
                "xi": pos,
                "xf": xf,
                "strand": strand_out,
                "alternate": out_alt,
                "reference": out_ref,
                # phase object includes PS (phase-set id)
                "phase": {
                    "phase01": phase01,
                    "phased": phased_flag,
                    "ps": ps,      # <-- this is the phase set id from FORMAT:PS
                    "gt": gt,
                },
                "annotations": info,
                "quality": qlabel,
            }
        )
    return out


def stream_parse_vcf(vcf_path: str, chrom_filter: Optional[str], start: Optional[int], end: Optional[int], sample_index: int):
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

            fmt = parts[8] if len(parts) > 8 else ""
            samples = parts[9:] if len(parts) > 9 else []

            results.extend(
                record_to_results(
                    rchrom=rchrom,
                    pos=pos,
                    vcf_id=vcf_id,
                    ref=ref,
                    alt_field=alt_field,
                    qual_col=qual_col,
                    info=info,
                    fmt=fmt,
                    samples=samples,
                    sample_index=sample_index,
                )
            )

    return results


# ---------------------------
# Main logic: try tabix; if none (or tabix missing), fallback safely
# ---------------------------
snps: List[Dict[str, object]] = []
tabix_had_any = False

try:
    for r in tabix_query(file, chrom, startIndex, endIndex):
        tabix_had_any = True

        chrom_s = r[0].decode("utf-8")
        pos = int(r[1].decode("utf-8"))
        vcf_id = r[2].decode("utf-8") if len(r) > 2 else "."
        ref = r[3].decode("utf-8") if len(r) > 3 else "."
        alt_field = r[4].decode("utf-8") if len(r) > 4 else "."
        qual_col = r[5].decode("utf-8") if len(r) > 5 else "."
        info = r[7].decode("utf-8") if len(r) > 7 else "."

        fmt = r[8].decode("utf-8") if len(r) > 8 else ""
        samples = [x.decode("utf-8") for x in r[9:]] if len(r) > 9 else []

        snps.extend(
            record_to_results(
                rchrom=chrom_s,
                pos=pos,
                vcf_id=vcf_id,
                ref=ref,
                alt_field=alt_field,
                qual_col=qual_col,
                info=info,
                fmt=fmt,
                samples=samples,
                sample_index=sample_index,
            )
        )

except Exception as e:
    print(f"TABIX failed ({type(e).__name__}): {e}")
    tabix_had_any = False


if not tabix_had_any:
    print("No tabix results found; attempting stream-parse fallback...")

    try:
        snps = stream_parse_vcf(
            vcf_path=str(file),
            chrom_filter=_to_optional_str(chrom),
            start=_to_optional_int(startIndex),
            end=_to_optional_int(endIndex),
            sample_index=sample_index,
        )
    except RuntimeError as e:
        print(f"FALLBACK skipped: {e}")
        snps = []


works.resolve({"results": snps})
