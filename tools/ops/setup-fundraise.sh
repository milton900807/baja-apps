#!/usr/bin/env bash
# =============================================================================
#  setup-fundraise.sh — put a Stripe key in place and deploy the fundraising app.
#
#  Run it ON the server:
#
#      curl -fsSL https://raw.githubusercontent.com/milton900807/baja-apps/REF/tools/ops/setup-fundraise.sh -o setup-fundraise.sh
#      sudo bash setup-fundraise.sh
#
#  It asks for the Stripe secret key, checks it against Stripe, writes it to the
#  server's .env, installs both halves of the app, restarts the API and proves the
#  endpoint answers.
#
#  THE KEY IS TREATED AS A SECRET THROUGHOUT, which is most of what this script is:
#    * it is typed at a prompt with the echo off, never passed as an argument, so it
#      cannot be read out of `ps`, a shell history file or this script's own log;
#    * Stripe is asked to confirm it through a curl config file that only root can
#      read, because -u would put it in the process list;
#    * .env is written through a temporary file in the same directory, chmod 600
#      before anything goes into it, then moved into place, so there is no moment
#      where the key sits in a world-readable file;
#    * nothing but the last four characters is ever printed.
#
#  Re-runnable. Options:
#      --key-file PATH   read the key from a file instead of asking (for automation)
#      --no-deploy       write the key only
#      --no-key          deploy only, leave .env alone
#      SERVER_DIR=/opt/baja-server  APPS_DIR=/opt/baja-apps  REF=<git sha>  PORT=8080
# =============================================================================
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-/opt/baja-server}"
APPS_DIR="${APPS_DIR:-/opt/baja-apps}"
PORT="${PORT:-8080}"
RAW="https://raw.githubusercontent.com/milton900807/baja-apps"
REF="${REF:-ed9c863faeda8a701b71d757f952741ee95756ae}"
DO_KEY=1; DO_DEPLOY=1; KEY_FILE=""

while [[ $# -gt 0 ]]; do case "$1" in
  --key-file) KEY_FILE="${2:-}"; shift 2 ;;
  --no-deploy) DO_DEPLOY=0; shift ;;
  --no-key) DO_KEY=0; shift ;;
  -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo: it writes $SERVER_DIR/.env and restarts the service."
[[ -d "$SERVER_DIR" ]] || die "Not found: $SERVER_DIR  (set SERVER_DIR=…)"
[[ -d "$APPS_DIR" ]]   || die "Not found: $APPS_DIR  (set APPS_DIR=…)"
command -v curl >/dev/null || die "curl is not installed."
command -v python3 >/dev/null || die "python3 is not installed."

# Anything temporary here holds a secret, so it lives in one directory that only root
# can enter and is removed however this script ends, including on an error or a Ctrl-C.
TMP="$(mktemp -d)"; chmod 700 "$TMP"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

ENV_FILE="$SERVER_DIR/.env"

if [[ $DO_KEY -eq 1 ]]; then
  if [[ -n "$KEY_FILE" ]]; then
    [[ -r "$KEY_FILE" ]] || die "Cannot read $KEY_FILE"
    KEY="$(tr -d ' \t\r\n' < "$KEY_FILE")"
  else
    # From the terminal rather than stdin, so a piped-in script cannot answer this,
    # and with the echo off so the key never appears on screen.
    [[ -r /dev/tty ]] || die "No terminal to ask on. Use --key-file instead."
    printf 'Stripe secret key (it will not be shown): ' > /dev/tty
    IFS= read -rs KEY < /dev/tty || true
    printf '\n' > /dev/tty
    KEY="$(printf '%s' "$KEY" | tr -d ' \t\r\n')"
  fi
  [[ -n "$KEY" ]] || die "No key given. Nothing was changed."

  case "$KEY" in
    sk_live_*|rk_live_*) MODE=live ;;
    sk_test_*|rk_test_*) MODE=test ;;
    pk_*) die "That is a PUBLISHABLE key (pk_…). The server needs the secret key (sk_…). Nothing was changed." ;;
    whsec_*) die "That is a webhook signing secret, not the API key. Nothing was changed." ;;
    *) die "That does not look like a Stripe secret key (expected sk_… or rk_…). Nothing was changed." ;;
  esac
  [[ ${#KEY} -ge 20 ]] || die "That key looks truncated. Nothing was changed."
  LAST4="${KEY: -4}"

  # Ask Stripe whether the key works, before writing it anywhere. -u would put the key
  # in the process list, so it goes in a config file only root can read.
  CFG="$TMP/curlrc"; : > "$CFG"; chmod 600 "$CFG"
  printf 'user = "%s:"\n' "$KEY" > "$CFG"
  # 2>/dev/null: a blocked or offline network makes curl noisy, and the status code
  # below already says everything this needs to say about it.
  HTTP="$(curl -sS -o "$TMP/balance.json" -w '%{http_code}' -K "$CFG" https://api.stripe.com/v1/balance 2>/dev/null)" || HTTP=""
  [[ -n "$HTTP" ]] || HTTP=000
  rm -f "$CFG"
  case "$HTTP" in
    200) LIVEMODE="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('livemode'))" "$TMP/balance.json" 2>/dev/null || echo '?')"
         say "Stripe accepted the key ending $LAST4 (livemode=$LIVEMODE)." ;;
    401) die "Stripe rejected that key (401). Nothing was changed." ;;
    000) say "Could not reach Stripe to check the key (no network from this box?). Writing it anyway;"
         say "the endpoint check at the end will say whether the server took it." ;;
    *)   say "Stripe answered $HTTP when checking the key. Writing it anyway." ;;
  esac
  [[ "$MODE" != live ]] || say "This is a LIVE key: donations will take real money."

  # Replace STRIPE_SECRET_KEY in place, keep every other line, and never widen the
  # permissions of the file. The old .env is kept, with the same 600, because it has
  # every other secret in it too.
  OWNER="$(stat -c '%u:%g' "$SERVER_DIR")"
  NEW="$TMP/env.new"; : > "$NEW"; chmod 600 "$NEW"
  if [[ -f "$ENV_FILE" ]]; then
    cp -p "$ENV_FILE" "$ENV_FILE.before-fundraise"
    chmod 600 "$ENV_FILE.before-fundraise"
    KEY="$KEY" python3 - "$ENV_FILE" "$NEW" <<'PY'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
key = os.environ['KEY']                      # via the environment, not the command line
lines = open(src, encoding='utf-8', errors='replace').read().split('\n')
out, done = [], False
for ln in lines:
    if ln.strip().startswith('STRIPE_SECRET_KEY=') or ln.strip().startswith('export STRIPE_SECRET_KEY='):
        if not done:
            out.append('STRIPE_SECRET_KEY=' + key); done = True
        continue                              # drop any later duplicates
    out.append(ln)
if not done:
    while out and out[-1].strip() == '': out.pop()
    out.append('STRIPE_SECRET_KEY=' + key)
open(dst, 'w', encoding='utf-8').write('\n'.join(out).rstrip('\n') + '\n')
PY
  else
    printf 'STRIPE_SECRET_KEY=%s\n' "$KEY" > "$NEW"
  fi
  unset KEY
  chmod 600 "$NEW"; chown "$OWNER" "$NEW" 2>/dev/null || true
  mv -f "$NEW" "$ENV_FILE"
  say "Wrote STRIPE_SECRET_KEY (…$LAST4) to $ENV_FILE  (the previous file is $ENV_FILE.before-fundraise)"
fi

if [[ $DO_DEPLOY -eq 1 ]]; then
  say "Fetching the installers (ref ${REF:0:12})…"
  curl -fsSL "$RAW/$REF/tools/hotfix/install-donation-endpoint.py" -o "$TMP/install-donation-endpoint.py" \
    || die "Could not download install-donation-endpoint.py"
  curl -fsSL "$RAW/$REF/tools/hotfix/install-fundraise-app.py" -o "$TMP/install-fundraise-app.py" \
    || die "Could not download install-fundraise-app.py"
  python3 "$TMP/install-donation-endpoint.py" "$SERVER_DIR"
  python3 "$TMP/install-fundraise-app.py" "$APPS_DIR"
fi

say "Restarting baja-server…"
systemctl restart baja-server
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 1
  OUT="$(curl -fsS "localhost:$PORT/stripe/donation-session" 2>/dev/null || true)"
  [[ -n "$OUT" ]] && break
done
systemctl is-active --quiet baja-server || die "baja-server did not come back. journalctl -u baja-server -n 50"

if [[ -z "${OUT:-}" ]]; then
  say "baja-server is running but the endpoint did not answer on port $PORT."
  say "If the API listens elsewhere, re-run with PORT=<port>."
  exit 1
fi
CONFIGURED="$(printf '%s' "$OUT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('stripeConfigured'))" 2>/dev/null || echo '?')"
say ""
say "Done."
say "  endpoint       /stripe/donation-session  answers on port $PORT"
say "  Stripe key     stripeConfigured=$CONFIGURED"
say "  the console    /app/fundraise/console   (Apps > Fundraise Campaign)"
say ""
say "Which payment methods donors see is set on the Stripe account, not here:"
say "Stripe dashboard > Settings > Payment methods."
