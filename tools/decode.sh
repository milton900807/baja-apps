#!/usr/bin/env bash
# usage: ./decode.sh <encrypted_hex>
set -euo pipefail

SECRET_KEY_HEX="A4BA8B43795566F988FF8FCBC3016E70"
IV_STR="powers"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <encrypted_hex>" >&2
  exit 1
fi
CT_HEX="$1"

# ---- IVs ----
MD5_HEX=$(printf '%s' "$IV_STR" | openssl dgst -md5 | awk '{print $2}')
IV_RAW_HEX=$(printf '%s' "$IV_STR" | openssl dgst -md5 -binary | xxd -p -c 256)
IV_ASC16_HEX=$(printf '%s' "${MD5_HEX:0:16}" | xxd -p -c 256)

# ---- Keys ----
# A) raw key bytes (your hex -> 16 bytes), used with AES-128-CBC
KEY_RAW_HEX="$SECRET_KEY_HEX"

# B) ASCII of LOWERCASE hex of the raw key bytes (what Node does with Buffer(...).toString('hex'))
lower_hex=$(printf '%s' "$SECRET_KEY_HEX" | xxd -r -p | xxd -p -c 256 | tr -d '\n')
KEY_LOWER_ASC_HEX=$(printf '%s' "$lower_hex" | xxd -p -c 256)

# C) ASCII of your original (UPPERCASE) hex string
upper_hex=$(printf '%s' "$SECRET_KEY_HEX" | tr '[:lower:]' '[:upper:]')
KEY_UPPER_ASC_HEX=$(printf '%s' "$upper_hex" | xxd -p -c 256)

try_dec () {
  local mode="$1"; local key_hex="$2"; local iv_hex="$3"
  # return stdout if success; non-zero on failure
  if out=$(printf '%s' "$CT_HEX" | xxd -r -p | openssl enc -d -"${mode}" -K "$key_hex" -iv "$iv_hex" 2>/dev/null); then
    printf '%s\n' "$out"
    return 0
  else
    return 1
  fi
}

# 1) AES-128-CBC, raw key, IV(raw)
try_dec "aes-128-cbc" "$KEY_RAW_HEX" "$IV_RAW_HEX" && exit 0
# 2) AES-256-CBC, LOWERCASE-hex ASCII key, IV(raw)  <-- most likely
try_dec "aes-256-cbc" "$KEY_LOWER_ASC_HEX" "$IV_RAW_HEX" && exit 0
# 3) AES-256-CBC, UPPERCASE-hex ASCII key, IV(raw)
try_dec "aes-256-cbc" "$KEY_UPPER_ASC_HEX" "$IV_RAW_HEX" && exit 0
# 4) AES-128-CBC, raw key, IV(ASCII-of-hex first 16 chars)
try_dec "aes-128-cbc" "$KEY_RAW_HEX" "$IV_ASC16_HEX" && exit 0
# 5) AES-256-CBC, LOWERCASE-hex ASCII key, IV(ASCII-of-hex first 16 chars)
try_dec "aes-256-cbc" "$KEY_LOWER_ASC_HEX" "$IV_ASC16_HEX" && exit 0
# 6) AES-256-CBC, UPPERCASE-hex ASCII key, IV(ASCII-of-hex first 16 chars)
try_dec "aes-256-cbc" "$KEY_UPPER_ASC_HEX" "$IV_ASC16_HEX" && exit 0

echo "Decrypt failed with all strategies. Verify ciphertext, key, IV (md5 of 'powers'), and AES-CBC/PKCS#7 were used." >&2
exit 2

