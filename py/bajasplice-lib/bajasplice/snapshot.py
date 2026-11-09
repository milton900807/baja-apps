#!/usr/bin/env python
"""Freeze the checkpoints before training touches them, and put them back.

The weights are git-tracked, so git is a rollback of sorts, but only for
committed state, and a training run overwrites in place. This is independent of
git and verifies by hash, so a restore is provably the same bytes rather than
probably.

    python -m bajasplice.snapshot save --tag pre-mfass
    python -m bajasplice.snapshot list
    python -m bajasplice.snapshot restore --tag pre-mfass
    python -m bajasplice.snapshot verify --tag pre-mfass
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path


def weights_dir() -> Path:
    import bajasplice
    return Path(bajasplice.__file__).parent / "weights"


def snap_dir() -> Path:
    return weights_dir() / "snapshots"


def sha(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def save(tag: str, force=False) -> Path:
    src, dst = weights_dir(), snap_dir() / tag
    if dst.exists() and not force:
        raise SystemExit("snapshot %r already exists; --force to overwrite" % tag)
    dst.mkdir(parents=True, exist_ok=True)
    man = {"tag": tag, "saved": time.strftime("%Y-%m-%dT%H:%M:%S"), "files": {}}
    for p in sorted(src.glob("*.pt")):
        shutil.copy2(p, dst / p.name)
        man["files"][p.name] = {"sha256": sha(p), "bytes": p.stat().st_size}
        print("  saved %-22s %s" % (p.name, man["files"][p.name]["sha256"][:16]))
    (dst / "manifest.json").write_text(json.dumps(man, indent=1))
    print("snapshot %r -> %s" % (tag, dst))
    return dst


def verify(tag: str, against_live=False) -> bool:
    d = snap_dir() / tag
    man = json.loads((d / "manifest.json").read_text())
    ok = True
    for name, rec in man["files"].items():
        target = (weights_dir() / name) if against_live else (d / name)
        if not target.exists():
            print("  MISSING %s" % name); ok = False; continue
        got = sha(target)
        same = got == rec["sha256"]
        ok &= same
        print("  %-22s %s %s" % (name, got[:16], "ok" if same else "DIFFERS from snapshot"))
    return ok


def restore(tag: str) -> None:
    d = snap_dir() / tag
    man = json.loads((d / "manifest.json").read_text())
    # verify the snapshot itself before trusting it to overwrite anything
    if not verify(tag):
        raise SystemExit("snapshot %r is corrupt; refusing to restore" % tag)
    for name in man["files"]:
        shutil.copy2(d / name, weights_dir() / name)
        print("  restored %s" % name)
    print("restored %r (saved %s)" % (tag, man["saved"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=["save", "restore", "list", "verify"])
    ap.add_argument("--tag", default=None)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    if a.action == "list":
        d = snap_dir()
        if not d.exists():
            print("no snapshots"); return
        for s in sorted(d.iterdir()):
            mf = s / "manifest.json"
            if mf.is_file():
                m = json.loads(mf.read_text())
                print("  %-24s %s  (%d files)" % (m["tag"], m["saved"], len(m["files"])))
        return
    if not a.tag:
        raise SystemExit("--tag is required for %s" % a.action)
    if a.action == "save":
        save(a.tag, a.force)
    elif a.action == "restore":
        restore(a.tag)
    else:
        print("snapshot %r, and whether the LIVE weights still match it:" % a.tag)
        same = verify(a.tag, against_live=True)
        print("live weights identical to snapshot:", same)


if __name__ == "__main__":
    main()
