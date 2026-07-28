#!/usr/bin/env bash
set -Eeuo pipefail

# Download the current NCBI RefSeq human RNA collection and retain mRNA
# records (curated NM_ and predicted XM_ accessions).

usage() {
  cat <<'EOF'
Usage: download_human_mrna.sh [OPTIONS]

Options:
  -o, --outdir DIR       Output directory (default: human_refseq_mrna)
      --keep-all-rna     Keep the downloaded all-RNA FASTA (.fna.gz)
      --force            Replace existing output files
  -h, --help             Show this help

Output:
  human_refseq_mrna.fna.gz      All RefSeq NM_ and XM_ transcript sequences
  human_refseq_mrna.metadata.tsv

Requires: curl, gzip, awk, md5sum
EOF
}

outdir="human_refseq_mrna"
keep_all_rna=0
force=0

while (($#)); do
  case "$1" in
    -o|--outdir)
      [[ $# -ge 2 ]] || { echo "ERROR: $1 requires a directory" >&2; exit 2; }
      outdir=$2
      shift 2
      ;;
    --keep-all-rna) keep_all_rna=1; shift ;;
    --force) force=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for command in curl gzip awk md5sum; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $command" >&2
    exit 1
  }
done

mkdir -p "$outdir"
assembly_summary_url="https://ftp.ncbi.nlm.nih.gov/genomes/refseq/assembly_summary_refseq.txt"
tmp_summary="${outdir}/assembly_summary_refseq.txt.part"

echo "Finding the current NCBI RefSeq human reference assembly..." >&2
curl --fail --location --retry 5 --retry-delay 2 \
  --output "$tmp_summary" "$assembly_summary_url"

# Columns: assembly_accession, ..., refseq_category, taxid, species_taxid,
# organism_name, ..., version_status, assembly_level, release_type,
# genome_rep, ..., asm_name, ..., ftp_path.
assembly_record=$(awk -F '\t' '
  !/^#/ && $5 == "reference genome" && $6 == 9606 && $11 == "latest" && $20 != "na" {
    print $1 "\t" $16 "\t" $20
    exit
  }
' "$tmp_summary")
[[ -n "$assembly_record" ]] || {
  echo "ERROR: current human reference assembly not found in NCBI assembly summary" >&2
  exit 1
}

IFS=$'\t' read -r assembly_accession assembly_name ftp_path <<< "$assembly_record"
# NCBI currently reports an ftp:// URL; HTTPS works for the same location.
ftp_path=${ftp_path/#ftp:\/\//https:\/\/}
assembly_dir=${ftp_path##*/}
remote_name="${assembly_dir}_rna.fna.gz"
url="${ftp_path}/${remote_name}"
md5_url="${ftp_path}/md5checksums.txt"

all_rna="${outdir}/${remote_name}"
mrna="${outdir}/human_refseq_mrna.fna.gz"
metadata="${outdir}/human_refseq_mrna.metadata.tsv"
tmp_mrna="${mrna}.part"
tmp_md5="${outdir}/md5checksums.txt.part"

if [[ -e "$mrna" && $force -ne 1 ]]; then
  echo "ERROR: output exists: $mrna (use --force to replace it)" >&2
  exit 1
fi

cleanup() { rm -f "$tmp_mrna" "$tmp_md5" "$tmp_summary"; }
trap cleanup EXIT

echo "Downloading RefSeq human RNA..." >&2
curl --fail --location --retry 5 --retry-delay 2 --continue-at - \
  --output "$all_rna" "$url"

echo "Verifying NCBI MD5 checksum..." >&2
curl --fail --location --retry 5 --output "$tmp_md5" "$md5_url"
expected_md5=$(awk -v file="./$remote_name" '$2 == file {print $1; exit}' "$tmp_md5")
[[ -n "$expected_md5" ]] || { echo "ERROR: checksum entry not found" >&2; exit 1; }
actual_md5=$(md5sum "$all_rna" | awk '{print $1}')
[[ "$actual_md5" == "$expected_md5" ]] || {
  echo "ERROR: checksum mismatch for $all_rna" >&2
  exit 1
}

echo "Extracting NM_ and XM_ mRNA records..." >&2
gzip -cd "$all_rna" | awk '
  /^>/ {
    accession = substr($1, 2)
    keep = (accession ~ /^(NM|XM)_[0-9]+\.[0-9]+$/)
  }
  keep
' | gzip -9 > "$tmp_mrna"

gzip -t "$tmp_mrna"
mv -f "$tmp_mrna" "$mrna"

sequence_count=$(gzip -cd "$mrna" | awk '/^>/{n++} END{print n+0}')
downloaded_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
{
  printf 'field\tvalue\n'
  printf 'organism\tHomo sapiens\n'
  printf 'assembly\t%s\n' "$assembly_name"
  printf 'assembly_accession\t%s\n' "$assembly_accession"
  printf 'source\tNCBI RefSeq\n'
  printf 'selection\tNM_ and XM_ accessions\n'
  printf 'sequence_count\t%s\n' "$sequence_count"
  printf 'downloaded_utc\t%s\n' "$downloaded_utc"
  printf 'source_url\t%s\n' "$url"
  printf 'source_md5\t%s\n' "$expected_md5"
} > "$metadata"

if [[ $keep_all_rna -ne 1 ]]; then
  rm -f "$all_rna"
fi
rm -f "$tmp_md5"
rm -f "$tmp_summary"

echo "Done: $mrna ($sequence_count sequences)" >&2
echo "Metadata: $metadata" >&2
