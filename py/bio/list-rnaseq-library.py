import os
import json

# Walk the WHOLE RNASeq hierarchy under BIG_DATA/RNASeq and return every dataset as one
# flat list, so the RNASeq Library can show them all at once with their metadata. The
# per-level browser (list-rnaseq.py) stays as-is for the cascading side menu; this is the
# library view of the same tree. Invoked via the lionscript exec():
#
#   let r = await exec('py/bio/list-rnaseq-library.py', em)
#   let datasets = JSON.parse(r.datasets)   # [{name, path, species, tissue, label, size}]
#   let species  = JSON.parse(r.species)    # sorted distinct species
#
# Layout is BIG_DATA/RNASeq/<Species>/<Tissue>/<file>.bw, but deeper or shallower nesting
# is tolerated: the first path segment is the species, the rest joins to form the tissue.

from ion import works

_BD = os.environ.get("BIGDATA") or os.environ.get("BIG_DATA") or os.path.expanduser("~/baja-bd")
root = os.path.normpath(os.path.join(_BD, "RNASeq"))

MAX_DATASETS = 4000          # backstop so a runaway tree can't build an unbounded payload


def pretty(name):
    """GTEX-13X6J-...-SM-5P9HE.Brain_Cerebellar_Hemisphere.RNAseq.bw -> Brain Cerebellar Hemisphere"""
    n = name
    for ext in (".bigwig", ".bw"):
        if n.lower().endswith(ext):
            n = n[: -len(ext)]
            break
    parts = n.split(".")
    # Drop a leading GTEX sample id and any trailing assay tag.
    if parts and parts[0].upper().startswith("GTEX-"):
        parts = parts[1:]
    parts = [p for p in parts if p.lower() not in ("rnaseq", "mrnacov")]
    n = " ".join(parts) if parts else n
    n = n.replace("_", " ").replace(".", " ")
    return " ".join(n.split()) or name


datasets = []
species_set = set()
err = None
truncated = False

if not os.path.isdir(root):
    err = "RNASeq root not found: " + root
else:
    try:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
            rel = os.path.relpath(dirpath, root)
            segs = [] if rel == "." else rel.split(os.sep)
            sp = segs[0] if segs else ""
            tissue = " / ".join(segs[1:]) if len(segs) > 1 else ""
            for name in sorted(filenames):
                if name.startswith(".") or not name.lower().endswith((".bw", ".bigwig")):
                    continue
                if len(datasets) >= MAX_DATASETS:
                    truncated = True
                    break
                full = os.path.join(dirpath, name)
                try:
                    size = os.path.getsize(full)
                except Exception:
                    size = 0
                if sp:
                    species_set.add(sp)
                datasets.append({
                    "name": name,
                    # /bd/<path-relative-to-BIGDATA> — view-bigwig.py resolves /bd/ to BIGDATA.
                    "path": "/bd/" + os.path.relpath(full, _BD),
                    "species": sp,
                    "tissue": tissue or pretty(name),
                    "label": pretty(name),
                    "size": size,
                })
            if truncated:
                break
    except Exception as e:
        err = str(e)

works.resolve({
    "root": root,
    "datasets": json.dumps(datasets),
    "species": json.dumps(sorted(species_set)),
    "count": str(len(datasets)),
    "truncated": "1" if truncated else "",
    "error": err,
})
