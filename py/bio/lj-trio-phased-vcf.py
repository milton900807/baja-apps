from ion import works
from subprocess import Popen, PIPE

import gzip
import io
from typing import Dict, List, Optional, TextIO, Tuple


# Params
file = works.param(1)         # path to .vcf.gz (bgzf/tabix indexed preferred) or .vcf
chrom = works.param(2)        # e.g. "chr1" (or "1")
startIndex = int(works.param(3))
endIndex = int(works.param(4))
strand_param = works.param(5)  # "1"/"-1" for strand (legacy); otherwise ignored here

print(f"file {file}")
print(f"chrom {chrom}")
print(f"start {startIndex}")
print(f"end {endIndex}")
print(f"strand {strand_param}")


# ---------------------------
# Helpers: parsing + safety
# ---------------------------
def parse_info_field(info: str) -> Dict[str, str]:
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
    Return: "high" | "medium" | "low" | "unknown"
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


def normalize_chrom_match(record_chrom: str, chrom_filter: Optional[str]) -> bool:
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
    if path.endswith(".gz"):
        try:
            fh = gzip.open(path, "rb")
            fh.peek(1)
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
    process = Popen(["tabix", filename, query], stdout=PIPE, stderr=PIPE)

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


def tabix_header_lines(filename) -> List[str]:
    filename = str(filename).replace("//", "/")
    p = Popen(["tabix", "-H", filename], stdout=PIPE, stderr=PIPE)
    out = p.stdout.read().decode("utf-8", errors="replace").splitlines()
    _ = p.stderr.read()
    _ = p.wait()
    return out


def parse_sample_names_from_header_lines(lines: List[str]) -> List[str]:
    for line in reversed(lines):
        if line.startswith("#CHROM\t") or line.startswith("#CHROM "):
            parts = line.strip().split()
            return parts[9:] if len(parts) > 9 else []
    return []


# ---------------------------
# GT / phasing helpers
# ---------------------------
def parse_gt_details(gt: str) -> Dict[str, object]:
    gt_raw = gt or ""
    gt = (gt or "").strip()
    if not gt or gt in (".", "./.", ".|."):
        return {"gt_raw": gt_raw, "is_phased": False, "a1": None, "a2": None}

    is_phased = "|" in gt
    sep = "|" if is_phased else "/"
    parts = gt.split(sep)
    if len(parts) != 2:
        return {"gt_raw": gt_raw, "is_phased": is_phased, "a1": None, "a2": None}

    a1 = parts[0] if parts[0] != "." else None
    a2 = parts[1] if parts[1] != "." else None
    return {"gt_raw": gt_raw, "is_phased": is_phased, "a1": a1, "a2": a2}


def allele_present(gtp: Dict[str, object], allele_index: int) -> bool:
    sidx = str(allele_index)
    return (gtp.get("a1") == sidx) or (gtp.get("a2") == sidx)


def phasing_for_alt(gtp_child: Dict[str, object], alt_index: int) -> Tuple[bool, bool, str, Optional[int]]:
    sidx = str(alt_index)
    a1, a2 = gtp_child.get("a1"), gtp_child.get("a2")
    on_h1 = (a1 == sidx)
    on_h2 = (a2 == sidx)

    if not gtp_child.get("is_phased"):
        return on_h1, on_h2, "UNPHASED", None

    if on_h1 and not on_h2:
        return True, False, "H1", 1
    if on_h2 and not on_h1:
        return False, True, "H2", 2
    if on_h1 and on_h2:
        return True, True, "BOTH", None
    return False, False, "NONE", None


def infer_hap1_origin_vote(phase_label: str, alt_in_mom: bool, alt_in_dad: bool) -> Optional[str]:
    """
    Vote whether proband H1 is paternal or maternal within a phaseset (PS).
    Informative only if exactly one parent carries ALT.
    """
    if alt_in_mom == alt_in_dad:
        return None
    carrier = "maternal" if alt_in_mom else "paternal"
    noncarrier = "paternal" if alt_in_mom else "maternal"
    if phase_label == "H1":
        return carrier
    if phase_label == "H2":
        return noncarrier
    return None


# ---------------------------
# Identify samples by header names: proband, father, mother, sibling
# ---------------------------
strand_out = "1"
sp = str(strand_param).strip()
if sp in ("1", "-1"):
    strand_out = sp

sample_names: List[str] = []
try:
    hdr = tabix_header_lines(file)
    sample_names = parse_sample_names_from_header_lines(hdr)
except Exception as e:
    print(f"Header via tabix -H unavailable ({type(e).__name__}): {e}")
    sample_names = []


def find_sample_index(name: str) -> Optional[int]:
    if not sample_names:
        return None
    # exact
    try:
        return sample_names.index(name)
    except ValueError:
        pass
    # case-insensitive
    low = [s.lower() for s in sample_names]
    nlow = name.lower()
    return low.index(nlow) if nlow in low else None


proband_index = find_sample_index("proband")
father_index = find_sample_index("father")
mother_index = find_sample_index("mother")
sibling_index = find_sample_index("sibling")  # optional

trio = {
    "proband_index": proband_index,
    "father_index": father_index,
    "mother_index": mother_index,
    "sibling_index": sibling_index,
    "proband_name": "proband" if proband_index is not None else None,
    "father_name": "father" if father_index is not None else None,
    "mother_name": "mother" if mother_index is not None else None,
    "sibling_name": "sibling" if sibling_index is not None else None,
}

print(f"strand_out={strand_out} trio={trio} sample_names={sample_names}")

missing_trio = (proband_index is None) or (father_index is None) or (mother_index is None)


# ---------------------------
# Emit per-record objects
# ---------------------------
def emit_objects_for_record(
    results: List[Dict[str, object]],
    chrom_s: str,
    pos: int,
    vcf_id: str,
    ref: str,
    alts: List[str],
    qual_col: str,
    info: str,
    fmt: str,
    sample_strs: List[str],
):
    gt_child = ""
    gt_father = ""
    gt_mother = ""
    gt_sibling = ""

    gq = None
    dp = None
    phaseset = None

    if fmt and sample_strs and not missing_trio:
        child_map = parse_format_sample(fmt, sample_strs[proband_index])  # type: ignore[arg-type]
        father_map = parse_format_sample(fmt, sample_strs[father_index])  # type: ignore[arg-type]
        mother_map = parse_format_sample(fmt, sample_strs[mother_index])  # type: ignore[arg-type]

        gt_child = child_map.get("GT", "")
        gt_father = father_map.get("GT", "")
        gt_mother = mother_map.get("GT", "")

        gq = child_map.get("GQ")
        dp = child_map.get("DP")

        # PS only meaningful if GT is phased
        phaseset = _to_optional_str(child_map.get("PS")) if ("|" in (gt_child or "")) else None

        if sibling_index is not None and 0 <= sibling_index < len(sample_strs):
            sib_map = parse_format_sample(fmt, sample_strs[sibling_index])
            gt_sibling = sib_map.get("GT", "")

    missing_gt = (not gt_child) or (gt_child in {".", "./.", ".|."})
    qlabel = qualify_call(qual_col=qual_col, info=info, gq=gq, dp=dp, missing_gt=missing_gt)

    gtp_child = parse_gt_details(gt_child)
    gtp_father = parse_gt_details(gt_father)
    gtp_mother = parse_gt_details(gt_mother)
    gtp_sib = parse_gt_details(gt_sibling) if gt_sibling else {"gt_raw": "", "is_phased": False, "a1": None, "a2": None}

    for alt_i, alt in enumerate(alts):
        alt_index = alt_i + 1

        on_h1, on_h2, phase_label, haplotype_id = phasing_for_alt(gtp_child, alt_index)

        alt_in_father = allele_present(gtp_father, alt_index)
        alt_in_mother = allele_present(gtp_mother, alt_index)

        vid = build_id(chrom_s, pos, ref, alt, vcf_id)

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

                "haplotype": haplotype_id,

                "phasing": {
                    "gt": gtp_child.get("gt_raw", ""),
                    "phased": bool(gtp_child.get("is_phased")),
                    "phase_label": phase_label,
                    "on_hap1": on_h1,
                    "on_hap2": on_h2,
                    "allele_index": alt_index,
                    "a1": gtp_child.get("a1"),
                    "a2": gtp_child.get("a2"),
                    "phaseset": phaseset,
                    "haplotype": haplotype_id,

                    "father_gt": gtp_father.get("gt_raw", ""),
                    "mother_gt": gtp_mother.get("gt_raw", ""),
                    "sibling_gt": gtp_sib.get("gt_raw", ""),
                    "alt_in_father": alt_in_father,
                    "alt_in_mother": alt_in_mother,
                },

                # will be overwritten by normalization step
                "phase": 0,
                "phaseset": phaseset,

                "annotations": info,
                "quality": qlabel,
            }
        )


# ---------------------------
# FIXED normalization: do NOT claim paternal/maternal when both parents are 0/0
# ---------------------------
def normalize_phase_across_phasesets(results: List[Dict[str, object]]) -> None:
    """
    Infer hap1 parent per phaseset using ONLY informative variants (exactly one parent carries ALT).
    Then for each variant:
      - If informative -> origin paternal/maternal and phase_norm (paternal=1, maternal=0)
      - If neither parent carries ALT -> origin='de_novo_possible', phase_norm=None
      - If both parents carry ALT -> origin='ambiguous', phase_norm=None
      - If missing parent info -> origin=None, phase_norm=None

    obj["phase"] remains 0/1 for backward compatibility:
      - if phase_norm is available, use it
      - else fall back to (H1=>1 else 0) but origin stays non-parental
    """
    votes: Dict[str, Dict[str, int]] = {}  # PS -> {"paternal":n, "maternal":n}

    # Voting pass
    for obj in results:
        ph = obj.get("phasing") or {}
        ps = ph.get("phaseset") or obj.get("phaseset")
        if not ps:
            continue
        if not ph.get("phased"):
            continue
        lbl = ph.get("phase_label")
        if lbl not in ("H1", "H2"):
            continue

        alt_in_mom = ph.get("alt_in_mother")
        alt_in_dad = ph.get("alt_in_father")
        if not isinstance(alt_in_mom, bool) or not isinstance(alt_in_dad, bool):
            continue

        # informative only
        if alt_in_mom == alt_in_dad:
            continue

        vote = infer_hap1_origin_vote(lbl, alt_in_mom, alt_in_dad)
        if not vote:
            continue

        if ps not in votes:
            votes[ps] = {"paternal": 0, "maternal": 0}
        votes[ps][vote] += 1

    # Decide hap1 parent per PS
    hap1_parent: Dict[str, Optional[str]] = {}
    for ps, d in votes.items():
        p = d.get("paternal", 0)
        m = d.get("maternal", 0)
        if p == 0 and m == 0:
            hap1_parent[ps] = None
        elif p > m:
            hap1_parent[ps] = "paternal"
        elif m > p:
            hap1_parent[ps] = "maternal"
        else:
            hap1_parent[ps] = None  # tie

    # Annotation + normalization per variant
    for obj in results:
        ph = obj.get("phasing")
        if not isinstance(ph, dict):
            continue

        ps = ph.get("phaseset") or obj.get("phaseset")
        lbl = ph.get("phase_label")

        alt_in_mom = ph.get("alt_in_mother")
        alt_in_dad = ph.get("alt_in_father")

        # phaseset orientation (may still be unknown)
        h1p = hap1_parent.get(ps) if ps else None
        h2p = None
        if h1p == "paternal":
            h2p = "maternal"
        elif h1p == "maternal":
            h2p = "paternal"

        ph["hap1_parent"] = h1p
        ph["hap2_parent"] = h2p

        # Variant-specific origin (inheritance-based, not PS-orientation-based)
        origin: Optional[str] = None
        if isinstance(alt_in_mom, bool) and isinstance(alt_in_dad, bool):
            if alt_in_mom and not alt_in_dad:
                origin = "maternal"
            elif alt_in_dad and not alt_in_mom:
                origin = "paternal"
            elif (not alt_in_mom) and (not alt_in_dad):
                origin = "de_novo_possible"
            else:
                origin = "ambiguous"

        ph["origin"] = origin

        # phase_norm only for paternal/maternal
        phase_norm: Optional[int] = None
        if origin == "paternal":
            phase_norm = 1
        elif origin == "maternal":
            phase_norm = 0

        ph["phase_norm"] = phase_norm

        # Backwards-compatible obj["phase"]
        if phase_norm is not None:
            obj["phase"] = phase_norm
        else:
            # keep stable haplotype-local phase (NOT parent-of-origin)
            obj["phase"] = 1 if lbl == "H1" else 0


# ---------------------------
# Main: tabix first, fallback parse if needed
# ---------------------------
results: List[Dict[str, object]] = []
tabix_had_any = False

try:
    for r in tabix_query(file, chrom, startIndex, endIndex):
        tabix_had_any = True

        chrom_s = r[0].decode("utf-8")
        pos = int(r[1].decode("utf-8"))
        vcf_id = r[2].decode("utf-8") if len(r) > 2 else "."
        ref = r[3].decode("utf-8")
        alt_field = r[4].decode("utf-8")
        qual_col = r[5].decode("utf-8") if len(r) > 5 else "."
        info = r[7].decode("utf-8") if len(r) > 7 else "."

        if not normalize_chrom_match(chrom_s, _to_optional_str(chrom)):
            continue
        if not in_range(pos, _to_optional_int(startIndex), _to_optional_int(endIndex)):
            continue

        alts = alt_field.split(",") if alt_field and alt_field != "." else []
        if not alts:
            continue

        fmt = r[8].decode("utf-8") if len(r) > 8 else ""
        sample_strs = [x.decode("utf-8") for x in r[9:]] if len(r) > 9 else []

        emit_objects_for_record(
            results=results,
            chrom_s=chrom_s,
            pos=pos,
            vcf_id=vcf_id,
            ref=ref,
            alts=alts,
            qual_col=qual_col,
            info=info,
            fmt=fmt,
            sample_strs=sample_strs,
        )

except Exception as e:
    print(f"TABIX failed ({type(e).__name__}): {e}")
    tabix_had_any = False


if not tabix_had_any:
    print("No tabix results found; attempting fallback parse...")
    try:
        with open_maybe_gzip(str(file)) as fh:
            for line in fh:
                if not line or line.startswith("#"):
                    continue
                parts = line.rstrip("\n").split()
                if len(parts) < 8:
                    continue

                rchrom = parts[0]
                pos = int(parts[1])
                vcf_id = parts[2] if len(parts) > 2 else "."
                ref = parts[3]
                alt_field = parts[4]
                qual_col = parts[5] if len(parts) > 5 else "."
                info = parts[7] if len(parts) > 7 else "."

                if not normalize_chrom_match(rchrom, _to_optional_str(chrom)):
                    continue
                if not in_range(pos, _to_optional_int(startIndex), _to_optional_int(endIndex)):
                    continue

                alts = alt_field.split(",") if alt_field and alt_field != "." else []
                if not alts:
                    continue

                fmt = parts[8] if len(parts) > 8 else ""
                sample_strs = parts[9:] if len(parts) > 9 else []

                emit_objects_for_record(
                    results=results,
                    chrom_s=rchrom,
                    pos=pos,
                    vcf_id=vcf_id,
                    ref=ref,
                    alts=alts,
                    qual_col=qual_col,
                    info=info,
                    fmt=fmt,
                    sample_strs=sample_strs,
                )
    except RuntimeError as e:
        print(f"FALLBACK skipped: {e}")
        results = []


# Normalize paternal/maternal origin safely (no false paternal/maternal when parents are 0/0)
if not missing_trio:
    normalize_phase_across_phasesets(results)
else:
    print("Trio members could not be identified by header names; returning unnormalized origin.")


works.resolve(
    {
        "trio": trio,
        "sample_names": sample_names,
        "results": results,
    }
)
