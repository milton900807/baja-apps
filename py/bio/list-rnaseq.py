import os
import json

# List one level of the RNASeq data hierarchy under BIG_DATA/RNASeq. Invoked via the
# lionscript exec():
#   let r = await exec('py/bio/list-rnaseq.py', em, subpath)
#   let folders = JSON.parse(r.folders)   # [{name, sub}]
#   let files   = JSON.parse(r.files)     # [{name, path}]  (path is a /bd/... path)
#
# param(1): subpath relative to the RNASeq root (e.g. "Human/Brain"); "" for the top.
# This bypasses the user-confined /get-nodes browser so shared reference data at the
# BIG_DATA root is reachable.

from ion import works

_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA") or os.path.expanduser("~/baja-bd")
subpath = str(works.param(1) or "").strip().lstrip("/")

root = os.path.normpath(os.path.join(_BD, "RNASeq"))
target = os.path.normpath(os.path.join(root, subpath))

folders = []
files = []
err = None

# Keep the request inside the RNASeq root.
if not (target == root or target.startswith(root + os.sep)):
    err = "invalid path"
elif not os.path.isdir(target):
    err = "not found"
else:
    try:
        for name in sorted(os.listdir(target)):
            if name.startswith("."):
                continue
            full = os.path.join(target, name)
            if os.path.isdir(full):
                folders.append({"name": name, "sub": os.path.relpath(full, root)})
            elif name.lower().endswith(".bw") or name.lower().endswith(".bigwig"):
                # /bd/<path-relative-to-BIGDATA> — view-bigwig.py resolves /bd/ to BIGDATA.
                files.append({"name": name, "path": "/bd/" + os.path.relpath(full, _BD)})
    except Exception as e:
        err = str(e)

works.resolve({
    "root": root,
    "sub": subpath,
    "folders": json.dumps(folders),
    "files": json.dumps(files),
    "error": err,
})
