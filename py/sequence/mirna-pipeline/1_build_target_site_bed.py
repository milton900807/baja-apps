#!/usr/bin/env python3
"""miRTarBase validated miRNA target sites -> transcript-keyed BED for the app's /bd/.

miRTarBase publishes each validated interaction with the *sequence* of the target site, not a
coordinate, so this stage locates every site string inside the transcripts of its target gene
and writes the hits in the app's native transcript-relative BED format (same contract as the
patent pipeline next door):

    <transcript_id>\t<tx_start>\t<tx_end>\t<miRTarBase id>|<miRNA>|\t0\t+
    ENST00000371953\t2144\t2170\tMIRT000404|hsa-miR-21-5p|\t0\t+

Two BEDs are written, because miRTarBase's evidence tiers are not equivalent:

  *_strong_*   Functional MTI without the "(Weak)" qualifier: reporter assay and/or western
               blot on that specific pair. ~10k rows.
  *_all_*      every human row, including the CLIP-derived "(Weak)" tier and the
               Non-Functional MTI rows (pairs that were tested and did *not* repress).

Plus one metadata TSV, id -> packed label, joined server-side by read-bed-region.py.

Usage:
    python3 1_build_target_site_bed.py \
        --sites /path/to/mirtarbase10_MicroRNA_Target_Sites.csv \
        --transcripts ~/baja-server/reference_data/human.gencode.transcripts.fa.gz \
        --out ./out
"""
import argparse, collections, csv, gzip, os, subprocess, sys

SEP = "‖"          # the packed-label separator the frontend splits on
MIN_SITE = 15           # shorter "sites" are not specific enough to place
MAX_HITS_PER_SITE = 5   # a site that repeats in one transcript is almost always a repeat region
STRONG = "Functional MTI"


def clean(s):
    """Metadata fields must not carry the separator, a tab, or a pipe."""
    return (str(s or "").replace(SEP, "/").replace("\t", " ").replace("|", "/")
            .replace("\r", " ").replace("\n", " ").strip())


def load_rows(path, species):
    """rows[gene] = [(mirt_id, mirna, [site, ...], support, experiments, pmid), ...]"""
    rows = collections.defaultdict(list)
    n = kept = 0
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            n += 1
            if r["Species (miRNA)"] != species or r["Species (Target Gene)"] != species:
                continue
            # sites are given as RNA, and reporter-mutant constructs mark the mutated
            # bases in lowercase; uppercasing them means a mutant simply fails to place.
            sites = [s.strip().upper().replace("U", "T")
                     for s in (r["Target Site"] or "").split("//")]
            sites = [s for s in sites if len(s) >= MIN_SITE and not set(s) - set("ACGT")]
            if not sites:
                continue
            kept += 1
            rows[r["Target Gene"]].append((
                r["miRTarBase ID"], r["miRNA"], sites, r["Support Type"],
                r["Experiments"], (r["References (PMID)"] or "").replace(".0", "")))
    print(f"  {n:,} rows read, {kept:,} {species} rows with a usable site, "
          f"{len(rows):,} target genes")
    return rows


def iter_fasta(path):
    """GENCODE headers: ENST|ENSG|OTTHUMG|OTTHUMT|tx-name|GENE|length|biotype|"""
    op = gzip.open if path.endswith(".gz") else open
    tid = gene = None
    buf = []
    with op(path, "rt") as fh:
        for line in fh:
            if line.startswith(">"):
                if tid:
                    yield tid, gene, "".join(buf)
                f = line[1:].strip().split("|")
                tid = f[0].split(".")[0]
                gene = f[5] if len(f) > 5 else ""
                buf = []
            else:
                buf.append(line.strip())
    if tid:
        yield tid, gene, "".join(buf)


def find_all(hay, needle, cap):
    out, i = [], hay.find(needle)
    while i >= 0 and len(out) < cap:
        out.append(i)
        i = hay.find(needle, i + 1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sites", required=True)
    ap.add_argument("--transcripts", required=True)
    ap.add_argument("--out", default="./out")
    ap.add_argument("--species", default="hsa")
    ap.add_argument("--prefix", default="mirtarbase10_hsa")
    ap.add_argument("--keep-contained", action="store_true",
                    help="keep every reported window, including ones contained in a wider "
                         "window of the same interaction (default: keep only the maximal ones)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    print("reading miRTarBase target sites…")
    rows = load_rows(a.sites, a.species)

    # id -> packed metadata, aggregated over every row of that miRNA/gene pair
    meta = collections.defaultdict(lambda: {"mirna": "", "gene": "", "support": set(),
                                            "assays": set(), "pmids": set()})
    for gene, rs in rows.items():
        for mirt, mirna, _sites, support, experiments, pmid in rs:
            m = meta[mirt]
            m["mirna"], m["gene"] = mirna, gene
            m["support"].add(support)
            for e in (experiments or "").split("//"):
                if e.strip():
                    m["assays"].add(e.strip())
            if pmid:
                m["pmids"].add(pmid)

    print("scanning transcripts…")
    hits_all, hits_strong = [], []   # deduped when written
    placed_pairs = set()
    n_tx = n_scanned = 0
    for tid, gene, seq in iter_fasta(a.transcripts):
        n_tx += 1
        rs = rows.get(gene)
        if not rs:
            continue
        n_scanned += 1
        if n_scanned % 20000 == 0:
            print(f"    {n_scanned:,} transcripts scanned, {len(hits_all):,} hits")
        for mirt, mirna, sites, support, _experiments, _pmid in rs:
            for site in sites:
                for s in find_all(seq, site, MAX_HITS_PER_SITE):
                    placed_pairs.add((mirt, site))
                    line = f"{tid}\t{s}\t{s + len(site)}\t{mirt}|{mirna}|\t0\t+"
                    hits_all.append(line)
                    if support == STRONG:
                        hits_strong.append(line)
    print(f"  {n_tx:,} transcripts in the reference, {n_scanned:,} belong to a target gene")
    want = {(mirt, site) for rs in rows.values() for mirt, _m, sites, *_ in rs for site in sites}
    print(f"  {len(hits_all):,} placed sites ({len(hits_strong):,} strong-evidence)")
    print(f"  {len(placed_pairs):,}/{len(want):,} distinct (interaction, site) pairs located "
          f"in a transcript ({100.0 * len(placed_pairs) / max(1, len(want)):.1f}%); the rest are "
          f"reporter mutants, UTR versions the reference no longer carries, or non-transcript sites")

    def collapse(lines):
        """Different papers report slightly different windows for the same site, which would
        draw as four stacked bars for one interaction. Keep only maximal intervals per
        (transcript, interaction): a window contained in another is dropped, and no
        coordinate is invented."""
        by = collections.defaultdict(list)
        for l in lines:
            f = l.split("\t")
            by[(f[0], f[3])].append((int(f[1]), int(f[2]), l))
        out = []
        for iv in by.values():
            iv.sort(key=lambda t: (t[0], -t[1]))
            end = -1
            for s, e, l in iv:
                if e > end:            # not contained in the interval before it
                    out.append(l)
                    end = e
        return out

    def write_bed(lines, name):
        path = os.path.join(a.out, name + ".bed")
        lines = collapse(set(lines)) if not a.keep_contained else sorted(set(lines))
        lines = sorted(set(lines), key=lambda l: (l.split("\t")[0], int(l.split("\t")[1])))
        with open(path, "w") as fh:
            fh.write("\n".join(lines) + "\n")
        gz = path + ".gz"
        if subprocess.call(["bash", "-c", f"command -v bgzip >/dev/null"]) == 0:
            subprocess.check_call(["bgzip", "-f", path])
        else:                                  # read-bed-region.py re-sorts anyway
            with open(path, "rb") as src, gzip.open(gz, "wb") as dst:
                dst.writelines(src)
            os.remove(path)
        print(f"  wrote {gz} ({len(lines):,} rows, {os.path.getsize(gz):,} B)")

    write_bed(hits_strong, f"{a.prefix}_strong_hg38_transcript_hits")
    write_bed(hits_all, f"{a.prefix}_all_hg38_transcript_hits")

    # Only ids that actually placed a site need metadata.
    placed = {l.split("\t")[3].split("|")[0] for l in hits_all}
    mpath = os.path.join(a.out, f"{a.prefix}_meta.tsv")
    with open(mpath, "w") as fh:
        fh.write("id\tlabel\n")                # read-bed-region.py skips a non-numeric first row
        for mirt in sorted(placed):
            m = meta[mirt]
            assays = sorted(m["assays"])
            pmids = sorted(m["pmids"])
            fh.write("\t".join([mirt, SEP.join([
                clean(m["mirna"]),
                clean(m["gene"]),
                clean(", ".join(sorted(m["support"]))),
                clean(", ".join(assays[:6]) + (f" +{len(assays) - 6} more" if len(assays) > 6 else "")),
                clean(", ".join(pmids[:8]) + (f" +{len(pmids) - 8} more" if len(pmids) > 8 else "")),
                mirt,
            ])]) + "\n")
    print(f"  wrote {mpath} ({len(placed):,} interactions)")
    print("\ndeploy:\n  cp " + os.path.join(a.out, a.prefix) + "_* ~/baja-bd/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
