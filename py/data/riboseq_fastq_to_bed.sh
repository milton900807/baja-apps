#!/usr/bin/env bash
set -euo pipefail

# ======================
# CONFIGURATION
# ======================

THREADS=8
ADAPTER="AGATCGGAAGAGCACACGTCTGAACTCCAGTCA"   # common Illumina / Ribo-seq adapter
GENOME_INDEX="genome/bowtie2/genome"          # bowtie2 index prefix
OUTDIR="riboseq_bed"

mkdir -p "$OUTDIR"/{trimmed,bam,bed}

# ======================
# USAGE
# ======================
# ./riboseq_fastq_to_bed.sh riboseq_fastq/*.fastq.gz

if [[ "$#" -lt 1 ]]; then
  echo "Usage: $0 <fastq.gz files>"
  exit 1
fi

# ======================
# MAIN LOOP
# ======================

for fq in "$@"; do
  sample=$(basename "$fq" .fastq.gz)
  echo "Processing $sample"

  # ----------------------
  # 1. Adapter trimming
  # ----------------------
  cutadapt \
    -a "$ADAPTER" \
    -m 25 -M 40 \
    -o "$OUTDIR/trimmed/${sample}.trimmed.fastq.gz" \
    "$fq"

  # ----------------------
  # 2. Alignment
  # ----------------------
  bowtie2 \
    -x "$GENOME_INDEX" \
    -U "$OUTDIR/trimmed/${sample}.trimmed.fastq.gz" \
    -p "$THREADS" \
    --very-sensitive \
    --no-unal \
  | samtools view -bS - \
  | samtools sort -@ "$THREADS" -o "$OUTDIR/bam/${sample}.sorted.bam"

  samtools index "$OUTDIR/bam/${sample}.sorted.bam"

  # ----------------------
  # 3. Filter mapped reads
  # ----------------------
  samtools view \
    -b \
    -F 4 \
    -q 20 \
    "$OUTDIR/bam/${sample}.sorted.bam" \
    > "$OUTDIR/bam/${sample}.filtered.bam"

  samtools index "$OUTDIR/bam/${sample}.filtered.bam"

  # ----------------------
  # 4. BAM → BED
  # ----------------------
  bedtools bamtobed \
    -i "$OUTDIR/bam/${sample}.filtered.bam" \
    > "$OUTDIR/bed/${sample}.bed"

  echo "Finished $sample"
  echo
done

echo "All samples processed."

