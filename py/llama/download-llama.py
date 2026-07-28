#!/usr/bin/env python3
"""
download-llama.py

Download a Hugging Face model repo to a local directory using paths
relative to this script.

Default structure:
./download-llama.py
./models/Meta-Llama-3-8B-Instruct/

Usage:
------
./download-llama.py
./download-llama.py --repo-id meta-llama/Meta-Llama-3-8B-Instruct
./download-llama.py --local-dir ./models/MyModel

Env:
----
HF_TOKEN=hf_xxx  (required for gated models like LLaMA)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from huggingface_hub import snapshot_download
from huggingface_hub.utils import HfHubHTTPError


# =========================
# ---- PATH CONFIG
# =========================

SCRIPT_DIR = Path(__file__).resolve().parent

DEFAULT_REPO_ID = "meta-llama/Meta-Llama-3-8B-Instruct"
DEFAULT_LOCAL_DIR = SCRIPT_DIR / "models" / "Meta-Llama-3-8B-Instruct"


# =========================
# ---- UTIL
# =========================

def eprint(*args, **kwargs) -> None:
    print(*args, file=sys.stderr, **kwargs)


def resolve_path(p: str | None) -> Path | None:
    if not p:
        return None
    path = Path(p)
    if not path.is_absolute():
        path = (SCRIPT_DIR / path).resolve()
    return path.resolve()


# =========================
# ---- CLI
# =========================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download a Hugging Face model repo to a local folder."
    )

    parser.add_argument(
        "--repo-id",
        default=DEFAULT_REPO_ID,
        help=f"Repo ID (default: {DEFAULT_REPO_ID})",
    )

    parser.add_argument(
        "--local-dir",
        default=str(DEFAULT_LOCAL_DIR),
        help=f"Destination directory (default: {DEFAULT_LOCAL_DIR})",
    )

    parser.add_argument(
        "--revision",
        default="main",
        help="Repo revision (default: main)",
    )

    parser.add_argument(
        "--token",
        default=None,
        help="HF token (or set HF_TOKEN env var)",
    )

    parser.add_argument(
        "--cache-dir",
        default=None,
        help="Optional cache dir (relative or absolute)",
    )

    parser.add_argument(
        "--allow",
        nargs="*",
        default=None,
        help="Allow only certain files (advanced)",
    )

    parser.add_argument(
        "--ignore",
        nargs="*",
        default=None,
        help="Ignore certain files",
    )

    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume partial downloads",
    )

    return parser.parse_args()


# =========================
# ---- MAIN
# =========================

def main() -> int:
    args = parse_args()

    token = args.token or os.getenv("HF_TOKEN")

    local_dir = resolve_path(args.local_dir)
    cache_dir = resolve_path(args.cache_dir)

    if not local_dir:
        eprint("[ERROR] local_dir could not be resolved.")
        return 1

    local_dir.mkdir(parents=True, exist_ok=True)

    print(f"[INFO] Script dir:  {SCRIPT_DIR}")
    print(f"[INFO] Repo:        {args.repo_id}")
    print(f"[INFO] Revision:    {args.revision}")
    print(f"[INFO] Local dir:   {local_dir}")

    if cache_dir:
        print(f"[INFO] Cache dir:   {cache_dir}")

    if args.allow:
        print(f"[INFO] Allow:       {args.allow}")

    if args.ignore:
        print(f"[INFO] Ignore:      {args.ignore}")

    if token:
        print("[INFO] Using HF token.")
    else:
        print("[WARN] No HF_TOKEN set. Gated models will fail.")

    try:
        downloaded_path = snapshot_download(
            repo_id=args.repo_id,
            revision=args.revision,
            token=token,
            local_dir=str(local_dir),
            cache_dir=str(cache_dir) if cache_dir else None,
            allow_patterns=args.allow,
            ignore_patterns=args.ignore,
            local_dir_use_symlinks=False,
            resume_download=args.resume,
        )

        print(f"[DONE] Model downloaded to: {downloaded_path}")
        return 0

    except HfHubHTTPError as e:
        status = getattr(e.response, "status_code", None)

        if status == 401:
            eprint("\n[ERROR] Unauthorized (401)")
            eprint("You need to:")
            eprint("  1) Accept the model license on Hugging Face")
            eprint("  2) Set HF_TOKEN with correct account")
        elif status == 403:
            eprint("\n[ERROR] Forbidden (403)")
            eprint("You do not have access to this model.")
        elif status == 404:
            eprint("\n[ERROR] Repo not found (404)")
        else:
            eprint(f"\n[ERROR] HTTP error: {e}")

        return 1

    except Exception as e:
        eprint(f"\n[ERROR] Unexpected failure: {e}")
        return 1


# =========================
# ---- ENTRY
# =========================

if __name__ == "__main__":
    raise SystemExit(main())