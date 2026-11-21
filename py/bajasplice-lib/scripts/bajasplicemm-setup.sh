#!/usr/bin/env bash
# BajaSpliceMM: fetch the mouse reference, build the datasets, run the controls,
# train the mouse splice-site model. Run from WSL on the GPU box:
#
#     bash py/bajasplice-lib/scripts/bajasplicemm-setup.sh
#
# Re-running is safe: every step skips work whose output already exists. Override
# any of these from the environment:
#
#     MM_ROOT      project root for mouse           (default ~/ml/splicing-mm)
#     MM_REF       where the FASTA and GTF live     (default $MM_ROOT/reference)
#     GENCODE_M    release to pin, e.g. M37         (default: whatever latest_release is)
#     HUMAN_CKPT   human ss_ctx2000.pt for the zero-shot control
#                  (default: the bundled one, else ~/ml/splicing/models/ss_ctx2000.pt)
#     EPOCHS       training epochs                  (default 8, as for human)
#     STOP_BEFORE_TRAIN=1   prepare and run the controls only
set -euo pipefail

MM_ROOT="${MM_ROOT:-$HOME/ml/splicing-mm}"
MM_REF="${MM_REF:-$MM_ROOT/reference}"
EPOCHS="${EPOCHS:-8}"
BASE="https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n== %s\n' "$*"; }

say "Installing the package (adds the bajasplicemm command)"
pip install -q -e "$LIB"
command -v bajasplicemm >/dev/null || { echo "bajasplicemm is not on PATH after install"; exit 1; }

mkdir -p "$MM_REF"
if [[ -n "${GENCODE_M:-}" ]]; then
  REL="release_${GENCODE_M}"; VER="$GENCODE_M"
else
  REL="latest_release"
  VER="$(curl -fsSL "$BASE/$REL/" | grep -o 'gencode\.vM[0-9]*\.annotation\.gtf\.gz' | head -1 \
         | sed -E 's/gencode\.v(M[0-9]+)\..*/\1/')"
  [[ -n "$VER" ]] || { echo "could not read the release from $BASE/$REL/ ; set GENCODE_M=M37 (or newer)"; exit 1; }
fi
GTF="$MM_REF/gencode.v${VER}.annotation.gtf.gz"
FA="$MM_REF/GRCm39.primary_assembly.genome.fa"
say "Reference: GRCm39, GENCODE $VER -> $MM_REF"

if [[ ! -s "$GTF" ]]; then
  curl -fL --retry 3 -o "$GTF.part" "$BASE/$REL/gencode.v${VER}.annotation.gtf.gz" && mv "$GTF.part" "$GTF"
fi
if [[ ! -s "$FA" ]]; then
  # pyfaidx needs random access, so the FASTA is stored uncompressed (~2.7 GB)
  curl -fL --retry 3 -o "$FA.gz.part" "$BASE/$REL/GRCm39.primary_assembly.genome.fa.gz" \
    && gzip -t "$FA.gz.part" && gunzip -c "$FA.gz.part" > "$FA.part" \
    && mv "$FA.part" "$FA" && rm -f "$FA.gz.part"
fi

say "Configuring the mouse root (separate from the human one)"
bajasplicemm config --root "$MM_ROOT" --genome-fasta "$FA" --gencode-gtf "$GTF" --save

say "Datasets"
[[ -s "$MM_ROOT/data/interim/exons.tsv" ]]               || bajasplicemm prepare gencode
[[ -s "$MM_ROOT/data/processed/genes.sqlite" ]]          || bajasplicemm prepare geneindex
[[ -s "$LIB/bajasplice/data/genes.slim.mouse.sqlite" ]]  || bajasplicemm prepare geneindex --slim
[[ -s "$MM_ROOT/data/processed/splicesite_index.pkl" ]]  || bajasplicemm prepare splicesite

say "Control 1: motif-only PWM"
[[ -s "$MM_ROOT/results/baseline_pwm_metrics.json" ]] || bajasplicemm evaluate baseline-splicesite

say "Control 2: the human model, zero-shot on mouse"
if [[ ! -s "$MM_ROOT/results/zero_shot_human_metrics.json" ]]; then
  if [[ -z "${HUMAN_CKPT:-}" && ! -s "$LIB/bajasplice/weights/ss_ctx2000.pt" \
        && -s "$HOME/ml/splicing/models/ss_ctx2000.pt" ]]; then
    HUMAN_CKPT="$HOME/ml/splicing/models/ss_ctx2000.pt"
  fi
  bajasplicemm evaluate zero-shot ${HUMAN_CKPT:+--ckpt "$HUMAN_CKPT"} \
    || echo "SKIPPED the zero-shot control: no human checkpoint found. Set HUMAN_CKPT and re-run."
fi

if [[ "${STOP_BEFORE_TRAIN:-0}" == "1" ]]; then
  bajasplicemm evaluate splicesite-report; exit 0
fi

say "Training the mouse splice-site model (context 2000, $EPOCHS epochs)"
[[ -s "$MM_ROOT/models/ss_ctx2000.pt" && -s "$MM_ROOT/results/ss_ctx2000_metrics.json" ]] \
  || bajasplicemm train splicesite --context 2000 --epochs "$EPOCHS" 2>&1 | tee "$MM_ROOT/logs/train_ss_ctx2000.log"

say "Results"
bajasplicemm evaluate splicesite-report | tee "$MM_ROOT/results/splicesite_report.txt"

say "Sanity check on a known gene"
bajasplicemm scan --gene Tardbp --top 10

cat <<MSG

To ship the mouse model with the package, as the human one is:
    cp "$MM_ROOT/models/ss_ctx2000.pt" "$LIB/bajasplice/weights/mm_ss_ctx2000.pt"
The slim mouse gene index is already at
    $LIB/bajasplice/data/genes.slim.mouse.sqlite
MSG
