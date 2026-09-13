"""Install the tutorials that ship with the application.

A tutorial is usually MADE by recording one: press Record, do the work, press Stop, save.
That is the point of the machinery and it is how most of them should arrive. But a few
explain a workflow that nobody can record convincingly -- one whose interesting states
depend on the file the recorder happened to have loaded -- and those are written as
scripts and shipped beside the code, so a fresh host has them and a change to the wording
goes through review like anything else.

Each is a JSON file in py/tutorials/seed/:

    { name, description, screen, route, visibility, script: [ <demo.js commands> ] }

IDEMPOTENT BY NAME. A tutorial already in the database under the same name is left exactly
as it is -- including one somebody has since edited -- because overwriting a colleague's
version to reinstall your own is the behaviour that makes people stop trusting a seeder.
Pass --force to replace, which deletes and reinstalls the shipped copy.

    python3 py/tutorials/seed-tutorials.py [--owner you@example.com] [--force] [--list]

Run it wherever BIGDATA points at the server's data directory; py/ion-lib must be on the
PYTHONPATH (it already is for the /py bridge, and this adds it when run from a shell).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "ion-lib"))

import tutorial_store  # noqa: E402


def seeds():
    d = os.path.join(HERE, "seed")
    if not os.path.isdir(d):
        return []
    out = []
    for name in sorted(os.listdir(d)):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(d, name)) as fh:
                out.append((name, json.load(fh)))
        except Exception as e:
            print("  ! %s could not be read: %s" % (name, e))
    return out


def main():
    args = sys.argv[1:]
    force = "--force" in args
    listing = "--list" in args
    owner = ""
    if "--owner" in args:
        i = args.index("--owner")
        if i + 1 < len(args):
            owner = args[i + 1]
    owner = owner or os.environ.get("SENDER_USER_ID") or "baja"

    existing = {t["name"]: t for t in tutorial_store.find(email=owner, limit=200)}
    print("database: %s (%d tutorial(s) already there)" % (tutorial_store._db_path(), len(existing)))
    if listing:
        for t in existing.values():
            print("  %-46s %-12s %3d steps  %s" % (t["name"][:46], t["screen"], t["n_steps"], ", ".join(t["keywords"][:6])))
        return 0

    for fname, spec in seeds():
        name = str(spec.get("name") or "").strip()
        if not name:
            print("  ! %s has no name" % fname)
            continue
        if name in existing and not force:
            print("  = %s (already installed, left alone)" % name)
            continue
        if name in existing and force:
            tutorial_store.remove(existing[name]["id"], existing[name]["owner"])
            print("  - %s (removed to reinstall)" % name)
        r = tutorial_store.save(
            name=name,
            script=json.dumps(spec.get("script") or []),
            email=owner,
            description=spec.get("description") or "",
            screen=spec.get("screen") or "",
            route=spec.get("route") or "",
            visibility=spec.get("visibility") or "everyone")
        if r.get("error"):
            print("  ! %s: %s" % (name, r["error"]))
        else:
            print("  + %s  (%d steps, keywords: %s)" % (name, r["n_steps"], ", ".join(r["keywords"][:8])))
            print("    topics: %s" % (", ".join(r["topics"]) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
