"""Repeat / transposable-element features for a region, from Ensembl.

    exec('py/bio/repeats/ensembl-repeats.py', chr, start, end, strand, species)

Why this exists: an off-target count tells you a window is repetitive, not WHICH
element it came from or which way round it sits, and for splicing the orientation
is the whole question. Antisense SINEs are the ones that exonize, because the
poly(A) tail of the element reads as a poly-T tract on the transcribed strand and
serves as the polypyrimidine tract for a cryptic 3' splice site. The same element
in sense orientation does not do that. So every feature here carries `relative`,
sense or antisense with respect to the GENE, which is the field to group on.

Params:
  param(1) : chromosome, with or without a 'chr' prefix
  param(2) : start, 1-based inclusive
  param(3) : end, 1-based inclusive
  param(4) : gene strand, +1 or -1. Decides `relative`; omit and everything reads
             as sense, which for this purpose is the same as having no answer.
  param(5) : species, default 'human'

Resolves {region, count, repeats (JSON), byClass, byRelative, warnings}.

Ensembl gives the repeat's name and strand but not RepeatMasker's own class and
family columns, so `cls` here is derived from the name by the table below. It is
good enough to group Alu from L1 from simple repeats and is NOT a substitute for a
RepeatMasker .out file; anything it does not recognise is reported as 'other'
rather than guessed at.
"""

import json
import re
import sys
import urllib.request

ENSEMBL = "https://rest.ensembl.org"
TIMEOUT = 60
MAX_SPAN = 5_000_000

# Name prefix -> class/family. Ordered: the first match wins, so put the specific
# prefixes above the general ones.
CLASS_RULES = [
    # Ensembl returns its masking analyses under their own names rather than a
    # repeat name: 'dust' is the low-complexity masker and 'trf' the tandem-repeat
    # finder. They are not elements and must not sit in the same bucket as an
    # unrecognised one, or two thirds of a locus reads as 'other'.
    (r"^dust$", "Low complexity"),
    (r"^trf$", "Simple"),
    (r"^(Alu|FLAM|FRAM|FLA)", "SINE/Alu"),
    (r"^MIR", "SINE/MIR"),
    (r"^SVA", "Retroposon/SVA"),
    (r"^(L1|HAL1)", "LINE/L1"),
    (r"^(L2|L3|L4)", "LINE/L2"),
    (r"^CR1", "LINE/CR1"),
    (r"^(HERV|ERV|LTR|MLT|MST|THE1|MSTA|HUERS|PABL|HARLEQUIN)", "LTR"),
    (r"^(Charlie|Tigger|Looper|Zaphod|Arthur|Cheshire|MARE|Kanga|Merlin|HSMAR|MADE)", "DNA"),
    (r"^(tRNA|rRNA|snRNA|scRNA|srpRNA|RNA[0-9])", "RNA"),
    (r"^(ALR|BSR|GSAT|HSAT|SAT|LSAU|REP522|ACRO|TAR1)", "Satellite"),
    (r"(\([ACGTN]+\)n|-rich|^poly)", "Simple"),
]
# Classes that actually exonize. Used only to flag rows, never to drop any.
EXONIZING = ("SINE/Alu", "SINE/MIR", "Retroposon/SVA")


def classify(name):
    for pattern, cls in CLASS_RULES:
        if re.search(pattern, name, re.I):
            return cls
    return "other"


def fetch(chrom, start, end, species="human"):
    chrom = str(chrom).replace("chr", "").strip()
    url = "%s/overlap/region/%s/%s:%d-%d?feature=repeat;content-type=application/json" % (
        ENSEMBL, species, chrom, int(start), int(end))
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=TIMEOUT).read())


def run(chrom, start, end, gene_strand=1, species="human"):
    warnings = []
    start, end = int(start), int(end)
    if end < start:
        start, end = end, start
    if (end - start) > MAX_SPAN:
        warnings.append("region is %.1f Mb; truncated to the first %.1f Mb"
                        % ((end - start) / 1e6, MAX_SPAN / 1e6))
        end = start + MAX_SPAN

    try:
        raw = fetch(chrom, start, end, species)
    except Exception as exc:                            # noqa: BLE001
        return {"region": "%s:%d-%d" % (chrom, start, end), "count": 0,
                "repeats": json.dumps([]), "byClass": {}, "byRelative": {},
                "warnings": ["could not reach Ensembl: %s: %s"
                             % (exc.__class__.__name__, exc)]}

    gs = 1 if int(gene_strand or 1) >= 0 else -1
    if not gene_strand:
        warnings.append("no gene strand given, so every element reads as sense; "
                        "for exonization the antisense ones are the question")

    # Ensembl returns each feature once per analysis that called it, so the same
    # element arrives two or three times. Key on the coordinates and name.
    seen, out = set(), []
    for r in raw:
        name = str(r.get("description") or "").strip()
        key = (int(r["start"]), int(r["end"]), name, int(r.get("strand") or 1))
        if key in seen:
            continue
        seen.add(key)
        rs = 1 if int(r.get("strand") or 1) >= 0 else -1
        cls = classify(name)
        out.append({
            "start": int(r["start"]), "end": int(r["end"]),
            "length": int(r["end"]) - int(r["start"]) + 1,
            "name": name, "cls": cls,
            "strand": rs,
            "relative": "sense" if rs == gs else "antisense",
            "exonizing": cls in EXONIZING,
        })
    out.sort(key=lambda d: (d["start"], d["end"]))

    # TE classes versus the masker output, counted apart: a locus is mostly dust and
    # trf by number, and saying "127 repeats" without that split overstates it.
    NON_TE = ("Low complexity", "Simple", "Satellite", "RNA")
    n_te = sum(1 for d in out if d["cls"] not in NON_TE and d["cls"] != "other")

    by_class, by_rel = {}, {}
    for d in out:
        by_class[d["cls"]] = by_class.get(d["cls"], 0) + 1
        by_rel[d["relative"]] = by_rel.get(d["relative"], 0) + 1
    # The combination worth seeing at a glance.
    anti_sine = sum(1 for d in out if d["exonizing"] and d["relative"] == "antisense")

    return {"region": "%s:%d-%d" % (chrom, start, end), "count": len(out),
            "transposonCount": n_te,
            "repeats": json.dumps(out), "byClass": by_class, "byRelative": by_rel,
            "antisenseExonizing": anti_sine, "geneStrand": gs,
            "warnings": warnings}


if __name__ == "__main__":
    try:
        from ion import works
    except ImportError:
        a = sys.argv[1:]
        if len(a) < 3:
            sys.exit("usage: ensembl-repeats.py <chr> <start> <end> [geneStrand] [species]")
        res = run(a[0], a[1], a[2], a[3] if len(a) > 3 else 1,
                  a[4] if len(a) > 4 else "human")
        reps = json.loads(res.pop("repeats"))
        print(json.dumps(res, indent=2))
        for d in reps[:40]:
            print("  %9d-%-9d %-5s %-16s %-10s %s" % (
                d["start"], d["end"], "+" if d["strand"] > 0 else "-",
                d["name"], d["cls"], d["relative"]))
    else:
        works.resolve(run(works.param(1), works.param(2), works.param(3),
                          works.param(4), works.param(5) or "human"))
