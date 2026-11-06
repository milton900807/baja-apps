"""SSAM -- score candidate 3' acceptor sites around one exon.

Backend for baja/ssam.js. Takes a gene symbol and an exon NUMBER rather than a
sequence, which is what distinguishes it from splicing-profile.py: that one
profiles a track the user already has on screen, this one answers "show me
exon 7 of this gene" with no track loaded.

    param(1)  gene symbol            e.g. MAPK8IP3
    param(2)  exon number            1-based, in TRANSCRIPT order
    param(3)  flank, nt              window beyond the exon's acceptor and
                                     donor (default 300)
    param(4)  transcript             'canonical' or a transcript id
    param(5)  min score              drop candidates below this (default 0;
                                     the annotated acceptor is always kept)

Resolves with the ssam payload, nested structures JSON-stringified in the house
style, plus `error` which is always present and is "" on success. Nothing here
raises: a failure is a message on the screen, not a dead promise.

The scores are splice-acceptor likelihood only. They carry no frame or coding
information, and the caveats travel WITH the numbers in meta.caveats so the
client cannot show a ranked table without them.
"""
import os
import sys
import json

from ion import works


# The server spawns the system python3, which has neither torch nor bajasplice.
# Re-exec under the project virtualenv (which does) if this interpreter can't
# import them. The environment -- including PYTHONPATH for `ion` -- is inherited.
def _reexec_under_venv():
    try:
        import numpy      # noqa: F401
        import torch      # noqa: F401
        import bajasplice  # noqa: F401
        return
    except Exception:
        pass
    # Guard against looping: a venv that also lacks the packages must not re-exec forever.
    if os.environ.get("BAJASPLICE_REEXEC") == "1":
        return
    for py in (os.environ.get("BAJASPLICE_PYTHON"),
               os.path.expanduser("~/.venv/bin/python"),
               os.path.expanduser("~/.venv/bin/python3"),
               # the library's own venv, for a checkout being worked on directly
               os.path.expanduser("~/baja-apps/py/bajasplice-lib/.venv/bin/python"),
               os.path.expanduser("~/dev/baja-apps/py/bajasplice-lib/.venv/bin/python"),
               "/opt/venv/bin/python3"):
        # Compare the venv PREFIX, not the binary: a venv's python is usually a symlink to
        # the system interpreter, so realpath() said "same interpreter" and skipped the
        # re-exec even though the packages live only under the venv's prefix.
        if not py or not os.path.exists(py):
            continue
        prefix = os.path.dirname(os.path.dirname(os.path.abspath(py)))
        if os.path.abspath(prefix) == os.path.abspath(sys.prefix):
            continue
        os.environ["BAJASPLICE_REEXEC"] = "1"
        os.execv(py, [py, "-u", os.path.abspath(__file__)] + sys.argv[1:])
    # No venv found -- let the import below raise a clear error.


_reexec_under_venv()

# Make the library importable even if it isn't pip-installed in this interpreter.
for _cand in ("~/baja-apps/py/bajasplice-lib", "~/dev/baja-apps/py/bajasplice-lib"):
    _LIB = os.path.expanduser(_cand)
    if os.path.isdir(_LIB) and _LIB not in sys.path:
        sys.path.insert(0, _LIB)


gene = str(works.param(1) or "").strip().upper()
try:
    exon_number = int(float(works.param(2) or 1))
except Exception:
    exon_number = 1
try:
    flank = int(float(works.param(3) or 300))
except Exception:
    flank = 300
transcript = str(works.param(4) or "canonical").strip() or "canonical"
try:
    min_score = float(works.param(5) or 0.0)
except Exception:
    min_score = 0.0

# A window wider than the model can see would report a flat tail that reads as
# "nothing here" when it means "not measurable".
flank = max(20, min(flank, 1000))

err = ""
payload = None

try:
    if not gene:
        raise ValueError("no gene given")
    works.msg("Loading splice-site model...")
    from bajasplice.ssam import scan_exon, ssam_payload

    works.progress(15)
    works.msg(f"Scoring acceptor candidates around {gene} exon {exon_number}...")
    result = scan_exon(gene, exon_number, flank=flank, transcript=transcript,
                       min_score=min_score)
    works.progress(80)
    payload = ssam_payload(result, include_track=True)
    works.progress(100)

    n_ex = len([c for c in result["candidates"] if c["in_target_exon"]])
    works.msg(f'{len(result["candidates"])} candidate AG sites '
              f'({n_ex} inside the exon body)')
except Exception as e:                       # never raise: the UI needs a message
    err = f"{type(e).__name__}: {e}"
    works.msg("SSAM failed: " + err)

if payload is None:
    works.resolve({"gene": gene, "exon_number": exon_number, "n": 0,
                   "candidates": json.dumps([]), "error": err or "no result"})
else:
    works.resolve({
        "gene": payload["gene"],
        "chrom": payload["track"]["chrom"],
        "strand": payload["track"]["strand"],
        "transcript_id": payload["track"].get("transcript_id") or "",
        "exon": json.dumps(payload["exon"]),
        "window": json.dumps(payload["window"]),
        "annotated": json.dumps(payload["annotated"]),
        "candidates": json.dumps(payload["candidates"]),
        "track": json.dumps(payload["track"]),
        "layers": json.dumps(payload["layers"]),
        "meta": json.dumps(payload["meta"]),
        "n": len(payload["candidates"]),
        "error": err,
    })
