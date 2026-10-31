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
REF="${REF:-7111c21411a07e8a180256a54d1e2d959acf0bac}"
DO_API=1; DO_WEB=0; DO_RESTART=1; DO_MENU=1

while [[ $# -gt 0 ]]; do case "$1" in
  --frontend)      DO_WEB=1; shift ;;
  --frontend-only) DO_WEB=1; DO_API=0; shift ;;
  --no-restart)    DO_RESTART=0; shift ;;
  --no-menu)       DO_MENU=0; shift ;;
  -h|--help)       sed -n '2,35p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

# WHERE THE BUILT APP LIVES. A fixed list of likely paths was not enough -- this box
# serves it from somewhere else -- so the app is found by what it IS: an index.html with
# <app-root> in it, which is the Angular shell and nothing else on a web server. The search
# is bounded to the places a site is served from, skips this script's own backups, and
# refuses to choose when it finds more than one.
find_web_dir() {
  local hits d out=() cand
  # FIRST, ASK NGINX. It is the only thing that actually knows, and on this box the answer
  # was /eln -- a directory straight off the root, which no list of likely places was ever
  # going to contain. Every root it declares that holds an Angular index.html is a
  # candidate.
  if command -v nginx >/dev/null; then
    while IFS= read -r cand; do
      [[ -n "$cand" && -f "$cand/index.html" ]] || continue
      grep -q 'app-root' "$cand/index.html" 2>/dev/null || continue
      case " ${out[*]-} " in *" $cand "*) ;; *) out+=("$cand") ;; esac
    done < <(nginx -T 2>/dev/null | sed -n 's/^[[:space:]]*root[[:space:]]\+\([^;]*\);.*/\1/p' | tr -d '"' | sort -u)
  fi
  # THEN LOOK, for a box with no nginx or a config that names no root: the app is found by
  # what it IS, an index.html with <app-root> in it, which on a web server is the Angular
  # shell and nothing else. Backups, node_modules and source trees are skipped.
  if [[ ${#out[@]} -eq 0 ]]; then
    hits="$(grep -rl --include=index.html -m1 'app-root' \
              /eln /opt /var/www /srv /usr/share/nginx /home 2>/dev/null | head -40 || true)"
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      case "$f" in *.before-*|*/node_modules/*|*/src/*) continue ;; esac
      d="$(dirname "$f")"
      case " ${out[*]-} " in *" $d "*) ;; *) out+=("$d") ;; esac
    done <<< "$hits"
  fi
  [[ ${#out[@]} -eq 1 ]] || return 1
  printf '%s' "${out[0]}"
}

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
      W="${WEB_DIR:-$(find_web_dir || true)}"
      for d in "$W" /eln /opt/baja/eln /opt/baja /var/www/eln /var/www/html/eln /usr/share/nginx/html/eln /srv/eln; do
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
    WEB_DIR="$(find_web_dir)" || true
    if [[ -n "$WEB_DIR" ]]; then
      say "Serving directory: $WEB_DIR (found; set WEB_DIR= to override)"
    else
      say "I could not tell where the built app is served from."
      say "nginx will say. Both of these print it:"
      say "  sudo nginx -T 2>/dev/null | grep -nE 'server_name|root '"
      say "  sudo grep -rl --include=index.html app-root /opt /var/www /srv /usr/share/nginx"
      die "Then re-run with WEB_DIR=<the directory holding index.html>."
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

  # THIS TREE NEEDS --legacy-peer-deps, and saying so is better than discovering it.
  #
  # ngx-monaco-editor-v2 asks for Angular 18 peers while the application is on Angular 17,
  # and the committed lock holds @angular/core at 17.3.8 beside an @angular/animations
  # 17.3.12 that demands core 17.3.12 exactly. Neither is new and neither breaks the build:
  # the tree was installed with peer checking off, which is how it has always been built.
  # So npm ci is tried honestly first, and the flag is the fallback rather than the habit.
  # Aligning the versions properly is a separate job; it is not one to do inside a deploy.
  say "Installing dependencies (this is the slow part)…"
  npm_in() { ( cd "$SRC_DIR" && npm "$@" --no-audit --no-fund ); }
  if [[ -f "$SRC_DIR/package-lock.json" ]]; then
    npm_in ci || {
      say "npm ci would not resolve the peers; retrying with --legacy-peer-deps, which is"
      say "how this tree has always been installed."
      npm_in ci --legacy-peer-deps || npm_in install --legacy-peer-deps
    }
  else
    npm_in install || npm_in install --legacy-peer-deps
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
