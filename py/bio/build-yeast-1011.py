"""Fetch the 1011 yeast genomes variant matrix and repack it for the chromosome view.
OFFLINE / BACKGROUND BUILDER.

    python3 py/bio/build-yeast-1011.py [<out-dir>] [--keep-source]

Peter et al. 2018 (Nature 556:339) sequenced 1,011 Saccharomyces cerevisiae isolates and
published every SNP and indel they called as ONE population VCF:

    http://1002genomes.u-strasbg.fr/files/1011Matrix.gvcf.gz     5.4 GB, bgzipped

It is 1.7 million sites by 1,011 strains, and each line carries all 1,011 genotypes -- so
the file is enormous, slow to slice, and hopeless to hand a browser. But almost every
question the chromosome view asks of it is one of two shapes:

    which sites vary at all, and how often          -> a per-site table
    which of those does strain X carry              -> one strain's column of genotypes

So this reads the matrix once and writes it the other way round:

    <out-dir>/1011Matrix.gvcf.gz        the source, kept unless --keep-source is absent
                                        AND the build succeeded (it is 5.4 GB)
    <out-dir>/strains.txt               1,011 strain names, in VCF column order
    <out-dir>/sites/index.json          {chrom: {offset, count, length}, total, built}
    <out-dir>/sites/<chrom>.tsv         pos  id  ref  alt  qual  ac  an  af     (chrI..chrXVI)
    <out-dir>/gt.bin                    one byte per (strain, site), STRAIN-MAJOR:
                                        strain j's genotypes are bytes [j*total, (j+1)*total)
    <out-dir>/build.json                progress, for py/bio/yeast-1011.py status

A genotype byte is (allele1 << 4) | allele2, alleles indexed as the VCF does -- 0 is the
reference, 1 the first ALT -- and 0xF is a missing allele, so 0x00 is hom-ref, 0x01 het,
0x11 hom-alt, 0xFF no call. Alleles beyond 14 (there are none in this set) clamp to 14.

CHROMOSOMES ARE RENAMED on the way through. The matrix calls them chromosome1..16; the
karyotype, the sacCer3 FASTA and SGD call them chrI..chrXVI, and one spelling in the tables
is worth more than fidelity to the source.

Resumable: an interrupted download continues from the bytes it has; an interrupted repack
starts over (it is ten minutes). Progress goes to build.json so a caller can poll it, and
the whole thing needs nothing beyond the standard library.
"""
import gzip
import json
import os
import sys
import time
import urllib.request

URL = "http://1002genomes.u-strasbg.fr/files/1011Matrix.gvcf.gz"
DEFAULT_OUT = "reference_data/variants/yeast1011"

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = set(a for a in sys.argv[1:] if a.startswith("--"))
OUT = args[0] if args else DEFAULT_OUT
KEEP_SOURCE = "--keep-source" in flags

SRC = os.path.join(OUT, "1011Matrix.gvcf.gz")
PART = SRC + ".part"
BUILD = os.path.join(OUT, "build.json")
SITES = os.path.join(OUT, "sites")
GT = os.path.join(OUT, "gt.bin")
GT_TMP = os.path.join(OUT, "gt.site-major.tmp")

ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
         "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"]


def chrom_name(raw):
    """chromosome4 -> chrIV; 4 -> chrIV; chrIV stays; anything else is left alone."""
    t = raw.strip()
    low = t.lower()
    for pre in ("chromosome", "chrom", "chr"):
        if low.startswith(pre):
            tail = t[len(pre):]
            break
    else:
        tail = t
    if tail.isdigit() and 0 < int(tail) < len(ROMAN):
        return "chr" + ROMAN[int(tail)]
    if tail.lower() in ("mito", "mt", "m"):
        return "chrM"
    return t if low.startswith("chr") else ("chr" + tail)


started = int(time.time())


def progress(phase, **kw):
    """build.json is the only voice this has: it is meant to run unattended."""
    doc = {"phase": phase, "pid": os.getpid(), "started": started,
           "updated": int(time.time()), "url": URL}
    doc.update(kw)
    tmp = BUILD + ".tmp"
    try:
        with open(tmp, "w") as fh:
            json.dump(doc, fh)
        os.replace(tmp, BUILD)
    except Exception:
        pass
    print("%s %s" % (phase, json.dumps(kw)[:200]), flush=True)


def download():
    """Resumable: a .part file is continued from its own length with a Range request."""
    if os.path.exists(SRC):
        return
    have = os.path.getsize(PART) if os.path.exists(PART) else 0
    for attempt in range(1, 21):
        req = urllib.request.Request(URL)
        if have:
            req.add_header("Range", "bytes=%d-" % have)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                total = have
                cl = r.headers.get("Content-Length")
                if cl:
                    total = have + int(cl)
                if have and r.status != 206:
                    have = 0           # the server ignored the range: start over
                    mode = "wb"
                else:
                    mode = "ab" if have else "wb"
                last = 0
                with open(PART, mode) as out:
                    while True:
                        chunk = r.read(4 * 1024 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)
                        have += len(chunk)
                        if have - last >= 64 * 1024 * 1024:
                            last = have
                            progress("downloading", bytes=have, total=total,
                                     pct=round(100.0 * have / total, 1) if total else 0)
            if total and have < total:
                raise IOError("connection closed at %d of %d bytes" % (have, total))
            os.replace(PART, SRC)
            progress("downloaded", bytes=have, total=have, pct=100)
            return
        except Exception as e:
            progress("downloading", bytes=have, error=str(e), attempt=attempt,
                     note="retrying in 30 s")
            time.sleep(30)
    raise IOError("the download did not finish after 20 attempts")


def gt_code_slow(g):
    """The general case: '0/1:...' or '2|0' or a haploid '1' or './.'."""
    call = g.split(":", 1)[0].rstrip("\n")
    sep = "/" if "/" in call else ("|" if "|" in call else "")
    parts = call.split(sep) if sep else [call]
    vals = []
    for p in parts[:2]:
        if p == "." or p == "":
            vals.append(15)
        else:
            try:
                vals.append(min(14, int(p)))
            except ValueError:
                vals.append(15)
    if len(vals) == 1:
        vals.append(vals[0])
    return (vals[0] << 4) | vals[1]


def repack():
    """One pass over the matrix: per-site tables plus a SITE-major genotype scratch file,
    then a second pass turning the scratch file strain-major."""
    os.makedirs(SITES, exist_ok=True)
    src_size = os.path.getsize(SRC)
    strains = []
    cache = {}                       # first three chars of a genotype field -> code
    chrom_files = {}                 # chrom -> open tsv
    index = {}                       # chrom -> {offset, count, length}
    order = []
    total = 0
    n_strains = 0
    last_report = 0
    with open(SRC, "rb") as raw, open(GT_TMP, "wb") as tmp:
        gz = gzip.GzipFile(fileobj=raw)
        for line in gz:
            if line[:1] == b"#":
                if line.startswith(b"#CHROM"):
                    cols = line.decode("ascii", "replace").rstrip("\n").split("\t")
                    strains = cols[9:]
                    n_strains = len(strains)
                    with open(os.path.join(OUT, "strains.txt"), "w") as fh:
                        fh.write("\n".join(strains) + "\n")
                    progress("reading", strains=n_strains, sites=0, bytes=0, total=src_size, pct=0)
                continue
            f = line.decode("ascii", "replace").split("\t", 9)
            if len(f) < 10:
                continue
            chrom = chrom_name(f[0])
            # ALT is kept POSITIONALLY: a genotype of 0/2 means the second ALT, and dropping
            # a '*' (a spanning deletion) or a <SYMBOLIC> allele from the list would shift
            # every allele after it. Sites with nothing drawable at all are skipped.
            alts = f[4].split(",")
            if f[3] == "." or not any(a and a != "*" and a[0] != "<" for a in alts):
                continue
            info = f[7]
            ac = an = af = ""
            for kv in info.split(";"):
                if kv.startswith("AC="):
                    ac = kv[3:]
                elif kv.startswith("AN="):
                    an = kv[3:]
                elif kv.startswith("AF="):
                    af = kv[3:]
            if chrom not in chrom_files:
                chrom_files[chrom] = open(os.path.join(SITES, chrom + ".tsv"), "w")
                index[chrom] = {"offset": total, "count": 0, "length": 0}
                order.append(chrom)
            entry = index[chrom]
            pos = int(f[1])
            entry["count"] += 1
            if pos > entry["length"]:
                entry["length"] = pos
            chrom_files[chrom].write("\t".join([
                f[1], f[2] if f[2] != "." else "", f[3], ",".join(alts),
                f[5] if f[5] != "." else "", ac, an, af]) + "\n")
            # The genotypes. Nearly every field begins 0/0, 0/1, 1/1 or ./. and the cache
            # answers those; anything else (an allele index of 10 or more, a haploid call)
            # takes the slow road once and is cached by its own three characters only
            # when those three characters are the whole call.
            gts = f[9].split("\t")
            codes = [cache.get(g[:3]) for g in gts]
            if None in codes:
                for i, g in enumerate(gts):
                    if codes[i] is None:
                        c = gt_code_slow(g)
                        codes[i] = c
                        k = g[:3]
                        if len(g) == 3 or (len(g) > 3 and g[3] in ":\n"):
                            cache[k] = c
            if len(codes) != n_strains:
                # A short line is a broken line; a genotype matrix with a ragged edge
                # would put every later strain one column off.
                codes = (codes + [0xFF] * n_strains)[:n_strains]
            tmp.write(bytes(codes))
            total += 1
            if (total & 8191) == 0:
                at = raw.tell()
                if at - last_report >= 32 * 1024 * 1024:
                    last_report = at
                    progress("reading", strains=n_strains, sites=total, bytes=at,
                             total=src_size, pct=round(100.0 * at / src_size, 1))
    for fh in chrom_files.values():
        fh.close()
    if not total or not n_strains:
        raise ValueError("no variant lines were read from %s" % SRC)

    # Sites in a chromosome's file sit in the order the VCF had them, which is sorted; the
    # index stores the chromosomes in the order they were met so a whole-genome walk can
    # follow byte order.
    with open(os.path.join(SITES, "index.json"), "w") as fh:
        json.dump({"chromosomes": order, "index": index, "total": total,
                   "strains": n_strains, "built": int(time.time()), "source": URL}, fh)

    # PASS TWO: site-major -> strain-major. A block of B sites is B*n_strains bytes; the
    # bytes for strain j in that block are the slice [j::n_strains], which is a C-speed
    # strided copy, and they land at j*total + site0 in the output.
    progress("transposing", sites=total, strains=n_strains, pct=0)
    B = 8192
    with open(GT_TMP, "rb") as sm, open(GT + ".tmp", "wb") as out:
        out.truncate(total * n_strains)
        site0 = 0
        while site0 < total:
            block = sm.read(B * n_strains)
            if not block:
                break
            b = len(block) // n_strains
            for j in range(n_strains):
                out.seek(j * total + site0)
                out.write(block[j::n_strains])
            site0 += b
            if (site0 // B) % 16 == 0:
                progress("transposing", sites=total, strains=n_strains,
                         pct=round(100.0 * site0 / total, 1))
    os.replace(GT + ".tmp", GT)
    os.remove(GT_TMP)
    return total, n_strains


def main():
    os.makedirs(OUT, exist_ok=True)
    try:
        progress("starting")
        download()
        total, n = repack()
        if not KEEP_SOURCE:
            try:
                os.remove(SRC)
            except Exception:
                pass
        progress("done", sites=total, strains=n, pct=100,
                 source_kept=bool(KEEP_SOURCE and os.path.exists(SRC)))
    except Exception as e:
        progress("error", error=str(e))
        raise


if __name__ == "__main__":
    main()
