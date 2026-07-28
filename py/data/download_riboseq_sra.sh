#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./download_riboseq_sra.sh SRR1234567 SRR2345678
#   ./download_riboseq_sra.sh --file accessions.txt
#
# Requirements:
#   - sratoolkit (prefetch, fasterq-dump)
#   - pigz (optional, for fast gzip compression)

OUTDIR="riboseq_fastq"
THREADS="${THREADS:-8}"
SRA_CACHE="${SRA_CACHE:-$PWD/sra_cache}"

mkdir -p "$OUTDIR" "$SRA_CACHE"

ACCESSIONS=()

if [[ "${1:-}" == "--file" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "ERROR: --file requires a path to a text file with one accession per line." >&2
    exit 1
  fi
  mapfile -t ACCESSIONS < <(grep -v '^\s*$' "$2" | sed 's/#.*//g' | sed 's/^\s*//; s/\s*$//')
else
  ACCESSIONS=("$@")
fi

if [[ "${#ACCESSIONS[@]}" -eq 0 ]]; then
  echo "ERROR: Provide SRR/ERR/DRR accessions as args or via --file." >&2
  exit 1
fi

echo "Downloading ${#ACCESSIONS[@]} accessions..."
echo "Output: $OUTDIR"
echo "Threads: $THREADS"
echo "SRA cache: $SRA_CACHE"
echo

# Improve reliability of downloads + caching
export VDB_CONFIG="$SRA_CACHE/vdb-config"
mkdir -p "$VDB_CONFIG"

for acc in "${ACCESSIONS[@]}"; do
  echo "==> [$acc] prefetch"
  prefetch --max-size 200G --output-directory "$SRA_CACHE" "$acc"

  echo "==> [$acc] fasterq-dump"
  # --split-files handles paired-end (creates *_1.fastq and *_2.fastq) and single-end (creates *.fastq)
  fasterq-dump \
    --split-files \
    --threads "$THREADS" \
    --outdir "$OUTDIR" \
    "$SRA_CACHE/$acc"

  # Compress FASTQs (pigz if available, else gzip)
  echo "==> [$acc] compress"
  if command -v pigz >/dev/null 2>&1; then
    pigz -p "$THREADS" -f "$OUTDIR/${acc}"*.fastq
  else
    gzip -f "$OUTDIR/${acc}"*.fastq
  fi

  echo "==> [$acc] done"
  echo
done

echo "All downloads complete."
ls -lh "$OUTDIR"

