#!/usr/bin/env bash
# Download the VCF files of one Baja user folder from the production server.
#
#   ./fetch-user-vcfs.sh 36422442b36c5271f5806c0e2c959eb7dd477dc64602571dad903799b66737ae
#   ./fetch-user-vcfs.sh -n <folder>              # list what it would take, download nothing
#   ./fetch-user-vcfs.sh -d /mnt/c/Users/milto/Downloads/baja-vcf <folder>
#
# Run it from your own machine (WSL), not on the server: it reaches the server over ssh with
# the same key you use by hand, and writes the files underneath -d.
#
# WHAT IT TAKES. Every *.vcf / *.vcf.gz / *.vcf.bgz under the folder, at any depth, including
# the ones under shared/ and shared_with_me/. Their directory structure is preserved, because
# the same file name appears in several of those subfolders and a flat copy would overwrite
# itself; -f asks for a flat copy anyway, with the subfolder prefixed onto each name.
#
# WHAT IT SKIPS. Partial uploads -- the ".<timestamp>-<id>-<name>.part" files the uploader
# leaves behind, which are incomplete by definition. -p takes those too.
#
# It streams one compressed tar over a single ssh connection rather than one scp per file:
# a VCF is text and compresses several-fold, and the connection is set up once.
set -euo pipefail

HOST="${BAJA_HOST:-ubuntu@52.87.30.101}"
KEY="${BAJA_KEY:-$HOME/.ssh/baja.pem}"
ROOT="${BAJA_USERS_ROOT:-/home/ubuntu/baja-users}"
DEST="."
DRY=0; FLAT=0; PARTS=0

usage() { sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
while getopts ':d:h:k:r:nfph-' opt; do
  case "$opt" in
    d) DEST="$OPTARG" ;;
    h) HOST="$OPTARG" ;;
    k) KEY="$OPTARG" ;;
    r) ROOT="$OPTARG" ;;
    n) DRY=1 ;;
    f) FLAT=1 ;;
    p) PARTS=1 ;;
    *) usage 1 ;;
  esac
done
shift $((OPTIND - 1))
[ $# -ge 1 ] || { echo "Which user folder? Give its id, e.g. 36422442b36c...737ae" >&2; usage 1; }
FOLDER="${1%/}"; FOLDER="${FOLDER#./}"

SSH=(ssh -o BatchMode=yes)
[ -r "$KEY" ] && SSH+=(-i "$KEY")

# The find that decides what comes back. Quoted as one remote command so the shell on this
# side does not expand the patterns against the local directory.
NAMES="-name '*.vcf' -o -name '*.vcf.gz' -o -name '*.vcf.bgz'"
SKIP="! -name '*.part'"
# A partial upload is named "<name>.<timestamp>-<id>-<name>.part", so it does not end in .vcf
# at all: -p has to ASK for that shape, not merely stop excluding it.
[ "$PARTS" -eq 1 ] && { NAMES="$NAMES -o -name '*.vcf*.part'"; SKIP=""; }
REMOTE_FIND="cd $(printf %q "$ROOT") && find $(printf %q "./$FOLDER") -type f \\( $NAMES \\) $SKIP"

echo "server : $HOST:$ROOT/$FOLDER"
LIST="$("${SSH[@]}" "$HOST" "$REMOTE_FIND -printf '%s\\t%p\\n' | sort -k2" 2>/dev/null || true)"
if [ -z "$LIST" ]; then
  echo "No VCF files found there." >&2
  "${SSH[@]}" "$HOST" "test -d $(printf %q "$ROOT/$FOLDER")" 2>/dev/null \
    || echo "(that folder does not exist under $ROOT -- check the id)" >&2
  exit 1
fi
printf '%s\n' "$LIST" | awk -F'\t' '{ printf "  %10.1f MB  %s\n", $1/1048576, $2; t+=$1 }
  END { printf "  %10.1f MB  total, %d file(s)\n", t/1048576, NR }'
if [ "$DRY" -eq 1 ]; then echo "(-n: nothing downloaded)"; exit 0; fi

mkdir -p "$DEST"
echo "writing to $(cd "$DEST" && pwd)"
# --null / -T - : the file list crosses as NUL-separated names, so a space or a quote in a
# path cannot split one name into two.
"${SSH[@]}" "$HOST" "$REMOTE_FIND -print0 | tar --null -czf - --no-recursion -T -" \
  | tar -xzvf - -C "$DEST"

if [ "$FLAT" -eq 1 ]; then
  # One directory, names kept distinct by the subfolder they came from.
  find "$DEST/$FOLDER" -type f -name '*.vcf*' -print0 | while IFS= read -r -d '' f; do
    rel="${f#"$DEST/$FOLDER"/}"
    flat="${rel//\//__}"
    [ "$f" = "$DEST/$flat" ] || mv -n "$f" "$DEST/$flat"
  done
  find "$DEST/$FOLDER" -type d -empty -delete 2>/dev/null || true
  rmdir "$DEST/$FOLDER" 2>/dev/null || true
fi

echo "done:"
find "$DEST" -type f -name '*.vcf*' -newermt '-10 minutes' -printf '  %10s  %p\n' 2>/dev/null \
  | sort -k2 || true
