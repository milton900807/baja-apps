#!/usr/bin/env bash
# Stage 5 — sort + bgzip the BED and print how to deploy both outputs to the app's /bd/.
set -euo pipefail

WORK="./out"
while [ $# -gt 0 ]; do
  case "$1" in
    --work) WORK="$2"; shift 2;;
    *) echo "unknown arg: $1"; exit 2;;
  esac
done

BED="$WORK/aso_sirna_gt_2020_2026_hg38_transcript_hits.bed"
META="$WORK/aso_sirna_gt_2020_2026_meta.tsv"
GZ="$BED.gz"

[ -f "$BED" ]  || { echo "missing $BED (run stage 3)"; exit 1; }
[ -f "$META" ] || { echo "missing $META (run stage 4)"; exit 1; }
command -v bgzip >/dev/null || { echo "bgzip not found — install htslib/tabix"; exit 1; }

echo "▶ sorting BED by (transcript, start)…"
LC_ALL=C sort -k1,1 -k2,2n "$BED" > "$BED.sorted"
mv "$BED.sorted" "$BED"

echo "▶ bgzipping…"
bgzip -f "$BED"          # -> $GZ
echo "✓ $GZ"
echo "✓ $META"
echo
echo "Deploy to the app server's BIG_DATA dir (the app's /bd/):"
echo "  scp -i <key.pem> '$GZ'  ubuntu@<host>:/home/ubuntu/baja-bd/"
echo "  scp -i <key.pem> '$META' ubuntu@<host>:/home/ubuntu/baja-bd/"
echo
echo "The 'ASO / siRNA / gene therapy (2020–2026)' menu item already points at these names."
echo "First load auto-builds the tabix + assignee indexes (a few seconds)."
