#!/usr/bin/env python3
"""
Create domain folders and username.json files from a text file containing email addresses.

- Extracts all valid emails from arbitrary text
- Overwrites existing files
- Creates: <base-dir>/<domain>/<username>.json

Example:
  python make_users_from_file.py emails.txt --base-dir ./output
"""

from typing import Iterable, Tuple
import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


EMAIL_EXTRACT_RE = re.compile(
    r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
)


def utc_iso_z_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def extract_emails(text: str) -> Iterable[str]:
    return sorted(set(EMAIL_EXTRACT_RE.findall(text)))


def parse_email(email: str) -> Tuple[str, str]:
    username, domain = email.split("@", 1)
    return username, domain.lower()


def build_payload(email: str, username: str, domain: str) -> dict:
    now = utc_iso_z_now()
    return {
        "email": email,
        "username": username,
        "domain": domain,
        "subscriptionId": "AdminInstallation",
        "createdAt": now,
        "licenses": [
            {"app": "bajabio-Project", "positions": ["all"]},
            {"app": "bajabio-Designer", "positions": ["all"]},
        ],
        "updatedAt": now,
    }


def write_json_atomic(path: Path, payload: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate user JSON files from a text file of emails.")
    parser.add_argument("input_file", help="Text file containing email addresses")
    parser.add_argument(
        "--base-dir",
        default=".",
        help="Base directory for output (default: current directory)",
    )
    args = parser.parse_args()

    input_path = Path(args.input_file).expanduser().resolve()
    base_dir = Path(args.base_dir).expanduser().resolve()

    text = input_path.read_text(encoding="utf-8", errors="ignore")
    emails = extract_emails(text)

    if not emails:
        raise RuntimeError("No valid email addresses found.")

    count = 0
    for email in emails:
        username, domain = parse_email(email)
        payload = build_payload(email, username, domain)

        domain_dir = base_dir / domain
        domain_dir.mkdir(parents=True, exist_ok=True)

        out_path = domain_dir / f"{username}.json"
        write_json_atomic(out_path, payload)
        count += 1

    print(f"Created/overwritten {count} user files in {base_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

