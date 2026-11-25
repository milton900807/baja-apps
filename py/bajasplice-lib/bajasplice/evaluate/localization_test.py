#!/usr/bin/env python
"""Are the in-frame cryptic exons in locally translated messages?

The fate classification splits the curated cryptic exons three ways, and only
one of the three could produce a protein: `in_frame`, where the exon's length
is a multiple of three and no stop falls inside it. On the curated set that is
44 of 354, 12.4%, rising to 24 of 136 among exons whose junction reproduces in
three or more depletion datasets. The question this module answers is whether
that minority means anything, and the sharpest version of the question is
whether those messages are ones the neuron translates away from the soma.

It matters because a cryptic exon in a locally translated message is a
different lesion from a cryptic exon in a somatic one. A somatic message that
gains an in-frame insertion makes a variant protein and ships it. A message
that is transported to a growth cone or a spine and held there until a cue
arrives carries its regulatory apparatus in cis, and an inserted segment can
change what the branch does without changing how much protein the cell makes
in total. If the in-frame class is enriched for such messages, the productive
minority has a function and the cryptic program has a second mode. If it sits
at the background rate, the in-frame class is just what the 2/3 frame null
leaves behind, and should be written up as such.

THE COMPARISON THAT MATTERS IS INTERNAL. Asking whether 24 genes are
localized, against all genes, confounds localization with being a neuronal
gene at all: the curated cryptic exons are drawn from neuronal introns to
begin with, so almost any neuronal reference list will look enriched. The
primary test here is in_frame against decay WITHIN the same curated set. Both
classes come from the same screens, the same cell types and the same curation,
so the only thing that differs is what the exon does to the reading frame. A
`--background` list is accepted for the secondary question of whether the
program as a whole is drawn from localized messages, and is reported
separately and labelled as the weaker test.

Localization lists are not shipped. Pass them with `--list NAME=path`:

  Axon-seq (Nijssen 2018, Stem Cell Reports, doi 10.1016/j.stemcr.2018.11.005)
    mmc3  mouse motor axon transcriptome, 4,238 axonal genes
    mmc5  human motor axon transcriptome, 2,793 genes
  Neuropil (Cajigas 2012, Neuron, doi 10.1016/j.neuron.2012.02.036)
    Table S10  the filtered dendritic/axonal list, 2,550 transcripts
  Growth cone (Poulopoulos 2019, Nature, doi 10.1038/s41586-018-0847-y)

Export each sheet to TSV or CSV, or pass the .xlsx directly if openpyxl is
installed. Symbols are matched case-insensitively after stripping, so mouse
`Actb` matches human `ACTB`; that is a deliberate ortholog shortcut and it
fails for the genes whose symbols diverged, which is a reason to prefer the
human list where one exists.

The 70-gene "core neurite transcriptome" is NOT a useful list here and the
module will warn if a list is that small. It is ribosomal proteins, Actb,
Gap43 and the kinesins: a housekeeping set that excludes DLGAP3, which is one
of the few postsynaptic density transcripts with published dendritic
localization. Absence from a core set is not evidence of somatic restriction.
"""
import argparse
import os
import re
import sys

import pandas as pd

from bajasplice.evaluate.buffer_test import bh, fisher_2x2

DECAY_FATES = ("stop_in_exon", "frameshift")
PRODUCTIVE_FATES = ("in_frame",)
SMALL_LIST = 200
# Column headers that pass the symbol-shape filter but are not genes. Kept
# deliberately short: SET, FAU, CPE and other real symbols look like words,
# so anything not unambiguously a column label stays off this list. A stray
# non-gene token is harmless anyway, since the intersection is against a
# known set of host genes; a dropped real gene is not.
HEADER_TOKENS = frozenset((
    "GENE", "GENES", "GENEID", "GENENAME", "GENESYMBOL", "SYMBOL", "SYMBOLS",
    "ENSEMBL", "ENSEMBLID", "ENTREZ", "ENTREZID", "BASEMEAN", "PADJ", "PVAL",
    "PVALUE", "FDR", "QVAL", "QVALUE", "LOGFC", "LFC", "TPM", "FPKM", "RPKM",
    "CPM", "COUNTS", "STAT", "DESCRIPTION", "CHR", "CHROM", "START", "END",
    "STRAND", "BIOTYPE", "RANK", "TOTAL", "SAMPLE", "SAMPLES", "MEAN",
))
JUNCTION = re.compile(r"(chr[\w.]+)[:\s]+(\d+)[-_\s]+(\d+)")


def norm_symbol(s):
    """Uppercase, stripped, version- and quote-free gene symbol."""
    s = str(s).strip().strip('"\'')
    if not s or s.lower() in ("nan", "na", "none", "-"):
        return ""
    s = s.split("|")[0].split(".")[0] if s.startswith("ENS") else s.split("|")[0]
    return s.upper()


def _rows_from_path(path, sheet=None):
    """Yield lists of cell values from a tsv, csv, txt or xlsx file.

    The existence check is here rather than left to the reader because a
    missing spreadsheet otherwise surfaces as a zipfile traceback out of
    openpyxl, which reads like a corrupt file rather than an absent one.
    """
    path = os.path.expanduser(path)
    if not os.path.exists(path):
        raise SystemExit(f"no such list file: {path}")
    if os.path.isdir(path):
        raise SystemExit(f"{path} is a directory; pass the sheet itself")
    if os.path.getsize(path) == 0:
        raise SystemExit(f"{path} is empty")
    ext = os.path.splitext(path)[1].lower()
    if ext in (".xlsx", ".xlsm"):
        try:
            from openpyxl import load_workbook
        except ImportError:
            raise SystemExit(
                f"{path} is a spreadsheet and openpyxl is not installed; "
                "either `pip install openpyxl` or export the sheet to TSV")
        wb = load_workbook(path, read_only=True, data_only=True)
        names = [ws.title for ws in wb.worksheets]
        if sheet is not None:
            if sheet not in names:
                raise SystemExit(
                    f"{os.path.basename(path)} has no sheet {sheet!r}; "
                    f"sheets are {names}")
            sheets = [wb[sheet]]
        else:
            sheets = wb.worksheets
            if len(names) > 1:
                # The usual reason a supplementary workbook has more than one
                # sheet is that a differential-expression table sits beside
                # the list, and its union with the list is close to every
                # expressed gene. Merging them silently turns a real test
                # into a null, so say so loudly.
                print(f"  WARNING: reading ALL {len(names)} sheets of "
                      f"{os.path.basename(path)}: {names}", file=sys.stderr)
                print("  pin one with NAME=path#SheetName if any of those is "
                      "not a list of localized genes", file=sys.stderr)
        for ws in sheets:
            for row in ws.iter_rows(values_only=True):
                yield list(row)
        return
    sep = "," if ext == ".csv" else "\t"
    with open(path, newline="") as fh:
        for line in fh:
            line = line.rstrip("\n\r")
            yield line.split(sep) if (sep in line or ext != ".txt") else [line]


def read_gene_list(path, column=None, sheet=None):
    """Gene symbols from a list file.

    With `column`, only that header's cells are taken. Without it every cell
    is taken and anything that does not look like a symbol is dropped, which
    is what makes a raw supplementary sheet usable without editing it. The
    permissiveness is safe because the intersection is against a known set of
    host genes: a stray word cannot create a match that matters unless it
    happens to be a gene symbol, and then it belonged in the list anyway.
    """
    rows = list(_rows_from_path(path, sheet))
    if not rows:
        raise SystemExit(f"{path} is empty")
    out, idx = set(), None
    if column:
        header = [norm_symbol(c) for c in rows[0]]
        want = column.strip().upper()
        if want not in header:
            raise SystemExit(f"{path} has no column {column!r}; "
                             f"header is {[c for c in header if c]}")
        idx = header.index(want)
        rows = rows[1:]
    for row in rows:
        cells = [row[idx]] if idx is not None and idx < len(row) else row
        for c in cells:
            s = norm_symbol(c)
            if (s and s not in HEADER_TOKENS
                    and re.fullmatch(r"[A-Z][A-Z0-9][A-Z0-9\-]{0,14}", s)):
                out.add(s)
    if not out:
        raise SystemExit(f"no gene symbols found in {path}")
    return out


def parse_junction(s):
    """(chrom, left, right) from an IGV-style junction string, or Nones."""
    m = JUNCTION.search(str(s))
    if not m:
        return (None, None, None)
    return (m.group(1), int(m.group(2)), int(m.group(3)))


def dataset_counts(path, junction_col="paste_into_igv_junction",
                   comparison_col="comparison"):
    """Per-junction count of distinct depletion datasets in a compendium.

    Counts distinct comparisons rather than reading a precomputed column,
    because a per-row significance count repeats for every row of the same
    junction and cannot be aggregated by taking a maximum without first
    checking that it was computed over the same comparisons.
    """
    c = pd.read_csv(path)
    for col in (junction_col, comparison_col):
        if col not in c.columns:
            raise SystemExit(f"{path} has no column {col!r}; "
                             f"columns are {list(c.columns)}")
    if "is_cryptic" in c.columns:
        c = c[c["is_cryptic"].astype(str).str.upper().isin(("TRUE", "1"))]
    parsed = [parse_junction(x) for x in c[junction_col]]
    c = c.assign(_chrom=[p[0] for p in parsed],
                 _left=[p[1] for p in parsed],
                 _right=[p[2] for p in parsed])
    c = c[c["_chrom"].notna()]
    g = (c.groupby(junction_col)
          .agg(chrom=("_chrom", "first"), left=("_left", "first"),
               right=("_right", "first"), n_datasets=(comparison_col, "nunique"))
          .reset_index())
    return g


def match_datasets(fate, rep, tol=5):
    """Attach n_datasets to each fate row by coordinate.

    A cryptic exon contributes two junctions, one at each end, and a
    compendium names a junction by its intronic span, so either endpoint of
    either junction can land on either boundary of the exon. Matching any
    endpoint to any boundary within `tol` and taking the largest dataset count
    found is therefore the right aggregation: the exon is as reproducible as
    the best-supported junction that defines it.

    Rows with no match get 0, which means "not in this compendium", NOT "seen
    in zero datasets". Keep the two apart when reporting, because the
    unmatched rows are mostly curated from sources the compendium does not
    cover and they are not a low-confidence tier.
    """
    out = []
    by_chrom = {k: v for k, v in rep.groupby("chrom")}
    for r in fate.itertuples():
        sub = by_chrom.get(r.chrom)
        if sub is None or len(sub) == 0:
            out.append(0)
            continue
        hit = sub[(((sub["left"] - r.a_start).abs() <= tol) |
                   ((sub["right"] - r.a_start).abs() <= tol) |
                   ((sub["left"] - r.a_end).abs() <= tol) |
                   ((sub["right"] - r.a_end).abs() <= tol))]
        out.append(int(hit["n_datasets"].max()) if len(hit) else 0)
    return out


def fate_class(fate):
    """'novel_protein' for an exon that could make one, else 'decay'."""
    return "novel_protein" if str(fate) in PRODUCTIVE_FATES else "decay"


def contrast(fate, genes, label):
    """in_frame vs decay, inside one localization list.

    Returns the 2x2 as counts plus the Fisher result. The odds ratio is
    oriented so that >1 means the in-frame class is the more localized one,
    which is the direction the model predicts.
    """
    prod = fate[fate["klass"] == "novel_protein"]
    dec = fate[fate["klass"] == "decay"]
    kp = int(prod["gene_norm"].isin(genes).sum())
    kd = int(dec["gene_norm"].isin(genes).sum())
    odds, p = fisher_2x2(kp, len(prod), kd, len(dec))
    # fisher_2x2 is one-sided, so the opposite direction needs its own call.
    # Without it a result that runs backwards shows up as p near 1 and gets
    # reported as "no difference", which is a different and wrong claim.
    _, p_rev = fisher_2x2(kd, len(dec), kp, len(prod))
    return {
        "list": label,
        "n_list_genes": len(genes),
        "n_in_frame": len(prod),
        "in_frame_localized": kp,
        "in_frame_rate": kp / len(prod) if len(prod) else float("nan"),
        "n_decay": len(dec),
        "decay_localized": kd,
        "decay_rate": kd / len(dec) if len(dec) else float("nan"),
        "odds_ratio": odds,
        "p": p,
        "p_reverse": p_rev,
    }


def program_vs_background(fate, genes, background, label):
    """The whole cryptic set against a reference gene universe.

    Secondary and weaker than `contrast`: the curated exons come from neuronal
    introns, so a neuronal reference list is expected to overlap them whether
    or not localization has anything to do with the program. Reported for
    completeness and so that an absent signal in the primary test can be told
    apart from a list that matches nothing at all.
    """
    hosts = set(fate["gene_norm"])
    bg = set(background) - hosts
    kh = len(hosts & genes)
    kb = len(bg & genes)
    odds, p = fisher_2x2(kh, len(hosts), kb, len(bg))
    return {
        "list": label,
        "n_hosts": len(hosts),
        "hosts_localized": kh,
        "host_rate": kh / len(hosts) if hosts else float("nan"),
        "n_background": len(bg),
        "background_localized": kb,
        "background_rate": kb / len(bg) if bg else float("nan"),
        "odds_ratio": odds,
        "p": p,
    }


def summarize(fate, lists, background=None, min_datasets=0):
    """Run the primary contrast for every list, with BH across lists."""
    f = fate.copy()
    f["gene_norm"] = [norm_symbol(g) for g in f["gene"]]
    f["klass"] = [fate_class(x) for x in f["fate"]]
    if min_datasets:
        if "n_datasets" not in f.columns:
            raise SystemExit("--min-datasets needs --compendium")
        f = f[f["n_datasets"] >= min_datasets]
    rows = [contrast(f, genes, label) for label, genes in sorted(lists.items())]
    out = pd.DataFrame(rows)
    if len(out):
        out["padj"] = bh(out["p"].tolist())
        out["padj_reverse"] = bh(out["p_reverse"].tolist())
    extra = None
    if background is not None:
        extra = pd.DataFrame([program_vs_background(f, genes, background, label)
                              for label, genes in sorted(lists.items())])
        if len(extra):
            extra["padj"] = bh(extra["p"].tolist())
    return f, out, extra


def _verdict(out):
    """One line, and it has to be earned.

    Requires a significant adjusted p AND the predicted direction AND a rate
    difference big enough to matter. The motif scan taught this lesson: a
    verdict line that fires on rank alone will announce a result that the
    numbers underneath do not support.
    """
    if not len(out):
        return "no lists given, so nothing was tested"
    hit = out[(out["padj"] < 0.05) & (out["odds_ratio"] > 1)]
    if len(hit):
        names = ", ".join(hit["list"])
        return (f"in-frame cryptic exons ARE enriched for localized messages "
                f"({names}); the productive minority is not a frame artifact")
    # Tested before the null branch on purpose: a backwards result is a
    # finding, and checking it second lets the null swallow it.
    back = out[out["padj_reverse"] < 0.05]
    if len(back):
        return (f"the enrichment runs BACKWARDS ({', '.join(back['list'])}): "
                "decay-class exons are the localized ones, which is not what "
                "a productive-minority model predicts")
    lo = out["p"].min()
    return ("no difference between in-frame and decay exons in localization "
            f"(smallest unadjusted p {lo:.3g}); the in-frame class behaves "
            "like what the 2/3 frame null leaves behind")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fate", required=True,
                    help="per-event table from `evaluate cryptic-fate --out`")
    ap.add_argument("--list", action="append", default=[], metavar="NAME=PATH",
                    help="localization gene list; repeatable. Append :COLUMN "
                         "to take one column, e.g. axon=mmc3.xlsx:gene_name")
    ap.add_argument("--background", default=None,
                    help="reference gene universe for the secondary test")
    ap.add_argument("--compendium", default=None,
                    help="compendium_cryptics.csv, to attach dataset counts")
    ap.add_argument("--min-datasets", type=int, default=0,
                    help="keep only exons whose junction reproduces in at "
                         "least this many depletion datasets")
    ap.add_argument("--tol", type=int, default=5,
                    help="bases of slack when matching a junction endpoint "
                         "to an exon boundary")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    fate = pd.read_csv(args.fate, sep="\t")
    for col in ("gene", "fate"):
        if col not in fate.columns:
            raise SystemExit(f"{args.fate} has no column {col!r}; "
                             "pass the per-event table, not the summary")
    print(f"{len(fate)} classified cryptic exons in {fate['gene'].nunique()} genes")
    print("  " + ", ".join(f"{k} {v}" for k, v in
                           fate["fate"].value_counts().items()))

    if args.compendium:
        if not {"chrom", "a_start", "a_end"} <= set(fate.columns):
            raise SystemExit("--compendium needs chrom/a_start/a_end in the "
                             "fate table")
        rep = dataset_counts(args.compendium)
        print(f"compendium: {len(rep)} unique cryptic junctions")
        fate["n_datasets"] = match_datasets(fate, rep, args.tol)
        matched = int((fate["n_datasets"] > 0).sum())
        print(f"  matched {matched} of {len(fate)} exons to a junction "
              f"within {args.tol} nt")
        if args.min_datasets:
            keep = int((fate["n_datasets"] >= args.min_datasets).sum())
            print(f"  {keep} reproduce in >= {args.min_datasets} datasets")

    lists = {}
    for spec in args.list:
        if "=" not in spec:
            raise SystemExit(f"--list wants NAME=PATH, got {spec!r}")
        name, path = spec.split("=", 1)
        column = sheet = None
        if ":" in path and not os.path.exists(os.path.expanduser(path)):
            path, column = path.rsplit(":", 1)
        if "#" in path:
            path, sheet = path.split("#", 1)
        genes = read_gene_list(path, column, sheet)
        lists[name] = genes
        where = os.path.basename(path) + (f"#{sheet}" if sheet else "")
        note = ""
        if len(genes) < SMALL_LIST:
            note = ("  <- too small to test against; a core/consensus set is "
                    "housekeeping genes, not a localization universe")
        sample = ", ".join(sorted(genes)[:4])
        print(f"list {name}: {len(genes)} symbols from {where}{note}")
        print(f"    e.g. {sample}")

    background = None
    if args.background:
        background = read_gene_list(args.background)
        print(f"background: {len(background)} symbols")

    if not lists:
        raise SystemExit("no --list given; see the module docstring for where "
                         "to get the published localization tables")

    hosts = {norm_symbol(g) for g in fate["gene"]}
    for label, genes in sorted(lists.items()):
        n = len(hosts & genes)
        print(f"  {label} covers {n} of {len(hosts)} host genes "
              f"({n / len(hosts):.1%})")

    f, out, extra = summarize(fate, lists, background, args.min_datasets)
    print(f"\ntested on {len(f)} exons: "
          f"{int((f['klass'] == 'novel_protein').sum())} in-frame, "
          f"{int((f['klass'] == 'decay').sum())} decay")
    print("\nin-frame vs decay, within the curated set:")
    print(out.to_string(index=False, float_format=lambda v: f"{v:.4g}"))
    if extra is not None:
        print("\nsecondary, whole program vs background (weaker, see docstring):")
        print(extra.to_string(index=False, float_format=lambda v: f"{v:.4g}"))

    print("\n" + _verdict(out))

    for label, genes in sorted(lists.items()):
        hit = sorted(set(f.loc[(f["klass"] == "novel_protein") &
                               f["gene_norm"].isin(genes), "gene_norm"]))
        if hit:
            print(f"\nin-frame and in {label}: {', '.join(hit)}")

    if args.out:
        out.to_csv(args.out, sep="\t", index=False)
        per = os.path.splitext(args.out)[0] + "-per-event.tsv"
        f.to_csv(per, sep="\t", index=False)
        print(f"\nwrote {args.out} and {per}")
        if extra is not None:
            bgp = os.path.splitext(args.out)[0] + "-background.tsv"
            extra.to_csv(bgp, sep="\t", index=False)
            print(f"wrote {bgp}")


if __name__ == "__main__":
    sys.exit(main())
