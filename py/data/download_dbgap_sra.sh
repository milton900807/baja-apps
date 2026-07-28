#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./download_dbgap_sra.sh /path/to/prj_XXXX.ngc SRRxxxx SRRyyyy ...
# or:
#   ./download_dbgap_sra.sh /path/to/prj_XXXX.ngc --file accessions.txt

NGC="$1"; shift
OUTDIR="${OUTDIR:-riboseq_fastq}"
CACHE="${CACHE:-$PWD/sra_cache}"
THREADS="${THREADS:-8}"

mkdir -p "$OUTDIR" "$CACHE"

ACCESSIONS=()
if [[ "${1:-}" == "--file" ]]; then
  mapfile -t ACCESSIONS < <(grep -v '^\s*$' "$2" | sed 's/#.*//g' | sed 's/^\s*//; s/\s*$//')
else
  ACCESSIONS=("$@")
fi

if [[ ! -f "$NGC" ]]; then
  echo "ERROR: NGC key not found: $NGC" >&2
  exit 1
fi

if [[ "${#ACCESSIONS[@]}" -eq 0 ]]; then
  echo "ERROR: Provide SRR/ERR/DRR accessions." >&2
  exit 1
fi

for acc in "${ACCESSIONS[@]}"; do
  echo "==> [$acc] prefetch (controlled-access)"
  prefetch --ngc "$NGC" --output-directory "$CACHE" "$acc"

  echo "==> [$acc] fasterq-dump"
  fasterq-dump --ngc "$NGC" --split-files --threads "$THREADS" --outdir "$OUTDIR" "$CACHE/$acc"

  echo "==> [$acc] compress"
  if command -v pigz >/dev/null 2>&1; then
    pigz -p "$THREADS" -f "$OUTDIR/${acc}"*.fastq
  else
    gzip -f "$OUTDIR/${acc}"*.fastq
  fi
done

