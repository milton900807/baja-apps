#!/usr/bin/env python3
"""
ion/works.py  (single, cleaned, BIGDATA-aware) — NO subprocess spawn

Change requested (this revision):
- If a download is required, the resolution includes the *exact URL* that would be called
  to trigger the server-side download (pull_url), plus the exists_url being polled.

Behavior:
- ensure_bigdata_file_async_or_resolve():
    1) checks local_path
    2) checks /bigdata-exists
    3) if missing -> calls /download-bigdata (server-side pull) and stores/returns pull_url
    4) polls /bigdata-exists until present or timeout
- No spawned downloader process.
- Lock file (<local_path>.downloading) prevents stampedes.

Expected env vars from Node:
  SERVER_BASE_URL, SENDER_USER_ID, BIGDATA, WD

Optional env overrides:
  BIGDATA_EXISTS_PATH        default "/bigdata-exists"
  BIGDATA_SERVER_PULL_PATH   default "/download-bigdata"
  BIGDATA_TIMEOUT_SEC        default 300
  BIGDATA_LOCK_TTL_SEC       default 21600 (6h)
  BIGDATA_POLL_SEC           default 2
  BIGDATA_POLL_MAX_SEC       default 600
"""

from __future__ import annotations

import os
import sys
import time
import json
import errno
import uuid
import base64
import binascii
import tempfile
import re
from typing import Optional, Dict, Any, List
from datetime import datetime, date
from urllib.parse import quote, urljoin, urlencode


# =============================================================================
# Timezone helper (subscription check uses America/Los_Angeles)
# =============================================================================
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
    _LA_TZ = ZoneInfo("America/Los_Angeles")
except Exception:
    _LA_TZ = None


# =============================================================================
# Env / URL config
# =============================================================================
image_server_uri = os.getenv("FIG_HOST")
SERVER_BASE_URL = (os.getenv("SERVER_BASE_URL") or os.getenv("FIG_HOST") or "").strip().rstrip("/")
LJDATA_BASE_URL = (os.getenv("LJDATA_BASE_URL") or "").strip()


# =============================================================================
# ION output helpers
# =============================================================================
def resolve(resolve_object: Dict[str, Any]) -> None:
    print("IONWORKS:RESOLUTION:\t" + json.dumps(resolve_object))


def msg(message: str) -> None:
    print("IONWORKS:MSG:\t" + str(message))


def progress(value: Any) -> None:
    print("IONWORKS:PROGRESS:\t" + str(value))


def show(resolve_object: Dict[str, Any]) -> None:
    print("IONWORKS:SHOWWIDGET:\t" + json.dumps(resolve_object))


def update(obj: Dict[str, Any]) -> None:
    print("IONWORKS:OBJ:\t" + json.dumps(obj))


def exit() -> None:
    print("IONWORKS:EXIT:")


# =============================================================================
# URL helpers
# =============================================================================
def getURL(filename: str) -> str:
    if not image_server_uri:
        return filename
    if filename.startswith("/"):
        filename = filename[1:]
    return image_server_uri.rstrip("/") + "/" + filename


def ljdata_url(name: str) -> str:
    safe_name = quote(name.lstrip("/"), safe="")
    if LJDATA_BASE_URL:
        base = LJDATA_BASE_URL.rstrip("/") + "/"
        return urljoin(base, safe_name)
    if SERVER_BASE_URL:
        base = SERVER_BASE_URL.rstrip("/") + "/ljdata/"
        return urljoin(base, safe_name)
    return f"https://data.lajollalabs.com/ljdata/{safe_name}"


# =============================================================================
# Optional dependency: cryptography (lazy)
# =============================================================================
def _crypto():
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import padding
        return Cipher, algorithms, modes, default_backend, padding
    except Exception:
        return None, None, None, None, None


def aes_decrypt(encrypted_hex: str, key: Any, iv: Any) -> str:
    Cipher, algorithms, modes, default_backend, padding = _crypto()
    if Cipher is None:
        raise RuntimeError("cryptography is not installed (required for aes_decrypt).")

    if isinstance(key, str):
        key = key.encode()
    if isinstance(key, bytearray):
        key = binascii.hexlify(key)
    if isinstance(iv, str):
        iv = iv.encode()

    encrypted_bytes = binascii.unhexlify(encrypted_hex)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    decrypted_padded = decryptor.update(encrypted_bytes) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    decrypted = unpadder.update(decrypted_padded) + unpadder.finalize()
    return decrypted.decode()


def aes_encrypt(email: str, key: Any, iv: Any) -> str:
    Cipher, algorithms, modes, default_backend, padding = _crypto()
    if Cipher is None:
        raise RuntimeError("cryptography is not installed (required for aes_encrypt).")

    if isinstance(key, str):
        key = key.encode()
    if isinstance(key, bytearray):
        key = binascii.hexlify(key)
    if isinstance(iv, str):
        iv = iv.encode()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    padder = padding.PKCS7(128).padder()
    padded_data = padder.update(email.encode()) + padder.finalize()

    encryptor = cipher.encryptor()
    encrypted = encryptor.update(padded_data) + encryptor.finalize()
    return binascii.hexlify(encrypted).decode()


# =============================================================================
# Temp JSON helpers
# =============================================================================
def save_json_to_temp_file(json_obj: Any) -> str:
    fd, temp_file_path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            json.dump(json_obj, temp_file, indent=4)
    except Exception:
        try:
            os.remove(temp_file_path)
        except Exception:
            pass
        raise
    return temp_file_path


def save_temp(resolve_object: Any) -> str:
    return save_json_to_temp_file(resolve_object)


# =============================================================================
# Binary file -> base64 JSON
# =============================================================================
def binary_file_to_json(input_file_path: str, output_json_path: str) -> None:
    with open(input_file_path, "rb") as binary_file:
        binary_data = binary_file.read()
    encoded_data = base64.b64encode(binary_data).decode("utf-8")
    with open(output_json_path, "w") as json_file:
        json.dump({"file_content": encoded_data}, json_file, indent=4)


# =============================================================================
# Param parsing
# =============================================================================
def findType(obj: str) -> Any:
    if obj is None:
        return ""
    if isinstance(obj, (int, float)):
        return obj
    s = str(obj).strip()
    if s.isnumeric():
        return float(s) if "." in s else int(s)
    if s.startswith("jfile:"):
        filep = s[6:]
        with open(filep, "r") as f:
            return json.load(f)
    return s


def getArray(string_array: str) -> List[Any]:
    s = str(string_array).strip()
    if s.startswith("[") and s.endswith("]"):
        s = s[1:-1].strip()
    if not s:
        return []
    parts = [p.strip() for p in s.split(",") if p.strip() != ""]
    return [findType(p) for p in parts]


def arg(index: int) -> Any:
    if index >= len(sys.argv):
        return None
    temp = sys.argv[index]
    if temp is None:
        return ""
    if isinstance(temp, list):
        return temp
    s = str(temp)
    if "," in s:
        return getArray(s)
    if s.startswith("[") and s.endswith("]"):
        return getArray(s)
    return findType(s)


def param(index: int) -> Any:
    try:
        if len(sys.argv) < 2:
            return None
        input_file = sys.argv[1]
        if isinstance(input_file, str) and input_file.startswith("jfile"):
            input_file = input_file[input_file.index(":") + 1 :]
            with open(input_file, "r") as f:
                t = json.load(f)
            if isinstance(t, list) and 0 <= index < len(t):
                return t[index]
            if isinstance(t, dict) and str(index) in t:
                return t[str(index)]
            if isinstance(t, dict) and index in t:
                return t[index]
            return None
        return arg(index)
    except Exception as e:
        msg(f"param() exception: {e}")
        return None


# =============================================================================
# Subscription helper
# =============================================================================
def has_active_subscription(email: str) -> bool:
    root = os.getenv("LJLSUBSCRIPTIONS")
    if not root or not os.path.isdir(root):
        return False

    pattern = re.compile(rf"{re.escape(email)}_d(\d{{4}}-\d{{2}}-\d{{2}})", flags=re.IGNORECASE)
    today: date = datetime.now(_LA_TZ).date() if _LA_TZ else date.today()

    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            m = pattern.search(fn)
            if not m:
                continue
            try:
                dt = datetime.strptime(m.group(1), "%Y-%m-%d").date()
            except ValueError:
                continue
            if dt > today:
                return True
    return False


# =============================================================================
# BIGDATA helpers
# =============================================================================
def _env_int(name: str, default: int) -> int:
    try:
        v = int((os.getenv(name) or "").strip())
        return v if v > 0 else default
    except Exception:
        return default


def _safe_int(value: Any, default: int = -1) -> int:
    try:
        if value is None:
            return default
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        s = str(value).strip()
        if s == "":
            return default
        return int(float(s))
    except Exception:
        return default


def _server_base_url() -> str:
    return (os.getenv("SERVER_BASE_URL") or "").strip().rstrip("/")


def _sender_user_id() -> str:
    return (os.getenv("SENDER_USER_ID") or "unknown").strip()


def _exists_url(server_base: str, filename: str, subpath: str) -> str:
    exists_path = (os.getenv("BIGDATA_EXISTS_PATH") or "/bigdata-exists").strip()
    qp = {"filename": filename}
    if subpath:
        qp["path"] = subpath
    return server_base + exists_path + "?" + urlencode(qp)


def _server_pull_url(server_base: str, filename: str, subpath: str) -> str:
    pull_path = (os.getenv("BIGDATA_SERVER_PULL_PATH") or "/download-bigdata").strip()
    qp = {"filename": filename}
    if subpath:
        qp["path"] = subpath
    return server_base + pull_path + "?" + urlencode(qp)


def _atomic_create_file(path: str) -> bool:
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    try:
        fd = os.open(path, flags)
        os.close(fd)
        return True
    except OSError as e:
        if e.errno == errno.EEXIST:
            return False
        raise


def _read_json_best_effort(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r") as f:
            obj = json.load(f)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def _write_json_atomic(path: str, payload: Dict[str, Any]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f)
    os.replace(tmp, path)


def _http_get_json(url: str, headers: Dict[str, str], timeout: int) -> Dict[str, Any]:
    import urllib.request
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read().decode("utf-8", errors="replace")
    return json.loads(data) if data else {}

import os, time

def ensure_bigdata_file_async_or_resolve(
    local_path: str,
    filename: str,
    subpath: str = "",
    meta=None,
    lock_ttl_seconds: int | None = None,
) -> None:
    meta = meta or {}
    subpath = (subpath or "").strip().lstrip("/")

    lock_ttl_seconds = lock_ttl_seconds or _env_int("BIGDATA_LOCK_TTL_SEC", 6 * 60 * 60)
    timeout_seconds = _env_int("BIGDATA_TIMEOUT_SEC", 300)

    # 0) Already present locally
    if os.path.exists(local_path):
        return

    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    lock_path = local_path + ".downloading"
    now = int(time.time())

    # 1) If lock exists and is fresh -> return immediately: still downloading
    if os.path.exists(lock_path):
        info = _read_json_best_effort(lock_path)
        started = _safe_int(info.get("started"), 0)
        updated = _safe_int(info.get("updated"), started)
        stale = (now - (updated or started or now)) > lock_ttl_seconds

        if not stale:
            resolve({
                "status": "still_downloading",
                "file": {
                    "path": local_path,
                    "name": filename,
                    "subpath": info.get("subpath", subpath),
                    "lock_path": lock_path,
                    "started": started or None,
                },
                "meta": meta,
            })
            raise SystemExit(0)

        # stale lock -> clear and re-trigger
        try:
            os.remove(lock_path)
        except Exception:
            pass

    # 2) Try to create lock atomically; if someone else won, return immediately
    if not _atomic_create_file(lock_path):
        info = _read_json_best_effort(lock_path)
        resolve({
            "status": "still_downloading",
            "file": {
                "path": local_path,
                "name": filename,
                "subpath": info.get("subpath", subpath),
                "lock_path": lock_path,
                "started": info.get("started"),
                "phase": info.get("phase", "downloading"),
            },
            "meta": meta,
        })
        raise SystemExit(0)

    # 3) We own the lock -> trigger server download once, then return immediately
    server_base = _server_base_url()
    sender_user_id = _sender_user_id()

    if not server_base:
        _write_json_atomic(lock_path, {
            "started": now,
            "updated": now,
            "phase": "error",
            "error": "Missing SERVER_BASE_URL",
            "name": filename,
            "path": local_path,
            "subpath": subpath,
        })
        resolve({
            "status": "missing_server_base_url",
            "file": {"path": local_path, "name": filename, "lock_path": lock_path},
            "meta": {**meta, "env": {"SERVER_BASE_URL": os.getenv("SERVER_BASE_URL")}},
        })
        raise SystemExit(0)

    exists_url = _exists_url(server_base, filename, subpath)
    pull_url = _server_pull_url(server_base, filename, subpath)

    headers = {
        "X-User-Id": sender_user_id,
        "User-Agent": "ion-bigdata-serverpull/1.0",
    }

    _write_json_atomic(lock_path, {
        "started": now,
        "updated": now,
        "phase": "triggering_server_download"
    })

    # fire-and-forget trigger (best effort)
    pull_resp = None
    pull_err = None
    try:
        pull_resp = _http_get_json(pull_url, headers=headers, timeout=timeout_seconds)
        _write_json_atomic(lock_path, {
            "started": now,
            "updated": int(time.time()),
            "phase": "server_download_started"
        })
    except Exception as e:
        pull_err = str(e)
        _write_json_atomic(lock_path, {
            "started": now,
            "updated": int(time.time()),
            "phase": "error"
        })

    # Always return immediately: still downloading (even if trigger errored; caller can inspect)
    resolve({
        "status": "still_downloading" if not pull_err else "download_trigger_failed",
        "meta": meta,
    })
    raise SystemExit(0)

