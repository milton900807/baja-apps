#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Re-cut the MODULES dict inside tools/hotfix/install-fundraise-app.py from the repository.

install-fundraise-app.py carries every lionscript module it installs as a string literal,
because the installer is downloaded on its own and run on a server with no checkout. That
makes it easy for a module to be edited here and the installer left behind, which ships an
old file over a new one. This rewrites the literal from the working tree.

    python3 tools/hotfix/gen/refresh-app-modules.py              # from the repo root
    ADD=baja/research.js python3 tools/hotfix/gen/refresh-app-modules.py

ADD is a comma-separated list of modules to add to the dict, in the order given, after the
ones already there. A module already in the dict is not added twice. Every module must
exist and must be a lionscript module (it begins with `function`), or nothing is written.

The dict is held on one line, exactly as the installer has always had it, so the diff is
one line however many modules changed.
"""
from __future__ import annotations

import ast
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
INSTALLER = os.environ.get("INSTALLER") or os.path.join(ROOT, "tools", "hotfix", "install-fundraise-app.py")


def die(msg: str) -> None:
    sys.stderr.write(msg.rstrip() + "\n")
    raise SystemExit(1)


def main() -> None:
    if not os.path.isfile(INSTALLER):
        die("Not found: %s" % INSTALLER)
    text = io.open(INSTALLER, encoding="utf-8").read()
    lines = text.split("\n")

    hits = [i for i, ln in enumerate(lines) if ln.startswith("MODULES = {")]
    if len(hits) != 1:
        die("Expected exactly one line starting 'MODULES = {' in %s, found %d." % (INSTALLER, len(hits)))
    i = hits[0]
    try:
        current = ast.literal_eval(lines[i].split("=", 1)[1].strip())
    except Exception as e:
        die("Could not read the MODULES dict: %s" % e)
    if not isinstance(current, dict):
        die("MODULES is not a dict.")

    wanted = list(current.keys())
    for extra in (os.environ.get("ADD") or "").split(","):
        extra = extra.strip()
        if extra and extra not in wanted:
            wanted.append(extra)

    fresh = {}
    changed, added = [], []
    for key in wanted:
        path = os.path.join(ROOT, key)
        if not os.path.isfile(path):
            die("Not found: %s  (MODULES names it, so it must be in the tree)" % key)
        body = io.open(path, encoding="utf-8").read()
        if not body.lstrip().startswith("function"):
            die("%s does not look like a lionscript module (it does not begin with 'function')." % key)
        fresh[key] = body
        if key not in current:
            added.append(key)
        elif current[key] != body:
            changed.append(key)

    if not changed and not added:
        print("Already current: %d modules, nothing to write." % len(fresh))
        return

    lines[i] = "MODULES = " + repr(fresh)
    out = "\n".join(lines)
    # The installer must still parse; a bad repr here would be found on the server.
    try:
        compile(out, INSTALLER, "exec")
    except SyntaxError as e:
        die("The rewritten installer does not parse: %s" % e)

    io.open(INSTALLER, "w", encoding="utf-8").write(out)
    for k in added:
        print("  added    %s" % k)
    for k in changed:
        print("  refreshed %s" % k)
    print("%d modules in %s" % (len(fresh), os.path.relpath(INSTALLER, ROOT)))


if __name__ == "__main__":
    main()
