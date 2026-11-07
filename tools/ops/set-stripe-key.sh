#!/usr/bin/env bash
# =============================================================================
#  set-stripe-key.sh — paste a Stripe secret key in, and it goes on the server.
#
#  Run it ON the server:
#
#      curl -fsSL https://raw.githubusercontent.com/milton900807/baja-apps/REF/tools/ops/set-stripe-key.sh -o set-stripe-key.sh
#      sudo bash set-stripe-key.sh --software      # the software subscription key
#      sudo bash set-stripe-key.sh --donations     # the gene.clinic donations key
#
#  TWO ACCOUNTS, TWO KEYS. The software subscription and the fundraising donations
#  are different money in different Stripe accounts, and a price, a customer and a
#  payment each belong to ONE account. Pointing both at one key is what produced
#  "No such price": the subscription price exists under the other account.
#
#      --software    STRIPE_SECRET_KEY            subscriptions, /stripe/price-info,
#                                                 /stripe/portal, subscription-status
#      --donations   STRIPE_DONATION_SECRET_KEY   /stripe/donation-session and the rest
#                                                 of the fundraising endpoints
#
#  With neither flag it asks which one you are setting. If the donation key is not
#  set, donations fall back to STRIPE_SECRET_KEY, which is how the server behaved
#  before the split.
#
#  THE KEY IS TREATED AS A SECRET THROUGHOUT:
#    * typed at a prompt with the echo off, read from the terminal rather than stdin,
#      and never passed as an argument, so it cannot be read out of `ps`, a shell
#      history file or this script's own log;
#    * checked against Stripe through a curl config file only root can read, because
#      -u would put it in the process list;
#    * .env is rewritten through a temporary file, chmod 600 before anything goes into
#      it, then moved into place, so the key is never in a world-readable file;
#    * nothing but the last four characters is ever printed.
#
#  Re-runnable. Other options:
#      --key-file PATH   read the key from a file instead of asking (for automation)
#      --show            print which keys are set (last four characters only) and stop
#      --no-restart      write the key but leave the service alone
#      SERVER_DIR=/opt/baja-server  PORT=8080
# =============================================================================
set -euo pipefail

SERVER_DIR="${SERVER_DIR:-/opt/baja-server}"
PORT="${PORT:-8080}"
WHICH=""; KEY_FILE=""; DO_RESTART=1; SHOW_ONLY=0

while [[ $# -gt 0 ]]; do case "$1" in
  --software|--subscription) WHICH=software; shift ;;
  --donations|--donation)    WHICH=donations; shift ;;
  --key-file)   KEY_FILE="${2:-}"; shift 2 ;;
  --no-restart) DO_RESTART=0; shift ;;
  --show)       SHOW_ONLY=1; shift ;;
  -h|--help)    sed -n '2,39p' "$0"; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }

ENV_FILE="$SERVER_DIR/.env"

# Read one variable out of .env and show only its last four characters: enough to tell
# two keys apart and to see that a write landed, and no use to anyone who should not
# have it.
peek() {
  [[ -f "$ENV_FILE" ]] || { printf 'not set (no .env)'; return; }
  local v
  v="$(sed -n "s/^[[:space:]]*\(export[[:space:]]\+\)\?$1=//p" "$ENV_FILE" | tail -n 1 | tr -d ' \t\r\n"'"'")"
  if [[ -z "$v" ]]; then printf 'not set'
  else printf '%s…%s (%d characters)' "${v:0:8}" "${v: -4}" "${#v}"
  fi
}

if [[ $SHOW_ONLY -eq 1 ]]; then
  say "In $ENV_FILE:"
  say "  STRIPE_SECRET_KEY           (software subscription) : $(peek STRIPE_SECRET_KEY)"
  say "  STRIPE_DONATION_SECRET_KEY  (gene.clinic donations) : $(peek STRIPE_DONATION_SECRET_KEY)"
  exit 0
fi

[[ $EUID -eq 0 ]] || die "Run this with sudo: it writes $ENV_FILE and restarts the service."
[[ -d "$SERVER_DIR" ]] || die "Not found: $SERVER_DIR  (set SERVER_DIR=…)"
command -v curl >/dev/null || die "curl is not installed."
command -v python3 >/dev/null || die "python3 is not installed."

if [[ -z "$WHICH" ]]; then
  [[ -r /dev/tty ]] || die "Say which key this is: --software or --donations."
  say "Which key is this?"
  say "  1) the software subscription   (STRIPE_SECRET_KEY)"
  say "  2) the gene.clinic donations   (STRIPE_DONATION_SECRET_KEY)"
  printf 'Enter 1 or 2: ' > /dev/tty
  IFS= read -r ANS < /dev/tty || true
  case "${ANS:-}" in
    1) WHICH=software ;;
    2) WHICH=donations ;;
    *) die "Neither 1 nor 2. Nothing was changed." ;;
  esac
fi

if [[ "$WHICH" == software ]]; then
  VAR=STRIPE_SECRET_KEY;          WHAT="the software subscription"
else
  VAR=STRIPE_DONATION_SECRET_KEY; WHAT="gene.clinic donations"
fi

# Anything temporary here holds a secret, so it lives in one directory that only root
# can enter and is removed however this script ends, including on an error or a Ctrl-C.
TMP="$(mktemp -d)"; chmod 700 "$TMP"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

if [[ -n "$KEY_FILE" ]]; then
  [[ -r "$KEY_FILE" ]] || die "Cannot read $KEY_FILE"
  KEY="$(tr -d ' \t\r\n' < "$KEY_FILE")"
else
  # From the terminal rather than stdin, so a piped-in script cannot answer this, and
  # with the echo off so the key never appears on screen.
  [[ -r /dev/tty ]] || die "No terminal to ask on. Use --key-file instead."
  printf 'Paste the Stripe secret key for %s (it will not be shown): ' "$WHAT" > /dev/tty
  IFS= read -rs KEY < /dev/tty || true
  printf '\n' > /dev/tty
  KEY="$(printf '%s' "$KEY" | tr -d ' \t\r\n')"
fi
[[ -n "$KEY" ]] || die "No key given. Nothing was changed."

case "$KEY" in
  sk_live_*|rk_live_*) MODE=live ;;
  sk_test_*|rk_test_*) MODE=test ;;
  pk_*)     die "That is a PUBLISHABLE key (pk_…). The server needs the secret key (sk_…). Nothing was changed." ;;
  whsec_*)  die "That is a webhook signing secret, not the API key. Nothing was changed." ;;
  sk_org_*) die "Organization keys (sk_org_…) are not supported by this SDK version. Use an account key (sk_…). Nothing was changed." ;;
  *)        die "That does not look like a Stripe secret key (expected sk_… or rk_…). Nothing was changed." ;;
esac
[[ ${#KEY} -ge 20 ]] || die "That key looks truncated. Nothing was changed."
LAST4="${KEY: -4}"

# The two keys must not be the same key. That is the mistake this whole split exists to
# undo, so it is refused rather than warned about.
OTHER_VAR=STRIPE_DONATION_SECRET_KEY
[[ "$VAR" == STRIPE_DONATION_SECRET_KEY ]] && OTHER_VAR=STRIPE_SECRET_KEY
if [[ -f "$ENV_FILE" ]]; then
  OTHER="$(sed -n "s/^[[:space:]]*\(export[[:space:]]\+\)\?$OTHER_VAR=//p" "$ENV_FILE" | tail -n 1 | tr -d ' \t\r\n"'"'")"
  if [[ -n "$OTHER" && "$OTHER" == "$KEY" ]]; then
    die "That is the same key as $OTHER_VAR. The subscription and the donations are different Stripe accounts; one key cannot serve both. Nothing was changed."
  fi
fi

# Ask Stripe whether the key works, before writing it anywhere. -u would put the key in
# the process list, so it goes in a config file only root can read.
CFG="$TMP/curlrc"; : > "$CFG"; chmod 600 "$CFG"
printf 'user = "%s:"\n' "$KEY" > "$CFG"
# 2>/dev/null: a blocked or offline network makes curl noisy, and the status code below
# already says everything this needs to say about it.
HTTP="$(curl -sS -o "$TMP/balance.json" -w '%{http_code}' -K "$CFG" https://api.stripe.com/v1/balance 2>/dev/null)" || HTTP=""
[[ -n "$HTTP" ]] || HTTP=000
rm -f "$CFG"
case "$HTTP" in
  200) LIVEMODE="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('livemode'))" "$TMP/balance.json" 2>/dev/null || echo '?')"
       say "Stripe accepted the key ending $LAST4 (livemode=$LIVEMODE)." ;;
  401) die "Stripe rejected that key (401). Nothing was changed." ;;
  000) say "Could not reach Stripe to check the key (no network from this box?). Writing it anyway." ;;
  *)   say "Stripe answered $HTTP when checking the key. Writing it anyway." ;;
esac
[[ "$MODE" != live ]] || say "This is a LIVE key: it moves real money."

# Replace the one variable in place, keep every other line, and never widen the
# permissions of the file. The old .env is kept, with the same 600, because it has every
# other secret in it too.
OWNER="$(stat -c '%u:%g' "$SERVER_DIR")"
NEW="$TMP/env.new"; : > "$NEW"; chmod 600 "$NEW"
STAMP="$VAR-$(date +%Y%m%d%H%M%S)"
if [[ -f "$ENV_FILE" ]]; then
  cp -p "$ENV_FILE" "$ENV_FILE.before-$STAMP"
  chmod 600 "$ENV_FILE.before-$STAMP"
  KEY="$KEY" VAR="$VAR" python3 - "$ENV_FILE" "$NEW" <<'PY'
import os, sys
src, dst = sys.argv[1], sys.argv[2]
key = os.environ['KEY']                      # via the environment, not the command line
var = os.environ['VAR']
lines = open(src, encoding='utf-8', errors='replace').read().split('\n')
out, done = [], False
for ln in lines:
    bare = ln.strip()
    if bare.startswith(var + '=') or bare.startswith('export ' + var + '='):
        if not done:
            out.append(var + '=' + key); done = True
        continue                              # drop any later duplicates
    out.append(ln)
if not done:
    while out and out[-1].strip() == '': out.pop()
    out.append(var + '=' + key)
open(dst, 'w', encoding='utf-8').write('\n'.join(out).rstrip('\n') + '\n')
PY
else
  printf '%s=%s\n' "$VAR" "$KEY" > "$NEW"
fi
unset KEY
chmod 600 "$NEW"; chown "$OWNER" "$NEW" 2>/dev/null || true
mv -f "$NEW" "$ENV_FILE"
say "Wrote $VAR (…$LAST4) to $ENV_FILE  (the previous file is $ENV_FILE.before-$STAMP)"

if [[ $DO_RESTART -eq 0 ]]; then
  say "Not restarting, as asked. The key takes effect at the next restart of baja-server."
  exit 0
fi

say "Restarting baja-server…"
systemctl restart baja-server
OUT=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 1
  OUT="$(curl -fsS "localhost:$PORT/stripe/donation-session" 2>/dev/null || true)"
  [[ -n "$OUT" ]] && break
done
systemctl is-active --quiet baja-server || die "baja-server did not come back. journalctl -u baja-server -n 50"

say ""
say "In $ENV_FILE now:"
say "  STRIPE_SECRET_KEY           (software subscription) : $(peek STRIPE_SECRET_KEY)"
say "  STRIPE_DONATION_SECRET_KEY  (gene.clinic donations) : $(peek STRIPE_DONATION_SECRET_KEY)"
if [[ -n "$OUT" ]]; then
  printf '%s' "$OUT" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("  donation endpoint    : stripeConfigured=%s  separate account=%s"
      % (d.get("stripeConfigured"), d.get("donationAccountIsSeparate")))
' 2>/dev/null || true
else
  say "  the donation endpoint did not answer on port $PORT (re-run with PORT=<port> if the API listens elsewhere)."
fi
