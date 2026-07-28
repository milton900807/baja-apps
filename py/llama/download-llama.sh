#!/usr/bin/env bash
set -euo pipefail

# download-llama.sh
#
# Uses paths relative to this script, not the current working directory.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"

REPO_ID="${REPO_ID:-meta-llama/Meta-Llama-3-8B-Instruct}"
LOCAL_DIR="${LOCAL_DIR:-$SCRIPT_DIR/models/Meta-Llama-3-8B-Instruct}"
REVISION="${REVISION:-main}"
CACHE_DIR="${CACHE_DIR:-}"

DOWNLOADER_PY="$SCRIPT_DIR/download-llama.py"

echo "[INFO] Script dir:     $SCRIPT_DIR"
echo "[INFO] Python:         $PYTHON_BIN"
echo "[INFO] Repo:           $REPO_ID"
echo "[INFO] Revision:       $REVISION"
echo "[INFO] Local dir:      $LOCAL_DIR"

if [[ -n "$CACHE_DIR" ]]; then
  if [[ "$CACHE_DIR" != /* ]]; then
    CACHE_DIR="$SCRIPT_DIR/$CACHE_DIR"
  fi
  echo "[INFO] Cache dir:      $CACHE_DIR"
fi

if [[ ! -f "$DOWNLOADER_PY" ]]; then
  echo "[ERROR] Could not find downloader script: $DOWNLOADER_PY" >&2
  exit 1
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "[ERROR] Python executable not found: $PYTHON_BIN" >&2
  exit 1
fi

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "[WARN] HF_TOKEN is not set."
  echo "[WARN] Public repos may work, but gated repos like Meta Llama will fail."
fi

mkdir -p "$LOCAL_DIR"

CMD=(
  "$PYTHON_BIN" "$DOWNLOADER_PY"
  --repo-id "$REPO_ID"
  --local-dir "$LOCAL_DIR"
  --revision "$REVISION"
  --resume
)

if [[ -n "${HF_TOKEN:-}" ]]; then
  CMD+=(--token "$HF_TOKEN")
fi

if [[ -n "$CACHE_DIR" ]]; then
  CMD+=(--cache-dir "$CACHE_DIR")
fi

echo "[INFO] Running downloader..."
"${CMD[@]}"

echo "[DONE] Model download completed."