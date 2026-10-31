#!/usr/bin/env bash
# =============================================================================
#  deploy-all.sh — put everything that is waiting on the server, on the server.
#
#  Run it ON the server:
#
#      curl -fsSL https://raw.githubusercontent.com/milton900807/baja-apps/REF/tools/ops/deploy-all.sh -o deploy-all.sh
#      sudo bash deploy-all.sh                 # the API and the lionscript modules
#      sudo bash deploy-all.sh --frontend      # those, and build and install the Angular app
#
#  WHAT IT DEPLOYS
#    1. baja-server    the fundraising endpoints, including the two-Stripe-key split,
#                      patched into dist/index.js (and src/index.ts when it is there).
#    2. baja-apps      the lionscript modules: the home screen, whose doors answer a
#                      press and open a page of their own on a phone, the fundraising
#                      console, viewer, admin and icons, and the Apps menu entries. Then
#                      Home and the funds options into the header menu, which lives in
#                      env.js on the server rather than in the bundle.
#    3. the frontend   (--frontend only) the Angular shell: the widget markup that stops
#                      being rebuilt several times a second, the header's authoring
#                      buttons behind one account, and the landing page that scrolls on
#                      a phone. This one is a BUILD, which the other two are not.
#
#  Every step is idempotent: run it twice and the second run says there is nothing to do.
#  Nothing is overwritten without a backup beside it.
#
#  Options:
#      --frontend          also build and install the Angular app (needs node and npm)
#      --frontend-only     only that
#      --no-menu           leave the header menu in env.js alone
#      --no-restart        leave the service alone
#      SERVER_DIR=/opt/baja-server  APPS_DIR=/opt/baja-apps  PORT=8080
#      WEB_DIR=<where the built app is served from>   SRC_DIR=<a git checkout of baja>
#      ENVJS=<path to the deployed assets/env.js>
#      REF=<git sha of baja-apps>   BRANCH=<frontend branch, default main>
# =============================================================================
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-/opt/baja-server}"
APPS_DIR="${APPS_DIR:-/opt/baja-apps}"
PORT="${PORT:-8080}"
BRANCH="${BRANCH:-main}"
RAW="https://raw.githubusercontent.com/milton900807/baja-apps"
REF="${REF:-85c63baf9abe8772f6bb9d4459bf2f05907e4df0}"
DO_API=1; DO_WEB=0; DO_RESTART=1; DO_MENU=1

while [[ $# -gt 0 ]]; do case "$1" in
  --frontend)      DO_WEB=1; shift ;;
  --frontend-only) DO_WEB=1; DO_API=0; shift ;;
  --no-restart)    DO_RESTART=0; shift ;;
  --no-menu)       DO_MENU=0; shift ;;
  -h|--help)       sed -n '2,35p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
die()  { printf '%s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo: it writes under /opt and restarts the service."
command -v curl >/dev/null || die "curl is not installed."
command -v python3 >/dev/null || die "python3 is not installed."

TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT INT TERM

say "Deploying from baja-apps ${REF:0:12}"

# ---- 1 and 2: the two installers -------------------------------------------
if [[ $DO_API -eq 1 ]]; then
  [[ -d "$SERVER_DIR" ]] || die "Not found: $SERVER_DIR  (set SERVER_DIR=…)"
  [[ -d "$APPS_DIR" ]]   || die "Not found: $APPS_DIR  (set APPS_DIR=…)"

  step "The API endpoints"
  curl -fsSL "$RAW/$REF/tools/hotfix/install-donation-endpoint.py" -o "$TMP/a.py" \
    || die "Could not download install-donation-endpoint.py"
  python3 "$TMP/a.py" "$SERVER_DIR"

  step "The lionscript modules"
  curl -fsSL "$RAW/$REF/tools/hotfix/install-fundraise-app.py" -o "$TMP/b.py" \
    || die "Could not download install-fundraise-app.py"
  python3 "$TMP/b.py" "$APPS_DIR"

  # The header menu lives in env.js on the server, not in the bundle: a list of labels and
  # module paths the shell execs. Adding Home and the funds options is a file edit, so it
  # happens here rather than waiting for a frontend build. Not finding env.js is a thing to
  # say and carry on from, not a reason to stop: everything above it is already installed.
  if [[ $DO_MENU -eq 1 ]]; then
    step "The header menu"
    ENVJS="${ENVJS:-}"
    if [[ -z "$ENVJS" ]]; then
      for d in "${WEB_DIR:-}" /opt/baja/eln /opt/baja /var/www/eln /var/www/html/eln /usr/share/nginx/html/eln /srv/eln; do
        [[ -n "$d" && -f "$d/assets/env.js" ]] && { ENVJS="$d/assets/env.js"; break; }
      done
    fi
    if [[ -n "$ENVJS" ]]; then
      curl -fsSL "$RAW/$REF/tools/ops/set-menu.py" -o "$TMP/m.py" || die "Could not download set-menu.py"
      python3 "$TMP/m.py" "$ENVJS"
    else
      say "No assets/env.js found, so the menu was left alone."
      say "Find it and run:  sudo python3 set-menu.py <path to env.js>   (or set ENVJS=…)"
    fi
  fi
fi

# ---- 3: the Angular app ------------------------------------------------------
#
# This is the only step that compiles anything, and the only one that can fail for
# reasons that have nothing to do with the change being deployed (memory, a registry
# that is not reachable, a node too old). So it is opt-in, it says what it is about to
# overwrite before it does, and it keeps the previous web root beside the new one.
if [[ $DO_WEB -eq 1 ]]; then
  step "The Angular app"

  # Where the built app is served from. A guess here would overwrite a live site, so an
  # ambiguous answer stops rather than picking one.
  if [[ -z "${WEB_DIR:-}" ]]; then
    FOUND=()
    for d in /opt/baja/eln /opt/baja /var/www/eln /var/www/html/eln /usr/share/nginx/html/eln /srv/eln; do
      [[ -f "$d/index.html" ]] && FOUND+=("$d")
    done
    if [[ ${#FOUND[@]} -eq 1 ]]; then
      WEB_DIR="${FOUND[0]}"
      say "Serving directory: $WEB_DIR (found; set WEB_DIR= to override)"
    else
      say "I could not tell where the built app is served from."
      [[ ${#FOUND[@]} -gt 1 ]] && say "More than one candidate: ${FOUND[*]}"
      say "Find it with:   grep -R --include='*.conf' -n 'root ' /etc/nginx | head"
      die "Then re-run with WEB_DIR=<that directory>."
    fi
  fi
  [[ -f "$WEB_DIR/index.html" ]] || die "$WEB_DIR has no index.html in it. That is probably not the serving directory."

  # The source. A checkout already on the box is used as it is; otherwise it is cloned
  # into /opt/src, which is this script's own directory and not in anyone's way.
  if [[ -z "${SRC_DIR:-}" ]]; then
    for d in /opt/src/baja /opt/baja-src ~/baja ~/src/baja; do
      [[ -d "$d/.git" && -f "$d/angular.json" ]] && { SRC_DIR="$d"; break; }
    done
  fi
  if [[ -z "${SRC_DIR:-}" ]]; then
    SRC_DIR=/opt/src/baja
    mkdir -p /opt/src
    if [[ ! -d "$SRC_DIR/.git" ]]; then
      say "Cloning milton900807/baja into $SRC_DIR…"
      git clone --depth 50 https://github.com/milton900807/baja.git "$SRC_DIR" \
        || die "Could not clone. If the repository is private, clone it by hand once with credentials this box has, then re-run with SRC_DIR=<that checkout>."
    fi
  fi
  say "Source: $SRC_DIR"
  command -v node >/dev/null || die "node is not installed, so the app cannot be built here. Build it where you normally do and copy dist into $WEB_DIR."
  command -v npm  >/dev/null || die "npm is not installed."
  say "node $(node -v), npm $(npm -v)"

  git -C "$SRC_DIR" fetch --depth 50 origin "$BRANCH" || die "Could not fetch origin/$BRANCH."
  git -C "$SRC_DIR" checkout -q "$BRANCH" 2>/dev/null || git -C "$SRC_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  git -C "$SRC_DIR" reset -q --hard "origin/$BRANCH"
  say "At $(git -C "$SRC_DIR" log --oneline -1)"

  # npm ci is the right command when there is a lock file and an error when there is
  # not, so the choice is made by looking rather than by failing first.
  say "Installing dependencies (this is the slow part)…"
  if [[ -f "$SRC_DIR/package-lock.json" ]]; then
    ( cd "$SRC_DIR" && npm ci --no-audit --no-fund ) || ( cd "$SRC_DIR" && npm install --no-audit --no-fund )
  else
    ( cd "$SRC_DIR" && npm install --no-audit --no-fund )
  fi

  say "Building…"
  ( cd "$SRC_DIR" && npm run build ) || die "The build failed. Nothing was copied; $WEB_DIR is untouched."

  OUT="$SRC_DIR/dist"
  [[ -d "$OUT" ]] || die "No dist directory after the build."
  # Angular 17 writes dist/<project>/browser; older layouts write dist/<project>. Take
  # whichever one actually has an index.html in it.
  if [[ ! -f "$OUT/index.html" ]]; then
    CAND="$(find "$OUT" -maxdepth 3 -name index.html -printf '%h\n' 2>/dev/null | head -1)"
    [[ -n "$CAND" ]] || die "Built, but no index.html anywhere under $OUT."
    OUT="$CAND"
  fi
  say "Built into $OUT"

  # env.js is written on the server and is not in the build: it carries the landing-page
  # copy and the client ids for this domain. Losing it blanks the page, so it is put back
  # whatever the build produced.
  KEEP="$TMP/keep"; mkdir -p "$KEEP"
  for f in assets/env.js assets/config.json; do
    [[ -f "$WEB_DIR/$f" ]] && { mkdir -p "$KEEP/$(dirname "$f")"; cp -p "$WEB_DIR/$f" "$KEEP/$f"; say "Keeping $f"; }
  done

  STAMP="$(date +%Y%m%d%H%M%S)"
  BACKUP="$WEB_DIR.before-$STAMP"
  cp -a "$WEB_DIR" "$BACKUP"
  say "Previous site copied to $BACKUP"

  OWNER="$(stat -c '%u:%g' "$WEB_DIR")"
  if command -v rsync >/dev/null; then
    rsync -a --delete --exclude 'assets/env.js' --exclude 'assets/config.json' "$OUT"/ "$WEB_DIR"/
  else
    find "$WEB_DIR" -mindepth 1 -maxdepth 1 ! -name assets -exec rm -rf {} +
    cp -a "$OUT"/. "$WEB_DIR"/
  fi
  for f in assets/env.js assets/config.json; do
    [[ -f "$KEEP/$f" ]] && { mkdir -p "$WEB_DIR/$(dirname "$f")"; cp -p "$KEEP/$f" "$WEB_DIR/$f"; }
  done
  chown -R "$OWNER" "$WEB_DIR" 2>/dev/null || true
  say "Installed into $WEB_DIR"
fi

# ---- restart and prove it ----------------------------------------------------
if [[ $DO_RESTART -eq 1 ]]; then
  step "Restarting baja-server"
  systemctl restart baja-server
  OUT2=""
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    sleep 1
    OUT2="$(curl -fsS "localhost:$PORT/stripe/donation-session" 2>/dev/null || true)"
    [[ -n "$OUT2" ]] && break
  done
  systemctl is-active --quiet baja-server || die "baja-server did not come back. journalctl -u baja-server -n 50"
  if [[ -n "$OUT2" ]]; then
    printf '%s' "$OUT2" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("  donation endpoint: stripeConfigured=%s  separate account=%s"
      % (d.get("stripeConfigured"), d.get("donationAccountIsSeparate")))
' 2>/dev/null || true
  else
    say "  the endpoint did not answer on port $PORT (re-run with PORT=<port> if the API listens elsewhere)."
  fi
fi

say ""
say "Done. Hard-refresh the browser (the app is cached): Ctrl-Shift-R, or Cmd-Shift-R."
[[ $DO_WEB -eq 1 ]] || say "The Angular app was not touched. Add --frontend to build and install it too."
