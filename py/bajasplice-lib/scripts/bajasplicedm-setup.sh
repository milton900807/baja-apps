#!/usr/bin/env bash
# BajaSpliceDM: fetch the fly reference, build the datasets, run the controls,
# train the fly splice-site model. Run from WSL on the GPU box:
#
#     bash py/bajasplice-lib/scripts/bajasplicedm-setup.sh
#
# Re-running is safe: every step skips work whose output already exists.
#
# THE REFERENCE IS ENSEMBL'S, NOT GENCODE'S OR UCSC'S. GENCODE has no fly release, and
# the UCSC dm6 FASTA names the arms chr2L where the Ensembl annotation says 2L. Both
# files come from the same Ensembl release so the names agree.
#
#     DM_ROOT      project root for fly             (default ~/ml/splicing-dm)
#     DM_REF       where the FASTA and GTF live     (default $DM_ROOT/reference)
#     ENSEMBL_REL  release to pin, e.g. 113         (default: Ensembl's current)
#     DM_GTF_URL, DM_FA_URL   exact URLs, if the listing cannot be read
#     HUMAN_CKPT   human ss_ctx2000.pt for the zero-shot control
#     MOUSE_CKPT   mouse ss_ctx2000.pt for a second one
#                  (defaults: bundled, else ~/ml/splicing[-mm]/models/ss_ctx2000.pt)
#     EPOCHS       training epochs (default 20: the fly genome yields far fewer windows
#                  than a mammal's, so the same number of passes is far fewer steps)
#     STOP_BEFORE_TRAIN=1   prepare and run the controls only
set -euo pipefail

DM_ROOT="${DM_ROOT:-$HOME/ml/splicing-dm}"
DM_REF="${DM_REF:-$DM_ROOT/reference}"
EPOCHS="${EPOCHS:-20}"
if [[ -n "${ENSEMBL_REL:-}" ]]; then
  GTF_DIR="https://ftp.ensembl.org/pub/release-${ENSEMBL_REL}/gtf/drosophila_melanogaster"
  FA_DIR="https://ftp.ensembl.org/pub/release-${ENSEMBL_REL}/fasta/drosophila_melanogaster/dna"
else
  GTF_DIR="https://ftp.ensembl.org/pub/current_gtf/drosophila_melanogaster"
  FA_DIR="https://ftp.ensembl.org/pub/current_fasta/drosophila_melanogaster/dna"
fi
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\n== %s\n' "$*"; }
fetch() {   # fetch URL DEST   (resumes a partial download; a failure stops the run)
  curl -fL --retry 3 -C - -o "$2.part" "$1" || { echo "DOWNLOAD FAILED: $1"; exit 1; }
  mv "$2.part" "$2"
}
newest() {  # newest DIR_URL REGEX -> the matching file name in an index listing
  # `|| true`: an unreadable listing must reach the message below, not kill the run here
  { curl -fsSL "$1/" | grep -oE "$2" | sort -u | tail -1; } || true
}

say "Installing the package (adds the bajasplicedm command)"
pip install -q -e "$LIB"
command -v bajasplicedm >/dev/null || { echo "bajasplicedm is not on PATH after install"; exit 1; }

mkdir -p "$DM_REF"
GTF="$(ls "$DM_REF"/Drosophila_melanogaster.BDGP6*.gtf.gz 2>/dev/null | head -1 || true)"
FA="$(ls "$DM_REF"/Drosophila_melanogaster.BDGP6*.dna.toplevel.fa 2>/dev/null | head -1 || true)"

if [[ -z "$GTF" ]]; then
  if [[ -z "${DM_GTF_URL:-}" ]]; then
    # the plain annotation, not the .chr or .abinitio variants beside it
    f="$(newest "$GTF_DIR" 'Drosophila_melanogaster\.BDGP6\.[0-9]+\.[0-9]+\.gtf\.gz')"
    [[ -n "$f" ]] || { echo "could not find the fly GTF under $GTF_DIR ; set DM_GTF_URL (and DM_FA_URL)"; exit 1; }
    DM_GTF_URL="$GTF_DIR/$f"
  fi
  GTF="$DM_REF/$(basename "$DM_GTF_URL")"
  fetch "$DM_GTF_URL" "$GTF"
fi
if [[ -z "$FA" ]]; then
  if [[ -z "${DM_FA_URL:-}" ]]; then
    f="$(newest "$FA_DIR" 'Drosophila_melanogaster\.BDGP6\.[0-9]+\.dna\.toplevel\.fa\.gz')"
    [[ -n "$f" ]] || { echo "could not find the fly FASTA under $FA_DIR ; set DM_FA_URL"; exit 1; }
    DM_FA_URL="$FA_DIR/$f"
  fi
  FAGZ="$DM_REF/$(basename "$DM_FA_URL")"; FA="${FAGZ%.gz}"
  [[ -s "$FAGZ" ]] || fetch "$DM_FA_URL" "$FAGZ"
  gzip -t "$FAGZ" || { echo "$FAGZ is truncated or corrupt; delete it and re-run"; exit 1; }
  # pyfaidx needs random access, so the FASTA is stored uncompressed (~145 MB)
  gunzip -c "$FAGZ" > "$FA.unzip" || { echo "could not unpack $FAGZ"; exit 1; }
  mv "$FA.unzip" "$FA" && rm -f "$FAGZ"
fi
[[ -s "$FA" && -s "$GTF" ]] || { echo "reference files are missing in $DM_REF"; exit 1; }
say "Reference: $(basename "$FA")  +  $(basename "$GTF")"

say "Configuring the fly root (separate from human and mouse)"
bajasplicedm config --root "$DM_ROOT" --genome-fasta "$FA" --gencode-gtf "$GTF" --save

say "Datasets"
[[ -s "$DM_ROOT/data/interim/exons.tsv" ]]             || bajasplicedm prepare gencode
[[ -s "$DM_ROOT/data/processed/genes.sqlite" ]]        || bajasplicedm prepare geneindex
[[ -s "$LIB/bajasplice/data/genes.slim.fly.sqlite" ]]  || bajasplicedm prepare geneindex --slim
[[ -s "$DM_ROOT/data/processed/splicesite_index.pkl" ]] || bajasplicedm prepare splicesite

say "Control 1: motif-only PWM"
[[ -s "$DM_ROOT/results/baseline_pwm_metrics.json" ]] || bajasplicedm evaluate baseline-splicesite

say "Control 2: the mammalian models, zero-shot on fly"
if [[ ! -s "$DM_ROOT/results/zero_shot_human_metrics.json" ]]; then
  if [[ -z "${HUMAN_CKPT:-}" && ! -s "$LIB/bajasplice/weights/ss_ctx2000.pt" \
        && -s "$HOME/ml/splicing/models/ss_ctx2000.pt" ]]; then
    HUMAN_CKPT="$HOME/ml/splicing/models/ss_ctx2000.pt"
  fi
  bajasplicedm evaluate zero-shot --source human ${HUMAN_CKPT:+--ckpt "$HUMAN_CKPT"} \
    || echo "SKIPPED the human zero-shot control: no human checkpoint found. Set HUMAN_CKPT and re-run."
fi
if [[ ! -s "$DM_ROOT/results/zero_shot_mouse_metrics.json" ]]; then
  if [[ -z "${MOUSE_CKPT:-}" && ! -s "$LIB/bajasplice/weights/mm_ss_ctx2000.pt" \
        && -s "$HOME/ml/splicing-mm/models/ss_ctx2000.pt" ]]; then
    MOUSE_CKPT="$HOME/ml/splicing-mm/models/ss_ctx2000.pt"
  fi
  bajasplicedm evaluate zero-shot --source mouse ${MOUSE_CKPT:+--ckpt "$MOUSE_CKPT"} \
    || echo "SKIPPED the mouse zero-shot control: no mouse checkpoint found. Set MOUSE_CKPT and re-run."
fi

if [[ "${STOP_BEFORE_TRAIN:-0}" == "1" ]]; then
  bajasplicedm evaluate splicesite-report; exit 0
fi

say "Training the fly splice-site model (context 2000, $EPOCHS epochs)"
[[ -s "$DM_ROOT/models/ss_ctx2000.pt" && -s "$DM_ROOT/results/ss_ctx2000_metrics.json" ]] \
  || bajasplicedm train splicesite --context 2000 --epochs "$EPOCHS" 2>&1 | tee "$DM_ROOT/logs/train_ss_ctx2000.log"

say "Results"
bajasplicedm evaluate splicesite-report | tee "$DM_ROOT/results/splicesite_report.txt"

say "Sanity check on a known gene (TBPH, the fly TDP-43)"
bajasplicedm scan --gene TBPH --top 10

cat <<MSG

To ship the fly model with the package:
    cp "$DM_ROOT/models/ss_ctx2000.pt" "$LIB/bajasplice/weights/dm_ss_ctx2000.pt"
The slim fly gene index is already at
    $LIB/bajasplice/data/genes.slim.fly.sqlite
MSG
