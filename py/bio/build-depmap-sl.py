"""Build the DepMap bundle that synthetic-lethal-targets.py ranks against. Run ONCE per box.

The third-gene (higher-order synthetic lethality) model asks, for a set of genes a tumor has
lost, which OTHER gene becomes selectively essential in the cell lines that have lost the
same ones. That needs three public DepMap tables, which are not redistributed with the
application and are far too large to read as CSV on every request:

    gene_effect.csv                          CRISPR dependency, 26Q1 Chronos   (~413 MB)
    Model.csv                                cell-line lineage (OncotreeLineage)
    OmicsSomaticMutationsMatrixDamaging.csv  damaging-mutation calls, 24Q4     (~148 MB)
    OmicsExpressionProteinCodingGenesTPMLogp1.csv  expression, 24Q4           (~507 MB)

This downloads them from figshare (or reads copies you already have), streams them once
with the csv module -- no pandas on the server -- and writes a compact bundle:

    <out>/genes.txt         gene symbols, in gene_effect column order
    <out>/models.txt        ModelIDs of the CRISPR-screened lines, in row order
    <out>/lineage.txt       OncotreeLineage per model, same order ('' when unknown)
    <out>/gene_effect.npy   float32 [models x genes], NaN filled with the gene's mean
    <out>/lof.npy           bool    [models x genes]: damaging mutation OR expression in
                            the gene's bottom 15% across lines (deletion / silencing)
    <out>/meta.json         what went in, and when

Loss of function is called the way data_prep/call_loss_of_function.py calls it in the
ppset toolkit, so the ranking here is the ranking the chapters describe.

Usage (standalone; no ion runtime needed):
    python3 build-depmap-sl.py [--out DIR] [--gene-effect F] [--model F]
                               [--mutations F] [--expression F] [--keep-downloads]

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
    "expression": ("51065489", "OmicsExpressionProteinCodingGenesTPMLogp1.csv"),
}
LOW_PCT = 15.0


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
    if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
        say("using already-downloaded " + dest)
        return dest
    url = "https://ndownloader.figshare.com/files/" + fid
    say("downloading %s (%s)…" % (name, url))
    tmp = dest + ".part"
    r = subprocess.run(["curl", "-sSL", "--retry", "3", "--max-time", "3600", "-o", tmp, url])
    if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 1_000_000:
        raise SystemExit("download of %s failed" % name)
    os.replace(tmp, dest)
    say("%s: %.0f MB" % (name, os.path.getsize(dest) / 1e6))
    return dest


def symbol(col):
    return col.split(" (")[0].strip()


def read_matrix(path, keep_models=None, what="matrix"):
    """Stream a ModelID x 'SYMBOL (id)' CSV into (models, symbols, float32 array)."""
    say("reading %s (%s)…" % (os.path.basename(path), what))
    with open(path, newline="") as fh:
        r = csv.reader(fh)
        head = next(r)
        syms = [symbol(c) for c in head[1:]]
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
    ap.add_argument("--expression", default=None)
    ap.add_argument("--keep-downloads", action="store_true")
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

    ge_path = source("gene_effect", a.gene_effect)
    model_path = source("model", a.model)
    mut_path = source("mutations", a.mutations)
    expr_path = source("expression", a.expression)

    # 1. Dependency: every screened line, every gene.
    models, genes, G = read_matrix(ge_path, what="gene effect")
    model_set = set(models)
    say("gene effect: %d models x %d genes" % G.shape)
    col_mean = np.nanmean(G, axis=0)
    col_mean = np.where(np.isnan(col_mean), 0.0, col_mean).astype(np.float32)
    ii = np.where(np.isnan(G))
    G[ii] = np.take(col_mean, ii[1])

    # 2. Lineage per model.
    lineage = {}
    with open(model_path, newline="") as fh:
        r = csv.DictReader(fh)
        for row in r:
            lineage[row.get("ModelID", "").strip()] = (row.get("OncotreeLineage") or "").strip()
    lin = [lineage.get(m, "") for m in models]
    say("lineage known for %d of %d models" % (sum(1 for x in lin if x), len(models)))

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

    # 4. Write the bundle.
    np.save(os.path.join(out, "gene_effect.npy"), G)
    np.save(os.path.join(out, "lof.npy"), lof)
    with open(os.path.join(out, "genes.txt"), "w") as fh:
        fh.write("\n".join(genes) + "\n")
    with open(os.path.join(out, "models.txt"), "w") as fh:
        fh.write("\n".join(models) + "\n")
    with open(os.path.join(out, "lineage.txt"), "w") as fh:
        fh.write("\n".join(lin) + "\n")
    meta = {
        "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "models": len(models), "genes": len(genes),
        "lof_calls": int(lof.sum()),
        "sources": {k: os.path.basename(p) for k, p in
                    [("gene_effect", ge_path), ("model", model_path), ("mutations", mut_path), ("expression", expr_path)]},
        "figshare": FIGSHARE, "low_expression_percentile": LOW_PCT,
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
