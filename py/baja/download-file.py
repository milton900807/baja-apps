#!/usr/bin/env python3
"""
ion_async_fetch.py

Shared helper for Ion Works scripts:
- Ensures a local file exists
- If missing, starts an asynchronous background download
- Prevents duplicate downloads via an atomic lock file
- Returns (via works.resolve) a JSON message: status=file_downloading
"""

import os
import sys
import time
import json
import errno
import subprocess
from typing import Optional, Dict, Any

from ion import works


def ljdata_url(name: str) -> str:
    return f"https://data.lajollalabs.com/ljdata/{name}"


def _atomic_create(path: str) -> bool:
    """Atomically create a file. True if created, False if already exists."""
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    try:
        fd = os.open(path, flags)
        os.close(fd)
        return True
    except OSError as e:
        if e.errno == errno.EEXIST:
            return False
        raise


def _read_json(path: str) -> Dict[str, Any]:
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


def _pid_is_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def ensure_ljdata_file_async_or_resolve(
    *,
    local_path: str,
    remote_name: str,
    meta: Optional[Dict[str, Any]] = None,
    lock_ttl_seconds: int = 6 * 60 * 60,
) -> None:
    """
    Ensure local_path exists.

    If it exists: returns normally.

    If missing:
      - If a lock indicates an active download: works.resolve(status=file_downloading) and exits.
      - Otherwise, creates lock atomically, spawns background downloader, resolves immediately, and exits.

    This function either returns (file exists) or calls works.resolve(...) and terminates the process.
    """
    meta = meta or {}

    if os.path.exists(local_path):
        return

    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    lock_path = local_path + ".downloading"
    url = ljdata_url(remote_name)
    now = int(time.time())

    # If lock exists, decide active vs stale
    if os.path.exists(lock_path):
        info = _read_json(lock_path)
        pid = int(info.get("pid", -1)) if isinstance(info, dict) else -1
        started = int(info.get("started", 0)) if isinstance(info, dict) else 0

        alive = _pid_is_alive(pid)
        stale = (started > 0 and (now - started) > lock_ttl_seconds)

        if alive and not stale:
            works.resolve({
                "status": "file_downloading",
                "file": {
                    "path": local_path,
                    "name": remote_name,
                    "url": url,
                    "lock_path": lock_path,
                    "pid": pid,
                    "started": started,
                    "phase": info.get("phase", "downloading"),
                },
                "meta": meta,
            })
            raise SystemExit(0)

        # stale/dead lock: remove and proceed
        try:
            os.remove(lock_path)
        except Exception:
            pass

    # Create lock atomically
    created = _atomic_create(lock_path)
    if not created:
        info = _read_json(lock_path)
        works.resolve({
            "status": "file_downloading",
            "file": {
                "path": local_path,
                "name": remote_name,
                "url": url,
                "lock_path": lock_path,
                "pid": info.get("pid"),
                "started": info.get("started"),
                "phase": info.get("phase", "downloading"),
            },
            "meta": meta,
        })
        raise SystemExit(0)

    # Write initial lock info
    lock_info: Dict[str, Any] = {
        "pid": None,
        "started": now,
        "updated": now,
        "phase": "starting",
        "url": url,
        "name": remote_name,
        "path": local_path,
    }
    _write_json_atomic(lock_path, lock_info)

    # Background downloader code (child updates lock, downloads to .part, atomic rename, clears lock on success)
    downloader_code = r"""
import os, sys, time, json, shutil, urllib.request
local_path = sys.argv[1]
url = sys.argv[2]
lock_path = local_path + ".downloading"
tmp_path = local_path + ".part"

def read_info():
    try:
        with open(lock_path, "r") as f:
            x = json.load(f)
        return x if isinstance(x, dict) else {}
    except Exception:
        return {}

def write_info(update):
    info = read_info()
    info.update(update)
    try:
        with open(lock_path + ".tmp", "w") as f:
            json.dump(info, f)
        os.replace(lock_path + ".tmp", lock_path)
    except Exception:
        pass

write_info({"pid": os.getpid(), "phase": "downloading", "updated": int(time.time())})

try:
    with urllib.request.urlopen(url, timeout=60) as r, open(tmp_path, "wb") as out:
        shutil.copyfileobj(r, out)
    os.replace(tmp_path, local_path)
    write_info({"phase": "done", "updated": int(time.time())})
    try:
        os.remove(lock_path)
    except Exception:
        pass
except Exception as e:
    write_info({"phase": "error", "error": str(e), "updated": int(time.time())})
    try:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    except Exception:
        pass
"""
    p = subprocess.Popen(
        [sys.executable, "-c", downloader_code, local_path, url],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
    )

    # Update lock with pid
    _write_json_atomic(lock_path, {
        **lock_info,
        "pid": p.pid,
        "phase": "downloading",
        "updated": int(time.time()),
    })

    works.resolve({
        "status": "file_downloading",
        "file": {
            "path": local_path,
            "name": remote_name,
            "url": url,
            "lock_path": lock_path,
            "pid": p.pid,
            "started": now,
            "phase": "downloading",
        },
        "meta": meta,
    })
    raise SystemExit(0)
