"""nputs:
  1) gtex_v8_transcript_median_tpm.tsv
     - columns: transcript, <tissue1>, <tissue2>, ...
     - values: median TPM per transcript per tissue

  2) transcript_to_gene.tsv (you create this once)
     - columns: tx, gene_id
     - tx should match normalized transcript IDs used in GTEx (ENST... no version)
     - gene_id should be ENSG... (no version)
     Example rows:
        ENST00000373020    ENSG00000123456

Outputs:
  - gene_tissue_usage.tsv: per gene x tissue isoform usage and gene expression summaries
  - gene_splicing_metrics.tsv: per gene splicing tissue-specificity metrics
  - gene_expression_splicing_association.tsv: per gene association (corr) between switching and expression
"""

import argparse
import numpy as np
import pandas as pd

def normalize_ensembl_id(s: str) -> str:
    s = str(s).split(",")[0]
    s = s.replace("transcript:", "").replace("gene:", "").replace("rna-", "")
    # strip version suffix .1
    if "." in s:
        left, right = s.rsplit(".", 1)
        if right.isdigit():
            s = left
    return s

def safe_entropy(p: np.ndarray, eps: float = 1e-12) -> float:
    """Entropy of a probability vector p (assumes p>=0)."""
    p = np.asarray(p, dtype=np.float64)
    p = p[p > 0]
    if p.size == 0:
        return np.nan
    p = p / (p.sum() + eps)
    return float(-np.sum(p * np.log(p + eps)))

def max_isoform_switch(usage_mat: np.ndarray) -> float:
    """
    usage_mat: shape [n_tissues, n_isoforms], rows sum ~1
    We define "switch" as max_tissue(top_isoform_frac) - min_tissue(top_isoform_frac)
    where top isoform is defined per tissue (so it can change).
    Practical proxy:
      take max over tissues of max usage, minus min over tissues of max usage.
    """
    if usage_mat.size == 0:
        return np.nan
    top_per_tissue = np.max(usage_mat, axis=1)  # dominant isoform fraction each tissue
    return float(np.max(top_per_tissue) - np.min(top_per_tissue))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtex_tpm_tsv", required=True, help="GTEx transcript median TPM TSV")
    ap.add_argument("--tx2gene_tsv", required=True, help="TSV with columns: tx, gene_id")
    ap.add_argument("--min_gene_tpm", type=float, default=1.0, help="Min gene TPM in a tissue to consider usage meaningful")
    ap.add_argument("--min_tissues", type=int, default=5, help="Min tissues with gene TPM>=min_gene_tpm to compute gene metrics")
    ap.add_argument("--out_prefix", default="gtex_splicing", help="Output prefix")
    args = ap.parse_args()

    # -----------------------
    # Load data
    # -----------------------
    gtex = pd.read_csv(args.gtex_tpm_tsv, sep="\t")
    if "transcript" not in gtex.columns:
        raise RuntimeError("Expected a 'transcript' column in GTEx TSV.")

    tissue_cols = [c for c in gtex.columns if c != "transcript"]
    gtex["tx"] = gtex["transcript"].map(normalize_ensembl_id)

    tx2gene = pd.read_csv(args.tx2gene_tsv, sep="\t")
    if not {"tx", "gene_id"}.issubset(tx2gene.columns):
        raise RuntimeError("tx2gene must contain columns: tx, gene_id")

    tx2gene["tx"] = tx2gene["tx"].map(normalize_ensembl_id)
    tx2gene["gene_id"] = tx2gene["gene_id"].map(normalize_ensembl_id)

    # merge transcript TPMs with gene IDs
    m = gtex.merge(tx2gene[["tx", "gene_id"]], on="tx", how="inner")
    if len(m) == 0:
        raise RuntimeError("No transcript IDs matched between GTEx TSV and tx2gene mapping.")

    # ensure numeric
    m[tissue_cols] = m[tissue_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)

    # -----------------------
    # Compute gene expression per tissue (sum isoforms)
    # -----------------------
    # gene_tpm: [gene x tissue]
    gene_tpm = m.groupby("gene_id")[tissue_cols].sum()

    # -----------------------
    # Compute isoform usage per gene per tissue
    # usage = tx_tpm / gene_tpm (within tissue)
    # We'll keep in "long" format for some outputs.
    # -----------------------
    rows = []
    # group transcripts within each gene
    for gene_id, sub in m.groupby("gene_id", sort=False):
        # transcript TPM matrix: [n_isoforms x n_tissues]
        tx_ids = sub["tx"].tolist()
        tx_tpm = sub[tissue_cols].to_numpy(dtype=np.float64)

        gvec = gene_tpm.loc[gene_id].to_numpy(dtype=np.float64)  # [n_tissues]
        # avoid divide by zero
        denom = np.where(gvec > 0, gvec, np.nan)
        usage = tx_tpm / denom  # [n_isoforms x n_tissues]

        # transpose to [n_tissues x n_isoforms]
        usage_T = usage.T

        # For each tissue, compute entropy of usage (isoform diversity)
        ent = np.array([safe_entropy(usage_T[i, :]) for i in range(usage_T.shape[0])], dtype=np.float64)

        # dominant isoform fraction per tissue
        top_frac = np.nanmax(usage_T, axis=1)

        # Store per gene x tissue summary
        for ti, tissue in enumerate(tissue_cols):
            rows.append({
                "gene_id": gene_id,
                "tissue": tissue,
                "gene_tpm": float(gvec[ti]),
                "isoform_entropy": float(ent[ti]) if np.isfinite(ent[ti]) else np.nan,
                "dominant_isoform_frac": float(top_frac[ti]) if np.isfinite(top_frac[ti]) else np.nan,
                "n_isoforms": len(tx_ids),
            })

    gene_tissue = pd.DataFrame(rows)
    gene_tissue.to_csv(f"{args.out_prefix}_gene_tissue_usage.tsv", sep="\t", index=False)

    # -----------------------
    # Per-gene splicing tissue-specificity metrics
    # -----------------------
    gene_metrics = []
    for gene_id, sub in gene_tissue.groupby("gene_id", sort=False):
        # filter tissues where gene expression is meaningful
        sub2 = sub[sub["gene_tpm"] >= args.min_gene_tpm].copy()
        if len(sub2) < args.min_tissues:
            continue

        # tissue variation in dominant isoform fraction
        dom = sub2["dominant_isoform_frac"].to_numpy(dtype=np.float64)
        ent = sub2["isoform_entropy"].to_numpy(dtype=np.float64)
        gexp = sub2["gene_tpm"].to_numpy(dtype=np.float64)

        # "switchiness" proxy: how much dominant isoform fraction changes across tissues
        dom_switch = float(np.nanmax(dom) - np.nanmin(dom))

        # isoform diversity shifts: range in entropy across tissues
        ent_range = float(np.nanmax(ent) - np.nanmin(ent))

        # tissue specificity of gene expression (simple: log range)
        expr_log = np.log1p(gexp)
        expr_range = float(np.nanmax(expr_log) - np.nanmin(expr_log))

        gene_metrics.append({
            "gene_id": gene_id,
            "n_tissues_used": int(len(sub2)),
            "n_isoforms": int(sub2["n_isoforms"].iloc[0]),
            "dominant_isoform_switch_range": dom_switch,
            "isoform_entropy_range": ent_range,
            "log1p_gene_expr_range": expr_range,
            "median_gene_tpm": float(np.nanmedian(gexp)),
        })

    gene_metrics = pd.DataFrame(gene_metrics)
    gene_metrics.to_csv(f"{args.out_prefix}_gene_splicing_metrics.tsv", sep="\t", index=False)

    # -----------------------
    # Association: does "more switching" relate to higher/lower expression in tissues?
    # Per gene: corr( dominant_isoform_frac , log1p(gene_tpm) ) across tissues
    # Interpretation:
    #   - positive corr: tissues where one isoform dominates more tend to have higher gene expression
    #   - negative corr: tissues where dominance is lower (more balanced usage) tend to have higher expression
    #
    # Also corr(entropy, expression): whether higher isoform diversity tracks expression
    # -----------------------
    assoc_rows = []
    for gene_id, sub in gene_tissue.groupby("gene_id", sort=False):
        sub2 = sub[sub["gene_tpm"] >= args.min_gene_tpm].copy()
        if len(sub2) < args.min_tissues:
            continue

        x_dom = sub2["dominant_isoform_frac"].to_numpy(dtype=np.float64)
        x_ent = sub2["isoform_entropy"].to_numpy(dtype=np.float64)
        y = np.log1p(sub2["gene_tpm"].to_numpy(dtype=np.float64))

        def corr(a, b):
            a = np.asarray(a); b = np.asarray(b)
            mask = np.isfinite(a) & np.isfinite(b)
            if mask.sum() < 3:
                return np.nan
            a = a[mask]; b = b[mask]
            if np.std(a) < 1e-8 or np.std(b) < 1e-8:
                return np.nan
            return float(np.corrcoef(a, b)[0, 1])

        assoc_rows.append({
            "gene_id": gene_id,
            "n_tissues_used": int(len(sub2)),
            "corr_domFrac_vs_logExpr": corr(x_dom, y),
            "corr_entropy_vs_logExpr": corr(x_ent, y),
            "median_gene_tpm": float(np.nanmedian(np.expm1(y))),  # back to TPM-ish
            "dominant_isoform_switch_range": float(np.nanmax(x_dom) - np.nanmin(x_dom)),
            "isoform_entropy_range": float(np.nanmax(x_ent) - np.nanmin(x_ent)),
            "n_isoforms": int(sub2["n_isoforms"].iloc[0]),
        })

    assoc = pd.DataFrame(assoc_rows)
    assoc.to_csv(f"{args.out_prefix}_gene_expression_splicing_association.tsv", sep="\t", index=False)

    print("[OK] Wrote:")
    print(f"  {args.out_prefix}_gene_tissue_usage.tsv")
    print(f"  {args.out_prefix}_gene_splicing_metrics.tsv")
    print(f"  {args.out_prefix}_gene_expression_splicing_association.tsv")

if __name__ == "__main__":
    main()

