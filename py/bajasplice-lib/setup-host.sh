#!/usr/bin/env bash
#
# Set up SSAM on a fresh host and prove it works.
#
# Self-contained: copy this one file over (or curl it, see below) and run it.
# It clones the repo itself, so nothing needs to be in place beforehand.
#
#   ./setup-host.sh
#   BRANCH=main DEST=~/code/baja-apps ./setup-host.sh
#   DEPTH=1 ./setup-host.sh          # shallow, fastest, no usable history
#
# Needs: git, python3 >= 3.10, and network access (Ensembl REST is where the
# reference sequence comes from -- there is no genome FASTA to install).
#
# Safe to re-run. An existing clone is fetched and reset to the branch tip
# rather than re-cloned, and an existing venv is reused.
#
# To get this file onto the new host without copying by hand, once it is
# committed and pushed:
#   curl -fsSLO https://raw.githubusercontent.com/milton900807/baja-apps/feat/ssam-acceptor-model/py/bajasplice-lib/setup-host.sh
#   bash setup-host.sh
#
set -euo pipefail

REPO="${REPO:-https://github.com/milton900807/baja-apps.git}"
BRANCH="${BRANCH:-feat/ssam-acceptor-model}"
DEST="${DEST:-$HOME/baja-apps}"
DEPTH="${DEPTH:-}"
LIB_SUBDIR="py/bajasplice-lib"

# The number the reference run must reproduce. Compared to 4 decimal places,
# because a different torch build can move the last digits without anything
# being wrong -- and a mismatch is reported rather than fatal for the same
# reason. A WRONG value (a different site winning, say) is the real failure,
# and that shows up as a rank change, which IS fatal below.
EXPECT_P="0.9998"
EXPECT_GENE="MAPK8IP3"
EXPECT_EXON="16"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[33m    warning: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m\nfailed: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- prereqs
say "Checking prerequisites"

command -v git >/dev/null || die "git not found. Install it and re-run."
info "git $(git --version | awk '{print $3}')"

# Pick the newest python3.x on PATH, not whatever 'python3' happens to be:
# a system python3.9 would install but then fail on modern torch wheels.
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
    command -v "$c" >/dev/null || continue
    v=$("$c" -c 'import sys; print("%d%02d" % sys.version_info[:2])' 2>/dev/null) || continue
    [ "$v" -ge 310 ] 2>/dev/null || continue
    PY="$c"; break
done
[ -n "$PY" ] || die "no python3 >= 3.10 on PATH. Install one (3.12 is what this was built on) and re-run."
info "python $("$PY" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))') ($PY)"

if curl -fsS -m 20 -o /dev/null "https://rest.ensembl.org/info/ping?content-type=application/json" 2>/dev/null; then
    info "Ensembl REST reachable"
else
    warn "cannot reach rest.ensembl.org. Install will work; scoring will not,"
    warn "because reference sequence is fetched from there on demand."
fi

# ------------------------------------------------------------------ clone
if [ -d "$DEST/.git" ]; then
    say "Updating the existing clone at $DEST"
    git -C "$DEST" remote set-url origin "$REPO"
    git -C "$DEST" fetch --quiet origin "$BRANCH"
    # egg-info is excluded because the editable install rewrites PKG-INFO and
    # SOURCES.txt, and those are tracked in this repo. Without the exclusion a
    # successful run dirties the tree and the next run refuses itself.
    # the glob form is needed: ":(exclude)path/*.egg-info" matches the
    # directory name and not the files inside it, so it excludes nothing
    DIRTY_IGNORE=":(exclude,glob)**/*.egg-info/**"
    if ! git -C "$DEST" diff --quiet -- . "$DIRTY_IGNORE" \
       || ! git -C "$DEST" diff --cached --quiet -- . "$DIRTY_IGNORE"; then
        git -C "$DEST" status --short -- . "$DIRTY_IGNORE" | sed 's/^/      /' >&2
        die "$DEST has uncommitted changes (above). Commit, stash or move them,
    then re-run."
    fi
    git -C "$DEST" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
    info "reset to origin/$BRANCH"
else
    say "Cloning $REPO ($BRANCH) into $DEST"
    mkdir -p "$(dirname "$DEST")"
    # shellcheck disable=SC2086
    git clone --quiet --single-branch --branch "$BRANCH" \
        ${DEPTH:+--depth "$DEPTH"} "$REPO" "$DEST" \
        || die "clone failed. Check the branch name and that you can reach GitHub."
fi
info "HEAD $(git -C "$DEST" log --oneline -1)"

LIB="$DEST/$LIB_SUBDIR"
[ -d "$LIB" ] || die "$LIB missing -- is '$BRANCH' the right branch?"

# The checkpoint and the gene index are committed, which is what makes this a
# clone-and-go rather than a data migration. Check, so a future change that
# gitignores either one fails here with a clear message instead of deep inside
# a scoring run.
for f in bajasplice/weights/ss_ctx2000.pt bajasplice/data/genes.slim.sqlite; do
    [ -s "$LIB/$f" ] || die "$f is missing from the clone. It is normally
    committed; if that changed, copy it from a working host into $LIB/$f"
    info "found $f ($(du -h "$LIB/$f" | cut -f1))"
done

# -------------------------------------------------------------------- venv
say "Building the virtualenv"
cd "$LIB"
if [ ! -x .venv/bin/python ]; then
    "$PY" -m venv .venv || die "could not create .venv (is python3-venv installed?)"
    info "created $LIB/.venv"
else
    info "reusing $LIB/.venv"
fi
VENV_PY="$LIB/.venv/bin/python"

"$VENV_PY" -m pip install --quiet --upgrade pip
say "Installing bajasplice and its dependencies (torch is large; this is the slow part)"
"$VENV_PY" -m pip install --quiet -e '.[plots,dev]' \
    || die "pip install failed. Re-run without --quiet to see why:
    $VENV_PY -m pip install -e '.[plots,dev]'"
"$VENV_PY" - <<'PY'
import importlib
for m in ("torch", "numpy", "pandas", "matplotlib"):
    print(f"    {m} {importlib.import_module(m).__version__}")
PY

# ------------------------------------------------------------------ verify
say "Running the test suite"
"$VENV_PY" -m pytest -q || die "tests failed. The install is not usable; do not
    trust any scores from it until this passes."

say "Scoring $EXPECT_GENE exon $EXPECT_EXON as a reference run"
OUT="$("$VENV_PY" -m bajasplice.ssam --gene "$EXPECT_GENE" --exon "$EXPECT_EXON" --top 3)" \
    || die "the reference run failed. If it timed out, check network access to
    rest.ensembl.org -- that is where sequence comes from."
printf '%s\n' "$OUT" | sed -n '1,6p' | sed 's/^/    /'

GOT_P="$(printf '%s\n' "$OUT" | sed -n 's/.*annotated acceptor .* p=\([0-9.]*\).*/\1/p' | head -1)"
[ -n "$GOT_P" ] || die "could not read the acceptor score out of the output above."

# The annotated acceptor must still be the top-ranked candidate. That is the
# assertion that actually matters: a shifted last digit is a build difference,
# a different site winning is a broken install.
if ! printf '%s\n' "$OUT" | grep -q -- '<-- annotated'; then
    die "the annotated acceptor is not in the top rows -- something is wrong
    with this install, not merely imprecise."
fi
RANK="$(printf '%s\n' "$OUT" | awk '/<-- annotated/{print $1; exit}')"
[ "$RANK" = "1" ] || die "the annotated acceptor ranked $RANK, not 1. Expected
    it to win on this locus; treat this install as broken."

case "$GOT_P" in
    ${EXPECT_P}*) info "acceptor p=$GOT_P, rank 1 -- matches the reference" ;;
    *) warn "acceptor p=$GOT_P, expected ~${EXPECT_P}. Rank 1 is still correct,"
       warn "so this is most likely a different torch build rather than a fault." ;;
esac

# ------------------------------------------------------------------- done
say "Ready"
cat <<EOF
    repo    $DEST   ($(git -C "$DEST" rev-parse --abbrev-ref HEAD))
    venv    $LIB/.venv
    run it  cd $LIB && ./.venv/bin/python -m bajasplice.ssam --gene GENE --exon N

    the other three modes:
      ./.venv/bin/python -m bajasplice.ssam --gene $EXPECT_GENE --exon 16 --variant '16:1762843:C>T'
      ./.venv/bin/python -m bajasplice.ssam --gene $EXPECT_GENE --exon 16 --occlude --tile 13 --tile-step 1
      ./.venv/bin/python -m bajasplice.ortho --gene $EXPECT_GENE --exon 16

    'bajasplice ssam ...' also works once $LIB/.venv/bin is on PATH.
    No genome FASTA is needed. If this host has one:
      ./.venv/bin/bajasplice config --genome-fasta /path/to/GRCh38.fa --save
EOF
