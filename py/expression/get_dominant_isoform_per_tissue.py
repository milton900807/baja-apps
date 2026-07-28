import pandas as pd
import numpy as np

GTEX_TPM_TSV = "gtex_v8_transcript_median_tpm.tsv"
TX2GENE_TSV = "transcript_to_gene.tsv"
TARGET_GENE = "ENSG00000067715"
MIN_GENE_TPM = 1.0  # ignore noise tissues

# --------------------
# Load data
# --------------------
gtex = pd.read_csv(GTEX_TPM_TSV, sep="\t")
tx2gene = pd.read_csv(TX2GENE_TSV, sep="\t")

# normalize column names
assert "transcript" in gtex.columns
tissue_cols = [c for c in gtex.columns if c != "transcript"]

gtex["tx"] = gtex["transcript"].str.replace(r"\.\d+$", "", regex=True)

# merge transcript -> gene
m = gtex.merge(tx2gene, on="tx", how="inner")

# restrict to gene of interest
m = m[m["gene_id"] == TARGET_GENE].copy()
assert len(m) > 0, "Gene not found"

# --------------------
# Find dominant isoform per tissue
# --------------------
rows = []

for tissue in tissue_cols:
    sub = m[["tx", tissue]].copy()
    sub[tissue] = pd.to_numeric(sub[tissue], errors="coerce").fillna(0.0)

    gene_tpm = sub[tissue].sum()
    if gene_tpm < MIN_GENE_TPM:
        continue  # skip low-expression tissues

    idx = sub[tissue].idxmax()
    dom_tx = sub.loc[idx, "tx"]
    dom_tpm = sub.loc[idx, tissue]
    dom_frac = dom_tpm / gene_tpm

    rows.append({
        "gene_id": TARGET_GENE,
        "tissue": tissue,
        "dominant_transcript": dom_tx,
        "dominant_tpm": dom_tpm,
        "gene_tpm": gene_tpm,
        "dominant_frac": dom_frac,
    })

out = pd.DataFrame(rows).sort_values("dominant_frac", ascending=False)
out.to_csv("SYT1_dominant_isoforms.tsv", sep="\t", index=False)

print(out.head(10))

