#!/usr/bin/env bash
# Stage the slimrank DATA onto the gene.clinic host.
#
# The code for the motif layer ships through git and deploy-all.sh like
# everything else. The data does not, and should not:
#
#   elm_classes.tsv, elm_instances.tsv   ELM's own tables, under ELM's licence
#                                        terms. Staging them onto one host is
#                                        not the same act as committing them
#                                        into a repository.
#   model.joblib                         a build artefact, rebuilt whenever the
#                                        training set changes. A binary that
#                                        changes often is what git holds worst.
#   cons/*.npy                           per-protein conservation, derived from
#                                        Ensembl Compara. Large and re-derivable.
#
# py/bio/protein/slim-scan.py reads all of it from $SLIMRANK_HOME, default
# /opt/baja-apps/data/slimrank. With the tables missing it answers with an error
# the UI shows. With the model missing it still returns motifs and reports
# scoring=regex, which the layer repeats in its own label. Neither case is
# silent, which is the point: a ranking that is not a ranking must not look
# like one.
#
# Run from the WSL box that holds the cache:
#     bash tools/ops/stage-slimrank-data.sh
#     bash tools/ops/stage-slimrank-data.sh --send     # also scp and unpack
set -euo pipefail

CACHE="${SLIMRANK_CACHE:-$HOME/.cache/slimrank}"
SRC="${SLIMRANK_SRC:-$HOME/ml/slimrank}"
OUT="${OUT:-/tmp/slimrank-data.tgz}"
HOST="${BAJA_HOST:-ubuntu@52.87.30.101}"
KEY="${BAJA_KEY:-$HOME/.ssh/baja.pem}"
REMOTE="${SLIMRANK_HOME:-/opt/baja-apps/data/slimrank}"
PARENT="$(dirname "$REMOTE")"
BASE="$(basename "$OUT")"

say() { printf '  %s\n' "$*"; }

[ -d "$CACHE" ] || { echo "no cache at $CACHE (run slimrank train first)" >&2; exit 1; }
[ -f "$CACHE/elm_classes.tsv" ] || { echo "no elm_classes.tsv in $CACHE" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/slimrank"

cp "$CACHE/elm_classes.tsv" "$STAGE/slimrank/"
say "elm_classes.tsv    $(wc -l < "$CACHE/elm_classes.tsv") lines"
if [ -f "$CACHE/elm_instances.tsv" ]; then
  cp "$CACHE/elm_instances.tsv" "$STAGE/slimrank/"
  say "elm_instances.tsv  $(wc -l < "$CACHE/elm_instances.tsv") lines"
  # class_counts.json is what the model's class-prior feature reads. Built here
  # from the instances rather than shipped, so it cannot drift from them.
  python3 - "$CACHE/elm_instances.tsv" "$STAGE/slimrank/class_counts.json" <<'PY'
import csv, json, sys
counts = {}
with open(sys.argv[1], newline="") as fh:
    rows = [r for r in fh if not r.startswith("#")]
    rd = csv.DictReader(rows, delimiter="\t")
    for r in rd:
        k = r.get("ELMIdentifier")
        if k:
            counts[k] = counts.get(k, 0) + 1
json.dump(counts, open(sys.argv[2], "w"))
print("  class_counts.json  %d classes" % len(counts))
PY
fi

if [ -f "$SRC/model.joblib" ]; then
  cp "$SRC/model.joblib" "$STAGE/slimrank/"
  say "model.joblib       $(du -h "$SRC/model.joblib" | cut -f1)"
else
  say "model.joblib       MISSING: the host will order motifs by pattern rarity"
  say "                   alone, and every layer will say so in its label."
fi

if [ -d "$CACHE/cons" ]; then
  n=$(find "$CACHE/cons" -name '*.npy' -size +1c | wc -l)
  if [ "$n" -gt 0 ]; then
    mkdir -p "$STAGE/slimrank/cons"
    find "$CACHE/cons" -name '*.npy' -size +1c -exec cp {} "$STAGE/slimrank/cons/" \;
    say "cons/              $n proteins with conservation"
  fi
fi

tar czf "$OUT" -C "$STAGE" slimrank
say ""
say "wrote $OUT  ($(du -h "$OUT" | cut -f1))"
say "sha256 $(sha256sum "$OUT" | cut -d' ' -f1)"

if [ "${1:-}" = "--send" ]; then
  say ""
  say "sending to $HOST:$REMOTE"
  scp -i "$KEY" "$OUT" "$HOST:/tmp/$BASE"
  ssh -i "$KEY" "$HOST" "sudo mkdir -p '$PARENT' && \
    sudo tar xzf '/tmp/$BASE' -C '$PARENT' && \
    ls -la '$REMOTE' && rm -f '/tmp/$BASE'"
  say "staged. The scan reads it per request, so there is nothing to restart."
else
  say ""
  say "to send it:"
  say "  scp -i $KEY $OUT $HOST:/tmp/"
  say "  ssh -i $KEY $HOST \"sudo mkdir -p '$PARENT' && sudo tar xzf '/tmp/$BASE' -C '$PARENT' && ls -la '$REMOTE'\""
  say ""
  say "or re-run with --send to do both."
fi
