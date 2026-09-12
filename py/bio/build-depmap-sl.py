"""Build the DepMap bundle that synthetic-lethal-targets.py ranks against. Run ONCE per box.

The third-gene (higher-order synthetic lethality) model asks, for a set of genes a tumor has
lost, which OTHER gene becomes selectively essential in the cell lines that have lost the
same ones. That needs three public DepMap tables, which are not redistributed with the
application and are far too large to read as CSV on every request:

    gene_effect.csv                          CRISPR dependency, 26Q1 Chronos   (~413 MB)
    Model.csv                                cell-line lineage (OncotreeLineage)
    OmicsSomaticMutationsMatrixDamaging.csv  damaging-mutation calls, 24Q4     (~148 MB)
    OmicsSomaticMutationsMatrixHotspot.csv   hotspot-mutation calls, 24Q4       (~4 MB)
    OmicsExpressionProteinCodingGenesTPMLogp1.csv  expression, 24Q4           (~507 MB)
    OmicsAbsoluteCNGene.csv                  absolute copy number, 24Q4        (~239 MB)

This downloads them from figshare (or reads copies you already have), streams them once
with the csv module -- no pandas on the server -- and writes a compact bundle:

    <out>/genes.txt         gene symbols, in gene_effect column order
    <out>/models.txt        ModelIDs of the CRISPR-screened lines, in row order
    <out>/lineage.txt       OncotreeLineage per model, same order ('' when unknown)
    <out>/disease.txt       OncotreePrimaryDisease per model -- the CANCER TYPE, which is
                            what a clinician names (Invasive Breast Carcinoma), where the
                            lineage is only the organ (Breast)
    <out>/gene_effect.npy   float32 [models x genes], NaN filled with the gene's mean
    <out>/lof.npy           bool    [models x genes]: damaging mutation OR hotspot mutation
                            OR expression in the gene's bottom 15% across lines
                            (deletion / silencing)
    <out>/cn.npy            float32 [models x genes]: ABSOLUTE copies of the gene, NaN where
                            the line was never profiled (~250 of the 1208). This is the
                            dosage lane: loss of function says a gene is broken, copy number
                            says how much of it is there, and a single-copy (CYCLOPS)
                            vulnerability is a question about the second one.
    <out>/ploidy.npy        float32 [models]: the line's own baseline, the median gene's copy
                            number. Cell lines are aneuploid, so dosage is only meaningful as
                            a ratio to this: two copies in a near-triploid line is a loss.
    <out>/meta.json         what went in, and when

Hotspots matter because DepMap's "damaging" matrix is truncating and frameshift changes
only: TP53's R175H, R248W and the rest of the recurrent missense that inactivate it are
"hotspot", and without that matrix TP53 looked lost in ~170 lines instead of the several
hundred that really carry a mutant p53. For an oncogene a hotspot is a GAIN, not a loss
-- KRAS G12D activates -- so the hotspot call is applied only to genes on the
tumour-suppressor list below, where a recurrent missense is a loss of function.

Loss of function is called the way data_prep/call_loss_of_function.py calls it in the
ppset toolkit, so the ranking here is the ranking the chapters describe.

Usage (standalone; no ion runtime needed):
    python3 build-depmap-sl.py [--out DIR] [--gene-effect F] [--model F]
                               [--mutations F] [--hotspots F] [--expression F]
                               [--keep-downloads]

Files given by path are read in place; anything else is fetched into <out>/raw and, unless
--keep-downloads, deleted once the bundle is written. Memory stays around 200 MB.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
import time

import numpy as np

csv.field_size_limit(10 ** 8)

FIGSHARE = {
    "gene_effect": ("67214582", "gene_effect.csv"),
    "model": ("51065297", "Model.csv"),
    "mutations": ("51065747", "OmicsSomaticMutationsMatrixDamaging.csv"),
    "hotspots": ("51065750", "OmicsSomaticMutationsMatrixHotspot.csv"),
    "expression": ("51065489", "OmicsExpressionProteinCodingGenesTPMLogp1.csv"),
    # ABSOLUTE copy number, not relative: integer copies per gene per line, so "this line
    # has one copy of PSMC2" is a fact rather than a ratio that has to be argued back
    # through ploidy. 239 MB against 1.4 GB for OmicsCNGene.csv, and it covers 958 of the
    # 1208 CRISPR lines, which is enough to test a dosage effect. Lines it does not cover
    # are NaN and every test drops them.
    "copy_number": ("51065303", "OmicsAbsoluteCNGene.csv"),
}
CN_NEUTRAL = 2           # copies a normal diploid genome carries
CN_LOSS_MAX = 1          # at or below this the line is down to one copy (0 = both gone)
LOW_PCT = 15.0
# Genes for which a recurrent (hotspot) missense is a LOSS: tumour suppressors whose
# hotspots are dominant-negative or inactivating. The same list the third-gene model
# screens over, plus the hereditary repair genes; oncogene hotspots (KRAS, BRAF, PIK3CA,
# IDH1...) are activating and must not be called loss.
HOTSPOT_AS_LOSS = {
    "TP53", "RB1", "PTEN", "CDKN2A", "MTAP", "ARID1A", "BAP1", "KEAP1", "NF1", "PBRM1", "SMAD4",
    "SMARCA4", "STK11", "VHL", "BRCA1", "BRCA2", "APC", "ATM", "NF2", "CDH1", "PALB2", "CHEK2",
    "MLH1", "MSH2", "MSH6", "PMS2", "KMT2D", "CREBBP", "EP300", "FBXW7", "ARID2", "ATRX",
    "CDKN1B", "CIC", "DAXX", "KDM6A", "MEN1", "NOTCH1", "PTCH1", "RNF43", "SETD2", "TSC1",
    "TSC2", "WT1", "AXIN1", "CASP8", "ZFHX3", "SMARCB1", "SPOP", "FUBP1",
}


def say(m):
    print("[build-depmap-sl] " + m, file=sys.stderr, flush=True)


def default_out():
    for base in ["/opt/baja-server", os.path.expanduser("~/baja-server"), os.getcwd()]:
        rd = os.path.join(base, "reference_data")
        if os.path.isdir(rd):
            return os.path.join(rd, "depmap")
    return os.path.join(os.getcwd(), "reference_data", "depmap")


def fetch(kind, out_dir):
    fid, name = FIGSHARE[kind]
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
        say("using already-downloaded " + dest)
        return dest
    url = "https://ndownloader.figshare.com/files/" + fid
    say("downloading %s (%s)…" % (name, url))
    tmp = dest + ".part"
    r = subprocess.run(["curl", "-sSL", "--retry", "3", "--max-time", "3600", "-o", tmp, url])
    # Model.csv is under a megabyte; a real failure is an HTML error page of a few KB.
    if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 100_000:
        raise SystemExit("download of %s failed" % name)
    os.replace(tmp, dest)
    say("%s: %.0f MB" % (name, os.path.getsize(dest) / 1e6))
    return dest


def symbol(col):
    # A column with no symbol -- " (12345)" -- keeps its id as its name rather than
    # becoming a blank line in genes.txt, which a reader could mistake for nothing.
    s = col.split(" (")[0].strip()
    return s if s else col.strip().replace(" ", "")


def read_matrix(path, keep_models=None, what="matrix"):
    """Stream a ModelID x 'SYMBOL (id)' CSV into (models, symbols, float32 array)."""
    say("reading %s (%s)…" % (os.path.basename(path), what))
    with open(path, newline="") as fh:
        r = csv.reader(fh)
        head = next(r)
        # A column with an empty header still occupies its position: name it by that
        # position so genes.txt never carries a blank line.
        syms = [symbol(c) or ("column_%d" % (i + 1)) for i, c in enumerate(head[1:])]
        models, rows = [], []
        t0 = time.time()
        for row in r:
            if not row:
                continue
            mid = row[0].strip()
            if keep_models is not None and mid not in keep_models:
                continue
            vals = np.array([(float(x) if x not in ("", "NA", "nan", "NaN") else np.nan) for x in row[1:]],
                            dtype=np.float32)
            models.append(mid)
            rows.append(vals)
            if len(rows) % 200 == 0:
                say("  %d lines, %.0fs" % (len(rows), time.time() - t0))
    if not rows:
        raise SystemExit("no rows read from " + path)
    return models, syms, np.vstack(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=default_out())
    ap.add_argument("--gene-effect", default=None)
    ap.add_argument("--model", default=None)
    ap.add_argument("--mutations", default=None)
    ap.add_argument("--hotspots", default=None)
    ap.add_argument("--expression", default=None)
    ap.add_argument("--copy-number", default=None)
    ap.add_argument("--keep-downloads", action="store_true")
    # ADDING ONE LANE TO A BUNDLE THAT ALREADY EXISTS. A full rebuild re-downloads a
    # gigabyte to change nothing but a file that was not there before, so copy number can
    # be added on its own: the gene and model order come from the bundle's own txt files,
    # which is the only thing the new lane has to agree with.
    ap.add_argument("--only-cn", action="store_true",
                    help="add cn.npy to the bundle in --out and leave everything else alone")
    a = ap.parse_args()

    out = a.out
    raw = os.path.join(out, "raw")
    os.makedirs(out, exist_ok=True)
    downloaded = []

    def source(kind, given):
        if given and os.path.exists(given):
            return given
        p = fetch(kind, raw)
        downloaded.append(p)
        return p

    def build_cn(models, genes, path):
        """Absolute copy number aligned to the bundle's model rows and gene columns.

        NaN where the line was never profiled, which is a quarter of the CRISPR panel and
        has to stay distinguishable from zero: no copies and no measurement are opposite
        findings, and a zero-filled hole would read as a homozygous deletion in every gene.
        """
        midx = {m: i for i, m in enumerate(models)}
        gidx = {g: i for i, g in enumerate(genes)}
        C = np.full((len(models), len(genes)), np.nan, dtype=np.float32)
        cm, cs, CN = read_matrix(path, keep_models=set(models), what="absolute copy number")
        cols = [(j, gidx[s]) for j, s in enumerate(cs) if s in gidx]
        rows_ = [midx[m] for m in cm]
        src = np.array([j for j, _ in cols])
        dst = np.array([g for _, g in cols])
        for k, mrow in enumerate(rows_):
            C[mrow, dst] = CN[k, src]
        seen = int((~np.isnan(C)).any(axis=1).sum())
        say("copy number: %d of %d models profiled, %d of %d genes matched"
            % (seen, len(models), len(cols), len(genes)))
        # EACH LINE'S OWN BASELINE. Cancer cell lines are aneuploid: two copies of a gene in
        # a near-triploid line is a relative LOSS, and counting raw copies would call it
        # normal and call the triploid line's three copies a gain. The median gene's copy
        # number is the line's ploidy, and every dosage question downstream is asked as a
        # ratio to it. NaN for a line that was never profiled, so it cannot be divided by.
        with np.errstate(invalid="ignore"):
            pl = np.nanmedian(C, axis=1)
        pl = np.where(np.isfinite(pl) & (pl > 0), pl, np.nan).astype(np.float32)
        got = np.isfinite(pl)
        if got.any():
            say("ploidy: median %.1f, range %.0f-%.0f over %d lines"
                % (float(np.median(pl[got])), float(pl[got].min()), float(pl[got].max()), int(got.sum())))
        return C, pl

    if a.only_cn:
        # The bundle's own files are the authority on order; nothing else is touched.
        genes = open(os.path.join(out, "genes.txt")).read().rstrip("\n").split("\n")
        models = open(os.path.join(out, "models.txt")).read().rstrip("\n").split("\n")
        cn_path = source("copy_number", a.copy_number)
        C, pl = build_cn(models, genes, cn_path)
        np.save(os.path.join(out, "cn.npy"), C)
        np.save(os.path.join(out, "ploidy.npy"), pl)
        mp = os.path.join(out, "meta.json")
        meta = json.load(open(mp)) if os.path.exists(mp) else {}
        meta.setdefault("sources", {})["copy_number"] = os.path.basename(cn_path)
        meta["figshare"] = FIGSHARE
        meta["copy_number"] = {"kind": "absolute integer copies per gene",
                               "neutral": CN_NEUTRAL, "loss_at_or_below": CN_LOSS_MAX,
                               "models_profiled": int((~np.isnan(C)).any(axis=1).sum()),
                               "added": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        with open(mp, "w") as fh:
            json.dump(meta, fh, indent=2)
        say("cn.npy added to %s (%d x %d)" % (out, C.shape[0], C.shape[1]))
        if not a.keep_downloads:
            for p in downloaded:
                try:
                    os.remove(p)
                except OSError:
                    pass
        return

    ge_path = source("gene_effect", a.gene_effect)
    model_path = source("model", a.model)
    mut_path = source("mutations", a.mutations)
    hot_path = source("hotspots", a.hotspots)
    expr_path = source("expression", a.expression)
    cn_path = source("copy_number", a.copy_number)

    # 1. Dependency: every screened line, every gene.
    models, genes, G = read_matrix(ge_path, what="gene effect")
    model_set = set(models)
    say("gene effect: %d models x %d genes" % G.shape)
    col_mean = np.nanmean(G, axis=0)
    col_mean = np.where(np.isnan(col_mean), 0.0, col_mean).astype(np.float32)
    ii = np.where(np.isnan(G))
    G[ii] = np.take(col_mean, ii[1])

    # 2. Lineage and cancer type per model.
    lineage, disease = {}, {}
    with open(model_path, newline="") as fh:
        r = csv.DictReader(fh)
        for row in r:
            mid = row.get("ModelID", "").strip()
            lineage[mid] = (row.get("OncotreeLineage") or "").strip()
            disease[mid] = (row.get("OncotreePrimaryDisease") or "").strip()
    lin = [lineage.get(m, "") for m in models]
    dis = [disease.get(m, "") for m in models]
    say("lineage known for %d of %d models; cancer type for %d"
        % (sum(1 for x in lin if x), len(models), sum(1 for x in dis if x)))

    # 3. Loss of function = damaging mutation OR bottom-15% expression, per gene, restricted
    #    to the CRISPR lines and aligned to the gene-effect gene order.
    gidx = {g: i for i, g in enumerate(genes)}
    midx = {m: i for i, m in enumerate(models)}
    lof = np.zeros(G.shape, dtype=bool)

    mm, ms, M = read_matrix(mut_path, keep_models=model_set, what="damaging mutations")
    hit = 0
    for j, s in enumerate(ms):
        gi = gidx.get(s)
        if gi is None:
            continue
        col = M[:, j] > 0
        for k, m in enumerate(mm):
            if col[k]:
                lof[midx[m], gi] = True
                hit += 1
    say("damaging-mutation calls placed: %d" % hit)
    del M

    hm, hs, H = read_matrix(hot_path, keep_models=model_set, what="hotspot mutations")
    hot = 0
    skipped = set()
    for j, s in enumerate(hs):
        gi = gidx.get(s)
        if gi is None:
            continue
        if s not in HOTSPOT_AS_LOSS:
            if (H[:, j] > 0).any():
                skipped.add(s)
            continue
        col = H[:, j] > 0
        for k, m in enumerate(hm):
            if col[k] and not lof[midx[m], gi]:
                lof[midx[m], gi] = True
                hot += 1
    say("hotspot calls added as loss (tumour suppressors only): %d; hotspot genes left alone as gains: %d"
        % (hot, len(skipped)))
    del H

    em, es, E = read_matrix(expr_path, keep_models=model_set, what="expression")
    low_hits = 0
    with np.errstate(invalid="ignore"):
        for j, s in enumerate(es):
            gi = gidx.get(s)
            if gi is None:
                continue
            col = E[:, j]
            ok = ~np.isnan(col)
            if ok.sum() < 20:
                continue
            thr = np.nanpercentile(col, LOW_PCT)
            low = ok & (col < thr)
            if not low.any():
                continue
            rows_ = [midx[em[k]] for k in np.where(low)[0]]
            lof[rows_, gi] = True
            low_hits += int(low.sum())
    say("low-expression calls placed: %d" % low_hits)
    del E

    # 3b. Absolute copy number, the dosage lane: how many copies of each gene each line
    #     carries. Loss of function says a gene is broken; this says how much of it is
    #     there, which is a different question and the one a CYCLOPS asks.
    C, pl = build_cn(models, genes, cn_path)

    # 4. Write the bundle.
    np.save(os.path.join(out, "cn.npy"), C)
    np.save(os.path.join(out, "ploidy.npy"), pl)
    np.save(os.path.join(out, "gene_effect.npy"), G)
    np.save(os.path.join(out, "lof.npy"), lof)
    with open(os.path.join(out, "genes.txt"), "w") as fh:
        fh.write("\n".join(genes) + "\n")
    with open(os.path.join(out, "models.txt"), "w") as fh:
        fh.write("\n".join(models) + "\n")
    with open(os.path.join(out, "lineage.txt"), "w") as fh:
        fh.write("\n".join(lin) + "\n")
    with open(os.path.join(out, "disease.txt"), "w") as fh:
        fh.write("\n".join(dis) + "\n")
    meta = {
        "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "models": len(models), "genes": len(genes),
        "cancer_types": len(set(x for x in dis if x)),
        "lof_calls": int(lof.sum()),
        "sources": {k: os.path.basename(p) for k, p in
                    [("gene_effect", ge_path), ("model", model_path), ("mutations", mut_path),
                     ("hotspots", hot_path), ("expression", expr_path), ("copy_number", cn_path)]},
        "copy_number": {"kind": "absolute integer copies per gene", "neutral": CN_NEUTRAL,
                        "loss_at_or_below": CN_LOSS_MAX,
                        "models_profiled": int((~np.isnan(C)).any(axis=1).sum())},
        "figshare": FIGSHARE, "low_expression_percentile": LOW_PCT,
        "hotspot_as_loss": sorted(HOTSPOT_AS_LOSS), "hotspot_calls_added": int(hot),
    }
    with open(os.path.join(out, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    say("bundle written to %s (%d models, %d genes, %d LoF calls)" % (out, len(models), len(genes), int(lof.sum())))

    if not a.keep_downloads:
        for p in downloaded:
            try:
                os.remove(p)
            except OSError:
                pass
        try:
            os.rmdir(raw)
        except OSError:
            pass


if __name__ == "__main__":
    main()
