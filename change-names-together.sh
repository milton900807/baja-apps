#!/usr/bin/env bash

# Usage: change-names-together.sh old_prefix new_prefix
# Example:
#   ./change-names-together.sh demo-gapmer "Gapmer News"

old="$1"
new="$2"

if [[ -z "$old" || -z "$new" ]]; then
  echo "Usage: $0 old_prefix new_prefix"
  exit 1
fi

shopt -s nullglob

for f in *; do
  # Match files that START with "old", regardless of extension
  # and also handle the special case "old.bjb.ext"
  if [[ "$f" =~ ^${old}\.bjb\.([^./]+)$ ]]; then
    ext="${BASH_REMATCH[1]}"
    newname="${new}.${ext}"
    echo "Renaming '$f' -> '$newname'"
    mv -- "$f" "$newname"
  elif [[ "$f" =~ ^${old}\.([^./]+)$ ]]; then
    ext="${BASH_REMATCH[1]}"
    newname="${new}.${ext}"
    echo "Renaming '$f' -> '$newname'"
    mv -- "$f" "$newname"
  fi
done
