#!/usr/bin/env python3
"""What a deploy replaced on this box, and which of it was yours.

    sudo python3 find-overwritten.py                     # the latest run, in detail
    sudo python3 find-overwritten.py --run 20261116204517
    sudo python3 find-overwritten.py --all
    sudo python3 find-overwritten.py --commands          # print restore commands
    sudo python3 find-overwritten.py --archive           # tar every backup first

IT WRITES NOTHING under the apps directory. --archive writes one tarball to
$HOME; --commands prints cp lines for you to read and run yourself. Restoring
is never done for you: which version you want is a judgement about your own
work, and a wrong guess overwrites the last copy of it.

HOW IT TELLS YOUR WORK FROM A DEPLOY'S. install_group backs a file up with
`cp -p`, which carries the ORIGINAL file's mtime onto the backup. So the
backup's NAME says when the file was replaced, and its MTIME says when that
content was written. Every deploy stamps all of its files with one shared
YYYYMMDDHHMMSS, so the set of stamps is a record of when deploys ran:

  mtime lands on a known deploy stamp  ->  an earlier deploy put it there. It
                                           is a repo copy, not your work.
  mtime lands nowhere near one         ->  something else wrote it: an edit
                                           made on this box, a hotfix script,
                                           or the original install.

The second case is reported as "not put there by a deploy" rather than as a
hand edit, because the first deploy to touch a file replaces whatever the
original install left and that predates every stamp. Read the date: an
afternoon you remember working is your edit; the day the box was built is not.

TWO KINDS OF BACKUP LIVE HERE. deploy-all.sh stamps with a timestamp. The
tools/hotfix scripts stamp with a NAME (.before-fundraise, .before-asowalk).
A named backup is itself evidence that someone changed this box by hand, so
they are listed separately rather than counted as deploy runs.
"""
from __future__ import annotations

import argparse
import difflib
import os
import re
import sys
import tarfile
from datetime import datetime

TS_RE = re.compile(r"^\d{14}$")
MARK = ".before-"


def parse_args():
    p = argparse.ArgumentParser(add_help=True, description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apps-dir", default=os.environ.get("APPS_DIR", "/opt/baja-apps"))
    p.add_argument("--run", help="detail this run stamp instead of the latest")
    p.add_argument("--all", action="store_true", help="detail every run")
    p.add_argument("--file", help="every backup of ONE path, oldest first")
    p.add_argument("--grep", metavar="TEXT",
                   help="which backups still contain TEXT (finds code a deploy removed)")
    p.add_argument("--commands", action="store_true", help="print restore commands")
    p.add_argument("--archive", action="store_true", help="tar every backup to $HOME")
    p.add_argument("--tolerance", type=int, default=180,
                   help="seconds a run may take to reach every file (default 180)")
    return p.parse_args()


def find_backups(apps_dir):
    out = []
    for root, _dirs, files in os.walk(apps_dir):
        for name in files:
            if MARK in name:
                out.append(os.path.join(root, name))
    out.sort()
    return out


def split_suffix(path):
    """('/opt/baja-apps/baja/x.js', '20261116204517') from the backup path."""
    base, _, suffix = path.rpartition(MARK)
    return base, suffix


def stamp_epoch(stamp):
    """Local-time epoch of a YYYYMMDDHHMMSS stamp, or None.

    deploy-all.sh writes it with `date +%Y%m%d%H%M%S`, which is the box's own
    local time, and file mtimes are read in the same zone, so a naive
    conversion is the correct one here.
    """
    try:
        return datetime.strptime(stamp, "%Y%m%d%H%M%S").timestamp()
    except ValueError:
        return None


def when(epoch, fmt="%Y-%m-%d %H:%M"):
    try:
        return datetime.fromtimestamp(epoch).strftime(fmt)
    except (OSError, OverflowError, ValueError):
        return "?"


def read_bytes(path):
    try:
        with open(path, "rb") as fh:
            return fh.read()
    except OSError:
        return None


def delta_against_live(backup, live):
    """How the live file now differs from this backup."""
    if not os.path.isfile(live):
        return "LIVE FILE IS MISSING"
    a, b = read_bytes(backup), read_bytes(live)
    if a is None or b is None:
        return "unreadable (try sudo)"
    if a == b:
        return "live file is identical to this backup"
    try:
        at = a.decode("utf-8", "replace").splitlines()
        bt = b.decode("utf-8", "replace").splitlines()
    except Exception:
        return "live differs (binary)"
    add = dele = 0
    for line in difflib.unified_diff(at, bt, n=0, lineterm=""):
        if line.startswith("+") and not line.startswith("+++"):
            add += 1
        elif line.startswith("-") and not line.startswith("---"):
            dele += 1
    return "live differs: +%d / -%d against this backup" % (add, dele)


def hr(ch="="):
    print(ch * 79)


class Inventory(object):
    def __init__(self, apps_dir, tolerance):
        self.apps_dir = apps_dir.rstrip("/")
        self.tolerance = tolerance
        self.backups = find_backups(self.apps_dir)
        self.runs = {}    # stamp -> [backup paths]
        self.named = {}   # name   -> [backup paths]
        for b in self.backups:
            _base, suffix = split_suffix(b)
            bucket = self.runs if TS_RE.match(suffix) else self.named
            bucket.setdefault(suffix, []).append(b)
        self.run_stamps = sorted(self.runs)
        self.run_epochs = {}
        for s in self.run_stamps:
            e = stamp_epoch(s)
            if e is not None:
                self.run_epochs[s] = e

    @property
    def latest(self):
        return self.run_stamps[-1] if self.run_stamps else None

    def origin_run(self, mtime):
        """The deploy run that most likely wrote this content, or None."""
        best, best_d = None, None
        for stamp, epoch in self.run_epochs.items():
            d = abs(mtime - epoch)
            if d <= self.tolerance and (best_d is None or d < best_d):
                best, best_d = stamp, d
        return best

    def rel(self, path):
        if path.startswith(self.apps_dir + "/"):
            return path[len(self.apps_dir) + 1:]
        return path

    def classify(self, stamp):
        """(unexplained, explained) rows for one run."""
        unexplained, explained = [], []
        for b in self.runs.get(stamp, []):
            live, _ = split_suffix(b)
            try:
                mtime = os.stat(b).st_mtime
            except OSError:
                mtime = 0
            row = {
                "rel": self.rel(live),
                "live": live,
                "backup": b,
                "written": when(mtime),
                "delta": delta_against_live(b, live),
                "origin": self.origin_run(mtime),
            }
            (explained if row["origin"] else unexplained).append(row)
        unexplained.sort(key=lambda r: r["rel"])
        explained.sort(key=lambda r: r["rel"])
        return unexplained, explained


def report_run(inv, stamp, show_commands):
    unexplained, explained = inv.classify(stamp)
    epoch = inv.run_epochs.get(stamp)
    print()
    hr()
    print("RUN %s  (%s)  -- %d file(s) replaced"
          % (stamp, when(epoch, "%Y-%m-%d %H:%M:%S") if epoch else "?",
             len(inv.runs.get(stamp, []))))
    hr()

    print()
    print("NOT PUT THERE BY A DEPLOY (%d) -- look here first" % len(unexplained))
    hr("-")
    if not unexplained:
        print("  None. Every file this run replaced held a copy an earlier deploy")
        print("  had installed, so this run overwrote no work done on the box.")
    else:
        print("  The date is when that content was written. A time you recognise as")
        print("  your own working session is work this run replaced.")
        print()
        for r in unexplained:
            print("  %s" % r["rel"])
            print("      written %s" % r["written"])
            print("      %s" % r["delta"])

    print()
    print("FROM AN EARLIER DEPLOY (%d) -- repo copies, not lost work" % len(explained))
    hr("-")
    if not explained:
        print("  None.")
    else:
        for r in explained:
            print("  %s  (written %s, by run %s)" % (r["rel"], r["written"], r["origin"]))

    if show_commands and unexplained:
        print()
        print("RESTORE COMMANDS for run %s -- read each, run only what you want" % stamp)
        hr("-")
        for r in unexplained:
            print("  # %s   (content written %s)" % (r["rel"], r["written"]))
            print("  sudo diff -u %s %s" % (shq(r["backup"]), shq(r["live"])))
            print("  sudo cp -p %s %s" % (shq(r["backup"]), shq(r["live"])))
            print()
        print("  WHERE A PATH HAS SEVERAL STAMPS, the OLDEST backup holds the version")
        print("  that predates every deploy, which is where your edit will be. The")
        print("  newest holds whatever the previous deploy installed.")


def shq(s):
    return "'" + s.replace("'", "'\\''") + "'"


def backup_rows(inv, backups):
    """Classified rows for an arbitrary set of backups, oldest content first."""
    rows = []
    for b in backups:
        live, suffix = split_suffix(b)
        try:
            st = os.stat(b)
            mtime, size = st.st_mtime, st.st_size
        except OSError:
            mtime, size = 0, 0
        rows.append({
            "rel": inv.rel(live), "live": live, "backup": b, "suffix": suffix,
            "mtime": mtime, "written": when(mtime), "size": size,
            "origin": inv.origin_run(mtime) if TS_RE.match(suffix) else None,
            "named": not TS_RE.match(suffix),
        })
    rows.sort(key=lambda r: r["mtime"])
    return rows


def describe_origin(row):
    if row["named"]:
        return "applied by hand (.before-%s)" % row["suffix"]
    if row["origin"]:
        return "content from deploy run %s" % row["origin"]
    return "NOT FROM A DEPLOY -- written on the box"


def report_file(inv, path, show_commands):
    """Every backup of one path, so the right version can be picked."""
    rel = path.lstrip("/")
    if rel.startswith(inv.apps_dir.lstrip("/")):
        rel = inv.rel("/" + rel)
    live = os.path.join(inv.apps_dir, rel)
    mine = [b for b in inv.backups if split_suffix(b)[0] == live]

    print()
    hr()
    print("EVERY BACKUP OF %s" % rel)
    hr()
    if not mine:
        print("  No backups of that path. Either it has never been replaced in")
        print("  place, or the path is wrong. Known paths look like:")
        for b in inv.backups[:3]:
            print("    %s" % inv.rel(split_suffix(b)[0]))
        return

    live_size = os.path.getsize(live) if os.path.isfile(live) else None
    print("  live now: %s" % ("%d bytes" % live_size if live_size is not None else "MISSING"))
    print("  %d backup(s), oldest content first:" % len(mine))
    print()
    for r in backup_rows(inv, mine):
        print("  %s   %8d bytes   %s" % (r["written"], r["size"], describe_origin(r)))
        print("      %s" % r["backup"])
    if show_commands:
        print()
        print("  To read one, and to put it back:")
        print("    sudo diff -u <backup> %s" % shq(live))
        print("    sudo cp -p <backup> %s" % shq(live))


def report_grep(inv, text, show_commands):
    """Which backups still contain TEXT. Finds code a deploy removed."""
    needle = text.encode("utf-8", "replace")
    hits = [b for b in inv.backups if (read_bytes(b) or b"").find(needle) >= 0]

    print()
    hr()
    print("BACKUPS CONTAINING %r" % text)
    hr()
    live_hits = []
    for root, _dirs, files in os.walk(inv.apps_dir):
        for name in files:
            if MARK in name:
                continue
            p = os.path.join(root, name)
            if (read_bytes(p) or b"").find(needle) >= 0:
                live_hits.append(p)

    print("  live files containing it:   %d" % len(live_hits))
    for p in sorted(live_hits)[:20]:
        print("      %s" % inv.rel(p))
    print("  backups containing it:      %d" % len(hits))
    if not hits:
        print()
        print("  Not in any backup. If it is not in a live file either, no copy of")
        print("  it survives under %s." % inv.apps_dir)
        return

    print()
    by_path = {}
    for r in backup_rows(inv, hits):
        by_path.setdefault(r["rel"], []).append(r)
    for rel in sorted(by_path):
        print("  %s" % rel)
        for r in by_path[rel]:
            print("      %s   %s" % (r["written"], describe_origin(r)))
            print("          %s" % r["backup"])
        if show_commands:
            newest = by_path[rel][-1]
            print("      # the newest copy holding it:")
            print("      sudo diff -u %s %s" % (shq(newest["backup"]), shq(newest["live"])))
    print()
    print("  A backup holding text that no live file has is a change this box")
    print("  once had and a deploy removed. Take it from here, then get it into")
    print("  the repo -- restoring it alone only lasts until the next deploy.")


def report_named(inv):
    if not inv.named:
        return
    print()
    hr()
    print("HAND-APPLIED CHANGES (named stamps, from the tools/hotfix scripts)")
    hr()
    print("Each is a change someone applied straight to this box. If one never")
    print("reached the repo, a deploy of that file will keep reverting it.")
    print()
    for name in sorted(inv.named):
        paths = inv.named[name]
        print("  .before-%s  (%d file(s))" % (name, len(paths)))
        for b in paths:
            live, _ = split_suffix(b)
            print("      %s" % inv.rel(live))


def do_archive(inv):
    home = os.path.expanduser("~")
    out = os.environ.get("ARCHIVE") or os.path.join(
        home, "baja-before-backups-%s.tgz" % datetime.now().strftime("%Y%m%d%H%M%S"))
    with tarfile.open(out, "w:gz") as tar:
        for b in inv.backups:
            try:
                tar.add(b, arcname=b.lstrip("/"))
            except OSError as exc:
                print("  could not archive %s: %s" % (b, exc), file=sys.stderr)
    size = os.path.getsize(out)
    print()
    hr()
    print("ARCHIVED")
    hr()
    print("  %s  (%.1f MB, %d files)" % (out, size / 1048576.0, len(inv.backups)))
    print("  A later deploy cannot reach these.")


def main():
    args = parse_args()
    if not os.path.isdir(args.apps_dir):
        print("No such directory: %s" % args.apps_dir, file=sys.stderr)
        print("Pass --apps-dir if the apps live elsewhere.", file=sys.stderr)
        return 1

    inv = Inventory(args.apps_dir, args.tolerance)
    if not inv.backups:
        print("No backups under %s -- nothing here has ever been replaced in place."
              % args.apps_dir)
        return 0

    hr()
    print("BACKUPS UNDER %s" % inv.apps_dir)
    hr()
    print("  %d backup file(s) in all" % len(inv.backups))
    print("  %d deploy run(s), %s to %s"
          % (len(inv.run_stamps), inv.run_stamps[0] if inv.run_stamps else "none",
             inv.latest or "none"))
    print("  %d hand-applied change(s) with a named stamp" % len(inv.named))

    if args.archive:
        do_archive(inv)

    if args.grep:
        report_grep(inv, args.grep, args.commands)
        return 0
    if args.file:
        report_file(inv, args.file, args.commands)
        return 0

    if args.all:
        for stamp in inv.run_stamps:
            report_run(inv, stamp, args.commands)
    elif args.run:
        if args.run not in inv.runs:
            print("\nNo run stamped %s. Known runs:" % args.run, file=sys.stderr)
            for s in inv.run_stamps:
                print("  %s" % s, file=sys.stderr)
            return 2
        report_run(inv, args.run, args.commands)
    elif inv.latest:
        report_run(inv, inv.latest, args.commands)
        print()
        print("(That is the most recent run. --run <stamp> for another, --all for every one.)")

    report_named(inv)

    print()
    hr()
    print("A restored file is still only on this box. Until the change reaches")
    print("the repo, the next deploy of that file reverts it again.")
    hr()
    return 0


if __name__ == "__main__":
    sys.exit(main())
