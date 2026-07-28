#!/usr/bin/env python3
"""
Create a domain folder and a username.json file from an email address.

Example:
  python make_user_file.py jeff@schweitzerbeer.com --base-dir ./output
Creates:
  ./output/schweitzerbeer.com/jeff.json
"""
from typing import Tuple
import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def utc_iso_z_now() -> str:
    # Format like: 2025-12-05T17:42:39.359Z
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")



def parse_email(email: str) -> Tuple[str, str]:
    email = email.strip()
    if not EMAIL_RE.match(email):
        raise ValueError(f"Invalid email address: {email!r}")
    username, domain = email.split("@", 1)
    return username, domain


def build_payload(email: str, username: str, domain: str) -> dict:
    now = utc_iso_z_now()
    return {
        "email": email,
        "username": username,
        "domain": domain,
        "subscriptionId": "AdminInstallation",
        "createdAt": now,
        "licenses": [
            {
                "app": "bajabio-Project",
                "positions": ["all"],
            },
            {
                "app": "bajabio-Designer",
                "positions": ["all"],
            }
        ],
        "updatedAt": now,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate domain folder and user JSON file from an email.")
    parser.add_argument("email", help="Email address, e.g. jeff@schweitzerbeer.com")
    parser.add_argument(
        "--base-dir",
        default=".",
        help="Base directory in which to create the domain folder (default: current directory).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite the JSON file if it already exists.",
    )
    args = parser.parse_args()

    username, domain = parse_email(args.email)
    payload = build_payload(args.email, username, domain)

    base_dir = Path(args.base_dir).expanduser().resolve()
    domain_dir = base_dir / domain
    domain_dir.mkdir(parents=True, exist_ok=True)

    out_path = domain_dir / f"{username}.json"
    if out_path.exists() and not args.overwrite:
        raise FileExistsError(f"{out_path} already exists. Use --overwrite to replace it.")

    # Write pretty JSON with stable ordering and newline at EOF
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")

    os.replace(tmp_path, out_path)
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

