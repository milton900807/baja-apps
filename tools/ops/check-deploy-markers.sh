#!/usr/bin/env bash
# Every FILE:MARKER pair in deploy-all.sh, checked against this checkout.
#
# install_group refuses to install a file whose marker is absent, and says the file
# "predates the change". That is right when the REF really is old and badly wrong when the
# marker has gone stale -- an edit to the very comment the marker points at. The group then
# installs NOTHING, on every run, and says so in words that blame the ref.
#
# It has happened: a comment rewritten in flexigraph/oligo.js left the compound-sequence-
# label group dead, so two fixes shipped and neither reached the server. The deploy's own
# check cannot tell the two cases apart -- from the server, a missing marker looks the same
# either way -- but from the repo it is obvious, which is what this is for.
#
#   bash tools/ops/check-deploy-markers.sh          # from the repo root
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
SCRIPT="tools/ops/deploy-all.sh"
[[ -f "$SCRIPT" ]] || { echo "no $SCRIPT here"; exit 2; }

bad=0; n=0
while IFS= read -r line; do
  # the entries are the quoted "path:marker" arguments of install_group
  [[ "$line" =~ ^[[:space:]]+\"([^\"]+)\"[[:space:]]*\\?$ ]] || continue
  pair="${BASH_REMATCH[1]}"
  f="${pair%%:*}"; mk="${pair#*:}"
  [[ "$f" == *.js || "$f" == *.py || "$f" == *.sh ]] || continue
  n=$((n+1))
  if [[ ! -f "$f" ]]; then
    echo "MISSING FILE   $f"; bad=$((bad+1)); continue
  fi
  case "$f" in *" "*) echo "MALFORMED      $f"; bad=$((bad+1)); continue ;; esac
  if ! grep -q -F -- "$mk" "$f"; then
    echo "STALE MARKER   $f"
    echo "               looks for: $mk"
    bad=$((bad+1))
  fi
done < "$SCRIPT"

if [[ $bad -gt 0 ]]; then
  echo
  echo "$bad of $n deploy markers do not match this checkout."
  echo "Each one silently disables its WHOLE group: all-or-none means none."
  exit 1
fi
echo "all $n deploy markers match this checkout"
